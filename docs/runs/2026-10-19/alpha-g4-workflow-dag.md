# G4 — Workflow, WorkItem DAG와 순차 실행

- 일시: 2026-10-19 (Asia/Seoul)
- 기준 HEAD: `c61e9b829b62dd41336a7225bf3b9165136484db`
- 브랜치: `feature/alpha-g0-refresh`
- Worktree: `.codefleet/worktrees/alpha-g0`
- 유형: 분석·구현·검증. 기존 G1~G3 미커밋 작업을 보존한 추가 변경.
- 선행: [G3 기록](alpha-g3-intent-contract.md), `docs/implementation/codefleet-implementation-v1/`, `CLAUDE.md`, `docs/concept-foundation.md`, 제품 architecture/progress.

## 선행 확인과 판단

실제 cwd·branch·HEAD·status를 대조했다. Alpha Controller/Judge/Store/Verifier/Delivery, G3 compile/authorize/pin, G2 Registry/Adapter와 Legacy Queue·Task Revision·required-gates를 검토했다. Legacy 원장 재생·승인 해시·관측과 판정 분리 원칙은 유지하며 Legacy 형식을 새 실행 원장으로 복제하지 않았다.

decision-debt preflight는 사용자가 지정한 G3 기록과 계약·단계·검증 문서 4개를 대상으로 했다. 후보 1개, 제외 3개, warnings 0. G3의 과거 문서 조회 실패와 스키마 반증을 실행 불일치로 읽은 후보는 원문과 G3 full log의 실제 성공·미검증 구분을 확인해 해소했다. 처음 큰 문서 묶음을 도구에 전달하려던 시도는 셸 출력 제한으로 JSON 해석에 실패했으며 감사 성공으로 세지 않았다. 이 판단은 전체 설계나 Live Provider 인증이 아니다.

## 변경 전후 실행 구조

기존 Alpha는 하나의 고정 V1 계약에 대해 baseline → no-tool proposal → 격리 candidate → Verifier → Judge → local artifact/Delivery를 수행한다. G3의 plan은 미승인 Draft와 V1 컴파일 가능성을 출력하며 실행하지 않았다.

G4는 **같은 Controller의 scheduling 분기**다. 부모 Workflow Run이 하나의 lease를 잡고, DAG에서 READY WorkItem을 하나씩 예약한다. 각 WorkItem은 기존 V1 자식 Run으로 동일한 `execute`를 통과한다. Provider 호출·편집 적용·검증·판정 엔진을 새로 만들지 않았다. 모든 WorkItem 성공 후 별도 final 자식 Run에서 합친 변경과 원본 계약의 전체 보호 테스트를 다시 검증한다. final은 검증된 서로 겹치지 않는 변경을 호스트가 합성하며 모델을 호출하지 않는다.

성공은 구분된다: 자식 실행 종료, WorkItem 검증 성공, workflowStagesComplete, 최종 통합 검증 후 부모 COMPLETED. WorkItem들이 성공해도 통합 검증이 실패하면 부모는 WAITING_HUMAN이며 최종 accepted artifact를 발급하지 않는다. Provider 보고만으로 어떤 단계도 통과하지 못한다.

## 실제 G4 파일

| 파일 | 책임 |
| --- | --- |
| `src/workflow/definition.mjs` | 선언 계약·해시·범위·예산·DAG 검증, 결정적 READY 선택, G3 fromPlan |
| `src/workflow/persistence.mjs` | 생성 idempotency, 영속 승인, Revision CAS, 원자적 Attempt 예약·결과 기록 |
| `src/alpha/controller.mjs` | 기존 execute의 Workflow 분기, 순차 호출, 증거 기반 복구와 최종 통합 검증 |
| `src/alpha/store.mjs` | 선택적 V1→V2 추가 마이그레이션, V2 읽기 허용, FK 설정 |
| `test/workflow.test.mjs` | Fake Provider·SQLite fault·재시작·동시성·실제 Docker 테스트 |
| `package.json` | 기존 전체 테스트에 Workflow suite 추가 |
| 두 README, `docs/INDEX.md`, `docs/product-completion/progress.md` | 현재 상태 링크와 문서 수 |
| 이 문서·G4 로그·source evidence | 실행 근거 |

