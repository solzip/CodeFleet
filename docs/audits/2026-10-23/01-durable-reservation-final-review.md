# Durable reservation final implementation review

- Date: 2026-10-23; type: read/review and isolated verification, no product fixes.
- Baseline: `4477e4426960af46076d3aa29808201c1c8911a6`.
- Candidate: uncommitted `work/p1-b-durable-reservation` Worktree, including
  untracked implementation/test/contract files; not just `git diff` output.
- Predecessor: [implementation record](../../runs/2026-10-23/durable-reservation-p1-b.md)
  and [reservation contract](../../implementation/bootstrap-reservations.md).
- Number inventory: prior maximum P0-17 / P1-61; no new Legacy register IDs.
  Findings R1/R2 below are local to this review.
- Environment: Windows PowerShell, Node v24.14.1; one Agent.
- Verdict: **NEEDS_FIX**. No commit, push, PR or merge was performed.

## Findings

### R1 — High: rolled-back finalization returns durable local success

At `src/product/reservations.mjs:177`, the final transaction mutates the outer
reservation object, setting `r.result` to LOCAL_PASSED before commit. If the
subsequent terminal event insertion fails at `src/product/reservations.mjs:179`,
SQLite correctly rolls back Task attachment and terminal Run/reservation updates.
JavaScript object mutation is not rolled back. The catch path at
`src/product/reservations.mjs:185` changes only the state/reason and persists that
object with its uncommitted success result still present. Status prioritizes
`r.result.status` over HUMAN_HANDOFF at `src/product/reservations.mjs:112`.

An isolated persistent SQLite trigger rejects
`BOOTSTRAP_LOCAL_VERIFICATION_RECORDED`. A real `objective verify` CLI process
then reports:

```text
CLI exit: 0
returned status: LOCAL_PASSED
stored reservation state: HUMAN_HANDOFF
status after reopening Store: LOCAL_PASSED
Task revision: unchanged
Task evidence attached: false
terminal completion events: 0
remaining executions: 0
```

This does not grant a duplicate launch or Protected completion, but it violates
the atomic finalization/recovery contract and presents an uncommitted outcome as
success. The existing reservation-event rollback test exercises admission, not
this terminal failure. A separate trigger forcing Task CAS to affect zero rows
correctly returns HUMAN_HANDOFF; these are distinct boundaries.

Required repair: publish terminal result only after the transaction commits,
or reload persisted reservation state on rollback and discard uncommitted
result fields. Status must not let result payload override a handoff state.
Add a regression asserting non-success CLI exit, unchanged Task, consumed grant,
preserved observation and consistent restart status on terminal event/commit
failure. This review does not implement the repair.

### R2 — Medium: accepted command JSON can be rejected solely for key order

`src/product/reservations.mjs:121` hashes the caller's whole request object and
compares it with a newly constructed object in fixed property order.
`src/alpha/contract.mjs:4` hashes JSON.stringify output without key sorting.
Issuance accepts the normal command fields independently of their object order.
Consequently, the same request used for inspection and successful decision
issuance fails execution with `Decision request binding mismatch` when its keys
are ordered directory/executable/args/timeoutMs. The executable, argument array,
directory, timeout and inspected commandHash are unchanged.

Required repair: validate exact allowed fields, then compare a canonical
projection or individual bound values; preserve argument-array order and all
security checks. Test JSON key permutations and negative executable/argument/
directory/timeout changes. No grant was consumed in this counterexample.

## Transaction and schema assessment

Admission is genuinely atomic: `BEGIN IMMEDIATE` encloses fresh decision and
Task/dependency/policy checks, duplicate lookup, budget accounting, Run with owner
and lease insertion, reservation insertion, decision consumption and event.
Reservations themselves are the durable attempt/time allocations; budgets are
not separate decremented columns. The existing test forces admission-event
failure and verifies no Run/reservation/consumption survives.

The two additive tables reuse the same Store. Their decision/request uniqueness,
Task and Run foreign keys, remaining-use constraint and partial active-repository
unique index are present. `workflow_attempts` remains unchanged. A separate
fixture verified idempotent enablement, preservation of all pre-existing table
SQL, user_version 2, enabled FK enforcement, zero foreign-key violations and
rejection of an unknown extension version. This is a synthetic migration check,
not a production SQLite upgrade or disk-failure qualification.

Owner UUID serves as the fence, using the existing runs lease fields and Store
heartbeat/release. Pre-spawn and finalization recheck current Task hash/revision,
workflow, decision, dependencies, owner/fence and deadline. Final transaction
rollback is correct at the SQL level; R1 is the surrounding in-memory recovery
and reporting defect. Neither the database transaction nor a content hash makes
OS process creation/filesystem effects transactional.

## What the process tests actually measure

| Boundary | Observed coverage and limit |
| --- | --- |
| Two CLI callers | Promise.all starts two native CLI processes. A native node:test child appends to a shared counter outside the candidate; the parent asserts one line, one reservation and one Task revision increment. A third CLI reads the same outcome. This measures executed child test bodies, not kernel process-creation events or every possible crash interleaving. |
| Worker killed at RESERVED | Worker reaches private checkpoint, receives SIGKILL; restart does not launch. Counter zero. |
| Worker killed during child execution | Counter confirms child test body began; Worker is killed; restarted CLI hands off. Counter remains one. The bounded child may outlive its Worker; the test waits beyond its timer, without universal descendant-cleanup attestation. |
| Worker killed before Evidence write | Actual local child finished; checkpoint precedes artifact write; restart hands off with one execution. |
| Lease/Fence loss | Injected owner replacement before spawn, during execution and before commit; no stale Task success. Native polling requests cancellation. Natural long-duration heartbeat expiry, OS suspension and PID reuse are not separately qualified. |
| Revision/revocation | Injected changes before admission, after reservation and before commit; no stale attachment. |
| Evidence/CAS | Changed/misbound artifacts and corruption before commit are rejected. Review's zero-row CAS passes; terminal-event rollback exposes R1. Artifact-write/COMMIT I/O failure and kill inside final SQL commit are NOT_RUN. |
| Budgets | Count, elapsed deadline, cumulative reserved time and first-failure limits across fresh decisions/reopened Stores. No automatic refund/retry. |
| Capability | Kind/dependency and policy binding plus Local CONDITIONAL capability; the test named capability changes maxParallel. It does not attest OS containment or unavailable-platform enforcement. |

