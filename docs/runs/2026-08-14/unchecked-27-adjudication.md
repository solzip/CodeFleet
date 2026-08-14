# 미확인 27건 전수 판정 — 4건이 이미 해소돼 있었다

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-14 09:24 (KST) |
| 대상 커밋 해시 | `c448b7d` (작업 시점 HEAD) |
| 작업 유형 | **감사** (코드 읽기 판정. `src`·`test`·`scripts` 무변경) |
| 선행 문서 | `docs/runs/2026-08-13/stranded-findings-triage.md` §B-4, `docs/REGISTER.md`, `docs/archive/2026-08-13/ARCHIVE.md` |
| 번호 실측 최대값 | **P0-17 / P1-61** (`grep -rhoE "P[01]-[0-9]+" docs/ src/ test/`. `P0-17`은 미사용 등재 ID) |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0** (Node v24.14.1). 판정 자체는 코드 읽기이며 스위트를 근거로 쓰지 않는다 |

---

## 왜 이 작업을 했나

동결 문서 세 곳이 같은 말을 남겼다.

> **비용이 커서 못 한 것이 아니라 범위 밖이라 안 한 것이다.** 27건 모두 코드 읽기로 판정 가능해 보인다.
> — `runs/2026-08-13/stranded-findings-triage.md` §B-4

그리고 바로 앞선 조사가 그 예측을 이미 한 번 증명했다 — **방치된 11건 중 8건이 이미 해소돼 있었다.** 등재부는 그 사실을 몰랐을 뿐이다.

**동결이 확인을 막지 않는다.** 규약 §7이 "등급·상태 변경은 원 문서를 고치지 않고 새 문서에 정정 사실을 기록한다"이고, P1-21이 동결 후 CI로 확인됐을 때 정확히 그렇게 처리됐다(등재부는 상태 유지 + 각주, 사실은 `ci-first-run.md`가 보유). 이 문서가 27건에 대해 같은 자리를 맡는다.

---

## B-1. 판정 분포

| 판정 | 건수 | ID |
| --- | --- | --- |
| **해소** | **3** | P1-9, P1-16, P1-36 |
| **무효화됨** | **1** | P1-14 |
| **부분해소** | **2** | P1-5, P1-39 |
| **미해소 (유효)** | **20** | P1-1, 6, 7, 8, 10, 11, 12, 13, 18, 19, 20, 22, 23, 24, 25, 26, 29, 30, 31, 33 |
| **유효 확정 (기확인)** | **1** | P1-21 |
| 합계 | **27** | |

**27건 중 21건이 유효한 결함이었고, 4건은 조건이 사라져 있었다.**

앞선 triage(11건 중 8건 해소)보다 해소율이 훨씬 낮다. 그 11건은 S3·S6 슬라이스가 실제로 고친 뒤 등재부만 안 고친 것들이었고, 이 27건은 **아무도 손대지 않은 것들**이기 때문이다. 두 집단의 성격이 다르다.

---

## B-2. 건별 판정

근거는 전부 파일:라인이다. "코드가 맞아 보인다"만으로는 [해소]를 주지 않았다(규약 §10).

### 해소 3건

#### P1-9 — `objective attach`가 승인 여부·revision·유효성을 검증하지 않는다

**[해소]** — `src/cli.ts:388-395`가 attach 전에 원장을 읽는다.

```ts
const state = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
const requested = flags.revision === undefined ? state.approvedRevision : Number(flags.revision);
if (requested === null || !Number.isInteger(requested)) {
  throw new Error(
    `Cannot attach ${taskId}: it has no approved revision to attach.\n` + ...
```

revision 해시도 working file이 아니라 원장의 `TASK_REVISION_CREATED`에서 가져오고(`cli.ts:397-400`), `attachTask`가 `verifyRevisionReference`로 다시 대조한다(P0-15 해소 근거, `ledger.ts:679-691`). **임의 `--revision` 수용이라는 등재 조건이 성립하지 않는다.**

고친 커밋: `38cf9c9`(S3) 계열. 등재부가 갱신되지 않았을 뿐이다.

#### P1-16 — `status: DONE` Task의 순차 재실행이 경고뿐이고 `loadTask`가 warnings를 버린다

**[해소]** — 조건이 소멸했다. `status` 필드 자체가 거부된다.

