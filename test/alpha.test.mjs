import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateContract, applyEdits, judge, hash } from '../src/alpha/contract.mjs';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { command, environment } from '../src/alpha/process.mjs';
import { verificationResult, dockerArgs, matchTestIdentity } from '../src/alpha/verifier.mjs';
import { deliver } from '../src/alpha/delivery.mjs';
import { providerArgs } from '../src/alpha/provider.mjs';
import { judge as pureJudge, isFailingBaseline } from '../src/alpha/judge.mjs';
import { verify, dockerReady } from '../src/alpha/verifier.mjs';
import { context, candidateHash } from '../src/alpha/workspace.mjs';

const input = () => ({ schemaVersion: 1, goal: 'Return the correct value for subtraction.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 2, timeoutSeconds: 60, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
const proposal = (value = 'a - b') => ({ summary: 'Correct subtraction', edits: [{ path: 'src/math.js', oldText: 'a + b', newText: value }] });
const pass = () => ({ authority: 'HARNESS_EXECUTED', exitCode: 0, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, testNames: ['0:subtract'], testIdentityMatch: true, interrupted: false, truncated: false, integrity: true });
const fail = () => ({ ...pass(), exitCode: 1, passed: 0, failed: 1 });

test('alpha contracts reject scope escalation, test edits, ambiguous paths and unknown grants', () => {
  assert.deepEqual(validateContract(input()), input());
  for (const file of ['../src/math.js', 'src/../math.js', 'src/.env', 'test/math.test.js', 'src/math.test.js', 'src/NUL.js', 'src/COM1/file.js', 'src/folder./file.js', 'src/a.js:secret']) {
    const c = input(); c.files = [file]; c.context = [file]; assert.throws(() => validateContract(c));
  }
  assert.throws(() => validateContract({ ...input(), allowShell: true }));
  const c = input(); c.maxAttempts = 0; assert.throws(() => validateContract(c));
});

test('alpha applies only unique exact edits in delegated files without replacement expansion', () => {
  const original = { 'src/math.js': 'export const sub = (a,b) => a + b;' };
  assert.equal(applyEdits(input(), original, proposal())['src/math.js'], 'export const sub = (a,b) => a - b;');
  assert.throws(() => applyEdits(input(), original, { summary: 'bad', edits: [{ path: 'test/math.test.js', oldText: 'a', newText: 'b' }] }));
  assert.throws(() => applyEdits(input(), { 'src/math.js': 'a + b a + b' }, proposal()));
  assert.equal(applyEdits(input(), original, proposal('$&'))['src/math.js'], 'export const sub = (a,b) => $&;');
  assert.equal(original['src/math.js'], 'export const sub = (a,b) => a + b;');
});

test('alpha never accepts zero, skipped, missing, truncated or nonzero-exit verification', () => {
  assert.equal(judge(pass()).outcome, 'ACCEPT');
  for (const patch of [{ tests: 0 }, { tests: null }, { passed: 0 }, { failed: 1 }, { skipped: 1 }, { todo: 1 }, { integrity: false }, { truncated: true }, { interrupted: true }, { exitCode: 1 }]) assert.notEqual(judge({ ...pass(), ...patch }).outcome, 'ACCEPT');
  const r = verificationResult({ exitCode: 0, stdout: Buffer.from('TAP version 13\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n'), stderr: Buffer.alloc(0), interrupted: false, truncated: false });
  assert.equal(judge({ ...r, integrity: true }).outcome, 'ESCALATE');
  const empty = verificationResult({ exitCode: 0, stdout: Buffer.from('version 24'), stderr: Buffer.alloc(0), interrupted: false, truncated: false });
  assert.notEqual(judge({ ...empty, integrity: true }).outcome, 'ACCEPT');
});

test('alpha judgment rejects absent and provider-only authority even with passing counts', () => {
  assert.equal(judge, pureJudge, 'v1 compatibility export must use the same verdict function');
  for (const authority of [undefined, null, 'PROVIDER_REPORTED_ONLY', 'NONE', 'HARNESS_OBSERVED', 'WAIVED_BY_POLICY']) {
    assert.equal(judge({ ...pass(), authority }).outcome, 'ESCALATE', String(authority));
  }
  for (const evidence of [null, undefined, {}]) assert.equal(judge(evidence).outcome, 'ESCALATE');
  const evidence = Object.freeze(pass());
  assert.deepEqual(judge(evidence), judge(evidence));
  assert.equal(judge(evidence).outcome, 'ACCEPT');
});

test('alpha baseline predicate preserves executed regression requirements without mutation', () => {
  assert.equal(isFailingBaseline(Object.freeze(fail())), true);
  for (const patch of [{ authority: undefined }, { authority: 'PROVIDER_REPORTED_ONLY' }, { exitCode: 0 }, { tests: 0 }, { failed: 0 }, { interrupted: true }, { truncated: true }]) {
    assert.equal(isFailingBaseline({ ...fail(), ...patch }), false);
  }
  assert.equal(isFailingBaseline(null), false);
});

for (const adapter of ['node', 'java-maven']) {
  test(`alpha ${adapter} v1 contract completes with real isolated verification and a fixed proposal`, {
    skip: adapter === 'node' ? !process.env.CODEFLEET_TEST_DOCKER : !process.env.CODEFLEET_TEST_MAVEN_IMAGE
  }, async () => {
    const java = adapter === 'java-maven';
    const source = java ? 'src/main/java/example/Page.java' : 'src/math.js';
    const testFile = java ? 'src/test/java/example/PageTest.java' : 'test/math.test.js';
    const files = java ? Object.fromEntries(await Promise.all([source, testFile, 'pom.xml'].map(async name => [name, await readFile(new URL(`../examples/java-maven/${name}`, import.meta.url), 'utf8')]))) : {
      [source]: 'export const sub = (a,b) => a + b;',
      [testFile]: "import test from 'node:test'; import assert from 'node:assert/strict'; import { sub } from '../src/math.js'; test('subtract', () => assert.equal(sub(3,2),1));"
    };
    const contract = validateContract({ ...input(), files: [source], context: [source], tests: [testFile], timeoutSeconds: 300,
      ...(java ? { verification: { kind: adapter, image: process.env.CODEFLEET_TEST_MAVEN_IMAGE } } : {}) });
    const f = await setup(contract); let calls = 0;
    // Only source acquisition and the provider are fixtures. All candidate IO,
    // Docker verification, evidence binding, Store and verdicts are real.
    const services = {
      snapshot: async (_repo, _base, directory) => {
        for (const [name, body] of Object.entries(files)) {
          await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
          await writeFile(path.join(directory, name), body);
        }
        return Object.keys(files);
      }, context, candidateHash, verify, ready: dockerReady,
      propose: async () => { calls++; return { cost: null, proposal: { summary: 'Fixed regression fixture', edits: [{ path: source,
        oldText: java ? '(long) (page + 1)' : 'a + b', newText: java ? '((long) page + 1)' : 'a - b' }] } }; }
    };
    try {
      const result = await execute(f.store, f.run.id, services);
      assert.equal(result.state, 'COMPLETED', result.reason);
      const baseline = f.store.readArtifact(result.baselineHash);
      const evidence = f.store.readArtifact(result.evidenceHash);
      assert.equal(baseline.authority, 'HARNESS_EXECUTED');
      assert.ok(baseline.failed > 0);
      assert.equal(evidence.authority, 'HARNESS_EXECUTED');
      assert.equal(evidence.tests, java ? 2 : 1);
      assert.equal(evidence.passed, evidence.tests);
      assert.equal(evidence.integrity, true); assert.equal(evidence.testIdentityMatch, true);
      assert.equal(evidence.contractHash, hash(contract));
      assert.equal(f.store.readArtifact(result.decisionHash).outcome, 'ACCEPT');
      assert.deepEqual(Object.keys(f.store.readArtifact(result.acceptedHash).changedFiles), [source]);
      assert.equal(await readFile(path.join(result.candidateDirectory, testFile), 'utf8'), files[testFile]);
      assert.equal((await execute(f.store, result.id, services)).state, 'COMPLETED');
      assert.equal(calls, 1); assert.equal(result.unknownCostAttempts, 1);
    } finally { f.store.close(); }
  });
}

test('alpha refuses an unobserved baseline before spending a provider attempt', async () => {
  for (const authority of [undefined, 'PROVIDER_REPORTED_ONLY']) {
    const f = await setup();
    f.services.verify = async () => ({ ...fail(), authority });
    try {
      const result = await execute(f.store, f.run.id, f.services);
      assert.equal(result.state, 'WAITING_HUMAN');
      assert.equal(result.attempts, 0);
      assert.equal(f.counts().proposals, 0);
      assert.equal(result.acceptedHash, undefined);
    } finally { f.store.close(); }
  }
});

test('alpha does not complete or deliver on provider-only candidate evidence', async () => {
  const f = await setup({ ...input(), delivery: { mode: 'pull-request', repository: 'owner/repo', base: 'main' } });
  let checks = 0, deliveries = 0;
  f.services.verify = async () => ++checks === 1 ? fail() : { ...pass(), authority: 'PROVIDER_REPORTED_ONLY' };
  f.services.deliver = async () => { deliveries++; return {}; };
  try {
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'WAITING_HUMAN');
    assert.equal(f.store.readArtifact(result.decisionHash).outcome, 'ESCALATE');
    assert.equal(deliveries, 0);
    assert.equal(result.acceptedHash, undefined);
  } finally { f.store.close(); }
});

test('alpha provider success claims cannot replace failed Harness verification', async () => {
  const f = await setup({ ...input(), maxAttempts: 1 });
  f.services.propose = async () => ({ proposal: proposal(), cost: 0, evidence: pass(), state: 'COMPLETED', outcome: 'ACCEPT' });
  f.services.verify = async () => fail();
  try {
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'WAITING_HUMAN');
    assert.equal(result.acceptedHash, undefined);
    assert.equal(f.store.readArtifact(result.decisionHash).outcome, 'RETRY');
  } finally { f.store.close(); }
});

