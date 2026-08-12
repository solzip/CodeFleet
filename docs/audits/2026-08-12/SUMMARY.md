# CodeFleet 재감사 — 4개 슬라이스 이후 P0-1 ~ P0-11 전수

```text
점검 일시   : 2026-08-12
점검 대상   : 244fac79d024a09e881350dbefb90c767266cf60
             브랜치 main, 작업 트리 청결(= HEAD), origin/main과 동기
점검 범위   : src/ 26개 파일 11,379줄, test/ 28개 파일 8,463줄,
             docs/audits/2026-08-11/ 전체 (SUMMARY + 01~08 + fixes/ 5개)
측정 근거   : npm test — 216 tests, 216 pass, 0 fail
             FINAL RULE coverage — 83 rules / 545 condition lines / 345 covered (63.3%)
                                   claims 352, rules fully covered 28, rules with no claim 8
                                   (IMPLEMENTED_UNTESTED 5, NOT_CODE_VERIFIABLE 3, NOT_IMPLEMENTED 0)
             임시 트리 누수 — 전량 삭제 후 npm test 1회, 0 → 0
판정 방법   : P0마다 (A) 코드 (B) 테스트 (C) 반증 3단계. 라인이 아니라 발생 조건 기준.
             2026-08-11의 공격 시나리오를 그대로 재실행했다 — 격리 모드만 바꾼
             동일 Task 2회 비교(P0-7 발견 방법)와 자격증명 유출 재현(P0-1 §C-1).
```

## 지시된 기준선 중 존재하지 않는 것 두 가지

작업을 시작하기 전에 확인했고, 없는 것을 있는 것처럼 다루지 않기 위해 먼저 적는다.

| 지시된 항목 | 실제 |
|---|---|
| 브랜치 `audit/stage3` | **없다.** 로컬·원격 모두 `main` 하나뿐 (`git branch -a`, `git ls-remote --heads origin`). HEAD `244fac7`은 지시와 일치하며 `main` 위에 있다 |
| `fixes/env-DESKTOP-ENGO922.md` | **없다.** 작업 트리, git 히스토리 전체(`git rev-list --all --objects`), 전문 검색 모두 0건. 이 이름을 참조하는 문서도 없다 |

`fixes/` 하위 실재 파일은 5개다 — `stage1-isolation.md`, `stage1b-evidence-completeness.md`, `stage2-precheck.md`, `stage2-process-boundaries.md`, `stage3-4-failopen-and-surfacing.md`.

**추가 작업 3에 미친 영향**: 지시는 "`env-DESKTOP-ENGO922.md`의 D-2가 확인한 대로"를 근거로 플랫폼 한정 판정을 요구했다. 그 문서가 없으므로 D-2가 무엇을 확인했는지 인용할 수 없다. 대신 **코드와 테스트에서 직접 판정했다** — 결론은 `04-platform-qualification.md`에 있고, 근거는 전부 이 저장소의 파일과 이 호스트에서의 실행이다. 없는 문서의 내용을 추정해 채우지 않았다.

---

## 3열 변화표

| ID | 항목 | 2026-08-10 | 2026-08-11 | 2026-08-12 | 플랫폼 |
|---|---|---|---|---|---|
| P0-1 | 에이전트 실행 강제 (범위·명령·자격증명) | **결함** | **미해소** | **부분해소** | 무관 |
| P0-2 | Objective 큐 게이트 | **결함** | **부분해소** | **해소** | 무관 |
| P0-3 | 중복·동시 실행 | **결함** | **부분해소** | **부분해소** | 무관 |
| P0-4 | 실행 격리·롤백 | **미구현** | **미해소** | **해소** | 무관 |
| P0-5 | taskRevision 추적 체인 | **결함** | **해소** | **해소** | 무관 |
| P0-6 | 타임아웃·출력 상한 | **미구현** | **부분해소** | **부분해소** | **win32 한정 검증** |
| P0-7 | 격리 시 증거가 엉뚱한 트리에서 수집 | — | **신규 결함** | **해소** | 무관 |
| P0-8 | 격리 트리 미폐기·미반영 | — | **신규 결함** | **해소** | **win32 한정 검증** |
| P0-9 | 큐 게이트 fail-open | — | **신규 결함** | **해소** | 무관 |
| P0-10 | Harness 자식 프로세스에 경계 없음 | — | **신규 결함** | **해소** | 무관 |
| P0-11 | 신규 파일 내용 소실 | — | **신규 결함** | **해소** | 무관 |

