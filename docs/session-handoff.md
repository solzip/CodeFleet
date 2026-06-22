# CodeFleet Session Handoff

마지막 업데이트: 2026-06-22

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

바로 다음 논의 주제는 run-summary.json / VerificationEvidence / local review artifact layout이다.
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
- `docs/final-model-architecture.md`는 architecture snapshot을 읽는 방법과 각 layer의 책임을 설명한다.
- Local Overlay는 `.codefleet/local.json`이며 `RESTRICT_ONLY`로만 병합된다.
- 목표 루프 기준 우선순위는 S2 Adapter seam -> S4 Review record -> S3 Verification seam -> S1 Task Spec 최소 schema -> run-plan.json -> S2 artifact layout 순서로 먼저 고정했고, 현재 다음 병목은 run-summary.json / VerificationEvidence / local review artifact layout이다.
- S2 Adapter seam 최종 계약은 `AdapterRequest -> AgentAdapter -> AdapterResult`로 고정했다.
- AdapterRequest와 AdapterResult는 provider-agnostic Run Trace Evidence artifact이며, adapter output은 evidence이지 final decision이 아니다.
- Codex adapter는 최종 아키텍처 자체가 아니라 S2 최종 계약 아래의 첫 concrete transport 구현으로 취급한다.
- AdapterRequest와 AdapterResult는 Run Directory 안의 Run Trace Evidence artifact로 저장되어야 하며, Review Decision / VERIFIED / Objective Queue progression을 직접 만들 수 없다.
- AdapterResult는 provider execution report일 뿐이며 changed-files truth, command execution truth, policy violation truth를 소유하지 않는다.
- HarnessObservation을 Run Trace Evidence durable artifact로 추가하고, changed files / diff / command log / policy violation evidence의 권위는 Execution Harness가 소유하도록 고정했다.
- Core normalizer는 AdapterResult 단독이 아니라 AdapterResult + HarnessObservation + verification evidence를 기준으로 Run Summary를 계산한다.
- S2 Run attempt lifecycle을 고정했다. AdapterRequest 생성까지 도달한 모든 Run attempt는 AdapterRequest, HarnessObservation, AdapterResult 또는 synthetic AdapterResult 세 artifact를 반드시 남긴다.
- Adapter failure는 HarnessObservation을 지우지 않고, Harness observation failure는 AdapterResult를 지우지 않는다. 두 artifact는 서로 대체할 수 없다.
- preRunStateRef와 postRunStateRef는 HarnessWorkspaceSnapshot을 참조하도록 고정했다.
- HarnessWorkspaceSnapshot은 git status, git diff, scoped file snapshot, state hash를 역할별로 분리한다. git status는 changed-file list evidence, git diff는 human-reviewable content evidence, scoped file snapshot은 Git이 놓치는 파일과 path policy evidence, state hash는 integrity / replay / corruption evidence다.
- Run delta는 postRunState - preRunState로 해석한다. pre-run workspace가 clean일 필요는 없다.
- Command observation authority를 NONE / PROVIDER_REPORTED_ONLY / HARNESS_OBSERVED / HARNESS_EXECUTED로 분리했다.
- Command truth는 HARNESS_OBSERVED 또는 HARNESS_EXECUTED에서만 나온다. Provider transcript와 AdapterResult providerReportedCommands는 degraded evidence / hint이며 command policy compliance, verification evidence, VERIFIED 계산을 만족시킬 수 없다.
- final에서 commandExecution=true이면 Harness-visible command channel이 필요하다. 없으면 기본 block이고, explicit degraded policy가 있을 때만 HIGH 이상 risk + human resultReview + automatic VERIFIED 금지 조건으로 진행할 수 있다.
- PathPolicyEvaluation은 HarnessWorkspaceSnapshot pre/post delta에서 나온 각 path change를 기준으로 계산한다.
- 모든 path는 workspace-relative normalized path로 평가하고, deniedPaths는 allowedPaths보다 항상 우선한다.
- symlink는 link path와 target realpath를 모두 검사한다. generated / untracked / gitignored 파일도 path policy 대상이다.
- delete는 source path를 검사하고, rename은 source와 target을 모두 검사한다.
- case-insensitive filesystem에서는 case-folded comparison key로 match하되 원본 casing을 evidence로 보존한다.
- nested repo / submodule 변경은 explicit allow 없이는 차단한다.
- S2 v0.2 Codex transport slice는 VERSION_PLAN으로 정의했다. final S2 계약 자체가 아니라 첫 concrete transport 구현이다.
- v0.2 Codex slice는 prompt stdin, local adapter command/args, stdout/stderr capture, git status/diff 기반 최소 HarnessWorkspaceSnapshot, HarnessObservation, AdapterResult를 만든다.
- v0.2 Codex slice는 sandbox enforcement, command proxy, full path policy enforcement, provider transcript truth, automatic VERIFIED를 제공하지 않는다.
- v0.2에서 command channel이 Harness-visible이 아니면 command authority는 NONE 또는 PROVIDER_REPORTED_ONLY이고, verification / command compliance / automatic VERIFIED를 만족할 수 없다.
- S4 Review record 최소 형태를 고정했다. 최종 source of truth는 run-local note가 아니라 Objective ledger의 RUN_REVIEW_DECIDED durable decision event다.
- ReviewEvidenceBundle은 decision 시점에 reviewer가 본 RunSummary, AdapterRequest, AdapterResult, HarnessObservation, HarnessWorkspaceSnapshot, verification evidence, findings, computedRisk, commandEvidenceAuthority, pathViolationSummary를 frozen refs/hash로 묶는다.
- RUN_REVIEW_DECIDED는 reviewEvidenceBundleRef와 reviewEvidenceBundleHash를 필수로 가진다. Review Decision은 Run Trace Evidence를 수정하지 않고 DONE / FAILED / VERIFIED / NEXT / Queue State를 직접 쓰지 않는다.
- decision values는 ACCEPTED / REJECTED / NEEDS_CHANGES만 사용한다. RETRY는 Review Decision value가 아니라 새 Run request / Run Options의 retry reason이다.
- VERIFIED는 최신 effective RUN_REVIEW_DECIDED(ACCEPTED) + verificationGateResult SATISFIED 또는 WAIVED_ALLOWED + successful normalized Run result에서 계산한다.
- S4 v0.2 manual review slice는 VERSION_PLAN이다. Objective ledger가 아직 없으면 run-local review-decision artifact를 둘 수 있지만 final architecture로 취급하지 않는다.
- ReviewEvidenceBundle 저장 위치는 `.codefleet/reviews/<reviewDecisionId>/evidence-bundle.json`로 고정했다. Objective ledger event에는 inline하지 않고 ref/hash로 참조한다.
- RUN_REVIEW_DECIDED는 reviewDecisionId를 가지며, supersede / invalidate는 기존 이벤트 수정이 아니라 새 event의 supersedesReviewDecisionId / invalidatesReviewDecisionId 참조로 표현한다.
- latest effective Review Decision은 objectiveQueueItemId + taskId + taskRevision 단위에서 valid actor, valid ReviewEvidenceBundle, not invalidated, latest ledger order로 계산한다.
- REJECTED는 실행 결과가 잘못됐거나 허용 불가함을 뜻하고, NEEDS_CHANGES는 미완료 또는 추가 수정 필요를 뜻한다. 둘 다 VERIFIED 불가지만 follow-up planning 의미가 다르다.
- raw evidence absent는 EVIDENCE_ABSENT warning으로 과거 decision을 자동 무효화하지 않는다. ReviewEvidenceBundle 또는 referenced artifact hash mismatch는 REVIEW_INTEGRITY failure이며 해당 decision을 ineffective로 만든다.
- v0.2 local review artifact 경로는 `.codefleet/runs/<runId>/review-decision.local.json`이며 final decision truth가 아니라 Objective ledger migration input이다.
- S3 VerificationEvidence는 Run Trace Evidence의 Harness-owned artifact다.
- observedCheck는 PASS / FAIL / SKIP / NONE이고 VerificationEvidence에서 파생한다.
- verificationGateResult는 SATISFIED / NOT_SATISFIED / WAIVED_ALLOWED이고 CodeFleet이 requiredGates.verification, observedCheck, waiver policy로 계산한다.
- provider-reported verification은 degraded evidence / review hint이며 observedCheck PASS source가 될 수 없다.
- v0.2 prompt-only verification은 VERSION_PLAN이고, Harness-visible evidence가 없으면 required verification을 SATISFIED로 만들 수 없다.
- S1 Task Revision minimum contract를 고정했다. Task Revision은 source-only immutable execution contract이고 S2/S3/S4가 공유하는 최소 입력이다.
- Task Revision.scope.targetPaths는 allowedPaths candidate이고, scope.excludedPaths + guardrails.doNotTouch는 deniedPaths candidate다. 최종 allowedPaths / deniedPaths는 Run Plan / AdapterRequest capabilities에서 effectivePolicy로 파생된다.
- Task Revision.verification.commands는 verificationPlan candidate이며 command permission이 아니다.
- CodeFleet durable file map을 고정했다. Project Profile, Objective ledger/snapshot, Task lineage/revision, Run Plan, Run Trace, Run Summary, VerificationEvidence, ReviewEvidenceBundle은 목적이 다른 required durable artifacts다.
- `run-plan.json`은 프로젝트 전체 계획이 아니라 특정 Run의 derived execution snapshot / resume boundary다.
- `run-plan.json`은 Run Planning 성공 후 AdapterRequest 생성 전에 저장되고 hash가 확정된다. 이 전에는 AgentAdapter를 실행할 수 없다.
- `run-plan.json`은 sourceRefs, Run Options snapshot, workspace snapshot, selectedAgentAdapter, effectivePolicy, computedRisk, isolation, verificationPlan, artifactPlan, resume policy를 가진다.
- 다른 로컬에서 resume할 때 Task Revision hash와 Project Profile hash는 일치해야 하며, Local Overlay와 adapter availability는 같은 Run Plan 기준으로 재검증한다. 재검증은 권한을 넓힐 수 없다.
- AdapterRequest / HarnessObservation / AdapterResult 최소 artifact layout을 고정했다. AdapterRequest는 AgentAdapter 실행 전 존재해야 하고, HarnessObservation은 AdapterRequest 생성에 도달한 모든 Run attempt에 존재해야 하며, AdapterResult는 structured 또는 synthetic으로 존재해야 한다.
- HarnessObservation의 일부 evidence가 없으면 artifact를 생략하지 않고 unavailableReason을 기록한다. AdapterResult provider-reported observations는 degraded evidence다.
- 프로젝트/목표 진행 방향은 `.codefleet/objectives/<objectiveId>/ledger.jsonl`과 `objective.json`이 담당한다.
- durable file은 lifecycle 단계에 도달하면 반드시 남아야 한다. 단, durable은 반드시 git commit된다는 뜻이 아니며 공유 / redaction / export 정책은 별도다.
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
run-summary.json / VerificationEvidence / local review artifact layout
```

이유:

```text
목표 루프 관점에서 S2 Adapter seam 최종 계약을 먼저 고정했다.
S2는 AdapterRequest -> AgentAdapter -> AdapterResult 계약이며, AdapterRequest와 AdapterResult는 Run Trace Evidence durable artifact다.
S2 증거 권위는 AdapterResult가 아니라 HarnessObservation에 있다. AdapterResult의 provider-reported observations는 참고 정보이고, diff / changed-files / command evidence / policy violation truth는 Execution Harness가 직접 관측한다.
S2 Run attempt lifecycle도 고정했다. AdapterRequest 생성 이후에는 실패하더라도 AdapterRequest, HarnessObservation, AdapterResult 또는 synthetic AdapterResult가 남아야 한다.
preRunStateRef / postRunStateRef의 실체는 HarnessWorkspaceSnapshot으로 고정했다.
command observation의 진실성도 고정했다. Command truth는 Harness-visible channel에서만 나오고, provider-reported commands는 degraded evidence다.
S2 v0.2 Codex transport slice도 VERSION_PLAN으로 명시했다. v0.2는 final 계약을 약화하지 않고, command/path evidence가 부족한 부분은 unavailable 또는 degraded로 기록한다.
S4 Review record 최소 형태도 고정했다. RUN_REVIEW_DECIDED는 Objective ledger durable decision event이고, ReviewEvidenceBundle을 필수 참조한다.
S3 Verification seam도 고정했다. VerificationEvidence는 Run Trace Evidence의 Harness-owned artifact이고, observedCheck / verificationGateResult의 직접 입력이다.
provider-reported verification은 degraded evidence이며 observedCheck PASS source가 될 수 없다.
v0.2 prompt-only verification은 final 계약 아래의 VERSION_PLAN이고, Harness-visible evidence가 없으면 required verification을 SATISFIED로 만들 수 없다.
S1 Task Spec 최소 schema도 고정했다. Task Revision은 source-only immutable execution contract이고, Run Plan / AdapterRequest / VerificationEvidence / ReviewEvidenceBundle의 공통 입력이다.
Durable file map도 고정했다. 프로젝트 정책은 `.codefleet/config.json`, 프로젝트/목표 진행 방향은 `.codefleet/objectives/<objectiveId>/ledger.jsonl`과 `objective.json`, 개별 작업 계약은 Task Revision, 개별 실행 계획은 `run-plan.json`, 실행 증거는 Run Trace Evidence, 정규화 요약은 `run-summary.json`, 검토 판단 context는 ReviewEvidenceBundle이 담당한다.
run-plan.json 최소 필드와 resume boundary도 고정했다.
AdapterRequest / HarnessObservation / AdapterResult 최소 artifact layout도 고정했다. 다음 병목은 run-summary.json / VerificationEvidence / local review artifact layout이다.

- run-summary.json / VerificationEvidence / local review artifact layout
- 한 바퀴 수동 검증에 필요한 최소 CLI flow
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
6. Verification execution policy implementation
7. Run Summary export adapter schema
8. Workspace discovery
9. Review model
10. v0.1 / v0.2 / final implementation slicing
```

목표 루프 기준 남은 우선순위:

```text
1. run-summary.json / verification evidence / local review artifact layout
2. 최소 CLI flow
3. SPINE 한 바퀴 수동 검증
4. S5 Run Summary / Export seam
5. defaults.run.isolationMode
6. policy block internal schema
7. Harness enforcement details
8. AgentRole / Guardrail taxonomy
9. Workspace discovery
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
