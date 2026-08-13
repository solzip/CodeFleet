# 산출물 충실도 감사 — P1-50 형태의 전수 조사

| 항목 | 값 |
| --- | --- |
| 일시 | 2026-08-13 11:19 (KST) |
| 커밋 | `e5fb188b0951f30556da6b8b39a9d2a8db8e5a46` (working tree clean; `docs/runs/`·`docs/audits/2026-08-13/`만 untracked) |
| **번호 실측 최대값** | **P0-16 / P1-52** — `grep -rhoE "P[01]-[0-9]+" docs/ src/ test/ \| sed 's/P[01]-//' \| sort -un \| tail -1`. P0는 1~16 연속, P1은 1~52 연속. 신규는 **P0-17 / P1-53**부터 |
| 범위 | 판정·등재만. 수정·테스트 작성·설계 제안 없음 |

## 조사한 형태

> 같은 산출물을 생성하는 호출부가 둘 이상인데, 넘기는 인자가 서로 다르고,
> 누락돼도 타입·테스트·런타임 어디서도 걸리지 않는다

---

## 작업 1 — 다중 호출부 전수

### 1-1. 산출물 생성 함수 인벤토리

`src/`에서 산출물(문서·번들·원장·Run Trace)을 만드는 함수를 전수로 뽑고 호출부를 셌다.

```
$ grep -rnE "^(export )?(async )?function (render|build|capture|compute|derive|make)[A-Z]" src/
```

**측정 결과: 27개 중 호출부가 2곳 이상인 것은 3개.**

| 함수 | 정의 | src/ 호출부 수 | 불일치 |
| --- | --- | --- | --- |
| `renderRunRecord` | `run-record.ts:94` | **2** | **있음** |
| `renderPrompt` | `prompt.ts:28` | **2** | **있음** |
| `captureWorkspaceSnapshot` | `workspace-snapshot.ts:77` | **2** | 없음 |
| `buildRunSummary` | `run.ts:1375` | 1 | — |
| `buildVerificationEvidence` | `run.ts:1745` | 1 | — |
| `buildEvidenceBundle` | `review.ts:391` | 1 | — |
| `computeDelta` / `collectSnapshotGaps` | `workspace-snapshot.ts:212` 외 | 각 1 | — |
| `renderSanitizedSummary` | `export.ts:289` | **0** | 작업 4 참조 |

`appendEvent`(`ledger.ts`)는 호출부가 여럿이지만 호출부마다 **다른 이벤트 타입과 다른 payload**를 쓰므로 "같은 산출물, 다른 인자" 형태에 해당하지 않는다. 조사 대상에서 제외했다.

### 1-2. `renderRunRecord` — 인자 비교 (P1-50, 기등재)

| 인자 | `run.ts:1311-1321` (Run 자신) | `review.ts:367-375` (리뷰 후 갱신) |
| --- | --- | --- |
| `runId` / `taskId` / `createdAt` | O | O |
| `task` | O | O |
| `runSummary` | O | O |
| `harnessObservation` | O | O |
| **`verificationEvidence`** | **O** | **X — 누락** |
| `localReview` | O (`null`) | O (리뷰 객체) |

영향받는 산출물 문장: `src/run-record.ts:275-280`.

### 1-3. `renderPrompt` — 인자 비교 (신규)

| 인자 | `run.ts:863-873` (Run이 실제로 보내는 프롬프트) | `cli.ts:162` (`codefleet prompt`) |
| --- | --- | --- |
| `task` | O | O |
| **`contract`** (`PromptContract`) | **O** — `roleId` / `roleGuidance` / `effectiveMode` / `verificationCommands` / `objectives` | **X — 인자 자체가 없음** |

```ts
// src/cli.ts:162
await writeFile(promptPath, renderPrompt(task), "utf8");
```

영향받는 산출물 절 (`contract === undefined`일 때 전부 빈 문자열):

| 절 | 함수 | 라인 |
| --- | --- | --- |
| `## Role and Guardrails` | `renderRole` | `prompt.ts:69-72` |
| `## Objective Context` | `renderObjectives` | `prompt.ts:92-95` |
| `## Verification` | `renderVerification` | `prompt.ts:107-110` |

### 1-4. `captureWorkspaceSnapshot` — 불일치 없음

