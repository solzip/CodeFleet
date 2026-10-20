import { access } from 'node:fs/promises';
import path from 'node:path';
import { command, environment } from '../alpha/process.mjs';
import { hostIdentity } from './exchange.mjs';
import { containerBackend, localBackend, hostSandboxBackend } from '../verification/backends.mjs';

async function installed(name) {
  for (const dir of (process.env.PATH ?? process.env.Path ?? '').split(path.delimiter)) {
    if (!dir) continue;
    try { await access(path.join(dir, name + (process.platform === 'win32' ? '.exe' : ''))); return true; } catch {}
  }
  return false;
}
export async function hostDoctor(host, { probeContainer = false } = {}) {
  hostIdentity(host);
  const git = await command('git', ['--version'], { env: environment() });
  const node = process.versions.node.split('.').map(Number);
  const core = (node[0] > 24 || node[0] === 24 && (node[1] > 14 || node[1] === 14 && node[2] >= 1)) && git.exitCode === 0;
  const container = probeContainer ? await containerBackend().capabilities() : {
    status: await installed('docker') ? 'NOT_CHECKED' : 'NOT_INSTALLED',
    reason: 'Optional backend; use --probe-container to check engine and pinned image. No authentication inspection.'
  };
  return { host, status: core ? 'AVAILABLE' : 'MISSING_CORE_RUNTIME',
    hostSkills: { status: 'AVAILABLE', scope: 'Packaged Skill; actual Host discovery NOT_RUN' },
    planning: core ? 'AVAILABLE' : 'UNAVAILABLE', workflow: core ? 'AVAILABLE' : 'UNAVAILABLE',
    localVerification: await localBackend().capabilities(), protectedContainerVerification: container,
    hostSandbox: await hostSandboxBackend.capabilities(), authentication: 'NOT_INSPECTED',
    hostLive: 'NOT_RUN', modelCalls: 0 };
}
