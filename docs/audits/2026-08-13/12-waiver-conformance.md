# waiver 정합성 감사 — first-full-loop의 waiver는 무엇이었나

| 항목 | 값 |
| --- | --- |
| 일시 | 2026-08-13 11:08 (KST) |
| 커밋 | `e5fb188b0951f30556da6b8b39a9d2a8db8e5a46` (working tree clean, `docs/runs/`만 untracked) |
| 대상 | `docs/runs/2026-08-13/first-full-loop.md`, runId `2026-08-13_001` |
| 증거 | fixture `C:\cf-fixture`의 `.codefleet/` 전체 (감사 시점 그대로 보존) |
| 범위 | 판정만. 수정·설계 변경 제안 없음 |

---

## 0. 전제 정정 — "검증 게이트를 waiver로 통과시켰다"는 사실이 아니다

지시문의 전제부터 반증한다. **이번 실행에서 검증 게이트는 waiver로 통과하지 않았다. 실제로 실행된 커맨드의 exit 0으로 통과했다.**

`.codefleet/runs/2026-08-13_001/verification/verify-001.json`:

```json
{
  "authority": "HARNESS_EXECUTED",
  "observedCheck": "PASS",
  "verificationGateResult": "SATISFIED",
  "verificationGateReason": "PASS",
  "waiverRef": { "unavailableReason": "VERIFICATION_WAIVER_NOT_PRESENT" },
  "unavailableReason": ""
}
```

`waiverRef`가 **`VERIFICATION_WAIVER_NOT_PRESENT`**다. 검증 waiver 자리는 비어 있다. 게다가 이 Run에서는 검증 waiver가 **허용되지도 않았다**:

```json
// run-plan.json → effectivePolicy.requiredGates.verification
{ "required": true, "waiver": { "allowed": false, "allowedActors": [], "explicit": true } }
```

실제로 waive한 것은 **다른 축**이다.

```json
// review-decision.local.json
{
  "verificationGateResult": "SATISFIED",       // ← 검증은 통과 (waiver 아님)
  "verificationGateReason": "PASS",
  "observedCheckSnapshot": "PASS",
  "evidenceCompleteness": "WAIVED_INCOMPLETE", // ← 여기가 waive된 축
  "waivedCapabilityGaps": [
    { "reason": "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE", "acknowledgedBy": "sol", "justification": "..." }
  ]
}
```

**두 축을 혼동하면 안 된다.**

| 축 | 이번 실행 | 무엇에 대한 것인가 |
| --- | --- | --- |
| 검증 게이트 | `SATISFIED` / `PASS` — **waiver 미사용** | 계약이 요구한 커맨드가 실행되고 exit 0이었나 |
| 증거 완전성 | `WAIVED_INCOMPLETE` — **waiver 사용** | 이 Run의 증거 수집에 관측 못 한 구멍이 있었나 |

---

## 작업 1 — waiver의 정확한 특정

### 1-1. 사용한 waiver

| 항목 | 값 |
| --- | --- |
| CLI 플래그 | `--waive-gap COMMAND_CHANNEL_NOT_HARNESS_VISIBLE` + `--waive-reason "<text>"` |
| CLI 파싱 | `src/cli.ts:318-319` → `waivedGaps`(콤마 분리), `waiveJustification` |
| 도메인 필드 | `ReviewOptions.waivedGaps` / `ReviewOptions.waiveJustification` — `src/review.ts:33-34` |
| 산출 필드 | `LocalReviewDecision.waivedCapabilityGaps[]` — `src/review.ts:154` |
| 대상 | `ReviewEvidenceBundle.unavailableReasons`의 개별 항목 (`CAPABILITY_GAP`으로 분류된 것만) |
| **대상이 아닌 것** | `verificationGateResult`, `observedCheck`, 계약의 `verification.commands` |

### 1-2. review.ts의 ACCEPTED 거부 로직과의 관계

