import { Store } from '../../src/alpha/store.mjs';
import { validateContract } from '../../src/alpha/contract.mjs';
import { hybridDefinition } from '../../src/workflow/definition.mjs';
import { writeFileSync } from 'node:fs';
export function seed(directory, ids = ['safe', 'risk', 'revoked', 'expired', 'changed', 'resume']) {
  const store = new Store(directory); store.enableCollaboration();
  const source = validateContract({ schemaVersion: 1, goal: 'Fix subtraction', files: ['src/a.js'], context: ['src/a.js'], tests: ['test/a.test.js'], maxAttempts: 1, timeoutSeconds: 120, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
  const graph = hybridDefinition(source, { workflowId: 'fixture', base: 'a'.repeat(40), maxParallel: 1, items: [{ id: 'repair', dependencies: [], priority: 0, files: source.files, tests: source.tests, acceptanceCriteria: ['Protected tests pass'], resources: [], roles: { Planner: 'planner', Architect: 'architect', Executor: 'executor', Reviewer: 'reviewer' } }] });
  const catalog = {};
  for (const id of ids) {
    const run = { id, kind: 'workflow', repo: '/fixture/repo', base: graph.base, contract: graph, contractHash: graph.workflowHash, sourceRef: store.artifact(source), graphRef: store.artifact(graph), revision: 1, states: { repair: 'PENDING' }, state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0, authorizationMode: 'OS_OPERATOR_V1' };
    store.create(run);
    catalog[id] = { workflowHash: graph.workflowHash, revision: 1, riskyItems: id === 'safe' ? [] : ['repair'] };
  }
  store.close(); return catalog;
}
if (process.argv[2]) {
  const state = process.argv[2], catalog = seed(state);
  writeFileSync(process.argv[3], JSON.stringify({ state, catalog, operatorUid: 1000, agentUid: 1001, environment: { runtime: 'offline-linux-fixture', remote: false } }), { mode: 0o600 });
}
