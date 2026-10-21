import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { hash, validateContract } from '../src/alpha/contract.mjs';
import { discover } from '../src/intent/discovery.mjs';
import { validateDraft, compile } from '../src/intent/contract.mjs';
import { planIntent, authorize, pin } from '../src/intent/engine.mjs';
import { createRegistry } from '../src/providers/registry.mjs';
import { CAPABILITIES } from '../src/providers/capabilities.mjs';
import { resultRecord } from '../src/providers/interface.mjs';
import { createCodexAdapter } from '../src/providers/codex.mjs';

async function fixture() {
  const repo = await mkdtemp(path.join(tmpdir(), 'cf-intent-'));
  await mkdir(path.join(repo, 'src')); await mkdir(path.join(repo, 'test'));
  await writeFile(path.join(repo, 'src/math.js'), 'export const subtract=(a,b)=>a+b;');
  await writeFile(path.join(repo, 'test/math.test.js'), 'import test from "node:test"; test("subtract",()=>{});');
  requireSuccess(await git(repo, ['init']), 'fixture init');
  requireSuccess(await git(repo, ['add', '.']), 'fixture index');
  requireSuccess(await git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'synthetic test baseline']), 'fixture commit');
  return repo;
}
const objective = 'Fix subtraction in src/math.js using test/math.test.js';
async function draftFor(repo) {
  return { schemaVersion: 2, objective, base: (await discover(repo, objective)).base, files: ['src/math.js'], tests: ['test/math.test.js'], criteria: [{ description: 'Subtraction regression passes', method: 'protected-tests', tests: ['test/math.test.js'] }], risks: [], unknowns: [], effects: ['local-edit'] };
}
async function validPlan(repo) { return planIntent(repo, objective, { draftInput: JSON.stringify(await draftFor(repo)) }); }
const fake = (body, patch = {}) => ({ id: 'fake', tasks: ['intent-planning'], probe: async () => ({ identity: { id: 'fake', version: 'fixture' }, installed: true, environment: Object.fromEntries(['filesystem_restriction', 'network_restriction', 'credential_isolation'].map(c => [c, { status: 'SUPPORTED', evidence: 'Fake host fixture only' }])), capabilities: Object.fromEntries(CAPABILITIES.map(c => [c, { status: 'SUPPORTED' }])) }), execute: async () => ({ ...resultRecord({ id: 'fake' }, { stdout: Buffer.from(body), stderr: Buffer.alloc(0), exitCode: 0, interrupted: false, truncated: false }), status: 'PROPOSED', ...patch }) });

