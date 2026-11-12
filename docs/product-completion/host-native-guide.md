# CodeFleet inside Codex and Claude Code

For Docker-free planning, semantic draft intake, Workflow/DAG inspection,
request-only approval, separate Doctor readiness and explicit-trust Local
Verification, follow the [Host-Native core guide](host-core-guide.md).
The protected execution gates below remain in force; H6 isolation is optional
for basic preparation and mandatory only for its strict profile.

CodeFleet's default integration direction is Host-Native. Use the AI in your existing authenticated host to prepare proposals; CodeFleet owns contracts, scheduling and independent verification. The staged integration is offline tested, not live certified. Automated host tools and automatic delegation remain blocked/unverified.

**H2 gate:** public Host `requests`, `submit`, `run` and `resume` now return BLOCKED before opening state. The trusted Operator broker has no supported production OS/IPC deployment. Neither `--actor` nor a fake signed approval enables execution. The examples below describe the staged protocol; its execution portion is currently available only to internal offline fixtures. Do not invoke legacy commands or import internal modules to bypass this gate. See the [authorization boundary](../implementation/operator-authorization.md).

H4 adds the [Linux IPC client and restricted Harness connection](../implementation/host-ipc.md). Installed Skills now use that versioned client for provisioned fixed-scope runs. The legacy commands below remain blocked preparation/protocol examples. Actual human input, live Host confinement and arbitrary new scope activation remain BLOCKED. H3 assignment and authorization history is preserved.

## Codex MCP direct proposals (optional, without nested model calls)

Codex CLI supports local stdio MCP servers. For an explicitly selected
existing Git repository, install the normal CodeFleet Skill and **separately**
register the installed CodeFleet server in your trusted Codex environment:

```text
codex mcp add codefleet -- node ABS_PROJECT/.agents/skills/codefleet/runtime/hosts/codex-mcp.mjs --state ABS_EXTERNAL_STATE --repository ABS_PROJECT --acceptance LOCAL_ONLY
codex mcp list
```

Replace the placeholders with absolute OS paths. `LOCAL_ONLY` is an explicit
user-controlled **creation-time acceptance policy**, not an execution or
permission grant. Omit `--acceptance LOCAL_ONLY` to preserve the default
`PROTECTED_REQUIRED` policy. Do not have Codex silently choose a weaker
acceptance profile. Codex config changes are **manual**; installing the Skill
does not modify Codex's global MCP configuration. Use the existing Codex
session's `/mcp` or tool list after reloading as needed.

The server exposes `codefleet_goal_start`, `codefleet_goal_status`,
`codefleet_draft_submit`, `codefleet_goal_prepare`, and
`codefleet_fileset_propose`, `codefleet_fileset_review`, and
`codefleet_local_test_review`. The model can submit its own structured
Draft/Fileset proposals and inspect durable Task state without launching a
second Codex model process or writing intermediate JSON files. All fileset
proposals remain **unapplied**. The MCP review tools prepare and expose
exact file bytes or the pinned Node test command, an expiring `reviewRef`,
`reviewHash`, and the corresponding **owner-only CLI action**. The model
cannot change the selected test command or the Task acceptance policy.
The owner must independently inspect and accept the exact review through
`objective local-files-accept` or `objective local-accept`, using the same
external State directory. **CodeFleet MCP never accepts those reviews,
executes commands, or uses an MCP tool invocation as human consent.**
After an owner action the model can read `codefleet_goal_status` to continue
until the delivered Objective is independently `COMPLETE_LOCAL`.
The server has **no** approve, execution, testing, direct model invocation,
provider credential, deployment, or public Operator grant tool. Its project
root and external State location are fixed at startup, not chosen by MCP
request arguments. An MCP process under the same OS user is **not** independent
Owner authentication or OS sandbox confinement.

The bundled CI exercise uses synthetic model-authored proposal JSON and
real CodeFleet Store/contract handling. It does not demonstrate a real Codex
model Turn or authorized unattended Host Live execution. The ordinary
supervised Local path remains available if MCP is not configured.


### Official Codex CLI compatibility acceptance (without a model Turn)

