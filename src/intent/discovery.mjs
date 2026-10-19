import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { git } from '../alpha/workspace.mjs';
import { requireSuccess } from '../alpha/process.mjs';
import { filePath, hash } from '../alpha/contract.mjs';

// Observe immutable Git objects, never execute repository scripts or follow links.
export async function discover(repo, objective) {
  const root = await realpath(repo);
  const top = requireSuccess(await git(root, ['rev-parse', '--show-toplevel']), 'Repository');
  if (await realpath(top) !== root) throw Error('Select the repository root');
  const base = requireSuccess(await git(root, ['rev-parse', 'HEAD']), 'Baseline');
  if (!/^[a-f0-9]{40,64}$/.test(base)) throw Error('Invalid baseline');
  const dirty = Boolean(requireSuccess(await git(root, ['status', '--porcelain', '--untracked-files=normal']), 'Status'));
  const tree = requireSuccess(await git(root, ['ls-tree', '-rz', '--full-tree', base], { cap: 512000 }), 'Tree');
  const rows = tree.split('\0').filter(Boolean);
  if (!rows.length || rows.length > 1500) throw Error('Discovery requires 1..1500 tracked files');
  const files = [], excluded = [];
  for (const row of rows) {
    const [meta, name] = row.split('\t'); const [mode, type, oid] = meta.split(' ');
    if (!['100644', '100755'].includes(mode) || type !== 'blob') { excluded.push(`Unsupported entry: ${name}`); continue; }
    if (!/^(src|test|tests)\//.test(name) || !/\.(js|mjs|cjs|ts|java)$/.test(name)) continue;
    try { filePath(name); } catch { excluded.push('Non-portable or hidden candidate path'); continue; }
    files.push({ path: name, oid, kind: /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./i.test(name) ? 'test' : 'source' });
  }
  if (new Set(files.map(f => f.path.toLowerCase())).size !== files.length) throw Error('Case-colliding paths');
  const words = objective.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(w => w.length > 2);
  for (const f of files) f.relevance = words.filter(w => f.path.toLowerCase().includes(w)).length;
  files.sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path, 'en'));
  return { repositoryId: hash(root), base, dirty, files, excluded, scanned: rows.length, contentRead: false };
}
