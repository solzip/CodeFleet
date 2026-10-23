# Host-native integration contract

Status: design reviewed against local Codex 0.162.1 / Claude Code 2.1.304 and official documentation on 2026-10-20. Windows Codex preparation through command-specific Host approval was measured on 2026-10-21 (below). Protected execution live certification remains NOT_RUN.

Autonomous Execution. Controlled Process. Verified Results.

## Architecture and gates

User → existing Codex/Claude session → Skill/Host Adapter → existing Intent/Task → approved Workflow/DAG → bounded proposal exchange → Trusted Harness → independent Judge → evidence report.

The Host Adapter is separate from Provider Adapters. No model invocation, credential loading, session copying, API fallback or provider capability promotion occurs in the host path. Existing direct API adapters remain optional, with their existing live blocks unchanged. Existing Alpha and Legacy commands retain their contracts.

G0 requires an actual Git inventory and preservation checkpoint; G1 requires version/help and official-source comparison; G2 requires this contract before implementation; G3 requires no API dependency in the host path; G4/G5 require installable skills and bounded dispatch; G6 requires existing controller/SQLite integration; G7 requires adversarial tests and installation lifecycle smoke. Passing offline gates does not pass the separately authorized live gate.

## Narrow execution contract

The first supported mode is staged proposals, not automated control of the running host. Host AI uses its own authenticated session to reason over a request and returns JSON edits. CodeFleet does not claim to observe or constrain the host's other tools. Automated host tool execution, attested host sandboxing, automatic subagent launches and hooks that mutate approvals/completion remain BLOCKED. A single agent may supply all proposals; role assignments are advisory until the coordinator binds actual attempt channels.

The operator first reviews the Task and prepares its Workflow. The host approval command returns a request; it cannot write approval rows. Actual approval uses the existing operator CLI in a trusted terminal. This is not OS isolation: an agent with arbitrary shell/state-file access could call the operator CLI too. Production deployment must deny the host access to that operator command and trusted state, or require a human-controlled permission boundary. No cryptographic human identity is inferred from an actor string. Live authorization enforcement remains a release blocker until tested in each host.

After approval, CodeFleet issues per-WorkItem requests containing random request IDs, host identity, workflow hash/revision/base, contract and context hashes, and only declared context. Host responses contain only request ID, binding hash and proposal. Extra approval, evidence, cost, command, session or capability fields are rejected. Identical duplicate submission is idempotent; conflicting duplicates, consumed requests, revision changes, revoked approval, cancellation and existing attempts are rejected. A response cannot itself execute or complete anything.

During run, the existing coordinator reserves and fences each child. The host exchange checks the active child/parent lease, fixed request binding, exact context and contract before atomically consuming the response once and recording the attempt ID. Existing isolation, baseline tests, candidate verification, test-identity checks, integration and final-tree verification remain mandatory. A crash after consumption never replays a response; existing reconciliation handles uncertain attempts. No new scheduler is introduced.

This local replay performs no billable model operation. Its incremental model cost is zero; the cost of the host session that prepared proposals remains UNKNOWN and is not included in that value. This does not assert free/unlimited host use. Existing subscriptions may cover the host session according to its plan and limits; API-authenticated host configurations can still bill separately. Optional direct OpenAI/Anthropic APIs require separate credentials/billing; subscription tokens are never extracted for them.

## Reuse and gaps

Intent discovery/review, task persistence, approval expiry/hash, Workflow/DAG, parallel disjoint WorkItems, delegated messaging, workspace snapshots, Judge, evidence artifacts, SQLite leases, reconciliation and local delivery are reused. Host requests add an extension table without changing old rows or the Alpha store version. Legacy remote delivery remains separate; host integration permits local delivery only.

The original G7-C follow-up about direct API live certification is superseded as the default product direction by the owner's Host-Native instruction. Historical records are preserved. No claim is made that previous API or CLI capability gaps were fixed.

## Official interface mapping

