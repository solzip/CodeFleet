# 오케스트레이션 로드맵 — 정의대로 움직이게 하려면

```text
작성 일시   : 2026-08-12
기준 커밋   : 5d989f1
기준 정의   : Objective / Task Queue / Task Draft / Task Revision
             각 Task = 역할·범위·가드레일·검증 조건을 가진 승인 대상 계약
             승인된 계약만 AI 에이전트에게 위임
             Run Trace가 실행 결과의 진실
근거        : docs/audits/2026-08-12/11-model-conformance.md (계약 축)
             docs/audits/2026-08-12/12-model-conformance-recheck.md (HEAD 재검수, P0-14·P0-15·P1-42·P1-43)
             docs/concept-foundation.md (설계 규정)
             이 문서 작성 중 새로 확인한 위임·오케스트레이션 축
범위        : 이 문서의 모든 체크 항목이 완료될 때까지 우선순위대로 작업한다.
             전부 완료되면 시스템 전체를 다시 검토한다.
```

## 설계 확인으로 정정된 것

로드맵을 쓰기 전에 `concept-foundation.md`를 먼저 확인했다. 두 가지가 내 초기 판단과 달랐다.

**정정 1 — "큐 구동기가 없다"는 결함이 아니다.** 설계는 명시한다:

> `DONE` = 실행 성공 증거 = review 대기 = **기본적으로 Queue를 자동 진행시키지 않음**
>
> SEQUENCE Objective: previous item VERIFIED -> next item can become NEXT / previous item DONE only -> **stop and wait for review**

즉 자동 구동은 **의도적으로 두지 않은 것**이고, `NEXT` 파생은 이미 `deriveQueueStates`에 구현돼 있다. 남은 것은 "다음 항목이 무엇인지 보여주고 그것을 실행하는" **편의 커맨드**뿐이며 결함이 아니다. 우선순위를 뒤로 내렸다.

**정정 2 — 어댑터는 Task 계약이 아니라 Run Option이다.** 설계:

> `Run Options`는 특정 Run 요청에 붙는 명시적 실행 입력이다. 예를 들어 사용자가 run command에서 선택한 **agentAdapter override**, isolation override, verification override, retry reason 같은 값이 Run Options가 될 수 있다. Run Options는 Project Profile에 저장하지 않는다.

따라서 "Task에 `agentAdapter` 필드를 추가"가 아니라 **Run Options 개념을 만드는 것**이 옳다. 역할(`agentRole`)은 Task 계약, 어댑터는 Run 입력이다.

---

## 체크리스트

우선순위는 **의존 순서**다. 위가 아래를 막는다.

### S1 — 승인 계약의 정합성 (P0 포함, 최우선)

세 항목이 모두 승인 해시와 승인 조건을 건드리므로 한 슬라이스로 묶는다. 따로 하면 해시 형식을 두 번 바꾸게 된다.

- [x] **S1-1 · P0-12** — 승인 대상 해시에 Project Profile을 포함한다
  - 설계 근거: 승인 조건 "Project Profile보다 권한 완화 없음"
  - 코드 근거: 현재 `contentHashOf(taskPath)` 하나(`task-ledger.ts:164`)
  - 검증: `GIT_WORKTREE`로 승인 → 프로파일을 `NONE`으로 → 실행이 **거부**되어야 한다
- [x] **S1-2 · P1-40** — 실행 결과 상태(`status`)를 계약에서 분리한다
  - 설계 근거: §0.6 "Revision State에 실행 결과를 넣지 않는다"
  - 필드를 **해시에서 빼는 대신 계약에서 제거**했다. 해시를 파일 전체가 아닌 투영으로 바꾸면 계약 무결성이 약해진다 — 등재문의 "`status`는 계약에서 빠져야 한다"가 그대로 옳은 방향이었다
  - `status`를 선언한 Task는 validation에서 **거부**된다(무시가 아니라). 무시하면 낡은 `status: DONE`이 계약 안에 권위 있는 얼굴로 남는다
  - 측정: 테스트·예제에서 `status` 선언 43줄 제거(13개 파일), 소비처 3곳 제거(`types.ts` 필드 / `task.ts` 검증 / `prompt.ts` 렌더). 스위트 222 → 223, 실패 0
- [x] **S1-3 · P1-36** — 승인 시점에 실행 가능성을 검사한다
  - 구현: `contractFeasibility()` — verification 커맨드를 선언한 계약이 `meet(profile, role)` 상한에서 `COMMAND_EXEC`에 못 미치면 M2_PRECHECK에서 거부. 거부문이 역할·프로파일·상한을 이름으로 적는다
  - 승인 조건 10개 전부가 아니라 **P1-32를 낳은 조합 하나**를 닫았다. 나머지 조건(Objective relation 등)은 S3에 있다
  - 측정: 스위트 223 → 224
