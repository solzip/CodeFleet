# P1-53 — `codefleet prompt`가 계약을 전달하지 않는다

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 12:05 (KST) |
| 대상 커밋 해시 | `ce3a4c1` (작업 시작 시점) |
| 작업 유형 | **수정** (확인 → 실패 테스트 → 수정 → 등급 재판정) |
| 선행 문서 | `docs/audits/2026-08-13/13-output-fidelity.md`, `docs/runs/2026-08-13/conventions.md` |
| 번호 실측 최대값 | **P0-16 / P1-60** (`grep -rhoE "P[01]-[0-9]+" docs/ src/ test/`) |

---

## B-1. 이번 완주는 어느 경로였나 — **run.ts 경유**

Run Trace에 프롬프트 산출물이 남아 있어 직접 열었다.

```
$ grep -n "^## " .codefleet/runs/2026-08-13_001/prompt.md
 3: ## Task
 7: ## Role and Guardrails      ← 있다
12: ## Goal
15: ## Objective Context        ← 있다
18: ## Allowed Scope
21: ## Excluded Scope
24: ## Constraints
29: ## Done Criteria
34: ## Workflow
37: ## Verification             ← 있다
42: ## Operating Rules
50: ## Expected Final Response
```

본문도 실값이다:

```
## Role and Guardrails
- Acting as: INFRA_OPERATOR
- Effective mode: COMMAND_EXEC
- This ceiling is enforced by the Harness, not by convention. Work that exceeds it is refused, not undone.

## Objective Context
- obj-001 (ONE_OFF): Fixture first full loop — this Task is item 1 of 1

## Verification
The Harness runs these itself after your work, and their result is evidence rather than a claim.
Reporting that they pass does not make them pass.
- fixture-check: node test/check.js
```

코드 경로도 일치한다. 그 Run을 만든 커맨드는 `codefleet objective run-next obj-001`이고, `handleObjective`(`src/cli.ts:550`)가 `runTask`를 부르며, `executeRun`이 `renderPrompt(task, {...})`를 contract와 함께 호출한다(`src/run.ts:863-873`).

### 판정의 의미

**완주 보고서의 서술은 유효하다.** 격리된 worktree에서 작업한 에이전트는 역할·상한·Objective 맥락·검증 조건을 **모두 본 상태**였다. 계약을 못 본 에이전트가 아니었다.

만약 `cli.ts:162` 경유였다면 완주의 의미가 달라졌을 것이다 — "계약이 실행을 구속한다"는 전제가 그 Run에서는 성립하지 않았다는 뜻이 되기 때문이다. **그 경우가 아님을 산출물로 확인했다.**

## B-2. 실패 테스트

`test/prompt.test.ts` 신규. **`renderPrompt`에 대한 이 저장소의 첫 테스트다** (`grep -rn "renderPrompt(" test/` → 수정 전 0건).

CLI를 프로세스로 띄워 실제 경로를 지난다(`test/cli.test.ts`의 `runCli` 패턴).

수정 전 실행 결과 — **3건 전부 실패**:

```
✖ codefleet prompt writes the contract the agent is delegated, not the scope alone
  actual: [ 'role', 'resolved role id', 'effective mode', 'ceiling is enforced',
            'objective context', 'objective id', 'verification section',
            'verification command', 'verification is executed, not claimed' ]
  expected: []
✖ codefleet prompt refuses a Task with no approved revision ...
  AssertionError: expected a refusal, got: Prompt written: .codefleet\prompts\sample.md
✖ codefleet prompt refuses a Task edited after approval
  AssertionError: expected a refusal, got: Prompt written: .codefleet\prompts\sample.md
```

**계약 요소 9개가 전부 빠져 있었고, 승인 없는 Task와 승인 후 편집된 Task에도 프롬프트가 만들어졌다.**

## B-3. 수정

### 무엇을 고쳤나

`run.ts`의 해석 로직을 추출해 두 호출부가 **같은 코드로** 계약을 해석하게 했다.

| 파일 | 변경 |
| --- | --- |
| `src/run.ts` | `resolveRoleAndMode(config, task)` 추출 — `executeRun`이 인라인으로 갖고 있던 커스텀 역할 검증 + `resolveAgentRole` + `resolveGuardrails` 블록. `executeRun`은 이제 이 함수를 부른다 |
| `src/run.ts` | `resolveContractForPrompt(rootDir, taskId)` 신규 export — 승인 확인 → 역할·모드 → 검증 커맨드 → accepted Objective 맥락 |
| `src/cli.ts` | `handlePrompt`가 `resolveContractForPrompt`를 거쳐 `renderPrompt(task, contract)`를 호출 |

`run.ts` 호출부가 넘기는 5개 필드(`roleId` / `roleGuidance` / `effectiveMode` / `verificationCommands` / `objectives`)를 그대로 맞췄다. **역할과 모드는 이제 단일 함수에서만 해석된다** — 두 해석은 곧 두 계약이므로.

### 거부 경로

지시대로, 계약을 구성할 수 없으면 프롬프트를 만들지 않는다.

```
$ codefleet prompt sample     # 승인 없는 Task
Task is not approved for execution: sample (NO_APPROVAL_RECORDED).

Approve the Revision that is about to run:
  codefleet task approve sample --reason "..."
exit=1
```

거부 경로에서는 파일을 쓰지 않는다(테스트가 단언한다). 사유 문구는 `run.ts`의 `approvalRefusal`을 재사용하므로, Run이 거부할 때와 **같은 문장**이 나온다.

승인 후 Task가 편집된 경우도 거부한다 — 승인 해시가 어긋나면 그 계약은 실행될 수 없고, 실행될 수 없는 계약의 프롬프트를 보여주는 것은 없는 위임을 보여주는 것이다.

### 측정

