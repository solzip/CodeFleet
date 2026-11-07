// Promote an independently reviewed, persisted Host planning result into a
// pending-approval Workflow. This does NOT authorize execution, reserve any
// Attempt or trust model-supplied approval claims.
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { repository } from '../alpha/workspace.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';
import { createWorkflow, approval as requireWorkflowApproval } from '../workflow/persistence.mjs';

function fail(reason) { throw Error('Reviewed Codex plan: ' + reason); }
function planRow(store, sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(sessionId))
    fail('A real bound planning session ID is required');
  const row=store.db.prepare('SELECT status,body,digest,result,resultHash FROM host_planning WHERE id=?')
    .get(sessionId);
  if (!row || row.status !== 'SUBMITTED' || typeof row.body !== 'string' ||
      hash(row.body) !== row.digest || typeof row.result !== 'string' ||
      hash(row.result) !== row.resultHash) fail('Persisted valid planning outcome unavailable');
  const body=JSON.parse(row.body),result=JSON.parse(row.result);
  if (body.sessionId !== sessionId || result?.kind !== 'HostPlanningResult' ||
      result?.status !== 'VALIDATED' || result?.approved !== false ||
      result?.executable !== false || result?.complete !== false ||
      result?.authority !== 'PROVIDER_REPORTED_ONLY' ||
      result?.evidence?.sessionId !== sessionId ||
      result?.evidence?.baseline !== body.baseline ||
      result?.evidence?.inputHash !== hash(body) ||
      result?.evidence?.intentRef !== body.intentRef ||
      // The public read-only review and trusted Workflow promotion must agree
      // on the *original* repository discovery, not only goal and Git HEAD.
      // A changed submitted discovery is not an owner-reviewable plan even if
      // someone recomputes its persisted resultHash.
      !body.context?.discovery || !result?.plan?.discovery ||
      !/^[a-f0-9]{64}$/.test(body.context.discovery.repositoryId ?? '') ||
      hash(result.plan.discovery) !== hash(body.context.discovery) ||
      result?.plan?.intent?.original !== body.objective ||
      result?.plan?.discovery?.base !== body.baseline ||
      !result?.workflowPreview?.source || !result?.workflowPreview?.workflow)
    fail('Planning result, raw objective or baseline binding invalid');
  const source=result.workflowPreview.source,workflow=result.workflowPreview.workflow;
  if (workflow.base !== body.baseline || source.goal !== body.objective)
    fail('Compiled source and original Objective differ');
  validateWorkflow(workflow,source);
  return { row,body,result,source,workflow };
}

// A persisted plan binds an immutable source baseline, not merely the path
// that happens to resolve to the same repository. A human review cannot grant
// creation of a Workflow against dirty or subsequently committed source.
async function requirePinnedPlanningSource(repo, root, baseline) {
  try {
    if (await realpath(repo) !== root) throw Error('Repository alias changed');
    const observed = await repository(root);
    if (await realpath(observed.repo) !== root || observed.base !== baseline)
      throw Error('Repository HEAD changed');
  } catch {
    fail('Planning repository must remain clean at its pinned baseline');
  }
}

