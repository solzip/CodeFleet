import { randomUUID } from 'node:crypto';
import { hash, validateContract, applyEdits } from '../alpha/contract.mjs';
import { git, repository } from '../alpha/workspace.mjs';
import { requireSuccess } from '../alpha/process.mjs';
import { approval, attempts } from '../workflow/persistence.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';

export const HOSTS = Object.freeze(['codex', 'claude']);
export function hostIdentity(host) {
  if (!HOSTS.includes(host)) throw Error('Unsupported host');
  return { id: host, mode: 'STAGED_PROPOSAL', modelCalls: 0, liveValidation: 'NOT_RUN',
    automatedHostTools: 'BLOCKED', hostSandbox: 'UNVERIFIED', automaticDelegation: 'UNVERIFIED',
    operatorAuthorization: 'BLOCKED_NO_OS_AUTHENTICATED_BROKER', publicExecution: 'BLOCKED',
    authentication: 'EXISTING_HOST_SESSION_ONLY', hostSessionCost: 'UNKNOWN' };
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw Error('Invalid host response fields');
}
export function enableHostExchange(store) {
  store.enableCollaboration();
  store.db.exec(`CREATE TABLE IF NOT EXISTS host_requests (
    id TEXT PRIMARY KEY, runId TEXT NOT NULL REFERENCES runs(id), revision INTEGER NOT NULL,
    itemId TEXT NOT NULL, host TEXT NOT NULL, requestRef TEXT NOT NULL, responseRef TEXT,
    status TEXT NOT NULL, attemptId TEXT, UNIQUE(runId, revision, itemId));
    INSERT OR IGNORE INTO workflow_extensions VALUES ('host-exchange',1);`);
  if (store.db.prepare("SELECT version FROM workflow_extensions WHERE name='host-exchange'").get().version !== 1) throw Error('Unsupported host exchange schema');
}
function current(store, runId) {
  const run = store.get(runId);
  if (run.kind !== 'workflow' || run.contract.schemaVersion !== 2) throw Error('Host exchange requires Controlled Hybrid workflow');
  const source = store.readArtifact(run.sourceRef);
  validateWorkflow(run.contract, source);
  if (run.contractHash !== run.contract.workflowHash || hash(store.readArtifact(run.graphRef)) !== hash(run.contract)) throw Error('Workflow integrity mismatch');
  if (source.delivery.mode !== 'local') throw Error('Host exchange requires local delivery');
  if (run.control === 'cancel' || ['COMPLETED', 'CANCELLED', 'RECONCILING'].includes(run.state)) throw Error('Closed or unresolved workflow');
  approval(store, run);
  return { run, source };
}
function bound(store, row) {
  const { run } = current(store, row.runId), request = store.readArtifact(row.requestRef);
  const { bindingHash, ...body } = request;
  if (hash(body) !== bindingHash || request.runId !== run.id || request.workflowHash !== run.contractHash || request.revision !== run.revision || request.base !== run.base || request.host !== row.host || request.itemId !== row.itemId || request.requestId !== row.id) throw Error('Stale host request binding');
  return request;
}
export async function issueRequests(store, runId, host) {
  hostIdentity(host); enableHostExchange(store);
  const { run, source } = current(store, runId);
  if (store.db.prepare('SELECT owner FROM runs WHERE id=?').get(runId).owner || attempts(store, runId).length) throw Error('Cannot issue requests for active or attempted workflow');
  const selected = await repository(run.repo);
  if (selected.base !== run.base) throw Error('Workflow baseline changed');
  const output = [];
  for (const item of run.contract.items) {
    const prior = store.db.prepare('SELECT * FROM host_requests WHERE runId=? AND revision=? AND itemId=?').get(runId, run.revision, item.id);
    if (prior) { if (prior.host !== host) throw Error('Host switch requires a new workflow'); output.push(bound(store, prior)); continue; }
    const contract = validateContract({ ...source, files: item.files, tests: item.tests, maxAttempts: 1 });
    const files = {}; let bytes = 0;
    for (const name of new Set([...contract.context, ...contract.tests])) {
      // requireSuccess trims output; preserve original bytes for exact edit binding.
      const result = await git(run.repo, ['show', `${run.base}:${name}`], { cap: 160001 });
      requireSuccess(result, 'Read declared context');
      files[name] = result.stdout.toString('utf8'); bytes += Buffer.byteLength(files[name]);
      if (files[name].includes('\0') || bytes > 160000) throw Error('Context exceeds text limit');
    }
    const body = { schemaVersion: 1, requestId: randomUUID(), host, runId, revision: run.revision,
      workflowHash: run.contractHash, base: run.base, itemId: item.id, roles: item.roles,
      contract, contractHash: hash(contract), files, contextHash: hash(files), authority: 'PROVIDER_REPORTED_ONLY' };
    const request = { ...body, bindingHash: hash(body) }, ref = store.artifact(request);
    // Recheck after asynchronous context reads, before publishing a request.
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const latest = current(store, runId).run;
      if (latest.revision !== run.revision || latest.contractHash !== run.contractHash || attempts(store, runId).length || store.db.prepare('SELECT owner FROM runs WHERE id=?').get(runId).owner) throw Error('Workflow changed during request preparation');
      const concurrent = store.db.prepare('SELECT * FROM host_requests WHERE runId=? AND revision=? AND itemId=?').get(runId, run.revision, item.id);
      if (concurrent) {
        if (concurrent.host !== host) throw Error('Host switch requires a new workflow');
        output.push(bound(store, concurrent));
      } else {
        store.db.prepare('INSERT INTO host_requests VALUES (?,?,?,?,?,?,NULL,?,NULL)').run(body.requestId, runId, run.revision, item.id, host, ref, 'ISSUED');
        output.push(request);
      }
      store.db.exec('COMMIT');
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  }
  return output;
}
export function submitResponse(store, host, input) {
  hostIdentity(host); enableHostExchange(store);
  exact(input, ['requestId', 'bindingHash', 'proposal']);
  if (Buffer.byteLength(JSON.stringify(input)) > 220000) throw Error('Host response exceeds limit');
  store.db.exec('BEGIN IMMEDIATE');
  try {
  const row = store.db.prepare('SELECT * FROM host_requests WHERE id=?').get(input.requestId);
  if (!row || row.host !== host) throw Error('Unknown host request');
  const request = bound(store, row);
  if (request.bindingHash !== input.bindingHash) throw Error('Host binding mismatch');
  if (row.status === 'CONSUMED' || attempts(store, row.runId).length) throw Error('Attempt already reserved or response consumed');
  if (store.db.prepare('SELECT owner FROM runs WHERE id=?').get(row.runId).owner) throw Error('Workflow active');
  applyEdits(request.contract, request.files, input.proposal);
  const responseRef = store.artifact({ ...input, authority: 'PROVIDER_REPORTED_ONLY' });
  if (row.responseRef && row.responseRef !== responseRef) throw Error('Duplicate response conflict');
  store.db.prepare("UPDATE host_requests SET responseRef=?,status='SUBMITTED' WHERE id=? AND status IN ('ISSUED','SUBMITTED')").run(responseRef, row.id);
  store.db.exec('COMMIT');
  return { requestId: row.id, status: 'SUBMITTED', authority: 'PROVIDER_REPORTED_ONLY', complete: false };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

// Trusted coordinator seam. This is local inert-data consumption, NOT a Provider
// adapter or an attestation of the AI host's tool/sandbox capabilities.
export function stagedExecution(store, runId, host) {
  hostIdentity(host); enableHostExchange(store);
  const id = `host-${host}-staged`;
  return {
    async select(run) {
      current(store, runId);
      if (run.id !== runId || (run.providerId && run.providerId !== id)) throw Error('Execution route switch forbidden');
      if (run.contract.requiredCapabilities.some(c => !['non_interactive_execution', 'structured_output', 'proposal_only'].includes(c))) throw Error('Host capability unavailable');
      for (const item of run.contract.items) {
        const row = store.db.prepare('SELECT * FROM host_requests WHERE runId=? AND revision=? AND itemId=?').get(runId, run.revision, item.id);
        if (!row || row.host !== host || !['SUBMITTED', 'CONSUMED'].includes(row.status)) throw Error('Missing staged host response');
        bound(store, row);
      }
      return { providerId: id, strategy: 'HOST_STAGED_INPUT', reason: 'No host/model process launched', rejected: {} };
    },
    async execute(child, request, channels) {
      store.db.exec('BEGIN IMMEDIATE');
      try {
        const { run } = current(store, runId);
        const row = store.db.prepare('SELECT * FROM host_requests WHERE runId=? AND revision=? AND itemId=?').get(runId, run.revision, child.workflowItemId);
        if (!row || row.host !== host || row.status !== 'SUBMITTED') throw Error('Missing or consumed host response');
        const issued = bound(store, row);
        const parent = store.db.prepare('SELECT owner,leaseUntil,control FROM runs WHERE id=?').get(runId);
        const active = attempts(store, runId).find(a => a.childId === child.id);
        if (!parent.owner || parent.owner !== child.workflowFence || parent.leaseUntil <= Date.now() || parent.control !== 'run' || active?.status !== 'STARTED' || child.workflowParent !== runId || child.workflowRevision !== run.revision || child.workflowGraphHash !== run.contractHash || request.cancelled?.()) throw Error('Stale host attempt');
        if (hash(request.contract) !== issued.contractHash || hash(request.files) !== issued.contextHash) throw Error('Host contract/context mismatch');
        const response = store.readArtifact(row.responseRef);
        if (response.requestId !== row.id || response.bindingHash !== issued.bindingHash) throw Error('Response integrity mismatch');
        applyEdits(request.contract, request.files, response.proposal);
        if (store.db.prepare("UPDATE host_requests SET status='CONSUMED',attemptId=? WHERE id=? AND status='SUBMITTED'").run(child.id, row.id).changes !== 1) throw Error('Response already consumed');
        store.event(runId, 'HOST_RESPONSE_CONSUMED', { requestId: row.id, attemptId: child.id, responseRef: row.responseRef, authority: 'PROVIDER_REPORTED_ONLY' });
        store.db.exec('COMMIT');
        channels?.Executor.send({ messageId: row.id, correlationId: child.id, type: 'RESULT_SUBMITTED', payload: { responseRef: row.responseRef, host } });
        return { kind: 'ProviderExecutionResult', provider: { id }, mode: 'PROPOSAL_ONLY', status: 'PROPOSED', error: null,
          authority: 'PROVIDER_REPORTED_ONLY', proposal: response.proposal, cost: 0,
          costAuthority: 'LOCAL_NO_MODEL_INVOCATION', hostSessionCost: null, hostSessionCostStatus: 'UNKNOWN',
          schemaValidation: { status: 'VALID', errors: [] }, requestId: row.id, attemptId: child.id };
      } catch (error) { if (store.db.isTransaction) store.db.exec('ROLLBACK'); throw error; }
    }
  };
}
