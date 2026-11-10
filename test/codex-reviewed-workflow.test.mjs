import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../src/alpha/contract.mjs';
import { hybridDefinition } from '../src/workflow/definition.mjs';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { approveWorkflow, reviseWorkflow } from '../src/workflow/persistence.mjs';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { beginPlanning,submitPlanning } from '../src/hosts/planning.mjs';
import { validateDraft } from '../src/intent/contract.mjs';
import { prepareReviewedCodexWorkflow, inspectReviewedCodexPlan } from '../src/product/codex-reviewed-workflow.mjs';
import { dispatchProduct, productCli } from '../src/product/cli.mjs';

const goal='Repair arithmetic behavior in src/a.js with test/a.test.js and independently verify results.';
const multiGoal='Repair arithmetic behavior in src/a.js and src/b.js with both protected regression tests and independently verify the result.';

// Planning-only fixtures may not initialize the optional Workflow Attempt
// schema. Absence of the table is zero Attempts, not an SQL error.
function countWorkflowAttempts(store) {
 const exists=store.db.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name='workflow_attempts'"
 ).get();
 return exists ? store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n : 0;
}
async function fixture(t,{multi=false}={}) {
 const root=await mkdtemp(join(tmpdir(),'cf-plan-workflow-'));
 let store;
 t.after(async()=>{store?.close();await rm(root,{recursive:true,force:true});});
 const repo=join(root,'repo');
 await mkdir(join(repo,'src'),{recursive:true});await mkdir(join(repo,'test'));
 await writeFile(join(repo,'src/a.js'),'export function add(x,y){ return x+y; }\n');
 await writeFile(join(repo,'test/a.test.js'),'import test from "node:test";\n');
 if(multi) {
  await writeFile(join(repo,'src/b.js'),'export function subtract(x,y){ return x+y; }\n');
  await writeFile(join(repo,'test/b.test.js'),'import test from "node:test";\n');
 }
 for(const args of [['init'],['add','.'],
  ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]){
   const result=await git(repo,args);
   assert.equal(result.exitCode,0,result.stderr.toString());
 }
 store=new Store(join(root,'state'));
 const originalGoal=multi?multiGoal:goal;
 const request=await beginPlanning(store,repo,originalGoal,{host:'codex',version:'0.166.0'});
 const draft={schemaVersion:2,objective:originalGoal,base:request.context.discovery.base,
   files:multi?['src/a.js','src/b.js']:['src/a.js'],
   tests:multi?['test/a.test.js','test/b.test.js']:['test/a.test.js'],
   criteria:multi?[
     {description:'A subtract regression passes',method:'protected-tests',tests:['test/a.test.js']},
     {description:'B subtract regression passes',method:'protected-tests',tests:['test/b.test.js']}
   ]:[{description:'Arithmetic regression passes',method:'protected-tests',tests:['test/a.test.js']}],
   risks:[],unknowns:[],effects:['local-edit'],
   ...(multi?{workItems:[
     {id:'a',dependencies:[],priority:0,files:['src/a.js'],tests:['test/a.test.js'],acceptanceCriteria:['A subtract regression passes']},
     {id:'b',dependencies:['a'],priority:1,files:['src/b.js'],tests:['test/b.test.js'],acceptanceCriteria:['B subtract regression passes']}
   ]}:{})};
 const result=submitPlanning(store,JSON.stringify({sessionId:request.sessionId,
   requestHash:request.requestHash,proposal:{
     draft,references:[{path:'src/a.js',line:1,quote:'export function'},
       {path:'test/a.test.js',line:1,quote:'import test'},
       ...(multi?[
         {path:'src/b.js',line:1,quote:'export function'},
         {path:'test/b.test.js',line:1,quote:'import test'}
       ]:[])],inferences:[]
   }}),{contextHash:request.contextHash,profileHash:request.profileHash,
     skillHash:request.skillHash});
 assert.equal(result.status,'VALIDATED');
 return {store,repo,request,result,originalGoal};
}
test('a validated Codex plan yields a pending approval Workflow, not execution',async t=>{
 const x=await fixture(t);
 const reviews=[];
 const created=await prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async scope=>{reviews.push(scope);return true;}
 });
 assert.equal(created.executionGranted,false);
 assert.equal(created.approved,false);
 assert.equal(created.state,'WAITING_APPROVAL');
 assert.equal(reviews.length,1);
 assert.equal(reviews[0].executionGranted,false);
 assert.equal(reviews[0].repositoryRoot,await realpath(x.repo));
 assert.equal(reviews[0].repositoryId,hash(await realpath(x.repo)));
 const workflow=x.store.get(created.workflowId);
 assert.equal(workflow.kind,'workflow');
 assert.equal(workflow.state,'WAITING_APPROVAL');
 assert.equal(workflow.base,x.request.context.discovery.base);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 const repeated=await prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>true
 });
 assert.equal(repeated.workflowId,created.workflowId);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,1);
});
test('planning review exposes frozen WorkItem DAG, mandatory criteria and budget before creation',async t=>{
 const f=await fixture(t);
 let reviews=0;
 await assert.rejects(prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async scope=>{
     reviews++;
     const source=f.result.workflowPreview.source;
     assert.equal(scope.deliveryMode,'local');
     assert.equal(scope.requiredVerification,true);
     assert.deepEqual(scope.requiredCapabilities,
       f.result.workflowPreview.workflow.requiredCapabilities);
     assert.equal(Object.isFrozen(scope.requiredCapabilities),true);
     assert.throws(()=>scope.requiredCapabilities.push('unreviewed-capability'),TypeError);
     assert.deepEqual(scope.executionLimits,{
       maxAttempts:source.maxAttempts,
       timeoutSeconds:source.timeoutSeconds,
       attemptBudgetUsd:source.attemptBudgetUsd
     });
     assert.deepEqual(scope.contextFiles,source.context);
     assert.deepEqual(scope.finalAcceptanceCriteria,
       f.result.workflowPreview.workflow.acceptanceCriteria);
     assert.deepEqual(scope.workItems,[{
       id:'change',priority:0,dependencies:[],
       files:['src/a.js'],tests:['test/a.test.js'],
       acceptanceCriteria:['Arithmetic regression passes']
     }]);
     assert.throws(()=>scope.workItems[0].files.push('src/extra.js'),TypeError);
     assert.throws(()=>{scope.workItems[0].acceptanceCriteria[0]='weakened';},TypeError);
     assert.throws(()=>{scope.executionLimits.maxAttempts=10;},TypeError);
     return false;
   }
 }),/review denied/);
 assert.equal(reviews,1);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});

test('no independent review means no Workflow creation',async t=>{
 const x=await fixture(t);
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>false
 }),/review denied/);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('changed planning receipt during review stops Workflow creation',async t=>{
 const x=await fixture(t);
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>{
     x.store.db.prepare("UPDATE host_planning SET resultHash=? WHERE id=?")
       .run('0'.repeat(64),x.request.sessionId);
     return true;
   }
 }),/unavailable/);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('a validated planning session cannot create a Workflow against a later clean HEAD',async t=>{
 const x=await fixture(t);
 await writeFile(join(x.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
 for(const args of [['add','src/a.js'],
  ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','new baseline']]) {
  const result=await git(x.repo,args);
  assert.equal(result.exitCode,0,result.stderr.toString());
 }
 let reviews=0;
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>{reviews++;return true;}
 }),/pinned baseline/);
 assert.equal(reviews,0);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('dirty source introduced during asynchronous planning review cannot create a Workflow',async t=>{
 const x=await fixture(t);
 let reviews=0;
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>{
     reviews++;
     await writeFile(join(x.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
     return true;
   }
 }),/pinned baseline/);
 assert.equal(reviews,1);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('unresolved Host result cannot become an approved execution contract',async t=>{
 const x=await fixture(t);
 x.store.db.prepare("UPDATE host_planning SET status='RECONCILING' WHERE id=?")
   .run(x.request.sessionId);
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>true
 }),/unavailable/);
});

