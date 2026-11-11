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

## 8. Offline protocol candidate implementation (Draft PR #26)

An offline-only, **non-executing** protocol state machine is proposed in
tools/proofs/p2-readonly-offline.mjs. It binds the expected Codex 0.167.0
initialize response to exactly one ephemeral read-only thread/start, checks
the effective returned Thread policy, emits exactly one read-only turn/start
with networkAccess=false / approvalPolicy=never, and requires a full
completed Turn with one final agentMessage that matches a fixed JSON schema.

The offline JSONL parser rejects duplicate/mismatched RPC responses,
unexpected server requests, unapproved notifications including the new
thread/section/changed event, tools of every kind, partial trailing bytes,
malformed frames, oversized lines/output, abnormal close and multiple
completion. It records no raw model output or account metadata in its
bounded synthetic receipt. Its CLI does **not** expose --execute, --model,
--grant, a native executable path, or any process spawn.

The fake-protocol regression is integrated as an explicit
npm run test:p2-proof-offline step on Windows and Linux. This is a design
and offline validation advance **only**, not an actual Codex model Turn.
The requested Host sandbox and the model's natural-language instruction
are not independent OS isolation or an enforceable cost cap. A real P2
Live client must separately implement durable one-shot reservation,
approved identity/policy/cost fencing, bounded process shutdown, redacted
Evidence and independently observed effects **before** any P2 owner grant.

Status remains P2_OFFLINE_PROTOCOL_CANDIDATE / P2_LIVE_NOT_AUTHORIZED /
OWNER_COST_APPROVAL_NOT_GRANTED / MODEL_NOT_SELECTED.

## 9. Experimental durable no-replay intent (offline-only, Draft PR #27)

The pure one-Turn protocol validation alone does not demonstrate a durable
reservation before an actual process could launch. Draft PR #27 adds an
internal-only synthetic one-shot journal in
tools/proofs/p2-one-shot-offline-intent.mjs.

It accepts **only an already-existing, isolated synthetic test root** named
codefleet-p2-*, a fake or owner-reviewed absolute executable with an exact
SHA-256, a reviewed P2 protocol source SHA-256, bounded model ID and
timeout <=90000ms. It rejects a nonempty root, alias/symlink roots, bad
hashes and changed content. After every precondition, it exclusively
creates p2-offline-intent.json with wx/0600 and fsync, then reobserves
the stored content and the pinned identities. A competing or repeated
reservation fails without overwriting the original. A partial/corrupt
intent also remains occupied and **is never auto-deleted or replayed**.

The journal always records executionAuthorized=false,
ownerApproval=NOT_GRANTED, replayAllowed=false,
unknownSubscriptionCost=true and hostLiveVerified=false.
The diagnostic command-line entrypoint accepts **no arguments** and
cannot create a file, spawn Codex, grant a model or authorize execution.
This code exists only for disposable offline tests of a future one-shot
fencing primitive; it is **not** a production authenticated reservation
broker, protected filesystem boundary, executable P2 proof client,
billable-cost authorization or proof of the absence of external effects.
Local checksums are not authenticated signatures.

The P2 offline CI test script runs both the pure protocol and the one-shot
journal's synthetic contention, replay, tamper, partial-failure and
bad-identity tests on Windows and Linux. Future live P2 needs an
independent actual source/process/grant admission design and OS-specific
permission checks before the first real Turn. No live authority or cost
exposure is implied by this test-only journal.


## 10. Synthetic child-process transport and redacted Evidence (Draft PR #28)

The offline-only P2 protocol and durable-intent prototype are now
exercised through a **real Node child process running only the fixed
in-repository fake App Server**, not a native Codex process, user model
Turn or billing endpoint.

- Synthetic runner source: tools/proofs/p2-synthetic-executor.mjs
- Fixed fake process: tools/proofs/p2-synthetic-appserver.mjs
- Synthetic negative/evidence tests: tools/proofs/p2-synthetic-executor.test.mjs
- Future real Codex execution: intentionally unavailable; no
  executable-path argument, --execute flag, cost approval, external
  auth, non-synthetic Host path or Objective grant exists.

