import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256File } from './p1-appserver-handshake.mjs';
import { P1_R2_HASHES, inspectP1R2, parsePreflightArgs, safeFailureCode } from './p1-r2-preflight.mjs';

const preflightCli = fileURLToPath(new URL('./p1-r2-preflight.mjs', import.meta.url));
const proofClient = fileURLToPath(new URL('./p1-appserver-handshake.mjs', import.meta.url));

async function fixture(t) {
  // Windows TEMP may use 8.3 aliases. Canonicalize only disposable fixtures.
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'cf-p1-r2-offline-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'fixture'), codexExe = join(parent, 'codex.exe');
  await mkdir(root);
  await mkdir(join(root, 'proof-artifacts'));
  await mkdir(join(root, 'proof-client'));
  const client = join(root, 'proof-client', 'p1-appserver-handshake.mjs');
  const input = join(root, 'input.txt');
  const manifest = join(root, 'fixture-manifest.json');
  await cp(proofClient, client);
  await writeFile(codexExe, 'FAKE_CODEX_EXECUTABLE_NEVER_RUN\n');
  await writeFile(input, 'CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1\n');
  const inputSha256 = await sha256File(input);
  const clientSha256 = await sha256File(client);
  await writeFile(manifest, JSON.stringify({
    manifestVersion: 1,
    proofRoot: '<PROOF_ROOT>', artifacts: '<PROOF_ARTIFACTS>',
    input: { path: '<PROOF_INPUT>', sha256: inputSha256 },
    proofClient: { path: '<PROOF_CLIENT>', sha256: clientSha256 },
    proofOutput: { path: '<PROOF_OUTPUT>', exists: false },
    artifactCount: 0, linksOrJunctions: false,
  }, null, 2) + '\n');
  return {
    root, codexExe, client,
    expected: {
      codex: await sha256File(codexExe), client: clientSha256,
      input: inputSha256, manifest: await sha256File(manifest),
    },
  };
}

test('CLI pins P1 R2 hashes and rejects execution/hash override flags', () => {
  assert.equal(P1_R2_HASHES.codex, '9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42');
  assert.equal(P1_R2_HASHES.client, '53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67');
  assert.equal(P1_R2_HASHES.input, '4422903953D9E13F4393177E759A8DE57EDBB4E3CA09EB6B69F84B8');
  assert.equal(P1_R2_HASHES.manifest, 'F1DA12AB30B72668B0D6BFD7398EDC993433419AAFB256844D9DA8A0F00C0200');
  assert.throws(() => parsePreflightArgs(['--execute']), /Provide only/);
  assert.throws(() => parsePreflightArgs(['--codex-exe', '/tmp/a', '--fixture', '/tmp/b', '--override-hash', 'x']), /Provide only/);
});

test('offline fixture preflight is read-only and never grants execution', async t => {
  const f = await fixture(t);
  const before = await readdir(f.root);
  const result = await inspectP1R2({ codexExe: f.codexExe, fixture: f.root }, { expected: f.expected });
  assert.equal(result.status, 'P1_R2_PREFLIGHT_MATCHED');
  assert.equal(result.appServerStarted, false);
  assert.equal(result.modelTurns, 0);
  assert.equal(result.toolCalls, 0);
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.ownerApproval, 'NOT_ASSERTED');
  assert.equal(result.hostLiveVerified, false);
  assert.deepEqual(await readdir(f.root), before);
  assert.deepEqual(await readdir(join(f.root, 'proof-artifacts')), []);
  assert.equal(JSON.stringify(result).includes(f.root), false);
});

test('wrong Codex hash is denied without writing any Evidence', async t => {
  const f = await fixture(t);
  await assert.rejects(inspectP1R2({ codexExe: f.codexExe, fixture: f.root }, {
    expected: { ...f.expected, codex: '0'.repeat(64) },
  }), /hash mismatch before spawn/);
  assert.deepEqual(await readdir(join(f.root, 'proof-artifacts')), []);
});

test('tampered copied client is rejected before execution', async t => {
  const f = await fixture(t);
  await writeFile(f.client, 'TAMPERED_COPY\n');
  await assert.rejects(inspectP1R2({ codexExe: f.codexExe, fixture: f.root }, {
    expected: f.expected,
  }), /hash mismatch before spawn/);
});

test('occupied proof-artifacts blocks read-only preflight', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'proof-artifacts', 'p1-result.json'), '{}\n');
  await assert.rejects(inspectP1R2({ codexExe: f.codexExe, fixture: f.root }, {
    expected: f.expected,
  }), /artifact directory must be empty/);
});

test('CLI refuses unknown paths without leaking the private input', () => {
  const secret = '/private/no-such-fixture-and-identity';
  const result = spawnSync(process.execPath, [preflightCli,
    '--codex-exe', '/private/no-such-codex.exe', '--fixture', secret], {
    encoding: 'utf8', shell: false,
  });
  assert.equal(result.status, 2);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'P1_R2_PREFLIGHT_BLOCKED');
  assert.equal(output.appServerStarted, false);
  assert.equal(output.executionAuthorized, false);
  assert.equal(result.stdout.includes(secret), false);
});

test('safe error codes do not echo absolute paths or untrusted data', () => {
  assert.equal(safeFailureCode(new Error('ENOENT: C:\\Users\\private\\secret')), 'PREFLIGHT_BLOCKED');
  assert.equal(safeFailureCode(new Error('codex identity hash mismatch before spawn')), 'HASH_MISMATCH');
  assert.equal(safeFailureCode(new Error('Fixture path resolves through an unapproved link or Junction')), 'PATH_ALIAS_OR_LINK');
});
