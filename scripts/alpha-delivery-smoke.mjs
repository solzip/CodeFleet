// Explicit opt-in remote acceptance. Creates only a dedicated acceptance branch
// and a draft PR; never modifies main or merges anything.
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command, environment, requireSuccess } from '../src/alpha/process.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { createRun, execute } from '../src/alpha/controller.mjs';
import { Store } from '../src/alpha/store.mjs';
import { deliver } from '../src/alpha/delivery.mjs';
if (!process.argv.includes('--remote-acceptance')) throw Error('--remote-acceptance required');
const repository = 'solzip/CodeFleet';
const baseBranch = 'alpha/acceptance-baseline';
async function api(endpoint, method = 'GET', body) {
  const args = ['api', endpoint, '--method', method]; if (body !== undefined) args.push('--input', '-');
  const r = await command('gh', args, { env: environment('delivery'), input: body === undefined ? '' : JSON.stringify(body) });
  if (r.exitCode !== 0) { const e = Error(r.stderr.toString('utf8')); e.notFound = /HTTP 404/.test(e.message); throw e; }
  return JSON.parse(requireSuccess(r, 'acceptance API'));
}
const root = `repos/${repository}`;
let baseline;
try { baseline = (await api(`${root}/git/ref/heads/${baseBranch}`)).object.sha; }
catch (e) {
  if (!e.notFound) throw e;
  const main = (await api(`${root}/git/ref/heads/main`)).object.sha;
  const commit = await api(`${root}/git/commits/${main}`);
  const tree = await api(`${root}/git/trees`, 'POST', { base_tree: commit.tree.sha, tree: [
    { path: 'src/alpha-sample.js', mode: '100644', type: 'blob', content: 'export function subtract(a, b) { return a + b; }\n' },
    { path: 'test/alpha-sample.test.js', mode: '100644', type: 'blob', content: "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { subtract } from '../src/alpha-sample.js';\ntest('subtract handles positive and negative results', () => { assert.equal(subtract(5,3),2); assert.equal(subtract(0,4),-4); });\n" }
  ] });
  const created = await api(`${root}/git/commits`, 'POST', { message: 'test: isolated alpha delivery acceptance baseline (intentionally failing)', tree: tree.sha, parents: [main], author: { name: 'sol', email: 'solarchive.dev@gmail.com' }, committer: { name: 'sol', email: 'solarchive.dev@gmail.com' } });
  await api(`${root}/git/refs`, 'POST', { ref: `refs/heads/${baseBranch}`, sha: created.sha }); baseline = created.sha;
}
const temp = await mkdtemp(path.join(tmpdir(), 'codefleet-delivery-smoke-')); const repo = path.join(temp, 'repo');
requireSuccess(await command('git', ['clone', '--single-branch', '--branch', baseBranch, `https://github.com/${repository}.git`, repo], { timeoutMs: 120000 }), 'clone acceptance branch');
const contract = { schemaVersion: 1, goal: 'Fix subtract(a, b) to return a minus b including negative results. Keep the exported function signature.', files: ['src/alpha-sample.js'], context: ['src/alpha-sample.js'], tests: ['test/alpha-sample.test.js'], maxAttempts: 2, timeoutSeconds: 600, attemptBudgetUsd: 1, delivery: { mode: 'pull-request', repository, base: baseBranch, authorName: 'sol', authorEmail: 'solarchive.dev@gmail.com' } };
const store = new Store(path.join(temp, 'state'));
try {
  const run = await createRun(store, repo, contract); console.log(JSON.stringify({ phase: 'created', runId: run.id, base: baseline }));
  const result = await execute(store, run.id);
  let reconciliation;
  if (result.state === 'COMPLETED') reconciliation = await deliver(result, store.readArtifact(result.acceptedHash).changedFiles);
  console.log(JSON.stringify({ phase: 'result', runId: result.id, state: result.state, reason: result.reason, attempts: result.attempts, delivery: result.delivery, reconciliation, reportedCostUsd: result.reportedCostUsd }, null, 2));
  if (result.state !== 'COMPLETED') process.exitCode = 1;
} finally { store.close(); }
