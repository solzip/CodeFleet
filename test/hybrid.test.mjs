import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { requireSuccess } from '../src/alpha/process.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { hybridDefinition, definition, fromPlan, nextReady, readyBatch } from '../src/workflow/definition.mjs';
import { createWorkflow, approveWorkflow, reviseWorkflow, attempts, reserve, revokeWorkflow } from '../src/workflow/persistence.mjs';
import { createRegistry } from '../src/providers/registry.mjs';
import { createClaudeAdapter } from '../src/providers/claude.mjs';
import { createCodexAdapter } from '../src/providers/codex.mjs';
import { CAPABILITIES } from '../src/providers/capabilities.mjs';
import { planIntent } from '../src/intent/engine.mjs';

const source = () => ({ schemaVersion: 1, goal: 'Repair arithmetic regressions with protected tests.', files: ['src/a.js', 'src/b.js'], context: ['src/a.js', 'src/b.js'], tests: ['test/a.test.js', 'test/b.test.js'], maxAttempts: 3, timeoutSeconds: 120, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
const item = (id, dependencies = []) => ({ id, dependencies, priority: 0, files: [`src/${id}.js`], tests: [`test/${id}.test.js`], acceptanceCriteria: ['Protected arithmetic regression passes'], resources: [], roles: { Planner: 'planner', Architect: 'architect', Executor: 'executor', Reviewer: 'reviewer' } });
const supported = () => ({ installed: true, identity: { id: 'claude', version: 'fake' }, environment: Object.fromEntries(['filesystem_restriction', 'network_restriction', 'credential_isolation'].map(c => [c, { status: 'SUPPORTED', evidence: 'Fake host fixture only' }])), capabilities: Object.fromEntries(CAPABILITIES.map(c => [c, { status: 'SUPPORTED' }])) });
async function setup(items = [item('a'), item('b', ['a'])]) {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-workflow-')), repo = path.join(root, 'repo');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  for (const n of items.some(n => n.id === 'c') ? ['a', 'b', 'c'] : ['a', 'b']) {
    await writeFile(path.join(repo, `src/${n}.js`), 'module.exports = (a,b) => a+b;');
    await writeFile(path.join(repo, `test/${n}.test.js`), `const test=require('node:test'),assert=require('node:assert/strict');test('${n}',()=>assert.equal(require('../src/${n}.js')(5,2),3));`);
  }
  requireSuccess(await git(repo, ['init']), 'init'); requireSuccess(await git(repo, ['add', '.']), 'add');
  requireSuccess(await git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']), 'fixture commit');
  const base = requireSuccess(await git(repo, ['rev-parse', 'HEAD']), 'base');
  const store = new Store(path.join(root, 'state')), contract = source();
  if (items.some(n => n.id === 'c')) { contract.files.push('src/c.js'); contract.context.push('src/c.js'); contract.tests.push('test/c.test.js'); }
  const graph = hybridDefinition(contract, { workflowId: 'repair', base, items, maxParallel: items.length === 3 ? 3 : 2 });
  const run = await createWorkflow(store, repo, graph, contract, 'workflow');
  const calls = [];
  const adapter = createClaudeAdapter({ runCommand: async (_exe, _args, options) => {
    const request = JSON.parse(options.input); calls.push(request.allowedFiles[0]);
    return { exitCode: 0, interrupted: false, truncated: false, stdout: Buffer.from(JSON.stringify({ structured_output: { summary: 'Fix arithmetic', edits: request.allowedFiles.map(f => ({ path: f, oldText: 'a+b', newText: 'a-b' })) }, total_cost_usd: 0.1 })), stderr: Buffer.alloc(0) };
  } }); adapter.probe = async () => supported();
  const dependencies = { workflowRegistry: createRegistry([adapter]), ready: async () => {}, verify: async ({ directory, tests }) => {
    const passed = (await Promise.all(tests.map(t => readFile(path.join(directory, t.replace('test/', 'src/').replace('.test.js', '.js')), 'utf8')))).filter(s => s.includes('a-b')).length;
    return { authority: 'HARNESS_EXECUTED', tests: tests.length, passed, failed: tests.length - passed, skipped: 0, todo: 0, exitCode: passed === tests.length ? 0 : 1, testNames: tests, interrupted: false, truncated: false };
  } };
  const approve = () => approveWorkflow(store, run.id, { actor: 'human-reviewer', workflowHash: store.get(run.id).contractHash, expiresAt: Date.now() + 60000 });
  return { root, repo, base, store, run, graph, contract, calls, dependencies, approve };
}

import { delegate, sendMessage, messages } from '../src/workflow/collaboration.mjs';

for (const delayed of [false, true]) test('hybrid independent work overlaps, isolates candidates and integrates deterministically' + (delayed ? ' with skewed verifier arrival' : ''), async () => {
  const f = await setup([item('b'), item('a')]);
  let deadline;
  try {
    let active = 0, peak = 0; const dirs = new Set(), verify = f.dependencies.verify;
    const arrivals = new Set(), together = Promise.withResolvers(), first = Promise.withResolvers();
    f.dependencies.verify = async req => {
      const item = req.tests.length === 1 ? req.tests[0] : null;
      if (item && !arrivals.has(item) && delayed && item === 'test/b.test.js') {
        await first.promise;
        await new Promise(resolve => setTimeout(resolve, 75));
      }
      if (!item) assert.equal(active, 0, 'integration must follow both independent children');
      dirs.add(req.directory); active++; peak = Math.max(peak, active);
      try {
        if (item && !arrivals.has(item)) {
          arrivals.add(item);
          first.resolve();
          // Synchronize the observation, not production scheduling. A serial
          // launcher cannot reach the second arrival and must fail this test.
          if (arrivals.size === 1) deadline = setTimeout(() => together.reject(Error('Independent verifier rendezvous timed out')), 10000);
          if (arrivals.size === 2) { clearTimeout(deadline); together.resolve(); }
          await together.promise;
        }
        return await verify(req);
      } finally { active--; }
    };
    f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'COMPLETED', r.reason); assert.equal(peak, 2); assert.equal(dirs.size, 3);
    assert.equal(arrivals.size, 2);
    assert.deepEqual(attempts(f.store, r.id).map(a => a.itemId), ['a', 'b', 'final']);
    assert.equal(Object.keys(f.store.readArtifact(r.acceptedHash).changedFiles).length, 2);
    assert.equal(await readFile(path.join(f.repo, 'src/a.js'), 'utf8'), 'module.exports = (a,b) => a+b;');
  } finally { clearTimeout(deadline); f.store.close(); }
});

test('dependency edges and shared resources serialize; limits and overlap fail closed', async () => {
  const f = await setup();
  try {
    let active = 0, peak = 0; const verify = f.dependencies.verify;
    f.dependencies.verify = async req => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 10)); try { return await verify(req); } finally { active--; } };
    f.approve(); assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'COMPLETED'); assert.equal(peak, 1);
    const build = (items, maxParallel=2) => hybridDefinition(f.contract, { workflowId: 'locks', base: f.base, items, maxParallel });
    const graph = build([{ ...item('a'), resources: ['database'] }, { ...item('b'), resources: ['database'] }]);
    assert.deepEqual(readyBatch(graph, { a: 'READY', b: 'READY' }).map(n => n.id), ['a']);
    assert.throws(() => build([item('a')], 4));
    assert.throws(() => build([item('a'), { ...item('b'), files: ['src/a.js'] }]), /overlapping/);
  } finally { f.store.close(); }
});

