# CodeFleet G0 보완 설계 검토 및 제품 소유자 결정 요청서

- 문서 상태: `DESIGN_DIRECTIONS_APPROVED / EXECUTION_PARAMETERS_OPEN`
- 설계 상태: `G0_DESIGN_POLICY_APPROVED / R3_INTEGRATED`
- Host Protocol: `UNVERIFIED / NOT_RUN`
- M1 구현: `NOT_AUTHORIZED`
- 적용 원칙: `Autonomous Execution × Controlled Process × Verified Results`
- 범위: Codex Single-Agent Host-Native MVP
- 금지 범위: 이 문서에 의한 제품 구현, 테스트·Pilot·모델 실행, Runtime·State 변경, Git 작업 승인
- 승인 이력: 2026-11-04 제품 소유자가 D1의 App Server managed-thread 우선 조건부 선택과 D2~D12의 기본 설계 방향을 승인했다. 구체 위험등급·예산·범위·Fixture·Git 기준선은 승인되지 않았다.
- 현재 통합 기준: `codefleet-execution-contract-r3.md`
- 승인 원칙: 이 설계 승인은 CodeFleet Operator grant, Host Protocol Proof 성공, M1 구현 승인 또는 Git 권한이 아니다.

## 1. 목적

이 문서는 CodeFleet의 궁극적인 제품 목표인 다음 세 요소를 하나의 실행 trace에서 달성하기 위한 G0 설계 결정안을 정리한다.

- Autonomous Execution
- Controlled Process
- Verified Results

목표는 새 기능을 구현하는 것이 아니라 다음을 확정하는 것이다.

1. 현재 CodeFleet와 Codex Host 기능으로 구현 가능한 최소 경로
2. 기존 Controller, Store, Workflow, Lease, Evidence/Judge의 재사용 범위
3. Codex App Server 기반 Host-Native 실행 경계
4. Candidate 검증과 실제 프로젝트 반영의 분리
5. Repair Attempt migration의 호환성 조건
6. 제품 소유자가 최종 선택해야 하는 항목
7. G0 설계 승인, Host Protocol Proof, M1 구현 착수 승인의 분리

이 문서는 설계 후보이며 실행·수정·테스트·Git 작업 권한을 부여하지 않는다.

## 2. 현재 판정

현재 상태는 다음과 같다.

> `G0_DESIGN_POLICY_APPROVED / R3_INTEGRATED / HOST_PROTOCOL_UNVERIFIED / M1_NOT_AUTHORIZED`

설계 방향은 실제 CodeFleet 구조와 현재 Codex 기능에 부합하며, 새로운 Agent 엔진·Goal 엔진·Scheduler DB 없이 구현 가능한 경로가 존재한다.

그러나 다음 조건이 충족되지 않았으므로 M1 구현을 시작할 수 없다.

1. D1~D12에 대한 제품 소유자의 명시적 승인
2. Codex App Server의 실제 Turn/Approval/Result 프로토콜 증명
3. 첫 existing-repository Fixture와 과제 선택
4. Todo+Calendar 최종 MVP criterion/backend 선택
5. 구현 기준선 선택
6. 별도의 M1 구현 착수 승인

## 3. 세 승인 게이트

G0 이후의 승인은 반드시 다음 세 단계로 분리한다.

| 게이트 | 의미 | 현재 상태 |
| --- | --- | --- |
| G0 설계 승인 | D1~D12 방향, 불변 조건, 미검증 범위와 후속 검증 계획의 승인 | `DESIGN_POLICY_APPROVED` |
| Host Protocol Proof | 실제 Codex App Server에서 reservation 이후 Turn, Approval, Result, interruption/resume 프로토콜 증명 | `UNVERIFIED / NOT_RUN` |
| M1 구현 착수 승인 | 선택된 기준선과 정확한 파일·계약·검증·예산 범위를 가진 M1 WorkItem의 구현 승인 | `NOT_REQUESTED / NOT_APPROVED` |

각 게이트는 다음 게이트를 자동 승인하지 않는다.

