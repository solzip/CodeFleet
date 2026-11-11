#!/usr/bin/env node
// P2 one-Turn protocol/lifecycle candidate: SYNTHETIC TESTS ONLY.
// Public --execute must not spawn native Codex: static environment strings
// are not independent Owner authentication or a bounded spending grant.
// No login changes, retries, public Operator admission or live cost grant.
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { lstat, open, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectP2NativeCandidate, P2_NATIVE_MANIFEST,
  P2_NATIVE_ARTIFACTS } from './p2-native-preflight.mjs';
import { createP2ReadOnlyProtocol,createP2OfflineJsonlReader } from './p2-readonly-offline.mjs';
import { sha256File } from './p1-appserver-handshake.mjs';

export const P2_LIVE_ACK_ENV='CODEFLEET_P2_ONE_TURN_APPROVED';
export const P2_LIVE_ACK_VALUE='P2_ONE_READONLY_TURN_EXPLICITLY_APPROVED';
export const P2_COST_ACK_ENV='CODEFLEET_P2_UNKNOWN_COST_ACK';
export const P2_COST_ACK_VALUE='I_ACCEPT_UNKNOWN_COST_FOR_ONE_P2_TURN';
export const P2_NATIVE_RESERVATION='p2-native-launch-reservation.json';
export const P2_NATIVE_TRANSCRIPT='p2-native-redacted-transcript.jsonl';
export const P2_NATIVE_RESULT='p2-native-result.json';

const SELF=fileURLToPath(import.meta.url);
const PROTOCOL=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const HASH=/^[A-F0-9]{64}$/;
const MAX_TRACE=16384,MAX_RESULT=8192,MAX_MARKER=2048;
const PERMIT=Symbol('p2-private-owner-ack');
// Fixed synthetic fixture sentinels, not a genuine native Codex executable.
const SYNTHETIC_ONLY_EXECUTABLES=new Set([
  'THIS_IS_A_FAKE_CODEX_EXE_FOR_NO_LIVE_TESTS',
  'FAKE_EXECUTABLE_REVIEW_ONLY'
]);
// The fake child requires no provider account auth or inherited Node options.
const SYNTHETIC_ENV_ALLOWLIST=[
  'SystemRoot','WINDIR','PATH','Path','TEMP','TMP','TMPDIR'
];
function syntheticChildEnv(){
  const env={};
  for(const key of SYNTHETIC_ENV_ALLOWLIST)
    if(Object.hasOwn(process.env,key))env[key]=process.env[key];
  return env;
}
const digest=value=>createHash('sha256').update(value).digest('hex').toUpperCase();
const safeMethod=method=>typeof method==='string'&&
  /^[A-Za-z0-9/_-]{1,80}$/.test(method) ? method:'REDACTED_METHOD';
