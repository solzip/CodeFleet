import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { built, request } from './fixtures/bootstrap-reservation.mjs';
import { task, verifyTask, enableTasks } from '../src/product/tasks.mjs';
import { issueOfflineDecision as issueDecision, revokeDecision, executeOfflineDecision as executeDecision, reservationStatus,
  issueDecision as publicIssue, executeDecision as publicExecute } from '../src/product/reservations.mjs';
import { command } from '../src/alpha/process.mjs';
import { Store } from '../src/alpha/store.mjs';
import { taskReport } from '../src/product/report.mjs';
import { existsSync } from 'node:fs';
import { dispatchProduct } from '../src/product/cli.mjs';

// The former public execution path is now blocked. Retain all reservation
// mechanics assertions with real processes using an explicitly offline driver.
const cli = path.resolve('test/fixtures/reservation-offline-cli.mjs');
const worker = path.resolve('test/fixtures/reservation-worker.mjs');
const publicCli = path.resolve('src/alpha/cli.mjs');
const publicCall = (state, args, options) => command(process.execPath, [publicCli, '--state', state, ...args], options);
function blocked(output) {
  assert.equal(output.exitCode, 1, output.stdout + output.stderr);
  assert.equal(JSON.parse(output.stdout).status, 'BLOCKED_OR_UNSUPPORTED');
  assert.match(JSON.parse(output.stdout).error, /HOST_OPERATOR_ISOLATION_UNAVAILABLE/);
}
async function setup(t, { slow = false, failing = false, timeBudgetMs = 60000, maxAttempts = 1, timeoutSeconds = 300 } = {}) {
  const f = await built(); t.after(() => f.store.close());
  changeTask(f, value => { value.settings.maxAttempts = maxAttempts; value.settings.timeoutSeconds = timeoutSeconds; });
  f.counter = path.join(f.root, 'launches');
  f.request = { ...request(f), timeoutMs: Math.min(timeBudgetMs, 15000), args: ['--test-reporter=tap', '-e',
    `require('node:test')('reservation fixture', async () => { require('node:fs').appendFileSync(${JSON.stringify(f.counter)},'launch\\n');` +
    (slow ? 'await new Promise(r => setTimeout(r, 4000));' : '') +
    `require('node:assert/strict').equal(${failing ? 0 : 1}, 1); });`] };
  const inspected = await verifyTask(f.store, f.id, 'tests', f.request);
  f.input = { decisionId: randomUUID(), requestId: randomUUID(), actor: 'fixture-operator', revision: task(f.store, f.id).revision,
    commandHash: inspected.commandHash, acknowledgeUnisolated: true, expiresAt: Date.now() + 120000,
    maxExecutions: 1, timeBudgetMs, maxConsecutiveFailures: 1 };
  await issueDecision(f.store, f.id, 'tests', f.request, f.input);
  f.run = options => executeDecision(f.store, f.id, 'tests', f.request, { ...f.input, ...options });
  f.count = async () => { try { return (await readFile(f.counter, 'utf8')).trim().split('\n').length; } catch (e) { if (e.code === 'ENOENT') return 0; throw e; } };
  f.file = path.join(f.root, 'request.json'); await writeFile(f.file, JSON.stringify(f.request));
  f.argv = [cli, '--state', f.state, 'objective', 'verify', f.id, 'tests', f.file, '--decision', f.input.decisionId, '--request-id', f.input.requestId];
  return f;
}
function changeTask(f, fn) {
  const value = task(f.store, f.id); fn(value);
  f.store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=?').run(JSON.stringify(value), value.revision, f.id);
}

