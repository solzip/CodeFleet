# 초기 사고 기록 (Archive)

이 문서는 CodeFleet 초기 브레인스토밍 기록이다.

현재 설계의 source of truth가 아니다. 현재 기준 문서는 `docs/concept-foundation.md`이며, 세션 인계와 다음 작업 기준은 `docs/session-handoff.md`를 따른다.

이 문서는 참고용 archive로만 사용한다.

이 정의를 기준으로 보면 첫 설계 원칙은 명확합니다. AI를 호출하는 기능보다, AI가 한 일을 추적·검증·통제하는 구조가 먼저입니다.

10s 동안 생각함

좋습니다. 이 정의를 기준으로 만들면 CodeFleet은 이렇게 설계해야 합니다.

CodeFleet은 백엔드/인프라 작업을 Task로 정의하고,
AI 에이전트에게 역할 기반으로 위임하며,
실행 결과를 로그·diff·테스트·리뷰 기준으로 추적하는
AI-native 개발 오케스트레이션 CLI다.

이 문장에서 바로 핵심 구성요소가 나옵니다.

1. CodeFleet의 본질

CodeFleet은 단순히 이런 도구가 아닙니다.

Codex 실행기
프롬프트 생성기
AI CLI 래퍼

정확히는 이겁니다.

백엔드/인프라 작업을 AI에게 안전하게 위임하기 위한 작업 운영 시스템

즉, CodeFleet의 중심은 AI 모델이 아니라 작업 체계입니다.

AI는 실행자입니다.
CodeFleet은 작업을 정의하고, 제한하고, 실행시키고, 추적하고, 검증하는 Control Plane입니다.

2. 핵심 도메인 7개

이 정의를 기준으로 하면 CodeFleet은 아래 7개 개념을 중심으로 만들어야 합니다.

개념	의미
Task	AI에게 맡길 백엔드/인프라 작업 단위
AgentRole	AI가 어떤 역할로 일할지 정의
Scope	수정 가능한 파일/디렉터리 범위
Guardrail	금지 조건, 위험 명령 제한, 승인 필요 조건
Run	Task를 한 번 실행한 기록
Artifact	실행 결과물: prompt, log, diff, result, review
Verification	테스트, 빌드, lint, terraform plan, nginx -t 등 검증 절차

이 7개가 CodeFleet의 뼈대입니다.

3. 전체 실행 흐름

CodeFleet의 기본 흐름은 이렇게 가야 합니다.

DEFINE
→ PLAN
→ EXECUTE
→ COLLECT
→ VERIFY
→ REVIEW
→ CLOSE

각 단계는 이렇게 해석하면 됩니다.

단계	의미
DEFINE	Task YAML로 작업을 정의
PLAN	AI가 작업 계획을 세움
EXECUTE	AI가 실제 코드/설정 수정
COLLECT	stdout, stderr, diff, 변경 파일 수집
VERIFY	테스트/빌드/검증 명령 실행
REVIEW	AI 또는 사람이 변경 내용 검토
CLOSE	성공/실패/보류 상태 기록

처음부터 모든 단계를 자동화할 필요는 없습니다.

v0.1에서는 이 정도면 충분합니다.

DEFINE → PROMPT 생성 → DRY_RUN 기록

v0.2에서 이렇게 확장합니다.

DEFINE → ROLE 기반 PROMPT → EXECUTE → DIFF 저장

v0.3에서 이렇게 갑니다.

DEFINE → EXECUTE → VERIFY → REVIEW
4. 가장 먼저 만들어야 하는 것

처음부터 “멀티 에이전트”를 만들면 안 됩니다.

가장 먼저 만들어야 하는 건 이것입니다.

Task Spec + Prompt Builder + Run Trace

즉:

작업을 구조화해서 정의할 수 있어야 함
그 작업을 AI에게 전달할 프롬프트로 변환할 수 있어야 함
실행 결과를 추적 가능하게 남길 수 있어야 함

이 3개가 없으면 뒤에 뭘 붙여도 그냥 프롬프트 자동 실행기에 그칩니다.

5. Task 설계

Task는 CodeFleet의 핵심입니다.

백엔드/인프라 작업을 AI에게 넘기려면 최소한 아래 정보가 필요합니다.

