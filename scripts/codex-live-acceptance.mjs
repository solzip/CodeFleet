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
const commands=new Set(['prepare','prepare-recovery','checkpoint','preflight','preflight-recovery','run','run-recovery','status','review','finalize']);
function opts(argv){
  const [action,...rest]=argv;
  if(!commands.has(action))fail('Usage: node scripts/codex-live-acceptance.mjs '+[...commands].join('|')+' --dir ABSOLUTE_PATH [--codex PATH] [--allow-model-turn --acknowledge-unknown-cost]');
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
  if(!['run','preflight','run-recovery','preflight-recovery'].includes(action)&&options['--codex'])
    fail('Codex executable selection is only for preflight or run');
  if(!['run','run-recovery'].includes(action)&&(options['--allow-model-turn']||options['--acknowledge-unknown-cost']))
    fail('Model spending flags are run-only; preflight never grants execution');
  if(['run','run-recovery'].includes(action)&&(!options['--allow-model-turn']||!options['--acknowledge-unknown-cost']))
    fail('Actual Codex Turn requires --allow-model-turn and --acknowledge-unknown-cost; this runner cannot inspect or cap ChatGPT plan allowance, enabled credits, or API billing');
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
    !['CODEFLEET_CODEX_LIVE_ACCEPTANCE_V1','CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1'].includes(m.kind)||m.directory!==dir||
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
async function prepare(dir,recovery=false){
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
  const m={kind:recovery?'CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1':'CODEFLEET_CODEX_LIVE_ACCEPTANCE_V1',directory:dir,project:pp.project,
    state:pp.state,goal,gitHead:cmd('git',['rev-parse','HEAD'],pp.project),
    ...fixtureContract};
  await writeFile(pp.manifest,JSON.stringify(m,null,2)+'\n',{flag:'wx'});
  return {status:'READY_FOR_EXPLICIT_CODEX_LIVE_TURN',repository:pp.project,
    state:pp.state,goal,immutableTests:m.testPaths,modelTurns:0,ownerGrantIssued:false,
    next:'run --dir '+dir+' --allow-model-turn --acknowledge-unknown-cost (requires authenticated supported Codex CLI)',
    warning:'This invokes the authenticated Codex host. ChatGPT sign-in normally uses included Codex allowance first and may use enabled credits; API-key sessions use API billing. This runner cannot inspect or cap either path. Owner grants source/test effects separately.'};
}

// Acceptance artifacts live beside existing runner intents/receipts. They do
// not own Task state, approval, budgets, leases or scheduling.
async function recoveryPlan(dir){
  const {pp,m}=await checked(dir);
  if(m.kind!=='CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1')
    fail('New-session recovery requires a freshly prepared recovery fixture');
  const {runtimeIdentity}=await import('../src/product/work-review.mjs');
  return {kind:'CODEFLEET_NEW_SESSION_PLAN_V1',
    manifestSha256:hash(await readFile(pp.manifest)),
    runnerSha256:hash(await readFile(fileURLToPath(import.meta.url))),
    runtimeSha256:hash(JSON.stringify(runtimeIdentity())),
    maxModelTurns:2,maxSecondsPerTurn:300,automaticRetry:false,
    checkpointPhase:'AWAIT_TEST_REVIEW',recoveryMcp:'STATUS_ONLY',
    costStatus:'UNKNOWN',usdCostCapEnforced:false,
    modelApproval:'SEPARATE_PER_TURN',ownerEffectsApproved:false,
    compaction:'NOT_RUN',protectedVerification:'UNSATISFIED'};
}
async function checkedRecoveryPlan(dir){
  const plan=await json(join(dir,'recovery-plan.json'));
  if(hash(JSON.stringify(plan))!==hash(JSON.stringify(await recoveryPlan(dir))))
    fail('Recovery plan binding changed; preserve this fixture, do not reset approval');
  return plan;
}
async function prepareRecovery(dir){
  const prepared=await prepare(dir,true),plan=await recoveryPlan(dir);
  await writeFile(join(dir,'recovery-plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  return {...prepared,status:'READY_FOR_SEPARATE_NEW_SESSION_APPROVALS',plan,
    next:'First approve one proposal Turn; separately review/apply source; checkpoint before verification; separately approve one status-only new-session Turn. Never reuse an earlier fixture or spending approval.'};
}
async function recoverySnapshot(dir){
  const {pp,m}=await checked(dir);
  const [{Store},{tasks},{workReport},{workProfile}]=await Promise.all([
    import('../src/alpha/store.mjs'),import('../src/product/tasks.mjs'),
    import('../src/product/work-report.mjs'),import('../src/product/work-review.mjs')]);
  const store=new Store(pp.state,{readOnly:true});
  try{
    const matches=tasks(store).filter(t=>t.repo===pp.project);
    if(matches.length!==1)fail('Recovery requires exactly one existing Task');
    const t=matches[0],profile=workProfile(store,t),r=await workReport(store,t.id);
    if(!profile||profile.mode!=='CHANGE'||profile.base!==m.gitHead||
       !samePaths(profile.sourcePaths,fixtureContract.sourcePaths)||
       !samePaths(profile.testPaths,fixtureContract.testPaths)||
       store.readArtifact(t.planRef).intent?.original!==goal||
       r.phase!=='AWAIT_TEST_REVIEW'||r.effectCertainty!=='SETTLED'||
       r.nextAction.kind!=='REVIEW_TESTS'||r.budget.attemptsUsed!==0||
       r.control.action!=='RUN'||r.verification.localComplete)
      fail('Recovery requires a settled applied checkpoint before any verification');
    const rows=store.db.prepare('SELECT * FROM runs ORDER BY id').all();
    if(rows.some(row=>row.owner||row.leaseUntil||row.pid))
      fail('Recovery checkpoint has an active or unreconciled lease');
    for(const run of store.list())if(run.materializationRef)store.readArtifact(run.materializationRef);
    return {taskId:t.id,revision:t.revision,requestRef:t.workRequestRef,
      profileRef:t.workProfileRef,planRef:t.planRef,workflowHash:t.bootstrap.workflowHash,
      phase:r.phase,nextAction:r.nextAction.kind,candidateHash:r.verification.candidateHash,
      budget:r.budget,control:r.control,effectCertainty:r.effectCertainty,
      evidenceRefs:r.evidenceRefs,taskSha256:hash(JSON.stringify(t)),
      eventsSha256:hash(JSON.stringify(store.events(t.id))),runsSha256:hash(JSON.stringify(rows))};
  }finally{store.close();}
}
async function recoveryCheckpoint(dir,create=false){
  await checkedRecoveryPlan(dir);
  const {pp}=await checked(dir),receipt=await json(pp.receipt);
  if(receipt.status!=='CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW'||
     receipt.threadIds?.length!==1||!await recordExists(pp.intent))
    fail('Recovery checkpoint needs the confirmed first proposal Turn');
  const record={kind:'CODEFLEET_NEW_SESSION_CHECKPOINT_V1',
    planSha256:hash(await readFile(join(dir,'recovery-plan.json'))),
    firstIntentSha256:hash(await readFile(pp.intent)),
    firstReceiptSha256:hash(await readFile(pp.receipt)),snapshot:await recoverySnapshot(dir)};
  const target=join(dir,'recovery-checkpoint.json');
  if(create){
    if(await recordExists(join(dir,'recovery-turn-intent.json'))||
       await recordExists(join(dir,'recovery-turn-receipt.json')))
      fail('Recovery already reserved; never replace its checkpoint');
    await writeFile(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  }else if(hash(JSON.stringify(await json(target)))!==hash(JSON.stringify(record)))
    fail('Recovery checkpoint drift; no model Turn or automatic replay allowed');
  return record;
}
const recoveryPrompt=[
  'Continue the existing CodeFleet work in this NEW conversation. Do not start a Task or change any files, tests, approvals, reviews or budgets.',
  'Only the status-only codefleet_live MCP is allowed. No shell, nested Codex, API, other tools or execution.',
  'First call codefleet_goal_status with {} to discover the existing Task. Then call codefleet_goal_status with its taskId to reread its persisted contract, DAG, candidate, effects, control, budget and evidence.',
  'Stop before Owner test approval. Return exactly one JSON object with these exact field mappings: taskId=status.taskId; revision=status.revision; phase=status.workReport.phase; nextAction=status.workReport.nextAction.kind; attemptsUsed=status.workReport.budget.attemptsUsed.',
  'No prose or Markdown. Do not claim Objective completion.'
].join('\n');
async function observedRecovery(dir){
  await checkedRecoveryPlan(dir);
  const receipt=await json(join(dir,'recovery-turn-receipt.json'));
  const intent=await json(join(dir,'recovery-turn-intent.json'));
  const checkpoint=await json(join(dir,'recovery-checkpoint.json'));
  const digest=hash(await readFile(join(dir,'recovery-checkpoint.json')));
  return receipt.status==='CODEX_NEW_SESSION_CHECKPOINT_RECOVERED_AWAIT_OWNER_TEST_REVIEW'&&
    receipt.checkpointSha256===digest&&intent.checkpointSha256===digest&&
    checkpoint.firstIntentSha256===hash(await readFile(paths(dir).intent))&&
    checkpoint.firstReceiptSha256===hash(await readFile(paths(dir).receipt))&&
    receipt.recovery?.checkpointPreserved===true&&receipt.recovery?.newThread===true&&
    receipt.recovery?.taskRediscovered===true&&receipt.recovery?.nextActionReported===true;
}
const prompt=m=>[
  'Work on this disposable CodeFleet acceptance project, without modifying any project source or test yourself.',
  'Use the codefleet_live MCP tools in THIS Codex model session. No nested codex, no API key, no changes outside MCP proposal-only tools.',
  'Exact user goal: '+m.goal,
  '1. Call codefleet_goal_start with the EXACT goal text above and mode:"CHANGE". 2. Call codefleet_goal_status to get the plan/draft and current Task revision.',
  '3. Call codefleet_draft_submit with proposal set to EXACTLY the following Draft object (substitute only the probeRef copied byte-for-byte from status; add no fields):',
  '{"schemaVersion":1,"kind":"ExistingLocalDraft","objective":"'+m.goal+'","probeRef":"<EXACT probeRef FROM STATUS>","requirements":["normalizeTitle trims nonempty string input and rejects empty or nonstring input"],"openQuestions":[],"decisions":[{"topic":"implementation","choice":"change only src/todo.mjs","alternatives":["change tests"],"rationale":"tests are immutable acceptance evidence"}],"plannedFiles":[{"path":"src/todo.mjs","purpose":"normalize input title"}],"plannedTests":[{"path":"test/todo.test.mjs","criteria":["todo-title"]}],"criteria":[{"id":"todo-title","description":"Immutable Todo tests pass","tests":["test/todo.test.mjs"]}],"scope":{"includes":["src/todo.mjs"],"excludes":["test/todo.test.mjs"]},"risks":["invalid input behavior must remain explicit"],"workItems":[{"id":"implement","kind":"local-edit","dependencies":[],"acceptanceCriteria":["normalize titles"],"files":["src/todo.mjs"]},{"id":"verify","kind":"local-verification","dependencies":["implement"],"acceptanceCriteria":["pinned tests pass"],"files":[]}]}',
  '4. Call codefleet_draft_submit with EXACT Task revision and proposal. 5. Call codefleet_goal_prepare, read resulting revision. 6. Read src/todo.mjs without changing it; produce a complete replacement implementing the specified behavior.',
  '7. Call codefleet_fileset_propose with only the implement WorkItem, exact revision, old file sha256 (provided by status as sourceDigests if available; otherwise compute from read-only bytes using Node crypto).',
  '8. Call codefleet_fileset_review and STOP. Report only Task ID, reviewRef and reviewHash. Do not apply the review, run tests, create commits, execute Local trust, or claim Objective complete.',
  'Only separate human Owner approval may run the returned CLI action. Tests and final CodeFleet Judge run later, outside this model Turn.'
].join('\n');
const modelConfig=(pp,statusOnly=false)=>[
  'mcp_servers.codefleet_live.command='+JSON.stringify(process.execPath),
  'mcp_servers.codefleet_live.args='+JSON.stringify(
    [mcpServer,'--state',pp.state,'--repository',pp.project,'--acceptance','LOCAL_ONLY',
      '--work-profile','WORK_REVIEW_V1',...(statusOnly?['--status-only']:[])]),
  // Codex 0.167 requires an interactive approval for unannotated custom MCP
  // tools by default. exec is noninteractive, so explicitly approve calls to
  // this proposal-only server; its tools still cannot apply, test or grant.
  'mcp_servers.codefleet_live.default_tools_approval_mode="approve"',
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
async function preflight(dir,binary,recovery=false){
  const {pp,m}=await checked(dir);
  const intentPath=recovery?join(dir,'recovery-turn-intent.json'):pp.intent;
  const receiptPath=recovery?join(dir,'recovery-turn-receipt.json'):pp.receipt;
  if(await recordExists(intentPath)||await recordExists(receiptPath))
    return {status:'BLOCKED_TURN_ALREADY_RESERVED',readyForLiveTurn:false,
      automaticReplay:false,modelTurnsStarted:0,
      reason:'Existing one-shot intent must be reconciled, never replayed'};
  if(recovery)await recoveryCheckpoint(dir);
  else if(m.kind==='CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1')await checkedRecoveryPlan(dir);
  if(!recovery&&cmd('git',['status','--porcelain'],pp.project))
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
async function liveRun(dir,binary,recovery=false){
  const {pp,m}=await checked(dir);
  const intentPath=recovery?join(dir,'recovery-turn-intent.json'):pp.intent;
  const receiptPath=recovery?join(dir,'recovery-turn-receipt.json'):pp.receipt;
  if(await recordExists(intentPath)||await recordExists(receiptPath))
    fail('Codex Turn already reserved: inspect status; never replay an uncertain or billed Turn');
  const checkpoint=recovery?await recoveryCheckpoint(dir):null;
  if(!recovery&&m.kind==='CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1')await checkedRecoveryPlan(dir);
  if(!recovery&&cmd('git',['status','--porcelain'],pp.project))
    fail('Fixture must be clean before any Codex Turn');
  const version=inspectCodexVersion(binary,pp.project);
  if(!inspectCodexLogin(binary,pp.project))
    fail('Codex login status unavailable: authenticate Codex CLI before spending approval; no Turn reserved');
  const q=recovery?recoveryPrompt:prompt(m);
  const argumentsForExec=['exec','--json','--ephemeral','--ignore-user-config',
    '--sandbox','read-only','--cd',pp.project,
    ...modelConfig(pp,recovery).flatMap(v=>['-c',v]),q];
  const invocation=codexInvoke(binary,argumentsForExec);
  const intent={kind:'CODEFLEET_LIVE_ONE_TURN_INTENT_V1',
    createdAt:new Date().toISOString(),gitHead:m.gitHead,codexVersion:version,
    promptSha256:hash(q),argvSha256:hash(JSON.stringify(invocation.args)),
    state:pp.state,project:pp.project,costAuthority:'UNKNOWN_CODEX_SUBSCRIPTION',
    maxTurnSeconds:300,actualModelTurnMayBeBilled:true,
    ownerLocalEffectsApproved:false,automaticRetry:false,
    ...(recovery?{scenario:'NEW_SESSION_STATUS_RECOVERY',
      checkpointSha256:hash(await readFile(join(dir,'recovery-checkpoint.json')))}:{})};
  // Persist before any potentially billable process. No replay after
  // startup failure, crash, timeout or an unconfirmed provider response.
  await writeFile(intentPath,JSON.stringify(intent,null,2)+'\n',{flag:'wx'});
  const metadata={kind:'CODEFLEET_LIVE_CODEX_OBSERVATION_V1',
    status:'UNVERIFIED',startedAt:new Date().toISOString(),exitCode:null,
    timedOut:false,threadIds:[],turnStarted:0,turnCompleted:0,turnFailed:0,
    observedMcpCalls:[],reportedTokens:null,stdoutSha256:null,stderrSha256:null,
    costStatus:'UNKNOWN',modelTurnAuthority:'CODEX_EXEC_JSONL_REPORTED_ONLY',
    authenticatedOwner:false,protectedVerified:false,sourceEffectsPermitted:false};
  if(recovery)metadata.checkpointSha256=intent.checkpointSha256;
  const streamHash=createHash('sha256'),errHash=createHash('sha256');
  let received=0,carry='',invalid=false,recoveryAnswer=null;
  const recoveryReads=[];
  const decoder=new StringDecoder('utf8');
  const mcpFailure=v=>{
    const item=v.item??{},serialized=JSON.stringify(item);
    const errorSerialized=item.error===undefined?'':JSON.stringify(item.error);
    const failureClass=/dubious ownership|safe\.directory/i.test(errorSerialized)?'GIT_OWNERSHIP':
      /\b(?:EPERM|EACCES)\b|permission denied|access denied/i.test(errorSerialized)?'FILESYSTEM_PERMISSION':
      /state[^\n]{0,120}(?:outside|path|directory)|outside[^\n]{0,120}state/i.test(errorSerialized)?'STATE_PATH':
      /invalid[^\n]{0,120}(?:argument|field|goal)|bounded natural-language goal/i.test(errorSerialized)?'INVALID_TOOL_ARGUMENTS':
      /cancelled[^\n]{0,120}approval|approval[^\n]{0,120}(?:unavailable|required)/i.test(errorSerialized)?'MCP_APPROVAL_REQUIRED':
      /server[^\n]{0,120}(?:closed|failed)|mcp[^\n]{0,120}(?:error|failed)/i.test(errorSerialized)?'MCP_SERVER_FAILURE':
      'UNCLASSIFIED_PROVIDER_DETAIL';
    const argumentKeys=item.arguments&&typeof item.arguments==='object'&&!Array.isArray(item.arguments)?
      Object.keys(item.arguments).sort().slice(0,20):[];
    const errorCode=(typeof item.error?.code==='number'||
      (typeof item.error?.code==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(item.error.code)))?
      item.error.code:null;
    const errorValueType=item.error===null?'null':Array.isArray(item.error)?'array':typeof item.error;
    const errorKeys=item.error&&typeof item.error==='object'&&!Array.isArray(item.error)?
      Object.keys(item.error).sort().slice(0,20):[];
    const errorDetail=item.error===undefined?null:errorSerialized;
    const errorMessage=typeof item.error==='string'?item.error:
      typeof item.error?.message==='string'?item.error.message:null;
    // Codex may report a failed MCP call with `error:null` while preserving the
    // server's bounded diagnostic in result.content. Inspect only text for
    // known, non-secret classifications; never copy the raw provider payload
    // into the public receipt.
    const resultText=Array.isArray(item.result?.content)?item.result.content
      .filter(part=>part&&part.type==='text'&&typeof part.text==='string')
      .map(part=>part.text).join('\n'):'';
    const signalSource=[errorSerialized,resultText].join('\n');
    const errorSignals=[
      [/dubious ownership|safe\.directory/i,'GIT_OWNERSHIP'],
      [/\b(?:EPERM|EACCES)\b|permission denied|access denied/i,'FILESYSTEM_PERMISSION'],
      [/(?:^|[^0-9])-32602(?![0-9])/,'JSON_RPC_INVALID_PARAMS'],
      [/(?:^|[^0-9])-32603(?![0-9])/,'JSON_RPC_INTERNAL_ERROR'],
      [/(?:^|[^0-9])-32601(?![0-9])/,'JSON_RPC_METHOD_NOT_FOUND'],
      [/cancelled[^\n]{0,120}approval|interactive approval|approval required/i,'MCP_APPROVAL_REQUIRED'],
      [/server[^\n]{0,80}(?:closed|disconnected)|connection closed/i,'MCP_CONNECTION_CLOSED'],
      [/\b(?:ENOENT|not found)\b|cannot find module/i,'EXECUTABLE_OR_MODULE_NOT_FOUND'],
      [/\bSQLITE_[A-Z_]+\b|SQLiteError/i,'SQLITE_FAILURE'],
      [/\b(?:CODEFLEET|WORK)_[A-Z0-9_]{2,64}\b/,'CODEFLEET_CONTRACT_ERROR']
    ].filter(([pattern])=>pattern.test(signalSource)).map(([,name])=>name);
    const contractCodes=[...new Set((signalSource.match(/\b(?:CODEFLEET|WORK)_[A-Z0-9_]{2,64}\b/g)??[]))]
      .sort().slice(0,10);
    return {failureClass,detailSha256:hash(serialized),
      detailKeys:Object.keys(item).sort().slice(0,20),argumentKeys,errorCode,
      errorValueType,errorKeys,
      errorDetailSha256:errorDetail===null?null:hash(errorDetail),
      errorMessageLength:errorMessage===null?null:errorMessage.length,
      errorSignals,contractCodes,
      resultIsError:item.result?.isError===true,
      resultContentCount:Array.isArray(item.result?.content)?item.result.content.length:null,
      resultTextSha256:resultText?hash(resultText):null,
      resultTextLength:resultText?resultText.length:null};
  };
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
      if(recovery){
        let args=item.arguments;
        try{if(typeof args==='string')args=JSON.parse(args);}catch{args=null;}
        if(item.server!=='codefleet_live'||item.tool!=='codefleet_goal_status'||
           item.status!=='completed'||!args||typeof args!=='object'||Array.isArray(args)||
           Object.keys(args).some(key=>key!=='taskId'))invalid=true;
        else recoveryReads.push(args.taskId===undefined?'LIST':args.taskId);
      }
      if(item.server==='codefleet_live'){
        const call={tool:typeof item.tool==='string'?item.tool.slice(0,80):'UNKNOWN',
          status:typeof item.status==='string'?item.status:'UNKNOWN'};
        metadata.observedMcpCalls.push(item.status==='failed'?{...call,...mcpFailure(v)}:call);
      }
    }
    if(recovery&&v.type==='item.completed'){
      if(!['mcp_tool_call','reasoning','agent_message'].includes(v.item?.type))invalid=true;
      if(v.item?.type==='agent_message'){
        try{recoveryAnswer=JSON.parse(v.item.text);}catch{invalid=true;}
      }
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
            a.kind==='AWAIT_FILESET_APPROVAL'&&a.items.includes('implement'))===true;
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
  if(recovery){
    let preserved=false;
    try{await recoveryCheckpoint(dir);preserved=true;}catch{/* Preserve uncertain effects and receipt. */}
    const previous=await json(pp.receipt);
    const expected={taskId:checkpoint.snapshot.taskId,revision:checkpoint.snapshot.revision,
      phase:checkpoint.snapshot.phase,nextAction:checkpoint.snapshot.nextAction,
      attemptsUsed:checkpoint.snapshot.budget.attemptsUsed};
    const answerMatches=recoveryAnswer&&Object.keys(recoveryAnswer).length===Object.keys(expected).length&&
      Object.entries(expected).every(([key,value])=>recoveryAnswer[key]===value);
    const newThread=metadata.threadIds.length===1&&!previous.threadIds.includes(metadata.threadIds[0]);
    metadata.recovery={checkpointPreserved:preserved,newThread,
      taskRediscovered:recoveryReads[0]==='LIST'&&recoveryReads.slice(1).includes(expected.taskId),
      nextActionReported:!!answerMatches,compactionObserved:false};
    metadata.projectUnchangedByModel=preserved;
    metadata.status=!invalid&&!metadata.timedOut&&metadata.exitCode===0&&
      metadata.turnStarted===1&&metadata.turnCompleted===1&&metadata.turnFailed===0&&
      preserved&&newThread&&metadata.recovery.taskRediscovered&&answerMatches?
      'CODEX_NEW_SESSION_CHECKPOINT_RECOVERED_AWAIT_OWNER_TEST_REVIEW':'HUMAN_RECONCILIATION_REQUIRED';
  }
  await writeFile(receiptPath,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
  return {status:metadata.status,observedMcpCalls:metadata.observedMcpCalls,
    turnStarted:metadata.turnStarted,turnCompleted:metadata.turnCompleted,
    costStatus:metadata.costStatus,ownerApproval:'REQUIRED_OUTSIDE_CODEX_MCP',
    automaticReplay:false,
    ...(recovery?{recovery:metadata.recovery}:{}),
    next:recovery?'Stop; inspect recovery receipt. Owner test review remains separate; never replay this Turn.':
      'Inspect exact codefleet_fileset_review result in Codex; use separate trusted owner CLI to apply and verify, then run finalize --dir '+dir};
}
async function ownerReview(dir){
  const {pp,m}=await checked(dir);
  const recoveryRequired=m.kind==='CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1';
  if(recoveryRequired)await checkedRecoveryPlan(dir);
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
    if(files?.items?.includes('implement')){
      review=await prepareNativeFilesReview(store,taskId,'implement');
      action='local-files-accept';
      scope=review.files;
    }else if(local?.items?.includes('verify')){
      if(recoveryRequired&&!await observedRecovery(dir).catch(()=>false))
        fail('Observe the separate new-session recovery before Owner test review');
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
  let report=null,taskId=null,work=null;
  if(await lstat(pp.state).then(()=>true,()=>false)){
    const [{Store},{tasks},{taskReport},{workReport},{isWork}]=await Promise.all([
      import('../src/alpha/store.mjs'),import('../src/product/tasks.mjs'),
      import('../src/product/report.mjs'),import('../src/product/work-report.mjs'),
      import('../src/product/work-review.mjs')]);
    const store=new Store(pp.state,{readOnly:true});
    try{
      const matching=tasks(store).filter(row=>
        row.repo===pp.project&&row.acceptanceMode==='LOCAL_ONLY');
      if(matching.length===1){
        taskId=matching[0].id;
        report=await taskReport(store,taskId);
        if(isWork(matching[0]))work=await workReport(store,taskId);
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
  const recoveryRequired=m.kind==='CODEFLEET_CODEX_NEW_SESSION_ACCEPTANCE_V1';
  let recovered=false;
  if(recoveryRequired){
    await checkedRecoveryPlan(dir);
    const recoveryIntent=await recordExists(join(dir,'recovery-turn-intent.json'));
    const recoveryReceipt=await recordExists(join(dir,'recovery-turn-receipt.json'));
    recovered=await observedRecovery(dir).catch(()=>false);
    state.newSessionRecovery={status:recovered?'OBSERVED_CHECKPOINT_RECOVERY':
      recoveryIntent||recoveryReceipt?'HUMAN_RECONCILIATION_REQUIRED':'NOT_RUN',
      checkpointPresent:await recordExists(join(dir,'recovery-checkpoint.json')),
      automaticReplay:false,compaction:'NOT_RUN',costStatus:'UNKNOWN'};
  }
  const reasons=[];
  if(recoveryRequired&&!recovered)
    reasons.push('Separate new-session checkpoint recovery not observed');
  if(!receipt||receipt.status!=='CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW')
    reasons.push('No successful single Codex Turn observation');
  if(!taskId||!report||!report.acceptance?.complete||
     report.continuation?.status!=='COMPLETE_LOCAL')
    reasons.push('CodeFleet current-tree independent Local acceptance incomplete');
  if(work&&work.phase!=='COMPLETE_LOCAL')
    reasons.push('Current Work phase is '+work.phase+'; Local completion is not current');
  if(report?.protectedVerification!=='UNSATISFIED')
    reasons.push('Local trust classification changed');
  const source=await readFile(join(pp.project,'src','todo.mjs'));
  if(hash(source)===m.sourceSha256)reasons.push('Code source not modified');
  const gitStatus=cmd('git',['status','--porcelain'],pp.project).split('\n').filter(Boolean);
  if(gitStatus.length!==1||!gitStatus[0].endsWith(' src/todo.mjs'))
    reasons.push('Unexpected or missing modified source path');
  if(!reasons.length){
    state.status='COMPLETE_LOCAL';
    state.next='Local objective complete. No further Owner approval or model Turn is required for this fixture. Preserve its records; do not replay.';
    if(recoveryRequired)state.newSessionRecovery.status='OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL';
  }else if(observedTurn){
    if(work&&!['COMPLETE_LOCAL','AWAIT_FILE_REVIEW','AWAIT_TEST_REVIEW'].includes(work.phase)){
      state.status=work.phase;
      state.next='Inspect the current Task, control, candidate and evidence before any further action; do not replay a Turn.';
    }else if(recoveryRequired&&!recovered&&(state.newSessionRecovery.status==='HUMAN_RECONCILIATION_REQUIRED'||state.currentTreeComplete)){
      state.status='HUMAN_RECONCILIATION_REQUIRED';
      state.next='Inspect the incomplete or uncertain recovery evidence; do not replay a Turn or approve effects from it.';
    }else if(report?.nextActions?.some(a=>a.kind==='AWAIT_FILESET_APPROVAL'&&a.items.includes('implement'))){
      state.next='Owner must review the current source Fileset in a separate terminal. Do not repeat the proposal Turn.';
    }else if(report?.nextActions?.some(a=>a.kind==='RUN_LOCAL_VERIFICATION'&&a.items.includes('verify'))){
      state.next=recoveryRequired&&!recovered?
        'Record the settled checkpoint and separately approve the new-session recovery Turn before Owner test review.':
        'Owner must review the exact fixed test command in a separate terminal, then run finalize.';
    }else state.next='Inspect the current Task, candidate and evidence before any further action; do not replay a Turn.';
  }
  if(!finalize)return state;
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
    o.action==='prepare-recovery'?await prepareRecovery(o.directory):
    o.action==='checkpoint'?await recoveryCheckpoint(o.directory,true):
    o.action==='preflight'?await preflight(o.directory,o.codex):
    o.action==='preflight-recovery'?await preflight(o.directory,o.codex,true):
    o.action==='run'?await liveRun(o.directory,o.codex):
    o.action==='run-recovery'?await liveRun(o.directory,o.codex,true):
    o.action==='review'?await ownerReview(o.directory):
      await inspect(o.directory,o.action==='finalize');
  console.log(JSON.stringify(result,null,2));
  if(o.action==='finalize'&&result.reasons.length)process.exitCode=2;
  if(['preflight','preflight-recovery'].includes(o.action)&&!result.readyForLiveTurn)process.exitCode=2;
}
main().catch(error=>{
  console.error('CODEFLEET_LIVE_ACCEPTANCE_BLOCKED: '+error.message);
  process.exitCode=1;
});
