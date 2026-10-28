import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {BootstrapOperator} from '../src/hosts/bootstrap-operator.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile,readFile,mkdtemp,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {built} from './fixtures/bootstrap-reservation.mjs';
import {fixed} from './fixtures/repair-policy.mjs';
import {task} from '../src/product/tasks.mjs';
import {command} from '../src/alpha/process.mjs';

test('Objective help never opens State, including an unusable State path',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cf-objective-help-'));
 const absent=path.join(root,'absent'),blocked=path.join(root,'regular-file');
 await writeFile(blocked,'preserve');
 for(const state of [absent,blocked])for(const args of [[],['help'],['--help']]){
  const r=await command(process.execPath,['src/alpha/cli.mjs','--state',state,'objective',...args]);
  assert.equal(r.exitCode,0,r.stderr.toString());
  assert.match(JSON.parse(r.stdout.toString()).help,/local-review/);
 }
 await assert.rejects(lstat(absent),{code:'ENOENT'});
 assert.equal(await readFile(blocked,'utf8'),'preserve');
 const denied=await command(process.execPath,['src/alpha/cli.mjs','--state',absent,'objective','authorize-local']);
 assert.notEqual(denied.exitCode,0);
 await assert.rejects(lstat(absent),{code:'ENOENT'});
});