test('alpha malformed provider output and verification loss never produce accepted artifacts', async () => {
  for (const failure of ['provider-error', 'malformed-proposal', 'verification-error', 'tree-changed']) {
    const f = await setup(); let checks = 0, hashes = 0;
    if (failure === 'provider-error') f.services.propose = async () => { throw Error('provider failed'); };
    if (failure === 'malformed-proposal') f.services.propose = async () => ({ proposal: { summary: 'PASS', edits: [] }, cost: 0.2 });
    if (failure === 'verification-error') f.services.verify = async () => { if (++checks === 1) return fail(); throw Error('verification unavailable'); };
    if (failure === 'tree-changed') f.services.candidateHash = async () => String(++hashes);
    try {
      const result = await execute(f.store, f.run.id, f.services);
      assert.equal(result.state, 'WAITING_HUMAN', failure);
      assert.equal(result.acceptedHash, undefined, failure);
      assert.equal(result.evidenceHash, undefined, failure);
      assert.equal(f.store.db.prepare('SELECT owner FROM runs WHERE id=?').get(result.id).owner, null);
      assert.equal(result.unknownCostAttempts, failure === 'provider-error' ? 1 : 0);
    } finally { f.store.close(); }
  }
});

test('alpha stale worker cannot save, heartbeat or release a replacement lease', async () => {
  const f = await setup();
  try {
    const oldOwner = f.store.claim(f.run.id);
    f.store.db.prepare('UPDATE runs SET leaseUntil=0 WHERE id=?').run(f.run.id);
    const newOwner = f.store.claim(f.run.id);
    const eventCount = f.store.events(f.run.id).length;
    assert.throws(() => f.store.save({ ...f.run, state: 'COMPLETED' }, oldOwner, 'STALE'), /lease lost/);
    assert.equal(f.store.heartbeat(f.run.id, oldOwner), false);
    f.store.release(f.run.id, oldOwner);
    assert.equal(f.store.db.prepare('SELECT owner FROM runs WHERE id=?').get(f.run.id).owner, newOwner);
    assert.equal(f.store.events(f.run.id).length, eventCount);
    assert.equal(f.store.get(f.run.id).state, 'READY');
    f.store.release(f.run.id, newOwner);
  } finally { f.store.close(); }
});

