// WorkItem continuation for trusted offline embedding. No scheduler, issuer,
// model call or public Operator route. All execution stays in PR9 reservations.
import { hash } from '../alpha/contract.mjs';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { taskReport, bootstrapActions } from './report.mjs';
import { task, bootstrapContext, recordedDigests } from './tasks.mjs';
import { executeOfflineDecision, requireDurableOperator } from './reservations.mjs';

const satisfied = new Set(['PLAN_RECORDED', 'MATERIALIZED', 'LOCAL_PASSED']);
const terminal = new Set(['LOCAL_PASSED', 'LOCAL_FAILED', 'INCONCLUSIVE']);

// Recomputed from the existing Task, artifacts, events and reservations on every
// call, including restart. This projection is never a second persistent store.
export async function continuationSnapshot(store, taskId) {
  const report = await taskReport(store, taskId), current = task(store, taskId);
  const view = report.bootstrap, reservations = report.executionReservations ?? [];
  const attempts = reservations.filter(r => r.reservation);
  // Corrupt Evidence cannot make an existing reservation disappear from budget.
  // A malformed time record is unknown/exhausted, never an implicit refund.
  const hasReservations = store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_reservations'").get();
  const rows = hasReservations ? store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(taskId) : [];
  const times = rows.map(row => { try { return JSON.parse(row.body).reservedTimeMs; } catch { return null; } });
  const reservedTimeMs = times.every(n => Number.isSafeInteger(n) && n > 0) ? times.reduce((a, b) => a + b, 0) : null;
  const budget = { maxAttempts: current.settings.maxAttempts, usedAttempts: rows.length,
    remainingAttempts: Math.max(0, current.settings.maxAttempts - rows.length),
    reservedTimeMs, remainingTimeMs: reservedTimeMs === null ? 0 : Math.max(0, current.settings.timeoutSeconds * 1000 - reservedTimeMs),
    retryAllowed: false, cost: { modelCalls: 0, measuredUsd: null } };
  const result = { taskId, taskRevision: current.revision, workflowHash: report.workflowHash,
    objective: report.plan.draft?.objective ?? report.plan.objective,
    acceptanceCriteria: report.plan.draft?.criteria ?? [],
    mode: 'SINGLE_AGENT', authority: 'ADVISORY_ONLY', executionBoundary: 'TRUSTED_OFFLINE_ONLY',
    publicExecution: 'BLOCKED_OPERATOR_BINDING_UNAVAILABLE', executionGranted: false, automaticReplay: false,
    complete: false, protectedVerification: 'UNSATISFIED', verification: report.verification,
    status: 'HUMAN_HANDOFF', reason: null, next: null, budget,
    workItems: view?.items ?? [], remaining: view?.items.filter(i => !satisfied.has(i.state)) ?? [],
    reservations, judgments: Object.fromEntries(Object.entries(report.localVerification ?? {})
      .filter(([, v]) => v.judgment).map(([id, v]) => [id, v.judgment])) };
  const handoff = reason => ({ ...result, reason });
  if (!view || current.state === 'REJECTED') return handoff('VALIDATED_WORKFLOW_REQUIRED');
  const filesetRuns = Object.values(current.bootstrap.filesets).map(id => store.get(id));
  if (filesetRuns.some(r => ['MATERIALIZING', 'WAITING_HUMAN'].includes(r.state) ||
      r.state !== 'COMPLETED' && Object.keys(r.results ?? {}).length)) return handoff('UNCERTAIN_MATERIALIZATION_NO_REPLAY');
  if (current.settings.maxParallel !== 1) return handoff('SINGLE_AGENT_POLICY_REQUIRED');
  if (reservations.some(r => r.status === 'EVIDENCE_DEFECT') || view.items.some(i => i.state === 'EVIDENCE_INVALID')) return handoff('EVIDENCE_DEFECT');
  if (view.drift.length || view.items.some(i => i.state === 'VERIFICATION_STALE')) return handoff('CANDIDATE_CHANGED');
  if (attempts.some(r => !terminal.has(r.status))) return handoff('UNCERTAIN_OR_ACTIVE_ATTEMPT_NO_REPLAY');
  if (report.complete) return { ...result, complete: true, status: 'COMPLETE_LOCAL', reason: report.acceptance.reason, next: null, remaining: [] };

  const failed = view.items.find(i => i.state === 'LOCAL_FAILED');
  if (failed) {
    const evidence = store.readArtifact(failed.verificationRef);
    // Only actual failing observations can justify a repair proposal. Judge's
    // protected verdict stays ESCALATE; Local failure is not a protected RETRY.
    if (evidence.authority !== 'LOCAL_EXECUTED' || evidence.observed?.exitCode === 0 ||
        !(evidence.observed?.failed > 0)) return handoff('EVIDENCE_DEFECT');
    const ancestors = new Set();
    const visit = id => { if (ancestors.has(id)) return; ancestors.add(id); view.items.find(i => i.id === id)?.dependencies.forEach(visit); };
    failed.dependencies.forEach(visit);
    const testFiles = new Set((report.plan.draft?.plannedTests ?? []).map(t => t.path));
    result.repair = { verificationItem: failed.id, evidenceRef: failed.verificationRef,
      itemIds: view.items.filter(i => ancestors.has(i.id) && i.kind === 'local-edit').map(i => i.id),
      files: view.items.filter(i => ancestors.has(i.id) && i.kind === 'local-edit').flatMap(i => i.files).filter(p => !testFiles.has(p)),
      executionGranted: false, requiresNewExecutionDecision: true,
      requiresNewReviewedTask: attempts.length > 1 || !budget.remainingAttempts,
      repairPath: 'TRUSTED_OFFLINE_BOUNDED_REPAIR_REVIEW' };
    result.environmentRecovery = { action: 'REVIEW_ENVIRONMENT_REVERIFICATION', evidenceRef: failed.verificationRef,
      eligibleForReview: attempts.length === 1 && budget.remainingAttempts > 0 && budget.remainingTimeMs > 0,
      requires: ['OBSERVED_ENVIRONMENT_DIAGNOSIS','EXACT_NEW_REVIEW','TRUSTED_EFFECTIVE_POLICY_OBSERVER'],
      executionGranted: false, sameCandidateRequired: true, maxAdditionalAttempts: 1 };
    return handoff('FAILURE_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY');
  }
  if (view.items.some(i => i.state === 'INCONCLUSIVE')) return handoff('INCONCLUSIVE_EVIDENCE');
  const action = bootstrapActions(view)[0];
  const itemId = action?.items[0] ?? null;
  if (action?.kind === 'RUN_LOCAL_VERIFICATION' && itemId) {
    if (!budget.remainingAttempts || !budget.remainingTimeMs) return handoff('EXECUTION_BUDGET_EXHAUSTED');
    return { ...result, status: 'AWAIT_OPERATOR', reason: 'Fresh exact decision required; public Operator binding unavailable',
      next: { kind: 'RUN_LOCAL_VERIFICATION', itemId } };
  }
  // Existing Host proposal/materialization contracts remain separate. This
  // function neither reissues filesets nor interprets a proposal as approval.
  if (['PROPOSE_FILESET', 'AWAIT_FILESET_APPROVAL', 'MATERIALIZE'].includes(action?.kind)) {
    return { ...result, status: 'HOST_ACTION_REQUIRED', reason: 'Use the existing fileset review boundary', next: { kind: action.kind, itemId } };
  }
  return handoff(action?.kind ?? 'NO_ELIGIBLE_WORKITEM');
}

