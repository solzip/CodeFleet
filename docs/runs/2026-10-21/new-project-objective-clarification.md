# NEW_PROJECT objective clarification

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: correction / execution
- Predecessor: [real Codex Host acceptance](new-project-bootstrap-host-acceptance.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Problem

A NEW_PROJECT objective containing `삭제` produced an unknown recomputed from the
objective on every validation. A Draft could not clear it, and no operator path
existed, so the real `codefleet-todo` task stayed `NEEDS_INPUT`.

## Change

- `objectiveUnknowns()` in `src/intent/bootstrap.mjs` gives each objective-derived unknown an id (`privileged-intent`), its matched terms, an `objectiveHash` and a `subjectHash`.
- `objective unknowns <task-id>` lists them; `objective clarify <task-id> --unknown <id> --scope <text> --actor <name> --revision <n>` records an `ObjectiveClarification` artifact (`USER_DECLARED`, `grantsExecution:false`) and re-validates the same task.
- The record is honoured only if it names this task, this unknown, this objective hash and this subject hash. It is re-checked at prepare. The Host CLI has no clarify action, and the Draft schema has no field for it.
- NEW_PROJECT only. G3's identical rule is unchanged, and `clarify` on an EXISTING_REPOSITORY task is refused.
- Plan-only items (planning, analysis) now report capability `NOT_REQUIRED_PLAN_ONLY` with `satisfiedBy: VALIDATED_BOOTSTRAP_PLAN / PLANNED`. Before, an analysis item showed `PLAN_RECORDED` beside capability `BLOCKED` while dependents treated it as satisfied: two contradictory verdicts on one item.
- Found during the real-task rerun: a plan validated by the previous runtime had no stored clarifiable list, so `unknowns` reported none. The list is now derived from the objective.

## Measurements

| Command | Before this change | After |
| --- | --- | --- |
| `node --test test/bootstrap.test.mjs` | 13/13 | 18/18 |
| `npm run test:alpha` | exit 1, 225 tests: 213 pass, 5 fail, 7 skip | exit 1, 230 tests: 218 pass, 5 fail, 7 skip |
| `npm run test:host-core` | exit 0, 12/12 | exit 0, 12/12 |
| `npm run test:legacy` | exit 0, 324/324 | not re-run: no `.ts` file changed |

The 5 alpha failures are the same five tests, one cause (`CODEFLEET_TEST_DOCKER` unset).
Six guards were removed one at a time (task binding, objective hash, subject hash,
prepare re-check, G3 scope, plan-only display). Each made a test fail.

## Real task

Task `task-dc4dc1e6-0547-4fb1-91e3-6317b2b55c0c`, operator CLI from this branch,
owner account:

1. `unknowns`: one OPEN unknown, `privileged-intent`, term `삭제`.
2. `clarify` with the owner-confirmed scope (actor `sol`): revision 3 → 4, `VALIDATED`, unknowns 0.
3. `prepare` (exit 2, as designed) and `workflow`: 8 items, workflow hash `a52e4325…`.
4. `files` with the Codex-authored `data-model` fileset (operator added only `revision`): approval request `66918659…`, files `src/model.mjs` (sha256 `578cdbe4…`), `src/store.mjs` (sha256 `fbb86373…`), authority `REQUEST_ONLY`.

Repository status digest stayed `e68887f7…` throughout; no file was created.
Approval and materialization were not performed.

## 결론

운영자 Clarification으로 같은 Task가 VALIDATED가 되었고, DAG와 fileset 승인 요청까지 생성됐다.
Clarification은 Task·목표·대상에 결합되며 실행을 승인하지 않는다. G3 규칙은 바뀌지 않았다.

## 다음 작업

- 소유자가 승인하면 `data-model` fileset 승인과 materialize 실측

## 미해소로 남긴 것

- Host가 CodeFleet CLI를 직접 실행하는 경로: Windows Codex sandbox 환경 이슈로 BLOCKED (변경 없음)
- `codefleet-todo`의 설치된 Skill runtime은 clarify 이전 버전이다. 이번 실측의 운영자 명령은 브랜치 CLI로 실행했다.
