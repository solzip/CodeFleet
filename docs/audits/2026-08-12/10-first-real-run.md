# 첫 실사용 시도 — Spring Boot 프로젝트에서 Run 한 바퀴

```text
실행 일시   : 2026-08-12
CodeFleet   : 9bbfcbf (main, 코드 변경 없음)
대상        : LottoMap_back — Spring Boot 4.0.6 / Gradle 9.4.1 / Java toolchain 21
              대상 커밋 ad8d09a (branch dev, origin/dev와 동기)
목적        : 수정이 아니라 "어디서 막히는가"의 전수 기록
판정        : **우회를 거쳐 완주** — 우회 5건, 그중 1건은 검증의 의미를 포기했다
```

---

## 0단계 — 대상 조사 (실행 전)

### 빌드 도구와 구조

| 항목 | 값 |
|---|---|
| 빌드 도구 | Gradle (wrapper 있음: `gradlew`, `gradlew.bat`, 9.4.1) |
| 모듈 | 단일 (`rootProject.name = 'LM_back'`) |
| Java | `build.gradle`의 toolchain **21** |
| 소스 | 3개 파일 (main 1, resources 1, test 1) |
| git | 저장소 O, HEAD `ad8d09a`, `dev` ↔ `origin/dev` 0/0 동기 |

### 작업 트리는 청결하지 않았다

```
 M .claude/settings.local.json      ← 기존 수정. 내 것이 아니며 건드리지 않았다
?? .codefleet/                      ← 2026-07-23 세션의 옛 Run 3개가 이미 존재
```

`.codefleet/`이 이 프로젝트의 `.gitignore`에 없다. 되돌릴 수 있는지 판단한 근거:

- 추적 파일은 `origin/dev`와 동기 → git으로 복구 가능
- `.claude/settings.local.json`은 **절대 건드리지 않는다**(Task scope를 `src/**`로 한정)
- `.codefleet/`은 실행 전 목록을 스냅샷으로 떠두고 **내가 추가한 것만** 지운다

이 조건에서 진행했다.

### 기준선 빌드 — **실패한다** (CodeFleet 없이)

```
$ ./gradlew test --console=plain --no-daemon

FAILURE: Build failed with an exception.
* What went wrong:
Could not determine the dependencies of task ':test'.
> Could not resolve all dependencies for configuration ':testRuntimeClasspath'.
   > Failed to calculate the value of task ':compileTestJava' property 'javaCompiler'.
      > Cannot find a Java installation on your machine (Windows 11 10.0 amd64) matching:
        {languageVersion=21, vendor=any vendor, ...}. Toolchain download repositories have not been configured.
BUILD FAILED in 32s
```

`compileJava`만 돌려도 같다(6초). 이 머신의 JDK는 **17(PATH)과 23.0.2(`JAVA_HOME`)** 뿐이고 **21이 없다.** toolchain 자동 다운로드도 설정돼 있지 않다.

**기준선이 빨갛다는 것이 이 실행의 가장 중요한 전제다.** 이것을 먼저 재지 않았다면 뒤에 나올 gradle 실패를 전부 CodeFleet 탓으로 오판했을 것이다.

### 경로 길이 (P1-31)

```
project path              : <home>/Desktop/<한글>/sol/app_doluck/LottoMap_back   (51자)
os.tmpdir()               : 30자
격리 트리 접두             : 71자
260자까지 여유             : 189자
저장소에서 가장 깊은 경로   : 71자  → 격리 트리 안에서 총 143자
```

**여유 안에 있다.** P1-31은 이 프로젝트에서 발현하지 않는다.

### 비ASCII 경로 — 첫 시험 대상

워크스페이스 절대 경로에 한글 4자가 있다 — 사용자 디렉터리명 2자와 상위 디렉터리명 2자다(경로는 마스킹했고 길이는 실측값이다). 저장소 **안**의 파일명에는 비ASCII가 없다.

