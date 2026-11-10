// Read-only persisted Codex Planning lifecycle projection. A reserved Host
// Turn may have been billed or may have applied unknown effects: never replay.
import { hash } from '../alpha/contract.mjs';
import { PLANNING_PROFILE, recognizedPlanningSkillHash } from '../hosts/planning.mjs';
import { inspectReviewedCodexPlan, inspectReviewedCodexWorkflow } from './codex-reviewed-workflow.mjs';
import { workflowProgress } from './report.mjs';

const SESSION_ID = /^[a-f0-9-]{36}$/i;
const STATES = new Set(['OPEN','DISPATCHED','RECONCILING','CANCELLED','SUBMITTED']);
const blocked = (base, status, reason) => ({
  ...base, status, reason, continuation: {
    kind: 'MANUAL_REVIEW_REQUIRED', automaticReplay: false,
    executionGranted: false
  }
});

export function inspectCodexPlanningStatus(store, sessionId) {
  if (!store?.db || typeof store.db.prepare !== 'function' ||
      typeof sessionId !== 'string' || !SESSION_ID.test(sessionId))
    throw Error('Codex Planning status requires a persisted session ID');
  const base = { schemaVersion:1, kind:'CODEFLEET_CODEX_PLANNING_STATUS_V1',
    sessionId, authority:'READ_ONLY_PERSISTED_STATUS', approved:false,
    executionGranted:false, automaticReplay:false,
    hostLiveAcceptance:'UNVERIFIED', protectedVerified:false,
    sourceFreshness:'NOT_RECHECKED' };
  if (!store.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='host_planning'"
  ).get()) return blocked(base,'UNAVAILABLE','No persisted Host Planning sessions');
  const row = store.db.prepare(
    'SELECT body,digest,status,response,result,resultHash FROM host_planning WHERE id=?'
  ).get(sessionId);
  if (!row) return blocked(base,'NOT_FOUND','No Planning session with that ID');
  try {
    if (!STATES.has(row.status) || typeof row.body !== 'string' ||
        typeof row.digest !== 'string' || hash(row.body) !== row.digest)
      throw Error('Invalid Planning request or state');
    const body = JSON.parse(row.body);
    if (body.sessionId !== sessionId || body.host !== 'codex' ||
        typeof body.objective !== 'string' || !body.objective ||
        body.intentRef !== hash({ original: body.objective }) ||
        body.contextHash !== hash(body.context) ||
        body.profileHash !== hash(body.profile) ||
        body.profileHash !== hash(PLANNING_PROFILE) ||
        !recognizedPlanningSkillHash('codex',body.skillHash,row.status === 'SUBMITTED') ||
        body.baseline !== body.context?.discovery?.base ||
        !Number.isFinite(body.expiresAt))
      throw Error('Planning request binding invalid');
    const expiresAt = body.expiresAt;
    const expired = Date.now() >= expiresAt;
    const scope = { ...base, status:row.status, objectiveHash:hash(body.objective),
      requestHash:row.digest, sourceBaseline:body.baseline,
      repositoryId:body.context.discovery.repositoryId,
      expiresAt, expired };
    if (row.status !== 'SUBMITTED') {
      // A non-submitted session has no accepted outcome. In particular a
      // DISPATCHED/RECONCILING Turn must never be reissued automatically.
      if (row.response !== null || row.result !== null || row.resultHash !== null)
        throw Error('Unaccepted Planning state holds a result');
      const kind = ['DISPATCHED','RECONCILING'].includes(row.status)
        ? 'RECONCILE_HOST_TURN'
        : row.status === 'CANCELLED' || expired
          ? 'NEW_PLANNING_REVIEW_REQUIRED' : 'AWAIT_PLANNING_REVIEW';
      return { ...scope, continuation: { kind, automaticReplay:false,
        executionGranted:false } };
    }
    if (typeof row.result !== 'string' || typeof row.resultHash !== 'string' ||
        typeof row.response !== 'string' || hash(row.result) !== row.resultHash)
      throw Error('Persisted Planning result integrity mismatch');
    const result = JSON.parse(row.result);
    if (result?.kind !== 'HostPlanningResult' ||
        typeof result.status !== 'string' || !result.status ||
        result.authority !== 'PROVIDER_REPORTED_ONLY' ||
        result.approved !== false || result.executable !== false ||
        result.complete !== false ||
        result.evidence?.host !== 'codex' ||
        result.evidence?.sessionId !== sessionId ||
        result.evidence?.inputHash !== row.digest ||
        result.evidence?.outputHash !== row.response ||
        result.evidence?.baseline !== body.baseline ||
        result.plan?.intent?.original !== body.objective)
      throw Error('Persisted Planning outcome is not bound to request');
    if (result.status === 'VALIDATED' &&
        inspectReviewedCodexPlan(store, sessionId).status !== 'REVIEW_REQUIRED')
      throw Error('Validated plan failed exact Contract/DAG inspection');
    return { ...scope, validationStatus:result.status,
      continuation: { kind:result.status === 'VALIDATED'
        ? 'REVIEW_CONTRACT_AT_CURRENT_SOURCE' : 'RESOLVE_PLANNING_GAPS',
        automaticReplay:false,executionGranted:false } };
  } catch {
    // Never leak model output or promote a tampered result to reviewable.
    return blocked(base,'BLOCKED','Persisted Planning request/result integrity invalid');
  }
}


