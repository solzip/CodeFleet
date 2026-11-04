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
import { probeRepository, gitStatus } from '../intent/probe.mjs';
import { bootstrapSkeleton, validateBootstrapDraft, existingPaths, draftPaths, objectiveUnknowns } from '../intent/bootstrap.mjs';
import { readFile, realpath } from 'node:fs/promises';
import { bootstrapDefinition, validateBootstrapWorkflow, bootstrapStates, assessBootstrapItem, dependentsOf } from '../workflow/bootstrap.mjs';
import { validateFileset, filesetManifest, createFiles, validateRepairFileset, repairManifest, modifyFiles } from '../workflow/bootstrap-files.mjs';
import { inspectLocalCommand, localBackend, localTree } from '../verification/backends.mjs';
import { bootstrapGuard } from '../hosts/workflow-authorization.mjs';
import { requireCoordinatedWorkItem } from './work-log.mjs';
import { reviewSupervisedProposal } from './continuation.mjs';

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
function update(store, current, next, event, detail = {}) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (store.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=? AND revision=?').run(JSON.stringify(next), next.revision, current.id, current.revision).changes !== 1) throw Error('Task revision conflict');
    store.event(current.id, event, { ...detail, revision: next.revision, planRef: next.planRef, runId: next.runId ?? null });
    store.db.exec('COMMIT'); return next;
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
export async function createTask(store, repo, objective, options = {}) {
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 4000 || objective.includes('\0')) throw Error('Intent requires 1..4000 characters');
  // Creation-only limits; execution still requires approval and reservations.
  const { maxAttempts = 1, timeoutSeconds = 300, attemptBudgetUsd = 1, acceptanceMode = 'PROTECTED_REQUIRED' } = options;
  if (!['PROTECTED_REQUIRED', 'LOCAL_ONLY'].includes(acceptanceMode)) throw Error('Unknown acceptance mode');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw Error('maxAttempts must be 1..5');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 1800) throw Error('timeoutSeconds must be 30..1800');
  if (!Number.isFinite(attemptBudgetUsd) || attemptBudgetUsd <= 0 || attemptBudgetUsd > 10) throw Error('attemptBudgetUsd must be >0 and <=10');
  const original = { kind: 'IntentPlan', intent: { original: objective, authority: 'USER_REQUEST_ONLY' }, executable: false, status: 'PLANNING' };
  const value = { id: 'task-' + randomUUID(), revision: 1, repo: path.resolve(repo), planRef: store.artifact(original), state: 'PLANNING', runId: null, acceptanceMode, settings: { maxParallel: 1, maxAttempts, timeoutSeconds, attemptBudgetUsd }, plannerAttempt: options.registry ? { status: 'RESERVED', cost: null, automaticRetry: false } : null };
  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db.prepare('INSERT INTO product_tasks VALUES (?,?,?)').run(value.id, value.revision, JSON.stringify(value));
    store.event(value.id, 'INTENT_RECORDED', { planRef: value.planRef, revision: 1 }); store.db.exec('COMMIT');
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  let plan;
  try {
    // The trusted probe, never Draft input, chooses the contract.
    const probe = await probeRepository(value.repo);
    if(options.localExisting && probe.contract===null) plan={...original,status:'BLOCKED',probe,error:probe.error?.kind};
    else if (options.localExisting) {
      if(!['UNBORN_HEAD','BOOTSTRAP_CANDIDATE','EXISTING_SOURCE'].includes(probe.state)) throw Error('Existing Local requires a Git repository; no automatic initialization');
      const draft={...bootstrapSkeleton(probe,objective),kind:'ExistingLocalDraft'};
      const files=await localTree(probe.root,[],{excludeGit:true,entries:true});
      plan={kind:'IntentPlan',contractKind:'EXISTING_LOCAL',intent:{original:objective,authority:'USER_REQUEST_ONLY'},probe,draft,
        baseline:{files,status:(await gitStatus(probe.root)).entries},validation:validateBootstrapDraft(draft,probe,objective,[],[],true),
        executable:false,analysis:{mode:'EXISTING_LOCAL_SNAPSHOT',authority:'HOST_OBSERVED_REPOSITORY_STATE'}};
    } else if (probe.contract === 'NEW_PROJECT') plan = bootstrapPlan(probe, objective);
    else if (probe.contract === null) plan = { ...original, status: 'BLOCKED', error: `${probe.state}: ${probe.error?.stderr || probe.error?.kind}`, probe };
    else plan = await semanticPlan(value.repo, objective, options);
  } catch (e) { plan = { ...original, status: 'BLOCKED', error: e.message, providerResult: e.providerResult ?? null }; }
  const plannerAttempt = !value.plannerAttempt ? null : plan.contractKind === 'NEW_PROJECT' ? { status: 'NOT_INVOKED_NEW_PROJECT', cost: null, automaticRetry: false } : { status: plan.providerResult ? 'RESULT_RECORDED' : 'UNCONFIRMED_OR_BLOCKED', cost: plan.providerResult?.cost ?? null, automaticRetry: false };
  return update(store, value, { ...value, revision: 2, planRef: store.artifact(plan), state: plan.validation?.status ?? 'BLOCKED', plannerAttempt }, 'PLAN_RECORDED');
}
function bootstrapPlan(probe, objective) {
  const draft = bootstrapSkeleton(probe, objective);
  return { kind: 'IntentPlan', contractKind: 'NEW_PROJECT', intent: { original: objective, authority: 'USER_REQUEST_ONLY' }, probe, draft,
    validation: validateBootstrapDraft(draft, probe, objective), stages: ['INTENT_RECEIVED', 'PROBED', 'DRAFTED'], executable: false,
    analysis: { mode: 'BOOTSTRAP_SKELETON', authority: 'PLANNED', observations: [] } };
}
const isBootstrap = plan => ['NEW_PROJECT','EXISTING_LOCAL'].includes(plan?.contractKind);
// Bootstrap plans bind the probe; any repository change requires a new task.
async function currentProbe(plan) {
  const probe = await probeRepository(plan.probe.root);
  if (probe.probeHash !== plan.probe.probeHash) throw Error('Repository changed since planning; create a new task');
  if(plan.contractKind==='EXISTING_LOCAL' && hash(await localTree(probe.root,[],{excludeGit:true,entries:true}))!==hash(plan.baseline.files)) throw Error('Existing Local baseline bytes changed');
  return probe;
}
export async function reviewTask(store, id, { files, tests, criterion, items, maxParallel = 1, maxAttempts = 1, timeoutSeconds = 300, attemptBudgetUsd = 1 }) {
  const current = task(store, id), old = store.readArtifact(current.planRef);
  if (isBootstrap(old)) throw Error('NEW_PROJECT scope is reviewed through a BootstrapDraft, not existing files');
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
  if(current.bootstrap){await currentProbe(old);throw Error('Draft revision closed or stale; create a new task');}
  if (isBootstrap(old)) return submitBootstrapDraft(store, current, old, input.proposal);
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
  if (isBootstrap(store.readArtifact(current.planRef))) return prepareBootstrap(store, current);
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
  if (current.bootstrap && current.state !== 'REJECTED') {
    // The digest names one proposed fileset; approval reuses the workflow approval record.
    const runId = Object.values(current.bootstrap.filesets).find(r => store.get(r).contractHash === decision.workflowHash);
    if (!runId) throw Error('No proposed fileset matches the approval hash');
    approveWorkflow(store, runId, decision); return current;
  }
  if (!current.runId || current.state === 'REJECTED') throw Error('Prepare a validated task first');
  approveWorkflow(store, current.runId, decision); return current;
}
export function rejectTask(store, id, actor) {
  const current = task(store, id);
  if (!actor?.trim()) throw Error('Explicit actor required');
  if (current.runId) { revokeWorkflow(store, current.runId, actor); store.control(current.runId, 'cancel'); }
  for (const runId of Object.values(current.bootstrap?.filesets ?? {})) { revokeWorkflow(store, runId, actor); store.db.prepare("UPDATE runs SET control='cancel' WHERE id=?").run(runId); }
  return update(store, current, { ...current, state: 'REJECTED', revision: current.revision + 1 }, 'TASK_REJECTED');
}

