# CodeFleet 공식 아키텍처

현재 제품 정의는 [제품 원칙](../PRODUCT_VISION.md)을 따른다. CodeFleet은 기존 Codex CLI·Claude Code의 모델·인증·세션을 활용하는 Host-Native AI 개발 오케스트레이션 확장 도구다. 이 절이 현재 구조의 기준이며, 아래 초기 Alpha 설계는 당시 범위와 결정 근거로 보존한다. 구현·검증 상태는 [진행 현황](progress.md)에서 관리한다.

## 현재 Host-Native 구조

```text
사용자 → 기존 Host 세션 / Skill
       → 자연어 목표 → Task Draft → Validator → Workflow/DAG
       → Policy / Capability / 승인 요청 → 허용된 실행
       → 선택한 Verification Backend → Evidence → 독립 Judge → 결과 / 복구
```

Host는 모델·인증·세션·자체 도구 권한을 소유한다. CodeFleet은 Task와 계약, DAG, 역할, 승인 요청, 상태·복구, 검증 증거와 완료 판정을 관리한다. Host Adapter와 선택적 직접 API Provider는 별도 경로다. Host 경로에서 모델을 별도로 호출하거나 인증·세션을 복사하지 않는다.

| 책임 | 현재 구현 경계 |
| --- | --- |
| 목표·Draft·Validator | `src/intent/`, `src/product/tasks.mjs`: 구조화 제안을 검사하고 계약을 준비한다. Draft 유효성은 실행 승인이 아니다. |
| Host 연결 | `src/hosts/`: Skill 설치·준비·교환 계약. 공개 `requests/submit/run/resume`는 생산 격리 미검증으로 차단한다. |
| Manager/Coordinator | `src/alpha/controller.mjs`의 기존 Workflow 조정: WorkItem 진행·의존성·자식 실행·결과 통합과 승인/lease 재확인. Manager는 이 책임의 이름이며 별도 Agent 엔진이 아니다. 실제 Host 자동 위임은 미검증이다. |
| 역할별 Agent·WorkItem | `src/workflow/definition.mjs`, `src/workflow/collaboration.mjs`: Planner·Architect·Executor·Reviewer 배정, 명시적 파일·테스트·의존성, 범위가 결합된 위임과 메시지. 역할 metadata·메시지는 독립 실행 증거가 아니다. |
| Scheduler·Collaboration | 기존 Workflow의 준비 작업 선택·자원 충돌 제한, Controller의 격리된 병렬 후보와 직렬 통합을 재사용한다. 겹치는 파일 소유권은 거부하며 통합 후보의 필수 검증을 유지한다. 일반적인 Host Subagent 자동 병렬 실행을 보장하지 않는다. |
| Persistent Work Log·Recovery | `src/alpha/store.mjs`, `src/workflow/persistence.mjs`: SQLite 상태·이벤트·시도·산출물 참조·승인, worker lease와 재개 검사를 재사용한다. Work Log는 기존 영속 기록의 책임이며 별도 저장소가 아니다. 현재 시험 근거를 모든 Host의 장기 실행 보장으로 확대하지 않는다. |
| Harness | 기존 Controller·계약·정책·승인 경계가 Policy·실제 Capability·승인 revision·예산·검증 상태를 통제한다. Agent/Coordinator의 제안으로 권한을 확대하거나 공개 실행 차단을 해제하지 않는다. |
| Verification Backend | `src/verification/backends.mjs`: Local, Container, 미검증 Host Sandbox의 능력과 보장 범위를 구분한다. Backend 선택은 필수 검증 기준을 낮추지 않는다. |
| Evidence/Judge | 기존 Alpha Evidence·Judge: 관측 주체·계약·후보에 결합된 독립 증거로 판정한다. 제안 생성과 완료 판정의 책임을 분리하며 AI 자기 보고는 검증 성공이 아니다. |
| Bounded Improvement Loop | 기존 Alpha의 시도/시간 예산·재검증과 Bootstrap의 승인된 hash-bound repair 경로를 재사용한다. Bootstrap 로컬 수정·재검증은 구현돼 있지만, 자동 Host 수정 루프의 Live 수용 완료를 뜻하지 않는다. |