- [x] **S1-4** — 위 셋의 회귀 테스트
  - `test/approval-contract.test.ts` 7건 (S1-1 4 / S1-3 2 / 슬라이스 상호작용 1), `test/yaml.test.ts` 1건
  - 반증 테스트: 항상 거부하는 검사와 구별되도록 "verification 없는 계약은 어떤 역할로도 승인된다"를 함께 둔다
  - 상호작용: 승인 후 프로파일 상한을 낮추면 승인이 취소되고, **낮아진 프로파일에서의 재승인도 거부**된다 (M2_PRECHECK). 없으면 차단의 탈출구가 곧 S1-3이 막으려던 승인이 된다

### S2 — Revision 산출물 (P1-41, 세 건을 함께 닫음)

- [x] **S2-1 · P1-41** — 승인 시 Revision 파일을 만든다
  - `src/task-revision.ts` 신규. `.codefleet/tasks/<id>/revisions/<nnnn>.json`에 설계가 규정한 4개를 담는다: immutable Task contract(승인된 바이트 그대로) / contentHash / approval target hash·decision reference / objective relation snapshot
  - `wx` 배타 생성. revision 번호는 한 번만 점유된다 — 덮어쓰기가 가능하면 승인된 계약이 자기 해시 아래에서 바뀔 수 있다
  - **읽을 때 검증한다.** 저장된 본문을 다시 해시해 대조하고, 어긋나면 반환하지 않고 거부한다. 변조된 계약을 돌려주는 것은 없는 것보다 나쁘다
  - 승인 postcheck가 산출물을 **되읽어서** 확인한다. 쓰기가 성공을 보고하고 쓸 수 없는 파일을 남기면 승인만 서 있고 복원 가능한 계약이 없다
  - 무효화돼도 이 파일은 고쳐 쓰지 않는다 — 무효화된 승인에도 계약은 있었다
- [x] **S2-2 · P1-38** — 승인된 Revision의 본문을 복원할 수 있다
  - `codefleet task revision <id> [n] [--json]`
  - 회귀: 승인 후 파일을 수정해도 승인된 본문이 그대로 복원된다
- [x] **S2-3 · P1-39** — Draft / Revision 상태를 조회할 수 있다
  - `deriveDraftState` / `deriveRevisionStates`, `task status`가 둘을 나눠 출력
  - Draft: validate + 실행 가능성 + "다른 내용으로 선 승인이 서 있는가"를 모두 통과하면 `READY_FOR_APPROVAL`, 아니면 `EDITING` + 막는 이유
  - **설계와 어긋난 지점 2건을 등재했다** (수정이 아니라 등재): 도달할 수 없는 상태를 목록에 넣지 않았다
    - **P1-44** — invalidate 이후 더 새로운 revision이 없는 revision은 설계의 3개 상태 중 무엇도 아니다. `INVALIDATED`로 보고한다. 설계 자신의 replay 예시가 이를 SUPERSEDED로 부르지 않는다
    - **P1-45** — Draft `REJECTED`를 만드는 이벤트가 없다
  - 초안에서 revision 번호만 보고 SUPERSEDED를 파생시켰다가 되돌렸다. 설계가 금지하는 hidden rollback이고, `TASK_REVISION_SUPERSEDED`는 이벤트만 공급할 수 있는 필드를 갖는다
- [x] **S2-4 · P1-37** — Run 산출물이 `taskId` + `taskRevision`을 지목한다
  - 대상은 7개가 아니라 **재검수가 정정한 9개**(workspace 스냅샷 2개 포함). 1/9 → **9/9**
  - 회귀 테스트는 바꾼 파일이 아니라 **9개 집합 전체를 다시 측정**한다. 읽은 개수를 함께 단언해서 0개 검사가 0개 누락으로 읽히지 않게 했다
- [x] **S2-5** — 회귀 테스트
  - `test/task-revision.test.ts` 7건. 스위트 224 → 231, 실패 0

### S3 — 실행 허가의 두 축을 정합하게 (P0-13 + P0-14 + P0-15, 한 슬라이스)

`12-model-conformance-recheck.md`가 HEAD 재검수에서 P0-14·P0-15를 추가로 찾았고, **셋을 함께 닫아야 한다**고 판정했다. 이유가 정확하다 — relation을 필수 게이트로 만드는 것만으로는 **검증되지 않은 값을 게이트로 승격**시키는 결과가 된다. 이 로드맵의 원래 S3-1을 그 판정에 맞춰 확대한다.

