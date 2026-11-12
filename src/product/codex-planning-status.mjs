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



/**
 * List persisted Codex Planning session identifiers after a CLI/Host restart.
* This is a bounded, read-only index: current Goal/Workflow status is
 * re-observed from persisted state and delivered-tree Evidence where present.
 * An index entry never implies a usable approval or fresh source checkout.
 * Inspect the full Goal through codex-goal-progress before any next action.
 */
export async function listCodexGoalSessions(store, { offset = 0 } = {}) {
  if (!store?.db || typeof store.db.prepare !== 'function' ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 999999)
    throw Error('Codex Goal discovery requires an existing Store and bounded offset');
  const base = { schemaVersion: 1, kind: 'CODEFLEET_CODEX_GOAL_INDEX_V1',
    authority: 'READ_ONLY_PERSISTED_INDEX', offset, limit: 20,
    executionGranted: false, automaticReplay: false,
    hostLiveAcceptance: 'UNVERIFIED', protectedVerified: false };
  if (!store.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='host_planning'"
  ).get()) return { ...base, status: 'EMPTY', sessions: [], nextOffset: null };
  // beginPlanning stores compact JSON including a pinned Host identifier.
  // Inspect each candidate independently; this index never trusts its body.
  // The extra row detects more records without loading unlimited Goal history.
  const rows = store.db.prepare(
    `SELECT id FROM host_planning
     WHERE instr(body, '"host":"codex"') > 0
     ORDER BY rowid DESC LIMIT 21 OFFSET ?`
  ).all(offset);
  const sessions = [];
  let unreadableCount = 0;
  // Reuse the same independent, fail-closed Goal projection as the detail
  // command. Do not infer completion from a Planning or Workflow flag.
  // Keep this bounded and sequential to avoid unbounded disk/tree reads.
  for (const row of rows.slice(0, 20)) {
    let progress;
    try {
      progress = await inspectCodexGoalProgress(store, row.id);
    } catch {
      // A malformed persisted session must not hide other recoverable Goals.
      // Never infer its Objective result or provide an unusable resume command.
      unreadableCount++;
      sessions.push({ sessionId: row.id, planningStatus: 'BLOCKED',
        validationStatus: null, continuationKind: 'INSPECT_PERSISTED_GOAL',
        goalStatus: 'BLOCKED', workflowId: null,
        workflowContinuationStatus: null, recoveryHandoffKind: null,
        objectiveComplete: false, sourceFreshness: 'NOT_RECHECKED',
        progressCommand: null, reason: 'PERSISTED_GOAL_UNREADABLE',
        executionGranted: false, automaticReplay: false });
      continue;
    }
    const observed = progress.planning;
    sessions.push({ sessionId: row.id, planningStatus: observed.status,
      validationStatus: observed.validationStatus ?? null,
      continuationKind: observed.continuation?.kind ?? null,
      goalStatus: progress.status,
      workflowId: progress.workflowId,
      workflowContinuationStatus: progress.workflow?.continuation?.status ?? null,
      recoveryHandoffKind: progress.recoveryHandoff?.kind ?? null,
      objectiveComplete: progress.objectiveComplete === true,
      sourceFreshness: 'NOT_RECHECKED',
      progressCommand: { argv: ['codex-goal-progress', row.id],
        readOnly: true, executionGranted: false, automaticReplay: false },
      workflowReviewCommand: progress.workflowId && progress.workflow
        ? { argv: ['review-codex-workflow', progress.workflowId],
            readOnly: true, sourceRechecked: false,
            executionGranted: false, automaticReplay: false }
        : null });
  }
  return { ...base, status: unreadableCount ? 'PARTIAL_BLOCKED'
    : sessions.length ? 'AVAILABLE' : 'EMPTY',
    unreadableCount, sessions, nextOffset: rows.length > 20 ? offset + 20 : null };
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
    // Expose an inspectable, read-only handoff at the two persisted recovery
    // boundaries. An uncertain Host effect must be reconciled before retry;
    // a terminal failure requires independently reviewed bounded Repair.
    // References are diagnostics, never a fresh Host/Operator grant.
    const recoveryKind = workflow.continuation.status === 'RECONCILE_REQUIRED'
      ? 'RECONCILE_EXISTING_EFFECTS'
      : workflow.continuation.status === 'REPAIR_REVIEW_REQUIRED'
        ? 'REVIEW_FAILED_WORKITEM_EVIDENCE' : null;
    const recoveryHandoff = recoveryKind ? {
      kind:recoveryKind,workflowId,revision:workflow.revision,
      itemIds:[...workflow.continuation.itemIds],
      attempts:workflow.workItems
        .filter(item=>workflow.continuation.itemIds.includes(item.id) && item.attempt)
        .map(item=>({itemId:item.id,childId:item.attempt.childId,
          generation:item.attempt.generation,status:item.attempt.status,
          // A prior child report can expose persisted failure diagnostics.
          // It is not a retry command or an independently accepted verdict.
          reason:item.reason ?? null,
          reportCommand:{argv:['report',item.attempt.childId],
            diagnosticOnly:true,executionGranted:false,automaticReplay:false}})),
      inspectCommand:{argv:['workflow-progress',workflowId],readOnly:true},
      ...(workflow.objective?.status === 'RECONCILING'
        ? {deliveredStatusCommand:{argv:['delivered-status',workflowId],readOnly:true}}
        : {}),
      requiredNextAction:recoveryKind === 'RECONCILE_EXISTING_EFFECTS'
        ? 'INSPECT_PERSISTED_EFFECTS_AND_LEASE'
        : 'REVIEW_FAILURE_EVIDENCE_AND_NEW_REPAIR_GRANT',
      executionGranted:false,automaticReplay:false
    } : null;
    return { ...base, status:workflow.objectiveComplete
      ? 'OBJECTIVE_COMPLETE' : 'WORKFLOW_IN_PROGRESS',
      workflowId, workflow, objective:workflow.objective,
      objectiveComplete:workflow.objectiveComplete === true,
      continuation:workflow.continuation,
      ...(resumeCommand ? { resumeCommand } : {}),
      ...(recoveryHandoff ? { recoveryHandoff } : {}) };
  } catch {
    // A failed delivered-tree observation is not a valid Objective verdict.
    return { ...base, status:'BLOCKED',
      continuation:{kind:'INSPECT_WORKFLOW_EVIDENCE',
        automaticReplay:false, executionGranted:false} };
  }
}
