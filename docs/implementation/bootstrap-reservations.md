# Durable Bootstrap Local execution reservations

## Current public boundary after AB1

Public `objective authorize-local` and `objective verify --decision/--request-id`
are **BLOCKED_OR_UNSUPPORTED**, exit 1, before opening Store or reading JSON.
They reuse the existing production Host isolation gate. No supported authenticated
Bootstrap Operator runtime is connected; a future generic Host runtime alone
does not enable these commands. Actor strings, environment flags, arbitrary
decision JSON and old stored decisions cannot enable public durable execution.

The existing `issueDecision` and `executeDecision` API names also fail closed.
`issueOfflineDecision` and `executeOfflineDecision` below retain trusted **offline
embedding mechanics**, not authentication APIs. No public CLI/IPC route calls them.
Tests use an explicitly named driver under `test/fixtures/` for real-process
reservation mechanics; this is not a production Operator path or proof of
Operator authentication. Arbitrary same-user module imports or modified code
cannot be contained by this library; the public entry points fail closed.

Existing decisions and Evidence are preserved without provenance migration,
refund, retry or automatic execution. Use `objective reservation` for historical
results and `objective revoke-local` to remove remaining authority; the actor
on revocation remains an audit label, not identity proof. Revocation never grants
execution. An unconsumed row is historical ISSUED/NOT_RESERVED, not an executable
approval. Public `verify --decision` is blocked even for a prior completed row;
read-only status may still report its independently checked historical result.

Tasks with a durable decision still reject the old hash-only trust route. The
existing explicit-trust Local verification for other Tasks and Fileset approval
contracts are unchanged. Those paths are not an OS identity boundary and are
not a fallback for an uncertain durable decision. No new Docker prerequisite is
introduced: when the required identity capability is absent, execution is blocked.

## Retained offline mechanics

Scope: NEW_PROJECT, one trusted Operator decision, one Local verification launch,
single concurrency per canonical repository in the existing Store, no automatic
repair or retry. This is an opt-in trusted local CLI/embedding contract. It is
not the OS-authenticated Host Broker and never enables public Host
`requests/submit/run/resume`. Same-user code can edit the database or invoke other
programs; this contract is not an isolation or anti-tampering boundary.

## Review and explicit decision

`objective verify TASK ITEM REQUEST.json` reuses the existing command/tree and
Bootstrap repository/dependency inspection without executing or granting trust.
The retained offline decision schema (public issuance is blocked) is
`DECISION.json` for
`objective authorize-local TASK ITEM REQUEST.json DECISION.json`:

```json
{
  "decisionId": "unique-operator-decision",
  "requestId": "different-unique-request",
  "actor": "operator",
  "revision": 7,
  "commandHash": "exact-inspected-command-hash",
  "acknowledgeUnisolated": true,
  "expiresAt": 0,
  "maxExecutions": 1,
  "timeBudgetMs": 60000,
  "maxConsecutiveFailures": 1
}
```

This illustrative object intentionally cannot authorize execution: the Operator
must supply the current revision/hash and an explicit future expiry in Unix
milliseconds. The command JSON uses existing executable, args, directory and
timeoutMs fields. No default expiry, budget, decision or future candidate is
issued. Actor is a local audit label, not OS authentication or proof of human
presence. The caller is trusted under the existing explicit Local execution
contract. Agent ingress receives no new decision/execute method.

The stored binding also fixes the full Task hash, workflow hash, WorkItem,
repository identity, candidate tree, executable path/hash, argument array,
timeout, Local policy and file digests. A decision requires distinct IDs separate
from commandHash; it never migrates a historical hash or memory token. Issuance
does not execute. Repeated issuance with the same ID fails rather than replacing
the old decision. Revocation is permanent via
`objective revoke-local DECISION --actor operator`.

The blocked public execution syntax is `objective verify TASK ITEM REQUEST.json --decision DECISION
--request-id REQUEST`. Exact stored canonical paths/arguments must match.
`objective reservation DECISION REQUEST` reads the durable outcome. Once a Task
has a durable decision, its old `--trust` execution route refuses to run. Existing
Tasks without durable decisions and standalone `verify-local` retain explicit
per-invocation Local trust; neither is a durable automatic replay interface.

