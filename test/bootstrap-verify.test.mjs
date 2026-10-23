import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { judge } from '../src/alpha/judge.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { classifyLocalResult } from '../src/verification/backends.mjs';
import { modifyFiles } from '../src/workflow/bootstrap-files.mjs';
import { enableTasks, createTask, submitTaskDraft, prepareTask, submitBootstrapFiles, approveTask, materializeTask, verifyTask, recordedDigests, bootstrapView, task } from '../src/product/tasks.mjs';
import { taskReport } from '../src/product/report.mjs';
import { dispatchProduct } from '../src/product/cli.mjs';

// The vertical path the Todo+Calendar trial could not take: a bootstrap DAG whose
// test item runs, fails, is repaired through an approved modification of an
// existing file, and is verified again. Local results are never protected.
const GOAL = 'Todo + Calendar 일정 관리 웹앱을 새로 만든다';
const files = { todo: ['package.json', 'src/todo.mjs', 'test/todo.test.mjs'], calendar: ['src/calendar.mjs', 'test/calendar.test.mjs'] };
const BUGGY = 'export const add = (list, t) => list;\n', FIXED = 'export const add = (list, t) => [...list, t];\n';
const contents = {
  'package.json': '{"type":"module"}\n', 'src/todo.mjs': BUGGY,
  'test/todo.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/todo.mjs';\ntest('add appends', () => assert.equal(add([], 'a').length, 1));\n",
  'src/calendar.mjs': 'export const byDate = () => ({});\n',
  'test/calendar.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { byDate } from '../src/calendar.mjs';\ntest('calendar groups', () => assert.deepEqual(byDate(), {}));\n" };
function draft(probeRef, { protectedItem = true } = {}) {
  return { schemaVersion: 1, kind: 'BootstrapDraft', objective: GOAL, probeRef,
    requirements: ['Create, complete and delete todos', 'Show todos with due dates on a monthly calendar'], openQuestions: [],
    decisions: [{ topic: 'stack', choice: 'Node 24 ESM with node:test', alternatives: ['Vite'], rationale: 'smallest verifiable start' }],
    plannedFiles: [{ path: 'package.json', purpose: 'module type' }, { path: 'src/todo.mjs', purpose: 'todo store' }, { path: 'src/calendar.mjs', purpose: 'calendar' }],
    plannedTests: [{ path: 'test/todo.test.mjs', criteria: ['todoCrud'] }, { path: 'test/calendar.test.mjs', criteria: ['calendarView'] }],
    criteria: [{ id: 'todoCrud', description: 'Todo add', tests: ['test/todo.test.mjs'] }, { id: 'calendarView', description: 'grouping', tests: ['test/calendar.test.mjs'] }],
    scope: { includes: ['local MVP'], excludes: ['deployment'] }, risks: ['time zones'],
    workItems: [
      { id: 'requirements', kind: 'planning', dependencies: [], acceptanceCriteria: ['requirements recorded'], files: [] },
      { id: 'todo', kind: 'local-edit', dependencies: ['requirements'], acceptanceCriteria: ['todoCrud'], files: files.todo },
      { id: 'calendar', kind: 'local-edit', dependencies: ['todo'], acceptanceCriteria: ['calendarView'], files: files.calendar },
      { id: 'tests', kind: 'local-verification', dependencies: ['todo', 'calendar'], acceptanceCriteria: ['node --test passes locally'], files: [] },
      ...(protectedItem ? [{ id: 'review-verify', kind: 'protected-verification', dependencies: ['tests'], acceptanceCriteria: ['protected verification'], files: [] }] : [])] };
}
async function prepared(options) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-verify-'))), dir = path.join(root, 'repo');
  await mkdir(dir); requireSuccess(await git(dir, ['init']), 'init');
  const state = path.join(root, 'state'), store = new Store(state); enableTasks(store);
  const created = await createTask(store, dir, GOAL), id = created.id;
  const plan = store.readArtifact(task(store, id).planRef);
  await submitTaskDraft(store, id, { revision: task(store, id).revision, proposal: draft(plan.probe.probeHash, options) });
  await prepareTask(store, id);
  return { root, dir, state, store, id };
}
const rev = f => task(f.store, f.id).revision;
async function propose(f, itemId, body) {
  return (await submitBootstrapFiles(f.store, f.id, { revision: rev(f), itemId, ...body })).approvalRequest;
}
const approve = (f, request) => approveTask(f.store, f.id, { actor: 'fixture-operator', workflowHash: request.filesetHash, expiresAt: Date.now() + 600000 });
async function create(f, itemId) {
  approve(f, await propose(f, itemId, { files: files[itemId].map(p => ({ path: p, content: contents[p] })) }));
  return materializeTask(f.store, f.id, itemId);
}
async function built(options) { const f = await prepared(options); await create(f, 'todo'); await create(f, 'calendar'); return f; }
const request = f => ({ executable: process.execPath, args: ['--test', '--test-reporter=tap'], directory: f.dir, timeoutMs: 60000 });
async function verify(f, itemId = 'tests', req = request(f), options = {}) {
  const inspected = await verifyTask(f.store, f.id, itemId, req);
  return verifyTask(f.store, f.id, itemId, req, { trust: inspected.commandHash, acknowledgeUnisolated: true, ...options });
}
const view = async f => Object.fromEntries((await taskReport(f.store, f.id)).bootstrap.items.map(i => [i.id, i]));
const kinds = async f => (await taskReport(f.store, f.id)).nextActions.map(a => a.kind);
async function repair(f, content = FIXED) {
  const evidenceRef = task(f.store, f.id).bootstrap.verifications.tests;
  const base = recordedDigests(f.store, task(f.store, f.id))['src/todo.mjs'];
  return propose(f, 'todo', { repair: { verificationItem: 'tests', evidenceRef }, files: [{ path: 'src/todo.mjs', content, baseSha256: base }] });
}