test('role messages are durable untrusted proposals, duplicate safe and cannot authorize', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    f.dependencies.collaborate = async channels => {
      assert.equal(channels.Executor.assignment.executionMode, 'PROPOSAL_ONLY');
      assert.equal(channels.Reviewer.assignment.executionMode, 'READ_ONLY_PROPOSAL');
      for (const [role, channel] of Object.entries(channels)) {
        const message = { messageId: channel.assignment.workItemId + role, correlationId: 'conversation', type: role === 'Executor' ? 'RESULT_SUBMITTED' : 'PROPOSAL', payload: { state: 'COMPLETED', grant: 'all' } };
        channel.send(message); channel.send(message);
        assert.throws(() => channel.send({ ...message, payload: {} }), /conflict/);
      }
      assert.ok(channels.Reviewer.read('conversation').some(m => m.role === 'Planner'));
      assert.equal(f.store.get(f.run.id).state, 'RUNNING');
      assert.throws(() => sendMessage(f.store, {}, {}), /delegation/);
    };
    f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'COMPLETED', r.reason);
    assert.equal(messages(f.store, r.id).length, 8);
    assert.ok(messages(f.store, r.id).every(m => m.authority === 'PROVIDER_REPORTED_ONLY'));
    const reopened = new Store(path.join(f.root, 'state'));
    try { assert.equal(messages(reopened, r.id).length, 8); assert.equal(reopened.db.prepare('PRAGMA user_version').get().user_version, 2); } finally { reopened.close(); }
  } finally { f.store.close(); }
});

