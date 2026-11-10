// WorkItem continuation for trusted offline embedding. No scheduler, issuer,
// model call or public Operator route. All execution stays in PR9 reservations.
import { hash } from '../alpha/contract.mjs';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { taskReport, bootstrapActions } from './report.mjs';
import { task, bootstrapContext, recordedDigests } from './tasks.mjs';
import { executeOfflineDecision, requireDurableOperator } from './reservations.mjs';
import { readyBatch } from '../workflow/definition.mjs';
import { validateFileset } from '../workflow/bootstrap-files.mjs';
import { localTree } from '../verification/backends.mjs';
import { exact } from '../intent/contract.mjs';
import { coordinationLog, requireCoordinatedWorkItem, supervisedHandoffAdopted } from './work-log.mjs';
import { recoverObjective } from './recovery.mjs';

const satisfied = new Set(['PLAN_RECORDED', 'MATERIALIZED', 'LOCAL_PASSED', 'LOCAL_CHECKPOINT']);
const terminal = new Set(['LOCAL_PASSED', 'LOCAL_FAILED', 'INCONCLUSIVE']);

// Recomputed from the existing Task, artifacts, events and reservations on every
// call, including restart. This projection is never a second persistent store.
export async function continuationSnapshot(store, taskId, { preparedProposalItem = null } = {}) {
  const report = await taskReport(store, taskId), current = task(store, taskId);
  const view = report.bootstrap, reservations = report.executionReservations ?? [];
  const attempts = reservations.filter(r => r.reservation);
  const contractAttempts = attempts.filter(r => r.reservation.workflowHash === current.bootstrap?.workflowHash);
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
  result.coordination = coordinationLog(store, taskId);
  if (result.coordination.pendingDirectives.length) return handoff('DIRECTIVE_REVIEW_REQUIRED');
  const filesetRuns = Object.values(current.bootstrap.filesets).map(id => store.get(id));
  if (filesetRuns.some(r => ['MATERIALIZING', 'WAITING_HUMAN'].includes(r.state) ||
      r.state !== 'COMPLETED' && Object.keys(r.results ?? {}).length)) return handoff('UNCERTAIN_MATERIALIZATION_NO_REPLAY');
  if (current.settings.maxParallel !== 1) return handoff('SINGLE_AGENT_POLICY_REQUIRED');
  if (reservations.some(r => r.status === 'EVIDENCE_DEFECT') || view.items.some(i => i.state === 'EVIDENCE_INVALID')) return handoff('EVIDENCE_DEFECT');
  // Materialization explicitly marks old verification stale after an approved
  // source replacement. That state requires a new exact review, not a replay of
  // the old Evidence. An inferred stale result or observed disk drift still
  // means the candidate changed outside this transition.
  const inferredStale = view.items.some(i => i.state === 'VERIFICATION_STALE' &&
    current.bootstrap.states[i.id] !== 'VERIFICATION_STALE');
  if (view.drift.length || inferredStale) return handoff('CANDIDATE_CHANGED');
  if (attempts.some(r => !terminal.has(r.status))) return handoff('UNCERTAIN_OR_ACTIVE_ATTEMPT_NO_REPLAY');
  if (report.complete && result.coordination.pendingHandoffs.some(h => !supervisedHandoffAdopted(store, taskId, h))) return handoff('AGENT_HANDOFF_UNCONFIRMED');
  if (report.complete) return { ...result, complete: true, status: 'COMPLETE_LOCAL', reason: report.acceptance.reason, next: null, remaining: [] };

  const pendingReverification = view.items.find(i => i.kind === 'local-verification' &&
    i.state === 'VERIFICATION_STALE' && current.bootstrap.states[i.id] === 'VERIFICATION_STALE' &&
    !i.waitingOn.length);
  if (pendingReverification) {
    try { requireCoordinatedWorkItem(store, taskId, pendingReverification.id); }
    catch (error) { return handoff(error.message); }
    if (!budget.remainingAttempts || !budget.remainingTimeMs) return handoff('EXECUTION_BUDGET_EXHAUSTED');
    return { ...result, status: 'AWAIT_OPERATOR', reason: 'Fresh exact decision required after approved source replacement',
      next: { kind: 'RUN_LOCAL_VERIFICATION', itemId: pendingReverification.id } };
  }

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
      requiresNewReviewedTask: contractAttempts.length > 1 || !budget.remainingAttempts,
      repairPath: 'TRUSTED_OFFLINE_BOUNDED_REPAIR_REVIEW' };
    result.environmentRecovery = { action: 'REVIEW_ENVIRONMENT_REVERIFICATION', evidenceRef: failed.verificationRef,
      eligibleForReview: attempts.length === 1 && budget.remainingAttempts > 0 && budget.remainingTimeMs > 0,
      requires: ['OBSERVED_ENVIRONMENT_DIAGNOSIS','EXACT_NEW_REVIEW','TRUSTED_EFFECTIVE_POLICY_OBSERVER'],
      executionGranted: false, sameCandidateRequired: true, maxAdditionalAttempts: 1 };
    return handoff('FAILURE_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY');
  }
  if (view.items.some(i => i.state === 'INCONCLUSIVE')) return handoff('INCONCLUSIVE_EVIDENCE');
  const actions = bootstrapActions(view);
  const action = actions.map(a => ({ ...a, items: a.items.filter(id => {
    try { requireCoordinatedWorkItem(store, taskId, id, { preparedProposalItem }); return true; } catch { return false; }
  }) })).find(a => a.items.length);
  if (!action && result.coordination.pendingHandoffs.length) return handoff('AGENT_HANDOFF_UNCONFIRMED');
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

