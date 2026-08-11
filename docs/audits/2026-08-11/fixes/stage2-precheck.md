# 2단계 착수 전 게이트 — 1단계 재검증

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902 + 커밋되지 않은 1단계 수정
             (src/isolation.ts, src/run.ts, src/run-record.ts, test/isolation.test.ts)
             1단계는 아직 커밋되지 않았다. git status: 위 4개 M + docs/audits/2026-08-11/ 미추적
점검 방법   : 1단계 완료 보고를 근거로 쓰지 않고, 명령 출력과 실측으로만 판정했다
```

## 게이트 판정: **불통과 — 5항목 중 1항목 실패**

| # | 확인 항목 | 판정 |
|---|---|---|
| 1 | `npm test` 201/201 통과 | **통과** |
| 2 | 증거 수집이 `observedPath` 경유, `projectPath` 직접 참조가 기록된 예외 4곳뿐 | **통과** |
| 3 | GIT_WORKTREE 종단 테스트가 4개 항목을 실제로 assert | **통과** |
| 4 | discard 실패가 리뷰 번들까지 올라가는 **테스트의 실재** | **실패 — 그런 테스트가 없다** |
| 5 | (등재 전용, 차단 아님) 폐기 후 diff 아티팩트가 생성·삭제를 포함하는가 | **생성 미포함 — 결함 등재** |

지시에 따라 **2단계 수정에 착수하지 않았다.** 코드는 한 줄도 건드리지 않았고, SUMMARY.md의 P1-18 등재도 보류했다.

---

## 1. `npm test` — 통과

```
ℹ tests 201
ℹ pass 201
ℹ fail 0
```

coverage는 63.3% (345/545)로 1단계 전후 동일하다.

---

## 2. `observedPath` 경유 여부 — 통과

`src/run.ts`의 `projectPath` 전수 grep 결과를 분류했다. 문자열 `projectPath`는 33곳에서 나오지만, **`executeRun` 안의 지역변수 `projectPath`를 읽는 곳은 4곳**이고 1단계 기록의 예외 목록과 정확히 일치한다.

| 위치 | 용도 | 기록된 예외인가 |
|---|---|---|
| `run.ts:438` | `resolveWorkspaceProjectPath` 결과 (정의) | 예 |
| `run.ts:571` | `prepareIsolation`의 입력 | 예 |
| `run.ts:875` | `workspace.workspaceRealPath` (대조용 기록) | 예 |
| `run.ts:886` | `editsInWorkspace: prepared.workPath === projectPath` (파생 판정) | 예 |

나머지 29곳은 지역변수가 아니다:

| 분류 | 개수 | 예 |
|---|---|---|
| `task.projectPath` — Task가 선언한 상대 경로 | 6 | `run.ts:507, 683, 724, 763, 840, 870` (cwdRef / workingDirectoryRef) |
| 헬퍼 함수의 **파라미터 이름** | 15 | `findEscapingSymlinks`, `findNestedRepositories`, `detectCaseSensitivity`, `captureGitDiff`, `captureGitChangedFiles`, `runVerificationCommands`의 `input.projectPath`, `resolveWorkspaceProjectPath` |
| 주석 | 2 | `run.ts:353, 705` |
| 관측 지점이 `observedPath`를 넘기는 자리 | 6 | 아래 |

관측 지점 6곳은 전부 `observedPath`를 넘긴다:

```
717:    projectPath: observedPath,          PRE_RUN 스냅샷
735:    projectPath: observedPath,          어댑터
748:  const diffEvidence = await captureGitDiff(observedPath);
753:  const changedFilesEvidence = await captureGitChangedFiles(observedPath);
756:    projectPath: observedPath,          POST_RUN 스냅샷
807:        caseSensitive: await detectCaseSensitivity(observedPath),
808:        symlinkEscapes: await findEscapingSymlinks(observedPath, ...),
809:        nestedRepoPaths: await findNestedRepositories(observedPath)
833:    projectPath: observedPath,          검증 커맨드
```

`observedPath`는 `run.ts:710`에서 `prepared.workPath` 하나로부터만 정의된다. 헬퍼 내부는 파라미터를 쓰므로 호출부만 보면 되고, 호출부는 위가 전부다.

---

## 3. 종단 테스트의 4개 assert — 통과

`test/isolation.test.ts`의 "an isolated Run observes the tree the agent actually ran in"이 요구된 4항목을 실제로 assert한다.

| 요구 항목 | assert 위치 | 형태 |
|---|---|---|
| `changedFiles` 비어 있지 않음 | 테스트 내 +22 | `assert.ok(changedFiles.includes("src/app.js"), ...)` — 존재만이 아니라 **에이전트가 고친 그 파일**을 요구 |
| `pathViolations` 기록 | +33 | `assert.deepEqual(violations.map(...), [["outside-the-scope.txt","PATH_OUTSIDE_ALLOWED_PATHS"]])` — 정확히 1건, 정확한 코드 |
| `verificationGate` SATISFIED | +42 | `observedCheck === "PASS"` + `verificationGateResult === "SATISFIED"` 두 개 |
| worktree 잔존 0 | +63 | `git worktree list` 출력 라인 수 `=== 1` (워크스페이스 자신만) |

추가로 봉쇄 유지(+50), Run Plan의 `isolatedPath` 기록과 실제 삭제(+67), 관측 경로 일치(+71), run-record 문구(+77)까지 고정한다. 픽스처(`test/profile-fixture.ts`)는 변경되지 않았고 새 테스트만 프로파일에서 `GIT_WORKTREE`를 명시한다 — 확인함.

---

## 4. discard 실패 → 리뷰 번들 테스트 — **실패**

### 사실

`ISOLATION_DISCARD_FAILED` 전수 grep (src/ + test/):

```
src/isolation.ts:177:            unavailableReason: "ISOLATION_DISCARD_FAILED",
src/isolation.ts:187:            unavailableReason: "ISOLATION_DISCARD_FAILED",
test/isolation.test.ts:399:  assert.equal(failed.unavailableReason, "ISOLATION_DISCARD_FAILED");
```

테스트는 1건뿐이고, 그 assert의 대상은 `prepareIsolation(...).discard()`가 **반환한 객체**다. 그 테스트는 Run을 돌리지 않고, `harnessObservation`을 만들지 않고, 리뷰 번들을 만들지 않는다.

즉 `run.ts:857`(폐기 호출) → `run.ts:881-891`(관측에 기록) → `run.ts:1215-1218`(`runSummaryUnavailableReasons`로 승격) → 리뷰 번들 구간을 덮는 테스트가 **없다.**

1단계 기록(`stage1-isolation.md` §3-2)은 이 구간을 코드 사실로 서술했고 테스트가 있다고는 쓰지 않았다. 따라서 보고에 허위는 없다. 그러나 이 게이트 항목이 요구한 것은 **테스트의 실재**이고, 그것은 없다. 재감사가 P0마다 적용한 (B) 기준 — "결함을 재현하려다 실패하는 테스트가 존재하고 npm test에서 통과하는가" — 을 이 경로에 적용하면 [부분해소]에 해당한다.

### 코드 경로 자체는 동작한다 (실측)

"테스트가 없다"와 "깨져 있다"는 다른 사실이므로 분리해서 측정했다. 에이전트가 worktree 안의 파일에 핸들을 연 채 살아남는 detached 프로세스를 남기게 해서 실제 폐기 실패를 만들었다.

```
observation.workspace.isolation : {"mode":"GIT_WORKTREE", ..., "discarded":false,
                                   "unavailableReason":"ISOLATION_DISCARD_FAILED",
                                   "detail":"...: error: failed to delete '...': Permission denied"}
