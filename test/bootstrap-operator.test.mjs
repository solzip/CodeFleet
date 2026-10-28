import test from 'node:test';
import assert from 'node:assert/strict';
import { BootstrapOperator } from '../src/hosts/bootstrap-operator.mjs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { hash } from '../src/alpha/contract.mjs';
import { canonical } from '../src/hosts/operator.mjs';
import { built } from './fixtures/bootstrap-reservation.mjs';
import { fixed } from './fixtures/repair-policy.mjs';
import { task, approveTask } from '../src/product/tasks.mjs';
import { issueOfflineDecision } from '../src/product/reservations.mjs';
import { command } from '../src/alpha/process.mjs';
import { Store } from '../src/alpha/store.mjs';

async function setup(t,{passing=true,...options}={}) {
  const f=await built({passing,...options});t.after(()=>{ f.bridge?.close(); f.store.close(); });
  const v=task(f.store,f.id);v.settings.maxAttempts=2;f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(v),f.id);
  const keys=generateKeyPairSync('ed25519');
  f.publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  f.policyFile=path.join(f.root,'operator-policy.json');
  await writeFile(f.policyFile,JSON.stringify({taskId:f.id,repository:f.dir,publicKey:f.publicKey,
    privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),repairHash:hash(fixed)}),{mode:0o600});
  f.bridge=new BootstrapOperator(f.store,{operatorKeys:[f.publicKey],profile:'p0-3-fixture'});
  f.bridge.open(f.id);
  f.request={executable:process.execPath,args:['--test','--test-reporter=tap','test/todo.test.mjs'],directory:f.dir,timeoutMs:10000};
  f.review=(request,extra={})=>{
    const r=spawnSync(process.execPath,[path.resolve('test/fixtures/bootstrap-signer.mjs'),f.policyFile],{input:JSON.stringify({...request,...extra}),encoding:'utf8',windowsHide:true});
    assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
  };
  f.pending=await f.bridge.requestVerification(f.id,'tests',f.request);
  f.envelope=f.review(f.pending);
  f.signDelegation=(pending,kind='APPROVE')=>{
    const decision={id:pending.action.requestId,kind,binding:pending.binding,
      principal:f.envelope.decision.principal,expiresAt:pending.action.expiresAt,maxUses:1};
    return {decision,signature:sign(null,Buffer.from(canonical(decision)),keys.privateKey).toString('hex')};
  };
  f.accept=()=>f.bridge.acceptVerification({action:f.pending.action,envelope:f.envelope});
  f.input=extra=>({state:f.state,taskId:f.id,publicKey:f.publicKey,request:f.request,
    decisionId:f.pending.action.decisionId,requestId:f.pending.action.requestId,policyFile:f.policyFile,...extra});
  f.call=async extra=>{
    const r=await command(process.execPath,[path.resolve('test/fixtures/bootstrap-operator-worker.mjs'),JSON.stringify(f.input(extra))]);
    assert.equal(r.exitCode,0,r.stdout+r.stderr);return JSON.parse(r.stdout);
  };
  f.count=()=>f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations WHERE taskId=?').get(f.id).n;
  return f;
}
test('P0-3 trusted enrollment is required', () => {
  assert.throws(() => new BootstrapOperator(null, {}));
});
test('P0-3 signed decision consumes once across actual processes and binds Local evidence/Judge',async t=>{
  const f=await setup(t);await f.accept();
  const results=await Promise.all([f.call(),f.call()]);
  assert.ok(results.some(r=>r.execution?.status==='LOCAL_PASSED'),JSON.stringify(results));
  assert.equal(f.count(),1);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_EXECUTION_STARTED').length,1);
  const r=await f.call();assert.equal(r.execution.status,'LOCAL_PASSED');
  assert.equal(r.snapshot.judgments.tests.outcome,'ESCALATE');assert.equal(r.complete,false);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,0);
  console.log('P0-3 verification '+JSON.stringify({state:f.state,taskId:f.id,execution:r.execution,judgments:r.snapshot.judgments}));
});
test('P0-3 unregistered key, forged signature and unsigned actor cannot issue',async t=>{
  const f=await setup(t), original=structuredClone(f.envelope);
  f.envelope.signature='00'.repeat(64);await assert.rejects(f.accept(),/signature/);
  f.envelope=structuredClone(original);
  f.envelope.signature=sign(null,Buffer.from(canonical(original.decision)),generateKeyPairSync('ed25519').privateKey).toString('hex');
  await assert.rejects(f.accept(),/signature/);
  const a=f.pending.action;
  await assert.rejects(issueOfflineDecision(f.store,f.id,'tests',f.request,{decisionId:a.decisionId,requestId:a.requestId,actor:'operator',revision:a.revision,
    commandHash:a.command.commandHash,acknowledgeUnisolated:true,expiresAt:Date.now()+90000,maxExecutions:1,maxConsecutiveFailures:1,timeBudgetMs:10000}),/Signed Operator/);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,0);
});
for(const field of ['taskId','revision','command','candidate','environment','policyHash','scope']) test(`P0-3 altered ${field} fails signed binding`,async t=>{
  const f=await setup(t);const action=structuredClone(f.pending.action);
  if(field==='revision') action.revision++;
  else if(field==='command') action.command.args.push('--extra');
  else if(field==='candidate') action.command.candidateTreeHash='a'.repeat(64);
  else if(field==='scope') action.scope.files.push('src/other.mjs');
  else action[field]='different';
  await assert.rejects(f.bridge.acceptVerification({action,envelope:f.envelope}));assert.equal(f.count(),0);
});
for(const fault of ['revoked','expired','revision','candidate','profile','lease','revoke-before-spawn','revoke-after-result','missing-runtime','clock-backwards']) test(`P0-3 ${fault} cannot execute or commit stale success`,async t=>{
  const f=await setup(t);
  if(fault==='expired') f.envelope=f.review(f.pending,{lifetimeMs:1500});
  await f.accept();const revocation=f.review(f.pending,{kind:'REVOKE'});
  if(fault==='revoked') f.bridge.revoke(revocation);
  if(fault==='expired') await new Promise(r=>setTimeout(r,1600));
  if(fault==='revision') {const v=task(f.store,f.id);v.revision++;f.store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=?').run(JSON.stringify(v),v.revision,f.id);}
  if(fault==='candidate') await writeFile(path.join(f.dir,'src/todo.mjs'),'changed');
  const r=await f.call({fault,revocation,...(fault==='profile'?{profile:'agent-claimed-protected'}:{})});
  assert.notEqual(r.execution?.status,'LOCAL_PASSED',JSON.stringify(r));assert.equal(r.complete??false,false);
  if(['revoked','expired','revision','candidate','profile','missing-runtime'].includes(fault)) assert.equal(f.count(),0);
  if(fault==='clock-backwards') {
    assert.equal(f.count(),1);
    const restarted=await f.call();
    assert.equal(restarted.execution.status,'HUMAN_HANDOFF');
    assert.equal(restarted.snapshot.budget.usedAttempts,1);
    assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,0);
  }
});
test('P0-3 decision consumption rolls back with reservation transaction failure',async t=>{
  const f=await setup(t);await f.accept();
  f.store.db.exec("CREATE TRIGGER fail_signed_reserve BEFORE INSERT ON events WHEN NEW.type='BOOTSTRAP_EXECUTION_RESERVED' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");
  const r=await f.call();assert.equal(r.execution,null);assert.equal(f.count(),0);
  assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,1);
});
for(const fault of ['kill-reserved','kill-started']) test(`P0-3 ${fault} preserves consumed grant and budget after restart`,async t=>{
  const f=await setup(t);await f.accept();const marker=path.join(f.root,'reserved');
  const child=spawn(process.execPath,[path.resolve('test/fixtures/bootstrap-operator-worker.mjs'),JSON.stringify(f.input({fault,marker}))],{stdio:'ignore',windowsHide:true});
  const exited=once(child,'exit');t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  const end=Date.now()+15000;while(!(await readFile(marker).then(()=>true,()=>false))){assert.ok(Date.now()<end);await new Promise(r=>setTimeout(r,30));}
  child.kill('SIGKILL');await exited;
  const r=await f.call();assert.equal(r.execution.status,'HUMAN_HANDOFF');assert.equal(f.count(),1);
  assert.equal(r.snapshot.budget.usedAttempts,1);assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,0);
  assert.throws(()=>f.bridge.open(f.id),/Uncertain/);
});
for(const denied of [false,true]) test(`P0-3 Repair uses new signed Fileset and verification decisions; denied=${denied}`,async t=>{
  const f=await setup(t,{passing:false});await f.accept();const first=await f.call();
  assert.equal(first.execution.status,'LOCAL_FAILED');const e=f.store.readArtifact(first.execution.evidenceRef);
  const proposal={itemId:'todo',evidenceRef:first.execution.evidenceRef,hypothesis:'append entry instead of returning unchanged list',diagnostic:'not ok 1',
    files:[{path:'src/todo.mjs',baseSha256:e.fileDigests['src/todo.mjs'],content:fixed}]};
  const before=await readFile(path.join(f.dir,'src/todo.mjs'),'utf8');
  const r=await f.call({mode:'repair',proposal,fault:denied?'no-repair-approval':undefined});
  if(denied){assert.equal(r.action,'AWAIT_APPROVAL');assert.equal(await readFile(path.join(f.dir,'src/todo.mjs'),'utf8'),before);assert.equal(f.count(),1);}
  else {
    assert.equal(r.execution?.status,'LOCAL_PASSED',JSON.stringify(r));assert.equal(f.count(),2);
    assert.notEqual(r.execution.decision.decisionId,first.execution.decision.decisionId);
    const run=f.store.get(r.runId);assert.equal(run.operatorConsumption.requestId,run.operatorAuthorization.envelope.decision.id);
    assert.equal(r.snapshot.judgments.tests.outcome,'ESCALATE');assert.equal(r.complete,false);
    console.log('P0-3 repair '+JSON.stringify({state:f.state,taskId:f.id,before:first.execution,after:r.execution,repair:r.materialization,approval:run.operatorAuthorization,consumption:run.operatorConsumption}));
  }
});