export async function continueWorkItem() { requireDurableOperator(); }

// Data-only handoff to the existing Host. This never calls a model or grants
// fileset/execution authority. Re-query after each approved verification.
export async function developmentProposalRequest(store, taskId, itemId) {
  const snapshot = await continuationSnapshot(store, taskId);
  if (snapshot.status !== 'HOST_ACTION_REQUIRED' || snapshot.next?.kind !== 'PROPOSE_FILESET' || snapshot.next.itemId !== itemId)
    throw Error('Eligible source proposal required; resolve dependencies, Evidence and approvals first');
  if (!snapshot.budget.remainingAttempts || !snapshot.budget.remainingTimeMs)
    throw Error('Verification budget exhausted; new development proposal requires reviewed limits');
  const { current, plan, workflow } = bootstrapContext(store, taskId);
  const item = workflow.items.find(i => i.id === itemId);
  const tests = new Set(plan.draft.plannedTests.map(t => t.path));
  if (item.files.some(p => tests.has(p) || (plan.contractKind!=='EXISTING_LOCAL' && !/^src\/.+\.mjs$/.test(p)))) throw Error('Development proposal is restricted to owned source modules; tests/configuration are fixed');
  const files = [];
  for (const [p, sha256] of Object.entries(recordedDigests(store, current))) {
    const content = await readFile(path.join(current.repo, ...p.split('/')), 'utf8');
    if (hash(content) !== sha256) throw Error('Proposal context changed');
    files.push({ path: p, sha256, content });
  }
  if (hash(task(store, taskId)) !== hash(current)) throw Error('Proposal revision changed during context capture');
  return { taskId, revision: current.revision, workflowHash: snapshot.workflowHash, taskHash: hash(current),
    objective: plan.draft.objective, acceptanceCriteria: plan.draft.criteria, item: structuredClone(item),
    context: { files, hash: hash(files) }, dependencies: snapshot.workItems.filter(i => item.dependencies.includes(i.id)),
    budget: snapshot.budget, authority: 'PROPOSAL_REQUEST_ONLY', executionGranted: false, modelInvocationGranted: false,
    requiredNextApprovals: ['SEPARATE_HOST_MODEL_CALL', 'EXACT_FILESET', 'FRESH_VERIFICATION_DECISION'], complete: false };
}