`run.ts:931-942`(PRE_RUN)와 `run.ts:975-986`(POST_RUN)의 인자는 **`phase` 하나만 다르고 나머지 10개가 동일**하다. 전달 누락 없음. (다만 시그니처의 옵셔널 필드는 작업 3에서 별도 판정.)

---

## 작업 2 — 누락 시 산출물이 무엇을 말하는가

판정 기준: [침묵] 절이 안 나옴 / [불명] 정직하게 "정보 없음" / [거짓] 사실과 다른 문장.

### 2-1. `renderRunRecord`에 `verificationEvidence` 누락 → **[거짓]**

```ts
// src/run-record.ts:275-280
if (attempts.length === 0) {
  lines.push(
    input.verificationEvidence === undefined || input.verificationEvidence === null
      ? "No verification evidence was produced, so nothing here says what was checked."
      : "This Run planned no verification commands. The gate result above rests on no executed command."
  );
}
```

실제 산출물(`runs/2026-08-13_001/run-record.md`, 리뷰 후 현재 상태):

```
65: verificationGateResult : SATISFIED
70: attempts               : 1 executed of 1 recorded, 0 blocked
73: No verification evidence was produced, so nothing here says what was checked.
...
107: verificationEvidenceRef: .codefleet/runs/2026-08-13_001/verification/verify-001.json
```

73행은 **거짓이다.** `verify-001.json`은 존재하고 `HARNESS_EXECUTED` / `PASS`를 담고 있으며, 같은 파일 70행과 107행이 그것을 증언한다. 한 문서 안에서 세 문장이 모순된다.

**주목할 점**: 이 함수는 [침묵]·[불명]·[거짓] 세 갈래를 **이미 갖고 있다.** `verificationEvidence`가 `null`이면 "This Run planned no verification commands"라는 [불명]을 낸다. 누락(`undefined`)만 [거짓] 갈래로 떨어진다. 옵셔널 선언(`?`)이 `undefined`를 허용해 그 갈래를 열어 뒀다.

→ 기등재 **P1-50**. 등급 재판정은 아래 등재 목록 참조.

### 2-2. `renderPrompt`에 `contract` 누락 → **[침묵]** (오독 유발로 등재)

실측했다. 같은 Task로 두 경로를 각각 생성해 diff한 결과:

```
$ codefleet prompt add-subtract
$ diff .codefleet/prompts/add-subtract.md .codefleet/runs/2026-08-13_001/prompt.md
6a7,11
> ## Role and Guardrails
> - Acting as: INFRA_OPERATOR
> - Effective mode: COMMAND_EXEC
> - This ceiling is enforced by the Harness, not by convention. Work that exceeds it is refused, not undone.
9a15,17
> ## Objective Context
> - obj-001 (ONE_OFF): Fixture first full loop — this Task is item 1 of 1
27a36,40
> ## Verification
> The Harness runs these itself after your work, and their result is evidence rather than a claim.
> Reporting that they pass does not make them pass.
> - fixture-check: node test/check.js
```

거짓 문장은 없다. **절 세 개가 통째로 사라진다.**

오독 가능성 판정 — **높다. 등재 대상이다.**

1. `codefleet prompt <task-id>`의 존재 이유는 "에이전트가 무엇을 받는지 미리 본다"이다. 그 목적으로 쓰면 **실제와 다른 문서**를 본다.
2. 사라지는 절이 하필 **계약의 핵심 세 축**(역할·상한 / Objective 맥락 / 검증 조건)이다.
3. `prompt.ts:1-8`의 파일 주석이 이 상태를 **결함으로 명시**하고 있다:
   > "The prompt carried the scope and nothing else: the agent was told where it could write but not what role it was acting in, what ceiling it was under, or what would be run against its work afterwards. **An agent cannot honour a contract it was not shown.**"

   그 결함을 고친 커밋이 `run.ts` 호출부만 고쳤다. `cli.ts:162`는 주석이 서술하는 **수정 전 상태 그대로**다.
4. 두 파일 경로가 달라(`prompts/<id>.md` vs `runs/<id>/prompt.md`) 서로 덮어쓰지 않으므로, 불일치가 드러날 계기가 없다.

→ 신규 **P1-53**.

### 2-3. `captureWorkspaceSnapshot` — 불일치 없으므로 해당 없음

---

## 작업 3 — 옵셔널 필드 감사

산출물 생성 함수의 시그니처에서 옵셔널(`?:`)로 선언된 필드 전수.

