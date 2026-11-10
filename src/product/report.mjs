import path from 'node:path';
import {localTree} from '../verification/backends.mjs';
import { verifiedEvidence } from '../alpha/evidence.mjs';
import { attempts, approval } from '../workflow/persistence.mjs';
import { judge } from '../alpha/judge.mjs';
import { messages } from '../workflow/collaboration.mjs';
import { task, bootstrapView, bootstrapDrift, clarifiableFor } from './tasks.mjs';
import { reservationStatus } from './reservations.mjs';
import { localAcceptance } from './local-acceptance.mjs';
import { readDeliveredObjectiveStatus } from './objective-status.mjs';

function bootstrapNext(current, plan) {
  if (current.state === 'REJECTED') return 'Create a new plan';
  const open = clarifiableFor(current, plan).filter(u => u.status === 'OPEN').map(u => u.id);
  if (!current.bootstrap && open.length) return `An operator must confirm the objective's meaning with objective clarify (${open.join(', ')}); a planner cannot clear it. Other unknowns need a BootstrapDraft`;
  if(plan.contractKind==='EXISTING_LOCAL')return current.state==='VALIDATED'?'Prepare the existing Local DAG':'Submit an ExistingLocalDraft against the observed working-tree baseline; tests remain read-only';
  return current.state === 'VALIDATED' ? 'Prepare the bootstrap workflow' : 'Submit a BootstrapDraft; planned files are not existing code';
}
// Derived from the effective item states, most urgent first. Every entry names the
// items it is about, so an empty kind never asks for work that does not exist.
const UNSATISFIED_LOCAL = ['PENDING_VERIFICATION', 'VERIFICATION_STALE', 'INCONCLUSIVE'];
export function bootstrapActions(view) {
  const ready = view.items.filter(i => !i.waitingOn.length), ids = list => list.map(i => i.id);
  const fileset = (s, items = ready) => items.filter(i => i.fileset && !i.fileset.state.startsWith('SUPERSEDED') && s.includes(i.fileset.state) && i.state !== 'MATERIALIZED');
  const actions = [];
  const add = (kind, items, text) => { if (items.length) actions.push({ kind, items: ids(items), text }); };
  // An uncertain or already-started effect must be reconciled BEFORE offering
  // another Fileset approval. Inspect all items, including ones whose DAG
  // dependencies have since become blocked; they may already have written bytes.
  add('RECONCILE', fileset(['MATERIALIZING', 'WAITING_HUMAN'], view.items), 'Inspect persisted files, results and Lease with objective recover; public materialize never replays a started fileset');
  add('AWAIT_FILESET_APPROVAL', fileset(['WAITING_APPROVAL']), 'An operator reviews and approves the filesetHash with objective approve');
  add('MATERIALIZE', fileset(['READY']), 'objective materialize <task-id> <item-id>; requires a fresh approved fileset with no started effects');
  add('REPAIR_REQUIRED', ready.filter(i => i.kind === 'local-verification' && i.state === 'LOCAL_FAILED'), 'Local tests failed: propose a repair fileset (files with baseSha256 and repair evidenceRef) for a materialized local-edit item this verification depends on');
  add('PROPOSE_FILESET', ready.filter(i => i.kind === 'local-edit' && i.state === 'PENDING_FILESET'), 'Propose a fileset for these local-edit items');
  add('RUN_LOCAL_VERIFICATION', ready.filter(i => i.kind === 'local-verification' && UNSATISFIED_LOCAL.includes(i.state)), 'objective verify <task-id> <item-id> REQUEST.json to inspect, then rerun with --trust <commandHash> --acknowledge-unisolated');
  add('EVIDENCE_DEFECT', view.items.filter(i => i.state === 'EVIDENCE_INVALID'), 'Recorded verification evidence is missing or altered; it cannot be waived. Run local verification again');
  add('PROTECTED_VERIFICATION_UNSATISFIED', ready.filter(i => i.kind === 'protected-verification'), 'Protected verification is not available for NEW_PROJECT; it stays unsatisfied (commit as a user action, then use an existing-repository contract)');
  add('BLOCKED_CAPABILITY', ready.filter(i => i.capability === 'BLOCKED' && i.kind !== 'protected-verification'), 'Blocked on a missing capability or approval');
  const done = view.items.every(i => ['PLAN_RECORDED', 'MATERIALIZED', 'LOCAL_PASSED'].includes(i.state));
  if (done) actions.push({ kind: 'NO_FURTHER_ACTION', items: [], text: 'Every WorkItem is satisfied locally; complete stays false because local verification is not protected VERIFIED. git commit stays a user action' });
  else if (!actions.length) actions.push({ kind: 'WAITING_ON_DEPENDENCIES', items: ids(view.items.filter(i => i.waitingOn.length)), text: 'Remaining items wait on unsatisfied dependencies' });
  else if (actions.every(a => ['PROTECTED_VERIFICATION_UNSATISFIED', 'BLOCKED_CAPABILITY'].includes(a.kind))) actions.unshift({ kind: 'LOCAL_WORK_COMPLETE', items: [], text: 'All locally executable items are satisfied; what remains needs a capability CodeFleet does not have here' });
  return actions;
}
function localVerification(store, view) {
  return Object.fromEntries(view.items.filter(i => i.kind === 'local-verification').map(i => {
    const result = { state: i.state, evidenceRef: i.verificationRef };
    if (i.state === 'LOCAL_CHECKPOINT') result.historicalOnly = true;
    if (i.verificationRef && !['EVIDENCE_INVALID', 'VERIFICATION_STALE', 'LOCAL_CHECKPOINT'].includes(i.state)) {
      // A read-only diagnostic, not an accepted verdict or a workflow transition.
      try {
        const evidence = store.readArtifact(i.verificationRef);
        result.judgment = { ...judge(evidence), authority: evidence.authority,
          scope: 'PROTECTED_ACCEPTANCE', stateTransition: false };
      } catch { result.judgment = { outcome: 'ESCALATE', reason: 'Evidence unavailable', stateTransition: false }; }
    }
    return [i.id, result];
  }));
}
// One advisory next step for the existing Host/Operator loop. This neither
// reserves work nor grants permission to replay a command or a trust hash.
export function bootstrapContinuation(current, view, actions) {
  const base = { mode: 'SINGLE_AGENT', authority: 'ADVISORY_ONLY', taskRevision: current.revision,
    workflowHash: current.bootstrap?.workflowHash ?? null, executionGranted: false,
    automaticReplay: false };
  if (!view) return { ...base, status: 'HUMAN_HANDOFF', reason: 'VALIDATED_WORKFLOW_REQUIRED', next: null };
  if (view.drift.length) return { ...base, status: 'HUMAN_HANDOFF', reason: 'FILES_CHANGED_OUTSIDE_CODEFLEET', next: null };
  // A partially applied Fileset needs inspection before unrelated Evidence review.
  // Neither read-only handoff authorizes replay or grants execution.
  const action = actions.find(a => a.kind === 'RECONCILE') ??
    actions.find(a => a.kind === 'EVIDENCE_DEFECT') ?? actions[0];
  const itemId = action.items[0] ?? null;
  const next = { kind: action.kind, itemId };
  if (action.kind === 'REPAIR_REQUIRED') {
    // A failed verification can have more than one editable predecessor.
    // Project that choice from the current DAG; never guess which bytes to
    // repair or treat the failing Evidence as an execution grant.
    const failed = view.items.find(i => i.id === itemId &&
      i.kind === 'local-verification' && i.state === 'LOCAL_FAILED');
    const byId = new Map(view.items.map(i => [i.id, i]));
    const ancestors = new Set(), pending = [...(failed?.dependencies ?? [])];
    while (pending.length) {
      const id = pending.pop();
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      pending.push(...(byId.get(id)?.dependencies ?? []));
    }
    const repairCandidates = view.items.filter(i => ancestors.has(i.id) &&
      i.kind === 'local-edit' && i.state === 'MATERIALIZED').map(i => i.id);
    return { ...base, status: 'AWAIT_REPAIR_SELECTION',
      next: { ...next, repairCandidates, failedEvidenceRef: failed?.verificationRef ?? null },
      reason: 'Select an already-materialized predecessor for failed-Evidence Repair; a separate exact Host grant and Fileset approval are required' };
  }
  if (action.kind === 'PROPOSE_FILESET') return { ...base, status: 'HOST_PROPOSAL_REQUIRED', next,
    reason: 'Submit a candidate bound to the current Task revision; proposal grants no execution' };
  if (action.kind === 'AWAIT_FILESET_APPROVAL') return { ...base, status: 'AWAIT_OPERATOR', next,
    reason: 'Exact current fileset approval required' };
  if (action.kind === 'MATERIALIZE') {
    const item = view.items.find(i => i.id === itemId);
    if (item.fileset.state === 'READY') return { ...base, status: 'AWAIT_OPERATOR', next,
      reason: 'Recheck approval expiry, current contract, paths and lease in objective materialize' };
  }
  if (action.kind === 'RUN_LOCAL_VERIFICATION' &&
      view.items.find(i => i.id === itemId).state !== 'INCONCLUSIVE') return { ...base, status: 'AWAIT_LOCAL_TRUST', next,
    reason: 'Inspect current command and tree; obtain separate one-use trust and acknowledge unisolated execution' };
  return { ...base, status: 'HUMAN_HANDOFF', next,
    reason: ['NO_FURTHER_ACTION', 'LOCAL_WORK_COMPLETE'].includes(action.kind)
      ? 'Local work is satisfied; protected verification remains unsatisfied and the Objective is incomplete'
      : 'Resolve the failure, uncertain execution, dependency or capability before continuing; do not replay automatically' };
}

