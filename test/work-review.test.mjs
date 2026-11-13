import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {Store} from '../src/alpha/store.mjs';
import {hash} from '../src/alpha/contract.mjs';
import {enableTasks,createTask,task,submitTaskDraft,prepareTask,submitBootstrapFiles,approveTask,materializeTask,verifyTask} from '../src/product/tasks.mjs';
import {prepareNativeFilesReview,acceptNativeFilesReview,prepareNativeLocalReview,acceptNativeLocalReview} from '../src/product/native-local.mjs';
import {workControl,workEffects,prepareWorkClose,acceptWorkClose,declineWorkReview,guardWorkCli} from '../src/product/work-review.mjs';
import {validateBootstrapDraft} from '../src/intent/bootstrap.mjs';
import {workReport,workList,selectWorkPhase} from '../src/product/work-report.mjs';
import {productCli} from '../src/product/cli.mjs';
import {ownerReview,renderOwnerCommand} from '../src/product/work-owner.mjs';
import {installHost,manageHost} from '../src/hosts/install.mjs';

test('phase P01..P14 and every pair of ordered predicates preserve priority',()=>{
  const cases=[['readError','READ_ERROR'],['unknown','UNRESOLVED'],['closed','CANCELLED'],['activeDrift','UNRESOLVED'],['running','APPLYING'],['paused','PAUSED'],['stale','STALE'],['complete','COMPLETE_LOCAL'],['stopped','STOPPED_FAILED'],['failed','FAILED_REVIEW'],['unprepared','PLAN'],['files','AWAIT_FILE_REVIEW'],['tests','AWAIT_TEST_REVIEW']];
  for(let i=0;i<cases.length;i++){
    const [key,expected]=cases[i];assert.equal(selectWorkPhase({[key]:true,closedOutcome:'CANCELLED'}),expected,key);
    for(let j=i+1;j<cases.length;j++)assert.equal(selectWorkPhase({[key]:true,[cases[j][0]]:true,closedOutcome:'CANCELLED'}),expected,key+' before '+cases[j][0]);
  }
  assert.equal(selectWorkPhase({}),'BLOCKED_UNSUPPORTED');assert.equal(selectWorkPhase({running:true,verifying:true}),'VERIFYING');assert.equal(selectWorkPhase({unprepared:true,needsInput:true}),'NEEDS_INPUT');
});

async function fixture(t,mode='CHANGE'){
  const root=await mkdtemp(path.join(tmpdir(),'cf-work-review-')),repo=path.join(root,'repo'),state=path.join(root,'state');
  await mkdir(path.join(repo,'src'),{recursive:true});await mkdir(path.join(repo,'test'));
  await writeFile(path.join(repo,'src/app.mjs'),'export const answer=1;\n');
  await writeFile(path.join(repo,'test/app.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {answer} from '../src/app.mjs';test('answer',()=>assert.equal(answer,2));\n");
  const git=(...args)=>execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),...args],{cwd:repo,stdio:'pipe',windowsHide:true});git('init');git('add','.');git('-c','user.name=sol','-c','user.email=sol@example.invalid','commit','-m','fixture');
  const store=new Store(state);enableTasks(store);t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const c=await createTask(store,repo,'Verify the answer implementation',{localExisting:true,acceptanceMode:'LOCAL_ONLY',workProfile:'WORK_REVIEW_V1',mode});const plan=store.readArtifact(c.planRef),src=mode==='CHANGE'?['src/app.mjs']:[];
  const draft={...plan.draft,requirements:['Answer is two'],decisions:[{topic:'runtime',choice:'Node',alternatives:[],rationale:'Existing runtime'}],plannedFiles:src.map(path=>({path,purpose:'Answer implementation'})),plannedTests:[{path:'test/app.test.mjs',criteria:['answer']}],criteria:[{id:'answer',description:'Answer is two',tests:['test/app.test.mjs']}],scope:{includes:src,excludes:['test']},workItems:[...(mode==='CHANGE'?[{id:'implement',kind:'local-edit',dependencies:[],acceptanceCriteria:['Answer is two'],files:src}]:[]),{id:'verify',kind:'local-verification',dependencies:mode==='CHANGE'?['implement']:[],acceptanceCriteria:['Answer is two'],files:[]}]};
  await submitTaskDraft(store,c.id,{revision:c.revision,proposal:draft});await prepareTask(store,c.id);
  const f={root,repo,state,store,id:c.id,request:{executable:process.execPath,args:['--test','--test-reporter=tap','test/app.test.mjs'],directory:repo,timeoutMs:30000}};
  f.propose=async(content='export const answer=2;\n',repair)=>submitBootstrapFiles(store,c.id,{revision:task(store,c.id).revision,itemId:'implement',files:[{path:'src/app.mjs',content,baseSha256:hash(await readFile(path.join(repo,'src/app.mjs')))}],...(repair?{repair}:{})});
  f.apply=async()=>{const r=await prepareNativeFilesReview(store,c.id,'implement');return acceptNativeFilesReview(store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true});};
  f.verify=async()=>{const r=await prepareNativeLocalReview(store,c.id,{request:f.request});assert.ok(r.reviewRef,JSON.stringify(r));return acceptNativeLocalReview(store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true});};return f;
}

