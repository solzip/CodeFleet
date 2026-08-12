# 제품 정의 대비 코드 적합성 감사

```text
점검 일시   : 2026-08-12
점검 대상   : b750e9e (main, 작업 트리 = HEAD)
점검 방법   : 확정된 모델을 불변식으로 번역한 뒤, 불변식마다
             (A) 강제 코드 (B) 테스트 (C) 반증 3단계.
             반증은 전부 임시 워크스페이스에서 실행해 확인했다.
범위        : 읽기 전용. 수정은 하지 않았고 위반 등재까지만 한다.
결과        : 불변식 12개 중 준수 5 / **위반 7**
             ※ 초판은 3건을 [정의 확정 필요]로 분류했다. 그 분류는 틀렸다 —
               docs/concept-foundation.md §0.6과 승인 조건 절이 이미 답을 갖고
               있었고, 확인 후 위반 2건 · 준수 1건으로 재판정했다. 아래 §재판정.
```

## 확정된 모델 (기준)

- Task = 논리적 작업 단위
- Task Draft = 승인 전 수정 가능한 계약 후보
- Task Revision = 승인/실행 가능한 불변 계약 (역할·범위·가드레일·검증 조건 포함)
- Run Trace = 특정 Revision의 실행 증거
- Approval은 Task Revision에만 묶인다
- accepted/approved Objective relation + approved revision 없이는 run 불가
- Run은 taskId + taskRevision에 묶인다

---

## 작업 1 — 정의를 불변식으로 번역

| ID | 불변식 | 깨지면 무엇이 거짓이 되는가 |
|---|---|---|
| I-1 | Draft 상태로는 Run에 도달할 수 없다 | "실행된 것은 전부 승인된 계약이다"가 거짓이 된다 |
| I-2 | Revision은 불변 — 승인 후 계약 내용이 바뀌면 실행이 거부된다 | 승인 기록이 무엇을 허락했는지 알 수 없게 된다 |
| I-3 | 계약에 속한다고 정의된 것(역할·범위·가드레일·검증 조건)이 전부 승인 대상 해시에 포함된다 | 승인자가 본 계약과 실행된 계약이 다를 수 있다 |
| I-4 | Objective relation이 accepted/approved가 아니면 Run 불가 | "실행은 언제나 수용된 관계 아래에서 일어난다"가 거짓이 된다 |
| I-5 | Run 산출물 전체가 taskId + taskRevision을 지목한다 | 증거를 계약에 되돌려 붙일 수 없다 |
| I-6 | 승인 가능한 계약은 실행 가능해야 한다 | 승인이 "실행해도 된다"가 아니라 "실행을 시도해도 된다"로 약해진다 |

### 정의에서 추가로 도출한 불변식

| ID | 불변식 | 깨지면 무엇이 거짓이 되는가 | 근거 |
|---|---|---|---|
| I-7 | 승인된 Revision의 **내용**이 사후에 복원 가능하다 | "불변 계약"이 검증 불가능한 주장이 된다 — 무엇이 불변인지 확인할 방법이 없다 | "Revision = 불변 계약" |
| I-8 | 하나의 Run Trace는 정확히 하나의 Revision에 속한다 | 증거가 두 계약에 걸쳐 "어느 쪽 것인지 모르는" 상태가 된다 | "Run Trace = 특정 Revision의 실행 증거" |
| I-9 | Approval은 Task Revision에만 묶인다 (Task 전체·파일·경로에 묶이지 않는다) | 승인의 대상이 계약이 아니라 이름이 된다 | "Approval은 Task Revision에만 묶인다" |
| I-10 | Draft → Revision 승격은 승인과 구분되는 단계로 존재한다 | "승인 전 계약 후보"라는 상태가 실재하지 않게 된다 | "Task Draft = 승인 전 수정 가능한 계약 후보" |
| I-11 | 실행 결과 상태(READY/DONE 등)는 계약에 들어가지 않는다 | 실행 결과가 계약을 바꾸고, 결과가 바뀔 때마다 재승인이 필요해진다 | 설계 §0.6 "Revision State에 실행 결과를 넣지 않는다" |
| I-12 | Objective relation에 accepted/approved 상태가 실재한다 | I-4를 판정할 대상 자체가 없다 | "accepted/approved Objective relation" |