```text
G0_DESIGN_APPROVED
≠ HOST_PROTOCOL_PROVEN
≠ M1_IMPLEMENTATION_AUTHORIZED
≠ M1_HOST_LIVE_VERIFIED
```

- G0 설계 승인은 Host Protocol 성공을 의미하지 않는다.
- Host Protocol Proof 승인은 제품 기능 구현 권한이 아니다.
- Host Protocol Proof 성공은 M1 구현 착수 승인이 아니다.
- M1 구현 완료는 Host Live 수용이나 Objective 완료가 아니다.

## 4. D1~D12 보완 결정안

모든 D1~D12 기본 방향은 `DESIGN_POLICY_APPROVED`이다. 각 행의 구체적 선택값은 Execution Contract R3 §13에 따라 `OPEN`이며, 실행 권한은 별도다.

| 결정 | 승인된 설계 방향 | 유지해야 할 경계 | 미확정 실행 파라미터 |
| --- | --- | --- | --- |
| D1 Host integration | Codex App Server 우선 검증 | 별도 API key 의무화, 직접 Responses 대체, 중복 Agent loop 금지. 실제 Turn/Approval/Result는 Proof 전까지 `UNVERIFIED` | 실제 protocol/version/권한/예산/수용 기준 |
| D2 Local/Protected | 저위험 감독형 작업에 `LOCALLY_VERIFIED (UNPROTECTED)` 허용 | Local은 Protected Evidence가 아니며 Protected 요구 Contract는 backend 부재 시 `BLOCKED` | Local 허용 위험등급과 criterion |
| D3 Continuation | 활성 Host에서는 자동 계속, Host 재진입 시 안전한 재개 | Host 부재 중 계산 보장 금지. 미확정 `STARTED` 자동 replay 금지 | wake trigger, resume timeout, 재시도·운영 시간 한도 |
| D4 Objectives | 작은 existing repo의 첫 E2E와 Todo+Calendar NEW_PROJECT 최종 수용 분리 | 실제 Fixture 확인 전 criterion과 test/backend를 임의 확정하지 않음 | 첫 Fixture·과제 및 최종 Todo+Calendar criterion |
| D5 PR #13 Work Log | 기존 Event/Artifact, revision, directive, uncertain handoff projection만 선택적 재사용 | PR 전체 병합 전제 금지. Work Log가 승인·Attempt·Lease·Evidence를 대신하지 않음 | 선택적 포팅 또는 유보 |
| D6 Bootstrap | NEW_PROJECT pre-HEAD 단계를 보존하고 validated Contract 이후 공통 경로로 수렴 | NEW_PROJECT에 가짜 HEAD를 요구하거나 existing repo 전제를 강제하지 않음 | M1 repo shape 범위와 수렴 단계 |
| D7 Runtime identity | source SHA, Codex version, protocol, Skill/runtime hash, OS를 receipt에 결합 | protocol incompatibility는 hard block | 허용 drift와 hard-block 조건 |
| D8 Repair semantics | 동일 승인 scope 안에서 immutable generation Repair 허용 | 기존 Attempt 수정·삭제·terminal rewrite 금지. scope 확대는 revision 필요 | M4 활성화 시점, generation/시간/비용 한도와 no-progress 기준 |
| D9 Approval bundle | 정확한 WorkItem·파일·명령·backend·예산·기간을 가진 승인 묶음 허용 | 위험·scope·명령·예산·destination 변경 시 새 승인 필요 | bundle 최대 범위·기간·예산·재승인 임계값 |
| D10 Workspace/Delivery | Candidate 격리·검증, destination apply, 적용 후 재검증을 별도 전이로 운영 | Candidate PASS는 프로젝트 구현 완료가 아님 | 기존 승인이 apply까지 포함할 조건 |
| D11 Continuation owner | CodeFleet Controller만 일정·readiness·reservation·dispatch를 결정 | Codex Goal 또는 Host가 다음 WorkItem을 독립 선택할 수 없음 | Goal 비활성 또는 bounded Turn 내부 보조 |
| D12 Attempt storage | 기존 Attempt 불변성을 유지하며 generation-aware migration 검토 | 기존 row 덮어쓰기와 unresolved Attempt replay 금지 | 복합키, 별도 immutable table 또는 M4 유보 |

