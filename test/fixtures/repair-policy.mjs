// TEST OPERATOR, never imported by production. Preapproved policy is compiled
// here, separately from untrusted proposal data and the repair coordinator.
import { randomUUID } from 'node:crypto';
import { hash } from '../../src/alpha/contract.mjs';
import { approveTask } from '../../src/product/tasks.mjs';
import { issueOfflineRepairDecision } from '../../src/product/reservations.mjs';
export const fixed = 'export const add = (list, t) => [...list, t];\n';
export const stillBroken = 'export const add = (list, t) => [...list];\n';
export function fixtureOperator(store, { allowBroken = false, refuse = false } = {}) {
  return {
    async approveRepair({ taskId, proposal, approvalRequest }) {
      const expected = allowBroken ? stillBroken : fixed;
      if (refuse || proposal.files.length !== 1 || proposal.files[0].path !== 'src/todo.mjs' ||
          hash(proposal.files[0].content) !== hash(expected)) return;
      approveTask(store, taskId, { actor: 'compiled-fixture-policy', workflowHash: approvalRequest.filesetHash, expiresAt: Date.now() + 90000 });
    },
    async issueVerification({ taskId, itemId, runId, revision, commandHash, request, deadline }) {
      if (request.executable !== process.execPath || JSON.stringify(request.args) !== JSON.stringify(['--test','--test-reporter=tap','test/todo.test.mjs'])) throw Error('Unexpected fixture command');
      return issueOfflineRepairDecision(store, taskId, itemId, request, { decisionId: randomUUID(), requestId: randomUUID(),
        actor: 'compiled-fixture-policy', revision, commandHash, acknowledgeUnisolated: true, expiresAt: Math.min(Date.now() + 90000, deadline),
        maxExecutions: 1, maxConsecutiveFailures: 1, timeBudgetMs: request.timeoutMs }, runId);
    }
  };
}
