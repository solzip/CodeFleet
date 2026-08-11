# P0-5 — taskRevision 추적 체인

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/review.ts, src/ledger.ts, src/run.ts, src/cli.ts,
             test/defect-repro.test.ts, test/ledger.test.ts
측정 근거   : npm test — 199 tests, 199 pass
             test/defect-repro.test.ts:100-195 종단 테스트 통과 확인
비고        : 이번 완료 보고에 명시 언급이 없던 항목이므로 엄밀히 확인했다
```

## 판정: **해소**

(A) 통과 · (B) 통과 · (C) 우회 0건. 이번 감사에서 유일하게 완전히 닫힌 항목이다.

---

## (A) 코드 검증 — 통과

### A-1. `LocalReviewDecision`에 필드가 추가됐다

`src/review.ts:120-121`

```ts
/** Copied from the bundle. Migration reads it; it is never defaulted. */
taskRevision: number | null;
```

`ReviewEvidenceBundle`에도 있다 — `src/review.ts:63-66`. 값의 출처는 2026-08-10 권고대로 run-plan의 `approval.taskRevision`이다:

`src/review.ts:441-447`

```ts
if (runPlanRef !== null) {
  const runPlan = await readJson(path.join(rootDir, runPlanRef.path));
  const declared = asRecord(runPlan ?? {}).approval;
  const value = asRecord(declared).taskRevision;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    taskRevision = value;
  }
```

`src/review.ts:289`가 bundle에서 local review로 복사하고, `src/review.ts:666`의 `assertLocalReview`가 두 값의 일치를 다시 확인한다 — **decision 문서가 자기 증거와 모순되는 값을 담을 수 없다.**

### A-2. 값이 없으면 EVIDENCE_DEFECT로 승격된다

`src/review.ts:460-462`

```ts
if (taskRevision === null) {
  unavailableReasons.push("MISSING_INPUT_REF:runPlanRef#/approval/taskRevision");
}
```

`MISSING_INPUT_REF`는 `EVIDENCE_DEFECT_PREFIXES`(`review.ts:48`)에 속하므로 `classifyGap`이 `EVIDENCE_DEFECT`로 분류하고, `evaluateAcceptance`(`review.ts:546-550`)가 **waiver 불가로 ACCEPTED를 막는다.** 조용한 기본값이 아니라 차단으로 바뀌었다.

### A-3. 원장의 큐 항목 id가 실제 revision을 쓴다

`src/ledger.ts:1016-1027`

```ts
// A missing revision used to default to 1 here. That turned "this artifact
// does not say which revision it decided" into "it decided revision 1", which
// is a claim nothing supports: the event was appended, the CLI reported
// success, and the queue item it named never existed. There is no default that
// can be right, so the absence is carried as absent and refused at precheck.
const declaredRevision = localReview.taskRevision;
const taskRevision =
  typeof declaredRevision === "number" && Number.isInteger(declaredRevision) && declaredRevision > 0
    ? declaredRevision
    : null;
