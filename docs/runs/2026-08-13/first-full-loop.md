# 첫 전체 완주 — 실물 확인 기록

> 이 문서는 코드 개선 기록이 아니다. CodeFleet 파이프라인을 처음부터 끝까지
> 한 번 돌려서, **저장소가 실제로 바뀌었는지**를 git으로 확인한 기록이다.

## 메타데이터

| 항목 | 값 |
| --- | --- |
| 일시 | 2026-08-13 10:03 ~ 10:15 (KST) |
| CodeFleet 커밋 | `e5fb188b0951f30556da6b8b39a9d2a8db8e5a46` (`git status` clean — **이번 작업에서 CodeFleet 소스는 한 줄도 바꾸지 않았다**) |
| fixture 경로 | `C:\cf-fixture` (ASCII 전용) |
| OS | Windows 11 Pro 10.0.26200, PowerShell / Git Bash |
| node | v24.14.1 |
| git | 2.42.0.windows.2 |
| 어댑터 | `claude` 2.1.229 (Claude Code CLI, 실제 에이전트 프로세스) |
| runId | `2026-08-13_001` |

---

## 결론 (먼저)

**완주했다.** 성공 기준 4개 전부 충족. 최소 우회 4개 적용 (한도 5개 미만).

`git diff HEAD`가 보여주는 것:

```diff
diff --git a/src/math.js b/src/math.js
index f905649..3481d82 100644
--- a/src/math.js
+++ b/src/math.js
@@ -4,4 +4,8 @@ function add(a, b) {
   return a + b;
 }

-module.exports = { add };
+function subtract(a, b) {
+  return a - b;
+}
+
+module.exports = { add, subtract };
```

이 변경은 사람이 손으로 쓴 것이 아니라, 격리된 git worktree 안에서 에이전트가
만들고 → Harness가 관찰하고 → 검증 커맨드가 판정하고 → 사람이 승인하고 →
`codefleet apply`가 워크스페이스로 옮긴 것이다.

---

## fixture 구성

변수를 최소화하기 위해 새 저장소를 만들었다.

```
C:\cf-fixture\
  .gitignore        .codefleet/ 제외
  package.json      { "scripts": { "test": "node test/check.js" } }
  src\math.js       add()만 있음
  test\check.js     add() + subtract() 를 모두 단언
```

초기 커밋: `0aab88d fixture: add() only; check.js requires subtract() which does not exist yet`

**검증 커맨드가 대상 함수를 실제로 호출하는지 Task 작성 시점에 확인했다.**
`test/check.js`는 다음을 단언한다:

```js
assert.strictEqual(typeof math.subtract, "function", ...);
assert.strictEqual(math.subtract(5, 3), 2, ...);
assert.strictEqual(math.subtract(0, 4), -4, ...);
```

커밋 직후 실행 결과 (기준선):

```
$ node test/check.js
AssertionError [ERR_ASSERTION]: subtract must be exported as a function
exit=1
```

**검증이 통과하면 파일이 바뀐 것이다** — 그 역이 성립함을 실행으로 확인한 뒤 진행했다.

### Task

`.codefleet/tasks/add-subtract.yaml`

```yaml
id: add-subtract
title: "Add subtract() to src/math.js"
projectPath: "."
goal: "Add a subtract(a, b) function to src/math.js that returns a - b, and export it from the module."
agentRole: INFRA_OPERATOR        # ← 우회 1 참조
scope:
  include: ["src/**"]
  exclude: ["test/**"]           # 에이전트가 검증 파일을 고치지 못하게
verification:
  commands:
    - commandId: fixture-check
      command: ["node", "test/check.js"]
workflow: [IMPLEMENT]
```

---

## 단계별 실행 기록