test('alpha reconciliation refuses missing or tampered evidence before delivery', async () => {
  for (const mode of ['missing', 'tampered', 'provider-only']) {
    const f = await pendingDelivery(); let deliveries = 0;
    try {
      const run = f.store.get(f.run.id);
      if (mode === 'tampered') await writeFile(path.join(f.store.directory, 'artifacts', `${run.evidenceHash}.json`), '{}');
      else {
        const owner = f.store.claim(run.id);
        run.evidenceHash = mode === 'missing' ? '0'.repeat(64) : f.store.artifact({ ...f.store.readArtifact(run.evidenceHash), authority: 'PROVIDER_REPORTED_ONLY' });
        f.store.save(run, owner, 'FAULT_INJECTION'); f.store.release(run.id, owner);
      }
      f.services.deliver = async () => { deliveries++; return {}; };
      const result = await execute(f.store, run.id, f.services, { resume: true });
      assert.equal(result.state, 'RECONCILING', mode);
      assert.equal(deliveries, 0, mode);
      assert.equal(f.counts().proposals, 1);
    } finally { f.store.close(); }
  }
});

test('alpha process boundaries limit output and time; provider receives no GitHub token', async () => {
  const output = await command(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { cap: 100 });
  assert.equal(output.truncated, true);
  const started = Date.now();
  const timeout = await command(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeoutMs: 100 });
  assert.equal(timeout.interrupted, true);
  assert.ok(Date.now() - started < 3000, 'timeout must actually stop the process');
  process.env.CODEFLEET_TEST_SECRET = 'not-forwarded';
  try { assert.equal(environment('provider').CODEFLEET_TEST_SECRET, undefined); assert.equal(environment('provider').GH_TOKEN, undefined); }
  finally { delete process.env.CODEFLEET_TEST_SECRET; }
  const argv = providerArgs(1); assert.equal(argv[argv.indexOf('--tools') + 1], ''); assert.ok(argv.includes('--strict-mcp-config'));
  const docker = dockerArgs('/test', ['test/math.test.js'], 'owned');
  for (const flag of ['--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges']) assert.ok(docker.includes(flag));
});