test('natural-language planning preserves original intent and requires test coverage confirmation', async () => {
  const repo = await fixture(); const before = await readFile(path.join(repo, 'src/math.js'));
  const result = await planIntent(repo, objective);
  assert.equal(result.intent.original, objective); assert.equal(result.executable, false);
  assert.equal(result.validation.status, 'NEEDS_INPUT');
  assert.deepEqual(result.draft.files, ['src/math.js']); assert.deepEqual(result.draft.tests, ['test/math.test.js']);
  assert.deepEqual(result.stages, ['INTENT_RECEIVED', 'DISCOVERED', 'DRAFTED']);
  assert.deepEqual(await readFile(path.join(repo, 'src/math.js')), before);
  assert.equal(result.discovery.contentRead, false);
  assert.equal((await planIntent(repo, '고쳐줘')).validation.status, 'NEEDS_INPUT');
});
test('validated draft compiles to unchanged V1 but does not authorize itself', async () => {
  const repo = await fixture(), plan = await validPlan(repo), contract = compile(plan);
  assert.equal(plan.validation.status, 'VALIDATED'); assert.equal(plan.executable, false);
  assert.deepEqual(validateContract(contract.alpha), contract.alpha);
  await assert.rejects(pin(plan, { stage: 'AUTHORIZED' }, repo), /Approval/);
  assert.equal(plan.stages.at(-1), 'VALIDATED');
});
test('hash-bound human grant pins once, without starting execution', async () => {
  const repo = await fixture(), plan = await validPlan(repo);
  const token = authorize(plan, { actor: 'reviewer', contractHash: hash(compile(plan)), expiresAt: Date.now() + 60000 });
  const pinned = await pin(plan, token, repo);
  assert.equal(token.stage, 'AUTHORIZED'); assert.equal(pinned.stage, 'PINNED'); assert.equal(pinned.executionStarted, false);
  await assert.rejects(pin(plan, token, repo), /Approval/);
  await assert.rejects(pin(plan, JSON.parse(JSON.stringify(token)), repo), /Approval/);
});
test('contract changes, expiry, invalid actor and mismatched digest invalidate approval', async () => {
  const repo = await fixture(), plan = await validPlan(repo);
  const decision = { actor: 'reviewer', contractHash: hash(compile(plan)), expiresAt: Date.now() + 60000 };
  assert.throws(() => authorize(plan, { ...decision, actor: '' }), /human review/);
  assert.throws(() => authorize(plan, { ...decision, contractHash: 'forged' }), /human review/);
  const token = authorize(plan, decision);
  await assert.rejects(pin(plan, token, repo, { now: decision.expiresAt + 1 }), /Approval/);
  plan.draft.criteria[0].description = 'Different requirement';
  await assert.rejects(pin(plan, token, repo), /Approval/);
});
test('dirty workspace and forged discovery never cross pin boundary', async () => {
  const repo = await fixture(), plan = await validPlan(repo);
  const forged = structuredClone(plan); forged.discovery.scanned++;
  const forgedToken = authorize(forged, { actor: 'human', contractHash: hash(compile(forged)), expiresAt: Date.now() + 60000 });
  await assert.rejects(pin(forged, forgedToken, repo), /Repository/);
  const token = authorize(plan, { actor: 'human', contractHash: hash(compile(plan)), expiresAt: Date.now() + 60000 });
  await writeFile(path.join(repo, 'src/math.js'), 'changed');
  await assert.rejects(pin(plan, token, repo), /Repository/);
  assert.equal((await validPlan(repo)).validation.status, 'NEEDS_INPUT');
});

