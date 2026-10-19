import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { requireSuccess } from '../src/alpha/process.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { hybridDefinition, definition, fromPlan, nextReady, readyBatch } from '../src/workflow/definition.mjs';
import { createWorkflow, approveWorkflow, reviseWorkflow, attempts, reserve, revokeWorkflow } from '../src/workflow/persistence.mjs';
import { createRegistry } from '../src/providers/registry.mjs';
import { createClaudeAdapter } from '../src/providers/claude.mjs';
import { createCodexAdapter } from '../src/providers/codex.mjs';
import { CAPABILITIES } from '../src/providers/capabilities.mjs';
import { planIntent } from '../src/intent/engine.mjs';

const source = () => ({ schemaVersion: 1, goal: 'Repair arithmetic regressions with protected tests.', files: ['src/a.js', 'src/b.js'], context: ['src/a.js', 'src/b.js'], tests: ['test/a.test.js', 'test/b.test.js'], maxAttempts: 3, timeoutSeconds: 120, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
const item = (id, dependencies = []) => ({ id, dependencies, priority: 0, files: [`src/${id}.js`], tests: [`test/${id}.test.js`], acceptanceCriteria: ['Protected arithmetic regression passes'], resources: [], roles: { Planner: 'planner', Architect: 'architect', Executor: 'executor', Reviewer: 'reviewer' } });
const supported = () => ({ installed: true, identity: { id: 'claude', version: 'fake' }, capabilities: Object.fromEntries(CAPABILITIES.map(c => [c, { status: 'SUPPORTED' }])) });
async function setup(items = [item('a'), item('b', ['a'])]) {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-workflow-')), repo = path.join(root, 'repo');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  for (const n of items.some(n => n.id === 'c') ? ['a', 'b', 'c'] : ['a', 'b']) {
    await writeFile(path.join(repo, `src/${n}.js`), 'module.exports = function subtract(a,b) { return a+b; };');
    await writeFile(path.join(repo, `test/${n}.test.js`), `const test=require('node:test'),assert=require('node:assert/strict');test('${n}',()=>assert.equal(require('../src/${n}.js')(5,2),3));`);
  }
  requireSuccess(await git(repo, ['init']), 'init'); requireSuccess(await git(repo, ['add', '.']), 'add');
  requireSuccess(await git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']), 'fixture commit');
  const base = requireSuccess(await git(repo, ['rev-parse', 'HEAD']), 'base');
  const store = new Store(path.join(root, 'state')), contract = source();
  if (items.some(n => n.id === 'c')) { contract.files.push('src/c.js'); contract.context.push('src/c.js'); contract.tests.push('test/c.test.js'); }
  const graph = hybridDefinition(contract, { workflowId: 'repair', base, items, maxParallel: items.length === 3 ? 3 : 2 });
  const run = await createWorkflow(store, repo, graph, contract, 'workflow');
  const calls = [];
  const adapter = createClaudeAdapter({ runCommand: async (_exe, _args, options) => {
    const request = JSON.parse(options.input); calls.push(request.allowedFiles[0]);
    return { exitCode: 0, interrupted: false, truncated: false, stdout: Buffer.from(JSON.stringify({ structured_output: { summary: 'Fix arithmetic', edits: request.allowedFiles.map(f => ({ path: f, oldText: 'a+b', newText: 'a-b' })) }, total_cost_usd: 0.1 })), stderr: Buffer.alloc(0) };
  } }); adapter.probe = async () => supported();
  const dependencies = { workflowRegistry: createRegistry([adapter]), ready: async () => {}, verify: async ({ directory, tests }) => {
    const passed = (await Promise.all(tests.map(t => readFile(path.join(directory, t.replace('test/', 'src/').replace('.test.js', '.js')), 'utf8')))).filter(s => s.includes('a-b')).length;
    return { authority: 'HARNESS_EXECUTED', tests: tests.length, passed, failed: tests.length - passed, skipped: 0, todo: 0, exitCode: passed === tests.length ? 0 : 1, testNames: tests, interrupted: false, truncated: false };
  } };
  const approve = () => approveWorkflow(store, run.id, { actor: 'human-reviewer', workflowHash: store.get(run.id).contractHash, expiresAt: Date.now() + 60000 });
  return { root, repo, base, store, run, graph, contract, calls, dependencies, approve };
}

import { delegate, sendMessage, messages } from '../src/workflow/collaboration.mjs';


import { dispatchProduct } from '../src/product/cli.mjs';
import { task, enableTasks } from '../src/product/tasks.mjs';
import { runReport } from '../src/product/report.mjs';
import { semanticPlan, readCodeContext } from '../src/intent/semantic.mjs';
import { createClaudePlanner } from '../src/providers/planner.mjs';
import { command } from '../src/alpha/process.mjs';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../src/alpha/cli.mjs',import.meta.url));
const goal='Fix subtract behavior using protected regressions';
const reviewArgs=id=>['review',id,'--files','src/a.js,src/b.js','--tests','test/a.test.js,test/b.test.js','--criterion','Subtraction regressions pass'];
const dispatch=(f,args)=>dispatchProduct(args,{store:f.store,execution:f.dependencies});
async function prepared(f, extra=[]) {
 const planned=await dispatch(f,['plan',goal,f.repo]);
 const id=planned.data.taskId;
 await dispatch(f,[...reviewArgs(id),...extra]);
 const waiting=await dispatch(f,['run',id]);
 return {id,waiting};
}
async function authorized(f,extra=[]) {
 const {id,waiting}=await prepared(f,extra);
 await dispatch(f,['approve',id,'--hash',waiting.data.workflowHash,'--actor','reviewer']);
 return id;
}

test('code-context planning reads code and test references, never treats matching as semantic proof',async()=>{
 const f=await setup();
 try {
  const p=await semanticPlan(f.repo,'Fix subtract behavior');
  assert.equal(p.validation.status,'NEEDS_INPUT'); assert.equal(p.analysis.mode,'LOCAL_CODE_CONTEXT');
  assert.deepEqual(p.draft.files,['src/a.js','src/b.js']); assert.equal(p.draft.tests.length,2);
  assert.equal(p.analysis.observations.length,4); assert.equal(p.executable,false);
  assert.ok(p.analysis.observations.every(r=>r.authority==='HOST_OBSERVED_CODE'));
 }finally{f.store.close();}
});

test('Intent to reviewed Contract to Workflow to Run to Verification completes with fake provider',async()=>{
 const f=await setup();
 try {
  const {id,waiting}=await prepared(f);
  assert.equal(waiting.exitCode,2); assert.equal(waiting.data.run.state,'WAITING_APPROVAL'); assert.equal(f.calls.length,0);
  await assert.rejects(dispatch(f,['approve',id,'--hash','forged','--actor','reviewer']),/approval/);
  await dispatch(f,['approve',id,'--hash',waiting.data.workflowHash,'--actor','reviewer']);
  assert.equal((await dispatch(f,['run',id])).exitCode,2); assert.equal(f.calls.length,0);
  const result=await dispatch(f,['run',id,'--allow-model']);
  assert.equal(result.exitCode,0,result.data.run.reason); assert.equal(result.data.run.complete,true);
  assert.equal(result.data.run.verification.status,'VERIFIED');
  assert.equal(result.data.run.verification.treeRechecked,true);
  assert.equal(result.data.run.workItems[0].roles.Executor,'repair-executor');
  assert.ok(result.data.run.artifactPaths.evidenceHash);
 }finally{f.store.close();}
});

test('CLI parallel options bind to approved workflow; independent candidates integrate',async()=>{
 const f=await setup();
 try {
  const id=await authorized(f,['--item','a|src/a.js|test/a.test.js|','--item','b|src/b.js|test/b.test.js|','--parallel','2','--attempts','2']);
  const result=await dispatch(f,['run',id,'--allow-model']);
  assert.equal(result.exitCode,0,result.data.run.reason);
  assert.deepEqual(result.data.run.workItems.map(w=>w.id),['a','b']);
  assert.equal(f.store.get(result.data.run.runId).contract.maxParallel,2);
 }finally{f.store.close();}
});

test('task review invalidates old approval and prevents scope expansion and unsafe settings',async()=>{
 const f=await setup();
 try {
  const id=await authorized(f), old=task(f.store,id).runId;
  await assert.rejects(dispatch(f,[...reviewArgs(id),'--parallel','4']),/Parallel/);
  await assert.rejects(dispatch(f,['review',id,'--files','src/outside.js','--tests','test/a.test.js','--criterion','pass']),/CAPABILITY_GAP/);
  await dispatch(f,reviewArgs(id));
  assert.equal(f.store.get(old).control,'cancel');
  const fresh=await dispatch(f,['run',id]); assert.notEqual(fresh.data.run.runId,old); assert.equal(fresh.data.run.state,'WAITING_APPROVAL');
  assert.equal(f.calls.length,0);
 }finally{f.store.close();}
});

test('approval rejection persists and cannot resume; risk intent cannot be waived by review',async()=>{
 const f=await setup();
 try {
  const p=await dispatch(f,['plan',goal,f.repo]),id=p.data.taskId;
  await dispatch(f,['reject',id,'--actor','operator']);
  await assert.rejects(dispatch(f,['run',id,'--allow-model']),/rejected/);
  const risk=await dispatch(f,['plan','deploy subtract changes',f.repo]);
  await assert.rejects(dispatch(f,reviewArgs(risk.data.taskId)),/NEEDS_INPUT/);
 }finally{f.store.close();}
});

test('pause resume cancellation flow preserves pinned contract and refuses cancelled replay',async()=>{
 const f=await setup();
 try {
  const id=await authorized(f);
  await dispatch(f,['pause',id]);
  assert.equal((await dispatch(f,['status',id])).data.run.complete,false);
  const result=await dispatch(f,['resume',id,'--allow-model']); assert.equal(result.exitCode,0,result.data.run.reason);
  const next=await authorized(f); await dispatch(f,['cancel',next]);
  await assert.rejects(dispatch(f,['resume',next,'--allow-model']),/Cancelled/);
 }finally{f.store.close();}
});

test('report and legacy export reject altered final tree without new model execution',async()=>{
 const f=await setup();
 try {
  const id=await authorized(f),done=await dispatch(f,['run',id,'--allow-model']);
  const run=f.store.get(done.data.run.runId), child=f.store.get(run.finalRunId);
  await writeFile(path.join(child.candidateDirectory,'src/a.js'),'tampered');
  const report=await runReport(f.store,run.id);
  assert.equal(report.complete,false); assert.equal(report.verification.status,'INVALID');
  const exported=await command(process.execPath,[cli,'--state',f.store.directory,'export',run.id,path.join(f.root,'export')]);
  assert.equal(exported.exitCode,1); assert.equal(fs.existsSync(path.join(f.root,'export')),false);
 }finally{f.store.close();}
});

test('actual CLI JSON/non-TTY plan review approve capability block status and report',async()=>{
 const f=await setup();
 try {
  const invoke=async args=>{const r=await command(process.execPath,[cli,'--state',f.store.directory,'objective',...args],{timeoutMs:30000});return {code:r.exitCode,data:JSON.parse(r.stdout.toString())};};
  const p=await invoke(['plan',goal,f.repo]); assert.equal(p.code,2);
  const id=p.data.taskId; assert.equal((await invoke(reviewArgs(id))).code,0);
  const waiting=await invoke(['run',id]); assert.equal(waiting.code,2);
  assert.equal((await invoke(['approve',id,'--hash',waiting.data.workflowHash,'--actor','reviewer'])).code,0);
  const blocked=await invoke(['run',id,'--allow-model']); assert.equal(blocked.code,2);
  assert.equal(blocked.data.run.complete,false); assert.equal(blocked.data.run.activeAttempts.length,0);
  assert.equal((await invoke(['report',id])).code,0);
  assert.equal((await invoke(['report',waiting.data.run.runId])).code,0);
  assert.equal((await invoke(['status'])).data.tasks.length,1);
  assert.equal((await invoke(['review',id,'--unknown','x'])).code,1);
 }finally{f.store.close();}
});

test('product migration is additive and task/event update is atomic',async()=>{
 const f=await setup();
 try {
  const before=f.store.db.prepare('SELECT body FROM runs WHERE id=?').get(f.run.id).body;
  enableTasks(f.store); enableTasks(f.store);
  assert.equal(f.store.db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(f.store.db.prepare('SELECT body FROM runs WHERE id=?').get(f.run.id).body,before);
  f.store.db.exec("CREATE TRIGGER fail_task BEFORE INSERT ON events WHEN NEW.type='INTENT_RECORDED' BEGIN SELECT RAISE(ABORT,'fixture task event failure'); END;");
  await assert.rejects(dispatch(f,['plan',goal,f.repo]),/fixture task event/);
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM product_tasks').get().n,0);
 }finally{f.store.close();}
});

test('actual Docker integrated product flow verifies original tests and preserves repository', {skip:process.env.CODEFLEET_TEST_DOCKER!=='1'},async()=>{
 const f=await setup();
 try {
  const {verify,ready,...execution}=f.dependencies;f.dependencies=execution;
  const id=await authorized(f,['--item','a|src/a.js|test/a.test.js|','--item','b|src/b.js|test/b.test.js|','--parallel','2','--attempts','2']);
  const result=await dispatch(f,['run',id,'--allow-model']);assert.equal(result.exitCode,0,result.data.run.reason);
  assert.equal(result.data.run.verification.tests,2);
  assert.equal(requireSuccess(await git(f.repo,['status','--porcelain']),'status'),'');
 }finally{f.store.close();}
});

async function semanticFixture(f) {
 const context=await readCodeContext(f.repo,goal);
 const draft={schemaVersion:2,objective:goal,base:context.discovery.base,files:['src/a.js'],tests:['test/a.test.js'],criteria:[{description:'Subtraction passes',method:'protected-tests',tests:['test/a.test.js']}],risks:[],unknowns:[],effects:['local-edit']};
 const output={draft,references:['src/a.js','test/a.test.js'].map(p=>({path:p,line:1,quote:context.files[p].text.split('\n')[0]})),inferences:['The implementation adds where regression expects subtraction']};
 return {context,output};
}

test('semantic Claude planner uses no-tool envelope, validates code citations and keeps raw output untrusted',async()=>{
 const f=await setup();
 try {
  const {context,output}=await semanticFixture(f); let args;
  const adapter=createClaudePlanner({runCommand:async(_exe,argv,options)=>{
   args=argv; const input=JSON.parse(options.input); assert.equal(input.context.files['src/a.js'].oid,context.files['src/a.js'].oid);
   return {exitCode:0,stdout:Buffer.from(JSON.stringify({structured_output:output,total_cost_usd:0.1,usage:{input_tokens:10}})),stderr:Buffer.alloc(0)};
  }});
  adapter.probe=async()=>supported();
  const result=await semanticPlan(f.repo,goal,{registry:createRegistry([adapter]),requested:'claude',allowLive:true});
  assert.equal(result.analysis.mode,'AI_SEMANTIC_PROPOSAL');assert.equal(result.validation.status,'VALIDATED');assert.equal(result.executable,false);
  assert.equal(result.providerResult.authority,'PROVIDER_REPORTED_ONLY');assert.ok(result.providerResult.raw.stdout.includes('structured_output'));
  assert.equal(args[args.indexOf('--tools')+1],''); assert.equal(args[args.indexOf('--mcp-config')+1],'{"mcpServers":{}}');
  assert.equal(args[args.indexOf('--settings')+1],'{"disableAllHooks":true}');
  assert.equal(result.analysis.observations[0].authority,'HOST_OBSERVED_CODE');
 }finally{f.store.close();}
});

test('semantic planner rejects malformed JSON, fake citations, schema or acceptance gaps',async()=>{
 const f=await setup();
 try {
  const {context,output}=await semanticFixture(f);
  for(const change of ['json','citation','schema','execution']) {
   const bad=structuredClone(output);
   if(change==='citation')bad.references[0].quote='never observed';
   if(change==='schema')bad.draft.authorized=true;
   const adapter=createClaudePlanner({runCommand:async()=>({exitCode:change==='execution'?1:0,stdout:Buffer.from(change==='json'?'bad JSON':JSON.stringify({structured_output:bad})),stderr:Buffer.alloc(0)})});
   const r=await adapter.execute({kind:'SemanticPlanningRequest',mode:'PROPOSAL_ONLY',objective:goal,context,timeoutMs:1000,attemptBudgetUsd:1});
   assert.equal(r.status,'FAILED');assert.ok(r.error);
  }
  let calls=0; const adapter=createClaudePlanner({runCommand:async()=>{calls++;throw Error('must not call');}});
  adapter.probe=async()=>supported();
  await assert.rejects(semanticPlan(f.repo,goal,{registry:createRegistry([adapter])}),/consent/);assert.equal(calls,0);
  const r=await adapter.execute({kind:'SemanticPlanningRequest',mode:'PROPOSAL_ONLY',objective:goal,context,timeoutMs:1000,attemptBudgetUsd:1,cancelled:()=>true});
  assert.equal(r.error.code,'CANCELLED');assert.equal(calls,0);
 }finally{f.store.close();}
});

test('semantic Codex remains blocked even with explicit model consent',async()=>{
 const f=await setup();
 try {
  let calls=0; const adapter=createCodexAdapter({runCommand:async()=>{calls++;throw Error('no execution');}});
  adapter.probe=async()=>({...supported(),identity:{id:'codex',version:'fixture'},capabilities:{...supported().capabilities,proposal_only:{status:'UNVERIFIED'}}});
  await assert.rejects(semanticPlan(f.repo,goal,{registry:createRegistry([adapter]),requested:'codex',allowLive:true}),/capabilit|eligible/i);
  assert.equal(calls,0);
 }finally{f.store.close();}
});

test('forged accepted artifacts never produce a completed report or export',async()=>{
 const f=await setup();
 try {
  const id=await authorized(f),done=await dispatch(f,['run',id,'--allow-model']);
  const run=f.store.get(done.data.run.runId);
  await writeFile(path.join(f.store.directory,'artifacts',run.evidenceHash+'.json'),'{}');
  const report=await runReport(f.store,run.id);assert.equal(report.complete,false);assert.equal(report.verification.status,'INVALID');
 }finally{f.store.close();}
});

test('V1 rows survive product migration and historical verified artifacts still export',async()=>{
 const f=await setup();const old=new Store(path.join(f.root,'v1-state'));
 try {
  const {createRun}=await import('../src/alpha/controller.mjs');
  const {verifiedEvidence}=await import('../src/alpha/evidence.mjs');
  const run=await createRun(old,f.repo,{...f.contract,maxAttempts:1});
  const before=old.db.prepare('SELECT body FROM runs WHERE id=?').get(run.id).body;
  assert.equal(old.db.prepare('PRAGMA user_version').get().user_version,1);
  enableTasks(old);assert.equal(old.db.prepare('PRAGMA user_version').get().user_version,2);
  assert.equal(old.db.prepare('SELECT body FROM runs WHERE id=?').get(run.id).body,before);
  const r=await execute(old,run.id,{...f.dependencies,propose:async req=>({cost:0.1,proposal:{summary:'fix',edits:req.contract.files.map(path=>({path,oldText:'a+b',newText:'a-b'}))}})});
  assert.equal(r.state,'COMPLETED',r.reason);
  const owner=old.claim(r.id),historical=old.get(r.id);delete historical.candidatePaths;old.save(historical,owner,'HISTORICAL_FIXTURE');old.release(r.id,owner);
  assert.equal((await verifiedEvidence(old,old.get(r.id))).treeRechecked,false);
  const output=await command(process.execPath,[cli,'--state',old.directory,'export',r.id,path.join(f.root,'historical-export')]);
  assert.equal(output.exitCode,0,output.stderr.toString());
 }finally{old.close();f.store.close();}
});

test('planner intent and unknown cost are reserved before invocation and failures never auto-replay',async()=>{
 const f=await setup();
 try {
  let calls=0;
  const adapter={id:'claude',tasks:['semantic-planning'],probe:async()=>supported(),execute:async()=>{
   calls++;const row=f.store.db.prepare('SELECT body FROM product_tasks').get();const value=JSON.parse(row.body);
   assert.equal(value.state,'PLANNING');assert.equal(value.plannerAttempt.cost,null);
   throw Error('fixture planner lost response');
  }};
  const result=await dispatchProduct(['plan',goal,f.repo,'--planner','claude','--allow-model'],{store:f.store,plannerRegistry:createRegistry([adapter])});
  assert.equal(result.exitCode,2);assert.equal(result.data.state,'BLOCKED');
  assert.equal(result.data.plan.intent.original,goal);assert.equal(result.data.plannerAttempt.cost,null);
  await assert.rejects(dispatch(f,['run',result.data.taskId,'--allow-model']),/no automatic/);assert.equal(calls,1);
 }finally{f.store.close();}
});

test('concurrent workflow preparation attaches once; missing criteria never authorize',async()=>{
 const f=await setup();
 try {
  const planned=await dispatch(f,['plan',goal,f.repo]),id=planned.data.taskId;
  await assert.rejects(dispatch(f,['review',id,'--files','src/a.js','--tests','test/a.test.js']),/Expected|Invalid/);
  await dispatch(f,reviewArgs(id));
  const results=await Promise.allSettled([dispatch(f,['run',id]),dispatch(f,['run',id])]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const current=task(f.store,id);assert.equal(f.store.get(current.runId).state,'WAITING_APPROVAL');
  assert.equal(attempts(f.store,current.runId).length,0);
 }finally{f.store.close();}
});
