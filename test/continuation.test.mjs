import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { built, request } from './fixtures/bootstrap-reservation.mjs';
import { task, verifyTask } from '../src/product/tasks.mjs';
import { issueOfflineDecision, revokeDecision } from '../src/product/reservations.mjs';
import { command } from '../src/alpha/process.mjs';
import { continuationSnapshot, continueOfflineWorkItem, continueWorkItem } from '../src/product/continuation.mjs';
import * as continuation from '../src/product/continuation.mjs';
import { BootstrapOperator } from '../src/hosts/bootstrap-operator.mjs';
import { canonical, fingerprint } from '../src/hosts/operator.mjs';

const worker = path.resolve('test/fixtures/continuation-worker.mjs');
async function bounded(f, overrides = {}) {
  const snapshot = await continuationSnapshot(f.store, f.id);
  return { taskRevision: snapshot.taskRevision, workflowHash: snapshot.workflowHash,
    workItems: ['tests', 'tests-next'].map(itemId => ({ itemId, request: structuredClone(f.request) })),
    maxAttempts: 2, maxReservedTimeMs: 30000, expiresAt: Date.now() + 120000, modelCalls: 0, ...overrides };
}

test('P0-A: bounded continuation consumes fresh decisions for two dependent WorkItems', async t => {
  const f = await setup(t), scope = await bounded(f), selected = [];
  const result = await continuation.continueOfflineWorkflow(f.store, f.id, { scope,
    obtainDecision: async ({ itemId }) => { selected.push(itemId); return f.issue(itemId); } });
  assert.deepEqual(selected, ['tests', 'tests-next']);
  assert.equal(result.executions.length, 2);
  assert.ok(result.executions.every(e => e.status === 'LOCAL_PASSED'));
  assert.equal(new Set(result.executions.map(e => e.evidenceRef)).size, 2);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_decisions WHERE consumed IS NOT NULL AND remaining=0').get().n, 2);
  assert.equal(result.snapshot.budget.usedAttempts, 2);
  assert.equal(result.snapshot.budget.reservedTimeMs, 30000);
  assert.equal(result.complete, false);
  assert.equal(result.snapshot.protectedVerification, 'UNSATISFIED');
  assert.deepEqual(f.store.readArtifact(result.scopeRef), scope);
  assert.equal(f.store.events(f.id).filter(e => e.type === 'BOUNDED_CONTINUATION_STOPPED').length, 1);
});

for (const fault of ['missing', 'replay', 'cancel', 'revision', 'command', 'expired', 'revoked', 'candidate', 'scope', 'attempts', 'time', 'failure']) {
  test(`P0-A: bounded loop stops on ${fault} without launching next work`, async t => {
    const f = await setup(t, { passing: fault !== 'failure' });
    const scope = await bounded(f, fault === 'attempts' ? { maxAttempts: 1 } : fault === 'time' ? { maxReservedTimeMs: 15000 } : {});
    if (fault === 'scope') scope.workItems.pop();
    let calls = 0, first, cancel = false;
    const result = await continuation.continueOfflineWorkflow(f.store, f.id, { scope, cancelled: () => cancel,
      obtainDecision: async ({ itemId, request: supplied }) => {
        calls++;
        if (calls === 1) { first = await f.issue(itemId); return first; }
        if (fault === 'missing') return null;
        if (fault === 'replay') return first;
        const next = await f.issue(itemId);
        if (fault === 'cancel') cancel = true;
        if (fault === 'revision') { const v = task(f.store, f.id); v.revision++; f.store.db.prepare('UPDATE product_tasks SET revision=?,body=? WHERE id=?').run(v.revision, JSON.stringify(v), f.id); }
        if (fault === 'command') supplied.args.push('--extra');
        if (fault === 'expired') f.store.db.prepare('UPDATE bootstrap_decisions SET expires=0 WHERE id=?').run(next.decisionId);
        if (fault === 'revoked') revokeDecision(f.store, next.decisionId, 'fixture');
        if (fault === 'candidate') await writeFile(path.join(f.dir, 'src/todo.mjs'), 'changed');
        return next;
      } });
    assert.equal(result.executions.length, 1);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n, 1);
    assert.equal(result.complete, false);
    assert.ok(['HUMAN_HANDOFF', 'AWAIT_OPERATOR'].includes(result.status));
    if (['scope', 'attempts', 'time', 'failure'].includes(fault)) assert.equal(calls, 1);
  });
}