```ts
// src/task.ts:80-92
if (value.status !== undefined) {
  errors.push([
    "status does not belong in a Task contract. Remove the field.",
    `  it was one of ${RETIRED_TASK_STATUSES.join(" / ")}, which are execution outcomes,`,
    ...
```

`RETIRED_TASK_STATUSES`가 `["READY", "RUNNING", "DONE", "FAILED", "BLOCKED"]`(`task.ts:13`)이므로 **`status: DONE`인 Task는 로드 자체가 실패한다.** 경고가 아니라 오류다.

등재문 후반("`loadTask`가 warnings를 버린다")도 함께 성립하지 않는다 — `grep -rn "warnings.push" src/` → **0건.** warnings 배열은 선언·반환되지만 아무도 채우지 않는다. 버릴 내용이 없다.

관련: P1-40 [해소]가 같은 변경이다.

#### P1-36 — 승인이 계약의 실행 가능성을 검사하지 않는다

**[해소]** — `approveTask`의 precheck에 정합성 검사가 있다.

```ts
// src/task-ledger.ts:421-425
precheck: async (): Promise<void> => {
  const feasibility = await contractFeasibility(rootDir, taskId);
  if (!feasibility.feasible) {
    throw new Error(`Contract cannot be approved: ${feasibility.reason}`);
  }
```

`contractFeasibility`(`task-ledger.ts:109-140`)가 등재문이 지목한 바로 그 조합을 막는다 — 검증 커맨드가 있는데 `meet(profile, role)` 상한이 `COMMAND_EXEC`에 못 미치면 `feasible: false`.

```ts
const ceiling = meetMode(config.harnessMode, resolution.role.defaultMaxMode);
if (modeRank(ceiling) >= modeRank("COMMAND_EXEC")) {
  return { feasible: true, reason: "" };
}
```

등재문의 실측("`BACKEND_IMPLEMENTER` + 검증 커맨드 → 승인 통과, 실행 시 `LAUNCH_FAILED`")이 이제 승인 단계에서 거부된다.

**다만 P1-32는 그대로다** — `init` 기본 역할이 여전히 `BACKEND_IMPLEMENTER`이므로, 이 검사는 그 조합을 실행 전에 알려줄 뿐 기본값을 고치지는 않는다. P1-32의 [부분해소]는 유지된다.

### 무효화됨 1건

#### P1-14 — 모든 테스트 픽스처가 `isolationMode: NONE`

**[무효화됨]** — 그리고 **이 판정은 2026-08-12에 이미 내려져 있었다.**

`docs/audits/2026-08-12/SUMMARY.md:186`과 `09-registration-check.md:50`이 둘 다 "무효화됨"으로 적었다. 등재부가 그것을 옮기지 않아 [미확인]으로 남아 있었다.

현재 상태로도 확인된다 — 픽스처 기본값은 여전히 `NONE`(`test/profile-fixture.ts:44`)이지만 `GIT_WORKTREE`를 명시적으로 켜는 테스트 파일이 **4개**다: `test/isolation.test.ts`, `test/apply.test.ts`, `test/approval-contract.test.ts`, `test/adapter-resolution.test.ts`. **"격리 경로가 한 번도 실행되지 않는다"는 조건이 성립하지 않는다.**

### 부분해소 2건

#### P1-5 — actor 신원이 자기 신고 문자열, 승인자=검토자 허용, `allowedActors`는 항상 빈 배열

**[부분해소]** — 세 절 중 하나가 해소됐다.

| 등재 절 | 판정 | 근거 |
| --- | --- | --- |
| `allowedActors`가 항상 빈 배열이고 대조되지 않는다 | **해소** | `src/ledger.ts:917-925`가 게이트에서 읽어 기본 `["HUMAN"]`을 세우고, `src/auto-review.ts:117-119`가 대조해 `ACTOR_KIND_NOT_ALLOWED:<kind>`로 거부한다 |
| actor 신원이 자기 신고 문자열 | **미해소** | `src/cli.ts:406` `actorId: flags.actor ?? "local-user"`. 대조 대상이 없다 |
| 승인자 = 검토자 허용 | **미해소** | `grep -rn "approvedBy" src/review.ts src/auto-review.ts` → **0건.** 두 신원을 비교하는 코드가 없다 |

대조되는 것은 **actor의 종류**(`HUMAN` / `SYSTEM_POLICY`)이지 **신원**이 아니다. 그 구분이 이 등재의 절반만 닫는다.

#### P1-39 — Draft / Revision 상태 기계가 코드에 없다

