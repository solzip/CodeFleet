import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClaudeAdapter, parseClaude, providerArgs } from '../src/providers/claude.mjs';
import { createCodexAdapter, normalizeCodex, parseCodex } from '../src/providers/codex.mjs';
import { normalize, ProviderError, requireProposal, validateRequest, responseSchema } from '../src/providers/interface.mjs';
import { createRegistry, selectProvider, proposeSelected } from '../src/providers/registry.mjs';
import { probeProvider, CAPABILITIES } from '../src/providers/capabilities.mjs';
import { judge } from '../src/alpha/judge.mjs';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { hash, validateContract } from '../src/alpha/contract.mjs';
import { command } from '../src/alpha/process.mjs';
import { providerArgs as v1Args, responseSchema as v1Schema } from '../src/alpha/provider.mjs';

const proposal = () => ({ summary: 'Fix subtraction', edits: [{ path: 'src/math.js', oldText: 'a + b', newText: 'a - b' }] });
const request = () => ({ contract: { schemaVersion: 1, goal: 'Fix subtraction while preserving tests.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 2, timeoutSeconds: 60, attemptBudgetUsd: 1, delivery: { mode: 'local' } }, files: { 'src/math.js': 'a + b', 'test/math.test.js': 'protected' }, timeoutMs: 1000 });
const result = (stdout, patch = {}) => ({ exitCode: 0, interrupted: false, truncated: false, error: null, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), ...patch });
const envelope = () => JSON.stringify({ structured_output: proposal(), total_cost_usd: 0.1, usage: { input_tokens: 10 } });
const identity = id => ({ id, version: 'fixture-1', platform: process.platform, executable: 'fake' });
const events = () => [{ type: 'thread.started', thread_id: 'fixture' }, { type: 'turn.started' }, { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(proposal()) } }, { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 20 } }];
const jsonl = values => values.map(v => JSON.stringify(v)).join('\n');
const supported = id => ({ identity: identity(id), installed: true, capabilities: Object.fromEntries(CAPABILITIES.map(c => [c, { status: 'SUPPORTED', evidence: 'Fake provider contract fixture, not live evidence' }])), environment: Object.fromEntries(['filesystem_restriction', 'network_restriction', 'credential_isolation'].map(c => [c, { status: 'SUPPORTED', evidence: 'Fake host fixture only' }])) });

test('Claude v1 flags/schema/context/environment remain bounded through the adapter', async () => {
  assert.equal(v1Args, providerArgs); assert.equal(v1Schema, responseSchema);
  let launches = 0;
  const adapter = createClaudeAdapter({ runCommand: async (exe, args, options) => {
    launches++;
    assert.equal(exe, process.platform === 'win32' ? 'claude.exe' : 'claude');
    assert.deepEqual(args, providerArgs(1));
    for (const [flag, value] of [['--tools', ''], ['--mcp-config', '{"mcpServers":{}}'], ['--setting-sources', ''], ['--settings', '{"disableAllHooks":true}'], ['--max-budget-usd', '1']]) assert.equal(args[args.indexOf(flag) + 1], value);
    assert.ok(args.includes('--strict-mcp-config')); assert.ok(args.includes('--no-session-persistence')); assert.ok(args.includes('--disable-slash-commands'));
    assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.GITHUB_TOKEN, undefined); assert.equal(options.env.CODEFLEET_FAKE_SECRET, undefined);
    assert.notEqual(options.cwd, process.cwd());
    assert.deepEqual(JSON.parse(options.input).files, request().files);
    return result(envelope());
  } });
  const r = requireProposal(await adapter.execute(request()));
  assert.equal(launches, 1); assert.equal(r.authority, 'PROVIDER_REPORTED_ONLY');
  assert.deepEqual(r.proposal, proposal()); assert.equal(r.cost, 0.1);
  assert.equal(r.raw.stdout, envelope()); assert.equal(r.execution.exitCode, 0);
  assert.equal(r.schemaValidation.status, 'VALID'); assert.deepEqual(r.usage, { input_tokens: 10 });
  assert.equal(judge({ ...r, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, integrity: true, testIdentityMatch: true, exitCode: 0 }).outcome, 'ESCALATE');
});

