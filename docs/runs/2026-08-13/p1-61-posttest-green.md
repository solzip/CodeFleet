# P1-61 — posttest 커버리지 체커 실패 복구

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 13:10 (KST) |
| 대상 커밋 해시 | `f215fac` (작업 시작 시점) |
| 작업 유형 | **수정** (유입 시점 특정 → 원인 규명 → 수정 → 재발 방지 제안) |
| 선행 문서 | `docs/runs/2026-08-13/p1-53-contract-delivery.md` (P1-61 등재) |
| 번호 실측 최대값 | **P0-16 / P1-61** (`grep -rhoE "P[01]-[0-9]+" docs/ src/ test/`) |

---

## 작업 1 — 언제부터인가

### 최초 실패 커밋: `3db7d64` (S4, 2026-08-12)

git worktree로 해당 커밋과 그 부모를 각각 체크아웃해 `npm test`를 실제로 돌렸다.

| 커밋 | 내용 | posttest |
| --- | --- | --- |
| `38cf9c9` | S3: make the Objective relation a real half of execution permission | **초록** — 실패 줄 없음 |
| **`3db7d64`** | **S4: make the adapter a Run Option instead of a workspace default** | **빨강** — `rule coverage check failed: - RUN_PLAN_AGENT_ADAPTER_RESOLUTION: claimed condition is not in the rule: "selectionSource"` |

유입 경로도 일치한다. 문제의 주장을 추가한 커밋을 `git log -S`로 특정했다:

```
$ git log --oneline -S 'coversRule(RESOLUTION, "selectionSource"' -- test/adapter-resolution.test.ts
3db7d64 S4: make the adapter a Run Option instead of a workspace default
```

**S4부터 `f215fac`까지 9개 커밋 동안 `npm test`가 빨간 상태였다.**

### 영향받은 판정 목록

`3db7d64` 이후에 작성됐고 `npm test` 결과를 근거로 쓴 문서·커밋이다.

| # | 문서 / 커밋 | 인용 | 무엇을 근거로 삼았나 |
| --- | --- | --- | --- |
| 1 | `audits/2026-08-12/13-system-review.md:17` | `\| 테스트 \| 220 통과 / 0 실패 \| **250 통과 / 0 실패** \| npm test \|` | 로드맵 S1~S6 **체크 항목 30개 전부 완료** 판정의 근거표 |
| 2 | `audits/2026-08-12/15-new-module-review.md:179` | `\| 테스트 \| 251 통과 / 0 실패 \| **252 통과 / 0 실패** \|` | 신규 모듈 3개 리뷰 후 상태 |
| 3 | `audits/2026-08-12/14-guard-defence-audit.md:28` | "게이트마다 조건문을 `if (false && ...)` 로 바꾸거나 함수를 무력화하고 `npm test`를 …" | **감사 방법론 자체**가 `npm test` 결과를 신호로 쓴다 |
| 4 | `audits/2026-08-12/12-orchestration-roadmap.md` | `- [x] **S4-4** — 회귀 테스트` / `- [x] **S5-3** — 회귀 테스트 (test/apply.test.ts 5건)` 등 | S4 이후 슬라이스의 완료 표시 |
| 5 | 커밋 `c325dec` 메시지 | `suite 250 passing, 0 failures` | S7 전체 검토 완료 |
| 6 | `runs/2026-08-13/p1-53-contract-delivery.md` | `255 tests, 255 pass` | P1-53 [해소] 판정 |

### 이 목록을 어떻게 읽어야 하는가

**보고된 숫자 자체는 전부 사실이다.** 테스트는 실제로 전건 통과했고, 250·251·252·255 어느 값도 틀리지 않았다. 빠진 것은 **커맨드가 0이 아닌 코드로 끝난다**는 사실이다.

따라서 이 판정들이 자동으로 무효는 아니다. 다만 `CONVENTIONS.md` §10이 [해소]에 요구하는 근거는 "테스트가 통과한다"가 아니라 **"테스트 커맨드가 통과한다"**이고, 그 근거는 위 6건에서 성립하지 않았다.

**6번은 예외다.** 해당 문서는 posttest 실패를 본문에 명시하고 P1-61로 등재한 뒤 [해소]를 내렸으므로, 근거의 한계를 알고 있었다.

재판정은 이번 범위 밖이다(지시). 목록만 남긴다.

---

## 작업 2 — 원인 규명

### 판정: **메타데이터 불일치. 코드는 조건을 만족한다.**

근거 없이 단정하지 않기 위해 네 가지를 각각 확인했다.

#### (a) 커버리지 체커가 검사하는 것

```js
// scripts/check-rule-coverage.mjs:33-37
if (!rule.conditions.includes(claim.conditionQuote)) {
  // A quote that is not in the rule means the test is checking something
  // else, or the rule changed underneath it. Either way the claim is wrong.
  errors.push(`${claim.ruleId}: claimed condition is not in the rule: ...`);
```

`Array.includes` — **조건 줄 전체와의 완전 일치**다. 부분 문자열 매칭이 아니다.