**[부분해소]** — 상태 기계는 생겼고, 등재문이 지목한 증상은 남았다.

**생긴 것**:

- `DraftState = "EDITING" | "READY_FOR_APPROVAL"` (`task-ledger.ts:313`)과 `deriveDraftState`(`:315-345`) — **파생 상태**다. `validateTask` 오류와 `contractFeasibility`, 그리고 승인 해시 양쪽(내용·가드레일)을 모두 보고 "approve 가능"과 일치시킨다
- `RevisionState = "APPROVED" | "SUPERSEDED" | "INVALIDATED"` (`task-ledger.ts:249`) — P1-44 [해소]의 근거와 같다

**남은 것**: `approveTask`가 여전히 **revision 생성과 승인을 한 뮤테이션에서** 처리한다.

```ts
// src/task-ledger.ts:442-470 (append 콜백 안, 같은 mutationId)
const created = await appendTaskEvent(rootDir, taskId, mutationId, "TASK_REVISION_CREATED", {...});
await writeTaskRevision(rootDir, {...});
const approved = await appendTaskEvent(rootDir, taskId, mutationId, "TASK_APPROVED", {...});
```

즉 **원장 위에는 `READY_FOR_APPROVAL`인 revision이 존재하는 시점이 여전히 없다.** 존재하는 것은 파일에서 파생한 draft 상태다. 등재문의 "READY_FOR_APPROVAL이 존재할 수 있는 시점이 없다"는 revision 축에서는 아직 참이다.

`REJECTED` 부재는 별건 P1-45 [미해소]가 보유한다.

### 미해소 20건

#### P1-1 — 자유 텍스트 `doneCriteria`가 필수이고 실행 가능한 `verification`이 선택이다

**[미해소]** — `src/task.ts:105`가 `requireStringArray(value, "doneCriteria", ...)`로 필수를 강제하는 반면, `validateVerification`(`task.ts:151-153`)은 **없으면 그대로 통과시킨다**.

```ts
const verification = value.verification;
if (verification === undefined) {
  return;
}
```

Run Planning 단계의 거부도 없다. 검증 커맨드가 0건이면 `verificationUnavailableReason`(`run.ts:1914-1919`)이 `NO_VERIFICATION_COMMANDS_CONFIGURED`를 **게이트 사유로** 낼 뿐이며, 그 시점은 이미 에이전트가 실행된 뒤다.

#### P1-6 — 실행 중 계획 이탈 시 재승인 트리거 없음

**[미해소]** — `invalidateApproval`은 구현돼 있고(`task-ledger.ts:518`) CLI 경로도 있다(`cli.ts:204`). 그러나 **`grep -n "invalidateApproval" src/run.ts` → 0건.** 경로 위반이 관측돼도 승인은 그대로다.

#### P1-7 — 원자적 롤백 부재

**[미해소]** — 격리는 구현됐으나(`isolation.ts:161-190` `discard`) **기본값이 꺼져 있다**: `isolationMode: "NONE"` (`src/types.ts:267`, `:230`).

그리고 리뷰 반려가 롤백을 부르지 않는다 — `grep -rn "discard\|rollback" src/review.ts` → **0건.** 격리 트리는 Run 종료 시 폐기되지, 반려 결정에 의해 폐기되지 않는다. **반려는 여전히 JSON 파일 하나를 쓰고 끝난다.**

#### P1-8 — Run 아티팩트에 `objectiveId` 없음

**[미해소]** — `run-plan.json`의 전체 필드를 읽었다(`run.ts:834-919`). `objectiveId`도 `objectiveQueueItemId`도 **없다.**

Objective는 두 곳에서만 쓰인다: 실행 허가 게이트(`run.ts:231-300`, `accepted` 배열은 판정 후 버려진다)와 프롬프트의 `objectives` 맥락(`run.ts:937`). **둘 다 아티팩트에 남지 않는다.** 역추적은 여전히 전 원장 스캔이다.

#### P1-10 — 무작업 Run이 ACCEPTED 가능

**[미해소]** — `workspaceDelta`는 계산되고(`run.ts:1055`) 증거에 실린다(`run.ts:1215-1226`). 그러나 `grep -n "workspaceDelta\|changedFiles\|delta" src/review.ts` → **0건.** 수용 판정이 그 값을 읽지 않는다.

#### P1-11 — 비용·토큰 상한 부재