export async function prepareReviewedCodexWorkflow(store, repo, sessionId, {
  authorizeReview,
}={}) {
  if (!store || typeof store.get !== 'function' || !isAbsolute(repo ?? '') ||
      typeof authorizeReview !== 'function')
    fail('Trusted Store, absolute repo and explicit review callback required');
  const initial=planRow(store,sessionId);
  // A baseline commit is portable across clones. Never turn a reviewed plan
  // for repository A into a Workflow for repository B merely because both
  // repositories happen to have the same HEAD and source bytes.
  const reviewedRoot=await realpath(repo);
  const repositoryId=hash(reviewedRoot);
  if (initial.body.context?.discovery?.repositoryId !== repositoryId ||
      initial.result.plan?.discovery?.repositoryId !== repositoryId)
    fail('Planning repository identity differs from reviewed target');
  await requirePinnedPlanningSource(repo, reviewedRoot, initial.body.baseline);
  const scope=Object.freeze({
    kind:'CODEFLEET_REVIEWED_PLANNING_CONTRACT_V1',
    sessionId, objectiveHash:hash(initial.body.objective),
    repositoryRoot:reviewedRoot, repositoryId,
    baseline:initial.body.baseline, workflowHash:initial.workflow.workflowHash,
    sourceContractHash:hash(initial.source),
    // Review the actual DAG, mandatory checks and bounded contract rather
    // than only a hash and flat file lists. Copies remain immutable throughout
    // the asynchronous owner review and cannot mutate the persisted plan.
    files:Object.freeze([...initial.source.files]),
    tests:Object.freeze([...initial.source.tests]),
    contextFiles:Object.freeze([...initial.source.context]),
    deliveryMode:initial.source.delivery.mode,
    executionLimits:Object.freeze({
      maxAttempts:initial.source.maxAttempts,
      timeoutSeconds:initial.source.timeoutSeconds,
      attemptBudgetUsd:initial.source.attemptBudgetUsd
    }),
    requiredVerification:initial.workflow.requiredVerification,
    // Approval of a Contract must also disclose the Host capabilities it requires.
    requiredCapabilities:Object.freeze([...initial.workflow.requiredCapabilities]),
    finalAcceptanceCriteria:Object.freeze([...initial.workflow.acceptanceCriteria]),
    workItems:Object.freeze(initial.workflow.items.map(item=>Object.freeze({
      id:item.id, priority:item.priority,
      dependencies:Object.freeze([...item.dependencies]),
      files:Object.freeze([...item.files]),
      tests:Object.freeze([...item.tests]),
      acceptanceCriteria:Object.freeze([...item.acceptanceCriteria]),
      ...(item.roles ? {roles:Object.freeze({...item.roles})} : {}),
      ...(item.resources ? {resources:Object.freeze([...item.resources])} : {})
    }))),
    executionGranted:false
  });
  if(await authorizeReview(scope)!==true)
    fail('Independent exact plan review denied');
  // The review callback may be asynchronous; never accept a stale result
  // or silently rebind a grant to different model output/scope.
  const current=planRow(store,sessionId);
  // Review is asynchronous: a changed planning request or redirected repo
  // requires another exact review, even when the result hash has not changed.
  if (await realpath(repo) !== reviewedRoot ||
      current.body.context?.discovery?.repositoryId !== repositoryId ||
      current.result.plan?.discovery?.repositoryId !== repositoryId ||
      current.row.digest !== initial.row.digest ||
      current.row.resultHash !== initial.row.resultHash ||
      current.row.status !== initial.row.status ||
      current.workflow.workflowHash !== scope.workflowHash ||
      hash(current.source) !== scope.sourceContractHash)
    fail('Planning result changed during review');
  await requirePinnedPlanningSource(repo, reviewedRoot, initial.body.baseline);
  // Deterministic command ID allows safe idempotent creation after an
  // interruption but does not provide an execution approval.
  const commandId='planning-'+sessionId;
  const run=await createWorkflow(store,reviewedRoot,current.workflow,current.source,commandId);
  return { workflowId:run.id, workflowHash:run.contractHash,
    sourceContractHash:scope.sourceContractHash,
    state:run.state,executionGranted:false,approved:false,
    authority:'REVIEWED_CONTRACT_ONLY' };
}