// Two clean clones can share exactly the same baseline SHA. Planning grants
// and reviewed Workflows must still be scoped to the originally observed repo.
test('same-commit second repository cannot reuse a validated planning session',async t=>{
 const x=await fixture(t);
 const other=join(x.repo,'..','other-repo');
 const cloned=await git(x.repo,['clone',x.repo,other]);
 assert.equal(cloned.exitCode,0,cloned.stderr.toString());
 let requested=false;
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,other,x.request.sessionId,{
   authorizeReview:async()=>{requested=true;return true;}
 }),/repository identity differs/);
 assert.equal(requested,false);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('changed persisted planning request is rejected before review',async t=>{
 const x=await fixture(t);
 const row=x.store.db.prepare('SELECT body FROM host_planning WHERE id=?').get(x.request.sessionId);
 const body=JSON.parse(row.body);
 body.objective+=' unreviewed change';
 x.store.db.prepare('UPDATE host_planning SET body=? WHERE id=?')
   .run(JSON.stringify(body),x.request.sessionId);
 let requested=false;
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>{requested=true;return true;}
 }),/planning outcome unavailable/);
 assert.equal(requested,false);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('changed planning request during async review cannot reuse the initial scope',async t=>{
 const x=await fixture(t);
 await assert.rejects(prepareReviewedCodexWorkflow(x.store,x.repo,x.request.sessionId,{
   authorizeReview:async()=>{
     const row=x.store.db.prepare('SELECT body FROM host_planning WHERE id=?').get(x.request.sessionId);
     const body=JSON.parse(row.body);
     body.objective+=' changed during review';
     x.store.db.prepare('UPDATE host_planning SET body=? WHERE id=?')
       .run(JSON.stringify(body),x.request.sessionId);
     return true;
   }
 }),/planning outcome unavailable/);
 assert.equal(x.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});

test('persisted Codex plan has a real read-only Objective / Contract / DAG review entrypoint',async t=>{
 const f=await fixture(t);
 const before=f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n;
 const snapshot=inspectReviewedCodexPlan(f.store,f.request.sessionId);
 assert.equal(snapshot.kind,'CODEFLEET_CODEX_PLANNING_REVIEW_V1');
 assert.equal(snapshot.status,'REVIEW_REQUIRED');
 assert.equal(snapshot.objective,goal);
 assert.equal(snapshot.objectiveHash,hash(goal));
 assert.equal(snapshot.workflowHash,f.result.workflowPreview.workflow.workflowHash);
 assert.equal(snapshot.sourceContractHash,hash(f.result.workflowPreview.source));
 assert.deepEqual(snapshot.files,['src/a.js']);
 assert.deepEqual(snapshot.tests,['test/a.test.js']);
 // Review-only CLI includes the same mandatory final gate and bounded
 // per-WorkItem criteria that the trusted independent review callback sees.
 const preview=f.result.workflowPreview;
 assert.deepEqual(snapshot.contextFiles,preview.source.context);
 assert.equal(snapshot.deliveryMode,preview.source.delivery.mode);
 assert.deepEqual(snapshot.requiredCapabilities,preview.workflow.requiredCapabilities);
 assert.equal(snapshot.requiredCapabilities.includes('non_interactive_execution'),true);
 assert.equal(snapshot.requiredVerification,true);
 assert.deepEqual(snapshot.finalAcceptanceCriteria,preview.workflow.acceptanceCriteria);
 assert.deepEqual(snapshot.workItems,[{
   id:'change',priority:0,dependencies:[],
   files:['src/a.js'],tests:['test/a.test.js'],
   acceptanceCriteria:['Arithmetic regression passes']
 }]);
 assert.deepEqual(snapshot.workItems.map(n=>n.id),['change']);
 assert.equal(snapshot.approved,false);
 assert.equal(snapshot.executionGranted,false);
 assert.equal(snapshot.nativeHostVerified,false);
 assert.equal(snapshot.sourceFreshness,'NOT_RECHECKED');
 assert.equal(snapshot.authority,'PERSISTED_PLANNING_DATA_ONLY');
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,before);

 const direct=await dispatchProduct(['review-codex-plan',f.request.sessionId],{store:f.store});
 assert.equal(direct.exitCode,0);
 assert.equal(direct.data.workflowHash,snapshot.workflowHash);
 const readonly=await productCli(['review-codex-plan',f.request.sessionId],f.store.directory);
 assert.equal(readonly.exitCode,0);
 assert.deepEqual(readonly.data,direct.data);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,before);
 // A review display cannot act as an Operator grant or dispatch a Host.
 for(const args of [
  ['review-codex-plan',f.request.sessionId,'--allow-model'],
  ['review-codex-plan',f.request.sessionId,'--trust','fake'],
  ['review-codex-plan',f.request.sessionId,'other-session'],
  ['review-codex-plan']
 ]) {
  await assert.rejects(dispatchProduct(args,{store:f.store}),/review-codex-plan requires one Host Planning session ID and optional --repository only/);
 }
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,before);
});
test('public hash-confirmed Codex plan creates an idempotent pending Workflow without executing',async t=>{
 const f=await fixture(t);
 const preview=await productCli([
   'review-codex-plan',f.request.sessionId,'--repository',f.repo
 ],f.store.directory);
 assert.equal(preview.exitCode,0);
 assert.equal(preview.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
 const argv=['prepare-codex-workflow',f.request.sessionId,'--repository',f.repo,
   '--hash',preview.data.workflowHash,'--source-hash',preview.data.sourceContractHash];
 const first=await productCli(argv,f.store.directory);
 assert.equal(first.exitCode,0,first.data.error);
 assert.equal(first.data.state,'WAITING_APPROVAL');
 assert.equal(first.data.executionGranted,false);
 assert.equal(first.data.approved,false);
 assert.equal(first.data.reviewAuthority,'EXPLICIT_LOCAL_HASH_CONFIRMATION_ONLY');
 assert.equal(first.data.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(f.store.get(first.data.workflowId).kind,'workflow');
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 const repeated=await productCli(argv,f.store.directory);
 assert.equal(repeated.exitCode,0);
 assert.equal(repeated.data.workflowId,first.data.workflowId);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,1);
});

test('public Codex Workflow promotion refuses mismatched hashes, stale source and model flags',async t=>{
 const f=await fixture(t);
 const preview=await productCli([
   'review-codex-plan',f.request.sessionId,'--repository',f.repo
 ],f.store.directory);
 assert.equal(preview.exitCode,0);
 const argv=['prepare-codex-workflow',f.request.sessionId,'--repository',f.repo,
   '--hash',preview.data.workflowHash,'--source-hash',preview.data.sourceContractHash];
 for(const invalid of [
   argv.map(v=>v===preview.data.workflowHash?'f'.repeat(64):v),
   argv.map(v=>v===preview.data.sourceContractHash?'e'.repeat(64):v),
   [...argv,'--allow-model'],
   [...argv,'--actor','unverified'],
   [...argv,'--trust','f'.repeat(64)],
   ['prepare-codex-workflow',f.request.sessionId,'--repository','relative/path',
     '--hash',preview.data.workflowHash,'--source-hash',preview.data.sourceContractHash]
 ]){
   const denied=await productCli(invalid,f.store.directory);
   assert.equal(denied.exitCode,1,JSON.stringify({invalid,denied}));
 }
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
 await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\\n');
 const stale=await productCli(argv,f.store.directory);
 assert.equal(stale.exitCode,1);
 assert.match(stale.data.error,/pinned baseline/);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});

test('untrusted or unsubmitted Codex planning state cannot be presented as review-ready',async t=>{
 const f=await fixture(t);
 f.store.db.prepare('UPDATE host_planning SET resultHash=? WHERE id=?')
   .run('f'.repeat(64),f.request.sessionId);
 const blocked=await productCli(['review-codex-plan',f.request.sessionId],f.store.directory);
 assert.equal(blocked.exitCode,2);
 assert.equal(blocked.data.status,'BLOCKED');
 assert.equal(blocked.data.approved,false);
 assert.equal(blocked.data.executionGranted,false);
 assert.equal(blocked.data.workflowHash,undefined);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
test('submitted Host discovery drift is blocked before public review or independent Workflow grant',async t=>{
  const f=await fixture(t);
  const saved=f.store.db.prepare('SELECT result FROM host_planning WHERE id=?')
    .get(f.request.sessionId).result;
  for(const tamper of [
    result=>{result.plan.discovery.repositoryId='f'.repeat(64);},
    result=>{result.plan.discovery.dirty=true;}
  ]){
    const result=JSON.parse(saved);
    tamper(result);
    const forged=JSON.stringify(result);
    // Simulate an internally inconsistent persisted result with a matching
    // storage digest, not merely a stale SHA rejected by the outer Store.
    f.store.db.prepare('UPDATE host_planning SET result=?,resultHash=? WHERE id=?')
      .run(forged,hash(forged),f.request.sessionId);
    const view=await productCli(['review-codex-plan',f.request.sessionId],f.store.directory);
    assert.equal(view.exitCode,2);
    assert.equal(view.data.status,'BLOCKED');
    assert.equal(view.data.workflowHash,undefined);
    assert.equal(view.data.executionGranted,false);
    let reviewed=0;
    await assert.rejects(prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
      authorizeReview:async()=>{reviewed++;return true;}
    }),/Planning result, raw objective or baseline binding invalid/);
    assert.equal(reviewed,0);
  }
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
  // A denied review must not initialize Workflow storage just to count attempts.
  // Absence of the table proves there were no durable attempts or migration effects.
  assert.equal(f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_attempts'").get(),undefined);
});
test('a read-only Store without Host planning records reports UNAVAILABLE without migration',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'codefleet-codex-review-empty-'));
 const store=new Store(directory);
 store.close();
 t.after(async()=>rm(directory,{recursive:true,force:true}));
 const result=await productCli(['review-codex-plan','a'.repeat(36)],directory);
 assert.equal(result.exitCode,2);
 assert.equal(result.data.status,'UNAVAILABLE');
 assert.equal(result.data.executionGranted,false);
 const checked=new Store(directory,{readOnly:true});
 try {
  assert.equal(checked.db.prepare("SELECT 1 FROM sqlite_master WHERE name='host_planning'").get(),undefined);
  assert.equal(checked.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
 }finally{ checked.close(); }
});

// A hybrid DAG can carry role assignment and resource-lock constraints. Those
// fields are part of the owner-reviewed execution scope, not hidden metadata.
test('reviewed Codex plan displays immutable hybrid role and resource scope',async t=>{
 const f=await fixture(t);
 const original=f.result.workflowPreview.workflow;
 const roles={Planner:'planner',Architect:'architect',Executor:'executor',Reviewer:'reviewer'};
 const resources=['src/a.js'];
 const workflow=hybridDefinition(f.result.workflowPreview.source,{
   workflowId:original.workflowId,base:original.base,
   workflowVersion:original.workflowVersion,maxParallel:1,
   items:original.items.map(item=>({...item,roles,resources}))
 });
 const row=f.store.db.prepare('SELECT result FROM host_planning WHERE id=?')
   .get(f.request.sessionId);
 const result=JSON.parse(row.result);
 result.workflowPreview.workflow=workflow;
 const encoded=JSON.stringify(result);
 f.store.db.prepare('UPDATE host_planning SET result=?,resultHash=? WHERE id=?')
   .run(encoded,hash(encoded),f.request.sessionId);
 const preview=inspectReviewedCodexPlan(f.store,f.request.sessionId);
 assert.equal(preview.status,'REVIEW_REQUIRED');
 assert.deepEqual(preview.workItems[0].roles,roles);
 assert.deepEqual(preview.workItems[0].resources,resources);
 let reviews=0;
 await assert.rejects(prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async scope=>{
     reviews++;
     assert.deepEqual(scope.workItems[0].roles,roles);
     assert.deepEqual(scope.workItems[0].resources,resources);
     assert.equal(Object.isFrozen(scope.workItems[0].roles),true);
     assert.equal(Object.isFrozen(scope.workItems[0].resources),true);
     assert.throws(()=>{scope.workItems[0].roles.Executor='replacement';},TypeError);
     assert.throws(()=>scope.workItems[0].resources.push('outside'),TypeError);
     return false;
   }
 }),/review denied/);
 assert.equal(reviews,1);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});

