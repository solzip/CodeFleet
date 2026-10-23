# feature/new-project-bootstrap: PR readiness against origin/main and docs/host-native-live-records

- Date: 2026-10-23 (Asia/Seoul), PC: work
- Target commit: 1a13a1f774859c9cc184747671fc0005db17da26 (feature/new-project-bootstrap); origin/main 07209ee75f61dd78a6c49bc7a3ffd9e38edece64; origin/docs/host-native-live-records a85473c11484c35da0c6d59fba69536a427035d6
- Type: audit (read-only; merges simulated, integrated trees tested in temporary detached worktrees, nothing committed or pushed)
- Predecessor: [process regression](../../runs/2026-10-23/new-project-process-regression.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Commit and file differences

All three refs share the merge base `2a330bb`.

| Range | Commits |
| --- | --- |
| origin/main..feature | 4 (`4fa0291`, `6ece34c`, `c205da6`, `1a13a1f`) |
| feature..origin/main | 2 (`358e07f`, merge `07209ee` of PR #7) |
| origin/main..live-records | 3 (`dc1140a`, `6ced3df`, `a85473c`) |

Files changed from the base: main 9, feature 35, live-records 8. Every pairwise overlap is the same 3 files: `README.md`, `README.en.md`, `docs/INDEX.md`. `.github/` is identical on main and feature.

## Merge simulation (`git merge-tree --write-tree`)

| Merge | Result |
| --- | --- |
| origin/main + feature | exit 0, no conflict |
| origin/main + live-records | exit 0, no conflict |
| (main + feature) + live-records | exit 1: content conflicts in the 3 overlap files |
| (main + live-records) + feature | exit 1: the same 3 files |

The conflicts in either order are the same kind: both sides raise the same declared counts and add rows to the same 10-21 table position. There is no conflict in source or tests.

## Declared counts

| Ref | `docs-indexed` / `docs-on-disk` | `audit-run-records` |
| --- | --- | --- |
| base `2a330bb`, origin/main | 101 | 94 |
| feature `1a13a1f` | 114 | 107 |
| live-records `a85473c` | 104 | 97 |
| main + feature (simulated) | 114 | 107 |

main + feature needs no count edit: main adds no audit or run record.

The three-way tree was built in a temporary worktree: main + feature, the five live-records files, and a hand-resolved version of the 3 conflicts. The resolution took the union of the INDEX rows, set 117 (`감사 38 · 실행 72 · 아카이브 7`) and set `audit-run-records` 110. After `test:legacy`, `check:links`, `check:citations`, `check:facts` and `posttest` all exited 0 with mismatches 0. Before the legacy run, `check:facts` failed with `nothing measures a fact named "tests-passing"`: the checker reads the legacy TAP summary, so in a fresh worktree it must run after `test:legacy`. This record adds one audit document, so with it committed the targets become feature 115 / 108 and three-way 118 / 111.

## Integrated tests (main + feature, temporary worktree)

| Command | Exit | Count |
| --- | --- | --- |
| `npm run test:legacy` | 0 | 324/324 |
| `npm run test:alpha` | 1 | 247 tests: 235 pass, 5 fail, 7 skip |
| `npm run test:host-core` | 0 | 13/13 |
| `npm run posttest` | 0 | 4 checkers |
| `node --test test/bootstrap-process.test.mjs` | 0 | 4/4 |

The 5 failures are `actual: undefined, expected: '1'` at `test/host-ipc.test.mjs:15`, `test/host-planning.test.mjs:96`, `test/operator-runtime.test.mjs:84`, `test/operator-runtime.test.mjs:93` and `test/operator.test.mjs:160`, all `CODEFLEET_TEST_DOCKER`. This matches the feature branch alone.

## Statements that become false after merge

origin/main `358e07f` describes Bootstrap as not on main. These lines survive the merge unchanged in the simulated tree:

- `CLAUDE.md:25`
- `README.md:13`
- `README.en.md:9`
- `docs/INDEX.md:13`
- `docs/product-completion/architecture.md:26`
- `docs/product-completion/progress.md:15`
- `docs/product-completion/roadmap.md:15` (and the completion criterion at `:12`)

That makes 7 files and 8 lines. Once merged, these say that a feature present on main is absent from it. The feature branch cannot edit these lines without first containing `358e07f`.

## CI

`.github/workflows/alpha.yml` runs on `pull_request` and on push to `main` and `feat/**`. `feature/**` does not match that pattern, so no CI run exists for this branch. `gh run list --branch feature/new-project-bootstrap` printed nothing. A PR triggers the `windows` job and the `linux-alpha` job, which has real Docker and runs `scripts/test-alpha-ci.mjs`. The new test file matches that script's name pattern. The 5 Docker-dependent tests and the new process test on Linux have never run for this branch.

## 결론

main 대비 PR 생성 가능: 충돌 0, 통합 트리 legacy·host-core·posttest exit 0, alpha는 Docker 미설정 5건만 실패(기존과 동일).
live-records와는 순서와 무관하게 건수·색인 3파일만 충돌하며, 합집합 + 117/110(이 기록 포함 시 118/111)으로 해소된 트리가 문서 검사기 전부를 통과했다.
병합 시 main의 「Bootstrap은 별도 개발 중」 서술 8줄이 거짓이 된다.

## 다음 작업

- 소유자 결정: 병합 순서, 거짓이 될 서술 8줄의 처리 시점, PR 생성

## 미해소로 남긴 것

- Linux CI(`linux-alpha`, Docker 5건 포함)에서 이 브랜치: NOT_RUN
- 8줄의 정정 문안: 미작성 (상태 표현이 소유자 판단)
- 모델 Live: NOT_RUN (변경 없음)
- `main-next` worktree의 미커밋 `docs/tasks/2026-10-21.md` 1줄과 미추적 `2026-10-23.md`는 live-records 원격에 없다