test('parallel failure preserves unrelated verified success; no final integration', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    const verify = f.dependencies.verify;
    f.dependencies.verify = async req => req.tests.includes('test/a.test.js') ? { authority: 'HARNESS_EXECUTED', tests: 1, passed: 0, failed: 1, skipped: 0, todo: 0, exitCode: 1, testNames: req.tests } : verify(req);
    f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.equal(r.states.b, 'SUCCEEDED'); assert.equal(r.finalRunId, undefined);
    await execute(f.store, r.id, f.dependencies); assert.equal(attempts(f.store, r.id).length, 2);
  } finally { f.store.close(); }
});

test('semantic conflict fails combined verification despite disjoint accepted files', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    const verify = f.dependencies.verify;
    f.dependencies.verify = async req => {
      const e = await verify(req);
      return req.tests.length === 2 ? { ...e, passed: 0, failed: 2, exitCode: 1 } : e;
    };
    f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.equal(r.finalRunId, undefined);
    assert.equal(attempts(f.store, r.id).at(-1).status, 'FAILED');
  } finally { f.store.close(); }
});

test('cancel and approval revocation stop both children without replay', async () => {
  for (const revoke of [false, true]) {
    const f = await setup([item('a'), item('b')]);
    try {
      let started = 0;
      f.dependencies.verify = async req => {
        started++;
        if (started === 2) { if (revoke) revokeWorkflow(f.store, f.run.id, 'operator'); else f.store.control(f.run.id, 'cancel'); }
        for (let i = 0; i < 100 && !req.cancelled(); i++) await new Promise(r => setTimeout(r, 5));
        assert.equal(req.cancelled(), true);
        return { authority: 'HARNESS_EXECUTED', interrupted: true };
      };
      f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
      assert.equal(r.state, revoke ? 'WAITING_HUMAN' : 'CANCELLED'); assert.equal(f.calls.length, 0);
      assert.equal(attempts(f.store, r.id).length, 2);
      await execute(f.store, r.id, f.dependencies); assert.equal(f.calls.length, 0);
    } finally { f.store.close(); }
  }
});

test('reservation duplicates, stale messages and hybrid revision mixing are rejected', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    f.approve(); const owner = f.store.claim(f.run.id), run = f.store.get(f.run.id);
    run.states.a = 'READY'; run.states.b = 'READY';
    const child = reserve(f.store, run, owner, 'a', { ...f.contract, files: item('a').files, tests: item('a').tests, maxAttempts: 1 });
    assert.throws(() => reserve(f.store, run, owner, 'a', child.contract));
    const token = delegate(f.store, run.id, child.id, owner, 'Planner');
    f.store.release(run.id, owner);
    assert.throws(() => sendMessage(f.store, token, { messageId: 'late', correlationId: 'c', type: 'FINDING', payload: {} }), /Stale/);
    const r = await execute(f.store, run.id, f.dependencies);
    assert.equal(r.state, 'RECONCILING'); assert.equal(f.calls.length, 0);
    const graph = hybridDefinition(f.contract, { workflowId: 'repair', workflowVersion: 2, base: f.base, items: [item('a'), item('b')], maxParallel: 2 });
    assert.throws(() => reviseWorkflow(f.store, run.id, 1, graph), /unresolved/);
  } finally { f.store.close(); }
});