runSummary unavailableReasons   : ["COMMAND_CHANNEL_NOT_HARNESS_VISIBLE","ISOLATION_DISCARD_FAILED",
                                   "PROVIDER_TRANSCRIPT_NOT_STRUCTURED"]
normalization.status            : PARTIAL
bundle.unavailableReasons       : ["COMMAND_CHANNEL_NOT_HARNESS_VISIBLE","ISOLATION_DISCARD_FAILED",
                                   "PROVIDER_TRANSCRIPT_NOT_STRUCTURED"]
bundle capabilityGaps/defects   : 3 / 0
ACCEPTED without waiver         : blocked -> capability gap not waived: ISOLATION_DISCARD_FAILED
run-record names the failure    : true
```

정리: **경로는 리뷰 번들까지 정확히 도달하고, waiver 없는 ACCEPTED를 막는다.** 분류는 `CAPABILITY_GAP`이므로 사람이 사유를 적고 waive할 수는 있다 — 트리가 남았다는 사실은 사람이 확인·처리할 수 있는 종류이므로 이 분류는 타당해 보인다.

**따라서 이 항목의 결함은 "구현 부재"가 아니라 "회귀 방어 부재"다.** 위 실측은 스크립트 1회 실행이고 스위트에 남지 않으므로, 누가 `run.ts:1215-1218`을 지우면 아무 테스트도 실패하지 않는다.

---

## 5. 폐기 후 diff 아티팩트 — 생성 파일이 빠진다 (등재)

지시대로 차단 사유로 쓰지 않고 등재만 한다.

에이전트가 한 Run에서 세 가지를 하게 했다: 추적 파일 수정, 추적 파일 삭제, 새 파일 생성. `isolationMode: GIT_WORKTREE`.

```
changedFiles            : ["src/app.js","src/brand-new.js","src/doomed.js"]
workspaceDelta added    : ["src/brand-new.js"]
workspaceDelta modified : ["src/app.js"]
workspaceDelta removed  : ["src/doomed.js"]

