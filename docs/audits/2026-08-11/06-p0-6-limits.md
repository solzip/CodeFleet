# P0-6 — 타임아웃 · 출력 상한

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/agent.ts, src/run.ts, src/isolation.ts, src/types.ts,
             src/run-record.ts, test/isolation.test.ts
측정 근거   : npm test — 199 tests, 199 pass
             실측 재현 2건 (아래 §C-1, §C-2)
발생 조건   : 에이전트 또는 검증 커맨드가 종료하지 않거나 출력을 폭주시킨다
```

## 판정: **부분해소**

(A) 부분 통과 · (B) 부분 통과 · (C) 우회 2건.

---

## (A) 코드 검증

### A-1. 실제 값과 설정 위치

| 항목 | 값 | 위치 | 설정 가능? |
|---|---|---|---|
| 어댑터 타임아웃 | 30분 (`30 * 60 * 1000`) | `src/agent.ts:154` `DEFAULT_ADAPTER_TIMEOUT_MS` | **불가** |
| 어댑터 출력 상한 | 16MB (`16 * 1024 * 1024`), stdout·stderr 각각 | `src/agent.ts:155` `DEFAULT_ADAPTER_OUTPUT_CAP_BYTES` | **불가** |
| 검증 커맨드 타임아웃 | **없음** | `src/run.ts:1980-2014` `runProcess` | — |
| 검증 커맨드 출력 상한 | **없음** | 같은 곳 | — |
| git / 스냅샷 프로세스 | **없음** | 같은 곳 + `src/isolation.ts:32-43` | — |

"프로파일에서 읽되 기본값을 유한하게" 중 후반만 이행됐다. `AgentRunInput.limits`(`src/types.ts:157`)는 타입에만 존재하고 **채우는 코드가 없다.** `src/run.ts:691-704`의 `runAgentSafely` 호출에 `limits`가 없고, `src/config.ts`에 `timeoutMs`/`outputCapBytes` 파싱도 없다. 두 값은 사실상 상수다.

### A-2. 초과 시 프로세스 kill 경로

`src/agent.ts:213-223`

```ts
// Killing on timeout is what makes an agent that never exits a failed Run
// rather than a CLI that waits forever.
const timer = setTimeout(() => {
  child.kill("SIGTERM");
  finish({
    status: "FAILED",
    exitCode: null,
    stdout,
    stderr: `${stderr}Adapter exceeded the ${timeoutMs} ms limit and was terminated.\n`
  });
}, timeoutMs);
```

`finish`(`agent.ts:199-211`)가 `settled` 플래그로 중복 resolve를 막고 타이머를 해제한다. kill된 프로세스는 `status: "FAILED"`, `exitCode: null`이 되고, 사유가 stderr에 들어간다. `src/run.ts:1027-1029`가 그 첫 줄을 `result.error`로 승격한다.

**"사유가 적힌 실패 Run"은 성립한다.** 다만 전용 `unavailableReason`(예: `AGENT_TIMEOUT`)은 없다 — grep 결과 `src/` 전체에 `AGENT_TIMEOUT` 0건. 사유는 자유 텍스트로만 남으므로 기계 판정에는 쓸 수 없다. 그리고 stderr에 에이전트 자신의 출력이 이미 있으면 `firstLine(stderr)`가 타임아웃 문구가 아닌 다른 줄을 집는다.

### A-3. 출력 상한

`src/agent.ts:227-252`. `Buffer.byteLength`로 남은 여유를 계산하고, 초과분은 `stdoutTruncatedBytes` / `stderrTruncatedBytes`에 누적한다. 청크 중간까지만 받고 나머지를 버리는 경계 처리도 있다.

---

## (B) 테스트 검증 — 부분 통과

| 검증 대상 | 테스트 | 결과 |
|---|---|---|
| 어댑터 타임아웃 kill | `test/isolation.test.ts:34-49` | 통과. 400ms 한도로 무한 프로세스를 띄우고 `status FAILED`, `exitCode null`, 거부 문구, 경과시간 < 10초를 assert |
| 어댑터 출력 상한 + 잘린 바이트 계수 | `test/isolation.test.ts:51-73` | 통과. 1000바이트 한도로 50,000바이트를 뱉는 프로세스를 돌려 `stdout.length <= 1000`, `stdoutTruncatedBytes > 0`, `outputCapBytes === 1000` assert |
| **검증 커맨드 프로세스의 상한** | **없음** | 상한 자체가 없으므로 재현 테스트가 존재할 수 없다 |
| **SIGTERM 무시 프로세스** | **없음** | 에스컬레이션 코드가 없다 |
| **잘린 바이트가 산출물에 남는가** | **없음** | 아래 C-2 |

---

## (C) 반증 시도 — 우회 2건

### C-1. SIGTERM 무시 프로세스에 대한 SIGKILL 에스컬레이션 — 없음

grep 전수: `src/` 전체에서 `SIGKILL` **0건**, `killSignal` **0건**, `detached` **0건**, 프로세스 그룹 종료 코드 **0건**.

`agent.ts:216`의 `child.kill("SIGTERM")` 이후 재시도 타이머가 없고, `finish`가 즉시 Promise를 resolve하므로 **자식의 실제 종료를 확인하지 않는다.**

실측(이 호스트, win32):

```
=== runCommand returned after 813 ms with status FAILED
=== child log lines: 2
=== ignored SIGTERM lines: 0
=== child was still writing 660 ms after start (limit was 800 ms)
=== VERDICT: child survived the timeout kill: false
```

**Windows에서는 재현되지 않았다.** Node의 `child.kill("SIGTERM")`이 win32에서 `TerminateProcess`로 매핑되어 무시할 수 없기 때문이고, 제품 코드가 그것을 의도했다는 근거는 없다. POSIX(Linux/macOS)에서는 `process.on("SIGTERM", ...)` 핸들러를 단 자식이 살아남고, `runCommand`는 FAILED를 반환하지만 **에이전트는 계속 워크스페이스를 고친다.** 그 상태에서 `runTask`는 POST_RUN 스냅샷을 찍으므로, 아직 쓰고 있는 트리에 대해 delta를 계산하게 된다.

플랫폼 무관하게 성립하는 부분도 있다: **kill 대상이 직계 자식 하나뿐이다.** 어댑터가 손자 프로세스를 띄우면(에이전트 CLI가 하위 도구를 spawn하는 것은 정상 동작이다) 그것들은 살아남는다.

판정: 코드 경로 부재는 확정. 실증은 이 호스트에서 불가.

### C-2. 잘린 바이트가 리뷰어에게 도달하는가 — 도달하지 않는다 (재현됨)

`runCommand`는 `scanScope`를 반환한다(`agent.ts:205-210`):

```ts
resolve({
  ...result,
  // The truncated byte count travels with the output, so a capped
  // transcript is distinguishable from one that simply ended.
  scanScope: { stdoutTruncatedBytes, stderrTruncatedBytes, timeoutMs, outputCapBytes }
} as AgentRunResult);
```

주석이 말하는 "travels with the output"은 `runCommand`의 반환값까지다. **`src/run.ts`가 그 값을 어디에도 쓰지 않는다.**

`adapter-result.json`을 만드는 `run.ts:932-953`의 필드 목록에 `scanScope`가 없다. 실제 Run Trace에서 확인:

```
adapter-result keys: schemaVersion, documentKind, runId, runPlanId, createdAt, runPlanRef,
                     adapterRequestRef, adapterId, adapterExecutionStatus, synthetic,
                     exitCode, status, providerReportedObservations, adapterError
