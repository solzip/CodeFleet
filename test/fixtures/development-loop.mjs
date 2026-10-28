// Offline harness and immutable test input. No model implementation or invocation.
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../../src/alpha/store.mjs';
import { git } from '../../src/alpha/workspace.mjs';
import { requireSuccess } from '../../src/alpha/process.mjs';
import { enableTasks, createTask, submitTaskDraft, prepareTask, task, submitBootstrapFiles, approveTask, materializeTask } from '../../src/product/tasks.mjs';

export const objective = '제목 정규화와 Todo 생성 기능을 구현하고 실제 테스트로 검증한다.';
export const fixedFiles = {
  'package.json': '{"type":"module"}\n',
  'test/normalize-title.test.mjs': `import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle } from '../src/normalize-title.mjs';
test('trim title', () => assert.equal(normalizeTitle('  hello  '), 'hello'));
test('reject empty title', () => { for (const value of ['', '   ', '\\t\\n']) assert.throws(() => normalizeTitle(value)); });
`,
  'test/create-todo.test.mjs': `import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo } from '../src/create-todo.mjs';
test('create normalized todo', () => assert.deepEqual(createTodo('  hello  '), { title: 'hello', completed: false }));
test('reject blank todo', () => assert.throws(() => createTodo('  ')));
test('independent objects', () => assert.notEqual(createTodo('one'), createTodo('one')));
`
};
export function draft(probeRef) {
  const item = (id, kind, dependencies, files, acceptanceCriteria) => ({ id, kind, dependencies, files, acceptanceCriteria });
  return { schemaVersion: 1, kind: 'BootstrapDraft', objective, probeRef,
    requirements: ['Trim and reject blank titles', 'Create a Todo using normalizeTitle'], openQuestions: [],
    decisions: [{ topic: 'runtime', choice: 'Node ESM', alternatives: ['external dependencies'], rationale: 'No installation required' }],
    plannedFiles: ['package.json', 'src/normalize-title.mjs', 'src/create-todo.mjs'].map(p => ({ path: p, purpose: p })),
    plannedTests: [{ path: 'test/normalize-title.test.mjs', criteria: ['normalize'] }, { path: 'test/create-todo.test.mjs', criteria: ['todo'] }],
    criteria: [{ id: 'normalize', description: 'Trim surrounding whitespace and reject blank title', tests: ['test/normalize-title.test.mjs'] },
      { id: 'todo', description: 'Return a fresh {title: normalizeTitle(input), completed: false} object; reject blank input', tests: ['test/create-todo.test.mjs'] }],
    scope: { includes: ['two source modules and fixed tests'], excludes: ['deployment', 'model execution without separate approval'] }, risks: ['Local evidence is unprotected'],
    workItems: [item('requirements', 'planning', [], [], ['contract recorded']),
      item('fixed-tests', 'local-edit', ['requirements'], Object.keys(fixedFiles), ['operator-owned fixed tests']),
      item('normalize', 'local-edit', ['fixed-tests'], ['src/normalize-title.mjs'], ['normalize']),
      item('verify-normalize', 'local-verification', ['normalize'], [], ['normalize']),
      item('todo', 'local-edit', ['verify-normalize'], ['src/create-todo.mjs'], ['todo']),
      item('verify-integrated', 'local-verification', ['todo'], [], ['normalize', 'todo']),
      item('protected-review', 'protected-verification', ['verify-integrated'], [], ['protected evidence required'])] };
}
export async function prepare(root, { maxAttempts = 3 } = {}) {
  await mkdir(root, { recursive: true }); root = await realpath(root);
  const repo = path.join(root, 'repo'), state = path.join(root, 'state');
  await mkdir(repo); requireSuccess(await git(repo, ['init']), 'isolated fixture git init');
  const store = new Store(state); enableTasks(store);
  try {
    const created = await createTask(store, repo, objective, { maxAttempts, timeoutSeconds: 120 });
    const id = created.id, plan = store.readArtifact(task(store, id).planRef);
    await submitTaskDraft(store, id, { revision: task(store, id).revision, proposal: draft(plan.probe.probeHash) });
    if (task(store, id).state !== 'VALIDATED') throw Error('Fixture Draft was not validated');
    await prepareTask(store, id);
    const proposed = await submitBootstrapFiles(store, id, { revision: task(store, id).revision, itemId: 'fixed-tests',
      files: Object.entries(fixedFiles).map(([path, content]) => ({ path, content })) });
    approveTask(store, id, { actor: 'fixture-test-owner', workflowHash: proposed.approvalRequest.filesetHash, expiresAt: Date.now() + 3600000 });
    await materializeTask(store, id, 'fixed-tests', { freshOnly: true });
    return { root, repo, state, id };
  } finally { store.close(); }
}
