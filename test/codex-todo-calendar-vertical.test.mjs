// Product vertical acceptance: a real Todo/Calendar application, TWO
// dependent WorkItems, actual protected Docker test execution, supervised
// Local delivery and a real delivered-target Local criterion check.
// Host proposals are synthetic; this is NOT a billable Codex Live run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Store} from '../src/alpha/store.mjs';
import {git} from '../src/alpha/workspace.mjs';
import {hash} from '../src/alpha/contract.mjs';
import {definition} from '../src/workflow/definition.mjs';
import {createWorkflow,approveWorkflow,attempts} from '../src/workflow/persistence.mjs';
import {createCodexMvpFacade} from '../src/product/codex-mvp-facade.mjs';
import {readDeliveredObjectiveStatus} from '../src/product/objective-status.mjs';
import {createLocalDestinationVerifier} from '../src/product/destination-evidence.mjs';
import {containerBackend} from '../src/verification/backends.mjs';
import {dispatchProduct} from '../src/product/cli.mjs';

const fixture=fileURLToPath(new URL('./fixtures/todo-calendar-vertical/',import.meta.url));
const files=['src/todo.js','src/calendar.js'];
const tests=['test/todo.test.js','test/calendar.test.js'];
const markers=['/* CODEFLEET_TODO_PENDING */','/* CODEFLEET_CALENDAR_PENDING */'];
const criteria=[{id:'TodoCalendarLocal',requiredAuthority:'LOCAL_EXECUTED',
  description:'Ten actual Todo CRUD and month/week Calendar tests pass on delivered source'}];

