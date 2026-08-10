# CodeFleet v0.1 Architecture

이 문서는 CodeFleet v0.1의 현재 구현 구조를 텍스트 기반 다이어그램으로 정리한다.

Mermaid 렌더링이 되지 않는 환경에서도 그대로 읽을 수 있도록 ASCII 다이어그램과 표 중심으로 작성했다.

## 1. 목표

CodeFleet v0.1의 목표는 다음 한 문장으로 요약된다.

> CodeFleet v0.1은 Codex를 개발 작업 단위로 실행, 추적, 검토하기 위한 Codex 기반 개발 오케스트레이션 CLI 도구다.

현재 버전은 완성형 멀티 에이전트 플랫폼이 아니다. v0.1은 다음 기반을 작게 만든다.

- YAML 기반 Task 정의
- Task 검증
- Codex용 Prompt 생성
- Run 디렉터리 생성
- 실행 로그 및 결과 저장
- git diff 저장
- Agent Adapter 확장 지점
- 기본 dry-run 실행

## 2. 전체 구조

```text
User / Developer
      |
      v
+------------------+
|  CodeFleet CLI   |
+------------------+
      |
      +------------------+
      |                  |
      v                  v
+-------------+    +----------------+
| init command|    | task validate  |
+-------------+    +----------------+
      |                  |
      v                  v
.codefleet/       Task Loader / Validator
                         |
                         v
                 .codefleet/tasks/*.yaml


User / Developer
      |
      v
+------------------+
| codefleet run    |
+------------------+
      |
      v
+------------------+
| Run Orchestrator |
+------------------+
      |
      +--> load config.json
      +--> load task.yaml
      +--> validate task
      +--> create run directory
      +--> copy original task
      +--> render prompt.md
      +--> call Agent Adapter
      +--> capture git diff
      +--> write result.json
      |
      v
.codefleet/runs/<run-id>/
```

## 3. 주요 컴포넌트

| 컴포넌트 | 파일 | 책임 |
| --- | --- | --- |
| CLI | `src/cli.ts` | 명령어 라우팅, 콘솔 출력, 사용자 입력 인자 처리 |
| Config | `src/config.ts` | `.codefleet` 초기화, `config.json` 로딩 |
| Task | `src/task.ts` | Task YAML 파일 탐색, 로딩, 필수 값 검증 |
| YAML Parser | `src/yaml.ts` | v0.1 Task 형식에 필요한 최소 YAML 파싱 |
| Prompt | `src/prompt.ts` | Task를 Codex용 `prompt.md`로 변환 |
| Run | `src/run.ts` | Run 생명주기 관리, 산출물 저장, git diff 캡처 |
| Agent Adapter | `src/agent.ts` | AI 코딩 도구 실행 추상화, 현재는 Codex Adapter 구현 |
| Domain Types | `src/types.ts` | Task, Run, Config, Agent 타입 정의 |

## 4. CLI 명령 구조

```text
codefleet
  |
  +-- init
  |     |
  |     +-- create .codefleet/tasks
  |     +-- create .codefleet/runs
  |     +-- create .codefleet/config.json
  |
  +-- task validate <task-id>
  |     |
  |     +-- read .codefleet/tasks/<task-id>.yaml
  |     +-- validate required fields
  |
  +-- prompt <task-id>
  |     |
  |     +-- read task
  |     +-- validate task
  |     +-- write .codefleet/prompts/<task-id>.md
  |
  +-- run <task-id>
  |     |
  |     +-- read config
  |     +-- read task
  |     +-- validate task
  |     +-- create run directory
  |     +-- write run artifacts
  |
  +-- status
  |     |
  |     +-- show config, task count, run count
  |
  +-- runs
        |
        +-- list run results
```

## 5. 파일 시스템 모델

CodeFleet v0.1은 DB를 사용하지 않는다. 모든 상태는 로컬 파일 시스템에 저장된다.

```text
Project Root
  |
  +-- .codefleet/
  |     |
  |     +-- config.json
  |     |
  |     +-- tasks/
  |     |     |
  |     |     +-- task-001.yaml
  |     |
  |     +-- prompts/
  |     |     |
  |     |     +-- task-001.md
  |     |
  |     +-- runs/
  |           |
  |           +-- 2026-05-27_001/
  |                 |
  |                 +-- task.yaml
  |                 +-- prompt.md
  |                 +-- stdout.log
  |                 +-- stderr.log
  |                 +-- git-diff.patch
  |                 +-- result.json
  |
  +-- src/
  +-- README.md / README.en.md
  +-- package.json
```