The synthetic runner first rechecks an existing pristine synthetic
p2-offline-intent.json (with its reviewed P2 protocol SHA and proposed
model), then writes a **new exclusive-created, fsynced**
p2-synthetic-launch-reservation.json BEFORE the fake child can spawn.
Repeated/concurrent calls or occupied/partial evidence roots fail
closed without overwrites, cleanup or retries.

The fixed child receives exactly the bounded initialize/thread/start/
turn/start sequence from the existing protocol state machine. Its
stdout is processed by the existing bounded P2 JSONL parser. This
offline harness rejects Host tool notifications, server approval
requests, unexpected 0.167.0 notifications, escalated sandbox policy,
wrong Turn ID, duplicate completions, incorrect output schema, stderr,
incomplete JSONL, nonzero exits and process deadlines. No other Host
process is a permitted target.

It writes only a synthetic launch marker, a **minimal redacted method
and response-ID trace**, and a result file. All Evidence is written
exclusive-create; the local read-only synthetic reviewer validates the
trace SHA-256, original offline intent binding, marker and result
consistency. Method names are allowlisted/truncated, and fake account
metadata payloads or model content are not recorded in the trace.
Both passed and failed records MUST retain:

- simulationOnly: true
- nativeCodexStarted: false / modelTurnsActuallyRun: 0
- ownerApproval: NOT_GRANTED / executionAuthorized: false
- hostLiveVerified: false / appServerExecutionAuthenticated: false
- usageStatus: UNKNOWN / replayAllowed: false

This is **not** a native Host runtime proof, an authenticated owner
grant, sandbox enforcement attestation, cost-limit enforcement or a
live P2 readiness certificate. A real P2 Live runner still requires
a new reviewed implementation and exact owner-approved one-Turn
model/cost/Host/fileroot/provenance authorization. The preexisting
P1 R3 Evidence and initial failed P1 attempt are untouched.

## 11. Native Codex identity preflight (read-only; Draft PR #29)

The P1 R3 native Codex Windows candidate was reported as @openai/codex 0.167.0
with SHA-256 EDFDD48F8B458AF0906E507B4CB05217B326C3D6E515E9F024E05E3B8D650F70.
The owner-observed model/list named gpt-6.1-sol as the default model.
These are candidate observations, not independent process provenance or a cost grant.

tools/proofs/p2-native-preflight.mjs implements a non-launching, read-only
--inspect command for a *separately authorized and already-existing* private
CodeFleet-P2-Live-* Fixture that contains only p2-native-manifest.json and
an empty proof-artifacts directory. It binds exact SHA-256 identities of the
Codex native executable, candidate preflight source, P2 protocol source and
manifest. It validates model/timeout/ephemeral/never/read-only/no-tool-network
candidate fields and refuses symlinks/Junctions, extra files or occupied
Evidence. Its canonical Manifest cannot self-promote approval or cost rights.

Result: P2_NATIVE_CANDIDATE_FILES_OBSERVED_NOT_AUTHORIZED.
Execution, native child process spawn, file writes, owner authorization,
AuthentiCode certification, OS sandbox certification and metered cost caps
remain impossible to conclude from this preflight. It always returns
executionAuthorized=false, ownerApproval=NOT_GRANTED, nativeCodexStarted=false,
modelTurnsActuallyRun=0, authenticodeVerified=false, costCapEnforced=false,
osSandboxEnforcementVerified=false, hostLiveVerified=false, replayAllowed=false.

The CLI accepts exact --inspect + six path/hash args only. No --execute,
fixture creation or owner grant command is implemented. The root must be
prepared and exact hashes independently reviewed in a later, distinct scope.
CI runs synthetic fake-codex.exe checks on Windows and Linux; no actual Codex.
A separate real native P2 runner and final owner model/cost/permissions grant
are still required.

