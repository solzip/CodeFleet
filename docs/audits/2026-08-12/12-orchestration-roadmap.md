# 오케스트레이션 로드맵 — 정의대로 움직이게 하려면

```text
작성 일시   : 2026-08-12
기준 커밋   : 5d989f1
기준 정의   : Objective / Task Queue / Task Draft / Task Revision
             각 Task = 역할·범위·가드레일·검증 조건을 가진 승인 대상 계약
             승인된 계약만 AI 에이전트에게 위임
             Run Trace가 실행 결과의 진실
근거        : docs/audits/2026-08-12/11-model-conformance.md (계약 축)
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

- [ ] **S1-1 · P0-12** — 승인 대상 해시에 Project Profile을 포함한다
  - 설계 근거: 승인 조건 "Project Profile보다 권한 완화 없음"
  - 코드 근거: 현재 `contentHashOf(taskPath)` 하나(`task-ledger.ts:164`)
  - 검증: `GIT_WORKTREE`로 승인 → 프로파일을 `NONE`으로 → 실행이 **거부**되어야 한다
- [ ] **S1-2 · P1-40** — 실행 결과 상태(`status`)를 계약에서 분리한다
  - 설계 근거: §0.6 "Revision State에 실행 결과를 넣지 않는다"
  - 지금은 `status`가 계약 해시에 들어가 재승인을 강제하면서 실행 판정에는 쓰이지 않는다
- [ ] **S1-3 · P1-36** — 설계의 승인 조건 10개를 승인 시점에 검사한다
  - 최소한 "역할 상한이 자기 verification을 수행 불가하게 만드는 조합"을 거부 (P1-32의 근본 해소)
- [ ] **S1-4** — 위 셋의 회귀 테스트

### S2 — Revision 산출물 (P1-41, 세 건을 함께 닫음)

- [ ] **S2-1 · P1-41** — 승인 시 Revision 파일을 만든다
  - 설계가 담을 내용을 규정: immutable Task contract / contentHash / approval target hash·decision reference / objective relation snapshot
  - 설계 근거: "Revision 파일은 어떤 계약 내용이 승인 대상이었는지 고정하기 위한 source"
- [ ] **S2-2 · P1-38** — 승인된 Revision의 본문을 복원할 수 있다 (S2-1의 결과)
- [ ] **S2-3 · P1-39** — Draft / Revision 상태를 조회할 수 있다 (`EDITING` / `READY_FOR_APPROVAL` / `REJECTED`, `APPROVED` / `SUPERSEDED` / `CANCELED`)
- [ ] **S2-4 · P1-37** — Run 산출물이 `taskId` + `taskRevision`을 지목한다
- [ ] **S2-5** — 회귀 테스트

### S3 — 위임 충실도 (계약이 위임받는 쪽에 전달되는가)

- [ ] **S3-1 · P0-13** — Objective relation 없이는 Run을 거부한다
  - 게이트 한 줄. `test/isolation.test.ts:878`의 assert가 함께 뒤집힌다
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
- [ ] **S6-5 · B** — 두 번째 어댑터 [대상 미정 — 어떤 CLI를 붙일지 정해져야 착수 가능]

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
| S1 | 착수 | — |
| S2 | 대기 | — |
| S3 | 대기 | — |
| S4 | 대기 | — |
| S5 | 결정 대기 | — |
| S6 | 대기 | — |
| S7 | 대기 | — |
