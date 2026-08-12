# CodeFleet

한국어 | [English](README.en.md)

CodeFleet은 AI-native 개발 오케스트레이션 CLI다. 사용자의 개발/운영 Objective를 하나 이상의 Task로 구조화하고, 백엔드/인프라 작업을 범위·가드레일·검증 조건이 포함된 Task로 정의하며, 사람이 승인한 Task만 실행하고, 실행 결과를 로그·diff·Harness가 직접 실행한 검증·해시로 검사된 증거 기반의 리뷰 결정으로 추적한다.

핵심은 AI 모델을 호출하는 것이 아니다. 위임된 작업이 승인 결정을 수반하고, 강제되는 경계 안에서 실행되며, **에이전트의 주장에 의존하지 않는 증거**를 남기는 것이다.

## CodeFleet이 아닌 것

CodeFleet은 Codex 러너, 프롬프트 생성기, AI CLI 래퍼, 중앙 프로젝트 관리 도구, 웹 대시보드, DB 기반 태스크 시스템, CI/CD 대체재, 배포 도구, 시크릿 매니저, 완전한 샌드박스가 아니다. 이 경계는 고정이며 넓힐 계획이 없다.

## 전체 흐름

아래 각 단계는 하나의 명령이고, 각각 파일을 남긴다. 주장만으로 진행되는 단계는 없다.

| 단계 | 명령 | 남기는 것 |
| --- | --- | --- |
| 1. Objective | `objective create`, `objective attach` | `.codefleet/objectives/<id>/ledger.jsonl` |
| 2. Task 정의 | `.codefleet/tasks/<id>.yaml` 작성 후 `task validate` | 실행 계약 |
| 3. 승인 | `task approve <id> --reason <text>` | `.codefleet/tasks/<id>/task-ledger.jsonl` |
| 4. 실행 | `run <id>` | `.codefleet/runs/<run-id>/` |
| 5. 검증 | `run` 내부에서 실행 | `runs/<run-id>/verification/verify-NNN.json` |
| 6. 리뷰 | `review <run-id> --decision <D> --reason <text>` | `.codefleet/reviews/<review-id>/evidence-bundle.json` |
| 7. 기록 반영 | `objective import-review` | Objective ledger 이벤트 |

3단계 없이는 Run이 시작되지 않는다. 5단계 증거가 없으면 리뷰를 ACCEPTED로 기록할 수 없다.

## 현재 구현 범위

구현된 것: Objective ledger와 큐, Task revision/승인 ledger, Run Planning, Codex 어댑터 seam, 워크스페이스 상태와 diff에 대한 Harness 관측, path policy, command policy, Harness가 직접 실행하는 검증, 해시 검사를 포함한 리뷰 증거 번들, 단일 writer 워크스페이스 락, Task 단위 Run 락과 배타적 `runId` 예약.

구현되지 않은 것 — 암시하지 않고 명시한다:

- **AgentRole**은 `docs/concept-foundation.md` §11에 설계되어 있으나 코드가 없다. 모든 Run이 `defaults.run.agentAdapter` 하나를 사용하므로 아직 역할 기반 위임이 아니다.
- **Risk 엔진** — `computedRisk`는 항상 `UNKNOWN`이다 (`RISK_ENGINE_NOT_IMPLEMENTED_V02`).
- **실행 격리** — `isolation.mode`는 항상 `NONE`이다.
- **Harness가 볼 수 있는 command 채널** — 에이전트가 스스로 실행한 명령은 관측되지 않는다. [Execute 모드](#execute-모드) 참고.
- **VERIFIED와 큐 진행** — 로컬 리뷰는 이 둘을 만들어낼 수 없다. 로컬 리뷰는 향후 `RUN_REVIEW_DECIDED` ledger 이벤트를 위한 마이그레이션 입력이다.

제품 정의의 정본은 이 파일이 아니라 `docs/concept-foundation.md`다.

## 요구 사항

- Node.js 24 이상 (네이티브 TypeScript stripping)
- npm 또는 pnpm은 package script 편의를 원할 때만

이 프로젝트에는 외부 런타임 의존성이 없다.

## 설치

```bash
npm install
npm link
```

링크 없이 실행할 수도 있다:

```bash
node ./src/cli.ts --help
```

Windows PowerShell에서 npm 스크립트 실행이 제한된다면 `cmd.exe /c npm ...`을 쓰거나 Node를 직접 호출한다.

## 초기화

```bash
codefleet init
```

`.codefleet/tasks/`, `.codefleet/runs/`, `.codefleet/config.json`, `.codefleet/local.json`을 만든다. 나머지 디렉터리 — `objectives/`, `reviews/`, `prompts/`, `locks/` — 는 처음 필요할 때 생성된다.

`.codefleet/config.json`이 **Project Profile**이다. 커밋되고 공유되는 워크스페이스 정책이다.

```json
{
  "schemaVersion": "1.0.0",
  "project": { "id": "", "name": "" },
  "workspace": { "id": "codefleet-workspace" },
  "defaults": {
    "task": { "harnessMode": "DRY_RUN" },
    "run": { "agentAdapter": "codex", "isolationMode": "NONE" }
  },
  "policies": {
    "harness": {
      "allowedModes": ["DRY_RUN", "SUGGEST_ONLY", "WORKSPACE_EDIT", "COMMAND_EXEC"],
      "maxMode": "COMMAND_EXEC",
      "requireIsolationForMutation": true,
      "allowDegradedCommandObservation": false,
      "approvalRequiredForDestructiveCommands": true
    },
    "agentAdapters": { "allowedAdapters": ["codex"] },
    "files": {},
    "commands": {
      "allowedCommands": [],
      "deniedCommands": [],
      "destructiveCommands": [],
      "requireHarnessVisibleCommandChannel": true,
      "allowProviderReportedCommandTruth": false
    },
    "risk": {},
    "verification": {},
    "redaction": {},
    "carryForward": {},
    "agentRoles": {}
  },
  "references": {},
  "localPolicy": {
    "mergeMode": "RESTRICT_ONLY",
    "overlayPath": ".codefleet/local.json",
    "allowedLocalKeys": ["adapterCommand"]
  }
}
```

**top-level 키 7개와 `policies` 키 9개는 정확히 이 집합이어야 한다.** 빠진 키도 낯선 키도 똑같이 거부된다. 한쪽만 막으면 `policies`를 통째로 빠뜨린 프로파일이 "전부 허용"으로 읽히고, 그건 정책을 쓴 사람이 의도한 적 없는 상태다. 비어 있는 블록이라도 명시적으로 `{}`를 써야 "정책이 없다"와 "블록을 빠뜨렸다"가 구분된다.

모든 policy 기본값은 각 스위치의 가장 엄격한 쪽이다. 아무것도 말하지 않은 프로파일을 "전부 허용"으로 읽어서는 안 되기 때문이다. policy 블록의 알 수 없는 키도 무시하지 않고 거부한다. 오타 난 `deniedCommands`는 가득 찬 denylist처럼 보이는 빈 denylist이기 때문이다.

### Local Overlay

Project Profile은 **런타임 증거, 로컬 머신 상태, 자격증명을 담을 수 없다.** 커밋되어 공유되는 파일이기 때문이다. 어댑터 실행 경로가 대표적이다 — 그건 한 사람의 머신이지 워크스페이스의 정책이 아니다. 그래서 `.codefleet/local.json`으로 간다:

```json
{
  "adapterCommand": { "command": "codex", "args": ["exec", "-"] }
}
```

Overlay는 **좁힐 수만 있다**(`mergeMode: "RESTRICT_ONLY"`). `allowedLocalKeys`에 없는 키는 적용되지 않고 위반으로 기록된다. Overlay가 두 번째 검토받지 않은 정책 소스가 되지 못하게 하기 위해서다.

Profile 로더는 모든 깊이의 키 이름과 문자열 값을 훑어 다음을 거부하고, **몇 개를 훑었는지 함께 보고한다**. 0건 검사와 0건 발견이 같아 보이면 안 되기 때문이다:

- 런타임/로컬 상태를 가리키는 키 이름 (`stdout`, `diff`, `token`, `command`, `args`, `model` 등)
- 눈으로 식별 가능한 자격증명 형식의 값 (GitHub 토큰, AWS 액세스 키, 개인키 블록 등)
- 경로형 필드의 절대 경로. 워크스페이스 상대 경로여야 한다

## 1. Objective

Objective는 Task와 그에 대한 결정을 담는 큐다. append-only JSONL ledger이며, 스냅샷은 replay로 도출된다. 제자리에서 수정되지 않는다.

```bash
codefleet objective create obj-001 --title "API 응답 정리" --kind SEQUENCE
codefleet objective attach obj-001 task-001
codefleet objective status obj-001
```

`--kind`는 `ONE_OFF`(기본값), `SEQUENCE`, `WORKSTREAM` 중 하나다.

**relation은 선택이 아니다.** Run의 실행 허가는 두 축의 곱이다 — 승인된 Task Revision과 수용된 Objective relation. 어느 Objective에도 붙어 있지 않은 Task는 **실행이 거부된다.** 큐에 아무도 넣지 않은 일은 아무도 하기로 결정하지 않은 일이다.

`attach`는 revision과 그 해시를 **Task 원장에서 읽는다.** 인자로 받지 않는다 — 존재하지 않는 revision이나 원장이 기록한 적 없는 해시로 relation을 만들면 거부된다. `--revision`을 생략하면 승인된 revision에 붙는다.

relation은 **자기가 붙은 revision을 가리킨다.** rev1에 붙은 relation은 rev2 실행을 허가하지 않는다. 계약이 다르기 때문이다. 새 revision으로 옮기려면 그 revision을 승인해야 하고, 승인이 승계를 기록한다 — 승계가 기록된 방향으로만 relation이 이동한다. 옛 큐 항목은 다시 쓰지 않고 보존된다.

큐 아이템은 명시적 결정으로만 움직이며, 각 결정에는 reason이 필요하다:

```bash
codefleet objective block obj-001 <queue-item-id> --reason "스키마 결정 대기"
codefleet objective unblock obj-001 <queue-item-id> --reason "스키마 확정됨"
codefleet objective skip|unskip|cancel-item obj-001 <queue-item-id> --reason <text>
codefleet objective reorder obj-001 --order item-2,item-1 --reason "핫픽스 우선"
```

`objective status`는 아이템별 stored/derived 상태, replay 상태, 마지막 seq, 그리고 ledger와 스냅샷 사이의 drift를 출력한다. `objective rebuild`는 ledger로부터 `objective.json`을 다시 생성한다.

## 2. Task 정의

Task는 계약이다. 무엇을 할지, 어디까지 건드려도 되는지, 무엇을 하면 안 되는지, 어떻게 확인할지를 담는다. `.codefleet/tasks/task-001.yaml`을 만든다.

```yaml
id: task-001
title: "API 응답 구조 표준화"
projectPath: "."
goal: "성공 응답이 공통 ApiResponse<T> 형태를 사용하도록 만든다."
scope:
  include:
    - "src/main/java/**"
  exclude:
    - "src/main/resources/application*.yml"
verification:
  commands:
    - commandId: unit-tests
      command: ["mvn", "-q", "test"]
constraints:
  - "데이터베이스 스키마를 변경하지 않는다."
  - "작업 범위와 무관한 파일을 수정하지 않는다."
doneCriteria:
  - "성공 컨트롤러 응답이 ApiResponse<T>를 반환한다."
  - "실행 가능한 기존 테스트가 통과한다."
workflow:
  - PLAN
  - IMPLEMENT
  - REVIEW
```

동일한 샘플이 `examples/tasks/task-001.yaml`에 있다.

**강제되는 것과 서술에 그치는 것.** 기계가 강제하는 필드는 둘뿐이다:

- `scope.include` / `scope.exclude`는 `allowedPaths` / `deniedPaths`가 되어, Run 이후 Harness가 관측한 변경 파일에 대해 평가된다.
- `verification.commands`는 Harness가 직접 실행한다. 그래서 그 결과가 주장이 아니라 증거가 된다.

`constraints`, `doneCriteria`, `workflow`는 프롬프트와 리뷰어용 `run-record.md`에 렌더링된다. 에이전트에 대한 지시이자 사람을 위한 체크리스트일 뿐, 이를 강제하는 장치는 없다. 가드레일로 읽지 말 것.

첫 validation 오류 전에 알아둘 스키마 규칙 둘:

- scope 패턴은 whole-path 매칭이며 하위 트리를 암묵적으로 포함하지 않는다. `src`는 이름이 정확히 `src`인 파일만 매칭한다. `src/**`로 써야 한다.
- `verification.commands[].command`는 argv 배열이며 셸 문자열이 아니다. 셸 인터프리터는 거부된다. command 매칭이 의미를 유지해야 하기 때문이다.
- `command[0]`은 매칭과 실행 모두에서 basename으로 정규화된다. 따라서 `./gradlew` 같은 상대 스크립트 경로는 해석되지 않는다. `PATH`에 있는 명령을 사용할 것.

Task 파일에는 `status` 필드가 없다. 실행 결과는 계약이 아니므로 계약 문서에 넣지 않는다 — `status`를 선언한 Task는 validation에서 거부된다. 실행 상태는 `codefleet status`(Task별 최신 Run)와 `codefleet runs`(모든 Run과 그 결과)에서 본다.

```bash
codefleet task validate task-001
codefleet prompt task-001     # .codefleet/prompts/task-001.md 생성, 실행은 하지 않음
```

## 3. Task 승인

승인되지 않은 Task에 대해서는 Run이 시작을 거부한다. 승인은 Task id가 아니라 **파일의 content hash에 바인딩**된다.

```bash
codefleet task approve task-001 --reason "범위와 검증 조건 확인함"
codefleet task status task-001
codefleet task revision task-001 1        # 승인된 계약 본문
codefleet task revision task-001 1 --json # 계약 + 해시 + 결정 참조
```

`approve`는 validation을 통과하지 못한 Task를 거부한다. 유효하지 않은 Task는 실행 계약이 될 수 없기 때문이다. 승인은 revision과 approval을 함께 만들어 `.codefleet/tasks/task-001/task-ledger.jsonl`에 append하고, 승인된 계약 본문을 `.codefleet/tasks/task-001/revisions/0001.json`에 고정한다.

`approve`는 **실행할 수 없는 계약도 거부한다.** verification 커맨드를 선언했는데 `agentRole`과 프로파일이 함께 만드는 상한이 `COMMAND_EXEC`에 못 미치면 승인 자체가 막힌다. 승인이 "실행해도 된다"가 아니라 "실행을 시도해도 된다"가 되는 것을 막기 위해서다.

**Revision 산출물.** 원장은 승인된 해시를 기록하지만, 해시는 파일이 그대로 남아 있을 때만 대조할 수 있다. Task를 수정하면 승인된 본문 자체가 사라진다. `revisions/<n>.json`이 그 본문을 고정한다:

- immutable Task contract (승인된 바이트 그대로)
- contentHash
- approval target hash / approval decision reference
- objective relation snapshot

이 파일은 **source이지 권위가 아니다.** 현재 승인 상태와 Objective relation은 원장 replay로 계산한다. 승인이 나중에 무효화돼도 이 파일은 고쳐 쓰지 않는다 — 무효화된 승인에도 계약은 있었고, 그 사본은 이것뿐이다. 읽을 때마다 본문을 다시 해시해서 대조하므로, 변조된 계약은 반환되지 않고 거부된다.

`task status`는 Draft 상태와 Revision 상태를 나눠서 출력한다. 설계가 둘을 별개 상태 기계로 규정하기 때문이다.

| Draft 상태 | 의미 |
| --- | --- |
| `READY_FOR_APPROVAL` | validate와 실행 가능성 검사를 모두 통과 — 승인 가능 |
| `EDITING` | 그 외. 막는 이유를 함께 출력한다 |

| Revision 상태 | 의미 |
| --- | --- |
| `APPROVED` | 유효한 승인이 있는 불변 계약 |
| `INVALIDATED` | 승인이 철회됨 |
| `SUPERSEDED` | `TASK_REVISION_SUPERSEDED`가 대체를 기록함 |

설계의 `REJECTED`(Draft)와 `CANCELED`(Revision)는 아직 어떤 이벤트도 만들지 않으므로 출력되지 않는다. 도달할 수 없는 상태를 목록에 넣지 않는 쪽을 택했다.

실행 불가일 때 사유는 다음 중 하나다:

| `blockedReason` | 의미 |
| --- | --- |
| `NO_REVISION_CREATED` | 승인된 적 없음 |
| `NO_VALID_APPROVAL` | 승인이 무효화됨 |
| `TASK_CONTENT_CHANGED_AFTER_APPROVAL` | 승인 이후 파일이 수정됨 |
| `PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL` | 파일은 그대로지만 승인 당시의 가드레일이 바뀜 |

승인된 Task를 수정해도 승인이 조용히 따라오지 않는다. 수정된 내용을 다시 승인하려면:

```bash
codefleet task invalidate task-001 --reason "범위가 넓어짐"
codefleet task approve task-001 --reason "범위 변경 후 재검토함"
```

`--actor <actorId>`로 결정 주체를 기록한다. 기본값은 `local-user`다.

## 4. 실행

```bash
codefleet run task-001
```

Run은 어댑터에 제어를 넘기기 전에 계획된다. 승인을 먼저 확인하고, 그 다음 command 채널을 확인하고, 그 다음 워크스페이스 스냅샷을 캡처한다. 계획이 차단되면 Run 디렉터리 자체가 생성되지 않는다.

기본 모드인 `dry-run`은 에이전트 프로세스를 실행하지 않는다. 그럼에도 아티팩트 세트는 전부 생성되므로, 에이전트 실행을 소모하기 전에 Task를 점검하는 용도로 유용하다.

## 5. 검증

Task의 검증 명령은 에이전트가 아니라 **Harness가 직접** 실행하며, preflight에서 command policy로 검사된다. 각 시도는 자신의 stdout, stderr, exit code, authority를 기록한다:

```text
runs/<run-id>/verification/verify-001.json
runs/<run-id>/verification/verify-001/unit-tests.stdout.log
runs/<run-id>/verification/verify-001/unit-tests.stderr.log
```

`verify-001.json`은 `authority`, `observedCheck`, gate 결과와 함께 기록/실행/차단된 시도 수를 담은 `scanScope`를 남긴다. 모든 명령이 policy로 차단된 Run이 전부 통과한 Run처럼 보여서는 안 되기 때문이다.

`dry-run`에서는 command 실행이 비활성이므로 모든 검증 시도가 `COMMAND_EXECUTION_DISABLED`로 차단되고, `observedCheck`는 `SKIP`, gate는 `NOT_SATISFIED / BLOCKED`가 된다. **따라서 dry-run은 ACCEPTED 리뷰를 만들어낼 수 없다.** 이는 우회할 제약이 아니라 의도된 형태다.

`verification` 블록이 없는 Task는 `NO_VERIFICATION_COMMANDS_CONFIGURED`와 함께 동일하게 만족되지 않은 gate를 받는다. 검증은 effective policy가 요구하는 항목이며, 설정하지 않는 것이 통과를 의미하지 않는다.

## 6. 리뷰

```bash
codefleet review 2026-05-27_001 --decision ACCEPTED --reason "diff가 목표와 일치, 테스트 통과"
```

`--decision`은 `ACCEPTED`, `REJECTED`, `NEEDS_CHANGES` 중 하나다. 이 명령은 먼저 증거 번들을 만든다. 모든 입력 참조를 디스크 파일과 다시 해시 비교하고, Run의 unavailable 사유를 뭉뚱그리지 않고 개별적으로 옮긴다.

갭은 두 종류이며 다르게 다뤄진다:

- **`CAPABILITY_GAP`** — CodeFleet이 아직 관측할 수 없는 것. 사람이 저장소를 직접 확인해 대신할 수 있으며, 사유를 붙여 항목 단위로 waive할 수 있다.
- **`EVIDENCE_DEFECT`** — 증거가 없거나, 읽을 수 없거나, 기록된 해시와 일치하지 않는 것 (`HASH_INVALID`, `ARTIFACT_NOT_READABLE`, `MISSING_INPUT_REF`). 누구도 대신할 수 없다. 절대 waive되지 않는다.

`ACCEPTED`는 모든 갭이 waive되었거나 없고, 정규화된 result가 `DONE`이며, 검증 gate가 만족되고, path 위반이 없을 때만 허용된다. 거부 시 차단 사유가 모두 나열된다.

```bash
codefleet review 2026-05-27_001 \
  --decision ACCEPTED \
  --reason "저장소에서 직접 확인함" \
  --waive-gap COMMAND_CHANNEL_NOT_HARNESS_VISIBLE \
  --waive-reason "전체 diff를 읽고 테스트를 수동으로 재실행함"
```

기타 옵션: `--actor <actorId>`, `--note <path>`, `--ai-review-file <path>` (AI 리뷰는 힌트일 뿐 결정 진실이 아니다), `--supersedes <localReviewId>`.

리뷰는 `.codefleet/reviews/<run-id>-review-NNN/evidence-bundle.json`과 `.codefleet/runs/<run-id>/review-decision.local.json`을 쓰고, `run-record.md`를 갱신해 하나의 읽을 수 있는 파일이 결과까지 담게 한다. `localReviewStatus`는 `MIGRATION_READY`, `MIGRATION_READY_WAIVED`, `DEGRADED_RECORDED`, `MIGRATION_BLOCKED`, `SUPERSEDED` 중 하나다.

거부된 `ACCEPTED`도 증거 번들은 남긴다. 거부 자체를 나중에 확인할 수 있어야 하기 때문이며, 다음 리뷰는 그 다음 `-review-NNN` id를 받는다.

로컬 리뷰는 `VERIFIED`를 만들지 않고 큐를 진행시키지 않는다. Objective에 기록하려면:

```bash
codefleet objective import-review obj-001 2026-05-27_001 --reason "수동 확인 후 수락"
```

`import-review`는 `MIGRATION_READY` 또는 `MIGRATION_READY_WAIVED`만 받는다. 그 외는 거부된다 — `local review status DEGRADED_RECORDED cannot be imported`. 나머지 상태는 그 산출물이 유효한 결정이 아님을 말하기 위해 존재하기 때문이다.

## Run 디렉터리

```text
.codefleet/runs/2026-05-27_001/
  run-plan.json                 승인 정보, effective policy, 검증 계획, 아티팩트 계획
  task.yaml                     승인된 내용의 사본
  prompt.md                     에이전트에게 전달된 것
  adapter-request.json          어댑터에 넘긴 capabilities
  workspace-pre-run.json        실행 전 scope 내 파일 해시
  stdout.log
  stderr.log
  git-diff.patch
  workspace-post-run.json       실행 후 scope 내 파일 해시
  provider-commands.json        어댑터가 명령을 보고한 경우에만; PROVIDER_REPORTED_ONLY
  verification/verify-001.json  검증 증거
  verification/verify-001/      명령별 stdout, stderr. 실제 실행된 시도만
  harness-observation.json      Harness가 본 것과 보지 못한 것
  adapter-result.json           어댑터 상태와 exit code
  run-summary.json              파생된 정규화 결과. 결정 진실이 아님
  run-record.md                 사람이 읽는 Run 기록
  result.json                   CLI용 요약
  review-decision.local.json    `review`가 생성
```

`harness-observation.json`은 git과 무관하게 스냅샷에서 계산한 workspace delta를 기록한다. 그래서 git이 추적하지 않는 파일도 변경으로 드러난다. 읽지 못한 구간은 `snapshotGaps`에 이름이 남으므로, 부분 스냅샷이 완전한 스냅샷처럼 통과할 수 없다.

## 조회

```bash
codefleet runs            # run-id, status, task-id, agent
codefleet status          # 버전, 모드, 워크스페이스 id, discovery 모드, task/run 개수
codefleet lock status              # mutation 락 보유자, 그리고 Run 락 목록
codefleet lock break               # 남아 있는 mutation 락 해제
codefleet lock break --task <id>   # 해당 Task의 남아 있는 Run 락 해제
```

락은 두 종류이며 서로 다른 것을 지킨다:

- **mutation 락** `.codefleet/locks/workspace.lock` — ledger를 변경하는 작업(승인, Objective/큐 변경, 리뷰 import)이 잡는 단일 writer 락. **Run 실행 동안에는 잡히지 않는다.**
- **Run 락** `.codefleet/locks/run-<task-id>.lock` — Run 하나가 그 Task에 대해 실행 내내 잡는다. 같은 Task의 두 번째 Run은 즉시 거부되며 보유자를 이름으로 알린다.

둘 다 오래됐다고 자동으로 깨지지 않는다. `lock status`는 읽을 수 없는 Run 락도 세어서 보고한다 — 실행을 막는 근거는 파일의 존재이지 내용이 아니므로, 파싱 실패한 락을 빼고 세면 막혀 있는 워크스페이스가 아무것도 잡히지 않은 것처럼 보인다. `lock break`는 락을 쥔 채 프로세스가 죽은 경우를 위한 것이다.

모든 명령은 `--workspace <path>`를 받는다. 현재 디렉터리에서 `.codefleet/config.json`을 탐색하는 대신 워크스페이스를 명시적으로 지정할 때 쓴다.

## Execute 모드

Codex 어댑터가 프로세스를 실행하게 하려면 `.codefleet/config.json`의 `defaults.task.harnessMode`를 `COMMAND_EXEC`로 바꾼다. 네 모드 중 파일 편집과 명령 실행을 모두 켜는 것은 이것뿐이다. 추가 플래그 없이는 `codefleet run`이 시작을 거부하고 Run 디렉터리를 만들지 않는다:

```text
Run Planning is blocked: this Run may execute commands, and no Harness-visible
command channel exists to observe them.
```

CodeFleet에는 command 프록시도, 샌드박스 로그도, 컨테이너 exec 로그도 없다. execute 모드의 에이전트는 어떤 명령이든 실행할 수 있고, 무엇을 실행했는지에 대한 유일한 기록은 에이전트 자신의 transcript — 관측이 아니라 주장이다. 그런 주장은 command policy도, 검증도, `VERIFIED`도 만족시킬 수 없다.

그럼에도 진행하려면 그 결정을 기록한다:

```json
{
  "policies": {
    "harness": { "allowDegradedCommandObservation": true }
  }
}
```

이 플래그를 켠다고 해서 명령이 관측되는 것은 아니다. **그럼에도 진행하기로 당신이 결정했다는 사실이 기록될 뿐이다.** 이 설정 아래의 모든 Run은 unavailable 사유에 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`을 유지하며 여전히 사람의 리뷰를 요구한다.

생성된 프롬프트는 설정된 명령의 stdin으로 전달된다. execute 모드는 설치된 Codex CLI에 맞춰 조정이 필요할 수 있는 어댑터 훅으로 다룰 것.

### 실행 전에 알아야 할 것

execute 모드는 에이전트를 **당신의 실제 작업 디렉터리에서** 실행한다. 아래 한계는 그 결과가 실 저장소에 그대로 남는다는 뜻이다.

- **격리도 롤백도 없다.** `isolation.mode`는 항상 `NONE`이다. 에이전트는 브랜치도 worktree도 컨테이너도 아닌 작업 디렉터리 자체를 고친다. Run이 실패하든 리뷰에서 반려되든 CodeFleet은 아무것도 되돌리지 않는다. 워크스페이스 스냅샷은 내용이 아니라 해시만 담으므로 복원에 쓸 수 없다. 복구는 전적으로 당신의 git 사용에 달려 있다. **커밋되지 않은 변경이 없는 상태에서 실행할 것.**
- **타임아웃도 출력 상한도 없다.** 어댑터 프로세스에 시간 제한이 걸리지 않는다. 에이전트가 끝나지 않으면 `codefleet run`은 무한히 기다리고, stdout은 상한 없이 메모리에 쌓인다. 중단 수단은 Ctrl-C뿐이며 그 경우 Run 디렉터리는 불완전한 상태로 남는다.
- **동시 실행은 절반만 막힌다.** 같은 Task를 동시에 두 번 실행하면 두 번째는 `.codefleet/locks/run-<task-id>.lock`에서 거부되며 보유자를 이름으로 알린다. `runId`는 Run 디렉터리를 배타적으로 생성해 예약하므로, 서로 다른 Task의 Run이 같은 `runId`를 받거나 서로의 아티팩트를 덮어쓰는 일은 없다. 그러나 **격리가 없으므로 서로 다른 Task의 동시 Run은 같은 작업 디렉터리를 함께 고친다.** 한 Run의 변경이 다른 Run의 diff와 스냅샷 delta에 섞여 들어간다. 위 첫 항목이 해결되기 전까지는 **한 번에 하나씩 실행할 것.**
- **범위 위반은 사전에 막히지 않는다.** `scope`는 프롬프트로 전달될 뿐 어댑터가 강제하지 않는다. 범위 밖 파일 수정은 Run이 끝난 뒤 diff에서 발견되고 리뷰에서 ACCEPTED를 막을 뿐, 그 시점에 변경은 이미 디스크에 있다.

각 항목의 파일:라인 근거는 `docs/audits/`의 점검 기록에 있다. 그 기록은 점검 시점의 스냅샷이며 이후 고쳐진 항목이 있다. 지금 무엇이 남아 있는지는 이 절과 위의 "현재 구현 범위"가 기준이다.

### Command policy

`policies.commands`는 Harness가 직접 실행하는 명령에 적용되며, 오늘 기준으로는 검증 명령을 의미한다:

```json
{
  "policies": {
    "commands": {
      "allowedCommands": [{ "argv": ["npm", "test"] }],
      "deniedCommands": [{ "argv": ["git", "push"] }],
      "destructiveCommands": [{ "categoryId": "INFRA_APPLY", "argv": ["terraform", "apply"] }]
    }
  }
}
```

matcher는 argv 토큰 리스트이며 쓰인 그대로 비교된다. glob도 regex도 없다. `*`, `?`, 대괄호가 포함된 토큰은 조용히 영원히 매칭되지 않는 대신 거부된다. `matchMode`는 `PREFIX`(기본값) 또는 `EXACT`다. denied가 먼저 평가되고 우선한다. 비어 있는 `allowedCommands`는 제약하지 않고, 비어 있지 않으면 제약한다. destructive 항목에는 `UPPER_SNAKE_CASE` `categoryId`가 필요하다. 승인이 카테고리 단위로 부여되기 때문이다 — 그리고 카테고리 단위 승인이 아직 CLI에 연결되지 않았으므로, 매칭된 destructive 명령은 `DESTRUCTIVE_WITHOUT_APPROVAL`로 차단된다.

에이전트가 스스로 실행한 명령은 이 policy로 **판정하지 않는다**. Harness가 보지 못했으므로, transcript의 주장을 위반으로 판정하는 것은 그 주장을 믿는 것이 되기 때문이다.

## 명령 레퍼런스

```text
codefleet [--workspace <path>] init
codefleet [--workspace <path>] run <task-id>
codefleet [--workspace <path>] prompt <task-id>
codefleet [--workspace <path>] task validate|status <task-id>
codefleet [--workspace <path>] task approve|invalidate <task-id> --reason <text>
codefleet [--workspace <path>] status
codefleet [--workspace <path>] runs
codefleet [--workspace <path>] objective create <id> --title <text> [--kind ONE_OFF|SEQUENCE|WORKSTREAM]
codefleet [--workspace <path>] objective attach <id> <task-id> [--revision N]
codefleet [--workspace <path>] objective block|unblock|skip|unskip|cancel-item <id> <queue-item-id> --reason <text>
codefleet [--workspace <path>] objective import-review <id> <run-id> --reason <text>
codefleet [--workspace <path>] objective reorder <id> --order <id,id> --reason <text>
codefleet [--workspace <path>] objective status|rebuild <id>
codefleet [--workspace <path>] lock status|break [--task <task-id>]
codefleet [--workspace <path>] review <run-id> --decision <ACCEPTED|REJECTED|NEEDS_CHANGES> --reason <text>
```

## 워크스페이스 구조

```text
.codefleet/
  config.json                        Project Profile. 커밋되는 워크스페이스 정책
  local.json                         Local Overlay. 커밋하지 않는 머신 로컬 값
  tasks/<task-id>.yaml               Task 계약
  tasks/<task-id>/task-ledger.jsonl  revision과 승인
  objectives/<id>/ledger.jsonl       append-only Objective 이벤트
  objectives/<id>/objective.json     replay된 스냅샷
  runs/<run-id>/                     Run 하나당 디렉터리 하나
  reviews/<review-id>/               증거 번들
  prompts/<task-id>.md               `prompt`가 생성
  locks/workspace.lock               단일 writer mutation 락
  locks/run-<task-id>.lock           실행 중인 Run이 Task 단위로 잡는 락
```

## 로드맵

- AgentRole. 단일 어댑터가 아니라 역할 기반 위임이 되도록.
- Claude Code, Gemini CLI, 로컬 에이전트, 리뷰어/테스터/문서 에이전트용 추가 어댑터.
- Harness가 볼 수 있는 command 채널. 에이전트 명령이 증거가 되려면 이것이 필요하다.
- `computedRisk` 뒤의 risk 엔진, 그리고 실행 격리.
- Objective ledger의 `RUN_REVIEW_DECIDED`. 리뷰가 큐를 진행시킬 수 있도록.
- 단일 프롬프트를 넘어서는 다단계 workflow 처리.
- Task 의존성 처리.
- export seam을 통한 PR/이슈 연동.
- Run 지표와 성공/실패 분석.
- 필요해지면 전용 파서 패키지로 YAML 지원 강화.

외부 도구로의 export는 sanitize된 Run Summary export seam으로 제한된다. 웹 대시보드, 중앙 태스크 DB, 범용 에이전트 플랫폼은 미뤄둔 작업이 아니라 명시적 non-goal이다.

## 라이선스

이 저장소는 오픈소스가 아니다. 읽고 평가하는 용도로만 공개되며, 사용·실행·복제·수정·배포·학습에 대한 권한은 부여되지 않는다. 전문은 [LICENSE](LICENSE)를 볼 것.

GitHub 사이드바에는 라이선스가 표시되지 않는다. GitHub은 표준 오픈소스 라이선스만 인식하기 때문이며, 라이선스가 없다는 뜻이 아니다.

## 문서

- `docs/concept-foundation.md` — 제품 정의의 정본. Core/Workspace/Profile/Harness 개념과 FINAL RULE.
- `docs/architecture.md` — Mermaid 렌더링 없이 읽는 텍스트 기반 아키텍처 개요.
- `docs/design-progress.md` — 설계가 고정된 순서와 현재 위치.
- `docs/session-handoff.md` — 다른 세션에서 이어가기 위한 최소 상태.