test('work CHANGE: exact separate approvals, evidence and read-only report',async t=>{
  const f=await fixture(t);await f.propose();assert.equal((await f.apply()).status,'MATERIALIZED');
  assert.equal(workEffects(f.store,task(f.store,f.id)).certainty,'SETTLED');
  assert.equal((await f.verify()).execution.status,'LOCAL_PASSED');
  const r=await workReport(f.store,f.id);assert.equal(r.phase,'COMPLETE_LOCAL',JSON.stringify(r));assert.equal(r.budget.attemptsUsed,1);
  const before=f.store.events(f.id);assert.equal((await productCli(['status',f.id],f.state)).data.phase,'COMPLETE_LOCAL');assert.deepEqual(f.store.events(f.id),before);
});

// A fresh process has no in-memory Task, approval or budget context.
function restartedReport(f){
  const script=`import {Store} from ${JSON.stringify(pathToFileURL(path.resolve('src/alpha/store.mjs')).href)};
import {workReport,workList} from ${JSON.stringify(pathToFileURL(path.resolve('src/product/work-report.mjs')).href)};
const s=new Store(process.argv[1],{readOnly:true});
try{console.log(JSON.stringify({list:workList(s,process.argv[2]),report:await workReport(s,process.argv[3])}));}finally{s.close();}`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script,f.state,f.repo,f.id],{encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(child.status,0,child.stderr);return JSON.parse(child.stdout);
}

test('fresh-process recovery discovers failed work without resetting evidence or budget',async t=>{
  const f=await fixture(t);await f.propose('export const answer=0;\n');await f.apply();
  const failed=await f.verify();assert.equal(failed.execution.status,'LOCAL_FAILED');
  const before=await workReport(f.store,f.id),events=f.store.events(f.id),runs=f.store.list();
  const recovered=restartedReport(f);
  assert.equal(recovered.list.tasks.find(row=>row.taskId===f.id).taskId,f.id);
  assert.equal(recovered.list.executionGranted,false);
  assert.equal(recovered.report.phase,'FAILED_REVIEW');assert.equal(recovered.report.nextAction.kind,'PROPOSE');
  assert.deepEqual(recovered.report.evidenceRefs,before.evidenceRefs);
  assert.ok(recovered.report.evidenceRefs.includes(failed.execution.evidenceRef));
  assert.deepEqual(recovered.report.budget,before.budget);assert.equal(before.budget.attemptsUsed,1);
  assert.deepEqual(f.store.events(f.id),events);assert.deepEqual(f.store.list(),runs);
  await f.propose('export const answer=2;\n',{verificationItem:'verify',evidenceRef:failed.execution.evidenceRef});
  await f.apply();assert.equal((await f.verify()).execution.status,'LOCAL_PASSED');
  const complete=restartedReport(f).report;assert.equal(complete.phase,'COMPLETE_LOCAL');
  assert.equal(complete.budget.attemptsUsed,2);assert.equal(complete.budget.attemptsRemaining,0);
});

test('fresh-process recovery preserves pause epoch and rejects old approval',async t=>{
  const f=await fixture(t);await f.propose();const review=await prepareNativeFilesReview(f.store,f.id,'implement');
  const paused=workControl(f.store,f.id,{action:'PAUSE',requestId:randomUUID(),expectedControlSeq:0});
  assert.equal(restartedReport(f).report.phase,'PAUSED');
  workControl(f.store,f.id,{action:'UNPAUSE',requestId:randomUUID(),expectedControlSeq:paused.seq});
  assert.equal(restartedReport(f).report.phase,'AWAIT_FILE_REVIEW');
  await assert.rejects(acceptNativeFilesReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true}),/CONTEXT_STALE/);
  assert.equal(await readFile(path.join(f.repo,'src/app.mjs'),'utf8'),'export const answer=1;\n');
  assert.equal((await workReport(f.store,f.id)).budget.attemptsUsed,0);
});

