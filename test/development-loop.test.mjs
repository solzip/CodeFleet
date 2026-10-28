import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from '../src/alpha/process.mjs';
import { Store } from '../src/alpha/store.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { fixedFiles } from './fixtures/development-loop.mjs';
import { draft } from './fixtures/development-loop.mjs';
import { bootstrapDefinition } from '../src/workflow/bootstrap.mjs';

// These implementations are SYNTHETIC test inputs, never Codex Live proposals.
const sources = {
  normalize: { path: 'src/normalize-title.mjs', content: "export function normalizeTitle(title) { const value = title.trim(); if (!value) throw Error('Blank title'); return value; }\n" },
  todo: { path: 'src/create-todo.mjs', content: "import { normalizeTitle } from './normalize-title.mjs';\nexport function createTodo(title) { return { title: normalizeTitle(title), completed: false }; }\n" }
};
async function call(input, fails = false) {
  const r = await command(process.execPath, [path.resolve('test/fixtures/development-worker.mjs'), JSON.stringify(input)]);
  assert.equal(r.exitCode, fails ? 1 : 0, r.stdout + r.stderr); return JSON.parse(r.stdout);
}
async function setup(maxAttempts = 3) {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-p0b-'));
  const f = await call({ action: 'prepare', root, maxAttempts });
  f.call = (action, extra = {}, fails = false) => call({ ...f, action, ...extra }, fails);
  f.request = name => ({ executable: process.execPath, args: ['--test', '--test-reporter=tap', ...(name === 'verify-normalize' ? ['test/normalize-title.test.mjs'] : ['test/normalize-title.test.mjs', 'test/create-todo.test.mjs'])], directory: f.repo, timeoutMs: 10000 });
  f.propose = async itemId => f.call('propose', { proposal: { revision: (await f.call('snapshot')).taskRevision, itemId, files: [sources[itemId]] } });
  f.apply = async itemId => { const p = await f.propose(itemId); await f.call('approve', { filesetHash: p.approvalRequest.filesetHash }); return f.call('materialize', { itemId }); };
  return f;
}
test('P0-B: processes enforce A-before-B, preserve A checkpoint and reverify the integrated candidate', async () => {
  const f = await setup();
  const early = await f.propose('todo'); await f.call('approve', { filesetHash: early.approvalRequest.filesetHash });
  assert.match((await f.call('materialize', { itemId: 'todo' }, true)).error, /Dependencies/);
  const a = await f.apply('normalize');
  assert.deepEqual(a.results.map(r => r.path), ['src/normalize-title.mjs']);
  const av = await f.call('verify', { itemId: 'verify-normalize', request: f.request('verify-normalize') });
  assert.equal(av.executions[0]?.status, 'LOCAL_PASSED');
  assert.equal((await f.call('snapshot')).workItems.find(i => i.id === 'todo').waitingOn.length, 0);
  const b = await f.call('materialize', { itemId: 'todo' });
  assert.deepEqual(b.results.map(r => r.path), ['src/create-todo.mjs']);
  const after = await f.call('snapshot');
  assert.equal(after.next?.itemId, 'verify-integrated', JSON.stringify(after));
  assert.equal(after.workItems.find(i => i.id === 'verify-normalize').state, 'LOCAL_CHECKPOINT');
  assert.deepEqual(after.workItems.find(i => i.id === 'todo').waitingOn, ['verify-normalize'], 'historical checkpoint cannot authorize another dependent execution');
  assert.equal(after.judgments['verify-normalize'], undefined, 'old evidence cannot judge the new candidate');
  assert.equal(after.workItems.find(i => i.id === 'normalize').fileset.runId, a.runId);
  const integrated = await f.call('verify', { itemId: 'verify-integrated', request: f.request('verify-integrated') });
  assert.equal(integrated.executions[0]?.status, 'LOCAL_PASSED', JSON.stringify(integrated));
  assert.equal(integrated.executions[0].tests, 5);
  assert.notEqual(av.executions[0].reservation.decisionId, integrated.executions[0].reservation.decisionId);
  assert.notEqual(av.executions[0].reservation.attemptId, integrated.executions[0].reservation.attemptId);
  assert.notEqual(av.executions[0].evidenceRef, integrated.executions[0].evidenceRef);
  assert.equal(integrated.snapshot.budget.usedAttempts, 2);
  assert.equal(integrated.snapshot.protectedVerification, 'UNSATISFIED');
  assert.equal(integrated.complete, false);
  for (const [p, content] of Object.entries(fixedFiles)) assert.equal(await readFile(path.join(f.repo, p), 'utf8'), content);
  const s = new Store(f.state);
  try {
    assert.equal(s.readArtifact(av.executions[0].evidenceRef).command.candidateTreeHash, av.executions[0].reservation.candidateTreeHash);
    assert.notEqual(av.executions[0].reservation.candidateTreeHash, integrated.executions[0].reservation.candidateTreeHash);
    assert.equal(s.db.prepare('SELECT count(*) n FROM bootstrap_decisions WHERE remaining=0 AND consumed IS NOT NULL').get().n, 2);
  } finally { s.close(); }
  console.log('P0-B EVIDENCE ' + JSON.stringify({ authority: 'SYNTHETIC_OFFLINE_FIXTURE', modelCalls: 0, state: f.state, taskId: f.id,
    a: { fileset: a, execution: av.executions[0] }, b: { fileset: b, execution: integrated.executions[0] },
    final: { budget: integrated.snapshot.budget, remaining: integrated.snapshot.remaining, judgments: integrated.snapshot.judgments, complete: false } }));
});