## 12. Owner-acknowledged native one-Turn candidate and separate reviewer (Draft PR #30)

The candidate native P2 runner source is tools/proofs/p2-native-turn-executor.mjs.
It has an ordinary dry-run default. Its manual --execute path requires
*both* the unique P2 one-Turn acknowledgement and the independent explicit
acceptance of UNKNOWN subscription/billing risk. It rechecks the already
reviewed native Windows codex.exe, P2 protocol, read-only preflight,
canonical private Fixture and *its own exact executor SHA-256* before
an exclusive synced launch marker is created. Only after that marker,
the runner can call native codex.exe with the fixed app-server stdio
and strict-config argv. No retries, no automatic model selection,
at most one ephemeral Thread and one sandboxed read-only Turn are requested.

The existing strict P2 protocol state machine rejects unexpected
notifications/approval requests, tools, unbound events, duplicate Turns,
bad JSONL and unexpected output. The runner drains stdout/stderr and
process-close with a 90s maximum Turn deadline and a bounded extra
shutdown interval. A failure/timeout leaves the one-shot marker occupied;
it must never auto-replay or delete the private Fixture.

It persists only a minimal redacted method/response-ID trace and one
small result, both exclusive-create. No raw model final text, account
credentials, Host stderr or private input are stored. The separate
read-only tools/proofs/p2-native-evidence-review.mjs validates actual
local file hashes, fixed-method trace, unique Turn dispatch, result
consistency, and that no unsupported owner/Host/cost claims are made.

**Critical limitations:** A CLI acknowledgement is NOT a cryptographic
owner identity proof, a provider spending cap or an OS sandbox attestation.
The runner explicitly returns ownerIdentityIndependentlyAuthenticated=false,
readOnlyEnforced=false, appServerExecutionAuthenticated=false,
costCapEnforced=false, costStatus=UNKNOWN, p2Accepted=false,
hostLiveVerified=false and replayAllowed=false even when its
protocol-level Turn completes cleanly. Native Codex 0.167.0 remains
unrun in this development step. All CI child-process tests replace the
native executable via a fake Node App Server injection and report
syntheticTestAdapter=true / nativeCodexStarted=false.

NO actual P2 Live command or billable Turn is approved by this document
or its Draft PR; independent P1 owner adjudication and a separate signed
off owner decision about model, unknown cost exposure, identity,
private fixture, OS sandbox and exact one-shot run are required.
**Never copy the CI simulation approval environment into the owner's PC.**

## 13. Follow-up: fail-closed native process dispatch

Two fixed environment acknowledgement strings and pinned SHA identities are
insufficient to independently authenticate the Owner or enforce a model
spending limit. Before this change, both strings could enter a real native
spawn path. This was NOT a granted P2 Live execution authority.

The public `--execute` path now always blocks before any reservation or native
process, including when all hashes, model and both static acknowledgements are
supplied. The default production native spawn fallback has been removed.
The bounded transport is exercised only through an injected synthetic test
adapter after exact checks of the fixed fake-executable fixture bytes. Its
success result is `P2_SYNTHETIC_TURN_OBSERVED_NOT_LIVE`; the separate reviewer
rejects claims of native process/model execution and never certifies P2 Live.
An injected adapter is only a testing seam, not a robust security boundary
against arbitrary code running with the same OS account permissions.

Before restoring live dispatch, require independently authenticated Owner
one-Turn authority, actual Windows executable signer/provenance and OS process
permission review, separately accepted unknown cost exposure, sandbox and
tool-network enforcement, one-shot no-replay and independently reviewed actual
process/effect Evidence. This Draft change performs zero real Codex Turns.

### Synthetic process environment restriction

The injected fake App Server no longer inherits Host account credentials,
authorization strings, secrets or NODE_OPTIONS. Its child environment includes
only selected PATH/SystemRoot and temporary directory variables required for
cross-platform process setup. Regression tests verify the actual spawn options.
This is synthetic test hygiene, NOT native process, billing, filesystem,
network or sandbox isolation proof.
