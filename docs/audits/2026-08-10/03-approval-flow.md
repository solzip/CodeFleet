# 03 — 승인의 단위와 시점

```text
점검 일시   : 2026-08-10
점검 대상   : 70fa598c39ae42038c26992a099caec18cb2657f (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 35f70be4 와 바이트 동일하고,
             70fa598 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
점검 범위   : src/task-ledger.ts, src/cli.ts, src/run.ts, src/review.ts, src/ledger.ts, src/mutation.ts
측정 근거   : npm test — 128 tests, 128 pass
             승인 관련 테스트 3건 확인 — test/run.test.ts:1472, :1511, :1562
판정 기준   : "승인 없이 실행 도달 가능"은 코드 경로로 재현 가능할 때만 결함으로 본다.
```

## 판정: **결함**

승인 없이 에이전트 실행에 도달하는 경로는 없다(이 부분은 통과). 그러나 **문서화된 승인 조건의 절반이 실행 경로에서 검사되지 않고**, 승인 이후 계획 이탈에 대한 재승인 트리거가 없다.

## 3-1. 승인 대상은 무엇인가 — **Task 계획 (실행 결과 diff는 아님)**

### 승인 = Task YAML 파일의 content hash

`src/task-ledger.ts:53-55`

```ts
export async function contentHashOf(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}
```

`src/task-ledger.ts:156-221` `approveTask`가 `TASK_REVISION_CREATED` + `TASK_APPROVED` 두 이벤트를 append하고, `approvalTargetHash`에 그 해시를 박는다(`task-ledger.ts:202-208`).

### 파일이 바뀌면 승인이 자동으로 무효화된다 — 잘 설계됨

`src/task-ledger.ts:104-111`

```ts
} else if (approvedHash !== currentHash) {
  blockedReason = "TASK_CONTENT_CHANGED_AFTER_APPROVAL";
}
```

승인 상태는 원장 replay로만 계산되고 파일의 가변 필드에서 읽지 않는다(`task-ledger.ts:69-71` 주석 그대로). 테스트 존재 — `test/run.test.ts:1511` "editing a Task after approval revokes its executability".

### 실행 결과 diff는 별도 경로이고, 승인이 아니라 "리뷰"다

`src/review.ts:159-268` `reviewRun`이 diff/증거 번들을 검사하지만, 산출물은 명시적으로 최종 결정이 아니다:

- `src/review.ts:99` `finalDecisionTruth: false`
- `src/review.ts:244-248` `safeguards: { canProduceVerified: false, canProgressQueue: false, acceptanceEvidence: false }`
- `src/cli.ts:223` — CLI가 사용자에게 직접 고지: `"note: local review is migration input, not final decision truth."`

실제 효력은 `codefleet objective import-review`(`src/cli.ts:318-340` → `src/ledger.ts:835-941`)를 사람이 별도로 실행해야 발생한다.

**결론**: 승인 단위는 "Task 계획" 하나다. diff는 승인 대상이 아니라 사후 리뷰 대상이고, 그 리뷰조차 별도 수동 단계 없이는 아무 상태도 바꾸지 못한다.

## 3-2. 실행 중 계획 이탈 시 재승인 — **트리거 없음**

`src/run.ts:136-673` 전 구간에서 승인 재검사는 `run.ts:148` 단 한 번, 에이전트 실행(`run.ts:337`) **이전**에만 일어난다.

에이전트가 승인된 scope를 벗어났을 때 일어나는 일의 전부:

| 코드 | 동작 |
|---|---|
| `src/run.ts:401-418` | `evaluatePathPolicy` — 위반 목록 계산 |
| `src/run.ts:522` | `policyChecks.pathViolations`에 기록 |
| `src/run.ts:769` | RunSummary의 `pathViolationSummary`로 요약 |
| `src/review.ts:465-467` | 리뷰에서 ACCEPTED 차단 |

없는 것:
- 실행 중단 — 에이전트는 이미 종료된 뒤에 판정한다.
- 승인 무효화 — `invalidateApproval`(`src/task-ledger.ts:223-271`)은 CLI에서 사람이 호출할 때만 실행된다. Run이 호출하는 지점 없음.
- 재승인 요구 — 같은 Task를 다시 `run`하면 승인은 여전히 유효하고 그대로 재실행된다.