test('graph revision compare-and-swap invalidates approval; late revision rejected', async () => {
  const f = await setup([item('a')]);
  try {
    f.approve();
    const graph = hybridDefinition(f.contract, { workflowId: 'repair', workflowVersion: 2, base: f.base, items: [item('a'), item('b')], maxParallel: 2 });
    reviseWorkflow(f.store, f.run.id, 1, graph);
    assert.throws(() => reviseWorkflow(f.store, f.run.id, 1, graph), /revision conflict/);
    assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'WAITING_HUMAN'); assert.equal(f.calls.length, 0);
  } finally { f.store.close(); }
});

test('provider claims and out-of-scope proposals never integrate', async () => {
  for (const claims of [true, false]) {
    const f = await setup([item('a')]);
    try {
      if (claims) { const verify = f.dependencies.verify; f.dependencies.verify = async req => ({ ...await verify(req), authority: 'PROVIDER_REPORTED_ONLY' }); }
      else {
        const adapter = f.dependencies.workflowRegistry.get('claude');
        adapter.execute = async () => ({ kind: 'ProviderExecutionResult', status: 'SUCCESS', cost: 0, proposal: { summary: 'escape', edits: [{ path: 'src/outside.js', oldText: 'a', newText: 'b' }] } });
      }
      f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
      assert.equal(r.state, 'WAITING_HUMAN'); assert.equal(r.finalRunId, undefined);
    } finally { f.store.close(); }
  }
});

test('final tree tampering invalidates workflow completion', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    const finish = f.store.event.bind(f.store);
    let finalDir;
    const verify = f.dependencies.verify;
    f.dependencies.verify = async req => { if (req.tests.length === 2) finalDir = req.directory; return verify(req); };
    f.store.event = (id, type, body) => {
      const result = finish(id, type, body);
      if (type === 'ATTEMPT_RECONCILED' && body.itemId === 'final') {
        // synchronous write at the persisted final-result boundary
        fs.writeFileSync(path.join(finalDir, 'src/a.js'), 'tampered');
      }
      return result;
    };
    f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.match(r.reason, /tree changed/);
  } finally { f.store.close(); }
});

test('hybrid real Docker verifies parallel candidates and final combined tree', { skip: process.env.CODEFLEET_TEST_DOCKER !== '1' }, async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    f.approve(); const { verify, ready, ...dependencies } = f.dependencies;
    const r = await execute(f.store, f.run.id, dependencies);
    assert.equal(r.state, 'COMPLETED', r.reason); assert.equal(f.store.readArtifact(r.evidenceHash).tests, 2);
    assert.deepEqual([...f.calls].sort(), ['src/a.js', 'src/b.js']);
    assert.deepEqual(attempts(f.store, r.id).map(a => a.itemId), ['a', 'b', 'final']);
  } finally { f.store.close(); }
});

test('unverified Codex remains blocked for hybrid scheduling', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    let calls = 0;
    const adapter = createCodexAdapter({ runCommand: async () => { calls++; throw Error('must not launch'); } });
    adapter.probe = async () => ({ ...supported(), identity: { id: 'codex', version: 'fake' }, capabilities: { ...supported().capabilities, proposal_only: { status: 'UNVERIFIED' } } });
    f.dependencies.workflowRegistry = createRegistry([adapter]); f.approve();
    assert.equal((await execute(f.store, f.run.id, f.dependencies)).state, 'WAITING_HUMAN');
    assert.equal(calls, 0); assert.equal(attempts(f.store, f.run.id).length, 0);
  } finally { f.store.close(); }
});

