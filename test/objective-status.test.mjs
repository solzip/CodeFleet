import { mkdtemp,mkdir,writeFile,rm,symlink,link,chmod,lstat,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { candidateHash } from '../src/alpha/workspace.mjs';
import { hash } from '../src/alpha/contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readDeliveredObjectiveStatus } from '../src/product/objective-status.mjs';

const SHA = 'a'.repeat(64), OTHER = 'b'.repeat(64), BASE = 'c'.repeat(40);
const criterionSet = [{id:'criterion-a',requiredAuthority:'LOCAL_EXECUTED'}];
const run = () => ({kind:'workflow',id:'objective-1',revision:1,state:'COMPLETED',
  finalRunId:'final-1',acceptedHash:'accepted-1',evidenceHash:'candidate-evidence-1',repo:'/approved-target',base:BASE,
  destinationDeliveryIntentRef:'intent-1',
  deliveryReceiptRef:'delivery-1',objectiveDecisionRef:'decision-1',
  objectiveCriteriaRef:'criteria-1',objectiveApprovedCriteriaRef:'approved-1',contractHash:SHA,
  reportedCostUsd:0,unknownCostAttempts:2});
const delivery = () => ({status:'DELIVERED_NOT_VERIFIED',runId:'objective-1',revision:1,
  candidateHash:SHA,targetTreeHash:SHA,semanticCriteriaVerified:false,
  intentRef:'intent-1',appliedFiles:['src/a.js'],observedHashes:{'src/a.js':OTHER}});
const intent = () => ({kind:'EXACT_LOCAL_DELIVERY_INTENT_V1',
  runId:'objective-1',revision:1,base:BASE,destination:'/approved-target',
  workflowHash:SHA,approvedCriteriaRef:'approved-1',
  objectiveCriteriaHash:hash(criterionSet),acceptedHash:'accepted-1',
  evidenceHash:'candidate-evidence-1',candidateHash:SHA,
  fileHashes:{'src/a.js':OTHER}});
const child = () => ({id:'final-1',workflowParent:'objective-1',
  workflowRevision:1,candidateHash:SHA,acceptedHash:'accepted-1',
  evidenceHash:'candidate-evidence-1',candidatePaths:['src/a.js'],
  repo:'/approved-target'});
const decision = () => ({outcome:'COMPLETE',complete:true,objectiveId:'objective-1',
  revision:1,targetTreeHash:SHA,authority:'LOCAL_EXECUTED',
  criteria:[{id:'criterion-a',status:'SATISFIED',authority:'LOCAL_EXECUTED',evidenceRef:'evidence-a'}]});
const evidence = () => ({kind:'OBJECTIVE_CRITERION_OBSERVATION_V1',
  complete:true,verificationBackend:'local',protection:'UNPROTECTED',
  objectiveId:'objective-1',revision:1,criterionId:'criterion-a',
  targetTreeHash:SHA,authority:'LOCAL_EXECUTED',independentObserver:true,
  commandHash:SHA,observationHash:OTHER,tests:1,passed:1,failed:0,skipped:0,todo:0,
  exitCode:0,interrupted:false,truncated:false,integrity:'MATCHED'});
function fixture({current=SHA,runOverride={},deliveryOverride={},childOverride={},
 decisionOverride={},criteriaOverride={},approvedOverride={},intentOverride={},
 evidenceOverride={},evidenceMissing=false}={}){
 const r={...run(),...runOverride};
 const blobs={'intent-1':{...intent(),...intentOverride},
   'delivery-1':{...delivery(),...deliveryOverride},
   'decision-1':{...decision(),...decisionOverride},
   'criteria-1':{kind:'OBJECTIVE_MANDATORY_CRITERIA_V1',
     objectiveId:'objective-1',revision:1,workflowHash:SHA,
     approvedCriteriaRef:'approved-1',deliveryReceiptRef:'delivery-1',
     criteria:[{id:'criterion-a',requiredAuthority:'LOCAL_EXECUTED'}],...criteriaOverride},
   'approved-1':{kind:'OBJECTIVE_APPROVED_CRITERIA_V1',
     objectiveId:'objective-1',revision:1,workflowHash:SHA,
     criteriaHash:hash([{id:'criterion-a',requiredAuthority:'LOCAL_EXECUTED'}]),
     criteria:[{id:'criterion-a',requiredAuthority:'LOCAL_EXECUTED'}],...approvedOverride},
   ...(evidenceMissing?{}:{'evidence-a':{...evidence(),...evidenceOverride}})};
 return { store:{get:id=>id==='objective-1'?r:id==='final-1'?{...child(),...childOverride}:null,
   readArtifact:ref=>blobs[ref]},observeTree:async (repo,files)=>{
     assert.equal(repo,'/approved-target');
     assert.deepEqual(files,['src/a.js']);
     return current;
   }};
}
test('delivered, independently accepted Local Objective may report COMPLETE after re-observation',async()=>{
 const x=fixture(); const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.status,'COMPLETE');assert.equal(result.objectiveComplete,true);
 assert.equal(result.protection,'UNPROTECTED');
 assert.equal(result.cost.unknownTurns,2);
 assert.deepEqual(result.criterionIds,['criterion-a']);
});
test('artifact-only COMPLETED Workflow is not an Objective COMPLETE',async()=>{
 const x=fixture({runOverride:{destinationDeliveryIntentRef:null,
   deliveryReceiptRef:null,objectiveDecisionRef:null}});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.status,'VERIFIED_CANDIDATE_AVAILABLE');
 assert.equal(result.objectiveComplete,false);
});
test('delivered but unverified cannot claim complete',async()=>{
 const x=fixture({runOverride:{objectiveDecisionRef:null}});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.status,'DELIVERED_NOT_VERIFIED');
 assert.equal(result.objectiveComplete,false);
});
test('read-only Objective status rejects a Workflow or final Candidate changed during target observation',async()=>{
 for(const change of [
   {kind:'workflow',fields:{revision:2}},
   {kind:'workflow',fields:{state:'RECONCILING'}},
   {kind:'workflow',fields:{objectiveDecisionRef:'new-decision'}},
   {kind:'workflow',fields:{objectiveApprovedCriteriaRef:'new-criteria'}},
   {kind:'child',fields:{candidateHash:OTHER}}
 ]) {
   const x=fixture();
   const initialGet=x.store.get;
   let observationCompleted=false;
   x.store.get=id=>{
     const row=initialGet(id);
     const selected=(change.kind==='workflow' && id==='objective-1') ||
       (change.kind==='child' && id==='final-1');
     return observationCompleted && selected ? {...row,...change.fields} : row;
   };
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{
     observeTree:async(...args)=>{
       const tree=await x.observeTree(...args);
       observationCompleted=true;
       return tree;
     }
   });
   assert.equal(result.status,'BLOCKED',JSON.stringify(change));
   assert.equal(result.objectiveComplete,false);
 }
});
test('read-only Objective status fails closed if a persisted record is unavailable after observation',async()=>{
 const x=fixture(),initialGet=x.store.get;
 let observationCompleted=false;
 x.store.get=id=>{
   if(observationCompleted && id==='final-1') throw Error('Store unavailable');
   return initialGet(id);
 };
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{
   observeTree:async(...args)=>{
     const tree=await x.observeTree(...args);
     observationCompleted=true;
     return tree;
   }
 });
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.objectiveComplete,false);
});
test('destination drift invalidates former COMPLETE decision',async()=>{
 const x=fixture({current:OTHER});const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.status,'INCOMPLETE');assert.equal(result.targetDrift,true);
});
test('missing or forged destination binding remains BLOCKED',async()=>{
 const x=fixture({deliveryOverride:{targetTreeHash:OTHER}});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.status,'BLOCKED');
});
test('wrong authority or missing criteria cannot promote Objective',async()=>{
 for(const decisionOverride of [{authority:'PROVIDER_REPORTED_ONLY'},{criteria:[]},
  {revision:2},{targetTreeHash:OTHER},{complete:false}]) {
   const x=fixture({decisionOverride});
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
   assert.equal(result.objectiveComplete,false);
 }
});
test('Subjective criterion is an explicit HUMAN_HANDOFF',async()=>{
 const x=fixture({decisionOverride:{outcome:'HUMAN_HANDOFF',complete:false,
  criteria:[{id:'review',status:'HUMAN_HANDOFF'}]}});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.status,'HUMAN_HANDOFF');
});
test('unreadable target or evidence cannot be treated as complete',async()=>{
 const x=fixture();
 const r=await readDeliveredObjectiveStatus(x.store,'objective-1',{
   observeTree:async()=>{throw Error('not accessible')}});
 assert.equal(r.status,'BLOCKED');
});

