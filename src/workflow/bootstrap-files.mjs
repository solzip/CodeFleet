import { lstat, mkdir, readFile, realpath, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { filePath, hash } from '../alpha/contract.mjs';
import { exact } from '../intent/contract.mjs';
import { BOOTSTRAP_LIMITS } from '../intent/bootstrap.mjs';

// The one write operation NEW_PROJECT adds: create planned files that do not exist.
// It is not applyEdits: there is no original to match, and it never replaces a file.
// Contents arrive as a Host proposal (PROVIDER_REPORTED_ONLY); the approval binds
// every path and content digest, and results record only what this process wrote.
export const FILESET_LIMITS = Object.freeze({ files: BOOTSTRAP_LIMITS.files, bytes: 64000 });

export function validateFileset(input, workflow, itemId) {
  exact(input, ['revision', 'itemId', 'files'], 'Bootstrap fileset');
  if (input.itemId !== itemId) throw Error('Fileset WorkItem mismatch');
  const item = workflow.items.find(n => n.id === itemId);
  if (!item || item.kind !== 'local-edit') throw Error('Filesets are accepted only for local-edit WorkItems');
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > FILESET_LIMITS.files) throw Error(`Fileset requires 1..${FILESET_LIMITS.files} files`);
  const files = input.files.map(f => {
    exact(f, ['path', 'content'], 'fileset entry'); filePath(f.path);
    if (typeof f.content !== 'string' || f.content.includes('\0') || Buffer.byteLength(f.content) > FILESET_LIMITS.bytes) throw Error(`Content must be text of at most ${FILESET_LIMITS.bytes} bytes: ${f.path}`);
    return { path: f.path, content: f.content, sha256: hash(f.content), bytes: Buffer.byteLength(f.content) };
  }).sort((a, b) => a.path < b.path ? -1 : 1);
  const paths = files.map(f => f.path);
  if (new Set(paths.map(p => p.toLowerCase())).size !== paths.length) throw Error('Duplicate fileset paths');
  if (paths.length !== item.files.length || item.files.some(f => !paths.includes(f))) throw Error('Fileset must contain exactly the WorkItem planned files');
  return files;
}
export function filesetManifest(binding, files) {
  const manifest = { kind: 'BootstrapFileset', ...binding, files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })) };
  return { manifest, filesetHash: hash(manifest) };
}
// A repair replaces files a materialized item already owns. Each entry names the
// digest it was written against; it must equal what CodeFleet last recorded, so a
// proposal cannot target a file version CodeFleet never wrote or observed.
export function validateRepairFileset(input, workflow, itemId, recorded) {
  exact(input, ['revision', 'itemId', 'repair', 'files'], 'Bootstrap repair fileset');
  exact(input.repair, ['verificationItem', 'evidenceRef'], 'repair binding');
  if (input.itemId !== itemId) throw Error('Fileset WorkItem mismatch');
  const item = workflow.items.find(n => n.id === itemId);
  if (!item || item.kind !== 'local-edit') throw Error('Filesets are accepted only for local-edit WorkItems');
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > item.files.length) throw Error(`Repair requires 1..${item.files.length} of the WorkItem's files`);
  const files = input.files.map(f => {
    exact(f, ['path', 'content', 'baseSha256'], 'repair entry'); filePath(f.path);
    if (!item.files.includes(f.path)) throw Error(`Repair path not owned by ${itemId}: ${f.path}`);
    if (typeof f.content !== 'string' || f.content.includes('\0') || Buffer.byteLength(f.content) > FILESET_LIMITS.bytes) throw Error(`Content must be text of at most ${FILESET_LIMITS.bytes} bytes: ${f.path}`);
    if (typeof f.baseSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.baseSha256)) throw Error(`baseSha256 required: ${f.path}`);
    if (recorded[f.path] !== f.baseSha256) throw Error(`Base digest differs from the digest CodeFleet recorded: ${f.path}`);
    const sha256 = hash(f.content);
    if (sha256 === f.baseSha256) throw Error(`Repair does not change ${f.path}`);
    return { path: f.path, content: f.content, sha256, bytes: Buffer.byteLength(f.content), baseSha256: f.baseSha256 };
  }).sort((a, b) => a.path < b.path ? -1 : 1);
  if (new Set(files.map(f => f.path.toLowerCase())).size !== files.length) throw Error('Duplicate fileset paths');
  return files;
}
export function repairManifest(binding, files) {
  const manifest = { kind: 'BootstrapRepairFileset', ...binding, files: files.map(({ path, baseSha256, sha256, bytes }) => ({ path, operation: 'modify', baseSha256, sha256, bytes })) };
  return { manifest, filesetHash: hash(manifest) };
}