test('message insert and event roll back together', async () => {
  const f = await setup([item('a')]);
  try {
    f.approve(); const owner = f.store.claim(f.run.id), run = f.store.get(f.run.id); run.states.a = 'READY';
    const child = reserve(f.store, run, owner, 'a', { ...f.contract, files: item('a').files, tests: item('a').tests, maxAttempts: 1 });
    const token = delegate(f.store, run.id, child.id, owner, 'Planner');
    f.store.db.exec("CREATE TRIGGER reject_message BEFORE INSERT ON events WHEN NEW.type='AGENT_MESSAGE' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;");
    assert.throws(() => sendMessage(f.store, token, { messageId: 'm', correlationId: 'c', type: 'QUESTION', payload: 'scope?' }), /fixture failure/);
    assert.equal(messages(f.store, run.id).length, 0); f.store.release(run.id, owner);
  } finally { f.store.close(); }
});

test('old coordinator cannot commit late worker results after fencing replacement', async () => {
  const f = await setup([item('a'), item('b')]);
  try {
    let replaced = false; const original = f.dependencies.workflowRegistry.get('claude').execute;
    f.dependencies.workflowRegistry.get('claude').execute = async req => {
      const result = await original(req);
      if (!replaced) {
        replaced = true;
        f.store.db.prepare('UPDATE runs SET leaseUntil=0 WHERE id=?').run(f.run.id);
        const replacement = f.store.claim(f.run.id); f.store.release(f.run.id, replacement);
      }
      return result;
    };
    f.approve(); await assert.rejects(execute(f.store, f.run.id, f.dependencies), /lease|Coordinator/);
    assert.equal(f.store.get(f.run.id).finalRunId, undefined);
    assert.ok(attempts(f.store, f.run.id).every(a => a.status === 'STARTED'));
    const recovered = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(recovered.state, 'RECONCILING');
  } finally { f.store.close(); }
});

test('one local process timeout leaves unrelated verified work intact', async () => {
  const { command } = await import('../src/alpha/process.mjs');
  const f = await setup([item('a'), item('b')]);
  try {
    const original = f.dependencies.workflowRegistry.get('claude').execute;
    f.dependencies.workflowRegistry.get('claude').execute = async req => {
      if (req.contract.files[0] === 'src/a.js') {
        const result = await command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 80 });
        assert.equal(result.interrupted, true); throw Error('Local fake provider timeout');
      }
      return original(req);
    };
    f.approve(); const r = await execute(f.store, f.run.id, f.dependencies);
    assert.equal(r.state, 'WAITING_HUMAN'); assert.equal(r.states.b, 'SUCCEEDED');
  } finally { f.store.close(); }
});

test('real coordinator process exit during parallel work and integration never replays attempts', async () => {
  const { command } = await import('../src/alpha/process.mjs');
  const imports = name => new URL('../src/' + name, import.meta.url).href;
  for (const phase of ['GENERATING', 'VERIFYING']) {
    const f = await setup([item('a'), item('b')]);
    try {
      f.approve();
      const script = [
        'import { Store } from ' + JSON.stringify(imports('alpha/store.mjs')) + ';',
        'import { execute } from ' + JSON.stringify(imports('alpha/controller.mjs')) + ';',
        'import { createRegistry } from ' + JSON.stringify(imports('providers/registry.mjs')) + ';',
        'import { createClaudeAdapter } from ' + JSON.stringify(imports('providers/claude.mjs')) + ';',
        'import { readFile } from "node:fs/promises"; import path from "node:path";',
        'const store = new Store(' + JSON.stringify(path.join(f.root, 'state')) + ');',
        'const save=store.save.bind(store); store.save=(run,owner,type)=>{ save(run,owner,type); if(run.state===' + JSON.stringify(phase) + ' && ' + (phase === 'VERIFYING' ? 'run.workflowItemId==="final"' : 'run.workflowItemId==="a"') + ') process.exit(91); };',
        'const adapter=createClaudeAdapter({runCommand:async(_e,_a,o)=>{ const q=JSON.parse(o.input);return {exitCode:0,stdout:Buffer.from(JSON.stringify({structured_output:{summary:"fix",edits:q.allowedFiles.map(path=>({path,oldText:"a+b",newText:"a-b"}))},total_cost_usd:0.1})),stderr:Buffer.alloc(0)}; }});',
        'adapter.probe=async()=>(' + JSON.stringify(supported()) + ');',
        'await execute(store,"workflow",{workflowRegistry:createRegistry([adapter]),ready:async()=>{},verify:async({directory,tests})=>{ const rows=await Promise.all(tests.map(t=>readFile(path.join(directory,t.replace("test/","src/").replace(".test.js",".js")),"utf8"))); const passed=rows.filter(s=>s.includes("a-b")).length; return {authority:"HARNESS_EXECUTED",tests:tests.length,passed,failed:tests.length-passed,skipped:0,todo:0,exitCode:passed===tests.length?0:1,testNames:tests}; }});'
      ].join(String.fromCharCode(10));
      const result = await command(process.execPath, ['--input-type=module', '-e', script], { timeoutMs: 30000 });
      assert.equal(result.exitCode, 91, result.stderr.toString());
      const prior = attempts(f.store, f.run.id).length;
      const recovered = await execute(f.store, f.run.id, f.dependencies);
      assert.equal(recovered.state, 'RECONCILING', recovered.reason);
      assert.equal(attempts(f.store, f.run.id).length, prior); assert.equal(f.calls.length, 0);
    } finally { f.store.close(); }
  }
});