const describe=(direction,message)=>{
  if(!message||typeof message!=='object'||Array.isArray(message))
    return {direction,kind:'invalid-json-type'};
  if(Object.hasOwn(message,'method'))
    return {direction,kind:'method',method:safeMethod(message.method),
      ...(Number.isInteger(message.id)?{id:message.id}:{})};
  return {direction,kind:'response',
    id:Number.isInteger(message.id)?message.id:null};
};
export class P2NativeTurnError extends Error {
  constructor(message){super(message);this.name='P2NativeTurnError';
    this.replayAllowed=false;this.effectStatus='UNVERIFIED';}
}
const deny=reason=>{throw new P2NativeTurnError(reason)};
const FIELDS=new Map([
  ['--codex-exe','executable'],['--fixture','fixtureRoot'],
  ['--codex-sha256','expectedCodexSha256'],
  ['--preflight-sha256','expectedClientSha256'],
  ['--protocol-sha256','expectedProtocolSha256'],
  ['--manifest-sha256','expectedManifestSha256'],
  ['--executor-sha256','expectedExecutorSha256'],
  ['--model','model']
]);
function parse(argv){
  if(!Array.isArray(argv)||argv.length===0)
    return {dryRun:true};
  if(argv[0]!=='--execute')deny('P2 native CLI is inspection-only until explicit --execute');
  if(argv[1]!=='--ack-unknown-cost')
    deny('P2 unknown-cost risk needs a separate explicit one-Turn acknowledgement');
  const opts={dryRun:false};
  for(let i=2;i<argv.length;i+=2){
    const key=FIELDS.get(argv[i]);
    if(!key||i+1>=argv.length||Object.hasOwn(opts,key))
      deny('P2 native command has unknown, repeated or missing flag');
    opts[key]=argv[i+1];
  }
  if(Object.keys(opts).length!==FIELDS.size+1)
    deny('P2 native command requires every exact model and source identity');
  for(const field of ['expectedCodexSha256','expectedClientSha256',
    'expectedProtocolSha256','expectedManifestSha256','expectedExecutorSha256'])
    if(typeof opts[field]!=='string'||!HASH.test(opts[field]))
      deny('P2 native command has an invalid exact SHA-256');
  return opts;
}
async function writeExclusive(path,contents,label){
  const handle=await open(path,'wx',0o600).catch(()=>deny('P2 '+label+' already occupied; no replay'));
  try{await handle.writeFile(contents);await handle.sync()}
  finally{await handle.close()}
}
async function strictRead(path,max){
  const st=await lstat(path).catch(()=>deny('P2 Evidence missing'));
  if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>max)
    deny('P2 Evidence type/size invalid');
  const contents=await readFile(path);
  if(contents.length<1||contents.length>max)
    deny('P2 Evidence bytes invalid');
  return contents;
}
// The library's injected test seam is not an authenticated execution right.
async function requireSyntheticOnly(options,deps){
  if(typeof deps?.spawnImpl!=='function')
    deny('P2_NATIVE_LIVE_BLOCKED: static acknowledgements do not authorize a native model Turn');
  const bytes=await strictRead(options.executable,128);
  if(!SYNTHETIC_ONLY_EXECUTABLES.has(bytes.toString('utf8')))
    deny('P2 synthetic adapter refuses non-test executable bytes');
}
const sameFiles=(observed,expected)=>
  observed.slice().sort().join('|')===expected.slice().sort().join('|');
