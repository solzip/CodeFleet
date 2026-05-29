# CodeFleet Session Handoff

마지막 업데이트: 2026-05-29

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
최종 모델 / 개념 설계: 약 60-65%
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
Project Profile 최종 스키마
```

이유:

```text
Project Profile은 다음 정책들의 source of truth 중 하나다.

- risk rules
- file allow / deny policy
- command allow / deny policy
- Harness mode defaults
- AgentRole allowlist
- verification allowlist
- redaction / sanitization policy
- carry-forward audit / recheck policy
```

먼저 확정할 규칙:

```text
FINAL RULE:
Project Profile is the source of truth for workspace policy.
Project Profile must not store runtime state, execution evidence, or user decision history.
```

그다음 top-level schema를 확정한다.

```text
.codefleet/config.json

schemaVersion
project
workspace
defaults
policies
  risk
  files
  commands
  verification
  redaction
  carryForward
  agentRoles
references
localPolicy
```

각 block은 같은 기준으로 확정한다.

```text
sourceOfTruth
inputs
preconditions
condition
allowedEffect
deniedEffect
evidence
failureFinding
```

## 남은 설계 항목

```text
1. Project Profile final JSON schema
2. Harness enforcement details
3. AgentRole taxonomy
4. Guardrail taxonomy
5. Verification execution policy
6. Run Summary export adapter schema
7. Workspace discovery
8. Review model
9. v0.1 / v0.2 / final implementation slicing
```

## 저장소 메모

다른 PC에서 이어갈 때는 GitHub에 commit / push된 파일만 기준으로 본다. 로컬 untracked 파일은 handoff 기준이 아니다.

핵심 기준 문서:

```text
docs/concept-foundation.md
```

이 handoff 작성 직전 기준 커밋:

```text
890af3a docs: reinforce final rule criteria across concept model
```
