# 3단계 · 4단계 — 큐 게이트 fail-open과 상한의 표면화 (P0-9 · P0-6 잔여)

```text
수정 일시   : 2026-08-12
대상 커밋   : 6a458eb (2단계까지 반영·푸시 완료된 origin/main)
근거 문서   : docs/audits/2026-08-11/02-p0-2-objective-queue.md §C-2
             docs/audits/2026-08-11/07-new-defects.md P0-9
             docs/audits/2026-08-11/06-p0-6-limits.md §C-2
             docs/audits/2026-08-11/fixes/stage2-process-boundaries.md
범위        : P1-13/17/18/19 수정, P0-11 추가 개선, 반영(ACCEPTED merge) 설계는
             범위 밖.
측정 근거   : npm test — 착수 전 212 pass / 0 fail
                        완료 후 216 pass / 0 fail (신규 4건)
             coverage — 63.3% (345/545), 전후 동일
             임시 트리 누수 — 전량 삭제 후 npm test 1회, 0 → 0
```

## 착수 전 게이트 — 3항목 통과

```
ℹ tests 212
ℹ pass 212
ℹ fail 0
temp trees before=0 after=0

$ grep -rn "spawn(" src/ | grep -v spawnSync
src/agent.ts:252:    const child = spawn(command, args, {

test/process-boundaries.test.ts:260  "a Run whose diff was cut off cannot be accepted, even with the reason waived"
test/process-boundaries.test.ts:356  /evidence defect cannot be waived: EVIDENCE_TRUNCATED:GIT_DIFF/
```

---

## 1. 작업 1 — P0-9: 큐 게이트 fail-open

### 1-1. 수정 전 실패 출력

```
✖ a ledger that cannot be replayed blocks the Run instead of reading as permission (44.023ms)
  AssertionError: the objective whose ledger failed has to be named
    actual: 'null', expected: /auth/, operator: 'match'
      at TestContext.<anonymous> (.../test/isolation.test.ts:843:10)

✖ an objectives directory that cannot be listed blocks the Run; an absent one does not (305.1773ms)
  AssertionError: Missing expected rejection: an unreadable objectives directory must
                  not resolve to no opinion
    actual: undefined, expected: /objectives/i, operator: 'rejects'
      at async TestContext.<anonymous> (.../test/isolation.test.ts:870:3)
```

두 fixture 모두 그 직전에 `QUEUE_ITEM_CANCELED`로 차단된 Task를 쓴다. 첫 번째는 `ledger.jsonl`을 깨뜨리고, 두 번째는 `objectives`가 있어야 할 자리에 파일을 놓아 `readdir`이 `ENOTDIR`로 실패하게 한다. 디렉터리 권한을 조작하는 방식은 플랫폼마다 달라 재현이 흔들리므로, 어느 OS에서나 같은 부류의 오류를 내는 방법을 골랐다.

### 1-2. 수정

`src/run.ts` `blockedQueueReason`:

1. `replayStatus !== "COMPLETE"` 판정을 `items.length === 0` 분기 **앞으로** 옮겼다. 원장이 파싱되지 않으면 큐가 비므로, 뒤에 있던 검사는 자기가 쓰인 그 상황에서만 실행되지 않았다.
2. `readdir`의 `catch`를 `ENOENT`에 한정했다. 그 외 오류는 사유를 담아 던진다.

### 1-3. 차단 범위 결정 — **전면 차단**

지시가 확인을 요구한 지점이다. 파손된 원장이 하나 있으면 **그 Objective와 무관해 보이는 Task까지 전부 막힌다.**

**그렇게 정한 근거.** 원장을 읽을 수 없다는 것은 "그 Objective가 이 Task에 대해 무슨 결정을 갖고 있는지 모른다"는 뜻이다. 범위를 좁히려면 파손된 원장에서 "이 Task는 언급되지 않았다"를 읽어내야 하는데, 그것은 **믿을 수 없다고 판정한 파일을 근거로 쓰는 것**이고 이 결함의 원인과 같은 실수다. 부분 파싱도 마찬가지다 — 50번째 줄이 깨졌다면 1~49줄로 만든 큐는 비어 있지 않을 수 있고, 그 큐가 완전하다는 보장이 없다. 그래서 `replayStatus`가 `COMPLETE`가 아니면 큐 내용을 **보지 않고** 막는다.

**대가를 인정한다.** Objective 10개 중 1개가 깨지면 그 워크스페이스에서 아무 Task도 돌지 않는다. 그래서 거부 메시지가 세 가지를 담는다 — 전면 차단이라는 사실, 그 판단의 이유, 그리고 해제 방법:

