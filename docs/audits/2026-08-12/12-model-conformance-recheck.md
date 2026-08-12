# 확정 모델 대비 코드 재검수

```text
점검 일시   : 2026-08-12
점검 대상   : 5d989f1 (main, 작업 트리 = HEAD)
선행 감사   : 11-model-conformance.md (b750e9e 기준). 그 문서의 판정을 인용하지 않고
             HEAD 코드로 전부 다시 대조했다. 일치 항목은 아래에 "재확인"으로 표기한다.
점검 방법   : 확정 모델을 13개 불변식으로 번역 → 불변식마다 (A) 강제 코드 (B) 반증 실행.
             반증은 전부 임시 워크스페이스(mkdtemp)에서 실제로 실행했고, 저장소는
             읽기 전용으로 두었다. 출력은 §반증 로그에 그대로 붙였다.
기준선      : npm test — 216 tests pass, 0 fail
             posttest  — FINAL RULE 83개 / condition line 545 / claim 352 /
                          covered 345 (63.3%) / claim 없는 rule 8
범위        : 읽기 전용. 코드 수정 없음. 등재까지만 한다.
결과        : 불변식 13개 중 준수 5 / 부분 2 / **위반 6**
             그중 **신규 위반 2건**(M-9, M-10)은 선행 감사에 없던 것이다.
```

## 확정 모델 (기준)

사용자가 확정한 문장 그대로를 기준으로 삼는다.

```text
Objective / Task Queue / Task Draft / Task Revision
Task          = 논리적 작업 단위
Task Draft    = 승인 전 수정 가능한 계약 후보
Task Revision = 승인 가능한 / 승인된 불변 실행 계약 (역할·범위·가드레일·검증 조건)
Run Trace     = 특정 Revision의 실행 증거
approval은 Task Revision에만 묶인다
accepted/approved Objective relation + approved revision 없이는 run 불가
Run은 taskId + taskRevision에 묶인다
```

---

## 판정표

| ID | 불변식 | 판정 | 근거 |
|---|---|---|---|
| M-1 | Objective가 실체로 존재한다 | 준수 | `ledger.ts:520` `createObjective`, 스냅샷 + replay |
| M-2 | Task Queue가 실체로 존재한다 | 준수 | `ledger.ts:31-62` 상태·전이표, `transitionQueueItem`, `reorderQueue` |
| M-3 | Task Draft가 상태로 존재한다 | **위반** | Draft 산출물·상태 없음. `task.yaml` 하나가 draft이자 계약 |
| M-4 | Task Revision이 불변 계약으로 존재한다 | 부분 | 승인 내용의 불변성은 강제됨. 계약 **본문**은 어디에도 고정되지 않음 |
| M-5 | approval은 Task Revision에만 묶인다 | 준수 | `task-ledger.ts:202-208`, 승인 상태는 replay로만 계산 |
| M-6 | Draft → Revision 승격이 승인과 구분된다 | **위반** | `task-ledger.ts:192-209` 두 이벤트가 같은 뮤테이션 |
| M-7 | approved revision 없이는 run 불가 | 준수 | `run.ts:401-408`. 반증 실패 |
| M-8 | accepted/approved relation 없이는 run 불가 | **위반** | `run.ts:224-235`. Objective 0개에서 RAN |
| M-9 | relation이 실행되는 revision을 가리킨다 | **위반**(신규) | relation rev=1 / 실행 rev=2로 RAN. rev2는 attach 자체가 불가 |
| M-10 | relation의 revision·hash가 Task 원장과 대조된다 | **위반**(신규) | 존재하지 않는 rev 7 + 0으로 채운 hash가 수락됨 |
| M-11 | 계약이 역할·범위·가드레일·검증을 모두 덮는다 | 부분 | Task 파일 안의 것만 해시. 프로파일 가드레일은 밖 |
| M-12 | Run Trace가 실행 결과의 진실이다 | 준수 | 미관측을 전부 `unavailableReasons`로 등재, authority NONE |
| M-13 | Run 산출물이 taskId + taskRevision을 지목한다 | **위반** | JSON 9개 중 taskRevision 보유 1개, taskId 보유 3개 |

