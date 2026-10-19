import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { requireSuccess } from '../src/alpha/process.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { definition, fromPlan, nextReady } from '../src/workflow/definition.mjs';
import { createWorkflow, approveWorkflow, reviseWorkflow, attempts, reserve } from '../src/workflow/persistence.mjs';
import { createRegistry } from '../src/providers/registry.mjs';
import { createClaudeAdapter } from '../src/providers/claude.mjs';
import { createCodexAdapter } from '../src/providers/codex.mjs';
import { CAPABILITIES } from '../src/providers/capabilities.mjs';
import { planIntent } from '../src/intent/engine.mjs';

const source = () => ({ schemaVersion: 1, goal: 'Repair arithmetic regressions with protected tests.', files: ['src/a.js', 'src/b.js'], context: ['src/a.js', 'src/b.js'], tests: ['test/a.test.js', 'test/b.test.js'], maxAttempts: 3, timeoutSeconds: 120, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
const item = (id, dependencies = []) => ({ id, dependencies, priority: 0, files: [`src/${id}.js`], tests: [`test/${id}.test.js`], acceptanceCriteria: ['Protected arithmetic regression passes'] });
const supported = () => ({ installed: true, identity: { id: 'claude', version: 'fake' }, capabilities: Object.fromEntries(CAPABILITIES.map(c => [c, { status: 'SUPPORTED' }])) });
async function setup(items = [item('a'), item('b', ['a'])]) {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-workflow-')), repo = path.join(root, 'repo');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  for (const n of ['a', 'b']) {
    await writeFile(path.join(repo, `src/${n}.js`), 'module.exports = (a,b) => a+b;');
    await writeFile(path.join(repo, `test/${n}.test.js`), `const test=require('node:test'),assert=require('node:assert/strict');test('${n}',()=>assert.equal(require('../src/${n}.js')(5,2),3));`);
  }
  requireSuccess(await git(repo, ['init']), 'init'); requireSuccess(await git(repo, ['add', '.']), 'add');
  requireSuccess(await git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']), 'fixture commit');
  const base = requireSuccess(await git(repo, ['rev-parse', 'HEAD']), 'base');
  const store = new Store(path.join(root, 'state')), contract = source();
  const graph = definition(contract, { workflowId: 'repair', base, items });
  const run = await createWorkflow(store, repo, graph, contract, 'workflow');
  const calls = [];
  const adapter = createClaudeAdapter({ runCommand: async (_exe, _args, options) => {
    const request = JSON.parse(options.input); calls.push(request.allowedFiles[0]);
    return { exitCode: 0, interrupted: false, truncated: false, stdout: Buffer.from(JSON.stringify({ structured_output: { summary: 'Fix arithmetic', edits: request.allowedFiles.map(f => ({ path: f, oldText: 'a+b', newText: 'a-b' })) }, total_cost_usd: 0.1 })), stderr: Buffer.alloc(0) };
  } }); adapter.probe = async () => supported();
  const dependencies = { workflowRegistry: createRegistry([adapter]), ready: async () => {}, verify: async ({ directory, tests }) => {
    const passed = (await Promise.all(tests.map(t => readFile(path.join(directory, t.replace('test/', 'src/').replace('.test.js', '.js')), 'utf8')))).filter(s => s.includes('a-b')).length;
    return { authority: 'HARNESS_EXECUTED', tests: tests.length, passed, failed: tests.length - passed, skipped: 0, todo: 0, exitCode: passed === tests.length ? 0 : 1, testNames: tests, interrupted: false, truncated: false };
  } };
  const approve = () => approveWorkflow(store, run.id, { actor: 'human-reviewer', workflowHash: store.get(run.id).contractHash, expiresAt: Date.now() + 60000 });
  return { root, repo, base, store, run, graph, contract, calls, dependencies, approve };
}
test('DAG rejects cycles, missing references, duplicates, scope and budget expansion', () => {
  const build = items => definition(source(), { workflowId: 'repair', base: 'a'.repeat(40), items });
  assert.throws(() => build([item('a', ['b']), item('b', ['a'])]), /Cyclic/);
  assert.throws(() => build([item('a', ['missing'])]), /Missing/);
  assert.throws(() => build([item('a'), item('a')]), /Duplicate/);
  assert.throws(() => build([{ ...item('a'), files: ['src/outside.js'] }]), /Scope/);
  assert.throws(() => build([item('a'), { ...item('b'), files: ['src/a.js'] }]), /overlapping/);
  assert.throws(() => definition({ ...source(), maxAttempts: 1 }, { workflowId: 'repair', base: 'a'.repeat(40), items: [item('a'), item('b')] }), /budget/);
  assert.equal(nextReady(build([item('b'), item('a')]), { a: 'READY', b: 'READY' }).id, 'a');
});
test('G3 validated plans compile, unresolved plans cannot auto-authorize workflows', async () => {
  const f = await setup();
  try {
    const unresolved = await planIntent(f.repo, f.contract.goal);
    assert.throws(() => fromPlan(unresolved, 'plan', [item('a')]), /NEEDS_INPUT/);
    const draft = { schemaVersion: 2, objective: f.contract.goal, base: f.base, files: ['src/a.js'], tests: ['test/a.test.js'], criteria: [{ description: 'Arithmetic', method: 'protected-tests', tests: ['test/a.test.js'] }], risks: [], unknowns: [], effects: ['local-edit'] };
    const planned = await planIntent(f.repo, f.contract.goal, { draftInput: JSON.stringify(draft) });
    const compiled = fromPlan(planned, 'plan', [item('a')]);
    assert.equal(compiled.workflow.sourceContractRef, hash(compiled.source));
    assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'WAITING_HUMAN');
    assert.equal(f.calls.length, 0);
  } finally { f.store.close(); }
});
test('sequential child Alpha runs and final integrated verification are distinct; requests idempotent', async () => {
  const f = await setup();
  try {
    assert.equal((await createWorkflow(f.store, f.repo, f.graph, f.contract, f.run.id)).id, f.run.id);
    f.approve(); const result = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(result.state, 'COMPLETED', result.reason); assert.deepEqual(f.calls, ['src/a.js', 'src/b.js']);
    assert.equal(result.workflowStagesComplete, true); assert.ok(result.finalRunId);
    assert.deepEqual(attempts(f.store, f.run.id).map(a => [a.itemId, a.status]), [['a', 'SUCCEEDED'], ['b', 'SUCCEEDED'], ['final', 'SUCCEEDED']]);
    assert.equal(Object.keys(f.store.readArtifact(result.acceptedHash).changedFiles).length, 2);
    assert.equal(f.store.readArtifact(result.evidenceHash).tests, 2);
    assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'COMPLETED'); assert.equal(f.calls.length, 2);
  } finally { f.store.close(); }
});
test('verification failure blocks descendants and cannot be retried as the same attempt', async () => {
  const f = await setup();
  try {
    f.approve(); f.dependencies.verify = async ({ tests }) => ({ authority: 'HARNESS_EXECUTED', exitCode: 1, tests: tests.length, passed: 0, failed: tests.length, skipped: 0, todo: 0, testNames: tests });
    const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.deepEqual(f.calls, ['src/a.js']);
    await execute(f.store, f.run.id, f.dependencies); assert.equal(f.calls.length, 1);
    assert.equal(attempts(f.store, f.run.id).length, 1);
    const changed = definition(f.contract, { workflowId: 'repair', workflowVersion: 2, base: f.base, items: [{ ...item('a'), acceptanceCriteria: ['Changed after execution'] }, item('b', ['a'])] });
    assert.throws(() => reviseWorkflow(f.store, f.run.id, 1, changed), /immutable/);
  } finally { f.store.close(); }
});
test('provider-only evidence never satisfies WorkItem or final success', async () => {
  const f = await setup();
  try {
    f.approve(); const verify = f.dependencies.verify;
    f.dependencies.verify = async req => ({ ...await verify(req), authority: 'PROVIDER_REPORTED_ONLY' });
    const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.equal(r.acceptedHash, undefined); assert.equal(f.calls.length, 0);
  } finally { f.store.close(); }
});
test('graph revisions require fresh approval and CAS; old snapshots stay unchanged', async () => {
  const f = await setup([item('a')]);
  try {
    f.approve(); const next = definition(f.contract, { workflowId: 'repair', workflowVersion: 2, base: f.base, items: [item('a'), item('b', ['a'])] });
    const revised = reviseWorkflow(f.store, f.run.id, 1, next);
    assert.equal(revised.state, 'WAITING_APPROVAL'); assert.equal(revised.revision, 2);
    assert.throws(() => reviseWorkflow(f.store, f.run.id, 1, next), /conflict/);
    assert.equal(f.store.db.prepare('SELECT digest FROM graph_revisions WHERE revision=1').get().digest, f.graph.workflowHash);
    await execute(f.store, f.run.id, f.dependencies); assert.equal(f.calls.length, 0);
    f.approve(); assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'COMPLETED');
  } finally { f.store.close(); }
});
test('reserved attempt prevents graph mutation and relaunch after process restart', async () => {
  const f = await setup(); let store = f.store;
  try {
    f.approve(); const owner = store.claim(f.run.id); const current = store.get(f.run.id); current.states.a = 'READY'; store.save(current, owner, 'TEST_READY');
    reserve(store, store.get(f.run.id), owner, 'a', { ...f.contract, files: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1 });
    store.release(f.run.id, owner);
    const next = definition(f.contract, { workflowId: 'repair', workflowVersion: 2, base: f.base, items: [item('a'), item('b')] });
    assert.throws(() => reviseWorkflow(store, f.run.id, 1, next), /active/);
    store.close(); store = new Store(path.join(f.root, 'state'));
    const r = await execute(store, f.run.id, f.dependencies);
    assert.equal(r.state, 'RECONCILING'); assert.equal(f.calls.length, 0);
    const child = attempts(store, f.run.id)[0]; await assert.rejects(execute(store, child.childId, f.dependencies), /active coordinator/);
  } finally { store.close(); }
});
test('recovery reconciles completed child evidence without a second model call', async () => {
  const f = await setup();
  try {
    f.approve(); const owner = f.store.claim(f.run.id); const current = f.store.get(f.run.id); current.states.a = 'READY'; f.store.save(current, owner, 'TEST_READY');
    const child = reserve(f.store, f.store.get(f.run.id), owner, 'a', { ...f.contract, files: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1 });
    const adapter = f.dependencies.workflowRegistry.get('claude');
    await execute(f.store, child.id, { ...f.dependencies, propose: r => adapter.execute(r) }, { workflowOwner: owner });
    f.store.release(f.run.id, owner);
    assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'COMPLETED');
    assert.deepEqual(f.calls, ['src/a.js', 'src/b.js']);
  } finally { f.store.close(); }
});
test('migration preserves V1 rows/events/artifacts and is idempotent on reopen', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-migration-')); let store = new Store(root);
  try {
    const old = { id: 'legacy', contract: source(), contractHash: hash(source()), state: 'READY' }; store.create(old);
    const artifact = store.artifact({ old: true }), before = store.events(old.id);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
    store.enableWorkflows(); store.enableWorkflows(); store.close(); store = new Store(root);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal(store.get(old.id).contractHash, old.contractHash); assert.deepEqual(store.events(old.id), before); assert.deepEqual(store.readArtifact(artifact), { old: true });
  } finally { store.close(); }
});
test('a V1 run created before migration still executes after V2 migration and reopen', async () => {
  const f = await setup(); const directory = path.join(f.root, 'old-state'); let store = new Store(directory);
  try {
    store.create({ id: 'existing-v1', repo: f.repo, base: f.base, contract: f.contract, contractHash: hash(f.contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0 });
    store.enableWorkflows(); store.close(); store = new Store(directory);
    const result = await execute(store, 'existing-v1', { ...f.dependencies, propose: r => f.dependencies.workflowRegistry.get('claude').execute(r) });
    assert.equal(result.state, 'COMPLETED'); assert.equal(store.readArtifact(result.evidenceHash).tests, 2);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);
  } finally { store.close(); f.store.close(); }
});
test('attempt reservation and event write rollback atomically on SQLite failure', async () => {
  const f = await setup();
  try {
    f.approve(); const owner = f.store.claim(f.run.id); const current = f.store.get(f.run.id); current.states.a = 'READY'; f.store.save(current, owner, 'TEST_READY'); const count = f.store.list().length;
    f.store.db.exec("CREATE TRIGGER fail_attempt_event BEFORE INSERT ON events WHEN NEW.type='ATTEMPT_RESERVED' BEGIN SELECT RAISE(ABORT,'injected'); END;");
    assert.throws(() => reserve(f.store, f.store.get(f.run.id), owner, 'a', { ...f.contract, files: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1 }), /injected/);
    assert.equal(f.store.list().length, count); assert.equal(attempts(f.store, f.run.id).length, 0); f.store.release(f.run.id, owner);
  } finally { f.store.close(); }
});
test('Codex unverified capabilities block before reserving or launching a child', async () => {
  const f = await setup();
  try {
    f.approve(); const codex = createCodexAdapter({ runCommand: async () => ({ exitCode: 0, stdout: Buffer.from('help'), stderr: Buffer.alloc(0) }) });
    const r = await execute(f.store, f.run.id, { ...f.dependencies, workflowRegistry: createRegistry([codex]) });
    assert.equal(r.state, 'WAITING_HUMAN'); assert.match(r.reason, /CAPABILITY_UNAVAILABLE/); assert.equal(attempts(f.store, f.run.id).length, 0);
  } finally { f.store.close(); }
});
test('active coordinator rejects concurrent requests and in-flight graph changes', async () => {
  const f = await setup(); let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  try {
    f.approve(); const verify = f.dependencies.verify; let first = true;
    f.dependencies.verify = async req => { if (first) { first = false; entered(); await new Promise(resolve => { release = resolve; }); } return verify(req); };
    const running = execute(f.store, f.run.id, f.dependencies); await started;
    await assert.rejects(execute(f.store, f.run.id, f.dependencies), /active worker/);
    assert.throws(() => reviseWorkflow(f.store, f.run.id, 1, definition(f.contract, { workflowId: 'repair', workflowVersion: 2, base: f.base, items: [item('a'), item('b')] })), /active/);
    release(); assert.equal((await running).state, 'COMPLETED'); assert.equal(f.calls.length, 2);
  } finally { release?.(); f.store.close(); }
});
test('final integration failure is not workflow completion despite successful items', async () => {
  const f = await setup();
  try {
    f.approve(); const verify = f.dependencies.verify;
    f.dependencies.verify = async req => { const result = await verify(req); return req.tests.length === 2 ? { ...result, exitCode: 1, passed: 0, failed: 2 } : result; };
    const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.equal(r.workflowStagesComplete, true);
    assert.deepEqual(r.states, { a: 'SUCCEEDED', b: 'SUCCEEDED' }); assert.equal(r.acceptedHash, undefined);
    assert.equal(attempts(f.store, f.run.id).at(-1).status, 'FAILED');
  } finally { f.store.close(); }
});
test('expiry and unknown provider cost block downstream work without privilege fallback', async () => {
  const f = await setup();
  try {
    f.approve(); const adapter = f.dependencies.workflowRegistry.get('claude'), original = adapter.execute;
    adapter.execute = async req => ({ ...await original(req), cost: null });
    const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.match(r.reason, /cost unknown/); assert.equal(f.calls.length, 1);
    f.store.db.prepare('UPDATE workflow_approvals SET expires=0').run();
    assert.match((await execute(f.store, f.run.id, f.dependencies)).reason, /expired/); assert.equal(f.calls.length, 1);
  } finally { f.store.close(); }
});
test('reservations enforce READY dependencies, exact child scope and the one-child limit', async () => {
  const f = await setup();
  try {
    f.approve(); const owner = f.store.claim(f.run.id), run = f.store.get(f.run.id);
    assert.throws(() => reserve(f.store, run, owner, 'b', f.contract), /dependency-ready/);
    run.states.a = 'READY'; f.store.save(run, owner, 'TEST_READY');
    assert.throws(() => reserve(f.store, run, owner, 'a', f.contract), /differs/);
    reserve(f.store, run, owner, 'a', { ...f.contract, files: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1 });
    assert.throws(() => reserve(f.store, run, owner, 'b', f.contract), /Concurrency/);
    f.store.release(f.run.id, owner);
  } finally { f.store.close(); }
});
test('real Docker Node verification checks the final combined tree', { skip: process.env.CODEFLEET_TEST_DOCKER !== '1' }, async () => {
  const f = await setup();
  try {
    f.approve(); const { verify, ready, ...dependencies } = f.dependencies;
    const r = await execute(f.store, f.run.id, dependencies);
    assert.equal(r.state, 'COMPLETED', r.reason); assert.equal(f.store.readArtifact(r.evidenceHash).tests, 2);
    assert.deepEqual(f.calls, ['src/a.js', 'src/b.js']);
  } finally { f.store.close(); }
});
test('one-child ceiling also applies across workflows sharing the same Store', async () => {
  const f = await setup();
  try {
    f.approve(); const second = await createWorkflow(f.store, f.repo, f.graph, f.contract, 'second');
    approveWorkflow(f.store, second.id, { actor: 'human', workflowHash: second.contractHash, expiresAt: Date.now() + 60000 });
    const owner = f.store.claim(f.run.id), run = f.store.get(f.run.id); run.states.a = 'READY'; f.store.save(run, owner, 'TEST_READY');
    reserve(f.store, run, owner, 'a', { ...f.contract, files: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1 });
    const r = await execute(f.store, second.id, f.dependencies); assert.equal(r.state, 'WAITING_HUMAN'); assert.match(r.reason, /Concurrency/); assert.equal(f.calls.length, 0);
    f.store.release(f.run.id, owner);
  } finally { f.store.close(); }
});
test('expired approvals still permit read-only completed-child reconciliation, then require renewed review', async () => {
  const f = await setup();
  try {
    f.approve(); const owner = f.store.claim(f.run.id), run = f.store.get(f.run.id); run.states.a = 'READY'; f.store.save(run, owner, 'TEST_READY');
    const child = reserve(f.store, run, owner, 'a', { ...f.contract, files: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1 });
    await execute(f.store, child.id, { ...f.dependencies, propose: r => f.dependencies.workflowRegistry.get('claude').execute(r) }, { workflowOwner: owner });
    f.store.db.prepare('UPDATE workflow_approvals SET expires=0').run(); f.store.release(f.run.id, owner);
    assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'WAITING_HUMAN');
    assert.equal(attempts(f.store, f.run.id)[0].status, 'SUCCEEDED'); assert.equal(f.calls.length, 1);
    f.approve(); assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'COMPLETED'); assert.equal(f.calls.length, 2);
  } finally { f.store.close(); }
});
test('tampered graph artifact blocks scheduling before any provider invocation', async () => {
  const f = await setup();
  try {
    f.approve(); await writeFile(path.join(f.store.directory, 'artifacts', f.run.graphRef + '.json'), '{}');
    const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.match(r.reason, /hash mismatch/); assert.equal(f.calls.length, 0);
  } finally { f.store.close(); }
});
test('operator cancellation blocks descendants and leaves no reusable terminal attempt', async () => {
  const f = await setup();
  try {
    f.approve(); const adapter = f.dependencies.workflowRegistry.get('claude'), original = adapter.execute;
    adapter.execute = async req => { const r = await original(req); f.store.control(f.run.id, 'cancel'); return r; };
    const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'CANCELLED'); assert.equal(f.calls.length, 1); assert.equal(r.finalRunId, undefined);
    assert.equal(attempts(f.store, f.run.id).length, 1); assert.notEqual(attempts(f.store, f.run.id)[0].status, 'STARTED');
  } finally { f.store.close(); }
});
