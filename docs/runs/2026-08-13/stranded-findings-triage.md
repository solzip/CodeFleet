# 방치된 등재 소화 — 현황 파악과 우선순위

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 15:40 (KST) |
| 대상 커밋 해시 | `097681b` |
| 작업 유형 | **감사** (현황 확인·우선순위 확정. 수정 없음) |
| 선행 문서 | `docs/runs/2026-08-13/conventions.md` (「끊긴 것」 §A·§B), `docs/runs/2026-08-13/banner-order-regression.md` |
| 번호 실측 최대값 | **P0-16 / P1-61** |
| **테스트 근거** | 코드 읽기 감사이므로 스위트를 돌리지 않았다. 직전 상태의 근거는 `banner-order-regression.md` (`npm test` → 0) |

---

## 요약

**11건 중 8건이 이미 해소돼 있었다.** 등재 이후 아무도 확인하지 않았을 뿐이다. 고친 커밋은 `38cf9c9`(S3)와 `5055cf3`(리뷰) 둘이고, 둘 다 등재 문서를 갱신하지 않았다.

| 판정 | 건수 | ID |
| --- | --- | --- |
| 이미 해소됨 | **8** | P0-14, P0-15, P0-16, P1-42, P1-43, P1-44, P1-48, P1-49 |
| 여전히 유효 | **3** | P1-45, P1-46, P1-47 |

---

## B-1. 11건 현황

"이미 해소됨"은 고친 커밋 또는 코드를 지목한 것만이다.

### P0-14 — Objective relation이 실행되는 revision을 가리키지 않는다

등재: relation이 taskId만 보고 붙어, revision 1에 붙은 relation이 revision 2의 Run을 허가했다.

**[이미 해소됨]** — `src/run.ts:269`가 `item.taskRevision === taskRevision`으로 대조하고, `:283`이 다른 revision일 때 전용 거부문을 낸다.

```
Run is blocked: <taskId> is attached to an Objective, but not at revision <N>.
```

고친 커밋: `38cf9c9` (S3).

### P0-15 — relation의 revision·hash가 Task 원장과 대조되지 않는다

등재: 존재하지 않는 revision에도 attach가 성공했다.

**[이미 해소됨]** — `src/ledger.ts:679-691` `verifyRevisionReference`가 `readTaskEvents`로 원장을 읽어 대조하고, `:738`에서 호출해 `:759`에서 거부한다. 원장이 비면 "revision N does not exist"로 막는다.

고친 커밋: `38cf9c9` (S3).

### P0-16 — 읽을 수 없는 Task 원장이 빈 원장으로 읽힌다

등재(`15-new-module-review.md:29`): 원장 읽기 실패가 `[]`로 수렴해, 승인이 없는 것처럼 보이고 그 위에 새 승인이 쌓인다.

**[이미 해소됨]** — `src/task-events.ts:107-118`이 **ENOENT만** `[]`로 돌려주고 나머지 오류는 `TaskLedgerUnreadableError`를 던진다. 주석이 그 경계를 명시한다: "A Task that has never been approved has no ledger, and that is the only absence this reader may report as one."

고친 커밋: `5055cf3`.

### P1-42 — `TASK_REVISION_SUPERSEDED`를 append하는 코드가 0곳

**[이미 해소됨]** — `src/task-ledger.ts:484`가 `appendTaskEvent(..., "TASK_REVISION_SUPERSEDED", ...)`를 호출한다. 선언(`task-events.ts:16`)·replay(`task-ledger.ts:293`)·생산이 모두 존재한다.

### P1-43 — `resume.sourceHashPolicy`를 읽는 코드·테스트가 없다

**[이미 해소됨]** — `src/run.ts:908-915`가 주석으로 "sourceHashPolicy is not decorative"라 적고 승인 해시 거부에 연결하며, `test/approval-contract.test.ts:273`이 `plan.resume.sourceHashPolicy === "TASK_AND_PROFILE_MUST_MATCH"`를 단언한다. 로드맵 `[x] S6-5`와 일치한다.

### P1-44 — invalidate 이후 승계 없는 revision이 어떤 상태도 아니다

**[이미 해소됨]** — `src/task-ledger.ts:249`가 `RevisionState = "APPROVED" | "SUPERSEDED" | "INVALIDATED"`를 정의하고, `:285-292`가 승계가 없을 때만 `INVALIDATED`를 매긴다. 주석이 우선순위까지 적는다 — 승계가 더 강한 진술이므로 `SUPERSEDED`를 덮지 않는다.

