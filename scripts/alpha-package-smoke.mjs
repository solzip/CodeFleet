import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { git } from '../src/alpha/workspace.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.npm_execpath) throw Error('Run via npm run alpha:package-smoke');
const argv = process.argv.slice(2), supervisedOnly = argv.includes('--supervised-only');
const option = name => { const i=argv.indexOf(name); if(i===-1)return null;
  if(argv.lastIndexOf(name)!==i || !argv[i+1] || argv[i+1].startsWith('--'))throw Error('Invalid '+name);
  return argv[i+1]; };
const repositoryPath = option('--repository'), recoveryState = option('--recovery-state'), recoveryTask = option('--recovery-task');
if(supervisedOnly) {
  if(argv.includes('--real-provider') || !repositoryPath || Boolean(recoveryState)!==Boolean(recoveryTask))throw Error('Supervised mode requires --repository and paired recovery options, without --real-provider');
  for(let i=0;i<argv.length;i++){if(argv[i]==='--supervised-only')continue;
    if(['--repository','--recovery-state','--recovery-task'].includes(argv[i])){i++;continue;}throw Error('Unknown supervised package option');}
} else if(repositoryPath || recoveryState || recoveryTask)throw Error('Repository/recovery options require --supervised-only');
const temp = await mkdtemp(path.join(tmpdir(), 'codefleet-packaged-'));
const install = path.join(temp, 'install'); await mkdir(install);
const cache = path.join(temp, 'cache');
async function npm(args, cwd) {
  return requireSuccess(await command(process.execPath, [process.env.npm_execpath, '--cache', cache, ...args], { cwd, timeoutMs: 120000, cap: 4 * 1024 * 1024 }), 'npm packaging');
}
const pack = JSON.parse(await npm(['pack', '--ignore-scripts', '--pack-destination', temp, '--json'], root))[0];
if (supervisedOnly) {
  assert.ok(pack.files.some(file => file.path === 'scripts/host-install.mjs'), 'Public Skill installer must ship');
  assert.deepEqual(pack.files.filter(file => /(^|\/)(\.codefleet|\.git|node_modules)(\/|$)|^(test|evidence)\/|\.(sqlite|sqlite3|db)(-|$)/i.test(file.path)).map(file => file.path), [], 'Private State, fixtures and temporary evidence must not ship');
  await writeFile(path.join(temp, 'package-manifest.json'), JSON.stringify(pack, null, 2), { flag: 'wx' });
}
await npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, pack.filename)], install);
const cli = path.join(install, 'node_modules/codefleet/src/alpha/cli.mjs');
requireSuccess(await command(process.execPath, [cli, '--help']), 'installed CLI help');