## 5. D1 — Codex App Server 우선 검증

Codex App Server를 MVP의 우선 Host Protocol Proof 대상으로 한다.

목표 구조는 다음과 같다.

```text
CodeFleet Controller
  → 기존 admission과 Attempt reservation
  → Codex App Server Turn 요청
  → Host Approval/Event 관측
  → Turn Result 회수
  → 실제 Candidate 캡처
  → 기존 Verification/Evidence/Judge
  → 기존 finish()
```

### 5.1 유지 조건

- 기존 Codex 인증, 모델, 세션, 도구를 재사용한다.
- 정상 Host workflow에 별도 API key를 요구하지 않는다.
- 직접 Responses API 호출을 Codex Host의 대체 엔진으로 사용하지 않는다.
- 별도 Agent loop나 모델 orchestration engine을 만들지 않는다.
- CodeFleet는 application-owned 계약, 승인, DAG, Evidence를 유지한다.
- Codex App Server는 Host-owned thread, Turn, tool execution, event stream을 담당한다.

### 5.2 현재 증거 수준

- App Server 기능 존재: 확인됨
- CodeFleet adapter: 구현되지 않음
- reservation 이후 실제 `turn/start`: `UNVERIFIED`
- approval pause/deny/resume: `UNVERIFIED`
- thread/turn/result receipt binding: `UNVERIFIED`
- interruption/disconnect recovery: `UNVERIFIED`
- 기존 interactive CLI thread attachment: `UNVERIFIED`

Host Protocol Proof 전에는 위 기능을 구현 또는 수용된 것으로 표시하면 안 된다.

## 6. D2 — Local과 Protected의 분리

저위험·감독형 작업에는 명시적인 Local 검증을 허용할 수 있다.

허용 결과 표시는 다음과 같다.

```text
COMPLETE — LOCALLY VERIFIED (UNPROTECTED)
```

단, 다음 제약을 적용한다.

- Local verification은 same-user 신뢰 실행이다.
- 악의적 코드에 대한 OS 수준 격리를 증명하지 않는다.
- Host Sandbox는 실제 enforcement 검증 전까지 `NOT_VERIFIED`다.
- Protected가 필요한 criterion은 Local 결과로 충족할 수 없다.
- Protected backend가 없으면 downgrade하지 않고 `BLOCKED` 처리한다.
- Candidate hash와 명령 결과가 있더라도 Protected Evidence로 재표시하지 않는다.

제품 소유자는 Local로 완료 가능한 위험등급과 criterion을 선택해야 한다.

## 7. D3 — 활성 Host 자동 계속과 안전한 재개

MVP 기본안은 다음과 같다.

### 7.1 활성 Host

CodeFleet Controller가 현재 persisted state를 재조회하고 다음 WorkItem을 선택한다.

```text
accepted predecessor
→ committed finish()
→ current approval/lease/budget 재검사
→ next WorkItem reserve
→ Host Turn dispatch
```

### 7.2 Host 부재

- READY 상태와 필요한 context reference를 보존한다.
- background computation을 약속하지 않는다.
- resident daemon을 MVP 필수 조건으로 만들지 않는다.

### 7.3 Host 재진입

다음을 재검사한 뒤 재개한다.

- current user instruction
- Contract/Workflow revision
- approval validity
- Lease와 fence
- Attempt 상태
- 남은 예산
- Candidate/Evidence reference
- 미확정 Host effect
- destination 상태

미확정 `STARTED` Attempt는 READY 또는 PENDING으로 되돌리지 않는다. Host receipt로 reconcile할 수 없으면 `RECONCILING` 또는 `HUMAN_HANDOFF`로 남긴다.