> **단서**: 등재문은 "설계의 3개 상태(APPROVED/SUPERSEDED/CANCELED) 중 무엇도 아니다"였다. 증상(상태가 없음)은 사라졌으나, 코드는 `INVALIDATED`를 쓰고 설계 문서에서 `CANCELED`는 **큐 아이템 상태**로 나타난다(`concept-foundation.md:12217` `storedState: "WAITING | BLOCKED | SKIPPED | CANCELED"`). 등재 시점의 "3개 상태" 서술이 큐 상태와 revision 상태를 섞었을 가능성이 있다. **이 정합은 확인하지 않았다** — 정의 확정이 필요한 별개 질문이다.

### P1-45 — Draft `REJECTED`를 만드는 이벤트가 없다

**[여전히 유효]** — `src/task-ledger.ts:308-310` 주석이 스스로 그렇게 적고 있다.

```
REJECTED is missing because no event produces it — a draft is currently
discarded by deleting the file. Registered as P1-45
```

`DraftState`는 `"EDITING" | "READY_FOR_APPROVAL"` 둘뿐이다(`:311`). 실행으로 확인할 방법은 없다 — 만들 수 없는 상태의 부재다.

### P1-46 — `OBJECTIVE_CLOSED`를 append하는 코드가 0곳

**[여전히 유효]** — `grep -rn "OBJECTIVE_CLOSED" src/` 결과 2곳뿐이다: 타입 유니온(`ledger.ts:20`)과 replay 분기(`ledger.ts:242`). **생산 0곳.** Objective를 닫는 경로가 CLI에도 없다.

### P1-47 — `deriveLocalReviewStatus`가 비수용 결정을 잘못 분류한다

**[여전히 유효]** — `src/review.ts:604-634`. `ACCEPTED`가 아닌 결정이 번들 `DEGRADED`가 아니면 마지막 줄에서 `MIGRATION_READY`로 떨어진다.

```ts
  if (bundle.bundleStatus === "DEGRADED") {
    return { status: "DEGRADED_RECORDED", reasons: bundle.unavailableReasons };
  }

  return { status: "MIGRATION_READY", reasons: [] };   // ← REJECTED도 여기로
```