test('P0-A: scope is a ceiling, never authority; expiry and model budget fail closed', async t => {
  const f = await setup(t);
  for (const extra of [{}, { expiresAt: 0 }, { modelCalls: 1 }]) {
    const result = await continuation.continueOfflineWorkflow(f.store, f.id, { scope: await bounded(f, extra) });
    assert.equal(result.executions.length, 0);
    assert.equal(result.complete, false);
  }
  assert.equal(f.store.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='bootstrap_reservations'").get().n, 0,
    'No authority must not even initialize execution tables');
});

test('P0-A: a later invocation cannot reset the persisted attempt ceiling', async t => {
  const f = await setup(t), scope = await bounded(f, { maxAttempts: 1 });
  const options = { scope, obtainDecision: ({ itemId }) => f.issue(itemId) };
  const first = await continuation.continueOfflineWorkflow(f.store, f.id, options);
  assert.equal(first.executions.length, 1);
  const resumed = await continuation.continueOfflineWorkflow(f.store, f.id, { ...options,
    scope: { ...scope, taskRevision: task(f.store, f.id).revision } });
  assert.equal(resumed.executions.length, 0);
  assert.equal(resumed.reason, 'CONTINUATION_BUDGET_EXHAUSTED');
  assert.equal(resumed.snapshot.budget.usedAttempts, 1);
});

for (const forged of [false, true]) test(`P0-A: enrolled Operator ${forged ? 'rejects forged' : 'checks fresh signed'} decisions in the loop`, async t => {
  const f = await setup(t), keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const bridge = new BootstrapOperator(f.store, { operatorKeys: [publicKey], profile: 'p0-a-test-only' });
  // Close the lease timer before setup's Store cleanup.
  try {
    bridge.open(f.id);
    const result = await continuation.continueOfflineWorkflow(f.store, f.id, { scope: await bounded(f),
      obtainDecision: async ({ itemId, request: commandRequest }) => {
        const pending = await bridge.requestVerification(f.id, itemId, commandRequest);
        const decision = { id: pending.action.requestId, kind: 'APPROVE', binding: pending.binding,
          principal: fingerprint(publicKey), expiresAt: Date.now() + 90000, maxUses: 1 };
        // Fixture signer only; no production or Agent-held approval authority.
        const envelope = { decision, signature: forged ? '00'.repeat(64) : sign(null, Buffer.from(canonical(decision)), keys.privateKey).toString('hex') };
        return bridge.acceptVerification({ action: pending.action, envelope });
      } });
    assert.equal(result.executions.length, forged ? 0 : 2);
    assert.equal(result.snapshot.budget.usedAttempts, forged ? 0 : 2);
    assert.equal(result.complete, false);
    if (forged) assert.match(result.reason, /signature/i);
  } finally { bridge.close(); }
});
async function setup(t, { passing = true, chainedVerification = true, maxAttempts = 2 } = {}) {
  const f = await built({ passing, chainedVerification }); t.after(() => f.store.close());
  const value = task(f.store, f.id); value.settings.maxAttempts = maxAttempts;
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(value), f.id);
  f.request = { ...request(f), args: ['--test', '--test-reporter=tap', 'test/todo.test.mjs'], timeoutMs: 15000 };
  f.issue = async (itemId = 'tests') => {
    const inspected = await verifyTask(f.store, f.id, itemId, f.request);
    const input = { decisionId: randomUUID(), requestId: randomUUID(), actor: 'offline-fixture-only', revision: task(f.store, f.id).revision,
      commandHash: inspected.commandHash, acknowledgeUnisolated: true, expiresAt: Date.now() + 120000,
      maxExecutions: 1, timeBudgetMs: 30000, maxConsecutiveFailures: 1 };
    await issueOfflineDecision(f.store, f.id, itemId, f.request, input); return input;
  };
  f.call = async extra => {
    const r = await command(process.execPath, [worker, JSON.stringify({ state: f.state, taskId: f.id, request: f.request, ...extra })]);
    assert.equal(r.exitCode, 0, r.stdout + r.stderr); return JSON.parse(r.stdout);
  };
  return f;
}