let product, workflow = 'not requested';
if (supervisedOnly) {
  const packageRoot = path.join(install, 'node_modules/codefleet');
  const { localTree } = await import(pathToFileURL(path.join(packageRoot, 'src/verification/backends.mjs')).href);
  const skillProject = path.join(temp, 'skill-project'); await mkdir(skillProject);
  const installer = path.join(packageRoot, 'scripts/host-install.mjs');
  await checked('installed-skill-install', process.execPath, [installer, 'install', 'codex', skillProject]);
  const runtime = path.join(skillProject, '.agents/skills/codefleet/runtime/alpha/cli.mjs');
  const absentState = path.join(temp, 'capability-state-must-not-exist');
  async function checked(name, executable, argv, expected = 0) {
    const result = await command(executable, argv, { timeoutMs: 30000, cap: 4 * 1024 * 1024 });
    await writeFile(path.join(temp, name + '.json'), JSON.stringify({ argv, exitCode: result.exitCode,
      interrupted: result.interrupted, truncated: result.truncated, stdout: result.stdout.toString(), stderr: result.stderr.toString() }, null, 2), { flag: 'wx' });
    if (result.exitCode !== expected || result.interrupted || result.truncated) throw Error(name + ' failed; inspect retained package artifacts');
    return JSON.parse(result.stdout.toString());
  }
  const capabilities = await checked('installed-capabilities', process.execPath, [runtime, '--state', absentState, 'host', 'codex', 'capabilities']);
  if (capabilities.publicDelegation !== 'PUBLIC_DELEGATION_BLOCKED' || capabilities.delegationBoundary?.grantsExecution !== false ||
      capabilities.supervisedLocal !== 'EXACT_USER_REVIEW_WITH_HOST_PERMISSION_UNPROTECTED') throw Error('Installed trust level differs');
  await assert.rejects(lstat(absentState), { code: 'ENOENT' });
  const objectiveHelp = await checked('installed-objective-help', process.execPath, [runtime, '--state', absentState, 'objective', 'help']);
  assert.match(objectiveHelp.help, /local-review/);
  await assert.rejects(lstat(absentState), { code: 'ENOENT' });
  const before = await localTree(repositoryPath);
  const planned = await checked('installed-existing-plan', process.execPath, [runtime, '--state', path.join(temp, 'planning-state'),
    'host', 'codex', 'plan', 'Inspect existing project for supervised improvement', repositoryPath, '--local-existing', '--acceptance', 'LOCAL_ONLY'], 2);
  if (planned.contractKind !== 'EXISTING_LOCAL' || planned.plan?.probe?.state !== 'EXISTING_SOURCE' || !planned.plan.probe.base)
    throw Error('Packaged existing HEAD entry failed');
  let recovery = 'NOT_REQUESTED';
  if (recoveryState) {
    const restored = await checked('installed-recovery', process.execPath, [runtime, '--state', recoveryState, 'objective', 'recover', recoveryTask]);
    if (restored.status !== 'RECOVERED' || restored.effects.length) throw Error('Existing Objective needs reconciliation');
    recovery = { status: restored.status, effects: restored.effects, remaining: restored.remaining };
  }
  if (await localTree(repositoryPath) !== before) throw Error('Package inspection changed the existing repository');
  for (const action of ['status', 'disable', 'enable', 'remove'])
    await checked('installed-skill-' + action, process.execPath, [installer, action, 'codex', skillProject]);
  await checked('installed-skill-reinstall', process.execPath, [installer, 'install', 'codex', skillProject]);
  await checked('installed-skill-reinstalled-status', process.execPath, [installer, 'status', 'codex', skillProject]);
  await checked('installed-skill-final-remove', process.execPath, [installer, 'remove', 'codex', skillProject]);
  product = { mode: 'SUPERVISED_PACKAGE', packagedSkill: 'passed', capabilities: 'passed', stateFreeInspection: 'passed',
    existingHeadEntry: 'passed', repositoryPreserved: true, recovery, gitMutations: 0, modelCalls: 0,
    applicationTests: 'NOT_RUN', hostLive: 'NOT_RUN', publicDelegation: 'PUBLIC_DELEGATION_BLOCKED' };
  await writeFile(path.join(temp, 'supervised-result.json'), JSON.stringify(product, null, 2), { flag: 'wx' });
} else {

// Installed product commands must work without editing JSON or invoking models.
const planningRepo = path.join(temp, 'planning-repository');
await mkdir(path.join(planningRepo, 'src'), { recursive: true }); await mkdir(path.join(planningRepo, 'test'));
await writeFile(path.join(planningRepo, 'src/math.js'), 'module.exports = function subtract(a,b) { return a+b; };');
await writeFile(path.join(planningRepo, 'test/math.test.js'), "const test=require('node:test'),assert=require('node:assert/strict');test('subtract',()=>assert.equal(require('../src/math.js')(5,2),3));");
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'local packaged planning fixture']]) requireSuccess(await git(planningRepo, args), 'planning fixture');
async function objective(args, expected = 0) {
  const result = await command(process.execPath, [cli, '--state', path.join(temp, 'product-state'), 'objective', ...args], { timeoutMs: 30000 });
  if (result.exitCode !== expected || result.interrupted || result.truncated) throw Error('Installed objective command failed: ' + result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}
await objective(['help']);
const planned = await objective(['plan', 'Fix subtract behavior', planningRepo], 2);
await objective(['review', planned.taskId, '--files', 'src/math.js', '--tests', 'test/math.test.js', '--criterion', 'Protected subtraction regression passes']);
const waiting = await objective(['run', planned.taskId], 2);
await objective(['approve', planned.taskId, '--hash', waiting.workflowHash, '--actor', 'package-fixture']);
const consent = await objective(['run', planned.taskId], 2);
if (consent.run.complete || consent.run.activeAttempts.length) throw Error('Installed approval unexpectedly launched a model');
await objective(['report', planned.taskId]);
product = { plan: 'passed', review: 'passed', approval: 'passed', modelConsentBlock: 'passed', report: 'passed', live: 'NOT_RUN' };
if (process.argv.includes('--real-provider')) {
  const repo = path.join(temp, 'repository'); await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  await writeFile(path.join(repo, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(repo, 'src/math.js'), 'export const subtract = (a, b) => a + b;\n');
  await writeFile(path.join(repo, 'test/math.test.js'), "import test from 'node:test'; import assert from 'node:assert/strict'; import { subtract } from '../src/math.js'; test('subtract', () => { assert.equal(subtract(5,3),2); assert.equal(subtract(0,4),-4); });\n");
  for (const args of [['init'], ['add', '.'], ['-c', 'user.name=sol', '-c', 'user.email=solarchive.dev@gmail.com', 'commit', '-m', 'packaged workflow acceptance fixture']]) requireSuccess(await git(repo, args), 'fixture git');
  const task = path.join(temp, 'task.json');
  await writeFile(task, JSON.stringify({ schemaVersion: 1, goal: 'Make subtract return a minus b including negative values.', files: ['src/math.js'], context: ['src/math.js'], tests: ['test/math.test.js'], maxAttempts: 2, timeoutSeconds: 300, attemptBudgetUsd: 1, delivery: { mode: 'local' } }));
  const run = await command(process.execPath, [cli, '--state', path.join(temp, 'state'), 'run', task, repo], { timeoutMs: 330000 });
  requireSuccess(run, 'installed real workflow');
  const output = run.stdout.toString(); const result = JSON.parse(output.slice(output.indexOf('{')));
  if (result.state !== 'COMPLETED') throw Error('Installed workflow did not complete');
  workflow = { state: result.state, attempts: result.attempts, runId: result.id, reportedCostUsd: result.reportedCostUsd };
}
}
await npm(['uninstall', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', 'codefleet'], install);
console.log(JSON.stringify({ filename: pack.filename, integrity: pack.integrity, packedFiles: pack.files.length, install: 'passed', help: 'passed', product, workflow, uninstall: 'passed', artifactDirectory: temp }, null, 2));
