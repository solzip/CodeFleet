# Objective recovery from the existing Store

## Environment-only reverification

`objective environment-step TASK REQUEST.json ENVIRONMENT.json --revision N
--request-id NEW_ID --expires EPOCH_MS` prepares an exact, one-hour-or-shorter
review of one settled `LOCAL_FAILED` attempt. It does not change files, activate
networking or issue a Decision. The environment proposal binds the prior failure,
an immutable diagnosis artifact and its observation, previous policy hash, and
the complete target Local policy. Diagnosis is operator-reviewed data; it is not
an independent sandbox attestation or permission grant.

The existing supervised same-user Local boundary accepts the exact new review
with `--trust HASH --acknowledge-unisolated`. Execution additionally requires a
trusted embedding `execution.environmentRecovery.observePolicy` function. There
is no CLI flag, environment variable or JSON substitute for this function. The
stock CLI can prepare a review but fails closed on execution without an observer.
Signed Operator enrollment still applies its guard. This is not autonomous
approval delegation or an authenticated multi-user Operator interface.

The observer must return a fresh `HostEffectivePolicyObservation` with actual
effective policy, source and supporting evidence. It must read the Host's applied
policy rather than echo the proposal. Approval applies to the target policy;
before issuance, reservation, spawn and result commit the observed policy must
match it. Pre-reservation/spawn/post-execution observations are immutable Evidence
artifacts. The core validates these observations but does not implement or attest
a Windows policy observer. Codex config/read alone describes configuration and
does not prove which sandbox is enforcing a running subprocess.

Same Candidate and exact original command/file digests are mandatory; workflow,
current task hash/revision, backend, policy, diagnosis, review and budget bind the
new one-use Decision. No Fileset is created and no source repair is fabricated.
Only one settled original failure may enter this route. A second failure or an
uncertain effect hands off without replay/refund. SQLite reservations and existing
leases, events and artifacts remain the sole execution state. Repeated request
IDs return recorded results; changed requests and old approvals are rejected.

The original failed evidence remains readable after the new evidence becomes
current through a validated environment-recovery link. Corrupt policy evidence
invalidates both recovery and Local completion. Local-only completion is derived
from actual current-candidate test evidence. Protected contracts remain incomplete.
See [the implementation run](../runs/2026-10-27/environment-reverification.md).

### Explicit Native Local environment recovery

The exact `nativeLocalPolicy` profile selects the existing `local` backend with
`EXPLICIT_LOCAL_TRUST`, filesystem/network isolation `NOT_CLAIMED`. This route
records `LocalExecutionContextObservation` (PID, runtime and executable), not a
Host policy attestation. A new hash-bound review and unisolated acknowledgement
are mandatory; Host permission to launch the ordinary user process is separate.
It does not disable a sandbox or grant a process permission to escape one.
MXC or other policy claims still require the trusted Host observer. Additional
or changed profile fields cannot select the plain Local exception.

Existing same-candidate, failed-evidence, one-use Decision, lease, command,
revision, budget and integrity checks remain. A LOCAL_ONLY task can complete
from independent passing Local evidence; PROTECTED_REQUIRED cannot. Existing
expired MXC reviews do not approve this profile. The backend identifier remains
`local`; execution context changes are bound in the new environment Review,
without rewriting the original workflow or its acceptance criteria.

`objective recover TASK_ID [BINDING.json] --state STATE_DIRECTORY` inspects the
existing Bootstrap Task, DAG, events, Filesets, approvals, reservations, leases and
Evidence. It never runs a model, materializes files, verifies a candidate, renews
authority, releases a lease or refunds budget. No new Goal engine, scheduler or
authoritative database is introduced.

The CLI opens the existing Store with `readOnly: true` (Node >=24.14.1).
It does not create the State directory/database, initialize tables, migrate schema,
set WAL mode or begin a write transaction. Connection-local `query_only` is an
additional safeguard; native SQLite read-only opening is the write boundary.
Recovery checks V2 task tables/columns and supported extension versions without
installing missing extensions. Reservation tables may both be absent before any
Decision; partial or unsupported reservation schemas fail closed. Old V1 states
require a separately authorized migration, never an implicit recovery upgrade.
Malformed databases fail closed, and construction failures and CLI exits close
the connection. Default writable Store construction/migrations remain unchanged.

Reservation inspection on this connection reads the existing committed-status
projection without initialization or a write transaction. Consumption, expiry,
revocation and uncertain-effect checks are preserved; observation is not a lock
or new execution authority. WAL/SHM coordination may change physical sidecars;
logical immutability is distinct from byte immutability of an active WAL database.

The returned `binding` contains Task revision/hash, Workflow hash and current
Local candidate hash. A later session can supply that exact object as BINDING.json;
any mismatch removes the next action and requires human review. A conversation
summary is not a supported binding. A packet is an observation, not a signed
authority or a lock: every eventual effect still uses the existing live fences.

For a prepared Objective, retain the full recovery JSON outside the project source
before a session/context handoff. Pass it unchanged as the optional input to the
same `objective recover` command after resuming. Its `checkpoint` binds the Task,
Workflow and Candidate plus Work Log and execution-state observations (Filesets,
approvals, leases, reservations, budgets, WorkItems and judgments). The checkpoint
is a comparison token, not an authenticated approval or a second state store.
Unknown authority fields, a foreign Task or malformed hashes fail closed. The
legacy four-field binding remains supported and is labelled LEGACY_BINDING_ONLY.

