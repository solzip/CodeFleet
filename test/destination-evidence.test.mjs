import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm,symlink,chmod,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../src/alpha/contract.mjs';
import { candidateHash } from '../src/alpha/workspace.mjs';
import { createLocalDestinationVerifier } from '../src/product/destination-evidence.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'cf-destination-evidence-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'src'));await writeFile(join(root,'src/a.js'),'export const answer = 42;');
 // Use the production observer: Candidate hashes now bind Git executable mode too.
 const targetHash=await candidateHash(root,['src/a.js']);
 const run={id:'run-1',revision:1,repo:root,contractHash:'a'.repeat(64)};
 const delivery={status:'DELIVERED_NOT_VERIFIED',runId:run.id,revision:run.revision,
  semanticCriteriaVerified:false,candidateHash:targetHash,targetTreeHash:targetHash};
 const candidate={repo:root,candidateHash:targetHash,candidatePaths:['src/a.js']};
 const recorded=new Map();
 const store={artifact:e=>{const ref=hash(e);recorded.set(ref,e);return ref;},
  readArtifact:ref=>{if(!recorded.has(ref))throw Error('missing');return recorded.get(ref);}};
 const criteria=[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}];
 const commandSpecs={C1:{executable:process.execPath,args:['--version'],directory:root,timeoutMs:2000}};
 return {root,targetHash,run,delivery,candidate,store,criteria,commandSpecs};
}
test('trusted grant and actual local test result create criterion Evidence for delivered hash',async t=>{
 const f=await fixture(t);let approvals=0,verifications=0,review;
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async observed=>{
    approvals++;review=observed;
    assert.equal(observed.kind,'CODEFLEET_DESTINATION_CRITERION_GRANT_V1');
    assert.equal(observed.workflowHash,f.run.contractHash);
    assert.equal(observed.targetTreeHash,f.targetHash);
    assert.deepEqual(observed.criterion,f.criteria[0]);
    assert.equal(observed.command.executable,await realpath(process.execPath));
    assert.equal(observed.command.directory,await realpath(f.root));
    assert.deepEqual(observed.command.args,['--version']);
    assert.equal(observed.command.commandHash,observed.commandHash);
    assert.ok(Object.isFrozen(observed.command));
    assert.ok(Object.isFrozen(observed.command.args));
    assert.ok(Object.isFrozen(observed.criterion));
    assert.throws(()=>{observed.command.args[0]='--help';},TypeError);
    assert.throws(()=>{observed.criterion.id='unreviewed';},TypeError);
    return true;
  },
  backend:{
    async authorize(request,trust){
      assert.deepEqual(request.args,['--version']);
      assert.equal(trust.reviewedCommandHash,review.commandHash);
      return Object.freeze({token:true});
    },
    async verify(){verifications++;return {
      status:'LOCAL_PASSED',evidenceIntegrity:'MATCHED',integrity:true,
      executionAuthority:'LOCAL_EXECUTED',exitCode:0,tests:1,passed:1,
      failed:0,skipped:0,todo:0,interrupted:false,truncated:false,
      commandHash:review.commandHash,
      candidateTreeHash:review.command.candidateTreeHash,
      contractHash:f.run.contractHash,verificationBackend:'local'
    };}
  }
 });
 const result=await verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate,cancelled:()=>false});
 assert.equal(approvals,1);assert.equal(verifications,1);
 const observed=result.readVerifiedEvidence(result.evidenceRefs.C1);
 assert.equal(observed.kind,'OBJECTIVE_CRITERION_OBSERVATION_V1');
 assert.equal(observed.independentObserver,true);
 assert.equal(observed.targetTreeHash,f.targetHash);
 assert.equal(observed.complete,true);
});
test('destination drift during asynchronous criterion grant blocks backend admission',async t=>{
 const f=await fixture(t);let authorized=0,executed=0;
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async scope=>{
    assert.deepEqual(scope.command.args,['--version']);
    await writeFile(join(f.root,'src/a.js'),'unreviewed source after grant');
    return true;
  },
  backend:{
    async authorize(){authorized++;return {};},
    async verify(){executed++;throw Error('Backend must not run on stale approval');}
  }
 });
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,
  candidate:f.candidate,cancelled:()=>false}),/changed during approval/);
 assert.equal(authorized,0);
 assert.equal(executed,0);
});

test('a successful backend status with a different command receipt cannot satisfy a criterion',async t=>{
 const f=await fixture(t);let reviewed;
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async scope=>{reviewed=scope;return true;},
  backend:{
    async authorize(){return Object.freeze({token:true});},
    async verify(){return {
      status:'LOCAL_PASSED',evidenceIntegrity:'MATCHED',integrity:true,
      executionAuthority:'LOCAL_EXECUTED',exitCode:0,tests:1,passed:1,
      failed:0,skipped:0,todo:0,interrupted:false,truncated:false,
      commandHash:'f'.repeat(64),candidateTreeHash:reviewed.command.candidateTreeHash,
      contractHash:f.run.contractHash,verificationBackend:'local'
    };}
  }
 });
 const result=await verifier.verify({run:f.run,delivery:f.delivery,
  candidate:f.candidate,cancelled:()=>false});
 assert.equal(result.readVerifiedEvidence(result.evidenceRefs.C1).complete,false);
 assert.equal(result.readVerifiedEvidence(result.evidenceRefs.C1).integrity,'UNVERIFIED');
});

