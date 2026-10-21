// Trusted host transport, not an agent runtime or general-purpose HTTP client.
import https from 'node:https';
import { checkServerIdentity, getCACertificates } from 'node:tls';

const error = code => Object.assign(Error(code), { code });
export const MODEL_PROTOCOLS = Object.freeze({
  openai: Object.freeze({ endpoint: 'https://api.openai.com/v1/responses', model: 'gpt-4o-2024-08-06', env: 'CODEFLEET_OPENAI_API_KEY' }),
  anthropic: Object.freeze({ endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-5-20250929', env: 'CODEFLEET_ANTHROPIC_API_KEY' })
});
const allowed = (o, names) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(k => names.includes(k));

// Provider schemas express shape. Full constraints remain in applyEdits and
// validateSemanticProposal; removing unsupported wire constraints is not a waiver.
function wireSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw error('INVALID_SCHEMA');
  const out = structuredClone(schema);
  if ('const' in out) { out.type = Number.isInteger(out.const) ? 'integer' : typeof out.const; out.enum = [out.const]; delete out.const; }
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) delete out[k];
  if (out.type === 'object') {
    if (out.additionalProperties !== false || !out.properties || !Array.isArray(out.required) || Object.keys(out.properties).some(k => !out.required.includes(k))) throw error('INVALID_SCHEMA');
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, wireSchema(v)]));
  } else if (out.type === 'array') out.items = wireSchema(out.items);
  else if (!['string', 'integer', 'number', 'boolean'].includes(out.type)) throw error('INVALID_SCHEMA');
  return out;
}
export function compatibleRequest(provider, model, wire) {
  if (MODEL_PROTOCOLS[provider]?.model !== model || wire.model !== model) throw error('MODEL_UNSUPPORTED');
  const copy = structuredClone(wire);
  const format = provider === 'openai' ? copy.text?.format : copy.output_config?.format;
  if (format?.type !== 'json_schema') throw error('INVALID_SCHEMA');
  format.schema = wireSchema(format.schema);
  return copy;
}

export function createModelTransport(options = {}) {
  if (!allowed(options, ['provider', 'model', 'environment', 'isCurrent'])) throw error('INVALID_CONFIGURATION');
  return transport(options, null);
}

// Separate offline entry point: no hostname, URL, headers or arbitrary TLS
// options; only fake credentials and numeric loopback. Never used by the CLI.
export function createTestModelTransport(options = {}) {
  if (!allowed(options, ['provider', 'model', 'environment', 'isCurrent', 'testTls'])) throw error('INVALID_CONFIGURATION');
  const t = options.testTls;
  if (!allowed(t, ['port', 'ca']) || !Number.isInteger(t.port) || t.port < 1 || t.port > 65535 || (t.ca !== undefined && typeof t.ca !== 'string')) throw error('TEST_TLS_CONFIGURATION');
  return transport(options, { port: t.port, ca: t.ca });
}

