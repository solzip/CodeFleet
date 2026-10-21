# NEW_PROJECT verification, repair and retry paths: reproduction

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: execution (reproduction; no CodeFleet source changed)
- Predecessor: [calendar fileset review](new-project-calendar-fileset-review.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## State preservation

The real task's state lived only in a Claude session scratchpad (`…/9f226621…/scratchpad/live/state3`).
It was copied with the SQLite online backup API plus the `artifacts/` directory to
`.codefleet/live-state/todo-calendar-state3` in the main checkout. The original was not moved or modified.

| Check | Source | Copy |
| --- | --- | --- |
| `PRAGMA integrity_check` | ok | ok |
| Tables / row digests (9 tables) | — | 9/9 equal |
| Rows | tasks 1, runs 4, events 33, approvals 2 | same |
| Artifacts whose content hash ≠ name | 0 of 12 | 0 of 12 |
| Named `*Ref` values resolving to an artifact | 12 of 14 distinct | same |

The 2 unresolved values are `probeRef` (the probe hash) and `policySnapshotRef`
(`hash(BOOTSTRAP_POLICY)` = `32eaa1bc…`, recomputed). Neither is an artifact by design
(`src/workflow/bootstrap.mjs:31`). 0 artifacts are unreferenced.

Task `task-dc4dc1e6…` read from a replica: revision 11, `BOOTSTRAP_PREPARED`; 8 WorkItems —
5 satisfied, `calendar` `FILESET_PROPOSED` (fileset `801ce042…` waiting approval, not materialized;
`public/calendar.mjs` absent on disk), `tests` (local-edit, 5 test files) waits on `calendar`,
`review-verify` (local-verification) `BLOCKED` on `trusted-local-command`.

## Reproduction

The real task cannot run past `calendar` without the owner's approval, and it is bound to its
repository path and probe hash, so the same DAG shape was run on a scratch fixture
(unborn Git repository; `todo` and `calendar` local-edit, `tests` local-verification,
`review-verify` protected-verification). `src/todo.mjs` was deliberately wrong so that a test fails.
Script: session scratchpad `repro/r1.mjs` (not preserved; to become a regression test).

| Step | Observed |
| --- | --- |
| draft → prepare → 2 filesets approved and materialized | VALIDATED, BOOTSTRAP_PREPARED, MATERIALIZED ×2 |
| `tests` after both dependencies materialized | `BLOCKED`, missing `trusted-local-command`, waiting on nothing |
| `objective run` / `objective resume --allow-model` | exit 2, `NEW_PROJECT has no executable Run` |
| `verify-local` on the materialized repository (separate CLI path) | executed: exit 1, tests 2, passed 1, failed 1, integrity MATCHED, status `INCONCLUSIVE` |
| task after `verify-local` | events 8 → 8, state unchanged, `tests` still BLOCKED |
| re-propose `todo` fileset with the fix | refused: `WorkItem todo is not awaiting a fileset` |
| propose `src/todo.mjs` under `tests` | refused: `Filesets are accepted only for local-edit WorkItems` |
| `createFiles` over the existing file | `CONFLICT`; file unchanged |
| task report | `verification: NOT_RUN`, `complete: false`; `nextAction` still says to propose a local-edit fileset although none is pending |

## Classification

| # | Observation | Kind |
| --- | --- | --- |
| R1 | A bootstrap `local-verification` item has no execution path; `assessBootstrapItem` evaluates the kind with no capabilities (`src/workflow/bootstrap.mjs:77`), so it can never become AVAILABLE | product defect (missing wiring; the backend exists) |
| R2 | `verify-local` evidence is not bound to a task or WorkItem and is not stored | product defect |
| R3 | `verify-local` reports a real test failure as `INCONCLUSIVE`, not FAILED (`src/verification/backends.mjs:113`) | product defect: a repair cannot be triggered from it |
| R4 | No modify operation: a materialized item cannot be re-proposed, and existing paths are CONFLICT | unsupported feature that blocks every repair |
| R5 | `nextAction` keeps instructing a local-edit fileset when none is pending | report states something false |
| R6 | Protected verification (`review-verify` in the fixture) | CAPABILITY_GAP; stays unsatisfied, correct |
| R7 | Judge / report did not mark anything complete without evidence | PASS |

## 결론

Bootstrap DAG는 파일 생성까지만 실행되고, 테스트 실행·실패 기록·기존 파일 수정·재검증 경로는 모두 없다(R1–R4 재현).
verify-local은 실제로 실행되지만 Task와 연결되지 않고 실패를 INCONCLUSIVE로 보고한다.
미검증 작업을 완료 처리하지 않는 판정은 유지된다(R7).

## 다음 작업

- 소유자 승인 후 R1–R5 수정 설계 착수
- 소유자 승인 시 실제 Task의 calendar fileset `801ce042…` approve → materialize

## 미해소로 남긴 것

- 재현 스크립트는 scratchpad에만 있다(회귀 테스트로 옮기기 전)
- 실제 Task에서의 tests·review-verify 단계: NOT_RUN (calendar 승인 대기)
- 원본 state가 scratchpad에 남아 있어 유실 가능. 사본은 `.codefleet/live-state/` (git 미추적)