test('explicit maximum three overlaps; default remains one', async () => {
  const f = await setup([item('a'), item('b'), item('c')]);
  try {
    let active=0, peak=0; const verify=f.dependencies.verify;
    f.dependencies.verify=async req=>{ active++; peak=Math.max(peak,active); await new Promise(r=>setTimeout(r,80)); try{return await verify(req);}finally{active--;} };
    const serial=hybridDefinition(f.contract,{workflowId:'serial',base:f.base,items:f.graph.items});
    assert.equal(serial.maxParallel,1);
    f.approve(); const r=await execute(f.store,f.run.id,f.dependencies);
    assert.equal(r.state,'COMPLETED',r.reason); assert.equal(peak,3);
  } finally { f.store.close(); }
});

test('graph proposals are policy checked without activating or approving', async () => {
  const { reviewRevisionProposal }=await import('../src/workflow/persistence.mjs');
  const f=await setup([item('a')]);
  try {
    const graph=hybridDefinition(f.contract,{workflowId:'repair',workflowVersion:2,base:f.base,items:[item('a'),item('b')],maxParallel:2});
    assert.equal(reviewRevisionProposal(f.store,f.run.id,1,graph).status,'REQUIRES_APPROVAL');
    assert.equal(f.store.get(f.run.id).revision,1);
    assert.equal(f.store.get(f.run.id).state,'WAITING_APPROVAL');
    assert.equal(reviewRevisionProposal(f.store,f.run.id,0,graph).status,'BLOCKED');
    assert.equal(reviewRevisionProposal(f.store,f.run.id,1,{...graph,requiredVerification:false}).status,'BLOCKED');
  } finally { f.store.close(); }
});

test('completed hybrid run rechecks final tree on subsequent status execution', async () => {
  const f=await setup([item('a'),item('b')]);
  try {
    f.approve(); const r=await execute(f.store,f.run.id,f.dependencies); assert.equal(r.state,'COMPLETED',r.reason);
    const child=f.store.get(r.finalRunId);
    await writeFile(path.join(child.candidateDirectory,'src/a.js'),'changed after completion');
    const invalid=await execute(f.store,r.id,f.dependencies);
    assert.equal(invalid.state,'WAITING_HUMAN'); assert.equal(invalid.acceptedHash,undefined); assert.match(invalid.reason,/tree changed/); assert.equal(f.calls.length,2);
    const owner=f.store.claim(r.id);
    await assert.rejects(execute(f.store,child.id,f.dependencies,{workflowOwner:owner}),/previously launched|Stale/);
    f.store.release(r.id,owner);
  } finally { f.store.close(); }
});
