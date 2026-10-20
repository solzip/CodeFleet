#!/usr/bin/env node
import { readFile, mkdir, writeFile, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Store } from './store.mjs';
import { createRun, execute } from './controller.mjs';
import { command, requireSuccess, environment } from './process.mjs';
import { dockerReady } from './verifier.mjs';
import { IMAGE, validateContract } from './contract.mjs';
import { prepareJava } from './java-prepare.mjs';
import { verifiedEvidence } from './evidence.mjs';
import { productCli } from '../product/cli.mjs';
import { runReport } from '../product/report.mjs';
import { planIntent } from '../intent/engine.mjs';
import { hostCli, hostHelp } from '../hosts/cli.mjs';
import { inspectLocalCommand, localBackend } from '../verification/backends.mjs';
import { readResponse } from '../hosts/cli.mjs';
import { exact } from '../intent/contract.mjs';

const args = process.argv.slice(2);
const index = args.indexOf('--state');
let directory = path.join(homedir(), '.codefleet-alpha');
if (index !== -1) {
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error('--state requires a directory');
  directory = path.resolve(args[index + 1]); args.splice(index, 2);
}
const [action, ...values] = args;
let store;
let activeId;
let interrupted = false;
const interrupt = () => { interrupted = true; if (store && activeId) store.control(activeId, 'cancel'); };
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
try {
  if (action === 'host') {
    const result = await hostCli(values, directory); console.log(JSON.stringify(result.data, null, 2)); process.exitCode = result.exitCode;
  } else if (action === 'objective') {
    const result = await productCli(values, directory); console.log(JSON.stringify(result.data, null, 2)); process.exitCode = result.exitCode;
  } else if (['inspect-local', 'verify-local'].includes(action)) {
    if (action === 'inspect-local' ? values.length !== 1 :
      values.length !== 4 || values[1] !== '--trust' || values[3] !== '--acknowledge-unisolated')
      throw Error('inspect-local REQUEST.json; verify-local REQUEST.json --trust COMMAND_HASH --acknowledge-unisolated');
    const request = await readResponse(values[0]);
    exact(request, ['executable', 'args', 'directory', 'timeoutMs'], 'Local command');
    if (action === 'inspect-local') console.log(JSON.stringify(await inspectLocalCommand(request), null, 2));
    else {
      const backend = localBackend();
      const token = await backend.authorize(request, { reviewedCommandHash: values[2], acknowledgeUnisolatedExecution: true });
      const result = await backend.verify({ ...request, token, cancelled: () => interrupted });
      console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'LOCAL_PASSED' ? 0 : 2;
    }
  } else if (!action || ['help', '--help'].includes(action)) {
    console.log(hostHelp + '\n');
    console.log('Optional explicit-trust local diagnostics: inspect-local REQUEST.json; verify-local REQUEST.json --trust COMMAND_HASH --acknowledge-unisolated. Local success is never protected VERIFIED.');
    console.log(`CodeFleet experimental alpha — test-driven Node and Java changes\n\n  codefleet-alpha plan "objective" [repository] [--draft draft.json] (read-only, no model call)\n  codefleet-alpha doctor [contract.json]\n  codefleet-alpha prepare-java <contract.json> <trusted-repository>\n  codefleet-alpha run <contract.json> <repository>\n  codefleet-alpha resume <run-id>\n  codefleet-alpha pause|cancel <run-id>\n  codefleet-alpha status [run-id]\n  codefleet-alpha export <run-id> <directory>\n\nOptional: --state <local-state-directory>\n\nRun grants the explicit contract scope and delivery permission. Only named context/test files are sent to Claude. Requires a clean repository, an existing failing regression test, Claude authentication and a pinned Docker verifier image. Node uses ${IMAGE}. Java supports JDK 21 with Gradle 9.4.1 or Maven 3.9.9; prepare-java executes the trusted baseline with network to cache dependencies in a local image. Candidate verification is offline. Alpha never merges PRs, deploys, or edits the original repository. Cost is provider-reported, not an independent billing guarantee.`);
  } else if (action === 'plan') {
    // Planning never opens the Store or launches a model. Supplied drafts remain
    // untrusted and cannot carry authorization or executable command strings.
    const draftIndex = values.indexOf('--draft');
    let draftInput;
    if (draftIndex !== -1) {
      if (!values[draftIndex + 1]) throw Error('--draft requires a JSON file');
      const handle = await open(path.resolve(values[draftIndex + 1]), 'r');
      try {
        if (!(await handle.stat()).isFile()) throw Error('Draft must be a regular file');
        const bytes = Buffer.alloc(160001);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 160000) throw Error('Draft input exceeds limit');
        draftInput = bytes.subarray(0, bytesRead).toString('utf8');
      } finally { await handle.close(); }
      values.splice(draftIndex, 2);
    }
    if (values.length < 1 || values.length > 2) throw Error('plan requires a quoted objective and optional repository, with optional --draft draft.json');
    const result = await planIntent(path.resolve(values[1] ?? '.'), values[0], { draftInput });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'BLOCKED' || result.validation?.status !== 'VALIDATED') process.exitCode = 2;
  } else if (action === 'prepare-java') {
    if (values.length !== 2) throw Error('prepare-java requires contract.json and a clean trusted repository');
    console.log(JSON.stringify(await prepareJava(JSON.parse(await readFile(path.resolve(values[0]), 'utf8')), path.resolve(values[1]), { cancelled: () => interrupted }), null, 2));
  } else if (action === 'doctor') {
    const noAuth = values.includes('--no-auth');
    if (noAuth) values.splice(values.indexOf('--no-auth'), 1);
    if (values.length > 1) throw Error('doctor accepts one contract.json');
    const verification = values.length ? validateContract(JSON.parse(await readFile(path.resolve(values[0]), 'utf8'))).verification : undefined;
    const checks = [];
    for (const [name, exe, argv, env] of [
      ['git', 'git', ['--version'], environment()],
      ['claude', process.platform === 'win32' ? 'claude.exe' : 'claude', ['--version'], environment('provider')],
      ['github', 'gh', ['--version'], environment('delivery')]
    ]) {
      const r = await command(exe, argv, { env }); checks.push({ name, ok: r.exitCode === 0, detail: r.exitCode === 0 ? r.stdout.toString().split('\n')[0].trim() : 'Executable unavailable' });
    }
    const auth = noAuth ? null : await command(process.platform === 'win32' ? 'claude.exe' : 'claude', ['auth', 'status'], { env: environment('provider') });
    let loggedIn = false;
    try { loggedIn = auth.exitCode === 0 && JSON.parse(auth.stdout.toString()).loggedIn === true; } catch {}
    checks.push({ name: 'claude-authentication', ok: noAuth ? null : loggedIn, detail: noAuth ? 'NOT_CHECKED: explicit --no-auth; full Alpha readiness not established' : loggedIn ? 'Authenticated; account identity omitted' : 'Run claude auth login before using the provider' });
    try { await dockerReady(verification); checks.push({ name: 'isolated-verifier', ok: true }); }
    catch (e) { checks.push({ name: 'isolated-verifier', ok: false, detail: e.message }); }
    console.log(JSON.stringify({ node: process.version, platform: process.platform, checks, githubAuthentication: 'Needed only for PR delivery; checked on delivery. This diagnostic never prints account identities or tokens.' }, null, 2));
    if (checks.some(c => c.ok === false)) process.exitCode = 1;
    else if (noAuth) process.exitCode = 2;
  } else {
    store = new Store(directory);
    if (action === 'run') {
      if (values.length !== 2) throw Error('run requires contract.json and repository');
      const contract = JSON.parse(await readFile(path.resolve(values[0]), 'utf8'));
      const run = await createRun(store, path.resolve(values[1]), contract);
      activeId = run.id;
      console.log(`runId: ${run.id}`);
      const result = await execute(store, run.id); console.log(JSON.stringify(result, null, 2));
      if (result.state !== 'COMPLETED') process.exitCode = 2;
    } else if (action === 'resume') {
      if (values.length !== 1) throw Error('resume requires run-id');
      activeId = values[0];
      const result = await execute(store, values[0], {}, { resume: true }); console.log(JSON.stringify(result, null, 2));
      if (result.state !== 'COMPLETED') process.exitCode = 2;
    } else if (['pause', 'cancel'].includes(action)) {
      if (values.length !== 1) throw Error(`${action} requires run-id`);
      store.control(values[0], action); console.log(JSON.stringify(store.get(values[0]), null, 2));
    } else if (action === 'status') {
      if (values.length > 1) throw Error('status accepts one run-id');
      console.log(JSON.stringify(values.length ? { ...store.get(values[0]), events: store.events(values[0]) } : store.list(), null, 2));
    } else if (action === 'report') {
      if (values.length !== 1) throw Error('report requires run-id');
      console.log(JSON.stringify(await runReport(store, values[0]), null, 2));
    } else if (action === 'export') {
      if (values.length !== 2) throw Error('export requires run-id and a new directory');
      const run = store.get(values[0]);
      if (!run.acceptedHash) throw Error('No verified candidate to export');
      const { accepted, evidence } = await verifiedEvidence(store, run);
      const target = path.resolve(values[1]); await mkdir(target); // refuse existing paths
      await writeFile(path.join(target, 'verified-change.json'), JSON.stringify({ runId: run.id, baseCommit: run.base, contractHash: run.contractHash, evidenceHash: run.evidenceHash, ...accepted }, null, 2));
      await writeFile(path.join(target, 'verification.json'), JSON.stringify(evidence, null, 2));
      console.log('Exported local evidence. Review for sensitive source and logs before sharing.');
    } else throw Error(`Unknown command: ${action}`);
  }
} catch (error) { if (action === 'plan') console.log(JSON.stringify({ status: 'BLOCKED', executable: false, error: error.message })); else console.error(error.message); process.exitCode = 1; }
finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); store?.close(); }
