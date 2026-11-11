#!/usr/bin/env node
// Codex-session-native MCP adapter for CodeFleet preparation/proposals.
// This stdio server is NOT a trusted Operator, a model launcher, or a Host
// execution sandbox. It never approves, applies, tests, deploys or bills.
import {realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {pathToFileURL} from 'node:url';
import {Store} from '../alpha/store.mjs';
import {enableTasks,task,createTask,submitTaskDraft,prepareTask,submitBootstrapFiles}
  from '../product/tasks.mjs';
import {taskReport} from '../product/report.mjs';

const VERSION='2025-06-18';
const MAX_LINE=256*1024, MAX_REPLY=180*1024;
const TASK=/^task-[a-f0-9-]{36}$/;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const fail=(message)=>{throw Error(message);};
function exact(value,keys,label){
  if(!plain(value)||Object.keys(value).some(k=>!keys.includes(k)))
    fail('Invalid '+label+' fields');
}
function configured(argv){
  if(argv.length!==4&&argv.length!==6)fail(
    'Usage: node codex-mcp.mjs --state ABS_PATH --repository ABS_PATH [--acceptance LOCAL_ONLY|PROTECTED_REQUIRED]');
  if(argv[0]!=='--state'||argv[2]!=='--repository'||
     (argv.length===6&&argv[4]!=='--acceptance'))
    fail('Exact Codex MCP options required');
  const state=argv[1],repository=argv[3];
  if(!isAbsolute(state??'')||!isAbsolute(repository??'')||
     typeof state!=='string'||typeof repository!=='string'||
     state.includes('\0')||repository.includes('\0'))
    fail('Absolute State and repository required');
  const acceptance=argv.length===6?argv[5]:'PROTECTED_REQUIRED';
  if(!['LOCAL_ONLY','PROTECTED_REQUIRED'].includes(acceptance))
    fail('Invalid acceptance policy');
  return {state:resolve(state),repository:resolve(repository),acceptance};
}
const inside=(root,candidate)=>{
  const rel=relative(root,candidate);
  return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));
};
async function context(config){
  const root=await realpath(config.repository);
  // State must not live under the source root. Refuse aliases of the root too.
  let target=config.state;
  try {target=await realpath(target);} catch {
    try {target=resolve(await realpath(resolve(target,'..')),target.split(/[\\/]/).at(-1));}
    catch {}
  }
  if(inside(root,target))fail('CodeFleet State must stay outside the target repository');
  return Object.freeze({...config,root});
}
const toolDefinitions=Object.freeze([
  {name:'codefleet_goal_start',description:
    'Record one natural-language development Objective against this prebound repository. No model Turn or source writes. Acceptance policy is set by the human-controlled MCP launch, not tool arguments.',
   inputSchema:{type:'object',additionalProperties:false,
     required:['goal'],properties:{goal:{type:'string',minLength:10,maxLength:4000}}}},
  {name:'codefleet_goal_status',description:
    'Read the persisted Task plan, current DAG, bounded continuation, exact review requests and delivered-tree Local acceptance. Never executes or grants.',
   inputSchema:{type:'object',additionalProperties:false,
     required:['taskId'],properties:{taskId:{type:'string'}}}},
  {name:'codefleet_draft_submit',description:
    'Submit this session model-authored structured Draft for existing Task revision. Validation only; never authorizes execution or files.',
   inputSchema:{type:'object',additionalProperties:false,
     required:['taskId','revision','proposal'],properties:{
       taskId:{type:'string'},revision:{type:'integer',minimum:1},
       proposal:{type:'object'}}}},
  {name:'codefleet_goal_prepare',description:
    'Compile a VALIDATED Task into a pending, unapproved Workflow/DAG. No model call, grant or source edit.',
   inputSchema:{type:'object',additionalProperties:false,
     required:['taskId'],properties:{taskId:{type:'string'}}}},
  {name:'codefleet_fileset_propose',description:
    'Submit a bounded model-authored source Fileset for one dependency-ready WorkItem at exact Task revision. REVIEW ONLY; cannot apply files, tests or grant approval.',
   inputSchema:{type:'object',additionalProperties:false,
     required:['taskId','revision','itemId','files'],properties:{
       taskId:{type:'string'},revision:{type:'integer',minimum:1},
       itemId:{type:'string'},files:{type:'array',minItems:1,maxItems:20,
         items:{type:'object',additionalProperties:false,required:['path','content','baseSha256'],
           properties:{path:{type:'string'},content:{type:'string'},
             baseSha256:{type:['string','null']}}}}}}}
]);
const instructions=[
  'PROPOSAL-ONLY CodeFleet adapter in the existing Codex session.',
  'Read goal_status after each change. Never infer user consent from a tool call.',
  'These tools do not execute a model, approve files, apply patches, run tests,',
  'replay attempts, change protection or declare completion.',
  'Exact Local fileset and test approval must occur separately via trusted',
  'objective local-files-review/accept and local-review/accept commands.',
  'Only current independent delivered-tree acceptance COMPLETE_LOCAL is Local',
  'completion; it is UNPROTECTED, not Host Live or protected verification.',
  'The same-account MCP process cannot authenticate a human Operator.'
].join(' ');
const summarize=report=>({
  kind:'CODEFLEET_CODEX_GOAL_VIEW_V1',taskId:report.taskId,
  revision:report.revision,contractKind:report.contractKind??null,
  status:report.state,workflowHash:report.workflowHash??null,
  plan:report.plan?{
    intent:report.plan.intent??null,
    probe:report.plan.probe?{
      root:report.plan.probe.root??null,
      state:report.plan.probe.state??null,
      base:report.plan.probe.base??null,
      probeHash:report.plan.probe.probeHash??null
    }:null,
    draft:report.plan.draft??null,
    validation:report.plan.validation??null
  }:null,
  workItems:report.bootstrap?.items?.map(item=>({
    id:item.id,kind:item.kind,state:item.state,
    waitingOn:item.waitingOn,fileset:item.fileset?.state??null
  }))??[],
  continuation:report.continuation??null,
  nextActions:report.nextActions??null,
  nextAction:report.nextAction??null,
  acceptance:report.acceptance??null,complete:report.complete===true,
  executionGranted:false,automaticReplay:false,modelTurnStarted:false,
  protectedVerification:report.protectedVerification??'NOT_ESTABLISHED',
  authority:'HOST_MODEL_PROPOSAL_ONLY'
});
// Surface the persisted creation-time policy, not a model-requested level.
async function show(store,id){
  const report=await taskReport(store,id);
  const persisted=task(store,id);
  return {...summarize(report),
    acceptancePolicy:persisted.acceptanceMode??'PROTECTED_REQUIRED'};
}
async function useStore(config,readOnly,action){
  const ctx=await context(config);
  // Only configured project scope is accessible, even if State contains
  // unrelated Tasks; never accept repository directories in tool JSON.
  const store=new Store(config.state,{readOnly});
  try{return await action(store,ctx);}
  finally{store.close();}
}
async function scoped(store,ctx,taskId){
  if(typeof taskId!=='string'||!TASK.test(taskId))
    fail('Valid persisted Task ID required');
  const current=task(store,taskId);
  if(await realpath(current.repo)!==ctx.root)
    fail('Task is outside the bound Codex MCP repository');
  return current;
}
function argsFor(name,value){
  if(name==='codefleet_goal_start'){
    exact(value,['goal'],'goal');
    if(typeof value.goal!=='string'||value.goal.trim().length<10||
       value.goal.length>4000)fail('Bounded natural-language Goal required');
  }else if(name==='codefleet_goal_status'||name==='codefleet_goal_prepare'){
    exact(value,['taskId'],'task');
  }else if(name==='codefleet_draft_submit'){
    exact(value,['taskId','revision','proposal'],'draft');
    if(!Number.isSafeInteger(value.revision)||value.revision<1||!plain(value.proposal))
      fail('Exact Task revision and Draft required');
  }else if(name==='codefleet_fileset_propose'){
    exact(value,['taskId','revision','itemId','files'],'fileset');
    if(!Number.isSafeInteger(value.revision)||value.revision<1||
       typeof value.itemId!=='string'||!Array.isArray(value.files)||
       !value.files.length||value.files.length>20||
       value.files.some(f=>!plain(f)||typeof f.path!=='string'||
         typeof f.content!=='string'||Buffer.byteLength(f.content)>64000||
         !(f.baseSha256===null||typeof f.baseSha256==='string')||
         Object.keys(f).sort().join(',')!=='baseSha256,content,path'))
      fail('Bounded source Fileset with exact base digests required');
  }else fail('Unsupported CodeFleet MCP tool');
}
async function invokeTool(config,name,value){
  argsFor(name,value);
  if(name==='codefleet_goal_start')
    return useStore(config,false,async(store,ctx)=>{
      enableTasks(store);
      const record=await createTask(store,ctx.root,value.goal,{
        localExisting:true,acceptanceMode:ctx.acceptance,
        maxAttempts:3,timeoutSeconds:300,attemptBudgetUsd:1
      });
      return show(store,record.id);
    });
  const readOnly=name==='codefleet_goal_status';
  return useStore(config,readOnly,async(store,ctx)=>{
    await scoped(store,ctx,value.taskId);
    if(name==='codefleet_goal_status')
      return show(store,value.taskId);
    if(name==='codefleet_draft_submit'){
      await submitTaskDraft(store,value.taskId,{
        revision:value.revision,proposal:value.proposal});
      return show(store,value.taskId);
    }
    if(name==='codefleet_goal_prepare'){
      const prepared=await prepareTask(store,value.taskId);
      return {...(await show(store,value.taskId)),
        prepared:true,workflowApproved:false,executionGranted:false,
        preparedTaskRevision:prepared.revision};
    }
    const proposal=await submitBootstrapFiles(store,value.taskId,{
      revision:value.revision,itemId:value.itemId,files:value.files});
    return {...(await show(store,value.taskId)),
      approvalRequest:proposal.approvalRequest??null,
      applicationPerformed:false,executionGranted:false};
  });
}
const failTool=error=>{
  const detail=String(error?.message??'');
  const kind=/revision|stale|changed|drift/i.test(detail)?'STALE_SCOPE':
    /approv|permission|grant|dependency|eligible|waiting/i.test(detail)
      ?'REVIEW_OR_DEPENDENCY_REQUIRED':'INVALID_OR_BLOCKED';
  return {isError:true,content:[{type:'text',text:JSON.stringify({
    code:'CODEFLEET_REQUEST_BLOCKED',reason:kind,
    executionGranted:false,modelTurnStarted:false,replayAllowed:false,
    next:'Inspect codefleet_goal_status and the exact current review scope'
  })}]};
};
const rpcError=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
async function handle(message,config){
  if(!plain(message)||message.jsonrpc!=='2.0'||
     typeof message.method!=='string')return rpcError(null,-32600,'Invalid JSON-RPC request');
  const hasId=own(message,'id');
  if(!hasId)return null; // MCP client notifications never trigger side effects
  const id=message.id;
  if(!(typeof id==='string'&&id.length<=128||Number.isSafeInteger(id)))
    return rpcError(null,-32600,'Invalid JSON-RPC ID');
  if(message.method==='initialize'){
    return {jsonrpc:'2.0',id,result:{
      protocolVersion:VERSION,capabilities:{tools:{listChanged:false}},
      serverInfo:{name:'codefleet-codex',version:'0.2.0'},
      instructions
    }};
  }
  if(message.method==='ping')return {jsonrpc:'2.0',id,result:{}};
  if(message.method==='tools/list')
    return {jsonrpc:'2.0',id,result:{tools:toolDefinitions}};
  if(message.method!=='tools/call')
    return rpcError(id,-32601,'Unsupported MCP method');
  if(!plain(message.params)||typeof message.params.name!=='string'||
     !plain(message.params.arguments))
    return rpcError(id,-32602,'Invalid MCP tool request');
  try{
    const result=await invokeTool(config,message.params.name,message.params.arguments);
    const rendered=JSON.stringify(result);
    if(Buffer.byteLength(rendered)>MAX_REPLY)fail('Tool result size limit');
    return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:rendered}]}};
  }catch(error){return {jsonrpc:'2.0',id,result:failTool(error)};}
}
export async function serveCodexMcp(argv=process.argv.slice(2),input=process.stdin,output=process.stdout){
  const config=configured(argv);
  // Do not create a State directory on initialization. Validate bound
  // repository and state location first, outside the tool payload.
  await context(config);
  const decoder=new StringDecoder('utf8');
  let buffer='',discard=false;
  const send=response=>{
    if(response!==null)output.write(JSON.stringify(response)+'\n');
  };
  for await(const bytes of input){
    buffer+=decoder.write(bytes);
    let end;
    while((end=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,end).replace(/\r$/,'');
      buffer=buffer.slice(end+1);
      if(discard){discard=false;continue;}
      if(!line.trim())continue;
      if(Buffer.byteLength(line)>MAX_LINE){send(rpcError(null,-32600,'MCP request too large'));continue;}
      let message;
      try{message=JSON.parse(line);}
      catch{send(rpcError(null,-32700,'Malformed JSON-RPC'));continue;}
      send(await handle(message,config));
    }
    if(Buffer.byteLength(buffer)>MAX_LINE){
      buffer='';discard=true;
      send(rpcError(null,-32600,'MCP request too large'));
    }
  }
  if(!discard&&buffer.trim())send(rpcError(null,-32700,'Unterminated JSON-RPC line'));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  serveCodexMcp().catch(()=>{process.stderr.write(
    'CodeFleet MCP startup blocked: verify bound repository and external State path\n');
    process.exitCode=2;});
}