// Internal trusted embedding only. Scope is a restrictive execution ceiling,
// NOT a grant. The external Operator supplies a new exact decision after each
// dependency completes; this coordinator has no issuer, signer or public route.
// Persisted Attempts remain the budget source across calls/restarts.
export async function continueOfflineWorkflow(store, taskId, { scope, obtainDecision, cancelled = () => false } = {}) {
  const executions = [];
  let scopeRef;
  let snapshot = await continuationSnapshot(store, taskId);
  const finish = async (reason, status = 'HUMAN_HANDOFF') => {
    snapshot = await continuationSnapshot(store, taskId);
    if (scopeRef) store.event(taskId, 'BOUNDED_CONTINUATION_STOPPED', { scopeRef, reason, status,
      evidenceRefs: executions.map(e => e.evidenceRef).filter(Boolean) });
    return { status, reason, scopeRef, executions,
      snapshot: { ...snapshot, status, reason, next: null }, complete: false };
  };
  try {
    const ceiling = structuredClone(scope);
    if (!ceiling || !Number.isSafeInteger(ceiling.taskRevision) || typeof ceiling.workflowHash !== 'string' ||
        !Number.isSafeInteger(ceiling.maxAttempts) || ceiling.maxAttempts < 1 ||
        !Number.isSafeInteger(ceiling.maxReservedTimeMs) || ceiling.maxReservedTimeMs < 1 ||
        !Number.isSafeInteger(ceiling.expiresAt) || ceiling.modelCalls !== 0 ||
        !Array.isArray(ceiling.workItems) || !ceiling.workItems.length ||
        ceiling.workItems.some(i => typeof i.itemId !== 'string' || !i.request || !Number.isSafeInteger(i.request.timeoutMs) || i.request.timeoutMs < 1) ||
        new Set(ceiling.workItems.map(i => i.itemId)).size !== ceiling.workItems.length) throw Error('Invalid bounded continuation scope');
    const startedAt = Date.now(), monotonicStart = performance.now();
    const liveLimit = ceiling.expiresAt - startedAt;
    const stopped = () => cancelled() || Date.now() < startedAt || Date.now() >= ceiling.expiresAt || performance.now() - monotonicStart >= liveLimit;
    let revision = ceiling.taskRevision;
    const initial = task(store, taskId);
    const contract = hash({ repo: initial.repo, planRef: initial.planRef, settings: initial.settings });
    const seen = new Set();
    for (;;) {
      snapshot = await continuationSnapshot(store, taskId);
      if (stopped()) return finish('CONTINUATION_CANCELLED_OR_EXPIRED');
      const current = task(store, taskId);
      if (current.revision !== revision || snapshot.workflowHash !== ceiling.workflowHash ||
          hash({ repo: current.repo, planRef: current.planRef, settings: current.settings }) !== contract) return finish('CONTINUATION_CONTRACT_CHANGED');
      if (snapshot.complete) {
        if(scopeRef)store.event(taskId,'BOUNDED_CONTINUATION_COMPLETED',{scopeRef,evidenceRefs:executions.map(e=>e.evidenceRef)});
        return {status:snapshot.status,reason:snapshot.reason,scopeRef,executions,snapshot,complete:true};
      }
      if (snapshot.status !== 'AWAIT_OPERATOR' || snapshot.next?.kind !== 'RUN_LOCAL_VERIFICATION') return finish(snapshot.reason);
      const itemId = snapshot.next.itemId, entry = ceiling.workItems.find(i => i.itemId === itemId);
      if (!entry) return finish('WORKITEM_OUTSIDE_CONTINUATION_SCOPE', 'AWAIT_OPERATOR');
      if (seen.has(itemId)) return finish('CONTINUATION_NO_PROGRESS');
      if (snapshot.budget.usedAttempts >= ceiling.maxAttempts ||
          snapshot.budget.reservedTimeMs + entry.request.timeoutMs > ceiling.maxReservedTimeMs) return finish('CONTINUATION_BUDGET_EXHAUSTED');
      if (typeof obtainDecision !== 'function') return finish('FRESH_EXTERNAL_DECISION_REQUIRED', 'AWAIT_OPERATOR');
      if (!scopeRef) {
        scopeRef = store.artifact(ceiling);
        store.event(taskId, 'BOUNDED_CONTINUATION_STARTED', { scopeRef, revision, workflowHash: ceiling.workflowHash,
          authority: 'RESTRICTIVE_CEILING_ONLY', executionBoundary: 'TRUSTED_OFFLINE_ONLY' });
      }
      const beforeHash = hash(current), request = structuredClone(entry.request);
      const grant = await obtainDecision({ taskId, itemId, request, snapshot: structuredClone(snapshot) });
      if (stopped()) return finish('CONTINUATION_CANCELLED_OR_EXPIRED');
      if (hash(task(store, taskId)) !== beforeHash || hash(request) !== hash(entry.request)) return finish('CONTINUATION_BINDING_CHANGED');
      if (!grant) return finish('FRESH_EXTERNAL_DECISION_REQUIRED', 'AWAIT_OPERATOR');
      const exists = store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_decisions'").get();
      const row = exists && store.db.prepare('SELECT * FROM bootstrap_decisions WHERE id=?').get(grant.decisionId ?? '');
      if (!row || row.taskId !== taskId || row.requestId !== grant.requestId || row.consumed !== null || row.remaining !== 1 ||
          JSON.parse(row.body).itemId !== itemId) return finish('FRESH_EXACT_DECISION_REQUIRED', 'AWAIT_OPERATOR');
      const result = await continueOfflineWorkItem(store, taskId, {
        decisionId: grant.decisionId, requestId: grant.requestId, request, cancelled: stopped });
      snapshot = result.snapshot;
      if (result.execution) executions.push(result.execution);
      if (result.execution?.status !== 'LOCAL_PASSED') return finish(result.reason ?? snapshot.reason);
      seen.add(itemId);
      // Only the reservation's atomic Evidence attachment advances the revision.
      // Arbitrary requirement changes are never incorporated into this scope.
      revision++;
    }
  } catch (error) {
    snapshot = await continuationSnapshot(store, taskId);
    return finish(error.message);
  }
}

