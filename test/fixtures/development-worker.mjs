// TEST PROCESS ONLY: explicit synthetic Operator decisions, never Host authority.
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/alpha/store.mjs';
import { task, submitBootstrapFiles, approveTask, materializeTask, verifyTask } from '../../src/product/tasks.mjs';
import { continuationSnapshot, continueOfflineWorkflow } from '../../src/product/continuation.mjs';
import { issueOfflineDecision, revokeDecision } from '../../src/product/reservations.mjs';
import { triageFailure } from '../../src/product/repair.mjs';
import { prepare } from './development-loop.mjs';

const input = JSON.parse(process.argv[2]);
let store;
try {
  if (input.action === 'prepare') console.log(JSON.stringify(await prepare(input.root, input)));
  else {
    store = new Store(input.state);
    const id = input.id;
    let result;
    if (input.action === 'snapshot') result = await continuationSnapshot(store, id);
    if (input.action === 'propose') result = await submitBootstrapFiles(store, id, input.proposal);
    if (input.action === 'approve') result = approveTask(store, id, { actor: 'offline-test-operator', workflowHash: input.filesetHash, expiresAt: Date.now() + 120000 });
    if (input.action === 'materialize') result = await materializeTask(store, id, input.itemId, { freshOnly: true,
      hooks: input.fault ? { claimed: ({ runId }) => {
        if (input.fault === 'lease') store.db.prepare("UPDATE runs SET owner='lost' WHERE id=?").run(runId);
        if (input.fault === 'revoke') store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(runId);
        if (input.fault === 'expired') store.db.prepare('UPDATE workflow_approvals SET expires=0 WHERE runId=?').run(runId);
      }, beforeCommit: ({ runId }) => {
        if (input.fault === 'revoke-after-write') store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(runId);
      } } : {} });
    if (input.action === 'triage') result = await triageFailure(store, id, { request: input.request });
    if (input.action === 'verify') {
      const before = await continuationSnapshot(store, id);
      result = await continueOfflineWorkflow(store, id, { scope: { taskRevision: before.taskRevision, workflowHash: before.workflowHash,
        workItems: [{ itemId: input.itemId, request: input.request }], maxAttempts: task(store, id).settings.maxAttempts,
        maxReservedTimeMs: 120000, expiresAt: Date.now() + 120000, modelCalls: 0 },
        obtainDecision: input.noApproval ? undefined : async ({ itemId, request }) => {
          const inspected = await verifyTask(store, id, itemId, request);
          const decision = await issueOfflineDecision(store, id, itemId, request, { decisionId: randomUUID(), requestId: randomUUID(),
            actor: 'offline-test-operator', revision: task(store, id).revision, commandHash: inspected.commandHash,
            acknowledgeUnisolated: true, expiresAt: Date.now() + 90000, maxExecutions: 1, timeBudgetMs: request.timeoutMs, maxConsecutiveFailures: 1 });
          if (input.revoke) revokeDecision(store, decision.decisionId, 'offline-test-operator');
          return decision;
        } });
    }
    if (!result) throw Error('Unknown action');
    console.log(JSON.stringify(result));
  }
} catch (error) { console.log(JSON.stringify({ error: error.message })); process.exitCode = 1; }
finally { store?.close(); }
