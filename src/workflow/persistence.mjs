import { randomUUID } from 'node:crypto';
import { hash } from '../alpha/contract.mjs';
import { repository } from '../alpha/workspace.mjs';
import { validateWorkflow, policyFor, parallelLimit } from './definition.mjs';

function transaction(store, fn) {
  store.db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); store.db.exec('COMMIT'); return result; }
  catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
function idle(store, run) {
  const row = store.db.prepare('SELECT owner FROM runs WHERE id=?').get(run.id);
  if (row.owner || store.db.prepare("SELECT 1 FROM workflow_attempts WHERE runId=? AND status='STARTED'").get(run.id) || ['COMPLETED', 'CANCELLED'].includes(run.state)) throw Error('Workflow is active, unresolved or terminal');
}
export async function createWorkflow(store, repo, input, source, commandId = randomUUID()) {
  const workflow = validateWorkflow(input, source), selected = await repository(repo);
  if (selected.base !== workflow.base) throw Error('Workflow baseline changed');
  store.enableWorkflows();
  if (workflow.schemaVersion === 2) store.enableCollaboration();
  const contractRef = store.artifact(source), graphRef = store.artifact(workflow);
  return transaction(store, () => {
    const prior = store.db.prepare('SELECT body FROM runs WHERE id=?').get(commandId);
    if (prior) { const r = JSON.parse(prior.body); if (r.kind !== 'workflow' || r.contractHash !== workflow.workflowHash || r.repo !== selected.repo) throw Error('Command id payload conflict'); return r; }
    const run = { id: commandId, kind: 'workflow', ...selected, contract: workflow, contractHash: workflow.workflowHash, sourceRef: contractRef, graphRef, revision: 1, states: Object.fromEntries(workflow.items.map(n => [n.id, 'PENDING'])), state: 'WAITING_APPROVAL', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0 };
    store.db.prepare('INSERT INTO runs(id,body) VALUES (?,?)').run(run.id, JSON.stringify(run));
    store.db.prepare('INSERT INTO graph_revisions VALUES (?,?,?,?)').run(run.id, 1, workflow.workflowHash, JSON.stringify(workflow));
    store.event(run.id, 'WORKFLOW_CREATED', { graphRef, sourceRef: contractRef }); return run;
  });
}
export function approveWorkflow(store, runId, { actor, workflowHash, expiresAt }) {
  return transaction(store, () => {
    const run = store.get(runId); idle(store, run);
    if (typeof actor !== 'string' || !actor.trim() || workflowHash !== run.contractHash || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 3600000) throw Error('Explicit matching workflow approval and bounded expiry required');
    store.db.prepare('INSERT OR REPLACE INTO workflow_approvals VALUES (?,?,?,?,?)').run(runId, run.revision, workflowHash, actor, expiresAt);
    run.state = 'READY'; store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run), runId);
    store.event(runId, 'WORKFLOW_AUTHORIZED', { workflowHash, actor, expiresAt }); return run;
  });
}
export function approval(store, run) {
  const a = store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=? AND revision=?').get(run.id, run.revision);
  if (!a || a.digest !== run.contractHash || a.expires <= Date.now() || run.contract.policySnapshotRef !== hash(policyFor(run.contract))) throw Error('Workflow approval absent, expired or invalid');
}
export function revokeWorkflow(store, runId, actor) {
  if (typeof actor !== 'string' || !actor.trim()) throw Error('Revocation actor required');
  return transaction(store, () => {
    store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(runId);
    store.event(runId, 'WORKFLOW_APPROVAL_REVOKED', { actor });
  });
}
export function reviseWorkflow(store, runId, expectedRevision, proposed) {
  const run = store.get(runId), source = store.readArtifact(run.sourceRef);
  const graph = validateWorkflow(proposed, source);
  const graphRef = store.artifact(graph);
  return transaction(store, () => {
    const current = store.get(runId); idle(store, current);
    if (current.revision !== expectedRevision) throw Error('Graph revision conflict');
    if (graph.workflowId !== current.contract.workflowId || graph.base !== current.base || graph.workflowVersion !== current.contract.workflowVersion + 1) throw Error('Revision identity mismatch');
    const attempts = store.db.prepare('SELECT itemId FROM workflow_attempts WHERE runId=?').all(runId);
    if ((current.contract.schemaVersion === 2 || graph.schemaVersion === 2) && attempts.length) throw Error('Hybrid revisions cannot mix already attempted ChangeSets; new workflow required');
    for (const { itemId } of attempts) {
      if (itemId === 'final' || hash(graph.items.find(n => n.id === itemId) ?? null) !== hash(current.contract.items.find(n => n.id === itemId))) throw Error('Attempt contract is immutable');
    }
    for (const old of current.contract.items) if (!graph.items.some(n => n.id === old.id)) throw Error('WorkItem removal not supported');
    current.revision++; current.contract = graph; current.contractHash = graph.workflowHash; current.graphRef = graphRef; current.state = 'WAITING_APPROVAL';
    for (const n of graph.items) current.states[n.id] ??= 'PENDING';
    store.db.prepare('INSERT INTO graph_revisions VALUES (?,?,?,?)').run(runId, current.revision, graph.workflowHash, JSON.stringify(graph));
    store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(current), runId);
    store.event(runId, 'GRAPH_REVISION_PROPOSED', { revision: current.revision, graphRef, requiresApproval: true }); return current;
  });
}
export function attempts(store, id) { return store.db.prepare('SELECT * FROM workflow_attempts WHERE runId=? ORDER BY rowid').all(id); }
export function reserve(store, run, owner, itemId, contract) {
  return transaction(store, () => {
    approval(store, run);
    const active = store.db.prepare("SELECT * FROM workflow_attempts WHERE status='STARTED'").all();
    const limit = parallelLimit(run.contract);
    if (active.some(a => a.runId !== run.id || a.itemId === 'final') || active.length >= limit || (itemId === 'final' && active.length)) throw Error(limit === 1 ? 'Concurrency limit is one' : 'Parallel admission limit exceeded');
    const row = store.db.prepare('SELECT owner,leaseUntil,control,body FROM runs WHERE id=?').get(run.id);
    if (row.owner !== owner || row.leaseUntil <= Date.now() || row.control !== 'run' || JSON.parse(row.body).revision !== run.revision) throw Error('Coordinator lease/control/revision changed');
    const source = store.readArtifact(run.sourceRef), node = run.contract.items.find(n => n.id === itemId);
    const final = itemId === 'final';
    if (final ? !run.contract.items.every(n => run.states[n.id] === 'SUCCEEDED') : !node || run.states[itemId] !== 'READY' || !node.dependencies.every(d => run.states[d] === 'SUCCEEDED')) throw Error('Only dependency-ready WorkItems may reserve attempts');
    const expected = { ...source, files: final ? source.files : node.files, tests: final ? source.tests : node.tests, maxAttempts: 1 };
    if (hash(expected) !== hash(contract)) throw Error('Attempt contract differs from approved WorkItem');
    for (const a of active) {
      const other = run.contract.items.find(n => n.id === a.itemId);
      if (a.revision !== run.revision || node?.files.some(f => other.files.includes(f)) || node?.resources?.some(r => other.resources?.includes(r))) throw Error('Active file/resource/revision conflict');
    }
    const child = { id: randomUUID(), repo: run.repo, base: run.base, contract, contractHash: hash(contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0, workflowParent: run.id, workflowRevision: run.revision, workflowGraphHash: run.contractHash, workflowItemId: itemId, workflowFence: owner };
    store.db.prepare('INSERT INTO runs(id,body) VALUES (?,?)').run(child.id, JSON.stringify(child));
    store.db.prepare('INSERT INTO workflow_attempts VALUES (?,?,?,?,?)').run(run.id, itemId, child.id, run.revision, 'STARTED');
    store.event(child.id, 'CREATED', { contractHash: child.contractHash });
    store.event(run.id, 'ATTEMPT_RESERVED', { itemId, childId: child.id }); return child;
  });
}
export function finish(store, run, owner, attempt, status) {
  return transaction(store, () => {
    const row = store.db.prepare('SELECT owner,leaseUntil,body FROM runs WHERE id=?').get(run.id);
    if (row.owner !== owner || row.leaseUntil <= Date.now() || JSON.parse(row.body).revision !== run.revision) throw Error('Coordinator lease/revision lost');
    const r = store.db.prepare("UPDATE workflow_attempts SET status=? WHERE runId=? AND itemId=? AND status='STARTED'").run(status, run.id, attempt.itemId);
    if (r.changes !== 1) throw Error('Terminal attempt cannot be rewritten');
    store.db.prepare('UPDATE runs SET body=? WHERE id=? AND owner=?').run(JSON.stringify(run), run.id, owner);
    store.event(run.id, 'ATTEMPT_RECONCILED', { itemId: attempt.itemId, status });
  });
}

// Read-only host assessment of an untrusted graph proposal. This cannot approve,
// activate, reserve or alter an existing Attempt.
export function reviewRevisionProposal(store, runId, expectedRevision, proposed) {
  const run = store.get(runId);
  try {
    if (run.revision !== expectedRevision) throw Error('Graph revision conflict');
    const graph = validateWorkflow(proposed, store.readArtifact(run.sourceRef));
    if (graph.workflowId !== run.contract.workflowId || graph.base !== run.base || graph.workflowVersion !== run.contract.workflowVersion + 1) throw Error('Revision identity mismatch');
    if (run.contract.items.some(old => !graph.items.some(n => n.id === old.id))) throw Error('WorkItem removal not supported');
    if (attempts(store, runId).length) throw Error('Hybrid revision with existing attempts requires a new workflow');
    return { status: 'REQUIRES_APPROVAL', expectedRevision, workflowHash: graph.workflowHash };
  } catch (error) { return { status: 'BLOCKED', expectedRevision, reason: error.message }; }
}
