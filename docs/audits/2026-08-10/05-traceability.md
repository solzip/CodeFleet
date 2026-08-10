# 05 — 추적성 검증

```text
점검 일시   : 2026-08-10
점검 대상   : 770b39b9aa95681782c27d23911271063483a237 (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 2196a8bb 와 바이트 동일하고,
             770b39b 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
점검 범위   : src/run.ts, src/ledger.ts, src/task-ledger.ts, src/review.ts, src/cli.ts,
             src/workspace.ts, src/workspace-snapshot.ts, src/run-record.ts
측정 근거   : npm test — 128 tests, 128 pass
             grep 전수 — src/run.ts 내 objectiveId 참조 0건, src/review.ts 내 taskRevision 참조 0건
판정 기준   : 하나의 Task ID에서 시작해 각 링크를 코드로 따라갈 수 있는지로 판정한다.
```

## 판정: **결함**

체인의 대부분은 해시로 고정되어 견고하다. 그러나 **양 끝단 두 곳에서 끊긴다**: Run 아티팩트에 Objective 참조가 없고, 리뷰를 원장으로 되돌릴 때 `taskRevision`이 소실되어 revision ≥ 2에서 조용히 연결이 실패한다.

## 5-1. 체인 전수 추적 — `task-001` 기준

### 이어지는 링크 (통과)

| # | 링크 | 코드 | 연결 키 |
|---|---|---|---|
| 1 | Objective → Task | `src/ledger.ts:645-706` `attachTask` | `objectiveQueueItemId = ${objectiveId}:${taskId}:${taskRevision}` (`ledger.ts:657`), payload에 `taskRevisionHash` (`ledger.ts:702`) |
| 2 | Task → 승인자/승인시각 | `src/task-ledger.ts:192-208` | `TASK_APPROVED` 이벤트의 `actorId`, `at`, `approvalTargetHash` |
| 3 | 승인 → Run | `src/run.ts:148`, `src/run.ts:255-260` | run-plan.json의 `approval.{taskRevision, approvalTargetHash, approvedBy, approvedAt}` |
| 4 | Run → Task 원문 | `src/run.ts:195-197` | `task.yaml` 스냅샷 복사 + `sourceTaskRef`/`taskSnapshotRef` 양쪽 해시 |
| 5 | Run → 프로파일 | `src/run.ts:264` | `sourceRefs.projectProfileRef` (`src/workspace.ts:102`가 config.json 해시 계산) |
| 6 | Run → 세션 로그 | `src/run.ts:345-350` | `stdout.log`, `stderr.log` + FileRef 해시 |
| 7 | Run → diff | `src/run.ts:347-351, 484-503` | `git-diff.patch`, `changedFiles`, `workspaceDelta` |
| 8 | Run → 커밋 | `src/workspace-snapshot.ts:89-93` | PRE/POST 스냅샷의 `git.headRef` (HEAD 해시) |
| 9 | Run → 테스트 결과 | `src/run.ts:927-947` | `verification/verify-NNN/<commandId>.stdout.log` + exitCode + `result: PASS/FAIL` |
| 10 | Run → 리뷰 | `src/review.ts:169-192, 202` | `reviews/<reviewDecisionId>/evidence-bundle.json`, `runs/<runId>/review-decision.local.json` |
| 11 | 리뷰 → 무결성 | `src/review.ts:518-539` `verifyHash` | 모든 참조 아티팩트를 재해시하여 대조, 불일치 시 `HASH_INVALID:<path>` |

`codefleet run` 한 번이면 `.codefleet/runs/<runId>/` 아래에 run-plan / adapter-request / harness-observation / adapter-result / run-summary / verification / workspace-pre-run / workspace-post-run / run-record.md 가 모두 생성되고(`src/run.ts:180-193`), 전부 상호 FileRef 해시로 묶인다. 사람이 읽을 단일 파일도 항상 쓰인다(`src/run.ts:632-644`).

**8번(커밋)에 대한 정확한 기술**: CodeFleet은 커밋을 만들지 않는다. `git commit` 호출 지점이 src/에 없다. 대신 PRE/POST 스냅샷에 HEAD 해시를 남기므로 "어느 커밋 위에서 실행됐는가"는 추적되고, "이 Run이 어느 커밋이 되었는가"는 추적되지 않는다. 커밋은 사람의 몫이다.

