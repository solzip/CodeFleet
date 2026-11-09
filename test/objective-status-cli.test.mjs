import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveStatusArgs, reportObjective } from '../src/product/objective-status-cli.mjs';
import { dispatchProduct, productCli } from '../src/product/cli.mjs';
import { Store } from '../src/alpha/store.mjs';
import { enableRepairStorage } from '../src/workflow/repair-generations.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('CLI parsing requires explicit state directory and Objective ID',()=>{
 const parsed=objectiveStatusArgs(['--state-dir','./local-state','--objective-id','objective-1']);
 assert.equal(parsed.objectiveId,'objective-1');
 assert.match(parsed.stateDirectory,/local-state$/);
 for (const argv of [[],['--state-dir','x'],['--state-dir','x','--objective-id',''],
  ['--state-dir','x','--objective-id','x','--execute'],
  ['--state-dir','x','--objective-id','--dangerously-bypass']])
  assert.throws(()=>objectiveStatusArgs(argv),/Usage/);
});
test('read-only Store is opened and always closed on successful inspection',async()=>{
 let state,closed=false;
 const result=await reportObjective(['--state-dir','.','--objective-id','objective-a'],{
   open: dir=>{state=dir;return {close:()=>{closed=true}};},
   inspect:async(_store,id)=>({objectiveId:id,status:'VERIFIED_CANDIDATE_AVAILABLE',objectiveComplete:false})
 });
 assert.ok(state);assert.equal(result.objectiveId,'objective-a');
 assert.equal(result.objectiveComplete,false);assert.equal(closed,true);
});
test('read-only Store is closed after an inspection error',async()=>{
 let closed=false;
 await assert.rejects(reportObjective(['--state-dir','.','--objective-id','objective-a'],{
   open:()=>({close:()=>{closed=true}}),
   inspect:async()=>{throw Error('target drift')}
 }),/target drift/);
 assert.equal(closed,true);
});

test('public delivered-status rejects flags and does not begin Host or mutate State', async t => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'codefleet-objective-readonly-'));
  t.after(async () => rm(stateDirectory, { recursive:true, force:true }));
  const state = new Store(stateDirectory);
  state.create({
    id:'workflow-public-status',kind:'workflow',revision:1,state:'COMPLETED',
    finalRunId:'candidate-run',acceptedHash:'accepted-ref',
    reportedCostUsd:0,unknownCostAttempts:1
  });
  const oldEvents=state.events('workflow-public-status').length;
  state.close();
  const result=await productCli(['delivered-status','workflow-public-status'],stateDirectory);
  assert.equal(result.exitCode,2);
  assert.equal(result.data.kind,'CODEFLEET_OBJECTIVE_STATUS_V1');
  assert.equal(result.data.status,'VERIFIED_CANDIDATE_AVAILABLE');
  assert.equal(result.data.objectiveComplete,false);
  assert.equal(result.data.liveHostVerified,false);
  assert.equal(result.data.cost.unknownTurns,1);
  // A reporting CLI cannot accept user-supplied capabilities, grant or model flags.
  for (const forbidden of [
    ['delivered-status','workflow-public-status','--allow-model'],
    ['delivered-status','workflow-public-status','--trust','anything'],
    ['delivered-status','workflow-public-status','another-run'],
    ['delivered-status']
  ]) {
    const denied=await productCli(forbidden,stateDirectory);
    assert.equal(denied.exitCode,1);
  }
  const checked=new Store(stateDirectory,{readOnly:true});
  try {
    assert.equal(checked.events('workflow-public-status').length,oldEvents);
    assert.equal(checked.get('workflow-public-status').state,'COMPLETED');
  } finally { checked.close(); }
});

test('delivered-status dispatch exits without loading Task or workflow execution state', async () => {
  let calls=0;
  const store={
    get(id) {
      calls++;
      assert.equal(id,'accepted-workflow');
      return {id,kind:'workflow',revision:1,state:'COMPLETED',
        finalRunId:'candidate-run',acceptedHash:'candidate-ref'};
    },
    readArtifact() { throw Error('No artifact read without delivery'); }
  };
  const result=await dispatchProduct(['delivered-status','accepted-workflow'],{store});
  assert.equal(result.data.status,'VERIFIED_CANDIDATE_AVAILABLE');
  assert.equal(result.exitCode,2);
  assert.equal(calls,1);
  await assert.rejects(dispatchProduct(['delivered-status','accepted-workflow','--allow-model'],{store}),
    /delivered-status requires/);
  assert.equal(calls,1);
});