```
$ node --test test/prompt.test.ts
ℹ tests 3   ℹ pass 3   ℹ fail 0

$ npm test
ℹ tests 255  ℹ pass 255  ℹ fail 0
```

수정 전 252건 + 신규 3건 = 255건, 회귀 0건.

### 실물 확인 — 두 경로가 같은 문서를 만든다

fixture(`C:\cf-fixture`)에서 preview를 다시 생성해 Run이 실제로 보낸 프롬프트와 비교했다.

```
$ codefleet prompt add-subtract
Prompt written: .codefleet\prompts\add-subtract.md
taskRevision: 1
role: INFRA_OPERATOR (effective mode COMMAND_EXEC)

$ diff .codefleet/prompts/add-subtract.md .codefleet/runs/2026-08-13_001/prompt.md
(차이 없음)
```

**바이트 단위로 동일하다.** 수정 전 같은 비교에서 3개 절 12줄이 달랐다.

## B-4. 등급 재판정 — **P1 유지**

물음: 계약이 에이전트에게 전달되지 않는 것이 "승인된 계약이 실행을 구속한다"는 모델 전제를 무효화하는가.

**무효화하지 않는다. P0로 올리지 않는다.**

근거:

1. **실제 위임 경로는 계약을 전달했다.** 에이전트를 띄우는 것은 `runTask` 하나뿐이고(`src/run.ts`의 `runAgentSafely`), 그 경로는 처음부터 contract를 넘겼다. B-1에서 산출물로 확인했다.
2. **`codefleet prompt`는 아무것도 실행하지 않는다.** `.codefleet/prompts/<id>.md`에 파일 하나를 쓸 뿐이고, **어떤 Run도 그 파일을 읽지 않는다.** Run은 자신의 `runs/<id>/prompt.md`를 직접 렌더링한다.
3. 따라서 결함의 피해는 **Harness 밖**이다 — 사람이 그 파일을 보고 "에이전트가 무엇을 받는지" 오판하거나, 그것을 손으로 에이전트에 붙여넣는 경우. 후자는 CodeFleet이 관측하지 않는 위임이므로 애초에 이 모델의 구속 대상이 아니다.

**판정이 뒤집혔을 조건**: 이번 완주가 `cli.ts` 경유였다면 P0였다. 그 Run에서는 승인된 계약이 실행을 구속하지 못한 것이 되기 때문이다. B-1이 그 경우가 아님을 확인했으므로 등급은 유지한다.

`docs/audits/2026-08-13/13-output-fidelity.md`의 P1-53 등재는 **고치지 않았다.** 이 문서가 정정·확정 사실을 보유한다 (`CONVENTIONS.md` §7).

---

## 결론

1. 2026-08-13 완주는 `run.ts` 경유였고, **에이전트는 계약을 본 상태에서 작업했다.** 완주 보고서의 서술은 유효하다.
2. `codefleet prompt`가 계약 9요소를 누락하던 것을 고쳤고, 두 경로의 산출물이 **바이트 단위로 동일**해졌다. 계약을 구성할 수 없으면 거부한다.
3. P1-53은 **P1 유지** — 실행 경로가 아니라 미리보기 경로의 결함이므로 모델 전제를 무효화하지 않는다.

## 다음 작업

- **P1-61**(신규, 아래) — `npm test`의 posttest가 실패 중이다. 이번 변경과 무관한 선행 상태이며, 수정하지 않았다
- P1-50(P0 등급) — 이번 범위 밖. `run-record.md`의 거짓 문장은 그대로다
- `docs/audits/2026-08-13/SUMMARY.md` 부재

## 미해소로 남긴 것

### 신규 등재 — P1-61

| ID | 위반 | 근거 | 상태 |
| --- | --- | --- | --- |
| **P1-61** | `npm test`의 `posttest`(rule coverage 체커)가 실패한다. 테스트 255건은 전부 통과하는데 커버리지 주장 1건이 규칙 본문과 불일치해 종료 코드가 실패다 | `rule coverage check failed: - RUN_PLAN_AGENT_ADAPTER_RESOLUTION: claimed condition is not in the rule: "selectionSource"`. 주장 위치는 `test/adapter-resolution.test.ts:375` | 미해소 |

**이번 변경과 무관함을 실측으로 확인했다.** `git stash push -u -- src test`로 작업 내용을 걷어내고 커밋 상태(`ce3a4c1`)에서 `npm test`를 돌린 결과 **동일한 실패**가 나왔다. 즉 선행 상태다.

이것이 중요한 이유: `npm test`가 빨간 상태이므로, 앞으로 어떤 작업도 "테스트 통과"를 근거로 쓸 수 없다. `CONVENTIONS.md` §10이 [해소] 판정에 테스트를 요구하는데, **그 테스트를 돌리는 커맨드 자체가 실패로 끝난다.**

### 그 밖에

- **Phase B 범위 밖으로 둔 것**: P1-50(P0), P1-54, P1-55, P1-57, P1-59 — 지시대로 손대지 않았다
- **`renderPrompt`의 `contract?` 옵셔널은 그대로다.** 호출부 2곳이 모두 넘기게 됐지만 시그니처는 여전히 옵셔널이므로, 세 번째 호출부가 생기면 같은 결함이 재현될 수 있다. 옵셔널 타입 통일은 별도 작업으로 예정돼 있어 이번에 바꾸지 않았다 (`13-output-fidelity.md` 작업 3의 필수 후보 목록 #3)
- **작업 트리 전체가 CRLF다.** `.gitattributes`가 `* text=auto eol=lf`이므로 인덱스에서는 LF로 정규화되고 diff도 실제 변경만 보여준다(116 insertions / 42 deletions). 커밋에는 영향이 없으나, 체크아웃이 왜 CRLF인지는 **미확인**
