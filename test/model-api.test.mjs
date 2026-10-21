import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createOfflineModelAdapter, modelRequest } from '../src/providers/model-api.mjs';
import { createRegistry, selectProvider, PROPOSAL_ENVIRONMENT } from '../src/providers/registry.mjs';
import { semanticPlan } from '../src/intent/semantic.mjs';
import { judge } from '../src/alpha/judge.mjs';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { verificationResult } from '../src/alpha/verifier.mjs';
import { definition, hybridDefinition } from '../src/workflow/definition.mjs';
import { createWorkflow, approveWorkflow } from '../src/workflow/persistence.mjs';
import { dispatchProduct } from '../src/product/cli.mjs';

const proposal = () => ({ summary: 'Fix subtraction', edits: [{ path: 'src/math.js', oldText: 'a+b', newText: 'a-b' }] });
const request = () => ({ contract: { schemaVersion: 1, goal: 'Fix subtraction with protected tests.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 2, timeoutSeconds: 60, attemptBudgetUsd: 1, delivery: { mode: 'local' } }, files: { 'src/math.js': 'module.exports=(a,b)=>a+b;', 'test/math.test.js': 'protected' }, timeoutMs: 2000 });
function envelope(provider, value = proposal()) {
  return provider === 'openai' ? { id: 'resp_fixture', object: 'response', status: 'completed', model: 'codefleet-fixture', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 1 } }
    : { id: 'msg_fixture', type: 'message', role: 'assistant', model: 'codefleet-fixture', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }], usage: { input_tokens: 1 } };
}
async function server(provider, handler) {
  const calls = [];
  const s = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks)); calls.push({ headers: req.headers, body });
    if (handler) await handler(req, res, body); else res.end(JSON.stringify(envelope(provider)));
  });
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  return { calls, endpoint: `http://127.0.0.1:${s.address().port}/v1/${provider === 'openai' ? 'responses' : 'messages'}`,
    close: async () => { s.closeAllConnections(); await new Promise(resolve => s.close(resolve)); } };
}

for (const provider of ['openai', 'anthropic']) {
  test(`${provider}: structured edit, no tools, isolated fake credential, no ambient config`, async () => {
    const s = await server(provider); const a = createOfflineModelAdapter({ provider, endpoint: s.endpoint, fakeCredential: 'G7B_FAKE_TEST' });
    try {
      const r = await a.execute(request());
      assert.equal(r.status, 'PROPOSED'); assert.equal(r.cost, null); assert.equal(r.authority, 'PROVIDER_REPORTED_ONLY');
      assert.deepEqual(r.proposal, proposal()); assert.equal(r.schemaValidation.status, 'VALID');
      assert.equal(s.calls[0].headers.authorization, 'Bearer G7B_FAKE_TEST');
      assert.deepEqual(s.calls[0].body.tools, []); assert.equal(s.calls[0].body.stream, false);
      assert.ok(!JSON.stringify(s.calls[0].body).includes('G7B_FAKE_TEST')); assert.ok(!JSON.stringify(r).includes('G7B_FAKE_TEST'));
      assert.equal(judge({ ...r, tests: 1, passed: 1 }).outcome, 'ESCALATE');
      const report = await a.probe(); assert.equal(report.liveValidation, 'NOT_RUN'); assert.equal(report.scope, 'OFFLINE_LOOPBACK_FAKE_ONLY');
      assert.equal(selectProvider(createRegistry([a]), [report]).providerId, a.id);
      const absent = structuredClone(report); delete absent.environment;
      assert.throws(() => selectProvider(createRegistry([a]), [absent]), /CAPABILITY_UNAVAILABLE/);
      for (const c of PROPOSAL_ENVIRONMENT) {
        const bad = structuredClone(report); delete bad.environment[c];
        assert.throws(() => selectProvider(createRegistry([a]), [bad], { environmentRequired: [] }), /Environment/);
      }
    } finally { await s.close(); }
  });

  test(`${provider}: tool calls, forged completion, wrong model, schema and scope rejected`, async () => {
    let reply = envelope(provider);
    const s = await server(provider, (_q, res) => res.end(typeof reply === 'string' ? reply : JSON.stringify(reply)));
    try {
      const a = createOfflineModelAdapter({ provider, endpoint: s.endpoint });
      const tool = envelope(provider);
      if (provider === 'openai') tool.output = [{ type: 'function_call', name: 'exec', arguments: 'write credentials' }];
      else tool.content = [{ type: 'tool_use', name: 'bash', input: { command: 'exit 0' } }];
      const invalid = ['{', tool, { ...envelope(provider), model: 'other' }, envelope(provider, { ...proposal(), authority: 'HARNESS_EXECUTED' }), envelope(provider, { summary: 'lie', edits: [] }), envelope(provider, { summary: 'escape', edits: [{ path: '../outside', oldText: 'a+b', newText: 'bad' }] }), envelope(provider, { summary: 'bad', edits: [{ path: 'test/math.test.js', oldText: 'protected', newText: 'pass' }] })];
      for (reply of invalid) { const r = await a.execute(request()); assert.equal(r.status, 'FAILED'); assert.equal(r.proposal, null); }
      assert.equal(s.calls.length, invalid.length); // No tool runner or retry loop.
    } finally { await s.close(); }
  });
}

