import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { hash, validateContract } from '../alpha/contract.mjs';
import { semanticPlan, readCodeContext, validateSemanticProposal } from '../intent/semantic.mjs';
import { planIntent } from '../intent/engine.mjs';
import { compile } from '../intent/contract.mjs';
import { exact } from '../intent/contract.mjs';
import { discover } from '../intent/discovery.mjs';
import { hybridDefinition } from '../workflow/definition.mjs';
import { createWorkflow, approveWorkflow, revokeWorkflow, attempts } from '../workflow/persistence.mjs';

export function enableTasks(store) {
  store.enableCollaboration();
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.exec("CREATE TABLE IF NOT EXISTS product_tasks(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); INSERT OR IGNORE INTO workflow_extensions VALUES ('product-tasks',1);");
    if (store.db.prepare("SELECT version FROM workflow_extensions WHERE name='product-tasks'").get().version !== 1) throw Error('Unsupported task schema');
    store.db.exec('COMMIT');
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
export function task(store, id) {
  const row = store.db.prepare('SELECT body FROM product_tasks WHERE id=?').get(id);
  if (!row) throw Error('Unknown task: ' + id);
  return JSON.parse(row.body);
}
export function tasks(store) { return store.db.prepare('SELECT body FROM product_tasks ORDER BY rowid DESC').all().map(r => JSON.parse(r.body)); }
function update(store, current, next, event) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=? AND revision=?').run(JSON.stringify(next), next.revision, current.id, current.revision).changes !== 1) throw Error('Task revision conflict');
    store.event(current.id, event, { revision: next.revision, planRef: next.planRef, runId: next.runId ?? null });
    store.db.exec('COMMIT'); return next;
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
export async function createTask(store, repo, objective, options = {}) {
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 4000 || objective.includes('\0')) throw Error('Intent requires 1..4000 characters');
  const original = { kind: 'IntentPlan', intent: { original: objective, authority: 'USER_REQUEST_ONLY' }, executable: false, status: 'PLANNING' };
  const value = { id: 'task-' + randomUUID(), revision: 1, repo: path.resolve(repo), planRef: store.artifact(original), state: 'PLANNING', runId: null, settings: { maxParallel: 1, maxAttempts: 1, timeoutSeconds: 300, attemptBudgetUsd: 1 }, plannerAttempt: options.registry ? { status: 'RESERVED', cost: null, automaticRetry: false } : null };
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.prepare('INSERT INTO product_tasks VALUES (?,?,?)').run(value.id, value.revision, JSON.stringify(value));
    store.event(value.id, 'INTENT_RECORDED', { planRef: value.planRef, revision: 1 }); store.db.exec('COMMIT');
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  let plan;
  try { plan = await semanticPlan(value.repo, objective, options); }
  catch (e) { plan = { ...original, status: 'BLOCKED', error: e.message, providerResult: e.providerResult ?? null }; }
  return update(store, value, { ...value, revision: 2, planRef: store.artifact(plan), state: plan.validation?.status ?? 'BLOCKED', plannerAttempt: value.plannerAttempt ? { status: plan.providerResult ? 'RESULT_RECORDED' : 'UNCONFIRMED_OR_BLOCKED', cost: plan.providerResult?.cost ?? null, automaticRetry: false } : null }, 'PLAN_RECORDED');
}
export async function reviewTask(store, id, { files, tests, criterion, items, maxParallel = 1, maxAttempts = 1, timeoutSeconds = 300, attemptBudgetUsd = 1 }) {
  const current = task(store, id), old = store.readArtifact(current.planRef);
  if (!old.discovery || !old.draft) throw Error('Planning incomplete; create a new plan, no automatic planner replay');
  if (current.state === 'REJECTED') throw Error('Rejected task requires a new plan');
  if (current.runId) {
    const row = store.db.prepare('SELECT owner FROM runs WHERE id=?').get(current.runId);
    if (row.owner || attempts(store, current.runId).length) throw Error('Existing attempts require a new plan; automatic replay forbidden');
  }
  const discovery = await discover(current.repo, old.intent.original);
  if (discovery.base !== old.discovery.base || discovery.dirty) throw Error('Repository changed; create a new plan');
  const draft = { ...old.draft, files, tests, criteria: [{ description: criterion, method: 'protected-tests', tests }], unknowns: [] };
  const plan = await planIntent(current.repo, old.intent.original, { draftInput: JSON.stringify(draft) });
  if (plan.validation?.status !== 'VALIDATED') throw Error(plan.error ?? plan.validation?.status ?? 'Invalid review');
  plan.analysis = old.analysis; plan.review = { authority: 'LOCAL_OPERATOR_SCOPE_REVIEW', priorPlanRef: current.planRef };
  const source = validateContract({ ...compile(plan).alpha, maxAttempts, timeoutSeconds, attemptBudgetUsd });
  const nodes = items ?? [{ id: 'repair', files, tests, dependencies: [], priority: 0, acceptanceCriteria: [criterion] }];
  const enriched = nodes.map(n => ({ ...n, resources: [], roles: { Planner: n.id + '-planner', Architect: n.id + '-architect', Executor: n.id + '-executor', Reviewer: n.id + '-reviewer' } }));
  // Validate the full execution proposal before invalidating the old review.
  hybridDefinition(source, { workflowId: 'objective', base: discovery.base, items: enriched, maxParallel });
  if (current.runId) { revokeWorkflow(store, current.runId, 'scope-review'); store.control(current.runId, 'cancel'); }
  return update(store, current, { ...current, revision: current.revision + 1, planRef: store.artifact(plan), sourceRef: store.artifact(source), items: enriched, settings: { maxParallel, maxAttempts, timeoutSeconds, attemptBudgetUsd }, state: 'VALIDATED', runId: null }, 'TASK_REVIEWED');
}
// Host proposal intake: data only, never approval, evidence or model invocation.
export async function submitTaskDraft(store, id, input) {
  exact(input, ['revision', 'proposal'], 'Host draft');
  const current = task(store, id), old = store.readArtifact(current.planRef);
  if (current.runId || current.state === 'REJECTED' || input.revision !== current.revision)
    throw Error('Draft revision closed or stale; create a new task');
  const context = await readCodeContext(current.repo, old.intent.original);
  if (context.discovery.dirty || context.discovery.base !== old.discovery?.base)
    throw Error('Draft baseline changed');
  const validation = validateSemanticProposal(input.proposal, context, old.intent.original);
  const plan = { ...old, discovery: context.discovery, draft: input.proposal.draft, validation,
    executable: false, providerResult: null,
    analysis: { mode: 'HOST_PROPOSAL', authority: 'PROVIDER_REPORTED_ONLY',
      references: input.proposal.references, inferences: input.proposal.inferences } };
  return update(store, current, { ...current, revision: current.revision + 1,
    planRef: store.artifact(plan), state: validation.status }, 'HOST_DRAFT_VALIDATED');
}
export async function prepareTask(store, id) {
  const current = task(store, id);
  if (current.state === 'REJECTED') throw Error('Task rejected');
  if (['PLANNING', 'BLOCKED'].includes(current.state)) throw Error('Planning incomplete; create a new plan, no automatic planner replay');
  if (current.runId) return current;
  const plan = store.readArtifact(current.planRef), compiled = compile(plan);
  const source = current.sourceRef ? store.readArtifact(current.sourceRef) : compiled.alpha;
  if (hash({ ...source, maxAttempts: 1, timeoutSeconds: 300, attemptBudgetUsd: 1 }) !== hash(compiled.alpha)) throw Error('Reviewed source mismatch');
  const items = current.items ?? [{ id: 'repair', dependencies: [], priority: 0, files: source.files, tests: source.tests, acceptanceCriteria: plan.draft.criteria.map(c => c.description), resources: [], roles: { Planner: 'planner', Architect: 'architect', Executor: 'executor', Reviewer: 'reviewer' } }];
  const workflow = hybridDefinition(source, { workflowId: 'objective', base: plan.discovery.base, items, maxParallel: current.settings.maxParallel });
  // Deterministic id makes a crash between creation and attachment recoverable.
  const run = await createWorkflow(store, current.repo, workflow, source, current.id + '-r' + current.revision);
  return update(store, current, { ...current, revision: current.revision + 1, runId: run.id, state: 'WAITING_APPROVAL' }, 'TASK_WORKFLOW_ATTACHED');
}
export function approveTask(store, id, decision) {
  const current = task(store, id);
  if (!current.runId || current.state === 'REJECTED') throw Error('Prepare a validated task first');
  approveWorkflow(store, current.runId, decision); return current;
}
export function rejectTask(store, id, actor) {
  const current = task(store, id);
  if (!actor?.trim()) throw Error('Explicit actor required');
  if (current.runId) { revokeWorkflow(store, current.runId, actor); store.control(current.runId, 'cancel'); }
  return update(store, current, { ...current, state: 'REJECTED', revision: current.revision + 1 }, 'TASK_REJECTED');
}