test('public Codex plan review optionally checks a clean pinned repository before showing review-ready',async t=>{
 const f=await fixture(t);
 const before=f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n;
 const argv=['review-codex-plan',f.request.sessionId,'--repository',f.repo];
 const ready=await productCli(argv,f.store.directory);
 assert.equal(ready.exitCode,0);
 assert.equal(ready.data.status,'REVIEW_REQUIRED');
 assert.equal(ready.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
 assert.equal(ready.data.executionGranted,false);
 const cloneRoot=join(f.repo,'..','clone-for-readonly-review');
 const cloned=await git(f.repo,['clone',f.repo,cloneRoot]);
 assert.equal(cloned.exitCode,0,cloned.stderr.toString());
 const wrongRepo=await productCli(['review-codex-plan',f.request.sessionId,'--repository',cloneRoot],f.store.directory);
 assert.equal(wrongRepo.exitCode,2);
 assert.equal(wrongRepo.data.status,'BLOCKED');
 assert.equal(wrongRepo.data.workflowHash,undefined);
 assert.equal(wrongRepo.data.sourceFreshness,'STALE_OR_MISMATCHED');

 await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
 const dirty=await productCli(argv,f.store.directory);
 assert.equal(dirty.exitCode,2);
 assert.equal(dirty.data.status,'BLOCKED');
 assert.equal(dirty.data.workflowHash,undefined);

 for(const gitArgs of [['add','src/a.js'],
  ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','different baseline']]) {
  const result=await git(f.repo,gitArgs);
  assert.equal(result.exitCode,0,result.stderr.toString());
 }
 const changedHead=await productCli(argv,f.store.directory);
 assert.equal(changedHead.exitCode,2);
 assert.equal(changedHead.data.status,'BLOCKED');
 assert.equal(changedHead.data.sourceFreshness,'STALE_OR_MISMATCHED');
 const relative=await productCli(['review-codex-plan',f.request.sessionId,'--repository','relative/path'],f.store.directory);
 assert.equal(relative.exitCode,2);
 assert.equal(relative.data.status,'BLOCKED');
 const invalid=await productCli(['delivered-status','workflow-id','--repository',f.repo],f.store.directory);
 assert.equal(invalid.exitCode,1);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,before);
});

test('reviewed Codex Goal to Workflow still requires independent Workflow and Host admission',async t=>{
  const f=await fixture(t);
  const preview=await productCli([
    'review-codex-plan',f.request.sessionId,'--repository',f.repo
  ],f.store.directory);
  assert.equal(preview.exitCode,0);
  assert.equal(preview.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
  assert.equal(preview.data.executionGranted,false);

  let planReviews=0,hostReviews=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'offline-fixture',enableHostTurns:true,
    authorizeReviewedWorkflow:async scope=>{
      planReviews++;
      assert.equal(scope.workflowHash,preview.data.workflowHash);
      assert.equal(scope.sourceContractHash,preview.data.sourceContractHash);
      assert.equal(scope.executionGranted,false);
      return true;
    },
    authorizeWorkflow:async scope=>{
      hostReviews++;
      assert.equal(scope.workflowHash,preview.data.workflowHash);
      assert.equal(scope.objective,goal);
      assert.deepEqual(scope.workItems.map(item=>item.id),['change']);
      assert.equal(scope.executionMode,'HOST_READ_ONLY_PROPOSAL');
      assert.equal(scope.protectedVerified,false);
      return false;
    },
    verificationBackend:{
      prepare:async()=>{throw Error('Unapproved verification must not run');},
      verify:async()=>{throw Error('Unapproved verification must not run');},
      cleanup:async()=>{throw Error('Unapproved verification must not run');}
    },
    transport:async()=>{throw Error('Unapproved Host Turn must not run');}
  });
  const created=await api.prepareReviewedExistingWorkflow(f.repo,f.request.sessionId);
  assert.equal(planReviews,1);
  assert.equal(created.state,'WAITING_APPROVAL');
  assert.equal(created.approved,false);
  assert.equal(created.executionGranted,false);
  assert.equal(hostReviews,0);

  // A valid reviewed Contract is not a Workflow approval or an execution grant.
  await assert.rejects(api.runExistingWorkflow(created.workflowId),/Workflow approval absent/);
  assert.equal(hostReviews,0);
  approveWorkflow(f.store,created.workflowId,{
    actor:'local-fixture-actor',workflowHash:created.workflowHash,
    expiresAt:Date.now()+60_000
  });
  // Even an explicitly approved Local Workflow cannot invoke Codex without
  // the independent exact managed-Host grant from the trusted embedding.
  await assert.rejects(api.runExistingWorkflow(created.workflowId),
    /Exact managed Workflow execution grant denied/);
  assert.equal(hostReviews,1);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
  const status=await api.status(created.workflowId);
  assert.equal(status.objectiveComplete,false);
  assert.equal(status.deliveryRecorded,false);
});
test('reviewed Codex Goal crosses approved Workflow, bounded fake Host, delivered Objective Judge',async t=>{
  // This joins the persisted Host Planning result to the *same* Controller and
  // delivery path used by the synthetic A→B fixture. No model, credential,
  // real Host executable, protected backend or real user repository is used.
  const f=await fixture(t);
  const hostTurns=[], verifierCalls=[], grants=[], planningTurns=[], planningScopes=[];
  const approvedCriteria=[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}];
  const createApi=store=>createCodexMvpFacade(store,{
    executable:process.execPath,model:'OFFLINE_FAKE_HOST',enableHostTurns:true,
    authorizePlanning:async scope=>{
      planningScopes.push(scope);
      assert.equal(scope.objective,goal);
      // Windows can supply an 8.3 short path while realpath returns its long form.
      assert.equal(await realpath(scope.repositoryRoot),await realpath(f.repo));
      assert.equal(scope.requestedHostPolicy.writes,false);
      assert.equal(scope.requestedHostPolicy.network,'deny');
      assert.equal(scope.executionGranted,false);
      return true;
    },
    authorizeReviewedWorkflow:async scope=>{
      assert.equal(scope.executionGranted,false);
      assert.equal(scope.workflowHash,f.result.workflowPreview.workflow.workflowHash);
      return true;
    },
    authorizeWorkflow:async scope=>{
      grants.push(scope);
      assert.equal(scope.objective,goal);
      assert.deepEqual(scope.workItems.map(item=>item.id),['change']);
      assert.deepEqual(scope.destinationCriteria,approvedCriteria);
      assert.equal(scope.executionMode,'HOST_READ_ONLY_PROPOSAL');
      assert.equal(scope.protectedVerified,false);
      return true;
    },
    transport:async request=>{
      const prompt=JSON.parse(request.prompt);
      if(prompt.kind==='CODEFLEET_HOST_PLANNING_V1'){
        planningTurns.push(prompt.sessionId);
        assert.equal(prompt.originalObjective,goal);
        assert.equal(await realpath(request.cwd),await realpath(f.repo));
        const draft={schemaVersion:2,objective:goal,
          base:prompt.context.discovery.base,files:['src/a.js'],tests:['test/a.test.js'],
          criteria:[{description:'Arithmetic regression passes',
            method:'protected-tests',tests:['test/a.test.js']}],
          risks:[],unknowns:[],effects:['local-edit']};
        return {
          terminalStatus:'completed',threadId:'fake-goal-planning-thread',
          turnId:'fake-goal-planning-turn',authority:'PROVIDER_REPORTED_ONLY',
          protectedVerified:false,
          text:JSON.stringify({sessionId:prompt.sessionId,requestHash:prompt.requestHash,
            proposal:{draft,references:[
              {path:'src/a.js',line:1,quote:'export function'},
              {path:'test/a.test.js',line:1,quote:'import test'}
            ],inferences:[]}})
        };
      }
      assert.equal(prompt.workItemId,'change');
      hostTurns.push(prompt.workItemId);
      return {
        threadId:'fake-planning-chain-thread',turnId:'fake-planning-chain-turn',
        terminalStatus:'completed',authority:'PROVIDER_REPORTED_ONLY',
        protectedVerified:false,executionMode:'HOST_READ_ONLY_PROPOSAL',
        text:JSON.stringify({summary:'Offline fixture edit only',
          edits:[{path:'src/a.js',oldText:'return x+y;',newText:'return x-y;'}]})
      };
    },
    verificationBackend:{
      prepare:async()=>{},
      verify:async ({directory,tests})=>{
        verifierCalls.push([...tests]);
        const contents=await readFile(join(directory,'src/a.js'),'utf8');
        const passed=contents.includes('return x-y;');
        return {authority:'HARNESS_EXECUTED',tests:tests.length,
          passed:passed?tests.length:0,failed:passed?0:tests.length,
          skipped:0,todo:0,exitCode:passed?0:1,interrupted:false,
          truncated:false,testNames:tests};
      },
      cleanup:async()=>{}
    },
    unknownCostBudget:{authorize:async request=>request.unknownCostTurns<=2},
    destinationDelivery:{
      approvedCriteria,
      authorize:async scope=>{
        assert.deepEqual(scope.objectiveCriteria,approvedCriteria);
        assert.equal(scope.objectiveCriteriaHash,hash(approvedCriteria));
        assert.equal((await realpath(scope.destination)).toLowerCase(),
          (await realpath(f.repo)).toLowerCase());
        return true;
      },
      verify:async ({run,delivery,candidate})=>{
        assert.equal(delivery.targetTreeHash,candidate.candidateHash);
        assert.match(await readFile(join(f.repo,'src/a.js'),'utf8'),/return x-y;/);
        const evidence={
          kind:'OBJECTIVE_CRITERION_OBSERVATION_V1',
          objectiveId:run.id,revision:run.revision,criterionId:'C1',
          targetTreeHash:delivery.targetTreeHash,authority:'LOCAL_EXECUTED',
          independentObserver:true,commandHash:'a'.repeat(64),
          observationHash:'b'.repeat(64),complete:true,tests:1,passed:1,failed:0,
          skipped:0,todo:0,exitCode:0,interrupted:false,truncated:false,
          integrity:'MATCHED',verificationBackend:'SYNTHETIC_TEST_ONLY',
          protection:'UNPROTECTED'
        };
        const ref=f.store.artifact(evidence);
        return {criteria:approvedCriteria,evidenceRefs:{C1:ref},
          readVerifiedEvidence:ref=>f.store.readArtifact(ref)};
      }
    }
  });
  // Start at the real trusted Goal entry, not a fixture-provided Planning
  // result. Exercise the entire public review/prepare boundary before the
  // existing authenticated Operator and Controller/Host workflow lane.
  const planned=await productCli([
    'plan-codex-goal',goal,'--repository',f.repo
  ],f.store.directory,{createCodexAdmission:store=>({facade:createApi(store)})});
  assert.equal(planned.exitCode,0,planned.data?.error);
  assert.equal(planned.data.status,'VALIDATED');
  assert.equal(planned.data.hostLiveAcceptance,'UNVERIFIED');
  const sessionId=planned.data.evidence.sessionId;
  assert.equal(planningScopes.length,1);
  assert.deepEqual(planningTurns,[sessionId]);
  const review=await productCli([
    'review-codex-plan',sessionId,'--repository',f.repo
  ],f.store.directory);
  assert.equal(review.exitCode,0,review.data?.error);
  assert.equal(review.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
  assert.equal(review.data.workflowHash,f.result.workflowPreview.workflow.workflowHash);
  const staged=await productCli([
    'prepare-codex-workflow',sessionId,'--repository',f.repo,
    '--hash',review.data.workflowHash,
    '--source-hash',review.data.sourceContractHash
  ],f.store.directory);
  assert.equal(staged.exitCode,0,staged.data?.error);
  assert.equal(staged.data.reviewAuthority,'EXPLICIT_LOCAL_HASH_CONFIRMATION_ONLY');
  assert.equal(staged.data.executionGranted,false);
  assert.equal(staged.data.approved,false);
  const api=createApi(f.store);
  const created=staged.data;
  assert.equal(created.state,'WAITING_APPROVAL');
  assert.equal(created.executionGranted,false);
  const before=await api.status(created.workflowId);
  assert.equal(before.objectiveComplete,false);
  const pendingGoal=await productCli(['codex-goal-progress',sessionId],f.store.directory);
  assert.equal(pendingGoal.exitCode,2);
  assert.equal(pendingGoal.data.status,'WORKFLOW_IN_PROGRESS');
  assert.equal(pendingGoal.data.workflowId,created.workflowId);
  assert.equal(pendingGoal.data.workflow.workflowState,'WAITING_APPROVAL');
  assert.equal(pendingGoal.data.continuation.status,'AWAIT_WORKFLOW_APPROVAL');
  assert.equal(pendingGoal.data.continuation.automaticReplay,false);
  assert.equal(pendingGoal.data.objectiveComplete,false);
  assert.equal(hostTurns.length,0);
  approveWorkflow(f.store,created.workflowId,{
    actor:'offline-fixture-reviewer',workflowHash:created.workflowHash,
    expiresAt:Date.now()+60_000
  });
  const operatorScopes=[];
  const goalCommand=await productCli([
    'run-codex-goal',sessionId,'--hash',created.workflowHash
  ],f.store.directory,{
    createCodexAdmission:store=>({
      facade:createApi(store),
      authorizeOperator:async scope=>{
        operatorScopes.push(scope);
        assert.equal(scope.kind,'CODEFLEET_AUTHENTICATED_CODEX_ENTRY_V1');
        assert.equal(scope.workflowId,created.workflowId);
        assert.equal(scope.planningSessionId,sessionId);
        assert.equal(scope.workflowHash,created.workflowHash);
        assert.equal(scope.protectedVerified,false);
        assert.equal(scope.resume,false);
        assert.equal(Object.isFrozen(scope.sourceContract),true);
        assert.equal(Object.isFrozen(scope.workflowContract),true);
        assert.deepEqual(scope.workflowContract.items.map(item=>item.id),['change']);
        return true;
      }
    })
  });
  assert.equal(goalCommand.exitCode,0,goalCommand.data?.error);
  assert.equal(goalCommand.data.planningSessionId,sessionId);
  assert.equal(operatorScopes.length,1);
  const completed=goalCommand.data;
  assert.equal(completed.workflowState,'COMPLETED',completed.objective?.reason);
  assert.equal(completed.objective.status,'COMPLETE',completed.objective?.reason);
  assert.equal(completed.objective.protection,'UNPROTECTED');
  assert.equal(completed.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(completed.protectedVerified,false);
  assert.deepEqual(planningTurns,[sessionId]);
  assert.deepEqual(hostTurns,['change']);
  // The Controller independently checks baseline and candidate for both the
  // WorkItem and final integration, using the same pinned regression suite.
  assert.deepEqual(verifierCalls,Array.from({length:4},()=>['test/a.test.js']));
  assert.equal(grants.length,1);
  assert.equal(completed.progress.continuation.status,'OBJECTIVE_COMPLETE');
  assert.equal(completed.progress.executionGranted,false);
  assert.equal(completed.progress.continuation.automaticReplay,false);
  assert.equal(completed.progress.objectiveComplete,true);
  const observed=await dispatchProduct(['delivered-status',created.workflowId],{store:f.store});
  assert.equal(observed.exitCode,0);
  assert.equal(observed.data.objectiveComplete,true);
  const goalComplete=await productCli(['codex-goal-progress',sessionId],f.store.directory);
  assert.equal(goalComplete.exitCode,0);
  assert.equal(goalComplete.data.status,'OBJECTIVE_COMPLETE');
  assert.equal(goalComplete.data.objectiveComplete,true);
  assert.equal(goalComplete.data.workflowId,created.workflowId);
  assert.equal(goalComplete.data.workflow.continuation.status,'OBJECTIVE_COMPLETE');
  assert.equal(goalComplete.data.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(goalComplete.data.executionGranted,false);
  // The Goal execution alias must not dispatch another Host/Controller Turn
  // once the independently reobserved delivered Objective is complete.
  const settledEvents=f.store.events(created.workflowId).length;
  let onCompletionGrants=0;
  const alreadyDone=await productCli([
    'run-codex-goal',sessionId,'--hash',created.workflowHash
  ],f.store.directory,{createCodexAdmission:store=>({
    facade:createCodexMvpFacade(store,{
      executable:process.execPath,model:'OFFLINE_NO_REEXECUTION'
    }),authorizeOperator:async()=>{onCompletionGrants++;throw Error('Completed Objective must not request an execution grant');}
  })});
  assert.equal(alreadyDone.exitCode,0,alreadyDone.data?.error);
  assert.equal(alreadyDone.data.status,'OBJECTIVE_COMPLETE');
  assert.equal(alreadyDone.data.objectiveComplete,true);
  assert.equal(alreadyDone.data.executionSucceeded,false);
  assert.equal(alreadyDone.data.executionGranted,false);
  assert.equal(onCompletionGrants,0);
  assert.equal(f.store.events(created.workflowId).length,settledEvents);
  await writeFile(join(f.repo,'src/a.js'),'user drift after delivery');
  const drifted=await api.status(created.workflowId);
  assert.equal(drifted.objectiveComplete,false);
  assert.equal(drifted.targetDrift,true);
  const goalDrift=await productCli(['codex-goal-progress',sessionId],f.store.directory);
  assert.equal(goalDrift.exitCode,2);
  assert.equal(goalDrift.data.objectiveComplete,false);
  assert.equal(goalDrift.data.status,'WORKFLOW_IN_PROGRESS');
  assert.equal(goalDrift.data.workflow.continuation.status,'DELIVERED_TARGET_DRIFT_REVIEW_REQUIRED');
  assert.equal(goalDrift.data.continuation.automaticReplay,false);
});

test('public Codex Workflow execution is unavailable without authenticated Host admission',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 for (const action of ['run-codex-workflow','resume-codex-workflow']) {
   const response=await productCli([action,...argv.slice(1)],f.store.directory);
   assert.equal(response.exitCode,1);
   assert.match(response.data.error,/AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
 }
 await assert.rejects(dispatchProduct(argv,{store:f.store}),/AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
 await assert.rejects(dispatchProduct(argv,{store:f.store,execution:{
   codexAdmission:{authorizeOperator:async()=>true,facade:{runExistingWorkflow:async()=>{}}}
 }}),/AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
 for(const extra of [['--allow-model'],['--actor','fake'],['--trust','fake']]) {
   await assert.rejects(dispatchProduct([...argv,...extra],{store:f.store}),
     /Codex Workflow execution requires one Workflow ID and exact --hash only/);
 }
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('trusted CLI wrapper binds authenticated Codex admission to its own Store without granting Host execution',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 let factoryCalls=0,operatorCalls=0;
 const createCodexAdmission=store=>{
   factoryCalls++;
   assert.notEqual(store,f.store);
   const facade=createCodexMvpFacade(store,{
     executable:process.execPath,model:'OFFLINE_NO_HOST',enableHostTurns:false
   });
   return {facade,authorizeOperator:async scope=>{
     operatorCalls++;
     assert.equal(scope.workflowId,created.workflowId);
     assert.equal(scope.workflowHash,created.workflowHash);
     assert.equal(scope.protectedVerified,false);
     return false;
   }};
 };
 // Malformed requests must never reach the privileged Host injection.
 const malformed=await productCli([...argv,'--actor','untrusted'],f.store.directory,{
   createCodexAdmission
 });
 assert.equal(malformed.exitCode,1);
 assert.match(malformed.data.error,/Codex Workflow execution requires one Workflow ID/);
 assert.equal(factoryCalls,0);
 // A valid factory is not a Workflow approval or a public Operator.
 const pending=await productCli(argv,f.store.directory,{createCodexAdmission});
 assert.equal(pending.exitCode,1);
 assert.match(pending.data.error,/Workflow approval absent/);
 assert.equal(factoryCalls,1);
 assert.equal(operatorCalls,0);
 approveWorkflow(f.store,created.workflowId,{
   actor:'offline-reviewer',workflowHash:created.workflowHash,
   expiresAt:Date.now()+60_000
 });
 for(const action of ['run-codex-workflow','resume-codex-workflow']){
   const denied=await productCli([action,...argv.slice(1)],f.store.directory,{
     createCodexAdmission
   });
   assert.equal(denied.exitCode,1);
   assert.match(denied.data.error,/Authenticated Codex Operator admission denied/);
 }
 assert.equal(factoryCalls,3);
 assert.equal(operatorCalls,2);
 // A fabricated facade cannot substitute for the embedding-owned capability.
 const forged=await productCli(argv,f.store.directory,{
   createCodexAdmission:()=>({
     facade:{runExistingWorkflow:async()=>{throw Error('must not execute');}},
     authorizeOperator:async()=>true
   })
 });
 assert.equal(forged.exitCode,1);
 assert.match(forged.data.error,/AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('authenticated Codex entry refuses genuine facades bound to another Store connection',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 // A second Store can point at either a different database or the same
 // database via another handle. Neither is the explicitly reviewed executor.
 const others=[
   new Store(join(f.store.directory,'unrelated-state')),
   new Store(f.store.directory)
 ];
 // Close the extra SQLite connections before the fixture removes its Windows temp directory.
 try {
   let operatorCalls=0,hostCalls=0;
   for(const other of others) {
     const foreignFacade=createCodexMvpFacade(other,{
       executable:process.execPath,model:'offline-test',enableHostTurns:true,
       authorizeWorkflow:async()=>{hostCalls++;return true;},
       verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}}
     });
     await assert.rejects(dispatchProduct(argv,{store:f.store,execution:{
       codexAdmission:{facade:foreignFacade,authorizeOperator:async()=>{
         operatorCalls++;return true;
       }}
     }}),/AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
   }
   assert.equal(operatorCalls,0);
   assert.equal(hostCalls,0);
   assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 } finally {
  for(const other of others) other.close();
 }
});

test('authenticated Codex execution requires unchanged originating Planning evidence',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-test',workflowHash:created.workflowHash,
   expiresAt:Date.now()+60_000
 });
 let operatorReviews=0,hostReviews=0;
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'offline-test',enableHostTurns:true,
   authorizeWorkflow:async()=>{hostReviews++;return false;},
   verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}}
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 const original=f.store.db.prepare(
   'SELECT digest FROM graph_revisions WHERE runId=? AND revision=1'
 ).get(created.workflowId);
 const invalidateOrigin=()=>f.store.db.prepare(
   'UPDATE graph_revisions SET digest=? WHERE runId=? AND revision=1'
 ).run('f'.repeat(64),created.workflowId);
 const restoreOrigin=()=>f.store.db.prepare(
   'UPDATE graph_revisions SET digest=? WHERE runId=? AND revision=1'
 ).run(original.digest,created.workflowId);
 const admission={facade,authorizeOperator:async scope=>{
   operatorReviews++;
   assert.equal(scope.planningSessionId,f.request.sessionId);
   assert.match(scope.planningReviewHash,/^[a-f0-9]{64}$/);
   invalidateOrigin();
   return true;
 }};
 try {
   invalidateOrigin();
   await assert.rejects(dispatchProduct(argv,{store:f.store,execution:{
     codexAdmission:admission
   }}),/originating Planning\/Contract\/DAG provenance invalid/);
   assert.equal(operatorReviews,0);
   restoreOrigin();
   await assert.rejects(dispatchProduct(argv,{store:f.store,execution:{
     codexAdmission:admission
   }}),/originating Planning provenance changed during authenticated admission/);
   assert.equal(operatorReviews,1);
   assert.equal(hostReviews,0);
   assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 } finally {
   restoreOrigin();
 }
});

test('Codex authenticated entry refuses a dirty checkout before Operator admission',async t=>{
  const f=await fixture(t);
  const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
    authorizeReview:async()=>true
  });
  approveWorkflow(f.store,created.workflowId,{
    actor:'local-test',workflowHash:created.workflowHash,expiresAt:Date.now()+60_000
  });
  let operatorReviews=0,hostReviews=0;
  const facade=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'offline-test',enableHostTurns:true,
    authorizeWorkflow:async()=>{hostReviews++;return false;},
    verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}}
  });
  await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
  const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
  await assert.rejects(dispatchProduct(argv,{store:f.store,execution:{
    codexAdmission:{facade,authorizeOperator:async()=>{operatorReviews++;return true;}}
  }}),/Codex Workflow source changed before authenticated admission/);
  assert.equal(operatorReviews,0);
  assert.equal(hostReviews,0);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('Codex authenticated entry refuses dirty or replaced HEAD after Operator review',async t=>{
  const f=await fixture(t);
  const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
    authorizeReview:async()=>true
  });
  approveWorkflow(f.store,created.workflowId,{
    actor:'local-test',workflowHash:created.workflowHash,expiresAt:Date.now()+60_000
  });
  let operatorReviews=0,hostReviews=0;
  const facade=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'offline-test',enableHostTurns:true,
    authorizeWorkflow:async()=>{hostReviews++;return false;},
    verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}}
  });
  const argv=['resume-codex-workflow',created.workflowId,'--hash',created.workflowHash];
  const changes=[
    async()=>writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n'),
    async()=>{
      await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
      for(const args of [['add','src/a.js'],
        ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
          'commit','-m','replacement baseline']]) {
        const result=await git(f.repo,args);
        assert.equal(result.exitCode,0,result.stderr.toString());
      }
    }
  ];
  for(const change of changes) {
    await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x+y; }\n');
    await assert.rejects(dispatchProduct(argv,{store:f.store,execution:{
      codexAdmission:{facade,authorizeOperator:async()=>{
        operatorReviews++;
        await change();
        return true;
      }}
    }}),/Codex Workflow source changed during authenticated admission/);
  }
  assert.equal(operatorReviews,2);
  assert.equal(hostReviews,0);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('authenticated Codex entry preserves separate Workflow and managed Host grants',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 let hostReviews=0; const operatorScopes=[];
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'test-codex',enableHostTurns:true,
   verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}},
   authorizeWorkflow:async()=>{hostReviews++;return false;}
 });
 const admission={facade,authorizeOperator:async scope=>{
   operatorScopes.push(scope);
   assert.equal(Object.isFrozen(scope),true);
   assert.equal(scope.workflowHash,created.workflowHash);
   assert.equal(scope.resume,false);
   assert.equal(scope.sourceContract.goal,goal);
   assert.equal(scope.workflowContract.workflowHash,created.workflowHash);
   assert.deepEqual(scope.workflowContract.items.map(item=>item.id),['change']);
   assert.equal(Object.isFrozen(scope.sourceContract),true);
   assert.equal(Object.isFrozen(scope.workflowContract.items[0].files),true);
   assert.throws(()=>scope.workflowContract.items[0].files.push('src/extra.js'),TypeError);
   return true;
 }};
 const execution={codexAdmission:admission};
 await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),/Workflow approval absent/);
 assert.equal(hostReviews,0);
 assert.equal(operatorScopes.length,0);
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-test',workflowHash:created.workflowHash,expiresAt:Date.now()+60000
 });
 const denied=await dispatchProduct(argv,{store:f.store,execution});
 assert.equal(denied.exitCode,1);
 assert.equal(denied.data.status,'CODEX_WORKFLOW_EXECUTION_BLOCKED');
 assert.match(denied.data.error,/Exact managed Workflow execution grant denied/);
 assert.equal(denied.data.executionGranted,false);
 assert.equal(denied.data.executionSucceeded,false);
 assert.equal(denied.data.objectiveComplete,false);
 assert.equal(denied.data.continuation.automaticReplay,false);
 assert.equal(hostReviews,1);
 assert.equal(operatorScopes.length,1);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 // A denied authenticated session never reaches the managed Host reviewer.
 admission.authorizeOperator=async()=>false;
 await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),/Operator admission denied/);
 assert.equal(hostReviews,1);
});

