# Persistent Work Log recovery and Core integration review

- 작업 일시: 2026-10-30 16:30 KST 이후
- 대상 커밋: `b382380891fb0d259787f764f354934839815217`, `work/p0-persistent-worklog` 미커밋 변경
- 작업 유형: 읽기 전용 감사 및 문서 기록. 제품 Core/Live 소스·테스트 변경 없음.
- 선행 문서: [제품 원칙](../../PRODUCT_VISION.md), [아키텍처](../../product-completion/architecture.md), [로드맵](../../product-completion/roadmap.md), [Core 연결](../../runs/2026-10-30/supervised-proposal-continuation.md), [통합 검증](../../runs/2026-10-30/todo-integrated-verification-recovery.md).
- 번호 실측 최대값: docs 전체 P0-17 / P1-61. 아래 통합 검토 항목은 이 감사에서 추적하며 동결 REGISTER의 기존 판정을 변경하지 않는다.

## 판정

완료 Objective의 저장 상태 조회·Recovery는 성공했다. 실제 새 Host 프로세스 경계는 NOT_VERIFIED다.
Core의 정상 감독형 성공 경로는 Local 수용됐지만, 감독형 채택 후 Repair 조합에 통합 차단 결함이 있어
현재 후보를 무조건 merge-ready로 판정하지 않는다. 이번 작업은 코드 수정이나 재실행 승인이 아니다.

사용자 가치는 Host 관측 부재에도 정확한 감독형 개발을 이어가되 기존 승인·예산·Evidence를 보존하는 것이다.
기존 Store, DAG, Fileset Validator, Native Review, Reservation, Lease, Judge를 재사용하며 새 Scheduler,
Goal 저장소, 승인 엔진, Host 모델 API 또는 인증 경로를 추가하지 않았다.

## Host 관측 범위

현재 제공되는 Host의 list_threads/read_thread를 읽기 전용으로 조회했다.

| 관측 | 실제 값 |
| --- | --- |
| Thread | `01a18b84-204b-7a70-882f-ad86ba899f5d` |
| 이번 Turn | `01a18bb2-b85e-7ef0-a8a3-971e499748b2`, inProgress |
| 직전 통합 검증 Turn | `01a18bab-479a-75b0-891f-ed7b6af218f5`, completed |
| 판단 | 이번 감사와 직전 검증은 같은 Thread의 다른 Turn |
| CLI 프로세스 종료/새 시작 | NOT_VERIFIED |
| sessionId | 도구 응답에 제공되지 않음. Thread ID에서 추정하지 않음 |

