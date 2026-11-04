import test from 'node:test';
import assert from 'node:assert/strict';
import { readDeliveredObjectiveStatus } from '../src/product/objective-status.mjs';

const SHA = 'a'.repeat(64), OTHER = 'b'.repeat(64);
const run = () => ({kind:'workflow',id:'objective-1',revision:1,state:'COMPLETED',
  finalRunId:'final-1',acceptedHash:'accepted-1',repo:'/approved-target',
  deliveryReceiptRef:'delivery-1',objectiveDecisionRef:'decision-1',
  reportedCostUsd:0,unknownCostAttempts:2});
const delivery = () => ({status:'DELIVERED_NOT_VERIFIED',runId:'objective-1',revision:1,
  candidateHash:SHA,targetTreeHash:SHA});
const child = () => ({id:'final-1',workflowParent:'objective-1',
  workflowRevision:1,candidateHash:SHA,candidatePaths:['src/a.js'],
  repo:'/approved-target'});
const decision = () => ({outcome:'COMPLETE',complete:true,objectiveId:'objective-1',
  revision:1,targetTreeHash:SHA,authority:'LOCAL_EXECUTED',
  criteria:[{id:'criterion-a',status:'SATISFIED',evidenceRef:'evidence-a'}]});
function fixture({current=SHA,runOverride={},deliveryOverride={},childOverride={},decisionOverride={}}={}){
 const r={...run(),...runOverride};
 const blobs={'delivery-1':{...delivery(),...deliveryOverride},
   'decision-1':{...decision(),...decisionOverride}};
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
 const x=fixture({runOverride:{deliveryReceiptRef:null,objectiveDecisionRef:null}});
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
