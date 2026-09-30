import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateContract } from './contract.mjs';
import { repository, snapshot } from './workspace.mjs';
import { command, environment, requireSuccess } from './process.mjs';
import { javaCommand, javaOutputs } from './java-verifier.mjs';

// Explicit operator action: execute the trusted baseline build with network to
// cache public dependencies. Candidate verification itself always stays offline.
export async function prepareJava(input, repo, { cancelled } = {}) {
  const contract = validateContract(input);
  if (!contract.verification) throw Error('prepare-java requires a Java contract');
  const selected = await repository(repo);
  const directory = await mkdtemp(path.join(tmpdir(), 'codefleet-java-image-'));
  const source = path.join(directory, 'source');
  await snapshot(selected.repo, selected.base, source);
  await javaOutputs(source, contract.verification.kind);
  const gradle = contract.verification.kind === 'java-gradle';
  if (gradle) {
    const properties = await readFile(path.join(source, 'gradle/wrapper/gradle-wrapper.properties'), 'utf8');
    if (!/^distributionUrl=.*\/gradle-9\.4\.1-(bin|all)\.zip\s*$/m.test(properties)) throw Error('Initial Gradle adapter supports the pinned 9.4.1 toolchain only');
  }
  const tag = gradle ? 'gradle:9.4.1-jdk21' : 'maven:3.9.9-eclipse-temurin-21';
  const docker = async (args, timeoutMs = 30000) => {
    if (cancelled?.()) throw Error('Java preparation cancelled');
    return command('docker', args, { env: environment('docker'), timeoutMs, cancelled });
  };
  requireSuccess(await docker(['pull', tag], 300000), 'Pull Java build toolchain');
  const base = requireSuccess(await docker(['image', 'inspect', '--format', '{{index .RepoDigests 0}}', tag]), 'Resolve immutable toolchain');
  if (!/^[a-z0-9/._-]+@sha256:[a-f0-9]{64}$/.test(base)) throw Error('Toolchain digest missing');
  const report = `/warm/${contract.verification.module ? contract.verification.module + '/' : ''}${gradle ? 'build/test-results/test' : 'target/surefire-reports'}`;
  const dockerfile = [
    `FROM ${base} AS warm`, 'USER root', 'WORKDIR /warm', 'COPY source/ /warm/',
    'RUN mkdir -p /tmp/cache && chown -R 1000:1000 /tmp/cache /warm', 'USER 1000:1000',
    'ENV HOME=/tmp GRADLE_USER_HOME=/tmp/cache/gradle',
    'RUN ' + JSON.stringify(['sh', '-c', '"$@"; result=$?; if [ "$result" -ne 0 ]; then test -d ' + report + '; fi', 'codefleet-prepare', ...javaCommand(contract, false)]),
    `FROM ${base}`, 'USER root', 'COPY --from=warm --chown=1000:1000 /tmp/cache/ /opt/codefleet-cache/',
    `LABEL codefleet.adapter="${contract.verification.kind}" codefleet.base="${selected.base}"`, 'USER 1000:1000', ''
  ].join('\n');
  await writeFile(path.join(directory, 'Dockerfile'), dockerfile);
  const iid = path.join(directory, 'image-id');
  requireSuccess(await docker(['build', '--iidfile', iid, directory], 900000), 'Prepare Java dependency image');
  const image = (await readFile(iid, 'utf8')).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('Missing prepared image ID');
  return { image, kind: contract.verification.kind, baseCommit: selected.base, toolchain: base, directory, note: 'Local dependency image; no image upload. Copy image into contract.verification.image. Preparation used network; candidate verification does not.' };
}