has scanScope? false

--- grep TruncatedBytes|outputCapBytes|timeoutMs across every artifact of that run ---
(empty = never persisted)
```

`src/run-record.ts`에도 truncation 관련 출력이 0건이다.

결과: **16MB가 잘려도 stdout.log는 그냥 16MB 파일로 보이고, 잘렸다는 신호가 산출물·run-record·ReviewEvidenceBundle 어디에도 없다.** 리뷰어(사람)도, 게이트(기계)도 잘림을 인지할 수 없다. 잘린 transcript를 완전한 것으로 읽게 된다.

이 코드베이스의 규율("A check that quantifies over a set must report what it scanned", CLAUDE.md)에 정확히 어긋난다. 계수는 만들어 놓고 버려진다.

### C-3. 검증 커맨드 프로세스에 상한이 없다 (재현됨)

`src/run.ts:1980-2014` `runProcess` — `spawn` 옵션은 `{ cwd, shell: false, stdio }`뿐이다. timeout 없음, 출력 상한 없음, `env` 없음.

이 함수를 통과하는 것: 검증 커맨드(`run.ts:1286`), `git diff`(`run.ts:1895`), `git status`(`run.ts:1915`), 워크스페이스 스냅샷의 git 호출(`workspace-snapshot.ts:87`).

실측 — 9초 걸리는 검증 커맨드:

```
=== verification command hung for 9000 ms; runTask took 9475 ms
=== VERDICT unbounded verification process: true
=== env seen by the verification child: "verification-child-should-not-see-this"
=== run status: SUCCEEDED
```

`mvn test`가 걸리면 `codefleet run` 전체가 여전히 무한 정지한다. 2026-08-10 권고 1이 명시적으로 `src/run.ts`의 spawn을 지목했는데(`"src/agent.ts:141과 src/run.ts:1457의 spawn에"`), 어댑터 쪽만 반영됐다.

같은 실행에서 env 상속도 확인됐다 — P0-1 §C-1과 동일한 사실이다. `src/isolation.ts:32-43`도 같은 상태이므로, `git worktree add`가 응답하지 않으면 Run이 그대로 멈춘다.

신규 **P0-10**으로 등재했다 (`07-new-defects.md`).

---

## 권고

1. **P0** — `src/run.ts:1980`의 `runProcess`와 `src/isolation.ts:32`의 `run`을 `src/agent.ts:172`의 `runCommand`에 위임한다. 한 번에 timeout·출력 상한·env 목록이 붙고, 세 spawn이 하나의 규율을 공유한다.
2. **P0** — `agentResult.scanScope`를 `adapter-result.json`에 싣고(`run.ts:932-953`), run-record.md에 잘린 바이트 수와 적용된 상한을 출력한다. 계수하고 버리는 것은 계수하지 않는 것과 같다.
3. **P1** — 타임아웃으로 종료된 Run에 전용 `unavailableReason`(예: `ADAPTER_TIMEOUT`)을 부여해 `runSummaryUnavailableReasons`를 거쳐 리뷰 번들까지 올린다. 지금은 자유 텍스트 stderr 한 줄이 전부라 게이트가 읽을 수 없다.
4. **P1** — SIGTERM 후 유예 시간을 두고 SIGKILL로 에스컬레이션한다. 손자 프로세스까지 잡으려면 `detached: true` + 프로세스 그룹 종료(win32는 `taskkill /T`)가 필요하다.
5. **P1** — `limits`를 프로파일에서 읽는다. 지금은 타입만 있고 채우는 코드가 없어 30분·16MB가 조정 불가 상수다. CI에서 30분은 너무 길고, 로컬 대화형 세션에서 16MB는 너무 크다.