---

## 작업 2 — 불변식별 판정

| ID | 판정 | A 코드 | B 테스트 | C 반증 |
|---|---|---|---|---|
| I-1 | **준수** | 있음 | 있음 | 재현 실패 |
| I-2 | **준수** | 있음 | 있음 | 재현 실패 |
| I-3 | **위반** | 없음 | 없음 | **재현됨** |
| I-4 | **위반** | 없음 | **반대를 고정하는 테스트가 있음** | **재현됨** |
| I-5 | **위반** | 부분 | 없음 | **재현됨** |
| I-6 | **위반** | 없음 | 없음 | **재현됨** |
| I-7 | **위반** | 없음 | 없음 | **재현됨** |
| I-8 | 준수 | 있음 | 간접 | 재현 실패 |
| I-9 | 준수 | 있음 | 있음 | 재현 실패 |
| I-10 | **위반** | 없음 | 없음 | **재현됨** |
| I-11 | **위반** | 없음 | 없음 | **재현됨** |
| I-12 | 준수 | 있음 | 있음 | 재현 실패 |

---

### I-1. Draft 상태로는 Run에 도달할 수 없다 — **준수**

**(A)** `src/run.ts:401`이 `executeRun` 진입 직후, 어떤 산출물보다 먼저 승인을 확인한다. 승인이 없으면 `replayApproval`이 `NO_REVISION_CREATED`(`task-ledger.ts:106`)를 내고 Run이 던진다.

**(B)** `test/run.test.ts:1435` — `assert.rejects(() => runTask(...), /not approved for execution.*NO_REVISION_CREATED/s)`. `:1532`도 같은 축.

**(C)** 재현 실패. 승인 없이 실행에 도달하는 경로는 이번에도 발견되지 않았다.

**단서**: 준수하지만 **Draft가 상태로 존재해서가 아니라 승인이 없어서** 막힌다. 아래 I-10 참조.

---

### I-2. Revision은 불변이다 — **준수**

**(A)** `replayApproval`이 승인 시점 해시와 현재 파일 해시를 대조하고 다르면 `TASK_CONTENT_CHANGED_AFTER_APPROVAL`(`task-ledger.ts:110`)로 막는다. 승인 상태는 원장 replay로만 계산되고 파일의 가변 필드에서 읽지 않는다.

**(B)** `test/run.test.ts:1449` "editing a Task after approval revokes its executability".

**(C)** 재현 실패:

```
edited-after-approval run : refused -> Task is not approved for execution: sample (TASK_CONTENT_CHANGED_AFTER...)
```

승인 후 내용을 바꾸면 실행이 거부된다. **불변성은 강제된다.**

---

### I-3. 계약 구성요소 전부가 승인 해시에 포함된다 — **위반**

**(A)** 승인 해시는 `contentHashOf(taskPath)` — **Task 파일 하나의 해시뿐**이다(`task-ledger.ts:164`, `:171`).

정의가 계약에 속한다고 말한 네 가지의 소재:

| 계약 구성요소 | 어디에 있는가 | 승인 해시에 포함되는가 |
|---|---|---|
| 역할 (`agentRole`) | Task 파일 | **예** |
| 범위 (`scope`) | Task 파일 | **예** |
| 가드레일 — Task-local (`guardrails`) | Task 파일 | **예** |
| 가드레일 — 프로파일 (`isolationMode`, `requireIsolationForMutation`, 상한, 명령 정책) | `.codefleet/config.json` | **아니오** |
| 검증 조건 (`verification.commands`) | Task 파일 | **예** |

**Task 파일 안에 있는 것은 전부 해시에 들어간다.** 빠지는 것은 프로파일에 있는 가드레일이고, 그것이 실행의 성격을 바꾼다.

**(B)** 없음. 프로파일 해시를 승인에 묶는 테스트가 0건이다.

**(C)** 재현됨. `GIT_WORKTREE` + `requireIsolationForMutation: true`에서 승인한 뒤, Task 파일은 손대지 않고 프로파일만 뒤집었다:

```
approval still valid?      : true (blockedReason: "")
approvedHash unchanged?    : true
run under flipped guardrail: RAN as NONE | 에이전트 편집이 실 워크스페이스에 반영됨: true
resume.sourceHashPolicy    : "TASK_AND_PROFILE_MUST_MATCH"  (선언돼 있고 소비하는 코드는 없다)
```

승인자는 "격리된 트리에서만 편집한다"는 계약을 승인했는데, 재승인 없이 **실 워크스페이스를 직접 고치는 실행**이 일어났다.

`run.ts:703`이 `sourceHashPolicy: "TASK_AND_PROFILE_MUST_MATCH"`를 산출물에 적는다. **정의가 요구하는 바를 코드가 스스로 선언해 놓고 강제하지 않는다.**

**설계도 같은 것을 요구한다.** `docs/concept-foundation.md`의 "Draft를 approve해서 Revision을 만들기 위한 조건" 10개 중 하나가 이것이다:

> - **Project Profile보다 권한 완화 없음**

승인 시점에 프로파일과 대조하라는 지시가 설계에 이미 있다. 코드는 대조하지 않는다.

**재판정**: 2026-08-10은 이것을 P1-4("승인 해시가 프로파일 미포함")로 등재했다. 정의·설계·산출물(`run.ts:703`의 `TASK_AND_PROFILE_MUST_MATCH`) 셋이 같은 말을 하고 코드만 하지 않는 상태이므로, 우선순위 문제가 아니라 **계약 모델 위반**이다. → **P0-12**로 승격 등재.

---

### I-4. Objective relation이 accepted/approved가 아니면 Run 불가 — **위반**

**(A)** `run.ts:413`의 `blockedQueueReason`은 **부정 결정만** 막는다 — `BLOCKED`/`CANCELED`/`SKIPPED`. Objective에 attach되지 않은 Task는 통과한다. 코드 주석이 그 결정을 명시한다: "A Task attached to no Objective is not blocked: the queue has expressed no opinion about it."

**(B)** **반대를 고정하는 테스트가 있다.** `test/isolation.test.ts:878` — "a queue decision blocks the Run, **and an unattached Task is not blocked**". 즉 정의가 금지하는 동작이 회귀 테스트로 못박혀 있다.

**(C)** 재현됨:

```
no Objective at all, run : RAN -> 2026-08-12_001
```

**재판정**: 2026-08-11 P0-2 §C-1은 이 동작을 "명시적으로 문서화된 결정"이라며 통과시켰다. 그 판정의 근거는 **코드 주석**이었다. 확정된 정의는 반대를 말하므로, 주석이 아니라 정의를 기준으로 다시 판정한다 — **위반**. → **P0-13**

주의: 이것을 고치면 `test/isolation.test.ts:878`의 assert 하나와 CLI 사용 흐름(현재는 Objective 없이도 run 가능)이 함께 바뀐다.

---

### I-5. Run 산출물 전체가 taskId + taskRevision을 지목한다 — **위반**

**(A)** 부분. `run-plan.json`만 둘 다 갖는다.

**(C)** 재현됨 — 실제 Run의 산출물 전수:

```
run-plan.json                taskId=true  taskRevision=true
adapter-request.json         taskId=false taskRevision=false
harness-observation.json     taskId=false taskRevision=false
adapter-result.json          taskId=false taskRevision=false
run-summary.json             taskId=true  taskRevision=false
result.json                  taskId=true  taskRevision=false
verification/verify-001.json taskId=false taskRevision=false
```

7개 중 **taskRevision을 갖는 것은 1개**, taskId조차 없는 것이 4개다. 나머지는 `runId`/`runPlanId`와 FileRef로 run-plan을 거쳐야 계약에 닿는다.

**(B)** 없음.

**영향**: run-plan.json이 소실되거나 해시가 깨지면 나머지 증거를 어느 Revision의 것인지 판정할 수 없다. 링크가 하나의 파일에 집중돼 있다. → **P1-37**

---

### I-6. 승인 가능한 계약은 실행 가능해야 한다 — **위반**

