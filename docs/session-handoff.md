# CodeFleet Session Handoff

마지막 업데이트: 2026-06-02

이 문서는 다른 PC나 새 세션에서 CodeFleet 설계 논의를 이어가기 위한 압축 인계 문서다. 원본 기준 문서는 항상 `docs/concept-foundation.md`다.

## 읽는 순서

```text
1. docs/concept-foundation.md
2. docs/session-handoff.md
3. docs/architecture.md는 현재 구현 구조 참고용으로만 확인
4. README는 현재 사용자용 CLI 사용법 참고용으로만 확인
```

구현부터 시작하지 않는다. 먼저 최종 목표, 목표 경계, 현재 확정 규칙을 확인한 뒤 이어간다.

## 새 세션 시작 문장

다음 PC나 새 세션에서는 아래 문장으로 시작한다.

```text
이 레포의 docs/concept-foundation.md와 docs/session-handoff.md를 먼저 읽고,
지금까지 합의한 CodeFleet 개념을 이어서 논의하자.
결정될 때마다 문서에 반영하고 커밋 후 push해줘.

중요 기준:
- 모든 FINAL RULE은 구체적이어야 한다.
- 모든 FINAL RULE은 deterministic / machine-checkable 해야 한다.
- 모든 FINAL RULE은 sourceOfTruth, inputs, preconditions, condition, allowedEffect, deniedEffect, evidence를 가져야 한다.
- 사람이나 LLM의 감, 추론, 추측으로 판정하지 않는다.
- 아직 확정되지 않은 내용은 DESIGN CANDIDATE 또는 VERSION_PLAN으로 분리한다.

바로 다음 논의 주제는 Project Profile 최종 스키마다.
```

## 제품 정의

```text
CodeFleet은 사용자의 개발/운영 Objective를 하나 이상의 Task로 구조화하고,
백엔드/인프라 작업을 역할·범위·가드레일·검증 조건이 포함된 Task로 정의하며,
사람이 승인한 Task를 AI 에이전트에게 역할 기반으로 위임하고,
실행 결과를 로그·diff·테스트·리뷰 기준으로 추적하는
AI-native 개발 오케스트레이션 CLI다.
```

목표 경계:

```text
- Jira / Notion 대체재가 아니다.
- 중앙 작업 DB가 아니다.
- 웹 대시보드가 아니다.
- CI/CD 대체재가 아니다.
- 배포 자동화 플랫폼이 아니다.
- Secret manager가 아니다.
- 완전한 샌드박스가 아니다.
- 범용 에이전트 OS가 아니다.
```

## 현재 진행도

```text
최종 모델 / 개념 설계: 약 65-70%
구현 진행도: 약 10-20%
```

완료 또는 대부분 확정된 항목:

```text
- 최종 목표와 목표 경계
- Objective / Task / Run 계층
- Task Draft / Revision / Run 분리
- Objective Queue와 ledger 모델
- Mutation Engine 역할과 lock 원칙
- 상태 도메인 7개
- Objective State
- Queue Item State
- Task Relation State
- Task Draft / Revision State
- Run-derived State
- Risk는 CodeFleet policy 계산 결과라는 원칙
- Context Carry-forward State
- Corruption / Finding / Severity / Category / Scope / Marker
- RepairKind / RepairMode
- Corrective Event effective state
- 확정 규칙 작성 기준
- 구체적 / 결정론적 / 전제 / 증거 기반 규칙 기준
```

최근 보강한 항목:

