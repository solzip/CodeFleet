#!/usr/bin/env node
// Separate, read-only structural review of synthetic P2 evidence only.
// It does not authenticate OS process provenance, owner identity, sandbox
// enforcement, provider billing, or actual Objective completion.
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createP2NativeManifest,P2_NATIVE_ARTIFACTS,
  P2_NATIVE_MANIFEST } from './p2-native-preflight.mjs';
import { P2_NATIVE_RESERVATION,P2_NATIVE_TRANSCRIPT,
  P2_NATIVE_RESULT } from './p2-native-turn-executor.mjs';
import { sha256File } from './p1-appserver-handshake.mjs';

const SELF=fileURLToPath(import.meta.url);
const EXECUTOR=fileURLToPath(new URL('./p2-native-turn-executor.mjs',import.meta.url));
const PREFLIGHT=fileURLToPath(new URL('./p2-native-preflight.mjs',import.meta.url));
const PROTOCOL=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const SHA=/^[A-F0-9]{64}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const keys=(value,required)=>value&&typeof value==='object'&&
  !Array.isArray(value)&&Object.keys(value).sort().join('|')===
  [...required].sort().join('|');
const same=(a,b)=>process.platform==='win32'?
  resolve(a).toLowerCase()===resolve(b).toLowerCase():
  resolve(a)===resolve(b);
export class P2NativeEvidenceReviewError extends Error {
  constructor(reason){super(reason);this.name='P2NativeEvidenceReviewError';
    this.p2Accepted=false;this.replayAllowed=false;}
}
const deny=message=>{throw new P2NativeEvidenceReviewError(message);};
async function strictRead(file,max){
  const stat=await lstat(file).catch(()=>deny('P2 evidence file absent'));
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max)
    deny('P2 Evidence file type or size invalid');
  const bytes=await readFile(file);
  if(bytes.length<1||bytes.length>max)deny('P2 Evidence bytes invalid');
  return bytes;
}
const markerFields=[
  'kind','model','codexSha256','executorSha256','preflightSha256',
  'protocolSha256','manifestSha256','timeoutMs','createdAtMs','maxTurns',
  'unknownCostAcknowledged','approvalEvidence','replayAllowed',
  'independentHostVerified'
];
const traceKinds=new Set(['method','response','one-shot-reserved',
  'unparseable','unterminated','invalid-json-type']);