id: task-001
title: "svc-gateway 401/403 응답 구조 점검"
type: BACKEND
agentRole: BACKEND_REVIEWER

projectPath: "C:/work/example-msa"

goal: >
svc-gateway의 401/403 응답이 ApiResponse + Meta 구조를 유지하는지 점검하고,
필요한 경우 최소 수정안을 제안한다.

scope:
include:
- "svc-gateway/src/main/java/**"
exclude:
- "**/target/**"
- "**/build/**"
- "**/.env"
- "**/application-prod.yml"

guardrails:
mode: SUGGEST_ONLY
allowFileEdit: false
allowCommandExecution: false
blockedCommands:
- "rm"
- "del"
- "terraform apply"
- "kubectl delete"
- "docker compose down"
- "systemctl restart"

constraints:
- "JWT 토큰 원문을 로그에 남기지 않는다."
- "기존 인증 흐름을 임의로 변경하지 않는다."
- "Gateway의 whitelist 정책을 변경하지 않는다."

verification:
commands:
- "mvn test"
required: false

doneCriteria:
- "401/403 응답 흐름을 설명한다."
- "ApiResponse 구조 위반 가능성을 판단한다."
- "수정 필요 시 변경 파일과 이유를 제시한다."
- "테스트 가능 여부를 설명한다."

workflow:
- PLAN
- REVIEW

status: READY

여기서 중요한 건 agentRole, scope, guardrails, verification입니다.

이 4개가 있어야 “AI에게 일을 맡긴다”가 아니라 AI에게 통제된 방식으로 일을 위임한다가 됩니다.

6. AgentRole 설계

초기 AgentRole은 너무 많이 만들 필요 없습니다.

네 방향 기준으로는 이 정도가 적당합니다.

BACKEND_IMPLEMENTER
BACKEND_REVIEWER
BACKEND_REFACTORER
INFRA_OPERATOR
INFRA_DEBUGGER
IAC_ENGINEER
DOCS_WRITER

각 역할은 이렇게 정의합니다.

AgentRole	역할
BACKEND_IMPLEMENTER	API, 서비스 로직, DTO, 예외 처리, 테스트 구현
BACKEND_REVIEWER	코드 리뷰, 사이드이펙트 점검, 구조 검토
BACKEND_REFACTORER	중복 제거, 계층 분리, 유지보수성 개선
INFRA_OPERATOR	systemd, Nginx, Docker, 배포 스크립트 작업
INFRA_DEBUGGER	로그 분석, 장애 원인 추정, 재현 절차 정리
IAC_ENGINEER	Terraform, AWS, VPC, RDS, EC2, SG 작업
DOCS_WRITER	README, 운영 문서, 장애 대응 문서 작성

처음에는 실제 AI가 여러 개일 필요 없습니다.

Codex 하나를 쓰더라도 프롬프트에 이렇게 넣으면 됩니다.

너는 BACKEND_REVIEWER 역할이다.
코드 변경보다 구조 검토, 사이드이펙트 분석, 테스트 가능성 판단에 집중해라.

이게 v0.1~v0.2 단계의 현실적인 멀티 에이전트 접근입니다.

7. Guardrail이 핵심이다

백엔드/인프라 특화 도구라면 Guardrail은 필수입니다.

AI에게 인프라 작업을 맡길 때 가장 위험한 건 이것들입니다.

운영 설정 파일 수정
DB migration
terraform apply
docker compose down
systemctl restart
rm -rf
secret 노출
prod 환경 접속
무관한 리팩토링

그래서 실행 모드를 나눠야 합니다.

Mode	의미
DRY_RUN	프롬프트와 실행 기록만 생성
SUGGEST_ONLY	분석/제안만 허용, 파일 수정 금지
WORKSPACE_EDIT	지정된 scope 안에서 파일 수정 허용
COMMAND_EXEC	허용된 명령만 실행 가능
APPROVAL_REQUIRED	위험 명령은 사람 승인 필요

초기에는 DRY_RUN과 SUGGEST_ONLY만 있어도 됩니다.

바로 COMMAND_EXEC까지 열면 위험합니다.

8. Verification 설계

