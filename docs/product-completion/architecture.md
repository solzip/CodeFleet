# CodeFleet 공식 아키텍처

현재 제품 정의는 [제품 원칙](../PRODUCT_VISION.md)을 따른다. CodeFleet은 기존 Codex CLI·Claude Code의 모델·인증·세션을 활용하는 Host-Native AI 개발 오케스트레이션 확장 도구다. 이 문서가 현재 구조의 기준이며 초기 Alpha 설계는 별도 회귀 계약으로 보존한다. 구현·검증 상태는 [진행 현황](../../project/PROGRESS.md)에서 관리한다.

## 검토 중인 제품 집중 설계

[개발 작업 검증과 재개 전체 설계](../implementation/work-verification-resume.md)는 기존 Task·Workflow·Controller·Store·Evidence/Judge를 재사용하면서 시작·진행/재개·결과 확인을 주 경로로 정리하는 검토안이다. 정상·실패·불명 상황별 변경·보존·중단·재개와 기존 경로 영향을 정의한다. Host 직접 변경의 관측과 관리된 Fileset 적용을 구분하며, 새 Agent 엔진·DB·권한 issuer를 추가하지 않는다. 검토 전에는 아래 현행 구조와 실행 경계를 변경하지 않는다.

설계 revision 3는 `WORK_REVIEW_V1`의 고정 profile·request artifact, 기존 Task 필드·event·extension을 사용하는 기록 계약, 순서가 있는 상태 판정, 동시 사건과 종료 규칙을 명시한다. phase는 기존 기록에서 도출하고 기존 admission에 추가 제한을 적용한다. 불명 효과는 미해결 종료와 차단으로 닫으며, 기존 Task 자동 이관·강제 조정·새 완료 Judge는 도입하지 않는다.

선택된 구현 후보는 `src/product/work-review.mjs`의 제한·기록·종료, `work-report.mjs`의 읽기 투영, `work-owner.mjs`의 대화형 승인으로 구성한다. 기존 tasks/native-local/reservations 경계와 명시 opt-in MCP에 연결하며 별도 scheduler나 DB를 만들지 않는다. 소유자가 구현·검증을 요청한 범위의 상태와 남은 Host Live 조건은 진행 현황을 따른다.

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

상세 계약은 [Host 연동](../implementation/host-native.md), [승인 경계](../implementation/operator-authorization.md), [IPC](../implementation/host-ipc.md)를 참조한다. [Core 안내](../../guides/host-core-guide.md)는 현재 Backend 보장 범위, [Host 안내](../../guides/host-native-guide.md)는 설치·사용을 담당한다. 상세 계약 원본이나 과거 검토를 이 문서의 최신 상태표로 해석하지 않는다.

## 사용자 경험과 구현 책임

[제품 원칙의 UX-01~UX-05](../PRODUCT_VISION.md#핵심-사용자-경험)를 다음 기존 경계에 연결한다. 아래 표는 구현 작업의 책임 배치이며 사용자 경험 전체의 수용 완료를 뜻하지 않는다. 수락 시나리오는 [로드맵](roadmap.md#사용자-경험-수락-기준), 구현·검증 상태는 [진행 현황](../../project/PROGRESS.md#사용자-경험별-진행도)이 관리한다.

| ID | 연결할 기존 책임 | 유지할 경계 |
| --- | --- | --- |
| UX-01 | Host/Skill의 질문·제안, `src/intent/`의 탐색·Validator, `src/product/tasks.mjs`의 계약 준비 | 자연어 설명과 구조화 계약을 연결하되 추론으로 누락된 권한·완료 기준을 확정하지 않음 |
| UX-02 | 기존 Workflow/Controller의 적격 작업 선택, `native-local.mjs`·`work-log.mjs`·`directives.mjs`의 검토·지침, `report.mjs`의 필요한 결정 표시 | Host 권한과 정확한 승인·예산·Lease를 검사. Reporter나 Agent가 실행 권한을 생성하지 않음 |
| UX-03 | `repair.mjs`·`contract-revisions.mjs`·기존 Controller의 실패·수정 경로와 Verification Backend | 실패 Evidence·별도 승인·새 후보 검증을 연결하며 수락 기준을 수정 루프에서 약화하지 않음 |
| UX-04 | 기존 Store/Event/Artifact, `recovery.mjs`·Goal/Bootstrap 탐색·Work Log와 Host의 세션/압축 기능 | 동일한 계약·시도·미확정 효과·예산을 복구. 별도 Goal 엔진·상태 DB·Host 압축 구현을 추가하지 않음 |
| UX-05 | `controlled-delivery.mjs`·`destination-evidence.mjs`·`objective-status.mjs`·기존 Evidence/Judge/Reporter | 후보 검증과 실제 대상 반영을 구분하고 현재 대상·계약의 근거로 판정. 읽기 전용 보고가 실행이나 승인을 유발하지 않음 |

경로를 생략한 `.mjs` 파일명은 `src/product/` 기준이다. 사용자용 질문·상태·결과 설명은 이 영속 기록과 판정을 읽어 표현하며 별도의 요약 상태 저장소를 만들지 않는다. 승인 검토에는 정확한 계약·후보·효과·검증 범위를 연결하고, 필요한 기술 식별자는 시스템이 전달한다. 사용자에게 친숙한 표현으로 바꿔도 기존 검증자 독립성과 승인 검사를 유지한다.

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

## 기존 Alpha 호환 계약

기존 Alpha 경로의 구조·데이터 계약·검증 경계는 [보존 계약](../../test/contracts/legacy/alpha-design.md)을 따른다. 위 Host-Native의 현재 구조를 대체하지 않는다.