**(A)** 없음. `approveTask`(`task-ledger.ts:156-220`)가 하는 검사는 reason 존재, 해시 대조, 이전 승인과의 충돌뿐이다. CLI는 승인 전 `validateTask`를 돌리지만(`cli.ts:135`, "An invalid Task cannot become an executable contract") 그것은 **필드 스키마 검증**이고 실행 가능성 검사가 아니다.

역할 상한과 검증 조건의 정합성을 승인 시점에 보는 코드가 없다.

**(C)** 재현됨. `agentRole: BACKEND_IMPLEMENTER`(상한 `WORKSPACE_EDIT`)에 검증 커맨드를 가진 Task:

```
approve BACKEND_IMPLEMENTER with verification commands: ACCEPTED  <-- 승인이 실행 가능성을 보지 않았다
run outcome : FAILED | Adapter refused to launch: AdapterRequest capabilities do not permit command execution
```

승인은 통과하고, 실패는 **실행 시점에** 어댑터 거부로 나타난다.

**(B)** 없음.

**설계는 승인 조건을 10개로 명시한다**(`concept-foundation.md`, "Draft를 approve해서 Revision을 만들기 위한 조건"):

```text
- Draft schema valid
- intent 있음
- objectiveContext가 review에서 concrete objective target과 relation intent로 resolved 됨
- scope 있음
- guardrails 있음
- verification 있음
- doneCriteria 있음
- blocking needsReview 없음
- Project Profile보다 권한 완화 없음
- draft content hash 계산됨
```

코드가 승인 경로에서 보는 것은 `validateTask`의 필드 스키마와 해시뿐이다. objectiveContext resolution, blocking needsReview, 프로파일 대조는 검사되지 않는다.

2026-08-12 실사용에서 발견한 P1-32(기본 역할로 어댑터가 뜨지 않음)가 정확히 이 불변식의 위반 사례다. 기본 프로파일이 만드는 계약은 **승인은 되지만 실행될 수 없다.** → **P1-36**

방향은 fail-closed(실행이 실패할 뿐 잘못된 수락으로 이어지지 않음)이므로 P0로 올리지 않았다. 다만 정의가 "승인 가능한 계약은 실행 가능해야"라고 말하는 이상 위반이다.

---

### I-7. 승인된 Revision의 내용이 복원 가능하다 — **위반**

**(A)** 없음. Task 원장 이벤트의 필드 전수:

```
["mutationId","eventId","seq","type","taskId","taskRevision","revisionHash","approvalTargetHash",
 "actorKind","actorId","reason","at"]
ledger stores contract body: false
```

**해시만 있고 계약 본문이 없다.** revision 1이 무엇을 말했는지 원장에서 복원할 수 없다.

계약 본문의 사본이 남는 유일한 자리는 Run Trace의 `task.yaml`(`run.ts`의 `copyFile`)인데, 이것은 **Run이 일어났을 때만** 생긴다. 승인만 하고 실행하지 않은 Revision, 또는 실행 전에 파일을 고친 Revision의 내용은 어디에도 없다.

**(C)** 재현됨(위 필드 목록이 곧 근거).

**설계는 Revision이 본문을 담는다고 말한다:**

> 생성되는 Revision은 다음을 포함한다.
> - **immutable Task contract**
> - contentHash
> - approval target hash / approval decision reference
> - objective relation snapshot / reference

그리고 그 목적을 명시한다 — "Revision 파일은 **어떤 계약 내용이 승인 대상이었는지 고정하기 위한 source**". 코드에는 그런 파일이 없다(아래 §뿌리 원인).

**영향**: "불변 계약"은 사후 검증이 가능해야 의미가 있는데, 지금은 "현재 파일이 그때 그 해시와 같은가"만 답할 수 있고 "그때 그 계약이 무엇이었나"에는 답할 수 없다. → **P1-38**

---

### I-8. 하나의 Run Trace는 정확히 하나의 Revision에 속한다 — **준수**

**(A)** `run.ts:401`이 Run 시작 시점에 승인을 한 번 확정하고, `run-plan.json`의 `approval.taskRevision`에 박는다. Run 도중 Revision이 바뀔 경로는 없다(Task 파일을 고쳐도 이미 시작된 Run은 자기 스냅샷을 쓴다).

