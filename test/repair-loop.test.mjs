import test from 'node:test';
import assert from 'node:assert/strict';
import { repairWorkItem, triageFailure, repairOfflineWorkItem } from '../src/product/repair.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { built } from './fixtures/bootstrap-reservation.mjs';
import { fixed, stillBroken } from './fixtures/repair-policy.mjs';
import { task, verifyTask } from '../src/product/tasks.mjs';
import { issueOfflineDecision, executeOfflineDecision, issueOfflineRepairDecision } from '../src/product/reservations.mjs';
import { continueOfflineWorkItem } from '../src/product/continuation.mjs';
import { command } from '../src/alpha/process.mjs';
import { hash } from '../src/alpha/contract.mjs';

async function setup(t, { args, maxAttempts = 2 } = {}) {
  const f = await built(); t.after(() => f.store.close());
  const v = task(f.store, f.id); v.settings.maxAttempts = maxAttempts;
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(v), f.id);
  f.request = { executable: process.execPath, args: args ?? ['--test','--test-reporter=tap','test/todo.test.mjs'], directory: f.dir, timeoutMs: 10000 };
  const inspection = await verifyTask(f.store, f.id, 'tests', f.request);
  f.decision = await issueOfflineDecision(f.store, f.id, 'tests', f.request, { decisionId: randomUUID(), requestId: randomUUID(),
    actor: 'initial-fixture-policy', revision: v.revision, commandHash: inspection.commandHash, acknowledgeUnisolated: true,
    expiresAt: Date.now()+90000, maxExecutions: 1, maxConsecutiveFailures: 1, timeBudgetMs: 10000 });
  f.first = await continueOfflineWorkItem(f.store, f.id, { ...f.decision, request: f.request });
  assert.match(f.first.execution?.evidenceRef ?? '', /^[a-f0-9]{64}$/, JSON.stringify(f.first));
  f.evidence = f.store.readArtifact(f.first.execution.evidenceRef);
  f.proposal = { itemId: 'todo', evidenceRef: f.first.execution.evidenceRef,
    hypothesis: 'add returns the unchanged list; append the new entry', diagnostic: 'not ok 1',
    files: [{ path: 'src/todo.mjs', baseSha256: f.evidence.fileDigests['src/todo.mjs'], content: fixed }] };
  f.input = fault => ({ state: f.state, id: f.id, request: f.request, proposal: f.proposal, fault });
  f.call = async fault => {
    const r = await command(process.execPath, [path.resolve('test/fixtures/repair-worker.mjs'), JSON.stringify(f.input(fault))]);
    assert.equal(r.exitCode, 0, r.stdout + r.stderr); return JSON.parse(r.stdout);
  };
  f.source = () => readFile(path.join(f.dir,'src/todo.mjs'), 'utf8');
  f.count = () => f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations WHERE taskId=?').get(f.id).n;
  return f;
}

test('P0-2 public repair cannot turn caller JSON into execution authority', async () => {
  assert.equal((await repairWorkItem({ actor: 'operator', approved: true })).action, 'AWAIT_APPROVAL');
});

test('A/H: real failure, approved source repair, new decision/Attempt, new Local evidence and Judge', async t => {
  const f = await setup(t), testsBefore = await readFile(path.join(f.dir,'test/todo.test.mjs'));
  assert.equal(f.first.execution.status,'LOCAL_FAILED');
  assert.equal(f.first.snapshot.repair.requiresNewReviewedTask,false);
  assert.equal(f.first.snapshot.repair.requiresNewExecutionDecision,true);
  const r = await f.call();
  assert.equal(r.execution?.status,'LOCAL_PASSED', JSON.stringify(r));
  assert.equal(r.action,'AUTO_REPAIR_ELIGIBLE');
  assert.equal(await f.source(),fixed); assert.equal(f.count(),2);
  assert.notEqual(r.execution.reservation.runId, f.first.execution.reservation.runId);
  assert.notEqual(r.execution.commandHash, f.first.execution.commandHash);
  assert.notEqual(r.execution.reservation.candidateTreeHash, f.first.execution.reservation.candidateTreeHash);
  assert.ok(r.execution.reservation.revision > f.first.execution.reservation.revision);
  assert.equal(r.snapshot.judgments.tests.outcome,'ESCALATE');
  assert.equal(r.complete,false); assert.equal(r.protectedVerification,'UNSATISFIED');
  assert.deepEqual(await readFile(path.join(f.dir,'test/todo.test.mjs')),testsBefore);
  assert.deepEqual(f.store.readArtifact(f.first.execution.evidenceRef),f.evidence);
  assert.equal((await f.call()).action,'HUMAN_HANDOFF'); assert.equal(f.count(),2);
  console.log('P0-2 evidence '+JSON.stringify({state:f.state,taskId:f.id,before:f.first.execution,after:r.execution,repair:r.materialization,judge:r.snapshot.judgments}));
});

