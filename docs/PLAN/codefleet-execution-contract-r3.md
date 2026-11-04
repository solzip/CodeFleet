# CodeFleet Host-Native Execution Contract R3

> **Status:** `DESIGN_POLICY_APPROVED / EXECUTION_PARAMETERS_OPEN / HOST_PROTOCOL_UNVERIFIED / IMPLEMENTATION_NOT_AUTHORIZED`  
> **Prepared:** 2026-11-04  
> **Authority:** 제품 소유자가 승인한 D1~D12의 기본 설계 방향을 통합한 현재 실행 계약. CodeFleet Operator grant, Host Protocol Proof 성공, 제품 구현 승인 또는 Git 권한이 아니다.  
> **Inputs:** `codefleet-g0-supplemented-design-review.md`, `codefleet-target-architecture-v2-review.md`, `codefleet-codex-mvp-plan-v2-review.md`, 현재 Product Charter·Architecture·Progress·Roadmap.  
> **Missing predecessor:** 저장소에는 이 문서 작성 전에 식별 가능한 별도 “Execution Contract R3” 파일이 없었다. 이 문서가 승인된 G0 정책을 처음 R3로 통합하며, 과거 문서를 소급해 R3였다고 표시하지 않는다.

## 0. 문서 권한과 승인 분리

이 계약은 다음 세 상태를 분리한다.

```text
G0_DESIGN_POLICY_APPROVED
≠ HOST_PROTOCOL_PROVEN
≠ M1_IMPLEMENTATION_AUTHORIZED
≠ HOST_LIVE_VERIFIED
≠ OBJECTIVE_ACCEPTED
```

- `G0_DESIGN_POLICY_APPROVED`: D1~D12의 기본 방향만 승인됐다.
- `HOST_PROTOCOL_PROVEN`: 실제 App Server lifecycle을 별도 권한과 예산으로 검증한 뒤에만 설정할 수 있다. 현재는 `UNVERIFIED`다.
- `M1_IMPLEMENTATION_AUTHORIZED`: 정확한 기준선·파일·검증 명령·예산을 지정한 별도 구현 승인이 필요하다.
- 설계 승인은 CodeFleet approval row, Operator grant, Host permission 또는 외부 효과 권한으로 사용할 수 없다.
- 위험등급, 예산, 유효기간, 첫 Fixture, Git 기준선, 정확한 명령과 destination은 아직 승인되지 않았다.

문서 우선순위는 다음과 같다.

1. `docs/PRODUCT_VISION.md`: 제품 불변식
2. `docs/product-completion/architecture.md`: 현재 구현 책임 경계
3. 이 R3: 승인된 목표 실행 계약과 미확정 파라미터
4. `codefleet-target-architecture-v2-review.md`: R3의 상세 근거와 구조 설명
5. `codefleet-codex-mvp-plan-v2-review.md`: R3 구현·검증 단계
6. `codefleet-g0-supplemented-design-review.md`: G0 검토 및 승인 이력
7. `progress.md`와 날짜가 있는 run/audit: 각 시점의 실제 구현·검증 Evidence

과거 감사·run 기록은 원래 시점의 Evidence로 보존한다. R3가 과거 `UNVERIFIED`, 실패 또는 제한을 소급 변경하지 않는다.

## 1. 제품 완료 계약

CodeFleet는 Host의 모델·인증·세션·도구·Agent 시설을 실제 capability와 permission 안에서 재사용하는 Host-Native 개발 orchestration 확장이다. 별도 Agent 엔진, Goal 엔진, Scheduler DB 또는 직접 모델 API를 정상 경로의 대체물로 만들지 않는다.

한 Objective는 다음 세 요소가 같은 joined trace에서 증명될 때만 완료된다.

| 제품 원칙 | 필수 관측 |
| --- | --- |
| Autonomous Execution | 승인된 WorkItem이 실제 Host Turn에서 실행되고, persisted predecessor 결과를 따라 다음 WorkItem 또는 bounded Repair로 진행 |
| Controlled Process | 현재 Contract/Workflow revision, approval, capability, scope, Lease, budget, Attempt, workspace와 effect receipt가 dispatch 전후에 집행 |
| Verified Results | 실제 Candidate와 delivered destination tree에 결합된 독립 Evidence를 Judge가 모든 필수 criterion에 대해 판정 |

