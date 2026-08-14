# 동결됐다고 말하지 않는 문서들

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-14 17:00 (KST) |
| 대상 커밋 해시 | `039145d` (배너 커밋. 점검은 그 직전 `5a747fd`에서 시작했다) |
| 작업 유형 | **감사 → 수정** (문서만. 실행 코드 무변경) |
| 선행 문서 | `docs/INDEX.md` §E, `docs/runs/2026-08-14/citation-and-denominator-checks.md` |
| 번호 실측 최대값 | **P0-17 / P1-61** (`grep -rhoE "P[01]-[0-9]+" docs` 실측. `P0-17`은 미사용 등재 ID). **신규 등재 없음** |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0** |

---

## 왜 이 작업을 했나

저장소를 아카이브하기 전에 `docs/`를 정리할 필요가 있는지 물었다. 답을 내려면 두 가지를 갈라야 했다 — **검사기가 잡을 수 있는 것**과 **검사기가 애초에 보지 않는 것**.

전자는 이미 다 초록이었다. 후자에서 4건이 나왔고, 그중 하나는 이 저장소가 가장 무겁게 등급하는 종류였다(`CONVENTIONS.md` §12 — 거짓 문장은 미구현보다 무겁다).

## 1. 기계 검사 — 손댈 것이 없었다

작업 전 상태다. 네 검사기 전부 실행했다.

```
npm test                    exit=0        posttest 4종 통과
check-links.mjs             exit=0        md 76 · 링크 40 · 깨짐 0 · 대소문자 0 · 앵커 0
check-doc-facts.mjs         exit=0        선언 42 · 불일치 0 · 미검사 539 (기준선 539)
check-doc-citations.mjs     exit=0        인용 250 · 살아있는 문서 깨짐 0
                                          검증불가 242 · suspect 8
git status                  clean · origin/main 과 동일
```

`INDEX.md`가 선언한 58개(감사 36 · 실행 15 · 아카이브 7)를 디스크에서 세어도 58이었다. 절대경로·실명·이메일 누출은 `grep -rniE 'C:[\\/]Users|윤솔|cys@'`로 0건.

**그래서 이 작업의 결론은 "검사기가 초록인 것과 문서가 정리된 것은 다르다"에서 시작한다.**

## 2. 발견 — 4건

### A. 동결됐는데 「계속 하는 중」이라고 말하는 문서 2개 [고침]

| 근거 | 내용 |
| --- | --- |
| `docs/session-handoff.md:3` | `Last updated: 2026-08-11 (through d66e86b)` |
| `docs/session-handoff.md:49` | `Design is complete... Implementation has resumed.` |
| `docs/design-progress.md:3` | `Last updated: 2026-08-10` |
| `docs/design-progress.md:25` | `Phase 11  진행 중  97단계 완료, 98번 진행 중` |

동결 배너가 있는 문서는 `concept-foundation.md:1`, `INDEX.md:7`, `REGISTER.md:3`, 그리고 양쪽 README다. **상태 문서 둘만 없었다.**

낡은 문서 하나였다면 그냥 낡은 문서다. 그런데 저장소 루트 `CLAUDE.md`의 절 제목이 **`## Where to resume`**이었고, 그 목록의 **1번과 2번이 정확히 이 두 파일**이었다.

```
docs/session-handoff.md               next slice, and why it is next
docs/design-progress.md               ordered design steps, current position, measured counts
```

즉 저장소의 입구가 "이어서 하라"고 말하고, 그 화살표가 가리키는 두 문서가 "다음 슬라이스는 이것"이라고 답한다. **그 경로 어디에도 동결됐다는 문장이 없다.**

`INDEX.md:150`이 이 항목을 동결 이후 **[미확인]**으로 달아두고 있었다 — "`session-handoff.md`와 `design-progress.md`가 2026-08-13 작업을 반영하는지 미확인". 이번에 확인했고, **반영돼 있지 않았다.**

### B. `INDEX.md:5`의 커밋 해시가 거짓이고, 값으로는 고칠 수 없다 [형식을 바꿈]

작업 전 문장이다.

> 작성 기준: 2026-08-14, 커밋 `8748497`(이 색인을 마지막으로 고친 커밋).

실측하면 `git log -1 -- docs/INDEX.md` → **`8d3e7ad`**. 그런데 `8d3e7ad`의 커밋 메시지가 이렇게 적고 있다.