test('bootstrap Tests WorkItem runs a real failing test, stores LOCAL_FAILED evidence and reads it back from a new Store', async () => {
  const f = await prepared();
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f)), /Dependencies not satisfied: todo, calendar/);
  await create(f, 'todo'); await create(f, 'calendar');
  const before = { events: f.store.events(f.id).length, revision: rev(f) };
  const inspected = await verifyTask(f.store, f.id, 'tests', request(f));
  assert.equal(inspected.status, 'TRUST_REQUIRED');
  assert.deepEqual({ events: f.store.events(f.id).length, revision: rev(f) }, before, 'inspection records nothing');
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f), { trust: 'f'.repeat(64), acknowledgeUnisolated: true }), /Explicit trust/);
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f), { trust: inspected.commandHash }), /Explicit trust/);
  const result = await verifyTask(f.store, f.id, 'tests', request(f), { trust: inspected.commandHash, acknowledgeUnisolated: true });
  assert.deepEqual([result.status, result.exitCode, result.tests, result.passed, result.failed, result.complete], ['LOCAL_FAILED', 1, 2, 1, 1, false]);
  const event = f.store.events(f.id).at(-1);
  assert.deepEqual([event.type, event.body.evidenceRef, event.body.status], ['BOOTSTRAP_LOCAL_VERIFICATION_RECORDED', result.evidenceRef, 'LOCAL_FAILED']);
  f.store.close();
  const reopened = new Store(f.state); f.store = reopened;
  const evidence = reopened.readArtifact(task(reopened, f.id).bootstrap.verifications.tests);
  assert.equal(hash(Buffer.from(JSON.stringify(evidence))), result.evidenceRef);
  assert.deepEqual([evidence.kind, evidence.taskId, evidence.itemId, evidence.status, evidence.authority, evidence.protectedVerification, evidence.complete],
    ['BootstrapLocalVerification', f.id, 'tests', 'LOCAL_FAILED', 'LOCAL_EXECUTED', 'UNSATISFIED', false]);
  assert.equal(evidence.command.commandHash, inspected.commandHash);
  assert.equal(evidence.observed.exitCode, 1); assert.equal(evidence.observed.evidenceIntegrity, 'MATCHED');
  assert.deepEqual(evidence.fileDigests, recordedDigests(reopened, task(reopened, f.id)));
  assert.equal(evidence.fileDigests['src/todo.mjs'], hash(BUGGY));
  assert.match(evidence.log, /not ok/);
  const report = await taskReport(reopened, f.id), items = await view(f);
  assert.deepEqual([report.verification, report.protectedVerification, report.complete], ['LOCAL_ONLY_UNPROTECTED', 'UNSATISFIED', false]);
  assert.deepEqual([items.tests.state, items['review-verify'].waitingOn], ['LOCAL_FAILED', ['tests']]);
  assert.deepEqual(await kinds(f), ['REPAIR_REQUIRED']);
  assert.equal(judge(evidence).outcome, 'ESCALATE');
});