export async function runReport(store, id) {
  const run = store.get(id);
  const finalAttempt = run.kind === 'workflow' ? attempts(store, id).find(a => a.itemId === 'final') : null;
  const observed = finalAttempt ? store.get(finalAttempt.childId) : run;
  let verification = { status: 'NOT_RUN', reason: 'No accepted evidence' };
  if (run.acceptedHash || run.state === 'COMPLETED') {
    try {
      const result = await verifiedEvidence(store, run);
      verification = { status: 'VERIFIED', tests: result.evidence.tests, passed: result.evidence.passed, candidateHash: run.candidateHash, contractHash: result.contractHash, treeRechecked: result.treeRechecked,
        verificationBackend: result.evidence.verificationBackend ?? 'LEGACY_UNRECORDED',
        executionAuthority: result.evidence.executionAuthority ?? result.evidence.authority,
        isolationCapabilities: result.evidence.isolationCapabilities ?? null,
        verifierIndependence: result.evidence.verifierIndependence ?? 'LEGACY_CONTRACT',
        evidenceIntegrity: result.evidence.evidenceIntegrity ?? 'LEGACY_RECHECKED',
        candidateTreeHash: result.evidence.candidateTreeHash ?? result.evidence.candidateHash,
        requiredGateResults: result.evidence.requiredGateResults ?? null };
    } catch (e) { verification = { status: 'INVALID', reason: e.message }; }
  } else if (observed.lastEvidenceHash) {
    try { const e = store.readArtifact(observed.lastEvidenceHash); verification = { status: judge(e).outcome === 'RETRY' && e.tests > 0 ? 'FAILED' : 'INCONCLUSIVE', reason: judge(e).reason }; }
    catch (e) { verification = { status: 'INVALID', reason: e.message }; }
  }
  let authorization = 'V1_EXPLICIT_CONTRACT', workItems = [], activeAttempts = [];
  if (run.kind === 'workflow') {
    try { approval(store, run); authorization = 'AUTHORIZED'; } catch (e) { authorization = e.message; }
    const records = attempts(store, id);
    activeAttempts = records.filter(a => a.status === 'STARTED').map(a => ({ ...a, state: store.get(a.childId).state }));
    workItems = run.contract.items.map(n => {
      // Repair generations are immutable; the latest generation, not the first
      // legacy attempt, determines the current WorkItem progress and reason.
      const a = records.filter(a => a.itemId === n.id)
        .sort((left,right) => (left.generation ?? 1) - (right.generation ?? 1)).at(-1);
      const child = a ? store.get(a.childId) : null;
      return { id: n.id, dependencies: n.dependencies, roles: n.roles ?? null, state: child && a.status === 'STARTED' ? child.state : run.states[n.id], attempt: a ?? null, reason: child?.reason ?? run.workItemBlocks?.[n.id]?.join('; ') ?? null };
    });
  }
  const artifactPaths = Object.fromEntries(['acceptedHash', 'evidenceHash', 'integrationHash', 'graphRef', 'sourceRef'].filter(k => /^[a-f0-9]{64}$/.test(run[k] ?? '')).map(k => [k, path.join(store.directory, 'artifacts', run[k] + '.json')]));
  const usage = run.kind === 'workflow' ? attempts(store, id).map(a => store.get(a.childId)) : [run];
  // An incomplete/invalid provider cost record is not a zero-dollar Turn.
  // Preserve the unknown count separately from the reported subtotal; never
  // serialize NaN as an apparently valid budget observation.
  const costFullyReported = usage.every(r =>
    Number.isFinite(r.reportedCostUsd) && r.reportedCostUsd >= 0);
  const reportedUsd = costFullyReported
    ? usage.reduce((n, r) => n + r.reportedCostUsd, 0) : null;
  const unknownAttempts = usage.reduce((n, r) => {
    const countKnown = Number.isSafeInteger(r.unknownCostAttempts) &&
      r.unknownCostAttempts >= 0;
    const amountKnown = Number.isFinite(r.reportedCostUsd) &&
      r.reportedCostUsd >= 0;
    return n + Math.max(countKnown ? r.unknownCostAttempts : 0,
      countKnown && amountKnown ? 0 : 1);
  }, 0);
  const complete = run.state === 'COMPLETED' && verification.status === 'VERIFIED';
  // The legacy 'complete' flag describes a verified Candidate/Workflow, not
  // a delivered Objective. Public report/status must expose the same current
  // delivered-tree criterion judgment as the read-only Objective projection.
  const objective = run.kind === 'workflow'
    ? await readDeliveredObjectiveStatus(store, id) : null;
  return { schemaVersion: 1, kind: 'RunReport', runId: id, objective, objectiveComplete: objective?.objectiveComplete === true, state: run.state === 'COMPLETED' && !complete ? 'VERIFICATION_INVALID' : run.state, recordedState: run.state, complete, verification, authorization, provider: run.providerId ?? (run.kind === 'workflow' ? 'NOT_SELECTED' : 'claude-v1'), workItems, activeAttempts,
    attempts: run.attempts, cost: { reportedUsd, unknownAttempts, authority: 'PROVIDER_REPORTED_ONLY' },
    reason: run.reason ?? null, artifactPaths, messages: run.kind === 'workflow' && run.contract.schemaVersion === 2 ? messages(store, run.id) : [], retry: activeAttempts.length ? 'RECONCILE_ONLY_NO_AUTOMATIC_REPLAY' : run.kind === 'workflow' && workItems.some(n => n.attempt) && !complete ? 'NEW_REVIEWED_TASK_REQUIRED' : 'WITHIN_PINNED_CONTRACT_ONLY',
    readiness: complete ? 'VERIFIED' : 'BLOCKED_OR_UNSUPPORTED', liveProviderVerification: 'NOT_ESTABLISHED_BY_THIS_REPORT', events: store.events(id) };
}
export async function taskReport(store, id) {
  const current = task(store, id), plan = store.readArtifact(current.planRef);
  const run = current.runId ? await runReport(store, current.runId) : null;
  if (['NEW_PROJECT','EXISTING_LOCAL'].includes(plan.contractKind)) {
    const view = current.bootstrap && current.state !== 'REJECTED' ? bootstrapView(store, id, { drift: await bootstrapDrift(store, id) }) : null;
    const actions = view ? bootstrapActions(view) : null, local = view ? localVerification(store, view) : {};
    const decisions = store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_decisions'").get()
      ? store.db.prepare('SELECT id,requestId FROM bootstrap_decisions WHERE taskId=?').all(id) : [];
    const reservations = decisions.map(d => {
      try { return reservationStatus(store, d.id, d.requestId); }
      catch (e) { return { status: 'EVIDENCE_DEFECT', reason: e.message, complete: false }; }
    });
    const continuation = bootstrapContinuation(current, view, actions);
    if (decisions.length) {
      continuation.status = 'HUMAN_HANDOFF';
      continuation.next = null;
      continuation.reason = 'Durable one-shot execution: inspect reservation status; no command-hash replay, automatic retry or budget reset';
      if (actions) actions.splice(0, actions.length, { kind: 'HUMAN_HANDOFF', items: [], text: continuation.reason });
    }
    const acceptance = localAcceptance(current, plan, view, ref => store.readArtifact(ref));
    if(acceptance.complete){
      try{if(await localTree(current.repo)!==acceptance.candidateTreeHash){acceptance.complete=false;acceptance.reason='CURRENT_CANDIDATE_CHANGED';}}
      catch{acceptance.complete=false;acceptance.reason='CURRENT_CANDIDATE_UNREADABLE';}
    }
    if (reservations.some(r => r.status === 'EVIDENCE_DEFECT')) {
      acceptance.complete = false; acceptance.reason = 'EVIDENCE_DEFECT';
    }
    if (acceptance.complete) {
      continuation.status = 'COMPLETE_LOCAL'; continuation.next = null; continuation.reason = acceptance.reason;
      actions.splice(0, actions.length, { kind: 'COMPLETE_LOCAL', items: [], text: 'All criteria passed on the current candidate at explicitly selected Local-only trust; no Protected claim or further execution' });
    }
    return { schemaVersion: 1, kind: 'TaskReport', taskId: id, revision: current.revision, contractRevision: current.contractRevision ?? 1, contractHistory: current.bootstrap?.contractHistory ?? [], contractKind: plan.contractKind, state: current.state, reviewState: current.state, plannerAttempt: current.plannerAttempt ?? null, plan, settings: current.settings, run: null,
      bootstrap: view, nextAction: actions ? actions.map(a => `${a.kind}${a.items.length ? ' (' + a.items.join(', ') + ')' : ''}: ${a.text}`).join('; ') : bootstrapNext(current, plan), nextActions: actions,
      workflowHash: current.bootstrap?.workflowHash ?? null, continuation, executionReservations: reservations,
      verification: Object.values(local).some(v => v.evidenceRef) ? 'LOCAL_ONLY_UNPROTECTED' : 'NOT_RUN', localVerification: local, protectedVerification: 'UNSATISFIED', acceptance, complete: acceptance.complete };
  }
  return { schemaVersion: 1, kind: 'TaskReport', taskId: id, revision: current.revision, state: current.state === 'REJECTED' ? 'REJECTED' : run?.state ?? current.state, reviewState: current.state, plannerAttempt: current.plannerAttempt ?? null, plan, settings: current.settings, run,
    nextAction: current.state === 'REJECTED' ? 'Create a new plan' : !current.runId ? 'Review scope, then run to prepare a workflow' : 'Approve the exact workflow hash, then run with explicit model consent',
    workflowHash: current.runId ? store.get(current.runId).contractHash : null };
}