11건 중 **8건 해소, 3건 부분해소, 미해소 0건.** 부분해소 3건의 잔여는 모두 이미 번호가 붙은 P1이거나 구조적 제약이다.

## 판정 요약

| ID | 판정 | A 코드 | B 테스트 | C 반증 | 잔여 |
|---|---|---|---|---|---|
| P0-1 | 부분해소 | 부분 통과 | **실패** | 우회 1건 (구조적) | 파일 범위 **사전** 차단 부재와 에이전트 명령 preflight 불가(명령 채널 부재) — 둘 다 P0-1 본체의 잔여. 어댑터 거부 테스트 0건 (P1-15) |
| P0-2 | 해소 | 통과 | 부분 통과 | 0건 | CANCELED 종단 테스트 없음 (신규 P1-25) |
| P0-3 | 부분해소 | 통과 | 통과 | 우회 1건 | `status: DONE` 순차 재실행 (P1-16) |
| P0-4 | 해소 | 통과 | 통과 | 0건 | ACCEPTED 반영 경로 미설계 (P1-27), 격리 모드 unavailable이 게이트로 승격 안 됨 (P1-26) |
| P0-5 | 해소 | 통과 | 통과 | 0건 | 정정 이벤트 CLI 부재 (P1-12) |
| P0-6 | 부분해소 | 통과 | 부분 통과 | 우회 2건 | 어댑터 타임아웃 기계 판독 불가 (신규 P1-20), SIGKILL 부재 (P1-17) |
| P0-7 | 해소 | 통과 | 통과 | 0건 | — |
| P0-8 | 해소 | 통과 | 통과 | 0건 | 실패 경로 회귀 테스트가 win32 전용 (신규 P1-21) |
| P0-9 | 해소 | 통과 | 통과 | 0건 | Objective 디렉터리 삭제는 방어 불가 (P1-28, 수용된 한계) |
| P0-10 | 해소 | 통과 | 통과 | 0건 | `isolation.ts`가 계측을 버림 (신규 P1-23) |
| P0-11 | 해소 | 통과 | 통과 | 0건 | 우선순위 규칙 도달 불가 (신규 P1-22) |

세부 근거는 `01-p0-verdicts.md`.

## 공격 시나리오 재실행 결과

### P0-7 발견 방법 — 격리 모드만 바꾼 동일 Task 2회

에이전트가 범위 내 파일 수정 + 범위 밖 파일 생성 + 범위 내 파일 생성을 한 번에 한다.

| 관측 | `NONE` | `GIT_WORKTREE` | 2026-08-11의 `GIT_WORKTREE` |
|---|---|---|---|
| `changedFiles` | 3건 | **3건 (동일)** | `[]` |
| `workspaceDelta` | added 1, modified 1 | **added 1, modified 1 (동일)** | 전부 0 |
| `pathViolations` | `PATH_OUTSIDE_ALLOWED_PATHS` 1건 | **1건 (동일)** | `[]` |
| `verificationGate` | SATISFIED/PASS | **SATISFIED/PASS (동일)** | NOT_SATISFIED/FAILED |
| 워크스페이스 오염 | 있음(설계대로) | **없음** | 없음 |
| `git worktree list` | 1 | **1** | 2 |
| 신규 파일 내용이 패치에 | 있음 | **있음** | (해당 없음) |

**두 모드의 관측이 완전히 일치한다.** 격리가 관측을 눈멀게 하던 상태가 사라졌고, 봉쇄는 유지된다.

