import { createClaudeAdapter } from './claude.mjs';
import { createCodexAdapter } from './codex.mjs';
import { CAPABILITIES } from './capabilities.mjs';
import { ProviderError, resultRecord, fail, requireProposal } from './interface.mjs';

export const PROPOSAL_ENVIRONMENT = Object.freeze(['filesystem_restriction', 'network_restriction', 'credential_isolation']);

// ProviderRegistry is a small map of trusted host adapters, not a plugin loader.
export function createRegistry(adapters = [createClaudeAdapter(), createCodexAdapter()]) {
  const registry = new Map();
  for (const adapter of adapters) {
    if (!adapter.id || registry.has(adapter.id) || typeof adapter.probe !== 'function' || typeof adapter.execute !== 'function') throw Error('Invalid or duplicate provider adapter');
    registry.set(adapter.id, adapter);
  }
  return registry;
}

// ProviderSelection: { strategy, providerId, reason, rejected }. No model scores.
// Unknown/unsupported mandatory capabilities always fail closed. Reports are
// produced by trusted probes, never by request/contract/provider payloads.
export function selectProvider(registry, reports, { requested, projectDefault = 'claude', required = ['non_interactive_execution', 'structured_output', 'proposal_only'], environmentRequired = [], allowed = [...registry.keys()], previousAttempt = null } = {}) {
  if (required.some(c => !CAPABILITIES.includes(c))) throw Error('Unknown required capability');
  required = [...new Set(['non_interactive_execution', 'structured_output', 'proposal_only', ...required])];
  environmentRequired = [...new Set([...PROPOSAL_ENVIRONMENT, ...environmentRequired])];
  const rejected = {}, eligible = [];
  for (const [id] of registry) {
    const report = reports.find(r => r.identity.id === id);
    const reasons = [];
    if (!report?.installed || !report.identity.version) reasons.push('Installation/version unavailable');
    for (const name of required) if (report?.capabilities?.[name]?.status !== 'SUPPORTED') reasons.push(`Capability ${name} not verified supported`);
    for (const name of environmentRequired) if (report?.environment?.[name]?.status !== 'SUPPORTED') reasons.push(`Environment ${name} not verified supported`);
    if (!allowed.includes(id)) reasons.push('Denied by host policy');
    if (report?.executionBlocked) reasons.push(report.executionBlocked);
    if (reasons.length) rejected[id] = reasons; else eligible.push(id);
  }
  const selected = requested ?? (eligible.includes(projectDefault) ? projectDefault : eligible.sort()[0]);
  if (!selected || !eligible.includes(selected)) throw new ProviderError(fail(resultRecord({ id: selected ?? 'none' }), 'CAPABILITY_UNAVAILABLE', JSON.stringify(rejected)));
  // G2 deliberately does not automate post-launch failover. Even a dead PID
  // isn't sufficient proof that tools/remote effects stopped.
  if (previousAttempt && previousAttempt.providerId !== selected) throw new ProviderError(fail(resultRecord({ id: selected }), 'FALLBACK_BLOCKED', 'Provider switching after an attempt requires coordinator reconciliation; unavailable in G2'));
  return { strategy: 'Balanced', providerId: selected, reason: requested ? 'Explicit selection after hard filters' : selected === projectDefault ? 'Eligible project default' : 'Deterministic provider id order', rejected };
}

export async function proposeSelected(request, { registry = createRegistry(), ...selectionOptions } = {}) {
  const reports = [];
  for (const adapter of registry.values()) reports.push(await adapter.probe());
  const selection = selectProvider(registry, reports, selectionOptions);
  const result = await registry.get(selection.providerId).execute(request);
  return { ...requireProposal(result), selection };
}
