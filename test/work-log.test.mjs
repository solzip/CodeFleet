import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/alpha/store.mjs';
import { task, submitBootstrapFiles, approveTask, materializeTask, verifyTask } from '../src/product/tasks.mjs';
import { prepare } from './fixtures/development-loop.mjs';
import { command } from '../src/alpha/process.mjs';
import { coordinationLog, assignWorkItem, recordDirective, decideDirective, prepareAgentHandoff,
  deliverAgentHandoff, acknowledgeAgentHandoff, reconcileAgentHandoff, requireCoordinatedWorkItem } from '../src/product/work-log.mjs';
import { reconcileDirective } from '../src/product/directives.mjs';
import { acceptContractRevision } from '../src/product/contract-revisions.mjs';
import { recoverObjective } from '../src/product/recovery.mjs';
import { continuationSnapshot } from '../src/product/continuation.mjs';
import { productCli } from '../src/product/cli.mjs';
import { executeOfflineDecision } from '../src/product/reservations.mjs';
import { localBackend } from '../src/verification/backends.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { localTree } from '../src/verification/backends.mjs';
import { reviewSupervisedProposal } from '../src/product/continuation.mjs';
import { prepareNativeFilesReview, acceptNativeFilesReview, prepareNativeLocalReview, acceptNativeLocalReview } from '../src/product/native-local.mjs';

async function directProposal(f) {
  assign(f, 'todo');
  const old = task(f.store, f.id), draft = structuredClone(f.store.readArtifact(old.planRef).draft);
  draft.criteria.find(c => c.id === 'todo').description += '; separate object identity';
  recordDirective(f.store, f.id, {directiveId:'supervised-change',revision:old.revision,text:'Clarify Todo',reason:'User instruction'});
  const revision = await reconcileDirective(f.store,f.id,'supervised-change',{revision:old.revision,draft});
  await acceptContractRevision(f.store,revision.reviewRef,{trust:revision.reviewHash,acknowledgeUnisolated:true});
  const current = task(f.store,f.id), h = coordinationLog(f.store,f.id).pendingHandoffs[0];
  return proposalForHandoff(f, h);
}

async function proposalForHandoff(f, h) {
  const current = task(f.store, f.id);
  const inputRef = f.store.artifact({kind:'CurrentSessionProposalContext',taskId:f.id,taskRevision:current.revision,
    contractRevision:2,handoffId:h.handoffId,packetRef:h.packetRef,packet:f.store.readArtifact(h.packetRef)});
  const content = "import {normalizeTitle} from './normalize-title.mjs'; export const createTodo=input=>({title:normalizeTitle(input),completed:false});\n";
  const proposal = {kind:'CurrentSessionDirectProposal',taskId:f.id,taskRevision:current.revision,contractRevision:2,
    handoffId:h.handoffId,packetRef:h.packetRef,candidateHash:await localTree(f.repo),inputRef,
    files:[{path:'src/create-todo.mjs',content,sha256:hash(content),bytes:Buffer.byteLength(content),baseSha256:null}],
    origin:'CURRENT_ASSISTANT_SESSION_NOT_DELEGATED_AGENT',authority:'PROVIDER_REPORTED_ONLY',executionGranted:false};
  return {proposal,ref:f.store.artifact(proposal),h};
}

async function failedSupervised(t) {
  const f = await setup(); t.after(() => f.store.close());
  const first = await f.call('propose', {itemId:'normalize'});
  await f.call('approve', {filesetHash:first.approvalRequest.filesetHash});
  await f.call('materialize', {itemId:'normalize'});
  const decision = await f.call('issue', {itemId:'verify-normalize'});
  await f.call('execute', {itemId:'verify-normalize',decision});
  const {proposal,h} = await directProposal(f);
  f.fixed = proposal.files[0].content;
  proposal.files[0].content = f.fixed.replace('completed:false','completed:true');
  proposal.files[0].sha256 = hash(proposal.files[0].content);
  proposal.files[0].bytes = Buffer.byteLength(proposal.files[0].content);
  f.proposalRef = f.store.artifact(proposal); f.h = h;
  const reviewed = await reviewSupervisedProposal(f.store,f.id,f.proposalRef);
  const registered = await submitBootstrapFiles(f.store,f.id,reviewed.input,{supervisedProposalRef:f.proposalRef});
  f.originalRunId = registered.approvalRequest.runId;
  const review = await prepareNativeFilesReview(f.store,f.id,'todo');
  await acceptNativeFilesReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
  f.original = f.store.get(f.originalRunId);
  f.request = {executable:process.execPath,args:['--test','--test-reporter=tap','test/normalize-title.test.mjs','test/create-todo.test.mjs'],directory:f.repo,timeoutMs:10000};
  const verification = await prepareNativeLocalReview(f.store,f.id,{request:f.request});
  const failed = await acceptNativeLocalReview(f.store,verification.reviewRef,{trust:verification.reviewHash,acknowledgeUnisolated:true});
  assert.equal(failed.execution.status,'LOCAL_FAILED');
  f.failureRef = failed.execution.evidenceRef; f.failure = f.store.readArtifact(f.failureRef);
  f.input = {revision:task(f.store,f.id).revision,itemId:'todo',repair:{verificationItem:'verify-integrated',evidenceRef:f.failureRef},
    files:[{path:'src/create-todo.mjs',baseSha256:f.failure.fileDigests['src/create-todo.mjs'],content:f.fixed}]};
  return f;
}

