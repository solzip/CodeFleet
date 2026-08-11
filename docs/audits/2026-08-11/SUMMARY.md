# CodeFleet 재감사 — 2026-08-10 P0 6건의 해소 여부

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902 (git status 청결, 작업 트리 = HEAD)
             ※ 2026-08-10 감사가 적은 대상 커밋 70fa598c...는 현 저장소에서 해석되지 않는다.
               2026-08-11 커밋 identity 재작성으로 전 히스토리가 rewrite됐기 때문이다
               (CLAUDE.md "Publication constraints"). 동일 내용의 재작성 커밋은
               042b0ee "docs: split the README into Korean and English" 이며,
               상태 파일 diff는 이 커밋을 기준선으로 삼았다.
점검 범위   : src/ 26개 파일 10,480줄, test/ 27개 파일 7,307줄,
             docs/rule-implementation-status.json
측정 근거   : npm test 실행 — 199 tests, 199 pass, 0 fail, duration 12,200ms
             FINAL RULE coverage — 83 rules / 545 condition lines / 345 covered (63.3%)
                                   claims 352, rules fully covered 28 of 83, rules with no claim 8
                                   (IMPLEMENTED_UNTESTED 5, NOT_CODE_VERIFIABLE 3, NOT_IMPLEMENTED 0)
판정 방법   : P0마다 (A) 코드 (B) 테스트 (C) 반증 3단계를 모두 수행했다.
             하나라도 실패하면 [미해소], 코드는 맞지만 테스트가 없으면 [부분해소].
             판정 근거는 현재 파일:라인만 인정했고, 반증은 실행 가능한 시나리오로
             재현했다. 재현 스크립트 4종의 출력은 각 항목 문서에 그대로 옮겼다.
