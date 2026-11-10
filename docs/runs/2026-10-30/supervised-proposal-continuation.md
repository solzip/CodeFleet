# Supervised proposal continuation

- 작업 일시: 2026-10-30 (KST)
- 대상 커밋: `b382380891fb0d259787f764f354934839815217`, `work/p0-persistent-worklog`의 기존 미커밋 Core 위에 수정
- 작업 유형: 수정·실행·결정
- 선행 문서: [제품 원칙](../../PRODUCT_VISION.md), [아키텍처](../../product-completion/architecture.md), [진행 현황](../../product-completion/progress.md), [로드맵](../../product-completion/roadmap.md), [Recovery 계약](../../implementation/objective-recovery.md), [기존 작업](persistent-worklog.md)
- 번호 실측 최대값: docs 전체 `P[01]-[0-9]+` 검색에서 P0-17 / P1-61. 신규 등재 번호 없음.

## 범위와 판단

사용자 가치는 현재 Host 세션의 저장된 직접 제안을 다시 생성하지 않고 감독형
Fileset 검토로 이어가는 것이다. Host 재사용, 검증과 자기 보고의 분리, 승인된
효과만 실행, 영속 상태와 예산 보존 원칙을 적용한다. Core 수정·합성 회귀와
Live 읽기만 승인되었다. Live 등록·적용·Candidate 명령·모델 호출·Git 발행은 하지 않는다.

Decision Debt 사전 스캔은 사용자가 지정한 현재 운영 문서 네 개에서 네 카드를
반환했다(도구 제외 카드 없음). 원문 대조 결과 제품 원칙·아키텍처의 미검증 경계는
정체로 폐기할 계획이 아니라 유지할 제약이다. 로드맵 인용은 완료 주장이 아니라
향후 수락 조건이다. 진행 현황의 과거 중단 기록은 이번 사용자 지시의 실행 권한을
대신하지 않는다. 따라서 네 카드를 이번 수정의 중단 근거에서 제외하고, 원문과
검증 경계를 보존했다. 외부 비교 자료는 판단 근거로 사용하지 않았다.

## 구현 경계

- `src/product/continuation.mjs`: 저장된 제안·입력 패킷·현재 계약/Task Revision·Candidate·파일·해시·크기·base·의존성 및 Recovery 효과를 읽기 전용으로 검사한다.
- `src/product/tasks.mjs`: 검토 결과와 정확히 같은 입력만 기존 Fileset Validator/등록 경로에 넣고, 해당 Run에 PROVIDER_REPORTED_ONLY 출처를 보존한다. 등록 직전 Task/Event/Candidate를 다시 검사한다.
- `src/product/work-log.mjs`: PREPARED이며 관측 이력이 없는 해당 패킷의 감독형 Fileset 채택만 인식한다. Handoff 자체를 ACKNOWLEDGED로 변경하지 않는다. 채택 후 동시 Dispatch를 거부한다.
- `src/product/native-local.mjs`, `src/product/recovery.mjs`: 기존 정확한 적용 승인과 Recovery를 재사용하며 채택 출처와 Host 관측 미확립을 별도로 표시한다.
- `src/product/cli.mjs`: `supervised-proposal-review`는 read-only Store, `supervised-proposal-register`는 별도 명시적 등록 명령이다. 두 경로 모두 모델·적용·검증 권한을 발급하지 않는다.

DELIVERY_UNCONFIRMED와 미확정 batch dispatch는 RECONCILE을 유지한다. 다른
WorkItem의 미채택 Handoff와 지침 차단은 유지된다. 정상 감독형 채택은 새로운
승인 엔진·저장소·Scheduler·Host API 클라이언트를 추가하지 않는다.

## 검증

환경: Windows / PowerShell / Node v24.14.1. 합성 격리 fixture에서 실행한
Core 회귀이며 실제 Host 전달 관측이나 Live Candidate 검증이 아니다.

| 명령 | 결과 |
| --- | --- |
| `node --test test/work-log.test.mjs` 첫 실행 | exit 1, 10 pass / 1 fail. 독립 WorkItem 우선순위를 고려하지 않은 테스트의 Recovery 예상값 불일치 |
| `node --test --test-name-pattern=supervised test/work-log.test.mjs` 수정 후 | exit 0, 3 pass / 0 fail. 기존 선택 규칙을 바꾸지 않고 fixture와 예상 next action을 수정 |
| `npm.cmd run pretest` | exit 0 |
| `npm.cmd run test:legacy` | exit 0, 324 pass / 0 fail / 0 skip |
| `npm.cmd run test:host-core` | exit 0, 124 pass / 0 fail / 0 skip |
| `node --test test/continuation.test.mjs test/repair-loop.test.mjs test/native-local.test.mjs` | exit 0, 85 pass / 0 fail / 0 skip |
| `npm.cmd run posttest` 기본 환경 | exit 1, Git 소유권 검사로 link checker의 Git 조회 exit 128 |
| `npm.cmd run posttest` 승인된 소유자 환경 첫 실행 | exit 1, 신규 기록 때문에 README 두 파일의 audit-run-records 선언 136 / 실측 137 불일치. Coverage/link/citation 검사는 통과 |
| `npm.cmd run posttest` 실측 선언 수정 후 | exit 0, 42 fact declarations / 0 mismatch; coverage 및 anchor baseline 변경 없음 |
| `node --test --test-name-pattern=supervised test/work-log.test.mjs` 최종 CLI/출처 표시 확인 | exit 0, 4 pass / 0 fail / 0 skip |
| `git diff --check` | exit 0 |

