import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/codex-live-acceptance.mjs',import.meta.url));
function call(args,expected=0){
  const result=spawnSync(process.execPath,[script,...args],{
    encoding:'utf8',windowsHide:true,shell:false,timeout:30000
  });
  assert.equal(result.status,expected,result.stderr+'\n'+result.stdout);
  return result.stdout.trim()?JSON.parse(result.stdout):null;
}
async function fixture(t){
  const parent=await mkdtemp(join(tmpdir(),'cf-live-harness-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const dir=join(parent,'live fixture with spaces');
  const prepared=call(['prepare','--dir',dir]);
  assert.equal(prepared.status,'READY_FOR_EXPLICIT_CODEX_LIVE_TURN');
  return {parent,dir};
}
test('Codex live acceptance prepare creates pinned isolated fixture, no bill or completion',async t=>{
  const f=await fixture(t);
  const status=call(['status','--dir',f.dir]);
  assert.equal(status.status,'NOT_STARTED');
  assert.equal(status.actualCodexTurnObserved,false);
  assert.equal(status.currentTreeComplete,false);
  assert.equal(status.ownerGrantInMcp,false);
  call(['review','--dir',f.dir],1);
  const blocked=call(['finalize','--dir',f.dir],2);
  assert.equal(blocked.verdict,'BLOCKED_OR_INCOMPLETE');
  assert.ok(blocked.reasons.some(s=>s.includes('No successful')));
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  call(['prepare','--dir',f.dir],1);
});
test('real Codex Turn requires both owner flags; uncertain effect is durable one-shot',async t=>{
  const f=await fixture(t);
  for(const flagSet of [[],['--allow-model-turn'],['--acknowledge-unknown-cost']]){
    call(['run','--dir',f.dir,...flagSet],1);
    assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  }
  const unsupported=join(f.parent,'wrong-version.mjs');
  await writeFile(unsupported,"console.log('codex-cli 0.100.0')\n");
  call(['run','--dir',f.dir,'--codex',unsupported,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  const noLogin=join(f.parent,'synthetic-no-login.mjs');
  await writeFile(noLogin,[
    "if(process.argv.includes('--version')){console.log('codex-cli 0.167.1');process.exit(0)}",
    "if(process.argv.includes('login')){process.exit(1)}",
    "process.exit(2)"
  ].join('\n'));
  const noAuth=call(['preflight','--dir',f.dir,'--codex',noLogin],2);
  assert.equal(noAuth.status,'BLOCKED_CODEX_LOGIN_UNAVAILABLE');
  assert.equal(noAuth.readyForLiveTurn,false);
  assert.equal(noAuth.modelTurnsStarted,0);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  call(['run','--dir',f.dir,'--codex',noLogin,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  call(['preflight','--dir',f.dir,'--allow-model-turn'],1);
  const fake=join(f.parent,'synthetic-only.mjs');
  await writeFile(fake,[
    "if(process.argv.includes('--version'))console.log('codex-cli 0.167.1');",
    "else if(process.argv.includes('login'))process.stderr.write('Synthetic fixture login only');",
    "else if(process.argv.includes('exec')){",
    "console.log(JSON.stringify({type:'thread.started',thread_id:'SYNTHETIC-NEVER-LIVE'}));",
    "console.log(JSON.stringify({type:'turn.started'}));",
    "console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));",
    "}"
  ].join('\n'));
  const ready=call(['preflight','--dir',f.dir,'--codex',fake]);
  assert.equal(ready.status,'READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL');
  assert.equal(ready.modelTurnsStarted,0);
  assert.equal(ready.costStatus,'UNKNOWN');
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
  const run=call(['run','--dir',f.dir,'--codex',fake,
    '--allow-model-turn','--acknowledge-unknown-cost']);
  assert.equal(run.status,'HUMAN_RECONCILIATION_REQUIRED',
    'Synthetic JSONL with no CodeFleet Task cannot complete a Live gate');
  const reserved=call(['preflight','--dir',f.dir,'--codex',fake],2);
  assert.equal(reserved.status,'BLOCKED_TURN_ALREADY_RESERVED');
  const receipt=JSON.parse(await readFile(join(f.dir,'turn-receipt.json'),'utf8'));
  assert.equal(receipt.pendingExactFilesetReviewObserved,false);
  assert.equal(receipt.projectUnchangedByModel,true);
  assert.equal(receipt.costStatus,'UNKNOWN');
  assert.equal(receipt.authenticatedOwner,false);
  assert.equal(call(['status','--dir',f.dir]).actualCodexTurnObserved,false);
  call(['run','--dir',f.dir,'--codex',fake,
    '--allow-model-turn','--acknowledge-unknown-cost'],1);
  const result=call(['finalize','--dir',f.dir],2);
  assert.equal(result.verdict,'BLOCKED_OR_INCOMPLETE');
  assert.equal(result.protectedVerified,false);
});
test('tampered immutable tests refuse inspection and completion before model spawn',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.dir,'project','test','todo.test.mjs'),'// changed test\n');
  call(['status','--dir',f.dir],1);
  call(['finalize','--dir',f.dir],1);
  assert.equal(await lstat(join(f.dir,'turn-intent.json')).catch(()=>null),null);
});
