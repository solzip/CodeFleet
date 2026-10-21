import { hash, filePath, validateContract } from '../alpha/contract.mjs';

export function exact(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)) || fields.some(k => !Object.hasOwn(value, k))) throw Error(`Invalid ${label} fields`);
}
function text(s) { if (typeof s !== 'string' || !s.trim() || s.length > 4000) throw Error('Expected bounded non-empty text'); }
function list(xs) { if (!Array.isArray(xs) || xs.length > 20) throw Error('Expected bounded array'); }

export function validateDraft(draft, discovery, original = draft?.objective) {
  exact(draft, ['schemaVersion', 'objective', 'base', 'files', 'tests', 'criteria', 'risks', 'unknowns', 'effects'], 'TaskDraft');
  if (draft.schemaVersion !== 2 || draft.base !== discovery.base) throw Error('Draft version/baseline mismatch');
  text(draft.objective);
  if (draft.objective !== original) throw Error('Planner cannot replace the original objective');
  for (const key of ['files', 'tests', 'criteria', 'risks', 'unknowns', 'effects']) list(draft[key]);
  for (const key of ['files', 'tests']) {
    if (new Set(draft[key]).size !== draft[key].length) throw Error('Duplicate paths');
    for (const f of draft[key]) filePath(f);
  }
  draft.risks.forEach(text); draft.unknowns.forEach(text); draft.effects.forEach(text);
  const gaps = [], unknowns = [...draft.unknowns];
  if (/deploy|push|delete|credential|배포|삭제|운영|권한/i.test(original)) unknowns.push('Potential privileged intent requires explicit scope clarification; planner cannot waive it');
  const known = new Map(discovery.files.map(f => [f.path, f.kind]));
  for (const f of draft.files) {
    if (!known.has(f)) gaps.push(`NEW_FILE_OR_OUTSIDE_DISCOVERY: ${f}`);
    else if (known.get(f) !== 'source') gaps.push(`PROTECTED_TEST_EDIT: ${f}`);
  }
  for (const f of draft.tests) if (known.get(f) !== 'test') throw Error(`Undiscovered test: ${f}`);
  if (!draft.files.length) unknowns.push('Select explicit existing source files');
  if (!draft.tests.length) unknowns.push('Select protected regression tests');
  if (!draft.criteria.length) unknowns.push('Define required acceptance criteria');
  for (const c of draft.criteria) {
    exact(c, ['description', 'method', 'tests'], 'criterion'); text(c.description); list(c.tests);
    if (c.method !== 'protected-tests' || !c.tests.length) unknowns.push(`No executable method: ${c.description}`);
    if (c.tests.some(t => !draft.tests.includes(t))) throw Error('Criterion test outside protected scope');
  }
  if (draft.effects.some(e => e !== 'local-edit')) gaps.push('UNSUPPORTED_EFFECT_REQUIRES_SEPARATE_APPROVAL');
  if (!draft.effects.includes('local-edit')) gaps.push('ALPHA_REQUIRES_LOCAL_EDIT');
  if (draft.risks.length) unknowns.push('Risk assessment requires explicit resolution before authorization');
  if (discovery.dirty) unknowns.push('Working tree has changes; review and replan from a clean baseline');
  if (discovery.excluded.length) gaps.push('UNSUPPORTED_TREE_ENTRIES');
  let v1 = null;
  if (!gaps.length && !unknowns.length) {
    try { v1 = validateContract({ schemaVersion: 1, goal: draft.objective, files: draft.files, context: draft.files, tests: draft.tests, maxAttempts: 1, timeoutSeconds: 300, attemptBudgetUsd: 1, delivery: { mode: 'local' } }); }
    catch (error) { gaps.push(`ALPHA_V1_CAPABILITY_GAP: ${error.message}`); }
  }
  return { status: gaps.length ? 'CAPABILITY_GAP' : unknowns.length ? 'NEEDS_INPUT' : 'VALIDATED', gaps, unknowns, v1 };
}

// Fixed G3 policy: no command, remote delivery or verification waiver extension.
export const POLICY = Object.freeze({ version: 'g3-local-v1', mode: 'PROPOSAL_ONLY', delivery: 'local', requiredVerification: true, approval: 'human', uses: 1 });
export function compile(plan) {
  const validation = validateDraft(plan.draft, plan.discovery, plan.intent.original);
  if (validation.status !== 'VALIDATED') throw Error(validation.status);
  return { schemaVersion: 2, kind: 'TaskContract', intent: plan.intent, discovery: plan.discovery, draft: plan.draft, policyHash: hash(POLICY), alpha: validation.v1 };
}