test('fresh-process recovery refuses stale completion and damaged evidence',async t=>{
  const f=await fixture(t);await f.propose();await f.apply();await f.verify();
  const complete=restartedReport(f).report;assert.equal(complete.phase,'COMPLETE_LOCAL');
  await writeFile(path.join(f.repo,'src/app.mjs'),'export const answer=9;\n');
  const stale=restartedReport(f).report;assert.equal(stale.phase,'STALE');assert.equal(stale.verification.localComplete,false);
  assert.deepEqual(stale.budget,complete.budget);
  await writeFile(path.join(f.state,'artifacts',complete.evidenceRefs[0]+'.json'),'{}');
  const damaged=restartedReport(f).report;assert.equal(damaged.phase,'READ_ERROR');
  assert.deepEqual(damaged.allowedNextActions,['READ_ONLY_INSPECT','STOP']);
  assert.equal(workList(f.store,f.repo).executionGranted,false);
});
test('work VERIFY_CURRENT failure stops without repair',async t=>{
  const f=await fixture(t,'VERIFY_CURRENT');assert.equal((await f.verify()).execution.status,'LOCAL_FAILED');
  assert.equal((await workReport(f.store,f.id)).phase,'STOPPED_FAILED');await assert.rejects(f.propose(),/UNSUPPORTED/);
});
test('work stale consent after pause/unpause, direct APIs and declined review refuse effects',async t=>{
  const f=await fixture(t);await f.propose();const r=await prepareNativeFilesReview(f.store,f.id,'implement');
  workControl(f.store,f.id,{action:'PAUSE',requestId:randomUUID(),expectedControlSeq:0});const seq=(await workReport(f.store,f.id)).control.sequence;
  workControl(f.store,f.id,{action:'UNPAUSE',requestId:randomUUID(),expectedControlSeq:seq});
  await assert.rejects(acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true}),/CONTEXT_STALE/);
  assert.throws(()=>approveTask(f.store,f.id,{}),/NATIVE_REVIEW/);await assert.rejects(materializeTask(f.store,f.id,'implement'),/NATIVE_REVIEW/);
  const fresh=await prepareNativeFilesReview(f.store,f.id,'implement');declineWorkReview(f.store,fresh.reviewRef);
  await assert.rejects(acceptNativeFilesReview(f.store,fresh.reviewRef,{trust:fresh.reviewHash,acknowledgeUnisolated:true}),/DECLINED/);
  await assert.rejects(ownerReview(f.store,fresh.reviewRef,fresh.reviewHash,{input:{isTTY:false},output:{isTTY:false}}),/TTY/);
  assert.equal(await readFile(path.join(f.repo,'src/app.mjs'),'utf8'),'export const answer=1;\n');
});

test('offline simulated TTY shows objective, full profile and before/after source before consent',async t=>{
  const f=await fixture(t);await f.propose();const r=await prepareNativeFilesReview(f.store,f.id,'implement');
  const input=new PassThrough(),output=new PassThrough();input.isTTY=true;output.isTTY=true;let shown='',sent=false;
  output.on('data',chunk=>{shown+=chunk.toString();if(!sent&&shown.includes('Type APPLY')){sent=true;queueMicrotask(()=>input.end('APPLY\n'));}});
  const accepted=await ownerReview(f.store,r.reviewRef,r.reviewHash,{input,output});assert.equal(accepted.status,'MATERIALIZED');
  for(const value of ['WORK_REVIEW_V1','Verify the answer implementation','"before"','"after"','totalReservedMs'])assert.ok(shown.includes(value),value);
});
test('work failed CHANGE permits one separately reviewed repair',async t=>{
  const f=await fixture(t);await f.propose('export const answer=0;\n');await f.apply();const first=await f.verify();assert.equal(first.execution.status,'LOCAL_FAILED');
  await f.propose('export const answer=2;\n',{verificationItem:'verify',evidenceRef:first.execution.evidenceRef});assert.equal((await workReport(f.store,f.id)).nextAction.kind,'REVIEW_FILES');await f.apply();assert.equal((await f.verify()).execution.status,'LOCAL_PASSED');
  assert.equal((await workReport(f.store,f.id)).budget.attemptsUsed,2);
});
test('work close is idempotent, preserves source and blocks later proposals',async t=>{
  const f=await fixture(t);const close=await prepareWorkClose(f.store,f.id,{expectedRevision:task(f.store,f.id).revision,outcome:'ABANDONED',reason:'Owner stops'});
  const opts={trust:close.reviewHash,acknowledgeUnisolated:true},one=await acceptWorkClose(f.store,close.reviewRef,opts);assert.deepEqual(await acceptWorkClose(f.store,close.reviewRef,opts),one);
  await assert.rejects(f.propose(),/CLOSED/);assert.equal((await workReport(f.store,f.id)).phase,'ABANDONED');
});

