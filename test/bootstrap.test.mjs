import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { command, environment, requireSuccess } from '../src/alpha/process.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { probeRepository, classifyGitFailure } from '../src/intent/probe.mjs';
import { validateBootstrapDraft } from '../src/intent/bootstrap.mjs';
import { bootstrapDefinition, validateBootstrapWorkflow } from '../src/workflow/bootstrap.mjs';
import { createFiles, validateFileset } from '../src/workflow/bootstrap-files.mjs';
import { enableTasks, createTask, submitTaskDraft, prepareTask, submitBootstrapFiles, approveTask, materializeTask, clarifyTask, objectiveUnknownsReport, task } from '../src/product/tasks.mjs';
import { taskReport } from '../src/product/report.mjs';
import { dispatchProduct } from '../src/product/cli.mjs';
import { dispatchHost } from '../src/hosts/cli.mjs';

const GOAL = 'Todo + Calendar 일정 관리 웹앱을 새로 만든다';
const ID = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid'];
async function commitAll(dir) {
  requireSuccess(await git(dir, ['add', '-A']), 'add');
  requireSuccess(await git(dir, [...ID, 'commit', '-m', 'fixture']), 'commit');
}
async function fixture(kind) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-bootstrap-'))), dir = path.join(root, 'repo');
  await mkdir(dir);
  if (kind !== 'nogit') requireSuccess(await git(dir, ['init']), 'init');
  if (['readme', 'source'].includes(kind)) await writeFile(path.join(dir, 'README.md'), '# todo\n');
  if (kind === 'source') { await mkdir(path.join(dir, 'src')); await mkdir(path.join(dir, 'test')); await writeFile(path.join(dir, 'src/a.js'), 'export const add = (a, b) => a + b;\n'); await writeFile(path.join(dir, 'test/a.test.js'), "import { add } from '../src/a.js';\n"); }
  if (['readme', 'source'].includes(kind)) await commitAll(dir);
  const store = new Store(path.join(root, 'state')); enableTasks(store);
  return { root, dir, store };
}
const files = { todo: ['package.json', 'src/todo.mjs', 'test/todo.test.mjs'], calendar: ['src/calendar.mjs', 'test/calendar.test.mjs'] };
function draftFor(plan, change = d => d) {
  return change({ schemaVersion: 1, kind: 'BootstrapDraft', objective: GOAL, probeRef: plan.probe.probeHash,
    requirements: ['Create, complete and delete todos', 'Show todos with due dates on a monthly calendar'],
    openQuestions: [], decisions: [{ topic: 'stack', choice: 'Node 24 ESM with node:test, no dependencies', alternatives: ['Vite + React'], rationale: 'Smallest verifiable start' }],
    plannedFiles: [{ path: 'package.json', purpose: 'test script' }, { path: 'src/todo.mjs', purpose: 'todo store' }, { path: 'src/calendar.mjs', purpose: 'calendar grouping' }],
    plannedTests: [{ path: 'test/todo.test.mjs', criteria: ['todoCrud'] }, { path: 'test/calendar.test.mjs', criteria: ['calendarView'] }],
    criteria: [{ id: 'todoCrud', description: 'Todo create/complete/delete', tests: ['test/todo.test.mjs'] }, { id: 'calendarView', description: 'Todos grouped by due date', tests: ['test/calendar.test.mjs'] }],
    scope: { includes: ['local single-user MVP'], excludes: ['deployment', 'authentication'] }, risks: ['Calendar time zones'],
    workItems: [
      { id: 'requirements', kind: 'planning', dependencies: [], acceptanceCriteria: ['MVP requirements recorded'], files: [] },
      { id: 'stack', kind: 'planning', dependencies: ['requirements'], acceptanceCriteria: ['Stack decision recorded'], files: [] },
      { id: 'init-plan', kind: 'planning', dependencies: ['stack'], acceptanceCriteria: ['Initial layout planned'], files: [] },
      { id: 'data-model', kind: 'analysis', dependencies: ['requirements', 'stack'], acceptanceCriteria: ['Todo shape defined'], files: [] },
      { id: 'todo', kind: 'local-edit', dependencies: ['init-plan', 'data-model'], acceptanceCriteria: ['todoCrud'], files: files.todo },
      { id: 'calendar', kind: 'local-edit', dependencies: ['todo'], acceptanceCriteria: ['calendarView'], files: files.calendar },
      { id: 'tests', kind: 'local-verification', dependencies: ['todo', 'calendar'], acceptanceCriteria: ['Planned tests pass locally'], files: [] },
      { id: 'review-verify', kind: 'protected-verification', dependencies: ['tests'], acceptanceCriteria: ['Protected verification after transition'], files: [] }] });
}
const contents = { 'package.json': '{"type":"module","scripts":{"test":"node --test"}}\n', 'src/todo.mjs': 'export const todos = [];\n', 'test/todo.test.mjs': "import test from 'node:test';\ntest('todo', () => {});\n", 'src/calendar.mjs': 'export const byDate = () => ({});\n', 'test/calendar.test.mjs': "import test from 'node:test';\ntest('calendar', () => {});\n" };
const fileset = (revision, itemId) => ({ revision, itemId, files: files[itemId].map(p => ({ path: p, content: contents[p] })) });
const plan = (store, id) => store.readArtifact(task(store, id).planRef);
async function validated(kind) {
  const f = await fixture(kind);
  const created = await createTask(f.store, f.dir, GOAL);
  const drafted = await submitTaskDraft(f.store, created.id, { revision: created.revision, proposal: draftFor(plan(f.store, created.id)) });
  return { ...f, id: created.id, drafted };
}
async function prepared(kind) {
  const f = await validated(kind);
  const current = await prepareTask(f.store, f.id);
  return { ...f, current };
}
async function approvedFiles(f, itemId, { actor = 'operator' } = {}) {
  const { approvalRequest } = await submitBootstrapFiles(f.store, f.id, fileset(task(f.store, f.id).revision, itemId));
  approveTask(f.store, f.id, { actor, workflowHash: approvalRequest.filesetHash, expiresAt: Date.now() + 600000 });
  return approvalRequest;
}

