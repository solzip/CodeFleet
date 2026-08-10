# 01 — 검증 조건의 기계 판정 가능성

```text
점검 일시   : 2026-08-10
점검 대상   : 770b39b9aa95681782c27d23911271063483a237 (codeFleet/)
             점검 시각의 작업 트리 기준. src/ 는 직전 커밋 2196a8bb 와 바이트 동일하고,
             770b39b 는 README 한/영 분리와 task-001.yaml verification 블록만 담는다.
점검 범위   : src/types.ts, src/task.ts, src/prompt.ts, src/run.ts, src/review.ts, src/run-record.ts
측정 근거   : npm test — 128 tests, 128 pass, 0 fail
             FINAL RULE coverage — 545 condition lines 중 155 covered (28.4%), 41 rules with no claim
판정 기준   : 코드 경로로 확인된 것만 근거로 삼는다. 문서·프롬프트 서술은 근거가 아니다.
```

## 판정: **결함**

Task 스키마는 기계 판정 가능한 검증 조건을 **강제하지 않는다**. 자유 텍스트 조건이 1급 필드로 존재하고, 실행 가능한 검증 커맨드는 선택 필드다.

## 근거

### 스키마 정의

`src/types.ts:87-98`

```ts
export interface Task {
  id: string;
  title: string;
  projectPath: string;
  goal: string;
  scope: TaskScope;
  verification?: TaskVerification;   // ← 선택 (types.ts:93)
  constraints: string[];             // ← 자유 텍스트 (types.ts:94)
  doneCriteria: string[];            // ← 자유 텍스트 (types.ts:95)
  workflow: string[];
  status: string;
}
```

기계 판정 가능한 유일한 필드는 `verification.commands`이고 (`src/types.ts:78-85`), 이것만 optional이다.

### 검증 로직이 optional을 확인한다

`src/task.ts:140-145`

```ts
function validateVerification(value: Record<string, unknown>, errors: string[]): void {
  const verification = value.verification;
  if (verification === undefined) {
    return;                          // ← 오류 없이 통과
  }
```

`src/task.ts:150-153` — `verification` 객체가 있어도 `commands`가 없으면 또 한 번 조용히 통과한다.

반면 자유 텍스트 필드는 **필수**로 강제된다 — `src/task.ts:94-95`:

```ts
requireStringArray(value, "constraints", "constraints", errors);
requireStringArray(value, "doneCriteria", "doneCriteria", errors);
```

즉 스키마의 강제 방향이 반대다. 사람이 읽어야만 하는 조건은 필수, 시스템이 판정할 수 있는 조건은 선택이다.

### 자유 텍스트 조건을 소비하는 코드 경로

`doneCriteria` 전체 참조 지점 (grep, src/ 전수):

| 위치 | 용도 |
|---|---|
| `src/task.ts:95` | 비어있지 않은 문자열 배열인지만 검사 |
| `src/prompt.ts:23-24` | 프롬프트 마크다운에 `## Done Criteria` 로 삽입 |
| `src/run-record.ts:50-56` | run-record.md 에 목록으로 출력 |
| `src/types.ts:95` | 타입 선언 |

`constraints`도 동일하다 — `src/prompt.ts:20-21` 이 유일한 소비처다.

**평가·판정·게이트 코드는 존재하지 않는다.** 두 필드 모두 "LLM에게 문장으로 전달 → 사람이 읽음"에서 끝난다. `src/prompt.ts:29-35`의 Operating Rules("Do not modify files outside the allowed scope." 등)도 같은 성격의 프롬프트 문자열이다.

### 완화 요인 — 자유 텍스트만으로는 ACCEPTED에 도달할 수 없다

이 부분은 정확히 기록해 둘 가치가 있다.

