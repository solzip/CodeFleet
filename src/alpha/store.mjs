import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from './contract.mjs';

export class Store {
  constructor(directory, { readOnly = false } = {}) {
    this.directory = path.resolve(directory);
    this.readOnly = readOnly;
    if (!readOnly) mkdirSync(this.directory, { recursive: true });
    this.db = new DatabaseSync(path.join(this.directory, 'state.sqlite'), { readOnly });
    try {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (!(readOnly ? [1, 2] : [0, 1, 2]).includes(version)) throw Error('Unsupported state schema; restore a compatible version or use a new state directory');
      if (readOnly) {
        // Connection-local only. Never initialize, migrate or set journal mode.
        this.db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000');
        if (this.db.prepare('PRAGMA quick_check').all().some(r => r.quick_check !== 'ok')) throw Error('Corrupt state database');
        return;
      }
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL, owner TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, pid INTEGER, control TEXT NOT NULL DEFAULT 'run');
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, runId TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL);`);
      if (version === 0) this.db.exec('PRAGMA user_version=1');
    } catch (error) { this.db.close(); throw error; }
  }
  // Opt-in additive migration: ordinary V1 use stays V1; no historical rows change.
  enableWorkflows() {
    if (this.readOnly) throw Error('Read-only Store cannot initialize workflows');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS graph_revisions (runId TEXT NOT NULL REFERENCES runs(id), revision INTEGER NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(runId,revision));
        CREATE TABLE IF NOT EXISTS workflow_approvals (runId TEXT NOT NULL REFERENCES runs(id), revision INTEGER NOT NULL, digest TEXT NOT NULL, actor TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(runId,revision));
        CREATE TABLE IF NOT EXISTS workflow_attempts (runId TEXT NOT NULL REFERENCES runs(id), itemId TEXT NOT NULL, childId TEXT NOT NULL UNIQUE REFERENCES runs(id), revision INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY(runId,itemId));
        PRAGMA user_version=2;`);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  enableCollaboration() {
    this.enableWorkflows();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS workflow_extensions (name TEXT PRIMARY KEY, version INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS agent_messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, runId TEXT NOT NULL REFERENCES runs(id), messageId TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(runId,messageId));
        INSERT OR IGNORE INTO workflow_extensions VALUES ('controlled-hybrid',1);`);
      if (this.db.prepare("SELECT version FROM workflow_extensions WHERE name='controlled-hybrid'").get().version !== 1) throw Error('Unsupported collaboration schema');
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  create(run) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO runs(id,body) VALUES (?,?)').run(run.id, JSON.stringify(run));
      this.event(run.id, 'CREATED', { contractHash: run.contractHash }); this.db.exec('COMMIT'); return run;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get(id) {
    const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if (!row) throw Error(`Unknown run: ${id}`);
    return { ...JSON.parse(row.body), control: row.control };
  }
  list() { return this.db.prepare('SELECT id FROM runs ORDER BY rowid DESC').all().map(r => this.get(r.id)); }
  event(id, type, body) { this.db.prepare('INSERT INTO events(runId,at,type,body) VALUES (?,?,?,?)').run(id, new Date().toISOString(), type, JSON.stringify(body)); }
  events(id) { return this.db.prepare('SELECT seq,at,type,body FROM events WHERE runId=? ORDER BY seq').all(id).map(r => ({ ...r, body: JSON.parse(r.body) })); }
  control(id, control) {
    if (!['run', 'pause', 'cancel'].includes(control)) throw Error('Invalid control');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT body,control FROM runs WHERE id=?').get(id);
      if (!row) throw Error('Unknown run');
      const run = JSON.parse(row.body);
      if ((row.control === 'cancel' || run.state === 'CANCELLED') && control !== 'cancel') throw Error('Cancelled runs cannot resume; create a new contract');
      if (control === 'run') throw Error('Resume requires an atomic worker claim');
      if (control === 'cancel' && run.state !== 'COMPLETED') {
        run.state = ['DELIVERING', 'RECONCILING'].includes(run.state) ? 'RECONCILING' : 'CANCELLED';
      }
      this.db.prepare('UPDATE runs SET control=?,body=? WHERE id=?').run(control, JSON.stringify(run), id);
      this.event(id, 'CONTROL', { control }); this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  claim(id, { resume = false } = {}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT owner,leaseUntil,pid,control,body FROM runs WHERE id=?').get(id);
      if (!row) throw Error('Unknown run');
      if (row.owner && Date.now() < Number(row.leaseUntil) - 30000) throw Error('Worker lease clock moved backwards; reconcile before claiming');
      let alive = false;
      if (row.pid) { try { process.kill(Number(row.pid), 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; } }
      if (row.owner && alive && Number(row.leaseUntil) > Date.now()) throw Error('Run already has an active worker');
      const run = JSON.parse(row.body);
      const cancelled = row.control === 'cancel' || run.state === 'CANCELLED';
      if (resume && cancelled && !['DELIVERING', 'RECONCILING'].includes(run.state)) throw Error('Cancelled runs cannot resume; create a new contract');
      if (resume && !cancelled) this.db.prepare('UPDATE runs SET control=? WHERE id=?').run('run', id);
      const owner = randomUUID();
      this.db.prepare('UPDATE runs SET owner=?,leaseUntil=?,pid=? WHERE id=?').run(owner, Date.now() + 30000, process.pid, id);
      this.event(id, 'CLAIMED', { recovered: Boolean(row.owner), resumed: resume, readOnly: resume && cancelled }); this.db.exec('COMMIT');
      return owner;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  heartbeat(id, owner) {
    const now = Date.now();
    // A late renewal cannot resurrect an expired lease. Persist invalidation so
    // rolling the wall clock back (or restarting) cannot restore this owner.
    const row = this.db.prepare(`UPDATE runs SET leaseUntil=CASE
      WHEN leaseUntil>? AND leaseUntil<=? THEN ? ELSE 0 END
      WHERE id=? AND owner=? RETURNING leaseUntil`).get(now, now + 30000, now + 30000, id, owner);
    return Boolean(row?.leaseUntil);
  }
  save(run, owner, type, fence = () => {}) {
    const observed = Date.now();
    // Keep observed lease loss even when the following result transaction fails.
    this.db.prepare('UPDATE runs SET leaseUntil=0 WHERE id=? AND owner=? AND (leaseUntil<=? OR leaseUntil>?)')
      .run(run.id, owner, observed, observed + 30000);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      fence();
      const now = Date.now();
      const result = this.db.prepare('UPDATE runs SET body=? WHERE id=? AND owner=? AND leaseUntil>? AND leaseUntil<=?').run(JSON.stringify(run), run.id, owner, now, now + 30000);
      if (result.changes !== 1) throw Error('Worker lease lost; result cannot be committed');
      this.event(run.id, type, { state: run.state, attempts: run.attempts, reason: run.reason ?? null }); this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  release(id, owner) { this.db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0,pid=NULL WHERE id=? AND owner=?').run(id, owner); }
  artifact(value) {
    if (this.readOnly) throw Error('Read-only Store cannot write artifacts');
    const bytes = Buffer.from(JSON.stringify(value)); const digest = hash(bytes);
    const dir = path.join(this.directory, 'artifacts'); mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${digest}.json`); const temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, bytes); renameSync(temp, target); return digest;
  }
  readArtifact(digest) {
    if (!/^[a-f0-9]{64}$/.test(digest ?? '')) throw Error('Invalid artifact reference');
    const bytes = readFileSync(path.join(this.directory, 'artifacts', `${digest}.json`));
    if (hash(bytes) !== digest) throw Error('Evidence artifact hash mismatch');
    return JSON.parse(bytes.toString('utf8'));
  }
  close() { this.db.close(); }
}
