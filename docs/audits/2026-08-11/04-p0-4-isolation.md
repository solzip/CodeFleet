# P0-4 — 실행 격리와 롤백

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/isolation.ts, src/run.ts, src/review.ts, src/config.ts, src/types.ts,
             test/isolation.test.ts, test/profile-fixture.ts
측정 근거   : npm test — 199 tests, 199 pass
             실측 재현 1건 — GIT_WORKTREE 종단 Run (아래 §C)
발생 조건   : isolationMode: GIT_WORKTREE 로 도는 모든 Run
```

## 판정: **미해소**

(A) 실패 · (B) 실패 · (C) 우회 2건. 더불어 격리 도입이 **새 결함 두 건(P0-7, P0-8)을 만들었다.**

---

## (A) 코드 검증 — 수명주기가 완결되지 않는다

### A-1. 생성 — 구현됨

`src/isolation.ts:67-107` `prepareIsolation`. git 저장소 여부를 먼저 확인하고(`:68`), `mkdtemp`로 부모 디렉터리를 만든 뒤(`:78`) `git worktree add --detach <path> HEAD`(`:80-84`)를 실행한다. 실패는 `GIT_WORKTREE_ADD_FAILED`로, 비-git 저장소는 `GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY`로 보고하고 **조용한 다운그레이드를 하지 않는다**. `TEMP_WORKSPACE` / `CONTAINER`는 `ISOLATION_MODE_NOT_IMPLEMENTED:<mode>`로 명시한다(`:113-119`).

`isolation.mode`가 상수 `"NONE"`이던 문제는 해소됐다 — `src/run.ts:1759-1774` `resolveIsolation`이 프로파일에서 읽고, `REQUIRE_EXPLICIT`는 Run Planning을 거부한다.

### A-2. 에이전트 실행 — 부분적으로만 격리된다

`src/run.ts:691-704`이 어댑터에 `projectPath: prepared.workPath`를 넘긴다. **에이전트는 격리 트리에서 돈다.**

그러나 `prepared.workPath`를 쓰는 지점은 `run.ts:695` **한 곳뿐**이다(grep 전수). 나머지는 전부 원본 `projectPath`를 본다:

| 지점 | 대상 | 사용 경로 |
|---|---|---|
| `run.ts:662-672` | PRE_RUN 스냅샷 | `projectPath` |
| `run.ts:695` | **에이전트** | **`prepared.workPath`** |
| `run.ts:708` | `captureGitDiff` | `projectPath` |
| `run.ts:713` | `captureGitChangedFiles` | `projectPath` |
| `run.ts:715-725` | POST_RUN 스냅샷 | `projectPath` |
| `run.ts:767-769` | case sensitivity / symlink / nested repo 탐지 | `projectPath` |
| `run.ts:787-798` | 검증 커맨드 실행 | `projectPath` |

증거 수집과 정책 판정이 전부 에이전트가 손대지 않은 트리를 대상으로 한다. 이것이 **P0-7**이다.

### A-3. 폐기 — 실행 경로에 없다

`prepared.discard()` 호출 지점 전수 (grep):

```
src/run.ts:686:    await prepared.discard();
```

**한 곳뿐이고, 그것은 Run Planning이 격리 요구 위반으로 거부될 때다.**

```ts
// src/run.ts:679-688
const prepared = await prepareIsolation({ projectPath, runId, mode: isolation.mode });
const requirement = checkIsolationRequirement({ ... });
if (requirement.blocked) {
  await prepared.discard();     // ← 유일한 호출
  throw new Error(requirement.reason);
}
```

정상 종료 경로에 `discard` 호출이 없다. `try/finally`도 없다. `src/review.ts` 전체에도 `discard`·`isolation`·`worktree` 참조가 0건이다 — **REJECTED 리뷰는 여전히 JSON 파일 하나를 쓰고 끝난다.**

2026-08-10 권고 4("격리가 서면 REJECTED 리뷰가 worktree를 폐기하도록 연결한다 — 그것이 P1-7의 롤백 구현이 된다")는 이행되지 않았다. **폐기 실패(파일 잠김 등) 처리는 논할 단계가 아니다. 폐기 자체가 호출되지 않는다.**

`isolation.ts:102-105`의 `discard` 구현 자체는 올바르다(worktree 등록 해제 → 디렉터리 삭제 순서). 다만 `run()`의 반환값을 확인하지 않으므로, 호출되더라도 `git worktree remove` 실패가 조용히 넘어간다.

### A-4. 격리 요구 플래그 — 읽힌다

`src/isolation.ts:132-163` `checkIsolationRequirement`가 `requireIsolationForMutation`을 소비하고, `src/run.ts:680-688`이 호출한다. 2026-08-10이 "가장 위험한 상태"로 지목한 "기본값 true인데 읽는 코드 0건"은 해소됐다.

---

## (B) 테스트 검증 — 실패

| 검증 대상 | 테스트 | 결과 |
|---|---|---|
| worktree 생성 + 편집 격리 + 폐기 | `test/isolation.test.ts:102-121` | 존재·통과. **`prepareIsolation`을 직접 부르는 단위 테스트** |
| 제공 불가 모드의 보고 | `test/isolation.test.ts:123-138` | 존재·통과 |
| `requireIsolationForMutation` 차단 | `test/isolation.test.ts:140-176` | 존재·통과 (단위) |
| NONE + fileEdit 조합의 Run 거부 | `test/isolation.test.ts:178-216` | 존재·통과 (`runTask` 종단) |
| **`isolationMode: GIT_WORKTREE`로 도는 Run 종단** | **없음** | `test/` 전수에서 `GIT_WORKTREE`가 등장하는 곳은 `isolation.test.ts:104,125,168`(전부 `prepareIsolation` 직접 호출)과 `adapter-resolution.test.ts:144,153,168`(스키마 값 검증)뿐 |
| REJECTED가 격리 트리를 폐기 | **없음** | 코드에 없으므로 테스트도 없다 |
| ACCEPTED가 작업을 반영 | **없음** | 코드에 없으므로 테스트도 없다 |

원인이 픽스처에 있다. `test/profile-fixture.ts:44`

```ts
isolationMode: overrides.isolationMode ?? "NONE"
```

`test/profile-fixture.ts:73-78`

```ts
const harness = (policies.harness ?? {}) as Record<string, unknown>;
if (harness.requireIsolationForMutation === undefined) {
  policies.harness = { ...harness, requireIsolationForMutation: false };
}
```

**모든 Run 테스트가 격리를 끈 상태로 돈다.** 픽스처 주석(`:60-63`)이 그 결정을 명시하고 근거도 적었으므로("assert Run behaviour, not the isolation requirement") 은폐는 아니다. 그러나 결과적으로 **격리가 켜진 Run 경로는 이 저장소에서 한 번도 실행된 적이 없고, 아래 (C)의 결함이 그래서 발견되지 않았다.**

---

## (C) 반증 시도

### C-1. NONE + 파일 편집 거부를 우회하는 설정 — 존재하고, 제품이 안내한다

`src/isolation.ts:139-141`

```ts
if (!fileEdit || !requireIsolationForMutation) {
  return { blocked: false, reason: "" };
}
```

우회 경로 두 가지:

| 우회 | 방법 | 승인·기록 대상인가 |
|---|---|---|
| `policies.harness.requireIsolationForMutation: false` | `.codefleet/config.json` 편집 | **아니다** (아래) |
| `fileEdit`를 false로 낮춤 | harnessMode/role/guardrail을 `SUGGEST_ONLY` 이하로 | 이 경우 어댑터가 아예 실행되지 않으므로 우회가 아님 |

그리고 **차단 메시지가 첫 번째 방법을 직접 안내한다** — `src/isolation.ts:149`:

```
"Set isolationMode to GIT_WORKTREE, or set requireIsolationForMutation to false to accept edits in the workspace itself."
```

2026-08-10 문서 02가 `allowDegradedCommandObservation`에 대해 지적한 형태("제품이 에러 메시지로 해제 방법을 안내한다")가 그대로 반복됐다. 다만 이번에는 문구가 "accept edits in the workspace itself"로 **무엇을 받아들이는지 명시**하므로 그때보다는 정직하다.

**그 우회 자체가 승인·기록 대상인지 — 아니다.**

- 승인 해시는 Task 파일 하나의 해시다(`src/task-ledger.ts:53-55`, `:164`). 프로파일은 포함되지 않는다 (2026-08-10 P1-4, 미해소).
- 따라서 **승인 후에 `requireIsolationForMutation`을 false로 바꿔도 재승인이 필요 없다.**
- run-plan의 `sourceRefs.projectProfileRef`(`run.ts:567`)에 config 해시가 남으므로 사후 추적은 가능하다. 그러나 승인 시점 해시와 실행 시점 해시를 대조하는 코드는 없다.
- run-plan `resume.sourceHashPolicy`는 `"TASK_AND_PROFILE_MUST_MATCH"`(`run.ts:611`)라고 선언하지만, 이 값을 읽는 코드는 없다.
- run-record.md에 격리 모드가 출력되지 않는다(`src/run-record.ts` 전체에 `isolation` 참조 0건). **리뷰어는 그 Run이 격리됐는지조차 알 수 없다.**

### C-2. worktree 안의 편집이 승인 시 실 워크스페이스로 반영되는가 — 반영 경로 없음 (재현됨)

`isolationMode: GIT_WORKTREE`, `requireIsolationForMutation: true`, `harnessMode: COMMAND_EXEC`로 종단 Run을 실행했다. 에이전트는 범위 내 `src/app.js`를 수정하고 범위 밖 `SECRET-OUT-OF-SCOPE.txt`를 새로 만든다. 검증 커맨드는 `src/app.js`에 에이전트의 편집이 보일 때만 exit 0.

```
=== isolation recorded in run-plan: {"mode":"GIT_WORKTREE","reason":"PROFILE_DEFAULT"}
=== run status: SUCCEEDED exit 0
=== workspace src/app.js AFTER run: "export const ok = true;\n"     ← 원본 그대로
=== out-of-scope file in workspace?: false
=== changedFiles observed: []
=== workspaceDelta: {"added":0,"modified":0,"removed":0,...}
=== pathViolations: []
=== verificationGate: NOT_SATISFIED FAILED observedCheck FAIL
=== result value: DONE
=== adapter stdout: "agent done\n"
=== leftover worktree parent dirs in tmp: 1 [ 'codefleet-worktree-DjL8ps' ]
=== git worktree list:
<tmp>/cf-attack-wt-I7dxSm                          ab79449 [master]
<tmp>/codefleet-worktree-DjL8ps/2026-08-11_001     ab79449 (detached HEAD)
```

읽어야 할 것:

1. **봉쇄는 된다.** 워크스페이스가 원본 그대로다. 격리의 1차 목적은 달성됐다.
2. **반영 경로가 없다.** 승인해도 worktree의 변경을 가져오는 코드가 존재하지 않는다. 그리고 worktree 경로가 **어떤 산출물에도 기록되지 않는다** — run-plan의 `isolation`은 `{mode, reason}`뿐이다. 사용자는 자기 작업이 `<tmp>` 아래 어느 디렉터리에 있는지 알 수 없다.
3. **폐기도 안 된다.** Run이 끝났는데 worktree가 등록된 채로 남아 있다. Run마다 하나씩 쌓인다.
4. **증거가 엉뚱한 트리에서 나온다.** `changedFiles: []`, `pathViolations: []`. 실제로는 범위를 벗어났는데 위반이 0건으로 기록됐다.
5. **검증은 항상 실패한다.** 검증 커맨드가 원본 트리에서 도니 에이전트의 작업을 볼 수 없다. GIT_WORKTREE에서는 어떤 실제 작업도 검증 게이트를 통과할 수 없다.

리뷰어가 받는 문서는 이렇게 읽힌다 — `run-record.md`:

```
## What changed
No file change was observed.
...
No path violation. 0 path(s) checked against 2 allowed and 0 denied pattern(s).
```

**에이전트가 파일을 고쳤고 범위를 벗어났는데, 사람이 읽는 유일한 문서가 "변경 없음, 위반 없음"이라고 말한다.** 이 제품의 존재 이유와 정면으로 충돌한다.

2·3은 신규 **P0-8**, 4·5는 신규 **P0-7**로 등재했다 (`07-new-defects.md`).

---

## 권고

1. **P0** — 증거 수집 지점(`run.ts:662, 708, 713, 715, 767-769, 787-798`)을 `prepared.workPath`로 옮긴다. PRE_RUN 스냅샷도 같은 트리에서 찍어야 delta가 성립한다. 이것이 P0-7의 해소이고, 동시에 P0-1의 경로 검사를 되살린다.
2. **P0** — `prepared.discard()`를 Run 종료의 `finally`에 붙인다. 리뷰까지 보존해야 한다면 worktree 경로를 run-plan `isolation` 블록에 기록하고 리뷰 종료 시 폐기한다. `isolation.ts:102-105`의 `run()` 반환값을 확인해 폐기 실패를 `unavailableReason`으로 남긴다.
3. **P0** — ACCEPTED가 격리 트리를 실 워크스페이스로 반영하는 경로를 정한다. 정하지 않기로 한다면 그 사실을 run-record.md에 명시한다. 지금은 "성공한 작업이 조용히 사라지는" 상태다.
4. **P0** — `isolationMode: GIT_WORKTREE`로 도는 종단 테스트를 추가한다. 픽스처가 전부 NONE으로 고정돼 있어(`test/profile-fixture.ts:44, 75-77`) 이 경로가 실행된 적이 없다. 최소 형태: 에이전트가 파일을 고치는 Run을 GIT_WORKTREE로 돌려 `changedFiles`가 비어 있지 않음을 assert.
5. **P1** — run-record.md와 ReviewEvidenceBundle에 격리 모드를 싣는다. 리뷰어가 "어느 트리의 증거인가"를 알 수 없는 상태에서 판단하고 있다.
6. **P1** — 승인 `targetHash`를 `hash(task) + hash(profile)`로 확장한다(2026-08-10 P1-4). 그래야 `requireIsolationForMutation`을 끄는 행위가 재승인 대상이 된다.
