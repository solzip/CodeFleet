# 실행 환경에서 실측된 사실

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 16:40 (KST) |
| 대상 커밋 해시 | `cd353d19d22eba55ae108ce58edb421160146b94` |
| 작업 유형 | **결정** (아카이브. 코드 변경 없음) |
| 선행 문서 | `docs/audits/2026-08-12/04-platform-qualification.md`, `docs/audits/2026-08-12/10-first-real-run.md`, `docs/runs/2026-08-13/first-full-loop.md` |
| 번호 실측 최대값 | **P0-16 / P1-61** |

코드는 버리지만 환경은 그대로다. **실측한 것만 적고, 실측하지 않은 것은 「미검증」으로 명시한다.**

## 실측 호스트

```
OS        : Windows 11 Pro 10.0.26200
node      : v24.14.1
git       : 2.42.0.windows.2
shell     : PowerShell / Git Bash
콘솔 코드페이지 : 949 (CP949)
```

**POSIX 실측은 하나도 없다.** 이 문서의 POSIX 관련 서술은 전부 분석이며 그렇게 표시했다.

---

## 1. 인코딩 — CP949와 UTF-8

### 1-1. 콘솔 코드페이지가 949다 [실측]

```
chcp → 949
```

`chcp` 출력 자체가 UTF-8로 읽으면 깨진다.

**관측된 증상**: 이 아카이브 작업 중에도 발현했다. Python·셸이 한국어를 stdout으로 내보낼 때 도구 계층에서 `���ǥ���ٰ���` 형태로 깨져 돌아왔다. 파일에 쓴 내용은 정상이었으므로 **파일 I/O가 아니라 콘솔 파이프 계층의 문제**다.

### 1-2. 자식 프로세스 출력을 UTF-8로 디코딩한다 [잠재 위험, 미발현]

```
src/agent.ts  child.stdout.setEncoding("utf8")
```

**재현 조건**: 자식이 CP949로 출력하는 경우. 예 — 한국어 메시지를 내는 빌드 도구.

**관측된 증상**: 없음. Spring Boot 실사용에서 gradle 출력이 전부 ASCII라 발현하지 않았다(`10-first-real-run.md:87`).

**해결 미확정.** 자식의 출력 인코딩을 알 방법이 정해지지 않았다.

### 1-3. 한글 경로 [부분 실측]

실측 대상은 **절대 경로에만 한글이 있고 저장소 상대 경로에는 없는** 프로젝트였다(사용자 디렉터리명 2자 + 상위 디렉터리명 2자).

| 검사 | 결과 |
| --- | --- |
| `git rev-parse --show-toplevel` | 한글 그대로 반환, 같은 디렉터리로 round-trip **성공** |
| `git status --porcelain` | exit 0, 경로 정상 |
| Node `readFile` | 성공 |
| Node `spawn` cwd round-trip | 한글 경로 그대로 반환, 일치 |

**중요한 한계**: CodeFleet이 정책 판정에 쓰는 것은 **상대 경로**다. 상대 경로에 비ASCII가 없었으므로 **이 실측은 정책 경로를 시험하지 못했다.**

> **저장소 안에 한글 파일명이 있는 프로젝트는 미검증이다.**

이번 아카이브 작업의 fixture는 그 변수를 피하려고 **의도적으로 ASCII 경로(`C:\cf-fixture`)**를 썼다.

### 1-4. `core.quotepath` [미검증]

기본값 `true`(unset)에서 git은 비ASCII 경로를 8진 이스케이프로 출력한다.

**발현하지 않았다** — 저장소 상대 경로에 비ASCII가 없어 이스케이프 대상 자체가 없었다(`10-first-real-run.md:80`).

**해결 미확정.** `-c core.quotepath=false`를 붙일지, 출력을 디코딩할지 정해지지 않았다.

---

## 2. wrapper 스크립트가 차단된다 (P1-34)

### 관측된 증상 [실측]

```
command : ["cmd","/c","gradlew.bat","test", ...]
결과    : SHELL_INTERPRETER_DENIED
```

### 재현 조건

Windows에서 Gradle/Maven wrapper를 검증 커맨드로 지정하는 모든 경우.

### 원인 [실측 + 코드 확인]

세 가지가 겹친다.