async function fixture(t,passing=false){
 const f=await built({passing,maxAttempts:2});t.after(()=>f.store.close());
 f.request={executable:process.execPath,args:['--test','--test-reporter=tap','test/todo.test.mjs'],directory:f.dir,timeoutMs:10000};
 f.requestFile=path.join(f.root,'request.json');await writeFile(f.requestFile,JSON.stringify(f.request));
 f.options=()=>['--revision',String(task(f.store,f.id).revision),'--request-id',randomUUID(),'--expires',String(Date.now()+120000)];
 f.call=async(options,proposalFile)=>{
  const r=await command(process.execPath,[path.resolve('src/alpha/cli.mjs'),'--state',f.state,'objective','local-step',f.id,f.requestFile,...(proposalFile?[proposalFile]:[]),...options]);
  return {code:r.exitCode,data:JSON.parse(r.stdout)};
 };return f;
}
test('Native CLI: review grants nothing; one-use Local verification and restart preserve incomplete Objective',async t=>{
 const f=await fixture(t,true),options=f.options();
 const review=await f.call(options);assert.equal(review.code,2,JSON.stringify(review));assert.equal(review.data.action,'AWAIT_APPROVAL');
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE type='BOOTSTRAP_EXECUTION_STARTED'").get().n,0);
 const approved=[...options,'--trust',review.data.reviewHash,'--acknowledge-unisolated'];
 const r=await f.call(approved);assert.equal(r.data.execution?.status,'LOCAL_PASSED',JSON.stringify(r));
 assert.equal(r.data.complete,false);assert.equal(r.data.execution.verifierIndependence,'UNPROTECTED');
 const replay=await f.call(approved);assert.equal(replay.data.execution.evidenceRef,r.data.execution.evidenceRef);
 assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE type='BOOTSTRAP_EXECUTION_STARTED'").get().n,1);
});
test('Native CLI: reviewed source repair automatically gets a fresh candidate-bound Attempt and Local evidence',async t=>{
 const f=await fixture(t),o=f.options(),review=await f.call(o);
 const testsBefore=await readFile(path.join(f.dir,'test/todo.test.mjs'),'utf8');
 const first=await f.call([...o,'--trust',review.data.reviewHash,'--acknowledge-unisolated']);
 assert.equal(first.data.execution?.status,'LOCAL_FAILED',JSON.stringify(first));
 const evidence=f.store.readArtifact(first.data.execution.evidenceRef);
 const proposal={itemId:'todo',evidenceRef:first.data.execution.evidenceRef,hypothesis:'append the entry',diagnostic:'not ok 1',files:[{path:'src/todo.mjs',baseSha256:evidence.fileDigests['src/todo.mjs'],content:fixed}]};
 const file=path.join(f.root,'repair.json');await writeFile(file,JSON.stringify(proposal));
 const options=f.options(),before=await readFile(path.join(f.dir,'src/todo.mjs'),'utf8');
 const inspection=await f.call(options,file);assert.equal(inspection.data.action,'AWAIT_APPROVAL',JSON.stringify(inspection));
 assert.equal(await readFile(path.join(f.dir,'src/todo.mjs'),'utf8'),before);
 const r=await f.call([...options,'--trust',inspection.data.reviewHash,'--acknowledge-unisolated'],file);
 assert.equal(r.data.execution?.status,'LOCAL_PASSED',JSON.stringify(r));
 assert.notEqual(first.data.execution.reservation.attemptId,r.data.execution.reservation.attemptId);
 assert.equal(r.data.execution.commandHash,inspection.data.review.afterCommand.commandHash);
 assert.equal(r.data.complete,false);assert.equal(r.data.snapshot.judgments.tests.outcome,'ESCALATE');
 assert.equal(await readFile(path.join(f.dir,'test/todo.test.mjs'),'utf8'),testsBefore);
 assert.equal(await readFile(path.join(f.dir,'src/todo.mjs'),'utf8'),fixed);
 console.log('P0-4 EVIDENCE '+JSON.stringify({state:f.state,taskId:f.id,before:first.data.execution,after:r.data.execution,review:inspection.data.review,repair:r.data.materialization}));
});
for(const fault of ['no-ack','wrong-trust','revision','candidate','expiry','budget']) test(`Native CLI refuses ${fault} without an Attempt`,async t=>{
 const f=await fixture(t,true),o=f.options(),review=await f.call(o);
 const options=[...o,'--trust',fault==='wrong-trust'?'0'.repeat(64):review.data.reviewHash,...(fault==='no-ack'?[]:['--acknowledge-unisolated'])];
 if(['revision','budget'].includes(fault)) {const v=task(f.store,f.id);if(fault==='revision')v.revision++;else v.settings.maxAttempts=0;f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(v),f.id);}
 if(fault==='candidate')await writeFile(path.join(f.dir,'src/todo.mjs'),'changed');
 if(fault==='expiry')options[options.indexOf('--expires')+1]=String(Date.now()-1);
 const r=await f.call(options);assert.notEqual(r.code,0,JSON.stringify(r));
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,0);
});
test('Native CLI races same review: one durable Attempt, changed request cannot reuse it',async t=>{
 const f=await fixture(t,true),o=f.options(),review=await f.call(o),approved=[...o,'--trust',review.data.reviewHash,'--acknowledge-unisolated'];
 const results=await Promise.all([f.call(approved),f.call(approved)]);
 assert.ok(results.some(r=>r.data.execution?.status==='LOCAL_PASSED'),JSON.stringify(results));
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,1);
 await writeFile(f.requestFile,JSON.stringify({...f.request,args:['--version']}));
 assert.equal((await f.call(approved)).code,1);
});
for(const fault of ['kill','lease']) test(`Native CLI ${fault}: restart preserves consumption and never relaunches uncertain effects`,async t=>{
 const f=await fixture(t,true);
 f.request.args=['--test-reporter=tap','-e',"require('node:test')('slow',async()=>{await new Promise(r=>setTimeout(r,2500));});"];
 await writeFile(f.requestFile,JSON.stringify(f.request));const o=f.options(),review=await f.call(o),approved=[...o,'--trust',review.data.reviewHash,'--acknowledge-unisolated'];
 const child=spawn(process.execPath,[path.resolve('src/alpha/cli.mjs'),'--state',f.state,'objective','local-step',f.id,f.requestFile,...approved],{stdio:'ignore',windowsHide:true});
 const exited=once(child,'exit');t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 const end=performance.now()+15000;let row;
 while(!(row=f.store.db.prepare("SELECT runId FROM bootstrap_reservations WHERE state='STARTED'").get())){assert.ok(performance.now()<end,'must actually start');await new Promise(r=>setTimeout(r,20));}
 if(fault==='kill')child.kill('SIGKILL');else f.store.db.prepare("UPDATE runs SET owner='lost' WHERE id=?").run(row.runId);
 await exited;
 const restarted=await f.call(approved);assert.equal(restarted.data.execution.status,'HUMAN_HANDOFF',JSON.stringify(restarted));
 assert.equal(restarted.data.snapshot.budget.usedAttempts,1);assert.equal(f.store.db.prepare('SELECT remaining FROM bootstrap_decisions').get().remaining,0);
 await new Promise(r=>setTimeout(r,2600)); // Allow fixture-only child to finish after hard parent termination.
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,1);
});
test('Native repair refuses out-of-scope proposal and changed approved source',async t=>{
 const f=await fixture(t),o=f.options(),review=await f.call(o),first=await f.call([...o,'--trust',review.data.reviewHash,'--acknowledge-unisolated']);
 const e=f.store.readArtifact(first.data.execution.evidenceRef),before=await readFile(path.join(f.dir,'src/todo.mjs'),'utf8');
 const file=path.join(f.root,'repair.json'),proposal={itemId:'todo',evidenceRef:first.data.execution.evidenceRef,hypothesis:'fix',diagnostic:'not ok 1',files:[{path:'test/todo.test.mjs',baseSha256:e.fileDigests['test/todo.test.mjs'],content:'weakened'}]};
 await writeFile(file,JSON.stringify(proposal));const options=f.options(),bad=await f.call(options,file);
 assert.equal(bad.data.action,'AWAIT_APPROVAL');assert.equal(bad.data.reviewHash,undefined);
 proposal.files=[{path:'src/todo.mjs',baseSha256:e.fileDigests['src/todo.mjs'],content:fixed}];await writeFile(file,JSON.stringify(proposal));
 const inspected=await f.call(options,file);proposal.files[0].content+='// changed\n';await writeFile(file,JSON.stringify(proposal));
 const result=await f.call([...options,'--trust',inspected.data.reviewHash,'--acknowledge-unisolated'],file);assert.equal(result.code,1);
 assert.equal(await readFile(path.join(f.dir,'src/todo.mjs'),'utf8'),before);assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,1);
});
test('Native Local trust cannot bypass signed Operator enrollment',async t=>{
 const f=await fixture(t,true),keys=generateKeyPairSync('ed25519');
 const bridge=new BootstrapOperator(f.store,{operatorKeys:[keys.publicKey.export({type:'spki',format:'pem'})],profile:'fixture'});
 // Close before fixture's Store teardown (node after hooks run in registration order).
 try {
  bridge.open(f.id);const options=f.options(),review=await f.call(options);
  const result=await f.call([...options,'--trust',review.data.reviewHash,'--acknowledge-unisolated']);
  assert.equal(result.code,1);assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,0);
 } finally {bridge.close();}
});

