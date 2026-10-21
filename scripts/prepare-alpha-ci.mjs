// CI-only preparation of public fixtures. No providers, credentials or remote writes.
// Network is used to acquire build dependencies; candidate verification stays offline.
import assert from 'node:assert/strict';
import { appendFile, cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { IMAGE } from '../src/alpha/contract.mjs';
import { prepareJava } from '../src/alpha/java-prepare.mjs';
import { command, environment, requireSuccess } from '../src/alpha/process.mjs';

const destination = process.argv[2];
assert.ok(destination, 'Usage: node scripts/prepare-alpha-ci.mjs <environment-file>');
const docker = async args => requireSuccess(await command('docker', args, {
  env: environment('docker'), timeoutMs: 900000, cap: 16 * 1024 * 1024
}), `docker ${args[0]}`);
assert.equal(await docker(['info', '--format', '{{.OSType}}']), 'linux', 'Linux Docker engine required');
await docker(['pull', IMAGE]);
// Neither Dockerfile copies repository files. Keep local state and credentials
// out of the build context, including when reproducing CI on a developer host.
const buildContext = await mkdtemp(path.join(tmpdir(), 'codefleet-ci-build-'));
await cp('test/fixtures/operator-runtime.Dockerfile', path.join(buildContext, 'operator.Dockerfile'));
await cp('test/fixtures/host-ipc.Dockerfile', path.join(buildContext, 'ipc.Dockerfile'));
await docker(['build', '-f', path.join(buildContext, 'operator.Dockerfile'), '-t', 'codefleet-h3-runtime:offline', buildContext]);
const operator = await docker(['image', 'inspect', '--format', '{{.Id}}', 'codefleet-h3-runtime:offline']);
await docker(['build', '-f', path.join(buildContext, 'ipc.Dockerfile'), '-t', 'codefleet-h4-runtime:offline', buildContext]);
const ipc = await docker(['image', 'inspect', '--format', '{{.Id}}', 'codefleet-h4-runtime:offline']);

// Reuse the production dependency-image preparer with only the public Maven
// example, committed in a disposable repository (never the product repository).
const fixture = await mkdtemp(path.join(tmpdir(), 'codefleet-ci-maven-'));
await cp('examples/java-maven', fixture, { recursive: true });
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=sol', '-c', 'user.email=solarchive.dev@gmail.com',
  'commit', '-m', 'Public Maven CI fixture']]) {
  requireSuccess(await command('git', args, { cwd: fixture }), 'Prepare public Maven fixture');
}
const contract = JSON.parse(await readFile(path.join(fixture, 'contract.json'), 'utf8'));
const maven = await prepareJava(contract, fixture);
for (const image of [operator, ipc, maven.image]) assert.match(image, /^sha256:[a-f0-9]{64}$/);

// Export only after every preparation step succeeds. These are prerequisites,
// not security attestations: unchanged H2/H3/H4/H6 tests must prove the actual
// UID, socket, chroot, seccomp and Docker capabilities and fail if unavailable.
await appendFile(destination, [
  'CODEFLEET_TEST_DOCKER=1',
  `CODEFLEET_OPERATOR_IMAGE=${operator}`,
  `CODEFLEET_HOST_IPC_IMAGE=${ipc}`,
  `CODEFLEET_TEST_MAVEN_IMAGE=${maven.image}`, ''
].join('\n'));
console.log(JSON.stringify({ docker: 'linux', node: IMAGE, operator, ipc, maven: maven.image,
  toolchain: maven.toolchain, modelCalls: 0 }));