1. `gradlew.bat`·`mvnw.cmd`는 **배치 파일이라 `cmd.exe` 없이 실행할 수 없다.** CreateProcess가 실행 이미지로 인식하지 못한다
2. `spawn`이 `shell:false`로 돈다
3. 그래서 `cmd`를 argv[0]에 쓰면 **정책이 셸 인터프리터로 거부한다** — 이건 설계대로다. 셸 문자열을 넘기는 순간 커맨드 정책 매칭이 무의미해지기 때문이다

**결과적으로 Windows에서 표준 빌드 진입점을 검증 커맨드로 쓸 방법이 없었다.**

**POSIX** [분석, 미실측]: `./gradlew`가 shebang 실행 파일이라 이 문제가 없다.

### 이 프로젝트가 택한 대응 [실측]

`3873d94`가 배치 파일 한정으로 Harness가 인터프리터를 공급하되, argv를 먼저 심사한다.

```
src/agent.ts:378   const CMD_METACHARACTERS = /[&|<>^"%!\r\n]/;
src/agent.ts:399   windowsShellDecision(command, args)
                     → NOT_A_BATCH_FILE | SHELL_REQUIRED | REFUSED_METACHARACTERS
```

`cmd.exe`가 문법으로 읽는 문자가 argv에 있으면 `REFUSED_METACHARACTERS`로 거부하고 **폴백하지 않는다** — spawn이 EINVAL로 실패하고 그것이 기록된다.

**핵심**: 인터프리터를 **Task가 지정하지 못하고 Harness가 공급한다.** Task가 셸 이름을 쓰고 문자열을 넘기는 길은 여전히 막혀 있다.

### 우회하려다 만난 것 [실측]

`java ... GradleWrapperMain test`로 직접 부르면 gradle은 기동했으나 toolchain 21이 없어 실패했다. **그 실패는 CodeFleet과 무관하고 프로젝트 기준선과 동일한 문장이었다.**

그리고 `env`가 `{PATH}`뿐이고 `JAVA_HOME`이 없는데도(에이전트가 `JAVA_HOME=(absent)` 출력으로 확인) **gradle wrapper는 정상 기동했고 `~/.gradle` 캐시 없이 10초에 끝났다.**

---

## 3. git 거동

### 3-1. worktree 경로 계산은 git에게 물어야 한다 [실측]

```
src/isolation.ts:83-93   git rev-parse --show-prefix
```

**재현 조건**: Windows에서 워크스페이스 경로와 git이 보는 top-level이 **대소문자나 8.3 단축명에서 다를 때.**

**왜 이렇게 했나**: 두 경로를 프로세스가 직접 정규화해 비교하면 틀릴 수 있다. 답을 git에게 물으면 그 문제가 사라진다. 이 계산이 틀리면 **증거 수집이 엉뚱한 하위 트리를 본다** — P0-7이 정확히 그 결함이었다.

### 3-2. `safe.directory`를 매 호출에 붙인다 [실측]

```
git -c safe.directory=<projectPath> rev-parse --git-dir
git -c safe.directory=<projectPath> worktree add --detach <treeRoot> HEAD
git -c safe.directory=<projectPath> worktree remove --force <treeRoot>
```

전역 설정을 바꾸지 않고 호출마다 붙인다. 소유자가 다른 디렉터리에서 git이 거부하는 것을 피한다.

### 3-3. worktree 폐기 순서 [실측]

**등록을 먼저 지우고 디렉터리를 지운다.** 반대로 하면 저장소가 없는 디렉터리를 가리키는 등록을 남긴다.

폐기 결과는 `discarded` / `unavailableReason` / `detail`로 기록된다. **실패한 폐기를 침묵으로 두지 않는 것이 요점** — 침묵은 "정리됐다"로 읽힌다.

**실측 확인**(`first-full-loop.md`): 디스크와 `git worktree list` 양쪽에서 사라졌고, 그 뒤에도 변경은 남았다. 패치가 증거로 보존되고 `apply`가 재적용하기 때문이다.

### 3-4. 열린 파일 핸들과 삭제 [win32 실측 / POSIX 분석]

| 플랫폼 | 거동 | 결과 |
| --- | --- | --- |
| **win32** [실측] | 기본 공유 모드에서 열린 파일은 삭제할 수 없다. 프로세스의 cwd인 디렉터리도 제거 불가 | 폐기 실패가 **재현된다** |
| POSIX [분석, 미실측] | 열린 fd가 `unlink`를 막지 않는다 | 폐기가 성공해 **테스트가 실패한다** (P1-21) |

