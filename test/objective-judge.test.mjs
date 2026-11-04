import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeliveredObjective } from '../src/product/objective-judge.mjs';

const tree='a'.repeat(64);
const delivery={status:'DELIVERED_NOT_VERIFIED',runId:'goal',revision:1,
  candidateHash:tree,targetTreeHash:tree,semanticCriteriaVerified:false};
const criteria=[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'},{id:'C2',requiredAuthority:'LOCAL_EXECUTED'}];
const evidence=id=>({kind:'OBJECTIVE_CRITERION_OBSERVATION_V1',
  complete:true,verificationBackend:'local',protection:'UNPROTECTED',
  objectiveId:'goal',revision:1,criterionId:id,
  targetTreeHash:tree,authority:'LOCAL_EXECUTED',independentObserver:true,
  commandHash:'b'.repeat(64),observationHash:'c'.repeat(64),
  tests:1,passed:1,failed:0,skipped:0,todo:0,exitCode:0,integrity:'MATCHED'});
const args=()=>({objectiveId:'goal',revision:1,candidateHash:tree,delivery,criteria,
  evidenceRefs:{C1:'e1',C2:'e2'},readVerifiedEvidence:ref=>evidence(ref==='e1'?'C1':'C2')});

test('all delivered tree criteria independently observed yield local-unprotected COMPLETE',()=>{
  const result=evaluateDeliveredObjective(args());
  assert.equal(result.outcome,'COMPLETE');
  assert.equal(result.complete,true);
  assert.equal(result.protection,'UNPROTECTED');
  assert.equal(result.criteria.length,2);
});
test('verified candidate only is never Object COMPLETE',()=>{
  const result=evaluateDeliveredObjective({...args(),delivery:{...delivery,status:'VERIFIED_CANDIDATE_AVAILABLE'}});
  assert.equal(result.outcome,'INCOMPLETE');
});
test('delivery target mismatch is rejected',()=>{
  const result=evaluateDeliveredObjective({...args(),delivery:{...delivery,targetTreeHash:'f'.repeat(64)}});
  assert.equal(result.complete,false);
});
test('missing criterion evidence prevents completion',()=>{
  const result=evaluateDeliveredObjective({...args(),evidenceRefs:{C1:'e1'}});
  assert.equal(result.outcome,'INCOMPLETE');
  assert.equal(result.criteria[1].status,'MISSING_EVIDENCE');
});
test('a model claim or local observation cannot meet protected authority',()=>{
  for(const change of [
    {authority:'PROVIDER_REPORTED_ONLY'},
    {authority:'LOCAL_EXECUTED',independentObserver:false},
  ]) {
    const a=args();
    const evidenceReader=a.readVerifiedEvidence;
    a.readVerifiedEvidence=ref=>({...evidenceReader(ref),...change});
    assert.equal(evaluateDeliveredObjective(a).complete,false);
  }
  const a=args();a.criteria=[{id:'C1',requiredAuthority:'PROTECTED_EXECUTED'}];
  assert.equal(evaluateDeliveredObjective(a).complete,false);
});
test('no tests, skipped tests, interrupted checks or wrong revision are insufficient',()=>{
  const base=args();
  for(const delta of [{tests:0,passed:0},{skipped:1},{interrupted:true},{revision:2},{targetTreeHash:'f'.repeat(64)}]) {
    const a={...base,readVerifiedEvidence:ref=>({...base.readVerifiedEvidence(ref),...delta})};
    assert.equal(evaluateDeliveredObjective(a).outcome,'INCOMPLETE');
  }
});
test('subjective criterion is not self-scored by CodeFleet',()=>{
  const a=args();a.criteria=[{id:'human',requiredAuthority:'OWNER_REVIEW'}];
  assert.equal(evaluateDeliveredObjective(a).outcome,'HUMAN_HANDOFF');
});
test('protected evidence supports protected COMPLETE only when both observed',()=>{
  const a=args();a.criteria=[{id:'C1',requiredAuthority:'PROTECTED_EXECUTED'}];
  a.readVerifiedEvidence=()=>({...evidence('C1'),authority:'PROTECTED_EXECUTED',
    verificationBackend:'container',protection:'PROTECTED'});
  assert.equal(evaluateDeliveredObjective(a).protection,'PROTECTED');
});

test('a delivered receipt from another Objective or revision cannot be replayed',()=>{
 for(const invalid of [
   {runId:'other-objective'},{revision:2},{runId:undefined},{revision:undefined}
 ]) {
   const result=evaluateDeliveredObjective({...args(),delivery:{...delivery,...invalid}});
   assert.equal(result.complete,false,JSON.stringify(invalid));
   assert.equal(result.outcome,'INCOMPLETE');
 }
});

// These are pure-Judge regression inputs, not claimed Host/OS verification.
test('an incomplete, untyped or inconsistently protected observation cannot complete an Objective',()=>{
  const baseline=args();
  for(const delta of [
    {kind:'MODEL_REPORTED_RESULT'}, {complete:false}, {complete:undefined},
    {verificationBackend:''}, {verificationBackend:undefined},
    {protection:'PROTECTED'}
  ]) {
    const a={...baseline,readVerifiedEvidence:ref=>({...baseline.readVerifiedEvidence(ref),...delta})};
    assert.equal(evaluateDeliveredObjective(a).complete,false,JSON.stringify(delta));
  }
  const protectedOnly={...baseline,criteria:[{id:'C1',requiredAuthority:'PROTECTED_EXECUTED'}],
    evidenceRefs:{C1:'e1'}};
  for(const delta of [
    {authority:'PROTECTED_EXECUTED'}, // Local protection label must not upgrade
    {authority:'PROTECTED_EXECUTED',protection:'PROTECTED'}, // backend still Local
    {authority:'PROTECTED_EXECUTED',verificationBackend:'container'}, // UNPROTECTED label
  ]) {
    const a={...protectedOnly,readVerifiedEvidence:()=>({...evidence('C1'),...delta})};
    assert.equal(evaluateDeliveredObjective(a).complete,false,JSON.stringify(delta));
  }
});
