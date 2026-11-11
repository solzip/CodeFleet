import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectP1R3, parseR3InspectArgs } from './p1-r3-native-inspect.mjs';
import { buildR3SourcePacket, R3_CLIENT_SHA256, R3_MANIFEST_SHA256 } from './p1-r3-source-packet.mjs';
import { sha256File } from './p1-appserver-handshake.mjs';

const cli = fileURLToPath(new URL('./p1-r3-native-inspect.mjs', import.meta.url));
const clientSource = fileURLToPath(new URL('./p1-appserver-handshake.mjs', import.meta.url));

async function fakeFixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cf-r3-native-readonly-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exe = join(root, 'codex.exe');
  await writeFile(exe, 'FAKE NATIVE EXECUTABLE NOT RUN\n');
  const fixture = join(root, 'r3-fixture');
  await mkdir(fixture);
  await mkdir(join(fixture, 'proof-client'));
  await mkdir(join(fixture, 'proof-artifacts'));
  await cp(clientSource, join(fixture, 'proof-client', 'p1-appserver-handshake.mjs'));
  const packet = await buildR3SourcePacket();
  await writeFile(join(fixture, 'input.txt'), packet.inputBytes, { flag: 'wx' });
  await writeFile(join(fixture, 'fixture-manifest.json'), packet.manifestBytes, { flag: 'wx' });
  return { exe, fixture, root, packet };
}

test('CLI accepts only bounded absolute executable and optional Fixture paths', () => {
  assert.throws(() => parseR3InspectArgs(['--execute']), /Only/);
  assert.throws(() => parseR3InspectArgs(['--prepare', '/tmp/x']), /Invalid/);
  assert.throws(() => parseR3InspectArgs(['--codex-exe', 'codex.exe']), /Invalid/);
  assert.throws(() => parseR3InspectArgs(['--codex-exe', '/x', '--fixture', '/y', '--manifest-sha256', 'z']), /Only/);
  assert.throws(() => parseR3InspectArgs(['--codex-exe', '/x', '--codex-exe', '/y']), /duplicate/);
});

test('native file-only observation has no Fixture or Host-approval claims', async t => {
  const f = await fakeFixture(t);
  const observed = await inspectP1R3({ codexExe: f.exe });
  assert.equal(observed.status, 'P1_R3_NATIVE_FILE_OBSERVED_FIXTURE_NOT_CHECKED');
  assert.equal(observed.nativeExecutableSha256, await sha256File(f.exe));
  assert.equal(observed.fixtureEntriesObserved, false);
  assert.equal(observed.nativeExecutableAuthenticityEstablished, false);
  assert.equal(observed.approvedFixturePrepared, false);
  assert.equal(observed.executionAuthorized, false);
  assert.equal(observed.hostLiveVerified, false);
  assert.equal(observed.ownerApproval, 'NOT_GRANTED');
});

test('already-existing fake Fixture is structurally observed, never owner-approved', async t => {
  const f = await fakeFixture(t);
  const entries = (await readdir(f.fixture)).sort();
  const observed = await inspectP1R3({ codexExe: f.exe, fixture: f.fixture });
  assert.equal(observed.status, 'P1_R3_FILES_OBSERVED_OWNER_REVIEW_REQUIRED');
  assert.equal(observed.fixtureEntriesObserved, true);
  assert.equal(observed.candidateClientSha256, R3_CLIENT_SHA256);
  assert.equal(observed.candidateManifestSha256, R3_MANIFEST_SHA256);
  assert.equal(observed.nativeExecutableAuthenticityEstablished, false);
  assert.equal(observed.approvedFixturePrepared, false);
  assert.equal(observed.executionAuthorized, false);
  assert.equal(observed.hostLiveVerified, false);
  assert.equal(observed.ownerApproval, 'NOT_GRANTED');
  assert.deepEqual((await readdir(f.fixture)).sort(), entries);
  assert.deepEqual(await readdir(join(f.fixture, 'proof-artifacts')), []);
  assert.equal(JSON.stringify(observed).includes(f.root), false);
});

test('replaced copied client is rejected with no Host launch', async t => {
  const f = await fakeFixture(t);
  await writeFile(join(f.fixture, 'proof-client', 'p1-appserver-handshake.mjs'), 'TAMPERED\n');
  await assert.rejects(inspectP1R3({ codexExe: f.exe, fixture: f.fixture }), /identity hash mismatch/);
});

test('a reused or dirty Evidence directory is refused', async t => {
  const f = await fakeFixture(t);
  await writeFile(join(f.fixture, 'proof-artifacts', 'p1-result.json'), '{}');
  await assert.rejects(inspectP1R3({ codexExe: f.exe, fixture: f.fixture }), /artifact directory must be empty/);
});

test('CLI rejects execution/prepare and does not echo private paths', () => {
  const path = '/private/sensitive-user-fixture-X78';
  for (const args of [
    ['--execute', '--codex-exe', path],
    ['--prepare', '--codex-exe', path],
    ['--codex-exe', '/private/sensitive-user-codex-X78', '--fixture', path],
  ]) {
    const out = spawnSync(process.execPath, [cli, ...args], { encoding:'utf8', shell:false });
    assert.equal(out.status, 2, out.stderr);
    const result = JSON.parse(out.stdout);
    assert.equal(result.status, 'P1_R3_INSPECTION_BLOCKED');
    assert.equal(result.executionAuthorized, false);
    assert.equal(result.appServerStarted, false);
    assert.equal(out.stdout.includes(path), false);
  }
});

test('CLI fixture-only observation never modifies disposable test Fixture', async t => {
  const f = await fakeFixture(t);
  const before = (await readdir(f.fixture)).sort();
  const out = spawnSync(process.execPath, [
    cli, '--codex-exe', f.exe, '--fixture', f.fixture
  ], { encoding:'utf8', shell:false });
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(out.stdout);
  assert.equal(result.fixtureEntriesObserved, true);
  assert.equal(result.ownerApproval, 'NOT_GRANTED');
  assert.equal(result.executionAuthorized, false);
  assert.equal(out.stdout.includes(f.root), false);
  assert.deepEqual((await readdir(f.fixture)).sort(), before);
});
