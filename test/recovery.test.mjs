import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,cp,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {command} from '../src/alpha/process.mjs';
import {Store} from '../src/alpha/store.mjs';
import {productCli} from '../src/product/cli.mjs';
import {task,approveTask,submitBootstrapFiles} from '../src/product/tasks.mjs';
import {hash} from '../src/alpha/contract.mjs';
import {prepareContractRevision,acceptContractRevision,revokeContractRevision} from '../src/product/contract-revisions.mjs';
import {triageFailure,repairOfflineWorkItem} from '../src/product/repair.mjs';
import {issueOfflineRepairDecision} from '../src/product/reservations.mjs';
import {localTree} from '../src/verification/backends.mjs';
import {continuationSnapshot} from '../src/product/continuation.mjs';
const worker=path.resolve('test/fixtures/recovery-worker.mjs');
test('contract revision preserves A and budgets, supersedes B approval and recovers in new processes',async()=>{
 const f=await setup();await f.apply('normalize');const a=await f.verify('verify-normalize');
 const proposed=await f.call('propose',{itemId:'todo'});await f.call('approve',{filesetHash:proposed.approvalRequest.filesetHash});
 const before=await f.call('recover'),proposalReview=await f.call('revision-review');
 const proposalPath=path.join(f.root,'contract-proposal.json');
 await writeFile(proposalPath,JSON.stringify({revision:before.binding.revision,draft:proposalReview.review.draft}));
 const preparedCli=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','revision-review',f.id,proposalPath]);
 assert.equal(preparedCli.exitCode,2,preparedCli.stdout+preparedCli.stderr);
 const review=JSON.parse(preparedCli.stdout);
 assert.deepEqual(review.review.impact.affected,['protected-review','todo','verify-integrated']);
 assert.ok(review.review.impact.preserved.includes('verify-normalize'));
 await f.call('revision-accept',{reviewRef:review.reviewRef,trust:'forged'},1);
 const acceptedCli=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','revision-accept',review.reviewRef,'--trust',review.reviewHash,'--acknowledge-unisolated']);
 assert.equal(acceptedCli.exitCode,0,acceptedCli.stdout+acceptedCli.stderr);
 const applied=JSON.parse(acceptedCli.stdout);assert.equal(applied.recovery.contractRevision,2);
 assert.equal(applied.contractRevision,2);assert.equal(applied.executionGranted,false);
 await f.call('revision-accept',{reviewRef:review.reviewRef,trust:review.reviewHash},1);
 const stale=await f.call('recover',{binding:before});assert.equal(stale.next,null);
 const resumed=await f.call('recover');assert.equal(resumed.status,'RECOVERED',JSON.stringify(resumed));
 assert.equal(resumed.budget.usedAttempts,1);assert.equal(resumed.contractRevision,2);
 assert.equal(resumed.workItems.find(i=>i.id==='verify-normalize').state,'LOCAL_CHECKPOINT');
 assert.equal(resumed.reservations[0].evidenceRef,a.evidenceRef);
 await f.call('materialize',{itemId:'todo'},1);
 await f.apply('todo');const integrated=await f.verify('verify-integrated');
 assert.equal(integrated.tests,5);const final=await f.call('recover');
 assert.equal(final.budget.usedAttempts,2);assert.equal(final.complete,false);
 assert.equal(final.protectedVerification,'UNSATISFIED');
});
async function call(input,exitCode=0){const r=await command(process.execPath,[worker,JSON.stringify(input)],{timeoutMs:30000});assert.equal(r.exitCode,exitCode,r.stdout+r.stderr);return r.stdout.length?JSON.parse(r.stdout):null;}
async function setup(options){const root=await mkdtemp(path.join(tmpdir(),'cf-recovery-'));const f=await call({action:'prepare',root,options});f.call=(action,extra={},code=0)=>call({...f,action,...extra},code);f.apply=async itemId=>{const p=await f.call('propose',{itemId});await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});return f.call('materialize',{itemId});};f.verify=async itemId=>{const decision=await f.call('issue',{itemId});return f.call('execute',{itemId,decision});};return f;}

