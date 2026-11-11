# P2 — Candidate One-Turn Read-Only Codex App Server Proof Contract

**Document state:** DESIGN_ONLY / CODE_NOT_GRANTED / LIVE_NOT_AUTHORIZED
**Date:** 2026-11-11
**Source basis:** owner-reported P1 R3 success with structurally consistent
redacted Evidence; Codex rust-v0.167.0 generated protocol definitions.
**Prerequisite:** independent review/adjudication of P1 R3 report.
**This document authorizes zero model Turns and zero billable actions.**

## 1. Narrow question to answer

Can CodeFleet, in an explicitly owner-authorized disposable local working
directory, reserve **one** real Codex App Server model Turn, bind its
threadId and turnId to the approved request, receive a completed final
assistant response, and stop without accepting any tool write, repository
change, unapproved server request, unexpected cost or replay?

P1 verified only the bounded initialize/model/list handshake.
A P1 PASS does **not** demonstrate model Turn lifecycle, sandbox
enforcement, memory/session continuity or actual Objective success.

## 2. Authoritative Codex 0.167.0 protocol candidates

Official generated TypeScript contracts:

- ThreadStartParams:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/ThreadStartParams.ts
- TurnStartParams:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartParams.ts
- SandboxMode:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/SandboxMode.ts
- SandboxPolicy:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/SandboxPolicy.ts
- AskForApproval:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/AskForApproval.ts
- TurnStartResponse:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/TurnStartResponse.ts
- TurnCompletedNotification:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/TurnCompletedNotification.ts
- TurnStatus:
  https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/app-server-protocol/schema/typescript/v2/TurnStatus.ts

The published 0.167.0 types support thread/start with a read-only
sandbox mode and never-approve policy; turn/start with sandboxPolicy
type=readOnly and networkAccess=false, an input array and optional
outputSchema; then a turn/completed notification with threadId and a
Turn object whose status must be completed.

These are **source-level** signatures, not runtime acceptance. The
0.167.0 ServerNotificationEnvelope introduced thread/section/changed
versus 0.166.0; whether it or other unapproved Notifications appear
during the actual P2 Turn remains a LIVE_UNKNOWN requiring a reviewed
policy and fail-closed behavior.

## 3. Proposed exact-scope one-turn contract (owner review required)

| Dimension | Candidate minimum / decision needed |
| --- | --- |
| Host executable | The R3 observed Windows native binary SHA-256 EDFDD48F8B458AF0906E507B4CB05217B326C3D6E515E9F024E05E3B8D650F70, rechecked immediately before P2; owner must approve source/version identity |
| CodeFleet P2 proof client | New separately reviewed code, absolute path and SHA-256; NOT PREPARED |
| Filesystem | New, disposable P2-only empty/synthetic directory, not the P1 R3 Fixture, existing user repository, HOME or credential directories |
| Native processes | At most 1 App Server process / 1 ephemeral Thread / 1 model Turn; no subprocess replay |
| Outbound protocol | initialize, initialized, thread/start, turn/start only; exact IDs and permissions; no turn/steer, write, approve or additional Turn |
| Thread request | cwd pinned to disposable directory; ephemeral=true; sandbox=read-only; approvalPolicy=never; model pinned by owner |
| Turn request | threadId from accepted thread/start response; cwd pinned; approvalPolicy=never; sandboxPolicy with type=readOnly, networkAccess=false; fixed text input and bounded JSON outputSchema |
| Suggested fixed user input | Return only a JSON object with property proof equal to P2_READ_ONLY_REPLY. Do not call tools, execute commands, access files or network, write or change any resource, or request approvals. |
| Output acceptance | Single bounded final assistant JSON message exactly matching the independently specified schema; correct Thread/Turn IDs and terminal completed status |
| Tools and effects | No host tools, local file writes, approvals or external side effects; any tool/approval event must STOP and be treated as unverified, not as a successful Turn |
| Clock | Candidate 90s model-Turn deadline plus separately bounded process shutdown; not yet approved |
| Unknown subscription cost | **UNKNOWN, not zero**; the owner must separately accept one possibly billable Turn and its maximum allowed exposure. A 90s timeout cannot enforce a USD cap |
| Retry | Exactly zero; timeout/error/termination uncertain => RECONCILING / STOP / manual review |
| Proof outputs | Minimal redacted JSONL request/response trace, bounded Result, actual local SHA-256 and process/source identity; new exclusive-create P2 artifact names |
| Credential boundary | Do not copy or print credentials; inherited Host auth environment and data access need separate explicit review and narrow permissions |