## 8. D4 — 첫 E2E와 최종 MVP 수용의 분리

D4는 두 개의 제품 게이트로 분리한다.

### 8.1 D4-A: 첫 existing-repository E2E

목적:

- 작은 실제 기존 저장소에서 전체 실행 계약의 최소 vertical을 검증
- Goal/Contract/DAG에서 actual Host Turn, Candidate, Verification, delivery까지 연결
- 복잡한 제품 기능보다 실행 계약의 정확성을 우선 검증

실제 Fixture를 확인하기 전에는 다음을 확정하지 않는다.

- 정확한 파일 범위
- 반드시 통과해야 할 명령
- acceptance criterion
- Local 또는 Protected backend
- 허용되는 destination apply 방식

### 8.2 D4-B: Todo+Calendar NEW_PROJECT 최종 MVP

Todo+Calendar는 최종 MVP 수용 목표다.

최종 수용에는 다음이 필요하다.

- NEW_PROJECT의 pre-HEAD Bootstrap
- approved fileset
- 실제 Codex execution
- list/calendar 데이터 일관성
- owner-approved CRUD·완료·날짜·화면 criterion
- actual target materialization
- 적용 후 target 검증
- Objective-level Evidence/Judge

구체적인 UI view, CRUD 범위, test matrix는 실제 Fixture와 제품 요구를 확인한 후 제품 소유자가 승인한다.

첫 existing-repo E2E 성공만으로 Todo+Calendar 또는 전체 MVP를 완료 처리하면 안 된다.

## 9. D5~D8 — 기존 코드와 호환성 우선

### 9.1 D5 PR #13

재사용 후보:

- 기존 SQLite Event/Artifact
- directive 기록과 reconciliation
- Contract revision 연계
- WorkItem assignment
- handoff packet
- stale revision 처리
- uncertain delivery no-replay
- recovery projection

재사용 금지 또는 별도 증명이 필요한 부분:

- 문자열 `agentId`를 Host 인증으로 간주
- `PREPARED`를 실제 dispatch로 간주
- embedding-reported receipt를 독립 Evidence로 간주
- Work Log를 Attempt/Lease/Judge 상태기로 사용
- PR 전체를 현재 main에 자동 병합

권고는 선택적 포팅이며 전체 cherry-pick 또는 merge가 아니다.

### 9.2 D6 Bootstrap

NEW_PROJECT와 existing repo는 초기 조건이 다르다.

```text
NEW_PROJECT
  → pre-HEAD draft/fileset
  → validated Contract
  → approved Workflow
  → common admission/evidence path

EXISTING_REPOSITORY
  → actual base/status
  → validated Contract
  → approved Workflow
  → common admission/evidence path
```

공통화는 초기 조건을 제거하는 것이 아니라 validated Contract 이후의 실행 경계를 공유하는 것이다.

### 9.3 D7 Runtime identity

각 실제 execution artifact는 최소 다음을 기록해야 한다.

- CodeFleet source SHA
- installed Runtime identity/hash
- Codex version
- App Server protocol/adapter version
- OS와 shell
- Skill identity/hash, 적용된 경우
- execution mode
- thread/turn receipt
- candidate workspace identity

지원되지 않는 protocol mismatch는 실행을 차단한다. 단순 drift를 경고 또는 차단할지는 제품 소유자가 결정한다.

### 9.4 D8 Repair

Repair는 이전 Attempt의 retry가 아니다.

```text
failure Evidence
→ defect classification
→ scope/approval/budget/no-progress 검사
→ new immutable generation
→ new Host Turn
→ new Candidate
→ independent re-verification
→ new Evidence/Judge
```

범위·criterion·backend가 변경되면 새 generation이 아니라 Contract revision이 필요하다.

## 10. D9 — 승인 묶음

승인 묶음은 다음 필드를 포함해야 한다.

```text
contractRevision
workItemIds
candidateWorkspace
destination
allowedFiles
allowedResources
exactCommands
verificationBackend
riskClass
attemptLimit
timeLimit
costLimit
validFrom
expires
deliveryIncluded
forbiddenEffects
```