### 끊기는 링크

## 5-2. 결함 A — Run 아티팩트에 objectiveId가 없다

`src/run.ts` 전체(1,611줄)에서 `objectiveId` 참조: **0건** (grep 전수 확인).

`runTask`의 어떤 산출물도 어느 Objective에 속하는지 기록하지 않는다. run-plan.json의 `sourceRefs`(`run.ts:261-266`)에도 없다.

**역추적 절차의 실제 모습**: `runId`만 아는 상태에서 Objective를 찾으려면
1. `.codefleet/objectives/*/ledger.jsonl`을 전부 연다.
2. `type === "RUN_REVIEW_DECIDED"`인 이벤트를 찾는다.
3. `payload.runId`(`src/ledger.ts:858`)가 일치하는지 확인한다.

즉 **`objective import-review`를 사람이 실행한 뒤에만, 그리고 전수 스캔으로만** 역추적이 가능하다. 리뷰 전이거나 import 전인 Run은 어느 Objective 소속인지 알 방법이 없다. 정방향(Objective → Task → ?) 도 마찬가지로 Run 목록을 얻을 수 없다 — `src/ledger.ts:33-44` `QueueItem`에 runId 필드가 없다.

## 5-3. 결함 B — importLocalReview에서 taskRevision이 소실된다 (체인 절단)

### 사실 관계

`src/ledger.ts:855`

```ts
objectiveQueueItemId: `${objectiveId}:${String(localReview.taskId ?? "")}:${Number(localReview.taskRevision ?? 1)}`,
```

`src/ledger.ts:857`

```ts
taskRevision: Number(localReview.taskRevision ?? 1),
```

그런데 `localReview`가 읽어오는 파일의 스키마(`src/review.ts:96-137` `LocalReviewDecision`)에 **`taskRevision` 필드가 없다.** `src/review.ts:210-250`이 객체를 만드는 전 구간에도 없다. grep 확인: `src/review.ts` 전체에서 `taskRevision` 참조 **0건**.

따라서 `localReview.taskRevision`은 항상 `undefined`이고, `?? 1`이 항상 발동한다.

**결론: `objectiveQueueItemId`는 무조건 `<objectiveId>:<taskId>:1`이 된다.**

### 결과

`attachTask`는 revision을 그대로 id에 넣는다(`src/ledger.ts:657`). 따라서 Task를 revision 2로 attach했다면 큐 항목 id는 `obj:task-001:2`인데, import는 `obj:task-001:1`을 찾는다.

`src/ledger.ts:389-400` `applyReviewDecisions`:

```ts
const item = queue.find((entry) => entry.objectiveQueueItemId === itemId);
if (item === undefined) {
  findings.push({
    failureClass: "REFERENCE_FAILURE",
    checkId: "REVIEW_TARGETS_QUEUE_ITEM",
    detail: `review decision references unknown queue item ${itemId}`,
    ...
  });
  continue;
}
```

### 왜 조용히 실패하는가

`REFERENCE_FAILURE`는 replay를 중단시키지 않는다. `src/ledger.ts:207`

```ts
const structural = findings.some((f) => f.failureClass === "LEDGER_STRUCTURAL_FAILURE");
```

`REFERENCE_FAILURE`는 `structural`에 포함되지 않으므로 `replayStatus`가 `"COMPLETE"`로 유지된다(`ledger.ts:282`). 그러면:

- `src/ledger.ts:632-641` `objectiveSteps.postcheck`의 `replayStatus !== "COMPLETE"` 검사를 통과한다.
- `detectDrift`(`src/ledger.ts:474-497`)도 통과한다 — rebuild가 먼저 실행되므로(`ledger.ts:629-631`) 저장된 스냅샷과 replay 결과가 당연히 일치한다.
- 뮤테이션은 **성공으로 보고된다.** `src/cli.ts:338` `reportOutcome(outcome, "imported review for ... into ...")`가 성공 메시지를 출력한다.
- `RUN_REVIEW_DECIDED` 이벤트는 원장에 영구히 append된다 — 잘못된 queue item id를 담은 채로.
- 큐 항목은 `effectiveDecision`이 비어 있으므로 `deriveQueueStates`(`src/ledger.ts:433-460`)에서 `VERIFIED`가 되지 못한다.