Turn, Attempt, WorkItem, 세션, Candidate 검증 또는 문서 완료는 Objective 완료를 대신하지 않는다.

## 2. 승인된 D1~D12 정책과 미확정 파라미터

| ID | 승인된 설계 원칙 | 아직 승인되지 않은 실행 파라미터 |
| --- | --- | --- |
| D1 | Codex App Server managed thread를 우선 Host lane으로 조건부 선택. 기존 Host 인증·모델·도구를 재사용하고 별도 Agent 엔진을 만들지 않는다. | 실제 transport/config, protocol schema/version, account usage boundary, thread policy, approval mapping, Proof 예산. Protocol은 `UNVERIFIED`. |
| D2 | 저위험 감독형 Local을 허용하되 `UNPROTECTED`로 표시하고 Protected와 승격 불가능하게 분리한다. | 위험등급 taxonomy, Local 허용 criterion, Protected 필수 기준과 backend. |
| D3 | 활성 Host에서는 Controller가 자동 계속하고 Host 재진입 시 persisted state에서 안전하게 재개한다. Host 부재 중 computation은 약속하지 않는다. | idle/wake policy, resume timeout, UX, 운영 시간 한도. |
| D4 | 작은 existing-repository 과제로 첫 vertical E2E를 검증하고 Todo+Calendar NEW_PROJECT를 최종 MVP 수용으로 별도 운영한다. | 첫 Fixture, 실제 과제, criterion, commands, backend, Todo+Calendar 최종 기능 행렬. |
| D5 | PR #13은 기존 Event/Artifact·revision·directive·handoff projection 중 호환되는 최소 부분만 재사용한다. 자동 병합하지 않는다. | 포팅할 정확한 commit/files/fields와 통합 기준선. |
| D6 | NEW_PROJECT pre-HEAD Bootstrap을 유지하고 validated Contract/Workflow 이후 기존 admission/evidence 경로로 수렴한다. | M1에서 다룰 repo shape, Bootstrap 세부 scope. |
| D7 | source/runtime/protocol/Host/workspace identity를 receipt와 Evidence에 결합하고 incompatible protocol은 차단한다. | 허용 drift, warning/block 기준, 지원 version matrix. |
| D8 | 동일 승인 scope의 Repair는 새 immutable generation이며, scope·criterion·backend 변경은 revision을 요구한다. | M4 활성화 시점, generation limit, failure taxonomy와 no-progress threshold. |
| D9 | 파일·명령·backend·예산·기간을 고정한 bounded approval bundle을 허용한다. 위험 또는 범위 변경은 새 승인을 요구한다. | risk threshold, bundle 크기, 명령 allowlist, 시간·시도·비용 한도와 만료. |
| D10 | isolated Candidate 실행·검증, 승인된 destination apply, 적용 후 destination 검증을 별도 전이로 둔다. | candidate/destination 경로, apply 방식, 기존 승인에 delivery를 포함할 조건, drift 정책. |
| D11 | CodeFleet Controller가 readiness, reservation, dispatch와 successor 선택의 유일한 일정 결정 주체다. | MVP에서 Host Goal 완전 비활성 또는 bounded Turn 내부 보조 허용 여부. 기본 Proof는 비활성. |
| D12 | 기존 Attempt 불변성과 no-replay를 유지하고 기존 Store 안에서 generation-aware migration만 검토한다. | 복합키 또는 별도 table, migration/rollback 전략, schema activation 승인. |

위 오른쪽 열의 값은 설계 승인으로 채워지지 않는다. 각 값은 G0 잔여 결정 또는 이후 bounded WorkItem 승인으로 고정한다.

## 3. 책임 경계

| 주체 | 소유 | 소유하지 않음 |
| --- | --- | --- |
| 제품 소유자/Operator | 목표, risk policy, material scope, approval bundle, subjective acceptance | Agent 문자열로 대체되는 인증 |
| CodeFleet Task/Contract | versioned Objective, criteria, scope, commands, budget, delivery 조건 | Host model/tool permission |
| Controller | readiness, admission 요청, reservation, dispatch 순서, recovery, integration | 승인 생성, Evidence 승격 |
| Harness/Admission | approval, capability, Lease/fence, budget, scope, conflict 집행 | criterion 완화 |
| Codex App Server | Host thread/Turn, Host permission event, tool lifecycle와 result event | CodeFleet grant, Objective Judge |
| Candidate/Verifier | 실제 bytes/tree와 실행된 검증 결과 | Host/Agent 설명을 사실로 승격 |
| Judge | 현재 criterion과 Evidence authority에 따른 결과 | unseen effect, 제품 소유자 판단 |

