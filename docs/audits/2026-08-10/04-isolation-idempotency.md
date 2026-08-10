# 04 — 실행 격리와 멱등성

```text
점검 일시   : 2026-08-10
점검 대상   : 3d793ec0802147c6d3825be36cbb1c893f52d951 (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 15274570 와 바이트 동일하고,
             3d793ec 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
점검 범위   : src/run.ts, src/agent.ts, src/mutation.ts, src/workspace-snapshot.ts,
             src/task.ts, src/review.ts, src/types.ts
측정 근거   : npm test — 128 tests, 128 pass
             grep 전수 — src/ 내 worktree/branch/container/sandbox/docker 참조 0건
판정 기준   : 격리·롤백·중복방지 각각에 대해 코드 경로 유무로 판정한다.
```

## 판정: **미구현 (격리·롤백) + 결함 (멱등성)**

## 4-1. 실행 격리 — **미구현. 작업 디렉터리를 직접 수정한다**

### isolation은 상수다

`src/run.ts:279-282`

```ts
isolation: {
  mode: "NONE",
  reason: "V0.2_MINIMAL_LOCAL_TRANSPORT"
},
```

프로파일에서 읽지 않는다. 조건 분기도 없다. run-plan.json에 기록되는 리터럴이다.

### 에이전트는 실제 프로젝트 디렉터리에서 돈다

`src/run.ts:172`

```ts
const projectPath = await resolveWorkspaceProjectPath(discovery.selectedWorkspaceRootRealPath, task.projectPath);
```

`src/run.ts:337-343`에서 이 `projectPath`가 그대로 `AgentRunInput`으로 전달되고, `src/agent.ts:41`

```ts
const result = await runCommand(command, args, prompt, input.projectPath);
```

`src/agent.ts:141-145`의 `spawn(command, args, { cwd, ... })` — cwd가 사용자의 실 저장소다. 복제본도 worktree도 컨테이너도 없다.

grep 결과 src/ 전체에서 `worktree`, `branch`, `container`, `sandbox`, `docker`, `chroot` 참조 **0건**.

### 격리 요구 플래그는 읽히지 않는다

`src/types.ts:48`

```ts
requireIsolationForMutation: true,
```

기본값이 `true`다. 소비 지점: **없음**(`src/config.ts:110-112`의 파싱이 유일한 등장). 즉 프로파일을 읽는 사람은 "변경 작업에 격리가 필수"라고 이해하지만 코드는 무조건 `mode: "NONE"`으로 간다.

프로젝트 자체 기록:

```
PROFILE_DEFAULTS_RUN_ISOLATION_MODE_SCHEMA : NOT_IMPLEMENTED
"isolation.mode is the constant NONE; no profile value is read."
```

### 유일한 방어선

`src/run.ts:1555-1573` `resolveWorkspaceProjectPath` — `projectPath`가 절대경로거나 `..`로 탈출하면 거부하고, realpath 해석 후 워크스페이스 내부인지 재확인한다. 이는 **Task가 지정하는 작업 위치**에 대한 방어이지 에이전트 행위에 대한 격리가 아니다.

## 4-2. 반려/실패 Task의 원자적 롤백 — **미구현**

### 롤백 코드가 없다

`git stash`, `git checkout --`, `git reset`, 백업 복원, 트랜잭션 취소에 해당하는 코드가 src/ 전체에 없다. git 호출 지점은 4곳뿐이고 전부 읽기 전용이다:

| 위치 | 명령 |
|---|---|
| `src/run.ts:1366` | `git diff --no-ext-diff -- .` |
| `src/run.ts:1386-1389` | `git status --porcelain=v1 --untracked-files=all -- .` |
| `src/workspace-snapshot.ts:89` | `git rev-parse HEAD` |
| `src/workspace-snapshot.ts:95,104` | `git status`, `git diff` |

### 스냅샷은 복원 불가능하다

`src/workspace-snapshot.ts:25-29`

```ts
export interface ScopedFileEntry {
  path: string;
  size: number;
  contentHash: string;   // ← 내용이 아니라 해시
}
```

`src/workspace-snapshot.ts:186-190`이 `createHash("sha256").update(await readFile(childPath))`로 해시만 저장한다. **원본 내용이 어디에도 보존되지 않으므로 스냅샷으로 되돌릴 수 없다.** 이는 설계상 의도된 것이다 — `workspace-snapshot.ts:113-115` 주석이 "stateHash is for integrity and replay comparison"이라고 명시한다. 무결성 확인용이지 백업이 아니다.

