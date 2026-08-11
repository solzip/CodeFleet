# 2단계 — Harness 자신의 프로세스에 경계를 세운다 (P0-10 · P0-1 잔여 env · P0-6 잔여 상한)

```text
수정 일시   : 2026-08-11
대상 커밋   : 754acea73f15729a100e3102e0ff7c5b47869902 + 1단계·1b단계 수정(미커밋)
근거 문서   : docs/audits/2026-08-11/06-p0-6-limits.md
             docs/audits/2026-08-11/07-new-defects.md P0-10
             docs/audits/2026-08-11/01-p0-1-guardrails.md §C-1
             docs/audits/2026-08-11/fixes/stage1b-evidence-completeness.md
게이트      : fixes/stage2-precheck.md 2회차 — 3항목 전부 통과
범위        : P0-9, P0-11 추가 개선, P1-13/17/18 수정, scanScope 산출물
             표면화(4단계)는 범위 밖.
```

---

## 1. 설계 결정 (구현 전에 확정)

### 1-1. 인계 사항 1 — 호출 단위 타임아웃과 전체 예산

**문제.** 1b단계 이후 `captureGitDiff`는 `2 + N`번 git을 호출한다(추적 diff 1, `status` 1, 신규 파일마다 `--no-index` N). 호출 단위 타임아웃 `T`만 두면 최악의 총 시간은 `(2+N)·T`이고, `N`은 에이전트가 만드는 파일 수이므로 상한이 없다. **호출마다 유한한데 전체는 무한한 상태**가 된다.

**결정.** 호출 단위 타임아웃을 두되, 파일 수에 비례해 늘어나는 유일한 구간(`--no-index` 루프)에 **별도의 총 예산**을 건다.

| 축 | 값 | 근거 |
|---|---|---|
| 호출 단위 타임아웃 (증거 git) | 2분 | `git diff`/`status`/`rev-parse`는 정상 저장소에서 초 단위다. 2분은 병리적 상태를 끊기에 충분하고, 정상 실행을 자를 위험이 사실상 없다 |
| 호출 단위 타임아웃 (격리 git) | 10분 | `git worktree add`는 저장소 전체를 체크아웃한다. 대형 저장소에서 분 단위가 정상이므로 증거 호출과 같은 값을 쓸 수 없다 |
| 호출 단위 타임아웃 (검증 커맨드) | 10분 | 테스트 스위트가 대상이다. 어댑터의 30분은 과하고, 1분은 정상 스위트를 자른다 |
| **신규 파일 수집 총 예산** | **60초** | 위 세 개와 다른 축이다. 개별 호출이 아무리 빨라도 파일이 1만 개면 총합이 무너진다 |

예산 소진 시 남은 파일은 **호출하지 않고** `notCaptured`에 사유와 함께 남긴다. 즉 예산은 실패가 아니라 **알려진 제외**이고, 1-2의 규칙에 따라 `CAPABILITY_GAP` 쪽으로 간다.

**대안을 버린 이유.** "전체 예산만 두고 호출 단위는 두지 않는다"는 안 된다 — 단일 호출이 영원히 매달리면 예산을 재는 코드조차 돌지 못한다. 예산은 호출과 호출 **사이**에서만 검사할 수 있으므로, 호출 단위 상한이 전제다. 둘은 대체재가 아니라 순서가 있는 한 쌍이다.

### 1-2. 인계 사항 2 — 두 표면화가 겹칠 때의 규칙

**원칙: 사전에 알고 제외한 것과, 수집을 시도했으나 잘린 것은 다른 사실이다.**

