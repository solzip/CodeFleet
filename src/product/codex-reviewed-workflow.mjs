// Promote an independently reviewed, persisted Host planning result into a
// pending-approval Workflow. This does NOT authorize execution, reserve any
// Attempt or trust model-supplied approval claims.
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';
import { createWorkflow } from '../workflow/persistence.mjs';

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
    finalAcceptanceCriteria:Object.freeze([...initial.workflow.acceptanceCriteria]),
    workItems:Object.freeze(initial.workflow.items.map(item=>Object.freeze({
      id:item.id, priority:item.priority,
      dependencies:Object.freeze([...item.dependencies]),
      files:Object.freeze([...item.files]),
      tests:Object.freeze([...item.tests]),
      acceptanceCriteria:Object.freeze([...item.acceptanceCriteria])
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
      files:[...source.files], tests:[...source.tests],
      criteria:workflow.items.flatMap(item => item.acceptanceCriteria.map(text => ({
        workItemId:item.id, description:text
      }))),
      workItems:workflow.items.map(item => ({
        id:item.id, dependencies:[...item.dependencies],
        files:[...item.files],tests:[...item.tests]
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