test('supervised Repair: real failure -> separately approved replacement -> new evidence/Judge -> process Recovery', async t => {
  const f = await failedSupervised(t);
  const fixedTests = await readFile(path.join(f.repo,'test/create-todo.test.mjs'));
  const before = await f.call('recover');
  // Historical adoption survives old approval expiry; it cannot approve repair.
  f.store.db.prepare('UPDATE workflow_approvals SET expires=0 WHERE runId=?').run(f.originalRunId);
  const repair = await submitBootstrapFiles(f.store,f.id,f.input);
  const runId = repair.approvalRequest.runId;
  assert.notEqual(runId,f.originalRunId);
  assert.equal(f.store.get(runId).supervisedProposal,undefined);
  assert.deepEqual(f.store.get(f.originalRunId),f.original);
  await assert.rejects(materializeTask(f.store,f.id,'todo'),/approval/);
  assert.doesNotThrow(()=>requireCoordinatedWorkItem(f.store,f.id,'todo'));
  const review = await prepareNativeFilesReview(f.store,f.id,'todo');
  await assert.rejects(acceptNativeFilesReview(f.store,review.reviewRef,{trust:'bad',acknowledgeUnisolated:true}),/consent/);
  const applied = await acceptNativeFilesReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
  assert.equal(f.store.get(runId).state,'COMPLETED');
  assert.ok(applied);
  assert.equal((await acceptNativeFilesReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true})).status,'RECORDED_NO_REPLAY');
  await assert.rejects(materializeTask(f.store,f.id,'todo'),/terminal/);
  const verification = await prepareNativeLocalReview(f.store,f.id,{request:f.request});
  assert.equal(verification.review.repair.runId,runId);
  const verified = await acceptNativeLocalReview(f.store,verification.reviewRef,{trust:verification.reviewHash,acknowledgeUnisolated:true});
  assert.equal(verified.execution.status,'LOCAL_PASSED');
  assert.equal(verified.complete,true);
  assert.notEqual(verified.execution.reservation.candidateTreeHash,f.failure.observed.candidateTreeHash);
  assert.equal(verified.snapshot.judgments['verify-integrated'].outcome,'ESCALATE');
  assert.equal((await acceptNativeLocalReview(f.store,verification.reviewRef,{trust:verification.reviewHash,acknowledgeUnisolated:true})).action,'RECONCILE_OR_RECORDED');
  const after = await f.call('recover');
  assert.equal(after.status,'RECOVERED'); assert.equal(after.complete,true);
  assert.equal(after.budget.usedAttempts,before.budget.usedAttempts+1);
  assert.equal(after.budget.remainingAttempts,0);
  assert.deepEqual(after.effects,[]);
  assert.ok(after.leases.every(l=>!l.owner));
  assert.equal(after.coordination.pendingHandoffs[0].status,'PREPARED');
  assert.equal(after.filesets.find(r=>r.runId===f.originalRunId).proposalProvenance.authority,'PROVIDER_REPORTED_ONLY');
  assert.deepEqual(f.store.readArtifact(f.failureRef),f.failure);
  assert.deepEqual(f.store.get(f.originalRunId),f.original);
  assert.deepEqual(await readFile(path.join(f.repo,'test/create-todo.test.mjs')),fixedTests);
  const noMore = await prepareNativeLocalReview(f.store,f.id,{request:f.request});
  assert.equal(noMore.action,'HUMAN_HANDOFF');
  assert.equal(noMore.reviewHash,undefined);
  assert.equal((await f.call('recover')).budget.usedAttempts,after.budget.usedAttempts);
});

test('supervised Repair: missing/tampered/stale adoption and mismatched failure or source stay blocked', async t => {
  const f = await failedSupervised(t);
  for (const mutate of [p=>p.repair.evidenceRef='0'.repeat(64),p=>delete p.repair,
    p=>p.repair.evidenceRef=f.store.artifact({...f.failure,observed:{...f.failure.observed,candidateTreeHash:'0'.repeat(64)}}),
    p=>p.files[0].baseSha256='0'.repeat(64),p=>p.files[0].path='test/create-todo.test.mjs']) {
    const p=structuredClone(f.input); mutate(p);
    await assert.rejects(submitBootstrapFiles(f.store,f.id,p));
  }
  const repair = await submitBootstrapFiles(f.store,f.id,f.input);
  const originalTask = task(f.store,f.id), originalRun = f.store.get(f.originalRunId);
  const saveTask = v => f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(v),f.id);
  const saveRun = v => f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(v),f.originalRunId);
  for(const mutate of [v=>v.bootstrap.history=[],v=>v.contractRevision++]) {
    const v=structuredClone(originalTask);mutate(v);saveTask(v);
    await assert.rejects(prepareNativeFilesReview(f.store,f.id,'todo'),/HANDOFF|Contract revision history/);
    saveTask(originalTask);
  }
  for(const mutate of [r=>delete r.supervisedProposal,r=>r.supervisedProposal.packetRef='0'.repeat(64),
    r=>r.supervisedProposal.contractRevision--,r=>r.contract.files[0].sha256='0'.repeat(64)]) {
    const r=structuredClone(originalRun);mutate(r);saveRun(r);
    await assert.rejects(prepareNativeFilesReview(f.store,f.id,'todo'),/HANDOFF/);
    saveRun(originalRun);
  }
  const run=f.store.get(repair.approvalRequest.runId),changed=structuredClone(run);
  changed.contract.repairOf.evidenceRef=f.store.artifact({...f.failure,workflowHash:'0'.repeat(64)});
  changed.contractHash=hash(changed.contract);
  f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(changed),run.id);
  await assert.rejects(prepareNativeFilesReview(f.store,f.id,'todo'),/HANDOFF/);
  f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run),run.id);
  assert.throws(()=>acknowledgeAgentHandoff(f.store,f.id,f.h.handoffId,{}, {observed:true}),/Unmatched/);
  await assert.rejects(deliverAgentHandoff(f.store,f.id,f.h.handoffId,async()=>{throw Error('must not dispatch');}),/Supervised/);
  assert.equal(f.store.get(run.id).state,'WAITING_APPROVAL');
});