G3 Intent/CLI/테스트, G2 Provider, G1 Judge와 V1 Validator·기존 테스트는 변경하지 않았다. Controller와 Store만 필요한 책임을 확장했다. 정확한 현재 소스는 [SHA-256 기록](alpha-g4-source-evidence.json)으로 식별한다.

## Workflow / DAG 계약

Workflow 필드: schemaVersion, workflowId/workflowVersion, sourceContractRef, base, items, requiredCapabilities, acceptanceCriteria, requiredVerification, policySnapshotRef, workflowHash. WorkItem은 id, dependencies, priority, files, tests, acceptanceCriteria를 가진다. dependencies가 directed edges다. 정규화한 후보나 AI 상태 필드가 아니라 호스트 검증된 snapshot 전체에 해시를 부여한다.

누락된 참조·cycle·중복 id·알 수 없는 필드·해시 불일치·verification 생략·지원하지 않는 capability·명시 범위 확대를 거절한다. 필수 capability는 non-interactive/structured-output/proposal-only를 포함해야 한다. WorkItem 수는 원본 V1 maxAttempts 이내이고 각 WorkItem의 모델 시도는 한 번으로 고정한다. 비용 불명이나 합계 예산 초과는 다음 실행을 차단한다. 전체 시간은 부모 예산으로 제한하며 복구 시 자식들이 기록한 경과 시간도 반영한다.

G4 지원 대상은 **같은 기준선에 대한 서로 겹치지 않는 source 편집**이다. DAG edge는 실행 선행조건이며 앞 WorkItem의 변경을 다음 Provider context에 주입하는 데이터 의존성을 뜻하지 않는다. 겹치는 파일 수정, 신규 파일, 권한 확장, 원격 전달은 거절한다. 각각의 후보와 마지막 통합 후보 모두 기존 baseline/test identity/integrity 검증을 거친다. Java 계약 형식은 기존 Validator를 통과할 수 있으나 다중 Java Workflow 실실행은 별도 미검증이다.

## 승인·Revision·Scheduler

새 Workflow는 WAITING_APPROVAL로 저장한다. `approveWorkflow`는 trusted-host 인간 검토 입력(actor, 정확한 workflowHash, 최대 한 시간의 expiresAt)을 받아 revision별로 영속 기록한다. sourceContractRef·policySnapshotRef·전체 scopes·criteria·budgets는 workflowHash에 묶인다. 자연어 입력, G3 Draft, Provider 응답, G3의 직렬화된 승인 토큰은 이를 대신하지 않는다. 이 API는 사용자 신원 인증 시스템이 아니며 호스트 소유 API다.

승인된 Run만 READY 후보를 산출한다. 우선순위 작은 정수 우선, 동률은 WorkItem id의 결정적 순서다. 모든 dependencies가 SUCCEEDED일 때만 READY다. 같은 Store에서 Workflow 자식 동시 실행 상한은 **1**이다. 기존 독립 V1 실행의 동시성 계약은 변경하지 않는다. 부모 lease, control, revision, 승인, 정확한 자식 계약, 의존성을 예약 트랜잭션 안에서도 재검사한다. 외부 CLI는 트랜잭션 밖에서 호출한다. 실제 모델 호출 직전에도 새 capability probe와 승인 검사를 수행한다.

`reviseWorkflow`는 expectedRevision CAS를 확인하고 새 immutable snapshot을 추가한다. 기존 snapshot은 수정하지 않는다. 새 WorkItem이나 미실행 의존성 변경은 원래 범위·예산 안에서만 가능하다. 이미 Attempt가 있는 항목의 계약·의존성·완료 기준 변경, 실행 중/미대조 Attempt가 있는 그래프 변경, 항목 삭제는 거절한다. 후보 Revision은 WAITING_APPROVAL이며 새 해시 승인 전에는 실행 활성화되지 않는다. 기존 승인은 새 revision에 적용되지 않는다. 실패한 기존 Attempt를 바꿔 성공으로 덮는 재계획은 제공하지 않는다.

## 저장과 마이그레이션

기존 `runs`, `events`, artifact 및 owner/leaseUntil/pid/control 계약을 유지한다. WorkflowExecution과 WorkItem 상태는 기존 Run JSON body에 저장한다. 새 graph_revisions는 revision별 immutable DAG JSON과 digest, workflow_approvals는 승인·만료, workflow_attempts는 itemId→단일 childId·revision·terminal status를 저장한다. Edge는 graph JSON dependencies로 보존하며 중복 스케줄러 테이블을 만들지 않았다.

