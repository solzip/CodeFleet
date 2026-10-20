// H1 preparation only. No commit, model turn, credentials or user config writes.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { installHost, manageHost } from '../src/hosts/install.mjs';
import { command, requireSuccess } from '../src/alpha/process.mjs';
import { validateContract, hash } from '../src/alpha/contract.mjs';
import { dockerReady, verify } from '../src/alpha/verifier.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'codefleet-h1-'));
const preparation = { schemaVersion: 1, root, modelCalls: 0, commits: 0, hosts: [] };
for (const host of ['codex', 'claude']) {
  const repo = path.join(root, host), state = path.join(root, host + '-state');
  await mkdir(path.join(repo, 'src'), { recursive: true }); await mkdir(path.join(repo, 'test'));
  await writeFile(path.join(repo, 'src/subtract.js'), 'module.exports = (a, b) => a + b;\n');
  await writeFile(path.join(repo, 'test/subtract.test.js'), "const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst subtract = require('../src/subtract.js');\ntest('subtract positive values', () => assert.equal(subtract(5, 2), 3));\ntest('subtract negative result', () => assert.equal(subtract(2, 5), -3));\n");
  await writeFile(path.join(repo, '.gitignore'), '.agents/\n.claude/\n');
  requireSuccess(await command('git', ['-c', 'core.hooksPath=/dev/null', 'init', repo]), 'Initialize isolated fixture');
  const installation = await installHost(repo, host);
  const status = await manageHost(repo, host, 'status');
  const contract = validateContract({ schemaVersion: 1, goal: 'Fix subtraction using the protected regression tests', files: ['src/subtract.js'], context: ['src/subtract.js'], tests: ['test/subtract.test.js'], maxAttempts: 1, timeoutSeconds: 120, attemptBudgetUsd: 1, delivery: { mode: 'local' } });
  await writeFile(path.join(root, host + '-scope.json'), JSON.stringify({ authority: 'UNAPPROVED_SCOPE_PREVIEW', contract, contractHash: hash(contract), approval: 'ABSENT', live: 'NOT_RUN' }, null, 2));
  const skill = path.join(repo, host === 'codex' ? '.agents' : '.claude', 'skills/codefleet');
  const runtime = path.join(skill, 'runtime/alpha/cli.mjs');
  const cli = await command(process.execPath, [runtime, '--state', state, 'host', host, 'capabilities']);
  requireSuccess(cli, 'Installed runtime');
  preparation.hosts.push({ host, repo, state, runtime, skill, installation, status, skillHash: hash(await readFile(path.join(skill, 'SKILL.md'))), contractHash: hash(contract), runtimeExit: cli.exitCode,
    baseline: 'AWAITING_EXPLICIT_FIXTURE_COMMIT_AUTHORIZATION', actualSkillInvocation: 'NOT_RUN', live: 'NOT_RUN' });
}
await writeFile(path.join(root, 'preparation.json'), JSON.stringify(preparation, null, 2));
// Retain the fixture even if Docker is unavailable. It remains unapproved.
try {
  await dockerReady();
  const host = preparation.hosts[0];
  const { contract } = JSON.parse(await readFile(path.join(root, 'codex-scope.json'), 'utf8'));
  const baseline = await verify({ directory: host.repo, contract, tests: contract.tests, timeoutMs: 30000, containerName: 'codefleet-h1-baseline-' + Date.now() });
  preparation.harnessBaseline = { authority: baseline.authority, tests: baseline.tests, passed: baseline.passed, failed: baseline.failed, exitCode: baseline.exitCode, skipped: baseline.skipped };
} catch (error) { preparation.harnessBaseline = { status: 'BLOCKED', reason: error.message }; }
await writeFile(path.join(root, 'preparation.json'), JSON.stringify(preparation, null, 2));
console.log(JSON.stringify(preparation, null, 2));
