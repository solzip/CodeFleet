import { lstatSync } from 'node:fs';
import path from 'node:path';
import { execute } from '../alpha/controller.mjs';
import { issueRequests, submitResponse, stagedExecution } from './exchange.mjs';
import { runReport } from '../product/report.mjs';
import { digest } from './operator.mjs';
import { HOST_METHODS, envelope } from './ipc-client.mjs';

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw Error('Unexpected service fields');
}
// Adapter only: execution, evidence, Judge and state transitions remain owned by
// the existing controller. No injected verifier, shell command or provider API.
export function createHarnessService(store, guard, config, operatorRequest) {
  // Fixed repositories and all ancestors must be outside Agent write control.
  for (const id of Object.keys(config.catalog)) {
    let selected = path.resolve(store.get(id).repo);
    const leaf = lstatSync(selected);
    if (leaf.uid !== config.operatorUid || (leaf.mode & 0o077)) throw Error('Private trusted repository required');
    while (true) {
      const stat = lstatSync(selected);
      if (!stat.isDirectory() || stat.isSymbolicLink() || ![0,config.operatorUid].includes(stat.uid) || (stat.mode & 0o022)) throw Error('Unsafe repository ancestor');
      const parent = path.dirname(selected); if (parent === selected) break; selected = parent;
    }
  }
  const jobs = new Map();
  store.db.exec(`CREATE TABLE IF NOT EXISTS host_ipc_requests (
    uid INTEGER NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, response TEXT,
    PRIMARY KEY(uid,id));`);
  async function dispatch(method, p) {
    const fields = method === 'propose' ? ['runId','goal'] : method === 'submit' ? ['runId','host','response'] : method === 'requests' || ['execute','resume'].includes(method) ? ['runId','host'] : method === 'approval-request' ? ['runId','itemId'] : ['runId'];
    exact(p, fields);
    if (typeof p.runId !== 'string' || !Object.hasOwn(config.catalog,p.runId)) throw Error('Run outside trusted catalog');
    const run = store.get(p.runId);
    if (['status','result','verify'].includes(method)) return runReport(store, run.id); // rehashes stored evidence and candidate tree
    if (['pause','cancel'].includes(method)) { store.control(run.id, method); return { status: method.toUpperCase(), complete: false }; }
    if (method !== 'resume') guard.check(run);
    if (method === 'plan') return { runId: run.id, revision: run.revision, contract: run.contract, contractHash: run.contractHash, authority: 'TRUSTED_FIXED_SCOPE' };
    if (method === 'propose') {
      if (typeof p.goal !== 'string' || !p.goal.trim() || p.goal.length > 4000 || p.goal.includes('\0')) throw Error('Invalid goal');
      const ref = store.artifact({ runId: run.id, goal: p.goal, authority: 'PROVIDER_REPORTED_ONLY', executable: false });
      store.event(run.id,'HOST_INTENT_PROPOSED',{ ref });
      return { proposalRef: ref, runId: run.id, authority: 'REQUEST_ONLY', scopeChange: 'REQUIRES_TRUSTED_PROVISIONING' };
    }
    if (method === 'approval-request') {
      if (!config.catalog[run.id].riskyItems.includes(p.itemId)) return {status:'NOT_REQUIRED',authority:'CONFINED_AUTOMATIC_POLICY'};
      return operatorRequest(p);
    }
    if (method === 'requests') return issueRequests(store,run.id,p.host);
    if (method === 'submit') {
      const row = store.db.prepare('SELECT runId FROM host_requests WHERE id=?').get(p.response?.requestId);
      if (row?.runId !== run.id) throw Error('Response run mismatch');
      return submitResponse(store,p.host,p.response);
    }
    if (['execute','resume'].includes(method)) {
      if (config.catalog[run.id].riskyItems.length) throw Error('Human authorization input not attested; risky Harness dispatch BLOCKED');
      if (jobs.has(run.id)) throw Error('Execution already active');
      if (run.control === 'cancel') throw Error('Cancelled run');
      const hostExecution = stagedExecution(store,run.id,p.host);
      // resume is fenced inside the existing controller; staged input validation
      // there runs after claim has restored control. No stored Lease is reused.
      if (method !== 'resume') await hostExecution.select(run);
      const job = execute(store,run.id,{hostExecution},{resume:method==='resume'});
      jobs.set(run.id,job);
      job.catch(error => store.event(run.id,'HOST_EXECUTION_ERROR',{ reason:error.message })).finally(() => jobs.delete(run.id));
      return { status:'ACCEPTED', runId:run.id, authority:'DISPATCH_ONLY_NOT_VERIFICATION', complete:false };
    }
    throw Error('Unsupported Host operation');
  }
  return {
    async handle(peer,message) {
      exact(message,['version','requestId','method','params']);
      if (peer.uid !== config.agentUid || message.version !== 1 || !HOST_METHODS.includes(message.method)) throw Error('Agent IPC identity or version denied');
      envelope(message.method,message.params,message.requestId);
      const hash = digest(message), prior = store.db.prepare('SELECT * FROM host_ipc_requests WHERE uid=? AND id=?').get(peer.uid,message.requestId);
      if (prior) {
        if (prior.digest !== hash) throw Error('Request ID conflict');
        if (!prior.response) throw Error('Uncertain prior request; reconcile, never replay');
        return {...JSON.parse(prior.response), replay:true};
      }
      // Durable reservation precedes effects. Crash leaves an uncertain request,
      // never an instruction to repeat an action after process restart.
      store.db.prepare('INSERT INTO host_ipc_requests VALUES (?,?,?,NULL)').run(peer.uid,message.requestId,hash);
      let response;
      try { response = {status:'OK', requestId:message.requestId, result:await dispatch(message.method,message.params)}; }
      catch (e) { response = {status:'BLOCKED', requestId:message.requestId, reason:e.message}; }
      if (Buffer.byteLength(JSON.stringify(response)) > 250000) response = {status:'BLOCKED',requestId:message.requestId,reason:'Response exceeds bound; query narrower status'};
      store.db.prepare('UPDATE host_ipc_requests SET response=? WHERE uid=? AND id=?').run(JSON.stringify(response),peer.uid,message.requestId);
      return response;
    },
    async close() { for (const id of jobs.keys()) store.control(id,'pause'); await Promise.allSettled(jobs.values()); }
  };
}