| 상황 | 무엇을 아는가 | 분류 | waiver |
|---|---|---|---|
| 크기 상한 초과 | 파일 크기를 **미리** 재고 호출하지 않았다. 무엇을 뺐는지 정확히 안다 | `NEW_FILE_CONTENT_NOT_CAPTURED` → CAPABILITY_GAP | 가능 |
| 총 예산 소진 | 남은 파일 목록을 안다. 호출하지 않았다 | 같음 | 가능 |
| 바이너리 | git이 이름을 내고 바이트를 내지 않는다. git의 설계된 동작이고 무엇이 빠졌는지 안다 | 같음 | 가능 |
| **출력 상한에 잘림** | 호출은 했고 답이 왔는데 **그 답이 온전한지 모른다.** 무엇을 잃었는지 모른다 | `EVIDENCE_TRUNCATED:<what>` → **EVIDENCE_DEFECT** | **불가** |

한 파일에 둘 다 해당하면 **잘림이 이긴다.** "모르는 것"이 "빼기로 한 것"보다 무겁기 때문이다. 사람이 대신 확인해 줄 수 있는 것은 전자뿐이다 — 크기 초과 파일은 열어보면 되지만, 잘린 diff는 무엇이 잘렸는지 알아야 확인할 수 있고 그것을 모르는 상태가 바로 이 결함이다.

**적용 범위.** `EVIDENCE_TRUNCATED`는 **증거를 생산하는 git 호출**에만 붙인다: `git diff`(추적), `git status`(changed files / untracked 목록), `--no-index`(신규 파일 내용), 워크스페이스 스냅샷의 `rev-parse`/`status`/`diff`.

**검증 커맨드의 출력 잘림은 여기에 넣지 않는다.** 검증 판정은 **exit code**에서 나오고(`run.ts`의 `result: code === 0 ? "PASS" : "FAIL"`) 로그에서 나오지 않는다. 로그가 잘려도 게이트 결과는 정확하다. 그래서 `VERIFICATION_OUTPUT_TRUNCATED`(CAPABILITY_GAP)로 별도 표면화한다 — 보이되, 테스트가 5 MiB를 뱉었다는 이유로 해제 불가 차단을 만들지 않는다.

**타임아웃은 별도 축이다.** 시간 초과한 검증 커맨드는 비-0/null exit이 되어 그 attempt가 `FAIL`이 되고 게이트가 `NOT_SATISFIED`로 간다 — 이미 fail-closed다. 여기에 더해 attempt에 사유를 남겨 왜 실패했는지 읽을 수 있게 한다.

### 1-3. env 경계

| 대상 | 전달 변수 | 근거 |
|---|---|---|
| 어댑터 | `{ PATH }` (기존) | 1단계 이전부터 |
| 검증 커맨드 | `{ PATH }` | 지시된 기본값 |
| git 호출 (증거·격리) | `PATH` + OS 필수 + 홈 경로 + 명시된 `GIT_*` 목록 | 아래 |