test('supervised Repair: expired/revoked review, active lease, uncertain effects and exhausted budget cannot execute', async t => {
  const f = await failedSupervised(t);
  const repair=await submitBootstrapFiles(f.store,f.id,f.input),runId=repair.approvalRequest.runId;
  const review=await prepareNativeFilesReview(f.store,f.id,'todo');
  const expired={...review.review,createdAt:Date.now()-2000,expiresAt:Date.now()-1000};
  const expiredHash=hash(expired),expiredRef=f.store.artifact({review:expired,reviewHash:expiredHash});
  await assert.rejects(acceptNativeFilesReview(f.store,expiredRef,{trust:expiredHash,acknowledgeUnisolated:true}),/expired/);
  f.store.event(f.id,'NATIVE_FILESET_REVIEW_REVOKED',{reviewRef:review.reviewRef});
  await assert.rejects(acceptNativeFilesReview(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true}),/revoked/);
  approveTask(f.store,f.id,{actor:'test',workflowHash:repair.approvalRequest.filesetHash,expiresAt:Date.now()+60000});
  f.store.db.prepare('UPDATE runs SET owner=?,leaseUntil=? WHERE id=?').run('other',Date.now()+60000,runId);
  assert.equal((await f.call('recover')).status,'RECONCILE');
  await assert.rejects(materializeTask(f.store,f.id,'todo'),/lease|claim/i);
  f.store.db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0 WHERE id=?').run(runId);
  const run=f.store.get(runId);
  f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify({...run,state:'MATERIALIZING'}),runId);
  await assert.rejects(prepareNativeFilesReview(f.store,f.id,'todo'),/Eligible|reconciliation/);
  assert.equal((await f.call('recover')).status,'RECONCILE');
  f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run),runId);
  const fresh=await prepareNativeFilesReview(f.store,f.id,'todo');
  await acceptNativeFilesReview(f.store,fresh.reviewRef,{trust:fresh.reviewHash,acknowledgeUnisolated:true});
  const current=task(f.store,f.id);current.settings.maxAttempts=2;
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(current),f.id);
  const denied=await prepareNativeLocalReview(f.store,f.id,{request:f.request});
  assert.equal(denied.reviewHash,undefined);
  assert.equal((await f.call('recover')).budget.usedAttempts,2);
  const receiptRef=f.store.artifact({kind:'AgentHandoffObservation',handoffId:f.h.handoffId,packetRef:f.h.packetRef,status:'DELIVERY_UNCONFIRMED'});
  f.store.event(f.id,'AGENT_HANDOFF_OBSERVED',{handoffId:f.h.handoffId,receiptRef,status:'DELIVERY_UNCONFIRMED'});
  const uncertain=await f.call('recover');
  assert.equal(uncertain.status,'RECONCILE');
  assert.throws(()=>requireCoordinatedWorkItem(f.store,f.id,'todo'),/HANDOFF/);
  assert.equal(uncertain.budget.usedAttempts,2);
});

test('supervised proposal review and registration preserve PREPARED and require exact apply approval across recovery', async () => {
  const f = await setup();
  try {
    const first = await f.call('propose',{itemId:'normalize'});
    await f.call('approve',{filesetHash:first.approvalRequest.filesetHash});
    await f.call('materialize',{itemId:'normalize'});
    const decision = await f.call('issue',{itemId:'verify-normalize'});
    await f.call('execute',{itemId:'verify-normalize',decision});
    const {ref,h} = await directProposal(f), before = await recoverObjective(f.store,f.id);
    const events = f.store.events(f.id), current = task(f.store,f.id);
    const review = await reviewSupervisedProposal(f.store,f.id,ref);
    assert.equal(review.executionGranted,false); assert.equal(review.contractRevision,2);
    assert.deepEqual(f.store.events(f.id),events); assert.deepEqual(task(f.store,f.id),current);
    assert.equal((await productCli(['supervised-proposal-review',f.id,ref],f.state)).exitCode,0);
    await assert.rejects(submitBootstrapFiles(f.store,f.id,review.input),/HANDOFF/);
    await assert.rejects(submitBootstrapFiles(f.store,f.id,{...review.input,files:[]},{supervisedProposalRef:ref}),/differs/);
    const registered = await productCli(['supervised-proposal-register',f.id,ref],f.state);
    assert.equal(registered.exitCode,2);
    const proposed = registered.data;
    const run = f.store.get(proposed.approvalRequest.runId);
    assert.equal(run.state,'WAITING_APPROVAL'); assert.equal(run.supervisedProposal.authority,'PROVIDER_REPORTED_ONLY');
    await assert.rejects(materializeTask(f.store,f.id,'todo'),/approval/);
    assert.throws(()=>acknowledgeAgentHandoff(f.store,f.id,h.handoffId,{}, {observed:true}),/Unmatched/);
    await assert.rejects(deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{throw Error('must not call');}),/Supervised/);
    const restarted = await f.call('recover');
    assert.deepEqual(restarted.budget,before.budget); assert.deepEqual(restarted.reservations,before.reservations);
    assert.equal(restarted.coordination.pendingHandoffs[0].status,'PREPARED');
    assert.deepEqual(restarted.blockers,[]);
    assert.deepEqual(restarted.next,{kind:'AWAIT_FILESET_APPROVAL',itemId:'todo'});
    const native = await prepareNativeFilesReview(f.store,f.id,'todo');
    assert.equal(native.executionGranted,false);
    assert.equal(native.review.proposalProvenance.proposalRef,ref);
    assert.equal(native.review.hostHandoffObservation,'NOT_ESTABLISHED_BY_REVIEW');
    await assert.rejects(acceptNativeFilesReview(f.store,native.reviewRef,{trust:'wrong',acknowledgeUnisolated:true}),/consent/);
    approveTask(f.store,f.id,{actor:'test',workflowHash:run.contractHash,expiresAt:Date.now()+60000});
    await f.call('fault',{itemId:'todo',fault:'expire-fileset'});
    await assert.rejects(materializeTask(f.store,f.id,'todo'),/expired/);
    await f.call('fault',{itemId:'todo',fault:'revoke-fileset'});
    await assert.rejects(materializeTask(f.store,f.id,'todo'),/absent/);
    const fresh = await prepareNativeFilesReview(f.store,f.id,'todo');
    const applied = await acceptNativeFilesReview(f.store,fresh.reviewRef,{trust:fresh.reviewHash,acknowledgeUnisolated:true});
    assert.ok(applied);
    assert.equal((await acceptNativeFilesReview(f.store,fresh.reviewRef,{trust:fresh.reviewHash,acknowledgeUnisolated:true})).status,'RECORDED_NO_REPLAY');
    await assert.rejects(materializeTask(f.store,f.id,'todo'),/terminal/);
    const after = await f.call('recover');
    assert.equal(after.coordination.pendingHandoffs[0].status,'PREPARED');
    assert.deepEqual(after.budget,before.budget); assert.equal(after.complete,false);
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,ref),/revision/);
  } finally {f.store.close();}
});

