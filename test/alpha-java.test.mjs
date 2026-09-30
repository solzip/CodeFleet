import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateContract } from '../src/alpha/contract.mjs';
import { javaClasses, javaCommand, javaDockerArgs, javaOutputs, javaProtectedPaths } from '../src/alpha/java-verifier.mjs';
import { command } from '../src/alpha/process.mjs';
import { fileURLToPath } from 'node:url';

const contract = (kind = 'java-gradle') => ({ schemaVersion: 1, goal: 'Repair overflow without modifying verification assets.', files: ['service/src/main/java/demo/Page.java'], context: ['service/src/main/java/demo/Page.java'], tests: ['service/src/test/java/demo/PageTest.java'], verification: { kind, module: 'service', image: 'sha256:' + 'a'.repeat(64) }, maxAttempts: 2, timeoutSeconds: 600, attemptBudgetUsd: 1, delivery: { mode: 'local' } });

test('Java contracts pin image and module; no test/build edits, selectors or shell grants', () => {
  for (const kind of ['java-gradle', 'java-maven']) assert.deepEqual(validateContract(contract(kind)), contract(kind));
  for (const file of ['service/pom.xml', 'service/build.gradle', 'other/src/main/java/Page.java', 'service/src/test/java/PageTest.java']) {
    const c = contract(); c.files = c.context = [file]; assert.throws(() => validateContract(c));
  }
  for (const patch of [{ image: 'gradle:latest' }, { module: '../other' }, { module: '-DskipTests' }, { kind: 'shell' }, { command: 'true' }]) {
    const c = contract(); Object.assign(c.verification, patch); assert.throws(() => validateContract(c));
  }
  const c = contract(); c.tests = ['service/src/test/java/-skipTests.java']; assert.throws(() => validateContract(c));
});
test('Java tool adapters use exact declared classes, offline execution and force fresh Gradle tests', () => {
  assert.deepEqual(javaClasses(contract()), ['demo.PageTest']);
  const gradle = javaCommand(contract());
  for (const arg of ['--offline', '--rerun-tasks', '--no-build-cache', ':service:test', '--tests', 'demo.PageTest']) assert.ok(gradle.includes(arg));
  const maven = javaCommand(contract('java-maven'));
  for (const arg of ['--offline', '-Dtest=demo.PageTest', '-pl', 'service', '-am']) assert.ok(maven.includes(arg));
  assert.equal(javaCommand(contract(), false).includes('--offline'), false);
});
test('Java isolation keeps source read-only, network disabled and build output ephemeral', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-java-layout-'));
  await mkdir(path.join(dir, 'service'));
  await writeFile(path.join(dir, 'service/build.gradle'), '');
  const outputs = await javaOutputs(dir, 'java-gradle');
  assert.deepEqual(outputs, ['build', 'service/build']);
  const args = javaDockerArgs(dir, contract(), 'codefleet-test', outputs, await javaProtectedPaths(dir, outputs));
  for (const arg of ['--network=none', '--read-only', '--cap-drop=ALL', '--user=1000:1000']) assert.ok(args.includes(arg));
  assert.ok(args.includes(`type=bind,source=${dir},target=/source,readonly`));
  assert.ok(args.some(a => a.includes('target=/work/service/build.gradle,readonly')));
  assert.ok(args.some(a => a.startsWith('--tmpfs=/work:')));
  await mkdir(path.join(dir, 'service/build'));
  await writeFile(path.join(dir, 'service/build/stale.xml'), '');
  await assert.rejects(javaOutputs(dir, 'java-gradle'), /Tracked build outputs/);
});

test('real JDK parser rejects missing, forged, skipped and undeclared reports', { skip: !process.env.CODEFLEET_TEST_JAVA }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-junit-'));
  const parser = fileURLToPath(new URL('../src/alpha/java/JunitReport.java', import.meta.url));
  const run = async xml => {
    await writeFile(path.join(dir, 'TEST-demo.PageTest.xml'), xml);
    return command(process.env.CODEFLEET_TEST_JAVA, [parser, dir, 'demo.PageTest']);
  };
  const xml = (body, count = 1, failures = 0, skipped = 0) => `<testsuite tests="${count}" failures="${failures}" errors="0" skipped="${skipped}">${body}</testsuite>`;
  const testcase = '<testcase classname="demo.PageTest" name="a &amp; b"/>';
  const valid = await run(xml(testcase)); assert.equal(valid.exitCode, 0, valid.stderr.toString());
  assert.deepEqual(JSON.parse(valid.stdout).testNames, ['demo.PageTest:a & b']);
  for (const input of [xml(testcase, 2), xml(testcase.replace('demo.PageTest', 'Other')), '<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml(testcase), xml(''), '<broken>', xml('<testcase classname="demo.PageTest" name="a"><flakyFailure/></testcase>')]) assert.notEqual((await run(input)).exitCode, 0);
  const skipped = await run(xml('<testcase classname="demo.PageTest" name="a"><skipped/></testcase>', 1, 0, 1));
  assert.equal(JSON.parse(skipped.stdout).skipped, 1);
  const failed = await run(xml('<testcase classname="demo.PageTest" name="a"><failure/></testcase>', 1, 1));
  assert.equal(JSON.parse(failed.stdout).failed, 1);
});
