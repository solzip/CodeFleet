// Reproduce the legacy CLI against a disposable clone of this actual repository.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(tmpdir(), 'codefleet-m0-'));
const repo = path.join(temp, 'actual-repository');
const cli = path.join(root, 'src/cli.ts');
const steps = [];
function run(label, command, args, cwd = root) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000 });
  const clean = (s) => (s ?? '').replaceAll(temp, '<temporary-directory>').replaceAll(root, '<source-repository>').replaceAll(process.env.USERPROFILE ?? process.env.HOME ?? '<unset-home>', '<user-home>');
  steps.push({ label, exitCode: r.status, stdout: clean(r.stdout), stderr: clean(r.stderr) });
  return r;
}
if (run('clone-current-product', 'git', ['clone', '--quiet', '--no-hardlinks', root, repo]).status !== 0) throw Error('clone failed');
run('initialize', process.execPath, [cli, '--workspace', repo, 'init']);
const profilePath = path.join(repo, '.codefleet/config.json');
const profile = JSON.parse(await readFile(profilePath, 'utf8'));
profile.project = { id: 'codefleet-baseline', name: 'CodeFleet baseline' };
profile.defaults.task.harnessMode = 'COMMAND_EXEC';
profile.defaults.run.isolationMode = 'GIT_WORKTREE';
profile.policies.commands.allowedCommands = [{ argv: ['node', '--test', 'test/cli.test.ts'], matchMode: 'EXACT' }];
await writeFile(profilePath, JSON.stringify(profile, null, 2));
await writeFile(path.join(repo, '.codefleet/tasks/apply-preview.yaml'), `id: apply-preview\ntitle: Repair apply preview option\nprojectPath: '.'\ngoal: Make apply --check reach the planner without changing the workspace.\nagentRole: BACKEND_IMPLEMENTER\nscope:\n  include: ['src/cli.ts']\n  exclude: ['test/**']\nverification:\n  commands:\n    - commandId: cli-regression\n      command: ['node', '--test', 'test/cli.test.ts']\nconstraints: []\ndoneCriteria: ['apply --check reaches the planner']\nworkflow: [IMPLEMENT]\n`);
run('validate-task', process.execPath, [cli, '--workspace', repo, 'task', 'validate', 'apply-preview']);
run('approve-developer-task-with-tests', process.execPath, [cli, '--workspace', repo, 'task', 'approve', 'apply-preview', '--actor', 'sol', '--reason', 'baseline']);
run('preview-without-mutation', process.execPath, [cli, '--workspace', repo, 'apply', 'missing-run', '--check']);
const report = { schemaVersion: 1, node: process.version, platform: process.platform, sourceCommit: run('source-commit', 'git', ['rev-parse', 'HEAD']).stdout.trim(), steps, conclusion: 'Baseline only; blocked before agent invocation. No product completion claimed.' };
console.log(JSON.stringify(report, null, 2));
