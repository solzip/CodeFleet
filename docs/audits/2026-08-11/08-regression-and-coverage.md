# 회귀 확인과 커버리지 주장 검증

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/run.ts, src/agent.ts, src/review.ts, src/auto-review.ts,
             docs/rule-implementation-status.json, src/profile.ts, src/ledger.ts
측정 근거   : npm test — 199 tests, 199 pass, 0 fail, duration 12,200ms
             coverage — 83 rules / 545 condition lines / 345 covered (63.3%) / claims 352
```

---

## 1. 회귀 확인

2026-08-10 감사에서 **[통과]**로 판정한 두 항목이 수정 과정에서 깨지지 않았는지 확인했다.

### 1-1. 승인 없는 실행 경로 부재 — **유지**

에이전트 프로세스가 spawn되는 지점과 그 앞의 차단을 전수 확인했다.

| 확인 | 결과 |
|---|---|
| `spawn` 호출 지점 (src/ 전수) | `agent.ts:183`, `isolation.ts:34`, `run.ts:1986` — 에이전트를 띄우는 것은 `agent.ts:183` 하나 |
| `agent.ts:183`에 도달하는 경로 | `run.ts:691` `runAgentSafely` → `run.ts:1839` `createAgentAdapter` → `run.ts:1840` `agent.run()` → `agent.ts:60` `runCommand` |
| `createAgentAdapter` 호출 지점 | `src/run.ts:1839` 하나 |
| `runTask` 호출 지점 (CLI) | `src/cli.ts:89` 하나 |
| `executeRun` 외부 노출 | 없음 (`run.ts:330`, `export` 없음) |

차단은 `src/run.ts:342-349`:

```ts
const approval = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
if (approval.blockedReason.length > 0) {
  throw new Error(`Task is not approved for execution: ${taskId} (${approval.blockedReason}).\n` + ...);
}
```

**위치가 더 앞으로 갔다.** 2026-08-10 기준으로 이 검사는 `projectPath` 해석보다 앞에 있었는데, 이번 슬라이스에서 추가된 것들(큐 게이트 `:354`, 명령 채널 `:364`, 역할 해석 `:394`, 어댑터 해석 `:415`, 격리 해석 `:419`, `projectPath` `:424`, runDir 예약 `:426`, 격리 준비 `:679`)이 전부 그 **뒤**에 놓였다. 승인이 여전히 첫 관문이다.

`test/run.test.ts`의 승인 관련 테스트 3종이 그대로 통과한다. 새로 추가된 `test/defect-repro.test.ts:378`도 `runTask(root, "missing-task")`의 거부를 assert한다.

### 1-2. 리뷰 게이트의 waiver 불가 차단 — **유지**

`src/review.ts:545-557`

```ts
for (const reason of bundle.unavailableReasons) {
  if (classifyGap(reason) === "EVIDENCE_DEFECT") {
    // Nobody can stand in for evidence that is missing or does not match its
    // recorded hash, so this is never waivable.
    blockedReasons.push(`evidence defect cannot be waived: ${reason}`);
    continue;
  }
  if (waivedGaps.includes(reason)) { waived.push(reason); continue; }
  blockedReasons.push(`capability gap not waived: ${reason}`);
}
```

`waivedGaps`에 무엇을 넣든 EVIDENCE_DEFECT는 `continue`로 waiver 분기에 도달하지 못한다. `src/review.ts:214-218`이 `acceptance.allowed === false`면 ACCEPTED를 던지고, `deriveLocalReviewStatus`(`review.ts:607-610`)도 같은 분류를 다시 읽어 `MIGRATION_BLOCKED`으로 내린다. 두 경로가 같은 `classifyGap`을 쓰므로 하나만 통과하는 상태가 만들어질 수 없다(`review.ts:605-606` 주석의 의도 그대로).

`EVIDENCE_DEFECT_PREFIXES`(`review.ts:48`)는 `["HASH_INVALID", "ARTIFACT_NOT_READABLE", "MISSING_INPUT_REF"]`로 유지됐고, **P0-5 수정이 여기에 항목을 추가하는 방식으로 붙었다** — `MISSING_INPUT_REF:runPlanRef#/approval/taskRevision`(`review.ts:461`). 기존 경계를 넓히지 않고 그 안에 들어갔다.

#### 신설 경로 점검: SYSTEM_POLICY 자동 수락

