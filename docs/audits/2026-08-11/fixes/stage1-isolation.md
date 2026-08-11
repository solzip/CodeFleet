# 1단계 수정 — 격리를 켜도 안전하게 (P0-7 · P0-8 · P0-4 잔여)

```text
수정 일시   : 2026-08-11
대상 커밋   : 754acea73f15729a100e3102e0ff7c5b47869902 (수정 전 HEAD, 작업 트리 = HEAD)
근거 문서   : docs/audits/2026-08-11/04-p0-4-isolation.md
             docs/audits/2026-08-11/07-new-defects.md (P0-7, P0-8)
범위        : "격리를 켜도 안전하다"까지. P0-9 · P0-10 · P0-1 잔여 · P1 전부는 손대지 않았다.
측정 근거   : npm test — 수정 전 199 pass / 0 fail
                        수정 후 201 pass / 0 fail (신규 2건)
             coverage — 63.3% (345/545), 수정 전후 동일. 이 슬라이스는 FINAL RULE
                        조건을 새로 덮지 않으므로 클레임을 추가하지 않았다.
```

---

## 1. 실패 테스트가 먼저

`test/isolation.test.ts:281-450`에 종단 테스트 2건을 먼저 작성했다. 픽스처(`test/profile-fixture.ts`)는 **고치지 않았다.** 기존 테스트는 여전히 `isolationMode: NONE` + `requireIsolationForMutation: false`로 돌고, 새 테스트만 프로파일에서 `GIT_WORKTREE`와 `requireIsolationForMutation: true`를 명시한다.

### 1-1. 수정 전 실패 출력 — `node --test test/isolation.test.ts`

```
✔ the adapter process has a time limit and is killed when it exceeds it (418.8774ms)
✔ output is capped, and the dropped bytes are counted rather than silently lost (53.448ms)
✔ the child does not inherit the parent environment (100.0685ms)
✔ a git worktree isolates the Run, and discarding it removes the edits (335.561ms)
✔ a mode that cannot be provided is reported, never silently downgraded (57.8368ms)
✔ requireIsolationForMutation is read, and it blocks rather than warning (31.9216ms)
✔ an editing Run with the flag on and no isolation is refused before it starts (327.0501ms)
✖ an isolated Run observes the tree the agent actually ran in (777.031ms)
✔ a queue decision blocks the Run, and an unattached Task is not blocked (532.5248ms)
ℹ tests 9
ℹ pass 8
ℹ fail 1

✖ failing tests:

test at test\isolation.test.ts:314:1
✖ an isolated Run observes the tree the agent actually ran in (777.031ms)
  AssertionError [ERR_ASSERTION]: changedFiles must contain the agent's edit, got []
      at TestContext.<anonymous> (.../test/isolation.test.ts:327:10)
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
```

### 1-2. 수정 전 전체 상태

`assert`는 첫 실패에서 멈추므로 나머지 항목이 어떤 값이었는지 위 출력만으로는 알 수 없다. 같은 픽스처를 스크립트로 한 번 더 돌려 네 항목을 전부 기록했다.

```
1 changedFiles                  : []
  workspaceDelta.modified       : []
2 pathViolations                : []
3 observedCheck                 : FAIL
  verificationGateResult        : NOT_SATISFIED / FAILED
4 workspace src/app.js untouched: true
  out-of-scope file leaked      : false
5 git worktree list entries     : 2
     <tmp>/codefleet-wt-run-8Ehtu9                     671f3b2 [master]
     <tmp>/codefleet-worktree-m7fk95/2026-08-11_001    671f3b2 (detached HEAD)
  run-plan.isolation            : {"mode":"GIT_WORKTREE","reason":"PROFILE_DEFAULT"}
  observation.workingDirRealPath: <tmp>/codefleet-wt-run-8Ehtu9      ← 워크스페이스
  observation.workspace.isolation: null
  run-record mentions GIT_WORKTREE: false
  run-record mentions non-application: false
```

에이전트는 `src/app.js`를 고치고 `outside-the-scope.txt`를 만들었는데 관측은 전부 0건이고, Run이 끝난 뒤 worktree가 등록된 채 남아 있다. 07-new-defects.md의 재현과 일치한다.