CodeFleet의 차별점은 “AI가 했다”가 아니라 검증까지 추적했다여야 합니다.

백엔드/인프라 작업별 검증 명령은 다릅니다.

백엔드
mvn test
gradle test
npm test
npm run lint
npm run typecheck
Docker
docker compose config
docker compose build
docker compose up -d --dry-run 성격의 검증
Nginx
nginx -t
systemd
systemd-analyze verify <unit-file>
Terraform
terraform fmt -check
terraform validate
terraform plan

단, terraform apply는 기본 금지입니다.

CodeFleet의 검증 구조는 이렇게 가야 합니다.

verification:
commands:
- "terraform fmt -check"
- "terraform validate"
- "terraform plan"
required: true
allowFailure: false

그리고 실행 결과는 run 디렉터리에 남깁니다.

.codefleet/runs/<run-id>/
├── verification/
│   ├── 001-terraform-fmt.log
│   ├── 002-terraform-validate.log
│   └── 003-terraform-plan.log
9. Run Trace 구조

실행 기록은 반드시 사람이 읽기 쉬워야 합니다.

추천 구조는 이겁니다.

.codefleet/
├── tasks/
│   └── task-001.yaml
├── runs/
│   └── 2026-05-27_001/
│       ├── task.yaml
│       ├── prompt.md
│       ├── agent-role.md
│       ├── stdout.log
│       ├── stderr.log
│       ├── commands.log
│       ├── git-diff.patch
│       ├── changed-files.txt
│       ├── verification/
│       │   ├── 001-mvn-test.log
│       │   └── result.json
│       ├── review.md
│       └── result.json
└── config.json

이 구조가 중요한 이유는 명확합니다.

나중에 포트폴리오에서 이렇게 말할 수 있습니다.

AI 에이전트 실행 결과를 prompt, stdout/stderr, git diff, 테스트 로그, 리뷰 파일 단위로 추적 가능하게 설계했다.

이건 “AI 써서 개발함”보다 훨씬 강합니다.

10. Prompt Builder 설계

Prompt Builder는 CodeFleet의 핵심 엔진입니다.

Task YAML을 읽어서 역할별 프롬프트를 생성해야 합니다.

구조는 이렇게 가면 됩니다.

Task YAML
→ 공통 지시문
→ AgentRole 지시문
→ Scope 지시문
→ Guardrail 지시문
→ Verification 지시문
→ Output Format 지시문
→ prompt.md

프롬프트는 대략 이런 구조가 좋습니다.

# CodeFleet Task Execution Prompt

## 1. 역할

너는 BACKEND_REVIEWER 역할의 AI 개발 에이전트다.

이 역할의 목표는 백엔드 코드의 구조, 사이드이펙트, 예외 처리, 응답 형식, 테스트 가능성을 점검하는 것이다.

## 2. 작업 목표

svc-gateway의 401/403 응답이 ApiResponse + Meta 구조를 유지하는지 점검한다.

## 3. 작업 범위

수정 또는 분석 허용 범위:

- svc-gateway/src/main/java/**

제외 범위:

- **/target/**
- **/.env
- **/application-prod.yml

## 4. 제약 조건

- JWT 토큰 원문을 로그에 남기지 말 것
- 기존 인증 흐름을 임의로 변경하지 말 것
- 관련 없는 리팩토링 금지

## 5. 실행 모드

SUGGEST_ONLY

파일을 수정하지 말고 분석과 제안만 수행하라.

## 6. 완료 기준

- 401/403 응답 흐름 설명
- ApiResponse 구조 위반 가능성 판단
- 수정 필요 시 변경 파일과 이유 제시
- 테스트 가능 여부 설명

## 7. 응답 형식

다음 형식으로 결과를 작성하라.

### 요약
### 분석한 파일
### 발견한 문제
### 수정 제안
### 테스트/검증 방법
### 위험 요소
### 다음 단계

이렇게 해야 결과가 매번 제각각이 아니라 추적 가능한 형태로 나옵니다.

11. CLI 명령어 설계

초기 CLI는 단순해야 합니다.

