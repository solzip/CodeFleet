import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {writeFile,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {built} from './fixtures/bootstrap-reservation.mjs';
import {hash} from '../src/alpha/contract.mjs';
import {task} from '../src/product/tasks.mjs';
import {nativeLocalStep,nativeEnvironmentStep} from '../src/product/native-local.mjs';
import {taskReport} from '../src/product/report.mjs';
import {recoverObjective} from '../src/product/recovery.mjs';
import {BootstrapOperator} from '../src/hosts/bootstrap-operator.mjs';
import {nativeLocalPolicy,observeRecoveryPolicy} from '../src/product/environment-recovery.mjs';

async function fixture(t, mode='LOCAL_ONLY') {
  const root=await mkdtemp(path.join(tmpdir(),'cf-environment-')),gate=path.join(root,'capability');
  const f=await built({passing:true,protectedItem:false,maxAttempts:3,acceptanceMode:mode,environmentGate:gate});
  t.after(()=>f.store.close());
  const request={executable:process.execPath,args:['--test','--test-reporter=tap','test/todo.test.mjs','test/calendar.test.mjs'],directory:f.dir,timeoutMs:10000};
  const firstOptions={request,revision:task(f.store,f.id).revision,requestId:randomUUID(),expiresAt:Date.now()+120000};
  const review=await nativeLocalStep(f.store,f.id,firstOptions);
  const firstTrust={...firstOptions,trust:review.reviewHash,acknowledgeUnisolated:true};
  const first=await nativeLocalStep(f.store,f.id,firstTrust);
  assert.equal(first.execution?.status,'LOCAL_FAILED',JSON.stringify(first));
  const old=f.store.readArtifact(first.execution.evidenceRef),beforePolicy={backend:'local',host:'fixture',profile:'fixture-off',filesystem:{workspace:f.dir},network:{enabled:false}};
  const policy={...beforePolicy,profile:'fixture-on',network:{enabled:true}};
  const observationRef=f.store.artifact({kind:'FixtureEnvironmentObservation',reason:'environment gate unavailable',log:old.log});
  const diagnosticRef=f.store.artifact({kind:'EnvironmentFailureDiagnostic',classification:'ENVIRONMENT_OR_CAPABILITY',taskId:f.id,
    revision:task(f.store,f.id).revision,evidenceRef:first.execution.evidenceRef,candidateHash:old.command.candidateTreeHash,
    previousPolicyHash:hash(beforePolicy),observationRef,reason:'external fixture capability gate absent'});
  const environment={classification:'ENVIRONMENT_OR_CAPABILITY',evidenceRef:first.execution.evidenceRef,diagnosticRef,
    priorRequestId:first.execution.reservation.requestId,previousPolicyHash:hash(beforePolicy),policy};
  const options={request,environment,revision:task(f.store,f.id).revision,requestId:randomUUID(),expiresAt:Date.now()+120000};
  // Explicit fixture observation, never evidence of MXC enforcement.
  const observePolicy=async()=>({kind:'HostEffectivePolicyObservation',effective:true,source:'ISOLATED_FIXTURE',
    observedAt:Date.now(),policy,evidence:{gate}});
  return {...f,gate,options,observePolicy,first,firstTrust,old};
}
const count=f=>f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n;
async function trusted(f){const review=await nativeEnvironmentStep(f.store,f.id,f.options);assert.equal(review.action,'AWAIT_ENVIRONMENT_APPROVAL');return {...f.options,trust:review.reviewHash,acknowledgeUnisolated:true};}

for(const native of [false,true])for(const mode of ['LOCAL_ONLY','PROTECTED_REQUIRED'])test(`${mode} native=${native}: same candidate gets fresh one-use Attempt; original failure and budgets survive recovery`,async t=>{
  const f=await fixture(t,mode);
  if(native){f.options.environment.policy=structuredClone(nativeLocalPolicy);f.observePolicy=undefined;}
  const approved=await trusted(f);
  assert.equal(count(f),1);
  await writeFile(f.gate,'available');
  const r=await nativeEnvironmentStep(f.store,f.id,approved,{observePolicy:f.observePolicy});
  assert.equal(r.execution?.status,'LOCAL_PASSED',JSON.stringify(r));
  assert.notEqual(r.execution.reservation.attemptId,f.first.execution.reservation.attemptId);
  assert.notEqual(r.execution.reservation.decisionId,f.first.execution.reservation.decisionId);
  assert.notEqual(r.execution.evidenceRef,f.first.execution.evidenceRef);
  assert.equal(r.execution.reservation.candidateTreeHash,f.old.command.candidateTreeHash);
  assert.deepEqual(f.store.readArtifact(f.first.execution.evidenceRef),f.old);
  assert.equal(r.snapshot.budget.usedAttempts,2);assert.equal(r.snapshot.budget.reservedTimeMs,20000);
  assert.equal(r.execution.decision.remainingExecutions,0);
  const report=await taskReport(f.store,f.id);assert.equal(report.complete,mode==='LOCAL_ONLY');
  assert.equal(report.protectedVerification,'UNSATISFIED');assert.ok(report.executionReservations.every(v=>v.status!=='EVIDENCE_DEFECT'));
  const recovery=await recoverObjective(f.store,f.id);assert.equal(recovery.complete,mode==='LOCAL_ONLY');
  const replay=await nativeEnvironmentStep(f.store,f.id,approved);assert.equal(replay.execution.evidenceRef,r.execution.evidenceRef);
  const oldReplay=await nativeLocalStep(f.store,f.id,f.firstTrust);assert.equal(oldReplay.execution.status,'LOCAL_FAILED');assert.equal(count(f),2);
  const evidence=f.store.readArtifact(r.execution.evidenceRef);assert.equal(evidence.environmentRecovery.evidenceRef,f.first.execution.evidenceRef);
  assert.equal(evidence.policyObservations.length,3);
  if(native) {
    const observation=f.store.readArtifact(evidence.policyObservations[0]);
    assert.equal(observation.kind,'LocalExecutionContextObservation');
    assert.equal(observation.policyAttestation,'NOT_CLAIMED');
    assert.equal(observation.effective,undefined);
  }
  const changed={...approved,environment:{...approved.environment,policy:{...approved.environment.policy,profile:'changed'}}};
  await assert.rejects(()=>nativeEnvironmentStep(f.store,f.id,changed),/already bound/);
  // A broken policy artifact must invalidate completion and recovery, not just
  // produce a warning next to an otherwise successful Local judgment.
  await writeFile(path.join(f.state,'artifacts',evidence.policyObservations[0]+'.json'),'corrupt');
  const corrupted=await taskReport(f.store,f.id);assert.equal(corrupted.complete,false);assert.equal(corrupted.acceptance.reason,'EVIDENCE_DEFECT');
  assert.equal((await recoverObjective(f.store,f.id)).complete,false);
});

test('Local context cannot impersonate an MXC policy or accept expanded policy claims',async()=>{
  for(const policy of [{...nativeLocalPolicy,host:'codex-windows-mxc'},
    {...nativeLocalPolicy,network:{enabled:true}}, {...nativeLocalPolicy,extra:'claimed'}])
    await assert.rejects(()=>observeRecoveryPolicy({policy}),/BLOCKED_CAPABILITY/);
});

test('Native Local recovery requires exact new review and explicit unisolated acknowledgement',async t=>{
  const f=await fixture(t),old=await trusted(f);
  f.options.environment.policy=structuredClone(nativeLocalPolicy);
  await assert.rejects(()=>nativeEnvironmentStep(f.store,f.id,{...f.options,trust:old.trust,acknowledgeUnisolated:true}),/exact environment review/);
  const approved=await trusted(f);
  await assert.rejects(()=>nativeEnvironmentStep(f.store,f.id,{...approved,acknowledgeUnisolated:false}),/exact environment review/);
  assert.equal(count(f),1);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,1);
});

