#!/usr/bin/env node
// Read-only pre-spawn check for the separately owner-approved P1 R2 fixture.
// Never runs Codex, a model, a tool, an Operator, or an execution harness.
import { basename, isAbsolute, join } from 'node:path';
import { validateIdentity } from './p1-appserver-handshake.mjs';

export const P1_R2_HASHES = Object.freeze({
  codex: '9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42',
  client: '53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67',
  input: '4422903953D9E13F4393177E759A8DE57EDBB4E3CA09EB6B69F84B8',
  manifest: 'F1DA12AB30B72668B0D6BFD7398EDC993433419AAFB256844D9DA8A0F00C0200',
});

export function parsePreflightArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4)
    throw Error('Provide only --codex-exe ABSOLUTE_PATH --fixture ABSOLUTE_PATH');
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--codex-exe', '--fixture'].includes(key) || Object.hasOwn(args, key) ||
        typeof argv[i + 1] !== 'string' || !argv[i + 1] ||
        argv[i + 1].length > 4096)
      throw Error('Unrecognized or duplicated P1 R2 preflight parameter');
    args[key] = argv[i + 1];
  }
  if (!args['--codex-exe'] || !args['--fixture'] ||
      !isAbsolute(args['--codex-exe']) || !isAbsolute(args['--fixture']))
    throw Error('P1 R2 requires absolute executable and fixture paths');
  return { codexExe: args['--codex-exe'], fixture: args['--fixture'] };
}

// The expected-hash injection is for disposable offline fixtures only.
// The command-line entry point never accepts custom hashes or an --execute flag.
export async function inspectP1R2({ codexExe, fixture } = {}, { expected = P1_R2_HASHES } = {}) {
  if (!isAbsolute(codexExe ?? '') || !isAbsolute(fixture ?? ''))
    throw Error('P1 R2 requires absolute executable and fixture paths');
  await validateIdentity({
    codexExe, fixture,
    artifacts: join(fixture, 'proof-artifacts'),
    manifest: join(fixture, 'fixture-manifest.json'),
    codexSha256: expected.codex,
    clientSha256: expected.client,
    inputSha256: expected.input,
    manifestSha256: expected.manifest,
  }, { clientPath: join(fixture, 'proof-client', 'p1-appserver-handshake.mjs') });
  return {
    status: 'P1_R2_PREFLIGHT_MATCHED',
    appServerStarted: false,
    modelTurns: 0,
    toolCalls: 0,
    evidenceWritten: false,
    executionAuthorized: false,
    ownerApproval: 'NOT_ASSERTED',
    hostLiveVerified: false,
    next: 'SEPARATE_EXACT_OWNER_APPROVAL_REQUIRED',
  };
}

export function safeFailureCode(error) {
  const message = String(error?.message ?? '');
  if (/identity hash mismatch before spawn/.test(message)) return 'HASH_MISMATCH';
  if (/link|Junction|resolves through/i.test(message)) return 'PATH_ALIAS_OR_LINK';
  if (/manifest|Fixture|artifact|approved executable|absolute/i.test(message))
    return 'FIXTURE_OR_PATH_INVALID';
  return 'PREFLIGHT_BLOCKED';
}

export async function main(argv = process.argv.slice(2)) {
  return inspectP1R2(parsePreflightArgs(argv));
}

if (basename(process.argv[1] ?? '') === 'p1-r2-preflight.mjs') {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => {
      // Error strings from fs.realpath/stat may contain private absolute paths.
      // Publish a bounded code only, never echo caller paths or fixture bytes.
      process.stdout.write(JSON.stringify({
        status: 'P1_R2_PREFLIGHT_BLOCKED', reasonCode: safeFailureCode(error),
        appServerStarted: false, executionAuthorized: false,
        ownerApproval: 'NOT_ASSERTED', hostLiveVerified: false,
      }) + '\n');
      process.exitCode = 2;
    });
}