## 4. Node/Edge와 Persist-before-advance

### 4.1 Node

Node는 bounded WorkItem이다. 최소한 다음에 결합된다.

- Objective/Task ID
- Contract revision/hash
- Workflow revision/hash
- stable WorkItem ID
- dependency IDs
- input artifact refs
- expected output refs
- file/resource/command scope
- criterion IDs와 required Evidence authority
- execution lane, budget와 approval reference

역할 이름이나 Host message는 별도 Agent 실행 또는 성공 증거가 아니다.

### 4.2 Edge

Edge는 단순 순서가 아니라 persisted prerequisite다.

- predecessor가 terminal이라는 사실만으로 만족하지 않는다.
- 현재 revision에 유효한 accepted outcome과 required Evidence가 필요하다.
- successor는 predecessor의 전체 chat이 아니라 최소 deterministic context manifest를 받는다.
- fan-in은 모든 필수 predecessor를 요구한다.
- revision change는 영향을 받는 edge와 Evidence eligibility를 다시 계산한다.

### 4.3 Persist-before-advance 불변식

1. 외부 effect 전에 reviewed request와 approval binding을 고정한다.
2. current approval, capability, revision, Lease, budget, conflicts와 workspace를 검사한다.
3. dispatch 전에 immutable Attempt identity와 `STARTED`를 transaction으로 예약한다.
4. dispatch intent를 Attempt, request, Host lane과 candidate workspace에 결합해 저장한다.
5. 예약 transaction 실패 시 Host Turn을 시작하지 않는다.
6. Host result만으로 WorkItem을 성공 처리하지 않는다.
7. 실제 Candidate와 Evidence를 durably 저장한 뒤 Judge를 실행한다.
8. `finish()`는 terminal Attempt, parent outcome와 event를 atomic하게 반영한다.
9. successor 선택 전에 persisted parent state와 current approval을 다시 읽는다.
10. duplicate wake-up은 authority가 아니며 새 effect를 자동 생성하지 않는다.

## 5. 선행 결과와 최소 Context 전달

다음 WorkItem의 context manifest는 다음만 포함한다.

- raw Objective ref
- current Contract/Workflow revision과 hashes
- WorkItem ID, dependencies와 criterion IDs
- accepted predecessor artifact/Evidence refs
- current candidate base/tree refs
- relevant failure Evidence와 repair hypothesis, 해당 시
- approval/capability refs와 남은 예산
- unresolved effects와 owner decisions

채팅 전체, compaction summary, Agent 주장 또는 stale proposal은 authority가 아니다. manifest 누락·hash mismatch·revision conflict는 영향받는 dispatch를 차단한다.

## 6. HostExecutionR3 — 논리 Protocol

현재 구현된 protocol이라는 주장이 아니라 App Server Proof와 이후 adapter가 만족해야 할 계약이다.

1. **Prepare:** exact WorkRequest와 context manifest를 content-addressed artifact로 저장한다.
2. **Admit:** current approval bundle, Host capability, Lease/fence, budget, workspace와 conflict를 검사한다.
3. **Reserve:** 기존 Store transaction에서 generation-aware Attempt identity를 예약한다.
4. **Dispatch intent:** request/Attempt/workspace/Host adapter/protocol version을 저장한다.
5. **Host Turn:** App Server가 실제로 제공하는 thread/turn/approval/tool/result IDs만 수집한다. 합성 ID는 금지한다.
6. **Result intake:** terminal status, request/Attempt/thread/workspace binding, cancellation과 scope를 검사한다.
7. **Candidate capture:** 실제 filesystem bytes, modes, rename/delete와 tree hash를 캡처한다.
8. **Verification:** 승인된 Local 또는 Protected backend에서 exact checks를 실행한다.
9. **Judge/finish:** current criterion과 Evidence를 판정하고 atomic finish를 수행한다.
10. **Continue/recover:** persisted state를 재조회해 successor, Repair, reconciliation 또는 handoff를 선택한다.