test('authenticated Codex Operator review fails closed on changed source and DAG artifacts',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-test',workflowHash:created.workflowHash,expiresAt:Date.now()+60000
 });
 const original=f.store.get(created.workflowId);
 let operatorReviews=0,hostReviews=0;
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'offline-fixture',enableHostTurns:true,
   authorizeWorkflow:async()=>{hostReviews++;return true;},
   verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}}
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 const execution={codexAdmission:{facade,authorizeOperator:async scope=>{
   operatorReviews++;
   assert.equal(scope.workflowContract.workflowHash,created.workflowHash);
   // A late, same-hash persisted DAG mutation must not inherit this grant.
   const current=f.store.get(created.workflowId);
   f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify({
     ...current,contract:{...current.contract,requiredVerification:false}
   }),created.workflowId);
   return true;
 }}};
 // Both stale source pointers and an altered DAG are rejected before review.
 for(const changed of [
   {...original,sourceRef:'0'.repeat(64)},
   {...original,contract:{...original.contract,requiredVerification:false}}
 ]) {
   f.store.db.prepare('UPDATE runs SET body=? WHERE id=?')
     .run(JSON.stringify(changed),created.workflowId);
   await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),
     /Codex Workflow originating Planning\/Contract\/DAG provenance invalid/);
 }
 assert.equal(operatorReviews,0);
 f.store.db.prepare('UPDATE runs SET body=? WHERE id=?')
   .run(JSON.stringify(original),created.workflowId);
 await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),
   /Codex Workflow originating Planning provenance changed during authenticated admission/);
 assert.equal(operatorReviews,1);
 assert.equal(hostReviews,0);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('Codex Operator admission pins current Workflow approval actor and expiry',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 approveWorkflow(f.store,created.workflowId,{
   actor:'initial-reviewer',workflowHash:created.workflowHash,
   expiresAt:Date.now()+60_000
 });
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 let hostReviews=0,operatorReviews=0;
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'test-codex',enableHostTurns:true,
   verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}},
   authorizeWorkflow:async()=>{hostReviews++;return true;}
 });
 for(const mutation of [
   () => f.store.db.prepare('UPDATE workflow_approvals SET actor=? WHERE runId=?')
     .run('replacement-reviewer',created.workflowId),
   () => f.store.db.prepare('UPDATE workflow_approvals SET expires=expires+60000 WHERE runId=?')
     .run(created.workflowId)
 ]) {
   const execution={codexAdmission:{facade,authorizeOperator:async scope=>{
     operatorReviews++;
     assert.match(scope.workflowApprovalHash,/^[a-f0-9]{64}$/);
     mutation();
     return true;
   }}};
   await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),
     /Workflow approval changed during authenticated admission/);
 }
 assert.equal(operatorReviews,2);
 assert.equal(hostReviews,0);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('Codex execution entry refuses an approval scope changed during asynchronous authentication',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'test-codex',enableHostTurns:true,
   verificationBackend:{prepare:async()=>{},verify:async()=>{},cleanup:async()=>{}},
   authorizeWorkflow:async()=>{throw Error('Must not reach Host execution review');}
 });
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-test',workflowHash:created.workflowHash,
   expiresAt:Date.now()+60_000
 });
 let operatorReviews=0;
 const execution={codexAdmission:{facade,authorizeOperator:async()=>{
   operatorReviews++;
   const changed={...f.store.get(created.workflowId),revision:2};
   f.store.db.prepare('UPDATE runs SET body=? WHERE id=?')
     .run(JSON.stringify(changed),created.workflowId);
   return true;
 }}};
 await assert.rejects(dispatchProduct([
   'resume-codex-workflow',created.workflowId,'--hash',created.workflowHash
 ],{store:f.store,execution}),/scope changed during authenticated admission/);
 assert.equal(operatorReviews,1);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});


