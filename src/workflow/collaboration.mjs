import { hash } from '../alpha/contract.mjs';
import { approval } from './persistence.mjs';

// Tokens are issued only by the trusted coordinator, never parsed from AI JSON.
const bindings = new WeakMap();
export const MESSAGE_TYPES = Object.freeze(['QUESTION', 'FINDING', 'PROPOSAL', 'REVIEW_FEEDBACK', 'RESULT_SUBMITTED']);
export function delegate(store, runId, attemptId, owner, role) {
  const run = store.get(runId), child = store.get(attemptId);
  const item = run.contract.items.find(n => n.id === child.workflowItemId);
  if (run.contract.schemaVersion !== 2 || !item?.roles[role] || child.workflowParent !== runId) throw Error('Invalid role delegation');
  const token = Object.freeze({ assignment: Object.freeze({ sender: item.roles[role], role, runId, workItemId: item.id, attemptId, revision: run.revision, executionMode: role === 'Executor' ? 'PROPOSAL_ONLY' : 'READ_ONLY_PROPOSAL' }) });
  bindings.set(token, { store, owner, graphHash: run.contractHash });
  return token;
}
export function sendMessage(store, token, message) {
  const binding = bindings.get(token);
  if (!binding || binding.store !== store) throw Error('Host delegation required');
  if (!message || Object.keys(message).sort().join(',') !== 'correlationId,messageId,payload,type' || !MESSAGE_TYPES.includes(message.type)) throw Error('Invalid structured agent message');
  for (const key of ['messageId', 'correlationId']) if (typeof message[key] !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(message[key])) throw Error('Invalid message identity');
  const serialized = JSON.stringify(message.payload);
  if (serialized === undefined || Buffer.byteLength(serialized) > 32768) throw Error('Invalid message payload');
  const body = { ...token.assignment, ...message, authority: 'PROVIDER_REPORTED_ONLY' };
  const digest = hash(body);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const run = store.get(body.runId);
    const row = store.db.prepare('SELECT owner,leaseUntil,control FROM runs WHERE id=?').get(run.id);
    const attempt = store.db.prepare('SELECT * FROM workflow_attempts WHERE childId=?').get(body.attemptId);
    approval(store, run);
    if (row.owner !== binding.owner || row.leaseUntil <= Date.now() || row.control !== 'run' || run.revision !== body.revision || run.contractHash !== binding.graphHash || attempt?.status !== 'STARTED') throw Error('Stale delegation or closed attempt');
    const prior = store.db.prepare('SELECT * FROM agent_messages WHERE runId=? AND messageId=?').get(run.id, body.messageId);
    if (prior && prior.digest !== digest) throw Error('Message id payload conflict');
    if (!prior) {
      store.db.prepare('INSERT INTO agent_messages(runId,messageId,digest,body) VALUES (?,?,?,?)').run(run.id, body.messageId, digest, JSON.stringify(body));
      store.event(run.id, 'AGENT_MESSAGE', { messageId: body.messageId, digest, authority: body.authority });
    }
    store.db.exec('COMMIT'); return body;
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
export function messages(store, runId) {
  return store.db.prepare('SELECT body FROM agent_messages WHERE runId=? ORDER BY seq').all(runId).map(r => JSON.parse(r.body));
}

export function receiveMessages(store, token, correlationId) {
  if (bindings.get(token)?.store !== store) throw Error('Host delegation required');
  return messages(store, token.assignment.runId).filter(m => correlationId === undefined || m.correlationId === correlationId);
}