### P0-1 §C-1 — 자격증명 유출

```
envSeenByVerificationChild : "absent"
```

부모에 `CODEFLEET_VERIFY_SECRET`을 export한 뒤 Run을 돌렸다. 2026-08-11에는 검증 커맨드 자식이 그 값을 그대로 읽었다. 지금은 읽지 못한다.

## 새로 등재 — P1-20 ~ P1-41

번호는 2026-08-11의 P1-19에 이어 붙였다. 전부 이번 감사에서 실행 또는 코드로 확인했고, **고치지 않았다.** 등재 대조 절차와 근거는 `09-registration-check.md`.

| ID | 내용 | 근거 | 출처 |
|---|---|---|---|
| P1-20 | 타임아웃으로 죽은 **어댑터**가 `ADAPTER_FAILED`로만 기록된다. 검증 커맨드는 `VERIFICATION_COMMAND_TIMED_OUT`을 받는데 어댑터는 받지 못해, 게이트가 크래시와 시간 초과를 구분할 수 없다 | `toAdapterExecutionStatus`가 `exitCode === null`과 비-0을 같은 값으로 수렴시킨다. `resourceLimits.adapter`에 `timedOut` 없음. grep `ADAPTER_TIMEOUT` 0건 | 01 §P0-6, 02 §유실 |
| P1-21 | 폐기 실패의 회귀 테스트가 열린 파일 핸들로 삭제를 막는 win32 동작에 의존한다. POSIX에서는 열린 fd가 unlink를 막지 않아 폐기가 성공하고 **테스트가 실패한다** | `test/isolation.test.ts`의 holder가 `openSync(...,"w")`로 삭제를 막는 전제. POSIX `unlink` 의미론 | 01 §P0-8, 04 §2 |
| P1-22 | `--no-index` 경로에서 잘림 우선순위 규칙이 **도달 불가**하다 | 파일당 상한 1,048,576 B < git 증거 상한 33,554,432 B. 크기 검사를 통과한 파일의 패치는 상한에 이를 수 없다 | 03 §I-2 |
| P1-23 | `src/isolation.ts`의 `run()`이 `runCommand`의 `scanScope`를 버린다 | 상한을 적용받는 지점 중 계측을 기록하지 않는 유일한 곳. `repositoryPrefix`가 stdout을 데이터로 쓴다 | 03 §I-1 |
| P1-24 | 검증 커맨드가 POST_RUN 스냅샷·changed files 수집 **이후** 실행되어, 검증이 만든 파일 변경이 어떤 증거에도 나타나지 않는다 | 격리 Run에서 검증이 만든 `env-seen.txt`가 `changedFiles`·`pathViolations` 어디에도 없다(실측). 2026-08-10 이전부터의 순서 | SUMMARY §공격 재실행 |
| P1-25 | `QUEUE_ITEM_CANCELED`가 `runTask` 종단으로 검증되지 않는다 | 큐 테스트가 BLOCKED/SKIPPED만 돈다. P0-9 테스트의 CANCELED는 파손 원장과 함께 쓰여 단독 경로가 아니다 | 01 §P0-2 |
| P1-26 | 요청한 격리 모드를 얻지 못한 Run이 그 사실을 리뷰 게이트로 올리지 않는다 | `modeUnavailableReason`에 기록되나 `runSummaryUnavailableReasons`로 승격되지 않는다. 기본값에서는 `checkIsolationRequirement`가 차단하므로 실피해 없음 | 02 §6 |
| P1-27 | ACCEPTED 시 격리 트리의 변경을 워크스페이스로 반영하는 경로가 설계되지 않았다 | 1단계가 명시적으로 미설계로 두고 run-record.md가 그 사실을 출력한다. 침묵은 아니나 결정이 남아 있다 | 02 §24 |
| P1-28 | Objective 디렉터리를 통째로 지우면 큐 결정이 소실되고 Run이 통과한다 | 원장 소실이므로 `run.ts`에서 막을 지점이 없다. **수용된 한계**로 등재하며 수정 대상이 아니다 | 02 §25, 01 §P0-9 |
| P1-29 | 모든 자식 프로세스의 타임아웃 메시지가 `"Adapter exceeded the ... ms limit"`라고 말한다 | `runCommand`가 어댑터 전용이던 시절의 문구. git 호출·검증 커맨드에도 "Adapter"라고 적힌다. 사실을 왜곡하지는 않으나 오독을 부른다 | 03 §I-1 |
| P1-30 | `git diff --no-index -- /dev/null <file>`가 git 구현의 `/dev/null` 특별 취급에 의존한다 | OS가 아니라 git 버전에 의존하는 지점. 근거는 이 호스트의 git 하나뿐 | 04 §4 |
| P1-31 | 격리 트리 경로 접두가 Windows 260자 한계의 여유를 줄인다 | 실측: `os.tmpdir()` 30자 → 접두 71자 → 저장소 상대 경로에 남는 여유 **189자**. 149자짜리 현실적 Java 경로는 총 221자로 통과. 사용자명이 길거나 저장소 경로가 189자를 넘으면 격리 Run에서만 실패한다 | 09 §1-c (이 감사의 측정) |
| P1-32 | Core 역할 7개 중 5개로는 어댑터가 실행되지 않는다. `init` 기본값(`BACKEND_IMPLEMENTER`)이 그중 하나다 | 어댑터는 `commandExecution !== true`면 거부하는데 5개 역할의 `defaultMaxMode`가 `WORKSPACE_EDIT` 이하. 실사용에서 기본 설정이 `LAUNCH_FAILED` | 10 §차단 3 |
| P1-33 | 어댑터 거부 메시지가 어느 소스가 모드를 낮췄는지·무엇을 바꿔야 하는지 말하지 않는다 | 차단 1·2는 키와 값을 지목한다. 차단 3은 `run-plan.json`을 열어야 원인을 안다 | 10 §차단 3 |
| P1-34 | win32에서 Gradle/Maven wrapper를 검증 커맨드로 쓸 수 없다 | `.bat`은 `cmd.exe`가 필요하고 `cmd`는 `SHELL_INTERPRETER_DENIED`, `spawn`은 `shell:false`. POSIX는 shebang으로 직접 실행되어 해당 없음 | 10 §차단 4 |
| P1-35 | `run-record.md`가 실행된 검증 커맨드를 이름으로 적지 않는다 | 문서 내 `gradle`·`--version` 등장 0회. `SATISFIED`만 보고 "테스트 통과"로 읽게 된다 | 10 §run-record |
| P1-36 | 승인이 계약의 실행 가능성을 검사하지 않아, 역할 상한이 자기 검증 조건을 금지하는 계약도 승인된다 | `approveTask`에 정합성 검사 없음. 실측: `BACKEND_IMPLEMENTER` + 검증 커맨드 → 승인 통과, 실행 시 `LAUNCH_FAILED`. P1-32가 실사용 사례 | 11 §I-6 |
| P1-37 | Run 산출물 7개 중 `taskRevision`을 담은 것이 1개뿐이고 4개는 `taskId`도 없다 | 실측 전수: run-plan만 둘 다 보유. 계약으로 가는 링크가 `run-plan.json` 하나에 집중 | 11 §I-5 |
| P1-38 | Task 원장이 계약 본문을 보관하지 않아 승인된 Revision의 내용을 복원할 수 없다 | 원장 이벤트 필드에 본문 없음(해시만). 본문 사본은 Run이 일어난 경우의 Run Trace `task.yaml`뿐 | 11 §I-7 |
| P1-39 | Draft / Revision 상태 기계가 코드에 없다 — `READY_FOR_APPROVAL`이 존재할 수 있는 시점이 없다 | 설계 §0.6이 두 상태 기계를 명시. `approveTask`가 revision 생성과 승인을 한 뮤테이션에서 처리 | 11 §재판정 D-2 |
| P1-40 | 실행 결과 상태(`status`)가 계약 문서 안에 있어 승인 해시에 포함된다 | 설계 §0.6 "Revision State에 실행 결과를 넣지 않는다". Run-derived state가 계약에 들어가고, 그러면서 실행 판정에는 쓰이지 않는다 | 11 §재판정 D-3 |
| P1-41 | Revision 산출물이 존재하지 않는다 | 설계는 Revision이 계약 본문을 담는 파일이라고 규정. 코드는 원장 이벤트만 만든다. **P1-37·P1-38·P1-39의 공통 원인** | 11 §뿌리 원인 |

