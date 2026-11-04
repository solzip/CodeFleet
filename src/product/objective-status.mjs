// Read-only user-facing Objective acceptance projection.
// A completed workflow or verified Candidate is NOT a delivered Objective.
// Reobserve the user's current target tree before presenting a COMPLETE claim.
// This module does not create approval, regenerate evidence, or call a Host.
import { candidateHash } from '../alpha/workspace.mjs';
import { hash } from '../alpha/contract.mjs';
import { evaluateDeliveredObjective } from './objective-judge.mjs';

const SHA = /^[a-f0-9]{64}$/;
const trustedSha = value => typeof value === 'string' && SHA.test(value);
const base = (run, status, reason, extra = {}) => ({
  kind: 'CODEFLEET_OBJECTIVE_STATUS_V1',
  objectiveId: run.id,
  revision: run.revision,
  workflowState: run.state,
  status, reason, ...extra,
  objectiveComplete: status === 'COMPLETE',
  liveHostVerified: false, // This projection is independent of Host Live proofs.
  cost: Number.isFinite(run.reportedCostUsd) ? { reportedUsd: run.reportedCostUsd,
    unknownTurns: run.unknownCostAttempts ?? 0 } : {
    reportedUsd: null, unknownTurns: run.unknownCostAttempts ?? 0
  }
});
const incomplete = (run, reason, status = 'INCOMPLETE', extra = {}) =>
  base(run, status, reason, extra);