test('public Codex Workflow review shows persisted DAG and approval without granting Host execution',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const argv=['review-codex-workflow',created.workflowId];
 const eventCount=f.store.events(created.workflowId).length;
 const before=await productCli(argv,f.store.directory);
 assert.equal(before.exitCode,0);
 const view=before.data;
 assert.equal(view.kind,'CODEFLEET_CODEX_WORKFLOW_REVIEW_V1');
 assert.equal(view.status,'REVIEW_REQUIRED');
 assert.equal(view.approvalState,'MISSING_OR_EXPIRED');
 assert.equal(view.executionGranted,false);
 assert.equal(view.authenticatedOperatorAvailable,false);
 assert.equal(view.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(view.workflowHash,created.workflowHash);
 assert.equal(view.sourceContractHash,created.sourceContractHash);
 assert.equal(view.objective,goal);
 assert.deepEqual(view.workItems.map(item=>item.id),['change']);
 assert.deepEqual(view.workItems[0].acceptanceCriteria,['Arithmetic regression passes']);
 assert.deepEqual(view.finalAcceptanceCriteria,f.result.workflowPreview.workflow.acceptanceCriteria);
 assert.equal(f.store.events(created.workflowId).length,eventCount);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-fixture',workflowHash:created.workflowHash,expiresAt:Date.now()+60000
 });
 const approved=await productCli(argv,f.store.directory);
 assert.equal(approved.exitCode,0);
 assert.equal(approved.data.approvalState,'CURRENT_WORKFLOW_APPROVAL_VALID');
 assert.equal(approved.data.executionGranted,false);
 assert.equal(approved.data.protectedVerified,false);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 for(const extra of [['--allow-model'],['--actor','fake'],['--hash',created.workflowHash]]) {
   await assert.rejects(dispatchProduct([...argv,...extra],{store:f.store}),
     /review-codex-workflow requires exactly one Workflow ID/);
 }
});

test('public Codex Workflow review fails closed on stale planning or mutated DAG provenance',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const argv=['review-codex-workflow',created.workflowId];
 const initial=f.store.get(created.workflowId);
 const mutate=body=>f.store.db.prepare('UPDATE runs SET body=? WHERE id=?')
   .run(JSON.stringify(body),created.workflowId);
 for(const replacement of [
   {...initial,sourceRef:'0'.repeat(64)},
   {...initial,contract:{...initial.contract,requiredVerification:false}},
   {...initial,repo:join(f.repo,'different-clone')}
 ]) {
   mutate(replacement);
   const response=await productCli(argv,f.store.directory);
   assert.equal(response.exitCode,2);
   assert.equal(response.data.status,'BLOCKED');
   assert.equal(response.data.executionGranted,false);
 }
 mutate(initial);
 f.store.db.prepare('UPDATE graph_revisions SET digest=? WHERE runId=? AND revision=1')
   .run('0'.repeat(64),created.workflowId);
 const forged=await productCli(argv,f.store.directory);
 assert.equal(forged.exitCode,2);
 assert.equal(forged.data.status,'BLOCKED');
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});


test('reviewed Codex Workflow rejects a rewritten original DAG body before and during Operator admission',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-fixture',workflowHash:created.workflowHash,expiresAt:Date.now()+60_000
 });
 const row=f.store.db.prepare(
   'SELECT digest,body FROM graph_revisions WHERE runId=? AND revision=1'
 ).get(created.workflowId);
 const forged=JSON.parse(row.body);
 forged.items[0].acceptanceCriteria=['Unreviewed weaker criterion'];
 // The digest column and the graph's declared hash remain unchanged.
 // Only the persisted original DAG body has been rewritten.
 assert.equal(forged.workflowHash,row.digest);
 const rewrite=body=>f.store.db.prepare(
   'UPDATE graph_revisions SET body=? WHERE runId=? AND revision=1'
 ).run(body,created.workflowId);
 const forgedBody=JSON.stringify(forged);
 const argv=['run-codex-workflow',created.workflowId,'--hash',created.workflowHash];
 let operatorReviews=0,hostGrants=0;
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'offline-fixture',enableHostTurns:true,
   authorizeWorkflow:async()=>{hostGrants++;return false;}
 });
 const execution={codexAdmission:{
   facade,authorizeOperator:async()=>{
     operatorReviews++;
     rewrite(forgedBody);
     return true;
   }
 }};
 rewrite(forgedBody);
 const preReview=await productCli(['review-codex-workflow',created.workflowId],f.store.directory);
 assert.equal(preReview.exitCode,2);
 assert.equal(preReview.data.status,'BLOCKED');
 await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),
   /originating Planning\/Contract\/DAG provenance invalid/);
 assert.equal(operatorReviews,0);
 rewrite(row.body);
 const valid=await productCli(['review-codex-workflow',created.workflowId],f.store.directory);
 assert.equal(valid.exitCode,0);
 await assert.rejects(dispatchProduct(argv,{store:f.store,execution}),
   /originating Planning provenance changed during authenticated admission/);
 assert.equal(operatorReviews,1);
 assert.equal(hostGrants,0);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('reviewed Codex Workflow checkout freshness blocks dirty, cloned and changed-HEAD sources',async t=>{
  const f=await fixture(t);
  const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
    authorizeReview:async()=>true
  });
  const argv=['review-codex-workflow',created.workflowId,'--repository',f.repo];
  const eventCount=f.store.events(created.workflowId).length;
  const clean=await productCli(argv,f.store.directory);
  assert.equal(clean.exitCode,0);
  assert.equal(clean.data.status,'REVIEW_REQUIRED');
  assert.equal(clean.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
  assert.equal(clean.data.executionGranted,false);

  // A second clone may have identical HEAD and content but cannot reuse the
  // original Planning session's repository-bound review.
  const other=join(f.repo,'..','cloned-repository');
  const cloned=await git(f.repo,['clone',f.repo,other]);
  assert.equal(cloned.exitCode,0,cloned.stderr.toString());
  const cloneView=await productCli(['review-codex-workflow',created.workflowId,
    '--repository',other],f.store.directory);
  assert.equal(cloneView.exitCode,2);
  assert.equal(cloneView.data.sourceFreshness,'STALE_OR_MISMATCHED');
  assert.equal(cloneView.data.status,'BLOCKED');
  assert.equal(cloneView.data.workItems,undefined);

  await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
  const dirty=await productCli(argv,f.store.directory);
  assert.equal(dirty.exitCode,2);
  assert.equal(dirty.data.status,'BLOCKED');
  assert.equal(dirty.data.executionGranted,false);
  assert.equal(dirty.data.approvalState,undefined);

  for (const args of [['add','src/a.js'],
    ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
     'commit','-m','new baseline']]) {
    const result=await git(f.repo,args);
    assert.equal(result.exitCode,0,result.stderr.toString());
  }
  const changedHead=await productCli(argv,f.store.directory);
  assert.equal(changedHead.exitCode,2);
  assert.equal(changedHead.data.sourceFreshness,'STALE_OR_MISMATCHED');
  assert.equal(changedHead.data.status,'BLOCKED');
  assert.equal(f.store.events(created.workflowId).length,eventCount);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
});

test('reviewed Codex Workflow binds active revised DAG to its persisted revision record',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 const current=f.store.get(created.workflowId);
 const {workflowHash:ignored,...graphBody}=current.contract;
 const nextBody={...graphBody,workflowVersion:graphBody.workflowVersion+1};
 const nextGraph={...nextBody,workflowHash:hash(nextBody)};
 const revised=reviseWorkflow(f.store,created.workflowId,1,nextGraph);
 assert.equal(revised.revision,2);
 const reviewArgs=['review-codex-workflow',created.workflowId];
 const valid=await productCli(reviewArgs,f.store.directory);
 assert.equal(valid.exitCode,0);
 assert.equal(valid.data.status,'REVIEW_REQUIRED');
 assert.equal(valid.data.revision,2);
 assert.equal(valid.data.approvalState,'MISSING_OR_EXPIRED');
 approveWorkflow(f.store,created.workflowId,{
   actor:'local-fixture',workflowHash:revised.contractHash,expiresAt:Date.now()+60_000
 });
 const original=f.store.db.prepare(
   'SELECT digest,body FROM graph_revisions WHERE runId=? AND revision=2'
 ).get(created.workflowId);
 const deleteRevision=f.store.db.prepare(
   'DELETE FROM graph_revisions WHERE runId=? AND revision=2'
 );
 const putRevision=f.store.db.prepare(
   'INSERT OR REPLACE INTO graph_revisions (runId,revision,digest,body) VALUES (?,2,?,?)'
 );
 let operatorReviews=0,hostGrants=0;
 const facade=createCodexMvpFacade(f.store,{
   executable:process.execPath,model:'offline-fixture',enableHostTurns:true,
   authorizeWorkflow:async()=>{hostGrants++;return false;}
 });
 const executeArgs=['run-codex-workflow',created.workflowId,'--hash',revised.contractHash];
 const execution={codexAdmission:{facade,authorizeOperator:async()=>{
   operatorReviews++;return true;
 }}};
 const blocked=async()=>{
   const view=await productCli(reviewArgs,f.store.directory);
   assert.equal(view.exitCode,2);
   assert.equal(view.data.status,'BLOCKED');
   assert.equal(view.data.executionGranted,false);
   assert.equal(view.data.approvalState,undefined);
   await assert.rejects(dispatchProduct(executeArgs,{store:f.store,execution}),
     /originating Planning\/Contract\/DAG provenance invalid/);
   assert.equal(operatorReviews,0);
   assert.equal(hostGrants,0);
   assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n,0);
 };
 try {
   // An unrecorded current revision must never inherit the earlier approval.
   deleteRevision.run(created.workflowId);
   await blocked();
   // The new revision row must carry the exact recorded digest and graph body.
   putRevision.run(created.workflowId,'0'.repeat(64),original.body);
   await blocked();
   putRevision.run(created.workflowId,original.digest,JSON.stringify(current.contract));
   await blocked();
 }finally{
   putRevision.run(created.workflowId,original.digest,original.body);
 }
 const restored=await productCli(reviewArgs,f.store.directory);
 assert.equal(restored.exitCode,0);
 assert.equal(restored.data.status,'REVIEW_REQUIRED');
 assert.equal(restored.data.approvalState,'CURRENT_WORKFLOW_APPROVAL_VALID');
});