// A persisted existing-repository Workflow has its own recovery and approval
// boundaries. Project one advisory handoff from the current Store snapshot;
// this never reserves a WorkItem, replays an uncertain Turn or grants a Host.
function existingWorkflowContinuation(run, report, workItems, readyIds) {
  const step = (status, reason, itemIds = []) => ({
    status, reason, itemIds, authority: 'READ_ONLY_ADVISORY',
    executionGranted: false, automaticReplay: false
  });
  if (report.activeAttempts.length || run.state === 'RECONCILING' ||
      report.objective?.status === 'RECONCILING')
    return step('RECONCILE_REQUIRED',
      report.objective?.status === 'RECONCILING'
        ? 'Durable destination delivery intent is unresolved; inspect actual target effects before any replay or Objective acceptance'
        : 'Inspect persisted Attempt effects and Lease before any resume; never automatically replay an uncertain Host Turn',
      report.activeAttempts.map(a => a.itemId));
  if (report.objectiveComplete)
    return step('OBJECTIVE_COMPLETE', 'Current delivered-tree Objective Evidence and Judge are satisfied');
  if (run.control === 'pause' || run.control === 'cancel' ||
      ['CANCELLED', 'WAITING_HUMAN'].includes(run.state))
    return step('HUMAN_HANDOFF', 'Workflow is paused, cancelled or requires an explicit human decision');
  // Recorded destination Evidence failures are not missing verification
  // requests. A damaged receipt, missing immutable approval or unreadable
  // target must be reviewed, not reexecuted or silently reverified.
  if (report.objective?.status === 'BLOCKED')
    return step('DELIVERED_EVIDENCE_REVIEW_REQUIRED',
      'Recorded destination or Objective Evidence is unreadable or inconsistent; inspect receipt, approval, Candidate and target without replay');
  if (report.objective?.targetDrift === true)
    return step('DELIVERED_TARGET_DRIFT_REVIEW_REQUIRED',
      'Delivered target changed after verification; review drift and obtain separately approved recovery before any new effect');
  if (run.state === 'COMPLETED')
    return step('OBJECTIVE_EVIDENCE_REQUIRED',
      'Candidate completion is not delivered Objective completion; inspect current destination Evidence and independent Judge');
  if (run.state === 'WAITING_APPROVAL' || report.authorization !== 'AUTHORIZED')
    return step('AWAIT_WORKFLOW_APPROVAL',
      'Current hash-bound Workflow approval is required before authenticated Host admission');
  const failed = workItems.filter(item =>
    item.attempt?.status === 'FAILED' ||
    ['FAILED', 'WAITING_HUMAN', 'BLOCKED'].includes(item.state));
  if (failed.length)
    return step('REPAIR_REVIEW_REQUIRED',
      'Inspect failure Evidence and seek separately authorized bounded Repair; do not reuse an old Host grant',
      failed.map(item => item.id));
  if (readyIds.length)
    return step('AUTHENTICATED_HOST_ADMISSION_REQUIRED',
      'Dependency-ready WorkItems still require current Operator authentication, Host grant, budget and Lease checks',
      readyIds);
  if (workItems.length && workItems.every(item => item.state === 'SUCCEEDED'))
    return step('DELIVERY_AND_OBJECTIVE_JUDGE_REQUIRED',
      'All WorkItems are recorded successful; destination delivery and independent Objective acceptance remain separate');
  return step('WAITING_ON_DEPENDENCIES',
    'Inspect persisted DAG blockers and any uncertain WorkItem state before dispatch');
}

