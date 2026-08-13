# 설계 결과 — 무엇을 알아냈나

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 17:30 (KST) |
| 대상 커밋 해시 | `a7afc16` |
| 작업 유형 | **결정** (아카이브. 코드 변경 없음) |
| 선행 문서 | `docs/archive/2026-08-13/ARCHIVE.md`, `docs/archive/2026-08-13/LESSONS.md` |
| 번호 실측 최대값 | **P0-16 / P1-61** (신규 등재 없음) |

`LESSONS.md`는 **무엇을 잘못했나**를 적었고 `ENVIRONMENT.md`는 **환경이 어땠나**를 적었다. 이 문서는 **무엇을 알아냈나**를 적는다 — 코드는 버리지만 설계 결론은 버릴 이유가 없다.

## 읽는 법

각 항목에 **검증 상태**를 붙였다. 이 프로젝트는 파이프라인을 **한 번** 완주했으므로(통제된 fixture, 우회 4건 위에서) "검증됨"은 대개 **관측 1회**를 뜻한다. 반복 검증이나 부하 검증은 하나도 없다.

| 표시 | 뜻 |
| --- | --- |
| **[실행 검증]** | 실제 Run 또는 테스트에서 관측됐다. 근거를 함께 적었다 |
| **[코드만]** | 구현돼 있고 테스트도 있으나 실사용 관측이 없다 |
| **[미검증]** | 설계는 있고 그것이 옳은지 확인한 적이 없다 |

---

## 1. 주장과 관측을 boolean이 아니라 **타입**으로 갈랐다 — [실행 검증]

### 문제

에이전트가 "테스트 통과했습니다"라고 말한다. 이것을 `verified: true`로 저장하는 순간, **그 값을 만든 것이 관측인지 주장인지 되물을 수 없다.** boolean은 출처를 잃는다.

### 해법

증거에 **권한 등급**을 부여하고, 등급 자체를 판정 입력으로 삼았다.

```ts
// src/run.ts:55-58
type VerificationAuthority =
  "NONE" | "PROVIDER_REPORTED_ONLY" | "HARNESS_OBSERVED" | "HARNESS_EXECUTED" | "WAIVED_BY_POLICY";
```

게이트 계산은 `HARNESS_EXECUTED`만 걸러서 본다.

```ts
// src/run.ts:1702-1714
// observedCheck and the gate are computed from Harness-executed attempts only.
// A provider claim never appears here, so it can never move the gate.
const executed = attempts.filter((a) => a.authority === "HARNESS_EXECUTED");
```

주장은 버리지 않고 **다른 자리에** 남긴다.

```ts
// src/run.ts:1164-1175
authority: transcript.commands.length > 0 ? "PROVIDER_REPORTED_ONLY" : "NONE",
commandsObserved: transcript.commands,
commandsExecutedByHarness: [],      // 주장이 무엇이든 여기는 비어 있다
```

### 검증

fixture 완주에서 **같은 커맨드가 두 파일에 갈라져 저장됐다.**

| 파일 | 내용 |
| --- | --- |
| `provider-commands.json` | 에이전트가 스스로 돌린 `node test/check.js` — `PROVIDER_REPORTED_ONLY`, `notCommandTruth: true` |
| `verification/verify-001.json` | Harness가 다시 돌린 같은 커맨드 — `HARNESS_EXECUTED`, `exitCode: 0` |

**게이트를 움직인 것은 두 번째뿐이다.** 근거: `docs/runs/2026-08-13/first-full-loop.md`.

### 가져갈 것

- **출처를 값의 타입으로 만든다.** `boolean` + 별도 `source` 필드는 둘이 어긋날 수 있다. 등급 하나가 둘을 묶는다
- 주장을 **지우지 말고 등급을 낮춰 보관한다.** 지우면 "에이전트가 뭘 했다고 말했나"를 사후에 못 본다
- 등급 이름에 **왜 안 되는지**를 넣는다 — `PROVIDER_REPORTED_ONLY`는 `UNVERIFIED`보다 많은 것을 말한다

### 주의

이 등급 체계는 **선언만 하고 만들지 않은 값**을 셋 갖고 있었다(`WAIVED_BY_POLICY`, `WAIVED_ALLOWED`, `WAIVER` — 생산 코드 0곳). 그리고 그것이 실제로 사람을 속였다 — 2026-08-13 감사가 "검증을 waiver로 통과시켰다"는 틀린 전제로 시작했다. **등급을 늘릴 때는 만드는 코드도 같이 만들어라.** `LESSONS.md` 유형 1 참조.

