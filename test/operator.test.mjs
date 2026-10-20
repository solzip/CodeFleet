import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { OfflineOperatorLedger, canonical, digest, fingerprint, requireProductionHostIsolation } from '../src/hosts/operator.mjs';
import { hostCli } from '../src/hosts/cli.mjs';
import { IMAGE } from '../src/alpha/contract.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'codefleet-h2-'));
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' });
  const privateKey = keys.privateKey.export({ format: 'pem', type: 'pkcs8' });
  let now = 1000; const commands = [];
  const command = { executable: 'fixture-only', args: ['bounded-write'], cwd: 'fixture' };
  const live = { control: 'run', leaseUntil: 5000, binding: { runId: 'run-1', workItemId: 'item-1', revision: 1, contractHash: digest('contract'), actionDigest: digest(command), repository: 'fixture-repo@base', environment: digest('isolated-fixture'), policyHash: digest('policy'), leaseOwner: 'owner-1' } };
  const file = path.join(root, 'operator.sqlite');
  const options = { file, operatorKeys: [publicKey], current: () => live, clock: () => now, dispatch: spec => { commands.push(spec); return { exitCode: 0 }; } };
  const ledger = new OfflineOperatorLedger(options);
  const request = ledger.agent({ method: 'request', binding: live.binding });
  const envelope = (kind = 'APPROVE', overrides = {}) => {
    const decision = { id: request.id, kind, binding: structuredClone(live.binding), principal: fingerprint(publicKey), expiresAt: 4000, maxUses: 1, ...overrides };
    return { decision, signature: sign(null, Buffer.from(canonical(decision)), privateKey).toString('hex') };
  };
  return { root, file, publicKey, privateKey, live, options, ledger, request, envelope, command, commands, clock: n => { now = n; } };
}
test('operator: fake signed normal action is single-use, durable and not verification', async () => {
  const f = fixture();
  try {
    const envelope = f.envelope(); f.ledger.operator(envelope);
    const result = await f.ledger.execute(f.request.id, f.command);
    assert.equal(result.authority, 'DISPATCH_ONLY_NOT_VERIFICATION'); assert.equal(f.commands.length, 1);
    await assert.rejects(f.ledger.execute(f.request.id, f.command), /Approval required/);
    assert.throws(() => f.ledger.operator(envelope), /terminal/);
    f.ledger.close(); f.ledger = new OfflineOperatorLedger(f.options);
    await assert.rejects(f.ledger.execute(f.request.id, f.command), /Approval required/);
    const db = new DatabaseSync(f.file);
    const row = db.prepare('SELECT * FROM dispatches').get();
    assert.equal(row.command, canonical(f.command)); assert.equal(row.binding, canonical(f.live.binding)); db.close();
  } finally { f.ledger.close(); }
});
test('operator: actor strings, direct agent approval, hooks and stolen unsigned receipts fail', async () => {
  const f = fixture();
  try {
    for (const method of ['approve', 'deny', 'revoke', 'execute', 'hook', 'policy']) assert.throws(() => f.ledger.agent({ method, actor: 'operator' }), /denied/);
    assert.throws(() => f.ledger.operator({ actor: 'operator', decision: f.envelope().decision, signature: '' }), /fields/);
    const bad = f.envelope(); bad.signature = '00'.repeat(64); assert.throws(() => f.ledger.operator(bad), /signature/);
    const stranger = generateKeyPairSync('ed25519'); const stolen = f.envelope();
    stolen.signature = sign(null, Buffer.from(canonical(stolen.decision)), stranger.privateKey).toString('hex');
    assert.throws(() => f.ledger.operator(stolen), /signature/);
    await assert.rejects(f.ledger.execute(f.request.id, f.command), /Approval required/); assert.equal(f.commands.length, 0);
  } finally { f.ledger.close(); }
});
for (const field of ['runId', 'workItemId', 'revision', 'contractHash', 'repository', 'environment', 'policyHash', 'leaseOwner']) {
  test(`operator: current ${field} change invalidates approval`, async () => {
    const f = fixture(); try {
      f.ledger.operator(f.envelope());
      f.live.binding[field] = field === 'revision' ? 2 : ['contractHash', 'environment', 'policyHash'].includes(field) ? digest('changed') : 'changed';
      await assert.rejects(f.ledger.execute(f.request.id, f.command), /fence/); assert.equal(f.commands.length, 0);
    } finally { f.ledger.close(); }
  });
}
test('operator: expiry, revoked/denied decisions, cancel, pause and lease expiration block dispatch', async () => {
  for (const scenario of ['expiry', 'REVOKE', 'DENY', 'cancel', 'pause', 'lease']) {
    const f = fixture(); try {
      f.ledger.operator(f.envelope());
      if (['REVOKE', 'DENY'].includes(scenario)) { f.ledger.operator(f.envelope(scenario)); assert.throws(() => f.ledger.operator(f.envelope()), /terminal/); }
      else if (scenario === 'expiry') f.clock(4000);
      else if (scenario === 'lease') f.live.leaseUntil = 1000;
      else f.live.control = scenario;
      await assert.rejects(f.ledger.execute(f.request.id, f.command)); assert.equal(f.commands.length, 0);
    } finally { f.ledger.close(); }
  }
});
test('operator: command changes and signed decision tampering fail', async () => {
  const f = fixture(); try {
    const bad = f.envelope(); bad.decision.maxUses = 2; assert.throws(() => f.ledger.operator(bad), /Invalid/);
    const swapped = f.envelope(); swapped.decision.binding.repository = 'attacker'; assert.throws(() => f.ledger.operator(swapped), /signature/);
    f.ledger.operator(f.envelope());
    await assert.rejects(f.ledger.execute(f.request.id, { ...f.command, args: ['remote-write'] }), /digest/);
    const db = new DatabaseSync(f.file); const decision = f.envelope().decision; decision.expiresAt = 999999;
    db.prepare('UPDATE requests SET decision=?').run(canonical(decision)); db.close();
    await assert.rejects(f.ledger.execute(f.request.id, f.command), /signature/); assert.equal(f.commands.length, 0);
  } finally { f.ledger.close(); }
});
test('operator: recheck after reservation rejects changed state without returning grant use', async () => {
  const f = fixture(); f.ledger.close(); let calls = 0;
  f.ledger = new OfflineOperatorLedger({ ...f.options, current: () => { if (++calls === 2) f.live.control = 'cancel'; return f.live; } });
  try {
    f.ledger.operator(f.envelope()); await assert.rejects(f.ledger.execute(f.request.id, f.command), /fence/);
    assert.equal(f.commands.length, 0); assert.equal(f.ledger.status(f.request.id).dispatch, 'UNCERTAIN');
    f.live.control = 'run'; await assert.rejects(f.ledger.execute(f.request.id, f.command), /Approval required/);
  } finally { f.ledger.close(); }
});
test('operator: concurrent dispatch and failed execution cannot duplicate or retry', async () => {
  const f = fixture(); f.ledger.close(); let calls = 0;
  f.ledger = new OfflineOperatorLedger({ ...f.options, dispatch: async () => { calls++; throw Error('fixture failure'); } });
  try {
    f.ledger.operator(f.envelope());
    const results = await Promise.allSettled([f.ledger.execute(f.request.id, f.command), f.ledger.execute(f.request.id, f.command)]);
    assert.ok(results.every(r => r.status === 'rejected')); assert.equal(calls, 1);
    assert.equal(f.ledger.status(f.request.id).dispatch, 'UNCERTAIN');
  } finally { f.ledger.close(); }
});
test('operator: Fake Operator signs in a separate process and trusted executor performs bounded file write', async () => {
  const f = fixture(); f.ledger.close();
  const output = path.join(f.root, 'observed.txt');
  f.command = { executable: process.execPath, args: ['-e', 'require("node:fs").writeFileSync(process.argv[1], "observed")', output], cwd: f.root };
  f.live.binding.actionDigest = digest(f.command);
  f.ledger = new OfflineOperatorLedger({ ...f.options, dispatch: spec => {
    const result = spawnSync(spec.executable, spec.args, { cwd: spec.cwd, shell: false, windowsHide: true });
    return { exitCode: result.status };
  } });
  try {
    f.request = f.ledger.agent({ method: 'request', binding: f.live.binding });
    const decision = { ...f.envelope().decision, id: f.request.id };
    const signer = spawnSync(process.execPath, ['--input-type=module', '-e', 'import fs from "node:fs"; import {sign} from "node:crypto"; const v=JSON.parse(fs.readFileSync(0,"utf8")); console.log(sign(null,Buffer.from(v.body),v.key).toString("hex"));'], { input: JSON.stringify({ body: canonical(decision), key: f.privateKey }), encoding: 'utf8', windowsHide: true });
    assert.equal(signer.status, 0); f.ledger.operator({ decision, signature: signer.stdout.trim() });
    await f.ledger.execute(f.request.id, f.command); assert.equal(readFileSync(output, 'utf8'), 'observed');
  } finally { f.ledger.close(); }
});
test('operator: same-account child CAN steal fake secret; production host execution stays blocked', async () => {
  const f = fixture(); try {
    const secret = path.join(f.root, 'fake-operator-key'); writeFileSync(secret, 'FAKE_ONLY');
    const attack = spawnSync(process.execPath, ['-e', 'const fs=require("node:fs"); const p=process.argv[1];process.stdout.write(fs.readFileSync(p));fs.writeFileSync(p,"ALTERED")', secret], { encoding: 'utf8', windowsHide: true });
    assert.equal(attack.status, 0); assert.equal(attack.stdout, 'FAKE_ONLY'); assert.equal(readFileSync(secret, 'utf8'), 'ALTERED');
    assert.throws(requireProductionHostIsolation, /ISOLATION_UNAVAILABLE/);
    for (const host of ['codex', 'claude']) for (const action of ['requests', 'submit', 'run', 'resume']) {
      const directory = path.join(f.root, 'must-not-create');
      const result = await hostCli([host, action, '--actor', 'operator'], directory);
      assert.equal(result.data.status, 'BLOCKED'); assert.equal(existsSync(directory), false);
    }
  } finally { f.ledger.close(); }
});
test('operator: ledger owner CAN roll back consumption; this configuration is unsupported', async () => {
  const f = fixture(); try {
    f.ledger.operator(f.envelope()); await f.ledger.execute(f.request.id, f.command);
    const db = new DatabaseSync(f.file);
    db.prepare("UPDATE requests SET state='APPROVED' WHERE id=?").run(f.request.id);
    db.prepare('DELETE FROM dispatches WHERE requestId=?').run(f.request.id); db.close();
    await f.ledger.execute(f.request.id, f.command); assert.equal(f.commands.length, 2);
    // This is a demonstrated missing OS boundary, not a successful replay defense.
    assert.throws(requireProductionHostIsolation, /ISOLATION_UNAVAILABLE/);
  } finally { f.ledger.close(); }
});
test('operator: actual public CLI cannot enable execution with actor or isolation flags', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'codefleet-h2-cli-')), state = path.join(root, 'state');
  for (const host of ['codex', 'claude']) {
    const result = spawnSync(process.execPath, ['src/alpha/cli.mjs', '--state', state, 'host', host, 'run', 'fake-run', '--actor', 'operator', '--isolated=true'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).status, 'BLOCKED');
    assert.match(result.stdout, /HOST_OPERATOR_ISOLATION_UNAVAILABLE/); assert.equal(existsSync(state), false);
  }
});
test('operator: isolated Fake Agent and descendant cannot access broker files or Docker socket', () => {
  // Required in the full verification environment; never silently skipped.
  assert.equal(process.env.CODEFLEET_TEST_DOCKER, '1', 'H2 isolation verification requires Docker');
  const f = fixture();
  try {
    const probe = `const fs=require('node:fs');const paths=['/operator/operator.sqlite','/operator/fake-key'];const checks=paths.map(p=>{let read=false,write=false,readError,writeError;try{fs.readFileSync(p);read=true}catch(e){readError=e.code}try{fs.writeFileSync(p,'forged');write=true}catch(e){writeError=e.code}return {read,write,readError,writeError}});let elevate=false;try{process.setuid(0);elevate=true}catch{};console.log(JSON.stringify({uid:process.getuid(),checks,elevate,socket:fs.existsSync('/var/run/docker.sock')}));`;
    const agent = `const cp=require('node:child_process');const code=${JSON.stringify(probe)};const parent=cp.spawnSync(process.execPath,['-e',code],{encoding:'utf8'});const child=cp.spawnSync(process.execPath,['-e',code],{encoding:'utf8'});console.log(JSON.stringify({parent:JSON.parse(parent.stdout),child:JSON.parse(child.stdout),exits:[parent.status,child.status]}));`;
    const script = `const fs=require('node:fs'),cp=require('node:child_process');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/operator/operator.sqlite');db.exec('CREATE TABLE approval(state TEXT)');db.prepare('INSERT INTO approval VALUES (?)').run('PENDING');db.close();fs.writeFileSync('/operator/fake-key','FAKE_ONLY',{mode:0o600});const before=fs.readFileSync('/operator/operator.sqlite');const result=cp.spawnSync(process.execPath,['-e',${JSON.stringify(agent)}],{uid:65534,gid:65534,encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);console.log(JSON.stringify({agent:JSON.parse(result.stdout),unchanged:before.equals(fs.readFileSync('/operator/operator.sqlite'))&&fs.readFileSync('/operator/fake-key','utf8')==='FAKE_ONLY'}));`;
    const result = spawnSync('docker', ['run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--cap-add=SETUID', '--cap-add=SETGID', '--security-opt=no-new-privileges', '--user=0:0', '--tmpfs=/operator:rw,nosuid,nodev,noexec,mode=0700,size=4m', '--pids-limit=32', '--memory=128m', '--cpus=1', IMAGE, 'node', '-e', script], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout); assert.equal(observed.unchanged, true); assert.deepEqual(observed.agent.exits, [0, 0]);
    for (const processResult of [observed.agent.parent, observed.agent.child]) {
      assert.equal(processResult.uid, 65534); assert.equal(processResult.elevate, false); assert.equal(processResult.socket, false);
      for (const row of processResult.checks) assert.deepEqual(row, { read: false, write: false, readError: 'EACCES', writeError: 'EACCES' });
    }
    assert.equal(f.ledger.status(f.request.id).state, 'PENDING');
  } finally { f.ledger.close(); }
});
