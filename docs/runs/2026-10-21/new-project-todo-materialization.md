# NEW_PROJECT todo fileset v2 approval and materialization

- Date: 2026-10-21 (Asia/Seoul), PC: work
- Target commit: 2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba (origin/main) plus the uncommitted feature/new-project-bootstrap changes.
- Type: execution
- Predecessor: [todo fileset v2](new-project-todo-fileset-v2.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.
- Owner approval: explicit, for the 7 files of fileset `74cdb27355644f034c3ef5462115d2a2b35eccae3ab138063ea153e1c21fbed4` and the directories they need.

## Pre-execution recheck (9 of 9 matched)

Task revision 9; record `…-todo-r8` `WAITING_APPROVAL`, 0 approvals, hash equal,
pointer on r8; fileset integrity 5/5 and 7 targets absent; probe `UNBORN_HEAD`,
same repository, materialize preflight passing; `data-model` MATERIALIZED with
unchanged digests; old record r7 still `cancel` with 0 approvals.

## Execution (installed runtime `.agents/skills/codefleet/runtime/alpha/cli.mjs`)

`objective approve … --actor sol` exit 0 (record READY); `objective materialize … todo`
exit 0, `MATERIALIZED`, 7 × `CREATED`, evidence `ee2a61df…a083`
(`CODEFLEET_DIRECT_WRITE`, `verification: NOT_RUN`, `complete: false`).

## Post-checks, measured outside CodeFleet

| Check | Result |
| --- | --- |
| Created | exactly 7 files and `public/`, `docs/`; tree 95 → 102 files, no other hash changed |
| SHA-256 (`fs` read + `sha256`) | 7/7 equal to the manifest |
| Git | HEAD unborn, `.git/index` and `ls-files -s` digests unchanged; status 94 → 101 (7 `??`) |
| data-model | `578cdbe4…`, `fbb86373…` unchanged |
| WorkItems | `todo` MATERIALIZED; `calendar` now waits on nothing; `tests` waits on `calendar` |
| Rerun | exit 1, `Fileset is COMPLETED; approval required or already terminal` |
| Old fileset r7 | still `cancel`, 0 approvals, events `PROPOSED > SUPERSEDED` |
| Verification | `NOT_RUN`; task revision 10, `complete: false` |

## 결론

승인된 7개 파일과 디렉터리 2개만 생성됐고, 해시가 모두 일치한다. 재실행은 거부됐다.
Git HEAD와 index는 바뀌지 않았고, calendar 의존성이 풀렸다. 검증은 NOT_RUN이다.

## 다음 작업

- calendar WorkItem fileset 제안 (별도 승인)

## 미해소로 남긴 것

- 서버·브라우저·자동 테스트 실행 검증: NOT_RUN (`tests` WorkItem 이후)
- supersede 경로 회귀 테스트 없음
- 승인 actor는 문자열이며 OS 인증이 아님
