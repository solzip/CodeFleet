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

${host === 'codex' ? `
## Codex direct tool bridge (optional, current model session)

If the user separately configured a CodeFleet MCP server bound to this
repository and an explicit State directory OUTSIDE the repository, prefer
its codefleet_goal_start, codefleet_goal_status, codefleet_draft_submit,
codefleet_goal_prepare, codefleet_fileset_propose,
codefleet_fileset_review and codefleet_local_test_review tools. These let this
Codex model advance the existing CodeFleet Task without writing intermediary
JSON files or starting a second Codex model process. Follow the Goal loop
below and read goal_status after every accepted proposal.
With an explicit WORK_REVIEW_V1 MCP launch, goal_start requires CHANGE or
VERIFY_CURRENT mode; goal_status with no Task ID lists persisted work. Use
workReport for current status. Reviews return a complete work-owner-review
command: the Owner reads scope in a separate interactive terminal and types
APPLY or VERIFY. Never type that confirmation on the Owner's behalf. This
profile does not require appending flags or transcribing hashes. Legacy MCP
configuration retains the following legacy Owner command procedure.
After a proposed Fileset, call codefleet_fileset_review to obtain its
current exact reviewRef, reviewHash, file bytes and ownerAction with the
absolute executable, argv and external --state. The argv is intentionally
missing --acknowledge-unisolated; only after independent scope review may
the owner add that flag and run it in their separate trusted terminal. Once
the owner accepts that review through the existing trusted CLI,
refresh codefleet_goal_status. After all dependencies are materialized, call
codefleet_local_test_review for the pinned test command; only a separate
reviewed owner CLI call can execute that test. Never self-accept either review.
No MCP tool approves, executes, edits source, bills, runs tests or certifies
completion. Do not invent such a tool or call other shell operations to
circumvent the missing authority. Exact owner-approved Local reviews remain
separate CLI actions; protected deployment/Owner identity is not provided.
If MCP is not configured, use the normal installed CLI below unchanged.
` : ''}

## Goal-to-verified-result loop (default in the current Host session)

Your job is to advance ONE user Objective to the highest actually verified
outcome, not stop after creating a plan, proposal, fileset or test command.
Use the existing authenticated ${host} session for model reasoning; do not
start another Codex/Claude process or direct model API. Never use a model
reply, status label or pasted success text as independent Evidence.

1. Identify REPOSITORY, an explicit STATE directory outside REPOSITORY,
   scope and acceptance requirements. Ask only for missing choices. Create
   one Task with host ${host} plan "goal" REPOSITORY. For EXISTING_LOCAL
   explicitly add --local-existing --acceptance LOCAL_ONLY only if the user
   chose that trust level; for NEW_PROJECT use its separate Bootstrap contract.
   Preserve the returned TASK_ID, exact base and Task revision.
2. Invoke host ${host} status TASK_ID or objective report TASK_ID after
   EVERY meaningful action. Read its continuation/nextActions and current
   approvals, rather than using a memorized sequence of commands. Continue
   automatically through read-only discovery, bounded proposal generation,
   eligible DAG dependencies and post-effect status inspection.
3. When the next step needs a Host proposal, use THIS model/session to produce
   the exact structured Draft or scoped Fileset against the current source.
   Submit using host ${host} draft/files; never fabricate a provider receipt.
   After each accepted predecessor, refresh status and bind the next proposal
   to the new current revision and accepted source.
4. When the next step needs files, source writes, test commands, revisions or
   billable model calls, FIRST show the exact current review scope, changed
   bytes/argv, uncertainty and cost to the user. Pause for explicit permission
   where the contract requires it; do not self-approve, synthesize an actor
   identity, or treat this Skill or a previous grant as an authorization.
   Use only the existing reviewed one-use objective local-files-review/accept
   and local-review/accept paths in the supervised LOCAL_ONLY profile.
5. Following every authorized local action, re-read persistent state and
   current target bytes. A LOCAL_FAILED verification may lead to ONE reviewed
   failed-Evidence-bound repair proposal within the existing budget. If no
   progress, budget exhausted, ambiguous effects, changed approval/revision,
   unavailable Host capability or cancelled work: STOP with the concrete
   blocked reason. Do not replay a reservation, reset state or weaken tests.
