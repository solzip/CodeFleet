# NEW_PROJECT calendar fileset: Codex Host proposal and review

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: execution / audit
- Predecessor: [todo materialization](new-project-todo-materialization.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Contract

The `calendar` WorkItem owns only `public/calendar.mjs`. Its criteria: `mountCalendar`
plus pure month-date functions; month navigation and CRUD/completion through the
same store. The bootstrap fileset operation creates files only: an existing path is
a CONFLICT, and there is no modify operation. No existing file needed changing,
because `app.mjs` already calls `mountCalendar(root, store, {onEdit, onCreate, onError})`
and `styles.css` already has the calendar classes. The owner's request adds a week
view, which goes beyond the draft's month-only requirement and criteria. It is
contained in the same file and reuses the 7-column grid class.

## Host run

An interactive Codex 0.162.1 session run by the owner (`rollout-…16-35-06…`). It made
direct CLI calls `status`, `workflow` and `files` in the sandbox, with no escalation
(no Git). The tool showed exit 1 for `files`, which is the known display of a CLI
exit 2. The task went from revision 10 to 11. No repository write occurred: tree, status,
index and HEAD were unchanged.

## Fileset

`801ce0423917eecdd8e864d965db434f1a279d3de86b9b477552460f460e652e`, record
`…-calendar-r10`, `WAITING_APPROVAL`, 0 approvals; integrity 5/5. One file:
`public/calendar.mjs`, 11870 B, sha256 `cdc303ec6e6f9b42eba463c04026b6ab6f3586827982f283fbfe2adbbed91ba5`,
absent on disk.

## Review

Static review of the full file: exports `isLeapYear`, `daysInMonth`, `addDays`, `dayOfWeek`,
`shiftMonth`, `getMonthGrid`, `getWeekRange`, `movePeriod` and `mountCalendar`. It uses
only the passed store (`getSnapshot`, `subscribe`, `setCompleted`, `remove`), with no
`createStore`, storage key or import. It writes user text only through `textContent`.
`setAttribute` is used only for `role` and `aria-*` (10 calls). There are 0 matches for
`innerHTML`, style attributes, `.style`, network or `eval`.

Local execution of the pure functions on a scratch copy (not CodeFleet evidence):
22/22 checks passed, including weekday and next-day results compared with `Date`
across 47,847 days (1970–2100), leap years, month-end clamping, and year boundaries.
DOM behaviour was not executed.

Findings, none blocking:
- In week view, days from the adjacent month get the `outside` class (dimmed) although they are inside the viewed week.
- `mountCalendar` catches its own render errors, reports them through `onError` and returns. The `app.mjs` mount-failure branch is therefore reached only for synchronous throws before that.
- Deletion has no confirmation, the same as Todo.

## 결론

calendar fileset 1개 파일이 계약대로 제안됐고 무결성이 확인됐다. 순수 날짜 함수는 로컬 실행에서 22/22를 통과했다.
DOM·브라우저 동작은 NOT_RUN이다.

## 다음 작업

- 소유자 승인 시 `801ce042…` approve → materialize

## 미해소로 남긴 것

- 브라우저·DOM 동작 검증: NOT_RUN
- 주간 보기는 승인된 Draft 범위 밖의 추가 범위다 (Draft 개정 없음)
- 주간 보기의 `outside` 표시 문제
