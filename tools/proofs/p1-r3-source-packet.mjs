#!/usr/bin/env node
// Read-only, reproducible P1 R3 source/manifest packet.
// Does not create a Fixture, start Codex or convey owner approval.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const R3_CLIENT_SHA256 =
  '7B51CC058EE5D8C2E29B7558539C6314BB57650CED662731FBBB4DDFC401EDF9';
export const R3_INPUT = 'CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1\n';
export const R3_MANIFEST_SHA256 =
  '764FAF1953D739FDAB3B0108F78FBBEC273F6DAC653AE10732A3283D3ABAB455';
const CLIENT = fileURLToPath(new URL('./p1-appserver-handshake.mjs', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex').toUpperCase();

// Only the internal fake-fixture tests supply an alternate source path.
// The CLI has no file-path or hash override, and its binding is unapproved.
export async function buildR3SourcePacket(sourceClient = CLIENT) {
  const bytes = await readFile(sourceClient);
  if (sha256(bytes) !== R3_CLIENT_SHA256)
    throw Error('R3 reviewed client source digest mismatch');
  const inputBytes = Buffer.from(R3_INPUT, 'utf8');
  const inputSha256 = sha256(inputBytes);
  const manifestData = {
    manifestVersion: 1,
    proofRoot: '<PROOF_ROOT>',
    artifacts: '<PROOF_ARTIFACTS>',
    input: { path: '<PROOF_INPUT>', sha256: inputSha256 },
    proofClient: { path: '<PROOF_CLIENT>', sha256: R3_CLIENT_SHA256 },
    proofOutput: { path: '<PROOF_OUTPUT>', exists: false },
    artifactCount: 0,
    linksOrJunctions: false
  };
  // Exact bytes of this candidate are deterministic on Windows and Linux.
  // They are not yet the owner's actual on-disk Fixture manifest.
  const manifestBytes = Buffer.from(JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
  if (sha256(manifestBytes) !== R3_MANIFEST_SHA256)
    throw Error('R3 candidate manifest serialization changed');
  const binding = Object.freeze({
    status: 'P1_R3_SOURCE_BINDING_CANDIDATE_UNAPPROVED',
    candidateClientSha256: R3_CLIENT_SHA256,
    inputSha256,
    candidateManifestSha256: R3_MANIFEST_SHA256,
    nativeCodexSha256: null,
    nativeCodexObserved: false,
    ownerFixtureObserved: false,
    fixturePrepared: false,
    executionAuthorized: false,
    hostLiveVerified: false,
    ownerApproval: 'NOT_GRANTED',
    next: 'REVIEW_NEW_PRIVATE_FIXTURE_AND_NATIVE_CODEX_IDENTITY'
  });
  return { binding, inputBytes, manifestBytes };
}

export async function main(args = process.argv.slice(2)) {
  if (!Array.isArray(args) || args.length !== 0)
    throw Error('R3 source binding is read-only and accepts no arguments');
  return (await buildR3SourcePacket()).binding;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(() => {
      process.stdout.write(JSON.stringify({
        status: 'P1_R3_SOURCE_BINDING_BLOCKED',
        reasonCode: 'SOURCE_OR_SCOPE_MISMATCH',
        fixturePrepared: false, executionAuthorized: false,
        hostLiveVerified: false, ownerApproval: 'NOT_GRANTED'
      }) + '\n');
      process.exitCode = 2;
    });
}