## 제품 정의 대비 위반 — P0-12 · P0-13

확정된 내부 모델을 기준으로 코드를 감사한 결과다. 전문은 `11-model-conformance.md`.

| ID | 위반 | 근거 | 불변식 |
|---|---|---|---|
| **P0-12** | 프로파일 가드레일이 승인 대상 해시에서 빠져 있어, 승인자가 본 계약과 다른 가드레일로 실행된다 | 승인 해시 = `contentHashOf(taskPath)` 하나(`task-ledger.ts:164`). 실측: `GIT_WORKTREE`+`requireIsolationForMutation:true`로 승인 후 프로파일만 뒤집자 재승인 없이 `NONE`으로 실행되고 편집이 실 워크스페이스에 반영됨. `run.ts:703`이 `TASK_AND_PROFILE_MUST_MATCH`를 선언하고 소비하지 않음 | I-3 |
| **P0-13** | Objective relation 없이 Run이 실행된다 | `blockedQueueReason`이 부정 결정만 막고 미attach는 통과(`run.ts:413`). 실측: Objective 없이 `runTask` 성공. `test/isolation.test.ts:878`이 이 동작을 회귀 테스트로 고정 중 | I-4 |

**P0-12는 2026-08-10 P1-4의 승격**이고, **P0-13은 2026-08-11 P0-2 §C-1의 재판정**이다. 후자는 그때 코드 주석을 근거로 통과시켰으나, 확정된 정의를 기준으로 다시 보면 위반이다.

