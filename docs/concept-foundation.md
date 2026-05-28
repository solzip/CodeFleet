# CodeFleet Concept Foundation

이 문서는 CodeFleet의 제품 정의, 핵심 개념, 설계 원칙, 앞으로 논의해야 할 항목을 정리한 기준 문서다.

목적은 단순 구현 메모가 아니다. 다른 컴퓨터나 다른 작업 세션에서도 이 문서만 읽고 CodeFleet의 오케스트레이션 방향을 이어갈 수 있게 하는 것이다.

## 0. 설계 기준

CodeFleet 설계는 항상 최종 목표를 기준으로 시작한다.

v0.2 같은 초기 버전은 최종 구조를 향한 최소 구현일 뿐이다. 설계를 초기 구현 편의에 맞춰 축소하지 않는다. 먼저 최종적으로 사용자가 실제로 쓸 제품의 작업 흐름과 안전 모델을 정의하고, 그다음 현재 버전에서 구현할 범위를 작게 자른다.

핵심 원칙:

```text
Design from the final workflow.
Implement in small versions.
```

한국어로는 다음과 같다.

```text
최종 사용 흐름을 기준으로 설계한다.
작게 나눈 버전으로 구현한다.
```

따라서 CodeFleet의 개념, 스키마, 명령어, 파일 구조는 v0.2에서 모두 구현되지 않더라도 최종 모델과 충돌하지 않아야 한다. 초기 구현이 최종 개념의 이름, 책임 경계, 안전 모델을 왜곡하면 안 된다.

## 1. 최종 지향 정의

CodeFleet의 현재 기준 정의는 다음과 같다.

> CodeFleet은 사용자의 개발/운영 의도를 AI-generated Task Draft로 구조화하고, 사람이 승인한 Task를 Harness를 통해 역할·범위·가드레일·검증 조건 안에서 실행하며, 결과를 로그·diff·테스트·리뷰 기준으로 추적하는 AI-native 개발 오케스트레이션 CLI다.

이 정의에서 중요한 점은 CodeFleet이 단순한 AI CLI 래퍼가 아니라는 것이다.

CodeFleet의 중심은 AI 모델 호출이 아니라 다음 구조다.

```text
Intent
  -> Task Draft
  -> Human Approval
  -> Harness Execution
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 문장:

```text
AI drafts the work.
Human approves the work.
Harness controls the work.
Agent executes the work.
Trace records the work.
Summary communicates the work.
```

한국어로는 다음과 같다.

```text
AI는 작업 초안을 만든다.
사람은 실행 가능한 작업으로 승인한다.
Harness는 작업 조건을 통제한다.
Agent는 작업을 수행한다.
Trace는 실행을 기록한다.
Summary는 사람이 읽을 수 있게 전달한다.
```

## 2. CodeFleet이 아닌 것

CodeFleet은 다음이 아니다.

```text
- 단순 Codex 실행기
- 프롬프트 생성기
- AI CLI 래퍼
- 중앙 프로젝트 관리 도구
- 웹 대시보드
- DB 기반 작업 관리 시스템
- CI/CD 대체재
- 배포 도구
- Secret manager
- 완전한 샌드박스
```

CodeFleet은 AI를 직접 믿고 실행시키는 도구가 아니라, AI 작업을 정의·제한·추적·검증하기 위한 로컬 오케스트레이션 도구다.

## 3. Core와 Workspace

CodeFleet은 프로젝트 정보를 중앙으로 가져와 소유하지 않는다.

대신 각 프로젝트가 `.codefleet` workspace를 통해 CodeFleet 규약을 채택한다.

핵심 원칙:

```text
CodeFleet Core owns behavior.
CodeFleet Workspace owns state.
```

한국어:

```text
CodeFleet Core는 동작 규약을 제공한다.
CodeFleet Workspace는 프로젝트별 상태를 소유한다.
```

### 3.1 CodeFleet Core

CodeFleet Core는 공통 오케스트레이션 엔진이다.

Core가 책임지는 것:

```text
- CLI 명령 체계
- Task Schema
- Harness Pipeline
- Prompt Builder
- Run Trace Format
- Agent Adapter Interface
- Workspace Metadata 해석 규칙
```

Core가 소유하면 안 되는 것:

```text
- 프로젝트 목록
- 프로젝트별 중앙 설정
- 사용자별 작업 DB
- 원격 workspace registry
- 비밀 정보
- 프로젝트별 업무 지식
- 실행 결과 중앙 저장소
```

정리:

> CodeFleet Core는 전역 상태를 갖지 않는다. 상태는 각 프로젝트의 `.codefleet` workspace 안에만 존재한다.

### 3.2 CodeFleet Workspace

CodeFleet Workspace는 `.codefleet` metadata directory를 가진 프로젝트 루트다.

정의:

> CodeFleet Workspace는 CodeFleet이 Task scope, Agent cwd, git diff, Run Trace를 해석하는 로컬 경계다.

구분:

```text
Workspace Root
= 실제 프로젝트 루트
= 소스코드, 테스트, 인프라 설정이 있는 기준 경로
= Task scope, git diff, Agent 실행 cwd 기준

