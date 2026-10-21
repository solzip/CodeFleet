# NEW_PROJECT local verification, repair and re-verification

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: correction
- Predecessor: [verification path reproduction](new-project-verification-path-repro.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.
- Owner approval: A1–A4 of the predecessor's proposal (product code and regression tests). Not approved here: commit, push, PR, merge, the real calendar materialize, runtime reinstall.

## Decisions (approved scope; names chosen in implementation)

| Item | Decision | Rejected alternative and why |
| --- | --- | --- |
| A1 command | `objective verify <task> <item> REQUEST.json [--trust H --acknowledge-unisolated]`; the same REQUEST shape as `verify-local`, directory must be the task root | A Host-side command: trust of a local command is an operator act, and Host input is PROVIDER_REPORTED_ONLY |
| A1 trust | One grant per run; `commandHash` covers executable bytes, arguments and the whole tree, so any repair makes an old trust unusable | Remembering a trust per item: would reuse an approval across changed files |
| A2 | `LOCAL_FAILED` only when exactly one summary per count, tests > 0, failed > 0, exit ≠ 0, tree unchanged, not interrupted or truncated | Exit code alone: a crash or missing runner reads as a failure that a repair could "fix" |
| A3 transition | Proposing a repair fileset is the transition; it must cite the item's current `LOCAL_FAILED` evidence of a dependent local-verification item | A separate `objective repair` command: one more operator step without adding a check the hash-bound approval does not already give |
| A3 scope | Only files the item owns; cross-item repair = one fileset per owning item | Repair under the verification item: breaks single ownership of paths |
| A3 base | Each entry carries `baseSha256`, which must equal CodeFleet's recorded digest at proposal and the disk at write | Comparing only with disk: a proposal could target bytes CodeFleet never wrote |
| Invalidation | Stored state set to `VERIFICATION_STALE` after a write, and every read rechecks evidence digests against recorded digests and disk | Either alone: mutation M2/M3 below shows each covers a path the other does not |
| Legacy tasks | No digest map → derived from completed create filesets | Migrating stored task bodies: changes a preserved state |

## Change

- `src/verification/backends.mjs` — `classifyLocalResult`: LOCAL_PASSED / LOCAL_FAILED / INCONCLUSIVE with a reason.
- `src/workflow/bootstrap.mjs` — LOCAL_PASSED satisfies a local-verification item; `PENDING_VERIFICATION` initial state; capability `EXPLICIT_TRUST_PER_RUN`; `dependentsOf`.
- `src/workflow/bootstrap-files.mjs` — `validateRepairFileset`, `repairManifest`, `modifyFiles` (all-files preflight, temp file + base re-read + rename, read-back).
- `src/product/tasks.mjs` — `verifyTask`, repair proposal, materialize for create and modify, recorded digests, drift, `effectiveStates`, shared repository preflight.
- `src/product/report.mjs` — `nextActions` from effective states; `verification` is `NOT_RUN` or `LOCAL_ONLY_UNPROTECTED`, plus `localVerification`, `protectedVerification: UNSATISFIED`, `complete: false`.
- `src/product/cli.mjs`, `src/hosts/cli.mjs`, `src/hosts/install.mjs` — `verify` command, repair input shape, Skill text (verify is operator-only).
- `test/bootstrap-verify.test.mjs` (new, 13 tests), `test/bootstrap.test.mjs` (1 expectation), `package.json` (`test:alpha` includes the new file).

State transitions added: local-verification `PENDING_VERIFICATION → LOCAL_PASSED | LOCAL_FAILED | INCONCLUSIVE → VERIFICATION_STALE` (after a write or drift) `→` rerun. Local-edit `MATERIALIZED → REPAIR_PROPOSED → MATERIALIZED | REPAIR_CONFLICT | REPAIR_MATERIALIZATION_FAILED | REPAIR_INTERRUPTED`; the last three retry with `objective materialize`.

## Measurements

| Command | Before | After |
| --- | --- | --- |
| `npm run test:legacy` | exit 0, 324/324 | exit 0, 324/324 |
| `npm run test:alpha` | exit 1, 230: 218 pass, 5 fail, 7 skip | exit 1, 243: 231 pass, 5 fail, 7 skip |
| `npm run test:host-core` | exit 0, 13/13 | exit 0, 13/13 |
| links / citations / facts / rule coverage | — | exit 0 each |

The 5 alpha failures are the same 5 test names before and after; all 5 show `undefined !== '1'` (`CODEFLEET_TEST_DOCKER` unset on this PC).

One existing expectation changed, one cause: `tests` (local-verification) reads `PENDING_VERIFICATION / EXPLICIT_TRUST_PER_RUN` instead of `BLOCKED / BLOCKED`. That trust is still required is asserted separately (inspection records nothing; wrong or unacknowledged trust is refused).

A facts run first reported `claims-recorded` 1056 against 352: exactly three accumulated `test:legacy` runs without the `pretest` reset. After reset, legacy, coverage and facts each exit 0.

Mutation check: 17 guards removed one at a time against `test/bootstrap-verify.test.mjs`; 17 of 17 now make it fail.
The first pass had 5 survivors, all masked by a second guard: M2/M3 (digest recheck vs stored invalidation), M6/M6b (evidence ref vs LOCAL_FAILED state), M11 (unmaterialized item, also refused later with another message).
Each got an assertion that isolates it.
The re-observe-before-rename step in `modifyFiles` has no test: a write landing between preflight and rename was not reproduced.

## Real task compatibility (replica of `.codefleet/live-state/todo-calendar-state3`)

`objective status` with the new code: revision 11, recorded digests derived for 9 paths (data-model 2 + todo 7), drift against the real repository 0, `nextActions` = `AWAIT_FILESET_APPROVAL (calendar)` only. The replica's row digests still equal the preserved copy after the read.

Runtime reinstall: the installed runtime and `src/` list the same 83 files; 8 differ in content, the 8 edited here. `statusHash` covers paths and status codes only (`src/intent/probe.mjs:36-38`), so a remove-and-install should keep the baseline. This is inferred from code; the reinstall was not run.

## 결론

Bootstrap DAG에서 실제 실패 테스트 실행, LOCAL_FAILED 증거 보존·재조회, 해시 결합 기존 파일 수정, 이전 결과 무효화, 새 신뢰 실행 LOCAL_PASSED까지 자동 테스트 13건으로 확인했다(R1–R5 해소).
Local 결과는 Judge에서 ESCALATE이고, `complete`는 어느 경우에도 false다.
실제 Task는 새 코드에서 calendar 승인 대기 1건으로 읽힌다.

## 다음 작업

- 소유자 승인 시: runtime 재설치 → calendar `801ce042…` approve/materialize → `tests` fileset → `review-verify`를 `objective verify`로 실행

## 미해소로 남긴 것

- `modifyFiles`의 rename 직전 재관측 경로는 테스트 없음
- 같은 Task에 verify 두 개가 동시에 돌면, 늦게 끝난 쪽은 revision 충돌로 Task에 붙지 않는다. 증거 artifact는 남고, 오류 메시지에 그 ref가 나온다
- local-verification의 수용 기준이 명령 결과와 기준 단위로 대응되지 않는다. 실제 `review-verify`의 브라우저 확인 항목은 LOCAL_PASSED여도 관측되지 않은 채 남는다(CAPABILITY_GAP)
- 지속 프로세스가 강제 종료되면 실행 결과가 기록되지 않는다. 재실행으로 복구한다
- Protected verification: NEW_PROJECT에서는 계속 UNSATISFIED
