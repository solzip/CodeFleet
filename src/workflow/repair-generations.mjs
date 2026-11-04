// Additive immutable Repair Attempt generations for existing Workflow Store.
// The original workflow_attempts(runId,itemId) PK and rows remain untouched.
// This extension is opt-in; no Host invocation or public permission promotion.
import { randomUUID } from 'node:crypto';
import { hash, validateContract } from '../alpha/contract.mjs';
import { approval, attempts } from './persistence.mjs';
import { policyFor } from './definition.mjs';
import { workflowGuard } from '../hosts/workflow-authorization.mjs';

const table = 'workflow_attempt_generations';
export function hasRepairStorage(store) {
  return Boolean(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
export function repairRows(store, runId = null) {
  if (!hasRepairStorage(store)) return [];
  const sql = runId
    ? 'SELECT * FROM workflow_attempt_generations WHERE runId=? ORDER BY rowid'
    : 'SELECT * FROM workflow_attempt_generations ORDER BY rowid';
  return runId ? store.db.prepare(sql).all(runId) : store.db.prepare(sql).all();
}
export function enableRepairStorage(store) {
  if (store.readOnly) throw Error('Cannot migrate read-only Store');
  store.enableWorkflows();
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.exec(`CREATE TABLE IF NOT EXISTS workflow_attempt_generations (
      runId TEXT NOT NULL REFERENCES runs(id),
      itemId TEXT NOT NULL,
      generation INTEGER NOT NULL CHECK(generation >= 2),
      childId TEXT NOT NULL UNIQUE REFERENCES runs(id),
      revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      repairOfChildId TEXT NOT NULL REFERENCES runs(id),
      repairOfEvidenceRef TEXT NOT NULL,
      PRIMARY KEY(runId,itemId,generation)
    );`);
    store.db.exec('COMMIT');
  } catch(error) { store.db.exec('ROLLBACK'); throw error; }
}
export function reserveRepairGeneration(store, run, owner, itemId, contract, {
  expectedFailureEvidenceRef, maxGenerations = 2
} = {}) {
  if (!hasRepairStorage(store)) throw Error('Repair storage not enabled');
  if (!Number.isSafeInteger(maxGenerations) || maxGenerations < 2 || maxGenerations > 5)
    throw Error('Repair generation limit must be 2..5');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    approval(store, run);
    const rows = attempts(store, run.id).filter(a => a.itemId === itemId);
    const last = rows.at(-1);
    if (!last || last.status !== 'FAILED' || rows.some(a => a.status === 'STARTED') ||
        rows.length >= maxGenerations) throw Error('Repair requires terminal failed Attempt and unused bounded generation');
    const allRunning = [
      ...store.db.prepare("SELECT * FROM workflow_attempts WHERE status='STARTED'").all(),
      ...repairRows(store).filter(a=>a.status==='STARTED')
    ];
    if (allRunning.length) throw Error('Active effect exists; no concurrent Repair reservation');
    const row = store.db.prepare('SELECT owner,leaseUntil,control,body FROM runs WHERE id=?').get(run.id);
    if (row?.owner !== owner || row.leaseUntil <= Date.now() || row.control !== 'run' ||
        JSON.parse(row.body).revision !== run.revision) throw Error('Coordinator lease/control/revision changed');
    const node = run.contract.items.find(n => n.id === itemId);
    if (!node || run.states[itemId] !== 'READY' ||
        node.dependencies.some(d => run.states[d] !== 'SUCCEEDED') ||
        last.revision !== run.revision) throw Error('Repair predecessor/revision eligibility changed');
    const source = store.readArtifact(run.sourceRef);
    const expected = validateContract({ ...source, files: node.files, tests: node.tests, maxAttempts: 1 });
    if (hash(expected) !== hash(contract)) throw Error('Repair expanded approved WorkItem contract');
    const old = store.get(last.childId);
    if (!old.lastEvidenceHash || old.lastEvidenceHash !== expectedFailureEvidenceRef ||
        !store.readArtifact(old.lastEvidenceHash) || old.state === 'COMPLETED')
      throw Error('Repair requires actual previous failure Evidence');
    const generation = (last.generation ?? 1) + 1;
    const child = {
      id: randomUUID(), repo:run.repo,base:run.base,contract,contractHash:hash(contract),
      state:'READY',attempts:0,elapsedMs:0,reportedCostUsd:0,unknownCostAttempts:0,
      workflowParent:run.id,workflowRevision:run.revision,
      workflowGraphHash:run.contractHash,workflowItemId:itemId,workflowFence:owner,
      repairGeneration:generation,repairOfChildId:last.childId,
      repairEvidenceRef:old.lastEvidenceHash,
      repairProposalRef:old.proposalHash ?? null,
      lastProposalDigest:old.lastProposalDigest ?? null,
      // The next Host Turn receives failing Evidence as untrusted diagnostic
      // input; only an independent new verifier may accept the Repair.
    };
    workflowGuard(store,run)?.beforeReserve(run,owner,itemId,contract);
    store.db.prepare('INSERT INTO runs(id,body) VALUES (?,?)').run(child.id,JSON.stringify(child));
    store.db.prepare('INSERT INTO workflow_attempt_generations VALUES (?,?,?,?,?,?,?,?)').run(
      run.id,itemId,generation,child.id,run.revision,'STARTED',old.id,old.lastEvidenceHash);
    store.event(child.id,'CREATED',{contractHash:child.contractHash,repairGeneration:generation});
    store.event(run.id,'REPAIR_ATTEMPT_RESERVED',{itemId,childId:child.id,generation,
      repairOfChildId:old.id,repairEvidenceRef:old.lastEvidenceHash});
    store.db.exec('COMMIT');
    return child;
  } catch(error) { store.db.exec('ROLLBACK'); throw error; }
}