| # | 필드 | 위치 | 정말 없을 수 있나 | 판정 |
| --- | --- | --- | --- | --- |
| 1 | `verificationEvidence?` | `run-record.ts:19` | **아니다.** Run은 항상 VerificationEvidence를 쓴다(`run.ts:1285`). 리뷰 호출부가 안 넘겨서 옵셔널이 됐다 | **필수 후보 (최우선)** — 실제 [거짓] 발생 |
| 2 | `localReview?` | `run-record.ts:20` | **있을 수 있다.** 리뷰 전 Run에는 없다. 다만 두 호출부 모두 명시 전달(`null` / 객체)하므로 `undefined` 경로가 실제로 안 쓰인다 | `\| null` 명시형으로 좁힐 후보 |
| 3 | `contract?` | `prompt.ts:28` | **아니다.** Run 경로는 항상 만든다. CLI가 안 넘겨서 옵셔널이 됐다 | **필수 후보** — [침묵] 발생 |
| 4 | `workspaceRootRef?` | `workspace-snapshot.ts:85` | **아니다.** 호출부 2곳 모두 `"."` 전달 | 필수 후보 (잠복) |
| 5 | `selectedWorkspaceRootRealPath?` | `workspace-snapshot.ts:86` | **아니다.** 호출부 2곳 모두 전달 | 필수 후보 (잠복) |
| 6 | `workingDirectoryRef?` | `workspace-snapshot.ts:87` | **아니다.** 호출부 2곳 모두 전달 | 필수 후보 (잠복) |

### 3-1. 4·5·6은 P1-50과 같은 기제를 갖고 있다 — 기본값이 값을 날조한다

```ts
// src/workspace-snapshot.ts:139-141
workspaceRootRef: input.workspaceRootRef ?? ".",
selectedWorkspaceRootRealPath: input.selectedWorkspaceRootRealPath ?? "",
workingDirectoryRef: input.workingDirectoryRef ?? ".",
```

`?? "."`은 **부재 표시가 아니라 주장**이다 — "작업 디렉터리는 저장소 루트다". `?? ""`도 `unavailableReason`이 아니라 빈 경로를 사실처럼 기록한다. 이 산출물의 나머지 필드가 전부 `SnapshotSection<T>`(값 + `unavailableReason`) 형태로 부재를 표현하는 것과 대비된다(`workspace-snapshot.ts` 참조).

**현재 호출부 2곳이 모두 전달하므로 살아 있는 결함은 아니다.** 세 번째 호출부가 생기는 순간 P1-50이 그대로 재현되는 구조다.

→ 신규 **P1-54** (잠복).

### 3-2. 대조군 — 같은 저장소에 더 엄격한 관용구가 이미 있다

```ts
// src/run.ts:1388-1389 — buildRunSummary의 시그니처
verificationEvidenceRef: FileRef | null;
verificationEvidence: VerificationEvidence | null;
```

`?:`가 아니라 `| null`이다. 호출부가 **반드시 무언가를 명시해야** 하고, 빠뜨리면 타입 검사가 잡는다. `RunRecordInput`이 같은 값을 `?:`로 받은 것이 P1-50의 타입 층 원인이다.

---

## 작업 4 — 죽은 경로

### 4-1. 소비는 있는데 생산이 없는 것

```
$ grep -rn "\"<VALUE>\"" src/    (값별 전수)
```

| 값 | 타입 | 생산 | 소비 | "이 필드를 본 사람이 무엇을 믿는가" | 우선 |
| --- | --- | --- | --- | --- | --- |
| `WAIVED_ALLOWED` | `VerificationGateResult` | **0** | 3 (`auto-review.ts:65`, `ledger.ts:465`, `review.ts:574`) | "검증을 면제하고 통과시키는 경로가 있다" — **이 빌드엔 없다** | **★ 기등재 P1-52** |
| `WAIVED_BY_POLICY` | `VerificationAuthority` | **0** | **0** (`run.ts:55` 선언뿐) | "정책이 검증을 대신 보증하는 권한 등급이 있다" | **★ 신규** |
| `WAIVER` | `VerificationGateReason` | **0** | **0** (`run.ts:58` 선언뿐) | "게이트가 waiver 때문에 통과했다고 적히는 사유값이 있다" | **★ 신규** |
| `SUPERSEDED` | `LocalReviewStatus` | **0** | **0** (`review.ts:21` 선언뿐) | "대체된 리뷰는 그렇게 표시된다" — 표시되지 않는다 | 신규 |