기본 계획·Draft·DAG 조회·승인 요청에는 Docker가 필요 없다. Docker는 선택적 보호 검증 Backend이며 이를 요구하는 계약의 검증에는 필요하다. Local Verification은 명시적으로 신뢰한 로컬 실행으로, 보호 격리나 Protected Verification과 동등하지 않다. Host Sandbox는 현재 `NOT_VERIFIED`다. Backend 부재를 Local 자동 대체나 완료 조건 완화로 처리하지 않는다. WSL·별도 OS 계정·직접 모델 API Key도 기본 준비 요구 사항이 아니다.

실제 Host Live·자동 위임·생산 보호 실행 배포는 오프라인 시험과 구분한다. Git HEAD 없는 신규 프로젝트 Bootstrap은 이 기준선에 구현돼 있다(probe·BootstrapDraft·Validator·bootstrap DAG·승인 fileset 생성·로컬 검증). Host Live와 보호 검증은 미완료이며 수용 기준은 [로드맵](roadmap.md)에 둔다.

상세 계약은 [Host 연동](../implementation/host-native.md), [승인 경계](../implementation/operator-authorization.md), [IPC](../implementation/host-ipc.md)를 참조한다. [Core 안내](host-core-guide.md)는 현재 Backend 보장 범위, [Host 안내](host-native-guide.md)는 설치·사용을 담당한다. 상세 계약 원본이나 과거 검토를 이 문서의 최신 상태표로 해석하지 않는다.

## 개발 루프의 책임과 목표 경계

WorkItem 초안은 Validator와 DAG 검사를 거쳐 승인된 범위에서 실행한다. Manager/Coordinator가 배정과 통합을 맡고, Harness가 실행 가능성·승인·예산·상태를 집행하며, Verification Backend가 검사를 수행하고 Evidence/Judge가 결과를 판정한다. Agent의 자체 리뷰가 이 경계를 대체하지 않는다.

실패 후 다음 시도는 실패 근거와 수정 가설, 현재 계약 revision, 새 후보와 검증 증거를 연결해야 한다. 기존 영속 상태와 Lease/Recovery로 중단·재개 및 미확정 효과를 확인하고, 중복 실행을 맹목적으로 시작하지 않는다. 반복 실패·무진전·예산 소진·승인 변경·lease 상실·불명확한 외부 효과에서는 중단하고 필요한 결정을 보고한다. 자동으로 테스트·권한·수락 기준을 완화하지 않는다.

이 책임 구분은 기존 모듈 위의 개발 원칙이다. 일반 목표의 완전 자동 위임·오류 수정·장기 실행, Windows·macOS·Linux 전체의 실사용 수용과 Todo + Calendar MVP 성과는 후속 검증 대상이다. 플랫폼별 경로·프로세스·권한 차이를 Capability와 Backend 경계에서 다루며 새로운 필수 Docker/WSL 플랫폼을 도입하지 않는다. 현재 구현/미검증 구분은 진행 현황, 선행 관계와 수락 기준은 로드맵을 따른다.

### Objective·Revision·Context와 복구의 연결

Objective는 사용자가 승인한 목표와 필수 수락 조건의 범위이며 새 Goal 엔진을 뜻하지 않는다. Manager/Coordinator는 남은 WorkItem·의존성과 재개 지점을 설명하고, Harness는 현재 승인·Capability·예산·Lease를 다시 검사하며, Evidence/Judge는 계약과 후보에 결합된 결과를 판정한다. Turn·Attempt·세션·Subagent 종료는 이 완료 조건을 대신하지 않는다.

