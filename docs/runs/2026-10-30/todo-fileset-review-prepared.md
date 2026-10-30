# Stored Todo Fileset registration and Native Review

- 작업 일시: 2026-10-30 16:02 KST
- 대상 커밋: `b382380891fb0d259787f764f354934839815217`, `work/p0-persistent-worklog`의 기존 미커밋 Core
- 작업 유형: 실행·결정
- 선행 문서: [감독형 연결 및 회귀](supervised-proposal-continuation.md), [Recovery 계약](../../implementation/objective-recovery.md)
- 번호 실측 최대값: 선행 작업의 docs 전체 검색 P0-17 / P1-61, 신규 ID 부여 없음

## 승인 및 실행 전 확인

사용자는 기존 저장 제안 한 건의 Fileset 등록과 Native Review 준비를 최대 한 번씩
승인했다. Apply, 소스/테스트 수정, Verification, 모델/Subagent, 재시도 및 Git
발행은 승인하지 않았다. 기존 Core의 `dispatchProduct`로
`supervised-proposal-register`, `local-files-review`를 각각 한 번 호출했다.
새로운 승인/적용 엔진은 만들지 않았다.

기본 Codex 샌드박스에서 Worktree Git status/branch/HEAD 조회가 exit 0이었다.
Live 저장소의 Git status와 root 조회도 exit 0이었다. 전역 ignore 파일 읽기
Permission denied 경고는 있었으나 ACL·소유권·safe.directory를 변경하지 않았다.
Git 명령은 권한 상승 없이 실행했다.

등록 전 Task Revision 8 / Contract Revision 2, seq 60과 승인된 Candidate를
확인했다. 기존 Todo Fileset은 없었고 미확정 Dispatch·효과·활성 Lease도 없었다.
저장된 제안/입력 패킷과 파일 콘텐츠·SHA·263 bytes·WorkItem 소유 범위를 대조했다.
현재 normalizeTitle named export와 import가 일치하고 반환된 정규화 문자열에
`title.length > 80` 검사를 수행하는 제안이다. JavaScript UTF-16 length 의미를
유지한다. `todo-title-max80-01`은 APPLIED이고 `todo-length` Criterion과
`test/create-todo-length.test.mjs`의 승인된 매핑을 확인했다. 현재 normalize 소스와
Todo/길이 테스트의 내용 해시가 저장된 입력과 일치했다. 동작 테스트는 실행하지 않았다.

## 결과와 바인딩

| 항목 | 실제 값 |
| --- | --- |
| Task | `task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481` |
| 최종 Task / Contract Revision | 9 / 2 |
| WorkItem | `todo` |
| Fileset Run | `task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481-todo-r8` |
| Fileset 상태 | WAITING_APPROVAL |
| Fileset Hash | `33f097409bd22673a5433f9c8bfe42cd064cf16f76efaa7346cb2d6686b2b773` |
| Native Review Ref | `dc4d1b75b7b54cfaa69345aa46fa80b92f2668149044684804d9847b657256e0` |
| Native Review Hash | `65c955faf00046af3ff4a5a66d9a87fddc6a7f572b9d209f841fb4fbc6486685` |
| 생성 | 2026-10-30T07:02:05.240Z / 16:02:05.240 KST |
| 만료 | 2026-10-30T08:02:05.240Z / 17:02:05.240 KST |
| Proposal Ref | `42e2de6dd5f7bc7f4d30d00aadb94f3910a137c26b547f1585e2a73afbb9644c` |
| 대상 | `src/create-todo.mjs`, create, 263 bytes |
| 파일 SHA-256 | `8fa8c737adea9cca69bedcc2fb4851f9e3aa285dbda13936383c9b9de43672e8` |
| Candidate | `905f8a1dcb27bf9517d2ddb9bc905be21294cd4ecf35267d6647bb5f381c9dc4` |
| Review Task Hash | `832916a02e7a06eb48f703757e0f81fed5b2c678580540dd1d5133a93004c9a8` |
| Workflow Hash | `8b7a5d6bf111809c88d15f36c777457cd73de6211415a0d547e8f4ddc4afc225` |
| Content Ref | `f4e69ac1f8c1f6b5a10cf46e1a46b7767a0aaf1c1a3d98104c168c381fed53d1` |

