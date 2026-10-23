# Durable authorization boundary repair

- Date: 2026-10-23; type: local implementation and isolated verification.
- Baseline: `683f323266c2647fb39dbbbaa8dfe3788c05288a`, branch
  `work/p1-b-durable-reservation`; PR #9 OPEN at the same Head.
- Predecessor: [AB1 review](../../audits/2026-10-23/02-pr9-authorization-boundary.md),
  [R1/R2 repair](durable-reservation-final-review-fix.md),
  [current contract](../../implementation/bootstrap-reservations.md).
- Number inventory: prior maximum P0-17 / P1-61; no new Legacy ID.
- Environment: Windows PowerShell / Node v24.14.1; one Agent.
- Authorization: local fix/tests only. No commit, push, PR update or merge.
- Existing uncommitted AB1 audit is preserved; old CI evidence is not evidence
  that this new boundary passes.

## Trust boundary and selected repair

The existing Linux bridge obtains peer credentials with SO_PEERCRED and requires
distinct non-root Operator/Agent UIDs and private Operator paths. The Operator
runtime supports guarded offline fixtures, but its Host service explicitly
refuses decisions when trusted human input is not attested. It has no authenticated
Bootstrap decision binding. The existing production isolation gate remains
unavailable. Connecting this path by trusting actor JSON would repeat AB1.

Public `objective authorize-local` and `objective verify --decision/--request-id`
now return exit 1 / BLOCKED_OR_UNSUPPORTED before Store opens or JSON is read.
Both productCli and dispatchProduct enforce the gate; dependency injection does
not bypass it. No public route imports the offline issuer/executor. The existing
`issueDecision()` and `executeDecision()` API names also fail closed, regardless
of input or optional caller flags. All use the existing production Host gate.
A second explicit refusal prevents a future generic Host capability from
silently enabling a Bootstrap integration that has not been implemented.

Normal authenticated durable issuance/execution is **not supported**. This repair
chooses the user-authorized fail-closed outcome. It adds no actor authentication,
environment switch, writable token, Broker DB, scheduler, Agent engine, model
service or Docker requirement.

The prior algorithms remain `issueOfflineDecision()` / `executeOfflineDecision()`
for trusted offline embedding and regression, analogous to the existing internal
dispatchHost seam. Their name and contract do not claim Operator authentication.
The test-only process driver directly exercises these functions without mocking
the production gate. It is outside the package's published files list. Arbitrary
same-user module imports, code modification or other program execution are not
contained by a JavaScript library. The supported public paths are denied.

## Existing decisions and retained functionality

- Old issued/forged/expired/revoked/consumed/uncertain decisions cannot execute
  through the public CLI or the old API names. No provenance is inferred from
  database presence, actor, ID or hash. No automatic migration, retry or refund.
- Status still validates historical committed results. A consumed decision may
  report historical LOCAL_PASSED via `reservation`, but public execution remains
  blocked. NOT_RESERVED/ISSUED is historical metadata, not a current capability.
- Revocation remains available and can only remove authority; its actor remains
  an audit label. Existing decision/reservation rows, Run/lease, budget and Evidence
  are preserved. No schema changes were introduced.
- Tasks with a durable decision still reject hash-only trust execution. Existing
  one-shot Local Verification and Fileset approval for other Tasks are unchanged;
  neither is redefined as OS identity proof or an automatic fallback.
- Offline regressions retain admission/finalization atomicity, COMMIT rollback,
  canonical request binding, competing processes, kill/restart, lease/fencing,
  budget/revocation and no replay. These passes are not public execution acceptance.
- Public Host requests/submit/run/resume remain blocked. Local Evidence stays
  LOCAL_EXECUTED / UNPROTECTED / protected UNSATISFIED / complete false.

## Changed files

| File | Change |
| --- | --- |
| `src/product/cli.mjs` | Early public/dispatch refusal, remove issuance/execution wiring, clarify help |
| `src/product/reservations.mjs` | Fail-closed old entry APIs and explicit offline names; unchanged reservation mechanics |
| `test/bootstrap-reservations.test.mjs` | Public CLI/API denial and persisted-history tests; retain original regression assertions through offline driver |
| `test/fixtures/reservation-offline-cli.mjs` | Test-only real-process driver, no authentication claim or gate mock |
| `test/fixtures/reservation-worker.mjs` | Use explicit offline execution for crash fixtures |
| Reservation contract and this record | Supported blocked behavior, recovery scope and measured evidence |
| INDEX, REGISTER, progress, README counts | Follow-up status and required record indexing; original audit remains unchanged |

