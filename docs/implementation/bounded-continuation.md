# Bounded continuation — P0-A internal contract

The [Product Charter](../PRODUCT_VISION.md) governs this contract. Codex is the
first acceptance Host; this does not introduce a Codex-specific engine.

`continueOfflineWorkflow` in `src/product/continuation.mjs` reuses
`continuationSnapshot`, `bootstrapActions`, `continueOfflineWorkItem` and the
existing durable Reservation/Attempt/Lease/Evidence path. It is an internal
trusted embedding entry point, without a public CLI or IPC route.

## Scope and authority

The caller supplies a restrictive ceiling: starting Task revision, Workflow hash,
an exact list of WorkItem IDs and command requests, total Attempt and reserved-time
ceilings, expiry, and `modelCalls: 0`. Files, dependencies and acceptance criteria
remain bound by the existing Workflow and exact Decision candidate hashes.
The ceiling is not authenticated approval and never authorizes an execution.

For each eligible local-verification WorkItem, an external trusted
`obtainDecision` transport must supply a fresh exact Decision/request pair.
An existing `BootstrapOperator` embedding may use its request/accept verification
methods here. The coordinator holds no signing key and calls no issuance API.
The existing reservation path checks signature where enrolled, revision, candidate,
command, approval expiry/revocation, capability, lease and budget, and atomically
consumes the Decision with a new Attempt. Public protected execution stays blocked.

An external transport can implement an independently authorized preapproval policy
only where its actual trust boundary exists. This change supplies no such public
policy issuer. Same-user Native Local exact review remains supervised. A callback
or scope JSON supplied by an Agent is not proof of human authorization.

## Progress and stopping

Only a successful independently observed Local verification permits selection of
the next dependency-ready item. Each successful reservation attachment accounts
for one Task revision increment; other Task/plan/settings changes stop the loop.
Scope membership, exact request integrity and persisted total budget are rechecked.
Missing/new/out-of-scope decisions wait for the Operator. Failure, uncertain effects,
cancel, expiry/clock rollback, changed binding, consumed decision, evidence defect
or exhausted budget stop execution. This slice does not generate or apply repairs.

The expiry/cancellation check is also passed into execution. External decision
transport must return control; the coordinator does not terminate that transport
or claim to cancel its external effects. No model call is made; model price and
usage are unknown, not measured zero-cost execution.

The existing Store retains a scope artifact and start/stop events. Reservation
events and artifacts retain exact Decision, Attempt, candidate and Evidence
references. No new state store, scheduler, automatic uncertain replay or budget
reset is introduced. A subsequent call must reconcile current persisted state and
provide a matching starting revision; prior Attempts still count toward ceilings.

Local Evidence stays `UNPROTECTED`; `complete: false` and the protected Judge
handoff are preserved. Local-only completion policy is a separate P0-E change,
not a retroactive relaxation of this Workflow's protected criterion.

## Signed verification delegation (2026-10-28)

The existing `BootstrapOperator` now supports `requestDelegation`,
`acceptDelegation`, `issueDelegatedVerification` and `continueDelegation` for a
bounded batch of pending Local verification WorkItems. The external enrolled
Operator signs one exact request; acceptance is consumed once in the existing
Work Log. The coordinator receives an artifact reference, never a signing key.
Every selected WorkItem still receives a distinct one-use Decision through the
existing reservation transaction. No new database, daemon or execution engine
is added. Signed root revocation is checked again before spawn and commit.

The root binds objective/workflow, starting revision, acceptance mode, repository,
file scope, runtime profile, exact executable/hash/arguments/candidate, total
persisted Attempt/time ceilings, expiry and `modelCalls: 0`. This deliberately
supports verification of an already reviewed candidate, not arbitrary future
source candidates, Filesets, model calls or monetary-budget enforcement. Local
commands are unprotected; file hashes are integrity checks, not OS containment.
Changed settings/plan/acceptance, unexpected revisions, candidate/command drift,
expiry, observed expiry followed by clock rollback, revocation, lost lease,
pending issued WorkItems and uncertain/failed effects refuse further issuance.
Only successful verification attachments can advance the delegated revision.
Reopening with the same trusted enrollment reuses persisted consumption and may
continue remaining work. It never reissues an already-issued WorkItem.

The public Host boundary remains unavailable. A fixture signature, Agent-created
key, caller JSON or this artifact reference cannot enable public autonomous
execution. This is a trusted embedding implementation, not a deployed approval
service. Source/repair delegation and general requirement revision migration
remain unsupported; use the existing separately approved repair path.

The continuation loop now returns COMPLETE_LOCAL when the existing Local-only
Judge proves all criteria, instead of converting completion into Human Handoff.
Protected-required completion is unchanged. This corrects the loop projection;
it does not weaken the Judge or reinterpret historical Protected results.

For supervised Local use, `objective local-review TASK REQUEST.json [REPAIR.json]`
generates/persists the current revision, request ID and expiry. After exact user
approval, `objective local-accept REVIEW_REF --trust REVIEW_HASH
--acknowledge-unisolated` consumes that request through `nativeLocalStep`.
Approval is still required, but users no longer construct these internal IDs.
New processes read the same prepared packet and consumed requests only report
their recorded result. Changed candidates hand off without refreshing consent.


## Existing-project supervised Local entry

Creation-only --local-existing selects EXISTING_LOCAL, separately from the existing
Protected/G3 path. It snapshots observed Git identity/HEAD/status and bounded
working-tree contents. ExistingLocalDraft reuses the existing DAG and validators;
plannedTests remain immutable existing inputs with no writing owner. Initial
version 1 support is replacement of existing src/**/*.mjs modules only.
Version 2 explicitly opts into bounded general text sources and new source files.
It uses a distinct policy hash; old contracts and Evidence retain version 1.
Each WorkItem must contain only creates (baseSha256 null) or only replacements
(exact recorded baseSha256). Existing tests remain frozen baseline inputs. No Git init/commit
or uncommitted-content reset occurs in this product path.

host files accepts exact WorkItem replacements with baseSha256. The existing
modify materializer enforces fileset hashes, baseline bytes, dependencies,
approval and lease. local-files-review persists the current revision/candidate,
Fileset and bounded expiry. local-files-accept requires the exact review and
explicit same-user Local acknowledgement. It never establishes independent
Operator authentication or public delegation; registered Operator gates remain.

After each application, recover/status provides the next eligible WorkItem.
Final local-review/local-accept uses the existing durable Decision/Reservation
and Evidence/Judge. Completed applications only report receipts on replay.
The supervised actual two-implementation result and limitations are recorded in
[the acceptance run](../runs/2026-10-28/public-existing-local.md).
