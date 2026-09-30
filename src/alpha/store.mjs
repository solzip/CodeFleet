import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from './contract.mjs';

export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory); mkdirSync(this.directory, { recursive: true });
    this.db = new DatabaseSync(path.join(this.directory, 'state.sqlite'));
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version !== 0 && version !== 1) { this.db.close(); throw Error('Unsupported state schema; restore a compatible version or use a new state directory'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL, owner TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, pid INTEGER, control TEXT NOT NULL DEFAULT 'run');
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, runId TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL);`);
    this.db.exec('PRAGMA user_version=1');
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
  heartbeat(id, owner) { return this.db.prepare('UPDATE runs SET leaseUntil=? WHERE id=? AND owner=?').run(Date.now() + 30000, id, owner).changes === 1; }
  save(run, owner, type) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare('UPDATE runs SET body=? WHERE id=? AND owner=? AND leaseUntil>?').run(JSON.stringify(run), run.id, owner, Date.now());
      if (result.changes !== 1) throw Error('Worker lease lost; result cannot be committed');
      this.event(run.id, type, { state: run.state, attempts: run.attempts, reason: run.reason ?? null }); this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  release(id, owner) { this.db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0,pid=NULL WHERE id=? AND owner=?').run(id, owner); }
  artifact(value) {
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
