// Collect only public H1 metadata; never copy host settings, credentials or sessions.
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installHost, manageHost } from '../src/hosts/install.mjs';
import { hash } from '../src/alpha/contract.mjs';

const preparation = JSON.parse(await readFile(process.argv[2], 'utf8'));
const discovery = JSON.parse(await readFile(path.join(preparation.root, 'codex-discovery.json'), 'utf8'));
if (discovery.status !== 'HOST_DISCOVERY_VERIFIED_NO_MODEL') throw Error('Review discovery failure before publishing');
const lifecycle = [];
for (const host of ['codex', 'claude']) {
  const repo = await mkdtemp(path.join(tmpdir(), 'codefleet-h1-lifecycle-'));
  await installHost(repo, host);
  const installed = await manageHost(repo, host, 'status');
  const disabled = await manageHost(repo, host, 'disable');
  const enabled = await manageHost(repo, host, 'enable');
  const removed = await manageHost(repo, host, 'remove');
  lifecycle.push({ host, installed, disabled, enabled, removed });
}
const sources = {};
for (const file of ['src/hosts/cli.mjs', 'src/hosts/exchange.mjs', 'src/hosts/install.mjs', 'src/alpha/cli.mjs', 'src/alpha/controller.mjs', 'test/host.test.mjs', 'scripts/host-acceptance-prepare.mjs', 'scripts/host-codex-discovery.mjs', 'scripts/host-acceptance-evidence.mjs']) sources[file] = hash(await readFile(file));
const evidence = { schemaVersion: 1, date: '2026-10-20', modelTurns: 0, fixtureCommits: 0,
  hosts: preparation.hosts.map(h => ({ host: h.host, runtimeExit: h.runtimeExit, skillHash: h.skillHash, contractHash: h.contractHash, baseline: h.baseline, actualSkillInvocation: h.actualSkillInvocation, live: h.live })),
  harnessBaseline: preparation.harnessBaseline, codexDiscovery: discovery,
  claudeDiscovery: 'NOT_RUN_INTERACTIVE_SESSION_REQUIRED', lifecycle, sources };
// Installation operations may include local paths: redact every temporary root.
let json = JSON.stringify(evidence, null, 2);
json = json.replace(/C:\\\\Users\\\\[^"\n]+/gi, '<LOCAL_TEMP_PATH>');
await writeFile('docs/runs/2026-10-20/alpha-h1-source-evidence.json', json + '\n');
console.log('Sanitized H1 evidence written; lifecycle completed for both hosts.');