| 검사 | 결과 |
|---|---|
| `git rev-parse --show-toplevel` | 한글 그대로 반환, 같은 디렉터리로 round-trip **성공** |
| `git status --porcelain` | exit 0, 경로 정상 |
| `core.quotepath` | unset(기본 true) — **발현하지 않음.** 저장소 상대 경로에 비ASCII가 없어 이스케이프 대상이 없다 |
| Node `readFile` | 성공 |
| Node `spawn` cwd round-trip | 한글 경로 그대로 반환, 일치 |
| 콘솔 코드페이지 | **949 (CP949)** — `chcp` 출력 자체가 UTF-8로 읽으면 깨진다 |

**중요한 구분**: 한글은 *절대 경로*에만 있고 *저장소 상대 경로*에는 없다. CodeFleet이 정책 판정에 쓰는 것은 상대 경로이므로 이번 실행은 `core.quotepath`를 시험하지 못했다. **저장소 안에 한글 파일명이 있는 프로젝트는 여전히 미검증이다.**

콘솔 코드페이지 949는 잠재 위험으로 남는다 — `runCommand`가 모든 자식 출력을 UTF-8로 디코딩하는데, 자식이 CP949를 내보내면 깨진다. 이번 gradle 출력은 전부 ASCII라 발현하지 않았다.

---

## 단계별 통과·실패

| # | 단계 | 결과 |
|---|---|---|
| 1 | `codefleet init` | 통과 |
| 2 | Task 작성·`task validate` | 통과 |
| 3 | `task approve` | 통과 |
| 4 | 제품 기본값으로 `run` | 통과 (DRY_RUN, 어댑터 미실행) |
| 5 | `COMMAND_EXEC`로 올림 | **차단 1** — 명령 채널 |
| 6 | `allowDegradedCommandObservation: true` | **차단 2** — 격리 |
| 7 | `isolationMode: GIT_WORKTREE` | **차단 3** — 어댑터가 실행을 거부 |
| 8 | `agentRole: INFRA_OPERATOR` | 통과 — worktree 생성, 에이전트 편집 성공 |
| 9 | 검증 `cmd /c gradlew.bat` | **차단 4** — `SHELL_INTERPRETER_DENIED` |
| 10 | 검증 `java … GradleWrapperMain test` | **실패 5** — gradle이 돌았으나 toolchain 21 없음(기준선과 동일) |
| 11 | 검증 `… --version` | 통과 — gate SATISFIED |
| 12 | `review --decision ACCEPTED` (waiver 없이) | 정상 거부 |
| 13 | `review` + waiver 2건 | 통과 — MIGRATION_READY_WAIVED |
| 14 | `objective create`/`attach`/`import-review` | 통과 |
| 15 | `objective status` | **`lottomap:add-greeting:4 WAITING/VERIFIED`** |

### 차단 1 — 명령 채널 (설계대로, 원인 명시)

```
Run Planning is blocked: this Run may execute commands, and no Harness-visible
command channel exists to observe them.
To run anyway, record the decision in .codefleet/config.json:
  "policies": { "harness": { "allowDegradedCommandObservation": true } }
```

바꿀 키와 값을 그대로 알려준다. **좋은 차단 메시지의 기준.**

### 차단 2 — 격리 (설계대로, 원인 명시)

```
Run Planning is blocked: this Run may edit files and policies.harness.requireIsolationForMutation
is true, but defaults.run.isolationMode is NONE.
Set isolationMode to GIT_WORKTREE, or set requireIsolationForMutation to false to accept
edits in the workspace itself.
```

두 선택지를 주고 각각의 의미를 말한다. 안전한 쪽(`GIT_WORKTREE`)을 골랐다.

### 차단 3 — **어댑터가 실행을 거부한다** (신규 결함)

```
stderr : Adapter refused to launch: AdapterRequest capabilities do not permit command execution.
adapterError : { code: LAUNCH_FAILED, ... }
run-plan.selectedAgentRole : { roleId: BACKEND_IMPLEMENTER, source: CORE, effectiveMode: WORKSPACE_EDIT }
capabilities : fileEdit=true / commandExecution=false
```

`codefleet init`이 기본으로 쓴 `agentRole: BACKEND_IMPLEMENTER`의 `defaultMaxMode`가 `WORKSPACE_EDIT`이다. `harnessMode: COMMAND_EXEC`로 올려도 meet 결과가 `WORKSPACE_EDIT`이라 `commandExecution=false`가 되고, **어댑터는 아예 뜨지 않는다.**

역할표 전수:

| 역할 | defaultMaxMode | 어댑터가 뜨는가 |
|---|---|---|
| BACKEND_IMPLEMENTER | WORKSPACE_EDIT | **아니오** |
| BACKEND_REVIEWER | SUGGEST_ONLY | 아니오 |
| BACKEND_REFACTORER | WORKSPACE_EDIT | **아니오** |
| INFRA_DEBUGGER | SUGGEST_ONLY | 아니오 |
| DOCS_WRITER | WORKSPACE_EDIT | **아니오** |
| INFRA_OPERATOR | COMMAND_EXEC | 예 |
| IAC_ENGINEER | COMMAND_EXEC | 예 |

**7개 중 5개 역할로는 어댑터가 실행되지 않는다.** 애플리케이션 코드를 쓰는 역할은 전부 그 5개에 속한다. → **P1-32**

차단 메시지도 앞의 두 개와 달리 **무엇을 바꿔야 하는지 말하지 않는다.** 어느 소스가 모드를 낮췄는지(role인지 guardrail인지 profile인지) 알려주지 않아, run-plan.json을 열어야 원인을 안다. → **P1-33**

### 차단 4 — Windows에서 wrapper를 부를 수 없다 (신규 결함)

```
blockedReason : SHELL_INTERPRETER_DENIED
command       : ["cmd","/c","gradlew.bat","test",...]
```

`cmd`가 셸 인터프리터 목록에 있어 거부된다. 2026-08-10이 "우회에 강하다"고 평가한 바로 그 규칙이고, 규칙 자체는 옳다.

그러나 Windows에서 `gradlew.bat`·`mvnw.cmd`는 **배치 파일이라 `cmd.exe` 없이는 실행할 수 없고**, `spawn`은 `shell:false`로 돈다. 결과적으로 **Windows에서 Gradle/Maven wrapper를 검증 커맨드로 쓸 방법이 없다.** POSIX에서는 `./gradlew`가 shebang 실행 파일이라 이 문제가 없다. → **P1-34 (win32 한정)**

### 실패 5 — gradle은 돌았고, 기준선과 같은 이유로 실패했다

```
verification stderr:
> Cannot find a Java installation on your machine (Windows 10 10.0 amd64) matching:
  {languageVersion=21, ...}. Toolchain download repositories have not been configured.
BUILD FAILED in 10s
exitCode 1 / result FAIL / gate NOT_SATISFIED
verification limits: measured=true, calls=1, outputBytes=1374, truncated=0, timeout 600000ms, cap 4194304B
```

**P1-19는 물지 않았다.** env가 `{PATH}`뿐이고 `JAVA_HOME`이 없는데도(에이전트가 `JAVA_HOME=(absent)`를 출력해 확인) gradle wrapper는 정상 기동했고, `~/.gradle` 캐시 없이도 10초에 끝났다. 실패 원인은 기준선과 **동일한 문장**이다.

한 가지 차이: 기준선은 `Windows 11`, CodeFleet 실행은 `Windows 10`으로 보고했다. env 때문이 아니라 **JVM이 달라서다** — 기준선은 `JAVA_HOME`의 JDK 23, CodeFleet 실행은 PATH의 JDK 17이고, 17은 Win11을 "Windows 10"으로 보고한다. env 스트리핑 탓으로 오판하지 않도록 적어 둔다.

**상한은 현실적이었다**: 10분/4 MiB 대비 실사용 10초/1,374 B. 다만 이 프로젝트는 의존성이 이미 캐시돼 있었고 소스가 3개다. 최초 빌드에서 의존성을 내려받는 경우는 검증되지 않았다.

---

## 우회 목록 — 무엇을 포기했는가

