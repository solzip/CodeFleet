import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256File} from './p1-appserver-handshake.mjs';
import {createP2NativeManifest,P2_NATIVE_MANIFEST,
  P2_NATIVE_ARTIFACTS} from './p2-native-preflight.mjs';
import {P2_LIVE_ACK_ENV,P2_LIVE_ACK_VALUE,
  P2_COST_ACK_ENV,P2_COST_ACK_VALUE,
  P2_NATIVE_RESERVATION,P2_NATIVE_TRANSCRIPT,P2_NATIVE_RESULT,
  main as nativeMain} from './p2-native-turn-executor.mjs';
import {reviewP2NativeEvidence,main as reviewerMain} from './p2-native-evidence-review.mjs';

const code=fileURLToPath(new URL('./p2-native-turn-executor.mjs',import.meta.url));
const client=fileURLToPath(new URL('./p2-native-preflight.mjs',import.meta.url));
const protocol=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const reviewer=fileURLToPath(new URL('./p2-native-evidence-review.mjs',import.meta.url));
const fake=fileURLToPath(new URL('./p2-synthetic-appserver.mjs',import.meta.url));
async function setup(t,scenario='success'){
  const parent=await realpath(await mkdtemp(join(tmpdir(),'p2-independent-review-test-')));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const executable=join(parent,'codex.exe');
  const fixtureRoot=join(parent,'CodeFleet-P2-Live-FakeReview');
  await writeFile(executable,'FAKE_EXECUTABLE_REVIEW_ONLY');
  await mkdir(fixtureRoot);await mkdir(join(fixtureRoot,P2_NATIVE_ARTIFACTS));
  const expectedCodexSha256=await sha256File(executable);
  const expectedClientSha256=await sha256File(client);
  const expectedProtocolSha256=await sha256File(protocol);
  const expectedExecutorSha256=await sha256File(code);
  const expectedReviewerSha256=await sha256File(reviewer);
  const manifest=createP2NativeManifest({
    model:'gpt-6.1-sol',expectedCodexSha256,
    expectedClientSha256,expectedProtocolSha256,timeoutMs:1700
  });
  await writeFile(join(fixtureRoot,P2_NATIVE_MANIFEST),JSON.stringify(manifest)+'\n');
  const expectedManifestSha256=await sha256File(join(fixtureRoot,P2_NATIVE_MANIFEST));
  const opts={executable,fixtureRoot,expectedCodexSha256,
    expectedClientSha256,expectedProtocolSha256,
    expectedExecutorSha256,expectedManifestSha256,expectedReviewerSha256};
  const argv=['--execute','--ack-unknown-cost',
    '--codex-exe',executable,'--fixture',fixtureRoot,
    '--codex-sha256',expectedCodexSha256,
    '--preflight-sha256',expectedClientSha256,
    '--protocol-sha256',expectedProtocolSha256,
    '--manifest-sha256',expectedManifestSha256,
    '--executor-sha256',expectedExecutorSha256,
    '--model','gpt-6.1-sol'];
  const env={
    [P2_LIVE_ACK_ENV]:P2_LIVE_ACK_VALUE,
    [P2_COST_ACK_ENV]:P2_COST_ACK_VALUE
  };
  let calls=0;
  const result=await nativeMain(argv,env,{spawnImpl:(binary,args,options)=>{
    assert.equal(binary,executable);
    assert.deepEqual(args,['app-server','--listen','stdio://','--strict-config']);
    calls++;
    return spawn(process.execPath,[fake],{
      ...options,env:{...options.env,CODEFLEET_P2_FAKE_SCENARIO:scenario}
    });
  }});
  assert.equal(calls,1);
  return {opts,result,fixtureRoot};
}
test('separate structural reviewer checks synthetic native-bound evidence without live certification',async t=>{
  const {opts,result}=await setup(t);
  assert.equal(result.passed,true);
  const review=await reviewP2NativeEvidence(opts);
  assert.equal(review.status,'P2_SYNTHETIC_EVIDENCE_STRUCTURALLY_CONSISTENT_NOT_LIVE');
  assert.equal(review.observedSuccess,true);
  assert.equal(review.resultSha256,result.resultSha256);
  assert.equal(review.transcriptSha256,result.traceSha256);
  assert.equal(review.p2Accepted,false);
  assert.equal(review.appServerExecutionAuthenticated,false);
  assert.equal(review.ownerIdentityIndependentlyAuthenticated,false);
  assert.equal(review.osSandboxEnforcementVerified,false);
  assert.equal(review.costCapEnforced,false);
  assert.equal(review.billingStatus,'UNKNOWN');
  assert.equal(review.replayAllowed,false);
  assert.deepEqual(review,await reviewP2NativeEvidence(opts));
});
test('failed tool response still yields structurally consistent FAILURE, not P2 acceptance',async t=>{
  const {opts,result}=await setup(t,'tool');
  assert.equal(result.passed,false);
  const review=await reviewP2NativeEvidence(opts);
  assert.equal(review.observedSuccess,false);
  assert.equal(review.p2Accepted,false);
});
test('attempt to forge p2Accepted=true is detected',async t=>{
  const {opts,fixtureRoot}=await setup(t);
  const file=join(fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_RESULT);
  const mutated=JSON.parse(await readFile(file,'utf8'));
  mutated.p2Accepted=true;
  await writeFile(file,JSON.stringify(mutated,null,2)+'\n');
  await assert.rejects(reviewP2NativeEvidence(opts),
    /Result has unsupported claims or mismatch/);
});
test('modified launch marker is detected',async t=>{
  const {opts,fixtureRoot}=await setup(t);
  const file=join(fixtureRoot,P2_NATIVE_RESERVATION);
  const mutated=JSON.parse(await readFile(file,'utf8'));
  mutated.unknownCostAcknowledged=false;
  await writeFile(file,JSON.stringify(mutated)+'\n');
  await assert.rejects(reviewP2NativeEvidence(opts),
    /launch reservation inconsistent/);
});
test('redacted trace alteration is detected using result digest',async t=>{
  const {opts,fixtureRoot}=await setup(t);
  const file=join(fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_TRANSCRIPT);
  await writeFile(file,await readFile(file,'utf8')+
    '{"direction":"out","kind":"method","method":"turn/start"}\n');
  await assert.rejects(reviewP2NativeEvidence(opts),
    /Result has unsupported claims or mismatch/);
});
test('reviewer source hash changes are rejected',async t=>{
  const {opts}=await setup(t);
  await assert.rejects(reviewP2NativeEvidence({
    ...opts,expectedReviewerSha256:'F'.repeat(64)
  }),/source\/native identity changed/);
});
test('unknown extra file in Evidence is forbidden',async t=>{
  const {opts,fixtureRoot}=await setup(t);
  await writeFile(join(fixtureRoot,P2_NATIVE_ARTIFACTS,'owner-file'),'MUST_NOT_REMOVE');
  await assert.rejects(reviewP2NativeEvidence(opts),
    /Evidence directory is not exact/);
  assert.equal(await readFile(join(fixtureRoot,P2_NATIVE_ARTIFACTS,'owner-file'),'utf8'),
    'MUST_NOT_REMOVE');
});
test('reviewer does not output sensitive fake account fields or run Codex',async t=>{
  const {opts,fixtureRoot}=await setup(t,'metadata');
  const review=await reviewP2NativeEvidence(opts);
  assert.equal(review.observedSuccess,true);
  const evidence=await readFile(join(fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_TRANSCRIPT),'utf8');
  assert.equal(evidence.includes('DO_NOT_COPY_PRIVATE_TOKEN_FAKE_VALUE'),false);
  assert.equal(JSON.stringify(review).includes(fixtureRoot),false);
});
test('standalone reviewer CLI is library only; no --execute or approve flag',async()=>{
  const allowed=spawnSync(process.execPath,[reviewer],{encoding:'utf8',shell:false});
  assert.equal(allowed.status,0);
  assert.equal(JSON.parse(allowed.stdout).status,'P2_NATIVE_EVIDENCE_REVIEW_LIBRARY_ONLY');
  const blocked=spawnSync(process.execPath,[reviewer,'--execute'],{encoding:'utf8',shell:false});
  assert.equal(blocked.status,2);
  assert.equal(JSON.parse(blocked.stdout).p2Accepted,false);
  await assert.rejects(reviewerMain(['--approve']),/library-only/);
});

test('reviewer refuses forged native process launch flag in synthetic proof',async t=>{
  const {opts,fixtureRoot}=await setup(t);
  const path=join(fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_RESULT);
  const result=JSON.parse(await readFile(path,'utf8'));
  result.nativeLaunchAttempted=true;
  await writeFile(path,JSON.stringify(result,null,2)+'\n');
  await assert.rejects(reviewP2NativeEvidence(opts),
    /synthetic-only reviewer rejects all native execution claims/);
});
test('reviewer refuses promoting synthetic model result to native',async t=>{
  const {opts,fixtureRoot}=await setup(t);
  const path=join(fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_RESULT);
  const result=JSON.parse(await readFile(path,'utf8'));
  result.syntheticTestAdapter=false;
  result.nativeCodexStarted=true;
  result.modelTurnsActuallyRun='UNKNOWN';
  await writeFile(path,JSON.stringify(result,null,2)+'\n');
  await assert.rejects(reviewP2NativeEvidence(opts),
    /synthetic-only reviewer rejects all native execution claims/);
});
