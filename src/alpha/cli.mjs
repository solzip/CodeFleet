#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Store } from './store.mjs';
import { createRun, execute } from './controller.mjs';
import { command, requireSuccess, environment } from './process.mjs';
import { dockerReady } from './verifier.mjs';
import { IMAGE } from './contract.mjs';

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
const interrupt = () => { if (store && activeId) store.control(activeId, 'cancel'); };
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
try {
  if (!action || ['help', '--help'].includes(action)) {
    console.log(`CodeFleet experimental alpha — test-driven Node changes\n\n  codefleet-alpha doctor\n  codefleet-alpha run <contract.json> <repository>\n  codefleet-alpha resume <run-id>\n  codefleet-alpha pause|cancel <run-id>\n  codefleet-alpha status [run-id]\n  codefleet-alpha export <run-id> <directory>\n\nOptional: --state <local-state-directory>\n\nRun grants the explicit contract scope and delivery permission. Only named context/test files are sent to Claude. Requires a clean repository, an existing failing Node regression test, Claude authentication and Docker image ${IMAGE}. Alpha does not install dependencies, merge PRs, deploy, or edit the original repository. Cost is provider-reported, not an independent billing guarantee.`);
  } else if (action === 'doctor') {
    const checks = [];
    for (const [name, exe, argv, env] of [
      ['git', 'git', ['--version'], environment()],
      ['claude', process.platform === 'win32' ? 'claude.exe' : 'claude', ['--version'], environment('provider')],
      ['github', 'gh', ['--version'], environment('delivery')]
    ]) {
      const r = await command(exe, argv, { env }); checks.push({ name, ok: r.exitCode === 0, detail: r.exitCode === 0 ? r.stdout.toString().split('\n')[0].trim() : 'Executable unavailable' });
    }
    const auth = await command(process.platform === 'win32' ? 'claude.exe' : 'claude', ['auth', 'status'], { env: environment('provider') });
    let loggedIn = false;
    try { loggedIn = auth.exitCode === 0 && JSON.parse(auth.stdout.toString()).loggedIn === true; } catch {}
    checks.push({ name: 'claude-authentication', ok: loggedIn, detail: loggedIn ? 'Authenticated; account identity omitted' : 'Run claude auth login before using the provider' });
    try { await dockerReady(); checks.push({ name: 'isolated-verifier', ok: true }); }
    catch (e) { checks.push({ name: 'isolated-verifier', ok: false, detail: e.message }); }
    console.log(JSON.stringify({ node: process.version, platform: process.platform, checks, githubAuthentication: 'Needed only for PR delivery; checked on delivery. This diagnostic never prints account identities or tokens.' }, null, 2));
    if (checks.some(c => !c.ok)) process.exitCode = 1;
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
      if (store.get(values[0]).state === 'CANCELLED') throw Error('Cancelled runs cannot resume; create a new contract');
      store.control(values[0], 'run');
      activeId = values[0];
      const result = await execute(store, values[0]); console.log(JSON.stringify(result, null, 2));
      if (result.state !== 'COMPLETED') process.exitCode = 2;
    } else if (['pause', 'cancel'].includes(action)) {
      if (values.length !== 1) throw Error(`${action} requires run-id`);
      store.control(values[0], action); console.log(JSON.stringify(store.get(values[0]), null, 2));
    } else if (action === 'status') {
      if (values.length > 1) throw Error('status accepts one run-id');
      console.log(JSON.stringify(values.length ? { ...store.get(values[0]), events: store.events(values[0]) } : store.list(), null, 2));
    } else if (action === 'export') {
      if (values.length !== 2) throw Error('export requires run-id and a new directory');
      const run = store.get(values[0]);
      if (!run.acceptedHash) throw Error('No verified candidate to export');
      const accepted = store.readArtifact(run.acceptedHash); const evidence = store.readArtifact(run.evidenceHash);
      const target = path.resolve(values[1]); await mkdir(target); // refuse existing paths
      await writeFile(path.join(target, 'verified-change.json'), JSON.stringify({ runId: run.id, baseCommit: run.base, contractHash: run.contractHash, evidenceHash: run.evidenceHash, ...accepted }, null, 2));
      await writeFile(path.join(target, 'verification.json'), JSON.stringify(evidence, null, 2));
      console.log('Exported local evidence. Review for sensitive source and logs before sharing.');
    } else throw Error(`Unknown command: ${action}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); store?.close(); }