git에 목록을 더 주는 이유를 적어 둔다. 이 경계의 목적은 **자격증명**(`AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `DATABASE_URL`)이 자식에게 가지 않게 하는 것이지, git의 설정 해석을 망가뜨리는 것이 아니다. `HOME`/`USERPROFILE`을 끊으면 사용자의 `.gitconfig`(예: `core.autocrlf`)가 무시되어 **diff 내용 자체가 달라진다.** 증거를 보호하려다 증거를 바꾸게 된다. 그래서 홈 경로는 통과시키고, 값이 곧 비밀인 변수는 통과시키지 않는다. 목록은 이름 기준 allowlist이며 부모에 실제로 있는 것만 넘어간다.

### 1-4. 불린 기본값

1b단계에서 `holderAlive`를 `false`로 초기화해 "모름"을 "안전"으로 읽은 실수를 했다. 이번 슬라이스의 새 불린은 전부 모르는 쪽으로 둔다:

- `timedOut`은 타임아웃이 **확인됐을 때만** `true`. 기본은 `false`지만 이 값은 "시간 초과가 관측됨"이라는 적극적 사실이므로 부재가 안전으로 해석되지 않는다.
- 잘림 판정은 `truncatedBytes > 0`이라는 **측정값**에서만 나온다. 측정하지 못하는 경로를 만들지 않았다 — 모든 호출이 `runCommand`를 지나고 `runCommand`는 항상 `scanScope`를 채운다.

---

## 2. 수정 전 실패 출력

세 테스트를 먼저 작성했다. 구현 후 통과를 확인한 뒤, `runProcess`를 수정 전의 무경계 형태(직접 `spawn`, limits 없음, env 없음)로 되돌려 실패를 재현했다. 되돌린 것은 이 함수 하나이고, 확인 후 원상복구했다.

### 2-1. 타임아웃 — 실패가 아니라 **정지**로 나타난다

```
$ node --test --test-reporter=spec test/process-boundaries.test.ts
runProcess reverted to the unbounded pre-fix form
(no output; killed at 300 s)
```

수정 전 코드에서는 이 테스트가 실패하지 않는다. **끝나지 않는다.** 300초 타임아웃으로 강제 종료할 때까지 출력이 한 줄도 나오지 않았고, 종료 후 프로세스 목록에 자식이 그대로 남아 있었다:

```
ProcessId : 39476
Cmd       : <node> forever.mjs
```

이것이 P0-6이 말한 그대로다 — `codefleet run`이 무한 정지하고 사용자에게 남는 수단은 Ctrl-C뿐이다. 남은 자식은 손으로 정리했다.

### 2-2. env와 출력 상한 — 나머지 두 건

정지하지 않는 두 건만 골라 같은 되돌린 코드에서 실행했다.

```
✖ a verification command cannot read the parent's environment (659.2872ms)
✖ a verification command's runaway output is capped and the dropped bytes are counted (725.3635ms)
ℹ tests 2
ℹ pass 0
ℹ fail 2

✖ a verification command cannot read the parent's environment
  AssertionError: a boundary the adapter has and the Harness's own children do not is not a boundary
  + actual - expected
  + 'verification-child-should-not-see-this'
  - 'absent'
      at TestContext.<anonymous> (.../test/process-boundaries.test.ts:163:12)

✖ a verification command's runaway output is capped and the dropped bytes are counted
  AssertionError: stdout must be capped, got 4199304
      at TestContext.<anonymous> (.../test/process-boundaries.test.ts:198:10)
```

첫 번째는 01번 문서 §C-1의 재현을 그대로 옮긴 것이고, 값까지 동일하다.

---

## 3. 통과 지점별 위임 여부

재감사가 P0-10에서 지목한 통과 지점 전수다. **전부 위임했다.**

| 통과 지점 | 이전 | 현재 | 타임아웃 | 출력 상한 | env |
|---|---|---|---|---|---|
| 검증 커맨드 | `run.ts` 직접 `spawn` | `runProcess` → `runCommand` (`run.ts:1388`) | 10분 | 4 MiB | `{ PATH }` |
| `git diff` (추적 변경) | 직접 `spawn` | `runGitEvidence` (`run.ts:2095`) | 2분 | 32 MiB | git allowlist |
| `git status` (changed files) | 직접 `spawn` | `runGitEvidence` (`run.ts:2223`) | 2분 | 32 MiB | git allowlist |
| `git status` (untracked 목록) | 직접 `spawn` | `runGitEvidence` (`run.ts:2178`) | 2분 | 32 MiB | git allowlist |
| `git diff --no-index` (신규 파일, 1b단계 도입) | 직접 `spawn` | `runGitEvidence` (`run.ts:2253`) | 2분 + 60초 총예산 | 32 MiB | git allowlist |
| workspace-snapshot의 git (`rev-parse` / `status` / `diff`) | 호출자가 넘긴 무경계 `runProcess` | `runGitEvidenceProcess` 주입 (`run.ts:736`, `run.ts:775`) | 2분 | 32 MiB | git allowlist |
| `git worktree add` / `remove` | `isolation.ts` 직접 `spawn` | `runCommand` (`isolation.ts:61`) | 10분 | 4 MiB | git allowlist |
| `git rev-parse --git-dir` / `--show-prefix` | 같음 | 같음 | 10분 | 4 MiB | git allowlist |
| 어댑터 | 이미 위임됨 | 변경 없음 | 30분 | 16 MiB | `{ PATH }` |

**검증 방법 — `src/` 전체에서 `spawn(` 호출이 몇 개인가:**

```
$ grep -rn "spawn(" src/ | grep -v spawnSync
src/agent.ts:252:    const child = spawn(command, args, {
```

**하나다.** 프로세스를 시작하는 경로가 `runCommand` 하나로 모였으므로, 새로운 종류의 자식이 경계 없이 생기려면 그 함수를 우회해야 하고 그것은 grep 한 번에 보인다.

### 3-1. 잘림의 표면화

| 호출 | 잘렸을 때 | 분류 |
|---|---|---|
| `git diff` (추적) | `changes.unavailableReason = EVIDENCE_TRUNCATED:GIT_DIFF` | EVIDENCE_DEFECT |
| `git status` (changed files) | `EVIDENCE_TRUNCATED:GIT_STATUS` | EVIDENCE_DEFECT |
| `git status` (untracked 목록) | 목록을 `null`로 내려 "생성 여부 불명"으로 보고 | CAPABILITY_GAP |
| `--no-index` (신규 파일) | `EVIDENCE_TRUNCATED:GIT_DIFF_NEW_FILE` — 같은 파일의 크기·바이너리 제외보다 우선 | EVIDENCE_DEFECT |
| 스냅샷 git | 섹션별 `unavailableReason` → `snapshotGaps` | 기존 경로 |
| 검증 커맨드 | `VERIFICATION_OUTPUT_TRUNCATED` | CAPABILITY_GAP |

`EVIDENCE_TRUNCATED`를 `EVIDENCE_DEFECT_PREFIXES`에 추가했다(`src/review.ts:48`, `src/run-record.ts:21` — 두 곳에 사본이 있어 함께 고쳤다).

**최악의 회귀를 직접 막았는지 실측했다.** 상한을 넘는 diff를 만드는 Run을 실제로 돌리고 리뷰까지 진행하는 테스트를 추가했다("a Run whose diff was cut off cannot be accepted, even with the reason waived"):

- `changes.unavailableReason === "EVIDENCE_TRUNCATED:GIT_DIFF"`
- Run Summary와 리뷰 번들에 도달, `bundle.scanScope.evidenceDefects >= 1`
- **`waivedGaps`에 그 사유를 넣어도** `evidence defect cannot be waived: EVIDENCE_TRUNCATED:GIT_DIFF`로 ACCEPTED가 거부된다

이 테스트는 19 MB 파일을 만들고 고쳐서 32 MiB 상한을 넘긴다. 13초가 걸리지만, 이 슬라이스가 만들 수 있는 최악의 결과를 막는 유일한 종단 증거이므로 비용을 받아들였다.

---

## 4. 새로 발견한 것 — 등재만

### P1-19. 검증 커맨드의 env가 `PATH`뿐이라 실제 빌드 도구가 실패할 수 있다

**발생 조건**: `verification.commands`가 `PATH` 외의 환경변수를 필요로 하는 도구를 부를 때. `mvn`(`JAVA_HOME`), `npm`/`node`(`HOME`·`APPDATA` 기반 캐시), Windows의 여러 런타임(`SystemRoot`)이 해당한다.

**근거**: 지시된 기본값이 `{ PATH }`이고 그대로 구현했다(`src/run.ts:1388`의 `runProcess` 호출에 `env` 미지정 → 기본 `{ PATH }`). git 호출에는 allowlist를 줬지만 검증 커맨드에는 주지 않았다.

**성격**: fail-closed다. 도구가 뜨지 않으면 비-0 exit → attempt `FAIL` → 게이트 `NOT_SATISFIED`. 잘못된 수락으로 이어지지 않고 Run이 실패한다. 다만 사용자에게는 "로컬에서 되는 명령이 CodeFleet 안에서만 실패한다"로 보인다.

**해법의 방향**: P1-13(프로파일에서 limits를 읽기)과 같은 자리에 검증 커맨드용 env allowlist를 둔다. 두 개가 같은 설정 블록에 속하므로 함께 다루는 것이 맞다. **이번 슬라이스에서는 고치지 않았다.**

---

## 5. 변경 파일

```
 src/agent.ts           |  69 ++++++
 src/isolation.ts       | 145 ++++++++++---
 src/review.ts          |   9 +-
 src/run-record.ts      |  49 ++++-
 src/run.ts             | 538 ++++++++++++++++++++++++++++++++++++++++-------
 test/isolation.test.ts | 559 ++++++++++++++++++++++++++++++++++++++++++++++++-
 6 files changed, 1260 insertions(+), 109 deletions(-)
 test/process-boundaries.test.ts (신규, 미추적)
```

위 수치는 1단계 + 1b단계 + 2단계 누적이다(세 슬라이스 모두 미커밋). 2단계에서만 바뀐 것:

| 파일 | 2단계 변경 |
|---|---|
| `src/agent.ts` | 프로세스 상한 6종을 한 블록에 모아 export. `gitProcessEnv()` 신설 (OS 필수 · 홈 경로 · `GIT_*` 이름 allowlist) |
| `src/run.ts` | `runProcess`가 `runCommand`에 위임하고 `HarnessProcessResult`(truncatedBytes·timedOut·적용된 상한)를 반환. `runGitEvidence` / `runGitEvidenceProcess` 신설. 증거 git 5개 지점 전환. 스냅샷에 경계 있는 러너 주입. 검증 커맨드에 전용 상한과 `{PATH}`. `--no-index` 루프에 60초 예산. 잘림·타임아웃의 `unavailableReason` 표면화와 attempt `scanScope`. 미사용 `spawn` import 제거 |
| `src/isolation.ts` | `run()`이 `runCommand`에 위임(격리 상한 + git env). `spawn` import 제거 |
| `src/review.ts`, `src/run-record.ts` | `EVIDENCE_DEFECT_PREFIXES`에 `EVIDENCE_TRUNCATED` 추가 |
| `test/process-boundaries.test.ts` | 신규 8건 |

**테스트 결과**: 212 tests, 212 pass, 0 fail (착수 전 204 + 신규 8). 임시 트리 누수 0(전량 삭제 후 `npm test` 1회 전후 0 → 0). coverage 63.3%로 전후 동일 — FINAL RULE 조건을 새로 덮지 않으므로 클레임을 추가하지 않았다.

### 줄바꿈

`src/isolation.ts`, `src/run-record.ts`, `test/isolation.test.ts`는 편집 과정에서 작업 트리 기준 LF가 됐고 `src/run.ts`, `src/agent.ts`, `src/review.ts`는 CRLF로 남아 있다. **파일 안에서 섞인 것은 없다**(각 파일은 전부 LF이거나 전부 CRLF). `.gitattributes`가 인덱스에서 LF로 정규화하므로 커밋 결과는 동일하다.

---

## 6. 2단계가 닫지 않은 것

| 항목 | 상태 |
|---|---|
| P0-9 큐 게이트 fail-open | 그대로 (범위 밖) |
| P1-13 프로파일 연동 | 그대로. 상한은 상수이나 `src/agent.ts` 한 블록에 모였으므로 연동은 그 블록을 읽는 작업이 된다 |
| P1-17 SIGKILL 에스컬레이션 | 그대로 (범위 밖). `runCommand`가 SIGTERM 1회만 보내는 것은 변하지 않았고, 이제 **모든** 자식이 그 한계를 공유한다 — POSIX에서 SIGTERM을 무시하는 git이나 테스트 러너는 여전히 살아남는다 |
| P1-18 하위 디렉터리 경로 기준 | 그대로 (범위 밖) |
| P1-19 검증 커맨드 env | 이번에 등재, 고치지 않음 |
| scanScope 산출물 표면화 | 4단계. 어댑터의 `scanScope`는 여전히 `adapter-result.json`에 실리지 않는다. 다만 **검증 커맨드**의 잘림은 이번에 attempt와 리뷰 번들까지 올라간다 |
