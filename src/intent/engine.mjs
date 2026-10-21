import { discover } from './discovery.mjs';
import { validateDraft, compile, POLICY } from './contract.mjs';
import { hash } from '../alpha/contract.mjs';
import { createRegistry, selectProvider } from '../providers/registry.mjs';
import { ProviderError } from '../providers/interface.mjs';

export async function planIntent(repo, original, { registry, requested, draftInput } = {}) {
  if (typeof original !== 'string' || !original.trim() || original.length > 4000 || original.includes('\0')) throw Error('Intent requires 1..4000 text characters');
  const intent = { original, authority: 'USER_REQUEST_ONLY' };
  const stages = ['INTENT_RECEIVED'];
  const discovery = await discover(repo, original); stages.push('DISCOVERED');
  let draft, providerResult = null;
  try {
    if (draftInput !== undefined) {
      if (registry || requested) throw Error('Choose a supplied draft or a provider, not both');
      if (typeof draftInput !== 'string' || Buffer.byteLength(draftInput) > 160000) throw Error('Draft input exceeds limit');
      draft = JSON.parse(draftInput);
    } else if (registry || requested) {
      registry ??= createRegistry();
      const reports = []; for (const adapter of registry.values()) reports.push(await adapter.probe());
      const selection = selectProvider(registry, reports, { requested });
      if (!registry.get(selection.providerId).tasks?.includes('intent-planning')) throw Error('Provider lacks intent-planning contract');
      // Production edit adapters intentionally cannot accept a planning request.
      providerResult = await registry.get(selection.providerId).execute({ kind: 'IntentPlanningRequest', mode: 'PROPOSAL_ONLY', intent, discovery, timeoutMs: 30000 });
      if (providerResult.kind !== 'ProviderExecutionResult' || providerResult.mode !== 'PROPOSAL_ONLY' || providerResult.status !== 'PROPOSED' || providerResult.authority !== 'PROVIDER_REPORTED_ONLY' || providerResult.error || providerResult.execution?.error || providerResult.execution?.exitCode !== 0 || providerResult.execution?.interrupted || providerResult.execution?.truncated) throw Error('Planner process/result failed');
      if (typeof providerResult.raw?.stdout !== 'string' || Buffer.byteLength(providerResult.raw.stdout) > 160000) throw Error('Planner output missing or too large');
      draft = JSON.parse(providerResult.raw.stdout);
    } else {
      const named = discovery.files.filter(f => original.includes(f.path));
      draft = { schemaVersion: 2, objective: original, base: discovery.base, files: named.filter(f => f.kind === 'source').map(f => f.path).slice(0, 20), tests: named.filter(f => f.kind === 'test').map(f => f.path).slice(0, 20), criteria: [{ description: original, method: 'unresolved', tests: [] }], risks: /deploy|push|delete|credential|배포|삭제|운영|권한/i.test(original) ? ['Potential privileged action; separate approval required'] : [], unknowns: ['Confirm objective-to-test coverage; filename matching is not semantic verification'], effects: ['local-edit'] };
    }
    stages.push('DRAFTED');
    const validation = validateDraft(draft, discovery, original);
    if (validation.status === 'VALIDATED') stages.push('VALIDATED');
    return { kind: 'IntentPlan', intent, discovery, draft, validation, stages, providerResult, executable: false };
  } catch (error) {
    return { kind: 'IntentPlan', intent, discovery, stages, executable: false, status: 'BLOCKED', error: error.message, providerResult: error instanceof ProviderError ? error.result : providerResult };
  }
}

// Host-owned, process-local approvals. Serialized model fields are never tokens.
// No durable grant or run is created in G3; callers must review again on restart.
const grants = new WeakMap();
export function authorize(plan, { actor, contractHash, expiresAt, now = Date.now() }) {
  const contract = compile(plan);
  if (typeof actor !== 'string' || !actor.trim() || contractHash !== hash(contract) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > 3600000) throw Error('Explicit human review, matching contract hash and bounded expiry required');
  const token = Object.freeze({ stage: 'AUTHORIZED' });
  grants.set(token, { digest: contractHash, actor, expiresAt, used: false, policyHash: hash(POLICY) });
  return token;
}
export async function pin(plan, token, repo, { now = Date.now() } = {}) {
  const grant = grants.get(token), contract = compile(plan);
  if (!grant || grant.used || grant.expiresAt <= now || grant.digest !== hash(contract) || grant.policyHash !== hash(POLICY)) throw Error('Approval absent, expired, changed or consumed');
  const current = await discover(repo, plan.intent.original);
  if (current.dirty || hash(current) !== hash(contract.discovery)) throw Error('Repository/baseline changed; replan and approve');
  // Re-check after asynchronous observation to prevent concurrent token reuse.
  if (grant.used || grant.expiresAt <= Date.now()) throw Error('Approval consumed or expired');
  grant.used = true;
  return { stage: 'PINNED', contractHash: grant.digest, actor: grant.actor, base: current.base, alpha: structuredClone(contract.alpha), executionStarted: false };
}