test('trusted CLI can route a natural-language Goal through reviewed Codex planning without source effects', async t => {
  const f=await fixture(t);
  const argv=['plan-codex-goal',goal,'--repository',f.repo];
  let factoryCalls=0, planningGrants=0, fakeTurns=0;
  const accepted=await productCli(argv,f.store.directory,{
    createCodexAdmission:store=>{
      factoryCalls++;
      return {facade:createCodexMvpFacade(store,{
        executable:process.execPath,model:'offline-fixture',enableHostTurns:true,
        authorizePlanning:async scope=>{
          planningGrants++;
          assert.equal(scope.objective,goal);
          assert.equal(scope.repositoryRoot,await realpath(f.repo));
          assert.equal(scope.requestedHostPolicy.writes,false);
          assert.equal(scope.executionGranted,false);
          return true;
        },
        transport:async call=>{
          fakeTurns++;
          const message=JSON.parse(call.prompt);
          assert.equal(message.originalObjective,goal);
          const draft={schemaVersion:2,objective:goal,
            base:message.context.discovery.base,files:['src/a.js'],tests:['test/a.test.js'],
            criteria:[{description:'Arithmetic regression passes',method:'protected-tests',
              tests:['test/a.test.js']}],risks:[],unknowns:[],effects:['local-edit']};
          return {terminalStatus:'completed',threadId:'offline-thread',turnId:'offline-turn',
            authority:'PROVIDER_REPORTED_ONLY',protectedVerified:false,
            text:JSON.stringify({sessionId:message.sessionId,requestHash:message.requestHash,
              proposal:{draft,references:[{path:'src/a.js',line:1,quote:'export function'},
                {path:'test/a.test.js',line:1,quote:'import test'}],inferences:[]}})};
        }
      })};
    }
  });
  assert.equal(accepted.exitCode,0,accepted.data?.error);
  assert.equal(accepted.data.status,'VALIDATED');
  assert.equal(accepted.data.hostReceipt.threadId,'offline-thread');
  assert.equal(accepted.data.authority,'PROVIDER_REPORTED_ONLY');
  assert.equal(accepted.data.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(factoryCalls,1);
  assert.equal(planningGrants,1);
  assert.equal(fakeTurns,1);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
  assert.equal(countWorkflowAttempts(f.store),0);
});

test('Codex Goal CLI fails closed before trusted planning factory or billable Turn on invalid/denied admission',async t=>{
  const f=await fixture(t);
  const argv=['plan-codex-goal',goal,'--repository',f.repo];
  let factories=0,grants=0,turns=0;
  const createCodexAdmission=store=>{
    factories++;
    return {facade:createCodexMvpFacade(store,{
      executable:process.execPath,model:'offline-fixture',enableHostTurns:true,
      authorizePlanning:async()=>{grants++;return false;},
      transport:async()=>{turns++;throw Error('denied Host Turn must not execute');}
    })};
  };
  for (const malformed of [
    ['plan-codex-goal',' ','--repository',f.repo],
    ['plan-codex-goal',goal,'--repository','relative/repo'],
    [...argv,'--allow-model']
  ]) {
    const result=await productCli(malformed,f.store.directory,{createCodexAdmission});
    assert.equal(result.exitCode,1);
    assert.match(result.data.error,/plan-codex-goal requires one nonempty Goal/);
  }
  assert.equal(factories,0);
  const plain=await productCli(argv,f.store.directory);
  assert.equal(plain.exitCode,1);
  assert.match(plain.data.error,/TRUSTED_CODEX_PLANNING_UNAVAILABLE/);
  const forged=await productCli(argv,f.store.directory,{
    createCodexAdmission:()=>({facade:{planExisting:async()=>{throw Error('forged');}}})
  });
  assert.equal(forged.exitCode,1);
  assert.match(forged.data.error,/TRUSTED_CODEX_PLANNING_UNAVAILABLE/);
  assert.equal(grants,0);
  const denied=await productCli(argv,f.store.directory,{createCodexAdmission});
  assert.equal(denied.exitCode,1);
  assert.match(denied.data.error,/independently trusted bounded approval/);
  assert.equal(factories,1);
  assert.equal(grants,1);
  assert.equal(turns,0);
  assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM host_planning WHERE status='CANCELLED'").get().n,1);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
  assert.equal(countWorkflowAttempts(f.store),0);
  assert.equal(denied.data.status,'BLOCKED_OR_UNSUPPORTED');
  assert.equal(denied.data.sessionId,undefined,
    'A denied pre-dispatch grant is not a possibly billable dispatched Turn');
});

test('authenticated Codex Host grant denial yields read-only persisted recovery handoff',async t=>{
 const f=await fixture(t);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
   authorizeReview:async()=>true
 });
 approveWorkflow(f.store,created.workflowId,{
   actor:'synthetic-local-owner',workflowHash:created.workflowHash,
   expiresAt:Date.now()+60_000
 });
 const initialEvents=f.store.events(created.workflowId).length;
 let operatorReviews=0,hostReviews=0,verifierCalls=0;
 const response=await productCli(
   ['run-codex-workflow',created.workflowId,'--hash',created.workflowHash],
   f.store.directory,{
     createCodexAdmission:store=>({
       facade:createCodexMvpFacade(store,{
         executable:process.execPath,model:'OFFLINE_NO_HOST',enableHostTurns:true,
         authorizeWorkflow:async()=>{hostReviews++;return false;},
         verificationBackend:{
           prepare:async()=>{verifierCalls++;throw Error('Unexpected verifier prepare');},
           verify:async()=>{verifierCalls++;throw Error('Unexpected verifier run');},
           cleanup:async()=>{verifierCalls++;throw Error('Unexpected verifier cleanup');}
         }
       }),
       authorizeOperator:async scope=>{
         operatorReviews++;
         assert.equal(scope.workflowId,created.workflowId);
         assert.equal(scope.workflowHash,created.workflowHash);
         return true;
       }
     })
   });
 assert.equal(response.exitCode,1);
 assert.equal(response.data.status,'CODEX_WORKFLOW_EXECUTION_BLOCKED');
 assert.match(response.data.error,/Exact managed Workflow execution grant denied/);
 assert.equal(response.data.workflowId,created.workflowId);
 assert.equal(response.data.executionGranted,false);
 assert.equal(response.data.executionSucceeded,false);
 assert.equal(response.data.objectiveComplete,false);
 assert.equal(response.data.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(response.data.progress.kind,'CODEFLEET_WORKFLOW_PROGRESS_V1');
 assert.deepEqual(response.data.progress.dependencyReadyIds,['change']);
 assert.equal(response.data.continuation.status,'AUTHENTICATED_HOST_ADMISSION_REQUIRED');
 assert.equal(response.data.continuation.automaticReplay,false);
 assert.equal(response.data.continuation.executionGranted,false);
 assert.equal(operatorReviews,1);
 assert.equal(hostReviews,1);
 assert.equal(verifierCalls,0);
 assert.equal(countWorkflowAttempts(f.store),0);
 assert.equal(f.store.events(created.workflowId).length,initialEvents);
 const status=await productCli(['workflow-progress',created.workflowId],f.store.directory);
 assert.equal(status.exitCode,2);
 assert.deepEqual(response.data.progress.continuation,status.data.continuation);
});

test('public Codex Planning lifecycle status is read-only and never treats validation as execution',async t=>{
 const f=await fixture(t);
 const sessionId=f.request.sessionId;
 const events=f.store.db.prepare('SELECT count(*) AS n FROM events').get().n;
 const runs=f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n;
 const result=await productCli(['codex-planning-status',sessionId],f.store.directory);
 assert.equal(result.exitCode,0,result.data?.error);
 assert.equal(result.data.kind,'CODEFLEET_CODEX_PLANNING_STATUS_V1');
 assert.equal(result.data.status,'SUBMITTED');
 assert.equal(result.data.validationStatus,'VALIDATED');
 assert.equal(result.data.requestHash,f.request.requestHash);
 assert.equal(result.data.sourceBaseline,f.request.context.discovery.base);
 assert.equal(result.data.continuation.kind,'REVIEW_CONTRACT_AT_CURRENT_SOURCE');
 assert.equal(result.data.continuation.automaticReplay,false);
 assert.equal(result.data.continuation.executionGranted,false);
 assert.equal(result.data.sourceFreshness,'NOT_RECHECKED');
 assert.equal(result.data.approved,false);
 assert.equal(result.data.executionGranted,false);
 assert.equal(result.data.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(result.data.protectedVerified,false);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM events').get().n,events);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,runs);
});

test('read-only Codex Planning status verifies current repository and directs stale-source recovery',async t=>{
 const f=await fixture(t),sessionId=f.request.sessionId;
 const events=f.store.db.prepare('SELECT count(*) AS n FROM events').get().n;
 const runs=f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n;
 const cmd=['codex-planning-status',sessionId,'--repository',f.repo];
 const clean=await productCli(cmd,f.store.directory);
 assert.equal(clean.exitCode,0,clean.data?.error);
 assert.equal(clean.data.status,'SUBMITTED');
 assert.equal(clean.data.sourceReview,'REVIEW_REQUIRED');
 assert.equal(clean.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
 assert.equal(clean.data.continuation.kind,'REVIEW_CONTRACT_AT_CURRENT_SOURCE');
 assert.equal(clean.data.executionGranted,false);
 const invalid=await productCli(
   ['codex-planning-status',sessionId,'--repository','relative/repo'],f.store.directory);
 assert.equal(invalid.exitCode,1);
 assert.match(invalid.data.error,/optional absolute --repository only/);
 await writeFile(join(f.repo,'src/a.js'),'// source changed after the saved plan\n');
 const stale=await productCli(cmd,f.store.directory);
 assert.equal(stale.exitCode,2,stale.data?.error);
 assert.equal(stale.data.status,'SUBMITTED');
 assert.equal(stale.data.validationStatus,'VALIDATED');
 assert.equal(stale.data.sourceReview,'BLOCKED');
 assert.equal(stale.data.sourceFreshness,'STALE_OR_MISMATCHED');
 assert.equal(stale.data.continuation.kind,'REVIEW_SOURCE_OR_REPLAN');
 assert.equal(stale.data.continuation.automaticReplay,false);
 assert.equal(stale.data.continuation.executionGranted,false);
 assert.equal(stale.data.executionGranted,false);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM events').get().n,events);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,runs);
});

test('Codex Planning uncertainty is never a fresh Host Turn grant or automatic replay',async t=>{
 const f=await fixture(t),sessionId=f.request.sessionId;
 const start=f.store.db.prepare('SELECT count(*) AS n FROM events').get().n;
 for(const [status,kind] of [
  ['DISPATCHED','RECONCILE_HOST_TURN'],
  ['RECONCILING','RECONCILE_HOST_TURN'],
  ['CANCELLED','NEW_PLANNING_REVIEW_REQUIRED']
 ]) {
  f.store.db.prepare(
   'UPDATE host_planning SET status=?,response=NULL,result=NULL,resultHash=NULL WHERE id=?'
  ).run(status,sessionId);
  const read=await productCli(['codex-planning-status',sessionId],f.store.directory);
  assert.equal(read.exitCode,0,read.data?.error);
  assert.equal(read.data.status,status);
  assert.equal(read.data.continuation.kind,kind);
  assert.equal(read.data.continuation.automaticReplay,false);
  assert.equal(read.data.continuation.executionGranted,false);
  assert.equal(read.data.executionGranted,false);
  assert.equal(read.data.validationStatus,undefined);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM events').get().n,start);
 }
});

test('Codex Planning status blocks tampered outcomes and rejects execution flags',async t=>{
 const f=await fixture(t),sessionId=f.request.sessionId;
 const invalid=await productCli(['codex-planning-status',sessionId,'--allow-model'],f.store.directory);
 assert.equal(invalid.exitCode,1);
 assert.match(invalid.data.error,/no execution\/approval options/);
 const missing=await productCli(
  ['codex-planning-status','00000000-0000-4000-8000-000000000000'],f.store.directory);
 assert.equal(missing.exitCode,2);
 assert.equal(missing.data.status,'NOT_FOUND');
 assert.equal(missing.data.automaticReplay,false);
 f.store.db.prepare('UPDATE host_planning SET resultHash=? WHERE id=?')
  .run('f'.repeat(64),sessionId);
 const corrupted=await productCli(['codex-planning-status',sessionId],f.store.directory);
 assert.equal(corrupted.exitCode,2);
 assert.equal(corrupted.data.status,'BLOCKED');
 assert.equal(corrupted.data.approved,false);
 assert.equal(corrupted.data.executionGranted,false);
 assert.equal(corrupted.data.continuation.automaticReplay,false);
 assert.equal(corrupted.data.validationStatus,undefined);
 assert.equal(corrupted.data.objectiveHash,undefined);
});

test('Codex Planning status on a legacy Store does not initialize a planning table',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'codefleet-planning-status-'));
 const store=new Store(directory);
 store.close();
 t.after(async()=>rm(directory,{recursive:true,force:true}));
 const result=await productCli(
  ['codex-planning-status','00000000-0000-4000-8000-000000000000'],directory);
 assert.equal(result.exitCode,2);
 assert.equal(result.data.status,'UNAVAILABLE');
 assert.equal(result.data.executionGranted,false);
 const read=new Store(directory,{readOnly:true});
 try {
  assert.equal(read.db.prepare(
   "SELECT 1 FROM sqlite_master WHERE type='table' AND name='host_planning'"
  ).get(),undefined);
  assert.equal(read.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
 }finally{read.close();}
});