async function delegation(f,extra={}) {
  f.request.args=['--test','--test-reporter=tap','test/todo.test.mjs','test/calendar.test.mjs'];
  const pending=await f.bridge.requestDelegation(f.id,{
    workItems:['tests','tests-next'].map(itemId=>({itemId,request:f.request})),
    maxAttempts:2,maxReservedTimeMs:20000,expiresAt:Date.now()+120000,...extra});
  const authorization={action:pending.action,envelope:f.signDelegation(pending)};
  return {pending,authorization,...await f.bridge.acceptDelegation(authorization)};
}
for(const mode of ['LOCAL_ONLY','PROTECTED_REQUIRED'])test(`signed batch: one approval continues two dependent verifications; ${mode}`,async t=>{
  const f=await setup(t,{chainedVerification:true,protectedItem:false,acceptanceMode:mode}),d=await delegation(f);
  const result=await f.bridge.continueDelegation(d.delegationRef,f.id);
  assert.equal(result.executions.length,2,JSON.stringify(result));
  assert.ok(result.executions.every(e=>e.status==='LOCAL_PASSED'));
  assert.equal(result.complete,mode==='LOCAL_ONLY');
  assert.equal(result.snapshot.protectedVerification,'UNSATISFIED');
  assert.equal(result.snapshot.budget.usedAttempts,2);
  assert.equal(result.snapshot.budget.reservedTimeMs,20000);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_DELEGATION_ACCEPTED').length,1);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions WHERE remaining=0').get().n,2);
  await assert.rejects(()=>f.bridge.acceptDelegation(d.authorization));
  const replay=await f.bridge.continueDelegation(d.delegationRef,f.id);
  assert.equal(replay.executions.length,0);assert.equal(f.count(),2);
});
test('signed batch: separate-process first execution then trusted reopen resumes only remaining work',async t=>{
  const f=await setup(t,{chainedVerification:true}),d=await delegation(f);
  const grant=await f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request);
  const first=await f.call({decisionId:grant.decisionId,requestId:grant.requestId});
  assert.equal(first.execution.status,'LOCAL_PASSED',JSON.stringify(first));
  f.bridge.close();
  f.store.close();f.store=new Store(f.state);
  f.bridge=new BootstrapOperator(f.store,{operatorKeys:[f.publicKey],profile:'p0-3-fixture'});
  f.bridge.open(f.id);
  const resumed=await f.bridge.continueDelegation(d.delegationRef,f.id);
  assert.equal(resumed.executions.length,1,JSON.stringify(resumed));
  assert.equal(resumed.executions[0].itemId,'tests-next');assert.equal(f.count(),2);
});
for(const fault of ['signature','revoked','command','candidate','revision','acceptance','environment','lease','scope','budget','pending','failure'])
test(`signed batch rejects ${fault} without silently authorizing more work`,async t=>{
  const f=await setup(t,{passing:fault!=='failure',chainedVerification:true});
  if(fault==='signature'){
    const pending=await f.bridge.requestDelegation(f.id,{workItems:[{itemId:'tests',request:f.request}],maxAttempts:2,maxReservedTimeMs:20000,expiresAt:Date.now()+120000});
    const envelope=f.signDelegation(pending);envelope.signature='00'.repeat(64);
    await assert.rejects(()=>f.bridge.acceptDelegation({action:pending.action,envelope}),/signature/);
    assert.equal(f.count(),0);return;
  }
  const d=await delegation(f,fault==='budget'?{maxAttempts:1}:fault==='scope'?{workItems:[{itemId:'tests',request:f.request}]}:{});
  if(fault==='revoked')f.bridge.revoke(f.signDelegation(d.pending,'REVOKE'));
  if(fault==='command')f.request.args=['--version'];
  if(fault==='candidate')await writeFile(path.join(f.dir,'src/todo.mjs'),'changed');
  if(fault==='revision'||fault==='acceptance'){
    const v=task(f.store,f.id);
    if(fault==='revision')v.revision++;else v.acceptanceMode='LOCAL_ONLY';
    f.store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=?').run(JSON.stringify(v),v.revision,f.id);
  }
  if(fault==='lease')f.store.db.prepare('UPDATE runs SET leaseUntil=0 WHERE id=?').run(f.id);
  if(fault==='environment'){
    f.bridge.close();f.store.close();f.store=new Store(f.state);
    f.bridge=new BootstrapOperator(f.store,{operatorKeys:[f.publicKey],profile:'different'});
  }
  if(fault==='pending'){
    await f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request);
    await assert.rejects(()=>f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request),/already issued/);
    assert.equal(f.count(),0);return;
  }
  if(fault==='command'){
    await assert.rejects(()=>f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request));
    assert.equal(f.count(),0);return;
  }
  const result=await f.bridge.continueDelegation(d.delegationRef,f.id);
  assert.equal(result.complete,false);
  assert.equal(f.count(),['budget','scope','failure'].includes(fault)?1:0,JSON.stringify(result));
});

