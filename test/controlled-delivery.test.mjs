import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { git } from '../src/alpha/workspace.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { applyLocalDelivery, deliveryIntent } from '../src/product/controlled-delivery.mjs';

const original = 'export const answer = 1;\n';
const changed = 'export const answer = 2;\n';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'cf-delivered-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'src/a.js'),original);
  for(const args of [['init'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]) {
    const result=await git(root,args);
    assert.equal(result.exitCode,0,result.stderr.toString());
  }
  const rev=await git(root,['rev-parse','HEAD']);
  const base=rev.stdout.toString().trim();
  const candidatePaths=['src/a.js'];
  const verifiedCandidateHash = hash([['src/a.js',hash(Buffer.from(changed))]]);
  let grants=0,intents=0;
  const opts={
    destination:root,base,files:{'src/a.js':changed},
    candidatePaths,verifiedCandidateHash,
    runId:'workflow-1',revision:1,
    authorize:async intent=>{grants++;assert.equal(intent.base,base);return true;},
    persistIntent:async intent=>{intents++;assert.equal(intent.candidateHash,verifiedCandidateHash);return 'intent-ref-1';}
  };
  return {root,base,opts,counts:()=>({grants,intents})};
}
test('approved local delivery observes matching integrated destination bytes',async t=>{
  const f=await fixture(t);
  const result=await applyLocalDelivery(f.opts);
  assert.equal(result.status,'DELIVERED_NOT_VERIFIED');
  assert.equal(result.semanticCriteriaVerified,false);
  assert.equal(result.authority,'LOCAL_OBSERVED_UNPROTECTED');
  assert.equal(result.targetTreeHash,f.opts.verifiedCandidateHash);
  assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),changed);
  assert.deepEqual(f.counts(),{grants:1,intents:1});
});
test('no implicit delivery without trusted grant',async t=>{
  const f=await fixture(t);
  await assert.rejects(applyLocalDelivery({...f.opts,authorize:async()=>false}),/not granted/);
  assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),original);
  assert.equal(f.counts().intents,0);
});
test('missing durable intent writer cannot produce a file change',async t=>{
  const f=await fixture(t);
  await assert.rejects(applyLocalDelivery({...f.opts,persistIntent:null}),/required/);
  assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),original);
});
test('user dirty tree stops before any grant or write',async t=>{
  const f=await fixture(t);await writeFile(join(f.root,'src/a.js'),'dirty');
  await assert.rejects(applyLocalDelivery(f.opts),/pending changes|Git status/);
  assert.equal(f.counts().grants,0);
  assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),'dirty');
});
test('out-of-scope file rejected before any effect',async t=>{
  const f=await fixture(t);
  await assert.rejects(applyLocalDelivery({...f.opts,files:{'src/other.js':changed}}),/scope/);
  assert.equal(f.counts().grants,0);
});
test('incorrect candidate hash cannot masquerade as delivered COMPLETE',async t=>{
  const f=await fixture(t);
  const wrong='f'.repeat(64);
  await assert.rejects(applyLocalDelivery({...f.opts,verifiedCandidateHash:wrong,
    persistIntent:async()=> 'intent-ref'}),/DESTINATION_UNCERTAIN/);
  assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),changed);
});
test('cancelled delivery leaves original file intact',async t=>{
  const f=await fixture(t);
  await assert.rejects(applyLocalDelivery({...f.opts,cancelled:()=>true}),/cancelled/);
  assert.equal(await readFile(join(f.root,'src/a.js'),'utf8'),original);
});
test('delivery intent preserves candidate and source identity',()=>{
  const intent=deliveryIntent({runId:'run',revision:1,base:'a'.repeat(40),
    destination:process.cwd(),candidateHash:'b'.repeat(64),files:{'src/a.js':changed}});
  assert.equal(intent.kind,'EXACT_LOCAL_DELIVERY_INTENT_V1');
  assert.ok(intent.fileHashes['src/a.js']);
});