Workspace Metadata Directory
= .codefleet/
= Profile, Task, Run Trace, 향후 Template/Policy 저장 위치
```

예시:

```text
hunik-msa/
  svc-gateway/
  svc-auth/
  docker-compose.yml
  infra/
  .codefleet/
    config.json
    tasks/
    runs/
```

이 경우:

```text
Workspace Root: hunik-msa/
Metadata Dir:   hunik-msa/.codefleet/
Scope 기준:     hunik-msa 기준 상대 경로
Run 저장:       hunik-msa/.codefleet/runs/*
```

장기적으로는 Git처럼 하위 디렉터리에서 명령을 실행해도 부모 방향으로 올라가며 `.codefleet`을 찾는 workspace discovery를 지원할 수 있다. 단, 초기 구현에서는 현재 cwd에 `.codefleet`이 있다고 가정해도 된다.

## 4. Metadata

CodeFleet Metadata는 프로젝트 코드 자체가 아니다.

정의:

> CodeFleet Metadata는 프로젝트 안에서 AI 작업을 정의·통제·실행·추적하기 위해 사용하는 로컬 운영 데이터다.

예시:

```text
프로젝트 코드:
- src/
- pom.xml
- Dockerfile
- terraform/*.tf
- nginx.conf

CodeFleet Metadata:
- .codefleet/config.json
- .codefleet/tasks/*.yaml
- .codefleet/runs/*
- .codefleet/context/*
- .codefleet/templates/*
- .codefleet/policies/*
```

권장 구조:

```text
.codefleet/
  config.json          # Project Profile / Workspace Contract
  local.json           # 개인 로컬 설정, git 제외
  tasks/               # Task Spec
  runs/                # Run Trace, git 제외
  context/             # 프로젝트별 AI 작업 컨텍스트
  templates/           # 역할별/출력별 템플릿
  policies/            # guardrail, verification 정책
```

Metadata 원칙:

```text
- Metadata는 프로젝트 안에 있다.
- Metadata는 프로젝트별이다.
- Metadata는 CodeFleet Core가 해석한다.
- Metadata는 비밀 정보를 담지 않는다.
- Metadata는 중앙으로 수집되지 않는다.
```

## 5. Project Profile

Project Profile은 `.codefleet/config.json`에 저장되는 개념이다.

정의:

> Project Profile은 프로젝트별 Harness 정책을 선언하는 Workspace Contract다.

즉 단순 기본값 파일이 아니라, 해당 프로젝트에서 AI 에이전트가 어떤 조건 안에서 일해야 하는지를 선언하는 정책 파일이다.

우선순위:

```text
1. Policy declaration
2. Defaults
3. Context/template references
```

### 5.1 Profile의 책임

1차 책임: Policy Declaration

```text
- 이 프로젝트에서 금지되는 파일/명령은 무엇인가
- 어떤 작업 모드는 기본인가
- 어떤 명령은 승인 없이 실행하면 안 되는가
- 어떤 검증 절차를 따라야 하는가
- secret이나 운영 설정을 어떻게 다뤄야 하는가
```

2차 책임: Defaults

```text
- 기본 agent
- 기본 agentRole
- 기본 workflow
- 기본 harness mode
```

3차 책임: References

```text
- context 파일 참조
- prompt template 참조
- review/summary template 참조
```

### 5.2 장기 예시

```json
{
  "version": "1.0.0",
  "workspace": {
    "name": "hunik-msa",
    "domains": ["BACKEND", "INFRA", "IAC"]
  },
  "policies": {
    "guardrails": {
      "defaultMode": "SUGGEST_ONLY",
      "blockedFilePatterns": [
        "**/.env",
        "**/application-prod.yml",
        "**/secrets/**"
      ],
      "blockedCommands": [
        "rm",
        "terraform apply",
        "kubectl delete",
        "systemctl restart"
      ],
      "approvalRequiredCommands": [
        "docker compose down",
        "kubectl rollout restart"
      ]
    },
    "verification": {
      "presets": {
        "backend:maven": ["mvn test"],
        "terraform:plan": [
          "terraform fmt -check",
          "terraform validate",
          "terraform plan"
        ]
      }
    }
  },
  "defaults": {
    "agent": "codex",
    "agentRole": "BACKEND_REVIEWER",
    "workflow": ["PLAN", "REVIEW"]
  },
  "references": {
    "contextFiles": [
      ".codefleet/context/architecture.md",
      ".codefleet/context/ops-rules.md"
    ],
    "templates": {
      "review": ".codefleet/templates/review.md",
      "summary": ".codefleet/templates/summary.md"
    }
  }
}
```

### 5.3 Profile이 담으면 안 되는 것

```text
- 비밀 정보
- 다른 프로젝트 목록
- 실행 로그 원문
- 중앙 run history
- 운영 서버 접속 정보
- 프로젝트 전체 지식 문서의 본문 전체
- 개인별 local path 강결합
```

긴 설명과 프로젝트 지식은 `config.json`에 몰아넣지 않고 context 파일로 분리한다.

```text
.codefleet/context/architecture.md
.codefleet/context/ops-rules.md
```

## 6. Task Spec

Task Spec은 이번에 AI에게 맡길 작업을 정의하는 파일이다.

Project Profile이 프로젝트별 정책이라면:

```text
Project Profile
= 이 프로젝트에서 AI가 일할 때 지켜야 하는 기본 정책