export async function readDeliveredObjectiveStatus(store, objectiveId, {
  observeTree = candidateHash
} = {}) {
  if (!store || typeof store.get !== 'function' ||
      typeof store.readArtifact !== 'function' || typeof observeTree !== 'function')
    throw Error('Read-only Store and trusted target observer required');
  const run = store.get(objectiveId);
  if (run?.kind !== 'workflow' || typeof run.id !== 'string' ||
      !Number.isInteger(run.revision))
    throw Error('Objective status requires a persisted Workflow');
  const common = { candidateAvailable: Boolean(run.finalRunId && run.acceptedHash),
    deliveryRecorded: Boolean(run.deliveryReceiptRef) };
  if (!run.deliveryReceiptRef) {
    // Legacy artifact-only Controller may mark a Workflow COMPLETED. Do not
    // promote that to CodeFleet Objective complete or imply target delivery.
    return incomplete(run, common.candidateAvailable
      ? 'Verified candidate available; target repository has not been delivered'
      : 'No delivered target with accepted candidate Evidence',
      common.candidateAvailable ? 'VERIFIED_CANDIDATE_AVAILABLE' : 'INCOMPLETE',common);
  }
  let delivered, child, decision, required, approved;
  try {
    delivered = store.readArtifact(run.deliveryReceiptRef);
    child = store.get(run.finalRunId);
    if (run.objectiveDecisionRef) decision = store.readArtifact(run.objectiveDecisionRef);
    if (run.objectiveCriteriaRef) required = store.readArtifact(run.objectiveCriteriaRef);
    if (run.objectiveApprovedCriteriaRef) approved = store.readArtifact(run.objectiveApprovedCriteriaRef);
  } catch {
    return incomplete(run,'Delivery or Objective Evidence is unreadable','BLOCKED', common);
  }
  const binding = delivered && delivered.status === 'DELIVERED_NOT_VERIFIED' &&
    delivered.runId === run.id && delivered.revision === run.revision &&
    trustedSha(delivered.targetTreeHash) && delivered.targetTreeHash === delivered.candidateHash &&
    child && child.id === run.finalRunId && child.workflowParent === run.id &&
    child.workflowRevision === run.revision && trustedSha(child.candidateHash) &&
    child.candidateHash === delivered.targetTreeHash &&
    Array.isArray(child.candidatePaths) && child.candidatePaths.length > 0 &&
    typeof run.repo === 'string' && run.repo === child.repo;
  if (!binding) return incomplete(run,'Delivered target and final Candidate binding mismatch','BLOCKED', common);
  let observed;
  try { observed = await observeTree(run.repo, child.candidatePaths); }
  catch { return incomplete(run,'Current delivered target could not be independently observed','BLOCKED', common); }
  if (observed !== delivered.targetTreeHash)
    return incomplete(run,'Delivered target changed after verification; Objective requires re-evaluation',
      'INCOMPLETE',{...common, targetDrift: true, observedTreeHash: observed});
  if (!decision)
    return incomplete(run,'Delivered target is observed but mandatory criteria lack a final independent decision',
      'DELIVERED_NOT_VERIFIED',common);
  const criteria = Array.isArray(decision.criteria) ? decision.criteria : [];
  // The Controller pinned this separately from its decision on the delivered
  // revision. Never reconstruct the mandatory set from a COMPLETE verdict.
  const mandatory = Array.isArray(required?.criteria) ? required.criteria : [];
  const trustedApproval = approved?.kind === 'OBJECTIVE_APPROVED_CRITERIA_V1' &&
    approved.objectiveId === run.id && approved.revision === run.revision &&
    approved.workflowHash === run.contractHash &&
    Array.isArray(approved.criteria) && approved.criteria.length > 0 &&
    approved.criteriaHash === hash(approved.criteria);
  const trustedMandatory = trustedApproval &&
    required?.kind === 'OBJECTIVE_MANDATORY_CRITERIA_V1' &&
    required.objectiveId === run.id && required.revision === run.revision &&
    required.workflowHash === run.contractHash &&
    required.approvedCriteriaRef === run.objectiveApprovedCriteriaRef &&
    hash(mandatory) === approved.criteriaHash &&
    required.deliveryReceiptRef === run.deliveryReceiptRef &&
    mandatory.length > 0 && mandatory.length === criteria.length &&
    mandatory.every((item, index) => item && item.id === criteria[index]?.id &&
      typeof item.id === 'string' &&
      ['LOCAL_EXECUTED','PROTECTED_EXECUTED','OWNER_REVIEW'].includes(item.requiredAuthority)) &&
    new Set(mandatory.map(item => item.id)).size === mandatory.length;
  const trustedDecision = trustedMandatory && decision.outcome === 'COMPLETE' &&
    decision.complete === true && decision.objectiveId === run.id &&
    decision.revision === run.revision &&
    decision.targetTreeHash === delivered.targetTreeHash &&
    (decision.authority === 'LOCAL_EXECUTED' ||
      decision.authority === 'PROTECTED_EXECUTED') &&
    criteria.length > 0 && criteria.every(criterion =>
      criterion.status === 'SATISFIED' && typeof criterion.id === 'string' &&
      typeof criterion.evidenceRef === 'string' && criterion.evidenceRef.length > 0) &&
    new Set(criteria.map(criterion => criterion.id)).size === criteria.length;
  // A persisted COMPLETE decision is a verdict, not a substitute for its
  // referenced criterion Evidence. Re-run the same independent Judge against
  // the current immutable Evidence refs; fail closed on missing, stale,
  // downgraded or inconsistent records. No commands or Host Turns are run.
  let verifiedDecision = false;
  if (run.state === 'COMPLETED' && trustedDecision) {
    const reviewedCriteria = mandatory;
    const evidenceRefs = Object.fromEntries(criteria.map(criterion =>
      [criterion.id, criterion.evidenceRef]));
    try {
      const rejudged = evaluateDeliveredObjective({
        objectiveId: run.id, revision: run.revision,
        candidateHash: child.candidateHash, delivery: delivered,
        criteria: reviewedCriteria, evidenceRefs,
        readVerifiedEvidence: ref => store.readArtifact(ref)
      });
      verifiedDecision = rejudged.complete === true &&
        rejudged.authority === decision.authority &&
        rejudged.criteria.length === criteria.length &&
        rejudged.criteria.every((criterion, index) =>
          criterion.id === criteria[index].id &&
          criterion.status === criteria[index].status &&
          criterion.authority === criteria[index].authority &&
          criterion.evidenceRef === criteria[index].evidenceRef);
    } catch { /* unreadable or malformed persisted Evidence is not accepted */ }
  }
  if (!verifiedDecision)
    return incomplete(run,'Current independently accepted criterion Evidence is missing or inconsistent',
      decision?.outcome === 'HUMAN_HANDOFF' ? 'HUMAN_HANDOFF' : 'INCOMPLETE',common);
  return base(run,'COMPLETE','All delivered-tree criteria were previously accepted and target bytes still match',{
    ...common, targetTreeHash: delivered.targetTreeHash,
    verificationAuthority: decision.authority,
    protection: decision.authority === 'PROTECTED_EXECUTED' ? 'PROTECTED' : 'UNPROTECTED',
    criterionIds: criteria.map(criterion => criterion.id),
    criterionEvidenceRefs: criteria.map(criterion => criterion.evidenceRef)
  });
}
