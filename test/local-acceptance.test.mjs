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
import {localAcceptance} from '../src/product/local-acceptance.mjs';

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
