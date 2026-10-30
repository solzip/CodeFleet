// Supervised same-user Local development. Host tool permission is external;
// exact review is mandatory here. No claim of Agent-resistant authentication.
import {randomUUID} from 'node:crypto';
import {hash} from '../alpha/contract.mjs';
import {task,verifyTask,approveTask,materializeTask,bootstrapContext,bootstrapDrift} from './tasks.mjs';
import {continuationSnapshot,continueOfflineWorkItem} from './continuation.mjs';
import {triageFailure,repairOfflineWorkItem} from './repair.mjs';
import {enableReservations,issueLocalTrustDecision,issueLocalEnvironmentDecision,reservationStatus,inspectCompletedRepair} from './reservations.mjs';
import {previewLocalCommand,localTree} from '../verification/backends.mjs';
import {validateEnvironmentRecovery,observeRecoveryPolicy,isNativeLocalPolicy} from './environment-recovery.mjs';

const label={authority:'EXPLICIT_LOCAL_TRUST',operatorAuthentication:'NOT_ESTABLISHED',verifierIndependence:'UNPROTECTED',protectedVerification:'UNSATISFIED',complete:false};
const present = result => ({...result,...label,complete:result.snapshot?.complete===true,...(result.snapshot?{snapshot:{...result.snapshot,
  executionBoundary:'SUPERVISED_LOCAL',publicExecution:'EXPLICIT_LOCAL_TRUST_ONLY',protectedExecution:'BLOCKED'}}:{})});

// Product-owned review identity: callers review scope, not manually assembled
// revision/request/expiry fields. This creates no execution authority.
export async function prepareNativeLocalReview(store,taskId,{request,proposal=null}={}) {
  const options={request,proposal,revision:task(store,taskId).revision,requestId:randomUUID(),expiresAt:Date.now()+3600000};
  const review=await nativeLocalStep(store,taskId,options);
  if(!review.reviewHash)return review;
  const packet={kind:'NativeLocalReviewPacket',taskId,options,review};
  const reviewRef=store.artifact(packet);
  store.event(taskId,'NATIVE_LOCAL_REVIEW_PREPARED',{reviewRef,reviewHash:review.reviewHash,requestId:options.requestId,executionGranted:false});
  return {...review,reviewRef,expiresAt:options.expiresAt,executionGranted:false};
}
export async function acceptNativeLocalReview(store,reviewRef,{trust,acknowledgeUnisolated=false,cancelled=()=>false}={}) {
  const packet=store.readArtifact(reviewRef);
  if(packet.kind!=='NativeLocalReviewPacket'||!trust||trust!==packet.review?.reviewHash||hash(packet.review.review)!==trust)
    throw Error('Exact prepared Local review required');
  return nativeLocalStep(store,packet.taskId,{...packet.options,trust,acknowledgeUnisolated,cancelled});
}