다음은 Proof 전까지 모두 `UNVERIFIED`다.

- App Server lifecycle method와 local schema의 정확한 version
- Host permission request/response mapping
- thread/turn result와 tool effect의 충분한 provenance
- process restart 뒤 thread resume
- disconnect/interruption 뒤 effect reconciliation
- chosen sandbox/workspace enforcement

## 7. Approval Bundle

승인 묶음은 최소 다음을 고정한다.

```text
contractRevision
workflowRevision
workItemIds
candidateWorkspace
destination
allowedFiles/resources
exactCommands
verificationBackend
riskClass
attempt/time/cost limits
validFrom/expires
deliveryIncluded
forbiddenEffects
```

같은 bundle에서 자동 계속할 수 있는 것은 모든 다음 WorkItem이 위 범위 안에 있고 현재 approval·Lease·budget이 유효할 때뿐이다.

다음 변화는 새 승인 또는 Contract revision을 요구한다.

- 위험등급 증가
- 파일·resource·command·network 범위 추가
- budget 또는 기간 증가
- candidate/destination 변경
- 새 delete/rename/mode/symlink 영향
- dependency installation, credential/secret 사용
- commit, push, PR, merge, deploy 또는 외부 message/service/data effect
- criterion 또는 required Evidence authority 변경

Host permission은 CodeFleet grant를 대체하지 않고, CodeFleet grant도 Host permission을 대체하지 않는다.

## 8. Candidate와 Delivery

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

- Candidate approval은 기본적으로 destination apply 권한이 아니다.
- 원래 bundle이 exact destination/base, manifest, apply 방식, drift stop, post-apply checks와 `deliveryIncluded=true`를 포함한 경우에만 같은 승인으로 apply할 수 있다.
- destination drift, dirty conflict 또는 scope change는 정지하고 새 결정을 요구한다.
- commit/push/deploy는 delivery에 암묵적으로 포함되지 않는다.
- Candidate PASS만 있는 경우 `VERIFIED_CANDIDATE_AVAILABLE`이다.
- apply 뒤 검증 전 상태는 `DELIVERED_NOT_VERIFIED`다.
- Objective Evidence는 최종 delivered tree에 결합해야 한다.

## 9. Recovery와 Host 재진입

### 9.1 활성 Host

Controller는 predecessor `finish()` commit 후 persisted state를 다시 읽고 다음 eligible WorkItem을 선택한다. Host Goal이나 App Server가 Workflow scheduling을 소유하지 않는다.

### 9.2 Host 부재

READY state와 refs를 보존한다. background compute, always-on daemon 또는 unattended execution을 약속하지 않는다.

### 9.3 Host 재진입

재개 전에 다음을 확인한다.

- current user instruction과 Contract/Workflow revision
- approval validity와 cancellation
- Lease/fence ownership
- Attempt generation과 terminal/unresolved 상태
- 남은 attempt/time/cost budget
- candidate/destination tree
- Host receipt와 uncertain effects
- Evidence/Judge refs

`STARTED` effect가 불확실하면 READY로 reset하거나 blind replay하지 않는다. authenticated Host query로 확정할 수 없으면 `RECONCILING` 또는 `HUMAN_HANDOFF`다. completed child와 valid Evidence가 있으면 새 Host Turn 없이 parent finish를 reconcile할 수 있다.

## 10. Repair Generation

Repair는 같은 Attempt 재실행이 아니다.

```text
failing Evidence
→ defect/transient/contract/infra/uncertain classification
→ scope + approval + budget + no-progress check
→ new immutable generation
→ new Host Turn
→ new Candidate
→ independent re-verification
→ new Evidence/Judge
```

### 10.1 보존할 불변식

- terminal Attempt rewrite 금지
- unresolved `STARTED` 뒤 새 generation 금지
- 이전 Evidence로 새 generation accept 금지
- expanded scope는 revision 요구
- repeated identical failure/no diff/no progress는 stop
- budget, Lease 또는 approval 상실 시 stop

### 10.2 D12 migration 수용 조건

- 기존 rows를 논리적 generation 1로 lossless하게 읽는다.
- childId, revision, status와 event 관계를 보존한다.
- current/latest/accepted generation 조회 의미가 명시된다.
- migration은 transaction이며 실패·rollback/read compatibility가 검증된다.
- 기존 fixture와 새 migration/negative fixture가 모두 필요하다.
- schema migration 성공은 실제 Repair acceptance가 아니다.