```text
- Risk는 max-severity 계산을 사용한다.
- Risk lowering은 Project Profile의 explicit exemption으로만 가능하다.
- Carry-forward discard / rejected event / risk recheck 조건을 결정론적으로 분리했다.
- Policy merge는 deterministic meet operation이다.
- Safe Orchestration은 isolationMode를 기록한다.
- 파일 수정 또는 명령 실행이 있는 Run에서 isolationMode == NONE이면 LOW risk가 될 수 없다.
- Bounded discovery는 budget과 read allow / deny 조건을 가진다.
- Run Summary sanitization은 최소 필드, 금지 내용, redactionReport, 실패 효과를 가진다.
- FINAL RULE / DESIGN CANDIDATE / EXAMPLE / VERSION_PLAN을 분리했다.
- FINAL RULE 최소 필드에 evidence를 명시했다.
- Project Profile은 `.codefleet/config.json`에 저장되는 공유 가능한 Workspace Policy Contract로 정리했다.
- Project Profile 주변 구조는 `config.json`, `local.json`, `context/`, `templates/`로 분리했다.
- Project Profile top-level keys와 policies block keys를 FINAL RULE로 고정했다.
- Project Profile에는 project block이 정확히 하나만 존재한다.
- project는 논리적 제품 / 시스템 identity이며 권한을 직접 부여하지 않는다.
- workspace는 현재 Project Profile이 통제하는 하나의 로컬 repo/root 경계다.
- workspace는 `id`, `name`, `components`, `sharedPaths`를 가진다.
- workspaceRoot 계산과 path normalization은 config 필드가 아니라 CodeFleet Core invariant다.
- monorepo는 하나의 Project Profile과 여러 components로 표현한다.
- multirepo는 같은 project.id를 공유하는 여러 Project Profile로 표현한다.
- Project Profile은 sibling repo 목록, sibling repo path, local clone path를 저장하지 않는다.
- 최종 모델의 정책 / 계약 계층은 6단계로 정리했다.
- 최종 모델의 실행 생명주기는 10단계로 정리했다.
- Source of Truth / Derived Artifact / Evidence Truth / Decision Record 경계를 고정했다.
- Draft만 mutable이고 Revision / Run Trace는 직접 수정하지 않는다.
- Run Plan은 source of truth가 아니라 derived execution contract다.
- effectivePolicy는 Run Plan 내부의 capability / risk / gate policy snapshot이며 Run Plan 전체가 아니다.
- defaults.task.agentRole은 concrete AgentRole 또는 REQUIRE_EXPLICIT을 허용한다.
- defaults.task.harnessMode는 concrete HarnessMode 또는 REQUIRE_EXPLICIT을 허용한다.
- defaults.task.requiredGate 단일 필드는 사용하지 않고, defaults.task.requiredGates object를 사용한다.
- defaults.task.requiredGates는 runApproval / resultReview / verification 3개 dimension으로 분리한다.
- defaults.task.requiredGates는 PROFILE_DEFAULTS_REQUIRED_GATES_SCHEMA, TASK_REVISION_REQUIRED_GATES_ARE_CONCRETE, EFFECTIVE_REQUIRED_GATES_MERGE_BY_DIMENSION FINAL RULE로 고정했다.
- BLOCKED_UNTIL_POLICY는 defaults 값이나 risk rule 최소 필드가 아니라 Run Planning에서 계산되는 derived planning block result다.
- defaults.task.workflow는 WorkflowStage 절차 템플릿이며 PLAN / INSPECT / APPLY / VERIFY / REVIEW를 사용한다.
- defaults.task.workflow는 PROFILE_DEFAULTS_TASK_WORKFLOW_SCHEMA, TASK_WORKFLOW_IS_DRAFT_TEMPLATE_NOT_EXECUTION_POLICY FINAL RULE로 고정했다.
- defaults.task.workflow는 권한, gate, RunSummary.type, Execution Lifecycle을 대체하지 않는다.
- defaults.run.agentAdapter는 A+ 구조로 정리했다. 기본 선택값, 프로젝트 adapter allowlist, local availability, Run Plan selectedAgentAdapter / adapterResolution을 분리한다.
- policies.agentAdapters를 first-class policy block으로 추가했다.
- provider-specific command/path/token/model/CLI option/transcript parsing rule은 Project Profile에 저장하지 않는다.
- REQUIRE_EXPLICIT은 config 수정 요구가 아니라 Task Draft / Review / Approval 흐름에서 사용자에게 concrete value를 객관식으로 선택하게 하는 요구다.
- 하나의 설계 항목이 결정될 때마다 `docs/concept-foundation.md`에 즉시 반영하고, 다음 세션 연결 정보는 `docs/session-handoff.md`에 함께 갱신한다.
- 큰 설계 틀이 확정될 때마다 architecture snapshot 이미지를 생성해 `docs/assets/`에 저장하고, 문서에서 참조한다.
- Local Overlay는 `.codefleet/local.json`이며 `RESTRICT_ONLY`로만 병합된다.
```

