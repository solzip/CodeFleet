# 슬라이스 간 상호작용 검증

```text
점검 일시   : 2026-08-12
점검 대상   : 244fac79d024a09e881350dbefb90c767266cf60
방법        : 각 조합을 실행으로 확인했다. 코드 읽기만으로 판정한 항목은 그렇게 표시했다.
결과        : 4건 전부 통과. 그중 1건에서 규칙이 도달 불가임을 발견(P1-22).
```

각 슬라이스는 자기 범위에서만 검증됐다. 조합은 어느 슬라이스도 확인하지 않았으므로 여기서 본다.

---

## I-1. 격리(1단계) + 프로세스 경계(2단계)

**질문**: worktree git 호출이 상한에 걸리면 격리 준비 실패가 어떻게 보고되는가.

### 코드

`src/isolation.ts`의 `run()`이 `runCommand`에 위임한다 — 상한은 `ISOLATION_COMMAND_TIMEOUT_MS`(10분)와 4 MiB.

```ts
const result = await runCommand(command, args, "", cwd, {
  limits: { timeoutMs: ISOLATION_COMMAND_TIMEOUT_MS, outputCapBytes: 4 * 1024 * 1024 },
  env: gitProcessEnv()
});
return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
```

세 가지 소비 형태가 있다:

| 호출 | 무엇을 쓰는가 | 상한에 걸리면 |
|---|---|---|
| `worktree add` / `remove` | `code`, `stderr` | 타임아웃 → `code: null` → `GIT_WORKTREE_ADD_FAILED` / `ISOLATION_DISCARD_FAILED` |
| `rev-parse --git-dir` | `code`만 | 타임아웃 → 비-0 → `GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY` |
| `rev-parse --show-prefix` | **`stdout`을 데이터로** | 잘리면 **잘못된 prefix → 잘못된 서브트리 관측** |

### 실행

```
healthy prepare        : {"mode":"GIT_WORKTREE","unavailable":"","sameAsWorkspace":false}
unavailable prepare    : {"reason":"GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY","detail":"the workspace is not a git repository..."}
run with isolation unavailable: refused -> Run Planning is blocked: isolation GIT_WORKTREE was requested but is unavailable...
lock released after refusal: []
```

격리를 요구했는데 제공되지 못하면 Run이 거부되고 **락이 남지 않는다.**

### 판정: 통과, 단 잔여 위험 1건

타임아웃과 실패는 fail-closed로 보고된다. 그러나 `run()`이 `runCommand`의 `scanScope`를 **버린다** — 상한을 적용받는 지점 중 계측 결과를 기록하지 않는 유일한 곳이다. `--show-prefix`의 출력이 4 MiB에 이르는 것은 현실적으로 불가능하므로 지금은 도달 불가지만, **stdout을 데이터로 쓰는 호출에서 잘림을 보지 않는 패턴**은 P0-7·2단계가 닫은 것과 같은 종류다. 신규 **P1-23**.

부수 관찰: 타임아웃 메시지가 `"Adapter exceeded the ... ms limit"`이다. git 호출에도 "Adapter"라고 적힌다 — `runCommand`가 어댑터 전용이던 시절의 문구다. 오해를 부르지만 사실을 왜곡하지는 않는다.

---

## I-2. 신규 파일 캡처(1b) + 잘림 표면화(4단계)

**질문**: 두 표면화가 같은 파일에 겹칠 때 2단계가 정한 규칙대로 동작하는가.

2단계가 정한 규칙(`stage2-process-boundaries.md` §1-2): 사전에 알고 제외한 것은 `NEW_FILE_CONTENT_NOT_CAPTURED`(CAPABILITY_GAP, waiver 가능), 수집을 시도했으나 잘린 것은 `EVIDENCE_TRUNCATED`(EVIDENCE_DEFECT, waiver 불가). **한 파일에 둘 다 해당하면 잘림이 이긴다.**

### 실행

에이전트가 세 가지 신규 파일을 만든다: 상한 직전 크기(1 MiB − 10), 상한 초과(1 MiB + 10), 바이너리.

```
newFileCapture    : {"newFilesFound":3,"contentCaptured":1,"contentNotCaptured":2,
                     "bytesCaptured":1048566,"perFileLimitBytes":1048576,"totalLimitBytes":8388608}
notCaptured       : ["src/bin.dat","src/over.txt"]
unavailableReason : "NEW_FILE_CONTENT_NOT_CAPTURED"
summary reasons   : ["COMMAND_CHANNEL_NOT_HARNESS_VISIBLE","NEW_FILE_CONTENT_NOT_CAPTURED",
                     "PROVIDER_TRANSCRIPT_NOT_STRUCTURED"]
```

