// G7-B: bounded direct-model protocol, offline transport only. No agent runtime,
// tool dispatcher, filesystem access, ambient credentials or live endpoint path.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { hash, applyEdits } from '../alpha/contract.mjs';
import { responseSchema, validateRequest, resultRecord, fail } from './interface.mjs';
import { planningSchema } from './planner.mjs';
import { validateSemanticProposal } from '../intent/semantic.mjs';
import { CAPABILITIES } from './capabilities.mjs';
import { PROPOSAL_ENVIRONMENT } from './registry.mjs';
import { createModelTransport, createTestModelTransport, compatibleRequest } from './model-transport.mjs';

const ROUTES = Object.freeze({ openai: '/v1/responses', anthropic: '/v1/messages' });
const error = code => Object.assign(Error(code), { code });
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k));
function payload(request) {
  const planning = request.kind === 'SemanticPlanningRequest';
  const common = ['kind', 'mode', 'timeoutMs', 'cancelled'];
  if (!keys(request, [...common, ...(planning ? ['objective', 'context', 'attemptBudgetUsd'] : ['contract', 'files', 'feedback'])])) throw error('INVALID_REQUEST');
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0 || request.timeoutMs > (planning ? 30000 : 180000)) throw error('INVALID_REQUEST');
  if (request.cancelled !== undefined && typeof request.cancelled !== 'function') throw error('INVALID_REQUEST');
  if (planning) {
    if (request.mode !== 'PROPOSAL_ONLY' || request.attemptBudgetUsd !== 1 || typeof request.objective !== 'string' || !request.objective.trim() || request.objective.length > 4000 || !request.context?.files || request.context.truncated) throw error('INVALID_REQUEST');
  } else validateRequest(request);
  const value = planning ? { objective: request.objective, context: request.context } : { goal: request.contract.goal, allowedFiles: request.contract.files, files: request.files, previousVerification: request.feedback ?? null };
  const input = JSON.stringify(value);
  if (Buffer.byteLength(input) > 200000) throw error('INPUT_LIMIT');
  return { planning, input, schema: planning ? planningSchema : responseSchema };
}