**(B)** 간접 — `test/defect-repro.test.ts`의 revision 2 종단 테스트가 run-plan의 `approval.taskRevision === 2`를 assert한다.

**(C)** 재현 실패.

---

### I-9. Approval은 Task Revision에만 묶인다 — **준수**

**(A)** `TASK_APPROVED` 이벤트가 `taskRevision`과 `approvalTargetHash`를 함께 싣는다(`task-ledger.ts:202-208`). 승인 상태는 원장 replay로만 계산되고 파일의 플래그로 존재하지 않는다.

**(C)** 재현 실패. Task 이름이나 경로에만 묶인 승인은 만들 수 없었다.

---

## 작업 3 — 등재

### P0

| ID | 위반 | 근거 | 불변식 |
|---|---|---|---|
| **P0-12** | 프로파일 가드레일이 승인 대상 해시에서 빠져 있어, 승인자가 본 계약과 다른 가드레일로 실행된다 | 승인 해시 = `contentHashOf(taskPath)` 하나(`task-ledger.ts:164`). 실측: `GIT_WORKTREE`+`requireIsolationForMutation:true`로 승인 후 프로파일만 뒤집자 재승인 없이 `NONE`으로 실행되고 편집이 실 워크스페이스에 반영됨. `run.ts:703`이 `TASK_AND_PROFILE_MUST_MATCH`를 선언하고 소비하지 않음 | I-3 |
| **P0-13** | Objective relation 없이 Run이 실행된다 | `blockedQueueReason`이 부정 결정만 막고 미attach는 통과(`run.ts:413`). 실측: Objective를 만들지 않은 상태에서 `runTask` 성공. `test/isolation.test.ts:878`이 이 동작을 회귀 테스트로 고정하고 있음 | I-4 |

**P0-12는 2026-08-10 P1-4의 승격이다.** 같은 사실을 우선순위가 아니라 계약 모델 위반으로 재판정했다.
**P0-13은 2026-08-11 P0-2 §C-1의 재판정이다.** 그때는 코드 주석을 근거로 통과시켰고, 이번에는 확정된 정의를 기준으로 위반으로 본다.

### P1

| ID | 위반 | 근거 | 불변식 |
|---|---|---|---|
| **P1-36** | 승인이 계약의 실행 가능성을 검사하지 않아, 역할 상한이 자기 검증 조건을 금지하는 계약도 승인된다 | `approveTask`에 정합성 검사 없음. 실측: `BACKEND_IMPLEMENTER` + 검증 커맨드 → 승인 통과, 실행 시 `LAUNCH_FAILED`. P1-32가 이 위반의 실사용 사례 | I-6 |
| **P1-37** | Run 산출물 7개 중 `taskRevision`을 담은 것이 1개뿐이고 4개는 `taskId`도 없다 | 실측 전수 표(위 I-5). 계약으로 가는 링크가 `run-plan.json` 하나에 집중 | I-5 |
| **P1-38** | Task 원장이 계약 본문을 보관하지 않아 승인된 Revision의 내용을 복원할 수 없다 | 원장 이벤트 필드에 본문 없음(해시만). 본문 사본은 Run이 일어난 경우의 Run Trace `task.yaml`뿐 | I-7 |
| **P1-39** | Draft / Revision 상태 기계가 코드에 없다 — `READY_FOR_APPROVAL`이 존재할 수 있는 시점이 없다 | 설계 §0.6이 Draft State(EDITING/READY_FOR_APPROVAL/REJECTED)와 Revision State(APPROVED/SUPERSEDED/CANCELED)를 명시. `approveTask`가 revision 생성과 승인을 같은 뮤테이션에서 처리(`task-ledger.ts:193-208`) | I-10 |
| **P1-40** | 실행 결과 상태(`status`)가 계약 문서 안에 있어 승인 해시에 포함된다 | 설계 §0.6 "Revision State에 실행 결과를 넣지 않는다". `status`는 Run-derived state인데 `task.yaml`에 있고 해시가 파일 전체를 덮는다. 그러면서 실행 판정에는 쓰이지 않는다 | I-11 |
| **P1-41** | Revision 산출물이 존재하지 않는다 — 계약 본문을 고정하는 파일이 없다 | 설계는 Revision이 immutable Task contract·contentHash·approval reference·relation snapshot을 담는다고 규정. 코드는 원장 이벤트 2개만 만든다. **P1-37·P1-38·P1-39의 공통 원인** | I-7·I-10 |

