// Trusted offline bounded repair. Proposals are data; only the embedding
// Operator may approve Filesets and issue a fresh exact verification decision.
import { hash } from '../alpha/contract.mjs';
import { performance } from 'node:perf_hooks';
import { task, bootstrapContext, submitBootstrapFiles, materializeTask, verifyTask } from './tasks.mjs';
import { continuationSnapshot } from './continuation.mjs';
import { executeOfflineDecision } from './reservations.mjs';
import { validateRepairFileset } from '../workflow/bootstrap-files.mjs';
import { classifyLocalResult, localBackend } from '../verification/backends.mjs';

const result = (action, reason, extra = {}) => ({ action, reason, executionGranted: false,
  complete: false, protectedVerification: 'UNSATISFIED',
  // Local execution cannot attest absence of external effects. In this backend
  // SAFE_RETRY_ELIGIBLE is deliberately not inferred from exit status or a claim.
  safeRetry: { eligible: false, reason: 'Independent idempotency/effects evidence unavailable' }, ...extra });
const terminal = new Set(['LOCAL_FAILED', 'LOCAL_PASSED', 'INCONCLUSIVE']);

export async function repairWorkItem() {
  return result('AWAIT_APPROVAL', 'Authenticated public repair Operator binding unavailable');
}

// Read-only classification. No issuance, proposal recording, execution or model.
export async function triageFailure(store, taskId, { proposal, request, cancelled = () => false } = {}) {
  let snapshot;
  try { snapshot = await continuationSnapshot(store, taskId); }
  catch (e) { return result('RECONCILE', e.message); }
  const current = task(store, taskId), { plan, workflow } = bootstrapContext(store, taskId);
  const reservations = snapshot.reservations.filter(r => r.reservation);
  if (snapshot.reason === 'EVIDENCE_DEFECT' || snapshot.reason === 'CANDIDATE_CHANGED' ||
      snapshot.reservations.some(r => r.status === 'EVIDENCE_DEFECT') || reservations.some(r => !terminal.has(r.status)))
    return result('RECONCILE', 'Uncertain attempt, changed candidate or invalid evidence', { snapshot });
  const started = store.events(taskId).filter(e => e.type === 'BOUNDED_REPAIR_STARTED');
  if (started.length) {
    const finished = store.events(taskId).some(e => e.type === 'BOUNDED_REPAIR_FINISHED' && e.body.runId === started[0].body.runId);
    return result(finished ? 'HUMAN_HANDOFF' : 'RECONCILE', finished ? 'One-repair budget consumed; no repeated or no-progress loop' : 'Repair effects must be reconciled; never replay', { snapshot });
  }
  if (cancelled()) return result('RECONCILE', 'Cancellation requested', { snapshot });
  if (snapshot.workItems.some(i => i.state.startsWith('REPAIR_'))) return result('AWAIT_APPROVAL', 'Existing repair proposal or effects require review', { snapshot });
  if (!snapshot.budget.remainingAttempts || !snapshot.budget.remainingTimeMs) return result('HUMAN_HANDOFF', 'Attempt/time budget exhausted', { snapshot });
  const failed = snapshot.workItems.find(i => i.state === 'LOCAL_FAILED');
  if (!failed) return result('DIAGNOSE', 'No definitive current test failure; inspect read-only evidence', { snapshot });
  const e = store.readArtifact(failed.verificationRef);
  if (e.taskRevision + 1 !== current.revision || e.workflowHash !== workflow.workflowHash ||
      e.authority !== 'LOCAL_EXECUTED' || classifyLocalResult(e.observed, e.observed.integrity).status !== 'LOCAL_FAILED')
    return result('RECONCILE', 'Failure revision/result binding is not current', { snapshot });
  if (reservations.length !== 1 || reservations[0].evidenceRef !== failed.verificationRef) return result('AWAIT_APPROVAL', 'A settled durable failure is required', { snapshot });
  if (!request) return result('DIAGNOSE', 'Verification command required for capability inspection', { snapshot });
  try {
    if ((await localBackend().capabilities()).status !== 'CONDITIONAL') return result('BLOCKED_CAPABILITY', 'Local backend unavailable');
    await verifyTask(store, taskId, failed.id, request);
  } catch (error) { return result('BLOCKED_CAPABILITY', error.message, { snapshot }); }
  const oldRequest = { executable: e.command.executable, args: e.command.args, directory: e.command.directory, timeoutMs: e.command.timeoutMs };
  if (hash(request) !== hash(oldRequest)) return result('AWAIT_APPROVAL', 'Verification command or budget changed', { snapshot });
  if (request.timeoutMs > snapshot.budget.remainingTimeMs) return result('HUMAN_HANDOFF', 'Insufficient verification time budget', { snapshot });
  if (!proposal?.hypothesis || !proposal.diagnostic || !e.log.includes(proposal.diagnostic) || proposal.evidenceRef !== failed.verificationRef)
    return result('DIAGNOSE', 'Concrete hypothesis and a diagnostic from actual failure evidence required', { snapshot });
  const item = snapshot.workItems.find(i => i.id === proposal.itemId);
  const tests = new Set(plan.draft.plannedTests.map(t => t.path));
  if (!item || !snapshot.repair?.itemIds.includes(item.id) || !Array.isArray(proposal.files) ||
      proposal.files.some(f => !item.files.includes(f.path) || tests.has(f.path) || !f.path.startsWith('src/')))
    return result('AWAIT_APPROVAL', 'Only owned source files may be repaired; tests/build/criteria cannot change', { snapshot });
  try { validateRepairFileset({ revision: current.revision, itemId: proposal.itemId,
    repair: { verificationItem: failed.id, evidenceRef: failed.verificationRef }, files: proposal.files }, workflow, proposal.itemId, e.fileDigests); }
  catch (error) { return result(error.message.includes('does not change') ? 'HUMAN_HANDOFF' : 'DIAGNOSE', error.message, { snapshot }); }
  return result('AWAIT_APPROVAL', 'Exact Fileset approval and fresh verification decision required', {
    snapshot, repairable: true, evidenceRef: failed.verificationRef, verificationItem: failed.id,
    revision: current.revision, proposalHash: hash(proposal), acceptanceHash: hash(plan.draft.criteria) });
}

