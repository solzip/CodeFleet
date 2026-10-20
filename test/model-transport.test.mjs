import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createHttpsModelAdapter, createTlsTestModelAdapter, modelRequest } from '../src/providers/model-api.mjs';
import { MODEL_PROTOCOLS, compatibleRequest, createTestModelTransport } from '../src/providers/model-transport.mjs';
import { createRegistry, selectProvider } from '../src/providers/registry.mjs';
import { judge } from '../src/alpha/judge.mjs';

// These certificates/private keys are PUBLIC, disposable test fixtures. They
// authenticate only a loopback server; never install them as system trust roots.
const fixture = name => readFileSync(new URL(`./fixtures/model-tls/${name}`, import.meta.url), 'utf8');
const ca = fixture('localhost.pem');
const request = () => ({ contract: { schemaVersion: 1, goal: 'Fix subtraction with protected tests.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 2, timeoutSeconds: 60, attemptBudgetUsd: 1, delivery: { mode: 'local' } }, files: { 'src/math.js': 'module.exports=(a,b)=>a+b;', 'test/math.test.js': 'protected' }, timeoutMs: 2000 });
const proposal = () => ({ summary: 'Fix', edits: [{ path: 'src/math.js', oldText: 'a+b', newText: 'a-b' }] });
const envelope = (provider, value = proposal()) => provider === 'openai'
  ? { id: 'resp_fake', object: 'response', model: MODEL_PROTOCOLS[provider].model, status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 20, output_tokens: 30 } }
  : { id: 'msg_fake', type: 'message', model: MODEL_PROTOCOLS[provider].model, role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(value) }], usage: { input_tokens: 20, output_tokens: 30 } };
const secret = provider => `G7C_FAKE_${provider.toUpperCase()}_TEST`;
async function server(provider, handler, wrong = false) {
  const calls = [];
  const s = https.createServer({ key: fixture(wrong ? 'wrong-key.pem' : 'fake-key.pem'), cert: wrong ? fixture('wrong-host.pem') : ca }, async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const wire = JSON.parse(Buffer.concat(chunks)); calls.push({ headers: req.headers, wire, url: req.url });
    res.setHeader('content-type', 'application/json');
    if (handler) await handler(req, res, wire); else res.end(JSON.stringify(envelope(provider)));
  });
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  const options = { provider, model: MODEL_PROTOCOLS[provider].model, environment: { [MODEL_PROTOCOLS[provider].env]: secret(provider) }, testTls: { port: s.address().port, ca } };
  return { calls, options, adapter: extra => createTlsTestModelAdapter({ ...options, ...extra }), close: async () => { s.closeAllConnections(); await new Promise(resolve => s.close(resolve)); } };
}

