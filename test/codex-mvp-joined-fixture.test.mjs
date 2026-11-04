// Synthetic integration fixture: no native Codex, Host login, protected
// execution or production repository. Independent final Host Live acceptance
// remains necessary. This proves the code paths join without a second engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { definition } from '../src/workflow/definition.mjs';
import { createWorkflow, approveWorkflow, attempts } from '../src/workflow/persistence.mjs';
import { createCodexManagedHostExecution } from '../src/hosts/codex-managed-host-execution.mjs';
import { readDeliveredObjectiveStatus } from '../src/product/objective-status.mjs';

const source = () => ({
  schemaVersion:1,goal:'Complete both arithmetic source repairs under two approved dependent WorkItems.',
  files:['src/a.js','src/b.js'],context:['src/a.js','src/b.js'],
  tests:['test/a.test.js','test/b.test.js'],
  maxAttempts:3,timeoutSeconds:120,attemptBudgetUsd:1,delivery:{mode:'local'}
});
async function initial(t) {
  const root = await mkdtemp(join(tmpdir(),'codefleet-joined-'));
  let activeStore;
  t.after(async()=>{ activeStore?.close(); await rm(root,{recursive:true,force:true}); });
  const repo = join(root,'repository');
  const stateDir = join(root,'state');
  await mkdir(join(repo,'src'),{recursive:true});
  await mkdir(join(repo,'test'),{recursive:true});
  for(const id of ['a','b']) {
    await writeFile(join(repo,'src',id+'.js'),'module.exports=(a,b)=>a+b;','utf8');
    await writeFile(join(repo,'test',id+'.test.js'),'// synthetically observed test identity','utf8');
  }
  for(const args of [['init'],['add','.'],
    ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]) {
    const result=await git(repo,args);
    assert.equal(result.exitCode,0,String(result.stderr));
  }
  const revision=await git(repo,['rev-parse','HEAD']);
  const base=String(revision.stdout).trim();
  const store=new Store(stateDir); activeStore=store;
  const contract=source();
  const graph=definition(contract,{workflowId:'joinedfixture',base,items:[
    {id:'a',dependencies:[],priority:0,files:['src/a.js'],tests:['test/a.test.js'],
      acceptanceCriteria:['Criterion A passes after observed candidate changes']},
    {id:'b',dependencies:['a'],priority:1,files:['src/b.js'],tests:['test/b.test.js'],
      acceptanceCriteria:['Criterion B passes with accepted A as predecessor']}
  ]});
  const workflow=await createWorkflow(store,repo,graph,contract);
  approveWorkflow(store,workflow.id,{actor:'synthetic-local-reviewer',workflowHash:workflow.contractHash,
    expiresAt:Date.now()+60000});
  return {root,repo,store,workflow};
}

test('joined synthetic two-WorkItem Objective: A persisted before B, local delivery and current-tree Judge',async t=>{
  const f=await initial(t);
  const hostTurns=[]; const grants=[]; const recorded=[];
  const adapter=createCodexManagedHostExecution(f.store,{
    enabled:true,executable:process.execPath,model:'FAKE_HOST_ONLY',
    transport:async request=>{
      const p=JSON.parse(request.prompt);
      assert.ok(['a','b'].includes(p.workItemId));
      if(p.workItemId==='b') {
        // The actual accepted predecessor source must enter B's Host context.
        assert.match(p.files['src/a.js'],/a-b/);
      }
      hostTurns.push(p.workItemId);
      const name='src/'+p.workItemId+'.js';
      return {threadId:'fake-thread-'+p.workItemId,turnId:'fake-turn-'+p.workItemId,
        terminalStatus:'completed',authority:'PROVIDER_REPORTED_ONLY',
        protectedVerified:false,executionMode:'HOST_READ_ONLY_PROPOSAL',
        text:JSON.stringify({summary:'Synthetic fixture change',
          edits:[{path:name,oldText:'a+b',newText:'a-b'}]})};
    }
  });
  const verifier=async ({directory,tests})=>{
    const result=[];
    for(const identity of tests){
      const file=identity.replace('test/','src/').replace('.test.js','.js');
      result.push((await readFile(join(directory,file),'utf8')).includes('a-b'));
    }
    const passed=result.filter(Boolean).length,failed=result.length-passed;
    return {authority:'HARNESS_EXECUTED',tests:result.length,passed,failed,
      skipped:0,todo:0,exitCode:failed?1:0,interrupted:false,truncated:false,
      testNames:tests};
  };
  const completed=await execute(f.store,f.workflow.id,{
    hostExecution:adapter,ready:async()=>{},cleanupContainer:async()=>{},
    verify:verifier,
    unknownCostBudget:{authorize:async req=>{
      grants.push(req);return req.unknownCostTurns<=2;
    }},
    destinationDelivery:{
      authorize:async scope=>{
        assert.equal(scope.runId,f.workflow.id);
        // Git for Windows may return a long canonical path while %TEMP% uses\n        // its 8.3 alias; compare resolved filesystem identities instead.\n        assert.equal((await realpath(scope.destination)).toLowerCase(),\n          (await realpath(f.repo)).toLowerCase());
        return true;
      },
      verify:async ({run,delivery,candidate})=>{
        assert.equal(delivery.targetTreeHash,candidate.candidateHash);
        for(const file of ['a','b'])
          assert.match(await readFile(join(f.repo,'src',file+'.js'),'utf8'),/a-b/);
        const criterion={
          kind:'OBJECTIVE_CRITERION_OBSERVATION_V1',
          objectiveId:run.id,revision:run.revision,criterionId:'C1',
          targetTreeHash:delivery.targetTreeHash,authority:'LOCAL_EXECUTED',
          independentObserver:true,commandHash:'a'.repeat(64),
          observationHash:'b'.repeat(64),complete:true,tests:2,passed:2,failed:0,
          skipped:0,todo:0,exitCode:0,interrupted:false,truncated:false,
          integrity:'MATCHED',verificationBackend:'SYNTHETIC_TEST_ONLY',
          protection:'UNPROTECTED'
        };
        const ref=f.store.artifact(criterion);recorded.push(ref);
        return {criteria:[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}],
          evidenceRefs:{C1:ref},readVerifiedEvidence:hash=>f.store.readArtifact(hash)};
      }
    }
  });
  assert.equal(completed.state,'COMPLETED',completed.reason);
  const rows=attempts(f.store,f.workflow.id);
  assert.deepEqual(rows.map(row=>[row.itemId,row.status]),[
    ['a','SUCCEEDED'],['b','SUCCEEDED'],['final','SUCCEEDED']]);
  assert.deepEqual(hostTurns,['a','b']);
  assert.ok(grants.length>=1);
  assert.equal(recorded.length,1);
  const events=f.store.events(f.workflow.id);
  const acceptedA=events.find(e=>e.type==='ATTEMPT_RECONCILED'&&e.body.itemId==='a');
  const reservedB=events.find(e=>e.type==='ATTEMPT_RESERVED'&&e.body.itemId==='b');
  assert.ok(acceptedA && reservedB && acceptedA.seq < reservedB.seq);
  const result=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(result.status,'COMPLETE',result.reason);
  assert.equal(result.protection,'UNPROTECTED');
  assert.equal(result.objectiveComplete,true);
  await writeFile(join(f.repo,'src/a.js'),'user changed source after delivery');
  const drift=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(drift.objectiveComplete,false);
  assert.equal(drift.targetDrift,true);
});
