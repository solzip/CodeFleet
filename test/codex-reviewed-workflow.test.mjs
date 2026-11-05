import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../src/alpha/contract.mjs';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { beginPlanning,submitPlanning } from '../src/hosts/planning.mjs';
import { prepareReviewedCodexWorkflow, inspectReviewedCodexPlan } from '../src/product/codex-reviewed-workflow.mjs';
import { dispatchProduct, productCli } from '../src/product/cli.mjs';

const goal='Repair arithmetic behavior in src/a.js with test/a.test.js and independently verify results.';
async function fixture(t) {
 const root=await mkdtemp(join(tmpdir(),'cf-plan-workflow-'));
 let store;
 t.after(async()=>{store?.close();await rm(root,{recursive:true,force:true});});
 const repo=join(root,'repo');
 await mkdir(join(repo,'src'),{recursive:true});await mkdir(join(repo,'test'));
 await writeFile(join(repo,'src/a.js'),'export function add(x,y){ return x+y; }\n');
 await writeFile(join(repo,'test/a.test.js'),'import test from "node:test";\n');
 for(const args of [['init'],['add','.'],
  ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]){
   const result=await git(repo,args);
   assert.equal(result.exitCode,0,result.stderr.toString());
 }
 store=new Store(join(root,'state'));
 const request=await beginPlanning(store,repo,goal,{host:'codex',version:'0.166.0'});
 const draft={schemaVersion:2,objective:goal,base:request.context.discovery.base,
   files:['src/a.js'],tests:['test/a.test.js'],
   criteria:[{description:'Arithmetic regression passes',method:'protected-tests',tests:['test/a.test.js']}],
   risks:[],unknowns:[],effects:['local-edit']};
 const result=submitPlanning(store,JSON.stringify({sessionId:request.sessionId,
   requestHash:request.requestHash,proposal:{
     draft,references:[{path:'src/a.js',line:1,quote:'export function'},
       {path:'test/a.test.js',line:1,quote:'import test'}],inferences:[]
   }}),{contextHash:request.contextHash,profileHash:request.profileHash,
     skillHash:request.skillHash});
 assert.equal(result.status,'VALIDATED');
 return {store,repo,request,result};
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
  await assert.rejects(dispatchProduct(args,{store:f.store}),/requires exactly one/);
 }
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM runs').get().n,before);
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
