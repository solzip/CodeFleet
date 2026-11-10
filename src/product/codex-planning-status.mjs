// Read-only persisted Codex Planning lifecycle projection. A reserved Host
// Turn may have been billed or may have applied unknown effects: never replay.
import { hash } from '../alpha/contract.mjs';
import { PLANNING_PROFILE, planningSkill } from '../hosts/planning.mjs';
import { inspectReviewedCodexPlan } from './codex-reviewed-workflow.mjs';

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
        body.skillHash !== hash(planningSkill('codex')) ||
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