test('approved repair modifies only the owning item, invalidates the failure and a new trusted run passes; protected stays unsatisfied', async () => {
  const f = await built();
  const failed = await verify(f);
  assert.equal(failed.status, 'LOCAL_FAILED');
  const calendarRun = task(f.store, f.id).bootstrap.filesets.calendar, calendarBefore = f.store.get(calendarRun);
  const request1 = await repair(f);
  assert.deepEqual([request1.operation, request1.files.map(x => [x.path, x.operation, x.baseSha256, x.sha256])], ['modify', [['src/todo.mjs', 'modify', hash(BUGGY), hash(FIXED)]]]);
  assert.deepEqual(await kinds(f), ['AWAIT_FILESET_APPROVAL']);
  assert.equal((await view(f)).tests.waitingOn.join(), 'todo', 'the reopened item blocks verification until repaired');
  approve(f, request1);
  assert.deepEqual(await kinds(f), ['MATERIALIZE']);
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f)), /Dependencies not satisfied: todo/);
  const written = await materializeTask(f.store, f.id, 'todo');
  assert.deepEqual([written.status, written.operation, written.results.map(r => r.status), written.staleVerifications], ['MATERIALIZED', 'modify', ['MODIFIED'], ['tests']]);
  assert.equal(task(f.store, f.id).bootstrap.states.tests, 'VERIFICATION_STALE', 'the stored state is invalidated, not only the derived one');
  assert.equal(await readFile(path.join(f.dir, 'src/todo.mjs'), 'utf8'), FIXED);
  assert.equal(recordedDigests(f.store, task(f.store, f.id))['src/todo.mjs'], hash(FIXED));
  const items = await view(f);
  assert.deepEqual([items.todo.state, items.calendar.state, items.tests.state], ['MATERIALIZED', 'MATERIALIZED', 'VERIFICATION_STALE']);
  assert.deepEqual(f.store.get(calendarRun), calendarBefore, 'an unrelated completed item is not reopened');
  assert.deepEqual(await kinds(f), ['RUN_LOCAL_VERIFICATION']);
  // The trust reviewed for the failing tree cannot authorize the repaired one.
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f), { trust: failed.commandHash, acknowledgeUnisolated: true }), /Explicit trust/);
  const passed = await verify(f);
  assert.deepEqual([passed.status, passed.tests, passed.passed, passed.failed], ['LOCAL_PASSED', 2, 2, 0]);
  assert.notEqual(passed.commandHash, failed.commandHash);
  const after = await view(f), report = await taskReport(f.store, f.id);
  assert.deepEqual([after.tests.state, after['review-verify'].waitingOn, after['review-verify'].capability], ['LOCAL_PASSED', [], 'BLOCKED']);
  assert.deepEqual(after['review-verify'].missing, ['protected-verifier', 'protected-evidence', 'protected-inputs']);
  assert.deepEqual(report.nextActions.map(a => a.kind), ['LOCAL_WORK_COMPLETE', 'PROTECTED_VERIFICATION_UNSATISFIED']);
  assert.deepEqual([report.verification, report.protectedVerification, report.complete], ['LOCAL_ONLY_UNPROTECTED', 'UNSATISFIED', false]);
  const evidence = f.store.readArtifact(passed.evidenceRef);
  assert.equal(judge(evidence).outcome, 'ESCALATE');
  assert.equal(judge({ ...evidence.observed, authority: evidence.authority }).outcome, 'ESCALATE');
  // The failing evidence and the completed create fileset stay on record.
  assert.ok(f.store.readArtifact(failed.evidenceRef).status === 'LOCAL_FAILED');
  assert.deepEqual(task(f.store, f.id).bootstrap.history.map(h => [h.itemId, h.state]), [['todo', 'COMPLETED']]);
});

test('a local pass is not reused after the files change outside CodeFleet', async () => {
  const f = await built(); await verify(f);
  approve(f, await repair(f)); await materializeTask(f.store, f.id, 'todo');
  assert.equal((await verify(f)).status, 'LOCAL_PASSED');
  await writeFile(path.join(f.dir, 'src/calendar.mjs'), 'export const byDate = () => ({ changed: true });\n');
  const report = await taskReport(f.store, f.id);
  assert.deepEqual(report.bootstrap.drift, ['src/calendar.mjs']);
  assert.equal(report.bootstrap.items.find(i => i.id === 'tests').state, 'VERIFICATION_STALE');
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f)), /Files changed outside CodeFleet: src\/calendar\.mjs/);
});