// Data-only public review projection. This NEVER invokes a model, publishes an
// operator grant, creates a Workflow, or declares accepted execution. The review
// operation intentionally reuses the same strict persisted planning validator
// as prepareReviewedCodexWorkflow, rather than duplicating trust logic.
export function inspectReviewedCodexPlan(store, sessionId) {
  if (!store?.db || typeof store.db.prepare !== 'function' ||
      typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(sessionId))
    fail('A Store and exact planning session ID are required');
  const view = { schemaVersion:1, kind:'CODEFLEET_CODEX_PLANNING_REVIEW_V1',
    sessionId, executionGranted:false, approved:false,
    nativeHostVerified:false, sourceFreshness:'NOT_RECHECKED',
    authority:'PERSISTED_PLANNING_DATA_ONLY' };
  if (!store.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='host_planning'"
  ).get()) return { ...view, status:'UNAVAILABLE', reason:'No persisted Host planning sessions' };
  try {
    const { body, source, workflow } = planRow(store, sessionId);
    return { ...view, status:'REVIEW_REQUIRED', objective:body.objective,
      objectiveHash:hash(body.objective), repositoryId:body.context.discovery.repositoryId,
      sourceBaseline:body.baseline, workflowHash:workflow.workflowHash,
      sourceContractHash:hash(source), revision:1,
      // The public read-only preview must expose the *same* mandatory final
      // acceptance gate and per-item scope as the independent owner reviewer.
      // A flat WorkItem criterion list alone conceals the final verification
      // requirement and cannot support an informed approval decision.
      files:[...source.files], tests:[...source.tests],
      contextFiles:[...source.context], deliveryMode:source.delivery.mode,
      requiredCapabilities:[...workflow.requiredCapabilities],
      requiredVerification:workflow.requiredVerification,
      finalAcceptanceCriteria:[...workflow.acceptanceCriteria],
      criteria:workflow.items.flatMap(item => item.acceptanceCriteria.map(text => ({
        workItemId:item.id, description:text
      }))),
      workItems:workflow.items.map(item => ({
        id:item.id, priority:item.priority, dependencies:[...item.dependencies],
        files:[...item.files], tests:[...item.tests],
        acceptanceCriteria:[...item.acceptanceCriteria],
        ...(item.roles ? {roles:{...item.roles}} : {}),
        ...(item.resources ? {resources:[...item.resources]} : {})
      })),
      executionLimits: {
        maxAttempts:source.maxAttempts, timeoutSeconds:source.timeoutSeconds,
        attemptBudgetUsd:source.attemptBudgetUsd
      },
      nextAction:'Independent exact-scope plan review, then separately approved execution. This command does not grant either.'
    };
  } catch {
    // Stale, unsubmitted, tampered or incomplete Host output must not produce
    // a reviewable contract or leak arbitrary model raw data in an error.
    return { ...view, status:'BLOCKED',
      reason:'Persisted Host Planning result is absent, unvalidated, stale or integrity-invalid' };
  }
}


// Optional live-source review for the public data-only CLI. A persisted valid
// proposal is not necessarily applicable to the checkout currently on disk.
// Never show a stale/cross-repository proposal as REVIEW_REQUIRED when the
// user supplies an exact local source root for observation.
export async function inspectReviewedCodexPlanAtSource(store, sessionId, repo) {
  const view = inspectReviewedCodexPlan(store, sessionId);
  if (view.status !== 'REVIEW_REQUIRED') return view;
  try {
    if (!isAbsolute(repo ?? '')) throw Error('Absolute source root required');
    const root = await realpath(repo);
    if (hash(root) !== view.repositoryId)
      throw Error('Different repository');
    await requirePinnedPlanningSource(repo, root, view.sourceBaseline);
    return { ...view, sourceFreshness:'PINNED_CLEAN_AT_REVIEW' };
  } catch {
    // No raw model output, source content, or stale review scope on denial.
    return {
      schemaVersion:1, kind:'CODEFLEET_CODEX_PLANNING_REVIEW_V1',
      sessionId, executionGranted:false, approved:false,
      nativeHostVerified:false, sourceFreshness:'STALE_OR_MISMATCHED',
      authority:'PERSISTED_PLANNING_DATA_ONLY', status:'BLOCKED',
      reason:'Current repository identity, clean tree or Git HEAD does not match the persisted Codex plan'
    };
  }
}


