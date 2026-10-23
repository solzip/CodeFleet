# NEW_PROJECT process-level E2E as a regression test, and a Live planning procedure

- Date: 2026-10-23 (Asia/Seoul), PC: work
- Target commit: c205da6 (feature/new-project-bootstrap) plus the uncommitted changes listed below.
- Type: correction (test added; no product source changed)
- Predecessor: [P0 acceptance re-measurement](new-project-p0-acceptance-remeasure.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Change

- `test/bootstrap-process.test.mjs` (new), 4 tests: 2 per host, `claude` and `codex`. Every step is a separate `src/alpha/cli.mjs --state STATE` process; only STATE is shared. It reuses `command`, `environment`, `requireSuccess` (`src/alpha/process.mjs`) and `git` (`src/alpha/workspace.mjs`), and keeps its fixture inline the way `test/bootstrap-verify.test.mjs` does. `environment()` forwards no API key and no Docker variable, and the test asserts that.
  - Test 1: empty `git init` → `host plan` (`NEW_PROJECT`/`UNBORN_HEAD`) → `status` re-query → `draft` `VALIDATED` (G3) → `status` re-query → `prepare` → `workflow` (G4: 64-hex `workflowHash`, the 8 Draft items in order, `executable:false`) → a second `workflow` returns the same hash. The repository holds only `.git` and HEAD stays unborn.
  - Test 2: a Draft with a `references` field is refused and the task revision is unchanged. `host approve`, `host materialize` and `host clarify` are refused. `objective run` is blocked. Materialize before approval is refused. An approval with a wrong hash is refused, and materialize is still refused after it. Positive control: the matching hash approves, materialize creates exactly the 3 files with their content, `verification` is `NOT_RUN`, `complete` is `false`, and HEAD stays unborn.
- `package.json` `test:alpha`: the file is appended. `scripts/test-alpha-ci.mjs` reads this list, so CI picks it up without further change (its file-name pattern matches).
- `docs/product-completion/host-live-acceptance.md`: new section 「NEW_PROJECT planning pilot」 with the minimal Live procedure (prepared, not authorized or executed).

## Verifying the test

Four guards were broken one at a time in a scratch copy of `src/`, `test/` and `package.json`:

| Mutation | Tests failing (of 4) | What caught it |
| --- | --- | --- |
| `src/intent/bootstrap.mjs:40` deletes `references` before the field check | 2 | forged draft exit `0`, expected `1` |
| `src/product/tasks.mjs:134` approval matches any fileset | 2 | message: a second guard (`Explicit matching workflow approval…`) still refused it |
| `src/product/tasks.mjs:359` materialize accepts `WAITING_APPROVAL` | 2 | message: a second guard (`Fileset approval absent, expired or invalid`) still refused it |
| `src/hosts/cli.mjs:110` host passes unknown actions to the operator CLI | 2 | message: host approve reached the operator path |

In every case the 2 failing tests were the refusal tests (claude and codex), and the 2 planning tests stayed green. The first try at the `references` mutation (adding the key to the field list) failed all 4 tests, because the field check requires every listed key. That run was discarded as not isolating the guard. For the hash and approval-state mutations the product still refused the operation through a second guard; the test detects the first guard's loss only by its message.

## Regression

Measured per suite, output discarded, `$?` read directly.

| Command | Exit | Count |
| --- | --- | --- |
| `npm run test:legacy` | 0 | 324/324 |
| `npm run test:alpha` | 1 | 247 tests: 235 pass, 5 fail, 7 skip (predecessor: 243 / 231 / 5 / 7) |
| `npm run test:host-core` | 0 | 13/13 |
| `npm run posttest` | 0 | 4 checkers |
| `node --test test/bootstrap-process.test.mjs` | 0 | 4/4 |

Failure classification: all 5 alpha failures are `actual: undefined, expected: '1'`, one at each of `test/host-ipc.test.mjs:15`, `test/host-planning.test.mjs:96`, `test/operator-runtime.test.mjs:84`, `test/operator-runtime.test.mjs:93`, `test/operator.test.mjs:160`. All five assert `process.env.CODEFLEET_TEST_DOCKER === '1'` (Linux/Docker isolation tests). None is in a bootstrap file.

Correction to the predecessor: it named 3 of these assertion sites. Its pattern matched only `CODEFLEET_TEST_DOCKER, '1'` with a space after the comma, so it missed `host-ipc.test.mjs:15` and `operator-runtime.test.mjs:84`. The cause it reported is unchanged. There are 5 sites, one per failure.

## Live preparation (no model)

Steps 1–3 of the new packet section were run in a scratchpad for both hosts: empty `git init`, `scripts/host-install.mjs install`, then the installed runtime. Install exit 0. `host <h> plan` gave exit 2, `NEW_PROJECT`/`UNBORN_HEAD`/`NEEDS_INPUT`. `capabilities` exit 0. Fixture status showed only `?? .claude/` or `?? .agents/`. Host versions: Claude Code 2.1.309, codex-cli 0.162.1. No Host session was started.

## 결론

빈 Git 저장소의 Task → Draft(G3) → DAG(G4) 프로세스 간 재조회와 허위 Reference·무승인 실행·잘못된 해시 거부가 claude·codex 정식 회귀 테스트 4건으로 들어갔고 4/4 통과, 변이 4/4 검출.
회귀: legacy·host-core·posttest exit 0, alpha exit 1은 5건 모두 `CODEFLEET_TEST_DOCKER` 미설정.
모델 Live는 절차만 준비됐고 실행하지 않았다.

## 다음 작업

- 소유자 승인 시: packet 「NEW_PROJECT planning pilot」 4–7단계를 Claude Code, Codex 순으로 1회씩 실행

## 미해소로 남긴 것

- 실제 모델이 자연어에서 BootstrapDraft를 쓰는 경로: Claude Code NOT_RUN, Codex NOT_RUN(10-21 운영자 중개 기록만 있음)
- 고정 Draft의 E2E 통과는 모델 Live 성공이 아니다
- 해시·승인 상태 가드는 각각 두 번째 가드가 겹쳐 막는다. 테스트는 첫 가드 상실을 메시지로만 구분한다
- Docker 의존 alpha 5건: 이 PC에서 NOT_RUN
- Linux CI에서 새 테스트 실행: NOT_RUN (push 필요)