거부 로직은 `evaluateAcceptance`(`src/review.ts:545-588`) 하나이고, 그 안에 **성격이 다른 검사 4개**가 들어 있다. waiver가 닿는 것은 그중 하나뿐이다.

```ts
// src/review.ts:552-564 — (A) 갭 루프. waiver가 작동하는 유일한 구간
for (const reason of bundle.unavailableReasons) {
  if (classifyGap(reason) === "EVIDENCE_DEFECT") {
    blockedReasons.push(`evidence defect cannot be waived: ${reason}`);   // waiver 무효
    continue;
  }
  if (waivedGaps.includes(reason)) { waived.push(reason); continue; }     // ← 여기만 waiver 경로
  blockedReasons.push(`capability gap not waived: ${reason}`);
}
```

```ts
// src/review.ts:569-585 — (B)(C)(D) 세 검사. waivedGaps를 읽지 않는다
if (bundle.observedResultSnapshot !== "DONE") {                                    // (B)
  blockedReasons.push(`normalized result is ${bundle.observedResultSnapshot}, not DONE`);
}
if (bundle.verificationGateResult !== "SATISFIED" &&
    bundle.verificationGateResult !== "WAIVED_ALLOWED") {                          // (C) ← 검증 게이트
  blockedReasons.push(`verification gate is ${bundle.verificationGateResult} (...)`);
}
if (bundle.pathViolationSummary.evaluated && bundle.pathViolationSummary.hasViolation) {  // (D)
  blockedReasons.push("unresolved path violation is present");
}
```

**핵심**: 검증 게이트 검사 (C)는 `waivedGaps`를 인자로도 받지 않는다. `--waive-gap`에 무엇을 넣어도 (C)를 통과시킬 수 없다. (C)를 통과하는 길은 `SATISFIED`(실제 실행 통과)이거나 `WAIVED_ALLOWED`뿐이고, 후자는 **아래 1-4에서 보듯 이 빌드가 생산하지 않는 값**이다.

이번 실행에서 (A)는 갭 1건에서 걸렸고 waiver로 풀렸다. (B)(C)(D)는 애초에 걸리지 않았다 — `DONE` / `SATISFIED` / 위반 0건.

### 1-3. 2026-08-11 판정과 모순되는가 — **아니다. 서로 다른 두 메커니즘이다**

셋 중 어느 것인지 물었으므로 답한다: **판정이 틀린 것도 아니고, 코드가 바뀐 것도 아니다. 서로 다른 두 메커니즘이다.**

근거 1 — 2026-08-11 판정문의 실제 문장:

```
docs/audits/2026-08-11/SUMMARY.md:98
| 리뷰 게이트의 waiver 불가 차단 | 유지 | src/review.ts:546-550이 EVIDENCE_DEFECT를
  waiver 대상에서 제외하고 review.ts:214-218이 ACCEPTED를 거부 ... |
```

이 항목은 **`EVIDENCE_DEFECT`가 waive되지 않는다**는 주장이다. 같은 감사의 상세 문서는 `CAPABILITY_GAP`이 waive **가능**하다는 것을 명시적으로 통과 항목으로 기록하고 있다:

```
docs/audits/2026-08-11/fixes/stage2-precheck.md:217
| 3 | NEW_FILE_CONTENT_NOT_CAPTURED가 CAPABILITY_GAP으로 번들까지 도달,
      waiver 시 ACCEPTED 가능 | 통과 (설계대로) |

docs/audits/2026-08-11/fixes/stage1b-evidence-completeness.md:170
분류는 CAPABILITY_GAP이다 ... 즉 waiver 없이는 ACCEPTED가 불가능하고,
사람이 사유를 적으면 통과시킬 수 있다.
```