--- git-diff.patch ---
diff --git a/src/app.js b/src/app.js
index 3d6576e..f5c37c3 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1 +1 @@
-export const ok = true;
+export const ok = 2;
diff --git a/src/doomed.js b/src/doomed.js
deleted file mode 100644
index d471050..0000000
--- a/src/doomed.js
+++ /dev/null
@@ -1 +0,0 @@
-export const gone = 1;

  modification src/app.js      : true
  deletion     src/doomed.js   : true
  creation     src/brand-new.js: false      ← 없다
tree still on disk?            : false
```

원인은 `src/run.ts:1967`의 명령 자체다:

```ts
runProcess("git", ["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--", "."], projectPath)
```

`git diff`는 추적되지 않는 파일을 출력하지 않는다. `changedFiles`(`git status --untracked-files=all` 기반)와 `workspaceDelta.added`는 **이름**을 정확히 잡지만, 새 파일의 **내용**은 어느 산출물에도 없다.

### 왜 문제인가

1단계 이후 격리 트리는 Run 종료 시 폐기된다. 그러면 그 Run이 만든 작업의 유일한 잔존 기록이 `git-diff.patch`다. 그런데 **새로 생성된 파일의 내용은 그 기록에 없다.** 결과:

- "격리 트리의 변경을 승인 시 반영한다"는 설계는 diff를 반영 단위로 쓸 수 없다. 새 파일이 통째로 빠진다.
- 리뷰어가 diff만 읽으면 신규 파일을 검토할 방법이 없다. `changedFiles`에 이름은 보이는데 내용은 어디에도 없어서, **파일 이름과 내용 사이에 관측 공백**이 생긴다.
- 방향은 fail-closed가 아니다. 신규 파일 생성이 주된 작업인 Task(스캐폴딩, 새 모듈 추가)에서는 증거의 대부분이 사라지는데, `verificationGate`는 통과할 수 있고 `pathViolations`도 비어 있을 수 있으므로 **ACCEPTED가 난다.**

### 판단

1단계가 만든 결함이 아니다. `captureGitDiff`는 처음부터 `git diff`였다. 다만 1단계가 폐기를 붙이면서 **영향이 달라졌다** — 이전에는 트리가 남아 있어 파일을 직접 볼 수 있었고, 이제는 남지 않는다.

우선순위는 다음 감사에서 정하는 것이 맞다고 본다. 참고로 해법은 작다: `git diff` 대신 `git add -N`(intent-to-add) 후 diff를 뜨거나, `git diff --no-index /dev/null <file>`를 신규 파일마다 덧붙이면 신규 파일 내용이 패치에 들어온다.

---

## 멈춘 이유와 권고

게이트 4항목이 요구한 테스트가 없으므로 2단계 수정에 착수하지 않았다. 코드 변경 0건, `docs/audits/2026-08-11/SUMMARY.md`의 P1-18 등재도 보류했다(2단계 작업 패키지에 포함된 항목이므로).

권고는 순서대로 다음과 같다.

1. **게이트 4를 메우고 2단계로 간다.** 필요한 것은 테스트 1건이다. §4의 실측 시나리오(에이전트가 worktree 안 파일을 붙잡는 detached 프로세스를 남김)를 그대로 테스트로 옮겨 `bundle.unavailableReasons`에 `ISOLATION_DISCARD_FAILED`가 있고 waiver 없는 ACCEPTED가 막히는 것을 assert하면 된다. 이 테스트는 **현재 코드에서 통과한다** — 결함 재현이 아니라 회귀 방어이므로, 일부러 실패시키려면 `run.ts:1217`의 한 줄을 지웠을 때 실패하는지로 확인하는 것이 맞다.
2. 그 뒤 2단계(P0-10 · P0-1 잔여 env · P0-6 잔여 상한)를 지시된 범위대로 진행한다.
3. §5의 diff 결함은 별도 슬라이스로 다룬다. 2단계의 "증거 생산 git 호출의 잘림을 EVIDENCE_DEFECT로 표면화"와 **같은 파일·같은 함수**(`captureGitDiff`)를 건드리므로, 순서를 정해두지 않으면 충돌한다.

지시가 "불일치 발견 시 수정하지 말고 멈춰라"였으므로 1번도 임의로 진행하지 않았다. 진행 여부는 지시를 기다린다.

---

# 2단계 착수 전 게이트 — 2회차 (1b단계 이후)

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902 + 1단계·1b단계 수정(미커밋)
```

