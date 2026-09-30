import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { git } from '../src/alpha/workspace.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.npm_execpath) throw Error('Run via npm run alpha:package-smoke');
const temp = await mkdtemp(path.join(tmpdir(), 'codefleet-packaged-'));
const install = path.join(temp, 'install'); await mkdir(install);
const cache = path.join(temp, 'cache');
async function npm(args, cwd) {
  return requireSuccess(await command(process.execPath, [process.env.npm_execpath, '--cache', cache, ...args], { cwd, timeoutMs: 120000, cap: 4 * 1024 * 1024 }), 'npm packaging');
}
const pack = JSON.parse(await npm(['pack', '--ignore-scripts', '--pack-destination', temp, '--json'], root))[0];
await npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, pack.filename)], install);
const cli = path.join(install, 'node_modules/codefleet/src/alpha/cli.mjs');
requireSuccess(await command(process.execPath, [cli, '--help']), 'installed CLI help');
let workflow = 'not requested';
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
await npm(['uninstall', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', 'codefleet'], install);
console.log(JSON.stringify({ filename: pack.filename, integrity: pack.integrity, packedFiles: pack.files.length, install: 'passed', help: 'passed', workflow, uninstall: 'passed', artifactDirectory: temp }, null, 2));