#### (b) 규칙이 따라오지 못한 것인가 — 아니다

규칙은 처음부터 그 조건을 갖고 있었다.

```
$ git log --oneline -S "RunPlan.adapterResolution records selectionSource" -- docs/concept-foundation.md
788524d docs: define agent adapter selection model      (2026-06-02)
```

`3db7d64` 시점의 규칙 본문을 직접 꺼내 확인했다:

```
condition:
- selectedAgentAdapter is concrete
- selectedAgentAdapter is in policies.agentAdapters.allowedAdapters
- selectedAgentAdapter is available in the local adapter registry
- RunPlan.adapterResolution records selectionSource, policyAllowed, locallyAvailable, and evidence references   ← 있다
- Run Planning does not modify Project Profile, Local Overlay, or Task Revision while selecting an adapter
```

> 조사 도중 `grep -A 22`로 이 블록을 읽어 뒷줄이 잘렸고, 한때 "규칙에 그 줄이 없었다"고 읽었다. `awk`로 블록 전체를 꺼내 바로잡았다. **규칙은 6월 이후 바뀐 적이 없다.**

#### (c) 주장이 틀린 것이다

```ts
// test/adapter-resolution.test.ts:375 (수정 전)
coversRule(RESOLUTION, "selectionSource", "test/adapter-resolution.test.ts");
```

두 가지가 잘못돼 있었다.

1. `"selectionSource"`는 조건 줄이 아니라 **조건 줄 안의 단어 하나**다. 완전 일치에 걸릴 수 없다.
2. `coversRule(ruleId, conditionQuote)`는 **인자가 2개**인데(`test/rule-coverage.ts:22`) 3개를 넘긴다. 세 번째는 조용히 버려진다.

#### (d) 조건을 소비하는 코드가 실제로 있는가 — 있다

`src/run.ts:808-820`이 Run Plan에 네 필드를 전부 기록한다:

```ts
adapterResolution: {
  selectionSource: adapterResolution.selectionSource,
  policyAllowed: adapterResolution.policyAllowed,
  locallyAvailable: adapterResolution.locallyAvailable,
  evidence: { allowedAdaptersRef: ..., localRegistry: ... },
  scanScope: { ... }
}
```

그리고 **그 조건은 이미 제대로 주장돼 있었다.** 같은 파일의 다른 테스트가 `run-plan.json`을 읽어 네 필드를 각각 단언한 뒤 조건 줄을 그대로 인용한다:

```ts
// test/adapter-resolution.test.ts:241-255
const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8"));
const recorded = plan.adapterResolution;
assert.equal(recorded.selectionSource, "PROFILE_DEFAULT");
assert.equal(recorded.policyAllowed, true);
assert.equal(recorded.locallyAvailable, true);
assert.ok(recorded.evidence.allowedAdaptersRef);
...
coversRule(RESOLUTION,
  "RunPlan.adapterResolution records selectionSource, policyAllowed, locallyAvailable, and evidence references");
```

**결론**: 375행의 주장은 **중복이자 오작성**이었다. 조건은 구현돼 있고, 검증돼 있고, 이미 인용돼 있었다. 실패는 실제 결함이 아니라 주장 문구 하나를 가리켰다.

---

## 작업 3 — 수정

375행의 주장을 제거했다. 이유를 주석으로 남겼다.

```ts
  // No coverage claim here on purpose. This test checks the allowlist refusal,
  // and that condition is already claimed above by the test that reads the
  // Run Plan. A claim quoting "selectionSource" stood here and quoted no
  // condition line at all — the checker rejected it and npm test exited
  // non-zero from S4 (3db7d64) until it was removed. P1-61.
```

**실패 테스트를 새로 쓰지 않은 이유**: 코드가 틀린 것이 아니므로 재현할 제품 결함이 없다. 그리고 체커가 이 실패 모드를 잡는다는 것은 이미 검증돼 있다 — `test/rule-coverage.test.ts`가 체커의 실패 모드를 재현하며, 이번 실패 자체가 **체커가 정상 작동한 증거**다. 체커는 9개 커밋 동안 정확한 사실을 계속 보고하고 있었다.

### 수정 전후 측정

| 항목 | 수정 전 | 수정 후 |
| --- | --- | --- |
| tests | 255 pass / 0 fail | 255 pass / 0 fail |
| claims recorded | 353 | **352** |
| conditions covered | 345 (63.3%) | **345 (63.3%) — 불변** |
| `npm test` 종료 코드 | 1 | **0** |

**커버리지가 변하지 않았다.** 제거한 주장이 아무 조건도 덮고 있지 않았음을 수치가 확인한다.

---

## 검증 — `npm test` 출력 마지막 부분