**[미해소]** — `grep -rn "tokens\|costUsd\|usage" src/types.ts src/agent.ts` → 주석 1줄(`types.ts:20`)뿐. 계측 필드가 없으므로 상한을 정할 근거도 없다.

#### P1-12 — `appendCorrectiveEvent`에 CLI 경로 없음

**[미해소]** — `src/ledger.ts:990`에 정의돼 있고 `src/cli.ts` 참조 **0건.** 원장 정정은 여전히 코드에서만 가능하다.

#### P1-13 — `AgentRunInput.limits`를 채우는 코드가 없다

**[미해소]** — 타입은 있고(`types.ts:156`) 어댑터는 소비한다(`agent.ts:109` → `:418-419`). 그러나 **유일한 호출부가 넘기지 않는다.**

```ts
// src/run.ts:1017-1029 — limits 없음
const agentResult = await runAgentSafely(agentName, {
  task, runDir, promptPath, projectPath: observedPath, config,
  capabilities: { fileEdit: ..., commandExecution: ... }
});
```

따라서 상한은 상수 고정이다 — `DEFAULT_ADAPTER_TIMEOUT_MS = 30 * 60 * 1000`, `DEFAULT_ADAPTER_OUTPUT_CAP_BYTES = 16 * 1024 * 1024` (`agent.ts:299-300`). 프로파일에서 조정 불가.

#### P1-18 — 하위 디렉터리 Task의 경로 기준 불일치

**[미해소]** — 두 기준이 여전히 다르다.

- 변경 파일 목록: `git status --porcelain=v1`(`run.ts:2612-2615`). **porcelain 형식은 저장소 루트 기준 경로를 낸다** — cwd가 하위 디렉터리여도 `-- .` pathspec은 범위만 좁히고 출력 기준을 바꾸지 않는다
- 범위 패턴: `effectivePolicy.capabilities.allowedPaths`가 Task의 `scope.include`에서 오고, 그것은 `task.projectPath` 기준으로 쓰인다

`evaluatePathPolicy`(`run.ts:1091-1098`)가 이 둘을 그대로 대조한다. `projectPath: backend`인 Task에서 `backend/src/A.java`와 패턴 `src/**`가 만나면 **범위 안 파일이 위반이 된다.**

#### P1-19 — 검증 커맨드 env가 `PATH`뿐

**[미해소]** — 검증 커맨드 실행부가 `env`를 넘기지 않는다(`run.ts:1720-1724`, `limits`만 전달). 따라서 `runProcess`의 기본값이 적용된다.

```ts
// src/run.ts:2714
env: options.env ?? { PATH: process.env.PATH ?? "" }
```

git 호출만 `gitProcessEnv()`(`agent.ts:351`)로 `SystemRoot`·`HOME` 계열을 받는다. **`mvn`/`gradle` 계열은 구조적으로 실패한다**는 등재 조건 그대로다.

#### P1-20 — 타임아웃으로 죽은 어댑터가 `ADAPTER_FAILED`로만 기록된다

**[미해소]** — 그리고 코드가 그 사실을 형태로 드러낸다.

```ts
// src/run.ts:2948-2959
function toAdapterExecutionStatus(result: { status: string; exitCode: number | null }): string {
  if (result.status === "DRY_RUN") return "NOT_EXECUTED";
  if (result.status === "SUCCEEDED") return "COMPLETED";
  if (result.exitCode === null) {
    return "ADAPTER_FAILED";
  }
  return "ADAPTER_FAILED";
}
```

**마지막 두 분기가 같은 값을 돌려준다.** 구분하려던 자리가 남아 있고 채워지지 않았다. `grep -rn "ADAPTER_TIMEOUT" src/` → **0건**, `resourceLimits.adapter`에 `timedOut` 필드 없음.

#### P1-22 — `--no-index` 경로의 잘림 우선순위 규칙이 도달 불가

**[미해소]** — 산술이 그대로다.

| 상한 | 값 | 위치 |
| --- | --- | --- |
| 파일당 신규 파일 내용 | 1 MiB (`1024 * 1024`) | `run.ts:2367` |
| git 증거 출력 | 32 MiB (`32 * 1024 * 1024`) | `agent.ts:312` |

크기 검사를 통과한 파일(≤ 1 MiB)의 `--no-index` 출력이 32 MiB에 이를 수 없다. **규칙은 옳고 발동하지 않는다.**

#### P1-23 — `isolation.ts`의 `run()`이 `scanScope`를 버린다

