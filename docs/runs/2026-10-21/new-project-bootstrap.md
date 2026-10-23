# NEW_PROJECT bootstrap: probe, contract, DAG and approved file creation

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main); uncommitted changes on feature/new-project-bootstrap.
- Type: correction / execution
- Predecessor: read-only analysis in the same session (not filed); [first real Host-Native contract](../2026-10-20/host-native-baseline-readiness.md) is the latest prior run on this baseline.
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Confirmed blocker

On an unborn-HEAD repository `host codex plan` recorded the task, then
`src/intent/discovery.mjs:12` (`rev-parse HEAD`) threw inside `src/intent/semantic.mjs:10`;
`src/product/tasks.mjs:46` stored the plan as BLOCKED. No Draft existed, so G3
`validateDraft` and G4 `hybridDefinition` never ran. Reproduced on the real
`codefleet-todo` (exit 2, `Baseline failed (128)`). With a README-only commit,
code references (`semantic.mjs:31`), file discovery (`intent/contract.mjs:24,27`),
`applyEdits` (no new files) and the 5-item G4 cap still blocked a new project.

Git ownership: CodeFleet runs Git with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM`
nulled (`src/alpha/process.mjs:11`), so a user's global `safe.directory` entry is
not read. Reproduced with `GIT_TEST_ASSUME_DIFFERENT_OWNER=1`; the refusal is now
classified `GIT_OWNERSHIP` with that remedy. Nothing configures `safe.directory`.

## Decisions (approved by the owner before implementation)

| Item | Decision |
| --- | --- |
| Bootstrap WorkItem cap | 12, separate from maxAttempts 1..5 |
| Non-Git directory | planning allowed; file creation requires the user to run `git init`, then a new task |
| Fileset content | Host proposal (PROVIDER_REPORTED_ONLY) bound by hash; operator approves; CodeFleet writes |
| Tests in P0 | not wired; `tests` item stays BLOCKED on `trusted-local-command`, existing `verify-local` applies |

## Change

- `src/intent/probe.mjs` — six states; the contract is chosen by the probe, never by Draft input.
- `src/intent/bootstrap.mjs` — BootstrapDraft validator. Objective `USER_DECLARED`, Draft `PLANNED`, probe `HOST_OBSERVED_REPOSITORY_STATE`, code `NONE`. `references`/authority fields and already-present paths are refused.
- `src/workflow/bootstrap.mjs` — bootstrap DAG; capability and approval derived from kind.
- `src/workflow/bootstrap-files.mjs` — exclusive create (`wx`), no-write preflight, link/realpath checks, read-back digest, per-file results.
- `src/product/tasks.mjs`, `report.mjs`, `cli.mjs`, `src/hosts/cli.mjs`, `install.mjs` — lifecycle, `host files`, `objective materialize`, Skill text.
- `src/alpha/controller.mjs` — a fileset row can never run as an alpha Run.

Existing G3 functions (`discover`, `validateDraft`, `validateSemanticProposal`, `applyEdits`) are unchanged.

## Measurements

Exit codes measured per suite because `npm test` stops at `test:alpha`.

| Command | Before (origin/main) | After |
| --- | --- | --- |
| `npm run test:legacy` | exit 0, 324/324 | exit 0, 324/324 |
| `npm run test:alpha` | exit 1, 212 tests: 200 pass, 5 fail, 7 skip | exit 1, 225 tests: 213 pass, 5 fail, 7 skip |
| `npm run test:host-core` | exit 0, 12/12 | exit 0, 12/12 |
| four posttest checkers | NOT_RUN | exit 0 each |

The 5 alpha failures are the same five tests before and after, all one cause:
`CODEFLEET_TEST_DOCKER` unset (`undefined !== '1'`) on this Windows PC.

`test/bootstrap.test.mjs`: 13 tests. Eight guards were removed one at a time;
seven each made a test fail. The two link guards mask each other: removing one
passes, removing both fails the junction test.

Real `codefleet-todo`: `BLOCKED` → `NEW_PROJECT` / `NEEDS_INPUT`; its
`git status --porcelain` digest was identical before and after the probe.

## 결론

빈 저장소, README만 있는 저장소, 비 Git 디렉터리에서 BootstrapDraft와 DAG 계획이 가능해졌다.
승인된 fileset은 덮어쓰지 않고 생성되며, Evidence는 CODEFLEET_DIRECT_WRITE, 검증은 NOT_RUN으로 남는다.
기존 G3 경로와 회귀 결과는 바뀌지 않았다.

## 다음 작업

- Codex·Claude Host Live로 BootstrapDraft와 fileset을 실제로 생성해 보기
- 소유자가 승인하면 커밋과 PR

## 미해소로 남긴 것

- 계획 전용 WorkItem은 검증된 계획으로 충족된 것으로 취급하며, 따로 산출물을 검사하지 않는다.
- 숨김 경로(`.gitignore` 등)는 기존 `filePath` 규칙 때문에 계획하거나 생성할 수 없다.
- CONFLICT 이후 fileset을 다시 제안할 수 없다. 해당 task를 거부하고 새 task로 시작해야 한다.
- 비 Git 계획은 `git init` 이후에 새 task로 다시 계획해야 한다.
- 실제 소유권 거부는 git 시뮬레이션으로만 재현했다. 두 번째 OS 계정으로 end-to-end 확인은 하지 않았다.
- 기존 G3는 `src/`·`test/` 아래 js/ts/java만 인식하므로, 다른 레이아웃은 커밋 이후에도 BOOTSTRAP_CANDIDATE로 남는다.
