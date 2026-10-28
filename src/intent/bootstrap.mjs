import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { filePath, hash } from '../alpha/contract.mjs';
import { exact } from './contract.mjs';

// NEW_PROJECT planning contract. Nothing here is observed code: the objective is
// USER_DECLARED, every Draft field is PLANNED, and only the Repository Probe is
// host-observed. Draft input can neither choose the contract nor carry authority,
// references or evidence fields, so a planned file cannot pose as existing code.
export const BOOTSTRAP_LIMITS = Object.freeze({ list: 20, files: 30, items: 12, text: 4000 });
export const PROVENANCE = Object.freeze({ objective: 'USER_DECLARED', draft: 'PLANNED', probe: 'HOST_OBSERVED_REPOSITORY_STATE', code: 'NONE' });
export const APPROVAL_REQUIREMENTS = Object.freeze(['HASH_BOUND_FILESET_APPROVAL_PER_LOCAL_EDIT_ITEM', 'GIT_INIT_AND_COMMIT_ARE_USER_ACTIONS', 'TESTS_RUN_ONLY_THROUGH_EXPLICIT_LOCAL_TRUST_OR_EXISTING_CONTRACT']);
const TEST = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./i;
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

// Unknowns derived from the objective itself. No Draft can clear them; only an
// operator ObjectiveClarification bound to this task, objective and subject can.
const PRIVILEGED = /deploy|push|delete|credential|배포|삭제|운영|권한/gi;
const PRIVILEGED_TEXT = 'Potential privileged intent requires explicit scope clarification; planner cannot waive it';
// Recognize a deliberately bounded set of explicit prohibitions, not arbitrary
// natural-language intent. Unrecognized objects, conditions and double negations
// remain unknown. Match occurrences, never remove a term globally: a later
// positive request for the same action must still require clarification.
const ACTION = String.raw`(?:Git\s+)?(?:deployment|deploy|push|delete|credentials?|배포|삭제|운영|권한)`;
const ACTIONS = `${ACTION}(?:\\s*(?:와|과|및|또는|그리고|\\band\\b|\\bor\\b)\\s*${ACTION})*`;
const END_PROHIBITION = String.raw`(?=\s*(?:$|[.;,!?\n])|\s+but\b)`;
const PROHIBITIONS = [
  new RegExp(String.raw`(?:^|[.;,!?\n])\s*(?:please\s+)?(?:do\s+not|don['’]t|never|no)\s+${ACTIONS}${END_PROHIBITION}`, 'giu'),
  new RegExp(String.raw`\bwithout\s+${ACTIONS}${END_PROHIBITION}`, 'giu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}_])${ACTIONS}(?:은|는|을|를)?\s*(?:(?:금지|제외|하지\s*마(?:세요)?)${END_PROHIBITION}|하지\s*말고(?=\s|$))`, 'giu'),
];
function prohibitedOccurrences(original) {
  const spans = [];
  for (const pattern of PROHIBITIONS) {
    for (const match of original.matchAll(pattern)) {
      // "not without deployment" is not an exclusion. Keep uncertain embedding
      // conservative instead of treating a negative word as a global waiver.
      const prefix = original.slice(0, match.index).split(/[.;!?\n]/).at(-1);
      if (/\b(?:not|never|no|ignore|disregard)\b|무시|아니/i.test(prefix)) continue;
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  return spans;
}
export function objectiveUnknowns(original) {
  const input = String(original), prohibited = prohibitedOccurrences(input);
  const terms = [...new Set([...input.matchAll(PRIVILEGED)]
    .filter(m => !prohibited.some(([start, end]) => m.index >= start && m.index + m[0].length <= end))
    .map(m => m[0].toLowerCase()))].sort();
  if (!terms.length) return [];
  return [{ id: 'privileged-intent', text: PRIVILEGED_TEXT, terms, objectiveHash: hash(original), subjectHash: hash({ id: 'privileged-intent', text: PRIVILEGED_TEXT, terms }) }];
}

function text(s) { if (typeof s !== 'string' || !s.trim() || s.length > BOOTSTRAP_LIMITS.text) throw Error('Expected bounded non-empty text'); }
function list(xs, max = BOOTSTRAP_LIMITS.list) { if (!Array.isArray(xs) || xs.length > max) throw Error('Expected bounded array'); }
function id(value) { if (typeof value !== 'string' || !ID.test(value)) throw Error(`Invalid id: ${String(value)}`); }

export function bootstrapSkeleton(probe, objective) {
  return { schemaVersion: 1, kind: 'BootstrapDraft', objective, probeRef: probe.probeHash, requirements: [], openQuestions: [], decisions: [], plannedFiles: [], plannedTests: [], criteria: [], scope: { includes: [], excludes: [] }, risks: [], workItems: [] };
}

// `existing` lists planned paths already present in the target directory; the
// async caller measures it with existingPaths so validation itself stays pure.
// `clarifications` are records the task layer has already bound to this task and
// read through hash-checked artifacts; here they must also match objective and subject.
export function validateBootstrapDraft(draft, probe, original, existing = [], clarifications = [], existingLocal = false) {
  if (existingLocal ? !['UNBORN_HEAD','BOOTSTRAP_CANDIDATE','EXISTING_SOURCE'].includes(probe?.state) : probe?.contract !== 'NEW_PROJECT') return { status: 'CAPABILITY_GAP', gaps: [`NOT_A_NEW_PROJECT: ${probe?.state ?? 'UNPROBED'}`], unknowns: [], provenance: PROVENANCE, executable: false, approved: false, complete: false };
  exact(draft, ['schemaVersion', 'kind', 'objective', 'probeRef', 'requirements', 'openQuestions', 'decisions', 'plannedFiles', 'plannedTests', 'criteria', 'scope', 'risks', 'workItems'], 'BootstrapDraft');
  if (!(existingLocal?[1,2]:[1]).includes(draft.schemaVersion) || draft.kind !== (existingLocal ? 'ExistingLocalDraft' : 'BootstrapDraft')) throw Error('BootstrapDraft version mismatch');
  if (draft.probeRef !== probe.probeHash) throw Error('Draft probe baseline mismatch');
  text(draft.objective);
  if (draft.objective !== original) throw Error('Planner cannot replace the original objective');
  for (const key of ['requirements', 'openQuestions', 'decisions', 'criteria', 'risks']) list(draft[key]);
  list(draft.plannedFiles, BOOTSTRAP_LIMITS.files); list(draft.plannedTests, BOOTSTRAP_LIMITS.files); list(draft.workItems, BOOTSTRAP_LIMITS.items);
  [...draft.requirements, ...draft.openQuestions, ...draft.risks].forEach(text);
  for (const d of draft.decisions) { exact(d, ['topic', 'choice', 'alternatives', 'rationale'], 'decision'); text(d.topic); text(d.choice); text(d.rationale); list(d.alternatives); d.alternatives.forEach(text); }
  exact(draft.scope, ['includes', 'excludes'], 'scope'); list(draft.scope.includes); list(draft.scope.excludes);
  [...draft.scope.includes, ...draft.scope.excludes].forEach(text);
  const paths = [];
  for (const f of draft.plannedFiles) { exact(f, ['path', 'purpose'], 'planned file'); filePath(f.path); text(f.purpose); if(existingLocal && draft.schemaVersion===1 && !/^src\/.+\.mjs$/.test(f.path)) throw Error('Existing Local v1 requires source modules'); if (TEST.test(f.path)) throw Error(`Planned test listed as source: ${f.path}`); paths.push(f.path); }
  const criterionIds = new Set(draft.criteria.map(c => c?.id));
  for (const t of draft.plannedTests) {
    exact(t, ['path', 'criteria'], 'planned test'); filePath(t.path);
    if (!TEST.test(t.path)) throw Error(`Planned test path is not a test: ${t.path}`);
    list(t.criteria); if (t.criteria.some(c => !criterionIds.has(c))) throw Error('Planned test cites an unknown criterion');
    paths.push(t.path);
  }
  if (new Set(paths.map(p => p.toLowerCase())).size !== paths.length) throw Error('Duplicate planned paths');
  if (!existingLocal && existing.length) throw Error(`Planned path already exists; it cannot be planned as new: ${existing[0]}`);
  if (existingLocal && draft.schemaVersion===1 && paths.some(p=>!existing.includes(p))) throw Error('Existing Local v1 requires existing files');
  if (existingLocal && draft.plannedTests.some(t=>!existing.includes(t.path))) throw Error('Existing Local acceptance tests must exist before planning');
  const tests = new Set(draft.plannedTests.map(t => t.path)), unknowns = [], gaps = [];
  for (const c of draft.criteria) {
    exact(c, ['id', 'description', 'tests'], 'criterion'); id(c.id); text(c.description); list(c.tests);
    if (c.tests.some(t => !tests.has(t))) throw Error('Criterion test outside planned tests');
    if (!c.tests.length) unknowns.push(`No planned test: ${c.id}`);
  }
  if (criterionIds.size !== draft.criteria.length) throw Error('Duplicate criterion id');
  if (!draft.requirements.length) unknowns.push('State requirements');
  if (!draft.decisions.length) unknowns.push('Record the technology and design decisions');
  if (!draft.plannedFiles.length) unknowns.push('Plan at least one file');
  if (!draft.criteria.length) unknowns.push('Define acceptance criteria');
  if (!draft.workItems.length) unknowns.push('Propose bootstrap WorkItems');
  if (draft.openQuestions.length) unknowns.push('Open questions require an answer before authorization');
  const clarifiable = [], clarified = [];
  for (const u of objectiveUnknowns(original)) {
    const c = clarifications.find(c => c.unknownId === u.id && c.objectiveHash === u.objectiveHash && c.subjectHash === u.subjectHash);
    if (c) clarified.push({ unknownId: u.id, actor: c.actor, scope: c.scope, ref: c.ref, authority: 'USER_DECLARED', grantsExecution: false });
    else unknowns.push(u.text);
    clarifiable.push({ id: u.id, text: u.text, terms: u.terms, status: c ? 'CLARIFIED' : 'OPEN' });
  }
  // Planning stays available outside Git; file creation is checked separately.
  const materialization = probe.state === 'NOT_GIT' ? 'BLOCKED_GIT_REPOSITORY_REQUIRED' : 'REQUIRES_PREFLIGHT_AND_APPROVAL';
  return { status: unknowns.length ? 'NEEDS_INPUT' : 'VALIDATED', gaps, unknowns, clarifiable, clarified, provenance: PROVENANCE, approvalRequirements: APPROVAL_REQUIREMENTS, materialization, draftHash: hash(draft), executable: false, approved: false, complete: false };
}

// Every path is checked with lstat, so a dangling link or a path below a link
// is reported as present rather than followed.
export async function existingPaths(root, paths) {
  const found = [];
  for (const p of paths) {
    try { filePath(p); } catch { continue; } // unsafe paths are rejected by validation, never probed
    const parts = p.split('/');
    for (let i = 0; i < parts.length; i++) {
      let s;
      try { s = await lstat(path.join(root, ...parts.slice(0, i + 1))); }
      catch (e) { if (e.code === 'ENOENT') break; throw e; }
      if (s.isSymbolicLink() || i === parts.length - 1 || !s.isDirectory()) { found.push(p); break; }
    }
  }
  return found;
}
export const draftPaths = draft => [...(draft?.plannedFiles ?? []).map(f => f?.path), ...(draft?.plannedTests ?? []).map(t => t?.path)].filter(p => typeof p === 'string');
