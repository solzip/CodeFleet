# 06 — 실패 모드

```text
점검 일시   : 2026-08-10
점검 대상   : 3d793ec0802147c6d3825be36cbb1c893f52d951 (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 15274570 와 바이트 동일하고,
             3d793ec 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
점검 범위   : src/agent.ts, src/run.ts, src/mutation.ts, src/review.ts, src/workspace-snapshot.ts
측정 근거   : npm test — 128 tests, 128 pass
             grep 전수 — src/ 내 timeout / AbortSignal / maxBuffer / kill / SIGTERM / budget 참조 각 0건
판정 기준   : 중단 장치·충돌 처리·거짓 완료 탐지 각각을 코드 경로로 판정한다.
```

## 판정: **미구현 (중단 장치·충돌 처리) + 부분 통과 (거짓 완료 탐지)**

## 6-1. 무한 루프 / 토큰 폭주 중단 장치 — **미구현**

### grep 결과

`src/` 전체(17개 파일 6,588줄)에서:

| 식별자 | 참조 수 |
|---|---|
| `timeout` | **0** |
| `AbortSignal` / `AbortController` | **0** |
| `maxBuffer` | **0** |
| `kill` / `SIGTERM` / `SIGKILL` | **0** |
| `budget` / `maxTokens` / `costLimit` | **0** |

### 에이전트 실행 코드

`src/agent.ts:134-179`

```ts
export function runCommand(command, args, stdin, cwd): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    ...
    child.stdout.on("data", (chunk) => { stdout += chunk; });   // agent.ts:152-154
    child.stderr.on("data", (chunk) => { stderr += chunk; });   // agent.ts:155-157
    ...
    child.on("close", (code) => { resolve({...}); });
```

Promise가 resolve되는 경로는 `error`(`agent.ts:159`)와 `close`(`agent.ts:168`) 둘뿐이다. **자식 프로세스가 종료하지 않으면 Promise는 영원히 pending이다.**

`spawn` 옵션에 `timeout`도 `signal`도 없다. Node의 `child_process.spawn`은 기본적으로 시간 제한을 걸지 않는다.

### 결과 두 가지

**(a) 무한 대기**: 에이전트가 루프에 빠지면 `codefleet run`은 무한정 블록된다. `src/run.ts:337` `await runAgentSafely(...)`에서 멈추고, `src/cli.ts:572` `await main(...)`도 멈춘다. 사용자가 Ctrl-C를 누르는 것 외에 종료 수단이 없다. 그리고 Ctrl-C로 죽이면 `.codefleet/runs/<runId>/`에는 run-plan / prompt / adapter-request / workspace-pre-run 만 남고 나머지가 없는 불완전 디렉터리가 된다 — `src/run.ts:685-691` `listRuns`가 이런 디렉터리를 조용히 건너뛴다.

**(b) 무제한 메모리 증가**: `stdout += chunk`가 상한 없이 문자열을 누적한다. 토큰을 폭주시키는 에이전트는 그대로 Node 프로세스의 힙을 소진시킨다. `maxBuffer` 같은 방어가 없다.

### 검증 커맨드 실행에도 동일하다

`src/run.ts:1451-1485` `runProcess` — 같은 구조, 같은 부재. `mvn test`가 걸리면 Run 전체가 멈춘다. 이 함수는 `captureGitDiff`(`run.ts:1366`), `captureGitChangedFiles`(`run.ts:1386`), 워크스페이스 스냅샷(`workspace-snapshot.ts:87`)에서도 쓰이므로 git이 응답하지 않는 상황에서도 같은 결과가 된다.

### 비용 상한이라는 개념 자체가 없다

토큰 수, 호출 횟수, 소요 시간, 금액 중 어느 것도 계측되지 않는다. `AgentRunResult`(`src/types.ts:142-150`)에 사용량 필드가 없고, run-summary(`src/run.ts:725-779`)에도 없다. 반복 실행 횟수 제한도 없다(04번 문서 4-3 참조).

## 6-2. 병렬 Task가 같은 파일을 수정할 때의 충돌 처리 — **미구현**

### 락은 원장 전용이고 Run에는 걸리지 않는다

`src/mutation.ts:100` `workspace.lock`은 `runMutation`을 통과하는 7개 호출자만 보호한다(04번 문서 4-3의 표 참조). **`runTask`는 그 목록에 없다.**

파일 단위 락, Task 단위 락, 낙관적 동시성 제어(버전 비교) 어느 것도 없다.

### 스냅샷 델타는 제3자의 쓰기를 구분하지 못한다

`src/workspace-snapshot.ts:205-240` `computeDelta`는 PRE와 POST의 해시 맵을 비교할 뿐이다:

```ts
for (const [file, hash] of after) {
  const previous = before.get(file);
  if (previous === undefined) { added.push(file); }
  else if (previous !== hash) { modified.push(file); }
}
```

Run A와 Run B가 동시에 돌면, A의 POST 스냅샷은 B가 만든 변경까지 포함한다. A의 `workspaceDelta`는 그것을 **A의 에이전트가 한 일로 보고한다.** 두 번째 작성자의 존재를 나타내는 필드가 스키마에 없다.

