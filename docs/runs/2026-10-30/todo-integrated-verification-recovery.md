# Todo integrated verification and process recovery

- 작업 일시: 2026-10-30 16:17–16:20 KST
- 대상 커밋: `b382380891fb0d259787f764f354934839815217`, `work/p0-persistent-worklog`의 기존 미커밋 Core
- 작업 유형: 실행·결정
- 선행 문서: [Core 연결](supervised-proposal-continuation.md), [Fileset 등록](todo-fileset-review-prepared.md), [Recovery 계약](../../implementation/objective-recovery.md)
- 번호 실측 최대값: docs 전체 검색 P0-17 / P1-61. 신규 ID 없음.

## 수용 범위

사용자가 승인한 정확한 Native Local Review를 기존 `objective local-accept`로
한 번 실행했다. SQLite·Work Log·Artifact를 먼저 읽기 전용 복구하고, 실행 후
다른 OS 프로세스에서 같은 체크포인트와 Evidence를 복구했다. 실제 Codex Host
세션 종료/신규 시작의 독립 관측은 없다. 사용자 요청에 새 세션이라고 적혀
있다는 사실과 Node 프로세스 재시작을 Host 세션 수용 Evidence로 바꾸지 않는다.

제품 Core와 Live 소스·테스트는 수정하지 않았다. 모델/Subagent, Fileset 재적용,
재시도, 예산 확대 및 Git 발행은 하지 않았다. 기존 미커밋 작업을 보존했다.

## 복구 및 실행

기본 Codex 샌드박스에서 Worktree와 Live 저장소 Git 조회 exit 0. Live Git은
전역 ignore 파일 Permission denied 경고를 냈으나 접근은 성공했고 권한 설정을
변경하지 않았다. Windows / PowerShell / Node v24.14.1에서 실행했다.

첫 `objective recover`는 read-only Store로 RECOVERED, exit 0이었다.
Task Revision 10 / Contract Revision 2 / seq 71 및 승인된 Candidate가 일치했다.
`todo-title-max80-01`은 APPLIED, normalize는 기존 LOCAL_CHECKPOINT Evidence,
todo는 MATERIALIZED, verify-integrated는 PENDING_VERIFICATION으로 복구됐다.
소비 Decision/Attempt 1건, 잔여 2 Attempts / 90000 ms, 활성 Lease와 미확정 효과
없음을 확인했다. 준비된 Review의 해시·만료·철회/수락 이벤트·미소비 requestId,
현재 Task/실행 파일/명령/Candidate 바인딩을 확인한 후 실행했다.

| 항목 | 값 |
| --- | --- |
| Task | `task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481` |
| Review Ref | `4d1680b1522eaea5a89bdd9a3891ef77aed91a15eecc08efc7605c16e78cb947` |
| Review Hash | `ddfb1fb5bc4546640f591081ef76ccab1966f29cef3ca912c914225e7d2e4fb8` |
| Command Hash | `e5b29e0557d6db5ba6d092bc1ec5e946a638eecd87cf229fb425fef7d9521264` |
| Candidate (전후 동일) | `cff4a24fd0aee1a4c7ab0703096dfa8d5fdaccf1b63e98b4d63ec411e25e4d11` |
| 제한 | Native Local / UNPROTECTED, 1 Attempt, 30000 ms |
| 실제 실행 결과 | LOCAL_PASSED, 8 PASS / 0 FAIL / 0 SKIP / 0 TODO, exit 0 |
| 최종 Task / Contract / Work Log | 11 / 2 / seq 77 |

원본 Review의 Node 실행 파일과 Live 작업 디렉터리를 그대로 사용했다.
아래는 그 명령의 인자이며 추가 테스트/명령을 넣지 않았다.

```text
--test --test-reporter=tap test/normalize-title.test.mjs test/create-todo.test.mjs test/create-todo-length.test.mjs
```

`local-accept REVIEW_REF --trust REVIEW_HASH --acknowledge-unisolated`의 반환과
호출 프로세스 종료 코드는 모두 0이다. 테스트의 실제 exitCode도 0이다.

## Criterion Coverage와 판정