발견 가능한 유일한 지점은 `codefleet objective status`의 finding 출력(`src/cli.ts:362-364`)이다. 사람이 그 줄을 읽어야만 안다.

### revision 1에서는 왜 드러나지 않았는가

첫 승인은 `state.latestRevision + 1 = 1`(`src/task-ledger.ts:194`)이고, `objective attach`의 기본값도 `Number(flags.revision ?? "1")`(`src/cli.ts:273`)이다. 즉 **Task를 한 번도 수정하지 않은 경로에서만 우연히 일치한다.** Task를 고쳐 재승인하는 순간(revision 2) 체인이 끊긴다. 그리고 Task 수정 → 재승인은 이 제품이 명시적으로 지원하는 정상 흐름이다(`src/task-ledger.ts:153-155`, `test/run.test.ts:1511`).

## 5-4. 결함 C — objective attach가 승인 상태를 검증하지 않는다

`src/cli.ts:261-279`

```ts
const { taskPath } = await loadTaskForValidation(rootDir, taskId);
const hash = createHash("sha256").update(await readFile(taskPath)).digest("hex");

const outcome = await attachTask(rootDir, {
  objectiveId: id,
  taskId,
  taskRevision: Number(flags.revision ?? "1"),   // ← 임의 숫자
  taskRevisionHash: hash,                        // ← 현재 파일 해시 (승인된 해시 아님)
  ...
});
```

- `replayApproval` 호출 없음. **승인되지 않은 Task도 attach된다.**
- `loadTaskForValidation`(`src/task.ts:29-39`)은 validation 결과를 반환만 하고 던지지 않는다. 호출부도 `validation`을 무시한다. **유효성 검증에 실패하는 Task도 attach된다.**
- `--revision`은 사용자가 준 임의의 숫자다. Task 원장의 실제 revision과 대조하지 않는다.
- `taskRevisionHash`는 **현재 파일 내용**의 해시다. 승인된 revision의 해시(`approvalTargetHash`)와 다를 수 있고, 다르더라도 아무도 확인하지 않는다.

결과적으로 큐 항목의 `taskRevision`/`taskRevisionHash`가 Task 원장의 사실과 무관하게 기록될 수 있으며, 이 값은 이후 어떤 코드에서도 대조되지 않는다(grep: `taskRevisionHash` 소비 지점은 `ledger.ts:246`의 replay 시 문자열 복사뿐).

## 5-5. correlation ID의 생성과 전파 범위

| ID | 생성 위치 | 생성 규칙 | 전파 범위 |
|---|---|---|---|
| `runId` | `src/run.ts:174` (`nextRunId`, `run.ts:1345-1363`) | `YYYY-MM-DD_NNN` — 날짜 + 디렉터리 순번 | Run Trace 전 문서, VerificationEvidence, ReviewEvidenceBundle, LocalReviewDecision, `RUN_REVIEW_DECIDED.payload.runId` |
| `runPlanId` | `src/run.ts:175` | `${runId}:plan` | run-plan, adapter-request, harness-observation, adapter-result, run-summary |
| `mutationId` | `src/mutation.ts:67-75` | intent의 sha256 (시각·사유 제외 → 결정론적) | 원장 이벤트, `eventId`(`ledger.ts:540`) |
| `reviewDecisionId` | `src/review.ts:620-645` | `${runId}-review-NNN` | evidence-bundle, local review, `RUN_REVIEW_DECIDED.payload` |
| `objectiveQueueItemId` | `src/ledger.ts:657` | `${objectiveId}:${taskId}:${taskRevision}` | 큐 전이 이벤트, reorder, review 결정 |

**끊기는 지점**: Objective 계층(`mutationId`/`objectiveQueueItemId` 공간)과 Run 계층(`runId` 공간)을 잇는 식별자가 없다. 두 공간의 유일한 접점이 `RUN_REVIEW_DECIDED` 이벤트 payload이고, 그 이벤트는 사람이 `import-review`를 실행해야만 생긴다. 그리고 그 접점이 바로 5-3의 결함이 있는 지점이다.