for(const fault of ['no-approval','no-observer','policy','stale-policy','unchanged-policy','candidate','command','revision','contract','classification','diagnostic','budget','expired','old-review','old-request'])
test(`environment recovery rejects ${fault} before a new Attempt`,async t=>{
  const f=await fixture(t),approved=await trusted(f);let options=approved,observer=f.observePolicy;
  if(fault==='no-approval') {await writeFile(f.gate,'available');const r=await nativeEnvironmentStep(f.store,f.id,f.options,{observePolicy:observer});assert.equal(r.action,'AWAIT_ENVIRONMENT_APPROVAL');assert.equal(count(f),1);return;}
  if(fault==='no-observer')observer=undefined;
  if(fault==='policy')observer=async()=>({...await f.observePolicy(),policy:{...f.options.environment.policy,profile:'other'}});
  if(fault==='stale-policy')observer=async()=>({...await f.observePolicy(),observedAt:Date.now()-60000});
  if(fault==='unchanged-policy')options={...approved,environment:{...approved.environment,previousPolicyHash:hash(approved.environment.policy)}};
  if(fault==='candidate')await writeFile(path.join(f.dir,'src/todo.mjs'),'changed');
  if(fault==='command')options={...approved,request:{...approved.request,args:['--version']}};
  if(fault==='revision')options={...approved,revision:approved.revision-1};
  if(fault==='classification')options={...approved,environment:{...approved.environment,classification:'UNKNOWN'}};
  if(fault==='diagnostic')options={...approved,environment:{...approved.environment,diagnosticRef:f.options.environment.evidenceRef}};
  if(fault==='budget'){const current=task(f.store,f.id);current.settings.maxAttempts=1;f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(current),f.id);}
  if(fault==='contract'){const current=task(f.store,f.id);current.settings.timeoutSeconds+=1;f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(current),f.id);}
  if(fault==='expired')options={...approved,expiresAt:Date.now()-1};
  if(fault==='old-review')options={...approved,trust:f.firstTrust.trust};
  if(fault==='old-request')options={...approved,requestId:f.firstTrust.requestId};
  try{const r=await nativeEnvironmentStep(f.store,f.id,options,{observePolicy:observer});assert.notEqual(r.execution?.status,'LOCAL_PASSED');assert.equal(r.complete,false);}catch(e){assert.ok(e.message);}
  assert.equal(count(f),1);assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,1);
});

