#!/usr/bin/env node
// Owner-run real Codex acceptance. No model Turn without two explicit flags.
// Proposal-only Codex MCP; independent Local acceptance needs Owner review.
// This is not a trusted Owner identity broker or USD spending-cap enforcer.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

const rootOfCodeFleet=fileURLToPath(new URL('../',import.meta.url));
const mcpServer=join(rootOfCodeFleet,'src','hosts','codex-mcp.mjs');
const supportedCodexVersions=new Set(['0.167.0','0.167.1']);
const hash=value=>createHash('sha256').update(value).digest('hex');
const goal='Implement normalizeTitle in src/todo.mjs: trim nonempty text, reject empty or nonstring input, and pass the immutable Node tests.';
const initialSource="export function normalizeTitle(value) { throw Error('NOT_IMPLEMENTED'); }\n";
const testSource=[
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { normalizeTitle } from '../src/todo.mjs';",
  "test('Todo title normalization', () => {",
  "  assert.equal(normalizeTitle('  Ship  '), 'Ship');",
  "  assert.equal(normalizeTitle(' Ready '), 'Ready');",
  "  assert.throws(() => normalizeTitle('   '), /title|empty|invalid/i);",
  "  assert.throws(() => normalizeTitle(42), /title|empty|invalid/i);",
  "});", ''
].join('\n');
// The reviewed runner defines this disposable test contract. A mutable
// manifest records its identity; it cannot redefine tests, scope or authority.
const fixtureContract=Object.freeze({
  sourceSha256:hash(initialSource),testSha256:hash(testSource),
  testPaths:Object.freeze(['test/todo.test.mjs']),
  sourcePaths:Object.freeze(['src/todo.mjs']),
  acceptancePolicy:'LOCAL_ONLY',modelTurnExecuted:false,ownerGrantIssued:false
});
const manifestKeys=new Set(['kind','directory','project','state','goal','gitHead',
  ...Object.keys(fixtureContract)]);
const samePaths=(actual,expected)=>Array.isArray(actual)&&
  actual.length===expected.length&&actual.every((path,i)=>path===expected[i]);
const fail=text=>{throw Error(text);};
const commands=new Set(['prepare','preflight','run','status','review','finalize']);
function opts(argv){
  const [action,...rest]=argv;
  if(!commands.has(action))fail('Usage: node scripts/codex-live-acceptance.mjs prepare|preflight|run|status|review|finalize --dir ABSOLUTE_PATH [--codex PATH] [--allow-model-turn --acknowledge-unknown-cost]');
  const options={};
  for(let i=0;i<rest.length;i++){
    const key=rest[i];
    if(key==='--allow-model-turn'||key==='--acknowledge-unknown-cost'){
      if(options[key])fail('Repeated live execution option');
      options[key]=true;
    }else if((key==='--dir'||key==='--codex')&&rest[i+1]&&!rest[i+1].startsWith('--')){
      if(Object.hasOwn(options,key))fail('Repeated option');
      options[key]=rest[++i];
    }else fail('Unknown acceptance argument');
  }
  if(!isAbsolute(options['--dir']??'')||options['--dir'].includes('\0'))
    fail('Exact absolute --dir is mandatory');
  if(!['run','preflight'].includes(action)&&options['--codex'])
    fail('Codex executable selection is only for preflight or run');
  if(action!=='run'&&(options['--allow-model-turn']||options['--acknowledge-unknown-cost']))
    fail('Model spending flags are run-only; preflight never grants execution');
  if(action==='run'&&(!options['--allow-model-turn']||!options['--acknowledge-unknown-cost']))
    fail('Actual billable Codex Turn requires --allow-model-turn and --acknowledge-unknown-cost; subscription USD cap is NOT enforceable');
  if(options['--codex']&&(!isAbsolute(options['--codex'])||options['--codex'].includes('\0')))
    fail('Selected Codex executable must be an absolute path');
  return {action,directory:resolve(options['--dir']),codex:options['--codex']??'codex'};
}
function cmd(executable,args,cwd,preserveOutput=false){
  const p=spawnSync(executable,args,{cwd,encoding:'utf8',windowsHide:true,shell:false,timeout:25000,maxBuffer:1024*1024});
  if(p.error||p.status!==0)fail('Acceptance Git or Codex preflight failed; no model turn: '+(p.error?.code??p.status));
  return preserveOutput?p.stdout:p.stdout.trim();
}
const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function recordExists(path){
  try{await lstat(path);return true;}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
}
const paths=dir=>({project:join(dir,'project'),state:join(dir,'state'),
  manifest:join(dir,'manifest.json'),intent:join(dir,'turn-intent.json'),
  receipt:join(dir,'turn-receipt.json')});
