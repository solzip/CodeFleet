import path from 'node:path';
import { verifiedEvidence } from '../alpha/evidence.mjs';
import { attempts, approval } from '../workflow/persistence.mjs';
import { judge } from '../alpha/judge.mjs';
import { messages } from '../workflow/collaboration.mjs';
import { task, bootstrapView, bootstrapDrift, clarifiableFor } from './tasks.mjs';

function bootstrapNext(current, plan) {
  if (current.state === 'REJECTED') return 'Create a new plan';
  const open = clarifiableFor(current, plan).filter(u => u.status === 'OPEN').map(u => u.id);
  if (!current.bootstrap && open.length) return `An operator must confirm the objective's meaning with objective clarify (${open.join(', ')}); a planner cannot clear it. Other unknowns need a BootstrapDraft`;
  return current.state === 'VALIDATED' ? 'Prepare the bootstrap workflow' : 'Submit a BootstrapDraft; planned files are not existing code';
}
// Derived from the effective item states, most urgent first. Every entry names the
// items it is about, so an empty kind never asks for work that does not exist.
const UNSATISFIED_LOCAL = ['PENDING_VERIFICATION', 'VERIFICATION_STALE', 'INCONCLUSIVE'];
export function bootstrapActions(view) {
  const ready = view.items.filter(i => !i.waitingOn.length), ids = list => list.map(i => i.id);
  const fileset = s => ready.filter(i => i.fileset && !i.fileset.state.startsWith('SUPERSEDED') && s.includes(i.fileset.state) && i.state !== 'MATERIALIZED');
  const actions = [];
  const add = (kind, items, text) => { if (items.length) actions.push({ kind, items: ids(items), text }); };
  add('AWAIT_FILESET_APPROVAL', fileset(['WAITING_APPROVAL']), 'An operator reviews and approves the filesetHash with objective approve');
  add('MATERIALIZE', fileset(['READY', 'WAITING_HUMAN']), 'objective materialize <task-id> <item-id>; a WAITING_HUMAN fileset retries only what is not yet written, after any conflict is resolved by hand');
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
    if (i.verificationRef && !['EVIDENCE_INVALID', 'VERIFICATION_STALE'].includes(i.state)) {
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
function bootstrapContinuation(current, view, actions) {
  const base = { mode: 'SINGLE_AGENT', authority: 'ADVISORY_ONLY', taskRevision: current.revision,
    workflowHash: current.bootstrap?.workflowHash ?? null, executionGranted: false,
    automaticReplay: false };
  if (!view) return { ...base, status: 'HUMAN_HANDOFF', reason: 'VALIDATED_WORKFLOW_REQUIRED', next: null };
  if (view.drift.length) return { ...base, status: 'HUMAN_HANDOFF', reason: 'FILES_CHANGED_OUTSIDE_CODEFLEET', next: null };
  const defect = actions.find(a => a.kind === 'EVIDENCE_DEFECT');
  const action = defect ?? actions[0];
  const itemId = action.items[0] ?? null;
  const next = { kind: action.kind, itemId };
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
      const a = records.find(a => a.itemId === n.id), child = a ? store.get(a.childId) : null;
      return { id: n.id, dependencies: n.dependencies, roles: n.roles ?? null, state: child && a.status === 'STARTED' ? child.state : run.states[n.id], attempt: a ?? null, reason: child?.reason ?? run.workItemBlocks?.[n.id]?.join('; ') ?? null };
    });
  }
  const artifactPaths = Object.fromEntries(['acceptedHash', 'evidenceHash', 'integrationHash', 'graphRef', 'sourceRef'].filter(k => /^[a-f0-9]{64}$/.test(run[k] ?? '')).map(k => [k, path.join(store.directory, 'artifacts', run[k] + '.json')]));
  const usage = run.kind === 'workflow' ? attempts(store, id).map(a => store.get(a.childId)) : [run];
  const complete = run.state === 'COMPLETED' && verification.status === 'VERIFIED';
  return { schemaVersion: 1, kind: 'RunReport', runId: id, state: run.state === 'COMPLETED' && !complete ? 'VERIFICATION_INVALID' : run.state, recordedState: run.state, complete, verification, authorization, provider: run.providerId ?? (run.kind === 'workflow' ? 'NOT_SELECTED' : 'claude-v1'), workItems, activeAttempts,
    attempts: run.attempts, cost: { reportedUsd: usage.reduce((n, r) => n + r.reportedCostUsd, 0), unknownAttempts: usage.reduce((n, r) => n + r.unknownCostAttempts, 0), authority: 'PROVIDER_REPORTED_ONLY' },
    reason: run.reason ?? null, artifactPaths, messages: run.kind === 'workflow' && run.contract.schemaVersion === 2 ? messages(store, run.id) : [], retry: activeAttempts.length ? 'RECONCILE_ONLY_NO_AUTOMATIC_REPLAY' : run.kind === 'workflow' && workItems.some(n => n.attempt) && !complete ? 'NEW_REVIEWED_TASK_REQUIRED' : 'WITHIN_PINNED_CONTRACT_ONLY',
    readiness: complete ? 'VERIFIED' : 'BLOCKED_OR_UNSUPPORTED', liveProviderVerification: 'NOT_ESTABLISHED_BY_THIS_REPORT', events: store.events(id) };
}
export async function taskReport(store, id) {
  const current = task(store, id), plan = store.readArtifact(current.planRef);
  const run = current.runId ? await runReport(store, current.runId) : null;
  if (plan.contractKind === 'NEW_PROJECT') {
    const view = current.bootstrap && current.state !== 'REJECTED' ? bootstrapView(store, id, { drift: await bootstrapDrift(store, id) }) : null;
    const actions = view ? bootstrapActions(view) : null, local = view ? localVerification(store, view) : {};
    // complete is never true here: NEW_PROJECT has no protected verification contract.
    return { schemaVersion: 1, kind: 'TaskReport', taskId: id, revision: current.revision, contractKind: 'NEW_PROJECT', state: current.state, reviewState: current.state, plannerAttempt: current.plannerAttempt ?? null, plan, settings: current.settings, run: null,
      bootstrap: view, nextAction: actions ? actions.map(a => `${a.kind}${a.items.length ? ' (' + a.items.join(', ') + ')' : ''}: ${a.text}`).join('; ') : bootstrapNext(current, plan), nextActions: actions,
      workflowHash: current.bootstrap?.workflowHash ?? null, continuation: bootstrapContinuation(current, view, actions),
      verification: Object.values(local).some(v => v.evidenceRef) ? 'LOCAL_ONLY_UNPROTECTED' : 'NOT_RUN', localVerification: local, protectedVerification: 'UNSATISFIED', complete: false };
  }
  return { schemaVersion: 1, kind: 'TaskReport', taskId: id, revision: current.revision, state: current.state === 'REJECTED' ? 'REJECTED' : run?.state ?? current.state, reviewState: current.state, plannerAttempt: current.plannerAttempt ?? null, plan, settings: current.settings, run,
    nextAction: current.state === 'REJECTED' ? 'Create a new plan' : !current.runId ? 'Review scope, then run to prepare a workflow' : 'Approve the exact workflow hash, then run with explicit model consent',
    workflowHash: current.runId ? store.get(current.runId).contractHash : null };
}
