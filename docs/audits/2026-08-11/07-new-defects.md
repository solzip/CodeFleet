# 신규 결함 — P0-7 · P0-8 · P0-9 · P0-10 · P0-11

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
번호 체계   : 2026-08-10 감사의 P0-1 ~ P0-6 에 이어 P0-7 부터 부여
공통 성격   : P0-7 · P0-8 은 2026-08-10 P0-4 의 수정이 만들어낸 결함이다.
             P0-9 · P0-10 은 수정이 도달하지 못한 지점이다.
             P0-11 은 원래부터 있었으나 1단계 수정이 영향을 바꾼 결함으로,
             2단계 착수 전 게이트(fixes/stage2-precheck.md §5)에서 발견됐다.
상태        : P0-7 · P0-8 해소 (fixes/stage1-isolation.md)
             P0-11 해소 (fixes/stage1b-evidence-completeness.md)
             P0-10 해소 (fixes/stage2-process-boundaries.md)
             P0-9 해소 (fixes/stage3-4-failopen-and-surfacing.md)
```

---

## P0-7. GIT_WORKTREE를 켜면 모든 증거가 에이전트가 손대지 않은 트리에서 수집된다

### 발생 조건

`.codefleet/config.json`의 `defaults.run.isolationMode: "GIT_WORKTREE"`. 이것은 `requireIsolationForMutation: true`(기본값)를 만족시키는 **유일하게 구현된 방법**이고, 제품이 차단 메시지로 직접 안내하는 설정이다(`src/isolation.ts:149`).

### 근거

에이전트만 격리 트리에서 돈다. `prepared.workPath`의 사용 지점은 `src/run.ts:695` 하나뿐이다(grep 전수).

| 코드 | 대상 | 경로 |
|---|---|---|
| `src/run.ts:662-672` | PRE_RUN 스냅샷 | `projectPath` |
| `src/run.ts:695` | **에이전트 실행** | **`prepared.workPath`** |
| `src/run.ts:708` | `captureGitDiff` | `projectPath` |
| `src/run.ts:713` | `captureGitChangedFiles` | `projectPath` |
| `src/run.ts:715-725` | POST_RUN 스냅샷 | `projectPath` |
| `src/run.ts:762-770` | `evaluatePathPolicy` 입력 전부 | `projectPath` |
| `src/run.ts:787-798` | 검증 커맨드 실행 | `projectPath` |

### 재현

에이전트가 범위 내 `src/app.js`를 수정하고 범위 밖 `SECRET-OUT-OF-SCOPE.txt`를 새로 만드는 동일 Task를, 격리 모드만 바꿔 두 번 실행했다.

| 관측 | `isolationMode: NONE` | `isolationMode: GIT_WORKTREE` |
|---|---|---|
| `changedFiles` | `["SECRET-OUT-OF-SCOPE.txt","src/app.js"]` | `[]` |
| `workspaceDelta` | added 0, modified 1, removed 0 | added 0, modified 0, removed 0 |
| `pathViolations` | `PATH_OUTSIDE_ALLOWED_PATHS` 1건 | `[]` |
| `verificationGate` | SATISFIED / PASS | NOT_SATISFIED / FAILED |
| `result.value` | DONE | DONE |
| run status | SUCCEEDED | SUCCEEDED |

`run-record.md` — 사람이 읽는 유일한 문서, GIT_WORKTREE 쪽:

```
## What changed
No file change was observed.

Workspace delta (post-run state minus pre-run state, over the Task scope):
added 0, modified 0, removed 0
compared 3 pre-run file(s) against 3 post-run file(s)

