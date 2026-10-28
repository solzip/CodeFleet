# Codex-first P0-A — bounded continuation

- Date: 2026-10-27 (KST)
- Baseline: `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, detached `core-p0-1` Worktree, plus existing uncommitted P0-1–P0-4 implementation. Default-folder main was `4477e4426960af46076d3aa29808201c1c8911a6`; no remote-main equivalence assumed.
- Type: implementation, verification, decision
- Predecessors: [authorization boundary](../2026-10-23/durable-authorization-boundary-fix.md), [current contract](../../implementation/bounded-continuation.md), [Product Charter](../../PRODUCT_VISION.md).
- Historical finding maxima: P0-17 / P1-61 in REGISTER; P0-A is the user's work label, not a new finding ID.
- Environment: Windows Native, PowerShell, Node v24.14.1. No installation, model invocation, Git commit/push/PR/merge, or new public execution permission.

## Selection and preserved baseline

The user prioritized Codex Core and stopped additional Claude Live work. Existing
P0 code was located in the preserved Worktree rather than reimplemented on main.
The PR #9 Worktree, existing uncommitted files, State and Evidence were retained.
The local P0-5A final summary records Windows Codex proposal → exact user approval
→ source repair → Local verification, scoped acceptance only. It was read, not
rerun or promoted to full product acceptance. Claude fixtures were retained;
compatibility tests use offline fixtures and no Claude model call.

The four-document decision-debt scan returned four blocking candidates and no
exclusions. Source review resolved these candidates: roadmap rows define future
acceptance, Charter rows distinguish verification guarantees, architecture rows
state blocked capabilities, and progress quotes are explicitly historical results.
None is evidence of the claimed success mismatch or a reason to discard the
Charter. These four candidates were excluded from the implementation blocker set
after contextual review; this is not a tool-issued global clearance.

User value: remove repeated coordinator calls between already eligible verification
WorkItems while preserving Controlled Process and Verified Results. The selected
change is limited to existing Continuation, its tests and supporting records.
Dependencies are the existing Task/Workflow, exact Decisions, Reservation and
Evidence. Acceptance requires two actual dependent verification executions,
distinct consumed Decisions/Attempts/Evidence, and refusal of unsafe next work.
The user's instruction authorizes local implementation/tests, not a new public
approval issuer or Host model budget.

## Implemented behavior and boundary

`src/product/continuation.mjs` now supplies `continueOfflineWorkflow`. It selects
through the existing snapshot/actions, checks the pinned Workflow/revision and
explicit item/command ceiling, requests a fresh Decision from the external trusted
embedding, and calls the existing one-item reservation path. It issues no approval.
The Store records the ceiling artifact and start/stop events; exact execution
bindings remain in the existing Decision/Attempt/Evidence records.

The loop accounts for the reservation's normal revision increment only. It stops
on other Task changes, scope/command change, absence/reuse/revocation/expiry of a
Decision, cancellation, candidate drift, failure, uncertain execution, evidence
defect or exhausted persisted budget. Later calls do not reset prior Attempts.
Execution also receives the deadline/cancellation guard. The external decision
transport must return control; this function does not preempt that transport.

This enables serial **local-verification** WorkItems in a trusted internal
embedding. It does not yet implement a multi-code-edit model loop. New filesets,
source repair, changed commands/candidates/contracts and expanded budgets still
need their exact existing authority. A fresh execution Decision remains mandatory
even if an external authenticated policy has previously authorized the scope.

Public bounded preapproval remains **BLOCKED**: there is no qualified public
Operator policy issuer inaccessible to the Agent. Existing same-user Native Local
review remains supervised; its review hash is not independent authentication.
The new function has no public CLI/IPC wiring and no key or issuance API. A signed
offline test does not prove deployment isolation or human presence.

## Verification evidence

Local logs are retained under `.codefleet/p0-a-evidence/` in the working tree.
They may contain private temporary paths and are not publication artifacts.

| Check | Result |
| --- | --- |
| Initial P0-A tests before implementation | exit 1: missing function reproduced |
| First implementation test run | exit 1: 11 pass, 1 test assertion expected a table despite no execution authority; assertion corrected to require no table |
| `node --test --test-name-pattern=P0-A test/continuation.test.mjs` | exit 0; 17 pass, no failures/skips |
| `node --test --test-concurrency=1 test/continuation.test.mjs test/bootstrap-reservations.test.mjs test/repair-loop.test.mjs test/time-safety.test.mjs test/native-local.test.mjs test/bootstrap-operator.test.mjs` | exit 0; 151 pass, no failures/skips; includes the new P0-A cases |
| `node --test --test-concurrency=1 test/bootstrap-process.test.mjs test/bootstrap-verify.test.mjs` | exit 0; 23 pass, no failures/skips |
| `npm.cmd run pretest` | exit 0 |
| `npm.cmd run test:legacy` | exit 0; 324 pass, no failures/skips |
| `npm.cmd run test:host-core` | exit 0; 13 pass, no failures/skips |
| Initial `npm.cmd run posttest` | exit 1: sandbox Git ownership blocked the link check |
| Same `posttest` under original user | exit 1: the new run record increased both README declared counts; corrected those counts without changing baselines |
| Final `npm.cmd run posttest` | exit 0; coverage, links, citations and declared facts pass; historical citation caveats remain |
| `git diff --check`; `node --check` on both edited JavaScript files | exit 0 |

The positive scenario has two dependency-ordered verification WorkItems with fresh
Decisions, separate Local Evidence and consumed Attempts. Total reserved execution
time is 30,000 ms, not measured wall duration. Missing authority creates no
execution tables. A smaller total Attempt ceiling remains exhausted on a later
call. Signed Operator acceptance and forged-signature refusal are tested separately.
Model calls by this runtime are zero; monetary cost is unmeasured, not asserted $0.

No current Codex/Claude Host Live, actual context compaction, macOS/Linux acceptance,
full Docker/security regression or P0-E completion policy was executed. Protected
criteria remain UNSATISFIED and Objective `complete` remains false. Tests and
fixtures do not close these acceptance requirements.

## Conclusion

Internal bounded continuation is implemented and verified on Windows Native within the recorded offline scope.
Public autonomous preapproval and complete Codex Core acceptance remain incomplete.

## Next work

P0-B: bind actual Codex-generated changes for multiple implementation WorkItems to
one Objective, using the supervised path until a qualified external approval-policy
boundary exists. Fix the model-call scope/budget before invoking it. Then verify
P0-C actual Host resume, P0-D requirement revision and P0-E trust-specific completion.

## Unresolved

Authenticated public preapproval policy/issuer boundary; automatic model-driven
multi-edit progression; actual Host context recovery; Local-only final acceptance;
Protected-required acceptance; platform-specific Live validation.