for (const fault of ['drift-before-b', 'drift-after-b', 'receipt', 'receipt-binding', 'evidence', 'no-approval', 'revoked-decision', 'budget', 'failed-b', 'lease', 'revoke', 'expired', 'revoke-after-write']) {
  test(`P0-B: ${fault} stops unsafe progress while preserving A`, async () => {
    const f = await setup(fault === 'budget' ? 1 : 3);
    const a = await f.apply('normalize');
    const av = await f.call('verify', { itemId: 'verify-normalize', request: f.request('verify-normalize') });
    assert.equal(av.executions[0]?.status, 'LOCAL_PASSED');
    const p = fault === 'failed-b' ? await f.call('propose', { proposal: { revision: (await f.call('snapshot')).taskRevision, itemId: 'todo',
      files: [{ ...sources.todo, content: "export const createTodo = title => ({title, completed: true});\n" }] } }) : await f.propose('todo');
    await f.call('approve', { filesetHash: p.approvalRequest.filesetHash });
    if (fault === 'drift-before-b') {
      await writeFile(path.join(f.repo, sources.normalize.path), 'tampered');
      assert.match((await f.call('materialize', { itemId: 'todo' }, true)).error, /candidate changed/);
      return;
    }
    if (['lease', 'revoke', 'expired', 'revoke-after-write'].includes(fault)) {
      await f.call('materialize', { itemId: 'todo', fault }, true);
      if (fault === 'revoke-after-write') {
        assert.equal(await readFile(path.join(f.repo, sources.todo.path), 'utf8'), sources.todo.content);
        assert.match((await f.call('materialize', { itemId: 'todo' }, true)).error, /RECONCILE/);
      } else await assert.rejects(readFile(path.join(f.repo, sources.todo.path)), { code: 'ENOENT' });
      const snapshot = await f.call('snapshot');
      assert.equal(snapshot.budget.usedAttempts, 1);
      assert.equal(await readFile(path.join(f.repo, sources.normalize.path), 'utf8'), sources.normalize.content);
      return;
    }
    const b = await f.call('materialize', { itemId: 'todo' });
    if (fault === 'receipt-binding') {
      const s = new Store(f.state);
      try {
        const run = s.get(b.runId), evidence = s.readArtifact(run.materializationRef);
        run.materializationRef = s.artifact({ ...evidence, dependencyEvidence: { 'verify-normalize': 'wrong-evidence' } });
        s.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run), run.id);
      } finally { s.close(); }
    }
    if (fault === 'drift-after-b') await writeFile(path.join(f.repo, sources.normalize.path), 'tampered');
    if (['receipt', 'evidence'].includes(fault)) {
      const s = new Store(f.state);
      try {
        const ref = fault === 'receipt' ? b.materializationRef : av.executions[0].evidenceRef;
        await writeFile(path.join(f.state, 'artifacts', ref + '.json'), '{}');
      } finally { s.close(); }
    }
    const result = await f.call('verify', { itemId: 'verify-integrated', request: f.request('verify-integrated'),
      noApproval: fault === 'no-approval', revoke: fault === 'revoked-decision' });
    if (fault === 'failed-b') {
      assert.equal(result.executions[0]?.status, 'LOCAL_FAILED');
      assert.equal((await f.call('snapshot')).budget.usedAttempts, 2);
      const triage = await f.call('triage', { request: f.request('verify-integrated') });
      assert.notEqual(triage.action, 'EXECUTE');
      assert.equal((await f.call('verify', { itemId: 'verify-integrated', request: f.request('verify-integrated') })).executions.length, 0);
    } else {
      assert.equal(result.executions.length, 0, JSON.stringify(result));
      assert.equal(result.snapshot.budget.usedAttempts, 1);
    }
    assert.equal(result.complete, false);
    assert.equal(result.snapshot.workItems.find(i => i.id === 'normalize').fileset.runId, a.runId);
    for (const [p, content] of Object.entries(fixedFiles)) assert.equal(hash(await readFile(path.join(f.repo, p), 'utf8')), hash(content));
  });
}

