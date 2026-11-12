#!/usr/bin/env node
// Read-only Native P2 candidate admission. Never starts Codex, grants cost,
// mutates a Fixture, or attests OS permissions and Authenticode.
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { sha256File } from './p1-appserver-handshake.mjs';
import { P2_FIXED_INPUT, P2_OUTPUT_SCHEMA } from './p2-readonly-offline.mjs';

const CLIENT=fileURLToPath(import.meta.url);
const PROTOCOL=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
export const P2_NATIVE_MANIFEST='p2-native-manifest.json';
export const P2_NATIVE_ARTIFACTS='proof-artifacts';
const SHA=/^[A-F0-9]{64}$/;
const MODEL=/^[A-Za-z0-9_.-]{1,128}$/;
const MAX_EXE=512*1024*1024,MAX_CLIENT=1024*1024,MAX_MANIFEST=8192;
const hash=v=>createHash('sha256').update(v).digest('hex').toUpperCase();
const canonical=(a,b)=>process.platform==='win32'?
  resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b);
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join('|')===[...fields].sort().join('|');

export const P2_NATIVE_MANIFEST_FIELDS=Object.freeze([
  'kind','version','mode','model','expectedCodexSha256',
  'expectedClientSha256','expectedProtocolSha256',
  'promptSha256','outputSchemaSha256','maxThreads','maxTurns',
  'timeoutMs','ephemeral','sandbox','approvalPolicy',
  'toolNetworkAccess','costCapEnforced','subscriptionCostStatus',
  'ownerApproval','executionAuthorized','replayAllowed'
]);
export class P2NativeAdmissionError extends Error{
  constructor(reason){super(reason);this.name='P2NativeAdmissionError';
    this.executionAuthorized=false;this.replayAllowed=false;}
}
const deny=message=>{throw new P2NativeAdmissionError(message);};
const approvedHash=(h,label)=>{
  if(typeof h!=='string'||!SHA.test(h))deny('P2 requires an exact reviewed '+label+' SHA-256');
  return h;
};
// Verify the exact bytes later parsed, not a separate earlier file read.
export function assertReviewedManifestBytes(bytes,reviewedSha256){
  const reviewed=approvedHash(reviewedSha256,'P2 manifest');
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_MANIFEST||
      hash(bytes)!==reviewed)
    deny('P2 source/runtime/Fixture hash mismatch');
}
async function noLinkedAncestors(path){
  let segment=resolve(path);
  for(;;){
    const st=await lstat(segment).catch(()=>deny('P2 path unavailable'));
    if(st.isSymbolicLink())deny('P2 symlink/Junction ancestor forbidden');
    const parent=dirname(segment);
    if(parent===segment)break;
    segment=parent;
  }
}
async function reviewedRegular(path,limit){
  if(typeof path!=='string'||path.length>4096||!isAbsolute(path))
    deny('P2 path must be absolute');
  await noLinkedAncestors(path);
  const actual=await realpath(path).catch(()=>deny('P2 reviewed path not found'));
  if(!canonical(actual,path))deny('P2 linked path alias forbidden');
  const stat=await lstat(actual).catch(()=>deny('P2 regular file missing'));
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>limit)
    deny('P2 reviewed file type/size invalid');
  return actual;
}
async function reviewedDirectory(path){
  if(typeof path!=='string'||path.length>4096||!isAbsolute(path))
    deny('P2 Fixture must have an absolute path');
  await noLinkedAncestors(path);
  const actual=await realpath(path).catch(()=>deny('P2 Fixture unavailable'));
  if(!canonical(actual,path))deny('P2 Fixture linked alias forbidden');
  const stat=await lstat(actual).catch(()=>deny('P2 Fixture directory unavailable'));
  if(!stat.isDirectory()||stat.isSymbolicLink())
    deny('P2 Fixture root is not a directory');
  return actual;
}
export function createP2NativeManifest({model,expectedCodexSha256,
  expectedClientSha256,expectedProtocolSha256,timeoutMs=90000}={}){
  if(typeof model!=='string'||!MODEL.test(model)||
    !Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>90000)
    deny('P2 candidate model or timeout invalid');
  for(const [h,name] of [
    [expectedCodexSha256,'native Codex'],[expectedClientSha256,'client'],
    [expectedProtocolSha256,'protocol']
  ])approvedHash(h,name);
  return Object.freeze({
    kind:'P2_NATIVE_READONLY_PROOF_CANDIDATE_V1',version:1,
    mode:'NOT_AUTHORIZED_NO_EXECUTE',model,
    expectedCodexSha256,expectedClientSha256,expectedProtocolSha256,
    promptSha256:hash(P2_FIXED_INPUT),
    outputSchemaSha256:hash(JSON.stringify(P2_OUTPUT_SCHEMA)),
    maxThreads:1,maxTurns:1,timeoutMs,ephemeral:true,
    sandbox:'read-only',approvalPolicy:'never',toolNetworkAccess:false,
    costCapEnforced:false,subscriptionCostStatus:'UNKNOWN',
    ownerApproval:'NOT_GRANTED',executionAuthorized:false,replayAllowed:false
  });
}
export async function inspectP2NativeCandidate({
  executable,fixtureRoot,expectedCodexSha256,expectedClientSha256,
  expectedProtocolSha256,expectedManifestSha256
}={}){
  const hashes=[
    approvedHash(expectedCodexSha256,'native Codex'),
    approvedHash(expectedClientSha256,'P2 client'),
    approvedHash(expectedProtocolSha256,'P2 protocol'),
    approvedHash(expectedManifestSha256,'P2 manifest')
  ];
  if(typeof executable!=='string'||!isAbsolute(executable)||
      basename(executable).toLowerCase()!=='codex.exe')
    deny('P2 Windows requires the reviewed native codex.exe');
  if(typeof fixtureRoot!=='string'||!isAbsolute(fixtureRoot)||
      !basename(fixtureRoot).toLowerCase().startsWith('codefleet-p2-live-'))
    deny('P2 requires a distinct dedicated native Fixture');
  const codex=await reviewedRegular(executable,MAX_EXE);
  const root=await reviewedDirectory(fixtureRoot);
  const artifacts=join(root,P2_NATIVE_ARTIFACTS);
  await reviewedDirectory(artifacts);
  const entries=(await readdir(root)).sort();
  if(entries.join('|')!==[P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS].sort().join('|'))
    deny('P2 Fixture has extra or missing entries');
  if((await readdir(artifacts)).length!==0)
    deny('P2 existing proof Evidence or replay attempt');
  const manifestPath=await reviewedRegular(join(root,P2_NATIVE_MANIFEST),MAX_MANIFEST);
  const clientPath=await reviewedRegular(CLIENT,MAX_CLIENT);
  const protocolPath=await reviewedRegular(PROTOCOL,MAX_CLIENT);
  const observed=await Promise.all([
    sha256File(codex),sha256File(clientPath),sha256File(protocolPath)
  ]);
  for(let i=0;i<observed.length;i++)
    if(observed[i]!==hashes[i])deny('P2 source/runtime/Fixture hash mismatch');
  const bytes=await readFile(manifestPath);
  assertReviewedManifestBytes(bytes,hashes[3]);
  let manifest;
  try{manifest=JSON.parse(bytes.toString('utf8'))}
  catch{deny('P2 candidate Manifest JSON invalid')}
  if(!exact(manifest,P2_NATIVE_MANIFEST_FIELDS))
    deny('P2 candidate Manifest fields invalid');
  const expected=createP2NativeManifest({
    model:manifest.model,expectedCodexSha256:hashes[0],
    expectedClientSha256:hashes[1],expectedProtocolSha256:hashes[2],
    timeoutMs:manifest.timeoutMs
  });
  if(JSON.stringify(manifest)!==JSON.stringify(expected)||
      !bytes.equals(Buffer.from(JSON.stringify(expected)+'\n','utf8')))
    deny('P2 native Manifest canonical content or permission mismatch');
  return Object.freeze({
    status:'P2_NATIVE_CANDIDATE_FILES_OBSERVED_NOT_AUTHORIZED',
    model:manifest.model,timeoutMs:manifest.timeoutMs,
    nativeCodexSha256:hashes[0],clientSha256:hashes[1],
    protocolSha256:hashes[2],manifestSha256:hashes[3],
    expectedOutboundMethods:Object.freeze([
      'initialize','initialized','thread/start','turn/start']),
    maxThreads:1,maxTurns:1,readOnlyRequested:true,
    toolNetworkAccessRequested:false,ephemeralRequested:true,
    ownerApproval:'NOT_GRANTED',executionAuthorized:false,
    nativeCodexStarted:false,modelTurnsActuallyRun:0,
    authenticodeVerified:false,osSandboxEnforcementVerified:false,
    costCapEnforced:false,costStatus:'UNKNOWN',
    hostLiveVerified:false,appServerExecutionAuthenticated:false,
    replayAllowed:false,
    next:'SEPARATE_OWNER_SIGNATURE_COST_PERMISSIONS_AND_P2_EXECUTION_GRANT_REQUIRED'
  });
}
const CLI_FIELDS=new Map([
  ['--codex-exe','executable'],['--fixture','fixtureRoot'],
  ['--codex-sha256','expectedCodexSha256'],
  ['--client-sha256','expectedClientSha256'],
  ['--protocol-sha256','expectedProtocolSha256'],
  ['--manifest-sha256','expectedManifestSha256']
]);
export async function main(args=process.argv.slice(2)){
  if(args.length===0)return {
    status:'P2_NATIVE_PREFLIGHT_READONLY_ONLY',nativeCodexStarted:false,
    modelTurnsActuallyRun:0,executionAuthorized:false,ownerApproval:'NOT_GRANTED',
    authenticodeVerified:false,costCapEnforced:false,
    replayAllowed:false,liveTransportAvailable:false
  };
  if(args[0]!=='--inspect')deny('P2 Native proof has no execute or approval command');
  const opts={};
  for(let i=1;i<args.length;i+=2){
    const key=CLI_FIELDS.get(args[i]);
    if(!key||i+1>=args.length||Object.hasOwn(opts,key))
      deny('P2 Native inspection has unknown, missing or duplicate option');
    opts[key]=args[i+1];
  }
  if(Object.keys(opts).length!==CLI_FIELDS.size)
    deny('P2 Native inspection requires all exact SHA-256 bindings');
  return inspectP2NativeCandidate(opts);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().then(result=>process.stdout.write(JSON.stringify(result)+'\n'))
    .catch(()=>{process.stdout.write(JSON.stringify({
      status:'P2_NATIVE_PREFLIGHT_BLOCKED',nativeCodexStarted:false,
      modelTurnsActuallyRun:0,executionAuthorized:false,
      ownerApproval:'NOT_GRANTED',replayAllowed:false
    })+'\n');process.exitCode=2});
}