test('probe distinguishes unborn, bootstrap candidate, existing source, non-Git and non-root without changing anything', async () => {
  const expected = { unborn: ['UNBORN_HEAD', 'NEW_PROJECT'], readme: ['BOOTSTRAP_CANDIDATE', 'NEW_PROJECT'], source: ['EXISTING_SOURCE', 'EXISTING_REPOSITORY'], nogit: ['NOT_GIT', 'NEW_PROJECT'] };
  for (const [kind, [state, contract]] of Object.entries(expected)) {
    const f = await fixture(kind), before = await readdir(f.dir);
    const probe = await probeRepository(f.dir);
    assert.deepEqual([probe.state, probe.contract], [state, contract], kind);
    assert.equal(probe.codeObserved, false); assert.equal(probe.authority, 'HOST_OBSERVED_REPOSITORY_STATE');
    assert.deepEqual(await readdir(f.dir), before, `${kind} probe must not write`);
    f.store.close();
  }
  const f = await fixture('source'); await mkdir(path.join(f.dir, 'sub'));
  const sub = await probeRepository(path.join(f.dir, 'sub'));
  assert.deepEqual([sub.state, sub.contract, sub.error.kind], ['GIT_ERROR', null, 'NOT_REPOSITORY_ROOT']);
  assert.equal(existsSync(path.join(f.root, 'repo', 'sub', '.git')), false);
  f.store.close();
});

test('Git ownership refusal from real Git is classified, other failures are not, and nothing configures safe.directory', async () => {
  const f = await fixture('unborn');
  const refused = await command('git', ['-C', f.dir, 'rev-parse', '--show-toplevel'], { env: { ...environment(), GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } });
  assert.equal(refused.exitCode, 128);
  const ownership = classifyGitFailure(refused);
  assert.equal(ownership.kind, 'GIT_OWNERSHIP'); assert.match(ownership.remedy, /never changes safe\.directory/);
  assert.equal(classifyGitFailure({ exitCode: 128, stderr: Buffer.from('fatal: not a git repository') }).kind, 'NOT_GIT');
  assert.equal(classifyGitFailure({ exitCode: 128, stderr: Buffer.from('fatal: bad object HEAD') }).kind, 'GIT_ERROR');
  // Observed verbatim in a Codex unelevated Windows sandbox: no child process may start.
  const denied = classifyGitFailure({ exitCode: null, stderr: Buffer.alloc(0), error: 'spawn EPERM' });
  assert.equal(denied.kind, 'PROCESS_SPAWN_DENIED'); assert.match(denied.remedy, /Host command-specific execution approval/);
  assert.match(denied.remedy, /does not grant CodeFleet fileset approval/);
  assert.equal(classifyGitFailure({ exitCode: 1, stderr: Buffer.from('spawn EPERM'), error: null }).kind, 'GIT_ERROR', 'Git output is not a spawn denial');
  const config = await command('git', ['-C', f.dir, 'config', '--local', '--get-all', 'safe.directory'], { env: environment() });
  assert.equal(config.exitCode, 1, 'no repository-local safe.directory was written');
  f.store.close();
});