test('supervised intake rejects stale revision, packet, hash, size, scope, provenance and candidate without writes', async () => {
  const f=await setup();
  try {
    const {proposal,ref}=await directProposal(f), events=f.store.events(f.id);
    const mutations=[p=>p.contractRevision--,p=>p.taskRevision--,p=>p.taskId='other',p=>p.packetRef='0'.repeat(64),
      p=>p.candidateHash='0'.repeat(64),p=>p.files[0].sha256='0'.repeat(64),p=>p.files[0].bytes++,
      p=>p.files[0].path='../escape.mjs',p=>p.files[0].path='src/normalize-title.mjs',
      p=>p.files[0].baseSha256='0'.repeat(64),p=>p.authority='HOST_RECEIPT_OBSERVED',p=>p.executionGranted=true,
      p=>p.inputRef=f.store.artifact({...f.store.readArtifact(p.inputRef),taskRevision:1})];
    for(const mutate of mutations){const p=structuredClone(proposal);mutate(p);await assert.rejects(reviewSupervisedProposal(f.store,f.id,f.store.artifact(p)));}
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,'0'.repeat(64)));
    assert.deepEqual(f.store.events(f.id),events);
    await writeFile(path.join(f.repo,'test/create-todo.test.mjs'),'// drift\n');
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,ref),/RECONCILE|candidate/);
  } finally {f.store.close();}
});

test('supervised intake requires satisfied dependencies and rejects a pending proposal dispatch', async () => {
  const f=await setup({independent:false});
  try {
    const {ref}=await directProposal(f);
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,ref),/Eligible/);
    f.store.event(f.id,'HOST_PROPOSALS_DISPATCH_DECLARED',{batchRef:'synthetic',batchHash:'pending'});
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,ref),/RECONCILE/);
    assert.equal((await f.call('recover')).status,'RECONCILE');
  } finally {f.store.close();}
});

test('supervised intake retains RECONCILE for uncertain dispatch and leases; unrelated work stays eligible', async () => {
  const f=await setup();
  try {
    const {ref,h}=await directProposal(f);
    f.store.create({id:'active-supervised-test',taskId:f.id,state:'READY'});
    f.store.db.prepare('UPDATE runs SET owner=?,leaseUntil=? WHERE id=?').run('worker',Date.now()+60000,'active-supervised-test');
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,ref),/RECONCILE/);
    f.store.db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0 WHERE id=?').run('active-supervised-test');
    await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{throw Error('synthetic interrupted dispatch');});
    await assert.rejects(reviewSupervisedProposal(f.store,f.id,ref),/packet mismatch/);
    const recovered=await f.call('recover'); assert.equal(recovered.status,'RECONCILE');
    assert.equal(recovered.coordination.pendingHandoffs[0].status,'DELIVERY_UNCONFIRMED');
    assert.equal((await continuationSnapshot(f.store,f.id)).next.itemId,'normalize');
  } finally {f.store.close();}
});

async function setup(options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-worklog-'));
  const f = await prepare(root, { localExisting: true, acceptanceMode: 'LOCAL_ONLY', independent: true, ...options });
  f.store = new Store(f.state);
  f.call = async (action, extra = {}) => {
    const r = await command(process.execPath, ['test/fixtures/recovery-worker.mjs', JSON.stringify({ ...f, store: undefined, action, ...extra })], { timeoutMs: 30000 });
    assert.equal(r.exitCode, 0, r.stdout + r.stderr); return JSON.parse(r.stdout);
  };
  return f;
}
function assign(f, itemId, agentId = itemId + '-agent') {
  return assignWorkItem(f.store, f.id, { revision: task(f.store, f.id).revision, itemId, agentId, reason: 'Own scoped proposal' });
}
function handoff(f, itemId) {
  return prepareAgentHandoff(f.store, f.id, { revision: task(f.store, f.id).revision, itemId, reason: 'Review current assigned contract' });
}
test('directive -> revision -> supervised proposal (not Host ACK) -> process recovery -> once-only work', async () => {
  const f = await setup();
  try {
    assign(f, 'normalize'); assign(f, 'todo');
    await f.call('propose', { itemId: 'normalize' }).then(p => f.call('approve', { filesetHash: p.approvalRequest.filesetHash }));
    await f.call('materialize', { itemId: 'normalize' });
    const decision = await f.call('issue', { itemId: 'verify-normalize' });
    const firstEvidence = await f.call('execute', { itemId: 'verify-normalize', decision });
    const before = await recoverObjective(f.store, f.id);
    const current = task(f.store, f.id), draft = structuredClone(f.store.readArtifact(current.planRef).draft);
    recordDirective(f.store, f.id, { directiveId: 'new-todo', revision: current.revision,
      text: 'Todo results must have distinct identity', reason: 'User clarified independent objects' });
    assert.equal((await continuationSnapshot(f.store, f.id)).reason, 'DIRECTIVE_REVIEW_REQUIRED');
    draft.criteria.find(c => c.id === 'todo').description += '; independent object identity required';
    const review = await reconcileDirective(f.store, f.id, 'new-todo', { revision: current.revision, draft });
    assert.deepEqual(review.impact.agents, ['todo-agent']);
    assert.deepEqual(review.impact.affected, ['todo', 'verify-integrated']);
    await assert.rejects(acceptContractRevision(f.store, review.reviewRef, { trust: 'fake', acknowledgeUnisolated: true }));
    await acceptContractRevision(f.store, review.reviewRef, { trust: review.reviewHash, acknowledgeUnisolated: true });
    const log = coordinationLog(f.store, f.id);
    assert.equal(log.directives[0].status, 'APPLIED');
    assert.equal(log.handoffs.length, 1); assert.equal(log.handoffs[0].agentId, 'todo-agent');
    assert.throws(() => requireCoordinatedWorkItem(f.store, f.id, 'todo'), /HANDOFF/);
    assert.doesNotThrow(() => requireCoordinatedWorkItem(f.store, f.id, 'normalize'));
    const restarted = await f.call('recover');
    assert.equal(restarted.status, 'HUMAN_HANDOFF');
    assert.equal(restarted.coordination.pendingHandoffs[0].status, 'PREPARED');
    assert.equal(restarted.budget.usedAttempts, before.budget.usedAttempts);
    assert.equal(restarted.reservations[0].evidenceRef, firstEvidence.evidenceRef);
    assert.equal(restarted.contextCompaction, 'NOT_VERIFIED');
    const direct = await proposalForHandoff(f, log.handoffs[0]);
    const reviewed = await reviewSupervisedProposal(f.store, f.id, direct.ref);
    const proposal = await submitBootstrapFiles(f.store, f.id, reviewed.input, {supervisedProposalRef:direct.ref});
    assert.equal((await f.call('recover')).status, 'RECOVERED');
    await f.call('approve', { filesetHash: proposal.approvalRequest.filesetHash });
    await f.call('materialize', { itemId: 'todo' });
    const lastDecision = await f.call('issue', { itemId: 'verify-integrated' });
    const evidence = await f.call('execute', { itemId: 'verify-integrated', decision: lastDecision });
    await f.call('execute', { itemId: 'verify-integrated', decision: lastDecision });
    const final = await f.call('recover');
    assert.equal(final.complete, true); assert.equal(final.budget.usedAttempts, 2);
    assert.equal(final.reservations.at(-1).evidenceRef, evidence.evidenceRef);
    assert.equal(final.protectedVerification, 'UNSATISFIED');
    assert.equal(coordinationLog(f.store,f.id).handoffs[0].status,'PREPARED');
    assert.throws(()=>handoff(f,'todo'),/Pending/);
  } finally { f.store.close(); }
});