test('Native prepared-review UX owns IDs and survives process restart without replay',async t=>{
 const f=await fixture(t,true);
 const call=async argv=>{
  const r=await command(process.execPath,[path.resolve('src/alpha/cli.mjs'),'--state',f.state,'objective',...argv]);
  return {code:r.exitCode,data:JSON.parse(r.stdout)};
 };
 const prepared=await call(['local-review',f.id,f.requestFile]);
 assert.equal(prepared.code,2);assert.equal(prepared.data.executionGranted,false);
 const {reviewRef,reviewHash}=prepared.data,packet=f.store.readArtifact(reviewRef);
 assert.equal(packet.options.revision,task(f.store,f.id).revision);
 assert.ok(packet.options.requestId);assert.ok(packet.options.expiresAt>Date.now());
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,0);
 const denied=await call(['local-accept',reviewRef,'--trust',reviewHash]);
 assert.equal(denied.code,1);assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,0);
 const accepted=await call(['local-accept',reviewRef,'--trust',reviewHash,'--acknowledge-unisolated']);
 assert.equal(accepted.code,0,JSON.stringify(accepted));
 const replay=await call(['local-accept',reviewRef,'--trust',reviewHash,'--acknowledge-unisolated']);
 assert.equal(replay.data.execution.evidenceRef,accepted.data.execution.evidenceRef);
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n,1);
});
test('Native prepared-review UX rejects candidate drift without refreshing consent',async t=>{
 const f=await fixture(t,true);
 const {prepareNativeLocalReview,acceptNativeLocalReview}=await import('../src/product/native-local.mjs');
 const review=await prepareNativeLocalReview(f.store,f.id,{request:f.request});
 await writeFile(path.join(f.dir,'src/todo.mjs'),'changed');
 const refused=await acceptNativeLocalReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
 assert.equal(refused.action,'HUMAN_HANDOFF');assert.equal(refused.reason,'CANDIDATE_CHANGED');
 assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions').get().n,0);
});