### 반려는 파일 하나를 쓰는 것으로 끝난다

`src/review.ts:253` — `REJECTED` 결정도 `review-decision.local.json`을 쓰고(`review.ts:253`), run-record를 갱신하고(`review.ts:254`) 끝난다. 워크스페이스에는 손대지 않는다. `src/review.ts:159-268` 전 구간에 파일 복원 코드 없음.

### 뮤테이션 엔진의 롤백 금지는 의도적이지만 대상이 다르다

`src/mutation.ts:4-6`

```
// M4 is the commit point: nothing before it leaves a durable change, and a failure after
// it keeps the appended event rather than rolling back, because this design
// forbids silent rollback and ledger rewriting.
```

이 규율은 **원장 이벤트**에 대한 것이고 타당하다(`mutation.ts:131-138`). 그러나 워크스페이스 파일에는 어떤 트랜잭션 경계도 적용되지 않는다. 애초에 `runTask`는 `runMutation`을 호출하지 않는다(아래 4-3 참조).

## 4-3. 동일 Task 중복 실행 — **결함. 방지 장치 없음**

### runId는 순번 증가일 뿐이다

`src/run.ts:1345-1363`

```ts
async function nextRunId(rootDir: string, date: Date): Promise<string> {
  const datePart = formatDate(date);
  ...
  const last = entries
    .map((entry) => entry.match(new RegExp(`^${datePart}_(\\d{3})$`)))
    ...
    .reduce((max, value) => Math.max(max, value), 0);
  return `${datePart}_${String(last + 1).padStart(3, "0")}`;
}
```

taskId를 보지 않는다. 기존 Run의 taskId를 대조하는 코드도 없다.

### runTask는 뮤테이션 락을 잡지 않는다

`src/mutation.ts:100-101`의 `workspace.lock`은 `runMutation`을 통과하는 호출만 보호한다. 사용처 전수:

| 호출자 | 위치 |
|---|---|
| `approveTask` | `src/task-ledger.ts:166` |
| `invalidateApproval` | `src/task-ledger.ts:233` |
| `createObjective` | `src/ledger.ts:505` |
| `attachTask` | `src/ledger.ts:659` |
| `transitionQueueItem` | `src/ledger.ts:732` |
| `reorderQueue` | `src/ledger.ts:781` |
| `importLocalReview` | `src/ledger.ts:878` |

**`runTask`는 목록에 없다.** `src/run.ts:136-673` 전 구간에서 `runMutation`/`acquireLock` 참조 0건.

### 재현 가능한 두 가지 실패

**(a) 동시 실행 시 runId 충돌**

두 프로세스가 `codefleet run task-001`을 동시에 시작하면:
1. 둘 다 `nextRunId`에서 같은 `entries`를 읽고 같은 `last`를 계산한다 (`run.ts:1350`).
2. 둘 다 같은 `runId`(`2026-08-10_001`)를 반환한다.
3. `src/run.ts:178` `mkdir(runDir, { recursive: true })` — `recursive: true`라 **에러 없이 통과한다.**
4. 이후 `run.ts:292, 315, 333, 345-348, 568, 593, 628, 670`의 모든 `writeFile`이 같은 경로에 서로를 덮어쓴다.

결과: 하나의 `.codefleet/runs/2026-08-10_001/`에 두 Run의 아티팩트가 섞인다. `run-plan.json`은 A의 것, `harness-observation.json`은 B의 것이 되는 식이다. 해시 검증(`src/review.ts:518-539`)이 나중에 불일치를 잡아 `HASH_INVALID`를 내겠지만, **그때는 이미 두 에이전트가 같은 작업 디렉터리를 동시에 수정한 뒤다.**

**(b) 순차 재실행이 무제한 허용**

`src/task.ts:76-81`

```ts
if (typeof value.status === "string" && !TASK_STATUSES.has(value.status)) {
  errors.push(...);
}
if (value.status !== "READY") {
  warnings.push("Task status is not READY. The run command will still execute it.");
}
```

`status: DONE`이어도 **경고**일 뿐이다. 그리고 `loadTask`(`src/task.ts:18-21`)는 `errors`만 보고 `warnings`는 버린다. 승인은 파일 해시가 그대로면 계속 유효하므로(`src/task-ledger.ts:104-111`), 같은 Task를 100번 실행해도 매번 통과한다. 실행 후 Task status를 갱신하는 코드도 없다(`run.ts`에서 task.yaml 쓰기는 `run.ts:195`의 스냅샷 복사뿐).