## 3-3. 승인 없이 실행에 도달하는 경로 — **없음 (통과)**

에이전트 프로세스가 spawn되는 지점은 `src/agent.ts:141`뿐이고, 그 유일한 호출 경로는 `run.ts:337 runAgentSafely → agent.run()`이다. 그 앞에 `run.ts:148-155`의 차단이 무조건 놓인다:

```ts
const approval = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
if (approval.blockedReason.length > 0) {
  throw new Error(`Task is not approved for execution: ${taskId} (...)`);
}
```

이 차단은 `projectPath` 해석(`run.ts:172`)보다도 먼저 놓여 있고, 그 순서가 의도적임이 `run.ts:144-147` 주석과 `test/run.test.ts:1562` 테스트로 고정돼 있다. `codefleet prompt`(`src/cli.ts:103-112`)는 승인 없이도 프롬프트 파일을 쓰지만 에이전트를 실행하지 않는다.

**여기까지는 견고하다.** 아래부터가 결함이다.

## 3-4. 결함 A — Objective 큐 결정이 실행을 막지 못한다

`src/task-ledger.ts:7-9`가 승인 조건을 스스로 이렇게 정의한다:

```
// A revision is executable only when the Task ledger holds a valid TASK_APPROVED
// and the Objective ledger holds a valid queue decision. This module owns the
// first half; ledger.ts owns the second.
```

`runTask`는 **첫 번째 절반만 검사한다.** `src/run.ts` 전체에서 `objectiveId`, `replayObjective`, `QueueItem`, `storedState` 참조는 **0건**이다(grep 전수 확인).

결과:

| 사람이 한 행위 | 원장 기록 | `codefleet run task-001` |
|---|---|---|
| `objective block <obj> <item> --reason "보안 리뷰 대기"` | `QUEUE_ITEM_BLOCKED` (`ledger.ts:715-770`) | **그대로 실행됨** |
| `objective skip <obj> <item> --reason "이번 릴리스 제외"` | `QUEUE_ITEM_SKIPPED` | **그대로 실행됨** |
| `objective cancel-item <obj> <item> --reason "요구사항 철회"` | `QUEUE_ITEM_CANCELED` (종결 상태, `ledger.ts:52`) | **그대로 실행됨** |

`transitionQueueItem`은 사유를 필수로 요구하고(`src/ledger.ts:728-730`), 뮤테이션 락 아래 append-only로 기록되며(`src/mutation.ts:94-158`), replay 검증까지 받는다. 그렇게 신중하게 남긴 사람의 결정이 실행에 아무 영향을 주지 않는다.

## 3-5. 결함 B — 승인 해시가 Task 파일만 덮는다 (프로파일 미포함)

승인은 `taskPath` 하나의 해시다(`src/task-ledger.ts:164`). 그런데 실제 실행 권한을 정하는 값들은 `.codefleet/config.json`에 있다:

- `mode: "dry-run" | "execute"` → `src/run.ts:211-212` `capabilities.fileEdit`, `commandExecution`
- `policies.commands.*` → `src/run.ts:209,215-217`
- `policies.harness.allowDegradedCommandObservation` → `src/run.ts:166`

시나리오: 사람이 `mode: "dry-run"` 상태에서 Task를 검토하고 승인한다 → 다른 사람(또는 같은 사람)이 config를 `"execute"` + `allowDegradedCommandObservation: true`로 바꾼다 → 재승인 없이 `codefleet run`이 실제 파일 수정과 명령 실행을 수행한다.

부분 완화: `src/run.ts:264`가 `sourceRefs.projectProfileRef`로 config 해시를 run-plan에 남긴다(`src/workspace.ts:102`). **사후 추적은 가능하지만 사전 검사는 없다.** 승인 시점의 프로파일 해시와 실행 시점의 해시를 비교하는 코드는 없다.

`docs/rule-implementation-status.json`도 인접 규칙을 미구현으로 기록한다:

```
PROFILE_DEFAULTS_REQUIRED_GATES_SCHEMA : NOT_IMPLEMENTED
"requiredGates appear in run.ts as a hardcoded literal, never read from or validated against a profile."
TASK_REVISION_REQUIRED_GATES_ARE_CONCRETE : NOT_IMPLEMENTED
```