> docs/INDEX.md said it was written against commit c448b7d. That is yesterday's last commit; the index was last changed by 8748497 and has been read as current all day.

**같은 문장이 두 번 어긋났고, 두 번째 어긋남을 만든 것은 첫 번째를 고친 커밋 자신이다.** 이 문장은 자기를 고친 커밋의 해시를 담으려 하는데, 그 해시는 문장을 고친 **다음에야** 생긴다. 값을 다시 맞춰도 그 커밋이 새 정답이 되어 또 하나 어긋난다.

수치가 아니라 **문장의 형태**가 결함이다. 그래서 값을 갱신하지 않고 해시를 문장에서 뺐다.

### C. 루트 설계 문서 9개가 어느 색인에도 없다 [미해소]

`INDEX.md:3`은 스스로 `audits/`·`runs/`·`archive/`만 다룬다고 선언한다. 그 범위 안에서는 정확하다(58 = 58, 검사기 통과). 결과적으로 `docs/` 루트의 md 14개 중 현재 문서는 4개(`concept-foundation`·`INDEX`·`REGISTER`·`CONVENTIONS`)뿐이고, 나머지 9개는 상태 표시도 색인도 없다.

`CONVENTIONS.md:127-128`이 그중 4개만 「규약 대상 아님」으로 언급한다. 나머지 5개(`architecture.md`, `architecture-spine-claude.md`, `architecture-structure-claude.md`, `review-claude.md`, `review-critical-claude.md`)는 어디에도 성격이 적혀 있지 않다.

**이번에 고치지 않았다.** 배너를 붙이는 것과 색인의 선언된 범위를 넓히는 것은 다른 작업이고, 후자는 `INDEX.md`가 무엇인지를 바꾼다.

### D. 호스트명 `DESKTOP-ENGO922`가 문서 4곳에 [고치지 않음 — 의도]

`audits/2026-08-12/04-platform-qualification.md:7`, `09-registration-check.md:107`, `SUMMARY.md:26`, `CONVENTIONS.md:79`.

전부 **존재하지 않는 파일명**(`fixes/env-DESKTOP-ENGO922.md`)의 인용이다 — 없는 문서를 근거로 든 지시를 기록한 대목이라, 이름을 지우면 그 사건이 읽히지 않는다. 공개 제약(`CLAUDE.md` §Publication constraints)이 금지하는 것은 법적 실명이고 PC 호스트명은 그 대상이 아니다. **알고 남긴다.**

## 3. 무엇을 고쳤나

### `docs/session-handoff.md` — 최상단 배너

문서 본문이 영문이라 배너도 영문으로 썼다.

```markdown
> **There is no next session. This repository was frozen on 2026-08-13.** This
> handoff was last updated on 2026-08-11 and was never brought forward. Read it
> as the state of that day, not as instructions: "Session Starter", "Progress"
> and "Current Bottleneck" below describe work that did not continue. Why it
> stopped is in `archive/2026-08-13/ARCHIVE.md`, what was open at the freeze is
> in `REGISTER.md`, and everything recorded after 2026-08-11 is in `INDEX.md`.
```

배너가 절 이름 셋을 **직접 부르는** 이유는, 이 문서에서 사람을 잘못 보내는 것이 그 셋이기 때문이다. "낡았다"만 적으면 어느 부분이 지시로 읽히는지는 여전히 독자가 판단해야 한다.

### `docs/design-progress.md` — 최상단 배너

```markdown
> **진행은 여기서 멈췄다. 이 저장소는 2026-08-13에 동결됐다.** 이 문서는
> 2026-08-10 이후 갱신되지 않았고, 「Phase 11 진행 중」은 그날의 상태지 남은
> 작업 목록이 아니다. 종료 사유는 `archive/2026-08-13/ARCHIVE.md`, 동결 시점에
> 열려 있던 것은 `REGISTER.md`, 2026-08-10 이후의 기록 전부는 `INDEX.md`에 있다.
```

### `CLAUDE.md` — 절 제목과 지도

| | before | after |
| --- | --- | --- |
| 절 제목 | `## Where to resume` | `## Where to start reading` |
| 1·2번 항목 | `session-handoff.md`, `design-progress.md` | `README.md`, `archive/2026-08-13/ARCHIVE.md` |
| 감사 요약 | `docs/audits/<date>/SUMMARY.md` | `docs/INDEX.md` |
| 상태 문서 둘 | 목록의 머리 | 목록 밖, "2026-08-11·08-10의 상태이고 갱신되지 않았다"로 |

