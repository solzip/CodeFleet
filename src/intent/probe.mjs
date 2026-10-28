import { realpath, readdir, lstat } from 'node:fs/promises';
import { git } from '../alpha/workspace.mjs';
import { hash } from '../alpha/contract.mjs';
import { discover } from './discovery.mjs';

// Read-only classification of a target directory. It never runs `git init`,
// commits, or changes safe.directory; a refused Git command is reported as data.
export const REPOSITORY_STATES = Object.freeze(['UNBORN_HEAD', 'BOOTSTRAP_CANDIDATE', 'EXISTING_SOURCE', 'NOT_GIT', 'GIT_OWNERSHIP', 'GIT_ERROR']);
const CONTRACTS = Object.freeze({ UNBORN_HEAD: 'NEW_PROJECT', BOOTSTRAP_CANDIDATE: 'NEW_PROJECT', NOT_GIT: 'NEW_PROJECT', EXISTING_SOURCE: 'EXISTING_REPOSITORY', GIT_OWNERSHIP: null, GIT_ERROR: null });

export function classifyGitFailure(result) {
  const stderr = (Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '')) || String(result.error ?? '');
  // A sandbox that forbids child processes fails before Git runs; that is not a Git error.
  const kind = /spawn (\S+ )?(EPERM|EACCES)/.test(String(result.error ?? '')) ? 'PROCESS_SPAWN_DENIED'
    : /dubious ownership|safe\.directory/i.test(stderr) ? 'GIT_OWNERSHIP' : /not a git repository/i.test(stderr) ? 'NOT_GIT' : 'GIT_ERROR';
  // CodeFleet runs Git without global/system config (alpha/process.mjs environment),
  // so a user's global safe.directory entry is not read here either.
  const recovery = 'In Codex, request the Host command-specific execution approval for the exact CodeFleet CLI command, with explicit --state and repository/task scope. If unavailable or denied, remain BLOCKED. Inspect any recorded task before retrying; do not replay uncertain mutations. Host execution approval does not grant CodeFleet fileset approval, capabilities or verification.';
  const remedy = kind === 'GIT_OWNERSHIP' ? 'Git refused the current execution identity for this repository. A Host approval or sandbox selection does not establish matching ownership. Keep the repository and State intact; do not automatically escalate or retry. On Windows Codex, check official MXC compatibility once, then use the same explicitly selected, user-approved sandbox path for Native Probe, approval, materialization and verification. If MXC is unavailable, unelevated needs explicit consent to its weaker isolation; never silently fall back. Recheck current contract, candidate, capabilities, leases and existing effects before issuing fresh approval. Remain BLOCKED_ENVIRONMENT when no eligible path is available. CodeFleet ignores global and system Git config and never changes safe.directory.'
    : kind === 'PROCESS_SPAWN_DENIED' ? `This environment forbids starting child processes before Git runs. ${recovery}` : null;
  return { kind, exitCode: result.exitCode, interrupted: Boolean(result.interrupted), stderr: stderr.slice(-1000), remedy };
}
function finish(probe) {
  return { ...probe, contract: CONTRACTS[probe.state], authority: 'HOST_OBSERVED_REPOSITORY_STATE', codeObserved: false, probeHash: hash(probe) };
}
async function listing(root) {
  const entries = [];
  for (const name of (await readdir(root)).sort()) {
    if (entries.length >= 1500) throw Error('Directory listing exceeds bound');
    const stat = await lstat(`${root}/${name}`);
    entries.push([name, stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other']);
  }
  return entries;
}
export async function gitStatus(root) {
  const result = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cap: 512000 });
  if (result.exitCode !== 0 || result.interrupted || result.truncated) return { error: classifyGitFailure(result) };
  const entries = result.stdout.toString('utf8').split('\0').filter(Boolean).map(row => ({ code: row.slice(0, 2), path: row.slice(3) }));
  return { entries };
}

export async function probeRepository(repo) {
  const root = await realpath(repo);
  if (!(await lstat(root)).isDirectory()) throw Error('Repository probe requires a directory');
  const top = await git(root, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0 || top.interrupted) {
    const error = classifyGitFailure(top);
    if (error.kind !== 'NOT_GIT') return finish({ repositoryId: hash(root), root, state: error.kind === 'GIT_OWNERSHIP' ? 'GIT_OWNERSHIP' : 'GIT_ERROR', base: null, error });
    const entries = await listing(root);
    return finish({ repositoryId: hash(root), root, state: 'NOT_GIT', base: null, dirty: entries.length > 0, entries: entries.length, listingHash: hash(entries), error: null });
  }
  if (await realpath(top.stdout.toString('utf8').trim()) !== root) {
    return finish({ repositoryId: hash(root), root, state: 'GIT_ERROR', base: null, error: { kind: 'NOT_REPOSITORY_ROOT', exitCode: 0, interrupted: false, stderr: '' } });
  }
  const status = await gitStatus(root);
  if (status.error) return finish({ repositoryId: hash(root), root, state: status.error.kind === 'GIT_OWNERSHIP' ? 'GIT_OWNERSHIP' : 'GIT_ERROR', base: null, error: status.error });
  const observed = { repositoryId: hash(root), root, dirty: status.entries.length > 0, statusEntries: status.entries.length, statusHash: hash(status.entries), error: null };
  const head = await git(root, ['rev-parse', '--verify', '-q', 'HEAD']);
  if (head.exitCode !== 0) {
    const branch = await git(root, ['symbolic-ref', '-q', 'HEAD']);
    if (head.exitCode === 1 && branch.exitCode === 0) return finish({ ...observed, state: 'UNBORN_HEAD', base: null, branch: branch.stdout.toString('utf8').trim(), trackedFiles: 0, sourceCandidates: 0 });
    return finish({ ...observed, state: 'GIT_ERROR', base: null, error: classifyGitFailure(head) });
  }
  const base = head.stdout.toString('utf8').trim();
  if (!/^[a-f0-9]{40,64}$/.test(base)) return finish({ ...observed, state: 'GIT_ERROR', base: null, error: { kind: 'INVALID_BASELINE', exitCode: 0, interrupted: false, stderr: '' } });
  const tree = await git(root, ['ls-tree', '-rz', '--name-only', '--full-tree', base], { cap: 512000 });
  if (tree.exitCode !== 0 || tree.truncated) return finish({ ...observed, state: 'GIT_ERROR', base, error: classifyGitFailure(tree) });
  const trackedFiles = tree.stdout.toString('utf8').split('\0').filter(Boolean).length;
  if (!trackedFiles) return finish({ ...observed, state: 'BOOTSTRAP_CANDIDATE', base, trackedFiles, sourceCandidates: 0 });
  let discovery;
  try { discovery = await discover(root, ''); }
  catch (e) { return finish({ ...observed, state: 'GIT_ERROR', base, trackedFiles, error: { kind: 'DISCOVERY_FAILED', exitCode: 0, interrupted: false, stderr: e.message.slice(-1000) } }); }
  // Existing G3 only sees src/test candidates; anything else is bootstrap material.
  return finish({ ...observed, state: discovery.files.length ? 'EXISTING_SOURCE' : 'BOOTSTRAP_CANDIDATE', base, trackedFiles, sourceCandidates: discovery.files.length });
}