**실행 확인 가능** — 단, 이 빌드의 모든 Run이 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE` 갭을 갖고 모든 번들이 `DEGRADED`이므로, 도달하려면 원장의 결정을 직접 `REJECTED`로 바꿔야 한다. `14-guard-defence-audit.md`가 그 방법으로 회귀 테스트를 추가했다.

## B-2. 나머지 두 감사

### `14-guard-defence-audit.md` — 지시대로 우선 처리

**대상 커밋 `c325dec`는 오염 구간 안이다.** `git merge-base --is-ancestor`로 확인했다.

**그러나 결론은 오염되지 않았다.** 이 감사의 신호는 **실패한 테스트 이름**이지 종료 코드가 아니다(`:26-33`).

> 게이트마다 조건문을 `if (false && ...)` 로 바꾸거나 함수를 무력화하고 `npm test`를 돌린 뒤, **실패한 테스트 이름을 수집**하고 원본을 복구한다.

posttest 실패는 테스트 이름 실패를 하나도 추가하지 않는다 — 러너가 끝난 뒤의 별도 단계다. 그리고 결과표에 **`0 ← 구멍`** 행이 두 개 있다는 것이 신호가 이름이었다는 증거다. 종료 코드를 읽었다면 항상 빨강이므로 0을 구분할 수 없었을 것이다.

이 감사가 찾은 결함 2건은 같은 커밋에서 수정됐다(`:154` 이하 「수정」 절). **신규 등재 없음.** 결론은 지금도 유효하다.

### `15-new-module-review.md`

**대상 커밋 `282ad2c`도 오염 구간 안이다.** 테스트 건수를 인용한다(`:179` "251 → 252 통과"). 그 숫자는 참이고 커맨드는 빨강이었다 — `p1-61-posttest-green.md`의 영향받은 판정 목록 2번 항목과 같다.

등재 3건은 전부 위에서 확인했다: **P0-16·P1-48·P1-49 모두 [이미 해소됨]**, 고친 커밋은 `5055cf3`으로 이 감사 바로 다음이다. 감사의 결론은 유효했고 그대로 반영됐으며, 다만 **등재부가 갱신되지 않았다.**

## B-3. 우선순위 — 이번 작업의 핵심 산출물

기준: ①산출물이 거짓 문장을 만든다 ②계약·승인·게이트가 강제되지 않는다 ③증거가 사라진다 ④나머지.

### 1군 — 산출물이 거짓 문장을 만든다

| 순위 | ID | 등급 | 안 고치면 무엇이 거짓이 되는가 |
| --- | --- | --- | --- |
| 1 | **P1-50** | **P0** | 리뷰를 마친 모든 Run의 `run-record.md`가 "검증 증거가 생산되지 않았다"고 말한다. **증거는 존재하고 같은 파일이 그것을 링크한다.** 완주한 Run일수록 문서가 나빠진다 — **현재 발현 중** |
| 2 | P1-54 | P1 | 워크스페이스 스냅샷이 `workingDirectoryRef: "."`를 부재가 아니라 사실로 기록한다. 호출부가 인자를 생략하는 순간 "작업 디렉터리는 저장소 루트다"라는 없던 주장이 증거에 박힌다 — **잠복** |

### 2군 — 계약·승인·게이트가 실제로 강제되지 않는다

| 순위 | ID | 등급 | 안 고치면 무엇이 거짓이 되는가 |
| --- | --- | --- | --- |
| 3 | **P1-47** | P1 | "원장은 효력 있는 결정만 담는다"가 거짓이 된다. 갭 없는 번들이 가능해지는 순간 REJECTED가 `MIGRATION_READY`로 import되고, 거부된 Run의 변경을 막는 유일한 방어가 `apply.ts`의 분기 하나가 된다 |
| 4 | **P1-57** | P1 | `policies.harness.allowedModes`로 모드를 제한한 프로파일이 아무 모드도 제한하지 않는다. **오타는 거부하면서 값은 무시한다** |
| 5 | P1-2 | P1 | "파괴적 커맨드는 승인으로 허용할 수 있다"가 거짓이다. `approvedCategoryIds`가 `run.ts:1630`에 `[]`로 하드코딩돼 승인 경로가 막다른 길이다 |
| 6 | P1-51 | P1 | "사람이 갭에 책임을 서명했다"가 약해진다. `--waive-reason` 없이 일반 `--reason`이 조용히 정당화로 승격되고, 이를 막는 가드는 CLI 경로에서 발동 불가능하다 |
| 7 | P1-58 | P1 | `approvalRequiredForDestructiveCommands`를 `false`로 바꿔도 아무것도 완화되지 않는다. 프로파일이 통제점인 척한다 |
| 8 | P1-15 | P1 | 어댑터의 capabilities 거부에 테스트가 0건이다. 그 거부가 사라져도 스위트가 알아채지 못한다 |
| 9 | P1-60 | P1 | `run-record.md`의 검증 절에 테스트가 0건이다. **P1-50이 그 자리로 되돌아온 경로가 정확히 이것이다** |
| 10 | P0-1 / P0-3 / P0-6 | P0 | 각각 부분해소로 남은 잔여. 파일 범위 사전 차단 부재, `status: DONE` 순차 재실행, 어댑터 타임아웃 기계 판독 불가 |

### 3군 — 증거가 사라진다

| 순위 | ID | 등급 | 안 고치면 무엇이 거짓이 되는가 |
| --- | --- | --- | --- |
| 11 | P1-56 | P1 | 같은 Run을 두 번 리뷰하면 이전 로컬 결정이 사라진다. `review-decision.local.json`은 경로가 하나이고 `SUPERSEDED` 상태는 생산되지 않아, **대체된 결정이 있었다는 사실 자체가 남지 않는다** |
| 12 | P1-17 | P1 | SIGTERM 후 자식이 살아남으면 그 프로세스가 만든 변경이 어떤 스냅샷에도 안 잡힌다 |
| 13 | P1-28 | P1 | Objective 디렉터리를 지우면 큐 결정이 소실된다. **수용된 한계**로 등재돼 있으며 수정 대상이 아니다 |

### 4군 — 나머지

| 순위 | ID | 안 고치면 무엇이 거짓이 되는가 |
| --- | --- | --- |
| 14 | **P1-55 + P1-52** | 타입 선언만 읽으면 "검증 waiver가 구현돼 있다"고 읽힌다. **이 오독은 이미 한 번 일어났다** — 2026-08-13 감사가 "검증 게이트를 waiver로 통과시켰다"는 틀린 전제로 시작했다. 4군이지만 **실현된 피해가 있는 유일한 항목** |
| 15 | P1-59 | `run-record.ts:4-7` 주석이 "redaction can block an export outright"라고 적는데 내보낼 방법이 없다. 코드를 읽는 사람이 없는 보호장치를 믿는다 |
| 16 | P1-46 | `OBJECTIVE_CLOSED`가 replay되지만 아무도 만들지 않는다. Objective를 끝내는 방법이 없다 |
| 17 | P1-45 | Draft `REJECTED`가 없다. 반려된 초안이 파일 삭제로만 처리된다 |
| 18 | P1-44 잔여 | revision 상태 이름(`INVALIDATED`)이 설계 서술(`CANCELED`)과 맞는지 **정의 확정 필요** |

### 이 목록에서 먼저 손대야 할 것

**P1-50과 P1-60은 같은 작업이다.** P1-50이 발현 중인 유일한 거짓 문장이고, P1-60이 그것이 되돌아온 경로다. 하나만 고치면 다시 돌아온다.

**P1-55/P1-52는 4군인데 실현된 피해가 있다.** 우선순위 기준이 "무엇이 거짓이 되는가"인데, 이 둘은 이미 한 번 잘못된 감사 전제를 만들었다. 기준대로면 4군이 맞고, 비용이 낮으므로(선언 제거 또는 구현) 1군 작업에 얹을 수 있다.

## B-4. REGISTER 정합

| 이동 | 건수 | ID |
| --- | --- | --- |
| 미확인 → 해소 | **9** | P0-13, P0-14, P0-15, P0-16, P1-42, P1-43, P1-44, P1-48, P1-49 |
| 미확인 → 미해소 | **3** | P1-45, P1-46, P1-47 |

P0-13도 이번에 확인했다 — `run.ts:293`이 "not attached to any Objective"로 거부한다.

갱신 후 집계: 해소 25 / 부분해소 8 / 재현안됨 1 / 미해소 16 / **미확인 27** / 합계 77.

### 여전히 [미확인]인 27건과 그 사유

| 범위 | 건수 | 왜 확인하지 않았나 |
| --- | --- | --- |
| P1-1, P1-5~P1-14, P1-16, P1-18, P1-19 | 14 | 2026-08-10·08-11 등재. **이번 지시 범위가 "방치된 11건"이었다.** 확인 자체는 가능하며 별도 작업이 필요하다 |
| P1-20~P1-26, P1-29~P1-31, P1-33, P1-36, P1-39~P1-41 중 미확인분 | 13 | 같음. 다만 P1-41은 이 세션에서 [부분해소]로 이미 옮겼다 |

**비용이 커서 못 한 것이 아니라 범위 밖이라 안 한 것이다.** 27건 모두 코드 읽기로 판정 가능해 보인다.

---

## 결론

1. 방치된 11건 중 **8건이 이미 해소돼 있었다.** 고친 커밋은 `38cf9c9`와 `5055cf3`이고, 둘 다 등재부를 갱신하지 않아 8건이 [미확인]으로 남아 있었다.
2. `14-guard-defence-audit`의 대상 커밋은 오염 구간이지만 **결론은 오염되지 않았다** — 신호가 종료 코드가 아니라 실패한 테스트 이름이었고, 결과표의 `0 ← 구멍` 행이 그 증거다.
3. 남은 미해소를 4개 군으로 정렬했다. **1군은 P1-50 하나뿐이며 현재 발현 중이고, P1-60과 한 작업으로 묶어야 한다.**

## 다음 작업

- **P1-50 + P1-60을 한 작업으로** — 1군 유일 발현 항목과 그것이 되돌아온 경로
- 미확인 27건 판정 (코드 읽기로 가능)
- 영향받은 판정 6건 재판정
- `docs/audits/2026-08-13/SUMMARY.md` 신설

## 미해소로 남긴 것

- **수정은 하나도 하지 않았다**(지시). 여전히 유효한 3건도 그대로다
- **P1-44의 enum 정합**(`INVALIDATED` vs 설계의 `CANCELED`)은 정의 확정이 필요해 판정하지 않았다. 설계 문서에서 `CANCELED`는 큐 아이템 상태로 나타나므로, 등재문의 "3개 상태" 서술 자체가 검토 대상일 수 있다
- **미확인 27건**은 범위 밖이라 손대지 않았다. 비용 문제가 아니다
- `15-new-module-review`가 인용한 테스트 건수는 오염 구간 값이다. 다만 그 등재 3건은 코드로 독립 확인했으므로 결론에는 영향이 없다