test('missing referenced independent criterion artifact cannot preserve COMPLETE',async()=>{
 const x=fixture({evidenceMissing:true});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.objectiveComplete,false);
 assert.equal(result.status,'INCOMPLETE');
});
test('stale or downgraded criterion Evidence invalidates a previously COMPLETE decision',async()=>{
 for(const evidenceOverride of [
   {targetTreeHash:OTHER},{revision:2},{authority:'PROVIDER_REPORTED_ONLY'},
   {independentObserver:false},{skipped:1},{tests:0,passed:0}
 ]) {
   const x=fixture({evidenceOverride});
   const status=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
   assert.equal(status.objectiveComplete,false,JSON.stringify(evidenceOverride));
 }
});
test('falsely promoted protected decision cannot rely on Local criterion Evidence',async()=>{
 const x=fixture({decisionOverride:{authority:'PROTECTED_EXECUTED',
   criteria:[{id:'criterion-a',status:'SATISFIED',authority:'PROTECTED_EXECUTED',
     evidenceRef:'evidence-a'}]}});
 const status=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(status.objectiveComplete,false);
});

test('COMPLETE cannot erase a mandatory criterion from the independently pinned set',async()=>{
 const x=fixture({criteriaOverride:{criteria:[
   {id:'criterion-a',requiredAuthority:'LOCAL_EXECUTED'},
   {id:'criterion-b',requiredAuthority:'LOCAL_EXECUTED'}]}});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
 assert.equal(result.objectiveComplete,false);
 assert.equal(result.status,'INCOMPLETE');
});
test('missing or stale mandatory-criterion snapshot cannot promote a verdict',async()=>{
 for(const change of [
   {runOverride:{objectiveCriteriaRef:null}},
   {criteriaOverride:{workflowHash:OTHER}},
   {criteriaOverride:{deliveryReceiptRef:'older-delivery'}},
   {criteriaOverride:{revision:2}},
   {criteriaOverride:{criteria:[{id:'criterion-a',requiredAuthority:'OWNER_REVIEW'}]}}
 ]) {
   const x=fixture(change);
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
   assert.equal(result.objectiveComplete,false,JSON.stringify(change));
 }
});

