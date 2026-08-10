# CodeFleet 아키텍처 점검 — 요약

```text
점검 일시   : 2026-08-10
점검 대상   : 770b39b9aa95681782c27d23911271063483a237 (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 2196a8bb 와 바이트 동일하고,
             770b39b 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
             ※ 상위 디렉터리 CodeFleet-orchestration/ 은 git 저장소가 아니며,
               git 저장소 루트는 codeFleet/ 이다.
점검 범위   : src/ 17개 파일 6,588줄 전수 정독, test/ 15개 파일, docs/rule-implementation-status.json
측정 근거   : npm test 실행 — 128 tests, 128 pass, 0 fail, duration 4,086ms
             FINAL RULE coverage — 83 rules / 545 condition lines / 155 covered (28.4%)
                                   rules fully covered 2 of 83, rules with no claim 41
                                   (NOT_IMPLEMENTED 32, IMPLEMENTED_UNTESTED 6, NOT_CODE_VERIFIABLE 3)
점검 방법   : 6개 항목 각각을 코드 경로로 추적. 판정 근거는 파일:라인만 인정하고
             문서·주석·프롬프트 문자열은 "선언"으로 분류하되 근거로 쓰지 않았다.
```

## 판정 표

| # | 항목 | 판정 | 최고 우선순위 |
|---|---|---|---|
| 1 | 검증 조건의 기계 판정 가능성 | **결함** | P1 |
| 2 | 가드레일: 선언 vs 강제 | **결함** + 역할 분리 **미구현** | **P0** |
| 3 | 승인의 단위와 시점 | **결함** | **P0** |
| 4 | 실행 격리와 멱등성 | 격리·롤백 **미구현**, 멱등성 **결함** | **P0** |
| 5 | 추적성 검증 | **결함** | **P0** |
| 6 | 실패 모드 | 중단·충돌 **미구현**, 거짓완료 탐지 **부분 통과** | **P0** |

세부 근거는 `01-verification-criteria.md` ~ `06-failure-modes.md` 참조.

## 먼저 기록해 둘 것 — 잘 만들어진 부분

결함 목록만 읽으면 이 코드베이스를 오해하게 되므로 먼저 적는다. 다음은 실제로 코드로 강제되고 테스트로 고정된 것들이다.

- **증거 권위(authority) 분리**가 일관되게 관철된다. 제공자가 보고한 커맨드는 `PROVIDER_REPORTED_ONLY`로 격리되어 정책 판정·검증·VERIFIED 어디에도 들어가지 못한다 (`src/run.ts:438-448`, `run.ts:504-520`, `run.ts:1119-1121`, `run.ts:1159-1167`).
- **기본 설정은 fail-closed**다. 관측 채널이 없으면 `mode: execute` 실행 자체를 거부한다 (`src/run.ts:162-170`, `run.ts:823-851`).
- **승인은 내용 해시에 묶인다.** Task를 수정하면 승인이 자동으로 무효가 되고, 원장 replay로만 계산되어 파일의 stale 플래그가 존재할 수 없다 (`src/task-ledger.ts:69-71`, `:104-111`, 테스트 `test/run.test.ts:1511`).
- **뮤테이션 엔진의 멱등성**이 결정론적 id로 보장된다. 시각과 사유 텍스트를 id에서 제외한 판단이 정확하다 (`src/mutation.ts:67-75`, `:227-237`).
- **부분 관측을 완전 관측으로 위장하지 않는다.** 중첩 저장소가 있으면 경로 정책 평가를 `evaluated: false`로 내리고(`src/path-policy.ts:230-240`), 스냅샷 섹션마다 개별 실패 사유를 남기며(`src/workspace-snapshot.ts:245-265`), 모든 집계에 `scanScope`가 붙는다.
- **명령 매처가 우회에 강하다.** 셸 인터프리터를 argv[0]에서 차단하고, denied가 allowed보다 먼저 이기며, 패턴처럼 보이는 토큰을 아예 거부한다 (`src/command-policy.ts:198-206`, `:80,109-115`).
- **EVIDENCE_DEFECT는 waiver 불가**로 코드에서 강제된다 (`src/review.ts:434-440`).

이 설계 원칙들은 제품이 표방하는 목표("the AI said it worked를 구조적으로 신뢰 불가능하게 만든다", `CLAUDE.md:3`)와 정확히 일치한다.