| 기존 연결 | 코드·계약에서 확인되는 범위 | 목표 및 검증 한계 |
| --- | --- | --- |
| Contract/Revision·Objective 관계 | Legacy `src/task-revision.ts`는 승인 당시 계약과 Objective 관계 snapshot을 보존하고, 현재 권한은 원장 replay로 판단한다. Host 경로의 `src/product/tasks.mjs`는 SQLite Task revision과 이벤트를 함께 갱신한다. 서로 다른 기존 저장 계약을 유지한다. | 모든 자연어 요구 변경을 자동 해석·전파하는 통합 Objective 엔진이 구현됐다는 뜻이 아니다. |
| Revision·승인·WorkItem | `src/workflow/persistence.mjs`는 revision/hash별 승인, revision 충돌, 시도한 WorkItem의 불변성, 새 revision의 승인 대기를 검사한다. 이미 시도한 Hybrid 변경은 새 Workflow가 필요하며 임의 진행 중 수정은 지원하지 않는다. | 영향 분석으로 관련 DAG·Context·검증·승인을 재검토한다. 지원되지 않는 변경은 새 검토 Task/Workflow로 넘기며 제한을 우회하지 않는다. |
| Context Manifest·고정 맥락 | `src/intent/discovery.mjs`의 Git base/blob 식별, `src/hosts/exchange.mjs`의 contract/context/binding hash와 revision 검사, 기존 artifact 참조를 재사용한다. | 아래 초기 설계의 `contextManifestHash`는 목표 스키마다. 모든 경로에 공통 Context Manifest가 구현됐다고 보지 않으며 Host 압축을 대체하지 않는다. |
| SQLite·Lease·Recovery | 기존 Store의 상태·이벤트·artifact와 Controller의 승인/lease/budget 검사를 재사용한다. 미확정 STARTED Attempt는 RECONCILING으로 남고 자동 재실행하지 않으며, 완료 자식은 보존 증거를 검사하여 재조정한다. | 프로세스 재개 반증과 Host 컨텍스트 압축/새 세션의 실제 복구는 별개다. 후자는 각 Host Live 수용 근거가 필요하다. |
| 완료·Evidence 정합성 | `src/product/report.mjs`는 완료 상태와 검증 증거를 함께 확인한다. NEW_PROJECT는 로컬 작업 후에도 Protected Verification UNSATISFIED / complete false를 유지한다. | 새 후보·계약에 과거 증거를 자동 승격하지 않는다. 압축 복구·요구 변경·Goal 지속성 전체가 Live 수용됐다는 주장은 하지 않는다. |

복구 시 현재 사용자 지시와 영속된 목표/계약·revision·승인·DAG·작업 로그·시도/lease·예산·증거를 다시 읽고 고정 맥락과 대조한다. 요약만으로 상태를 만들거나 DB를 직접 고쳐 승인하지 않는다. 누락·충돌·미확정 효과는 영향을 받는 실행을 보류하고 Human Handoff로 전달한다. 새 요구사항은 영향을 받는 작업과 후속 의존 작업의 진행 가능성, 기존 승인/증거의 적용 범위를 재검토한 뒤 지원되는 경로로 반영한다. 무관한 작업도 기존 권한과 조건을 만족하는 범위에서만 계속한다.

위 연결의 오프라인 반증은 기존 `test/task-revision.test.ts`, `test/workflow.test.mjs`, `test/hybrid.test.mjs`, `test/bootstrap-verify.test.mjs`에서 다룬다. 이 테스트의 존재와 해당 범위의 통과를 Host Live 또는 전체 제품 수용으로 해석하지 않는다. 세 Agent 구성의 비교는 기존 보고의 관측 시간·공급자 보고 비용 등 가용 자료를 사용하되 동일한 독립 품질 기준으로 평가하는 후속 수용 조건이다. 별도 실행 엔진·상태 DB·Benchmark 플랫폼을 도입하지 않는다.

## 초기 Alpha 설계 기록

이하의 첫 버전·초기 범위·목표 스키마·명령은 당시 설계다. Host-Native 기본 설치나 현재 모든 기능의 지원 여부를 정의하지 않는다. 책임 분리·독립 증거·정책·복구 원칙은 위 현재 구조에서도 유지한다.

작성일: 2026-09-30. 상태: 제안. 아래 컴포넌트·스키마·명령은 목표 설계이며 구현된 API를 뜻하지 않는다.

## 알파 실행 범위 결정

### Java 빌드 도구 확장 (2026-09-30, alpha.4)