| Criterion | 실행 매핑 | 결과 |
| --- | --- | --- |
| normalize | test/normalize-title.test.mjs | PASS / MATCHED |
| todo | test/create-todo.test.mjs | PASS / MATCHED |
| todo-length | test/create-todo-length.test.mjs | PASS / MATCHED |

세 Criterion 모두 linked/executed true,
SATISFIED_BY_APPROVED_TEST_MAPPING, scope TEST_FILE_MAPPING_ONLY다.
이는 승인된 테스트 파일 매핑에 대한 관측이며 prose 요구사항의 일반적인 의미적
충족이나 branch/line coverage를 증명하지 않는다. Local acceptance는
CURRENT_CANDIDATE_ALL_MAPPED_TEST_FILES_LOCAL_PASSED에 따라 COMPLETE_LOCAL,
complete true, remaining []다. PROTECTED_ACCEPTANCE Judge는 ESCALATE이고
Protected UNSATISFIED를 유지한다.

## 영속 증거와 별도 프로세스 복구

- Decision: `711d7906-e827-4f3e-aab4-7b0201193ac1`
- Request: `2480cb59-99dd-478f-aec3-7ec7db8f062e`
- Attempt: `bootstrap-attempt-5452d99f-70b8-4670-9c4f-d491b7a34368`
- Evidence: `fc1b9d5f5d5631f3aa5d9eeb17ec00a43f0bd8b1ad75b2e396367962ad5a3f18`
- 실행/수용/Recovery 묶음 Artifact: `ff42b44b15231ddf53c6902afa57d754af9d44e469d2bf3924eb7e9708cdbb06`

seq 72 REVIEW_ACCEPTED → 73 DECISION_ISSUED → 74 EXECUTION_RESERVED →
75 EXECUTION_STARTED → 76 EVIDENCE_OBSERVED → 77 LOCAL_VERIFICATION_RECORDED.
Decision은 CONSUMED, remainingExecutions 0이다. 해당 requestId의 Reservation은
정확히 1건이며 실제 실행 호출도 1회였다. 소비된 Review를 재호출하는 실험은 하지 않았다.

실행 프로세스 PID 53064 종료 뒤 별도 PID 7476에서 read-only Store를 열어
저장된 afterRecovery checkpoint를 대조했다. exit 0, RECOVERED, synchronization
MATCHED, COMPLETE_LOCAL, Task 11 / Contract 2 / seq 77이 복원됐다.
Decision·Reservation·Evidence·예산이 이전 관측과 같고 복구 전후 Task/Event/Decision/
Reservation 해시가 동일했다. 중복 실행이나 상태 변경 없이 저장 결과를 읽었다.

기존 Artifact 52개의 바이트 해시와 기존 Decision/Reservation row를 보존했다.
예산은 총 2 Attempts 소비, 60000 ms 예약, 잔여 1 Attempt / 60000 ms다.
예산 수치는 실제 테스트 경과시간이 아니라 기존 Reservation의 예약 시간 기준이다.
활성 Lease·미확정 효과는 없고 미완료 WorkItem도 없다.

## 결론

승인된 통합 검증 1회와 별도 프로세스 복구가 성공해 COMPLETE_LOCAL을 확인했다.
독립 새 Codex Host 세션 재개 수용은 NOT_INDEPENDENTLY_OBSERVED다.
PUBLIC_DELEGATION_BLOCKED와 Protected UNSATISFIED를 유지한다.

## 다음 작업

실제 새 Host 세션의 전후 식별/종료/재개 근거를 지원되는 관측 경로에서 별도로
확보해야 한다. 이미 완료한 테스트·Fileset을 그 목적으로 재실행하지 않는다.
Git 통합은 현재 미커밋 Core와 문서 범위 검토, 통합 기준선 결정 및 별도
Commit/Push/PR 승인 이후 진행한다. 이번에는 Git 통합하지 않았다.

## 미해소로 남긴 것

Todo Handoff는 PREPARED, 관측 이력 없음. 제안은 PROVIDER_REPORTED_ONLY다.
HOST_ADAPTER_UNAVAILABLE와 실제 Host 세션/Compaction 관측, Protected 수용,
macOS/Linux 및 제품 전체 수용은 이번 근거로 입증되지 않는다.