test('AB1: public CLI rejects Agent-authored decisions and execution before opening Store', async t => {
  const f = await setup(t);
  const input = { ...f.input, actor: 'agent-authored-operator', decisionId: randomUUID(), requestId: randomUUID() };
  const file = path.join(f.root, 'self-issued.json'); await writeFile(file, JSON.stringify(input));
  const before = f.store.db.prepare('SELECT * FROM bootstrap_decisions').all();
  const events = f.store.events(f.id);
  await assert.rejects(() => publicIssue(f.store, f.id, 'tests', f.request, input, { trusted: true }), /HOST_OPERATOR_ISOLATION_UNAVAILABLE/);
  await assert.rejects(() => publicExecute(f.store, f.id, 'tests', f.request, { ...f.input, trusted: true }), /HOST_OPERATOR_ISOLATION_UNAVAILABLE/);
  const issue = ['objective', 'authorize-local', f.id, 'tests', f.file, file];
  blocked(await publicCall(f.state, issue));
  // Caller-controlled environment/actor labels cannot turn the gate on.
  blocked(await publicCall(f.state, issue, { env: { ...process.env, CODEFLEET_OPERATOR: 'true', CODEFLEET_TRUSTED_OPERATOR: 'true' } }));
  blocked(await publicCall(f.state, ['objective', 'verify', f.id, 'tests', f.file, '--decision', input.decisionId, '--request-id', input.requestId]));
  assert.deepEqual(f.store.db.prepare('SELECT * FROM bootstrap_decisions').all(), before);
  assert.deepEqual(f.store.events(f.id), events);
  assert.equal(await f.count(), 0);
  const absent = path.join(f.root, 'must-not-open');
  blocked(await publicCall(absent, issue));
  blocked(await publicCall(absent, ['objective', 'verify', f.id, 'tests', f.file, '--decision', input.decisionId, '--request-id', input.requestId]));
  assert.equal(existsSync(absent), false);
  await assert.rejects(() => dispatchProduct(issue.slice(1), { store: f.store, execution: { actor: 'operator', trusted: true } }), /HOST_OPERATOR_ISOLATION_UNAVAILABLE/);
});

for (const state of ['issued', 'expired', 'revoked', 'consumed', 'forged', 'handoff']) test(`AB1: public execution refuses ${state} decision; control/status preserve durable history`, async t => {
  const f = await setup(t);
  if (state === 'expired') f.store.db.prepare('UPDATE bootstrap_decisions SET expires=0').run();
  if (state === 'revoked') revokeDecision(f.store, f.input.decisionId, 'fixture');
  if (state === 'consumed') assert.equal((await f.run()).status, 'LOCAL_PASSED');
  if (state === 'handoff') assert.equal((await f.run({ hooks: { beforeSpawn: () => { throw Error('fixture handoff'); } } })).status, 'HUMAN_HANDOFF');
  if (state === 'forged') {
    const row = f.store.db.prepare('SELECT body FROM bootstrap_decisions').get();
    const binding = JSON.parse(row.body); binding.actor = 'operator'; binding.operatorProof = 'self-written';
    f.store.db.prepare('UPDATE bootstrap_decisions SET body=?').run(JSON.stringify(binding));
  }
  const snapshot = () => ({ task: task(f.store, f.id), decisions: f.store.db.prepare('SELECT * FROM bootstrap_decisions').all(),
    reservations: f.store.db.prepare('SELECT * FROM bootstrap_reservations').all(), runs: f.store.db.prepare('SELECT * FROM runs').all(), events: f.store.events(f.id) });
  const before = snapshot(), count = await f.count();
  const args = ['objective', 'verify', f.id, 'tests', f.file, '--decision', f.input.decisionId, '--request-id', f.input.requestId];
  for (let i = 0; i < 2; i++) blocked(await publicCall(f.state, args));
  assert.deepEqual(snapshot(), before); assert.equal(await f.count(), count);
  const queried = await publicCall(f.state, ['objective', 'reservation', f.input.decisionId, f.input.requestId]);
  assert.equal(queried.exitCode, 0, queried.stderr);
  const result = JSON.parse(queried.stdout);
  assert.equal(result.complete, false);
  assert.equal(result.status, state === 'consumed' ? 'LOCAL_PASSED' : state === 'handoff' ? 'HUMAN_HANDOFF' : 'NOT_RESERVED');
  const oldTrust = await publicCall(f.state, ['objective', 'verify', f.id, 'tests', f.file, '--trust', f.input.commandHash, '--acknowledge-unisolated']);
  assert.equal(oldTrust.exitCode, 1); assert.match(oldTrust.stdout.toString(), /Durable decision required/);
  assert.equal((await publicCall(f.state, ['objective', 'revoke-local', f.input.decisionId, '--actor', 'fixture'])).exitCode, 0);
  blocked(await publicCall(f.state, args));
  assert.equal(await f.count(), count);
});

