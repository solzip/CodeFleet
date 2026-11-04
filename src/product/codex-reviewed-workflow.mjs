// Promote an independently reviewed, persisted Host planning result into a
// pending-approval Workflow. This does NOT authorize execution, reserve any
// Attempt or trust model-supplied approval claims.
import { isAbsolute } from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';
import { createWorkflow } from '../workflow/persistence.mjs';

function fail(reason) { throw Error('Reviewed Codex plan: ' + reason); }
function planRow(store, sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(sessionId))
    fail('A real bound planning session ID is required');
  const row=store.db.prepare('SELECT status,body,result,resultHash FROM host_planning WHERE id=?')
    .get(sessionId);
  if (!row || row.status !== 'SUBMITTED' || typeof row.result !== 'string' ||
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
  const scope=Object.freeze({
    kind:'CODEFLEET_REVIEWED_PLANNING_CONTRACT_V1',
    sessionId, objectiveHash:hash(initial.body.objective),
    baseline:initial.body.baseline, workflowHash:initial.workflow.workflowHash,
    sourceContractHash:hash(initial.source),
    files:[...initial.source.files],tests:[...initial.source.tests],
    executionGranted:false
  });
  if(await authorizeReview(scope)!==true)
    fail('Independent exact plan review denied');
  // The review callback may be asynchronous; never accept a stale result
  // or silently rebind a grant to different model output/scope.
  const current=planRow(store,sessionId);
  if (current.row.resultHash !== initial.row.resultHash ||
      current.row.status !== initial.row.status ||
      current.workflow.workflowHash !== scope.workflowHash ||
      hash(current.source) !== scope.sourceContractHash)
    fail('Planning result changed during review');
  // Deterministic command ID allows safe idempotent creation after an
  // interruption but does not provide an execution approval.
  const commandId='planning-'+sessionId;
  const run=await createWorkflow(store,repo,current.workflow,current.source,commandId);
  return { workflowId:run.id, workflowHash:run.contractHash,
    sourceContractHash:scope.sourceContractHash,
    state:run.state,executionGranted:false,approved:false,
    authority:'REVIEWED_CONTRACT_ONLY' };
}