// Explicit fields only: callers/model output cannot supply tools, MCP, URLs,
// sessions, file attachments, background execution or request options.
export function modelRequest(provider, model, request) {
  if (!Object.hasOwn(ROUTES, provider) || typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw error('INVALID_CONFIGURATION');
  const { input, schema } = payload(request);
  if (provider === 'openai') return { model, input, tools: [], tool_choice: 'none', store: false, stream: false, max_output_tokens: 4096,
    text: { format: { type: 'json_schema', name: 'codefleet_proposal', strict: true, schema } } };
  return { model, messages: [{ role: 'user', content: input }], tools: [], stream: false, max_tokens: 4096,
    output_config: { format: { type: 'json_schema', schema } } };
}

export function parseModelResponse(provider, body, model) {
  let r;
  try { r = JSON.parse(body); } catch { throw error('INVALID_JSON'); }
  if (!r || r.model !== model || typeof r.id !== 'string' || !r.id || r.error) throw error('INVALID_RESPONSE');
  let text;
  if (provider === 'openai') {
    if (r.status === 'incomplete') throw error('INCOMPLETE');
    if (r.output?.some(m => m.content?.some(c => c.type === 'refusal'))) throw error('REFUSAL');
    if (r.object !== 'response' || r.status !== 'completed' || !Array.isArray(r.output) || r.output.length !== 1) throw error('INVALID_RESPONSE');
    const m = r.output[0];
    if (m.type !== 'message' || m.role !== 'assistant' || m.status !== 'completed' || !Array.isArray(m.content) || m.content.length !== 1 || m.content[0].type !== 'output_text') throw error('TOOL_OR_UNSUPPORTED_OUTPUT');
    text = m.content[0].text;
  } else if (provider === 'anthropic') {
    if (r.stop_reason === 'refusal') throw error('REFUSAL');
    if (r.stop_reason === 'max_tokens') throw error('INCOMPLETE');
    if (r.type !== 'message' || r.role !== 'assistant' || r.stop_reason !== 'end_turn' || !Array.isArray(r.content) || r.content.length !== 1 || r.content[0].type !== 'text') throw error('TOOL_OR_UNSUPPORTED_OUTPUT');
    text = r.content[0].text;
  } else throw error('INVALID_CONFIGURATION');
  if (typeof text !== 'string') throw error('INVALID_RESPONSE');
  let value;
  try { value = JSON.parse(text); } catch { throw error('INVALID_JSON'); }
  return { value, usage: r.usage ?? null };
}

// Only exact numeric loopback is supported. No DNS, redirects, proxy env,
// external network, local sockets, TLS downgrade or user-supplied headers.
function exchange(endpoint, credential, wire, timeoutMs, stopped) {
  return new Promise((resolve, reject) => {
    let done = false, timer, poll, response;
    const finish = (e, value) => { if (done) return; done = true; clearTimeout(timer); clearInterval(poll); if (e) { response?.destroy(); req.destroy(); reject(e); } else resolve(value); };
    const req = http.request(endpoint, { method: 'POST', agent: false, headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}`, 'anthropic-version': '2023-06-01' } }, res => {
      response = res; const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 256000) finish(error('OUTPUT_LIMIT')); else chunks.push(chunk); });
      res.on('error', () => finish(error('TRANSPORT_FAILED')));
      res.on('end', () => finish(null, { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', () => finish(error('TRANSPORT_FAILED')));
    timer = setTimeout(() => finish(error('TIMEOUT')), timeoutMs);
    poll = setInterval(() => { try { const reason = stopped(); if (reason) finish(error(reason)); } catch { finish(error('STALE_ATTEMPT')); } }, 10);
    req.end(JSON.stringify(wire));
  });
}

export function createOfflineModelAdapter({ provider, endpoint, fakeCredential = 'G7B_FAKE_ONLY', isCurrent = () => true } = {}) {
  if (!Object.hasOwn(ROUTES, provider) || typeof endpoint !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/v1\/(responses|messages)$/.test(endpoint) || new URL(endpoint).pathname !== ROUTES[provider] || !/^G7B_FAKE_[A-Z0-9_]{1,64}$/.test(fakeCredential) || typeof isCurrent !== 'function') throw error('OFFLINE_BOUNDARY_REQUIRED');
  return adapter({ provider, endpoint, fakeCredential, isCurrent });
}

// Production transport remains blocked pending a separately approved Live gate.
// Test routing is a distinct host API and can only reach loopback with fake keys.
export function createHttpsModelAdapter(options) {
  const transport = createModelTransport(options);
  return adapter({ provider: options.provider, model: options.model, isCurrent: options.isCurrent ?? (() => true), transport });
}
export function createTlsTestModelAdapter(options) {
  const transport = createTestModelTransport(options);
  return adapter({ provider: options.provider, model: options.model, isCurrent: options.isCurrent ?? (() => true), transport });
}
function adapter({ provider, endpoint, fakeCredential = '', isCurrent, model = 'codefleet-fixture', transport }) {
  const scope = transport?.scope ?? 'OFFLINE_LOOPBACK_FAKE_ONLY';
  const identity = Object.freeze({ id: `${provider}-model-${transport ? 'https' : 'offline'}`, version: transport ? 'g7c-v1' : 'g7b-offline-v1', platform: process.platform, executable: null });
  const used = new WeakSet();
  const redact = text => fakeCredential ? text.replaceAll(fakeCredential, '[REDACTED]') : text;
  return {
    id: identity.id, tasks: ['semantic-planning', 'edit-proposal'],
    async probe() {
      const supported = new Set(['non_interactive_execution', 'structured_output', 'proposal_only', 'cancellation']);
      return { identity, installed: true, liveValidation: 'NOT_RUN', scope, ...(transport?.blocked ? { executionBlocked: 'LIVE_CAPABILITY_UNVERIFIED' } : {}),
        capabilities: Object.fromEntries(CAPABILITIES.map(c => [c, { status: !transport?.blocked && supported.has(c) ? 'SUPPORTED' : 'UNVERIFIED', evidence: 'Host implementation; offline fixture protocol only, not live Provider certification' }])),
        environment: Object.fromEntries(PROPOSAL_ENVIRONMENT.map(c => [c, { status: transport?.blocked ? 'UNVERIFIED' : 'SUPPORTED', evidence: transport ? 'Bounded HTTPS with no tool dispatcher; local TLS tests only. Live execution blocked. Not an OS sandbox.' : 'No model code/tools run locally; fixed loopback transport, fake credential closure only. Not a general OS sandbox.' }])) };
    },
    async execute(request) {
      const result = resultRecord(identity); result.scope = scope;
      if (transport) result.accounting = { usageStatus: 'UNKNOWN', estimatedCostUsd: null, costStatus: 'NOT_SENT', hardCostCap: 'UNSUPPORTED' };
      result.binding = { requestId: randomUUID() };
      const stopped = () => !isCurrent(request) ? 'STALE_ATTEMPT' : request.cancelled?.() ? 'CANCELLED' : null;
      try {
        const p = payload(request), originalWire = modelRequest(provider, model, request);
        const wire = transport ? compatibleRequest(provider, model, originalWire) : originalWire;
        if (used.has(request)) throw error('ATTEMPT_REUSED');
        used.add(request); result.binding.inputHash = hash(p.input);
        const snapshot = JSON.parse(JSON.stringify(request));
        result.binding.requestHash = hash(snapshot);
        const before = stopped(); if (before) throw error(before);
        const response = transport ? await transport.exchange(wire, request.timeoutMs, stopped, result.accounting, snapshot) : await exchange(endpoint, fakeCredential, wire, request.timeoutMs, stopped);
        const after = stopped(); if (after) throw error(after);
        if (hash(JSON.parse(JSON.stringify(request))) !== result.binding.requestHash || hash(payload(request).input) !== result.binding.inputHash) throw error('CONTRACT_CHANGED');
        result.raw = { stdout: redact(response.body), stderr: '' };
        result.execution = { exitCode: response.status === 200 ? 0 : 1, interrupted: false, truncated: false, error: null, transport: transport ? 'HTTPS' : 'HTTP', httpStatus: response.status };
        // A response reflecting the credential is rejected, never promoted to a
        // proposal/usage/artifact. Raw evidence is retained with redaction.
        let canonical = response.body;
        try { canonical = JSON.stringify(JSON.parse(response.body)); } catch { /* Parser below rejects invalid JSON. */ }
        if (fakeCredential && (canonical.includes(fakeCredential) || response.body.includes(fakeCredential))) {
          result.raw.stdout = redact(canonical); throw error('CREDENTIAL_REFLECTION');
        }
        if (response.status !== 200) throw error(transport ? ({ 401: 'AUTHENTICATION_FAILED', 403: 'PERMISSION_DENIED', 429: 'RATE_LIMITED' }[response.status] ?? (response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'HTTP_REJECTED')) : 'HTTP_REJECTED');
        result.schemaValidation.status = 'INVALID';
        const parsed = parseModelResponse(provider, response.body, model);
        result.usage = parsed.usage; // Cost unknown, never infer zero from usage.
        if (transport) transport.account(parsed.usage, result.accounting);
        if (p.planning) { validateSemanticProposal(parsed.value, snapshot.context, snapshot.objective); result.planning = parsed.value; }
        else { applyEdits(snapshot.contract, snapshot.files, parsed.value); result.proposal = parsed.value; }
        result.schemaValidation.status = 'VALID'; result.status = 'PROPOSED'; return result;
      } catch (e) {
        const code = e.code ?? 'INVALID_PROPOSAL';
        if (result.schemaValidation.status === 'INVALID') result.schemaValidation.errors = [code];
        result.execution ??= { exitCode: null, interrupted: ['TIMEOUT', 'CANCELLED', 'STALE_ATTEMPT'].includes(code), truncated: code === 'OUTPUT_LIMIT', error: code, transport: transport ? 'HTTPS' : 'HTTP' };
        return fail(result, code, 'Bounded model request refused or incomplete; no tool execution and no automatic retry');
      }
    }
  };
}
