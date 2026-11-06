// Host-Native NEW_PROJECT Fileset proposal path.
// Builds on the existing pre-HEAD Bootstrap workflow and exact Fileset review;
// Codex does not receive approval or direct filesystem write authority here.
import { isAbsolute } from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { bootstrapContext, submitBootstrapFiles } from '../product/tasks.mjs';
import { validateFileset } from '../workflow/bootstrap-files.mjs';
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
export function validateBootstrapHostProposal(response, workflow, itemId, revision) {
  if (!response || response.itemId !== itemId || response.revision !== revision)
    throw Error('Host Fileset proposal stale or unbound');
  const files = validateFileset(response, workflow, itemId);
  return { revision,itemId,files };
}
export async function proposeNewProjectFileset(store, taskId, itemId, {
  executable, model, authorize, transport = runCodexReadOnlyTurn, timeoutMs = 90000
} = {}) {
  if (!store || typeof authorize !== 'function' || typeof transport !== 'function' ||
      !isAbsolute(executable ?? '') || typeof model !== 'string' || !model ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw Error('Explicit bounded Codex Bootstrap configuration required');
  const {current,plan,workflow} = bootstrapContext(store,taskId);
  if (plan.contractKind !== 'NEW_PROJECT') throw Error('Use existing-source planning for non-NEW_PROJECT tasks');
  const item = workflow.items.find(n=>n.id===itemId);
  if (!item || item.kind !== 'local-edit' || !['PENDING_FILESET','FILESET_PROPOSED'].includes(current.bootstrap.states[itemId]))
    throw Error('Bootstrap WorkItem is not awaiting an approved Fileset proposal');
  // Review the immutable target Plan and actual WorkItem scope, not only its
  // revision/hash. A Plan pointer can be substituted without bumping either.
  const scope = Object.freeze({
    taskId,itemId,revision:current.revision,
    planRef:current.planRef,workflowRef:current.bootstrap.workflowRef,
    repo:plan.probe.root,workflowHash:workflow.workflowHash,
    probeHash:plan.probe.probeHash,goal:plan.intent.original,
    files:Object.freeze([...item.files]),expiresAt:Date.now()+timeoutMs
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
        !['PENDING_FILESET','FILESET_PROPOSED'].includes(latest.current.bootstrap.states[itemId]))
      throw Error('Bootstrap Host Fileset scope changed during review or Turn');
  };
  const allowed = await authorize(scope);
  if (allowed !== true) throw Error('Host Fileset proposal requires trusted exact bounded approval');
  if(Date.now()>=scope.expiresAt) throw Error('Bootstrap Host Fileset approval expired');
  ensureFresh();
  const prompt = JSON.stringify({kind:'CODEFLEET_NEW_PROJECT_FILESET_V1',...scope,
    instruction:'Return only JSON {revision,itemId,files:[{path,content}]}. ' +
      'Include exactly the listed planned files. Write actual bounded source/test content. ' +
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
    const receipt=await transport({executable,cwd:plan.probe.root,model,prompt,
      outputSchema:bootstrapFilesOutputSchema,timeoutMs});
    if(!receipt||receipt.terminalStatus!=='completed'||!receipt.threadId||!receipt.turnId||
      receipt.authority!=='PROVIDER_REPORTED_ONLY'||receipt.protectedVerified!==false||
      typeof receipt.text!=='string') throw Error('Bootstrap Host Turn receipt incomplete');
    const proposed=JSON.parse(receipt.text);
    validateBootstrapHostProposal(proposed,workflow,itemId,current.revision);
    // The Host proposal is not authority to submit against an unreviewed
    // replacement Plan, repository, or Workflow after an awaited model Turn.
    ensureFresh();
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
