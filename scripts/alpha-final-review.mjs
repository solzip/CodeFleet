// Read-only review of product behavior using disposable state and mock remote API.
// No model calls, Docker execution, or remote writes.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/alpha/store.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { command } from '../src/alpha/process.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { deliver } from '../src/alpha/delivery.mjs';

const contract = { schemaVersion: 1, goal: 'Fix subtraction in the selected file.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 1, timeoutSeconds: 30, attemptBudgetUsd: 1, delivery: { mode: 'local' } };
const results = [];
const directory = await mkdtemp(path.join(tmpdir(), 'cf-final-review-'));
const store = new Store(directory);
try {
  store.create({ id: 'cancel-idle', repo: directory, base: 'a'.repeat(40), contract, contractHash: hash(contract), state: 'WAITING_HUMAN', attempts: 0, elapsedMs: 30000, reportedCostUsd: 0, unknownCostAttempts: 0 });
  const cli = fileURLToPath(new URL('../src/alpha/cli.mjs', import.meta.url));
  const cancel = await command(process.execPath, [cli, '--state', directory, 'cancel', 'cancel-idle']);
  const afterCancel = store.get('cancel-idle');
  const resume = await command(process.execPath, [cli, '--state', directory, 'resume', 'cancel-idle']);
  const afterResume = store.get('cancel-idle');
  results.push({ case: 'idle-cancel-can-be-resumed', cancelExit: cancel.exitCode, resumeExit: resume.exitCode, afterCancel: { state: afterCancel.state, control: afterCancel.control }, afterResume: { state: afterResume.state, control: afterResume.control, reason: afterResume.reason }, defectReproduced: cancel.exitCode === 0 && afterCancel.control === 'cancel' && afterResume.control === 'run' });

  store.create({ id: 'active-cancel', repo: directory, base: 'a'.repeat(40), contract, contractHash: hash(contract), state: 'GENERATING', attempts: 1, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 1 });
  const owner = store.claim('active-cancel');
  await command(process.execPath, [cli, '--state', directory, 'cancel', 'active-cancel']);
  const rejected = await command(process.execPath, [cli, '--state', directory, 'resume', 'active-cancel']);
  const active = store.get('active-cancel');
  results.push({ case: 'rejected-resume-revokes-active-cancellation', resumeExit: rejected.exitCode, error: rejected.stderr.toString().split('\n').find(line => line.includes('active worker')), control: active.control, defectReproduced: rejected.exitCode === 1 && active.control === 'run' });
  store.release('active-cancel', owner);

  const deliveryContract = { ...contract, delivery: { mode: 'pull-request', repository: 'owner/repo', base: 'main', authorName: 'public', authorEmail: 'public@example.invalid' } };
  const candidateHash = hash('candidate');
  const evidenceHash = store.artifact({ candidateHash, integrity: true, testIdentityMatch: true, exitCode: 0, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0 });
  const acceptedHash = store.artifact({ candidateHash, changedFiles: { 'src/math.js': 'correct' } });
  const run = store.create({ id: 'expired-delivery', repo: directory, base: 'a'.repeat(40), contract: deliveryContract, contractHash: hash(deliveryContract), candidateHash, evidenceHash, acceptedHash, state: 'RECONCILING', attempts: 1, elapsedMs: 30000, reportedCostUsd: 0.1, unknownCostAttempts: 0 });
  let remoteLookups = 0;
  const result = await execute(store, run.id, { deliver: async () => { remoteLookups++; return { url: 'https://example.invalid/already-created-pr' }; } });
  results.push({ case: 'expired-budget-prevents-remote-reconciliation', state: result.state, reason: result.reason, remoteLookups, defectReproduced: result.state === 'RECONCILING' && remoteLookups === 0 && /budget exhausted/.test(result.reason) });
} finally { store.close(); }

let requests = [];
const run = { id: 'already-delivered', base: 'original-base', contract: { delivery: { repository: 'owner/repo', base: 'main' } } };
try {
  await deliver(run, { 'src/math.js': 'correct source' }, async endpoint => {
    requests.push(endpoint);
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: 'advanced-base' } };
    throw Error('Reconciliation branch lookup reached');
  });
} catch (e) {
  results.push({ case: 'base-drift-prevents-existing-pr-lookup', reason: e.message, requests, defectReproduced: requests.length === 1 && /Remote base changed/.test(e.message) });
}
console.log(JSON.stringify({ results }, null, 2));
process.exitCode = results.some(r => r.defectReproduced) ? 2 : 0;
