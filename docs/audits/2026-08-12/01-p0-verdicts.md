# P0-1 ~ P0-11 판정

```text
점검 일시   : 2026-08-12
점검 대상   : 244fac79d024a09e881350dbefb90c767266cf60 (main, 작업 트리 = HEAD)
측정 근거   : npm test — 216 tests, 216 pass, 0 fail
             공격 재현 2종 (격리 모드 비교, 자격증명 유출), 상호작용 4종
판정 기준   : (A) 결함을 막는 코드가 실행 경로에 있는가
             (B) 그 결함을 재현하려다 실패하는 테스트가 있고 npm test에서 통과하는가
             (C) 발생 조건을 만족시키는 우회가 남아 있는가
             하나라도 실패하면 [부분해소] 이하.
```

---

## P0-1. 에이전트 실행 강제 — **부분해소** [플랫폼 무관]

### (A) 코드 — 부분 통과

| 축 | 상태 | 근거 |
|---|---|---|
| 자격증명 | **해소** | `spawn` 호출 지점이 `src/agent.ts:252` 하나로 모였고 `env`가 명시적이다. 어댑터·검증 커맨드는 `{ PATH }`, git 호출은 `gitProcessEnv()`의 이름 allowlist |
| 파일 범위 사후 탐지 | **해소** | 격리 모드와 무관하게 동작한다(아래 C). 2026-08-11에는 격리를 켜면 사라졌다 |
| 파일 범위 사전 차단 | **미해소** | `evaluatePathPolicy`는 여전히 에이전트 종료 후에 호출된다 |
| 에이전트 명령 preflight | **미해소** | `preflightCommand` 호출 지점 전수: `src/run.ts:1413` 한 곳. 2026-08-10부터 변함없다 |

`spawn` 전수 확인:

```
$ grep -rn "spawn(" src/ | grep -v spawnSync
src/agent.ts:252:    const child = spawn(command, args, {
```

### (B) 테스트 — **실패**

`test/process-boundaries.test.ts`가 검증 커맨드의 env 차단과 git 자식의 env allowlist를 고정한다. 그러나 **어댑터의 capabilities 거부에는 여전히 테스트가 0건이다.**

```
$ grep -rn "Adapter refused to launch" src/ test/
src/agent.ts:51:  stderr: "Adapter refused to launch: AdapterRequest capabilities do not permit command execution.\n"
```

2026-08-11이 P1-15로 등재한 그대로다. 가드가 항상 통과하도록 바뀌어도 실패하는 테스트가 없다.

### (C) 반증 — 우회 1건 (구조적)

- **자격증명**: 재현 실패. `envSeenByVerificationChild: "absent"`.
- **범위 밖 수정**: 여전히 사후 탐지다. `isolationMode: NONE`에서 에이전트가 범위 밖 파일을 만들면 파일은 실제로 만들어지고 Run은 `SUCCEEDED`를 출력한다. 다만 `pathViolations`에 기록되고 리뷰가 ACCEPTED를 막는다.
- **에이전트 명령**: preflight를 거치지 않는다. 명령 채널이 없는 한 구조적으로 불가능하고, `run.ts`의 주석과 `COMMAND_CHANNEL_NOT_HARNESS_VISIBLE`이 그 사실을 유지한다.

**판정 근거**: (B) 실패 + 사전 차단 축 미해소 → 부분해소. 2026-08-11의 [미해소]에서 올라온 것은 자격증명 축이 닫히고 사후 탐지가 격리 모드와 무관해졌기 때문이다.

---

## P0-2. Objective 큐 게이트 — **해소** [플랫폼 무관]

### (A) 코드 — 통과

`src/run.ts` `blockedQueueReason`. 승인 검사 직후, 어떤 산출물보다 앞에서 호출된다. `replayStatus !== "COMPLETE"` 판정이 큐 필터보다 **앞**에 있고, `readdir`의 `catch`가 `ENOENT`에 한정된다.

### (B) 테스트 — 부분 통과

| 상태 | `blockedQueueReason` | `runTask` 종단 |
|---|---|---|
| 미attach | ✔ | ✔ |
| WAITING | ✔ | — |
| BLOCKED | ✔ | ✔ |
| SKIPPED | ✔ | ✔ |
| **CANCELED** | (P0-9 테스트가 파손 원장과 함께 사용) | **없음** |
| replay 불가 | ✔ | ✔ |
| 디렉터리 불가 | ✔ | ✔ |

`CANCELED`만 단독 종단 테스트가 없다. 2026-08-11 02 §B의 지적이 그대로 남아 있어 **P1-25로 등재**했다.

### (C) 반증 — 0건

```
corrupt-ledger run  : refused -> Run is blocked: the ledger of Objective auth replayed as BLOCKED...
unreadable-dir run  : refused -> Run is blocked: the Objective queue at .codefleet/objectives could not be read (ENOTDIR)...
```

