# 1b단계 — 폐기 실패의 회귀 방어와 신규 파일 증거 완전성 (게이트 4 · P0-11)

```text
수정 일시   : 2026-08-11
대상 커밋   : 754acea73f15729a100e3102e0ff7c5b47869902 + 1단계 수정(미커밋)
근거 문서   : docs/audits/2026-08-11/fixes/stage2-precheck.md §4, §5
             docs/audits/2026-08-11/fixes/stage1-isolation.md
범위        : 게이트 4(회귀 방어) + P0-11(신규 파일 내용 소실) + 밀린 등재.
             2단계(runProcess/isolation 위임, env, 타임아웃, 출력 상한)는
             착수하지 않았다. P0-9, P1-13/17/18 수정도 범위 밖.
측정 근거   : npm test — 착수 전 201 pass / 0 fail
                        완료 후 204 pass / 0 fail (신규 3건)
             coverage — 63.3% (345/545), 전후 동일
```

---

## 작업 1 — 게이트 4: 폐기 실패의 회귀 방어

### 1-1. 무엇이 없었나

precheck에서 확인한 대로, 폐기 실패가 리뷰 번들까지 도달하는 **코드 경로는 정상 동작**한다. 없는 것은 그것을 지키는 테스트였다. `ISOLATION_DISCARD_FAILED`를 다루는 테스트는 `discard()`의 반환 객체만 보는 단위 테스트 1건뿐이었고, `run.ts` → 관측 → Run Summary → 번들 구간은 아무도 지키지 않았다.

### 1-2. 추가한 테스트

`test/isolation.test.ts` — "a failed discard reaches the review bundle and blocks an unwaived accept"

precheck의 실측 시나리오를 그대로 옮겼다. 에이전트가 worktree 안의 파일을 연 채 살아남는 detached 프로세스를 남기고, 그 상태에서 Run이 트리를 폐기하려다 실패한다. assert 사슬:

| 단계 | assert |
|---|---|
| 폐기가 실제로 실패했는가 | `observation.workspace.isolation.discarded === false`, `unavailableReason === "ISOLATION_DISCARD_FAILED"` |
| **관측 → Run Summary** (지켜지지 않던 구간) | `summary.normalization.unavailableReasons`에 포함 |
| Run Summary → 리뷰 번들 | `bundle.unavailableReasons`에 포함 |
| 게이트가 막는가 | `assert.rejects(ACCEPTED, /capability gap not waived: ISOLATION_DISCARD_FAILED/)` |
| 사람이 읽는 문서 | run-record.md에 `not discarded` |

### 1-3. 역검증 — `run.ts`의 전파 한 줄을 지우면 실패하는가

이 테스트는 결함 재현이 아니라 회귀 방어이므로 현재 코드에서 통과한다. 그래서 지시대로 전파 지점(`src/run.ts:1231`, `addUnavailableReason(reasons, workspace?.isolation);`)을 임시로 삭제하고 실패를 확인했다.

```
run.ts: propagation line removed
✔ the adapter process has a time limit and is killed when it exceeds it (415.4502ms)
✔ output is capped, and the dropped bytes are counted rather than silently lost (52.8188ms)
✔ the child does not inherit the parent environment (100.1301ms)
✔ a git worktree isolates the Run, and discarding it removes the edits (398.5215ms)
✔ a mode that cannot be provided is reported, never silently downgraded (33.1938ms)
✔ requireIsolationForMutation is read, and it blocks rather than warning (33.3716ms)
✔ an editing Run with the flag on and no isolation is refused before it starts (203.1525ms)
✔ an isolated Run observes the tree the agent actually ran in (971.4499ms)
✔ the diff artifact carries a created file's content, not only its name (1010.3653ms)
✔ a new file whose content cannot travel is named rather than dropped (253.0991ms)
✔ a discard that fails says so, and saying it twice says the same thing (672.0246ms)
✖ a failed discard reaches the review bundle and blocks an unwaived accept (1176.4142ms)
✔ a queue decision blocks the Run, and an unattached Task is not blocked (607.5866ms)
ℹ tests 13
ℹ pass 12
ℹ fail 1

  AssertionError [ERR_ASSERTION]: the Run Summary must carry it,
    got ["COMMAND_CHANNEL_NOT_HARNESS_VISIBLE","PROVIDER_TRANSCRIPT_NOT_STRUCTURED"]
      at TestContext.<anonymous> (.../test/isolation.test.ts:712:12)
```