---

## 재판정 — [정의 확정 필요]는 잘못된 분류였다

초판은 세 항목을 "코드와 정의가 다른데 어느 쪽을 고칠지 사람이 정해야 한다"로 분류했다. **그 분류가 틀렸다.** `docs/concept-foundation.md`가 세 항목 모두에 이미 답을 갖고 있었고, 확인하지 않은 채 열린 질문으로 넘긴 것이다.

정의와 설계는 충돌하지 않는다. 따라서 모든 항목은 **설계 ↔ 코드** 문제로 환원되고, 판단 기준은 하나다 — *설계가 이미 말한 것인가, 아직 아무도 말하지 않은 것인가.* 셋 다 전자였다.

### D-1 → **해소.** attach가 accept다

설계는 relation의 수용을 이렇게 규정한다:

> `TASK_RELATION_PROPOSED`는 ledger에 남기지 않는다. Proposed relation은 Draft Task 안의 제안일 뿐이며, 실행에는 사용할 수 없다. **정책상 허용된 actor가 review 단계에서 accept / approve / reject한 순간부터 ledger에 기록한다.**

코드의 `attachTask`는 사유를 요구하고 뮤테이션 락 아래 append-only로 원장에 기록되는 actor 행위다. 설계가 말하는 accept의 정의를 그대로 만족한다. 따라서 **`WAITING`이 accepted 상태이고, I-12는 준수다.**

빠진 `PROPOSED`는 Draft 안에 사는 상태이므로 코드에 없는 것이 맞다 — Draft 자체가 없기 때문이다(D-2).

**P0-13에 미치는 영향**: 원장 스키마 변경이 아니라 **게이트 한 줄**이다. "relation이 하나도 없으면 거부"만 추가하면 된다.

### D-2 → **위반.** 설계에 Draft 상태 기계가 이미 있다

§0.6 "Task Draft / Revision State 규칙"이 상태 모델을 셋으로 분리하고 전이까지 명시한다:

```text
Draft State:  EDITING -> READY_FOR_APPROVAL -> (approved: Revision 생성) / REJECTED
Revision State: APPROVED -> SUPERSEDED / CANCELED
```

> `approved`는 Draft State가 아니다. `approved`는 Draft를 immutable Revision으로 만드는 이벤트다.

코드에는 이 상태가 **하나도 없다.** `approveTask`가 `TASK_REVISION_CREATED`와 `TASK_APPROVED`를 같은 뮤테이션에서 연달아 append하므로(`task-ledger.ts:193-208`), **`READY_FOR_APPROVAL`이 존재할 수 있는 시점이 없다.**

결과: 정의가 "Task Revision = **승인 가능한**/승인된 불변 실행 계약"이라고 말하는 그 "승인 가능한" 상태가 실재하지 않는다. 승인자는 불변 계약을 검토하고 승인하는 것이 아니라, **가변 파일을 승인하고 그 순간 동결이 일어난다.** → **P1-39**

### D-3 → **위반.** 방향은 초판이 적은 것의 반대다

§0.6은 상태 모델을 셋으로 나누고 마지막에 못 박는다:

```text
Run-derived State = 실제 실행 결과를 관리
```
> **Revision State에 실행 결과를 넣지 않는다.**

`status: READY | RUNNING | DONE | FAILED | BLOCKED`는 Run-derived state다. 그런데 계약 문서(`task.yaml`) 안에 있고, 승인 해시가 파일 전체를 덮으므로 **실행 결과가 계약 안으로 들어간다.**

초판은 이것을 "계약의 일부라면 실행 판정에 써야 한다"로 적었다. 설계 기준으로는 반대다 — **계약에서 빠져야 한다.** 지금 상태의 문제는 두 가지다:

- 실행 결과를 기록하면 계약이 바뀌고 재승인이 필요해진다(과도한 제약)
- 그러면서 실행 판정에는 쓰이지 않는다(효력 없음)

**P1-16(`DONE` 재실행이 경고뿐)의 성격도 바뀐다.** 계약 위반이 아니라 Run-derived state를 관리할 자리가 없다는 문제다. → **P1-40**

---

## 뿌리 원인 — Revision 산출물이 존재하지 않는다

D-2와 P1-38은 증상이 다르지만 원인이 같다. 설계는 Revision을 **파일로** 규정한다:

> 생성되는 Revision은 다음을 포함한다.
> - **immutable Task contract**
> - contentHash
> - approval target hash / approval decision reference
> - objective relation snapshot / reference

그리고 그 존재 이유를 적는다 — "Revision 파일은 **어떤 계약 내용이 승인 대상이었는지 고정하기 위한 source**". (권위 상태는 원장 replay가 갖고, Revision 파일은 내용을 고정하는 역할만 한다는 분업도 명시돼 있다.)

**코드에는 그 파일이 없다.** `approveTask`가 만드는 것은 원장 이벤트 두 개뿐이고, 계약 본문은 여전히 가변 `task.yaml`에만 있다. 여기서 다음이 따라 나온다:

| 결과 | 등재 |
|---|---|
| 승인된 계약의 본문을 복원할 수 없다 | P1-38 |
| Draft와 Revision이 별개 산출물로 분리되지 않는다 | P1-39 |
| Revision State(APPROVED/SUPERSEDED/CANCELED)를 담을 자리가 없다 | P1-39 |
| Run 산출물이 지목할 Revision 실체가 없어 `taskRevision` 숫자만 남는다 | P1-37 |

**P1-37·P1-38·P1-39는 각각 고칠 것이 아니라 Revision 산출물을 만들면 함께 닫힌다.** 우선순위를 정할 때 이 셋을 하나로 묶는 것이 맞다. → **P1-41**로 뿌리 원인을 별도 등재한다(증상 셋과 교차 참조).

---

## 요약

정의가 요구하는 12개 불변식 중 **5개가 강제되고 7개가 깨져 있다.** 초판의 [정의 확정 필요] 3건은 설계 문서를 확인한 뒤 위반 2 · 준수 1로 정리됐다.

깨진 7개는 세 갈래다.

- **승인의 범위가 좁다** (I-3, I-6): 승인은 Task 파일 하나의 해시에만 묶여 있고, 설계가 명시한 승인 조건 10개 중 대부분을 검사하지 않는다.
- **Revision이 실체로 없다** (I-7, I-10, I-11): 계약 본문을 고정하는 산출물이 없어 Draft/Revision 분리도, 상태 기계도, 본문 복원도 성립하지 않는다.
- **게이트와 증거가 계약을 끝까지 따라가지 않는다** (I-4, I-5): 관계 없이도 실행되고, 증거는 revision을 지목하지 않는다.

가장 무거운 것은 여전히 **P0-12**다. 실행의 성격을 가장 크게 바꾸는 가드레일(격리 여부)이 승인 고정 밖에 있고, **정의·설계·산출물이 모두 그것을 고정하라고 말하는데 코드만 하지 않는다** — `run.ts:703`은 `TASK_AND_PROFILE_MUST_MATCH`를 매 Run Plan에 적고, 설계의 승인 조건은 "Project Profile보다 권한 완화 없음"을 요구한다.

그다음은 **P1-41(Revision 산출물)**이다. 단독으로는 P1이지만 P1-37·P1-38·P1-39를 한꺼번에 닫으므로 실질 비중이 가장 크다.

### 이 감사가 스스로 저지른 것

초판은 설계 문서를 열어보지 않고 세 항목을 "사람이 정해야 한다"로 넘겼다. 그 셋 모두 설계에 답이 있었다. **감사가 정의와 코드만 대조하고 설계를 건너뛰면, 이미 결정된 것을 미결로 보고하게 된다.** 다음 감사에서는 대조 대상에 `docs/concept-foundation.md`를 명시적으로 포함해야 한다 — `09-registration-check.md`가 제안한 등재 대조와 같은 성격의 절차 문제다.
