// Policy is evaluated by the coordinator, never read from a model's claims.
export const WORK_KINDS = Object.freeze({
  planning: [], analysis: ['host-read'],
  'local-edit': ['scoped-write'],
  'local-verification': ['trusted-local-command'],
  'isolated-execution': ['filesystem-restriction', 'network-restriction', 'resource-limits'],
  'protected-verification': ['protected-verifier', 'protected-evidence', 'protected-inputs'],
  'external-effect': ['effect-enforcement', 'authenticated-approval'],
  'risky-action': ['effect-enforcement', 'authenticated-approval']
});
export function evaluateWorkItem(kind, capabilities = {}, { authorized = false } = {}) {
  if (!Object.hasOwn(WORK_KINDS, kind)) return { status: 'BLOCKED', kind, missing: ['unknown-work-kind'] };
  const missing = WORK_KINDS[kind].filter(c => capabilities[c] !== true);
  if (['external-effect', 'risky-action'].includes(kind) && !authorized) missing.push('current-action-approval');
  return { status: missing.length ? 'BLOCKED' : 'AVAILABLE', kind, missing };
}
// A policy envelope is an additional restriction supplied by trusted embedding
// code. It never grants execution, bypasses approval, or changes an Alpha contract.
export function policyAdmission(run, itemId, policy) {
  if (!policy) return { status: 'AVAILABLE', missing: [] };
  if (policy.workflowHash !== run.contractHash || policy.revision !== run.revision)
    return { status: 'BLOCKED', missing: ['stale-policy-binding'] };
  const rule = policy.items?.[itemId];
  if (!rule) return { status: 'BLOCKED', missing: ['missing-work-item-policy'] };
  // Risky actions remain denied here. Protected Operator grants are checked by
  // the existing WorkflowAuthorization immediately before reservation.
  return evaluateWorkItem(rule.kind, policy.capabilities);
}
