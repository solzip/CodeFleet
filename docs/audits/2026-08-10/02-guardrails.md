# 02 — 가드레일: 선언 vs 강제

```text
점검 일시   : 2026-08-10
점검 대상   : 3d793ec0802147c6d3825be36cbb1c893f52d951 (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 15274570 와 바이트 동일하고,
             3d793ec 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
점검 범위   : src/agent.ts, src/command-policy.ts, src/path-policy.ts, src/run.ts,
             src/config.ts, src/types.ts, src/prompt.ts
측정 근거   : npm test — 128 tests, 128 pass
             docs/rule-implementation-status.json — 41 rules with no claim 중 32건 NOT_IMPLEMENTED
판정 기준   : "강제"는 위반을 사전에 차단하는 코드 경로가 있을 때만 인정한다.
```

## 판정: **결함 (파일 범위·명령 정책) + 미구현 (역할 기반 권한 분리)**

## 2-1. 범위 밖 파일 수정 — **사후 diff 발견**

### 근거

실행 순서가 그대로 답이다 (`src/run.ts`):

| 줄 | 동작 |
|---|---|
| 322-333 | PRE_RUN 스냅샷 캡처 |
| **337-343** | **에이전트 실행 — 이 시점에 이미 파일이 바뀐다** |
| 352 | `captureGitChangedFiles(projectPath)` |
| 354-368 | POST_RUN 스냅샷 + delta 계산 |
| 401-418 | `evaluatePathPolicy(...)` — **여기서 최초 판정** |
| 521-553 | `policyChecks.pathViolations`에 기록 |

`evaluatePathPolicy`(`src/path-policy.ts:168-251`)는 이미 변경된 파일 목록을 입력으로 받는다. 사전 차단 능력이 구조적으로 없다.

### 어댑터는 capabilities를 읽지 않는다

`src/run.ts:210-218`이 `allowedPaths`/`deniedPaths`를 포함한 `capabilities`를 만들고, `src/run.ts:298-315`가 이를 `adapter-request.json`에 기록한다. 그런데 어댑터는 그 파일을 열지 않는다:

`src/agent.ts:26-43` — `CodexAdapter.run()`이 하는 일 전부

```ts
const prompt = await readFile(input.promptPath, "utf8");
const command = commandConfig.command ?? "codex";
const args = commandConfig.args ?? ["exec", "-"];
const result = await runCommand(command, args, prompt, input.projectPath);
```

`input.config.policies`도 `capabilities`도 참조되지 않는다. 전달되는 것은 프롬프트 문자열뿐이다.

프로젝트 자체 기록도 동일하다 — `docs/rule-implementation-status.json`:

```
ADAPTER_CANNOT_EXPAND_CAPABILITIES : NOT_IMPLEMENTED
"capabilities are written into adapter-request.json but the adapter is a spawned process that never reads them"
```

### 범위 제약이 실제로 사는 유일한 곳은 프롬프트다

`src/prompt.ts:29-32`

```
## Operating Rules
- Do not modify files outside the allowed scope.
- Do not modify files listed in the excluded scope.
```

이것이 "범위 밖 수정 금지"의 전부다. LLM에게 보내는 문장이다.

### 위반이 발견돼도 Run은 실패하지 않는다

`src/run.ts:646-664` — `RunResultFile.status`는 `agentResult.status`에서만 온다. `pathPolicy.violations`는 결과 상태에 관여하지 않는다. `src/run.ts:666-668`의 error 필드도 에이전트 stderr에서만 채워진다.

즉 범위를 벗어난 파일 100개를 고쳐도 `codefleet run`은 `status: SUCCEEDED`를 출력한다. 위반은 `harness-observation.json`과 `run-record.md`(`src/run-record.ts:104-126`)에 기록되고, 리뷰 단계 `src/review.ts:465-467`에서 ACCEPTED를 막을 뿐이다. 롤백은 없다.