상한 직전 파일은 온전히 수록되고, 초과분과 바이너리는 이름·사유와 함께 `CAPABILITY_GAP`으로 표면화된다. 규칙대로다.

### 발견: 겹침 자체가 발생 불가

```
per-file limit : 1048576      (NEW_FILE_CONTENT_LIMIT_BYTES)
git cap        : 33554432     (GIT_EVIDENCE_OUTPUT_CAP_BYTES)
```

크기 검사를 통과한 파일은 1 MiB 이하이고, 그 파일 하나에 대한 `git diff --no-index` 출력은 대략 파일 크기에 헤더를 더한 값이다. 32 MiB 상한에 이를 수 없다. 상한을 초과한 파일은 **호출 자체가 일어나지 않는다.** 따라서 `captureNewFileContent` 안의 잘림 분기는 **현재 상수 조합에서 도달 불가**하고, 2단계가 정한 우선순위 규칙은 이 경로에서 한 번도 발동하지 않는다.

규칙이 틀린 것이 아니라 **공허하다.** 그리고 도달 불가이므로 그것을 발동시키는 테스트도 존재할 수 없다 — "일부러 실패하는 테스트로 고정한다"는 이 저장소의 규율을 적용할 수 없는 상태다.

### 판정: 통과 + 신규 **P1-22**

두 상한의 관계를 바꾸거나(예: 파일당 상한을 git 상한보다 크게), 이 경로에서 잘림이 불가능함을 코드에 단언으로 남기는 것이 정직한 처리다.

---

## I-3. 전면 차단(3단계) + 락(P0-3)

**질문**: 파손 원장으로 거부될 때 Run 락이 확실히 해제되는가.

`runTask`는 락을 잡은 뒤 `executeRun`을 부르고, `blockedQueueReason`은 `executeRun` 안에서 던진다. 해제는 `finally`에 있다.

### 실행

```
corrupt-ledger run  : refused -> Run is blocked: the ledger of Objective auth replayed as BLOCKED...
locks left behind   : []
lock file exists    : false

unreadable-dir run  : refused -> Run is blocked: the Objective queue at .codefleet/objectives could not be read (ENOTDIR)...
locks left behind   : []
```

### 판정: 통과

두 거부 경로 모두 락을 남기지 않는다. 남겼다면 그 Task는 사람이 `codefleet lock break`를 칠 때까지 영구 차단됐을 것이고, 파손 원장을 고친 뒤에도 실행할 수 없었을 것이다.

I-1의 격리 거부에서도 락 잔존 0을 확인했으므로, **거부 경로 세 종류(승인·큐·격리) 전부에서 락이 해제된다.**

---

## I-4. P0-11 캡처(1b) + 폐기(1단계)

**질문**: 신규 파일이 패치에 담기기 전에 폐기가 일어날 수 있는 순서가 존재하는가.

### 코드 순서

`executeRun` 안에서:

1. 에이전트 실행 (`observedPath`)
2. `captureGitDiff(observedPath, runGitEvidence)` — 추적 diff + `status` + 파일별 `--no-index`
3. `captureGitChangedFiles`, POST_RUN 스냅샷, 경로 정책, 검증 커맨드
4. **`prepared.discard()`** — 증거 수집이 끝난 직후
5. 관측·요약·run-record 기록

`runTask`의 `finally`가 두 번째 `discard()`를 부르지만 멱등이다. 2와 4 사이에 폐기가 끼어들 경로는 없다 — `discard`는 4와 `finally` 두 곳에서만 호출된다.

### 실행 (`isolationMode: GIT_WORKTREE`, 에이전트가 신규 파일만 생성)

```
tree discarded          : true
tree still on disk      : false
created content in patch: true
changedFiles            : ["src/only-in-tree.js"]
```

트리는 사라졌고 그 트리에만 존재하던 파일의 **내용**은 패치에 남아 있다.

### 판정: 통과

폐기가 캡처를 앞지르는 순서는 존재하지 않는다. 단 하나의 예외적 경로는 2 이전에 `executeRun`이 던지는 경우인데, 그때는 `finally`의 폐기만 일어나고 Run Trace 자체가 완성되지 않으므로 "패치는 있는데 내용이 없는" 상태가 만들어지지 않는다.

---

## 조합에서 새로 드러난 것

| 발견 | 조합 | 등재 |
|---|---|---|
| `isolation.ts`가 계측을 버린다 | I-1 | P1-23 |
| 잘림 우선순위 규칙이 도달 불가 | I-2 | P1-22 |

두 건 모두 **현재 피해가 없다.** 전자는 출력이 상한에 못 미쳐서, 후자는 상한 관계가 그것을 배제해서다. 그러나 둘 다 "상한 값을 바꾸면 조용히 성격이 바뀌는" 지점이므로, 상수를 조정할 때 함께 봐야 한다.