test('P0-1: one real WorkItem, persisted evidence/Judge, next dependency and fresh decision after restart', async t => {
  const f = await setup(t), input = await f.issue();
  const first = await f.call(input);
  assert.equal(first.execution.status, 'LOCAL_PASSED');
  assert.equal(first.execution.tests, 1);
  assert.equal(first.snapshot.next.itemId, 'tests-next');
  assert.equal(first.snapshot.status, 'AWAIT_OPERATOR');
  assert.equal(first.snapshot.executionGranted, false);
  assert.equal(first.snapshot.budget.remainingAttempts, 1);
  assert.equal(first.snapshot.judgments.tests.outcome, 'ESCALATE');
  assert.equal(first.snapshot.complete, false);
  assert.equal(first.snapshot.verification, 'LOCAL_ONLY_UNPROTECTED');
  const e = f.store.readArtifact(first.execution.evidenceRef);
  assert.equal(e.observed.exitCode, 0); assert.match(e.log, /ok 1/);
  assert.equal(e.command.candidateTreeHash, e.reservation.candidateTreeHash);
  const duplicate = await f.call(input);
  assert.equal(duplicate.execution.evidenceRef, first.execution.evidenceRef);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n, 1);
  assert.equal((await f.call({ inspect: true })).next.itemId, 'tests-next');
  const second = await f.issue('tests-next');
  const last = await f.call(second);
  assert.equal(last.execution.status, 'LOCAL_PASSED');
  assert.equal(last.snapshot.status, 'HUMAN_HANDOFF');
  assert.equal(last.snapshot.protectedVerification, 'UNSATISFIED');
  assert.deepEqual(last.snapshot.remaining.map(x => x.id), ['review-verify']);
});

test('P0-1: real failure preserves evidence and proposes bounded source repair, never retry', async t => {
  const f = await setup(t, { passing: false }), input = await f.issue();
  const result = await f.call(input);
  assert.equal(result.execution.status, 'LOCAL_FAILED');
  assert.equal(result.execution.failed, 1);
  assert.equal(result.snapshot.status, 'HUMAN_HANDOFF');
  assert.equal(result.snapshot.budget.remainingAttempts, 1);
  assert.equal(result.snapshot.budget.retryAllowed, false);
  assert.equal(result.snapshot.repair.evidenceRef, result.execution.evidenceRef);
  assert.ok(result.snapshot.repair.files.includes('src/todo.mjs'));
  assert.ok(!result.snapshot.repair.files.some(p => p.startsWith('test/')));
  assert.equal(result.snapshot.repair.executionGranted, false);
  await f.call(input);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n, 1);
});

for (const fault of ['absent', 'expired', 'revoked', 'revision', 'candidate', 'command', 'budget']) {
  test(`P0-1: ${fault} blocks continuation without a process reservation`, async t => {
    const f = await setup(t, { maxAttempts: fault === 'budget' ? 0 : 2 });
    const input = await f.issue();
    if (fault === 'absent') input.decisionId = 'missing';
    if (fault === 'expired') f.store.db.prepare('UPDATE bootstrap_decisions SET expires=0').run();
    if (fault === 'revoked') revokeDecision(f.store, input.decisionId, 'fixture');
    if (fault === 'revision') { const v = task(f.store, f.id); v.revision++; f.store.db.prepare('UPDATE product_tasks SET revision=?,body=? WHERE id=?').run(v.revision, JSON.stringify(v), f.id); }
    if (fault === 'candidate') await writeFile(path.join(f.dir, 'src/todo.mjs'), 'changed');
    if (fault === 'command') f.request.args.push('--extra');
    const result = await continueOfflineWorkItem(f.store, f.id, { ...input, request: f.request });
    assert.equal(result.status, 'HUMAN_HANDOFF');
    assert.equal(result.execution, null);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM bootstrap_reservations').get().n, 0);
  });
}

test('P0-1: lost lease hands off and public continuation cannot use offline approval', async t => {
  const f = await setup(t), input = await f.issue();
  await assert.rejects(() => continueWorkItem(f.store, f.id, { ...input, request: f.request }), /HOST_OPERATOR_ISOLATION_UNAVAILABLE/);
  const r = await continueOfflineWorkItem(f.store, f.id, { ...input, request: f.request, hooks: { reserved: a => {
    f.store.db.prepare("UPDATE runs SET owner='replacement' WHERE id=?").run(a.runId);
  } } });
  assert.equal(r.execution.status, 'HUMAN_HANDOFF');
  assert.equal(r.snapshot.status, 'HUMAN_HANDOFF');
  assert.equal(r.snapshot.budget.remainingAttempts, 1);
  assert.equal(task(f.store, f.id).bootstrap.verifications, undefined);
});

