import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureCodexWorkspaceEdits } from '../src/hosts/codex-workspace-execution.mjs';
import { createCodexTurnProtocol } from '../src/hosts/codex-app-server-session.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'cf-host-workspace-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await mkdir(join(root,'test'));
  await writeFile(join(root,'src/a.js'),'export const value = 1;');
  await writeFile(join(root,'src/b.js'),'export const stable = true;');
  await writeFile(join(root,'test/a.test.js'),'// protected regression');
  return {root,contract:{goal:'Implement the approved source change in this existing project',
    files:['src/a.js'],context:['src/a.js'],tests:['test/a.test.js']},
    context:{'src/a.js':'export const value = 1;','test/a.test.js':'// protected regression'}};
}
const hostReceipt=()=>({terminalStatus:'completed',threadId:'host-thread',turnId:'host-turn',
  executionMode:'HOST_WORKSPACE_WRITE_UNPROTECTED',authority:'PROVIDER_REPORTED_ONLY',
  protectedVerified:false,toolItems:[{id:'file-tool-1',type:'fileChange',status:'completed'}]});
test('real candidate byte change becomes a bounded proposal, not an evidence PASS',async t=>{
 const f=await fixture(t);let calls=0;
 const r=await captureCodexWorkspaceEdits({candidateDirectory:f.root,contract:f.contract,
  context:f.context,executable:process.execPath,model:'fixture-model',
  approved:async policy=>{assert.deepEqual(policy.allowedFiles,['src/a.js']);return true;},
  transport:async request=>{
   calls++;assert.equal(request.workspaceWrite,true);
   assert.equal(request.cwd,f.root);
   await writeFile(join(f.root,'src/a.js'),'export const value = 2;');
   return hostReceipt();
  }});
 assert.equal(calls,1);
 assert.equal(r.mode,'HOST_WORKSPACE_WRITE_UNPROTECTED');
 assert.equal(r.proposal.edits[0].oldText,'export const value = 1;');
 assert.equal(r.proposal.edits[0].newText,'export const value = 2;');
 assert.equal(r.hostReceipt.protectedVerified,false);
});
test('approval denial causes zero Host calls and source remains unchanged',async t=>{
 const f=await fixture(t);let called=false;
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,
  contract:f.contract,context:f.context,executable:process.execPath,model:'fixture',
  approved:async()=>false,transport:async()=>{called=true;return hostReceipt();}}),/not granted/);
 assert.equal(called,false);
 assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),'export const value = 1;');
});
test('out-of-scope file changes are detected from actual bytes',async t=>{
 const f=await fixture(t);
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,
  contract:f.contract,context:f.context,executable:process.execPath,model:'fixture',
  approved:async()=>true,transport:async()=>{
    await writeFile(join(f.root,'src/b.js'),'modified without grant');return hostReceipt();
  }}),/out-of-scope/);
});
test('new files and deletions are rejected even when Host text says done',async t=>{
 const f=await fixture(t);
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,
  contract:f.contract,context:f.context,executable:process.execPath,model:'fixture',
  approved:async()=>true,transport:async()=>{
    await writeFile(join(f.root,'src/extra.js'),'unapproved');return hostReceipt();
  }}),/introduced or deleted/);
});
test('read-only session remains tool rejecting; workspace mode produces scoped policy',()=>{
 const base={cwd:process.cwd(),model:'fixture',prompt:'return JSON summary',
   outputSchema:{type:'object'}};
 const p=createCodexTurnProtocol(base);
 p.accept({id:1,result:{}});
 assert.throws(()=>p.accept({method:'item/started',params:{
   threadId:'t',turnId:'u',item:{id:'tool',type:'fileChange',status:'completed'}
 }}),/tool|unbound/);
 const writable=createCodexTurnProtocol({...base,workspaceWrite:true});
 const next=writable.accept({id:1,result:{}});
 assert.equal(next[1].params.sandbox,'workspace-write');
 const turn=writable.accept({id:2,result:{thread:{id:'thread-1'}}});
 assert.deepEqual(turn[0].params.sandboxPolicy.writableRoots,[process.cwd()]);
});
