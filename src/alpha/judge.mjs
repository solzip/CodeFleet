// Pure verdicts only: no state writes, provider calls, retries or delivery.
// Authority is necessary, not proof of provenance. The coordinator must obtain
// evidence from its trusted verifier (never from proposal payloads) and check
// artifact hashes on recovery. Provider code cannot supply these dependencies.
export function isFailingBaseline(evidence) {
  return evidence?.authority === 'HARNESS_EXECUTED' &&
    evidence.exitCode !== 0 && evidence.tests > 0 && evidence.failed > 0 &&
    !evidence.interrupted && !evidence.truncated;
}

export function judge(evidence) {
  if (evidence?.authority !== 'HARNESS_EXECUTED') return { outcome: 'ESCALATE', reason: 'Harness-executed verification evidence required; provider reports cannot satisfy verification' };
  if (evidence.interrupted || evidence.truncated || !evidence.integrity) return { outcome: 'ESCALATE', reason: 'Evidence incomplete, interrupted, or mismatched' };
  if (evidence.testIdentityMatch !== true) return { outcome: 'ESCALATE', reason: 'Test identities missing or different from the failing baseline; independent review required' };
  if (evidence.exitCode === 0 && evidence.tests > 0 && evidence.passed === evidence.tests && evidence.failed === 0 && evidence.skipped === 0 && evidence.todo === 0) return { outcome: 'ACCEPT', reason: 'Baseline test identities matched and reported passing; independent code review remains required' };
  return { outcome: 'RETRY', reason: 'Declared tests failed, were skipped, or did not execute' };
}
