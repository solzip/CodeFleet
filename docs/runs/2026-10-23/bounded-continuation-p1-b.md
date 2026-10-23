# P1-B: bounded continuation contract decision

Status: **HUMAN_HANDOFF — proposed contract, not implemented or approved**.

Local main and GitHub main were both `6daff35c1f1903de92de7502cc331be4f1ceabaf`.
The [P1-A report changes](agentic-continuation-p1-a.md) remain uncommitted local
work, not functionality published on main. Existing worktrees and P0-B records
were preserved. Environment: Windows PowerShell / Node 24.14.1.

## Evidence and actual boundary

P0-B Task `task-95efc7f6-c13b-4ca7-9b0e-6b739ff647e7` remains revision 7.
Its six passing tests and artifact
`642811a150845b4dedc66e6541b55a3c17071d28da96c95f63ef447b760b9e0d`
are LOCAL_EXECUTED / UNPROTECTED, Judge ESCALATE, Protected Verification
UNSATISFIED and complete false. They authorize no new execution.

The new isolated fixture counterexample invokes `objective verify` from two
separate CLI processes with the same inspected command hash. Both execute two
native tests and report LOCAL_FAILED (native test exit 1, CLI exit 2). The Task
has maxAttempts=1, but revision advances twice, two distinct verification artifacts
are recorded, and workflow_attempts contains zero reservations. The test succeeds
by observing this limitation; it does **not** certify cross-process replay safety.
Each fixture invocation was explicitly requested for this counterexample; no
production or P0-B approval was reused.
When the durable decision contract is implemented, replace this characterization
with a cross-process duplicate-rejection test. Repeated execution is a measured
gap, not a permanent compatibility promise or an acceptance criterion.

The digest identifies executable/arguments/tree/timeout/policy. It is not an
Operator decision ID, expiry, revocation record, remaining budget or durable
consumption receipt. Each current CLI invocation represents new explicit trust.
Wrapping these calls in a loop would silently invent a broader approval contract.

## Existing implementation to reuse

| Concern | Existing code | Limit for Bootstrap local continuation |
| --- | --- | --- |
| Controller, budgets and child recovery | [controller](../../../src/alpha/controller.mjs) | Protected Workflow contract and accepted child evidence are assumed |
| Dependency selection | [definition](../../../src/workflow/definition.mjs), [Bootstrap](../../../src/workflow/bootstrap.mjs), [report](../../../src/product/report.mjs) | P1-A continuation is advisory, not a reservation |
| Exact Fileset approval and materialization | [tasks](../../../src/product/tasks.mjs), [persistence](../../../src/workflow/persistence.mjs) | Approval binds a Fileset Run revision/hash; it does not approve a test command |
| Local trust and execution | [backends](../../../src/verification/backends.mjs) | One-use token is in a process-local WeakMap; no durable decision consumption |
| SQLite, attempts, lease fencing | [Store](../../../src/alpha/store.mjs), [persistence](../../../src/workflow/persistence.mjs) | Existing reserve requires a Workflow run/source/graph. A product_tasks row cannot simply be passed to it |
| Cancellation and reconciliation | [controller](../../../src/alpha/controller.mjs), [process](../../../src/alpha/process.mjs) | Local cancellation exists, but no persisted Bootstrap verification STARTED/recovery fence |
| Evidence and verdict | [tasks](../../../src/product/tasks.mjs), [Judge](../../../src/alpha/judge.mjs) | Revision CAS prevents stale attachment after execution; it is not a pre-spawn authorization guard |
| Host boundary | [Skill installer](../../../src/hosts/install.mjs), [Host CLI](../../../src/hosts/cli.mjs) | Agent proposes; Operator approves/applies/verifies. Public execution/Broker gates stay blocked |

## Minimum contract requiring separate approval

This is a reviewable proposal, not a new public API or grant already issued.

1. **Scope.** One trusted Operator decision for one exact execution, not a general
   session/Agent grant. Bind decision ID and request ID to Task ID, exact current
   Task revision, workflow hash, WorkItem ID/kind, repository identity, command hash,
   candidate tree hash, executable hash, timeout and explicit unisolated acknowledgement.
   Fileset application keeps its separate existing hash-bound approval. A declared
   actor string does not establish OS authentication or authorize public Host ingress.
2. **Validity.** Record issued/expires/revoked/consumed state and a maximum of one
   launch. An expired, revoked, consumed or mismatched decision grants nothing.
   Never migrate an old CLI hash or token into a standing grant. If a report or
   completed operation changes Task revision, the next decision must bind the new
   revision; future unknown candidates/commands need fresh inspection and approval.
3. **Bound.** A separately approved bounded run identifies allowed WorkItems and
   finite total launches, wall-time and consecutive failure limits. Proposed first
   pilot: single concurrency, one verification launch, no automatic repair/retry,
   stop on first failure. Later finite multi-step runs may advance only when the
   next exact operation already has a current independent approval. Unknown model
   cost is unknown, not zero; no new model invocation is implied by this contract.
4. **Atomic reservation.** Reuse the existing SQLite transaction/event/Run/Lease
   primitives. An additive typed Bootstrap execution record must bind the approval
   decision, attempt, source Task revision and owner fence, and reserve budget and
   consume the decision atomically before spawn. Do not insert a Bootstrap task
   into protected workflow_attempts without adapting its contract and foreign-key
   ownership. No second state database or scheduler is proposed.