// Read-only current DAG + Repair progress for the Codex MVP entry point.
// Advisory only: dependency readiness is not execution/lease/approval authority.
export async function workflowProgress(store, id) {
  const run = store.get(id);
  if (run?.kind !== 'workflow' || !Number.isInteger(run.revision) ||
      !Array.isArray(run.contract?.items) || !run.states)
    throw Error('Workflow progress requires a persisted current Workflow');
  const report = await runReport(store, id);
  const effective = new Map(report.workItems.map(item => [item.id, item.state]));
  const workItems = report.workItems.map(item => ({
    id: item.id, state: item.state,
    dependencies: [...item.dependencies],
    waitingOn: item.dependencies.filter(dep => effective.get(dep) !== 'SUCCEEDED'),
    attempt: item.attempt ? {
      childId: item.attempt.childId,
      generation: item.attempt.generation ?? 1,
      status: item.attempt.status
    } : null,
    reason: item.reason
  }));
  const dependencyReadyIds = workItems.filter(item =>
    item.waitingOn.length === 0 && ['PENDING','READY'].includes(item.state))
    .map(item => item.id);
  return {
    kind: 'CODEFLEET_WORKFLOW_PROGRESS_V1',
    workflowId: id, revision: run.revision, workflowHash: run.contractHash,
    workflowState: report.recordedState,
    workItems,
    dependencyReadyIds,
    continuation: existingWorkflowContinuation(run, report, workItems, dependencyReadyIds),
    activeAttemptIds: report.activeAttempts.map(item => item.childId),
    objective: report.objective,
    objectiveComplete: report.objectiveComplete,
    cost: report.cost,
    authority: 'READ_ONLY_ADVISORY', executionGranted: false,
    hostLiveAcceptance: 'UNVERIFIED'
  };
}