test('transport forbids live addresses, credential/config overrides and redirects', async () => {
  for (const endpoint of ['https://api.openai.com/v1/responses', 'http://localhost:123/v1/responses', 'http://127.0.0.1:123/v1/responses?x=1', 'http://user@127.0.0.1:123/v1/responses', 'file:///secret', 'http://[::1]:123/v1/responses', 'http://127.0.0.1:123/v1/messages']) assert.throws(() => createOfflineModelAdapter({ provider: 'openai', endpoint }), /OFFLINE/);
  assert.throws(() => createOfflineModelAdapter({ provider: 'openai', endpoint: 'http://127.0.0.1:123/v1/responses', fakeCredential: 'not-a-fake-key' }), /OFFLINE/);
  const target = await server('openai');
  const redirect = await server('openai', (_q, res) => { res.writeHead(307, { location: target.endpoint }); res.end('redirect'); });
  try {
    const a = createOfflineModelAdapter({ provider: 'openai', endpoint: redirect.endpoint });
    assert.equal((await a.execute(request())).error.code, 'HTTP_REJECTED'); assert.equal(target.calls.length, 0);
    for (const patch of [{ tools: ['shell'] }, { endpoint: target.endpoint }, { sessionId: 'old' }, { mode: 'SANDBOXED_AGENT' }, { headers: {} }, { timeoutMs: Infinity }, { files: { ...request().files, '.env': 'fake' } }]) {
      assert.equal((await a.execute({ ...request(), ...patch })).status, 'FAILED');
    }
    assert.equal(redirect.calls.length, 1);
  } finally { await redirect.close(); await target.close(); }
});

test('credential reflection, oversized response and HTTP failure remain safe and cost unknown', async () => {
  let value = 'G7B_FAKE_TEST', status = 200;
  const s = await server('openai', (_q, res) => { res.writeHead(status); res.end(value); });
  try {
    const a = createOfflineModelAdapter({ provider: 'openai', endpoint: s.endpoint, fakeCredential: 'G7B_FAKE_TEST' });
    let r = await a.execute(request()); assert.equal(r.error.code, 'CREDENTIAL_REFLECTION'); assert.ok(!JSON.stringify(r).includes('G7B_FAKE_TEST'));
    value = JSON.stringify(envelope('openai', { ...proposal(), summary: 'G7B_FAKE_TEST' })).replaceAll('G7B_FAKE_TEST', '\\u0047' + '7B_FAKE_TEST');
    status = 500; r = await a.execute(request()); assert.equal(r.error.code, 'CREDENTIAL_REFLECTION'); assert.ok(!JSON.stringify(r).includes('7B_FAKE_TEST'));
    status = 200;
    value = 'x'.repeat(256001); r = await a.execute(request()); assert.equal(r.error.code, 'OUTPUT_LIMIT');
    value = 'failure'; status = 500; r = await a.execute(request()); assert.equal(r.error.code, 'HTTP_REJECTED'); assert.equal(r.cost, null);
    assert.equal(s.calls.length, 4);
  } finally { await s.close(); }
});

