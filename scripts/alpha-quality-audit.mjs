// Opt-in adversarial quality audit. No model calls or remote writes.
// A reproduced defect is reported as a defect, never as a passing product test.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/alpha/store.mjs';
import { execute } from '../src/alpha/controller.mjs';
import { hash, judge } from '../src/alpha/contract.mjs';
import { verify, matchTestIdentity } from '../src/alpha/verifier.mjs';

const contract = { schemaVersion: 1, goal: 'Repair subtraction with protected regression tests.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 1, timeoutSeconds: 60, attemptBudgetUsd: 1, delivery: { mode: 'local' } };
const pass = { exitCode: 0, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, testNames: ['0:subtract'], testIdentityMatch: true, interrupted: false, truncated: false, integrity: true };
const fail = { ...pass, exitCode: 1, passed: 0, failed: 1 };
const proposal = { summary: 'Repair subtraction', edits: [{ path: 'src/math.js', oldText: 'a + b', newText: 'a - b' }] };
const results = [];

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-quality-'));
  const store = new Store(dir);
  const run = store.create({ id: 'quality', repo: dir, base: 'a'.repeat(40), contract, contractHash: hash(contract), state: 'READY', attempts: 0, elapsedMs: 0, reportedCostUsd: 0, unknownCostAttempts: 0 });
  let calls = 0;
  const services = {
    ready: async () => {}, cleanupContainer: async () => {},
    snapshot: async (_repo, _base, target) => { await mkdir(path.join(target, 'src')); await writeFile(path.join(target, 'src/math.js'), 'a + b'); return ['src/math.js']; },
    context: async () => ({ 'src/math.js': 'a + b' }),
    candidateHash: async target => hash(await readFile(path.join(target, 'src/math.js'))),
    propose: async () => ({ proposal, cost: 0.1 }),
    verify: async () => ++calls === 1 ? fail : pass
  };
  return { store, run, services, calls: () => calls };
}

if (process.argv.includes('--docker')) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-quality-verifier-'));
  await mkdir(path.join(dir, 'src')); await mkdir(path.join(dir, 'test'));
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(dir, 'test/math.test.js'), "import test from 'node:test'; import assert from 'node:assert/strict'; import { subtract } from '../src/math.js'; test('subtract really works', () => assert.equal(subtract(5,3),2));");
  await writeFile(path.join(dir, 'src/math.js'), 'export const subtract = (a,b) => a + b;');
  const baseline = await verify({ directory: dir, tests: contract.tests, timeoutMs: 15000 });
  // Only editable source changes; the protected test stays byte-identical.
  await writeFile(path.join(dir, 'src/math.js'), 'process.exit(0); export const subtract = (a,b) => a + b;');
  const evidence = await verify({ directory: dir, tests: contract.tests, timeoutMs: 15000 });
  const decision = judge({ ...evidence, integrity: true, testIdentityMatch: matchTestIdentity(baseline, evidence) });
  results.push({ case: 'early-exit-skips-protected-assertion', defectReproduced: baseline.failed === 1 && decision.outcome === 'ACCEPT', baseline, evidence, decision });
  await writeFile(path.join(dir, 'src/math.js'), 'export const subtract = (a,b) => a - b;');
  const correct = await verify({ directory: dir, tests: contract.tests, timeoutMs: 15000 });
  if (judge({ ...correct, integrity: true, testIdentityMatch: matchTestIdentity(baseline, correct) }).outcome !== 'ACCEPT') throw Error('Correct repair was rejected');
  results.push({ case: 'correct-repair-control', defectReproduced: false, passed: correct.passed });
  for (const [name, source] of [
    ['assertion-monkey-patch', "import assert from 'node:assert/strict'; assert.equal = () => {}; export const subtract = (a,b) => a + b;"],
    ['really-exit', 'process.reallyExit(0); export const subtract = (a,b) => a + b;'],
    ['replace-exit', 'process.exit = () => {}; export const subtract = (a,b) => a + b;']
  ]) {
    await writeFile(path.join(dir, 'src/math.js'), source);
    const result = await verify({ directory: dir, tests: contract.tests, timeoutMs: 15000 });
    const decision = judge({ ...result, integrity: true, testIdentityMatch: matchTestIdentity(baseline, result) });
    results.push({ case: name, defectReproduced: decision.outcome === 'ACCEPT', exitCode: result.exitCode, decision });
  }
} else {
  const f = await fixture();
  try {
    f.services.propose = async () => { throw Error('Provider transport failed after invocation; billing unknown'); };
    const result = await execute(f.store, f.run.id, f.services);
    results.push({ case: 'provider-error-cost-unknown', defectReproduced: result.attempts === 1 && result.unknownCostAttempts === 0, state: result.state, attempts: result.attempts, reportedCostUsd: result.reportedCostUsd, unknownCostAttempts: result.unknownCostAttempts });
  } finally { f.store.close(); }
  const g = await fixture();
  try {
    const owner = g.store.claim(g.run.id);
    Object.assign(g.run, { state: 'VERIFYING', attempts: 1, baselineHash: g.store.artifact(fail), proposalHash: g.store.artifact({ proposal, cost: 0.1 }) });
    g.store.save(g.run, owner, 'SIMULATED_CRASH_CHECKPOINT'); g.store.release(g.run.id, owner);
    g.services.propose = async () => { throw Error('Recovery must not request a new proposal'); };
    let verificationCalls = 0;
    g.services.verify = async () => { verificationCalls++; return pass; };
    const result = await execute(g.store, g.run.id, g.services);
    results.push({ case: 'resume-last-attempt-verification', defectReproduced: result.state !== 'COMPLETED' || verificationCalls !== 1, state: result.state, reason: result.reason, verificationCalls });
  } finally { g.store.close(); }
}
console.log(JSON.stringify({ mode: process.argv.includes('--docker') ? 'real Docker' : 'injected controller boundaries', results }, null, 2));
process.exitCode = results.some(r => r.defectReproduced) ? 2 : 0;