## 2-2. 파괴적 명령 allowlist/denylist — **실행 시점에 적용되지 않는다 (에이전트 명령에 한해)**

### 정책 엔진 자체는 제대로 구현돼 있다

`src/command-policy.ts:181-231` `preflightCommand`는 견고하다:
- `command-policy.ts:198-200` — 셸 인터프리터를 argv[0]에서 차단 (`sh -c "rm -rf /"` 우회 방지)
- `command-policy.ts:202-206` — denied가 allowed보다 먼저 평가되고 이긴다
- `command-policy.ts:203` vs `:209` — denied는 대소문자 무시, allowed는 대소문자 구분 (비대칭이 의도적)
- `command-policy.ts:215-223` — destructive 카테고리 미승인 시 차단
- `command-policy.ts:80,109-115` — 패턴 문자를 포함한 matcher를 거부 (조용히 아무것도 안 막는 정책 라인 방지)

### 그런데 호출 지점이 하나뿐이다

`preflightCommand` 전체 호출 지점 (grep, src/ 전수): `src/run.ts:895` — `runVerificationCommands` 내부.

`src/run.ts:873-951`의 주석이 스스로 인정한다:

```
// This channel covers only these planned commands; commands the agent ran on its
// own remain invisible and keep HarnessObservation.commands.authority at NONE.
```

즉 정책이 적용되는 대상은 **Task가 스스로 선언한 검증 커맨드**뿐이다. 에이전트가 세션 중에 실행하는 `rm -rf`, `git push --force`, `flyway migrate`, `kubectl apply`는 preflight를 거치지 않는다. 에이전트는 `src/agent.ts:141-145`에서 그냥 spawn되고, 그 자식 프로세스가 무엇을 실행하는지 CodeFleet은 관여하지 못한다.

### 완화 요인 — 기본 설정은 fail-closed다

`src/run.ts:821`

```ts
const HARNESS_VISIBLE_COMMAND_CHANNEL = false;
```

`src/run.ts:162-170` + `src/run.ts:823-851` — `mode: "execute"`이고 관측 채널이 없으면 Run Planning 자체를 거부한다. 기본 프로파일(`src/types.ts:69` `requireHarnessVisibleCommandChannel: true`, `src/types.ts:51` `allowDegradedCommandObservation: false`)에서는 **`codefleet run`이 아예 실행되지 않는다.** 이 설계는 정직하다.

### 그런데 차단 메시지가 해제 방법을 알려준다

`src/run.ts:844-846`

```
"To run anyway, record the decision in .codefleet/config.json:",
'  "policies": { "harness": { "allowDegradedCommandObservation": true } }',
```