test('unborn HEAD with a dirty index plans NEW_PROJECT and a BootstrapDraft validates without code references', async () => {
  const f = await fixture('unborn');
  await writeFile(path.join(f.dir, 'project.iml'), '<module/>'); requireSuccess(await git(f.dir, ['add', 'project.iml']), 'stage');
  const created = await createTask(f.store, f.dir, GOAL);
  const skeleton = plan(f.store, created.id);
  assert.equal(created.state, 'NEEDS_INPUT'); assert.equal(skeleton.contractKind, 'NEW_PROJECT');
  assert.equal(skeleton.probe.state, 'UNBORN_HEAD'); assert.equal(skeleton.probe.dirty, true);
  const updated = await submitTaskDraft(f.store, created.id, { revision: created.revision, proposal: draftFor(skeleton) });
  const result = plan(f.store, created.id);
  assert.equal(updated.state, 'VALIDATED');
  assert.deepEqual(result.validation.provenance, { objective: 'USER_DECLARED', draft: 'PLANNED', probe: 'HOST_OBSERVED_REPOSITORY_STATE', code: 'NONE' });
  assert.equal(result.workflowPreview.items.length, 8);
  assert.doesNotMatch(JSON.stringify(result), /HOST_OBSERVED_CODE|"references"/);
  assert.deepEqual([result.validation.executable, result.validation.approved, result.validation.complete], [false, false, false]);
  f.store.close();
});

test('non-Git directory and README-only repository plan as NEW_PROJECT; README-only is a bootstrap candidate', async () => {
  const nogit = await validated('nogit');
  assert.equal(nogit.drafted.state, 'VALIDATED');
  assert.equal(plan(nogit.store, nogit.id).validation.materialization, 'BLOCKED_GIT_REPOSITORY_REQUIRED');
  assert.equal(existsSync(path.join(nogit.dir, '.git')), false, 'planning never runs git init');
  nogit.store.close();
  const readme = await validated('readme');
  assert.equal(plan(readme.store, readme.id).probe.state, 'BOOTSTRAP_CANDIDATE');
  assert.equal(readme.drafted.state, 'VALIDATED');
  readme.store.close();
});

test('existing source keeps the G3 path and cannot be redirected to NEW_PROJECT by a draft', async () => {
  const f = await fixture('source');
  const created = await createTask(f.store, f.dir, 'Repair src/a.js add regression using test/a.test.js');
  const existing = plan(f.store, created.id);
  assert.equal(existing.contractKind, undefined); assert.equal(existing.analysis.mode, 'LOCAL_CODE_CONTEXT');
  assert.ok(existing.discovery.files.some(x => x.path === 'src/a.js'));
  const fake = draftFor({ probe: { probeHash: 'x' } }, d => ({ ...d, objective: existing.intent.original }));
  await assert.rejects(() => submitTaskDraft(f.store, created.id, { revision: created.revision, proposal: { draft: fake, references: [{ path: 'src/a.js', line: 1, quote: 'export' }], inferences: [] } }), /Invalid TaskDraft fields/);
  const probe = await probeRepository(f.dir);
  assert.equal(validateBootstrapDraft(fake, probe, GOAL).status, 'CAPABILITY_GAP');
  f.store.close();
});

test('forged references, authority fields, changed objective, stale probe, existing or unsafe paths are rejected', async () => {
  const f = await fixture('readme');
  const created = await createTask(f.store, f.dir, GOAL), skeleton = plan(f.store, created.id), probe = await probeRepository(f.dir);
  const check = (change, pattern, existing = []) => assert.throws(() => validateBootstrapDraft(draftFor(skeleton, change), probe, GOAL, existing), pattern);
  check(d => ({ ...d, references: [{ path: 'src/todo.mjs', line: 1, quote: 'export' }] }), /Invalid BootstrapDraft fields/);
  check(d => ({ ...d, plannedFiles: [{ path: 'src/todo.mjs', purpose: 'x', authority: 'HOST_OBSERVED_CODE' }] }), /Invalid planned file fields/);
  check(d => ({ ...d, objective: 'Something else entirely' }), /cannot replace the original objective/);
  check(d => ({ ...d, probeRef: 'stale' }), /probe baseline mismatch/);
  check(d => d, /already exists/, ['src/todo.mjs']);
  for (const unsafe of ['../escape.js', '/abs.js', '.hidden/x.js', 'src/../x.js', 'con.js', 'src\\x.js']) check(d => ({ ...d, plannedFiles: [{ path: unsafe, purpose: 'x' }] }), /Unsafe relative file path/);
  check(d => ({ ...d, plannedTests: [{ path: 'src/not-a-test.mjs', criteria: ['todoCrud'] }] }), /not a test/);
  const withReadme = draftFor(skeleton, d => ({ ...d, plannedFiles: [...d.plannedFiles, { path: 'README.md', purpose: 'overwrite' }] }));
  await assert.rejects(() => submitTaskDraft(f.store, created.id, { revision: created.revision, proposal: withReadme }), /already exists; it cannot be planned as new: README.md/);
  f.store.close();
});