---

## 위반 상세

### M-8. Objective relation 없이 Run이 실행된다 — 재확인

**(A)** `run.ts:224-235`가 부정 결정만 막는다.

```ts
const items = snapshot.queue.filter((item) => item.taskId === taskId);
if (items.length === 0) {
  continue;                      // ← relation 부재는 통과
}
for (const item of items) {
  if (item.storedState === "BLOCKED" || item.storedState === "CANCELED" || item.storedState === "SKIPPED") {
```

함수 주석(`run.ts:176-179`)이 그 결정을 명시한다 — "A Task attached to no Objective is not blocked".
`test/isolation.test.ts:878`이 "an unattached Task is not blocked"를 회귀로 고정한다.

**(B)** 재현됨 — Objective 디렉터리 자체가 없는 상태에서 실행됨.

```
[R1] no Objective exists at all
  run outcome            RAN -> 2026-08-12_001 status=DRY_RUN
  objectives dir exists  false
```

### M-9. relation이 실행 중인 revision을 가리키지 않는다 — **신규**

설계는 relation의 참조 대상을 명시한다(`concept-foundation.md:12948`):

> Objective ledger의 relation / queue decision이 `taskId + taskRevision + revisionHash`를 참조하고

**(A)** 참조는 저장되지만(`ledger.ts:37-38` `taskRevision`, `taskRevisionHash`) 소비되지 않는다.
`blockedQueueReason`은 `taskId`로만 필터하고 revision을 보지 않는다. 그리고
`attachTask`의 precheck(`ledger.ts:697-709`)이 같은 Task의 다른 revision 부착을 거부하므로,
**relation을 새 revision으로 따라오게 만들 방법이 없다.**

**(B)** 재현됨. rev1 승인 → attach → 편집 → invalidate → rev2 승인:

```
[R2b] revision 2 approved, relation still names revision 1
  approve rev1                       APPLIED
  attach rev1                        APPLIED
  approve rev2 without invalidating  FAILED@M2_PRECHECK: revision 1 is approved for different content; invalidate it first
  invalidate rev1                    APPLIED
  approve rev2 after invalidate      APPLIED
  approvedRevision                   2
  queue item                         obj1:sample:1 rev=1 WAITING
  relation hash == approved hash     false
  attach rev2                        FAILED@M2_PRECHECK: sample is already attached at revision 1
  run outcome                        RAN -> 2026-08-12_001
  run-plan approval.taskRevision     2
  queue relation revision            1
```

즉 큐는 revision 1을 수용했고, 실행된 것은 revision 2이며, 그 상태가 **정상 경로**다.
relation을 revision 2로 옮기려면 큐 항목을 CANCELED로 만드는 수밖에 없고, 그러면
`blockedQueueReason`이 Task 전체를 막는다.

**빠진 조각이 코드 안에 이미 이름으로 있다.** `TASK_REVISION_SUPERSEDED`는
`task-ledger.ts:20`에 선언되고 `:94`에서 replay가 처리하지만, **이 이벤트를 append하는
코드 경로가 저장소 전체에 0곳이다.** revision 승계를 표현할 이벤트가 정의만 되고
생산자가 없다.

### M-10. relation의 revision·hash가 Task 원장과 대조되지 않는다 — **신규**

**(A)** `attachTask`(`ledger.ts:666-727`)는 `taskRevision`과 `taskRevisionHash`를 **입력으로 받고**
Task 원장을 읽지 않는다. CLI(`cli.ts:271-278`)는 `--revision` 미지정 시 `1`을 넣고,
hash는 **현재 파일 내용**에서 계산한다 — 승인된 내용이 아니라.