for(const fault of ['revoke-before-spawn','revoke-after-result'])test(`signed batch checks revocation at ${fault}`,async t=>{
 const f=await setup(t,{chainedVerification:true}),d=await delegation(f);
 const grant=await f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request);
 const r=await f.call({decisionId:grant.decisionId,requestId:grant.requestId,fault,revocation:f.signDelegation(d.pending,'REVOKE')});
 assert.equal(r.execution.status,'HUMAN_HANDOFF',JSON.stringify(r));
 assert.equal(r.complete,false);assert.equal(f.count(),1);
 const stopped=await f.bridge.continueDelegation(d.delegationRef,f.id);
 assert.equal(stopped.executions.length,0);assert.equal(f.count(),1);
});
test('signed batch observed expiry cannot be revived by clock rollback',async t=>{
 const f=await setup(t,{chainedVerification:true}),d=await delegation(f),clock=Date.now;
 try{
  Date.now=()=>d.pending.action.expiresAt+1;
  f.store.db.prepare('UPDATE runs SET leaseUntil=? WHERE id=?').run(Date.now()+60000,f.id);
  await assert.rejects(()=>f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request),/expired/);
 }finally{Date.now=clock;}
 await assert.rejects(()=>f.bridge.issueDelegatedVerification(d.delegationRef,f.id,'tests',f.request),/expired/);
 assert.equal(f.count(),0);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,0);
});