// Read-only eligibility of an already stored proposal. No model call, adoption,
// approval or Host observation is produced by this inspection.
export async function reviewSupervisedProposal(store, taskId, proposalRef) {
  const proposal = store.readArtifact(proposalRef);
  const { current, workflow, plan } = bootstrapContext(store, taskId);
  const log = coordinationLog(store, taskId);
  const h = log.handoffs.find(h => h.handoffId === proposal.handoffId);
  if (proposal.kind !== 'CurrentSessionDirectProposal' || proposal.taskId !== taskId ||
      proposal.taskRevision !== current.revision || proposal.contractRevision !== (current.contractRevision ?? 1) ||
      proposal.authority !== 'PROVIDER_REPORTED_ONLY' || proposal.executionGranted !== false ||
      proposal.origin !== 'CURRENT_ASSISTANT_SESSION_NOT_DELEGATED_AGENT' ||
      !h || h.stale || h.status !== 'PREPARED' || h.observations.length || proposal.packetRef !== h.packetRef ||
      h.planRef !== current.planRef || h.workflowHash !== workflow.workflowHash || h.workflowRef !== current.bootstrap.workflowRef ||
      hash(h.item) !== hash(workflow.items.find(i => i.id === h.itemId)))
    throw Error('Supervised proposal contract, revision or packet mismatch');
  const context = store.readArtifact(proposal.inputRef), packet = store.readArtifact(h.packetRef);
  if (context.kind !== 'CurrentSessionProposalContext' || context.taskId !== taskId ||
      context.taskRevision !== current.revision || context.contractRevision !== proposal.contractRevision ||
      context.handoffId !== h.handoffId || context.packetRef !== h.packetRef || hash(context.packet) !== hash(packet))
    throw Error('Supervised proposal context packet mismatch');
  const recovery = await recoverObjective(store, taskId);
  if (recovery.effects?.length || recovery.blockers.some(b => b !== 'AGENT_HANDOFF_UNCONFIRMED'))
    throw Error('RECONCILE: ' + recovery.blockers.join(', '));
  if (recovery.binding?.candidateHash !== proposal.candidateHash) throw Error('Supervised proposal candidate changed');
  const snapshot = await continuationSnapshot(store, taskId, { preparedProposalItem: h.itemId });
  const eligible = snapshot.workItems.find(i => i.id === h.itemId && i.kind === 'local-edit' &&
    i.state === 'PENDING_FILESET' && !i.waitingOn.length);
  requireCoordinatedWorkItem(store, taskId, h.itemId, { preparedProposalItem: h.itemId });
  if (snapshot.status !== 'HOST_ACTION_REQUIRED' || !eligible) throw Error('Eligible supervised source proposal required');
  const fixedTests = new Set(plan.draft.plannedTests.map(t => t.path));
  if (h.item.files.some(p => fixedTests.has(p))) throw Error('Fixed tests cannot be adopted as source proposals');
  const files = validateFileset({ revision: current.revision, itemId: h.itemId,
    files: proposal.files?.map(({path,content}) => ({path,content})) }, workflow, h.itemId);
  const digests = recordedDigests(store, current);
  for (const f of files) {
    const source = proposal.files.find(p => p.path === f.path);
    if (source.sha256 !== f.sha256 || source.bytes !== f.bytes || source.baseSha256 !== (digests[f.path] ?? null))
      throw Error('Supervised proposal content hash, size or base mismatch');
  }
  if (files.every(f => f.sha256 === digests[f.path])) throw Error('No-op supervised proposal');
  if (hash(task(store, taskId)) !== recovery.binding.taskHash ||
      hash(store.events(taskId)) !== recovery.workLog.hash || await localTree(current.repo) !== proposal.candidateHash)
    throw Error('Supervised proposal changed during inspection');
  const input = { revision: current.revision, itemId: h.itemId,
    files: files.map(({path,content}) => ({path,content,...(plan.contractKind === 'EXISTING_LOCAL' ? {baseSha256:digests[path] ?? null} : {})})) };
  return { kind: 'SupervisedProposalReview', taskId, proposalRef, packetRef: h.packetRef,
    contractRevision: proposal.contractRevision, binding: recovery.binding, workLogHash: recovery.workLog.hash,
    input, files, authority: 'PROVIDER_REPORTED_ONLY', eligibility: 'EXACT_FILESET_REGISTRATION_ONLY',
    executionGranted: false, modelInvocationGranted: false, hostHandoff: h.status,
    verification: 'NOT_RUN', protectedVerification: 'UNSATISFIED',
    requiredNextApprovals: ['FILESET_REGISTRATION', 'EXACT_FILESET_APPLY', 'FRESH_VERIFICATION_DECISION'] };
}