## 6. Task 모델

Task는 개발 작업 정의다. v0.1에서 필요한 최소 필드는 다음과 같다.

| 필드 | 설명 |
| --- | --- |
| `id` | Task 식별자 |
| `title` | 작업 제목 |
| `projectPath` | 대상 프로젝트 경로 |
| `goal` | 작업 목표 |
| `scope.include` | 수정 허용 범위 |
| `scope.exclude` | 수정 제외 범위 |
| `constraints` | 제약 조건 |
| `doneCriteria` | 완료 기준 |
| `workflow` | 실행 단계 목록 |
| `status` | Task 상태 |

예시:

```yaml
id: task-001
title: "API response structure standardization"
projectPath: "."
goal: "Make successful controller responses use a common ApiResponse<T> shape."
scope:
  include:
    - "src/main/java/**"
  exclude:
    - "src/main/resources/application*.yml"
constraints:
  - "Do not change the database schema."
doneCriteria:
  - "Successful controller responses return ApiResponse<T>."
workflow:
  - PLAN
  - IMPLEMENT
  - REVIEW
status: READY
```

## 7. Run 실행 흐름

`codefleet run <task-id>`는 아래 순서로 동작한다.

```text
1. CLI receives command
   |
   v
2. Load .codefleet/config.json
   |
   v
3. Find .codefleet/tasks/<task-id>.yaml
   |
   v
4. Parse YAML
   |
   v
5. Validate required Task fields
   |
   v
6. Generate runId
   |
   v
7. Create .codefleet/runs/<run-id>/
   |
   v
8. Copy original task.yaml
   |
   v
9. Render prompt.md
   |
   v
10. Run Agent Adapter
    |
    +-- dry-run mode:
    |     |
    |     +-- do not execute Codex
    |     +-- return DRY_RUN result
    |
    +-- execute mode:
          |
          +-- execute configured Codex command
          +-- collect stdout, stderr, exitCode
   |
   v
11. Write stdout.log and stderr.log
   |
   v
12. Capture git diff
   |
   v
13. Write git-diff.patch
   |
   v
14. Write result.json
   |
   v
15. Print run summary
```

## 8. Run 산출물

각 Run은 독립된 디렉터리에 저장된다.

```text
.codefleet/runs/2026-05-27_001/
  |
  +-- task.yaml
  |     원본 Task 파일 복사본
  |
  +-- prompt.md
  |     Codex에게 전달할 구조화된 프롬프트
  |
  +-- stdout.log
  |     Agent 실행 표준 출력
  |
  +-- stderr.log
  |     Agent 실행 표준 에러
  |
  +-- git-diff.patch
  |     실행 후 대상 프로젝트의 git diff
  |
  +-- result.json
        Run 메타데이터와 최종 상태
```

`result.json` 예시:

```json
{
  "runId": "2026-05-27_001",
  "taskId": "task-001",
  "agent": "codex",
  "status": "DRY_RUN",
  "startedAt": "2026-05-27T15:30:00+09:00",
  "finishedAt": "2026-05-27T15:30:01+09:00",
  "promptPath": ".codefleet/runs/2026-05-27_001/prompt.md",
  "stdoutLogPath": ".codefleet/runs/2026-05-27_001/stdout.log",
  "stderrLogPath": ".codefleet/runs/2026-05-27_001/stderr.log",
  "diffPath": ".codefleet/runs/2026-05-27_001/git-diff.patch",
  "resultPath": ".codefleet/runs/2026-05-27_001/result.json",
  "exitCode": null
}
```

## 9. Prompt 생성 구조

Prompt는 Task 정보를 Codex가 바로 이해할 수 있는 작업 지시서로 바꾼다.

포함 내용:

- 작업 제목
- Task ID
- Task 상태
- 대상 프로젝트 경로
- 작업 목표
- 수정 허용 범위
- 수정 제외 범위
- 제약 조건
- 완료 기준
- Workflow
- 작업 규칙
- 최종 응답 요구사항

