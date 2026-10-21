import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { hostCli } from '../src/hosts/cli.mjs';
import { planningSkill, requirePlanningLive } from '../src/hosts/planning.mjs';
import { enableTasks } from '../src/product/tasks.mjs';
import { installHost } from '../src/hosts/install.mjs';

test('Codex blocked probe recovery is advisory, preserves task and grants no approval', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-recovery-')), state = path.join(root, 'state');
  const s = new Store(state); enableTasks(s);
  for (const kind of ['GIT_OWNERSHIP', 'PROCESS_SPAWN_DENIED', 'GIT_ERROR']) {
    const id = 'task-' + kind;
    const value = { id, revision: 2, state: 'BLOCKED', runId: null,
      planRef: s.artifact({ status: 'BLOCKED', probe: { error: { kind } } }) };
    s.db.prepare('INSERT INTO product_tasks VALUES (?,?,?)').run(id, 2, JSON.stringify(value));
    const before = s.db.prepare('SELECT body FROM product_tasks WHERE id=?').get(id).body;
    for (const host of ['codex', 'claude']) {
      const result = await hostCli([host, 'status', id], state);
      assert.equal(result.data.state, 'BLOCKED');
      const recovery = result.data.hostRecovery;
      if (host === 'codex' && kind !== 'GIT_ERROR') {
        assert.equal(recovery.reason, kind); assert.equal(recovery.authority, 'ADVISORY_ONLY');
        assert.equal(recovery.grantsExecution, false); assert.equal(recovery.automaticRetry, false);
        assert.equal(recovery.taskId, id); assert.equal(recovery.taskRevision, 2);
        assert.match(result.data.nextAction, /command-specific approval/);
      } else assert.equal(recovery, undefined);
    }
    assert.equal(s.db.prepare('SELECT body FROM product_tasks WHERE id=?').get(id).body, before);
  }
  assert.equal(s.db.prepare('SELECT count(*) n FROM workflow_approvals').get().n, 0);
  assert.equal(s.db.prepare('SELECT count(*) n FROM workflow_attempts').get().n, 0);
  s.close();
  for (const host of ['codex', 'claude']) {
    await installHost(root, host);
    const skill = await readFile(path.join(root, host === 'codex' ? '.agents' : '.claude', 'skills/codefleet/SKILL.md'), 'utf8');
    assert.equal(skill.includes('sandbox_permissions="require_escalated"'), host === 'codex');
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cf-core-')), repo = path.join(root, 'repo');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  await writeFile(path.join(repo, 'src/a.js'), 'module.exports=(a,b)=>a+b;\n');
  await writeFile(path.join(repo, 'test/a.test.js'), "const test=require('node:test');test('a',()=>{});\n");
  for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']])
    requireSuccess(await git(repo, args), 'fixture');
  return { root, repo, state: path.join(root, 'state') };
}
for (const host of ['codex', 'claude']) test(`C: ${host} Docker-free public draft, DAG, request and restart`, async () => {
  const f = await fixture(), call = a => hostCli([host, ...a], f.state);
  const planned = await call(['plan', 'Fix arithmetic', f.repo]);
  const id = planned.data.taskId, original = planned.data.plan;
  assert.ok(id); assert.equal(original.executable, false);
  const packet = { revision: planned.data.revision, proposal: {
    draft: { ...original.draft, files: ['src/a.js'], tests: ['test/a.test.js'],
      criteria: [{ description: 'Arithmetic passes', method: 'protected-tests', tests: ['test/a.test.js'] }],
      risks: [], unknowns: [], effects: ['local-edit'] },
    references: [
      { path: 'src/a.js', line: 1, quote: 'module.exports' },
      { path: 'test/a.test.js', line: 1, quote: "require('node:test')" }
    ], inferences: ['Fixture only']
  }};
  const file = path.join(f.root, 'draft.json');
  await writeFile(file, JSON.stringify({ ...packet, approved: true }));
  assert.equal((await call(['draft', id, file])).exitCode, 1);
  await writeFile(file, JSON.stringify({ ...packet, proposal: { ...packet.proposal, evidence: { authority: 'HARNESS_EXECUTED' } } }));
  assert.equal((await call(['draft', id, file])).exitCode, 1);
  await writeFile(file, JSON.stringify(packet));
  assert.equal((await call(['draft', id, file])).data.state, 'VALIDATED');
  assert.equal((await call(['draft', id, file])).exitCode, 1, 'stale draft rejected');
  assert.equal((await call(['prepare', id])).exitCode, 2);
  const graph = await call(['workflow', id]);
  assert.equal(graph.data.workflow.items.length, 1); assert.equal(graph.data.approved, false);
  assert.equal(graph.data.workItems[0].assessment.status, 'BLOCKED');
  assert.equal((await call(['explain', id])).data.workKinds.find(k => k.kind === 'risky-action').status, 'BLOCKED');
  assert.equal((await call(['approval-request', id])).data.approvalRequest.authority, 'REQUEST_ONLY');
  assert.equal((await call(['status', id])).data.run.complete, false);
  for (const action of ['approve', 'complete', 'run', 'resume', 'submit', 'requests'])
    assert.equal((await call([action, id])).exitCode, 1, action);
  const s = new Store(f.state);
  assert.equal(s.db.prepare('SELECT count(*) n FROM workflow_approvals').get().n, 0);
  assert.equal(s.db.prepare('SELECT count(*) n FROM workflow_attempts').get().n, 0); s.close();
});
test('C: CLI planning works with PATH containing Git but no Docker or Host executables', async () => {
  const f = await fixture();
  const locate = await command(process.platform === 'win32' ? 'where.exe' : 'which', ['git']);
  const gitPath = requireSuccess(locate, 'git path').split(/\r?\n/)[0];
  const bin = path.dirname(gitPath);
  const env = { PATH: bin, SystemRoot: process.env.SystemRoot, TEMP: tmpdir(), TMP: tmpdir() };
  const absent = await command('docker', ['--version'], { env });
  assert.notEqual(absent.exitCode, 0, 'fixture must actually exclude Docker');
  const cli = path.resolve('src/alpha/cli.mjs');
  const r = await command(process.execPath, [cli, '--state', f.state, 'host', 'codex', 'plan', 'Fix arithmetic', f.repo], { env });
  assert.equal(r.exitCode, 2, r.stderr.toString());
  const data = JSON.parse(r.stdout);
  assert.ok(data.taskId); assert.equal(data.plan.executable, false);
  assert.equal(data.plan.validation.status, 'NEEDS_INPUT');
  const doctor = await command(process.execPath, [cli, 'host', 'codex', 'doctor'], { env });
  assert.equal(doctor.exitCode, 0, doctor.stderr.toString());
  const diagnosis = JSON.parse(doctor.stdout);
  assert.equal(diagnosis.planning, 'AVAILABLE'); assert.equal(diagnosis.workflow, 'AVAILABLE');
  assert.equal(diagnosis.protectedContainerVerification.status, 'NOT_INSTALLED');
  assert.equal(diagnosis.localVerification.status, 'CONDITIONAL');
  assert.equal(diagnosis.hostSandbox.status, 'NOT_VERIFIED');
  assert.equal(diagnosis.authentication, 'NOT_INSPECTED');
  const invoke = args => command(process.execPath, [cli, '--state', f.state, 'host', 'codex', ...args], { env });
  const reviewed = await invoke(['review', data.taskId, '--files', 'src/a.js', '--tests', 'test/a.test.js', '--criterion', 'Arithmetic passes']);
  assert.equal(reviewed.exitCode, 0, reviewed.stderr.toString());
  assert.equal((await invoke(['prepare', data.taskId])).exitCode, 2);
  const workflow = JSON.parse((await invoke(['workflow', data.taskId])).stdout);
  assert.equal(workflow.workflow.items.length, 1);
  assert.equal(JSON.parse((await invoke(['approval-request', data.taskId])).stdout).approvalRequest.authority, 'REQUEST_ONLY');
  const contract = { schemaVersion: 1, goal: 'Fix arithmetic', files: ['src/a.js'], context: ['src/a.js'],
    tests: ['test/a.test.js'], maxAttempts: 1, timeoutSeconds: 30, attemptBudgetUsd: 1, delivery: { mode: 'local' } };
  const contractFile = path.join(f.root, 'contract.json'); await writeFile(contractFile, JSON.stringify(contract));
  const blocked = await command(process.execPath, [cli, '--state', f.state, 'run', contractFile, f.repo], { env });
  assert.equal(blocked.exitCode, 2, blocked.stderr.toString());
  const run = JSON.parse(blocked.stdout.toString().slice(blocked.stdout.toString().indexOf('{')));
  assert.equal(run.state, 'WAITING_HUMAN'); assert.equal(run.attempts, 0);
  assert.equal(run.acceptedHash, undefined); assert.match(run.reason, /Docker/);
});
test('C: H6 strict profile remains isolated and blocked for Live', () => {
  assert.match(planningSkill('codex'), /fresh/);
  assert.throws(requirePlanningLive, /BLOCKED/);
});