실패 지점이 정확히 그 한 줄이 담당하는 구간(관측 → Run Summary)이고, 다른 12건은 영향받지 않는다. **코드는 즉시 원상복구했다** — `grep`으로 `src/run.ts:1231`에 해당 줄이 다시 있음을 확인했고, 이후 전체 스위트가 204/204 통과한다.

### 1-4. 자식 프로세스 정리 — 여기서 실제 문제를 하나 만들었다

지시가 짚은 위험("테스트가 좀비를 남기면 이후 모든 Run 테스트가 오염된다")이 첫 구현에서 그대로 발생했다.

**증상**: 스위트 1회 실행마다 `<tmp>`에 `codefleet-worktree-*` 디렉터리가 2개씩 남았다. 측정:

```
worktree parents before=18 after=20   (npm test 1회)
```

**원인**: holder 프로세스가 자기 pid를 **worktree 안**(`<treeRoot>/src/holder.pid`)에 쓰게 했는데, 실패한 폐기가 그 전에 도달 가능한 파일들을 먼저 지우면서 pid 파일이 함께 사라졌다. 정리 코드는 pid를 찾지 못해 아무것도 죽이지 않았고, `holderAlive`가 `false`로 **초기화**돼 있어서 검사도 통과했다. 즉 **살아 있는 프로세스를 두고 "정리됨"을 보고하는 상태** — 이 슬라이스가 고치려는 결함과 정확히 같은 형태다.

**수정 두 가지**:

1. pid 파일을 워크스페이스(`<root>/holder.pid`)에 쓴다. 폐기가 손대지 않는 위치다. 경로는 테스트가 에이전트 소스를 생성할 때 절대경로로 박아 넣는다.
2. `holderAlive`를 `true`로 초기화한다. **pid를 못 찾은 것은 "죽었다"가 아니라 "모른다"이고, 모르는 것을 정리됨으로 세면 안 된다.** 종료 확인에 성공했을 때만 `false`가 된다.

추가로 `forceRemoveTree` 헬퍼를 두어, 일부러 실패시킨 트리를 만든 테스트가 그 트리를 직접 치우게 했다(Windows는 프로세스 종료 후 핸들 해제가 약간 지연되므로 재시도). 제품의 `discard`는 실패 시 보고하고 멈추는 것이 맞으므로 제품 코드는 건드리지 않았다 — 정리는 실패를 만든 테스트의 몫이다.

**검증**:

```
worktree parents before=0 after=0     (npm test 1회, 전량 삭제 후 측정)
```

테스트는 `holderAlive === false`와 트리 부재를 모두 assert한다.

---

## 작업 2 — P0-11: 신규 파일 내용이 증거에서 소실된다

등재는 `07-new-defects.md`의 P0-11에 했다. 여기에는 수정 내용만 적는다.

### 2-1. 수정 전 실패 출력

새 테스트 "the diff artifact carries a created file's content, not only its name"을 먼저 작성했다. 한 Run에서 수정·삭제·생성을 모두 수행하고, 패치가 세 가지를 전부 담는지 본다.

```
✖ the diff artifact carries a created file's content, not only its name (850.3903ms)
  AssertionError [ERR_ASSERTION]: the patch must name the created file
      at TestContext.<anonymous> (.../test/zz-prefix-probe.test.ts:475:10)
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
```

(새 export를 참조하는 두 번째 테스트가 모듈 로드를 막았으므로, 수정 전 실패를 보기 위해 그 테스트와 새 import를 제거한 임시 사본 `test/zz-prefix-probe.test.ts`로 실행했다. 확인 후 삭제했고 저장소에 남아 있지 않다.)

패치가 이름조차 담지 못한다는 것이 첫 실패다. precheck §5의 실측과 같은 사실이다.

### 2-2. 수정 방향과 근거

**채택: `git diff --no-index -- /dev/null <path>`**

후보 두 개를 비교했다.

| 후보 | 인덱스 변경 | 판단 |
|---|---|---|
| `git add -N` (intent-to-add) 후 `git diff` | **있음** | **기각.** `isolationMode: NONE`이면 관측 대상이 사용자의 실 저장소이고, 그 인덱스는 사용자의 것이다. 관측이 관측 대상을 바꾸면 안 된다. 격리 Run에서만 쓰면 증거 형식이 모드에 따라 달라져 더 나쁘다 |
| `git diff --no-index` | 없음 | **채택.** 인덱스를 읽지도 쓰지도 않는다 |

인덱스 불변을 실측으로 확인했다(`isolationMode: NONE`, 관측 트리 = 워크스페이스):

```
index unchanged by the Run   : true
created file still untracked : true
status after                 : ["?? src/created.js"]
patch carries the new content: true
codefleet artifacts in patch : false
```