// Historical fixtures reproduce the old boolean-based seam, not independent evidence.
function legacyNonDelivery(f,h) {
  const receipt={kind:'AgentHandoffObservation',handoffId:h.handoffId,packetRef:h.packetRef,
    status:'UNDELIVERED',authority:'HOST_TRANSPORT_OBSERVED',
    details:{agentId:h.agentId,packetRef:h.packetRef,messageId:'legacy-claim',delivered:false}};
  const receiptRef=f.store.artifact(receipt);
  f.store.event(f.id,'AGENT_HANDOFF_OBSERVED',{handoffId:h.handoffId,receiptRef,status:'UNDELIVERED',authority:'HOST_TRANSPORT_OBSERVED'});
  return receiptRef;
}

for(const revised of [false,true]) test(`handoff trust: legacy nondelivery cannot close or prepare, revised=${revised}`,async t=>{
  const f=await setup();t.after(()=>f.store.close());
  const p=await f.call('propose',{itemId:'normalize'});
  await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});
  await f.call('materialize',{itemId:'normalize'});
  const decision=await f.call('issue',{itemId:'verify-normalize'});
  await f.call('execute',{itemId:'verify-normalize',decision});
  assign(f,'todo');const h=handoff(f,'todo');let calls=0;
  await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{calls++;throw Error('interrupted');});
  const receiptRef=legacyNonDelivery(f,h),before=await f.call('recover');
  const preserved=()=>hash(['bootstrap_decisions','bootstrap_reservations','workflow_approvals','workflow_attempts']
    .map(table=>f.store.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()));
  const priorRecords=preserved();
  assert.equal(before.status,'HUMAN_HANDOFF');assert.throws(()=>handoff(f,'todo'),/Pending/);
  if(revised) {
    const current=task(f.store,f.id),draft=structuredClone(f.store.readArtifact(current.planRef).draft);
    draft.criteria.find(c=>c.id==='todo').description+='; explicit identity';
    recordDirective(f.store,f.id,{directiveId:'after-failure',revision:current.revision,text:'Clarify Todo',reason:'User instruction'});
    const review=await reconcileDirective(f.store,f.id,'after-failure',{revision:current.revision,draft});
    await acceptContractRevision(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
    assert.equal(task(f.store,f.id).contractRevision,2);
    const deferred=f.store.events(f.id).filter(e=>e.type==='AGENT_HANDOFF_PREPARATION_DEFERRED');
    assert.equal(deferred.length,1);assert.deepEqual(deferred[0].body.handoffIds,[h.handoffId]);
    assert.equal(deferred[0].body.contractRevision,2);assert.equal(deferred[0].body.executionGranted,false);
  }
  const file=path.join(f.root,'close.json');
  await writeFile(file,JSON.stringify({revision:task(f.store,f.id).revision,handoffId:h.handoffId,reason:'Request closure'}));
  const closed=await productCli(['handoff-close',f.id,file],f.state);
  assert.equal(closed.exitCode,1);assert.match(JSON.stringify(closed),/HOST_ADAPTER_UNAVAILABLE/);
  assert.throws(()=>handoff(f,'todo'),/Pending/);
  assert.throws(()=>assign(f,'todo','replacement-agent'),/Reconcile/);
  await assert.rejects(deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{calls++;}),/reconcile/);
  assert.throws(()=>acknowledgeAgentHandoff(f.store,f.id,h.handoffId,{}, {observed:true}),/Unmatched/);
  const after=await f.call('recover'),historical=after.coordination.pendingHandoffs[0];
  assert.equal(after.status,'HUMAN_HANDOFF');assert.equal(after.complete,false);
  assert.equal(after.coordination.handoffs.length,1);assert.equal(historical.status,'UNDELIVERED');
  assert.equal(historical.resolved,false);assert.equal(historical.closure,undefined);
  assert.equal(historical.observationBlocker,'HOST_ADAPTER_UNAVAILABLE');
  assert.equal(historical.observations.at(-1).receiptRef,receiptRef);
  assert.equal(after.executionGranted,false);assert.equal(after.modelInvocationGranted,false);
  assert.deepEqual(after.budget,before.budget);assert.deepEqual(after.reservations,before.reservations);
  assert.equal(preserved(),priorRecords);assert.equal(calls,1);
  assert.equal(f.store.events(f.id).some(e=>e.type==='AGENT_HANDOFF_CLOSED'),false);
});