사용자 지시로 기존 Node 경로에 Java/Gradle·Maven 검증 어댑터를 추가했다. alpha.3에는 없으며 alpha.4에 포함한다. Controller·Store·Provider·Judge·Delivery는 공유하고 계약의 `verification`으로 빌드 도구를 선택한다. 첫 Java 범위는 JDK 21, Gradle 9.4.1 또는 Maven 3.9.9, 한 모듈의 명시된 Java 소스와 JUnit 테스트다.

- `prepare-java`는 사용자가 신뢰하는 깨끗한 기준 커밋을 별도 스냅샷으로 만들고 네트워크를 사용해 의존성 이미지를 준비한다. 원본 작업 트리·사용자 홈·인증 파일은 컨테이너에 마운트하지 않는다. 준비 단계는 후보 검증과 구분한다.
- 준비한 로컬 이미지 ID를 계약에 고정한다. 후보 검증은 네트워크 차단·일반 사용자·읽기 전용 소스 마운트로 실행한다. 컴파일 산출물과 의존성 캐시 사본은 매번 새 tmpfs에 둔다. 테스트·빌드 파일은 AI 편집 범위에서 제외한다.
- Gradle/Maven 실행 후 별도의 JDK XML 판독기로 새 JUnit 보고서를 읽는다. 외부 엔티티·DTD를 금지하고 선언된 테스트 클래스 실행, 보고서 수치와 testcase 수의 일치, 수정 전후 테스트 이름의 동일성을 확인한다. 누락·0건·제외·불일치는 수락하지 않는다.
- 이 구조는 선택 테스트 기반 수정의 검증이다. 전체 애플리케이션·DB 통합·운영 배포 검증이나 임의의 악성 JVM 코드에 대한 보고서 위조 방어를 보증하지 않는다. 후보와 테스트가 같은 빌드 출력 공간을 사용하므로 독립 코드 리뷰를 유지한다.

아래 초기 범위의 Java 미지원은 공개 alpha.3의 상태다. 이번 확장의 실측 결과는 진행 현황에 별도로 기록한다.

사용자가 본 로드맵 실행을 요청한 후 초기 수직 경로를 다음과 같이 좁혔다. 공급자는 도구 없는 구조화된 편집 제안을 반환한다. Harness가 정확히 허용한 파일에만 적용하고, Node 기본 테스트 실행기를 Docker의 네트워크 없는 제한된 컨테이너에서 실행한다. 공급자에게 임의 명령 실행·파일 편집 권한을 주지 않는다. 초기 지원은 의존성 설치가 필요 없는 Node 프로젝트다. Java·임의 빌드 도구는 미지원으로 명시한다.

이는 일반적인 CLI 에이전트의 모든 실행을 관측한다고 주장하는 대신 실제로 강제할 수 있는 경계를 제품 범위로 정한 것이다. 기존 엔진은 역사·호환 경로로 남기고 별도 alpha 진입점에서 이 수직 경로를 구현한다. PR 자격증명은 전달 단계에서만 사용한다.

사전 검사기 판정 검증: `decision-001`은 아래 표의 **금지되는 결합** 열과 격리 제약을 정체 증거로 읽었고, `decision-002`는 정책 철회 시 거부·실패 반증 수락 조건을 결정 번복으로 읽었다. 원문은 모두 목표 제약으로 실행 성공 주장이나 서로 충돌하는 결정이 아니다. 두 후보는 원문 문맥 대조로 부적합 판정했다. 진행 현황 후보는 검사기가 근거 부족으로 제외했다. 새 제품 구현 완료나 전체 문서의 정확성을 보증하는 판정은 아니다.

## 설계 선택

첫 버전은 로컬 우선, 단일 운영자, 한 저장소의 변경 작업 직렬 실행으로 제한한다. 기존 TypeScript 자산을 활용하되 실행·관측·판정을 모듈로 분리한다. 별도 마이크로서비스나 클라우드 제어면을 만들지 않는다.

실행 제어는 CodeFleet이 맡고, 코드 생성 루프는 외부 Agent Adapter가 담당한다. 공급자 고유 이벤트를 제품의 진실로 삼지 않는다. 검증 가능한 실행 환경과 독립 검증을 연결한다. 첫 지원 어댑터 하나를 실제 계약 테스트로 선정한 후 확장한다.