// Environment-only recovery: the JSON is a review proposal, never a capability.
// Host-policy claims require an embedding observer. Plain Local execution makes
// no isolation claim and instead records the existing runner's process context.
export async function nativeEnvironmentStep(store,taskId,{request,environment,revision,requestId,expiresAt,trust,
  acknowledgeUnisolated=false,cancelled=()=>false}, {observePolicy} = {}) {
  enableReservations(store);
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(expiresAt) || !/^[a-zA-Z0-9_-]{1,120}$/.test(requestId??''))
    throw Error('Exact revision, unique request ID and expiry required');
  const requestHash=hash(request),environmentHash=hash(environment);
  const row=store.db.prepare('SELECT id,body FROM bootstrap_decisions WHERE requestId=?').get(requestId);
  if(row) {
    const b=JSON.parse(row.body),a=b.authorization;
    if(!trust||!acknowledgeUnisolated||a?.kind!=='EXPLICIT_LOCAL_TRUST'||a.reviewHash!==trust||a.requestHash!==requestHash||
       a.environmentHash!==environmentHash||a.revision!==revision||b.taskId!==taskId||b.expiresAt!==expiresAt)
      throw Error('Request ID already bound; no changed environment or grant reuse');
    return present({action:'RECONCILE_OR_RECORDED',execution:reservationStatus(store,row.id,requestId),snapshot:await continuationSnapshot(store,taskId)});
  }
  if(expiresAt<=Date.now()||expiresAt>Date.now()+3600000)throw Error('Bounded unexpired Local review required');
  const current=task(store,taskId),snapshot=await continuationSnapshot(store,taskId);
  if(current.revision!==revision)throw Error('Environment review revision changed');
  if(snapshot.reason!=='FAILURE_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY'||snapshot.reservations.filter(r=>r.reservation).length!==1)
    return {...label,action:'HUMAN_HANDOFF',reason:snapshot.reason??'One settled failure required',snapshot};
  if(snapshot.budget.remainingAttempts<1||request.timeoutMs>snapshot.budget.remainingTimeMs)
    throw Error('Environment recovery budget exhausted');
  const failed=snapshot.workItems.find(i=>i.state==='LOCAL_FAILED');
  const inspected=await verifyTask(store,taskId,failed.id,request);
  validateEnvironmentRecovery(store,{taskId,itemId:failed.id,revision,workflowHash:snapshot.workflowHash,
    command:inspected.command,commandHash:inspected.commandHash,fileDigests:inspected.fileDigests,environmentRecovery:environment});
  const review={kind:'EnvironmentReverificationReview',taskId,itemId:failed.id,revision,taskHash:hash(current),
    workflowHash:snapshot.workflowHash,requestId,expiresAt,requestHash,environmentHash,environment,
    command:inspected.command,budget:snapshot.budget,maxExecutions:1,timeBudgetMs:request.timeoutMs,
    policyAuthority:isNativeLocalPolicy(environment.policy)?'EXPLICIT_LOCAL_TRUST':'TRUSTED_HOST_OBSERVER_REQUIRED',...label};
  const reviewHash=hash(review);
  if(!trust&&!acknowledgeUnisolated)return {...label,action:'AWAIT_ENVIRONMENT_APPROVAL',reviewHash,review};
  if(!acknowledgeUnisolated||trust!==reviewHash)throw Error('Explicit trust of exact environment review required');
  if(cancelled())return {...label,action:'RECONCILE',reason:'Cancelled before environment approval'};
  // Check Host policy, or record explicit-unprotected Local process context,
  // BEFORE issuing any new decision. Neither grants Host tool permission.
  await observeRecoveryPolicy(environment,observePolicy);
  if(hash(task(store,taskId))!==review.taskHash)throw Error('Environment review contract changed');
  const reviewRef=store.artifact(review);
  const decision=await issueLocalEnvironmentDecision(store,taskId,failed.id,request,{decisionId:randomUUID(),requestId,
    actor:'explicit-local-trust',revision,commandHash:inspected.commandHash,acknowledgeUnisolated:true,expiresAt,
    maxExecutions:1,timeBudgetMs:request.timeoutMs,maxConsecutiveFailures:1},
    {reviewHash,reviewRef,revision,requestHash,environmentHash},environment);
  store.event(taskId,'NATIVE_ENVIRONMENT_REVIEW_ACCEPTED',{reviewHash,reviewRef,requestId,trust:'SAME_USER_UNPROTECTED'});
  return present(await continueOfflineWorkItem(store,taskId,{...decision,request,cancelled,observePolicy}));
}
export async function nativeLocalStep(store,taskId,{request,proposal,revision,requestId,expiresAt,trust,acknowledgeUnisolated=false,cancelled=()=>false}) {
  enableReservations(store);
  if(!task(store,taskId).bootstrap) return {...label,action:'BLOCKED_CAPABILITY',reason:'Native Local requires existing Bootstrap WorkItems; other workflow execution retains its current protected contract'};
  if(!Number.isSafeInteger(revision)||!Number.isSafeInteger(expiresAt)||!/^[a-zA-Z0-9_-]{1,120}$/.test(requestId??'')) throw Error('Exact revision, unique request ID and expiry required');
  const row=store.db.prepare('SELECT id,body FROM bootstrap_decisions WHERE requestId=?').get(requestId);
  const requestHash=hash(request),proposalHash=hash(proposal??null);
  if(row) {
    const binding=JSON.parse(row.body),a=binding.authorization;
    if(!trust||!acknowledgeUnisolated||a?.kind!=='EXPLICIT_LOCAL_TRUST'||a.reviewHash!==trust||a.requestHash!==requestHash||a.proposalHash!==proposalHash||a.revision!==revision||binding.taskId!==taskId||binding.expiresAt!==expiresAt)
      throw Error('Request ID already bound; no changed request or grant reuse');
    // Restart can only report; an issued-but-unreserved decision is not replayed.
    return present({action:'RECONCILE_OR_RECORDED',execution:reservationStatus(store,row.id,requestId),snapshot:await continuationSnapshot(store,taskId)});
  }
  if(expiresAt<=Date.now()||expiresAt>Date.now()+3600000) throw Error('Bounded unexpired Local review required');
  const current=task(store,taskId),snapshot=await continuationSnapshot(store,taskId);
  if(current.revision!==revision) throw Error('Local review revision changed');
  if(cancelled()) return {...label,action:'RECONCILE',reason:'Cancelled before approval'};
  let triage,itemId;
  if(proposal) {
    triage=await triageFailure(store,taskId,{proposal,request,cancelled});
    if(!triage.repairable) return {...triage,...label};
    itemId=triage.verificationItem;
  } else {
    if(snapshot.status!=='AWAIT_OPERATOR'||snapshot.next?.kind!=='RUN_LOCAL_VERIFICATION')
      return {...label,action:snapshot.status==='HOST_ACTION_REQUIRED'?'AWAIT_APPROVAL':'HUMAN_HANDOFF',reason:snapshot.reason,snapshot};
    itemId=snapshot.next.itemId;
  }
  const inspected=await verifyTask(store,taskId,itemId,request);
  const afterCommand=proposal?await previewLocalCommand(request,proposal.files):inspected.command;
  const repair=proposal?null:inspectCompletedRepair(store,taskId,itemId,inspected);
  const review={taskId,revision,taskHash:hash(current),workflowHash:snapshot.workflowHash,itemId,requestId,expiresAt,
    requestHash,proposalHash,beforeCommand:inspected.command,afterCommand,proposal:proposal??null,
    ...(repair?{repair}:{}),budget:snapshot.budget,...label};
  const reviewHash=hash(review);
  if(!trust&&!acknowledgeUnisolated) return {...label,action:'AWAIT_APPROVAL',reviewHash,review};
  if(!acknowledgeUnisolated||trust!==reviewHash) throw Error('Explicit trust of exact Local review required');
  if(hash(task(store,taskId))!==review.taskHash) throw Error('Local review contract changed during inspection');
  const proof={reviewHash,revision,requestHash,proposalHash};
  const issue=async(runId=null,expectedRevision=revision)=>{
    const fresh=await verifyTask(store,taskId,itemId,request);
    if(cancelled()) throw Error('RECONCILE: cancellation before Local decision');
    if(fresh.commandHash!==afterCommand.commandHash) throw Error('AWAIT_APPROVAL: actual candidate differs from reviewed projection');
    return issueLocalTrustDecision(store,taskId,itemId,request,{decisionId:randomUUID(),requestId,actor:'explicit-local-trust',
      revision:expectedRevision,commandHash:fresh.commandHash,acknowledgeUnisolated:true,expiresAt,maxExecutions:1,
      timeBudgetMs:request.timeoutMs,maxConsecutiveFailures:1},proof,runId);
  };
  store.event(taskId,'NATIVE_LOCAL_REVIEW_ACCEPTED',{reviewHash,reviewRef:store.artifact(review),requestId,trust:'SAME_USER_UNPROTECTED'});
  if(!proposal) {
    const decision=await issue(repair?.runId);
    return present(await continueOfflineWorkItem(store,taskId,{...decision,request,cancelled}));
  }
  // Exact source and future command/candidate were reviewed together. Every
  // phase still uses the existing Fileset approval, fences and a fresh Attempt.
  const result=await repairOfflineWorkItem(store,taskId,{proposal,request,cancelled,operator:{
    approveRepair:async({approvalRequest,proposal:actual})=>{
      if(hash(actual)!==proposalHash||Date.now()>=expiresAt) throw Error('AWAIT_APPROVAL: repair review changed or expired');
      approveTask(store,taskId,{actor:'explicit-local-trust',workflowHash:approvalRequest.filesetHash,expiresAt});
    },
    issueVerification:async({runId,revision:repairedRevision})=>issue(runId,repairedRevision)
  }});
  return present(result);
}