### 1-3. 수정 후 같은 픽스처

```
1 changedFiles                  : ["outside-the-scope.txt","src/app.js"]
  workspaceDelta.modified       : ["src/app.js"]
2 pathViolations                : [{"path":"outside-the-scope.txt","violationCode":"PATH_OUTSIDE_ALLOWED_PATHS","matchedPattern":""}]
3 observedCheck                 : PASS
  verificationGateResult        : SATISFIED / PASS
4 workspace src/app.js untouched: true
  out-of-scope file leaked      : false
5 git worktree list entries     : 1
     <tmp>/codefleet-wt-run-vOa6QE    6d4fabe [master]
  run-plan.isolation            : {"mode":"GIT_WORKTREE","reason":"PROFILE_DEFAULT",
                                   "isolatedPath":"<tmp>/codefleet-worktree-UD3fSe/2026-08-11_001",
                                   "treeRoot":"...","unavailableReason":"","detail":"git worktree at ..."}
  observation.workingDirRealPath: <tmp>/codefleet-worktree-UD3fSe/2026-08-11_001   ← 격리 트리
  observation.workspace.isolation: {"mode":"GIT_WORKTREE","isolatedPath":"...","treeRoot":"...",
                                    "editsInWorkspace":false,"modeUnavailableReason":"",
                                    "discarded":true,"unavailableReason":"","detail":"removed the worktree at ..."}
  run-record mentions GIT_WORKTREE: true
  run-record mentions non-application: true
```

봉쇄(4번)는 수정 전후 모두 유지된다. 달라진 것은 **관측이 봉쇄된 트리를 따라간다**는 점이다.

---

## 2. P0-7 표의 지점별 수정 여부

`07-new-defects.md` P0-7 근거 표의 행 각각에 대한 결과다. 표의 7행 중 이미 격리 트리를 쓰던 1행(에이전트)을 뺀 **6행 전부**를 옮겼다.

| 07-new-defects.md의 지점 | 대상 | 수정 전 | 수정 후 | 현재 위치 |
|---|---|---|---|---|
| `src/run.ts:662-672` | PRE_RUN 스냅샷 | `projectPath` | **`observedPath`** | `run.ts:717` |
| `src/run.ts:695` | 에이전트 실행 | `prepared.workPath` | `observedPath` (같은 값, 이름만 통일) | `run.ts:735` |
| `src/run.ts:708` | `captureGitDiff` | `projectPath` | **`observedPath`** | `run.ts:748` |
| `src/run.ts:713` | `captureGitChangedFiles` | `projectPath` | **`observedPath`** | `run.ts:753` |
| `src/run.ts:715-725` | POST_RUN 스냅샷 | `projectPath` | **`observedPath`** | `run.ts:756` |
| `src/run.ts:762-770` | `evaluatePathPolicy` 입력 전부 | `projectPath` | **`observedPath`** (3개 헬퍼 모두) | `run.ts:807-809` |
| `src/run.ts:787-798` | 검증 커맨드 실행 | `projectPath` | **`observedPath`** | `run.ts:833` |

`evaluatePathPolicy` 입력 3개를 개별로 적으면:

| 헬퍼 | 수정 후 |
|---|---|
| `detectCaseSensitivity` | `run.ts:807` `observedPath` |
| `findEscapingSymlinks` | `run.ts:808` `observedPath` |
| `findNestedRepositories` | `run.ts:809` `observedPath` |

`observedPath`(`run.ts:710`)는 `prepared.workPath` 하나에서만 나오는 지역 상수다. 지점마다 개별 판단을 남기지 않으려고 이름을 하나로 묶었다 — 다음에 관측 지점이 추가될 때 `projectPath`를 쓰면 눈에 띈다.

**남은 `projectPath` 사용처**(옮기지 않은 것이 맞는 지점):