저장은 로컬 트랜잭션 저장소(SQLite를 기본 설계 후보로 둠)와 내용 해시 기반 산출물 파일을 분리한다. 드라이버·배포 적합성은 M0에서 검증한다. 기존 JSONL 원장을 무조건 마이그레이션하지 않고 읽기 전용 증거로 보존한다.

## 컴포넌트 관계

```mermaid
flowchart TD
    U[사용자: 목표·정책·예산] --> C[CLI / 상태·예외 화면]
    C --> P[계약·컨텍스트 준비]
    P --> K[정책 컴파일·실행 가능성 검사]
    K --> O[지속 실행 컨트롤러]
    O --> X[실행 환경 / Agent Adapter]
    X --> E[증거 수집 / 산출물 저장]
    X --> V[독립 검증 실행기]
    V --> E
    E --> J[판정기]
    K --> J
    J -->|허용된 수정| O
    J -->|수락| D[전달기: 브랜치·PR]
    J -->|예외| C
    D -->|반영 결과| O
    O <--> S[(상태·이벤트·효과 요청 저장소)]
    D <--> S
    S --> R[진행·감사·성과 보고]
    E --> R
    R --> C
```

각 명령 처리에서 상태 전이와 효과 요청은 같은 트랜잭션으로 저장한다. 외부 프로세스·GitHub 호출 자체를 그 트랜잭션 안에 넣지 않는다.

## 모듈 책임과 경계

| 모듈 | 책임 | 금지되는 결합 |
| --- | --- | --- |
| Contract / Context | 목표, 범위, 완료 조건, 출처, 승인 revision 구성 | 생성한 초안을 자동으로 실행 허가로 취급 |
| Policy | 기능별 권한 교집합, 위임 유효성, 실행 가능성 | 에이전트 요청으로 권한 자동 확대 |
| Controller | 큐, 상태 전이, 예산 예약, 재시도, 중단·재개 | 자체적으로 테스트 성공·업무 완료 판정 |
| Executor / Adapter | 지원 기능 협상, 격리 환경 기동, 실행 종료 | 공급자 자기 보고를 직접 검증 증거로 승격 |
| Evidence | diff·프로세스 결과·환경·한계·해시 기록 | 정책에 따라 원시 관측값 수정 |
| Verifier | 보호된 기준에서 명시적 검증 실행 | 테스트를 실행하지 않았는데 성공으로 처리 |
| Judge | 계약·정책·증거로 결과와 다음 허용 행동 계산 | 프로세스·네트워크·파일 변경 |
| Delivery | 검증한 변경의 브랜치·PR 생성 및 재조정 | 수락만으로 병합·배포 권한 추론 |
| Store / Reporter | 트랜잭션, 조회 모델, 감사·사용자 설명 | 증거를 별도 수동 요약으로 복제하여 사실 생성 |

Judge는 동일한 버전의 계약·정책·증거에 대해 같은 판정을 반환하는 순수 함수로 시작한다. LLM 리뷰는 보조 증거이며 필수 검증 누락을 면제할 수 없다.

## 주요 데이터 계약

| 객체 | 필수 내용 |
| --- | --- |
| TaskContract | schemaVersion, taskId, revision, goal, scope, acceptanceCriteria, verificationSpec, contextManifestHash |
| DelegationPolicy | policyId/version, 허용 저장소·행동·위험 등급·예산, 승인자, 유효기간, 철회 상태 |
| RunPlan | runId, contractHash, policyHash, baseCommit, adapterVersion, environmentFingerprint, isolationCapabilities |
| Attempt | attemptId, parentAttemptId, 시작·종료, 오류 분류, 사용량·측정 가능 여부, 예약 예산, leaseGeneration |
| EvidenceBundle | artifactHash 목록, 관측 주체·authority, 검증 결과, 검사 범위, 미관측 사유, candidateTreeHash |
| Decision | contract/policy/evidence 해시, judgeVersion, ACCEPT/RETRY/ESCALATE/REJECT, 근거, 허용 다음 행동 |
| EffectRequest | effectId, idempotencyKey, 대상 revision, 요청 내용 해시, PENDING/IN_FLIGHT/CONFIRMED/UNKNOWN |
| Intervention | 요청 이유, 선택지와 영향, 답변자, 답변, 갱신 계약·정책 참조, 개입 시간 |

