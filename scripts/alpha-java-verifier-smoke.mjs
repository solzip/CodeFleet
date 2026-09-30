import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/alpha/store.mjs';
import { snapshot, candidateHash } from '../src/alpha/workspace.mjs';
import { verify, cleanupContainer, matchTestIdentity } from '../src/alpha/verifier.mjs';
import { javaOutputs, javaProtectedPaths, javaDockerArgs } from '../src/alpha/java-verifier.mjs';
import { command, environment, requireSuccess } from '../src/alpha/process.mjs';
import { judge } from '../src/alpha/contract.mjs';

const [state, id] = process.argv.slice(2);
if (!state || !id) throw Error('Usage: node scripts/alpha-java-verifier-smoke.mjs <state-directory> <completed-run-id>');
const store = new Store(state);
try {
  const run = store.get(id);
  assert.equal(run.state, 'COMPLETED');
  assert.ok(run.contract.verification);
  const directory = await mkdtemp(path.join(tmpdir(), 'codefleet-java-recheck-'));
  const names = await snapshot(run.repo, run.base, directory);
  const options = { directory, contract: run.contract, tests: run.contract.tests, timeoutMs: 180000 };
  const before = await candidateHash(directory, names);
  const baseline = await verify(options);
  assert.ok(baseline.tests > 0 && baseline.failed > 0 && baseline.exitCode !== 0, baseline.stderr);
  assert.equal(await candidateHash(directory, names), before);
  const accepted = store.readArtifact(run.acceptedHash);
  for (const [name, body] of Object.entries(accepted.changedFiles)) {
    assert.ok(run.contract.files.includes(name));
    await writeFile(path.join(directory, name), body);
  }
  const hash = await candidateHash(directory, names);
  const candidate = await verify(options);
  candidate.integrity = hash === await candidateHash(directory, names);
  candidate.testIdentityMatch = matchTestIdentity(baseline, candidate);
  assert.equal(judge(candidate).outcome, 'ACCEPT', candidate.stderr);
  const name = `codefleet-${randomUUID()}`;
  try {
    const outputs = await javaOutputs(directory, run.contract.verification.kind);
    const protectedPaths = await javaProtectedPaths(directory, outputs);
    requireSuccess(await command('docker', javaDockerArgs(directory, run.contract, name, outputs, protectedPaths), { env: environment('docker') }), 'Protection probe start');
    for (const file of [...run.contract.files, ...run.contract.tests]) {
      const probe = await command('docker', ['exec', name, 'sh', '-c', 'printf tampered > "$1"', 'probe', '/work/' + file], { env: environment('docker') });
      assert.notEqual(probe.exitCode, 0, `Protected file was writable: ${file}`);
    }
  } finally { await cleanupContainer(name); }
  assert.equal(hash, await candidateHash(directory, names));
  console.log(JSON.stringify({ adapter: run.contract.verification.kind, baseline: { tests: baseline.tests, failed: baseline.failed }, candidate: { tests: candidate.tests, passed: candidate.passed }, identityMatch: candidate.testIdentityMatch, sourceAndTestsReadOnly: true, candidateHash: hash, image: candidate.image, modelInvocations: 0 }, null, 2));
} finally { store.close(); }