for(const variant of ['NEW_CRITERION','EXPANDED_MAPPING']) test(`completed Local objective ${variant} admits a boundary test and bounded repair`,async()=>{
 const f=await setup({localExisting:true,acceptanceMode:'LOCAL_ONLY'});
 await f.apply('normalize');await f.verify('verify-normalize');await f.apply('todo');
 const original=await f.verify('verify-integrated');
 const complete=await f.call('recover');assert.equal(complete.complete,true);
 const s=new Store(f.state);const before=task(s,f.id),oldPlan=s.readArtifact(before.planRef);
 const source=await readFile(path.join(f.repo,'src/create-todo.mjs'));
 const boundary='test/title-limit.test.mjs';
 await writeFile(path.join(f.repo,boundary),"import test from 'node:test'; import assert from 'node:assert/strict'; import {createTodo} from '../src/create-todo.mjs'; test('reject more than one hundred characters',()=>assert.throws(()=>createTodo('x'.repeat(101))));\n");
 const draft=structuredClone(oldPlan.draft);
 if(variant==='NEW_CRITERION'){
  draft.plannedTests.push({path:boundary,criteria:['titleLimit']});
  draft.criteria.push({id:'titleLimit',description:'Reject titles longer than one hundred characters',tests:[boundary]});
  draft.workItems.find(i=>i.id==='todo').acceptanceCriteria.push('titleLimit');
  draft.workItems.find(i=>i.id==='verify-integrated').acceptanceCriteria.push('titleLimit');
 }else{
  draft.plannedTests.push({path:boundary,criteria:['todo']});
  draft.criteria.find(c=>c.id==='todo').tests.push(boundary);
 }
 await assert.rejects(prepareContractRevision(s,f.id,{revision:before.revision,draft,additionalAttempts:2,additionalTimeSeconds:121}),
  /Additional contract time budget exceeds bound/);
 const review=await prepareContractRevision(s,f.id,{revision:before.revision,draft,additionalAttempts:2,additionalTimeSeconds:30});
 assert.ok(review.review.impact.affected.includes('verify-integrated'));
 assert.equal(review.review.additionalTimeSeconds,30);
 await acceptContractRevision(s,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
 const changed=task(s,f.id);assert.equal(changed.coveragePolicy,'MAPPED_TEST_EVIDENCE_V1');
 assert.equal(changed.settings.timeoutSeconds,before.settings.timeoutSeconds+30);
 assert.equal(changed.bootstrap.states.todo,'MATERIALIZED');
 assert.equal(changed.bootstrap.verifications['verify-integrated'],undefined);
 s.close();
 assert.deepEqual(await readFile(path.join(f.repo,'src/create-todo.mjs')),source);
 const pending=await f.call('recover');assert.equal(pending.complete,false);assert.equal(pending.next?.itemId,'verify-integrated',JSON.stringify(pending));
 const premature=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','repair-proposal-request',f.id]);
 assert.equal(premature.exitCode,1);assert.match(premature.stdout.toString('utf8'),/Current settled test failure required/);
 const failed=await f.verify('verify-integrated');assert.equal(failed.status,'LOCAL_FAILED');assert.ok(failed.failed>0);
 const after=await f.call('recover');assert.equal(after.complete,false);assert.equal(after.contractRevision,2);
 assert.equal(after.budget.usedAttempts,3);assert.equal(after.budget.remainingAttempts,2);
 assert.equal(after.reservations.at(-1).evidenceRef,failed.evidenceRef);
 const handoff=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','repair-proposal-request',f.id]);
 assert.equal(handoff.exitCode,0,handoff.stdout+handoff.stderr);
 const packet=JSON.parse(handoff.stdout);
 assert.equal(packet.failureEvidenceRef,failed.evidenceRef);
 assert.equal(packet.modelInvocationGranted,false);assert.equal(packet.executionGranted,false);
 const read=new Store(f.state,{readOnly:true});try{
   const triage=await triageFailure(read,f.id);assert.equal(triage.action,'DIAGNOSE');
   assert.equal(read.readArtifact(original.evidenceRef).status,'LOCAL_PASSED');
   assert.equal(packet.files.find(x=>x.path==='src/create-todo.mjs')?.baseSha256,
    read.readArtifact(failed.evidenceRef).fileDigests['src/create-todo.mjs']);
 }finally{read.close();}
 const repairStore=new Store(f.state);try{
  const evidence=repairStore.readArtifact(failed.evidenceRef);
  const content="import {normalizeTitle} from './normalize-title.mjs'; export function createTodo(input) { const title=normalizeTitle(input); if(title.length>100) throw Error('Too long'); return {title,completed:false}; }\n";
  const request={executable:process.execPath,args:['--test','--test-reporter=tap',...draft.plannedTests.map(t=>t.path)],directory:f.repo,timeoutMs:10000};
  const proposal={itemId:'todo',evidenceRef:failed.evidenceRef,hypothesis:'The title length is unchecked',diagnostic:'not ok',
    files:[{path:'src/create-todo.mjs',baseSha256:evidence.fileDigests['src/create-todo.mjs'],content}]};
  const operator={
   async approveRepair({taskId,approvalRequest}){
    const native=await import('../src/product/native-local.mjs');
    const review=await native.prepareNativeFilesReview(repairStore,taskId,proposal.itemId);
    assert.equal(review.review.filesetHash,approvalRequest.filesetHash);
    assert.equal(review.review.candidateHash,await localTree(f.repo));
    await assert.rejects(native.acceptNativeFilesReview(repairStore,review.reviewRef,{trust:'0'.repeat(64),acknowledgeUnisolated:true}),/consent/);
    assert.equal(repairStore.get(approvalRequest.runId).state,'WAITING_APPROVAL');
    approveTask(repairStore,taskId,{actor:'compiled-recovery-test-policy',workflowHash:approvalRequest.filesetHash,expiresAt:Date.now()+90000});
   },
   async issueVerification({taskId,itemId,runId,revision,commandHash,request,deadline}){
    const resumed=await continuationSnapshot(repairStore,taskId);
    assert.equal(resumed.status,'AWAIT_OPERATOR');
    assert.deepEqual(resumed.next,{kind:'RUN_LOCAL_VERIFICATION',itemId});
    assert.equal(resumed.budget.remainingAttempts,2);
    return issueOfflineRepairDecision(repairStore,taskId,itemId,request,{decisionId:randomUUID(),requestId:randomUUID(),
      actor:'compiled-recovery-test-policy',revision,commandHash,acknowledgeUnisolated:true,
      expiresAt:Math.min(Date.now()+90000,deadline),maxExecutions:1,maxConsecutiveFailures:1,timeBudgetMs:request.timeoutMs},runId);
   }
  };
  let repaired;
  if(variant==='EXPANDED_MAPPING') {
   const native=await import('../src/product/native-local.mjs');
   await submitBootstrapFiles(repairStore,f.id,{revision:task(repairStore,f.id).revision,itemId:proposal.itemId,
    repair:{verificationItem:'verify-integrated',evidenceRef:failed.evidenceRef},files:proposal.files});
   const files=await native.prepareNativeFilesReview(repairStore,f.id,proposal.itemId);
   await native.acceptNativeFilesReview(repairStore,files.reviewRef,{trust:files.reviewHash,acknowledgeUnisolated:true});
   const review=await native.prepareNativeLocalReview(repairStore,f.id,{request});
   assert.equal(review.review.repair.evidenceRef,failed.evidenceRef);
   assert.equal(review.review.repair.runId,files.review.runId);
   await assert.rejects(native.acceptNativeLocalReview(repairStore,review.reviewRef,{trust:'0'.repeat(64),acknowledgeUnisolated:true}),/Exact prepared/);
   const changedCommand={...request,timeoutMs:request.timeoutMs-1};
   await assert.rejects(native.prepareNativeLocalReview(repairStore,f.id,{request:changedCommand}),/Repair verification command changed/);
   repaired=await native.acceptNativeLocalReview(repairStore,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
   const replay=await native.acceptNativeLocalReview(repairStore,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
   assert.equal(replay.action,'RECONCILE_OR_RECORDED');
   assert.equal(replay.snapshot.budget.usedAttempts,4);
  } else repaired=await repairOfflineWorkItem(repairStore,f.id,{proposal,request,operator});
  assert.equal(repaired.execution?.status,'LOCAL_PASSED',JSON.stringify(repaired));
  assert.equal(repaired.snapshot.complete,true,JSON.stringify(repaired.snapshot));
  assert.equal(repaired.snapshot.budget.usedAttempts,4);
 }finally{repairStore.close();}
 const recovered=await f.call('recover');assert.equal(recovered.complete,true,JSON.stringify(recovered.blockers));
 assert.equal(recovered.budget.usedAttempts,4);
 const testBytes=await readFile(path.join(f.repo,boundary));
 await writeFile(path.join(f.repo,boundary),Buffer.concat([testBytes,Buffer.from('// changed after verification\n')]));
 const drift=await f.call('recover');assert.equal(drift.complete,false);assert.equal(drift.budget.usedAttempts,4);
 await writeFile(path.join(f.repo,boundary),testBytes);
 assert.equal((await f.call('recover')).complete,true);
});
test('P0-C A: new processes recover A, admit B and connect fresh integrated Evidence without replay',async()=>{
 const f=await setup();await f.apply('normalize');const a=await f.verify('verify-normalize');
 const before=await f.call('recover');assert.equal(before.status,'RECOVERED',JSON.stringify(before.blockers));assert.equal(before.next.itemId,'todo');assert.equal(before.budget.usedAttempts,1);
 const bindingFile=path.join(f.root,'binding.json');await writeFile(bindingFile,JSON.stringify(before.binding));
 const cli=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','recover',f.id,bindingFile]);assert.equal(cli.exitCode,0,cli.stdout+cli.stderr);assert.equal(JSON.parse(cli.stdout).executionGranted,false);
 const again=await f.call('recover');assert.equal(again.workLog.hash,before.workLog.hash);assert.equal(again.observationHash,before.observationHash);
 const checkpointFile=path.join(f.root,'recovery.json');await writeFile(checkpointFile,JSON.stringify(before));
 const resumed=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','recover',f.id,checkpointFile]);
 assert.equal(resumed.exitCode,0,resumed.stdout+resumed.stderr);const resumedReport=JSON.parse(resumed.stdout);
 assert.equal(resumedReport.synchronization.status,'MATCHED');assert.equal(resumedReport.synchronization.compared,'CHECKPOINT');
 assert.equal(resumedReport.budget.usedAttempts,1);assert.equal(resumedReport.reservations[0].evidenceRef,a.evidenceRef);
 const b=await f.apply('todo');const stale=await f.call('recover',{binding:before.binding});assert.equal(stale.next,null);assert.ok(stale.blockers.includes('STALE_RECOVERY_BINDING'));
 const changed=await f.call('recover',{binding:before});assert.equal(changed.next,null);
 assert.ok(changed.blockers.includes('STALE_RECOVERY_CHECKPOINT'));assert.ok(changed.synchronization.changes.includes('revision'));
 assert.ok(changed.synchronization.retainedCompletedItems.includes('normalize'));assert.equal(changed.budget.usedAttempts,1);
 const after=await f.call('recover');assert.equal(after.status,'RECOVERED',JSON.stringify(after.blockers));assert.equal(after.next.itemId,'verify-integrated');assert.equal(after.workItems.find(i=>i.id==='verify-normalize').state,'LOCAL_CHECKPOINT');
 const integrated=await f.verify('verify-integrated');assert.equal(integrated.tests,5);assert.notEqual(integrated.evidenceRef,a.evidenceRef);assert.notEqual(integrated.reservation.attemptId,a.reservation.attemptId);
 const final=await f.call('recover');assert.equal(final.budget.usedAttempts,2);assert.equal(final.complete,false);assert.equal(final.protectedVerification,'UNSATISFIED');assert.equal(final.reservations.length,2);
 console.log('P0-C EVIDENCE '+JSON.stringify({root:f.root,id:f.id,a:a.evidenceRef,b:b.materializationRef,integrated:integrated.evidenceRef,budget:final.budget,modelCalls:0,authority:'SYNTHETIC_OFFLINE'}));
});
test('contract revision reopens existing B twice, preserves A and reaches fresh Local-only acceptance',async()=>{
 const f=await setup({localExisting:true,acceptanceMode:'LOCAL_ONLY'});
 await f.apply('normalize');await f.verify('verify-normalize');await f.apply('todo');
 const oldDecision=await f.call('issue',{itemId:'verify-integrated'});
 const aBytes=await readFile(path.join(f.repo,'src/normalize-title.mjs'));
 for(let i=0;i<2;i++){
  const review=await f.call('revision-review');
  await f.call('revision-accept',{reviewRef:review.reviewRef,trust:review.reviewHash});
 }
 await f.call('execute',{itemId:'verify-integrated',decision:oldDecision},1);
 const before=await f.call('recover');assert.equal(before.complete,false);assert.equal(before.budget.usedAttempts,1);
 const proposal=await f.call('propose',{itemId:'todo',content:"import {normalizeTitle} from './normalize-title.mjs'; export function createTodo(input) { return {title:normalizeTitle(input),completed:false}; }\n"});
 await f.call('approve',{filesetHash:proposal.approvalRequest.filesetHash});await f.call('materialize',{itemId:'todo'});
 await f.verify('verify-integrated');
 const final=await f.call('recover');assert.equal(final.complete,true,JSON.stringify(final));
 assert.equal(final.contractRevision,3);assert.equal(final.budget.usedAttempts,2);
 assert.equal(final.protectedVerification,'UNSATISFIED');
 assert.deepEqual(await readFile(path.join(f.repo,'src/normalize-title.mjs')),aBytes);
});

test('contract revision rejects revoked, expired, expanded, stale and leased requests without a Task transition',async()=>{
 const f=await setup(),s=new Store(f.state);
 try{
  const current=task(s,f.id),draft=structuredClone(s.readArtifact(current.planRef).draft);
  draft.criteria.find(c=>c.id==='todo').description+='; distinct objects';
  const input={revision:current.revision,draft},review=await prepareContractRevision(s,f.id,input);
  const accept=ref=>acceptContractRevision(s,ref,{trust:hash(s.readArtifact(ref).review),acknowledgeUnisolated:true});
  await assert.rejects(()=>prepareContractRevision(s,f.id,{...input,budget:999}),/unexpected|unknown|field/i);
  await assert.rejects(()=>acceptContractRevision(s,review.reviewRef,{trust:review.reviewHash}),/Explicit/);
  for(const mutate of [r=>r.expiresAt=0,r=>r.issuedAt=Date.now()+60000,r=>r.settings.maxAttempts=5,
    r=>r.candidateHash='forged',r=>r.nextWorkflowHash='forged',r=>r.taskRevision++,
    r=>r.draft.plannedTests[0].path='test/changed.test.mjs',r=>r.draft.criteria[0].tests=['test/create-todo.test.mjs']]){
   const packet=structuredClone(s.readArtifact(review.reviewRef));mutate(packet.review);
   await assert.rejects(()=>accept(s.artifact(packet)));
  }
  revokeContractRevision(s,review.reviewRef);await assert.rejects(()=>accept(review.reviewRef),/revoked/);
  assert.equal(hash(task(s,f.id)),hash(current));
  const fresh=await prepareContractRevision(s,f.id,input);
  const run=current.bootstrap.filesets['fixed-tests'];
  s.db.prepare("UPDATE runs SET owner='active-test-owner' WHERE id=?").run(run);
  await assert.rejects(()=>accept(fresh.reviewRef),/lease|effects/i);
  s.db.prepare('UPDATE runs SET owner=NULL WHERE id=?').run(run);
  assert.equal(hash(task(s,f.id)),hash(current));
 }finally{s.close();}
});

test('contract revision refuses unconfirmed execution without consuming another Attempt',async()=>{
 const f=await setup();await f.apply('normalize');const decision=await f.call('issue',{itemId:'verify-normalize'});
 await f.call('execute',{itemId:'verify-normalize',decision,crash:'beforeCommit'},88);
 const result=await f.call('revision-review',{},1);assert.match(result.error,/RECONCILE/);
 assert.equal((await f.call('recover')).budget.usedAttempts,1);
});

test('checkpoint detects approval revocation without changing the task revision or candidate',async()=>{
 const f=await setup();const proposal=await f.call('propose',{itemId:'normalize'});
 await f.call('approve',{filesetHash:proposal.approvalRequest.filesetHash});const before=await f.call('recover');
 await f.call('fault',{fault:'revoke-fileset',itemId:'normalize'});
 const after=await f.call('recover',{binding:before});assert.deepEqual(after.binding,before.binding);
 assert.ok(after.blockers.includes('STALE_RECOVERY_CHECKPOINT'));assert.ok(after.synchronization.changes.includes('executionState'));
 assert.equal(after.next,null);assert.equal(after.executionGranted,false);assert.equal(after.budget.usedAttempts,0);
});
test('checkpoint rejects cross-objective and fabricated authority fields without changing State',async()=>{
 const f=await setup(),before=await f.call('recover');const s=new Store(f.state,{readOnly:true});const saved=rows(s);s.close();
 for(const checkpoint of [{...before.checkpoint,taskId:'task-other'},{...before.checkpoint,executionGranted:true},{...before.checkpoint,workLogHash:'forged'}]){
  const r=await f.call('recover',{binding:checkpoint});assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);assert.equal(r.executionGranted,false);
 }
 const after=new Store(f.state,{readOnly:true});try{assert.deepEqual(rows(after),saved);}finally{after.close();}
});
test('checkpoint detects a changed Work Log at the same contract and candidate',async()=>{
 const f=await setup(),before=await f.call('recover');const s=new Store(f.state);
 try{s.event(f.id,'RECOVERY_TEST_OBSERVATION',{authority:'NONE'});}finally{s.close();}
 const after=await f.call('recover',{binding:before.checkpoint});assert.deepEqual(after.binding,before.binding);
 assert.ok(after.synchronization.changes.includes('workLog'));assert.equal(after.status,'HUMAN_HANDOFF');
 assert.equal(after.next,null);assert.equal(after.budget.usedAttempts,0);assert.equal(after.executionGranted,false);
});
for(const crash of ['reserved','beforeEvidence','beforeCommit'])test('P0-C B: crashed '+crash+' never replays or refunds',async()=>{
 const f=await setup();await f.apply('normalize');const decision=await f.call('issue',{itemId:'verify-normalize'});
 await f.call('execute',{itemId:'verify-normalize',decision,crash},88);
 const recovered=await f.call('recover');assert.equal(recovered.status,'RECONCILE',JSON.stringify(recovered));assert.equal(recovered.next,null);assert.equal(recovered.budget.usedAttempts,1);assert.equal(recovered.budget.reservedTimeMs,10000);assert.ok(recovered.effects.length);
 const replay=await f.call('execute',{itemId:'verify-normalize',decision});assert.equal(replay.status,'HUMAN_HANDOFF');assert.equal(replay.evidenceRef,undefined);
 const again=await f.call('recover');assert.equal(again.budget.usedAttempts,1);assert.equal(again.workLog.hash,recovered.workLog.hash);assert.equal(again.reservations[0].decision.remainingExecutions,0);
});
test('P0-C B: interrupted file creation preserves bytes and public materialize refuses replay',async()=>{
 const f=await setup();const p=await f.call('propose',{itemId:'normalize'});await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});await f.call('materialize',{itemId:'normalize',crash:true},89);
 const bytes=await readFile(path.join(f.repo,'src/normalize-title.mjs'));const r=await f.call('recover');assert.equal(r.status,'RECONCILE');assert.equal(r.next,null);assert.equal(r.budget.usedAttempts,0);
 const cli=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','materialize',f.id,'normalize']);assert.equal(cli.exitCode,1);assert.match(cli.stdout.toString(),/RECONCILE/);assert.deepEqual(await readFile(path.join(f.repo,'src/normalize-title.mjs')),bytes);
});
for(const fault of ['expire-fileset','revoke-fileset'])test('P0-C: '+fault+' does not authorize recovered materialization',async()=>{
 const f=await setup();const p=await f.call('propose',{itemId:'normalize'});await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});await f.call('fault',{fault,itemId:'normalize'});
 const r=await f.call('recover');assert.equal(r.status,'HUMAN_HANDOFF');assert.ok(r.blockers.includes('FILESET_APPROVAL_REQUIRED'));await f.call('materialize',{itemId:'normalize'},1);assert.equal((await f.call('recover')).budget.usedAttempts,0);
});
for(const fault of ['expire-decision','revoke-decision','source','revision'])test('P0-C C: '+fault+' blocks old Decision without budget refund or hidden execution',async()=>{
 const f=await setup();await f.apply('normalize');const decision=await f.call('issue',{itemId:'verify-normalize'});const before=await f.call('recover');await f.call('fault',{fault,decision});
 await f.call('execute',{itemId:'verify-normalize',decision},1);const r=await f.call('recover',{binding:before.binding});assert.equal(r.executionGranted,false);assert.equal(r.budget?.usedAttempts??0,0);assert.equal(r.reservations?.[0]?.reservation,undefined);
 if(['source','revision'].includes(fault))assert.equal(r.next,null);
});
test('P0-C: corrupt historical evidence stays blocked and consumed budget remains consumed',async()=>{
 const f=await setup();await f.apply('normalize');await f.verify('verify-normalize');await f.call('fault',{fault:'evidence'});const r=await f.call('recover');assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);assert.equal(r.budget.usedAttempts,1);
});
test('P0-C: recovery accepts no execution flags or forged conversation binding',async()=>{
 const f=await setup();const bad=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','recover',f.id,'--allow-model']);assert.equal(bad.exitCode,1);assert.equal((await f.call('recover',{binding:{revision:6,summary:'all approved'}})).status,'HUMAN_HANDOFF');
});
test('P0-C: missing materialization provenance cannot be repaired by a conversation summary',async()=>{
 const f=await setup();await f.apply('normalize');await f.verify('verify-normalize');await f.call('fault',{fault:'receipt'});const r=await f.call('recover');assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);assert.match(r.blockers.join(' '),/RECOVERY_RECORD_DEFECT/);assert.equal(r.budget.usedAttempts,1);
});