**[미해소]** — 반환 형태 그대로다.

```ts
// src/isolation.ts:56-66
const result = await runCommand(command, args, "", cwd, {
  limits: { timeoutMs: ISOLATION_COMMAND_TIMEOUT_MS, outputCapBytes: 4 * 1024 * 1024 },
  env: gitProcessEnv()
});
return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
```

`result.scanScope`가 반환값에 없다. **상한을 적용받으면서 계측을 기록하지 않는 유일한 지점**이고, `repositoryPrefix`(`isolation.ts:83`)가 그 stdout을 데이터로 쓴다.

#### P1-24 — 검증 커맨드가 POST_RUN 스냅샷 이후 실행된다

**[미해소]** — 실행 순서 그대로다.

| 줄 | 무엇 |
| --- | --- |
| `run.ts:1039` | `captureGitChangedFiles` |
| `run.ts:1043-1045` | POST_RUN 스냅샷 |
| `run.ts:1091` | `evaluatePathPolicy` |
| **`run.ts:1115`** | **`runVerificationCommands`** |

검증이 만든 파일 변경은 어떤 증거에도 나타나지 않는다.

#### P1-25 — `QUEUE_ITEM_CANCELED`가 `runTask` 종단으로 검증되지 않는다

**[미해소]** — `grep -rn "QUEUE_ITEM_CANCELED" test/` → **2건뿐**이고 둘 다 종단이 아니다.

- `test/ledger.test.ts:261` — 원장 전이 단위 테스트
- `test/isolation.test.ts:860-875` — `CANCELED`로 전이시킨 **뒤 원장 파일을 깨뜨리고** `blockedQueueReason`을 부른다. 단언은 `/cannot be read/i`다. **거부 사유가 CANCELED가 아니라 파손이므로, CANCELED 경로는 여전히 단언되지 않는다**

등재문("P0-9 테스트의 CANCELED는 파손 원장과 함께 쓰여 단독 경로가 아니다")이 그대로 참이다.

#### P1-26 — 격리 모드 unavailable이 리뷰 게이트로 승격되지 않는다

**[미해소]** — 그리고 **승격되는 것이 다른 사실이다.** 이 건은 정밀하게 적어 둘 필요가 있다.

`workspace.isolation` 객체는 두 개의 다른 사유를 갖는다(`run.ts:1168-1180`):

```ts
modeUnavailableReason: prepared.unavailableReason,   // 요청한 모드를 얻지 못함
unavailableReason: discardOutcome.unavailableReason, // 폐기에 실패함
```

승격 함수는 `.unavailableReason`만 읽는다.

```ts
// src/run.ts:1646-1654
const reason = (value as Record<string, unknown>).unavailableReason;
```

그리고 그 호출부의 주석이 스스로 밝힌다 — **"A tree that could not be discarded is still on disk"**(`run.ts:1538-1540`). 즉 승격되는 것은 **폐기 실패**이고, `modeUnavailableReason`은 `grep` 결과 `run.ts:1176` 한 곳에만 존재하며 **아무 데도 승격되지 않는다.**

등재문의 "기본값에서는 `checkIsolationRequirement`가 차단하므로 실피해 없음"도 유지된다.

#### P1-29 — 타임아웃 메시지가 모든 자식에 "Adapter"라고 말한다

**[미해소]** — 문구 그대로다.

```ts
// src/agent.ts:470
stderr: `${stderr}Adapter exceeded the ${timeoutMs} ms limit and was terminated.\n`
```

`runCommand`를 쓰는 모든 자식(git 호출·검증 커맨드·`isolation.ts`)이 이 문장을 받는다.

> **판정하며 발견한 것**: 이 문자열은 문구 문제가 아니라 **기계가 읽는 신호**다.
> ```ts
> // src/run.ts:2732
> timedOut: result.exitCode === null && / limit and was terminated\./.test(result.stderr),
> ```
> 타임아웃 여부를 **stderr 정규식으로 되읽는다.** 따라서 "Adapter"를 정확한 주체명으로 바꾸는 수정은 이 정규식과 함께 고쳐야 하고, 따로 고치면 `timedOut`이 조용히 항상 false가 된다. 등재문의 "사실을 왜곡하지는 않으나 오독을 부른다"는 이 결합을 몰랐던 서술이다. **동결 중이므로 신규 ID를 부여하지 않았다.**

#### P1-30 — `--no-index`의 `/dev/null` 처리가 git 구현에 의존한다

