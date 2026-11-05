import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { POLICY } from '../src/workflow/definition.mjs';
import { built, request, prepared, propose, approve } from './fixtures/bootstrap-reservation.mjs';
import { task } from '../src/product/tasks.mjs';
import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const backend = { prepare: async()=>{}, verify: async()=>{}, cleanup: async()=>{} };
function fixture() {
  const graph={policySnapshotRef:hash(POLICY)};
  graph.workflowHash=hash({kind:'graph'});
  const workflow={id:'run-fixture',kind:'workflow',revision:1,contract:graph,
    contractHash:graph.workflowHash,repo:'/fixture-repo',base:'a'.repeat(40),
    state:'READY',control:'run'};
  const store={
    get:()=>workflow,
    readArtifact:()=>{throw Error('unavailable')},
    db:{prepare:()=>({get:()=>({digest:workflow.contractHash,expires:Date.now()+60000})})}
  };
  return {store,workflow};
}
test('does not authorize Host live by default',async()=>{
 const {store}=fixture();
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'codex-fixture'});
 await assert.rejects(api.runExistingWorkflow('run-fixture'),/disabled/);
 await assert.rejects(api.planExisting('/fixture-repo','Goal statement',{cwd:process.cwd()}),/disabled/);
});
test('Workspace write requires trusted independent scope grant callback',()=>{
 const {store}=fixture();
 assert.throws(()=>createCodexMvpFacade(store,{executable:process.execPath,
   model:'codex-fixture',workspaceWrite:true}),/grant/);
});
test('destination verification and actual backend must be fully supplied',()=>{
 const {store}=fixture();
 assert.throws(()=>createCodexMvpFacade(store,{executable:process.execPath,
   model:'codex-fixture',destinationDelivery:{authorize:async()=>true}}),/criterion observer/);
 assert.throws(()=>createCodexMvpFacade(store,{executable:process.execPath,
   model:'codex-fixture',verificationBackend:{verify:async()=>{}}}),/backend/);
});
test('approved Workflow cannot start without exact independently trusted grant',async()=>{
 const {store}=fixture();let scopes=[];
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'codex-fixture',
   enableHostTurns:true,verificationBackend:backend,
   authorizeWorkflow:async scope=>{scopes.push(scope);return false}});
 await assert.rejects(api.runExistingWorkflow('run-fixture'),/grant denied/);
 assert.equal(scopes.length,1);
 assert.equal(scopes[0].kind,'CODEFLEET_MANAGED_WORKFLOW_SCOPE_V1');
 assert.equal(scopes[0].executionMode,'HOST_READ_ONLY_PROPOSAL');
 assert.equal(scopes[0].protectedVerified,false);
});
test('Workflow revision or repo change while reviewing grant stops before launch',async()=>{
 const {store,workflow}=fixture();
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'codex-fixture',
   enableHostTurns:true,verificationBackend:backend,
   authorizeWorkflow:async()=>{workflow.repo='/other-repo';return true;}});
 await assert.rejects(api.runExistingWorkflow('run-fixture'),/scope changed/);
});
test('a replacement Workflow approval cannot reuse an earlier Host execution grant',async()=>{
 for (const rotate of [
   row=>({...row,actor:'operator-replacement'}),
   row=>({...row,expires:row.expires+15000})
 ]) {
   const {store,workflow}=fixture();
   let current={digest:workflow.contractHash,actor:'operator-original',
     expires:Date.now()+60000};
   // Both approval records are independently valid for the same Workflow.
   // Rotation during asynchronous owner review must nevertheless revoke the
   // grant binding before Controller/Host execution begins.
   store.db.prepare=()=>({get:()=>({...current})});
   const scopes=[];
   const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
     enableHostTurns:true,verificationBackend:backend,
     authorizeWorkflow:async scope=>{
       scopes.push(scope);
       current=rotate(current);
       return true;
     }});
   await assert.rejects(api.runExistingWorkflow('run-fixture'),/scope changed/);
   assert.equal(scopes.length,1);
   assert.match(scopes[0].approvalSnapshotHash,/^[a-f0-9]{64}$/);
 }
});

test('host execution options cannot be model-controlled through unexpected fields',async()=>{
 const {store}=fixture();
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'codex-fixture',
   enableHostTurns:true,verificationBackend:backend,authorizeWorkflow:async()=>true});
 await assert.rejects(api.runExistingWorkflow('run-fixture',{provider:'other'}),/Unrecognized/);
});

test('planning Host cwd must match the approved repo path',async()=>{
 const {store}=fixture();let calls=0;
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
   enableHostTurns:true,authorizePlanning:async()=>{calls++;return true;}});
 await assert.rejects(api.planExisting('/approved-repo','A bounded natural language goal',{
   cwd:process.cwd()}),/cwd must equal/);
 assert.equal(calls,0);
});

test('Bootstrap filesystem effects remain unavailable without independent grants',async()=>{
 const {store}=fixture();
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
   enableHostTurns:true});
 await assert.rejects(api.materializeApprovedBootstrap('task','item'),/materialization grant required/);
 await assert.rejects(api.verifyApprovedBootstrap('task','item',{}),/verification grant required/);
});

