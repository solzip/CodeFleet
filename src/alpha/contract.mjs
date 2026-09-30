import { createHash } from 'node:crypto';

export const IMAGE = 'node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
export const hash = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export function filePath(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.') || p.endsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) throw Error(`Unsafe relative file path: ${String(value)}`);
  return value;
}
function keys(obj, allowed, label) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw Error(`${label} must be an object`);
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) throw Error(`Unknown ${label} field: ${key}`);
}
export function validateContract(input) {
  keys(input, ['schemaVersion', 'goal', 'files', 'context', 'tests', 'maxAttempts', 'timeoutSeconds', 'attemptBudgetUsd', 'delivery'], 'contract');
  if (input.schemaVersion !== 1) throw Error('schemaVersion must be 1');
  if (typeof input.goal !== 'string' || input.goal.trim().length < 10 || input.goal.length > 4000) throw Error('Provide a goal of 10..4000 characters');
  for (const key of ['files', 'context', 'tests']) {
    if (!Array.isArray(input[key]) || input[key].length < 1 || input[key].length > 20) throw Error(`${key} requires 1..20 explicit paths`);
    input[key].forEach(filePath);
    if (new Set(input[key].map(p => p.toLowerCase())).size !== input[key].length) throw Error(`Duplicate ${key}`);
  }
  for (const file of input.files) {
    if (!file.startsWith('src/') || !/\.(mjs|cjs|js|ts)$/.test(file) || /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./i.test(file)) throw Error('Alpha edits only non-test JS/TS files under src/');
    if (!input.context.includes(file)) throw Error(`Editable file must be explicit context: ${file}`);
  }
  for (const test of input.tests) {
    if (!/^(test|tests)\/.*\.(test|spec)\.(mjs|cjs|js|ts)$/.test(test)) throw Error('Tests must name explicit Node test files under test/ or tests/');
    if (input.files.includes(test)) throw Error('Verification assets must be protected');
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 5) throw Error('maxAttempts must be 1..5');
  if (!Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds < 30 || input.timeoutSeconds > 1800) throw Error('timeoutSeconds must be 30..1800');
  if (!Number.isFinite(input.attemptBudgetUsd) || input.attemptBudgetUsd <= 0 || input.attemptBudgetUsd > 10) throw Error('attemptBudgetUsd must be >0 and <=10 (provider limit; measured cost can be unavailable)');
  keys(input.delivery, ['mode', 'repository', 'base', 'authorName', 'authorEmail'], 'delivery');
  if (!['local', 'pull-request'].includes(input.delivery.mode)) throw Error('delivery mode must be local or pull-request');
  if (input.delivery.mode === 'pull-request') {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.delivery.repository ?? '')) throw Error('Specify delivery repository owner/name');
    if (!/^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(input.delivery.base ?? '') || input.delivery.base.includes('..')) throw Error('Specify a safe base branch');
    if (typeof input.delivery.authorName !== 'string' || !input.delivery.authorName.trim() || /[\r\n<>]/.test(input.delivery.authorName) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.delivery.authorEmail ?? '')) throw Error('Specify public authorName and authorEmail explicitly');
  }
  return structuredClone(input);
}

export function applyEdits(contract, originals, proposal) {
  keys(proposal, ['summary', 'edits'], 'proposal');
  if (typeof proposal.summary !== 'string' || proposal.summary.length > 4000 || !Array.isArray(proposal.edits) || proposal.edits.length < 1 || proposal.edits.length > 30) throw Error('Expected a summary and 1..30 edits');
  const result = { ...originals };
  for (const edit of proposal.edits) {
    keys(edit, ['path', 'oldText', 'newText'], 'edit');
    if (!contract.files.includes(filePath(edit.path))) throw Error(`Edit outside delegated scope: ${edit.path}`);
    if (typeof edit.oldText !== 'string' || !edit.oldText || typeof edit.newText !== 'string' || edit.newText.length > 64000 || edit.oldText === edit.newText) throw Error('Edit must make a bounded, non-empty change');
    const source = result[edit.path];
    if (typeof source !== 'string' || source.split(edit.oldText).length !== 2) throw Error(`oldText must match exactly once: ${edit.path}`);
    result[edit.path] = source.replace(edit.oldText, () => edit.newText);
  }
  return result;
}

export function judge(evidence) {
  if (evidence.interrupted || evidence.truncated || !evidence.integrity) return { outcome: 'ESCALATE', reason: 'Evidence incomplete, interrupted, or mismatched' };
  if (evidence.testIdentityMatch !== true) return { outcome: 'ESCALATE', reason: 'Test identities missing or different from the failing baseline; independent review required' };
  if (evidence.exitCode === 0 && evidence.tests > 0 && evidence.passed === evidence.tests && evidence.failed === 0 && evidence.skipped === 0 && evidence.todo === 0) return { outcome: 'ACCEPT', reason: 'Baseline test identities matched and reported passing; independent code review remains required' };
  return { outcome: 'RETRY', reason: 'Declared tests failed, were skipped, or did not execute' };
}
