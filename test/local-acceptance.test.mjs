import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {built} from './fixtures/bootstrap-reservation.mjs';
import {task} from '../src/product/tasks.mjs';
import {taskReport} from '../src/product/report.mjs';
import {nativeLocalStep} from '../src/product/native-local.mjs';
import {recoverObjective} from '../src/product/recovery.mjs';
import {dispatchProduct} from '../src/product/cli.mjs';
import {localAcceptance,criterionEvidenceCoverage} from '../src/product/local-acceptance.mjs';

test('criterion coverage separates a mapped passing test from semantic criterion proof',()=>{
 const current={id:'task-1'},plan={draft:{
  plannedTests:[{path:'test/bytes.test.mjs',criteria:['byteLimit']}],
  criteria:[{id:'byteLimit',description:'Reject oversized UTF-8 bytes',tests:['test/bytes.test.mjs']}]
 }},view={workflowHash:'workflow',drift:[],candidateTreeHash:'candidate',recordedDigests:{'src/app.mjs':'source-sha'},items:[
  {id:'verify',kind:'local-verification',state:'LOCAL_PASSED',verificationRef:'evidence',dependencies:[]}
 ]};
 const evidence={taskId:'task-1',workflowHash:'workflow',itemId:'verify',authority:'LOCAL_EXECUTED',
  fileDigests:{'src/app.mjs':'source-sha'},
  command:{args:['--test','--test-reporter=tap','test/bytes.test.mjs'],candidateTreeHash:'candidate'},
  observed:{contractHash:'workflow',candidateTreeHash:'candidate',evidenceIntegrity:'MATCHED',
   exitCode:0,tests:1,passed:1,failed:0,skipped:0,todo:0}};
 const [covered]=criterionEvidenceCoverage(current,plan,view,()=>evidence);
 assert.deepEqual([covered.defined,covered.linked,covered.executed,covered.evidenceIntegrity,covered.testResult,
  covered.criterionSatisfaction],[true,true,true,'MATCHED','PASS','NOT_VERIFIED']);
 const mismatched=structuredClone(evidence);mismatched.observed.candidateTreeHash='other';
 assert.equal(criterionEvidenceCoverage(current,plan,view,()=>mismatched)[0].executed,false);
 const stale=structuredClone(evidence);stale.fileDigests['src/app.mjs']='stale';
 assert.equal(criterionEvidenceCoverage(current,plan,view,()=>stale)[0].executed,false);
 const unlinked=structuredClone(plan);unlinked.draft.plannedTests[0].criteria=[];
 assert.equal(criterionEvidenceCoverage(current,unlinked,view,()=>evidence)[0].linked,false);
 const strict={...current,acceptanceMode:'LOCAL_ONLY',coveragePolicy:'MAPPED_TEST_EVIDENCE_V1'};
 assert.equal(localAcceptance(strict,plan,view,()=>evidence).complete,true);
 const missing=localAcceptance(strict,unlinked,view,()=>evidence);
 assert.equal(missing.complete,false);assert.equal(missing.reason,'REQUIRED_CRITERION_EVIDENCE_MISSING');
 const failed=structuredClone(evidence);failed.observed.exitCode=1;failed.observed.failed=1;failed.observed.passed=0;
 const failedView=structuredClone(view);failedView.items[0].state='LOCAL_FAILED';
 assert.equal(criterionEvidenceCoverage(strict,plan,failedView,()=>failed)[0].testResult,'FAILED');
 const integratedFailure=structuredClone(failed);
 integratedFailure.command.args.push('test/another.test.mjs');
 assert.equal(criterionEvidenceCoverage(strict,plan,failedView,()=>integratedFailure)[0].testResult,'NOT_VERIFIED');
});

for (const mode of ['LOCAL_ONLY','PROTECTED_REQUIRED']) test(`${mode}: actual durable Local evidence, restart, replay and drift`,async t=>{
 const f=await built({passing:true,protectedItem:false,acceptanceMode:mode});t.after(()=>f.store.close());
 const request={executable:process.execPath,args:['--test','--test-reporter=tap','test/todo.test.mjs','test/calendar.test.mjs'],directory:f.dir,timeoutMs:10000};
 const options={request,revision:task(f.store,f.id).revision,requestId:randomUUID(),expiresAt:Date.now()+120000};
 assert.equal((await taskReport(f.store,f.id)).complete,false);
 await assert.rejects(()=>dispatchProduct(['status',f.id,'--acceptance','LOCAL_ONLY'],{store:f.store}),/creation-only/);
 const review=await nativeLocalStep(f.store,f.id,options);
 assert.equal(review.action,'AWAIT_APPROVAL');
 const trusted={...options,trust:review.reviewHash,acknowledgeUnisolated:true};
 const result=await nativeLocalStep(f.store,f.id,trusted);
 assert.equal(result.execution.status,'LOCAL_PASSED');
 const report=await taskReport(f.store,f.id);
 assert.equal(report.complete,mode==='LOCAL_ONLY');assert.equal(report.protectedVerification,'UNSATISFIED');
 assert.ok(report.acceptance.criteriaCoverage.every(c => c.defined && c.linked && c.executed &&
  c.evidenceIntegrity==='MATCHED' && c.testResult==='PASS' && c.criterionSatisfaction==='NOT_VERIFIED'));
 const replay=await nativeLocalStep(f.store,f.id,trusted);
 assert.equal(replay.execution.evidenceRef,result.execution.evidenceRef);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,1);
 const recovery=await recoverObjective(f.store,f.id);assert.equal(recovery.complete,mode==='LOCAL_ONLY');
 if(mode==='LOCAL_ONLY') {
  const current=task(f.store,f.id),plan=report.plan,view=report.bootstrap,original=f.store.readArtifact(result.execution.evidenceRef);
  for (const mutate of [e=>e.observed.tests=0,e=>delete e.observed.tests,e=>e.observed.exitCode=1,
   e=>e.observed.skipped=1,e=>e.observed.evidenceIntegrity='MISMATCH',e=>e.command.args.push('--test-name-pattern=x'),
   e=>e.command.args.pop(),e=>e.authority='PROVIDER_REPORTED_ONLY',e=>e.workflowHash='stale']) {
   const e=structuredClone(original);mutate(e);assert.equal(localAcceptance(current,plan,view,()=>e).complete,false);
  }
  const protectedView=structuredClone(view);protectedView.items.push({kind:'protected-verification',state:'BLOCKED'});
  assert.equal(localAcceptance(current,plan,protectedView,()=>original).complete,false);
  const missingDep=structuredClone(view);missingDep.items.find(i=>i.id==='tests').dependencies=[];
  assert.equal(localAcceptance(current,plan,missingDep,()=>original).complete,false);
 }
 await writeFile(path.join(f.dir,'src/todo.mjs'),'changed');assert.equal((await taskReport(f.store,f.id)).complete,false);
});