Task Spec
= 이번에 AI에게 맡길 구체적인 일
```

Task가 정의해야 하는 것:

```text
- 무엇을 하려는가
- 왜 하는가
- 어디까지 봐도 되는가
- 어디를 수정해도 되는가
- 무엇은 하면 안 되는가
- 어떤 역할로 판단해야 하는가
- 완료 기준은 무엇인가
- 검증은 어떻게 할 것인가
```

Task Spec은 최종적으로 단순 작업 메모가 아니라 승인 가능한 실행 계약서다.

즉 Task Spec은 다음 계층이 함께 사용하는 기준이다.

```text
Draft Harness
= 사용자의 Intent를 Task Draft로 구조화할 때 사용하는 출력 모델

Human Approval
= 사람이 실행 가능한 작업인지 검토하고 승인하는 계약

Execution Harness
= 승인된 Task를 Project Profile과 병합해 실행 조건으로 바꾸는 입력

Run Trace
= 실제 실행이 Task 계약을 지켰는지 확인하는 기준
```

Task Spec의 1차 필드에는 다음 항목을 포함한다.

```text
intent
scope
guardrails
verification
doneCriteria
needsReview
```

이 필드는 v0.2 편의를 위한 임시 구조가 아니라 최종 모델의 핵심 필드다.

최종 모델에서는 여기에 다음 실행 계약 필드가 더해질 수 있다.

```text
approval
discovery
review
run
```

경계는 다음과 같다.

```text
Task Spec
= 실행을 허용하기 위한 계약

Run Trace
= 실제 실행 증거

Run Summary
= 사람이 읽을 수 있게 정리한 sanitized 결과
```

## 7. AI-generated Task Draft

CodeFleet의 목표에 더 부합하는 Task 작성 흐름은 사람이 YAML을 처음부터 쓰는 방식이 아니다.

권장 흐름:

```text
User Intent
  -> Draft Harness
  -> AI-generated Task Draft
  -> Human Review / Approval
  -> Execution Harness
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 원칙:

> AI may draft tasks, but only humans can approve executable tasks.

한국어:

> AI는 Task 초안을 작성할 수 있지만, 실행 가능한 Task로 승인하는 권한은 사람에게만 있다.

### 7.1 상태 흐름

```text
DRAFT
  -> READY
  -> RUNNING
  -> DONE / FAILED / BLOCKED / CANCELED
```