test('timeout, cancellation, stale ownership and request mutation cannot yield a proposal', async () => {
  let onRequest = () => {};
  const s = await server('openai', async (_q, res) => { onRequest(); await new Promise(r => setTimeout(r, 80)); res.end(JSON.stringify(envelope('openai'))); });
  try {
    const a = createOfflineModelAdapter({ provider: 'openai', endpoint: s.endpoint });
    assert.equal((await a.execute({ ...request(), timeoutMs: 20 })).error.code, 'TIMEOUT');
    let cancelled = false; onRequest = () => { cancelled = true; };
    assert.equal((await a.execute({ ...request(), cancelled: () => cancelled })).error.code, 'CANCELLED');
    let current = true; onRequest = () => { current = false; };
    const b = createOfflineModelAdapter({ provider: 'openai', endpoint: s.endpoint, isCurrent: () => current });
    assert.equal((await b.execute(request())).error.code, 'STALE_ATTEMPT');
    const q = request(); onRequest = () => { q.files['src/math.js'] = 'changed'; };
    assert.equal((await a.execute(q)).error.code, 'CONTRACT_CHANGED');
    assert.equal((await a.execute(q)).error.code, 'ATTEMPT_REUSED');
  } finally { await s.close(); }
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-model-')), repo = path.join(dir, 'repo');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  const req = request();
  await writeFile(path.join(repo, 'src/math.js'), req.files['src/math.js']);
  await writeFile(path.join(repo, 'test/math.test.js'), "const test=require('node:test'),assert=require('node:assert/strict');test('subtract',()=>assert.equal(require('../src/math.js')(5,2),3));");
  for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']]) requireSuccess(await git(repo, args), 'fixture git');
  const base = requireSuccess(await git(repo, ['rev-parse', 'HEAD']), 'base');
  return { repo, base, store: new Store(path.join(dir, 'state')), source: req.contract };
}
test('semantic Planner uses the same environment hard gate and validates actual code citations', async () => {
  const f = await fixture(); let badQuote = false;
  const s = await server('anthropic', (_q, res, wire) => {
    const { context, objective } = JSON.parse(wire.messages[0].content);
    const value = { draft: { schemaVersion: 2, objective, base: context.discovery.base, files: ['src/math.js'], tests: ['test/math.test.js'], criteria: [{ description: 'Regression passes', method: 'protected-tests', tests: ['test/math.test.js'] }], risks: [], unknowns: [], effects: ['local-edit'] }, references: Object.entries(context.files).map(([path, file]) => ({ path, line: 1, quote: badQuote ? 'not in code' : file.text.split('\n')[0] })), inferences: ['Proposed subtraction correction'] };
    res.end(JSON.stringify(envelope('anthropic', value)));
  });
  try {
    const a = createOfflineModelAdapter({ provider: 'anthropic', endpoint: s.endpoint }); const registry = createRegistry([a]);
    const p = await semanticPlan(f.repo, 'Fix subtraction', { registry, allowLive: true }); assert.equal(p.executable, false); assert.equal(p.providerResult.status, 'PROPOSED');
    badQuote = true; await assert.rejects(semanticPlan(f.repo, 'Fix subtraction', { registry, allowLive: true }), /execution failed/);
    const probe = a.probe; a.probe = async () => ({ ...await probe(), environment: {} });
    await assert.rejects(semanticPlan(f.repo, 'Fix subtraction', { registry, allowLive: true }), /Environment/); assert.equal(s.calls.length, 2);
  } finally { await s.close(); f.store.close(); }
});

for (const hybrid of [false, true]) test(`${hybrid ? 'Hybrid' : 'Sequential'} reuses controller, actual tests and CLI report; missing environment blocks`, async () => {
  const f = await fixture(), s = await server('openai');
  try {
    const item = { id: 'math', dependencies: [], priority: 0, files: ['src/math.js'], tests: ['test/math.test.js'], acceptanceCriteria: ['Regression passes'] };
    if (hybrid) Object.assign(item, { resources: [], roles: { Planner: 'p', Architect: 'a', Executor: 'e', Reviewer: 'r' } });
    const workflow = (hybrid ? hybridDefinition : definition)(f.source, { workflowId: 'fixture', base: f.base, items: [item], maxParallel: 1 });
    const run = await createWorkflow(f.store, f.repo, workflow, f.source);
    approveWorkflow(f.store, run.id, { actor: 'fixture', workflowHash: workflow.workflowHash, expiresAt: Date.now() + 60000 });
    const a = createOfflineModelAdapter({ provider: 'openai', endpoint: s.endpoint }), probe = a.probe;
    const dependencies = { workflowRegistry: createRegistry([a]), ready: async () => {}, verify: async ({ directory, tests }) => verificationResult(await command(process.execPath, ['--test', '--test-reporter=tap', ...tests], { cwd: directory })) };
    a.probe = async () => ({ ...await probe(), environment: {} });
    assert.notEqual((await execute(f.store, run.id, dependencies)).state, 'COMPLETED'); assert.equal(s.calls.length, 0);
    a.probe = probe;
    // A blocked workflow has no reserved attempt and can safely resume.
    const blocked = await execute(f.store, run.id, dependencies, { resume: true });
    assert.equal(blocked.state, 'WAITING_HUMAN'); assert.match(blocked.reason, /cost unknown/); assert.equal(blocked.states.math, 'SUCCEEDED'); assert.equal(s.calls.length, 1);
    // A real API cost remains unknown. For a separate end-to-end fixture only,
    // the trusted test host knows its local fake server incurred zero cost.
    const original = a.execute; a.execute = async q => ({ ...await original(q), cost: 0, costAuthority: 'HOST_FAKE_SERVER_ONLY' });
    const graph2 = (hybrid ? hybridDefinition : definition)(f.source, { workflowId: 'budgetedFixture', base: f.base, items: [item], maxParallel: 1 });
    const run2 = await createWorkflow(f.store, f.repo, graph2, f.source);
    approveWorkflow(f.store, run2.id, { actor: 'fixture', workflowHash: graph2.workflowHash, expiresAt: Date.now() + 60000 });
    const r = await execute(f.store, run2.id, dependencies);
    assert.equal(r.state, 'COMPLETED', r.reason); assert.equal(s.calls.length, 2);
    const report = await dispatchProduct(['report', run2.id], { store: f.store });
    assert.equal(report.data.complete, true); assert.equal(report.data.verification.status, 'VERIFIED');
    assert.equal(await readFile(path.join(f.repo, 'src/math.js'), 'utf8'), request().files['src/math.js']);
    assert.equal((await execute(f.store, run2.id, dependencies)).state, 'COMPLETED'); assert.equal(s.calls.length, 2);
  } finally { await s.close(); f.store.close(); }
});

test('wire protocol has no execution policy knobs and does not accept configuration from model input', () => {
  for (const provider of ['openai', 'anthropic']) {
    const wire = modelRequest(provider, 'codefleet-fixture', request());
    assert.deepEqual(wire.tools, []); assert.equal(wire.stream, false);
    assert.equal(wire.session_id, undefined); assert.equal(wire.previous_response_id, undefined);
    assert.throws(() => modelRequest(provider, 'codefleet-fixture', { ...request(), tool_choice: 'auto' }));
  }
});

test('host files, fake secrets and secondary network remain untouched by model tool requests', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-model-boundary-'));
  const marker = path.join(dir, 'marker.txt'), credential = path.join(dir, 'fake-credential.txt');
  await writeFile(marker, 'unchanged'); await writeFile(credential, 'FAKE_HOST_SECRET_NOT_IN_CONTEXT');
  const target = await server('openai');
  const commands = [
    { type: 'function_call', name: 'write_file', arguments: JSON.stringify({ path: marker, content: 'changed' }) },
    { type: 'function_call', name: 'read_file', arguments: JSON.stringify({ path: credential }) },
    { type: 'function_call', name: 'fetch', arguments: JSON.stringify({ url: target.endpoint }) },
    { type: 'mcp_call', server_label: 'host', arguments: 'run' },
    { type: 'web_search_call', status: 'completed' },
    { type: 'code_interpreter_call', code: 'run' }
  ];
  let item;
  const s = await server('openai', (_q, res) => res.end(JSON.stringify({ ...envelope('openai'), output: [item] })));
  try {
    const a = createOfflineModelAdapter({ provider: 'openai', endpoint: s.endpoint });
    for (item of commands) assert.equal((await a.execute(request())).status, 'FAILED');
    assert.equal(await readFile(marker, 'utf8'), 'unchanged'); assert.equal(target.calls.length, 0);
    assert.ok(s.calls.every(c => !JSON.stringify(c.body).includes('FAKE_HOST_SECRET_NOT_IN_CONTEXT')));
  } finally { await s.close(); await target.close(); }
});

test('parallel requests have distinct host bindings; changed budgets and pre-cancelled requests fail closed', async () => {
  let mutate = () => {};
  const s = await server('openai', async (_q, res) => { mutate(); await new Promise(r => setTimeout(r, 25)); res.end(JSON.stringify(envelope('openai'))); });
  try {
    const a = createOfflineModelAdapter({ provider: 'openai', endpoint: s.endpoint });
    const results = await Promise.all([a.execute(request()), a.execute(request())]);
    assert.ok(results.every(r => r.status === 'PROPOSED')); assert.notEqual(results[0].binding.requestId, results[1].binding.requestId);
    const q = request(); mutate = () => { q.contract.attemptBudgetUsd = 2; };
    assert.equal((await a.execute(q)).error.code, 'CONTRACT_CHANGED');
    const before = s.calls.length;
    assert.equal((await a.execute({ ...request(), cancelled: () => true })).error.code, 'CANCELLED');
    assert.equal(s.calls.length, before);
  } finally { await s.close(); }
});
