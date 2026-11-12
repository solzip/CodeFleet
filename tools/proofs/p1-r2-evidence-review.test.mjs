import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewP1Artifacts, reviewP1EvidenceBytes } from './p1-r2-evidence-review.mjs';
import { runProof, sha256File } from './p1-appserver-handshake.mjs';

const script = fileURLToPath(new URL('./p1-r2-evidence-review.mjs', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const command = ['<CODEX_EXE>', 'app-server', '--listen', 'stdio://', '--strict-config'];
const model = { id:'fake-model', model:'fake-model', displayName:'Fake',
  defaultReasoningEffort:'low', supportedReasoningEfforts:['low'], isDefault:true };
const transcript = () => [
  { direction:'out', method:'initialize', id:1 },
  { direction:'in', kind:'response', id:1,
    result:{userAgent:'fixture',platformFamily:'test',platformOs:'test'} },
  { direction:'out', method:'initialized' },
  { direction:'out', method:'model/list', id:2 },
  { direction:'in', kind:'notification', method:'remoteControl/status/changed' },
  { direction:'in', kind:'response', id:2, result:{data:[model]} }
];
const encode = (records, overrides={}) => {
  const lines = Buffer.from(records.map(rec => JSON.stringify(rec)).join('\n') + '\n');
  const result = {
    status:'P1_HANDSHAKE_OBSERVED', passed:true, command,
    elapsedMs:1480, stdoutBytes:280, stderrBytes:0,
    notificationCounts:{'remoteControl/status/changed':1},
    termination:{code:0, signal:null, confirmed:true, forced:false},
    error:null, transcriptSha256:sha256(lines), ...overrides
  };
  return [Buffer.from(JSON.stringify(result) + '\n'), lines];
};
async function disposable(t, pair=encode(transcript())) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cf-p1-review-')));
  t.after(() => rm(root, {recursive:true,force:true}));
  const artifacts = join(root, 'proof-artifacts');
  await mkdir(artifacts);
  await writeFile(join(artifacts,'p1-redacted-transcript.jsonl'),pair[1]);
  await writeFile(join(artifacts,'p1-result.json'),pair[0]);
  return artifacts;
}
test('synthetic P1 evidence is structurally consistent but NEVER Host authenticated',async t=>{
  const artifacts=await disposable(t);
  const before=(await readdir(artifacts)).sort();
  const reviewed=await reviewP1Artifacts(artifacts);
  assert.equal(reviewed.status,'P1_EVIDENCE_STRUCTURALLY_CONSISTENT_REVIEW_REQUIRED');
  assert.equal(reviewed.appServerExecutionAuthenticated,false);
  assert.equal(reviewed.hostProtocolVerified,false);
  assert.equal(reviewed.p1Accepted,false);
  assert.equal(reviewed.executionAuthorized,false);
  assert.equal(reviewed.ownerReviewRequired,true);
  assert.equal(reviewed.notificationCount,1);
  assert.equal(reviewed.transcriptSha256.length,64);
  assert.equal(reviewed.resultSha256.length,64);
  assert.deepEqual((await readdir(artifacts)).sort(),before);
});
test('a historical failed handshake is NOT accepted',()=>{
  const [result,lines]=encode(transcript(),{status:'P1_FAILED',passed:false,error:'unapproved notification'});
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/P1_FAILED_OR_INCOMPLETE/);
});
test('tampered transcript digest is rejected',()=>{
  const [result,lines]=encode(transcript());
  lines[5]=lines[5]^1;
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/TRANSCRIPT_DIGEST_MISMATCH/);
});
test('no model/list response is not successful P1 evidence',()=>{
  const records=transcript().slice(0,-1);
  const [result,lines]=encode(records);
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/HANDSHAKE_SEQUENCE_INCOMPLETE/);
});
test('unapproved outbound request cannot masquerade as P1 handshake',()=>{
  const records=transcript();
  records.splice(4,0,{direction:'out',method:'thread/start',id:3});
  const [result,lines]=encode(records);
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/UNAPPROVED_OUTBOUND_OR_SEQUENCE/);
});
test('server approval request cannot masquerade as a benign notification',()=>{
  const records=transcript();
  records[4]={direction:'in',kind:'notification',method:'item/commandExecution/requestApproval'};
  const [result,lines]=encode(records);
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/UNAPPROVED_NOTIFICATION_OR_SEQUENCE/);
});
test('raw notification params are refused even with matching hash',()=>{
  const records=transcript();
  records[4]={...records[4],params:{token:'private-secret'}};
  const [result,lines]=encode(records);
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/UNAPPROVED_NOTIFICATION_OR_SEQUENCE/);
});
test('result notification counts must match observed records',()=>{
  const [result,lines]=encode(transcript(),{notificationCounts:{}});
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/NOTIFICATION_COUNTS_MISMATCH/);
});
test('nonzero, forced or unconfirmed termination is not acceptable',()=>{
  for(const termination of [
    {code:4,signal:null,confirmed:true,forced:false},
    {code:0,signal:null,confirmed:true,forced:true},
    {code:0,signal:null,confirmed:false,forced:false}
  ]){
    const [result,lines]=encode(transcript(),{termination});
    assert.throws(()=>reviewP1EvidenceBytes(result,lines),/TERMINATION_NOT_ACCEPTABLE/);
  }
});
test('secret-bearing unexpected result fields are not accepted',()=>{
  const [result,lines]=encode(transcript(),{accountToken:'PRIVATE'});
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/RESULT_FORMAT_INVALID/);
});
test('artifacts directory refuses extra files and preserves source bytes',async t=>{
  const artifacts=await disposable(t);
  await writeFile(join(artifacts,'unreviewed-extra.txt'),'unexpected');
  await assert.rejects(reviewP1Artifacts(artifacts),/EVIDENCE_FILESET_INVALID/);
});
test('CLI fails closed without exposing supplied private paths',()=>{
  const privatePath='/private/tenant-secret-p1-evidence';
  const out=spawnSync(process.execPath,[script,'--artifacts',privatePath],{encoding:'utf8'});
  assert.equal(out.status,2);
  const result=JSON.parse(out.stdout);
  assert.equal(result.status,'P1_EVIDENCE_NOT_ACCEPTED');
  assert.equal(result.hostProtocolVerified,false);
  assert.equal(result.executionAuthorized,false);
  assert.equal(out.stdout.includes(privatePath),false);
});
test('no CLI action can enable Host execution or waive review',()=>{
  const out=spawnSync(process.execPath,[script,'--execute','--artifacts','/tmp/fake'],{encoding:'utf8'});
  assert.equal(out.status,2);
  assert.equal(JSON.parse(out.stdout).reasonCode,'ONLY_READ_ONLY_ARTIFACTS_FLAG_SUPPORTED');
});
test('raw credentials in model summaries are rejected even if hashes agree',()=>{
  const records=transcript();
  records.at(-1).result.data=[{...model,apiKey:'secret'}];
  const [result,lines]=encode(records);
  assert.throws(()=>reviewP1EvidenceBytes(result,lines),/MODEL_SUMMARY_INVALID/);
});

