# NEW_PROJECT todo fileset: direct Codex Host proposal and static review

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes, including the Windows Codex preparation recovery (`docs/implementation/host-native.md`).
- Type: execution / audit (read-only review)
- Predecessor: [data-model materialization](new-project-data-model-materialization.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Runtime

The installed runtime differed from the worktree in 8 of 83 files and lacked the
`require_escalated` guidance. Both path sets were identical (83/83), so the
receipt-verified remove + install was expected to leave `git status` unchanged.
Measured: 94 entries, digest `efeafed2…` before and after; the task's materialize
preflight (92 entries outside owned paths) still matched.

## Host run

The owner ran an interactive Codex 0.162.1 session (elevated sandbox, `--add-dir`
for the state directory). Codex called `host codex status`, `workflow` and `files`
itself; the session log shows each exit 0 in the normal sandbox, with no
`require_escalated` request: these commands read and write only the state
database and run no Git. The Task moved from revision 7 to 8 and `todo` to
`FILESET_PROPOSED`. Side effect: `--add-dir` granted `CodexSandboxUsers` Modify on
the state directory; the owner keeps FullControl.

## Fileset

`35b12b05755f2daead579b349ec05041edbb86a49ad4a1d164f06dd529624ce7`, record
`…-todo-r7`, `WAITING_APPROVAL`, 0 approvals. The manifest recomputes equal; the
content artifact and all 7 per-file digests match; the path set equals the
WorkItem's; the stored content equals Codex's JSON; none of the 7 targets exists.
Repository status, data-model digests, HEAD (unborn) and `.git/index` were
unchanged.

## Static review (code read, nothing executed)

All four acceptance criteria are met on reading. Calendar absence is handled by a
dynamic `import('./calendar.mjs')` after Todo is mounted, with a visible fallback.
No `innerHTML`, `eval`, network client, child process or file write in browser
code. The server binds 127.0.0.1, routes an explicit 8-entry map, matches raw
paths, and returns 405 for anything other than GET or HEAD.

Notes, none blocking: the calendar fallback discards the error object, so a later
mount failure would look like a missing file; the CSP `style-src 'self'` will
refuse inline style attributes in the future calendar module; deletion has no
confirmation (documented).

## 결론

설치된 runtime을 Task 기준선 변화 없이 교체했다. 실제 Codex가 CLI를 직접 호출해 todo fileset 승인 요청을 만들었다.
정적 검토에서 계약 위반이나 위험한 API는 없었다. 실행 검증은 NOT_RUN이다.

## 다음 작업

- 소유자 승인 시 todo fileset approve → materialize

## 미해소로 남긴 것

- 서버, 브라우저, 테스트 실행 검증: NOT_RUN (`tests` WorkItem 이후)
- 명령별 승인 경로는 이번 실행에서 사용되지 않았다 (git을 부르는 명령이 없었음)