`audits/<date>/SUMMARY.md` 줄을 뺀 이유는 **마지막 감사일에 SUMMARY가 없기 때문이다** — `INDEX.md:134`가 기록한 결함이다. 없는 파일을 입구에서 가리키느니 그 결함까지 포함해 색인하는 `INDEX.md`를 가리키는 편이 맞다. 이 삭제는 지시 범위 밖이라 별도로 확인받았다.

### `docs/INDEX.md:5` — 해시를 문장에서 뺐다

값을 고치지 않고 형태를 바꿨다. 그 이유를 문장 옆에 남겼다 — 사유 없는 규칙은 나중에 "왜 해시가 없지?"로 되돌아온다.

## 4. 검증

```
npm test > /dev/null 2>&1; echo $?     → 0
check-links.mjs                        → md 76 · 링크 깨짐 0 · 대소문자 0 · 앵커 0
check-doc-facts.mjs                    → 불일치 0
git diff --stat (039145d)              → 3 files changed, 25 insertions(+), 4 deletions(-)
```

`CLAUDE.md`·`session-handoff.md`·`design-progress.md` 셋 다 `scripts/check-doc-citations.mjs:51`의 `LIVING_DOCS`에 없다. 즉 이 배너들은 인용·수치 검사의 분모를 움직이지 않는다. **실행으로 확인했고 추정하지 않았다.**

이 문서가 더해지면서 감사·실행 기록은 51 → **52**(감사 36 · 실행 16)가 된다. `README.md`·`README.en.md`의 `audit-run-records` 앵커, `INDEX.md:5`의 `docs-indexed`·`docs-on-disk`, `ARCHIVE.md:196`의 자산 표를 함께 갱신했다 — **앵커가 갱신을 강제했고, 나는 검사기 출력을 보고 고쳤다.**

## 5. 이 결함의 성격

`LESSONS.md`의 유형과 대조하면 새로운 것이 아니다. **한 사실에 사본이 여럿이고 단일 출처가 없다** — 「이 저장소는 동결됐다」가 여섯 곳에 사본으로 있었고, 그중 셋이 갱신에서 빠졌다. 검사기 셋은 숫자·링크·인용을 보지만 **"이 문서가 아직 유효한가"는 측정 대상이 아니다.**

`README.md`의 「다시는 이렇게 안 한다」가 이미 같은 말을 적고 있다 — "고친 사람이 등재부를 안 고친다". 이번 것은 그 문장의 문서판이다. 동결을 선언한 사람이 동결을 선언하지 않은 문서를 남겼다.

---

## 결론

- 기계 검사 4종은 작업 전에 이미 전부 초록이었고, 정리가 필요한 것은 **검사기가 보지 않는 「이 문서가 아직 유효한가」** 쪽이었다.
- 동결 배너가 빠진 상태 문서 2개와, 그 둘을 「Where to resume」 1·2번으로 가리키던 `CLAUDE.md`를 고쳤다. `npm test` **종료 코드 0**.
- `INDEX.md:5`의 커밋 해시는 자기참조라 값으로 고칠 수 없어 **문장에서 제거**했다.

## 다음 작업

**없음.** C(루트 설계 문서 9개의 색인)는 착수하지 않기로 한 것이지 대기 중인 항목이 아니다 — 하려면 `INDEX.md`의 선언된 범위를 바꾸는 별건으로 시작한다.

## 미해소로 남긴 것

| 항목 | 왜 남겼나 |
| --- | --- |
| C — 루트 설계 문서 9개에 상태 표시·색인 없음 | `INDEX.md`가 스스로 선언한 범위를 넓히는 일이라 배너 작업과 성격이 다르다 |
| D — 호스트명 `DESKTOP-ENGO922` 4곳 | 없는 문서의 인용이라 지우면 사건이 안 읽힌다. 공개 제약 위반 아님 |
| `check-doc-citations.mjs`의 suspect 8건 | 각자의 대상 커밋에서 이미 틀렸던 인용이다. 오늘의 편집으로 고쳐지지 않는다 |
| 2026-08-10 감사 7편의 인용 242건 | 대상 커밋 `70fa598`이 히스토리 재작성으로 사라졌다. **영구 검증 불가** |