test('bootstrap DAG derives capability and approval, rejects cycles, bad dependencies, scope and tampering', async () => {
  const f = await validated('unborn'), base = plan(f.store, f.id);
  const build = change => bootstrapDefinition({ ...base, draft: draftFor(base, d => { change(d); return d; }), validation: { ...base.validation, draftHash: undefined } });
  const withHash = change => { const draft = draftFor(base, d => { change(d); return d; }); return bootstrapDefinition({ ...base, draft, validation: { ...base.validation, draftHash: validateBootstrapDraft(draft, base.probe, GOAL).draftHash } }); };
  const workflow = withHash(() => {});
  assert.deepEqual(workflow.items.map(n => n.approval), ['NONE_PLAN_ONLY', 'NONE_PLAN_ONLY', 'NONE_PLAN_ONLY', 'NONE_PLAN_ONLY', 'HASH_BOUND_FILESET', 'HASH_BOUND_FILESET', 'EXACT_LOCAL_COMMAND_TRUST', 'EXISTING_CONTRACT_REQUIRED']);
  assert.throws(() => build(() => {}), /identity\/hash\/policy mismatch/);
  assert.throws(() => withHash(d => { d.workItems[0].dependencies = ['review-verify']; }), /Cyclic DAG/);
  assert.throws(() => withHash(d => { d.workItems[1].dependencies = ['missing']; }), /Missing dependency/);
  assert.throws(() => withHash(d => { d.workItems[1].dependencies = ['stack']; }), /Invalid dependencies/);
  assert.throws(() => withHash(d => { d.workItems[0].files = ['src/todo.mjs']; }), /planning WorkItem cannot own files/);
  assert.throws(() => withHash(d => { d.workItems[4].files = [...files.todo, 'src/extra.mjs']; }), /File outside the plan/);
  assert.throws(() => withHash(d => { d.workItems[5].files = ['src/calendar.mjs', 'test/calendar.test.mjs', 'src/todo.mjs']; }), /Overlapping file ownership/);
  assert.throws(() => withHash(d => { d.workItems[5].files = ['src/calendar.mjs']; }), /no creating WorkItem: test\/calendar.test.mjs/);
  assert.throws(() => withHash(d => { d.workItems[0].kind = 'deploy'; }), /Unknown WorkItem kind/);
  assert.throws(() => withHash(d => { d.workItems[0].approval = 'NONE'; }), /Invalid Bootstrap WorkItem fields/);
  const draftWith13 = draftFor(base, d => { for (let i = 0; i < 5; i++) d.workItems.push({ id: `extra${i}`, kind: 'planning', dependencies: [], acceptanceCriteria: ['x'], files: [] }); return d; });
  assert.throws(() => validateBootstrapDraft(draftWith13, base.probe, GOAL), /bounded array/);
  const tampered = structuredClone(workflow); tampered.items[6].approval = 'NONE_PLAN_ONLY';
  const { workflowHash, ...body } = tampered; tampered.workflowHash = (await import('../src/alpha/contract.mjs')).hash(body);
  assert.throws(() => validateBootstrapWorkflow(tampered, base.draft), /capability or approval differs/);
  f.store.close();
});

test('prepared DAG is queryable; unapproved, mismatched, expired and dependency-blocked materialization is refused', async () => {
  const f = await prepared('unborn');
  const report = await taskReport(f.store, f.id);
  const states = Object.fromEntries(report.bootstrap.items.map(n => [n.id, [n.state, n.capability]]));
  assert.deepEqual(states.requirements, ['PLAN_RECORDED', 'NOT_REQUIRED_PLAN_ONLY']);
  // analysis needs host-read to run, but a plan-only item runs nothing: no BLOCKED beside PLAN_RECORDED.
  const dataModel = report.bootstrap.items.find(n => n.id === 'data-model');
  assert.deepEqual([dataModel.kind, dataModel.state, dataModel.capability, dataModel.missing, dataModel.satisfiedBy.authority], ['analysis', 'PLAN_RECORDED', 'NOT_REQUIRED_PLAN_ONLY', [], 'PLANNED']);
  assert.deepEqual(states.todo, ['PENDING_FILESET', 'AVAILABLE']);
  assert.deepEqual(states.tests, ['BLOCKED', 'BLOCKED']);
  assert.deepEqual(report.bootstrap.items.find(n => n.id === 'review-verify').missing, ['protected-verifier', 'protected-evidence', 'protected-inputs']);
  assert.deepEqual([report.verification, report.complete], ['NOT_RUN', false]);
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /No fileset proposed/);
  const { approvalRequest } = await submitBootstrapFiles(f.store, f.id, fileset(task(f.store, f.id).revision, 'todo'));
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /approval required or already terminal/);
  assert.throws(() => approveTask(f.store, f.id, { actor: 'operator', workflowHash: 'f'.repeat(64), expiresAt: Date.now() + 60000 }), /No proposed fileset matches/);
  approveTask(f.store, f.id, { actor: 'operator', workflowHash: approvalRequest.filesetHash, expiresAt: Date.now() + 60000 });
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo', { now: Date.now() + 120000 }), /approval absent, expired or invalid/);
  await assert.rejects(() => execute(f.store, approvalRequest.runId), /never executed as a Run/);
  const calendar = await submitBootstrapFiles(f.store, f.id, fileset(task(f.store, f.id).revision, 'calendar'));
  approveTask(f.store, f.id, { actor: 'operator', workflowHash: calendar.approvalRequest.filesetHash, expiresAt: Date.now() + 60000 });
  await assert.rejects(() => materializeTask(f.store, f.id, 'calendar'), /Dependencies not satisfied: todo/);
  const todoOnly = { items: [{ id: 'todo', kind: 'local-edit', files: files.todo }, { id: 'stack', kind: 'planning', files: [] }] };
  assert.throws(() => validateFileset({ ...fileset(1, 'todo'), files: fileset(1, 'todo').files.slice(1) }, todoOnly, 'todo'), /exactly the WorkItem planned files/);
  assert.throws(() => validateFileset({ ...fileset(1, 'todo'), itemId: 'stack' }, todoOnly, 'stack'), /only for local-edit/);
  assert.throws(() => validateFileset({ ...fileset(1, 'todo'), files: [...fileset(1, 'todo').files.slice(1), { path: '../package.json', content: '{}' }] }, todoOnly, 'todo'), /Unsafe relative file path/);
  assert.throws(() => validateFileset({ ...fileset(1, 'todo'), files: fileset(1, 'todo').files.map((x, i) => i ? x : { ...x, content: 'x'.repeat(64001) }) }, todoOnly, 'todo'), /at most 64000 bytes/);
  assert.deepEqual(await readdir(f.dir), ['.git'], 'no file was created by any refused step');
  f.store.close();
});