| 위치 | 용도 | 옮기지 않은 이유 |
|---|---|---|
| `run.ts:424` | `resolveWorkspaceProjectPath` 결과 | 격리의 입력. 워크스페이스 안의 작업 위치를 정하는 값이고, 격리 트리는 여기서 파생된다 |
| `run.ts:640` | `prepareIsolation`의 인자 | 같은 이유 |
| `run.ts:875` | `harnessObservation.workspace.workspaceRealPath` (신설) | 워크스페이스가 어디였는지는 기록되어야 한다. 관측 대상이 아니라 대조 대상 |
| `run.ts:886` | `editsInWorkspace: prepared.workPath === projectPath` | 편집이 워크스페이스에 있는지를 **파생**으로 판정한다 |

### 2-1. 하위 디렉터리 Task — 표에 없던 재발 경로

표의 7행을 그대로 `prepared.workPath`로 바꾸면 `task.projectPath`가 하위 디렉터리일 때 P0-7이 형태를 바꿔 재발한다. `git worktree add`는 **저장소 전체**를 체크아웃하므로 트리 루트는 `projectPath`의 대응점이 아니다. `projectPath`가 `services/api`면 관측이 트리 루트(저장소 루트)를 보게 되어, 다시 "에이전트가 일한 곳이 아닌 트리"를 관측한다.

그래서 `PreparedIsolation`을 두 값으로 나눴다 (`src/isolation.ts:32-45`):

- `workPath` — 격리 트리 안에서 `projectPath`에 대응하는 경로. 에이전트가 돌고 증거를 모으는 곳.
- `treeRoot` — 격리 트리 자체. 폐기와 기록의 대상.

대응 경로는 `git rev-parse --show-prefix`로 git에게 물어 계산한다(`src/isolation.ts:79-92`). 이 프로세스가 두 경로를 직접 정규화해 비교하지 않는 이유는 Windows에서 워크스페이스 경로와 git의 top level이 대소문자·단축 이름 형태로 다를 수 있고, 그 차이가 곧 "엉뚱한 서브트리 관측"이 되기 때문이다.

`projectPath: services/api`로 실측한 결과:

```
run-plan.isolation.isolatedPath : <tmp>/codefleet-worktree-4F61kW/2026-08-11_001/services/api
observation.workingDirRealPath  : <tmp>/codefleet-worktree-4F61kW/2026-08-11_001/services/api
verificationGateResult          : SATISFIED / PASS
git worktree list entries       : 1
```

---

## 3. 폐기 (P0-8)

### 3-1. 호출 지점

| 경로 | 위치 | 동작 |
|---|---|---|
| 격리 요구 위반으로 Run Planning 거부 | `src/run.ts:648-656` | 폐기 후 throw. 폐기가 실패하면 그 사유를 예외 메시지에 붙인다 |
| 정상 종료 | `src/run.ts:857` | 증거 수집이 끝난 직후. 결과를 산출물에 기록한다 |
| 그 외 모든 throw | `src/run.ts:288-296` `runTask`의 `finally` | 안전망. `executeRun`이 트리를 만든 순간 `isolationHandle`에 넘기므로, 그 아래 어디서 던져도 해제된다 |

`finally`를 `runTask`에 둔 이유: 락 해제와 같은 곳에서 같은 규율로 처리하기 위해서다. 정상 경로에서 이미 폐기됐으면 두 번째 호출은 memoise된 결과를 돌려준다(`src/isolation.ts:120-124`).

### 3-2. 반환 코드 확인

`discard`가 `void` 대신 `DiscardOutcome`을 돌려준다(`src/isolation.ts:26-30`). `git worktree remove`의 exit code와 `rm`의 예외를 모두 확인하고, 실패 시 `ISOLATION_DISCARD_FAILED` + 상세를 채운다(`src/isolation.ts:125-152`).

이 실패 경로가 실제로 발동하는지 테스트로 고정했다 — `test/isolation.test.ts:417-450`:

```
discard after the tree is already gone : {"discarded":false,"unavailableReason":"ISOLATION_DISCARD_FAILED",
                                         "detail":"<tmp>/\r1: fatal: '<tmp>/\r1' is not a working tree"}
second call is memoised, same outcome  : true
normal discard                         : {"discarded":true,"unavailableReason":"","detail":"removed the worktree at ..."}
NONE discard                           : {"discarded":false,"unavailableReason":"","detail":"no isolated tree to discard"}
```