하나의 승인 묶음이 여러 WorkItem을 포함할 수 있는 조건:

- WorkItem과 scope가 사전에 정확히 고정됨
- 명령과 backend가 고정됨
- 총 예산·기간이 고정됨
- WorkItem 간 권한 확대가 없음
- destination이 고정됨
- 위험등급이 동일하거나 낮아짐
- 각 dispatch에서 current approval을 재검사함

다음 변화는 별도 승인을 요구한다.

- 위험등급 증가
- 파일·리소스·명령 추가
- 예산 또는 기간 증가
- destination 변경
- 새 delete/rename/mode 변경
- dependency installation
- network 또는 credential 접근
- commit, push, PR, merge, deploy
- Contract criterion 또는 verification authority 변경

Host permission UI와 CodeFleet approval bundle은 별개의 권한이다. 둘 중 하나가 다른 하나를 대신할 수 없다.

## 11. D10 — Candidate, Delivery, Destination Verification

D10의 상태 전이는 다음과 같이 분리한다.

```text
CANDIDATE_AUTHORIZED
→ CANDIDATE_EXECUTED
→ CANDIDATE_CAPTURED
→ CANDIDATE_VERIFIED
→ DELIVERY_APPROVAL_CHECKED
→ DESTINATION_APPLIED
→ DESTINATION_OBSERVED
→ DESTINATION_VERIFIED
→ OBJECTIVE_DECIDED
```

### 11.1 Candidate 승인

다음을 정확히 고정한다.

- candidate workspace와 baseline
- 허용 파일·리소스
- 허용 명령
- 검증 backend
- 시도·시간·비용 한도
- 유효기간
- 금지된 외부 효과

Candidate 승인은 기본적으로 실제 프로젝트 반영을 허가하지 않는다.

### 11.2 기존 승인으로 apply 가능한 조건

원래 approval bundle이 다음을 모두 포함한 경우에만 Candidate 승인으로 destination apply까지 허용할 수 있다.

- 정확한 destination
- destination base hash
- 허용 candidate identity 또는 제한된 candidate 선택 규칙
- 변경 파일 manifest
- delete/rename/mode/symlink 정책
- apply 방식
- drift/conflict 정지 조건
- post-apply 검증
- commit/push/deploy 제외
- 유효한 위험등급과 기간

### 11.3 별도 apply 승인이 필요한 조건

- destination 변경
- destination drift 또는 dirty state
- 새로운 파일·명령·위험 범위
- 승인되지 않은 delete/rename/mode 변경
- dependency installation 또는 network access
- secret·설정·외부 서비스 변경
- commit, push, PR, merge, deploy
- Candidate 검증 후 발견된 scope 확장 Repair

### 11.4 적용 후 재검증

Candidate 결과만으로 실제 프로젝트 구현 완료를 주장하지 않는다.

| 상태 | 의미 |
| --- | --- |
| `VERIFIED_CANDIDATE_AVAILABLE` | Candidate만 검증됨 |
| `DELIVERED_NOT_VERIFIED` | 목적지 반영은 됐지만 post-apply 검증 미실행 |
| `INCOMPLETE` | 반영 또는 필수 criterion 미충족 |
| `REPAIR` | 실제 결함이며 승인 범위 안에서 수정 가능 |
| `COMPLETE — LOCALLY VERIFIED` | 실제 destination tree에서 Local criterion 충족 |
| `COMPLETE — PROTECTED VERIFIED` | 실제 destination tree에서 Protected criterion 충족 |

## 12. D11 — 유일한 실행 일정 결정 주체

CodeFleet Controller가 다음 결정의 유일한 주체다.

- WorkItem readiness
- admission
- reservation
- dispatch ordering
- successor selection
- Repair eligibility
- final integration eligibility

Codex Goal은 다음 역할을 할 수 없다.

- WorkItem 선택
- 승인 생성
- Attempt reservation
- Lease 우회
- budget 재설정
- Candidate acceptance
- Evidence/Judge 대체
- Objective completion 선언

