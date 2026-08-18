# 표지가 말하는 상태와 플랫폼이 말하는 상태를 맞췄다 — 공개, 그리고 읽기 전용

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-18 15:25 (KST) |
| 대상 커밋 해시 | `8aa9b21` (작업 시점 HEAD = `origin/main`) |
| 작업 유형 | **실행** (GitHub 저장소 설정 변경. 트리 내용 무변경) |
| 선행 문서 | `docs/runs/2026-08-18/archive-banner.md`, `docs/archive/2026-08-13/ARCHIVE.md`, `CLAUDE.md` §Publication constraints |
| 번호 실측 최대값 | **P0-17 / P1-61** (`grep -rhoE "P[01]-[0-9]+" docs` 실측. `P0-17`은 미사용 등재 ID). **신규 등재 없음** |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0** |

---

## 왜 이 작업을 했나

두 표지는 2026-08-13부터 **아카이브됐고 이슈와 PR을 받지 않는다**고 말해 왔고,
`CLAUDE.md` §Publication constraints는 **"This repository is public"**을 전제로 세 가지
결정(실명 부재·소스 공개 비오픈소스·단일 아이덴티티)을 걸어 두었다. 그런데 플랫폼의 실제
상태는 그렇지 않았다.

| | 문서가 말하던 것 | 플랫폼의 실제 상태 |
| --- | --- | --- |
| 공개 여부 | 공개된 기록 | `PRIVATE` |
| 활성 여부 | 아카이브, 이슈·PR 안 받음 | `isArchived: false` — 누구나 푸시·이슈 가능한 활성 저장소 |

**산문이 주장하고 실측이 반박하는 상태**였다. 이 저장소가 가장 무겁게 등급하는 결함 모양이
그것이라, 산문을 낮추는 대신 상태를 산문에 맞췄다.

## A. 공개 전 실측 — 무엇이 밖으로 나가는지 먼저 셌다

되돌리기 어려운 방향이라 켜기 전에 쟀다. 히스토리 재작성이 지운 것이 원격에 남아 있는지가
핵심이었다.

| 검사 | 실측 | 명령 |
| --- | --- | --- |
| 원격 ref | **`refs/heads/main` 하나** (`HEAD` 포함 둘) | `git ls-remote origin` |
| 태그 | **0** | `git ls-remote --tags origin` |
| `origin/main` 커밋 수 | **209** | `git rev-list --count origin/main` |
| 저자·커미터 조합 | **`sol <solarchive.dev@gmail.com>` 하나** | `git log origin/main --format="%an <%ae>\|%cn <%ce>" \| sort -u` |
| 재작성 이전 주소가 추적 내용에 | **0건** | `git grep -In -i "naver\.com" origin/main` |
| `.codefleet/` 추적 | **0** | `git ls-tree -r --name-only origin/main` |
| 시크릿 패턴 | **2건, 둘 다 오탐** | `git grep -InE "(ghp_\|github_pat_\|sk-…\|AKIA…\|BEGIN …PRIVATE)"` |

시크릿 두 건은 `src/profile.ts`의 **탐지기 자신의 정규식**과 `test/profile.test.ts`의 **가짜
토큰 픽스처**다. 실제 자격증명이 아니다.

**이 표의 넷째 줄이 이 작업의 전제였다.** 재작성 이전 아이덴티티를 가진 커밋이 원격에 하나라도
있으면 공개는 그것을 영구히 노출시킨다. `origin/main`에서 나오는 조합은 하나뿐이었다.

## B. 순서 — 아카이브가 마지막이어야 하는 이유

아카이브된 저장소는 **읽기 전용**이다. 푸시도, 이슈·PR도, 설정 변경도 막힌다. 공개 전환 역시
설정 변경이므로 **아카이브 뒤에는 할 수 없다.** 따라서 순서가 강제된다.

```
1. 공개 전 실측            §A
2. PRIVATE → PUBLIC        확인: visibility PUBLIC / isArchived false
3. 이 기록을 커밋하고 푸시   ← 여기까지가 쓰기가 가능한 마지막 지점
4. 아카이브 (읽기 전용)     되돌리려면 unarchive
```

**그래서 이 문서는 자기가 기록하는 마지막 행위를 담을 수 없다.** 3에서 밀린 뒤 4가 일어나므로,
`isArchived: true`라는 실측은 이 저장소 안에 존재할 자리가 없다. 추정으로 채우지 않고
**구조적으로 담기지 않는다는 사실을 여기 값으로 적는다.** 확인은 저장소 밖에 있다 —
`gh repo view solzip/CodeFleet --json isArchived`.

## C. 실측 전후

| | 전 | 후 |
| --- | --- | --- |
| `visibility` | `PRIVATE` | **`PUBLIC`** (실측 완료) |
| `isArchived` | `false` | **`true`** (§B의 4단계. 이 문서가 확인할 수 없는 유일한 칸) |
| `defaultBranchRef` | `main` | 변동 없음 |
| `licenseInfo.key` | `other` | 변동 없음 — 표준 라이선스가 아닌 것이 의도다 |
| description | "Source-available, not open source." | 변동 없음 |
| 원격 ref 수 | 하나 | 변동 없음 |
| `npm test` 종료 코드 | 0 | 0 |

라이선스 칸이 `other`로 남는 것과 GitHub 사이드바에 배지가 뜨지 않는 것은 두 표지가 이미
설명해 둔 그대로다. 공개로 바뀌었다고 고칠 것이 아니다.

## D. 아카이브가 부수적으로 막는 것

`CLAUDE.md` §Publication constraints가 경고하는 사고 하나가 여기서 구조적으로 닫힌다.
로컬 `main` 브랜치(`0403b1c`)는 재작성 **이전** 아이덴티티를 가진 커밋 128개를 아직 들고 있고,
거기서 푸시하면 서버 히스토리가 두 저자 상태로 돌아간다. 아카이브된 저장소는 푸시를 받지
않으므로 그 경로가 막힌다.

**다만 이것은 예방이지 제거가 아니다.** unarchive하면 그대로 되살아난다. 로컬 브랜치는
그대로 두었다 — 보존이 목적인 브랜치이고, 지우는 것은 이 작업의 범위가 아니다.

## 결론

플랫폼 상태를 표지의 주장에 맞췄다 — `PRIVATE` → `PUBLIC`, 이어서 읽기 전용으로 아카이브.
공개 전에 원격을 실측해 재작성 이전 아이덴티티가 0건, 태그 0, 실제 시크릿 0임을 확인하고 켰다.
아카이브가 마지막 행위라, `isArchived: true`의 확인만은 이 저장소 밖에 있다(§B).

## 다음 작업

없음. 저장소는 읽기 전용이다.

## 미해소로 남긴 것

1. **아카이브 상태의 사후 확인이 이 저장소 안에 없다.** §B의 구조적 결과다. 밖에서
   `gh repo view solzip/CodeFleet --json isArchived`로 잰다.
2. **로컬 `main`의 재작성 이전 커밋 128개.** §D. 아카이브가 경로를 막을 뿐 제거하지 않는다.
3. **`v2.1.49` 미검증.** `docs/runs/2026-08-18/archive-banner.md` §B에서 이월. 아카이브 이후에는
   고칠 수단이 없으므로 미검증인 채로 공개된다.
