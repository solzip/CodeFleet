import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir,mkdtemp,readFile,realpath,readdir,rm,lstat,open,symlink,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File } from './p1-appserver-handshake.mjs';
import {
  P2_INTENT_FILE,prepareP2OfflineIntent,readP2OfflineIntent
} from './p2-one-shot-offline-intent.mjs';

const source=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const cli=fileURLToPath(new URL('./p2-one-shot-offline-intent.mjs',import.meta.url));
async function fixture(t){
  const parent=await realpath(await mkdtemp(join(tmpdir(),'p2-parent-offline-')));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const root=join(parent,'codefleet-p2-synthetic');
  await mkdir(root);
  const executable=join(parent,'fake-native-codex-never-run.exe');
  await writeFile(executable,'OFFLINE_FAKE_BIN_DO_NOT_LAUNCH');
  const expectedNativeSha256=await sha256File(executable);
  const expectedProtocolSha256=await sha256File(source);
  return {parent,root,executable,expectedNativeSha256,expectedProtocolSha256,
    model:'fake-model-1',timeoutMs:90000};
}
const intentPath=f=>join(f.root,P2_INTENT_FILE);

test('one synthetic intent is durably written with no execution permission',async t=>{
  const f=await fixture(t);
  const result=await prepareP2OfflineIntent(f);
  assert.equal(result.status,'P2_OFFLINE_INTENT_RECORDED_NOT_AUTHORIZED');
  assert.equal(result.ownerApproval,'NOT_GRANTED');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.replayAllowed,false);
  assert.equal(result.hostLiveVerified,false);
  assert.equal(result.appServerStarted,false);
  assert.equal(result.modelTurnsActuallyRun,0);
  assert.equal(result.subscriptionCost,'UNKNOWN');
  assert.equal(result.protocolSha256,f.expectedProtocolSha256);
  assert.equal(result.nativeSha256,f.expectedNativeSha256);
  assert.equal(result.model,f.model);
  assert.deepEqual(await readdir(f.root),[P2_INTENT_FILE]);
  const reread=await readP2OfflineIntent(f.root);
  assert.equal(reread.status,'P2_OFFLINE_INTENT_PRESENT_NO_REPLAY');
  assert.equal(reread.intentSha256,result.intentSha256);
  assert.equal(reread.replayAllowed,false);
  assert.equal(reread.executionAuthorized,false);
});

test('duplicate preparation refuses a second intent and preserves original bytes',async t=>{
  const f=await fixture(t);
  await prepareP2OfflineIntent(f);
  const before=await readFile(intentPath(f));
  await assert.rejects(prepareP2OfflineIntent(f),/occupied; no replay/);
  assert.deepEqual(await readFile(intentPath(f)),before);
});

test('competing reservations have one winner and no automatic replay',async t=>{
  const f=await fixture(t);
  const outcomes=await Promise.allSettled([
    prepareP2OfflineIntent(f),prepareP2OfflineIntent(f)
  ]);
  const wins=outcomes.filter(x=>x.status==='fulfilled');
  const denied=outcomes.filter(x=>x.status==='rejected');
  assert.equal(wins.length,1);
  assert.equal(denied.length,1);
  assert.equal(wins[0].value.executionAuthorized,false);
  assert.equal(wins[0].value.replayAllowed,false);
  assert.equal((await readdir(f.root)).length,1);
});

test('failed native binary identity creates no new journal',async t=>{
  const f=await fixture(t);
  await assert.rejects(prepareP2OfflineIntent({
    ...f,expectedNativeSha256:'A'.repeat(64)
  }),/SHA-256 mismatch/);
  assert.deepEqual(await readdir(f.root),[]);
});

test('failed P2 source identity creates no new journal',async t=>{
  const f=await fixture(t);
  await assert.rejects(prepareP2OfflineIntent({
    ...f,expectedProtocolSha256:'0'.repeat(64)
  }),/SHA-256 mismatch/);
  assert.deepEqual(await readdir(f.root),[]);
});

test('occupied user fixture is not modified by a synthetic reservation',async t=>{
  const f=await fixture(t);
  const note=join(f.root,'do-not-touch.txt');
  await writeFile(note,'OWNER DATA');
  await assert.rejects(prepareP2OfflineIntent(f),/occupied/);
  assert.equal(await readFile(note,'utf8'),'OWNER DATA');
  assert.deepEqual(await readdir(f.root),['do-not-touch.txt']);
});