function rows(store) {
 const result={};for(const {name} of store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()){
  assert.match(name,/^[a-z_]+$/);result[name]=store.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all();
 }return result;
}
async function artifacts(state) {return Promise.all((await readdir(path.join(state,'artifacts'))).sort().map(async name=>[name,await readFile(path.join(state,'artifacts',name),'utf8')]));}

test('P0-C read-only CLI: r7 proposed fileset survives without initialization, transactions or authority',async t=>{
 const f=await setup();await f.call('propose',{itemId:'normalize'});
 // Clone State; embedded repository identity is intentionally unchanged and only read.
 const copy=path.join(f.root,'state-copy');await cp(f.state,copy,{recursive:true});
 let s=new Store(copy,{readOnly:true});const before=rows(s);s.close();const beforeArtifacts=await artifacts(copy);
 const sql=[],closed=[];const exec=DatabaseSync.prototype.exec,prepare=DatabaseSync.prototype.prepare,close=DatabaseSync.prototype.close;
 t.mock.method(DatabaseSync.prototype,'exec',function(text){sql.push(text);return exec.call(this,text);});
 t.mock.method(DatabaseSync.prototype,'prepare',function(text){sql.push(text);return prepare.call(this,text);});
 t.mock.method(DatabaseSync.prototype,'close',function(){close.call(this);closed.push(this.isOpen);});
 const outcome=await productCli(['recover',f.id],copy);
 t.mock.restoreAll();
 assert.equal(outcome.exitCode,0,JSON.stringify(outcome));const r=outcome.data;
 assert.equal(r.objective.id,f.id);assert.equal(r.binding.revision,7);assert.equal(r.workItems.find(i=>i.id==='normalize').state,'FILESET_PROPOSED');
 assert.deepEqual(r.next,{kind:'AWAIT_FILESET_APPROVAL',itemId:'normalize'});
 assert.equal(r.budget.usedAttempts,0);assert.equal(r.budget.remainingTimeMs,120000);
 assert.equal(r.executionGranted,false);assert.equal(r.modelInvocationGranted,false);assert.equal(r.automaticReplay,false);
 assert.deepEqual(closed,[false]);
 assert.ok(sql.length>0);assert.ok(sql.every(q=>/^\s*(SELECT|PRAGMA)\b/i.test(q)),sql.join('\n'));
 assert.ok(!sql.some(q=>/BEGIN|COMMIT|ROLLBACK|CREATE|INSERT|UPDATE|DELETE|journal_mode|user_version\s*=/i.test(q)),sql.join('\n'));
 s=new Store(copy,{readOnly:true});try{assert.deepEqual(rows(s),before);}finally{s.close();}
 assert.deepEqual(await artifacts(copy),beforeArtifacts);
 assert.equal(existsSync(path.join(f.repo,'src/normalize-title.mjs')),false);
 const child=await command(process.execPath,['src/alpha/cli.mjs','objective','recover',f.id,'--state',copy]);
 assert.equal(child.exitCode,0,child.stdout+child.stderr);assert.deepEqual(JSON.parse(child.stdout).binding,r.binding);
 s=new Store(copy,{readOnly:true});try{assert.deepEqual(rows(s),before);}finally{s.close();}
});

