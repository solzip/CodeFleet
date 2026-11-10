import { hash } from '../alpha/contract.mjs';
import { task } from './tasks.mjs';
import { prepareContractRevision } from './contract-revisions.mjs';
import { coordinationLog } from './work-log.mjs';

// Interpretation is supplied as a full validated draft by the existing Host.
// Text alone never mutates an approved contract or infers execution permission.
export async function reconcileDirective(store, taskId, directiveId, proposal) {
  const current = task(store, taskId);
  const directive = coordinationLog(store, taskId).directives.find(d => d.directiveId === directiveId);
  if (!directive || directive.status !== 'PENDING_REVIEW') throw Error('Pending directive required');
  if (directive.contractRevision !== (current.contractRevision ?? 1)) throw Error('Directive requires fresh context review');
  const prepared = await prepareContractRevision(store, taskId, proposal);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (hash(task(store, taskId)) !== prepared.review.taskHash ||
        coordinationLog(store, taskId).directives.find(d => d.directiveId === directiveId)?.status !== 'PENDING_REVIEW')
      throw Error('Directive context changed');
    const assignments = coordinationLog(store, taskId).assignments;
    const impact = { ...prepared.review.impact,
      agents: [...new Set(prepared.review.impact.affected.map(id => assignments[id]?.agentId).filter(Boolean))],
      candidateHash: prepared.review.candidateHash, previousPlanRef: current.planRef,
      approvals: 'OLD_WORKFLOW_BOUND_PENDING_APPROVALS_REQUIRE_FRESH_REVIEW',
      evidence: 'PRESERVE_HISTORY_REVALIDATE_AFFECTED_ITEMS' };
    store.event(taskId, 'DIRECTIVE_RECONCILED', { directiveId, status: 'AWAIT_CONTRACT_APPROVAL',
      reason: directive.reason, reviewRef: prepared.reviewRef, impact, executionGranted: false });
    store.db.exec('COMMIT');
    return { ...prepared, directiveId, impact };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
