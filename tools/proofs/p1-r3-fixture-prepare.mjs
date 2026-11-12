#!/usr/bin/env node
// Exact, opt-in NEW P1 R3 Fixture creation. This is never a Host or owner grant.
// For owner-approved local use only. Does not start Codex or modify old Fixtures.
import { readFile, lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256File, validateIdentity } from './p1-appserver-handshake.mjs';
import { buildR3SourcePacket, R3_CLIENT_SHA256, R3_MANIFEST_SHA256 } from './p1-r3-source-packet.mjs';

const CLIENT_SOURCE = fileURLToPath(new URL('./p1-appserver-handshake.mjs', import.meta.url));
const SHA256 = /^[A-F0-9]{64}$/;
const MAX_FILE_BYTES = 512 * 1024 * 1024;

export function parseR3PrepareArgs(args) {
  if (!Array.isArray(args) || args.length !== 7 ||
      args[0] !== '--write-new-fixture')
    throw Error('Exact owner-reviewed new-fixture write invocation required');
  const options = {};
  for (let i = 1; i < 7; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--codex-exe', '--fixture', '--expected-codex-sha256'].includes(key) ||
        Object.hasOwn(options, key) || typeof value !== 'string' ||
        value.length < 1 || value.length > 4096)
      throw Error('Unrecognized or duplicate R3 Fixture argument');
    options[key] = value;
  }
  if (!isAbsolute(options['--fixture'] ?? '') ||
      !isAbsolute(options['--codex-exe'] ?? '') ||
      !SHA256.test(options['--expected-codex-sha256'] ?? ''))
    throw Error('Absolute paths and independently reviewed SHA-256 required');
  return {
    fixture: options['--fixture'],
    codexExe: options['--codex-exe'],
    expectedCodexSha256: options['--expected-codex-sha256']
  };
}

const unavailable = path => lstat(path).then(() => false, error => {
  if (error?.code === 'ENOENT') return true;
  throw error;
});

async function requirePlainAncestors(target) {
  // New root must not exist. Reject traversal aliases and any linked/Junction
  // lexical ancestor. This is a safety precondition, not OS confinement.
  if (resolve(target) !== target || !await unavailable(target))
    throw Error('New Fixture must be an unused canonical absolute path');
  let ancestor = dirname(target);
  while (true) {
    const st = await lstat(ancestor);
    if (!st.isDirectory() || st.isSymbolicLink())
      throw Error('Fixture parent link or Junction is unsupported');
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (await realpath(dirname(target)) !== dirname(target))
    throw Error('Fixture parent has an unapproved alias');
}

export async function prepareR3Fixture({ fixture, codexExe, expectedCodexSha256 } = {}) {
  if (typeof fixture !== 'string' || !isAbsolute(fixture) ||
      typeof codexExe !== 'string' || !isAbsolute(codexExe) ||
      !SHA256.test(expectedCodexSha256 ?? ''))
    throw Error('Explicit bounded new Fixture and independently reviewed Codex identity required');
  if (process.platform === 'win32' && basename(await realpath(codexExe)).toLowerCase() !== 'codex.exe')
    throw Error('Native Windows codex.exe file required');
  const nativePath = await realpath(codexExe);
  const nativeInfo = await lstat(nativePath);
  if (!nativeInfo.isFile() || nativeInfo.size < 1 || nativeInfo.size > MAX_FILE_BYTES ||
      await sha256File(nativePath) !== expectedCodexSha256)
    throw Error('Native Codex executable SHA-256 mismatch or invalid file');
  const packet = await buildR3SourcePacket();
  await requirePlainAncestors(fixture);
  // No recursive creation. An occupied target (including a linked directory)
  // fails without touching it. Never auto-remove a partial new Fixture.
  await mkdir(fixture);
  const clientDir = join(fixture, 'proof-client');
  const artifacts = join(fixture, 'proof-artifacts');
  await mkdir(clientDir);
  await mkdir(artifacts);
  await writeFile(join(clientDir, 'p1-appserver-handshake.mjs'),
    await readFile(CLIENT_SOURCE), { flag: 'wx' });
  await writeFile(join(fixture, 'input.txt'), packet.inputBytes, { flag: 'wx' });
  await writeFile(join(fixture, 'fixture-manifest.json'), packet.manifestBytes, { flag: 'wx' });
  // Check the files we actually wrote, not the planned bytes in memory.
  await validateIdentity({
    codexExe, fixture, artifacts, manifest: join(fixture, 'fixture-manifest.json'),
    codexSha256: expectedCodexSha256,
    clientSha256: R3_CLIENT_SHA256,
    inputSha256: packet.binding.inputSha256,
    manifestSha256: R3_MANIFEST_SHA256
  }, { clientPath: join(clientDir, 'p1-appserver-handshake.mjs') });
  if (await realpath(codexExe) !== nativePath ||
      await sha256File(nativePath) !== expectedCodexSha256)
    throw Error('Native Codex identity changed during Fixture preparation');
  return Object.freeze({
    status: 'P1_R3_FIXTURE_BYTES_PREPARED_OWNER_REVIEW_REQUIRED',
    codexSha256: expectedCodexSha256,
    clientSha256: R3_CLIENT_SHA256,
    inputSha256: packet.binding.inputSha256,
    manifestSha256: R3_MANIFEST_SHA256,
    filesCreatedUnderNewRoot: 3,
    directoriesCreatedUnderNewRoot: 2,
    appServerStarted: false,
    modelTurns: 0, toolCalls: 0,
    executionAuthorized: false,
    hostLiveVerified: false,
    ownerApproval: 'NOT_ATTESTED_BY_SCRIPT',
    next: 'INDEPENDENT_OWNER_FIXTURE_REVIEW_AND_SEPARATE_R3_LIVE_APPROVAL'
  });
}

export async function main(args = process.argv.slice(2)) {
  return prepareR3Fixture(parseR3PrepareArgs(args));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(() => {
      // Do not echo OS errors, paths, private file content or native identity.
      process.stdout.write(JSON.stringify({
        status: 'P1_R3_FIXTURE_PREPARATION_BLOCKED',
        reasonCode: 'PRECONDITION_OR_IDENTITY_MISMATCH',
        cleanupAutomatic: false,
        appServerStarted: false,
        executionAuthorized: false,
        ownerApproval: 'NOT_ATTESTED_BY_SCRIPT',
        hostLiveVerified: false
      }) + '\n');
      process.exitCode = 2;
    });
}
