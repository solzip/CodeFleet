import { applyEdits, validateContract } from '../alpha/contract.mjs';

/**
 * ProviderIdentity: { id, version, platform, executable }
 * ProviderCapabilities: capability -> { status, advertised, evidence }
 * ProviderExecutionRequest: { contract, files, feedback?, timeoutMs, cancelled? }
 * ProviderExecutionResult: proposal + separate process/raw/usage/schema/error data.
 * All payloads and usage remain PROVIDER_REPORTED_ONLY, including exit zero.
 * These interfaces are for trusted host code, never model-supplied configuration.
 */
export class ProviderError extends Error {
  constructor(result) {
    super(`Provider ${result.provider.id}: ${result.error.code}: ${result.error.message}`);
    this.name = 'ProviderError'; this.code = result.error.code; this.result = result;
  }
}

export const responseSchema = {
  type: 'object', additionalProperties: false, required: ['summary', 'edits'], properties: {
    summary: { type: 'string' }, edits: { type: 'array', minItems: 1, maxItems: 30, items: {
      type: 'object', additionalProperties: false, required: ['path', 'oldText', 'newText'], properties: { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }
    } }
  }
};

export function validateRequest(request) {
  const contract = validateContract(request.contract);
  if (request.mode !== undefined && request.mode !== 'PROPOSAL_ONLY') throw Error('Only PROPOSAL_ONLY is supported');
  if (request.sessionId !== undefined) throw Error('Session reuse is not supported');
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) throw Error('Finite positive timeout required');
  const allowed = new Set([...contract.context, ...contract.tests]);
  if (!request.files || Object.keys(request.files).length !== allowed.size ||
      Object.keys(request.files).some(f => !allowed.has(f)) ||
      [...allowed].some(f => typeof request.files[f] !== 'string' || request.files[f].includes('\0')) ||
      Buffer.byteLength(Object.values(request.files).join('')) > 160000) throw Error('Context must contain only the complete declared text files (160 KB maximum)');
  return contract;
}

export function resultRecord(provider, processResult = null) {
  return {
    kind: 'ProviderExecutionResult', provider, mode: 'PROPOSAL_ONLY', status: 'FAILED',
    authority: 'PROVIDER_REPORTED_ONLY', proposal: null, cost: null, costAuthority: 'PROVIDER_REPORTED_ONLY',
    usage: null, events: [], schemaValidation: { status: 'NOT_RUN', errors: [] }, error: null,
    execution: processResult ? { exitCode: processResult.exitCode, interrupted: processResult.interrupted, truncated: processResult.truncated, error: processResult.error ?? null } : null,
    raw: processResult ? { stdout: processResult.stdout.toString('utf8'), stderr: processResult.stderr.toString('utf8') } : null
  };
}

export function fail(result, code, message) {
  result.error = { code, message }; return result;
}

// Parsers never start processes. They can be exercised with captured fixtures
// even while the corresponding live adapter is unavailable.
export function normalize(provider, processResult, request, parse) {
  const result = resultRecord(provider, processResult);
  if (processResult.interrupted) return fail(result, request.cancelled?.() ? 'CANCELLED' : 'INTERRUPTED', 'Process interrupted; timeout or cancellation, not a successful proposal');
  if (processResult.truncated) return fail(result, 'OUTPUT_LIMIT', 'Provider output exceeded the capture limit');
  if (processResult.exitCode !== 0 || processResult.error) return fail(result, 'PROCESS_FAILED', 'Provider process did not exit successfully');
  let parsed;
  try { parsed = parse(result.raw.stdout); }
  catch (error) { return fail(result, error.code ?? 'INVALID_JSON', error.message); }
  result.usage = parsed.usage ?? null; result.events = parsed.events ?? [];
  result.cost = Number.isFinite(parsed.cost) && parsed.cost >= 0 ? parsed.cost : null;
  try {
    validateRequest(request);
    // Reuse the V1 schema/scope validator, including exact oldText and protected
    // test restrictions. This does not apply any file edits.
    applyEdits(request.contract, request.files, parsed.proposal);
    result.proposal = parsed.proposal; result.schemaValidation.status = 'VALID';
  } catch (error) {
    result.schemaValidation = { status: 'INVALID', errors: [error.message] };
    return fail(result, 'INVALID_PROPOSAL', error.message);
  }
  result.status = 'PROPOSED'; return result;
}

export function requireProposal(result) {
  if (result.status !== 'PROPOSED' || result.error) throw new ProviderError(result);
  return result;
}
