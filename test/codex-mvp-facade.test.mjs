import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { POLICY } from '../src/workflow/definition.mjs';

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