const taskId = String(localReview.taskId ?? "");
const objectiveQueueItemId = `${objectiveId}:${taskId}:${taskRevision ?? 0}`;
```

`?? 1`이 사라졌다. `?? 0`은 기본값이 아니라 precheck에서 반드시 거부될 값이다.

### A-4. append 전에 거부한다 (2026-08-10 권고 2)

`src/ledger.ts:1076-1094`

```ts
if (taskRevision === null) {
  throw new Error("local review does not record the taskRevision it decided on");
}
// Replay records a REFERENCE_FAILURE for a decision that names an
// unknown queue item, but replayStatus stays COMPLETE and postcheck
// passes, so the import reported success and left an event that can
// never derive VERIFIED. Refusing here keeps it out of an append-only
// ledger, where the only remedy would be a corrective event that no
// command can write yet.
const attached = events.some(
  (event) => event.type === "TASK_ATTACHED" && event.payload.objectiveQueueItemId === objectiveQueueItemId
);
if (!attached) {
  throw new Error(`${objectiveQueueItemId} is not attached to ${objectiveId}; nothing to record a decision against`);
}
```

이 검사는 `objectiveSteps`의 M2_PRECHECK 단계에 있으므로 **원장에 아무것도 append되기 전에** 실패한다.

---

## (B) 테스트 검증 — 통과

`test/defect-repro.test.ts:100-195` "a review of revision 2 imports onto the revision 2 queue item"

체인 전 구간을 실제로 통과시킨다:

| 단계 | 코드 | assert |
|---|---|---|
| revision 2로 올림 | `:105-108` approve → edit → invalidate → approve | `:111` `approval.approvedRevision === 2` |
| Objective attach | `:120-127` revision 2로 attach | — |
| Run | `:129` `runTask` | `:134` run-plan의 `approval.taskRevision === 2` |
| Review | `:138-143` waiver 포함 ACCEPTED | `:144` `MIGRATION_READY_WAIVED` |
| 원장 반영 | `:158-168` `importLocalReview` | `:169` `failedPhase === null` |
| 최종 상태 | `:171-194` | `:178` payload.taskRevision === 2, `:181` `objectiveQueueItemId === "auth:sample:2"`, `:190` `REVIEW_TARGETS_QUEUE_ITEM` finding 0건, `:194` `derivedState === "VERIFIED"` |

**핵심은 `:146-156`이다.** 이 테스트는 `reviewRun`이 실제로 쓴 `review-decision.local.json`을 읽어 `taskRevision`을 assert한다. 파일 헤더(`:97-99`)가 그 이유를 적었다 — 기존 `test/ledger.test.ts`의 픽스처가 `taskRevision: 1`을 손으로 넣어주고 있어서 결함을 가리고 있었다. **픽스처가 결함을 가린다는 것을 알아내고 실제 산출물로 바꾼 것이 이 테스트의 값어치다.**

수정 전 실패 지점도 기록돼 있다(`:12-14`): `failed at: undefined !== 2`.

---

## (C) 반증 시도 — 우회 0건

### C-1. "깨져도 성공 메시지가 나온다"가 표면화되는가 — 그렇다

2026-08-10의 핵심 지적이었다. 세 지점 모두 확인했다.

| 지난 감사의 조용한 실패 | 현재 |
|---|---|
| `REFERENCE_FAILURE`가 기록되지만 `replayStatus`는 COMPLETE 유지 | **append 자체가 일어나지 않는다.** `ledger.ts:1085-1094`가 M2_PRECHECK에서 던진다 |
| postcheck 통과 | 도달하지 않는다 |
| CLI가 성공 메시지 출력 (`cli.ts:338`) | `runMutation`이 `failedPhase: "M2_PRECHECK"`를 반환하므로 `reportOutcome`이 실패로 보고한다 |
| 잘못된 이벤트가 append-only 원장에 영구 잔존 | 발생하지 않는다 |
| 큐 항목이 영원히 VERIFIED 불가 | 테스트가 VERIFIED 도달을 assert한다 (`:194`) |

`test/policy-rule-id.test.ts:216-225`가 dangling 참조 거부까지 별도로 고정한다.

### C-2. revision을 우회로 밀어 넣을 수 있는가

| 시도 | 결과 |
|---|---|
| `review-decision.local.json`을 손으로 고쳐 revision을 바꾼다 | 가능하지만 `reviewEvidenceBundleRef.contentHash`가 `targetHash`로 쓰이고(`ledger.ts:1060`), bundle의 `taskRevision`과 대조하는 `assertLocalReview`(`review.ts:662-670`)를 이미 통과해 기록된 값이다. 임의 revision을 넣으면 attach 검사(`ledger.ts:1085`)에서 걸린다 |
| revision 0 / 음수 / 실수 | `Number.isInteger(...) && > 0` 검사(`ledger.ts:1023`)로 null 처리 → precheck 거부 |
| `objective attach --revision`에 임의 숫자 | 여전히 가능하다 (2026-08-10 P1-5/5-4, **미해소**). 다만 이 경우 attach된 id와 review가 지목하는 id가 어긋나 precheck에서 거부되므로, **조용한 실패가 아니라 시끄러운 실패**가 된다 |

### C-3. 잔여 위험 — 이미 오염된 원장을 정정할 CLI 경로가 없다

`appendCorrectiveEvent`(`src/ledger.ts:911-971`)는 구현됐고 테스트도 있다(`test/policy-rule-id.test.ts:153-247`). `REFERENCE_FAILURE`만 정정 이벤트를 허용하고, 대상 결정이 원장에 실재하는지 확인하며, 원본 이벤트는 그대로 두고 supersede 이벤트를 덧붙인다.

그러나 `src/cli.ts`에 이 함수를 부르는 서브커맨드가 없다(grep 0건). **2026-08-10 이전 코드로 이미 잘못된 `objectiveQueueItemId`가 append된 원장은 사용자가 CLI로 고칠 수 없다.** 새로 발생하는 것은 막혔지만, 이미 발생한 것의 복구 수단은 라이브러리 안에만 있다.

P1-12로 등재했다.

---

## 권고

1. **P1** — `appendCorrectiveEvent`를 CLI에 노출한다 (`codefleet objective correct <id> --supersedes <reviewDecisionId> --failure-class REFERENCE_FAILURE --reason <text>` 형태). 함수·검증·테스트가 이미 다 있고 배선만 없다.
2. **P1** — `objective attach`가 `--revision`을 받지 않고 `replayApproval`의 `approvedRevision`을 쓰도록 바꾼다 (2026-08-10 권고 4). 지금은 사용자가 손으로 틀린 숫자를 넣을 수 있고, 그 결과가 review import 시점에야 드러난다.
3. **P2** — run-plan에 `objectiveId` / `objectiveQueueItemId`를 기록한다 (2026-08-10 P1-8). 여전히 `src/run.ts`에 `objectiveId`를 산출물에 쓰는 코드는 없다 — `blockedQueueReason`이 읽기만 한다.
