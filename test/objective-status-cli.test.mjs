import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveStatusArgs, reportObjective } from '../src/product/objective-status-cli.mjs';
import { dispatchProduct, productCli } from '../src/product/cli.mjs';
import { Store } from '../src/alpha/store.mjs';
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
