import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { context } from '../src/alpha/workspace.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'codefleet-context-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate');
  await mkdir(candidate);
  return { root, candidate };
}

test('context reads approved regular source and test files', async t => {
  const { candidate } = await fixture(t);
  await mkdir(join(candidate, 'src'));
  await writeFile(join(candidate, 'src', 'a.js'), 'export const a = 1;');
  await writeFile(join(candidate, '.gitattributes'), '* text=auto');
  const result = await context(candidate, {
    context: ['src/a.js', '.gitattributes'], tests: ['src/a.js']
  });
  assert.deepEqual(result, {
    'src/a.js': 'export const a = 1;',
    '.gitattributes': '* text=auto'
  });
});

test('context refuses traversal even when an outside file is readable', async t => {
  const { root, candidate } = await fixture(t);
  await writeFile(join(root, 'outside.js'), 'unapproved secret');
  await assert.rejects(context(candidate, { context: ['../outside.js'], tests: [] }),
    /Unsafe tracked Candidate path/);
});

test('context refuses regular files reached through symlinked parent directories', async t => {
  const { root, candidate } = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'secret.js'), 'same bytes as an ordinary file');
  try {
    await symlink(outside, join(candidate, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      t.skip('Symlinks not supported by this runner');
      return;
    }
    throw error;
  }
  await assert.rejects(context(candidate, { context: ['src/secret.js'], tests: [] }),
    /symlink or nonregular/);
});

test('context refuses a symlinked Candidate root before reading files', async t => {
  const { root, candidate } = await fixture(t);
  await writeFile(join(candidate, 'a.js'), 'approved');
  const linkedRoot = join(root, 'linked-root');
  try {
    await symlink(candidate, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      t.skip('Symlinks not supported by this runner');
      return;
    }
    throw error;
  }
  await assert.rejects(context(linkedRoot, { context: ['a.js'], tests: [] }),
    /root must be a real directory/);
});

// A link in the path ABOVE the Candidate root is not caught by lstat(root).
// The final Candidate directory and all source leaves are ordinary files.
test('context refuses an ordinary Candidate reached via a symlinked ancestor', async t => {
  const { root, candidate } = await fixture(t);
  await writeFile(join(candidate, 'a.js'), 'outside approved root traversal');
  const linkedParent = join(root, 'linked-parent');
  try {
    await symlink(root, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      t.skip('Symlinks not supported by this runner');
      return;
    }
    throw error;
  }
  await assert.rejects(context(join(linkedParent, 'candidate'), {
    context: ['a.js'], tests: []
  }), /Candidate tree ancestor is a symlink/);
});

// A hard link does not set isSymbolicLink(), but reads the same inode as a
// file outside the approved Host context. Refuse it before reading bytes.
test('context rejects hard-linked outside files and case-folded aliases', async t => {
  const { root, candidate } = await fixture(t);
  await mkdir(join(candidate, 'src'));
  await writeFile(join(root, 'external.js'), 'unapproved outside bytes');
  await writeFile(join(candidate, 'src', 'ok.js'), 'approved bytes');
  await assert.rejects(context(candidate, {
    context: ['src/ok.js', 'SRC/OK.js'], tests: []
  }), /bounded, unique paths/);
  try { await link(join(root, 'external.js'), join(candidate, 'src', 'linked.js')); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error.code)) {
      t.skip('Hard links not supported by this runner'); return;
    }
    throw error;
  }
  await assert.rejects(context(candidate, { context: ['src/linked.js'], tests: [] }),
    /hard link or nonregular/);
});
