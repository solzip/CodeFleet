// Objective coordination records in the existing event/artifact ledger.
// No execution authority, scheduler, transport or second database lives here.
import { randomUUID } from 'node:crypto';
import { hash } from '../alpha/contract.mjs';
import { bootstrapContext, task } from './tasks.mjs';

const noGrant = { executionGranted: false, modelInvocationGranted: false, automaticReplay: false };
const identity = value => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(value);
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 8000; }
function exact(input, keys) {
  if (!input || Object.keys(input).sort().join(',') !== keys.sort().join(',')) throw Error('Invalid coordination fields');
}
function atomic(store, fn) {
  store.db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); store.db.exec('COMMIT'); return result; }
  catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function coordinationLog(store, taskId) {
  const current = task(store, taskId), events = store.events(taskId);
  const assignments = {}, handoffs = new Map(), directives = new Map();
  for (const event of events) {
    const b = event.body;
    if (event.type === 'WORKITEM_AGENT_ASSIGNED') assignments[b.itemId] = b;
    if (event.type === 'DIRECTIVE_RECORDED') directives.set(b.directiveId, { ...b, status: 'PENDING_REVIEW' });
    if (event.type === 'DIRECTIVE_RECONCILED') {
      const d = directives.get(b.directiveId);
      if (!d) throw Error('Directive event has no source record');
      Object.assign(d, b);
    }
    if (event.type === 'AGENT_HANDOFF_PREPARED') {
      const packet = store.readArtifact(b.packetRef);
      if (packet.kind !== 'ObjectiveAgentHandoff' || packet.taskId !== taskId || packet.handoffId !== b.handoffId)
        throw Error('Handoff artifact binding defect');
      handoffs.set(b.handoffId, { ...packet, packetRef: b.packetRef, status: 'PREPARED', observations: [] });
    }
    if (event.type === 'AGENT_HANDOFF_OBSERVED') {
      const h = handoffs.get(b.handoffId);
      if (!h) throw Error('Handoff observation has no packet');
      const receipt = store.readArtifact(b.receiptRef);
      if (receipt.handoffId !== h.handoffId || receipt.packetRef !== h.packetRef || receipt.status !== b.status)
        throw Error('Handoff observation binding defect');
      h.status = b.status; h.observations.push({ ...b, seq: event.seq });
    }
  }
  const all = [...handoffs.values()].map(h => ({ ...h,
    stale: h.contractRevision !== (current.contractRevision ?? 1),
    resolved: ['ACKNOWLEDGED', 'REJECTED_STALE'].includes(h.status) }));
  return { authority: 'COORDINATION_ONLY', ...noGrant, assignments, directives: [...directives.values()],
    handoffs: all, pendingHandoffs: all.filter(h => !h.resolved),
    pendingDirectives: [...directives.values()].filter(d => ['PENDING_REVIEW','AWAIT_CONTRACT_APPROVAL'].includes(d.status)) };
}

