import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, fingerprint } from '../../src/hosts/operator.mjs';
import {
  createP2SignedScopeBinding,inspectP2SignedScope,main
} from './p2-signed-scope-preflight.mjs';

const executableFile=fileURLToPath(new URL('./p2-signed-scope-preflight.mjs',import.meta.url));
const NOW=1794360000000;
const clone=value=>JSON.parse(JSON.stringify(value));
function scope(){
  return {
    requestId:'p2-readonly-request-0001',
    nonce:'a'.repeat(32),
    fixtureRoot:join(tmpdir(),'CodeFleet-P2-Live-SignedScope'),
    sourceRevision:'b'.repeat(40),
    model:'gpt-6.1-sol',
    nativeCodexSha256:'A'.repeat(64),
    preflightSha256:'B'.repeat(64),
    protocolSha256:'C'.repeat(64),
    executorSha256:'D'.repeat(64),
    manifestSha256:'E'.repeat(64),
    maxTurns:1,ephemeral:true,sandbox:'read-only',
    approvalPolicy:'never',toolNetworkAccess:false,
    unknownCostAcknowledged:true,costCapEnforced:false
  };
}
function signed({kind='APPROVE',expiresAt=NOW+60000,approvedScope=scope()}={}){
  const keys=generateKeyPairSync('ed25519');
  const pem=keys.publicKey.export({type:'spki',format:'pem'});
  const decision={id:approvedScope.requestId,kind,
    binding:createP2SignedScopeBinding(approvedScope),
    principal:fingerprint(pem),expiresAt,maxUses:1};
  return {scope:approvedScope,pem,decisionEnvelope:{
    decision,signature:sign(null,Buffer.from(canonical(decision)),
      keys.privateKey).toString('hex')}};
}
const inspect=(s,extra={})=>inspectP2SignedScope({
  expectedScope:s.scope,decisionEnvelope:s.decisionEnvelope,
  trustedOperatorKeys:[s.pem],clock:()=>NOW,...extra
});
test('trusted-key signature and exact scope validate but never authorize execution',()=>{
  const s=signed();const receipt=inspect(s);
  assert.equal(receipt.status,'P2_SIGNED_SCOPE_INTEGRITY_MATCHED_NOT_AUTHORIZED');
  assert.equal(receipt.signerKeyFingerprint,fingerprint(s.pem));
  assert.equal(receipt.signatureAndScopeChecked,true);
  for(const key of ['trustedOwnerIdentityEstablished',
    'trustedOperatorRuntimeEstablished','executionAuthorized',
    'nativeCodexStarted','hostLiveVerified','p2Accepted',
    'replayAllowed','replayPreventionEnforced','costCapEnforced',
    'osSandboxEnforcementVerified'])
    assert.equal(receipt[key],false,key);
  assert.equal(receipt.modelTurnsActuallyRun,0);
  assert.equal(receipt.subscriptionCostStatus,'UNKNOWN');
  assert.deepEqual(inspect(s),receipt);
});
test('different independently expected model/root/manifest/executor/revision/nonce are denied',()=>{
  const s=signed();
  for(const [key,value] of [
    ['model','gpt-6.1-other'],['fixtureRoot',join(tmpdir(),'CodeFleet-P2-Live-Other')],
    ['manifestSha256','F'.repeat(64)],['executorSha256','1'.repeat(64)],
    ['sourceRevision','a'.repeat(40)],['nonce','f'.repeat(32)],
    ['requestId','p2-readonly-request-0002']]){
    const expected=clone(s.scope);expected[key]=value;
    assert.throws(()=>inspect(s,{expectedScope:expected}),/does not match independently expected scope/);
  }
});
test('tampered signed decision or wrong enrolled operator key is rejected',()=>{
  const s=signed();
  const bad=clone(s.decisionEnvelope);bad.signature='0'.repeat(128);
  assert.throws(()=>inspect(s,{decisionEnvelope:bad}),/signed decision invalid/);
  const other=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>inspect(s,{trustedOperatorKeys:[other]}),/signed decision invalid/);
});
test('expires, too-long validity, deny and revoke never pass',()=>{
  for(const kind of ['DENY','REVOKE'])
    assert.throws(()=>inspect(signed({kind})),/does not match independently expected scope/);
  assert.throws(()=>inspect(signed({expiresAt:NOW-1})),/signed decision invalid/);
  assert.throws(()=>inspect(signed({expiresAt:NOW+16*60000})),/validity exceeds/);
});
test('maxUses or unknown extra fields are rejected by core Operator verifier',()=>{
  const s=signed(), bad=clone(s.decisionEnvelope);
  bad.decision.maxUses=2;
  assert.throws(()=>inspect(s,{decisionEnvelope:bad}),/signed decision invalid/);
  bad.decision.maxUses=1;bad.decision.unreviewed='auto';
  assert.throws(()=>inspect(s,{decisionEnvelope:bad}),/signed decision invalid/);
});
test('unsupported write, tool network, cost guarantee or multiple turns cannot be signed as P2',()=>{
  for(const [key,value] of [
    ['sandbox','workspace-write'],['approvalPolicy','on-request'],
    ['toolNetworkAccess',true],['maxTurns',2],['ephemeral',false],
    ['unknownCostAcknowledged',false],['costCapEnforced',true]]){
    const changed=scope();changed[key]=value;
    assert.throws(()=>createP2SignedScopeBinding(changed),/policy or cost acknowledgement invalid/);
  }
});
test('bad scope types, digest casing and additional fields fail closed',()=>{
  for(const [key,value] of [
    ['model','gpt/invalid'],['nativeCodexSha256','a'.repeat(64)],
    ['sourceRevision','B'.repeat(40)],['nonce','X'.repeat(32)],
    ['fixtureRoot','relative/p2'],['requestId','!'],
    ['manifestSha256','']]){
    const changed=scope();changed[key]=value;
    assert.throws(()=>createP2SignedScopeBinding(changed),/invalid/);
  }
  const changed={...scope(),unexpectedGrant:true};
  assert.throws(()=>createP2SignedScopeBinding(changed),/fields must be exact/);
});
test('unsigned envelope, missing enrollment and invalid clock do not authenticate a user',()=>{
  const s=signed();
  assert.throws(()=>inspect(s,{trustedOperatorKeys:[]}),/signed decision invalid/);
  assert.throws(()=>inspect(s,{decisionEnvelope:{decision:s.decisionEnvelope.decision}}),/signed decision invalid/);
  assert.throws(()=>inspect(s,{clock:()=>Number.NaN}),/clock invalid/);
});
test('inspection is replayable because it provides no durable admission or execution',()=>{
  const s=signed();
  assert.equal(inspect(s).executionAuthorized,false);
  assert.equal(inspect(s).replayPreventionEnforced,false);
  assert.equal(inspect(s).nativeCodexStarted,false);
});
test('CLI has no --approve, --sign or --execute path',()=>{
  const ok=spawnSync(process.execPath,[executableFile],{encoding:'utf8',shell:false});
  assert.equal(ok.status,0,ok.stderr);
  assert.equal(JSON.parse(ok.stdout).status,'P2_SIGNED_SCOPE_LIBRARY_REVIEW_ONLY');
  for(const arg of ['--approve','--sign','--execute','--grant']){
    const denied=spawnSync(process.execPath,[executableFile,arg],{
      encoding:'utf8',shell:false});
    assert.equal(denied.status,2);
    assert.equal(JSON.parse(denied.stdout).executionAuthorized,false);
  }
  assert.throws(()=>main(['--execute']),/no sign, grant or execute CLI/);
});
