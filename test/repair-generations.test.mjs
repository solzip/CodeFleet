import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { definition } from '../src/workflow/definition.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { createWorkflow, approveWorkflow, reserve, finish, attempts } from '../src/workflow/persistence.mjs';
import { enableRepairStorage, reserveRepairGeneration, repairRows } from '../src/workflow/repair-generations.mjs';

const source=()=>({schemaVersion:1,goal:'Repair an arithmetic regression using approved source and tests.',
 files:['src/a.js'],context:['src/a.js'],tests:['test/a.test.js'],maxAttempts:3,
 timeoutSeconds:120,attemptBudgetUsd:1,delivery:{mode:'local'}});
async function setup(t){
 const root=await mkdtemp(join(tmpdir(),'cf-repair-gen-'));let activeStore;
 t.after(async()=>{ activeStore?.close(); await rm(root,{recursive:true,force:true}); });
 const repo=join(root,'repo');await mkdir(join(repo,'src'),{recursive:true});await mkdir(join(repo,'test'));
 await writeFile(join(repo,'src/a.js'),'module.exports = (x,y)=>x+y;');
 await writeFile(join(repo,'test/a.test.js'),'// regression fixture');
 for(const args of [['init'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]){
   const r=await git(repo,args);assert.equal(r.exitCode,0,r.stderr.toString());
 }
 const gitHead=await git(repo,['rev-parse','HEAD']);const base=gitHead.stdout.toString().trim();
 const store=new Store(join(root,'state'));activeStore=store;
 const contract=source(),graph=definition(contract,{workflowId:'repair',base,items:[{
  id:'a',dependencies:[],priority:0,files:['src/a.js'],tests:['test/a.test.js'],
  acceptanceCriteria:['Arithmetic regression independently verified']
 }]});
 const initial=await createWorkflow(store,repo,graph,contract);
 approveWorkflow(store,initial.id,{actor:'fixture-owner',workflowHash:initial.contractHash,expiresAt:Date.now()+60000});
 const owner=store.claim(initial.id);
 const run=store.get(initial.id);run.states.a='READY';store.save(run,owner,'READY');
 const childContract={...contract,maxAttempts:1};
 const first=reserve(store,run,owner,'a',childContract);
 const failureRef=store.artifact({authority:'HARNESS_EXECUTED',tests:1,passed:0,failed:1,exitCode:1});
 const old=store.get(first.id);old.state='WAITING_HUMAN';old.lastEvidenceHash=failureRef;
 store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(old),old.id);
 run.states.a='BLOCKED';finish(store,run,owner,{itemId:'a'},'FAILED');
 return {store,run,owner,first,failureRef,childContract};
}
test('opt-in immutable generation preserves original Attempt and failed Evidence',async t=>{
 const f=await setup(t);
 assert.equal(attempts(f.store,f.run.id).length,1);
 assert.equal(attempts(f.store,f.run.id)[0].generation,undefined);
 enableRepairStorage(f.store);
 assert.equal(attempts(f.store,f.run.id)[0].generation,1);
 f.run.states.a='READY';f.store.save(f.run,f.owner,'REPAIR_REVIEWED');
 const child=reserveRepairGeneration(f.store,f.run,f.owner,'a',f.childContract,{
  expectedFailureEvidenceRef:f.failureRef,maxGenerations:2
 });
 assert.equal(child.repairGeneration,2);
 assert.equal(child.repairEvidenceRef,f.failureRef);
 let rows=attempts(f.store,f.run.id);
 assert.deepEqual(rows.map(a=>[a.generation,a.status]),[[1,'FAILED'],[2,'STARTED']]);
 finish(f.store,f.run,f.owner,{itemId:'a',generation:2},'SUCCEEDED');
 rows=attempts(f.store,f.run.id);
 assert.deepEqual(rows.map(a=>[a.generation,a.status]),[[1,'FAILED'],[2,'SUCCEEDED']]);
 assert.equal(repairRows(f.store,f.run.id).length,1);
});
test('unresolved original STARTED blocks repair and cannot be replayed',async t=>{
 const f=await setup(t);enableRepairStorage(f.store);
 f.store.db.prepare("UPDATE workflow_attempts SET status='STARTED' WHERE runId=? AND itemId='a'").run(f.run.id);
 f.run.states.a='READY';
 assert.throws(()=>reserveRepairGeneration(f.store,f.run,f.owner,'a',f.childContract,{
  expectedFailureEvidenceRef:f.failureRef,maxGenerations:2
 }),/terminal failed|active/);
});
test('changed failure Evidence or expanded contract cannot authorize new generation',async t=>{
 const f=await setup(t);enableRepairStorage(f.store);f.run.states.a='READY';
 assert.throws(()=>reserveRepairGeneration(f.store,f.run,f.owner,'a',f.childContract,{
  expectedFailureEvidenceRef:'0'.repeat(64)
 }),/failure Evidence/);
 assert.throws(()=>reserveRepairGeneration(f.store,f.run,f.owner,'a',
  {...f.childContract,goal:'Different expanded goal'},{
    expectedFailureEvidenceRef:f.failureRef
  }),/expanded approved WorkItem/);
});
test('legacy Store requires deliberate opt-in; no automatic table migration',async t=>{
 const f=await setup(t);
 assert.equal(repairRows(f.store,f.run.id).length,0);
 f.run.states.a='READY';
 assert.throws(()=>reserveRepairGeneration(f.store,f.run,f.owner,'a',f.childContract,{
  expectedFailureEvidenceRef:f.failureRef
 }),/not enabled/);
});
