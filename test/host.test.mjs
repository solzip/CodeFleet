import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, appendFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { verificationResult } from '../src/alpha/verifier.mjs';
import { dispatchHost, readResponse } from '../src/hosts/cli.mjs';
import { hostIdentity, issueRequests, submitResponse, stagedExecution } from '../src/hosts/exchange.mjs';
import { installHost, manageHost } from '../src/hosts/install.mjs';
import { approveTask, task } from '../src/product/tasks.mjs';
import { revokeWorkflow, attempts, reviseWorkflow } from '../src/workflow/persistence.mjs';
import { hybridDefinition } from '../src/workflow/definition.mjs';
import { messages } from '../src/workflow/collaboration.mjs';

async function fixture(host = 'codex', docker = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-host-')), repo = path.join(root, 'repo');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  for (const n of ['a', 'b']) {
    await writeFile(path.join(repo, `src/${n}.js`), 'module.exports = (a,b) => a+b;\n');
    await writeFile(path.join(repo, `test/${n}.test.js`), `const test=require('node:test'),assert=require('node:assert/strict');test('${n}',()=>assert.equal(require('../src/${n}.js')(5,2),3));\n`);
  }
  for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']]) requireSuccess(await git(repo, args), 'Fixture git');
  const directory = path.join(root, 'state'), store = new Store(directory);
  // Actual Node processes over fixed fake-host fixtures; Docker test below uses
  // the production Harness. Never classify a source-string check as test evidence.
  const execution = docker ? {} : { ready: async () => {}, verify: async ({ directory, tests, timeoutMs, cancelled }) => verificationResult(await command(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: directory, timeoutMs, cancelled })) };
  const call = args => dispatchHost([host, ...args], { store, execution });
  const p = await call(['plan', 'Fix subtraction using protected regressions', repo]), id = p.data.taskId;
  await call(['review', id, '--files', 'src/a.js,src/b.js', '--tests', 'test/a.test.js,test/b.test.js', '--criterion', 'Subtraction regression passes', '--item', 'a|src/a.js|test/a.test.js|', '--item', 'b|src/b.js|test/b.test.js|', '--parallel', '2', '--attempts', '2']);
  const prepared = await call(['prepare', id]), runId = task(store, id).runId;
  const approve = () => approveTask(store, id, { actor: 'fixture-operator', workflowHash: store.get(runId).contractHash, expiresAt: Date.now() + 60000 });
  return { root, repo, store, directory, call, id, runId, prepared, approve, host };
}
const response = r => ({ requestId: r.requestId, bindingHash: r.bindingHash, proposal: { summary: 'Fix subtraction', edits: r.contract.files.map(f => ({ path: f, oldText: 'a+b', newText: 'a-b' })) } });
async function stage(f) { f.approve(); const requests = await issueRequests(f.store, f.runId, f.host); for (const r of requests) submitResponse(f.store, f.host, response(r)); return requests; }