**결함의 성격은 그 다음이다.** 아래 P0들은 대부분 "원칙이 틀렸다"가 아니라 **"기록 계층에는 원칙이 관철됐는데 실행 계층에는 아직 도달하지 않았다"**는 형태를 갖는다. 뮤테이션 락은 존재하는데 Run이 쓰지 않고, 정책 엔진은 견고한데 에이전트 명령에 적용되지 않고, 격리 요구 플래그는 기본값이 `true`인데 읽는 코드가 없다.

## P0 결함 목록

### P0-1. 에이전트 실행에 대한 강제가 어느 축에서도 존재하지 않는다 — 02번

`allowDegradedCommandObservation: true`를 켜는 순간(그리고 제품이 에러 메시지로 그 방법을 안내한다, `src/run.ts:844-846`) 아래가 전부 무방비가 된다.

- **파일 범위**: 사전 차단 없음. `evaluatePathPolicy`는 에이전트 종료 후에 호출된다 (`src/run.ts:337` → `:401`). 어댑터는 `capabilities`를 읽지 않는다 (`src/agent.ts:26-43`).
- **명령 정책**: `preflightCommand` 호출 지점이 `src/run.ts:895` 하나뿐이며 대상은 Task 자신의 검증 커맨드다. 에이전트가 실행하는 명령은 preflight를 거치지 않는다.
- **자격증명**: `spawn`에 `env` 옵션이 없어(`src/agent.ts:141-145`) 부모의 환경변수 전량이 상속된다. 역할별 분리는 코드에 존재하지 않는다.
- 범위 위반이 발견되어도 Run은 `SUCCEEDED`를 출력한다 (`src/run.ts:646-664`).

### P0-2. Objective 큐의 사람 결정이 실행을 막지 못한다 — 03번

`src/task-ledger.ts:7-9`가 "Task 원장의 승인 **그리고** Objective 원장의 큐 결정이 모두 유효해야 실행 가능"이라고 스스로 규정한다. `runTask`는 전자만 검사한다 — `src/run.ts` 전체에서 `objectiveId` 참조 **0건**.

결과: `objective block/skip/cancel-item`으로 사유까지 적어 중단시킨 Task가 `codefleet run`으로 그대로 실행된다.

### P0-3. 동일 Task의 중복·동시 실행을 막는 장치가 없다 — 04번, 06번

- `runTask`는 뮤테이션 락을 잡지 않는다. `runMutation` 호출자 7곳 중 `runTask`는 없다.
- `nextRunId`(`src/run.ts:1345-1363`)는 taskId를 보지 않고 디렉터리 순번만 증가시킨다. 동시 실행 시 같은 runId가 나오고, `mkdir(runDir, { recursive: true })`(`run.ts:178`)가 충돌을 조용히 삼켜 아티팩트가 서로 덮어써진다.
- `status: DONE`인 Task도 경고만 남기고 재실행된다 (`src/task.ts:79-81`, `task.ts:18-21`).
- 병렬 Run은 같은 워킹 트리를 공유하므로(격리 없음) 델타와 위반이 잘못된 Run에 귀속된다 (`src/workspace-snapshot.ts:205-240`).

### P0-4. 실행 격리가 없어 실패·반려 시 복구 수단이 제품 안에 없다 — 04번

- `isolation.mode`는 상수 `"NONE"` (`src/run.ts:279-282`). worktree/branch/container 참조 src/ 전체 **0건**.
- 에이전트는 사용자의 실 저장소에서 직접 실행된다 (`src/agent.ts:41`).
- 스냅샷은 내용이 아니라 해시만 저장하므로 복원 불가 (`src/workspace-snapshot.ts:25-29, 186-190`).
- REJECTED 리뷰는 JSON 파일 하나를 쓰고 끝난다 (`src/review.ts:253`). 워크스페이스에 손대지 않는다.
- `requireIsolationForMutation: true`가 기본값이면서 읽는 코드가 없다 (`src/types.ts:48`, 소비 지점 0건).

### P0-5. 리뷰 → 원장 링크에서 taskRevision이 소실되어 체인이 조용히 끊긴다 — 05번

`src/ledger.ts:855`가 `Number(localReview.taskRevision ?? 1)`로 큐 항목 id를 만드는데, `LocalReviewDecision` 스키마(`src/review.ts:96-137`)에 `taskRevision` 필드가 **없다**. grep: `src/review.ts` 내 `taskRevision` 참조 0건.

따라서 id는 항상 `<obj>:<task>:1`이 된다. Task를 수정해 재승인한 뒤(revision ≥ 2) import하면:
- `REFERENCE_FAILURE`가 기록되지만 `replayStatus`는 `COMPLETE`를 유지하고 (`src/ledger.ts:207,282`),
- postcheck를 통과하며 (`src/ledger.ts:632-641`),
- CLI는 **성공 메시지를 출력하고** (`src/cli.ts:338`),
- 잘못된 이벤트가 append-only 원장에 영구히 남고,
- 큐 항목은 영원히 VERIFIED가 되지 못한다 (`src/ledger.ts:437-440`).

