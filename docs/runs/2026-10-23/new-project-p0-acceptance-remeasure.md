# NEW_PROJECT P0 acceptance: process-level re-measurement for Claude and Codex hosts

- Date: 2026-10-23 (Asia/Seoul), PC: work
- Target commit: c205da6 (feature/new-project-bootstrap, on top of origin/main 2a330bb; origin/main is now 07209ee). No uncommitted source changes.
- Type: execution (measurement; no CodeFleet source changed)
- Predecessor: [local verification, repair and re-verification](../2026-10-21/new-project-verify-repair-loop.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Scope

The P0 request (empty project → Task → Draft → G3 → G4 DAG → re-query, regression,
forged code evidence and unapproved execution refused) was checked against the
existing branch instead of writing new code. Each step ran as a separate
`node src/alpha/cli.mjs --state STATE …` process, so re-query crosses a process
boundary. The fixture was an empty `git init` repository in a session scratchpad.
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `CODEFLEET_TEST_DOCKER` were removed from
the child environment. No model, Host session or Docker was used.

## Process-level result

Objective: `Todo + Calendar 일정 관리 웹앱을 새로 만든다`.

| Step | claude | codex |
| --- | --- | --- |
| `host H plan` | exit 2, `NEW_PROJECT` / `UNBORN_HEAD`, `NEEDS_INPUT` | same |
| `host H status` (new process) | exit 0, same task, revision 2 | exit 0, same task |
| `host H draft` with a `references` field | exit 1, `Invalid BootstrapDraft fields` | same |
| `host H draft` (BootstrapDraft) | exit 0, `VALIDATED` | same |
| `host H prepare` | exit 2, `BOOTSTRAP_PREPARED`, approvalRequest `null` | same |
| `host H workflow` (new process) | exit 0, 8 items, `executable: false`, `approved: false` | same |
| `host H approve` / `host H materialize` | exit 1 each, `Unsupported host action; approval and completion cannot be set by host` | same |
| `objective run` | exit 2, `NEW_PROJECT has no executable Run` | same |
| `host H files` (todo) then `objective materialize` without approval | files exit 2 `REQUEST_ONLY`; materialize exit 1 `Fileset is WAITING_APPROVAL` | same |
| `objective approve` with a wrong hash | exit 1, `No proposed fileset matches the approval hash` | same |

| Host | Task | DAG workflowHash |
| --- | --- | --- |
| claude | `task-e6ffe2d3-e0f1-4ab6-88c5-4cfe92917597` | `bbdadfb6c2b10cd4fe015cd6b173e310ea37427108c8933e6cb79b145cd198b1` |
| codex | `task-16f4aa15-5482-4a77-ad67-a4bb986bdc7f` | `9c71304e9078398f4d006ef43e9ef041cee7fcb62f7bba355dc3aa1b2c698518` |

DAG item states (both hosts): 4 planning/analysis `PLAN_RECORDED`, `todo` and
`calendar` `PENDING_FILESET`, `tests` `PENDING_VERIFICATION`, `review-verify` `BLOCKED`.
The repository held only `.git` after every step and `git rev-parse --verify HEAD`
still failed (unborn).

The IDs live only in the scratchpad state and are not durable.

## Suites

Each suite measured separately because `npm test` stops at `test:alpha`.

| Command | Exit | Count |
| --- | --- | --- |
| `npm run test:legacy` | 0 | 324/324 |
| `npm run test:alpha` | 1 | 243 tests: 231 pass, 5 fail, 7 skip |
| `npm run test:host-core` | 0 | 13/13 |
| `npm run posttest` (4 checkers) | 0 | — |

All 5 alpha failures report `actual: undefined, expected: '1'`; the only `'1'`
environment assertions in the alpha tests are `CODEFLEET_TEST_DOCKER`
(`test/host-planning.test.mjs:96`, `test/operator-runtime.test.mjs:93`,
`test/operator.test.mjs:160`). Same cause as the predecessor.

## 결론

빈 저장소에서 claude·codex 두 host 모두 Task 생성·재조회 → BootstrapDraft G3 VALIDATED → G4 DAG 생성·재조회가 프로세스 단위로 성공했다.
가짜 코드 참조, host 승인·materialize, 무승인 materialize, 틀린 해시 승인은 모두 거부됐고 저장소는 `.git`만 남았다.
회귀는 legacy·host-core·checker exit 0, alpha는 Docker 환경 변수 5건만 실패(기존과 동일).

## 다음 작업

- 소유자 결정: `feature/new-project-bootstrap` PR·머지 순서
- 소유자 승인 시: 실제 Claude Code Host 세션이 자연어에서 BootstrapDraft를 직접 작성하는 Live 1회

## 미해소로 남긴 것

- Draft는 고정 fixture JSON이었다. 실제 Host(모델)가 자연어에서 Draft를 쓰는 경로는 이번에 NOT_RUN. Codex는 10-21 운영자 중개로만 성공, Windows sandbox에서 CLI 직접 실행 BLOCKED. Claude Code Host의 NEW_PROJECT Live: NOT_RUN
- 이 프로세스 단위 스크립트는 scratchpad에만 있고 회귀 테스트가 아니다(in-process 대응 테스트: `test/bootstrap.test.mjs:298`)
- Docker 의존 alpha 5건: 이 PC에서 NOT_RUN