test('P0-C read-only Store rejects INSERT UPDATE DDL, write transaction, migration and artifact writes',async()=>{
 const f=await setup(),s=new Store(f.state,{readOnly:true});
 try{
  const before=rows(s),a=await artifacts(f.state);
  for(const sql of ["INSERT INTO workflow_extensions VALUES ('forged',1)","UPDATE product_tasks SET revision=revision+1",'CREATE TABLE forbidden(id INTEGER)','BEGIN IMMEDIATE'])assert.throws(()=>s.db.exec(sql),/readonly|read.only/i);
  assert.throws(()=>s.enableWorkflows(),/Read-only/);assert.throws(()=>s.enableCollaboration(),/Read-only/);assert.throws(()=>s.artifact({forged:true}),/Read-only/);
  // Native file-open flag still denies writes even if the connection-local safeguard is removed.
  s.db.exec('PRAGMA query_only=OFF');assert.throws(()=>s.db.exec('UPDATE product_tasks SET revision=revision+1'),/readonly|read.only/i);
  assert.deepEqual(rows(s),before);assert.deepEqual(await artifacts(f.state),a);
 }finally{s.close();}
});

test('P0-C absent State/DB and malformed CLI never create directories or initialize SQLite',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cf-recovery-missing-'));
 for(const directory of [path.join(root,'missing','state'),path.join(root,'empty')]){
  if(directory.endsWith('empty'))await mkdir(directory);
  assert.throws(()=>new Store(directory,{readOnly:true}));
  const r=await productCli(['recover','task-missing'],directory);assert.equal(r.exitCode,1);
  assert.equal(existsSync(path.join(directory,'state.sqlite')),false);
 }
 assert.equal(existsSync(path.join(root,'missing')),false);
 const f=await setup(),s=new Store(f.state,{readOnly:true});const before=rows(s);s.close();
 assert.equal((await productCli(['recover',f.id,'--allow-model'],f.state)).exitCode,1);
 const after=new Store(f.state,{readOnly:true});try{assert.deepEqual(rows(after),before);}finally{after.close();}
});