상태 의미:

```text
DRAFT
- AI가 만든 초안
- 실행 불가
- 사람이 검토해야 함

READY
- 사람이 승인한 작업
- 실행 가능

RUNNING
- 실행 중

DONE / FAILED / BLOCKED / CANCELED
- 실행 결과 상태
```

### 7.2 Drafting 규칙

Task Drafting은 보수적으로 동작해야 한다.

```text
- 생성 Task는 항상 DRAFT
- 기본 guardrails.mode는 SUGGEST_ONLY
- allowFileEdit 기본 false
- allowCommandExecution 기본 false
- scope가 불확실하면 needsReview 표시
- 위험 명령은 verification.commands에 직접 넣지 않음
- 위험 명령은 suggestedCommands 또는 notes로 분리
- doneCriteria는 검토 가능한 문장으로 작성
```

## 8. Harness

Harness는 CodeFleet의 차별점이다.

정의:

> Harness는 AI 에이전트가 Task를 수행할 때 역할·범위·권한·검증·수집 규칙을 적용하는 통제된 실행 껍질이다.

더 직접적인 정의:

> CodeFleet Harness는 사용자의 의도를 AI가 실행 가능한 작업으로 바꾸되, 프로젝트 정책과 안전 조건을 씌워서 Agent에게 전달하는 통제 계층이다.

사용자의 자연어 요청은 바로 Agent에게 전달되지 않는다.

예를 들어 사용자가 다음과 같이 말해도:

```text
"이 프로젝트 고쳐줘"
```

CodeFleet은 이 요청을 그대로 Codex나 다른 AI Agent에게 넘기지 않는다. 먼저 현재 Workspace의 Project Profile을 읽고, Harness 정책을 적용해 통제된 Task Draft 또는 실행 Prompt로 변환한다.

Agent에게 전달되는 지시는 다음처럼 조건을 가진 형태가 되어야 한다.

```text
너는 BACKEND_REVIEWER 역할이다.

이 작업은 SUGGEST_ONLY 모드다.
파일을 수정하지 마라.

분석 허용 범위:
- src/main/java/**
- src/test/java/**

제외 범위:
- **/.env
- **/application-prod.yml
- **/target/**
- **/build/**

금지 조건:
- 운영 설정을 수정하지 마라.
- JWT 토큰 원문을 로그에 남기지 마라.
- 무관한 리팩토링을 하지 마라.
- 위험 명령을 실행하지 마라.

검증 관점:
- 테스트 실행 가능 여부를 판단하라.
- 필요한 경우 실행할 테스트 명령을 제안하라.

응답 형식:
- 요약
- 분석한 파일
- 발견한 문제
- 수정 제안
- 테스트/검증 방법
- 위험 요소
- 다음 단계
```

핵심 원칙:

```text
사용자 자연어 요청은 바로 Agent에게 가지 않는다.
Harness가 Project Profile과 결합해 통제된 Task/Prompt로 바꾼다.
Agent는 그 통제된 지시 안에서만 일한다.
```

Agent Adapter와 Harness의 차이:

```text
Agent Adapter
= 특정 AI 도구를 어떻게 호출할지 아는 계층
= Codex, Claude Code, Gemini CLI 등

Harness
= AI가 어떤 조건 안에서 일해야 하는지 통제하는 계층
= role, scope, guardrail, verification, trace collection
```

구조:

```text
Task
  -> Harness
  -> Agent Adapter
  -> AI Coding Tool
```

### 8.1 Draft Harness

Draft Harness는 사용자의 자연어 Intent를 DRAFT Task Spec으로 구조화한다.

Task는 단순한 작업 메모가 아니다.

> Task는 AI에게 위임할 작업의 목표, 범위, 권한, 검증 기준, 완료 조건을 명시한 실행 전 계약서다.

따라서 코드 수정 Task를 제대로 정의하려면 Draft 단계에서도 프로젝트를 어느 정도 읽어야 할 수 있다. 예를 들어 "회원가입 API 에러 응답을 통일해줘"라는 Intent를 Task로 만들려면 회원가입 API가 어느 Controller에 있는지, 에러 응답이 어디서 만들어지는지, 공통 응답 타입이 이미 있는지, 테스트 위치가 어디인지 정도는 파악해야 한다.

