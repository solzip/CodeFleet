# 두 번 "미검증"으로 넘긴 버전은 검증 가능했다 — 도구가 조용히 자르고 있었다

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-18 16:20 (KST) |
| 대상 커밋 해시 | `da6eabb` (작업 시점 HEAD = `origin/main`) |
| 작업 유형 | **감사** (판정. 문서 무변경, 기록만 추가) |
| 선행 문서 | `docs/runs/2026-08-18/archive-banner.md` §B, `docs/runs/2026-08-18/license-badge-claim.md` |
| 번호 실측 최대값 | **P0-17 / P1-61** (`grep -rhoE "P[01]-[0-9]+" docs` 실측. `P0-17`은 미사용 등재 ID). **신규 등재 없음** |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0** |

---

## 왜 이 작업을 했나

표지 배너의 `v2.1.49`가 두 실행 기록에 걸쳐 **미해소[미검증]**으로 이월돼 있었다.
근거는 "공개 CHANGELOG가 그 버전 앞에서 잘린다"였다. 다시 재보라는 지시를 받고 쟀더니
**잘린 것은 CHANGELOG가 아니라 그것을 읽던 도구였다.**

## A. 왜 처음에 못 쟀나 — 도구가 본 범위를 보고하지 않았다

| | 처음 (WebFetch) | 이번 (curl) |
| --- | --- | --- |
| 수신 범위 | `2.1.234` ~ `2.1.203` | **전문** |
| 바이트 | 미보고 | **521,601** |
| 버전 헤딩 | 미보고 | **366** (`2.1.234` ~ `0.2.21`) |
| `2.1.49` | "존재하지 않는다" | **있다** |

WebFetch는 페이지를 작은 모델로 요약해 돌려주고, 길면 **`[Content truncated due to length...]`로
잘린다.** 그 응답은 "이 문서에 2.1.4x는 없다"고 말했고, 나는 그것을 **문서에 없다**로 기록했다.
실제로는 **도구가 거기까지 안 읽었다**는 뜻이었다.

**이 저장소가 결론 7번으로 적어 둔 바로 그 모양이다** — *다 봤는데 없다*와 *내가 본 범위에는
없다*가 같은 값으로 수렴했다. `violations: []` 하나가 두 사실을 동시에 뜻하던 것과 구조가 같다.
차이는 이번엔 그 검사기가 이 저장소 것이 아니라 내가 쓴 외부 도구였다는 것뿐이다.
**도구가 분모를 보고했다면 첫 판정에서 잡혔다.**

## B. 판정 — `v2.1.49` 확인됨

```
## 2.1.49

- Added `--worktree` (`-w`) flag to start Claude in an isolated git worktree
- Subagents support `isolation: "worktree"` for working in a temporary git worktree
```

배너가 말하는 **전제 1의 무효화**가 정확히 이것이다. 이어지는 판이 정리 쪽을 채운다.

```
## 2.1.50

- Added `WorktreeCreate` and `WorktreeRemove` hook events, enabling custom VCS
  setup and teardown when agent worktree isolation creates or removes worktrees.
- Added support for `isolation: worktree` in agent definitions, allowing agents
  to declaratively run in isolated git worktrees.
```

**더 앞 버전의 worktree 언급은 반례가 아니다.** `2.1.47`·`2.1.19`·`1.0.120`에도 worktree가
나오지만 전부 **사용자가 이미 만들어 둔 worktree 안에서 도는 문제의 fix**다 — 드라이브 문자
대소문자, 에이전트·스킬 탐색, 원격 URL 해석. **Claude가 worktree를 스스로 만드는 것**을
`Added`로 적은 최초 판이 `2.1.49`이고, 만들고 **치우는** 것에 훅이 붙은 것이 `2.1.50`이다.
배너가 "생성·정리를 직접 구현해야 한다 → 하네스가 네이티브 지원"이라고 적은 그대로다.

## C. 표지는 고치지 않는다

문장이 맞다. 고칠 것은 **문장이 아니라 그 문장에 붙어 있던 판정**이다.

| | 전 | 후 |
| --- | --- | --- |
| `v2.1.49` 판정 | **[미검증]** | **[확인됨]** |
| `README.md` 배너 | 무변경 | 무변경 |
| `README.en.md` 배너 | 무변경 | 무변경 |

## D. 정정 대상 — 원 문서는 고치지 않았다

`docs/CONVENTIONS.md:61`대로, 두 원 기록의 미해소 절은 그대로 두고 **이 문서가 정정을 보유한다.**

| | 위치 | 그 문서가 적은 것 | 지금 |
| --- | --- | --- | --- |
| 1 | `docs/runs/2026-08-18/archive-banner.md` §B·미해소 | "공개 CHANGELOG는 잘려 확인 못 했다" | **해소** — 잘린 것은 도구였다 |
| 2 | `docs/runs/2026-08-18/license-badge-claim.md` 미해소 | "이번에 열었을 때도 여전히 그 버전 앞에서 잘린다" | **해소** — 같은 원인 |

두 문서가 적은 것은 **그 시점에 그 도구로 관측한 사실**이라 틀리지 않았다. 틀린 것은 거기서
"확인 불가"를 결론으로 끌어낸 쪽이고, 그 결론을 여기서 뒤집는다.

## 결론

`v2.1.49`는 **확인됐다** — `--worktree` 플래그와 서브에이전트 worktree 격리를 그 판이 처음 추가했고,
생성·정리 훅은 `2.1.50`이다. 두 기록이 "검증 불가"라고 적은 근거는 CHANGELOG가 아니라 **그것을
읽던 도구가 조용히 잘린 것**이었다. 표지 문장은 맞으므로 고치지 않고, 판정만 옮겼다.

## 다음 작업

없음. 재archive로 다시 읽기 전용이 된다.

## 미해소로 남긴 것

1. **저장소 밖의 사실을 지키는 검사기는 여전히 없다.** `license-badge-claim.md`의 미해소 1번과
   같은 것이고, 이번 건도 검사기가 아니라 지시자가 되물어서 잡혔다. **두 번 연속이다.**
2. **재archive 결과는 이 문서 안에 없다.** `docs/runs/2026-08-18/public-and-archive.md` §B와 같은
   구조적 한계다.