// Exact supervised Fileset approval, not an authenticated public delegation.
export async function prepareNativeFilesReview(store,taskId,itemId) {
  const {current,workflow}=bootstrapContext(store,taskId);
  const snapshot=await continuationSnapshot(store,taskId);
  const run=store.get(current.bootstrap.filesets[itemId]);
  const ordinary=snapshot.next?.itemId===itemId&&['AWAIT_FILESET_APPROVAL','MATERIALIZE'].includes(snapshot.next?.kind);
  const repair=snapshot.reason==='FAILURE_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY'&&
    snapshot.repair?.itemIds.includes(itemId)&&
    snapshot.workItems.some(i=>i.id===itemId&&i.state==='REPAIR_PROPOSED')&&
    run.operation==='modify'&&run.contract?.repairOf?.verificationItem===snapshot.repair.verificationItem&&
    run.contract.repairOf.evidenceRef===snapshot.repair.evidenceRef;
  if(!ordinary&&!repair)throw Error('Eligible Fileset review required');
  if(!['WAITING_APPROVAL','READY'].includes(run.state))throw Error('Fileset effects require reconciliation');
  const review={kind:'NativeFilesReview',taskId,itemId,revision:current.revision,taskHash:hash(current),
    workflowHash:workflow.workflowHash,runId:run.id,filesetHash:run.contractHash,contentRef:run.contentRef,
    candidateHash:await localTree(current.repo),createdAt:Date.now(),expiresAt:Date.now()+3600000,maxMaterializations:1,
    publicDelegation:'PUBLIC_DELEGATION_BLOCKED',...label};
  const reviewHash=hash(review),reviewRef=store.artifact({review,reviewHash});
  store.event(taskId,'NATIVE_FILESET_REVIEW_PREPARED',{reviewRef,reviewHash,executionGranted:false});
  return {reviewRef,reviewHash,review,files:store.readArtifact(run.contentRef).files,executionGranted:false};
}
export async function acceptNativeFilesReview(store,reviewRef,{trust,acknowledgeUnisolated=false,cancelled=()=>false}={}) {
  const packet=store.readArtifact(reviewRef),r=packet.review;
  if(r?.kind!=='NativeFilesReview'||!trust||trust!==packet.reviewHash||hash(r)!==trust||!acknowledgeUnisolated)throw Error('Explicit exact Fileset review consent required');
  const current=task(store,r.taskId),run=store.get(r.runId);
  if(run.state==='COMPLETED'&&store.events(r.taskId).some(e=>e.type==='NATIVE_FILESET_REVIEW_ACCEPTED'&&e.body.reviewRef===reviewRef))
    return {...label,status:'RECORDED_NO_REPLAY',materializationRef:run.materializationRef};
  const expired=store.events(r.taskId).some(e=>e.type==='NATIVE_FILESET_REVIEW_EXPIRED'&&e.body.reviewRef===reviewRef);
  if(Date.now()>=r.expiresAt&&!expired)store.event(r.taskId,'NATIVE_FILESET_REVIEW_EXPIRED',{reviewRef});
  if(cancelled()||expired||Date.now()<r.createdAt||Date.now()>=r.expiresAt||hash(current)!==r.taskHash||current.revision!==r.revision||
    current.bootstrap.filesets[r.itemId]!==r.runId||run.contractHash!==r.filesetHash||run.contentRef!==r.contentRef||
    (await bootstrapDrift(store,r.taskId)).length||await localTree(current.repo)!==r.candidateHash)
    throw Error('Fileset review expired or task/candidate changed');
  if(!['WAITING_APPROVAL','READY'].includes(run.state)||Object.keys(run.results??{}).length)throw Error('RECONCILE: Fileset already started');
  approveTask(store,r.taskId,{actor:'explicit-local-trust',workflowHash:r.filesetHash,expiresAt:r.expiresAt});
  store.event(r.taskId,'NATIVE_FILESET_REVIEW_ACCEPTED',{reviewRef,reviewHash:trust,trust:'SAME_USER_UNPROTECTED'});
  return {...await materializeTask(store,r.taskId,r.itemId,{freshOnly:true,cancelled}),...label};
}