```ts
taskRevision: Number(flags.revision ?? "1"),
taskRevisionHash: hash,          // 현재 파일의 해시. 원장과 대조 없음
```

**(B)** 재현됨.

```
[R3] relation attached at a revision that does not exist
  attach outcome            ACCEPTED
  queue item                obj1:sample:7 rev=7 hash=00000000
  task ledger max revision  1
  run outcome               RAN -> 2026-08-12_001
```

존재하지 않는 revision 7과 0으로 채운 해시가 원장에 append-only로 기록됐고, 실행도 됐다.
큐 항목의 revision은 검증되지 않은 사용자 입력이다.

### M-11. 프로파일 가드레일이 승인 해시 밖에 있다 — 재확인

**(A)** 승인 해시는 `contentHashOf(taskPath)` 하나(`task-ledger.ts:164`). 프로파일은 포함되지 않는다.

**(B)** 재현 2건.

```
[R4b] profile widened to WORKSPACE_EDIT after approval, no re-approval
  before effectiveMode / fileEdit         DRY_RUN / false
  before policyHash                       cdc219b247290d36
  task file unchanged                     true
  approval still valid                    true
  after effectiveMode / fileEdit          WORKSPACE_EDIT / true
  after policyHash                        aba805f949d9d8a9
  approval.taskRevision on both runs      1 -> 1
  resume.sourceHashPolicy                 TASK_AND_PROFILE_MUST_MATCH
  projectProfileRef.contentHash changed   true

[R4c] requireIsolationForMutation flipped true -> false after approval
  before run outcome                REFUSED -> isolation GIT_WORKTREE ... unavailable, and requireIsolationForMutation is true
  approval still valid after flip   true
  after isolation.mode              NONE
  after fileEdit capability         true
  after run outcome                 RAN -> 2026-08-12_002
```

같은 revision 1이 파일 편집 권한 없이도, 있어도 실행된다. `effectivePolicy.policyHash`는
바뀌고 `projectProfileRef.contentHash`도 바뀌므로 **증거는 무엇이 달라졌는지 알고 있다.**
승인만 그것을 모른다.

`run.ts:703`이 매 Run Plan에 `sourceHashPolicy: "TASK_AND_PROFILE_MUST_MATCH"`를 적는다.
저장소 전체에서 이 값을 **읽는 코드도, 테스트도 0곳이다.**

### M-13. Run 산출물이 계약을 지목하지 않는다 — 재확인 (수치 갱신)

Run Trace의 JSON 전수(9개). `top` = 최상위 키, `any` = 문서 어디든:

```
[R5] taskId / taskRevision across Run Trace artifacts
  adapter-request.json          taskId top=false any=false | taskRevision top=false any=false
  adapter-result.json           taskId top=false any=false | taskRevision top=false any=false
  harness-observation.json      taskId top=false any=false | taskRevision top=false any=false
  result.json                   taskId top=true  any=true  | taskRevision top=false any=false
  run-plan.json                 taskId top=true  any=true  | taskRevision top=false any=true
  run-summary.json              taskId top=true  any=true  | taskRevision top=false any=false
  verification/verify-001.json  taskId top=false any=false | taskRevision top=false any=false
  workspace-post-run.json       taskId top=false any=false | taskRevision top=false any=false
  workspace-pre-run.json        taskId top=false any=false | taskRevision top=false any=false
```

taskRevision을 담은 문서 **1개**(`run-plan.json`의 `/approval/taskRevision`),
taskId를 담은 문서 3개, 아무것도 없는 문서 5개.
선행 감사는 7개를 셌다 — workspace 스냅샷 2개를 빼서다. 여기서는 Run 디렉터리의
JSON 전부를 센다.

### M-3 / M-6 / M-4. Draft가 없고, 승격과 승인이 한 뮤테이션이며, 본문이 남지 않는다 — 재확인

