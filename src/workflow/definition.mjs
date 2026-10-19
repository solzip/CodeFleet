import { hash, validateContract } from '../alpha/contract.mjs';
import { exact, compile } from '../intent/contract.mjs';
import { CAPABILITIES } from '../providers/capabilities.mjs';

export const POLICY = Object.freeze({ version: 'g4-local-sequential-1', concurrency: 1, delivery: 'local', verification: 'HARNESS_EXECUTED', autoRetryLost: false });
export const HYBRID_POLICY = Object.freeze({ ...POLICY, version: 'g5-controlled-hybrid-1', concurrency: 3 });
export const ROLES = Object.freeze(['Planner', 'Architect', 'Executor', 'Reviewer']);
export const policyFor = workflow => workflow.schemaVersion === 2 ? HYBRID_POLICY : POLICY;
export const parallelLimit = workflow => workflow.schemaVersion === 2 ? workflow.maxParallel : 1;
const id = value => { if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) || value === 'final') throw Error('Invalid WorkItem/workflow id'); };
export function definition(source, { workflowId, base, items, workflowVersion = 1 }) {
  const body = { schemaVersion: 1, workflowId, workflowVersion, sourceContractRef: hash(source), base, items, requiredCapabilities: ['non_interactive_execution', 'structured_output', 'proposal_only'], acceptanceCriteria: ['All protected source-contract tests pass on the integrated candidate'], requiredVerification: true, policySnapshotRef: hash(POLICY) };
  return validateWorkflow({ ...body, workflowHash: hash(body) }, source);
}
export function fromPlan(plan, workflowId, items) {
  const source = compile(plan); // NEEDS_INPUT/CAPABILITY_GAP cannot become workflows.
  return { source: source.alpha, workflow: definition(source.alpha, { workflowId, base: source.discovery.base, items }) };
}
export function hybridDefinition(source, { workflowId, base, items, workflowVersion = 1, maxParallel = 1 }) {
  const stripped = items.map(({ roles, resources, ...item }) => item);
  const { workflowHash, ...body } = definition(source, { workflowId, base, items: stripped, workflowVersion });
  const hybrid = { ...body, schemaVersion: 2, items, maxParallel, policySnapshotRef: hash(HYBRID_POLICY) };
  return validateWorkflow({ ...hybrid, workflowHash: hash(hybrid) }, source);
}
export function validateWorkflow(input, source) {
  const contract = validateContract(source);
  const hybrid = input?.schemaVersion === 2;
  exact(input, ['schemaVersion', 'workflowId', 'workflowVersion', 'sourceContractRef', 'base', 'items', 'requiredCapabilities', 'acceptanceCriteria', 'requiredVerification', 'policySnapshotRef', 'workflowHash', ...(hybrid ? ['maxParallel'] : [])], 'Workflow');
  const { workflowHash, ...body } = input;
  if (![1, 2].includes(input.schemaVersion) || !Number.isInteger(input.workflowVersion) || input.workflowVersion < 1 || hash(body) !== workflowHash || input.sourceContractRef !== hash(contract) || input.policySnapshotRef !== hash(policyFor(input))) throw Error('Workflow identity/hash/policy mismatch');
  if (hybrid && (!Number.isInteger(input.maxParallel) || input.maxParallel < 1 || input.maxParallel > 3)) throw Error('Parallel resource limit must be 1..3');
  id(input.workflowId);
  if (!/^[a-f0-9]{40,64}$/.test(input.base)) throw Error('Invalid workflow baseline');
  if (contract.delivery.mode !== 'local' || input.requiredVerification !== true) throw Error('G4 requires local delivery and independent verification');
  if (!Array.isArray(input.acceptanceCriteria) || input.acceptanceCriteria.length !== 1 || input.acceptanceCriteria[0] !== 'All protected source-contract tests pass on the integrated candidate') throw Error('Final verification cannot be replaced');
  if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.some(c => !CAPABILITIES.includes(c)) || ['non_interactive_execution', 'structured_output', 'proposal_only'].some(c => !input.requiredCapabilities.includes(c))) throw Error('Required capability missing or unknown');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > contract.maxAttempts) throw Error('WorkItem count exceeds source attempt budget');
  const nodes = new Map(), owned = new Set();
  for (const item of input.items) {
    exact(item, ['id', 'dependencies', 'priority', 'files', 'tests', 'acceptanceCriteria', ...(hybrid ? ['roles', 'resources'] : [])], 'WorkItem'); id(item.id);
    if (hybrid) {
      exact(item.roles, ROLES, 'role assignments');
      Object.values(item.roles).forEach(id);
      if (new Set(Object.values(item.roles)).size !== ROLES.length) throw Error('Separate role identities required');
      if (!Array.isArray(item.resources) || item.resources.length > 20 || item.resources.some(r => typeof r !== 'string' || !/^[A-Za-z0-9_./:-]{1,100}$/.test(r)) || new Set(item.resources).size !== item.resources.length) throw Error('Invalid resource locks');
    }
    if (nodes.has(item.id)) throw Error('Duplicate WorkItem id'); nodes.set(item.id, item);
    if (!Number.isInteger(item.priority) || Math.abs(item.priority) > 1000 || !Array.isArray(item.dependencies) || new Set(item.dependencies).size !== item.dependencies.length) throw Error('Invalid priority/dependencies');
    if (!Array.isArray(item.files) || !item.files.length || !Array.isArray(item.tests) || !item.tests.length) throw Error('Explicit files/tests required');
    for (const f of item.files) { if (!contract.files.includes(f) || owned.has(f)) throw Error('Scope expansion or overlapping writes unsupported'); owned.add(f); }
    if (item.tests.some(t => !contract.tests.includes(t))) throw Error('Test scope expansion');
    if (!Array.isArray(item.acceptanceCriteria) || !item.acceptanceCriteria.length || item.acceptanceCriteria.length > 20 || item.acceptanceCriteria.some(c => typeof c !== 'string' || !c.trim() || c.length > 4000)) throw Error('Required acceptance criteria missing');
    validateContract({ ...contract, files: item.files, tests: item.tests, maxAttempts: 1 });
  }
  const ordered = [], visited = new Set(), visiting = new Set();
  function visit(key) {
    if (!nodes.has(key)) throw Error('Missing dependency');
    if (visiting.has(key)) throw Error('Cyclic DAG'); if (visited.has(key)) return;
    visiting.add(key); for (const dep of nodes.get(key).dependencies) visit(dep);
    visiting.delete(key); visited.add(key); ordered.push(key);
  }
  [...nodes.keys()].sort().forEach(visit);
  return structuredClone(input);
}
export function nextReady(workflow, states) {
  return workflow.items.filter(n => states[n.id] === 'READY' && n.dependencies.every(d => states[d] === 'SUCCEEDED')).sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}
export function readyBatch(workflow, states) {
  const remaining = { ...states }, chosen = [], resources = new Set();
  for (let item; (item = nextReady(workflow, remaining));) {
    remaining[item.id] = 'CONSIDERED';
    if ((item.resources ?? []).some(r => resources.has(r))) continue;
    chosen.push(item); (item.resources ?? []).forEach(r => resources.add(r));
    if (chosen.length === parallelLimit(workflow)) break;
  }
  return chosen;
}