`NONE`이 `discarded: false`인 것은 의도다. 격리한 것이 없으니 제거한 것도 없고, `true`로 적으면 일어나지 않은 롤백을 주장하게 된다.

폐기 실패는 `harnessObservation.workspace.isolation.unavailableReason`에 실리고, `runSummaryUnavailableReasons`(`src/run.ts:1215-1218`)가 그것을 집어 리뷰 번들까지 올린다. 트리가 남아 있다는 사실이 산출물 한 필드에 갇히지 않는다.

### 3-3. worktree 경로 기록

`prepareIsolation` 호출을 Run Plan **작성 전**으로 옮겼다(`src/run.ts:634-656`). 이전에는 계획을 쓴 뒤에 트리를 만들어서 계획이 모드만 알고 경로는 몰랐다. 옮긴 자리는 거부 가능성이 있는 검사(역할·게이트·어댑터·격리 모드)가 전부 끝난 직후이므로, 시작하지 못할 Run 때문에 트리가 만들어지지는 않는다.

`run-plan.json`의 `isolation` 블록(`src/run.ts:645-655`):

```json
{
  "mode": "GIT_WORKTREE",
  "reason": "PROFILE_DEFAULT",
  "isolatedPath": "...\\codefleet-worktree-UD3fSe\\2026-08-11_001",
  "treeRoot": "...\\codefleet-worktree-UD3fSe\\2026-08-11_001",
  "unavailableReason": "",
  "detail": "git worktree at ..."
}
```

---

## 4. ACCEPTED 반영 — 구현하지 않고 명시만

지시대로 반영 경로는 만들지 않았다. run-record.md에 "Where this Run ran" 절을 추가해(`src/run-record.ts:66-101`) 자동 반영이 없다는 사실을 적는 것까지만 했다.

수정 후 실제 출력:

```
## Where this Run ran

This Run was isolated (GIT_WORKTREE). Everything reported below was
observed in the isolated tree, not in the workspace:

```text
isolated tree : <tmp>/codefleet-worktree-CHu0tY\2026-08-11_001
```

The edits made there are **not applied to the workspace**, by this Run or by
accepting it. Bringing them back is a manual step CodeFleet does not perform.

The tree was discarded when the Run finished, so those edits are gone.
```

이 절은 "What changed" **앞**에 온다. 뒤에 두면 독자가 `modified src/app.js`를 자기 파일로 읽은 뒤에야 아니라는 걸 알게 된다.

절의 조건은 모드가 아니라 `editsInWorkspace === false`다(`src/run-record.ts:71`). `GIT_WORKTREE`를 요청했으나 제공되지 못하고 `requireIsolationForMutation: false`로 그대로 진행한 Run은 편집이 워크스페이스에 있으므로, 모드로 판정하면 일어나지 않은 분리를 설명하게 된다.

---

## 5. 변경 파일

```
 src/isolation.ts       | 133 ++++++++++++++++++++++++++-----
 src/run-record.ts      |  40 ++++++++++
 src/run.ts             | 124 ++++++++++++++++++++++-------
 test/isolation.test.ts | 206 ++++++++++++++++++++++++++++++++++++++++++++++++-
 4 files changed, 458 insertions(+), 45 deletions(-)
```

| 파일 | 변경 요지 |
|---|---|
| `src/isolation.ts` | `PreparedIsolation`에 `treeRoot` 추가, `workPath`의 의미를 "격리 트리 안의 projectPath 대응점"으로 확정. `repositoryPrefix` 신설. `discard`가 `DiscardOutcome`을 반환하고 exit code를 확인하며 memoise. `run()`이 stdout도 수집 |
| `src/run.ts` | `prepareIsolation`을 Run Plan 작성 전으로 이동. `observedPath` 도입과 관측 지점 6곳 전환. Run Plan `isolation`에 경로 기록. 증거 수집 직후 폐기 + 결과 기록. `runTask`에 `isolationHandle` `finally`. `harnessObservation.workspace`에 `isolation` / `workspaceRealPath`. 폐기 실패를 `runSummaryUnavailableReasons`로 승격 |
| `src/run-record.ts` | "Where this Run ran" 절 추가 |
| `test/isolation.test.ts` | 종단 테스트 1건 + 폐기 실패·memoise 테스트 1건 추가. 기존 7건은 변경 없음 |