v0.1 필수
codefleet init
codefleet run <task-id>
codefleet prompt <task-id>
v0.2
codefleet task validate <task-id>
codefleet runs
codefleet show <run-id>
v0.3
codefleet verify <run-id>
codefleet review <run-id>
codefleet retry <run-id>
v0.4 이후
codefleet agent list
codefleet policy check <task-id>
codefleet report <run-id>

초기에는 너무 많이 만들 필요 없습니다.

가장 중요한 건:

codefleet run task-001

했을 때 .codefleet/runs/... 아래에 추적 가능한 결과가 남는 것입니다.

12. 내부 아키텍처

TypeScript 기준이면 이런 구조가 적당합니다.

src/
├── cli/
│   ├── index.ts
│   └── commands/
│       ├── init.command.ts
│       ├── run.command.ts
│       ├── prompt.command.ts
│       └── validate-task.command.ts
│
├── domain/
│   ├── task.ts
│   ├── run.ts
│   ├── agent-role.ts
│   ├── guardrail.ts
│   └── verification.ts
│
├── services/
│   ├── task-loader.ts
│   ├── task-validator.ts
│   ├── prompt-builder.ts
│   ├── run-manager.ts
│   ├── diff-collector.ts
│   └── verification-runner.ts
│
├── agents/
│   ├── agent-adapter.ts
│   └── codex-adapter.ts
│
├── storage/
│   ├── file-store.ts
│   └── paths.ts
│
└── utils/
├── shell.ts
├── time.ts
└── logger.ts

이 정도면 충분합니다.

주의할 점은 CodexAdapter가 중심이 되면 안 됩니다.

중심은 이것들입니다.

Task
PromptBuilder
RunManager
TraceStore

Codex는 교체 가능한 Adapter여야 합니다.

13. v0.1, v0.2, v0.3 로드맵
    v0.1 — CLI 골격

목표:

Task를 읽고 Prompt와 Run Trace를 생성한다.

기능:

codefleet init
codefleet run <task-id>
YAML Task 로딩
Task 검증
Prompt 생성
Run 디렉터리 생성
result.json 저장
dry-run 기본 지원

이 단계에서는 실제 Codex 실행이 없어도 됩니다.

v0.2 — 백엔드/인프라 역할 기반 확장

목표:

AgentRole에 따라 다른 프롬프트를 생성한다.

기능:

agentRole 필드 추가
역할별 prompt template
guardrails 추가
backend/infra task sample 추가
README 방향성 수정

여기서 CodeFleet의 정체성이 확정됩니다.

v0.3 — 실행 추적 강화

목표:

실제 실행 결과를 diff와 검증 로그로 추적한다.

기능:

git diff 저장
changed files 저장
verification command 실행
commands.log 저장
review.md 생성
v0.4 — Codex 실행 연동

목표:

CodexAdapter를 통해 실제 Codex 실행까지 연결한다.

기능:

codex command 설정
execute mode
stdout/stderr 수집
실패 상태 기록
retry 기반 마련

이 단계에서야 진짜 Codex 오케스트레이션이 됩니다.

14. 중요한 설계 판단

내 기준으로 CodeFleet에서 가장 중요한 판단은 이겁니다.

AI 실행보다 Task 명세가 우선

AI를 바로 호출하면 안 됩니다.

먼저 작업을 이렇게 구조화해야 합니다.

무엇을 할 것인가
어디까지 해도 되는가
무엇을 하면 안 되는가
성공 기준은 무엇인가
검증은 어떻게 할 것인가
결과를 어디에 남길 것인가

이게 없으면 AI가 잘해도 재현성이 없고, 못하면 추적이 안 됩니다.

인프라 작업은 기본적으로 보수적으로

인프라 작업은 초기에는 SUGGEST_ONLY가 기본이어야 합니다.

예를 들어:

type: INFRA
agentRole: INFRA_OPERATOR
guardrails:
mode: SUGGEST_ONLY
allowFileEdit: false
allowCommandExecution: false

인프라 쪽에서 바로 실행을 열면 위험합니다.

처음에는 AI가 다음까지만 하게 해야 합니다.

설정 파일 분석
수정 제안
명령어 제안
검증 절차 작성
롤백 절차 작성

실제 적용은 사람이 합니다.

백엔드는 제한된 scope 안에서 수정 허용 가능

백엔드 작업은 v0.3 이후부터 WORKSPACE_EDIT를 열어도 됩니다.