### [정의 확정 필요] 3건은 해소됐다

초판은 D-1~D-3을 "사람이 정할 것"으로 분류했으나, `docs/concept-foundation.md`가 셋 다 이미 답을 갖고 있었다. 확인 후 재판정했다.

| ID | 재판정 | 근거 |
|---|---|---|
| D-1 | **해소** — `attachTask`가 accept다. `WAITING`이 accepted 상태 | 설계: "정책상 허용된 actor가 accept/approve한 순간부터 ledger에 기록한다". P0-13은 원장 스키마 변경이 아니라 게이트 한 줄 |
| D-2 | **위반 → P1-39** | 설계 §0.6이 Draft/Revision 상태 기계를 명시. 코드에 없다 |
| D-3 | **위반 → P1-40** (방향은 초판의 반대) | 설계 §0.6 "Revision State에 실행 결과를 넣지 않는다". `status`는 계약에서 빠져야 한다 |

## 재검수 (HEAD `5d989f1`) — P0-14 · P0-15 신규

`11-model-conformance.md`는 `b750e9e` 기준이다. 확정 모델로 HEAD를 다시 대조했다. 전문은 `12-model-conformance-recheck.md`.
불변식을 13개로 다시 나눴다 — relation을 "있다/없다"(M-8)와 "무엇을 가리키는가"(M-9·M-10)로 분리했고, 그 축에서 신규 위반 2건이 나왔다.
결과: 준수 5 / 부분 2 / **위반 6**. 기존 P0-12·P0-13은 HEAD에서 그대로 재현된다.

