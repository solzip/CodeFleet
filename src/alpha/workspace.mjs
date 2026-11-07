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
  const names = [...new Set([...contract.context, ...contract.tests])];
  // The context manifest feeds an autonomous Host Turn. A regular leaf alone
  // does not prove its parent directories stay within this candidate: readFile
  // follows symlinked parents. Enforce the same portable regular-file boundary
  // used by the Candidate and delivered-tree observers before consuming bytes.
  if (names.length) await candidateHash(directory, names);
  const files = {}; let bytes = 0;
  for (const name of names) {
    const stat = await lstat(path.join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Context must be regular files');
    const body = await readFile(path.join(directory, name), 'utf8'); bytes += Buffer.byteLength(body);
    if (body.includes('\0') || bytes > 160000) throw Error('Context must be text, at most 160 KB');
    files[name] = body;
  }
  return files;
}
export async function candidateHash(directory, names) {
  if (!path.isAbsolute(directory ?? '') || !Array.isArray(names) ||
      !names.length || names.length > 1500 ||
      new Set(names).size !== names.length ||
      // On case-insensitive filesystems these names may alias the same file.
      new Set(names.map(name => typeof name === 'string' ? name.toLowerCase() : name)).size !== names.length)
    throw Error('Candidate tree requires bounded, unique paths and an absolute root');
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw Error('Candidate tree root must be a real directory');
  // A real leaf directory is not enough: an intermediate junction or symlink
  // redirects reads outside the approved Candidate / delivered repository.
  // Walk every ancestor without resolving links and fail closed before I/O.
  const absolute = path.resolve(directory);
  let ancestor = path.parse(absolute).root;
  const components = path.relative(ancestor, absolute).split(path.sep).filter(Boolean);
  for (const component of components.slice(0, -1)) {
    ancestor = path.join(ancestor, component);
    const stat = await lstat(ancestor);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error('Candidate tree ancestor is a symlink or non-directory');
  }
  const rows = [];
  for (const name of [...names].sort()) {
    // Byte equality alone is not a safe observation: readFile follows links.
    // Recheck every path component before reading, including unchanged files
    // that were present in the delivered tree but not written by delivery.
    // Snapshot paths may legitimately include .gitattributes, .gitignore
    // and .github; source-contract filePath() is too restrictive here.
    // Match snapshot's portable tracked-file boundaries instead.
    const parts = typeof name === 'string' ? name.split('/') : [];
    if (typeof name !== 'string' || !name || name.startsWith('/') ||
        /[\\:\u0000-\u001f\u007f]/.test(name) ||
        parts.some(part => !part || part === '.' || part === '..' ||
          /[. ]$/.test(part) || part.toLowerCase() === '.git' ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])([.]|$)/i.test(part)))
      throw Error('Unsafe tracked Candidate path: ' + String(name));
    let current = directory;
    let executable = false;
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      const stat = await lstat(current);
      if (stat.isSymbolicLink() ||
          (index === parts.length - 1
            ? !stat.isFile() || stat.nlink !== 1
            : !stat.isDirectory()))
        // Hard links are regular files but alias the bytes of an unapproved
        // outside path, so content equality alone is not a safe boundary.
        throw Error('Candidate tree contains a symlink or nonregular path (including hard link): ' + name);
      if (index === parts.length - 1)
        executable = (stat.mode & 0o111) !== 0;
    }
    // Executable files change behavior without changing bytes. Git preserves
    // executable versus regular file mode; pin that distinction in Candidate
    // and delivered-tree hashes instead of accepting same-byte mode drift.
    rows.push([name, hash(await readFile(current)), executable ? '100755' : '100644']);
  }
  return hash(rows);
}
