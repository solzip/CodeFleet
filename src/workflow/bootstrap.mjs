import { hash } from '../alpha/contract.mjs';
import { exact } from '../intent/contract.mjs';
import { BOOTSTRAP_LIMITS, draftPaths } from '../intent/bootstrap.mjs';
import { WORK_KINDS, evaluateWorkItem } from './capability-policy.mjs';

// A separate graph for NEW_PROJECT plans. It shares capability policy with G4 but
// not its source contract: there are no existing files or protected tests yet, so
// G4's maxAttempts-bounded, file-owning WorkItem rules cannot apply.
export const BOOTSTRAP_POLICY = Object.freeze({ version: 'bootstrap-plan-1', maxItems: BOOTSTRAP_LIMITS.items, delivery: 'local-new-files-only', verification: 'NOT_PROTECTED_UNTIL_EXISTING_CONTRACT', gitEffects: 'USER_ONLY' });
export const EXISTING_LOCAL_POLICY=Object.freeze({...BOOTSTRAP_POLICY,version:'existing-local-1',delivery:'exact-existing-source-replacements',tests:'IMMUTABLE_BASELINE'});
export const EXISTING_LOCAL_TEXT_POLICY=Object.freeze({...EXISTING_LOCAL_POLICY,version:'existing-local-2',delivery:'exact-text-create-or-replace-per-item'});
const policyFor=draft=>draft.kind==='ExistingLocalDraft'?(draft.schemaVersion===2?EXISTING_LOCAL_TEXT_POLICY:EXISTING_LOCAL_POLICY):BOOTSTRAP_POLICY;
// Approval is derived from kind, never supplied, so a proposal cannot lower it.
export const BOOTSTRAP_APPROVALS = Object.freeze({
  planning: 'NONE_PLAN_ONLY', analysis: 'NONE_PLAN_ONLY',
  'local-edit': 'HASH_BOUND_FILESET',
  'local-verification': 'EXACT_LOCAL_COMMAND_TRUST',
  'isolated-execution': 'EXISTING_CONTRACT_REQUIRED',
  'protected-verification': 'EXISTING_CONTRACT_REQUIRED',
  'external-effect': 'AUTHENTICATED_HUMAN_ACTION', 'risky-action': 'AUTHENTICATED_HUMAN_ACTION'
});
const PLAN_ONLY = ['planning', 'analysis'];
// LOCAL_PASSED satisfies a local-verification item only; it is never protected
// verification, and a dependent protected item stays blocked on its own capability.
export const SATISFIED = Object.freeze(['PLAN_RECORDED', 'MATERIALIZED', 'LOCAL_PASSED']);
const id = value => { if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) throw Error('Invalid WorkItem id'); };
const derive = item => ({ ...item, requiredCapabilities: [...WORK_KINDS[item.kind]], approval: BOOTSTRAP_APPROVALS[item.kind] });