`test/isolation.test.ts`의 폐기 실패 회귀 테스트가 이 win32 동작에 의존한다.

### 3-5. `git diff --no-index`와 `/dev/null` [미검증]

신규 파일 내용을 패치에 담기 위해 `git diff --no-index -- /dev/null <file>`을 쓴다. **git 구현의 `/dev/null` 특별 취급에 의존한다** — OS가 아니라 git 버전에 의존하는 지점이고, 근거가 이 호스트의 git 하나뿐이다(P1-30).

### 3-6. 경로 길이 [실측, 여유 있음]

```
os.tmpdir()      : 30자
격리 트리 접두    : 71자
260자까지 여유    : 189자
```

실측 프로젝트에서 가장 깊은 저장소 상대 경로가 71자였으므로 격리 트리 안에서 총 143자 — **여유 안에 있다.** 사용자명이 길거나 저장소 경로가 189자를 넘으면 **격리 Run에서만** 실패한다(P1-31).

### 3-7. 줄바꿈 [실측]

`.gitattributes`가 `* text=auto eol=lf`다. 그런데 **작업 트리의 모든 파일이 CRLF**다 — 손대지 않은 파일 포함.

git이 인덱스에서 LF로 정규화하므로 diff는 실제 변경만 보여준다(실측: 116 insertions / 42 deletions, 전체 파일 재작성 아님). **커밋에는 영향이 없다.**

**체크아웃이 왜 CRLF인지는 미검증.**

---

## 4. spawn 정책에서 막힌 것들

### 4-1. 자식은 `PATH`만 받는다 [실측]

```
src/agent.ts:439   env: options.env ?? { PATH: process.env.PATH ?? "" }
src/run.ts:2648    같은 기본값
```

**의도는 옳다** — `AWS_SECRET_ACCESS_KEY`·`GITHUB_TOKEN`·`DATABASE_URL`을 에이전트 프로세스에 넘기지 않는다. 실측으로 확인됐다: 부모에 `CODEFLEET_VERIFY_SECRET`을 export하고 Run을 돌리자 `envSeenByVerificationChild : "absent"`.

### 4-2. 그 대가 — `HOME`/`USERPROFILE`이 없다 [실측, 해결 미확정]