// Resolve a planned path inside root without following links. Missing parent
// directories are reported, not created, so a preflight has no side effects.
async function locate(root, relative) {
  const parts = relative.split('/'), missing = [];
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (missing.length) { missing.push(current); continue; }
    try {
      const s = await lstat(current);
      if (s.isSymbolicLink() || !s.isDirectory()) return { blocked: `Parent is not a plain directory: ${relative}` };
      if (await realpath(current) !== current) return { blocked: `Parent resolves elsewhere: ${relative}` };
    } catch (e) { if (e.code !== 'ENOENT') throw e; missing.push(current); }
  }
  return { target: path.join(root, ...parts), missing };
}
async function present(target, sha256) {
  try {
    const s = await lstat(target);
    if (!s.isFile() || s.isSymbolicLink()) return 'CONFLICT';
    return hash(await readFile(target, 'utf8')) === sha256 ? 'ALREADY_CREATED' : 'CONFLICT';
  } catch (e) { if (e.code === 'ENOENT') return 'ABSENT'; throw e; }
}
export async function preflightFiles(root, files) {
  const realRoot = await realpath(root);
  if (realRoot !== path.resolve(root)) throw Error('Workspace root must be its own real path');
  const results = [];
  for (const f of files) {
    const place = await locate(realRoot, f.path);
    if (place.blocked) { results.push({ path: f.path, status: 'CONFLICT', reason: place.blocked }); continue; }
    const status = place.missing.length ? 'ABSENT' : await present(place.target, f.sha256);
    results.push({ path: f.path, status, ...(status === 'CONFLICT' ? { reason: 'Existing file differs; overwrite refused' } : {}) });
  }
  return results;
}
// Writes only after a clean preflight. `wx` makes creation exclusive, so a file
// appearing between preflight and write is a CONFLICT, never an overwrite.
export async function createFiles(root, files, { cancelled = () => false, record = () => {} } = {}) {
  const realRoot = await realpath(root), preflight = await preflightFiles(realRoot, files);
  if (preflight.some(r => r.status === 'CONFLICT')) return { status: 'CONFLICT', written: false, results: preflight };
  const results = [];
  for (const f of files) {
    const prior = preflight.find(r => r.path === f.path);
    if (prior.status === 'ALREADY_CREATED') { results.push({ path: f.path, status: 'ALREADY_CREATED', sha256: f.sha256, bytes: f.bytes }); record(results.at(-1)); continue; }
    if (cancelled()) { results.push({ path: f.path, status: 'NOT_RUN', reason: 'Cancelled before write' }); continue; }
    let result;
    try {
      const place = await locate(realRoot, f.path);
      if (place.blocked) throw Object.assign(Error(place.blocked), { code: 'EBLOCKED' });
      for (const dir of place.missing) {
        await mkdir(dir).catch(e => { if (e.code !== 'EEXIST') throw e; });
        const s = await lstat(dir);
        if (s.isSymbolicLink() || !s.isDirectory() || await realpath(dir) !== dir) throw Object.assign(Error(`Parent changed during creation: ${f.path}`), { code: 'EBLOCKED' });
      }
      await writeFile(place.target, f.content, { flag: 'wx' });
      const observed = hash(await readFile(place.target, 'utf8'));
      result = observed === f.sha256 ? { path: f.path, status: 'CREATED', sha256: observed, bytes: f.bytes } : { path: f.path, status: 'FAILED', reason: 'Read-back digest mismatch', sha256: observed };
    } catch (e) {
      result = { path: f.path, status: ['EEXIST', 'EBLOCKED'].includes(e.code) ? 'CONFLICT' : 'FAILED', reason: e.message };
    }
    results.push(result); record(result);
  }
  const status = results.every(r => ['CREATED', 'ALREADY_CREATED'].includes(r.status)) ? 'MATERIALIZED' : results.some(r => r.status === 'CONFLICT') ? 'CONFLICT' : results.some(r => r.status === 'NOT_RUN') ? 'INTERRUPTED' : 'FAILED';
  return { status, written: results.some(r => r.status === 'CREATED'), results };
}