// The caller is the same trusted offline embedding boundary as
// executeOfflineDecision. Strings and stored JSON do not authenticate a caller.
// No public CLI/IPC imports this execution entry point.
export async function continueOfflineWorkItem(store, taskId, { decisionId, requestId, request, cancelled, hooks, observePolicy } = {}) {
  let execution = null;
  try {
    const before = await continuationSnapshot(store, taskId);
    const exists = store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_decisions'").get();
    const row = exists && store.db.prepare('SELECT body,taskId,requestId FROM bootstrap_decisions WHERE id=?').get(decisionId ?? '');
    if (!row || row.taskId !== taskId || row.requestId !== requestId) throw Error('Exact Operator decision absent or mismatched');
    const binding = JSON.parse(row.body);
    const prior = store.db.prepare('SELECT taskId FROM bootstrap_reservations WHERE requestId=?').get(requestId);
    // A repeated request only reads the committed reservation result. Never
    // select a different WorkItem using the old decision after a successful run.
    const environmentReview = binding.environmentRecovery && before.reason === 'FAILURE_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY';
    if (!prior && !environmentReview && (before.status !== 'AWAIT_OPERATOR' || before.next?.itemId !== binding.itemId)) throw Error(before.reason ?? 'WorkItem is not eligible');
    if (!prior && (binding.revision !== before.taskRevision || binding.taskHash !== hash(task(store, taskId)))) throw Error('Decision revision changed');
    execution = await executeOfflineDecision(store, taskId, binding.itemId, request, { decisionId, requestId, cancelled, hooks, observePolicy });
    const snapshot = await continuationSnapshot(store, taskId);
    return { status: snapshot.status, execution, snapshot, complete: false };
  } catch (error) {
    // No retry and no refund. Reservation execution owns persisted failures;
    // admission refusal cannot invent an Attempt or advance the Task.
    const snapshot = await continuationSnapshot(store, taskId);
    return { status: 'HUMAN_HANDOFF', reason: error.message, execution,
      snapshot: { ...snapshot, status: 'HUMAN_HANDOFF', next: null, reason: error.message }, complete: false };
  }
}