5. **Execution fence.** Recheck repository, dependencies, current policy/capability,
   expiry/revocation, revision, remaining budget, owner/fence and exact hashes at
   admission and immediately before spawn. Only then construct a fresh existing
   in-memory token. That token stays process-local. Observe cancellation, expiry,
   revision and lease changes while running; terminate the process tree and do not
   attach a stale success. Same-user execution remains unisolated and cannot claim
   prevention or rollback of all external effects or eliminate every race.
6. **Evidence commit.** Link immutable Evidence to decision, attempt, source revision,
   command/tree and fence. Commit terminal attempt state and Task CAS atomically.
   Fence/CAS failure preserves Evidence for reconciliation without advancing the
   Task. LOCAL_EXECUTED remains UNPROTECTED; a local pass cannot satisfy protected
   Judge or make Objective complete.
7. **Recovery.** Persist reservation/launch intent before starting the process.
   For consumed decisions and STARTED/unknown effects, return reconciliation or
   Human Handoff, never automatic relaunch. A duplicate request ID returns the
   existing attempt/outcome, not another execution. Reclaiming an expired lease
   does not restore approval or budget. A crash before confirmed spawn may require
   a new explicit decision after review; conservative refusal is intentional.

Approval of this design would authorize its bounded implementation and fixture
tests only. Actual Host Live needs a separate concrete candidate/command decision.
The final expiry, time budget, allowed items and operator environment must be
specified before a live grant; no defaults are silently granted here.

## Executed tests and acceptance gaps

| Command | Result |
| --- | --- |
| `node --test --test-name-pattern="^(P1-B boundary\|prepared DAG\|nextAction follows\|verification revision conflict\|graph revisions\|reserved attempt\|attempt reservation\|operator cancellation\|expired approvals\|verification failure\|DAG rejects\|alpha stale worker\|alpha leases\|D: \|A: )" test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/workflow.test.mjs test/alpha.test.mjs test/verification-backends.test.mjs` | exit 0, 21 passed |
| `node --test --test-name-pattern="^(P1-B: revoked\|alpha exhausts attempt\|alpha resumes after worker\|alpha recovers a last-attempt)" test/workflow.test.mjs test/alpha.test.mjs` | exit 0, 4 passed |
| `npm.cmd run posttest` | exit 0; 173 Markdown files, 626 links, 42 fact declarations; no missing links or fact mismatches |
| `git diff --check` | exit 0 |
| Immutable read-only SQLite and project hash inspection | exit 0; P0-B revision 7, evidence reference and all 106 project file hashes unchanged |

Posttest reused the preserved full Legacy measurement from P1-A; Legacy was not
rerun in P1-B. Existing citation diagnostics remain: 42 unresolved and 13 suspect
historical citations, with no broken living-document citations.

These cover existing unapproved/expired/mismatched fileset rejection, missing or
wrong local trust, in-memory duplicate grants, tree change, protected promotion
rejection, Workflow revocation/revision/atomic reservation, lease loss, budget and
repeat failure handoff. Existing Alpha worker-death tests really exit a child
process with code 17, then exercise recovery with injected verifier/provider data.
They are not proof of interrupted Bootstrap local subprocess recovery.

Required before accepting the proposed contract (currently **NOT_RUN**, absent
implementation):

- Two CLI processes racing on one decision: exactly one reservation and at most
  one subprocess launch; duplicate requests retrieve the same result.
- Expiry/revocation/revision changes before admission, after reservation and before
  spawn: refuse launch; changes during execution: cancel and reject stale commit.
- Kill the actual local worker before spawn, after spawn and before Evidence CAS:
  restart does not relaunch unknown work or refund consumed decisions/budget.
- Replace/expire the lease during a running local command: the old worker cannot
  commit, cancel a new owner or continue scheduling children.
- Exhaust launch/time/failure limits across restart: Human Handoff, no budget reset.
- Submit stale/forged Evidence or a different tree/workflow/attempt: reject reuse;
  Local pass still produces protected ESCALATE and complete false.

No product source was changed for P1-B. Only boundary tests and this contract
record were added, with index/count maintenance. P1-A source/test edits were kept.
Docker/protected verification, full regression, new Host Live and cross-platform
continuation were not run. No Commit, Push, PR, broker bypass or approval expansion.

## Publication validation (subsequent explicit Git approval)

The owner subsequently authorized publication of P1-A/P1-B only. The unrelated
local P0-B run record and its index/count contribution remain outside the commits.
Shared tests and documentation counts are staged per commit, without removing
the local P0-B files or changing historical test results above.

- `node --test test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs`: exit 0, 89 passed, no failures/skips.
- `node --test --test-name-pattern="^(P1-B: revoked|graph revisions|reserved attempt|attempt reservation|operator cancellation|expired approvals|verification failure|DAG rejects|alpha stale worker|alpha leases|alpha exhausts attempt|alpha resumes after worker|alpha recovers a last-attempt)" test/workflow.test.mjs test/alpha.test.mjs`: exit 0, 13 selected tests passed, no failures/skips. Unselected tests are outside this result.
- Docker protected gates and new Host Live: NOT_RUN for publication. Prior
  protected-environment failures remain recorded, not converted into passes.
- The exact P1-A index snapshot was exported to a temporary validation clone:
  `node --test test/bootstrap-verify.test.mjs` passed 16 tests (exit 0), and
  `npm.cmd run posttest` exited 0. This checks the first commit independently
  of the uncommitted P1-B tests and excluded local P0-B record.