## 3-6. 결함 C — 승인자·검토자 신원이 자기 신고 문자열이다

`src/cli.ts:140`

```ts
const actorId = flags.actor ?? "local-user";
```

`src/review.ts:221` 도 동일 (`options.actorId ?? "local-user"`).

- 인증 없음. `--actor cto@company.com` 을 누구나 입력할 수 있다.
- 승인자와 검토자가 동일인이어도 막히지 않는다.
- `src/run.ts:236` `resultReview: { required: true, allowedActors: [], explicit: false }` — allowedActors가 항상 빈 배열이고 어디서도 대조되지 않는다.

프로젝트 자체 기록:

```
REVIEW_DECISION_ACTOR_MUST_SATISFY_RESULT_REVIEW_GATE : NOT_IMPLEMENTED
"requiredGates.resultReview.allowedActors is always empty and no actor is checked against it."
```

부가로 `src/task-ledger.ts:141`이 모든 Task 원장 이벤트의 `actorKind`를 무조건 `"HUMAN"`으로 박는다. 스크립트가 append한 이벤트도 사람이 한 것으로 기록된다.

## 발생 조건과 영향 범위

**결함 A 발생 조건**: Objective 큐를 실제로 사용하는 워크플로에서 항목을 block/skip/cancel한 뒤 `codefleet run`을 호출한다. 특별한 설정이 필요 없다.

**결함 B 발생 조건**: 승인과 실행 사이에 `.codefleet/config.json`이 변경된다. config는 원장이 아닌 평범한 파일이고 아무 잠금도 없다.

**결함 C 발생 조건**: 상시.

**영향 범위**
- A: 사람이 사유까지 적어 명시적으로 중단시킨 작업이 실행된다. 승인 체계의 신뢰가 근본에서 깨진다. 감사 관점에서는 "차단 기록"과 "실행 기록"이 동시에 남는 모순 상태가 만들어진다.
- B: 승인의 의미가 실행 시점 권한과 분리된다. 리뷰어가 dry-run 계획을 보고 승인한 내용이 execute 권한으로 집행될 수 있다.
- C: 승인 원장의 `actorId`/`approvedBy`(`src/run.ts:258`)가 감사 증거로서 가치를 갖지 못한다. 4-eyes 원칙을 시스템이 보장하지 못한다.

## 우선순위

| 결함 | 우선순위 | 근거 |
|---|---|---|
| A — Objective 큐 결정이 실행을 막지 못함 | **P0** | 사람의 명시적 중단 결정이 무시된다. 우회가 아니라 검사 자체가 부재 |
| B — 프로파일이 승인 해시에 포함되지 않음 | **P1** | 승인 범위와 실행 권한의 분리. 사후 추적은 가능 |
| C — actor 신원 미검증 | **P1** | 로컬 단일 사용자 도구 단계에서는 감내 가능하나, 원장이 감사 증거를 자처하는 이상 모순 |
| 계획 이탈 시 재승인 미트리거 | **P1** | 사후 리뷰가 ACCEPTED를 막으므로 잘못된 수락으로는 이어지지 않음 |

## 권고

1. **P0** — `src/run.ts:148` 승인 검사 직후에 Objective 큐 상태 검사를 추가한다. Task가 어떤 Objective에도 attach되지 않은 경우의 정책(허용/거부)을 명시적으로 정하고, `storedState`가 `WAITING`이 아니면 실행을 거부한다. `replayObjective`(`src/ledger.ts:169`)와 `snapshot.queue`가 이미 필요한 것을 전부 제공한다.
2. **P1** — `approveTask`의 `targetHash`(`src/task-ledger.ts:172`)를 `hash(taskFile) + hash(configFile)` 조합으로 확장한다. `MutationIntent.targetHash`가 이미 이 용도로 설계돼 있다(`src/mutation.ts:28`).
3. **P1** — `requiredGates.resultReview.allowedActors`를 프로파일에서 읽고 `src/review.ts`에서 대조한다. 최소한 "승인자 ≠ 검토자"만이라도 강제한다.
4. **P2** — 경로 위반이 발견된 Run 이후 해당 Task 승인을 자동 무효화(`invalidateApproval`)하는 옵션을 둔다. 다음 Run이 재승인을 강제하도록.