하지만 Draft Harness는 실행 계층이 아니다.

핵심 원칙:

```text
Draft Harness performs bounded discovery, not execution.
```

한국어:

```text
Draft Harness는 제한된 사전 조사를 수행하지만, 작업 실행은 수행하지 않는다.
```

bounded discovery는 Task를 정의하는 데 필요한 범위 안에서만 제한적으로 프로젝트를 탐색하고 읽는 것을 의미한다.

책임:

```text
- Intent + Project Profile을 읽음
- AI Task Drafter에게 초안 생성을 위임
- 보수적인 guardrail 기본값 적용
- status: DRAFT로 저장
- 실행하지 않음
```

Draft Harness가 할 수 있는 것:

```text
- Project Profile 읽기
- .codefleet/context 읽기
- 파일 트리 탐색
- 관련 파일 후보 검색
- 관련 소스 일부 읽기
- scope 후보 제안
- agentRole 제안
- verification 후보 제안
- needsReview 기록
```

Draft Harness가 하면 안 되는 것:

```text
- 파일 수정
- shell command 실행
- 테스트 실행
- terraform plan/apply 실행
- Agent에게 코드 수정 지시
```

읽기와 실행은 분리한다.

```text
User Intent
  -> Draft Harness
     - read-only bounded discovery
     - DRAFT Task 생성
  -> Human Approval
  -> Execution Harness
     - READY Task 실행
     - 수정/검증/로그 수집
  -> Run Trace
```

### 8.2 Execution Harness

Execution Harness는 승인된 READY Task만 실행한다.

책임:

```text
- READY Task만 실행
- Project Profile 정책과 Task를 병합
- 역할/범위/가드레일/검증 조건을 prompt에 반영
- Agent Adapter 호출
- stdout/stderr/diff/result를 수집
- Run Trace 저장
```

### 8.3 Harness 단계별 발전

초기 Harness는 실행을 완전히 막는 샌드박스가 아니다.

Guardrail 단계:

```text
1. Instruction Guardrail
   프롬프트에 하지 말라고 명시

2. Detection Guardrail
   실행 후 diff, changed-files, command log를 보고 위반 감지

3. Enforcement Guardrail
   실행 중 실제로 막음
```

초기에는 Prompt-level Harness와 Trace-level Harness가 현실적이다.

```text
Prompt-level Harness
- 역할 지시
- 파일 수정 가능 여부
- 명령 실행 가능 여부
- 위험 명령 금지
- 검증 방법 안내

Trace-level Harness
- prompt 저장
- task 복사
- stdout/stderr 저장
- diff 저장
- result.json 저장
```

장기적으로는 Sandbox-level Harness와 Command-policy Harness로 확장할 수 있다.

## 8.4 Safe Orchestration

CodeFleet이 말하는 "안전한 오케스트레이션"은 AI가 실수하지 않도록 보장한다는 뜻이 아니다. AI가 실수할 수 있다는 전제 위에서, 실수의 범위와 영향을 제한하고 검토 가능한 기록을 남기는 운영 구조를 뜻한다.

최종 정의:

> 안전한 오케스트레이션이란 사용자의 의도를 명시적 Task로 구조화하고, 사람이 승인한 뒤, Workspace 정책과 Harness가 허용한 권한 안에서만 AI Agent가 작업하게 하며, 모든 실행 결과를 검증 가능하고 되돌릴 수 있고 감사 가능한 기록으로 남기는 것이다.

짧게 표현하면:

> AI가 마음대로 일하지 못하게 하고, 승인된 작업·허용된 범위·검증된 결과 안에서만 일하게 만드는 운영 구조다.

최종 실행 흐름:

```text
User Intent
  -> Draft Harness
  -> DRAFT Task
  -> Human Approval
  -> READY Task
  -> Execution Harness
  -> Isolated / Controlled Agent Run
  -> Diff + Logs + Verification
  -> Review
  -> Close / Retry / Reject
```

최종 안전 조건:

```text
1. Explicit Task
   모든 AI 작업은 명시적 Task에서 시작한다.

2. Human Approval
   AI가 만든 Task Draft는 사람이 승인해야 실행 가능하다.

3. Non-relaxable Workspace Policy
   Project Profile 정책은 Task가 완화할 수 없다.
   더 엄격해지는 것만 허용한다.

4. Least Privilege
   Agent는 필요한 최소 read/write/command 권한만 가진다.

5. Isolation
   가능하면 git worktree, temp workspace, container 등 격리된 실행 환경에서 작업한다.

6. Verification Gate
   테스트, lint, build, terraform plan, nginx -t 같은 검증 결과 없이는 성공으로 닫지 않는다.

7. Auditable Trace
   prompt, policy snapshot, commands, stdout/stderr, diff, changed files, verification, review, result를 남긴다.
```

최종 안전 모델:

> CodeFleet에서 안전한 오케스트레이션은 AI Agent에게 작업을 직접 맡기는 것이 아니라, 승인된 Task와 비완화 Workspace Policy를 바탕으로 Harness가 최소 권한·격리·검증·추적 조건을 적용해 실행하고, 그 결과를 사람이 검토 가능한 Run Trace로 남기는 것이다.

안전 철학:

```text
Trust the process, not the agent.
```

한국어로는:

```text
AI를 신뢰하는 것이 아니라, AI가 일하는 절차와 경계를 신뢰한다.
```

## 9. Policy 병합 원칙

정책 병합 방향:

```text
Core defaults
  -> Project Profile policies
  -> Task guardrails
  -> Run options
```

하지만 권한은 넓어지면 안 된다.

핵심 원칙:

```text
More restrictive wins.
```

예:

```text
Profile:
allowCommandExecution: false

Task:
allowCommandExecution: true

결과:
불허. Task는 Profile 정책을 완화할 수 없다.
```

반대로 더 엄격해지는 것은 허용된다.

```text
Profile:
defaultMode: WORKSPACE_EDIT

Task:
mode: SUGGEST_ONLY

결과:
허용. Task가 더 보수적이다.
```

## 10. Run Trace와 Run Summary

Run Trace는 원본 실행 기록이다.

```text
.codefleet/runs/<run-id>/
  task.yaml
  prompt.md
  agent-role.md
  stdout.log
  stderr.log
  commands.log
  git-diff.patch
  changed-files.txt
  verification/
  review.md
  result.json
```

Run Trace는 기본적으로 git에 올리지 않는다.

이유:

```text
- 로그와 diff가 클 수 있음
- 민감 정보가 포함될 수 있음
- 실행 산출물이지 공유해야 하는 정책이 아님
```

반면 외부 작업일지에는 원본 로그가 아니라 Sanitized Run Summary를 남긴다.

원칙:

> CodeFleet은 Run Metadata를 로컬 원본 기록으로 보관하고, 외부 작업일지에는 민감 정보가 제거된 Run Summary만 내보낸다.

Notion, Obsidian, Markdown diary 등은 Run Trace 원본 저장소가 아니라 summary export 대상이다.

Notion에 올리지 말아야 하는 것:

```text
- stdout/stderr 원문 전체
- git diff 원문 전체
- secret, token, env 값
- 내부 URL / 운영 서버 정보
- 개인/회사 민감 경로
- 실패 로그에 포함된 인증 정보
```

Notion에 올려도 되는 것:

```text
- runId
- taskId
- task title
- agentRole
- harness mode
- status
- 요약
- 변경 파일 목록
- 실행한 검증 명령과 결과
- 발견한 문제
- 결정 사항
- 다음 액션
- 로컬 run path
```

장기 구조:

```text
Run Trace
  -> Run Summary
     -> Markdown
     -> Notion
     -> Obsidian
     -> GitHub Issue Comment
```

## 11. AgentRole

초기 AgentRole 후보:

```text
BACKEND_IMPLEMENTER
BACKEND_REVIEWER
BACKEND_REFACTORER
INFRA_OPERATOR
INFRA_DEBUGGER
IAC_ENGINEER
DOCS_WRITER
```

역할 의미:

```text
BACKEND_IMPLEMENTER
- API, 서비스 로직, DTO, 예외 처리, 테스트 구현

BACKEND_REVIEWER
- 코드 리뷰, 사이드이펙트 점검, 구조 검토

BACKEND_REFACTORER
- 중복 제거, 계층 분리, 유지보수성 개선

INFRA_OPERATOR
- systemd, Nginx, Docker, 배포 스크립트 작업

INFRA_DEBUGGER
- 로그 분석, 장애 원인 추정, 재현 절차 정리

IAC_ENGINEER
- Terraform, AWS, VPC, RDS, EC2, Security Group 작업

DOCS_WRITER
- README, 운영 문서, 장애 대응 문서 작성
```

