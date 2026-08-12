# 플랫폼 한정 판정

```text
점검 일시   : 2026-08-12
점검 대상   : 244fac79d024a09e881350dbefb90c767266cf60
실행 호스트 : win32 단일. 이 감사의 모든 실측은 여기서 나왔다.
방법        : 지시가 근거로 든 fixes/env-DESKTOP-ENGO922.md 는 존재하지 않으므로
             (SUMMARY 참조) 코드와 OS 의미론에서 직접 판정했다. POSIX 동작은
             실측이 아니라 분석이며, 그 사실을 항목마다 표시했다.
```

## 표기

- **[플랫폼 무관]** — 판정의 근거가 되는 메커니즘이 OS에 의존하지 않는다.
- **[win32 한정 검증]** — 이 호스트에서는 통과하지만, 통과가 코드가 아니라 플랫폼 동작 덕이거나, POSIX에서 결과가 달라진다고 볼 근거가 있다.

---

## P0별 표시

| ID | 판정 | 표시 | 근거 |
|---|---|---|---|
| P0-1 | 부분해소 | [플랫폼 무관] | `spawn`의 `env` 옵션은 Node가 모든 플랫폼에서 동일하게 적용한다 |
| P0-2 | 해소 | [플랫폼 무관] | 파일 읽기와 JSON 파싱 |
| P0-3 | 부분해소 | [플랫폼 무관] | `open(path,"wx")`와 비-recursive `mkdir`은 양쪽에서 배타적이다 |
| P0-4 | 해소 | [플랫폼 무관] | 성공 경로 기준. 실패 경로는 P0-8 참조 |
| P0-5 | 해소 | [플랫폼 무관] | 원장 replay, 파일시스템 무관 |
| P0-6 | 부분해소 | **[win32 한정 검증]** | 아래 §1 |
| P0-7 | 해소 | [플랫폼 무관] | 경로 계산은 `git rev-parse --show-prefix`가 답한다 |
| P0-8 | 해소 | **[win32 한정 검증]** | 아래 §2 |
| P0-9 | 해소 | [플랫폼 무관] | 아래 §3 |
| P0-10 | 해소 | [플랫폼 무관] | 위임 여부는 코드 사실 |
| P0-11 | 해소 | [플랫폼 무관] | 아래 §4 |

---

## §1. P0-6 — 타임아웃 kill이 win32에서만 확실하다

`src/agent.ts`:

```ts
const timer = setTimeout(() => {
  child.kill("SIGTERM");
  finish({ status: "FAILED", exitCode: null, ... });
}, timeoutMs);
```

`SIGKILL`·`killSignal`·`detached`·프로세스 그룹 종료 grep 0건.

| 플랫폼 | `child.kill("SIGTERM")`의 실제 동작 | 결과 |
|---|---|---|
| win32 | Node가 `TerminateProcess`로 매핑한다. 대상이 무시할 수단이 없다 | 자식이 반드시 죽는다 |
| POSIX | 진짜 `SIGTERM`. `process.on("SIGTERM", ...)`를 단 프로세스는 무시할 수 있다 | **자식이 살아남는다.** `runCommand`는 `FAILED`를 반환하고 Run은 계속 진행하는데, 그 자식은 계속 트리를 고칠 수 있다 |

2026-08-11 `06-p0-6-limits.md` §C-1이 이 호스트에서 재현을 시도했고 실패했다("VERDICT: child survived the timeout kill: false"). 그것은 코드가 옳아서가 아니라 win32가 무시를 허용하지 않아서다.

**양쪽 모두에서 성립하는 부분**: kill 대상이 직계 자식 하나다. 어댑터나 테스트 러너가 손자 프로세스를 띄우면 그것들은 어느 플랫폼에서도 살아남는다.

2단계가 모든 자식을 `runCommand`로 모았으므로 **이 한계는 이제 어댑터뿐 아니라 검증 커맨드·git 호출 전부가 공유한다.** 이미 P1-17로 등재돼 있고, 3-4단계가 2단계 실측을 근거로 보강했다.

---

## §2. P0-8 — 폐기 실패 경로의 회귀 테스트가 POSIX에서 실패한다

`test/isolation.test.ts`의 "a failed discard reaches the review bundle and blocks an unwaived accept"는 이렇게 실패를 만든다:

```
holder.mjs:  openSync(process.argv[2], "w");   // worktree 안의 파일을 연 채 유지
```

그 상태에서 `git worktree remove --force`와 `rm -rf`가 실패하기를 기대하고, 다음을 assert한다:

```ts
assert.equal(observation.workspace.isolation.discarded, false, "the holder must actually block removal");
assert.equal(observation.workspace.isolation.unavailableReason, "ISOLATION_DISCARD_FAILED");
```

