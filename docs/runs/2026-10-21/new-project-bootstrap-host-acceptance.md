# NEW_PROJECT bootstrap: real Codex Host acceptance on codefleet-todo

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: execution / correction
- Predecessor: [NEW_PROJECT bootstrap](new-project-bootstrap.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.
- Host: codex-cli 0.162.1, `codex exec --sandbox workspace-write`, no approval bypass. Session cost: not measurable.

## Installation

The previous receipt-verified install was removed and the branch runtime installed
(`scripts/host-install.mjs`). `git status --porcelain --untracked-files=all` went
from 88 to 92 entries with a different digest: installing the Skill changes the
task baseline, so tasks must be planned after installation.

## Host runs

| Run | Sandbox | Result |
| --- | --- | --- |
| 1 | `elevated` (global config) | commands ran as `CodexSandboxOffline` (SID …-1004); repository owned by SID …-1001 → `dubious ownership`; probe `GIT_OWNERSHIP`, BLOCKED |
| 2 | `-c windows.sandbox="unelevated"` (this run only) | `GIT_ERROR: spawn EPERM` |
| diagnostic | unelevated | node could not start any child process, including itself (4/4 `EPERM`); the same script as the owner: 4/4 exit 0 |
| 3 | `elevated`, CLI forbidden | Codex wrote BootstrapDraft and fileset JSON only; the owner ran the CLI |

Repository status digest was identical before and after every run. No
`safe.directory`, global config, ownership or Git state was changed.

Correction: `spawn EPERM` is now classified `PROCESS_SPAWN_DENIED` instead of
`GIT_ERROR` (`src/intent/probe.mjs`). A mutation reading Git output instead of the
spawn error made the new assertion fail.

## Operator-mediated result

- Task `task-dc4dc1e6-0547-4fb1-91e3-6317b2b55c0c`: plan exit 2, `NEW_PROJECT` / `UNBORN_HEAD`, `NEEDS_INPUT`.
- Codex draft: 10 planned files, 5 planned tests, 6 criteria, 4 decisions, 8 WorkItems; gaps 0.
- Draft submission: exit 2, `NEEDS_INPUT`, one unknown: `Potential privileged intent requires explicit scope clarification; planner cannot waive it`.

The objective contains `삭제` (deleting a todo in the app), which matches the
privileged-intent pattern carried over from G3. The unknown is recomputed from the
objective, so no Draft can clear it and no bootstrap operator clarification exists.
prepare, files, approval and materialize were not reachable.

In-memory simulation only, not product state: with that one unknown removed, the
Codex DAG validates and the `data-model` fileset (`src/model.mjs`, `src/store.mjs`)
passes fileset validation.

Display defect: an `analysis` item shows `PLAN_RECORDED` with capability `BLOCKED`
(`host-read` not supplied), while dependents treat it as satisfied.

## 결론

실제 Codex Host는 sandbox 계정·프로세스 제약 때문에 CodeFleet CLI를 직접 실행할 수 없었다.
운영자 중개 경로에서 Codex가 작성한 Draft는 구조 검증을 통과했다.
목표 문장의 "삭제"가 해제할 수 없는 권한 의도 unknown을 만들어 fileset 승인 이전 단계에서 멈췄다.

## 다음 작업

- 권한 의도 unknown을 해소할 운영자 범위 확인 경로 결정 (소유자 판단)
- 그 뒤 prepare → files → 승인 → materialize 실측

## 미해소로 남긴 것

- Host가 CodeFleet CLI를 직접 사용하는 경로: BLOCKED (Windows Codex sandbox 두 모드 모두)
- 파일 생성·해시·충돌·상태 전이의 실제 Host 경로 검증: NOT_RUN
- analysis item의 상태와 capability 표시 불일치