for (const scope of ['test/todo.test.mjs','outside.mjs']) test(`B/H: ${scope} never modified`, async t => {
  const f = await setup(t), before = await f.source(); f.proposal.files[0].path=scope;
  const r = await f.call(); assert.equal(r.action,'AWAIT_APPROVAL'); assert.equal(await f.source(),before); assert.equal(f.count(),1);
});

test('B: proposal and actor claims cannot approve repair', async t => {
  const f = await setup(t), before = await f.source();
  assert.equal((await repairOfflineWorkItem(f.store,f.id,{proposal:f.proposal,request:f.request,operator:{actor:'operator',approved:true}})).action,'AWAIT_APPROVAL');
  assert.equal((await f.call('refuse')).action,'AWAIT_APPROVAL'); assert.equal(await f.source(),before); assert.equal(f.count(),1);
});
test('C: actual missing test summary is DIAGNOSE, not a repair', async t => {
  const f = await setup(t,{args:['-e','process.exit(1)']}), before=await f.source();
  assert.equal(f.first.execution.status,'INCONCLUSIVE');
  assert.equal((await f.call()).action,'DIAGNOSE'); assert.equal(await f.source(),before); assert.equal(f.count(),1);
});
test('C: corrupted failure artifact is RECONCILE', async t => {
  const f=await setup(t), before=await f.source();
  await writeFile(path.join(f.state,'artifacts',f.first.execution.evidenceRef+'.json'),'{}');
  assert.equal((await f.call()).action,'RECONCILE'); assert.equal(await f.source(),before);
});
test('C: unsupported hypothesis is read-only DIAGNOSE', async t => {
  const f=await setup(t); f.proposal.diagnostic='a diagnostic that never occurred';
  assert.equal((await f.call()).action,'DIAGNOSE'); assert.equal(f.count(),1);
});
test('D: missing executable blocks capability without changing source', async t => {
  const f=await setup(t), before=await f.source(); f.request.executable=path.join(f.root,'missing-node');
  assert.equal((await f.call()).action,'BLOCKED_CAPABILITY'); assert.equal(await f.source(),before); assert.equal(f.count(),1);
});
test('E: failed repair consumes finite budget and cannot loop after restart', async t => {
  const f=await setup(t); f.proposal.files[0].content=stillBroken;
  const r=await f.call('repeat'); assert.equal(r.execution?.status,'LOCAL_FAILED',JSON.stringify(r));
  assert.equal(r.action,'HUMAN_HANDOFF'); assert.equal(f.count(),2);
  assert.equal((await f.call()).action,'HUMAN_HANDOFF'); assert.equal(f.count(),2);
});
test('E: exhausted budget prevents any repair', async t => {
  const f=await setup(t,{maxAttempts:1}), before=await f.source();
  assert.equal((await f.call()).action,'HUMAN_HANDOFF'); assert.equal(await f.source(),before);
});
test('time: repair clock rollback refuses source writes and preserves consumed verification budget', async t=>{
  const f=await setup(t),before=await f.source();
  const r=await f.call('clock-repair');
  assert.equal(r.action,'RECONCILE');
  assert.equal(await f.source(),before);
  assert.equal(f.count(),1);
});
for (const fault of ['revoke-repair','lease-repair','revision-repair','revision-after-write','revoke-verification','revoke-after-verification','revision-after-verification','lease-after-verification','cancel-after-verification']) {
  test(`G: ${fault} refuses stale success or new execution`,async t=>{
    const f=await setup(t), before=await f.source(), r=await f.call(fault);
    assert.ok(['AWAIT_APPROVAL','RECONCILE'].includes(r.action),JSON.stringify(r));
    assert.notEqual(r.execution?.status,'LOCAL_PASSED');
    if (['revoke-repair','lease-repair','revision-repair'].includes(fault)) { assert.equal(await f.source(),before); assert.equal(f.count(),1); }
    assert.equal(r.complete,false);
    assert.equal((await triageFailure(f.store,f.id,{proposal:f.proposal,request:f.request})).action,'RECONCILE');
  });
}
for (const fault of ['kill-repair','kill-started']) test(`F: ${fault} worker is never replayed after restart`,async t=>{
  const f=await setup(t), before=await f.source(), marker=path.join(f.root,'started');
  const child=spawn(process.execPath,[path.resolve('test/fixtures/repair-worker.mjs'),JSON.stringify({...f.input(fault),marker})],{stdio:'ignore',windowsHide:true});
  const exited=once(child,'exit'); t.after(()=>{if(child.exitCode===null&&child.signalCode===null) child.kill('SIGKILL');});
  const end=Date.now()+15000;
  while(!(await readFile(marker).then(()=>true,()=>false))) { assert.ok(Date.now()<end); await new Promise(r=>setTimeout(r,30)); }
  child.kill('SIGKILL'); await exited;
  const count=f.count();
  if (fault==='kill-started') assert.equal(f.store.db.prepare("SELECT count(*) n FROM bootstrap_reservations WHERE state='STARTED'").get().n,1);
  assert.equal((await f.call()).action,'RECONCILE'); assert.equal(f.count(),count); assert.equal(await f.source(),fault==='kill-repair'?before:fixed);
});
test('C: actual truncated output never permits repair',async t=>{
  const f=await setup(t,{args:['-e',"process.stdout.write('x'.repeat(3*1024*1024)); process.exitCode=1"]});
  assert.equal(f.evidence.observed.truncated,true);
  assert.equal((await f.call()).action,'DIAGNOSE'); assert.equal(f.count(),1);
});
test('G: cancellation before repair cannot consume another attempt',async t=>{
  const f=await setup(t), before=await f.source();
  const r=await repairOfflineWorkItem(f.store,f.id,{proposal:f.proposal,request:f.request,cancelled:()=>true});
  assert.equal(r.action,'RECONCILE'); assert.equal(f.count(),1); assert.equal(await f.source(),before);
});
test('E: no-op candidate is HUMAN_HANDOFF, never a fresh attempt',async t=>{
  const f=await setup(t); f.proposal.files[0].content=await f.source();
  assert.equal((await f.call()).action,'HUMAN_HANDOFF'); assert.equal(f.count(),1);
});
test('ordinary decision cannot bypass failure stop; repair cannot reset exhausted budget',async t=>{
  const f=await setup(t);
  const inspection=await verifyTask(f.store,f.id,'tests',f.request);
  const input={...f.decision,decisionId:randomUUID(),requestId:randomUUID(),revision:task(f.store,f.id).revision,commandHash:inspection.commandHash};
  const fields=['decisionId','requestId','actor','revision','commandHash','acknowledgeUnisolated','expiresAt','maxExecutions','timeBudgetMs','maxConsecutiveFailures'];
  const fresh=await issueOfflineDecision(f.store,f.id,'tests',f.request,Object.fromEntries(fields.map(k=>[k,input[k]])));
  await assert.rejects(executeOfflineDecision(f.store,f.id,'tests',f.request,fresh),/budget exhausted/);
  assert.equal(f.count(),1);
  const r=await f.call(); assert.equal(r.execution.status,'LOCAL_PASSED');
  await assert.rejects(issueOfflineRepairDecision(f.store,f.id,'tests',f.request,{},r.runId),/budget exhausted/);
  const duplicate=await executeOfflineDecision(f.store,f.id,'tests',f.request,{decisionId:r.execution.decision.decisionId,requestId:r.execution.decision.requestId});
  assert.equal(duplicate.evidenceRef,r.execution.evidenceRef); assert.equal(f.count(),2);
});
