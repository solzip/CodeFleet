import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { POLICY, definition } from '../src/workflow/definition.mjs';
import { built, request, prepared, propose, approve } from './fixtures/bootstrap-reservation.mjs';
import { task } from '../src/product/tasks.mjs';
import { rm, readFile, realpath, mkdtemp, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const backend = { prepare: async()=>{}, verify: async()=>{}, cleanup: async()=>{} };
function fixture() {
  const source = {schemaVersion:1,goal:'Repair scoped regression with verified changes',
    files:['src/example.mjs'],context:['src/example.mjs'],
    tests:['test/example.test.mjs'],maxAttempts:1,timeoutSeconds:300,
    attemptBudgetUsd:1,delivery:{mode:'local'}};
  const graph=definition(source,{workflowId:'fixture',
    base:'a'.repeat(40),items:[{id:'fix',dependencies:[],priority:0,
      files:['src/example.mjs'],tests:['test/example.test.mjs'],
      acceptanceCriteria:['Regression passes']}]});
  const workflow={id:'run-fixture',kind:'workflow',revision:1,contract:graph,
    contractHash:graph.workflowHash,sourceRef:hash(source),graphRef:hash(graph),
    repo:'/fixture-repo',base:'a'.repeat(40),state:'READY',control:'run'};
  const store={
    get:()=>workflow,
    readArtifact:ref=>{if(ref!==workflow.sourceRef)throw Error('unavailable');return source;},
    db:{prepare:()=>({get:()=>({digest:workflow.contractHash,expires:Date.now()+60000})})}
  };
  return {store,workflow,source};
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
 assert.equal(scopes[0].executablePath,process.execPath);
 assert.equal(scopes[0].executableResolvedPath,await realpath(process.execPath));
 assert.equal(scopes[0].protectedVerified,false);
});
test('non-file managed Host executable is rejected before Workflow approval', async () => {
 const {store}=fixture();let grants=0;
 const api=createCodexMvpFacade(store,{executable:process.cwd(),model:'fixture',
   enableHostTurns:true,verificationBackend:backend,
   authorizeWorkflow:async()=>{grants++;return true;}});
 await assert.rejects(api.runExistingWorkflow('run-fixture'),/regular file/);
 assert.equal(grants,0);
});

test('repointed Host executable during asynchronous Workflow approval cannot dispatch', async t => {
 const dir=await mkdtemp(join(tmpdir(),'codefleet-host-approval-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const alias=join(dir,'codex-host'),other=join(dir,'replacement');
 await writeFile(other,'not an approved executable');
 try { await symlink(process.execPath,alias,'file'); }
 catch(error) {
   if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) return t.skip('file symlink unavailable');
   throw error;
 }
 const {store}=fixture();let grants=0;
 const api=createCodexMvpFacade(store,{executable:alias,model:'fixture',
   enableHostTurns:true,verificationBackend:backend,
   authorizeWorkflow:async scope=>{
     grants++;
     assert.equal(scope.executablePath,alias);
     assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
     await unlink(alias);
     await symlink(other,alias,'file');
     return true;
   }});
 await assert.rejects(api.runExistingWorkflow('run-fixture'),/Host executable changed while awaiting trusted grant/);
 assert.equal(grants,1);
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

test('trusted Workflow reviewer inspects frozen DAG, bounded budget and exact target scope',async()=>{
  const {store,source,workflow}=fixture();
  let reviews=0;
  const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
    enableHostTurns:true,verificationBackend:backend,
    authorizeWorkflow:async scope=>{
      reviews++;
      assert.equal(scope.objective,source.goal);
      assert.equal(scope.sourceRef,workflow.sourceRef);
      assert.equal(scope.graphRef,workflow.graphRef);
      assert.deepEqual(scope.files,source.files);
      assert.deepEqual(scope.tests,source.tests);
      assert.deepEqual(scope.contextFiles,source.context);
      assert.equal(scope.deliveryMode,'local');
      assert.deepEqual(scope.executionLimits,{maxAttempts:1,timeoutSeconds:300,attemptBudgetUsd:1});
      assert.deepEqual(scope.workItems.map(item=>item.id),['fix']);
      assert.deepEqual(scope.workItems[0].dependencies,[]);
      assert.deepEqual(scope.workItems[0].files,['src/example.mjs']);
      assert.deepEqual(scope.workItems[0].acceptanceCriteria,['Regression passes']);
      assert.deepEqual(scope.finalAcceptanceCriteria,workflow.contract.acceptanceCriteria);
      assert.deepEqual(scope.requiredCapabilities,workflow.contract.requiredCapabilities);
      assert.equal(Object.isFrozen(scope.workItems[0]),true);
      assert.throws(()=>scope.workItems[0].files.push('src/unreviewed.mjs'),TypeError);
      assert.throws(()=>{scope.executionLimits.attemptBudgetUsd=10;},TypeError);
      return false;
    }});
  await assert.rejects(api.runExistingWorkflow('run-fixture'),/grant denied/);
  assert.equal(reviews,1);
});

test('tampered persisted Workflow DAG or source never reaches execution grant',async()=>{
  for(const mutate of [
    ({workflow})=>{workflow.contract.items[0].files=['src/unreviewed.mjs'];},
    ({source})=>{source.files.push('src/unreviewed.mjs');}
  ]){
    const f=fixture();let reviews=0;
    mutate(f);
    const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
      enableHostTurns:true,verificationBackend:backend,
      authorizeWorkflow:async()=>{reviews++;return true;}});
    await assert.rejects(api.runExistingWorkflow('run-fixture'),/Contract\/DAG or source artifact invalid/);
    assert.equal(reviews,0);
  }
});

