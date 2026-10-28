// A projection of the existing Store, never a resume command or authority issuer.
import { hash } from '../alpha/contract.mjs';
import { bootstrapContext, task } from './tasks.mjs';
import { continuationSnapshot } from './continuation.mjs';
import { localTree } from '../verification/backends.mjs';

// Inspect the existing schema; recovery never installs a missing extension.
function inspectSchema(store) {
  if (store.db.prepare('PRAGMA user_version').get().user_version !== 2) throw Error('Recovery requires existing V2 task schema; migration is a separate write operation');
  const tables = {
    runs: 'id,body,owner,leaseUntil,pid,control', events: 'seq,runId,at,type,body',
    graph_revisions: 'runId,revision,digest,body', workflow_approvals: 'runId,revision,digest,actor,expires',
    workflow_attempts: 'runId,itemId,childId,revision,status', workflow_extensions: 'name,version',
    agent_messages: 'seq,runId,messageId,digest,body', product_tasks: 'id,revision,body'
  };
  const requireTable = (name, columns) => {
    if (!store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)) throw Error('Missing recovery table: ' + name);
    store.db.prepare(`SELECT ${columns} FROM ${name} LIMIT 0`).all();
  };
  for (const [name, columns] of Object.entries(tables)) requireTable(name, columns);
  for (const name of ['controlled-hybrid', 'product-tasks']) {
    if (store.db.prepare('SELECT version FROM workflow_extensions WHERE name=?').get(name)?.version !== 1) throw Error('Unsupported recovery extension: ' + name);
  }
  const reservations = store.db.prepare("SELECT version FROM workflow_extensions WHERE name='bootstrap-reservations'").get();
  const reservationTables = store.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('bootstrap_decisions','bootstrap_reservations')").all();
  if (reservations || reservationTables.length) {
    if (reservations?.version !== 1) throw Error('Unsupported recovery reservation schema');
    requireTable('bootstrap_decisions', 'id,requestId,taskId,body,issued,expires,revoked,consumed,remaining');
    requireTable('bootstrap_reservations', 'requestId,decisionId,runId,taskId,repo,revision,state,body');
  }
}