function transport({ provider, model, environment = {}, isCurrent }, testTls) {
  const protocol = MODEL_PROTOCOLS[provider];
  if (!protocol || protocol.model !== model || (isCurrent !== undefined && typeof isCurrent !== 'function')) throw error('MODEL_UNSUPPORTED');
  // Explicit injected map only. Do not inspect process.env or CLI auth stores.
  if (!allowed(environment, [protocol.env])) throw error('CREDENTIAL_PROVIDER_MISMATCH');
  const credentials = { ...environment };
  function credential() {
    const value = credentials[protocol.env];
    if (value === undefined || value === '') throw error('CREDENTIAL_MISSING');
    const pattern = testTls ? new RegExp(`^G7C_FAKE_${provider.toUpperCase()}_[A-Z0-9_]{1,64}$`)
      : provider === 'openai' ? /^sk-(?!ant-)[A-Za-z0-9_-]{20,256}$/ : /^sk-ant-[A-Za-z0-9_-]{20,256}$/;
    if (typeof value !== 'string' || !pattern.test(value)) throw error('CREDENTIAL_FORMAT');
    return value;
  }
  return Object.freeze({
    scope: testTls ? 'OFFLINE_TLS_FAKE_ONLY' : 'LIVE_NOT_VERIFIED', blocked: !testTls,
    account(usage, accounting) {
      if (usage && Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0) {
        accounting.usageStatus = 'PROVIDER_REPORTED_ONLY';
        accounting.tokens = { input: usage.input_tokens, output: usage.output_tokens };
      }
      // No pricing table is certified here. Neither provider tokens nor an
      // estimate can clear the Controller's unknown-cost reservation.
      accounting.costStatus = 'UNKNOWN';
    },
    async exchange(wire, timeoutMs, stopped, accounting, request) {
      const budget = request.contract?.attemptBudgetUsd ?? request.attemptBudgetUsd;
      if (!Number.isFinite(budget) || budget <= 0 || budget > 10) throw error('BUDGET_INVALID');
      const tokens = provider === 'openai' ? wire.max_output_tokens : wire.max_tokens;
      if (!Number.isSafeInteger(tokens) || tokens < 1 || tokens > 4096) throw error('TOKEN_LIMIT');
      const names = provider === 'openai' ? ['model', 'input', 'tools', 'tool_choice', 'store', 'stream', 'max_output_tokens', 'text'] : ['model', 'messages', 'tools', 'stream', 'max_tokens', 'output_config'];
      if (!allowed(wire, names) || wire.model !== model || !Array.isArray(wire.tools) || wire.tools.length || wire.stream !== false ||
          (provider === 'openai' && (wire.tool_choice !== 'none' || wire.store !== false))) throw error('PROPOSAL_ONLY_REQUIRED');
      const data = JSON.stringify(wire);
      if (Buffer.byteLength(data) > 220000) throw error('INPUT_LIMIT');
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 180000) throw error('INVALID_TIMEOUT');
      if (!testTls) throw error('LIVE_CAPABILITY_UNVERIFIED');
      const secret = credential();
      if (data.includes(secret)) throw error('CREDENTIAL_IN_INPUT');
      const before = stopped(); if (before) throw error(before);
      const endpoint = new URL(protocol.endpoint);
      return new Promise((resolve, reject) => {
        let done = false, response, timer, poll;
        const finish = (e, value) => {
          if (done) return; done = true; clearTimeout(timer); clearInterval(poll);
          if (e) { response?.destroy(); req.destroy(); reject(e); } else resolve(value);
        };
        const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), accept: 'application/json' };
        if (provider === 'openai') headers.authorization = `Bearer ${secret}`;
        else { headers['x-api-key'] = secret; headers['anthropic-version'] = '2023-06-01'; }
        const req = https.request({
          hostname: testTls ? '127.0.0.1' : endpoint.hostname, port: testTls?.port ?? 443,
          path: endpoint.pathname, method: 'POST', headers, agent: false,
          servername: testTls ? 'localhost' : endpoint.hostname,
          // Explicit trust roots ignore NODE_EXTRA_CA_CERTS / global agents.
          ca: testTls?.ca ?? getCACertificates('bundled'), rejectUnauthorized: true,
          minVersion: 'TLSv1.2', checkServerIdentity, maxHeaderSize: 16384
        }, res => {
          response = res; let bytes = 0; const chunks = [];
          res.on('data', chunk => { bytes += chunk.length; if (bytes > 256000) finish(error('OUTPUT_LIMIT')); else chunks.push(chunk); });
          res.on('aborted', () => finish(error('INCOMPLETE_HTTP')));
          res.on('error', () => finish(error('INCOMPLETE_HTTP')));
          res.on('end', () => {
            if (!res.complete) return finish(error('INCOMPLETE_HTTP'));
            const body = Buffer.concat(chunks).toString('utf8');
            let canonical = body; try { canonical = JSON.stringify(JSON.parse(body)); } catch { /* host parser handles malformed JSON */ }
            // Do not retain raw HTTP error bodies or reflected credentials.
            if (canonical.includes(secret) || body.includes(secret)) return finish(error('CREDENTIAL_REFLECTION'));
            if (res.statusCode === 200 && !/^application\/json(?:;|$)/i.test(res.headers['content-type'] ?? '')) return finish(error('CONTENT_TYPE'));
            finish(null, { status: res.statusCode, body: res.statusCode === 200 ? body : '', retry: 'NEVER_AUTOMATIC' });
          });
        });
        req.on('socket', socket => socket.once('secureConnect', () => { accounting.costStatus = 'UNKNOWN'; }));
        req.on('error', e => finish(error(/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(e.code ?? '') ? 'TLS_REJECTED' : 'TRANSPORT_FAILED')));
        timer = setTimeout(() => finish(error('TIMEOUT')), timeoutMs);
        poll = setInterval(() => { try { const reason = stopped(); if (reason) finish(error(reason)); } catch { finish(error('STALE_ATTEMPT')); } }, 10);
        req.end(data);
      });
    }
  });
}
