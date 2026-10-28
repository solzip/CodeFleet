// Supervised contract changes, using the existing Store/artifacts and one atomic
// Task transition. This is not an issuer, execution grant or second scheduler.
import { randomUUID } from 'node:crypto';
import { hash } from '../alpha/contract.mjs';
import { exact } from '../intent/contract.mjs';
import { validateBootstrapDraft, existingPaths, draftPaths } from '../intent/bootstrap.mjs';
import { bootstrapDefinition, bootstrapStates, dependentsOf } from '../workflow/bootstrap.mjs';
import { bootstrapContext, bootstrapDrift, effectiveStates, recordedDigests, task } from './tasks.mjs';
import { reservationStatus } from './reservations.mjs';
import { localTree } from '../verification/backends.mjs';
import { bootstrapGuard } from '../hosts/workflow-authorization.mjs';

function settled(store, current) {
  if (bootstrapGuard(store, current.id)) throw Error('Signed Operator contract revision requires its own trusted approval; supervised route refused');
  const ids = new Set(Object.values(current.bootstrap.filesets));
  for (const row of store.db.prepare('SELECT * FROM runs').all()) {
    const run = JSON.parse(row.body);
    if (run.taskId !== current.id && row.id !== current.id && !ids.has(row.id)) continue;
    if (row.owner || ['RESERVED','STARTED','HUMAN_HANDOFF','MATERIALIZING','WAITING_HUMAN'].includes(run.state) ||
        run.kind === 'bootstrap-fileset' && run.state !== 'COMPLETED' && Object.keys(run.results ?? {}).length)
      throw Error('RECONCILE: active lease or uncertain effects block contract revision');
  }
  const exists = store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_reservations'").get();
  if (exists) for (const row of store.db.prepare('SELECT * FROM bootstrap_reservations WHERE taskId=?').all(current.id)) {
    const status = reservationStatus(store, row.decisionId, row.requestId);
    if (status.status !== 'LOCAL_PASSED') throw Error('RECONCILE: settle execution/Repair before changing contract');
  }
}

function impactOf(oldPlan, plan, oldWorkflow, workflow, states) {
  const affected = new Set(), oldItems = new Map(oldWorkflow.items.map(i => [i.id,i]));
  // Unmapped global intent changes cannot be attributed safely to just one item.
  const globals = ['objective','requirements','scope','decisions','risks','openQuestions'];
  const globalChange = globals.some(k => hash(oldPlan.draft[k]) !== hash(plan.draft[k]));
  const signature = (draft, item) => hash({item,
    files: draft.plannedFiles.filter(f => item.files.includes(f.path)),
    tests: draft.plannedTests,
    criteria: draft.criteria.filter(c => item.acceptanceCriteria.includes(c.id))});
  // Removing old criteria is not supported by this bounded route; no silent weakening.
  if (oldPlan.draft.criteria.some(c => !plan.draft.criteria.some(n => n.id === c.id))) throw Error('Removing acceptance criteria requires a separate contract review path');
  if (oldPlan.draft.criteria.some(c => hash(c.tests) !== hash(plan.draft.criteria.find(n => n.id === c.id).tests)))
    throw Error('Existing criterion test coverage cannot change through revision');
  if (hash(oldWorkflow.items.map(i=>i.id).sort()) !== hash(workflow.items.map(i=>i.id).sort()))
    throw Error('This revision route preserves WorkItem identities');
  const mapped = new Set(workflow.items.flatMap(i => i.acceptanceCriteria));
  const unmappedChange = plan.draft.criteria.some(c => !mapped.has(c.id) &&
    hash(c) !== hash(oldPlan.draft.criteria.find(n => n.id === c.id) ?? null));
  for (const item of workflow.items) {
    const old = oldItems.get(item.id);
    if (old.kind !== item.kind) throw Error('WorkItem capability kind cannot change through revision');
    if (globalChange || unmappedChange || signature(oldPlan.draft, old) !== signature(plan.draft, item)) affected.add(item.id);
  }
  for (const id of [...affected]) {
    dependentsOf(oldWorkflow,id).forEach(x=>affected.add(x));
    dependentsOf(workflow,id).forEach(x=>affected.add(x));
  }
  // Old proposed candidates/approvals bind the old Workflow, even if scope is unchanged.
  const reReview = workflow.items.filter(i=>i.kind==='local-edit' && states[i.id]!=='MATERIALIZED').map(i=>i.id);
  const preserved = workflow.items.filter(i=>!affected.has(i.id) &&
    ['PLAN_RECORDED','MATERIALIZED','LOCAL_PASSED','LOCAL_CHECKPOINT'].includes(states[i.id])).map(i=>i.id);
  return { affected:[...affected].sort(), preserved, reReview,
    revalidate:workflow.items.filter(i=>i.kind==='local-verification' && affected.has(i.id)).map(i=>i.id),
    integratedVerificationRequired:true, globalChange:globalChange || unmappedChange };
}