단, 반드시 scope가 있어야 합니다.

scope:
include:
- "svc-goods/src/main/java/com/example/goods/donation/**"
exclude:
- "**/application*.yml"
- "**/target/**"
15. CodeFleet을 네 실제 업무에 적용하면

네 업무 기준으로 Task 예시는 이런 것들이 됩니다.

백엔드 리뷰
Gateway 401/403 응답 구조 점검
ApiResponse 일관성 검토
JWT 인증 흐름 사이드이펙트 분석
백엔드 구현
Donation API 응답 DTO 정리
Controller success response ApiResponse<T> 통일
GlobalExceptionHandler 적용 여부 점검
인프라 운영
systemd unit 파일 검토
Nginx blue/green upstream 전환 절차 문서화
환경변수 누락 점검
인프라 장애 분석
Redis health DOWN 원인 분석
Eureka instance-id 템플릿 문제 재현
Gateway route mismatch 로그 분석
IaC
Terraform VPC 구성 검토
Security Group ingress 정책 리뷰
RDS 전환 시 변수 구조 제안
문서화
운영 장애 대응 문서 작성
배포 절차 README 정리
포트폴리오용 아키텍처 설명 작성

이런 작업이 CodeFleet의 주 대상입니다.

16. 지금 Codex 작업이 끝난 뒤 다음 프롬프트 방향

지금 v0.1 골격을 만들고 있다면, 다음 프롬프트는 이렇게 가면 됩니다.

CodeFleet의 프로젝트 정의를 다음과 같이 확정한다.

CodeFleet은 백엔드/인프라 작업을 Task로 정의하고,
AI 에이전트에게 역할 기반으로 위임하며,
실행 결과를 로그·diff·테스트·리뷰 기준으로 추적하는
AI-native 개발 오케스트레이션 CLI다.

현재 구현된 v0.1 구조를 유지하면서,
이 정의에 맞게 v0.2 설계를 반영해라.

이번 작업에서는 전체 구조를 갈아엎지 말고,
다음 개념을 최소 변경으로 추가해라.

1. Task에 agentRole 필드를 추가한다.
2. Task에 guardrails 필드를 추가한다.
3. Task에 verification 필드를 추가한다.
4. agentRole에 따라 프롬프트에 역할별 지시문이 포함되도록 PromptBuilder를 수정한다.
5. 초기 agentRole은 다음으로 제한한다.
    - BACKEND_IMPLEMENTER
    - BACKEND_REVIEWER
    - BACKEND_REFACTORER
    - INFRA_OPERATOR
    - INFRA_DEBUGGER
    - IAC_ENGINEER
    - DOCS_WRITER
6. 인프라 작업은 기본적으로 SUGGEST_ONLY 모드가 되도록 설계한다.
7. README에 CodeFleet의 정의와 백엔드/인프라 특화 방향을 반영한다.
8. 백엔드 작업 샘플 Task와 인프라 작업 샘플 Task를 각각 하나씩 추가한다.
9. 아직 실제 운영 명령 실행, DB, 웹 UI, 병렬 에이전트 실행은 구현하지 마라.
10. v0.2는 역할 기반 프롬프트와 추적 구조의 기반을 만드는 것에 집중한다.

작업 전 현재 구조를 먼저 확인하고,
최소 변경으로 구현해라.
17. 결론

이 정의를 기준으로 만들면 CodeFleet은 이렇게 만들어야 합니다.

1. Task를 중심에 둔다.
2. AgentRole로 AI의 역할을 제한한다.
3. Scope로 수정 범위를 제한한다.
4. Guardrail로 위험 행동을 막는다.
5. Run Trace로 실행 결과를 남긴다.
6. Verification으로 결과를 검증한다.
7. Review로 사람이 판단할 수 있게 만든다.

가장 중요한 우선순위는 이겁니다.

AI 실행 자동화보다
AI 작업의 정의·제한·추적·검증 구조를 먼저 만든다.

이 방향이면 CodeFleet은 단순한 Codex 래퍼가 아니라, 네가 말한 백엔드/인프라 개발자의 포지션 변화를 실제 프로젝트로 증명하는 도구가 됩니다.
