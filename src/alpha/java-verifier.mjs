import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, environment, requireSuccess } from './process.mjs';

const harness = fileURLToPath(new URL('./java/JunitReport.java', import.meta.url));
export function javaClasses(contract) {
  const prefix = (contract.verification.module ? contract.verification.module + '/' : '') + 'src/test/java/';
  return contract.tests.map(f => f.slice(prefix.length, -5).replaceAll('/', '.'));
}
export function javaCommand(contract, offline = true) {
  const { kind, module } = contract.verification;
  const classes = javaClasses(contract);
  if (kind === 'java-gradle') return ['gradle', '--no-daemon', '--no-build-cache', '--rerun-tasks', '--console=plain', '--max-workers=2', '-g', '/tmp/cache/gradle', ...(offline ? ['--offline'] : []), `${module ? ':' + module.replaceAll('/', ':') : ''}:test`, ...classes.flatMap(c => ['--tests', c])];
  return ['mvn', '-B', '-ntp', ...(offline ? ['--offline'] : []), '-Dmaven.repo.local=/tmp/cache/maven', ...(module ? ['-pl', module, '-am'] : []), `-Dtest=${classes.join(',')}`, '-Dsurefire.failIfNoSpecifiedTests=false', 'test'];
}
export async function javaOutputs(directory, kind) {
  const outputs = new Set([kind === 'java-gradle' ? 'build' : 'target']);
  async function visit(relative = '') {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw Error('Java snapshots cannot contain symlinks');
      if (entry.isDirectory()) await visit(name);
      else if (kind === 'java-gradle' ? /^build\.gradle(\.kts)?$/.test(entry.name) : entry.name === 'pom.xml') outputs.add((relative ? relative + '/' : '') + (kind === 'java-gradle' ? 'build' : 'target'));
    }
  }
  await visit();
  for (const out of outputs) {
    try { if ((await readdir(path.join(directory, out))).length) throw Error(`Tracked build outputs are not allowed: ${out}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return [...outputs];
}
export function javaDockerArgs(directory, contract, name, outputs, protectedPaths = []) {
  if ([directory, harness].some(p => p.includes(','))) throw Error('Docker mount paths cannot contain commas');
  return ['run', '-d', '--pull=never', '--name', name, '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=512', '--memory=2g', '--cpus=2', '--user=1000:1000', '--tmpfs=/tmp:rw,nosuid,nodev,size=2g', '--tmpfs=/work:rw,nosuid,nodev,size=1g,uid=1000,gid=1000', '--mount', `type=bind,source=${directory},target=/source,readonly`, ...protectedPaths.flatMap(p => ['--mount', `type=bind,source=${path.join(directory, p)},target=/work/${p},readonly`]), '--mount', `type=bind,source=${harness},target=/JunitReport.java,readonly`, '--workdir=/work', '--env=HOME=/tmp', '--env=GRADLE_USER_HOME=/tmp/cache/gradle', '--env=JAVA_TOOL_OPTIONS=', '--env=JDK_JAVA_OPTIONS=', '--entrypoint=sleep', contract.verification.image, '1800'];
}
export async function javaProtectedPaths(directory, outputs) {
  const protectedPaths = [];
  for (const output of outputs) {
    const module = path.posix.dirname(output);
    for (const suffix of ['src', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradle.properties', 'gradle.lockfile', 'pom.xml']) {
      const relative = module === '.' ? suffix : module + '/' + suffix;
      try { await lstat(path.join(directory, relative)); protectedPaths.push(relative); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  return protectedPaths;
}
export async function verifyJava({ directory, contract, timeoutMs, cancelled, containerName }) {
  const entered = Date.now();
  const run = async args => command('docker', args, { env: environment('docker'), timeoutMs: Math.max(1, timeoutMs - (Date.now() - entered)), cancelled });
  const outputs = await javaOutputs(directory, contract.verification.kind);
  const protectedPaths = await javaProtectedPaths(directory, outputs);
  requireSuccess(await run(javaDockerArgs(directory, contract, containerName, outputs, protectedPaths)), 'Start Java verifier');
  // Docker creates mount-parent directories as root. Make only those empty
  // module directories writable; source/test and build descriptors remain binds.
  const parents = new Set();
  for (const p of protectedPaths) {
    let parent = path.posix.dirname(p);
    while (parent !== '.') { parents.add('/work/' + parent); parent = path.posix.dirname(parent); }
  }
  if (parents.size) requireSuccess(await run(['exec', '--user=0:0', containerName, 'chmod', '777', ...parents]), 'Initialize ephemeral module directories');
  requireSuccess(await run(['exec', containerName, 'cp', '-R', '-n', '/source/.', '/work/']), 'Populate isolated build workspace');
  requireSuccess(await run(['exec', containerName, 'sh', '-c', 'mkdir -p /tmp/cache && cp -R /opt/codefleet-cache/. /tmp/cache/']), 'Restore isolated dependency cache');
  const result = await run(['exec', containerName, ...javaCommand(contract)]);
  const module = contract.verification.module;
  const report = `/work/${module ? module + '/' : ''}${contract.verification.kind === 'java-gradle' ? 'build/test-results/test' : 'target/surefire-reports'}`;
  const collected = await run(['exec', containerName, 'java', '/JunitReport.java', report, ...javaClasses(contract)]);
  let parsed = { tests: null, passed: null, failed: null, skipped: null, todo: 0, testNames: [] };
  let reportError = null;
  try { parsed = JSON.parse(requireSuccess(collected, 'Fresh JUnit reports')); }
  catch (e) { reportError = e.message; }
  return { ...parsed, exitCode: result.exitCode, interrupted: result.interrupted || collected.interrupted, truncated: result.truncated || collected.truncated, log: result.stdout.toString('utf8').slice(-16000), stderr: (result.stderr.toString('utf8') + (reportError ?? '')).slice(-4000), authority: 'HARNESS_EXECUTED', adapter: contract.verification.kind, image: contract.verification.image };
}