test('parallel pin attempts consume a grant at most once and other repositories are refused', async () => {
  const repo = await fixture(), other = await fixture(), plan = await validPlan(repo);
  const token = authorize(plan, { actor: 'human', contractHash: hash(compile(plan)), expiresAt: Date.now() + 60000 });
  await assert.rejects(pin(plan, token, other), /Repository/);
  const results = await Promise.allSettled([pin(plan, token, repo), pin(plan, token, repo)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('discovery refuses symlink entries without reading their target and ignores regular dot metadata', async () => {
  const repo = await fixture();
  await writeFile(path.join(repo, '.gitignore'), 'ignored');
  requireSuccess(await git(repo, ['add', '.gitignore']), 'fixture index');
  const oid = requireSuccess(await git(repo, ['hash-object', '-w', '--stdin'], { input: '../private-target' }), 'link object');
  requireSuccess(await git(repo, ['update-index', '--add', '--cacheinfo', '120000', oid, 'src/link.js']), 'fixture link');
  requireSuccess(await git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'link fixture']), 'fixture commit');
  const result = await discover(repo, objective);
  assert.equal(result.excluded.length, 1); assert.equal(result.contentRead, false);
  assert.ok(!result.files.some(f => f.path === 'src/link.js'));
});
test('scope escapes, new files and protected-test edits cannot compile', async () => {
  const repo = await fixture(), discovery = await discover(repo, objective), draft = await draftFor(repo);
  for (const f of ['../secret', '/outside', '.env']) assert.throws(() => validateDraft({ ...draft, files: [f] }, discovery), /Unsafe/);
  for (const f of ['src/new.js', 'test/math.test.js']) assert.equal(validateDraft({ ...draft, files: [f] }, discovery).status, 'CAPABILITY_GAP');
  assert.throws(() => validateDraft({ ...draft, tests: ['test/other.test.js'] }, discovery), /Undiscovered/);
});
test('missing acceptance methods and risky effects never silently become executable', async () => {
  const repo = await fixture(), discovery = await discover(repo, objective), draft = await draftFor(repo);
  for (const method of ['human-review', 'shell', '']) assert.equal(validateDraft({ ...draft, criteria: [{ ...draft.criteria[0], method }] }, discovery).status, 'NEEDS_INPUT');
  assert.equal(validateDraft({ ...draft, criteria: [] }, discovery).status, 'NEEDS_INPUT');
  assert.equal(validateDraft({ ...draft, effects: ['deploy'] }, discovery).status, 'CAPABILITY_GAP');
  assert.equal(validateDraft({ ...draft, risks: ['DB mutation'] }, discovery).status, 'NEEDS_INPUT');
  assert.ok((await planIntent(repo, '운영 DB 삭제와 배포를 해줘')).draft.risks.length);
  assert.equal(validateDraft({ ...draft, objective: 'deploy the production database', risks: [] }, discovery).status, 'NEEDS_INPUT');
  assert.throws(() => validateDraft(draft, discovery, 'deploy the production database'), /original objective/);
});
test('planner uses G2 envelope but provider schema/status claims never grant authority', async () => {
  const repo = await fixture(), draft = await draftFor(repo);
  const good = await planIntent(repo, objective, { registry: createRegistry([fake(JSON.stringify(draft))]) });
  assert.equal(good.validation.status, 'VALIDATED'); assert.equal(good.executable, false);
  for (const body of ['bad-json', JSON.stringify({ ...draft, authorized: true }), JSON.stringify({ ...draft, base: 'wrong' }), '{}']) {
    const result = await planIntent(repo, objective, { registry: createRegistry([fake(body)]) });
    assert.equal(result.status, 'BLOCKED'); assert.equal(result.executable, false);
  }
});
test('provider outage, nonzero, interruption and truncation stop planning safely', async () => {
  const repo = await fixture(), draft = await draftFor(repo);
  for (const execution of [{ exitCode: 1 }, { exitCode: 0, interrupted: true }, { exitCode: 0, truncated: true }, { exitCode: 0, error: 'lost process' }]) {
    assert.equal((await planIntent(repo, objective, { registry: createRegistry([fake(JSON.stringify(draft), { execution })]) })).status, 'BLOCKED');
  }
  const adapter = fake('{}'); adapter.execute = async () => { throw Error('offline'); };
  assert.equal((await planIntent(repo, objective, { registry: createRegistry([adapter]) })).status, 'BLOCKED');
});
test('Codex stays capability-blocked and existing edit adapters cannot plan', async () => {
  const repo = await fixture(); let launches = 0;
  const codex = createCodexAdapter({ runCommand: async () => { launches++; return { exitCode: 0, stdout: Buffer.from('help'), stderr: Buffer.alloc(0) }; } });
  const result = await planIntent(repo, objective, { registry: createRegistry([codex]), requested: 'codex' });
  assert.equal(result.status, 'BLOCKED'); assert.match(result.error, /CAPABILITY_UNAVAILABLE/); assert.equal(launches, 2);
  const adapter = fake('{}'); delete adapter.tasks;
  assert.match((await planIntent(repo, objective, { registry: createRegistry([adapter]) })).error, /intent-planning/);
});
test('CLI plans in non-TTY JSON without opening state or executing a provider', async () => {
  const repo = await fixture(), state = path.join(repo, 'not-created');
  const cli = path.resolve('src/alpha/cli.mjs');
  const r = await command(process.execPath, [cli, 'plan', objective, repo, '--state', state]);
  assert.equal(r.exitCode, 2); assert.equal(JSON.parse(r.stdout).validation.status, 'NEEDS_INPUT');
  await assert.rejects(readFile(path.join(state, 'state.sqlite')));
  const bad = await command(process.execPath, [cli, 'plan']);
  assert.equal(bad.exitCode, 1); assert.equal(JSON.parse(bad.stdout).status, 'BLOCKED');
});
test('CLI validates supplied drafts but never auto-authorizes or executes', async () => {
  const repo = await fixture(), file = path.join(await mkdtemp(path.join(tmpdir(), 'cf-draft-')), 'draft.json');
  await writeFile(file, JSON.stringify(await draftFor(repo)));
  const r = await command(process.execPath, [path.resolve('src/alpha/cli.mjs'), 'plan', objective, repo, '--draft', file]);
  assert.equal(r.exitCode, 0); const output = JSON.parse(r.stdout);
  assert.equal(output.validation.status, 'VALIDATED'); assert.equal(output.executable, false);
});