반증 범위: 이전 계약/Task Revision, 잘못된 Task/Packet/Context, 해시·크기·경로·base,
Candidate 변동, 권한 출처 위조, 의존성 누락, 활성 lease, 미확정 dispatch, 무승인
적용, 만료·철회 Fileset 승인, 소비된 적용 재실행. 별도 프로세스 Recovery에서
PREPARED 유지와 기존 Decision·Attempt·예산 보존을 확인한다. 기존 Repair E2E와
전체 Host Core도 통과했다. Full Alpha/Docker Protected suite는 NOT_RUN이며
이 결과는 scoped basic regression이다. 초기 실패와 원인을 이 기록에 보존했다.
Citation 검사에는 living-doc 오류가 없으며 dated-record suspect 15건이 남는다.
그중 이 기록의 신규 work-log 모듈/테스트 두 참조는 명시된 미커밋 파일이 기준
HEAD에 없어서 발생한다. 현재 Worktree의 실제 파일/라인을 확인했으며, 해당
코드가 기준 HEAD에 이미 커밋됐다는 뜻이 아니다. 과거 경고를 소급 수정하지 않았다.

현재 미커밋 구현 근거: `src/product/continuation.mjs:125`,
`src/product/tasks.mjs:409`, `src/product/work-log.mjs:55`,
`src/product/native-local.mjs:161`, `src/product/recovery.mjs:148`.
새 회귀는 `test/work-log.test.mjs:42`에서 시작하며 기존 테스트를 삭제하지 않았다.

## Live 정합성과 다음 승인 요청

Core 회귀 완료 후 read-only Store로 대조했다. 실행 명령
`node .codefleet/supervised-proposal-inspect.mjs`는 exit 0이다. 이 로컬 점검은
Candidate 코드 import/테스트, 파일 적용 또는 Store 쓰기를 하지 않는다.

| Binding | 확인값 |
| --- | --- |
| Task | `task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481` |
| Task / Contract Revision | 8 / 2 |
| WorkItem / Work Log | `todo` / seq 60 |
| Candidate | `905f8a1dcb27bf9517d2ddb9bc905be21294cd4ecf35267d6647bb5f381c9dc4` |
| Proposal Ref | `42e2de6dd5f7bc7f4d30d00aadb94f3910a137c26b547f1585e2a73afbb9644c` |
| Packet Ref | `0f15e8ffeb19e757effe2c5d294e1c02771feb3aed426d6721c335b8dd0da4e1` |
| File | `src/create-todo.mjs`, create, 263 bytes |
| SHA-256 | `8fa8c737adea9cca69bedcc2fb4851f9e3aa285dbda13936383c9b9de43672e8` |
| Budget | 기존 1 Attempt 소비, 2 Attempts / 90000 ms 잔여 |
| 판단 | REVIEW_ELIGIBLE_NOT_REGISTERED / PROVIDER_REPORTED_ONLY |

전후 Recovery·Task·Event 해시가 동일했다. Handoff PREPARED와 seq 60의
HOST_LIVE_HANDOFF_BLOCKED / HOST_ADAPTER_UNAVAILABLE를 보존했다. 제안은
기존 normalizeTitle의 named export와 일치하며 정규화 뒤 JavaScript UTF-16
length를 검사한다. 현재 소스와 기존 Todo 테스트·길이 테스트 세 파일의
내용 해시가 저장된 입력과 모두 일치했다. `todo-title-max80-01`은 APPLIED이고
`todo-length`는 `test/create-todo-length.test.mjs`에 매핑된다. 준비된 테스트는
정규화 길이 1/79/80 허용, 공백을 붙인 80 허용, 81/82 거부를 검사한다.
이 검토는 실제 실행 PASS가 아니다.

다음 요청은 위 binding의 저장 제안 **1회 Fileset 등록과 Native Review 준비만**이다.
해당 Live state 디렉터리에 대해 다음 기존 Core 진입점을 순서대로 사용한다.

```text
objective supervised-proposal-register task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481 42e2de6dd5f7bc7f4d30d00aadb94f3910a137c26b547f1585e2a73afbb9644c
objective local-files-review task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481 todo
```

등록은 Task Revision을 진행시키고 WAITING_APPROVAL Fileset과 provenance를
기록한다. 이어 준비되는 Native Review의 실제 reviewRef/reviewHash를 제시한 뒤
멈춘다. 현재는 등록 전이므로 그 값을 만들어 주장하지 않는다. 바인딩이 바뀌면
등록하지 않고 다시 검토한다. 실제 적용은 별도 exact `local-files-accept` 승인,
검증은 별도 command review/승인이 필요하다. 이 요청은 모델 Turn·Subagent·
Apply·Candidate 테스트·재시도·Git 발행을 포함하지 않는다.

## 결론

감독형 직접 제안 검토와 관측된 Host Handoff를 분리하는 Core 연결을 구현했다.
Core 회귀와 기존 Live 제안의 읽기 전용 적격성 대조를 통과했다.
실제 Host Handoff 관측과 Live 적용·최종 E2E의 성공을 주장하지 않는다.

## 다음 작업

위 Fileset 등록·Native Review 준비 범위의 사용자 승인을 받은 뒤 해당 단계만 수행한다.

## 미해소로 남긴 것

실제 Host Adapter 관측, Live Fileset 등록·적용·검증 및 최종 E2E는 미실행이다.
Local은 Protected Evidence가 아니며 macOS/Linux와 Host Compaction은 미검증이다.
