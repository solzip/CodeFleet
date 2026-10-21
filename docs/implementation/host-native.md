# Host-native integration contract

Status: design reviewed against local Codex 0.162.1 / Claude Code 2.1.304 and official documentation on 2026-10-20. Live certification is NOT_RUN.

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

Baseline HEAD is 9dc429835fd272253f8efac60ac0f76bf7188de5 on feature/alpha-g0-refresh. Existing tracked changes: none. Preserve `.trials/` and the untracked G0 audit Markdown/log. Record relative-path SHA-256 inventory before edits in an ignored local checkpoint; do not stage, stash, reset, commit or copy secrets. Existing tracked content is recoverable from HEAD; the inventory detects changes to pre-existing untracked files. Any future commit requires separate authorization and review of the complete diff. Never restore over user changes.
