// Completion is a read-time judgment over revalidated evidence, never an approval.
// Opt-in is creation-only Task policy. Old Tasks remain protected-required.
// A passing test file proves only the assertions it actually contains. Keep that
// narrower fact separate from semantic satisfaction of a prose criterion.
export function criterionEvidenceCoverage(current, plan, view, evidenceFor) {
  const mapped = new Map((plan.draft.plannedTests ?? []).map(t => [t.path, new Set(t.criteria)]));
  return (plan.draft.criteria ?? []).map(criterion => {
    const tests = criterion.tests ?? [];
    const linked = tests.length > 0 && tests.every(p => mapped.get(p)?.has(criterion.id));
    const result = { id: criterion.id, defined: true, tests: [...tests], linked,
      executed: false, evidenceIntegrity: 'NOT_VERIFIED', testResult: 'NOT_VERIFIED',
      criterionSatisfaction: 'NOT_VERIFIED', evidenceRef: null,
      scope: 'TEST_FILE_MAPPING_ONLY' };
    if (!linked || !view || view.drift?.length) return result;
    const candidate = view.candidateTreeHash;
    for (const item of view.items ?? []) {
      if (item.kind !== 'local-verification' || !['LOCAL_PASSED','LOCAL_FAILED'].includes(item.state) || !item.verificationRef) continue;
      let evidence;
      try { evidence = evidenceFor(item.verificationRef); } catch { continue; }
      const observed = evidence?.observed, command = evidence?.command;
      const digests = view.recordedDigests;
      const sameDigests = digests && evidence?.fileDigests &&
        Object.keys(digests).length === Object.keys(evidence.fileDigests).length &&
        Object.entries(digests).every(([p, sha]) => evidence.fileDigests[p] === sha);
      if (evidence?.taskId !== current.id || evidence.workflowHash !== view.workflowHash ||
          evidence.itemId !== item.id || evidence.authority !== 'LOCAL_EXECUTED' ||
          !sameDigests ||
          observed?.contractHash !== view.workflowHash ||
          !command || !Array.isArray(command.args) || command.args[0] !== '--test' ||
          command.args[1] !== '--test-reporter=tap' ||
          !tests.every(p => command.args.slice(2).includes(p)) ||
          observed.candidateTreeHash !== command.candidateTreeHash ||
          (candidate && candidate !== command.candidateTreeHash)) continue;
      result.executed = true;
      result.evidenceRef = item.verificationRef;
      if (observed.evidenceIntegrity !== 'MATCHED') continue;
      result.evidenceIntegrity = 'MATCHED';
      if (observed.exitCode === 0 && Number.isSafeInteger(observed.tests) && observed.tests > 0 &&
          observed.passed === observed.tests && observed.failed === 0 &&
          observed.skipped === 0 && observed.todo === 0) result.testResult = 'PASS';
      else if (observed.exitCode !== 0 && observed.failed > 0 && tests.length === 1 &&
               command.args.slice(2).length === 1 && mapped.get(tests[0])?.size === 1)
        result.testResult = 'FAILED';
      if (result.testResult === 'PASS' && current.coveragePolicy === 'MAPPED_TEST_EVIDENCE_V1')
        result.criterionSatisfaction = 'SATISFIED_BY_APPROVED_TEST_MAPPING';
      // TAP totals cannot establish that this criterion's boundary was asserted.
      // A stronger criterion witness must be verified before semantic PASS.
      if (result.testResult === 'PASS') break;
    }
    return result;
  });
}

export function localAcceptance(current, plan, view, evidenceFor) {
  const result = { mode: current.acceptanceMode ?? 'PROTECTED_REQUIRED', complete: false,
    authority: 'DERIVED_ACCEPTANCE_JUDGMENT', verifierIndependence: 'UNPROTECTED', evidenceRefs: [],
    reason: 'PROTECTED_EVIDENCE_REQUIRED', criteriaCoverage: criterionEvidenceCoverage(current, plan, view, evidenceFor) };
  if (result.mode !== 'LOCAL_ONLY') return result;
  result.reason = 'LOCAL_ACCEPTANCE_UNSATISFIED';
  if (current.coveragePolicy === 'MAPPED_TEST_EVIDENCE_V1' &&
      result.criteriaCoverage.some(c => !c.linked || c.criterionSatisfaction !== 'SATISFIED_BY_APPROVED_TEST_MAPPING')) {
    result.reason = 'REQUIRED_CRITERION_EVIDENCE_MISSING';
    return result;
  }
  if (!view || current.state === 'REJECTED' || view.drift.length || !view.items.length ||
      view.items.some(i => !['PLAN_RECORDED', 'MATERIALIZED', 'LOCAL_PASSED', 'LOCAL_CHECKPOINT'].includes(i.state))) return result;
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
    return { ...result, complete: true, reason: 'CURRENT_CANDIDATE_ALL_MAPPED_TEST_FILES_LOCAL_PASSED',
      evidenceRefs: [item.verificationRef], candidateTreeHash: evidence.command.candidateTreeHash };
  }
  return result;
}
