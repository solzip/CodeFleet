#!/usr/bin/env node
// P2 synthetic child-process transport. The child is pinned to the in-repo
// fake App Server, launched by Node. There is intentionally NO native-Codex
// executable argument, no live model dispatch path and no approval CLI.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createP2ReadOnlyProtocol, createP2OfflineJsonlReader } from './p2-readonly-offline.mjs';
import { P2_INTENT_FILE, readP2OfflineIntent } from './p2-one-shot-offline-intent.mjs';
import { sha256File } from './p1-appserver-handshake.mjs';

const PROTOCOL=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const SYNTHETIC_SERVER=fileURLToPath(new URL('./p2-synthetic-appserver.mjs',import.meta.url));
export const P2_SYNTHETIC_MARKER='p2-synthetic-launch-reservation.json';
export const P2_SYNTHETIC_TRACE='p2-synthetic-redacted-trace.jsonl';
export const P2_SYNTHETIC_RESULT='p2-synthetic-result.json';
const MAX_TRACE=16384,MAX_RESULT=8192,MAX_MARKER=2048;
const SCENARIOS=new Set([
  'success','metadata','tool','server_request','wrong_turn','unknown_notification',
  'bad_sandbox','trailing','incomplete','nonzero','duplicate','stderr','hang',
  'early_exit','bad_output','oversized'
]);
const HASH=/^[A-F0-9]{64}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const safeMethod=method=>typeof method==='string'&&/^[A-Za-z0-9/_-]{1,80}$/.test(method) ?
  method:'REDACTED_METHOD';
const limitedObject=(v,keys)=>v!==null && typeof v==='object' && !Array.isArray(v) &&
  Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export class P2SyntheticTransportError extends Error {
  constructor(reason){super(reason);this.name='P2SyntheticTransportError';this.replayAllowed=false;this.effectStatus='UNVERIFIED';}
}
const deny=reason=>{throw new P2SyntheticTransportError(reason)};
const noSecretMeta=(direction,message)=>{
  if(Object.hasOwn(message,'method'))return {
    direction,kind:'method',method:safeMethod(message.method),
    ...(Number.isInteger(message.id)?{id:message.id}:{})
  };
  return {direction,kind:'response',
    id:Number.isInteger(message.id)?message.id:null};
};
async function strictRead(root,filename,max){
  const path=join(root,filename);
  const stat=await lstat(path).catch(()=>deny('P2 synthetic evidence missing'));
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max)
    deny('P2 synthetic evidence file type/size invalid');
  const bytes=await readFile(path);
  if(bytes.length<1||bytes.length>max)deny('P2 synthetic evidence oversized');
  return bytes;
}
const markerFields=['kind','mode','model','offlineIntentSha256','protocolSha256',
  'fakeServerSha256','timeoutMs','createdAtMs','ownerApproval',
  'executionAuthorized','replayAllowed'];
