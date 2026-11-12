#!/usr/bin/env node
// Offline observation of the proposed P1 R3 native executable and optional
// already-existing Fixture. No writes, subprocesses, grants or approval flags.
import { lstat, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256File, validateIdentity } from './p1-appserver-handshake.mjs';
import { buildR3SourcePacket, R3_CLIENT_SHA256, R3_MANIFEST_SHA256 } from './p1-r3-source-packet.mjs';

const MAX_PATH_CHARS = 4096;
const MAX_EXEC_BYTES = 512 * 1024 * 1024;

function absolutePath(value) {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= MAX_PATH_CHARS && isAbsolute(value);
}

export function parseR3InspectArgs(args) {
  if (!Array.isArray(args) || ![2, 4].includes(args.length))
    throw Error('Only --codex-exe ABSOLUTE [--fixture ABSOLUTE] is supported');
  const found = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--codex-exe', '--fixture'].includes(args[i]) ||
        Object.hasOwn(found, args[i]) || !absolutePath(args[i + 1]))
      throw Error('Invalid or duplicate R3 inspection path');
    found[args[i]] = args[i + 1];
  }
  if (!found['--codex-exe']) throw Error('Absolute Codex executable required');
  return { codexExe: found['--codex-exe'], fixture: found['--fixture'] };
}

export async function inspectP1R3({ codexExe, fixture } = {}, { platform = process.platform } = {}) {
  if (!absolutePath(codexExe) ||
      (fixture !== undefined && !absolutePath(fixture)))
    throw Error('R3 inspection requires absolute bounded paths');

  // Never accept an arbitrary or modified local proof client merely because
  // a fabricated manifest embeds the same digest.
  const packet = await buildR3SourcePacket();
  const resolvedExe = await realpath(codexExe);
  if (platform === 'win32' && basename(resolvedExe).toLowerCase() !== 'codex.exe')
    throw Error('Native Windows codex.exe is required');
  const info = await lstat(resolvedExe);
  if (!info.isFile() || info.size < 1 || info.size > MAX_EXEC_BYTES)
    throw Error('Native executable must be a bounded regular file');

  const observed = await sha256File(resolvedExe);
  let fixtureEntriesObserved = false;
  if (fixture !== undefined) {
    // This is a *self-observation* of the native file digest. It deliberately
    // does NOT bind a user-approved executable digest: a second, independent
    // owner review and exact Live authorization are still required.
    await validateIdentity({
      codexExe, fixture,
      artifacts: join(fixture, 'proof-artifacts'),
      manifest: join(fixture, 'fixture-manifest.json'),
      codexSha256: observed,
      clientSha256: R3_CLIENT_SHA256,
      inputSha256: packet.binding.inputSha256,
      manifestSha256: R3_MANIFEST_SHA256,
    }, {
      clientPath: join(fixture, 'proof-client', 'p1-appserver-handshake.mjs'),
      platform,
    });
    fixtureEntriesObserved = true;
  }
  // Detect a local binary/alias drift during this non-atomic observation.
  if (await realpath(codexExe) !== resolvedExe ||
      await sha256File(resolvedExe) !== observed)
    throw Error('Codex executable changed during inspection');

  return Object.freeze({
    status: fixtureEntriesObserved
      ? 'P1_R3_FILES_OBSERVED_OWNER_REVIEW_REQUIRED'
      : 'P1_R3_NATIVE_FILE_OBSERVED_FIXTURE_NOT_CHECKED',
    nativeExecutableSha256: observed,
    candidateClientSha256: R3_CLIENT_SHA256,
    candidateInputSha256: packet.binding.inputSha256,
    candidateManifestSha256: R3_MANIFEST_SHA256,
    fixtureEntriesObserved,
    nativeExecutableAuthenticityEstablished: false,
    approvedFixturePrepared: false,
    appServerStarted: false,
    modelTurns: 0,
    toolCalls: 0,
    evidenceWritten: false,
    executionAuthorized: false,
    hostLiveVerified: false,
    ownerApproval: 'NOT_GRANTED',
    next: 'SEPARATE_EXACT_OWNER_REVIEW_AND_APPROVAL_REQUIRED',
  });
}

function codeFor(error) {
  const message = String(error?.message ?? '');
  if (/identity hash mismatch before spawn|digest mismatch|changed during inspection/.test(message))
    return 'IDENTITY_MISMATCH';
  if (/link|Junction|resolves through/i.test(message))
    return 'PATH_ALIAS_OR_LINK';
  if (/artifact directory must be empty/.test(message))
    return 'EVIDENCE_DIRECTORY_NOT_EMPTY';
  if (/client source digest mismatch/.test(message))
    return 'UNREVIEWED_CLIENT_SOURCE';
  return 'R3_INSPECTION_UNAVAILABLE';
}

export async function main(argv = process.argv.slice(2)) {
  return inspectP1R3(parseR3InspectArgs(argv));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(error => {
      // FS and native errors can include private absolute Windows paths.
      process.stdout.write(JSON.stringify({
        status: 'P1_R3_INSPECTION_BLOCKED',
        reasonCode: codeFor(error),
        fixtureEntriesObserved: false,
        approvedFixturePrepared: false,
        appServerStarted: false,
        executionAuthorized: false,
        hostLiveVerified: false,
        ownerApproval: 'NOT_GRANTED',
      }) + '\n');
      process.exitCode = 2;
    });
}
