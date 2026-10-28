import path from 'node:path';
import { readFile, readdir, lstat, realpath, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { hash } from '../alpha/contract.mjs';
import { command } from '../alpha/process.mjs';
import { verify, dockerReady, cleanupContainer, parseTestResult } from '../alpha/verifier.mjs';
import { PROTECTED_CAPABILITIES } from '../alpha/verification-evidence.mjs';

export function containerBackend({ ready = dockerReady, run = verify, cleanup = cleanupContainer } = {}) {
  return {
    id: 'container',
    async capabilities(verification) {
      try { await ready(verification); return { status: 'AVAILABLE', isolationCapabilities: [...PROTECTED_CAPABILITIES] }; }
      catch (e) { return { status: 'UNAVAILABLE', isolationCapabilities: [], reason: e.message }; }
    },
    prepare: ready,
    async verify(request) {
      const evidence = await run(request);
      return { ...evidence, verificationBackend: 'container', executionAuthority: evidence.authority,
        isolationCapabilities: [...PROTECTED_CAPABILITIES], verifierIndependence: 'PROTECTED_TEST_INPUTS',
        evidenceIntegrity: 'UNBOUND', contractHash: null, candidateTreeHash: null,
        requiredGateResults: { protectedVerification: 'UNSATISFIED', testIdentity: 'UNSATISFIED', treeIntegrity: 'UNSATISFIED' } };
    },
    cancel: cleanup, cleanup
  };
}
export const hostSandboxBackend = Object.freeze({
  id: 'host-sandbox',
  async capabilities() { return { status: 'NOT_VERIFIED', isolationCapabilities: [], reason: 'No qualified platform/tool profile; cannot activate from supplied claims' }; },
  async prepare() { throw Error('Host Sandbox NOT_VERIFIED'); },
  async verify() { throw Error('Host Sandbox NOT_VERIFIED'); },
  async cancel() {}, async cleanup() {}
});

// This is explicit trust of code, not containment of hostile code. Hashing detects
// changes before/after execution but cannot prevent concurrent writes or effects.
export async function localTree(directory, replacements = [], { excludeGit = false, entries = false } = {}) {
  const overlay = new Map(replacements.map(f => [f.path, f]));
  if (overlay.size !== replacements.length) throw Error('Duplicate projected file');
  const files = []; let bytes = 0;
  async function walk(relative = '') {
    const dir = path.join(directory, relative);
    if ((await lstat(dir)).isSymbolicLink()) throw Error('Local verification rejects linked paths');
    for (const name of (await readdir(dir)).sort()) {
      if (excludeGit && !relative && name === '.git') continue;
      const rel = relative ? relative + '/' + name : name;
      const stat = await lstat(path.join(directory, rel));
      if (stat.isSymbolicLink()) throw Error('Local verification rejects symlinks');
      if (stat.isDirectory()) await walk(rel);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 32 * 1024 * 1024 || files.length >= 1500) throw Error('Local snapshot exceeds bound');
        const original = await readFile(path.join(directory, rel)), replacement = overlay.get(rel);
        if (replacement && (typeof replacement.content !== 'string' || hash(original) !== replacement.baseSha256)) throw Error('Projected source base changed');
        files.push([rel, stat.mode, replacement ? hash(replacement.content) : hash(original)]);
        overlay.delete(rel);
      } else throw Error('Local verification requires regular files');
    }
  }
  await walk();
  if (overlay.size) throw Error('Projected repair must replace existing regular files');
  if (!files.length) throw Error('Local verification requires a nonempty reviewed snapshot');
  return entries ? files : hash(files);
}
// Review only: does not write, authorize, or execute the projected tree.
export async function previewLocalCommand(request, replacements) {
  const { commandHash, ...spec } = await inspectLocalCommand(request);
  spec.candidateTreeHash = await localTree(spec.directory, replacements);
  return { ...spec, commandHash: hash(spec) };
}
export async function inspectLocalCommand({ executable, args, directory, timeoutMs = 30000 }) {
  if (!path.isAbsolute(executable) || /\.(cmd|bat|ps1)$/i.test(executable) ||
      !Array.isArray(args) || args.length > 100 || args.some(a => typeof a !== 'string' || a.length > 8000 || a.includes('\0')) ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw Error('Exact native executable, bounded arguments and timeout required');
  const argv = [...args];
  const exe = await realpath(executable), cwd = await realpath(directory);
  const spec = { executable: exe, executableHash: hash(await readFile(exe)), args: argv,
    directory: cwd, candidateTreeHash: await localTree(cwd), timeoutMs, policy: 'explicit-trusted-local-v1' };
  return { ...spec, commandHash: hash(spec) };
}
// A failure is only what the runner itself reported failing in one complete, unaltered
// run. A non-zero exit alone, missing or duplicated summary counts, interruption,
// truncation or a changed tree stay INCONCLUSIVE. Neither outcome is protected.
export function classifyLocalResult(result, integrity) {
  const counted = ['tests', 'passed', 'failed', 'skipped', 'todo'].every(k => Number.isInteger(result[k]));
  const reason = !integrity ? 'Tree changed during execution' : result.interrupted ? 'Interrupted' : result.truncated ? 'Output truncated'
    : !counted ? 'Test summary missing or ambiguous' : result.tests === 0 ? 'No tests executed' : null;
  if (reason) return { status: 'INCONCLUSIVE', reason };
  if (result.exitCode === 0 && result.passed === result.tests && result.failed === 0 && result.skipped === 0 && result.todo === 0) return { status: 'LOCAL_PASSED', reason: null };
  if (result.exitCode !== 0 && result.failed > 0) return { status: 'LOCAL_FAILED', reason: `${result.failed} of ${result.tests} tests failed` };
  return { status: 'INCONCLUSIVE', reason: 'Exit code and test summary disagree, or tests were skipped' };
}
export function localBackend() {
  const grants = new WeakMap(), running = new Map();
  return {
    id: 'local',
    async capabilities() { return { status: 'CONDITIONAL', isolationCapabilities: [],
      reason: 'Exact reviewed command and snapshot required; same-user execution, no security isolation or protected evidence' }; },
    // Trusted caller only. Tokens cannot be JSON supplied by Agent ingress.
    async authorize(request, { reviewedCommandHash, acknowledgeUnisolatedExecution } = {}) {
      const spec = await inspectLocalCommand(request);
      if (acknowledgeUnisolatedExecution !== true || reviewedCommandHash !== spec.commandHash) throw Error('Explicit trust of exact executable, arguments and snapshot required');
      const token = Object.freeze({});
      grants.set(token, { spec, used: false }); return token;
    },
    async prepare(request) {
      const grant = grants.get(request.token);
      if (!grant || grant.used) throw Error('Trusted local command grant absent or consumed');
      const current = await inspectLocalCommand(request);
      if (current.commandHash !== grant.spec.commandHash) throw Error('Reviewed local command or snapshot changed');
      return current;
    },
    async verify(request) {
      // Freeze caller-owned arguments/token before asynchronous inspection.
      request = { ...request, args: Array.isArray(request.args) ? [...request.args] : request.args };
      const spec = await this.prepare(request), grant = grants.get(request.token);
      if (grant.used || request.cancelled?.()) throw Error('Local verification cancelled or grant consumed');
      grant.used = true; // reserve before any subprocess, including concurrent callers
      const control = { cancelled: false }; running.set(request.token, control);
      try {
        const scratch = await mkdtemp(path.join(tmpdir(), 'codefleet-local-'));
        const env = { HOME: scratch, USERPROFILE: scratch, TMP: scratch, TEMP: scratch, TMPDIR: scratch,
          PATH: path.dirname(spec.executable), ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
        // Trusted embedding seam: final durable fence, after all asynchronous setup.
        // No Agent/CLI supplied callback is accepted by the backend.
        if (request.beforeSpawn) await request.beforeSpawn(spec);
        const result = parseTestResult(await command(spec.executable, spec.args, {
          cwd: spec.directory, env, timeoutMs: spec.timeoutMs,
          cancelled: () => control.cancelled || request.cancelled?.()
        }));
        let integrity = false;
        try { integrity = await localTree(spec.directory) === spec.candidateTreeHash; } catch {}
        return { ...result, authority: 'LOCAL_EXECUTED', executionAuthority: 'LOCAL_EXECUTED',
          verificationBackend: 'local', isolationCapabilities: [], verifierIndependence: 'UNPROTECTED',
          evidenceIntegrity: integrity ? 'MATCHED' : 'MISMATCH', integrity,
          contractHash: request.contractHash ?? null, candidateTreeHash: spec.candidateTreeHash,
          commandHash: spec.commandHash,
          requiredGateResults: { protectedVerification: 'UNSATISFIED', treeIntegrity: integrity ? 'SATISFIED' : 'UNSATISFIED' },
          ...classifyLocalResult(result, integrity), complete: false };
      } finally { running.delete(request.token); }
    },
    async cancel(token) { const r = running.get(token); if (r) r.cancelled = true; },
    async cleanup(token) { await this.cancel(token); }
  };
}