async function setup(contract = input()) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-alpha-test-')); const store = new Store(dir);
  const run = store.create({ id: 'run-test', repo: dir, base: 'a'.repeat(40), contract, contractHash: hash(contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0 });
  let proposals = 0, verifications = 0;
  const services = {
    ready: async () => {},
    cleanupContainer: async () => {},
    snapshot: async (_repo, _base, directory) => { await mkdir(path.join(directory, 'src'), { recursive: true }); await writeFile(path.join(directory, 'src/math.js'), 'a + b'); return ['src/math.js']; },
    context: async () => ({ 'src/math.js': 'a + b', 'test/math.test.js': 'protected' }),
    candidateHash: async directory => hash(await readFile(path.join(directory, 'src/math.js'))),
    propose: async () => { proposals++; return { proposal: proposal(), cost: 0.1 }; },
    verify: async () => { verifications++; return verifications === 1 ? fail() : pass(); }
  };
  return { store, run, services, counts: () => ({ proposals, verifications }) };
}

test('alpha persists verified evidence, completes locally and does not rerun completed work', async () => {
  const f = await setup();
  try {
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'COMPLETED'); assert.equal(result.attempts, 1);
    assert.equal(f.store.readArtifact(result.acceptedHash).changedFiles['src/math.js'], 'a - b');
    await execute(f.store, f.run.id, f.services); assert.deepEqual(f.counts(), { proposals: 1, verifications: 2 });
    assert.ok(f.store.events(f.run.id).some(e => e.type === 'VERIFYING'));
  } finally { f.store.close(); }
});

test('alpha passing baseline cannot be bypassed by resume and never invokes provider', async () => {
  const f = await setup(); f.services.verify = async () => pass();
  try {
    assert.equal((await execute(f.store, f.run.id, f.services)).state, 'WAITING_HUMAN');
    assert.equal((await execute(f.store, f.run.id, f.services)).state, 'WAITING_HUMAN');
    assert.equal(f.counts().proposals, 0);
  } finally { f.store.close(); }
});