### 대비: 원장 계층의 멱등성은 제대로 구현돼 있다

공정하게 기록해 둔다. `src/mutation.ts:67-75` `computeMutationId`는 intent에서 결정론적으로 id를 유도하고, 시각과 사유 텍스트를 의도적으로 제외한다. `src/mutation.ts:113-122` M3가 이미 적용된 뮤테이션을 no-op으로 끝낸다. `src/mutation.ts:227-237` `canonicalize`가 키 순서 영향을 제거한다. **원장 쓰기는 멱등하다. 에이전트 실행만 멱등하지 않다.**

## 발생 조건과 영향 범위

**격리 부재 발생 조건**: `mode: "execute"`로 실행되는 모든 Run. 예외 없음.

**중복 실행 발생 조건**:
- (a) 동시: 두 터미널, CI 잡 재시도, watch 스크립트, 사용자의 Ctrl-C 후 재실행.
- (b) 순차: 특별한 조건 없음. 기본 동작이다.

**영향 범위**
- 에이전트 실패 시 부분 변경분이 사용자의 실 저장소에 그대로 남는다. 되돌리는 것은 전적으로 사용자의 git 사용 능력에 달려 있다.
- 리뷰에서 REJECTED된 변경도 워크스페이스에 그대로 남는다. 다음 Run의 PRE_RUN 스냅샷(`run.ts:322`)이 그 오염된 상태를 기준선으로 잡으므로, **이후 Run의 delta는 이전 반려분을 "변경 없음"으로 본다.**
- 동시 실행 시 두 에이전트가 같은 파일을 동시에 수정하면 lost update가 발생하고, 증거 아티팩트가 섞여 어느 쪽이 무엇을 했는지 사후 재구성이 불가능해진다.
- `git`이 없는 프로젝트에서는 `captureGitDiff`가 `GIT_DIFF_FAILED`로 떨어져(`run.ts:1371-1379`) 사용자가 수동 복구할 단서조차 남지 않는다.

## 우선순위

| 항목 | 판정 | 우선순위 |
|---|---|---|
| 실행 격리 | 미구현 | **P0** |
| 원자적 롤백 | 미구현 | **P1** |
| 중복/동시 실행 방지 | 결함 | **P0** |

격리와 중복방지를 P0로 두는 이유: 둘 다 **사용자의 실제 저장소를 직접 훼손할 수 있고**, 훼손 후 복구 수단이 제품 안에 없다. 롤백을 P1로 두는 이유는 격리가 도입되면 롤백이 자연히 따라오기 때문이다(worktree를 버리는 것이 곧 롤백이다).

## 권고

1. **P0** — `git worktree add`로 Run별 격리 트리를 만들고 에이전트를 거기서 실행한다. `src/run.ts:172`의 `projectPath`를 worktree 경로로 치환하면 되고, `src/run.ts:279-282`의 `isolation` 블록이 이미 그 사실을 기록할 자리를 갖고 있다. git이 없는 프로젝트는 디렉터리 복제로 대체하되, 어느 쪽도 불가능하면 `requireIsolationForMutation: true`(`types.ts:48`)에 따라 실행을 거부한다 — 그 플래그가 존재하는 이유가 바로 이것이다.
2. **P0** — `runTask` 진입부에서 `runMutation`(또는 동일한 `open(path, "wx")` 방식의 배타적 락)으로 Run 단위 락을 잡는다. 락 키는 `taskId` 기준으로 두어 같은 Task의 동시 실행을 명시적으로 막는다. `src/mutation.ts:160-186`의 구현을 그대로 재사용할 수 있다.
3. **P1** — `nextRunId`(`run.ts:1345`)를 락 안으로 넣거나, `mkdir(runDir)`를 `recursive: false`로 바꿔 충돌이 조용히 통과하지 않게 한다. 현재 `recursive: true`가 충돌을 삼키고 있다.
4. **P1** — 격리 도입 후, REJECTED 리뷰가 worktree를 폐기하도록 `src/review.ts`에 연결한다. 그것이 "원자적 롤백"의 구현이 된다.
5. **P2** — Run 완료 시 Task status 전이(READY → RUNNING → DONE/FAILED)를 원장 이벤트로 남기고, 이미 DONE인 Task의 재실행에는 명시적 플래그를 요구한다. 현재 `status`는 `task.ts:76-81`에서 형식만 검사되는 장식 필드다.
