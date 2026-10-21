import path from 'node:path';
import { verifiedEvidence } from '../alpha/evidence.mjs';
import { attempts, approval } from '../workflow/persistence.mjs';
import { judge } from '../alpha/judge.mjs';
import { messages } from '../workflow/collaboration.mjs';
import { task, bootstrapView, clarifiableFor } from './tasks.mjs';

function bootstrapNext(current, plan) {
  if (current.state === 'REJECTED') return 'Create a new plan';
  const open = clarifiableFor(current, plan).filter(u => u.status === 'OPEN').map(u => u.id);
  if (!current.bootstrap && open.length) return `An operator must confirm the objective's meaning with objective clarify (${open.join(', ')}); a planner cannot clear it. Other unknowns need a BootstrapDraft`;
  if (current.bootstrap) return 'Propose a fileset for a dependency-ready local-edit item, obtain objective approve on its filesetHash, then objective materialize; git init/commit stay user actions';
  return current.state === 'VALIDATED' ? 'Prepare the bootstrap workflow' : 'Submit a BootstrapDraft; planned files are not existing code';
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
    return { schemaVersion: 1, kind: 'TaskReport', taskId: id, revision: current.revision, contractKind: 'NEW_PROJECT', state: current.state, reviewState: current.state, plannerAttempt: current.plannerAttempt ?? null, plan, settings: current.settings, run: null,
      bootstrap: current.bootstrap && current.state !== 'REJECTED' ? bootstrapView(store, id) : null, nextAction: bootstrapNext(current, plan), workflowHash: current.bootstrap?.workflowHash ?? null,
      verification: 'NOT_RUN', complete: false };
  }
  return { schemaVersion: 1, kind: 'TaskReport', taskId: id, revision: current.revision, state: current.state === 'REJECTED' ? 'REJECTED' : run?.state ?? current.state, reviewState: current.state, plannerAttempt: current.plannerAttempt ?? null, plan, settings: current.settings, run,
    nextAction: current.state === 'REJECTED' ? 'Create a new plan' : !current.runId ? 'Review scope, then run to prepare a workflow' : 'Approve the exact workflow hash, then run with explicit model consent',
    workflowHash: current.runId ? store.get(current.runId).contractHash : null };
}