test('source or DAG drift during asynchronous grant blocks Controller dispatch',async()=>{
  for(const mutate of [
    ({workflow})=>{workflow.contract.items[0].acceptanceCriteria=['Weakened'];},
    ({source})=>{source.attemptBudgetUsd=10;}
  ]){
    const f=fixture();let reviews=0;
    const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
      enableHostTurns:true,verificationBackend:backend,
      authorizeWorkflow:async()=>{reviews++;mutate(f);return true;}});
    await assert.rejects(api.runExistingWorkflow('run-fixture'),/Contract\/DAG or source artifact invalid/);
    assert.equal(reviews,1);
  }
});

test('managed Workflow refuses a missing delivered Objective criterion set before execution grant',async()=>{
  const {store}=fixture();
  let grants=0;
  const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
    enableHostTurns:true,verificationBackend:backend,
    destinationDelivery:{approvedCriteria:[],authorize:async()=>true,verify:async()=>({})},
    authorizeWorkflow:async()=>{grants++;return true;}});
  await assert.rejects(api.runExistingWorkflow('run-fixture'),
    /Trusted mandatory Objective criterion set missing or invalid/);
  assert.equal(grants,0);
});

test('managed Workflow owner grant pins immutable destination criteria through async review',async()=>{
  const {store}=fixture();
  const destinationDelivery={
    approvedCriteria:[{id:'C1',requiredAuthority:'LOCAL_EXECUTED',description:'Check the delivered tree'}],
    authorize:async()=>{throw Error('Destination effect not permitted in this test');},
    verify:async()=>{throw Error('Verifier must not start');}
  };
  let grants=0;
  const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
    enableHostTurns:true,verificationBackend:backend,destinationDelivery,
    authorizeWorkflow:async scope=>{
      grants++;
      assert.deepEqual(scope.destinationCriteria,[{
        id:'C1',requiredAuthority:'LOCAL_EXECUTED',description:'Check the delivered tree'
      }]);
      assert.equal(Object.isFrozen(scope.destinationCriteria),true);
      assert.equal(Object.isFrozen(scope.destinationCriteria[0]),true);
      assert.throws(()=>{scope.destinationCriteria[0].requiredAuthority='OWNER_REVIEW';},TypeError);
      // A trusted embedding may be reconfigured during asynchronous approval.
      // The old grant must not authorize the replacement completion criteria.
      destinationDelivery.approvedCriteria[0].requiredAuthority='OWNER_REVIEW';
      return true;
    }});
  await assert.rejects(api.runExistingWorkflow('run-fixture'),/Workflow scope changed/);
  assert.equal(grants,1);
});

test('host execution options cannot be model-controlled through unexpected fields',async()=>{
 const {store}=fixture();
 const api=createCodexMvpFacade(store,{executable:process.execPath,model:'codex-fixture',
   enableHostTurns:true,verificationBackend:backend,authorizeWorkflow:async()=>true});
 await assert.rejects(api.runExistingWorkflow('run-fixture',{provider:'other'}),/Unrecognized/);
});

test('Host Workflow approval pins recovery intent and rejects option mutation during review',async()=>{
  for(const initialResume of [false,true]){
    const {store}=fixture();
    const options={resume:initialResume};
    let reviews=0;
    const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
      enableHostTurns:true,verificationBackend:backend,
      authorizeWorkflow:async scope=>{
        reviews++;
        assert.equal(scope.resume,initialResume);
        assert.equal(Object.isFrozen(scope),true);
        assert.throws(()=>{scope.resume=!initialResume;},TypeError);
        // A caller can hold and mutate the original options object while the
        // owner is approving; this must not silently switch execute() mode.
        options.resume=!initialResume;
        return true;
      }});
    await assert.rejects(api.runExistingWorkflow('run-fixture',options),
      /Workflow execution options changed while awaiting trusted grant/);
    assert.equal(reviews,1);
  }
});

