// Codex Host-owned planning Turn routed through the existing cited draft
// validator. This is only an injected, approved, read-only capability.
// A created planning session is a durable reservation before a billable Turn;
// an unresolved dispatch is never replayed automatically.
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { beginPlanning, cancelPlanning, submitPlanning, PLANNING_PROFILE } from './planning.mjs';
import { readCodeContext } from '../intent/semantic.mjs';
import { runCodexReadOnlyTurn } from './codex-app-server-session.mjs';

export const planningOutputSchema = {
  type: 'object', additionalProperties: false,
  required: ['sessionId','requestHash','proposal'],
  properties: {
    sessionId: { type: 'string' }, requestHash: { type: 'string' },
    proposal: {
      type: 'object', additionalProperties: false,
      required: ['draft','references','inferences'],
      properties: {
        draft: { type: 'object' },
        references: { type: 'array',items: {type:'object',additionalProperties:false,
          required:['path','line','quote'],properties:{
            path:{type:'string'},line:{type:'integer'},quote:{type:'string'} }} },
        inferences: { type:'array',items:{type:'string'} }
      }
    }
  }
};

export async function planWithCodexManagedThread(store, repo, objective, {
  executable, model, cwd, version = '0.166.0',
  authorize, transport = runCodexReadOnlyTurn,
} = {}) {
  if (!store || typeof authorize !== 'function' || typeof transport !== 'function' ||
      !isAbsolute(cwd ?? '') || !isAbsolute(executable ?? '') ||
      typeof model !== 'string' || !model || !Number.isFinite(PLANNING_PROFILE.timeoutMs))
    throw Error('Explicit trusted Codex Host planning configuration required');
  // The Host's working directory must be the exact repository whose pinned
  // source bytes are reviewed. Absolute paths alone do not establish this.
  if (await realpath(repo) !== await realpath(cwd))
    throw Error('Codex Host planning cwd must resolve to the observed repository');
  const request = await beginPlanning(store, repo, objective, { host:'codex', version });
  const binding = { sessionId: request.sessionId, requestHash:request.requestHash,
    contextHash:request.contextHash, profileHash:request.profileHash,
    skillHash:request.skillHash, expiresAt:request.expiresAt,
    model, hostVersion:version, cwd };
  let granted;
  try { granted = await authorize(Object.freeze({ ...binding })); }
  catch (error) {
    // A rejected review must not leave a submit-capable OPEN session behind.
    cancelPlanning(store, request.sessionId);
    throw error;
  }
  if (granted !== true) {
    cancelPlanning(store, request.sessionId);
    throw Error('Host planning Turn requires independently trusted bounded approval');
  }
  // Human approval can be asynchronous. A valid pinned request is not a grant
  // to dispatch against code that changed while the grant was being reviewed.
  // Refuse before reserving a potentially billable Host Turn, and invalidate
  // the OPEN session so a stale response cannot be submitted later.
  try {
    if (Date.now() >= request.expiresAt)
      throw Error('Planning authority expired before dispatch');
    const current = await readCodeContext(repo, objective);
    if (hash(current) !== request.contextHash ||
        current.discovery.dirty || current.discovery.base !== request.baseline)
      throw Error('Planning source context changed while awaiting approval');
    if (Date.now() >= request.expiresAt)
      throw Error('Planning authority expired before dispatch');
  } catch (error) {
    cancelPlanning(store, request.sessionId);
    throw error;
  }
  const prompt = JSON.stringify({ kind:'CODEFLEET_HOST_PLANNING_V1',
    sessionId:request.sessionId,requestHash:request.requestHash,
    originalObjective:objective,context:request.context,
    instruction:'Return ONLY a JSON object with sessionId/requestHash and proposal {draft,references,inferences}. ' +
      'Every proposed file must be grounded in exact path/line/quote from the pinned source. ' +
      'Preserve objective verbatim, mark unknown requirements unresolved. Do not use tools, edit, approve, run tests or claim complete.'
  });
  if (Buffer.byteLength(prompt) > 160000) {
    cancelPlanning(store, request.sessionId);
    throw Error('Planning context too large; narrow the objective');
  }
  const dispatchRef = store.artifact({ ...binding, kind:'CODEX_PLANNING_DISPATCH_INTENT' });
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const row = store.db.prepare('SELECT status,digest,body FROM host_planning WHERE id=?').get(request.sessionId);
    if (row?.status !== 'OPEN' || row.digest !== request.requestHash ||
        hash(JSON.parse(row.body)) !== request.requestHash || Date.now() >= request.expiresAt)
      throw Error('Planning session changed or expired');
    if (store.db.prepare("UPDATE host_planning SET status='DISPATCHED' WHERE id=? AND status='OPEN'").run(request.sessionId).changes !== 1)
      throw Error('Planning dispatch already reserved');
    store.event(request.sessionId,'HOST_PLANNING_TURN_RESERVED',{dispatchRef,requestHash:request.requestHash});
    store.db.exec('COMMIT');
  } catch(error) {
    store.db.exec('ROLLBACK');
    cancelPlanning(store, request.sessionId);
    throw error;
  }
  try {
    const receipt = await transport({
      executable,cwd,model,prompt,outputSchema:planningOutputSchema,
      timeoutMs:Math.min(PLANNING_PROFILE.timeoutMs,request.expiresAt-Date.now()),
    });
    if (receipt?.terminalStatus !== 'completed' || typeof receipt.text !== 'string' ||
        !receipt.threadId || !receipt.turnId || receipt.authority !== 'PROVIDER_REPORTED_ONLY' ||
        receipt.protectedVerified !== false) throw Error('Planning Host Turn has no acceptable receipt');
    const current = await readCodeContext(repo, objective);
    if (hash(current) !== request.contextHash) throw Error('Planning source context changed during Host Turn');
    const result = submitPlanning(store, receipt.text, {
      contextHash:request.contextHash,profileHash:request.profileHash,skillHash:request.skillHash
    });
    store.event(request.sessionId,'HOST_PLANNING_TURN_RESULT',{
      threadId:receipt.threadId,turnId:receipt.turnId,requestHash:request.requestHash,
      resultStatus:result.status,authority:'PROVIDER_REPORTED_ONLY',cost:'UNKNOWN'
    });
    return { ...result,hostReceipt:{threadId:receipt.threadId,turnId:receipt.turnId,
      terminalStatus:'completed',authority:'PROVIDER_REPORTED_ONLY'},
      costStatus:'UNKNOWN' };
  } catch(error) {
    // A possibly billable Turn was dispatched. Do not return to OPEN.
    store.db.prepare("UPDATE host_planning SET status='RECONCILING' WHERE id=? AND status='DISPATCHED'").run(request.sessionId);
    store.event(request.sessionId,'HOST_PLANNING_RECONCILING',{
      dispatchRef,reason:'Host Turn or draft validation not accepted; no automatic replay'
    });
    throw error;
  }
}