이 불리언 하나를 켜면 `run.ts:835`의 조건이 무너지고, 그 뒤로는 **에이전트 명령에 대한 강제가 0이 된다.** 남는 것은 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE` 문자열이 계속 기록된다는 사실뿐이다(`src/run.ts:510,519`). 기록은 강제가 아니다.

### 파괴적 명령 승인 경로는 막다른 길이다

`src/run.ts:901`

```ts
approvedCategoryIds: []
```

하드코딩된 빈 배열이다. `approvedCategoryIds`에 값을 넣는 코드도, 카테고리를 승인하는 CLI 서브커맨드도 존재하지 않는다(`src/cli.ts:534-569` help 전체 확인). 따라서:

- 검증 커맨드가 `destructiveCommands`에 걸리면 `DESTRUCTIVE_WITHOUT_APPROVAL`로 **영구 차단**되고 해제 수단이 없다.
- `policies.harness.approvalRequiredForDestructiveCommands`(`src/types.ts:37,52`, 기본 `true`)는 파싱만 되고 읽는 코드가 없다.

## 2-3. 역할 기반 권한/자격증명 분리 — **미구현**

### 역할 개념이 코드에 없다

`src/agent.ts:15-21`

```ts
export function createAgentAdapter(name: string): AgentAdapter {
  if (name === "codex") {
    return new CodexAdapter();
  }
  throw new Error(`Unsupported agent: ${name}`);
}
```

어댑터는 1종이다. `agentRole`, `role`, `permission grant`에 해당하는 식별자는 src/ 어디에도 없다.

`docs/rule-implementation-status.json` 자체 기록:

```
AGENT_ROLE_IS_CLASSIFICATION_NOT_PERMISSION_GRANT   : NOT_IMPLEMENTED — "no source file references agentRole."
AGENT_ROLE_DECLARES_ONLY_WHAT_IT_NARROWS            : NOT_IMPLEMENTED — "no source file references agentRole."
ROLE_EFFECTIVE_RESTRICTIONS_IS_DIAGNOSTIC_READ_MODEL: NOT_IMPLEMENTED — "no role read model exists."
PROFILE_POLICY_AGENT_ADAPTERS_BLOCK                 : NOT_IMPLEMENTED — "allowedAdapters is never read; any defaultAgent string is accepted."
RUN_PLAN_AGENT_ADAPTER_RESOLUTION                   : NOT_IMPLEMENTED
```

### 자격증명은 분리는커녕 전량 상속된다

`src/agent.ts:141-145`

```ts
const child = spawn(command, args, {
  cwd,
  shell: false,
  stdio: ["pipe", "pipe", "pipe"]
});
```

`env` 옵션이 없다 → Node 기본 동작으로 **부모 프로세스의 `process.env` 전체가 자식에게 상속된다.** `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `DATABASE_URL`, 사내 VPN 토큰까지 그대로다. `src/run.ts:1457-1461`의 `runProcess`(검증 커맨드 실행)도 동일하다.

역할별 자격증명 분리는 "구현이 부실하다"가 아니라 **어떤 형태로도 존재하지 않는다**.

## 2-4. 선언만 되고 코드로 강제되지 않는 지점 — 전수 목록

grep으로 각 식별자의 **읽기(소비) 지점**을 확인한 결과다. 아래 항목은 모두 `config.ts`에서 파싱·검증되고 `types.ts`에서 기본값이 정의되지만, **정책 판단에 사용하는 코드가 0개**다.

| 선언 | 정의 위치 | 파싱 위치 | 소비 위치 | 기본값 |
|---|---|---|---|---|
| `requireIsolationForMutation` | `types.ts:35,48` | `config.ts:110-112` | **없음** | `true` |
| `approvalRequiredForDestructiveCommands` | `types.ts:37,52` | `config.ts:116-118` | **없음** | `true` |
| `allowProviderReportedCommandTruth` | `types.ts:26,70` | `config.ts:175-177` | **없음** | `false` |
| `allowedModes` | `types.ts:33,46` | `config.ts:89-98,108` | **없음** | 4개 모드 |
| `maxMode` | `types.ts:34,47` | `config.ts:99-101,109` | **없음** | `COMMAND_EXEC` |

`requireIsolationForMutation: true`가 기본값이면서 아무 데서도 읽히지 않는다는 점이 특히 위험하다. 프로파일을 읽는 사람은 "변경 작업에 격리가 필수"라고 믿게 되지만, `src/run.ts:279-282`는 `isolation.mode`를 상수 `"NONE"`으로 쓴다.

추가로 문서·주석에만 존재하는 가드레일:

| 가드레일 | 존재 형태 | 코드 강제 |
|---|---|---|
| 범위 밖 파일 수정 금지 | `src/prompt.ts:30-31` 프롬프트 문장 | 없음 (사후 기록만) |
| 무관한 리팩터링 금지 | `src/prompt.ts:32` 프롬프트 문장 | 없음 |
| Task `constraints` (예: "DB 스키마 변경 금지") | `src/prompt.ts:21` 프롬프트 문장 | 없음 |
| Task guardrail 필드 | 주석뿐 — `run.ts:396-397` | `GUARDRAIL_IS_TASK_LOCAL_RESTRICTION_SOURCE: NOT_IMPLEMENTED` |
| Local Overlay 권한 축소 | `workspace.ts:103-107`이 hash만 기록 | `PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY: NOT_IMPLEMENTED` |
| `computedRisk` 기반 판단 | `run.ts:276-278` 상수 `"UNKNOWN"` | `RISK_RULE_REUSES_FIXED_MATCHERS: NOT_IMPLEMENTED` |
| `resume.sourceHashPolicy` | `run.ts:285-290` 선언만 | src 전체에서 `resume` 참조 1건(그 선언 자체) |

