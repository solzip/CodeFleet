import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../../src/alpha/store.mjs';
import { git } from '../../src/alpha/workspace.mjs';
import { requireSuccess } from '../../src/alpha/process.mjs';
import { enableTasks, createTask, submitTaskDraft, prepareTask, submitBootstrapFiles, approveTask, materializeTask, task } from '../../src/product/tasks.mjs';

const GOAL = 'Todo + Calendar 일정 관리 웹앱을 새로 만든다';
const files = { todo: ['package.json', 'src/todo.mjs', 'test/todo.test.mjs'], calendar: ['src/calendar.mjs', 'test/calendar.test.mjs'] };
const BUGGY = 'export const add = (list, t) => list;\n', FIXED = 'export const add = (list, t) => [...list, t];\n';
const contents = {
  'package.json': '{"type":"module"}\n', 'src/todo.mjs': BUGGY,
  'test/todo.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/todo.mjs';\ntest('add appends', () => assert.equal(add([], 'a').length, 1));\n",
  'src/calendar.mjs': 'export const byDate = () => ({});\n',
  'test/calendar.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { byDate } from '../src/calendar.mjs';\ntest('calendar groups', () => assert.deepEqual(byDate(), {}));\n" };
function draft(probeRef, { protectedItem = true, chainedVerification = false } = {}) {
  return { schemaVersion: 1, kind: 'BootstrapDraft', objective: GOAL, probeRef,
    requirements: ['Create, complete and delete todos', 'Show todos with due dates on a monthly calendar'], openQuestions: [],
    decisions: [{ topic: 'stack', choice: 'Node 24 ESM with node:test', alternatives: ['Vite'], rationale: 'smallest verifiable start' }],
    plannedFiles: [{ path: 'package.json', purpose: 'module type' }, { path: 'src/todo.mjs', purpose: 'todo store' }, { path: 'src/calendar.mjs', purpose: 'calendar' }],
    plannedTests: [{ path: 'test/todo.test.mjs', criteria: ['todoCrud'] }, { path: 'test/calendar.test.mjs', criteria: ['calendarView'] }],
    criteria: [{ id: 'todoCrud', description: 'Todo add', tests: ['test/todo.test.mjs'] }, { id: 'calendarView', description: 'grouping', tests: ['test/calendar.test.mjs'] }],
    scope: { includes: ['local MVP'], excludes: ['deployment'] }, risks: ['time zones'],
    workItems: [
      { id: 'requirements', kind: 'planning', dependencies: [], acceptanceCriteria: ['requirements recorded'], files: [] },
      { id: 'todo', kind: 'local-edit', dependencies: ['requirements'], acceptanceCriteria: ['todoCrud'], files: files.todo },
      { id: 'calendar', kind: 'local-edit', dependencies: ['todo'], acceptanceCriteria: ['calendarView'], files: files.calendar },
      { id: 'tests', kind: 'local-verification', dependencies: ['todo', 'calendar'], acceptanceCriteria: ['node --test passes locally'], files: [] },
      ...(chainedVerification ? [{ id: 'tests-next', kind: 'local-verification', dependencies: ['tests'], acceptanceCriteria: ['separately approved verification'], files: [] }] : []),
      ...(protectedItem ? [{ id: 'review-verify', kind: 'protected-verification', dependencies: [chainedVerification ? 'tests-next' : 'tests'], acceptanceCriteria: ['protected verification'], files: [] }] : [])] };
}
async function prepared(options) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-verify-'))), dir = path.join(root, 'repo');
  await mkdir(dir); requireSuccess(await git(dir, ['init']), 'init');
  const state = path.join(root, 'state'), store = new Store(state); enableTasks(store);
  const created = await createTask(store, dir, GOAL, {maxAttempts:options?.maxAttempts, acceptanceMode:options?.acceptanceMode}), id = created.id;
  const plan = store.readArtifact(task(store, id).planRef);
  await submitTaskDraft(store, id, { revision: task(store, id).revision, proposal: draft(plan.probe.probeHash, options) });
  await prepareTask(store, id);
  return { root, dir, state, store, id };
}
const rev = f => task(f.store, f.id).revision;
async function propose(f, itemId, body) {
  return (await submitBootstrapFiles(f.store, f.id, { revision: rev(f), itemId, ...body })).approvalRequest;
}
const approve = (f, request) => approveTask(f.store, f.id, { actor: 'fixture-operator', workflowHash: request.filesetHash, expiresAt: Date.now() + 600000 });
async function create(f, itemId, options) {
  approve(f, await propose(f, itemId, { files: files[itemId].map(p => ({ path: p,
    content: options?.environmentGate && p === 'test/todo.test.mjs'
      ? contents[p] + `import {existsSync} from 'node:fs';\ntest('external fixture capability available',()=>assert.ok(existsSync(${JSON.stringify(options.environmentGate)}),'environment gate unavailable'));\n`
      : options?.passing && p === 'src/todo.mjs' ? FIXED : contents[p] })) }));
  return materializeTask(f.store, f.id, itemId);
}
async function built(options) { const f = await prepared(options); await create(f, 'todo', options); await create(f, 'calendar', options); return f; }
const request = f => ({ executable: process.execPath, args: ['--test', '--test-reporter=tap'], directory: f.dir, timeoutMs: 60000 });

export { built, request };