```
Run is blocked: the ledger of Objective auth replayed as BLOCKED, so its queue
decisions cannot be read.
An Objective that cannot be replayed may hold a decision about any Task, so no Task
runs while one is unreadable. This is deliberate: the alternative is running work
somebody stopped in writing.
  - LEDGER_JSONL_PARSE: line 1 is not valid JSON

Repair or restore .codefleet/objectives/auth/ledger.jsonl, then run
'codefleet objective status auth' to confirm the replay is COMPLETE.
```

finding을 최대 5건까지 함께 낸다. 어느 줄이 깨졌는지 모르면 "복구하라"는 지시가 실행 불가능하기 때문이다.

**닫지 않은 구멍 하나를 적어 둔다.** Objective 디렉터리를 **통째로 지우면** 그 결정들이 사라지고 Run은 통과한다. 이것은 게이트가 막을 수 있는 종류가 아니라 원장 자체의 소실이고, 이 설계는 원장을 사실의 출처로 두므로 run.ts에서 방어할 수 있는 지점이 없다. 디렉터리가 **없는** 것과 **읽히지 않는** 것을 구분한 이번 수정은 후자만 다룬다.

---

## 2. 작업 2 — scanScope 표면화

### 2-1. 수정 전 실패 출력

```
✖ every process the Run started reports its ceiling, its usage, and what was dropped (767.3446ms)
  AssertionError: adapter-result.json must carry the adapter's scanScope
    actual: undefined, expected: true
      at TestContext.<anonymous> (.../test/process-boundaries.test.ts:388:10)

✖ a limit nobody measured is not reported as a limit nothing hit (633.235ms)
  TypeError: Cannot read properties of undefined (reading 'adapter')
      at TestContext.<anonymous> (.../test/process-boundaries.test.ts:472:23)
```

### 2-2. 표면화 주체 전수와 구현 여부

2단계에서 상한을 적용받는 주체가 1개에서 4개로 늘었으므로 전수를 다시 세었다.

| 주체 | 적용된 상한 | 실제 사용량 | 잘린 바이트 | 산출물 | run-record |
|---|---|---|---|---|---|
| 어댑터 | `timeoutMs` / `outputCapBytes` | stdout·stderr 바이트 | stdout·stderr 각각 | **`adapter-result.json.scanScope`** + `harness-observation.json` `resourceLimits.adapter` | ✔ |
| 검증 커맨드 | `timeoutMs` / `outputCapBytes` | attempt별 `outputBytes` 합 | attempt별 합, 잘린 커맨드 수, 타임아웃 수 | 각 attempt의 `scanScope` + `resourceLimits.verification` | ✔ |
| 증거 git 호출 | `timeoutMs` / `outputCapBytes` | 호출 수 · 총 바이트 | 총 바이트, 잘린 호출 수, 타임아웃 수 | `resourceLimits.gitEvidence` | ✔ |
| `--no-index` 루프 | 파일당 · Run당 바이트 상한 + 60초 예산 | 담은 바이트 · 파일 수 | 담기지 못한 파일 수 | `changes.newFileCapture` + `resourceLimits.newFileCapture` | ✔ |

4개 주체 전부 구현했다. 빠뜨린 주체는 없다.

git 호출의 사용량을 세려면 Run마다 누적기가 필요했다. 모듈 전역에 두면 한 프로세스에서 두 Run이 서로의 숫자를 보고하게 되므로(테스트가 병렬로 돈다), `executeRun`이 `ProcessUsage` 하나를 만들어 `gitEvidenceRunner`에 묶어 넘긴다. `captureGitDiff` · `captureUntrackedFiles` · `captureGitChangedFiles` · `captureNewFileContent` · 워크스페이스 스냅샷이 전부 그 러너를 받는다.

### 2-3. "잘리지 않음"과 "계측 없음"의 구분

지시의 핵심 요구다. 각 주체에 `measured` 불린을 두고, `measured: false`일 때는 **상한을 `null`로** 둔다 — 아무도 대조하지 않은 한계를 숫자로 적으면 검사가 있었다고 주장하게 된다. 사유도 함께 적는다(`ADAPTER_PROCESS_NOT_STARTED`, `NO_VERIFICATION_COMMAND_EXECUTED`, `NO_GIT_EVIDENCE_CALL_MADE`).

1b단계에서 `holderAlive`를 `false`로 초기화해 "모름"을 "안전"으로 읽은 실수를 반복하지 않으려고, `measured`는 실제 호출이 일어났을 때만 `true`가 된다.

### 2-4. 실제 출력

위치는 `## What changed` **앞**이다. 뒤에 두면 독자가 증거를 다 읽은 뒤에 그것이 부분적이었음을 알게 된다.