test('Codex Goal CLI returns the persisted RECONCILING handoff after a reserved Host transport failure',async t=>{
 const f=await fixture(t);
 const argv=['plan-codex-goal',goal,'--repository',f.repo];
 const runs=f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n;
 const attempts=countWorkflowAttempts(f.store);
 let grants=0,turns=0;
 const failed=await productCli(argv,f.store.directory,{
  createCodexAdmission:store=>({facade:createCodexMvpFacade(store,{
    executable:process.execPath,model:'OFFLINE_FAKE_ONLY',enableHostTurns:true,
    authorizePlanning:async()=>{grants++;return true;},
    transport:async()=>{turns++;throw Error('offline Host transport disconnected');}
  })})
 });
 assert.equal(failed.exitCode,1);
 assert.equal(failed.data.status,'CODEX_PLANNING_TURN_BLOCKED');
 assert.match(failed.data.error,/offline Host transport disconnected/);
 assert.match(failed.data.sessionId,/^[a-f0-9-]{36}$/i);
 assert.deepEqual([grants,turns],[1,1]);
 assert.equal(failed.data.progress.kind,'CODEFLEET_CODEX_PLANNING_STATUS_V1');
 assert.equal(failed.data.progress.sessionId,failed.data.sessionId);
 assert.equal(failed.data.progress.status,'RECONCILING');
 assert.equal(failed.data.progress.approved,false);
 assert.equal(failed.data.progress.executionGranted,false);
 assert.equal(failed.data.progress.validationStatus,undefined);
 assert.equal(failed.data.continuation.kind,'RECONCILE_HOST_TURN');
 assert.equal(failed.data.continuation.automaticReplay,false);
 assert.equal(failed.data.automaticReplay,false);
 assert.equal(failed.data.executionGranted,false);
 assert.equal(failed.data.executionSucceeded,false);
 assert.equal(failed.data.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(failed.data.protectedVerified,false);
 assert.equal(failed.data.costStatus,'UNKNOWN');
 const record=f.store.db.prepare('SELECT status FROM host_planning WHERE id=?')
  .get(failed.data.sessionId);
 assert.equal(record.status,'RECONCILING');
 assert.ok(f.store.db.prepare(
  "SELECT 1 FROM events WHERE runId=? AND type='HOST_PLANNING_TURN_RESERVED'"
 ).get(failed.data.sessionId));
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,runs);
 assert.equal(countWorkflowAttempts(f.store),attempts);
 const observed=await productCli(
  ['codex-planning-status',failed.data.sessionId],f.store.directory);
 assert.equal(observed.exitCode,0,observed.data?.error);
 assert.deepEqual(observed.data,failed.data.progress,
  'The handoff must be the same durable read-only state later queried by the user');
});

test('a rejected completed-Host receipt returns a no-replay Planning handoff',async t=>{
 const f=await fixture(t);
 let turns=0;
 const result=await productCli(
  ['plan-codex-goal',goal,'--repository',f.repo],f.store.directory,{
   createCodexAdmission:store=>({facade:createCodexMvpFacade(store,{
     executable:process.execPath,model:'OFFLINE_FAKE_ONLY',enableHostTurns:true,
     authorizePlanning:async()=>true,
     transport:async()=>{turns++;return {
       terminalStatus:'completed',text:'{}',
       threadId:null,turnId:null,authority:'PROVIDER_REPORTED_ONLY',
       protectedVerified:false
     };}
   })})
  });
 assert.equal(result.exitCode,1);
 assert.equal(result.data.status,'CODEX_PLANNING_TURN_BLOCKED');
 assert.match(result.data.error,/no acceptable receipt/);
 assert.equal(result.data.progress.status,'RECONCILING');
 assert.equal(result.data.continuation.kind,'RECONCILE_HOST_TURN');
 assert.equal(result.data.continuation.automaticReplay,false);
 assert.equal(result.data.executionSucceeded,false);
 assert.equal(result.data.costStatus,'UNKNOWN');
 assert.equal(turns,1);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
 assert.equal(countWorkflowAttempts(f.store),0);
});

test('Codex Goal progress starts from validated Planning and preserves existing Workflow admission',async t=>{
 const f=await fixture(t);
 const events=f.store.db.prepare('SELECT count(*) AS n FROM events').get().n;
 const start=await productCli(['codex-goal-progress',f.request.sessionId],f.store.directory);
 assert.equal(start.exitCode,2);
 assert.equal(start.data.kind,'CODEFLEET_CODEX_GOAL_PROGRESS_V1');
 assert.equal(start.data.status,'AWAIT_WORKFLOW_REVIEW');
 assert.equal(start.data.planning.status,'SUBMITTED');
 assert.equal(start.data.planning.validationStatus,'VALIDATED');
 assert.equal(start.data.continuation.kind,'REVIEW_AND_PREPARE_WORKFLOW');
 assert.equal(start.data.continuation.automaticReplay,false);
 assert.equal(start.data.workflowId,null);
 assert.equal(start.data.objectiveComplete,false);
 assert.equal(start.data.executionGranted,false);
 assert.equal(start.data.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM events').get().n,events);

 const prepared=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
  authorizeReview:async()=>true
 });
 const before=f.store.events(prepared.workflowId).length;
 const observed=await productCli(['codex-goal-progress',f.request.sessionId],f.store.directory);
 assert.equal(observed.exitCode,2,observed.data?.error);
 assert.equal(observed.data.status,'WORKFLOW_IN_PROGRESS');
 assert.equal(observed.data.workflowId,prepared.workflowId);
 assert.equal(observed.data.workflow.kind,'CODEFLEET_WORKFLOW_PROGRESS_V1');
 assert.deepEqual(observed.data.workflow.dependencyReadyIds,['change']);
 assert.equal(observed.data.continuation.status,'AWAIT_WORKFLOW_APPROVAL');
 assert.equal(observed.data.continuation.automaticReplay,false);
 assert.equal(observed.data.executionGranted,false);
 assert.equal(observed.data.objectiveComplete,false);
 assert.equal(f.store.events(prepared.workflowId).length,before);
 assert.equal(countWorkflowAttempts(f.store),0);
});

test('Codex Goal progress blocks forged Workflow provenance and execution options without new effects',async t=>{
 const f=await fixture(t);
 const missing=await productCli(
  ['codex-goal-progress','00000000-0000-4000-8000-000000000000'],f.store.directory);
 assert.equal(missing.exitCode,2);
 assert.equal(missing.data.status,'PLANNING_NOT_READY');
 assert.equal(missing.data.objectiveComplete,false);
 assert.equal(missing.data.continuation.automaticReplay,false);
 for(const invalid of [
  ['codex-goal-progress',f.request.sessionId,'--allow-model'],
  ['codex-goal-progress',f.request.sessionId,'--hash','a'.repeat(64)],
  ['codex-goal-progress',f.request.sessionId,'extra']
 ]) {
  const blocked=await productCli(invalid,f.store.directory);
  assert.equal(blocked.exitCode,1);
  assert.match(blocked.data.error,/no execution\/approval options/);
 }
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,f.request.sessionId,{
  authorizeReview:async()=>true
 });
 const events=f.store.events(created.workflowId).length;
 const tampered=f.store.get(created.workflowId);
 tampered.sourceRef='e'.repeat(64);
 f.store.db.prepare('UPDATE runs SET body=? WHERE id=?')
  .run(JSON.stringify(tampered),created.workflowId);
 const rejected=await productCli(['codex-goal-progress',f.request.sessionId],f.store.directory);
 assert.equal(rejected.exitCode,2);
 assert.equal(rejected.data.status,'BLOCKED');
 assert.equal(rejected.data.workflowId,null);
 assert.equal(rejected.data.objectiveComplete,false);
 assert.equal(rejected.data.continuation.kind,'INSPECT_WORKFLOW_PROVENANCE');
 assert.equal(rejected.data.continuation.automaticReplay,false);
 assert.equal(rejected.data.executionGranted,false);
 assert.equal(f.store.events(created.workflowId).length,events);
 assert.equal(countWorkflowAttempts(f.store),0);
});


test('Goal execution alias preserves reviewed DAG, exact hash and independent Host/Operator grants',async t=>{
 const f=await fixture(t);
 const sessionId=f.request.sessionId;
 const validHash=f.result.workflowPreview.workflow.workflowHash;
 const entry=['run-codex-goal',sessionId,'--hash',validHash];
 let factories=0,operatorReviews=0,hostGrants=0,hostTurns=0,verifications=0;
 const createCodexAdmission=store=>{
  factories++;
  return {facade:createCodexMvpFacade(store,{
   executable:process.execPath,model:'OFFLINE_DENIED_HOST',enableHostTurns:true,
   authorizeWorkflow:async()=>{hostGrants++;return false;},
   verificationBackend:{
    prepare:async()=>{verifications++;throw Error('Unexpected verifier prepare');},
    verify:async()=>{verifications++;throw Error('Unexpected verifier run');},
    cleanup:async()=>{verifications++;throw Error('Unexpected verifier cleanup');}
   },
   transport:async()=>{hostTurns++;throw Error('Unexpected Codex Turn');}
  }),authorizeOperator:async scope=>{
   operatorReviews++;
   assert.equal(scope.workflowId,'planning-'+sessionId);
   assert.equal(scope.workflowHash,validHash);
   assert.equal(scope.planningSessionId,sessionId);
   assert.equal(scope.protectedVerified,false);
   return true;
  }};
 };
 for(const invalid of [
  [...entry,'--actor','untrusted'],
  [...entry,'--allow-model'],
  ['run-codex-goal','not-a-planning-id','--hash',validHash],
  ['resume-codex-goal',sessionId,'--hash','invalid']
 ]) {
  const r=await productCli(invalid,f.store.directory,{createCodexAdmission});
  assert.equal(r.exitCode,1);
  assert.match(r.data.error,/Codex Goal execution requires/);
 }
 assert.equal(factories,0,'Invalid Goal execution requests cannot create a trusted Host binding');
 const plain=await productCli(entry,f.store.directory);
 assert.equal(plain.exitCode,1);
 assert.match(plain.data.error,/AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE/);
 const notPrepared=await productCli(entry,f.store.directory,{createCodexAdmission});
 assert.equal(notPrepared.exitCode,1);
 assert.match(notPrepared.data.error,/current reviewed Workflow and exact hash/);
 assert.equal(operatorReviews,0);
 assert.equal(hostGrants,0);
 const created=await prepareReviewedCodexWorkflow(f.store,f.repo,sessionId,{
  authorizeReview:async()=>true
 });
 assert.equal(created.workflowHash,validHash);
 const beforeApproval=await productCli(entry,f.store.directory,{createCodexAdmission});
 assert.equal(beforeApproval.exitCode,1);
 assert.equal(beforeApproval.data.status,'CODEX_GOAL_EXECUTION_BLOCKED');
 assert.equal(beforeApproval.data.planningSessionId,sessionId);
 assert.equal(beforeApproval.data.workflowId,created.workflowId);
 assert.match(beforeApproval.data.error,/Workflow approval absent/);
 assert.equal(beforeApproval.data.continuation.status,'AWAIT_WORKFLOW_APPROVAL');
 assert.equal(beforeApproval.data.continuation.automaticReplay,false);
 assert.equal(beforeApproval.data.automaticReplay,false);
 assert.deepEqual(beforeApproval.data.goalProgress,
  (await productCli(['codex-goal-progress',sessionId],f.store.directory)).data);
 assert.equal(operatorReviews,0);
 approveWorkflow(f.store,created.workflowId,{
  actor:'offline-fixture-reviewer',workflowHash:validHash,
  expiresAt:Date.now()+60_000
 });
 const eventCount=f.store.events(created.workflowId).length;
 // Reject the independent Operator grant before a Host Turn or Attempt.
 const denied=await productCli(entry,f.store.directory,{createCodexAdmission:store=>({
  facade:createCodexMvpFacade(store,{
   executable:process.execPath,model:'OFFLINE_DENIED_OPERATOR',enableHostTurns:true,
   authorizeWorkflow:async()=>{hostGrants++;return false;}
  }),
  authorizeOperator:async()=>false
 })});
 assert.equal(denied.exitCode,1);
 assert.equal(denied.data.status,'CODEX_GOAL_EXECUTION_BLOCKED');
 assert.match(denied.data.error,/Authenticated Codex Operator admission denied/);
 assert.equal(denied.data.planningSessionId,sessionId);
 assert.equal(denied.data.workflowId,created.workflowId);
 assert.equal(denied.data.continuation.status,'AUTHENTICATED_HOST_ADMISSION_REQUIRED');
 assert.equal(denied.data.continuation.automaticReplay,false);
 assert.equal(denied.data.executionGranted,false);
 assert.equal(denied.data.executionSucceeded,false);
 assert.equal(denied.data.objectiveComplete,false);
 assert.equal(hostGrants,0);
 assert.equal(countWorkflowAttempts(f.store),0);
 assert.equal(f.store.events(created.workflowId).length,eventCount);
 for(const action of ['run-codex-goal','resume-codex-goal']) {
  const blocked=await productCli([
   action,sessionId,'--hash',validHash
  ],f.store.directory,{createCodexAdmission});
  assert.equal(blocked.exitCode,1,blocked.data?.error);
  assert.equal(blocked.data.status,'CODEX_WORKFLOW_EXECUTION_BLOCKED');
  assert.equal(blocked.data.workflowId,created.workflowId);
  assert.equal(blocked.data.planningSessionId,sessionId);
  assert.match(blocked.data.error,/Exact managed Workflow execution grant denied/);
  assert.equal(blocked.data.progress.kind,'CODEFLEET_WORKFLOW_PROGRESS_V1');
  assert.equal(blocked.data.continuation.status,'AUTHENTICATED_HOST_ADMISSION_REQUIRED');
  assert.equal(blocked.data.continuation.automaticReplay,false);
  assert.equal(blocked.data.executionGranted,false);
  assert.equal(blocked.data.executionSucceeded,false);
  assert.equal(blocked.data.hostLiveAcceptance,'UNVERIFIED');
 }
 const mismatched=await productCli([
  'run-codex-goal',sessionId,'--hash','f'.repeat(64)
 ],f.store.directory,{createCodexAdmission});
 assert.equal(mismatched.exitCode,1);
 assert.match(mismatched.data.error,/current reviewed Workflow and exact hash/);
 assert.equal(operatorReviews,2);
 assert.equal(hostGrants,2);
 assert.equal(hostTurns,0);
 assert.equal(verifications,0);
 assert.equal(countWorkflowAttempts(f.store),0);
 assert.equal(f.store.events(created.workflowId).length,eventCount);
});