test('alpha exhausts attempt budget, rejects no-progress and never widens the contract', async () => {
  const f = await setup(); f.services.verify = async () => fail();
  try {
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'WAITING_HUMAN'); assert.match(result.reason, /Repeated identical/); assert.equal(result.attempts, 2);
    await execute(f.store, f.run.id, f.services); assert.equal(f.counts().proposals, 2);
  } finally { f.store.close(); }
});

test('alpha retries failed verification then succeeds within the same delegated contract', async () => {
  const f = await setup(); let n = 0; let v = 0;
  f.services.propose = async () => ({ proposal: proposal(++n === 1 ? 'a * b' : 'a - b'), cost: null });
  f.services.verify = async () => ++v < 3 ? fail() : pass();
  try {
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'COMPLETED'); assert.equal(result.attempts, 2); assert.equal(result.unknownCostAttempts, 2);
    assert.equal(result.contractHash, f.run.contractHash);
  } finally { f.store.close(); }
});

test('alpha leases reject concurrent workers and artifacts reject tampering', async () => {
  const f = await setup();
  try {
    const owner = f.store.claim(f.run.id); assert.throws(() => f.store.claim(f.run.id), /active worker/);
    assert.throws(() => f.store.save(f.run, 'wrong-owner', 'BAD'), /lease lost/);
    f.store.release(f.run.id, owner);
    const digest = f.store.artifact({ good: true });
    await writeFile(path.join(f.store.directory, 'artifacts', `${digest}.json`), '{"good":false}');
    assert.throws(() => f.store.readArtifact(digest), /hash mismatch/);
  } finally { f.store.close(); }
});

test('alpha refuses missing, renamed, duplicated or file-wrapper test identities', () => {
  const baseline = pass();
  assert.equal(matchTestIdentity(baseline, pass()), true);
  for (const patch of [{ testNames: undefined }, { testNames: [] }, { testNames: ['0:test/math.test.js'] }, { testNames: ['0:subtract', '0:subtract'] }, { tests: 2 }]) {
    const evidence = { ...pass(), ...patch };
    assert.equal(judge({ ...evidence, testIdentityMatch: matchTestIdentity(baseline, evidence) }).outcome, 'ESCALATE');
  }
});

test('alpha reserves unknown cost before provider errors and does not double count on retry', async () => {
  const f = await setup(); let calls = 0;
  f.services.propose = async () => { if (++calls === 1) throw Error('response lost'); return { proposal: proposal(), cost: 0.1 }; };
  try {
    const failed = await execute(f.store, f.run.id, f.services);
    assert.equal(failed.unknownCostAttempts, 1); assert.equal(failed.reportedCostUsd, 0);
    const recovered = await execute(f.store, f.run.id, f.services);
    assert.equal(recovered.state, 'COMPLETED'); assert.equal(recovered.unknownCostAttempts, 1);
    assert.equal(recovered.reportedCostUsd, 0.1); assert.equal(calls, 2);
  } finally { f.store.close(); }
});

test('alpha cancellation after a provider response retains known cost', async () => {
  const f = await setup();
  f.services.propose = async () => { f.store.control(f.run.id, 'cancel'); return { proposal: proposal(), cost: 0.25 }; };
  try {
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'CANCELLED'); assert.equal(result.reportedCostUsd, 0.25);
    assert.equal(result.unknownCostAttempts, 0);
  } finally { f.store.close(); }
});

test('alpha resumes last-attempt verification without another model call after pause', async () => {
  const f = await setup({ ...input(), maxAttempts: 1 }); let verifications = 0;
  f.services.verify = async () => {
    if (++verifications === 1) return fail();
    if (verifications === 2) { f.store.control(f.run.id, 'pause'); return { ...pass(), interrupted: true }; }
    return pass();
  };
  try {
    assert.equal((await execute(f.store, f.run.id, f.services)).state, 'PAUSED');
    const result = await execute(f.store, f.run.id, f.services, { resume: true });
    assert.equal(result.state, 'COMPLETED'); assert.equal(result.attempts, 1);
    assert.equal(f.counts().proposals, 1); assert.equal(verifications, 3);
    assert.equal(result.reportedCostUsd, 0.1);
  } finally { f.store.close(); }
});

