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

### 0.1 목표 경계

CodeFleet의 최종 목표는 현재 정의에서 더 넓히지 않는다.

앞으로의 설계 확장은 최종 목표를 구현하기 위한 내부 구조, 안전 장치, 사용자 흐름을 구체화하는 방향으로만 진행한다. CodeFleet을 프로젝트 관리 도구나 범용 에이전트 플랫폼으로 확장하지 않는다.

고정된 최종 목표:

```text
CodeFleet은 사용자의 개발/운영 Objective를 하나 이상의 Task로 구조화하고,
백엔드/인프라 작업을 역할·범위·가드레일·검증 조건이 포함된 Task로 정의하며,
사람이 승인한 Task를 AI 에이전트에게 역할 기반으로 위임하고,
실행 결과를 로그·diff·테스트·리뷰 기준으로 추적하는
AI-native 개발 오케스트레이션 CLI다.
```

이 목표 안에 포함되는 축:

```text
Objective
= 왜/어떤 맥락의 작업인가

Task
= 무엇을 어떤 조건으로 시킬 것인가

Human Approval
= 사람이 실행 계약을 확정했는가

Harness
= 범위/권한/검증을 어떻게 통제할 것인가

Agent Adapter
= 어떤 AI 도구에 위임할 것인가

Run Trace
= 실제 실행 증거는 무엇인가

Run Summary
= 사람이 어떻게 결과를 이어받을 것인가
```

확장하지 않을 범위:

```text
- Jira/Notion 같은 프로젝트 관리 도구
- 중앙 작업 DB
- 웹 대시보드
- CI/CD 대체재
- 배포 자동화 플랫폼
- Secret manager
- 완전한 샌드박스
- 일반 목적 에이전트 OS
```

Objective / Task Queue / ledger / Mutation Engine 같은 논의는 목표 확장이 아니라, 이 최종 목표를 안정적으로 구현하기 위한 내부 구조 논의다.

## 1. 최종 지향 정의

위 고정 목표를 오케스트레이션 흐름으로 풀면 다음과 같다.

> CodeFleet은 사용자의 개발/운영 Objective를 하나 이상의 AI-generated Task Draft로 구조화하고, 사람이 승인한 Task를 Harness를 통해 역할·범위·가드레일·검증 조건 안에서 AI Agent에게 위임하며, 결과를 로그·diff·테스트·리뷰 기준으로 추적하는 AI-native 개발 오케스트레이션 CLI다.

이 정의에서 중요한 점은 CodeFleet이 단순한 AI CLI 래퍼가 아니라는 것이다.

CodeFleet의 중심은 AI 모델 호출이 아니라 다음 구조다.

```text
Intent
  -> Objective
  -> Task Draft
  -> Human Approval
  -> Harness Execution
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 문장:

```text
Objective frames the work.
AI drafts executable tasks.
Human approves the work.
Harness controls the work.
Agent executes the work.
Trace records the work.
Summary communicates the work.
```

한국어로는 다음과 같다.

```text
Objective는 작업의 맥락과 연속성을 정의한다.
AI는 실행 가능한 작업 초안을 만든다.
사람은 실행 가능한 작업으로 승인한다.
Harness는 작업 조건을 통제한다.
Agent는 작업을 수행한다.
Trace는 실행을 기록한다.
Summary는 사람이 읽을 수 있게 전달한다.
```

CodeFleet의 가장 작은 실행 단위는 Task지만, 최종 사용자 흐름의 기준 단위는 Objective다.

```text
Objective
  -> Task
     -> Run
```

의미:

```text
Objective
= 사용자가 달성하려는 상위 목적
= 일회성인지, 연속 작업인지, 장기 workstream인지 정의하는 단위

Task
= AI에게 위임 가능한 실행 계약
= 역할, 범위, 가드레일, 검증, 완료 기준을 명시하는 단위

