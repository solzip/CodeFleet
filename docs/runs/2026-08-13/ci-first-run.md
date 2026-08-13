# CI 첫 실행 — 양쪽 플랫폼 실패

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 17:05 (KST) |
| 대상 커밋 해시 | `8ce118b` (관측 시점 HEAD) |
| 작업 유형 | **감사** (관측·정정. 코드 변경 없음) |
| 선행 문서 | `docs/runs/2026-08-13/p1-61-prevention.md`, `docs/archive/2026-08-13/ARCHIVE.md` |
| 번호 실측 최대값 | **P0-16 / P1-61** |
| **테스트 근거** | 로컬 `npm test > /dev/null 2>&1; echo $?` → **0**. **CI에서는 양쪽 플랫폼 모두 실패** (아래) |

---

## 왜 이 문서가 필요한가

아카이브 문서와 두 README가 **"CI 워크플로 파일은 있고 한 번도 돌지 않았다"**고 적었다. 그 서술은 작성 시점에 참이었고, **푸시하는 순간 거짓이 됐다.**

전체 검토 중 `gh run list`로 확인한 결과 워크플로는 **5회 이상 실행됐고 전부 실패했다.** 공개된 문서에 살아 있는 거짓 문장이므로 정정한다 — P1-50과 같은 부류다.

## 관측

```
$ gh run list --limit 5
completed  failure  docs: rewrite README.ko.md as Korean ...      31676826579
completed  failure  docs: answer the CI objection ...             31676331498
completed  failure  docs: make English the default README ...     31673354691
completed  failure  docs: give README.en.md the same cover ...    31672784723
in_progress         docs: add what not to repeat ...              31677813943
```

`31676826579` 기준으로 두 잡 모두 실패했다.

| 잡 | 결과 | 실패 테스트 |
| --- | --- | --- |
| `test (ubuntu-latest)` | failure | **6건** |
| `test (windows-latest)` | failure | **2건** |

**로컬(win32, node 24.14.1)에서는 같은 커밋이 257 통과 / 0 실패, 종료 코드 0이다.**

---

## ubuntu-latest — 6건

| 테스트 | 실패 사유 |
| --- | --- |
| `adapter resolution is concrete, policy-allowed, locally available, and recorded` | `Error: write EPIPE` |
| **`a failed discard reaches the review bundle and blocks an unwaived accept`** | `AssertionError: the holder must actually block removal` — `actual: true, expected: false` |
| `a verification command cannot read the parent's environment` | `Error: write EPIPE` |
| `a verification command's runaway output is capped and the dropped bytes are counted` | `Error: write EPIPE` |
| `every process the Run started reports its ceiling, its usage, and what was dropped` | `AssertionError: the capped verification output must be counted` |
| `an unapproved Task cannot run and leaves no Run Trace` | `Error: write EPIPE` |

### (1) 폐기 실패 테스트 — **P1-21이 예측대로 실현됐다**

`ENVIRONMENT.md` §3-4가 이렇게 적어 뒀다.

| 플랫폼 | 거동 | 결과 |
| --- | --- | --- |
| win32 [실측] | 열린 파일은 삭제할 수 없다 | 폐기 실패가 **재현된다** |
| POSIX [분석, **미실측**] | 열린 fd가 `unlink`를 막지 않는다 | 폐기가 성공해 **테스트가 실패한다** (P1-21) |

**그 "분석, 미실측"이 이제 실측됐다.** ubuntu에서 `discarded`가 `true`로 나왔고, 테스트는 `false`를 기대했다. 예측이 정확했다.

P1-21은 등재 이후 [미확인]이었고, `REGISTER.md`는 동결됐다. **이 문서가 그 상태에 대한 정정을 보유한다** (`CONVENTIONS.md` §7 — 원 문서를 고치지 않고 새 문서에 기록).

> **P1-21 — [미확인] → [확인됨·유효]**
> 근거: run `31676826579`, `test (ubuntu-latest)`, `a failed discard reaches the review bundle and blocks an unwaived accept`, `actual: true, expected: false`.

### (2) `write EPIPE` 4건 — **신규 환경 사실**

