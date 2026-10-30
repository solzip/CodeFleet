// Synthetic internal fixture only. Each action runs in a separate OS process.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../../src/alpha/store.mjs';
import { prepare } from './development-loop.mjs';
import { task, recordedDigests, submitBootstrapFiles, approveTask, materializeTask, verifyTask } from '../../src/product/tasks.mjs';
import { issueOfflineDecision, executeOfflineDecision, revokeDecision } from '../../src/product/reservations.mjs';
import { recoverObjective } from '../../src/product/recovery.mjs';
import { prepareContractRevision, acceptContractRevision } from '../../src/product/contract-revisions.mjs';
export const sources = {
  normalize: { path: 'src/normalize-title.mjs', content: "export function normalizeTitle(input) { const title=input.trim(); if(!title) throw Error('Blank'); return title; }\n" },
  todo: { path: 'src/create-todo.mjs', content: "import {normalizeTitle} from './normalize-title.mjs'; export const createTodo=input=>({title:normalizeTitle(input),completed:false});\n" }
};
const input = JSON.parse(process.argv[2]); let store;
try {
  if (input.action === 'prepare') { console.log(JSON.stringify(await prepare(input.root,input.options))); }
  else {
    store = new Store(input.state, { readOnly: input.action === 'recover' }); const id = input.id; let result;
    const request = item => ({ executable: process.execPath, args: ['--test', '--test-reporter=tap',
      ...(item === 'verify-integrated' ? store.readArtifact(task(store,id).planRef).draft.plannedTests.map(t=>t.path) : ['test/normalize-title.test.mjs'])], directory: input.repo, timeoutMs: 10000 });
    if (input.action === 'recover') result = await recoverObjective(store, id, input.binding);
    if (input.action === 'revision-review') {
      const current=task(store,id),draft=structuredClone(store.readArtifact(current.planRef).draft);
      if(input.draft)Object.assign(draft,input.draft);
      else draft.criteria.find(c=>c.id==='todo').description+='; each call returns a distinct object';
      result=await prepareContractRevision(store,id,{revision:current.revision,draft,
        ...(input.additionalAttempts===undefined?{}:{additionalAttempts:input.additionalAttempts})});
    }
    if (input.action === 'revision-accept') result=await acceptContractRevision(store,input.reviewRef,{trust:input.trust,acknowledgeUnisolated:true});
    if (input.action === 'propose') {
      const current=task(store,id),source={...sources[input.itemId]};
      if(input.content)source.content=input.content;
      if(store.readArtifact(current.planRef).contractKind==='EXISTING_LOCAL')source.baseSha256=recordedDigests(store,current)[source.path]??null;
      result = await submitBootstrapFiles(store, id, { revision: current.revision, itemId: input.itemId, files: [source] });
    }
    if (input.action === 'approve') result = approveTask(store,id,{actor:'offline-recovery-test',workflowHash:input.filesetHash,expiresAt:Date.now()+120000});
    if (input.action === 'materialize') result = await materializeTask(store,id,input.itemId,{freshOnly:true,hooks:input.crash ? { beforeCommit: () => process.exit(89) } : {}});
    if (input.action === 'issue') {
      const q=request(input.itemId), inspected=await verifyTask(store,id,input.itemId,q);
      result=await issueOfflineDecision(store,id,input.itemId,q,{decisionId:randomUUID(),requestId:randomUUID(),actor:'offline-recovery-test',revision:task(store,id).revision,commandHash:inspected.commandHash,acknowledgeUnisolated:true,expiresAt:Date.now()+120000,maxExecutions:1,timeBudgetMs:10000,maxConsecutiveFailures:1});
    }
    if (input.action === 'execute') result=await executeOfflineDecision(store,id,input.itemId,request(input.itemId),{...input.decision,hooks:input.crash ? {[input.crash]:()=>process.exit(88)} : {}});
    if (input.action === 'fault') {
      const current=task(store,id),runId=current.bootstrap.filesets[input.itemId];
      if(input.fault==='expire-fileset')store.db.prepare('UPDATE workflow_approvals SET expires=0 WHERE runId=?').run(runId);
      if(input.fault==='revoke-fileset')store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(runId);
      if(input.fault==='expire-decision')store.db.prepare('UPDATE bootstrap_decisions SET expires=0 WHERE id=?').run(input.decision.decisionId);
      if(input.fault==='revoke-decision')revokeDecision(store,input.decision.decisionId,'offline-recovery-test');
      if(input.fault==='source')await writeFile(path.join(input.repo,'src/normalize-title.mjs'),'export const normalizeTitle = x => x;\n');
      if(input.fault==='revision'){current.revision++;store.db.prepare('UPDATE product_tasks SET revision=?,body=? WHERE id=?').run(current.revision,JSON.stringify(current),id);}
      if(input.fault==='evidence'){const ref=current.bootstrap.verifications['verify-normalize'];await writeFile(path.join(input.state,'artifacts',ref+'.json'),'{}');}
      if(input.fault==='receipt'){const ref=store.get(current.bootstrap.filesets.normalize).materializationRef;await writeFile(path.join(input.state,'artifacts',ref+'.json'),'{}');}
      result={fault:input.fault};
    }
    if (!result) throw Error('Unknown fixture action'); console.log(JSON.stringify(result));
  }
} catch(error) {console.log(JSON.stringify({error:error.message}));process.exitCode=1;} finally {store?.close();}