test('a stored LOCAL_PASSED is derived stale when the recorded digests no longer match its evidence', async () => {
  const f = await built(); await verify(f);
  approve(f, await repair(f)); await materializeTask(f.store, f.id, 'todo');
  assert.equal((await verify(f)).status, 'LOCAL_PASSED');
  // Simulates a write path that recorded new digests but forgot to invalidate the stored state.
  const current = task(f.store, f.id);
  const digests = { ...current.bootstrap.digests, 'src/todo.mjs': hash('a newer CodeFleet write') };
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify({ ...current, bootstrap: { ...current.bootstrap, digests } }), f.id);
  assert.equal(task(f.store, f.id).bootstrap.states.tests, 'LOCAL_PASSED');
  const report = await taskReport(f.store, f.id);
  assert.equal(report.bootstrap.items.find(i => i.id === 'tests').state, 'VERIFICATION_STALE');
  // Without any disk observation, the digest comparison alone must catch it.
  assert.equal(bootstrapView(f.store, f.id).items.find(i => i.id === 'tests').state, 'VERIFICATION_STALE');
  assert.ok(!report.nextActions.some(a => a.kind === 'NO_FURTHER_ACTION' || a.kind === 'LOCAL_WORK_COMPLETE'));
});

test('an externally modified file is never overwritten; the repair waits and retries after the conflict is resolved by hand', async () => {
  const f = await built(); await verify(f);
  const approved = await repair(f); approve(f, approved);
  const external = 'export const add = (list, t) => list.concat(t); // user edit\n';
  await writeFile(path.join(f.dir, 'src/todo.mjs'), external);
  const conflict = await materializeTask(f.store, f.id, 'todo');
  assert.deepEqual([conflict.status, conflict.results.map(r => r.status), conflict.staleVerifications], ['CONFLICT', ['CONFLICT'], []]);
  assert.equal(await readFile(path.join(f.dir, 'src/todo.mjs'), 'utf8'), external);
  assert.equal((await view(f)).todo.state, 'REPAIR_CONFLICT');
  assert.equal(recordedDigests(f.store, task(f.store, f.id))['src/todo.mjs'], hash(BUGGY), 'nothing CodeFleet did not write is recorded');
  await writeFile(path.join(f.dir, 'src/todo.mjs'), BUGGY);
  const retried = await materializeTask(f.store, f.id, 'todo');
  assert.deepEqual([retried.status, retried.results.map(r => r.status)], ['MATERIALIZED', ['MODIFIED']]);
  assert.equal(await readFile(path.join(f.dir, 'src/todo.mjs'), 'utf8'), FIXED);
});

test('an interrupted repair writes nothing more on cancel and a retry completes only what is left', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-modify-')));
  await writeFile(path.join(root, 'a.mjs'), 'a1'); await writeFile(path.join(root, 'b.mjs'), 'b1');
  const entries = [{ path: 'a.mjs', content: 'a2', sha256: hash('a2'), baseSha256: hash('a1'), bytes: 2 }, { path: 'b.mjs', content: 'b2', sha256: hash('b2'), baseSha256: hash('b1'), bytes: 2 }];
  let writes = 0;
  const first = await modifyFiles(root, entries, { cancelled: () => writes > 0, record: () => { writes++; } });
  assert.deepEqual([first.status, first.results.map(r => r.status)], ['INTERRUPTED', ['MODIFIED', 'NOT_RUN']]);
  assert.deepEqual([await readFile(path.join(root, 'a.mjs'), 'utf8'), await readFile(path.join(root, 'b.mjs'), 'utf8')], ['a2', 'b1']);
  const second = await modifyFiles(root, entries);
  assert.deepEqual([second.status, second.results.map(r => r.status)], ['MATERIALIZED', ['ALREADY_MODIFIED', 'MODIFIED']]);
  await writeFile(path.join(root, 'b.mjs'), 'b3');
  const third = await modifyFiles(root, [{ ...entries[0], content: 'a4', sha256: hash('a4'), baseSha256: hash('a2') }, entries[1]]);
  assert.deepEqual([third.status, third.written], ['CONFLICT', false]);
  assert.equal(await readFile(path.join(root, 'a.mjs'), 'utf8'), 'a2', 'a conflict anywhere writes nothing');
});