**(A)** `approveTask`의 append 단계가 두 이벤트를 연달아 쓴다(`task-ledger.ts:192-209`):
`TASK_REVISION_CREATED` → `TASK_APPROVED`. 그 사이에 `READY_FOR_APPROVAL`이 존재할 시점이 없다.
`src/`와 `test/` 전체에서 `READY_FOR_APPROVAL`과 `EDITING`은 0곳이다.
`REJECTED`는 있으나 Draft 상태가 아니라 Run review decision이다(`review.ts:14`).
설계 `concept-foundation.md:1292-1347`에는 Draft/Revision 상태 기계가 명시돼 있다.

**(B)** 승인 후 원장 전수:

```
[R6] ledger contents for an approved revision
  event types                            TASK_REVISION_CREATED, TASK_APPROVED
  fields on TASK_APPROVED                mutationId,eventId,seq,type,taskId,taskRevision,
                                         revisionHash,approvalTargetHash,actorKind,actorId,reason,at
  any field holds the contract body      false
  files under .codefleet/tasks/sample    task-ledger.jsonl
```

12개 필드 전부 메타데이터이고 계약 본문이 없다. Revision 파일도 없다.
설계는 Revision이 `immutable Task contract`를 포함한다고 규정한다(`concept-foundation.md:1491`).
따라서 "그때 승인된 계약이 무엇이었나"에 답할 수 있는 자리는 **Run이 일어난 경우의
`runs/<id>/task.yaml` 사본뿐**이다.

---

## 준수 상세

### M-7. approved revision 없이는 실행되지 않는다

`run.ts:401`이 어떤 산출물보다 먼저 승인을 확인한다. 편집 후 재승인 시도도 막힌다:

```
approve rev2 without invalidating  FAILED@M2_PRECHECK: revision 1 is approved for different content; invalidate it first
```

승인된 내용의 불변성은 강제된다. 이것이 M-4를 "부분"으로 둔 이유다 —
불변성은 지켜지는데 불변인 대상의 본문이 저장되지 않는다.

### M-12. Run Trace가 실행 결과의 진실이다

역할 상한이 검증 커맨드를 금지하는 계약을 실행시킨 경우:

```
[R8] verification declared, capability withheld
  approve outcome                 APPLIED           ← 승인은 실행 가능성을 보지 않는다
  verify-001 unavailableReason    VERIFICATION_BLOCKED_BY_COMMAND_POLICY:1
  check.observedCheck             SKIP
  check.verificationGateResult    NOT_SATISFIED
  check.verificationGateReason    BLOCKED
  check.scanScope                 attemptsRecorded=1 attemptsExecuted=0 attemptsBlocked=1
  result.value                    UNKNOWN
  normalization.status            PARTIAL (unavailableReasons 12건)
  evidenceAuthority               commandEvidenceAuthority=NONE, changedFilesAuthority=NONE
```

승인 단계는 이 계약을 통과시켰지만(설계의 승인 조건 10개 중 정합성 검사가 코드에 없다),
**증거는 아무것도 통과시키지 않았다.** 미실행이 성공으로 뭉개지지 않고
`attemptsExecuted=0`으로 남는다. 방향은 fail-closed다.

---

## 등재

### P0

| ID | 위반 | 불변식 | 상태 |
|---|---|---|---|
| **P0-12** | 프로파일 가드레일이 승인 해시 밖에 있어, 승인자가 본 것과 다른 권한으로 실행된다 | M-11 | 재확인 (HEAD에서 R4b·R4c로 재현) |
| **P0-13** | Objective relation 없이 Run이 실행된다 | M-8 | 재확인 (HEAD에서 R1로 재현) |
| **P0-14** | Objective relation이 실행되는 revision을 가리키지 않고, 새 revision으로 옮길 방법이 없다 | M-9 | **신규** |
| **P0-15** | relation의 revision·hash가 Task 원장과 대조되지 않아, 존재하지 않는 revision에 대한 관계가 원장에 기록된다 | M-10 | **신규** |