test('Claude and Codex normalize the same edit envelope without sharing sessions', () => {
  const claude = normalize(identity('claude'), result(envelope()), request(), parseClaude);
  const codex = normalizeCodex(identity('codex'), result(jsonl(events())), request());
  assert.deepEqual(codex.proposal, claude.proposal);
  assert.equal(codex.status, 'PROPOSED'); assert.equal(codex.cost, null);
  assert.equal(codex.events.length, 4); assert.equal(codex.sessionId, undefined);
  assert.equal(codex.usage.output_tokens, 20); assert.equal(codex.authority, 'PROVIDER_REPORTED_ONLY');
});

test('both adapters reject malformed JSON, schema mismatch, extra fields and out-of-scope edits', () => {
  for (const bad of [null, { summary: 'bad', edits: [] }, { ...proposal(), state: 'COMPLETED' }, { summary: 'bad', edits: [{ path: 'test/math.test.js', oldText: 'protected', newText: 'PASS' }] }, { summary: 'bad', edits: [{ ...proposal().edits[0], oldText: 'not present' }] }]) {
    const c = normalize(identity('claude'), result(JSON.stringify({ structured_output: bad })), request(), parseClaude);
    const e = events(); e[2].item.text = JSON.stringify(bad);
    const x = normalizeCodex(identity('codex'), result(jsonl(e)), request());
    assert.equal(c.status, 'FAILED'); assert.equal(x.status, 'FAILED');
    assert.throws(() => requireProposal(c), ProviderError); assert.throws(() => requireProposal(x), ProviderError);
  }
  for (const parse of [parseClaude, parseCodex]) assert.equal(normalize(identity('fake'), result('not JSON'), request(), parse).error.code, 'INVALID_JSON');
});

test('Codex JSONL requires one completed message and refuses tools, errors and truncated turns', () => {
  for (const stream of [[], events().slice(0, -1), [...events(), { type: 'turn.started' }], [{ type: 'turn.failed' }], [{ type: 'item.completed', item: { type: 'command_execution', command: 'echo unsafe' } }], [{ type: 'unknown' }], [...events().slice(0, 3), events()[2], events()[3]]]) {
    assert.notEqual(normalizeCodex(identity('codex'), result(jsonl(stream)), request()).status, 'PROPOSED');
  }
});

test('nonzero exit, interruption, output limits and unavailable execution never parse as success', () => {
  for (const [patch, code] of [[{ exitCode: 1 }, 'PROCESS_FAILED'], [{ exitCode: null, error: 'ENOENT' }, 'PROCESS_FAILED'], [{ interrupted: true }, 'INTERRUPTED'], [{ truncated: true }, 'OUTPUT_LIMIT']]) {
    for (const [id, stdout, parse] of [['claude', envelope(), parseClaude], ['codex', jsonl(events()), parseCodex]]) {
      const r = normalize(identity(id), result(stdout, patch), request(), parse);
      assert.equal(r.error.code, code); assert.equal(r.schemaValidation.status, 'NOT_RUN');
      assert.equal(r.raw.stdout, stdout); assert.equal(r.proposal, null);
    }
  }
});

test('Claude cancellation and invalid request stop before any child launch', async () => {
  let launches = 0;
  const adapter = createClaudeAdapter({ runCommand: async () => { launches++; return result(envelope()); } });
  const cancelled = await adapter.execute({ ...request(), cancelled: () => true });
  assert.equal(cancelled.error.code, 'CANCELLED');
  for (const patch of [{ sessionId: 'codex-session' }, { mode: 'SANDBOXED_AGENT' }, { timeoutMs: Infinity }, { files: { ...request().files, '.env': 'secret' } }]) {
    assert.equal((await adapter.execute({ ...request(), ...patch })).error.code, 'INVALID_REQUEST');
  }
  assert.equal(launches, 0);
});

test('unknown, negative or missing usage is never a zero cost', () => {
  for (const total_cost_usd of [undefined, null, -1, '1']) {
    const r = normalize(identity('claude'), result(JSON.stringify({ structured_output: proposal(), total_cost_usd })), request(), parseClaude);
    assert.equal(r.cost, null);
  }
  assert.equal(normalize(identity('claude'), result(JSON.stringify({ structured_output: proposal(), total_cost_usd: 0 })), request(), parseClaude).cost, 0);
});