for(const fault of ['v0','v1','future','missing-table','missing-column','future-extension','missing-extension','partial-reservations','future-reservations','corrupt-file'])test('P0-C schema fail closed without repair: '+fault,async t=>{
 const f=await setup();
 const db=new DatabaseSync(path.join(f.state,'state.sqlite'));
 try{
  if(fault==='v0')db.exec('PRAGMA user_version=0');
  if(fault==='v1')db.exec('PRAGMA user_version=1');
  if(fault==='future')db.exec('PRAGMA user_version=99');
  if(fault==='missing-table')db.exec('DROP TABLE product_tasks');
  if(fault==='missing-column')db.exec('ALTER TABLE product_tasks RENAME COLUMN revision TO incompatible');
  if(fault==='future-extension')db.exec("UPDATE workflow_extensions SET version=99 WHERE name='product-tasks'");
  if(fault==='missing-extension')db.exec("DELETE FROM workflow_extensions WHERE name='controlled-hybrid'");
  if(fault==='partial-reservations')db.exec('CREATE TABLE bootstrap_decisions(id TEXT)');
  if(fault==='future-reservations')db.exec("INSERT INTO workflow_extensions VALUES ('bootstrap-reservations',99)");
 }finally{db.close();}
 if(fault==='corrupt-file')await writeFile(path.join(f.state,'state.sqlite'),'not a SQLite database');
 const before=await readFile(path.join(f.state,'state.sqlite'));const closed=[];const close=DatabaseSync.prototype.close;
 t.mock.method(DatabaseSync.prototype,'close',function(){close.call(this);closed.push(this.isOpen);});
 const result=await productCli(['recover',f.id],f.state);t.mock.restoreAll();
 assert.notEqual(result.exitCode,0,JSON.stringify(result));assert.notEqual(result.data.status,'RECOVERED');assert.notEqual(result.data.executionGranted,true);
 assert.deepEqual(closed,[false]);assert.deepEqual(await readFile(path.join(f.state,'state.sqlite')),before);
});