test('AB1: both public Host ingress paths reject issuance and requests/submit/run/resume', async t => {
  const f = await setup(t), state = path.join(f.root, 'host-must-not-open');
  for (const host of ['codex', 'claude']) {
    for (const action of ['requests', 'submit', 'run', 'resume']) {
      const r = await publicCall(state, ['host', host, action, f.id, '--actor', 'operator']);
      assert.equal(r.exitCode, 1); assert.equal(JSON.parse(r.stdout).status, 'BLOCKED');
      assert.equal(existsSync(state), false);
    }
    const r = await publicCall(f.state, ['host', host, 'authorize-local', f.id, 'tests', f.file, f.file]);
    assert.equal(r.exitCode, 1); assert.equal(JSON.parse(r.stdout).status, 'BLOCKED');
  }
  assert.equal(await f.count(), 0);
});

// Final-review R1: real offline processes, persistent SQLite faults and restart.
for (const boundary of ['terminal-event', 'commit']) test(`P1-B fix: ${boundary} rollback never publishes success`, async t => {
  const f = await setup(t), before = task(f.store, f.id).revision;
  f.store.db.exec(boundary === 'terminal-event'
    ? "CREATE TRIGGER fail_terminal BEFORE INSERT ON events WHEN NEW.type='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED' BEGIN SELECT RAISE(ABORT,'terminal failure'); END"
    : `CREATE TABLE commit_fault (id TEXT REFERENCES product_tasks(id) DEFERRABLE INITIALLY DEFERRED);
       CREATE TRIGGER fail_commit AFTER INSERT ON events WHEN NEW.type='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED'
       BEGIN INSERT INTO commit_fault VALUES ('missing-task'); END`);
  const output = await command(process.execPath, f.argv);
  assert.equal(output.exitCode, 2, output.stdout + output.stderr);
  const result = JSON.parse(output.stdout).verificationRun;
  assert.equal(result.status, 'HUMAN_HANDOFF');
  assert.equal(result.reservation.result, undefined);
  assert.match(result.reason, boundary === 'commit' ? /FOREIGN KEY/ : /terminal failure/);
  assert.equal(task(f.store, f.id).revision, before);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
  const stored = f.store.db.prepare('SELECT state,body,runId FROM bootstrap_reservations').get();
  assert.equal(stored.state, 'HUMAN_HANDOFF');
  assert.equal(JSON.parse(stored.body).result, undefined);
  assert.equal(f.store.get(stored.runId).state, 'HUMAN_HANDOFF');
  const events = f.store.events(f.id);
  assert.equal(events.filter(e => e.type === 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED').length, 0);
  const observed = events.find(e => e.type === 'BOOTSTRAP_EXECUTION_EVIDENCE_OBSERVED');
  assert.equal(f.store.readArtifact(observed.body.evidenceRef).status, 'LOCAL_PASSED');
  assert.equal(result.decision.remainingExecutions, 0);
  const restarted = await command(process.execPath, [cli, '--state', f.state, 'objective', 'reservation', f.input.decisionId, f.input.requestId]);
  assert.equal(restarted.exitCode, 0); // Read-only status command succeeded, not execution.
  assert.equal(JSON.parse(restarted.stdout).status, 'HUMAN_HANDOFF');
  assert.equal((await command(process.execPath, f.argv)).exitCode, 2);
  assert.equal(await f.count(), 1);
});

test('P1-B fix: all request key permutations match; bound values and ordered arguments do not', async t => {
  const f = await setup(t);
  for (const patch of [{ executable: 'other' }, { directory: f.root }, { timeoutMs: f.request.timeoutMs + 1 },
    { args: [...f.request.args].reverse() }, { args: [...f.request.args, 'extra'] }, { extra: true }]) {
    await assert.rejects(() => executeDecision(f.store, f.id, 'tests', { ...f.request, ...patch }, f.input));
  }
  await assert.rejects(() => executeDecision(f.store, f.id, 'other', f.request, f.input));
  await assert.rejects(() => f.run({ requestId: randomUUID() }));
  await assert.rejects(() => f.run({ decisionId: randomUUID() }));
  assert.equal(await f.count(), 0);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining, 1);
  const permutations = keys => keys.length ? keys.flatMap((key, i) => permutations(keys.filter((_, j) => j !== i)).map(rest => [key, ...rest])) : [[]];
  const keys = ['directory', 'executable', 'args', 'timeoutMs'];
  for (const order of permutations(keys)) {
    const reordered = Object.fromEntries(order.map(key => [key, f.request[key]]));
    assert.equal((await executeDecision(f.store, f.id, 'tests', reordered, f.input)).status, 'LOCAL_PASSED');
  }
  assert.equal(await f.count(), 1);
});

for (const defect of ['handoff-result', 'missing-result', 'task', 'attempt', 'event', 'missing-evidence']) test(`P1-B fix: restart rejects unconfirmed success: ${defect}`, async t => {
  const f = await setup(t), result = await f.run(), r = result.reservation;
  if (defect === 'handoff-result') r.state = 'HUMAN_HANDOFF';
  if (defect === 'missing-result') delete r.result;
  f.store.db.prepare('UPDATE bootstrap_reservations SET state=?,body=?').run(r.state, JSON.stringify(r));
  if (defect === 'task') changeTask(f, value => delete value.bootstrap.verifications.tests);
  if (defect === 'attempt') f.store.db.prepare("UPDATE runs SET body='{}' WHERE id=?").run(r.runId);
  if (defect === 'event') f.store.db.prepare("DELETE FROM events WHERE type='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED'").run();
  if (defect === 'missing-evidence') await writeFile(path.join(f.state, 'artifacts', result.evidenceRef + '.json'), '{}');
  const reopened = new Store(f.state); enableTasks(reopened);
  try {
    if (defect === 'handoff-result') {
      const recovered = reservationStatus(reopened, f.input.decisionId, f.input.requestId);
      assert.equal(recovered.status, 'HUMAN_HANDOFF'); assert.equal(recovered.evidenceRef, undefined);
      assert.equal(recovered.reservation.result, undefined);
    } else assert.throws(() => reservationStatus(reopened, f.input.decisionId, f.input.requestId), /EVIDENCE_DEFECT|hash mismatch/);
  } finally { reopened.close(); }
  assert.equal(await f.count(), 1);
});
async function until(fn) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 30)); }
  throw Error('fixture checkpoint timed out');
}

