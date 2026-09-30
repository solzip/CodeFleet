import { randomUUID } from 'node:crypto';
import { chmod } from 'node:fs/promises';
import { command, environment, requireSuccess } from './process.mjs';
import { IMAGE } from './contract.mjs';
import { fileURLToPath } from 'node:url';

const guardFile = fileURLToPath(new URL('./verification-guard.mjs', import.meta.url));

export async function dockerReady() {
  requireSuccess(await command('docker', ['version', '--format', '{{.Server.Os}}'], { env: environment('docker') }), 'Docker engine');
  requireSuccess(await command('docker', ['image', 'inspect', IMAGE], { env: environment('docker') }), `Pinned Node image (run docker pull ${IMAGE})`);
}
export function dockerArgs(directory, tests, name, timeoutMs = 120000) {
  if (directory.includes(',') || guardFile.includes(',')) throw Error('Docker mount paths cannot contain commas');
  return ['run', '--rm', '--pull=never', '--name', name, '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m', '--cpus=1', '--user=1000:1000', '--tmpfs=/tmp:rw,nosuid,nodev,size=64m', '--mount', `type=bind,source=${directory},target=/work,readonly`, '--mount', `type=bind,source=${guardFile},target=/codefleet-guard.mjs,readonly`, '--workdir=/work', '--env=HOME=/tmp', '--env=NODE_OPTIONS=', '--entrypoint=timeout', IMAGE, '--kill-after=5s', `${Math.max(1, Math.ceil(timeoutMs / 1000))}s`, 'node', '--import=file:///codefleet-guard.mjs', '--test', '--test-reporter=tap', ...tests];
}
export function verificationResult(result) {
  const log = result.stdout.toString('utf8');
  const counts = {};
  for (const key of ['tests', 'pass', 'fail', 'skipped', 'todo']) {
    const matches = [...log.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, 'gm'))];
    counts[key] = matches.length === 1 ? Number(matches[0][1]) : null;
  }
  const testNames = [...log.matchAll(/^( *)# Subtest: (.+)\r?$/gm)].map(m => `${m[1].length}:${m[2].trimEnd()}`).sort();
  return { exitCode: result.exitCode, tests: counts.tests, passed: counts.pass, failed: counts.fail, skipped: counts.skipped, todo: counts.todo, testNames, interrupted: result.interrupted, truncated: result.truncated, log: log.slice(-16000), stderr: result.stderr.toString('utf8').slice(-4000), authority: 'HARNESS_EXECUTED', image: IMAGE };
}
// Counts alone mistake a file-level early exit for an executed test. Reject
// missing/changed test identities; old evidence without identities fails closed.
// This is not proof of assertion integrity against hostile in-process code.
export function matchTestIdentity(baseline, candidate) {
  return Array.isArray(baseline.testNames) && baseline.testNames.length > 0 &&
    Array.isArray(candidate.testNames) && baseline.tests === candidate.tests &&
    JSON.stringify([...baseline.testNames].sort()) === JSON.stringify([...candidate.testNames].sort());
}
export async function cleanupContainer(name) {
  if (!/^codefleet-[a-z0-9-]+$/.test(name)) throw Error('Invalid owned container name');
  await command('docker', ['rm', '-f', name], { env: environment('docker'), timeoutMs: 10000 });
}
export async function verify({ directory, tests, timeoutMs, cancelled, containerName }) {
  const name = containerName ?? `codefleet-${randomUUID()}`;
  if (!/^codefleet-[a-z0-9-]+$/.test(name)) throw Error('Invalid owned container name');
  // mkdtemp uses 0700 on POSIX. The container's unprivileged user needs to read
  // this disposable, explicitly selected source snapshot (never the state DB).
  await chmod(directory, 0o755);
  try {
    return verificationResult(await command('docker', dockerArgs(directory, tests, name, timeoutMs), { env: environment('docker'), timeoutMs, cancelled }));
  } finally {
    // Kill only the container created for this attempt, including after CLI interruption.
    await cleanupContainer(name);
  }
}