`Store.enableWorkflows()`가 처음 호출될 때만 BEGIN IMMEDIATE 안에서 세 테이블을 추가하고 user_version을 2로 변경한다. 기존 V1만 쓰는 새 DB는 version 1이다. 새 Store는 version 1과 2를 읽고 version 2를 1로 덮어쓰지 않는다. 기존 row/event/artifact는 삭제·변환하지 않는다. WAL/busy timeout을 유지하고 새 참조에 FK를 적용했다. 실제 사용자 DB를 대상으로 마이그레이션하지 않았으며 테스트 DB에서 검증했다.

이전 바이너리는 version 2를 지원하지 않으므로 다운그레이드를 보증하지 않는다. 사용자 운영 DB 적용 전에는 일관된 SQLite 백업을 별도로 확보해야 한다. 마이그레이션을 되돌리기 위해 테이블을 삭제하거나 version을 낮추지 않는다. 이번 작업에서 파괴적 DB 변경은 없다.

Attempt 예약은 자식 Run 생성·유일한 item 예약·CREATED/ATTEMPT_RESERVED 이벤트를 같은 트랜잭션에 기록한다. 결과 상태와 ATTEMPT_RECONCILED 이벤트도 원자적이다. SQL trigger로 이벤트 실패를 주입했을 때 예약과 자식이 함께 rollback되는 것을 검증했다. artifact는 참조 전 저장하며 실패로 남은 미참조 blob을 임의 삭제하지 않는다.

## 중단·복구

- 예약 후 중단된 STARTED Attempt는 자동 재실행하지 않는다. 자식이 아직 READY/실행 중/결과 불명이라면 RECONCILING으로 멈춘다. 예약 전 창에서는 실행 효과가 없으므로 정상 예약이 가능하다.
- 자식 COMPLETED 이후 부모 기록 전 중단이면 baseline·계약·candidate·artifact 해시와 Judge 판정을 대조해 기존 결과만 반영한다. 모델을 다시 호출하지 않는다.
- 승인 만료 후에도 완료된 자식 증거의 읽기 전용 대조는 가능하다. 새 작업은 재승인 전까지 차단한다.
- terminal Attempt는 재사용하거나 덮어쓰지 않는다. 직접 자식 resume는 활성 부모 coordinator 없이 거절한다. 종료 확인이 안 된 예약은 같은 Store의 새 Workflow도 차단한다.
- operator pause/cancel·부모 lease 상실·예산/승인 만료는 활성 자식에 중단 의도를 전달한다. PID만으로 외부 효과 종료를 보증하지 않는다. 미대조 Attempt의 임의 강제해제 API는 제공하지 않는다.

재시작 검증은 Store close/reopen과 launch/completion 경계의 fault injection이다. 운영체제 강제 전원 차단이나 실제 모델 자식 프로세스 트리 복구를 실험한 것은 아니다. 해결되지 않은 실행 효과는 자동 재시도보다 명시적 차단을 유지한다.

## G3 연결과 사용 경계

호스트 API의 `fromPlan(plan, workflowId, items)`는 G3 compile을 호출한다. NEEDS_INPUT/CAPABILITY_GAP은 여기서 거절된다. G3 기본 예산 maxAttempts=1은 늘리지 않으며 한 repair WorkItem과 최종 통합 검증만 허용된다. 여러 repair WorkItem을 원하면 해당 scope와 충분한 예산을 가진 명시적 V1 source 계약을 선택하고 전체 Workflow를 새로 승인해야 한다.

`createWorkflow` → `approveWorkflow` → 기존 `execute(store,id)`가 연결 지점이다. 생성·승인·Revision 변경 CLI/TUI는 G6으로 남긴다. 기존 plan/status/resume/pause/cancel/export 명령과 V1 실행을 삭제하지 않았다. resume도 capability/approval 필터를 통과해야 한다. G3 filename 기반 초안이 의미 분석이나 승인으로 승격되지 않는다.