async function existingFixture(t, create=false) {
 const f=await built({passing:true,maxAttempts:2,acceptanceMode:'LOCAL_ONLY'});t.after(()=>f.store.close());
 const api=await import('../src/product/tasks.mjs');
 await writeFile(path.join(f.dir,'notes.txt'),'user uncommitted work\n');
 const created=await api.createTask(f.store,f.dir,'Improve existing source structure',{localExisting:true,acceptanceMode:'LOCAL_ONLY',maxAttempts:2});
 f.id=created.id;const plan=f.store.readArtifact(created.planRef);
 const source=[create?'src/summary.js':'src/todo.mjs','src/calendar.mjs'],tests=['test/todo.test.mjs','test/calendar.test.mjs'];
 const draft={...plan.draft,schemaVersion:create?2:plan.draft.schemaVersion,requirements:['Preserve behavior'],decisions:[{topic:'runtime',choice:'Node',alternatives:[],rationale:'existing runtime'}],
 plannedFiles:source.map(path=>({path,purpose:'Improve existing source'})),plannedTests:tests.map(path=>({path,criteria:['regression']})),
 criteria:[{id:'regression',description:'Existing tests pass',tests}],scope:{includes:source,excludes:['tests','notes.txt']},
 workItems:[{id:'first',kind:'local-edit',dependencies:[],acceptanceCriteria:['preserve behavior'],files:[source[0]]},
 {id:'second',kind:'local-edit',dependencies:['first'],acceptanceCriteria:['preserve behavior'],files:[source[1]]},
 {id:'verify',kind:'local-verification',dependencies:['second'],acceptanceCriteria:['regression'],files:[]}]};
 await api.submitTaskDraft(f.store,f.id,{revision:created.revision,proposal:draft});await api.prepareTask(f.store,f.id);
 f.api=api;f.native=await import('../src/product/native-local.mjs');
 f.propose=async(itemId)=>{const p=source[itemId==='first'?0:1],body=create&&itemId==='first'?null:await readFile(path.join(f.dir,p),'utf8');
 return api.submitBootstrapFiles(f.store,f.id,{revision:task(f.store,f.id).revision,itemId,files:[{path:p,baseSha256:body===null?null:(await import('../src/alpha/contract.mjs')).hash(body),content:body===null?'export const summary = todos => todos.length;\n':body+'\n// bounded improvement\n'}]});};
 return f;
}
test('Existing Local: two dependent modifications, dirty file preserved, new Evidence and process recovery',async t=>{
 const f=await existingFixture(t);
 await assert.rejects(f.propose('second'),/Dependencies/);
 const refs=[];
 for(const id of ['first','second']){
  await f.propose(id);
  const r=await f.native.prepareNativeFilesReview(f.store,f.id,id);
  await assert.rejects(f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash}),/consent/);
  const accepted=await f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true});
  assert.equal(accepted.status,'MATERIALIZED');refs.push(accepted.materializationRef);
  assert.equal((await f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true})).status,'RECORDED_NO_REPLAY');
  const recovered=await command(process.execPath,[path.resolve('src/alpha/cli.mjs'),'--state',f.state,'objective','recover',f.id]);
  assert.equal(recovered.exitCode,0,recovered.stdout.toString());assert.equal(JSON.parse(recovered.stdout).status,'RECOVERED');
 }
 assert.equal(new Set(refs).size,2);
 assert.equal(await readFile(path.join(f.dir,'notes.txt'),'utf8'),'user uncommitted work\n');
 const request={executable:process.execPath,args:['--test','--test-reporter=tap','test/todo.test.mjs','test/calendar.test.mjs'],directory:f.dir,timeoutMs:10000};
 const r=await f.native.prepareNativeLocalReview(f.store,f.id,{request});
 const result=await f.native.acceptNativeLocalReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true});
 assert.equal(result.execution.status,'LOCAL_PASSED');assert.equal(result.complete,true,JSON.stringify(result));assert.equal(result.snapshot.protectedVerification,'UNSATISFIED');
 await writeFile(path.join(f.dir,'after-verification.txt'),'unreviewed addition');
 const report=await (await import('../src/product/report.mjs')).taskReport(f.store,f.id);
 assert.equal(report.complete,false);assert.equal(report.acceptance.reason,'CURRENT_CANDIDATE_CHANGED');
});
for(const fault of ['candidate','untracked','test','base','scope','expiry','revision','reject']){
 test('Existing Local rejects '+fault+' without overwriting user work',async t=>{
  const f=await existingFixture(t);
  if(['base','scope'].includes(fault)){
   const p=fault==='scope'?'test/todo.test.mjs':'src/todo.mjs';
   await assert.rejects(f.api.submitBootstrapFiles(f.store,f.id,{revision:task(f.store,f.id).revision,itemId:'first',files:[{path:p,baseSha256:'0'.repeat(64),content:'bad'}]}),/base or scope/);return;
  }
  await f.propose('first');const r=await f.native.prepareNativeFilesReview(f.store,f.id,'first');
  if(fault==='candidate')await writeFile(path.join(f.dir,'src/calendar.mjs'),'user change');
  if(fault==='test')await writeFile(path.join(f.dir,'test/todo.test.mjs'),'user test change');
  if(fault==='untracked')await writeFile(path.join(f.dir,'new.txt'),'user new file');
  if(fault==='reject')f.api.rejectTask(f.store,f.id,'test-user');
  if(fault==='revision')await f.propose('first');
  const originalNow=Date.now;
  if(fault==='expiry')Date.now=()=>r.review.expiresAt+1;
  try{await assert.rejects(f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true}));}
  finally{Date.now=originalNow;}
  if(fault==='expiry')await assert.rejects(f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true}),/expired/);
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM events WHERE runId=? AND type='BOOTSTRAP_MATERIALIZATION_STARTED'").get(task(f.store,f.id).bootstrap.filesets.first).n,0);
 });
}

