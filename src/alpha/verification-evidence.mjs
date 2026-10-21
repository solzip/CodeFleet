// Additive evidence envelope. Historical Alpha artifacts retain their original
// interpretation; any new field opts into the entire stricter contract.
export const EVIDENCE_FIELDS = Object.freeze([
  'verificationBackend', 'executionAuthority', 'isolationCapabilities',
  'verifierIndependence', 'evidenceIntegrity', 'candidateTreeHash', 'requiredGateResults'
]);
export const PROTECTED_CAPABILITIES = Object.freeze([
  'network-denied', 'protected-inputs', 'bounded-resources'
]);
export function hasEnvelope(e) {
  return e && EVIDENCE_FIELDS.some(k => Object.hasOwn(e, k));
}
export function protectedExecution(e) {
  return !hasEnvelope(e) || (
    EVIDENCE_FIELDS.every(k => Object.hasOwn(e, k)) &&
    typeof e.verificationBackend === 'string' && e.verificationBackend.length > 0 &&
    e.executionAuthority === 'HARNESS_EXECUTED' &&
    e.verifierIndependence === 'PROTECTED_TEST_INPUTS' &&
    Array.isArray(e.isolationCapabilities) &&
    PROTECTED_CAPABILITIES.every(c => e.isolationCapabilities.includes(c))
  );
}
export function protectedGates(e) {
  if (!hasEnvelope(e)) return true;
  return protectedExecution(e) && e.evidenceIntegrity === 'MATCHED' &&
    /^[a-f0-9]{64}$/.test(e.contractHash ?? '') &&
    /^[a-f0-9]{64}$/.test(e.candidateTreeHash ?? '') &&
    e.candidateTreeHash === e.candidateHash &&
    e.requiredGateResults?.protectedVerification === 'SATISFIED' &&
    e.requiredGateResults?.testIdentity === 'SATISFIED' &&
    e.requiredGateResults?.treeIntegrity === 'SATISFIED' &&
    Object.values(e.requiredGateResults).every(v => v === 'SATISFIED');
}
// Only the trusted coordinator calls this, after independently hashing the tree.
// Local authority and isolation never change when binding evidence.
export function bindVerification(e, { contractHash, candidateHash, integrity, testIdentityMatch }) {
  Object.assign(e, { contractHash, candidateHash, integrity, testIdentityMatch });
  if (hasEnvelope(e)) Object.assign(e, {
    candidateTreeHash: candidateHash, evidenceIntegrity: integrity ? 'MATCHED' : 'MISMATCH',
    requiredGateResults: {
      ...e.requiredGateResults,
      protectedVerification: e.authority === 'HARNESS_EXECUTED' && protectedExecution(e) ? 'SATISFIED' : 'UNSATISFIED',
      testIdentity: testIdentityMatch ? 'SATISFIED' : 'UNSATISFIED',
      treeIntegrity: integrity ? 'SATISFIED' : 'UNSATISFIED'
    }
  });
  return e;
}