해시 검증과 schema version을 모든 읽기 경계에 적용한다. 비용·종료 코드·관측 가능성의 부재를 빈 문자열이나 0으로 바꾸지 않는다. 공급자가 비용을 제공하지 않으면 unknown/estimate/measured를 구분한다.

## 상태와 루프

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> READY: 계약 유효·실행 가능·위임 유효
    READY --> RUNNING: lease 획득·예산 예약
    RUNNING --> VERIFYING: 변경 확보
    VERIFYING --> DECIDING: 증거 확정
    DECIDING --> READY: 제한 내 수정 필요
    DECIDING --> WAITING_HUMAN: 불확실·권한 부족·예산
    WAITING_HUMAN --> READY: 답변 반영·계약 재검사
    DECIDING --> DELIVERING: 수락·PR 허가
    DELIVERING --> COMPLETED: 외부 반영 확인
    DELIVERING --> RECONCILING: 응답 유실·결과 불명
    RUNNING --> RECONCILING: lease 상실·재시작
    VERIFYING --> RECONCILING: 재시작
    RECONCILING --> READY: 기존 효과 없음·재시도 가능
    RECONCILING --> COMPLETED: 동일 결과 반영 확인
    RECONCILING --> WAITING_HUMAN: 자동 확정 불가
    DECIDING --> FAILED: 복구 불가
