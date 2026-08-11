# P0-1 — 가드레일 강제 (파일 범위 · 명령 정책 · 자격증명)

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/agent.ts, src/run.ts, src/isolation.ts, src/command-policy.ts,
             src/config.ts, test/isolation.test.ts, test/adapter-resolution.test.ts
측정 근거   : npm test — 199 tests, 199 pass
             실측 재현 2건 (아래 §C-1, §C-2)
발생 조건   : mode: "execute" (= harnessMode COMMAND_EXEC, src/config.ts:78) 로 도는 모든 Run
```

## 판정: **미해소**

(A) 부분 통과 · (B) 실패 · (C) 우회 3건.

---

## (A) 코드 검증

### A-1. 어댑터의 capabilities 거부 — 존재하나 축이 하나뿐

`src/agent.ts:46-53`

```ts
if (input.capabilities !== undefined && input.capabilities.commandExecution !== true) {
  return {
    status: "FAILED",
    exitCode: null,
    stdout: "",
    stderr: "Adapter refused to launch: AdapterRequest capabilities do not permit command execution.\n"
  };
}
```

거부가 일어나는 지점은 `CodexAdapter.run()` 내부, `runCommand` 호출(`agent.ts:60`) **직전**이다. 값의 출처는 `src/run.ts:700-703`이 넘기는 `{ fileEdit, commandExecution }`이고, 그 값은 `run.ts:461-469`에서 `modeRank(effectiveMode)`로 계산된다.

**capabilities 검사를 우회해 spawn에 도달하는 코드 경로 — 전수 확인 결과 없음.**

| 확인 항목 | 결과 |
|---|---|
| `spawn` 호출 지점 (src/ 전수) | 3곳: `agent.ts:183`, `isolation.ts:34`, `run.ts:1986` |
| 그중 에이전트를 띄우는 지점 | `agent.ts:183` 하나 |
| `createAgentAdapter` 호출 지점 | `src/run.ts:1839` 하나 |
| `agent.run(...)` 호출 지점 | `src/run.ts:1840` 하나 |
| `runAgentSafely` 호출 지점 | `src/run.ts:691` 하나 |
| `capabilities` 미전달로 검사가 건너뛰어지는 호출 | 없음 — `run.ts:700`이 항상 전달 |

`input.capabilities !== undefined` 가드 때문에 capabilities 없이 호출하면 검사가 통째로 건너뛰어지지만, 그런 호출자는 이 빌드에 존재하지 않는다. `LOCAL_ADAPTER_REGISTRY`도 `["codex"]` 1종이고 그 외 이름은 `agent.ts:27`에서 throw된다.

**다만 이 거부는 "실행할까 말까"의 이진 판단이다.** AdapterRequest에 실린 `allowedPaths`/`deniedPaths`/`deniedCommands`(`run.ts:461-469`)는 어댑터가 읽지 않는다. 자식 프로세스에 전달되는 것은 여전히 프롬프트 문자열뿐(`agent.ts:55-60`)이다. 즉 **범위 제약은 여전히 `src/prompt.ts`의 문장이다.**

### A-2. 자식 프로세스 env — 어댑터만 제한된다

`src/agent.ts:190`

```ts
env: options.env ?? { PATH: process.env.PATH ?? "" }
```

이 한 곳은 정확하다. 그러나 spawn 지점 전수 확인 결과 나머지 두 곳에 `env` 옵션이 없다:

| 지점 | 호출 대상 | `env` |
|---|---|---|
| `src/agent.ts:183` | 에이전트 어댑터 | **`{ PATH }` 명시** |
| `src/run.ts:1986` (`runProcess`) | 검증 커맨드, `git diff`, `git status`, 워크스페이스 스냅샷 | **없음 → `process.env` 전량 상속** |
| `src/isolation.ts:34` | `git worktree add/remove`, `git rev-parse` | **없음 → `process.env` 전량 상속** |

지난 감사의 판정 기준("명시 목록 없이 `process.env`를 넘기는 지점이 하나라도 있으면 미해소")에 그대로 걸린다.

### A-3. 파괴적 명령 denylist — `preflightCommand` 호출 지점 전수

grep 전수 결과 **`src/run.ts:1256` 한 곳뿐**이다. 위치는 `runVerificationCommands` 내부이고, 대상은 Task가 스스로 선언한 검증 커맨드다.

```ts
// src/run.ts:1254-1263
for (const planned of input.commands) {
  const normalized = normalizeCommand(planned.command, input.projectPath);
  const preflight = preflightCommand({
    normalized,
    commandExecution: input.commandExecution,
    ...
    approvedCategoryIds: []
  });
```

**2026-08-10과 동일하다.** 에이전트가 세션 중 실행하는 명령은 preflight를 거치지 않는다. `run.ts:1230-1233`의 주석도 그 사실을 그대로 유지하고 있다("commands the agent ran on its own remain invisible"). `approvedCategoryIds: []` 하드코딩(`run.ts:1262`)도 그대로다 (2026-08-10 P1-2).

---

## (B) 테스트 검증 — **실패**

| 결함 | 재현 테스트 | 결과 |
|---|---|---|
| 자식이 부모 env를 상속한다 | `test/isolation.test.ts:77-98` "the child does not inherit the parent environment" | 존재하고 통과. **단 `runCommand`만 대상.** `runProcess`·`isolation.ts`의 spawn을 검증하는 테스트는 0건 |
| 어댑터가 capabilities를 무시하고 실행한다 | **없음** | 문자열 `"Adapter refused to launch"`는 `src/agent.ts:51`에만 존재. `test/` 전수 grep 0건 |
| 에이전트 명령이 denylist를 우회한다 | **없음** | 우회가 여전히 성립하므로 재현 테스트가 존재할 수 없다 |

`test/adapter-resolution.test.ts`의 `ADAPTER_CANNOT_EXPAND_CAPABILITIES` 클레임(`:26`, `:283-298`)은 **AdapterRequest와 effectivePolicy의 비교**(`src/run.ts:1801-1828` `findCapabilityExpansions`)를 검증하는 것이지, 어댑터 런타임의 거부를 검증하지 않는다. 규칙 이름이 비슷해 혼동하기 쉬운 지점이다.

(B) 실패 → 코드가 맞아 보여도 최대 [부분해소]. 아래 (C)에서 우회가 나왔으므로 최종 [미해소].

---

## (C) 반증 시도 — 우회 3건

### C-1. 검증 커맨드 자식 프로세스가 부모의 자격증명을 그대로 읽는다 (재현됨)

시나리오: Task의 `verification.commands`가 실행하는 프로세스에서 `process.env`를 읽는다.

```
=== env seen by the verification child: "verification-child-should-not-see-this"
```

부모 프로세스에 `CODEFLEET_VERIFY_SECRET`을 export한 뒤 Run을 돌렸고, 검증 커맨드 자식이 그 값을 그대로 읽어 파일에 썼다. `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`도 동일하다.

검증 커맨드는 Task 파일에 적히고 승인 해시에 포함되므로 "임의 코드"는 아니다. 그러나 **자격증명 경계는 승인 여부와 무관한 축이고, 어댑터에만 경계를 세우고 Harness 자신의 자식에는 세우지 않으면 경계가 아니다.** `src/isolation.ts:34`의 git 호출도 같은 상태다.

### C-2. 범위 밖 파일 수정이 여전히 사전 차단되지 않는다 (재현됨)

`isolationMode: NONE`, `harnessMode: COMMAND_EXEC`로 에이전트가 범위 밖 파일을 새로 만들도록 했다.

```
=== workspace src/app.js AFTER run: "export const ok = 'AGENT WAS HERE';\n"
=== out-of-scope file in workspace?: true
=== changedFiles observed: ["SECRET-OUT-OF-SCOPE.txt","src/app.js"]
=== pathViolations: [{"path":"SECRET-OUT-OF-SCOPE.txt","violationCode":"PATH_OUTSIDE_ALLOWED_PATHS","matchedPattern":""}]
=== run status: SUCCEEDED
```

사후 탐지는 정확히 작동한다(경로 정책 자체는 견고하다). 그러나 **파일은 이미 사용자의 실 저장소에 만들어졌고 Run은 `SUCCEEDED`를 출력한다.** 2026-08-10 §2-1과 동일한 상태다.

### C-3. 격리를 켜면 C-2의 사후 탐지마저 사라진다 (재현됨)

같은 시나리오를 `isolationMode: GIT_WORKTREE`로 돌린 결과:

```
=== out-of-scope file in workspace?: false
=== changedFiles observed: []
=== pathViolations: []
```

에이전트는 실제로 범위를 벗어났는데 `pathViolations`는 비어 있다. 자세한 원인과 파급은 신규 결함 **P0-7**(`07-new-defects.md`)로 등재했다.

여기서 짚어야 할 것은 P0-1 관점의 결론이다: **2026-08-10이 P0-1의 해법으로 제시한 격리(권고 1)와, P0-1의 유일한 잔존 방어선인 사후 경로 검사가 현재 구현에서 서로를 무효화한다.** 둘 중 하나만 고를 수 있는 상태다.

---

## 발생 조건 정리

| 우회 | 발생 조건 | 특별한 설정 필요 여부 |
|---|---|---|
| C-1 env 유출 | 검증 커맨드를 가진 Task를 실행 | 없음 |
| C-2 범위 밖 수정 | `mode: execute` + `allowDegradedCommandObservation: true` | 제품이 에러 메시지로 안내 (`src/run.ts:1206-1207`) |
| C-3 탐지 소실 | 위 + `isolationMode: GIT_WORKTREE` | 없음 |

## 권고

1. **P0** — `src/run.ts:1980`의 `runProcess`와 `src/isolation.ts:32`의 `run`을 `src/agent.ts:172`의 `runCommand`에 위임한다. env 목록·timeout·출력 상한이 한 번에 붙고, 세 spawn이 하나의 규율을 공유하게 된다. git 호출에는 `GIT_*` 최소 목록을 명시적으로 추가한다.
2. **P0** — 어댑터의 capabilities 거부에 테스트를 붙인다. `capabilities.commandExecution: false`로 `CodexAdapter.run`을 직접 호출해 `status === "FAILED"`와 거부 문구를 assert하면 된다. 가드가 항상 null을 반환해도 지금은 아무도 모른다.
3. **P0** — P0-7을 먼저 해소해 격리와 경로 검사가 공존하게 만든다. 그 전에는 `isolationMode: GIT_WORKTREE`가 보안상 개선이 아니다.
4. **P1** — 에이전트 명령에 대한 preflight는 명령 채널이 생기기 전에는 구조적으로 불가능하다. 그렇다면 `run.ts:1230-1233`의 주석이 말하는 사실을 run-record.md에도 한 줄로 노출한다. 현재는 산출물을 읽는 사람이 "명령 정책이 적용됐다"고 오해할 여지가 있다.