// One Goal-level, non-executing observation across persisted Planning,
// reviewed Workflow/DAG, delivery and the independent Objective verdict.
// An existing Workflow must originate from this exact validated session.
// Neither a model completion nor a Controller COMPLETED flag is sufficient
// to report the actual delivered Objective as complete.
export async function inspectCodexGoalProgress(store, sessionId) {
  const planning = inspectCodexPlanningStatus(store, sessionId);
  const base = { schemaVersion:1, kind:'CODEFLEET_CODEX_GOAL_PROGRESS_V1',
    sessionId, authority:'READ_ONLY_ADVISORY', planning,
    workflowId:null, workflow:null, objective:null,
    objectiveComplete:false, executionGranted:false,
    automaticReplay:false, protectedVerified:false,
    hostLiveAcceptance:'UNVERIFIED' };
  if (planning.status !== 'SUBMITTED' ||
      planning.validationStatus !== 'VALIDATED')
    return { ...base, status:'PLANNING_NOT_READY',
      continuation:planning.continuation };
  const workflowId='planning-'+sessionId;
  // A validated Host plan does not create a Workflow, and a missing table is
  // not permission to initialize the workflow Store while reading status.
  const runsTable = store.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='runs'"
  ).get();
  if (!runsTable || !store.db.prepare(
    'SELECT 1 FROM runs WHERE id=?'
  ).get(workflowId))
    return { ...base, status:'AWAIT_WORKFLOW_REVIEW',
      continuation: { kind:'REVIEW_AND_PREPARE_WORKFLOW',
        automaticReplay:false, executionGranted:false } };
  // A forged or corrupted run ID must not look like progress for a real Goal.
  const reviewed=inspectReviewedCodexWorkflow(store,workflowId);
  if (reviewed.status !== 'REVIEW_REQUIRED' ||
      reviewed.repositoryId !== planning.repositoryId ||
      reviewed.sourceBaseline !== planning.sourceBaseline ||
      reviewed.sourceContractHash === undefined)
    return { ...base, status:'BLOCKED',
      continuation:{kind:'INSPECT_WORKFLOW_PROVENANCE',
        automaticReplay:false, executionGranted:false} };
  try {
    const workflow=await workflowProgress(store,workflowId);
    if (workflow.workflowId !== workflowId ||
        workflow.workflowHash !== reviewed.workflowHash ||
        workflow.revision !== reviewed.revision)
      throw Error('Workflow changed during Goal observation');
    // An interrupted multi-WorkItem Goal can be resumed from persisted
    // accepted A after the coordinator has released its Lease. This is only
    // a command hint: the actual resume independently rechecks original
    // source, authenticated Operator, Workflow approval, budget and Host grant.
    // Never suggest a second entry while a coordinator or Host Turn is live,
    // on uncertain effects, before any WorkItem settles, or after completion.
    const coordinator = store.db.prepare(
      'SELECT owner,leaseUntil,control FROM runs WHERE id=?'
    ).get(workflowId);
    const coordinatorIdle = (!coordinator?.owner ||
      coordinator.leaseUntil <= Date.now()) &&
      (!coordinator?.control || coordinator.control === 'run');
    const resumable = !workflow.objectiveComplete &&
      workflow.continuation.status === 'AUTHENTICATED_HOST_ADMISSION_REQUIRED' &&
      workflow.workItems.some(item => item.attempt?.status === 'SUCCEEDED') &&
      workflow.dependencyReadyIds.length > 0 &&
      workflow.activeAttemptIds.length === 0 && coordinatorIdle;
    const resumeCommand = resumable ? {
      argv:['resume-codex-goal',sessionId,'--hash',workflow.workflowHash],
      sourceRechecked:false, trustedEmbeddingRequired:true,
      authenticatedOperatorRequired:true,managedHostGrantRequired:true,
      executionGranted:false,automaticReplay:false
    } : null;
    return { ...base, status:workflow.objectiveComplete
      ? 'OBJECTIVE_COMPLETE' : 'WORKFLOW_IN_PROGRESS',
      workflowId, workflow, objective:workflow.objective,
      objectiveComplete:workflow.objectiveComplete === true,
      continuation:workflow.continuation,
      ...(resumeCommand ? { resumeCommand } : {}) };
  } catch {
    // A failed delivered-tree observation is not a valid Objective verdict.
    return { ...base, status:'BLOCKED',
      continuation:{kind:'INSPECT_WORKFLOW_EVIDENCE',
        automaticReplay:false, executionGranted:false} };
  }
}