test('help and version probes cannot promote live or OS capabilities', async () => {
  const calls = [];
  const report = await probeProvider('codex', { executable: 'fake', runCommand: async (_exe, args) => { calls.push(args); return result(args[0] === '--version' ? 'codex-cli fixture' : 'Usage: codex exec --output-schema --json --sandbox'); } });
  assert.deepEqual(calls, [['--version'], ['exec', '--help']]);
  assert.equal(report.installed, true); assert.equal(report.capabilities.structured_output.advertised, true);
  for (const cap of Object.values(report.capabilities)) assert.equal(cap.status, 'UNVERIFIED');
  assert.equal(report.environment.filesystem_restriction.status, 'UNVERIFIED');
  assert.equal(report.liveValidation, 'NOT_RUN');
  const absent = await probeProvider('claude', { runCommand: async () => result('', { exitCode: null, error: 'ENOENT' }) });
  assert.equal(absent.installed, false); assert.equal(absent.capabilities.proposal_only.status, 'UNAVAILABLE');
});

test('Codex remains blocked even when called directly; no model/process fallback', async () => {
  let calls = 0;
  const codex = createCodexAdapter({ runCommand: async () => { calls++; throw Error('must not run'); } });
  const r = await codex.execute({ ...request(), capabilities: supported('codex') });
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.error.code, 'CAPABILITY_UNVERIFIED');
  assert.equal(calls, 0); assert.equal(r.execution, null);
});

const fake = id => ({ id, probe: async () => supported(id), execute: async req => normalize(identity(id), result(envelope()), req, parseClaude) });
test('Balanced selection hard-filters before preference and uses deterministic ties', () => {
  const registry = createRegistry([fake('codex'), fake('claude')]);
  const reports = [supported('codex'), supported('claude')];
  assert.equal(selectProvider(registry, reports).providerId, 'claude');
  assert.equal(selectProvider(registry, reports, { requested: 'codex' }).providerId, 'codex');
  assert.equal(selectProvider(registry, reports, { projectDefault: 'absent' }).providerId, 'claude');
  assert.equal(selectProvider(registry, reports, { allowed: ['codex'] }).providerId, 'codex');
  reports[0].capabilities.proposal_only.status = 'UNVERIFIED';
  assert.throws(() => selectProvider(registry, reports, { requested: 'codex' }), /CAPABILITY_UNAVAILABLE/);
  assert.throws(() => selectProvider(registry, reports, { requested: 'codex', required: [] }), /CAPABILITY_UNAVAILABLE/);
  assert.equal(selectProvider(registry, reports, { projectDefault: 'codex' }).providerId, 'claude');
  assert.throws(() => selectProvider(registry, reports, { required: ['unknown'] }), /Unknown required/);
  assert.throws(() => selectProvider(registry, reports, { allowed: [] }), /CAPABILITY_UNAVAILABLE/);
});

test('missing OS enforcement and post-attempt failover are denied without trusting preferences', () => {
  const registry = createRegistry([fake('claude'), fake('codex')]);
  const reports = [supported('claude'), supported('codex')];
  const missingEnvironment = reports.map(r => ({ ...r, environment: {} }));
  assert.throws(() => selectProvider(registry, missingEnvironment, { environmentRequired: [] }), /Environment/);
  assert.throws(() => selectProvider(registry, missingEnvironment, { environmentRequired: ['network_restriction'] }), /Environment/);
  assert.throws(() => selectProvider(registry, reports, { requested: 'codex', previousAttempt: { providerId: 'claude', exited: true } }), /FALLBACK_BLOCKED/);
  reports[1].installed = false;
  assert.throws(() => selectProvider(registry, reports, { requested: 'codex' }), /CAPABILITY_UNAVAILABLE/);
});

test('strict routing uses fresh probes and never silently falls back after launch failure', async () => {
  let calls = 0;
  const registry = createRegistry([fake('claude'), { ...fake('codex'), execute: async () => { calls++; throw Error('response lost'); } }]);
  assert.equal((await proposeSelected(request(), { registry })).selection.providerId, 'claude');
  await assert.rejects(proposeSelected(request(), { registry, requested: 'codex' }), /response lost/);
  assert.equal(calls, 1);
  assert.throws(() => createRegistry([fake('claude'), fake('claude')]), /duplicate/);
});