- [x] **S3-1 · P0-13** — Objective relation 없이는 Run을 거부한다
  - relation이 없으면 거부하고, 없는 objectives 디렉터리도 **허가가 아니라 거부**로 읽는다. relation이 살 자리조차 없는 것은 relation이 없는 것의 가장 강한 형태다
  - 거부문이 다음 행동(`codefleet objective attach`)을 적는다. 안 된다고만 하는 게이트는 우회로를 찾게 만든다
  - `test/isolation.test.ts`의 "absent one does not"가 뒤집혔고, 그 테스트를 P0-13의 반증 테스트로 다시 썼다
- [x] **S3-1b · P0-14** — relation이 **실행되는 revision**을 가리키게 한다
  - `blockedQueueReason(rootDir, taskId, taskRevision)`. 다른 revision의 relation은 통과시키지 않고, **어느 revision에 붙어 있는지**를 적는다
  - relation을 앞으로 옮기는 경로: `attachTask`가 **기록된 승계**를 따를 때만 다른 revision 부착을 허용한다. revision 번호로 추론하지 않는다
  - 기존 큐 항목은 다시 쓰지 않는다 — 옛 relation은 보존되고 새 항목이 추가된다
- [x] **S3-1c · P0-15** — `attachTask`가 revision·hash를 Task 원장과 대조한다
  - 세 가지를 각각 거부한다: 원장 없음 / 없는 revision(존재하는 목록을 함께 출력) / 해시 불일치(주어진 값과 기록된 값을 나란히)
  - **이 검사가 기존 픽스처 19건을 실패시켰다.** 그중 2건은 픽스처가 실제로 틀린 값을 넣고 있던 것이다 — `isolation.test.ts`의 `"h"`, `defect-repro.test.ts`의 `approval.approvedHash`(승인 대상 해시이지 revision 해시가 아니다)
  - 픽스처를 고친 것이 규칙을 끈 것과 구별되도록 `test/ledger.test.ts`에 전용 거부 테스트를 뒀다
- [x] **S3-1d · P1-42** — `TASK_REVISION_SUPERSEDED`를 append하는 경로를 만든다
  - revision N+1 승인 시 N에 대해 `supersededByTaskRevision`/`supersededByRevisionHash`와 함께 append. 설계의 전이표 "APPROVED -> SUPERSEDED when newer revision approved"가 가리키는 그 순간이다
  - S2에서 등재한 **P1-44의 판정이 여기서 바뀐다**: 승계 이벤트가 생겼으므로 `SUPERSEDED`가 도달 가능해졌고, 승계는 무효화보다 강하다(대체자가 이름으로 있고 종결이다). `CANCELED`는 여전히 생산자 없음
- [x] **S3-2 · 신규** — 프롬프트가 계약 전체를 전달한다
  - 추가: 역할·역할 가이드·유효 모드·상한이 강제된다는 사실·검증 커맨드 목록·"통과했다고 보고해도 통과가 되지 않는다"
  - **해석된 값**을 넣는다. Task 파일의 필드가 아니라 `meet(profile, role, guardrails)`의 결과 — 그렇지 않으면 실제로 적용되는 것과 다른 것을 보여주게 된다
- [x] **S3-3 · 신규** — accepted Objective context를 프롬프트에 포함한다
  - open Objective의 WAITING 항목이면서 **실행되는 revision**과 일치하는 것만. 읽기 전용이고 게이트가 아니다
  - **P1-46 등재**: `OBJECTIVE_CLOSED` 생산자가 없어서 이 필터를 게이트와 독립적으로 검증할 수 없다. 나머지 미수용 조건(BLOCKED/SKIPPED/CANCELED/다른 revision/replay 실패)은 전부 Run 자체를 먼저 거부하므로 필터는 다중 방어다. 못 만든 테스트를 만든 척하지 않았다
- [x] **S3-4** — 회귀 테스트
  - `test/ledger.test.ts` 2건(P0-15 거부 4종 + P0-14 승계), `test/task-revision.test.ts` 2건(프롬프트 계약 8항목 전수 + 정지된 Task)
  - 픽스처: `test/task-ledger-fixture.ts`의 `permitRun`이 Run 픽스처 37곳에 실행 허가의 나머지 절반을 공급한다. 승인된 revision이 없으면 **조용히 넘어가지 않고 던진다**
  - 스위트 231 → 236(도우미 파일 3개 포함), 실패 0

### S4 — Run Options (여러 에이전트에게 할당)

- [x] **S4-1 · 신규** — Run Options 개념을 만든다
  - `RunOptions` 인터페이스, `runTask(root, taskId, discovery, runOptions)`. 읽기만 하고 어디에도 쓰지 않는다 — 설계의 "Run Options는 Project Profile에 저장하지 않는다"