// Replace existing owned files. Every file is checked before any write: the disk
// digest must still be the approved base (or already the approved result, after an
// interrupted attempt), otherwise the whole repair is a CONFLICT and nothing is
// written. Each write goes to a sibling temporary file, the base is re-read just
// before the rename, and the result is read back.
async function observe(root, f) {
  const place = await locate(root, f.path);
  if (place.blocked || place.missing.length) return { status: 'CONFLICT', reason: place.blocked ?? `Parent missing: ${f.path}` };
  try {
    const s = await lstat(place.target);
    if (!s.isFile() || s.isSymbolicLink()) return { status: 'CONFLICT', reason: 'Target is not a regular file' };
  } catch (e) { if (e.code === 'ENOENT') return { status: 'CONFLICT', reason: 'Owned file is missing' }; throw e; }
  const disk = hash(await readFile(place.target, 'utf8'));
  return { target: place.target, disk, status: disk === f.baseSha256 ? 'PENDING' : disk === f.sha256 ? 'ALREADY_MODIFIED' : 'CONFLICT',
    ...(disk !== f.baseSha256 && disk !== f.sha256 ? { reason: 'File changed outside CodeFleet; overwrite refused' } : {}) };
}
export async function modifyFiles(root, files, { cancelled = () => false, record = () => {} } = {}) {
  const realRoot = await realpath(root);
  if (realRoot !== path.resolve(root)) throw Error('Workspace root must be its own real path');
  const preflight = [];
  for (const f of files) preflight.push({ path: f.path, ...(await observe(realRoot, f)) });
  if (preflight.some(r => r.status === 'CONFLICT')) return { status: 'CONFLICT', written: false, results: preflight.map(({ target, ...r }) => r) };
  const results = [];
  for (const f of files) {
    const prior = preflight.find(r => r.path === f.path);
    if (prior.status === 'ALREADY_MODIFIED') { results.push({ path: f.path, status: 'ALREADY_MODIFIED', baseSha256: f.baseSha256, sha256: f.sha256, bytes: f.bytes }); record(results.at(-1)); continue; }
    if (cancelled()) { results.push({ path: f.path, status: 'NOT_RUN', reason: 'Cancelled before write' }); continue; }
    const temp = `${prior.target}.codefleet-${randomUUID()}.tmp`;
    let result;
    try {
      await writeFile(temp, f.content, { flag: 'wx' });
      const again = await observe(realRoot, f);
      if (again.status !== 'PENDING') { await unlink(temp); result = { path: f.path, status: 'CONFLICT', reason: again.reason ?? 'File changed during repair' }; }
      else {
        await rename(temp, prior.target);
        const observed = hash(await readFile(prior.target, 'utf8'));
        result = observed === f.sha256 ? { path: f.path, status: 'MODIFIED', baseSha256: f.baseSha256, sha256: observed, bytes: f.bytes } : { path: f.path, status: 'FAILED', reason: 'Read-back digest mismatch', sha256: observed };
      }
    } catch (e) {
      await unlink(temp).catch(() => {});
      result = { path: f.path, status: 'FAILED', reason: e.message };
    }
    results.push(result); record(result);
  }
  const status = results.every(r => ['MODIFIED', 'ALREADY_MODIFIED'].includes(r.status)) ? 'MATERIALIZED' : results.some(r => r.status === 'CONFLICT') ? 'CONFLICT' : results.some(r => r.status === 'NOT_RUN') ? 'INTERRUPTED' : 'FAILED';
  return { status, written: results.some(r => r.status === 'MODIFIED'), results };
}