test('repair proposals are bound to current failure evidence, owned paths and recorded digests; superseded and completed filesets are not approvable', async () => {
  const f = await built();
  const base = recordedDigests(f.store, task(f.store, f.id))['src/todo.mjs'];
  const entry = { path: 'src/todo.mjs', content: FIXED, baseSha256: base };
  await assert.rejects(() => propose(f, 'todo', { repair: { verificationItem: 'tests', evidenceRef: 'a'.repeat(64) }, files: [entry] }), /current LOCAL_FAILED evidence of tests/);
  await verify(f);
  const evidenceRef = task(f.store, f.id).bootstrap.verifications.tests, bind = { verificationItem: 'tests', evidenceRef };
  // The state is LOCAL_FAILED, but the cited evidence is not the recorded one.
  await assert.rejects(() => propose(f, 'todo', { repair: { verificationItem: 'tests', evidenceRef: 'a'.repeat(64) }, files: [entry] }), /current LOCAL_FAILED evidence of tests/);
  await assert.rejects(() => propose(f, 'todo', { repair: { verificationItem: 'review-verify', evidenceRef }, files: [entry] }), /local-verification item that depends on todo/);
  await assert.rejects(() => propose(f, 'todo', { repair: bind, files: [{ ...entry, path: 'src/calendar.mjs' }] }), /not owned by todo/);
  await assert.rejects(() => propose(f, 'todo', { repair: bind, files: [{ ...entry, baseSha256: hash('something else') }] }), /Base digest differs/);
  await assert.rejects(() => propose(f, 'todo', { repair: bind, files: [{ ...entry, content: BUGGY }] }), /does not change/);
  await assert.rejects(() => propose(f, 'todo', { repair: bind, files: [{ path: '../escape.mjs', content: FIXED, baseSha256: base }] }), /Unsafe relative file path/);
  await assert.rejects(() => propose(f, 'tests', { repair: bind, files: [entry] }), /only for local-edit/);
  const createHash = f.store.get(task(f.store, f.id).bootstrap.filesets.todo).contractHash;
  const first = await propose(f, 'todo', { repair: bind, files: [entry] }); approve(f, first);
  const second = await propose(f, 'todo', { repair: bind, files: [{ ...entry, content: 'export const add = (l, t) => [...l, t];\n' }] });
  assert.throws(() => approve(f, first), /No proposed fileset matches/);
  assert.throws(() => approveTask(f.store, f.id, { actor: 'fixture-operator', workflowHash: createHash, expiresAt: Date.now() + 60000 }), /No proposed fileset matches/);
  assert.equal(f.store.get(first.runId).control, 'cancel');
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM workflow_approvals WHERE runId=?').get(first.runId).n, 0);
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /approval required or already terminal/);
  approve(f, second);
  assert.equal((await materializeTask(f.store, f.id, 'todo')).status, 'MATERIALIZED');
  assert.deepEqual(task(f.store, f.id).bootstrap.history.map(h => h.state), ['COMPLETED'], 'only the completed create fileset is history; the superseded repair is cancelled');
  // The cited evidence is the recorded one, but it is a pass: nothing to repair.
  const passed = await verify(f);
  assert.equal(passed.status, 'LOCAL_PASSED');
  const now = recordedDigests(f.store, task(f.store, f.id))['src/todo.mjs'];
  await assert.rejects(() => propose(f, 'todo', { repair: { verificationItem: 'tests', evidenceRef: passed.evidenceRef }, files: [{ ...entry, content: BUGGY, baseSha256: now }] }), /current LOCAL_FAILED evidence of tests/);
});

test('an item left in REPAIR_CONFLICT is not reopened by another repair proposal', async () => {
  const f = await built(); await verify(f);
  approve(f, await repair(f));
  await writeFile(path.join(f.dir, 'src/todo.mjs'), 'export const add = () => []; // user edit\n');
  assert.equal((await materializeTask(f.store, f.id, 'todo')).status, 'CONFLICT');
  await assert.rejects(() => repair(f, 'export const add = (l, t) => l.concat([t]);\n'), /todo is not materialized/);
  assert.deepEqual(await kinds(f), ['MATERIALIZE']);
});