test('work controls keep duplicate identity and close rollback never publishes success',async t=>{
  const f=await fixture(t);const input={action:'PAUSE',requestId:randomUUID(),expectedControlSeq:0};
  const first=workControl(f.store,f.id,input);assert.deepEqual(workControl(f.store,f.id,input),first);
  assert.throws(()=>workControl(f.store,f.id,{...input,action:'CANCEL'}),/DUPLICATE_CONFLICT/);
  workControl(f.store,f.id,{action:'UNPAUSE',requestId:randomUUID(),expectedControlSeq:first.seq});
  const close=await prepareWorkClose(f.store,f.id,{expectedRevision:task(f.store,f.id).revision,outcome:'CANCELLED',reason:'Stop this work'});
  const event=f.store.event.bind(f.store);f.store.event=(id,type,body)=>{if(type==='WORK_CLOSED')throw Error('Injected event failure');return event(id,type,body);};
  await assert.rejects(acceptWorkClose(f.store,close.reviewRef,{trust:close.reviewHash,acknowledgeUnisolated:true}),/Injected/);f.store.event=event;
  assert.equal(f.store.events(f.id).some(e=>e.type==='WORK_CLOSED'),false);
  await acceptWorkClose(f.store,close.reviewRef,{trust:close.reviewHash,acknowledgeUnisolated:true});
  assert.equal((await workReport(f.store,f.id)).phase,'CANCELLED');
});

test('work cancel between Run commit and Task attachment prevents stale publication',async t=>{
  const f=await fixture(t);await f.propose();const r=await prepareNativeFilesReview(f.store,f.id,'implement');
  await assert.rejects(acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true,hooks:{afterRunCommit:()=>workControl(f.store,f.id,{action:'CANCEL',requestId:randomUUID(),expectedControlSeq:0})}}),/WORK_CANCEL/);
  assert.equal(f.store.events(f.id).some(e=>e.type==='BOOTSTRAP_ITEM_MATERIALIZED'),false);
  assert.equal((await workReport(f.store,f.id)).phase,'UNRESOLVED');
});
test('work Run-completed/Task-attachment gap stays unknown with no replay',async t=>{
  const f=await fixture(t);await f.propose();const r=await prepareNativeFilesReview(f.store,f.id,'implement');await assert.rejects(acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true,hooks:{afterRunCommit:()=>{throw Error('Injected interruption after Run commit');}}}),/Injected interruption/);
  assert.equal(workEffects(f.store,task(f.store,f.id)).certainty,'UNKNOWN');
  const recovered=restartedReport(f).report;
  assert.equal(recovered.phase,'UNRESOLVED');assert.equal(recovered.nextAction.kind,'READ_ONLY');
  assert.equal(recovered.effectCertainty,'UNKNOWN');
  await assert.rejects(acceptNativeFilesReview(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true}),/UNRESOLVED/);
  assert.equal((await workReport(f.store,f.id)).phase,'UNRESOLVED');
});
test('work public aliases and exact test command refuse widening',async t=>{
  const f=await fixture(t,'VERIFY_CURRENT');for(const action of ['approve','materialize','verify','local-step','revision-review','run','resume','recover'])assert.throws(()=>guardWorkCli(f.store,action,f.id),/UNSUPPORTED_ENTRY/);
  await assert.rejects(verifyTask(f.store,f.id,'verify',{...f.request,args:['--version']}),/EXACT_TEST/);
  assert.equal(renderOwnerCommand('node', ["a'b"]),"& 'node' 'a''b'");assert.throws(()=>renderOwnerCommand('node',['bad\narg']));
});

