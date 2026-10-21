import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, isFailingBaseline } from '../src/alpha/judge.mjs';
import { bindVerification, PROTECTED_CAPABILITIES } from '../src/alpha/verification-evidence.mjs';
import { containerBackend, localBackend, inspectLocalCommand, hostSandboxBackend } from '../src/verification/backends.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from '../src/alpha/process.mjs';

const legacy = () => ({ authority: 'HARNESS_EXECUTED', exitCode: 0, tests: 1, passed: 1, failed: 0,
  skipped: 0, todo: 0, integrity: true, testIdentityMatch: true, interrupted: false, truncated: false });
const envelope = () => ({ ...legacy(), verificationBackend: 'arbitrary-name',
  executionAuthority: 'HARNESS_EXECUTED', isolationCapabilities: [...PROTECTED_CAPABILITIES],
  verifierIndependence: 'PROTECTED_TEST_INPUTS', evidenceIntegrity: 'UNBOUND',
  candidateTreeHash: null, contractHash: null, requiredGateResults: {} });
const bind = e => bindVerification(e, { contractHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64), integrity: true, testIdentityMatch: true });

test('A: legacy evidence remains compatible; partial/new evidence fails closed', () => {
  assert.equal(judge(legacy()).outcome, 'ACCEPT');
  assert.equal(judge({ ...legacy(), verificationBackend: 'container' }).outcome, 'ESCALATE');
  assert.equal(judge(bind(envelope())).outcome, 'ACCEPT');
  for (const patch of [{ executionAuthority: 'LOCAL_EXECUTED' }, { isolationCapabilities: [] },
    { verifierIndependence: 'UNPROTECTED' }, { evidenceIntegrity: 'MISMATCH' },
    { contractHash: null }, { candidateTreeHash: 'c'.repeat(64) },
    { requiredGateResults: {} }, { requiredGateResults: { protectedVerification: 'UNSATISFIED' } }]) {
    assert.equal(judge({ ...bind(envelope()), ...patch }).outcome, 'ESCALATE');
  }
});
test('A: local success and backend names cannot establish protected authority', () => {
  const local = bind({ ...envelope(), verificationBackend: 'container', authority: 'LOCAL_EXECUTED',
    executionAuthority: 'LOCAL_EXECUTED', verifierIndependence: 'UNPROTECTED', isolationCapabilities: [] });
  assert.equal(judge(local).outcome, 'ESCALATE');
  assert.equal(local.requiredGateResults.protectedVerification, 'UNSATISFIED');
  assert.equal(isFailingBaseline({ ...local, exitCode: 1, failed: 1, passed: 0 }), false);
  assert.equal(judge({ ...local, authority: 'HARNESS_EXECUTED' }).outcome, 'ESCALATE');
  const additionalGate = bind({ ...envelope(), requiredGateResults: { externalReview: 'UNSATISFIED' } });
  assert.equal(judge(additionalGate).outcome, 'ESCALATE');
});
test('A: explicitly mismatched new baseline evidence cannot authorize a repair attempt', () => {
  const baseline = { ...envelope(), exitCode: 1, failed: 1, passed: 0 };
  assert.equal(isFailingBaseline(baseline), true);
  assert.equal(isFailingBaseline({ ...baseline, evidenceIntegrity: 'MISMATCH' }), false);
});
test('D: Container missing capability never falls back; Host Sandbox cannot self-certify', async () => {
  let ran = false;
  const backend = containerBackend({ ready: async () => { throw Error('Docker not installed'); }, run: async () => { ran = true; } });
  assert.equal((await backend.capabilities()).status, 'UNAVAILABLE');
  await assert.rejects(backend.prepare(), /Docker/); assert.equal(ran, false);
  assert.equal((await hostSandboxBackend.capabilities()).status, 'NOT_VERIFIED');
  await assert.rejects(hostSandboxBackend.verify({ advertised: true }), /NOT_VERIFIED/);
});
async function localFixture(body = "const t=require('node:test');t('local',()=>{});") {
  const directory = await mkdtemp(path.join(tmpdir(), 'cf-local-backend-'));
  await writeFile(path.join(directory, 'check.cjs'), body);
  const request = { directory, executable: process.execPath, args: ['--test', '--test-reporter=tap', 'check.cjs'] };
  const backend = localBackend(), reviewed = await inspectLocalCommand(request);
  const token = await backend.authorize(request, { reviewedCommandHash: reviewed.commandHash, acknowledgeUnisolatedExecution: true });
  return { request: { ...request, token }, backend };
}
test('D: actual local Node test needs exact one-use trust and cannot pass protected Judge', async () => {
  const { backend, request } = await localFixture();
  await assert.rejects(backend.verify({ ...request, token: {} }), /grant/);
  await assert.rejects(backend.verify({ ...request, args: ['--version'] }), /changed/);
  const result = await backend.verify(request);
  assert.equal(result.tests, 1); assert.equal(result.status, 'LOCAL_PASSED');
  assert.equal(result.authority, 'LOCAL_EXECUTED'); assert.equal(result.complete, false);
  assert.equal(judge(result).outcome, 'ESCALATE');
  await assert.rejects(backend.verify(request), /consumed/);
});
test('D: changed script, unreviewed trust and concurrent grant replay are rejected', async () => {
  const f = await localFixture();
  await assert.rejects(f.backend.authorize(f.request, { reviewedCommandHash: 'fake', acknowledgeUnisolatedExecution: true }), /Explicit/);
  await writeFile(path.join(f.request.directory, 'check.cjs'), 'process.exit(0)');
  await assert.rejects(f.backend.verify(f.request), /changed/);
  const g = await localFixture();
  const results = await Promise.allSettled([g.backend.verify(g.request), g.backend.verify(g.request)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('D: actual local cancellation and self-modification never report local success', async () => {
  const f = await localFixture("require('node:test')('wait',async()=>new Promise(r=>setTimeout(r,10000)));");
  const pending = f.backend.verify(f.request);
  const timer = setInterval(() => f.backend.cancel(f.request.token), 50);
  const result = await pending; clearInterval(timer);
  assert.equal(result.interrupted, true); assert.equal(result.status, 'INCONCLUSIVE');
  const g = await localFixture("require('node:fs').writeFileSync('extra','changed');require('node:test')('x',()=>{});");
  const modified = await g.backend.verify(g.request);
  assert.equal(modified.evidenceIntegrity, 'MISMATCH'); assert.equal(modified.status, 'INCONCLUSIVE');
});
test('D: local operator CLI refuses missing trust and records only LOCAL_PASSED', async () => {
  const { request } = await localFixture();
  const { token, ...spec } = request; spec.timeoutMs = 30000;
  const root = await mkdtemp(path.join(tmpdir(), 'cf-local-request-'));
  const file = path.join(root, 'request.json'); await writeFile(file, JSON.stringify(spec));
  const cli = path.resolve('src/alpha/cli.mjs');
  const inspection = await command(process.execPath, [cli, 'inspect-local', file]);
  assert.equal(inspection.exitCode, 0);
  const { commandHash } = JSON.parse(inspection.stdout);
  assert.equal((await command(process.execPath, [cli, 'verify-local', file])).exitCode, 1);
  const run = await command(process.execPath, [cli, 'verify-local', file, '--trust', commandHash, '--acknowledge-unisolated']);
  assert.equal(run.exitCode, 0, run.stderr.toString());
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, 'LOCAL_PASSED'); assert.equal(result.complete, false);
  assert.equal(result.requiredGateResults.protectedVerification, 'UNSATISFIED');
  await writeFile(path.join(spec.directory, 'unreviewed'), 'new bytes');
  assert.equal((await command(process.execPath, [cli, 'verify-local', file, '--trust', commandHash, '--acknowledge-unisolated'])).exitCode, 1);
});