`src/run.ts:521-553` `policyChecks`도 마찬가지다. B가 A의 scope 밖 파일을 고치면, A의 Run이 `PATH_OUTSIDE_ALLOWED_PATHS` 위반으로 기록한다. **무고한 Run에 위반이 귀속된다.**

### git 레벨 방어도 없다

`git status`/`git diff`는 워킹 트리 전체를 본다. Run별 브랜치도 worktree도 없으므로(04번 참조) 작업 분리 지점이 존재하지 않는다. 병렬 실행 시 lost update가 발생해도 감지 수단이 없다.

### 대비: 원장 계층은 제대로 직렬화된다

`src/mutation.ts:170-185`

```ts
const handle = await open(lockPath, "wx");   // 배타적 생성
...
throw new MutationLockHeldError(await readHolder(lockPath));
```

`wx` 플래그 기반 배타 생성으로 단일 승자를 보장하고, 실패 시 홀더(pid/host/시각/종류)를 명시한다(`mutation.ts:53-58`). stale 락을 자동으로 깨지 않고 사람의 명시적 `codefleet lock break`를 요구한다(`mutation.ts:182-184`, `src/cli.ts:407-411`). **동시성 제어를 어떻게 해야 하는지 이 코드베이스는 이미 알고 있다. 그것을 Run에 적용하지 않았을 뿐이다.**

## 6-3. 에이전트의 거짓 "완료" 보고 탐지 — **부분 통과**

### 잡히는 경우 (통과)

에이전트의 자기 보고는 exit code에서만 온다. `src/agent.ts:168-175`

```ts
child.on("close", (code) => {
  resolve({ status: code === 0 ? "SUCCEEDED" : "FAILED", ... });
});
```

이것이 `src/run.ts:1191-1198`을 거쳐 `result.value = "DONE"`이 된다.

그러나 **DONE은 수락 조건이 아니다.** `src/review.ts:451-461`이 두 조건을 따로 요구한다:

```ts
if (bundle.observedResultSnapshot !== "DONE") { blockedReasons.push(...); }
if (bundle.verificationGateResult !== "SATISFIED" && ... !== "WAIVED_ALLOWED") { blockedReasons.push(...); }
```

그리고 `verificationGateResult`는 **Harness가 직접 실행한** 커맨드에서만 나온다:
- `src/run.ts:925` — `runProcess`로 Harness가 직접 실행
- `src/run.ts:936-944` — `authority: "HARNESS_EXECUTED"`, `result: code === 0 ? "PASS" : "FAIL"`
- `src/run.ts:965` — 파생 시 `authority === "HARNESS_EXECUTED"`인 attempt만 센다
- `src/run.ts:987-993` — 하나라도 FAIL이면 `NOT_SATISFIED`

에이전트가 보고한 커맨드는 판정에 절대 들어오지 않는다. `src/run.ts:438-448`의 주석이 이 원칙을 명시하고("judging it would mean believing it"), `src/run.ts:1119-1121`, `src/run.ts:1159-1167`의 assert가 `authority NONE + PASS` 조합을 예외로 막는다.

**따라서 "에이전트가 성공했다고 말했지만 테스트가 실패하는" 경우는 확실히 잡힌다.** 이 부분은 잘 만들어졌다.

### 잡히지 않는 경우 (결함)

**아무것도 하지 않은 Run이 수락될 수 있다.**

`src/review.ts:427-470` `evaluateAcceptance`가 검사하는 항목 전부:
1. `unavailableReasons`의 각 항목 (EVIDENCE_DEFECT는 차단, CAPABILITY_GAP은 waiver 가능)
2. `observedResultSnapshot === "DONE"`
3. `verificationGateResult ∈ {SATISFIED, WAIVED_ALLOWED}`
4. `pathViolationSummary.hasViolation === false`

**`workspaceDelta`가 비어 있는지, `changedFiles`가 비어 있는지는 검사하지 않는다.** 이 값들은 `src/run.ts:367`에서 계산되고 `src/run-record.ts:82-101`에 출력되지만 어떤 게이트도 참조하지 않는다. `ReviewEvidenceBundle`(`src/review.ts:47-86`)에 delta 필드 자체가 없다.

재현 시나리오:
1. Task의 `verification.commands`가 `["npm", "test"]`이고 기존 테스트가 이미 통과 상태다.
2. 에이전트가 프롬프트를 읽고 아무것도 고치지 않은 채 exit 0으로 끝난다.
3. `result.value = "DONE"` (`run.ts:1192-1194`).
4. Harness가 `npm test`를 직접 실행 → 통과 → `observedCheck: "PASS"`, `verificationGateResult: "SATISFIED"` (`run.ts:987-993`).
5. 경로 위반 없음(변경이 없으니 당연히).
6. `evaluateAcceptance` 통과 → **ACCEPTED 가능.**

즉 검증 조건이 잡아내는 것은 "회귀"이지 "완료"가 아니다. 이는 검증 커맨드가 Task 목표와 무관해도 되기 때문이다(01번 문서 참조: `doneCriteria`와 `verification.commands` 사이에 참조 무결성이 없다).