**[미해소]** — `run.ts:2448`이 `["...", "diff", "--no-ext-diff", "--no-index", "--", "/dev/null", file]` 그대로다. 근거는 여전히 이 호스트의 git 하나뿐이다.

#### P1-31 — 격리 트리 경로 접두가 Windows 260자 여유를 줄인다

**[미해소]** — 경로 구성 그대로다.

```ts
// src/isolation.ts:126-127
const parent = await mkdtemp(path.join(os.tmpdir(), "codefleet-worktree-"));
const treeRoot = path.join(parent, runId.replace(/[^A-Za-z0-9_-]/g, "-"));
```

등재의 측정값(여유 189자)은 이 호스트의 `os.tmpdir()` 30자에 근거한 것이고, **재측정하지 않았다.** 코드가 변하지 않았으므로 조건은 유지된다. 성격은 결함이라기보다 **환경 의존 한계**에 가깝다.

#### P1-33 — 어댑터 거부 메시지가 원인·조치를 말하지 않는다

**[미해소]** — 메시지 그대로다.

```ts
// src/agent.ts:91-96
if (input.capabilities !== undefined && input.capabilities.commandExecution !== true) {
  ...
  stderr: "Adapter refused to launch: AdapterRequest capabilities do not permit command execution.\n"
```

역할·가드레일·프로파일 중 **무엇이 모드를 낮췄는지 말하지 않고, 무엇을 바꿔야 하는지도 말하지 않는다.** 비교 대상인 명령 채널 차단 메시지(`run.ts:1597-1600` 이하)는 조치를 적는다.

### 유효 확정 1건

#### P1-21 — 폐기 실패 회귀 테스트가 win32 동작에 의존한다

**[유효 확정]** — 이 문서가 새로 판정한 것이 아니다. 동결 이후 CI가 실행돼 ubuntu에서 예측대로 재현됐다(`actual: true, expected: false`, run `31676826579`). 근거는 `runs/2026-08-13/ci-first-run.md`가 보유한다. **여기서는 27건 집계를 맞추기 위해 옮겨 적는다.**

---

## B-3. 판정하며 발견한 것 — 등재부의 파일:라인 근거 3건이 어긋나 있다

### 대조 방법과 그 함정

저장소의 추적 마크다운 전체에서 `` `src|test|scripts/….ts:N` `` 형태의 인용 **495건**을 뽑아, 그 줄이 비어 있거나 닫는 괄호뿐인 경우를 후보로 걸렀다. 후보는 103건이 나왔다.

**그러나 그중 대부분은 결함이 아니다.** 규약이 문서마다 「대상 커밋 해시」를 요구하는 이유가 이것이다 — **감사 문서의 줄 번호는 그 문서의 대상 커밋 기준**이고, HEAD와 비교하는 것은 애초에 틀린 대조다. `2026-08-10/05-traceability.md`가 `run.ts:264`를 인용한 것은 `70fa598`에서 옳았고 지금 어긋나 보이는 것이 정상이다.

**따라서 HEAD 기준으로 대조해야 하는 문서는 대상 커밋이 없는 살아 있는 문서뿐이다** — `REGISTER.md`가 유일하다. 그 문서의 ★ 근거를 전부 확인했다.

### 어긋난 3건

| ID | 등재부 인용 | 그 줄의 실제 내용 | 옳은 위치 |
| --- | --- | --- | --- |
| **P1-2** | `src/run.ts:1630` | `].join("\n");` | **`src/run.ts:1696`** | <!-- cite: quoted -->
| **P1-37** | `src/run.ts:766` | `});` | **`src/run.ts:832`** (정의) / `:948`·`:1000`·`:1044` (스프레드) | <!-- cite: quoted -->
| **P1-47** | `src/review.ts:632` | (빈 줄) | **`src/review.ts:633`** | <!-- cite: quoted -->

**결함 판정 자체는 셋 다 바뀌지 않는다.** 가리키는 코드는 실재하고, 옮겨진 줄에 그대로 있다.

### 왜 어긋났나 — 리팩터링 때문만이 아니다

P1-2를 실측했다.

```
$ git show ce3a4c1:src/run.ts | sed -n '1630p'      # 원 감사(13-output-fidelity) 시점
      approvedCategoryIds: []                        ← 그때는 맞았다
$ git show 097681b:src/run.ts | sed -n '1630p'      # 등재부 작성 기준 커밋
    ].join("\n");                                    ← 등재부를 쓰던 그 시점에 이미 틀렸다
$ git show 097681b:src/run.ts | grep -n approvedCategoryIds
1696:      approvedCategoryIds: []
```

