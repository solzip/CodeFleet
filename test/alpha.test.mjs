import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateContract, applyEdits, judge, hash } from '../src/alpha/contract.mjs';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { command, environment } from '../src/alpha/process.mjs';
import { verificationResult, dockerArgs } from '../src/alpha/verifier.mjs';
import { deliver } from '../src/alpha/delivery.mjs';
import { providerArgs } from '../src/alpha/provider.mjs';

const input = () => ({ schemaVersion: 1, goal: 'Return the correct value for subtraction.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 2, timeoutSeconds: 60, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
const proposal = (value = 'a - b') => ({ summary: 'Correct subtraction', edits: [{ path: 'src/math.js', oldText: 'a + b', newText: value }] });
const pass = () => ({ exitCode: 0, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, interrupted: false, truncated: false, integrity: true });
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
  assert.equal(judge({ ...r, integrity: true }).outcome, 'ACCEPT');
  const empty = verificationResult({ exitCode: 0, stdout: Buffer.from('version 24'), stderr: Buffer.alloc(0), interrupted: false, truncated: false });
  assert.notEqual(judge({ ...empty, integrity: true }).outcome, 'ACCEPT');
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
  await assert.rejects(deliver(run, {}, async (_endpoint, method) => { if (method) writes++; return { object: { sha: 'new' } }; }), /base changed/);
  assert.equal(writes, 0);
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

test('alpha delivery reconciles a lost PR response, checks content, and uses explicit public identity', async () => {
  const run = { id: 'delivery-test', base: 'base', evidenceHash: 'evidence', candidateHash: 'candidate', contract: { goal: 'Fix subtraction', tests: ['test/math.test.js'], delivery: { repository: 'owner/repo', base: 'main', authorName: 'public-handle', authorEmail: 'public@example.invalid' } } };
  const files = { 'src/math.js': 'a - b' };
  let remoteCommit, branch, pr, posts = 0, changed = false;
  const call = async (endpoint, method = 'GET', body) => {
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: 'base' } };
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
  changed = true; await assert.rejects(deliver(run, files, call), /differs/);
});
