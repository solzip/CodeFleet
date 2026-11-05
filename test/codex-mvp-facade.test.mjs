import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { POLICY } from '../src/workflow/definition.mjs';
import { built, request } from './fixtures/bootstrap-reservation.mjs';
import { task } from '../src/product/tasks.mjs';
import { rm } from 'node:fs/promises';

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