export async function reviewP2NativeEvidence({
  executable,fixtureRoot,expectedCodexSha256,expectedClientSha256,
  expectedProtocolSha256,expectedManifestSha256,expectedExecutorSha256,
  expectedReviewerSha256
}={}){
  for(const h of [expectedCodexSha256,expectedClientSha256,
    expectedProtocolSha256,expectedManifestSha256,
    expectedExecutorSha256,expectedReviewerSha256])
    if(typeof h!=='string'||!SHA.test(h))deny('P2 reviewer requires exact SHA-256 identities');
  if(typeof fixtureRoot!=='string'||!isAbsolute(fixtureRoot)||
    !basename(fixtureRoot).toLowerCase().startsWith('codefleet-p2-live-')||
    typeof executable!=='string'||!isAbsolute(executable)||
    basename(executable).toLowerCase()!=='codex.exe')
    deny('P2 reviewer requires canonical private root and native executable');
  const realRoot=await realpath(fixtureRoot).catch(()=>deny('P2 review root missing'));
  const realCodex=await realpath(executable).catch(()=>deny('P2 reviewed native file missing'));
  if(!same(realRoot,fixtureRoot)||!same(realCodex,executable))
    deny('P2 reviewer rejects symlink/Junction alias');
  if(!((await lstat(realRoot)).isDirectory())||
    !((await lstat(realCodex)).isFile()))
    deny('P2 reviewer requires directory and native file');
  const exactRoot=[P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS,
    P2_NATIVE_RESERVATION];
  if((await readdir(realRoot)).sort().join('|')!==exactRoot.sort().join('|'))
    deny('P2 Native result root has unexpected entries');
  const artifacts=join(realRoot,P2_NATIVE_ARTIFACTS);
  const expectedFiles=[P2_NATIVE_TRANSCRIPT,P2_NATIVE_RESULT].sort();
  if(!((await lstat(artifacts)).isDirectory())||
      (await readdir(artifacts)).sort().join('|')!==expectedFiles.join('|'))
    deny('P2 Native Evidence directory is not exact');
  const [manifestBytes,markerBytes,traceBytes,resultBytes]=await Promise.all([
    strictRead(join(realRoot,P2_NATIVE_MANIFEST),8192),
    strictRead(join(realRoot,P2_NATIVE_RESERVATION),2048),
    strictRead(join(artifacts,P2_NATIVE_TRANSCRIPT),16384),
    strictRead(join(artifacts,P2_NATIVE_RESULT),8192)
  ]);
  const paths=[realCodex,PREFLIGHT,PROTOCOL,EXECUTOR,SELF];
  const actualHashes=await Promise.all(paths.map(sha256File));
  const expectedHashes=[
    expectedCodexSha256,expectedClientSha256,expectedProtocolSha256,
    expectedExecutorSha256,expectedReviewerSha256
  ];
  for(let i=0;i<actualHashes.length;i++)
    if(actualHashes[i]!==expectedHashes[i])
      deny('P2 reviewer source/native identity changed');
  if(hash(manifestBytes)!==expectedManifestSha256)
    deny('P2 Manifest identity changed');
  let manifest,marker,result;
  try{
    manifest=JSON.parse(manifestBytes);
    marker=JSON.parse(markerBytes);
    result=JSON.parse(resultBytes);
  }catch{deny('P2 review file JSON malformed')}
  const canonicalManifest=createP2NativeManifest({
    model:manifest.model,expectedCodexSha256,expectedClientSha256,
    expectedProtocolSha256,timeoutMs:manifest.timeoutMs
  });
  if(!manifestBytes.equals(Buffer.from(JSON.stringify(canonicalManifest)+'\n')))
    deny('P2 approved candidate Manifest changed');
  if(!keys(marker,markerFields)||
    marker.kind!=='P2_NATIVE_ONE_SHOT_DISPATCH_RESERVED_V1'||
    marker.model!==manifest.model||
    marker.codexSha256!==expectedCodexSha256||
    marker.executorSha256!==expectedExecutorSha256||
    marker.preflightSha256!==expectedClientSha256||
    marker.protocolSha256!==expectedProtocolSha256||
    marker.manifestSha256!==expectedManifestSha256||
    marker.timeoutMs!==manifest.timeoutMs||
    marker.maxTurns!==1||
    marker.unknownCostAcknowledged!==true||
    marker.approvalEvidence!=='OPERATOR_ACK_ONLY_NOT_AUTHENTICATED'||
    marker.replayAllowed!==false||marker.independentHostVerified!==false||
    !Number.isSafeInteger(marker.createdAtMs)||marker.createdAtMs<1||
    !markerBytes.equals(Buffer.from(JSON.stringify(marker)+'\n')))
    deny('P2 native launch reservation inconsistent');
  if(result?.model!==manifest.model||
    result.nativeExecutableSha256!==expectedCodexSha256||
    result.executorSha256!==expectedExecutorSha256||
    result.preflightSha256!==expectedClientSha256||
    result.protocolSha256!==expectedProtocolSha256||
    result.manifestSha256!==expectedManifestSha256||
    result.protocolVersion!=='rust-v0.167.0'||
    result.traceSha256!==hash(traceBytes)||
    result.ownerAcknowledgementObserved!==true||
    result.ownerIdentityIndependentlyAuthenticated!==false||
    result.costExposureAcknowledged!==true||result.costCapEnforced!==false||
    result.costStatus!=='UNKNOWN'||result.readOnlyRequested!==true||
    result.readOnlyEnforced!==false||
    result.appServerExecutionAuthenticated!==false||
    result.p2Accepted!==false||result.hostLiveVerified!==false||
    result.replayAllowed!==false||result.ownerReviewRequired!==true||
    !['P2_SYNTHETIC_TURN_OBSERVED_NOT_LIVE',
      'P2_SYNTHETIC_TURN_FAILED'].includes(result.status)||
    result.passed!==(result.status==='P2_SYNTHETIC_TURN_OBSERVED_NOT_LIVE')||
    !result.termination||typeof result.termination!=='object'||
    !Number.isInteger(result.outboundTurnStartCount)||
    result.outboundTurnStartCount<0||result.outboundTurnStartCount>1||
    typeof result.syntheticTestAdapter!=='boolean')
    deny('P2 native candidate Result has unsupported claims or mismatch');
  if(result.syntheticTestAdapter!==true||result.nativeLaunchAttempted!==false||
     result.nativeCodexStarted!==false||result.modelTurnsActuallyRun!==0)
    deny('P2 synthetic-only reviewer rejects all native execution claims');
  if(!resultBytes.equals(Buffer.from(JSON.stringify(result,null,2)+'\n')))
    deny('P2 result bytes not canonical');
  let events;
  try{
    const content=traceBytes.toString('utf8');
    if(!content.endsWith('\n'))deny('P2 trace is incomplete');
    events=content.trimEnd().split('\n').map(line=>JSON.parse(line));
  }catch{deny('P2 redacted trace malformed')}
  if(events.length<2||events.length>160||
     !keys(events[0],['direction','kind'])||
     events[0].direction!=='internal'||events[0].kind!=='one-shot-reserved')
    deny('P2 redacted trace reservation missing');
  for(const event of events){
    if(!event||typeof event!=='object'||!traceKinds.has(event.kind)||
      !['internal','in','out'].includes(event.direction)||
      ![ ['direction','kind'],['direction','kind','method'],
         ['direction','kind','id'],['direction','kind','method','id']
      ].some(fields=>keys(event,fields)))
      deny('P2 redacted trace contains unapproved fields');
    if(event.method!==undefined &&
        (typeof event.method!=='string'||!(/^[A-Za-z0-9/_-]{1,80}$/.test(event.method)||
          event.method==='REDACTED_METHOD')))
      deny('P2 redacted event method is not safe');
  }
  const outbound=events.filter(x=>x.direction==='out'&&x.kind==='method');
  const allowed=['initialize','initialized','thread/start','turn/start'];
  if(outbound.length>4||outbound.some((e,i)=>e.method!==allowed[i]))
    deny('P2 redacted transcript contains unapproved outbound methods');
  if(outbound.filter(e=>e.method==='turn/start').length!==result.outboundTurnStartCount)
    deny('P2 redacted Turn dispatch count differs from Result');
  if(result.passed){
    if(outbound.length!==4||!result.termination.confirmed||
       result.termination.code!==0||result.termination.signal!==null||
       result.termination.forced!==false||result.stderrBytes!==0||
       result.outboundTurnStartCount!==1||
       !events.some(x=>x.direction==='in'&&x.method==='turn/completed')||
       events.some(x=>x.kind==='unparseable'||x.kind==='unterminated'||
                     (x.direction==='in'&&Number.isInteger(x.id)&&x.method)))
      deny('P2 native success not supported by redacted evidence');
  }
  return Object.freeze({
    status:'P2_SYNTHETIC_EVIDENCE_STRUCTURALLY_CONSISTENT_NOT_LIVE',
    observedSuccess:result.passed,
    transcriptSha256:hash(traceBytes),resultSha256:hash(resultBytes),
    reservationSha256:hash(markerBytes),
    nativeExecutableSha256:expectedCodexSha256,
    eventCount:events.length,
    p2Accepted:false,appServerExecutionAuthenticated:false,
    ownerIdentityIndependentlyAuthenticated:false,
    osSandboxEnforcementVerified:false,costCapEnforced:false,
    billingStatus:'UNKNOWN',ownerReviewRequired:true,replayAllowed:false
  });
}
export async function main(args=process.argv.slice(2)){
  if(args.length!==0)
    deny('P2 reviewer is library-only until independent source inspection is approved');
  return {
    status:'P2_NATIVE_EVIDENCE_REVIEW_LIBRARY_ONLY',nativeCodexStarted:false,
    modelTurnsActuallyRun:0,p2Accepted:false,replayAllowed:false
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().then(x=>process.stdout.write(JSON.stringify(x)+'\n'))
    .catch(()=>{process.exitCode=2;process.stdout.write(JSON.stringify({
      status:'P2_EVIDENCE_REVIEW_BLOCKED',p2Accepted:false,replayAllowed:false
    })+'\n')});
}