async function createProject(t,{maxAttempts=3}={}) {
  const root=await mkdtemp(join(tmpdir(),'cf-todo-calendar-vertical-'));
  const repo=join(root,'repository');
  let store;
  t.after(async()=>{store?.close();await rm(root,{recursive:true,force:true});});
  await mkdir(join(repo,'src'),{recursive:true});
  await mkdir(join(repo,'test'),{recursive:true});
  for(let i=0;i<2;i++){
    await writeFile(join(repo,files[i]),markers[i]+'\n');
    await copyFile(join(fixture,tests[i]),join(repo,tests[i]));
  }
  for(const args of [
    ['init'],['add','.'],
    ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']
  ]){
    const result=await git(repo,args);
    assert.equal(result.exitCode,0,String(result.stderr));
  }
  const baseline=String((await git(repo,['rev-parse','HEAD'])).stdout).trim();
  store=new Store(join(root,'state'));
  const contract={
    schemaVersion:1,
    goal:'Build Todo creation, editing, completion, deletion and shared monthly and weekly calendar projections.',
    files,context:files,tests,maxAttempts,timeoutSeconds:240,
    attemptBudgetUsd:1,delivery:{mode:'local'}
  };
  const graph=definition(contract,{workflowId:'todoCalendarVertical',base:baseline,items:[
    {id:'todo',dependencies:[],priority:0,files:[files[0]],tests:[tests[0]],
      acceptanceCriteria:['Todo CRUD, validation, completion and filters pass']},
    {id:'calendar',dependencies:['todo'],priority:1,files:[files[1]],tests:[tests[1]],
      acceptanceCriteria:['Calendar reflects the same accepted Todo data']}
  ]});
  const workflow=await createWorkflow(store,repo,graph,contract);
  approveWorkflow(store,workflow.id,{actor:'explicit-synthetic-fixture-grant',
    workflowHash:workflow.contractHash,expiresAt:Date.now()+240000});
  return {root,repo,store,workflow};
}
test('Todo+Calendar: actual Docker verification, Local delivery and Objective completion',async t=>{
  const f=await createProject(t);
  const implemented=await Promise.all(files.map(p=>readFile(join(fixture,p),'utf8')));
  const hostCalls=[],reviews=[],localGrants=[];
  let deliveredEvidence;
  const transport=async request=>{
    const prompt=JSON.parse(request.prompt);
    const i=prompt.workItemId==='todo'?0:prompt.workItemId==='calendar'?1:-1;
    assert.notEqual(i,-1,'Unexpected unreviewed WorkItem');
    if(i===1)assert.match(prompt.files[files[0]],/function createTodo/);
    hostCalls.push(prompt.workItemId);
    return {
      threadId:'fake-thread-'+i,turnId:'fake-turn-'+i,terminalStatus:'completed',
      authority:'PROVIDER_REPORTED_ONLY',protectedVerified:false,
      executionMode:'HOST_READ_ONLY_PROPOSAL',
      text:JSON.stringify({summary:'Synthetic code suggestion, not a live model',
        edits:[{path:files[i],oldText:markers[i]+'\n',newText:implemented[i]}]})
    };
  };
  const destination=createLocalDestinationVerifier(f.store,{
    criteria,commandSpecs:{TodoCalendarLocal:{
      executable:process.execPath,
      args:['--test','--test-reporter=tap',...tests],
      directory:f.repo,timeoutMs:60000
    }},
    obtainGrant:async scope=>{
      assert.equal(scope.criterionId,'TodoCalendarLocal');
      assert.equal(scope.protection,'UNPROTECTED');
      assert.equal(scope.objectiveId,f.workflow.id);
      assert.ok(scope.commandHash);
      localGrants.push(scope);
      return true; // Explicit acceptance-fixture-only Local approval.
    }
  });
  const facade=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_HOST_NOT_CODEX',
    enableHostTurns:true,transport,verificationBackend:containerBackend(),
    authorizeWorkflow:async scope=>{
      assert.equal(scope.workflowHash,f.workflow.contractHash);
      assert.equal(scope.executionMode,'HOST_READ_ONLY_PROPOSAL');
      assert.deepEqual(scope.workItems.map(item=>item.id),['todo','calendar']);
      assert.deepEqual(scope.workItems[1].dependencies,['todo']);
      assert.deepEqual(scope.destinationCriteria,criteria);
      assert.equal((await realpath(scope.repo)).toLowerCase(),
        (await realpath(f.repo)).toLowerCase());
      reviews.push(scope);
      return true;
    },
    unknownCostBudget:{authorize:async request=>request.unknownCostTurns<=2},
    destinationDelivery:{
      approvedCriteria:destination.approvedCriteria,
      authorize:async scope=>{
        assert.equal(scope.workflowHash,f.workflow.contractHash);
        assert.deepEqual(scope.objectiveCriteria,criteria);
        assert.equal(scope.objectiveCriteriaHash,hash(criteria));
        return true;
      },
      verify:async request=>{
        const observed=await destination.verify(request);
        deliveredEvidence=f.store.readArtifact(observed.evidenceRefs.TodoCalendarLocal);
        return observed;
      }
    }
  });
  const result=await facade.runExistingWorkflow(f.workflow.id);
  assert.equal(result.workflowState,'COMPLETED',result.objective.reason);
  assert.equal(result.objective.status,'COMPLETE',result.objective.reason);
  assert.equal(result.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(result.protectedVerified,false);
  assert.deepEqual(hostCalls,['todo','calendar']);
  assert.equal(reviews.length,1);
  assert.equal(localGrants.length,1);
  const history=attempts(f.store,f.workflow.id);
  assert.deepEqual(history.map(a=>[a.itemId,a.status]),[
    ['todo','SUCCEEDED'],['calendar','SUCCEEDED'],['final','SUCCEEDED']
  ]);
  // No claimed Harness pass is fabricated: the Container backend executed
  // the actual Node test files for each WorkItem and the integrated Candidate.
  for(const attempt of history){
    const evidence=f.store.readArtifact(f.store.get(attempt.childId).evidenceHash);
    assert.equal(evidence.authority,'HARNESS_EXECUTED');
    assert.equal(evidence.verificationBackend,'container');
    assert.equal(evidence.requiredGateResults.protectedVerification,'SATISFIED');
    assert.ok(evidence.tests>=5);
    assert.equal(evidence.failed,0);
  }
  for(let i=0;i<files.length;i++)
    assert.equal(await readFile(join(f.repo,files[i]),'utf8'),implemented[i]);
  assert.equal(deliveredEvidence.tests,10);
  assert.equal(deliveredEvidence.passed,10);
  assert.equal(deliveredEvidence.authority,'LOCAL_EXECUTED');
  assert.equal(deliveredEvidence.verificationBackend,'local');
  assert.equal(deliveredEvidence.protection,'UNPROTECTED');
  assert.equal(deliveredEvidence.complete,true);
  const status=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(status.status,'COMPLETE');
  assert.equal(status.objectiveComplete,true);
  assert.equal(status.protection,'UNPROTECTED');
  const report=await dispatchProduct(['report',f.workflow.id],{store:f.store});
  assert.equal(report.exitCode,0);
  assert.equal(report.data.objectiveComplete,true);
  assert.deepEqual(report.data.objective.criterionIds,['TodoCalendarLocal']);
  // User changes after delivery revoke the previous completion projection.
  await writeFile(join(f.repo,'src/calendar.js'),'module.exports={monthEvents:()=>[]};');
  const drift=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(drift.objectiveComplete,false);
  assert.equal(drift.targetDrift,true);
  const changed=await dispatchProduct(['report',f.workflow.id],{store:f.store});
  assert.equal(changed.data.objectiveComplete,false);
});