The CI gate **Codex CLI compatibility (nonbillable)** installs the pinned
\`@openai/codex@0.167.1\` client and invokes its real \`mcp add\`,
\`mcp get --json\`, \`mcp list --json\` and \`mcp remove\` commands with a
disposable \`CODEX_HOME\`. It then starts the *exact stdio command recorded
by Codex* to test MCP initialization, the seven proposed/read-only tools,
Goal persistence and unchanged target source. The fixture's repository, Home
and CodeFleet State are independent temporary paths (including spaces).
No \`codex exec\`, authentication, nested model process, owner approval,
host tool effects or subscription usage is performed.

To verify a user installation manually, first install the reviewed CodeFleet
Skill in the selected repository and register the server as above, then run:

\`\`\`text
codex mcp get codefleet --json
codex mcp list --json
\`\`\`

Check that the entry's exact \`transport.command\` and \`transport.args\`
point to the installed \`runtime/hosts/codex-mcp.mjs\`, the intended
external \`--state\`, exact \`--repository\` and the owner-selected
acceptance policy. Use \`/mcp\` inside Codex to inspect tools available to
the current authenticated session. Registration alone is **not** a real
model-authored Objective acceptance.

### Real Codex model Turn acceptance — explicit Owner opt-in

CodeFleet includes a **one-turn, no-automatic-retry acceptance runner** for
an authenticated Codex CLI **0.167.1** installation. This is intended to
cross the final boundary between a model-free MCP smoke and an actual
model-authored, CodeFleet-reviewed development Objective.

It does **not** copy credentials, alter global Codex MCP settings, execute
the user's existing project, create Owner approvals, weaken protected tests,
or grant a model direct source writes. It creates an exclusively new,
disposable Git fixture with a pinned Todo test and an external CodeFleet
State directory.

From a reviewed CodeFleet checkout or installed package, run with Node 24.14.1+
and a new absolute directory outside any valuable project:


```text
node scripts/codex-live-acceptance.mjs prepare --dir ABS_NEW_FIXTURE
node scripts/codex-live-acceptance.mjs status --dir ABS_NEW_FIXTURE
node scripts/codex-live-acceptance.mjs preflight --dir ABS_NEW_FIXTURE
```

The nonbillable `preflight` checks the pinned fixture, exact CLI version,
clean source and official `codex login status` before reserving any model
Turn. A blocked login leaves `turn-intent.json` absent. It neither logs
credentials nor proves independent Owner identity, usable subscription quota
or a USD budget cap. The expected readiness indicator is
`READY_FOR_EXPLICIT_OWNER_MODEL_APPROVAL`.

Only if an authenticated **Codex CLI 0.167.1** is accessible, the Owner
explicitly chooses to spend an unknown amount of subscription usage, and
accepts that this script **does not enforce a USD cap**, run **once**:


```text
node scripts/codex-live-acceptance.mjs run --dir ABS_NEW_FIXTURE --allow-model-turn --acknowledge-unknown-cost
```

The runner constructs `codex exec --json --ephemeral --ignore-user-config
--sandbox read-only` with per-command `-c mcp_servers.codefleet_live`
overrides. Authentication is taken from the user's existing Codex CLI login; this starts a separate, explicitly authorized Codex process;
the runner neither copies nor saves tokens. It records a **durable one-shot
intent before spawn**, hashes stdout/stderr without persisting raw transcripts,
observes the Codex-reported Thread, Turn and successful CodeFleet MCP calls,
and independently checks for an eligible Fileset proposal in CodeFleet
State. Crashes, denied permissions, uncertain effects, rejected model
proposals and nonzero exits are **HUMAN_RECONCILIATION_REQUIRED**. Re-running
the same intent is refused, even after a failed call. Each new attempt
requires a fresh fixture and deliberate Owner approval.

Once the real Codex proposal has ended successfully, request a review:


```text
node scripts/codex-live-acceptance.mjs review --dir ABS_NEW_FIXTURE
```

The resulting `ownerAction` contains an absolute Node executable and
the exact CLI argv, review reference, hash, scope and external State path.
It is deliberately *not* an executable approval: the Owner must inspect
the proposed file bytes, and only in a separate trusted terminal append
`--acknowledge-unisolated` to the returned argument list and run it.
The model/MCP server cannot make that decision. After a successful source
Fileset application, run `review` again to prepare the pinned Node test
command, then independently approve that exact second action.

Finally:


```text
node scripts/codex-live-acceptance.mjs status --dir ABS_NEW_FIXTURE
node scripts/codex-live-acceptance.mjs finalize --dir ABS_NEW_FIXTURE
```

`finalize` requires **both** one completed Codex-reported proposal Turn
and CodeFleet's independent current-tree `COMPLETE_LOCAL` based on the
original immutable tests and reviewed Local evidence; unexpected files,
changed Git HEAD or tests, missing evidence and uncertain attempts fail
closed. The verdict is `CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL`,
never an assertion of independently authenticated Owner identity, proved
protected OS confinement or enforced USD spending limits. The runner is
only an acceptance tool, not an arbitrary-task or production autonomous
executor. CI tests its safety gates with an explicitly synthetic executable
and **never invokes a real billable model Turn**.

## Install and manage

Use a trusted CodeFleet checkout with Node 24.14.1 or newer. No npm install or API key is required. From that checkout:

```text
node scripts/host-install.mjs install codex <project-directory>
node scripts/host-install.mjs install claude <project-directory>
node scripts/host-install.mjs status codex <project-directory>
node scripts/host-install.mjs disable codex <project-directory>
node scripts/host-install.mjs enable codex <project-directory>
node scripts/host-install.mjs remove codex <project-directory>
```

For a reviewed local tarball, install into a separate tools directory with
`npm.cmd install --offline --ignore-scripts --no-audit --no-fund PATH_TO_TARBALL`.
Then run `node node_modules/codefleet/scripts/host-install.mjs install codex PROJECT`.
The installer ships in the package; no development checkout is required. This
is a local release-candidate installation, not a claim of npm registry availability.

The same lifecycle commands accept `claude`. Codex gets `.agents/skills/codefleet/SKILL.md`; Claude gets `.claude/skills/codefleet/SKILL.md`. Each skill includes a local runtime snapshot and the MIT license. There are no global settings, hooks, background services or network downloads. Existing skills are never overwritten; removal refuses modified files. To update, review/remove the unchanged old installation and install the new snapshot. Runtime snapshots do not update when the source checkout changes.

Reload/restart the host if needed to discover the installed skill, then invoke `$codefleet` in Codex or `/codefleet` in Claude Code. H1 verified discovery with Codex 0.162.1's actual local `skills/list` loader, including disable/re-enable, without a model turn. The Windows preparation acceptance below also verified loader matches 1/0/1 and the current Codex agent reading/following the installed Skill. This does not certify UI hot reload or Claude live invocation. These are standalone skills; no Claude plugin marketplace is required and no plugin manifest or hook is claimed to have been registered.

Installation adds files: review them under your repository policy before planning;
do not auto-commit. The supervised EXISTING_LOCAL path snapshots HEAD and current
changes, preserves unrelated dirty/untracked files and rejects unexpected changes
to approved targets. Legacy protected paths retain their clean-repository rules.
Keep CodeFleet state and response JSON outside the target repository and outside
host write permissions where possible. Installation checks use disposable
directories, not global host configuration.

## Goal to verified result

### Windows Codex: recover a blocked preparation command

Start with normal Host permissions and an explicit writable `--state STATE`
outside the target repository. Keep that state and trusted runtime throughout.
Do not use the implicit home state or the protected Operator state.

For `GIT_OWNERSHIP` or `PROCESS_SPAWN_DENIED`, the installed Codex Skill now directs
the agent to request approval for the exact CLI command through the existing Host
execution tool: `sandbox_permissions="require_escalated"`, with a justification
naming the command, state and repository/task. These are tool arguments, not
CodeFleet flags. Do not add blanket node/shell rules or change sandbox policy,
Git safe.directory, ownership or ACLs. If approval is denied/unavailable, preserve
the error and remain BLOCKED. Mixed owners of the repository root and `.git` can
still cause refusal even after approval; approval does not repair ownership.

Inspect any recorded Task before another command. A failed plan remains recorded;
after confirming there was no model/execution attempt, create a new plan rather
than resuming the failed one. Do not blindly replay mutations. Check the Task
contract and requested action separately: **Host execution approval never grants
CodeFleet fileset approval, capabilities, Local trust or Protected Verification.**
Objective unknowns still require explicit user scope clarification under the
existing operator contract. Protected `requests/submit/run/resume` remain blocked.

On 2026-10-21, the current Windows Codex 0.162.1 session directly invoked the
installed runtime through Task creation/status, Bootstrap Draft validation,
4-item DAG preparation/status and a 2-file fileset proposal. `plan/draft/prepare/files`
used exact-command Host approvals; status/workflow queries ran in the sandbox.
No operator executed those commands on Codex's behalf. The final proposal was
`REQUEST_ONLY`, with 0 approvals, 0 attempts, verification `NOT_RUN` and no target
files created. The existing Todo project's 120 files remained identical.
See the [measured recovery and regression results](../implementation/host-native.md#windows-codex-preparation-recovery).

This verifies preparation with Host approval, not unrestricted execution inside
the sandbox or protected Host execution. The installed Todo Skill is an older
snapshot and was preserved; review its lifecycle update before using the new
guidance there, or use the corrected trusted checkout runtime with the same state.
In PowerShell append `exit $LASTEXITCODE` when capturing a CLI's exit status:
`prepare/files` intentionally return 2 for a pending approval, not completed work.

In the examples below `CLI` is the trusted checkout's `src/alpha/cli.mjs` or the installed skill's `runtime/alpha/cli.mjs`. Use the same trusted runtime and explicit state directory throughout. `STATE`, `REPO`, `TASK`, `HASH` and response filenames are placeholders. Quote paths for your shell.

```text
node CLI --state STATE host codex plan "Fix subtraction using protected regressions" REPO
node CLI --state STATE host codex review TASK --files src/subtract.js --tests test/subtract.test.js --criterion "Subtraction regression passes"
node CLI --state STATE host codex prepare TASK
node CLI --state STATE host codex approval-request TASK
```

The operator reviews the task, allowed paths, tests, risk, Workflow hash and expiry. The host's approval request changes no approval state. In a trusted operator terminal, after reviewing the actual request:

```text
node CLI --state STATE objective approve TASK --hash HASH --actor operator
```

The host must not execute that operator command itself. An ordinary shared OS account with unrestricted shell access cannot enforce this distinction. Use a human-controlled permission boundary that denies access to operator commands and trusted state; live enforcement must be verified before release. The actor string is an audit label, not authenticated proof of a human decision.

Then the host uses the current session to reason over the issued context:

```text
node CLI --state STATE host codex requests TASK
node CLI --state STATE host codex submit response.json
node CLI --state STATE host codex run TASK
node CLI --state STATE host codex report TASK
```

Each request includes its own context, contract, roles, ID and binding hash. Submit one response per WorkItem, preserving the request ID and binding hash:

```json
{
  "requestId": "copy-issued-request-id",
  "bindingHash": "copy-issued-binding-hash",
  "proposal": {
    "summary": "Correct subtraction",
    "edits": [{ "path": "src/subtract.js", "oldText": "a+b", "newText": "a-b" }]
  }
}
```

Do not add evidence, approval, billing, tool commands or transcripts. The host must leave the target repository unchanged and produce only the bounded proposal. CodeFleet validates scope and bindings, then applies it in an isolated candidate. Existing baseline failure, candidate tests, final integration tests and evidence hashes decide completion. A failed or missing test never becomes success because the host says it passed.

Replace `codex` with `claude` for the same flow in Claude Code. No new CLI model process is started, no host authentication file is read, and no direct API adapter is imported by this path. The existing host subscription/account is responsible for host reasoning and usage limits. API-authenticated host configurations may incur their own charges. Local staged replay launches no model; a reported replay cost of zero excludes unknown host-session cost.

## Review, collaboration and recovery

`review` accepts the existing `--item "id|files|tests|dependencies"`, `--parallel` and `--attempts` options. The attempt budget must cover the WorkItems. CodeFleet owns scheduling and parallel isolated candidates. The host may reason sequentially in Planner/Architect/Executor/Reviewer roles; these labels do not prove separate agents ran. Automatic host delegation is not supported by this integration yet. Existing coordinator-issued message channels carry only provider-reported findings/results.

Use `status TASK`, `pause TASK`, `cancel TASK`, `resume TASK`, or `report TASK` under `host codex`/`host claude`. Repeated request issuance before execution returns the same bindings. Identical duplicate responses before execution are idempotent. Conflicting responses and consumed/old-revision submissions fail. Cancelled workflows cannot resume; uncertain or failed attempts cannot automatically replay. Create a new reviewed task when instructed by the report. Evidence corruption or a changed final tree makes the report invalid.

Node verification requires the pinned Docker image; Java verification retains the existing prepared Maven/Gradle and JDK requirements. No weaker verifier is silently substituted. Goals outside the existing Node/Java repair contract remain blocked; this integration does not claim general autonomous development support.

## Before live acceptance

Obtain separate authorization naming the host, repository fixture, permissions, model/account limits and allowed actions. Verify skill discovery in the actual session and enforce operator/state separation. Perform goal → review → approval → proposal → Harness → report, plus denial/cancellation/stale-result checks in both hosts. Save sanitized evidence without credentials or transcripts. Only then assign HOST_LIVE_VERIFIED to the tested host/environment. The current offline tests cannot establish that status.

See [architecture and official sources](../implementation/host-native.md) and the [transition record](../runs/2026-10-20/alpha-host-native-transition.md).

For the prepared temporary repositories, fixed scope and outstanding authorization/security gates, use the [H1 acceptance packet](host-live-acceptance.md).