test('work close rechecks child execution independently of Task event head',async t=>{
  const f=await fixture(t);await f.propose();const r=await prepareWorkClose(f.store,f.id,{expectedRevision:task(f.store,f.id).revision,outcome:'ABANDONED',reason:'Stop before effects'});
  const runId=task(f.store,f.id).bootstrap.filesets.implement;
  // Emulate a started child that has lost its owner, without a Task event.
  f.store.event(runId,'BOOTSTRAP_MATERIALIZATION_STARTED',{});
  await assert.rejects(acceptWorkClose(f.store,r.reviewRef,{trust:r.reviewHash,acknowledgeUnisolated:true}),/EFFECTS/);
  const unresolved=await prepareWorkClose(f.store,f.id,{expectedRevision:task(f.store,f.id).revision,outcome:'ABANDONED_UNRESOLVED',reason:'Uncertain child effects retained'});
  await acceptWorkClose(f.store,unresolved.reviewRef,{trust:unresolved.reviewHash,acknowledgeUnisolated:true});
  assert.equal((await workReport(f.store,f.id)).phase,'UNRESOLVED');
  await assert.rejects(f.propose(),/CLOSED/);
});
test('work VERIFY_CURRENT exception never changes the legacy empty-source rule',async t=>{
  const f=await fixture(t,'VERIFY_CURRENT'),current=task(f.store,f.id),plan=f.store.readArtifact(current.planRef);
  const old=validateBootstrapDraft(plan.draft,plan.probe,plan.intent.original,['test/app.test.mjs'],[],true);
  assert.equal(old.status,'NEEDS_INPUT');assert.ok(old.unknowns.includes('Plan at least one file'));
  await assert.rejects(submitTaskDraft(f.store,f.id,{revision:current.revision,proposal:{...plan.draft,workContext:{mode:'VERIFY_CURRENT'}}}),/closed|stale/);
});
test('work status of absent State creates nothing',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'cf-work-absent-'));t.after(()=>rm(root,{recursive:true,force:true}));const state=path.join(root,'absent');
  const r=await productCli(['status','task-'+randomUUID()],state);assert.equal(r.exitCode,1);await assert.rejects(readFile(path.join(state,'state.sqlite')),{code:'ENOENT'});
});

test('work MCP exposes mode, discovers Tasks and returns complete Owner command',async t=>{
  const f=await fixture(t,'VERIFY_CURRENT');
  const messages=[{jsonrpc:'2.0',id:1,method:'tools/list'},...[
    ['codefleet_goal_status',{}],['codefleet_local_test_review',{taskId:f.id}],
    ['codefleet_goal_start',{goal:'Verify the existing answer implementation'}],
    ['codefleet_goal_start',{goal:'Improve the existing answer implementation',mode:'CHANGE'}]
  ].map(([name,args],i)=>({jsonrpc:'2.0',id:i+2,method:'tools/call',params:{name,arguments:args}}))];
  const child=spawnSync(process.execPath,[path.resolve('src/hosts/codex-mcp.mjs'),'--state',f.state,'--repository',f.repo,'--acceptance','LOCAL_ONLY','--work-profile','WORK_REVIEW_V1'],{encoding:'utf8',input:messages.map(m=>JSON.stringify(m)).join('\n')+'\n',timeout:20000,windowsHide:true});
  assert.equal(child.status,0,child.stderr);const replies=child.stdout.trim().split('\n').map(l=>JSON.parse(l));
  assert.ok(replies[0].result.tools.find(t=>t.name==='codefleet_goal_start').inputSchema.required.includes('mode'));
  const view=JSON.parse(replies[1].result.content[0].text);assert.equal(view.tasks[0].taskId,f.id);
  const review=JSON.parse(replies[2].result.content[0].text);assert.equal(review.command.timeoutMs,30000);assert.ok(review.ownerAction.args.includes('work-owner-review'));assert.ok(review.ownerAction.command.startsWith('& '));assert.ok(review.ownerAction.command.includes(review.reviewRef));assert.ok(!review.ownerAction.args.includes('--acknowledge-unisolated'));
  assert.equal(replies[3].result.isError,true);
  const started=JSON.parse(replies[4].result.content[0].text);
  assert.equal(replies[4].result.isError,undefined);
  assert.equal(started.workReport.legacyReadOnly,false);
  assert.equal(started.workReport.phase,'NEEDS_INPUT');
  assert.ok(started.taskId);
  assert.equal(started.executionGranted,false);
});