MVP 기본 권고는 controlled App Server 실행에서 Host Goal을 비활성화하는 것이다.

향후 Goal을 사용할 경우에도 Controller가 승인하고 예약한 bounded Turn 안의 UI-level continuation 보조로만 허용한다. 두 개의 자동 계속 loop를 동시에 운영하면 안 된다.

## 13. D12 — Generation-aware Attempt Migration

### 13.1 현재 불변 조건

- 기존 Attempt는 immutable하다.
- terminal Attempt는 다시 쓸 수 없다.
- `STARTED` Attempt는 자동 replay할 수 없다.
- 이전 Evidence는 새 Attempt의 완료 증거가 아니다.
- scope 변경은 Attempt generation이 아니라 Contract revision이다.

### 13.2 주요 migration 위험

1. 기존 `(runId,itemId)` 조회가 단일 row를 전제한다.
2. 첫 generation과 최신 generation이 혼동될 수 있다.
3. prior Attempt 차단 규칙의 의미가 변한다.
4. recovery가 이전 terminal generation을 현재 실행으로 오인할 수 있다.
5. 기존 event/artifact에 generation이 없다.
6. 부분 migration 실패가 State를 읽을 수 없게 만들 수 있다.
7. unresolved `STARTED` 뒤의 새 generation은 effect replay가 될 수 있다.
8. revision 변경이 Repair generation으로 우회될 수 있다.

### 13.3 수용 조건

- 기존 row는 변경 없이 논리적 `generation=1`로 읽힌다.
- 기존 `childId`, revision, status, event 관계를 보존한다.
- 새 generation은 별도 immutable identity와 child run을 가진다.
- unresolved `STARTED`가 있으면 새 generation을 생성하지 않는다.
- 생성 전 approval, Lease, budget, scope, failure Evidence를 재검사한다.
- scope·criterion·backend 변경은 Contract revision을 요구한다.
- terminal status는 다시 쓸 수 없다.
- 이전 Evidence를 새 generation 완료에 재사용하지 않는다.
- migration은 transaction 단위여야 한다.
- 실패 시 기존 schema를 계속 읽거나 명확히 차단해야 한다.
- 기존 schema fixture와 migration·rollback·failure 검증이 필요하다.
- current/latest/accepted generation 조회 의미를 모든 호출부에서 명시한다.
- schema migration 성공은 M4 Host Live 성공이 아니다.

수용 조건을 충족할 수 없으면 다음 상태를 유지한다.

```text
M4_DEFERRED
```

## 14. 기존 설계문서 수정 대상

### 14.1 `codefleet-target-architecture-v2-review.md`

| 섹션 | 변경 내용 |
| --- | --- |
| §0 | G0 설계 승인, Host Protocol Proof, M1 구현 승인을 분리하고 모든 D 결정을 `PROPOSED`로 표시 |
| §2.1 | Local/Protected 분리와 `VERIFIED_CANDIDATE_AVAILABLE`, `DELIVERED_NOT_VERIFIED` 상태 추가 |
| §3 | App Server를 우선 Proof 대상으로 지정하고 Lane I를 `UNVERIFIED` future adapter로 유지 |
| §3.1 | reserve 이후 `turn/start`, approval/event/result binding, interrupted/unknown 처리 추가 |
| §4 | Candidate 검증, delivery approval, destination apply, post-apply verification 전이로 교체 |
| §5.3 | Controller-only scheduling과 Host Goal 기본 비활성 원칙 추가 |
| §6 | 활성 Host continuation과 Host-return resume 계약 추가 |
| §7 | generation migration 위험·수용 조건·M4 defer 조건 추가 |
| §9 | Approval Bundle 필수 필드와 재승인 조건 추가 |
| §10 | D1~D12를 본 문서 결정표로 교체하고 D4-A/D4-B 분리 |
| §11 | App Server lifecycle, delivery 분리, generation migration acceptance 추가 |
| §12 | 세 승인 게이트가 서로 다른 상태임을 명시 |