```

## 2026-08-10 대비 변화표

| ID | 항목 | 2026-08-10 | 2026-08-11 | 근거 요약 |
|---|---|---|---|---|
| P0-1 | 에이전트 실행 강제 (범위·명령·자격증명) | **결함** | **미해소** | 어댑터 거부·env 화이트리스트는 생겼으나 `src/run.ts:1986`·`src/isolation.ts:34` 두 spawn이 `process.env` 전량 상속. 실측으로 자격증명 유출 재현. `preflightCommand` 호출 지점 여전히 1곳 |
| P0-2 | Objective 큐 게이트 | **결함** | **부분해소** | `run.ts:354-357`에서 실검사, BLOCKED/SKIPPED 테스트 존재. 그러나 원장 파손·디렉터리 부재 시 fail-open (→ 신규 P0-9) |
| P0-3 | 중복·동시 실행 | **결함** | **부분해소** | Run 락 + 배타적 runDir 예약 구현, 재현 테스트 3종 통과. `status: DONE` 순차 재실행은 여전히 경고뿐 |
| P0-4 | 실행 격리·롤백 | **미구현** | **미해소** | worktree 생성·차단은 구현. 폐기는 차단 경로에서만 호출되고 정상 종료·REJECTED에서 호출 0건. 격리 Run의 종단 테스트 0건 |
| P0-5 | taskRevision 추적 체인 | **결함** | **해소** | `?? 1` 제거, precheck 거부, revision 2 종단 테스트 통과. REFERENCE_FAILURE가 append 전에 표면화됨 |
| P0-6 | 타임아웃·출력 상한 | **미구현** | **부분해소** | 어댑터는 30분/16MB 상한 + 테스트 보유. 검증 커맨드·git·스냅샷 프로세스는 상한 0 (9.5초 행 재현). 잘린 바이트가 어떤 산출물에도 기록되지 않음 |

신규 등재: **P0-7 · P0-8 · P0-9 · P0-10** (아래).

## 판정 요약

| ID | 판정 | 3단계 결과 |
|---|---|---|
| P0-1 | **미해소** | A 부분 통과 / B 실패 / C 우회 3건 |
| P0-2 | **부분해소** | A 통과 / B 부분 통과 / C 우회 2건 |
| P0-3 | **부분해소** | A 통과 / B 통과 / C 우회 1건 |
| P0-4 | **미해소** | A 실패 / B 실패 / C 우회 2건 |
| P0-5 | **해소** | A 통과 / B 통과 / C 우회 0건 |
| P0-6 | **부분해소** | A 부분 통과 / B 부분 통과 / C 우회 2건 |

## 신규 P0

### P0-7. GIT_WORKTREE를 켜면 모든 증거가 엉뚱한 트리에서 수집된다

에이전트만 격리 트리에서 돌고(`src/run.ts:695`), diff·changed files·POST_RUN 스냅샷·경로 정책·검증 커맨드는 전부 원본 `projectPath`를 본다(`run.ts:708, 713, 715, 762-770, 787-798`).

실측 — 에이전트가 범위 내 파일 1개를 수정하고 범위 밖 파일 1개를 새로 만든 Run:

| 관측 | isolationMode: NONE | isolationMode: GIT_WORKTREE |
|---|---|---|
| `changedFiles` | `["SECRET-OUT-OF-SCOPE.txt","src/app.js"]` | `[]` |
| `workspaceDelta` | modified 1 | added 0, modified 0, removed 0 |
| `pathViolations` | `PATH_OUTSIDE_ALLOWED_PATHS` 1건 | `[]` |
| `verificationGate` | SATISFIED / PASS | NOT_SATISFIED / FAILED |
| run-record.md | 위반 기재 | **"No file change was observed. No path violation."** |

즉 **격리를 켜는 순간 P0-1의 유일한 잔존 방어선(사후 탐지)까지 사라진다.** 두 P0의 해법이 서로를 무효화한다. 상세: `07-new-defects.md`.

### P0-8. 격리 트리가 폐기되지도, 반영되지도 않는다

`prepared.discard()` 호출 지점은 `src/run.ts:686` 하나 — Run Planning이 격리 요구로 **거부될 때**뿐이다. 정상 종료 경로에도, `src/review.ts`의 REJECTED 경로에도 호출이 없다(grep 0건).

실측: Run 1회 후 `git worktree list`에 detached worktree가 등록된 채 남고, `<tmp>/codefleet-worktree-*` 디렉터리도 남는다. 반대로 ACCEPTED가 나도 worktree의 변경을 실 워크스페이스로 가져오는 코드가 없고, worktree 경로는 run-plan에도 기록되지 않는다(`isolation: { mode, reason }` 뿐).

**성공한 작업은 버려지고 쓰레기는 쌓인다.** 상세: `07-new-defects.md`.

### P0-9. 큐 게이트가 원장 파손·디렉터리 부재에서 fail-open 한다

`blockedQueueReason`(`src/run.ts:162-194`)은 "믿을 수 없는 replay를 허가로 읽어서는 안 된다"는 검사를 `run.ts:176-182`에 두었지만, 그 검사가 `items.length === 0` 분기(`run.ts:173-175`) **뒤에** 있다. 원장이 구조적으로 깨지면 queue가 빈 배열로 나오므로 검사 자체에 도달하지 못한다.

실측:

```
replayStatus: BLOCKED   findings: LEDGER_STRUCTURAL_FAILURE(LEDGER_JSONL_PARSE)
queue length: 0
→ corrupt-ledger runTask: RAN -> 2026-08-11_002
```

`.codefleet/objectives` 디렉터리를 옮기기만 해도 동일하다(`run.ts:166-168`의 `catch { return null }`). 상세: `07-new-defects.md`.

### P0-10. Harness 자신의 자식 프로세스에 경계가 없다

`runProcess`(`src/run.ts:1980-2014`)는 검증 커맨드·`git diff`·`git status`·워크스페이스 스냅샷이 모두 통과하는 단일 지점인데 timeout·출력 상한·env 목록이 전부 없다. `src/isolation.ts:32-43`도 같다.

실측: 9초 걸리는 검증 커맨드에 `runTask`가 9,475ms 동안 묶였고, 그 자식은 부모의 `CODEFLEET_VERIFY_SECRET` 값을 그대로 읽었다. 상세: `07-new-defects.md`.

## 회귀 확인 — 2건 모두 유지

| 지난 감사 [통과] 항목 | 현재 | 근거 |
|---|---|---|
| 승인 없는 실행 경로 부재 | **유지** | spawn 경로는 `src/agent.ts:183` 유일, 그 앞 호출 사슬은 `run.ts:691 → 1837-1840`뿐이며 승인 검사 `run.ts:342-349`가 워크스페이스 해석·격리 준비보다 먼저 놓인다. `createAgentAdapter` 호출 지점 전수 1곳 |
| 리뷰 게이트의 waiver 불가 차단 | **유지** | `src/review.ts:546-550`이 EVIDENCE_DEFECT를 waiver 대상에서 제외하고 `review.ts:214-218`이 ACCEPTED를 거부. 신설된 SYSTEM_POLICY 자동 수락도 gap 0건·defect 0건·`evidenceCompleteness === COMPLETE`를 전부 요구해(`src/auto-review.ts:76-83`) 이 경계를 넓히지 않는다 |

## 커버리지 주장 검증 — [신뢰가능] (표본 3/33)

`NOT_IMPLEMENTED 32 → 0`, `coverage 63.3%`는 상태 파일과 `npm test` 실행 출력에서 그대로 확인된다. 상태 항목이 제거된 33개 규칙 중 3개를 결정론적 난수(`sha256("2026-08-11 re-audit")` 바이트 스트림)로 추출해 구현·테스트 실재를 확인했다.

| 추출된 규칙 | 이전 상태 | 구현 | 테스트 |
|---|---|---|---|
| `CORRECTIVE_EVENT_REQUIRES_VALID_LEDGER_AND_WRONG_DECISION` | NOT_IMPLEMENTED | `src/ledger.ts:911-971` `appendCorrectiveEvent` | `test/policy-rule-id.test.ts:153-247` — 3개 failure class 거부 + dangling 거부 + 적용 후 원본 이벤트 보존까지 검증 |
| `REDACTION_RULE_FAILURE_BLOCKS_EXPORT` | NOT_IMPLEMENTED | `src/profile.ts:608-618` `checkRedactionRules` | `test/export.test.ts:241` — `loadProfile` 거부를 assert |
| `PROFILE_DEFAULTS_RUN_AGENT_ADAPTER_SCHEMA` | NOT_IMPLEMENTED | `src/profile.ts:485-509` `checkDefaultsRun` | `test/adapter-resolution.test.ts:128-131` |

3건 모두 상태 값만 바뀐 것이 아니라 실제 구현과 실행되는 테스트가 있다. **전체 커버리지 주장을 [신뢰불가]로 내릴 근거는 발견되지 않았다.** 다만 표본이 33건 중 3건이므로 이 판정의 범위는 표본에 한한다.

단서 하나: `appendCorrectiveEvent`는 라이브러리로만 존재하고 `src/cli.ts`에 노출된 서브커맨드가 없다(grep 0건). 규칙 자체는 구현됐지만, 2026-08-10 감사가 P0-5의 잔여 위험으로 지목한 "이미 오염된 원장을 사람이 정정할 수단"은 여전히 CLI에서 도달 불가다 → P1로 등재.

## P1 (이번 감사에서 새로 확인된 것만)

| ID | 내용 | 근거 |
|---|---|---|
| P1-12 | `appendCorrectiveEvent`에 CLI 경로 없음. 원장 정정이 코드에서만 가능 | `src/ledger.ts:911`, `src/cli.ts` 내 참조 0건 |
| P1-13 | `AgentRunInput.limits`를 채우는 코드가 없어 타임아웃·출력 상한이 프로파일에서 조정 불가. 30분/16MB 상수로 고정 | `src/types.ts:157` (소비만 존재), `src/run.ts:691-704`에서 미전달 |
| P1-14 | 모든 테스트 픽스처가 `isolationMode: NONE` + `requireIsolationForMutation: false`를 고정. 기본값이 켜져 있는 자세가 종단으로 한 번도 실행되지 않음 | `test/profile-fixture.ts:44, 75-77` |
| P1-15 | 어댑터의 capabilities 거부에 테스트 0건. 문자열 `"Adapter refused to launch"`는 `src/agent.ts:51`에만 존재 | grep 전수 |
| P1-16 | `status: DONE` Task의 순차 재실행이 여전히 경고뿐이고, `loadTask`가 warnings를 버린다 | `src/task.ts:76-81`, `src/task.ts:18-21` |
| P1-17 | timeout kill이 SIGTERM 1회뿐. SIGKILL 에스컬레이션도, 프로세스 그룹 종료도 없음 | `src/agent.ts:216`, grep `SIGKILL`/`killSignal`/`detached` 0건 |
| P1-18 | `task.projectPath`가 하위 디렉터리인 Task에서 경로 기준이 어긋나 범위 안 파일까지 위반으로 판정된다 | 아래 |
| P1-19 | 검증 커맨드 env가 `PATH`뿐이라 `JAVA_HOME`/`SystemRoot` 등을 필요로 하는 빌드 도구가 실패할 수 있다 (2단계에서 등재, fail-closed) | `src/run.ts` 검증 커맨드 호출의 기본 env, `fixes/stage2-process-boundaries.md` §4 |

### P1-18 상세 — 하위 디렉터리 Task의 경로 기준 불일치

1단계 수정 검증 중 발견했다(`fixes/stage1-isolation.md` §6-2). 수정하지 않고 등재만 한다.

**발생 조건**: Task의 `projectPath`가 `.`이 아닌 하위 디렉터리인 모든 Run. **`isolationMode: NONE`에서도 동일하게 재현되므로 격리와 무관하고, 1단계 수정이 만든 것도 아니다.**

`projectPath: services/api`, `scope.include: ["src/**"]`로 실측:

```
changedFiles            : ["services/api/outside-the-scope.txt","services/api/src/app.js"]
workspaceDelta.modified : ["src/app.js"]
pathViolations          : services/api/outside-the-scope.txt  PATH_OUTSIDE_ALLOWED_PATHS
                          services/api/src/app.js             PATH_OUTSIDE_ALLOWED_PATHS