for(const delivered of [false,true]) test(`handoff trust: embedding ${delivered} and observed=true cannot authenticate delivery`,async t=>{
  const f=await setup();t.after(()=>f.store.close());assign(f,'todo');const h=handoff(f,'todo');let calls=0;
  const receipt={agentId:h.agentId,packetRef:h.packetRef,messageId:'caller-message',delivered,contractRevision:h.contractRevision};
  const result=await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{calls++;return {...receipt,authority:'HOST_TRANSPORT_OBSERVED',observed:true};});
  assert.equal(result.status,'DELIVERY_UNCONFIRMED');assert.equal(result.authority,'EMBEDDING_REPORTED_ONLY');
  const before=hash(f.store.events(f.id));
  for(const change of [{},{agentId:'other-agent'},{packetRef:'0'.repeat(64)}])
    assert.throws(()=>reconcileAgentHandoff(f.store,f.id,h.handoffId,{...receipt,...change},{observed:true}),/HOST_ADAPTER_UNAVAILABLE|Unmatched/);
  assert.equal(hash(f.store.events(f.id)),before);
  assert.throws(()=>acknowledgeAgentHandoff(f.store,f.id,h.handoffId,receipt,{observed:true}),/Unmatched/);
  await assert.rejects(deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{calls++;}),/reconcile/);
  assert.throws(()=>handoff(f,'todo'),/Pending/);
  const file=path.join(f.root,'close.json');
  await writeFile(file,JSON.stringify({revision:task(f.store,f.id).revision,handoffId:h.handoffId,reason:'Caller failure claim'}));
  assert.equal((await productCli(['handoff-close',f.id,file],f.state)).exitCode,1);
  const after=await f.call('recover');assert.equal(after.status,'RECONCILE');assert.equal(calls,1);
  assert.equal(after.coordination.pendingHandoffs[0].status,'DELIVERY_UNCONFIRMED');
  assert.equal(after.coordination.hostObservation,'HOST_ADAPTER_UNAVAILABLE');
  assert.equal(after.executionGranted,false);assert.equal(after.modelInvocationGranted,false);
  assert.equal(f.store.events(f.id).some(e=>e.body.authority==='HOST_TRANSPORT_OBSERVED'),false);
});

test('handoff trust: revision during uncertain dispatch defers preparation; late caller false stays unresolved',async t=>{
  const f=await setup();t.after(()=>f.store.close());assign(f,'todo');const h=handoff(f,'todo');let calls=0;
  const current=task(f.store,f.id),draft=structuredClone(f.store.readArtifact(current.planRef).draft);
  draft.criteria.find(c=>c.id==='todo').description+='; explicit identity';
  recordDirective(f.store,f.id,{directiveId:'inflight',revision:current.revision,text:'Clarify Todo',reason:'User instruction'});
  const review=await reconcileDirective(f.store,f.id,'inflight',{revision:current.revision,draft});
  await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{
    calls++;await acceptContractRevision(f.store,review.reviewRef,{trust:review.reviewHash,acknowledgeUnisolated:true});
    return {agentId:h.agentId,packetRef:h.packetRef,messageId:'missing-outcome'};
  });
  assert.equal(task(f.store,f.id).contractRevision,2);
  assert.equal(coordinationLog(f.store,f.id).handoffs.length,1);
  assert.throws(()=>handoff(f,'todo'),/Pending/);
  assert.throws(()=>reconcileAgentHandoff(f.store,f.id,h.handoffId,
    {agentId:h.agentId,packetRef:h.packetRef,messageId:'late-false',delivered:false},{observed:true}),/HOST_ADAPTER_UNAVAILABLE|Unmatched/);
  await assert.rejects(deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{calls++;}),/reconcile/);
  const after=await f.call('recover');assert.equal(after.status,'RECONCILE');assert.equal(calls,1);
  assert.equal(after.coordination.pendingHandoffs[0].handoffId,h.handoffId);
});

test('handoff trust: legacy closure is preserved but cannot authorize fresh preparation',async t=>{
  const f=await setup();t.after(()=>f.store.close());assign(f,'todo');const h=handoff(f,'todo');
  await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{throw Error('interrupted');});
  const receiptRef=legacyNonDelivery(f,h);
  f.store.event(f.id,'AGENT_HANDOFF_CLOSED',{handoffId:h.handoffId,receiptRef,revision:task(f.store,f.id).revision,reason:'Legacy closure'});
  const after=await f.call('recover');
  assert.equal(after.status,'HUMAN_HANDOFF');assert.equal(after.coordination.pendingHandoffs.length,1);
  assert.ok(after.coordination.handoffs[0].closure);
  assert.throws(()=>handoff(f,'todo'),/Pending/);
  assert.throws(()=>acknowledgeAgentHandoff(f.store,f.id,h.handoffId,{}, {observed:true}),/closed|Unmatched/);
});

test('handoff trust: historical DELIVERED and ACKNOWLEDGED labels cannot resolve coordination',async t=>{
  const f=await setup();t.after(()=>f.store.close());assign(f,'todo');const h=handoff(f,'todo');
  await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{throw Error('interrupted');});
  for(const status of ['DELIVERED','ACKNOWLEDGED']) {
    const authority=status==='DELIVERED'?'HOST_TRANSPORT_OBSERVED':'HOST_RECEIPT_OBSERVED';
    const details={agentId:h.agentId,packetRef:h.packetRef,contractRevision:h.contractRevision,messageId:'legacy',delivered:true};
    const receiptRef=f.store.artifact({kind:'AgentHandoffObservation',handoffId:h.handoffId,packetRef:h.packetRef,status,authority,details});
    f.store.event(f.id,'AGENT_HANDOFF_OBSERVED',{handoffId:h.handoffId,receiptRef,status,authority});
    if(status==='DELIVERED')assert.throws(()=>acknowledgeAgentHandoff(f.store,f.id,h.handoffId,details,{observed:true}),/HOST_ADAPTER_UNAVAILABLE/);
    const log=coordinationLog(f.store,f.id);
    assert.equal(log.pendingHandoffs[0].status,status);assert.equal(log.pendingHandoffs[0].resolved,false);
    assert.throws(()=>handoff(f,'todo'),/Pending/);
    assert.throws(()=>requireCoordinatedWorkItem(f.store,f.id,'todo'),/AGENT_HANDOFF_UNCONFIRMED/);
  }
  assert.equal((await f.call('recover')).status,'HUMAN_HANDOFF');
});