| # | 우회 | 왜 | 포기한 것 |
|---|---|---|---|
| 1 | `harnessMode: DRY_RUN → COMMAND_EXEC` | 기본값으로는 어댑터가 돌지 않는다 | 없음 (파이프라인을 돌리려면 필수) |
| 2 | `allowDegradedCommandObservation: false → true` | 차단 1의 지시 그대로 | **명령 증거.** 모든 Run이 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`을 달고 사람 리뷰를 요구한다 |
| 3 | `isolationMode: NONE → GIT_WORKTREE` | 차단 2의 첫 번째 선택지 | 없음. `requireIsolationForMutation: true`는 유지했다 |
| 4 | `agentRole: BACKEND_IMPLEMENTER → INFRA_OPERATOR` | 차단 3. COMMAND_EXEC를 허용하는 역할이 2개뿐 | **역할 분류의 의미.** 백엔드 구현 작업을 "인프라 운영자"로 기록했다. 역할이 걸어야 할 `deniedCommandCategories`도 다른 것이 적용된다 |
| 5 | 검증 커맨드 `gradle test → gradle --version` | 이 머신에 JDK 21이 없어 **어떤 gradle 태스크도 통과할 수 없다** | **검증의 의미 전부.** 게이트는 "빌드 도구에 도달 가능하다"만 확인했고 코드에 대해서는 아무것도 말하지 않는다 |

우회 5가 이 실행의 핵심 산출물이다. 이것 없이는 완주할 수 없었고, 이것을 하는 순간 `SATISFIED`는 코드에 대한 진술이 아니게 된다.

---

## run-record.md를 사람 눈으로 읽기

문서 자체는 잘 읽힌다. 격리 절이 "What changed" 앞에 있어 어느 트리의 이야기인지 먼저 알 수 있고, 상한 4주체가 한 표에 정리돼 있으며, 미확인 항목과 waiver 사유가 그대로 실려 있다.

**오도하는 지점 둘.**

### (1) 검증 커맨드를 한 번도 이름으로 적지 않는다

```
## What was verified
observedCheck          : PASS
verificationGateResult : SATISFIED
verificationAuthority  : HARNESS_EXECUTED
attempts               : 1 executed of 1 recorded, 0 blocked
```

이 절만 읽은 사람은 **"테스트가 통과했다"**로 읽는다. 실제로 돈 것은 `gradle --version`이다. 문서 전체에서 `gradle`·`--version`·`GradleWrapperMain` 문자열이 **0회** 등장한다(grep 확인).

무엇을 실행했는지 알려면 `verification/verify-001.json`을 따로 열어야 한다. **사람이 읽는 유일한 문서가 "무엇을 검증했는가"에 답하지 않는다.** → **P1-35**

### (2) 성공한 Run의 결과물이 존재하지 않는다

문서는 정직하게 적는다:

> The edits made there are **not applied to the workspace** … The tree was discarded when the Run finished, so those edits are gone.

그리고 실제로 그렇다:

```
$ grep -c greeting src/main/java/ys/back/lm_back/LottoMapBackApplication.java
0
$ ls src/test/java/ys/back/lm_back/
LottoMapBackApplicationTests.java        ← GreetingTest.java 없음
```

**원장은 `VERIFIED`인데 코드는 어디에도 없다.** 남은 것은 `git-diff.patch` 하나다. 이것은 P1-27(반영 경로 미설계)이 실사용에서 어떻게 보이는지의 실물이다 — 문서가 침묵하지 않는다는 점은 설계대로지만, **한 바퀴를 다 돌아도 저장소는 변하지 않는다.**

---

## 신규 등재 — P1-32 ~ P1-35

| ID | 내용 | 근거 |
|---|---|---|
| P1-32 | 7개 Core 역할 중 5개(`BACKEND_IMPLEMENTER`·`BACKEND_REFACTORER`·`DOCS_WRITER`·`BACKEND_REVIEWER`·`INFRA_DEBUGGER`)로는 어댑터가 실행되지 않는다. `init` 기본값이 그중 하나다 | 어댑터는 `commandExecution !== true`면 거부하는데, 5개 역할의 `defaultMaxMode`가 `WORKSPACE_EDIT` 이하다. 실측: 기본 프로파일 그대로 `LAUNCH_FAILED` |
| P1-33 | 어댑터 거부 메시지가 어느 소스가 모드를 낮췄는지, 무엇을 바꿔야 하는지 말하지 않는다 | 차단 1·2는 키와 값을 지목한다. 차단 3은 `run-plan.json`을 열어야 `roleId`를 알 수 있다 |
| P1-34 | win32에서 Gradle/Maven wrapper를 검증 커맨드로 쓸 수 없다 | `.bat`/`.cmd`는 `cmd.exe`가 필요하고 `cmd`는 `SHELL_INTERPRETER_DENIED`. `spawn`은 `shell:false`. POSIX는 shebang으로 직접 실행되므로 해당 없음 |
| P1-35 | `run-record.md`가 실행된 검증 커맨드를 이름으로 적지 않는다 | 문서 내 `gradle`·`--version` 등장 0회. `SATISFIED`만 보고 "테스트 통과"로 읽게 된다 |

부수로 확인했으나 등재하지 않은 것:

- 차단된 Run(`2026-08-12_002`)이 `task.yaml`만 든 Run Trace 디렉터리를 남기고 runId를 소비한다. 격리 검사가 `reserveRunDir` 뒤에 있기 때문이며 2026-08-11 이전부터 그렇다. 피해는 빈 디렉터리 하나이므로 P1을 새로 만들지 않고 여기 적어 둔다.
- 콘솔 코드페이지 949 + 자식 출력 UTF-8 디코딩. 이번 실행에서는 gradle 출력이 전부 ASCII라 발현하지 않았다. 한글 출력을 내는 빌드 도구에서 재시험이 필요하다.

---

## 판정: **우회를 거쳐 완주**

Task → 승인 → 격리 Run → 검증 → 리뷰 → 원장까지 `WAITING/VERIFIED`에 도달했다. 다만 **우회 5개를 거쳤고, 그중 하나는 검증이 무엇을 뜻하는지를 포기한 것**이다.

### 잘 동작한 것

- 한글 절대 경로에서 worktree 생성·에이전트 실행·git 관측·폐기 전부 정상
- 격리 Run의 관측이 정확했다 — `changedFiles` 2건, delta added 1/modified 1, 경로 위반 0
- Task를 고칠 때마다 승인이 무효화되고 명시적 재승인을 요구했다 (3회)
- waiver 없는 ACCEPTED가 거부됐고, 사유를 적자 통과했다
- 상한 4주체가 전부 계측·표면화됐다
- 잔존 0: worktree 등록 0, 임시 디렉터리 0, 대상 저장소는 `ad8d09a` 그대로

### 실사용이 되려면 필요한 것 (우선순위)

1. **P1-32** — 역할 하나 때문에 기본 설정이 아무것도 실행하지 못한다. 가장 먼저 막히는 지점이고, 원인이 가장 안 보인다.
2. **P1-27** — 성공한 Run의 결과물이 저장소에 남지 않는다. 반영 경로가 없으면 격리는 "안전하지만 쓸모없는" 상태다.
3. **P1-34** — Windows에서 표준 빌드 진입점(wrapper)을 쓸 수 없다.
4. **P1-35** — 사람이 읽는 문서가 무엇을 검증했는지 말하지 않는다. P1-10(무작업 Run 수락)과 겹치면 "통과했다"는 잘못된 확신을 만든다.
5. P1-13/P1-19는 **이번 실행에서 막지 않았다.** gradle이 `{PATH}`만으로 기동했다. `mvn`이나 `JAVA_HOME`을 요구하는 도구에서는 여전히 미검증이다.

### 이 실행이 검증하지 못한 것

- 저장소 **안**에 비ASCII 파일명이 있는 경우 (`core.quotepath` 미발현)
- 의존성을 새로 내려받는 최초 빌드에서의 10분/4 MiB 상한
- 한글 출력을 내는 빌드 도구와 CP949 콘솔의 조합
- 통과하는 실제 테스트 스위트 — 이 머신에 JDK 21이 없어 끝까지 확인하지 못했다

---

## 마무리 상태

```
$ git worktree list
<home>/Desktop/<한글>/sol/app_doluck/LottoMap_back      ad8d09a [dev]
$ ls /tmp/codefleet-worktree-* | wc -l
0
$ git status --porcelain
 M .claude/settings.local.json      ← 실행 전과 동일 (내가 만든 것이 아니다)
?? .codefleet/                      ← 2026-07-23 옛 Run 3개만 남음, 실행 전과 동일
HEAD: ad8d09a834cb68ba1c9b1c232ea3c151ce46f736
```

`.codefleet` 파일 목록과 `git status` 출력 모두 실행 전 스냅샷과 **바이트 동일**함을 diff로 확인했다.