| ID | 위반 | 근거 (전부 임시 워크스페이스 실행) |
|---|---|---|
| **P0-14** | Objective relation이 실행되는 revision을 가리키지 않고, 새 revision으로 옮길 방법이 없다 | rev1 승인·attach → 편집 → invalidate → rev2 승인 후 실행: `run-plan approval.taskRevision=2` / `queue relation revision=1`로 **RAN**. rev2 attach는 `sample is already attached at revision 1`로 거부(`ledger.ts:697-709`). `blockedQueueReason`은 `taskId`로만 필터(`run.ts:224`) |
| **P0-15** | relation의 revision·hash가 Task 원장과 대조되지 않는다 | `attachTask`가 둘을 입력으로 받고 원장을 읽지 않는다(`ledger.ts:666-727`). 실측: 원장 최대 revision 1인 상태에서 `rev=7` + 0으로 채운 hash가 수락되고 실행됨. CLI는 `--revision` 미지정 시 `1`을 넣고 hash는 **현재 파일**에서 계산(`cli.ts:271-278`) |

P0-13을 고쳐 relation을 필수 게이트로 만들면, 그 게이트가 읽을 relation이 검증되지 않은 값이므로 **P0-13·P0-14·P0-15는 한 슬라이스에서 함께 닫아야 한다.**

| ID | 신규 P1 | 근거 |
|---|---|---|
| **P1-42** | `TASK_REVISION_SUPERSEDED`가 선언되고 replay가 처리하지만, append하는 코드 경로가 0곳이다 | `task-ledger.ts:20`·`:94`. revision 승계를 표현할 이벤트가 정의만 되고 생산자가 없다 — P0-14가 필요로 하는 바로 그 이벤트 |
| **P1-43** | `resume.sourceHashPolicy: "TASK_AND_PROFILE_MUST_MATCH"`를 읽는 코드·테스트가 0곳이다 | `run.ts:703`이 매 Run Plan에 적는다. grep 결과 생산 1곳, 소비 0곳. P0-12 서술 안에 있던 지적을 독립 항목으로 분리 |

P1-37의 수치를 갱신한다: Run Trace의 JSON은 7개가 아니라 **9개**(workspace 스냅샷 2개 포함)이고, `taskRevision` 보유 1개 · `taskId` 보유 3개 · 둘 다 없는 것 5개다.

### S2 구현 중 등재된 P1 (2026-08-12)

| ID | 신규 P1 | 근거 |
|---|---|---|
| **P1-44** | 설계의 Revision State 3개 중 어디에도 속하지 않는 상태가 이벤트로 만들어진다 | 설계 §0.6은 `APPROVED` / `SUPERSEDED` / `CANCELED`를 규정한다. `TASK_APPROVAL_INVALIDATED` 이후 더 새로운 revision이 없는 revision은 이 셋 중 무엇도 아니다. 설계 자신의 예시(seq 10 approve r1 / 14 invalidate r1 / 20 approve r2)도 r1을 SUPERSEDED가 아니라 "무효화됨 / 현재 실행 불가"로 replay한다. `INVALIDATED`라는 이름으로 보고하고 셋 중 하나로 접지 않았다 — `CANCELED`로 접으면 아무도 내리지 않은 폐기 결정을 주장하게 된다 |
| **P1-45** | Draft State `REJECTED`를 만드는 이벤트가 없다 | 설계 §0.6이 `EDITING` / `READY_FOR_APPROVAL` / `REJECTED`를 규정하지만 draft 폐기는 파일 삭제로만 가능하다. `deriveDraftState`는 도달 가능한 2개만 반환한다. P1-42(`TASK_REVISION_SUPERSEDED` 생산자 부재)와 같은 종류의 결함 |
| **P1-46** | `OBJECTIVE_CLOSED`를 append하는 코드가 0곳이다 | S3 구현 중 확인. `ledger.ts:20`에 선언되고 `:237`에서 replay가 처리하지만 생산자가 없다. P1-42(`TASK_REVISION_SUPERSEDED`)와 같은 형태이며, S3에서 P1-42는 닫혔고 이것은 남았다. 프롬프트의 accepted-context 필터를 게이트와 독립적으로 검증할 유일한 경로가 이것이라 테스트를 만들지 못했다 |

## 2026-08-11 P1 목록의 연속성

