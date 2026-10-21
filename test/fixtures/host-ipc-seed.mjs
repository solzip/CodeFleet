import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { Store } from '../../src/alpha/store.mjs';
import { validateContract } from '../../src/alpha/contract.mjs';
import { hybridDefinition } from '../../src/workflow/definition.mjs';
import { createWorkflow } from '../../src/workflow/persistence.mjs';
import { git, repository } from '../../src/alpha/workspace.mjs';
import { requireSuccess } from '../../src/alpha/process.mjs';
const root=process.argv[2], repo=path.join(root,'private/repo'), state=path.join(root,'private/state');
mkdirSync(path.join(repo,'src'),{recursive:true}); mkdirSync(path.join(repo,'test')); chmodSync(repo,0o700);
writeFileSync(path.join(repo,'src/a.js'),'module.exports=(a,b)=>a+b;');
writeFileSync(path.join(repo,'test/a.test.js'),"const test=require('node:test'),assert=require('node:assert/strict');test('subtract',async()=>{await new Promise(r=>setTimeout(r,500));assert.equal(require('../src/a.js')(5,2),3)});");
for(const args of [['init'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']]) requireSuccess(await git(repo,args),'Fixture repository');
const selected=await repository(repo),store=new Store(state);store.enableCollaboration();
const source=validateContract({schemaVersion:1,goal:'Fix subtraction',files:['src/a.js'],context:['src/a.js'],tests:['test/a.test.js'],maxAttempts:1,timeoutSeconds:120,attemptBudgetUsd:1,delivery:{mode:'local'}});
const graph=hybridDefinition(source,{workflowId:'fixture',base:selected.base,maxParallel:1,items:[{id:'repair',dependencies:[],priority:0,files:source.files,tests:source.tests,acceptanceCriteria:['Protected tests pass'],resources:[],roles:{Planner:'planner',Architect:'architect',Executor:'executor',Reviewer:'reviewer'}}]});
const catalog={};
for(const id of ['safe','risk','cancel','crash','changed']) {
 const run=await createWorkflow(store,repo,graph,source,id);run.authorizationMode='OS_OPERATOR_V1';
 store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run),id);
 catalog[id]={workflowHash:graph.workflowHash,revision:run.revision,riskyItems:id==='risk'?['repair']:[]};
}
store.close();
writeFileSync(path.join(root,'private/config.json'),JSON.stringify({state,catalog,operatorUid:1000,agentUid:1001,environment:{runtime:'h4-linux-fixture'},hostService:true,workspaces:path.join(root,'private/workspaces')}),{mode:0o600});