**★ 표시 3개가 이번 waiver 오독을 직접 유발한 형태다.** `VerificationGateResult` / `VerificationAuthority` / `VerificationGateReason` 세 타입이 각각 waiver 전용 값을 하나씩 갖고 있어, **타입 선언만 읽으면 "검증 waiver가 구현돼 있다"고 읽힌다.** 실제로는 셋 다 생산 코드가 0곳이다. 2026-08-13 감사(문서 12)에서 "검증 게이트를 waiver로 통과시켰다"는 전제가 나온 표면이 여기다.

`SUPERSEDED` 부수 확인: `supersedesLocalReviewId`는 입력받아 기록하지만(`review.ts:314`), 대체된 쪽에 상태를 남기지 않는다. 게다가 `review-decision.local.json`은 **경로가 하나이고 리뷰할 때마다 덮어쓰인다**(`review.ts:279`). 이전 로컬 결정은 남지 않고, `.codefleet/reviews/<id>/evidence-bundle.json`만 누적된다.

→ 신규 **P1-55** (`WAIVED_BY_POLICY` / `WAIVER`), **P1-56** (`SUPERSEDED`).

### 4-2. 선언·검증까지 하고 아무도 읽지 않는 설정 플래그

`types/config/profile`을 제외한 사용처를 셌다.

| 플래그 | 사용처 | 기본값 | 이 값을 설정한 사람이 무엇을 믿는가 | 방향 |
| --- | --- | --- | --- | --- |
| **`policies.harness.allowedModes`** | **0** | 4개 모드 전부 | **"이 워크스페이스에서 허용되는 harnessMode를 제한했다"** | **위험** — 제한이 걸리지 않는다 |
| `policies.commands.allowProviderReportedCommandTruth` | **0** | `false` | "provider 주장을 커맨드 진실로 쓸지 여기서 정한다" | 중립 |
| `policies.harness.approvalRequiredForDestructiveCommands` | **0** | `true` | "파괴적 커맨드에 승인이 필요하다" | 안전 방향 |

`allowedModes`는 `config.ts:148-157`에서 **배열인지, 값이 유효한 모드인지까지 검증한다.** 그리고 `config.ts:167`에서 `CodeFleetConfig`로 실린 뒤, 어디서도 읽히지 않는다. `maxMode`는 읽히는데(`meetMode`의 `profileMaxMode` 경로) `allowedModes`는 아니다. **오타는 거부하면서 값은 무시한다** — 이 저장소 자신이 `config.ts:183-185` 주석에서 경계한 형태다:

> "A silently dropped denied entry is worse than no policy at all: the author believes the command is blocked and nothing says otherwise."

`approvalRequiredForDestructiveCommands`의 실제 동작: `preflightCommand`의 `approvedCategoryIds`가 호출부에서 **빈 배열로 하드코딩**돼 있다(`run.ts:1630`). 즉 파괴적 커맨드는 플래그와 무관하게 항상 차단된다. 결과는 안전하지만, **플래그를 `false`로 바꿔도 완화되지 않으므로 프로파일이 통제점인 척한다.**

→ 신규 **P1-57** (`allowedModes`), **P1-58** (나머지 둘).

### 4-3. 반대 방향의 죽은 경로 — 생산 코드는 있는데 진입점이 없다

| 모듈 | 상태 |
| --- | --- |
| `src/export.ts` (309줄, export 함수 7개) | **`src/` 안 호출자 0.** `validateFieldPath` / `validateExportTarget` / `tiersNest` / `resolveAllowlist` / `sanitize` / `renderSanitizedSummary` / `exportIsPermitted` 전부 `test/export.test.ts`에서만 호출된다 |
| CLI `export` 커맨드 | **없다.** `cli.ts:46-79`의 switch에 `init/run/prompt/task/status/runs/apply/review/objective/lock/help`만 있다 |
| `export.ts`의 디스크 쓰기 | **0.** `grep -n "writeFile(\|writeJson(" src/export.ts` → 결과 없음 |

그런데 `run-record.ts:4-7`의 파일 주석은 export가 **동작하는 기능인 것처럼** 서술한다:

> "It exists separately from exports/summary.md because most Runs are never exported and **redaction can block an export outright.** If the only readable record lived in the export set, a Run that actually happened would leave nothing a person can read."

redaction·노출 등급(`PUBLIC`/`INTERNAL_SHARED`/`LOCAL_PRIVATE`)이 구현·테스트까지 돼 있으므로, 코드를 읽는 사람은 **"내보내기에 비밀 정보 보호가 걸려 있다"고 믿는다.** 실제로는 내보낼 방법이 없다.

→ 신규 **P1-59**.

---

## 작업 5 — 테스트가 산출물 본문을 단언하는가

### 5-1. 분류

테스트가 산출물을 읽는 지점을 산출물별로 셌다(`readFile` / `readJson` / `path.join` 동반 기준, grep 계수).

| 산출물 | 형태 | 테스트 읽기 지점 | 단언 분류 |
| --- | --- | --- | --- |
| `harness-observation.json` | JSON | 21 | [필드 존재]·[필드 값] |
| `run-plan.json` | JSON | 17 | [필드 존재]·[필드 값] |
| `run-summary.json` | JSON | 16 | [필드 존재]·[필드 값] |
| `review-decision.local.json` | JSON | 9 | [필드 존재]·[필드 값] |
| `evidence-bundle.json` | JSON | 3 | [필드 존재]·[필드 값] |
| `ledger.jsonl` | JSON | 1 | [필드 값] |
| **`run-record.md`** | **사람이 읽는 문서** | **6** | **[본문 내용]** |
| **`prompt.md`** | **에이전트가 읽는 문서** | **1** | **[본문 내용]** |

**측정: 총 74개 읽기 지점 중 텍스트 산출물은 7개(9.5%).** 계수 방법은 grep이므로 근사치다.

의외의 결과: **run-record.md를 읽는 6곳은 전부 [본문 내용]을 단언한다.** [파일 존재]만 확인하고 끝내는 테스트는 없다.

```
test/isolation.test.ts:441-442        /GIT_WORKTREE/, /not.*applied to the workspace/i
test/isolation.test.ts:764            /not discarded/i
test/process-boundaries.test.ts:421   limits 보고 여부
test/process-boundaries.test.ts:480-481  /## What the limits did/, /not measured/i
test/run.test.ts:338-339              /added 1, modified 1, removed 0/, /added: src\/generated\.js/
test/review.test.ts:418-441           /# Run <id>/, /## What this Run was for/, /## What is not known/,
                                      gap 전수 포함, /decision\s*:\s*REJECTED/, /Reason: not acceptable/
```

### 5-2. 그런데 문제의 절은 **어떤 테스트도 단언하지 않는다**

```
$ grep -rn "rests on\|What was verified\|actually rests" test/
(결과 없음, exit=1)
```

**P1-35를 닫은 절 — `## What was verified`와 "What the gate result above actually rests on" 블록 — 에 대한 테스트가 0개다.** 문서 12에서 "리뷰 후 재단언을 안 한다"고 적었는데, 실측해 보니 그보다 넓다: **리뷰 전에도 단언하지 않는다.** P1-35 수정에는 회귀 방어가 아예 붙지 않았다.

`test/review.test.ts:434-441`이 리뷰 후 `run-record.md`를 다시 읽지만 단언하는 것은 `decision` / `Reason` / `not final decision truth` 셋뿐이다. 검증 절이 통째로 뒤바뀌어도 통과한다.

### 5-3. `prompt.md`도 한쪽 경로만 덮인다

`test/task-revision.test.ts:338-348`은 프롬프트 본문을 **매우 촘촘히** 단언한다 — 역할, effective mode, ceiling 문장, 스코프, 검증 커맨드, "Reporting that they pass does not make them pass"까지 항목별로 검사한다. 주석도 "measured rather than sampled"라고 적혀 있다.

그런데 이 테스트는 `runTask`를 거친다. **`renderPrompt`를 contract 없이 부르는 경로(= `cli.ts:162`)를 검증하는 테스트는 0개다.**

```
$ grep -rn "renderPrompt(" test/
(결과 없음, exit=1)
```

→ 신규 **P1-60**.

### 5-4. 판정

비율(9.5%) 자체는 등재 근거로 삼지 않는다. JSON 산출물은 필드 단언이 적절한 형태이고, 텍스트 산출물 6+1곳은 실제로 본문을 단언하고 있기 때문이다.