test('read-only workflow-progress shows the current Repair generation and unresolved DAG dependencies', async t => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'codefleet-progress-readonly-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const state = new Store(stateDirectory);
  enableRepairStorage(state);
  state.create({
    id: 'workflow-progress-fixture', kind: 'workflow', revision: 1,
    state: 'RUNNING', contractHash: 'fixture-workflow-hash',
    contract: { schemaVersion: 1, items: [
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: ['a'] }
    ] },
    states: { a: 'READY', b: 'PENDING' },
    attempts: 2, reportedCostUsd: 0, unknownCostAttempts: 0
  });
  state.create({ id: 'attempt-a-1', state: 'WAITING_HUMAN', reason: 'first generation failed',
    attempts: 1, reportedCostUsd: 0.1, unknownCostAttempts: 0 });
  state.create({ id: 'attempt-a-2', state: 'GENERATING', reason: 'repair generation in flight',
    attempts: 1, reportedCostUsd: 0, unknownCostAttempts: 1 });
  state.db.prepare('INSERT INTO workflow_attempts VALUES (?,?,?,?,?)')
    .run('workflow-progress-fixture', 'a', 'attempt-a-1', 1, 'FAILED');
  state.db.prepare('INSERT INTO workflow_attempt_generations VALUES (?,?,?,?,?,?,?,?)')
    .run('workflow-progress-fixture', 'a', 2, 'attempt-a-2', 1, 'STARTED',
      'attempt-a-1', 'failed-evidence-ref');
  const eventsBefore = state.events('workflow-progress-fixture').length;
  state.close();

  const result = await productCli(['workflow-progress','workflow-progress-fixture'], stateDirectory);
  assert.equal(result.exitCode, 2);
  assert.equal(result.data.kind, 'CODEFLEET_WORKFLOW_PROGRESS_V1');
  assert.equal(result.data.workflowState, 'RUNNING');
  assert.equal(result.data.workItems[0].state, 'GENERATING');
  assert.deepEqual(result.data.workItems[0].attempt, {
    childId: 'attempt-a-2', generation: 2, status: 'STARTED'
  });
  assert.deepEqual(result.data.workItems[1].waitingOn, ['a']);
  assert.deepEqual(result.data.activeAttemptIds, ['attempt-a-2']);
  assert.deepEqual(result.data.continuation.itemIds, ['a']);
  assert.equal(result.data.continuation.status, 'RECONCILE_REQUIRED');
  assert.equal(result.data.continuation.automaticReplay, false);
  assert.equal(result.data.continuation.executionGranted, false);
  assert.equal(result.data.objective.status, 'INCOMPLETE');
  assert.equal(result.data.objectiveComplete, false);
  assert.equal(result.data.executionGranted, false);
  assert.equal(result.data.hostLiveAcceptance, 'UNVERIFIED');

  for (const command of [
    ['workflow-progress','workflow-progress-fixture','--allow-model'],
    ['workflow-progress','workflow-progress-fixture','--trust','unreviewed'],
    ['workflow-progress','workflow-progress-fixture','extra'],
    ['workflow-progress']
  ]) {
    const denied = await productCli(command, stateDirectory);
    assert.equal(denied.exitCode, 1);
  }
  const checked = new Store(stateDirectory, { readOnly: true });
  try {
    assert.equal(checked.events('workflow-progress-fixture').length, eventsBefore);
    assert.equal(checked.get('workflow-progress-fixture').state, 'RUNNING');
  } finally { checked.close(); }
});

test('existing Workflow continuation exposes approval and Objective handoffs without writing State', async t => {
  const stateDirectory = await mkdtemp(join(tmpdir(), 'codefleet-workflow-handoff-'));
  t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const store = new Store(stateDirectory);
  const base = {
    kind: 'workflow', revision: 1, contractHash: 'offline-synthetic-hash',
    contract: { schemaVersion: 1, items: [{ id: 'change', dependencies: [] }] },
    attempts: 0, reportedCostUsd: 0, unknownCostAttempts: 0
  };
  store.create({ ...base, id: 'workflow-awaits-approval', state: 'WAITING_APPROVAL',
    states: { change: 'PENDING' } });
  store.create({ ...base, id: 'workflow-candidate-only', state: 'COMPLETED',
    states: { change: 'SUCCEEDED' } });
  const eventCounts = Object.fromEntries(
    ['workflow-awaits-approval', 'workflow-candidate-only']
      .map(id => [id, store.events(id).length]));
  store.close();

  const pending = await productCli(['workflow-progress', 'workflow-awaits-approval'], stateDirectory);
  assert.equal(pending.exitCode, 2);
  assert.deepEqual(pending.data.dependencyReadyIds, ['change']);
  assert.equal(pending.data.continuation.status, 'AWAIT_WORKFLOW_APPROVAL');
  assert.equal(pending.data.continuation.executionGranted, false);
  assert.equal(pending.data.continuation.automaticReplay, false);

  const candidate = await productCli(['workflow-progress', 'workflow-candidate-only'], stateDirectory);
  assert.equal(candidate.exitCode, 2);
  assert.equal(candidate.data.objectiveComplete, false);
  assert.equal(candidate.data.continuation.status, 'OBJECTIVE_EVIDENCE_REQUIRED');
  assert.equal(candidate.data.continuation.executionGranted, false);

  const checked = new Store(stateDirectory, { readOnly: true });
  try {
    for (const [id, count] of Object.entries(eventCounts))
      assert.equal(checked.events(id).length, count, 'Read-only status cannot create a Workflow event');
  } finally { checked.close(); }
});