근거 2 — 이번에 waive한 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`은 `EVIDENCE_DEFECT_PREFIXES`(`src/review.ts:48-55`)에 없다. 따라서 `classifyGap`(`src/review.ts:57-60`)이 `CAPABILITY_GAP`으로 분류한다. 2026-08-11이 "waive 가능"으로 통과시킨 바로 그 부류다.

근거 3 — 코드 변경 여부. `git log --follow -- src/review.ts`의 마지막 커밋은 `6a458eb`이고, 2026-08-11 감사가 인용한 `review.ts:546-550`의 로직(EVIDENCE_DEFECT 제외)은 현재 `src/review.ts:552-557`에 문자 그대로 남아 있다. 행 번호만 6줄 밀렸다.

**결론: 모순 없음.** 2026-08-11이 "불가"라고 한 것은 EVIDENCE_DEFECT waiver이고, 이번에 사용한 것은 CAPABILITY_GAP waiver다.

### 1-4. 부수 발견 — 검증 waiver는 소비만 되고 생산되지 않는다

`requiredGates.verification.waiver`는 스키마·병합·검증이 전부 구현돼 있다(`src/required-gates.ts:36-43`, `:63`, `:193-194`). 그런데 그것이 켜졌을 때 나와야 할 값 `WAIVED_ALLOWED`를 **생산하는 코드가 없다.**

```
$ grep -rn "WAIVED_ALLOWED" src/
src/auto-review.ts:65   ... === "SATISFIED" || ... === "WAIVED_ALLOWED"     ← 소비
src/ledger.ts:465       ... === "SATISFIED" || ... === "WAIVED_ALLOWED"     ← 소비
src/review.ts:574       ... !== "WAIVED_ALLOWED"                            ← 소비
src/run.ts:57           type VerificationGateResult = ... | "WAIVED_ALLOWED" ← 타입 선언
```

`deriveVerificationOutcome`(`src/run.ts:1704-1742`)의 반환 경로 어디에서도 `WAIVED_ALLOWED`를 만들지 않는다. `verify-001.json`의 `waiverRef`도 상수처럼 항상 `VERIFICATION_WAIVER_NOT_PRESENT`를 적는다(`src/run.ts:1822-1824`).

→ **P1-52로 등재.** 이번 실행의 결론(검증은 waive되지 않았다)은 이 사실로 더 강해진다. 이 빌드에서 검증 waiver는 **사용할 수 있는 기능이 아니다.**

---

## 작업 2 — waiver가 계약을 완화하는가

### 판정: **계약과 무관한 별개 축이다. 계약의 검증 조건을 면제하지 않는다.**

근거 1 — 계약의 검증 조건은 실제로 집행됐다. 계약(`task.yaml`)이 요구한 것:

```yaml
verification:
  commands:
    - commandId: fixture-check
      command: ["node", "test/check.js"]
