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
import { definition } from '../src/workflow/definition.mjs';
import { createWorkflow, approveWorkflow, attempts } from '../src/workflow/persistence.mjs';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { readDeliveredObjectiveStatus } from '../src/product/objective-status.mjs';
import { dispatchProduct } from '../src/product/cli.mjs';
import { runReport } from '../src/product/report.mjs';

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
  // Even the initial public workflow report cannot imply Objective success.
  const pending=await runReport(store,workflow.id);
  assert.equal(pending.objectiveComplete,false);
  assert.equal(pending.objective.status,'INCOMPLETE');
  approveWorkflow(store,workflow.id,{actor:'synthetic-local-reviewer',workflowHash:workflow.contractHash,
    expiresAt:Date.now()+60000});
  return {root,repo,store,workflow,
    reopenStore:()=>{
      activeStore?.close();
      activeStore=new Store(stateDir);
      return activeStore;
    }};
}

test('joined synthetic two-WorkItem Objective: A persisted before B, local delivery and current-tree Judge',async t=>{
  const f=await initial(t);
  const hostTurns=[]; const grants=[]; const recorded=[];
  const transport=async request=>{
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
    };
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
  // Exercise the trusted MVP entry, not only the underlying Controller. No
  // real Codex Host is launched: transport and independent verifier are fakes.
  const reviewedScopes=[];
  const facade=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'FAKE_HOST_ONLY',
    enableHostTurns:true,transport,
    authorizeWorkflow:async scope=>{
      reviewedScopes.push(scope);
      assert.equal(scope.kind,'CODEFLEET_MANAGED_WORKFLOW_SCOPE_V1');
      assert.equal(scope.runId,f.workflow.id);
      assert.equal(scope.workflowHash,f.workflow.contractHash);
      assert.equal(scope.executionMode,'HOST_READ_ONLY_PROPOSAL');
      assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
      assert.deepEqual(scope.workItems.map(item=>item.id),['a','b']);
      assert.deepEqual(scope.workItems[1].dependencies,['a']);
      assert.deepEqual(scope.destinationCriteria,[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}]);
      return true;
    },
    verificationBackend:{prepare:async()=>{},verify:verifier,cleanup:async()=>{}},
    unknownCostBudget:{authorize:async req=>{
      grants.push(req);return req.unknownCostTurns<=2;
    }},
    destinationDelivery:{
      approvedCriteria:[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}],
      authorize:async scope=>{
        assert.equal(scope.workflowHash,f.workflow.contractHash);
        assert.deepEqual(scope.objectiveCriteria,[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}]);
        assert.equal(scope.objectiveCriteriaHash,hash(scope.objectiveCriteria));
        assert.equal(scope.runId,f.workflow.id);
        // Git for Windows may return a long canonical path while %TEMP% uses
        // its 8.3 alias; compare resolved filesystem identities instead.
        assert.equal((await realpath(scope.destination)).toLowerCase(),
          (await realpath(f.repo)).toLowerCase());
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
  const completed=await facade.runExistingWorkflow(f.workflow.id);
  assert.equal(completed.workflowState,'COMPLETED',completed.objective.reason);
  assert.equal(completed.objective.status,'COMPLETE');
  assert.equal(completed.authority,'TRUSTED_EMBEDDING_LOCAL_ONLY');
  assert.equal(completed.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(completed.protectedVerified,false);
  assert.equal(completed.progress.kind,'CODEFLEET_WORKFLOW_PROGRESS_V1');
  assert.equal(completed.progress.workflowId,f.workflow.id);
  assert.equal(completed.progress.objectiveComplete,true);
  assert.equal(completed.progress.authority,'READ_ONLY_ADVISORY');
  assert.equal(completed.progress.executionGranted,false);
  assert.equal(completed.progress.continuation.status,'OBJECTIVE_COMPLETE');
  assert.equal(completed.progress.continuation.automaticReplay,false);
  assert.deepEqual(completed.progress.workItems.map(item=>[item.id,item.state]),
    [['a','SUCCEEDED'],['b','SUCCEEDED']]);
  assert.equal(reviewedScopes.length,1);
  const rows=attempts(f.store,f.workflow.id);
  assert.deepEqual(rows.map(row=>[row.itemId,row.status]),[
    ['a','SUCCEEDED'],['b','SUCCEEDED'],['final','SUCCEEDED']]);
  assert.deepEqual(hostTurns,['a','b']);
  assert.ok(grants.length>=1);
  assert.equal(recorded.length,1);
  const completedRun=f.store.get(f.workflow.id);
  const approved=f.store.readArtifact(completedRun.objectiveApprovedCriteriaRef);
  const pinned=f.store.readArtifact(completedRun.objectiveCriteriaRef);
  assert.equal(approved.kind,'OBJECTIVE_APPROVED_CRITERIA_V1');
  assert.equal(approved.criteriaHash,hash(pinned.criteria));
  assert.equal(pinned.approvedCriteriaRef,completedRun.objectiveApprovedCriteriaRef);
  const delivery=f.store.readArtifact(completedRun.deliveryReceiptRef);
  const intent=f.store.readArtifact(completedRun.destinationDeliveryIntentRef);
  assert.equal(delivery.intentRef,completedRun.destinationDeliveryIntentRef);
  assert.equal(intent.approvedCriteriaRef,completedRun.objectiveApprovedCriteriaRef);
  assert.equal(intent.objectiveCriteriaHash,approved.criteriaHash);
  assert.equal(intent.workflowHash,completedRun.contractHash);
  assert.deepEqual(intent.fileHashes,delivery.observedHashes);
  const events=f.store.events(f.workflow.id);
  const acceptedA=events.find(e=>e.type==='ATTEMPT_RECONCILED'&&e.body.itemId==='a');
  const reservedB=events.find(e=>e.type==='ATTEMPT_RESERVED'&&e.body.itemId==='b');
  assert.ok(acceptedA && reservedB && acceptedA.seq < reservedB.seq);
  // A fresh Store instance must recover accepted A/B, final Objective Evidence
  // and delivery from persisted rows, without rerunning a fake Host Turn.
  const priorAttempts=attempts(f.store,f.workflow.id)
    .map(row=>[row.itemId,row.status,row.childId]);
  const priorEventCount=f.store.events(f.workflow.id).length;
  const priorTurnCount=hostTurns.length;
  f.store=f.reopenStore();
  assert.deepEqual(attempts(f.store,f.workflow.id)
    .map(row=>[row.itemId,row.status,row.childId]),priorAttempts);
  assert.equal(f.store.events(f.workflow.id).length,priorEventCount);
  const recoveredProgress=await dispatchProduct(['workflow-progress',f.workflow.id],{store:f.store});
  assert.equal(recoveredProgress.exitCode,0);
  assert.equal(recoveredProgress.data.objectiveComplete,true);
  assert.deepEqual(recoveredProgress.data.workItems.map(item=>[item.id,item.state]),
    [['a','SUCCEEDED'],['b','SUCCEEDED']]);
  assert.equal(hostTurns.length,priorTurnCount);
  assert.equal(f.store.events(f.workflow.id).length,priorEventCount);
  const result=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(result.status,'COMPLETE',result.reason);
  assert.equal(result.protection,'UNPROTECTED');
  assert.equal(result.objectiveComplete,true);
  // Existing user-facing report must expose the real delivered-tree Judge.
  const publicReport=await dispatchProduct(['report',f.workflow.id],{store:f.store});
  assert.equal(publicReport.exitCode,0);
  assert.equal(publicReport.data.objective.status,'COMPLETE');
  assert.equal(publicReport.data.objectiveComplete,true);
  assert.deepEqual(publicReport.data.objective.criterionIds,['C1']);
  await writeFile(join(f.repo,'src/a.js'),'user changed source after delivery');
  const drift=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(drift.objectiveComplete,false);
  assert.equal(drift.targetDrift,true);
  const publicDrift=await dispatchProduct(['report',f.workflow.id],{store:f.store});
  assert.equal(publicDrift.exitCode,0);
  assert.equal(publicDrift.data.objectiveComplete,false);
  assert.equal(publicDrift.data.objective.targetDrift,true);
  assert.notEqual(publicDrift.data.objective.status,'COMPLETE');
});
