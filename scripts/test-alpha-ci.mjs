// Preserve the package's complete Alpha test list. Run the fixed-UID H6
// process-limit probe before other UID/IPC fixtures consume kernel resources.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

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