- [x] **S4-2 · 신규** — `--adapter` override를 받는다
  - 프로파일 기본값과 **같은** 검사를 통과해야 한다(allowlist + 로컬 레지스트리). override가 정책 밖에 닿을 수 있으면 그것은 Run 단위로 정책을 넓히는 수단이 되고, 그것만은 아니어야 한다
  - 거부문이 "chosen with --adapter"를 적어서 프로파일을 고칠지 플래그를 고칠지 알려준다
- [x] **S4-3** — Run Plan이 선택 출처를 기록한다
  - `selectedAgentAdapter.selectionSource` = `PROFILE_DEFAULT` | `RUN_OPTION` | `REQUIRE_EXPLICIT_UNRESOLVED`, `runOptions.agentAdapter` = 요청된 값 그대로
- [x] **S4-4** — 회귀 테스트
  - 핵심 테스트: 프로파일이 `REQUIRE_EXPLICIT`(유예)일 때 Run은 거부되고, `--adapter codex`를 준 Run만 진행된다 → 진행한 이유가 Run Option 말고 없다
  - 되쓰기 없음도 함께 확인한다: 같은 워크스페이스에서 옵션 없이 다시 실행하면 다시 거부된다
  - 스위트 236 → 238, 실패 0

### S5 — 반영 경로 [결정 필요]

- [ ] **S5-0 · 결정** — 격리 트리의 결과를 워크스페이스로 어떻게 되돌리는가
  - **설계 문서에 규정이 없다.** 확인함 — 이것만은 진짜 미결이다
  - 후보: (a) `codefleet apply <run-id>` 명시 커맨드 (b) ACCEPTED 리뷰가 자동 반영 (c) 패치만 남기고 사람이 적용
  - 안전 모델에 직결된다 — 격리의 목적이 "자동으로 워크스페이스에 닿지 않게" 하는 것이었으므로 (b)는 그 목적과 충돌한다
  - **권고: (a).** 명시적 행위 + 원장 기록. 격리의 의미를 지키면서 연쇄를 가능하게 한다
- [ ] **S5-1 · P1-27** — 결정된 방식으로 반영 경로를 구현한다
- [ ] **S5-2** — 반영 후 다음 Task가 이전 결과 위에서 시작하는지 확인 (SEQUENCE 연쇄의 전제)
- [ ] **S5-3** — 회귀 테스트

### S6 — 편의·확장 (결함 아님)

- [ ] **S6-1** — `objective next` — 다음 실행 대상을 보여준다 (`NEXT`는 이미 파생됨)
- [ ] **S6-2** — `objective run-next` — 다음 항목을 실행한다. 설계상 자동 진행은 금지이므로 **1회 실행**이지 루프가 아니다
- [ ] **S6-3 · P1-35** — `run-record.md`가 실행한 검증 커맨드를 이름으로 적는다
- [ ] **S6-4 · P1-34** — win32에서 빌드 wrapper를 부를 수 있게 한다
- [ ] **S6-5 · P1-43** — `resume.sourceHashPolicy`를 읽거나 제거한다
  - S1-1이 그 선언의 **내용**은 강제하게 만들었으나 필드 자체는 여전히 생산 1곳 · 소비 0곳이다
- [ ] **S6-6 · B** — 두 번째 어댑터 [대상 미정 — 어떤 CLI를 붙일지 정해져야 착수 가능]

### S7 — 전체 재검토

- [ ] **S7-1** — S1~S6 완료 후 시스템 전체 검토
  - 불변식 12개 재판정 (11-model-conformance.md 기준)
  - 실사용 재시도 (10-first-real-run.md의 5개 차단이 몇 개 남았는지)
  - 등재 대조 (09-registration-check.md 절차)

---

## 착수 순서 요약

```
S1 (승인 정합성)  →  S2 (Revision 산출물)  →  S3 (위임 충실도)
                                                     ↓
                              S5 (반영)  ←  S4 (Run Options)
                                    ↓
                              S6 (편의)  →  S7 (재검토)
```

S5-0은 결정이 필요하므로, 결정이 나올 때까지 S1~S4를 먼저 진행한다.

## 진행 기록

| 슬라이스 | 상태 | 커밋 |
|---|---|---|
| S1 | **완료** (S1-1~S1-4) | — |
| S2 | **완료** (S2-1~S2-5) | — |
| S3 | **완료** (S3-1~S3-4) | — |
| S4 | **완료** (S4-1~S4-4) | — |
| S5 | 결정 대기 | — |
| S6 | 대기 | — |
| S7 | 대기 | — |