Run
= 특정 Task를 실제로 실행한 시도와 증거
= 로그, diff, 검증 결과, 리뷰 결과가 남는 단위
```

LLM은 현재 요청이 일회성인지, 이전 작업의 연속인지, 장기 workstream의 일부인지 스스로 단정하면 안 된다. CodeFleet은 이 연속성을 Objective 자료구조에 기록하고, 사람은 review 단계에서 그 연속성 제안을 수락하거나 수정한다.

핵심 원칙:

```text
LLM decides nothing about continuity.
CodeFleet records continuity.
Human accepts or approves continuity.
Harness supplies accepted or approved context.
```

한국어:

```text
LLM이 작업의 연속성을 단정하지 않는다.
CodeFleet이 연속성을 기록한다.
사람이 연속성 제안을 수락하거나 수정한다.
Harness가 수락된 맥락만 전달한다.
```

연속성 처리의 목적은 LLM 기억에 의존하지 않고, 승인된 요약과 결정사항만 다음 Task의 컨텍스트로 전달하는 것이다.

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

## 6. Objective와 Task Spec

Objective와 Task Spec은 CodeFleet의 작업 계약을 이루는 핵심 자료구조다.

### 6.1 Objective

Objective는 Task보다 상위에 있는 작업 맥락 단위다.

정의:

> Objective는 사용자가 달성하려는 상위 목적과 그 목적에 속한 Task들의 연속성을 기록하는 로컬 자료구조다.

Task가 실행 가능한 계약이라면, Objective는 여러 Task가 왜 이어지는지 설명하는 목적 계약이다.

Objective가 책임지는 것:

```text
- 이 작업이 일회성인지 연속 작업인지 장기 workstream인지 구분
- 관련 Task Queue와 순서
- 승인된 결정사항
- 다음 Task에 전달할 sanitized context
- 완료/보류/취소 상태
```

Objective가 책임지면 안 되는 것:

```text
- 원본 stdout/stderr 전체
- 원본 git diff 전체
- secret, token, env 값
- Agent 실행 prompt 원문 전체
- Task별 실제 실행 증거
```

이런 실행 증거는 Run Trace에 남긴다.

초기 Objective 종류:

```text
ONE_OFF
- 한 번 실행하고 닫는 작업
- 이전 Run Summary를 다음 작업에 자동 연결하지 않는다.

SEQUENCE
- 정해진 목표를 여러 Task로 나눠 순차 진행하는 작업
- 이전 Task의 승인된 Summary와 결정사항을 다음 Task에 전달할 수 있다.

WORKSTREAM
- 장기간 이어지는 열린 주제
- 매 Task마다 어떤 context를 이어받을지 review 단계에서 확인한다.
```

중요한 점은 모든 Task가 Objective 없이 떠다니면 안 된다는 것이다.

최종 모델에서는 Task가 항상 다음 중 하나에 속한다.

```text
- 명시적인 ONE_OFF Objective
- 순차적인 SEQUENCE Objective
- 장기적인 WORKSTREAM Objective
```

Task Review 화면은 Objective 연결을 확인해야 한다.

예시:

```text
Work Context
Objective: CodeFleet Task Review UX
Kind: SEQUENCE
Relation: CONTINUATION

Carry Forward:
- approved decisions
- sanitized summaries
- no raw logs
- no raw diffs

Actions:
- Treat as one-off
- Attach to existing objective
- Start new sequence
- Convert to workstream
```

최소 Objective 예시:

```yaml
id: codefleet-task-review-ux
title: Task Review 인터랙티브 UX 설계
kind: SEQUENCE
status: OPEN

continuity:
  carryForward:
    decisions: true
    summaries: true
    rawLogs: false
    rawDiffs: false

queue:
  policy: SEQUENTIAL
  cursor: task-review-interactive-session
  items:
    - taskId: task-review-minimal-flow
      position: 1
      relation: START
      storedState: null
    - taskId: task-review-edit-approval
      position: 2
      relation: CONTINUATION
      storedState: null
    - taskId: task-review-interactive-session
      position: 3
      relation: CONTINUATION
      storedState: WAITING
```

Objective의 핵심은 LLM에게 "기억하라"고 요구하는 것이 아니라, CodeFleet이 로컬 자료구조로 연속성을 명시하고 Harness가 accepted 또는 approved 맥락만 전달하게 만드는 것이다.

### 6.1.1 OMX 레퍼런스와 CodeFleet의 차이

CodeFleet의 Objective 모델은 `oh-my-codex`의 durable workflow 아이디어에서 힌트를 얻을 수 있다.

OMX의 `$ultragoal` 흐름은 approved plan을 durable goals로 만들고, `.omx/ultragoal` 아래에 계획과 ledger checkpoint를 남기는 방식이다.

개념적으로는 다음 구조에 가깝다.

```text
brief
  -> ordered goals
  -> active goal cursor
  -> ledger checkpoints