test('Host Workflow approval rejects newly injected execution options',async()=>{
  const {store}=fixture();
  const options={resume:false};
  let reviews=0;
  const api=createCodexMvpFacade(store,{executable:process.execPath,model:'fixture',
    enableHostTurns:true,verificationBackend:backend,
    authorizeWorkflow:async scope=>{
      reviews++;
      assert.equal(scope.resume,false);
      options.provider='unreviewed-provider';
      return true;
    }});
  await assert.rejects(api.runExistingWorkflow('run-fixture',options),
    /Workflow execution options changed while awaiting trusted grant/);
  assert.equal(reviews,1);
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

test('Bootstrap Local reviewer sees an immutable exact command before authorizing verification',async t=>{
  const f=await built({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const command=request(f);
  let reviews=0,backendCalls=0;
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapVerification:async scope=>{
      reviews++;
      assert.equal(scope.protection,'UNPROTECTED');
      assert.equal(scope.command.commandHash,scope.commandHash);
      assert.equal(scope.command.executable,await realpath(command.executable));
      assert.equal(scope.command.directory,await realpath(command.directory));
      assert.deepEqual(scope.command.args,command.args);
      assert.equal(scope.command.timeoutMs,command.timeoutMs);
      assert.match(scope.command.executableHash,/^[a-f0-9]{64}$/);
      assert.match(scope.command.candidateTreeHash,/^[a-f0-9]{64}$/);
      assert.equal(Object.isFrozen(scope.command),true);
      assert.equal(Object.isFrozen(scope.command.args),true);
      assert.throws(()=>scope.command.args.push('--unreviewed'),TypeError);
      assert.throws(()=>{scope.command.timeoutMs=1;},TypeError);
      return false;
    },
    bootstrapVerifierBackend:{authorize:async()=>{backendCalls++;throw Error('unexpected execution');}}
  });
  await assert.rejects(api.verifyApprovedBootstrap(f.id,'tests',command),/grant denied/);
  assert.equal(reviews,1);
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
  assert.equal(scopes[0].contentRef,f.store.get(runId).contentRef);
  assert.equal(scopes[0].operation,'create');
  assert.deepEqual(scopes[0].files.map(file=>file.path),pendingTodoFiles.map(file=>file.path));
  assert.equal(scopes[0].files.find(file=>file.path==='src/todo.mjs').content,pendingTodoFiles[1].content);
  assert.equal(Object.isFrozen(scopes[0].files),true);
  assert.equal(Object.isFrozen(scopes[0].files[0]),true);
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

test('Bootstrap Fileset owner can inspect immutable source bytes and deny local writes', async t => {
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  approve(f,await propose(f,'todo',{files:pendingTodoFiles}));
  let reviews=0;
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapMaterialization:async scope=>{
      reviews++;
      const proposed=scope.files.find(file=>file.path==='src/todo.mjs');
      assert.equal(proposed.content,pendingTodoFiles[1].content);
      assert.equal(proposed.sha256,hash(proposed.content));
      assert.equal(scope.operation,'create');
      assert.throws(()=>{proposed.content='not reviewed';},TypeError);
      assert.throws(()=>scope.files.push({path:'src/unapproved.mjs'}),TypeError);
      return false;
    }
  });
  await assert.rejects(api.materializeApprovedBootstrap(f.id,'todo'),/grant denied/);
  assert.equal(reviews,1);
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs')),{code:'ENOENT'});
});

test('Bootstrap Fileset bytes changed during asynchronous owner review never reach materialization', async t => {
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  approve(f,await propose(f,'todo',{files:pendingTodoFiles}));
  const runId=task(f.store,f.id).bootstrap.filesets.todo;
  const contentRef=f.store.get(runId).contentRef;
  const originalRead=f.store.readArtifact.bind(f.store);
  let replaced=false,grants=0;
  // Simulate storage or embedding interference at the exact async review
  // boundary, without changing the previously reviewed file-set hash.
  f.store.readArtifact=ref=>{
    const artifact=originalRead(ref);
    if (replaced && ref===contentRef)
      return {...artifact,files:artifact.files.map((entry,index)=>
        index===0?{...entry,content:'unreviewed changed bytes'}:entry)};
    return artifact;
  };
  const api=createCodexMvpFacade(f.store,{executable:process.execPath,model:'fixture',
    authorizeBootstrapMaterialization:async()=>{grants++;replaced=true;return true;}
  });
  await assert.rejects(api.materializeApprovedBootstrap(f.id,'todo'),
    /Fileset content changed during review/);
  assert.equal(grants,1);
  assert.equal(f.store.get(runId).state,'READY');
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs')),{code:'ENOENT'});
});
