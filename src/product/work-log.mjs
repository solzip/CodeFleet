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

// Structural validation of historical records is not Host authentication.
function recordedNonDelivery(h, receipt) {
  return receipt.kind === 'AgentHandoffObservation' && receipt.status === 'UNDELIVERED' &&
    receipt.authority === 'HOST_TRANSPORT_OBSERVED' && receipt.handoffId === h.handoffId &&
    receipt.packetRef === h.packetRef && receipt.details?.delivered === false &&
    receipt.details.agentId === h.agentId && receipt.details.packetRef === h.packetRef && identity(receipt.details.messageId);
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
      if (h.closure || b.status === 'UNDELIVERED' && (h.status !== 'DELIVERY_UNCONFIRMED' ||
          b.authority !== 'HOST_TRANSPORT_OBSERVED' || !recordedNonDelivery(h, receipt)))
        throw Error('Confirmed Host nondelivery observation required');
      if (['DELIVERED','UNDELIVERED','ACKNOWLEDGED'].includes(b.status) ||
          b.status === 'REJECTED_STALE' && h.status !== 'PREPARED')
        h.observationBlocker = 'HOST_ADAPTER_UNAVAILABLE';
      h.status = b.status; h.observations.push({ ...b, seq: event.seq });
    }
    if (event.type === 'AGENT_HANDOFF_CLOSED') {
      const h = handoffs.get(b.handoffId);
      if (!h || h.closure || h.status !== 'UNDELIVERED' || b.receiptRef !== h.observations.at(-1)?.receiptRef ||
          !recordedNonDelivery(h, store.readArtifact(b.receiptRef))) throw Error('Invalid nondelivery closure');
      h.closure = { ...b, seq: event.seq };
      h.observationBlocker = 'HOST_ADAPTER_UNAVAILABLE';
    }
  }
  const all = [...handoffs.values()].map(h => ({ ...h,
    stale: h.contractRevision !== (current.contractRevision ?? 1),
    resolved: !h.observationBlocker && h.status === 'REJECTED_STALE' }));
  return { authority: 'COORDINATION_ONLY', ...noGrant, assignments, directives: [...directives.values()],
    hostObservation: 'HOST_ADAPTER_UNAVAILABLE',
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
    const pending = coordinationLog(store, current.id).pendingHandoffs.filter(h => h.itemId === itemId);
    if (pending.length) {
      store.event(current.id, 'AGENT_HANDOFF_PREPARATION_DEFERRED', { itemId, agentId: assignment.agentId,
        contractRevision: next.contractRevision, receiptRef, handoffIds: pending.map(h => h.handoffId),
        reason: 'UNRESOLVED_PRIOR_HANDOFF', ...noGrant });
      continue;
    }
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
    if (log.pendingHandoffs.some(h => h.itemId === input.itemId)) throw Error('Pending handoff exists; do not duplicate delivery');
    return prepareHandoffRecord(store, current, input.itemId, assignment.agentId, input.reason);
  });
}

// No supported independent Host event verifier exists. Historical authority
// labels and same-user embedding reports cannot authorize closure.
export function closeUndeliveredHandoff(store, taskId, input) {
  exact(input, ['revision','handoffId','reason']);
  if (!text(input.reason)) throw Error('Handoff closure reason required');
  return atomic(store, () => {
    const current = task(store, taskId), h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === input.handoffId);
    if (current.revision !== input.revision) throw Error('Stale handoff closure context');
    if (!h || h.closure || h.status !== 'UNDELIVERED') throw Error('Confirmed undelivered handoff required; reconcile uncertain delivery');
    throw Error('HOST_ADAPTER_UNAVAILABLE: independent nondelivery evidence required; closure not authorized');
  });
}

// Reconcile an interrupted delivery from actual Host transport records. Never
// invoke the transport again or infer success from the mere existence of a packet.
export function reconcileAgentHandoff(store, taskId, handoffId, receipt, { observed = false } = {}) {
  if (observed !== true) throw Error('Trusted Host transport observation required; caller reports are not evidence');
  return atomic(store, () => {
    const h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === handoffId);
    if (!h || h.status !== 'DELIVERY_UNCONFIRMED' || receipt?.agentId !== h.agentId ||
        receipt?.packetRef !== h.packetRef || !identity(receipt.messageId) || typeof receipt.delivered !== 'boolean')
      throw Error('Unmatched delivery reconciliation');
    throw Error('HOST_ADAPTER_UNAVAILABLE: observed=true and caller receipts do not authenticate Host events');
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
    const log = coordinationLog(store, taskId), h = log.handoffs.find(h => h.handoffId === handoffId);
    if (!h || h.status !== 'PREPARED') throw Error('Handoff is not prepared; reconcile, never replay');
    if (log.pendingHandoffs.some(other => other.itemId === h.itemId && other.handoffId !== h.handoffId))
      throw Error('RECONCILE: prior handoff for this WorkItem remains unresolved');
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
    if (h.status !== 'DELIVERY_UNCONFIRMED') throw Error('Handoff changed during transport');
    if (!result || typeof result.delivered !== 'boolean' || !identity(result.messageId) || result.agentId !== h.agentId || result.packetRef !== h.packetRef)
      return { status: 'DELIVERY_UNCONFIRMED', ...noGrant };
    // Persist the embedding report at its actual trust level, retaining uncertain
    // effects even for a claimed false result or a revision during dispatch.
    return observe(store, taskId, h, 'DELIVERY_UNCONFIRMED', result, 'EMBEDDING_REPORTED_ONLY');
  });
}

// Receipt must be observed through the same trusted Host embedding, not Agent JSON.
export function acknowledgeAgentHandoff(store, taskId, handoffId, receipt, { observed = false } = {}) {
  if (observed !== true) throw Error('Trusted Host receipt observation required');
  return atomic(store, () => {
    const h = coordinationLog(store, taskId).handoffs.find(h => h.handoffId === handoffId);
    if (!h) throw Error('Unknown handoff');
    if (h.closure || h.status !== 'DELIVERED') throw Error('Unmatched or closed handoff acknowledgment');
    if (h.status !== 'DELIVERED' || receipt?.agentId !== h.agentId || receipt?.packetRef !== h.packetRef ||
        receipt?.contractRevision !== h.contractRevision || !identity(receipt.messageId)) throw Error('Unmatched handoff acknowledgment');
    throw Error('HOST_ADAPTER_UNAVAILABLE: caller acknowledgment is not independent Host evidence');
  });
}