| # | 커맨드 | 결과 |
| --- | --- | --- |
| 1 | `codefleet init` | 성공. `.codefleet/{config.json,local.json}` 생성 |
| 2 | (프로파일 수정) | — 아래 "설정 변경" 참조 |
| 3 | `codefleet status` | 성공. `harnessMode: COMMAND_EXEC / isolationMode: GIT_WORKTREE / agentAdapter: claude` |
| 4 | `codefleet task validate add-subtract` | 성공. `Task is valid` |
| 5 | `codefleet task approve add-subtract --reason ... --actor sol` | 성공. `mut_8d81ba090083d1b3` |
| 6 | `codefleet task status add-subtract` | `revision 1 APPROVED fbfcb67fd494 sol / executable: yes` |
| 7 | `codefleet objective create obj-001 --title ... --kind ONE_OFF` | 성공. `seq=1` |
| 8 | `codefleet objective attach obj-001 add-subtract` | 성공. `obj-001:add-subtract:1` |
| 9 | `codefleet objective next obj-001` | `next: obj-001:add-subtract:1 / taskRevision: 1` |
| 10 | `codefleet objective run-next obj-001` | **성공. `runId: 2026-08-13_001 / status: SUCCEEDED`** (실행 ~2분) |
| 11 | `codefleet review 2026-08-13_001 --decision ACCEPTED --reason ...` | **실패 (설계대로)** — 아래 참조 |
| 12 | 같은 커맨드 + `--waive-gap` + `--waive-reason` | 성공. `MIGRATION_READY_WAIVED` |
| 13 | `codefleet objective import-review obj-001 2026-08-13_001` | 성공. `mut_40893fbae872bb8a` |
| 14 | `codefleet apply 2026-08-13_001 --check` | **실패 — CLI 결함. 우회 4 참조** |
| 15 | `codefleet apply 2026-08-13_001 --reason ... --actor sol` | **성공. `applied 2026-08-13_001 to the workspace`** |
| 16 | `codefleet apply 2026-08-13_001` (재실행) | `already applied; no new ledger event appended` — 멱등성 확인 |

### 11번 — 게이트가 실제로 막은 지점

```
$ codefleet review 2026-08-13_001 --decision ACCEPTED --actor sol --reason "trial"
ACCEPTED local review is not allowed for 2026-08-13_001.
  - capability gap not waived: COMMAND_CHANNEL_NOT_HARNESS_VISIBLE
exit=1
```

**게이트를 끄지 않고, 입력을 게이트가 통과시킬 수 있는 형태로 고쳤다.**
`--waive-gap COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`에 실제로 확인한 내용을
justification으로 붙였다:

> "Agent-side commands are unobserved, but the only claim relied on is the
> harness-executed verification (node test/check.js, exit 0) and the
> harness-observed diff, both of which I read."

결과: `evidenceCompleteness: WAIVED_INCOMPLETE`, `bundleStatus: DEGRADED`.
**"완전한 증거"로 위장되지 않았다.** 이건 설계대로다.

### 14번 — 정확한 오류

```
$ codefleet apply 2026-08-13_001 --check
Unknown option for review: --check
exit=1
```

원인: `src/cli.ts:128`의 `parseReviewFlags(args.slice(1))`가 `src/cli.ts:133`의
`if (args.includes("--check"))` 분기보다 **먼저** 실행된다.
`parseReviewFlags`는 등록되지 않은 플래그를 만나면 `src/cli.ts:697`에서 throw한다.
`--check`는 플래그 테이블(`src/cli.ts:654-669`)에 없다.

→ `codefleet apply --check`는 **현재 어떤 인자 조합으로도 실행되지 않는다.**

---

## 설정 변경 (우회가 아님 — 일반 구성)

`codefleet init` 기본값은 `DRY_RUN` + `isolationMode: NONE` + `agentAdapter: codex`다.
이 조합으로는 어떤 실행도 일어나지 않으므로, 일반적인 프로파일 구성으로 다음을 바꿨다.
`.codefleet/config.json`:

| 키 | 기본값 | 설정값 |
| --- | --- | --- |
| `defaults.task.harnessMode` | `DRY_RUN` | `COMMAND_EXEC` |
| `defaults.run.isolationMode` | `NONE` | `GIT_WORKTREE` |
| `defaults.run.agentAdapter` | `codex` | `claude` |
| `policies.agentAdapters.allowedAdapters` | `["codex"]` | `["claude"]` |

`isolationMode: GIT_WORKTREE`는 선택이 아니었다. `requireIsolationForMutation`이
기본 `true`이고 이 Run은 파일을 편집하므로, `NONE`이면 Run Planning 단계에서 거부된다
(`src/isolation.ts:236-243`). 그리고 이 격리가 성공 기준 1번을 가능하게 하는 조건이다 —
`apply`는 `editsInWorkspace !== false`인 Run을 거부한다 (`src/apply.ts:167`).