### 부가: 모든 실 실행은 waiver를 거쳐야 한다

`mode: "execute"`로 실제 실행하면 `harnessObservation.commands.unavailableReason`이 항상 `"COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"`이다(`src/run.ts:519`, 상수 `run.ts:821` 때문에 예외 없음). 이것이 `runSummaryUnavailableReasons`(`run.ts:799`)를 거쳐 번들의 `unavailableReasons`에 들어가고, `classifyGap`(`src/review.ts:42-45`)에서 `CAPABILITY_GAP`으로 분류된다.

결과: **실제로 실행된 모든 Run의 ACCEPTED는 `--waive-gap COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`을 요구한다.** 사람이 매번 명시적으로 책임을 지는 구조이고, waiver는 justification과 함께 원장까지 실려간다(`src/ledger.ts:869-873`). 이 설계는 정직하다. 다만 매 Run마다 같은 waiver를 반복하게 되면 형식화될 위험이 있고, 그 waiver가 있는 상태에서는 위 5번 시나리오(무작업 Run)도 함께 통과한다.

## 발생 조건과 영향 범위

**6-1 발생 조건**: 에이전트가 응답하지 않거나 루프에 빠진다. LLM 에이전트에서 드물지 않은 일이다.

**6-2 발생 조건**: 두 Run을 동시에 실행한다. 이 제품이 "Fleet"(다수 에이전트 오케스트레이션)을 표방하는 이상 이것은 예외 상황이 아니라 목표 사용 형태다.

**6-3 발생 조건**: 검증 커맨드가 Task 목표를 직접 검사하지 않는 경우. `examples/tasks/task-001.yaml:10-13`의 `mvn -q test`가 정확히 그런 형태다 — `doneCriteria`의 "Successful controller responses return ApiResponse<T>"를 검사하는 테스트가 없다면 이 Run은 무작업으로도 통과한다.

**영향 범위**
- 6-1: `codefleet run`이 무한 정지. CI에 넣으면 잡이 타임아웃까지 점유. 메모리 소진 시 프로세스가 죽으면서 Run 아티팩트가 불완전 상태로 남고, 그 사이 에이전트가 워크스페이스에 남긴 부분 변경은 롤백되지 않는다(04번 참조).
- 6-2: 잘못된 귀속. Run A의 증거에 Run B의 변경이 섞이고 위반까지 A에게 기록된다. 이 제품의 핵심 주장("Harness가 관측한 증거만 인정한다")이 성립하지 않게 된다 — 관측은 정확하지만 귀속이 틀리기 때문이다.
- 6-3: 아무 일도 하지 않은 Run이 VERIFIED까지 도달할 수 있다(`src/ledger.ts:437-440`). 큐가 진행되고 감사 기록에는 "검증 완료"가 남는다.

## 우선순위

| 항목 | 판정 | 우선순위 |
|---|---|---|
| 타임아웃 / 출력 상한 | 미구현 | **P0** |
| 비용·토큰 상한 | 미구현 | **P1** |
| 병렬 충돌 처리 | 미구현 | **P0** |
| 거짓 완료 탐지 (테스트 실패 케이스) | 통과 | — |
| 거짓 완료 탐지 (무작업 케이스) | 결함 | **P1** |

## 권고

1. **P0** — `src/agent.ts:141`과 `src/run.ts:1457`의 `spawn`에 `timeout`(또는 `AbortSignal.timeout`)과 `killSignal`을 준다. 값은 프로파일에서 읽되 기본값을 반드시 유한하게 둔다. 타임아웃으로 종료된 Run은 `AgentRunResult.status = "FAILED"` + 전용 `unavailableReason`(예: `AGENT_TIMEOUT`)으로 기록해 성공과 구분한다.
2. **P0** — stdout/stderr 누적에 바이트 상한을 둔다(`agent.ts:152-157`). 상한 초과 시 잘라내고 `scanScope`에 잘린 바이트 수를 남긴다 — 이 코드베이스의 규율("무엇을 스캔했는지 보고한다", `CLAUDE.md`)과 정확히 같은 형태다.
3. **P0** — Run 단위 배타 락을 도입한다. `src/mutation.ts:160-186`의 구현을 그대로 재사용하면 되고, 04번 문서의 권고 2와 동일한 작업이다. 병렬 Fleet을 지원하려면 그 위에 worktree 격리(04번 권고 1)가 전제되어야 한다.
4. **P1** — `evaluateAcceptance`(`src/review.ts:427`)에 "관측된 변경이 0건인 Run은 ACCEPTED 불가" 규칙을 추가한다. `workspaceDelta`가 이미 계산돼 있으므로 `ReviewEvidenceBundle`에 실어 올리기만 하면 된다. 예외가 필요한 Task(조사·검증 전용)는 명시적 플래그로 선언하게 한다.
5. **P1** — `AgentRunResult`에 사용량 필드(경과 시간, 출력 바이트, 가능하면 토큰 수)를 추가하고 run-summary에 기록한다. 상한 부과의 전제이고, 기록 없이는 상한값을 정할 근거도 없다.