async function inspectRevision(store, taskId, draft) {
  const {current,plan:oldPlan,workflow:oldWorkflow}=bootstrapContext(store,taskId);
  if ((current.contractRevision ?? 1) > 32) throw Error('Contract revision history limit reached');
  settled(store,current);
  if ((await bootstrapDrift(store,taskId)).length) throw Error('Candidate drift blocks revision');
  const states=effectiveStates(store,current,oldWorkflow);
  if (Object.values(states).some(s=>['EVIDENCE_INVALID','VERIFICATION_STALE','LOCAL_FAILED','INCONCLUSIVE'].includes(s)))
    throw Error('Existing Evidence must be reconciled before revision');
  if (hash(draft)===hash(oldPlan.draft)) throw Error('No semantic contract change');
  // The existing baseline and immutable tests remain pinned. Already created
  // NEW_PROJECT files are not reclassified as new files during revalidation.
  if (hash(draft.plannedTests)!==hash(oldPlan.draft.plannedTests)) throw Error('Fixed test paths/mapping cannot change');
  const existing=oldPlan.contractKind==='EXISTING_LOCAL';
  if (!existing && hash(draft.plannedFiles)!==hash(oldPlan.draft.plannedFiles)) throw Error('New-project revision preserves planned files');
  const clarifications=Object.entries(current.clarifications??{}).map(([unknownId,ref])=>{
    const c=store.readArtifact(ref);if(c.kind!=='ObjectiveClarification'||c.taskId!==taskId||c.unknownId!==unknownId||c.grantsExecution!==false)throw Error('Invalid clarification');return {...c,ref};
  });
  const validation=validateBootstrapDraft(draft,oldPlan.probe,oldPlan.intent.original,
    existing?await existingPaths(current.repo,draftPaths(draft)):[],clarifications,existing);
  if(validation.status!=='VALIDATED')throw Error('Revision Draft is not validated: '+validation.status);
  const plan={...oldPlan,draft:structuredClone(draft),validation};
  const workflow=bootstrapDefinition(plan);plan.workflowPreview=workflow;
  const impact=impactOf(oldPlan,plan,oldWorkflow,workflow,states);
  if (!existing && impact.affected.some(id=>oldWorkflow.items.find(i=>i.id===id).kind==='local-edit' && states[id]==='MATERIALIZED'))
    throw Error('Revising materialized source requires EXISTING_LOCAL replacement support');
  // Do not transfer ownership of files already materialized by another item.
  for(const item of workflow.items.filter(i=>i.kind==='local-edit'))for(const p of item.files){
    const owner=oldWorkflow.items.find(i=>i.files.includes(p));
    if(owner && owner.id!==item.id)throw Error('File ownership reassignment unsupported');
  }
  for (const item of oldWorkflow.items.filter(i=>i.kind==='local-edit' && (current.bootstrap.revisionReopen?.[i.id] ||
      current.bootstrap.filesets[i.id] && store.get(current.bootstrap.filesets[i.id]).state==='COMPLETED')))
    if(item.files.some(p=>!workflow.items.find(i=>i.id===item.id).files.includes(p)))throw Error('Materialized file ownership cannot be removed');
  const candidateHash=await localTree(current.repo);
  if(hash(task(store,taskId))!==hash(current))throw Error('Task changed during revision inspection');
  return {current,plan,workflow,impact,candidateHash};
}

