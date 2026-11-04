import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { hash } from '../alpha/contract.mjs';
import { exact } from '../intent/contract.mjs';
import { canonical, requireProductionHostIsolation } from '../hosts/operator.mjs';
import { localBackend, classifyLocalResult } from '../verification/backends.mjs';
import { task, verifyTask, bootstrapContext, bootstrapView, archivedContractEvidence } from './tasks.mjs';
import { bootstrapGuard } from '../hosts/workflow-authorization.mjs';
import { validateEnvironmentRecovery, observeRecoveryPolicy, validRecoveryObservation } from './environment-recovery.mjs';
import { requireCoordinatedWorkItem } from './work-log.mjs';

// Same Store/SQLite, events, artifacts and runs lease. Never a protected Workflow
// child: workflow_attempts retains its existing Run/source/graph FK contract.
export function enableReservations(store) {
  tx(store, () => {
    store.db.exec(`CREATE TABLE IF NOT EXISTS bootstrap_decisions (
      id TEXT PRIMARY KEY, requestId TEXT NOT NULL UNIQUE, taskId TEXT NOT NULL REFERENCES product_tasks(id),
      body TEXT NOT NULL, issued INTEGER NOT NULL, expires INTEGER NOT NULL, revoked INTEGER,
      consumed INTEGER, remaining INTEGER NOT NULL CHECK(remaining IN (0,1)));
      CREATE TABLE IF NOT EXISTS bootstrap_reservations (
      requestId TEXT PRIMARY KEY REFERENCES bootstrap_decisions(requestId), decisionId TEXT NOT NULL UNIQUE REFERENCES bootstrap_decisions(id),
      runId TEXT NOT NULL UNIQUE REFERENCES runs(id), taskId TEXT NOT NULL REFERENCES product_tasks(id),
      repo TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS bootstrap_active_repository ON bootstrap_reservations(repo)
        WHERE state IN ('RESERVED','STARTED','HUMAN_HANDOFF');
      INSERT OR IGNORE INTO workflow_extensions VALUES ('bootstrap-reservations',1);`);
    if (store.db.prepare("SELECT version FROM workflow_extensions WHERE name='bootstrap-reservations'").get().version !== 1) throw Error('Unsupported Bootstrap reservation schema');
  });
}
function tx(store, fn) {
  store.db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); store.db.exec('COMMIT'); return result; }
  catch (e) {
    store.db.exec('ROLLBACK');
    // Roll back the reservation, never the observed expiry of its authority.
    if (e.expiredDecision) store.event(e.expiredDecision.taskId, 'BOOTSTRAP_DECISION_EXPIRED', e.expiredDecision);
    throw e;
  }
}
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value);
function decision(store, id) {
  const row = store.db.prepare('SELECT * FROM bootstrap_decisions WHERE id=?').get(id);
  if (!row) throw Error('Operator decision absent');
  return { ...row, binding: JSON.parse(row.body) };
}
function currentBinding(store, binding) {
  const { current, plan, workflow } = bootstrapContext(store, binding.taskId);
  if (current.revision !== binding.revision || hash(current) !== binding.taskHash ||
      workflow.workflowHash !== binding.workflowHash || plan.probe.repositoryId !== binding.repositoryId ||
      current.repo !== binding.repo) throw Error('Task revision, workflow or repository changed');
  const item = bootstrapView(store, current.id).items.find(i => i.id === binding.itemId);
  if (item?.kind !== 'local-verification' || item.capability !== 'EXPLICIT_TRUST_PER_RUN' || item.waitingOn.length) throw Error('Capability or dependencies unavailable');
  if (current.settings.maxParallel !== 1) throw Error('Single concurrency required');
  bootstrapGuard(store, binding.taskId)?.checkDecision(binding);
  if (binding.repair) validateRepairDecision(store, binding);
  if (binding.environmentRecovery) validateEnvironmentRecovery(store, binding, {requireReview:true});
  return current;
}
const expiryObserved = (store, d) => store.events(d.taskId).some(e => e.type === 'BOOTSTRAP_DECISION_EXPIRED' && e.body.decisionId === d.id);
function validDecision(store, d) {
  const now = Date.now();
  if (now < d.issued) throw Error('Operator decision clock precedes issuance; reconcile');
  const expired = expiryObserved(store, d);
  if (d.expires <= now && !expired) store.event(d.taskId, 'BOOTSTRAP_DECISION_EXPIRED', { decisionId: d.id, observedAt: now, expiresAt: d.expires });
  if (d.revoked !== null || d.expires <= now || expired) {
    const error = Error('Operator decision expired or revoked');
    if (d.expires <= now && !expired) error.expiredDecision = { taskId: d.taskId, decisionId: d.id, observedAt: now, expiresAt: d.expires };
    throw error;
  }
}
// A superseded failure stays valid history only through a completed, recorded
// Fileset repair of that exact evidence. Never silently drop attachment checks.
function completedRepairFor(store, prior, runId) {
  if (prior.state !== 'LOCAL_FAILED' || !prior.result?.evidenceRef) return null;
  const runs = runId ? [store.get(runId)] : store.list();
  return runs.find(run => {
    if (run.taskId !== prior.taskId || run.operation !== 'modify' || run.state !== 'COMPLETED' ||
        run.contract?.repairOf?.evidenceRef !== prior.result.evidenceRef || run.contract.repairOf.verificationItem !== prior.itemId ||
        run.contractHash !== hash(run.contract) || !run.materializationRef) return false;
    const evidence = store.readArtifact(run.materializationRef);
    return evidence.status === 'MATERIALIZED' && evidence.filesetHash === run.contractHash && evidence.operation === 'modify' &&
      run.contract.files.every(f => evidence.results.some(r => r.path === f.path && r.sha256 === f.sha256 && ['MODIFIED','ALREADY_MODIFIED'].includes(r.status))) &&
      store.events(prior.taskId).some(e => e.type === 'BOOTSTRAP_REPAIR_RECORDED' && e.body.evidenceRef === prior.result.evidenceRef && e.body.itemId === run.itemId);
  });
}
function validateRepairDecision(store, binding) {
  const prior = record(store, binding.repair.priorRequestId);
  if (!prior || prior.taskId !== binding.taskId || prior.itemId !== binding.itemId || prior.result?.evidenceRef !== binding.repair.evidenceRef) throw Error('Repair failure binding mismatch');
  const run = completedRepairFor(store, prior, binding.repair.runId);
  if (!run || run.control !== 'run') throw Error('Approved completed repair required');
  const approval = store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=? AND revision=?').get(run.id, run.revision);
  if (!approval || approval.digest !== run.contractHash || approval.expires <= Date.now()) throw Error('Repair approval expired or revoked');
  const { current, plan } = bootstrapContext(store, binding.taskId);
  if (current.bootstrap.filesets[run.itemId] !== run.id || binding.workflowHash !== prior.workflowHash) throw Error('Repair contract changed');
  const old = store.readArtifact(prior.result.evidenceRef);
  if (old.authority !== 'LOCAL_EXECUTED' || old.status !== 'LOCAL_FAILED' || old.observed?.failed < 1) throw Error('Repair requires actual failure');
  const protectedPaths = new Set(plan.draft.plannedTests.map(t => t.path));
  const changed = new Map(run.contract.files.map(f => [f.path, f]));
  if (run.contract.files.some(f => protectedPaths.has(f.path) || !/^src\//.test(f.path) || f.baseSha256 !== old.fileDigests[f.path] || f.sha256 === f.baseSha256)) throw Error('Repair source scope mismatch');
  if (Object.keys(old.fileDigests).length !== Object.keys(binding.fileDigests).length ||
      Object.entries(old.fileDigests).some(([p,h]) => binding.fileDigests[p] !== (changed.get(p)?.sha256 ?? h))) throw Error('Repair changed verification assets or unrelated files');
  const withoutCandidate = c => ({ executable: c.executable, executableHash: c.executableHash, args: c.args, directory: c.directory, timeoutMs: c.timeoutMs });
  if (canonical(withoutCandidate(binding.command)) !== canonical(withoutCandidate(old.command)) || binding.command.candidateTreeHash === old.command.candidateTreeHash) throw Error('Repair verification command changed or no progress');
  // Revalidate immutable terminal evidence, including counts and original grant.
  committedStatus(store, prior.decisionId, prior.requestId);
}
// Bind a separately materialized repair before presenting a new Local review.
// Reuse the issuance checks; discovery grants neither a Decision nor an Attempt.
export function inspectCompletedRepair(store, taskId, itemId, inspected) {
  const current = task(store, taskId);
  const prior = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(taskId)
    .map(r => JSON.parse(r.body)).filter(r => r.identity?.workflowHash === current.bootstrap.workflowHash);
  if (!prior.some(r => r.state === 'LOCAL_FAILED')) return null;
  if (prior.length !== 1 || prior[0].state !== 'LOCAL_FAILED' || prior[0].itemId !== itemId)
    throw Error('One settled failure required; repair budget exhausted');
  const run = completedRepairFor(store, prior[0]);
  if (!run) throw Error('Approved completed repair required');
  const repair = {runId: run.id, evidenceRef: prior[0].result.evidenceRef, priorRequestId: prior[0].requestId};
  validateRepairDecision(store, {taskId, itemId, workflowHash: current.bootstrap.workflowHash,
    command: inspected.command, fileDigests: inspected.fileDigests, repair});
  return repair;
}
export function requireDurableOperator() {
  requireProductionHostIsolation();
  // A generic future Host deployment does not authenticate Bootstrap decisions.
  throw Error('DURABLE_OPERATOR_BINDING_UNAVAILABLE: authenticated Bootstrap issuance/execution is not integrated');
}
// Preserve the old API names as fail-closed entry points. No caller JSON,
// optional argument, environment flag or stored decision can enable these APIs.
export async function issueDecision() { requireDurableOperator(); }
export async function executeDecision() { requireDurableOperator(); }

// Trusted offline embedding only, like dispatchHost. This function does NOT
// authenticate a human/Operator. No public CLI or IPC issuance route calls it.
// JSON, actor and hashes are bindings, never proof of caller authority.
// Inspection never creates a decision; expiry and budgets remain explicit.
export async function issueOfflineDecision(store, taskId, itemId, request, input) {
  return issue(store, taskId, itemId, request, input);
}
// An explicit new, one-shot decision after an approved repair, never a replay.
// Only trusted offline embedding can call this, just like issueOfflineDecision.
export async function issueOfflineRepairDecision(store, taskId, itemId, request, input, repairRunId) {
  return issueRepair(store, taskId, itemId, request, input, repairRunId);
}
// Explicit same-user Local trust, NOT an authenticated Operator grant. The
// Native coordinator checks the complete review before calling this adapter.
// Signed/protected enrollment still invokes its guard and rejects this proof.
export async function issueLocalTrustDecision(store, taskId, itemId, request, input, review, repairRunId = null) {
  const authorization = { kind: 'EXPLICIT_LOCAL_TRUST', ...structuredClone(review) };
  const result = repairRunId ? await issueRepair(store, taskId, itemId, request, input, repairRunId, authorization)
    : await issue(store, taskId, itemId, request, input, undefined, authorization);
  return { ...result, authority: 'EXPLICIT_LOCAL_TRUST', operatorAuthentication: 'NOT_ESTABLISHED' };
}
// Uses the same supervised Local boundary; never an authenticated public issuer.
export async function issueLocalEnvironmentDecision(store, taskId, itemId, request, input, review, environmentRecovery) {
  const workflowHash=task(store,taskId).bootstrap.workflowHash;
  const prior = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(taskId)
    .map(r => JSON.parse(r.body)).filter(r=>r.identity?.workflowHash===workflowHash);
  if (prior.length !== 1 || prior[0].state !== 'LOCAL_FAILED' || prior[0].requestId !== environmentRecovery.priorRequestId)
    throw Error('One settled failure required; environment recovery budget exhausted');
  committedStatus(store, prior[0].decisionId, prior[0].requestId);
  return issue(store, taskId, itemId, request, input, undefined,
    {kind:'EXPLICIT_LOCAL_TRUST', ...structuredClone(review)}, structuredClone(environmentRecovery));
}
// Signed grants still use exactly the same issuance and reservation transaction.
export async function issueSignedOfflineDecision(store, taskId, itemId, request, input, authorization, repairRunId = null) {
  if (!bootstrapGuard(store, taskId)) throw Error('Trusted Bootstrap enrollment required');
  return repairRunId ? issueRepair(store, taskId, itemId, request, input, repairRunId, authorization)
    : issue(store, taskId, itemId, request, input, undefined, authorization);
}
async function issueRepair(store, taskId, itemId, request, input, repairRunId, authorization) {
  const run = store.get(repairRunId);
  const workflowHash=task(store,taskId).bootstrap.workflowHash;
  const prior = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(taskId)
    .map(r => JSON.parse(r.body)).filter(r=>r.identity?.workflowHash===workflowHash);
  if (prior.length !== 1 || prior[0].state !== 'LOCAL_FAILED' || prior[0].itemId !== itemId) throw Error('One settled failure required; repair budget exhausted');
  const repair = { runId: repairRunId, evidenceRef: run.contract?.repairOf?.evidenceRef, priorRequestId: prior[0].requestId };
  return issue(store, taskId, itemId, request, input, repair, authorization);
}
async function issue(store, taskId, itemId, request, input, repair, authorization, environmentRecovery) {
  enableReservations(store);
  exact(input, ['decisionId','requestId','actor','revision','commandHash','acknowledgeUnisolated','expiresAt','maxExecutions','timeBudgetMs','maxConsecutiveFailures'], 'Operator decision');
  if (!identifier(input.decisionId) || !identifier(input.requestId) || input.decisionId === input.commandHash || input.requestId === input.commandHash || input.decisionId === input.requestId ||
      typeof input.actor !== 'string' || !input.actor.trim() || input.actor.length > 200 || input.acknowledgeUnisolated !== true ||
      input.maxExecutions !== 1 || input.maxConsecutiveFailures !== 1 || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= Date.now() ||
      !Number.isSafeInteger(input.timeBudgetMs) || input.timeBudgetMs < 1 || input.timeBudgetMs > 120000) throw Error('Explicit one-shot Operator decision, expiry, trust and finite budgets required');
  const before = task(store, taskId);
  const inspected = await verifyTask(store, taskId, itemId, request);
  if (input.revision !== before.revision || input.commandHash !== inspected.commandHash || inspected.command.timeoutMs > input.timeBudgetMs) throw Error('Reviewed revision/command or time budget mismatch');
  const plan = store.readArtifact(before.planRef);
  const binding = { ...input, taskId, itemId, revision: before.revision, taskHash: hash(before), workflowHash: before.bootstrap.workflowHash,
    repo: before.repo, repositoryId: plan.probe.repositoryId, command: inspected.command, fileDigests: inspected.fileDigests,
    ...(repair ? { repair } : {}), ...(environmentRecovery ? {environmentRecovery} : {}), ...(authorization ? { authorization: structuredClone(authorization) } : {}) };
  return tx(store, () => {
    currentBinding(store, binding);
    if (input.expiresAt <= Date.now()) throw Error('Operator decision expired during inspection');
    store.db.prepare('INSERT INTO bootstrap_decisions VALUES (?,?,?,?,?,?,NULL,NULL,1)').run(input.decisionId, input.requestId, taskId, JSON.stringify(binding), Date.now(), input.expiresAt);
    store.event(taskId, 'BOOTSTRAP_DECISION_ISSUED', { decisionId: input.decisionId, requestId: input.requestId, revision: binding.revision, commandHash: input.commandHash });
    return { ...binding, status: 'ISSUED', remainingExecutions: 1, authority: 'LOCAL_OPERATOR', complete: false };
  });
}
export function revokeDecision(store, id, actor) {
  enableReservations(store);
  if (typeof actor !== 'string' || !actor.trim()) throw Error('Explicit actor required');
  return tx(store, () => {
    const d = decision(store, id);
    store.db.prepare('UPDATE bootstrap_decisions SET revoked=COALESCE(revoked,?) WHERE id=?').run(Date.now(), id);
    store.event(d.taskId, 'BOOTSTRAP_DECISION_REVOKED', { decisionId: id, actor });
    return { decisionId: id, status: 'REVOKED', complete: false };
  });
}
function record(store, requestId) {
  const r = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE requestId=?').get(requestId);
  return r ? JSON.parse(r.body) : null;
}
function write(store, r) {
  store.db.prepare('UPDATE bootstrap_reservations SET state=?,body=? WHERE requestId=?').run(r.state, JSON.stringify(r), r.requestId);
  store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify({ id: r.runId, kind: 'bootstrap-verification', state: r.state, contractHash: r.commandHash, reservation: r }), r.runId);
}
function fenced(store, r, binding, expected) {
  requireCoordinatedWorkItem(store, binding.taskId, binding.itemId);
  const d = decision(store, r.decisionId); validDecision(store, d); currentBinding(store, binding);
  const live = record(store, r.requestId), lease = store.db.prepare('SELECT * FROM runs WHERE id=?').get(r.runId);
  if (live?.state !== expected || live.owner !== r.owner || live.fence !== r.fence || lease?.owner !== r.owner || lease.leaseUntil <= Date.now() || lease.control !== 'run') throw Error('Lease/fence lost or attempt no longer current');
  if (d.consumed === null || d.remaining !== 0 || r.reservedExecutions !== 1 || Date.now() >= r.deadline) throw Error('Execution time/budget exhausted');
}
export function reservationStatus(store, decisionId, requestId) {
  // Recovery observes existing records; it must not initialize or reserve a writer.
  if (store.readOnly) return committedStatus(store, decisionId, requestId);
  enableReservations(store);
  return tx(store, () => committedStatus(store, decisionId, requestId));
}
function committedStatus(store, decisionId, requestId) {
  const d = decision(store, decisionId);
  if (d.requestId !== requestId) throw Error('Request ID does not belong to decision');
  const decisionState = { decisionId, requestId, issuedAt: d.issued, expiresAt: d.expires, revokedAt: d.revoked, consumedAt: d.consumed,
    remainingExecutions: d.remaining, status: d.revoked !== null ? 'REVOKED' : d.consumed !== null ? 'CONSUMED' : d.expires <= Date.now() || expiryObserved(store, d) ? 'EXPIRED' : 'ISSUED' };
  const r = record(store, requestId);
  if (!r) return { status: 'NOT_RESERVED', decisionId, requestId, decision: decisionState, complete: false };
  // Even an apparently live worker is not relaunched. PID liveness is advisory.
  const lease = store.db.prepare('SELECT owner,leaseUntil,pid FROM runs WHERE id=?').get(r.runId);
  let alive = false;
  try { if (lease.pid) { process.kill(Number(lease.pid), 0); alive = true; } } catch (e) { alive = e.code === 'EPERM'; }
  const uncertain = ['RESERVED','STARTED'].includes(r.state) && (!alive || lease.owner !== r.owner || lease.leaseUntil <= Date.now() || r.deadline <= Date.now());
  const terminal = ['LOCAL_PASSED', 'LOCAL_FAILED', 'INCONCLUSIVE'].includes(r.state);
  if (terminal) {
    const current = task(store, r.taskId), run = store.get(r.runId);
    if (!r.result || r.result.status !== r.state || run.state !== r.state ||
        hash(run.reservation) !== hash(r) || d.remaining !== 0 || d.consumed === null ||
        current.revision <= r.revision ||
        ((current.bootstrap.verifications?.[r.itemId] !== r.result.evidenceRef || current.bootstrap.states[r.itemId] !== r.state) && !completedRepairFor(store, r) && !completedEnvironmentRecoveryFor(store, r) && !archivedContractEvidence(store, current, r.itemId, r.result.evidenceRef)) ||
        !store.events(r.taskId).some(event => event.type === 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED' &&
          event.body.attemptId === r.runId && event.body.evidenceRef === r.result.evidenceRef && event.body.status === r.state)) throw Error('EVIDENCE_DEFECT: reservation finalization mismatch');
    const e = store.readArtifact(r.result.evidenceRef);
    if (hash(e.reservation) !== hash(r.identity) || e.taskRevision !== r.revision || e.command?.commandHash !== r.commandHash || e.status !== r.result.status || e.complete !== false || e.verifierIndependence !== 'UNPROTECTED' ||
        e.kind !== 'BootstrapLocalVerification' || e.taskId !== r.taskId || e.itemId !== r.itemId || e.workflowHash !== r.workflowHash ||
        e.authority !== 'LOCAL_EXECUTED' || e.protectedVerification !== 'UNSATISFIED' ||
        canonical(e.fileDigests) !== canonical(d.binding.fileDigests) || canonical(e.command) !== canonical(d.binding.command) ||
        e.observed?.authority !== 'LOCAL_EXECUTED' || e.observed.verifierIndependence !== 'UNPROTECTED' ||
        e.observed.contractHash !== r.workflowHash || e.observed.commandHash !== r.commandHash ||
        e.observed.candidateTreeHash !== r.identity.candidateTreeHash ||
        classifyLocalResult(e.observed, e.observed.integrity).status !== e.status ||
        ['exitCode', 'tests', 'passed', 'failed', 'skipped'].some(k => e.observed[k] !== r.result[k])) throw Error('EVIDENCE_DEFECT: reservation evidence mismatch');
    if (d.binding.environmentRecovery) {
      validateEnvironmentRecovery(store, d.binding, {requireReview:true});
      if (hash(e.environmentRecovery) !== hash(d.binding.environmentRecovery) ||
          hash(r.identity.environmentRecovery) !== hash(d.binding.environmentRecovery) || !e.policyObservations?.length)
        throw Error('EVIDENCE_DEFECT: environment recovery binding mismatch');
      for (const ref of e.policyObservations) {
        const observed = store.readArtifact(ref);
        if (!validRecoveryObservation(observed, d.binding.environmentRecovery.policy)) throw Error('EVIDENCE_DEFECT: policy observation mismatch');
      }
    }
  }
  // Older failed finalizations may contain an uncommitted result payload.
  // A handoff/active state never reconstructs success from that payload.
  if (!terminal) delete r.result;
  return { ...(r.result ?? {}), status: uncertain ? 'HUMAN_HANDOFF' : r.result?.status ?? r.state, reservation: r,
    decision: decisionState,
    reason: uncertain ? 'Uncertain effects; reconcile manually, never relaunch or refund' : r.reason ?? r.result?.reason,
    automaticReplay: false, complete: false };
}
function completedEnvironmentRecoveryFor(store, prior) {
  if (prior.state !== 'LOCAL_FAILED') return false;
  const rows = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(prior.taskId);
  return rows.some(row => {
    const next = JSON.parse(row.body), e = next.identity?.environmentRecovery;
    if (!e || e.priorRequestId !== prior.requestId || e.evidenceRef !== prior.result?.evidenceRef ||
        next.revision !== prior.revision + 1 || !['LOCAL_PASSED','LOCAL_FAILED','INCONCLUSIVE'].includes(next.state)) return false;
    // Validate the successor completely; its evidence never rewrites the failure.
    committedStatus(store, next.decisionId, next.requestId);
    return true;
  });
}
// Offline reservation mechanics only. Public execution of even pre-existing
// decisions is blocked; their issuance provenance cannot be authenticated.
export async function executeOfflineDecision(store, taskId, itemId, request, { decisionId, requestId, cancelled = () => false, hooks = {}, observePolicy } = {}) {
  enableReservations(store);
  const d = decision(store, decisionId), b = d.binding;
  exact(request, ['executable', 'args', 'directory', 'timeoutMs'], 'Decision request');
  if (d.requestId !== requestId || b.taskId !== taskId || b.itemId !== itemId ||
      canonical(request) !== canonical({ executable: b.command.executable, args: b.command.args, directory: b.command.directory, timeoutMs: b.command.timeoutMs })) throw Error('Decision request binding mismatch');
  if (record(store, requestId)) return reservationStatus(store, decisionId, requestId);
  validDecision(store, d);
  const inspected = await verifyTask(store, taskId, itemId, request);
  if (inspected.commandHash !== b.commandHash) throw Error('Approved candidate/command changed');
  const backend = localBackend();
  if ((await backend.capabilities()).status !== 'CONDITIONAL') throw Error('Local capability unavailable');
  const policyObservations = [];
  const inspectPolicy = async () => {
    if (b.environmentRecovery) policyObservations.push(store.artifact(await observeRecoveryPolicy(b.environmentRecovery, observePolicy)));
  };
  await inspectPolicy();
  // Persist wall deadlines for recovery, but never let a clock correction grant
  // extra live execution time. A restarted process still cannot replay a run.
  const monotonicStart = performance.now(), liveLimit = Math.min(b.timeBudgetMs, d.expires - Date.now());
  const r = tx(store, () => {
    if (record(store, requestId)) return null;
    requireCoordinatedWorkItem(store, taskId, itemId);
    const fresh = decision(store, decisionId); validDecision(store, fresh); const current = currentBinding(store, b);
    if (fresh.consumed !== null || fresh.remaining !== 1) throw Error('Decision already consumed');
    const prior = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(taskId).map(v => JSON.parse(v.body));
    const contractPrior=prior.filter(a=>a.identity?.workflowHash===b.workflowHash);
    const repairedFailure = b.repair && contractPrior.length === 1 && contractPrior[0].requestId === b.repair.priorRequestId && contractPrior[0].state === 'LOCAL_FAILED';
    const environmentFailure = b.environmentRecovery && contractPrior.length === 1 && contractPrior[0].requestId === b.environmentRecovery.priorRequestId && contractPrior[0].state === 'LOCAL_FAILED';
    if (prior.length >= current.settings.maxAttempts || (contractPrior.some(a => a.state !== 'LOCAL_PASSED') && !repairedFailure && !environmentFailure) ||
        b.command.timeoutMs > b.timeBudgetMs || prior.reduce((n,a) => n + a.reservedTimeMs, 0) + b.command.timeoutMs > current.settings.timeoutSeconds * 1000) throw Error('HUMAN_HANDOFF: execution/time/consecutive failure budget exhausted');
    const now = Date.now(), owner = randomUUID(), runId = 'bootstrap-attempt-' + randomUUID();
    const identity = { decisionId, requestId, attemptId: runId, taskId, itemId, revision: b.revision, workflowHash: b.workflowHash,
      candidateTreeHash: b.command.candidateTreeHash, commandHash: b.commandHash, owner, fence: owner,
      ...(b.environmentRecovery ? {environmentRecovery:b.environmentRecovery} : {}) };
    const value = { ...identity, identity, runId, state: 'RESERVED', reservedAt: now, deadline: Math.min(d.expires, now + b.timeBudgetMs), reservedExecutions: 1, reservedTimeMs: b.command.timeoutMs };
    store.db.prepare('INSERT INTO runs(id,body,owner,leaseUntil,pid) VALUES (?,?,?,?,?)').run(runId, JSON.stringify({ id: runId, kind: 'bootstrap-verification', state: 'RESERVED', contractHash: b.commandHash }), owner, now + 30000, process.pid);
    const repositoryKey = process.platform === 'win32' ? b.command.directory.toLowerCase() : b.command.directory;
    store.db.prepare('INSERT INTO bootstrap_reservations VALUES (?,?,?,?,?,?,?,?)').run(requestId, decisionId, runId, taskId, repositoryKey, b.revision, 'RESERVED', JSON.stringify(value));
    store.db.prepare('UPDATE bootstrap_decisions SET consumed=?,remaining=0 WHERE id=?').run(now, decisionId);
    store.event(taskId, 'BOOTSTRAP_EXECUTION_RESERVED', value); return value;
  });
  if (!r) return reservationStatus(store, decisionId, requestId);
  let heartbeat;
  try {
    await hooks.reserved?.(r);
    const liveBudget = () => {
      const now = Date.now(), elapsed = performance.now() - monotonicStart;
      if (now < r.reservedAt) throw Error(`Execution wall clock moved backwards: reserved=${r.reservedAt}, now=${now}, native=${new Date().getTime()}, monotonicElapsedMs=${elapsed}`);
      if (elapsed >= liveLimit) throw Error('Execution time/budget exhausted (monotonic deadline)');
    };
    const check = () => {
      liveBudget();
      if (cancelled()) throw Error('Execution cancelled; cannot commit success');
      fenced(store, r, b, 'STARTED');
    };
    const token = await backend.authorize(request, { reviewedCommandHash: b.commandHash, acknowledgeUnisolatedExecution: true });
    const result = await backend.verify({ ...request, token, contractHash: b.workflowHash,
      beforeSpawn: async spec => {
        await hooks.beforeSpawn?.(r);
        await inspectPolicy();
        const current = await verifyTask(store, taskId, itemId, request);
        if (current.commandHash !== b.commandHash || spec.commandHash !== b.commandHash || cancelled()) throw Error('Pre-spawn command/candidate or cancellation changed');
        if ((await backend.capabilities()).status !== 'CONDITIONAL') throw Error('Local capability unavailable');
        tx(store, () => { liveBudget(); fenced(store, r, b, 'RESERVED'); r.state = 'STARTED'; r.startedAt = Date.now(); write(store, r); store.event(taskId, 'BOOTSTRAP_EXECUTION_STARTED', r.identity); });
        heartbeat = setInterval(() => { try { check(); store.heartbeat(r.runId, r.owner); } catch {} }, 1000);
      },
      cancelled: () => { try { if (r.state === 'STARTED') check(); return cancelled(); } catch { return true; } }
    });
    await hooks.beforeEvidence?.(r);
    await inspectPolicy();
    const { log, stderr, status, reason, ...observed } = result;
    const evidence = { kind: 'BootstrapLocalVerification', schemaVersion: 1, taskId, itemId, workflowHash: b.workflowHash, taskRevision: b.revision,
      reservation: r.identity, fileDigests: b.fileDigests, command: b.command, status, reason, observed, log, stderr,
      ...(b.environmentRecovery ? {environmentRecovery:b.environmentRecovery, policyObservations} : {}),
      authority: 'LOCAL_EXECUTED', verifierIndependence: 'UNPROTECTED', protectedVerification: 'UNSATISFIED', complete: false, recordedAt: new Date().toISOString() };
    const evidenceRef = store.artifact(evidence);
    // Preserve artifact reference even if the final fence refuses attachment.
    store.event(taskId, 'BOOTSTRAP_EXECUTION_EVIDENCE_OBSERVED', { ...r.identity, evidenceRef });
    await hooks.beforeCommit?.(r, evidenceRef);
    if (b.environmentRecovery) await observeRecoveryPolicy(b.environmentRecovery, observePolicy);
    tx(store, () => {
      check(); const current = task(store, taskId);
      if (hash(store.readArtifact(evidenceRef)) !== hash(evidence)) throw Error('EVIDENCE_DEFECT: observed evidence changed before commit');
      const next = { ...current, revision: current.revision + 1, bootstrap: { ...current.bootstrap, digests: b.fileDigests,
        states: { ...current.bootstrap.states, [itemId]: status }, verifications: { ...current.bootstrap.verifications, [itemId]: evidenceRef } } };
      if (store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=? AND revision=?').run(JSON.stringify(next), next.revision, taskId, b.revision).changes !== 1) throw Error('Task revision conflict');
      const finalized = { ...r, state: status, finishedAt: Date.now(), result: { status, reason, itemId, evidenceRef, commandHash: b.commandHash, exitCode: result.exitCode, tests: result.tests, passed: result.passed, failed: result.failed, skipped: result.skipped,
        authority: 'LOCAL_EXECUTED', verifierIndependence: 'UNPROTECTED', protectedVerification: 'UNSATISFIED', complete: false } };
      write(store, finalized); store.event(taskId, 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED', { ...r.identity, status, evidenceRef });
    });
  } catch (e) {
    // Never overwrite another owner's state. Retain consumed budget and effects.
    tx(store, () => {
      const lease = store.db.prepare('SELECT owner FROM runs WHERE id=?').get(r.runId);
      if (lease?.owner === r.owner) { r.state = 'HUMAN_HANDOFF'; r.reason = e.message; write(store, r); }
      store.event(taskId, 'BOOTSTRAP_EXECUTION_HANDOFF', { ...r.identity, reason: e.message });
    });
  } finally { clearInterval(heartbeat); store.release(r.runId, r.owner); }
  return reservationStatus(store, decisionId, requestId);
}
