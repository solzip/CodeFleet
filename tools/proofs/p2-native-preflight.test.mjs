import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir,mkdtemp,readFile,readdir,realpath,rm,symlink,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File } from './p1-appserver-handshake.mjs';
import { P2_FIXED_INPUT,P2_OUTPUT_SCHEMA } from './p2-readonly-offline.mjs';
import {
  createP2NativeManifest,inspectP2NativeCandidate,main,
  assertReviewedManifestBytes,P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS
} from './p2-native-preflight.mjs';

const client=fileURLToPath(new URL('./p2-native-preflight.mjs',import.meta.url));
const protocol=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const sampleModel='gpt-6.1-sol';
async function fixture(t){
  const parent=await realpath(await mkdtemp(join(tmpdir(),'p2-native-admission-test-')));
  t.after(()=>rm(parent,{force:true,recursive:true}));
  const fixtureRoot=join(parent,'CodeFleet-P2-Live-Synthetic-Only');
  await mkdir(fixtureRoot);
  await mkdir(join(fixtureRoot,P2_NATIVE_ARTIFACTS));
  const executable=join(parent,'codex.exe');
  await writeFile(executable,'OFFLINE_FAKE_BIN_NOT_OPENAI_AND_NEVER_RUN');
  const expectedCodexSha256=await sha256File(executable);
  const expectedClientSha256=await sha256File(client);
  const expectedProtocolSha256=await sha256File(protocol);
  const manifest=createP2NativeManifest({
    model:sampleModel,expectedCodexSha256,expectedClientSha256,
    expectedProtocolSha256,timeoutMs:90000
  });
  const manifestPath=join(fixtureRoot,P2_NATIVE_MANIFEST);
  await writeFile(manifestPath,JSON.stringify(manifest)+'\n');
  return {parent,fixtureRoot,executable,expectedCodexSha256,
    expectedClientSha256,expectedProtocolSha256,
    expectedManifestSha256:await sha256File(manifestPath),manifestPath};
}
async function blocked(options,pattern){
  await assert.rejects(inspectP2NativeCandidate(options),e=>{
    assert.equal(e.name,'P2NativeAdmissionError');
    assert.equal(e.executionAuthorized,false);
    assert.equal(e.replayAllowed,false);
    if(pattern)assert.match(e.message,pattern);
    return true;
  });
}
test('read-only native identity preflight passes fake fixture but never accepts Live',async t=>{
  const f=await fixture(t);
  const before=await readFile(f.manifestPath);
  const result=await inspectP2NativeCandidate(f);
  assert.equal(result.status,'P2_NATIVE_CANDIDATE_FILES_OBSERVED_NOT_AUTHORIZED');
  assert.equal(result.model,sampleModel);
  assert.equal(result.timeoutMs,90000);
  assert.equal(result.nativeCodexSha256,f.expectedCodexSha256);
  assert.equal(result.clientSha256,f.expectedClientSha256);
  assert.equal(result.protocolSha256,f.expectedProtocolSha256);
  assert.equal(result.manifestSha256,f.expectedManifestSha256);
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.ownerApproval,'NOT_GRANTED');
  assert.equal(result.nativeCodexStarted,false);
  assert.equal(result.modelTurnsActuallyRun,0);
  assert.equal(result.authenticodeVerified,false);
  assert.equal(result.osSandboxEnforcementVerified,false);
  assert.equal(result.costCapEnforced,false);
  assert.equal(result.costStatus,'UNKNOWN');
  assert.equal(result.hostLiveVerified,false);
  assert.equal(result.replayAllowed,false);
  assert.deepEqual(result.expectedOutboundMethods,[
    'initialize','initialized','thread/start','turn/start'
  ]);
  assert.deepEqual(await readFile(f.manifestPath),before);
  assert.deepEqual(await readdir(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS)),[]);
  const repeat=await inspectP2NativeCandidate(f);
  assert.deepEqual(result,repeat);
});
test('canonical Manifest rejects any authority or cost-cap promotion',async t=>{
  const f=await fixture(t);
  const m=JSON.parse(await readFile(f.manifestPath,'utf8'));
  assert.equal(m.ownerApproval,'NOT_GRANTED');
  assert.equal(m.executionAuthorized,false);
  assert.equal(m.costCapEnforced,false);
  for(const patch of [
    {ownerApproval:'APPROVED'}, {executionAuthorized:true},
    {costCapEnforced:true},{maxTurns:2},{maxThreads:2},
    {sandbox:'workspace-write'}, {approvalPolicy:'on-request'},
    {toolNetworkAccess:true},{subscriptionCostStatus:'ZERO'}
  ]){
    const actual={...m,...patch};
    await writeFile(f.manifestPath,JSON.stringify(actual)+'\n');
    await blocked({...f,expectedManifestSha256:await sha256File(f.manifestPath)},
      /canonical content or permission mismatch/);
  }
});
test('wrong native Codex SHA rejected before any spawn',async t=>{
  const f=await fixture(t);
  await blocked({...f,expectedCodexSha256:'A'.repeat(64)},/hash mismatch/);
  assert.deepEqual(await readdir(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS)),[]);
});
test('wrong client or protocol SHA rejected before any spawn',async t=>{
  const f=await fixture(t);
  await blocked({...f,expectedClientSha256:'B'.repeat(64)},/hash mismatch/);
  await blocked({...f,expectedProtocolSha256:'C'.repeat(64)},/hash mismatch/);
});
test('wrong manifest SHA rejected before any spawn',async t=>{
  const f=await fixture(t);
  await blocked({...f,expectedManifestSha256:'D'.repeat(64)},/hash mismatch/);
});
test('altered manifest model rejected even if new manifest SHA is supplied',async t=>{
  const f=await fixture(t);
  const m=JSON.parse(await readFile(f.manifestPath,'utf8'));
  m.model='gpt/unsupported-model';
  await writeFile(f.manifestPath,JSON.stringify(m)+'\n');
  await blocked({...f,expectedManifestSha256:await sha256File(f.manifestPath)});
});
test('old P1 root and arbitrary project roots never qualify as P2',async t=>{
  const f=await fixture(t);
  for(const root of [f.parent,join(f.parent,'CodeFleet-P1-R3-20261111')]){
    if(root!==f.parent)await mkdir(root);
    await blocked({...f,fixtureRoot:root},/distinct dedicated native Fixture/);
  }
});
test('a failed fixture layout does not modify existing user files',async t=>{
  const f=await fixture(t);
  const ownerFile=join(f.fixtureRoot,'do-not-delete-owner-data');
  await writeFile(ownerFile,'OWNER DATA');
  await blocked(f,/extra or missing entries/);
  assert.equal(await readFile(ownerFile,'utf8'),'OWNER DATA');
});
test('occupied evidence directory blocks a new native attempt',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS,'p2-result.json'),'previous-attempt');
  await blocked(f,/existing proof Evidence or replay/);
});
test('missing manifest rejects without creating a new manifest',async t=>{
  const f=await fixture(t);
  await rm(f.manifestPath);
  await blocked(f,/extra or missing entries/);
  assert.deepEqual(await readdir(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS)),[]);
});
test('a symlinked fixture root is rejected before any writes',async t=>{
  const f=await fixture(t);
  const alias=join(f.parent,'CodeFleet-P2-Live-Alias');
  try{await symlink(f.fixtureRoot,alias,process.platform==='win32'?'junction':'dir')}
  catch(e){if(['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(e.code)){t.skip();return;}throw e;}
  await blocked({...f,fixtureRoot:alias},/symlink\/Junction ancestor/);
});
test('a symlinked native file is rejected before any spawn',async t=>{
  const f=await fixture(t);
  const alias=join(f.parent,'codex-symlink');
  const nativeAlias=join(f.parent,'codex.exe');
  await rm(nativeAlias);
  try{await symlink(join(f.parent,'codex-original.exe'),nativeAlias,'file')}
  catch(e){if(['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(e.code)){t.skip();return;}throw e;}
  await blocked(f,/symlink\/Junction ancestor/);
});
test('CLI without flags never triggers native execution; execute flags blocked',()=>{
  const result=spawnSync(process.execPath,[client],{encoding:'utf8',shell:false});
  assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);
  assert.equal(output.status,'P2_NATIVE_PREFLIGHT_READONLY_ONLY');
  assert.equal(output.nativeCodexStarted,false);
  assert.equal(output.executionAuthorized,false);
  assert.equal(output.liveTransportAvailable,false);
  for(const flag of ['--execute','--approve','--prepare','--cost-usd','--run']){
    const r=spawnSync(process.execPath,[client,flag],{encoding:'utf8',shell:false});
    assert.equal(r.status,2);
    assert.equal(JSON.parse(r.stdout).status,'P2_NATIVE_PREFLIGHT_BLOCKED');
  }
});
test('CLI --inspect binds all 4 exact hashes, no fixture modifications',async t=>{
  const f=await fixture(t);
  const args=['--inspect','--codex-exe',f.executable,'--fixture',f.fixtureRoot,
    '--codex-sha256',f.expectedCodexSha256,
    '--client-sha256',f.expectedClientSha256,
    '--protocol-sha256',f.expectedProtocolSha256,
    '--manifest-sha256',f.expectedManifestSha256];
  const before=await readFile(f.manifestPath);
  const inspected=spawnSync(process.execPath,[client,...args],{
    encoding:'utf8',shell:false});
  assert.equal(inspected.status,0,inspected.stderr);
  const out=JSON.parse(inspected.stdout);
  assert.equal(out.status,'P2_NATIVE_CANDIDATE_FILES_OBSERVED_NOT_AUTHORIZED');
  assert.equal(out.executionAuthorized,false);
  assert.equal(out.authenticodeVerified,false);
  assert.deepEqual(await readFile(f.manifestPath),before);
});
test('CLI duplicate or omitted identities never pass',async t=>{
  const f=await fixture(t);
  await assert.rejects(main(['--inspect','--fixture',f.fixtureRoot]),
    /requires all exact SHA-256 bindings/);
  await assert.rejects(main(['--inspect','--fixture','x','--fixture','x']),
    /unknown, missing or duplicate option/);
  await assert.rejects(main(['--inspect','--unsupported','x']),
    /unknown, missing or duplicate option/);
});
test('invalid hashes or unauthorized model names cannot produce a Manifest',()=>{
  assert.throws(()=>createP2NativeManifest({model:'gpt-6.1-sol',
    expectedCodexSha256:'A',expectedClientSha256:'B'.repeat(64),
    expectedProtocolSha256:'C'.repeat(64)}),/exact reviewed/);
  assert.throws(()=>createP2NativeManifest({model:'gpt/6.1',
    expectedCodexSha256:'A'.repeat(64),expectedClientSha256:'B'.repeat(64),
    expectedProtocolSha256:'C'.repeat(64)}),/model or timeout invalid/);
});
test('preflight does not expose prompt content or credential payloads',async t=>{
  const f=await fixture(t);
  const observed=await inspectP2NativeCandidate(f);
  const text=JSON.stringify(observed);
  assert.equal(text.includes(P2_FIXED_INPUT),false);
  assert.equal(text.includes(JSON.stringify(P2_OUTPUT_SCHEMA)),false);
  assert.equal(text.includes(f.parent),false);
});

test('reviewed Manifest hash binds the exact bytes passed to parsing',async t=>{
  const f=await fixture(t);
  const reviewed=await readFile(f.manifestPath);
  assert.doesNotThrow(()=>assertReviewedManifestBytes(reviewed,f.expectedManifestSha256));
  // A different canonical candidate is valid under its own SHA, but not
  // under a SHA approved for the previously read bytes.
  const altered=JSON.parse(reviewed.toString('utf8'));
  altered.model='gpt-6.1-other';
  const changed=Buffer.from(JSON.stringify(altered)+'\n','utf8');
  assert.throws(()=>assertReviewedManifestBytes(changed,f.expectedManifestSha256),
    /hash mismatch/);
  const newSha=createHash('sha256').update(changed).digest('hex').toUpperCase();
  assert.doesNotThrow(()=>assertReviewedManifestBytes(changed,newSha));
});
test('reviewed Manifest byte guard rejects oversized or empty contents',()=>{
  const expected='A'.repeat(64);
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(8193)])
    assert.throws(()=>assertReviewedManifestBytes(bytes,expected),/hash mismatch/);
});