test('P1-B: two offline CLI processes race one decision; restart/request replay launches at most once', async t => {
  const f = await setup(t, { slow: true });
  const before = task(f.store, f.id).revision;
  const outputs = await Promise.all([command(process.execPath, f.argv), command(process.execPath, f.argv)]);
  for (const output of outputs) assert.ok([0, 2].includes(output.exitCode), output.stdout + output.stderr);
  assert.equal(await f.count(), 1);
  const replay = await command(process.execPath, f.argv);
  assert.equal(replay.exitCode, 0, replay.stdout + replay.stderr);
  assert.equal(await f.count(), 1);
  assert.equal(task(f.store, f.id).revision, before + 1);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n, 1);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM workflow_attempts').get().n, 0);
  const report = JSON.parse(replay.stdout);
  assert.equal(report.verificationRun.reservation.reservedExecutions, 1);
  assert.equal(report.protectedVerification, 'UNSATISFIED'); assert.equal(report.complete, false);
  assert.equal(report.localVerification.tests.judgment.outcome, 'ESCALATE');
  await assert.rejects(() => f.run({ requestId: randomUUID() }), /binding mismatch/);
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', f.request, { trust: f.input.commandHash, acknowledgeUnisolated: true }), /Durable decision required/);
});

for (const mode of ['expired', 'revoked', 'revision', 'dependencies', 'capability', 'tree']) test(`P1-B: reject ${mode} before reservation`, async t => {
  const f = await setup(t);
  if (mode === 'expired') f.store.db.prepare('UPDATE bootstrap_decisions SET expires=0').run();
  if (mode === 'revoked') revokeDecision(f.store, f.input.decisionId, 'fixture-operator');
  if (mode === 'revision') changeTask(f, x => x.revision++);
  if (mode === 'dependencies') changeTask(f, x => x.bootstrap.states.todo = 'PENDING_FILESET');
  if (mode === 'capability') changeTask(f, x => x.settings.maxParallel = 2);
  if (mode === 'tree') await writeFile(path.join(f.dir, 'src/todo.mjs'), 'changed');
  await assert.rejects(() => f.run()); assert.equal(await f.count(), 0);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining, 1);
});

