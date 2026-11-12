import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, realpath, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseR3PrepareArgs, prepareR3Fixture } from './p1-r3-fixture-prepare.mjs';
import { sha256File, validateIdentity } from './p1-appserver-handshake.mjs';
import { R3_CLIENT_SHA256, R3_MANIFEST_SHA256 } from './p1-r3-source-packet.mjs';

const cli = fileURLToPath(new URL('./p1-r3-fixture-prepare.mjs', import.meta.url));

async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'cf-r3-write-offline-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const codexExe = join(parent, 'codex.exe');
  await writeFile(codexExe, 'FAKE BIN NEVER INVOKED BY PREPARER\n');
  const expectedCodexSha256 = await sha256File(codexExe);
  return { parent, codexExe, expectedCodexSha256, fixture: join(parent, 'approved-new-r3') };
}

test('preparer CLI rejects absent acknowledgement and all unknown authority flags', () => {
  for (const args of [
    [], ['--execute'], ['--prepare'], ['--write-new-fixture'],
    ['--write-new-fixture', '--codex-exe', '/a', '--fixture', '/b',
      '--expected-codex-sha256', 'f'.repeat(64), '--approve'],
    ['--write-new-fixture', '--codex-exe', 'codex.exe', '--fixture', '/b',
      '--expected-codex-sha256', 'f'.repeat(64)]
  ]) assert.throws(() => parseR3PrepareArgs(args));
});

test('a wrong native Codex hash creates no new Fixture', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareR3Fixture({
    ...f, expectedCodexSha256: '0'.repeat(64)
  }), /mismatch/);
  await assert.rejects(lstat(f.fixture), { code: 'ENOENT' });
});

test('new disposable fake Fixture has exact deterministic P1 R3 bytes', async t => {
  const f = await fixture(t);
  const result = await prepareR3Fixture(f);
  assert.equal(result.status, 'P1_R3_FIXTURE_BYTES_PREPARED_OWNER_REVIEW_REQUIRED');
  assert.equal(result.clientSha256, R3_CLIENT_SHA256);
  assert.equal(result.manifestSha256, R3_MANIFEST_SHA256);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.hostLiveVerified, false);
  assert.equal(result.ownerApproval, 'NOT_ATTESTED_BY_SCRIPT');
  assert.equal(result.appServerStarted, false);
  assert.deepEqual((await readdir(f.fixture)).sort(),
    ['fixture-manifest.json', 'input.txt', 'proof-artifacts', 'proof-client']);
  assert.deepEqual(await readdir(join(f.fixture, 'proof-artifacts')), []);
  assert.deepEqual(await readdir(join(f.fixture, 'proof-client')),
    ['p1-appserver-handshake.mjs']);
  const observed = await validateIdentity({
    codexExe:f.codexExe,fixture:f.fixture,
    artifacts:join(f.fixture,'proof-artifacts'),
    manifest:join(f.fixture,'fixture-manifest.json'),
    codexSha256:f.expectedCodexSha256,
    clientSha256:R3_CLIENT_SHA256,
    inputSha256:result.inputSha256,
    manifestSha256:R3_MANIFEST_SHA256
  }, {clientPath:join(f.fixture,'proof-client','p1-appserver-handshake.mjs'),platform:'test'});
  assert.equal(observed.hashes.client, R3_CLIENT_SHA256);
});

test('an existing Fixture is refused without touching its files', async t => {
  const f = await fixture(t);
  await mkdir(f.fixture);
  const userFile = join(f.fixture, 'owner-data.txt');
  await writeFile(userFile, 'DO NOT TOUCH');
  await assert.rejects(prepareR3Fixture(f), /unused canonical absolute path/);
  assert.equal(await readFile(userFile, 'utf8'), 'DO NOT TOUCH');
  assert.deepEqual(await readdir(f.fixture), ['owner-data.txt']);
});

test('a second invocation never overwrites the new evidence or Client', async t => {
  const f = await fixture(t);
  await prepareR3Fixture(f);
  const client = join(f.fixture, 'proof-client', 'p1-appserver-handshake.mjs');
  const before = await sha256File(client);
  await assert.rejects(prepareR3Fixture(f), /unused canonical absolute path/);
  assert.equal(await sha256File(client), before);
  assert.deepEqual(await readdir(join(f.fixture, 'proof-artifacts')), []);
});

test('linked candidate ancestor is refused before any writes', async t => {
  const f = await fixture(t);
  const alias = join(f.parent, 'linked-parent');
  const target = join(f.parent, 'actual-parent');
  await mkdir(target);
  try { await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch(error) {
    if (['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(error.code)) {
      t.skip('Directory symlinks unavailable on runner'); return;
    }
    throw error;
  }
  const proposed = join(alias, 'new-r3');
  await assert.rejects(prepareR3Fixture({ ...f, fixture: proposed }),
    /parent link|Junction/);
  await assert.rejects(lstat(join(target, 'new-r3')), {code:'ENOENT'});
});

test('CLI errors never echo private fixture or Codex paths', () => {
  const secret='/private/USER_SECRET_R3_FIXTURE_PATH';
  const out=spawnSync(process.execPath,[cli,
    '--write-new-fixture',
    '--codex-exe','/private/USER_SECRET_CODEX.exe',
    '--fixture',secret,
    '--expected-codex-sha256','0'.repeat(64)
  ], {encoding:'utf8', shell:false});
  assert.equal(out.status,2);
  const response=JSON.parse(out.stdout);
  assert.equal(response.status,'P1_R3_FIXTURE_PREPARATION_BLOCKED');
  assert.equal(response.executionAuthorized,false);
  assert.equal(response.appServerStarted,false);
  assert.equal(response.hostLiveVerified,false);
  assert.equal(out.stdout.includes(secret),false);
});

test('prepared files never authorize P1 Live or assert owner approval', async t => {
  const f = await fixture(t);
  const result=await prepareR3Fixture(f);
  assert.equal(result.ownerApproval,'NOT_ATTESTED_BY_SCRIPT');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.hostLiveVerified,false);
  assert.equal(result.modelTurns,0);
  assert.equal(result.toolCalls,0);
});