```

**원인**: `git status --porcelain`은 **저장소 루트** 기준 경로를 낸다. 반면 Task scope(`src/**`)와 스냅샷 델타는 **projectPath** 기준이다. 두 기준이 섞여 경로 정책에 들어가므로, 범위 안의 `src/app.js`가 `services/api/src/app.js`로 판정되어 어떤 include 패턴에도 맞지 않는다.

**성격**: fail-closed다. 범위 안 파일을 위반으로 **과다** 보고하므로 잘못된 수락으로 이어지지 않고 ACCEPTED를 막는다. 그래서 P0가 아니라 P1이다. 다만 하위 디렉터리 Task는 현재 사실상 사용 불가 상태이며, 사용자에게는 "정상 파일이 범위 위반으로 나온다"로 보인다.

**주의**: 수정은 `captureGitChangedFiles`의 경로 기준을 projectPath로 정규화하는 방향이 될 텐데, 이 함수는 P0-11 수정(`fixes/stage1b-evidence-completeness.md`)이 손댄 `captureGitDiff`·`captureUntrackedFiles`와 같은 기준을 공유해야 한다. 세 곳을 함께 고쳐야 한다.

## 다음 액션 제안

### 1단계 — 격리를 "켜면 더 위험해지는" 상태에서 빼낸다 (P0-7, P0-8, P0-4)

지금 GIT_WORKTREE는 켜는 쪽이 더 나쁘다. 봉쇄는 되지만 관측이 죽고, 성공한 작업이 사라진다. 한 슬라이스로 묶어야 한다.

1. `run.ts:708, 713, 715, 762-770, 787-798`의 `projectPath`를 `prepared.workPath`로 바꾼다. 에이전트가 실제로 돈 트리에서 증거를 수집해야 경로 정책과 검증이 다시 의미를 갖는다. PRE_RUN 스냅샷(`run.ts:662`)도 같은 트리에서 찍어야 delta가 성립한다.
2. `prepared.discard()`를 Run 종료의 `finally`에 두거나, 보존이 필요하면 worktree 경로를 run-plan `isolation` 블록에 기록하고 리뷰 종료 시 폐기한다. 폐기 실패(파일 잠김)는 `unavailableReason`으로 남긴다 — 지금은 실패해도 아무도 모른다.
3. ACCEPTED가 worktree를 실 워크스페이스로 반영하는 경로를 정하거나, 정하지 않겠다면 그 사실을 run-record에 쓴다. 지금은 사용자가 자기 작업이 어디 있는지 알 방법이 없다.
4. `isolationMode: GIT_WORKTREE`로 도는 종단 테스트를 하나 추가한다. 픽스처가 전부 NONE으로 고정돼 있어 이 경로가 한 번도 실행되지 않았다(P1-14).

### 2단계 — Harness 자신의 프로세스에 P0-6의 경계를 확장한다 (P0-10, P0-1)

`src/agent.ts:172-274`의 `runCommand`가 이미 정답을 갖고 있다. `run.ts:1980`의 `runProcess`와 `isolation.ts:32`의 `run`을 거기에 위임하면 timeout·출력 상한·env 목록이 한 번에 붙는다. env는 `{ PATH }`가 기본이되 git 호출에는 `GIT_*` 최소 목록을 명시한다.

### 3단계 — fail-open 두 곳을 닫는다 (P0-9)

`run.ts:173-182`의 순서를 뒤집어 `replayStatus !== "COMPLETE"`를 큐 항목 유무보다 **먼저** 판정한다. `run.ts:166-168`의 `catch`는 ENOENT만 null로 처리하고 나머지 오류는 던진다. 디렉터리가 없는 것과 읽을 수 없는 것은 다른 사실이다.

### 4단계 — 표면화 (P0-6 잔여)

`agentResult.scanScope`를 `adapter-result.json`에 싣고(`run.ts:932-953`), run-record.md의 "What changed" 위에 잘린 바이트 수와 적용된 상한을 출력한다. 지금은 16MB가 잘려도 리뷰어에게 전달되는 신호가 0이다.

세부 근거는 `01-p0-1-guardrails.md` ~ `08-regression-and-coverage.md` 참조.