### 14.2 `codefleet-codex-mvp-plan-v2-review.md`

| 섹션 | 변경 내용 |
| --- | --- |
| §0 | 첫 existing-repo vertical과 Todo+Calendar 최종 수용 분리 |
| §3 | G0-1 Design Approval, G0-2 Host Protocol Proof, G0-3 M1 Authorization으로 재편 |
| §4 | 실제 existing-repo Fixture를 입력으로 하고 Fixture 확인 전 criterion 확정 금지 |
| §5 M2-A | App Server primary adapter와 reservation-to-turn ordering 명시 |
| §5 M2-B | Candidate, delivery authorization, destination verification 분리 |
| §6 | Controller-only scheduling, active continuation, Host-return safe resume 추가 |
| §7 | generation migration precondition·위험·수용 matrix 추가 |
| §8 | existing-repo E2E와 Todo+Calendar 최종 semantic acceptance 분리 |
| §9 | 세 제품 결과를 별도 milestone으로 정의 |
| §10 | App Server protocol, destination apply, migration backward compatibility acceptance 추가 |
| §12 | 승인된 원칙과 `OPEN` 실행 파라미터를 분리하고 R3를 규범 계약으로 참조 |
| §13 | G0 설계, Host Proof, M1 착수 체크리스트 분리 |

## 15. G0 잔여 결정

원칙 선택은 끝났다. 실행 전에 필요한 값만 제품 소유자의 명시적 결정을 기다린다. 중복 목록을 만들지 않으며 Execution Contract R3 §13의 R1~R13을 단일 잔여 결정표로 사용한다. 핵심 범주는 Host Protocol Proof fixture·protocol·권한·예산, 첫 existing-repository fixture와 기준선, Local/Protected 위험 매트릭스, approval bundle 한도, Candidate destination/apply 범위, Runtime drift 정책, PR #13 선택 재사용 범위, generation migration/rollback, Todo+Calendar 최종 수용 기준이다.

Host Protocol Proof 실행 승인과 그 결과 수용, M1 구현 착수 승인은 각각 별도 결정이다.

## 16. 제품 소유자 승인 기록 형식

승인은 다음과 같이 결정별로 기록해야 한다.

```text
Decision:
Disposition: APPROVE | REVISE | REJECT | DEFER
Selected option:
Boundary:
Required evidence:
Effective date:
Approver authority:
Notes:
```

다음은 승인으로 간주하지 않는다.

- 문서를 읽었다는 응답
- 자유 형식의 긍정적 의견
- Agent가 기록한 actor 문자열
- Host permission UI의 일회 승인
- G0 설계 승인만 존재하는 상태
- Host Protocol Proof 실행 승인
- 테스트 또는 모델 실행 승인
- Git 작업 승인

## 17. 결론

CodeFleet의 최소 구현 경로는 기존 Controller, Store, Workflow reservation, Lease, Candidate, Verification, Evidence/Judge를 유지하고 Codex App Server adapter를 하나 추가하는 구조다.

```text
Task/Contract
→ Workflow/DAG
→ Approval/Capability/Lease
→ existing Attempt reservation
→ Codex App Server Turn
→ isolated Candidate
→ existing Verification/Evidence/Judge
→ existing finish()
→ approved destination apply
→ actual destination re-verification
→ Objective decision
```

추가하지 않는 것:

- 새 Agent 엔진
- 새 Goal 엔진
- 새 Scheduler DB
- 새 승인 엔진
- 직접 모델 API 기반 대체 Host
- 의무적인 always-on daemon
- 경쟁하는 두 개의 자동 계속 loop

현재 최종 상태는 다음과 같다.

> **D1~D12의 기본 설계 방향은 제품 소유자가 승인했고 R3에 통합됐다. 위험등급·예산·실행 범위·첫 Fixture·Git 기준선은 여전히 미확정이며, Host Protocol은 `UNVERIFIED`, M1 구현은 `NOT_AUTHORIZED`다.**
