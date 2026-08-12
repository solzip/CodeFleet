# S7 — 시스템 전체 검토

```text
작성 일시   : 2026-08-12
기준선      : 57a80de (로드맵 작성 시점)
현재 HEAD   : a6991bf 계열 + 이 문서
검토 대상   : 12-orchestration-roadmap.md의 S1 ~ S6 (체크 항목 30개 전부 완료)
방법        : 커밋 메시지를 읽지 않는다. 각 불변식에 대해 금지된 것을 실제로 시도하고
             무엇이 일어났는지를 기록한다. 그다음 제품 기본값으로 실사용 경로를
             처음부터 다시 걷는다.
```

## 0. 무엇이 바뀌었나 — 측정값

| 항목 | 기준선 (57a80de) | 현재 | 근거 |
|---|---|---|---|
| 테스트 | 220 통과 / 0 실패 | **250 통과 / 0 실패** | `npm test` |
| 도우미 파일 포함분 | 2 | 3 (`task-ledger-fixture.ts` 추가) | 위 수치에 포함됨 |
| FINAL RULE 커버리지 | 345 / 545 (63.3%) | 345 / 545 (63.3%) | 변동 없음 — 새 코드에 rule claim을 붙이지 않았다 |
| src 모듈 | 26 | 29 (`apply.ts`, `task-events.ts`, `task-revision.ts`) | `ls src/*.ts` |
| 커밋 | — | 7개 슬라이스 | `git log 57a80de..HEAD` |
| 변경량 | — | 38 files, +3467 / −239 | `git diff --stat` |

커버리지가 그대로인 것은 **의도가 아니라 사실**이다. S1~S6은 새 규칙을 구현한 것이
아니라 기존 규칙이 강제되지 않던 자리를 메웠고, 새 claim을 등록하지 않았다.
불변식은 `docs/audits/2026-08-12/`의 M-1~M-13이지 FINAL RULE이 아니므로, 이 수치는
이번 작업의 성과를 재지 않는다. 재는 것은 아래 §1이다.

## 1. 불변식 재판정 — 반증으로

`11-model-conformance.md`와 `12-model-conformance-recheck.md`의 13개 불변식을
**HEAD에서 다시 시도**했다. 스크립트가 매번 새 워크스페이스를 만들고 금지된 것을
실제로 실행한다.

| ID | 불변식 | 이전 | 현재 | 반증 시도의 결과 |
|---|---|---|---|---|
| M-1 | Objective가 실체로 존재한다 | 준수 | 준수 | 변경 없음 |
| M-2 | Task Queue가 실체로 존재한다 | 준수 | 준수 | 변경 없음 |
| M-3 | Task Draft가 상태로 존재한다 | **위반** | **준수** | 승인 전 `draftState = READY_FOR_APPROVAL` |
| M-4 | Task Revision이 불변 계약으로 존재한다 | 부분 | **준수** | 파일을 수정한 뒤에도 승인된 본문 복원 성공 |
| M-5 | approval은 Task Revision에만 묶인다 | 준수 | 준수 | 변경 없음 |
| M-6 | Draft → Revision 승격이 승인과 구분된다 | **위반** | **위반** | 두 이벤트가 여전히 같은 `mutationId` |
| M-7 | approved revision 없이는 run 불가 | 준수 | 준수 | 변경 없음 |
| M-8 | relation 없이는 run 불가 | **위반** | **준수** | Objective 0개 → 거부, Run Trace 0개 |
| M-9 | relation이 실행되는 revision을 가리킨다 | **위반** | **준수** | rev1 relation + rev2 실행 → 거부. 승계 따라 이동은 허용 |
| M-10 | relation의 revision·hash가 원장과 대조된다 | **위반** | **준수** | rev=7 + 0으로 채운 hash → `M2_PRECHECK` |
| M-11 | 계약이 역할·범위·가드레일·검증을 덮는다 | 부분 | **준수** | 프로파일만 바꿔도 `PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL` |
| M-12 | Run Trace가 실행 결과의 진실이다 | 준수 | 준수 | 변경 없음 |
| M-13 | Run 산출물이 taskId + taskRevision을 지목한다 | **위반** | **준수** | Run Trace JSON **9개 중 9개**가 둘 다 보유 |

