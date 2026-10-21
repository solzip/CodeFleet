# NEW_PROJECT todo fileset: owner's Codex final review, rechecked

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: audit (read-only)
- Predecessor: [todo fileset review](new-project-todo-fileset-review.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## State after the owner's Codex review

Unchanged against the previous record: Task revision 8, `todo` `FILESET_PROPOSED`,
fileset `35b12b05…24ce7` `WAITING_APPROVAL`, 0 approvals, one event
(`BOOTSTRAP_FILESET_PROPOSED`); all integrity checks true; 7 targets absent;
repository status 94 / `efeafed2…`, data-model digests, HEAD unborn and
`.git/index` unchanged.

## What the Codex session did (session log)

- One `require_escalated` call with a justification, approved by the owner: a read-only `probeRepository`/`gitStatus` run, exit 0, `UNBORN_HEAD`. This is the first observed use of the command-specific approval path. It ran internal probe modules through `node -e`, not the CodeFleet CLI.
- A call containing `objective approve` was an `rg` search of CLI source, not an execution.
- Conclusion: approvable; no critical or high findings. Two low findings: `server.mjs` `readFile` follows symbolic links, and the `<img …>` example in `docs/usage.md` is not in a code span.
- Exit-code finding: `node -e "process.exitCode = 2"` is shown as 1 by the Codex Windows exec tool, while `$LASTEXITCODE` reads 2. Earlier "exit 1" reports for pending (exit 2) CLI calls match this display difference. Not a CodeFleet defect; the Host should read the JSON state rather than the shown exit code.

## 결론

최종 검토 후에도 fileset과 Task, 저장소는 바뀌지 않았고 승인 가능 판정도 유지된다.
Host의 명령별 승인 경로가 읽기 전용 probe 실행에서 처음 실측됐다.

## 다음 작업

- 소유자 승인 시 todo fileset approve → materialize

## 미해소로 남긴 것

- 서버·브라우저·테스트 실행 검증: NOT_RUN
- CodeFleet CLI 자체를 escalation으로 실행한 경로는 이 세션에서 관측되지 않았다
- 낮음 4건(링크 추적, 문서 코드 표기, 캘린더 오류 객체 폐기, CSP inline style)은 미수정