ubuntu 실패 6건 중 4건이 `Error: write EPIPE`다. 그중 하나는 테스트 종료 후 비동기 활동으로도 나타났다.

```
Error: Test "a verification command's runaway output is capped and the dropped bytes are counted"
generated asynchronous activity after the test ended. This activity created the error
"Error: write EPIPE" and would have caused the test to fail, but instead triggered an
uncaughtException event.
```

POSIX에서 읽는 쪽이 닫힌 파이프에 쓰면 `EPIPE`가 난다. 이 프로젝트는 자식 출력에 상한을 두고 상한을 넘으면 더 읽지 않으므로, **출력을 계속 쏟는 자식이 POSIX에서 `EPIPE`로 죽는다.** win32에서는 같은 상황이 이렇게 드러나지 않아 로컬에서 한 번도 보이지 않았다.

`ENVIRONMENT.md`가 "POSIX 실측이 하나도 없다"고 적어 둔 그 공백에서 나온 사실이다. **등재하지 않는다** — 저장소가 동결됐고 새 번호를 여는 것은 후속 작업을 전제하기 때문이다. 대신 여기에 사실로 남긴다.

---

## windows-latest — 2건. **둘 다 이번 세션에 내가 추가한 테스트다**

| 테스트 | 실패 사유 |
| --- | --- |
| `a failing coverage check announces itself before it prints the report` | `the checker must exit non-zero, got 0` — **stdout이 비어 있다** |
| `a passing coverage check prints no failure banner` | `the report is still printed on success` — **stdout이 비어 있다** |

`097681b`에서 배너 순서를 고정하려고 넣은 테스트다. **로컬 win32에서는 통과하고 CI win32에서는 실패한다.**

### 무엇이 확실한가

- 두 경우 모두 **자식의 stdout이 완전히 비어 있다.**
- 성공 경로에서도 체커는 항상 커버리지 표를 출력한다. 따라서 **출력이 없다는 것은 CLI 블록이 아예 실행되지 않았다는 뜻이다.**

### 무엇이 추정인가

CLI 블록은 이 가드 뒤에 있다.

```js
// scripts/check-rule-coverage.mjs:159
if (process.argv[1] !== undefined &&
    import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
```

**직접 만든 경로 문자열과 Node가 준 모듈 URL을 문자열로 비교한다.** 두 값이 같은 파일을 가리키면서도 형태가 다르면 가드가 닫힌다. CI 러너의 임시 디렉터리 경로 형태(8.3 단축명 등)가 그 차이를 만들었을 가능성이 있으나, **CI에서 직접 재현해 확인하지 않았으므로 추정이다.**

### 이 실패가 아이러니한 이유

`ENVIRONMENT.md` §3-1이 같은 형태를 이미 경고하고 있다.

> **worktree 경로 계산은 git에게 물어야 한다.** 두 경로를 프로세스가 직접 정규화해 비교하면 틀릴 수 있다. 답을 git에게 물으면 그 문제가 사라진다. 이 계산이 틀리면 **증거 수집이 엉뚱한 하위 트리를 본다** — P0-7이 정확히 그 결함이었다.

제품 코드는 그 교훈을 반영해 `git rev-parse --show-prefix`를 쓴다. **그런데 도구 스크립트의 CLI 가드는 여전히 손으로 만든 경로 문자열을 비교한다.** 같은 저장소가 한쪽에서는 지킨 규칙을 다른 쪽에서 어겼고, 그 대가를 마지막 날 CI가 청구했다.

---

## 결정 — 워크플로를 제거한다

고쳐서 초록으로 만들 수 없다. **ubuntu 실패 6건 중 하나가 P1-21이고, 그것은 미해소로 닫기로 한 결함이다.** 초록으로 만들려면 동결하기로 한 작업을 해야 한다. 나머지 `EPIPE` 4건도 마찬가지다.

그리고 워크플로 자신이 첫 줄에 존재 이유를 적어 뒀다.

```
# .github/workflows/test.yml:1
# Something has to read the exit code.
```