```

집행 결과(`verify-001.json`): `authority: HARNESS_EXECUTED`, `exitCode: 0`, `result: PASS`. **면제된 조건이 0건이다.**

근거 2 — waive된 대상은 계약이 규정하지 않는 것이다. `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`은 "에이전트가 자기 세션에서 무슨 커맨드를 돌렸는지 Harness가 볼 수 없다"는 **Harness의 관측 한계**이고, 계약 본문 어디에도 대응 항목이 없다. 이 갭은 계약과 무관하게 `mode: execute`인 모든 Run에 붙는다.

근거 3 — waiver는 계약을 입력으로 읽지 않는다. `evaluateAcceptance`의 인자는 `(bundle, waivedGaps)`뿐이고(`src/review.ts:545-548`), `bundle`은 Run Summary와 Run Plan에서 파생된다. Task 파일도 승인 해시도 이 함수에 들어가지 않는다.

### I-2 우회 여부: **우회하지 않는다**

I-2(승인 후 계약 변경 시 실행 거부)는 **실행 전** 게이트다. 판정 대상은 `approvalTargetHash = sha256(revisionHash, guardrailHash)`이고, `replayApproval`이 Run 시작 시 그것을 재계산해 비교한다(`src/run.ts:529-532`).

waiver는 **실행 후** 산출물에 대한 리뷰 시점 행위다. 다음이 성립하므로 I-2를 사후에 무력화하지 않는다:

- waiver는 `task.yaml`을 바꾸지 않는다 — waiver 전후 `revisionHash`는 `fbfcb67f...e134d7`로 동일
- waiver는 승인 원장에 이벤트를 쓰지 않는다 — Task 원장은 `TASK_REVISION_CREATED` / 승인 이벤트만 갖고, waiver는 Objective 원장의 `RUN_REVIEW_DECIDED`에 들어간다
- 다음 Run은 waiver를 읽지 않는다 — `executeRun`의 승인 검사는 파일 해시와 승인 원장만 본다. **waive한 갭은 다음 Run에서 그대로 다시 발생하고, 다시 waive해야 한다**

즉 waiver는 **1회 Run에 대한 1회 서명**이지, 계약이나 프로파일에 남는 완화가 아니다.

### 계약 해시·승인과의 결속: **revision 번호에는 묶이고, revision 해시에는 묶이지 않는다**

| 결속 | 상태 | 근거 |
| --- | --- | --- |
| runId | O | `localReview.runId`, 원장 payload `runId` |
| taskId | O | `localReview.taskId` |
| **taskRevision (번호)** | **O** | `bundle.taskRevision`은 Run Plan의 `approval.taskRevision`에서만 읽는다 (`src/review.ts:441-469`). 없으면 기본값이 아니라 `MISSING_INPUT_REF:runPlanRef#/approval/taskRevision`으로 **EVIDENCE_DEFECT** 처리 |
| **revisionHash / approvalTargetHash** | **X** | `ReviewEvidenceBundle`에도 `LocalReviewDecision`에도 필드가 없다. 원장 payload에도 없다 |
| 증거 번들 해시 | O | `reviewEvidenceBundleRef.hash` |
| 판정 근거 아티팩트 해시 | O | `bundle.hashChecks[]`가 runPlan/adapterRequest/harnessObservation/adapterResult/verificationEvidence를 전부 재계산·대조 |

**간접 결속은 성립한다.** waiver는 번들에 묶이고, 번들은 `runPlanRef`를 해시 검증하며, Run Plan 안에 `approval.revisionHash`와 `approvalTargetHash`가 들어 있다. 따라서 "이 waiver가 어느 계약 해시에 대한 것이었나"는 **한 단계 건너 추적 가능**하다. 다만 결정 문서 자체가 계약 해시를 들고 있지는 않다.

이번 실행에서는 그 간접 경로가 실제로 성립함을 확인했다 — Run Plan `approval.revisionHash = fbfcb67f...e134d7` = 원장 `TASK_ATTACHED.taskRevisionHash`.

**위반으로 등재하지 않는다.** 해시 검증된 참조 사슬이 존재하고 끊긴 곳이 없다.

---

## 작업 3 — 산출물에서 구분 가능한가 (가장 중요)

판정 기준은 "필드가 존재하는가"가 아니라 **"3개월 뒤 읽는 사람이 알아차리는가"**다. 그 기준으로 본다.

### 3-1. waiver 사용 사실은 남는가 — **남는다. 3개 계층 전부에**

| 계층 | 파일 | 필드 |
| --- | --- | --- |
| 결정 문서 | `runs/<id>/review-decision.local.json` | `evidenceCompleteness: WAIVED_INCOMPLETE`, `localReviewStatus: MIGRATION_READY_WAIVED`, `waivedCapabilityGaps[]`(reason·acknowledgedBy·justification), `localReviewStatusReasons[]` |
| 증거 번들 | `reviews/<id>/evidence-bundle.json` | `bundleStatus: DEGRADED`, `unavailableReasons[]`, `scanScope.capabilityGaps: 1` |
| **원장(영구)** | `objectives/obj-001/ledger.jsonl` seq 3 | `evidenceCompleteness`, **`waivedCapabilityGaps[]` 전문(사유 포함)** |