정정 이벤트를 만드는 커맨드도 없다(`CORRECTIVE_EVENT_REQUIRES_VALID_LEDGER_AND_WRONG_DECISION: NOT_IMPLEMENTED`).

### P0-6. 타임아웃·출력 상한이 전무하다 — 06번

grep 전수: `timeout` / `AbortSignal` / `maxBuffer` / `kill` / `SIGTERM` 각 **0건**.

- `src/agent.ts:141-179` — `spawn`에 시간 제한 없음. 에이전트가 종료하지 않으면 Promise가 영원히 pending, `codefleet run`이 무한 정지.
- `src/agent.ts:152-157` — `stdout += chunk`가 상한 없이 누적. 토큰 폭주 시 힙 소진.
- `src/run.ts:1451-1485` — 검증 커맨드·git 호출도 동일 구조.
- 토큰·호출횟수·금액 계측 자체가 없어 상한을 정할 근거도 없다.

## P1 결함 목록

| ID | 내용 | 근거 | 문서 |
|---|---|---|---|
| P1-1 | 자유 텍스트 `doneCriteria`가 필수이고 실행 가능한 `verification`이 선택. 검증 불가 Task가 승인·실행을 소모한 뒤 리뷰에서야 거부됨 | `types.ts:93-95`, `task.ts:94-95,140-145`, `review.ts:195` | 01 |
| P1-2 | 파괴적 명령 승인 경로가 막다른 길. `approvedCategoryIds: []` 하드코딩, 채우는 코드·CLI 없음 | `run.ts:901`, `cli.ts:534-569` | 02 |
| P1-3 | 선언만 되고 소비되지 않는 정책 플래그 5종 — `requireIsolationForMutation`, `approvalRequiredForDestructiveCommands`, `allowProviderReportedCommandTruth`, `allowedModes`, `maxMode` | `config.ts:107-119,168-178` (소비 지점 각 0건) | 02 |
| P1-4 | 승인 해시가 Task 파일만 덮고 프로파일을 포함하지 않음. 승인 후 config를 execute로 바꿔도 재승인 불요 | `task-ledger.ts:164`, `run.ts:211-212,264` | 03 |
| P1-5 | actor 신원이 자기 신고 문자열. 승인자=검토자 허용. `allowedActors`는 항상 빈 배열이고 대조되지 않음 | `cli.ts:140`, `review.ts:221`, `run.ts:236` | 03 |
| P1-6 | 실행 중 계획 이탈 시 재승인 트리거 없음. 경로 위반이 승인을 무효화하지 않음 | `run.ts:401-418`, `task-ledger.ts:223` (Run에서 호출 0건) | 03 |
| P1-7 | 원자적 롤백 부재. 실패·반려 변경분이 워크스페이스에 남아 다음 Run의 기준선을 오염시킴 | `review.ts:253`, `run.ts:322` | 04 |
| P1-8 | Run 아티팩트에 `objectiveId` 없음. 역추적이 전 원장 스캔으로만, 그것도 import 이후에만 가능 | `run.ts` 내 참조 0건, `ledger.ts:33-44` | 05 |
| P1-9 | `objective attach`가 승인 여부·revision·유효성을 검증하지 않고 임의 `--revision`을 수용 | `cli.ts:261-279` | 05 |
| P1-10 | 무작업 Run이 ACCEPTED 가능. `workspaceDelta`가 계산되지만 어떤 게이트도 참조하지 않음 | `review.ts:427-470`, `review.ts:47-86` | 06 |
| P1-11 | 비용·토큰 상한 부재. 사용량 계측 필드 자체가 없음 | `types.ts:142-150`, `run.ts:725-779` | 06 |

## 다음 액션 제안

### 1단계 — 실행 계층에 기존 원칙을 도달시킨다 (P0-1, P0-3, P0-4, P0-6)

네 결함은 근원이 하나다: **에이전트 프로세스가 아무 경계 없이 실 저장소에서 돈다.** 하나의 슬라이스로 묶는 것이 맞다.