## 발생 조건과 영향 범위

**발생 조건**: `.codefleet/config.json`에 `mode: "execute"` + `policies.harness.allowDegradedCommandObservation: true`. 이 조합은 CodeFleet이 스스로 안내하는 유일한 실행 경로다(`src/run.ts:844-846`).

**영향 범위**
- 에이전트가 `scope.include` 밖의 임의 파일을 생성/수정/삭제 가능. 사후에 `PATH_OUTSIDE_ALLOWED_PATHS`로 기록될 뿐 되돌릴 수단 없음(04번 참조).
- 에이전트가 `deniedCommands`에 명시된 명령을 그대로 실행 가능. `git push --force`, DB 마이그레이션, 배포 스크립트 포함.
- 부모 프로세스의 모든 환경변수(자격증명 포함)가 에이전트에게 노출. 역할별 축소 수단 없음.
- 워크스페이스 = 실제 작업 디렉터리이므로 영향이 사용자의 실 저장소에 직접 미친다.
- `git status`가 들여다보지 않는 중첩 저장소 내부 변경은 애초에 관측 대상 밖이다 — `src/path-policy.ts:230-240`이 이 경우 평가를 `evaluated: false`로 내리는 것은 정직하지만, 그만큼 사후 발견조차 불가능하다는 뜻이다.

## 우선순위: **P0**

근거:
1. 실행 시점 강제가 존재하지 않는다. 유일한 안전장치가 "실행 자체를 거부"인데, 제품이 그 거부를 해제하는 방법을 에러 메시지로 안내한다.
2. 해제 후에는 파일 범위·명령·자격증명 세 축 모두 무방비다. 부분 방어가 아니라 전무다.
3. 프롬프트에만 존재하는 가드레일은 정의상 LLM이 무시할 수 있다. 이 제품의 존재 이유("the AI said it worked를 구조적으로 신뢰 불가능하게 만든다" — `CLAUDE.md:3`)와 정면으로 충돌한다.
4. `requireIsolationForMutation: true` 같은 기본값이 소비되지 않은 채 프로파일에 노출돼 있어, 읽는 사람에게 실재하지 않는 보호를 믿게 한다.

## 권고 (우선순위 순)

1. **P0** — `allowDegradedCommandObservation` 해제 시에도 최소한의 실행 시점 방어를 남긴다. 최소 구현: 에이전트를 `git worktree` 또는 복제 디렉터리에서 실행하고, 프로세스 종료 후 scope 위반 파일의 변경분을 원본에 반영하지 않는다(=사후 차단을 사전 차단과 동등하게 만든다).
2. **P0** — `src/agent.ts:141`의 `spawn`에 명시적 `env` allowlist를 준다. 현재 전량 상속은 어떤 역할 모델을 붙여도 무의미하게 만든다.
3. **P1** — 소비되지 않는 정책 플래그 5종을 (a) 실제로 읽거나 (b) `config.ts` 로드 시 "선언되었으나 v0.2에서 적용되지 않음"으로 경고하거나 (c) 프로파일 스키마에서 제거한다. 셋 중 하나를 고르되 현 상태를 유지하지 않는다.
4. **P1** — `approvedCategoryIds`(`run.ts:901`)를 채우는 CLI 경로를 만들거나, 그전까지는 `destructiveCommands`가 설정되면 "승인 경로 부재로 영구 차단됨"을 `config.ts` 로드 시점에 알린다.
