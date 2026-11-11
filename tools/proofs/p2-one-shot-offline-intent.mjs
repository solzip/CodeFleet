#!/usr/bin/env node
// P2 synthetic durable one-shot intent. This is NOT a P2 Live launch client,
// Operator authentication, cost grant, or a model execution entrypoint.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, open } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256File } from './p1-appserver-handshake.mjs';
import { P2_FIXED_INPUT, P2_OUTPUT_SCHEMA } from './p2-readonly-offline.mjs';

export const P2_INTENT_FILE = 'p2-offline-intent.json';
const SOURCE = fileURLToPath(new URL('./p2-readonly-offline.mjs', import.meta.url));
const SHA = /^[A-F0-9]{64}$/;
const MODEL = /^[A-Za-z0-9_.-]{1,128}$/;
const MAX_INTENT = 4096;
const MAX_NATIVE = 512 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const exact = (value, fields) => value && typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...fields].sort().join('|');
const same = (a,b) => process.platform === 'win32'
  ? resolve(a).toLowerCase() === resolve(b).toLowerCase()
  : resolve(a) === resolve(b);

export class P2IntentError extends Error {
  constructor(reason){super(reason);this.name='P2IntentError';this.executionAuthorized=false;this.replayAllowed=false;}
}
const deny = reason => { throw new P2IntentError(reason); };
async function rootCheck(root){
  if(typeof root !== 'string' || !isAbsolute(root) || root.length>4096 ||
      !basename(root).toLowerCase().startsWith('codefleet-p2-'))
    deny('P2 requires an explicitly isolated synthetic test root');
  const st = await lstat(root).catch(()=>deny('P2 fixture root missing'));
  if(!st.isDirectory() || st.isSymbolicLink() || !same(root,await realpath(root)))
    deny('P2 fixture root link or alias unsupported');
  return root;
}
async function actualFileHash(path,expected){
  if(typeof path!=='string' || path.length>4096 || !isAbsolute(path) ||
      typeof expected!=='string' || !SHA.test(expected))
    deny('P2 reviewed file and SHA-256 identity required');
  const canonical=await realpath(path).catch(()=>deny('P2 identity path unavailable'));
  if(!same(path,canonical))deny('P2 executable/source alias unsupported');
  const st=await lstat(canonical).catch(()=>deny('P2 reviewed file unavailable'));
  if(!st.isFile() || st.isSymbolicLink() || st.size < 1 || st.size > MAX_NATIVE)
    deny('P2 reviewed file must be a bounded regular file');
  if(await sha256File(canonical)!==expected)deny('P2 reviewed file SHA-256 mismatch');
  return canonical;
}
const bodyFields=[
  'kind','version','mode','model','expectedNativeSha256',
  'expectedProtocolSha256','cwdIdentitySha256','promptSha256',
  'outputSchemaSha256','timeoutMs','unknownSubscriptionCost','createdAtMs',
  'executionAuthorized','ownerApproval','hostLiveVerified','replayAllowed'
];
const checkBody = value => exact(value,bodyFields) &&
  value.kind === 'P2_OFFLINE_ONE_SHOT_INTENT_V1' && value.version === 1 &&
  value.mode === 'NO_EXECUTION' && MODEL.test(value.model) &&
  SHA.test(value.expectedNativeSha256) && SHA.test(value.expectedProtocolSha256) &&
  SHA.test(value.cwdIdentitySha256) && SHA.test(value.promptSha256) &&
  SHA.test(value.outputSchemaSha256) &&
  Number.isInteger(value.timeoutMs) && value.timeoutMs >= 1 &&
  value.timeoutMs <= 90000 &&
  value.unknownSubscriptionCost === true &&
  Number.isSafeInteger(value.createdAtMs) && value.createdAtMs > 0 &&
  value.executionAuthorized === false &&
  value.ownerApproval === 'NOT_GRANTED' &&
  value.hostLiveVerified === false && value.replayAllowed === false;

