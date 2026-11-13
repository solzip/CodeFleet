import {hash} from '../alpha/contract.mjs';
import {localTree} from '../verification/backends.mjs';
import {taskReport} from './report.mjs';
import {task} from './tasks.mjs';
import {workRequest,workProfile,workEffects,workControlState,isWork} from './work-review.mjs';

// Ordered policy predicates, shared by the actual projection and overlap tests.
export function selectWorkPhase(f){
  if(f.readError)return 'READ_ERROR';
  if(f.unknown)return 'UNRESOLVED';
  if(f.closed)return f.closedOutcome;
  if(f.activeDrift)return 'UNRESOLVED';
  if(f.running)return f.verifying?'VERIFYING':'APPLYING';
  if(f.paused)return 'PAUSED';
  if(f.stale)return 'STALE';
  if(f.complete)return 'COMPLETE_LOCAL';
  if(f.stopped)return 'STOPPED_FAILED';
  if(f.failed)return 'FAILED_REVIEW';
  if(f.unprepared)return f.needsInput?'NEEDS_INPUT':'PLAN';
  if(f.files)return 'AWAIT_FILE_REVIEW';
  if(f.tests)return 'AWAIT_TEST_REVIEW';
  return 'BLOCKED_UNSUPPORTED';
}

export async function workReport(store,id){
  try{
    const t=task(store,id),r=workRequest(store,t),observedAt=new Date().toISOString();
    if(!r)return {kind:'WorkReport',schemaVersion:1,taskId:id,profileRef:null,observedAt,phase:'LEGACY_READ_ONLY',outcome:null,effectCertainty:'UNKNOWN',control:{action:'RUN',sequence:0,stopRequested:false},verification:{level:'UNPROTECTED',localComplete:false,protected:'UNSATISFIED',candidateHash:null,observedAt:null},nextAction:{kind:'READ_ONLY',reason:'Existing Task retains its original contract',ownerAction:null},blockers:[],criteria:[],sourceChanges:[],evidenceRefs:[],budget:null,legacyReadOnly:true};
    const events=store.events(id),effects=workEffects(store,t),control=workControlState(store,id),closed=events.find(e=>e.type==='WORK_CLOSED'),rejected=events.find(e=>e.type==='WORK_START_REJECTED');
    const plan=store.readArtifact(t.planRef);let candidateHash=null;try{candidateHash=await localTree(t.repo);}catch{}
    let stale=false,profile=null;
    if(t.workProfileRef){profile=workProfile(store,t,{runtime:false});try{workProfile(store,t);}catch{stale=true;}}
    const report=await taskReport(store,id),baseline=new Map((plan.baseline?.files??[]).map(([p,,sha])=>[p,sha]));
    if(report.executionReservations?.some(r=>r.status==='EVIDENCE_DEFECT')||report.bootstrap?.items.some(i=>i.state==='EVIDENCE_INVALID'))throw Error('WORK_EVIDENCE_DEFECT');
    const evidenceRefs=Object.values(t.bootstrap?.verifications??{});for(const ref of evidenceRefs)store.readArtifact(ref);
    const currentMap=await localTree(t.repo,[],{excludeGit:true,entries:true}),observed=new Map(currentMap.map(([p,,sha])=>[p,sha]));
    const digests=t.bootstrap?.digests??Object.fromEntries(baseline),changed=[...new Set([...observed.keys(),...Object.keys(digests)])].filter(p=>observed.get(p)!==digests[p]);stale ||= changed.length>0;
    const reservations=effects.reservations,used=reservations.length,reserved=reservations.reduce((sum,r)=>{if(!Number.isSafeInteger(r.reservedTimeMs)||r.reservedTimeMs<=0)throw Error('WORK_BUDGET_INVALID');return sum+r.reservedTimeMs;},0);
    const repairUsed=store.list().filter(run=>run.taskId===id&&run.contract?.repairOf).length>0?1:0;
    const phase=selectWorkPhase({unknown:effects.certainty==='UNKNOWN'||closed?.body.outcome==='ABANDONED_UNRESOLVED',closed:!!closed||!!rejected||control.action==='CANCEL'&&effects.certainty!=='RUNNING',closedOutcome:closed?.body.outcome??(rejected?'UNSUPPORTED':'CANCELLED'),activeDrift:stale&&effects.certainty==='RUNNING',running:effects.certainty==='RUNNING',verifying:reservations.some(r=>['STARTED','RESERVED'].includes(r.state)),paused:control.action==='PAUSE',stale:stale||!candidateHash,complete:report.complete,stopped:used>=2||reserved>=60000||r.mode==='VERIFY_CURRENT'&&used>0||reservations.some(v=>v.state==='INCONCLUSIVE'),failed:t.bootstrap?.states.verify==='LOCAL_FAILED',unprepared:!t.bootstrap,needsInput:plan.validation?.status==='NEEDS_INPUT',files:r.mode==='CHANGE'&&t.bootstrap?.states.implement!=='MATERIALIZED',tests:['PENDING_VERIFICATION','VERIFICATION_STALE'].includes(t.bootstrap?.states.verify)});
    const kind=({PAUSED:'UNPAUSE',STALE:'CLOSE',STOPPED_FAILED:'CLOSE',FAILED_REVIEW:t.bootstrap?.states.implement==='REPAIR_PROPOSED'?'REVIEW_FILES':'PROPOSE',NEEDS_INPUT:'ANSWER',PLAN:'PROPOSE',AWAIT_FILE_REVIEW:t.bootstrap?.filesets.implement?'REVIEW_FILES':'PROPOSE',AWAIT_TEST_REVIEW:'REVIEW_TESTS'})[phase]??'READ_ONLY';
    const reason=phase==='UNRESOLVED'?'Inspect persisted effects; no automatic replay':phase==='BLOCKED_UNSUPPORTED'?'Unsupported state':'';
    const outcome=closed?.body.outcome??(['COMPLETE_LOCAL','CANCELLED','UNSUPPORTED'].includes(phase)?phase:null);
    const complete=phase==='COMPLETE_LOCAL';
    const criteria=(report.acceptance?.criteriaCoverage??[]).map(c=>({id:c.id,testPaths:c.tests,executed:c.executed,testResult:c.testResult,criterionSatisfaction:complete?c.criterionSatisfaction:'NOT_VERIFIED',evidenceRef:c.evidenceRef}));
    const sourceChanges=[...new Set([...(profile?.sourcePaths??[]),...changed])].sort().map(p=>({path:p,beforeHash:baseline.get(p)??null,afterHash:observed.get(p)??null,origin:changed.includes(p)?'EXTERNAL':baseline.get(p)!==observed.get(p)?'MANAGED':'BASELINE',receiptRef:store.list().find(run=>run.taskId===id&&run.state==='COMPLETED'&&run.contract?.files?.some(f=>f.path===p&&f.sha256===observed.get(p)))?.materializationRef??null}));
    return {kind:'WorkReport',schemaVersion:1,taskId:id,profileRef:t.workProfileRef,observedAt,phase,outcome,effectCertainty:effects.certainty,control:{...control,action:control.action==='UNPAUSE'?'RUN':control.action},verification:{level:'UNPROTECTED',localComplete:complete,protected:'UNSATISFIED',candidateHash,observedAt:candidateHash?observedAt:null},nextAction:{kind,reason,ownerAction:null},blockers:reason?[{code:phase,phase,refs:[]}]:[],criteria,sourceChanges,evidenceRefs,budget:{attemptsUsed:used,attemptsRemaining:Math.max(0,2-used),reservedTimeMs:reserved,timeRemainingMs:Math.max(0,60000-reserved),repairUsed,maxRepairs:1,hostCost:'UNKNOWN',hardCostCap:false},legacyReadOnly:false};
  }catch{return {kind:'WorkReadError',schemaVersion:1,taskId:id??null,code:'WORK_STATE_UNREADABLE',phase:'READ_ERROR',effectCertainty:'UNKNOWN',preservedRefs:[],allowedNextActions:['READ_ONLY_INSPECT','STOP']};}
}

export function workList(store,repository,offset=0){
  if(!Number.isSafeInteger(offset)||offset<0)throw Error('WORK_LIST_OFFSET');
  const rows=store.db.prepare('SELECT body FROM product_tasks ORDER BY rowid DESC').all().map(r=>JSON.parse(r.body)).filter(t=>t.repo===repository);
  return {tasks:rows.slice(offset,offset+20).map(t=>({taskId:t.id,revision:t.revision,profile:isWork(t)?'WORK_REVIEW_V1':null,objective:store.readArtifact(t.planRef).intent?.original??null})),nextOffset:offset+20<rows.length?offset+20:null,executionGranted:false};
}