**등재 근거는 비율이 아니라 구멍의 위치다.** 사람이 읽는 유일한 문서에서 "무엇을 검증했는가"를 답하는 절 — 이 제품의 존재 이유에 가장 가까운 절이자 P1-35가 지목했던 바로 그 절 — 에만 단언이 0개다.

---

## 등재 목록

> 실측 최대값 P0-16 / P1-52에 이어 부여한다.

### 등급 재판정

| ID | 조치 | 사유 |
| --- | --- | --- |
| **P1-50 → P0 등급** | **ID는 유지, 등급만 P0로 올린다** | "산출물에 거짓 문장을 만드는 것은 P0" 규칙 적용. 이번 조사에서 [거짓] 판정을 받은 유일한 항목이다. ID를 P0-17로 바꾸지 않는 이유: 문서 12가 이미 P1-50으로 등재·참조하고 있고, ID 재부여는 추적을 끊는다. **P0-17은 사용하지 않고 비워 둔다** |

### 신규

| ID | 등급 | 위반 | 근거 | 판정 |
| --- | --- | --- | --- | --- |
| **P1-53** | P1 | `codefleet prompt`가 Run이 실제로 보내는 프롬프트와 다른 문서를 쓴다. 역할·상한, Objective 맥락, 검증 조건 세 절이 통째로 빠진다 | `cli.ts:162`가 `renderPrompt(task)`를 contract 없이 호출. `run.ts:863-873`은 전달. 빈 문자열 반환은 `prompt.ts:69-72`·`:92-95`·`:107-110`. 실측: 두 경로 diff에서 3개 절 12줄 차이 | **[침묵]** + 오독 유발 |
| **P1-54** | P1 | `captureWorkspaceSnapshot`의 옵셔널 3필드가 부재를 `unavailableReason`이 아니라 **값으로 날조**한다 (`?? "."`, `?? ""`) | `workspace-snapshot.ts:85-87` 선언, `:139-141` 기본값. 같은 산출물의 다른 필드는 `SnapshotSection<T>`로 부재를 표현 | **[잠복 거짓]** — 현재 호출부 2곳 모두 전달하므로 미발현 |
| **P1-55** | P1 | `WAIVED_BY_POLICY`(`VerificationAuthority`)와 `WAIVER`(`VerificationGateReason`)가 **선언만 있고 생산·소비 코드가 0곳**이다. `WAIVED_ALLOWED`(P1-52)와 합쳐 세 타입이 각각 waiver 전용 값을 갖고 있어, 타입만 읽으면 검증 waiver가 구현된 것으로 읽힌다 | `run.ts:55`·`run.ts:58` 선언. `grep -rn "\"WAIVED_BY_POLICY\"\|\"WAIVER\"" src/` → 선언 외 0건 | 죽은 경로 · **오독 유발 최우선** |
| **P1-56** | P1 | `LocalReviewStatus`의 `SUPERSEDED`가 생산되지 않는다. `supersedesLocalReviewId`는 기록하면서 대체된 쪽에는 표시가 없고, `review-decision.local.json`은 경로가 하나라 이전 로컬 결정이 덮어쓰인다 | `review.ts:21` 선언, `deriveLocalReviewStatus`(`:604-634`) 반환값에 없음. `review.ts:279` 단일 경로 | 죽은 경로 |
| **P1-57** | P1 | `policies.harness.allowedModes`가 배열·값 검증까지 받고 **어디서도 읽히지 않는다.** 모드를 제한한 프로파일이 실제로는 아무 모드도 제한하지 않는다 | 전 사용처: `config.ts:148-157`(검증), `:167`(적재), `types.ts:33`·`:46`(선언). 판정 경로 0건. `maxMode`는 읽힘 | 죽은 플래그 · **위험 방향** |
| **P1-58** | P1 | `allowProviderReportedCommandTruth`와 `approvalRequiredForDestructiveCommands`가 검증·적재만 되고 읽히지 않는다. 후자는 `approvedCategoryIds`가 호출부에 `[]`로 하드코딩돼 있어 플래그를 꺼도 완화되지 않는다 | 사용처 각 0건(types/config/profile 제외). `run.ts:1630` 하드코딩 | 죽은 플래그 · 안전 방향 |
| **P1-59** | P1 | export/redaction 서브시스템 전체가 프로덕션에 연결돼 있지 않다. export 함수 7개의 `src/` 호출자 0, CLI 커맨드 없음, 디스크 쓰기 0. 그런데 `run-record.ts:4-7` 주석은 "redaction can block an export outright"라며 동작하는 기능으로 서술한다 | `grep`으로 함수별 `src/` 호출자 전수 0 확인. `cli.ts:46-79` switch에 export 없음 | 죽은 경로 (생산 측) |
| **P1-60** | P1 | 사람이 읽는 문서의 검증 절(`## What was verified` / "actually rests on")을 단언하는 테스트가 **0개**다. P1-35 수정에 회귀 방어가 없다. `renderPrompt`의 contract 없는 경로를 검증하는 테스트도 0개 | `grep -rn "rests on\|What was verified" test/` → 0건. `grep -rn "renderPrompt(" test/` → 0건 | 검증 공백 (P1-50·P1-53 미검출 원인) |