원장 이관 코드에 의도가 주석으로 박혀 있다:

```ts
// src/ledger.ts:1124-1128
// A waived acceptance carries its waived gaps into the ledger. Without them
// a later reader sees ACCEPTED and cannot tell what a person stood in for.
waivedCapabilityGaps: Array.isArray(localReview.waivedCapabilityGaps) ? ... : [],
```

원장 payload에 `verificationGateResult: "SATISFIED"`, `verificationGateReason: "PASS"`도 함께 들어간다. **따라서 원장만 읽어도 "검증은 실제로 통과했고, 별개로 관측 갭 1건을 사람이 인수했다"가 구분된다.**

### 3-2. waiver Run과 정상 Run이 구분되는가 — **구분된다**

| 값 | 정상 통과 | waiver 통과 |
| --- | --- | --- |
| `evidenceCompleteness` | `COMPLETE` | `WAIVED_INCOMPLETE` |
| `localReviewStatus` | `MIGRATION_READY` | `MIGRATION_READY_WAIVED` |
| `bundleStatus` | `COMPLETE` | `DEGRADED` |
| `waivedCapabilityGaps` | `[]` | 1건 이상 |

게다가 이 넷은 서로 교차 검증된다. `assertLocalReview`(`src/review.ts:693-733`)가 `MIGRATION_READY`인데 `COMPLETE`가 아니면, `WAIVED_INCOMPLETE`인데 waive 목록이 비었으면, `COMPLETE`인데 번들이 `DEGRADED`면 각각 예외를 던진다. **네 값이 서로 어긋난 상태를 만들 수 없다.**

### 3-3. run-record.md에서 눈에 띄는가 — **waiver는 띈다. 그런데 검증 쪽이 무너져 있다**

waiver 자체는 잘 보인다. 현재 파일 그대로:

```
## Review

decision            : ACCEPTED
actor               : sol
evidenceCompleteness: WAIVED_INCOMPLETE
localReviewStatus   : MIGRATION_READY_WAIVED

Reason: diff is a 5-line addition of subtract(a,b) inside scope; harness-executed fixture-check passed

Waived capability gaps:

- COMMAND_CHANNEL_NOT_HARNESS_VISIBLE — Agent-side commands are unobserved, but the only claim
  relied on is the harness-executed verification (node test/check.js, exit 0) and the
  harness-observed diff, both of which I read.
```

**그런데 같은 파일의 검증 절이 리뷰 이후 거짓 문장으로 바뀌어 있다.**

리뷰 **전** `run-record.md`(이번 세션에서 직접 출력해 확인):

```
## What was verified
...
attempts               : 1 executed of 1 recorded, 0 blocked

What the gate result above actually rests on:

fixture-check  PASS (exit 0)
  node test/check.js
```

리뷰 **후** 같은 파일, 같은 절 (현재 상태):

```
65: verificationGateResult : SATISFIED
70: attempts               : 1 executed of 1 recorded, 0 blocked
73: No verification evidence was produced, so nothing here says what was checked.
...
107: verificationEvidenceRef: .codefleet/runs/2026-08-13_001/verification/verify-001.json
```

**한 파일 안에서 세 문장이 서로 모순된다.** 70행은 "1건 실행됨"이라 하고, 73행은 "증거가 생산되지 않았다"고 하고, 107행은 그 증거 파일을 링크한다. 73행은 **사실이 아니다** — `verify-001.json`은 존재하고 `HARNESS_EXECUTED / PASS`를 담고 있다.

원인은 리뷰가 문서를 다시 렌더링할 때 검증 증거를 **넘기지 않는 것**이다.

```ts
// src/review.ts:365-377 — refreshRunRecord
renderRunRecord({
  runId, taskId: ..., createdAt: ..., task,
  runSummary,
  harnessObservation: observation,
  localReview
  // ← verificationEvidence 없음
})
```