---

## 2. 상태 변경을 단일 창구로 좁히고 8단계로 고정했다 — [실행 검증]

### 문제

승인·리뷰·반영이 각자 파일을 쓰면, 실패했을 때 **어디까지 반영됐는지** 아무도 모른다. 그리고 같은 명령을 두 번 실행하면 두 번 반영된다.

### 해법

모든 상태 변경이 하나의 엔진을 지난다. 단계가 고정돼 있고 **커밋 지점이 한 곳**이다.

```ts
// src/mutation.ts:13-20
type MutationPhase =
  | "M0_RESOLVE" | "M1_ACQUIRE" | "M2_PRECHECK" | "M3_IDEMPOTENCY"
  | "M4_APPEND"                                   // ← 커밋 지점
  | "M5_REBUILD" | "M6_POSTCHECK" | "M7_RELEASE";
```

```ts
// src/mutation.ts:3-6
// M4 is the commit point: nothing before it leaves a durable change, and a
// failure after it keeps the appended event rather than rolling back, because
// this design forbids silent rollback and ledger rewriting.
```

**M4 이후의 실패는 롤백하지 않는다.** 대신 실패한 단계를 이름으로 보고한다. 조용한 롤백은 "일어난 일"을 지우는 행위이므로 금지했다.

### 멱등 키를 **의미**에서 뽑았다

```ts
// src/mutation.ts:67-75
export function computeMutationId(intent: MutationIntent): string {
  const canonical = JSON.stringify([
    intent.mutationKind, intent.targetId, intent.targetHash ?? "",
    canonicalize(intent.semanticPayload)
  ]);
  return `mut_${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}