## 게이트 판정: **통과 — 3항목 전부**

| # | 확인 항목 | 판정 |
|---|---|---|
| 1 | `npm test` 204/204 통과, 임시 트리 누수 0 | **통과** |
| 2 | `captureGitDiff`가 신규 파일 내용을 담고 수정·삭제 회귀가 테스트로 고정 | **통과** |
| 3 | `NEW_FILE_CONTENT_NOT_CAPTURED`가 CAPABILITY_GAP으로 번들까지 도달, waiver 시 ACCEPTED 가능 | **통과 (설계대로)** |

### 1. 스위트와 누수

```
ℹ tests 204
ℹ pass 204
ℹ fail 0
  conditions covered     345  (63.3%)
temp worktree parents: before=0 after=0
```

`<tmp>`의 `codefleet-worktree-*`를 전량 삭제한 뒤 `npm test` 1회를 돌려 전후를 셌다. 0 → 0.

### 2. 신규 파일 내용과 회귀 고정

"the diff artifact carries a created file's content, not only its name"이 세 가지를 한 테스트에서 assert한다.

```
78:  assert.ok(patch.includes("src/brand-new.js"), "the patch must name the created file");
79:  assert.ok(  ... 전 라인 수록 확인 ...
83:  assert.match(patch, /new file mode/, "a creation is recorded as a creation");
86:  assert.ok(patch.includes("-export const ok = true;"), "the modification must still be carried");
87:  assert.ok(patch.includes("+export const ok = 2;"));
88:  assert.match(patch, /deleted file mode/, "the deletion must still be carried");
89:  assert.ok(patch.includes("-export const gone = 1;"));
```

수정·삭제 회귀가 생성과 같은 Run·같은 테스트에 고정돼 있다.

### 3. 분류와 waiver 동작 (실측)

상한을 넘는 신규 파일을 만드는 Run을 돌리고 리뷰까지 진행했다.

```
newFileCapture            : {"notCaptured":[{"path":"src/huge.txt",
                             "reason":"1048577 bytes exceeds the 1048576 byte per-file limit"}],
                             "scanScope":{"newFilesFound":1,"contentCaptured":0,"contentNotCaptured":1,...},
                             "unavailableReason":"NEW_FILE_CONTENT_NOT_CAPTURED"}
runSummary unavailable    : [...,"NEW_FILE_CONTENT_NOT_CAPTURED",...]
bundle unavailableReasons : [...,"NEW_FILE_CONTENT_NOT_CAPTURED",...]
bundle gaps/defects       : 3 / 0            ← CAPABILITY_GAP으로 분류됨
ACCEPTED unwaived         : blocked -> capability gap not waived: NEW_FILE_CONTENT_NOT_CAPTURED
ACCEPTED with waiver      : MIGRATION_READY_WAIVED / WAIVED_INCOMPLETE
```

설계 의도대로다 — 침묵하지 않고, 사람이 사유를 적으면 통과시킬 수 있다.

**2단계 착수 가능.**