이번 감사가 새 번호를 붙이기 전에 기존 번호가 끊기거나 겹치지 않는지 대조했다. 2026-08-11 SUMMARY의 P1-12 ~ P1-19는 전부 살아 있고, 이번 감사에서 상태만 갱신됐다.

| ID | 2026-08-11 내용 | 2026-08-12 상태 |
|---|---|---|
| P1-12 | `appendCorrectiveEvent`에 CLI 경로 없음 | 미해소 — `src/cli.ts` 참조 0건 |
| P1-13 | 상한을 프로파일에서 읽지 못함 | 미해소 — 상수는 `src/agent.ts` 한 블록에 모였으나 연동 없음 |
| P1-14 | 모든 픽스처가 격리를 끈 채로 돈다 | **무효화됨** — 픽스처 기본값은 그대로지만, 새 테스트가 명시적으로 `GIT_WORKTREE`를 켜므로 "격리 경로가 한 번도 실행되지 않는다"는 조건이 사라졌다 |
| P1-15 | 어댑터 capabilities 거부에 테스트 0건 | 미해소 — grep 결과 문자열이 `src/agent.ts`에만 존재 |
| P1-16 | `status: DONE` 순차 재실행이 경고뿐 | 미해소 — `src/task.ts` 2026-08-10과 동일 |
| P1-17 | SIGKILL 에스컬레이션·프로세스 그룹 종료 없음 | 미해소 — 이제 **모든** 자식이 이 한계를 공유 |
| P1-18 | 하위 디렉터리 Task의 경로 기준 불일치 | 미해소 — 세 capture 함수가 여전히 저장소 루트 기준 |
| P1-19 | 검증 커맨드 env가 `PATH`뿐 | 미해소 — P1-13과 함께 해소돼야 함 |

번호 끊김 없음, 중복 없음. 이번 감사는 P1-20부터 이어 붙였다.

### 지시가 언급한 D-1 (MAX_PATH)

지시는 `env-DESKTOP-ENGO922.md`의 D-1을 이어받으라고 했으나 **그 문서가 없고, `MAX_PATH`·`D-1` 문자열은 저장소 어디에도 없다**(`docs/`·`src/`·`test/` 전문 검색). 따라서 그 항목이 무엇을 확인했는지 인용할 수 없다.

없는 문서를 근거로 쓰는 대신 **이 감사에서 직접 측정했다.** 격리가 Run을 `<tmpdir>/codefleet-worktree-XXXXXX/<runId>/` 아래로 옮기므로 모든 경로에 고정 접두가 붙는다:

```
os.tmpdir()          : 30자
격리 트리 접두        : 71자
260자 한계까지 여유    : 189자  (저장소 상대 경로에 허용되는 길이)
현실적 深경로 149자   : 총 221자 → 통과, 파일 체크아웃·읽기·git status 정상
core.longpaths       : (unset)
```

**이 호스트에서는 재현되지 않는다.** 그러나 여유가 189자로 유한하고 `os.tmpdir()` 길이가 사용자명에 따라 달라지므로, 저장소 상대 경로가 그 여유를 넘으면 **격리 Run에서만** 실패한다. 측정값과 조건을 담아 P1-31로 등재했다. 원래 D-1이 같은 것을 가리켰는지는 확인할 수 없다.

## 인계·등재 항목 전수 수거

`fixes/` 5개 문서의 "다음 단계로 넘김 / 등재만 / 범위 밖" 항목 **24건**을 수거해 현재 상태를 판정했다. 전문은 `02-handoff-inventory.md`.

| 판정 | 건수 |
|---|---|
| 해소됨 | 11 |
| 미해소·등재 유지 | 8 |
| 중복 | 3 |
| 무효화됨 | 1 |
| **유실 — 어디에도 인계되지 않음** | **1** |

유실 1건이 이 작업의 성과다: **2026-08-11 `06-p0-6-limits.md` 권고 3**(타임아웃 Run에 전용 `unavailableReason`)이 P1 번호를 받지 못했고 4개 슬라이스의 "범위 밖" 목록 어디에도 나타나지 않는다. 2단계가 검증 커맨드에는 구현했으나 어댑터에는 하지 않았고, 그 차이를 기록한 문서가 없다. 위 P1-20으로 등재했다.