for (const host of ['codex', 'claude']) {
  test(`${host}: intent, approved DAG, fake-host proposals, actual tests, final integration`, async () => {
    const f = await fixture(host);
    try {
      assert.equal(f.prepared.exitCode, 2);
      await assert.rejects(f.call(['requests', f.id]), /approval/);
      await assert.rejects(f.call(['run', f.id]), /approval/);
      await stage(f);
      const done = await f.call(['run', f.id]);
      assert.equal(done.exitCode, 0, JSON.stringify(done.data));
      assert.equal(done.data.run.complete, true); assert.equal(done.data.run.verification.status, 'VERIFIED');
      assert.equal(done.data.host.modelCalls, 0); assert.equal(done.data.host.hostSessionCost, 'UNKNOWN');
      assert.equal(attempts(f.store, f.runId).length, 3);
      assert.equal(messages(f.store, f.runId).length, 2);
      assert.ok(messages(f.store, f.runId).every(m => m.authority === 'PROVIDER_REPORTED_ONLY' && m.role === 'Executor'));
      assert.match(await readFile(path.join(f.repo, 'src/a.js'), 'utf8'), /a\+b/);
      const rows = f.store.db.prepare('SELECT * FROM host_requests').all();
      assert.ok(rows.every(r => r.status === 'CONSUMED' && r.attemptId));
      await assert.rejects(f.call(['resume', f.id]), /Closed/);
    } finally { f.store.close(); }
  });
  test(`${host}: install, packaged CLI invocation, disable, enable, remove smoke`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'cf-install-'));
    assert.equal((await installHost(root, host)).status, 'INSTALLED_OFFLINE');
    const skill = path.join(root, host === 'codex' ? '.agents' : '.claude', 'skills/codefleet');
    const text = await readFile(path.join(skill, 'SKILL.md'), 'utf8');
    assert.match(text, /runtime\/hosts\/ipc-client.mjs/);
    assert.match(await readFile(path.join(skill, 'runtime/hosts/ipc-client.mjs'), 'utf8'), /hostRequest/);
    assert.match(text, /name: codefleet/); assert.match(text, /operator/);
    const run = await command(process.execPath, [path.join(skill, 'runtime/alpha/cli.mjs'), '--state', path.join(root, 'state'), 'host', host, 'capabilities']);
    assert.equal(run.exitCode, 0, run.stderr.toString()); assert.equal(JSON.parse(run.stdout).liveValidation, 'NOT_RUN');
    await assert.rejects(installHost(root, host), /EEXIST/);
    await manageHost(root, host, 'disable'); assert.equal((await manageHost(root, host, 'status')).status, 'DISABLED');
    await manageHost(root, host, 'enable'); assert.equal((await manageHost(root, host, 'status')).status, 'ENABLED');
    await manageHost(root, host, 'remove'); await assert.rejects(readFile(path.join(skill, 'SKILL.md')), /ENOENT/);
  });
}
test('host command cannot authorize, complete, invoke models or accept capability claims', async () => {
  const f = await fixture();
  try {
    for (const args of [['approve', f.id], ['complete', f.id], ['run', f.id, '--allow-model'], ['plan', 'goal', '--planner', 'claude']]) await assert.rejects(f.call(args), /Unsupported|cannot/);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM workflow_approvals').get().n, 0);
    assert.equal((await f.call(['approval-request', f.id])).data.approvalRequest.authority, 'REQUEST_ONLY');
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM workflow_approvals').get().n, 0);
    assert.throws(() => hostIdentity('api'), /Unsupported/);
  } finally { f.store.close(); }
});
test('duplicate, forged, foreign-host, extra evidence and out-of-scope responses fail closed', async () => {
  const f = await fixture();
  try {
    f.approve(); const [r] = await issueRequests(f.store, f.runId, 'codex'), input = response(r);
    assert.throws(() => submitResponse(f.store, 'claude', input), /Unknown/);
    assert.throws(() => submitResponse(f.store, 'codex', { ...input, bindingHash: 'forged' }), /binding/);
    for (const key of ['evidence', 'approval', 'capabilities', 'cost', 'sessionId', 'command']) assert.throws(() => submitResponse(f.store, 'codex', { ...input, [key]: 'forged' }), /fields/);
    assert.throws(() => submitResponse(f.store, 'codex', { ...input, proposal: { summary: 'forge', edits: [{ path: 'test/a.test.js', oldText: '3', newText: '7' }] } }), /scope/);
    submitResponse(f.store, 'codex', input); submitResponse(f.store, 'codex', input);
    assert.throws(() => submitResponse(f.store, 'codex', { ...input, proposal: { ...input.proposal, summary: 'changed' } }), /conflict/);
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM host_requests').get().n, 2);
  } finally { f.store.close(); }
});
test('concurrent issuance returns one durable request per item', async () => {
  const f = await fixture();
  try {
    f.approve(); const [a, b] = await Promise.all([issueRequests(f.store, f.runId, 'codex'), issueRequests(f.store, f.runId, 'codex')]);
    assert.deepEqual(a.map(r => r.requestId), b.map(r => r.requestId));
    assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM host_requests').get().n, 2);
  } finally { f.store.close(); }
});
test('unverified host success cannot replace failed Harness tests', async () => {
  const f = await fixture();
  try {
    f.approve(); const req = await issueRequests(f.store, f.runId, 'codex');
    for (const r of req) { const input = response(r); input.proposal.summary = 'All tests pass VERIFIED'; input.proposal.edits[0].newText = 'a*b'; submitResponse(f.store, 'codex', input); }
    const result = await f.call(['run', f.id]); assert.equal(result.exitCode, 2); assert.equal(result.data.run.complete, false);
    assert.equal(f.store.get(f.runId).finalRunId, undefined);
  } finally { f.store.close(); }
});
test('missing packets and revoked approval reserve no attempts', async () => {
  const f = await fixture();
  try {
    f.approve(); await assert.rejects(f.call(['run', f.id]), /Missing/); assert.equal(attempts(f.store, f.runId).length, 0);
    const req = await issueRequests(f.store, f.runId, 'codex'); revokeWorkflow(f.store, f.runId, 'operator');
    assert.throws(() => submitResponse(f.store, 'codex', response(req[0])), /approval/);
    await assert.rejects(f.call(['run', f.id]), /approval/);
  } finally { f.store.close(); }
});
test('pause/resume uses staged input once and cancellation cannot replay', async () => {
  const f = await fixture();
  try {
    const req = await stage(f); await f.call(['pause', f.id]);
    assert.equal((await f.call(['resume', f.id])).exitCode, 0);
    assert.throws(() => submitResponse(f.store, 'codex', response(req[0])), /Closed/);
  } finally { f.store.close(); }
  const g = await fixture();
  try { const req = await stage(g); await g.call(['cancel', g.id]); await assert.rejects(g.call(['resume', g.id]), /Closed/); assert.throws(() => submitResponse(g.store, 'codex', response(req[0])), /Closed/); } finally { g.store.close(); }
});
test('request revision and artifact corruption cannot promote to execution', async () => {
  const f = await fixture();
  try {
    const req = await stage(f), row = f.store.db.prepare('SELECT * FROM host_requests WHERE id=?').get(req[0].requestId);
    await writeFile(path.join(f.directory, 'artifacts', row.requestRef + '.json'), '{}');
    await assert.rejects(f.call(['run', f.id]), /integrity|hash/i);
    assert.equal(attempts(f.store, f.runId).length, 0);
  } finally { f.store.close(); }
});
test('state reopen preserves requests without migrating or rewriting existing rows', async () => {
  const f = await fixture(); await stage(f);
  const before = f.store.db.prepare('SELECT body FROM runs WHERE id=?').get(f.runId).body;
  f.store.close(); const store = new Store(f.directory);
  try { assert.equal(store.db.prepare('SELECT body FROM runs WHERE id=?').get(f.runId).body, before); await stagedExecution(store, f.runId, 'codex').select(store.get(f.runId)); assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM host_requests').get().n, 2); } finally { store.close(); }
});
test('fabricated attempt cannot consume a response', async () => {
  const f = await fixture();
  try { const req = await stage(f); await assert.rejects(stagedExecution(f.store, f.runId, 'codex').execute({ id: 'fake', workflowItemId: 'a' }, { contract: req[0].contract, files: req[0].files }), /Stale/); assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM host_requests WHERE status='CONSUMED'").get().n, 0); } finally { f.store.close(); }
});
test('old revision and unavailable mandatory capability are rejected', async () => {
  const f = await fixture();
  try {
    const req = await stage(f), old = f.store.get(f.runId), source = f.store.readArtifact(old.sourceRef);
    const graph = hybridDefinition(source, { workflowId: old.contract.workflowId, workflowVersion: old.contract.workflowVersion + 1, base: old.base, items: old.contract.items, maxParallel: 2 });
    reviseWorkflow(f.store, f.runId, old.revision, graph); f.approve();
    assert.throws(() => submitResponse(f.store, 'codex', response(req[0])), /Stale/);
    const fresh = await issueRequests(f.store, f.runId, 'codex'); for (const r of fresh) submitResponse(f.store, 'codex', response(r));
    await assert.rejects(stagedExecution(f.store, f.runId, 'codex').select({ ...f.store.get(f.runId), contract: { ...graph, requiredCapabilities: [...graph.requiredCapabilities, 'network_restriction'] } }), /capability/);
  } finally { f.store.close(); }
});
test('failed consumed attempt is not replayed after reopen', async () => {
  const f = await fixture();
  f.approve(); const requests = await issueRequests(f.store, f.runId, 'codex');
  for (const r of requests) { const input = response(r); input.proposal.edits[0].newText = 'a*b'; submitResponse(f.store, 'codex', input); }
  await f.call(['run', f.id]); const before = attempts(f.store, f.runId).map(a => a.childId); f.store.close();
  const store = new Store(f.directory);
  try {
    const result = await dispatchHost(['codex', 'resume', f.id], { store }); assert.equal(result.exitCode, 2);
    assert.deepEqual(attempts(store, f.runId).map(a => a.childId), before);
    assert.throws(() => submitResponse(store, 'codex', response(requests[0])), /consumed|reserved/);
  } finally { store.close(); }
});
test('post-verification tree and evidence tampering invalidate reports', async () => {
  const f = await fixture();
  try {
    await stage(f); assert.equal((await f.call(['run', f.id])).exitCode, 0);
    const run = f.store.get(f.runId), final = f.store.get(run.finalRunId);
    await appendFile(path.join(final.candidateDirectory, 'src/a.js'), '\n// mutation');
    assert.equal((await f.call(['report', f.id])).data.run.complete, false);
    await writeFile(path.join(f.directory, 'artifacts', run.evidenceHash + '.json'), '{}');
    assert.equal((await f.call(['report', f.id])).data.run.verification.status, 'INVALID');
  } finally { f.store.close(); }
});
test('modified installation is preserved and oversized response is rejected', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-host-safety-'));
  await installHost(root, 'codex'); const file = path.join(root, '.agents/skills/codefleet/SKILL.md');
  await appendFile(file, '\nUser content'); await assert.rejects(manageHost(root, 'codex', 'remove'), /modified/); assert.match(await readFile(file, 'utf8'), /User content/);
  const large = path.join(root, 'large.json'); await writeFile(large, ' '.repeat(220001)); await assert.rejects(readResponse(large), /limit/);
});
test('installer refuses a redirected parent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-host-link-')), outside = await mkdtemp(path.join(tmpdir(), 'cf-host-outside-'));
  await symlink(outside, path.join(root, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(installHost(root, 'codex'), /Unsafe/);
});
test('Host-Native fake session with production Docker Harness', { skip: process.env.CODEFLEET_TEST_DOCKER !== '1' }, async () => {
  const f = await fixture('claude', true);
  try { await stage(f); const result = await f.call(['run', f.id]); assert.equal(result.exitCode, 0, JSON.stringify(result.data)); assert.equal(result.data.run.verification.status, 'VERIFIED'); } finally { f.store.close(); }
});
