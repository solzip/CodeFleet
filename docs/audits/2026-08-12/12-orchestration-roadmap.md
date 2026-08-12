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

- [ ] **S3-1 · P0-13** — Objective relation 없이는 Run을 거부한다
  - 게이트 한 줄. `test/isolation.test.ts:878`의 assert가 함께 뒤집힌다
- [ ] **S3-1b · P0-14** — relation이 **실행되는 revision**을 가리키게 한다
  - 현재 `blockedQueueReason`이 `taskId`로만 필터하므로 rev2를 실행하면서 rev1 relation을 통과한다
  - 새 revision으로 relation을 옮길 경로가 없다 → **P1-42**(`TASK_REVISION_SUPERSEDED` 생산자 부재)가 여기서 필요해진다
- [ ] **S3-1c · P0-15** — `attachTask`가 revision·hash를 Task 원장과 대조한다
  - 지금은 둘을 입력으로 받고 원장을 읽지 않아 `rev=7` + 0으로 채운 hash도 수락된다
- [ ] **S3-1d · P1-42** — `TASK_REVISION_SUPERSEDED`를 append하는 경로를 만든다 (S3-1b의 전제)
- [ ] **S3-2 · 신규** — 프롬프트가 계약 전체를 전달한다
  - 지금 프롬프트에 없는 것: **역할·역할 가이드·가드레일·검증 조건**
  - 계약을 "역할·범위·가드레일·검증 조건"으로 정의해 놓고 위임받는 쪽에는 범위만 준다
- [ ] **S3-3 · 신규** — accepted Objective context를 프롬프트에 포함한다
  - 설계 근거: "accepted 또는 approved Objective context만 Harness prompt에 포함". 현재 프롬프트에 Objective가 **아예 없다**
- [ ] **S3-4** — 회귀 테스트

### S4 — Run Options (여러 에이전트에게 할당)

- [ ] **S4-1 · 신규** — Run Options 개념을 만든다 (Profile에 저장하지 않는 Run 단위 입력)
- [ ] **S4-2 · 신규** — `--adapter` override를 받는다. `policies.agentAdapters.allowedAdapters` 대조는 기존 경로 재사용
- [ ] **S4-3** — Run Plan이 선택 출처(profile default / run option)를 기록한다
- [ ] **S4-4** — 회귀 테스트

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
| S3 | 대기 | — |
| S4 | 대기 | — |
| S5 | 결정 대기 | — |
| S6 | 대기 | — |
| S7 | 대기 | — |
