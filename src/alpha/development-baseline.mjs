// Explicit opt-in for development WorkItems whose baseline tests already pass.
// Repair-only Alpha runs remain red-baseline-only by default. No Host or model
// declaration can create this record: a trusted caller must authorize it.
import { isFailingBaseline } from './judge.mjs';
import { protectedExecution, protectedGates } from './verification-evidence.mjs';

export function approvedDevelopmentBaseline(store, child) {
  if (!child?.baselineHash) return false;
  let baseline;
  try { baseline = store.readArtifact(child.baselineHash); }
  catch { return false; }
  if (isFailingBaseline(baseline)) return true;
  if (!child.developmentBaselineRef) return false;
  let grant;
  try { grant = store.readArtifact(child.developmentBaselineRef); }
  catch { return false; }
  return grant?.kind === 'APPROVED_GREEN_BASELINE_V1' &&
    grant.contractHash === child.contractHash &&
    grant.base === child.base && grant.baselineHash === child.baselineHash &&
    grant.runId === child.id && grant.authorizedBy === 'TRUSTED_INTEGRATION' &&
    baseline.authority === 'HARNESS_EXECUTED' &&
    protectedExecution(baseline) && protectedGates(baseline) &&
    Number.isSafeInteger(baseline.tests) && baseline.tests > 0 &&
    baseline.passed === baseline.tests && baseline.failed === 0 &&
    baseline.skipped === 0 && baseline.todo === 0 && baseline.exitCode === 0 &&
    !baseline.interrupted && !baseline.truncated;
}