test('P0-B: stale proposal, test edits and overlapping ownership are rejected', async () => {
  const f = await setup(), snapshot = await f.call('snapshot');
  assert.match((await f.call('propose', { proposal: { revision: snapshot.taskRevision - 1, itemId: 'normalize', files: [sources.normalize] } }, true)).error, /revision stale/);
  assert.match((await f.call('propose', { proposal: { revision: snapshot.taskRevision, itemId: 'normalize', files: [{ path: 'test/normalize-title.test.mjs', content: '' }] } }, true)).error, /exactly/);
  const d = draft('fixture-probe'); d.workItems.find(i => i.id === 'todo').files.push('src/normalize-title.mjs');
  assert.throws(() => bootstrapDefinition({ contractKind: 'NEW_PROJECT', validation: { status: 'VALIDATED', draftHash: hash(d) }, draft: d, probe: { probeHash: 'fixture-probe' } }), /Overlapping/);
});

test('P0-B: public context handoff exposes B only after A evidence, with no model or execution grant', async () => {
  const f = await setup();
  const packet = async (itemId, extra = []) => command(process.execPath, [path.resolve('src/alpha/cli.mjs'), '--state', f.state, 'objective', 'proposal-request', f.id, itemId, ...extra]);
  assert.notEqual((await packet('todo')).exitCode, 0);
  assert.notEqual((await packet('normalize', ['--allow-model'])).exitCode, 0);
  const a = await packet('normalize'); assert.equal(a.exitCode, 0, a.stderr);
  const request = JSON.parse(a.stdout); assert.equal(request.modelInvocationGranted, false);
  assert.deepEqual(request.item.files, ['src/normalize-title.mjs']);
  await f.apply('normalize');
  await f.call('verify', { itemId: 'verify-normalize', request: f.request('verify-normalize') });
  const b = await packet('todo'); assert.equal(b.exitCode, 0, b.stderr);
  const next = JSON.parse(b.stdout);
  assert.equal(next.executionGranted, false);
  assert.equal(next.context.files.find(f => f.path === sources.normalize.path).content, sources.normalize.content);
  assert.equal(next.dependencies[0].state, 'LOCAL_PASSED');
  assert.ok(next.dependencies[0].verificationRef);
  assert.equal((await f.call('snapshot')).budget.usedAttempts, 1, 'context requests do not reserve work');
  await writeFile(path.join(f.repo, 'test/normalize-title.test.mjs'), 'tampered');
  assert.notEqual((await packet('todo')).exitCode, 0);
});

test('P0-B: model handoff waits when persisted verification budget is exhausted', async () => {
  const f = await setup(1); await f.apply('normalize');
  await f.call('verify', { itemId: 'verify-normalize', request: f.request('verify-normalize') });
  const r = await command(process.execPath, [path.resolve('src/alpha/cli.mjs'), '--state', f.state, 'objective', 'proposal-request', f.id, 'todo']);
  assert.notEqual(r.exitCode, 0); assert.match(r.stdout + r.stderr, /budget exhausted/);
  assert.equal((await f.call('snapshot')).budget.usedAttempts, 1);
  await assert.rejects(readFile(path.join(f.repo, sources.todo.path)), { code: 'ENOENT' });
});
