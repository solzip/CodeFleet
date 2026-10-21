# NEW_PROJECT todo fileset: defect fixes and re-proposal on the same task

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: execution
- Predecessor: [todo fileset review recheck](new-project-todo-fileset-review-v2.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.

## Re-proposal support

Already in the product, no change needed: `submitBootstrapFiles` (`src/product/tasks.mjs:229-251`)
accepts a new fileset for an item in `FILESET_PROPOSED` whose prior record is
`WAITING_APPROVAL` or `READY`. It deletes the prior approvals, sets the prior
record's `control` to `cancel`, emits `BOOTSTRAP_FILESET_SUPERSEDED`, and binds to
the task revision. `materializeTask` refuses a cancelled record (`:259`).
**No test in `test/bootstrap.test.mjs` covers this path.** It was reproduced in a
scratch fixture before use: with the old fileset already approved, a stale-revision
proposal was refused, the old record got 0 approvals and `cancel`, approving the old
hash was refused (`No proposed fileset matches the approval hash`), and the new
fileset still required approval.

## Fixes (authored in Claude Code, submitted as `host claude files`)

| File | Change |
| --- | --- |
| `server.mjs` | Decode with `URL` + `decodeURIComponent` (400 on failure); refuse encoded `/` or `\`, NUL, backslash and any path whose `posix.normalize` form differs (404); fixed allow-list only; served file must be a regular file whose real path equals root/file (a link anywhere → 404); opened handle's dev/ino must match the checked entry; 1 MiB cap |
| `public/app.mjs` | Calendar outcomes separated: 404 → not ready yet; other HTTP error, import failure or missing `mountCalendar` → load failure with the error message; exception in `mountCalendar` → mount failure, also sent to `onError` |
| `public/styles.css` | Calendar class contract (`calendar-nav/grid/weekday/day/event` and states) so the calendar module needs no style attribute; CSP unchanged |
| `docs/usage.md` | `<img …>` example in a code span; calendar outcome list; CSP/style policy (classes or CSSOM only, no `setAttribute('style')`); server path rules |

`package.json`, `public/index.html` and `public/todo.mjs` are byte-identical to v1.

## Local check (scratch copy, not CodeFleet evidence)

The revised server ran from a scratch copy with the repository's `src/` files. 19
requests behaved as intended: 4 allowed paths 200; `/calendar.mjs` GET and HEAD 404;
`/../`, `%2e%2e`, `..%2f`, `%2f`, `//`, `%5c` and `/server.mjs` 404; an invalid
escape 400; POST and PUT 405. With `public/` replaced by a junction to an outside
directory, `/` and `/app.mjs` returned 404. With the link check removed, both
returned 200. `node --check` passes for `server.mjs` and `app.mjs`. Browser code
was not executed.

## Real task

Revision 8 → 9. Old record `…-todo-r7` (`35b12b05…24ce7`): `control: cancel`,
0 approvals, events `PROPOSED > SUPERSEDED`. New record `…-todo-r8`
(`74cdb27355644f034c3ef5462115d2a2b35eccae3ab138063ea153e1c21fbed4`):
`WAITING_APPROVAL`, 0 approvals; integrity checks 5/5; 7 targets absent.
`data-model` stays `MATERIALIZED` (record COMPLETED, unchanged events). Repository
status digest `efeafed2…`, data-model digests and `.git/index` unchanged.

## 결론

같은 Task와 WorkItem에서 수정 fileset으로 교체했고, 이전 요청은 승인 불가 상태(cancel)가 됐다.
서버 경로·링크 방어를 사본 실행으로 확인했다. 브라우저·테스트 검증은 NOT_RUN이다.

## 다음 작업

- 소유자 승인 시 `74cdb273…` approve → materialize
- supersede 경로 회귀 테스트 추가 (제품 테스트 공백)

## 미해소로 남긴 것

- supersede 경로를 지키는 자동 테스트 없음
- 이번 수정본은 Codex가 아니라 Claude Code가 작성했다 (Host 제안 권한은 동일하게 PROVIDER_REPORTED_ONLY)
