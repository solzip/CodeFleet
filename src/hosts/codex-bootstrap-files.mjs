// Host-Native NEW_PROJECT Fileset proposal path.
// Builds on the existing pre-HEAD Bootstrap workflow and exact Fileset review;
// Codex does not receive approval or direct filesystem write authority here.
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { hash } from '../alpha/contract.mjs';
import { context } from '../alpha/workspace.mjs';
import { dependentsOf } from '../workflow/bootstrap.mjs';
import { bootstrapContext, submitBootstrapFiles, recordedDigests, effectiveStates } from '../product/tasks.mjs';
import { validateFileset, validateRepairFileset } from '../workflow/bootstrap-files.mjs';
import { runCodexReadOnlyTurn } from './codex-app-server-session.mjs';

export const bootstrapFilesOutputSchema = {
  type:'object',additionalProperties:false,required:['revision','itemId','files'],
  properties:{
    revision:{type:'integer'},itemId:{type:'string'},
    files:{type:'array',minItems:1,items:{
      type:'object',additionalProperties:false,required:['path','content'],
      properties:{path:{type:'string'},content:{type:'string'}}
    }}
  }
};

export const bootstrapRepairOutputSchema = {
  type:'object',additionalProperties:false,required:['revision','itemId','repair','files'],
  properties:{
    revision:{type:'integer'},itemId:{type:'string'},
    repair:{type:'object',additionalProperties:false,required:['verificationItem','evidenceRef'],
      properties:{verificationItem:{type:'string'},evidenceRef:{type:'string'}}},
    files:{type:'array',minItems:1,items:{type:'object',additionalProperties:false,
      required:['path','content','baseSha256'],
      properties:{path:{type:'string'},content:{type:'string'},baseSha256:{type:'string'}}}}
  }
};
// The Host is only allowed to propose an explicitly bounded replacement of
// materialized files against the pinned failing Local Evidence and byte digests.
export function validateBootstrapHostRepairProposal(response, workflow, itemId, revision, repair, digests) {
  if (!response || response.itemId !== itemId || response.revision !== revision ||
      response.repair?.verificationItem !== repair.verificationItem ||
      response.repair?.evidenceRef !== repair.evidenceRef)
    throw Error('Host Repair Fileset proposal stale or failure Evidence unbound');
  validateRepairFileset(response, workflow, itemId, digests);
  return response;
}
async function executableSha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export function validateBootstrapHostProposal(response, workflow, itemId, revision) {
  if (!response || response.itemId !== itemId || response.revision !== revision)
    throw Error('Host Fileset proposal stale or unbound');
  const files = validateFileset(response, workflow, itemId);
  return { revision,itemId,files };
}
export async function proposeNewProjectFileset(store, taskId, itemId, {
  executable, model, authorize, transport = runCodexReadOnlyTurn, timeoutMs = 90000, repair = null
} = {}) {
  if (!store || typeof authorize !== 'function' || typeof transport !== 'function' ||
      !isAbsolute(executable ?? '') || typeof model !== 'string' || !model ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw Error('Explicit bounded Codex Bootstrap configuration required');
  const {current,plan,workflow} = bootstrapContext(store,taskId);
  if (plan.contractKind !== 'NEW_PROJECT') throw Error('Use existing-source planning for non-NEW_PROJECT tasks');
  const item = workflow.items.find(n=>n.id===itemId);
  const repairMode = repair !== null;
  const states = effectiveStates(store,current,workflow);
  if (!item || item.kind !== 'local-edit' ||
      !(repairMode ? ['MATERIALIZED','REPAIR_PROPOSED'] : ['PENDING_FILESET','FILESET_PROPOSED']).includes(states[itemId]))
    throw Error('Bootstrap WorkItem is not in a valid Fileset proposal or Repair state');
  let repairScope = null;
  if (repairMode) {
    if (!repair || typeof repair !== 'object' || Array.isArray(repair) ||
        Object.keys(repair).length !== 1 || typeof repair.verificationItem !== 'string')
      throw Error('Explicit existing failed-verification WorkItem required for Host Repair');
    const verifier=workflow.items.find(node=>node.id===repair.verificationItem);
    const evidenceRef=current.bootstrap.verifications?.[repair.verificationItem];
    if (!verifier || verifier.kind!=='local-verification' ||
        !dependentsOf(workflow,itemId).includes(repair.verificationItem) ||
        states[repair.verificationItem]!=='LOCAL_FAILED' || !evidenceRef)
      throw Error('Host Repair requires current dependent LOCAL_FAILED Evidence');
    const evidence=store.readArtifact(evidenceRef);
    const digests=recordedDigests(store,current);
    if (evidence.kind!=='BootstrapLocalVerification' ||
        evidence.status!=='LOCAL_FAILED' || evidence.authority!=='LOCAL_EXECUTED' ||
        evidence.taskId!==taskId || evidence.itemId!==repair.verificationItem ||
        evidence.workflowHash!==workflow.workflowHash || hash(evidence.fileDigests)!==hash(digests))
      throw Error('Host Repair failure Evidence is inconsistent with current Bootstrap tree');
    const sourceFiles=await context(plan.probe.root,{context:item.files,tests:[]});
    if (item.files.some(name=>hash(sourceFiles[name])!==digests[name]))
      throw Error('Host Repair source differs from recorded materialized files');
    const prior=store.get(current.bootstrap.filesets[itemId]);
    if (!prior || (prior.state!=='COMPLETED' &&
        !(prior.operation==='modify' && ['WAITING_APPROVAL','READY'].includes(prior.state))))
      throw Error('Host Repair requires completed files or a replaceable pending Repair');
    repairScope=Object.freeze({
      verificationItem:repair.verificationItem,evidenceRef,
      fileDigests:Object.freeze(item.files.map(path=>Object.freeze({path,sha256:digests[path]}))),
      sourceFiles:Object.freeze(sourceFiles),
      failure:Object.freeze({
        reason:evidence.reason ?? null,
        observed:Object.freeze({
          exitCode:evidence.observed?.exitCode ?? null,
          tests:evidence.observed?.tests ?? null,
          passed:evidence.observed?.passed ?? null,
          failed:evidence.observed?.failed ?? null
        }),
        log:typeof evidence.log==='string' ? evidence.log.slice(0,16000) : ''
      })
    });
  }
  const ensureRepairFresh=async()=>{
    if (!repairScope) return;
    const latest=bootstrapContext(store,taskId), liveStates=effectiveStates(store,latest.current,latest.workflow);
    const liveDigests=recordedDigests(store,latest.current);
    if (latest.current.bootstrap.verifications?.[repairScope.verificationItem]!==repairScope.evidenceRef ||
        liveStates[repairScope.verificationItem]!=='LOCAL_FAILED' ||
        !['MATERIALIZED','REPAIR_PROPOSED'].includes(liveStates[itemId]) ||
        hash(repairScope.fileDigests)!==hash(item.files.map(path=>({path,sha256:liveDigests[path]}))))
      throw Error('Host Repair failure Evidence or recorded digests changed');
    const observed=await context(plan.probe.root,{context:item.files,tests:[]});
    if (hash(observed)!==hash(repairScope.sourceFiles))
      throw Error('Host Repair source changed during review or Turn');
  };
  // A Host executable is a billable execution boundary. The owner must review
  // its real target, not only an absolute path that can be repointed later.
  const pinnedExecutable = await realpath(executable);
  if (!(await stat(pinnedExecutable)).isFile())
    throw Error('Bootstrap Host executable must resolve to a regular file');
  // A stable canonical path is insufficient: an executable can be rewritten
  // in place while the owner reviews it or while a billable Turn runs.
  // Bind the reviewed binary bytes as well as its real path.
  const pinnedExecutableSha256 = await executableSha256(pinnedExecutable);
  const ensureExecutable = async () => {
    if (await realpath(executable) !== pinnedExecutable ||
        !(await stat(pinnedExecutable)).isFile() ||
        await executableSha256(pinnedExecutable) !== pinnedExecutableSha256)
      throw Error('Bootstrap Host executable changed during approval or Turn');
  };
  // A Plan pointer can remain unchanged while the Host's cwd is replaced.
  // Pin the actual directory identity before approval and recheck it before
  // dispatch and after the Turn. This is not atomic filesystem confinement.
  const pinnedRoot = await realpath(plan.probe.root);
  const pinnedRootStat = await stat(pinnedRoot);
  if (pinnedRoot !== plan.probe.root || !pinnedRootStat.isDirectory())
    throw Error('Bootstrap Host repository must be its original canonical directory');
  const repositoryIdentity = Object.freeze({
    dev:pinnedRootStat.dev,ino:pinnedRootStat.ino,birthtimeMs:pinnedRootStat.birthtimeMs
  });
  const ensureRepository = async () => {
    const root = await realpath(plan.probe.root);
    const observed = await stat(root);
    if (root !== pinnedRoot || !observed.isDirectory() ||
        observed.dev !== repositoryIdentity.dev || observed.ino !== repositoryIdentity.ino ||
        observed.birthtimeMs !== repositoryIdentity.birthtimeMs)
      throw Error('Bootstrap Host repository identity changed during approval or Turn');
  };
  // Review the immutable target Plan and actual WorkItem scope, not only its
  // revision/hash. A Plan pointer can be substituted without bumping either.
  const scope = Object.freeze({
    taskId,itemId,revision:current.revision,
    planRef:current.planRef,workflowRef:current.bootstrap.workflowRef,
    repo:plan.probe.root,repositoryIdentity,workflowHash:workflow.workflowHash,
    executablePath:executable,executableResolvedPath:pinnedExecutable,
    executableSha256:pinnedExecutableSha256,model,timeoutMs,
    probeHash:plan.probe.probeHash,goal:plan.intent.original,
    files:Object.freeze([...item.files]),
    operation:repairMode?'repair':'create',...(repairScope?{repair:repairScope}:{}),
    expiresAt:Date.now()+timeoutMs
  });
  const ensureFresh = () => {
    const latest = bootstrapContext(store,taskId);
    const latestItem = latest.workflow.items.find(node=>node.id===itemId);
    if(latest.current.revision!==scope.revision ||
        latest.current.planRef!==scope.planRef ||
        latest.current.bootstrap.workflowRef!==scope.workflowRef ||
        latest.workflow.workflowHash!==scope.workflowHash ||
        latest.plan.probe.root!==scope.repo ||
        latest.plan.probe.probeHash!==scope.probeHash ||
        latest.plan.intent.original!==scope.goal ||
        !latestItem || latestItem.kind!=='local-edit' ||
        hash(latestItem.files)!==hash(scope.files) ||
        !(repairMode?['MATERIALIZED','REPAIR_PROPOSED']:['PENDING_FILESET','FILESET_PROPOSED']).includes(latest.current.bootstrap.states[itemId]))
      throw Error('Bootstrap Host Fileset scope changed during review or Turn');
  };
  const allowed = await authorize(scope);
  if (allowed !== true) throw Error('Host Fileset proposal requires trusted exact bounded approval');
  if(Date.now()>=scope.expiresAt) throw Error('Bootstrap Host Fileset approval expired');
  await ensureExecutable();
  await ensureRepository();
  ensureFresh();
  await ensureRepairFresh();
  const prompt = JSON.stringify({kind:repairMode?'CODEFLEET_NEW_PROJECT_REPAIR_FILESET_V1':'CODEFLEET_NEW_PROJECT_FILESET_V1',...scope,
    instruction:(repairMode
      ? 'Return only JSON {revision,itemId,repair:{verificationItem,evidenceRef},files:[{path,content,baseSha256}]}. ' +
        'Use the exact failure Evidence binding and pinned baseSha256 for each changed file. ' +
        'Repair only necessary owned files; do not add paths or claim verification passed. '
      : 'Return only JSON {revision,itemId,files:[{path,content}]}. ' +
        'Include exactly the listed planned files. Write actual bounded source/test content. ') +
      'Do not run commands, edit disk, access credentials/network, approve, or claim tests passed.'});
  if (Buffer.byteLength(prompt)>160000) throw Error('Bootstrap prompt too large');
  const intentRef=store.artifact({kind:'BOOTSTRAP_HOST_TURN_INTENT',...scope,model});
  store.db.exec('BEGIN IMMEDIATE');
  try {
    ensureFresh();
    if(store.events(taskId).some(event=>event.type==='BOOTSTRAP_HOST_TURN_RESERVED' &&
      event.body.itemId===itemId && event.body.revision===current.revision))
      throw Error('Previous Bootstrap Host Turn requires reconciliation; no replay');
    store.event(taskId,'BOOTSTRAP_HOST_TURN_RESERVED',{itemId,revision:current.revision,intentRef});
    store.db.exec('COMMIT');
  } catch(error) {store.db.exec('ROLLBACK');throw error;}
  try {
    const receipt=await transport({executable:pinnedExecutable,cwd:plan.probe.root,model,prompt,
      outputSchema:repairMode?bootstrapRepairOutputSchema:bootstrapFilesOutputSchema,timeoutMs});
    if(!receipt||receipt.terminalStatus!=='completed'||!receipt.threadId||!receipt.turnId||
      receipt.authority!=='PROVIDER_REPORTED_ONLY'||receipt.protectedVerified!==false||
      typeof receipt.text!=='string') throw Error('Bootstrap Host Turn receipt incomplete');
    await ensureExecutable();
    await ensureRepository();
    // A completed but late Host Turn cannot consume an expired owner grant.
    // Keep the durable reservation uncertain; do not submit or replay files.
    if (Date.now() >= scope.expiresAt)
      throw Error('Bootstrap Host Fileset approval expired during Turn');
    const proposed=JSON.parse(receipt.text);
    if (repairMode)
      validateBootstrapHostRepairProposal(proposed,workflow,itemId,current.revision,repairScope,
        recordedDigests(store,bootstrapContext(store,taskId).current));
    else validateBootstrapHostProposal(proposed,workflow,itemId,current.revision);
    // The Host proposal is not authority to submit against an unreviewed
    // replacement Plan, repository, Workflow, or failed Evidence after a Turn.
    ensureFresh();
    await ensureRepairFresh();
    const submitted=await submitBootstrapFiles(store,taskId,proposed);
    store.event(taskId,'BOOTSTRAP_HOST_TURN_SUBMITTED',{
      itemId,revision:current.revision,intentRef,threadId:receipt.threadId,turnId:receipt.turnId,
      authority:'PROVIDER_REPORTED_ONLY',executionGranted:false
    });
    return { ...submitted,hostReceipt:{threadId:receipt.threadId,turnId:receipt.turnId},
      modelCost:'UNKNOWN',executionGranted:false,materialized:false };
  } catch(error) {
    store.event(taskId,'BOOTSTRAP_HOST_TURN_RECONCILING',{
      itemId,revision:current.revision,intentRef,reason:'No automatic replay of uncertain/billable Host Turn'
    });
    throw error;
  }
}