6. Stop as successful ONLY when objective report TASK_ID has current-tree
   acceptance.complete=true / COMPLETE_LOCAL (explicitly UNPROTECTED), or
   separate real PROTECTED Evidence and an independently verified Judge
   satisfy a protected contract. A WorkItem success, proposal, fake Host
   reply, Candidate artifact or green isolated test is NOT Objective completion.
   Never equate synthetic CI tests with an actual ${host} model Turn.

For an already persisted Codex Planning/Workflow, start with the read-only
objective codex-goal-progress SESSION_ID or workflow-progress WORKFLOW_ID,
then use the existing exact reviewed Workflow/Operator path. The plain CLI
run-codex-goal is blocked without a genuine authenticated Host admission.
Do NOT bypass it by importing internal facades or passing fake callbacks.
A pause for necessary owner approval is not a completed Objective.

Default Host-Native preparation (no Docker, WSL, separate OS account or API key):
resolve CLI to runtime/alpha/cli.mjs relative to this Skill. Run node CLI --state
STATE host ${host} plan "goal" REPOSITORY, then status TASK_ID. STATE is a local
preparation directory, never the protected Operator state. Keep the existing Host
model, authentication and session. Read/search only within actual Host permissions.
Skill instructions do not enforce isolation. Host reports are untrusted proposals.
For an explicitly requested Local-only new-project contract, add --acceptance
LOCAL_ONLY to plan. Omission preserves PROTECTED_REQUIRED. This creation-only
choice does not authorize files, commands or downgrade an existing Task.
${host === 'codex' ? `
Windows Codex command recovery: start within normal Host permissions.
For GIT_OWNERSHIP, stop with BLOCKED_ENVIRONMENT; do not automatically escalate.
Host approval and sandbox selection do not prove the actual execution identity.
With user authorization, check official MXC compatibility once using:
codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK
If supported, consistently launch scoped CodeFleet commands through the official
MXC path, retaining managed policy: codex -c windows.sandbox=mxc sandbox
--include-managed-config --permission-profile :workspace -- node CLI ...
Run host codex doctor --repository REPOSITORY in that actual path before requesting
expiring Fileset or Local approval. Keep the same path for approved application
and tests; recheck contract, candidate, capability, leases and uncertain effects
after any context change. Never issue your own approval or migrate an old Task.
If MXC is unavailable, discuss unelevated with the user: weaker network isolation
and no denied-read-path support. No automatic fallback or configuration changes.
For PROCESS_SPAWN_DENIED only, use the existing Codex execution tool's
command-specific approval: sandbox_permissions="require_escalated" with a justification
naming the exact node CLI command, explicit --state, repository/task and purpose.
This is a Host tool argument, never a CLI flag. Do not grant yourself permission,
change sandbox settings, safe.directory, ownership or ACLs, or request a blanket
node/shell allow rule. The Host must approve execution; if its policy denies or
does not expose that interface, stop and report BLOCKED with the tool error.
Check the Task contract and requested action independently. Host permission is
not CodeFleet fileset/workflow approval, a capability, or Local/Protected evidence.
Use an explicit writable preparation STATE outside REPOSITORY, not the default
home directory or protected Operator state. Keep the same STATE for every call.
After a failure, retain stdout, stderr, exit code and any task id; query status
before retrying. A recorded BLOCKED plan remains recorded: create a new plan only
after confirming no execution/model attempt occurred. Never blindly replay a
mutation or escalate requests/submit/run/resume, approve, clarify or materialize
to bypass their gates. An objective unknown needs the user's explicit scope
clarification through the existing operator contract, not a planner assertion.
` : ''}


