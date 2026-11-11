import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { beginPlanning, submitPlanning } from '../src/hosts/planning.mjs';
import { installHost } from '../src/hosts/install.mjs';

// Integration of the actual installed runtime and independent CLI processes.
// A synthetic validated Host Planning result is NOT a Codex Host Live turn.
test('installed Codex Skill resumes reviewed Goal -> pending Workflow without granting execution', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cf-installed-goal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  await mkdir(join(repo, 'src'), { recursive: true });
  await mkdir(join(repo, 'test'));
  const source = 'export function add(x,y){ return x+y; }\n';
  await writeFile(join(repo, 'src/a.js'), source);
  await writeFile(join(repo, 'test/a.test.js'), 'import test from "node:test";\n');
  for (const args of [['init'], ['add', '.'],
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-m', 'baseline']]) {
    const result = await git(repo, args);
    assert.equal(result.exitCode, 0, result.stderr.toString());
  }

  const state = join(root, 'state');
  let store = new Store(state);
  t.after(() => store?.close());
  const goal = 'Repair arithmetic behavior in src/a.js with test/a.test.js and independently verify results.';
  const request = await beginPlanning(store, repo, goal, { host: 'codex', version: '0.166.0' });
  const draft = {
    schemaVersion: 2, objective: goal, base: request.context.discovery.base,
    files: ['src/a.js'], tests: ['test/a.test.js'],
    criteria: [{ description: 'Arithmetic regression passes',
      method: 'protected-tests', tests: ['test/a.test.js'] }],
    risks: [], unknowns: [], effects: ['local-edit']
  };
  const submitted = submitPlanning(store, JSON.stringify({
    sessionId: request.sessionId, requestHash: request.requestHash,
    proposal: { draft, references: [
      { path: 'src/a.js', line: 1, quote: 'export function' },
      { path: 'test/a.test.js', line: 1, quote: 'import test' }
    ], inferences: [] }
  }), {
    contextHash: request.contextHash,
    profileHash: request.profileHash, skillHash: request.skillHash
  });
  assert.equal(submitted.status, 'VALIDATED');
  const originalRow = store.db.prepare(
    'SELECT body,digest,status,resultHash FROM host_planning WHERE id=?'
  ).get(request.sessionId);
  store.close();
  store = null;

  await installHost(root, 'codex');
  const cli = join(root, '.agents', 'skills', 'codefleet', 'runtime', 'alpha', 'cli.mjs');
  const invoke = args => {
    const result = spawnSync(process.execPath, [
      cli, '--state', state, 'objective', ...args
    ], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined, result.error?.message);
    return { exitCode: result.status, stderr: result.stderr,
      data: JSON.parse(result.stdout) };
  };

  // These commands are documented in the installed Codex Skill, not only
  // exported from the source checkout. Exit 2 means review is incomplete.
  const list = invoke(['codex-goals']);
  assert.equal(list.exitCode, 0, list.stderr);
  const entry = list.data.sessions.find(x => x.sessionId === request.sessionId);
  assert.equal(entry?.goalStatus, 'AWAIT_WORKFLOW_REVIEW');
  assert.equal(entry?.objectiveComplete, false);
  assert.equal(entry?.executionGranted, false);

  const progress = invoke(['codex-goal-progress', request.sessionId,
    '--repository', repo]);
  assert.equal(progress.exitCode, 2, progress.stderr);
  assert.equal(progress.data.status, 'AWAIT_WORKFLOW_REVIEW');
  assert.equal(progress.data.sourceFreshness, 'PINNED_CLEAN_AT_REVIEW');
  assert.equal(progress.data.prepareCommand?.approved, false);
  assert.equal(progress.data.prepareCommand?.executionGranted, false);

  const reviewed = invoke(['review-codex-plan', request.sessionId,
    '--repository', repo]);
  assert.equal(reviewed.exitCode, 0, reviewed.stderr);
  assert.equal(reviewed.data.status, 'REVIEW_REQUIRED');
  assert.match(reviewed.data.workflowHash, /^[a-f0-9]{64}$/);
  assert.match(reviewed.data.sourceContractHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(progress.data.prepareCommand.argv, [
    'prepare-codex-workflow', request.sessionId, '--repository', repo,
    '--hash', reviewed.data.workflowHash,
    '--source-hash', reviewed.data.sourceContractHash
  ]);

  // An installed plain CLI cannot mint authenticated Operator or Host grants.
  const blocked = invoke(['run-codex-goal', request.sessionId,
    '--hash', reviewed.data.workflowHash]);
  assert.equal(blocked.exitCode, 1);
  assert.match(blocked.data.error, /AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
  store = new Store(state, { readOnly: true });
  assert.deepEqual(store.db.prepare(
    'SELECT body,digest,status,resultHash FROM host_planning WHERE id=?'
  ).get(request.sessionId), originalRow);
  assert.equal(store.db.prepare(
    'SELECT count(*) AS n FROM runs'
  ).get().n, 0, 'Read-only discovery cannot create a Workflow');
  store.close();
  store = null;

  // Explicit hashes can create ONLY the existing unapproved Workflow.
  const prepared = invoke(['prepare-codex-workflow', request.sessionId,
    '--repository', repo, '--hash', reviewed.data.workflowHash,
    '--source-hash', reviewed.data.sourceContractHash]);
  assert.equal(prepared.exitCode, 0, prepared.stderr);
  assert.equal(prepared.data.approved, false);
  assert.equal(prepared.data.executionGranted, false);
  const resumed = invoke(['codex-goals']);
  assert.equal(resumed.exitCode, 0, resumed.stderr);
  const workflow = resumed.data.sessions.find(x => x.sessionId === request.sessionId);
  assert.equal(workflow?.workflowId, prepared.data.workflowId);
  assert.equal(workflow?.objectiveComplete, false);

  const deniedAgain = invoke(['run-codex-goal', request.sessionId,
    '--hash', reviewed.data.workflowHash]);
  assert.equal(deniedAgain.exitCode, 1);
  assert.match(deniedAgain.data.error, /AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
  store = new Store(state, { readOnly: true });
  assert.equal(store.get(prepared.data.workflowId).state, 'WAITING_APPROVAL');
  assert.equal(store.db.prepare(
    'SELECT count(*) AS n FROM workflow_approvals'
  ).get().n, 0);
  assert.equal(store.db.prepare(
    'SELECT count(*) AS n FROM workflow_attempts'
  ).get().n, 0);
  assert.equal(await readFile(join(repo, 'src/a.js'), 'utf8'), source);
});