| 플랫폼 | 열린 핸들과 삭제의 관계 | 테스트 결과 |
|---|---|---|
| win32 | 기본 공유 모드에서 열린 파일은 삭제할 수 없다. 프로세스의 cwd인 디렉터리도 제거할 수 없다 | 폐기 실패 → **통과** |
| POSIX | `unlink`는 열린 fd와 무관하게 성공한다. 디렉터리가 어떤 프로세스의 cwd여도 `rmdir` 후 그 프로세스만 사라진 경로를 갖는다 | 폐기 **성공** → `discarded: true` → **첫 assert에서 실패** |

즉 이 테스트는 POSIX에서 red가 된다. **제품이 잘못돼서가 아니라 테스트의 전제가 win32 전용이기 때문이다.**

두 가지 결과가 따른다:

1. POSIX CI를 켜면 스위트가 즉시 실패한다. 조용하지 않으므로 오해를 부르지는 않지만, 켜기 전에 고쳐야 한다.
2. **POSIX에서는 `ISOLATION_DISCARD_FAILED` 경로에 회귀 방어가 없다.** 그 경로의 코드(관측 → Run Summary → 리뷰 번들 → waiver 없는 ACCEPTED 차단)는 플랫폼 무관하게 옳지만, 그것을 지키는 테스트가 win32에서만 돈다.

신규 **P1-21**로 등재했다. 이식 가능한 실패 유발 수단으로는 읽기 전용 부모 디렉터리(POSIX `chmod`), 또는 `discard`가 부를 git 실행 파일을 실패하도록 만드는 주입 지점이 후보다.

**성공 경로는 플랫폼 무관하다.** 격리 종단 테스트가 확인하는 "트리가 사라졌다 / `git worktree list`가 1줄이다 / 임시 부모가 없다"는 양쪽에서 같다.

---

## §3. P0-9 — 이식 가능하게 재현된다

읽을 수 없는 objectives 디렉터리를 만드는 방법으로 **권한 조작 대신 "디렉터리 자리에 파일"**을 골랐다.

```ts
await writeFile(path.join(root, ".codefleet", "objectives"), "not a directory\n", "utf8");
```

`readdir`이 이때 내는 오류는 win32·POSIX 모두 `ENOTDIR`다. `chmod 000`은 POSIX에서만 의미가 있고 root 사용자에게는 그마저 통하지 않으므로, 이 선택이 판정을 플랫폼 무관하게 만든다.

파손 원장 쪽은 순수한 파일 내용 문제라 애초에 플랫폼과 무관하다.

---

## §4. P0-11 — git 동작에는 의존하나 OS에는 의존하지 않는다

```ts
["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--no-index", "--", "/dev/null", file]
```

`/dev/null`은 POSIX에서 실재하는 파일이고, git-for-windows는 이 이름을 특별히 처리한다. 이 호스트에서 실측으로 동작을 확인했다(신규 파일의 전체 내용이 `new file mode` 헤더와 함께 패치에 들어온다).

OS 차이가 아니라 **git 구현 차이**에 의존하는 지점이므로, git 버전을 크게 낮추면 달라질 수 있다. 현재 근거는 이 호스트의 git 하나다.

---

## §5. 그 밖의 플랫폼 분기

| 위치 | 내용 | 성격 |
|---|---|---|
| `src/run.ts` `detectCaseSensitivity` | 탐지에 실패하면 `process.platform !== "win32" && !== "darwin"`으로 후퇴 | 설계상 의도된 분기. 경로 정책이 대소문자 규칙을 하나로 고정하기 위한 것 |
| `src/agent.ts` `gitProcessEnv` | `SystemRoot`·`COMSPEC`·`PATHEXT` 등 Windows 필수 이름을 목록에 포함 | 부모에 있는 이름만 넘기므로 POSIX에서는 자동으로 빠진다. 무해 |
| `test/isolation.test.ts` `forceRemoveTree` | 삭제를 재시도한다 | win32의 핸들 해제 지연 대응. POSIX에서는 첫 시도에 성공하므로 무해 |

---

## POSIX에서 다르게 동작할 수 있는 항목 — 모음

| # | 항목 | 예상 차이 | 등재 |
|---|---|---|---|
| 1 | 타임아웃 kill (P0-6) | `SIGTERM`을 무시하는 자식이 살아남는다. Run은 `FAILED`로 진행하지만 자식은 계속 워크스페이스를 고친다 | P1-17 |
| 2 | 폐기 실패 회귀 테스트 (P0-8) | 폐기가 성공해 테스트가 실패한다. 그 경로의 회귀 방어가 POSIX에 없다 | **P1-21 (신규)** |
| 3 | 손자 프로세스 (P0-6) | 양쪽 모두 살아남는다 — POSIX 한정이 아니라 **공통 미해결** | P1-17 |

1·2는 POSIX에서 확인이 필요하다. 이 감사는 그것을 하지 못했고, 하지 못했다는 사실을 판정에 포함시켰다.