test('native process timeout/cancellation are failures with no credentials or shell wrapper escape', async () => {
  const timeout = await command(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 50 });
  assert.equal(timeout.interrupted, true);
  const cancel = await command(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 5000, cancelled: () => true });
  assert.equal(cancel.interrupted, true);
  assert.equal(normalize(identity('claude'), cancel, { ...request(), cancelled: () => true }, parseClaude).error.code, 'CANCELLED');
  assert.throws(() => command('codex.cmd', ['exec', '-']), /native executable/);
});

test('provider failures persist raw/schema/process records without altering SQLite v1 or claiming success', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cf-provider-store-'));
  const store = new Store(directory); const req = request();
  const run = store.create({ id: 'test-provider', repo: directory, base: 'a'.repeat(40), contract: req.contract, contractHash: hash(req.contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0 });
  const invalid = JSON.stringify({ structured_output: { summary: 'invalid', edits: [] }, total_cost_usd: 0.25 });
  const adapter = createClaudeAdapter({ runCommand: async () => result(invalid) });
  try {
    const outcome = await execute(store, run.id, {
      ready: async () => {}, snapshot: async (_repo, _base, dir) => { await mkdir(path.join(dir, 'src')); await writeFile(path.join(dir, 'src/math.js'), 'a + b'); return ['src/math.js']; },
      context: async () => req.files,
      verify: async () => ({ authority: 'HARNESS_EXECUTED', exitCode: 1, tests: 1, passed: 0, failed: 1, testNames: ['subtract'], interrupted: false, truncated: false }),
      propose: async r => requireProposal(await adapter.execute(r))
    });
    assert.equal(outcome.state, 'WAITING_HUMAN'); assert.equal(outcome.acceptedHash, undefined);
    assert.equal(outcome.reportedCostUsd, 0.25); assert.equal(outcome.unknownCostAttempts, 0);
    const record = store.readArtifact(outcome.lastProviderResultHash);
    assert.equal(record.raw.stdout, invalid); assert.equal(record.schemaValidation.status, 'INVALID');
    assert.equal(record.execution.exitCode, 0); assert.equal(record.error.code, 'INVALID_PROPOSAL');
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
    assert.deepEqual(validateContract(req.contract), req.contract);
    assert.equal(store.readArtifact(store.artifact({ proposal: proposal(), cost: null })).cost, null);
  } finally { store.close(); }
});

test('normalized proposal completes only after harness evidence and completed runs do not relaunch', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cf-provider-success-'));
  const store = new Store(directory); const req = request(); let launches = 0; let verifications = 0;
  store.create({ id: 'success-provider', repo: directory, base: 'a'.repeat(40), contract: req.contract, contractHash: hash(req.contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0 });
  const adapter = createClaudeAdapter({ runCommand: async () => { launches++; return result(envelope()); } });
  const services = {
    ready: async () => {}, snapshot: async (_repo, _base, dir) => { await mkdir(path.join(dir, 'src')); await writeFile(path.join(dir, 'src/math.js'), 'a + b'); return ['src/math.js']; },
    context: async () => req.files,
    candidateHash: async dir => hash(await readFile(path.join(dir, 'src/math.js'), 'utf8')),
    verify: async () => { const passed = verifications++ > 0; return { authority: 'HARNESS_EXECUTED', exitCode: passed ? 0 : 1, tests: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0, todo: 0, testNames: ['subtract'], interrupted: false, truncated: false }; },
    propose: async r => requireProposal(await adapter.execute(r))
  };
  try {
    const outcome = await execute(store, 'success-provider', services);
    assert.equal(outcome.state, 'COMPLETED'); assert.equal(verifications, 2);
    assert.equal(store.readArtifact(outcome.lastProviderResultHash).authority, 'PROVIDER_REPORTED_ONLY');
    assert.equal(store.readArtifact(outcome.evidenceHash).authority, 'HARNESS_EXECUTED');
    assert.equal(store.readArtifact(outcome.acceptedHash).changedFiles['src/math.js'], 'a - b');
    assert.equal((await execute(store, outcome.id, services)).state, 'COMPLETED');
    assert.equal(launches, 1); assert.equal(verifications, 2);
  } finally { store.close(); }
});