미attach Task가 통과하는 것은 명시된 결정이고 주석에 근거가 있다. detach 커맨드는 여전히 존재하지 않는다.

---

## P0-3. 중복·동시 실행 — **부분해소** [플랫폼 무관]

### (A) 코드 — 통과

`runTask`가 taskId별 배타 락을 잡고(`open(path,"wx")`), `reserveRunDir`가 비-recursive `mkdir`로 id를 예약한다. 둘 다 2026-08-11에서 변경 없음.

### (B) 테스트 — 통과

`test/defect-repro.test.ts`의 race 테스트 3종(각 3 trial × 8 동시). 수정 전 측정값(N=8에서 39/40 충돌)이 파일 헤더에 남아 있다.

### (C) 반증 — 우회 1건

`status: DONE` Task의 순차 재실행이 여전히 경고뿐이다. `src/task.ts:79-81`이 `warnings`에 넣고 `loadTask`가 그것을 버린다. 2026-08-10과 바이트 동일. P1-16으로 등재돼 있다.

---

## P0-4. 실행 격리·롤백 — **해소** [플랫폼 무관, 단 실패 경로는 win32 한정]

### (A) 코드 — 통과

- 생성: `prepareIsolation`이 `workPath`(Task 작업 위치의 격리 트리 대응점)와 `treeRoot`를 분리한다.
- 관측: 전 지점이 `observedPath` 경유 (P0-7 참조).
- 폐기: 3개 경로 — 격리 요구 거부 시, 증거 수집 직후, `runTask`의 `finally`. 멱등.
- 반영: 없음. **명시적으로 정하지 않기로 한 결정**이고 run-record.md가 그 사실을 출력한다.

### (B) 테스트 — 통과

`test/isolation.test.ts`의 격리 종단 테스트가 관측 4항목 + 봉쇄 + 트리 부재 + run-record 문구를 고정한다.

### (C) 반증 — 0건

```
workspaceEdited          : false     (GIT_WORKTREE)
outOfScopeInWorkspace    : false
worktreeEntries          : 1
leftover worktree parents: 0
```

`requireIsolationForMutation: false`로 격리를 끄는 우회는 여전히 존재하지만, 그것은 사람이 프로파일에 적는 결정이고 run-record가 편집 위치를 명시한다.

---

## P0-5. taskRevision 추적 체인 — **해소** [플랫폼 무관]

### (A) 코드 — 통과

`?? 1` 기본값 없음, `taskRevision === null`이면 precheck에서 거부, 큐 항목 미attach도 append 전 거부.

### (B) 테스트 — 통과

`test/defect-repro.test.ts`의 revision 2 종단 테스트가 approve → edit → invalidate → approve → attach → run → review → import → VERIFIED 전 구간을 통과시킨다.

### (C) 반증 — 0건

잔여는 P1-12(정정 이벤트 CLI 부재)뿐이고, 새로 발생하는 오염은 막힌다.

---

## P0-6. 타임아웃·출력 상한 — **부분해소** [**win32 한정 검증**]

### (A) 코드 — 통과

상한 6종이 `src/agent.ts` 한 블록에 모여 있다: 어댑터 30분/16 MiB, 검증 10분/4 MiB, git 증거 2분/32 MiB, 격리 10분, 신규 파일 수집 60초 예산. 모든 자식이 `runCommand`를 지난다.

표면화는 4개 주체 전부 구현됐다(`resourceLimits` + `adapter-result.json.scanScope` + run-record의 "What the limits did" 절, `## What changed` 앞).

### (B) 테스트 — 부분 통과

| 검증 대상 | 테스트 |
|---|---|
| 어댑터 타임아웃·상한 | ✔ |
| Harness 자식 타임아웃 | ✔ (`runProcess` 직접, 400ms) |
| 검증 커맨드 env·상한 | ✔ |
| 잘린 diff가 waiver 불가 | ✔ 종단 |
| 상한·사용량·잘림 표면화 | ✔ |
| 계측 없음과 잘림 없음의 구분 | ✔ |
| **SIGTERM 무시 프로세스** | **없음** — 코드에 에스컬레이션이 없다 |
| **어댑터 타임아웃의 기계 판독** | **없음** — 아래 |

### (C) 반증 — 우회 2건

1. **SIGKILL 에스컬레이션 부재.** `src/agent.ts:285`가 `SIGTERM`을 한 번 보내고 즉시 resolve한다. grep: `SIGKILL`/`killSignal`/`detached` 0건. win32에서는 `TerminateProcess`로 매핑돼 무시 불가라 이 호스트에서는 재현되지 않는다. POSIX에서는 핸들러를 단 자식이 살아남고, **2단계 이후 모든 자식이 이 한계를 공유한다.** P1-17.