---

## 적용한 최소 우회 — 전체 목록 (4개)

### 우회 1 — 역할을 `INFRA_OPERATOR`로 바꿨다 (P1-32)

- **무엇을**: Task의 `agentRole`을 `BACKEND_IMPLEMENTER`(의미상 맞는 역할) 대신
  `INFRA_OPERATOR`로 지정. `config.json`의 `defaults.task.agentRole`도 동일.
- **어디를**: `.codefleet/tasks/add-subtract.yaml`, `.codefleet/config.json`
- **왜**: Core 역할 7개 중 `BACKEND_IMPLEMENTER` / `BACKEND_REFACTORER` /
  `DOCS_WRITER`는 `defaultMaxMode: WORKSPACE_EDIT`, `BACKEND_REVIEWER` /
  `INFRA_DEBUGGER`는 `SUGGEST_ONLY`다 (`src/agent-role.ts:36-67`).
  `effectiveMode`가 `COMMAND_EXEC`에 못 미치면 `capabilities.commandExecution`이
  false가 되고 (`src/run.ts:648`), 어댑터가 실행 자체를 거부한다
  (`src/agent.ts:91-98`).
  `COMMAND_EXEC`가 상한인 Core 역할은 `INFRA_OPERATOR`와 `IAC_ENGINEER` 둘뿐이다.
  **애플리케이션 코드를 쓰는 역할은 하나도 그 안에 없다.**
  커스텀 역할도 답이 아니다 — 커스텀 역할은 base를 좁힐 수만 있어서
  (`src/agent-role.ts:135-140`) base가 결국 저 둘 중 하나여야 한다.