## Tests actually executed in this review

| Command | Exit / counts |
| --- | --- |
| `node --test test/bootstrap-reservations.test.mjs` | 0; 30 pass, 0 fail/skip |
| `node --test test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs` | 0; 88 pass, 0 fail/skip |
| `node --test .codefleet/runs/p1-b-final-review/migration.test.mjs` | 0; 1 pass, 0 fail/skip |
| Initial review probes | 1; 0 pass, 2 fail, 0 skip; both stopped at key-order mismatch before their intended SQL fault boundary |
| Review probes with canonical request, plus key-order case | 1; 1 pass, 2 fail, 0 skip; CAS passes, R1 and R2 reproduced |
| `node --test .codefleet/runs/p1-b-final-review/review-probes.test.mjs` with actual terminal-failure CLI | 1; 1 pass, 2 fail, 0 skip; actual CLI exit 0 confirms R1 |
| `npm.cmd run posttest` with process-local safe.directory | 0; coverage, links, citations and 42 declared facts checked; zero fact mismatches |
| `git diff --check` | 0 |

Private probe code and raw logs are retained under
`.codefleet/runs/p1-b-final-review/`, excluded from publication. Expected product
invariants are asserted; their failures remain failed tests, not passing defect
characterizations. No product source or tracked test was changed to make them pass.
Document checks examined 175 Markdown files, 631 links and 527 citations. There
are 49 unresolved citations (including seven references to this uncommitted
candidate) and 13 suspect historical citations. The new source locations were
read directly in the Worktree; checker exit 0 does not certify those references
against a published commit.

Prior implementation logs remain separate: Legacy 324 pass, selected Alpha 13
pass, Host Core 13 pass and then-current combined suite 114 pass, each exit 0.
They were not all repeated in this review. The prior 5 fixture failures, Git
ownership failure and INDEX-format failure remain historical failures in the
implementation record. Full npm test/security/Docker, new Host Live, macOS/Linux,
model execution and autonomous multi-item continuation are NOT_RUN here.

## Authority, preservation and public scope

Existing Fileset approval/materialization regression passes. No changes to
`src/hosts/` or the Broker/guard implementation appear in the candidate.
`src/hosts/cli.mjs:139` still rejects public requests/submit/run/resume through
production-isolation checks before opening Store. Local decision actor strings
are audit labels under the existing trusted-local caller model, not OS identity.
Local evidence stays LOCAL_EXECUTED / UNPROTECTED, complete false, protected
UNSATISFIED and Judge ESCALATE. Legacy hash-only verification remains available
for Tasks without durable decisions; this is not a claim of global one-shot
execution for every Local command.

The original checkout still has only the original README/INDEX modifications and
untracked P0-B record, with its prior Worktrees retained. Immutable read-only
SQLite inspection finds the P0-B Task at revision 7, todo MATERIALIZED and tests
LOCAL_PASSED. Its evidence reference is still
`642811a150845b4dedc66e6541b55a3c17071d28da96c95f63ef447b760b9e0d`, with matching
artifact digest and complete false. No SQLite sidecar exists. Private-root file
and original uncommitted-document hashes were checked before/after this review:
127 private-root files (including 106 project files) and four original modified/
untracked documents had zero hash changes. Candidate source, tracked tests and
package hashes also remained unchanged; review edits affect documentation only.
There is no retained pre-implementation full-root manifest from the preceding
turn, so byte-for-byte preservation across that entire turn cannot be newly
certified; write scope and pinned prior Task/evidence support the narrower claim.

Publication candidates after R1/R2 repair and revalidation:

- Source: `src/product/reservations.mjs`, `src/product/cli.mjs`,
  `src/product/tasks.mjs`, `src/product/report.mjs`,
  `src/verification/backends.mjs`.
- Tests/package: `test/bootstrap-reservations.test.mjs`,
  `test/bootstrap-verify.test.mjs`, `test/fixtures/bootstrap-reservation.mjs`,
  `test/fixtures/reservation-worker.mjs`, `package.json`.
- Sanitized documentation: the implementation contract, implementation record,
  this review, current progress and INDEX, and the two README count updates.

The original 16 candidate files were read and scanned for literal private user
paths and common private-key/token patterns: zero hits. This bounded scan is not
a secret-scanner certification of arbitrary history. Exclude `.codefleet/`,
`.rule-coverage/`, SQLite/WAL/SHM, raw logs, private paths/manifests, Live data and
the original checkout's P0-B record/changes. When later integrating into main,
retain the separate P0-B INDEX/count contribution instead of replacing it with
the implementation Worktree's totals. No PR is ready to publish yet.

## Conclusion

NEEDS_FIX: finalization rollback can report success and JSON key order can reject
an already issued decision. Current passing suites do not close these findings.

## Next work

After separate repair instruction, fix R1/R2 and add the missing regressions,
then re-review the candidate. This review stops without implementation changes
or Git publication.

## Unresolved

R1/R2, same-user tampering/TOCTOU/external effects, orphan descendants, uncertain
reservation reconciliation, full protected regression, other OSes and Host Live.