test('denied command grant causes zero test execution',async t=>{
 const f=await fixture(t);let invoked=false;
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,
  commandSpecs:f.commandSpecs,obtainGrant:async()=>false,
  backend:{authorize:async()=>{invoked=true;},verify:async()=>{invoked=true;}}});
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate,cancelled:()=>false}),/approval missing/);
 assert.equal(invoked,false);
});
test('unapplied Candidate and drifted bytes cannot satisfy destination Evidence',async t=>{
 const f=await fixture(t);
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,commandSpecs:f.commandSpecs,obtainGrant:async()=>true});
 await assert.rejects(verifier.verify({run:f.run,delivery:{...f.delivery,status:'VERIFIED_CANDIDATE_AVAILABLE'},candidate:f.candidate,cancelled:()=>false}),/binding absent/);
 await writeFile(join(f.root,'src/a.js'),'untrusted drift');
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate,cancelled:()=>false}),/changed/);
});
test('missing criterion command fails before any approval grant',async t=>{
 const f=await fixture(t);let requested=false;
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,commandSpecs:{},
  obtainGrant:async()=>{requested=true;return true;}});
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate,cancelled:()=>false}),/command missing/);
 assert.equal(requested,false);
});
test('subjective criteria remain unresolved and cannot be auto-granted',async t=>{
 const f=await fixture(t);
 const verifier=createLocalDestinationVerifier(f.store,{criteria:[{id:'owner',requiredAuthority:'OWNER_REVIEW'}],commandSpecs:{},obtainGrant:async()=>{throw Error('no');}});
 const result=await verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate,cancelled:()=>false});
 assert.deepEqual(result.evidenceRefs,{});
});


test('missing live coordinator fence cannot run a destination command',async t=>{
 const f=await fixture(t);let granted=false;
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,
  commandSpecs:f.commandSpecs,obtainGrant:async()=>{granted=true;return true;}});
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,candidate:f.candidate}),
  /cancellation fence required/);
 assert.equal(granted,false);
});

test('a receipt for another Objective, revision or Candidate cannot create Evidence',async t=>{
 const f=await fixture(t);let granted=false;
 const verifier=createLocalDestinationVerifier(f.store,{criteria:f.criteria,
  commandSpecs:f.commandSpecs,obtainGrant:async()=>{granted=true;return true;}});
 for(const change of [
  {runId:'different-objective'}, {revision:2},
  {candidateHash:'f'.repeat(64)}, {semanticCriteriaVerified:true}
 ]) {
  await assert.rejects(verifier.verify({
   run:f.run,delivery:{...f.delivery,...change},candidate:f.candidate,
   cancelled:()=>false
  }),/binding absent/,JSON.stringify(change));
 }
 assert.equal(granted,false);
});

test('revocation during an asynchronous grant prevents any Local command',async t=>{
 const f=await fixture(t);let cancelled=false,invoked=false;
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async()=>{cancelled=true;return true;},
  backend:{authorize:async()=>{invoked=true;},verify:async()=>{invoked=true;}}
 });
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,
  candidate:f.candidate,cancelled:()=>cancelled}),/cancelled or grant revoked/);
 assert.equal(invoked,false);
});

test('revocation during a running Local check prevents successful Evidence persistence',async t=>{
 const f=await fixture(t);let cancelled=false,artifacts=0,invoked=false;
 const artifact=f.store.artifact;
 f.store.artifact=value=>{artifacts++;return artifact(value);};
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,obtainGrant:async()=>true,
  backend:{
   authorize:async()=>Object.freeze({token:true}),
   verify:async request=>{
    invoked=true;
    assert.equal(request.cancelled(),false);
    cancelled=true;
    return {status:'LOCAL_PASSED',evidenceIntegrity:'MATCHED',integrity:true,
     executionAuthority:'LOCAL_EXECUTED',exitCode:0,tests:1,passed:1,
     failed:0,skipped:0,todo:0,interrupted:false,truncated:false};
   }
  }
 });
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,
  candidate:f.candidate,cancelled:()=>cancelled}),/cancelled or grant revoked/);
 assert.equal(invoked,true);
 assert.equal(artifacts,0);
});

test('mode-only drift on delivered files cannot receive a Local verification grant',async t=>{
 if (process.platform === 'win32') { t.skip('POSIX executable mode not portable on Windows'); return; }
 const f=await fixture(t);let granted=false;
 await chmod(join(f.root,'src/a.js'),0o755);
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async()=>{granted=true;return true;}
 });
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,
  candidate:f.candidate,cancelled:()=>false}),/Destination changed before criterion verification/);
 assert.equal(granted,false);
});

test('same-byte symlink substitution after delivery cannot create criterion Evidence',async t=>{
 const f=await fixture(t);let granted=false;
 const copy=join(f.root,'src/copy.js'),target=join(f.root,'src/a.js');
 await writeFile(copy,'export const answer = 42;');
 await rm(target);
 try { await symlink('copy.js',target,'file'); }
 catch(error) {
  if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) {t.skip('Symlink creation not permitted on this runner');return;}
  throw error;
 }
 const verifier=createLocalDestinationVerifier(f.store,{
  criteria:f.criteria,commandSpecs:f.commandSpecs,
  obtainGrant:async()=>{granted=true;return true;}
 });
 await assert.rejects(verifier.verify({run:f.run,delivery:f.delivery,
  candidate:f.candidate,cancelled:()=>false}),/symlink or nonregular/);
 assert.equal(granted,false);
});

test('Local verifier exposes a defensive copy of the exact criteria approved before delivery',async t=>{
  const f=await fixture(t);
  const verifier=createLocalDestinationVerifier(f.store,{
    criteria:f.criteria,commandSpecs:f.commandSpecs,obtainGrant:async()=>true
  });
  assert.deepEqual(verifier.approvedCriteria,f.criteria);
  verifier.approvedCriteria[0].requiredAuthority='OWNER_REVIEW';
  f.criteria[0].requiredAuthority='OWNER_REVIEW';
  assert.equal(verifier.approvedCriteria[0].requiredAuthority,'LOCAL_EXECUTED');
});