## SQLite and state transitions

The additive `bootstrap-reservations` extension version is checked in the
existing `workflow_extensions` table. `bootstrap_decisions` records ID, unique
request ID, Task FK, immutable binding JSON, issue/expiry/revocation/consumption
times and remaining execution count. `bootstrap_reservations` records the unique
request/decision, existing Run FK, Task FK, source revision, canonical repository,
state and reservation body. A partial unique repository index covers RESERVED,
STARTED and HUMAN_HANDOFF. Windows canonical repository keys are case folded.
The protected `workflow_attempts` schema and foreign keys are unchanged.

One `BEGIN IMMEDIATE` transaction checks the current Task/workflow/policy,
dependencies, decision validity, previous attempts and budgets; inserts a typed
`bootstrap-verification` Run with its owner/lease; consumes the decision; reserves
the attempt and timeout allocation; and writes the existing Store event. The
random owner UUID is also the fencing token, following existing Store ownership
semantics. An insertion/event failure rolls the entire reservation back.

The launch count is one per decision. Total reservations cannot exceed the
Task's existing maxAttempts; any prior non-pass stops further execution. Summed
reserved time cannot exceed the Task timeoutSeconds budget. The full command
timeout allocation is retained after success, failure or interruption, without
refund. The decision's elapsed time budget starts at reservation, including
preparation. Changes require a separately reviewed Task/decision, never an
automatic budget reset. Model cost is not incurred by this path; it launches no
model and makes no model-cost measurement claim.

Immediately before spawn, the Local Backend's trusted callback repeats the
existing asynchronous repository/tree/executable inspection, then synchronously
checks current revision, workflow, dependencies, capability/policy, decision,
lease/fence, cancellation and deadline in a transaction. STARTED launch intent is
persisted before dispatch. The backend creates and consumes its existing memory
token only for this reserved invocation. During execution, the existing process
runner polls cancellation, expiry, revision and fence; existing Store heartbeat
extends only the matching, still-valid owner. No lost/expired lease is revived.

## Evidence and recovery

The existing content-addressed artifact binds decision, request, attempt, source
revision, workflow, candidate, command and owner/fence. An observation event
retains the artifact reference even if attachment fails. After re-reading the
artifact, final fencing and Task CAS, terminal reservation/Run state, Task evidence
attachment and completion event commit together. Artifact writes are outside the
SQLite transaction; a crash can leave an unattached artifact. It is never promoted
or used to rerun automatically. Status/report checks reject substituted or
misbound durable evidence. Same-user database rollback/tampering is outside this
Local trust boundary, as in the existing Store contract.

Duplicate request IDs return the original reservation/result. Dead PID, expired
lease, changed owner, elapsed budget or uncertain RESERVED/STARTED state returns
HUMAN_HANDOFF without restoring approval or budget. A crash before confirmed
spawn is deliberately conservative. Uncertain reservations keep the repository
blocked in this Store. There is no automatic reclaim, force-unlock or reconciliation
write API in this slice: inspect effects and obtain a reviewed follow-up recovery
contract before clearing uncertainty. Do not edit the DB to manufacture approval.

Local results remain LOCAL_EXECUTED / UNPROTECTED, protected verification
UNSATISFIED, complete false. Protected Judge remains ESCALATE. These commands
cannot establish Host Live or Objective acceptance.

## Limits and verification

The boundary protects cooperative processes sharing one intact SQLite Store.
Separate copied/rolled-back Stores, malicious same-user programs, external
effects and files changed in the final inspection-to-spawn race are not contained.
Polling cancellation cannot reverse effects already performed. Killing the
Worker may leave descendants alive; interrupted fixtures use bounded children
and wait beyond their bounded lifetime without claiming universal cleanup. No cross-platform
guarantee follows from Windows tests. The private `hooks` embedding seam is used
only for fixture fault injection and is never accepted from CLI JSON.

See [implementation evidence](../runs/2026-10-23/durable-reservation-p1-b.md)
and `test/bootstrap-reservations.test.mjs`. Multiple sequential WorkItems need a
separate approved contract for per-item decisions, cumulative budget allocation,
revision transitions and reconciliation. These records provide reusable bindings
but do not authorize that extension.