test('undelivered handoff: provider-labelled false observation is not closure evidence', async t=>{
  const f=await setup();t.after(()=>f.store.close());assign(f,'todo');const h=handoff(f,'todo');
  await deliverAgentHandoff(f.store,f.id,h.handoffId,async()=>{throw Error('synthetic lost transport');});
  const file=path.join(f.root,'forged-close.json');
  await writeFile(file,JSON.stringify({revision:task(f.store,f.id).revision,handoffId:h.handoffId,reason:'Caller claim',delivered:false}));
  assert.equal((await productCli(['handoff-close',f.id,file],f.state)).exitCode,1);
  const receiptRef=f.store.artifact({kind:'AgentHandoffObservation',handoffId:h.handoffId,packetRef:h.packetRef,
    status:'UNDELIVERED',authority:'PROVIDER_REPORTED_ONLY',details:{agentId:h.agentId,packetRef:h.packetRef,messageId:'forged',delivered:false}});
  f.store.event(f.id,'AGENT_HANDOFF_OBSERVED',{handoffId:h.handoffId,receiptRef,status:'UNDELIVERED',authority:'PROVIDER_REPORTED_ONLY'});
  assert.throws(()=>coordinationLog(f.store,f.id),/Confirmed Host/);
  await writeFile(file,JSON.stringify({revision:task(f.store,f.id).revision,handoffId:h.handoffId,reason:'Attempt closure'}));
  assert.equal((await productCli(['handoff-close',f.id,file],f.state)).exitCode,1);
  assert.equal(f.store.events(f.id).some(e=>e.type==='AGENT_HANDOFF_CLOSED'),false);
  const after=await f.call('recover');assert.equal(after.complete,false);assert.notEqual(after.status,'RECOVERED');
});

test('preparation is not delivery; crash/unknown transport survives restart without replay', async () => {
  const f = await setup();
  try {
    assign(f, 'normalize'); const h = handoff(f, 'normalize');
    assert.equal(coordinationLog(f.store, f.id).handoffs[0].status, 'PREPARED');
    assert.throws(() => acknowledgeAgentHandoff(f.store, f.id, h.handoffId, {}, { observed: true }), /Unmatched/);
    let calls = 0;
    const r = await deliverAgentHandoff(f.store, f.id, h.handoffId, async () => { calls++; throw Error('Host session ended'); });
    assert.equal(r.status, 'DELIVERY_UNCONFIRMED');
    await assert.rejects(deliverAgentHandoff(f.store, f.id, h.handoffId, async () => { calls++; }), /reconcile/);
    assert.equal(calls, 1);
    assert.equal((await f.call('recover')).coordination.pendingHandoffs[0].status, 'DELIVERY_UNCONFIRMED');
    assert.equal((await continuationSnapshot(f.store, f.id)).next.itemId, 'todo');
    assert.throws(()=>reconcileAgentHandoff(f.store, f.id, h.handoffId, { agentId: h.agentId, packetRef: h.packetRef,
      messageId: 'observed-after-restart', delivered: true }, { observed: true }),/HOST_ADAPTER_UNAVAILABLE/);
    assert.throws(()=>acknowledgeAgentHandoff(f.store, f.id, h.handoffId, { agentId: h.agentId, packetRef: h.packetRef,
      contractRevision: h.contractRevision, messageId: 'receipt-after-restart' }, { observed: true }),/Unmatched/);
    assert.equal(coordinationLog(f.store, f.id).pendingHandoffs.length, 1);
    assert.equal((await f.call('recover')).status,'RECONCILE');
    assert.equal(calls, 1);
  } finally { f.store.close(); }
});

test('stale contract receipt is refused and never applied as current acknowledgment', async () => {
  const f = await setup();
  try {
    assign(f, 'todo'); const h = handoff(f, 'todo');
    const current = task(f.store, f.id), draft = structuredClone(f.store.readArtifact(current.planRef).draft);
    recordDirective(f.store, f.id, { directiveId: 'change', revision: current.revision, text: 'Clarify Todo', reason: 'New requirement' });
    draft.criteria.find(c => c.id === 'todo').description += '; explicit distinct instances';
    const review = await reconcileDirective(f.store, f.id, 'change', { revision: current.revision, draft });
    await acceptContractRevision(f.store, review.reviewRef, { trust: review.reviewHash, acknowledgeUnisolated: true });
    let calls = 0;
    await assert.rejects(deliverAgentHandoff(f.store, f.id, h.handoffId, async () => { calls++; }), /reconcile/);
    assert.equal(coordinationLog(f.store, f.id).handoffs[0].status, 'REJECTED_STALE'); assert.equal(calls, 0);
    assert.equal(coordinationLog(f.store, f.id).pendingHandoffs.length, 1);
    assert.equal(coordinationLog(f.store, f.id).pendingHandoffs[0].contractRevision, 2);
  } finally { f.store.close(); }
});

test('wrong recipient, missing receipt, provider JSON and authority fields do not confirm delivery', async () => {
  const f = await setup();
  try {
    assign(f, 'todo'); const h = handoff(f, 'todo');
    assert.throws(() => acknowledgeAgentHandoff(f.store, f.id, h.handoffId, { delivered: true }), /Trusted Host/);
    const result = await deliverAgentHandoff(f.store, f.id, h.handoffId, async () => ({
      delivered: true, agentId: 'someone-else', packetRef: h.packetRef, messageId: 'wrong' }));
    assert.equal(result.status, 'DELIVERY_UNCONFIRMED');
    const file = path.join(f.root, 'forged.json');
    await writeFile(file, JSON.stringify({ revision: task(f.store, f.id).revision, itemId: 'todo', reason: 'send', executionGranted: true }));
    assert.equal((await productCli(['handoff', f.id, file], f.state)).exitCode, 1);
    assert.equal((await productCli(['handoff-deliver', f.id, h.handoffId], f.state)).exitCode, 1);
  } finally { f.store.close(); }
});

