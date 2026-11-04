import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { planWithCodexManagedThread, planningOutputSchema } from '../src/hosts/codex-managed-planning.mjs';

const goal='Repair arithmetic behavior in src/a.js with test/a.test.js and independently verify results.';
async function setup(t) {
  const root=await mkdtemp(join(tmpdir(),'cf-planning-turn-'));
  let activeStore;
  t.after(async()=>{ activeStore?.close(); await rm(root,{recursive:true,force:true}); });
  const repo=join(root,'repo');
  await mkdir(join(repo,'src'),{recursive:true});
  await mkdir(join(repo,'test'));
  await writeFile(join(repo,'src/a.js'),'export function add(x,y){ return x+y; }\n');
  await writeFile(join(repo,'test/a.test.js'),'import test from "node:test";\n');
  for(const args of [['init'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]){
    const result=await git(repo,args);
    assert.equal(result.exitCode,0,result.stderr.toString());
  }
  const store=new Store(join(root,'state')); activeStore=store;
  return {repo,store,settings:{executable:process.execPath,model:'fixture-model',cwd:repo}};
}
function proposedReceipt(call) {
  const message=JSON.parse(call.prompt);
  const draft={schemaVersion:2,objective:message.originalObjective,
    base:message.context.discovery.base,files:['src/a.js'],tests:['test/a.test.js'],
    criteria:[{description:'Arithmetic regression passes',method:'protected-tests',tests:['test/a.test.js']}],
    risks:[],unknowns:[],effects:['local-edit']};
  return {terminalStatus:'completed',threadId:'host-thread',turnId:'host-turn',
    authority:'PROVIDER_REPORTED_ONLY',protectedVerified:false,
    text:JSON.stringify({sessionId:message.sessionId,requestHash:message.requestHash,proposal:{
      draft,references:[{path:'src/a.js',line:1,quote:'export function'},
        {path:'test/a.test.js',line:1,quote:'import test'}],inferences:[]
    }})};
}
test('approved Codex planning Turn reuses existing cited-draft validator and persists result',async t=>{
 const f=await setup(t);let turns=0;
 const result=await planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async binding=>Boolean(binding.sessionId&&binding.requestHash),
  transport:async call=>{turns++;assert.equal(call.outputSchema,planningOutputSchema);return proposedReceipt(call);}
 });
 assert.equal(turns,1);
 assert.equal(result.status,'VALIDATED');
 assert.equal(result.authority,'PROVIDER_REPORTED_ONLY');
 assert.equal(result.hostReceipt.threadId,'host-thread');
 assert.equal(result.costStatus,'UNKNOWN');
 assert.equal(result.executable,false);
 assert.ok(result.workflowPreview);
});
test('without independent exact grant, Host Turn is never called',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async()=>false,
  transport:async()=>{turns++;throw Error('unreachable');}
 }),/approval/);
 assert.equal(turns,0);
});
test('uncertain dispatched Turn remains RECONCILING without replay',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async()=>true,
  transport:async()=>{turns++;throw Error('host crashed');}
 }),/host crashed/);
 assert.equal(turns,1);
 const rows=f.store.db.prepare("SELECT status FROM host_planning").all();
 assert.equal(rows.length,1);
 assert.equal(rows[0].status,'RECONCILING');
});