test('Todo+Calendar: failed protected Calendar check triggers one scoped Repair, re-verifies, and completes Local Objective',async t=>{
  const f=await createProject(t,{maxAttempts:4});
  const implemented=await Promise.all(files.map(p=>readFile(join(fixture,p),'utf8')));
  const turns=[],repairGrants=[],costReviews=[],criterionGrants=[];
  // Deliberately invalid Calendar behavior. The first Calendar candidate is
  // syntactically valid but fails the actual protected Node feature tests.
  const brokenCalendar="'use strict';\nmodule.exports={monthEvents:()=>[],weekEvents:()=>[]};\n";
  let calendarAttempt=0;
  const transport=async request=>{
    const prompt=JSON.parse(request.prompt);
    assert.ok(['todo','calendar'].includes(prompt.workItemId));
    if(prompt.workItemId==='calendar')
      assert.match(prompt.files['src/todo.js'],/function createTodo/);
    const index=prompt.workItemId==='todo'?0:1;
    if(index===1)calendarAttempt++;
    turns.push(prompt.workItemId);
    if(index===1&&calendarAttempt===2){
      assert.equal(prompt.feedback?.repairGeneration,2);
      assert.ok(prompt.feedback.failed>0,
        'Repair must receive actual failed test Evidence');
      assert.equal(prompt.feedback.authority,'HARNESS_EXECUTED');
      assert.equal(prompt.feedback.verificationBackend,'container');
      assert.equal(prompt.feedback.previousProposal?.summary,
        'Purposely invalid Calendar logic for real failure detection');
    }
    const replacement=index===1&&calendarAttempt===1
      ? brokenCalendar : implemented[index];
    return {
      threadId:'synthetic-thread-'+turns.length,
      turnId:'synthetic-turn-'+turns.length,
      terminalStatus:'completed',authority:'PROVIDER_REPORTED_ONLY',
      protectedVerified:false,executionMode:'HOST_READ_ONLY_PROPOSAL',
      text:JSON.stringify({
        summary:index===1&&calendarAttempt===1
          ? 'Purposely invalid Calendar logic for real failure detection'
          : 'Synthetic scoped implementation based on prior test feedback',
        edits:[{path:files[index],oldText:markers[index]+'\n',
          newText:replacement}]
      })
    };
  };
  const destination=createLocalDestinationVerifier(f.store,{
    criteria,commandSpecs:{TodoCalendarLocal:{
      executable:process.execPath,args:['--test','--test-reporter=tap',...tests],
      directory:f.repo,timeoutMs:60000
    }},
    obtainGrant:async scope=>{
      assert.equal(scope.criterionId,'TodoCalendarLocal');
      assert.equal(scope.protection,'UNPROTECTED');
      criterionGrants.push(scope);
      return true;
    }
  });
  const facade=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_HOST_NOT_CODEX',
    enableHostTurns:true,transport,verificationBackend:containerBackend(),
    authorizeWorkflow:async scope=>{
      assert.equal(scope.workflowHash,f.workflow.contractHash);
      assert.deepEqual(scope.workItems.map(item=>item.id),['todo','calendar']);
      assert.equal(scope.repair.authorization,'EXACT_FAILURE_GRANT_REQUIRED');
      assert.equal(scope.repair.maxGenerations,2);
      return true;
    },
    repairPolicy:{
      enableStorage:true,maxGenerations:2,
      authorize:async scope=>{
        assert.equal(scope.runId,f.workflow.id);
        assert.equal(scope.itemId,'calendar');
        assert.equal(scope.nextGeneration,2);
        assert.ok(scope.failureEvidenceRef);
        assert.ok(scope.remainingAttemptBudget>=1);
        repairGrants.push(scope);
        return true; // Explicit, bounded, fixture-only Repair authorization.
      }
    },
    unknownCostBudget:{authorize:async scope=>{
      costReviews.push(scope);
      return scope.unknownCostTurns<=3 &&
        scope.maxWorkItemAttempts===4;
    }},
    destinationDelivery:{
      approvedCriteria:destination.approvedCriteria,
      authorize:async scope=>{
        assert.equal(scope.workflowHash,f.workflow.contractHash);
        assert.deepEqual(scope.objectiveCriteria,criteria);
        return true;
      },
      verify:request=>destination.verify(request)
    }
  });
  // This is ONE CodeFleet Objective call: no manual re-entry between a failed
  // actual test and the independently re-verified repaired Candidate.
  const outcome=await facade.runExistingWorkflow(f.workflow.id);
  assert.equal(outcome.workflowState,'COMPLETED',outcome.objective.reason);
  assert.equal(outcome.objective.status,'COMPLETE',outcome.objective.reason);
  assert.equal(outcome.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(outcome.protectedVerified,false);
  assert.deepEqual(turns,['todo','calendar','calendar']);
  assert.equal(calendarAttempt,2);
  assert.equal(repairGrants.length,1);
  assert.equal(criterionGrants.length,1);
  assert.ok(costReviews.length>=1);
  assert.ok(costReviews.every(x=>x.unknownCostTurns<=3));
  const history=attempts(f.store,f.workflow.id);
  const calendarHistory=history.filter(x=>x.itemId==='calendar')
    .sort((a,b)=>a.generation-b.generation);
  assert.deepEqual(calendarHistory.map(x=>[x.generation,x.status]),
    [[1,'FAILED'],[2,'SUCCEEDED']]);
  assert.equal(history.filter(x=>x.itemId==='todo'&&x.status==='SUCCEEDED').length,1);
  assert.equal(history.filter(x=>x.itemId==='final'&&x.status==='SUCCEEDED').length,1);
  const original=f.store.get(calendarHistory[0].childId);
  const repaired=f.store.get(calendarHistory[1].childId);
  assert.equal(repaired.repairOfChildId,original.id);
  assert.equal(repaired.repairEvidenceRef,original.lastEvidenceHash);
  const failing=f.store.readArtifact(original.lastEvidenceHash);
  assert.equal(failing.authority,'HARNESS_EXECUTED');
  assert.equal(failing.verificationBackend,'container');
  assert.ok(failing.failed>0);
  assert.ok(failing.tests>=5);
  assert.equal(failing.requiredGateResults.protectedVerification,'SATISFIED');
  const passing=f.store.readArtifact(repaired.evidenceHash);
  assert.equal(passing.authority,'HARNESS_EXECUTED');
  assert.equal(passing.verificationBackend,'container');
  assert.equal(passing.failed,0);
  assert.ok(passing.tests>=5);
  const events=f.store.events(f.workflow.id);
  const failed=events.find(e=>e.type==='ATTEMPT_RECONCILED'&&
    e.body.itemId==='calendar'&&e.body.status==='FAILED');
  const reserved=events.find(e=>e.type==='REPAIR_ATTEMPT_RESERVED'&&
    e.body.itemId==='calendar'&&e.body.generation===2);
  assert.ok(failed&&reserved&&failed.seq<reserved.seq);
  for(let i=0;i<files.length;i++)
    assert.equal(await readFile(join(f.repo,files[i]),'utf8'),implemented[i]);
  const objective=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(objective.status,'COMPLETE');
  assert.equal(objective.objectiveComplete,true);
  assert.equal(objective.protection,'UNPROTECTED');
  const publicStatus=await dispatchProduct(['report',f.workflow.id],{store:f.store});
  assert.equal(publicStatus.exitCode,0);
  assert.equal(publicStatus.data.objectiveComplete,true);
  // Completion is always attached to the actually delivered bytes.
  await writeFile(join(f.repo,'src/calendar.js'),brokenCalendar);
  const drift=await readDeliveredObjectiveStatus(f.store,f.workflow.id);
  assert.equal(drift.objectiveComplete,false);
  assert.equal(drift.targetDrift,true);
});
