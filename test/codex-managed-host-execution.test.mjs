import test from 'node:test';
import assert from 'node:assert/strict';
import { hash, validateContract } from '../src/alpha/contract.mjs';
import { policyFor } from '../src/workflow/definition.mjs';
import { createCodexManagedHostExecution } from '../src/hosts/codex-managed-host-execution.mjs';

function fixture({ reserved = true, approved = true, control = 'run' } = {}) {
  const contract = validateContract({
    schemaVersion: 1, goal: 'Repair the arithmetic regression in the approved source file.',
    files: ['src/a.js'], context: ['src/a.js'], tests: ['test/a.test.js'],
    maxAttempts: 1, timeoutSeconds: 120, attemptBudgetUsd: 1,
    delivery: { mode: 'local' }
  });
  const graphBody = { schemaVersion: 1, requiredCapabilities: [],
    policySnapshotRef: hash(policyFor({ schemaVersion: 1 })) };
  const graph = { ...graphBody, workflowHash: hash(graphBody) };
  const parent = { id: 'parent-1', kind: 'workflow', revision: 1,
    contract: graph, contractHash: graph.workflowHash, providerId: null };
  const child = { id: 'child-1', workflowParent: parent.id, workflowFence: 'owner-1',
    workflowItemId: 'a', workflowRevision: 1, workflowGraphHash: parent.contractHash,
    state: 'GENERATING', attempts: 1, costPending: true,
    candidateDirectory: process.cwd(), contract, contractHash: hash(contract) };
  const store = {
    get(id) {
      if (id === parent.id) return parent;
      if (id === child.id) return child;
      throw Error('Unknown run');
    },
    db: { prepare(sql) {
      return {
        get() {
          if (sql.includes('workflow_approvals')) return approved
            ? { digest: parent.contractHash, expires: Date.now() + 60000 } : null;
          if (sql.includes('owner, leaseUntil, control')) return {
            owner: 'owner-1', leaseUntil: Date.now() + 60000, control };
          return null;
        },
        all() {
          if (sql.includes('workflow_attempts')) return reserved
            ? [{ runId: parent.id, itemId: 'a', childId: child.id, revision: 1, status: 'STARTED' }] : [];
          return [];
        }
      };
    } }
  };
  const request = { contract, files: {
    'src/a.js': 'export const add = (a,b) => a+b;',
    'test/a.test.js': 'import test from "node:test";'
  }, timeoutMs: 1000, cancelled: () => false };
  return { store, parent, child, request };
}
const proposal = { summary: 'Fix arithmetic', edits: [{ path: 'src/a.js', oldText: 'a+b', newText: 'a-b' }] };
const receipt = () => ({ threadId: 'thread-1', turnId: 'turn-1',
  terminalStatus: 'completed', authority: 'PROVIDER_REPORTED_ONLY',
  protectedVerified: false, text: JSON.stringify(proposal) });

test('disabled by default, cannot select or execute', async () => {
  const x = fixture();
  const h = createCodexManagedHostExecution(x.store, { transport: async () => receipt() });
  await assert.rejects(h.select(x.parent), /Disabled/);
  await assert.rejects(h.execute(x.child, x.request), /disabled/);
});

test('approved reservation may create a proposal-only result with observed Host receipt', async () => {
  const x = fixture(); let called = 0;
  const h = createCodexManagedHostExecution(x.store, {
    enabled: true, model: 'model-fixture', executable: process.execPath,
    transport: async call => {
      called++; assert.equal(call.outputSchema.required[0], 'summary');
      assert.match(call.prompt, /workItemId/);
      assert.equal(call.timeoutMs, 1000);
      assert.equal(call.cwd, x.child.candidateDirectory);
      return receipt();
    }
  });
  const selected = await h.select(x.parent);
  assert.equal(selected.providerId, 'codex-app-server-read-only');
  const result = await h.execute(x.child, x.request);
  assert.equal(called, 1);
  assert.equal(result.mode, 'PROPOSAL_ONLY');
  assert.equal(result.hostReceipt.threadId, 'thread-1');
  assert.equal(result.attemptId, x.child.id);
  assert.equal(result.hostSessionCostStatus, 'UNKNOWN');
  assert.equal(result.cost, null);
  assert.deepEqual(result.proposal, proposal);
});

for (const name of ['reserved', 'approved', 'control']) {
  test('cannot start a Turn without '+name+' precondition', async () => {
    const opts = { reserved: true, approved: true, control: 'run' };
    if (name === 'control') opts.control = 'pause'; else opts[name] = false;
    const x = fixture(opts); let called = false;
    const h = createCodexManagedHostExecution(x.store, {
      enabled: true, cwd: process.cwd(), model: 'fixture', executable: process.execPath,
      transport: async () => { called = true; return receipt(); }
    });
    await assert.rejects(h.execute(x.child, x.request));
    assert.equal(called, false);
  });
}

test('stale revision cannot start Host Turn', async () => {
  const x = fixture(); x.child.workflowRevision = 2;
  let called = false;
  const h = createCodexManagedHostExecution(x.store, { enabled: true, transport: async () => { called = true; return receipt(); } });
  await assert.rejects(h.execute(x.child, x.request), /Stale/);
  assert.equal(called, false);
});

test('wrong content and unverified Host receipts are not accepted', async () => {
  const x = fixture();
  for (const wrong of [
    { ...receipt(), terminalStatus: 'failed' },
    { ...receipt(), text: '{invalid' },
    { ...receipt(), text: JSON.stringify({ summary: 'fake', edits: [{ path: 'unapproved.js', oldText: 'a', newText: 'b' }] }) },
    { ...receipt(), protectedVerified: true },
  ]) {
    const h = createCodexManagedHostExecution(x.store, { enabled: true, cwd: process.cwd(),
      model: 'fixture', executable: process.execPath, transport: async () => wrong });
    await assert.rejects(h.execute(x.child, x.request));
  }
});