test('P0-C default writable Store still creates V1, migrates and persists data',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cf-write-regression-')),s=new Store(path.join(root,'new-state'));
 try{assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,1);s.enableCollaboration();assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,2);
  s.create({id:'write-regression',contractHash:'test'});s.event('write-regression','WRITE_OK',{ok:true});assert.equal(s.events('write-regression').length,2);
  const digest=s.artifact({ok:true});assert.deepEqual(s.readArtifact(digest),{ok:true});
 }finally{s.close();}
});

test('P0-C consumed reservation recovery performs no initialization or write transaction',async t=>{
 const f=await setup();await f.apply('normalize');const a=await f.verify('verify-normalize');
 const s=new Store(f.state,{readOnly:true});const before=rows(s);s.close();
 const sql=[],exec=DatabaseSync.prototype.exec;
 t.mock.method(DatabaseSync.prototype,'exec',function(q){sql.push(q);return exec.call(this,q);});
 const result=await productCli(['recover',f.id],f.state);t.mock.restoreAll();
 assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.data.budget.usedAttempts,1);
 assert.equal(result.data.reservations[0].decision.remainingExecutions,0);
 assert.equal(result.data.reservations[0].evidenceRef,a.evidenceRef);
 assert.ok(sql.every(q=>/^PRAGMA query_only=ON; PRAGMA busy_timeout=5000$/.test(q)),sql.join('\n'));
 const after=new Store(f.state,{readOnly:true});try{assert.deepEqual(rows(after),before);}finally{after.close();}
});

