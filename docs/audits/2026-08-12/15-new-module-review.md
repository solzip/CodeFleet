# 15 — 신규 모듈 3개 코드 리뷰

```text
작성 일시   : 2026-08-12
기준 커밋   : 282ad2c (14번 감사 완료 시점)
대상        : S1~S7이 새로 만든 모듈 3개
             src/task-events.ts     (~130줄)
             src/task-revision.ts   (~290줄)
             src/apply.ts           (~300줄)
왜 필요했나 : 14번 감사는 **게이트 단위**로만 봤다. 각 게이트가 방어되는지는
             전수로 확인했지만, 게이트가 아닌 로직 — 경로 처리, 오류 분기,
             순서, 스캔 범위 — 은 아무도 읽지 않았다. 이 세 모듈은 작성 이후
             누구의 검토도 받은 적이 없다.
방법        : 읽고, 의심되는 것마다 실제로 재현한다. 추론으로 끝내지 않는다.
```

## 결과 요약

결함 3건. 전부 수정하고 회귀를 붙였다.

| # | 모듈 | 결함 | 등급 |
|---|---|---|---|
| 1 | `task-events.ts` | 읽을 수 없는 Task 원장이 **빈 원장으로 읽힌다** | **P0-16** |
| 2 | `task-revision.ts` | replay 실패한 Objective가 "relation 없음"으로 기록된다 | P1-48 |
| 3 | `apply.ts` | 주석이 코드가 하지 않는 drift 검사를 주장한다 | P1-49 |

---

## 결함 1 — 읽을 수 없는 Task 원장이 빈 원장이 된다 (P0-16)

```ts
export async function readTaskEvents(rootDir, taskId) {
  try {
    ...
  } catch {
    return [];          // ← 모든 오류
  }
}
```

세 가지가 하나로 붕괴한다:

- 원장이 없다 (정당: 승인된 적 없음)
- 원장이 있는데 줄 하나가 깨졌다 (손상)
- 원장이 있는데 열 수 없다 (권한, ENOTDIR, I/O)

전부 "이 Task는 승인된 적 없다"로 읽힌다.

### 재현 — 잘못된 줄 하나를 덧붙였다

```text
events after a clean approval : 2
approvedRevision              : 1

--- 잘못된 줄 1개 추가 후 ---
readTaskEvents                : 0 events   (파일은 3줄)
replayApproval.blockedReason  : NO_REVISION_CREATED
replayApproval.latestRevision : 0
approve over corruption       : M4_APPEND  EEXIST .../revisions/0001.json
TASK_REVISION_CREATED entries : [1, 1]      ← 중복
duplicate revision numbers    : true
attach message                : "it has no Task ledger, so revision 1 does not exist."   ← 거짓
```

**손상이 다른 종류의 손상으로 변환됐다.** 승인은 다음 revision 번호를 이 이벤트들에서
계산한다. 원장이 비어 보이니 `next = 0 + 1 = 1`이 되어, 이미 revision 1을 담고 있는
파일에 **두 번째 revision 1을 append했다.**

그 뒤를 막은 것은 revision 산출물의 `wx` 배타 생성이다. 즉 **의도한 첫 번째 방어가
없어서 두 번째 방어가 대신 섰고**, 그때는 이미 원장에 중복 이벤트가 들어간 뒤였다.

`attachTask`는 "원장이 없다"고 말한다. 원장은 있고 승인도 있다.

### 왜 이것이 P0인가

Objective 원장은 같은 상황을 올바로 처리한다 — `readEvents`가 `parseFindings`를
반환하고 `objectiveSteps.precheck`가
`ledger is structurally invalid; repair the source before mutating`로 거부한다.
P0-9가 그 규칙을 세웠고, 그 문구가 코드에 남아 있다:

> unread is not the same as empty — swallowing them let a Task somebody
> cancelled run because a directory was in the way.

**같은 규칙이 다른 원장에는 적용되지 않았다.** 그리고 이쪽은 읽기만 잘못되는 게
아니라 **읽을 수 없는 파일 위에 쓴다.**

### 수정

`TaskLedgerUnreadableError`. `ENOENT`만 빈 배열로 반환하고, 파싱 실패는 **몇 번째
줄인지** 이름으로 적어 던진다. 나머지 오류는 코드와 함께 던진다.

수정 후 같은 시나리오:

```text
readTaskEvents        -> TaskLedgerUnreadableError: line 3 of 4 is not valid JSON
replayApproval        -> 같은 오류
approveTask           -> M2_PRECHECK, applied=false
원장 파일             -> 바이트 단위로 변경 없음
```

회귀는 마지막 줄을 단언한다 — **거부는 append하지 않는다**가 이 결함의 핵심이었다.

---

## 결함 2 — replay 실패한 Objective가 "relation 없음"이 된다 (P1-48)