`test/profile-fixture.ts`는 **변경하지 않았다.** 기존 NONE 픽스처 테스트도 전부 그대로다.

**테스트 결과**: 201 tests, 201 pass, 0 fail. 수정 전 199 + 신규 2.

작업 트리의 줄바꿈은 네 파일 모두 CRLF로 균일하다(수정하지 않은 `src/agent.ts`와 동일). `.gitattributes`가 인덱스에서 LF로 정규화하므로 `git diff --stat`의 CRLF 경고는 기존과 같은 상태이고, 파일 안에서 섞이지 않았다.

---

## 6. 수정 중 발견했으나 고치지 않은 것

### 6-1. 스위트 자체 검사가 먼저 걸렸다

첫 통과 시도에서 `test/fixtures.test.ts:55`가 실패했다.

```
✖ every runTask call in the suite either approves first or asserts the refusal
  AssertionError: 44 !== 45
```

승인을 헬퍼 함수 안에 넣었더니 "`runTask` 호출 앞에 승인이 보이지 않는다"로 잡혔다. 검사가 정확했으므로 테스트 쪽을 고쳤다 — 승인을 테스트 본문으로 올렸다(`test/isolation.test.ts:394-400`). 검사기를 넓히지 않았다.

### 6-2. 하위 디렉터리 Task에서 경로 기준이 어긋난다 — 이번 슬라이스 밖

§2-1의 하위 디렉터리 실측에서 별개의 결함이 보였다.

```
changedFiles            : ["services/api/outside-the-scope.txt","services/api/src/app.js"]
workspaceDelta.modified : ["src/app.js"]
pathViolations          : services/api/outside-the-scope.txt  PATH_OUTSIDE_ALLOWED_PATHS
                          services/api/src/app.js             PATH_OUTSIDE_ALLOWED_PATHS
```

`git status --porcelain`은 **저장소 루트** 기준 경로를 내는데, Task scope(`src/**`)와 스냅샷 델타는 **projectPath** 기준이다. 그래서 범위 안의 `src/app.js`까지 범위 밖으로 판정된다.

**이 결함은 격리와 무관하고 이번 수정이 만든 것도 아니다.** 같은 픽스처를 `isolationMode: NONE`으로 돌려 확인했다:

```
changedFiles   : ["services/api/outside-the-scope.txt","services/api/src/app.js"]
pathViolations : (동일하게 2건)
```

`projectPath: "."`가 아닌 Task 전부에 해당한다. 다만 방향이 fail-closed다 — 범위 안 파일을 위반으로 **과다** 보고하므로 잘못된 수락으로 이어지지 않고 ACCEPTED를 막는다. 그래서 P0가 아니라 P1로 본다. 이번 슬라이스 범위("격리를 켜도 안전하다") 밖이므로 고치지 않았고, 여기에 기록만 남긴다. 등재 번호는 다음 감사에서 결정하는 것이 맞다.

### 6-3. 손대지 않은 것 (지시된 범위 밖)

| 항목 | 상태 |
|---|---|
| P0-9 큐 게이트 fail-open | 그대로. `run.ts`의 `blockedQueueReason` 미변경 |
| P0-10 `runProcess` 경계 | 그대로. timeout·출력 상한·env 없음 |
| P0-1 잔여 (에이전트 명령 preflight, `isolation.ts`의 env) | 그대로 |
| REJECTED가 트리를 폐기 | 해당 없음. 이제 Run 종료 시 폐기되므로 리뷰 시점에 트리가 없다. 리뷰까지 트리를 보존하는 설계는 반영 경로 결정과 함께 다뤄야 한다 |
| 요청한 격리 모드를 얻지 못한 Run을 리뷰에 gap으로 올리기 | 하지 않았다. `run-plan.isolation.unavailableReason`과 `observation...modeUnavailableReason`에 기록은 되지만 `unavailableReasons`로 승격하지 않았다. 기본값에서는 `checkIsolationRequirement`가 이미 차단하므로 게이트 동작을 이 슬라이스에서 바꾸지 않는 쪽을 택했다 |