```
## What the limits did

```text
adapter       limit 1800000 ms / 16777216 B   used 5 B   truncated 0 B
verification  limit 600000 ms / 4194304 B   used 4194304 B   truncated 5000 B   (1 of 1 command(s) truncated, 0 timed out)
git evidence  limit 120000 ms / 33554432 B   used 949 B   truncated 0 B   (10 call(s), 0 truncated, 0 timed out)
created files limit 1048576 B per file / 8388608 B per Run / 60000 ms budget   captured 20 B   not captured 0 file(s)
```

## What changed

- src/app.js
- src/made.js
```

계측이 없는 Run(dry-run, 검증 커맨드 없음)에서는:

```
adapter       not measured: ADAPTER_PROCESS_NOT_STARTED
verification  not measured: NO_VERIFICATION_COMMAND_EXECUTED
```

`adapter-result.json`:

```json
"scanScope": {"stdoutTruncatedBytes":0,"stderrTruncatedBytes":0,"timeoutMs":1800000,"outputCapBytes":16777216}
```

---

## 3. 등재

| 항목 | 조치 |
|---|---|
| P1-17 | 2단계 실측(SIGTERM 후 `<node> forever.mjs` 잔존)을 근거로 추가. 2단계가 모든 자식을 `runCommand`로 모았으므로 이 한계도 이제 전부가 공유한다는 점을 명시 |
| P1-19 | 성격을 다시 적었다. fail-closed는 "안전하다"이지 "쓸 수 있다"가 아니며, `mvn`/`gradle` 계열은 작업 내용과 무관하게 **항상** 실패하므로 실사용 검증 전에 P1-13과 함께 해소돼야 한다 |
| `07-new-defects.md` 머리말 | P0-9 · P0-10 해소로 갱신. 이로써 P0-7 ~ P0-11 전부 해소 |

새로 발견해 등재만 한 항목은 없다. 2-4의 렌더링 확인 중 스크립트가 만든 에이전트가 문법 오류로 죽는 일이 있었으나 그것은 스크립트의 결함이고, 제품은 그 Run을 `FAILED`로, 변경 0건으로 정확히 보고했다.

---

## 4. 변경 파일

```
 docs/audits/2026-08-11/07-new-defects.md |   3 +-
 docs/audits/2026-08-11/SUMMARY.md        |  25 ++-
 src/run-record.ts                        |  74 ++++++++
 src/run.ts                               | 283 ++++++++++++++++++++++++++++---
 test/isolation.test.ts                   | 107 +++++++++++-
 test/process-boundaries.test.ts          | 121 +++++++++++++
 6 files changed, 581 insertions(+), 32 deletions(-)
```

| 파일 | 변경 |
|---|---|
| `src/run.ts` | `blockedQueueReason` 순서 교정 + `ENOENT` 한정 + 거부 메시지. `ProcessUsage` / `newProcessUsage` / `recordUsage` / `gitEvidenceRunner` / `gitEvidenceProcessRunner` 신설. 증거 git 호출 5지점이 누적기 경유. `HarnessProcessResult`가 stdout·stderr 잘림을 분리. attempt `scanScope` 확장. `adapter-result.json`에 `scanScope`. `buildResourceLimits`와 관측의 `resourceLimits` 블록 |
| `src/run-record.ts` | `renderLimitLines` 신설, "What the limits did" 절을 "What changed" 앞에 배치 |
| `test/isolation.test.ts` | P0-9 테스트 2건 |
| `test/process-boundaries.test.ts` | 표면화 테스트 2건 |
| 문서 | SUMMARY.md의 P1-17 · P1-19 상세, 07의 상태 머리말, 이 파일 |

**테스트 결과**: 216 tests, 216 pass, 0 fail. coverage 63.3%로 전후 동일 — 이 슬라이스도 FINAL RULE 조건을 새로 덮지 않으므로 클레임을 추가하지 않았다.

---

## 5. 재감사 P0의 최종 상태

| ID | 2026-08-11 재감사 | 현재 |
|---|---|---|
| P0-1 | 미해소 | env·상한 축 해소(2단계). **에이전트 명령 preflight는 미해소** — 명령 채널이 없는 한 구조적으로 불가 |
| P0-2 | 부분해소 | 해소 (3단계가 fail-open 2건을 닫음) |
| P0-3 | 부분해소 | 변화 없음. `status: DONE` 순차 재실행은 여전히 경고뿐 (P1-16) |
| P0-4 | 미해소 | 해소 (1단계) |
| P0-5 | 해소 | 유지 |
| P0-6 | 부분해소 | 해소 (2단계 상한 + 4단계 표면화) |
| P0-7 ~ P0-11 | 신규 | 전부 해소 |

남은 것은 P1이다. 그중 **P1-13과 P1-19는 실사용 검증 전에 함께 해소돼야 한다** — 지금 상태로는 `mvn`/`gradle`을 검증 커맨드로 쓰는 프로젝트에서 게이트가 통과할 수 없다.