test('P0-C WAL reader succeeds beside an active writer and observes only committed rows',async()=>{
 const f=await setup(),writer=new Store(f.state);
 try{
  writer.db.exec('PRAGMA wal_autocheckpoint=0');writer.event(f.id,'COMMITTED_OBSERVATION',{fixture:true});
  const before=rows(writer);writer.db.exec('BEGIN IMMEDIATE');writer.event(f.id,'UNCOMMITTED_OBSERVATION',{fixture:true});
  const result=await productCli(['recover',f.id],f.state);
  assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.data.workLog.recent.at(-1).type,'COMMITTED_OBSERVATION');
  writer.db.exec('ROLLBACK');assert.deepEqual(rows(writer),before);
 }finally{if(writer.db.isTransaction)writer.db.exec('ROLLBACK');writer.close();}
});

test('unprepared draft recovery preserves objective without falsely declaring corrupt execution records',async()=>{
 const f=await setup();let s=new Store(f.state);
 const {createTask}=await import('../src/product/tasks.mjs');
 const pending=await createTask(s,f.repo,'Create a local Todo tool');
 s.close();s=new Store(f.state,{readOnly:true});
 try{
  const before=rows(s),{recoverObjective}=await import('../src/product/recovery.mjs');
  const r=await recoverObjective(s,pending.id);
  assert.equal(r.status,'RECOVERED',JSON.stringify(r));assert.equal(r.stage,'DRAFT');
  assert.equal(r.objective.text,'Create a local Todo tool');assert.equal(r.next.kind,'REVIEW_DRAFT');
  assert.equal(r.complete,false);assert.equal(r.executionGranted,false);assert.equal(r.modelInvocationGranted,false);
  assert.deepEqual(rows(s),before);
 }finally{s.close();}
});
test('removing prepared workflow metadata does not masquerade as harmless draft recovery',async()=>{
 const f=await setup(),s=new Store(f.state);
 try{
  const {task}=await import('../src/product/tasks.mjs'),{recoverObjective}=await import('../src/product/recovery.mjs');
  const current=task(s,f.id);delete current.bootstrap;current.state='NEEDS_INPUT';
  s.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(current),f.id);
  const r=await recoverObjective(s,f.id);
  assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);
  assert.match(r.blockers.join(' '),/inconsistent lifecycle/);
 }finally{s.close();}
});
