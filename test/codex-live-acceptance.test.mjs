import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Store} from '../src/alpha/store.mjs';
import {enableTasks,createTask,task,submitTaskDraft,prepareTask,submitBootstrapFiles} from '../src/product/tasks.mjs';
import {prepareNativeFilesReview,acceptNativeFilesReview,acceptNativeLocalReview} from '../src/product/native-local.mjs';
import {workControl} from '../src/product/work-review.mjs';
import {randomUUID} from 'node:crypto';

const script=fileURLToPath(new URL('../scripts/codex-live-acceptance.mjs',import.meta.url));
function call(args,expected=0){
  const result=spawnSync(process.execPath,[script,...args],{
    encoding:'utf8',windowsHide:true,shell:false,timeout:30000
  });
  assert.equal(result.status,expected,result.stderr+'\n'+result.stdout);
  return result.stdout.trim()?JSON.parse(result.stdout):null;
}
async function fixture(t){
  const parent=await mkdtemp(join(tmpdir(),'cf-live-harness-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const dir=join(parent,'live fixture with spaces');
  const prepared=call(['prepare','--dir',dir]);
  assert.equal(prepared.status,'READY_FOR_EXPLICIT_CODEX_LIVE_TURN');
  return {parent,dir};
}

async function recoveryFixture(t,{recovery=true}={}){
  const parent=await mkdtemp(join(tmpdir(),'cf-new-session-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const dir=join(parent,'new session fixture');
  const prepared=call([recovery?'prepare-recovery':'prepare','--dir',dir]);
  if(recovery){assert.equal(prepared.plan.maxModelTurns,2);assert.equal(prepared.plan.ownerEffectsApproved,false);}
  const m=await manifestOf({dir}),store=new Store(m.state);enableTasks(store);
  // SYNTHETIC/OFFLINE setup only. No Codex process, login or spending approval.
  try{
    const c=await createTask(store,m.project,m.goal,{localExisting:true,acceptanceMode:'LOCAL_ONLY',workProfile:'WORK_REVIEW_V1',mode:'CHANGE'});
    const p=store.readArtifact(c.planRef),draft={...p.draft,
      requirements:['Normalize titles'],decisions:[{topic:'runtime',choice:'Node',alternatives:[],rationale:'Existing runtime'}],
      plannedFiles:[{path:'src/todo.mjs',purpose:'Normalize title'}],
      plannedTests:[{path:'test/todo.test.mjs',criteria:['title']}],
      criteria:[{id:'title',description:'Normalize title',tests:['test/todo.test.mjs']}],
      scope:{includes:['src/todo.mjs'],excludes:['test']},
      workItems:[{id:'implement',kind:'local-edit',dependencies:[],acceptanceCriteria:['Normalize title'],files:['src/todo.mjs']},
        {id:'verify',kind:'local-verification',dependencies:['implement'],acceptanceCriteria:['Normalize title'],files:[]}]};
    await submitTaskDraft(store,c.id,{revision:c.revision,proposal:draft});await prepareTask(store,c.id);
    await submitBootstrapFiles(store,c.id,{revision:task(store,c.id).revision,itemId:'implement',files:[{
      path:'src/todo.mjs',baseSha256:m.sourceSha256,
      content:"export function normalizeTitle(value) { if(typeof value!=='string'||!value.trim())throw Error('invalid title'); return value.trim(); }\n"}]});
    const review=await prepareNativeFilesReview(store,c.id,'implement');
    await acceptNativeFilesReview(store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
  }finally{store.close();}
  await writeFile(join(dir,'turn-intent.json'),JSON.stringify({kind:'SYNTHETIC_OFFLINE_FIRST_INTENT'}));
  await writeFile(join(dir,'turn-receipt.json'),JSON.stringify({status:'CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW',threadIds:['SYNTHETIC-FIRST']}));
  const checkpoint=recovery?call(['checkpoint','--dir',dir]):null;
  if(recovery)assert.equal(checkpoint.snapshot.phase,'AWAIT_TEST_REVIEW');
  return {parent,dir,m,checkpoint};
}

async function recoveryCodex(f,variant='valid'){
  const fake=join(f.parent,'synthetic-recovery.mjs');
  const mcp=fileURLToPath(new URL('../src/hosts/codex-mcp.mjs',import.meta.url));
  await writeFile(fake,[
    "import {spawnSync} from 'node:child_process'; import {writeFileSync} from 'node:fs';",
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.0');process.exit(0)}",
    "if(process.argv.includes('login'))process.exit(0);",
    "if(!process.argv.includes('--ephemeral')||!process.argv.includes('--ignore-user-config')||!process.argv.some(v=>v.includes('--status-only')))process.exit(3);",
    "if(!process.argv.at(-1).includes('revision=status.revision')||!process.argv.at(-1).includes('nextAction=status.workReport.nextAction.kind'))process.exit(4);",
    'const args='+JSON.stringify([mcp,'--state',f.m.state,'--repository',f.m.project,'--acceptance','LOCAL_ONLY','--work-profile','WORK_REVIEW_V1','--status-only'])+';',
    "const ask=a=>{const p=spawnSync(process.execPath,args,{encoding:'utf8',input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'codefleet_goal_status',arguments:a}})+'\\n',windowsHide:true});if(p.status!==0)throw Error('MCP process failed');return JSON.parse(JSON.parse(p.stdout).result.content[0].text);};",
    "const list=ask({}),id=list.tasks[0].taskId,view=ask({taskId:id});",
    "const emit=v=>console.log(JSON.stringify(v));",
    "emit({type:'thread.started',thread_id:"+JSON.stringify(variant==='same-thread'?'SYNTHETIC-FIRST':'SYNTHETIC-SECOND')+"});emit({type:'turn.started'});",
    "for(const a of [{},{taskId:id}])emit({type:'item.completed',item:{type:'mcp_tool_call',server:'codefleet_live',tool:'codefleet_goal_status',status:'completed',arguments:a}});",
    "const r=view.workReport;emit({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({taskId:id,revision:view.revision,phase:r.phase,nextAction:r.nextAction.kind,attemptsUsed:r.budget.attemptsUsed})}});",
    ...(variant==='source-drift'?['writeFileSync('+JSON.stringify(join(f.m.project,'src','todo.mjs'))+',"// SYNTHETIC external drift\\n");']:[]),
    ...(variant==='unexpected-tool'?["emit({type:'item.completed',item:{type:'command_execution',command:'SYNTHETIC NEVER EXECUTED'}});"]:[]),
    "emit({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}});"
  ].join('\n'));
  return fake;
}

async function completedFixture(t,recovery=true){
  const f=await recoveryFixture(t,{recovery});
  if(recovery){
    const fake=await recoveryCodex(f);
    const r=call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost']);
    assert.equal(r.status,'CODEX_NEW_SESSION_CHECKPOINT_RECOVERED_AWAIT_OWNER_TEST_REVIEW');
  }
  const pending=call(['status','--dir',f.dir]);
  assert.equal(pending.currentTreeComplete,false);assert.notEqual(pending.status,'COMPLETE_LOCAL');
  assert.match(pending.next,/exact fixed test command/);
  const review=call(['review','--dir',f.dir]),s=new Store(f.m.state);
  try{
    const accepted=await acceptNativeLocalReview(s,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
    assert.equal(accepted.execution.status,'LOCAL_PASSED');
  }finally{s.close();}
  return f;
}
function persisted(f){
  const s=new Store(f.m.state,{readOnly:true});
  try{
    const rows=s.db.prepare('SELECT body FROM product_tasks ORDER BY id').all();
    return {tasks:rows,events:rows.map(r=>s.events(JSON.parse(r.body).id)),runs:s.list()};
  }finally{s.close();}
}

for(const recovery of [false,true])test('completed '+(recovery?'new-session':'default')+' fixture reports completion without more Owner work or writes',async t=>{
  const f=await completedFixture(t,recovery),before=persisted(f);
  const receipt=await readFile(join(f.dir,'turn-receipt.json'));
  const recoveryReceipt=recovery?await readFile(join(f.dir,'recovery-turn-receipt.json')):null;
  for(const action of ['status','finalize']){
    const r=call([action,'--dir',f.dir]);
    assert.equal(r.status,'COMPLETE_LOCAL');assert.equal(r.currentTreeComplete,true);
    assert.equal(r.continuation,'COMPLETE_LOCAL');assert.match(r.next,/No further Owner approval or model Turn is required/);
    if(recovery)assert.equal(r.newSessionRecovery.status,'OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL');
    if(action==='finalize'){assert.equal(r.verdict,'CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL');assert.deepEqual(r.reasons,[]);}
  }
  assert.deepEqual(persisted(f),before);
  assert.deepEqual(await readFile(join(f.dir,'turn-receipt.json')),receipt);
  if(recovery)assert.deepEqual(await readFile(join(f.dir,'recovery-turn-receipt.json')),recoveryReceipt);
});

test('former completed fixture with source drift never retains completion guidance',async t=>{
  const f=await completedFixture(t);
  await writeFile(join(f.m.project,'src','todo.mjs'),'export const externalChange=true;\n');
  const status=call(['status','--dir',f.dir]);
  assert.notEqual(status.status,'COMPLETE_LOCAL');assert.equal(status.currentTreeComplete,false);
  assert.doesNotMatch(status.next,/Local objective complete/);
  assert.equal(status.newSessionRecovery.status,'OBSERVED_CHECKPOINT_RECOVERY');
  const final=call(['finalize','--dir',f.dir],2);assert.equal(final.verdict,'BLOCKED_OR_INCOMPLETE');
});

test('passing Local tests cannot hide missing recovery evidence in status or finalize',async t=>{
  const f=await completedFixture(t),before=persisted(f);
  await rm(join(f.dir,'recovery-turn-receipt.json'));
  const status=call(['status','--dir',f.dir]);
  assert.equal(status.currentTreeComplete,true);assert.equal(status.status,'HUMAN_RECONCILIATION_REQUIRED');
  assert.match(status.next,/uncertain recovery evidence/);assert.doesNotMatch(status.next,/Local objective complete/);
  const final=call(['finalize','--dir',f.dir],2);assert.equal(final.verdict,'BLOCKED_OR_INCOMPLETE');
  assert.ok(final.reasons.includes('Separate new-session checkpoint recovery not observed'));
  assert.deepEqual(persisted(f),before);
});

for(const action of ['PAUSE','CANCEL'])test('current '+action+' overrides former completion guidance without replay',async t=>{
  const f=await completedFixture(t),s=new Store(f.m.state);
  try{workControl(s,f.checkpoint.snapshot.taskId,{action,requestId:randomUUID(),expectedControlSeq:0});}finally{s.close();}
  const before=persisted(f),status=call(['status','--dir',f.dir]);
  assert.equal(status.currentTreeComplete,true,'Historical passing candidate evidence remains available');
  assert.equal(status.status,action==='PAUSE'?'PAUSED':'CANCELLED');assert.doesNotMatch(status.next,/Local objective complete/);
  const final=call(['finalize','--dir',f.dir],2);assert.equal(final.verdict,'BLOCKED_OR_INCOMPLETE');
  assert.deepEqual(persisted(f),before);
});

test('new-session fixture is exclusive, has separate bounded approvals and no implicit Turn',async t=>{
  const parent=await mkdtemp(join(tmpdir(),'cf-new-plan-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const dir=join(parent,'fixture'),r=call(['prepare-recovery','--dir',dir]);
  assert.equal(r.plan.maxSecondsPerTurn,300);assert.equal(r.plan.usdCostCapEnforced,false);
  const status=call(['status','--dir',dir]);assert.equal(status.newSessionRecovery.status,'NOT_RUN');
  call(['prepare-recovery','--dir',dir],1);call(['checkpoint','--dir',dir],1);
  for(const flags of [[],['--allow-model-turn'],['--acknowledge-unknown-cost']])call(['run-recovery','--dir',dir,...flags],1);
  assert.equal(await lstat(join(dir,'recovery-turn-intent.json')).catch(()=>null),null);
});

test('synthetic new-session discovery preserves checkpoint and separately consumes one-shot intent',async t=>{
  const f=await recoveryFixture(t),fake=await recoveryCodex(f),before=await readFile(join(f.dir,'turn-intent.json'));
  call(['checkpoint','--dir',f.dir],1);
  call(['review','--dir',f.dir],1); // Test approval must wait for recovery.
  const ready=call(['preflight-recovery','--dir',f.dir,'--codex',fake]);assert.equal(ready.modelTurnsStarted,0);
  const r=call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost']);
  assert.equal(r.status,'CODEX_NEW_SESSION_CHECKPOINT_RECOVERED_AWAIT_OWNER_TEST_REVIEW');
  assert.equal(r.recovery.newThread,true);assert.equal(r.recovery.checkpointPreserved,true);
  assert.equal(r.recovery.compactionObserved,false);assert.equal(r.recovery.taskRediscovered,true);
  assert.deepEqual(await readFile(join(f.dir,'turn-intent.json')),before);
  assert.equal(call(['review','--dir',f.dir]).executionGranted,false);
  call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(call(['preflight-recovery','--dir',f.dir,'--codex',fake],2).automaticReplay,false);
  const final=call(['finalize','--dir',f.dir],2);assert.equal(final.currentTreeComplete,false);
});

for(const variant of ['same-thread','source-drift','unexpected-tool'])test('synthetic recovery rejects '+variant+' and preserves spent intent',async t=>{
  const f=await recoveryFixture(t),fake=await recoveryCodex(f,variant);
  const r=call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost']);
  assert.equal(r.status,'HUMAN_RECONCILIATION_REQUIRED');
  assert.ok(await lstat(join(f.dir,'recovery-turn-intent.json')));
  call(['review','--dir',f.dir],1);
  call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost'],1);
});

test('checkpoint drift and recovery plan tampering block before Codex or new intent',async t=>{
  const f=await recoveryFixture(t),fake=await recoveryCodex(f);
  const target=join(f.dir,'recovery-checkpoint.json'),original=await readFile(target);
  const changed=JSON.parse(original);changed.snapshot.budget.attemptsRemaining=99;
  await writeFile(target,JSON.stringify(changed));
  call(['preflight-recovery','--dir',f.dir,'--codex',fake],1);
  await writeFile(target,original);
  const planPath=join(f.dir,'recovery-plan.json'),plan=JSON.parse(await readFile(planPath));plan.maxModelTurns=99;
  await writeFile(planPath,JSON.stringify(plan));
  call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(join(f.dir,'recovery-turn-intent.json')).catch(()=>null),null);
});

for(const variant of ['paused','lease','damaged-evidence'])test('recovery admission rejects '+variant+' without consuming a new Turn',async t=>{
  const f=await recoveryFixture(t),fake=await recoveryCodex(f),store=new Store(f.m.state);
  try{
    if(variant==='paused')workControl(store,f.checkpoint.snapshot.taskId,{action:'PAUSE',requestId:randomUUID(),expectedControlSeq:0});
    if(variant==='lease')store.db.prepare('UPDATE runs SET owner=?,leaseUntil=?,pid=?').run('SYNTHETIC_OWNER',Date.now()+25000,process.pid);
    if(variant==='damaged-evidence'){
      const run=store.list().find(r=>r.materializationRef);assert.ok(run);
      await writeFile(join(f.m.state,'artifacts',run.materializationRef+'.json'),'{}');
    }
  }finally{store.close();}
  call(['preflight-recovery','--dir',f.dir,'--codex',fake],1);
  call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(join(f.dir,'recovery-turn-intent.json')).catch(()=>null),null);
});

test('missing recovery plan and partial receipt cannot reopen approval or overwrite records',async t=>{
  const f=await recoveryFixture(t),fake=await recoveryCodex(f);
  await rm(join(f.dir,'recovery-plan.json'));
  call(['review','--dir',f.dir],1);call(['preflight-recovery','--dir',f.dir,'--codex',fake],1);
  const partial='{"status":';await writeFile(join(f.dir,'recovery-turn-receipt.json'),partial);
  assert.equal(call(['preflight-recovery','--dir',f.dir,'--codex',fake],2).readyForLiveTurn,false);
  call(['run-recovery','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await readFile(join(f.dir,'recovery-turn-receipt.json'),'utf8'),partial);
  assert.equal(await lstat(join(f.dir,'recovery-turn-intent.json')).catch(()=>null),null);
});
test('Codex live acceptance prepare creates pinned isolated fixture, no bill or completion',async t=>{
  const f=await fixture(t);
  const status=call(['status','--dir',f.dir]);
  assert.equal(status.status,'NOT_STARTED');
  assert.equal(status.actualCodexTurnObserved,false);
  assert.equal(status.currentTreeComplete,false);
  assert.equal(status.ownerGrantInMcp,false);
  call(['review','--dir',f.dir],1);
  const blocked=call(['finalize','--dir',f.dir],2);
  assert.equal(blocked.verdict,'BLOCKED_OR_INCOMPLETE');
  assert.ok(blocked.reasons.some(s=>s.includes('No successful')));
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  call(['prepare','--dir',f.dir],1);
});
test('real Codex Turn requires both owner flags; uncertain effect is durable one-shot',async t=>{
  const f=await fixture(t);
  for(const flagSet of [[],['--allow-model-turn'],['--acknowledge-unknown-cost']]){
    call(['run','--dir',f.dir,...flagSet],1);
    assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  }
  const unsupported=join(f.parent,'wrong-version.mjs');
  await writeFile(unsupported,"console.log('codex-cli 0.100.0')\n");
  call(['run','--dir',f.dir,'--codex',unsupported,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  const noLogin=join(f.parent,'synthetic-no-login.mjs');
  await writeFile(noLogin,[
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.1');process.exit(0)}",
    "if(process.argv.includes('login')){process.exit(1)}",
    "process.exit(2)"
  ].join('\n'));
  const noAuth=call(['preflight','--dir',f.dir,'--codex',noLogin],2);
  assert.equal(noAuth.status,'BLOCKED_CODEX_LOGIN_UNAVAILABLE');
  assert.equal(noAuth.readyForLiveTurn,false);
  assert.equal(noAuth.modelTurnsStarted,0);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  call(['run','--dir',f.dir,'--codex',noLogin,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  call(['preflight','--dir',f.dir,'--allow-model-turn'],1);
  const fake=join(f.parent,'synthetic-only.mjs');
  await writeFile(fake,[
    "if(process.argv.includes('--version'))console.log('codex-cli 0.167.1');",
    "else if(process.argv.includes('login'))process.stderr.write('Synthetic fixture login only');",
    "else if(process.argv.includes('exec')){",
    "console.log(JSON.stringify({type:'thread.started',thread_id:'SYNTHETIC-NEVER-LIVE'}));",
    "console.log(JSON.stringify({type:'turn.started'}));",
    "console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));",
    "}"
  ].join('\n'));
  const ready=call(['preflight','--dir',f.dir,'--codex',fake]);
  assert.equal(ready.status,'READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL');
  assert.equal(ready.modelTurnsStarted,0);
  assert.equal(ready.costStatus,'UNKNOWN');
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  const run=call(['run','--dir',f.dir,'--codex',fake,
    '--allow-model-turn','--acknowledge-unknown-cost']);
  assert.equal(run.status,'HUMAN_RECONCILIATION_REQUIRED',
    'Synthetic JSONL with no CodeFleet Task cannot complete a Live gate');
  const reserved=call(['preflight','--dir',f.dir,'--codex',fake],2);
  assert.equal(reserved.status,'BLOCKED_TURN_ALREADY_RESERVED');
  const receipt=JSON.parse(await readFile(join(f.dir,'turn-receipt.json'),'utf8'));
  assert.equal(receipt.pendingExactFilesetReviewObserved,false);
  assert.equal(receipt.projectUnchangedByModel,true);
  assert.equal(receipt.costStatus,'UNKNOWN');
  assert.equal(receipt.authenticatedOwner,false);
  assert.equal(call(['status','--dir',f.dir]).actualCodexTurnObserved,false);
  call(['run','--dir',f.dir,'--codex',fake,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  const result=call(['finalize','--dir',f.dir],2);
  assert.equal(result.verdict,'BLOCKED_OR_INCOMPLETE');
  assert.equal(result.protectedVerified,false);
});
test('verified Codex CLI 0.167.0 is accepted without starting a model Turn',async t=>{
  const f=await fixture(t);
  const supported=join(f.parent,'synthetic-0.167.0.mjs');
  await writeFile(supported,[
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.0');process.exit(0)}",
    "if(process.argv.includes('login'))process.exit(1)",
    "process.exit(2)"
  ].join('\n'));
  const result=call(['preflight','--dir',f.dir,'--codex',supported],2);
  assert.equal(result.status,'BLOCKED_CODEX_LOGIN_UNAVAILABLE');
  assert.equal(result.codexVersion,'codex-cli 0.167.0');
  assert.equal(result.modelTurnsStarted,0);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});
test('official Windows npm cmd shim resolves without shell execution',async t=>{
  const f=await fixture(t);
  const shim=join(f.parent,'npm bin','codex.cmd');
  const entry=join(f.parent,'npm bin','node_modules','@openai','codex','bin','codex.js');
  await mkdir(join(f.parent,'npm bin','node_modules','@openai','codex','bin'),{recursive:true});
  await writeFile(shim,'@echo SYNTHETIC_SHIM_MUST_NOT_EXECUTE\r\n');
  await writeFile(entry,[
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.1');process.exit(0)}",
    "if(process.argv.includes('login'))process.exit(1)",
    "process.exit(2)"
  ].join('\n'));
  const result=call(['preflight','--dir',f.dir,'--codex',shim],2);
  assert.equal(result.status,'BLOCKED_CODEX_LOGIN_UNAVAILABLE');
  assert.equal(result.codexVersion,'codex-cli 0.167.1');
  assert.equal(result.modelTurnsStarted,0);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});
test('unrecognized cmd shim fails closed before any model intent',async t=>{
  const f=await fixture(t);
  const shim=join(f.parent,'not-official','codex.cmd');
  await mkdir(join(f.parent,'not-official'),{recursive:true});
  await writeFile(shim,'@echo codex-cli 0.167.1\r\n');
  call(['preflight','--dir',f.dir,'--codex',shim],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});
test('failed MCP call records bounded classification and digest without raw detail',async t=>{
  const f=await fixture(t);
  const fake=join(f.parent,'synthetic-mcp-failure.mjs');
  await writeFile(fake,[
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.0');process.exit(0)}",
    "if(process.argv.includes('login'))process.exit(0)",
    "if(process.argv.includes('exec')){",
    "if(!process.argv.includes('mcp_servers.codefleet_live.default_tools_approval_mode=\"approve\"'))process.exit(3);",
    "if(!process.argv.at(-1).includes('\\\"id\\\":\\\"implement\\\"')||!process.argv.at(-1).includes('only the implement WorkItem')||!process.argv.at(-1).includes('substitute only the probeRef'))process.exit(4);",
    "console.log(JSON.stringify({type:'thread.started',thread_id:'SYNTHETIC-MCP-FAIL'}));",
    "console.log(JSON.stringify({type:'turn.started'}));",
    "console.log(JSON.stringify({type:'item.completed',item:{type:'mcp_tool_call',server:'codefleet_live',tool:'codefleet_goal_start',status:'failed',error:{message:'MCP error: -32603: fatal: detected dubious ownership; safe.directory refused'}}}));",
    "console.log(JSON.stringify({type:'item.completed',item:{type:'mcp_tool_call',server:'codefleet_live',tool:'codefleet_goal_status',status:'failed',error:null,result:{content:[{type:'text',text:'WORK_SCHEMA_INVALID'}]}}}));",
    "console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:2,output_tokens:1}}));",
    "}"
  ].join('\n'));
  const result=call(['run','--dir',f.dir,'--codex',fake,
    '--allow-model-turn','--acknowledge-unknown-cost']);
  assert.equal(result.status,'HUMAN_RECONCILIATION_REQUIRED');
  assert.deepEqual(result.observedMcpCalls[0].detailKeys,
    ['error','server','status','tool','type']);
  assert.equal(result.observedMcpCalls[0].failureClass,'GIT_OWNERSHIP');
  assert.deepEqual(result.observedMcpCalls[0].argumentKeys,[]);
  assert.equal(result.observedMcpCalls[0].errorCode,null);
  assert.equal(result.observedMcpCalls[0].errorValueType,'object');
  assert.deepEqual(result.observedMcpCalls[0].errorKeys,['message']);
  assert.match(result.observedMcpCalls[0].errorDetailSha256,/^[a-f0-9]{64}$/);
  assert.ok(result.observedMcpCalls[0].errorMessageLength>0);
  assert.deepEqual(result.observedMcpCalls[0].errorSignals,
    ['GIT_OWNERSHIP','JSON_RPC_INTERNAL_ERROR']);
  assert.deepEqual(result.observedMcpCalls[0].contractCodes,[]);
  assert.equal(result.observedMcpCalls[0].resultIsError,false);
  assert.equal(result.observedMcpCalls[0].resultContentCount,null);
  assert.equal(result.observedMcpCalls[0].resultTextSha256,null);
  assert.equal(result.observedMcpCalls[0].resultTextLength,null);
  assert.match(result.observedMcpCalls[0].detailSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.observedMcpCalls[1].failureClass,'UNCLASSIFIED_PROVIDER_DETAIL');
  assert.deepEqual(result.observedMcpCalls[1].errorSignals,['CODEFLEET_CONTRACT_ERROR']);
  assert.deepEqual(result.observedMcpCalls[1].contractCodes,['WORK_SCHEMA_INVALID']);
  assert.match(result.observedMcpCalls[1].resultTextSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.observedMcpCalls[1].resultTextLength,'WORK_SCHEMA_INVALID'.length);
  assert.equal(JSON.stringify(result).includes('safe.directory'),false);
  const receipt=JSON.parse(await readFile(join(f.dir,'turn-receipt.json'),'utf8'));
  assert.equal(JSON.stringify(receipt).includes('dubious ownership'),false);
});
test('tampered immutable tests refuse inspection and completion before model spawn',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.dir,'project','test','todo.test.mjs'),'// changed test\n');
  call(['status','--dir',f.dir],1);
  call(['finalize','--dir',f.dir],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});


// Contract-drift probes use disposable repositories and fake executables only.
// A passed probe never establishes a real Codex Turn or Owner identity.
const digest=value=>createHash('sha256').update(value).digest('hex');
async function manifestOf(f){
  return JSON.parse(await readFile(join(f.dir,'manifest.json'),'utf8'));
}
async function replaceManifest(f,m){
  await writeFile(join(f.dir,'manifest.json'),JSON.stringify(m,null,2)+'\n');
}
function fixtureGit(f,args){
  const p=spawnSync('git',args,{cwd:join(f.dir,'project'),encoding:'utf8',
    shell:false,windowsHide:true,timeout:10000});
  assert.equal(p.status,0,p.stderr);
  return p.stdout.trim();
}
async function commitFixture(f){
  fixtureGit(f,['add','src/todo.mjs','test/todo.test.mjs']);
  fixtureGit(f,['-c','user.name=Synthetic Acceptance Fixture',
    '-c','user.email=fixture@example.invalid','commit','-m','Synthetic drift']);
  return fixtureGit(f,['rev-parse','HEAD']);
}
async function assertRejectedBeforeCodex(f){
  const marker=join(f.parent,'synthetic-spawn-marker');
  const fake=join(f.parent,'synthetic-not-a-real-codex.mjs');
  await writeFile(fake,[
    "import {appendFileSync} from 'node:fs';",
    'appendFileSync('+JSON.stringify(marker)+', "SYNTHETIC_ONLY\\n");',
    "if(process.argv.includes('--version'))console.log('codex-cli 0.167.1');",
    "else if(process.argv.includes('login'))process.exit(0);",
    "else process.exit(3);"
  ].join('\n'));
  for(const action of ['status','review','finalize'])call([action,'--dir',f.dir],1);
  call(['preflight','--dir',f.dir,'--codex',fake],1);
  call(['run','--dir',f.dir,'--codex',fake,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(marker).catch(()=>null),null,'No selected executable may start');
  for(const name of ['turn-intent.json','turn-receipt.json','state']){
    assert.equal(await lstat(join(f.dir,name)).catch(()=>null),null,
      'Rejected contract must not create '+name);
  }
}

test('rewriting immutable test and its manifest hash never redefines acceptance',async t=>{
  const f=await fixture(t),m=await manifestOf(f);
  const weakened='// Synthetic negative fixture: every assertion removed.\n';
  await writeFile(join(f.dir,'project','test','todo.test.mjs'),weakened);
  m.testSha256=digest(weakened);
  await replaceManifest(f,m);
  await assertRejectedBeforeCodex(f);
});

test('recommitting weakened tests and rehashing the manifest remains blocked',async t=>{
  const f=await fixture(t),m=await manifestOf(f);
  const weakened='// Synthetic negative fixture: no independent tests.\n';
  await writeFile(join(f.dir,'project','test','todo.test.mjs'),weakened);
  m.gitHead=await commitFixture(f);
  m.testSha256=digest(weakened);
  await replaceManifest(f,m);
  assert.equal(fixtureGit(f,['status','--porcelain']),'');
  await assertRejectedBeforeCodex(f);
});

test('rehashed and recommitted initial source cannot replace the fixed baseline',async t=>{
  const f=await fixture(t),m=await manifestOf(f);
  const changed="export function normalizeTitle(value) { return 'synthetic'; }\n";
  await writeFile(join(f.dir,'project','src','todo.mjs'),changed);
  m.gitHead=await commitFixture(f);
  m.sourceSha256=digest(changed);
  await replaceManifest(f,m);
  await assertRejectedBeforeCodex(f);
});

test('Git baseline source is checked byte-for-byte without whitespace trimming',async t=>{
  const f=await fixture(t),m=await manifestOf(f);
  const path=join(f.dir,'project','src','todo.mjs');
  await writeFile(path,'  '+await readFile(path,'utf8')+'\n');
  m.gitHead=await commitFixture(f);
  await replaceManifest(f,m);
  await assertRejectedBeforeCodex(f);
});

test('restoring the working test does not hide a changed Git baseline test',async t=>{
  const f=await fixture(t),m=await manifestOf(f);
  const path=join(f.dir,'project','test','todo.test.mjs');
  const original=await readFile(path);
  await writeFile(path,'// Synthetic changed baseline test.\n');
  m.gitHead=await commitFixture(f);
  await writeFile(path,original);
  await replaceManifest(f,m);
  await assertRejectedBeforeCodex(f);
});

const scopeChanges=[
  ['test path substitution',m=>{m.testPaths=['src/todo.mjs'];}],
  ['empty test selection',m=>{m.testPaths=[];}],
  ['extra test argv injection',m=>{m.testPaths=['--import=./unexpected.mjs','test/todo.test.mjs'];}],
  ['source scope substitution',m=>{m.sourcePaths=['test/todo.test.mjs'];}],
  ['acceptance policy drift',m=>{m.acceptancePolicy='PROTECTED_REQUIRED';}],
  ['invented model execution claim',m=>{m.modelTurnExecuted=true;}],
  ['invented owner grant',m=>{m.ownerGrantIssued=true;}],
  ['unrecognized authority field',m=>{m.executionAuthorized=true;}]
];
for(const [name,change] of scopeChanges){
  test('fixed acceptance manifest rejects '+name,async t=>{
    const f=await fixture(t),m=await manifestOf(f);
    change(m);
    await replaceManifest(f,m);
    await assertRejectedBeforeCodex(f);
  });
}

test('equivalent manifest key order is accepted without model execution',async t=>{
  const f=await fixture(t),m=await manifestOf(f);
  await replaceManifest(f,Object.fromEntries(Object.entries(m).reverse()));
  const status=call(['status','--dir',f.dir]);
  assert.equal(status.status,'NOT_STARTED');
  assert.equal(status.actualCodexTurnObserved,false);
  assert.equal(status.currentTreeComplete,false);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});

for(const [name,record] of [
  ['well-formed unresolved intent','{"kind":"SYNTHETIC_UNCONFIRMED_INTENT"}\n'],
  ['partially written intent','{"kind":']
]){
  test(name+' directs reconciliation, never another run',async t=>{
    const f=await fixture(t);
    await writeFile(join(f.dir,'turn-intent.json'),record);
    const status=call(['status','--dir',f.dir]);
    assert.equal(status.status,'UNCONFIRMED_TURN_NO_RECEIPT');
    assert.match(status.next,/reconcil/i);
    assert.match(status.next,/do not (?:re)?run/i);
    assert.doesNotMatch(status.next,/must explicitly choose run/);
    assert.equal(status.actualCodexTurnObserved,false);
    assert.equal(status.automaticReplay,false);
    const blocked=call(['preflight','--dir',f.dir],2);
    assert.equal(blocked.status,'BLOCKED_TURN_ALREADY_RESERVED');
    assert.equal(await readFile(join(f.dir,'turn-intent.json'),'utf8'),record);
    assert.equal(await lstat(join(f.dir,'turn-receipt.json')).catch(()=>null),null);
  });
}
for(const [name,record] of [
  ['failed synthetic receipt','{"status":"HUMAN_RECONCILIATION_REQUIRED"}\n'],
  ['partially written receipt','{"status":']
]){
  test(name+' never recommends effect approval or another run',async t=>{
    const f=await fixture(t);
    await writeFile(join(f.dir,'turn-receipt.json'),record);
    const status=call(['status','--dir',f.dir]);
    assert.equal(status.status,'HUMAN_RECONCILIATION_REQUIRED');
    assert.match(status.next,/reconcil/i);
    assert.match(status.next,/do not (?:re)?run/i);
    assert.doesNotMatch(status.next,/approve via separate CLI/);
    assert.equal(status.actualCodexTurnObserved,false);
    assert.equal(await readFile(join(f.dir,'turn-receipt.json'),'utf8'),record);
    assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  });
}