test('approved fileset creates exactly the planned files once, records CODEFLEET_DIRECT_WRITE and is single-use', async () => {
  const f = await prepared('unborn');
  await approvedFiles(f, 'todo');
  const result = await materializeTask(f.store, f.id, 'todo');
  assert.equal(result.status, 'MATERIALIZED');
  assert.deepEqual(result.results.map(r => r.status), ['CREATED', 'CREATED', 'CREATED']);
  for (const p of files.todo) assert.equal(await readFile(path.join(f.dir, p), 'utf8'), contents[p]);
  const evidence = f.store.readArtifact(result.materializationRef);
  assert.deepEqual([evidence.authority, evidence.verification, evidence.complete], ['CODEFLEET_DIRECT_WRITE', 'NOT_RUN', false]);
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /COMPLETED; approval required or already terminal/);
  const report = await taskReport(f.store, f.id);
  assert.equal(report.bootstrap.items.find(n => n.id === 'todo').state, 'MATERIALIZED');
  assert.deepEqual(report.bootstrap.items.find(n => n.id === 'calendar').waitingOn, []);
  assert.equal(report.complete, false);
  f.store.close();
});

test('existing files are never overwritten; conflicts, outside changes and link bypasses block before writing', async () => {
  const f = await prepared('unborn');
  await approvedFiles(f, 'todo'); await materializeTask(f.store, f.id, 'todo');
  await approvedFiles(f, 'calendar');
  await writeFile(path.join(f.dir, 'src/calendar.mjs'), 'user content\n');
  const conflict = await materializeTask(f.store, f.id, 'calendar');
  assert.equal(conflict.status, 'CONFLICT');
  assert.equal(await readFile(path.join(f.dir, 'src/calendar.mjs'), 'utf8'), 'user content\n');
  assert.equal(existsSync(path.join(f.dir, 'test/calendar.test.mjs')), false, 'conflict preflight writes nothing');
  await rm(path.join(f.dir, 'src/calendar.mjs'));
  await writeFile(path.join(f.dir, 'notes.txt'), 'unplanned');
  await assert.rejects(() => materializeTask(f.store, f.id, 'calendar'), /changed outside the approved filesets/);
  await rm(path.join(f.dir, 'notes.txt'));
  assert.equal((await materializeTask(f.store, f.id, 'calendar')).status, 'MATERIALIZED');
  const outside = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-outside-')));
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-link-')));
  await symlink(outside, path.join(root, 'linked'), 'junction');
  const linked = await createFiles(root, [{ path: 'linked/a.js', content: 'x', sha256: 'unused', bytes: 1 }]);
  assert.deepEqual([linked.status, linked.written], ['CONFLICT', false]);
  assert.deepEqual(await readdir(outside), [], 'nothing written through the link');
  f.store.close();
});

test('interrupted creation resumes without duplicating or rewriting files', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-resume-')));
  const entries = validateFileset(fileset(1, 'todo'), { items: [{ id: 'todo', kind: 'local-edit', files: files.todo }] }, 'todo');
  let writes = 0;
  const first = await createFiles(root, entries, { cancelled: () => writes > 0, record: r => { if (r.status === 'CREATED') writes++; } });
  assert.equal(first.status, 'INTERRUPTED');
  assert.deepEqual(first.results.map(r => r.status), ['CREATED', 'NOT_RUN', 'NOT_RUN']);
  const second = await createFiles(root, entries);
  assert.deepEqual(second.results.map(r => r.status), ['ALREADY_CREATED', 'CREATED', 'CREATED']);
  assert.equal(second.status, 'MATERIALIZED');
  const f = await prepared('unborn');
  await approvedFiles(f, 'todo');
  await mkdir(path.join(f.dir, 'src')); await writeFile(path.join(f.dir, 'src/todo.mjs'), contents['src/todo.mjs']);
  const resumed = await materializeTask(f.store, f.id, 'todo');
  assert.deepEqual(resumed.results.map(r => r.status), ['CREATED', 'ALREADY_CREATED', 'CREATED']);
  f.store.close();
});