## 현재 규칙 기준

모든 FINAL RULE은 다음 필드를 가져야 한다.

```text
ruleId
status
scope
sourceOfTruth
inputs
preconditions
condition
allowedEffect
deniedEffect
evidence
failureFinding
repairBehavior
```

검증 원칙:

```text
same workspace state
+ same CodeFleet version
+ same Project Profile
+ same validation rule set
= same validation result
```

금지:

```text
- LLM이 corruption 여부를 결정
- 사람의 감으로 corruption 여부를 결정
- 누락된 event 추측
- 사용자 intent 추측
- corruption reason 추론
- category 추측
- severity 추측
- LLM 또는 일반 human review로 risk 낮추기
```

## 바로 다음 작업

다음 논의 주제:

```text
Project Profile defaults.run.isolationMode 세부 스키마
```

이유:

```text
Project Profile의 schemaVersion, project, workspace 경계는 확정했다.
defaults 논의 전에 최종 모델 계층, 실행 단계, source/derived/evidence/decision 경계도 확정했다.
다음은 Task가 생략했을 때 적용되는 defaults block을 FINAL MODEL 기준으로 확정해야 한다.
defaults는 flat 구조가 아니라 `defaults.task`와 `defaults.run`으로 분리하는 방향으로 정리했다.
defaults.task.agentRole, defaults.task.harnessMode, defaults.task.requiredGates의 REQUIRE_EXPLICIT 처리 원칙은 정리했다.
defaults.task.workflow의 절차 템플릿 원칙도 정리했다.
defaults.run.agentAdapter의 A+ 구조도 정리했다.
다음은 Run Planning에서 어떤 isolationMode를 기본 선택할지 정해야 한다.

- defaults.run.isolationMode
```

현재 확정한 Project Profile 구조:

```text
.codefleet/config.json

schemaVersion
project
workspace
  id
  name
  components
  sharedPaths
defaults
  task
  run
policies
  harness
  agentAdapters
  files
  commands
  risk
  verification
  redaction
  carryForward
  agentRoles
references
localPolicy
```

확정한 Project Profile 구조 규칙:

```text
- PROFILE_CONFIG_IS_WORKSPACE_CONTRACT
- PROFILE_TOP_LEVEL_KEYS_FIXED
- PROFILE_POLICY_BLOCK_KEYS_FIXED
- PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE
- PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY
- PROFILE_EFFECTIVE_POLICY_IS_DERIVED
```

각 policy block은 같은 기준으로 확정한다.

```text
sourceOfTruth
inputs
preconditions
condition
allowedEffect
deniedEffect
evidence
failureFinding
repairBehavior
```

## 남은 설계 항목

```text
1. Project Profile defaults.run.isolationMode internal schema
2. Project Profile policy block internal schema
3. Harness enforcement details
4. AgentRole taxonomy
5. Guardrail taxonomy
6. Verification execution policy
7. Run Summary export adapter schema
8. Workspace discovery
9. Review model
10. v0.1 / v0.2 / final implementation slicing
```

## 저장소 메모

다른 PC에서 이어갈 때는 GitHub에 commit / push된 파일만 기준으로 본다. 로컬 untracked 파일은 handoff 기준이 아니다.

핵심 기준 문서:

```text
docs/concept-foundation.md
```

이 handoff의 기준 커밋:

```text
이 문서를 포함한 최신 push 커밋. 커밋 전 로컬 변경은 다른 PC에서 이어갈 기준이 아니다.
```
