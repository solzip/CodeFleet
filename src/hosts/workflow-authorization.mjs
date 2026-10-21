import { digest, canonical } from './operator.mjs';
import { hash } from '../alpha/contract.mjs';
import { validateWorkflow, policyFor } from '../workflow/definition.mjs';

const guards = new WeakMap();
export function registerWorkflowGuard(store, guard) {
  if (guards.has(store)) throw Error('Workflow guard already registered');
  guards.set(store, guard);
}
export function workflowGuard(store, run) {
  if (run.authorizationMode !== 'OS_OPERATOR_V1' && store.get(run.id).authorizationMode !== 'OS_OPERATOR_V1') return null;
  const guard = guards.get(store);
  if (!guard) throw Error('Protected workflow requires trusted Operator runtime');
  return guard;
}
export class WorkflowAuthorization {
  constructor(store, ledger, catalog, environment) {
    this.store = store; this.ledger = ledger;
    this.catalog = structuredClone(catalog); this.environment = digest(environment);
    this.pending = new Map();
  }
  check(run) {
    const current = this.store.get(run.id), allowed = this.catalog[run.id];
    const source = this.store.readArtifact(current.sourceRef);
    validateWorkflow(current.contract, source);
    if (!allowed || current.contractHash !== allowed.workflowHash || current.contractHash !== current.contract.workflowHash || current.revision !== allowed.revision || hash(this.store.readArtifact(current.graphRef)) !== hash(current.contract) || source.delivery.mode !== 'local') throw Error('Operator policy or graph changed');
    if (current.control !== 'run') throw Error('Operator control blocks workflow');
    if (current.authorizationMode !== 'OS_OPERATOR_V1') throw Error('Protected run marker missing');
    return current;
  }
  action(run, itemId, contract) { return { kind: 'ASSIGN_WORKITEM', runId: run.id, itemId, contract }; }
  snapshot(runId, itemId) {
    const run = this.check(this.store.get(runId));
    const row = this.store.db.prepare('SELECT owner,leaseUntil FROM runs WHERE id=?').get(runId);
    const source = this.store.readArtifact(run.sourceRef), item = run.contract.items.find(n => n.id === itemId);
    if (!item && itemId !== 'final') throw Error('Unknown WorkItem');
    if (!row.owner || row.leaseUntil <= Date.now()) throw Error('Active coordinator lease required');
    const contract = { ...source, files: item ? item.files : source.files, tests: item ? item.tests : source.tests, maxAttempts: 1 };
    const action = this.action(run, itemId, contract);
    return { action, control: run.control, leaseUntil: row.leaseUntil, binding: {
      runId, workItemId: itemId, revision: run.revision, contractHash: digest({ workflow: run.contractHash, contract }),
      actionDigest: digest(action), repository: canonical({ repo: run.repo, base: run.base }),
      environment: this.environment, policyHash: digest({ policy: policyFor(run.contract), catalog: this.catalog[runId] }), leaseOwner: row.owner
    } };
  }
  request(runId, itemId) {
    const snapshot = this.snapshot(runId, itemId);
    const request = this.ledger.agent({ method: 'request', binding: snapshot.binding });
    this.pending.set(runId + ':' + itemId, request.id);
    return { ...request, binding: snapshot.binding, action: snapshot.action, reviewDigest: digest(snapshot.binding) };
  }
  beforeReserve(run, owner, itemId, contract) {
    const snapshot = this.snapshot(run.id, itemId);
    if (snapshot.binding.leaseOwner !== owner || canonical(snapshot.action) !== canonical(this.action(run, itemId, contract))) throw Error('Assignment changed');
    let grantId = null;
    if (this.catalog[run.id].riskyItems.includes(itemId)) {
      const id = this.pending.get(run.id + ':' + itemId);
      if (!id) throw Error('Operator approval required for risky WorkItem');
      this.ledger.consume(id, snapshot.action);
      grantId = id;
    }
    this.check(run);
    this.store.event(run.id, 'OS_AUTHORIZATION_ASSIGNMENT', { itemId, grantId, actionDigest: snapshot.binding.actionDigest, authority: this.catalog[run.id].riskyItems.includes(itemId) ? 'OPERATOR_GRANT' : 'CONFINED_AUTOMATIC_POLICY' });
  }
  admission(run, itemId) {
    this.check(run);
    if (!this.catalog[run.id].riskyItems.includes(itemId)) return { status: 'AVAILABLE', missing: [] };
    const id = this.pending.get(run.id + ':' + itemId);
    return id && this.ledger.status(id).state === 'APPROVED'
      ? { status: 'AVAILABLE', missing: [] }
      : { status: 'BLOCKED', missing: ['Operator approval required for risky WorkItem'] };
  }
  effect(run, kind) {
    this.check(run);
    const row = this.store.db.prepare('SELECT owner,leaseUntil FROM runs WHERE id=?').get(run.id);
    if (!row.owner || row.leaseUntil <= Date.now()) throw Error('Effect coordinator lease lost');
    if (!['read', 'proposal', 'verify'].includes(kind)) throw Error('External effect or permission expansion unsupported');
  }
}