test('after user git commit the old bootstrap task is stale and a new task uses the existing contract', async () => {
  const f = await prepared('unborn');
  await approvedFiles(f, 'todo'); await materializeTask(f.store, f.id, 'todo');
  await approvedFiles(f, 'calendar'); await materializeTask(f.store, f.id, 'calendar');
  assert.equal(existsSync(path.join(f.dir, '.git', 'refs', 'heads', 'master')) || existsSync(path.join(f.dir, '.git', 'refs', 'heads', 'main')), false, 'CodeFleet never commits');
  await commitAll(f.dir);
  await assert.rejects(() => submitTaskDraft(f.store, f.id, { revision: task(f.store, f.id).revision, proposal: draftFor(plan(f.store, f.id)) }), /Repository changed since planning/);
  const next = await createTask(f.store, f.dir, 'Repair todo removal in src/todo.mjs covered by test/todo.test.mjs');
  const existing = plan(f.store, next.id);
  assert.equal(existing.contractKind, undefined);
  assert.equal(existing.analysis.mode, 'LOCAL_CODE_CONTEXT');
  assert.ok(existing.discovery.files.some(x => x.path === 'src/todo.mjs' && x.kind === 'source'));
  assert.doesNotMatch(JSON.stringify(existing), /BootstrapDraft|CODEFLEET_DIRECT_WRITE|PLAN_RECORDED/);
  f.store.close();
});

test('CLI: host plans, drafts, prepares, proposes files; only the operator approves and materializes; run stays blocked', async () => {
  const f = await fixture('unborn'), json = async (name, value) => { const p = path.join(f.root, name); await writeFile(p, JSON.stringify(value)); return p; };
  const planned = await dispatchHost(['codex', 'plan', GOAL, f.dir], { store: f.store });
  assert.equal(planned.exitCode, 2); assert.equal(planned.data.contractKind, 'NEW_PROJECT');
  assert.match(planned.data.nextAction, /BootstrapDraft/);
  const id = planned.data.taskId;
  const drafted = await dispatchHost(['codex', 'draft', id, await json('draft.json', { revision: planned.data.revision, proposal: draftFor(planned.data.plan) })], { store: f.store });
  assert.equal(drafted.exitCode, 0); assert.equal(drafted.data.state, 'VALIDATED');
  const prep = await dispatchHost(['codex', 'prepare', id], { store: f.store });
  assert.equal(prep.exitCode, 2); assert.equal(prep.data.approvalRequest, null);
  const flow = await dispatchHost(['codex', 'workflow', id], { store: f.store });
  assert.equal(flow.data.bootstrap.items.length, 8); assert.equal(flow.data.executable, false);
  const proposed = await dispatchHost(['codex', 'files', id, await json('files.json', fileset(flow.data.revision, 'todo'))], { store: f.store });
  assert.equal(proposed.exitCode, 2); assert.equal(proposed.data.approvalRequest.authority, 'REQUEST_ONLY');
  await assert.rejects(() => dispatchHost(['codex', 'approve', id], { store: f.store }), /approval and completion cannot be set by host/);
  await assert.rejects(() => dispatchHost(['codex', 'materialize', id, 'todo'], { store: f.store }), /Unsupported host action/);
  const run = await dispatchProduct(['run', id], { store: f.store });
  assert.equal(run.exitCode, 2); assert.match(run.data.blocked, /no executable Run/);
  await dispatchProduct(['approve', id, '--hash', proposed.data.approvalRequest.filesetHash, '--actor', 'operator'], { store: f.store });
  const made = await dispatchProduct(['materialize', id, 'todo'], { store: f.store });
  assert.equal(made.exitCode, 0); assert.equal(made.data.materialization.status, 'MATERIALIZED');
  assert.deepEqual([made.data.verification, made.data.complete], ['NOT_RUN', false]);
  f.store.close();
});

const RISKY = 'Todo 생성·수정·삭제와 캘린더 연동 웹앱을 새로 만든다';
const SCOPE = '삭제는 앱 안에서 사용자가 만든 Todo 항목을 지우는 기능이다. 파일·저장소·인프라 삭제나 배포 권한이 아니다.';
async function riskyTask(objective = RISKY) {
  const f = await fixture('unborn');
  const created = await createTask(f.store, f.dir, objective);
  return { ...f, id: created.id, created };
}
const riskyDraft = (store, id, change = d => d) => draftFor(plan(store, id), d => change({ ...d, objective: plan(store, id).intent.original }));
const clarify = (f, extra = {}) => clarifyTask(f.store, f.id, { unknownId: 'privileged-intent', actor: 'operator', scope: SCOPE, revision: task(f.store, f.id).revision, ...extra });