test('Bootstrap exact verification grant is invalidated by a task revision change with identical bytes',async t=>{
  const f=await built({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let grants=0,backendCalls=0;
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapVerification:async scope=>{
      grants++;
      assert.equal(scope.taskId,f.id);
      assert.equal(scope.itemId,'tests');
      assert.equal(scope.revision,task(f.store,f.id).revision);
      assert.equal(scope.workflowHash,task(f.store,f.id).bootstrap.workflowHash);
      const changed=task(f.store,f.id);changed.revision++;
      f.store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=?')
        .run(JSON.stringify(changed),changed.revision,f.id);
      return true;
    },
    bootstrapVerifierBackend:{authorize:async()=>{backendCalls++;throw Error('unexpected execution');}}
  });
  await assert.rejects(api.verifyApprovedBootstrap(f.id,'tests',request(f)),
    /verification scope changed during review/);
  assert.equal(grants,1);
  assert.equal(backendCalls,0);
  assert.equal(task(f.store,f.id).bootstrap.verifications?.tests,undefined);
});
test('Bootstrap verification grant rejects a swapped immutable Plan even with identical workflow and file bytes',async t=>{
  const f=await built({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const original=task(f.store,f.id);
  const plan=f.store.readArtifact(original.planRef);
  const substituted=f.store.artifact({...plan,unreviewedMetadata:'different immutable Plan'});
  let grants=0,backendCalls=0;
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapVerification:async scope=>{
      grants++;
      assert.equal(scope.planRef,original.planRef);
      assert.equal(scope.workflowRef,original.bootstrap.workflowRef);
      assert.equal(scope.repo,f.dir);
      assert.equal(Object.isFrozen(scope.fileDigests),true);
      assert.throws(()=>{scope.fileDigests['outside-scope']='forged';},TypeError);
      // Preserve revision, Workflow hash, repo and command/tree hashes. Only
      // the Plan artifact pointer moves during owner review.
      f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?')
        .run(JSON.stringify({...original,planRef:substituted}),f.id);
      return true;
    },
    bootstrapVerifierBackend:{authorize:async()=>{backendCalls++;throw Error('unexpected execution');}}
  });
  await assert.rejects(api.verifyApprovedBootstrap(f.id,'tests',request(f)),
    /verification scope changed during review/);
  assert.equal(grants,1);
  assert.equal(backendCalls,0);
  assert.equal(task(f.store,f.id).bootstrap.verifications?.tests,undefined);
});

test('Bootstrap exact verification grant rejects a mutable command changed during review',async t=>{
  const f=await built({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const command=request(f);
  let grants=0,backendCalls=0;
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapVerification:async scope=>{
      grants++;
      assert.equal(scope.protection,'UNPROTECTED');
      command.args.push('--test-name-pattern=not-reviewed');
      return true;
    },
    bootstrapVerifierBackend:{authorize:async()=>{backendCalls++;throw Error('unexpected execution');}}
  });
  await assert.rejects(api.verifyApprovedBootstrap(f.id,'tests',command),
    /verification command\/tree changed during review/);
  assert.equal(grants,1);
  assert.equal(backendCalls,0);
  assert.equal(task(f.store,f.id).bootstrap.verifications?.tests,undefined);
});


const pendingTodoFiles = [
  { path:'package.json', content:'{"type":"module"}\n' },
  { path:'src/todo.mjs', content:'export const add = (list, t) => [...list, t];\n' },
  { path:'test/todo.test.mjs', content:"import test from 'node:test';\n" }
];

test('trusted NEW_PROJECT materialization uses exact approved Plan and Fileset', async t => {
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  approve(f,await propose(f,'todo',{files:pendingTodoFiles}));
  const current=task(f.store,f.id),runId=current.bootstrap.filesets.todo;
  const scopes=[];
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapMaterialization:async scope=>{scopes.push(scope);return true;}
  });
  const result=await api.materializeApprovedBootstrap(f.id,'todo');
  assert.equal(result.status,'MATERIALIZED');
  assert.equal(result.complete,false);
  assert.equal(scopes.length,1);
  assert.equal(scopes[0].repo,f.dir);
  assert.equal(scopes[0].planRef,current.planRef);
  assert.equal(scopes[0].filesetHash,f.store.get(runId).contractHash);
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),pendingTodoFiles[1].content);
});

test('Bootstrap Fileset owner grant cannot be reused after Plan destination substitution', async t => {
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  approve(f,await propose(f,'todo',{files:pendingTodoFiles}));
  const original=task(f.store,f.id),runId=original.bootstrap.filesets.todo;
  let grants=0;
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapMaterialization:async scope=>{
      grants++;
      assert.equal(scope.planRef,original.planRef);
      const plan=f.store.readArtifact(original.planRef);
      const redirected=f.store.artifact({
        ...plan,probe:{...plan.probe,root:f.dir+'-unreviewed'}
      });
      // Simulate a stale mutable task pointer during asynchronous human review,
      // without changing its revision, Fileset or Workflow hash.
      f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?')
        .run(JSON.stringify({...original,planRef:redirected}),f.id);
      return true;
    }
  });
  await assert.rejects(api.materializeApprovedBootstrap(f.id,'todo'),
    /Bootstrap scope changed during review/);
  assert.equal(grants,1);
  assert.equal(f.store.get(runId).state,'READY');
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs')),{code:'ENOENT'});
});