// Adoption is Fileset provenance, never a delivery/acknowledgment observation.
export function supervisedHandoffAdopted(store, taskId, h) {
  if (h.status !== 'PREPARED' || h.stale || h.observations.length) return false;
  const current = task(store, taskId), runId = current.bootstrap?.filesets[h.itemId];
  if (!runId) return false;
  const active = store.get(runId);
  let run = active;
  // A repair replaces the current Fileset, not the historical adoption. Only a
  // recorded, completed ancestor of this exact failure can resolve coordination.
  // This grants no approval to the replacement; its normal gates still apply.
  if (!run.supervisedProposal && run.operation === 'modify' && run.contract?.repairOf) {
    const failure = store.readArtifact(run.contract.repairOf.evidenceRef);
    if (run.taskId !== taskId || run.itemId !== h.itemId || run.control === 'cancel' ||
        hash(run.contract) !== run.contractHash || run.contract.workflowHash !== current.bootstrap.workflowHash ||
        failure.taskId !== taskId || failure.itemId !== run.contract.repairOf.verificationItem ||
        failure.workflowHash !== current.bootstrap.workflowHash || failure.authority !== 'LOCAL_EXECUTED' ||
        failure.status !== 'LOCAL_FAILED' || !(failure.observed?.failed > 0) || failure.observed.exitCode === 0 ||
        !store.events(taskId).some(e => e.type === 'BOOTSTRAP_REPAIR_RECORDED' &&
          e.body.itemId === h.itemId && e.body.evidenceRef === run.contract.repairOf.evidenceRef)) return false;
    const ancestor = (current.bootstrap.history ?? []).filter(r => r.itemId === h.itemId && r.state === 'COMPLETED')
      .map(r => store.get(r.runId)).find(r => r.supervisedProposal && r.state === 'COMPLETED' &&
        r.taskId === taskId && r.itemId === h.itemId && r.contract.files.every(f => failure.fileDigests[f.path] === f.sha256) &&
        run.contract.files.every(f => r.contract.files.some(old => old.path === f.path && old.sha256 === f.baseSha256)));
    if (!ancestor) return false;
    const receipt = store.readArtifact(ancestor.materializationRef);
    if (receipt.status !== 'MATERIALIZED' || receipt.authority !== 'CODEFLEET_DIRECT_WRITE' ||
        receipt.filesetHash !== ancestor.contractHash || receipt.results.length !== ancestor.contract.files.length ||
        receipt.results.some(r => hash(r) !== hash(ancestor.results[r.path]))) return false;
    run = ancestor;
  }
  const s = run.supervisedProposal;
  if (!s || run.control === 'cancel' || s.packetRef !== h.packetRef ||
      run.taskId !== taskId || run.itemId !== h.itemId || hash(run.contract) !== run.contractHash ||
      s.contractRevision !== (current.contractRevision ?? 1) ||
      run.contract.workflowHash !== current.bootstrap.workflowHash) return false;
  const proposal = store.readArtifact(s.proposalRef);
  return proposal.packetRef === h.packetRef && proposal.authority === 'PROVIDER_REPORTED_ONLY' &&
    proposal.taskId === taskId && proposal.contractRevision === s.contractRevision &&
    hash(proposal.files.map(({path,sha256,bytes}) => ({path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path))) ===
    hash(run.contract.files.map(({path,sha256,bytes}) => ({path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path)));
}

export function requireCoordinatedWorkItem(store, taskId, itemId, { preparedProposalItem = null } = {}) {
  const log = coordinationLog(store, taskId);
  if (log.pendingDirectives.length) throw Error('DIRECTIVE_REVIEW_REQUIRED');
  const { workflow } = bootstrapContext(store, taskId);
  const ancestors = new Set([itemId]);
  const visit = id => { for (const dep of workflow.items.find(i => i.id === id)?.dependencies ?? [])
    if (!ancestors.has(dep)) { ancestors.add(dep); visit(dep); } };
  visit(itemId);
  if (log.pendingHandoffs.some(h => ancestors.has(h.itemId) &&
      !supervisedHandoffAdopted(store, taskId, h) &&
      !(h.itemId === itemId && preparedProposalItem === itemId && h.status === 'PREPARED' && !h.stale && !h.observations.length)))
    throw Error('AGENT_HANDOFF_UNCONFIRMED');
}

// Assignment is a manager's scope declaration, not Host delegation or capability.
export function assignWorkItem(store, taskId, input) {
  exact(input, ['revision','itemId','agentId','reason']);
  if (!identity(input.agentId) || !text(input.reason)) throw Error('Agent identity and assignment reason required');
  return atomic(store, () => {
    const { current, workflow } = bootstrapContext(store, taskId);
    if (current.revision !== input.revision || !workflow.items.some(i => i.id === input.itemId)) throw Error('Stale assignment or unknown WorkItem');
    if (coordinationLog(store, taskId).pendingHandoffs.some(h => h.itemId === input.itemId)) throw Error('Reconcile pending handoff before reassignment');
    const body = { ...input, contractRevision: current.contractRevision ?? 1, ...noGrant };
    store.event(taskId, 'WORKITEM_AGENT_ASSIGNED', body);
    return body;
  });
}

export function recordDirective(store, taskId, input) {
  exact(input, ['directiveId','revision','text','reason']);
  if (!identity(input.directiveId) || !text(input.text) || !text(input.reason)) throw Error('Directive identity, text and reason required');
  return atomic(store, () => {
    const prior = store.events(taskId).find(e => e.type === 'DIRECTIVE_RECORDED' && e.body.directiveId === input.directiveId);
    if (prior) {
      if (prior.body.inputHash !== hash(input)) throw Error('Directive identity conflict');
      return prior.body;
    }
    const current = task(store, taskId);
    if (current.revision !== input.revision) throw Error('Stale directive context');
    const body = { ...input, inputHash: hash(input), contractRevision: current.contractRevision ?? 1, ...noGrant };
    store.event(taskId, 'DIRECTIVE_RECORDED', body);
    return body;
  });
}

export function decideDirective(store, taskId, input) {
  exact(input, ['directiveId','revision','status','reason']);
  if (!['DEFERRED','REJECTED','RETAINED_WITHOUT_CONTRACT_CHANGE'].includes(input.status) || !text(input.reason))
    throw Error('Explicit directive disposition and reason required');
  return atomic(store, () => {
    const current = task(store, taskId), log = coordinationLog(store, taskId);
    const d = log.pendingDirectives.find(d => d.directiveId === input.directiveId);
    if (!d || current.revision !== input.revision) throw Error('Pending directive and current revision required');
    if (d.reviewRef) store.event(taskId, 'CONTRACT_REVISION_REVIEW_REVOKED', { reviewRef: d.reviewRef });
    const body = { ...input, contractRevision: current.contractRevision ?? 1, authority: 'USER_DECLARED', ...noGrant };
    store.event(taskId, 'DIRECTIVE_RECONCILED', body);
    return body;
  });
}

// Called inside the existing revision transaction, after its exact review checks.
export function recordRevisionCoordination(store, current, next, receiptRef, reviewRef, impact) {
  const log = coordinationLog(store, current.id);
  for (const h of log.pendingHandoffs.filter(h => h.status === 'PREPARED' && h.contractRevision !== next.contractRevision))
    observe(store, current.id, h, 'REJECTED_STALE', { receiptRef }, 'CONTRACT_CHECK');
  for (const d of log.directives.filter(d => d.reviewRef === reviewRef && d.status === 'AWAIT_CONTRACT_APPROVAL'))
    store.event(current.id, 'DIRECTIVE_RECONCILED', { directiveId: d.directiveId, status: 'APPLIED',
      reason: d.reason, reviewRef, receiptRef, impact, contractRevision: next.contractRevision, ...noGrant });
  for (const itemId of impact.affected) {
    const assignment = log.assignments[itemId];
    if (!assignment) continue;
    prepareHandoffRecord(store, next, itemId, assignment.agentId, 'Contract revision changed assigned scope', receiptRef);
  }
}

function prepareHandoffRecord(store, current, itemId, agentId, reason, receiptRef = null) {
  const workflow = store.readArtifact(current.bootstrap.workflowRef);
  const item = workflow.items.find(i => i.id === itemId);
  if (!item) throw Error('Unknown handoff WorkItem');
  const packet = { kind: 'ObjectiveAgentHandoff', taskId: current.id, handoffId: randomUUID(),
    itemId, agentId, reason, receiptRef, contractRevision: current.contractRevision ?? 1,
    planRef: current.planRef, workflowRef: current.bootstrap.workflowRef, workflowHash: workflow.workflowHash,
    item, authority: 'COORDINATION_ONLY', ...noGrant };
  const packetRef = store.artifact(packet);
  store.event(current.id, 'AGENT_HANDOFF_PREPARED', { handoffId: packet.handoffId, packetRef, ...noGrant });
  return { ...packet, packetRef, status: 'PREPARED' };
}

export function prepareAgentHandoff(store, taskId, input) {
  exact(input, ['revision','itemId','reason']);
  if (!text(input.reason)) throw Error('Handoff reason required');
  return atomic(store, () => {
    const current = task(store, taskId), log = coordinationLog(store, taskId);
    if (current.revision !== input.revision) throw Error('Stale handoff context');
    const assignment = log.assignments[input.itemId];
    if (!assignment) throw Error('Assign WorkItem before handoff');
    if (log.pendingHandoffs.some(h => h.itemId === input.itemId && !h.stale)) throw Error('Pending handoff exists; do not duplicate delivery');
    return prepareHandoffRecord(store, current, input.itemId, assignment.agentId, input.reason);
  });
}

// Reconcile an interrupted delivery from actual Host transport records. Never
// invoke the transport again or infer success from the mere existence of a packet.
export function reconcileAgentHandoff(store, taskId, handoffId, receipt, { observed = false } = {}) {
  if (observed !== true) throw Error('Trusted Host transport observation required');
  return atomic(store, () => {
    const h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === handoffId);
    if (!h || h.status !== 'DELIVERY_UNCONFIRMED' || receipt?.agentId !== h.agentId ||
        receipt?.packetRef !== h.packetRef || !identity(receipt.messageId) || typeof receipt.delivered !== 'boolean')
      throw Error('Unmatched delivery reconciliation');
    return observe(store, taskId, h, h.stale ? 'REJECTED_STALE' : receipt.delivered ? 'DELIVERED' : 'UNDELIVERED',
      receipt, 'HOST_TRANSPORT_OBSERVED');
  });
}

function observe(store, taskId, handoff, status, details, authority) {
  const receipt = { kind: 'AgentHandoffObservation', handoffId: handoff.handoffId, packetRef: handoff.packetRef,
    status, details, authority, ...noGrant };
  const receiptRef = store.artifact(receipt);
  store.event(taskId, 'AGENT_HANDOFF_OBSERVED', { handoffId: handoff.handoffId, status, receiptRef, authority, ...noGrant });
  return receipt;
}

// Trusted Host embedding seam only: no CLI/JSON can supply the transport.
// The embedding must separately authorize messaging. A receipt never grants work.
export async function deliverAgentHandoff(store, taskId, handoffId, transport) {
  if (typeof transport !== 'function') throw Error('Authorized Host transport required');
  const handoff = atomic(store, () => {
    const h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === handoffId);
    if (!h || h.status !== 'PREPARED') throw Error('Handoff is not prepared; reconcile, never replay');
    if (supervisedHandoffAdopted(store, taskId, h)) throw Error('Supervised Fileset adopted; no concurrent Host dispatch');
    if (h.stale) { observe(store, taskId, h, 'REJECTED_STALE', {}, 'CONTRACT_CHECK'); return null; }
    observe(store, taskId, h, 'DELIVERY_UNCONFIRMED', {}, 'HOST_TRANSPORT_PENDING');
    return h;
  });
  if (!handoff) return { status: 'REJECTED_STALE', ...noGrant };
  let result;
  try { result = await transport(structuredClone(handoff)); }
  catch (error) { return { status: 'DELIVERY_UNCONFIRMED', reason: error.message, ...noGrant }; }
  return atomic(store, () => {
    const h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === handoffId);
    if (h.stale) return observe(store, taskId, h, 'REJECTED_STALE', {}, 'CONTRACT_CHECK');
    if (h.status !== 'DELIVERY_UNCONFIRMED') throw Error('Handoff changed during transport');
    if (!result || !identity(result.messageId) || result.agentId !== h.agentId || result.packetRef !== h.packetRef)
      return { status: 'DELIVERY_UNCONFIRMED', ...noGrant };
    return observe(store, taskId, h, result.delivered === true ? 'DELIVERED' : 'UNDELIVERED', result, 'HOST_TRANSPORT_OBSERVED');
  });
}

// Receipt must be observed through the same trusted Host embedding, not Agent JSON.
export function acknowledgeAgentHandoff(store, taskId, handoffId, receipt, { observed = false } = {}) {
  if (observed !== true) throw Error('Trusted Host receipt observation required');
  return atomic(store, () => {
    const h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === handoffId);
    if (!h) throw Error('Unknown handoff');
    if (h.stale) return observe(store, taskId, h, 'REJECTED_STALE', {}, 'CONTRACT_CHECK');
    if (h.status !== 'DELIVERED' || receipt?.agentId !== h.agentId || receipt?.packetRef !== h.packetRef ||
        receipt?.contractRevision !== h.contractRevision || !identity(receipt.messageId)) throw Error('Unmatched handoff acknowledgment');
    return observe(store, taskId, h, 'ACKNOWLEDGED', receipt, 'HOST_RECEIPT_OBSERVED');
  });
}