test('a delete objective stays NEEDS_INPUT and no planner path can clear the derived unknown', async () => {
  const f = await riskyTask();
  assert.equal(f.created.state, 'NEEDS_INPUT');
  const listed = objectiveUnknownsReport(f.store, f.id);
  assert.deepEqual(listed.clarifiable.map(u => [u.id, u.status, u.terms]), [['privileged-intent', 'OPEN', ['삭제']]]);
  const drafted = await submitTaskDraft(f.store, f.id, { revision: task(f.store, f.id).revision, proposal: riskyDraft(f.store, f.id) });
  assert.equal(drafted.state, 'NEEDS_INPUT');
  assert.deepEqual(plan(f.store, f.id).validation.unknowns, ['Potential privileged intent requires explicit scope clarification; planner cannot waive it']);
  await assert.rejects(() => submitTaskDraft(f.store, f.id, { revision: task(f.store, f.id).revision, proposal: riskyDraft(f.store, f.id, d => ({ ...d, clarifications: [{ unknownId: 'privileged-intent' }] })) }), /Invalid BootstrapDraft fields/);
  await assert.rejects(() => dispatchHost(['codex', 'clarify', f.id, '--unknown', 'privileged-intent'], { store: f.store }), /Unsupported host action/);
  assert.match((await taskReport(f.store, f.id)).nextAction, /objective clarify \(privileged-intent\)/);
  // A plan validated by an older runtime has no stored clarifiable list; it is derived from the objective.
  const legacy = plan(f.store, f.id); delete legacy.validation.clarifiable;
  const body = task(f.store, f.id); body.planRef = f.store.artifact(legacy);
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(body), f.id);
  assert.deepEqual(objectiveUnknownsReport(f.store, f.id).clarifiable.map(u => [u.id, u.status]), [['privileged-intent', 'OPEN']]);
  f.store.close();
});

test('operator clarification clears only its unknown in the same task, records USER_DECLARED meaning and approves nothing', async () => {
  const early = await riskyTask();
  const partial = await clarify(early);
  const left = plan(early.store, early.id).validation;
  assert.equal(partial.state, 'NEEDS_INPUT', 'skeleton unknowns remain');
  assert.ok(left.unknowns.includes('State requirements') && !left.unknowns.some(u => /privileged/.test(u)));
  early.store.close();

  const f = await riskyTask();
  await submitTaskDraft(f.store, f.id, { revision: task(f.store, f.id).revision, proposal: riskyDraft(f.store, f.id, d => ({ ...d, openQuestions: ['Recurring events?'] })) });
  assert.equal((await clarify(f)).state, 'NEEDS_INPUT', 'an open question is not cleared by clarification');
  await submitTaskDraft(f.store, f.id, { revision: task(f.store, f.id).revision, proposal: riskyDraft(f.store, f.id) });
  const validated = plan(f.store, f.id);
  assert.equal(task(f.store, f.id).state, 'VALIDATED');
  assert.deepEqual(validated.validation.clarified.map(c => [c.unknownId, c.authority, c.grantsExecution]), [['privileged-intent', 'USER_DECLARED', false]]);
  const record = f.store.readArtifact(task(f.store, f.id).clarifications['privileged-intent']);
  assert.deepEqual([record.taskId, record.actor, record.scope, record.authority], [f.id, 'operator', SCOPE, 'USER_DECLARED']);
  assert.doesNotMatch(JSON.stringify(record), /HOST_OBSERVED_CODE/);
  assert.ok(f.store.events(f.id).some(e => e.type === 'OBJECTIVE_CLARIFIED' && e.body.unknownId === 'privileged-intent'));
  await assert.rejects(() => clarify(f), /Already clarified/);
  await prepareTask(f.store, f.id);
  assert.equal((await taskReport(f.store, f.id)).bootstrap.items.length, 8);
  await assert.rejects(() => clarify(f, { unknownId: 'other' }), /closed once the task is prepared/);
  const { approvalRequest } = await submitBootstrapFiles(f.store, f.id, fileset(task(f.store, f.id).revision, 'todo'));
  assert.equal(approvalRequest.authority, 'REQUEST_ONLY');
  await assert.rejects(() => materializeTask(f.store, f.id, 'todo'), /approval required/);
  assert.deepEqual(await readdir(f.dir), ['.git'], 'clarification creates no file');
  f.store.close();
});