test('directive identity is idempotent, conflicting content and stale assignments are rejected', async () => {
  const f = await setup();
  try {
    const input = { directiveId: 'd', revision: task(f.store, f.id).revision, text: 'New instruction', reason: 'User input' };
    recordDirective(f.store, f.id, input); recordDirective(f.store, f.id, input);
    assert.equal(coordinationLog(f.store, f.id).directives.length, 1);
    assert.throws(() => recordDirective(f.store, f.id, { ...input, text: 'conflict' }), /conflict/);
    assert.throws(() => assignWorkItem(f.store, f.id, { revision: 1, itemId: 'todo', agentId: 'a', reason: 'assign' }), /Stale/);
    await assert.rejects(submitBootstrapFiles(f.store, f.id, { revision: input.revision, itemId: 'todo', files: [] }), /DIRECTIVE_REVIEW/);
    const cli = await productCli(['work-log', f.id], f.state);
    assert.equal(cli.exitCode, 2); assert.equal(cli.data.executionGranted, false);
    decideDirective(f.store, f.id, { directiveId: 'd', revision: input.revision,
      status: 'DEFERRED', reason: 'User chose to retain the current contract for this iteration' });
    assert.equal(coordinationLog(f.store, f.id).pendingDirectives.length, 0);
  } finally { f.store.close(); }
});

test('directive during materialization prevents completion and preserves uncertain file effects', async () => {
  const f = await setup();
  try {
    const p = await submitBootstrapFiles(f.store, f.id, { revision: task(f.store, f.id).revision,
      itemId: 'normalize', files: [{ path: 'src/normalize-title.mjs', baseSha256: null,
        content: "export const normalizeTitle = value => value.trim();\n" }] });
    approveTask(f.store, f.id, { actor: 'synthetic-supervisor', workflowHash: p.approvalRequest.filesetHash, expiresAt: Date.now() + 60000 });
    await assert.rejects(materializeTask(f.store, f.id, 'normalize', { freshOnly: true, hooks: {
      beforeCommit() { recordDirective(f.store, f.id, { directiveId: 'during-write', revision: task(f.store, f.id).revision,
        text: 'Stop and reassess normalization', reason: 'New user instruction during effect' }); }
    } }), /DIRECTIVE_REVIEW/);
    const run = f.store.get(p.approvalRequest.runId);
    assert.equal(run.state, 'MATERIALIZING'); assert.ok(run.results['src/normalize-title.mjs']);
    const resumed = await f.call('recover');
    assert.equal(resumed.status, 'RECONCILE'); assert.equal(resumed.next, null);
    assert.equal(resumed.budget.usedAttempts, 0);
    await assert.rejects(materializeTask(f.store, f.id, 'normalize', { freshOnly: true }), /DIRECTIVE_REVIEW/);
    assert.equal(f.store.get(run.id).materializationRef, undefined);
  } finally { f.store.close(); }
});

test('directive after reservation prevents spawn and consumes no second Attempt on replay', async () => {
  const f = await setup();
  try {
    const proposal = await f.call('propose', { itemId: 'normalize' });
    await f.call('approve', { filesetHash: proposal.approvalRequest.filesetHash });
    await f.call('materialize', { itemId: 'normalize' });
    const decision = await f.call('issue', { itemId: 'verify-normalize' });
    const request = { executable: process.execPath, args: ['--test','--test-reporter=tap','test/normalize-title.test.mjs'],
      directory: f.repo, timeoutMs: 10000 };
    const outcome = await executeOfflineDecision(f.store, f.id, 'verify-normalize', request, { ...decision, hooks: {
      reserved() { recordDirective(f.store, f.id, { directiveId: 'during-reservation', revision: task(f.store, f.id).revision,
        text: 'Reassess before verification', reason: 'User instruction at reservation boundary' }); }
    } });
    assert.equal(outcome.reservation.state, 'HUMAN_HANDOFF');
    assert.equal(f.store.events(f.id).filter(e => e.type === 'BOOTSTRAP_EXECUTION_STARTED').length, 0);
    await executeOfflineDecision(f.store, f.id, 'verify-normalize', request, decision);
    const resumed = await f.call('recover');
    assert.equal(resumed.status, 'RECONCILE'); assert.equal(resumed.budget.usedAttempts, 1);
    assert.equal(resumed.budget.reservedTimeMs, 10000); assert.equal(resumed.next, null);
  } finally { f.store.close(); }
});

test('legacy direct Local verification rechecks a directive arriving during authorization', async () => {
  const f = await setup();
  try {
    const p = await f.call('propose', { itemId: 'normalize' });
    await f.call('approve', { filesetHash: p.approvalRequest.filesetHash });
    await f.call('materialize', { itemId: 'normalize' });
    const request = { executable: process.execPath, args: ['--test','--test-reporter=tap','test/normalize-title.test.mjs'],
      directory: f.repo, timeoutMs: 10000 };
    const inspected = await verifyTask(f.store, f.id, 'verify-normalize', request);
    const backend = localBackend();
    await assert.rejects(verifyTask(f.store, f.id, 'verify-normalize', request, {
      trust: inspected.commandHash, acknowledgeUnisolated: true, backend: { ...backend,
        async authorize(...args) {
          const token = await backend.authorize(...args);
          recordDirective(f.store, f.id, { directiveId: 'direct-verification', revision: task(f.store, f.id).revision,
            text: 'Reassess verification', reason: 'Instruction during asynchronous authorization' });
          return token;
        }
      }
    }), /DIRECTIVE_REVIEW/);
    assert.equal(task(f.store, f.id).bootstrap.verifications?.['verify-normalize'], undefined);
    assert.equal((await f.call('recover')).complete, false);
  } finally { f.store.close(); }
});