**아카이브된 저장소에는 그 "누군가"가 없다.** 어떤 실패가 떠도 아무도 조치하지 않는다. 영구히 빨간 체크는 신호가 아니라 소음이고, 소음을 남겨두는 것은 **이 워크플로가 없애려던 문제를 뒤집어 재현하는 것**이다 — 아무도 읽지 않는 실패 신호.

그래서 `.github/workflows/test.yml`을 제거했다. **동결 이후 유일한 비문서 변경이며, 의도적이다.**

### 이것이 은폐가 아닌 이유

실패는 이 문서에 남는다. 잡별 결과, 실패 테스트 이름, 단언 메시지, 그리고 **run id**까지 적혀 있다.

```
31676826579  31676331498  31673354691  31672784723
```

GitHub Actions 실행 기록은 워크플로 파일을 지워도 남으므로, 위 id로 **누구나 원본 로그를 다시 열 수 있다.** 도구는 걷어내고 증거는 남긴다 — 이 프로젝트가 격리 트리를 폐기하면서 패치는 증거로 보존한 것과 같은 처리다.

**대신 잃는 것도 적는다.** 이제 이 저장소에서 `npm test`의 종료 코드를 읽는 자동 소비자는 다시 0개다. P1-61이 지적한 상태로 되돌아가는 셈이고, 후속 개발이 없으므로 그것을 감수한다.

## 정정한 것

| 문서 | 전 | 후 |
| --- | --- | --- |
| `README.md` | "A CI workflow file exists and **has never run**" | 실행됐고 양쪽 플랫폼에서 실패했다는 사실 + 이 문서 링크 |
| `README.ko.md` | "CI 워크플로 파일은 있지만 **한 번도 돌지 않았다**" | 같음 |
| `ARCHIVE.md` | 「폐기」 표의 `.github/workflows/test.yml` — "한 번도 실행되지 않았다(미푸시). 러너 동작 미검증" | 실행 결과와 이 문서 참조 |

> **각주 (2026-08-13 이후 추가)** — 위 표의 `README.md`는 당시 **영문** 표지, `README.ko.md`는 한국어 표지다.
> 이후 기본 언어를 한국어로 되돌리면서 `README.md`가 한국어, `README.en.md`가 영문이 됐다
> (`docs/runs/2026-08-13/readme-language-swap.md`). 위 표는 정정 시점의 파일명을 그대로 둔다.

**`REGISTER.md`는 고치지 않았다.** 동결 상태이고, P1-21의 상태 변경은 이 문서가 보유한다.

---

## 결론

1. CI는 **실행됐고 양쪽 플랫폼에서 실패했다.** ubuntu 6건, windows 2건. 로컬 win32는 같은 커밋에서 257 통과 / 0 실패다.
2. **P1-21이 예측대로 실현됐다.** POSIX에서 열린 fd가 `unlink`를 막지 않아 폐기가 성공하고 테스트가 실패한다 — 분석으로만 있던 것이 실측됐다.
3. windows 실패 2건은 **이번 세션에 추가한 배너 테스트**이고, 원인은 체커 CLI 가드의 문자열 경로 비교로 **추정**된다. 이 저장소가 제품 코드에서는 지킨 규칙을 도구 스크립트에서 어긴 자리다.

## 다음 작업

없음. 저장소는 동결 상태이며 이 실패들을 고치지 않는다.

## 미해소로 남긴 것

- **CI 실패 8건 전부 고치지 않았다.** 아카이브이므로 의도한 것이다
- **windows 실패의 원인은 추정이다.** CI에서 경로 값을 직접 찍어 확인하지 않았다
- **`EPIPE` 4건은 등재하지 않았다.** 새 번호는 후속 작업을 전제하는데 이 저장소에는 후속이 없다. 사실로만 남긴다
- **P1-21의 상태 변경이 `REGISTER.md`에 반영되지 않았다.** 동결 규칙에 따라 이 문서가 보유하며, 등재부만 읽는 사람은 여전히 [미확인]으로 본다
- **내가 추가한 테스트가 CI에서 깨진 채 공개된다.** 로컬에서 통과하는 것만 보고 플랫폼 차이를 확인하지 않은 결과이고, `LESSONS.md` 유형 5(수정이 새 결함을 만든다)의 마지막 사례다
