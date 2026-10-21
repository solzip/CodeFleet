import { lstat, mkdir, readdir, readFile, writeFile, rename, unlink, rmdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../alpha/contract.mjs';
import { hostIdentity } from './exchange.mjs';
import { planningSkill } from './planning.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
async function regularTree(directory, prefix = '') {
  const files = [];
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name), stat = await lstat(file);
    if (stat.isSymbolicLink()) throw Error('Symlink in installation tree');
    if (stat.isDirectory()) files.push(...await regularTree(file, prefix + name + '/'));
    else if (stat.isFile()) files.push(prefix + name);
    else throw Error('Non-regular installation entry');
  }
  return files.sort();
}
async function destination(project, host, create = false, planning = false) {
  hostIdentity(host);
  const base = await realpath(project);
  let current = base;
  for (const name of [host === 'codex' ? '.agents' : '.claude', 'skills']) {
    current = path.join(current, name);
    if (create) await mkdir(current).catch(e => { if (e.code !== 'EEXIST') throw e; });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Unsafe install parent');
  }
  return path.join(current, planning ? 'codefleet-plan' : 'codefleet');
}
function skill(host) {
  return `---
name: codefleet
description: Plan, review and independently verify scoped development work through CodeFleet in the current host session.
---

# CodeFleet

Default Host-Native preparation (no Docker, WSL, separate OS account or API key):
resolve CLI to runtime/alpha/cli.mjs relative to this Skill. Run node CLI --state
STATE host ${host} plan "goal" REPOSITORY, then status TASK_ID. STATE is a local
preparation directory, never the protected Operator state. Keep the existing Host
model, authentication and session. Read/search only within actual Host permissions.
Skill instructions do not enforce isolation. Host reports are untrusted proposals.

Use review TASK_ID --files PATHS --tests PATHS --criterion TEXT for explicit scope,
or draft TASK_ID FILE for {revision,proposal:{draft,references,inferences}}.
Draft fields: schemaVersion:2, objective (original), base, files, tests, criteria,
risks, unknowns, effects. Each criterion has description, method:"protected-tests",
tests; each reference has path, one-based line, exact quote. No approval/evidence fields.
Then prepare TASK_ID, workflow TASK_ID, explain TASK_ID, approval-request TASK_ID.
These commands create/review plans and DAGs only, never execute or grant approval.
The strict H6 codefleet-plan isolated profile remains a separate mode.

Optional protected execution:
H4 Linux IPC path: use this skill's runtime/hosts/ipc-client.mjs with Node 24.14.1 or newer. Resolve CLIENT relative to this SKILL.md. A trusted operator administrator must supply SOCKET and RUN_ID for an already validated, fixed-scope workflow. Never start an Operator process as the Agent, change the catalog, or open trusted state. Windows Native, WSL2 deployment and live Host confinement remain BLOCKED/unverified. Do not use internal modules or legacy objective approve to bypass this gate.

Call node CLIENT SOCKET METHOD PARAMS_JSON REQUEST_ID. Use a unique UUID for each action; retain the same ID and identical body on uncertain delivery. Quote each argument for the current shell. Both hosts use the same protocol; host below is ${host}. IPC authenticates kernel UID, not this label.

1. propose {runId:RUN_ID,goal:"user goal"} records an untrusted request only. plan {runId:RUN_ID} returns the existing contract, hash, DAG and role assignments. New scope requires trusted provisioning; the Agent cannot activate its own task or grant.
2. requests {runId:RUN_ID,host:"${host}"} returns bounded WorkItem context. Using the current host model/session, propose edits only. Do not edit the repository, protected tests, Harness, keys or ledger. Do not copy host credentials, session IDs, transcripts or environment. Do not launch model subprocesses or direct APIs.
3. submit {runId:RUN_ID,host:"${host}",response:{requestId,bindingHash,proposal:{summary,edits:[{path,oldText,newText}]}}}. Host reports are PROVIDER_REPORTED_ONLY. Do not submit execution evidence or completion claims.
4. approval-request {runId:RUN_ID,itemId:ITEM_ID} requests review only. H4 cannot attest human input: risky execution stays BLOCKED even when a process runs under an Operator UID. Never call approve/decide/revoke yourself.
5. execute {runId:RUN_ID,host:"${host}"} starts permitted confined work through the existing Harness. ACCEPTED is not completion. Poll result or status {runId:RUN_ID}. verify {runId:RUN_ID} rechecks existing evidence; it does not accept supplied evidence. Only complete=true with VERIFIED evidence may be reported as verified.
6. pause/cancel {runId:RUN_ID}; resume {runId:RUN_ID,host:"${host}"} rechecks the existing contract and Lease. Unconfirmed attempts require reconciliation, never replay.

Single-agent reasoning is the default. Planner, Architect, Executor and Reviewer are WorkItem roles, not proof of separate agents. Automatic host delegation and Host Live execution are NOT_RUN. If independent UID, protected code/state or Harness capabilities are unavailable, report protected execution BLOCKED; preparation stays available.

Legacy local plan/review/prepare tooling remains preparation-only; public legacy requests/submit/run/resume remain blocked. No API key is needed by IPC. Host subscription limits apply; host session cost is unknown. Installing this Skill does not install or attest the trusted service. Do not bypass host permissions or CodeFleet approval gates.
`;
}
export async function installHost(project, host, { planning = false } = {}) {
  const target = await destination(project, host, true, planning);
  // Exclusive directory creation: never overwrite an existing skill.
  await mkdir(target);
  const files = { 'SKILL.md': planning ? planningSkill(host) : skill(host), LICENSE: await readFile(path.join(root, 'LICENSE'), 'utf8') };
  if (!planning) for (const name of await regularTree(path.join(root, 'src'))) files['runtime/' + name] = await readFile(path.join(root, 'src', name));
  const inventory = {};
  for (const [name, body] of Object.entries(files)) {
    const dest = path.join(target, name); await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body, { flag: 'wx' }); inventory[name] = hash(Buffer.isBuffer(body) ? body : Buffer.from(body));
  }
  await writeFile(path.join(target, 'installation.json'), JSON.stringify({ schemaVersion: 1, host, files: inventory }, null, 2), { flag: 'wx' });
  return { host, status: 'INSTALLED_OFFLINE', liveValidation: 'NOT_RUN', invocation: (host === 'codex' ? '$' : '/') + (planning ? 'codefleet-plan' : 'codefleet') };
}
export async function manageHost(project, host, action, { planning = false } = {}) {
  if (!['enable', 'disable', 'remove', 'status'].includes(action)) throw Error('Unknown install action');
  const target = await destination(project, host, false, planning), stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Unsafe installation target');
  const names = await regularTree(target);
  const receipt = JSON.parse(await readFile(path.join(target, 'installation.json'), 'utf8'));
  if (receipt.schemaVersion !== 1 || receipt.host !== host || !receipt.files || !Object.hasOwn(receipt.files, 'SKILL.md')) throw Error('Invalid installation receipt');
  const disabled = names.includes('SKILL.disabled.md');
  const expected = Object.keys(receipt.files).map(n => n === 'SKILL.md' && disabled ? 'SKILL.disabled.md' : n).concat('installation.json').sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw Error('Installation modified; preserve and review manually');
  for (const name of names.filter(n => n !== 'installation.json')) {
    if (hash(await readFile(path.join(target, name))) !== receipt.files[name === 'SKILL.disabled.md' ? 'SKILL.md' : name]) throw Error('Installation modified; preserve and review manually');
  }
  if (action === 'disable' && !disabled) await rename(path.join(target, 'SKILL.md'), path.join(target, 'SKILL.disabled.md'));
  if (action === 'enable' && disabled) await rename(path.join(target, 'SKILL.disabled.md'), path.join(target, 'SKILL.md'));
  if (action === 'remove') {
    // Verified exact target; remove only inventoried regular files, never recurse
    // through a link or delete the user's .agents/.claude directories.
    for (const name of names) await unlink(path.join(target, name));
    const prune = async dir => { for (const entry of await readdir(dir)) await prune(path.join(dir, entry)); await rmdir(dir); };
    await prune(target);
  }
  return { host, status: action === 'status' ? disabled ? 'DISABLED' : 'ENABLED' : action.toUpperCase(), liveValidation: 'NOT_RUN' };
}
