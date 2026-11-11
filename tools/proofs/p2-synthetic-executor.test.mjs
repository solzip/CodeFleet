import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp,mkdir,realpath,readFile,readdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File } from './p1-appserver-handshake.mjs';
import { prepareP2OfflineIntent } from './p2-one-shot-offline-intent.mjs';
import { runP2SyntheticTransport, reviewP2SyntheticEvidence,
  P2_SYNTHETIC_MARKER,P2_SYNTHETIC_TRACE,P2_SYNTHETIC_RESULT
} from './p2-synthetic-executor.mjs';

const protocolFile=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const runnerFile=fileURLToPath(new URL('./p2-synthetic-executor.mjs',import.meta.url));
const model='gpt-6.1-sol'; // Synthetic candidate ID, never a real request.
async function f(t){
  const parent=await realpath(await mkdtemp(join(tmpdir(),'codefleet-p2-transport-parent-')));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const root=join(parent,'codefleet-p2-fake-executor');
  await mkdir(root);
  const fakeNative=join(parent,'synthetic-native-codex-do-not-launch');
  await writeFile(fakeNative,'THIS_IS_NOT_CODEX;NEVER_EXECUTE');
  const contract={root,executable:fakeNative,
    expectedNativeSha256:await sha256File(fakeNative),
    expectedProtocolSha256:await sha256File(protocolFile),
    model,timeoutMs:90000};
  await prepareP2OfflineIntent(contract);
  return {...contract,parent};
}
function failure(result){
  assert.equal(result.status,'P2_SYNTHETIC_PROCESS_FAILED');
  assert.equal(result.passed,false);
  assert.equal(result.nativeCodexStarted,false);
  assert.equal(result.modelTurnsActuallyRun,0);
  assert.equal(result.ownerApproval,'NOT_GRANTED');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.replayAllowed,false);
  assert.equal(result.hostLiveVerified,false);
  assert.equal(result.error,'SYNTHETIC_REVIEW_REQUIRED');
}
test('fixed fake child process completes one bounded Thread/Turn, preserving no-live status',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({root:cfg.root,model});
  assert.equal(result.status,'P2_SYNTHETIC_PROCESS_MATCHED_NOT_LIVE');
  assert.equal(result.passed,true);
  assert.equal(result.termination.code,0);
  assert.equal(result.termination.confirmed,true);
  assert.equal(result.termination.signal,null);
  assert.equal(result.stderrBytes,0);
  assert.equal(result.nativeCodexStarted,false);
  assert.equal(result.modelTurnsActuallyRun,0);
  assert.equal(result.simulationOnly,true);
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.ownerApproval,'NOT_GRANTED');
  assert.equal(result.replayAllowed,false);
  assert.equal(result.usageStatus,'UNKNOWN');
  assert.equal(result.hostLiveVerified,false);
  const files=(await readdir(cfg.root)).sort();
  assert.deepEqual(files,[
    'p2-offline-intent.json',P2_SYNTHETIC_MARKER,
    P2_SYNTHETIC_RESULT,P2_SYNTHETIC_TRACE
  ].sort());
  const review=await reviewP2SyntheticEvidence(cfg.root);
  assert.equal(review.status,'P2_SYNTHETIC_EVIDENCE_STRUCTURALLY_CONSISTENT_NOT_LIVE');
  assert.equal(review.passed,true);
  assert.equal(review.provenanceAuthenticated,false);
  assert.equal(review.resultSha256,result.resultSha256);
  assert.equal(review.traceSha256,result.traceSha256);
  assert.equal(review.modelTurnsActuallyRun,0);
});
test('a second synthetic process attempt is rejected without replacing evidence',async t=>{
  const cfg=await f(t);
  await runP2SyntheticTransport({root:cfg.root,model});
  const before=await readFile(join(cfg.root,P2_SYNTHETIC_RESULT));
  await assert.rejects(runP2SyntheticTransport({root:cfg.root,model}),/not pristine; no replay/);
  assert.deepEqual(await readFile(join(cfg.root,P2_SYNTHETIC_RESULT)),before);
});
test('concurrent attempts admit exactly one synthetic process reservation',async t=>{
  const cfg=await f(t);
  const outcomes=await Promise.allSettled([
    runP2SyntheticTransport({root:cfg.root,model}),
    runP2SyntheticTransport({root:cfg.root,model})
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal((await reviewP2SyntheticEvidence(cfg.root)).passed,true);
});
test('a denied tool item cannot become a completed synthetic proof',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({root:cfg.root,model,scenario:'tool'});
  failure(result);
  const review=await reviewP2SyntheticEvidence(cfg.root);
  assert.equal(review.passed,false);
});
test('any server approval request is rejected without replay',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({root:cfg.root,model,scenario:'server_request'});
  failure(result);
  assert.equal((await reviewP2SyntheticEvidence(cfg.root)).passed,false);
});
test('unexpected Codex 0.167.0 notification fails closed',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({
    root:cfg.root,model,scenario:'unknown_notification'});
  failure(result);
});
test('fake Thread permission escalation is rejected before issuing a Turn',async t=>{
  const cfg=await f(t);
  failure(await runP2SyntheticTransport({root:cfg.root,model,scenario:'bad_sandbox'}));
  const trace=(await readFile(join(cfg.root,P2_SYNTHETIC_TRACE))).toString();
  assert.equal(trace.includes('"method":"turn/start"'),false);
});
test('wrong bound Turn, duplicate completion and invalid final text fail',async t=>{
  for(const scenario of ['wrong_turn','duplicate','bad_output']){
    const cfg=await f(t);
    // Each separate fresh fixture is required; no replay of the same root.
    const root=join(cfg.parent,'codefleet-p2-'+scenario);
    await mkdir(root);
    await prepareP2OfflineIntent({...cfg,root});
    failure(await runP2SyntheticTransport({root,model,scenario}));
  }
});
test('incomplete and truncated JSONL fail with a no-retry marker',async t=>{
  const cfg=await f(t);
  failure(await runP2SyntheticTransport({root:cfg.root,model,scenario:'trailing'}));
  assert.equal((await reviewP2SyntheticEvidence(cfg.root)).passed,false);
});
test('nonzero process close cannot be accepted even with valid fake response',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({root:cfg.root,model,scenario:'nonzero'});
  failure(result);
  assert.equal(result.termination.code,7);
});
test('stderr is a failure and not persisted in evidence',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({root:cfg.root,model,scenario:'stderr'});
  failure(result);
  const trace=await readFile(join(cfg.root,P2_SYNTHETIC_TRACE),'utf8');
  const report=await readFile(join(cfg.root,P2_SYNTHETIC_RESULT),'utf8');
  assert.equal((trace+report).includes('SYNTHETIC_STDERR_NOT_CAPTURED'),false);
});
test('unknown account metadata is not persisted from fake stdout',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({root:cfg.root,model,scenario:'metadata'});
  assert.equal(result.passed,true);
  const trace=await readFile(join(cfg.root,P2_SYNTHETIC_TRACE),'utf8');
  const report=await readFile(join(cfg.root,P2_SYNTHETIC_RESULT),'utf8');
  assert.equal((trace+report).includes('DO_NOT_COPY_PRIVATE_TOKEN_FAKE_VALUE'),false);
  assert.equal(trace.includes('account/updated'),true);
});
test('hung child is killed under deadline and failure is never auto-retried',async t=>{
  const cfg=await f(t);
  const result=await runP2SyntheticTransport({
    root:cfg.root,model,scenario:'hang',timeoutMs:1500});
  failure(result);
  assert.equal(result.termination.confirmed,true);
  await assert.rejects(runP2SyntheticTransport({root:cfg.root,model}),/not pristine; no replay/);
});
test('invalid model or missing intent cannot reserve or spawn fake child',async t=>{
  const cfg=await f(t);
  await assert.rejects(runP2SyntheticTransport({root:cfg.root,model:'different-model'}),
    /intent\/Model mismatch/);
  assert.deepEqual(await readdir(cfg.root),['p2-offline-intent.json']);
  const missing=join(cfg.parent,'codefleet-p2-missing-intent');
  await mkdir(missing);
  await assert.rejects(runP2SyntheticTransport({root:missing,model}),
    /intent does not exist/);
  assert.deepEqual(await readdir(missing),[]);
});
test('any modified synthetic Result is detected by offline reviewer',async t=>{
  const cfg=await f(t);
  await runP2SyntheticTransport({root:cfg.root,model});
  const path=join(cfg.root,P2_SYNTHETIC_RESULT);
  const bytes=JSON.parse(await readFile(path,'utf8'));
  bytes.hostLiveVerified=true;
  await writeFile(path,JSON.stringify(bytes,null,2)+'\n');
  await assert.rejects(reviewP2SyntheticEvidence(cfg.root),/cannot be accepted/);
  await assert.rejects(runP2SyntheticTransport({root:cfg.root,model}),/not pristine; no replay/);
});
test('any modified redacted trace is detected by offline reviewer',async t=>{
  const cfg=await f(t);
  await runP2SyntheticTransport({root:cfg.root,model});
  const path=join(cfg.root,P2_SYNTHETIC_TRACE);
  await writeFile(path,await readFile(path,'utf8')+'{"direction":"in","kind":"response","id":9}\n');
  await assert.rejects(reviewP2SyntheticEvidence(cfg.root),/cannot be accepted/);
});
test('synthetic executor CLI never accepts an execute, model, root or approve flag',()=>{
  const entry=spawnSync(process.execPath,[runnerFile],{encoding:'utf8',shell:false});
  assert.equal(entry.status,0,entry.stderr);
  const x=JSON.parse(entry.stdout);
  assert.equal(x.status,'P2_SYNTHETIC_HARNESS_LIBRARY_ONLY');
  assert.equal(x.realCodexRunnable,false);
  assert.equal(x.nativeCodexStarted,false);
  assert.equal(x.modelTurnsActuallyRun,0);
  assert.equal(x.ownerApproval,'NOT_GRANTED');
  for(const flag of ['--execute','--model','--root','--approve','--cost-usd']){
    const out=spawnSync(process.execPath,[runnerFile,flag],{encoding:'utf8',shell:false});
    assert.equal(out.status,2,out.stderr);
    assert.equal(JSON.parse(out.stdout).status,'P2_SYNTHETIC_HARNESS_BLOCKED');
  }
});