test('malformed or oversized model/time values never write',async t=>{
  const f=await fixture(t);
  for(const patch of [
    {model:''},{model:'invalid/model'},
    {model:'x'.repeat(200)},{timeoutMs:0},{timeoutMs:90001},
    {timeoutMs:1.5},{expectedNativeSha256:'NOT_HASH'}
  ]){
    await assert.rejects(prepareP2OfflineIntent({...f,...patch}));
    assert.deepEqual(await readdir(f.root),[]);
  }
});

test('P1 R3 or user project root is never accepted as P2 synthetic root',async t=>{
  const f=await fixture(t);
  await assert.rejects(prepareP2OfflineIntent({...f,root:f.parent}),
    /explicitly isolated synthetic test root/);
  const userRoot=join(f.parent,'CodeFleet-P1-R3-owner');
  await mkdir(userRoot);
  await assert.rejects(prepareP2OfflineIntent({...f,root:userRoot}),
    /explicitly isolated synthetic test root/);
  assert.deepEqual(await readdir(userRoot),[]);
});

test('directory alias or junction is refused before any writes',async t=>{
  const f=await fixture(t);
  const alias=join(f.parent,'codefleet-p2-linked-fixture');
  try {await symlink(f.root,alias,process.platform==='win32'?'junction':'dir')}
  catch(e){
    if(['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(e.code)){
      t.skip('Junction/symlink unavailable on runner');return;
    }
    throw e;
  }
  await assert.rejects(prepareP2OfflineIntent({...f,root:alias}),
    /link or alias unsupported/);
  assert.deepEqual(await readdir(f.root),[]);
});

test('corrupt or partially written intent must remain occupied and untrusted',async t=>{
  const f=await fixture(t);
  const file=await open(intentPath(f),'wx',0o600);
  try{await file.writeFile('{"body":')}
  finally{await file.close()}
  await assert.rejects(readP2OfflineIntent(f.root),/intent JSON invalid/);
  await assert.rejects(prepareP2OfflineIntent(f),/occupied/);
  assert.equal(await readFile(intentPath(f),'utf8'),'{"body":');
});

test('after successful write a changed checksum cannot pass readonly reconciliation',async t=>{
  const f=await fixture(t);
  await prepareP2OfflineIntent(f);
  const path=intentPath(f);
  const body=JSON.parse(await readFile(path,'utf8'));
  body.body.unknownSubscriptionCost=false;
  await writeFile(path,JSON.stringify(body)+'\n');
  await assert.rejects(readP2OfflineIntent(f.root),/content or checksum invalid/);
  await assert.rejects(prepareP2OfflineIntent(f),/occupied/);
});

test('a forged owner approval or execution-enabled intent is never treated as valid',async t=>{
  const f=await fixture(t);
  await prepareP2OfflineIntent(f);
  const path=intentPath(f);
  const body=JSON.parse(await readFile(path,'utf8'));
  body.body.executionAuthorized=true;
  body.body.ownerApproval='APPROVED';
  // A caller changing only fields is not a signer; even a matching structure
  // cannot become live authority from a writable local JSON file.
  await writeFile(path,JSON.stringify(body)+'\n');
  await assert.rejects(readP2OfflineIntent(f.root),/content or checksum invalid/);
});

test('offline CLI never accepts a native path or approval/execution flags',()=>{
  const good=spawnSync(process.execPath,[cli],{encoding:'utf8',shell:false});
  assert.equal(good.status,0,good.stderr);
  const state=JSON.parse(good.stdout);
  assert.equal(state.status,'P2_OFFLINE_JOURNAL_LIBRARY_ONLY');
  assert.equal(state.nativeCodexStarted,false);
  assert.equal(state.modelTurnsActuallyRun,0);
  assert.equal(state.executionAuthorized,false);
  assert.equal(state.ownerApproval,'NOT_GRANTED');
  assert.equal(state.replayAllowed,false);
  for(const option of ['--execute','--reserve','--approve','--model','--cost-usd']){
    const out=spawnSync(process.execPath,[cli,option],{encoding:'utf8',shell:false});
    assert.equal(out.status,2,out.stderr);
    const parsed=JSON.parse(out.stdout);
    assert.equal(parsed.status,'P2_OFFLINE_JOURNAL_BLOCKED');
    assert.equal(parsed.executionAuthorized,false);
    assert.equal(parsed.modelTurnsActuallyRun,0);
    assert.equal(parsed.replayAllowed,false);
  }
});