for (const mode of ['revoked', 'revision', 'tree', 'lease', 'expiry', 'policy']) test(`P1-B: ${mode} after reservation refuses spawn and never refunds`, async t => {
  const f = await setup(t);
  const result = await f.run({ hooks: { beforeSpawn: async r => {
    if (mode === 'revoked') revokeDecision(f.store, f.input.decisionId, 'fixture-operator');
    if (mode === 'revision') changeTask(f, x => x.revision++);
    if (mode === 'tree') await writeFile(path.join(f.dir, 'src/todo.mjs'), 'changed');
    if (mode === 'lease') f.store.db.prepare('UPDATE runs SET owner=? WHERE id=?').run('replacement', r.runId);
    if (mode === 'expiry') f.store.db.prepare('UPDATE bootstrap_decisions SET expires=0').run();
    if (mode === 'policy') changeTask(f, x => x.settings.maxParallel = 2);
  } } });
  assert.equal(result.status, 'HUMAN_HANDOFF'); assert.equal(await f.count(), 0);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining, 0);
  assert.equal((await f.run()).status, 'HUMAN_HANDOFF'); assert.equal(await f.count(), 0);
});

for (const mode of ['lease', 'revision', 'revoked']) test(`P1-B: ${mode} before commit rejects stale success but preserves Evidence`, async t => {
  const f = await setup(t);
  let ref;
  const r = await f.run({ hooks: { beforeCommit: (a, evidenceRef) => {
    ref = evidenceRef;
    if (mode === 'lease') f.store.db.prepare('UPDATE runs SET owner=? WHERE id=?').run('replacement', a.runId);
    if (mode === 'revision') changeTask(f, x => x.revision++);
    if (mode === 'revoked') revokeDecision(f.store, f.input.decisionId, 'fixture-operator');
  } } });
  assert.equal(await f.count(), 1); assert.equal(r.status, 'HUMAN_HANDOFF');
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
  assert.equal(f.store.readArtifact(ref).status, 'LOCAL_PASSED');
  await f.run(); assert.equal(await f.count(), 1);
});

for (const stage of ['reserved', 'running', 'beforeEvidence']) test(`P1-B: kill actual worker at ${stage}; restarted CLI never relaunches`, async t => {
  const f = await setup(t, { slow: stage === 'running' });
  const marker = path.join(f.root, 'checkpoint');
  const child = spawn(process.execPath, [worker, JSON.stringify({ state: f.state, taskId: f.id, request: f.request, ...f.input, marker, stage: stage === 'running' ? null : stage })], { stdio: 'ignore', windowsHide: true });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await until(async () => stage === 'running' ? await f.count() === 1 : await readFile(marker).then(() => true, () => false));
  child.kill('SIGKILL'); await exited;
  const recovered = await command(process.execPath, f.argv);
  assert.equal(recovered.exitCode, 2, recovered.stdout + recovered.stderr);
  assert.equal(JSON.parse(recovered.stdout).verificationRun.status, 'HUMAN_HANDOFF');
  assert.equal(await f.count(), stage === 'reserved' ? 0 : 1);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining, 0);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
  // A killed worker cannot promise descendant cleanup. Fixture child is finite.
  if (stage === 'running') await new Promise(r => setTimeout(r, 4200));
  assert.equal(await f.count(), stage === 'reserved' ? 0 : 1);
});

for (const failing of [false, true]) test(`P1-B: ${failing ? 'consecutive failure' : 'launch'} limit survives restart/new decision`, async t => {
  const f = await setup(t, { failing, maxAttempts: failing ? 2 : 1 });
  assert.equal((await f.run()).status, failing ? 'LOCAL_FAILED' : 'LOCAL_PASSED');
  const second = { ...f.input, decisionId: randomUUID(), requestId: randomUUID(), revision: task(f.store, f.id).revision };
  await issueDecision(f.store, f.id, 'tests', f.request, second);
  const reopened = new Store(f.state); enableTasks(reopened);
  try { await assert.rejects(() => executeDecision(reopened, f.id, 'tests', f.request, second), /HUMAN_HANDOFF.*budget/); }
  finally { reopened.close(); }
  assert.equal(await f.count(), 1);
});