`f215fac`(P1-53 수정)이 `resolveRoleAndMode`·`resolveContractForPrompt`를 추출하며 66줄을 밀었다. **그런데 등재부는 그 수정보다 뒤인 `097681b` 기준으로 작성됐다.** 즉 어긋남의 원인은 리팩터링이 아니라, **원 감사 문서의 줄 번호를 그 시점 코드로 재측정하지 않고 옮겨 적은 것**이다. P1-37도 같다 — `e5fb188`에서 `run.ts:766`은 `const contractRef = {...}` 정의 줄이었고, 등재부는 그것을 그대로 복사했다.

이 저장소가 규율로 세운 문장이 여기 그대로 적용된다 — **"Never trust a count written in prose here. Run the command and read the number it prints."**(`CLAUDE.md`). 줄 번호도 산문에 적힌 수다.

### 이것을 잡는 검사기가 없다

2026-08-13에 만든 `scripts/check-doc-facts.mjs`는 `<!-- fact: name = value -->` 앵커의 **숫자**만 검사한다. `scripts/check-links.mjs`는 링크 대상이 실재하는지 검사하지만 **줄 번호는 보지 않는다.** 등재부의 유일한 근거 형식인 파일:라인이 두 검사기 사이의 틈에 있다.

### 처리

**세 줄 번호는 `REGISTER.md`에서 고쳤다.** 동결은 상태·등급·건수를 묶는 것이고(§7), **어긋난 포인터는 판정이 아니라 오기**이므로 원 문서에서 고치는 편이 맞다고 봤다. 링크가 깨졌을 때 `readme-language-swap.md`가 대상 경로를 고친 것과 같은 성격이다. 각 항목에 정정 사실을 괄호로 남겼다.

---

## B-4. 동결과의 관계

**등재부의 상태 칸도 건수도 바꾸지 않았다.** `REGISTER.md`의 요약표는 그대로 해소 25 / 부분해소 8 / 재현안됨 1 / 미해소 15 / 수용 1 / 미확인 27 = 77이며, `<!-- fact: -->` 앵커도 그대로다.

P1-21 선례와 같은 처리다 — 확인된 사실은 실행 기록이 보유하고, 등재부에는 그 문서를 가리키는 표시만 둔다. 등재부만 읽고 지나치지 않도록 27개 행에 **◆** 표시를 달았다.

**이 문서를 반영해 다시 세면** 미확인 27 → 0, 해소 25 → 28, 부분해소 8 → 10, 미해소 15 → 35(P1-21 포함), 무효화됨 1. 그 재집계는 **하지 않았다.** 동결을 푸는 결정은 이 작업의 범위가 아니다.

---

## B-5. 판정이 거짓으로 만든 문장을 함께 고쳤다

이 판정은 그 자체로 표지의 문장 여러 개를 거짓으로 만든다 — `full-review-v2.md`가 잡아낸 것과 정확히 같은 형태다. **판정과 같은 작업에서 고쳤다.**

| 문서 | 무엇이 거짓이 됐나 | 처리 |
| --- | --- | --- |
| `README.md` · `README.en.md` | "그 27건은 미확인인 채로 닫는다. 아무도 들여다보지 않았으니 근거가 없다. **한 건은 예외다**(P1-21)" | 「닫은 뒤에 확인한 것」 절을 신설하고 판정 분포를 넣었다. 등재부 건수는 그대로임을 명시 |
| `ARCHIVE.md` §1 | "이들에 대해 아무 판정도 하지 않는다 … 근거 없음이다" | 각주 2를 달아 전수 판정 사실과 분포를 적었다. 본문은 동결 시점 서술로 읽으라고 명시 |
| `ARCHIVE.md` §4 | "이 목록은 조사 대상 목록이지 결함 목록이 아니다" | 정정 — 21건은 결함이 맞았고 4건은 아니었다 |
| `ARCHIVE.md` 「미해소로 남긴 것」 | "미확인 27건 — 판정 없이 종료. 근거 없음" | 더 이상 미해소가 아님을 표시 |
| `LESSONS.md` | "[미확인] 27건은 분류하지 않았다" | 판정은 끝났고 **분류는 여전히 안 했다**는 구분을 달았다. 유형별 건수가 이제 하한임을 명시 |
| `REGISTER.md` | 27개 행이 [미확인]으로만 읽힘 | ◆ 표시 27개 + 요약 문단. **상태·건수는 불변** |

