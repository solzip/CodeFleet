import { mkdir, writeFile, readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { validateContract, applyEdits, hash } from './contract.mjs';
import { judge, isFailingBaseline } from './judge.mjs';
import { repository, snapshot, context, candidateHash } from './workspace.mjs';
import { propose } from './provider.mjs';
import { ProviderError, requireProposal } from '../providers/interface.mjs';
import { createRegistry, selectProvider } from '../providers/registry.mjs';
import { readyBatch, validateWorkflow } from '../workflow/definition.mjs';
import { delegate, sendMessage, receiveMessages } from '../workflow/collaboration.mjs';
import * as workflowStore from '../workflow/persistence.mjs';
import { verify, dockerReady, cleanupContainer, matchTestIdentity } from './verifier.mjs';
import { deliver } from './delivery.mjs';

export async function createRun(store, repo, input) {
  const contract = validateContract(input);
  const selected = await repository(repo);
  const id = randomUUID();
  return store.create({ id, ...selected, contract, contractHash: hash(contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0, createdAt: new Date().toISOString() });
}

// Trusted host seam, not a provider/plugin permission surface. propose returns
// untrusted edits and cost; verify returns Harness evidence. Only this coordinator
// binds candidate/contract identity, records verdicts and advances durable state.
// Keep lease, budget and reconciliation guards here when replacing a service.
export async function execute(store, id, dependencies = {}, options = {}) {
  const initial = store.get(id);
  if (initial.kind === 'workflow') return executeWorkflow(store, id, dependencies, options);
  if (initial.workflowParent) {
    const parent = store.db.prepare('SELECT owner,leaseUntil FROM runs WHERE id=?').get(initial.workflowParent);
    if (!options.workflowOwner || parent.owner !== options.workflowOwner || parent.leaseUntil <= Date.now()) throw Error('Workflow child requires its active coordinator');
    const current = store.get(initial.workflowParent);
    workflowStore.approval(store, current);
    if (current.contract.schemaVersion === 2) {
      const attempt = workflowStore.attempts(store, current.id).find(a => a.childId === id);
      if (initial.workflowFence !== options.workflowOwner || initial.workflowRevision !== current.revision || initial.workflowGraphHash !== current.contractHash || initial.state !== 'READY' || initial.attempts !== 0 || attempt?.status !== 'STARTED') throw Error('Stale or previously launched hybrid attempt');
    }
  }
  const services = { snapshot, context, candidateHash, propose, verify, ready: dockerReady, cleanupContainer, deliver, ...dependencies };
  const owner = store.claim(id, options);
  let run = store.get(id); const entered = Date.now(); const beforeMs = run.elapsedMs;
  let leaseLost = false;
  const heartbeat = setInterval(() => { if (!store.heartbeat(id, owner)) leaseLost = true; }, 5000);
  const cancelled = () => {
    if (leaseLost || store.db.prepare('SELECT owner FROM runs WHERE id=?').get(id).owner !== owner || store.get(id).control !== 'run') return true;
    if (!run.workflowParent) return false;
    const parent = store.db.prepare('SELECT owner,leaseUntil,control FROM runs WHERE id=?').get(run.workflowParent);
    const current = store.get(run.workflowParent);
    if (parent.owner !== options.workflowOwner || parent.leaseUntil <= Date.now() || parent.control !== 'run' || (run.workflowRevision && current.revision !== run.workflowRevision)) return true;
    try { workflowStore.approval(store, current); } catch { return true; }
    return false;
  };
  const remaining = () => run.contract.timeoutSeconds * 1000 - beforeMs - (Date.now() - entered);
  const save = (state, reason, event = state) => {
    run.state = state; run.reason = reason; run.elapsedMs = beforeMs + Date.now() - entered;
    store.save(run, owner, event);
  };
  const guard = () => {
    if (leaseLost) throw Error('Worker lease lost');
    if (hash(run.contract) !== run.contractHash) throw Error('Contract integrity mismatch');
    if (cancelled()) throw Error('Operator requested pause or cancel');
    if (remaining() <= 0) throw Error('Total execution time budget exhausted');
  };
  try {
    if (['COMPLETED', 'CANCELLED'].includes(run.state)) return run;
    if (['DELIVERING', 'RECONCILING'].includes(run.state)) {
      const readDeadline = Date.now() + 60000;
      const readOnly = remaining() <= 0 || run.control === 'cancel';
      const reconciliationGuard = (phase) => {
        if (leaseLost) throw Error('Worker lease lost');
        if (hash(run.contract) !== run.contractHash) throw Error('Contract integrity mismatch');
        if (Date.now() >= readDeadline) throw Error('Read-only reconciliation time budget exhausted');
        const control = store.get(id).control;
        if (control === 'pause') throw Error('Operator requested pause');
        if (phase !== 'BEFORE_REMOTE_LOOKUP') {
          if (readOnly || control === 'cancel') throw Error('Reconciliation is read-only; no new remote writes');
          guard();
        }
      };
      reconciliationGuard('BEFORE_REMOTE_LOOKUP');
      const accepted = store.readArtifact(run.acceptedHash);
      const evidence = store.readArtifact(run.evidenceHash);
      if (accepted.candidateHash !== run.candidateHash || evidence.candidateHash !== run.candidateHash || judge(evidence).outcome !== 'ACCEPT') throw Error('Accepted evidence does not match delivery intent');
      run.delivery = await services.deliver(run, accepted.changedFiles, undefined, reconciliationGuard, { readOnly, deadline: readDeadline });
      save('COMPLETED', 'Existing remote PR confirmed; no new model invocation'); return run;
    }
    guard();
    if (run.state === 'GENERATING') {
      // A worker disappeared after reserving a billable attempt. The reserved
      // attempt stays consumed and its cost cannot be assumed to be zero.
      if (!run.costPending) run.unknownCostAttempts += 1; // pre-reservation legacy state
      run.costPending = false;
      save('READY', 'Recovered interrupted provider attempt; cost unknown', 'RECOVERED_PROVIDER');
    }
    await services.ready(run.contract.verification); guard();
    if (run.containerName) await services.cleanupContainer(run.containerName);
    const directory = await mkdtemp(path.join(tmpdir(), 'codefleet-candidate-'));
    run.candidateDirectory = directory;
    const names = await services.snapshot(run.repo, run.base, directory); guard();
    run.candidatePaths = names;
    const originalContext = await services.context(directory, run.contract);
    const originals = Object.fromEntries(run.contract.files.map(f => [f, originalContext[f]]));
    const manifestHash = hash(originalContext);
    if (run.contextHash && run.contextHash !== manifestHash) throw Error('Pinned context changed');
    run.contextHash = manifestHash;
    if (!run.baselineHash) {
      run.containerName = `codefleet-${run.id}-baseline`;
      save('BASELINE', 'Checking protected regression tests before generating a change');
      const baseline = await services.verify({ directory, contract: run.contract, tests: run.contract.tests, timeoutMs: Math.min(remaining(), run.contract.verification ? 600000 : 120000), cancelled, containerName: run.containerName });
      guard(); run.baselineHash = store.artifact(baseline);
    }
    const baseline = store.readArtifact(run.baselineHash);
    if (!isFailingBaseline(baseline)) {
      save('WAITING_HUMAN', 'Alpha requires an executed failing regression test before code generation. Add a test for the requested behavior and create a new run.'); return run;
    }
    let current = { ...originals }; let feedback = null;
    if (run.proposalHash) {
      const previous = store.readArtifact(run.proposalHash);
      current = applyEdits(run.contract, originals, previous.proposal);
      feedback = run.lastEvidenceHash ? store.readArtifact(run.lastEvidenceHash) : null;
    }
    let pendingVerification = Boolean(run.pendingVerification || run.state === 'VERIFYING');
    while (pendingVerification || run.attempts < run.contract.maxAttempts) {
      guard();
      if (!pendingVerification) {
        run.attempts += 1;
        run.unknownCostAttempts += 1; run.costPending = true;
        save('GENERATING', 'Attempt and unknown cost reserved before provider invocation');
        // Each proposal is against the pinned original, so restart and replacement
        // do not depend on a half-written candidate directory.
        const response = await services.propose({ contract: run.contract, files: originalContext, feedback, timeoutMs: Math.min(remaining(), 180000), cancelled });
        if (Number.isFinite(response.cost) && response.cost >= 0) {
          run.unknownCostAttempts -= 1; run.reportedCostUsd += response.cost;
        }
        run.costPending = false;
        guard();
        if (response.kind === 'ProviderExecutionResult') run.lastProviderResultHash = store.artifact(response);
        current = applyEdits(run.contract, originals, response.proposal);
        const changedFiles = Object.fromEntries(Object.entries(current).filter(([name, body]) => body !== originals[name]));
        if (!Object.keys(changedFiles).length) throw Error('No effective change proposed');
        const proposedHash = hash(changedFiles);
        if (run.lastProposalDigest === proposedHash) { save('WAITING_HUMAN', 'Repeated identical proposal; no progress'); return run; }
        run.lastProposalDigest = proposedHash;
        run.proposalHash = store.artifact(response);
        run.pendingVerification = true;
      }
      const changedFiles = Object.fromEntries(Object.entries(current).filter(([name, body]) => body !== originals[name]));
      for (const [name, body] of Object.entries(current)) await writeFile(path.join(directory, name), body);
      run.candidateHash = await services.candidateHash(directory, names);
      run.containerName = `codefleet-${run.id}-attempt-${run.attempts}`;
      save('VERIFYING', 'Candidate fixed; running protected tests');
      const evidence = await services.verify({ directory, contract: run.contract, tests: run.contract.tests, timeoutMs: Math.min(remaining(), run.contract.verification ? 600000 : 120000), cancelled, containerName: run.containerName });
      guard();
      evidence.candidateHash = run.candidateHash;
      evidence.integrity = run.candidateHash === await services.candidateHash(directory, names);
      evidence.contractHash = run.contractHash;
      evidence.testIdentityMatch = matchTestIdentity(baseline, evidence);
      run.lastEvidenceHash = store.artifact(evidence);
      const decision = judge(evidence); run.decisionHash = store.artifact(decision);
      if (decision.outcome === 'ESCALATE') { save('WAITING_HUMAN', decision.reason); return run; }
      if (decision.outcome === 'ACCEPT') {
        run.evidenceHash = run.lastEvidenceHash;
        run.acceptedHash = store.artifact({ changedFiles, candidateHash: run.candidateHash, contractHash: run.contractHash });
        if (run.contract.delivery.mode === 'local') {
          save('COMPLETED', 'Verified change available in content-addressed local artifacts; original repository unchanged'); return run;
        }
        save('DELIVERING', 'PR intent persisted before remote effects'); guard();
        run.delivery = await services.deliver(run, changedFiles, undefined, guard);
        save('COMPLETED', 'Remote PR confirmed'); return run;
      }
      feedback = { ...evidence, previousProposal: store.readArtifact(run.proposalHash).proposal };
      pendingVerification = false; run.pendingVerification = false;
      save('READY', 'Regression still fails; retry within unchanged contract');
    }
    save('WAITING_HUMAN', 'Attempt budget exhausted; inspect evidence and create a revised contract if needed');
    return run;
  } catch (error) {
    const control = store.get(id).control;
    if (leaseLost) throw error;
    if (error instanceof ProviderError) {
      run.lastProviderResultHash = store.artifact(error.result);
      // Schema rejection happens in the adapter now. Keep cost already reported
      // by the provider even when its proposed edits are invalid (V1 behavior).
      if (run.costPending && Number.isFinite(error.result.cost) && error.result.cost >= 0) {
        run.unknownCostAttempts -= 1; run.reportedCostUsd += error.result.cost; run.costPending = false;
      }
    }
    const state = ['DELIVERING', 'RECONCILING'].includes(run.state) ? 'RECONCILING' : control === 'cancel' ? 'CANCELLED' : control === 'pause' ? 'PAUSED' : 'WAITING_HUMAN';
    save(state, error.message); return run;
  } finally {
    clearInterval(heartbeat); store.release(id, owner);
  }
}

// Workflow is a scheduling branch of the same coordinator. Every candidate,
// including final integration, still traverses execute/Verifier/Judge above.
async function executeWorkflow(store, id, dependencies, options) {
  const source = store.readArtifact(store.get(id).sourceRef);
  const owner = store.claim(id, options), entered = Date.now();
  let run = store.get(id), activeChildren = new Set(), leaseLost = false;
  const before = Math.max(run.elapsedMs, workflowStore.attempts(store, id).reduce((sum, a) => sum + store.get(a.childId).elapsedMs, 0));
  const heartbeat = setInterval(() => {
    try {
      if (!store.heartbeat(id, owner)) leaseLost = true;
      const control = store.get(id).control;
      let authorized = true; try { workflowStore.approval(store, run); } catch { authorized = false; }
      if (leaseLost || !authorized || control !== 'run' || before + Date.now() - entered >= source.timeoutSeconds * 1000) for (const child of activeChildren) store.control(child, control === 'pause' ? 'pause' : 'cancel');
    } catch { leaseLost = true; }
  }, 250);
  const save = (state, reason) => {
    run.state = state; run.reason = reason; run.elapsedMs = before + Date.now() - entered;
    store.save(run, owner, 'WORKFLOW_' + state); return run;
  };
  const guard = () => {
    if (leaseLost || store.get(id).control !== 'run') throw Error('Coordinator lease lost or operator control');
    validateWorkflow(run.contract, source); workflowStore.approval(store, run);
    if (run.contractHash !== run.contract.workflowHash || hash(store.readArtifact(run.graphRef)) !== hash(run.contract)) throw Error('Graph snapshot integrity mismatch');
    if (before + Date.now() - entered >= source.timeoutSeconds * 1000) throw Error('Workflow time budget exhausted');
  };
  const accepted = child => {
    if (run.contract.schemaVersion === 2 && (child.base !== run.base || child.workflowParent !== run.id || child.workflowRevision !== run.revision || child.workflowGraphHash !== run.contractHash)) throw Error('ChangeSet base/revision mismatch');
    if (child.state !== 'COMPLETED' || hash(child.contract) !== child.contractHash) throw Error('Child did not complete a fixed contract');
    if (run.contract.schemaVersion === 2) {
      const node = run.contract.items.find(n => n.id === child.workflowItemId);
      const final = child.workflowItemId === 'final';
      if (!final && !node) throw Error('Unknown ChangeSet WorkItem');
      const expected = { ...source, files: final ? source.files : node.files, tests: final ? source.tests : node.tests, maxAttempts: 1 };
      if (hash(expected) !== child.contractHash) throw Error('ChangeSet contract differs from approved WorkItem');
    }
    const patch = store.readArtifact(child.acceptedHash), evidence = store.readArtifact(child.evidenceHash);
    if (patch.contractHash !== child.contractHash || evidence.contractHash !== child.contractHash || patch.candidateHash !== child.candidateHash || evidence.candidateHash !== child.candidateHash || judge(evidence).outcome !== 'ACCEPT' || !isFailingBaseline(store.readArtifact(child.baselineHash))) throw Error('Child verification evidence invalid');
    if (Object.keys(patch.changedFiles).some(f => !child.contract.files.includes(f))) throw Error('Accepted patch outside contract');
    return patch;
  };
  try {
    if (run.state === 'COMPLETED' && run.contract.schemaVersion === 2) {
      const child = store.get(run.finalRunId); accepted(child);
      if (!child.candidatePaths || await candidateHash(child.candidateDirectory, child.candidatePaths) !== child.candidateHash) throw Error('Final candidate tree changed after verification');
    }
    if (['COMPLETED', 'CANCELLED'].includes(run.state)) return run;
    validateWorkflow(run.contract, source);
    if (hash(store.readArtifact(run.graphRef)) !== hash(run.contract)) throw Error('Graph snapshot integrity mismatch');
    // A STARTED record may be a launch window, live child or lost response. Never
    // replay it. Completed children can be reconciled solely from stored evidence.
    for (const attempt of workflowStore.attempts(store, id).filter(a => a.status === 'STARTED')) {
      const child = store.get(attempt.childId);
      if (child.state !== 'COMPLETED') return save('RECONCILING', 'Unconfirmed child execution; no automatic relaunch');
      accepted(child);
      if (attempt.itemId === 'final') { run.acceptedHash = child.acceptedHash; run.evidenceHash = child.evidenceHash; run.candidateHash = child.candidateHash; run.finalRunId = child.id; run.finalContractHash = child.contractHash; }
      else run.states[attempt.itemId] = 'SUCCEEDED';
      workflowStore.finish(store, run, owner, attempt, 'SUCCEEDED');
    }
    const selectedRepo = await repository(run.repo); guard();
    if (selectedRepo.base !== run.base) throw Error('Workflow baseline changed');
    const registry = dependencies.workflowRegistry ?? createRegistry();
    const choose = async () => {
      const reports = []; for (const adapter of registry.values()) reports.push(await adapter.probe());
      guard();
      return selectProvider(registry, reports, { required: run.contract.requiredCapabilities, requested: run.providerId });
    };
    while (true) {
      guard();
      const records = workflowStore.attempts(store, id);
      run.attempts = records.filter(a => a.itemId !== 'final').length;
      run.reportedCostUsd = records.reduce((s, a) => s + store.get(a.childId).reportedCostUsd, 0);
      run.unknownCostAttempts = records.reduce((s, a) => s + store.get(a.childId).unknownCostAttempts, 0);
      if (run.unknownCostAttempts || run.reportedCostUsd > source.maxAttempts * source.attemptBudgetUsd) return save('WAITING_HUMAN', 'Workflow cost unknown or exhausted');
      if (records.some(a => a.status !== 'SUCCEEDED')) return save('WAITING_HUMAN', 'A previous attempt failed; descendants blocked');
      if (run.finalRunId) {
        const finalChild = store.get(run.finalRunId); accepted(finalChild);
        if (run.contract.schemaVersion === 2 && (!finalChild.candidatePaths || await candidateHash(finalChild.candidateDirectory, finalChild.candidatePaths) !== finalChild.candidateHash)) throw Error('Final candidate tree changed after verification');
        guard();
        return save('COMPLETED', 'All required WorkItems and integrated candidate independently verified; local artifacts only');
      }
      for (const n of run.contract.items) if (run.states[n.id] !== 'SUCCEEDED') run.states[n.id] = n.dependencies.every(d => run.states[d] === 'SUCCEEDED') ? 'READY' : 'BLOCKED';
      const nodes = readyBatch(run.contract, run.states);
      const final = run.contract.items.every(n => run.states[n.id] === 'SUCCEEDED');
      run.workflowStagesComplete = final;
      if (!nodes.length && !final) return save('WAITING_HUMAN', 'Dependencies not satisfied');
      const selection = await choose(); run.providerId ??= selection.providerId;
      const changes = {};
      if (final) for (const a of records) {
        const child = store.get(a.childId), patch = accepted(child);
        for (const [file, body] of Object.entries(patch.changedFiles)) {
          if (Object.hasOwn(changes, file)) throw Error('ChangeSet file conflict');
          changes[file] = body;
        }
      }
      if (final) run.integrationHash = store.artifact({ base: run.base, revision: run.revision, graphHash: run.contractHash, children: records.map(a => a.childId), changes });
      save(final ? 'VERIFYING' : 'RUNNING', final ? 'Serial integration candidate' : 'Dependency-ready batch');
      const batch = [];
      // Reserve before launching; a crash in this window remains unresolved and
      // cannot replay a potentially billable attempt.
      for (const node of final ? [null] : nodes) {
        const itemId = final ? 'final' : node.id;
        const contract = validateContract({ ...source, files: final ? source.files : node.files, tests: final ? source.tests : node.tests, maxAttempts: 1 });
        const child = workflowStore.reserve(store, run, owner, itemId, contract);
        activeChildren.add(child.id);
        batch.push({ node, itemId, child });
        if (!final) run.states[itemId] = 'RUNNING';
      }
      const responses = await Promise.allSettled(batch.map(async ({ node, child }) => {
        const channels = run.contract.schemaVersion === 2 && !final
          ? Object.fromEntries(Object.keys(node.roles).map(role => {
            const token = delegate(store, run.id, child.id, owner, role);
            return [role, { assignment: token.assignment, send: message => sendMessage(store, token, message), read: correlationId => receiveMessages(store, token, correlationId) }];
          })) : null;
        if (channels && dependencies.collaborate) await dependencies.collaborate(channels);
        return execute(store, child.id, { ...dependencies, propose: async request => {
          guard();
          if (final) return { cost: 0, proposal: { summary: 'Host integration of independently verified disjoint edits', edits: Object.entries(changes).map(([file, body]) => ({ path: file, oldText: request.files[file], newText: body })) } };
          await choose();
          return requireProposal(await registry.get(selection.providerId).execute(request));
        } }, { workflowOwner: owner });
      }));
      let failed = false;
      // Results are reduced in deterministic reservation order, never completion
      // order. One failure cannot erase unrelated verified results.
      for (let i = 0; i < batch.length; i++) {
        const { child, itemId } = batch[i], outcome = responses[i];
        activeChildren.delete(child.id);
        let success = false;
        if (outcome.status === 'fulfilled') try { accepted(outcome.value); success = true; } catch {}
        if (!final) run.states[itemId] = success ? 'SUCCEEDED' : 'BLOCKED';
        if (success && final) {
          const response = outcome.value;
          run.finalRunId = child.id; run.finalContractHash = child.contractHash;
          run.acceptedHash = response.acceptedHash; run.evidenceHash = response.evidenceHash; run.candidateHash = response.candidateHash;
        }
        workflowStore.finish(store, run, owner, { itemId }, success ? 'SUCCEEDED' : 'FAILED');
        failed ||= !success;
      }
      guard();
      if (failed) {
        for (const n of run.contract.items) if (run.states[n.id] !== 'SUCCEEDED') run.states[n.id] = 'BLOCKED';
        return save('WAITING_HUMAN', 'Child verification/approval failed; subsequent WorkItems blocked');
      }
    }
  } catch (error) {
    if (leaseLost) throw error;
    const control = store.get(id).control;
    if (run.contract.schemaVersion === 2) { delete run.acceptedHash; delete run.evidenceHash; delete run.candidateHash; }
    return save(control === 'cancel' ? 'CANCELLED' : control === 'pause' ? 'PAUSED' : 'WAITING_HUMAN', error.message);
  } finally { clearInterval(heartbeat); store.release(id, owner); }
}
