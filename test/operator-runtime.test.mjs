import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { seed } from './fixtures/operator-seed.mjs';
import { Store } from '../src/alpha/store.mjs';
import { WorkflowAuthorization, registerWorkflowGuard } from '../src/hosts/workflow-authorization.mjs';
import { OfflineOperatorLedger, canonical, fingerprint } from '../src/hosts/operator.mjs';
import { reserve, approval, approveWorkflow, createWorkflow, attempts } from '../src/workflow/persistence.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { hybridDefinition } from '../src/workflow/definition.mjs';
import { git, repository } from '../src/alpha/workspace.mjs';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { verificationResult } from '../src/alpha/verifier.mjs';

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'cf-h3-')), directory = path.join(root, 'state');
  const catalog = seed(directory), store = new Store(directory);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' }); let guard;
  const ledger = new OfflineOperatorLedger({ file: path.join(root, 'operator.sqlite'), operatorKeys: [pem], current: (r, i) => guard.snapshot(r, i), dispatch: () => { throw Error('No arbitrary dispatcher'); } });
  guard = new WorkflowAuthorization(store, ledger, catalog, { fixture: true });
  registerWorkflowGuard(store, guard);
  const decide = (r, kind = 'APPROVE') => {
    const decision = { id: r.id, kind, binding: r.binding, principal: fingerprint(pem), expiresAt: Date.now()+60000, maxUses: 1 };
    return ledger.operator({ decision, signature: sign(null, Buffer.from(canonical(decision)), privateKey).toString('hex') });
  };
  return { root, store, ledger, guard, decide, close() { ledger.close(); store.close(); } };
}
test('H3: protected workflow cannot reopen through legacy actor approval or missing guard', () => {
  const f = setup(); try {
    assert.throws(() => approveWorkflow(f.store, 'safe', { actor: 'operator', workflowHash: f.store.get('safe').contractHash, expiresAt: Date.now()+60000 }), /actor/);
    const reopened = new Store(f.store.directory);
    try { assert.throws(() => approval(reopened, reopened.get('safe')), /trusted Operator/); } finally { reopened.close(); }
  } finally { f.close(); }
});
test('H3: actual reserve denies risky work before inserting an attempt and consumes exact approved action', () => {
  const f = setup(); try {
    const owner = f.store.claim('risk'), run = f.store.get('risk'); run.states.repair = 'READY';
    const snap = f.guard.snapshot('risk', 'repair');
    assert.throws(() => reserve(f.store, run, owner, 'repair', snap.action.contract), /approval/);
    assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM workflow_attempts').get().n, 0);
    const req = f.guard.request('risk', 'repair'); f.decide(req);
    const child = reserve(f.store, run, owner, 'repair', snap.action.contract);
    assert.equal(child.workflowItemId, 'repair'); assert.equal(f.ledger.status(req.id).state, 'CONSUMED');
  } finally { f.close(); }
});
test('H3: revision, pause, lease change and unsupported effects invalidate execution', () => {
  const f = setup(); try {
    const owner = f.store.claim('risk'); const req = f.guard.request('risk', 'repair'); f.decide(req);
    for (const kind of ['remote', 'expand', 'shell']) assert.throws(() => f.guard.effect(f.store.get('risk'), kind), /unsupported/);
    for (const kind of ['read', 'proposal', 'verify']) f.guard.effect(f.store.get('risk'), kind);
    f.store.control('risk', 'pause'); assert.throws(() => f.guard.snapshot('risk', 'repair'), /control/);
    f.store.release('risk', owner); const resumed = f.store.claim('risk', { resume: true });
    const run = f.store.get('risk'); run.states.repair = 'READY';
    assert.throws(() => reserve(f.store, run, resumed, 'repair', f.guard.snapshot('risk', 'repair').action.contract), /fence/);
    run.revision++; f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run), run.id);
    assert.throws(() => f.guard.check(run), /changed/);
  } finally { f.close(); }
});
test('H3: confined actual Workflow and independent tests complete without per-action human grants', async () => {
  const f = setup(); try {
    const repo = path.join(f.root, 'repo'); mkdirSync(path.join(repo, 'src'), { recursive: true }); mkdirSync(path.join(repo, 'test'));
    writeFileSync(path.join(repo, 'src/a.js'), 'module.exports=(a,b)=>a+b;');
    writeFileSync(path.join(repo, 'test/a.test.js'), "const test=require('node:test'),assert=require('node:assert/strict');test('subtract',()=>assert.equal(require('../src/a.js')(5,2),3));");
    for (const args of [['init'], ['add', '.'], ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']]) requireSuccess(await git(repo,args), 'Fixture baseline');
    const selected = await repository(repo), run = f.store.get('safe'), source = f.store.readArtifact(run.sourceRef);
    const graph = hybridDefinition(source, { workflowId: 'fixture', base: selected.base, maxParallel: 1, items: run.contract.items });
    Object.assign(run, selected, { contract: graph, contractHash: graph.workflowHash, graphRef: f.store.artifact(graph) });
    f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run),run.id);
    f.guard.catalog.safe.workflowHash = graph.workflowHash; // trusted fixture provisioning, before execution
    let observed = 0;
    const result = await execute(f.store, run.id, { ready: async()=>{}, verify: async request => {
      observed++; return verificationResult(await command(process.execPath,['--test','--test-reporter=tap',...request.tests],{cwd:request.directory}));
    }, hostExecution: { select: async()=>({providerId:'fixture-staged'}), execute: async()=>({kind:'ProviderExecutionResult',status:'PROPOSED',mode:'PROPOSAL_ONLY',authority:'PROVIDER_REPORTED_ONLY',proposal:{summary:'Subtract',edits:[{path:'src/a.js',oldText:'a+b',newText:'a-b'}]},cost:0}) } });
    assert.equal(result.state,'COMPLETED',result.reason); assert.ok(observed>=4);
    assert.equal(f.store.events(run.id).filter(e=>e.type==='OS_AUTHORIZATION_ASSIGNMENT').length,2);
  } finally { f.close(); }
});
test('H3: real Linux authenticated IPC, Operator and Agent UIDs, attacks and workflow assignments', () => {
  assert.equal(process.env.CODEFLEET_TEST_DOCKER,'1');
  const image = process.env.CODEFLEET_OPERATOR_IMAGE;
  assert.match(image ?? '',/^sha256:[a-f0-9]{64}$/, 'Prepared immutable Operator test image required');
  const result=spawnSync('docker',['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID','--cap-add=CHOWN','--security-opt=no-new-privileges','--pids-limit=96','--memory=384m','--cpus=1','--tmpfs=/fixture:rw,nosuid,nodev,size=32m,mode=0755','--mount',`type=bind,source=${path.join(process.cwd(), "src")},target=/app/src,readonly`,'--mount',`type=bind,source=${path.join(process.cwd(), "test/fixtures")},target=/app/test/fixtures,readonly`,image,'python3','-B','/app/test/fixtures/operator-ipc-probe.py'],{encoding:'utf8',windowsHide:true,timeout:45000});
  assert.equal(result.status,0,result.stderr); const evidence=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(evidence.status,'OFFLINE_VERIFIED'); assert.ok(evidence.checks.length>=17); assert.equal(evidence.modelCalls,0);
  console.log('H3 IPC observations: '+JSON.stringify(evidence));
});
test('Host Core: trusted Operator guard blocks risky item while independent Docker verification proceeds', async () => {
  assert.equal(process.env.CODEFLEET_TEST_DOCKER, '1');
  const f = setup();
  try {
    const repo = path.join(f.root, 'mixed');
    mkdirSync(path.join(repo, 'src'), { recursive: true }); mkdirSync(path.join(repo, 'test'));
    for (const id of ['a', 'b', 'c']) {
      writeFileSync(path.join(repo, `src/${id}.js`), 'module.exports=(a,b)=>a+b;');
      writeFileSync(path.join(repo, `test/${id}.test.js`), `const t=require('node:test'),a=require('node:assert/strict');t('${id}',()=>a.equal(require('../src/${id}.js')(5,2),3));`);
    }
    for (const args of [['init'], ['add', '.'], ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']])
      requireSuccess(await git(repo, args), 'fixture');
    const selected = await repository(repo);
    const source = { schemaVersion: 1, goal: 'Repair arithmetic', files: ['a','b','c'].map(id => `src/${id}.js`),
      context: ['a','b','c'].map(id => `src/${id}.js`), tests: ['a','b','c'].map(id => `test/${id}.test.js`),
      maxAttempts: 3, timeoutSeconds: 120, attemptBudgetUsd: 1, delivery: { mode: 'local' } };
    const items = ['a','b','c'].map(id => ({ id, dependencies: id === 'c' ? ['a'] : [], priority: 0,
      files: [`src/${id}.js`], tests: [`test/${id}.test.js`], acceptanceCriteria: ['Regression passes'], resources: [],
      roles: Object.fromEntries(['Planner','Architect','Executor','Reviewer'].map(role => [role, id + role])) }));
    const graph = hybridDefinition(source, { workflowId: 'mixed', base: selected.base, items });
    const run = await createWorkflow(f.store, repo, graph, source, 'mixed');
    run.authorizationMode = 'OS_OPERATOR_V1';
    f.store.db.prepare('UPDATE runs SET body=? WHERE id=?').run(JSON.stringify(run), run.id);
    f.guard.catalog.mixed = { workflowHash: graph.workflowHash, revision: run.revision, riskyItems: ['a'] };
    const called = [];
    const result = await execute(f.store, run.id, { hostExecution: {
      select: async () => ({ providerId: 'fake-staged' }),
      execute: async child => {
        called.push(child.workflowItemId);
        return { kind:'ProviderExecutionResult',status:'PROPOSED',mode:'PROPOSAL_ONLY',authority:'PROVIDER_REPORTED_ONLY',
          proposal:{summary:'Subtract',edits:child.contract.files.map(p=>({path:p,oldText:'a+b',newText:'a-b'}))},cost:0 };
      }
    } });
    assert.deepEqual(called, ['b']);
    assert.equal(result.states.a, 'BLOCKED'); assert.equal(result.states.b, 'SUCCEEDED');
    assert.equal(result.states.c, 'BLOCKED'); assert.equal(result.state, 'WAITING_HUMAN');
    assert.equal(result.finalRunId, undefined); assert.equal(attempts(f.store, run.id).length, 1);
    const child = f.store.get(attempts(f.store, run.id)[0].childId);
    assert.equal(f.store.readArtifact(child.evidenceHash).verificationBackend, 'container');
    assert.equal(f.store.readArtifact(child.evidenceHash).requiredGateResults.protectedVerification, 'SATISFIED');
  } finally { f.close(); }
});
