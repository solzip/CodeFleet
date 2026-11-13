import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../src/alpha/store.mjs';
import {tasks} from '../src/product/tasks.mjs';
import {workReport} from '../src/product/work-report.mjs';
import {ownerReview} from '../src/product/work-owner.mjs';
import {PassThrough} from 'node:stream';
import {nativeProbeReadiness} from '../scripts/codex-live-acceptance.mjs';

const runner=fileURLToPath(new URL('../scripts/codex-live-acceptance.mjs',import.meta.url));
const mcp=fileURLToPath(new URL('../src/hosts/codex-mcp.mjs',import.meta.url));
test('Native preflight requires matching HEAD, clean source and actual Git ownership',()=>{
  const base='a'.repeat(40),valid={state:'EXISTING_SOURCE',base,dirty:false,error:null};
  assert.equal(nativeProbeReadiness(valid,base).ready,true);
  for(const changed of [null,{...valid,state:'GIT_OWNERSHIP',base:null,error:{kind:'GIT_OWNERSHIP'}},
    {...valid,state:'GIT_ERROR',error:{kind:'PROCESS_SPAWN_DENIED'}},{...valid,base:'b'.repeat(40)},
    {...valid,dirty:true},{...valid,state:'UNBORN_HEAD',base:null}])
    assert.equal(nativeProbeReadiness(changed,base).ready,false);
});
function call(args,exit=0){
  const p=spawnSync(process.execPath,[runner,...args],{encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(p.status,exit,p.stderr+'\n'+p.stdout);
  return p.stdout.trim()?JSON.parse(p.stdout):null;
}
async function fixture(t){
  const parent=await mkdtemp(join(tmpdir(),'cf-verify-current-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const dir=join(parent,'verification with spaces');
  const prepared=call(['prepare-verify','--dir',dir]);
  return {parent,dir,prepared,m:JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'))};
}
async function fakeCodex(f,variant='valid'){
  const fake=join(f.parent,'synthetic-codex.mjs');
  // Synthetic provider drives real proposal-only MCP processes. No Host/model,
  // login, quota or Owner identity is established by this offline harness.
  await writeFile(fake,[
    "import {spawnSync} from 'node:child_process';",
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.0');process.exit(0)}",
    "if(process.argv.includes('login'))process.exit(0);",
    'const args='+JSON.stringify([mcp,'--state',f.m.state,'--repository',f.m.project,'--acceptance','LOCAL_ONLY','--work-profile','WORK_REVIEW_V1'])+';',
    "const emit=v=>console.log(JSON.stringify(v));",
    "const ask=(name,a)=>{const p=spawnSync(process.execPath,args,{encoding:'utf8',input:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:a}})+'\\n',windowsHide:true});if(p.status!==0)throw Error('MCP process failed');const r=JSON.parse(p.stdout).result;if(r.isError)throw Error(JSON.stringify(r));emit({type:'item.completed',item:{type:'mcp_tool_call',server:'codefleet_live',tool:name,status:'completed'}});return JSON.parse(r.content[0].text);};",
    "emit({type:'thread.started',thread_id:'SYNTHETIC-VERIFY-NOT-LIVE'});emit({type:'turn.started'});",
    "const prompt=process.argv.at(-1);if(!prompt.includes('mode:\"VERIFY_CURRENT\"'))process.exit(4);",
    ...(variant==='jsonl-only'?[
      "for(const tool of ['codefleet_goal_start','codefleet_draft_submit','codefleet_goal_prepare','codefleet_local_test_review'])emit({type:'item.completed',item:{type:'mcp_tool_call',server:'codefleet_live',tool,status:'completed'}});"
    ]:[
      'const created=ask("codefleet_goal_start",{goal:'+JSON.stringify(f.m.goal)+',mode:"VERIFY_CURRENT"});',
      "const taskId=created.taskId,status=ask('codefleet_goal_status',{taskId});",
      "const proposal=JSON.parse(prompt.split('\\n').find(line=>line.startsWith('{')));proposal.probeRef=status.plan.draft.probeRef;",
      "ask('codefleet_draft_submit',{taskId,revision:status.revision,proposal});ask('codefleet_goal_prepare',{taskId});ask('codefleet_local_test_review',{taskId});",
      ...(variant==='fileset-call'?["emit({type:'item.completed',item:{type:'mcp_tool_call',server:'codefleet_live',tool:'codefleet_fileset_propose',status:'failed'}});"]:[]),
      ...(variant==='shell-event'?["emit({type:'item.completed',item:{type:'command_execution',command:'SYNTHETIC NEVER EXECUTED'}});"]:[]),
      ...(variant==='other-server'?["emit({type:'item.completed',item:{type:'mcp_tool_call',server:'unexpected_server',tool:'unexpected_tool',status:'completed'}});"]:[])
    ]),
    "emit({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}});"
  ].join('\n'));
  return fake;
}
async function runSynthetic(f,variant){
  const fake=await fakeCodex(f,variant);
  return call(['run','--dir',f.dir,'--codex',fake,'--allow-model-turn','--acknowledge-unknown-cost']);
}
function snapshot(f){
  const s=new Store(f.m.state,{readOnly:true});
  try{return {tasks:tasks(s),events:tasks(s).map(t=>s.events(t.id)),runs:s.list()};}finally{s.close();}
}
function tty(word){
  const input=new PassThrough(),output=new PassThrough();input.isTTY=output.isTTY=true;let text='';
  output.on('data',chunk=>{text+=chunk;if(String(chunk).includes('Type VERIFY (UPPERCASE)'))queueMicrotask(()=>input.end(word+'\n'));});
  return {input,output,text:()=>text};
}

test('prepare-verify pins a new source-free plan without State, model Turn or approval',async t=>{
  const f=await fixture(t),p=f.prepared;
  assert.equal(p.status,'READY_FOR_VERIFY_CURRENT_APPROVAL');assert.deepEqual(f.m.sourcePaths,[]);
  assert.equal(p.plan.mode,'VERIFY_CURRENT');assert.equal(p.plan.maxModelTurns,1);
  assert.equal(p.plan.ownerVerificationApprovals,1);assert.equal(p.plan.sourceEffectsAllowed,false);
  assert.equal(p.plan.ownerEffectsApproved,false);assert.equal(p.plan.usdCostCapEnforced,false);
  for(const path of ['state','turn-intent.json','turn-receipt.json'])assert.equal(await lstat(join(f.dir,path)).catch(()=>null),null);
  const manifest=await readFile(join(f.dir,'manifest.json'),'utf8');call(['prepare-verify','--dir',f.dir],1);
  assert.equal(await readFile(join(f.dir,'manifest.json'),'utf8'),manifest);
  call(['run','--dir',f.dir],1);assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});

test('offline VERIFY_CURRENT MCP → one Owner VERIFY → current Local completion without source effects',async t=>{
  const f=await fixture(t),source=await readFile(join(f.m.project,'src/todo.mjs'),'utf8');
  const run=await runSynthetic(f);
  assert.equal(run.status,'CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW',await readFile(join(f.dir,'turn-receipt.json'),'utf8'));
  const pending=call(['status','--dir',f.dir]);assert.equal(pending.currentTreeComplete,false);assert.match(pending.next,/fixed test command/);
  const review=call(['review','--dir',f.dir]),s=new Store(f.m.state);
  try{
    const before=await workReport(s,review.taskId);assert.equal(before.budget.attemptsUsed,0);assert.deepEqual(s.list(),[]);
    const io=tty('VERIFY');const result=await ownerReview(s,review.reviewRef,review.reviewHash,io);
    assert.equal(result.execution.status,'LOCAL_PASSED');assert.match(io.text(),/THIS terminal/);
    const report=await workReport(s,review.taskId);assert.equal(report.phase,'COMPLETE_LOCAL');
    assert.equal(report.budget.attemptsUsed,1);assert.equal(report.budget.repairUsed,0);assert.deepEqual(report.sourceChanges,[]);
    assert.ok(s.list().every(r=>!r.materializationRef));
  }finally{s.close();}
  const before=snapshot(f),receipt=await readFile(join(f.dir,'turn-receipt.json'),'utf8');
  const final=call(['finalize','--dir',f.dir]);assert.equal(final.status,'COMPLETE_LOCAL');assert.deepEqual(final.reasons,[]);
  assert.equal(final.protectedVerified,false);assert.deepEqual(snapshot(f),before);
  assert.equal(await readFile(join(f.m.project,'src/todo.mjs'),'utf8'),source);
  assert.equal(await readFile(join(f.dir,'turn-receipt.json'),'utf8'),receipt);
  call(['run','--dir',f.dir,'--codex',await fakeCodex(f),'--allow-model-turn','--acknowledge-unknown-cost'],1);
  await writeFile(join(f.m.project,'src/todo.mjs'),source+'// external drift\n');
  assert.notEqual(call(['finalize','--dir',f.dir],2).status,'COMPLETE_LOCAL');
});

for(const variant of ['jsonl-only','fileset-call','shell-event','other-server'])test('verification-only rejects '+variant+' and preserves spent intent',async t=>{
  const f=await fixture(t),result=await runSynthetic(f,variant);assert.equal(result.status,'HUMAN_RECONCILIATION_REQUIRED');
  assert.match(result.next,/do not approve effects or replay/);assert.doesNotMatch(result.next,/approval remains/);
  const intent=await readFile(join(f.dir,'turn-intent.json'),'utf8');call(['review','--dir',f.dir],1);
  assert.equal(call(['finalize','--dir',f.dir],2).verdict,'BLOCKED_OR_INCOMPLETE');
  assert.equal(await readFile(join(f.dir,'turn-intent.json'),'utf8'),intent);
});

test('verification plan tampering and immutable test drift block before a model intent',async t=>{
  const f=await fixture(t),path=join(f.dir,'verification-plan.json'),plan=await readFile(path,'utf8');
  const changed=JSON.parse(plan);changed.maxModelTurns=2;await writeFile(path,JSON.stringify(changed));
  call(['status','--dir',f.dir],1);await writeFile(path,plan);
  await writeFile(join(f.m.project,'test/todo.test.mjs'),'// weakened test\n');
  call(['status','--dir',f.dir],1);assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});