${host === 'codex' ? `
Codex managed Goal recovery (read-only; separate from staged host codex plan):
Use node CLI --state STATE objective codex-goals [--offset N] to discover
persisted Planning session IDs after a Host restart. Keep STATE unchanged
and outside the repository; an index entry is not an execution approval.
For an existing Planning SESSION_ID, run node CLI --state STATE objective
codex-goal-progress SESSION_ID --repository ABSOLUTE_PATH. A nonzero exit
may mean the Objective is incomplete: inspect its JSON status and handoff,
never retry a write or assume the returned Objective was accepted.
For a VALIDATED plan awaiting review, use objective review-codex-plan
SESSION_ID --repository ABSOLUTE_PATH, inspect the exact Contract/DAG and
source hash, then request an explicit user decision before any
prepare-codex-workflow SESSION_ID --repository ABSOLUTE_PATH --hash
WORKFLOW_HASH --source-hash SOURCE_CONTRACT_HASH. Preparing persists an
UNAPPROVED Workflow only; it is not a Host Turn or Operator authorization.
For an existing Workflow, review with objective review-codex-workflow
WORKFLOW_ID --repository ABSOLUTE_PATH. Inspect persisted recovery via
codex-goal-progress and workflow-progress; an uncertain Attempt must be
reconciled and a failed Attempt needs separately approved Repair.
For a NEW_PROJECT Bootstrap TASK_ID (not a Planning SESSION_ID), use
objective codex-bootstrap-progress TASK_ID to inspect Fileset, dependent
local checks and Repair handoff without writing destination files.
Do not convert LOCAL_PASSED into Objective COMPLETE.
The installed Skill does NOT supply the trusted createCodexAdmission,
authenticated Operator, managed Host execution grant or cost approval.
Never invoke plan-codex-goal, run-codex-goal, resume-codex-goal or
advance-codex-bootstrap as if plain CLI/Skill text could authorize them.
These require an independently provisioned trusted Host embedding.
` : ''}