const MARKER_KIND='P2_SYNTHETIC_LAUNCH_RESERVED_NO_NATIVE_CODEX';
function checkMarker(marker,intent){
  return limitedObject(marker,markerFields) &&
    marker.kind===MARKER_KIND && marker.mode==='SYNTHETIC_ONLY' &&
    marker.model===intent.model && marker.offlineIntentSha256===intent.intentSha256 &&
    marker.protocolSha256===intent.protocolSha256 &&
    typeof marker.fakeServerSha256==='string' && HASH.test(marker.fakeServerSha256) &&
    Number.isInteger(marker.timeoutMs) && marker.timeoutMs>=500 && marker.timeoutMs<=90000 &&
    Number.isSafeInteger(marker.createdAtMs) && marker.createdAtMs>0 &&
    marker.ownerApproval==='NOT_GRANTED' &&
    marker.executionAuthorized===false && marker.replayAllowed===false;
}
async function fsyncExclusive(path,bytes){
  const handle=await open(path,'wx',0o600).catch(()=>deny('P2 synthetic process reservation already occupied'));
  try{await handle.writeFile(bytes);await handle.sync()}finally{await handle.close()}
}
export async function runP2SyntheticTransport({root,model,scenario='success',timeoutMs=5000}={}){
  if(typeof root!=='string'||typeof model!=='string'||!SCENARIOS.has(scenario)||
      !Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>90000)
    deny('P2 synthetic run requires valid bounded inputs');
  const intent=await readP2OfflineIntent(root);
  if(intent.model!==model||intent.ownerApproval!=='NOT_GRANTED'||
      intent.executionAuthorized!==false||intent.replayAllowed!==false)
    deny('P2 offline intent/Model mismatch or invalid authority');
  if((await sha256File(PROTOCOL))!==intent.protocolSha256)
    deny('P2 protocol source changed after durable intent');
  if((await readdir(root)).slice().sort().join('|')!==P2_INTENT_FILE)
    deny('P2 synthetic fixture not pristine; no replay');
  const marker={
    kind:MARKER_KIND,mode:'SYNTHETIC_ONLY',model,
    offlineIntentSha256:intent.intentSha256,protocolSha256:intent.protocolSha256,
    fakeServerSha256:await sha256File(SYNTHETIC_SERVER),
    timeoutMs,createdAtMs:Date.now(),ownerApproval:'NOT_GRANTED',
    executionAuthorized:false,replayAllowed:false
  };
  if(!checkMarker(marker,intent))deny('P2 synthetic process marker invalid');
  // No process may be created until the exclusive launch reservation is synced.
  await fsyncExclusive(join(root,P2_SYNTHETIC_MARKER),
    Buffer.from(JSON.stringify(marker)+'\n','utf8'));
  const protocol=createP2ReadOnlyProtocol({cwd:root,model});
  const parser=createP2OfflineJsonlReader(protocol);
  const trace=[];
  let stdoutBytes=0,stderrBytes=0,failure=null,closed=false,exitCode=null,signal=null;
  let child,deadline,hardStop,finish;
  const ended=new Promise(resolveClose=>{finish=resolveClose});
  const stop=reason=>{
    if(!failure)failure=reason;
    try{child?.kill('SIGKILL')}catch{/* Do not retry or mask the first failure. */}
  };
  try{
    // EXACT FIXED SYNTHETIC TARGET: never spawn the binary pinned by intent.
    child=spawn(process.execPath,[SYNTHETIC_SERVER],{
      cwd:root,windowsHide:true,shell:false,
      stdio:['pipe','pipe','pipe'],
      env:{CODEFLEET_P2_FAKE_SCENARIO:scenario}
    });
    child.once('error',()=>stop('P2 synthetic child process spawn failed'));
    child.once('close',(code,closeSignal)=>{
      closed=true;exitCode=code;signal=closeSignal;finish();
    });
    for(const stream of [child.stdin,child.stdout,child.stderr])
      stream.on('error',()=>stop('P2 synthetic process stream failure'));
    const write=message=>{
      trace.push(noSecretMeta('out',message));
      const line=JSON.stringify(message)+'\n';
      if(!child.stdin.write(line,'utf8'))
        stop('P2 synthetic backpressure unexpected');
    };
    child.stdout.on('data',chunk=>{
      if(failure)return;
      stdoutBytes+=chunk.length;
      try{
        // Trace only response IDs and method names. Never persist payloads.
        // The parser itself independently imposes 1 MiB/128 frame limits.
        const responses=chunk.toString('utf8').split(/\r?\n/)
          .filter(Boolean);
        for(const line of responses){
          try{const message=JSON.parse(line);
            trace.push(noSecretMeta('in',message));}
          catch{trace.push({direction:'in',kind:'unparseable'})}
        }
        for(const response of parser.push(chunk))write(response);
        if(protocol.completed&&!child.stdin.writableEnded)child.stdin.end();
      }catch{stop('P2 synthetic protocol rejected stream')}
    });
    child.stderr.on('data',chunk=>{
      stderrBytes+=chunk.length;
      stop('P2 synthetic stderr is not approved');
    });
    for(const message of protocol.start())write(message);
    deadline=setTimeout(()=>stop('P2 synthetic process deadline exceeded'),timeoutMs);
    hardStop=setTimeout(()=>{
      if(!closed)stop('P2 synthetic process close unconfirmed');
      finish();
    },timeoutMs+2500);
    await ended;
    if(!closed&&!failure)failure='P2 synthetic process close unconfirmed';
    if(!failure){
      try{parser.close({exitCode,signal})}
      catch{failure='P2 synthetic process invalid termination or trailing frame'}
    }
  }catch{
    failure=failure??'P2 synthetic process launch/monitor failure';
    try{child?.kill('SIGKILL')}catch{}
  }finally{
    clearTimeout(deadline);clearTimeout(hardStop);
  }
  const passed=failure===null&&closed&&exitCode===0&&signal===null&&stderrBytes===0;
  const tracePayload=trace.map(x=>JSON.stringify(x)).join('\n')+(trace.length?'\n':'');
  if(Buffer.byteLength(tracePayload)>MAX_TRACE)
    deny('P2 synthetic trace over maximum; reservation remains occupied');
  const record={
    status:passed?'P2_SYNTHETIC_PROCESS_MATCHED_NOT_LIVE':'P2_SYNTHETIC_PROCESS_FAILED',
    passed,mode:'SYNTHETIC_ONLY',protocolVersion:'rust-v0.167.0',
    model,stdoutBytes,stderrBytes,termination:{confirmed:closed,code:exitCode,signal},
    traceSha256:hash(Buffer.from(tracePayload,'utf8')),
    offlineIntentSha256:intent.intentSha256,ownerApproval:'NOT_GRANTED',
    nativeCodexStarted:false,modelTurnsActuallyRun:0,simulationOnly:true,
    usageStatus:'UNKNOWN',executionAuthorized:false,replayAllowed:false,
    hostLiveVerified:false,appServerExecutionAuthenticated:false,
    error:passed?null:'SYNTHETIC_REVIEW_REQUIRED'
  };
  const resultPayload=JSON.stringify(record,null,2)+'\n';
  if(Buffer.byteLength(resultPayload)>MAX_RESULT)
    deny('P2 synthetic result oversized; reservation remains occupied');
  // Artifacts are exclusive-create. No retry, overwrite or cleanup on failure.
  await fsyncExclusive(join(root,P2_SYNTHETIC_TRACE),Buffer.from(tracePayload));
  await fsyncExclusive(join(root,P2_SYNTHETIC_RESULT),Buffer.from(resultPayload));
  return Object.freeze({...record,resultSha256:hash(Buffer.from(resultPayload)),
    evidenceReviewRequired:true});
}
export async function reviewP2SyntheticEvidence(root){
  const intent=await readP2OfflineIntent(root);
  const expected=[P2_INTENT_FILE,P2_SYNTHETIC_MARKER,
    P2_SYNTHETIC_TRACE,P2_SYNTHETIC_RESULT].sort();
  if((await readdir(root)).sort().join('|')!==expected.join('|'))
    deny('P2 synthetic evidence directory not exact');
  const [markerBytes,traceBytes,resultBytes]=await Promise.all([
    strictRead(root,P2_SYNTHETIC_MARKER,MAX_MARKER),
    strictRead(root,P2_SYNTHETIC_TRACE,MAX_TRACE),
    strictRead(root,P2_SYNTHETIC_RESULT,MAX_RESULT)
  ]);
  let marker,result;
  try{marker=JSON.parse(markerBytes);result=JSON.parse(resultBytes)}
  catch{deny('P2 synthetic evidence JSON invalid')}
  if(!checkMarker(marker,intent)||
      !markerBytes.equals(Buffer.from(JSON.stringify(marker)+'\n')))
    deny('P2 synthetic marker mismatch');
  if(marker.fakeServerSha256!==await sha256File(SYNTHETIC_SERVER))
    deny('P2 synthetic server source changed');
  if(!result||typeof result!=='object'||result.mode!=='SYNTHETIC_ONLY'||
      result.model!==intent.model||result.offlineIntentSha256!==intent.intentSha256||
      result.traceSha256!==hash(traceBytes)||result.ownerApproval!=='NOT_GRANTED'||
      result.nativeCodexStarted!==false||result.modelTurnsActuallyRun!==0||
      result.simulationOnly!==true||result.executionAuthorized!==false||
      result.replayAllowed!==false||result.hostLiveVerified!==false||
      result.appServerExecutionAuthenticated!==false||result.usageStatus!=='UNKNOWN'||
      !['P2_SYNTHETIC_PROCESS_MATCHED_NOT_LIVE','P2_SYNTHETIC_PROCESS_FAILED'].includes(result.status)||
      result.passed!==(result.status==='P2_SYNTHETIC_PROCESS_MATCHED_NOT_LIVE'))
    deny('P2 synthetic result cannot be accepted');
  let events;
  try{events=traceBytes.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line))}
  catch{deny('P2 synthetic JSONL evidence invalid')}
  if(events.length<1||events.length>160||
      events.some(e=>!limitedObject(e,['direction','kind','method','id']) &&
        !limitedObject(e,['direction','kind','method']) &&
        !limitedObject(e,['direction','kind','id']) &&
        !limitedObject(e,['direction','kind'])))
    deny('P2 synthetic trace contains unapproved fields');
  if(!resultBytes.equals(Buffer.from(JSON.stringify(result,null,2)+'\n')))
    deny('P2 synthetic result bytes noncanonical');
  return Object.freeze({
    status:'P2_SYNTHETIC_EVIDENCE_STRUCTURALLY_CONSISTENT_NOT_LIVE',
    passed:result.passed,traceSha256:hash(traceBytes),
    resultSha256:hash(resultBytes),notificationOrResponseEvents:events.length,
    ownerApproval:'NOT_GRANTED',executionAuthorized:false,
    hostLiveVerified:false,modelTurnsActuallyRun:0,
    provenanceAuthenticated:false,ownerReviewRequired:true
  });
}
export function main(args=process.argv.slice(2)){
  if(!Array.isArray(args)||args.length!==0)
    deny('P2 synthetic transport has no execution flags or model CLI');
  return {
    status:'P2_SYNTHETIC_HARNESS_LIBRARY_ONLY',realCodexRunnable:false,
    nativeCodexStarted:false,modelTurnsActuallyRun:0,
    ownerApproval:'NOT_GRANTED',executionAuthorized:false,
    hostLiveVerified:false,replayAllowed:false
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{process.stdout.write(JSON.stringify(main())+'\n')}
  catch{process.stdout.write(JSON.stringify({
    status:'P2_SYNTHETIC_HARNESS_BLOCKED',nativeCodexStarted:false,
    modelTurnsActuallyRun:0,executionAuthorized:false,
    ownerApproval:'NOT_GRANTED',replayAllowed:false
  })+'\n');process.exitCode=2}
}