| Area | Codex | Claude Code | CodeFleet use |
| --- | --- | --- | --- |
| Instructions | Hierarchical AGENTS.md / overrides | CLAUDE.md and plugin instructions | Never overwrite user instructions |
| Skills | `.agents/skills/<name>/SKILL.md`, `$codefleet` | Standalone `.claude/skills/codefleet/SKILL.md`, `/codefleet`; plugin registration not implemented | Packaged instructions invoke local JSON CLI |
| Collaboration | Native subagents; installed `multi_agent` advertised stable | Agents/subagents and experimental/configuration-dependent teams | Roles in request; automatic delegation unverified |
| Events | Hooks supported; trust/configuration boundaries | Hook lifecycle and permissions | No authoritative hook registered |
| MCP | Host supports MCP servers | Host supports MCP servers | Optional future transport; not required by this CLI integration |
| Auth | ChatGPT sign-in or API authentication | Subscription/Console/enterprise alternatives | Remains entirely inside existing host |
| Sandbox | Host approval/sandbox policy | Tool permissions and platform-dependent Bash sandbox | Does not certify CodeFleet capability; Docker Harness remains independent |

Sources (consulted 2026-10-20): [Codex skills](https://developers.openai.com/codex/skills/), [AGENTS.md](https://developers.openai.com/codex/guides/agents-md/), [subagents](https://developers.openai.com/codex/multi-agent/), [hooks](https://learn.chatgpt.com/docs/hooks), [MCP](https://developers.openai.com/codex/mcp/), [authentication](https://developers.openai.com/codex/auth/), [security](https://developers.openai.com/codex/security/).

Claude sources: [plugins](https://code.claude.com/docs/en/plugins), [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [teams](https://code.claude.com/docs/en/agent-teams), [hooks](https://code.claude.com/docs/en/hooks), [MCP](https://code.claude.com/docs/en/mcp), [authentication](https://code.claude.com/docs/en/authentication), [sandbox](https://code.claude.com/docs/en/sandboxing).

[OMX](https://github.com/Yeachan-Heo/oh-my-codex) and [OMC](https://github.com/Yeachan-Heo/oh-my-claudecode) publicly organize skills and agent workflows around their hosts. These are comparative references, not evidence of CodeFleet capabilities. No implementation, internal command, credential strategy or installer was copied; existing MIT author notices remain intact.

## Checkpoint plan

### Windows Codex preparation recovery

Measured on 2026-10-21.

Scope: `feature/new-project-bootstrap`, base `2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba`
plus the preserved uncommitted Bootstrap/Clarification work. This section supersedes
the historical checkpoint below only for this scoped change.

| Cause | Evidence and implementation boundary |
| --- | --- |
| A — Git ownership | Existing elevated-Sandbox refusal and the current CLI probe show SID ending 1004 versus owner 1001. `src/alpha/workspace.mjs:git` calls Git; `src/intent/probe.mjs:classifyGitFailure` returns `GIT_OWNERSHIP`. No safe.directory, ownership or ACL changes. |
| B — process creation | Prior unelevated run: Node child creation returned `spawn EPERM` before Git ran. Existing `src/alpha/process.mjs:command` captures that spawn error; probe classifies `PROCESS_SPAWN_DENIED`. The environment diagnostic was not repeated. |
| C — Host permission | This session's execution tool supports `sandbox_permissions="require_escalated"` and a command-specific justification. Approved CodeFleet CLI calls ran directly from Codex. Approval denial/unavailability must remain BLOCKED; no simulated denial is presented as a live denial. |
| D — adapter guidance | `src/hosts/install.mjs` now supplies Codex-only recovery instructions. `src/hosts/cli.mjs` adds advisory `hostRecovery` for blocked ownership/spawn probes, preserving task id/revision and prohibiting automatic retry. |
| E — internal process structure | Existing shell-free child processes and Git configuration filtering remain unchanged. The probe remedy now points to official Host command approval instead of operator mediation. A CLI without explicit `--state` previously failed creating the home state directory; the Skill requires explicit writable preparation state. |

Host approval permits only the reviewed OS command. It creates no CodeFleet
fileset/workflow approval, capability, Local Verification trust or Protected
Evidence. The planner cannot invoke a new elevation API, promote itself to an
operator, clear objective unknowns, or automatically retry uncertain mutations.
The existing public protected-execution gate and Judge are unchanged.

Actual session: Codex CLI 0.162.1, Windows elevated sandbox. Installed Skill was
read and followed by the current Codex agent; CLI calls used its packaged runtime,
not internal dispatch or an operator running commands on the agent's behalf.
The existing `scripts/host-codex-discovery.mjs` exercised the real local
`skills/list` loader: enabled/disabled/re-enabled exact matches 1/0/1, errors 0,
no model turn or authentication; result in `codex-discovery.json` beside the logs.
The first test fixture accidentally had a sandbox-owned root and user-owned
`.git`: ordinary and approved calls both correctly failed ownership checks in
opposite directions. Both failed Tasks remain revision 2 / BLOCKED. A fresh
`owner-fixture` created wholly by the owner was used without changing either
fixture's permissions. Thus command approval is not an ownership repair.

Successful Task: `task-295f3d73-68a8-475d-aff8-50251918ba43`, revision 5.

| Actual call | Observed result |
| --- | --- |
| `host codex plan` with command-specific approval | `NEW_PROJECT`, `UNBORN_HEAD`, revision 2, `NEEDS_INPUT`; PowerShell tool exit 1 (native exit was not separately captured on this call) |
| `host codex status` in normal sandbox | exit 0, same persisted Task |
| `host codex draft` with approval | exit 0, revision 3, `VALIDATED`, 0 unknowns |
| `host codex prepare` with approval | exit 2, revision 4, `BOOTSTRAP_PREPARED`, 4 DAG items |
| `host codex workflow` in normal sandbox | exit 0, DAG returned, approved/executable false |
| `host codex files` with approval | exit 2, revision 5, 2 proposed files, `REQUEST_ONLY` |
| `host codex status` in normal sandbox | exit 0, persisted proposal; verification `NOT_RUN`, complete false |
| `host codex approve` / `host codex run` | both exit 1 / BLOCKED; unsupported host approval / missing production operator isolation respectively |

Objective clarification was not needed for this fixture (0 objective unknowns).
The existing clarification binding/forgery tests ran; no planner clarification
authority was added. The readonly SQLite check found 3 Tasks (2 failed, 1 prepared),
0 workflow approvals and 0 execution attempts. Neither proposed target directory
exists. Workflow hash: `4bc4008651179bf523a459a46ebafe55a9b276e4e41d95e40b5ea3de32ceae14`.
Fileset hash: `220e1c29c468f105d9aa740c6e864d64aa7eb46ea76ff79ca84671fcf6330593`.

Executed regression command:

```text
node --test test/bootstrap.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs test/intent.test.mjs test/workflow.test.mjs test/host.test.mjs
```

89 tests: **87 passed, 0 failed, 2 skipped** (optional Docker checks). Includes
Bootstrap, Host-Core, G3/G4, real Git ownership classification, spawn-denial
classification, unapproved materialization refusal, and Local/Protected separation.
New recovery tests verify no Task rewrite, no approval/attempt creation, and no
Codex-specific recovery for Claude or unrelated Git errors. This is not a full
`npm test`, Linux/macOS live result or Claude live acceptance result.

Local evidence is retained at `.trials/host-core-checkpoint/windows-host/`:
`plan-sandbox.json`, `plan-approved.json` (mixed-owner failure), `plan-owner.json`,
`draft-result.json`, `prepare-result.json`, `workflow-result.json`,
`files-result.json`, `final-status.json`, `deny-approve.json`, `deny-run.json`,
`state-check.json`, `regression.log`, and `todo-preservation.json`.
Existing `codefleet-todo`: 120 files before/after, 0 hash/path changes, including
its Git files and installed runtime. Its materialized data-model was not rerun.
No commit, push, PR, merge or branch deletion was performed on the working project.
Existing regression fixtures create their own temporary baseline commits.

Preparation no longer requires operator CLI mediation when the Host offers and
grants the scoped execution approval. Unapproved sandbox execution still fails
for user-owned Git repositories. Same-account execution is not protected isolation.
Other OS runtime paths and Claude Skill instructions are unchanged; no live
compatibility claim is made. Todo+Calendar planning can resume using the corrected
runtime and explicit existing state, but its old installed snapshot remains unchanged;
snapshot replacement needs its own reviewed lifecycle operation. Fileset approval,
materialization and verification remain separate subsequent actions.

Official interface reference: [Windows sandbox and command approvals](https://learn.chatgpt.com/docs/windows/windows-sandbox).
No global sandbox mode, blanket command rule or Git configuration was changed.

Baseline HEAD is 9dc429835fd272253f8efac60ac0f76bf7188de5 on feature/alpha-g0-refresh. Existing tracked changes: none. Preserve `.trials/` and the untracked G0 audit Markdown/log. Record relative-path SHA-256 inventory before edits in an ignored local checkpoint; do not stage, stash, reset, commit or copy secrets. Existing tracked content is recoverable from HEAD; the inventory detects changes to pre-existing untracked files. Any future commit requires separate authorization and review of the complete diff. Never restore over user changes.