```

OMX에서 CodeFleet이 참고할 점:

```text
- 대화 안의 계획을 휘발성으로 두지 않고 repo-native artifact로 남긴다.
- 여러 goal/task를 순서 있는 durable plan으로 관리한다.
- 현재 진행 중인 항목을 cursor로 표시한다.
- 각 진행/완료/실패/차단 이벤트를 ledger에 남긴다.
- 재시작/재개를 고려한 상태 파일을 둔다.
- HUD나 표시용 상태와 판단용 authoritative state를 구분한다.
- mutation lock과 atomic write 같은 상태 갱신 안전장치를 둔다.
```

하지만 CodeFleet은 OMX를 그대로 복제하지 않는다.

OMX의 goal은 Codex goal mode에 넘길 실행 목표에 가깝지만, CodeFleet의 Task는 역할, 범위, 가드레일, 검증, 승인 revision을 포함하는 실행 계약이다.

따라서 CodeFleet은 다음처럼 더 보수적으로 분리한다.

```text
Objective
= 상위 목적과 Task Queue의 연속성

Task Spec
= AI에게 위임 가능한 승인 대상 실행 계약

Run Trace
= 실제 실행 증거

Run Summary
= sanitized carry-forward 대상
```

OMX에서 가져오지 않을 것:

```text
- Codex goal mode 중심 모델
- goals.json 하나에 계약/실행/진행 상태를 과도하게 모으는 구조
- LLM이나 active thread가 completion의 최종 근거가 되는 구조
- 원본 로그/diff를 다음 작업 맥락으로 넘기는 흐름
- Objective 간 자유 graph / parent-child graph
- 실행 중 steering으로 승인된 Task 계약을 우회하는 방식
```

CodeFleet의 보수적 원칙:

```text
Use durable queue ideas.
Do not collapse contracts, execution evidence, and summaries into one file.
```

한국어:

```text
durable queue 아이디어는 가져온다.
계약, 실행 증거, 요약을 한 파일에 합치지 않는다.
```

권위 상태는 다음처럼 나눈다.

```text
.codefleet/tasks/<task-id>.yaml
= Task 계약의 진실