async function checked(dir){
  const pp=paths(dir),m=await json(pp.manifest);
  if(!m||typeof m!=='object'||Array.isArray(m)||
    m.kind!=='CODEFLEET_CODEX_LIVE_ACCEPTANCE_V1'||m.directory!==dir||
    m.project!==pp.project||m.state!==pp.state||m.goal!==goal||
    typeof m.gitHead!=='string'||!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(m.gitHead))
    fail('Acceptance manifest identity invalid');
  if(Object.keys(m).length!==manifestKeys.size||
    Object.keys(m).some(key=>!manifestKeys.has(key))||
    m.sourceSha256!==fixtureContract.sourceSha256||
    m.testSha256!==fixtureContract.testSha256||
    !samePaths(m.testPaths,fixtureContract.testPaths)||
    !samePaths(m.sourcePaths,fixtureContract.sourcePaths)||
    m.acceptancePolicy!==fixtureContract.acceptancePolicy||
    m.modelTurnExecuted!==false||m.ownerGrantIssued!==false)
    fail('Pinned acceptance contract changed');
  // Windows realpath can normalize temporary directory casing/junction
  // spelling differently from the absolute user-selected path. This is a
  // freshly created fixture: require a real directory, never a symlink,
  // while the exact manifest/State path binding is checked above.
  const stat=await lstat(pp.project);
  if(!stat.isDirectory()||stat.isSymbolicLink()||!isAbsolute(pp.state))
    fail('Acceptance directory identity changed');
  if(cmd('git',['rev-parse','HEAD'],pp.project)!==m.gitHead)
    fail('Fixture Git HEAD changed');
  if(hash(await readFile(join(pp.project,'test','todo.test.mjs')))!==fixtureContract.testSha256)
    fail('Immutable test source changed');
  // Do not trim Git blob output: whitespace is part of the pinned bytes.
  if(hash(cmd('git',['show','HEAD:src/todo.mjs'],pp.project,true))!==fixtureContract.sourceSha256)
    fail('Pinned baseline source changed');
  if(hash(cmd('git',['show','HEAD:test/todo.test.mjs'],pp.project,true))!==fixtureContract.testSha256)
    fail('Pinned baseline test changed');
  return {pp,m};
}
async function prepare(dir){
  // Exclusive NEW fixture creation. No writes to an existing user project.
  await mkdir(dir);
  const pp=paths(dir);
  await mkdir(join(pp.project,'src'),{recursive:true});
  await mkdir(join(pp.project,'test'),{recursive:true});
  await writeFile(join(pp.project,'src','todo.mjs'),initialSource,{flag:'wx'});
  await writeFile(join(pp.project,'test','todo.test.mjs'),testSource,{flag:'wx'});
  cmd('git',['init'],pp.project);
  cmd('git',['add','.'],pp.project);
  cmd('git',['-c','user.name=CodeFleet Live Fixture','-c','user.email=fixture@example.invalid',
    'commit','-m','Pinned independent acceptance'],pp.project);
  const m={kind:'CODEFLEET_CODEX_LIVE_ACCEPTANCE_V1',directory:dir,project:pp.project,
    state:pp.state,goal,gitHead:cmd('git',['rev-parse','HEAD'],pp.project),
    ...fixtureContract};
  await writeFile(pp.manifest,JSON.stringify(m,null,2)+'\n',{flag:'wx'});
  return {status:'READY_FOR_EXPLICIT_CODEX_LIVE_TURN',repository:pp.project,
    state:pp.state,goal,immutableTests:m.testPaths,modelTurns:0,ownerGrantIssued:false,
    next:'run --dir '+dir+' --allow-model-turn --acknowledge-unknown-cost (requires authenticated supported Codex CLI)',
    warning:'Real model usage may be billed and subscription USD spending cannot be capped here; owner grants source/test effects separately'};
}
const prompt=m=>[
  'Work on this disposable CodeFleet acceptance project, without modifying any project source or test yourself.',
  'Use the codefleet_live MCP tools in THIS Codex model session. No nested codex, no API key, no changes outside MCP proposal-only tools.',
  'Exact user goal: '+m.goal,
  '1. Call codefleet_goal_start with the EXACT goal text above. 2. Call codefleet_goal_status to get the plan/draft and current Task revision.',
  '3. Submit a valid ExistingLocalDraft with current plan.draft fields preserved and scoped requirements/decisions; plannedFiles=[{path:"src/todo.mjs",purpose:"normalize input title"}]; plannedTests=[{path:"test/todo.test.mjs",criteria:["todo-title"]}]; criteria=[{id:"todo-title",description:"Immutable Todo tests pass",tests:["test/todo.test.mjs"]}]; scope includes src/todo.mjs and excludes test/todo.test.mjs.',
  'Set workItems=[{id:"todo",kind:"local-edit",dependencies:[],acceptanceCriteria:["normalize titles"],files:["src/todo.mjs"]},{id:"verify",kind:"local-verification",dependencies:["todo"],acceptanceCriteria:["pinned tests pass"],files:[]}].',
  '4. Call codefleet_draft_submit with EXACT Task revision and proposal. 5. Call codefleet_goal_prepare, read resulting revision. 6. Read src/todo.mjs without changing it; produce a complete replacement implementing the specified behavior.',
  '7. Call codefleet_fileset_propose with only the todo WorkItem, exact revision, old file sha256 (provided by status as sourceDigests if available; otherwise compute from read-only bytes using Node crypto).',
  '8. Call codefleet_fileset_review and STOP. Report only Task ID, reviewRef and reviewHash. Do not apply the review, run tests, create commits, execute Local trust, or claim Objective complete.',
  'Only separate human Owner approval may run the returned CLI action. Tests and final CodeFleet Judge run later, outside this model Turn.'
].join('\n');
const modelConfig=pp=>[
  'mcp_servers.codefleet_live.command='+JSON.stringify(process.execPath),
  'mcp_servers.codefleet_live.args='+JSON.stringify(
    [mcpServer,'--state',pp.state,'--repository',pp.project,'--acceptance','LOCAL_ONLY']),
  'mcp_servers.codefleet_live.enabled=true'
];
function resolveCodexBinary(binary){
  if(process.platform!=='win32'||binary!=='codex')return binary;
  const found=spawnSync('where.exe',['codex'],{
    encoding:'utf8',windowsHide:true,shell:false,timeout:5000
  });
  if(found.error||found.status!==0)fail('Supported Codex executable not found on PATH');
  const candidates=found.stdout.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  return candidates.find(value=>/\.(?:exe|cmd|m?js)$/i.test(value))??
    fail('Supported Codex executable not found on PATH');
}
function codexInvoke(selected,args){
  const binary=resolveCodexBinary(selected);
  if(/\.cmd$/i.test(binary)){
    // npm's Windows shim cannot be spawned safely with shell:false. Resolve
    // only the fixed official package layout; never parse or execute shim text.
    const entry=join(dirname(binary),'node_modules','@openai','codex','bin','codex.js');
    if(!existsSync(entry))fail('Official Codex npm shim target not found');
    return {exe:process.execPath,args:[entry,...args]};
  }
  return /\.m?js$/i.test(binary)?
    {exe:process.execPath,args:[binary,...args]}:{exe:binary,args};
}
function inspectCodexVersion(binary,directory){
  const invocation=codexInvoke(binary,['--version']);
  const version=cmd(invocation.exe,invocation.args,directory);
  const observed=/\bcodex-cli\s+(\d+\.\d+\.\d+)\b/.exec(version)?.[1];
  if(!observed||!supportedCodexVersions.has(observed))
    fail('This acceptance supports only verified Codex CLI 0.167.0 or 0.167.1; observed version unsupported');
  return version;
}
function inspectCodexLogin(binary,directory){
  // Official Codex 'login status' returns nonzero when authentication is
  // unavailable. Discard ALL output; it may contain account/key metadata.
  // Exit status is not independent proof of Owner identity or quota.
  const {exe,args}=codexInvoke(binary,['login','status']);
  const result=spawnSync(exe,args,{cwd:directory,encoding:'utf8',
    shell:false,windowsHide:true,timeout:15000,maxBuffer:256*1024});
  return !result.error&&result.status===0;
}
async function preflight(dir,binary){
  const {pp}=await checked(dir);
  if(await recordExists(pp.intent))
    return {status:'BLOCKED_TURN_ALREADY_RESERVED',readyForLiveTurn:false,
      automaticReplay:false,modelTurnsStarted:0,
      reason:'Existing one-shot intent must be reconciled, never replayed'};
  if(cmd('git',['status','--porcelain'],pp.project))
    return {status:'BLOCKED_DIRTY_FIXTURE',readyForLiveTurn:false,
      modelTurnsStarted:0,reason:'Pinned fixture must be clean'};
  const version=inspectCodexVersion(binary,pp.project);
  const loginReported=inspectCodexLogin(binary,pp.project);
  return {
    status:loginReported?'READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL':
      'BLOCKED_CODEX_LOGIN_UNAVAILABLE',
    readyForLiveTurn:loginReported,codexVersion:version,
    loginAuthority:'CODEX_CLI_EXIT_STATUS_ONLY_NOT_INDEPENDENT_IDENTITY',
    modelTurnsStarted:0,ownerGrantIssued:false,
    costStatus:'UNKNOWN',usdCostCapEnforced:false,automaticReplay:false,
    next:loginReported?'Owner may explicitly invoke run with both model/cost acknowledgments':
      'Authenticate supported Codex CLI separately, then repeat preflight; no model Turn or reservation was started'
  };
}
async function liveRun(dir,binary){
  const {pp,m}=await checked(dir);
  if(await recordExists(pp.intent))
    fail('Codex Turn already reserved: inspect status; never replay an uncertain or billed Turn');
  if(cmd('git',['status','--porcelain'],pp.project))
    fail('Fixture must be clean before any Codex Turn');
  const version=inspectCodexVersion(binary,pp.project);
  if(!inspectCodexLogin(binary,pp.project))
    fail('Codex login status unavailable: authenticate Codex CLI before spending approval; no Turn reserved');
  const q=prompt(m);
  const argumentsForExec=['exec','--json','--ephemeral','--ignore-user-config',
    '--sandbox','read-only','--cd',pp.project,
    ...modelConfig(pp).flatMap(v=>['-c',v]),q];
  const invocation=codexInvoke(binary,argumentsForExec);
  const intent={kind:'CODEFLEET_LIVE_ONE_TURN_INTENT_V1',
    createdAt:new Date().toISOString(),gitHead:m.gitHead,codexVersion:version,
    promptSha256:hash(q),argvSha256:hash(JSON.stringify(invocation.args)),
    state:pp.state,project:pp.project,costAuthority:'UNKNOWN_CODEX_SUBSCRIPTION',
    maxTurnSeconds:300,actualModelTurnMayBeBilled:true,
    ownerLocalEffectsApproved:false,automaticRetry:false};
  // Persist before any potentially billable process. No replay after
  // startup failure, crash, timeout or an unconfirmed provider response.
  await writeFile(pp.intent,JSON.stringify(intent,null,2)+'\n',{flag:'wx'});
  const metadata={kind:'CODEFLEET_LIVE_CODEX_OBSERVATION_V1',
    status:'UNVERIFIED',startedAt:new Date().toISOString(),exitCode:null,
    timedOut:false,threadIds:[],turnStarted:0,turnCompleted:0,turnFailed:0,
    observedMcpCalls:[],reportedTokens:null,stdoutSha256:null,stderrSha256:null,
    costStatus:'UNKNOWN',modelTurnAuthority:'CODEX_EXEC_JSONL_REPORTED_ONLY',
    authenticatedOwner:false,protectedVerified:false,sourceEffectsPermitted:false};
  const streamHash=createHash('sha256'),errHash=createHash('sha256');
  let received=0,carry='',invalid=false;
  const decoder=new StringDecoder('utf8');
  const handleEvent=s=>{
    let v;try{v=JSON.parse(s);}catch{invalid=true;return;}
    if(v.type==='thread.started'&&typeof v.thread_id==='string')metadata.threadIds.push(v.thread_id);
    if(v.type==='turn.started')metadata.turnStarted++;
    if(v.type==='turn.completed'){
      metadata.turnCompleted++;
      if(v.usage&&typeof v.usage==='object')metadata.reportedTokens={
        input:Number.isSafeInteger(v.usage.input_tokens)?v.usage.input_tokens:null,
        output:Number.isSafeInteger(v.usage.output_tokens)?v.usage.output_tokens:null};
    }
    if(v.type==='turn.failed'||v.type==='error')metadata.turnFailed++;
    if(v.type==='item.completed'&&v.item?.type==='mcp_tool_call'){
      const item=v.item;
      if(item.server==='codefleet_live')metadata.observedMcpCalls.push({
        tool:typeof item.tool==='string'?item.tool.slice(0,80):'UNKNOWN',
        status:typeof item.status==='string'?item.status:'UNKNOWN'});
    }
  };
  let child;
  try{
    child=spawn(invocation.exe,invocation.args,{
      cwd:pp.project,env:process.env,stdio:['ignore','pipe','pipe'],
      shell:false,windowsHide:true});
    const exit=await new Promise(resolveExit=>{
      const clock=setTimeout(()=>{metadata.timedOut=true;child.kill('SIGTERM');},300000);
      child.stdout.on('data',chunk=>{
        streamHash.update(chunk);received+=chunk.length;
        if(received>8*1024*1024){invalid=true;child.kill('SIGTERM');return;}
        carry+=decoder.write(chunk);
        let n;
        while((n=carry.indexOf('\n'))!==-1){
          const line=carry.slice(0,n);carry=carry.slice(n+1);
          if(line.length>300000){invalid=true;continue;}
          if(line.trim())handleEvent(line);
        }
        if(carry.length>300000){invalid=true;child.kill('SIGTERM');}
      });
      child.stderr.on('data',chunk=>errHash.update(chunk));
      child.on('error',()=>{clearTimeout(clock);resolveExit({code:null,error:true});});
      child.on('close',code=>{clearTimeout(clock);resolveExit({code,error:false});});
    });
    if(carry.trim())invalid=true;
    metadata.exitCode=exit.code;
    if(exit.error)invalid=true;
  }catch{invalid=true;}
  metadata.stdoutSha256=streamHash.digest('hex');
  metadata.stderrSha256=errHash.digest('hex');
  metadata.completedAt=new Date().toISOString();
  const required=['codefleet_goal_start','codefleet_draft_submit',
    'codefleet_goal_prepare','codefleet_fileset_propose','codefleet_fileset_review'];
  const calls=new Set(metadata.observedMcpCalls
    .filter(c=>c.status==='completed').map(c=>c.tool));
  const cleanProject=cmd('git',['status','--porcelain'],pp.project)==='';
  // Corroborate provider-reported MCP calls with independent persistent
  // CodeFleet Contract/DAG/Fileset records. Fake JSONL alone never passes.
  let pendingReviewInStore=false;
  try{
    const [{Store},{tasks},{taskReport}]=await Promise.all([
      import('../src/alpha/store.mjs'),import('../src/product/tasks.mjs'),
      import('../src/product/report.mjs')]);
    const store=new Store(pp.state,{readOnly:true});
    try{
      const matches=tasks(store).filter(row=>row.repo===pp.project&&
        row.acceptanceMode==='LOCAL_ONLY'&&
        store.readArtifact(row.planRef)?.intent?.original===goal);
      if(matches.length===1){
        const report=await taskReport(store,matches[0].id);
        pendingReviewInStore=report.contractKind==='EXISTING_LOCAL'&&
          report.complete===false&&report.nextActions?.some(a=>
            a.kind==='AWAIT_FILESET_APPROVAL'&&a.items.includes('todo'))===true;
      }
    }finally{store.close();}
  }catch{/* Missing or uncertain Store never passes. */}
  metadata.pendingExactFilesetReviewObserved=pendingReviewInStore;
  metadata.status=!invalid&&!metadata.timedOut&&metadata.exitCode===0&&
    metadata.turnStarted===1&&metadata.turnCompleted===1&&
    metadata.turnFailed===0&&metadata.threadIds.length===1&&
    required.every(c=>calls.has(c))&&pendingReviewInStore&&cleanProject?
    'CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW':'HUMAN_RECONCILIATION_REQUIRED';
  metadata.projectUnchangedByModel=cleanProject;
  await writeFile(pp.receipt,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
  return {status:metadata.status,observedMcpCalls:metadata.observedMcpCalls,
    turnStarted:metadata.turnStarted,turnCompleted:metadata.turnCompleted,
    costStatus:metadata.costStatus,ownerApproval:'REQUIRED_OUTSIDE_CODEX_MCP',
    automaticReplay:false,
    next:'Inspect exact codefleet_fileset_review result in Codex; use separate trusted owner CLI to apply and verify, then run finalize --dir '+dir};
}
async function ownerReview(dir){
  const {pp,m}=await checked(dir);
  const receipt=await json(pp.receipt).catch(()=>null);
  if(receipt?.status!=='CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW')
    fail('No confirmed single Codex proposal turn; cannot prepare Owner effects');
  const [{Store},{tasks},{taskReport},{prepareNativeFilesReview,prepareNativeLocalReview}]=await Promise.all([
    import('../src/alpha/store.mjs'),import('../src/product/tasks.mjs'),
    import('../src/product/report.mjs'),import('../src/product/native-local.mjs')]);
  const store=new Store(pp.state);
  try{
    const matches=tasks(store).filter(t=>t.repo===pp.project&&t.acceptanceMode==='LOCAL_ONLY'&&
      store.readArtifact(t.planRef)?.intent?.original===goal);
    if(matches.length!==1)fail('Expected precisely one model-created Objective');
    const taskId=matches[0].id,report=await taskReport(store,taskId);
    if(report.complete===true)return {status:'COMPLETE_LOCAL_ALREADY',taskId,ownerAction:null};
    const files=report.nextActions?.find(a=>a.kind==='AWAIT_FILESET_APPROVAL');
    const local=report.nextActions?.find(a=>a.kind==='RUN_LOCAL_VERIFICATION');
    let review,action,scope;
    if(files?.items?.includes('todo')){
      review=await prepareNativeFilesReview(store,taskId,'todo');
      action='local-files-accept';
      scope=review.files;
    }else if(local?.items?.includes('verify')){
      const request={executable:process.execPath,
        args:['--test','--test-reporter=tap',...m.testPaths],
        directory:pp.project,timeoutMs:30000};
      review=await prepareNativeLocalReview(store,taskId,{request});
      action='local-accept';
      scope=request;
    }else fail('Workflow not eligible for current Owner Fileset or test review');
    if(!review.reviewRef||!review.reviewHash)fail('Exact review not ready');
    return {status:'OWNER_REVIEW_REQUIRED',taskId,reviewRef:review.reviewRef,
      reviewHash:review.reviewHash,scope,
      ownerAction:{executable:process.execPath,
        args:[join(rootOfCodeFleet,'src','alpha','cli.mjs'),'--state',pp.state,
          'objective',action,review.reviewRef,'--trust',review.reviewHash],
        requiredOwnerAcknowledgment:'--acknowledge-unisolated',
        note:'Owner must inspect this review independently before adding acknowledgment. Never run it as the model.'},
      executionGranted:false,ownerAuthenticated:false,protectedVerified:false,
      automaticReplay:false};
  }finally{store.close();}
}
async function inspect(dir,finalize=false){
  const {pp,m}=await checked(dir);
  // A partial/corrupt record is an uncertain effect, never a fresh start.
  const receiptPresent=await recordExists(pp.receipt);
  const intentPresent=await recordExists(pp.intent);
  const receipt=receiptPresent?await json(pp.receipt).catch(()=>null):null;
  let report=null,taskId=null;
  if(await lstat(pp.state).then(()=>true,()=>false)){
    const [{Store},{tasks},{taskReport}]=await Promise.all([
      import('../src/alpha/store.mjs'),import('../src/product/tasks.mjs'),
      import('../src/product/report.mjs')]);
    const store=new Store(pp.state,{readOnly:true});
    try{
      const matching=tasks(store).filter(row=>
        row.repo===pp.project&&row.acceptanceMode==='LOCAL_ONLY');
      if(matching.length===1){
        taskId=matching[0].id;
        report=await taskReport(store,taskId);
      }else if(matching.length>1)fail(
        'Ambiguous persisted Objectives: manual reconciliation required');
    }finally{store.close();}
  }
  const observedTurn=receipt?.status==='CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW';
  const state={status:observedTurn?receipt.status:
    receiptPresent?'HUMAN_RECONCILIATION_REQUIRED':
      intentPresent?'UNCONFIRMED_TURN_NO_RECEIPT':'NOT_STARTED',
    objectiveId:taskId,workflowHash:report?.workflowHash??null,
    continuation:report?.continuation?.status??null,
    currentTreeComplete:report?.acceptance?.complete===true,
    reportedLocalEvidence:report?.verification??'NOT_RUN',
    protectedVerification:report?.protectedVerification??'NOT_ESTABLISHED',
    actualCodexTurnObserved:receipt?.status==='CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW',
    costStatus:'UNKNOWN',automaticReplay:false,ownerGrantInMcp:false,
    next:observedTurn?
      'Review the exact Fileset with Codex and approve via separate CLI, then run finalize':
      intentPresent||receiptPresent?
        'Manual reconciliation required; do not rerun this fixture or approve effects from an uncertain Turn':
        'No model Turn recorded; owner must explicitly choose run'};
  if(!finalize)return state;
  const reasons=[];
  if(!receipt||receipt.status!=='CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW')
    reasons.push('No successful single Codex Turn observation');
  if(!taskId||!report||!report.acceptance?.complete||
     report.continuation?.status!=='COMPLETE_LOCAL')
    reasons.push('CodeFleet current-tree independent Local acceptance incomplete');
  if(report?.protectedVerification!=='UNSATISFIED')
    reasons.push('Local trust classification changed');
  const source=await readFile(join(pp.project,'src','todo.mjs'));
  if(hash(source)===m.sourceSha256)reasons.push('Code source not modified');
  const gitStatus=cmd('git',['status','--porcelain'],pp.project).split('\n').filter(Boolean);
  if(gitStatus.length!==1||!gitStatus[0].endsWith(' src/todo.mjs'))
    reasons.push('Unexpected or missing modified source path');
  return {...state,
    verdict:reasons.length?'BLOCKED_OR_INCOMPLETE':
      'CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL',
    reasons,independentEvidence:'CODEFLEET_LOCAL_UNPROTECTED_CURRENT_TREE',
    hostLiveTrust:'PROVIDER_REPORTED_ONLY',
    ownerAuthentication:'NOT_ESTABLISHED',
    protectedVerified:false,usdCostCapEnforced:false};
}
async function main(){
  const o=opts(process.argv.slice(2));
  const result=o.action==='prepare'?await prepare(o.directory):
    o.action==='preflight'?await preflight(o.directory,o.codex):
    o.action==='run'?await liveRun(o.directory,o.codex):
    o.action==='review'?await ownerReview(o.directory):
      await inspect(o.directory,o.action==='finalize');
  console.log(JSON.stringify(result,null,2));
  if(o.action==='finalize'&&result.reasons.length)process.exitCode=2;
  if(o.action==='preflight'&&!result.readyForLiveTurn)process.exitCode=2;
}
main().catch(error=>{
  console.error('CODEFLEET_LIVE_ACCEPTANCE_BLOCKED: '+error.message);
  process.exitCode=1;
});