이번 슬라이스에서 `src/auto-review.ts`가 새로 생겼다. 자동 ACCEPTED가 waiver 경계를 우회하는지 확인했다 — **우회하지 않는다.**

`src/auto-review.ts:76-83`

```ts
check(input.capabilityGaps === 0, `UNRESOLVED_CAPABILITY_GAPS:${input.capabilityGaps}`);
check(input.evidenceDefects === 0, `UNRESOLVED_EVIDENCE_DEFECTS:${input.evidenceDefects}`);
// WAIVED_INCOMPLETE is exactly the state a human may accept and CodeFleet may
// not: it means someone stood in for evidence that was never collected.
check(input.evidenceCompleteness === "COMPLETE", `EVIDENCE_COMPLETENESS_NOT_COMPLETE:...`);
```

gap을 **waive했는지**가 아니라 **0건인지**를 요구한다. `mode: execute`로 실행된 모든 Run은 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`을 capability gap으로 갖게 되므로(`run.ts:880`), 실제 실행 Run에서 자동 수락은 구조적으로 발동할 수 없다. `computedRisk === "LOW"`와 `computedRisk !== "UNKNOWN"`을 따로 요구하는 것(`:68`, `:71`)도 정확하다 — UNKNOWN은 높은 위험이 아니라 없는 위험이고, 조치가 다르다.

`scanScope.conditionsChecked: 16`(`:91`)이 하드코딩인데 실제 `check()` 호출도 16개다(`:58, 59, 62, 63, 64, 68, 71, 72, 73, 74, 75, 76, 77, 80, 84, 85`). 현재는 일치하나, 조건을 추가하면서 이 숫자를 잊으면 "16개 검사했다"가 거짓이 된다. 배열 길이에서 유도하는 편이 이 코드베이스의 규율에 맞는다 → P2.

---

## 2. 커버리지 주장 검증

### 2-1. 주장된 수치의 확인

`npm test` 실행 출력 그대로:

```
=== FINAL RULE coverage by condition line ===
  rules                  83
  condition lines        545
  claims recorded        352
  conditions covered     345  (63.3%)
  rules touched at all   75 of 83
  rules fully covered    28 of 83
  rules with no claim    8

  Why the unclaimed rules are unclaimed:
    IMPLEMENTED_UNTESTED   5
    NOT_CODE_VERIFIABLE    3