**7 위반 + 2 부분 → 1 위반.**

남은 M-6은 로드맵의 범위가 아니었다. `approveTask`가 `TASK_REVISION_CREATED`와
`TASK_APPROVED`를 같은 뮤테이션에서 append하므로, 설계가 요구하는 "draft를 승인해서
Revision을 만든다"의 두 단계가 코드에서는 한 단계다. S1-3이 **승인 조건**을 앞당겨
검사하게 만들었지만 **승격 자체를 분리하지는 않았다.**

## 2. 실사용 경로 재시도 — 제품 기본값에서

`10-first-real-run.md`가 기록한 차단 5개를 같은 순서로 다시 걸었다. 새 디렉터리,
`codefleet init`, Gradle wrapper를 검증 커맨드로 선언한 Task.

| # | 차단 | 이전 | 현재 |
|---|---|---|---|
| 1 | 명령 채널 미관측 | 차단 (설계대로) | **그대로** — 메시지 동일, 바꿀 키·값을 그대로 알려준다 |
| 2 | 격리 미설정 | 차단 (설계대로) | **그대로** — 두 선택지와 각각의 의미 제시 |
| 3 | 어댑터가 실행을 거부 (P1-32) | Run이 시작된 뒤 어댑터 stderr에서 발견 | **승인 시점으로 이동** |
| 4 | Windows wrapper 실행 불가 (P1-34) | `SHELL_INTERPRETER_DENIED` | **해소** — `gradlew.bat test`가 `ALLOWED`로 실행됨 |
| 5 | gradle 실패 (JDK 21 없음) | 기준선과 같은 이유 | 제품 결함 아님 — 변동 없음 |

**차단 3의 이동이 이번 작업에서 가장 크게 달라진 사용자 경험이다.** 이전에는
Run이 시작되고, 산출물이 생기고, 어댑터가 뜨지 않은 뒤에야 `run-plan.json`을 열어야
원인을 알 수 있었다. 지금은 승인이 거부되고 거부문이 **세 값을 모두 이름으로 적는다**:

```
M2_PRECHECK failed: Contract cannot be approved: this contract declares 1 verification command(s) but cannot run them.
  agentRole BACKEND_IMPLEMENTER caps at WORKSPACE_EDIT
  defaults.task.harnessMode is DRY_RUN
  together they allow at most DRY_RUN, and running commands needs COMMAND_EXEC
```

P1-33("어느 소스가 모드를 낮췄는지 말하지 않는다")이 이 경로에서는 해소됐다.
다만 **`init` 기본값이 여전히 이 조합을 만든다** — 기본 역할 `BACKEND_IMPLEMENTER`에
검증 커맨드를 붙이면 승인이 거부된다. 실패가 이르고 설명되지만, 기본값 자체는
그대로다. P1-32는 "조용한 늦은 실패"에서 "이른 명시적 거부"로 성격이 바뀌었을 뿐
사라지지 않았다.

### 새로 생긴 단계 2개 (둘 다 의도된 것)

경로가 짧아지지 않고 **길어졌다**. 정직하게 기록한다.

1. **relation 부착이 필수가 됐다** (P0-13). 승인만으로는 실행되지 않는다.
2. **프로파일을 고치면 재승인이 필요하다** (P0-12). 가드레일이 승인 대상에
   들어갔으므로, `allowDegradedCommandObservation`을 켜는 것만으로 기존 승인이
   무효가 된다.

둘 다 거부문이 다음 명령을 그대로 적어 준다. 그래도 "설정 하나 고치고 다시 승인"이
새 일상이 됐다는 사실은 남는다.

## 3. 이 검토가 새로 찾은 결함 1건 (수정함)

가드레일이 움직여 승인이 무효화된 상태에서 `task status`가
`draftState: READY_FOR_APPROVAL`을 출력했다. 그러나 `approve`는 거부한다.

`deriveDraftState`가 **승인 대상의 Task 절반만** 대조하고 있었다 — 내용 해시는
그대로이므로 "승인 가능"으로 읽혔다. S2에서 내용 변경에 대해 고친 바로 그 결함이,
S1-1이 나중에 추가한 가드레일 절반에 남아 있었다.