```

`semanticPayload`는 **결과 상태를 바꾸는 필드만** 담는다 — 사유 텍스트도 시각도 넣지 않는다(`mutation.ts:27-29`). 그래서 "같은 일을 다시 요청한 것"과 "다른 일"이 키에서 갈린다. 클라이언트가 UUID를 만들어 보내는 방식과 달리, **호출자가 협조하지 않아도 멱등이 성립한다.**

### 검증

fixture에서 `apply`를 두 번 실행했다.

```
1회차: mutationId: mut_fa210cedffe0ce00 / applied ... to the workspace
2회차: mutationId: mut_fa210cedffe0ce00 / already applied; no new ledger event appended
```

**같은 mutationId가 나왔고 원장에 이벤트가 늘지 않았다.**

### 가져갈 것

- **커밋 지점을 하나로 두고 그 전후를 다르게 다룬다.** 앞은 자유롭게 거부, 뒤는 롤백 금지·보고 의무
- **멱등 키를 의미에서 파생한다.** 요청 id를 받는 방식은 호출자를 믿는 것이다
- 실패를 `try/catch` 하나로 뭉치지 말고 **어느 단계에서 죽었는지** 반환한다. `MutationOutcome.failedPhase`가 그 자리다

---

## 3. 결정은 append-only 원장에, 상태는 replay로 — [실행 검증]

### 문제

`status: APPROVED` 같은 가변 필드는 **누가 언제 왜 그렇게 만들었는지**를 지운다. 그리고 그 필드를 손으로 고치면 아무도 모른다.

### 해법

결정을 이벤트로만 쌓고, 조회용 상태는 매번 재생해서 만든다.

```ts
// src/task-ledger.ts:164-165
// Approval state is replayed from the ledger, never read from a mutable field on
// the task file, so an edit cannot quietly leave a stale "approved" flag behind.
```

스냅샷 파일(`objective.json`)은 존재하지만 **read model이고 권위가 없다.** 재생 결과와 다르면 `READ_MODEL_DRIFT`로 분류하고, **원장이 옳고 스냅샷을 다시 만든다** — 반대 방향은 없다(`ledger.ts:499`).

재생이 실패하면 상태를 **추측하지 않고 차단한다.**

```
replayStatus: "COMPLETE" | "BLOCKED"      // ledger.ts:107
LEDGER_STRUCTURAL_FAILURE → 그 Objective의 파생 상태 전부 차단
```

그리고 이 차단은 **읽히지 않는 Objective가 아무 Task나 막는** 방향으로 작동한다. 재생할 수 없는 원장은 어떤 Task에 대한 결정을 담고 있을지 모르기 때문이다(`run.ts:236-250`).

### 검증

fixture 원장 4개 이벤트가 seq 순으로 재생돼 `replayStatus: COMPLETE`를 냈고, 그 위에서 큐 상태(`WAITING`/`NEXT`)가 파생됐다. 원장 손상 시 차단은 `test/isolation.test.ts`가 덮는다.

### 가져갈 것

- **결정과 파생 상태를 파일 단위로 분리한다.** 같은 파일에 두면 언젠가 파생 쪽을 손으로 고친다
- **읽을 수 없는 것과 비어 있는 것을 절대 같은 값으로 수렴시키지 않는다.** 이 프로젝트는 그걸 한 번 틀렸고(P0-16) 고쳤다
- 재생 실패의 **영향 범위를 등급으로 나눈다** — 구조 실패는 전면 차단, 참조 실패는 해당 항목만

---

## 4. 승인이 계약과 그 계약이 놓인 조건을 함께 덮는다 — [실행 검증]

### 문제

Task 파일만 해시로 고정하면, **승인 후에 워크스페이스 정책을 바꿔** 승인자가 본 적 없는 조건에서 실행할 수 있다. 승인은 그대로 유효해 보인다.

### 해법

승인 대상 해시를 **둘의 합성**으로 만들었다.

```ts
// src/task-ledger.ts:160-162
export function approvalTargetOf(revisionHash: string, guardrailHash: string): string {
  return createHash("sha256").update(`${revisionHash}\n${guardrailHash}`).digest("hex");
}
```

Run 시작 시 두 해시를 다시 계산해 대조하고, 어긋나면 거부한다. 거부 사유가 **어느 쪽이 움직였는지**를 구분해서 말한다 — Task가 바뀌었을 때와 프로파일이 바뀌었을 때의 안내가 다르다(`run.ts`의 `approvalRefusal`, `PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL`).

### 검증

이것은 **P0-12로 등재됐다가 닫힌 결함**이다. 처음에는 승인 해시가 Task 파일만 덮었고, 실측으로 재현됐다 — 승인 후 프로파일만 뒤집자 재승인 없이 실행되고 편집이 실 워크스페이스에 반영됐다. 수정 후 fixture의 `run-plan.json`에 `revisionHash`와 `guardrailHash`가 **둘 다** 기록되고 `approvalTargetHash`가 그 둘을 덮는다.

### 가져갈 것

- **승인은 "무엇을"뿐 아니라 "어떤 조건에서"까지 고정해야 한다.** 조건이 밖에 있으면 승인은 반쪽이다
- 합성 해시를 쓰되 **구성 요소를 따로 보관한다.** `approvalTargetHash`만 있으면 무엇이 어긋났는지 말할 수 없다
- 거부 메시지가 **원인 쪽을 지목해야 한다.** "재승인하세요"는 Task를 안 건드린 사람에게 틀린 안내다

---

## 5. 권한은 오직 좁혀지는 방향으로만 합성된다 — [코드만]

### 문제

정책 소스가 여럿이면(코어 기본값 / 프로젝트 프로파일 / 로컬 오버레이 / Task 가드레일 / 실행 옵션) 어느 하나가 **넓히는** 순간 나머지 전부가 무의미해진다.

### 해법

합성을 **meet**(더 좁은 쪽)으로 고정했다.

```
effectivePolicy = meet(Core 기본값, 프로파일, 로컬 오버레이, Task 가드레일, 정책성 Run 옵션)
```

역할은 **상한만 기여하고 권한을 주지 않는다.**

```ts
// src/agent-role.ts:1-8
// AgentRole — a classification, not a permission grant.
// A role contributes an upper bound to effectivePolicy and nothing else.
```

로컬 오버레이는 `RESTRICT_ONLY`이고, **허용된 키 목록**을 프로파일이 정한다(`localPolicy.allowedLocalKeys`). 커스텀 역할은 base보다 넓어질 수 없고, 검증이 그것을 거부한다(`agent-role.ts:135-140`).

### 검증 상태

**[코드만].** 좁혀지는 것은 실사용에서 관측됐다 — 역할 상한이 어댑터 기동을 막았고(우회 1), 그것이 fixture 완주를 위해 역할을 바꾸게 만들었다. 그러나 **오버레이가 권한을 넓히려는 시도**는 테스트에서만 거부됐고 실사용 관측이 없다.

### 가져갈 것과 버릴 것

- **가져갈 것**: meet 합성, 역할=분류(권한 아님), 오버레이 RESTRICT_ONLY
- **버릴 것**: 이 프로젝트의 **역할 표 자체**. 기본 역할 7개 중 커맨드 실행이 가능한 것은 2개이고, **그 둘 중 애플리케이션 코드를 쓰는 역할이 없다.** 좁히는 원칙은 옳았고 축을 잘못 골랐다 — 역할 하나에 "파일을 고칠 수 있나"와 "커맨드를 돌릴 수 있나"를 함께 매단 것이 원인이다

---

## 6. 못 본 것을 두 종류로 갈랐다 — [실행 검증]

### 문제

"확인할 수 없었다"에는 성격이 다른 둘이 섞인다. **도구가 아직 못 보는 것**과 **증거가 깨진 것**이다. 하나로 묶으면 사람이 책임질 수 있는 것까지 영구 차단되거나, 책임질 수 없는 것까지 통과한다.

### 해법

```ts
// src/review.ts:44-60
// A CAPABILITY_GAP is something CodeFleet cannot observe yet; a person can check
// the repository and stand in for it. An EVIDENCE_DEFECT means this Run's
// evidence is missing or does not match its recorded hash, which nobody can
// stand in for, so it is never waivable.
const EVIDENCE_DEFECT_PREFIXES = ["HASH_INVALID","ARTIFACT_NOT_READABLE","MISSING_INPUT_REF","EVIDENCE_TRUNCATED"];
```

`CAPABILITY_GAP`은 **사람이 이름을 지목하고 사유를 적어** 인수할 수 있다. `EVIDENCE_DEFECT`는 어떤 사유로도 통과하지 못한다.

### 검증

fixture 리뷰에서 무면제 `ACCEPTED`가 **실제로 거부됐다.**

```
$ codefleet review <run> --decision ACCEPTED --reason "trial"
ACCEPTED local review is not allowed: capability gap not waived: COMMAND_CHANNEL_NOT_HARNESS_VISIBLE
exit=1
```

갭을 이름으로 지목하고 사유를 붙인 뒤에야 통과했고, 결과가 `DEGRADED` / `WAIVED_INCOMPLETE` / `MIGRATION_READY_WAIVED`로 **세 계층(결정 문서·증거 번들·원장)에 남았다.** "완전한 증거"로 위장되지 않는다.

### 가져갈 것

- **면제 가능한 것과 불가능한 것을 데이터로 구분한다.** 판단을 사람에게 맡기면 매번 달라진다
- 면제는 **갭 이름을 지목하게 한다.** "전부 면제"는 무엇을 면제했는지 남기지 않는다
- 면제 사실을 **영구 기록으로 옮긴다.** 이 프로젝트는 원장 이벤트에 사유 전문을 실었다(`ledger.ts:1124-1128`)

### 남은 결함

면제 사유가 **강제되지 않는다** — `--waive-reason`을 생략하면 일반 리뷰 사유가 조용히 정당화로 승격되고, 그것을 막는 가드가 CLI 경로에서 발동 불가능하다(P1-51, 미해소).

---

## 7. 모든 검사가 "무엇을 봤는지"를 함께 보고한다 — [실행 검증]

### 문제

`violations: []`는 두 가지를 뜻할 수 있다. **전부 검사했고 위반이 없다**와 **아무것도 검사하지 않았다**이다. 후자가 전자로 읽히는 것이 조용한 초록의 본체다.

### 해법

집합을 훑는 검사는 **검사 범위를 값으로 남긴다.**

```ts
// src/run.ts:1206-1211
scanScope: {
  pathsChecked: pathPolicy.checkedPaths.length,
  violationsFound: pathPolicy.violations.length,
  allowedPatterns: ..., deniedPatterns: ...
}
```

설계 규칙이 이것을 **집합을 훑는 모든 규칙에 요구**하고(`scanScope` 필수), `test/design-rules.test.ts`가 기계로 검사한다.

### 검증

이 원칙이 실제로 **두 건의 조용한 초록을 잡았다** — CRLF 때문에 규칙 블록을 0개 읽고 통과한 파서, 그리고 주장을 하나도 기록하지 않고 통과한 커버리지 실행. 커버리지 체커는 지금도 `claims.length === 0`을 실패로 처리한다(`check-rule-coverage.mjs:48-50`).

`14-guard-defence-audit`은 이 원칙을 감사 방법으로 뒤집어 썼다 — 게이트를 하나씩 끄고 **실패한 테스트 수를 세어**, `0`이 나온 게이트 2개를 방어 없는 곳으로 지목했다.

### 가져갈 것

- **판정과 범위를 한 객체에 담는다.** 나중에 붙이면 붙이지 않은 경로가 생긴다
- **0을 실패로 다룬다.** "검사 대상이 없었다"는 통과가 아니다
- 감사할 때 **0을 세라.** 무엇이 실패하는지보다 무엇도 실패하지 않는 곳이 위험하다

---

## 8. 격리와 반영을 별개의 행위로 뒀다 — [실행 검증]

### 문제

리뷰 `ACCEPTED`가 곧바로 워크스페이스 반영이면, **결정과 변경이 한 행위로 붙는다.** 그러면 격리는 "안전하지만 되돌릴 수 없는" 상태가 된다.

### 해법

에이전트는 `git worktree`에서 일하고, 그 트리는 Run이 끝나면 폐기된다. 반영은 **별도 명령이며 원장에 기록되는 사람의 행위**다.

```ts
// src/apply.ts:1-9
// This is the one part of the model the design does not regulate, and the
// choice made here is explicit application: `codefleet apply <run-id>`, a human
// action recorded in the ledger. The alternative — an ACCEPTED review applying
// automatically — collapses the review decision and the workspace change into
// one act.
```

트리가 사라진 뒤 반영이 가능한 이유는 **패치가 증거로 보존**되기 때문이다. 그래서 `apply`는 관측된 diff를 적용하지, 그동안 변했을지 모르는 디렉터리를 복사하지 않는다. 적용 전 `git apply --check`가 충돌을 잡고, 실패하면 **부분 적용 대신 거부**한다.

### 검증

fixture에서 트리는 디스크와 `git worktree list` 양쪽에서 사라졌고, 그 뒤 `apply`가 워크스페이스를 바꿨다. **적용된 변경이 Harness가 관측한 패치와 바이트 단위로 같았고**, 원장의 `patchRef.hash`를 재계산해 일치를 확인했다.

### 가져갈 것

- **결정과 부수효과를 분리한다.** "승인하면 자동 반영"은 승인의 의미를 바꾼다
- 반영 대상은 **관측된 산출물**이지 작업 디렉터리가 아니다. 디렉터리는 그새 변한다
- 적용 전 검사와 **부분 적용 금지**를 같이 둔다. 절반 쓰고 오류를 보고하는 것이 최악이다

---

## 9. 자식 프로세스에 경계를 세웠다 — [실행 검증, 대가 있음]

### 해법

모든 자식이 하나의 러너를 지나고, **환경은 기본 차단·명시 허용**이다.

```ts
// src/agent.ts:436-440
// An explicit environment rather than process.env. PATH is kept because
// resolving the adapter binary needs it; nothing else is passed unless
// the caller named it.
env: options.env ?? { PATH: process.env.PATH ?? "" }
```

자식 종류마다 **다른 상한**을 준다 — 에이전트 세션 30분, 검증 커맨드 10분, git 증거 수집 2분, 저장소 체크아웃 10분. 하나의 숫자로 묶으면 정상 실행을 자르거나 멈춘 실행을 방치한다(`agent.ts:290-322`).

절삭된 바이트 수를 **세서 함께 보고한다** — 잘린 로그와 그냥 끝난 로그가 같아 보이지 않게.

### 검증

부모에 `CODEFLEET_VERIFY_SECRET`을 export하고 Run을 돌리자 검증 자식이 그것을 읽지 못했다: `envSeenByVerificationChild: "absent"`.

### 대가 — 함께 기록한다

`HOME`/`USERPROFILE`이 없어져 홈에서 설정을 읽는 CLI가 `~`라는 이름의 디렉터리를 만들었다. git 자식에는 예외 목록이 이미 있는데(`gitProcessEnv()`) 어댑터·검증 자식은 그것을 쓰지 않는다. **해결 미확정.** `ENVIRONMENT.md` §4-2.

### 가져갈 것

- **환경은 allowlist로 준다.** 크리덴셜은 "안 넘기기로 했다"가 아니라 "넘길 수 없다"여야 한다
- 그러나 **allowlist에 무엇이 빠졌는지는 실행해봐야 안다.** 이 프로젝트는 git에는 홈이 필요하다고 판단했으면서 에이전트 CLI에는 같은 판단을 하지 않았다
- 상한은 **자식 종류별로** 나눈다

---

## 10. 사람이 읽는 문서를 산출물로 취급했다 — [부분 검증]

### 문제

JSON 증거가 아무리 정확해도, **사람이 읽는 것은 요약 문서 하나**다. 그 문서가 침묵하거나 거짓을 말하면 나머지는 읽히지 않는다.

### 해법

Run마다 `run-record.md`를 쓴다. 내보내기와 무관하게 항상 쓰고, 존재하는 아티팩트에서만 파생하며, **모르는 것을 모른다고 적는다** — `unavailableReason`을 전부 나열하고 `CAPABILITY_GAP`/`EVIDENCE_DEFECT`로 분류해 보여준다.

게이트 결과 아래에 **그 결과가 무엇에 근거하는지**를 커맨드 이름과 argv로 적는다.

```ts
// src/run-record.ts:268-271
// A gate result without the commands behind it reads as "tests passed". The
// first real run against a Spring Boot project produced SATISFIED from a
// single `gradle --version`, and this document — the only one a person
// reads — never said so. P1-35.
```

### 검증 상태

**[부분 검증].** 원칙은 옳았고 실제 사고가 그것을 증명했다 — `gradle --version`이 게이트를 만족시킨 것이 문서에 안 적혀 P1-35가 됐다.

**그러나 이 항목은 이 프로젝트가 끝내 실패한 자리다.** 고친 뒤에도 **리뷰를 마치면 그 절이 사라지고 거짓 문장으로 대체된다**(P1-50, 등급 P0, 미해소). 렌더러가 증거를 인자로 받는 구조라 호출부 하나가 안 넘기면 서술이 관측과 무관해진다.

### 가져갈 것

- **사람이 읽는 문서를 증거와 같은 등급으로 다룬다.** 부산물로 두면 가장 먼저 낡는다
- **렌더러가 증거를 인자로 받지 않게 한다.** 저장소에서 직접 읽게 하면 "안 넘긴 호출부"가 존재할 수 없다
- 부재 문구를 **"~하지 않았다"가 아니라 "~를 확인할 수 없다"**로 쓴다. 렌더러는 증거가 없는지 자기 인자가 없는지 구분하지 못한다
- **문서 본문을 단언하는 테스트를 필수로 한다.** 이 절의 실패가 정확히 그 부재에서 왔다(P1-60)

---

## 검증 상태 집계

| 상태 | 항목 |
| --- | --- |
| **[실행 검증]** | 1 권한 등급 · 2 뮤테이션 엔진 · 3 원장/replay · 4 승인 해시 · 6 갭 분류 · 7 scanScope · 8 격리·반영 분리 · 9 프로세스 경계 |
| **[코드만]** | 5 정책 meet 합성 |
| **[부분 검증]** | 10 사람이 읽는 문서 |

**"검증됨"은 대개 관측 1회다.** 파이프라인 완주는 한 번뿐이고 그것도 우회 4건 위에서였다. 반복·부하·다중 사용자·POSIX 검증은 하나도 없다.

---

## 결론

1. **주장과 관측을 타입으로 가르는 것**(1)과 **못 본 것을 두 종류로 가르는 것**(6)이 이 프로젝트에서 가장 값이 있었다. 둘 다 실행에서 작동했고, 둘 다 "모른다"를 데이터로 표현하는 문제였다.
2. **버릴 것이 분명한 것은 역할 표**(5)다 — 좁히는 원칙은 옳았고 축을 잘못 골랐다. 파일 편집 권한과 커맨드 실행 권한을 한 축에 매달아, 코드를 쓰면서 테스트를 돌리는 역할이 존재하지 않게 됐다.
3. **10번은 원칙이 옳았는데 구현이 두 번 실패했다.** 침묵(P1-35)을 고치자 거짓(P1-50)이 됐다. 이것이 `ARCHIVE.md` §3-2가 말하는 구조 문제의 가장 구체적인 형태다.

## 다음 작업

없음. 이 문서는 새 프로젝트의 입력이다.

## 미해소로 남긴 것

- **반복 검증이 없다.** 모든 [실행 검증]은 관측 1회이며, 같은 조건에서 다시 돌려본 적이 없다
- **5번(정책 meet)의 "넓히려는 시도 거부"는 실사용 관측이 없다.** 테스트만 있다
- **10번은 미해소 상태로 닫힌다.** P1-50이 현재 발현 중이다
- 여기 적은 패턴 중 **동시성·다중 사용자 환경에서 검증된 것은 하나도 없다.** 뮤테이션 락은 단일 호스트 단일 프로세스 전제다