G2 production probes는 아직 필수 capability를 SUPPORTED로 표시하지 않는다. 따라서 이번 새 Workflow 경로에서 실제 Codex·Claude 모델 실행은 차단되며 Fake Adapter로 실행 계약을 검증했다. 기존 Claude V1 호환 경로는 보존한다. Codex no-tool 보장·Live Planner는 계속 미검증이다. 프롬프트나 새 권한으로 우회하지 않았다.

## 검증 명령과 결과

| 명령 | 종료 코드 | 범위 |
| --- | --- | --- |
| `node --test test/workflow.test.mjs` (초기) | 0 | 11 통과, Docker opt-in 1 제외; 제외를 성공으로 세지 않음 |
| `CODEFLEET_TEST_DOCKER=1 node --test test/workflow.test.mjs` (최종) | 0 | 21/21, 제외 0 |
| `npm.cmd test` (최종, 아래 opt-in 환경) | 0 | Legacy 324 + Alpha 39 + Provider 15 + Intent 14 + Workflow 21 = 413, 제외 0 |
| `node src/alpha/cli.mjs doctor` | 0 | 5/5, Node v24.14.1, Claude 2.1.303 |
| `git diff --check` | 0 | 변경 공백 검사 |

전체 테스트 환경: CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45. PowerShell에서는 환경 변수를 설정한 다음 명령을 실행했다. 이미 준비된 Node/Maven 이미지를 사용했다. 기존 Node/Maven 격리 회귀와 JDK parser 4건을 포함한다.

G4 Docker 테스트는 서로 다른 source 파일의 WorkItem 두 개, 각 보호 테스트, 최종 합친 변경의 보호 테스트 두 개를 실제 격리 Verifier로 실행했다. Provider만 Fake이며 개별/최종 검증은 실제 Node 실행이다. 그 외 fault·상태 테스트의 Harness 결과는 결정적 fixture다. 임시 Git fixture의 기준 커밋 외에 대상 저장소에 커밋하지 않았다.

실행 근거: [Workflow](codefleet-g4-workflow.log), [전체 게이트](codefleet-g4-full.log), [Doctor](codefleet-g4-doctor.log). 기존 인용 경고 11개는 과거 기록 8개·G1 미커밋 위치 3개이며 검사기를 완화하지 않았다. 테스트 삭제·기대값 약화·coverage baseline 변경은 없다.

| 수용 항목 | 검증 |
| --- | --- |
| CF-GATE-01/04/05 | Provider-only evidence 거절, 범위·완료 기준·G3 미해결 차단 |
| CF-GATE-06/07/08 | 생성 idempotency, cycle/누락/중복/Revision CAS, Attempt 불변 |
| CF-GATE-10/11 | 통합 검증 실패 시 완료 거절, graph artifact 변조 거절, 기존 candidate integrity 회귀 |
| CF-GATE-12/13 | V1 데이터·이벤트·artifact 보존, 기존 V1 Run의 migration 후 실행, 중단 경계 재대조 |
| CF-GATE-16/18/19/20 | Codex 차단, Alpha·Legacy 회귀, 비용 불명 후속 차단 |

## 완료 여부와 G5 조건

G4의 제한된 순차 Workflow/DAG, 영속 승인·Revision, 기존 Controller 기반 개별·최종 검증, 추가 마이그레이션과 안전한 복구 대조를 구현·검증했다. 필수 테스트 실패는 남아 있지 않다. Live Provider 운영 가능이나 무제한 동적 재계획을 완료했다고 주장하지 않는다.

미지원/미검증: 순차 결과를 다음 모델에 자동 반영하는 변경 의존성, 겹치는 파일 편집, 유실 Attempt의 강제 자동 복구, 실제 모델·외부 PR·타 OS·다중 Java Workflow·Gradle 실실행·설치 패키지 E2E. 순수 DAG edge를 이 기능들의 지원으로 해석하지 않는다.

G5는 사용자 후속 지시 후 시작한다. 병렬성 확대 전에는 workspace/OS capability, lease fencing과 중단 확인, 충돌·의미적 통합, global admission limit 변경의 반증이 필요하다. Codex Live 보안 capability gap은 별도 해결해야 한다. 이번에 병렬 Agent, 메시징, Skills/Hooks, TUI, 배포·PR 병합을 구현하지 않았다. 커밋·푸시·배포 없음.