`captureRelations`가 `replayObjective`를 호출하고 `snapshot.queue`를 읽는데,
`snapshot.replay.replayStatus`를 **보지 않는다.** 손상된 원장은 빈 큐로 replay되므로:

```text
objectivesRead    : 1        ← 읽었다고 센다
queueItemsScanned : 0
relations         : []       ← 건강한 빈 Objective와 구별 불가
```

이 함수 **바로 위 주석**이 금지하는 상황이다:

> an unreadable one is not swallowed, because zero items examined must not read
> the same as zero items found.

CLAUDE.md의 규칙이기도 하다 — "Zero items examined is a failure, not a pass."

### 수정

`scanScope.objectivesUnreadable: string[]`. 세지 않고 **이름으로** 적는다. 스냅샷을
믿을지 판단하는 사람에게 필요한 것은 몇 개가 빠졌는지가 아니라 어느 것이 빠졌는지다.

던지지는 않는다. 승인은 relation 스냅샷에 의존하지 않으므로, 무관한 Objective가
손상됐다고 승인을 거부하면 아무도 요구하지 않은 폭발 반경이 된다. 그 판단도 주석에
남겼다.

---

## 결함 3 — 코드가 하지 않는 검사를 주석이 주장한다 (P1-49)

```ts
// The workspace must be what the patch was written against. The pre-run
// snapshot recorded a stateHash over the same scope; if the workspace has
// moved since, the patch describes content that is no longer there.
const recordedHash = preRun?.stateHash?.value;
if (typeof recordedHash !== "string" || recordedHash.length === 0) { ... }
```

주석은 drift 감지를 말한다. 코드는 **해시가 존재하는지만** 보고 아무것과도 비교하지
않는다. 거부문도 "cannot tell whether the workspace has moved since"라고 적어,
해시가 있으면 알 수 있다는 뜻을 만든다 — 있어도 알 수 없다.

그리고 **비교할 수도 없다.** 저 해시는 격리 트리의 것이고 대상은 워크스페이스다.
둘을 비교하면 서로 다른 디렉터리를 비교하는 것이고, 그것이 정확히 P0-7이었다.

실제 drift 방어는 `git apply --check`이며 그쪽은 제대로 작동한다(14번 감사에서
방어 테스트 1개 확인).

이 저장소의 전제가 "산문이 코드가 하지 않는 것을 주장하면 안 된다"이므로 등재한다.

### 수정

주석과 거부문을 코드가 실제로 하는 것으로 바꿨다 — Run이 **기준 상태를 관측했는지**.
기준선 없는 패치는 출처를 알 수 없는 변경이다. drift는 `git apply --check`가 답한다고
명시하고, 왜 여기서 답할 수 없는지(P0-7)도 적었다.

---

## 검토했고 결함이 아니었던 것

| 항목 | 판정 |
|---|---|
| `apply`가 워크스페이스를 바꾼 뒤 이벤트를 append하는 순서 | **의도대로.** append 실패 시 postcheck가 "the workspace was changed but ... is not recorded as applied"로 명시 거부한다. 트랜잭션 없이 할 수 있는 최선이고 침묵하지 않는다 |
| `planApply`를 락 밖에서 한 번, precheck 안에서 다시 호출 | **의도대로.** TOCTOU를 락 안에서 다시 판정한다 |
| 여러 Objective에 걸친 결정 수집이 마지막 것을 채택 | **정합.** 정정(supersede)이 나중에 오므로 마지막이 유효한 결정이다 |
| `supersededChain`의 순환 방지 | **정합.** `seen` 집합으로 손 편집된 원장에서도 무한 루프 없음 |
| `readTaskRevision`의 `contract?.source ?? ""` | **정합.** contract가 없으면 해시가 어긋나 거부된다 |
| `writeTaskRevision`의 `wx` | **정합.** 결함 1에서 실제로 마지막 방어선 역할을 했다 |

## 측정값

| 항목 | 리뷰 전 | 리뷰 후 |
|---|---|---|
| 테스트 | 251 통과 / 0 실패 | **252 통과 / 0 실패** |
| 신규 모듈 결함 | 미측정 | **3건 발견 / 3건 수정** |
| rule 커버리지 | 345/545 (63.3%) | 345/545 (63.3%) |

## 하지 않은 것

- **슬라이스 상호작용 전수** (S1×S4, S3×S5 등). 14번과 15번 모두 범위 밖이다
- **플랫폼 자격 재측정** — win32에서만 돌렸다. `readTaskEvents`의 비-ENOENT 분기는
  POSIX 권한 오류에서 다르게 동작할 수 있고 측정하지 않았다
- **신규 코드의 FINAL RULE 대응 분류** — 세 번째 감사에서도 미측정. 추정하지 않는다
- `run.ts`·`task-ledger.ts`·`ledger.ts`의 **기존 코드 중 S1~S7이 수정한 부분**의
  전면 리뷰. 이번 범위는 신규 모듈 3개였다
