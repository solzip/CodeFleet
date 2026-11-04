// Objective completion is separate from WorkItem / Candidate acceptance.
// Evidence is accepted only through an independently trusted reader supplied
// by the Controller. This pure predicate is not an evidence producer or a grant.
export const OBJECTIVE_OUTCOMES = Object.freeze([
  'COMPLETE', 'REPAIR', 'BLOCKED', 'INCOMPLETE', 'HUMAN_HANDOFF'
]);
const AUTHORITY = Object.freeze({ LOCAL_EXECUTED: 1, PROTECTED_EXECUTED: 2 });
const fail = (reason, outcome = 'INCOMPLETE', results = []) => ({ outcome, reason, criteria: results, complete: false });

export function evaluateDeliveredObjective({
  objectiveId, revision, candidateHash, delivery, criteria, evidenceRefs, readVerifiedEvidence
} = {}) {
  if (!objectiveId || !Number.isInteger(revision) || !/^[a-f0-9]{64}$/.test(candidateHash ?? ''))
    return fail('Objective identity and verified Candidate missing');
  if (!delivery || delivery.status !== 'DELIVERED_NOT_VERIFIED' ||
      delivery.runId !== objectiveId || delivery.revision !== revision ||
      delivery.candidateHash !== candidateHash || delivery.targetTreeHash !== candidateHash ||
      delivery.semanticCriteriaVerified !== false)
    return fail('Candidate was not correctly delivered and independently observed');
  if (!Array.isArray(criteria) || !criteria.length ||
      !criteria.every(c => c && typeof c.id === 'string' && c.id.length &&
        ['LOCAL_EXECUTED', 'PROTECTED_EXECUTED', 'OWNER_REVIEW'].includes(c.requiredAuthority)) ||
      new Set(criteria.map(c => c.id)).size !== criteria.length)
    return fail('Stable mandatory Objective criteria missing');
  if (!evidenceRefs || typeof readVerifiedEvidence !== 'function')
    return fail('Trusted independent Evidence reader required', 'BLOCKED');
  const results = [];
  for (const criterion of criteria) {
    if (criterion.requiredAuthority === 'OWNER_REVIEW') {
      results.push({ id: criterion.id, status: 'HUMAN_HANDOFF' });
      continue;
    }
    const ref = evidenceRefs[criterion.id];
    if (typeof ref !== 'string' || !ref) {
      results.push({ id: criterion.id, status: 'MISSING_EVIDENCE' });
      continue;
    }
    let evidence;
    try { evidence = readVerifiedEvidence(ref); } catch { results.push({ id: criterion.id, status: 'EVIDENCE_UNREADABLE' }); continue; }
    if (!evidence || evidence.objectiveId !== objectiveId ||
        evidence.revision !== revision || evidence.criterionId !== criterion.id ||
        evidence.targetTreeHash !== delivery.targetTreeHash ||
        !Object.hasOwn(AUTHORITY, evidence.authority) ||
        AUTHORITY[evidence.authority] < AUTHORITY[criterion.requiredAuthority] ||
        evidence.independentObserver !== true ||
        typeof evidence.commandHash !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.commandHash) ||
        typeof evidence.observationHash !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.observationHash) ||
        !Number.isSafeInteger(evidence.tests) || evidence.tests <= 0 ||
        !Number.isSafeInteger(evidence.passed) || evidence.passed !== evidence.tests ||
        evidence.failed !== 0 || evidence.skipped !== 0 || evidence.todo !== 0 ||
        evidence.exitCode !== 0 || evidence.interrupted || evidence.truncated ||
        evidence.integrity !== 'MATCHED') {
      results.push({ id: criterion.id, status: 'INSUFFICIENT_EVIDENCE' });
      continue;
    }
    results.push({ id: criterion.id, status: 'SATISFIED', authority: evidence.authority, evidenceRef: ref });
  }
  if (results.some(r => r.status === 'HUMAN_HANDOFF'))
    return fail('Subjective criterion requires product owner review', 'HUMAN_HANDOFF', results);
  if (results.some(r => r.status !== 'SATISFIED'))
    return fail('Some mandatory delivered-tree criteria lack independent Evidence', 'INCOMPLETE', results);
  const authority = results.every(r => r.authority === 'PROTECTED_EXECUTED')
    ? 'PROTECTED_EXECUTED' : 'LOCAL_EXECUTED';
  return { outcome: 'COMPLETE', complete: true, reason: 'All current delivered-tree mandatory criteria independently verified',
    authority, protection: authority === 'PROTECTED_EXECUTED' ? 'PROTECTED' : 'UNPROTECTED',
    targetTreeHash: delivery.targetTreeHash, objectiveId, revision, criteria: results };
}