// Exactly one repair plus one verification, no loop. The Operator object is a
// trusted dependency, not serialized Agent input or a public authentication API.
export async function repairOfflineWorkItem(store, taskId, { proposal, request, operator,
  cancelled = () => false, hooks = {} } = {}) {
  const triage = await triageFailure(store, taskId, { proposal, request, cancelled });
  if (!triage.repairable) return triage;
  if (typeof operator?.approveRepair !== 'function' || typeof operator?.issueVerification !== 'function') return triage;
  // Capture mutable caller input before awaiting Operator review.
  proposal = structuredClone(proposal); request = structuredClone(request);
  const repairStartedAt = Date.now();
  let runId, started = false, materialization, execution;
  try {
    const submitted = await submitBootstrapFiles(store, taskId, { revision: triage.revision, itemId: proposal.itemId,
      repair: { verificationItem: triage.verificationItem, evidenceRef: triage.evidenceRef }, files: proposal.files });
    runId = submitted.approvalRequest.runId;
    const expected = hash(submitted.task);
    await operator.approveRepair({ taskId, proposal: structuredClone(proposal), approvalRequest: submitted.approvalRequest });
    if (Date.now() < repairStartedAt) throw Error('RECONCILE: repair wall clock moved backwards during approval');
    if (hash(task(store, taskId)) !== expected) throw Error('RECONCILE: contract changed during approval');
    const approved = store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=?').get(runId);
    const run = store.get(runId);
    if (!approved || approved.digest !== run.contractHash || approved.expires <= Date.now() || run.state !== 'READY')
      return result('AWAIT_APPROVAL', 'Exact repair approval absent or expired', { runId });
    const deadline = Math.min(approved.expires, Date.now() + triage.snapshot.budget.remainingTimeMs);
    const monotonicDeadline = performance.now() + Math.max(0, deadline - Date.now());
    const timeGuard = () => {
      if (Date.now() < repairStartedAt) throw Error('RECONCILE: repair wall clock moved backwards');
      if (cancelled() || Date.now() >= deadline || performance.now() >= monotonicDeadline) throw Error('RECONCILE: cancellation or repair time budget exhausted');
    };
    const guard = () => {
      timeGuard();
      if (hash(task(store, taskId)) !== expected) throw Error('RECONCILE: repair contract changed');
    };
    guard();
    store.event(taskId, 'BOUNDED_REPAIR_STARTED', { runId, evidenceRef: triage.evidenceRef, proposalHash: triage.proposalHash,
      acceptanceHash: triage.acceptanceHash, deadline, maxRepairs: 1, action: 'AUTO_REPAIR_ELIGIBLE' });
    started = true;
    await hooks.started?.({ runId });
    materialization = await materializeTask(store, taskId, proposal.itemId, { guard, freshOnly: true, cancelled, hooks: hooks.materialize });
    if (materialization.status !== 'MATERIALIZED') throw Error('RECONCILE: incomplete repair effects');
    const repaired = task(store, taskId), plan = store.readArtifact(repaired.planRef);
    if (hash(plan.draft.criteria) !== triage.acceptanceHash) throw Error('RECONCILE: acceptance criteria changed');
    const inspected = await verifyTask(store, taskId, triage.verificationItem, request);
    const decision = await operator.issueVerification({ taskId, itemId: triage.verificationItem, runId,
      revision: repaired.revision, commandHash: inspected.commandHash, request: structuredClone(request), deadline });
    timeGuard();
    if (cancelled() || Date.now() + request.timeoutMs > deadline || performance.now() + request.timeoutMs > monotonicDeadline) throw Error('HUMAN_HANDOFF: insufficient repair verification budget');
    if (!decision?.repair || decision.repair.runId !== runId) throw Error('AWAIT_APPROVAL: new repair-bound decision required');
    execution = await executeOfflineDecision(store, taskId, triage.verificationItem, request,
      { decisionId: decision.decisionId, requestId: decision.requestId, cancelled, hooks: hooks.verification });
    store.event(taskId, 'BOUNDED_REPAIR_FINISHED', { runId, status: execution.status, evidenceRef: execution.evidenceRef ?? null });
    const snapshot = await continuationSnapshot(store, taskId);
    return result(execution.status === 'LOCAL_PASSED' ? 'AUTO_REPAIR_ELIGIBLE' : execution.status === 'LOCAL_FAILED' ? 'HUMAN_HANDOFF' : 'RECONCILE',
      execution.status === 'LOCAL_PASSED' ? 'One approved repair executed and locally verified; Protected completion unavailable' : 'Repair failed or uncertain; no further automatic retry',
      { performed: true, materialization, execution, snapshot, runId });
  } catch (error) {
    if (started) store.event(taskId, 'BOUNDED_REPAIR_INTERRUPTED', { runId, reason: error.message });
    const action = error.message.startsWith('AWAIT_APPROVAL:') ? 'AWAIT_APPROVAL' : error.message.startsWith('HUMAN_HANDOFF:') ? 'HUMAN_HANDOFF' : 'RECONCILE';
    return result(action, error.message, { runId, materialization, execution });
  }
}