## Work Log와 보존 확인

| seq | Event | 소속 |
| --- | --- | --- |
| 61 | BOOTSTRAP_FILESET_PROPOSED | 새 Todo Fileset Run |
| 62 | BOOTSTRAP_FILESET_RECORDED | Task, Revision 9 |
| 63 | NATIVE_FILESET_REVIEW_PREPARED | Task, executionGranted false |

기존 Artifact 47개의 실제 바이트 해시, 기존 Run 2개의 DB row, 기존 Task Event
54개의 prefix, Decision/Reservation/Workflow Attempt/Workflow Approval 테이블을
실행 전후 비교하여 모두 보존됨을 확인했다. Decision 1건과 Reservation 1건은
그대로이며, Recovery의 기존 Evidence/판정과 예산도 동일했다. Task Event 수와
DB 전역 seq는 다른 값이다.

기존 소비 Attempt 1회, 잔여 2 Attempts / 90000 ms를 유지한다. Handoff는 PREPARED,
제안과 Fileset 출처는 PROVIDER_REPORTED_ONLY다. 기존 HOST_ADAPTER_UNAVAILABLE
이벤트를 보존했으며 DELIVERED/ACKNOWLEDGED를 추가하지 않았다.
PUBLIC_DELEGATION_BLOCKED와 Protected UNSATISFIED를 유지한다.

Candidate 해시는 전후 동일하며 대상 소스 파일은 여전히 존재하지 않는다.
등록/Review 준비 각 1회, Apply/테스트/Verification/모델 호출/자동 재시도는 0회다.

## 실행 근거와 한계

`node .codefleet/register-supervised-todo-once.mjs` → exit 0.
이 일회성 호출 스크립트는 저장된 제안을 읽고 기존 Core 명령을 호출하며
새 소스나 제안을 생성하지 않는다. 두 Core 명령의 반환 exitCode 2는 정상적인
승인 대기 상태이며 오류나 테스트 실패가 아니다. 원본 결과는 로컬의
`.codefleet/supervised-todo-registration-result.json`에 새 파일로 보존했다.
Native Review 원본과 Fileset 콘텐츠는 위 SQLite Artifact Ref로 보존된다.

소스와 테스트 및 제품 Core 파일은 수정하지 않았다. 이번 단계에서는 사용자
금지 범위에 따라 테스트와 Verification 및 문서 테스트 명령도 실행하지 않았다.
이 기록은 등록/준비 효과의 확인이며 Todo 동작 PASS나 최종 E2E 근거가 아니다.

## 다음 정확한 승인 요청

위 Task Revision 9 / Contract Revision 2 및 Candidate에 결합된 Native Review를
만료 전에 최대 한 번 수락하여, `src/create-todo.mjs` 한 파일만 정확한 263 bytes와
SHA-256으로 생성하는 Fileset Apply 승인이 필요하다. 이 승인에는 같은 사용자
환경의 비격리 Local 파일 적용에 대한 명시적 동의가 포함돼야 한다.

```text
objective local-files-accept dc4d1b75b7b54cfaa69345aa46fa80b92f2668149044684804d9847b657256e0 --trust 65c955faf00046af3ff4a5a66d9a87fddc6a7f572b9d209f841fb4fbc6486685 --acknowledge-unisolated
```

기존 Live state를 대상으로 실행해야 한다. 이 명령은 이번 단계에서 실행하지 않았다.
적용 전 현재 binding·만료·승인 상태를 재확인하고, 변경/만료/실패 시 재시도 없이
중단한다. 만료된 Review를 갱신하거나 다시 준비하는 권한은 이번 승인에 없다.
다음 승인에도 테스트·Verification·모델 호출·다른 파일 수정·Git 발행은 포함하지 않는다.

## 결론

저장된 Todo 제안의 Fileset 등록과 Native Review 준비를 각 한 번 완료했다.
기존 Handoff/출처/증거/예산과 Candidate를 보존했고 파일은 적용하지 않았다.

## 다음 작업

정확한 Native Review에 대한 별도 Fileset Apply 승인 대기.

## 미해소로 남긴 것

Todo 실제 적용·동작 검증·최종 E2E와 독립 Host Handoff 관측은 미실행이다.