## Counterexamples and verification

Before edits, the original AB1 private probe again exited 1 (0 pass / 1 fail):
self-authored issuance exit 0 / ISSUED; execution exit 0 / LOCAL_PASSED; counter 1.
The original failed probe and logs are preserved.

The new real public CLI tests require rejection for self-authored actor/decision
JSON, environment claims and forged/old decisions; an absent Store must remain
absent. They also call the public library APIs and dispatch seam with self-authored
trust flags. Snapshot assertions verify no Task, grant, Run, reservation or event
changes and no child launches from denied requests. Status and revocation remain
usable. Both Host adapters reject issuance and all eight blocked actions.

An initial integrated run exited 1: 41 pass / 6 fail / 0 skip. The six new tests
passed their denial assertions, then incorrectly passed a Buffer to assert.match
when checking the legacy fallback error. A focused reproduction also exited 1.
Converting stdout to string corrected the fixture without changing product gates
or assertions. The corrected public subset exited 0: 8 pass / 0 fail/skip.
The final integrated run below includes the explicit API gates as well.

| Command | Actual result |
| --- | --- |
| `node --test test/bootstrap-reservations.test.mjs` final integrated candidate | exit 0; 47 pass (39 retained offline mechanics + 8 new public-boundary cases), 0 fail/skip |
| `node --test test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs` | Initial and final integrated recheck each exit 0; 88 pass / 0 fail/skip |
| Scoped Operator command below | exit 0; 10 pass / 0 fail/skip |
| Scoped Runtime/IPC command below | exit 0; 4 pass / 0 fail/skip |
| Scoped Workflow/Alpha command below | exit 0; 13 pass / 0 fail/skip |
| `npm.cmd run posttest` | exit 0; existing Legacy coverage data and document checks; 42 declared facts, 0 mismatches |
| `git diff --check` | exit 0 |

Legacy tests were not rerun for this repair; posttest uses retained valid Legacy
coverage. Unresolved citations (58) and suspect historical citations (13) remain
checker limitations, not verified references. Coverage/anchor baselines are unchanged.

```text
node --test --test-name-pattern="^operator: (fake signed|actor strings|expiry|command changes|recheck|concurrent|Fake Operator|same-account|ledger owner|actual public CLI)" test/operator.test.mjs
node --test --test-name-pattern="^(H3: (protected|actual reserve|revision)|H4: Host client)" test/operator-runtime.test.mjs test/host-ipc.test.mjs
node --test --test-name-pattern="^(P1-B: revoked|graph revisions|reserved attempt|attempt reservation|operator cancellation|expired approvals|verification failure|DAG rejects|alpha stale worker|alpha leases|alpha exhausts attempt|alpha resumes after worker|alpha recovers a last-attempt)" test/workflow.test.mjs test/alpha.test.mjs
```

Unselected tests are NOT_RUN, not implicit passes. Raw logs and fixture SQLite
remain in ignored local directories, never in publication artifacts. The original
P0-B state/evidence and other Worktrees were not used as fixtures or modified.

## CI and limits

The previous PR Head's Windows/Linux Actions succeeded, as recorded by the AB1
audit. They precede this repair. GitHub Actions for this uncommitted candidate:
NOT_RUN; no push or workflow dispatch is authorized. Local Docker/Protected,
actual Linux/macOS execution, full npm test and Host Live: NOT_RUN in this repair.
Existing offline Operator/IPC tests do not establish an available production
Bootstrap issuer. Normal durable execution remains blocked even on Linux.

## Conclusion

READY_FOR_PR_UPDATE for the fail-closed AB1 repair. Authenticated durable execution
is unsupported, not newly enabled. Existing reservation mechanics and historical
evidence remain available within the explicitly documented offline scope.

## Next work

No further local AB1 implementation is pending. Publication and new CI require
separate approval; a future normal Operator integration needs its own verified
contract and actual enforcement evidence.

## Unresolved

Authenticated production Bootstrap issuance/execution is unsupported and blocked.
Same-user arbitrary code/DB tampering, external effects, orphan descendants,
TOCTOU and disk/power-loss qualification remain outside this local repair.
