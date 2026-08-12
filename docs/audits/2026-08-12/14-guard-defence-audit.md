# 14 — 게이트 방어 감사 (S7 재검토)

```text
작성 일시   : 2026-08-12
기준 커밋   : c325dec (S7 완료 시점)
대상        : S1~S7이 만든 게이트 9개 + 2026-08-11의 P0 게이트 7개
방법        : 각 게이트를 코드에서 **끄고** 전체 스위트를 돌린다.
             아무 테스트도 실패하지 않으면 그 게이트에는 방어가 없다 —
             항상 null을 반환하는 가드와 구별되지 않는다.
동기        : 13-system-review.md는 내가 작업 직후에 쓴 보고서다.
             불변식이 성립하는지는 확인했지만, **그 성립을 무엇이 지키는지**는
             확인하지 않았다.
```

## 0. 왜 이 감사가 따로 필요했나

`13-system-review.md`는 불변식 13개가 HEAD에서 성립함을 반증으로 확인했다.
그러나 "지금 성립한다"와 "깨지면 알아차린다"는 다른 질문이다. CLAUDE.md의 규칙이
그것을 이미 말하고 있다:

> A guard that always returns null looks exactly like a guard that works.

S1~S7은 3467줄을 바꿨다. 그중 게이트가 몇 개고, 각각을 무엇이 지키는지는
세어본 적이 없었다.

## 1. 방법

게이트마다 조건문을 `if (false && ...)` 로 바꾸거나 함수를 무력화하고 `npm test`를
돌린 뒤, **실패한 테스트 이름을 수집**하고 원본을 복구한다. 16개 게이트를
각각 한 번씩 껐다.

이 방법 자체의 반증: 게이트를 껐는데 스위트가 그대로 초록이면, 그 게이트는
테스트가 아니라 **주장**이다.

## 2. 결과 — 새 게이트 9개

| 게이트 | 잡아낸 테스트 수 |
|---|---|
| S1-1 승인 대상에 가드레일 포함 | 4 |
| S1-2 계약 안의 `status` 거부 | 1 |
| S1-3 계약 실행 가능성 | 2 |
| S2 Revision 산출물 읽을 때 재해시 | 1 |
| S3-1b attach 승계 검사 | 2 |
| S3-1c attach가 Task 원장과 대조 | 1 |
| S3-1 relation 게이트 | 2 |
| S5 apply 충돌 감지 | 1 |
| S6-4 cmd 메타문자 심사 | 1 |
| **S5 apply가 수용된 리뷰를 요구** | **0 ← 구멍** |

### 부수 결과 — 잘못된 이유로 통과하는 테스트는 없다

relation 게이트를 껐을 때 실패한 테스트는 **2개뿐**이고 둘 다 그 게이트 자신의
테스트였다. 나머지 248개는 게이트와 무관하게 통과한다.

S3에서 테스트 파일 13개를 기계적으로 수정하고 `permitRun` 37곳을 삽입했으므로,
거부를 단언하는 테스트가 **의도한 이유 대신 relation 게이트 때문에** 통과할
위험이 실재했다. CLAUDE.md가 기록한 과거 사고와 같은 종류다. 그런 테스트는 없다.

## 3. 결함 1 — apply의 ACCEPTED 검사에 방어가 없다

`src/apply.ts`의 `decision.decision !== "ACCEPTED"` 분기를 없애도 스위트가 초록이다.

### 왜 아무도 잡지 못했나

`test/apply.test.ts`에 내가 이렇게 적어 뒀다:

> A REJECTED review produces a DEGRADED_RECORDED local decision, which import
> refuses outright — the Objective ledger only ever holds decisions that were
> effective.

**이 서술은 일반적으로 참이 아니다.** `deriveLocalReviewStatus`(`review.ts:604`)를
읽으면:

```text
decision !== ACCEPTED 이고 bundleStatus === "DEGRADED"  -> DEGRADED_RECORDED
decision !== ACCEPTED 이고 bundleStatus !== "DEGRADED"  -> MIGRATION_READY   ← import 통과
```

즉 **번들이 degraded가 아니면 REJECTED도 import된다.** 내가 픽스처 하나에서
관측한 것을 모델의 성질로 일반화했다.

### 그런데 왜 오늘은 재현되지 않는가

도달 가능한 설정을 전수로 시도했다:

| harnessMode / role | mode | 결과 |
|---|---|---|
| WORKSPACE_EDIT / BACKEND_IMPLEMENTER | dry-run | `DEGRADED_RECORDED` |
| COMMAND_EXEC / INFRA_OPERATOR (degraded 허용) | execute | `DEGRADED_RECORDED` |

`mode`는 `harnessMode === "COMMAND_EXEC"`일 때만 `execute`이고(`config.ts:78`),
그 경우 harness-visible command channel이 없으므로
`COMMAND_CHANNEL_NOT_HARNESS_VISIBLE` 갭이 반드시 생긴다. 결과적으로
**이 빌드의 모든 Run은 갭을 최소 1개 갖고, 모든 번들이 degraded다.**

