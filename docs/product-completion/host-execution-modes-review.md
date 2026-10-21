# Host execution contracts — design review, not activation

Date: 2026-10-20. Reviewed HEAD: `81144a6dedb7e73b41b0029d14161943bffdfaeb`, branch `feature/alpha-g0-refresh`.
Predecessors: [H5 acceptance](../runs/2026-10-20/alpha-h5-host-acceptance.md), [blocked authorized pilot](../runs/2026-10-20/alpha-h5-codex-live-preflight.md), [H4 IPC](../implementation/host-ipc.md).
Review scope: analysis and design only. Prior measured finding maxima P0-17/P1-61; no new finding IDs. Existing BLOCKED decisions remain in force.

## Finding

Requiring no model tools for every Host-native activity conflicts with using Host-native development capabilities. The previous pilot correctly failed its expressly authorized no-tool contract; changing the proposed future contract does not retrospectively satisfy that pilot.

`src/providers/interface.mjs` accepts only PROPOSAL_ONLY. `src/providers/codex.mjs` deliberately disables an unproven no-tool launch. Neither should be relabeled or bypassed.

`src/hosts/exchange.mjs` explicitly consumes inert staged data without launching a Host. Its PROPOSAL_ONLY result describes that consumption seam, not proof that the upstream Host used no tools. `src/hosts/install.mjs` generates a Skill that expects a provisioned Run/socket and invokes the IPC client. A universally shell-free pilot cannot exercise that complete Skill workflow. New-draft generation without a provisioned Run also lacks a dedicated discovery/plan-only entry point today.

Distinguish the execution authority from evidence authority. HOST_OBSERVED is a proposed execution contract, not an evidence promotion rule. These contracts compose: an observed Host prepares a proposal, then a controlled Harness evaluates it. They are not an automatic fallback ladder.

## Proposed contracts

| Contract | Allowed behavior | Required enforcement | Evidence and completion |
| --- | --- | --- | --- |
| PROPOSAL_ONLY | Supplied context to structured data; no model tools | Proven tool suppression and context/credential isolation at the model boundary | Provider report only; independent validation still required |
| HOST_OBSERVED | Explicitly permitted Host reads, searches, commands and later isolated edits | Separate workspace, actual read/write/network policy, bounded tool and process access, protected policy and state | Host events/reports retain Host provenance; only independently observed artifacts/tests may satisfy gates |
| CONTROLLED_EXECUTION | Coordinator-authorized operations through existing restricted Harness | Contract/hash/revision, capability, current policy, scope, lease and any required Operator grant enforced before action | Existing trusted observation, Verifier and Judge decide the bound operation's result |

For all contracts retain Run/WorkItem/attempt ownership, cancellation, stale-result rejection, evidence hashes and immutable scope. A mode change is a new reviewed contract revision with current policy and capability evidence; it cannot reactivate old grants. Unknown coverage stays UNKNOWN/BLOCKED.

For HOST_OBSERVED, final diff checks cannot repair an earlier secret read or remote side effect. Prevent those effects before execution. A successful test is not proof of access-policy compliance.

Proposed capability records must distinguish advertised support, installed-version schema/help, effective session configuration, offline adversarial enforcement, and live observation. Bind records to host version, environment, policy/config digest and workspace identity; invalidate them on changes. These records are a design proposal, not new implemented runtime fields.

## Installed Host and official interfaces

This review ran only local version/help reads: Codex `0.162.1`, Claude Code `2.1.304`, exit zero. Prior Codex loader evidence is reused, not rerun as a live Skill call.