2. **어댑터 타임아웃이 기계 판독 불가.** `toAdapterExecutionStatus`는 `exitCode === null`도, 비-0 종료도 똑같이 `ADAPTER_FAILED`로 만든다. `resourceLimits.adapter`에도 `timedOut` 필드가 없다. 검증 커맨드는 `VERIFICATION_COMMAND_TIMED_OUT:<id>`를 받는데 어댑터는 받지 못한다 — **게이트가 "에이전트가 죽었다"와 "30분을 넘겨 우리가 죽였다"를 구분할 수 없다.** 신규 P1-20.

---

## P0-7. 격리 시 증거가 엉뚱한 트리에서 수집 — **해소** [플랫폼 무관]

### (A) 코드 — 통과

관측 지점 전부가 `observedPath` 하나를 경유한다. `executeRun` 안에서 지역변수 `projectPath`를 읽는 곳은 4곳이고 전부 기록된 예외(격리 입력 2, 대조 기록 1, `editsInWorkspace` 파생 1)다.

### (B) 테스트 — 통과

### (C) 반증 — 0건. 2026-08-11의 발견 방법을 그대로 재실행한 결과가 SUMMARY의 비교표다. **두 모드의 관측 6항목이 전부 일치한다.**

---

## P0-8. 격리 트리 미폐기·미반영 — **해소** [**실패 경로는 win32 한정 검증**]

### (A) 코드 — 통과

`discard()`가 3개 경로에서 호출되고 멱등이며 `DiscardOutcome`을 반환한다. 실패는 `ISOLATION_DISCARD_FAILED`로 관측 → Run Summary → 리뷰 번들까지 올라가고 waiver 없는 ACCEPTED를 막는다.

### (B) 테스트 — 통과, 단 실패 경로가 플랫폼 의존

성공 경로(트리 부재, worktree 목록 1)는 플랫폼 무관. **실패 경로 테스트는 열린 파일 핸들이 삭제를 막는 win32 동작을 전제한다.** POSIX에서는 열린 fd가 unlink를 막지 않으므로 폐기가 성공하고 `assert.equal(observation.workspace.isolation.discarded, false)`가 실패한다. 신규 P1-21.

### (C) 반증 — 0건

```
tree discarded          : true
tree still on disk      : false
leftover worktree parents: 0
```

---

## P0-9. 큐 게이트 fail-open — **해소** [플랫폼 무관]

### (A) 코드 — 통과 (P0-2 참조)

### (B) 테스트 — 통과. 파손 원장과 `ENOTDIR` 두 fixture 모두 `blockedQueueReason`과 `runTask` 양쪽을 assert한다. 디렉터리 권한 조작 대신 "파일 자리에 디렉터리" 방식을 써서 플랫폼 무관하게 재현된다.

### (C) 반증 — 0건

거부 메시지가 전면 차단이라는 사실, 근거, finding 최대 5건, 복구 확인 명령을 담는다. **닫히지 않은 것 하나가 문서에 명시돼 있다** — Objective 디렉터리를 통째로 지우면 결정이 사라진다. 원장 소실이라 게이트에서 막을 지점이 없다.

---

## P0-10. Harness 자식 프로세스 경계 — **해소** [플랫폼 무관]

### (A) 코드 — 통과. `spawn` 1곳, 통과 지점 전수(검증 커맨드·git diff·git status·`--no-index`·스냅샷 git·worktree add/remove/rev-parse)가 모두 `runCommand` 위임.

### (B) 테스트 — 통과.

### (C) 반증 — 0건. 단 `src/isolation.ts`의 `run()`이 `scanScope`를 버려, 상한을 적용받으면서 계측을 기록하지 않는 유일한 지점으로 남는다. 현재 도달 불가(출력이 작다)지만 `repositoryPrefix`가 stdout을 **데이터로** 쓰므로 패턴상 위험하다. 신규 P1-23.

---

## P0-11. 신규 파일 내용 소실 — **해소** [플랫폼 무관]

### (A) 코드 — 통과. `git diff --no-index`로 untracked 내용을 싣고, 인덱스를 건드리지 않는다. 실을 수 없는 것은 패치 본문·`newFileCapture`·리뷰 게이트 세 곳에 이름과 사유로 남는다.

### (B) 테스트 — 통과 (내용 수록 종단 + 상한·바이너리 단위).

### (C) 반증 — 0건. 두 모드 모두 `createdFileContentInPatch: true`.

**다만 2단계가 정한 우선순위 규칙이 이 경로에서 도달 불가다.** 파일당 상한 1 MiB < git 증거 상한 32 MiB이므로, 크기 검사를 통과한 파일의 `--no-index` 출력은 결코 잘리지 않는다. 규칙은 옳으나 발동하지 않는다. 신규 P1-22.