안전한 migration이 입증되지 않으면 `M4_DEFERRED`다.

## 11. Evidence와 Objective Judge

Evidence는 최소 다음에 결합된다.

- Objective/Task와 Contract revision
- Workflow/WorkItem과 Attempt generation
- Candidate/destination tree hash
- exact check identity와 command hash
- observer, backend와 authority
- output/exit/completeness
- criterion IDs
- environment/runtime identity

Judge 결과는 `COMPLETE`, `REPAIR`, `BLOCKED`, `INCOMPLETE`, `HUMAN_HANDOFF` 중 하나다.

- `PROVIDER_REPORTED_ONLY`는 verification을 만족하지 않는다.
- Local Evidence는 Protected requirement를 만족하지 않는다.
- missing/unrun/zero-item check는 PASS가 아니다.
- stale revision, candidate 또는 backend Evidence는 거부한다.
- subjective criterion은 owner review 또는 handoff가 필요하다.
- 모든 mandatory criterion이 실제 delivered tree에서 required authority로 충족될 때만 Objective를 `COMPLETE`로 한다.

## 12. 첫 vertical과 최종 MVP 수용

### 12.1 First Existing-Repository Vertical

작고 실제적인 existing repository Fixture에서 execution contract의 joined trace를 먼저 검증한다. Fixture를 확인하기 전에는 과제, file scope, commands, criteria와 backend를 승인된 값으로 만들지 않는다.

### 12.2 Todo+Calendar NEW_PROJECT

Todo+Calendar는 최종 Codex Single-Agent MVP 수용 목표다. owner-approved criterion matrix, NEW_PROJECT pre-HEAD Bootstrap, 실제 Host execution, destination materialization/reverification과 Objective Judge가 필요하다.

첫 vertical 성공은 Todo+Calendar 또는 전체 MVP acceptance가 아니다.

## 13. G0 잔여 결정표

실행 전에 반드시 값이 필요한 항목만 남긴다.

| ID | 필요한 값 | 필요한 시점 | 미결정 시 상태 |
| --- | --- | --- | --- |
| R1 | Host Protocol Proof fixture/repository와 허용 파일 | Proof 승인 전 | Proof `NOT_AUTHORIZED` |
| R2 | App Server command/config/transport와 지원 protocol version | Proof 승인 전 | Proof `NOT_AUTHORIZED` |
| R3 | Host account/usage boundary, Turn/time/cost budget | Proof 승인 전 | Proof `NOT_AUTHORIZED` |
| R4 | Proof에서 허용할 exact read/write/tool/approval actions | Proof 승인 전 | Proof `NOT_AUTHORIZED` |
| R5 | 첫 existing-repo E2E Fixture와 criterion/backend | M1 freeze 전 | M1 `BLOCKED` |
| R6 | M1 Git source baseline/branch/worktree | M1 freeze 전 | M1 `BLOCKED` |
| R7 | D2 risk classes와 Local/Protected matrix | 첫 effectful WorkItem 전 | execution `BLOCKED` |
| R8 | approval bundle의 scope/commands/budget/expiry | 각 effectful WorkItem 전 | dispatch `BLOCKED` |
| R9 | candidate/destination/apply semantics | M2 전 | delivery `BLOCKED` |
| R10 | runtime drift/version support policy | M2 전 | incompatible execution `BLOCKED` |
| R11 | PR #13 selective reuse file/field list | 해당 통합 WorkItem 전 | PR #13 reuse `DEFERRED` |
| R12 | Attempt migration representation과 rollback | M4 전 | M4 `DEFERRED` |
| R13 | Todo+Calendar final criterion/backend matrix | final MVP trial 전 | final MVP `BLOCKED` |

## 14. Host Protocol Proof 실행 승인 요청안

### 14.1 목적

실제 제품 기능을 구현하지 않고, 설치된 Codex App Server가 CodeFleet의 미래 adapter에 필요한 lifecycle을 제공하는지 bounded fixture에서 관측한다.

### 14.2 대상