또한 `runId`가 날짜+순번이므로 **워크스페이스 간 유일하지 않다.** 서로 다른 두 프로젝트가 `2026-08-10_001`을 각각 갖는다. `workspaceId`(`src/workspace.ts:128-140`)가 존재하지만 runId에 포함되지 않고 기본값이 `"default"`다.

## 발생 조건과 영향 범위

**결함 A**: 상시. Objective 기능을 쓰는 모든 사용자.

**결함 B**: Task를 수정해 재승인한 뒤(revision ≥ 2) 그 Run을 리뷰하고 import할 때. Task 수정은 정상적이고 빈번한 흐름이다.

**결함 C**: `objective attach` 사용 시 상시.

**영향 범위**
- B가 발생하면 **큐 항목이 영원히 VERIFIED에 도달하지 못한다.** `deriveQueueStates`(`ledger.ts:437-440`)가 요구하는 `effectiveDecision === "ACCEPTED"`가 채워지지 않기 때문이다. 사용자는 "리뷰도 했고 import도 성공했는데 왜 진행이 안 되지"라는 상태에 빠진다. 성공 메시지가 출력됐으므로 원인을 짐작하기 어렵다.
- 원장에는 잘못된 `objectiveQueueItemId`를 담은 이벤트가 append-only로 영구히 남는다. `src/mutation.ts:4-6`의 설계상 정정 이벤트를 덧붙이는 것 외에는 손댈 수 없고, 정정 이벤트를 만드는 커맨드는 존재하지 않는다(`CORRECTIVE_EVENT_REQUIRES_VALID_LEDGER_AND_WRONG_DECISION : NOT_IMPLEMENTED`).
- A와 C가 겹치면 감사 시나리오가 무너진다. "이 커밋은 어느 Objective의 어느 승인 아래에서 나왔는가"를 코드로 답할 수 없다.

## 우선순위

| 결함 | 우선순위 | 근거 |
|---|---|---|
| B — taskRevision 소실로 체인 절단 | **P0** | 정상 흐름에서 발생. 성공으로 보고하고 조용히 실패. 원장에 잘못된 데이터가 영구 기록 |
| A — Run에 objectiveId 없음 | **P1** | 역추적이 전수 스캔으로만 가능. 데이터가 틀린 것은 아님 |
| C — attach가 승인/revision을 검증하지 않음 | **P1** | B의 발생 확률을 높이는 원인이기도 함 |
| runId가 워크스페이스 간 비유일 | **P2** | 단일 워크스페이스에서는 무해 |

## 권고

1. **P0** — `LocalReviewDecision`(`src/review.ts:96-137`)에 `taskRevision` 필드를 추가하고 `src/review.ts:210-250`에서 채운다. 값의 출처는 run-plan.json의 `approval.taskRevision`(`src/run.ts:256`)이 되어야 한다 — 그것이 실제로 실행된 revision이기 때문이다. 동시에 `src/ledger.ts:855-857`의 `?? 1` 기본값을 제거하고, 값이 없으면 precheck에서 예외를 던진다. **조용한 기본값이 이 결함의 본체다.**
2. **P0** — `src/ledger.ts:887-915`의 `importLocalReview` precheck에서 `objectiveQueueItemId`가 실제 큐에 존재하는지 확인하고, 없으면 append 전에 거부한다. 현재는 append 후 replay finding으로만 드러난다.
3. **P1** — run-plan.json에 `objectiveId`와 `objectiveQueueItemId`를 기록한다. `runTask` 인자로 받거나 Task→Objective 역인덱스를 두면 된다. 이것이 A와 B를 동시에 해소한다.
4. **P1** — `src/cli.ts:261-279` `objective attach`에서 (a) `loadTaskForValidation`의 errors를 확인하고, (b) `replayApproval`로 승인 여부를 확인하고, (c) `--revision`을 받지 말고 `approval.approvedRevision`을 사용하고, (d) `taskRevisionHash`를 `approval.approvedHash`로 채운다. 사용자가 revision을 손으로 입력할 이유가 없다.
5. **P2** — `runId`에 `workspaceId`를 접두하거나, run-plan에 이미 있는 `workspaceDiscovery.workspaceId`(`src/run.ts:1510`)를 검색 키로 문서화한다.
