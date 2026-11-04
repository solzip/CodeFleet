import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../src/alpha/contract.mjs';
import { createLocalDestinationVerifier } from '../src/product/destination-evidence.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'cf-destination-evidence-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'src'));await writeFile(join(root,'src/a.js'),'export const answer = 42;');
 const targetHash=hash([['src/a.js',hash(Buffer.from('export const answer = 42;'))]]);
 const run={id:'run-1',revision:1,repo:root,contractHash:'a'.repeat(64)};
 const delivery={status:'DELIVERED_NOT_VERIFIED',candidateHash:targetHash,targetTreeHash:targetHash};
 const candidate={repo:root,candidateHash:targetHash,candidatePaths:['src/a.js']};
 const recorded=new Map();
 const store={artifact:e=>{const ref=hash(e);recorded.set(ref,e);return ref;},
  readArtifact:ref=>{if(!recorded.has(ref))throw Error('missing');return recorded.get(ref);}};
 const criteria=[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}];
 const commandSpecs={C1:{executable:process.execPath,args:['--version'],directory:root,timeoutMs:2000}};
 return {root,targetHash,run,delivery,candidate,store,criteria,commandSpecs};
}
test('trusted grant and actual local test result create criterion Evidence for delivered hash',async t=>{
 const f=await fixture(t);let approvals=0,verifications=0;
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async observed=>{approvals++;assert.equal(observed.targetTreeHash,f.targetHash);return true;},
  backend:{
    async authorize(){return Object.freeze({token:true});},
    async verify(){verifications++;return {
      status:'LOCAL_PASSED',evidenceIntegrity:'MATCHED',integrity:true,
      executionAuthority:'LOCAL_EXECUTED',exitCode:0,tests:1,passed:1,
      failed:0,skipped:0,todo:0,interrupted:false,truncated:false
    };}
  }
 });
 const result=await verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate});
 assert.equal(approvals,1);assert.equal(verifications,1);
 const observed=result.readVerifiedEvidence(result.evidenceRefs.C1);
 assert.equal(observed.kind,'OBJECTIVE_CRITERION_OBSERVATION_V1');
 assert.equal(observed.independentObserver,true);
 assert.equal(observed.targetTreeHash,f.targetHash);
 assert.equal(observed.complete,true);
});
test('denied command grant causes zero test execution',async t=>{
 const f=await fixture(t);let invoked=false;
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,
  commandSpecs:f.commandSpecs,obtainGrant:async()=>false,
  backend:{authorize:async()=>{invoked=true;},verify:async()=>{invoked=true;}}});
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate}),/approval missing/);
 assert.equal(invoked,false);
});
test('unapplied Candidate and drifted bytes cannot satisfy destination Evidence',async t=>{
 const f=await fixture(t);
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,commandSpecs:f.commandSpecs,obtainGrant:async()=>true});
 await assert.rejects(verifier.verify({run:f.run,delivery:{...f.delivery,status:'VERIFIED_CANDIDATE_AVAILABLE'},candidate:f.candidate}),/binding absent/);
 await writeFile(join(f.root,'src/a.js'),'untrusted drift');
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate}),/changed/);
});
test('missing criterion command fails before any approval grant',async t=>{
 const f=await fixture(t);let requested=false;
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,commandSpecs:{},
  obtainGrant:async()=>{requested=true;return true;}});
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate}),/command missing/);
 assert.equal(requested,false);
});
test('subjective criteria remain unresolved and cannot be auto-granted',async t=>{
 const f=await fixture(t);
 const verifier=createLocalDestinationVerifier(f.store,{criteria:[{id:'owner',requiredAuthority:'OWNER_REVIEW'}],commandSpecs:{},obtainGrant:async()=>{throw Error('no');}});
 const result=await verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate});
 assert.deepEqual(result.evidenceRefs,{});
});
