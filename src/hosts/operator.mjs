// Offline broker core. The caller, key enrollment, clock, ledger and executor
// must be outside Agent control. This module DOES NOT establish OS isolation.
import { createHash, createPublicKey, verify, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw Error('Invalid canonical data');
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const fingerprint = key => createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('hex');
const fields = ['runId', 'workItemId', 'revision', 'contractHash', 'actionDigest', 'repository', 'environment', 'policyHash', 'leaseOwner'];
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join() !== [...keys].sort().join()) throw Error('Unexpected authorization fields');
}
function binding(value) {
  exact(value, fields);
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw Error('Invalid revision');
  for (const key of fields.filter(k => k !== 'revision')) if (typeof value[key] !== 'string' || !value[key] || value[key].length > 4096) throw Error('Invalid binding');
  for (const key of ['contractHash', 'actionDigest', 'environment', 'policyHash']) if (!/^[a-f0-9]{64}$/.test(value[key])) throw Error('Invalid digest');
  return JSON.parse(canonical(value));
}
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
export class OfflineOperatorLedger {
  #db; #keys; #clock; #current; #dispatch;
  constructor({ file, operatorKeys, current, dispatch, clock = Date.now }) {
    if (!operatorKeys?.length || typeof current !== 'function' || typeof dispatch !== 'function') throw Error('Trusted broker dependencies required');
    this.#keys = new Map(operatorKeys.map(pem => {
      const key = createPublicKey(pem);
      if (key.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 operator key required');
      return [fingerprint(pem), key];
    }));
    this.#clock = clock; this.#current = current; this.#dispatch = dispatch;
    this.#db = new DatabaseSync(file);
    this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, binding TEXT NOT NULL, state TEXT NOT NULL, decision TEXT, signature TEXT);
      CREATE TABLE IF NOT EXISTS decisions(seq INTEGER PRIMARY KEY, requestId TEXT NOT NULL, body TEXT NOT NULL, signature TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dispatches(requestId TEXT PRIMARY KEY, binding TEXT NOT NULL, command TEXT NOT NULL, state TEXT NOT NULL, result TEXT);`);
  }
  close() { this.#db.close(); }
  agent(message) {
    if (message?.method === 'request') {
      exact(message, ['method', 'binding']); const value = binding(message.binding), id = randomUUID();
      this.#db.prepare("INSERT INTO requests VALUES (?,?,'PENDING',NULL,NULL)").run(id, canonical(value));
      return { id, state: 'PENDING', authority: 'REQUEST_ONLY' };
    }
    if (message?.method === 'status') { exact(message, ['method', 'id']); return this.status(message.id); }
    throw Error('Agent operation denied');
  }
  status(id) {
    const row = this.#db.prepare('SELECT state FROM requests WHERE id=?').get(id);
    if (!row) throw Error('Unknown authorization request');
    return { id, state: row.state, dispatch: this.#db.prepare('SELECT state FROM dispatches WHERE requestId=?').get(id)?.state ?? null };
  }
  #verified(envelope) {
    return verifiedDecision(envelope, this.#keys, this.#clock);
  }
  operator(envelope) {
    const d = this.#verified(envelope);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.#db.prepare('SELECT * FROM requests WHERE id=?').get(d.id);
      if (!row || row.binding !== canonical(d.binding)) throw Error('Decision binding mismatch');
      if (['DENIED', 'REVOKED', 'CONSUMED'].includes(row.state)) throw Error('Authorization terminal');
      if (d.kind === 'APPROVE' && row.state !== 'PENDING') throw Error('Approval replay');
      const state = { APPROVE: 'APPROVED', DENY: 'DENIED', REVOKE: 'REVOKED' }[d.kind];
      this.#db.prepare('UPDATE requests SET state=?,decision=?,signature=? WHERE id=?').run(state, canonical(d), envelope.signature, d.id);
      this.#db.prepare('INSERT INTO decisions(requestId,body,signature) VALUES (?,?,?)').run(d.id, canonical(d), envelope.signature);
      this.#db.exec('COMMIT'); return this.status(d.id);
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  #check(row, command) {
    if (!row || row.state !== 'APPROVED') throw Error('Approval required');
    const d = this.#verified({ decision: JSON.parse(row.decision), signature: row.signature });
    if (d.kind !== 'APPROVE' || d.id !== row.id || canonical(d.binding) !== row.binding) throw Error('Stored approval integrity mismatch');
    const live = this.#current(d.binding.runId, d.binding.workItemId);
    if (!live || live.control !== 'run' || !Number.isSafeInteger(live.leaseUntil) || live.leaseUntil <= this.#clock() || canonical(binding(live.binding)) !== row.binding) throw Error('Current authorization fence mismatch');
    if (digest(command) !== d.binding.actionDigest) throw Error('Action digest mismatch');
  }
  consume(id, command) {
    // Immutable exact specification passed to the trusted dispatcher, never a
    // command assembled later from Agent-supplied mutable objects.
    const spec = frozen(JSON.parse(canonical(command)));
    this.#db.exec('BEGIN IMMEDIATE'); let row;
    try {
      row = this.#db.prepare('SELECT * FROM requests WHERE id=?').get(id); this.#check(row, spec);
      this.#db.prepare("INSERT INTO dispatches VALUES (?,?,?,'RESERVED',NULL)").run(id, row.binding, canonical(spec));
      this.#db.prepare("UPDATE requests SET state='CONSUMED' WHERE id=?").run(id);
      this.#db.exec('COMMIT');
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
    // No async gap before rechecking the trusted state and dispatching.
    try {
      this.#check(row, spec);
      return spec;
    } catch (error) {
      this.#db.prepare("UPDATE dispatches SET state='UNCERTAIN' WHERE requestId=?").run(id);
      throw error;
    }
  }
  async execute(id, command) {
    const spec = this.consume(id, command);
    try {
      const result = await this.#dispatch(spec);
      const serialized = canonical(result);
      this.#db.prepare("UPDATE dispatches SET state='RETURNED',result=? WHERE requestId=?").run(serialized, id);
      return { id, state: 'RETURNED', authority: 'DISPATCH_ONLY_NOT_VERIFICATION', result };
    } catch (error) {
      this.#db.prepare("UPDATE dispatches SET state='UNCERTAIN' WHERE requestId=?").run(id);
      throw error;
    }
  }
}

// Shared H2 signature/shape verification, without allocating another ledger.
// Key enrollment and invocation remain trusted dependencies, not Agent input.
export function operatorDecisionVerifier(operatorKeys, clock = Date.now) {
  if (!operatorKeys?.length) throw Error('Trusted Operator key enrollment required');
  const keys = new Map(operatorKeys.map(pem => {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 operator key required');
    return [fingerprint(pem), key];
  }));
  return envelope => verifiedDecision(envelope, keys, clock);
}
function verifiedDecision(envelope, keys, clock) {
  exact(envelope, ['decision', 'signature']); const d = envelope.decision;
  exact(d, ['id', 'kind', 'binding', 'principal', 'expiresAt', 'maxUses']); binding(d.binding);
  if (typeof d.id !== 'string' || !d.id || !['APPROVE', 'DENY', 'REVOKE'].includes(d.kind) || d.maxUses !== 1 || !Number.isSafeInteger(d.expiresAt)) throw Error('Invalid decision');
  const key = keys.get(d.principal);
  if (!key || typeof envelope.signature !== 'string' || !/^[a-f0-9]{128}$/.test(envelope.signature) || !verify(null, Buffer.from(canonical(d)), key, Buffer.from(envelope.signature, 'hex'))) throw Error('Operator signature invalid');
  if (d.expiresAt <= clock()) throw Error('Decision expired');
  return frozen(JSON.parse(canonical(d)));
}

export function requireProductionHostIsolation() {
  // No supported OS-authenticated broker deployment has been installed/tested.
  // Neither configuration, actor strings nor signed fixture grants enable it.
  throw Error('HOST_OPERATOR_ISOLATION_UNAVAILABLE: production Host execution is blocked; same-account shell is not an authorization boundary');
}