- 제품 소유자가 선택한 별도 Fixture repository/workspace
- 제품 소유자가 고정한 Codex version과 App Server protocol
- 단일 managed thread와 단일 bounded Turn을 기본으로 하며 resume/approval 시나리오는 별도 case로 분리
- CodeFleet production State가 아닌 Proof 전용 state/artifact directory

### 14.3 허용 요청안

승인 시 다음을 정확히 채워야 한다.

```text
fixture:
source baseline:
candidate workspace:
destination: none | exact path
app-server command/config:
transport:
allowed files:
allowed commands/tools:
network policy:
approval cases:
turn limit:
time limit:
observable cost/usage limit:
validity window:
artifact destination:
cleanup policy:
```

별도 API key 생성·복사, credential 추출, 제품 source/State 변경, dependency installation, commit/push/PR/merge/deploy는 기본 요청에서 제외한다.

### 14.4 절차

1. source/runtime/App Server version과 config fingerprint를 기록한다.
2. fixture baseline/status와 allowed scope를 기록한다.
3. initialize 및 supported capability/schema를 관측한다.
4. thread를 시작하고 returned thread ID를 저장한다.
5. effect 없는 bounded Turn으로 terminal event와 result binding을 확인한다.
6. 별도 승인된 fixture write case에서 reservation-before-turn에 필요한 ordering과 tool events를 확인한다.
7. approval deny case가 effect 0인지 확인한다.
8. approval accept/resume case가 동일 pending action에 결합되는지 확인한다.
9. interrupted/disconnected case를 blind replay 없이 reconcile할 수 있는지 확인한다.
10. process restart 뒤 saved thread resume 가능 여부를 확인한다.
11. actual candidate bytes와 observed events를 receipt matrix에 기록한다.
12. 제품 source/State/Git이 변경되지 않았음을 확인하고 결과를 PASS/FAIL/BLOCKED/UNVERIFIED로 보고한다.

### 14.5 수용 기준

Proof PASS는 다음을 모두 요구한다.

- 실제 thread/turn identity가 안정적으로 관측됨
- terminal completed/failed/interrupted가 구분됨
- approval request와 response가 exact action/turn에 결합됨
- deny가 허용된 관측 범위에서 effect 0을 보임
- result와 tool events를 request/turn/workspace에 결합 가능함
- disconnect/restart 후 uncertain effect를 blind replay하지 않음
- existing Host authentication을 사용하며 별도 API key가 필요하지 않음
- Controller가 scheduling authority를 유지할 수 있음
- fixture 밖 effect가 없거나, enforcement를 증명하지 못한 경우 정확히 `UNPROTECTED/UNVERIFIED`로 제한됨
- 실제 명령, 종료 상태, 누락 event와 사용량이 정직하게 기록됨

어느 필수 항목이 없으면 전체 Proof를 PASS로 표시하지 않는다. method 존재, help 출력, schema 생성, Skill discovery 또는 model summary만으로 PASS가 아니다.

### 14.6 Proof 이후에도 자동으로 승인되지 않는 것

- CodeFleet adapter 구현
- M1 source edits
- public execution admission
- Protected verification
- destination delivery
- production repository 사용
- Todo+Calendar E2E

## 15. 구현 착수 차단 요소

현재 다음이 남아 있으므로 M1 구현은 시작할 수 없다.

1. Host Protocol Proof 미실행·미수용
2. 첫 Fixture와 criterion/backend 미선택
3. Git 기준선/branch/worktree 미선택
4. M1 exact file/function scope와 검증 명령 미승인
5. M1 Host/model budget 및 approval bundle 미승인
6. D2 risk matrix 미정
7. 제품 소유자의 별도 `M1_IMPLEMENTATION_AUTHORIZED` 없음

## 16. 변경 통제

- R3 변경은 승인된 설계 원칙, 미확정 parameter 또는 Evidence 상태 중 무엇을 바꾸는지 명시한다.
- 실행 parameter 승인은 해당 bounded WorkItem에만 적용한다.
- Host Protocol Proof 결과는 날짜·source/runtime/protocol/fixture와 결합한다.
- 실패와 `UNVERIFIED`를 과거 문서에서 삭제하지 않는다.
- PR #13은 exact selective integration 승인 없이는 병합·cherry-pick하지 않는다.
- 문서 승인으로 테스트, 모델 Turn, Runtime/State 변경 또는 Git 작업을 수행하지 않는다.

