# P0-3 — 중복 · 동시 실행

```text
점검 일시   : 2026-08-11
점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
점검 범위   : src/run.ts, src/task.ts, src/mutation.ts, test/defect-repro.test.ts
측정 근거   : npm test — 199 tests, 199 pass
             defect-repro.test.ts의 race 테스트 3종 (각 3 trial × 8 concurrency)
비고        : 이번 완료 보고에 명시 언급이 없던 항목이므로 엄밀히 확인했다
```

## 판정: **부분해소**

(A) 통과 · (B) 통과 · (C) 우회 1건 (순차 재실행).

---

## (A) 코드 검증 — 통과

### A-1. `runTask`가 락을 잡는다

2026-08-10 기준 `runMutation` 호출자 7곳에 `runTask`가 없었다. 현재는 뮤테이션 락을 빌려 쓰는 대신 **같은 배타적 생성 규율을 쓰는 별도 락**을 도입했다.

`src/run.ts:280-292`

```ts
export async function runTask(rootDir, taskId, workspaceDiscovery?): Promise<RunExecution> {
  const lockPath = runLockPathFor(rootDir, taskId);
  await acquireRunLock(lockPath, taskId);
  try {
    return await executeRun(rootDir, taskId, workspaceDiscovery);
  } finally {
    await rm(lockPath, { force: true });
  }
}
```

`src/run.ts:294-319` `acquireRunLock` — `open(lockPath, "wx")`로 배타 생성하고, `EEXIST`면 `RunLockHeldError`에 holder(pid/host/시각/runId)를 실어 던진다. **stale 락을 자동으로 깨지 않는다**(`run.ts:315-317`). 해제는 명시적 `breakRunLock`(`run.ts:255-266`)이고 CLI에 노출돼 있다.

락 키는 taskId 단위다(`run.ts:268-273`). 뮤테이션 락을 빌리지 않은 이유가 주석에 적혀 있다 — 워크스페이스 락은 "Run 실행 동안 잡지 않는다"로 설계가 고정돼 있어 Run이 빌릴 수 없다.

`try/finally`이므로 실패 경로에서도 해제된다. 테스트가 이것까지 고정한다(`test/defect-repro.test.ts:372-379`).

### A-2. runId가 예약과 하나가 됐다

`nextRunId`는 사라졌고 `reserveRunDir`(`src/run.ts:1857-1892`)가 대신한다.

```ts
while (candidate < 999) {
  candidate += 1;
  const runId = `${datePart}_${String(candidate).padStart(3, "0")}`;
  const runDir = path.join(runsDir, runId);
  try {
    await mkdir(runDir);              // ← recursive 없음 = 배타적
    return { runId, runDir };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") { throw error; }
  }
}
throw new Error(`No runId is available for ${datePart}: 999 Runs already exist for that date.`);
```

- **taskId 반영 여부**: 여전히 반영하지 않는다. runId는 `YYYY-MM-DD_NNN`으로 날짜+순번이다. 그러나 이제 id 유일성이 taskId가 아니라 **디렉터리 생성의 원자성**으로 보장되므로, 동일 runId가 두 Run에 배정되는 일은 구조적으로 불가능하다. 서로 다른 Task가 동시에 도는 경우(락이 겹치지 않는 경우)도 여기서 막힌다.
- **`mkdir(recursive: true)`가 충돌을 삼키는 문제**: 해소됐다. `recursive` 인자가 없으므로 `EEXIST`가 그대로 올라오고, 코드가 그것을 다음 후보로 넘어가는 신호로 쓴다.
- 999 소진은 조용히 덮어쓰지 않고 명시적으로 실패한다.

---

## (B) 테스트 검증 — 통과

`test/defect-repro.test.ts`에 3개의 재현 테스트가 있고, 모두 `npm test`에서 통과한다.