### 등재하지 않은 것

- **`TEMP_WORKSPACE` / `CONTAINER`** (IsolationMode) — 생산 코드는 없지만 `isolation.ts:198-206`이 `ISOLATION_MODE_NOT_IMPLEMENTED:<mode>`로 **정직하게 거부**하고, `requireIsolationForMutation`이 켜져 있으면 Run이 차단된다. **[불명]**이므로 대상 아님.
- **`WORKSTREAM`** (ObjectiveKind) — `deriveQueueStates`(`ledger.ts:460-488`)가 `SEQUENCE`만 분기하므로 `WORKSTREAM`은 `ONE_OFF`와 동일 동작이다. 다만 설계상 두 종류가 같은 큐 진행 규칙을 갖는 것이 의도인지 확인하지 못했다 — **미측정**이므로 등재를 보류한다.
- **`localReview?`** (`run-record.ts:20`) — 옵셔널이지만 호출부 2곳이 모두 명시 전달하고, `undefined` 경로의 출력("No review has been recorded")도 [불명]으로 정직하다. 작업 3 목록에만 남긴다.

---

## [거짓] 판정 요약

전수 조사 결과 **[거짓] 판정을 받은 것은 1건, [잠복 거짓]이 1건이다.**

| ID | 산출물 | 거짓 문장 | 조건 | 상태 |
| --- | --- | --- | --- | --- |
| **P1-50** (→P0) | `runs/<id>/run-record.md` | `"No verification evidence was produced, so nothing here says what was checked."` | **리뷰를 마친 모든 Run.** 즉 완주한 Run일수록 문서가 나빠진다 | **발현 중** — 2026-08-13_001에서 실물 확인 |
| **P1-54** | `runs/<id>/workspace-{pre,post}-run.json` | `workingDirectoryRef: "."` / `workspaceRootRef: "."` / `selectedWorkspaceRootRealPath: ""` 을 부재가 아닌 사실로 기록 | 호출부가 인자를 생략할 때 | **미발현** — 현재 호출부 2곳 모두 전달 |

나머지 신규 등재(P1-53, P1-55~P1-60)는 [침묵] 또는 죽은 경로다. 거짓 문장을 만들지는 않지만, **P1-55는 이번 waiver 오독의 실제 표면**이므로 [침묵] 중 우선순위가 가장 높다.

### 조사 형태에 대한 결론

일반화한 형태 — "같은 산출물, 둘 이상의 호출부, 서로 다른 인자, 어디서도 안 걸림" — 은 이 저장소에서 **3개 생성 함수 중 2개에서 발견됐다.** 표본이 작아 비율은 근거가 못 되지만, 세 층이 동시에 뚫린 조건은 두 건에서 동일했다:

| 층 | P1-50 | P1-53 |
| --- | --- | --- |
| 타입 | `?:`가 `undefined`를 허용 (`run-record.ts:19`) | `?:`가 `undefined`를 허용 (`prompt.ts:28`) |
| 테스트 | 해당 절 단언 0개 | contract 없는 경로 테스트 0개 |
| 런타임 | 기본 분기가 문장을 **출력**한다 (거짓) | 기본 분기가 빈 문자열을 반환한다 (침묵) |

`buildRunSummary`(`run.ts:1388-1389`)가 같은 값을 `| null`로 받아 호출부에 명시를 강제하는 것과 대비된다. 저장소 안에 더 엄격한 관용구가 이미 존재한다.
