import test from 'node:test';
import assert from 'node:assert/strict';
import { objectiveStatusArgs, reportObjective } from '../src/product/objective-status-cli.mjs';

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