export async function recoverObjective(store, taskId, expected) {
  const result = { schemaVersion: 1, kind: 'ObjectiveRecovery', taskId,
    authority: 'PERSISTED_STATE_INSPECTION', executionGranted: false, modelInvocationGranted: false,
    automaticReplay: false, complete: false, status: 'HUMAN_HANDOFF', next: null, blockers: [] };
  const block = reason => { if (!result.blockers.includes(reason)) result.blockers.push(reason); };
  try {
    inspectSchema(store);
    if (expected && (Object.keys(expected).sort().join(',') !== 'candidateHash,revision,taskHash,workflowHash' ||
        !Number.isSafeInteger(expected.revision) || ['candidateHash', 'taskHash', 'workflowHash'].some(k => !/^[a-f0-9]{64}$/.test(expected[k]))))
      throw Error('Invalid recovery binding; conversation summaries are not authority');
    const pending=task(store,taskId);
    if(!pending.bootstrap&&!pending.runId){
      const plan=store.readArtifact(pending.planRef),events=store.events(taskId);
      const row=store.db.prepare('SELECT revision FROM product_tasks WHERE id=?').get(taskId);
      const latest=events.filter(e=>e.body?.planRef&&Number.isSafeInteger(e.body.revision)).at(-1);
      const effects=store.list().filter(r=>r.id===taskId||r.taskId===taskId);
      if(!['NEW_PROJECT','EXISTING_LOCAL'].includes(plan.contractKind)||!['NEEDS_INPUT','CAPABILITY_GAP','BLOCKED','VALIDATED'].includes(pending.state)||
        effects.length||events.some(e=>e.type.startsWith('BOOTSTRAP_')&&e.type!=='BOOTSTRAP_DRAFT_VALIDATED')||
        row.revision!==pending.revision||latest?.body.revision!==pending.revision||latest?.body.planRef!==pending.planRef)
        throw Error('Unprepared task has inconsistent lifecycle records');
      if(expected)throw Error('Workflow binding unavailable before preparation');
      return {...result,status:'RECOVERED',stage:'DRAFT',draftBinding:{revision:pending.revision,taskHash:hash(pending),planHash:pending.planRef},
        objective:{id:taskId,text:plan.draft.objective,criteria:plan.draft.criteria,scope:plan.draft.scope,planRef:pending.planRef},
        validation:plan.validation,next:{kind:pending.state==='VALIDATED'?'PREPARE_WORKFLOW':'REVIEW_DRAFT'},
        humanHandoff:true,requiredNextApproval:'DRAFT_REVIEW_NOT_EXECUTION',
        workLog:{eventCount:events.length,lastSequence:events.at(-1)?.seq??null,hash:hash(events)},
        verification:'NOT_RUN',protectedVerification:'UNSATISFIED'};
    }
    const { current, plan, workflow } = bootstrapContext(store, taskId);
    const events = store.events(taskId), eventHash = hash(events);
    const candidateHash = await localTree(current.repo);
    result.binding = { revision: current.revision, workflowHash: workflow.workflowHash, taskHash: hash(current), candidateHash };
    result.objective = { id: taskId, text: plan.draft.objective, criteria: plan.draft.criteria, scope: plan.draft.scope, planRef: current.planRef };
    result.workLog = { eventCount: events.length, lastSequence: events.at(-1)?.seq ?? null, hash: eventHash,
      recent: events.slice(-30).map(({ seq, at, type, body }) => ({ seq, at, type, body })) };
    const row = store.db.prepare('SELECT revision FROM product_tasks WHERE id=?').get(taskId);
    // Reservation evidence binds the pre-execution revision; its committed event
    // advances the Task by one. Ordinary Task updates record the resulting revision.
    const revisions = events.flatMap(e => e.type === 'BOOTSTRAP_LOCAL_VERIFICATION_RECORDED'
      ? [e.body.revision + 1] : e.body?.planRef && Number.isSafeInteger(e.body.revision) ? [e.body.revision] : []);
    const lastRevision = revisions.at(-1);
    if (row.revision !== current.revision || lastRevision !== current.revision) block('TASK_WORKLOG_REVISION_MISMATCH');
    if (expected && Object.keys(result.binding).some(k => result.binding[k] !== expected[k])) block('STALE_RECOVERY_BINDING');
    const snapshot = await continuationSnapshot(store, taskId);
    result.workItems = snapshot.workItems; result.remaining = snapshot.remaining;
    result.budget = { ...snapshot.budget, cost: { taskAttemptBudgetUsd: current.settings.attemptBudgetUsd,
      hostModelRequests: 'UNKNOWN', hostMeasuredUsd: 'UNKNOWN', hardHostCostCapEnforced: false } };
    result.reservations = snapshot.reservations; result.judgments = snapshot.judgments;
    result.verification = snapshot.verification; result.protectedVerification = snapshot.protectedVerification;
    const runIds = new Set(Object.values(current.bootstrap.filesets));
    for (const r of snapshot.reservations) if (r.reservation?.runId) runIds.add(r.reservation.runId);
    const runs = store.db.prepare('SELECT * FROM runs ORDER BY rowid').all()
      .filter(r => runIds.has(r.id) || JSON.parse(r.body).taskId === taskId);
    result.leases = runs.map(r => ({ runId: r.id, owner: r.owner, until: r.leaseUntil, pid: r.pid, control: r.control }));
    result.filesets = runs.filter(r => JSON.parse(r.body).kind === 'bootstrap-fileset').map(r => {
      const run = JSON.parse(r.body), approval = store.db.prepare('SELECT * FROM workflow_approvals WHERE runId=? AND revision=?').get(r.id, run.revision);
      const content = store.readArtifact(run.contentRef);
      if (hash(run.contract) !== run.contractHash || hash(content.manifest) !== run.contractHash ||
          hash(content.files.map(({ path, baseSha256, sha256, bytes }) => run.operation==='modify' ? {path,operation:'modify',baseSha256,sha256,bytes} : { path, sha256, bytes })) !== hash(run.contract.files) ||
          content.files.some(f => hash(f.content) !== f.sha256)) block('FILESET_EVIDENCE_DEFECT');
      if (run.state === 'COMPLETED') {
        const receipt = store.readArtifact(run.materializationRef);
        if (receipt.status !== 'MATERIALIZED' || receipt.authority !== 'CODEFLEET_DIRECT_WRITE' || receipt.filesetHash !== run.contractHash ||
            receipt.results.length !== run.contract.files.length || receipt.results.some(r => hash(r) !== hash(run.results[r.path])))
          block('MATERIALIZATION_RECEIPT_DEFECT');
      }
      const validNow = Boolean(approval && approval.digest === run.contractHash && approval.expires > Date.now());
      return { runId: r.id, itemId: run.itemId, state: run.state, filesetHash: run.contractHash, files: run.contract.files,
        materializationRef: run.materializationRef ?? null, results: run.results, approval: approval ?? null,
        approvalValidNow: validNow, alreadyApplied: run.state === 'COMPLETED', executionGranted: false };
    });
    result.effects = runs.filter(r => { const run = JSON.parse(r.body); return r.owner ||
      ['RESERVED', 'STARTED', 'HUMAN_HANDOFF', 'MATERIALIZING', 'WAITING_HUMAN'].includes(run.state) ||
      run.kind === 'bootstrap-fileset' && run.state !== 'COMPLETED' && Object.keys(run.results ?? {}).length; })
      .map(r => ({ runId: r.id, state: JSON.parse(r.body).state, effects: 'UNCONFIRMED', resolution: 'RECONCILE_WITHOUT_RELAUNCH_OR_REFUND' }));
    if (result.effects.length) block('UNCERTAIN_OR_ACTIVE_EFFECTS');
    if (snapshot.status === 'HUMAN_HANDOFF') block(snapshot.reason);
    let next = snapshot.next;
    if (next?.kind === 'MATERIALIZE') {
      const f = result.filesets.find(f => f.runId === current.bootstrap.filesets[next.itemId]);
      if (!f?.approvalValidNow) { block('FILESET_APPROVAL_REQUIRED'); next = { kind: 'AWAIT_FILESET_APPROVAL', itemId: next.itemId }; }
    }
    // Read-time consistency, not a lock or an execution grant. Every eventual effect rechecks its own fences.
    if (hash(task(store, taskId)) !== result.binding.taskHash || hash(store.events(taskId)) !== eventHash ||
        await localTree(current.repo) !== candidateHash) block('RECOVERY_CHANGED_DURING_INSPECTION');
    result.observationHash = hash({ binding: result.binding, eventHash, filesets: result.filesets, leases: result.leases, reservations: result.reservations });
    result.status = result.blockers.length ? (result.effects.length ? 'RECONCILE' : 'HUMAN_HANDOFF') : 'RECOVERED';
    result.next = result.blockers.length ? null : next;
    result.complete = !result.blockers.length && snapshot.complete === true;
    result.humanHandoff = result.blockers.length > 0 || next?.kind !== 'PROPOSE_FILESET';
    result.requiredNextApproval = next?.kind === 'PROPOSE_FILESET' ? 'SEPARATE_HOST_MODEL_CALL_THEN_EXACT_FILESET' : 'FRESH_EXACT_EXECUTION_REVIEW';
    if (result.complete) { result.humanHandoff = false; result.requiredNextApproval = null; }
  } catch (error) { block('RECOVERY_RECORD_DEFECT: ' + error.message); result.status = 'HUMAN_HANDOFF'; result.next = null; result.humanHandoff = true; }
  return result;
}