- 수정: `approval.blockedReason`이 비어 있지 않으면 두 절반 중 어느 쪽이 움직였든
  `EDITING` + 사유
- 회귀: `test/task-revision.test.ts`가 두 절반을 각각 고정한다

**테스트가 아니라 실사용 걷기가 찾았다.** 두 방법이 서로를 대신하지 못한다는 증거로
기록해 둔다.

## 4. 관찰 — 결함으로 등재하지 않은 것

**Node의 `shell: true` 경고.** win32에서 배치 파일을 검증 커맨드로 쓰면 Run마다
`DEP0190 DeprecationWarning: Passing args to a child process with shell option true
can lead to security vulnerabilities, as the arguments are not escaped, only
concatenated`가 출력된다.

경고가 지적하는 위험이 바로 S6-4가 막은 것이다 — argv에 cmd.exe가 문법으로 읽는
문자가 있으면 실행을 거부한다. 즉 완화가 이미 있고 경고는 그 사실을 모른다. 다만
**사용자에게는 보이는 노이즈이고, 완화가 있다는 사실이 출력에 없다.** 결함으로
등재하지 않되 사실로 남긴다.

## 5. 등재 정합성

`09-registration-check.md`의 절차대로 대조했다.

- `docs/audits/2026-08-12/` 전체에서 언급된 번호: P0-1~P0-15, P1-12~P1-46
- SUMMARY의 표에 있는 번호: **동일 집합, 누락 0**
- 표 밖에서만 언급된 P1-4·P1-10: 둘 다 이전 감사(2026-08-10)로의 상호참조.
  P1-4는 P0-12로 승격됐고 그 사실이 11번 문서에 적혀 있다. 미등재 신규 항목 아님

이번 작업 중 새로 등재한 것 3건 — 전부 SUMMARY에 있다:

| ID | 내용 | 상태 |
|---|---|---|
| P1-44 | invalidate 이후 승계가 없는 revision이 설계의 3개 상태 중 무엇도 아니다 | S3-1d 이후 **판정 변경** — 승계 이벤트가 생겨 `SUPERSEDED` 도달 가능 |
| P1-45 | Draft `REJECTED`를 만드는 이벤트가 없다 | 미해소 |
| P1-46 | `OBJECTIVE_CLOSED`를 append하는 코드가 0곳이다 | 미해소 |

## 6. 남은 것

| 항목 | 성격 | 왜 남았는가 |
|---|---|---|
| **M-6** | 설계 위반 | Draft→Revision 승격이 승인과 같은 뮤테이션. 로드맵 범위 밖이었다 |
| **P1-32 (잔여)** | 기본값 | `init`이 여전히 검증 커맨드와 충돌하는 역할을 기본으로 쓴다. 실패는 이르고 설명되지만 기본값은 그대로 |
| **P1-45** | 생산자 부재 | Draft `REJECTED` |
| **P1-46** | 생산자 부재 | `OBJECTIVE_CLOSED`. 프롬프트의 accepted-context 필터를 게이트와 독립적으로 검증할 유일한 경로이기도 하다 |
| **rule coverage** | 미측정 | S1~S6이 만든 코드에 FINAL RULE claim이 붙지 않았다. 63.3%는 이번 작업 전후로 같은 수치이고, 새 코드의 규칙 대응은 **분류되지 않았다** |

마지막 항목을 추정으로 채우지 않는다. "새 코드가 규칙 몇 개를 덮는가"는 측정하지
않았고, 하지 않은 측정을 했다고 적지 않는다.

## 7. 판정

로드맵의 체크 항목 30개는 전부 완료됐고, 불변식은 **7 위반 + 2 부분 → 1 위반**으로
줄었다. 실사용 경로에서는 신규 결함 2건(P1-32의 늦은 실패, P1-34의 wrapper 불가)이
각각 이동·해소됐고, 설계대로인 차단 2건은 그대로다.

경로는 짧아지지 않았다. relation 부착과 재승인이 새로 필요해졌고, 그것이 이 모델의
값이다 — 실행 허가가 두 축의 곱이라는 정의를 코드가 실제로 강제하면 단계가 늘어난다.
줄이는 것이 목표였다면 정의를 바꿔야 한다.