따라서 오늘 이 분기는 **도달 불가능한 방어 코드**다.

### 그래서 이것이 왜 결함인가

harness-visible command channel이 생기는 순간 — 그것이 `CAPABILITY_GAP`이
존재하는 이유이므로 언젠가 생긴다 — 다음이 성립한다:

1. 갭 없는 번들이 가능해진다
2. REJECTED 리뷰가 `MIGRATION_READY`가 되어 Objective 원장에 들어간다
3. **거부된 Run의 변경이 워크스페이스에 반영되는 것을 막는 유일한 방어가
   이 테스트되지 않은 분기가 된다**

지금 고치는 비용은 테스트 1개고, 그때 발견하면 비용은 워크스페이스다.

### 수정

- 테스트 주석의 틀린 일반화를 **정정했다** — 이유가 "REJECTED는 import 불가"가
  아니라 "이 빌드의 모든 Run이 degraded"임을 적었다
- 원장의 결정을 직접 `REJECTED`로 바꿔서 그 분기에 도달하는 회귀를 추가했다.
  원장을 직접 고치는 것이 **지금 그 분기에 도달하는 유일한 방법**이라는 사실도
  테스트에 적혀 있다
- 재측정: 이 게이트를 끄면 이제 1개가 잡는다

## 4. 결함 2 — P0-7의 방어에 구멍

2026-08-11의 P0 게이트 7개도 같은 방법으로 측정했다.

| P0 게이트 | 잡아낸 테스트 수 |
|---|---|
| P0-1 git 자식 프로세스 env 허용목록 | 1 |
| P0-3 Run 락 배타성 | 1 |
| P0-6 절단 = EVIDENCE_DEFECT | 4 |
| **P0-7 증거를 에이전트가 실행한 곳에서 수집** | **0 ← 구멍** |
| P0-9 읽을 수 없는 Objective 원장이 전면 차단 | 1 |
| P0-10 검증 커맨드가 상한 있는 러너를 통과 | 2 |
| P0-11 생성 파일 내용이 diff에 포함 | 27 |

POST_RUN 스냅샷의 관측 경로를 격리 트리에서 워크스페이스로 되돌려도 스위트가
초록이다. 실제로 무슨 일이 벌어지는지 측정했다:

```text
preRun  workingDirectoryRealPath : ...\codefleet-worktree-PfgrUB\2026-08-12_001
postRun workingDirectoryRealPath : ...\s7-p0-7-Erati2
same path?                       : false
```

**서로 다른 두 디렉터리를 비교한 것이 delta로 보고된다.**

### 왜 기존 테스트가 잡지 못했나

`an isolated Run observes the tree the agent actually ran in`이
`workspaceDelta.modified`에 `src/app.js`가 있는지 단언한다. 회귀 상태에서도
delta가 비지 않아 그 단언이 통과했다 — **하부 증상이 다른 이유로 충족될 수
있었다.**

### 수정

증상이 아니라 불변식을 직접 고정했다:

```text
preRun.workingDirectoryRealPath === postRun.workingDirectoryRealPath
postRun.workingDirectoryRealPath !== selectedWorkspaceRootRealPath
```

회귀를 다시 넣으면 `a delta between two different directories is not a delta`로
실패한다. 확인함.

## 5. 측정값

| 항목 | 감사 전 | 감사 후 |
|---|---|---|
| 테스트 | 250 통과 / 0 실패 | **251 통과 / 0 실패** |
| 게이트 방어 (신규 9개) | 8 / 9 | **9 / 9** |
| 게이트 방어 (P0 7개) | 6 / 7 | **7 / 7** |
| rule 커버리지 | 345/545 (63.3%) | 345/545 (63.3%) |

**16개 게이트 중 2개가 무방비였고, 둘 다 방어를 추가했다.**

## 6. 이 감사가 확인한 것과 하지 않은 것

**확인함**
- 새 게이트 9개, 옛 P0 게이트 7개 각각을 무엇이 지키는지 (전수)
- 거부 단언 21개가 relation 게이트에 잘못 기대고 있지 않음
- `13-system-review.md`의 불변식 판정 자체는 유효 — 이 감사는 그것을 뒤집지 않는다

**하지 않음**
- `apply.ts` / `task-revision.ts` / `task-events.ts` 신규 3개 모듈의 **코드 리뷰**.
  게이트 단위로만 봤고 그 밖의 로직(경로 처리, 에러 분기, 동시성)은 읽지 않았다
- 슬라이스 상호작용 전수 (S1×S4, S3×S5 등)
- 플랫폼 자격 재측정 (win32에서만 돌렸다)
- 새 코드의 FINAL RULE 대응 분류 — 여전히 미측정이며 추정하지 않는다

세 번째 항목까지 하려면 감사를 한 번 더 돌려야 한다. 이번 범위는
**게이트 방어**였고 그것은 전수로 끝냈다.