## 슬라이스 간 상호작용 — 4건 전부 통과

각 슬라이스는 자기 범위에서만 검증됐으므로 조합을 실행으로 확인했다. 전문은 `03-slice-interactions.md`.

| 조합 | 결과 |
|---|---|
| 격리(1) + 프로세스 경계(2) | 격리 준비 실패가 `GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY`로 보고되고 Run이 거부되며 **락이 해제된다** |
| 신규 파일 캡처(1b) + 잘림 표면화(4) | 3개 신규 파일 중 1개 수록·2개 미수록(바이너리·상한 초과)이 전부 `CAPABILITY_GAP`으로 표면화. 규칙대로지만 **겹침 자체가 발생 불가**(P1-22) |
| 전면 차단(3) + 락(P0-3) | 파손 원장·읽을 수 없는 디렉터리 두 거부 모두 락 잔존 0 |
| P0-11 캡처 + 폐기(1) | 캡처가 폐기보다 앞선다. 폐기 후에도 신규 파일 내용이 패치에 있고 트리는 사라진다 |

## 플랫폼 한정 판정

`04-platform-qualification.md`에 전문. 요약:

| 항목 | 판정 근거 | POSIX에서 달라지는가 |
|---|---|---|
| P0-6 타임아웃 kill | `child.kill("SIGTERM")` 1회 | **그렇다.** win32는 `TerminateProcess`로 무시 불가. POSIX는 핸들러로 무시 가능하고 손자 프로세스는 양쪽 모두 생존 |
| P0-8 폐기 실패 경로 | 열린 핸들이 삭제를 막는다는 전제 | **그렇다.** POSIX에서는 막지 않으므로 테스트가 실패한다 (P1-21) |
| P0-9 읽을 수 없는 디렉터리 | 파일 자리에 디렉터리 → `ENOTDIR` | 아니다. 양쪽 동일 |
| P0-3 락·runId 예약 | `open(path,"wx")`, 비-recursive `mkdir` | 아니다 |
| P0-1 env 경계 | `spawn`의 `env` 옵션 | 아니다 |
| P0-11 `--no-index` | git이 `/dev/null`을 특별 취급 | 아니다 (git 동작에 의존) |
| 경로 대소문자 | `detectCaseSensitivity` | 설계상 플랫폼 분기 |

**이 감사의 모든 실행 근거는 win32 단일 호스트에서 나왔다.** 위 두 항목은 POSIX에서 다르게 동작한다고 판단하되, 그 판단은 실측이 아니라 코드와 OS 의미론에 근거한 분석이다.

## 남은 것과 우선순위

0. **P0-13 + P0-14 + P0-15를 한 슬라이스로** — 실행 허가의 두 축(approved revision / accepted relation)이 지금은 서로 다른 revision을 가리켜도 실행된다. relation을 필수로 만드는 것만으로는 검증되지 않은 값을 게이트로 승격시키는 결과가 된다.
1. **P1-13 + P1-19를 함께** — 실사용 검증의 전제. 지금 상태로 `mvn`/`gradle`을 검증 커맨드로 쓰면 게이트가 통과할 수 없다.
2. **P1-21** — POSIX CI를 켜는 순간 red가 된다. 켜기 전에 고쳐야 한다.
3. **P1-20** — 게이트가 크래시와 시간 초과를 구분하지 못한다. 2단계가 검증 커맨드에 한 것을 어댑터에 하면 된다.
4. P1-22·P1-23은 현재 도달 불가이므로 상한 값을 조정할 때 함께 본다.
5. P1-18은 `captureGitChangedFiles`·`captureUntrackedFiles`·`captureGitDiff` 셋을 같은 기준으로 함께 고쳐야 한다.

세부는 `01-p0-verdicts.md` ~ `04-platform-qualification.md`.
