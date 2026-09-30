import { mkdir, writeFile, readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { validateContract, applyEdits, judge, hash } from './contract.mjs';
import { repository, snapshot, context, candidateHash } from './workspace.mjs';
import { propose } from './provider.mjs';
import { verify, dockerReady, cleanupContainer } from './verifier.mjs';
import { deliver } from './delivery.mjs';

export async function createRun(store, repo, input) {
  const contract = validateContract(input);
  const selected = await repository(repo);
  const id = randomUUID();
  return store.create({ id, ...selected, contract, contractHash: hash(contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0, createdAt: new Date().toISOString() });
}

export async function execute(store, id, dependencies = {}) {
  const services = { snapshot, context, candidateHash, propose, verify, ready: dockerReady, cleanupContainer, deliver, ...dependencies };
  const owner = store.claim(id);
  let run = store.get(id); const entered = Date.now(); const beforeMs = run.elapsedMs;
  let leaseLost = false;
  const heartbeat = setInterval(() => { if (!store.heartbeat(id, owner)) leaseLost = true; }, 5000);
  const cancelled = () => leaseLost || store.get(id).control !== 'run';
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
    guard();
    if (run.state === 'GENERATING') {
      // A worker disappeared after reserving a billable attempt. The reserved
      // attempt stays consumed and its cost cannot be assumed to be zero.
      run.unknownCostAttempts += 1;
      save('READY', 'Recovered interrupted provider attempt; cost unknown', 'RECOVERED_PROVIDER');
    }
    // Recover delivery by querying the same remote branch/PR. Never generate a
    // new proposal or a new branch after an uncertain external write.
    if (['DELIVERING', 'RECONCILING'].includes(run.state)) {
      const accepted = store.readArtifact(run.acceptedHash);
      const evidence = store.readArtifact(run.evidenceHash);
      if (accepted.candidateHash !== run.candidateHash || evidence.candidateHash !== run.candidateHash || judge(evidence).outcome !== 'ACCEPT') throw Error('Accepted evidence does not match delivery intent');
      run.delivery = await services.deliver(run, accepted.changedFiles, undefined, guard);
      save('COMPLETED', 'Remote PR confirmed'); return run;
    }
    await services.ready(); guard();
    if (run.containerName) await services.cleanupContainer(run.containerName);
    const directory = await mkdtemp(path.join(tmpdir(), 'codefleet-candidate-'));
    run.candidateDirectory = directory;
    const names = await services.snapshot(run.repo, run.base, directory); guard();
    const originalContext = await services.context(directory, run.contract);
    const originals = Object.fromEntries(run.contract.files.map(f => [f, originalContext[f]]));
    const manifestHash = hash(originalContext);
    if (run.contextHash && run.contextHash !== manifestHash) throw Error('Pinned context changed');
    run.contextHash = manifestHash;
    if (!run.baselineHash) {
      run.containerName = `codefleet-${run.id}-baseline`;
      save('BASELINE', 'Checking protected regression tests before generating a change');
      const baseline = await services.verify({ directory, tests: run.contract.tests, timeoutMs: Math.min(remaining(), 120000), cancelled, containerName: run.containerName });
      guard(); run.baselineHash = store.artifact(baseline);
    }
    const baseline = store.readArtifact(run.baselineHash);
    if (baseline.exitCode === 0 || !(baseline.tests > 0) || !(baseline.failed > 0) || baseline.interrupted || baseline.truncated) {
      save('WAITING_HUMAN', 'Alpha requires an executed failing regression test before code generation. Add a test for the requested behavior and create a new run.'); return run;
    }
    let current = { ...originals }; let feedback = null;
    if (run.proposalHash) {
      const previous = store.readArtifact(run.proposalHash);
      current = applyEdits(run.contract, originals, previous.proposal);
      feedback = run.lastEvidenceHash ? store.readArtifact(run.lastEvidenceHash) : null;
    }
    while (run.attempts < run.contract.maxAttempts) {
      guard(); run.attempts += 1; save('GENERATING', 'Attempt reserved before provider invocation');
      // Each proposal is against the pinned original, so restart and replacement
      // do not depend on a half-written candidate directory.
      const response = await services.propose({ contract: run.contract, files: originalContext, feedback, timeoutMs: Math.min(remaining(), 180000), cancelled });
      guard();
      if (response.cost === null) run.unknownCostAttempts += 1; else run.reportedCostUsd += response.cost;
      current = applyEdits(run.contract, originals, response.proposal);
      const changedFiles = Object.fromEntries(Object.entries(current).filter(([name, body]) => body !== originals[name]));
      if (!Object.keys(changedFiles).length) throw Error('No effective change proposed');
      const proposedHash = hash(changedFiles);
      if (run.lastProposalDigest === proposedHash) { save('WAITING_HUMAN', 'Repeated identical proposal; no progress'); return run; }
      run.lastProposalDigest = proposedHash;
      run.proposalHash = store.artifact(response);
      for (const [name, body] of Object.entries(current)) await writeFile(path.join(directory, name), body);
      run.candidateHash = await services.candidateHash(directory, names);
      run.containerName = `codefleet-${run.id}-attempt-${run.attempts}`;
      save('VERIFYING', 'Candidate fixed; running protected tests');
      const evidence = await services.verify({ directory, tests: run.contract.tests, timeoutMs: Math.min(remaining(), 120000), cancelled, containerName: run.containerName });
      guard();
      evidence.candidateHash = run.candidateHash;
      evidence.integrity = run.candidateHash === await services.candidateHash(directory, names);
      evidence.contractHash = run.contractHash;
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
      feedback = { ...evidence, previousProposal: response.proposal };
      save('READY', 'Regression still fails; retry within unchanged contract');
    }
    save('WAITING_HUMAN', 'Attempt budget exhausted; inspect evidence and create a revised contract if needed');
    return run;
  } catch (error) {
    const control = store.get(id).control;
    if (leaseLost) throw error;
    const state = ['DELIVERING', 'RECONCILING'].includes(run.state) ? 'RECONCILING' : control === 'cancel' ? 'CANCELLED' : control === 'pause' ? 'PAUSED' : 'WAITING_HUMAN';
    save(state, error.message); return run;
  } finally {
    clearInterval(heartbeat); store.release(id, owner);
  }
}