test('local results are classified from the runner summary, not the exit code alone', () => {
  const ok = { exitCode: 0, tests: 2, passed: 2, failed: 0, skipped: 0, todo: 0, interrupted: false, truncated: false };
  const cases = [
    [ok, true, 'LOCAL_PASSED'],
    [{ ...ok, exitCode: 1, passed: 1, failed: 1 }, true, 'LOCAL_FAILED'],
    [{ ...ok, exitCode: 1 }, true, 'INCONCLUSIVE'],
    [{ ...ok, exitCode: 0, passed: 1, failed: 1 }, true, 'INCONCLUSIVE'],
    [{ ...ok, exitCode: 1, tests: null, passed: null, failed: null, skipped: null, todo: null }, true, 'INCONCLUSIVE'],
    [{ ...ok, tests: 0, passed: 0 }, true, 'INCONCLUSIVE'],
    [{ ...ok, passed: 1, skipped: 1 }, true, 'INCONCLUSIVE'],
    [{ ...ok, exitCode: 1, passed: 1, failed: 1, interrupted: true }, true, 'INCONCLUSIVE'],
    [{ ...ok, exitCode: 1, passed: 1, failed: 1, truncated: true }, true, 'INCONCLUSIVE'],
    [{ ...ok, exitCode: 1, passed: 1, failed: 1 }, false, 'INCONCLUSIVE']];
  assert.deepEqual(cases.map(([r, integrity]) => classifyLocalResult(r, integrity).status), cases.map(c => c[2]));
});

test('environment errors, tree mismatch and interruption are recorded INCONCLUSIVE; a retry needs its own trust and runs', async () => {
  const f = await built();
  const env = await verify(f, 'tests', { ...request(f), args: ['-e', 'process.exit(3)'] });
  assert.deepEqual([env.status, env.exitCode, f.store.readArtifact(env.evidenceRef).reason], ['INCONCLUSIVE', 3, 'Test summary missing or ambiguous']);
  assert.deepEqual(await kinds(f), ['RUN_LOCAL_VERIFICATION']);
  const mutate = await verify(f, 'tests', { ...request(f), args: ['-e', "require('node:fs').writeFileSync('extra.txt','x');console.log('# tests 1\\n# pass 0\\n# fail 1\\n# skipped 0\\n# todo 0');process.exit(1)"] });
  assert.deepEqual([mutate.status, mutate.evidenceIntegrity], ['INCONCLUSIVE', 'MISMATCH']);
  // extra.txt is outside the owned paths, so the repository no longer matches its plan.
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f)), /Repository changed outside the approved filesets/);
  const g = await built();
  const slow = { ...request(g), args: ['-e', 'setTimeout(() => {}, 20000)'] };
  const inspected = await verifyTask(g.store, g.id, 'tests', slow);
  let polls = 0;
  const cancelled = await verifyTask(g.store, g.id, 'tests', slow, { trust: inspected.commandHash, acknowledgeUnisolated: true, cancelled: () => ++polls > 3 });
  assert.equal(cancelled.status, 'INCONCLUSIVE');
  assert.equal(g.store.readArtifact(cancelled.evidenceRef).observed.interrupted, true);
  const retried = await verify(g);
  assert.equal(retried.status, 'LOCAL_FAILED');
  assert.equal(g.store.events(g.id).filter(e => e.type === 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED').length, 2);
});

test('verify refuses other kinds, other directories and a legacy task without a digest map still verifies and repairs', async () => {
  const f = await built();
  await assert.rejects(() => verifyTask(f.store, f.id, 'review-verify', request(f)), /protected-verification is not local verification/);
  await assert.rejects(() => verifyTask(f.store, f.id, 'todo', request(f)), /local-edit is not local verification/);
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', { ...request(f), directory: path.join(f.dir, 'src') }), /repository root/);
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', { ...request(f), extra: 1 }), /Invalid Local command fields/);
  // Tasks recorded before this change carry no digests: derive them from completed filesets.
  const current = task(f.store, f.id), { digests, ...legacy } = current.bootstrap;
  assert.ok(digests);
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify({ ...current, bootstrap: { ...legacy, states: { ...legacy.states, tests: 'BLOCKED' } } }), f.id);
  assert.deepEqual(recordedDigests(f.store, task(f.store, f.id)), digests);
  assert.equal((await view(f)).tests.state, 'PENDING_VERIFICATION');
  assert.equal((await verify(f)).status, 'LOCAL_FAILED');
  approve(f, await repair(f));
  assert.equal((await materializeTask(f.store, f.id, 'todo')).status, 'MATERIALIZED');
});