test('alpha pause and cancel stop before provider calls', async () => {
  const f = await setup();
  try {
    f.store.control(f.run.id, 'pause'); assert.equal((await execute(f.store, f.run.id, f.services)).state, 'PAUSED');
    f.store.control(f.run.id, 'cancel'); assert.equal((await execute(f.store, f.run.id, f.services)).state, 'CANCELLED');
    assert.equal(f.counts().proposals, 0);
  } finally { f.store.close(); }
});

test('alpha uncertain PR delivery resumes the same intent without another agent call', async () => {
  const c = input(); c.delivery = { mode: 'pull-request', repository: 'owner/repo', base: 'main' };
  const f = await setup(c); let calls = 0;
  f.services.deliver = async () => { if (++calls === 1) throw Error('response lost'); return { url: 'https://github.com/owner/repo/pull/1' }; };
  try {
    assert.equal((await execute(f.store, f.run.id, f.services)).state, 'RECONCILING');
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'COMPLETED'); assert.equal(calls, 2); assert.equal(f.counts().proposals, 1);
  } finally { f.store.close(); }
});

test('alpha delivery refuses base drift before any remote writes', async () => {
  let writes = 0;
  const run = { id: 'r', base: 'old', contract: { delivery: { repository: 'owner/repo', base: 'main' } } };
  await assert.rejects(deliver(run, {}, async (endpoint, method = 'GET') => {
    if (method !== 'GET') writes++;
    if (endpoint.includes('/pulls?')) return [];
    if (endpoint.includes('/heads/codefleet/')) { const e = Error('not found'); e.notFound = true; throw e; }
    return { object: { sha: 'new' } };
  }), /base changed/);
  assert.equal(writes, 0);
});

test('alpha run creation is atomic with its audit event and cancelled delivery makes no request', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-atomic-')); const store = new Store(dir);
  try {
    store.event = () => { throw Error('injected event write failure'); };
    assert.throws(() => store.create({ id: 'never-created', contractHash: 'hash' }), /event write/);
    assert.throws(() => store.get('never-created'), /Unknown run/);
  } finally { store.close(); }
  let requests = 0;
  const run = { id: 'r', contract: { delivery: { repository: 'owner/repo', base: 'main' } } };
  await assert.rejects(deliver(run, {}, async () => { requests++; return {}; }, () => { throw Error('cancelled'); }), /cancelled/);
  assert.equal(requests, 0);
});

test('alpha resumes after worker process death without restoring the reserved attempt budget', async () => {
  const f = await setup();
  try {
    const module = new URL('../src/alpha/store.mjs', import.meta.url).href;
    const child = `import { Store } from ${JSON.stringify(module)}; const s=new Store(${JSON.stringify(f.store.directory)}); const r=s.get('run-test'); const owner=s.claim(r.id); r.state='GENERATING'; r.attempts=1; r.baselineHash=s.artifact(${JSON.stringify(fail())}); s.save(r,owner,'GENERATING'); process.exit(17);`;
    const result = await command(process.execPath, ['--input-type=module', '-e', child]);
    assert.equal(result.exitCode, 17);
    f.services.verify = async () => pass();
    const recovered = await execute(f.store, f.run.id, f.services);
    assert.equal(recovered.state, 'COMPLETED'); assert.equal(recovered.attempts, 2);
    assert.equal(recovered.unknownCostAttempts, 1); assert.equal(f.counts().proposals, 1);
  } finally { f.store.close(); }
});

test('alpha recovers a last-attempt VERIFYING worker death without proposal or cost duplication', async () => {
  const f = await setup({ ...input(), maxAttempts: 1 });
  try {
    const module = new URL('../src/alpha/store.mjs', import.meta.url).href;
    const child = `import { Store } from ${JSON.stringify(module)}; const s=new Store(${JSON.stringify(f.store.directory)}); const r=s.get('run-test'); const owner=s.claim(r.id); r.state='VERIFYING'; r.attempts=1; r.reportedCostUsd=0.1; r.baselineHash=s.artifact(${JSON.stringify(fail())}); r.proposalHash=s.artifact(${JSON.stringify({ proposal: proposal(), cost: 0.1 })}); s.save(r,owner,'VERIFYING'); process.exit(17);`;
    assert.equal((await command(process.execPath, ['--input-type=module', '-e', child])).exitCode, 17);
    f.services.verify = async () => pass();
    const result = await execute(f.store, f.run.id, f.services);
    assert.equal(result.state, 'COMPLETED'); assert.equal(result.attempts, 1);
    assert.equal(result.reportedCostUsd, 0.1); assert.equal(result.unknownCostAttempts, 0);
    assert.equal(f.counts().proposals, 0);
  } finally { f.store.close(); }
});

