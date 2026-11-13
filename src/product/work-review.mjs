// WORK_REVIEW_V1 restricts the existing Task/Run/Event store. No scheduler.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {hash} from '../alpha/contract.mjs';
import {localTree} from '../verification/backends.mjs';

export const WORK_PROFILE='WORK_REVIEW_V1';
export const WORK_LIMITS=Object.freeze({maxAttempts:2,totalReservedMs:60000,verificationTimeoutMs:30000,maxRepairs:1,reviewTtlMs:600000});
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=(s,id)=>{const r=s.db.prepare('SELECT body FROM product_tasks WHERE id=?').get(id);if(!r)throw Error('Unknown task');return JSON.parse(r.body);};
const table=(s,name)=>!!s.db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name);
const tx=(s,fn)=>{s.db.exec('BEGIN IMMEDIATE');try{const r=fn();s.db.exec('COMMIT');return r;}catch(e){s.db.exec('ROLLBACK');throw e;}};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))throw Error('WORK_SCHEMA_INVALID');};
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=4000&&!v.includes('\0');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export const isWork=t=>Object.hasOwn(t,'workProfileVersion')||Object.hasOwn(t,'workRequestRef')||Object.hasOwn(t,'workProfileRef');
export function runtimeIdentity(){
  const files=[];const walk=dir=>{for(const n of readdirSync(path.join(root,dir)).sort()){const p=path.join(dir,n);const st=lstatSync(path.join(root,p));if(st.isSymbolicLink())throw Error('WORK_RUNTIME_SYMLINK');if(st.isDirectory())walk(p);else files.push([p.split(path.sep).join('/'),hash(readFileSync(path.join(root,p)))]);}};
  // Installer preserves src's contents as runtime/, not as runtime/src/.
  if(existsSync(path.join(root,'installation.json'))){
    const inventory=JSON.parse(readFileSync(path.join(root,'installation.json'),'utf8'));
    if(inventory.schemaVersion!==1||!inventory.files||typeof inventory.files!=='object')throw Error('WORK_INSTALLATION_INVENTORY');
    for(const name of Object.keys(inventory.files).sort()){
      if(path.isAbsolute(name)||name.split(/[\\/]/).some(p=>!p||p==='..'||p==='.')||lstatSync(path.join(root,name)).isSymbolicLink())throw Error('WORK_INSTALLATION_PATH');
      const digest=hash(readFileSync(path.join(root,name)));if(digest!==inventory.files[name])throw Error('WORK_INSTALLATION_CHANGED');files.push([name,digest]);
    }
    files.push(['installation.json',hash(readFileSync(path.join(root,'installation.json')))]);
  }else{walk('src');files.push(['package.json',hash(readFileSync(path.join(root,'package.json')))]);}
  const entryPath=fileURLToPath(new URL('../alpha/cli.mjs',import.meta.url));
  return {inventoryHash:hash(files),entryPath,entryHash:hash(readFileSync(entryPath)),nodeExecutableHash:hash(readFileSync(process.execPath))};
}
export function workRequest(s,t){
  if(!isWork(t))return null;
  if(t.workProfileVersion!==1)throw Error('WORK_PROFILE_VERSION');
  const r=s.readArtifact(t.workRequestRef);
  exact(r,['kind','schemaVersion','taskId','profile','repository','stateDirectory','objective','mode','acceptanceMode']);
  if(r.kind!=='WorkRequest'||r.schemaVersion!==1||r.profile!==WORK_PROFILE||r.taskId!==t.id||r.repository!==t.repo||r.stateDirectory!==s.directory||!['CHANGE','VERIFY_CURRENT'].includes(r.mode)||r.acceptanceMode!=='LOCAL_ONLY'||t.acceptanceMode!=='LOCAL_ONLY'||t.coveragePolicy!=='MAPPED_TEST_EVIDENCE_V1'||t.settings.maxAttempts!==2||t.settings.timeoutSeconds!==60||t.settings.maxParallel!==1)throw Error('WORK_REQUEST_MISMATCH');
  return r;
}
export function createWorkRequest(s,t,{workProfile,mode}){
  if(workProfile!==WORK_PROFILE||!['CHANGE','VERIFY_CURRENT'].includes(mode))throw Error('UNSUPPORTED_PROFILE');
  const repository=realpathSync(t.repo),stateDirectory=realpathSync(s.directory),rel=path.relative(repository,stateDirectory);
  if(!path.isAbsolute(t.repo)||repository!==t.repo||!rel||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)))throw Error('WORK_STATE_MUST_BE_EXTERNAL');
  const r={kind:'WorkRequest',schemaVersion:1,taskId:t.id,profile:WORK_PROFILE,repository,stateDirectory,objective:s.readArtifact(t.planRef).intent.original,mode,acceptanceMode:'LOCAL_ONLY'};
  return {workProfileVersion:1,workRequestRef:s.artifact(r),workProfileRef:null,coveragePolicy:'MAPPED_TEST_EVIDENCE_V1'};
}
export function workControlState(s,id){const e=s.events(id).filter(e=>e.type==='WORK_CONTROL_SET').at(-1);return {action:e?.body.action??'RUN',sequence:e?.seq??0,stopRequested:!!e&&e.body.action!=='UNPAUSE'&&e.body.action!=='RUN'};}
export function workProfile(s,t,{runtime=true}={}){
  const r=workRequest(s,t);if(!r)return null;if(!t.workProfileRef)throw Error('WORK_PROFILE_NOT_BOUND');
  if(s.db.prepare("SELECT version FROM workflow_extensions WHERE name='work-review'").get()?.version!==1)throw Error('WORK_SCHEMA_VERSION');
  const p=s.readArtifact(t.workProfileRef);exact(p,['kind','schemaVersion','profile','taskId','mode','repositoryId','repository','stateDirectory','base','planRef','workflowHash','sourcePaths','testPaths','criteria','limits','runtime']);
  if(p.kind!=='WorkProfile'||p.schemaVersion!==1||p.profile!==WORK_PROFILE||p.taskId!==t.id||p.mode!==r.mode||p.repository!==t.repo||p.stateDirectory!==s.directory||p.planRef!==t.planRef||p.workflowHash!==t.bootstrap?.workflowHash||hash(p.limits)!==hash(WORK_LIMITS))throw Error('WORK_PROFILE_MISMATCH');
  const plan=s.readArtifact(t.planRef);validateWorkDraft(s,t,plan.draft,plan);
  if(hash(p.sourcePaths)!==hash(plan.draft.plannedFiles.map(f=>f.path).sort())||hash(p.testPaths)!==hash(plan.draft.plannedTests.map(f=>f.path).sort())||p.base!==plan.probe.base||p.repositoryId!==plan.probe.repositoryId||hash(p.criteria)!==hash(plan.draft.criteria.map(c=>({id:c.id,description:c.description,testPaths:[...c.tests].sort()}))))throw Error('WORK_PROFILE_PLAN_MISMATCH');
  if(runtime&&hash(p.runtime)!==hash(runtimeIdentity()))throw Error('WORK_RUNTIME_CHANGED');return p;
}
export function validateWorkDraft(s,t,d,plan){
  const r=workRequest(s,t);if(!r)return;
  const src=d.plannedFiles.map(f=>f.path),tests=d.plannedTests.map(f=>f.path),base=new Map(plan.baseline.files.map(([p,,h])=>[p,h]));
  if(plan.contractKind!=='EXISTING_LOCAL'||!plan.probe.base||d.schemaVersion!==1||src.length>(r.mode==='CHANGE'?5:0)||(r.mode==='CHANGE'&&!src.length)||tests.length<1||tests.length>5||!d.criteria.length||d.criteria.some(c=>!c.tests.length)||src.some(p=>!/^src\/.+\.mjs$/.test(p)||!base.has(p))||tests.some(p=>! /^(test|tests)\/[A-Za-z0-9_./-]+\.test\.(mjs|cjs|js|ts)$/.test(p)||!base.has(p)))throw Error('UNSUPPORTED_WORK_SCOPE');
  const expected=r.mode==='CHANGE'?[['implement','local-edit',[],src],['verify','local-verification',['implement'],[]]]:[['verify','local-verification',[],[]]];
  if(hash(d.workItems.map(i=>[i.id,i.kind,i.dependencies,i.files]))!==hash(expected))throw Error('UNSUPPORTED_WORK_DAG');
}
export function bindWorkProfile(s,current){
  if(!isWork(current)||current.workProfileRef)return current;
  workMutable(s,current.id,{unbound:true});
  const r=workRequest(s,current),plan=s.readArtifact(current.planRef);validateWorkDraft(s,current,plan.draft,plan);
  const profile={kind:'WorkProfile',schemaVersion:1,profile:WORK_PROFILE,taskId:current.id,mode:r.mode,repositoryId:plan.probe.repositoryId,repository:current.repo,stateDirectory:s.directory,base:plan.probe.base,planRef:current.planRef,workflowHash:current.bootstrap.workflowHash,sourcePaths:plan.draft.plannedFiles.map(f=>f.path).sort(),testPaths:plan.draft.plannedTests.map(f=>f.path).sort(),criteria:plan.draft.criteria.map(c=>({id:c.id,description:c.description,testPaths:[...c.tests].sort()})),limits:WORK_LIMITS,runtime:runtimeIdentity()};
  const ref=s.artifact(profile),next={...current,revision:current.revision+1,workProfileRef:ref};
  return tx(s,()=>{workMutable(s,current.id,{unbound:true});if(s.db.prepare('UPDATE product_tasks SET body=?,revision=? WHERE id=? AND revision=?').run(JSON.stringify(next),next.revision,current.id,current.revision).changes!==1)throw Error('Task revision conflict');s.db.prepare("INSERT OR IGNORE INTO workflow_extensions VALUES ('work-review',1)").run();s.event(current.id,'WORK_PROFILE_BOUND',{profileRef:ref,revision:next.revision,planRef:next.planRef});return next;});
}
export function attachmentComplete(s,t,run){
  if(run.state!=='COMPLETED'||!run.materializationRef)return false;
  const a=s.readArtifact(run.materializationRef);
  const historical=(t.bootstrap?.history??[]).some(h=>h.runId===run.id);
  return hash(run.contract)===run.contractHash&&a.status==='MATERIALIZED'&&a.filesetHash===run.contractHash&&s.events(t.id).some(e=>e.type==='BOOTSTRAP_ITEM_MATERIALIZED'&&e.body.runId===run.id&&e.body.materializationRef===run.materializationRef&&e.body.workContext?.profileRef===t.workProfileRef)&&run.contract.files.every(f=>a.results.some(r=>r.path===f.path&&r.sha256===f.sha256&&['MODIFIED','ALREADY_MODIFIED'].includes(r.status)))&&(historical||a.results.every(r=>t.bootstrap?.digests?.[r.path]===r.sha256));
}
export function workEffects(s,t,ignoreRunId){
  const reservations=table(s,'bootstrap_reservations')?s.db.prepare('SELECT body FROM bootstrap_reservations WHERE taskId=?').all(t.id).map(r=>JSON.parse(r.body)):[];
  const ids=new Set([...Object.values(t.bootstrap?.filesets??{}),...(t.bootstrap?.history??[]).map(h=>h.runId),...reservations.map(r=>r.runId)]);
  // Include effects created before the Task attachment commit.
  for(const row of s.db.prepare('SELECT id,body FROM runs').all()){const r=JSON.parse(row.body);if(r.taskId===t.id||r.contract?.taskId===t.id)ids.add(row.id);}
  let active=false,unknown=false,attempted=false;
  for(const id of ids){if(id===ignoreRunId)continue;const row=s.db.prepare('SELECT * FROM runs WHERE id=?').get(id);if(!row){unknown=true;continue;}const run=JSON.parse(row.body);const events=s.events(id);const started=events.some(e=>e.type==='BOOTSTRAP_MATERIALIZATION_STARTED')||reservations.some(r=>r.runId===id);attempted ||= started;
    if(!started)continue;
    if(run.kind==='bootstrap-fileset'&&run.state==='COMPLETED'){if(!attachmentComplete(s,t,run))unknown=true;continue;}
    const r=reservations.find(r=>r.runId===id);
    if(r&&['LOCAL_PASSED','LOCAL_FAILED','INCONCLUSIVE'].includes(r.state)){if(!r.result?.evidenceRef||!s.events(t.id).some(e=>e.type==='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED'&&e.body.evidenceRef===r.result.evidenceRef))unknown=true;else s.readArtifact(r.result.evidenceRef);continue;}
    let alive=false;try{if(row.pid){process.kill(Number(row.pid),0);alive=true;}}catch(e){alive=e.code==='EPERM';}
    if(row.owner&&alive&&row.leaseUntil>Date.now()&&row.leaseUntil<=Date.now()+30000&&(!r||r.deadline>Date.now()))active=true;else unknown=true;
  }
  return {certainty:unknown?'UNKNOWN':active?'RUNNING':attempted?'SETTLED':'NONE',reservations};
}
export function workMutable(s,id,{unbound=false,context,reviewRef}={}){
  const t=read(s,id);if(!isWork(t))return null;workRequest(s,t);
  if(s.events(id).some(e=>['WORK_CLOSED','WORK_START_REJECTED'].includes(e.type)))throw Error('WORK_CLOSED');
  const c=workControlState(s,id);if(!['RUN','UNPAUSE'].includes(c.action))throw Error('WORK_'+c.action);
  if(!unbound)workProfile(s,t);
  if(context&&(context.profileRef!==t.workProfileRef||context.controlSeq!==c.sequence))throw Error('WORK_CONTEXT_STALE');
  if(reviewRef&&s.events(id).some(e=>e.type==='WORK_REVIEW_DECLINED'&&e.body.reviewRef===reviewRef))throw Error('WORK_REVIEW_DECLINED');
  for(const row of s.db.prepare('SELECT body FROM product_tasks').all()){const other=JSON.parse(row.body);if(!isWork(other)||other.repo!==t.repo)continue;const closed=s.events(other.id).find(e=>e.type==='WORK_CLOSED');if(closed?.body.outcome==='ABANDONED_UNRESOLVED'||workEffects(s,other,admissions.has(context)?context.runId:undefined).certainty==='UNKNOWN')throw Error('WORK_UNRESOLVED');if(other.id!==id&&workEffects(s,other).certainty==='RUNNING')throw Error('WORK_REPOSITORY_BUSY');}
  return {profileRef:t.workProfileRef,controlSeq:c.sequence};
}
const admissions=new WeakSet();
export function nativeWorkAdmission(s,id,context,reviewRef,lane,runId){workMutable(s,id,{context,reviewRef});const a=Object.freeze({taskId:id,...context,reviewRef,lane,runId});admissions.add(a);return a;}
export function requireWorkAdmission(s,id,a,lane){const t=read(s,id);if(!isWork(t))return;if(!admissions.has(a)||a.taskId!==id||a.lane!==lane)throw Error('WORK_NATIVE_REVIEW_REQUIRED');workMutable(s,id,{context:a,reviewRef:a.reviewRef});}
export function checkWorkDecision(s,b){const t=read(s,b.taskId);if(!isWork(t))return;const a=b.authorization;if(a?.kind!=='EXPLICIT_LOCAL_TRUST'||!a.workContext||!a.reviewRef)throw Error('WORK_NATIVE_REVIEW_REQUIRED');const packet=s.readArtifact(a.reviewRef),review=packet.review?.review;if(!s.events(t.id).some(e=>e.type==='NATIVE_LOCAL_REVIEW_ACCEPTED'&&e.body.reviewRef===a.reviewRef&&e.body.reviewHash===a.reviewHash)||packet.kind!=='NativeLocalReviewPacket'||!review||hash(review)!==a.reviewHash||review.taskId!==t.id||review.requestHash!==a.requestHash||review.revision!==b.revision||hash(review.workContext)!==hash(a.workContext))throw Error('WORK_NATIVE_REVIEW_MISMATCH');workMutable(s,t.id,{context:a.workContext,reviewRef:a.reviewRef});checkWorkCommand(s,t,b.command);}
export function checkWorkCommand(s,t,r){if(!isWork(t))return;const p=workProfile(s,t);if(path.resolve(r.directory)!==t.repo||r.executable!==process.execPath||r.timeoutMs!==30000||hash(r.args)!==hash(['--test','--test-reporter=tap',...p.testPaths]))throw Error('WORK_EXACT_TEST_COMMAND_REQUIRED');}
export function checkWorkFiles(s,t,input){if(!isWork(t))return;workMutable(s,t.id);const p=workProfile(s,t);const effects=workEffects(s,t);if(input.files?.length&&input.files.every(f=>typeof f.content==='string'&&hash(f.content)===f.baseSha256))throw Error('NO_SOURCE_CHANGE');if(input.repair&&(effects.reservations.length!==1||effects.reservations[0].state!=='LOCAL_FAILED'||input.repair.evidenceRef!==effects.reservations[0].result?.evidenceRef||input.repair.verificationItem!=='verify'||s.list().some(r=>r.taskId===t.id&&r.contract?.repairOf&&r.state==='COMPLETED')))throw Error('WORK_REPAIR_BUDGET_OR_EVIDENCE');if(p.mode!=='CHANGE'||input.itemId!=='implement'||!Array.isArray(input.files)||input.files.length<1||input.files.length>5||input.files.some(f=>!p.sourcePaths.includes(f.path)||typeof f.content!=='string'||Buffer.byteLength(f.content)>16000||f.baseSha256===null)||input.files.reduce((n,f)=>n+Buffer.byteLength(f.content),0)>64000)throw Error('UNSUPPORTED_WORK_FILESET');}
export function workControl(s,id,{action,requestId,expectedControlSeq}){
  if(!['PAUSE','CANCEL','UNPAUSE'].includes(action)||!uuid(requestId)||!Number.isSafeInteger(expectedControlSeq)||expectedControlSeq<0)throw Error('WORK_CONTROL_INPUT');
  return tx(s,()=>{const t=read(s,id);if(!isWork(t))throw Error('WORK_PROFILE_REQUIRED');workRequest(s,t);const es=s.events(id),prior=es.find(e=>e.type==='WORK_CONTROL_SET'&&e.body.requestId===requestId);if(prior){if(prior.body.action!==action||prior.body.previousControlSeq!==expectedControlSeq)throw Error('WORK_DUPLICATE_CONFLICT');return prior;}
    if(es.some(e=>e.type==='WORK_CLOSED'))throw Error('WORK_CLOSED');const c=workControlState(s,id);if(c.sequence!==expectedControlSeq||c.action==='CANCEL'||action==='UNPAUSE'&&(c.action!=='PAUSE'||!['NONE','SETTLED'].includes(workEffects(s,t).certainty)))throw Error('WORK_CONTROL_CONFLICT');
    s.event(id,'WORK_CONTROL_SET',{requestId,action,previousControlSeq:expectedControlSeq,authority:'USER_DECLARED'});return s.events(id).at(-1);});
}
export async function prepareWorkClose(s,id,{outcome,reason,expectedRevision}){
  if(!['CANCELLED','ABANDONED','SUPERSEDED','ABANDONED_UNRESOLVED'].includes(outcome)||!text(reason))throw Error('WORK_CLOSE_INPUT');const t=read(s,id);workRequest(s,t);if(!isWork(t)||t.revision!==expectedRevision)throw Error('WORK_CLOSE_REVISION');
  const effects=workEffects(s,t);if(effects.certainty==='RUNNING'||(effects.certainty==='UNKNOWN')!==(outcome==='ABANDONED_UNRESOLVED'))throw Error('WORK_CLOSE_EFFECTS');
  const es=s.events(id);if(es.some(e=>e.type==='WORK_CLOSED'))throw Error('WORK_CLOSED');let candidateHash=null;try{candidateHash=await localTree(t.repo);}catch{if(outcome!=='ABANDONED_UNRESOLVED')throw Error('WORK_CANDIDATE_UNREADABLE');}
  const review={kind:'WorkCloseReview',schemaVersion:1,taskId:id,profileRef:t.workProfileRef,requestId:randomUUID(),taskRevision:t.revision,workflowHash:t.bootstrap?.workflowHash??null,candidateHash,basisSeq:es.at(-1)?.seq??0,basisLogHash:hash(es),outcome,reason,expiresAt:Date.now()+600000};const reviewHash=hash(review),reviewRef=s.artifact({review,reviewHash});
  tx(s,()=>{if(hash(s.events(id))!==review.basisLogHash||read(s,id).revision!==t.revision)throw Error('WORK_CLOSE_STALE');s.event(id,'WORK_CLOSE_REVIEW_PREPARED',{reviewRef,requestId:review.requestId,basisSeq:review.basisSeq});});return {reviewRef,reviewHash,review};
}
export async function acceptWorkClose(s,ref,{trust,acknowledgeUnisolated=false}){
  const p=s.readArtifact(ref),r=p.review;if(r?.kind!=='WorkCloseReview'||hash(r)!==trust||p.reviewHash!==trust||!acknowledgeUnisolated)throw Error('WORK_CLOSE_CONSENT');
  const prior=s.events(r.taskId).find(e=>e.type==='WORK_CLOSED'&&e.body.requestId===r.requestId);if(prior){if(prior.body.reviewRef!==ref)throw Error('WORK_DUPLICATE_CONFLICT');return s.readArtifact(prior.body.receiptRef);}
  let observed=null;try{observed=await localTree(read(s,r.taskId).repo);}catch{if(r.outcome!=='ABANDONED_UNRESOLVED')throw Error('WORK_CANDIDATE_UNREADABLE');}if(observed!==r.candidateHash)throw Error('WORK_CLOSE_STALE');
  const t=read(s,r.taskId),receipt={kind:'WorkCloseReceipt',schemaVersion:1,taskId:t.id,profileRef:r.profileRef,requestId:r.requestId,reviewRef:ref,outcome:r.outcome,reason:r.reason,acceptedAt:new Date().toISOString(),sourceRevision:t.revision,sourceCandidateHash:observed,effectCertainty:workEffects(s,t).certainty};const receiptRef=s.artifact(receipt);
  return tx(s,()=>{workRequest(s,t);const head=s.events(t.id).at(-1);if(Date.now()>=r.expiresAt||Date.now()<r.expiresAt-600000||read(s,t.id).revision!==r.taskRevision||t.workProfileRef!==r.profileRef||head?.type!=='WORK_CLOSE_REVIEW_PREPARED'||head.body.reviewRef!==ref)throw Error('WORK_CLOSE_STALE');const certainty=workEffects(s,read(s,t.id)).certainty;if(certainty==='RUNNING'||(certainty==='UNKNOWN')!==(r.outcome==='ABANDONED_UNRESOLVED')||certainty!==receipt.effectCertainty)throw Error('WORK_CLOSE_EFFECTS');s.event(t.id,'WORK_CLOSED',{receiptRef,reviewRef:ref,requestId:r.requestId,outcome:r.outcome});return receipt;});
}
export function declineWorkReview(s,ref){const p=s.readArtifact(ref),r=p.review?.review??p.review;if(!r?.taskId)throw Error('WORK_REVIEW_INVALID');const t=read(s,r.taskId);workRequest(s,t);if(!isWork(t))throw Error('WORK_PROFILE_REQUIRED');return tx(s,()=>{s.event(t.id,'WORK_REVIEW_DECLINED',{profileRef:t.workProfileRef,reviewRef:ref,controlSeq:workControlState(s,t.id).sequence,reason:'OWNER_DECLINED'});return {status:'DECLINED',executionGranted:false};});}
export function workTaskForReference(s,value){if(!value)return null;if(value.startsWith('task-')){if(table(s,'product_tasks')){const row=s.db.prepare('SELECT body FROM product_tasks WHERE id=?').get(value);if(row)return JSON.parse(row.body);}}if(/^[a-f0-9]{64}$/.test(value)){const p=s.readArtifact(value),r=p.review?.review??p.review??p;const id=r.taskId??p.taskId;if(id)return read(s,id);}if(table(s,'bootstrap_reservations')){const row=s.db.prepare('SELECT taskId FROM bootstrap_reservations WHERE requestId=? OR decisionId=?').get(value,value);if(row)return read(s,row.taskId);}return null;}
const cliAllowed=new Set(['plan','clarify','status','report','unknowns','readiness','proposal-request','reservation','work-log','proposal-batch','repair-proposal-request','supervised-proposal-review','delivered-status','workflow-progress','codex-planning-status','codex-goal-progress','review-codex-plan','review-codex-workflow','codex-goals','codex-bootstraps','codex-bootstrap-progress','proposal-results','supervised-proposal-register','local-files-review','local-review','local-files-accept','local-accept','pause','cancel','work-control','work-close-review','work-close-accept','work-owner-review']);
export function guardWorkCli(s,action,value){const t=workTaskForReference(s,value);if(t&&isWork(t)&&!cliAllowed.has(action))throw Error('WORK_UNSUPPORTED_ENTRY: '+action);return t;}

export function acknowledgeWorkProfile(s,id,ref){const t=read(s,id);if(!isWork(t))return;if(!s.events(id).some(e=>e.type==='WORK_PROFILE_ACKNOWLEDGED'))s.event(id,'WORK_PROFILE_ACKNOWLEDGED',{profileRef:t.workProfileRef,reviewRef:ref});}