```ts
// src/run.ts:1311-1321 — Run 자신이 쓸 때는 넘긴다
renderRunRecord({
  runId, taskId: task.id, createdAt: ..., task,
  runSummary: ..., harnessObservation,
  verificationEvidence: verificationEvidence as ...,   // ← 여기엔 있다
  localReview: null
})
```

`RunRecordInput.verificationEvidence`는 옵셔널(`src/run-record.ts:19`)이므로 타입 검사가 잡지 못하고, 렌더러는 `undefined`를 "증거 없음"으로 읽는다:

```ts
// src/run-record.ts:275-280
if (attempts.length === 0) {
  lines.push(
    input.verificationEvidence === undefined || input.verificationEvidence === null
      ? "No verification evidence was produced, so nothing here says what was checked."   // ← 여기
      : "This Run planned no verification commands. ..."
  );
}
```

**도입 시점**: `refreshRunRecord`는 `489e764`에서 생겼고, 그때 `run-record.ts`에는 검증 커맨드 절이 없었으므로 무해했다. 검증 커맨드 절은 P1-35를 닫으려고 `3873d94`(S6)에서 추가됐고, **그 커밋이 `review.ts`의 호출부를 갱신하지 않았다.**

**테스트가 놓친 이유**: `test/review.test.ts:434-441`이 리뷰 후 `run-record.md`를 다시 읽지만, 단언하는 것은 `decision` / `Reason` / `not final decision truth` 세 가지뿐이다. 검증 커맨드 절이 살아남는지는 확인하지 않는다.

### 3-4. P1-35와 같은 형태인가 — **같은 형태이고, 한 단계 더 나쁘다**

P1-35: 사람이 읽는 문서가 `SATISFIED`만 보여주고 무엇을 검증했는지 말하지 않아, `gradle --version`이 테스트 통과로 읽혔다. **침묵.**

이번 것: 같은 문서가 `SATISFIED`를 보여주면서 **"증거가 생산되지 않았다"고 적극적으로 말한다.** 침묵이 아니라 **거짓 진술**이다. 그리고 그 거짓은 리뷰를 마친 뒤에만 나타나므로, **완주한 Run일수록 문서가 더 나빠진다.**

→ **P1-50으로 등재.**

### 3-5. waiver 사유 입력이 강제되는가 — **강제되지 않는다 (실측)**

격리 복사본(`C:\cf-probe`, 감사 후 삭제)에서 `--waive-reason` 없이 실행:

```
$ codefleet review 2026-08-13_001 --decision ACCEPTED --actor sol \
    --reason "ok" --waive-gap COMMAND_CHANNEL_NOT_HARNESS_VISIBLE
CodeFleet local review recorded.
evidenceCompleteness: WAIVED_INCOMPLETE
localReviewStatus: MIGRATION_READY_WAIVED
exit=0
```

기록된 값:

```json
"waivedCapabilityGaps": [
  { "reason": "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE", "acknowledgedBy": "sol", "justification": "ok" }
]
```

**일반 리뷰 사유가 조용히 waiver 정당화로 승격된다.**

```ts
// src/review.ts:316-320
waivedCapabilityGaps: acceptance.waived.map((reason) => ({
  reason,
  acknowledgedBy: options.actorId ?? "local-user",
  justification: options.waiveJustification ?? options.reason   // ← fallback
})),
```

그 결과 이것을 막으려고 둔 가드가 **CLI 경로에서 절대 발동하지 않는다**:

```ts
// src/review.ts:723-726
if (gap.justification.trim().length === 0) {
  errors.push(`${gap.reason} was waived without a justification`);
}
```

`--reason`은 이미 필수이고 공백만으로는 통과하지 못하므로(`src/review.ts:191-193`), `justification`이 빈 문자열이 되는 경로가 없다. CLAUDE.md의 "Verify the verifier — 항상 null을 반환하는 가드는 작동하는 가드와 똑같이 보인다"에 정확히 걸린다.