P0-14와 P0-15를 P0에 두는 이유: 확정 모델이 실행 허가의 두 축을 approved revision과
accepted relation으로 규정하는데, 두 축이 **서로 다른 revision을 가리켜도 실행된다.**
그러면 "이 실행은 어떤 계약 아래 있었는가"에 두 개의 답이 생긴다. P0-13을 고쳐
relation을 필수로 만들면, 검증되지 않은 relation이 곧 게이트가 되므로 P0-15가 더 무거워진다.
**셋은 한 슬라이스에서 함께 닫아야 한다.**

### P1

| ID | 위반 | 불변식 | 상태 |
|---|---|---|---|
| **P1-37** | Run 산출물 9개 중 taskRevision 보유 1개, taskId 보유 3개 | M-13 | 재확인 |
| **P1-38** | 원장이 계약 본문을 보관하지 않아 승인된 Revision 내용을 복원할 수 없다 | M-4 | 재확인 |
| **P1-39** | Draft / Revision 상태 기계가 없다 — `READY_FOR_APPROVAL`이 존재할 시점이 없다 | M-3·M-6 | 재확인 |
| **P1-41** | Revision 산출물이 없다 (P1-37·38·39의 공통 원인) | M-4 | 재확인 |
| **P1-42** | `TASK_REVISION_SUPERSEDED`가 선언·replay되지만 append하는 코드가 0곳이다 | M-9 | **신규** |
| **P1-43** | `resume.sourceHashPolicy: TASK_AND_PROFILE_MUST_MATCH`를 읽는 코드·테스트가 0곳이다 | M-11 | 신규 등재 (선행 감사가 P0-12 서술 안에서 지적한 것을 독립 항목으로 분리) |

선행 감사의 **P1-36**(승인이 실행 가능성을 검사하지 않음)과 **P1-40**(실행 결과 `status`가
계약 안에 있음)은 HEAD에서도 그대로다. `status`는 `task.yaml`에 있어 승인 해시에 덮이고,
실행 판정에는 쓰이지 않으며 `prompt.ts:8`에서 프롬프트에 렌더될 뿐이다.

---

## 선행 감사와 달라진 점

| 항목 | 11-model-conformance.md (b750e9e) | 이번 (5d989f1) |
|---|---|---|
| 판정 대상 | 불변식 12개 | 13개 (relation ↔ revision 축을 M-9·M-10으로 분리) |
| 결과 | 준수 5 / 위반 7 | 준수 5 / 부분 2 / 위반 6 |
| 신규 | — | **P0-14, P0-15, P1-42, P1-43** |
| Run 산출물 집계 | 7개 | 9개 (workspace 스냅샷 2개 포함, 집계 기준 명시) |

선행 감사가 놓친 축은 하나다. **relation을 "있다/없다"로만 봤고 "무엇을 가리키는가"를 보지 않았다.**
M-8만 보면 게이트 한 줄을 추가하면 끝나는 문제로 보이지만, 그 게이트가 읽을 relation은
검증되지 않은 revision 번호를 담고 있고(P0-15), 새 revision을 따라올 수도 없다(P0-14).

## 이번 감사의 한계

- 반증은 전부 `mkdtemp` 워크스페이스에서 실행했고, 어댑터는 DRY_RUN 경로로만 돌았다.
  `COMMAND_EXEC` 경로는 harness-visible command channel이 없어 계획 단계에서 거부되므로
  (R4 초판에서 실측) 이번 반증에 포함되지 않았다.
- 초판 R2·R4 시나리오 2건은 설계가 잘못돼 다른 규칙에 먼저 막혔다. 두 시나리오를
  R2b·R4b·R4c로 다시 짜서 실행한 결과만 위에 실었다.
- M-1·M-2(Objective / Task Queue의 존재)는 산출물과 전이표의 존재만 확인했다.
  큐 순서 규칙·cursor 도출의 정합성은 이번 범위가 아니다.