export async function prepareContractRevision(store,taskId,input) {
  exact(input,['revision','draft'],'Contract revision proposal');
  if(input.revision!==task(store,taskId).revision)throw Error('Stale Task revision');
  const x=await inspectRevision(store,taskId,input.draft), now=Date.now();
  const review={kind:'ContractRevisionReview',taskId,requestId:randomUUID(),issuedAt:now,expiresAt:now+3600000,
    taskRevision:x.current.revision,taskHash:hash(x.current),fromContractRevision:x.current.contractRevision??1,
    toContractRevision:(x.current.contractRevision??1)+1,workflowHash:x.current.bootstrap.workflowHash,
    nextWorkflowHash:x.workflow.workflowHash,candidateHash:x.candidateHash,draft:x.plan.draft,impact:x.impact,
    settings:x.current.settings,acceptanceMode:x.current.acceptanceMode??'PROTECTED_REQUIRED',
    authority:'EXPLICIT_LOCAL_TRUST',operatorAuthentication:'NOT_ESTABLISHED',executionGranted:false};
  const reviewRef=store.artifact({kind:'ContractRevisionReviewPacket',review});
  store.event(taskId,'CONTRACT_REVISION_REVIEW_PREPARED',{reviewRef,reviewHash:hash(review),executionGranted:false});
  return {action:'AWAIT_CONTRACT_APPROVAL',reviewRef,reviewHash:hash(review),review,executionGranted:false};
}