기존 Thread는 resume될 수 있으므로 같은 Thread라는 사실만으로 CLI 재시작 여부를 확정하지 않는다.
공식 [App Server 문서](https://developers.openai.com/codex/app-server/)는 thread/read와
thread/resume을 구분한다. 이 감사의 조회는 세션 재개나 모델 호출이 아니다.
Host 조회 기능의 존재는 CodeFleet에 해당 Handoff의 전송·수신 이벤트가 연결됐다는 증거가 아니다.
기존 Todo Handoff 및 HOST_ADAPTER_UNAVAILABLE 기록은 그대로 보존했다.

## 완료 Objective 읽기 전용 복구

기존 실행 helper에서 State 경로를 확인하고 해당 SQLite만 readOnly로 열었다.
Worktree 상대 경로는 `.codefleet/persistent-worklog-live/run-01/state`다. 새 State를 만들지 않았다.

`recoverObjective`에 저장된 실행 묶음의 afterRecovery.checkpoint를 전달: RECOVERED / MATCHED, exit 0.
기존 CLI 진입점 `productCli(['recover', TASK], STATE)`도 별도 Node 프로세스에서 exit 0이었다.
두 조회 모두 실행 권한 false, automaticReplay false. 모델·Apply·Verification을 실행하지 않았다.

| 항목 | 복구 결과 |
| --- | --- |
| Task | `task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481` |
| Task / Contract Revision | 11 / 2 |
| Work Log | seq 77, Task 이벤트 65개. 전역 seq와 Task별 count는 다름 |
| Directive | `todo-title-max80-01`, APPLIED |
| WorkItems | requirements/fixed-tests PLAN_RECORDED; normalize/todo MATERIALIZED; verify-normalize LOCAL_CHECKPOINT; verify-integrated LOCAL_PASSED |
| 완료 | COMPLETE_LOCAL, complete true, remaining 없음 |
| Candidate | `cff4a24fd0aee1a4c7ab0703096dfa8d5fdaccf1b63e98b4d63ec411e25e4d11` |
| 통합 Evidence | `fc1b9d5f5d5631f3aa5d9eeb17ec00a43f0bd8b1ad75b2e396367962ad5a3f18` |
| 저장된 테스트 | 8 PASS / 0 FAIL / 0 SKIP, exit 0; 이번 감사에서 재실행하지 않음 |
| 이전 normalize Evidence | `841ed1bdddc1695fd69f1beb16fddeb777f7c4af6749e10d61c277daf755ec47` |
| Todo Materialization | `e369cd7367e188f71cb1875594fa9b743e98ef5d586b8f226b13662000a13a16` |
| 통합 Decision | `711d7906-e827-4f3e-aab4-7b0201193ac1`, CONSUMED, remainingExecutions 0 |
| 통합 Attempt | `bootstrap-attempt-5452d99f-70b8-4670-9c4f-d491b7a34368` |
| 예산 | 사용 2 Attempts / 예약 60000 ms; 잔여 1 Attempt / 60000 ms; retryAllowed false |
| Lease / 미확정 효과 | 활성 Lease 없음 / effects [] |
| Todo Handoff | PREPARED, observations [] |
| 제안 출처 | PROVIDER_REPORTED_ONLY; Review는 Host 수신 증거가 아님 |
| 보호 판정 | LOCAL_ONLY_UNPROTECTED; Protected UNSATISFIED / Judge ESCALATE |
| 공개 위임 | PUBLIC_DELEGATION_BLOCKED |

State의 content-addressed JSON Artifact 55개를 readArtifact로 읽어 전부 SHA 일치를 확인했다.
복구 전후 Task/Event/Decision/Reservation/Attempt/Approval/Run row 해시가 같았다.
Work Log 및 observation checkpoint도 이전 기록과 MATCHED다. 신규 Live Event 없음.
승인된 normalize/todo/todo-length 테스트 파일 매핑 충족은 의미적 완전성이나 branch coverage가 아니다.

이번 근거는 **완료 Objective의 현재 Turn 조회·별도 프로세스 복구**다.
진행 중 Objective의 실제 새 Host 세션 간 개발 연속성 수용으로 확대하지 않는다.

## Git 기준선과 포함 범위

읽기 전용 Git 조회와 원격 ls-remote 결과:

- HEAD, 저장된 origin/main, 실제 원격 refs/heads/main 모두 `b382380891fb0d259787f764f354934839815217`.
- 로컬 main은 `4477e4426960af46076d3aa29808201c1c8911a6`, HEAD보다 10 commits 뒤. main...HEAD는 0 / 10.
- 실제 원격: `https://github.com/solzip/codeFleet.git`. 이 브랜치는 upstream 없음.
- 감사 시작 시 tracked 수정 13개, untracked 7개, staged 없음.
- HEAD 대비 tracked diff: 13 files, +268 / -12. 신규 파일은 이 통계에서 제외된다.
- 로컬 main 대비 tracked diff는 94 files, +10218 / -164: 이미 원격 main에 포함된 10 commits를 섞으므로 이번 PR 범위가 아니다.
- 기존 12개 Worktree를 보존했다. reset/rebase/checkout/commit/push/PR/merge 없음.
- 기본 샌드박스 Git 조회는 dubious ownership으로 실패했다. 승인된 읽기 전용 실행에서 성공했다.
  ACL·소유권·safe.directory·인증 설정은 변경하지 않았다. 실행 컨텍스트 차이는 Host 세션 경계 증거가 아니다.

현재 통합 대상의 명시적 allowlist는 아래와 같다. 전체 디렉터리 add나 add -A는 제안하지 않는다.

| 파일 | 변경 역할 |
| --- | --- |
| src/product/work-log.mjs (신규) | 기존 Event/Artifact를 통한 Directive·배정·Handoff projection과 실행 경계 guard |
| src/product/directives.mjs (신규) | 기존 exact Contract Review를 재사용한 영향 분석·기록 |
| src/product/continuation.mjs | 협업 상태에 따른 다음 작업 선택, 저장 직접 제안의 정확한 적격성 검사 |
| src/product/tasks.mjs | 감독형 Fileset 등록 provenance, Apply/Verify coordination 재검사 |
| src/product/contract-revisions.mjs | 기존 계약 transaction 안에서 지침 판정과 영향 Handoff 준비 |
| src/product/native-local.mjs | 기존 Native Files Review에 출처·관측 한계 표시 |
| src/product/recovery.mjs | 지침·Agent Message·Handoff·adoption·미확정 효과 복구 |
| src/product/reservations.mjs | 기존 Reservation 및 fence에 coordination 재검사 |
| src/product/cli.mjs | 기존 objective CLI의 review/register/work-log/directive/assignment 진입점 |
| test/work-log.test.mjs (신규) | 성공·반증·중단·별도 프로세스 Recovery 회귀 |
| package.json | host-core suite에 work-log 테스트 포함 |
| docs/implementation/objective-recovery.md | 공개 경로와 신뢰 경계 계약 |
| docs/product-completion/progress.md | 현재 상태 및 후속 수용 한계 |
| docs/runs/2026-10-30/persistent-worklog.md (신규) | 최초 구현·회귀 기록 |
| docs/runs/2026-10-30/supervised-proposal-continuation.md (신규) | Core 연결·반증·Live 읽기 대조 |
| docs/runs/2026-10-30/todo-fileset-review-prepared.md (신규) | 승인된 등록·Native Review 준비 |
| docs/runs/2026-10-30/todo-integrated-verification-recovery.md (신규) | 승인된 실제 통합 검증과 별도 프로세스 복구 |
| docs/audits/2026-10-30/01-persistent-worklog-integration.md (이번 신규) | 이번 감사 |
| docs/INDEX.md | 기록 색인과 실측 수량 |
| README.md | 감사·실행 기록 수량 |
| README.en.md | 감사·실행 기록 수량 |

최종 문서 기록까지 포함하면 21개 파일이다. Core 9개 모듈, 테스트 1개, package 1개,
문서 10개다. 기존 staged/unstaged/untracked를 삭제하거나 다른 Worktree를 정리하지 않았다.

제외할 것: `.codefleet/**`의 SQLite/WAL/SHM, Artifact/Evidence 원본, 모델 원본,
Live repo, 테스트 임시 fixture, 일회 실행 helper, JSON 결과, 로그; `.rule-coverage/**`,
`.trials/**`의 로컬 실험. 기존 제품 test/fixtures와 이번 test/work-log.test.mjs는
재현 가능한 회귀 소스이며 로컬 Live fixture와 구분한다.
현재 Live/helper 제외는 공유 Git info/exclude의 `.codefleet/` 규칙에 의존한다.
이 규칙은 새 clone에 배포되지 않으므로 경로 allowlist와 staged diff 검사로 누출을 막아야 한다.
무시된 자료를 지우거나 force-add하지 않는다.

Core diff와 신규 모듈·테스트에서 SID/ACL/safe.directory/login/token-copy 코드 추가는 발견하지 않았다.
일회 helper와 Live 자료는 제품 모듈·package 진입점에서 참조하지 않는다.
기존 API Provider 또는 기존 다른 실험의 존재를 이번 변경으로 오인하지 않는다.

## 통합 검토 항목

### 감독형 채택 이후 Repair가 다시 Handoff에 막힘 — 수정 후 통합 권고

현재 작업 트리의 src/product/work-log.mjs 54–66행에서 adoption은 오직
current.bootstrap.filesets[itemId]의 run.supervisedProposal 및 원 제안 파일 digest 일치로 판정한다.
src/product/tasks.mjs 465–495행의 submitRepairFiles는 새 run에 supervisedProposal을 남기지 않고,
current Fileset 포인터를 새 Repair run으로 바꾼다. materializeTask의 첫 coordination guard는
동일 파일 500행에서 다시 실행된다.

따라서 감독형 원 제안 적용 → 실제 LOCAL_FAILED → 허용된 Repair 등록 경로에서,
등록 직전에는 원 Fileset adoption으로 guard를 통과하지만 등록 이후 adoption=false가 된다.
Handoff는 여전히 PREPARED이므로 Native Apply에서 AGENT_HANDOFF_UNCONFIRMED가 발생한다.
원 제안 metadata를 새 digest에 단순 복사해도 원 제안과 새 파일 hash가 달라 해결되지 않는다.
승인 확대나 허위 ACK로 해결해서는 안 된다. 역사적 채택과 새 exact Repair 승인의 관계를 기존
계약 안에서 검토하고, 이 조합의 성공 및 무승인/미확정 Dispatch 반증을 추가해야 한다.

이는 코드 경로를 대조한 정적 finding이다. 이번 감사는 Live 실패 유도나 새 테스트 실행을 하지 않았다.
기존 test/work-log.test.mjs의 감독형 성공 테스트와 기존 Repair E2E는 각각 통과했지만
감독형 채택 + 실패 + Repair 조합의 수용 근거가 아니다. 현재 완료된 Todo 결과에는 영향을 주지 않는다.

### 현재 진행 문서와 과거 기록의 시간 범위

감사 시작 시 progress.md 상단은 초기 Live 준비·승인 대기 상태만 안내했다.
최신 완료 기록으로 연결하는 현재 상태 문단을 추가해 COMPLETE_LOCAL과 세션 미검증,
위 Repair 미해소를 명시했다. 초기 준비 시점 기록과 이전 실패 로그는 덮어쓰지 않았다.
README 변경은 수량이며 전체 Host 수용 완료를 새로 주장하지 않는다.

## 실제 검증 근거와 한계

아래는 기존 실행 기록과 보존 로그를 읽어 확인한 결과이며, 이번에 반복 실행하지 않았다.

| 기존 명령 | 결과 |
| --- | --- |
| npm.cmd run pretest | exit 0 |
| npm.cmd run test:legacy | 324 PASS / 0 FAIL / 0 SKIP, exit 0 |
| npm.cmd run test:host-core | 124 PASS / 0 FAIL / 0 SKIP, exit 0 |
| node --test test/continuation.test.mjs test/repair-loop.test.mjs test/native-local.test.mjs | 85 PASS / 0 FAIL / 0 SKIP, exit 0 |
| 최종 supervised 선택 회귀 | 4 PASS / 0 FAIL / 0 SKIP, exit 0 |
| 수정 후 posttest | exit 0, fact 42 / mismatch 0 |
| Live 통합 Review의 고정 테스트 | 8 PASS / 0 FAIL, exit 0; 저장 Evidence SHA 확인 |

최초 work-log 테스트의 1 FAIL과 posttest의 ownership/수량 실패는
[원 기록](../../runs/2026-10-30/supervised-proposal-continuation.md)에 보존돼 있다.
성공 건수를 합산해 독립 테스트 수로 표시하지 않는다. 선택 회귀는 중복된다.
Windows / PowerShell / Node 24.14.1 근거이며 Full Alpha/Docker Protected,
macOS/Linux, 제품 전체 E2E는 이 변경의 근거로 NOT_RUN/NOT_VERIFIED다.
기존 로그에는 최종 미커밋 전체 파일 해시 manifest가 없어 이를 새 Git commit의 수용으로 자동 이관할 수 없다.
수정·통합 후보가 달라지면 해당 회귀가 다시 필요하다.

이번 문서 기록 후 실행한 검사는 npm.cmd run posttest exit 0 및 git diff --check exit 0이다.
링크 missing target/case mismatch/missing anchor 모두 0, living citation 오류 0,
fact declarations 42 / mismatch 0. 기존 dated citation suspect 15와 unresolved 65는 유지했다.
Coverage·anchor·unchecked-number baseline은 변경하지 않았다. 제품 테스트/Live Verification은 실행하지 않았다.

## 기능별 현재 수준

| 기능 | 구조 / 회귀 | 실제 Live / E2E 한계 |
| --- | --- | --- |
| Persistent Work Log | 기존 SQLite Event/Artifact 재사용, 별도 프로세스 복구 회귀 | 완료 Task11/Contract2/seq77 복구 확인 |
| Directive Reconciliation | 지침 접수·영향·정확한 Revision Review, 반증 회귀 | todo-title-max80-01 APPLIED 실제 기록 |
| Contract Revision Synchronization | 기존 transaction·영향 범위·기존 승인/예산 보존 | Contract2에서 저장 제안·Apply·통합 Local 완료 |
| Agent Handoff | 준비/미확정/전달/수신 상태, 합성 관측 회귀 | normalize 과거 관측은 별도 역사; 현재 todo PREPARED, Host Adapter 미연결 |
| Supervised Proposal Continuation | 현재 계약/후보/파일 검사와 별도 승인, 반증 통과 | 저장 제안 1건 등록→Apply→8 PASS Local 성공. 실패 후 Repair 조합 미해소 |
| Objective Recovery | read-only checkpoint/무결성/효과·예산 복구 | 완료 Objective 현재 조회 및 별도 프로세스 성공 |
| Continuous Development | DAG/지침/fence/예산 연결, 기존 회귀 | 진행 중 Objective의 실제 Host 종료·재개 수용 미완료 |
| Host Session / Turn Observation | Host 조회 도구에서 실제 Thread/Turn 확인 | CodeFleet handoff 관측 adapter의 수용은 아님; 새 CLI 경계 NOT_VERIFIED |
| Context Compaction Recovery | 저장 상태 복구 구조 | 실제 Host 압축 전후 관측 NOT_VERIFIED |

## 다음 실제 Host 연속성 수용

새로운 별도 승인된 미완료 Objective에서 한 WorkItem의 Evidence를 저장하고 다음 작업을 남긴다.
종료 전 계약·후보·Work Log·Decision·예산·lease·미확정 효과 checkpoint와 실제 Host 식별자를 기록한다.
지원되는 방식으로 Host를 종료하고 새 프로세스/세션에서 시작 근거를 확보한다.
동일 Thread resume 여부와 새 프로세스 여부를 분리하고, Summary 없이 기존 State를 read-only recover한다.
정확한 별도 승인으로 남은 WorkItem만 진행하여 과거 Decision/Apply가 재실행되지 않는지 확인한다.
최종 통합 Evidence/Judge와 다시 별도 프로세스 Recovery를 대조한다.
Compaction 수용은 별도 실제 압축 전후 관측이 필요하다. 이번 완료 Task를 다시 실행하지 않는다.

## Git 승인 요청의 정확한 범위

현재 권고: 위 Repair 연결 수정과 조합 회귀를 먼저 별도 승인받고, 변경 후보를 다시 검토한다.
이번 사용자 지시는 코드 수정이나 Git 쓰기를 승인하지 않았다.

그 후 승인을 요청할 구체적 대상은 다음과 같다.

1. Commit: work/p0-persistent-worklog, 기준 b382380891fb0d259787f764f354934839815217.
   위 명시적 allowlist와 승인된 후속 수정만 stage하고 staged diff/개인정보/새 후보 검사를 통과한 경우 commit 1회.
   제안 제목: `feat: persist objective coordination and supervised proposal continuation`.
2. Push: 해당 검토 commit만 origin의 work/p0-persistent-worklog에 일반 push. Force push 없음.
3. Draft PR: solzip/codeFleet, base main, head work/p0-persistent-worklog.
   제목은 위 commit과 동일. 본문에는 저장 제안의 별도 Fileset 승인, 미확정 Dispatch 차단,
   회귀/Live Local 근거, 실제 새 Host 세션·Protected 미검증을 적는다.
   원격 main이 이동했다면 현재 승인 후보와 달라지므로 통합 후보 재검토가 먼저다.

Commit/Push/PR 각각 별도 승인 대상이며 merge는 포함하지 않는다.
현 후보를 미해소 finding 그대로 승인 완료로 제시하지 않는다.

## 결론

완료 Objective의 영속 상태와 Evidence를 변경 없이 복구했다.
새 Host 프로세스 경계는 미검증이며, 감독형 채택 후 Repair 연결은 통합 전 수정이 필요하다.
현재 Todo COMPLETE_LOCAL, PUBLIC_DELEGATION_BLOCKED 및 Protected UNSATISFIED를 보존한다.

## 다음 작업

Repair 조합의 제한된 Core 수정·반증 회귀 승인 후 후보 재검토, 이후 allowlist Commit/Push/Draft PR 별도 승인.
진행 중 Objective의 실제 새 Host 세션 연속성 수용은 독립 승인으로 수행한다.

## 미해소로 남긴 것

감독형 채택 후 Repair 차단, 실제 Host 프로세스 경계/Compaction 관측, 공개 Host 위임,
Protected 및 타 OS/제품 전체 E2E 수용. 이번 감사에서는 어떤 완료 Objective도 재실행하지 않았다.