// Data-only handoff to the existing Host. This never calls a model or grants
// fileset/execution authority. Re-query after each approved verification.
export async function developmentProposalRequest(store, taskId, itemId) {
  requireCoordinatedWorkItem(store, taskId, itemId);
  const snapshot = await continuationSnapshot(store, taskId);
  const eligible = snapshot.workItems.find(i => i.id === itemId && i.kind === 'local-edit' &&
    i.state === 'PENDING_FILESET' && !i.waitingOn.length);
  if (snapshot.status !== 'HOST_ACTION_REQUIRED' || snapshot.next?.kind !== 'PROPOSE_FILESET' || !eligible)
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

// The Host owns actual agent invocation. This is a bounded proposal handoff,
// not an execution scheduler or approval issuer. File application stays serial.
export async function developmentProposalBatch(store, taskId, options = {}) {
  if (Object.keys(options).some(k => !['maxAgents', 'parallelBenefit'].includes(k)))
    throw Error('Unknown collaboration option; model/execution approval cannot be supplied here');
  const { maxAgents = 1, parallelBenefit = '' } = options;
  if (!Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 3 ||
      typeof parallelBenefit !== 'string' || parallelBenefit.length > 2000)
    throw Error('Invalid proposal concurrency limit or rationale');
  const snapshot = await continuationSnapshot(store, taskId);
  if (snapshot.status !== 'HOST_ACTION_REQUIRED' || snapshot.next?.kind !== 'PROPOSE_FILESET')
    throw Error('Eligible source proposals required');
  const { current, workflow } = bootstrapContext(store, taskId);
  const candidateHash = await localTree(current.repo);
  const limit = parallelBenefit.trim() ? maxAgents : 1;
  const states = Object.fromEntries(snapshot.workItems.map(i => [i.id,
    satisfied.has(i.state) ? 'SUCCEEDED' :
      i.kind === 'local-edit' && i.state === 'PENDING_FILESET' && !i.waitingOn.length ? 'READY' : 'BLOCKED']));
  // Reuse the existing ready/resource selection; never parallelize effects.
  const selected = readyBatch({ schemaVersion: 2, maxParallel: limit,
    items: workflow.items.map((i, priority) => ({ ...i, priority,
      resources: i.files.map(f => 'file:' + f.toLowerCase()) })) }, states);
  const requests = [];
  for (const item of selected) requests.push(await developmentProposalRequest(store, taskId, item.id));
  if (!requests.length || hash(task(store, taskId)) !== hash(current) ||
      requests.some(r => r.taskHash !== hash(current)) || await localTree(current.repo) !== candidateHash)
    throw Error('Collaboration context changed');
  const body = { kind: 'HostProposalBatch', taskId, revision: current.revision,
    contractRevision: current.contractRevision ?? 1, workflowHash: workflow.workflowHash,
    taskHash: hash(current), candidateHash, requests,
    mode: requests.length > 1 ? 'PARALLEL_PROPOSALS_ONLY' : 'SINGLE_AGENT',
    parallelBenefit: requests.length > 1 ? parallelBenefit : null,
    executionGranted: false, modelInvocationGranted: false, automaticReplay: false,
    authority: 'PROPOSAL_REQUEST_ONLY', integration: 'SERIAL_EXACT_FILESET_REVIEW',
    requiredNextApprovals: ['SEPARATE_HOST_MODEL_CALL', 'EXACT_FILESET', 'FRESH_VERIFICATION_DECISION'] };
  return { ...body, batchHash: hash(body) };
}

// Existing Work Log only. A started handoff is not proof the Host launched an
// agent. Until all results return it is an unknown outcome, never auto-replayed.
export function pendingHostProposals(store, taskId) {
  const events = store.events(taskId);
  return events.filter(e => e.type === 'HOST_PROPOSALS_DISPATCH_DECLARED' &&
    !events.some(done => done.type === 'HOST_PROPOSALS_REVIEWED' && done.body.batchHash === e.body.batchHash))
    .map(e => ({ batchHash: e.body.batchHash, batchRef: e.body.batchRef,
      status: 'HOST_OUTCOME_UNCONFIRMED', authority: 'PROVIDER_REPORTED_ONLY', automaticReplay: false }));
}

export async function recordProposalDispatch(store, taskId, batch) {
  const fresh = await developmentProposalBatch(store, taskId, {
    maxAgents: batch?.requests?.length, parallelBenefit: batch?.parallelBenefit ?? '' });
  if (hash(fresh) !== hash(batch)) throw Error('Stale or invalid Host proposal batch');
  const batchRef = store.artifact(batch);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (hash(task(store, taskId)) !== batch.taskHash || pendingHostProposals(store, taskId).length ||
        store.events(taskId).some(e => e.type === 'HOST_PROPOSALS_DISPATCH_DECLARED' && e.body.batchHash === batch.batchHash))
      throw Error('Host handoff already declared or changed; inspect outcomes, never redispatch automatically');
    store.event(taskId, 'HOST_PROPOSALS_DISPATCH_DECLARED', { batchRef, batchHash: batch.batchHash,
      itemIds: batch.requests.map(r => r.item.id), authority: 'PROVIDER_REPORTED_ONLY',
      modelInvocationGranted: false, executionGranted: false });
    store.db.exec('COMMIT');
    return { batchRef, batchHash: batch.batchHash, modelInvocationGranted: false, executionGranted: false };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

// Validate ALL returned proposals against a freshly observed batch before
// any submission. Agent identity/messages remain reports, never Evidence.
export async function reviewDevelopmentResults(store, taskId, batch, results) {
  const { batchHash, ...body } = batch ?? {};
  if (!batchHash || hash(body) !== batchHash || body.taskId !== taskId)
    throw Error('Collaboration batch binding mismatch');
  const fresh = await developmentProposalBatch(store, taskId, {
    maxAgents: body.requests.length, parallelBenefit: body.parallelBenefit ?? '' });
  if (fresh.batchHash !== batchHash) throw Error('Stale collaboration context; review current contract/candidate');
  if (!Array.isArray(results) || results.length !== fresh.requests.length ||
      new Set(results.map(r => r?.itemId)).size !== results.length)
    throw Error('Exactly one result per assigned WorkItem required');
  const { current, workflow, plan } = bootstrapContext(store, taskId);
  const digests = recordedDigests(store, current), proposals = [];
  for (const request of fresh.requests) {
    const result = results.find(r => r.itemId === request.item.id);
    exact(result, ['itemId', 'agentId', 'files', 'feedback'], 'Host proposal result');
    if (typeof result.agentId !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(result.agentId) ||
        typeof result.feedback !== 'string' || result.feedback.length > 8000 || !Array.isArray(result.files))
      throw Error('Invalid Host result metadata');
    const existing = plan.contractKind === 'EXISTING_LOCAL';
    for (const f of result.files) {
      exact(f, existing ? ['path','content','baseSha256'] : ['path','content'], 'Host result file');
      if (existing && f.baseSha256 !== (digests[f.path] ?? null)) throw Error('Result base digest mismatch');
    }
    const validated = validateFileset({ revision: current.revision, itemId: result.itemId,
      files: result.files.map(({path,content}) => ({path,content})) }, workflow, result.itemId);
    if (existing && (result.files.some(f => f.baseSha256 === null) && result.files.some(f => f.baseSha256 !== null) ||
        validated.every(f => f.sha256 === digests[f.path])))
      throw Error('Mixed creation/replacement or no-op result requires a different WorkItem');
    proposals.push({ revision: current.revision, itemId: result.itemId, files: structuredClone(result.files) });
  }
  if (hash(task(store, taskId)) !== fresh.taskHash || await localTree(current.repo) !== fresh.candidateHash)
    throw Error('Collaboration context changed during result review');
  return { kind: 'ReviewedHostProposals', taskId, batchHash, proposals,
    results: structuredClone(results), authority: 'PROVIDER_REPORTED_ONLY',
    executionGranted: false, complete: false, integration: 'SUBMIT_SERIAL_THEN_EXACT_FILESET_APPROVAL',
    note: 'Recheck the current revision and dependencies before each submission. This is not Host execution evidence.' };
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