test('status-only MCP advertises only discovery and rejects every mutation before State writes',async t=>{
  const f=await fixture(t,'VERIFY_CURRENT'),events=f.store.events(f.id),runs=f.store.list();
  const artifacts=await readdir(path.join(f.state,'artifacts'));
  const forbidden=['codefleet_goal_start','codefleet_draft_submit','codefleet_goal_prepare','codefleet_fileset_propose','codefleet_fileset_review','codefleet_local_test_review'];
  const messages=[{jsonrpc:'2.0',id:1,method:'tools/list'},
    ...[['codefleet_goal_status',{}],['codefleet_goal_status',{taskId:f.id}],
      ...forbidden.map(name=>[name,{goal:'Do not create another Task',mode:'CHANGE',taskId:f.id}])]
      .map(([name,args],i)=>({jsonrpc:'2.0',id:i+2,method:'tools/call',params:{name,arguments:args}}))];
  const child=spawnSync(process.execPath,[path.resolve('src/hosts/codex-mcp.mjs'),'--state',f.state,'--repository',f.repo,'--acceptance','LOCAL_ONLY','--work-profile','WORK_REVIEW_V1','--status-only'],
    {encoding:'utf8',input:messages.map(m=>JSON.stringify(m)).join('\n')+'\n',timeout:20000,windowsHide:true});
  assert.equal(child.status,0,child.stderr);const replies=child.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies[0].result.tools.map(t=>t.name),['codefleet_goal_status']);
  assert.equal(JSON.parse(replies[1].result.content[0].text).tasks[0].taskId,f.id);
  assert.equal(JSON.parse(replies[2].result.content[0].text).workReport.phase,'AWAIT_TEST_REVIEW');
  for(const reply of replies.slice(3))assert.equal(reply.result.isError,true);
  assert.equal(replies.length,9);assert.deepEqual(f.store.events(f.id),events);assert.deepEqual(f.store.list(),runs);
  assert.deepEqual(await readdir(path.join(f.state,'artifacts')),artifacts);
});

test('installed work runtime completes CHANGE with its own inventory and preserves modified installation',async t=>{
  const f=await fixture(t,'VERIFY_CURRENT'),tools=path.join(f.root,'tools');await mkdir(tools);
  await installHost(tools,'codex');const base=path.join(tools,'.agents','skills','codefleet');
  const load=rel=>import(pathToFileURL(path.join(base,'runtime',rel)).href);
  const api=await load('product/tasks.mjs'),native=await load('product/native-local.mjs'),view=await load('product/work-report.mjs');
  const c=await api.createTask(f.store,f.repo,'Improve the existing answer implementation',{localExisting:true,acceptanceMode:'LOCAL_ONLY',workProfile:'WORK_REVIEW_V1',mode:'CHANGE'}),plan=f.store.readArtifact(c.planRef);
  const originalPlan=f.store.readArtifact(task(f.store,f.id).planRef),draft={...originalPlan.draft,objective:plan.intent.original,probeRef:plan.probe.probeHash,plannedFiles:[{path:'src/app.mjs',purpose:'Answer implementation'}],scope:{includes:['src/app.mjs'],excludes:['test']},workItems:[{id:'implement',kind:'local-edit',dependencies:[],acceptanceCriteria:['Answer is two'],files:['src/app.mjs']},{id:'verify',kind:'local-verification',dependencies:['implement'],acceptanceCriteria:['Answer is two'],files:[]}]};
  await api.submitTaskDraft(f.store,c.id,{revision:c.revision,proposal:draft});await api.prepareTask(f.store,c.id);
  await api.submitBootstrapFiles(f.store,c.id,{revision:api.task(f.store,c.id).revision,itemId:'implement',files:[{path:'src/app.mjs',content:'export const answer=2;\n',baseSha256:hash(await readFile(path.join(f.repo,'src/app.mjs')))}]});
  const files=await native.prepareNativeFilesReview(f.store,c.id,'implement');await native.acceptNativeFilesReview(f.store,files.reviewRef,{trust:files.reviewHash,acknowledgeUnisolated:true});
  const tests=await native.prepareNativeLocalReview(f.store,c.id,{request:f.request});await native.acceptNativeLocalReview(f.store,tests.reviewRef,{trust:tests.reviewHash,acknowledgeUnisolated:true});
  assert.equal((await view.workReport(f.store,c.id)).phase,'COMPLETE_LOCAL');
  const entry=path.join(base,'runtime','product','work-review.mjs');await writeFile(entry,(await readFile(entry,'utf8'))+'\n// user modification\n');
  await assert.rejects(manageHost(tools,'codex','remove'),/modified|changed|mismatch/i);assert.ok((await readFile(entry,'utf8')).includes('user modification'));
});