**Read-only sandbox is a requested Host policy, not proof of OS-level
isolation.** If the installed Host cannot credibly enforce bounded tools,
filesystem and network permissions for this fixture, do not execute P2.
A no-tools instruction is *not* by itself a permission boundary.

No model name, new P2 client hash, exact P2 path, effective cost limit,
native process permissions, OS sandbox attestation or final evidence
producer has yet been owner-approved; those are blockers, not defaults.

## 4. Required dispatch and evidence ordering

1. Verify reviewed exact client + native SHA and approved empty synthetic
   P2 root; record owner grant to single real Turn and unknown-cost exposure.
2. Persist exact approved Turn intent, no-replay status and timestamp
   **before** model dispatch. A launch cannot be inferred safe to repeat.
3. Send initialize/initialized; create exactly one ephemeral read-only
   thread/start; check accepted thread ID and *effective* returned policy.
4. Send exactly one turn/start bound to the same thread ID, model, sandbox
   and approved bounded fixed text.
5. Reject any unapproved server request/notification, mismatched or
   duplicate IDs, tool execution, approval prompt, write, new thread/turn
   or unexpected policy escalation.
6. Observe completed status and final text; require stderr/stdout drain,
   clean close, bounded redacted trace and no post-completion messages.
7. Store immutable result and bounded evidence digests without assuming
   Host events are independent verification. No automatic retry on crash.
8. A separate reviewer validates the exact sequence, process observation,
   cost/unknown usage, fixture bytes and permission controls; classify
   P2_SUCCESS_OBSERVED, P2_BLOCKED or P2_UNVERIFIED as appropriate.

## 5. Mandatory negative/offline tests before any Live approval

- No owner grant => zero App Server processes and zero model Turns.
- Failed identity, changed Fixture, stale client/protocol/sandbox => stop.
- Wrong thread/turn binding, duplicate responses, malformed JSONL,
  trailing bytes or post-completion event => stop without replay.
- Any tool event, approval request, sandbox escalation or unauthorized
  command => stop; report effects UNKNOWN until independently checked.
- Timeout/interrupt/process crash, output overflow, lost persisted
  reservation or duplicate invocation => never automatically restart.
- Opaque unknown subscription cost cannot be classified as $0.
- User repository/source and historical P1 Fixture remain untouched.

## 6. Before the owner could authorize P2 Live

**Must be separately decided and recorded:**

- P1 R3 independent adjudication or explicit limited exception rationale.
- Exact one-line prompt and expected JSON response/schema.
- Actual supported model ID and a bounded single-Turn cost exposure grant.
- P2 fixture root/source SHA, generated proof client SHA, actual native
  Codex version/hash, process environment and no-write/no-network guard.
- Executable policy enforcement proof and exact allowed notifications.
- Time limit, proof files, termination, evidence reviewer and fail-closed
  stop instructions.
- Owner's exact **P2 Live execution authorization**. Approval of P1 R3,
  P2 planning text or a general product-development request is NOT enough.

## 7. Later work that P2 cannot certify

Even a correct real response only shows one provider model Turn under the
observed environment. The product still needs actual Goal→Contract/DAG,
approved WorkItems, inspected source effects, independent test Evidence,
bounded Repair/recovery, target delivery, Objective Judge COMPLETE, both
new-project and existing-repository acceptance and eventually Claude Code
and Multi-Agent coverage.

No CodeFleet source-edit, deployment, main merge or automated model
execution is authorized by this document.
