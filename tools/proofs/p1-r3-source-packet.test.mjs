import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildR3SourcePacket, R3_CLIENT_SHA256, main } from './p1-r3-source-packet.mjs';
import { sha256File, validateIdentity } from './p1-appserver-handshake.mjs';

const cli = fileURLToPath(new URL('./p1-r3-source-packet.mjs', import.meta.url));
const sourceClient = fileURLToPath(new URL('./p1-appserver-handshake.mjs', import.meta.url));

test('R3 packet binds exact reviewed client bytes and excludes execution authority', async () => {
  const packet = await buildR3SourcePacket();
  assert.equal(packet.binding.candidateClientSha256, R3_CLIENT_SHA256);
  assert.equal(await sha256File(sourceClient), R3_CLIENT_SHA256);
  assert.match(packet.binding.inputSha256,/^[A-F0-9]{64}$/);
  assert.match(packet.binding.candidateManifestSha256,/^[A-F0-9]{64}$/);
  assert.equal(packet.binding.fixturePrepared,false);
  assert.equal(packet.binding.nativeCodexObserved,false);
  assert.equal(packet.binding.ownerFixtureObserved,false);
  assert.equal(packet.binding.executionAuthorized,false);
  assert.equal(packet.binding.hostLiveVerified,false);
  assert.equal(packet.binding.ownerApproval,'NOT_GRANTED');
  assert.equal(packet.inputBytes.toString('utf8'),
    'CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1\n');
});

test('generated candidate manifest matches existing strict P1 identity validator on a disposable fake fixture',async t=>{
  const packet=await buildR3SourcePacket();
  const parent=await realpath(await mkdtemp(join(tmpdir(),'cf-r3-packet-offline-')));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const fixture=join(parent,'fixture');
  const exe=join(parent,'fake-codex-never-run.bin');
  await mkdir(fixture);
  await mkdir(join(fixture,'proof-artifacts'));
  await mkdir(join(fixture,'proof-client'));
  const client=join(fixture,'proof-client','p1-appserver-handshake.mjs');
  const input=join(fixture,'input.txt'),manifest=join(fixture,'fixture-manifest.json');
  await cp(sourceClient,client);
  await writeFile(exe,'FAKE CODEX NOT EXECUTED');
  await writeFile(input,packet.inputBytes,{flag:'wx'});
  await writeFile(manifest,packet.manifestBytes,{flag:'wx'});
  const expected={
    codex:await sha256File(exe),
    client:packet.binding.candidateClientSha256,
    input:packet.binding.inputSha256,
    manifest:packet.binding.candidateManifestSha256
  };
  const roots=await readdir(fixture);
  const result=await validateIdentity({
    codexExe:exe,fixture,artifacts:join(fixture,'proof-artifacts'),manifest,
    codexSha256:expected.codex,clientSha256:expected.client,
    inputSha256:expected.input,manifestSha256:expected.manifest
  },{clientPath:client,platform:'test'});
  assert.equal(result.hashes.client,expected.client);
  assert.equal(result.hashes.manifest,expected.manifest);
  assert.deepEqual(await readdir(fixture),roots);
  assert.deepEqual(await readdir(join(fixture,'proof-artifacts')),[]);
});

test('a changed or unreviewed client source cannot produce an R3 packet',async t=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),'cf-r3-forged-source-')));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const fake=join(dir,'p1-appserver-handshake.mjs');
  await writeFile(fake,'UNREVIEWED_CLIENT_SOURCE');
  await assert.rejects(buildR3SourcePacket(fake),/reviewed client source digest mismatch/);
});

test('CLI emits the unapproved digest packet without writing a fixture',()=>{
  const result=spawnSync(process.execPath,[cli],{encoding:'utf8',shell:false});
  assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);
  assert.equal(output.status,'P1_R3_SOURCE_BINDING_CANDIDATE_UNAPPROVED');
  assert.equal(output.fixturePrepared,false);
  assert.equal(output.executionAuthorized,false);
  assert.equal(output.ownerApproval,'NOT_GRANTED');
  assert.equal(output.nativeCodexSha256,null);
  assert.equal(result.stdout.includes('FAKE CODEX'),false);
});

test('CLI rejects fixture writing, execution and arbitrary hash flags',()=>{
  for(const flag of ['--prepare','--execute','--client-sha256']){
    const result=spawnSync(process.execPath,[cli,flag],{encoding:'utf8',shell:false});
    assert.equal(result.status,2,result.stderr);
    const output=JSON.parse(result.stdout);
    assert.equal(output.status,'P1_R3_SOURCE_BINDING_BLOCKED');
    assert.equal(output.executionAuthorized,false);
    assert.equal(output.ownerApproval,'NOT_GRANTED');
  }
  assert.deepEqual(main.constructor.name,'AsyncFunction');
});