마지막 줄이 중요하다. `.codefleet/`은 Run 도중에 계속 쓰이므로, 그것을 자기 Run의 패치에 담으면 무한히 커진다. `captureUntrackedFiles`가 `isCodefleetMetadataPath`로 걸러낸다.

`--no-index`는 두 입력이 다르면 exit 1을 낸다. 정상 결과이므로 0과 1을 모두 성공으로 받는다.

### 2-3. 바이너리와 대용량의 취급

**결정: 싣지 않는다. 대신 이름과 사유를 세 곳에 남긴다.**

| 경우 | 처리 | 근거 |
|---|---|---|
| 텍스트, 1 MiB 이하 | 패치에 전문 수록 | 기본 |
| 바이너리 | git이 `Binary files /dev/null and b/<path> differ`를 출력 — 이름은 패치에, 바이트는 아님 | `--binary`로 실을 수는 있으나 패치가 base64로 부풀고, 리뷰 대상으로서 가치가 낮다 |
| 1 MiB 초과 (`NEW_FILE_CONTENT_LIMIT_BYTES`) | 미수록 | 패치는 사람이 읽고 기계가 적용할 수도 있는 증거다. 체크인된 대용량 산출물 하나가 Run Trace 전체를 못 쓰게 만들면 안 된다 |
| 한 Run 합계 8 MiB 초과 (`NEW_FILE_CONTENT_TOTAL_LIMIT_BYTES`) | 이후 파일 미수록 | 같은 이유의 총량 상한 |
| 읽기 실패 / `--no-index` 실패 | 미수록 | 사유를 그대로 기록 |

**"싣지 않는다"가 "조용히 빠진다"가 되지 않도록** 표면화를 세 곳에 뒀다. 이 결함의 본질이 침묵이므로 같은 형태로 재발시키지 않는 것이 이 수정의 핵심 조건이다.

1. **패치 본문** — 패치 파일만 읽는 사람도 부분적임을 안다:
   ```
   # CodeFleet: 2 created file(s) are named in this Run's changed files,
   # but their content is not in this patch:
   #   src/huge.txt — 1048577 bytes exceeds the 1048576 byte per-file limit
   #   src/image.bin — binary content is named by git but not carried in a patch
   ```
2. **`harnessObservation.changes.newFileCapture`** — `notCaptured[{path, reason}]`와 `scanScope{newFilesFound, contentCaptured, contentNotCaptured, bytesCaptured, perFileLimitBytes, totalLimitBytes}`. 무엇을 스캔했는지 세는 이 코드베이스의 규율과 같은 형태다.
3. **리뷰 게이트** — `unavailableReason: "NEW_FILE_CONTENT_NOT_CAPTURED"`가 `runSummaryUnavailableReasons`(`src/run.ts:1226`)를 거쳐 번들까지 올라간다.

분류는 `CAPABILITY_GAP`이다(`EVIDENCE_DEFECT_PREFIXES`에 없는 접두사). 즉 **waiver 없이는 ACCEPTED가 불가능하고**, 사람이 사유를 적으면 통과시킬 수 있다. `EVIDENCE_DEFECT`(waiver 불가)로 하지 않은 이유: 대용량·바이너리 신규 파일은 정상 작업에서 나올 수 있고, 그것을 영구 차단하면 해제 수단 없는 막다른 길이 된다(2026-08-10 P1-2가 지적한 형태). 2단계가 다룰 "증거 생산 git 호출의 출력 잘림"은 성격이 다르다 — 그쪽은 Harness가 정확히 관측했어야 할 것을 놓친 경우이므로 `EVIDENCE_DEFECT` 계열이 맞고, 이 슬라이스에서 판단을 선점하지 않았다.

또 하나의 침묵 경로를 막았다. `git status`가 실패해 신규 파일 목록 자체를 얻지 못하면, 추적 변경만 담은 패치를 내면서 `notCaptured: [{path: "(unknown)", ...}]` + 같은 `unavailableReason`을 붙인다. **"생성된 파일이 없다"와 "생성 여부를 모른다"를 같게 보고하지 않는다.**

### 2-4. 수정 후 확인

```
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
diff --git a/src/brand-new.js b/src/brand-new.js
new file mode 100644
index 0000000..3201e9b
--- /dev/null
+++ b/src/brand-new.js
@@ -0,0 +1 @@
+export const fresh = true;

  modification src/app.js      : true
  deletion     src/doomed.js   : true
  creation     src/brand-new.js: true      ← 수정 전 false
tree still on disk?            : false
```

