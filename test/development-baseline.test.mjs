import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedDevelopmentBaseline } from '../src/alpha/development-baseline.mjs';

const green={authority:'HARNESS_EXECUTED',exitCode:0,tests:1,passed:1,failed:0,
  skipped:0,todo:0,interrupted:false,truncated:false};
const child={id:'child',base:'a'.repeat(40),contractHash:'b'.repeat(64),
  baselineHash:'baseline',developmentBaselineRef:'owner-green'};
const grant={kind:'APPROVED_GREEN_BASELINE_V1',runId:'child',base:child.base,
  contractHash:child.contractHash,baselineHash:child.baselineHash,authorizedBy:'TRUSTED_INTEGRATION'};
const store=(baseline=green,record=grant)=>({readArtifact(ref){if(ref==='baseline')return baseline;if(ref==='owner-green')return record;throw Error('missing');}});
test('legacy no-grant green baseline remains blocked',()=>{
  assert.equal(approvedDevelopmentBaseline(store(),{...child,developmentBaselineRef:undefined}),false);
});
test('explicit trusted green baseline with passing independent tests is accepted',()=>{
  assert.equal(approvedDevelopmentBaseline(store(),child),true);
});
test('stale revision/base/contract/run cannot be used as green authorization',()=>{
  for(const change of [{runId:'other'},{base:'f'.repeat(40)},{contractHash:'0'.repeat(64)},{authorizedBy:'AGENT'}])
    assert.equal(approvedDevelopmentBaseline(store(green,{...grant,...change}),child),false);
});
test('zero, missing, interrupted, or failing baseline checks cannot be approved',()=>{
  for(const change of [{tests:0,passed:0},{failed:1},{interrupted:true},
    {authority:'PROVIDER_REPORTED_ONLY'},{exitCode:1}])
    assert.equal(approvedDevelopmentBaseline(store({...green,...change}),child),false);
});
test('historical failing regression baseline still eligible without green approval',()=>{
  const red={authority:'HARNESS_EXECUTED',exitCode:1,tests:1,passed:0,failed:1,
    skipped:0,todo:0,interrupted:false,truncated:false};
  assert.equal(approvedDevelopmentBaseline(store(red),{...child,developmentBaselineRef:undefined}),true);
});