역할은 너무 많이 만들면 안 된다. 역할이 많아지면 프롬프트 품질과 정책 관리가 어려워진다.

## 12. Guardrail

Guardrail은 백엔드/인프라 특화 CodeFleet에서 핵심이다.

위험 요소:

```text
- 운영 설정 파일 수정
- DB migration
- terraform apply
- docker compose down
- systemctl restart
- rm -rf
- secret 노출
- prod 환경 접속
- 무관한 리팩토링
```

작업 모드 후보:

```text
DRY_RUN
- 프롬프트와 실행 기록만 생성

SUGGEST_ONLY
- 분석/제안만 허용
- 파일 수정 금지

WORKSPACE_EDIT
- 지정된 scope 안에서 파일 수정 허용

COMMAND_EXEC
- 허용된 명령만 실행 가능

APPROVAL_REQUIRED
- 위험 명령은 사람 승인 필요
```

초기에는 `DRY_RUN`과 `SUGGEST_ONLY`가 가장 안전하다.

## 13. Verification

Verification은 "AI가 했다"가 아니라 "검증까지 추적했다"를 만들기 위한 개념이다.

예시:

```text
Backend:
- mvn test
- gradle test
- npm test
- npm run lint
- npm run typecheck

Docker:
- docker compose config
- docker compose build

Nginx:
- nginx -t

systemd:
- systemd-analyze verify <unit-file>

Terraform:
- terraform fmt -check
- terraform validate
- terraform plan
```

`terraform apply`는 기본 금지다.

Verification은 처음에는 prompt에 포함되는 검증 지시로 시작할 수 있다. 나중에는 Harness가 직접 실행하고 로그를 남길 수 있다.

## 14. 현재 구현과의 관계

현재 레포에는 v0.1 CLI 골격이 있다.

v0.1 구현 내용:

```text
- codefleet init
- codefleet run <task-id>
- codefleet prompt <task-id>
- codefleet task validate <task-id>
- YAML Task 로딩
- Task 검증
- Prompt 생성
- Run 디렉터리 생성
- dry-run 기본 지원
- stdout/stderr/git diff/result 저장
```

중요:

> 현재 v0.1 구현은 최종 아키텍처가 아니라 seed implementation이다. 앞으로의 설계는 이 문서의 Core / Workspace / Profile / Task Draft / Harness / Run Trace 개념을 기준으로 재정렬한다.

## 15. 아직 논의할 항목

다음 항목은 아직 더 논의해야 한다.

```text
1. Harness 상세 정의
   - Draft Harness
   - Execution Harness
   - Guardrail 단계
   - Policy 병합 방식

2. Task Spec 최종 모델
   - Intent에서 Draft로 바뀔 때 필요한 필드
   - DRAFT/READY 승인 플로우
   - needsReview 표현 방식

3. Project Profile 최종 스키마
   - policies
   - defaults
   - references
   - local-only 설정 분리

4. Workspace discovery
   - 현재 cwd 기준
   - 부모 디렉터리 탐색
   - 명시적 --workspace 옵션

5. Run Summary 설계
   - summary.md 자동 생성
   - sanitization 규칙
   - Notion export adapter

6. Verification 실행 정책
   - prompt-only
   - manual command suggestion
   - allowlist 기반 자동 실행

7. Review 모델
   - AI review.md
   - human review note
   - approval 기록
```

## 16. 다음 세션에서 이어갈 때

다른 컴퓨터나 새 세션에서 이어갈 때는 다음 순서로 보면 된다.

```text
1. 이 문서 전체를 읽는다.
2. docs/architecture.md는 현재 구현 구조 참고용으로 본다.
3. README는 사용자용 현재 사용법 참고용으로 본다.
4. 구현을 바로 하지 말고 Harness / Task Spec / Project Profile 중 무엇을 먼저 확정할지 정한다.
5. 개념 합의 후 v0.2 구현 범위를 작게 자른다.
```

우선순위:

```text
1. 최종 목표 기준 검토
2. 개념 고정
3. 문서 반영
4. 최소 구현
5. 테스트
6. push
```
