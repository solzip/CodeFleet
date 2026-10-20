# CodeFleet inside Codex and Claude Code

CodeFleet's default integration direction is Host-Native. Use the AI in your existing authenticated host to prepare proposals; CodeFleet owns contracts, scheduling and independent verification. The staged integration is offline tested, not live certified. Automated host tools and automatic delegation remain blocked/unverified.

**H2 gate:** public Host `requests`, `submit`, `run` and `resume` now return BLOCKED before opening state. The trusted Operator broker has no supported production OS/IPC deployment. Neither `--actor` nor a fake signed approval enables execution. The examples below describe the staged protocol; its execution portion is currently available only to internal offline fixtures. Do not invoke legacy commands or import internal modules to bypass this gate. See the [authorization boundary](../implementation/operator-authorization.md).

H4 adds the [Linux IPC client and restricted Harness connection](../implementation/host-ipc.md). Installed Skills now use that versioned client for provisioned fixed-scope runs. The legacy commands below remain blocked preparation/protocol examples. Actual human input, live Host confinement and arbitrary new scope activation remain BLOCKED. H3 assignment and authorization history is preserved.

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

The same lifecycle commands accept `claude`. Codex gets `.agents/skills/codefleet/SKILL.md`; Claude gets `.claude/skills/codefleet/SKILL.md`. Each skill includes a local runtime snapshot and the MIT license. There are no global settings, hooks, background services or network downloads. Existing skills are never overwritten; removal refuses modified files. To update, review/remove the unchanged old installation and install the new snapshot. Runtime snapshots do not update when the source checkout changes.

Reload/restart the host if needed to discover the installed skill, then invoke `$codefleet` in Codex or `/codefleet` in Claude Code. H1 verified discovery with Codex 0.162.1's actual local `skills/list` loader, including disable/re-enable, without a model turn. Actual Skill invocation in either host and Claude discovery remain unverified. These are standalone skills; no Claude plugin marketplace is required and no plugin manifest or hook is claimed to have been registered.

Install before taking the approved Git baseline. Installation adds files, so review and handle those files according to your repository policy before planning; CodeFleet requires a clean target repository. Do not auto-commit them. Keep CodeFleet state and response JSON files outside the target repository and outside host write permissions where possible. Installation smoke tests use disposable directories, not your global host configuration.

## Goal to verified result

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