**회귀 확인** — precheck에서 true였던 두 가지가 그대로 true다. 테스트도 이를 별도 assert로 고정한다(`-export const ok = true;`, `deleted file mode`, `-export const gone = 1;`). 생성을 담느라 수정이나 삭제를 잃는 수정은 수정이 아니다.

두 번째 테스트 "a new file whose content cannot travel is named rather than dropped"가 바이너리·상한 초과를 직접 검증한다: 상한 내 파일은 온전히 실리고(`contentCaptured: 1`), 두 건은 실리지 않고(`contentNotCaptured: 2`), `unavailableReason`이 서고, 패치 본문에 두 경로와 서로 다른 사유(binary / exceeds)가 나타난다.

---

## 작업 3 — 밀린 등재

| 대상 | 위치 | 조치 |
|---|---|---|
| P0-11 | `07-new-defects.md` | 신규 절 추가. 발생 조건, 근거(`git diff`가 untracked를 내지 않음), 게이트 실측, 1단계 폐기 도입으로 영향이 바뀐 경위(표), fail-closed가 아닌 이유, 해소 링크 |
| P1-18 | `SUMMARY.md` P1 표 + 상세 절 | 추가만. **수정하지 않았다.** 발생 조건, `isolationMode: NONE`에서도 재현된다는 점, fail-closed 성격, P0-11 수정과 같은 함수군을 건드린다는 주의 |

`07-new-defects.md` 머리말에 각 결함의 현재 상태(P0-7·P0-8·P0-11 해소, P0-9·P0-10 미착수)를 적었다.

---

## 변경 파일

```
 src/isolation.ts       | 133 ++++++++++--
 src/run-record.ts      |  40 ++++
 src/run.ts             | 337 +++++++++++++++++++++++++----
 test/isolation.test.ts | 559 ++++++++++++++++++++++++++++++++++++++++++++++++-
 4 files changed, 1011 insertions(+), 58 deletions(-)
```

위 수치는 1단계 + 1b단계 합계다(1단계가 아직 커밋되지 않았으므로 `git diff`가 둘을 함께 센다). 1b단계에서만 바뀐 것은 다음과 같다.

| 파일 | 1b단계 변경 |
|---|---|
| `src/run.ts` | `captureGitDiff`가 untracked 내용을 포함하도록 재작성. `captureNewFileContent`(export)와 `captureUntrackedFiles` 신설, 상한 상수 2종(export). `harnessObservation.changes.newFileCapture` 추가. `runSummaryUnavailableReasons`에 `newFileCapture` 승격 1줄 |
| `test/isolation.test.ts` | 테스트 3건 추가(신규 파일 내용 종단 / 상한·바이너리 단위 / 폐기 실패 종단), `forceRemoveTree` 헬퍼 추가 |
| `src/isolation.ts`, `src/run-record.ts` | 1b단계 변경 없음 (1단계 그대로) |
| 문서 | `07-new-defects.md`, `SUMMARY.md`, 이 파일 |

`test/profile-fixture.ts`는 이번에도 변경하지 않았다. 새 테스트만 프로파일에서 `GIT_WORKTREE`를 명시한다.

**테스트 결과**: 204 tests, 204 pass, 0 fail (착수 전 201 + 신규 3). coverage 63.3%로 전후 동일 — 이 슬라이스는 FINAL RULE 조건을 새로 덮지 않으므로 클레임을 추가하지 않았다.

---

## 2단계에 넘기는 메모

- `captureGitDiff`는 이제 git을 **3종류**로 호출한다: 추적 diff, `status`(untracked 목록), 파일별 `--no-index`. 2단계가 `runProcess`를 `runCommand`에 위임할 때 **파일별 호출이 신규 파일 수만큼 늘어난다**는 점을 감안해야 한다. 타임아웃을 호출 단위로 걸면 신규 파일이 많은 Run에서 총 시간이 곱해진다.
- 같은 이유로 2단계의 "증거 생산 git 호출의 잘림을 `EVIDENCE_DEFECT`로 표면화"는 `--no-index` 호출에도 적용돼야 한다. 신규 파일 내용이 상한에 잘리면 지금 붙인 `NEW_FILE_CONTENT_NOT_CAPTURED`(waiver 가능)가 아니라 그쪽 분류가 맞다. 두 표면화가 겹치는 지점이므로 2단계에서 관계를 정해야 한다.
- P1-18을 고칠 때는 `captureGitChangedFiles`·`captureUntrackedFiles`·`captureGitDiff`가 같은 경로 기준을 쓰도록 함께 고쳐야 한다. 지금은 셋 다 저장소 루트 기준이라 최소한 서로 일관된다.
