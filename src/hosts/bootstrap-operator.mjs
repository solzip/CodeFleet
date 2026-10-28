// H2 decision binding for trusted OFFLINE embedding, NOT a public Operator
// deployment or proof of human presence/OS isolation. No private key is held here.
// Existing bootstrap_decisions and workflow_approvals are the only ledgers.
import { randomUUID } from 'node:crypto';
import { hash } from '../alpha/contract.mjs';
import { canonical, digest, operatorDecisionVerifier } from './operator.mjs';
import { registerBootstrapGuard } from './workflow-authorization.mjs';
import { bootstrapContext, task, verifyTask, approveTask } from '../product/tasks.mjs';
import { enableReservations, issueSignedOfflineDecision, revokeDecision } from '../product/reservations.mjs';
import { revokeWorkflow } from '../workflow/persistence.mjs';
import { continuationSnapshot, continueOfflineWorkflow } from '../product/continuation.mjs';

export class BootstrapOperator {
  #store; #verify; #keys; #environment; #owners = new Map(); #timer;
  constructor(store, { operatorKeys, profile } = {}) {
    this.#verify = operatorDecisionVerifier(operatorKeys);
    if (!store?.db || typeof profile !== 'string' || !profile) throw Error('Trusted Store and environment profile required');
    this.#store = store; this.#keys = digest(operatorKeys);
    this.#environment = digest({ platform: process.platform, node: process.versions.node, backend: 'local',
      authority: 'LOCAL_EXECUTED', isolation: 'UNPROTECTED', profile });
    enableReservations(store); registerBootstrapGuard(store, this);
    this.#timer = setInterval(() => { for (const [id, owner] of this.#owners) store.heartbeat(id, owner); }, 5000);
    this.#timer.unref();
  }
  enroll(taskId) {
    const { current, plan, workflow } = bootstrapContext(this.#store, taskId);
    const policy = { workflowHash: workflow.workflowHash, repository: { root: plan.probe.root, id: plan.probe.repositoryId, base: plan.probe.base },
      objective: plan.draft.objective, criteria: plan.draft.criteria, settings: current.settings,
      files: workflow.items.flatMap(i => i.files), repairFiles: plan.draft.plannedFiles.map(f => f.path).filter(f => f.startsWith('src/') && !plan.draft.plannedTests.some(t => t.path === f)),
      resources: workflow.items.flatMap(i => i.resources ?? []), modelCalls: 0, publicExecution: 'BLOCKED' };
    const pinned = { keys: this.#keys, environment: this.#environment, policyHash: digest(policy) };
    const prior = this.#store.db.prepare('SELECT body FROM runs WHERE id=?').get(taskId);
    if (prior) {
      const run = JSON.parse(prior.body);
      if (run.authorizationMode !== 'SIGNED_BOOTSTRAP_OFFLINE_V1' || canonical(run.enrollment) !== canonical(pinned)) throw Error('Trusted enrollment changed');
    } else this.#store.create({ id: taskId, kind: 'bootstrap-operator-fence', state: 'READY',
      authorizationMode: 'SIGNED_BOOTSTRAP_OFFLINE_V1', enrollment: pinned, policyRef: this.#store.artifact(policy) });
    return { taskId, authority: 'OFFLINE_ENROLLMENT_ONLY', publicExecution: 'BLOCKED' };
  }
  open(taskId) {
    this.enroll(taskId);
    if (this.#store.db.prepare("SELECT 1 FROM bootstrap_reservations WHERE taskId=? AND state IN ('RESERVED','STARTED','HUMAN_HANDOFF')").get(taskId)) throw Error('Uncertain Attempt; reconcile, never reopen for replay');
    const owner = this.#store.claim(taskId); this.#owners.set(taskId, owner); return owner;
  }
  close() { clearInterval(this.#timer); for (const [id, owner] of this.#owners) this.#store.release(id, owner); this.#owners.clear(); }
  #base(taskId, itemId, requestId, decisionId) {
    const { current, plan, workflow } = bootstrapContext(this.#store, taskId), anchor = this.#store.get(taskId);
    const policy = this.#store.readArtifact(anchor.policyRef);
    if (anchor.enrollment.keys !== this.#keys || anchor.enrollment.environment !== this.#environment ||
        anchor.enrollment.policyHash !== digest(policy) || policy.workflowHash !== workflow.workflowHash ||
        hash(policy.settings) !== hash(current.settings) || hash(policy.criteria) !== hash(plan.draft.criteria) || policy.objective !== plan.draft.objective ||
        policy.repository.id !== plan.probe.repositoryId || policy.repository.root !== current.repo) throw Error('Operator policy, repository, environment or contract changed');
    const previous = this.#store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=? AND requestId<>?').all(taskId, requestId).map(r => JSON.parse(r.body));
    return { taskId, itemId, requestId, decisionId, revision: current.revision, taskHash: hash(current), workflowHash: workflow.workflowHash,
      objectiveHash: digest({ objective: policy.objective, criteria: policy.criteria }), repository: policy.repository,
      scope: { files: policy.files, resources: policy.resources }, policyHash: anchor.enrollment.policyHash,
      environment: this.#environment, budget: { maxAttempts: current.settings.maxAttempts, usedAttempts: previous.length,
        remainingTimeMs: current.settings.timeoutSeconds * 1000 - previous.reduce((n,r) => n+r.reservedTimeMs,0), modelCalls: 0 } };
  }
  #binding(action) {
    const row = this.#store.db.prepare('SELECT owner,leaseUntil,control FROM runs WHERE id=?').get(action.taskId);
    if (!row?.owner || row.leaseUntil <= Date.now() || row.control !== 'run') throw Error('Active trusted Operator lease required');
    return { runId: action.taskId, workItemId: action.itemId, revision: action.revision,
      contractHash: digest({ workflow: action.workflowHash, objective: action.objectiveHash }), actionDigest: digest(action),
      repository: canonical(action.repository), environment: this.#environment, policyHash: action.policyHash, leaseOwner: row.owner };
  }
  #check(authorization, expected) {
    if (!authorization) throw Error('Signed Operator decision required');
    const d = this.#verify(authorization.envelope);
    if (d.kind !== 'APPROVE' || d.id !== expected.requestId || canonical(authorization.action) !== canonical(expected) ||
        canonical(d.binding) !== canonical(this.#binding(expected))) throw Error('Signed Operator decision binding mismatch');
    return d;
  }
  async requestVerification(taskId, itemId, request, repairRunId = null) {
    const inspected = await verifyTask(this.#store, taskId, itemId, request);
    const action = { ...this.#base(taskId, itemId, randomUUID(), randomUUID()), kind: 'VERIFY_WORKITEM', command: inspected.command, repairRunId };
    return { action, binding: this.#binding(action), authority: 'REQUEST_ONLY' };
  }
  async acceptVerification(authorization) {
    const a = authorization.action, d = this.#verify(authorization.envelope);
    if (a.kind !== 'VERIFY_WORKITEM' || d.expiresAt > Date.now()+3600000) throw Error('Unsupported action or expiry');
    const request = { executable: a.command.executable, args: a.command.args, directory: a.command.directory, timeoutMs: a.command.timeoutMs };
    return issueSignedOfflineDecision(this.#store, a.taskId, a.itemId, request, { decisionId: a.decisionId, requestId: a.requestId,
      actor: d.principal, revision: a.revision, commandHash: a.command.commandHash, acknowledgeUnisolated: true,
      expiresAt: d.expiresAt, maxExecutions: 1, timeBudgetMs: a.command.timeoutMs, maxConsecutiveFailures: 1 }, authorization, a.repairRunId);
  }
  // One externally signed acceptance of an exact verification batch. This is
  // not source/model delegation or a public Host authentication implementation.
  async requestDelegation(taskId, scope = {}, ids = {}) {
    if(!scope || typeof scope!=='object' || Array.isArray(scope) || Object.keys(scope).some(k=>!['workItems','maxAttempts','maxReservedTimeMs','expiresAt'].includes(k)))
      throw Error('Unsupported delegation scope; only exact Local verification is implemented');
    const {workItems,maxAttempts,maxReservedTimeMs,expiresAt}=scope;
    if (!Array.isArray(workItems) || !workItems.length || workItems.length > 5 ||
        new Set(workItems.map(i=>i.itemId)).size !== workItems.length ||
        !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 ||
        !Number.isSafeInteger(maxReservedTimeMs) || maxReservedTimeMs < 1 ||
        !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now()+3600000)
      throw Error('Bounded verification delegation required');
    const snapshot=await continuationSnapshot(this.#store,taskId),current=task(this.#store,taskId);
    if(snapshot.status!=='AWAIT_OPERATOR')throw Error('Eligible verification required before delegation');
    if(maxAttempts>current.settings.maxAttempts || maxReservedTimeMs>current.settings.timeoutSeconds*1000)
      throw Error('Delegation cannot expand task budget');
    const commands=[];
    for(const entry of workItems) {
      if(!entry || typeof entry!=='object' || Array.isArray(entry) || Object.keys(entry).sort().join(',')!=='itemId,request')
        throw Error('Unsupported delegated WorkItem fields');
      // A dependent verification can be reviewed before its prerequisite runs;
      // actual eligibility is still checked before individual Decision issuance.
      const item=snapshot.workItems.find(i=>i.id===entry.itemId);
      if(item?.kind!=='local-verification'||item.state==='LOCAL_PASSED')throw Error('Delegation only supports pending Local verification');
      const {inspectLocalCommand}=await import('../verification/backends.mjs');
      const command=await inspectLocalCommand(entry.request);
      if(command.directory!==current.repo)throw Error('Delegation repository mismatch');
      commands.push({itemId:entry.itemId,command});
    }
    const action={...this.#base(taskId,'delegation',ids.requestId??randomUUID(),ids.decisionId??randomUUID()),
      kind:'DELEGATE_LOCAL_VERIFICATION',commands,maxAttempts,maxReservedTimeMs,expiresAt,
      contractPin:hash({repo:current.repo,planRef:current.planRef,settings:current.settings,acceptanceMode:current.acceptanceMode??'PROTECTED_REQUIRED'}),
      sideEffects:'EXPLICIT_UNPROTECTED_LOCAL_COMMANDS',modelCalls:0,sourceChanges:false};
    return {action,binding:this.#binding(action),authority:'REQUEST_ONLY',publicExecution:'BLOCKED'};
  }
  async acceptDelegation(authorization) {
    const a=authorization?.action;
    if(a?.kind!=='DELEGATE_LOCAL_VERIFICATION')throw Error('Signed verification delegation required');
    const pending=await this.requestDelegation(a.taskId,{workItems:a.commands.map(e=>({itemId:e.itemId,request:{
      executable:e.command.executable,args:e.command.args,directory:e.command.directory,timeoutMs:e.command.timeoutMs}})),
      maxAttempts:a.maxAttempts,maxReservedTimeMs:a.maxReservedTimeMs,expiresAt:a.expiresAt},a);
    const d=this.#check(authorization,pending.action);
    if(d.expiresAt!==a.expiresAt)throw Error('Delegation expiry mismatch');
    this.#store.db.exec('BEGIN IMMEDIATE');
    try {
      if(this.#store.events(a.taskId).some(e=>e.type==='BOOTSTRAP_DELEGATION_ACCEPTED'&&e.body.requestId===a.requestId))
        throw Error('Delegation acceptance already consumed');
      const delegationRef=this.#store.artifact(authorization);
      this.#store.event(a.taskId,'BOOTSTRAP_DELEGATION_ACCEPTED',{requestId:a.requestId,delegationRef,principal:d.principal,revision:a.revision});
      this.#store.db.exec('COMMIT');
      return {delegationRef,authority:'SIGNED_OFFLINE_DELEGATION',publicExecution:'BLOCKED'};
    } catch(error){this.#store.db.exec('ROLLBACK');throw error;}
  }
  #delegated(authorization,expected) {
    const root=this.#store.readArtifact(authorization.delegationRef),a=root.action;
    const events=this.#store.events(expected.taskId);
    const accepted=events.find(e=>e.type==='BOOTSTRAP_DELEGATION_ACCEPTED'&&e.body.delegationRef===authorization.delegationRef&&e.body.requestId===a.requestId);
    if(!accepted||Date.now()<Date.parse(accepted.at))throw Error('Delegation not accepted or clock precedes acceptance');
    const expired=events.some(e=>e.type==='BOOTSTRAP_DELEGATION_EXPIRED'&&e.body.requestId===a.requestId);
    if(a.expiresAt<=Date.now()||expired){
      if(!expired)this.#store.event(expected.taskId,'BOOTSTRAP_DELEGATION_EXPIRED',{requestId:a.requestId});
      throw Error('Delegation expired');
    }
    const d=this.#verify(root.envelope);
    if(a.kind!=='DELEGATE_LOCAL_VERIFICATION'||d.kind!=='APPROVE'||d.id!==a.requestId||d.expiresAt!==a.expiresAt||
        d.binding.actionDigest!==digest(a)||a.taskId!==expected.taskId||
        !events.some(e=>e.type==='BOOTSTRAP_DELEGATION_ACCEPTED'&&e.body.delegationRef===authorization.delegationRef&&e.body.requestId===d.id)||
        events.some(e=>e.type==='BOOTSTRAP_DELEGATION_REVOKED'&&e.body.requestId===d.id))throw Error('Delegation absent, revoked or mismatched');
    this.#binding(expected); // Fresh active Operator lease, including after restart.
    const current=task(this.#store,expected.taskId);
    if(a.contractPin!==hash({repo:current.repo,planRef:current.planRef,settings:current.settings,acceptanceMode:current.acceptanceMode??'PROTECTED_REQUIRED'})||
      ['workflowHash','objectiveHash','repository','scope','policyHash','environment'].some(k=>canonical(a[k])!==canonical(expected[k])))
      throw Error('Delegation contract/environment/scope changed');
    const entry=a.commands.find(i=>i.itemId===expected.itemId);
    if(!entry||canonical(entry.command)!==canonical(expected.command)||expected.repairRunId!==null||
      canonical(authorization.action)!==canonical(expected))throw Error('Action outside exact delegated candidate/command scope');
    const rows=this.#store.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=? AND requestId<>?').all(a.taskId,expected.requestId).map(r=>JSON.parse(r.body));
    const later=rows.filter(r=>r.revision>=a.revision).sort((x,y)=>x.revision-y.revision);
    if(later.some((r,i)=>r.state!=='LOCAL_PASSED'||r.revision!==a.revision+i)||current.revision!==a.revision+later.length)
      throw Error('Delegation cannot resume changed revision or uncertain/failed effects');
    if(rows.length>=a.maxAttempts||rows.reduce((n,r)=>n+r.reservedTimeMs,0)+expected.command.timeoutMs>a.maxReservedTimeMs)
      throw Error('Delegation budget exhausted');
    if(this.#store.db.prepare('SELECT body FROM bootstrap_decisions WHERE taskId=? AND requestId<>?').all(a.taskId,expected.requestId)
      .some(r=>{const b=JSON.parse(r.body);return b.authorization?.delegationRef===authorization.delegationRef&&b.itemId===expected.itemId;}))
      throw Error('Delegated WorkItem already issued; reconcile, never reissue');
    return d;
  }
  async issueDelegatedVerification(delegationRef,taskId,itemId,request) {
    const pending=await this.requestVerification(taskId,itemId,request);
    const authorization={kind:'DELEGATED_LOCAL_VERIFICATION',delegationRef,action:pending.action};
    const d=this.#delegated(authorization,pending.action),a=pending.action;
    return issueSignedOfflineDecision(this.#store,taskId,itemId,request,{decisionId:a.decisionId,requestId:a.requestId,
      actor:d.principal,revision:a.revision,commandHash:a.command.commandHash,acknowledgeUnisolated:true,
      expiresAt:d.expiresAt,maxExecutions:1,timeBudgetMs:a.command.timeoutMs,maxConsecutiveFailures:1},authorization);
  }
  async continueDelegation(delegationRef,taskId,{cancelled=()=>false}={}) {
    const root=this.#store.readArtifact(delegationRef),a=root.action;
    if(a.taskId!==taskId||a.kind!=='DELEGATE_LOCAL_VERIFICATION')throw Error('Delegation task mismatch');
    return continueOfflineWorkflow(this.#store,taskId,{scope:{taskRevision:task(this.#store,taskId).revision,
      workflowHash:a.workflowHash,maxAttempts:a.maxAttempts,maxReservedTimeMs:a.maxReservedTimeMs,expiresAt:a.expiresAt,modelCalls:0,
      workItems:a.commands.map(e=>({itemId:e.itemId,request:{executable:e.command.executable,args:e.command.args,directory:e.command.directory,timeoutMs:e.command.timeoutMs}}))},
      cancelled,obtainDecision:({itemId,request})=>this.issueDelegatedVerification(delegationRef,taskId,itemId,request)});
  }
  checkDecision(binding) {
    const expected = { ...this.#base(binding.taskId, binding.itemId, binding.requestId, binding.decisionId),
      kind: 'VERIFY_WORKITEM', command: binding.command, repairRunId: binding.repair?.runId ?? null };
    const d = binding.authorization?.kind==='DELEGATED_LOCAL_VERIFICATION'
      ? this.#delegated(binding.authorization,expected) : this.#check(binding.authorization, expected);
    if (binding.actor !== d.principal || binding.expiresAt !== d.expiresAt || binding.commandHash !== expected.command.commandHash ||
        binding.timeBudgetMs !== expected.command.timeoutMs || expected.budget.modelCalls !== 0) throw Error('Operator execution grant mismatch');
  }
  #filesetAction(run, requestId, decisionId) {
    const base = this.#base(run.taskId, run.itemId, requestId, decisionId);
    const policy = this.#store.readArtifact(this.#store.get(run.taskId).policyRef);
    if (run.operation !== 'modify' || run.contractHash !== hash(run.contract) || run.contract.files.some(f => !policy.repairFiles.includes(f.path))) throw Error('Repair outside enrolled source scope');
    return { ...base, kind: 'REPAIR_FILESET', runId: run.id, filesetHash: run.contractHash, manifest: run.contract };
  }
  requestRepair(runId) {
    const action = this.#filesetAction(this.#store.get(runId), randomUUID(), randomUUID());
    return { action, binding: this.#binding(action), authority: 'REQUEST_ONLY' };
  }
  acceptRepair(authorization) {
    const a = authorization.action, d = this.#verify(authorization.envelope);
    if (a.kind !== 'REPAIR_FILESET') throw Error('Repair grant required');
    return approveTask(this.#store, a.taskId, { actor: d.principal, workflowHash: a.filesetHash, expiresAt: d.expiresAt, authorization });
  }
  authorizeFileset(run, { actor, workflowHash, expiresAt, authorization }) {
    if (run.operatorAuthorization || run.operatorConsumption) throw Error('Repair approval already bound; no replay');
    const a = authorization?.action;
    const expected = this.#filesetAction(run, a?.requestId, a?.decisionId), d = this.#check(authorization, expected);
    if (actor !== d.principal || workflowHash !== run.contractHash || expiresAt !== d.expiresAt) throw Error('Repair grant mismatch');
    return structuredClone(authorization);
  }
  checkFileset(run) {
    const a = run.operatorAuthorization?.action;
    const expected = this.#filesetAction(run, a?.requestId, a?.decisionId);
    const d = this.#check(run.operatorAuthorization, expected);
    const approval = this.#store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=? AND revision=?').get(run.id,run.revision);
    if (!approval || approval.actor !== d.principal || approval.digest !== run.contractHash || approval.expires !== d.expiresAt) throw Error('Repair approval revoked or changed');
    if (run.operatorConsumption) {
      const row = this.#store.db.prepare('SELECT owner,leaseUntil,control FROM runs WHERE id=?').get(run.id);
      if (row.owner !== run.operatorConsumption.owner || row.control !== 'run' || row.leaseUntil <= Date.now()) throw Error('Repair consumption lease lost');
    }
  }
  revoke(envelope) {
    const d = this.#verify(envelope);
    if (d.kind !== 'REVOKE') throw Error('Signed revocation required');
    const accepted=this.#store.list().flatMap(r=>this.#store.events(r.id).map(e=>({...e,runId:r.id}))).find(e=>e.type==='BOOTSTRAP_DELEGATION_ACCEPTED'&&e.body.requestId===d.id);
    if(accepted){
      const original=this.#store.readArtifact(accepted.body.delegationRef).envelope.decision;
      if(original.principal!==d.principal||canonical(original.binding)!==canonical(d.binding))throw Error('Delegation revocation binding mismatch');
      this.#store.event(accepted.runId,'BOOTSTRAP_DELEGATION_REVOKED',{requestId:d.id,principal:d.principal});
      return {requestId:d.id,status:'REVOKED'};
    }
    const row = this.#store.db.prepare('SELECT id,body FROM bootstrap_decisions WHERE requestId=?').get(d.id);
    if (row) {
      const original = JSON.parse(row.body).authorization?.envelope.decision;
      if (!original || original.principal !== d.principal || canonical(original.binding) !== canonical(d.binding)) throw Error('Revocation binding mismatch');
      return revokeDecision(this.#store,row.id,d.principal);
    }
    const run = this.#store.list().find(r => r.operatorAuthorization?.envelope.decision.id === d.id);
    if (!run || run.operatorAuthorization.envelope.decision.principal !== d.principal ||
        canonical(run.operatorAuthorization.envelope.decision.binding) !== canonical(d.binding)) throw Error('Revocation binding mismatch');
    return revokeWorkflow(this.#store,run.id,d.principal);
  }
  // The callback is a trusted external review/signing transport, never a model
  // or a signer created by the coordinator. Every phase still needs a new grant.
  repairOperator(review) {
    return {
      approveRepair: async ({ approvalRequest }) => {
        const request = this.requestRepair(approvalRequest.runId);
        const envelope = await review(request);
        if (envelope) this.acceptRepair({ action: request.action, envelope });
      },
      issueVerification: async ({ taskId, itemId, request, runId }) => {
        const pending = await this.requestVerification(taskId,itemId,request,runId);
        const envelope = await review(pending);
        if (!envelope) throw Error('AWAIT_APPROVAL: signed verification decision required');
        return this.acceptVerification({ action: pending.action, envelope });
      }
    };
  }
}