for (const provider of ['openai', 'anthropic']) {
  test(`${provider} TLS: structured contract and credential isolation`, async () => {
    const s = await server(provider);
    try {
      const a = s.adapter(), r = await a.execute(request());
      assert.equal(r.status, 'PROPOSED'); assert.deepEqual(r.proposal, proposal());
      assert.equal(r.cost, null); assert.equal(r.accounting.estimatedCostUsd, null);
      assert.equal(r.accounting.usageStatus, 'PROVIDER_REPORTED_ONLY'); assert.equal(r.accounting.hardCostCap, 'UNSUPPORTED');
      assert.equal(r.accounting.costStatus, 'UNKNOWN'); assert.equal(r.execution.transport, 'HTTPS');
      assert.equal(judge(r).outcome, 'ESCALATE');
      assert.equal(s.calls.length, 1); assert.deepEqual(s.calls[0].wire.tools, []);
      assert.equal(s.calls[0].url, provider === 'openai' ? '/v1/responses' : '/v1/messages');
      assert.equal(s.calls[0].headers[provider === 'openai' ? 'authorization' : 'x-api-key'], provider === 'openai' ? `Bearer ${secret(provider)}` : secret(provider));
      assert.equal(s.calls[0].headers[provider === 'openai' ? 'x-api-key' : 'authorization'], undefined);
      assert.ok(!JSON.stringify(r).includes(secret(provider))); assert.ok(!JSON.stringify(s.calls[0].wire).includes(secret(provider)));
      assert.equal((await a.probe()).liveValidation, 'NOT_RUN');
    } finally { await s.close(); }
  });

  test(`${provider} TLS: HTTP rejection, rate limits, no retries or body leakage`, async () => {
    for (const [status, code] of [[401, 'AUTHENTICATION_FAILED'], [403, 'PERMISSION_DENIED'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE'], [503, 'PROVIDER_UNAVAILABLE'], [302, 'HTTP_REJECTED']]) {
      const s = await server(provider, (_, res) => { res.statusCode = status; res.setHeader('location', 'https://not-allowed.invalid/'); res.setHeader('retry-after', '0'); res.end('sensitive server debug text'); });
      try {
        const a = s.adapter(), q = request(); const r = await a.execute(q);
        assert.equal(r.error.code, code); assert.equal(r.raw.stdout, ''); assert.equal(r.accounting.costStatus, 'UNKNOWN');
        assert.equal((await a.execute(q)).error.code, 'ATTEMPT_REUSED'); assert.equal(s.calls.length, 1);
      } finally { await s.close(); }
    }
  });

  test(`${provider} TLS: refusal, incomplete, malformed, foreign envelope and tools`, async () => {
    const cases = [
      ['REFUSAL', r => provider === 'openai' ? (r.output[0].content = [{ type: 'refusal', refusal: 'No' }]) : (r.stop_reason = 'refusal')],
      ['INCOMPLETE', r => provider === 'openai' ? (r.status = 'incomplete') : (r.stop_reason = 'max_tokens')],
      ['TOOL_OR_UNSUPPORTED_OUTPUT', r => provider === 'openai' ? (r.output = [{ type: 'function_call', name: 'shell' }]) : (r.content = [{ type: 'tool_use', name: 'shell' }])],
      ['INVALID_RESPONSE', r => { r.model = 'foreign-model'; }],
      ['INVALID_PROPOSAL', r => { const content = provider === 'openai' ? r.output[0].content : r.content; content[0].text = '{"verified":true}'; }],
      ['INVALID_JSON', r => { const content = provider === 'openai' ? r.output[0].content : r.content; content[0].text = '{'; }]
    ];
    for (const [code, mutate] of cases) {
      const s = await server(provider, (_, res) => { const r = envelope(provider); mutate(r); res.end(JSON.stringify(r)); });
      try { const r = await s.adapter().execute(request()); assert.equal(r.error.code, code); assert.equal(r.status, 'FAILED'); assert.equal(r.proposal, null); } finally { await s.close(); }
    }
    const s = await server(provider, (_, res) => res.end('{'));
    try { assert.equal((await s.adapter().execute(request())).error.code, 'INVALID_JSON'); } finally { await s.close(); }
  });

  test(`${provider} TLS: missing/invalid usage is unknown, not free`, async () => {
    for (const usage of [undefined, {}, { input_tokens: -1, output_tokens: 0 }, { input_tokens: '20', output_tokens: 0 }]) {
      const s = await server(provider, (_, res) => { const r = envelope(provider); r.usage = usage; res.end(JSON.stringify(r)); });
      try { const r = await s.adapter().execute(request()); assert.equal(r.status, 'PROPOSED'); assert.equal(r.cost, null); assert.equal(r.accounting.usageStatus, 'UNKNOWN'); assert.equal(r.accounting.costStatus, 'UNKNOWN'); } finally { await s.close(); }
    }
  });
}

test('TLS rejects untrusted certificate and trusted certificate with wrong hostname', async () => {
  for (const wrong of [false, true]) {
    const s = await server('openai', null, wrong);
    try {
      const r = await s.adapter({ testTls: { port: s.options.testTls.port, ...(wrong ? { ca: fixture('wrong-host.pem') } : {}) } }).execute(request());
      assert.equal(r.error.code, 'TLS_REJECTED'); assert.equal(s.calls.length, 0); assert.equal(r.accounting.costStatus, 'NOT_SENT');
    } finally { await s.close(); }
  }
});

test('fixed hosts/configuration, provider credentials, and Live capabilities fail closed', async () => {
  const p = MODEL_PROTOCOLS.openai;
  for (const extra of [{ endpoint: 'https://evil.invalid' }, { testTls: { port: 1 } }, { rejectUnauthorized: false }, { tools: [] }, { headers: {} }]) assert.throws(() => createHttpsModelAdapter({ provider: 'openai', model: p.model, ...extra }), /INVALID_CONFIGURATION/);
  assert.throws(() => createHttpsModelAdapter({ provider: 'openai', model: p.model, environment: { CODEFLEET_ANTHROPIC_API_KEY: secret('anthropic') } }), /CREDENTIAL_PROVIDER_MISMATCH/);
  assert.throws(() => createHttpsModelAdapter({ provider: 'openai', model: 'unknown' }), /MODEL_UNSUPPORTED/);
  const live = createHttpsModelAdapter({ provider: 'openai', model: p.model });
  assert.equal((await live.execute(request())).error.code, 'LIVE_CAPABILITY_UNVERIFIED');
  const report = await live.probe();
  assert.throws(() => selectProvider(createRegistry([live]), [report]), /CAPABILITY_UNAVAILABLE/);
  for (const field of ['hostname', 'endpoint', 'rejectUnauthorized', 'servername', 'headers']) assert.throws(() => createTlsTestModelAdapter({ provider: 'openai', model: p.model, testTls: { port: 1, [field]: 'override' } }), /TEST_TLS_CONFIGURATION/);
});

test('ambient TLS bypass and proxy variables do not disable certificate checks', async () => {
  const s = await server('openai');
  const previous = { NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED, HTTPS_PROXY: process.env.HTTPS_PROXY };
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
    const r = await s.adapter({ testTls: { port: s.options.testTls.port } }).execute(request());
    assert.equal(r.error.code, 'TLS_REJECTED'); assert.equal(s.calls.length, 0);
    const valid = await s.adapter().execute(request()); assert.equal(valid.status, 'PROPOSED'); assert.equal(s.calls.length, 1);
  } finally {
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await s.close();
  }
});

test('TLS credentials stay in transport; missing, bad, cross-provider and reflected values rejected', async () => {
  const s = await server('openai');
  try {
    for (const [value, code] of [[undefined, 'CREDENTIAL_MISSING'], ['', 'CREDENTIAL_MISSING'], ['bad\r\nheader', 'CREDENTIAL_FORMAT'], [secret('anthropic'), 'CREDENTIAL_FORMAT']]) {
      assert.equal((await s.adapter({ environment: { CODEFLEET_OPENAI_API_KEY: value } }).execute(request())).error.code, code);
    }
    const q = request(); q.files['src/math.js'] += secret('openai');
    assert.equal((await s.adapter().execute(q)).error.code, 'CREDENTIAL_IN_INPUT'); assert.equal(s.calls.length, 0);
  } finally { await s.close(); }
  for (const encoded of [false, true]) {
    const s = await server('openai', (_, res) => res.end(JSON.stringify({ leak: secret('openai') }).replaceAll('G', encoded ? '\\u0047' : 'G')));
    try { const r = await s.adapter().execute(request()); assert.equal(r.error.code, 'CREDENTIAL_REFLECTION'); assert.equal(r.raw, null); assert.ok(!JSON.stringify(r).includes(secret('openai'))); } finally { await s.close(); }
  }
});

test('TLS limits, incomplete HTTP and content type are enforced', async () => {
  for (const [code, handler] of [
    ['OUTPUT_LIMIT', (_, res) => res.end('x'.repeat(256001))],
    ['INCOMPLETE_HTTP', (_, res) => { res.setHeader('content-length', '999'); res.write('{}'); setTimeout(() => res.destroy(), 10); }],
    ['CONTENT_TYPE', (_, res) => { res.setHeader('content-type', 'text/html'); res.end('{}'); }]
  ]) {
    const s = await server('openai', handler);
    try { assert.equal((await s.adapter().execute(request())).error.code, code); } finally { await s.close(); }
  }
});

test('TLS timeout, cancellation, stale Attempt and immutable request; no retry', async () => {
  for (const code of ['TIMEOUT', 'CANCELLED', 'STALE_ATTEMPT', 'CONTRACT_CHANGED']) {
    let current = true, cancelled = false;
    const q = request();
    const s = await server('openai', async (_, res) => {
      if (code === 'CANCELLED') cancelled = true;
      if (code === 'STALE_ATTEMPT') current = false;
      if (code === 'CONTRACT_CHANGED') q.contract.goal += ' changed';
      await new Promise(r => setTimeout(r, 70)); res.end(JSON.stringify(envelope('openai')));
    });
    try {
      q.cancelled = () => cancelled; if (code === 'TIMEOUT') q.timeoutMs = 35;
      const a = s.adapter({ isCurrent: () => current }); const r = await a.execute(q);
      assert.equal(r.error.code, code); assert.equal(r.accounting.costStatus, 'UNKNOWN');
      assert.equal((await a.execute(q)).error.code, 'ATTEMPT_REUSED'); assert.equal(s.calls.length, 1);
    } finally { await s.close(); }
  }
});

test('request budget/token/size and original schema validation remain required', async () => {
  const s = await server('anthropic');
  try {
    const t = createTestModelTransport(s.options);
    const wire = compatibleRequest('anthropic', s.options.model, modelRequest('anthropic', s.options.model, request()));
    assert.equal(wire.output_config.format.schema.properties.edits.minItems, undefined);
    for (const [code, altered, q] of [
      ['TOKEN_LIMIT', { ...wire, max_tokens: 4097 }, request()],
      ['PROPOSAL_ONLY_REQUIRED', { ...wire, tools: [{ name: 'shell' }] }, request()],
      ['PROPOSAL_ONLY_REQUIRED', { ...wire, endpoint: 'https://evil.invalid' }, request()],
      ['BUDGET_INVALID', wire, { attemptBudgetUsd: 0 }],
      ['INPUT_LIMIT', { ...wire, messages: [{ role: 'user', content: 'x'.repeat(220001) }] }, request()]
    ]) await assert.rejects(t.exchange(altered, 1000, () => null, {}, q), e => e.code === code);
    const malformed = structuredClone(wire); malformed.output_config.format.schema.additionalProperties = true;
    assert.throws(() => compatibleRequest('anthropic', s.options.model, malformed), /INVALID_SCHEMA/);
    assert.equal(s.calls.length, 0);
  } finally { await s.close(); }
  const invalid = await server('anthropic', (_, res) => res.end(JSON.stringify(envelope('anthropic', { summary: 'empty forbidden', edits: [] }))));
  try { assert.equal((await invalid.adapter().execute(request())).error.code, 'INVALID_PROPOSAL'); } finally { await invalid.close(); }
});