test('P1-B: time budget expires before spawn; no execution and no refund', async t => {
  const f = await setup(t, { timeBudgetMs: 1000 });
  const r = await f.run({ hooks: { reserved: () => new Promise(resolve => setTimeout(resolve, 1100)) } });
  assert.equal(r.status, 'HUMAN_HANDOFF'); assert.equal(await f.count(), 0);
});

for (const clock of ['backwards', 'frozen']) test(`P0-2: ${clock} wall clock cannot extend live reservation budget`, async t => {
  const f = await setup(t, { timeBudgetMs: 1000 }), realNow = Date.now;
  try {
    const r = await f.run({ hooks: { reserved: async reservation => {
      Date.now = () => reservation.reservedAt - (clock === 'backwards' ? 5000 : 0);
      if (clock === 'frozen') await new Promise(resolve => setTimeout(resolve, 1100));
    } } });
    assert.equal(r.status, 'HUMAN_HANDOFF');
    assert.equal(await f.count(), 0);
    assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining, 0);
  } finally { Date.now = realNow; }
});

test('time: pre-issuance clock refuses execution without consuming a grant',async t=>{
  const f=await setup(t),real=Date.now;
  const issued=f.store.db.prepare('SELECT issued FROM bootstrap_decisions').get().issued;
  try {Date.now=()=>issued-1000;await assert.rejects(f.run(),/clock/i);}
  finally{Date.now=real;}
  assert.equal(await f.count(),0);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,1);
});
test('time: observed expired grant cannot revive after clock rollback and process restart',async t=>{
  const f=await setup(t),real=Date.now;
  try {Date.now=()=>f.input.expiresAt+1;await assert.rejects(f.run(),/expired/i);}
  finally{Date.now=real;}
  const r=await command(process.execPath,f.argv);
  assert.notEqual(r.exitCode,0,r.stdout);
  assert.equal(await f.count(),0);
  assert.equal(reservationStatus(f.store,f.input.decisionId,f.input.requestId).decision.status,'EXPIRED');
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,1);
});
test('time: expiry during inspection survives reservation transaction rollback',async t=>{
  const f=await setup(t),real=Date.now;
  const scheduled=setImmediate(()=>{Date.now=()=>f.input.expiresAt+1;});
  try {await assert.rejects(f.run(),/expired/i);}
  finally{clearImmediate(scheduled);Date.now=real;}
  assert.equal(reservationStatus(f.store,f.input.decisionId,f.input.requestId).decision.status,'EXPIRED');
  await assert.rejects(f.run(),/expired/i);
  assert.equal(await f.count(),0);
});

test('P1-B: cumulative reserved wall-time cannot reset with a fresh exact decision', async t => {
  const f = await setup(t, { maxAttempts: 2, timeoutSeconds: 15 });
  assert.equal((await f.run()).status, 'LOCAL_PASSED');
  const second = { ...f.input, decisionId: randomUUID(), requestId: randomUUID(), revision: task(f.store, f.id).revision };
  await issueDecision(f.store, f.id, 'tests', f.request, second);
  await assert.rejects(() => executeDecision(f.store, f.id, 'tests', f.request, second), /HUMAN_HANDOFF.*budget/);
  assert.equal(await f.count(), 1);
});

test('P1-B: expiry during actual execution cancels and never attaches success', async t => {
  const f = await setup(t, { slow: true });
  const running = f.run(); await until(async () => await f.count() === 1);
  f.store.db.prepare('UPDATE bootstrap_decisions SET expires=0').run();
  const result = await running;
  assert.equal(result.status, 'HUMAN_HANDOFF'); assert.equal(await f.count(), 1);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
});