```

`docs/rule-implementation-status.json`의 `rules` 항목 수: 8. 상태 분포: `IMPLEMENTED_UNTESTED` 5, `NOT_CODE_VERIFIABLE` 3, **`NOT_IMPLEMENTED` 0**.

2026-08-10 기준선(재작성 커밋 `042b0ee`) 대비:

| | 2026-08-10 | 2026-08-11 |
|---|---|---|
| 상태 항목 수 | 41 | 8 |
| NOT_IMPLEMENTED | 32 | **0** |
| IMPLEMENTED_UNTESTED | 6 | 5 |
| NOT_CODE_VERIFIABLE | 3 | 3 |
| coverage | 28.4% (155/545) | 63.3% (345/545) |

"NOT_IMPLEMENTED 32 → 0"과 "coverage 63.3%"는 **주장대로다.** 상태 항목이 사라진 규칙은 33개다.

### 2-2. 표본 추출 방법

33개 중 3개를 결정론적 난수로 뽑았다. 정렬된 규칙 목록에 대해 `sha256("2026-08-11 re-audit")`의 바이트를 순서대로 인덱스로 사용했다(중복 제외). 사후에 유리한 항목을 고르지 않았음을 재현 가능하게 하려는 것이고, 같은 명령을 다시 돌리면 같은 3개가 나온다.

추출 결과: 인덱스 3, 23, 12.

### 2-3. 표본 검증

#### (1) `CORRECTIVE_EVENT_REQUIRES_VALID_LEDGER_AND_WRONG_DECISION` — 실구현 있음

| | 위치 | 내용 |
|---|---|---|
| 구현 | `src/ledger.ts:911-971` `appendCorrectiveEvent` | `repairRoutingFor(failureClass)`로 정정 허용 여부를 판정하고(`:927-931`), 대상 결정이 원장에 실재하는지 확인한 뒤(`:932-942`), 원본을 남기고 supersede 이벤트를 append한다(`:952-968`) |
| 테스트 | `test/policy-rule-id.test.ts:153-247` | 3개 failure class에 대한 거부(`:203-215`), dangling 참조 거부(`:218-227`), 적용 성공(`:229-234`), **원본 이벤트가 그대로 남고 결정이 2건이 되는 것**까지 assert(`:236-246`) |

상태 파일만 갱신된 항목이 아니다. 다만 **CLI 노출이 없다** — `src/cli.ts`에서 `appendCorrectiveEvent` 참조 0건. 규칙 구현은 실재하지만 운영자가 도달할 수 없다(P1-12).

#### (2) `REDACTION_RULE_FAILURE_BLOCKS_EXPORT` — 실구현 있음

| | 위치 | 내용 |
|---|---|---|
| 구현 | `src/profile.ts:608-618` `checkRedactionRules` | `validateRedactionRules`의 finding을 이 checkId로 승격해 Profile 검증 실패로 만든다 |
| 테스트 | `test/export.test.ts:241` | `assert.rejects(() => loadProfile(root), /REDACTION_RULE_FAILURE_BLOCKS_EXPORT/)` — 거부를 직접 assert |
| 클레임 | `test/export.test.ts:260-263` | 4개 조건 라인 |

#### (3) `PROFILE_DEFAULTS_RUN_AGENT_ADAPTER_SCHEMA` — 실구현 있음

| | 위치 | 내용 |
|---|---|---|
| 구현 | `src/profile.ts:485-509` `checkDefaultsRun` | AdapterId 형식 검사(`:490-496`)와 `allowedAdapters` 소속 검사(`:497-508`) 두 갈래 |
| 테스트 | `test/adapter-resolution.test.ts:128-131` | 두 조건 각각에 클레임 |

### 2-4. 판정: **[신뢰가능]** — 단, 표본 3/33에 한정

표본 3건 모두에서 상태 값 변경뿐 아니라 **실제 구현 코드와 실행되는 테스트**를 확인했다. 상태 파일만 갱신되고 구현이 없는 항목은 발견되지 않았다. 따라서 전체 커버리지 주장을 [신뢰불가]로 표시할 근거가 없다.

판정의 범위를 정확히 적어 둔다: 33개 중 3개를 확인했다. 나머지 30개는 확인하지 않았고, 확인하지 않은 것을 통과로 셈하지 않는다.

보조 근거 두 가지가 이 판정을 뒷받침한다.

1. `scripts/check-rule-coverage.mjs`가 클레임 없는 규칙에 상태 항목이 없으면 실패하고, **클레임이 생긴 뒤에도 상태 항목이 남아 있으면 실패한다.** 즉 상태 파일만 지우고 클레임을 넣지 않는 방향의 조작은 `npm test`에서 걸린다.
2. 클레임은 `coversRule(ruleId, "condition text")`을 테스트 본문 안에서 호출해야 기록되고, 조건 문자열이 규칙 원문에 실재해야 한다. 실패하거나 실행되지 않은 테스트는 아무것도 기여하지 못한다.

이 두 장치 때문에 "상태만 갱신"이 성립하기 어려운 구조이고, 표본 3건이 그것과 일치했다.

### 2-5. 커버리지 수치에 대한 주석

63.3%는 **조건 라인 중 클레임이 붙은 비율**이지 정확성의 비율이 아니다. 검사기 출력이 그 점을 스스로 적는다:

```
A claim means a passing test quoted that condition. It does not
mean the condition is correctly implemented.
```

이번 감사가 그 문장의 실례를 만들었다. `PROFILE_DEFAULTS_RUN_ISOLATION_MODE_SCHEMA`는 상태 항목에서 제거됐고 `resolveIsolation`도 프로파일 값을 읽지만(`run.ts:1759-1774`), **그렇게 읽은 GIT_WORKTREE로 실제 Run을 돌리면 증거가 엉뚱한 트리에서 수집된다(P0-7).** 스키마 규칙은 정확히 구현됐다. 그 값이 만드는 실행 경로가 깨져 있을 뿐이고, 그 경로를 덮는 규칙이 없다.

**커버리지가 63.3%로 올라간 것과, 이번 감사에서 P0 4건이 새로 나온 것은 모순이 아니다.** 클레임은 규칙이 말하는 조건을 덮고, 이번 결함들은 규칙 사이의 이음매에 있다.