**관측된 증상**: 동일 환경을 손으로 재현한 프로브에서 `claude` CLI가 `~`를 **리터럴 디렉터리로 생성**했다 — `C:\cf-fixture\~\working-diary\`.

**재현 조건**: 홈 디렉터리에서 설정을 읽는 CLI를 `PATH`만 있는 환경으로 spawn.

**Run 내부 worktree에서도 같은 일이 있었는지는 확인 불가** — 트리가 폐기됐고 스코프가 `src/**`라 스냅샷에도 잡히지 않는다.

git 자식에는 이미 예외 목록이 있다:

```
src/agent.ts:332   const GIT_HOME_ENV = ["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"];
src/agent.ts:351   gitProcessEnv()
```

주석이 이유를 적는다 — `core.autocrlf` 하나가 모든 줄바꿈을 바꿀 수 있으므로 "증거를 보호하는 일이 증거를 바꾸는 것으로 시작해서는 안 된다".

**그런데 어댑터와 검증 커맨드는 `gitProcessEnv()`를 부르지 않는다.** git에는 홈이 필요하다고 판단했으면서 에이전트 CLI에는 같은 판단을 하지 않았다. **해결 미확정.**

### 4-3. `PATHEXT`도 없다 [실측 함의, 증상 미관측]

`OS_ESSENTIAL_ENV`에는 `PATHEXT`가 있지만 그건 `gitProcessEnv()`용이다. 어댑터·검증 자식은 `PATH`만 받으므로 `PATHEXT`가 없다.

**이번 실측에서는 발현하지 않았다** — `claude`가 `.exe`이고 `node`도 `.exe`라 확장자 해석이 필요 없었다. `.cmd`/`.bat`만 있는 도구에서 어떻게 되는지는 **미검증**.

### 4-4. 셸 인터프리터는 argv[0]에서 거부된다 [실측]

```
src/command-policy.ts:198   if (isShellInterpreter(argv[0])) return blocked("SHELL_INTERPRETER_DENIED");
```

**설계대로다.** 커맨드가 argv 배열로만 들어오고 셸 문자열로 파싱되지 않아야 정책 매칭이 의미를 갖는다. §2의 wrapper 문제가 이 규칙의 대가다.

### 4-5. 타임아웃 kill이 win32에서만 확실하다 [win32 실측 / POSIX 분석]

```
src/agent.ts   child.kill("SIGTERM")
```

`SIGKILL`·`killSignal`·`detached`·프로세스 그룹 종료 **grep 0건**.

| 플랫폼 | 실제 동작 | 결과 |
| --- | --- | --- |
| **win32** [실측] | Node가 `TerminateProcess`로 매핑. 대상이 무시할 수단이 없다 | 자식이 반드시 죽는다 |
| POSIX [분석, 미실측] | 진짜 `SIGTERM`. 핸들러를 단 프로세스는 무시할 수 있다 | **자식이 살아남고 계속 트리를 고칠 수 있다** |

2026-08-11 재현 시도가 실패했는데("child survived the timeout kill: false"), **코드가 옳아서가 아니라 win32가 무시를 허용하지 않아서**다.

**양쪽 공통 한계**: kill 대상이 직계 자식 하나다. 어댑터나 테스트 러너가 손자를 띄우면 **어느 플랫폼에서도 살아남는다.** P1-17로 등재됐고 미해소다. **해결 미확정.**

---

## 5. 에이전트 CLI (`claude`) [실측]

기본 인자로는 파일을 쓰지 못한다.

```
src/agent.ts:64   defaultArgs: ["-p", "--output-format", "stream-json", "--verbose"]
```

**관측된 증상**: 이 인자로 헤드리스 실행하면 내부 CLI의 승인 모드가 `default`가 되어 편집 도구 호출이 전부 거부된다. **CodeFleet이 `fileEdit: true`로 기동한 어댑터가 파일을 못 쓴다.**

**재현 조건**: 승인 모드를 지정하지 않고 헤드리스로 띄우는 모든 경우.

**우회**(실측으로 동작 확인): Local Overlay에 `--permission-mode acceptEdits`를 붙인다. 편집은 격리된 worktree 안에서만 일어난다.

**구조적 지적**: CodeFleet은 `capabilities.fileEdit`를 계산해 어댑터에 넘기지만, 어댑터는 그것을 **거부 판정에만 쓰고 CLI 플래그로 번역하지 않는다.** `commandExecution`은 읽어서 기동을 막는 데 쓰는데 `fileEdit`은 어디에도 전달되지 않는다.

---

## 결론

1. **인코딩·wrapper·spawn env** 세 가지가 Windows에서 실제로 물었고, 그중 **CP949 자식 출력**과 **`HOME` 부재**는 해결 미확정으로 남는다.
2. **POSIX 실측이 하나도 없다.** 타임아웃 kill(§4-5)과 열린 핸들 삭제(§3-4)는 win32에서만 확인됐고, 분석상 POSIX에서 다르게 동작한다.
3. **저장소 안에 비ASCII 파일명이 있는 경우는 끝내 시험하지 못했다.** 정책 판정이 상대 경로를 쓰는데 실측 대상의 상대 경로에는 비ASCII가 없었다.

## 다음 작업

없음. 이 문서는 새 프로젝트의 입력이다.

## 미해소로 남긴 것

| 항목 | 상태 |
| --- | --- |
| 자식 출력이 CP949일 때 | **해결 미확정** — 자식 출력 인코딩을 알 방법이 정해지지 않았다 |
| 저장소 내 비ASCII 파일명 + `core.quotepath` | **미검증** — 시험 대상이 없었다 |
| 어댑터·검증 자식의 `HOME` 부재 | **해결 미확정** — git에는 예외 목록이 있고 이쪽에는 없다 |
| `PATHEXT` 부재의 영향 | **미검증** — `.cmd`/`.bat`만 있는 도구에서 미시험 |
| POSIX 전반 | **미실측** — 이 프로젝트는 win32 단일 호스트에서만 돌았다 |
| 손자 프로세스 종료 | **해결 미확정** (P1-17) |
| 작업 트리가 CRLF인 이유 | **미검증** — 커밋에는 영향이 없음만 확인 |
| `git diff --no-index`의 `/dev/null` 의존 | **미검증** — git 1개 버전에서만 확인 (P1-30) |