`synchronization` identifies changed revision, Task, Workflow, Candidate, Work Log
or execution state. Any checkpoint mismatch removes the next action and requires
fresh review; it does not migrate approvals or reset completed items, Evidence or
budget. Retained completed item IDs are derived from current persisted state, not
the conversation or supplied report. An absent checkpoint is INITIAL_OBSERVATION,
not proof that prior context was retained. This comparison supports Host recovery
instructions; process-level tests do not prove that an actual Codex compaction
event occurred. Explicit in-place contract changes use the supervised revision
path below; recovery itself never applies a changed contract.

### Supervised semantic contract revision

`objective revision-review TASK PROPOSAL.json` accepts `{revision,draft}`, where
revision is the current operational Task revision. It validates the complete
replacement Draft and returns an expiring review bound to the Task, candidate,
old/new Workflow, unchanged budgets and acceptance mode. After explicit user
review, `objective revision-accept REF --trust HASH --acknowledge-unisolated`
applies one atomic transition using existing SQLite, artifacts and Work Log.
`objective revision-revoke REF` withdraws a pending review.

The separate `contractRevision` starts at 1 and advances only for semantic changes.
Fileset and test records continue advancing Task revision independently. Changed
items and their downstream closure reopen; unaffected completed items remain.
Unmapped/global requirement changes conservatively affect all items. Pending
Filesets need fresh review. Unconsumed Decisions are revoked; consumed Decisions,
Attempts, budgets, source receipts and historical Evidence are retained.

An unaffected prior verification may admit dependencies as LOCAL_CHECKPOINT only
when its recorded prerequisite/test digests remain intact. It is not a pass for
the new contract. Final Local acceptance requires fresh integrated Evidence for
the current Workflow and candidate. Protected-required completion remains blocked
without Protected Evidence.

This bounded route preserves WorkItem identities, kinds, fixed test paths/mapping,
existing acceptance criterion IDs, budgets and trust mode. It supports reopening
materialized source in EXISTING_LOCAL; NEW_PROJECT can revise pending source work.
It rejects active leases, uncertain effects, unresolved failed execution, source
drift and stale/expired/revoked reviews. Enrolled signed Operator tasks require
their own trusted revision issuer and cannot use this same-user supervised path.
Contract approval never grants file or command execution, model invocation or
authenticated public delegation. Separate-process tests are internal acceptance,
not Codex Host Live or compaction certification.

Recovery returns Objective criteria and scope, effective WorkItems, remaining work,
Capability/approval requirements, approval rows and present validity, persisted
attempt/time consumption, Fileset and candidate hashes, Decision consumption,
leases, uncertain effects, Evidence references, Judge results and work-log hash.
The latest 30 task events are included; full events remain in the existing Store.
Task updates log their resulting revision; durable verification logs its bound
pre-execution revision and advances the Task once. The recovery projection checks
this distinction instead of rewriting historical events.

Host model request counts and dollar usage are `UNKNOWN`. Task numeric budgets do
not establish Host billing enforcement. No budget is reset by a session change.

`RECOVERED` means that the observation can identify the next review/proposal step;
`executionGranted` and `modelInvocationGranted` remain false. Expired or removed
Fileset approval does not admit materialization. Old verification decisions remain
consumed/expired/revoked and are never converted into a new grant. An issued but
unreserved decision is reported, not automatically dispatched. A new effect needs
the current exact review and appropriate authority.

Reservations interrupted before spawn, after test exit or after Evidence creation
but before final commit remain unconfirmed. Inspection cannot infer test success
from uncommitted bytes. It preserves reserved attempts/time and returns
`RECONCILE`/`HUMAN_HANDOFF`. Partial source creation also stays unresolved, even if
its bytes match a proposal. Public `materialize` now requires an unstarted approved
Fileset. Existing lower-level reconciliation mechanics are not a public replay grant.

Missing/corrupt receipts, Evidence or contradictory revision/work-log records block
the affected recovery. Candidate drift and a stale caller binding do not erase
old results. After a valid downstream creation, A's `LOCAL_CHECKPOINT` is history;
only fresh integrated Evidence describes the new candidate. Protected-required
completion stays blocked. This change does not add the P0-E Local-only Judge policy.

The same-user SQLite/Local trust boundary is unchanged. Recovery does not attest
an attacker-controlled database or prevent concurrent filesystem effects. It checks
Task/event/candidate consistency during observation; actual execution revalidates
approvals, capability, leases and budgets independently.

After a new Host session or context loss, reread current user instructions, run
recovery against the authoritative State directory, and inspect blockers before
preparing a new exact request. Do not execute from a copied summary, revive a
consumed request, or rerun uncertain effects. The Host performs its own compaction.
Separate-process tests are not evidence of actual Codex session or compaction recovery.

## Unprepared Draft recovery

An intact NEW_PROJECT draft without a Bootstrap workflow returns RECOVERED at stage DRAFT, with REVIEW_DRAFT or PREPARE_WORKFLOW as its next action. The read-only path verifies stored plan and task revision/hash. Existing run or preparation events with missing workflow metadata still fail closed. Recovery grants no execution permission.