export async function acceptContractRevision(store,reviewRef,{trust,acknowledgeUnisolated=false}={}) {
  const packet=store.readArtifact(reviewRef),r=packet.review;
  if(packet.kind!=='ContractRevisionReviewPacket'||!trust||trust!==hash(r)||!acknowledgeUnisolated)
    throw Error('Explicit exact supervised contract review required');
  if(!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||Date.now()<r.issuedAt||Date.now()>=r.expiresAt||r.expiresAt-r.issuedAt>3600000)
    throw Error('Contract review expired or clock reversed');
  if(store.events(r.taskId).some(e=>e.type==='CONTRACT_REVISION_REVIEW_REVOKED'&&e.body.reviewRef===reviewRef))throw Error('Contract review revoked');
  const x=await inspectRevision(store,r.taskId,r.draft);
  if(r.kind!=='ContractRevisionReview'||hash(x.current)!==r.taskHash||x.current.revision!==r.taskRevision||x.candidateHash!==r.candidateHash||r.workflowHash!==x.current.bootstrap.workflowHash||
      x.workflow.workflowHash!==r.nextWorkflowHash||hash(x.impact)!==hash(r.impact)||
      hash(x.current.settings)!==hash(r.settings)||(x.current.acceptanceMode??'PROTECTED_REQUIRED')!==r.acceptanceMode||
      r.fromContractRevision!==(x.current.contractRevision??1)||r.toContractRevision!==r.fromContractRevision+1)
    throw Error('Contract review binding changed');
  const previousTaskRef=store.artifact(x.current),planRef=store.artifact(x.plan),workflowRef=store.artifact(x.workflow);
  const receipt={kind:'ContractRevisionReceipt',taskId:r.taskId,contractRevision:r.toContractRevision,
    previousTaskRef,planRef,workflowRef,reviewRef,reviewHash:trust,impact:x.impact};
  const receiptRef=store.artifact(receipt),bootstrap=structuredClone(x.current.bootstrap);
  const reopen=new Set([...x.impact.affected,...x.impact.reReview]);
  const states=bootstrapStates(x.workflow);
  for(const i of x.workflow.items)if(!reopen.has(i.id))states[i.id]=bootstrap.states[i.id];
  const oldFilesets={...bootstrap.filesets};
  for(const id of reopen){delete bootstrap.filesets[id];if(bootstrap.verifications)delete bootstrap.verifications[id];}
  // Keep completed filesets as ownership/provenance even when their source needs
  // a new replacement; submitBootstrapFiles handles this explicit revision marker.
  bootstrap.revisionReopen={...bootstrap.revisionReopen,...Object.fromEntries([...reopen].filter(id=>oldFilesets[id]&&store.get(oldFilesets[id]).state==='COMPLETED').map(id=>[id,oldFilesets[id]]))};
  Object.assign(bootstrap,{workflowRef,workflowHash:x.workflow.workflowHash,states,digests:recordedDigests(store,x.current),
    contractHistory:[...(bootstrap.contractHistory??[]),receiptRef]});
  const next={...x.current,revision:x.current.revision+1,contractRevision:r.toContractRevision,planRef,bootstrap};
  if(await localTree(x.current.repo)!==r.candidateHash)throw Error('Candidate changed before revision commit');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if(hash(task(store,r.taskId))!==r.taskHash)throw Error('Task changed before revision commit');
    // Recheck run rows inside the same SQLite write lock without opening a nested transaction.
    for(const row of store.db.prepare('SELECT * FROM runs').all()){
      const run=JSON.parse(row.body);if(run.taskId!==r.taskId&&row.id!==r.taskId)continue;
      if(row.owner||['RESERVED','STARTED','HUMAN_HANDOFF','MATERIALIZING','WAITING_HUMAN'].includes(run.state))throw Error('RECONCILE: effects changed before commit');
    }
    if(Date.now()<r.issuedAt||Date.now()>=r.expiresAt||store.events(r.taskId).some(e=>e.type==='CONTRACT_REVISION_REVIEW_REVOKED'&&e.body.reviewRef===reviewRef))throw Error('Contract review no longer valid');
    for(const [id,runId]of Object.entries(oldFilesets))if(reopen.has(id)&&store.get(runId).state!=='COMPLETED'){
      store.db.prepare("UPDATE runs SET control='cancel' WHERE id=?").run(runId);
      store.event(runId,'CONTRACT_REVISION_FILESET_SUPERSEDED',{receiptRef});
    }
    // Decisions remain immutable audit records; revocation changes only the existing ledger column.
    if(store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='bootstrap_decisions'").get())
      store.db.prepare('UPDATE bootstrap_decisions SET revoked=? WHERE taskId=? AND consumed IS NULL AND revoked IS NULL').run(Date.now(),r.taskId);
    if(store.db.prepare('UPDATE product_tasks SET revision=?,body=? WHERE id=? AND revision=?').run(next.revision,JSON.stringify(next),r.taskId,r.taskRevision).changes!==1)throw Error('Task revision conflict');
    store.event(r.taskId,'CONTRACT_REVISION_APPLIED',{revision:next.revision,planRef,receiptRef,contractRevision:next.contractRevision,reviewRef,reviewHash:trust,executionGranted:false});
    store.db.exec('COMMIT');
  } catch(e){store.db.exec('ROLLBACK');throw e;}
  return {action:'CONTRACT_REVISED',taskId:r.taskId,revision:next.revision,contractRevision:next.contractRevision,receiptRef,
    impact:x.impact,executionGranted:false,requiresFreshFilesetAndCommandApproval:true};
}

export function revokeContractRevision(store,reviewRef) {
  const packet=store.readArtifact(reviewRef);if(packet.kind!=='ContractRevisionReviewPacket')throw Error('Contract review required');
  store.event(packet.review.taskId,'CONTRACT_REVISION_REVIEW_REVOKED',{reviewRef});
  return {status:'REVOKED',reviewRef,executionGranted:false};
}