test('alpha delivery reconciles a lost PR response, checks content, and uses explicit public identity', async () => {
  const run = { id: 'delivery-test', base: 'base', evidenceHash: 'evidence', candidateHash: 'candidate', contract: { goal: 'Fix subtraction', tests: ['test/math.test.js'], delivery: { repository: 'owner/repo', base: 'main', authorName: 'public-handle', authorEmail: 'public@example.invalid' } } };
  const files = { 'src/math.js': 'a - b' };
  let remoteCommit, branch, pr, posts = 0, changed = false, advanced = false, writes = 0;
  const call = async (endpoint, method = 'GET', body) => {
    if (method !== 'GET') writes++;
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: advanced ? 'advanced' : 'base' } };
    if (endpoint.includes('/git/ref/heads/codefleet/')) { if (branch) return { object: { sha: 'new-commit' } }; const e = Error('not found'); e.notFound = true; throw e; }
    if (endpoint.endsWith('/git/commits/base')) return { tree: { sha: 'base-tree' } };
    if (endpoint.endsWith('/git/commits/new-commit')) return remoteCommit;
    if (endpoint.includes('/git/trees/') && method === 'GET') return { truncated: false, tree: [{ path: 'src/math.js', mode: '100644', type: 'blob', sha: 'blob' }] };
    if (endpoint.endsWith('/git/blobs/blob')) return { encoding: 'base64', content: Buffer.from(changed ? 'tampered' : files['src/math.js']).toString('base64') };
    if (endpoint.includes('/compare/')) return { files: [{ filename: 'src/math.js', status: 'modified' }] };
    if (endpoint.endsWith('/git/blobs') && method === 'POST') return { sha: 'blob' };
    if (endpoint.endsWith('/git/trees') && method === 'POST') return { sha: 'candidate-tree' };
    if (endpoint.endsWith('/git/commits') && method === 'POST') {
      assert.deepEqual(body.author, { name: 'public-handle', email: 'public@example.invalid' });
      assert.deepEqual(body.committer, body.author);
      remoteCommit = { sha: 'new-commit', message: body.message, tree: { sha: body.tree }, parents: [{ sha: 'base' }] }; return remoteCommit;
    }
    if (endpoint.endsWith('/git/refs') && method === 'POST') { branch = true; return {}; }
    if (endpoint.includes('/pulls?')) return pr ? [pr] : [];
    if (endpoint.endsWith('/pulls') && method === 'POST') { posts++; pr = { html_url: 'https://github.com/owner/repo/pull/1', head: { sha: 'new-commit' }, state: 'open' }; throw Error('response lost after creation'); }
    throw Error(`Unexpected request ${endpoint}`);
  };
  await assert.rejects(deliver(run, files, call), /response lost/);
  const result = await deliver(run, files, call);
  assert.equal(result.reconciled, true); assert.equal(posts, 1);
  advanced = true; const before = writes;
  assert.equal((await deliver(run, files, call, undefined, { readOnly: true })).reconciled, true);
  assert.equal(writes, before);
  branch = false; pr.state = 'closed';
  assert.equal((await deliver(run, files, call, undefined, { readOnly: true })).state, 'closed');
  assert.equal(writes, before);
  changed = true; await assert.rejects(deliver(run, files, call), /differs/);
  changed = false; branch = true; pr = undefined;
  await assert.rejects(deliver(run, files, call, undefined, { readOnly: true }), /read-only/);
  assert.equal(writes, before);
});

