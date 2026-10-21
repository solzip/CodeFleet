import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/alpha/store.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { createPlanning, submitPlanning, cancelPlanning, planningSkill, requirePlanningLive } from '../src/hosts/planning.mjs';
import { installHost, manageHost } from '../src/hosts/install.mjs';

const objective = 'Fix subtraction using protected tests';
const files = { 'src/math.js': { text: 'export const subtract=(a,b)=>a+b;', kind: 'source' },
  'test/math.test.js': { text: 'assert.equal(subtract(5,2),3);', kind: 'test' } };
const context = { discovery: { base: 'a'.repeat(40), dirty: false, excluded: [],
  files: Object.entries(files).map(([path, f]) => ({ path, kind: f.kind })) }, files, truncated: false };
function proposal(request) {
  return { sessionId: request.sessionId, requestHash: request.requestHash, proposal: {
    draft: { schemaVersion: 2, objective, base: context.discovery.base, files: ['src/math.js'],
      tests: ['test/math.test.js'], criteria: [{ description: 'Protected subtraction tests pass', method: 'protected-tests', tests: ['test/math.test.js'] }],
      risks: [], unknowns: [], effects: ['local-edit'] },
    references: Object.entries(files).map(([path, f]) => ({ path, line: 1, quote: f.text })),
    inferences: ['Addition appears inconsistent with subtraction intent'],
  } };
}
const current = r => ({ contextHash: r.contextHash, skillHash: r.skillHash, profileHash: r.profileHash });
async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), 'cf-h6-'));
  const store = new Store(directory);
  const request = createPlanning(store, context, objective, { host: 'codex', version: 'fake', now: 1000 });
  return { directory, store, request };
}
for (const host of ['codex', 'claude']) test(`H6 ${host}: planning Skill lifecycle and immutable receipt`, async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'cf-h6-skill-'));
  const result = await installHost(repo, host, { planning: true });
  assert.equal(result.invocation, (host === 'codex' ? '$' : '/') + 'codefleet-plan');
  const skill = path.join(repo, host === 'codex' ? '.agents' : '.claude', 'skills/codefleet-plan/SKILL.md');
  assert.equal(await readFile(skill, 'utf8'), planningSkill(host));
  for (const action of ['status', 'disable', 'enable', 'remove']) await manageHost(repo, host, action, { planning: true });
  await assert.rejects(readFile(skill));
});
test('H6 Fake Host draft uses G3 and G4 without authorization or execution; durable duplicate', async () => {
  const s = await setup();
  try {
    const raw = JSON.stringify(proposal(s.request));
    const result = submitPlanning(s.store, raw, current(s.request), { now: 2000 });
    assert.equal(result.status, 'VALIDATED'); assert.ok(result.workflowPreview.workflow.workflowHash);
    assert.equal(result.executable, false); assert.equal(result.complete, false); assert.equal(result.approved, false);
    assert.equal(result.authority, 'PROVIDER_REPORTED_ONLY');
    assert.equal(s.store.db.prepare('SELECT count(*) AS n FROM runs').get().n, 0);
    s.store.close(); s.store = new Store(s.directory);
    assert.equal(submitPlanning(s.store, raw, current(s.request), { now: 2000 }).replay, true);
    const conflict = proposal(s.request); conflict.proposal.inferences.push('changed');
    assert.throws(() => submitPlanning(s.store, JSON.stringify(conflict), current(s.request), { now: 2000 }), /duplicate/);
  } finally { s.store.close(); }
});
test('H6 missing code references, forged quotes, unverifiable criteria and claimed approval', async () => {
  const s = await setup();
  try {
    for (const mutate of [
      p => { p.proposal.references = []; }, p => { p.proposal.references[0].quote = 'invented'; },
      p => { p.approved = true; }, p => { p.proposal.draft.base = 'b'.repeat(40); },
    ]) {
      const p = proposal(s.request); mutate(p);
      assert.throws(() => submitPlanning(s.store, JSON.stringify(p), current(s.request), { now: 2000 }));
    }
    const p = proposal(s.request); p.proposal.draft.criteria[0].method = 'AI says good';
    const r = submitPlanning(s.store, JSON.stringify(p), current(s.request), { now: 2000 });
    assert.equal(r.status, 'NEEDS_INPUT'); assert.equal(r.workflowPreview, null);
  } finally { s.store.close(); }
});
test('H6 unsupported effects cannot enter DAG or execution', async () => {
  const s = await setup();
  try {
    const p = proposal(s.request); p.proposal.draft.effects.push('remote-write');
    const r = submitPlanning(s.store, JSON.stringify(p), current(s.request), { now: 2000 });
    assert.equal(r.status, 'CAPABILITY_GAP'); assert.equal(r.workflowPreview, null);
    assert.throws(() => requirePlanningLive(), /BLOCKED/);
  } finally { s.store.close(); }
});
test('H6 session, profile, Skill, context, expiry and cancellation fences', async () => {
  const s = await setup();
  try {
    const raw = JSON.stringify(proposal(s.request));
    for (const key of ['skillHash', 'profileHash', 'contextHash']) assert.throws(() =>
      submitPlanning(s.store, raw, { ...current(s.request), [key]: hash('changed') }, { now: 2000 }), /binding/);
    const wrong = proposal(s.request); wrong.sessionId = 'other';
    assert.throws(() => submitPlanning(s.store, JSON.stringify(wrong), current(s.request), { now: 2000 }), /Unknown/);
    assert.throws(() => submitPlanning(s.store, raw, current(s.request), { now: 31000 }), /binding/);
    cancelPlanning(s.store, s.request.sessionId);
    assert.throws(() => submitPlanning(s.store, raw, current(s.request), { now: 2000 }), /binding/);
    assert.throws(() => submitPlanning(s.store, ' '.repeat(65537), current(s.request)), /Bounded/);
  } finally { s.store.close(); }
});
test('H6 Linux UID/chroot/seccomp: real prohibited access and child escape attempts', async () => {
  assert.equal(process.env.CODEFLEET_TEST_DOCKER, '1');
  const image = process.env.CODEFLEET_OPERATOR_IMAGE;
  assert.match(image ?? '', /^sha256:[a-f0-9]{64}$/);
  const r = spawnSync('docker', ['run', '--rm', '--pull=never', '--network=none', '--read-only',
    '--cap-drop=ALL', '--cap-add=SYS_CHROOT', '--cap-add=SETUID', '--cap-add=SETGID', '--cap-add=KILL',
    '--security-opt=no-new-privileges', '--pids-limit=32', '--memory=256m', '--cpus=1',
    '--tmpfs', '/h6:rw,noexec,nosuid,size=8m,mode=0755',
    '--mount', `type=bind,source=${process.cwd()},target=/input,readonly`,
    image, 'python3', '-B', '/input/test/fixtures/planning-isolation-probe.py'],
  { encoding: 'utf8', timeout: 30000, windowsHide: true, maxBuffer: 65536 });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const e = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(e.status, 'OFFLINE_VERIFIED');
  assert.equal(e.uid, 61001, 'Dedicated non-root test identity, not the runner/IPC UID');
  assert.deepEqual(e.nproc, [8, 8], 'Production process ceiling is unchanged');
  assert.equal(e.resourceChecks.pressureProcesses, 8);
  assert.equal(e.resourceChecks.pressureChildrenReaped, true);
  for (const observation of [e.resourceObservation, e.resourceChecks.collision, e.resourceChecks.bounded, e.resourceChecks.recovered]) {
    assert.deepEqual(observation.nproc, [8, 8]);
    assert.equal(observation.Seccomp, '2'); assert.equal(observation.NoNewPrivs, '1');
    assert.equal(Number(observation['pids.max']), 32);
    assert.ok(Number(observation['pids.current']) < 32, 'UID exhaustion must not be cgroup exhaustion');
  }
  assert.ok(e.resourceChecks.collision.visibleUidTasks >= 9);
  assert.ok(e.resourceChecks.bounded.visibleUidTasks >= 9);
  assert.equal(e.resourceChecks.recovered.visibleUidTasks, 1);
  assert.deepEqual(e.checks, ['read', 'search', 'outside-read', 'credentials', 'ledger',
    'source-mount', 'fixture-write', 'tool-command', 'symlink', 'traversal', 'replace-path',
    'internet-socket', 'operator-ipc', 'docker-socket', 'operator-socket-path',
    'same-uid-provisioning', 'mount', 'execve', 'execveat', 'namespace', 'regain-root', 'signal-supervisor',
    'descendant-inherits', 'fake-pipe-transport-no-tool-network', 'request-byte-limit',
    'request-count-limit', 'output-byte-limit', 'timeout-no-residual-process']);
  assert.equal(e.modelCalls, 0); assert.equal(e.fileChanges, false); assert.equal(e.residualProcesses, false);
  const s = await setup();
  try {
    // Actual confined reads supply the Fake Host's references, then the existing validator.
    const actual = structuredClone(context);
    for (const [p, text] of Object.entries(e.observed)) actual.files[p].text = text;
    const req = createPlanning(s.store, actual, objective, { host: 'codex', version: 'fake-linux', now: 1000 });
    const p = proposal(req);
    p.proposal.references = Object.entries(e.observed).map(([path, text]) => ({ path, line: 1, quote: text.trimEnd() }));
    const result = submitPlanning(s.store, JSON.stringify(p), current(req), { now: 2000 });
    assert.equal(result.status, 'VALIDATED'); assert.equal(result.executable, false);
  } finally { s.store.close(); }
  console.log('H6 isolation observations: ' + JSON.stringify(e));
});