test('nextAction follows the workflow: propose, await approval, materialize, verify, nothing left', async () => {
  const f = await prepared({ protectedItem: false });
  const continuation = async () => (await taskReport(f.store, f.id)).continuation;
  assert.deepEqual((await continuation()).next, { kind: 'PROPOSE_FILESET', itemId: 'todo' });
  assert.equal((await continuation()).status, 'HOST_PROPOSAL_REQUIRED');
  assert.deepEqual(await kinds(f), ['PROPOSE_FILESET']);
  assert.deepEqual((await taskReport(f.store, f.id)).nextActions[0].items, ['todo']);
  const todo = await propose(f, 'todo', { files: files.todo.map(p => ({ path: p, content: contents[p] })) });
  assert.equal((await continuation()).status, 'AWAIT_OPERATOR');
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /approval required/);
  assert.deepEqual(await kinds(f), ['AWAIT_FILESET_APPROVAL']);
  approve(f, todo);
  assert.deepEqual(await kinds(f), ['MATERIALIZE']);
  await materializeTask(f.store, f.id, 'todo');
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /terminal/);
  assert.deepEqual((await continuation()).next, { kind: 'PROPOSE_FILESET', itemId: 'calendar' });
  assert.deepEqual(await kinds(f), ['PROPOSE_FILESET']);
  await create(f, 'calendar');
  const report = await taskReport(f.store, f.id);
  assert.equal(report.continuation.status, 'AWAIT_LOCAL_TRUST');
  assert.equal(report.continuation.executionGranted, false);
  assert.deepEqual(report.nextActions.map(a => [a.kind, a.items]), [['RUN_LOCAL_VERIFICATION', ['tests']]]);
  assert.doesNotMatch(report.nextAction, /PROPOSE_FILESET/);
  await verify(f); approve(f, await repair(f)); await materializeTask(f.store, f.id, 'todo'); await verify(f);
  const done = await taskReport(f.store, f.id);
  assert.deepEqual([done.nextActions.map(a => a.kind), done.complete], [['NO_FURTHER_ACTION'], false]);
  assert.equal(done.continuation.status, 'HUMAN_HANDOFF');
  assert.equal(done.continuation.taskRevision, rev(f));
  assert.equal(done.continuation.workflowHash, done.workflowHash);
  assert.equal(done.continuation.automaticReplay, false);
  assert.match(done.continuation.reason, /Objective is incomplete/);
  assert.deepEqual([done.localVerification.tests.judgment.outcome, done.localVerification.tests.judgment.authority,
    done.localVerification.tests.judgment.stateTransition], ['ESCALATE', 'LOCAL_EXECUTED', false]);
  const stored = task(f.store, f.id), events = f.store.events(f.id);
  await taskReport(f.store, f.id);
  assert.deepEqual(task(f.store, f.id), stored, 'advisory continuation and Judge never mutate state');
  assert.deepEqual(f.store.events(f.id), events);
});

test('continuation hands off failures and uncertain execution without reusing local trust', async () => {
  const f = await built({ protectedItem: false });
  const failed = await verify(f);
  const report = await taskReport(f.store, f.id);
  assert.equal(failed.status, 'LOCAL_FAILED');
  assert.equal(report.continuation.status, 'HUMAN_HANDOFF');
  assert.equal(report.continuation.next.kind, 'REPAIR_REQUIRED');
  assert.equal(report.localVerification.tests.judgment.outcome, 'ESCALATE');
  assert.equal(report.continuation.executionGranted, false);
  // A terminal-looking local state must not hide uncertain execution.
  const current = task(f.store, f.id);
  current.bootstrap.states.tests = 'INCONCLUSIVE';
  delete current.bootstrap.verifications;
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(current), f.id);
  const uncertain = await taskReport(f.store, f.id);
  assert.equal(uncertain.continuation.status, 'HUMAN_HANDOFF');
  assert.equal(uncertain.continuation.automaticReplay, false);
  assert.equal(uncertain.localVerification.tests.judgment, undefined);
});

test('continuation does not present stale evidence as a current Judge verdict', async () => {
  const f = await built({ protectedItem: false });
  await verify(f);
  await writeFile(path.join(f.dir, 'src/todo.mjs'), FIXED);
  const report = await taskReport(f.store, f.id);
  assert.equal(report.localVerification.tests.state, 'VERIFICATION_STALE');
  assert.equal(report.localVerification.tests.judgment, undefined);
  assert.equal(report.continuation.status, 'HUMAN_HANDOFF');
  assert.equal(report.continuation.reason, 'FILES_CHANGED_OUTSIDE_CODEFLEET');
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f)), /Files changed outside CodeFleet/);
  assert.equal(report.complete, false);
});