export function bootstrapDefinition(plan, { workflowId = 'bootstrap' } = {}) {
  if (!['NEW_PROJECT','EXISTING_LOCAL'].includes(plan?.contractKind) || plan.validation?.status !== 'VALIDATED') throw Error('Bootstrap workflow requires a VALIDATED NEW_PROJECT plan');
  const items = plan.draft.workItems.map(item => {
    exact(item, ['id', 'kind', 'dependencies', 'acceptanceCriteria', 'files'], 'Bootstrap WorkItem');
    if (!Object.hasOwn(WORK_KINDS, item.kind)) throw Error(`Unknown WorkItem kind: ${String(item.kind)}`);
    return derive(structuredClone(item));
  });
  const body = { schemaVersion: 1, kind: 'BootstrapWorkflow', workflowId, draftHash: plan.validation.draftHash, probeRef: plan.probe.probeHash, items, policySnapshotRef: hash(policyFor(plan.draft)) };
  return validateBootstrapWorkflow({ ...body, workflowHash: hash(body) }, plan.draft);
}
export function validateBootstrapWorkflow(input, draft) {
  exact(input, ['schemaVersion', 'kind', 'workflowId', 'draftHash', 'probeRef', 'items', 'policySnapshotRef', 'workflowHash'], 'BootstrapWorkflow');
  const { workflowHash, ...body } = input;
  if (input.schemaVersion !== 1 || input.kind !== 'BootstrapWorkflow' || hash(body) !== workflowHash || input.draftHash !== hash(draft) || input.probeRef !== draft.probeRef || input.policySnapshotRef !== hash(policyFor(draft))) throw Error('Bootstrap workflow identity/hash/policy mismatch');
  id(input.workflowId);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > BOOTSTRAP_POLICY.maxItems) throw Error(`Bootstrap WorkItems must be 1..${BOOTSTRAP_POLICY.maxItems}`);
  const existingLocal=draft.kind==='ExistingLocalDraft';
  const planned = new Set(existingLocal ? draft.plannedFiles.map(f=>f.path) : draftPaths(draft)), owned = new Set(), nodes = new Map();
  for (const item of input.items) {
    exact(item, ['id', 'kind', 'dependencies', 'acceptanceCriteria', 'files', 'requiredCapabilities', 'approval'], 'Bootstrap WorkItem'); id(item.id);
    if (!Object.hasOwn(WORK_KINDS, item.kind) || hash(derive({ ...item, requiredCapabilities: undefined, approval: undefined })) !== hash(item)) throw Error('WorkItem capability or approval differs from its kind');
    if (nodes.has(item.id)) throw Error('Duplicate WorkItem id'); nodes.set(item.id, item);
    if (!Array.isArray(item.dependencies) || item.dependencies.length > BOOTSTRAP_POLICY.maxItems || new Set(item.dependencies).size !== item.dependencies.length || item.dependencies.includes(item.id)) throw Error('Invalid dependencies');
    if (!Array.isArray(item.acceptanceCriteria) || !item.acceptanceCriteria.length || item.acceptanceCriteria.length > 20 || item.acceptanceCriteria.some(c => typeof c !== 'string' || !c.trim() || c.length > 4000)) throw Error('Required acceptance criteria missing');
    if (!Array.isArray(item.files) || item.files.length > BOOTSTRAP_LIMITS.files) throw Error('Invalid WorkItem files');
    if (item.kind === 'local-edit') {
      if (!item.files.length) throw Error('local-edit WorkItem must own planned files');
      for (const f of item.files) { if (!planned.has(f)) throw Error(`File outside the plan: ${f}`); if (owned.has(f)) throw Error(`Overlapping file ownership: ${f}`); owned.add(f); }
    } else if (item.files.length) throw Error(`${item.kind} WorkItem cannot own files`);
  }
  for (const p of planned) if (!owned.has(p)) throw Error(`Planned path has no creating WorkItem: ${p}`);
  const visited = new Set(), visiting = new Set();
  const visit = key => {
    if (!nodes.has(key)) throw Error(`Missing dependency: ${key}`);
    if (visiting.has(key)) throw Error('Cyclic DAG'); if (visited.has(key)) return;
    visiting.add(key); for (const dep of nodes.get(key).dependencies) visit(dep);
    visiting.delete(key); visited.add(key);
  };
  [...nodes.keys()].sort().forEach(visit);
  return structuredClone(input);
}
// Plan-only items are satisfied by the validated plan itself; local-edit items
// wait for an approved fileset; local-verification items wait for an explicitly
// trusted run; everything else stays blocked on its capability.
export function bootstrapStates(workflow, recorded = {}) {
  return Object.fromEntries(workflow.items.map(n => [n.id, recorded[n.id] ?? (PLAN_ONLY.includes(n.kind) ? 'PLAN_RECORDED' : n.kind === 'local-edit' ? 'PENDING_FILESET' : n.kind === 'local-verification' ? 'PENDING_VERIFICATION' : 'BLOCKED')]));
}
// Every item that depends on itemId, directly or transitively.
export function dependentsOf(workflow, itemId) {
  const found = new Set(), queue = [itemId];
  while (queue.length) {
    const next = queue.shift();
    for (const n of workflow.items) if (n.dependencies.includes(next) && !found.has(n.id)) { found.add(n.id); queue.push(n.id); }
  }
  return [...found];
}
export function assessBootstrapItem(workflow, states, itemId) {
  const item = workflow.items.find(n => n.id === itemId);
  if (!item) throw Error(`Unknown WorkItem: ${itemId}`);
  const waiting = item.dependencies.filter(d => !SATISFIED.includes(states[d]));
  // local-edit's scoped write is the approved fileset materializer itself. Plan-only
  // items execute nothing here: the PLANNED Draft content satisfies them, so the
  // capabilities their kind would need to run (e.g. host-read) are not required.
  const planOnly = PLAN_ONLY.includes(item.kind);
  // local-verification runs only through objective verify, whose per-run operator
  // trust of the exact command and tree is the trusted-local-command capability.
  const capability = planOnly ? { status: 'NOT_REQUIRED_PLAN_ONLY', missing: [] } : item.kind === 'local-edit' ? { status: 'AVAILABLE', missing: [] }
    : item.kind === 'local-verification' ? { status: 'EXPLICIT_TRUST_PER_RUN', missing: [] } : evaluateWorkItem(item.kind);
  return { id: item.id, kind: item.kind, state: states[item.id], dependencies: item.dependencies, waitingOn: waiting, requiredCapabilities: item.requiredCapabilities, approval: item.approval,
    capability: capability.status, missing: capability.missing, satisfiedBy: planOnly ? { source: 'VALIDATED_BOOTSTRAP_PLAN', authority: 'PLANNED' } : null,
    acceptanceCriteria: item.acceptanceCriteria, files: item.files };
}
