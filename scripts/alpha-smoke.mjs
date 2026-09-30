// Opt-in real-service acceptance run. No provider credentials or raw context
// are printed. The disposable repository contains actual CodeFleet source.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { snapshot, git } from '../src/alpha/workspace.mjs';
import { requireSuccess } from '../src/alpha/process.mjs';
import { createRun, execute } from '../src/alpha/controller.mjs';
import { Store } from '../src/alpha/store.mjs';
if (!process.argv.includes('--real-provider')) throw Error('Explicit --real-provider required; this sends named source context to authenticated Claude');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(tmpdir(), 'codefleet-real-smoke-'));
const repo = path.join(temp, 'repository');
// The native Git call explicitly scopes safe.directory to the known source.
const { command } = await import('../src/alpha/process.mjs');
const base = requireSuccess(await command('git', ['-c', `safe.directory=${root}`, '-C', root, 'rev-parse', 'HEAD']), 'source revision');
// snapshot's git invocation does not override ownership. Copy through a normal
// clone owned by this process, with no checkout/filter execution.
const source = path.join(temp, 'source');
requireSuccess(await command('git', ['-c', `safe.directory=${root}`, 'clone', '--no-checkout', '--no-hardlinks', root, source]), 'clone source');
await snapshot(source, base, repo);
await writeFile(path.join(repo, 'test/alpha-regression.test.mjs'), `import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
test('apply --check reaches the planner without a mutation reason', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cf-preview-'));
  const cli = path.resolve('src/cli.ts');
  const init = spawnSync(process.execPath, [cli, '--workspace', dir, 'init'], {encoding:'utf8'});
  assert.equal(init.status, 0, init.stderr);
  const r = spawnSync(process.execPath, [cli, '--workspace', dir, 'apply', 'missing-run', '--check'], {encoding:'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /applicable: no/);
  assert.doesNotMatch(r.stderr, /Unknown option/);
});
`);
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=sol', '-c', 'user.email=solarchive.dev@gmail.com', 'commit', '-m', 'Controlled acceptance: current CodeFleet with failing apply preview regression']]) requireSuccess(await git(repo, args), 'prepare acceptance repository');
const contract = { schemaVersion: 1, goal: 'Fix apply --check so it reaches planApply without requiring --reason and without treating --check as an unknown review option. Preserve behavior for all other commands and flags.', files: ['src/cli.ts'], context: ['src/cli.ts'], tests: ['test/alpha-regression.test.mjs'], maxAttempts: 2, timeoutSeconds: 600, attemptBudgetUsd: 2, delivery: { mode: 'local' } };
const store = new Store(path.join(temp, 'state'));
try {
  const run = await createRun(store, repo, contract);
  console.log(JSON.stringify({ phase: 'created', runId: run.id, sourceCommit: base }));
  const result = await execute(store, run.id);
  console.log(JSON.stringify({ phase: 'result', runId: result.id, state: result.state, attempts: result.attempts, reason: result.reason, elapsedMs: result.elapsedMs, reportedCostUsd: result.reportedCostUsd, baseline: result.baselineHash ? store.readArtifact(result.baselineHash) : null, evidence: result.evidenceHash ? store.readArtifact(result.evidenceHash) : null, acceptedHash: result.acceptedHash, stateDirectory: path.join(temp, 'state') }, null, 2));
  if (result.state !== 'COMPLETED') process.exitCode = 1;
} finally { store.close(); }
