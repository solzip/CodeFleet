import path from 'node:path';
import { discover } from './discovery.mjs';
import { exact, validateDraft } from './contract.mjs';
import { git } from '../alpha/workspace.mjs';
import { hash } from '../alpha/contract.mjs';
import { requireSuccess } from '../alpha/process.mjs';
import { selectProvider } from '../providers/registry.mjs';

export async function readCodeContext(repo, objective) {
  const discovery = await discover(repo, objective), files = {}, omitted = [];
  let bytes = 0;
  for (const f of discovery.files.slice(0, 100)) {
    const result = await git(repo, ['cat-file', 'blob', f.oid], { cap: 160001 });
    if (result.truncated) { omitted.push(f.path); continue; }
    requireSuccess(result, 'Read pinned source');
    const body = result.stdout.toString('utf8');
    if (bytes + Buffer.byteLength(body) > 160000) { omitted.push(f.path); continue; }
    bytes += Buffer.byteLength(body);
    if (body.includes('\0')) throw Error('Planning requires text source');
    files[f.path] = { text: body, oid: f.oid, sha256: hash(body), kind: f.kind };
  }
  return { discovery, files, omitted, truncated: omitted.length > 0 || discovery.files.length > 100, authority: 'HOST_OBSERVED_CODE', executed: false };
}

export function validateSemanticProposal(output, context, objective) {
  exact(output, ['draft', 'references', 'inferences'], 'semantic proposal');
  if (!Array.isArray(output.references) || !output.references.length || output.references.length > 40 || !Array.isArray(output.inferences) || output.inferences.length > 20 || output.inferences.some(x => typeof x !== 'string' || !x.trim() || x.length > 4000)) throw Error('Invalid planner explanation');
  for (const ref of output.references) {
    exact(ref, ['path', 'line', 'quote'], 'code reference');
    const file = context.files[ref.path];
    if (!file || !Number.isInteger(ref.line) || ref.line < 1 || typeof ref.quote !== 'string' || !ref.quote.trim() || ref.quote.length > 1000 || !file.text.split(/\r?\n/)[ref.line - 1]?.includes(ref.quote)) throw Error('Planner code reference was not observed');
  }
  const validation = validateDraft(output.draft, context.discovery, objective);
  if ([...output.draft.files, ...output.draft.tests].some(p => !output.references.some(r => r.path === p))) throw Error('Proposed scope lacks code references');
  if (context.truncated) throw Error('Incomplete planning context requires narrower input');
  return validation;
}

export async function semanticPlan(repo, objective, { registry, requested, allowLive = false } = {}) {
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 4000 || objective.includes('\0')) throw Error('Intent requires 1..4000 characters');
  const context = await readCodeContext(repo, objective);
  const intent = { original: objective, authority: 'USER_REQUEST_ONLY' };
  let output, providerResult = null;
  if (registry) {
    const reports = []; for (const adapter of registry.values()) reports.push(await adapter.probe());
    const selection = selectProvider(registry, reports, { requested });
    if (!allowLive) throw Error('Explicit model-call consent required');
    const adapter = registry.get(selection.providerId);
    if (!adapter.tasks?.includes('semantic-planning')) throw Error('Semantic planner capability unavailable');
    providerResult = await adapter.execute({ kind: 'SemanticPlanningRequest', mode: 'PROPOSAL_ONLY', objective, context, timeoutMs: 30000, attemptBudgetUsd: 1 });
    if (providerResult.kind !== 'ProviderExecutionResult' || providerResult.mode !== 'PROPOSAL_ONLY' || providerResult.authority !== 'PROVIDER_REPORTED_ONLY' || providerResult.status !== 'PROPOSED' || providerResult.error || providerResult.execution?.exitCode !== 0 || providerResult.execution?.interrupted || providerResult.execution?.truncated || providerResult.execution?.error) throw Object.assign(Error('Semantic planner execution failed'), { providerResult });
    output = providerResult.planning;
  } else {
    // This is code-context assistance, not semantic reasoning certification.
    const words = objective.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [];
    for (const [word, terms] of Object.entries({ '동시성': ['concurrent', 'session', 'lock'], '인증': ['auth', 'token'], '세션': ['session'], '뺄셈': ['subtract'], '중복': ['duplicate', 'unique'] })) if (objective.includes(word)) words.push(...terms);
    const sources = Object.entries(context.files).filter(([, f]) => f.kind === 'source' && words.some(w => f.text.toLowerCase().includes(w))).map(([p]) => p).slice(0, 20);
    const tests = Object.entries(context.files).filter(([, f]) => f.kind === 'test' && sources.some(s => f.text.includes(path.posix.basename(s)))).map(([p]) => p).slice(0, 20);
    const references = [...sources, ...tests].map(p => {
      const lines = context.files[p].text.split(/\r?\n/), index = Math.max(0, lines.findIndex(l => l.trim()));
      return { path: p, line: index + 1, quote: lines[index].slice(0, 1000) };
    });
    output = { draft: { schemaVersion: 2, objective, base: context.discovery.base, files: sources, tests, criteria: [{ description: objective, method: tests.length ? 'protected-tests' : 'unresolved', tests }], risks: [], unknowns: ['Confirm inferred scope and test coverage with objective review; local code matching is not semantic analysis'], effects: ['local-edit'] }, references, inferences: ['Source text and test imports suggest these candidates; relevance is unverified'] };
  }
  const validation = registry ? validateSemanticProposal(output, context, objective) : validateDraft(output.draft, context.discovery, objective);
  return { kind: 'IntentPlan', intent, discovery: context.discovery, draft: output.draft, validation, stages: ['INTENT_RECEIVED', 'DISCOVERED', 'DRAFTED', ...(validation.status === 'VALIDATED' ? ['VALIDATED'] : [])], executable: false,
    analysis: { mode: registry ? 'AI_SEMANTIC_PROPOSAL' : 'LOCAL_CODE_CONTEXT', observations: output.references.map(r => ({ ...r, sha256: context.files[r.path].sha256, authority: 'HOST_OBSERVED_CODE' })), inferences: output.inferences, inferenceAuthority: 'UNVERIFIED_PROPOSAL', contextTruncated: context.truncated }, providerResult };
}