| 테스트 | 위치 | 검증 내용 |
|---|---|---|
| "concurrent runs of one task do not share a runId" | `:220-293` | 같은 Task를 8중 동시 실행 × 3 trial. 시작된 Run 수 = 서로 다른 runId 수 = Run Trace 디렉터리 수. 시작하지 못한 Run은 `/already in progress/`로 사유를 대야 한다 |
| "a stale run lock blocks, names its holder, and is never broken automatically" | `:297-380` | holder를 명시한 거부, 파싱 불가 락도 차단, `breakRunLock` 왕복, 성공·실패 양쪽에서 해제 |
| "concurrent runs of different tasks do not share a runId" | `:388-451` | 서로 다른 8개 Task 동시 실행 × 3 trial. 8개 모두 시작 + 8개 서로 다른 runId + 8개 디렉터리 |

**이 테스트들은 "일부러 실패하는 테스트를 먼저 쓴다"는 규율을 지켰다.** 파일 헤더(`:1-18`)가 수정 전 측정값을 남긴다:

```
N=2   0/20 and 2/10 collisions across two separate measurements
N=3   5/20      N=4  10/20      N=6  14/20
N=8  20/20 and 39/40 across two separate measurements
```

동시성 폭을 8로 정한 근거(39/40에서 3 trial이면 결함 존재 시 통과 확률 약 10만분의 2)와 비용(1 trial 약 725ms)까지 적혀 있다. 세 번째 테스트(`:382-387` 주석)는 "락만으로는 같은 Task 케이스에서 id 도출 경로가 아예 실행되지 않아 아무것도 고정하지 못한다"는 점을 스스로 짚고 그 절반을 메운다.

이 항목은 이번 감사에서 확인한 것 중 **검증 품질이 가장 높다.**

---

## (C) 반증 시도 — 우회 1건

### C-1. `status: DONE` Task의 순차 재실행 — 여전히 경고뿐

`src/task.ts:76-81`

```ts
if (typeof value.status === "string" && !TASK_STATUSES.has(value.status)) {
  errors.push(`status must be one of: ${Array.from(TASK_STATUSES).join(", ")}.`);
}
if (value.status !== "READY") {
  warnings.push("Task status is not READY. The run command will still execute it.");
}
```

`src/task.ts:18-21`의 `loadTask`는 `validation.errors`만 보고 던지며 `warnings`는 반환값에 싣지도 않는다. 2026-08-10과 **바이트 단위로 동일한 상태**다.

Run 완료 후 Task status를 갱신하는 코드도 여전히 없다(`run.ts`에서 task.yaml 쓰기는 `run.ts:444`의 스냅샷 복사뿐). 승인은 파일 해시가 그대로면 계속 유효하므로 같은 Task를 몇 번이든 다시 실행할 수 있다.

**다만 우선순위 판단은 그대로 두었다.** 2026-08-10 문서 04의 권고에서 이 항목의 해법은 P2로 분류돼 있었고("Run 완료 시 Task status 전이를 원장 이벤트로 남기고 ... 명시적 플래그를 요구한다"), 실제 피해는 동시 실행 쪽이 압도적이다. 동시 실행 축은 해소됐다.

### C-2. 확인했으나 우회로 성립하지 않은 것

| 시도 | 결과 |
|---|---|
| 두 프로세스가 같은 runId를 얻는가 | 불가. `mkdir` 비-recursive가 원자적 예약 (`run.ts:1882`) |
| 락을 우회해 `executeRun`을 직접 부를 수 있는가 | `executeRun`은 `export`되지 않는다(`run.ts:330`). 외부 진입점은 `runTask` 하나 |
| CLI에 락을 건너뛰는 경로가 있는가 | 없음. `src/cli.ts:89`가 유일한 `runTask` 호출 |
| 락 파일이 깨져 있으면 통과하는가 | 통과하지 않는다. 파싱 실패 시 holder를 `null`로 두고 **차단은 유지**한다 (`run.ts:224-231` 주석, `:321-328`) |

---

## 권고

1. **P1** — Run 완료 시 Task status 전이를 원장 이벤트로 남기고, 이미 `DONE`인 Task의 재실행에 명시적 플래그를 요구한다. 현재 `status`는 형식만 검사되는 장식 필드다.
2. **P2** — `loadTask`가 `warnings`를 버리지 않고 호출부로 올려보낸다. 지금은 경고를 낼 코드는 있는데 그 경고가 어디에도 도달하지 않는다 — 검사 결과가 조용히 사라지는 형태이므로, 이 코드베이스의 "0건 스캔은 통과가 아니다" 규율과 어긋난다.
