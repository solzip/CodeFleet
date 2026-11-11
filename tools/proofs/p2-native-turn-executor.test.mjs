import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn,spawnSync } from 'node:child_process';
import { mkdir,mkdtemp,readFile,readdir,realpath,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File } from './p1-appserver-handshake.mjs';
import { P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS,
  createP2NativeManifest } from './p2-native-preflight.mjs';
import { P2_LIVE_ACK_ENV,P2_LIVE_ACK_VALUE,P2_COST_ACK_ENV,
  P2_COST_ACK_VALUE,P2_NATIVE_RESERVATION,
  P2_NATIVE_TRANSCRIPT,P2_NATIVE_RESULT,main
} from './p2-native-turn-executor.mjs';

const executableFile=fileURLToPath(new URL('./p2-native-turn-executor.mjs',import.meta.url));
const preflightFile=fileURLToPath(new URL('./p2-native-preflight.mjs',import.meta.url));
const protocolFile=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const fakeServer=fileURLToPath(new URL('./p2-synthetic-appserver.mjs',import.meta.url));
const model='gpt-6.1-sol';
const grantEnv={
  [P2_LIVE_ACK_ENV]:P2_LIVE_ACK_VALUE,
  [P2_COST_ACK_ENV]:P2_COST_ACK_VALUE
};
async function setup(t){
  const parent=await realpath(await mkdtemp(join(tmpdir(),'p2-native-test-')));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const fixtureRoot=join(parent,'CodeFleet-P2-Live-FakeOnly');
  const executable=join(parent,'codex.exe');
  await mkdir(fixtureRoot);
  await mkdir(join(fixtureRoot,P2_NATIVE_ARTIFACTS));
  await writeFile(executable,'THIS_IS_A_FAKE_CODEX_EXE_FOR_NO_LIVE_TESTS');
  const expectedCodexSha256=await sha256File(executable);
  const expectedClientSha256=await sha256File(preflightFile);
  const expectedProtocolSha256=await sha256File(protocolFile);
  const expectedExecutorSha256=await sha256File(executableFile);
  const manifest=createP2NativeManifest({
    model,expectedCodexSha256,expectedClientSha256,
    expectedProtocolSha256,timeoutMs:1500
  });
  const manifestPath=join(fixtureRoot,P2_NATIVE_MANIFEST);
  await writeFile(manifestPath,JSON.stringify(manifest)+'\n');
  const expectedManifestSha256=await sha256File(manifestPath);
  const args=['--execute','--ack-unknown-cost',
    '--codex-exe',executable,'--fixture',fixtureRoot,
    '--codex-sha256',expectedCodexSha256,
    '--preflight-sha256',expectedClientSha256,
    '--protocol-sha256',expectedProtocolSha256,
    '--manifest-sha256',expectedManifestSha256,
    '--executor-sha256',expectedExecutorSha256,
    '--model',model
  ];
  return {parent,fixtureRoot,executable,expectedCodexSha256,
    expectedClientSha256,expectedProtocolSha256,expectedExecutorSha256,
    expectedManifestSha256,args};
}
function fakeSpawner(scenario='success',counter){
  return (file,args,opts)=>{
    assert.equal(typeof file,'string');
    assert.equal(args.join('|'),'app-server|--listen|stdio://|--strict-config');
    assert.equal(opts.shell,false);
    assert.equal(opts.windowsHide,true);
    if(counter)counter.calls++;
    return spawn(process.execPath,[fakeServer],{
      ...opts,
      env:{...opts.env,CODEFLEET_P2_FAKE_SCENARIO:scenario}
    });
  };
}
async function runFake(f,scenario='success',counter){
  return main(f.args,grantEnv,{spawnImpl:fakeSpawner(scenario,counter)});
}
function failResult(result){
  assert.equal(result.status,'P2_NATIVE_TURN_FAILED');
  assert.equal(result.passed,false);
  assert.equal(result.p2Accepted,false);
  assert.equal(result.hostLiveVerified,false);
  assert.equal(result.replayAllowed,false);
  assert.equal(result.appServerExecutionAuthenticated,false);
  assert.equal(result.modelTurnsActuallyRun,0);
  assert.equal(result.syntheticTestAdapter,true);
  assert.equal(result.ownerIdentityIndependentlyAuthenticated,false);
  assert.equal(result.costCapEnforced,false);
  assert.equal(result.error,'P2_FAILED_OR_UNVERIFIED_REVIEW_REQUIRED');
}
test('no args is safe dry-run, never launches Codex',async()=>{
  let called=false;
  const result=await main([],grantEnv,{spawnImpl:()=>{called=true;}});
  assert.equal(called,false);
  assert.equal(result.status,'P2_NATIVE_EXECUTOR_DRY_ONLY');
  assert.equal(result.nativeCodexStarted,false);
  assert.equal(result.costCapEnforced,false);
  assert.equal(result.modelTurnsActuallyRun,0);
});
test('no owner acknowledgement is denied before any fixture writes/spawn',async t=>{
  const f=await setup(t);
  const counter={calls:0};
  await assert.rejects(main(f.args,{},{
    spawnImpl:fakeSpawner('success',counter)}),/separate owner acknowledgement/);
  assert.equal(counter.calls,0);
  assert.deepEqual((await readdir(f.fixtureRoot)).sort(),
    [P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS].sort());
});
test('missing unknown-cost acceptance is denied before any native dispatch',async t=>{
  const f=await setup(t);
  const counter={calls:0};
  await assert.rejects(main(f.args,{[P2_LIVE_ACK_ENV]:P2_LIVE_ACK_VALUE},{
    spawnImpl:fakeSpawner('success',counter)}),/unknown-cost risk acceptance/);
  assert.equal(counter.calls,0);
  assert.deepEqual(await readdir(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS)),[]);
});
test('exact mocked native path executes one bounded read-only Turn and stores minimal evidence',async t=>{
  const f=await setup(t);
  const counter={calls:0};
  const result=await runFake(f,'success',counter);
  assert.equal(counter.calls,1);
  assert.equal(result.status,'P2_NATIVE_TURN_OBSERVED_PENDING_INDEPENDENT_REVIEW');
  assert.equal(result.passed,true);
  assert.equal(result.outboundTurnStartCount,1);
  assert.equal(result.termination.confirmed,true);
  assert.equal(result.termination.code,0);
  assert.equal(result.termination.signal,null);
  assert.equal(result.termination.forced,false);
  assert.equal(result.model,model);
  assert.equal(result.syntheticTestAdapter,true);
  assert.equal(result.nativeCodexStarted,false);
  assert.equal(result.modelTurnsActuallyRun,0);
  assert.equal(result.ownerAcknowledgementObserved,true);
  assert.equal(result.ownerIdentityIndependentlyAuthenticated,false);
  assert.equal(result.readOnlyRequested,true);
  assert.equal(result.readOnlyEnforced,false);
  assert.equal(result.costCapEnforced,false);
  assert.equal(result.costStatus,'UNKNOWN');
  assert.equal(result.p2Accepted,false);
  const rootFiles=(await readdir(f.fixtureRoot)).sort();
  assert.deepEqual(rootFiles,[P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS,P2_NATIVE_RESERVATION].sort());
  const artifactFiles=(await readdir(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS))).sort();
  assert.deepEqual(artifactFiles,[P2_NATIVE_TRANSCRIPT,P2_NATIVE_RESULT].sort());
  const recorded=JSON.parse(await readFile(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_RESULT)));
  assert.equal(recorded.traceSha256,result.traceSha256);
  const trace=await readFile(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_TRANSCRIPT),'utf8');
  assert.deepEqual(trace.split('\n').filter(Boolean).map(line=>JSON.parse(line))
    .filter(x=>x.direction==='out').map(x=>x.method),
    ['initialize','initialized','thread/start','turn/start']);
});
test('a second native attempt must not overwrite launch marker or evidence',async t=>{
  const f=await setup(t);
  await runFake(f);
  const before=await readFile(join(f.fixtureRoot,P2_NATIVE_RESERVATION));
  let spawnCalls=0;
  await assert.rejects(main(f.args,grantEnv,{spawnImpl:()=>{
    spawnCalls++;throw Error('MUST_NOT_SPAWN');
  }}),/extra or missing entries|occupied/);
  assert.equal(spawnCalls,0);
  assert.deepEqual(await readFile(join(f.fixtureRoot,P2_NATIVE_RESERVATION)),before);
});
test('concurrent attempts permit only one native process launch',async t=>{
  const f=await setup(t);
  const calls={calls:0};
  const results=await Promise.allSettled([runFake(f,'success',calls),runFake(f,'success',calls)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal(calls.calls,1);
});
test('invalid model or changed Codex digest is rejected pre-reservation',async t=>{
  const f=await setup(t);
  const counter={calls:0};
  const badModel=[...f.args];badModel[badModel.indexOf('--model')+1]='gpt-5.6-terra';
  await assert.rejects(main(badModel,grantEnv,{spawnImpl:fakeSpawner('success',counter)}),
    /model or native executable changed/);
  const badHash=[...f.args];badHash[badHash.indexOf('--codex-sha256')+1]='A'.repeat(64);
  await assert.rejects(main(badHash,grantEnv,{spawnImpl:fakeSpawner('success',counter)}),
    /hash mismatch/);
  assert.equal(counter.calls,0);
  assert.deepEqual(await readdir(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS)),[]);
});
test('wrong executor SHA is rejected before launch marker and process',async t=>{
  const f=await setup(t);
  const args=[...f.args];
  args[args.indexOf('--executor-sha256')+1]='B'.repeat(64);
  const calls={calls:0};
  await assert.rejects(main(args,grantEnv,{spawnImpl:fakeSpawner('success',calls)}),
    /executor source SHA-256 mismatch/);
  assert.equal(calls.calls,0);
  assert.deepEqual((await readdir(f.fixtureRoot)).sort(),
    [P2_NATIVE_MANIFEST,P2_NATIVE_ARTIFACTS].sort());
});
test('native simulator tool and server-approval requests are fail-closed',async t=>{
  const f=await setup(t);
  for(const [i,scenario] of ['tool','server_request','unknown_notification'].entries()){
    const root=join(f.parent,'CodeFleet-P2-Live-Negative'+i);
    await mkdir(root);await mkdir(join(root,P2_NATIVE_ARTIFACTS));
    const source=await readFile(join(f.fixtureRoot,P2_NATIVE_MANIFEST));
    await writeFile(join(root,P2_NATIVE_MANIFEST),source);
    const args=[...f.args];
    args[args.indexOf('--fixture')+1]=root;
    failResult(await main(args,grantEnv,{spawnImpl:fakeSpawner(scenario)}));
  }
});
test('sandbox escalation cannot emit a turn/start command',async t=>{
  const f=await setup(t);
  failResult(await runFake(f,'bad_sandbox'));
  const trace=await readFile(join(f.fixtureRoot,P2_NATIVE_ARTIFACTS,P2_NATIVE_TRANSCRIPT),'utf8');
  assert.equal(trace.includes('"method":"turn/start"'),false);
});
test('wrong Turn IDs, duplicate completions and bad final text fail',async t=>{
  const f=await setup(t);
  for(const [i,scenario] of ['wrong_turn','duplicate','bad_output'].entries()){
    const root=join(f.parent,'CodeFleet-P2-Live-Bad'+i);
    await mkdir(root);await mkdir(join(root,P2_NATIVE_ARTIFACTS));
    await writeFile(join(root,P2_NATIVE_MANIFEST),
      await readFile(join(f.fixtureRoot,P2_NATIVE_MANIFEST)));
    const args=[...f.args];args[args.indexOf('--fixture')+1]=root;
    failResult(await main(args,grantEnv,{spawnImpl:fakeSpawner(scenario)}));
  }
});
test('stderr or nonzero exit cannot be successful proof',async t=>{
  const f=await setup(t);
  failResult(await runFake(f,'stderr'));
  const childRoot=join(f.parent,'CodeFleet-P2-Live-Nonzero');
  await mkdir(childRoot);await mkdir(join(childRoot,P2_NATIVE_ARTIFACTS));
  await writeFile(join(childRoot,P2_NATIVE_MANIFEST),
    await readFile(join(f.fixtureRoot,P2_NATIVE_MANIFEST)));
  const args=[...f.args];args[args.indexOf('--fixture')+1]=childRoot;
  const nonzero=await main(args,grantEnv,{spawnImpl:fakeSpawner('nonzero')});
  failResult(nonzero);
  assert.equal(nonzero.termination.code,7);
});
test('unterminated JSONL cannot succeed after valid completed Turn',async t=>{
  const f=await setup(t);
  failResult(await runFake(f,'trailing'));
});
test('nonreply/hung child is force stopped under bounded timeout',async t=>{
  const f=await setup(t);
  const r=await runFake(f,'hang');
  failResult(r);
  assert.equal(r.termination.confirmed,true);
  assert.equal(r.termination.forced,true);
  await assert.rejects(runFake(f),/extra or missing entries|occupied/);
});
test('fake account payload is stripped; final text absent from public Evidence',async t=>{
  const f=await setup(t);
  const r=await runFake(f,'metadata');
  assert.equal(r.passed,true);
  const dir=join(f.fixtureRoot,P2_NATIVE_ARTIFACTS);
  const record=await readFile(join(dir,P2_NATIVE_RESULT),'utf8');
  const trace=await readFile(join(dir,P2_NATIVE_TRANSCRIPT),'utf8');
  assert.equal((record+trace).includes('DO_NOT_COPY_PRIVATE_TOKEN_FAKE_VALUE'),false);
  assert.equal((record+trace).includes('{"proof":"P2_READ_ONLY_REPLY"}'),false);
  assert.equal(trace.includes('account/updated'),true);
});
test('unexpected execute CLI arguments never trigger a native process',()=>{
  const noArgs=spawnSync(process.execPath,[executableFile],{encoding:'utf8',shell:false});
  assert.equal(noArgs.status,0,noArgs.stderr);
  assert.equal(JSON.parse(noArgs.stdout).status,'P2_NATIVE_EXECUTOR_DRY_ONLY');
  for(const flags of [
    ['--execute'],['--execute','--approve'],
    ['--execute','--ack-unknown-cost'],
    ['--execute','--ack-unknown-cost','--foo','bar']
  ]){
    const denied=spawnSync(process.execPath,[executableFile,...flags],
      {encoding:'utf8',shell:false});
    assert.equal(denied.status,2);
    assert.equal(JSON.parse(denied.stdout).p2Accepted,false);
  }
});
