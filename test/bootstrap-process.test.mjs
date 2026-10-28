import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { git } from '../src/alpha/workspace.mjs';
import { command, environment, requireSuccess } from '../src/alpha/process.mjs';
import {installHost} from '../src/hosts/install.mjs';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/alpha/store.mjs';
import {enableTasks,task} from '../src/product/tasks.mjs';

// Every step is a separate CLI process sharing only --state, so each re-query
// reads persisted state. environment() forwards no API key and no Docker variable.
const cli = fileURLToPath(new URL('../src/alpha/cli.mjs', import.meta.url));
const GOAL = 'Todo + Calendar 일정 관리 웹앱을 새로 만든다';
const files = { todo: ['package.json', 'src/todo.mjs', 'test/todo.test.mjs'], calendar: ['src/calendar.mjs', 'test/calendar.test.mjs'] };
const contents = { 'package.json': '{"type":"module","scripts":{"test":"node --test"}}\n', 'src/todo.mjs': 'export const todos = [];\n', 'test/todo.test.mjs': "import test from 'node:test';\ntest('todo', () => {});\n" };
const draftFor = plan => ({ schemaVersion: 1, kind: 'BootstrapDraft', objective: GOAL, probeRef: plan.probe.probeHash,
  requirements: ['Create and complete todos', 'Show todos with due dates on a monthly calendar'],
  openQuestions: [], decisions: [{ topic: 'stack', choice: 'Node 24 ESM with node:test, no dependencies', alternatives: ['Vite + React'], rationale: 'Smallest verifiable start' }],
  plannedFiles: [{ path: 'package.json', purpose: 'test script' }, { path: 'src/todo.mjs', purpose: 'todo store' }, { path: 'src/calendar.mjs', purpose: 'calendar grouping' }],
  plannedTests: [{ path: 'test/todo.test.mjs', criteria: ['todoCrud'] }, { path: 'test/calendar.test.mjs', criteria: ['calendarView'] }],
  criteria: [{ id: 'todoCrud', description: 'Todo create/complete', tests: ['test/todo.test.mjs'] }, { id: 'calendarView', description: 'Todos grouped by due date', tests: ['test/calendar.test.mjs'] }],
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

async function emptyRepository() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cf-bootstrap-process-'))), dir = path.join(root, 'repo');
  await mkdir(dir); requireSuccess(await git(dir, ['init']), 'init');
  return { root, dir, state: path.join(root, 'state') };
}
function cliFor(f, entry=cli) {
  const invoke = async (...args) => {
    const r = await command(process.execPath, [entry, '--state', f.state, ...args], { timeoutMs: 60000 });
    assert.equal(r.interrupted, false, args.join(' '));
    return { code: r.exitCode, data: JSON.parse(r.stdout.toString('utf8')) };
  };
  const json = async (name, value) => { const p = path.join(f.root, name); await writeFile(p, JSON.stringify(value)); return p; };
  return { invoke, json };
}
const unborn = async dir => (await git(dir, ['rev-parse', '--verify', 'HEAD'])).exitCode !== 0;

for (const host of ['claude', 'codex']) {
  test(`Native ${host}: installed Skill CLI, Objective, Draft, DAG, approved files and durable Local verification`,async()=>{
    const f=await emptyRepository();await installHost(f.root,host);
    const base=path.join(f.root,host==='codex'?'.agents':'.claude','skills/codefleet');
    assert.match(await readFile(path.join(base,'SKILL.md'),'utf8'),/Supervised Native Local continuation/);
    const {invoke,json}=cliFor(f,path.join(base,'runtime/alpha/cli.mjs'));
    const planned=await invoke('host',host,'plan',GOAL,f.dir,'--attempts','2'),id=planned.data.taskId;
    const budgetStore=new Store(f.state);enableTasks(budgetStore);
    try { assert.equal(task(budgetStore,id).settings.maxAttempts,2); } finally {budgetStore.close();}
    const drafted=await invoke('host',host,'draft',id,await json('draft.json',{revision:planned.data.revision,proposal:draftFor(planned.data.plan)}));
    assert.equal(drafted.code,0);await invoke('host',host,'prepare',id);
    const body={...contents,'src/todo.mjs':"export const todos = ['defect'];\n",
      'test/todo.test.mjs':"import test from 'node:test';import assert from 'node:assert/strict';import {todos} from '../src/todo.mjs';test('todo initial state',()=>assert.deepEqual(todos,[]));\n",
      'src/calendar.mjs':'export const days = [];\n',
      'test/calendar.test.mjs':"import test from 'node:test';import assert from 'node:assert/strict';import {days} from '../src/calendar.mjs';test('calendar initial state',()=>assert.deepEqual(days,[]));\n"};
    for(const itemId of ['todo','calendar']) {
      const revision=(await invoke('host',host,'workflow',id)).data.revision;
      const proposed=await invoke('host',host,'files',id,await json(itemId+'.json',{revision,itemId,files:files[itemId].map(p=>({path:p,content:body[p]}))}));
      assert.equal(proposed.code,2);
      assert.equal((await invoke('objective','materialize',id,itemId)).code,1);
      assert.equal((await invoke('objective','approve',id,'--hash',proposed.data.approvalRequest.filesetHash,'--actor','fixture-user')).code,0);
      assert.equal((await invoke('objective','materialize',id,itemId)).code,0);
    }
    const revision=(await invoke('host',host,'workflow',id)).data.revision;
    const request=await json('request.json',{executable:process.execPath,args:['--test','--test-reporter=tap'],directory:f.dir,timeoutMs:10000});
    const args=['objective','local-step',id,request,'--revision',String(revision),'--request-id',randomUUID(),'--expires',String(Date.now()+120000)];
    const review=await invoke(...args);assert.equal(review.data.action,'AWAIT_APPROVAL');
    const failed=await invoke(...args,'--trust',review.data.reviewHash,'--acknowledge-unisolated');
    assert.equal(failed.data.execution.status,'LOCAL_FAILED',JSON.stringify(failed));
    const reader=new Store(f.state);let evidence;
    try { evidence=reader.readArtifact(failed.data.execution.evidenceRef); } finally {reader.close();}
    const repair=await json('repair.json',{itemId:'todo',evidenceRef:failed.data.execution.evidenceRef,
      hypothesis:'Initialize the store with no entries',diagnostic:'not ok',
      files:[{path:'src/todo.mjs',baseSha256:evidence.fileDigests['src/todo.mjs'],content:contents['src/todo.mjs']}]});
    const repairArgs=['objective','local-step',id,request,repair,'--revision',String((await invoke('host',host,'workflow',id)).data.revision),'--request-id',randomUUID(),'--expires',String(Date.now()+120000)];
    const repairReview=await invoke(...repairArgs);assert.equal(repairReview.data.action,'AWAIT_APPROVAL',JSON.stringify(repairReview));
    const result=await invoke(...repairArgs,'--trust',repairReview.data.reviewHash,'--acknowledge-unisolated');
    assert.equal(result.code,0,JSON.stringify(result));assert.equal(result.data.execution.tests,2);
    assert.notEqual(result.data.execution.reservation.attemptId,failed.data.execution.reservation.attemptId);
    assert.equal(await readFile(path.join(f.dir,'test/todo.test.mjs'),'utf8'),body['test/todo.test.mjs']);
    assert.equal(await readFile(path.join(f.dir,'src/todo.mjs'),'utf8'),contents['src/todo.mjs']);
    assert.equal(result.data.execution.authority,'LOCAL_EXECUTED');assert.equal(result.data.complete,false);
    assert.equal(result.data.snapshot.judgments.tests.outcome,'ESCALATE');
    console.log('P0-4 INSTALLED '+JSON.stringify({host,state:f.state,taskId:id,before:failed.data.execution,after:result.data.execution}));
  });
  test(`process: ${host} plans an empty Git repository, drafts, validates (G3) and prepares the DAG (G4); every step re-queries from a new process`, async () => {
    assert.equal(environment().ANTHROPIC_API_KEY, undefined); assert.equal(environment().CODEFLEET_TEST_DOCKER, undefined);
    const f = await emptyRepository(), { invoke, json } = cliFor(f);
    const planned = await invoke('host', host, 'plan', GOAL, f.dir);
    assert.equal(planned.code, 2);
    assert.deepEqual([planned.data.contractKind, planned.data.plan.probe.state, planned.data.state], ['NEW_PROJECT', 'UNBORN_HEAD', 'NEEDS_INPUT']);
    const id = planned.data.taskId;
    const requeried = await invoke('host', host, 'status', id);
    assert.equal(requeried.code, 0);
    assert.deepEqual([requeried.data.taskId, requeried.data.contractKind, requeried.data.revision], [id, 'NEW_PROJECT', planned.data.revision]);

    const drafted = await invoke('host', host, 'draft', id, await json('draft.json', { revision: planned.data.revision, proposal: draftFor(planned.data.plan) }));
    assert.equal(drafted.code, 0); assert.equal(drafted.data.state, 'VALIDATED');
    assert.equal((await invoke('host', host, 'status', id)).data.state, 'VALIDATED');

    const prepared = await invoke('host', host, 'prepare', id);
    assert.equal(prepared.code, 2); assert.equal(prepared.data.approvalRequest, null);
    const flow = await invoke('host', host, 'workflow', id);
    assert.equal(flow.code, 0);
    assert.deepEqual([flow.data.contractKind, flow.data.executable, flow.data.approved], ['NEW_PROJECT', false, false]);
    assert.match(flow.data.bootstrap.workflowHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(flow.data.bootstrap.items.map(i => i.id), draftFor(planned.data.plan).workItems.map(i => i.id));
    const again = await invoke('host', host, 'workflow', id);
    assert.equal(again.data.bootstrap.workflowHash, flow.data.bootstrap.workflowHash);
    assert.deepEqual(await readdir(f.dir), ['.git']); assert.equal(await unborn(f.dir), true);
  });

  test(`process: ${host} forged references, unapproved execution and a wrong approval hash are refused; only the matching hash materializes`, async () => {
    const f = await emptyRepository(), { invoke, json } = cliFor(f);
    const planned = await invoke('host', host, 'plan', GOAL, f.dir), id = planned.data.taskId;

    // A NEW_PROJECT draft may not cite code: nothing exists to cite.
    const forged = { ...draftFor(planned.data.plan), references: [{ path: 'src/app.js', line: 1 }] };
    const refused = await invoke('host', host, 'draft', id, await json('forged.json', { revision: planned.data.revision, proposal: forged }));
    assert.equal(refused.code, 1); assert.match(refused.data.error, /Invalid BootstrapDraft fields/);
    const afterForged = await invoke('host', host, 'status', id);
    assert.deepEqual([afterForged.data.state, afterForged.data.revision], ['NEEDS_INPUT', planned.data.revision]);

    assert.equal((await invoke('host', host, 'draft', id, await json('draft.json', { revision: planned.data.revision, proposal: draftFor(planned.data.plan) }))).code, 0);
    await invoke('host', host, 'prepare', id);
    const revision = (await invoke('host', host, 'workflow', id)).data.revision;
    const fileset = { revision, itemId: 'todo', files: files.todo.map(p => ({ path: p, content: contents[p] })) };
    const proposed = await invoke('host', host, 'files', id, await json('files.json', fileset));
    assert.equal(proposed.code, 2); assert.equal(proposed.data.approvalRequest.authority, 'REQUEST_ONLY');
    const filesetHash = proposed.data.approvalRequest.filesetHash;

    for (const action of ['approve', 'materialize', 'clarify']) {
      const r = await invoke('host', host, action, id, ...(action === 'materialize' ? ['todo'] : []));
      assert.equal(r.code, 1, action); assert.match(r.data.error, /approval and completion cannot be set by host/, action);
    }
    const run = await invoke('objective', 'run', id);
    assert.equal(run.code, 2); assert.match(run.data.blocked, /no executable Run/);
    const unapproved = await invoke('objective', 'materialize', id, 'todo');
    assert.equal(unapproved.code, 1); assert.match(unapproved.data.error, /WAITING_APPROVAL/);
    const wrong = await invoke('objective', 'approve', id, '--hash', '0'.repeat(64), '--actor', 'operator');
    assert.equal(wrong.code, 1); assert.match(wrong.data.error, /No proposed fileset matches the approval hash/);
    assert.equal((await invoke('objective', 'materialize', id, 'todo')).code, 1, 'a wrong hash must not approve');
    assert.deepEqual(await readdir(f.dir), ['.git']);

    // Positive control: the refusals above are not a broken path.
    assert.equal((await invoke('objective', 'approve', id, '--hash', filesetHash, '--actor', 'operator')).code, 0);
    const made = await invoke('objective', 'materialize', id, 'todo');
    assert.equal(made.code, 0); assert.equal(made.data.materialization.status, 'MATERIALIZED');
    assert.deepEqual([made.data.verification, made.data.complete], ['NOT_RUN', false]);
    for (const p of files.todo) assert.equal(await readFile(path.join(f.dir, p), 'utf8'), contents[p]);
    assert.equal(await unborn(f.dir), true);
  });
}

test('CLI creation rejects invalid budgets before recording a Task',async()=>{
  const f=await emptyRepository(),{invoke}=cliFor(f);
  for(const [flag,value] of [['--attempts','6'],['--attempts','1.5'],['--timeout','29'],['--budget','0']]) {
    assert.equal((await invoke('objective','plan',GOAL,f.dir,flag,value)).code,1);
  }
  assert.deepEqual((await invoke('objective','status')).data.tasks,[]);
});