.codefleet/runs/<run-id>/*
= 실행 결과의 진실

.codefleet/objectives/<objective-id>/ledger.jsonl
= Objective / Queue 변경 이력의 진실

.codefleet/objectives/<objective-id>/objective.json
= ledger, task, run에서 재생성 가능한 snapshot
```

즉 `objective.json`은 빠른 조회를 위한 현재 상태 파일이지, 단독 권위 상태가 아니다. 손상되거나 불일치가 생기면 ledger, Task Spec, Run Trace를 기준으로 재생성할 수 있어야 한다.

Objective 안의 Task Queue는 다음 구조를 따른다.

```text
Objective
  -> Task Queue
     -> Task
        -> Run
```

Queue는 Task의 순서, 현재 cursor, block/skip 같은 진행 상태를 관리한다. 다만 Task의 계약 상태와 Run의 실행 결과를 대신 소유하지 않는다.

Cursor 정의:

```text
cursor
= Objective의 Task Queue 안에서 현재 주목해야 하는 Task 위치
= "이 Objective에서 지금 다음으로 봐야 할 Task가 무엇인가"를 가리키는 포인터
```

예시:

```text
Objective: 회원가입/로그인 API 에러 응답 통일

Queue:
1. 현재 에러 응답 구조 조사
2. 공통 응답 포맷 설계
3. 회원가입 API 수정
4. 로그인 API 수정
5. 테스트 추가

1번이 끝났고 2번을 봐야 한다면 cursor는 2번 Task를 가리킨다.
```

하지만 cursor는 단독 권위 상태가 되면 안 된다. 예를 들어 cursor는 2번을 가리키는데 2번 Task가 이미 DONE이고 3번이 NEXT여야 한다면 상태가 꼬인다.

따라서 CodeFleet은 cursor를 다음처럼 취급한다.

```text
- cursor는 objective.json snapshot에 표시할 수 있다.
- cursor는 빠른 조회와 UX focus를 위한 값이다.
- cursor만으로 실행 가능 Task를 판단하지 않는다.
- 실행 가능 여부는 Task status, Run Trace, Queue policy를 기준으로 계산한다.
```

Objective kind에 따른 cursor 원칙:

```text
SEQUENCE
- 순서가 엄격하다.
- cursor는 앞에서부터 queue items를 스캔해 계산할 수 있어야 한다.
- DONE / SKIPPED는 지나간다.
- BLOCKED를 만나면 멈춘다.
- 처음 만나는 실행 후보가 NEXT가 된다.
- snapshot의 cursor가 계산 결과와 다르면 계산 결과가 우선한다.

WORKSTREAM
- 순서가 엄격하지 않은 장기 작업 흐름이다.
- cursor는 사람이 선택한 현재 focus에 가깝다.
- focus 변경은 ledger event로 남긴다.
- 그래도 실행 가능 여부는 Task approval과 guardrail을 기준으로 다시 검증한다.

ONE_OFF
- queue item이 하나이므로 cursor가 사실상 그 Task를 가리킨다.
```

Queue 상태 원칙:

```text
저장 가능한 상태:
- WAITING
- BLOCKED
- SKIPPED
- CANCELED

계산해야 하는 상태:
- NEXT
- ACTIVE
- DONE
```

`NEXT`, `ACTIVE`, `DONE`은 Task status와 Run Trace에서 계산할 수 있으므로 원본 진실로 저장하지 않는다. snapshot에는 표시할 수 있지만, 불일치가 생기면 재계산 결과가 우선한다.

여기서 "저장 가능한 상태"와 "계산해야 하는 상태"의 차이는 다음과 같다.

```text
저장 가능한 상태
= 사람이 명시적으로 결정하거나 외부 근거가 필요해서 파일/ledger에 기록해야 알 수 있는 상태

계산해야 하는 상태
= 이미 존재하는 Task Spec, Run Trace, Queue 순서를 보면 자동으로 판단할 수 있는 상태
```

핵심 원칙:

```text
Do not store the same truth twice.
```

한국어:

```text
같은 사실을 두 군데에 원본 진실로 저장하지 않는다.
```

예를 들어 `DONE`은 Objective Queue에 원본 상태로 저장하지 않는다.

```text
DONE
= Task status와 Run result를 보고 판단할 수 있음
= 이미 존재하는 실행 증거에서 계산 가능
```

반대로 `SKIPPED`는 저장해야 한다.

```text
SKIPPED
= 사람이 이 queue item을 건너뛰기로 결정한 상태
= Task/Run 기록만 봐서는 자동으로 알 수 없음
= ledger event로 남겨야 함
```

상태별 기준:

```text
WAITING
- queue에 들어왔지만 아직 진행 대상이 아님
- queue item의 기본 저장 상태로 둘 수 있음

BLOCKED
- 외부 정보, 사람 결정, 선행 작업 문제 등으로 막힌 상태
- 막힌 이유를 사람이 기록해야 하므로 저장

SKIPPED
- 이 Objective 안에서는 해당 Task를 건너뛰기로 한 상태
- 명시적 결정이므로 저장

CANCELED
- queue item을 취소한 상태
- 명시적 결정이므로 저장

NEXT
- queue policy와 앞 item 상태를 보면 계산 가능
- 저장하지 않음

ACTIVE
- 현재 RUNNING run이 있는지 보면 계산 가능
- 저장하지 않음

DONE
- Task status와 Run result를 보면 계산 가능
- 저장하지 않음
```

나쁜 상태 예시:

```text
objective.json: task-001 is DONE
task.yaml:      task-001 is READY
run/result:     task-001 failed
```

이런 상태가 생기면 무엇을 믿어야 할지 애매해진다. 따라서 Objective Queue에는 `DONE`을 원본 진실로 저장하지 않고, Task와 Run을 기준으로 계산한다.

좋은 상태 예시:

```text
objective ledger:
- task-001 attached
- task-002 skipped by human

task.yaml:
- task-001 status: DONE

run/result:
- task-001 result: success

derived queue state:
- task-001 = DONE
- task-002 = SKIPPED
- task-003 = NEXT
```

꼬임을 막기 위한 불변식:

```text
- 승인 시점의 Task는 정확히 하나의 Objective queue item에 속한다.
- queue item은 taskId와 approvedRevision을 함께 가리킨다.
- Task revision이 바뀌면 기존 approval과 queue relation은 무효화되거나 새 item으로 기록된다.
- SEQUENCE Objective는 derived NEXT가 최대 1개다.
- 기본 정책에서 ACTIVE Task는 Objective당 최대 1개다.
- Queue position은 직접 수정하지 않고 reorder 이벤트로만 바꾼다.
- Objective snapshot은 ledger, Task Spec, Run Trace에서 재생성 가능해야 한다.
- raw stdout/stderr/diff는 Objective나 carry-forward context에 들어가지 않는다.
```

이 설계의 목적은 OMX의 durable workflow 장점을 가져오되, CodeFleet의 핵심인 승인 가능한 Task 계약과 검증 가능한 실행 증거를 흐리지 않는 것이다.

### 6.2 Task Spec

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
objective
scope
guardrails
verification
doneCriteria
needsReview
```

이 필드는 v0.2 편의를 위한 임시 구조가 아니라 최종 모델의 핵심 필드다.

`objective` 필드는 Task가 어떤 Objective queue item에 속하는지 표현한다. Draft 단계에서는 proposed relation일 수 있고, Task Review 단계에서 사람이 이를 accepted / approved / rejected 중 하나로 확정하거나 수정한다.

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
  -> Objective Selection / Creation
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

Objective 연결도 마찬가지다.

> AI may suggest continuity, but proposed continuity cannot drive execution until it is accepted or approved during review.

한국어:

> AI는 작업의 연속성을 제안할 수 있지만, proposed relation만으로는 실행할 수 없다. Task Review 단계에서 사용자가 제안을 수락하거나 수정해야 한다.

Objective relation 상태:

```text
proposed
- Draft Harness가 제안한 Objective 연결
- 실행에는 사용할 수 없음

accepted
- 사용자가 review 화면에서 낮은 위험의 제안을 그대로 수락한 연결
- 실행에 사용할 수 있음

approved
- 사용자가 명시적으로 선택/확정한 연결
- 모호하거나 위험한 경우 필요
- 실행에 사용할 수 있음

rejected
- 사용자가 거절한 연결
- 실행에 사용할 수 없음
```

UX 원칙:

```text
- 낮은 위험의 명확한 relation은 사용자가 빠르게 accept할 수 있어야 한다.
- Objective 후보가 여러 개이거나 위험한 carry-forward가 있으면 explicit approval이 필요하다.
- proposed relation은 Harness prompt에 포함하지 않는다.
- Execution Harness는 accepted 또는 approved relation만 사용한다.
```

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

### 7.3 Task Review / Edit

CodeFleet의 최종 사용자 흐름은 사용자가 YAML을 처음부터 직접 작성하는 방식이 아니다. 사용자는 자연어 Intent를 입력하고, CodeFleet은 DRAFT Task를 생성하며, 사용자는 보조 명령을 통해 그 Task를 검토·수정·승인한다.

초기부터 YAML 직접 편집만을 1차 UX로 두지 않는다. YAML은 저장 형식일 수 있지만, 사용자의 기본 흐름은 Task Review 중심이어야 한다.

권장 최소 흐름:

```text
codefleet draft "<user intent>"
codefleet task review <task-id>
codefleet task approve <task-id>
codefleet run <task-id>
```

최종 흐름에서 `task review`는 Task 내용뿐 아니라 Objective 연결도 검토한다.

```text
codefleet draft "<user intent>"
  -> Objective 후보 제안
  -> DRAFT Task 생성

codefleet task review <task-id>
  -> Task 계약 검토
  -> Objective 연결 검토
  -> continuity accept / approve / reject / 수정

codefleet task approve <task-id>
  -> Task revision 승인
  -> accepted 또는 approved Objective relation 확인

codefleet run <task-id>
  -> accepted 또는 approved Objective context만 Harness prompt에 포함
```

`task review`의 책임:

```text
- 사람이 읽기 좋은 Task 요약을 보여준다.
- intent, scope, guardrails, verification, doneCriteria, needsReview를 강조한다.
- Objective 연결과 carry-forward context를 보여준다.
- 위험하거나 불확실한 항목을 눈에 띄게 보여준다.
- 필요한 경우 안전한 수정 흐름으로 연결한다.
```

`task edit` 또는 review 안의 수정 기능은 Task Spec만 수정한다.

금지 사항:

```text
- 프로젝트 소스 파일 수정 금지
- shell command 실행 금지
- 테스트 실행 금지
- Agent에게 코드 수정 지시 금지
```

즉 Task 수정 명령은 실행 명령이 아니라 계약 수정 명령이다.

핵심 안전 원칙:

```text
Approval is bound to a task revision.
```

한국어:

```text
승인은 특정 Task revision에만 유효하다.
```

따라서 승인된 Task를 수정하면 기존 승인은 무효화되어야 한다.

상태 흐름:

```text
DRAFT
  -> review/edit
  -> validate
  -> approve
  -> READY

READY
  -> edit
  -> new revision
  -> DRAFT
  -> approval cleared
```

Task Review / Edit 안전 규칙:

```text
- READY / RUNNING / DONE Task는 같은 revision에서 직접 수정하지 않는다.
- 승인 후 수정은 새 revision을 만들고 status를 DRAFT로 되돌린다.
- approval 정보는 수정된 revision에 승계되지 않는다.
- Project Profile 정책을 완화하는 변경은 저장하지 못한다.
- More restrictive wins 원칙을 따른다.
- 저장 전/후 Task diff를 보여준다.
```

이 흐름의 목적은 YAML 작성 능력을 사용자에게 요구하는 것이 아니라, AI가 만든 작업 계약을 사람이 안전하게 검토하고 승인할 수 있게 하는 것이다.

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

> 안전한 오케스트레이션이란 사용자의 의도를 명시적 Objective와 Task로 구조화하고, 사람이 Task revision을 승인하고 Objective relation을 수락 또는 승인한 뒤, Workspace 정책과 Harness가 허용한 권한 안에서만 AI Agent가 작업하게 하며, 모든 실행 결과를 검증 가능하고 되돌릴 수 있고 감사 가능한 기록으로 남기는 것이다.

짧게 표현하면:

> AI가 마음대로 일하지 못하게 하고, 승인된 작업·허용된 범위·검증된 결과 안에서만 일하게 만드는 운영 구조다.

최종 실행 흐름:

```text
User Intent
  -> Objective Selection / Creation
  -> Draft Harness
  -> DRAFT Task
  -> Task Review
  -> Human Approval of Task Revision
  -> Accept / Approve Objective Relation
  -> READY Task
  -> Objective Queue Update
  -> Execution Harness
  -> Isolated / Controlled Agent Run
  -> Diff + Logs + Verification
  -> Review
  -> Close / Retry / Reject
```

최종 안전 조건:

```text
1. Explicit Objective and Task
   모든 AI 작업은 명시적 Objective와 Task에서 시작한다.

2. Human Approval
   AI가 만든 Task Draft는 사람이 승인해야 실행 가능하다.
   Objective relation은 review에서 accepted 또는 approved 상태여야 실행 가능하다.

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

> CodeFleet에서 안전한 오케스트레이션은 AI Agent에게 작업을 직접 맡기는 것이 아니라, accepted 또는 approved Objective relation, 승인된 Task revision, 비완화 Workspace Policy를 바탕으로 Harness가 최소 권한·격리·검증·추적 조건을 적용해 실행하고, 그 결과를 사람이 검토 가능한 Run Trace로 남기는 것이다.

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

> 현재 v0.1 구현은 최종 아키텍처가 아니라 seed implementation이다. 앞으로의 설계는 이 문서의 Core / Workspace / Profile / Objective / Task Queue / Task Draft / Harness / Run Trace / Run Summary 개념을 기준으로 재정렬한다.

## 15. 아직 논의할 항목

다음 항목은 아직 더 논의해야 한다.

```text
1. Harness 상세 정의
   - Draft Harness
   - Execution Harness
   - Guardrail 단계
   - Policy 병합 방식

2. Objective / Task Queue 최종 모델
   - objective.json snapshot 구조
   - ledger.jsonl 이벤트 종류
   - queue policy와 cursor 규칙
   - rebuild / validate 규칙

3. Task Spec 최종 모델
   - Intent에서 Draft로 바뀔 때 필요한 필드
   - objective proposed/approved relation 표현 방식
   - DRAFT/READY 승인 플로우
   - needsReview 표현 방식

4. Project Profile 최종 스키마
   - policies
   - defaults
   - references
   - local-only 설정 분리

5. Workspace discovery
   - 현재 cwd 기준
   - 부모 디렉터리 탐색
   - 명시적 --workspace 옵션

6. Run Summary 설계
   - summary.md 자동 생성
   - sanitization 규칙
   - Notion export adapter

7. Verification 실행 정책
   - prompt-only
   - manual command suggestion
   - allowlist 기반 자동 실행

8. Review 모델
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
4. 구현을 바로 하지 말고 최종 사용자 흐름을 먼저 검토한다.
5. 최종 사용자 흐름에서 Task Spec / Project Profile / Harness 책임을 역으로 확정한다.
6. 개념 합의 후 v0.2 구현 범위를 작게 자른다.
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