test('environment unchanged or still failing never claims completion; no third recovery',async t=>{
  const f=await fixture(t),approved=await trusted(f);
  const r=await nativeEnvironmentStep(f.store,f.id,approved,{observePolicy:f.observePolicy});
  assert.equal(r.execution.status,'LOCAL_FAILED');assert.equal(r.complete,false);assert.equal(count(f),2);
  const again=await nativeEnvironmentStep(f.store,f.id,{...f.options,revision:task(f.store,f.id).revision,requestId:randomUUID()});
  assert.equal(again.action,'HUMAN_HANDOFF');assert.equal(count(f),2);
});

test('policy change between admission and spawn consumes Attempt and hands off without launching',async t=>{
  const f=await fixture(t),approved=await trusted(f);let reads=0;
  const r=await nativeEnvironmentStep(f.store,f.id,approved,{observePolicy:async()=>{
    const observed=await f.observePolicy();if(++reads>=3)observed.policy={...observed.policy,profile:'changed'};return observed;
  }});
  assert.equal(r.execution.status,'HUMAN_HANDOFF');assert.equal(count(f),2);assert.equal(r.complete,false);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE type='BOOTSTRAP_EXECUTION_STARTED'").get().n,1);
  const replay=await nativeEnvironmentStep(f.store,f.id,approved);assert.equal(replay.execution.status,'HUMAN_HANDOFF');assert.equal(count(f),2);
});

test('environment trust cannot bypass signed Operator enrollment',async t=>{
  const f=await fixture(t),keys=generateKeyPairSync('ed25519');
  const bridge=new BootstrapOperator(f.store,{operatorKeys:[keys.publicKey.export({type:'spki',format:'pem'})],profile:'fixture'});
  try{bridge.open(f.id);const approved=await trusted(f);await assert.rejects(()=>nativeEnvironmentStep(f.store,f.id,approved,{observePolicy:f.observePolicy}));assert.equal(count(f),1);}finally{bridge.close();}
});
