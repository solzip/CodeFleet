# P0-2 — Objective 큐 게이트

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/run.ts, src/ledger.ts, src/cli.ts, test/isolation.test.ts
측정 근거   : npm test — 199 tests, 199 pass
             실측 재현 1건 (아래 §C)
발생 조건   : Objective 큐를 쓰는 워크플로에서 항목을 block/skip/cancel-item 한 뒤 run
```

## 판정: **부분해소**

(A) 통과 · (B) 부분 통과 · (C) 우회 2건 — 우회는 신규 **P0-9**로 분리 등재.

---

## (A) 코드 검증 — 통과

### A-1. 승인과 큐 결정을 둘 다 검사한다

`src/run.ts:342-357`

```ts
const approval = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
if (approval.blockedReason.length > 0) {
  throw new Error(`Task is not approved for execution: ${taskId} (...)`);
}

// The Task ledger owns approval; the Objective ledger owns whether the queue
// still wants this Task run. Checking only the first let a Task that someone
// blocked or cancelled with a written reason run anyway.
const queueBlock = await blockedQueueReason(rootDir, taskId);
if (queueBlock !== null) {
  throw new Error(queueBlock);
}
```

두 검사 모두 `executeRun` 진입 직후, `projectPath` 해석(`run.ts:424`)·격리 준비(`run.ts:679`)·어댑터 실행(`run.ts:691`)보다 앞에 놓인다. 어떤 산출물도 쓰이기 전이다.

### A-2. 게이트 본체

`src/run.ts:162-194` `blockedQueueReason`. 모든 Objective를 순회하며 해당 taskId의 큐 항목을 찾고, `storedState`가 `BLOCKED` / `CANCELED` / `SKIPPED`이면 사유 문자열을 반환한다(`run.ts:183-190`).

2026-08-10이 지적한 "grep `objectiveId` 0건"은 해소됐다.

---

## (B) 테스트 검증 — 부분 통과

`test/isolation.test.ts:220-302` "a queue decision blocks the Run, and an unattached Task is not blocked"

| 상태 | `blockedQueueReason` 검증 | `runTask` 거부 검증 |
|---|---|---|
| 미attach | ✓ (`:255`) | ✓ 실행 성공 확인 (`:256-257`) |
| WAITING | ✓ (`:274`) | — |
| BLOCKED | ✓ (`:288-289`) | ✓ (`:290`) |
| SKIPPED | ✓ (`:288-289`) | ✓ (`:290`) |
| **CANCELED** | **없음** | **없음** |

`CANCELED`는 코드에는 있으나(`run.ts:184`) 테스트가 없다. 종결 상태라 루프 안에서 되돌릴 수 없어 빠진 것으로 보인다. 이번 감사에서 직접 실행해 동작은 확인했다:

```
=== CANCELED blockedQueueReason: Run is blocked: auth:sample:1 is CANCELED in auth.
                                 Reverse that decision explicitly before running.
=== CANCELED runTask refused: Run is blocked: auth:sample:1 is CANCELED in auth. ...
```

동작은 맞지만 **회귀를 잡아줄 테스트가 없다.** 3개 상태 중 2개만 고정돼 있다.

---

## (C) 반증 시도 — 우회 2건

### C-1. attach / detach / 미결의 취급

| 상황 | 코드 동작 | 근거 | 평가 |
|---|---|---|---|
| Objective에 attach되지 않음 | **통과(실행됨)** | `run.ts:173-175` `items.length === 0 → continue`, 최종 `return null` | **fail-open**. 아래 참조 |
| attach 후 detach | **해당 없음** | detach 커맨드·함수가 존재하지 않는다. `src/` 전수 grep에서 `detach`는 `isolation.ts:82`의 `git worktree add --detach` 뿐. 큐 항목은 `CANCELED`(종결)로만 제거된다 | 시나리오 성립 안 함 |
| 큐 결정이 없는(미결 = WAITING) | **통과(실행됨)** | `run.ts:183-190`이 `BLOCKED`/`CANCELED`/`SKIPPED`만 막는다 | 의도된 동작 |

**미attach → 통과는 fail-open이다.** `run.ts:159-161`의 주석이 그 판단을 명시한다("A Task attached to no Objective is not blocked: the queue has expressed no opinion about it"). 명시적으로 문서화된 결정이라는 점에서 2026-08-10 권고("Task가 어떤 Objective에도 attach되지 않은 경우의 정책을 명시적으로 정하라")는 충족했다.

그러나 지적해 둔다. 이 설계는 **"차단하려면 먼저 attach되어 있어야 한다"**는 전제 위에 선다. 큐에서 항목을 지우는 정상 경로가 없으므로 지금은 안전하지만, 향후 detach가 생기면 그 순간 "차단을 우회하는 정상 커맨드"가 된다. detach를 만들 때 반드시 `CANCELED`와 같은 급으로 취급하거나, 차단 이력이 있는 항목의 detach를 거부해야 한다.

### C-2. 원장 파손 / 디렉터리 부재에서 fail-open (재현됨)

`run.ts:176-182`는 이 경우를 위해 쓰인 검사다:

```ts
// A replay that could not be trusted must not be read as permission.
if (snapshot.replay.replayStatus !== "COMPLETE") {
  return (`Run is blocked: ${objectiveId} holds this Task but its ledger replay is ...`);
}
```

그런데 이 검사가 `run.ts:173-175`의 뒤에 있다:

```ts
const items = snapshot.queue.filter((item) => item.taskId === taskId);
if (items.length === 0) {
  continue;               // ← 파손된 원장은 여기서 빠져나간다
}
```

원장이 구조적으로 깨지면 queue가 빈 배열이 되므로 검사에 도달하지 못한다. 실측:

```
replayStatus: BLOCKED
queue length: 0
findings: [{"failureClass":"LEDGER_STRUCTURAL_FAILURE","checkId":"LEDGER_JSONL_PARSE",
            "detail":"line 1 is not valid JSON","affectedSeq":null}]

=== corrupt ledger blockedQueueReason: null
=== corrupt-ledger runTask: RAN -> 2026-08-11_002
```

`.codefleet/objectives` 디렉터리를 옮기기만 해도 같다 (`run.ts:166-168`의 `catch { return null }`):

```
=== objectives dir hidden, blockedQueueReason: null
=== hidden-dir runTask: RAN -> 2026-08-11_001
```

두 우회 모두 **차단 결정이 원장에 남아 있는데도 Run이 실행된다.** 이것이 정확히 P0-2가 막으려던 상태다. 신규 결함 **P0-9**로 등재했다 (`07-new-defects.md`).

---

## 권고

1. **P0** — `run.ts:173-182`의 순서를 뒤집는다. `replayStatus !== "COMPLETE"` 판정을 `items.length === 0` 분기보다 **먼저** 수행해야, 검사가 자기가 쓰인 이유대로 동작한다.
2. **P0** — `run.ts:166-168`의 `catch`를 `ENOENT`에 한정한다. "디렉터리가 없다"와 "읽을 수 없다"는 다른 사실이고, 후자를 허가로 읽어서는 안 된다.
3. **P1** — `CANCELED`를 `runTask`까지 관통하는 테스트를 추가한다. 종결 상태라 루프에 넣기 어려우면 별도 test로 분리한다.
4. **P1** — detach를 도입할 때 차단 이력이 있는 항목을 어떻게 다룰지 먼저 정한다. 지금 없기 때문에 안전한 것이지, 설계가 그것을 막고 있는 것이 아니다.