```
ℹ suites 0
ℹ pass 255
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 23058.9096

> codefleet@0.1.0 posttest
> node ./scripts/check-rule-coverage.mjs


=== FINAL RULE coverage by condition line ===
  rules                  83
  condition lines        545
  claims recorded        352
  conditions covered     345  (63.3%)
  rules touched at all   75 of 83
  rules fully covered    28 of 83
  rules with no claim    8

  Why the unclaimed rules are unclaimed:
    IMPLEMENTED_UNTESTED   5
    NOT_CODE_VERIFIABLE    3

  A claim means a passing test quoted that condition. It does not
  mean the condition is correctly implemented.
```

종료 코드를 실측했다. 파이프를 거치면 `$?`가 `tail`의 것이 되므로 출력을 버리고 측정했다:

```
$ npm test > /dev/null 2>&1; echo "exit=$?"
exit=0
```

---

## 작업 4 — 재발 방지 (제안만, 구현하지 않음)

### 현재 상태 — 실측

| 확인 | 결과 |
| --- | --- |
| CI 설정 | **없다.** `.github/` 디렉터리 부재, 저장소 루트에 워크플로 YAML 0건 |
| git hook | **없다.** `.git/hooks/`에 `.sample` 외 파일 0건 |
| 체커의 종료 코드 | **정상.** `scripts/check-rule-coverage.mjs:243`이 `process.exit(1)` |
| 실패 시 npm 종료 코드 | **1.** 실패 상태를 재현해 실측(`.rule-coverage/`에 임시 주장을 넣고 체커 단독 실행, 이후 제거) |

**기제는 처음부터 정상이었다.** 체커는 실패를 정확히 보고했고 종료 코드도 옳았다. 아무도 그것을 강제로 읽게 되지 않았을 뿐이다.

### 왜 9개 커밋 동안 보이지 않았나

1. **CI가 없다.** 실패한 종료 코드를 읽는 자동 소비자가 하나도 없다.
2. **성공처럼 보이는 보고서가 실패 줄 앞에 온다.** `ℹ pass 255 / ℹ fail 0` → 커버리지 표 → 백분율 순서로 15줄이 지나간 뒤에야 `rule coverage check failed:`가 나온다. 숫자를 확인하러 스크롤한 사람은 이미 초록을 봤다.
3. **테스트 러너의 요약과 체커의 판정이 같은 스트림에 섞인다.** "255 pass"는 참이고, 그것을 인용한 문서 5건은 거짓을 적지 않았다.

### 최소 변경 제안 (구현하지 않음)

| 우선 | 제안 | 왜 최소인가 |
| --- | --- | --- |
| 1 | **CI 워크플로 1개** — push/PR에서 `npm test`. Node 24 필요 | 파일 하나. 종료 코드를 읽는 소비자를 만드는 것이 근본이고, 나머지는 전부 사람의 주의력에 의존한다 |
| 2 | 체커가 실패할 때 **커버리지 표를 출력하지 않거나**, 실패 배너를 표 **앞**에 한 번 더 찍는다 | `check-rule-coverage.mjs` 안 출력 순서 조정. 성공 모양의 보고서가 실패를 감싸는 문제를 없앤다 |
| 3 | 문서 규약에 "**테스트 근거는 커맨드 종료 코드로 적는다**"를 추가 | `CONVENTIONS.md` 한 줄. "255 pass"가 아니라 "`npm test` exit=0"으로 적게 하면, 이번 6건 같은 인용이 애초에 불가능해진다 |

3번은 이번 사건이 정확히 그 형태다 — 통과 건수는 참인데 커맨드는 실패였다. 다만 지시대로 제안에 그치고 규약을 고치지 않았다.

---

## 결론

1. 최초 실패 커밋은 **`3db7d64`(S4, 2026-08-12)**이고, 부모 `38cf9c9`가 초록임을 worktree 체크아웃으로 실측 확인했다. 9개 커밋 동안 `npm test`가 빨간 상태였다.
2. 원인은 **메타데이터 불일치**다 — 주장이 조건 줄이 아닌 단어 하나를 인용했고(인자도 2개짜리에 3개를 넘겼다), 규칙과 코드는 처음부터 맞았다. 같은 조건은 이미 다른 테스트가 제대로 주장하고 있었다.
3. 해당 주장을 제거해 **`npm test` exit=0**을 확인했다. 커버리지는 345/545(63.3%)로 **불변**이다.

## 다음 작업

- **CI 워크플로 추가** — 작업 4 제안 1번. 이번엔 구현하지 않았다
- 작업 1의 영향받은 판정 6건 재판정 — 이번 범위 밖
- P1-50(P0 등급) — `run-record.md`의 거짓 문장은 그대로다

## 미해소로 남긴 것

- **재발 방지는 제안만 하고 하나도 구현하지 않았다**(지시). CI 부재·출력 순서·규약 문구 3건 모두 열려 있다
- **영향받은 판정 6건은 재판정하지 않았다.** 숫자 자체는 참이었으므로 판정이 자동 무효는 아니지만, `CONVENTIONS.md` §10이 요구하는 근거는 성립하지 않은 상태다
- **P1-61 이전에도 posttest가 빨간 적이 있었는지는 미확인.** `38cf9c9`가 초록임은 확인했으나 그 이전 구간 전체는 조사하지 않았다
