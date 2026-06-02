# CodeFleet 최종 모델 아키텍처

이 문서는 CodeFleet 최종 모델의 현재 설계 진행도를 설명한다.
최종 규칙의 source of truth는 `docs/concept-foundation.md`다.

![CodeFleet Final Model - Current Design Progress](assets/codefleet-final-model-progress.svg)

과거 진행도 snapshot은 히스토리 참고용으로만 `docs/assets/archive/` 아래에 보관한다.

## 그림 읽는 법

이 그림은 규칙 원본이 아니라 현재 설계 진행도를 빠르게 파악하기 위한 지도다. 구조를 빠르게 이해할 때는 이 문서를 보고, FINAL RULE의 세부 조건은 `docs/concept-foundation.md`를 기준으로 본다.

색상 의미:

- 초록색: 대부분 정의됨
- 주황색: 진행 중
- 회색: 아직 세부화되지 않음
- 파란색: source of truth가 아닌 derived artifact

## Layer 1: Workspace Policy Contract

Layer 1은 `.codefleet/config.json`에 저장되는 공유 Project Profile을 보여준다.

Project Profile은 workspace policy contract다. 커밋하고 리뷰할 수 있는 공유 설정을 담는다. runtime evidence, 로컬 머신 path, provider token, command path, raw log, diff, 개인 adapter 설정은 저장하지 않는다.

각 block의 책임:

- `schemaVersion`: Project Profile schema와 validation rule set을 선택한다.
- `project`: 논리적 제품 또는 시스템을 식별한다. 권한을 부여하지 않는다.
- `workspace`: local repo/root 경계, components, shared paths를 정의한다. 권한을 부여하지 않는다.
- `defaults`: Task 또는 Run에서 빠진 선택값을 채운다. defaults는 policy가 아니며 policy를 override할 수 없다.
- `policies`: workspace가 허용하거나 차단하는 것을 선언한다. `agentAdapters`는 first-class policy block이다.
- `references`: context/template 파일을 가리킨다. 긴 지식 문서 본문을 직접 넣지 않는다.
- `localPolicy`: local overlay의 허용 형태를 선언한다. local overlay는 restrict-only다.

핵심 규칙:

```text
Project Profile은 공유 policy와 defaulting input이다.
runtime state, local environment state, execution evidence가 아니다.
```

## Layer 2: Policy / Contract Lifecycle

Layer 2는 source contract와 derived execution artifact를 분리한다.

흐름:

```text
Core Invariants
  -> Project Profile
  -> Local Overlay
  -> Task Draft
  -> Task Revision
  -> Run Plan
```

`Project Profile`, `Local Overlay`, `Task Draft`, `Task Revision`은 source input이다. `Task Draft`는 승인 전까지 수정 가능하고, `Task Revision`은 승인 이후 불변이다.

`Run Plan`은 derived artifact다. 특정 Run을 위해 selected Task Revision, Project Profile defaults/policies, Local Overlay, Run Options를 기준으로 계산된다. Run Plan은 evidence를 위해 snapshot이나 hash를 기록할 수 있지만 source input을 수정하지 않는다.

가장 중요한 경계:

```text
Run Plan은 derived execution contract다.
effectivePolicy는 Run Plan 내부의 policy snapshot이다.
effectivePolicy는 Run Plan 전체가 아니다.
```

예를 들어 selected `agentAdapter`, selected `isolationMode`, retry reason, selected Task Revision은 Run Plan field일 수 있지만 `effectivePolicy` 자체는 아니다.

## Layer 3: Execution Lifecycle

Layer 3은 최종 모델의 실행 생명주기를 보여준다.

```text
Intent
  -> Objective
  -> Task Draft
  -> Review / Approval
  -> Task Revision
  -> Queue / Scheduling
  -> Run Planning
  -> Harness Execution
  -> Evidence / Verification
  -> Review / Close
```

이 생명주기는 `defaults.task.workflow`로 대체되지 않는다. workflow default는 Task Draft procedure template일 뿐이고, 실행 생명주기는 system-level orchestration path로 유지된다.

주요 분리:

- `Task Draft`: 수정 가능한 후보 계약
- `Review / Approval`: 사람의 결정 지점
- `Task Revision`: 승인된 불변 실행 계약
- `Run Planning`: Run Plan, effective policy, risk, gates, adapter selection, isolation, verification plan을 계산
- `Harness Execution`: Run Plan 경계 안에서 selected AgentAdapter를 호출
- `Evidence / Verification`: stdout, stderr, diff, changed files, command logs, verification result를 기록
- `Review / Close`: decision event를 기록한다. Run Trace를 다시 쓰지 않는다.

## Run Plan Panel

오른쪽 패널은 주요 Run Plan field를 보여준다.

Run Plan에 포함되는 것:

- selected Task Revision
- selected `agentAdapter`
- selected `isolationMode`
- Run Options snapshot
- `effectivePolicy`
- computed risk
- required gates
- verification plan

`selectedAgentAdapter`는 A+ 모델로 resolution된다.

```text
defaults.run.agentAdapter
  + policies.agentAdapters.allowedAdapters
  + local adapter availability
  + optional Run Options override
  -> RunPlan.selectedAgentAdapter
  -> RunPlan.adapterResolution
```

이 구조는 네 가지 의미를 분리한다.

- default selection
- project policy allowlist
- local machine availability
- final Run selection evidence

adapter command path, token, model choice, provider-specific CLI option, transcript parsing rule은 Project Profile에 넣지 않는다.

## Defaults 진행도

하단 band는 현재 `defaults` 논의 진행도를 보여준다.

완료된 task defaults:

- `defaults.task.agentRole`
- `defaults.task.harnessMode`
- `defaults.task.requiredGates`
- `defaults.task.workflow`

완료된 run defaults:

- `defaults.run.agentAdapter`

남은 run defaults:

- `defaults.run.isolationMode`

기준 규칙:

```text
defaults는 빠진 선택값을 채운다.
policies는 무엇이 허용되는지 결정한다.
Run Plan은 최종 선택된 실행값을 기록한다.
```

## 현재 진행도

- Project Profile top-level structure는 정의됐다.
- `project`와 `workspace` 경계는 정의됐다.
- policy / contract lifecycle과 execution lifecycle은 정의됐다.
- `Run Plan`과 `effectivePolicy`는 분리됐다.
- `defaults`는 진행 중이다.
- `defaults.task.agentRole`은 정의됐다.
- `defaults.task.harnessMode`는 정의됐다.
- `defaults.task.requiredGates`는 `runApproval`, `resultReview`, `verification`으로 정의됐다.
- `defaults.task.workflow`는 `PLAN`, `INSPECT`, `APPLY`, `VERIFY`, `REVIEW` procedural stages로 정의됐다.
- `defaults.run.agentAdapter`는 project policy allowlist, local availability, Run Plan resolution evidence를 포함하는 A+ 구조로 정의됐다.
- `policies.agentAdapters`는 first-class policy block으로 정의됐다.

남은 defaults 항목:

- `defaults.run.isolationMode`