### 판정과 무관하게 이미 틀려 있던 것

같은 검토에서 **어제 마지막 커밋(`c448b7d`)이 남긴 낡은 수 하나**를 찾았다.

| 문서 | 적힌 값 | 실측 |
| --- | --- | --- |
| `README.md` · `README.en.md` · `ARCHIVE.md` | 테스트 **273** 통과 | **291** 통과 (`prose-fact-check.md`가 18건을 추가했다) |

`prose-fact-check.md`는 자기 문서에 291을 적었으나 표지 3곳을 갱신하지 않았다. **산문 검사기를 만든 그 커밋이 산문에 낡은 수를 남겼다.** 테스트 건수에는 `<!-- fact: -->` 앵커가 없어 검사기가 보지 못한다. 세 곳 모두 291로 고쳤다.

`ARCHIVE.md`의 감사·실행 기록 수도 이 문서가 더해져 49 → **50**(감사 36 · 실행 14)이 됐고, 표지의 `audit-run-records` 앵커와 함께 갱신했다.

---

## 결론

1. **미확인 27건을 전수 판정했다. 21건이 유효한 결함이고, 4건은 조건이 사라져 있었다** — 해소 3(P1-9·P1-16·P1-36), 무효화됨 1(P1-14), 부분해소 2(P1-5·P1-39), 미해소 20, 유효 확정 1(P1-21).
2. **P1-14는 2026-08-12에 이미 [무효화됨]으로 판정돼 있었다.** 등재부가 옮기지 않아 [미확인]으로 남았다 — 앞선 triage가 8건에서 본 것과 같은 형태다. **이 저장소가 되풀이한 실패는 결함이 아니라 판정을 옮기지 않은 것이다.**
3. **등재부의 파일:라인 근거 3건이 어긋나 있었다.** 원인은 리팩터링이 아니라 **옮겨 적을 때 재측정하지 않은 것**이고, 두 검사기(`check-links` · `check-doc-facts`) 사이의 틈에 파일:라인이 있다. 세 건은 고쳤고 검사기는 만들지 않았다.

## 다음 작업

없음. 이 저장소는 동결 상태이며 이 문서는 판정만 남긴다. 후속 개발은 새 프로젝트에서 이루어지고, 위 21건은 **그 프로젝트가 같은 결함을 갖는지 확인할 목록**이지 이 저장소의 수정 대상이 아니다.

## 미해소로 남긴 것

- **판정만 했고 하나도 고치지 않았다.** 유효 21건 전부 그대로다
- **등재부 재집계를 하지 않았다.** 동결 규칙에 따라 상태 칸·건수·`fact` 앵커를 유지했다. 이 문서의 판정을 반영하려면 동결을 푸는 결정이 먼저 필요하다
- **P1-29의 결합**(타임아웃 메시지가 `run.ts:2732`의 정규식 신호를 겸한다)에 **신규 ID를 부여하지 않았다.** 동결 중이므로 등재하지 않고 위 §P1-29에 기록만 남긴다
- **P1-31을 재측정하지 않았다.** 코드 구조가 불변임만 확인했고, 여유 189자는 등재 시점 이 호스트의 측정값이다
- **파일:라인 검사기를 만들지 않았다.** 인용 495건을 한 번 훑었을 뿐이고, 그 스캔은 이 저장소에 남지 않는다 — `link-audit-full.md`가 "검사기가 저장소에 들어가지 않았다"고 적었다가 `link-checker-in-repo.md`에서 되돌린 것과 **같은 상태로 끝난다.** 자동 검사가 어려운 이유는 명확하다: 인용이 그 문서의 대상 커밋 기준이므로, 검사기가 문서마다 커밋을 읽고 `git show <commit>:<path>`로 대조해야 한다. 설계는 가능하고 **하지 않았다**
- **감사 문서의 인용 100여 건은 대조하지 않았다.** 각자의 대상 커밋 기준이므로 HEAD와 비교하는 것이 무의미하고, 커밋별 대조는 위 검사기가 있어야 한다
- **P1-18을 실행으로 재현하지 않았다.** 하위 디렉터리 Task 픽스처가 필요하며 코드 읽기로 판정했다