test('P0-1: killed reserved worker recovers Objective, budget and handoff without relaunch', async t => {
  const f = await setup(t), input = await f.issue(), marker = path.join(f.root, 'reserved');
  const child = spawn(process.execPath, [worker, JSON.stringify({ state: f.state, taskId: f.id, request: f.request, ...input, marker })], { stdio: 'ignore', windowsHide: true });
  const exited = once(child, 'exit');
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const end = Date.now() + 15000;
  while (!(await readFile(marker).then(() => true, () => false))) {
    assert.ok(Date.now() < end, 'worker must reserve'); await new Promise(r => setTimeout(r, 30));
  }
  child.kill('SIGKILL'); await exited;
  const recovered = await f.call(input);
  assert.equal(recovered.execution.status, 'HUMAN_HANDOFF');
  assert.equal(recovered.snapshot.status, 'HUMAN_HANDOFF');
  assert.equal(recovered.snapshot.budget.remainingAttempts, 1);
  assert.ok(recovered.snapshot.objective);
  assert.ok(recovered.snapshot.acceptanceCriteria.length);
  assert.ok(recovered.snapshot.remaining.some(i => i.id === 'tests'));
  assert.equal(f.store.events(f.id).filter(e => e.type === 'BOOTSTRAP_EXECUTION_STARTED').length, 0);
});

test('P0-1: candidate drift and provider-only/tampered evidence cannot yield accepted next work', async t => {
  const f = await setup(t), input = await f.issue();
  const result = await f.call(input);
  await writeFile(path.join(f.dir, 'src/todo.mjs'), 'different candidate');
  assert.equal((await continuationSnapshot(f.store, f.id)).status, 'HUMAN_HANDOFF');
  await writeFile(path.join(f.state, 'artifacts', result.execution.evidenceRef + '.json'), JSON.stringify({ authority: 'PROVIDER_REPORTED_ONLY', status: 'LOCAL_PASSED' }));
  const snapshot = await continuationSnapshot(f.store, f.id);
  assert.equal(snapshot.status, 'HUMAN_HANDOFF');
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.next, null);
});

test('P0-1: content-addressed but misbound/provider evidence is rejected even with consistent attachment references', async t => {
  const f = await setup(t), input = await f.issue();
  const { execution } = await f.call(input);
  assert.equal(execution.status, 'LOCAL_PASSED', JSON.stringify(execution));
  const original = f.store.readArtifact(execution.evidenceRef);
  const reservation = execution.reservation;
  const run = f.store.get(reservation.runId);
  const current = task(f.store, f.id);
  const terminalEvent = f.store.events(f.id).find(e => e.type === 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED');
  for (const patch of [
    { authority: 'PROVIDER_REPORTED_ONLY' },
    { workflowHash: 'a'.repeat(64) },
    { command: { ...original.command, candidateTreeHash: 'b'.repeat(64) } },
    { observed: { ...original.observed, commandHash: 'c'.repeat(64) } },
    { observed: { ...original.observed, passed: 0 } }
  ]) {
    const ref = f.store.artifact({ ...original, ...patch });
    const changed = { ...reservation, result: { ...reservation.result, evidenceRef: ref } };
    f.store.db.prepare('UPDATE bootstrap_reservations SET body=? WHERE requestId=?').run(JSON.stringify(changed), input.requestId);
    f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify({ ...run, reservation: changed }), run.id);
    f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify({ ...current,
      bootstrap: { ...current.bootstrap, verifications: { tests: ref } } }), f.id);
    f.store.db.prepare("UPDATE events SET body=? WHERE runId=? AND type='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED'").run(JSON.stringify({ ...terminalEvent.body, evidenceRef: ref }), f.id);
    const snapshot = await continuationSnapshot(f.store, f.id);
    assert.equal(snapshot.status, 'HUMAN_HANDOFF');
    assert.equal(snapshot.reason, 'EVIDENCE_DEFECT');
    assert.equal(snapshot.next, null);
    assert.equal(snapshot.complete, false);
  }
});