test('Public Host approval payloads cannot authenticate Objective delegation',async t=>{
 const f=await setup(t,{chainedVerification:true});
 const scope={workItems:[{itemId:'tests',request:f.request}],maxAttempts:1,maxReservedTimeMs:10000,expiresAt:Date.now()+120000};
 const pending=await f.bridge.requestDelegation(f.id,scope);
 for(const envelope of [{decision:'accept'},{decision:'acceptForSession'},{token:'client-owned-attestation'},{decision:{kind:'APPROVE',principal:'user',authenticated:true}}]){
  await assert.rejects(f.bridge.acceptDelegation({action:pending.action,envelope}));
 }
 for(const extra of [{sourceChanges:true},{modelCalls:1},{files:['src/todo.mjs']},{backend:'protected'}]){
  await assert.rejects(f.bridge.requestDelegation(f.id,{...scope,...extra}),/Unsupported delegation scope/);
 }
 await assert.rejects(f.bridge.requestDelegation(f.id,{...scope,workItems:[{...scope.workItems[0],files:['src/todo.mjs']}]}),/Unsupported delegated WorkItem/);
 const expanded={...pending,action:{...pending.action,sourceChanges:true,modelCalls:1}};
 await assert.rejects(f.bridge.acceptDelegation({action:expanded.action,envelope:f.signDelegation(expanded)}));
 assert.equal(f.count(),0);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,0);
 assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_DELEGATION_ACCEPTED').length,0);
});