| Capability | Codex | Claude Code | Acceptance limitation |
| --- | --- | --- | --- |
| Skill | Project `.agents/skills/codefleet`; `$codefleet`; app-server skills/list | Project `.claude/skills/codefleet`; `/codefleet`; Skill tool | Discovery and invocation need separate evidence |
| File/command restrictions | Permission profiles, sandbox and approval controls | Tool inventory, permission rules and sandboxed Bash | cwd and plan/read-only labels alone are insufficient |
| Collaboration | Official subagents; installed multi_agent feature | Custom subagents and Agent Teams | No CodeFleet live role delegation demonstrated |
| Events | App-server turn/item/command/diff and approval messages | stream-json and hook events | Host-owned event stream is not independent execution proof |
| Fresh context | New app-server thread with explicit cwd/config, not resume/fork | New session in fixture cwd with explicit settings | Authentication reuse is distinct from conversation reuse |

Official sources:

- [Codex permissions](https://learn.chatgpt.com/docs/permissions): read-only still permits commands; restricted profiles can constrain filesystem/network access. Actual target-platform enforcement must be tested.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server): skill discovery, explicit skill input, thread/turn and tool events. Approval events do not guarantee every permitted action will prompt.
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): official delegation exists; CodeFleet remains scheduler and state owner.
- [Claude Skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [Agent Teams](https://code.claude.com/docs/en/agent-teams): distinct Host features, not evidence of CodeFleet integration.
- [Claude sandbox](https://code.claude.com/docs/en/sandboxing): Bash sandbox does not contain file tools, hooks or MCP. Native Windows commands are unsandboxed; Linux/WSL support is not a deployment attestation.
- [Claude permissions](https://code.claude.com/docs/en/permissions), [CLI](https://code.claude.com/docs/en/cli-reference), [hooks](https://code.claude.com/docs/en/hooks): inventory, permission and event controls are separate.

Installed Claude help additionally confirms `--restricted` removes command/code tools and WebFetch by default and confines file tools to working directories; it is a promising read-only pilot candidate, not yet tested enforcement. `--tools` selects available built-ins; `--allowedTools` only permits selected calls without prompts. Explicit MCP/configuration and write controls remain necessary.

Do not use `--safe-mode` for Skill acceptance: it disables Skills. Do not choose `--bare` for subscription-auth acceptance: the installed help says it excludes OAuth/keychain and uses API-key/helper authentication. No such option was executed. A permission-handler or Hook allow decision is not authenticated CodeFleet Operator approval.

## Alternatives

| Option | Auth and Skill experience | Access enforcement | Cost and decision |
| --- | --- | --- | --- |
| A: fresh constrained Host session | Same Host account may be reusable; explicit local Skill; clean conversation | Native policy needs effective-config and adversarial checks; new cwd alone is no isolation | Moderate; useful session structure, insufficient alone until proven |
| B: existing session with CodeFleet limits | Best continuity and existing auth | Cannot retract private context already loaded; CodeFleet-only policy cannot fence unrelated Host tools | Small integration cost but unsuitable for first isolated acceptance |
| C: native sandbox plus external isolation | Host-native Skill remains; supported login may be needed within isolated environment | Dedicated UID/VM/container, minimal mounts, no Docker/Operator socket, external egress policy, plus Host controls | Highest provisioning cost; strongest fit for initial evidence-based acceptance |

Recommend A inside C for the first accepted path, preferably Linux because existing H4 evidence is Linux-specific. This is not approval to provision or copy credentials. WSL's Windows mounts/interop and Docker access require explicit containment; do not inherit the current WSL user's authority. Do not generalize results to Windows.

Use the Host's supported account login, without exporting credentials into CodeFleet. Same subscription does not imply safe transfer of an existing authentication file into another UID/container, or reuse of the current conversation. If supported login and agent-inaccessible credentials cannot coexist with required tools, remain blocked.

## Minimal acceptance design

### Offline gate before any model

Provision a fresh disposable project, never a linked worktree exposing shared Git metadata. Preinstall a reviewed, immutable Skill and public fixture. Provisioning writes occur before the sealed execution interval and need separate authorization.

At the boundary, demonstrate denial of fixture writes, outside-file reads, symlink escapes, credential reads, policy changes, forbidden network destinations, Operator/Docker sockets and descendant escapes. Use fake secrets and endpoints; no model or real credentials for these probes. Test native file tools as well as commands, hooks and connector paths. Unknown effective policy or missing observation fails closed.

Keep model-service transport separate from tool egress: the Host needs its authentication/model service; model-controlled tools do not receive general Internet access. Do not use a domain allowlist alone as proof that tools cannot misuse an allowed destination. Require a protected transport boundary and actual negative tests. Record precisely which identity/process is permitted each connection.

### First live phase: HOST_OBSERVED read and plan

Natural-language objective: diagnose the public subtraction fixture and produce a schema-valid draft proposing a bounded correction and protected regression tests.

Allow only fixture exploration: native file read/search; for a Host requiring shell-based exploration, a reviewed command set confined by actual filesystem and network controls. Merely matching a textual command prefix is insufficient. No write/edit/apply, test execution, dependency install, delegation, external tools or Operator/Harness call.

The input package contains only the frozen Skill, fixture and objective. Record hashes, installed Host/model identity when observable, actual Skill-loading evidence, tool events, terminal status and usage if returned. Do not rely on an agent saying it used a Skill. Validate the returned draft with the existing trusted schema/contract validator outside Host control; this creates a valid *draft*, not execution approval.

A narrow plan-only Skill entry needs separate implementation/review because today's Skill assumes H4 IPC provisioning. Do not fabricate RUN_ID, pretend invocation completed, or silently replace the Skill with generic instructions.

No fixture/project writes during the model interval. Allow only explicitly declared private runtime scratch, auth refresh/session metadata and a trusted recorder's append-only evidence outside the fixture. Host runtimes may require these writes; claiming zero writes anywhere would be misleading. If the user requires literally zero disk writes, that stronger condition needs separate proof and may block execution.

Successful scope label: HOST_LIVE_VERIFIED for this host/version/environment's Skill + exploration + draft only. Product repair/completion remains unverified.

### Later phase: bounded change and independent verification

After separate authorization, bind the accepted Task/WorkItem/revision and allow the selected edit scope in an isolated candidate. Prefer preserving the existing staged-proposal route first: the Host proposes, the trusted Harness applies/tests. Direct Host candidate edits are a distinct later capability, requiring immutable snapshot/diff import, overlap checking, protected tests and independent verification of the exact submitted tree.

Reuse H4 lease, replay journal, scope validation, candidate/integration verification and Judge. Do not give Host access to Docker or trusted repositories to make integration easier. High-risk execution stays blocked until independent human authorization is established.

## Required new approval

The old no-tool approval does not authorize a tool-using HOST_OBSERVED pilot. A future request must name Host/version, isolated environment and login method, exact fixture/Skill hashes, allowed read tools or commands, allowed transport destinations, runtime scratch/log exceptions, one session/turn and usage/time bounds, and prohibited changes/IPC/delegation. Runtime quota and dollar caps are different; unknown cost remains unknown.

Provisioning, the read/plan live turn, and the later edit/Harness phase are distinct scopes. This review asks for no immediate Live approval: enforcement and the plan-only entry point are not yet verified.

## Compatibility and next action

Keep G1 Judge/evidence authority; G2 proposal provider contract; G3 draft validation and activation distinction; G4 DAG; G5 Hybrid; G6 CLI/report/recovery; G7 optional API; H2/H3 protected authority; H4 IPC and Harness unchanged.

Future adapters carry Host activity with Host provenance and translate only bounded proposal data into existing staged inputs. Role delegation maps Host worker IDs to WorkItem/attempt/lease and has one scheduling owner; no automatic simultaneous Host and CodeFleet dispatch.

Next action is a separately scoped offline design-to-implementation task for the isolated read/plan capability and Skill entry, with negative tests before Live. No existing BLOCKED state is changed by this review. No model/API invocation, source/policy change, commit, push or deployment occurred.
