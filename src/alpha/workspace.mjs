import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { command, requireSuccess } from './process.mjs';
import { hash } from './contract.mjs';

export async function git(repo, args, options = {}) {
  return command('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.autocrlf=false', '-c', 'commit.gpgSign=false', '-C', repo, ...args], options);
}
export async function repository(repo) {
  const root = requireSuccess(await git(repo, ['rev-parse', '--show-toplevel']), 'Git repository');
  const status = requireSuccess(await git(repo, ['status', '--porcelain', '--untracked-files=normal']), 'Git status');
  if (status) throw Error('Commit or remove pending changes before delegating a task');
  const base = requireSuccess(await git(repo, ['rev-parse', 'HEAD']), 'Git HEAD');
  return { repo: path.resolve(root), base };
}
export async function snapshot(repo, base, target) {
  if (!/^[a-f0-9]{40,64}$/.test(base)) throw Error('Invalid base commit');
  const listing = requireSuccess(await git(repo, ['ls-tree', '-rz', '--full-tree', base]), 'Git tree');
  const entries = listing.split('\0').filter(Boolean).map(line => {
    const separator = line.indexOf('\t'); const meta = line.slice(0, separator); const name = line.slice(separator + 1); const [mode, type, object] = meta.split(' ');
    if (separator < 0 || !['100644', '100755'].includes(mode) || type !== 'blob' || !name || name.startsWith('/') || /[\\:\u0000-\u001f\u007f]/.test(name) || name.split('/').some(p => !p || p === '..' || p === '.' || /[. ]$/.test(p) || p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) throw Error('Alpha requires regular portable tracked files without submodules or symlinks');
    return { name, object, mode };
  });
  if (!entries.length || entries.length > 1500 || new Set(entries.map(e => e.name.toLowerCase())).size !== entries.length) throw Error('Unsupported tree size or case-colliding paths');
  await mkdir(target, { recursive: true }); let bytes = 0;
  for (const entry of entries) {
    const r = await git(repo, ['cat-file', 'blob', entry.object], { cap: 8 * 1024 * 1024 });
    requireSuccess(r, 'Read tracked file'); bytes += r.stdout.length;
    if (bytes > 32 * 1024 * 1024) throw Error('Alpha snapshot exceeds 32 MiB');
    const dest = path.join(target, entry.name); await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, r.stdout, { mode: entry.mode === '100755' ? 0o755 : 0o644 });
  }
  return entries.map(e => e.name);
}
export async function context(directory, contract) {
  const files = {}; let bytes = 0;
  for (const name of new Set([...contract.context, ...contract.tests])) {
    const stat = await lstat(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Context must be regular files');
    const body = await readFile(path.join(directory, name), 'utf8'); bytes += Buffer.byteLength(body);
    if (body.includes('\0') || bytes > 160000) throw Error('Context must be text, at most 160 KB');
    files[name] = body;
  }
  return files;
}
export async function candidateHash(directory, names) {
  const rows = [];
  for (const name of [...names].sort()) rows.push([name, hash(await readFile(path.join(directory, name)))]);
  return hash(rows);
}