- **P1-32 등재 내용과의 차이**: 등재 시점의 증상("Run이 시작된 뒤 어댑터 stderr에서
  `LAUNCH_FAILED`")은 재현되지 않았다. 지금은 승인 시점에 이르게 거부된다.
  **남은 것은 등재된 잔여분 그대로다: `init` 기본값이 여전히 `BACKEND_IMPLEMENTER`이고,
  코드 작성 역할로는 검증 커맨드가 있는 Task를 실행할 방법이 없다.**

### 우회 2 — `allowDegradedCommandObservation: true`

- **무엇을**: `policies.harness.allowDegradedCommandObservation`을 `true`로.
- **어디를**: `.codefleet/config.json`
- **왜**: `HARNESS_VISIBLE_COMMAND_CHANNEL`이 상수 `false`이므로
  (`src/run.ts:1514`), `COMMAND_EXEC` Run은 Run Planning에서 무조건 차단된다
  (`src/run.ts:1516-1544`). 차단 메시지 자체가 이 플래그를 지시한다.
- **게이트 우회인가 — 아니다.** 이 플래그는 관찰 불가 사실을 *지우지* 않는다.
  `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`는 Run Summary의
  `normalization.unavailableReasons`에 남았고, 그 때문에 **11번에서 ACCEPTED가
  실제로 거부됐다.** 사람이 명시적으로 책임을 서명해야 통과했다.
  게이트는 켜진 채로 작동했다.

### 우회 3 — 어댑터 커맨드에 `--permission-mode acceptEdits` 추가

- **무엇을**: Local Overlay의 `adapterCommand.args`에
  `--permission-mode acceptEdits`를 덧붙임.
- **어디를**: `.codefleet/local.json`
- **왜**: `claude` 어댑터의 기본 인자는
  `["-p","--output-format","stream-json","--verbose"]`다 (`src/agent.ts:64`).
  이 조합으로 헤드리스 실행하면 내부 CLI의 `permissionMode`가 `default`가 되어
  **파일 편집 도구 호출이 전부 거부된다.** 즉 CodeFleet이 `fileEdit: true`로
  기동한 어댑터가 파일을 못 쓴다.
  `adapterCommand`는 `localPolicy.allowedLocalKeys`에 원래 들어 있는 키다.
- **부작용 주의**: 이건 *내부 에이전트 CLI*의 승인 모드이지 CodeFleet의 게이트가
  아니다. 그리고 그 편집은 격리된 worktree 안에서만 일어난다.
- **추가 관찰 (파이프라인 산출물 아님)**: 어댑터는 자식 프로세스에 `PATH`만 넘긴다
  (`src/agent.ts:439`, `src/run.ts:2648`). `HOME`/`USERPROFILE`이 없으므로
  `claude`가 `~`를 리터럴 디렉터리로 만든다. 동일 환경을 손으로 재현한 프로브에서
  `C:\cf-fixture\~\working-diary\`가 생겼다 (확인 후 삭제).
  **Run 안에서 worktree에도 같은 일이 있었는지는 확인 불가다** — 트리가 폐기됐고,
  scope가 `src/**`라 스냅샷에도 잡히지 않는다.

### 우회 4 — `apply --check`를 건너뛰었다

- **무엇을**: 14번 실패 후 미리보기를 생략하고 15번 실제 `apply`로 직행.
- **어디를**: 절차상 생략. 코드는 수정하지 않음. 결함 위치는 `src/cli.ts:128` / `:133` / `:654-669` / `:697`.
- **왜**: `--check`는 미리보기 전용이고, 실제 `apply`는 락 안에서 `planApply`를
  다시 호출하므로 (`src/apply.ts:267-271`) 같은 판정이 어차피 한 번 더 실행된다.
  게이트를 건너뛴 것이 아니다.

---

## 성공 기준 판정

### 기준 1 — git이 파이프라인을 통해 들어간 실제 파일 변경을 보여주는가

**충족.**

```
$ git -C C:\cf-fixture status --short
 M src/math.js

$ git -C C:\cf-fixture diff HEAD
diff --git a/src/math.js b/src/math.js
index f905649..3481d82 100644
--- a/src/math.js
+++ b/src/math.js
@@ -4,4 +4,8 @@ function add(a, b) {
   return a + b;
 }

-module.exports = { add };
+function subtract(a, b) {
+  return a - b;
+}
+
+module.exports = { add, subtract };
```

`apply` 직전 워크스페이스는 clean이었다 (15번 로그에 기록).
그리고 이 변경은 CodeFleet이 관찰한 패치와 **바이트 단위로 동일하다**:

```
$ diff .codefleet/runs/2026-08-13_001/git-diff.patch <(git diff HEAD)
IDENTICAL
```

적용 후 워크스페이스에서 검증 커맨드를 다시 돌린 결과:

```
$ node test/check.js
check.js: all assertions passed
exit=0
```

기준선(exit=1)과 대비된다.

> **P1-27은 이번 실행에서 재현되지 않았다.** 등재 당시 미설계였던 반영 경로는
> `src/apply.ts`(로드맵 S5-1)로 구현되어 있었고, 실제로 동작했다.
> 추가 구현은 필요하지 않았다.

### 기준 2 — 그 변경이 Run Trace의 taskId + taskRevision으로 역추적되는가

**충족.** 사슬 전체가 파일로 남아 있다.

Objective 원장 (`.codefleet/objectives/obj-001/ledger.jsonl`):

```
seq 2  TASK_ATTACHED       {"objectiveQueueItemId":"obj-001:add-subtract:1","taskId":"add-subtract","taskRevision":1,
                            "taskRevisionHash":"fbfcb67fd4941c3c1b71bb59bc91aa6caf2286951dc8d7068dfd27bc84e134d7"}
seq 3  RUN_REVIEW_DECIDED  {"reviewDecisionId":"2026-08-13_001-review-002","taskId":"add-subtract","taskRevision":1,
                            "runId":"2026-08-13_001","decision":"ACCEPTED","actorKind":"HUMAN","actorId":"sol"}
seq 4  RUN_RESULT_APPLIED  {"runId":"2026-08-13_001","taskId":"add-subtract","taskRevision":1,
                            "reviewDecisionId":"2026-08-13_001-review-002",
                            "patchRef":{"path":".codefleet/runs/2026-08-13_001/git-diff.patch",
                                        "hash":"7ee840706a78708ed4b527dd6d21fb688e9b5c2eee968be5102201c49595d0c8"}}
```

patchRef 해시가 실제 파일과 일치함을 재계산해 확인:

```
sha256(git-diff.patch) = 7ee840706a78708ed4b527dd6d21fb688e9b5c2eee968be5102201c49595d0c8
ledger patchRef.hash   = 7ee840706a78708ed4b527dd6d21fb688e9b5c2eee968be5102201c49595d0c8
match = true
```

Run Plan의 승인 기록:

```json
"approval": { "taskRevision": 1, "approvedBy": "sol",
              "revisionHash": "fbfcb67fd4941c3c1b71bb59bc91aa6caf2286951dc8d7068dfd27bc84e134d7",
              "approvalTargetHash": "afc542809e3515a2c990a8c87509ba817643f0ebfa8f11b4074052dc3b6dc77f" }
```

`revisionHash`가 seq 2의 `taskRevisionHash`와 같다. **워크스페이스의 diff →
patchRef 해시 → RUN_RESULT_APPLIED → runId → Run Plan → taskRevision 1의
승인 해시**까지 끊긴 곳이 없다.

### 기준 3 — Run Trace에 실제로 실행된 검증 커맨드의 이름이 문자열로 적혀 있는가

**충족.** grep 결과, `test/check.js`가 Run Trace의 9개 파일에 등장한다.

사람이 읽는 유일한 문서 `run-record.md`에서 (P1-35가 지적한 바로 그 파일):

```
## What was verified

observedCheck          : PASS
verificationGateResult : SATISFIED
verificationAuthority  : HARNESS_EXECUTED
attempts               : 1 executed of 1 recorded, 0 blocked

What the gate result above actually rests on:

fixture-check  PASS (exit 0)
  node test/check.js
```

`verification/verify-001.json`:

```json
{ "authority": "HARNESS_EXECUTED", "observedCheck": "PASS",
  "scanScope": { "attemptsRecorded": 1, "attemptsExecuted": 1, "attemptsBlocked": 0 },
  "attempts": [ { "commandId": "fixture-check", "command": ["node","test/check.js"],
                  "decision": "ALLOWED", "exitCode": 0, "result": "PASS" } ] }
```

실행 stdout도 캡처되어 있다
(`verification/verify-001/fixture-check.stdout.log`): `check.js: all assertions passed`

> **P1-35는 이번 실행에서 재현되지 않았다.** 로드맵 S6-3에서 이미 고쳐졌고,
> `run-record.md`가 커맨드 이름과 argv를 모두 적는다.

### 기준 4 — 승인을 건너뛰거나 게이트를 우회한 경로가 없는가

**충족.** 통과한 게이트와 그 근거:

| 게이트 | 상태 | 근거 |
| --- | --- | --- |
| Task 승인 | 통과 | `approvedRevision: 1`, `approvedBy: sol`, `approvalTargetHash` 기록 |
| Objective relation | 통과 | `TASK_ATTACHED` seq 2, revision 1로 핀 |
| 격리 강제 | 통과 | `requireIsolationForMutation: true`, `GIT_WORKTREE`, `unavailableReason: ""` |
| 커맨드 채널 | **작동함** | `allowDegradedCommandObservation: true`로 계획은 통과했으나, `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`가 산출물에 남아 리뷰에서 거부를 일으킴 |
| resultReview | 통과 | `required: true, allowedActors: ["HUMAN"]`, `actorKind: HUMAN`, `actorId: sol` |
| verification | 통과 | `required: true`, waiver `allowed: false` — **면제 없이 실제 PASS로 통과** |
| 증거 완전성 | **막았다가 통과** | 무면제 ACCEPTED가 exit=1로 거부됨 → 명시적 waiver + justification으로만 통과 |
| autoAdvanceOnDone | `false` | 큐가 자동 진행하지 않음. run-next가 1건만 실행하고 멈춤 |
| apply 전제조건 | 통과 | `editsInWorkspace: false` 확인, `git apply --check` 선행, 재실행 시 멱등 |

**우회에 쓰지 않은 것들**: `--force` 계열 플래그 없음, `SYSTEM_POLICY` actorKind
사용 안 함(HUMAN만), `requiredGates` 무력화 없음, `verification.waiver` 사용 안 함
(검증은 실제로 통과했다), CodeFleet 소스 수정 0줄 (`git status` clean).

---

## 자체 반증 — 완주가 아닐 가능성 점검

| 점검 | 결과 |
| --- | --- |
| 워크스페이스 diff를 실제로 출력했는가 | 예. 위 기준 1. 변경 있음 |
| 그 diff가 Harness가 관찰한 패치와 같은가 | 예. `diff` 결과 IDENTICAL |
| 검증이 파일 변경 없이도 통과할 수 있는가 | **아니오.** 커밋 직후 기준선에서 exit=1로 실패함을 실행으로 확인 |
| Run Trace에 검증 커맨드 이름이 있는가 (grep) | 예. 9개 파일. `run-record.md` 포함 |
| 격리 worktree는 어떻게 처분됐는가 | **완전 폐기.** 아래 참조 |
| 게이트가 형식적으로만 켜져 있었는가 | 아니오. ACCEPTED가 실제로 exit=1로 거부됐다 |

### worktree 처분

`harness-observation.json`:

```json
"isolation": {
  "mode": "GIT_WORKTREE",
  "isolatedPath": "C:\\Users\\...\\Temp\\codefleet-worktree-czdD20\\2026-08-13_001",
  "editsInWorkspace": false,
  "discarded": true,
  "unavailableReason": "",
  "detail": "removed the worktree at C:\\Users\\...\\Temp\\codefleet-worktree-czdD20\\2026-08-13_001"
}
```

디스크와 git 등록 양쪽에서 확인:

```
$ ls -d .../Temp/codefleet-worktree-czdD20
ls: No such file or directory

$ git -C C:\cf-fixture worktree list
C:/cf-fixture  0aab88d [master]      # 워크스페이스 하나뿐
```

**변경은 트리가 사라진 뒤에도 남았다.** 남은 이유는 `git-diff.patch`가 증거로
보존되고 `apply`가 그것을 워크스페이스에 재적용했기 때문이다. 이게 설계 의도대로
동작한 실물이다.

---

## 완주 후 남는 것 (다음 세션용)

이번 실행이 새로 드러낸 것, 또는 등재분의 현재 상태:

1. **`codefleet apply --check`가 실행 불가** (신규). `src/cli.ts:128`이 `:133`보다
   먼저 실행되고 `--check`가 플래그 테이블에 없다. 수정 범위 추정: 인자 파싱 순서
   교체 또는 `--check`를 `parseReviewFlags`에 무값 플래그로 등록 — **2~5줄.**
2. **P1-32 잔여 확인됨**. 코드 작성 역할(`BACKEND_IMPLEMENTER` 등 5개)로는 검증
   커맨드가 있는 Task를 실행할 수 없다. `init` 기본값도 그중 하나다.
   이번엔 역할을 `INFRA_OPERATOR`로 바꿔 우회했다 — **의미상 틀린 역할로
   백엔드 코드를 쓴 것이고, 이건 등재된 결함의 실물이다.**
3. **`claude` 어댑터 기본 인자로는 파일을 못 쓴다** (신규). `src/agent.ts:64`의
   기본 args에 승인 모드가 없어, `fileEdit: true`로 기동한 어댑터가 편집을 거부당한다.
   Local Overlay로 우회 가능하지만 **기본값 그대로는 `claude` 어댑터가 무력하다.**
   수정 범위 추정: 기본 args 조정 또는 capabilities → CLI 플래그 매핑 — **어댑터 spec 한 곳.**
4. **자식 프로세스 환경이 `PATH`뿐이라 `HOME`/`USERPROFILE`이 없다** (관찰).
   `claude`가 `~`를 리터럴 디렉터리로 만든다. 동일 환경 프로브에서 재현.
   Run 내부 발생 여부는 트리 폐기로 확인 불가.
   `src/agent.ts:351-360`의 `gitProcessEnv()`가 이미 `GIT_HOME_ENV`를 넘기는데,
   어댑터·검증 자식은 그 함수를 쓰지 않는다.
5. **P1-27, P1-35는 재현되지 않았다.** 각각 `src/apply.ts`, `run-record.ts`에서
   이미 해소된 상태였고, 이번 완주로 실사용에서 확인됐다.