test('verification revision conflict preserves unattached evidence and cannot advance a changed task', async () => {
  const f = await built({ protectedItem: false });
  const before = task(f.store, f.id);
  let executed = 0;
  const backend = {
    async authorize() { return {}; },
    async verify() {
      executed++;
      const changed = { ...before, revision: before.revision + 1 };
      f.store.db.prepare('UPDATE product_tasks SET revision=?,body=? WHERE id=?').run(changed.revision, JSON.stringify(changed), f.id);
      return { status: 'INCONCLUSIVE', reason: 'Injected revision change during execution', authority: 'LOCAL_EXECUTED',
        log: '', stderr: '', exitCode: null, interrupted: true, protectedVerification: 'UNSATISFIED' };
    }
  };
  await assert.rejects(() => verifyTask(f.store, f.id, 'tests', request(f), {
    trust: 'fixture-only', acknowledgeUnisolated: true, backend
  }), /Task revision conflict; the executed result is preserved as evidence .* but is not attached/);
  assert.equal(executed, 1);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
  assert.equal(task(f.store, f.id).bootstrap.states.tests, 'PENDING_VERIFICATION');
  assert.equal((await taskReport(f.store, f.id)).continuation.automaticReplay, false);
});

test('objective verify CLI inspects without trust, requires both flags and keeps verify-local exit codes', async () => {
  const f = await built();
  const file = path.join(f.root, 'request.json'); await writeFile(file, JSON.stringify(request(f)));
  const inspect = await dispatchProduct(['verify', f.id, 'tests', file], { store: f.store });
  assert.deepEqual([inspect.exitCode, inspect.data.verificationRun.status], [2, 'TRUST_REQUIRED']);
  const commandHash = inspect.data.verificationRun.commandHash;
  await assert.rejects(() => dispatchProduct(['verify', f.id, 'tests', file, '--trust', commandHash], { store: f.store }), /must be given together/);
  const run = await dispatchProduct(['verify', f.id, 'tests', file, '--trust', commandHash, '--acknowledge-unisolated'], { store: f.store });
  assert.deepEqual([run.exitCode, run.data.verificationRun.status, run.data.complete], [2, 'LOCAL_FAILED', false]);
  // The standalone diagnostic keeps exit 2 for anything but LOCAL_PASSED; only the status word changed.
  const cli = path.resolve('src/alpha/cli.mjs');
  const spec = JSON.parse((await command(process.execPath, [cli, 'inspect-local', file])).stdout);
  const local = await command(process.execPath, [cli, 'verify-local', file, '--trust', spec.commandHash, '--acknowledge-unisolated']);
  assert.deepEqual([local.exitCode, JSON.parse(local.stdout).status], [2, 'LOCAL_FAILED']);
});

// Boundary characterization, NOT acceptance of durable one-shot authorization.
// Each CLI invocation below is an explicitly requested isolated fixture run.
// A future continuous executor must not mistake this reusable digest for a grant.
// Replace this gap characterization with cross-process duplicate rejection when
// the durable decision contract is implemented; do not preserve replay as a guarantee.
test('P1-B boundary: the same local hash can execute in two CLI processes without a reserved Attempt', async () => {
  const f = await built({ protectedItem: false });
  const inspected = await verifyTask(f.store, f.id, 'tests', request(f));
  const before = task(f.store, f.id);
  assert.equal(before.settings.maxAttempts, 1);
  const file = path.join(f.root, 'request.json');
  await writeFile(file, JSON.stringify(request(f)));
  const argv = [path.resolve('src/alpha/cli.mjs'), '--state', f.state, 'objective', 'verify', f.id,
    'tests', file, '--trust', inspected.commandHash, '--acknowledge-unisolated'];
  const evidenceRefs = [];
  for (let call = 0; call < 2; call++) {
    const response = await command(process.execPath, argv);
    assert.equal(response.exitCode, 2, response.stderr.toString());
    const report = JSON.parse(response.stdout);
    assert.equal(report.verificationRun.status, 'LOCAL_FAILED');
    assert.equal(report.verificationRun.tests, 2, 'native tests actually ran');
    assert.equal(report.verificationRun.commandHash, inspected.commandHash);
    const evidence = f.store.readArtifact(report.verificationRun.evidenceRef);
    assert.equal(evidence.observed.exitCode, 1);
    assert.equal(evidence.authority, 'LOCAL_EXECUTED');
    assert.equal(judge(evidence).outcome, 'ESCALATE');
    evidenceRefs.push(report.verificationRun.evidenceRef);
  }
  assert.notEqual(evidenceRefs[0], evidenceRefs[1]);
  assert.equal(task(f.store, f.id).revision, before.revision + 2);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM workflow_attempts').get().n, 0);
  assert.equal(f.store.events(f.id).filter(e => e.type === 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED').length, 2);
  // The existing API treats each call as new Operator consent. It supplies no
  // durable decision/expiry/revocation/budget receipt for automatic repetition.
  f.store.close();
});
