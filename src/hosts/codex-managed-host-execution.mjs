// Trusted coordinator injection for a Codex managed read-only proposal Turn.
// NOT public execution admission, OS isolation, an Operator grant, or delivery.
// Host output is untrusted proposal data and always goes through the existing
// Controller's applyEdits -> independent Verifier -> Judge workflow.
import { runCodexReadOnlyTurn } from './codex-app-server-session.mjs';
import { approval, attempts } from '../workflow/persistence.mjs';
import { hash, applyEdits } from '../alpha/contract.mjs';
import { validateRequest, responseSchema } from '../providers/interface.mjs';

const PROVIDER_ID = 'codex-app-server-read-only';
const fail = message => { throw Error('Codex managed Host: ' + message); };
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function currentReservation(store, child) {
  if (!child?.workflowParent || !child.workflowFence || !child.workflowItemId) fail('A previously reserved workflow child is required');
  const parent = store.get(child.workflowParent);
  if (parent.kind !== 'workflow' || parent.revision !== child.workflowRevision ||
      parent.contractHash !== child.workflowGraphHash) fail('Stale workflow revision');
  const lease = store.db.prepare('SELECT owner, leaseUntil, control FROM runs WHERE id=?').get(parent.id);
  if (!lease || lease.owner !== child.workflowFence ||
      Number(lease.leaseUntil) <= Date.now() || lease.control !== 'run') fail('Workflow lease/control not current');
  approval(store, parent);
  const active = attempts(store, parent.id).filter(row => row.childId === child.id);
  if (active.length !== 1 || active[0].itemId !== child.workflowItemId ||
      active[0].revision !== parent.revision || active[0].status !== 'STARTED') fail('No exact active Attempt reservation');
  const persisted = store.get(child.id);
  if (persisted.workflowParent !== parent.id || persisted.workflowFence !== lease.owner ||
      persisted.workflowItemId !== child.workflowItemId || persisted.state !== 'READY' ||
      persisted.contractHash !== hash(child.contract)) fail('Child reservation binding mismatch');
  return parent;
}

function makePrompt(request, child) {
  // This is the minimal bounded context, not authority: source text is untrusted.
  const payload = {
    goal: request.contract.goal, workItemId: child.workflowItemId,
    contractHash: hash(request.contract), files: request.files,
    feedback: request.feedback ?? null,
    instructions: 'Return ONLY JSON matching the supplied output schema. ' +
      'Propose exact oldText/newText edits to approved source files. ' +
      'Do not run commands, tools, access network, or write files. ' +
      'You have no authority to approve, verify, deliver or declare Objective completion.'
  };
  const prompt = JSON.stringify(payload);
  if (Buffer.byteLength(prompt) > 160000) fail('Bounded Host context exceeds 160 KB');
  return prompt;
}

export function createCodexManagedHostExecution(store, {
  executable, model, enabled = false, transport = runCodexReadOnlyTurn, cwd,
} = {}) {
  if (!store || typeof transport !== 'function') fail('Store and bounded Host transport required');
  return {
    async select(run) {
      if (!enabled) fail('Disabled until separate Host Live and scope approval');
      if (run.kind !== 'workflow' || !run.contract || run.contractHash !== hash(run.contract)) fail('Invalid workflow');
      approval(store, run);
      // Do not claim tools, protected execution, or real filesystem writes.
      const allowed = new Set(['non_interactive_execution','structured_output','proposal_only']);
      if (run.contract.requiredCapabilities?.some(capability => !allowed.has(capability))) fail('Required Host capability not established');
      if (run.providerId && run.providerId !== PROVIDER_ID) fail('Host route switch requires new workflow');
      return { providerId: PROVIDER_ID, strategy: 'APP_SERVER_READ_ONLY_PROPOSAL',
        authority: 'PROVIDER_REPORTED_ONLY', protectedVerified: false, rejected: {} };
    },
    async execute(child, request) {
      if (!enabled) fail('Host Live is disabled');
      currentReservation(store, child);
      if (request.cancelled?.()) fail('Cancelled or no longer admitted');
      validateRequest({ ...request, mode: 'PROPOSAL_ONLY' });
      if (hash(request.contract) !== child.contractHash) fail('Contract hash changed');
      if (!cwd || typeof cwd !== 'string') fail('Explicit isolated Host cwd required');
      const prompt = makePrompt(request, child);
      // A bounded separate Host Turn is a potentially billable effect even when
      // its sandbox is read-only; the parent Attempt has already been reserved.
      const receipt = await transport({
        executable, cwd, model, prompt, outputSchema: responseSchema,
        timeoutMs: Math.min(request.timeoutMs, 180000), cancelled: request.cancelled,
      });
      currentReservation(store, child);
      if (request.cancelled?.()) fail('Attempt no longer admitted after Host Turn');
      if (!isObject(receipt) || receipt.terminalStatus !== 'completed' ||
          !receipt.threadId || !receipt.turnId || typeof receipt.text !== 'string' ||
          receipt.authority !== 'PROVIDER_REPORTED_ONLY' ||
          receipt.protectedVerified !== false) fail('Host receipt is incomplete or not proposal-only');
      let proposal;
      try { proposal = JSON.parse(receipt.text); }
      catch { fail('Host did not return a JSON proposal'); }
      applyEdits(request.contract, request.files, proposal);
      const safeReceipt = {
        threadId: receipt.threadId, turnId: receipt.turnId,
        terminalStatus: receipt.terminalStatus, executionMode: 'HOST_READ_ONLY_PROPOSAL',
        authority: 'PROVIDER_REPORTED_ONLY',
      };
      // Preserve a source-grounded result with UNKNOWN subscription cost.
      return {
        kind: 'ProviderExecutionResult', provider: { id: PROVIDER_ID },
        mode: 'PROPOSAL_ONLY', status: 'PROPOSED', error: null,
        authority: 'PROVIDER_REPORTED_ONLY', proposal, cost: null,
        costAuthority: 'UNKNOWN_HOST_SUBSCRIPTION', hostSessionCost: null,
        hostSessionCostStatus: 'UNKNOWN', usage: null,
        hostReceipt: safeReceipt,
        schemaValidation: { status: 'VALID', errors: [] },
        requestId: null, attemptId: child.id,
      };
    }
  };
}