**중요한 구분**: 이번 실행에서는 `--waive-reason`을 실제로 명시했고, 그 문장은 내가 확인한 내용(harness-executed 검증 exit 0, diff 직접 읽음)을 담고 있다. **이 Run의 waiver는 내용상 유효하다.** 결함은 "다음 사람이 사유 없이도 통과시킬 수 있다"는 구조 쪽이다.

→ **P1-51로 등재.**

---

## 작업 4 — 성공 기준 4 재판정

### 판정: **충족 (유지)**

근거:

1. **검증 게이트는 우회되지 않았다.** 계약이 요구한 `node test/check.js`가 `HARNESS_EXECUTED` 권한으로 실행돼 exit 0을 냈다. 검증 waiver는 사용되지 않았고(`VERIFICATION_WAIVER_NOT_PRESENT`), 허용되지도 않았으며(`waiver.allowed: false`), 이 빌드는 그 상태를 생산할 수단조차 없다(P1-52).
2. **사용한 waiver는 게이트를 끄는 행위가 아니다.** `--waive-gap`이 닿는 것은 `evaluateAcceptance`의 네 검사 중 갭 루프 하나뿐이고, 검증 게이트 검사는 `waivedGaps`를 인자로 받지도 않는다(`src/review.ts:572-579`).
3. **게이트는 실제로 저항했다.** 무면제 ACCEPTED가 `exit=1`로 거부됐다. 통과 조건은 갭을 이름으로 지목하고 책임자를 남기는 것이었고, 그 결과가 `DEGRADED` / `WAIVED_INCOMPLETE` / `MIGRATION_READY_WAIVED`로 세 계층에 기록됐다.
4. **면제 불가 경계는 그대로다.** 이 Run에 `EVIDENCE_DEFECT`가 있었다면 `--waive-gap`으로 통과하지 못했다(`src/review.ts:553-557`). 2026-08-11이 "유지"로 판정한 경계는 이번에도 유지된다.
5. **계약은 완화되지 않았다.** revision 해시 불변, Task 원장 무변경, 다음 Run에 이월되지 않음.

### 부수 정정 — 성공 기준 3은 **조건부 충족**으로 내려야 한다

작업 4의 대상은 아니지만, 이번 조사에서 원 보고서의 사실 하나가 **현재 상태와 어긋남**을 확인했으므로 기록한다.

- 원 보고서는 성공 기준 3을 **충족**으로 판정하며 `run-record.md`의 다음 블록을 근거로 인용했다:
  `fixture-check  PASS (exit 0)` / `  node test/check.js`
- **그 블록은 현재 파일에 없다.** 인용 시점이 리뷰 **전**이었고, 리뷰가 문서를 덮어쓰면서 사라졌다(P1-50).
- 기준 3의 문언은 "Run Trace에 ... 적혀 있다"이고, `verify-001.json`은 지금도 커맨드 이름을 담고 있다. **Run Trace 전체로 보면 여전히 충족이다.**
- 그러나 **사람이 읽는 유일한 문서 기준으로는 미충족**이며, 완주(리뷰 포함)를 마친 시점에는 오히려 거짓 문장이 들어간다.

→ **성공 기준 3: 조건부 충족.** 기계가 읽는 산출물 기준 충족, 사람이 읽는 문서 기준 미충족. **원 보고서는 지시대로 수정하지 않았고, 정정 사실은 이 문서가 보유한다.**

---

## 신규 등재

> **번호 주의**: 지시문은 `P0-14 / P1-39`부터 이어 붙이라고 했으나, 두 번호 모두 이미 사용 중이다. 실측한 기존 최대값은 **P0-16**, **P1-49**다(`grep -rhoE "P[01]-[0-9]+" docs/ src/ test/`). 충돌을 피해 **P1-50부터** 부여한다. P0는 이번에 없다.