test('reviewed Codex multi-WorkItem Goal executes ordered A then B through authenticated CLI and delivered Objective',async t=>{
 const f=await fixture(t,{multi:true});
 const originalGoal=f.originalGoal,sessionId=f.request.sessionId;
 assert.equal(originalGoal,multiGoal);
 assert.equal(f.result.workflowPreview.source.maxAttempts,2,
   'Two scoped WorkItems consume only two explicitly reviewed attempt slots');
 assert.deepEqual(f.result.workflowPreview.workflow.items.map(item=>item.id),['a','b']);
 assert.deepEqual(f.result.workflowPreview.workflow.items[1].dependencies,['a']);

 const view=await productCli(['review-codex-plan',sessionId,'--repository',f.repo],f.store.directory);
 assert.equal(view.exitCode,0,view.data?.error);
 assert.equal(view.data.sourceFreshness,'PINNED_CLEAN_AT_REVIEW');
 assert.deepEqual(view.data.workItems.map(item=>item.id),['a','b']);
 assert.deepEqual(view.data.workItems[1].dependencies,['a']);
 assert.equal(view.data.executionLimits.maxAttempts,2);
 assert.equal(view.data.executionLimits.attemptBudgetUsd,1);
 const prepared=await productCli([
  'prepare-codex-workflow',sessionId,'--repository',f.repo,
  '--hash',view.data.workflowHash,'--source-hash',view.data.sourceContractHash
 ],f.store.directory);
 assert.equal(prepared.exitCode,0,prepared.data?.error);
 assert.equal(prepared.data.executionGranted,false);
 assert.equal(prepared.data.state,'WAITING_APPROVAL');
 assert.equal(countWorkflowAttempts(f.store),0);
 const waiting=await productCli(['codex-goal-progress',sessionId],f.store.directory);
 assert.equal(waiting.exitCode,2);
 assert.deepEqual(waiting.data.workflow.workItems.map(item=>item.id),['a','b']);
 assert.deepEqual(waiting.data.workflow.dependencyReadyIds,['a']);
 assert.equal(waiting.data.continuation.status,'AWAIT_WORKFLOW_APPROVAL');
 approveWorkflow(f.store,prepared.data.workflowId,{
  actor:'offline-exact-reviewer',workflowHash:prepared.data.workflowHash,
  expiresAt:Date.now()+60_000
 });

 const hostTurns=[],verified=[],operatorGrants=[],managedGrants=[],costGrants=[];
 const criteria=[{id:'C1',requiredAuthority:'LOCAL_EXECUTED'}];
 const executed=await productCli([
  'run-codex-goal',sessionId,'--hash',prepared.data.workflowHash
 ],f.store.directory,{
  createCodexAdmission:store=>({
   facade:createCodexMvpFacade(store,{
    executable:process.execPath,model:'OFFLINE_FAKE_ONLY',enableHostTurns:true,
    authorizeWorkflow:async scope=>{
     managedGrants.push(scope);
     assert.equal(scope.workflowHash,prepared.data.workflowHash);
     assert.deepEqual(scope.workItems.map(item=>item.id),['a','b']);
     assert.deepEqual(scope.workItems[1].dependencies,['a']);
     assert.equal(scope.executionMode,'HOST_READ_ONLY_PROPOSAL');
     assert.equal(scope.protectedVerified,false);
     return true;
    },
    transport:async request=>{
     const prompt=JSON.parse(request.prompt),id=prompt.workItemId;
     assert.ok(['a','b'].includes(id));
     if(id==='b') {
      assert.match(prompt.files['src/a.js'],/return x-y;/,
       'B must receive accepted A rather than the stale baseline');
      // A second read-only CLI opens a fresh Store while B is dispatched.
      // On an interruption it must observe A as durable, B as uncertain,
      // and never imply permission to replay the in-flight Host Turn.
      const boundary=await productCli(['codex-goal-progress',sessionId],f.store.directory);
      assert.equal(boundary.exitCode,2);
      assert.deepEqual(boundary.data.workflow.workItems.map(item=>[
       item.id,item.attempt?.status
      ]),[['a','SUCCEEDED'],['b','STARTED']]);
      assert.equal(boundary.data.workflow.continuation.status,'RECONCILE_REQUIRED');
      assert.equal(boundary.data.workflow.continuation.automaticReplay,false);
      assert.equal(boundary.data.objectiveComplete,false);
     }
     hostTurns.push(id);
     return {threadId:'fake-thread-'+id,turnId:'fake-turn-'+id,
      terminalStatus:'completed',authority:'PROVIDER_REPORTED_ONLY',
      protectedVerified:false,executionMode:'HOST_READ_ONLY_PROPOSAL',
      text:JSON.stringify({summary:'Synthetic scoped source edit',
       edits:[{path:'src/'+id+'.js',
         oldText:'return x+y;',newText:'return x-y;'}]})};
    },
    verificationBackend:{
     prepare:async()=>{},
     verify:async ({directory,tests})=>{
      verified.push([...tests]);
      const checks=await Promise.all(tests.map(async testPath=>{
       const srcPath=testPath.replace(/^test\//,'src/').replace(/\.test\.js$/,'.js');
       return (await readFile(join(directory,srcPath),'utf8')).includes('return x-y;');
      }));
      const passed=checks.filter(Boolean).length,failed=checks.length-passed;
      return {authority:'HARNESS_EXECUTED',tests:checks.length,
       passed,failed,skipped:0,todo:0,exitCode:failed?1:0,
       interrupted:false,truncated:false,testNames:tests};
     },
     cleanup:async()=>{}
    },
    unknownCostBudget:{authorize:async scope=>{
     costGrants.push(scope.unknownCostTurns);
     return scope.unknownCostTurns<=2;
    }},
    destinationDelivery:{
     approvedCriteria:criteria,
     authorize:async scope=>{
      assert.equal(scope.runId,prepared.data.workflowId);
      assert.equal((await realpath(scope.destination)).toLowerCase(),
        (await realpath(f.repo)).toLowerCase());
      return true;
     },
     verify:async ({run,delivery,candidate})=>{
      assert.equal(delivery.targetTreeHash,candidate.candidateHash);
      for(const id of ['a','b'])
       assert.match(await readFile(join(f.repo,'src',id+'.js'),'utf8'),/return x-y;/);
      const observation={
       kind:'OBJECTIVE_CRITERION_OBSERVATION_V1',
       objectiveId:run.id,revision:run.revision,criterionId:'C1',
       targetTreeHash:delivery.targetTreeHash,authority:'LOCAL_EXECUTED',
       independentObserver:true,commandHash:'a'.repeat(64),
       observationHash:'b'.repeat(64),complete:true,tests:2,passed:2,
       failed:0,skipped:0,todo:0,exitCode:0,interrupted:false,
       truncated:false,integrity:'MATCHED',
       verificationBackend:'SYNTHETIC_TEST_ONLY',protection:'UNPROTECTED'
      };
      const evidence=f.store.artifact(observation);
      return {criteria,evidenceRefs:{C1:evidence},
       readVerifiedEvidence:ref=>f.store.readArtifact(ref)};
     }
    }
   }),
   authorizeOperator:async scope=>{
    operatorGrants.push(scope);
    assert.equal(scope.kind,'CODEFLEET_AUTHENTICATED_CODEX_ENTRY_V1');
    assert.equal(scope.planningSessionId,sessionId);
    assert.equal(scope.workflowHash,prepared.data.workflowHash);
    assert.deepEqual(scope.workflowContract.items.map(item=>item.id),['a','b']);
    assert.equal(scope.protectedVerified,false);
    return true;
   }
  })
 });
 assert.equal(executed.exitCode,0,executed.data?.error);
 assert.equal(executed.data.workflowState,'COMPLETED');
 assert.equal(executed.data.objective.status,'COMPLETE',executed.data.objective?.reason);
 assert.equal(executed.data.objective.protection,'UNPROTECTED');
 assert.equal(executed.data.hostLiveAcceptance,'UNVERIFIED');
 assert.equal(executed.data.protectedVerified,false);
 assert.deepEqual(hostTurns,['a','b']);
 assert.equal(operatorGrants.length,1);
 assert.equal(managedGrants.length,1);
 assert.ok(costGrants.length>=1,'Explicit UNKNOWN-cost approval must cover continued WorkItems');
 assert.ok(verified.some(x=>x.includes('test/a.test.js')));
 assert.ok(verified.some(x=>x.includes('test/b.test.js')));
 assert.ok(verified.some(x=>x.length===2),'Final regression must cover both protected tests');
 assert.equal(executed.data.progress.objectiveComplete,true);
 assert.deepEqual(executed.data.progress.workItems.map(item=>[item.id,item.state]),
  [['a','SUCCEEDED'],['b','SUCCEEDED']]);
 assert.equal(executed.data.progress.continuation.status,'OBJECTIVE_COMPLETE');
 assert.equal(executed.data.progress.continuation.automaticReplay,false);
 const attempts=f.store.db.prepare(
  'SELECT itemId,status FROM workflow_attempts WHERE runId=? ORDER BY rowid'
 ).all(prepared.data.workflowId);
 assert.deepEqual(attempts.map(r=>[r.itemId,r.status]),[
  ['a','SUCCEEDED'],['b','SUCCEEDED'],['final','SUCCEEDED']
 ]);
 const events=f.store.events(prepared.data.workflowId);
 const settledA=events.find(e=>e.type==='ATTEMPT_RECONCILED'&&e.body.itemId==='a');
 const startedB=events.find(e=>e.type==='ATTEMPT_RESERVED'&&e.body.itemId==='b');
 assert.ok(settledA && startedB && settledA.seq<startedB.seq);
 const progress=await productCli(['codex-goal-progress',sessionId],f.store.directory);
 assert.equal(progress.exitCode,0);
 assert.equal(progress.data.objectiveComplete,true);
});

test('Codex multi-WorkItem draft rejects cyclic, overlapping or broadened scope before a Workflow',async t=>{
 const f=await fixture(t,{multi:true});
 const clean=f.result.plan.draft,discovery=f.result.plan.discovery;
 assert.equal(validateDraft(clean,discovery,multiGoal).status,'VALIDATED');
 const invalid=[
  draft=>{draft.workItems[0].dependencies=['b'];},
  draft=>{draft.workItems[1].dependencies=['not-planned'];},
  draft=>{draft.workItems[1].files=['src/a.js'];},
  draft=>{draft.workItems[1].files=['src/exfiltrate.js'];},
  draft=>{draft.workItems[1].tests=['test/not-protected.test.js'];},
  draft=>{draft.workItems[1].acceptanceCriteria=['No independent test'];},
  draft=>{draft.workItems[1].acceptanceCriteria=[];},
  draft=>{draft.workItems[1].id='a';},
  draft=>{draft.workItems.push(...Array.from({length:4},(_,i)=>({
   id:'extra'+i,dependencies:[],priority:0,files:['src/b.js'],
   tests:['test/b.test.js'],acceptanceCriteria:['B subtract regression passes']
  })));},
  draft=>{draft.executionGranted=true;}
 ];
 for(const mutate of invalid){
  const draft=structuredClone(clean);
  mutate(draft);
  assert.throws(()=>validateDraft(draft,discovery,multiGoal));
 }
 assert.equal(countWorkflowAttempts(f.store),0);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,0);
});