1. `git worktree add`(불가 시 디렉터리 복제)로 Run별 격리 트리를 만들고 `src/run.ts:172`의 `projectPath`를 치환한다. 둘 다 불가능하면 `requireIsolationForMutation`에 따라 실행을 거부한다 — 그 플래그가 존재하는 이유가 이것이다.
2. `runTask` 진입부에 taskId 기준 배타 락을 건다. `src/mutation.ts:160-186`을 그대로 재사용한다.
3. `spawn`에 `timeout` + `killSignal`, stdout/stderr에 바이트 상한을 준다. 잘린 바이트 수를 `scanScope`에 남겨 이 코드베이스의 계측 규율과 형태를 맞춘다.
4. 격리가 서면 REJECTED 리뷰가 worktree를 폐기하도록 연결한다 — 그것이 P1-7의 롤백 구현이 된다.

이 슬라이스가 끝나면 `mkdir(runDir, { recursive: true })`(`run.ts:178`)를 `recursive: false`로 바꿔 충돌이 조용히 통과하지 않게 한다.

### 2단계 — 끊긴 두 링크를 잇는다 (P0-2, P0-5)

둘 다 작은 수정이고 파급이 크다.

1. `LocalReviewDecision`에 `taskRevision`을 추가하고(출처는 run-plan의 `approval.taskRevision`, `run.ts:256`), `ledger.ts:855-857`의 `?? 1` 기본값을 제거한다. **조용한 기본값이 P0-5의 본체다.** 동시에 `importLocalReview` precheck에서 큐 항목 존재를 확인해 append 전에 거부한다.
2. `run.ts:148`의 승인 검사 직후에 Objective 큐 상태 검사를 추가한다. `replayObjective`가 이미 필요한 것을 전부 제공한다. Objective에 attach되지 않은 Task의 취급을 명시적으로 정한다.
3. 겸사겸사 run-plan에 `objectiveId` / `objectiveQueueItemId`를 기록하면 P1-8이 함께 해소된다.

### 3단계 — 선언과 강제의 간극을 닫는다 (P1-1, P1-3, P1-10)

여기서 필요한 것은 기능 추가가 아니라 **거짓 신호 제거**다.

1. 소비되지 않는 플래그 5종을 (a) 실제로 읽거나 (b) 로드 시 "선언되었으나 미적용" 경고를 내거나 (c) 스키마에서 제거한다. 셋 중 하나를 고르되 현 상태를 유지하지 않는다. `requireIsolationForMutation: true`가 기본값이면서 아무 효력이 없는 상태가 가장 위험하다.
2. `verification.commands`가 없는 Task는 Run Planning 단계에서 거부한다(`run.ts:162-170` 옆). 리뷰까지 가서 실패시키지 않는다.
3. `evaluateAcceptance`에 "관측된 변경 0건이면 ACCEPTED 불가" 규칙을 넣는다. `workspaceDelta`를 `ReviewEvidenceBundle`에 실어 올리기만 하면 된다.

### 4단계 — 신원과 권한 (P1-4, P1-5, P1-2)

로컬 단일 사용자 도구 단계에서는 감내 가능하지만, 원장이 감사 증거를 자처하는 이상 미뤄둔 것임을 명시적으로 기록해야 한다.

1. 승인 `targetHash`를 `hash(task) + hash(profile)` 조합으로 확장한다. `MutationIntent.targetHash`가 이미 이 용도로 설계돼 있다.
2. 최소한 "승인자 ≠ 검토자"만이라도 강제한다.
3. `approvedCategoryIds`를 채우는 CLI 경로를 만들거나, 그전까지 `destructiveCommands` 설정 시 "승인 경로 부재로 영구 차단"을 config 로드 시점에 알린다.

### 측정 관련 제안

현재 rule coverage 28.4%(155/545)이고 41개 규칙에 claim이 없다. 이 감사에서 확인한 P0 6건 중 **5건이 `docs/rule-implementation-status.json`에 이미 NOT_IMPLEMENTED로 기록돼 있거나 인접 규칙이 기록돼 있다**. 예외는 P0-5(taskRevision 소실)와 P0-3(중복 실행)으로, 이 둘은 status 파일에 대응 항목이 없다 — **"구현했다고 믿고 있는데 실제로는 깨져 있는" 부류**다.

따라서 다음 커버리지 작업의 우선 대상은 미구현 규칙이 아니라 이 두 곳이다. 각각에 대해 일부러 실패하는 테스트를 먼저 쓰는 것이 `CLAUDE.md`의 "Verify the verifier" 규율에 부합한다:
- revision 2인 Task를 attach → run → review → import 하는 종단 테스트. 현재 코드에서 반드시 실패해야 한다.
- 같은 taskId로 `runTask`를 동시에 두 번 호출하는 테스트. 현재 코드에서 runId 충돌이 재현되어야 한다.