| ID | 위반 | 근거 | 관련 |
| --- | --- | --- | --- |
| **P1-50** | 리뷰가 `run-record.md`를 다시 쓰면서 검증 증거를 넘기지 않아, 완주한 Run의 문서가 "No verification evidence was produced"라는 **거짓 문장**을 갖게 된다. 같은 파일이 `attempts: 1 executed`와 `verificationEvidenceRef`를 동시에 적고 있어 자기모순이다 | `src/review.ts:365-377`이 `verificationEvidence`를 누락. `src/run.ts:1311-1321`은 넘긴다. `src/run-record.ts:19` 옵셔널이라 타입이 못 잡음. `src/run-record.ts:275-280`이 `undefined`를 "증거 없음"으로 렌더. 실측: 리뷰 전후 파일 비교 | **P1-35 회귀**. `3873d94`가 호출부 미갱신. `test/review.test.ts:434-441`이 이 절을 단언하지 않아 미검출 |
| **P1-51** | waiver 정당화가 강제되지 않는다. `--waive-reason` 생략 시 일반 `--reason`이 조용히 waiver 사유로 승격되고, 이를 막는 가드는 CLI 경로에서 발동 불가능하다 | `src/review.ts:319` `options.waiveJustification ?? options.reason`. `src/review.ts:723-726`의 빈 문자열 검사는 `--reason` 필수(`:191-193`) 때문에 도달 불가. 실측: 격리 복사본에서 `--reason "ok"`만으로 `justification: "ok"` 기록, exit=0 | CLAUDE.md "Verify the verifier" 위반 |
| **P1-52** | 검증 waiver 메커니즘이 소비만 되고 생산되지 않는다. `requiredGates.verification.waiver`는 스키마·병합·검증이 모두 있으나 `WAIVED_ALLOWED`를 만드는 코드가 없어, `waiver.allowed: true`로 두어도 효과가 없다 | `grep -rn "WAIVED_ALLOWED" src/` → 소비 3곳(`auto-review.ts:65`, `ledger.ts:465`, `review.ts:574`) + 타입 선언 1곳(`run.ts:57`), 생산 0곳. `deriveVerificationOutcome`(`run.ts:1704-1742`) 반환 경로에 없음. `run.ts:1822-1824`가 `waiverRef`를 항상 `VERIFICATION_WAIVER_NOT_PRESENT`로 고정 | 이번 판정을 **강화**하는 방향의 결함 |

### 등재하지 않기로 한 것

- **waiver가 계약 해시에 직접 묶이지 않음** — 번들이 `runPlanRef`를 해시 검증하고 Run Plan이 `approval.revisionHash`를 담으므로 간접 추적이 성립하며, 이번 실행에서 그 사슬이 끊기지 않음을 실측했다. 직접 필드가 없다는 것만으로 위반으로 보지 않는다.
- **`--waive-gap`에 존재하지 않는 갭 이름을 넣어도 오류가 아님** — `waivedGaps.includes(reason)` 방향이므로 잘못된 이름은 **면제에 실패**할 뿐이다. 안전한 방향의 실패이고, 이번 범위에서 실측하지 않았다(미측정).

---

## 요약

| 작업 | 판정 |
| --- | --- |
| 1 | 사용한 것은 `--waive-gap`(CAPABILITY_GAP waiver). 검증 waiver 아님. 2026-08-11 판정과 **모순 없음 — 서로 다른 두 메커니즘** |
| 2 | **별개 축.** 계약의 검증 조건은 실제 실행으로 통과. I-2 우회 아님. revision 번호에 직접, 계약 해시에 간접 결속 |
| 3 | waiver 사용은 **3계층 전부에 남고 정상 Run과 구분된다.** 단 사람이 읽는 문서의 **검증 절이 리뷰 후 거짓 문장으로 바뀐다(P1-50)**. 사유 입력은 **강제되지 않는다(P1-51)** |
| 4 | **성공 기준 4: 충족 (유지).** 부수적으로 **성공 기준 3을 조건부 충족으로 정정** |