// Public, read-only inspection of the exact persisted Codex Planning → Workflow
// handoff. It grants neither Workflow approval nor authenticated Host admission.
// Revision 1 must still belong to the validated originating Planning session;
// later revisions can be reviewed but cannot rewrite the original provenance.
export function inspectReviewedCodexWorkflow(store, workflowId) {
  const view = { schemaVersion:1, kind:'CODEFLEET_CODEX_WORKFLOW_REVIEW_V1',
    workflowId, status:'BLOCKED', executionGranted:false,
    hostLiveAcceptance:'UNVERIFIED', protectedVerified:false,
    sourceFreshness:'NOT_RECHECKED', authority:'PERSISTED_WORKFLOW_DATA_ONLY' };
  const blocked = { ...view,
    reason:'Codex Workflow or originating Planning/Contract/DAG binding is missing or invalid' };
  if (!store?.db || typeof workflowId !== 'string' ||
      !/^planning-[a-f0-9-]{36}$/i.test(workflowId)) return blocked;
  try {
    const plan=inspectReviewedCodexPlan(store,workflowId.slice('planning-'.length));
    if (plan.status !== 'REVIEW_REQUIRED') return blocked;
    const run=store.get(workflowId);
    const original=store.db.prepare(
      'SELECT digest,body FROM graph_revisions WHERE runId=? AND revision=1'
    ).get(workflowId);
    if (!run || run.kind !== 'workflow' || !Number.isSafeInteger(run.revision) ||
        run.revision < 1 || !original || original.digest !== plan.workflowHash ||
        JSON.parse(original.body).workflowHash !== original.digest ||
        run.base !== plan.sourceBaseline || hash(run.repo) !== plan.repositoryId ||
        run.contract?.workflowHash !== run.contractHash ||
        hash(run.contract) !== run.graphRef) return blocked;
    const source=store.readArtifact(run.sourceRef);
    if (hash(source) !== run.sourceRef ||
        hash(source) !== plan.sourceContractHash ||
        source.goal !== plan.objective) return blocked;
    validateWorkflow(run.contract,source);
    let approvalState='MISSING_OR_EXPIRED';
    try { requireWorkflowApproval(store,run); approvalState='CURRENT_WORKFLOW_APPROVAL_VALID'; }
    catch { /* Missing/expired approval is reviewable, not an execution grant. */ }
    return { ...view, status:'REVIEW_REQUIRED', revision:run.revision,
      workflowState:run.state, workflowHash:run.contractHash,
      sourceContractHash:run.sourceRef, repositoryId:plan.repositoryId,
      sourceBaseline:run.base, objective:source.goal,
      files:[...source.files], tests:[...source.tests],
      finalAcceptanceCriteria:[...run.contract.acceptanceCriteria],
      requiredCapabilities:[...run.contract.requiredCapabilities],
      requiredVerification:run.contract.requiredVerification,
      workItems:run.contract.items.map(item=>({
        id:item.id, dependencies:[...item.dependencies],
        files:[...item.files], tests:[...item.tests],
        acceptanceCriteria:[...item.acceptanceCriteria]
      })),
      executionLimits:{ maxAttempts:source.maxAttempts,
        timeoutSeconds:source.timeoutSeconds,
        attemptBudgetUsd:source.attemptBudgetUsd },
      approvalState, authenticatedOperatorAvailable:false,
      nextAction:approvalState === 'CURRENT_WORKFLOW_APPROVAL_VALID'
        ? 'Authenticated trusted Host Operator admission and separate exact managed-Host grant still required'
        : 'Separate current Workflow approval, authenticated Host Operator admission and managed-Host grant required'
    };
  } catch { return blocked; }
}


// Optional read-only source freshness for the *promoted* Codex Workflow.
// Persisted approval is not proof that the current checkout remains executable.
// This never upgrades approval or grants Host/Controller permission.
export async function inspectReviewedCodexWorkflowAtSource(store, workflowId, repo) {
  const view=inspectReviewedCodexWorkflow(store,workflowId);
  if (view.status !== 'REVIEW_REQUIRED') return view;
  try {
    if (!isAbsolute(repo ?? '')) throw Error('Absolute source root required');
    const root=await realpath(repo);
    if (hash(root) !== view.repositoryId) throw Error('Different repository');
    await requirePinnedPlanningSource(repo,root,view.sourceBaseline);
    return { ...view, sourceFreshness:'PINNED_CLEAN_AT_REVIEW' };
  } catch {
    // Do not display a reviewable Contract/DAG or apparent approval readiness
    // for a stale source, dirty checkout, or second clone with the same HEAD.
    return {
      schemaVersion:1, kind:'CODEFLEET_CODEX_WORKFLOW_REVIEW_V1',
      workflowId, status:'BLOCKED', executionGranted:false,
      hostLiveAcceptance:'UNVERIFIED', protectedVerified:false,
      authority:'PERSISTED_WORKFLOW_DATA_ONLY',
      sourceFreshness:'STALE_OR_MISMATCHED',
      reason:'Current repository identity, clean tree or Git HEAD does not match the reviewed Codex Workflow'
    };
  }
}