test('current Objective status rejects a same-byte symlink substituted after COMPLETE',async t=>{
 const root=await mkdtemp(join(tmpdir(),'codefleet-symlink-objective-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'src'));
 const target=join(root,'src','a.js'),content='export const approved = 1;';
 await writeFile(target,content);
 const targetHash=await candidateHash(root,['src/a.js']);
 const x=fixture({
  runOverride:{repo:root},
  childOverride:{repo:root,candidateHash:targetHash},
  deliveryOverride:{candidateHash:targetHash,targetTreeHash:targetHash},
  intentOverride:{destination:root,candidateHash:targetHash},
  decisionOverride:{targetTreeHash:targetHash},
  evidenceOverride:{targetTreeHash:targetHash}
 });
 const first=await readDeliveredObjectiveStatus(x.store,'objective-1');
 assert.equal(first.status,'COMPLETE');
 await writeFile(join(root,'src','same.js'),content);
 await rm(target);
 try { await symlink('same.js',target,'file'); }
 catch(error) {
  if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) {t.skip('Symlink creation not permitted on this runner');return;}
  throw error;
 }
 const changed=await readDeliveredObjectiveStatus(x.store,'objective-1');
 assert.equal(changed.objectiveComplete,false);
 assert.equal(changed.status,'BLOCKED');
});

test('Candidate tree observation rejects path traversal before any file read',async t=>{
 const root=await mkdtemp(join(tmpdir(),'codefleet-unsafe-observation-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'safe.js'),'safe');
 await writeFile(join(root,'.gitattributes'),'sample');
 const observed=await candidateHash(root,['.gitattributes','safe.js']);
 assert.match(observed,/^[a-f0-9]{64}$/);
 await assert.rejects(candidateHash(root,['../outside.js']),/Unsafe tracked Candidate path/);
});

// A saved COMPLETE must not survive access through a linked ancestor of the
// delivered repository, even if the leaf and the bytes are still ordinary.
test('Objective status refuses delivered roots reached through a symlinked ancestor',async t=>{
 const root=await mkdtemp(join(tmpdir(),'codefleet-linked-parent-objective-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const actual=join(root,'delivered');
 await mkdir(join(actual,'src'),{recursive:true});
 await writeFile(join(actual,'src','a.js'),'export const answer = 42;');
 const actualHash=await candidateHash(actual,['src/a.js']);
 const linked=join(root,'linked-parent');
 try { await symlink(root,linked,process.platform === 'win32' ? 'junction' : 'dir'); }
 catch(error) {
  if (['EPERM','EACCES','ENOTSUP','EINVAL'].includes(error.code)) {t.skip('Symlinks not supported by this runner');return;}
  throw error;
 }
 const redirected=join(linked,'delivered');
 const x=fixture({runOverride:{repo:redirected},childOverride:{repo:redirected,candidateHash:actualHash},
  deliveryOverride:{candidateHash:actualHash,targetTreeHash:actualHash},
  intentOverride:{destination:redirected,candidateHash:actualHash},
  decisionOverride:{targetTreeHash:actualHash},evidenceOverride:{targetTreeHash:actualHash}});
 const result=await readDeliveredObjectiveStatus(x.store,'objective-1');
 assert.equal(result.objectiveComplete,false);
 assert.equal(result.status,'BLOCKED');
});

test('read-only COMPLETE projection rejects incomplete or mislabeled saved criterion Evidence',async()=>{
 for(const evidenceOverride of [
   {kind:'MODEL_REPORTED_RESULT'},{complete:false},
   {verificationBackend:undefined},{protection:'PROTECTED'},
   {authority:'PROTECTED_EXECUTED',protection:'PROTECTED'}
 ]) {
   const x=fixture({evidenceOverride});
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
   assert.equal(result.objectiveComplete,false,JSON.stringify(evidenceOverride));
 }
});

test('post-delivery Evidence cannot replace a missing or changed pre-effect criterion approval',async()=>{
  for(const change of [
    {runOverride:{objectiveApprovedCriteriaRef:null}},
    {approvedOverride:{criteria:[{id:'criterion-a',requiredAuthority:'OWNER_REVIEW'}]}},
    {approvedOverride:{workflowHash:OTHER}},
    {criteriaOverride:{approvedCriteriaRef:'obsolete-approval'}},
    {approvedOverride:{criteriaHash:OTHER}},
  ]) {
    const x=fixture(change);
    const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{observeTree:x.observeTree});
    assert.equal(result.objectiveComplete,false,JSON.stringify(change));
  }
});

test('uncertain pre-effect delivery is RECONCILING, never a verified Candidate or COMPLETE',async()=>{
 for(const state of ['RECONCILING','COMPLETED']) {
   const x=fixture({runOverride:{state,deliveryReceiptRef:null}});
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{
     observeTree:async()=>{throw Error('Unsafe read on uncertain destination');}
   });
   assert.equal(result.status,'RECONCILING');
   assert.equal(result.deliveryUncertain,true);
   assert.equal(result.objectiveComplete,false);
   assert.equal(result.candidateAvailable,true);
 }
});

test('Objective COMPLETE joins receipt and delivered file hashes to pre-effect approval intent',async()=>{
 for(const change of [
   {runOverride:{destinationDeliveryIntentRef:null}},
   {runOverride:{base:'d'.repeat(40)}},
   {intentOverride:{approvedCriteriaRef:'different-approval'}},
   {intentOverride:{objectiveCriteriaHash:SHA}},
   {intentOverride:{workflowHash:OTHER}},
   {intentOverride:{destination:'/another-repository'}},
   {intentOverride:{fileHashes:{'src/a.js':SHA}}},
   {deliveryOverride:{intentRef:'unrelated-intent'}},
   {deliveryOverride:{appliedFiles:['src/other.js']}},
   {deliveryOverride:{observedHashes:{'src/a.js':SHA}}}
 ]) {
   const x=fixture(change);
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{
     observeTree:async()=>{throw Error('Reject before target reads');}
   });
   assert.equal(result.status,'BLOCKED',JSON.stringify(change));
   assert.equal(result.objectiveComplete,false);
 }
});

// Same-byte hard links bypass a symlink-only lstat check. An objective that
// was COMPLETE must be revalidated against the current physical target files.
test('COMPLETE projection rejects same-byte hard-link substitution',async t=>{
 const root=await mkdtemp(join(tmpdir(),'codefleet-hardlink-objective-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'src'));
 const target=join(root,'src','a.js'), outside=join(root,'outside.js');
 const content='export const approved = true;';
 await writeFile(target,content);
 const targetHash=await candidateHash(root,['src/a.js']);
 const x=fixture({
  runOverride:{repo:root},childOverride:{repo:root,candidateHash:targetHash},
  deliveryOverride:{candidateHash:targetHash,targetTreeHash:targetHash},
  intentOverride:{destination:root,candidateHash:targetHash},
  decisionOverride:{targetTreeHash:targetHash},evidenceOverride:{targetTreeHash:targetHash}
 });
 assert.equal((await readDeliveredObjectiveStatus(x.store,'objective-1')).status,'COMPLETE');
 await writeFile(outside,content);
 await rm(target);
 try { await link(outside,target); }
 catch(error) {
  if (['EPERM','EACCES','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(error.code)) {
   t.skip('Hard links not supported by this runner');return;
  }
  throw error;
 }
 const changed=await readDeliveredObjectiveStatus(x.store,'objective-1');
 assert.equal(changed.objectiveComplete,false);
 assert.equal(changed.status,'BLOCKED');
});

test('delivered Objective preserves the pre-effect verified Candidate and Evidence refs',async()=>{
 for(const change of [
   {runOverride:{acceptedHash:'different-patch'}},
   {runOverride:{evidenceHash:'different-evidence'}},
   {intentOverride:{acceptedHash:'different-patch'}},
   {intentOverride:{evidenceHash:'different-evidence'}},
   {childOverride:{acceptedHash:'different-patch'}},
   {childOverride:{evidenceHash:'different-evidence'}}
 ]) {
   const x=fixture(change);
   const result=await readDeliveredObjectiveStatus(x.store,'objective-1',{
     observeTree:async()=>{throw Error('Never read target for changed Candidate provenance');}
   });
   assert.equal(result.status,'BLOCKED',JSON.stringify(change));
   assert.equal(result.objectiveComplete,false);
 }
});

test('delivered Objective rejects same-byte executable-bit drift after COMPLETE', async t => {
  if (process.platform === 'win32') {
    t.skip('Executable-bit mutation is not portable on Windows filesystems'); return;
  }
  const root = await mkdtemp(join(tmpdir(), 'codefleet-mode-objective-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  await mkdir(join(root, 'src'));
  const target = join(root, 'src', 'a.js');
  const source = 'export const approved = 1;\n';
  await writeFile(target, source);
  await chmod(target, 0o644);
  if (((await lstat(target)).mode & 0o111) !== 0) {
    t.skip('Filesystem does not honor removing executable bits'); return;
  }
  const targetHash = await candidateHash(root, ['src/a.js']);
  const x = fixture({
    runOverride:{repo:root},
    childOverride:{repo:root,candidateHash:targetHash},
    deliveryOverride:{candidateHash:targetHash,targetTreeHash:targetHash},
    intentOverride:{destination:root,candidateHash:targetHash},
    decisionOverride:{targetTreeHash:targetHash},
    evidenceOverride:{targetTreeHash:targetHash}
  });
  const accepted = await readDeliveredObjectiveStatus(x.store, 'objective-1');
  assert.equal(accepted.status, 'COMPLETE');
  await chmod(target, 0o755);
  if (((await lstat(target)).mode & 0o111) === 0) {
    t.skip('Filesystem does not honor setting executable bits'); return;
  }
  assert.equal(await readFile(target, 'utf8'), source);
  const drifted = await readDeliveredObjectiveStatus(x.store, 'objective-1');
  assert.equal(drifted.objectiveComplete, false);
  assert.equal(drifted.status, 'INCOMPLETE');
  assert.equal(drifted.targetDrift, true);
});