function checkedPermit(options,env){
  if(env?.[P2_LIVE_ACK_ENV]!==P2_LIVE_ACK_VALUE||
     env?.[P2_COST_ACK_ENV]!==P2_COST_ACK_VALUE)
    deny('P2 separate owner acknowledgement and unknown-cost risk acceptance are missing');
  return Object.freeze({[PERMIT]:true,model:options.model,
    executableSha256:options.expectedCodexSha256,
    fixtureManifestSha256:options.expectedManifestSha256,
    executorSha256:options.expectedExecutorSha256});
}
async function boundedChild(options,scope,deps={}){
  const {root,executable,model,timeoutMs,intentMarker}=scope;
  const protocol=createP2ReadOnlyProtocol({cwd:root,model});
  const parser=createP2OfflineJsonlReader(protocol);
  const trace=[{direction:'internal',kind:'one-shot-reserved'}];
  const decoder=new StringDecoder('utf8');
  let pending='',stdoutBytes=0,stderrBytes=0,errorCode=null;
  let closeConfirmed=false,exitCode=null,exitSignal=null,spawnObserved=false;
  let nativeLaunchAttempted=false,turnSubmitted=0,forced=false;
  let child,deadline,hardStop,finish;
  let ended=false;
  const complete=new Promise(resolveClosed=>{finish=()=>{if(!ended){ended=true;resolveClosed()}}});
  const fail=reason=>{
    if(!errorCode)errorCode=reason;
    if(child){
      forced=true;
      try{child.kill('SIGKILL')}catch{}
    }
  };
  const pushOut=message=>{
    if(!['initialize','initialized','thread/start','turn/start'].includes(message?.method))
      deny('P2 unapproved outbound method');
    if(message.method==='turn/start')turnSubmitted++;
    if(turnSubmitted>1)deny('P2 more than one Turn dispatch attempted');
    trace.push(describe('out',message));
    if(!child?.stdin?.write(JSON.stringify(message)+'\n','utf8'))
      fail('WRITE_BACKPRESSURE_OR_PIPE_ERROR');
  };
  try{
    // The native binary and protocol identities are rechecked *after*
    // the permanent reservation, immediately before one spawn attempt.
    if(await sha256File(executable)!==options.expectedCodexSha256||
       await sha256File(PROTOCOL)!==options.expectedProtocolSha256||
       await sha256File(SELF)!==options.expectedExecutorSha256)
      deny('P2 identity changed after one-shot reservation');
    // Only synthetic injection. Native spawn has no production fallback.
    const spawnImpl=deps.spawnImpl;
    child=spawnImpl(executable,
      ['app-server','--listen','stdio://','--strict-config'],{
      cwd:root,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],
      // Synthetic-only: no inherited Host credentials or NODE_OPTIONS.
      env:syntheticChildEnv()
    });
    child.once('spawn',()=>{spawnObserved=true});
    child.once('error',()=>fail('NATIVE_PROCESS_ERROR'));
    child.once('close',(code,signal)=>{
      closeConfirmed=true;exitCode=code;exitSignal=signal;finish();
    });
    for(const stream of [child.stdin,child.stdout,child.stderr])
      stream?.on?.('error',()=>fail('NATIVE_STREAM_ERROR'));
    child.stdout.on('data',chunk=>{
      if(errorCode)return;
      stdoutBytes+=chunk.length;
      try{
        const lines=(pending+decoder.write(chunk)).split(/\r?\n/);
        pending=lines.pop()??'';
        for(const line of lines){
          if(!line)continue;
          try{trace.push(describe('in',JSON.parse(line)))}
          catch{trace.push({direction:'in',kind:'unparseable'})}
        }
        for(const outgoing of parser.push(chunk))pushOut(outgoing);
        if(protocol.completed&&!child.stdin.writableEnded)child.stdin.end();
      }catch{fail('P2_PROTOCOL_REJECTED')}
    });
    child.stderr.on('data',chunk=>{
      stderrBytes+=chunk.length;
      fail('P2_STDERR_NOT_APPROVED');
    });
    for(const message of protocol.start())pushOut(message);
    deadline=setTimeout(()=>fail('P2_EXECUTION_DEADLINE'),timeoutMs);
    hardStop=setTimeout(()=>{
      if(!closeConfirmed)fail('P2_CLOSE_UNCONFIRMED');
      finish();
    },timeoutMs+2500);
    await complete;
    pending+=decoder.end();
    if(pending.trim())trace.push({direction:'in',kind:'unterminated'});
    if(!closeConfirmed&&!errorCode)errorCode='P2_CLOSE_UNCONFIRMED';
    if(!errorCode){
      try{parser.close({exitCode,signal:exitSignal})}
      catch{errorCode='P2_TERMINATION_OR_TRAILING_FRAME_REJECTED'}
    }
  }catch{
    if(!errorCode)errorCode='P2_LAUNCH_OR_IDENTITY_UNVERIFIED';
    if(child)try{child.kill('SIGKILL');forced=true}catch{}
  }finally{clearTimeout(deadline);clearTimeout(hardStop)}
  const passed=!errorCode&&closeConfirmed&&exitCode===0&&exitSignal===null&&
    stderrBytes===0&&!forced&&protocol.completed&&turnSubmitted===1;
  const traceBytes=Buffer.from(trace.map(x=>JSON.stringify(x)).join('\n')+'\n');
  if(traceBytes.length>MAX_TRACE)
    deny('P2 native trace too large; launch reservation remains occupied');
  const simulated=true;
  const record={
    status:passed?
      'P2_SYNTHETIC_TURN_OBSERVED_NOT_LIVE':'P2_SYNTHETIC_TURN_FAILED',
    passed,protocolVersion:'rust-v0.167.0',model,
    outboundTurnStartCount:turnSubmitted,
    stdoutBytes,stderrBytes,
    termination:{confirmed:closeConfirmed,code:exitCode,signal:exitSignal,forced},
    traceSha256:digest(traceBytes),
    nativeExecutableSha256:options.expectedCodexSha256,
    executorSha256:options.expectedExecutorSha256,
    preflightSha256:options.expectedClientSha256,
    protocolSha256:options.expectedProtocolSha256,
    manifestSha256:options.expectedManifestSha256,
    ownerAcknowledgementObserved:true,
    ownerIdentityIndependentlyAuthenticated:false,
    costExposureAcknowledged:true,costCapEnforced:false,
    costStatus:'UNKNOWN',readOnlyRequested:true,readOnlyEnforced:false,
    appServerExecutionAuthenticated:false,
    nativeLaunchAttempted,syntheticTestAdapter:simulated,
    nativeCodexStarted:false,
    modelTurnsActuallyRun:0,
    p2Accepted:false,hostLiveVerified:false,replayAllowed:false,
    ownerReviewRequired:true,
    error:errorCode? 'P2_FAILED_OR_UNVERIFIED_REVIEW_REQUIRED':null
  };
  const resultBytes=Buffer.from(JSON.stringify(record,null,2)+'\n');
  if(resultBytes.length>MAX_RESULT)
    deny('P2 native result too large; launch reservation remains occupied');
  await writeExclusive(join(root,P2_NATIVE_ARTIFACTS,P2_NATIVE_TRANSCRIPT),
    traceBytes,'transcript');
  await writeExclusive(join(root,P2_NATIVE_ARTIFACTS,P2_NATIVE_RESULT),
    resultBytes,'result');
  return Object.freeze({...record,resultSha256:digest(resultBytes)});
}
async function executeP2NativeOnce(options,permit,deps={}){
  if(permit?.[PERMIT]!==true||permit.model!==options.model||
     permit.executableSha256!==options.expectedCodexSha256||
     permit.executorSha256!==options.expectedExecutorSha256||
     permit.fixtureManifestSha256!==options.expectedManifestSha256)
    deny('P2 trusted one-shot acknowledgement binding missing');
  const inspect=await inspectP2NativeCandidate(options);
  if(inspect.model!==options.model||inspect.nativeCodexSha256!==options.expectedCodexSha256)
    deny('P2 model or native executable changed since preflight');
  if(await sha256File(SELF)!==options.expectedExecutorSha256)
    deny('P2 executor source SHA-256 mismatch');
  const root=resolve(options.fixtureRoot);
  if(!sameFiles(await readdir(root),[P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS]))
    deny('P2 Fixture unexpectedly occupied before reservation');
  const marker={
    kind:'P2_NATIVE_ONE_SHOT_DISPATCH_RESERVED_V1',
    model:inspect.model,
    codexSha256:options.expectedCodexSha256,
    executorSha256:options.expectedExecutorSha256,
    preflightSha256:options.expectedClientSha256,
    protocolSha256:options.expectedProtocolSha256,
    manifestSha256:options.expectedManifestSha256,
    timeoutMs:inspect.timeoutMs,
    createdAtMs:Date.now(),maxTurns:1,
    unknownCostAcknowledged:true,
    approvalEvidence:'OPERATOR_ACK_ONLY_NOT_AUTHENTICATED',
    replayAllowed:false,independentHostVerified:false
  };
  const markerBytes=Buffer.from(JSON.stringify(marker)+'\n');
  if(markerBytes.length>MAX_MARKER)deny('P2 one-shot marker is oversized');
  await writeExclusive(join(root,P2_NATIVE_RESERVATION),markerBytes,
    'native launch reservation');
  return boundedChild(options,{root,executable:resolve(options.executable),
    model:inspect.model,timeoutMs:inspect.timeoutMs,intentMarker:marker},deps);
}
export async function main(argv=process.argv.slice(2),env=process.env,deps={}){
  const options=parse(argv);
  if(options.dryRun)return {
    status:'P2_NATIVE_EXECUTOR_DRY_ONLY',
    liveExecutionApproved:false,nativeCodexStarted:false,
    modelTurnsActuallyRun:0,replayAllowed:false,
    ownerAcknowledgementObserved:false,ownerIdentityIndependentlyAuthenticated:false,
    costCapEnforced:false,costStatus:'UNKNOWN',
    requires:'SEPARATE_OWNER_MODEL_COST_SCOPE_PERMISSION_AND_APPROVAL'
  };
  // Abort before any files are written or native processes are spawned.
  const permit=checkedPermit(options,env);
  await requireSyntheticOnly(options,deps);
  return executeP2NativeOnce(options,permit,deps);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().then(x=>process.stdout.write(JSON.stringify(x)+'\n'))
    .catch(()=>{process.stdout.write(JSON.stringify({
      status:'P2_NATIVE_NOT_AUTHORIZED_OR_FAILED',
      ownerIdentityIndependentlyAuthenticated:false,
      replayAllowed:false,ownerReviewRequired:true,
      nativeExecutionState:'UNKNOWN_UNLESS_PREFLIGHT_BLOCKED',
      costStatus:'UNKNOWN',p2Accepted:false
    })+'\n');process.exitCode=2});
}
