# CodeFleet

[한국어](README.md) | English

CodeFleet is an AI-native development orchestration CLI. It structures a development or operations Objective into one or more Tasks, defines backend and infrastructure work as a Task carrying scope, guardrails, and verification conditions, executes only the Tasks a human has approved, and tracks the result through logs, diffs, Harness-executed verification, and a review decision backed by hash-checked evidence.

The point is not to call an AI model. The point is that delegated work carries an approval decision, runs inside enforced boundaries, and leaves evidence that does not depend on what the agent claims it did.

> **A note on language.** This file is the only English document in the
> repository. Everything under `docs/` — including `concept-foundation.md`, the
> canonical definition — is written in Korean. This README is self-contained and
> covers the whole CLI surface, so you do not need the Korean documents to use
> CodeFleet; you need them to read the design reasoning behind it.

## What CodeFleet Is Not

CodeFleet is not a Codex runner, a prompt generator, an AI CLI wrapper, a central project management tool, a web dashboard, a DB-backed task system, a CI/CD replacement, a deployment tool, a secret manager, or a full sandbox. This scope is fixed and is not planned to widen.

## The Flow

Each stage below is a command, and each leaves a file. Nothing advances on a claim.

| Stage | Command | What it writes |
| --- | --- | --- |
| 1. Objective | `objective create`, `objective attach` | `.codefleet/objectives/<id>/ledger.jsonl` |
| 2. Task | edit `.codefleet/tasks/<id>.yaml`, then `task validate` | the executable contract |
| 3. Approval | `task approve <id> --reason <text>` | `.codefleet/tasks/<id>/task-ledger.jsonl` |
| 4. Run | `run <id>` | `.codefleet/runs/<run-id>/` |
| 5. Verification | executed inside `run` | `runs/<run-id>/verification/verify-NNN.json` |
| 6. Review | `review <run-id> --decision <D> --reason <text>` | `.codefleet/reviews/<review-id>/evidence-bundle.json` |
| 7. Record back | `objective import-review` | an Objective ledger event |

A Run refuses to start without step 3. A review cannot be ACCEPTED while evidence is missing at step 5.

## Current Implementation Scope

Implemented today: the Objective ledger and queue, Task revision and approval ledgers, Run planning, the Codex adapter seam, Harness observation of workspace state and diffs, path policy, command policy, Harness-executed verification, the review evidence bundle with hash checking, a single-writer workspace lock, and a per-Task run lock with exclusive `runId` reservation.

Not implemented, and named here rather than implied:

- **AgentRole** is designed in `docs/concept-foundation.md` §11 but has no code. Every Run uses the single `defaults.run.agentAdapter`, so delegation is not role-based yet.
- **Risk engine** — `computedRisk` is always `UNKNOWN` (`RISK_ENGINE_NOT_IMPLEMENTED_V02`).
- **Execution isolation** — `isolation.mode` is always `NONE`.
- **Harness-visible command channel** — commands the agent runs on its own are never observed. See [Execute Mode](#execute-mode).
- **VERIFIED and queue progression** — a local review can never produce them. It is migration input for a future `RUN_REVIEW_DECIDED` ledger event.

The canonical product definition is `docs/concept-foundation.md`, not this file.

## Requirements

- Node.js 24 or newer (native TypeScript stripping)
- npm or pnpm only if you want package-script convenience

This project has no external runtime dependencies.

## Install

```bash
npm install
npm link
```

You can also run the CLI without linking:

```bash
node ./src/cli.ts --help
```

On Windows PowerShell, if npm script execution is restricted, use `cmd.exe /c npm ...` or call Node directly.

## Initialize

```bash
codefleet init
```

This creates `.codefleet/tasks/`, `.codefleet/runs/`, `.codefleet/config.json`, and `.codefleet/local.json`. The remaining directories — `objectives/`, `reviews/`, `prompts/`, `locks/` — are created on first use.

`.codefleet/config.json` is the **Project Profile**: workspace policy, committed and shared.

```json
{
  "schemaVersion": "1.0.0",
  "project": { "id": "", "name": "" },
  "workspace": { "id": "codefleet-workspace" },
  "defaults": {
    "task": { "harnessMode": "DRY_RUN" },
    "run": { "agentAdapter": "codex", "isolationMode": "NONE" }
  },
  "policies": {
    "harness": {
      "allowedModes": ["DRY_RUN", "SUGGEST_ONLY", "WORKSPACE_EDIT", "COMMAND_EXEC"],
      "maxMode": "COMMAND_EXEC",
      "requireIsolationForMutation": true,
      "allowDegradedCommandObservation": false,
      "approvalRequiredForDestructiveCommands": true
    },
    "agentAdapters": { "allowedAdapters": ["codex"] },
    "files": {},
    "commands": {
      "allowedCommands": [],
      "deniedCommands": [],
      "destructiveCommands": [],
      "requireHarnessVisibleCommandChannel": true,
      "allowProviderReportedCommandTruth": false
    },
    "risk": {},
    "verification": {},
    "redaction": {},
    "carryForward": {},
    "agentRoles": {}
  },
  "references": {},
  "localPolicy": {
    "mergeMode": "RESTRICT_ONLY",
    "overlayPath": ".codefleet/local.json",
    "allowedLocalKeys": ["adapterCommand"]
  }
}
```

**The seven top-level keys and the nine `policies` keys are exact sets.** A missing key is refused the same way an unexpected one is. Refusing only unexpected keys would let a profile omit `policies` entirely and read as a profile that permits everything — a state nobody who wrote that policy intended. An empty block must still be written as `{}`, so "no policy here" stays distinguishable from "forgot the block".

Every policy default is the strict end of its switch. A profile that says nothing must not be read as a profile that permits everything. An unknown key inside a policy block is refused rather than ignored, because a typo'd `deniedCommands` is an empty denylist that looks like a full one.

### Local Overlay

The Project Profile may not carry **runtime evidence, local machine state, or credentials**, because it is committed and shared. The adapter command path is the clearest case: it is one person's machine, not the workspace's policy. It goes in `.codefleet/local.json`:

```json
{
  "adapterCommand": { "command": "codex", "args": ["exec", "-"] }
}
```

The overlay may only narrow (`mergeMode: "RESTRICT_ONLY"`). A key not listed in `allowedLocalKeys` is recorded as a violation and dropped rather than applied, so the overlay cannot become a second, unreviewed policy source.

The Profile loader walks every key name and string value at every depth, refuses the following, and **reports how many it inspected** — nothing examined must not look like nothing found:

- key names that denote runtime or local state (`stdout`, `diff`, `token`, `command`, `args`, `model`, and the rest of the set)
- values in credential formats that are unambiguous on sight (GitHub tokens, AWS access keys, private key blocks)
- absolute paths in path-valued fields, which must be workspace-relative

## 1. Objective

An Objective is the queue that holds Tasks and the decisions made about them. It is an append-only JSONL ledger; the snapshot is derived by replay, never edited in place.

```bash
codefleet objective create obj-001 --title "API response cleanup" --kind SEQUENCE
codefleet objective attach obj-001 task-001
codefleet objective status obj-001
```

`--kind` is `ONE_OFF` (default), `SEQUENCE`, or `WORKSTREAM`.

**The relation is not optional.** Execution permission is the conjunction of two axes — an approved Task Revision and an accepted Objective relation — so a Task attached to no Objective **is refused**. Work nobody put in a queue is work nobody decided to do.

`attach` reads the revision and its hash **from the Task ledger** rather than taking them as arguments: a relation naming a revision that does not exist, or a hash the ledger never recorded, is refused. Omitting `--revision` attaches the approved one.

A relation **names the revision it was attached at.** One attached at revision 1 does not permit a Run of revision 2, because that is a different contract. Moving it forward requires approving the newer revision, which is what records the succession — and a relation moves only along recorded succession. The old queue item is preserved rather than rewritten.

Queue items move by explicit decision, each requiring a reason:

```bash
codefleet objective block obj-001 <queue-item-id> --reason "waiting on schema decision"
codefleet objective unblock obj-001 <queue-item-id> --reason "schema fixed"
codefleet objective skip|unskip|cancel-item obj-001 <queue-item-id> --reason <text>
codefleet objective reorder obj-001 --order item-2,item-1 --reason "hotfix first"
```

`objective status` prints stored versus derived state per item, the replay status, the last sequence number, and any drift between the ledger and the snapshot. `objective rebuild` regenerates `objective.json` from the ledger.

## 2. Write a Task

A Task is the contract: what to do, where it may touch, what it must not do, and how it will be checked. Create `.codefleet/tasks/task-001.yaml`.

```yaml
id: task-001
title: "API response structure standardization"
projectPath: "."
goal: "Make successful controller responses use a common ApiResponse<T> shape."
scope:
  include:
    - "src/main/java/**"
  exclude:
    - "src/main/resources/application*.yml"
verification:
  commands:
    - commandId: unit-tests
      command: ["mvn", "-q", "test"]
constraints:
  - "Do not change the database schema."
  - "Do not modify files unrelated to the task scope."
doneCriteria:
  - "Successful controller responses return ApiResponse<T>."
  - "Existing tests pass when they can be run."
workflow:
  - PLAN
  - IMPLEMENT
  - REVIEW
```

A copy of this sample is at `examples/tasks/task-001.yaml`.

**Enforced versus stated.** Only two fields are machine-enforced:

- `scope.include` / `scope.exclude` become `allowedPaths` / `deniedPaths` and are evaluated against the changed files the Harness observed after the Run.
- `verification.commands` are executed by the Harness itself, which is what makes their result evidence rather than a claim.

`constraints`, `doneCriteria`, and `workflow` are rendered into the prompt and into `run-record.md` for the reviewer. They are instructions to the agent and a checklist for the human — nothing enforces them. Do not read them as guardrails.

Two schema rules worth knowing before your first validation error:

- Scope patterns are whole-path with no implicit subtree. `src` matches only a file literally named `src`; write `src/**`.
- `verification.commands[].command` is an argv array, never a shell string. Shell interpreters are denied, so that command matching stays meaningful.
- `command[0]` is normalized to its basename for both matching and execution, so a relative script path such as `./gradlew` will not resolve. Use a command available on `PATH`.
- Windows batch files are the exception. `gradlew.bat` and `mvnw.cmd` cannot be launched by CreateProcess, so the Harness supplies `cmd.exe` for them, and cmd.exe resolves them from the working directory — which is what makes a wrapper in the project root reachable. A contract **naming** an interpreter is still refused: `["cmd","/c",...]` is `SHELL_INTERPRETER_DENIED`. An argv containing characters cmd.exe reads as syntax (`& | < > ^ " % !`) is refused rather than quoted around.

A Task file has no `status` field. An execution outcome is not part of the contract, so it does not live in the contract document — a Task that declares `status` is refused at validation. Read execution state from `codefleet status` (the latest Run per Task) and `codefleet runs` (every Run and its outcome).

```bash
codefleet task validate task-001
codefleet prompt task-001     # writes .codefleet/prompts/task-001.md, no run
```

## 3. Approve the Task

A Run refuses to start on an unapproved Task. Approval binds to the file's content hash, not to the Task id.

```bash
codefleet task approve task-001 --reason "scope and verification reviewed"
codefleet task status task-001
codefleet task revision task-001 1        # the approved contract body
codefleet task revision task-001 1 --json # contract, hashes, decision reference
```

`approve` refuses a Task that fails validation: an invalid Task cannot become an executable contract. Approving creates a revision and the approval together, appended to `.codefleet/tasks/task-001/task-ledger.jsonl`, and fixes the approved contract at `.codefleet/tasks/task-001/revisions/0001.json`.

`approve` also **refuses a contract that could not execute.** If it declares verification commands while the ceiling formed by its `agentRole` and the profile falls below `COMMAND_EXEC`, the approval itself is blocked — otherwise an approval means "you may try to run this" rather than "you may run this".

**The Revision artifact.** The ledger records the approved hash, but a hash can only be compared against a file that still exists; edit the Task and the approved body itself is gone. `revisions/<n>.json` fixes that body:

- the immutable Task contract (the approved bytes, verbatim)
- contentHash
- approval target hash and approval decision reference
- objective relation snapshot

This file is a **source, not authority.** The current approval state and the current Objective relation are computed by replaying their ledgers. It is never rewritten when an approval is later invalidated — an invalidated approval still had a contract, and this is the only copy of it. Reading re-hashes the stored body and compares, so an altered contract is refused rather than returned.

`task status` prints Draft state and Revision state separately, because the design models them as separate state machines.

| Draft state | Meaning |
| --- | --- |
| `READY_FOR_APPROVAL` | passes validation and the feasibility check — approvable |
| `EDITING` | anything else; the blocking reasons are printed with it |

| Revision state | Meaning |
| --- | --- |
| `APPROVED` | an immutable contract with a valid approval |
| `INVALIDATED` | the approval was withdrawn |
| `SUPERSEDED` | a `TASK_REVISION_SUPERSEDED` event recorded the replacement |

The design's `REJECTED` (Draft) and `CANCELED` (Revision) are not printed, because no event produces them yet. Listing a state nothing can reach would be worse than omitting it.

When a Task is not executable, the reason is one of:

| `blockedReason` | Meaning |
| --- | --- |
| `NO_REVISION_CREATED` | never approved |
| `NO_VALID_APPROVAL` | the approval was invalidated |
| `TASK_CONTENT_CHANGED_AFTER_APPROVAL` | the file was edited after approval |
| `PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL` | the file is unchanged but the guardrails it was approved under are not in force |

Editing an approved Task does not silently carry the approval forward. To re-approve edited content:

```bash
codefleet task invalidate task-001 --reason "scope widened"
codefleet task approve task-001 --reason "re-reviewed after scope change"
```

`--actor <actorId>` records who decided; it defaults to `local-user`.

## 4. Run the Task

```bash
codefleet run task-001
```

The Run is planned before the adapter is given control: the approval is checked first, then the command channel, then the workspace snapshot is captured. A blocked plan writes no Run directory at all.

`dry-run` is the default mode and does not launch the agent process. It still produces the full artifact set, which is what makes it useful for checking a Task before spending an agent run on it.

**Run Options** are explicit execution input for a single Run. They are stored in neither the Project Profile nor the Task contract.

```bash
codefleet run task-001 --adapter codex
```

What the contract fixes is the **role** (`agentRole`); which CLI carries that role out is a property of this run, not of the contract. That is why the adapter is a Run Option rather than a Task field.

A Run Option never widens anything: an override passes the same `policies.agentAdapters.allowedAdapters` check and the same local-registry check as a Profile default. The Run Plan records `selectedAgentAdapter.selectionSource` as `PROFILE_DEFAULT` or `RUN_OPTION`, so after the fact you read which adapter was chosen and by whom rather than inferring it.

## 5. Verification

Verification commands from the Task are run **by the Harness**, not by the agent, and their preflight is checked against command policy. Each attempt records its own stdout, stderr, exit code, and authority:

```text
runs/<run-id>/verification/verify-001.json
runs/<run-id>/verification/verify-001/unit-tests.stdout.log
runs/<run-id>/verification/verify-001/unit-tests.stderr.log
```

`verify-001.json` carries `authority`, `observedCheck`, the gate result, and a `scanScope` reporting attempts recorded, executed, and blocked — so a Run where policy blocked every command cannot look like a Run where everything passed.

In `dry-run`, command execution is disabled, so every verification attempt is blocked with `COMMAND_EXECUTION_DISABLED`, `observedCheck` is `SKIP`, and the gate is `NOT_SATISFIED / BLOCKED`. **A dry-run therefore cannot produce an ACCEPTED review.** That is the intended shape, not a limitation to work around.

A Task with no `verification` block gets `NO_VERIFICATION_COMMANDS_CONFIGURED` and the same unsatisfied gate. Verification is required by the effective policy; declining to configure it does not make it pass.

## 6.5 Reintegration — moving an accepted result into the workspace

Isolation exists so an agent's work does not reach the workspace on its own. Reintegration is therefore not automatic either.

```bash
codefleet apply 2026-05-27_001 --reason "accepted; carrying it into the workspace"
codefleet apply 2026-05-27_001 --check   # decides applicability without touching anything
```

What is applied is **the diff the Harness observed**. The isolated tree is discarded when the Run ends, so this applies evidence rather than a directory that may have drifted since — which makes every reason the patch might not be trustworthy a refusal rather than a partial write:

| Refusal | Why |
| --- | --- |
| no accepted review | the command acts on a decision; without one there is nothing to act on |
| truncated diff | applying part of a change is worse than applying none. Never waivable |
| the Run edited the workspace | the change is already there; there is nothing to move |
| the workspace moved | the patch describes content that is no longer there, and choosing a winner is not this tool's job |

Conflicts are decided by `git apply --check`, and the refusal carries **git's own output** rather than a summary of it. A refusal leaves the workspace untouched. On success `RUN_RESULT_APPLIED` is appended to the Objective ledger, and applying the same Run again is a no-op rather than a second application.

**The design does not regulate this path.** An explicit command was chosen because an ACCEPTED review that applied automatically would collapse the review decision and the workspace change into one act, removing the decision isolation exists to preserve.

## 6. Review the Run

```bash
codefleet review 2026-05-27_001 --decision ACCEPTED --reason "diff matches goal, tests green"
```

`--decision` is `ACCEPTED`, `REJECTED`, or `NEEDS_CHANGES`. The command builds an evidence bundle first: every input reference is re-hashed against the file on disk, and every unavailable reason from the Run is carried through individually rather than as an aggregate.

Two kinds of gap, treated differently:

- **`CAPABILITY_GAP`** — CodeFleet cannot observe it yet. A human may check the repository instead and waive it, one named gap at a time, with a justification.
- **`EVIDENCE_DEFECT`** — evidence is missing, unreadable, or does not match its recorded hash (`HASH_INVALID`, `ARTIFACT_NOT_READABLE`, `MISSING_INPUT_REF`). Nobody can stand in for it. Never waivable.

`ACCEPTED` is refused unless every gap is waived or absent, the normalized result is `DONE`, the verification gate is satisfied, and no path violation is present. The refusal lists each blocking reason.

```bash
codefleet review 2026-05-27_001 \
  --decision ACCEPTED \
  --reason "verified manually against the repo" \
  --waive-gap COMMAND_CHANNEL_NOT_HARNESS_VISIBLE \
  --waive-reason "read the full diff and re-ran the test suite by hand"
```

Other options: `--actor <actorId>`, `--note <path>`, `--ai-review-file <path>` (an AI review is a hint, never decision truth), `--supersedes <localReviewId>`.

The review writes `.codefleet/reviews/<run-id>-review-NNN/evidence-bundle.json` and `.codefleet/runs/<run-id>/review-decision.local.json`, and refreshes `run-record.md` so the one readable file carries the outcome too. `localReviewStatus` is one of `MIGRATION_READY`, `MIGRATION_READY_WAIVED`, `DEGRADED_RECORDED`, `MIGRATION_BLOCKED`, `SUPERSEDED`.

A refused `ACCEPTED` still writes its evidence bundle, so the refusal itself stays inspectable and the next review gets the next `-review-NNN` id.

A local review never produces `VERIFIED` and never progresses the queue. To record it against the Objective:

```bash
codefleet objective import-review obj-001 2026-05-27_001 --reason "accepted after manual check"
```

`import-review` accepts only `MIGRATION_READY` or `MIGRATION_READY_WAIVED`. Anything else is refused — `local review status DEGRADED_RECORDED cannot be imported` — because the other statuses exist precisely to say the artifact is not an effective decision.

## Run Directory

```text
.codefleet/runs/2026-05-27_001/
  run-plan.json                 approval, effective policy, verification plan, artifact plan
  task.yaml                     the approved content, copied
  prompt.md                     what the agent was given
  adapter-request.json          capabilities handed to the adapter
  workspace-pre-run.json        scoped file hashes before the agent ran
  stdout.log
  stderr.log
  git-diff.patch
  workspace-post-run.json       scoped file hashes after
  provider-commands.json        only when the adapter reported commands; PROVIDER_REPORTED_ONLY
  verification/verify-001.json  verification evidence
  verification/verify-001/      per-command stdout and stderr; executed attempts only
  harness-observation.json      what the Harness saw, and what it could not see
  adapter-result.json           adapter status and exit code
  run-summary.json              derived normalization; never decision truth
  run-record.md                 the human-readable account of the Run
  result.json                   the CLI-facing summary
  review-decision.local.json    written by `review`
```

`harness-observation.json` records a workspace delta computed from the snapshots independently of git, so a file git never tracks still shows up as changed. Every section that could not be read stays named in `snapshotGaps`, so a partial snapshot cannot pass as a complete one.

## Inspect

```bash
codefleet runs            # run-id, status, task-id, agent
codefleet status          # version, mode, workspace id, discovery mode, task and run counts
codefleet lock status              # who holds the mutation lock, plus every run lock
codefleet lock break               # release a stale mutation lock
codefleet lock break --task <id>   # release a stale run lock for that Task
```

There are two locks, and they guard different things:

- **The mutation lock**, `.codefleet/locks/workspace.lock` — a single-writer lock taken by ledger mutations: approvals, Objective and queue changes, review imports. **It is never held across Run execution.**
- **A run lock**, `.codefleet/locks/run-<task-id>.lock` — held by one Run for that Task, for the duration of the Run. A second Run of the same Task is refused immediately and told who holds it.

Neither is broken automatically when stale. `lock status` counts a run lock whose file cannot be parsed rather than skipping it: what blocks a Run is the file existing, not its contents, so dropping the unreadable ones would report a blocked workspace as one with nothing held. `lock break` exists for the case where a process died holding it.

All commands accept `--workspace <path>` to select the workspace explicitly instead of discovering `.codefleet/config.json` from the current directory.

## Execute Mode

To let the Codex adapter launch a process, set `defaults.task.harnessMode` to `COMMAND_EXEC` in `.codefleet/config.json`. Of the four requested modes it is the only one that both edits files and runs commands. Without an additional flag, `codefleet run` then refuses to start and writes no Run directory:

```text
Run Planning is blocked: this Run may execute commands, and no Harness-visible
command channel exists to observe them.
```

CodeFleet has no command proxy, sandbox log, or container exec log. An agent running under execute mode can run any command, and the only record of what it ran is the agent's own transcript — a claim, not an observation. Such a claim can never satisfy command policy, verification, or `VERIFIED`.

To proceed anyway, record the decision:

```json
{
  "policies": {
    "harness": { "allowDegradedCommandObservation": true }
  }
}
```

Setting the flag does not make those commands observed. It records that you decided to proceed. Every Run under it keeps `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE` in its unavailable reasons and still requires a human review.

The generated prompt is passed to the configured command on stdin. Treat execute mode as an adapter hook that may need adjustment for your installed Codex CLI.

### Before You Enable It

Execute mode runs the agent **in your real working directory**. The limits
below mean their consequences land in that repository.

- **No isolation and no rollback.** `isolation.mode` is always `NONE`. The agent edits the working directory itself — not a branch, a worktree, or a container. Whether the Run fails or the review rejects it, CodeFleet reverts nothing. The workspace snapshot stores hashes, not content, so it cannot restore anything. Recovery is entirely up to your own use of git. **Run with a clean working tree.**
- **No timeout and no output cap.** The adapter process has no time limit. If the agent never exits, `codefleet run` waits forever and stdout accumulates in memory without a bound. Ctrl-C is the only way out, and it leaves an incomplete Run directory behind.
- **Concurrent runs are only half prevented.** A second run of the same Task is refused at `.codefleet/locks/run-<task-id>.lock`, which names its holder. `runId` is reserved by creating the Run directory exclusively, so Runs of different Tasks cannot take the same `runId` or overwrite each other's artifacts. But **with no isolation, concurrent Runs of different Tasks still edit the same working directory**, and one Run's changes land in the other's diff and snapshot delta. Until the first item above is solved, **run one at a time.**
- **Scope violations are not blocked in advance.** `scope` is passed in the prompt; the adapter does not enforce it. An edit outside scope is found in the diff after the Run and blocks ACCEPTED at review — by which point the change is already on disk.

Each item is recorded with file:line evidence in the audit under `docs/audits/`. That audit is a snapshot of its own date and some of its findings have since been fixed; this section and "What Is Implemented" above are what currently holds.

### Command policy

`policies.commands` is enforced for commands the Harness runs itself, which today means verification commands:

```json
{
  "policies": {
    "commands": {
      "allowedCommands": [{ "argv": ["npm", "test"] }],
      "deniedCommands": [{ "argv": ["git", "push"] }],
      "destructiveCommands": [{ "categoryId": "INFRA_APPLY", "argv": ["terraform", "apply"] }]
    }
  }
}
```

Matchers are argv token lists, compared as written. There is no glob and no regex: a token containing `*`, `?`, or bracket characters is rejected rather than accepted and quietly never matched. `matchMode` is `PREFIX` (default) or `EXACT`. Denied is evaluated first and wins; an empty `allowedCommands` does not constrain, a non-empty one does. A destructive entry needs an `UPPER_SNAKE_CASE` `categoryId`, because approval is granted per category — and since per-category approval is not wired to the CLI yet, a matched destructive command is blocked with `DESTRUCTIVE_WITHOUT_APPROVAL`.

Commands the agent runs on its own are **not** judged against this policy. The Harness never saw them, so treating a transcript claim as a violation would mean believing the claim.

## Command Reference

```text
codefleet [--workspace <path>] init
codefleet [--workspace <path>] run <task-id> [--adapter <adapter-id>]
codefleet [--workspace <path>] prompt <task-id>
codefleet [--workspace <path>] task validate|status <task-id>
codefleet [--workspace <path>] task approve|invalidate <task-id> --reason <text>
codefleet [--workspace <path>] status
codefleet [--workspace <path>] runs
codefleet [--workspace <path>] objective create <id> --title <text> [--kind ONE_OFF|SEQUENCE|WORKSTREAM]
codefleet [--workspace <path>] objective attach <id> <task-id> [--revision N]
codefleet [--workspace <path>] objective block|unblock|skip|unskip|cancel-item <id> <queue-item-id> --reason <text>
codefleet [--workspace <path>] objective import-review <id> <run-id> --reason <text>
codefleet [--workspace <path>] objective reorder <id> --order <id,id> --reason <text>
codefleet [--workspace <path>] objective status|rebuild <id>
codefleet [--workspace <path>] lock status|break [--task <task-id>]
codefleet [--workspace <path>] review <run-id> --decision <ACCEPTED|REJECTED|NEEDS_CHANGES> --reason <text>
```

## Workspace Layout

```text
.codefleet/
  config.json                        the Project Profile: committed workspace policy
  local.json                         the Local Overlay: machine-local, never committed
  tasks/<task-id>.yaml               the Task contract
  tasks/<task-id>/task-ledger.jsonl  revisions and approvals
  objectives/<id>/ledger.jsonl       append-only Objective events
  objectives/<id>/objective.json     replayed snapshot
  runs/<run-id>/                     one directory per Run
  reviews/<review-id>/               evidence bundles
  prompts/<task-id>.md               written by `prompt`
  locks/workspace.lock               single-writer mutation lock
  locks/run-<task-id>.lock           held by a running Run, one per Task
```

## Roadmap

- AgentRole, so delegation is role-based rather than single-adapter.
- Additional adapters for Claude Code, Gemini CLI, local agents, reviewers, testers, and docs agents.
- A Harness-visible command channel, which is what would let agent commands become evidence.
- The risk engine behind `computedRisk`, and execution isolation.
- `RUN_REVIEW_DECIDED` in the Objective ledger, so a review can progress the queue.
- Multi-phase workflow handling beyond a single prompt.
- Task dependency handling.
- Pull request and issue integrations through the export seam.
- Run metrics and success/failure analysis.
- Stronger YAML support through a dedicated parser package if needed.

Export to external tools is limited to the sanitized Run Summary export seam. A web dashboard, a central task DB, and a general-purpose agent platform are explicit non-goals, not deferred work.

## License

This repository is not open source. It is published for reading and evaluation only, and no license to use, run, copy, modify, distribute, or train on the software is granted. See [LICENSE](LICENSE) for the full terms.

GitHub shows no license in its sidebar for this repository. GitHub only recognises standard open source licenses; it does not mean there is no license.

## Documentation

Every file below is in Korean. The FINAL RULE blocks inside
`concept-foundation.md` are the exception: their `ruleId`, field names, and
`condition` lines are English, and they are the part a non-Korean reader can
still follow, because the tests and the coverage checker read exactly those
lines.

- `docs/concept-foundation.md` — the canonical product definition, Core/Workspace/Profile/Harness concepts, and the FINAL RULEs.
- `docs/architecture.md` — text-based architecture overview with diagrams that need no Mermaid rendering.
- `docs/design-progress.md` — the order in which the design was fixed and which step is in progress.
- `docs/session-handoff.md` — the minimum state needed to continue in another session.