Prompt의 핵심 운영 규칙:

```text
- 작업 범위 밖의 파일을 수정하지 않는다.
- 제외 범위의 파일을 수정하지 않는다.
- 무관한 리팩토링이나 포맷팅 변경을 하지 않는다.
- 수정 전에 관련 파일을 먼저 분석한다.
- 완료 기준을 만족하는 가장 작은 변경을 선호한다.
- 테스트를 실행할 수 있다면 실행하고 결과를 보고한다.
- 테스트를 실행하지 못했다면 이유를 설명한다.
```

## 10. Agent Adapter 구조

v0.1에서는 Codex만 구현되어 있다. 하지만 실행 계층은 Codex에 직접 고정하지 않고 Adapter 인터페이스를 둔다.

```text
Run Orchestrator
      |
      v
+----------------------+
| AgentAdapter          |
|----------------------|
| name                 |
| run(input)           |
+----------------------+
      |
      v
+----------------------+
| CodexAdapter          |
|----------------------|
| dry-run: no execute  |
| execute: spawn cmd   |
+----------------------+
```

현재 확장 방식:

```text
createAgentAdapter(name)
  |
  +-- "codex"         -> CodexAdapter
  +-- future "claude" -> ClaudeCodeAdapter
  +-- future "gemini" -> GeminiCliAdapter
  +-- future "local"  -> LocalAgentAdapter
```

## 11. dry-run 모드

기본 설정은 `dry-run`이다.

```json
{
  "version": "0.1.0",
  "defaultAgent": "codex",
  "mode": "dry-run"
}
```

dry-run 모드의 목적:

- 실제 Codex 실행 없이 Task 구조 검증
- Prompt 품질 확인
- Run 디렉터리 저장 구조 확인
- 오케스트레이션 흐름 검증
- 사용자 실수로 인한 원치 않는 코드 변경 방지

dry-run에서도 생성되는 파일:

```text
task.yaml
prompt.md
stdout.log
stderr.log
git-diff.patch
result.json
```

## 12. execute 모드

`execute` 모드는 실제 Agent 실행을 위한 확장 지점이다.

```json
{
  "version": "0.1.0",
  "defaultAgent": "codex",
  "mode": "execute",
  "agents": {
    "codex": {
      "command": "codex",
      "args": ["exec", "-"]
    }
  }
}
```

현재 동작:

```text
1. prompt.md를 읽는다.
2. config에 정의된 Codex command와 args를 사용한다.
3. 대상 projectPath에서 프로세스를 실행한다.
4. prompt 내용을 stdin으로 전달한다.
5. stdout, stderr, exitCode를 수집한다.
6. 결과를 Run 산출물로 저장한다.
```

execute 모드는 Codex CLI 설치 환경에 따라 조정이 필요할 수 있다.

## 13. 현재 설계 결정

| 결정 | 이유 |
| --- | --- |
| CLI 우선 | v0.1은 실제 사용 가능한 최소 도구가 목표 |
| 로컬 파일 시스템 저장 | DB 없이 실행 이력과 산출물을 사람이 직접 확인 가능 |
| YAML Task | 개발 작업 정의를 사람이 읽고 수정하기 쉬움 |
| dry-run 기본값 | 초기 버전에서 원치 않는 코드 변경 위험을 줄임 |
| Agent Adapter 도입 | Codex로 시작하되 다른 Agent로 확장 가능 |
| 외부 의존성 없음 | 초기 스켈레톤을 작게 유지 |
| 웹 UI 없음 | 오케스트레이션 핵심 흐름에 집중 |

## 14. 확장 방향

v0.1 이후 자연스러운 확장 방향은 다음과 같다.

```text
Current v0.1
  |
  +-- stronger YAML parser
  +-- task create command
  +-- workflow phase execution
  +-- Codex execute mode hardening
  +-- Claude Code Adapter
  +-- Gemini CLI Adapter
  +-- Review Agent
  +-- Test Agent
  +-- Docs Agent
  +-- task dependency graph
  +-- GitHub issue / PR integration
  +-- run metrics
  +-- optional dashboard
```

중요한 원칙은 v0.1의 단순함을 유지하면서, Agent 실행부와 Run 기록 구조를 점진적으로 확장하는 것이다.