test('clarification input, revision, contract and objective binding are enforced; G3 is unchanged', async () => {
  const f = await riskyTask();
  for (const [extra, pattern] of [[{ actor: ' ' }, /actor/], [{ scope: '' }, /scope/], [{ unknownId: 'requirements' }, /No clarifiable unknown/], [{ revision: 1 }, /revision stale/]]) await assert.rejects(() => clarify(f, extra), pattern);
  const plain = await riskyTask('Todo 목록과 캘린더 웹앱을 새로 만든다');
  assert.deepEqual(objectiveUnknownsReport(plain.store, plain.id).clarifiable, []);
  await assert.rejects(() => clarify(plain), /No clarifiable unknown/);
  plain.store.close();
  const g3 = await fixture('source');
  const existing = await createTask(g3.store, g3.dir, 'Repair src/a.js and delete the duplicate add using test/a.test.js');
  assert.equal(existing.state, 'NEEDS_INPUT');
  await assert.rejects(() => clarifyTask(g3.store, existing.id, { unknownId: 'privileged-intent', actor: 'operator', scope: SCOPE, revision: existing.revision }), /only to NEW_PROJECT/);
  assert.ok(plan(g3.store, existing.id).validation.unknowns.some(u => /privileged intent/.test(u)), 'G3 privileged rule still applies');
  g3.store.close();
  f.store.close();
});

test('a clarification cannot be reused by another task, a changed objective, a changed subject or an altered artifact', async () => {
  const a = await riskyTask();
  await submitTaskDraft(a.store, a.id, { revision: task(a.store, a.id).revision, proposal: riskyDraft(a.store, a.id) });
  await clarify(a);
  const ref = task(a.store, a.id).clarifications['privileged-intent'], record = a.store.readArtifact(ref);
  const inject = (id, value) => { const body = task(a.store, id); body.clarifications = { 'privileged-intent': value }; a.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(body), id); };
  // Same store, different objective: swapping the record in is refused, not silently ignored.
  const other = await createTask(a.store, a.dir, 'Todo 삭제와 캘린더 동기화 웹앱을 새로 만든다');
  const otherDraft = draftFor(plan(a.store, other.id), d => ({ ...d, objective: plan(a.store, other.id).intent.original }));
  inject(other.id, ref);
  await assert.rejects(() => submitTaskDraft(a.store, other.id, { revision: task(a.store, other.id).revision, proposal: otherDraft }), /does not belong to this task/);
  // Retargeted to the other task but bound to the old objective: the unknown stays open.
  inject(other.id, a.store.artifact({ ...record, taskId: other.id }));
  await submitTaskDraft(a.store, other.id, { revision: task(a.store, other.id).revision, proposal: otherDraft });
  assert.equal(task(a.store, other.id).state, 'NEEDS_INPUT');
  // Same task, subject changed (e.g. the rule's matched terms): the unknown reopens at prepare.
  inject(a.id, a.store.artifact({ ...record, subjectHash: 'f'.repeat(64) }));
  await assert.rejects(() => prepareTask(a.store, a.id), /NEEDS_INPUT/);
  // An artifact whose bytes no longer match its name is refused outright.
  inject(a.id, ref);
  await writeFile(path.join(a.store.directory, 'artifacts', ref + '.json'), JSON.stringify({ ...record, scope: 'anything' }));
  await assert.rejects(() => prepareTask(a.store, a.id), /hash mismatch/);
  a.store.close();
});

test('CLI: operator lists unknowns, clarifies, and the same task prepares a DAG and a fileset approval request', async () => {
  const f = await fixture('unborn'), json = async (name, value) => { const p = path.join(f.root, name); await writeFile(p, JSON.stringify(value)); return p; };
  const planned = await dispatchHost(['codex', 'plan', RISKY, f.dir], { store: f.store }), id = planned.data.taskId;
  await dispatchHost(['codex', 'draft', id, await json('draft.json', { revision: planned.data.revision, proposal: draftFor(planned.data.plan, d => ({ ...d, objective: RISKY })) })], { store: f.store });
  const unknowns = await dispatchProduct(['unknowns', id], { store: f.store });
  assert.deepEqual(unknowns.data.clarifiable.map(u => u.status), ['OPEN']);
  const clarified = await dispatchProduct(['clarify', id, '--unknown', 'privileged-intent', '--scope', SCOPE, '--actor', 'operator', '--revision', String(unknowns.data.revision)], { store: f.store });
  assert.equal(clarified.exitCode, 0); assert.equal(clarified.data.state, 'VALIDATED');
  assert.deepEqual(clarified.data.clarification.clarifiable.map(u => u.status), ['CLARIFIED']);
  await dispatchHost(['codex', 'prepare', id], { store: f.store });
  const flow = await dispatchHost(['codex', 'workflow', id], { store: f.store });
  const proposed = await dispatchHost(['codex', 'files', id, await json('files.json', fileset(flow.data.revision, 'todo'))], { store: f.store });
  assert.match(proposed.data.approvalRequest.filesetHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readdir(f.dir), ['.git']);
  f.store.close();
});