1. `src/run.ts:236-242` — `requiredGates.verification.required`가 하드코딩된 `true`이고, `waiver.allowed`는 `false`다.
2. `src/run.ts:967-974` — 실행된 검증 attempt가 0건이면 `verificationGateResult: "NOT_SATISFIED"`, `verificationGateReason: "MISSING"`.
3. `src/run.ts:1119-1124` — `assertVerificationEvidence`가 `authority NONE + observedCheck PASS` 조합을 예외로 거부한다.
4. `src/review.ts:454-461` — 게이트가 SATISFIED/WAIVED_ALLOWED가 아니면 `blockedReasons`에 들어가고,
5. `src/review.ts:195-199` — `ACCEPTED` 결정이 예외로 거부된다.
6. 이 차단은 waiver 대상이 아니다. `src/review.ts:434-446`의 waiver는 `bundle.unavailableReasons`만 처리하고, 게이트 판정(`review.ts:454`)은 그 루프 밖에 있다.

따라서 `verification.commands`가 없는 Task는 **실행은 되지만 영원히 ACCEPTED가 될 수 없다.**

### 그런데 왜 여전히 결함인가

막다른 길이라는 사실을 **가장 늦은 지점에서만** 알려준다.

| 단계 | 코드 | verification 없는 Task의 결과 |
|---|---|---|
| `codefleet task validate` | `src/task.ts:59-103` | **통과** (경고조차 없음) |
| `codefleet task approve` | `src/cli.ts:132-147` | **통과** — 승인 이벤트가 원장에 영구 기록됨 |
| `codefleet run` | `src/run.ts:136-673` | **실행됨** — 에이전트가 실제로 워크스페이스를 변경 |
| `codefleet review --decision ACCEPTED` | `src/review.ts:195` | **여기서 최초 거부** |

사람의 승인이 원장에 append-only로 남고 에이전트가 파일을 이미 고친 뒤에야 "이 Task는 애초에 수락 불가능했다"는 사실이 드러난다. `runTask` 진입부에 `verification.commands.length === 0 && requiredGates.verification.required` 조합을 막는 코드는 없다 (`src/run.ts:141-178` 전 구간 확인).

부가로, `examples/tasks/task-001.yaml:18-21`의 doneCriteria 중 "Successful controller responses return ApiResponse<T>."는 `verification.commands`의 `mvn -q test`와 아무 연결이 없다. 두 필드를 잇는 참조 무결성 검사도 없다.

## 발생 조건과 영향 범위

**발생 조건**: Task YAML에 `verification` 블록을 쓰지 않는다. 이것이 스키마상 정상 상태다.

**영향 범위**
- 승인 원장(`.codefleet/tasks/<id>/task-ledger.jsonl`)에 되돌릴 수 없는 승인 이벤트가 남는다 — `src/task-ledger.ts:192-209`.
- 에이전트가 워크스페이스를 실제로 변경한 뒤 격리도 롤백도 없이 남는다 (04번 항목 참조).
- 사용자 입장에서는 "승인도 통과, 실행도 성공, 그런데 리뷰만 안 됨"으로 보인다. 원인이 스키마 설계에 있다는 신호가 어디에도 없다.
- `.codefleet/runs/<runId>/` 아티팩트 일습이 남지만 어떤 게이트도 통과할 수 없는 사장 데이터다.

## 우선순위: **P1**

시스템이 거짓 통과를 만들지는 않는다(그래서 P0가 아니다). 그러나 사람의 승인과 에이전트의 실제 파일 변경을 소모한 뒤에야 실패를 알리므로, 되돌릴 수 없는 자원을 먼저 태운다.

## 권고

1. `src/run.ts` 진입부(현재 `run.ts:162-170`의 command-channel 차단 옆)에서, `requiredGates.verification.required === true`이고 `verificationPlanSeed.commands.length === 0`이면 Run Planning을 거부한다. 차단 메시지는 `run.ts:838-850` 형식을 그대로 따르면 된다.
2. 또는 `src/task.ts:140`에서 `verification.commands`를 필수로 승격한다. 검증 불가 Task를 허용해야 한다면 Task에 명시적 `verification: none` + 사유 필드를 요구해 침묵이 기본값이 되지 않게 한다.
3. `doneCriteria` 항목마다 `commandId` 참조를 붙여 자유 텍스트 조건과 실행 가능한 커맨드를 1:1로 잇고, 매핑되지 않은 항목을 `task validate`에서 경고한다.
