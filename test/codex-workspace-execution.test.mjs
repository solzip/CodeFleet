import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,link,symlink } from 'node:fs/promises';
import { join,dirname,basename } from 'node:path';
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
test('approved source drift during an asynchronous workspace grant prevents a Host Turn',async t=>{
 const f=await fixture(t);let called=false;
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,
  contract:f.contract,context:f.context,executable:process.execPath,model:'fixture',
  approved:async scope=>{
   assert.equal(scope.baseTreeHash.length,64);
   await writeFile(join(f.root,'src/a.js'),'export const value = 99;');
   return true;
  },transport:async()=>{called=true;return hostReceipt();}}),
  /Candidate snapshot changed during Host workspace authorization/);
 assert.equal(called,false);
 assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),'export const value = 99;');
});
test('out-of-scope drift during workspace authorization blocks before Host Turn',async t=>{
 const f=await fixture(t);let called=false;
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,
  contract:f.contract,context:f.context,executable:process.execPath,model:'fixture',
  approved:async()=>{
   await writeFile(join(f.root,'src/b.js'),'unreviewed during grant');
   return true;
  },transport:async()=>{called=true;return hostReceipt();}}),
  /Candidate snapshot changed during Host workspace authorization/);
 assert.equal(called,false);
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

const unsupportedLink = e => ['EPERM','EACCES','ENOSYS','ENOTSUP','EXDEV'].includes(e?.code);

test('hard-linked Candidate input is rejected before any workspace approval or Host Turn',async t=>{
 const f=await fixture(t), external=await mkdtemp(join(tmpdir(),'cf-host-external-'));
 t.after(()=>rm(external,{recursive:true,force:true}));
 const outside=join(external,'shared.js');
 await writeFile(outside,'export const value = 1;');
 await rm(join(f.root,'src/a.js'));
 try {await link(outside,join(f.root,'src/a.js'));}
 catch(e){if(unsupportedLink(e)){t.skip('Hard links unavailable on runner');return;}throw e;}
 let reviewed=false,transported=false;
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,contract:f.contract,
  context:f.context,executable:process.execPath,model:'fixture',
  approved:async()=>{reviewed=true;return true;},
  transport:async()=>{transported=true;return hostReceipt();}}),/hard-linked file/);
 assert.equal(reviewed,false);
 assert.equal(transported,false);
 assert.equal(await readFile(outside,'utf8'),'export const value = 1;');
});

test('Host hard-link substitution cannot be accepted as a bounded Candidate edit',async t=>{
 const f=await fixture(t), external=await mkdtemp(join(tmpdir(),'cf-host-external-'));
 t.after(()=>rm(external,{recursive:true,force:true}));
 const outside=join(external,'shared.js');
 await writeFile(outside,'export const value = 1;');
 // Probe link support before the simulated Turn to avoid a false PASS.
 const probe=join(f.root,'probe-link');
 try {await link(outside,probe);}
 catch(e){if(unsupportedLink(e)){t.skip('Hard links unavailable on runner');return;}throw e;}
 await rm(probe);
 let transported=false;
 await assert.rejects(captureCodexWorkspaceEdits({candidateDirectory:f.root,contract:f.contract,
  context:f.context,executable:process.execPath,model:'fixture',
  approved:async()=>true,transport:async()=>{
   transported=true;
   await rm(join(f.root,'src/a.js'));
   await link(outside,join(f.root,'src/a.js'));
   await writeFile(join(f.root,'src/a.js'),'export const value = 2;');
   return hostReceipt();
  }}),/hard-linked file/);
 assert.equal(transported,true);
 // UNPROTECTED mode cannot undo outside effects, only reject the receipt.
 assert.equal(await readFile(outside,'utf8'),'export const value = 2;');
});

test('linked Candidate directory ancestor is rejected before workspace authorization',async t=>{
 const f=await fixture(t), alias=await mkdtemp(join(tmpdir(),'cf-host-alias-'));
 t.after(()=>rm(alias,{recursive:true,force:true}));
 const ancestor=join(alias,'linked-parent');
 try {await symlink(dirname(f.root),ancestor,process.platform==='win32'?'junction':'dir');}
 catch(e){if(unsupportedLink(e)){t.skip('Directory links unavailable on runner');return;}throw e;}
 let authorized=false,transported=false;
 await assert.rejects(captureCodexWorkspaceEdits({
  candidateDirectory:join(ancestor,basename(f.root)),contract:f.contract,context:f.context,
  executable:process.execPath,model:'fixture',
  approved:async()=>{authorized=true;return true;},
  transport:async()=>{transported=true;return hostReceipt();}
 }),/ancestor link|ancestor|Junction/);
 assert.equal(authorized,false);
 assert.equal(transported,false);
});