For an existing Git project, explicitly select host ${host} plan "goal" REPOSITORY
--local-existing --acceptance LOCAL_ONLY. This snapshots current files and dirty
state; it does not initialize Git or overwrite uncommitted work. ExistingLocalDraft
uses the BootstrapDraft fields with kind ExistingLocalDraft. plannedTests are
existing immutable acceptance inputs, not owned writes. Use ExistingLocalDraft
schemaVersion 2 for declared general text sources, with separate WorkItems for
creation and replacement. Submit baseSha256 from the recorded snapshot for
existing files, or explicit null for absent files. Version 1 retains its original
existing src/*.mjs-only contract. Never mix creation and replacement in one item.
After host files, use objective local-files-review TASK ITEM; show the exact files
and review hash to the user. Only with user approval and Host execution permission
call objective local-files-accept REF --trust HASH --acknowledge-unisolated.
This is supervised same-user Local trust, NOT authenticated public delegation.
Query recover/status after each item, then generate the next eligible proposal
using the current Host model. Do not launch a nested model without authorization.
Use local-review/local-accept for the exact current-candidate verification.
PUBLIC_DELEGATION_BLOCKED remains until a trusted external approval transport is connected.

Use review TASK_ID --files PATHS --tests PATHS --criterion TEXT for explicit scope,
or draft TASK_ID FILE for {revision,proposal:{draft,references,inferences}}.
Draft fields: schemaVersion:2, objective (original), base, files, tests, criteria,
risks, unknowns, effects. Each criterion has description, method:"protected-tests",
tests; each reference has path, one-based line, exact quote. No approval/evidence fields.
Then prepare TASK_ID, workflow TASK_ID, explain TASK_ID, approval-request TASK_ID.
These commands create/review plans and DAGs only, never execute or grant approval.
The strict H6 codefleet-plan isolated profile remains a separate mode.

If status shows contractKind NEW_PROJECT (unborn HEAD, README-only or non-Git
directory), draft takes {revision,proposal:BootstrapDraft} instead: schemaVersion:1,
kind:"BootstrapDraft", objective (original), probeRef (plan.probe.probeHash),
requirements, openQuestions, decisions [{topic,choice,alternatives,rationale}],
plannedFiles [{path,purpose}], plannedTests [{path,criteria}], criteria
[{id,description,tests}], scope {includes,excludes}, risks, workItems
[{id,kind,dependencies,acceptanceCriteria,files}]. Planned files do not exist yet:
never cite lines or claim tests ran. After prepare, files TASK_ID FILE proposes
{revision,itemId,files:[{path,content}]} for one local-edit item and only requests
review. When status shows a local-verification item LOCAL_FAILED, a repair is
{revision,itemId,repair:{verificationItem,evidenceRef},files:[{path,content,baseSha256}]}
for a materialized item it depends on, baseSha256 being the digest CodeFleet recorded.
Never run git init, approve, materialize or verify without the user's applicable
explicit authorization; git commit is outside this workflow.
If the user explicitly authorizes project initialization, the Host may perform
that bounded setup before planning. Present exact Fileset hashes and contents
for user approval, then use the existing supervised objective approve/materialize
commands only with that approval. Never issue consent as an Agent or use actor
strings as authentication. Fileset proposals may be reviewed together, but
materialization must still follow DAG dependencies. Keep the existing Host session
for code generation; a nested model subprocess is not required.

Supervised Native Local continuation (separate from Protected IPC):
Prefer objective local-review TASK_ID REQUEST.json [REPAIR.json]. CodeFleet
generates and stores revision, request ID and expiry; show the returned scope and
reviewHash to the user. After exact user approval and Host command permission,
use objective local-accept REVIEW_REF --trust REVIEW_HASH --acknowledge-unisolated.
Use the returned identifiers directly; never ask the user to construct packets.
This remains supervised same-user Local execution, not authenticated delegation.
Before a session handoff or context compaction, retain the JSON output of
objective recover TASK_ID for a prepared Objective outside the project source.
After resuming, pass that unchanged output to objective recover TASK_ID RECOVERY.json.
Inspect synchronization, blockers, current work items, budget and uncertain effects
before proposing the next action. A changed checkpoint requires fresh review;
never edit it to hide a mismatch or replay completed work. This is context comparison,
not user authentication or an automatic contract migration. If no checkpoint exists,
inspect persisted state with recover and do not claim continuity was verified.
For requirement changes, read the current draft and prepare {revision,draft} with
objective revision-review TASK_ID PROPOSAL.json. Show the affected/preserved items,
fixed tests, unchanged budgets and exact review hash to the user. Only after
explicit supervised consent use objective revision-accept REVIEW_REF --trust HASH
--acknowledge-unisolated. This changes the contract, not execution authority:
new Fileset and command reviews are still required. Never self-approve. Active
leases, uncertain effects and unresolved failures must be reconciled first.
Use objective revision-revoke REVIEW_REF to withdraw a pending contract review.
If interrupted, run objective recover before any new action. An existing request
is only reconciled/read, never replayed. Prepared artifacts do not grant consent.
Use the installed runtime/alpha/cli.mjs objective local-step TASK_ID REQUEST.json
[REPAIR.json] --revision N --request-id UNIQUE_ID --expires EPOCH_MS to request
review only. REQUEST contains executable (absolute native path), args, directory,
timeoutMs. A repair contains itemId, evidenceRef, hypothesis, diagnostic and
files [{path,baseSha256,content}]. Inspect the returned exact review, including
current and projected command/candidate hashes and remaining budget.
Only after the user explicitly approves this exact review and the Host permits
the command, repeat it with --trust REVIEW_HASH --acknowledge-unisolated.
Never invent consent from your proposal, a JSON actor, or prior approval.
This is same-user LOCAL_EXECUTED / UNPROTECTED, not authenticated Operator or
Protected execution. A new execution requires a fresh reviewed request; on
uncertain delivery retain the same request to read state, never reset budgets.
No model subprocess, direct API key, Docker, WSL or separate account is needed.
If the current contract requires Protected evidence, leave Objective incomplete.
For LOCAL_ONLY, final acceptance currently requires one integrated native Node
command with args --test --test-reporter=tap followed by every criterion test
path explicitly (no filters/globs). Its WorkItem must depend transitively on every
implementation item. Use objective report/recover to read COMPLETE_LOCAL after
current-candidate evidence passes; Local Evidence remains UNPROTECTED. An old
checkpoint does not satisfy a new candidate. Unsupported final coverage stays
incomplete instead of treating an arbitrary successful command as acceptance.

Optional protected execution:
H4 Linux IPC path: use this skill's runtime/hosts/ipc-client.mjs with Node 24.14.1 or newer. Resolve CLIENT relative to this SKILL.md. A trusted operator administrator must supply SOCKET and RUN_ID for an already validated, fixed-scope workflow. Never start an Operator process as the Agent, change the catalog, or open trusted state. Windows Native, WSL2 deployment and live Host confinement remain BLOCKED/unverified. Do not use internal modules or legacy objective approve to bypass this gate.

Call node CLIENT SOCKET METHOD PARAMS_JSON REQUEST_ID. Use a unique UUID for each action; retain the same ID and identical body on uncertain delivery. Quote each argument for the current shell. Both hosts use the same protocol; host below is ${host}. IPC authenticates kernel UID, not this label.

1. propose {runId:RUN_ID,goal:"user goal"} records an untrusted request only. plan {runId:RUN_ID} returns the existing contract, hash, DAG and role assignments. New scope requires trusted provisioning; the Agent cannot activate its own task or grant.
2. requests {runId:RUN_ID,host:"${host}"} returns bounded WorkItem context. Using the current host model/session, propose edits only. Do not edit the repository, protected tests, Harness, keys or ledger. Do not copy host credentials, session IDs, transcripts or environment. Do not launch model subprocesses or direct APIs.
3. submit {runId:RUN_ID,host:"${host}",response:{requestId,bindingHash,proposal:{summary,edits:[{path,oldText,newText}]}}}. Host reports are PROVIDER_REPORTED_ONLY. Do not submit execution evidence or completion claims.
4. approval-request {runId:RUN_ID,itemId:ITEM_ID} requests review only. H4 cannot attest human input: risky execution stays BLOCKED even when a process runs under an Operator UID. Never call approve/decide/revoke yourself.
5. execute {runId:RUN_ID,host:"${host}"} starts permitted confined work through the existing Harness. ACCEPTED is not completion. Poll result or status {runId:RUN_ID}. verify {runId:RUN_ID} rechecks existing evidence; it does not accept supplied evidence. Only complete=true with VERIFIED evidence may be reported as verified.
6. pause/cancel {runId:RUN_ID}; resume {runId:RUN_ID,host:"${host}"} rechecks the existing contract and Lease. Unconfirmed attempts require reconciliation, never replay.

Single-agent reasoning is the default. For supervised Local source proposals, use
objective proposal-batch TASK_ID [OPTIONS.json]. OPTIONS may specify maxAgents
(1..3) and parallelBenefit; without a concrete benefit it selects one item.
The batch uses the existing DAG/resource selection and binds all requests to one
candidate/context. It grants NO model invocation or execution permission.
With separate user permission and actual Host Subagent support, assign each
batch only once: record objective proposal-start TASK_ID BATCH.json before
invocation. This records a pending handoff, not permission or invocation proof.
Assign each
request to a proposal-only agent: owned files, fixed tests, dependencies and
acceptance criteria are in the request. Agents return text, never edit shared
project files or run approval/test commands. Retain actual Host agent IDs and
dispatch/return observations separately; reported identities are not proof.
Use objective proposal-results TASK_ID BATCH.json RESULTS.json where each result
is {itemId,agentId,files,feedback}; existing-file entries retain baseSha256.
This validates every result before recording proposal feedback in the Work Log.
Submit reviewed proposals serially through the existing files route, refreshing
Task revision each time. Recheck context and stop on unexpected changes; approve
and materialize exact filesets only through supervised review. Then verify the
integrated candidate through Native Local Reservation and Evidence/Judge.
After interruption recover the Objective and inspect actual Host agents before
any redispatch; proposal packets/feedback are not resumable execution grants.
Planner, Architect, Executor and Reviewer are roles, not proof of separate agents.
Automatic host delegation remains NOT_VERIFIED. If independent UID, protected
code/state or Harness capabilities are unavailable, report protected execution
BLOCKED; preparation stays available.

Legacy local plan/review/prepare tooling remains preparation-only; public legacy requests/submit/run/resume remain blocked. No API key is needed by IPC. Host subscription limits apply; host session cost is unknown. Installing this Skill does not install or attest the trusted service. Do not bypass host permissions or CodeFleet approval gates.
`;
}
export async function installHost(project, host, { planning = false } = {}) {
  const target = await destination(project, host, true, planning);
  // Exclusive directory creation: never overwrite an existing skill.
  await mkdir(target);
  const files = { 'SKILL.md': planning ? planningSkill(host) : skill(host), LICENSE: await readFile(path.join(root, 'LICENSE'), 'utf8') };
  if (!planning) for (const name of await regularTree(path.join(root, 'src'))) files['runtime/' + name] = await readFile(path.join(root, 'src', name));
  // src/README maps the source checkout; its parent documentation is not installed.
  if(!planning) files['runtime/README.md']='# CodeFleet installed runtime\n\nRun alpha/cli.mjs with Node 24.14.1 or newer. See ../SKILL.md for supervised usage.\n\nLicense: [MIT](../LICENSE).\n';
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