test('P1-B: forged/stale artifact cannot be reused as reservation evidence', async t => {
  const f = await setup(t); const r = await f.run();
  const e = f.store.readArtifact(r.evidenceRef);
  assert.equal(e.verifierIndependence, 'UNPROTECTED'); assert.equal(e.reservation.owner, r.reservation.owner);
  const bad = f.store.artifact({ ...e, reservation: { ...e.reservation, attemptId: 'forged' } });
  const stored = r.reservation; stored.result.evidenceRef = bad;
  f.store.db.prepare('UPDATE bootstrap_reservations SET body=? WHERE requestId=?').run(JSON.stringify(stored), f.input.requestId);
  assert.throws(() => reservationStatus(f.store, f.input.decisionId, f.input.requestId), /EVIDENCE_DEFECT/);
  changeTask(f, value => value.bootstrap.verifications.tests = bad);
  const report = await taskReport(f.store, f.id);
  assert.equal(report.localVerification.tests.state, 'EVIDENCE_INVALID');
  assert.equal(report.localVerification.tests.judgment, undefined);
});

test('P1-B: active lease replacement cancels the running command and rejects final success', async t => {
  const f = await setup(t, { slow: true });
  const running = f.run();
  await until(async () => await f.count() === 1);
  f.store.db.prepare("UPDATE runs SET owner='replacement' WHERE id IN (SELECT runId FROM bootstrap_reservations)").run();
  const result = await running;
  assert.equal(result.status, 'HUMAN_HANDOFF');
  assert.equal(await f.count(), 1);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
  assert.equal(f.store.db.prepare("SELECT owner FROM runs WHERE id IN (SELECT runId FROM bootstrap_reservations)").get().owner, 'replacement');
});

test('P1-B: corrupt observed artifact before commit cannot advance Task', async t => {
  const f = await setup(t);
  const result = await f.run({ hooks: { beforeCommit: async (r, ref) => {
    await writeFile(path.join(f.state, 'artifacts', ref + '.json'), '{}');
  } } });
  assert.equal(result.status, 'HUMAN_HANDOFF');
  assert.match(result.reason, /hash mismatch/);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
});

test('P1-B: missing trust, unlimited budget, hash as decision ID and stale approval are rejected', async t => {
  const f = await setup(t);
  for (const patch of [{ acknowledgeUnisolated: false }, { maxExecutions: 2 }, { timeBudgetMs: Infinity }, { decisionId: f.input.commandHash }, { revision: 0 }]) {
    await assert.rejects(() => issueDecision(f.store, f.id, 'tests', f.request, { ...f.input, decisionId: randomUUID(), requestId: randomUUID(), ...patch }));
  }
  assert.equal(await f.count(), 0);
});

test('P1-B: transaction rollback preserves approval and budget when event insertion fails', async t => {
  const f = await setup(t);
  f.store.db.exec("CREATE TEMP TRIGGER fail_reservation BEFORE INSERT ON events WHEN NEW.type='BOOTSTRAP_EXECUTION_RESERVED' BEGIN SELECT RAISE(ABORT,'fixture event failure'); END");
  await assert.rejects(() => f.run(), /fixture event failure/);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n, 0);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining, 1);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM runs WHERE id LIKE 'bootstrap-attempt-%'").get().n, 0);
  assert.equal(await f.count(), 0);
  f.store.db.exec('DROP TRIGGER fail_reservation');
  assert.equal((await f.run()).status, 'LOCAL_PASSED');
  assert.equal(await f.count(), 1);
});

test('P1-B: offline driver issues explicit decision JSON, exposes durable state and revokes without execution', async t => {
  const f = await setup(t);
  const input = { ...f.input, decisionId: randomUUID(), requestId: randomUUID() };
  const file = path.join(f.root, 'decision.json'); await writeFile(file, JSON.stringify(input));
  const call = args => command(process.execPath, [cli, '--state', f.state, 'objective', ...args]);
  const issued = await call(['authorize-local', f.id, 'tests', f.file, file]);
  assert.equal(issued.exitCode, 0, issued.stdout + issued.stderr);
  assert.equal(JSON.parse(issued.stdout).status, 'ISSUED');
  assert.equal((await call(['revoke-local', input.decisionId, '--actor', 'fixture-operator'])).exitCode, 0);
  const status = await call(['reservation', input.decisionId, input.requestId]);
  assert.equal(status.exitCode, 0, status.stdout + status.stderr);
  assert.equal(JSON.parse(status.stdout).decision.status, 'REVOKED');
  assert.equal(await f.count(), 0);
});