// Contract-level fake-process integration only. The process is Node running
// the explicit fake server, never the installed native Codex App Server.
const fakeServer = fileURLToPath(new URL('./p1-appserver-fake.mjs', import.meta.url));
const proofClient = fileURLToPath(new URL('./p1-appserver-handshake.mjs', import.meta.url));
async function generatedFakeProof(t, scenario) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'cf-p1-generated-fake-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const artifacts=join(root,'proof-artifacts');
  const clientDir=join(root,'proof-client');
  await mkdir(artifacts);
  await mkdir(clientDir);
  const client=join(clientDir,'p1-appserver-handshake.mjs');
  await cp(proofClient,client);
  const input=join(root,'input.txt'), manifest=join(root,'fixture-manifest.json');
  await writeFile(input,'CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1\n');
  const clientSha256=await sha256File(client),inputSha256=await sha256File(input);
  await writeFile(manifest,JSON.stringify({
    manifestVersion:1,proofRoot:'<PROOF_ROOT>',artifacts:'<PROOF_ARTIFACTS>',
    input:{path:'<PROOF_INPUT>',sha256:inputSha256},
    proofClient:{path:'<PROOF_CLIENT>',sha256:clientSha256},
    proofOutput:{path:'<PROOF_OUTPUT>',exists:false},
    artifactCount:0,linksOrJunctions:false
  },null,2)+'\n');
  const options={codexExe:process.execPath,fixture:root,artifacts,manifest,
    codexSha256:await sha256File(process.execPath),clientSha256,inputSha256,
    manifestSha256:await sha256File(manifest),timeoutMs:3000};
  const dependencies={clientPath:client,platform:'test',command:process.execPath,
    commandArgs:[fakeServer,scenario],spawnImpl:spawn,shutdownMs:1000};
  if(scenario==='unknown-notification') {
    await assert.rejects(runProof(options,dependencies),/unapproved server notification/);
  } else {
    const result=await runProof(options,dependencies);
    assert.equal(result.status,'P1_HANDSHAKE_OBSERVED');
    assert.equal(result.passed,true);
  }
  assert.deepEqual((await readdir(artifacts)).sort(),
    ['p1-redacted-transcript.jsonl','p1-result.json']);
  return artifacts;
}
test('actual fake-process P1 evidence is reviewable, never automatically accepted',async t=>{
  const artifacts=await generatedFakeProof(t,'remote-control-notification');
  const audit=await reviewP1Artifacts(artifacts);
  assert.equal(audit.status,'P1_EVIDENCE_STRUCTURALLY_CONSISTENT_REVIEW_REQUIRED');
  assert.equal(audit.notificationCount,1);
  assert.equal(audit.p1Accepted,false);
  assert.equal(audit.hostProtocolVerified,false);
  assert.equal(audit.appServerExecutionAuthenticated,false);
});
test('actual fake-process failed P1 evidence cannot be promoted by structural review',async t=>{
  const artifacts=await generatedFakeProof(t,'unknown-notification');
  await assert.rejects(reviewP1Artifacts(artifacts),/P1_FAILED_OR_INCOMPLETE/);
});