// NEW_PROJECT lifecycle. VALIDATED means plan-valid only; files are written only by
// materializeTask after a hash-bound fileset approval, and never become G3 evidence.
// Clarification records are content-addressed artifacts named from the task body.
// A record naming another task, unknown or kind is refused rather than ignored.
function clarificationsFor(store, current) {
  return Object.entries(current.clarifications ?? {}).map(([unknownId, ref]) => {
    const record = store.readArtifact(ref);
    if (record.kind !== 'ObjectiveClarification' || record.taskId !== current.id || record.unknownId !== unknownId || record.grantsExecution !== false) throw Error('Clarification record does not belong to this task');
    return { ...record, ref };
  });
}
async function revalidateBootstrap(store, current, old, draft, clarifications, analysis = old.analysis) {
  const probe = await currentProbe(old);
  const validation = validateBootstrapDraft(draft, probe, old.intent.original, await existingPaths(probe.root, draftPaths(draft)), clarifications, old.contractKind==='EXISTING_LOCAL');
  const plan = { ...old, draft, validation, executable: false, stages: ['INTENT_RECEIVED', 'PROBED', 'DRAFTED', ...(validation.status === 'VALIDATED' ? ['VALIDATED'] : [])], analysis };
  delete plan.workflowPreview;
  // A VALIDATED draft must also form a valid bootstrap DAG.
  if (validation.status === 'VALIDATED') plan.workflowPreview = bootstrapDefinition(plan);
  return plan;
}
async function submitBootstrapDraft(store, current, old, draft) {
  const plan = await revalidateBootstrap(store, current, old, draft, clarificationsFor(store, current), { mode: 'HOST_PROPOSAL', authority: 'PROVIDER_REPORTED_ONLY', observations: [] });
  return update(store, current, { ...current, revision: current.revision + 1, planRef: store.artifact(plan), state: plan.validation.status }, 'BOOTSTRAP_DRAFT_VALIDATED');
}
export function objectiveUnknownsReport(store, id) {
  const current = task(store, id), plan = store.readArtifact(current.planRef);
  if (!isBootstrap(plan)) return { taskId: id, revision: current.revision, contractKind: 'EXISTING_REPOSITORY', unknowns: plan.validation?.unknowns ?? [], clarifiable: [], reason: 'G3 unknowns are resolved by review, never by clarification' };
  // Derived from the objective, not the stored validation, so plans validated by an
  // older runtime still list what an operator may clarify.
  return { taskId: id, revision: current.revision, contractKind: 'NEW_PROJECT', state: current.state, unknowns: plan.validation.unknowns, clarifiable: clarifiableFor(current, plan), clarified: plan.validation.clarified ?? [] };
}
export function clarifiableFor(current, plan) {
  return objectiveUnknowns(plan.intent.original).map(({ id, text, terms }) => ({ id, text, terms, status: current.clarifications?.[id] ? 'CLARIFIED' : 'OPEN' }));
}
// Operator confirmation of what the objective means. It is USER_DECLARED meaning,
// never an approval: filesets still need their own hash-bound approval.
export async function clarifyTask(store, id, { unknownId, actor, scope, revision }) {
  const current = task(store, id), plan = store.readArtifact(current.planRef);
  if (!isBootstrap(plan)) throw Error('Objective clarification applies only to NEW_PROJECT tasks; G3 unknowns are unchanged');
  if (current.state === 'REJECTED' || current.bootstrap) throw Error('Clarification is closed once the task is prepared or rejected');
  if (revision !== current.revision) throw Error('Clarification revision stale; read unknowns first');
  if (typeof actor !== 'string' || !actor.trim() || actor.length > 200) throw Error('Explicit actor required');
  if (typeof scope !== 'string' || !scope.trim() || scope.length > 4000) throw Error('Explicit scope statement of 1..4000 characters required');
  const subject = objectiveUnknowns(plan.intent.original).find(u => u.id === unknownId);
  if (!subject) throw Error(`No clarifiable unknown: ${String(unknownId)}`);
  if (current.clarifications?.[unknownId]) throw Error(`Already clarified: ${unknownId}`);
  const record = { kind: 'ObjectiveClarification', schemaVersion: 1, taskId: id, unknownId, unknownText: subject.text, terms: subject.terms,
    objectiveHash: subject.objectiveHash, subjectHash: subject.subjectHash, actor, scope, authority: 'USER_DECLARED', grantsExecution: false, recordedAt: new Date().toISOString() };
  const ref = store.artifact(record);
  const next = { ...current, revision: current.revision + 1, clarifications: { ...(current.clarifications ?? {}), [unknownId]: ref } };
  const revised = await revalidateBootstrap(store, current, plan, plan.draft, clarificationsFor(store, next));
  return update(store, current, { ...next, planRef: store.artifact(revised), state: revised.validation.status }, 'OBJECTIVE_CLARIFIED', { unknownId, actor, clarificationRef: ref });
}
async function prepareBootstrap(store, current) {
  if (current.bootstrap) return current;
  const plan = store.readArtifact(current.planRef);
  if (plan.validation?.status !== 'VALIDATED') throw Error(plan.validation?.status ?? 'BLOCKED');
  // Recheck stored clarifications too: a stale or swapped record reopens the unknown.
  const recheck = await revalidateBootstrap(store, current, plan, plan.draft, clarificationsFor(store, current));
  if (recheck.validation.status !== 'VALIDATED') throw Error(recheck.validation.status);
  const workflow = bootstrapDefinition(plan);
  return update(store, current, { ...current, revision: current.revision + 1, state: 'BOOTSTRAP_PREPARED',
    bootstrap: { workflowRef: store.artifact(workflow), workflowHash: workflow.workflowHash, states: bootstrapStates(workflow), filesets: {}, ...(plan.baseline ? {digests:Object.fromEntries(plan.baseline.files.map(([p,,sha])=>[p,sha]))}: {}) } }, 'BOOTSTRAP_WORKFLOW_PREPARED');
}
export function bootstrapContext(store, id) {
  const current = task(store, id), plan = store.readArtifact(current.planRef);
  if (!isBootstrap(plan) || !current.bootstrap || current.state === 'REJECTED') throw Error('Prepare a validated NEW_PROJECT task first');
  const workflow = validateBootstrapWorkflow(store.readArtifact(current.bootstrap.workflowRef), plan.draft);
  if (workflow.workflowHash !== current.bootstrap.workflowHash) throw Error('Bootstrap workflow integrity mismatch');
  contractRevisionHistory(store, current);
  return { current, plan, workflow };
}
// Semantic revisions use immutable artifacts and the existing task event stream.
// Historical results never become a pass under a different Workflow hash.
export function contractRevisionHistory(store, current) {
  const refs = current.bootstrap?.contractHistory ?? [];
  if (!Array.isArray(refs) || refs.length > 32 || new Set(refs).size !== refs.length ||
      (current.contractRevision ?? 1) !== refs.length + 1) throw Error('Contract revision history mismatch');
  const records = refs.map((ref, i) => {
    const receipt = store.readArtifact(ref), before = store.readArtifact(receipt.previousTaskRef);
    const packet = store.readArtifact(receipt.reviewRef), review = packet.review;
    const plan = store.readArtifact(receipt.planRef), workflow = validateBootstrapWorkflow(store.readArtifact(receipt.workflowRef), plan.draft);
    if (receipt.kind !== 'ContractRevisionReceipt' || receipt.taskId !== current.id || before.id !== current.id ||
        receipt.contractRevision !== i + 2 || (before.contractRevision ?? 1) !== i + 1 ||
        hash(before.bootstrap.contractHistory ?? []) !== hash(refs.slice(0, i)) ||
        packet.kind !== 'ContractRevisionReviewPacket' || receipt.reviewHash !== hash(review) ||
        review.taskHash !== hash(before) || review.toContractRevision !== receipt.contractRevision ||
        review.workflowHash !== before.bootstrap.workflowHash || review.nextWorkflowHash !== workflow.workflowHash ||
        hash(review.draft) !== hash(plan.draft) || hash(receipt.impact) !== hash(review.impact) ||
        !store.events(current.id).some(e => e.type === 'CONTRACT_REVISION_APPLIED' && e.body.receiptRef === ref &&
          e.body.revision === before.revision + 1 && e.body.planRef === receipt.planRef)) throw Error('Contract revision provenance invalid');
    return { ref, receipt, before, plan, workflow };
  });
  if (records.length && (records.at(-1).receipt.workflowRef !== current.bootstrap.workflowRef ||
      records.at(-1).receipt.planRef !== current.planRef)) throw Error('Current contract detached from revision history');
  return records;
}
export function archivedContractEvidence(store, current, itemId, evidenceRef, checkpoint = false) {
  const records = contractRevisionHistory(store, current);
  const start = records.findIndex(r => r.before.bootstrap.verifications?.[itemId] === evidenceRef);
  if (start < 0) return false;
  if (!checkpoint) return true; // reservation history only; full Evidence integrity is still checked by its caller
  const evidence = store.readArtifact(evidenceRef), first = records[start];
  if (!evidence.reservation || evidence.status !== 'LOCAL_PASSED' || evidence.authority !== 'LOCAL_EXECUTED' ||
      evidence.workflowHash !== first.before.bootstrap.workflowHash ||
      records.slice(start).some(r => r.receipt.impact.affected.includes(itemId))) return false;
  const workflow = records.at(-1).workflow, needed = new Set();
  const visit = id => { if (needed.has(id)) return; needed.add(id); workflow.items.find(n => n.id === id)?.dependencies.forEach(visit); };
  visit(itemId);
  const paths = workflow.items.filter(n => needed.has(n.id)).flatMap(n => n.files);
  // A later contract may add a test for another criterion. Historical evidence
  // must remain a dependency checkpoint for this unaffected WorkItem only.
  paths.push(...store.readArtifact(first.before.planRef).draft.plannedTests.map(t => t.path));
  const digests = recordedDigests(store, current);
  return paths.every(p => evidence.fileDigests?.[p] && evidence.fileDigests[p] === digests[p]);
}
function filesetSummary(run) {
  return { runId: run.id, operation: run.operation ?? 'create', state: run.control === 'cancel' ? 'SUPERSEDED_OR_CANCELLED' : run.state, filesetHash: run.contractHash, files: run.contract.files, results: run.results ?? {}, repairOf: run.contract.repairOf ?? null };
}
const isRepair = run => run.operation === 'modify';
const sorted = map => Object.fromEntries(Object.entries(map ?? {}).sort(([a], [b]) => a < b ? -1 : 1));
// What CodeFleet last wrote or observed for each owned path. Tasks recorded before
// repairs existed carry no map; it is then derived from their completed filesets.
export function recordedDigests(store, current) {
  if (current.bootstrap.digests) return { ...current.bootstrap.digests };
  const digests = {};
  for (const runId of Object.values(current.bootstrap.filesets)) {
    const run = store.get(runId);
    if (run.state !== 'COMPLETED' || isRepair(run)) continue;
    for (const r of Object.values(run.results ?? {})) if (['CREATED', 'ALREADY_CREATED'].includes(r.status)) digests[r.path] = r.sha256;
  }
  return digests;
}
// Owned paths are the planned files of every item that has had a fileset; a
// repair proposes a subset of them but owns them all.
function ownedPaths(current, workflow) {
  return new Set(workflow.items.filter(n => current.bootstrap.filesets[n.id] || current.bootstrap.revisionReopen?.[n.id]).flatMap(n => n.files));
}
// Recorded paths whose bytes on disk differ from what CodeFleet recorded.
async function observedDrift(root, digests) {
  const drift = [];
  for (const [p, sha] of Object.entries(digests)) {
    try { if (hash(await readFile(path.join(root, ...p.split('/')))) !== sha) drift.push(p); } catch { drift.push(p); }
  }
  return drift.sort();
}
// Historical admission only: a downstream source fileset already crossed this
// dependency while its Evidence was current. Never a pass for the new candidate.
function retainedCheckpoint(store, current, workflow, node, ref, evidence, digests) {
  if (!evidence.reservation || evidence.status !== 'LOCAL_PASSED' || evidence.authority !== 'LOCAL_EXECUTED' ||
      !Object.keys(evidence.fileDigests ?? {}).length ||
      Object.entries(evidence.fileDigests).some(([p, sha]) => digests[p] !== sha)) return false;
  const added = Object.keys(digests).filter(p => !Object.hasOwn(evidence.fileDigests, p));
  if (!added.length || added.some(p => !/^src\/.+\.mjs$/.test(p))) return false;
  return added.every(p => {
    const owner = workflow.items.find(i => i.files.includes(p));
    if (!owner?.dependencies.includes(node.id) || current.bootstrap.states[owner.id] !== 'MATERIALIZED') return false;
    try {
      const run = store.get(current.bootstrap.filesets[owner.id]);
      const written = store.readArtifact(run.materializationRef);
      return !isRepair(run) && run.state === 'COMPLETED' && run.control !== 'cancel' && hash(run.contract) === run.contractHash &&
        run.contract.taskId === current.id && run.contract.workflowHash === workflow.workflowHash &&
        written.authority === 'CODEFLEET_DIRECT_WRITE' && written.filesetHash === run.contractHash && written.status === 'MATERIALIZED' &&
        written.operation === 'create' && written.dependencyEvidence?.[node.id] === ref &&
        run.contract.files.every(f => added.includes(f.path) && f.sha256 === digests[f.path] &&
          written.results.some(r => r.path === f.path && r.sha256 === f.sha256 && ['CREATED', 'ALREADY_CREATED'].includes(r.status)));
    } catch { return false; }
  });
}
// Stored states plus what evidence can no longer support: a local result is
// current only for the exact recorded digests it ran against and while the disk
// still holds them. Anything else is VERIFICATION_STALE, never a reused pass.
export function effectiveStates(store, current, workflow, { drift = [] } = {}) {
  const states = { ...current.bootstrap.states }, digests = recordedDigests(store, current);
  for (const n of workflow.items.filter(n => n.kind === 'local-verification')) {
    if (states[n.id] === 'BLOCKED') states[n.id] = 'PENDING_VERIFICATION';
    const ref = current.bootstrap.verifications?.[n.id];
    if (!ref || !['LOCAL_PASSED', 'LOCAL_FAILED', 'INCONCLUSIVE'].includes(states[n.id])) continue;
    let evidence;
    try { evidence = store.readArtifact(ref); } catch { states[n.id] = 'EVIDENCE_INVALID'; continue; }
    if (evidence.kind !== 'BootstrapLocalVerification' || evidence.taskId !== current.id || evidence.itemId !== n.id || evidence.status !== states[n.id]) { states[n.id] = 'EVIDENCE_INVALID'; continue; }
    const checkpoint = evidence.workflowHash !== current.bootstrap.workflowHash &&
      archivedContractEvidence(store, current, n.id, ref, true);
    if (evidence.reservation) {
      const row = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE requestId=?').get(evidence.reservation.requestId);
      const reserved = row ? JSON.parse(row.body) : null;
      if (!reserved || reserved.result?.evidenceRef !== ref || hash(reserved.identity) !== hash(evidence.reservation) ||
          reserved.revision !== evidence.taskRevision || reserved.state !== evidence.status ||
          (evidence.workflowHash !== current.bootstrap.workflowHash && !checkpoint) || reserved.commandHash !== evidence.command?.commandHash ||
          evidence.complete !== false || evidence.verifierIndependence !== 'UNPROTECTED') { states[n.id] = 'EVIDENCE_INVALID'; continue; }
    } else if (store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_decisions'").get() &&
      store.db.prepare('SELECT 1 FROM bootstrap_decisions WHERE taskId=?').get(current.id)) { states[n.id] = 'EVIDENCE_INVALID'; continue; }
    if (checkpoint) { states[n.id] = drift.length ? 'VERIFICATION_STALE' : 'LOCAL_CHECKPOINT'; continue; }
    if (hash(sorted(evidence.fileDigests)) !== hash(sorted(digests)) || drift.some(p => Object.hasOwn(evidence.fileDigests, p))) {
      states[n.id] = !drift.length && retainedCheckpoint(store, current, workflow, n, ref, evidence, digests)
        ? 'LOCAL_CHECKPOINT' : 'VERIFICATION_STALE';
    }
  }
  return states;
}
function assessCurrentItem(store, current, workflow, states, itemId) {
  // A same-contract historical checkpoint only explains an already completed
  // dependency crossing. Explicit revision preservation is separately checked.
  const admittedCheckpoints = workflow.items.filter(n => states[n.id] === 'LOCAL_CHECKPOINT' &&
    archivedContractEvidence(store, current, n.id, current.bootstrap.verifications?.[n.id], true)).map(n => n.id);
  return assessBootstrapItem(workflow, states, itemId, { admittedCheckpoints });
}
export function bootstrapView(store, id, { drift = [] } = {}) {
  const { current, workflow } = bootstrapContext(store, id);
  const states = effectiveStates(store, current, workflow, { drift });
  return { workflowHash: workflow.workflowHash, policySnapshotRef: workflow.policySnapshotRef, authority: 'PLAN_ONLY', executable: false,
    recordedDigests: sorted(recordedDigests(store, current)), drift,
    items: workflow.items.map(n => ({ ...assessCurrentItem(store, current, workflow, states, n.id),
      fileset: current.bootstrap.filesets[n.id] ? filesetSummary(store.get(current.bootstrap.filesets[n.id])) : null,
      verificationRef: n.kind === 'local-verification' ? current.bootstrap.verifications?.[n.id] ?? null : undefined })) };
}
export async function bootstrapDrift(store, id) {
  const { current, plan } = bootstrapContext(store, id);
  return observedDrift(plan.probe.root, recordedDigests(store, current));
}
// Execution preflight shared by materialize and verify: same repository and
// baseline as planned, Git present, and no change outside the owned paths.
async function repositoryPreflight(current, plan, workflow) {
  const probe = await probeRepository(plan.probe.root);
  if (probe.state === 'NOT_GIT') throw Error('BLOCKED_GIT_REPOSITORY_REQUIRED: run git init yourself, then create a new task');
  if (plan.contractKind!=='EXISTING_LOCAL' && (!['UNBORN_HEAD', 'BOOTSTRAP_CANDIDATE'].includes(probe.state) || probe.repositoryId !== plan.probe.repositoryId || probe.base !== plan.probe.base)) throw Error('Repository baseline changed; create a new task');
  if(plan.contractKind==='EXISTING_LOCAL') {
    if(!['UNBORN_HEAD','BOOTSTRAP_CANDIDATE','EXISTING_SOURCE'].includes(probe.state)||probe.repositoryId!==plan.probe.repositoryId||probe.base!==plan.probe.base) throw Error('Existing Local repository baseline changed');
    const recorded=recordedDigests(null,current), baseline=new Map(plan.baseline.files.map(([p,mode])=>[p,mode]));
    const actual=await localTree(probe.root,[],{excludeGit:true,entries:true});
    if(actual.length!==Object.keys(recorded).length || actual.some(([p,mode,sha])=>recorded[p]!==sha || (baseline.has(p)&&baseline.get(p)!==mode))) throw Error('Existing Local candidate changed outside approved filesets');
    const owned=ownedPaths(current,workflow),status=await gitStatus(probe.root);
    if(status.error||hash(status.entries.filter(e=>!owned.has(e.path)))!==hash(plan.baseline.status.filter(e=>!owned.has(e.path)))) throw Error('Existing Local uncommitted baseline changed');
    return probe;
  }
  const owned = ownedPaths(current, workflow);
  const status = await gitStatus(probe.root);
  if (status.error || hash(status.entries.filter(e => !owned.has(e.path))) !== plan.probe.statusHash) throw Error('Repository changed outside the approved filesets; create a new task');
  return probe;
}
// Host file contents are untrusted proposals; this records them and requests review.
export async function submitBootstrapFiles(store, id, input, { supervisedProposalRef = null } = {}) {
  const supervised = supervisedProposalRef ? await reviewSupervisedProposal(store, id, supervisedProposalRef) : null;
  if (supervised && hash(input) !== hash(supervised.input)) throw Error('Supervised Fileset differs from reviewed proposal');
  requireCoordinatedWorkItem(store, id, input?.itemId, { preparedProposalItem: supervised?.input.itemId });
  const { current, plan, workflow } = bootstrapContext(store, id);
  if (input?.revision !== current.revision) throw Error('Fileset revision stale; read status first');
  if (input && Object.hasOwn(input, 'repair')) return submitRepairFiles(store, current, plan, workflow, input);
  const existing=plan.contractKind==='EXISTING_LOCAL';
  let files;
  if(existing) {
    exact(input,['revision','itemId','files'],'Existing Local fileset');
    if(!Array.isArray(input.files))throw Error('Files required');
    for(const f of input.files) {
      exact(f,['path','content','baseSha256'],'Existing Local replacement');
      if(f.baseSha256!==(recordedDigests(store,current)[f.path]??null))throw Error('Existing source base or scope mismatch');
    }
    files=validateFileset({...input,files:input.files.map(({path,content})=>({path,content}))},workflow,input.itemId)
      .map(f=>({...f,baseSha256:input.files.find(x=>x.path===f.path).baseSha256}));
    if(files.some(f=>f.baseSha256===null)&&files.some(f=>f.baseSha256!==null))throw Error('Use separate WorkItems for creation and replacement');
    if(files.every(f=>f.sha256===f.baseSha256))throw Error('No-op existing fileset');
    await repositoryPreflight(current,plan,workflow);
    if(assessCurrentItem(store,current,workflow,effectiveStates(store,current,workflow),input.itemId).waitingOn.length)throw Error('Dependencies not satisfied');
  } else files=validateFileset(input,workflow,input.itemId);
  const itemId=input.itemId;
  if (!['PENDING_FILESET', 'FILESET_PROPOSED'].includes(current.bootstrap.states[itemId])) throw Error(`WorkItem ${itemId} is not awaiting a fileset`);
  const prior = current.bootstrap.filesets[itemId];
  if (prior && !['WAITING_APPROVAL', 'READY'].includes(store.get(prior).state)) throw Error('Materialization already started; resolve it before proposing again');
  const replacing=existing&&files.every(f=>f.baseSha256!==null);
  const { manifest, filesetHash } = (replacing ? repairManifest : filesetManifest)({ ...(existing?{kind:'ExistingLocalFileset',purpose:'EXISTING_LOCAL_DEVELOPMENT'}:{}), taskId: id, itemId, workflowHash: workflow.workflowHash, probeRef: plan.probe.probeHash, root: plan.probe.root }, files);
  const run = { id: `${id}-${itemId}-r${current.revision}`, kind: 'bootstrap-fileset', ...(replacing?{operation:'modify'}:{}), taskId: id, itemId, repo: plan.probe.root, contract: manifest, contractHash: filesetHash,
    ...(supervised ? {supervisedProposal: {proposalRef: supervisedProposalRef, packetRef: supervised.packetRef, contractRevision: supervised.contractRevision,
      candidateHash: supervised.binding.candidateHash, authority: 'PROVIDER_REPORTED_ONLY', executionGranted: false}} : {}),
    contentRef: store.artifact({ manifest, files }), revision: 1, state: 'WAITING_APPROVAL', results: {}, authority: 'PROVIDER_REPORTED_ONLY' };
  store.enableWorkflows();
  if (supervised && (hash(task(store,id)) !== supervised.binding.taskHash ||
      hash(store.events(id)) !== supervised.workLogHash || await localTree(current.repo) !== supervised.binding.candidateHash))
    throw Error('Supervised proposal changed before registration');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (supervised && (hash(task(store,id)) !== supervised.binding.taskHash || hash(store.events(id)) !== supervised.workLogHash))
      throw Error('Supervised proposal changed before registration');
    if (prior) {
      store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(prior);
      store.db.prepare("UPDATE runs SET control='cancel' WHERE id=?").run(prior);
      store.event(prior, 'BOOTSTRAP_FILESET_SUPERSEDED', { by: run.id });
    }
    store.db.prepare('INSERT INTO runs(id,body) VALUES (?,?)').run(run.id, JSON.stringify(run));
    store.event(run.id, 'BOOTSTRAP_FILESET_PROPOSED', { filesetHash, itemId }); store.db.exec('COMMIT');
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  const next = update(store, current, { ...current, revision: current.revision + 1, bootstrap: { ...current.bootstrap,
    states: { ...current.bootstrap.states, [itemId]: 'FILESET_PROPOSED' }, filesets: { ...current.bootstrap.filesets, [itemId]: run.id } } }, 'BOOTSTRAP_FILESET_RECORDED');
  return { task: next, approvalRequest: { taskId: id, itemId, runId: run.id, filesetHash, files: manifest.files, authority: 'REQUEST_ONLY' } };
}
// The explicit Repair transition. Only a materialized local-edit item that a
// local-verification item depends on can reopen, only against that item's latest,
// still-current LOCAL_FAILED evidence, and only for its own files. Other completed
// items stay closed; a cross-item repair is one repair fileset per owning item.
async function submitRepairFiles(store, current, plan, workflow, input) {
  const itemId = input.itemId, item = workflow.items.find(n => n.id === itemId);
  if (!item || item.kind !== 'local-edit') throw Error('Filesets are accepted only for local-edit WorkItems');
  const states = effectiveStates(store, current, workflow);
  if (!['MATERIALIZED', 'REPAIR_PROPOSED'].includes(states[itemId])) throw Error(`WorkItem ${itemId} is not materialized; a repair replaces files CodeFleet created`);
  const { verificationItem, evidenceRef } = input.repair ?? {};
  const verifier = workflow.items.find(n => n.id === verificationItem);
  if (!verifier || verifier.kind !== 'local-verification' || !dependentsOf(workflow, itemId).includes(verificationItem)) throw Error(`Repair must cite a local-verification item that depends on ${itemId}`);
  if (current.bootstrap.verifications?.[verificationItem] !== evidenceRef || states[verificationItem] !== 'LOCAL_FAILED') throw Error(`Repair requires the current LOCAL_FAILED evidence of ${verificationItem}`);
  const files = validateRepairFileset(input, workflow, itemId, recordedDigests(store, current));
  const prior = current.bootstrap.filesets[itemId], priorRun = store.get(prior);
  const replacing = isRepair(priorRun) && ['WAITING_APPROVAL', 'READY'].includes(priorRun.state);
  if (isRepair(priorRun) && !replacing && priorRun.state !== 'COMPLETED') throw Error('Repair materialization already started; resolve it before proposing again');
  const { manifest, filesetHash } = repairManifest({ taskId: current.id, itemId, workflowHash: workflow.workflowHash, probeRef: plan.probe.probeHash, root: plan.probe.root, repairOf: { verificationItem, evidenceRef } }, files);
  const run = { id: `${current.id}-${itemId}-r${current.revision}`, kind: 'bootstrap-fileset', operation: 'modify', taskId: current.id, itemId, repo: plan.probe.root, contract: manifest, contractHash: filesetHash,
    contentRef: store.artifact({ manifest, files }), revision: 1, state: 'WAITING_APPROVAL', results: {}, authority: 'PROVIDER_REPORTED_ONLY' };
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (replacing) {
      store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(prior);
      store.db.prepare("UPDATE runs SET control='cancel' WHERE id=?").run(prior);
      store.event(prior, 'BOOTSTRAP_FILESET_SUPERSEDED', { by: run.id });
    }
    store.db.prepare('INSERT INTO runs(id,body) VALUES (?,?)').run(run.id, JSON.stringify(run));
    store.event(run.id, 'BOOTSTRAP_REPAIR_PROPOSED', { filesetHash, itemId, verificationItem, evidenceRef }); store.db.exec('COMMIT');
  } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  // Completed filesets stay on record; only the current one is approvable.
  const history = replacing ? current.bootstrap.history ?? [] : [...(current.bootstrap.history ?? []), { itemId, runId: prior, state: priorRun.state }];
  const next = update(store, current, { ...current, revision: current.revision + 1, bootstrap: { ...current.bootstrap, digests: recordedDigests(store, current), history,
    states: { ...current.bootstrap.states, [itemId]: 'REPAIR_PROPOSED' }, filesets: { ...current.bootstrap.filesets, [itemId]: run.id } } }, 'BOOTSTRAP_REPAIR_RECORDED', { itemId, verificationItem, evidenceRef });
  return { task: next, approvalRequest: { taskId: current.id, itemId, runId: run.id, operation: 'modify', filesetHash, files: manifest.files, repairOf: manifest.repairOf, authority: 'REQUEST_ONLY' } };
}
const OUTCOMES = { MATERIALIZED: ['COMPLETED', 'MATERIALIZED'], CONFLICT: ['WAITING_HUMAN', 'CONFLICT'], FAILED: ['WAITING_HUMAN', 'MATERIALIZATION_FAILED'], INTERRUPTED: ['WAITING_HUMAN', 'INTERRUPTED'] };
export async function materializeTask(store, id, itemId, { now = Date.now(), guard, hooks = {}, cancelled = () => false, freshOnly = false } = {}) {
  requireCoordinatedWorkItem(store, id, itemId);
  const { current, plan, workflow } = bootstrapContext(store, id);
  const runId = current.bootstrap.filesets[itemId];
  if (!runId) throw Error(`No fileset proposed for ${itemId}`);
  let run = store.get(runId);
  const operator = bootstrapGuard(store, id);
  operator?.checkFileset(run);
  if (run.control === 'cancel' || !['READY', 'MATERIALIZING', 'WAITING_HUMAN'].includes(run.state)) throw Error(`Fileset is ${run.state}; approval required or already terminal`);
  if ((freshOnly || operator) && (run.state !== 'READY' || run.operatorConsumption || Object.keys(run.results ?? {}).length)) throw Error('RECONCILE: repair already started; no automatic replay');
  const approval = store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=? AND revision=?').get(runId, run.revision);
  if (!approval || approval.digest !== run.contractHash || approval.expires <= now || hash(run.contract) !== run.contractHash) throw Error('Fileset approval absent, expired or invalid');
  const content = store.readArtifact(run.contentRef);
  if (hash(content.manifest) !== run.contractHash || content.files.length !== run.contract.files.length ||
      content.files.some((f, i) => f.path !== run.contract.files[i].path || hash(f.content) !== run.contract.files[i].sha256)) throw Error('Approved fileset content mismatch');
  const repair = isRepair(run);
  const drift = repair && plan.contractKind!=='EXISTING_LOCAL' ? [] : await observedDrift(plan.probe.root, recordedDigests(store, current));
  if (drift.length) throw Error('Dependency candidate changed before materialization');
  const statesBefore = effectiveStates(store, current, workflow, { drift });
  const assessment = assessCurrentItem(store, current, workflow, statesBefore, itemId);
  if (assessment.waitingOn.length) throw Error(`Dependencies not satisfied: ${assessment.waitingOn.join(', ')}`);
  const dependencyEvidence = Object.fromEntries(assessment.dependencies.filter(d => statesBefore[d] === 'LOCAL_PASSED')
    .map(d => [d, current.bootstrap.verifications[d]]));
  const probe = await repositoryPreflight(current, plan, workflow);
  const owner = store.claim(runId);
  const fence = () => {
    requireCoordinatedWorkItem(store, id, itemId);
    const lease = store.db.prepare('SELECT owner,leaseUntil,control FROM runs WHERE id=?').get(runId);
    const live = store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=? AND revision=?').get(runId, run.revision);
    if (cancelled() || lease.owner !== owner || lease.leaseUntil <= Date.now() || lease.control !== 'run') throw Error('RECONCILE: repair lease or cancellation changed');
    if (!live || live.digest !== run.contractHash || live.expires <= Date.now()) throw Error('AWAIT_APPROVAL: repair approval expired or revoked');
    if (task(store, id).revision !== current.revision) throw Error('RECONCILE: repair task revision changed');
    operator?.checkFileset(store.get(runId));
    guard?.();
  };
  try {
    await hooks.claimed?.({ runId, owner }); fence();
    run = store.get(runId); run.state = 'MATERIALIZING';
    if (operator) run.operatorConsumption = { requestId: run.operatorAuthorization.envelope.decision.id, owner, at: Date.now() };
    store.save(run, owner, 'BOOTSTRAP_MATERIALIZATION_STARTED', fence);
    const write = repair ? modifyFiles : createFiles;
    const outcome = await write(probe.root, content.files, { cancelled, beforeWrite: fence, record: r => { run.results = { ...run.results, [r.path]: r }; store.save(run, owner, 'BOOTSTRAP_FILE_RESULT', fence); } });
    if (!repair && (await observedDrift(plan.probe.root, recordedDigests(store, current))).length) throw Error('RECONCILE: dependency candidate changed during materialization');
    for (const r of outcome.results) run.results = { ...run.results, [r.path]: r };
    const [runState, outcomeState] = OUTCOMES[outcome.status];
    const itemState = repair && outcome.status !== 'MATERIALIZED' ? 'REPAIR_' + outcomeState : outcomeState;
    run.materializationRef = store.artifact({ kind: 'BootstrapMaterialization', operation: repair ? 'modify' : 'create', authority: 'CODEFLEET_DIRECT_WRITE', filesetHash: run.contractHash, probeBefore: probe.probeHash,
      status: outcome.status, results: outcome.results, dependencyEvidence, verification: 'NOT_RUN', complete: false });
    await hooks.beforeCommit?.({ runId, owner }); fence();
    run.state = runState; run.reason = outcome.status; store.save(run, owner, 'BOOTSTRAP_MATERIALIZATION_' + outcome.status, fence);
    const latest = task(store, id);
    // Record what this process wrote, then invalidate every local result that ran
    // against the previous bytes: changed files need a new trusted verification.
    const digests = recordedDigests(store, latest);
    for (const r of outcome.results) if (['CREATED', 'ALREADY_CREATED', 'MODIFIED', 'ALREADY_MODIFIED'].includes(r.status)) digests[r.path] = r.sha256;
    const states = { ...latest.bootstrap.states, [itemId]: itemState }, stale = [];
    if (outcome.written || outcome.status === 'MATERIALIZED') for (const d of dependentsOf(workflow, itemId)) {
      const node = workflow.items.find(n => n.id === d);
      if (node.kind === 'local-verification' && ['LOCAL_PASSED', 'LOCAL_FAILED', 'INCONCLUSIVE'].includes(states[d])) { states[d] = 'VERIFICATION_STALE'; stale.push(d); }
    }
    update(store, latest, { ...latest, revision: latest.revision + 1, bootstrap: { ...latest.bootstrap, digests: sorted(digests), states } }, 'BOOTSTRAP_ITEM_' + itemState, { itemId, staleVerifications: stale });
    return { status: outcome.status, itemId, runId, operation: repair ? 'modify' : 'create', results: outcome.results, materializationRef: run.materializationRef, staleVerifications: stale, authority: 'CODEFLEET_DIRECT_WRITE', verification: 'NOT_RUN', complete: false };
  } finally { store.release(runId, owner); }
}
// Run one local-verification item through the existing local backend. Without
// trust this only inspects and returns the exact commandHash to review. The hash
// covers executable bytes, arguments and the whole tree, so a trust given before
// any file changed can never authorize a run against the changed files.
export async function verifyTask(store, id, itemId, request, { trust, acknowledgeUnisolated = false, cancelled = () => false, backend = localBackend() } = {}) {
  requireCoordinatedWorkItem(store, id, itemId);
  if (trust !== undefined && store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_decisions'").get() &&
      store.db.prepare('SELECT 1 FROM bootstrap_decisions WHERE taskId=?').get(id)) throw Error('Durable decision required for this task; command hash is not an execution grant');
  const { current, plan, workflow } = bootstrapContext(store, id);
  const item = workflow.items.find(n => n.id === itemId);
  if (!item) throw Error(`Unknown WorkItem: ${itemId}`);
  if (item.kind !== 'local-verification') throw Error(`objective verify runs only local-verification WorkItems; ${item.kind} is not local verification`);
  exact(request, ['executable', 'args', 'directory', 'timeoutMs'], 'Local command');
  const assessment = assessCurrentItem(store, current, workflow, effectiveStates(store, current, workflow), itemId);
  if (assessment.waitingOn.length) throw Error(`Dependencies not satisfied: ${assessment.waitingOn.join(', ')}`);
  if (typeof request.directory !== 'string' || await realpath(request.directory) !== plan.probe.root) throw Error('Verification directory must be the task repository root');
  await repositoryPreflight(current, plan, workflow);
  const digests = recordedDigests(store, current), drift = await observedDrift(plan.probe.root, digests);
  if (drift.length) throw Error(`Files changed outside CodeFleet: ${drift.join(', ')}`);
  const spec = await inspectLocalCommand(request);
  if (trust === undefined) return { status: 'TRUST_REQUIRED', itemId, commandHash: spec.commandHash, command: spec, fileDigests: sorted(digests),
    reason: 'Review the exact executable, arguments and tree, then pass --trust <commandHash> --acknowledge-unisolated' };
  const token = await backend.authorize(request, { reviewedCommandHash: trust, acknowledgeUnisolatedExecution: acknowledgeUnisolated });
  requireCoordinatedWorkItem(store, id, itemId);
  const result = await backend.verify({ ...request, token, contractHash: workflow.workflowHash,
    beforeSpawn: () => requireCoordinatedWorkItem(store, id, itemId),
    cancelled: () => { try { requireCoordinatedWorkItem(store, id, itemId); return cancelled(); } catch { return true; } } });
  const { log, stderr, status, reason, ...observed } = result;
  const evidence = { kind: 'BootstrapLocalVerification', schemaVersion: 1, taskId: id, itemId, workflowHash: workflow.workflowHash, taskRevision: current.revision,
    fileDigests: sorted(digests), command: spec, status, reason, observed, log, stderr,
    authority: 'LOCAL_EXECUTED', verifierIndependence: 'UNPROTECTED', protectedVerification: 'UNSATISFIED', complete: false, recordedAt: new Date().toISOString() };
  const evidenceRef = store.artifact(evidence);
  try {
    requireCoordinatedWorkItem(store, id, itemId);
    update(store, current, { ...current, revision: current.revision + 1, bootstrap: { ...current.bootstrap, digests: sorted(digests),
      states: { ...current.bootstrap.states, [itemId]: status }, verifications: { ...(current.bootstrap.verifications ?? {}), [itemId]: evidenceRef } } },
    'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED', { itemId, status, evidenceRef, commandHash: spec.commandHash });
  } catch (e) { throw Error(`${e.message}; the executed result is preserved as evidence ${evidenceRef} but is not attached to the task`); }
  return { status, reason, itemId, evidenceRef, commandHash: spec.commandHash, exitCode: result.exitCode, tests: result.tests, passed: result.passed, failed: result.failed, skipped: result.skipped,
    evidenceIntegrity: result.evidenceIntegrity, authority: 'LOCAL_EXECUTED', protectedVerification: 'UNSATISFIED', complete: false };
}