No path violation. 0 path(s) checked against 2 allowed and 0 denied pattern(s).
```

### 영향

1. **경로 정책 강제가 공허해진다.** 위반이 구조적으로 관측 불가가 되므로, `src/review.ts:576-578`의 ACCEPTED 차단도 절대 발동하지 않는다. 2026-08-10이 P0-1의 유일한 잔존 방어선으로 인정한 사후 탐지가 사라진다.
2. **검증 게이트가 항상 실패한다.** 검증 커맨드가 에이전트의 작업을 볼 수 없으므로, GIT_WORKTREE에서 실제 작업을 한 Run은 어떤 것도 `SATISFIED`에 도달할 수 없다. 이쪽은 fail-closed라 잘못된 수락으로 이어지지는 않지만, **격리를 켜면 제품이 사실상 동작하지 않는다**는 뜻이다.
3. **`workspaceDelta`가 0인데 `result.value`는 DONE이다.** 2026-08-10 P1-10("무작업 Run이 ACCEPTED 가능")이 이제 예외가 아니라 GIT_WORKTREE의 **기본 동작**이 된다.
4. 스냅샷 `stateHash`는 정확하다 — 원본 트리에 대해 정확하다. 데이터가 틀린 것이 아니라 **주어가 틀렸다.** 어떤 필드도 "이 증거는 어느 트리의 것인가"를 말하지 않는다.

### 우선순위: P0

이 제품의 핵심 주장("Harness가 관측한 증거만 인정한다")이 성립하지 않는다. 관측은 정확하지만 대상이 다르고, 그 사실이 산출물에 드러나지 않는다.

### 권고

증거 수집 지점 전부를 `prepared.workPath`로 옮긴다. PRE_RUN 스냅샷(`run.ts:662`)도 같은 트리에서 찍어야 delta가 성립한다. 옮긴 뒤 `harnessObservation.workspace`에 `workingDirectoryRealPath`(`run.ts:823`)가 이미 있으므로, 그 값이 자동으로 격리 트리를 가리키게 되어 "어느 트리의 증거인가"도 함께 해결된다.

---

## P0-8. 격리 트리가 폐기되지도, 반영되지도 않는다

### 발생 조건

P0-7과 동일.

### 근거

`prepared.discard()` 호출 지점 전수 (grep, src/ 전체):

```
src/run.ts:686:    await prepared.discard();
```

이 한 곳은 Run Planning이 **격리 요구 위반으로 거부될 때**다(`run.ts:685-688`). 정상 종료 경로에 호출이 없고, `try/finally`도 없다. `src/review.ts`에는 `discard`·`isolation`·`worktree` 참조가 0건이다.

### 재현

Run 1회 후:

```
=== leftover worktree parent dirs in tmp: 1 [ 'codefleet-worktree-DjL8ps' ]
=== git worktree list:
<tmp>/cf-attack-wt-I7dxSm                          ab79449 [master]
<tmp>/codefleet-worktree-DjL8ps/2026-08-11_001     ab79449 (detached HEAD)
```

### 영향

1. **REJECTED가 여전히 아무것도 되돌리지 않는다.** 2026-08-10 권고 4("REJECTED 리뷰가 worktree를 폐기하도록 연결한다 — 그것이 P1-7의 롤백 구현이 된다")가 미이행이다. 롤백은 여전히 없다.
2. **ACCEPTED가 작업을 회수하지 못한다.** worktree의 변경을 실 워크스페이스로 반영하는 코드가 없다. 성공한 Run의 결과물이 `<tmp>` 아래에 남는다.
3. **작업 위치를 알 수 없다.** run-plan의 `isolation` 블록은 `{ mode, reason }`뿐이다(`run.ts:603-606`). worktree 경로가 어떤 산출물에도 기록되지 않는다. 사용자가 자기 작업을 찾으려면 `git worktree list`를 직접 쳐야 한다.
4. **누수가 누적된다.** Run마다 worktree 등록 1건 + 임시 디렉터리 1개. `git worktree prune`은 디렉터리가 사라진 뒤에나 의미가 있는데, 디렉터리도 남으므로 prune 대상조차 되지 않는다.
5. 폐기 실패 처리는 논할 단계가 아니다. 구현(`isolation.ts:102-105`)은 `git worktree remove --force` 후 `rm -rf`인데, 호출부가 없다. 참고로 그 구현도 `run()`의 반환값을 확인하지 않으므로, 호출되더라도 파일 잠김으로 인한 제거 실패가 조용히 넘어간다.

### 우선순위: P0

격리의 목적은 "실패·반려 시 되돌릴 수 있게 하는 것"인데, 현재 구현은 **성공한 작업을 버리고 실패한 작업을 남긴다.** 방향이 반대다.

### 권고

1. `prepared.discard()`를 `executeRun`의 `finally`에 둔다. 리뷰까지 보존해야 한다면 worktree 경로를 run-plan에 기록하고 리뷰 종료 시 폐기한다.
2. `isolation.ts:102-105`가 `run()`의 `code`를 확인하고, 실패를 반환값으로 올린다.
3. ACCEPTED 시 반영 경로를 정한다. 정하지 않기로 한다면 그 사실을 run-record.md에 명시한다 — 결정하지 않은 것과 결정을 숨긴 것은 다르다.

---

## P0-9. 큐 게이트가 원장 파손 · 디렉터리 부재에서 fail-open 한다

### 발생 조건

`.codefleet/objectives/<id>/ledger.jsonl`이 구조적으로 손상되거나, `.codefleet/objectives` 디렉터리를 읽을 수 없다.

### 근거

`src/run.ts:170-191`

```ts
for (const objectiveId of objectiveIds) {
  const { snapshot } = await replayObjective(rootDir, objectiveId);
  const items = snapshot.queue.filter((item) => item.taskId === taskId);
  if (items.length === 0) {
    continue;                                        // ← 파손 원장이 여기로 빠진다
  }
  // A replay that could not be trusted must not be read as permission.
  if (snapshot.replay.replayStatus !== "COMPLETE") { // ← 도달 불가
    return (`Run is blocked: ${objectiveId} holds this Task but its ledger replay is ...`);
  }
```

**"믿을 수 없는 replay를 허가로 읽어서는 안 된다"는 검사가, 정확히 그 상황에서 실행되지 않는다.** 원장이 깨지면 큐가 비고, 빈 큐는 `continue`로 빠져나가기 때문이다.

`src/run.ts:163-168`도 같은 형태다:

```ts
try {
  objectiveIds = await readdir(path.join(rootDir, ".codefleet", "objectives"));
} catch {
  return null;                                       // 모든 I/O 오류가 "차단 없음"
}
```

### 재현

파손 원장에 대한 `replayObjective` 출력:

```
replayStatus: BLOCKED
queue length: 0
findings: [{"failureClass":"LEDGER_STRUCTURAL_FAILURE","checkId":"LEDGER_JSONL_PARSE",
            "detail":"line 1 is not valid JSON","affectedSeq":null}]
```

같은 상태에서 `runTask`:

```
=== corrupt ledger blockedQueueReason: null
=== corrupt-ledger runTask: RAN -> 2026-08-11_002
```

디렉터리를 옮긴 경우:

```
=== objectives dir hidden, blockedQueueReason: null
=== hidden-dir runTask: RAN -> 2026-08-11_001
```

두 경우 모두 그 직전에 `QUEUE_ITEM_CANCELED`로 차단된 Task였다.

### 영향

사람이 사유를 적어 명시적으로 중단시킨 Task가, 원장 파일 하나가 깨지는 것만으로 실행된다. `transitionQueueItem`은 사유를 필수로 요구하고 뮤테이션 락 아래 append-only로 기록하며 replay 검증까지 받는데(`src/ledger.ts:740-790`), 그 결정을 읽는 쪽이 파손을 "의견 없음"으로 해석한다. 2026-08-10 P0-2가 막으려던 상태 그 자체다.

`replayStatus: BLOCKED`와 `LEDGER_STRUCTURAL_FAILURE` finding은 정확히 생성되고 있다 — 읽는 쪽에 도달하지 못할 뿐이다.

### 우선순위: P0

### 권고

1. `run.ts:173-182`의 순서를 뒤집는다. `replayStatus !== "COMPLETE"` 판정을 `items.length === 0` 분기보다 **먼저** 수행한다.
2. `run.ts:166-168`의 `catch`를 `ENOENT`에 한정하고, 나머지 오류는 던진다. "디렉터리가 없다"와 "읽을 수 없다"는 다른 사실이다.
3. 이 두 경로에 재현 테스트를 붙인다. 파손 원장 fixture 하나면 된다.

---

## P0-10. Harness 자신의 자식 프로세스에 시간 · 출력 · 자격증명 경계가 없다

### 발생 조건

검증 커맨드를 가진 모든 Run, 그리고 모든 git 호출. 즉 상시.

### 근거

`src/run.ts:1980-2014` `runProcess`:

```ts
const child = spawn(command, args, {
  cwd,
  shell: false,
  stdio: ["ignore", "pipe", "pipe"]
});
```

`timeout` 없음, 출력 상한 없음, `env` 없음(→ `process.env` 전량 상속).

이 함수를 통과하는 것: 검증 커맨드(`run.ts:1286`), `git diff`(`run.ts:1895`), `git status`(`run.ts:1915`), 워크스페이스 스냅샷의 git 호출(`src/workspace-snapshot.ts:87`).

`src/isolation.ts:32-43`의 `run`도 동일하다 — `git worktree add/remove`, `git rev-parse`가 여기를 통과한다.

### 재현

```
=== verification command hung for 9000 ms; runTask took 9475 ms
=== VERDICT unbounded verification process: true
=== env seen by the verification child: "verification-child-should-not-see-this"
=== run status: SUCCEEDED
```

부모에 export한 `CODEFLEET_VERIFY_SECRET`이 자식에게 그대로 도달했다.

### 영향

- **P0-6이 절반만 닫혔다.** `mvn test`가 걸리면 `codefleet run`은 여전히 무한 정지한다. CI에 넣으면 잡 타임아웃까지 점유한다.
- **P0-1이 절반만 닫혔다.** 어댑터에는 env 경계가 섰는데 Harness 자신의 자식에는 없다. `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`이 검증 커맨드와 git 호출에 그대로 노출된다.
- `git worktree add`가 응답하지 않으면 Run이 그대로 멈춘다 — 격리를 켠 상태에서 새로 생긴 정지 지점이다.
- 출력 상한이 없으므로 대량 출력을 내는 검증 커맨드(예: 전체 로그를 뿜는 테스트 러너)가 Node 힙을 소진시킬 수 있다. 어댑터 쪽에서 막은 것과 같은 실패 모드다.

### 우선순위: P0

두 P0의 수정이 명시적으로 지목한 코드 지점(2026-08-10 문서 06 권고 1이 `src/run.ts:1457`을 지목했다)이 반영되지 않은 채 남아 있다.

### 권고

`runProcess`와 `isolation.ts`의 `run`을 `src/agent.ts:172`의 `runCommand`에 위임한다. 한 번의 변경으로 timeout·출력 상한·env 목록이 세 지점에 동시에 붙고, 규율이 하나로 통일된다. git 호출에는 `PATH`에 더해 `GIT_*` 최소 목록을 명시적으로 넘긴다.

---

## P0-11. 신규 파일의 내용이 어떤 증거에도 남지 않는다

### 발생 조건

에이전트가 파일을 **생성**하는 모든 Run. 격리 모드와 무관하며 `isolationMode: NONE`에서도 동일하게 발생한다. 특별한 설정이 필요 없다.

### 근거

`src/run.ts`의 `captureGitDiff`가 쓰는 명령이 원인이다:

```ts
runProcess("git", ["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--", "."], projectPath)
```

`git diff`는 추적되지 않는 파일을 출력하지 않는다. 반면 `captureGitChangedFiles`는 `git status --untracked-files=all`을 쓰므로 신규 파일의 **이름**은 잡는다. 결과적으로 이름과 내용이 갈라진다.

### 재현 (게이트 실측)

한 Run에서 추적 파일 수정 · 추적 파일 삭제 · 신규 파일 생성을 모두 수행했다.

```
changedFiles            : ["src/app.js","src/brand-new.js","src/doomed.js"]
workspaceDelta added    : ["src/brand-new.js"]
workspaceDelta modified : ["src/app.js"]
workspaceDelta removed  : ["src/doomed.js"]

--- git-diff.patch ---
diff --git a/src/app.js b/src/app.js       ← 수정: 내용 있음
...
diff --git a/src/doomed.js b/src/doomed.js ← 삭제: 내용 있음
deleted file mode 100644
...

  modification src/app.js      : true
  deletion     src/doomed.js   : true
  creation     src/brand-new.js: false     ← 없다
```

`workspaceDelta.added`에 이름이 있고, `changedFiles`에도 이름이 있고, 경로 정책도 그 이름을 판정한다. **내용만 어디에도 없다.**

### 1단계 수정이 영향을 바꾼 경위

이 결함은 1단계가 만든 것이 아니다. `captureGitDiff`는 처음부터 `git diff`였다. 그러나 1단계가 P0-8을 고치면서 **Run 종료 시 격리 트리를 폐기**하도록 바꿨고, 그 순간 영향의 크기가 달라졌다.

| | 1단계 이전 | 1단계 이후 |
|---|---|---|
| 신규 파일 내용의 소재 | 격리 트리에 남아 있음 (폐기되지 않았으므로) | **없음** — 트리가 폐기되고 패치에도 없다 |
| 복구 가능성 | `git worktree list`로 트리를 찾아 직접 열람 | 불가능 |

즉 1단계는 "쓰레기가 쌓이는" 문제를 고치면서, 같은 쓰레기가 **유일한 사본**이던 데이터를 함께 지우게 됐다. 폐기와 증거 완전성은 한 쌍이고, 둘 중 하나만 고치면 이런 형태가 된다.

### fail-closed가 아니다

이것이 P1이 아니라 P0인 이유다.

- `verificationGateResult`는 신규 파일과 무관하게 `SATISFIED`가 될 수 있다.
- `pathViolations`는 이름 기준으로 판정하므로, 범위 안에 만든 신규 파일은 위반이 아니다 — 비어 있는 것이 정상이다.
- `workspaceDelta.added`가 비어 있지 않으므로 "무작업 Run" 규칙(P1-10)에도 걸리지 않는다.
- 따라서 **ACCEPTED가 정상적으로 난다.** 증거의 상당 부분이 사라진 채로.

스캐폴딩, 새 모듈 추가, 마이그레이션 파일 생성처럼 **신규 파일이 작업의 본체인 Task에서는 증거의 대부분이 소실된다.** 그리고 그 사실이 어떤 산출물에도 표시되지 않는다 — 조용히 빠진다는 점에서 2026-08-10 P0-5("깨져도 성공 메시지가 나온다")와 같은 계열이다.

### 우선순위: P0

### 해소

`fixes/stage1b-evidence-completeness.md` 참조. `git diff --no-index`로 untracked 파일의 내용을 패치에 싣고, 실을 수 없는 것(바이너리·상한 초과)은 패치 본문과 `changes.newFileCapture`에 사유와 함께 이름을 남긴 뒤 `NEW_FILE_CONTENT_NOT_CAPTURED`로 리뷰 게이트까지 올린다. intent-to-add(`git add -N`)는 인덱스를 변경하므로 채택하지 않았다 — 격리되지 않은 Run에서 그 인덱스는 사용자의 것이고, 관측이 관측 대상을 바꿔서는 안 된다.