export async function readP2OfflineIntent(root){
  await rootCheck(root);
  const path=join(root,P2_INTENT_FILE);
  const stat=await lstat(path).catch(()=>deny('P2 intent does not exist'));
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size<1 ||
      stat.size>MAX_INTENT)deny('P2 intent file invalid');
  const bytes=await readFile(path);
  if(bytes.length<1||bytes.length>MAX_INTENT)deny('P2 intent size invalid');
  let envelope;
  try{envelope=JSON.parse(bytes.toString('utf8'))}
  catch{deny('P2 intent JSON invalid')}
  if(!exact(envelope,['body','digest'])||!checkBody(envelope.body)||
      typeof envelope.digest!=='string' || !SHA.test(envelope.digest) ||
      hash(JSON.stringify(envelope.body))!==envelope.digest ||
      !bytes.equals(Buffer.from(JSON.stringify(envelope)+'\n','utf8')))
    deny('P2 intent content or checksum invalid');
  if(envelope.body.cwdIdentitySha256!==hash(await realpath(root)))
    deny('P2 intent root identity changed');
  return Object.freeze({
    status:'P2_OFFLINE_INTENT_PRESENT_NO_REPLAY',
    intentSha256:hash(bytes),protocolSha256:envelope.body.expectedProtocolSha256,
    nativeSha256:envelope.body.expectedNativeSha256,
    model:envelope.body.model,timeoutMs:envelope.body.timeoutMs,
    subscriptionCost:'UNKNOWN',ownerApproval:'NOT_GRANTED',
    modelTurnsActuallyRun:0,appServerStarted:false,
    executionAuthorized:false,hostLiveVerified:false,replayAllowed:false,
    next:'RECONCILE_AND_REQUIRE_SEPARATE_OWNER_GRANT_BEFORE_ANY_LIVE_DISPATCH'
  });
}

export async function prepareP2OfflineIntent({
  root,executable,expectedNativeSha256,expectedProtocolSha256,model,
  timeoutMs=90000
}={}){
  await rootCheck(root);
  if(typeof model!=='string'||!MODEL.test(model)||
      !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>90000)
    deny('P2 requires bounded model and timeout proposal');
  // These checks are observations, not an operator-signed grant.
  const nativePath=await actualFileHash(executable,expectedNativeSha256);
  await actualFileHash(SOURCE,expectedProtocolSha256);
  if((await readdir(root)).length!==0)
    deny('P2 synthetic test root is occupied; no replay');
  const body={
    kind:'P2_OFFLINE_ONE_SHOT_INTENT_V1',version:1,mode:'NO_EXECUTION',
    model,expectedNativeSha256,expectedProtocolSha256,
    cwdIdentitySha256:hash(await realpath(root)),
    promptSha256:hash(P2_FIXED_INPUT),
    outputSchemaSha256:hash(JSON.stringify(P2_OUTPUT_SCHEMA)),
    timeoutMs,unknownSubscriptionCost:true,createdAtMs:Date.now(),
    executionAuthorized:false,ownerApproval:'NOT_GRANTED',
    hostLiveVerified:false,replayAllowed:false
  };
  const envelope={body,digest:hash(JSON.stringify(body))};
  const bytes=Buffer.from(JSON.stringify(envelope)+'\n');
  if(bytes.length>MAX_INTENT||!checkBody(body))
    deny('P2 intent envelope invalid');
  // Only atomic exclusive-create can win. A partial/crashed intent remains
  // permanently occupied; never automatically delete, heal or replay it.
  const path=join(root,P2_INTENT_FILE);
  const handle=await open(path,'wx',0o600).catch(()=>deny('P2 intent already reserved'));
  try{
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {await handle.close()}
  if(await sha256File(nativePath)!==expectedNativeSha256 ||
      await sha256File(SOURCE)!==expectedProtocolSha256)
    deny('P2 identity changed after durable intent; reconciliation required');
  const observed=await readP2OfflineIntent(root);
  if(observed.intentSha256!==hash(bytes))
    deny('P2 durable intent changed; reconciliation required');
  return Object.freeze({...observed,status:'P2_OFFLINE_INTENT_RECORDED_NOT_AUTHORIZED'});
}

export function main(args=process.argv.slice(2)){
  if(!Array.isArray(args)||args.length!==0)
    deny('P2 offline journal exposes no write/execute/grant CLI');
  return {
    status:'P2_OFFLINE_JOURNAL_LIBRARY_ONLY',
    fixtureWritten:false,nativeCodexStarted:false,modelTurnsActuallyRun:0,
    subscriptionCost:'UNKNOWN',ownerApproval:'NOT_GRANTED',
    executionAuthorized:false,hostLiveVerified:false,replayAllowed:false
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{process.stdout.write(JSON.stringify(main())+'\n')}
  catch{process.stdout.write(JSON.stringify({
    status:'P2_OFFLINE_JOURNAL_BLOCKED',
    fixtureWritten:false,nativeCodexStarted:false,modelTurnsActuallyRun:0,
    executionAuthorized:false,ownerApproval:'NOT_GRANTED',replayAllowed:false
  })+'\n');process.exitCode=2}
}
