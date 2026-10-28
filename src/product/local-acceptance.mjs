// Completion is a read-time judgment over revalidated evidence, never an approval.
// Opt-in is creation-only Task policy. Old Tasks remain protected-required.
export function localAcceptance(current, plan, view, evidenceFor) {
  const result = { mode: current.acceptanceMode ?? 'PROTECTED_REQUIRED', complete: false,
    authority: 'DERIVED_ACCEPTANCE_JUDGMENT', verifierIndependence: 'UNPROTECTED', evidenceRefs: [],
    reason: 'PROTECTED_EVIDENCE_REQUIRED' };
  if (result.mode !== 'LOCAL_ONLY') return result;
  result.reason = 'LOCAL_ACCEPTANCE_UNSATISFIED';
  if (!view || current.state === 'REJECTED' || view.drift.length || !view.items.length ||
      view.items.some(i => !['PLAN_RECORDED', 'MATERIALIZED', 'LOCAL_PASSED'].includes(i.state))) return result;
  const tests = [...new Set(plan.draft.criteria.flatMap(c => c.tests))].sort();
  if (!tests.length || !plan.draft.criteria.length || plan.draft.criteria.some(c => !c.tests.length)) return result;
  // One integrated, current-candidate Node test invocation must cover every
  // criterion. No globs, name filters, scripts or self-reported test coverage.
  for (const item of view.items.filter(i => i.kind === 'local-verification' && i.state === 'LOCAL_PASSED')) {
    const evidence = evidenceFor(item.verificationRef), observed = evidence.observed;
    if (evidence.workflowHash !== view.workflowHash || evidence.taskId !== current.id ||
        evidence.itemId !== item.id || evidence.authority !== 'LOCAL_EXECUTED' ||
        observed?.exitCode !== 0 || !Number.isSafeInteger(observed.tests) || observed.tests <= 0 || observed.passed !== observed.tests ||
        observed.failed !== 0 || observed.skipped !== 0 || observed.todo !== 0 ||
        observed.evidenceIntegrity !== 'MATCHED' || observed.contractHash !== view.workflowHash ||
        observed.candidateTreeHash !== evidence.command?.candidateTreeHash) continue;
    const args = evidence.command.args;
    if (args[0] !== '--test' || args[1] !== '--test-reporter=tap' ||
        JSON.stringify(args.slice(2).sort()) !== JSON.stringify(tests)) continue;
    const ancestors = new Set();
    const visit = id => { if (ancestors.has(id)) return; ancestors.add(id); view.items.find(i => i.id === id)?.dependencies.forEach(visit); };
    item.dependencies.forEach(visit);
    if (view.items.some(i => i.kind === 'local-edit' && !ancestors.has(i.id))) continue;
    return { ...result, complete: true, reason: 'CURRENT_CANDIDATE_ALL_CRITERIA_LOCAL_PASSED',
      evidenceRefs: [item.verificationRef], candidateTreeHash: evidence.command.candidateTreeHash };
  }
  return result;
}
