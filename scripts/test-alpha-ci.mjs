// Preserve the complete Alpha list. Keep H6's bounded pressure fixture exclusive;
// ordering alone cannot isolate RLIMIT_NPROC from a hosted runner's UID tasks.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

if (process.platform === 'linux') {
  // Numeric resource metadata only: no process names, argv, environment or auth.
  const uids = [...new Set([1001, 61001, process.getuid()])];
  const counts = Object.fromEntries(uids.map(uid => [uid, { processes: 0, threads: 0 }]));
  let inspected = 0, unreadable = 0;
  for (const pid of (await readdir('/proc')).filter(name => /^\d+$/.test(name))) {
    try {
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      const uid = Number(status.match(/^Uid:\s+(\d+)/m)?.[1]);
      if (counts[uid]) { counts[uid].processes++; counts[uid].threads += Number(status.match(/^Threads:\s+(\d+)/m)?.[1]); }
      inspected++;
    } catch (error) {
      if (!['ENOENT', 'EACCES', 'ESRCH'].includes(error.code)) throw error;
      unreadable++;
    }
  }
  const limits = await readFile('/proc/self/limits', 'utf8');
  console.log('H6 host resource observation: ' + JSON.stringify({ uid: process.getuid(), counts, inspected, unreadable,
    nproc: limits.split('\n').find(line => line.startsWith('Max processes')),
    scope: 'visible process snapshot; not an atomic kernel UID accounting query' }));
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const words = pkg.scripts['test:alpha'].split(/\s+/);
assert.deepEqual(words.splice(0, 2), ['node', '--test'], 'Review changed Alpha command before CI execution');
assert.ok(words.length > 0);
assert.equal(new Set(words).size, words.length, 'Duplicate Alpha test files');
for (const file of words) assert.match(file, /^test\/[a-z0-9-]+\.test\.mjs$/);
const first = 'test/host-planning.test.mjs';
assert.ok(words.includes(first), 'Mandatory H6 file missing');
for (const files of [[first], words.filter(file => file !== first)]) {
  assert.ok(files.length > 0);
  console.log('Alpha CI files: ' + JSON.stringify(files));
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
    stdio: 'inherit', env: process.env, windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