test('alpha rejected CLI resume preserves active cancellation and idle cancel is terminal', async () => {
  const f = await setup();
  const cli = new URL('../src/alpha/cli.mjs', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const invoke = action => command(process.execPath, [fileURLToPath(cli), '--state', f.store.directory, action, f.run.id]);
  try {
    const owner = f.store.claim(f.run.id);
    assert.equal((await invoke('cancel')).exitCode, 0);
    const rejected = await invoke('resume');
    assert.equal(rejected.exitCode, 1); assert.match(rejected.stderr.toString(), /active worker/);
    assert.equal(f.store.get(f.run.id).control, 'cancel');
    f.store.release(f.run.id, owner);
    assert.equal(f.store.get(f.run.id).state, 'CANCELLED');
    assert.equal((await invoke('resume')).exitCode, 1);
    assert.equal(f.store.get(f.run.id).control, 'cancel');
  } finally { f.store.close(); }
});

test('alpha failed resume transaction rolls back both control and worker ownership', async () => {
  const f = await setup();
  try {
    f.store.control(f.run.id, 'pause');
    const event = f.store.event.bind(f.store);
    f.store.event = () => { throw Error('event failure'); };
    assert.throws(() => f.store.claim(f.run.id, { resume: true }), /event failure/);
    assert.equal(f.store.get(f.run.id).control, 'pause');
    f.store.event = event;
    const owner = f.store.claim(f.run.id, { resume: true });
    assert.equal(f.store.get(f.run.id).control, 'run'); f.store.release(f.run.id, owner);
  } finally { f.store.close(); }
});

async function pendingDelivery() {
  const f = await setup({ ...input(), delivery: { mode: 'pull-request', repository: 'owner/repo', base: 'main' } });
  f.services.deliver = async () => { throw Error('response lost'); };
  await execute(f.store, f.run.id, f.services);
  return f;
}

test('alpha exhausted execution budget still reconciles with a bounded read-only allowance', async () => {
  const f = await pendingDelivery(); let reads = 0;
  try {
    const run = f.store.get(f.run.id); run.elapsedMs = run.contract.timeoutSeconds * 1000;
    const owner = f.store.claim(run.id); f.store.save(run, owner, 'EXPIRED'); f.store.release(run.id, owner);
    f.services.deliver = async (_run, _files, _api, checkpoint, options) => {
      assert.equal(options.readOnly, true); assert.ok(options.deadline > Date.now());
      checkpoint('BEFORE_REMOTE_LOOKUP'); reads++;
      assert.throws(() => checkpoint('BEFORE_PR'), /read-only/);
      return { url: 'existing-pr' };
    };
    assert.equal((await execute(f.store, run.id, f.services, { resume: true })).state, 'COMPLETED');
    assert.equal(reads, 1); assert.equal(f.counts().proposals, 1);
  } finally { f.store.close(); }
});

test('alpha cancelled uncertain delivery stays cancelled while querying existing effects', async () => {
  const f = await pendingDelivery();
  try {
    f.store.control(f.run.id, 'cancel');
    assert.equal(f.store.get(f.run.id).state, 'RECONCILING');
    f.services.deliver = async (_run, _files, _api, checkpoint, options) => {
      assert.equal(options.readOnly, true); checkpoint('BEFORE_REMOTE_LOOKUP');
      assert.throws(() => checkpoint('BEFORE_REMOTE_WRITE'), /read-only/);
      return { url: 'existing-pr' };
    };
    const result = await execute(f.store, f.run.id, f.services, { resume: true });
    assert.equal(result.state, 'COMPLETED'); assert.equal(f.store.get(f.run.id).control, 'cancel');
    assert.equal(f.counts().proposals, 1);
  } finally { f.store.close(); }
});

test('alpha read-only delivery never creates a missing branch or PR', async () => {
  const run = { id: 'missing', base: 'base', contract: { delivery: { repository: 'owner/repo', base: 'main' } } };
  let writes = 0;
  await assert.rejects(deliver(run, {}, async (endpoint, method = 'GET') => {
    if (method !== 'GET') writes++;
    if (endpoint.includes('/pulls?')) return [];
    const e = Error('missing'); e.notFound = true; throw e;
  }, undefined, { readOnly: true }), /read-only/);
  assert.equal(writes, 0);
});