test('Existing Local Fileset consent cannot bypass an enrolled Operator',async t=>{
 const f=await existingFixture(t);await f.propose('first');
 const review=await f.native.prepareNativeFilesReview(f.store,f.id,'first');
 const keys=generateKeyPairSync('ed25519'),bridge=new BootstrapOperator(f.store,{operatorKeys:[keys.publicKey.export({type:'spki',format:'pem'})],profile:'fixture'});
 try{
  bridge.open(f.id);
  await assert.rejects(f.native.acceptNativeFilesReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true}));
  assert.equal(task(f.store,f.id).bootstrap.states.first,'FILESET_PROPOSED');
 }finally{bridge.close();}
});

test('Existing Local creates general text source then modifies dependency without losing baseline',async t=>{
 const f=await existingFixture(t,true);
 for(const id of ['first','second']){
  await f.propose(id);
  const r=await f.native.prepareNativeFilesReview(f.store,f.id,id);
  const result=await f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true});
  assert.equal(result.status,'MATERIALIZED',JSON.stringify(result));
  assert.equal(result.operation,id==='first'?'create':'modify');
  const recovered=await command(process.execPath,[path.resolve('src/alpha/cli.mjs'),'--state',f.state,'objective','recover',f.id]);
  assert.equal(recovered.exitCode,0,recovered.stdout.toString());
 }
 assert.equal(await readFile(path.join(f.dir,'src/summary.js'),'utf8'),'export const summary = todos => todos.length;\n');
 assert.equal(await readFile(path.join(f.dir,'notes.txt'),'utf8'),'user uncommitted work\n');
 const request={executable:process.execPath,args:['--test','--test-reporter=tap','test/todo.test.mjs','test/calendar.test.mjs'],directory:f.dir,timeoutMs:10000};
 const review=await f.native.prepareNativeLocalReview(f.store,f.id,{request});
 const verified=await f.native.acceptNativeLocalReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
 assert.equal(verified.complete,true,JSON.stringify(verified));
});
test('Existing Local creation refuses a file appearing after review',async t=>{
 const f=await existingFixture(t,true);await f.propose('first');
 const r=await f.native.prepareNativeFilesReview(f.store,f.id,'first');
 await writeFile(path.join(f.dir,'src/summary.js'),'user content');
 await assert.rejects(f.native.acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true}));
 assert.equal(await readFile(path.join(f.dir,'src/summary.js'),'utf8'),'user content');
});