```

pause는 신규 실행과 외부 효과 시작을 막는 제어 플래그다. 실행 중 프로세스는 정해진 종료 정책에 따라 정리한다. cancel은 취소 요청을 먼저 기록하고 자식 프로세스 종료·효과 재조정을 마친 뒤 CANCELED로 확정한다. 이미 생성한 PR은 없었던 것으로 취급하지 않는다. 부분 완료는 사용자에게 표시한다.

기본 루프: 위임·기준 커밋 재확인 → 시도 예산 예약 → 실행 → 증거 확정 → 검증 → 판정 → 수정/질문/전달. 다음 작업은 선행 작업의 검증·전달 조건을 만족해야 시작한다. PR이 아직 병합되지 않았다면 이를 기준으로 후속 코드를 실행할지 명시적으로 결정한다. 첫 버전에서는 서로 의존하는 PR 자동 적층을 지원하지 않는다.

## 권한과 격리

역할은 업무 지침이다. 실제 권한은 workspaceRead, workspaceWrite, processExec, networkAccess, credentialUse, remoteWrite로 분리한다. 유효 권한은 시스템·저장소·사용자 위임·작업 제한의 교집합이다.

정책 프리셋 제안:

| 프리셋 | 자동 허용 | 사람에게 남기는 결정 |
| --- | --- | --- |
| 관찰 | 계획·읽기·검증 계획 | 코드 변경·외부 쓰기 |
| 로컬 위임 | 격리 변경·검증·제한된 수정 | 원격 반영 |
| PR 위임 | 위 항목 및 지정 저장소 브랜치·PR 생성 | 병합·배포·권한 확대 |

첫 공개 사용 릴리스의 상한은 PR 위임이다. 인증, 결제, 파괴적 데이터 변경, 비밀·정책·검증 기준 변경은 기본 자동 처리 대상에서 제외한다. 저장소 내용과 도구 출력은 권한을 부여하는 지시로 취급하지 않는다.

worktree는 변경 분리다. 보안 격리를 주장하려면 프로세스·파일 시스템·네트워크·비밀 접근이 실제로 제한되는 실행 환경이 필요하다. 지원 OS별 강제 가능성을 시험하고 미지원 경계는 명시한다. 에이전트 내부 명령 채널을 관측하지 못하면 관측한 척하지 않는다. 자동 처리 정책이 그 관측을 필수로 요구하면 실행을 거부한다.

PR 자격증명은 Delivery에만 전달한다. 에이전트는 원격 쓰기 자격증명을 받지 않는다. 승인·증거·예산 저장소도 에이전트 쓰기 경계 밖에 둔다. 임의 OS 격리나 모든 공급자 지원은 첫 출시 약속에 넣지 않는다.

## 검증 계약

환경 점검과 업무 검증을 분리한다. 각 완료 조건은 실행 가능한 검증이나 명시적인 사람 확인 조건에 연결한다. 의미 검증이 없는 조건은 자동 수락하지 않는다.

기준 commit의 보호된 검증 자산과 candidate 변경을 사용해 독립 검증한다. 테스트 변경이 업무 자체인 경우 새 테스트만으로 자기 변경을 승인하지 않으며 기존 회귀 기준과 별도 검토 조건을 적용한다. 버전 출력, 테스트 0건, 누락된 필수 결과, 잘린 증거, 해시 불일치는 통과가 아니다.

새 수정 시도는 이전 증거를 재사용하여 완료 처리하지 않는다. 검증 증거는 candidateTreeHash, baseCommit, 환경, 검증 사양에 귀속한다. PR head가 바뀌면 기존 수락은 새 head를 보증하지 않는다.

## 저장·복구·외부 효과

- 원시 산출물을 임시 파일에 쓴 후 해시 확인과 원자적 이름 변경을 수행한다. 그 후 상태 트랜잭션에서 참조한다. 남은 고아 파일은 조회 가능한 정리 대상으로 둔다.
- 상태 전이, 이벤트 append, 효과 요청 outbox를 한 트랜잭션으로 기록한다. 이벤트는 수정하지 않고 보정 이벤트를 추가한다.
- worker lease와 fencing generation을 검사하여 오래된 worker가 새 결과를 확정하지 못하게 한다. PID 존재만으로 소유권을 판단하지 않는다.
- PR 생성에는 작업·검증 revision에서 파생한 안정적 식별자를 사용한다. 요청 후 응답을 잃으면 같은 브랜치·PR을 조회해 실제 상태를 확인한다. 맹목적으로 재생성하지 않는다.
- 외부 시스템까지 정확히 한 번 실행을 보장한다고 주장하지 않는다. 재시도 가능한 요청, 멱등 식별, 확인·재조정으로 중복 효과를 줄인다. 확정 불가는 예외로 남긴다.
- 정책 철회는 새 시도와 외부 효과 전에 재확인한다. 이미 진행 중인 효과는 취소 가능성과 실제 결과를 재조정한다.

## 예산과 오류 처리

시도 시작 전에 남은 시간·시도·비용 예산을 검사한다. 공급자가 비용 상한을 강제할 수 없으면 추정치를 확정 상한처럼 표시하지 않는다. 엄격한 금액 상한이 필수인 정책에서는 해당 실행을 거부하거나 비용 제어가 가능한 경로만 사용한다.

일시적 네트워크·서비스 오류는 제한된 backoff, 테스트 실패는 범위 내 수정, 동일 오류 반복·무변경 반복은 중단, 권한 부족은 질문, 증거 결함은 수락 금지로 처리한다. 새 시도는 실패 원인과 변경 가설을 기록한다. 종료 조건을 변경하는 자동 복구는 허용하지 않는다.

## 기존 자산 활용

| 자산 | 처리 |
| --- | --- |
| 계약 revision·승인 해시, 관측 authority | 개념과 테스트를 이관하고 새 데이터 계약으로 확인 |
| mutation·원장·멱등성 원칙 | 보존. 저장소 구현 변경 시 복구·중복 반증 테스트 선행 |
| 경로·명령 정책, 독립 검증 | 재사용 후보. 운영체제별 강제 범위 재검증 |
| `run.ts`의 결합된 흐름 | 그대로 확장하지 않음. 최소 수직 경로에서 책임별 추출 |
| 단일 권한 축, 수동 진행 전제 | 명시적으로 새 설계로 대체 |
| 기존 감사·실행·결함 기록 | 읽기 전용 역사로 보존. 새 상태는 progress와 새 증거에 기록 |

파일만 나누는 대규모 선행 리팩터링을 피한다. M1에서 한 실제 작업을 새 모듈 경계로 완주시키고, 검증된 동작을 단계적으로 옮긴다. 목표 디렉터리·DB·명령 문법의 구체값은 해당 슬라이스 구현 때 고정한다.
