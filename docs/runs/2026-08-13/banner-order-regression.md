# 배너 순서 회귀 테스트

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 15:05 (KST) |
| 대상 커밋 해시 | `21f2080` (작업 시작 시점) |
| 작업 유형 | **수정** (회귀 테스트 추가) |
| 선행 문서 | `docs/runs/2026-08-13/p1-61-prevention.md` |
| 번호 실측 최대값 | **P0-16 / P1-61** |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0** |

---

## 왜 필요했나

`21f2080`이 실패 배너를 커버리지 표 앞으로 옮겼다. 그런데 `test/rule-coverage.test.ts`는 체커의 **실패 모드**만 재현하고 **출력 순서**는 단언하지 않았다. 배너가 표 뒤로 돌아가도 전건 통과한다.

이번 수정 자체가 "출력 순서 때문에 9개 커밋 동안 실패를 못 봤다"를 고친 작업이므로, **방어가 방어되지 않는 상태**였다.

## 무엇을 추가했나

`test/rule-coverage.test.ts`에 테스트 2건.

| 테스트 | 단언 |
| --- | --- |
| `a failing coverage check announces itself before it prints the report` | 종료 코드 1, 배너·표 둘 다 stdout에 존재, **`indexOf(배너) < indexOf(표)`** |
| `a passing coverage check prints no failure banner` | 종료 코드 0, 표는 있고 **배너는 없음** |

### 실제 스크립트를 돌린다

배너 순서는 스크립트 출력의 성질이므로, 로직을 테스트 안에서 재구현하면 **자기 자신과만 일치하는 두 번째 프로그램**이 된다. 그래서 진짜 `check-rule-coverage.mjs`를 자식 프로세스로 띄운다.

`REPO_ROOT`가 스크립트 파일 위치에서 파생되므로(`design-doc.mjs:9`), 리다이렉트하려면 스크립트를 다른 곳에 두는 수밖에 없다. 임시 디렉터리에 `scripts/` 2개 파일과 `docs/concept-foundation.md`(규칙 1개짜리 픽스처), `.rule-coverage/claims.jsonl`을 만들어 그 안에서 실행한다. **살아 있는 `.rule-coverage/` 싱크와 무관하다** — 나머지 스위트가 동시에 거기에 쓰고 있기 때문에 이 격리가 필요하다.

stdout만 검사한다. 배너가 표와 **같은 스트림**에 있는 이유가 `2>&1`이 순서를 뒤집지 못하게 하는 것이므로, 그 성질을 그대로 검사한다.

### 픽스처를 만들다 발견한 것

첫 시도에서 `condition lines 0`이 나왔다. 원인은 `parseConditions`(`design-doc.mjs:36`)의 정규식이 조건 줄마다 **끝 개행을 요구**하는데, `parseRules`가 블록 본문을 만들 때 닫는 펜스와 함께 마지막 개행을 떼기 때문이다.

```js
const body = block.replace(/^```yaml\n/, "").replace(/\n```$/, "");
```

즉 **조건 목록이 블록의 마지막인 규칙은 조건 0개로 파싱된다.** 실제 문서의 모든 규칙은 뒤에 `allowedEffect:`가 따라오므로 드러나지 않는다. 픽스처에 `allowedEffect:`를 넣어 해결했고, 이유를 주석으로 남겼다.

**등재하지 않는다.** 실제 설계 문서의 83개 규칙 전부가 조건 뒤에 다른 키를 갖고 있고(`test/rule-coverage.test.ts`의 "the real design document parses into rules that all carry conditions"가 545개 조건 줄을 세며 이를 지킨다), 이 형태는 픽스처에서만 발생한다. 다만 새 규칙을 문서 끝에 조건으로 끝나게 쓰면 조용히 0개가 되므로, **알려진 함정으로 이 문서에 기록한다.**

## 검증 — 먼저 깨뜨렸다

통과만 확인하면 이 테스트가 무엇을 잡는지 알 수 없으므로, 배너 블록을 표 **뒤로** 옮기고 돌렸다.

```
✖ a failing coverage check announces itself before it prints the report
  AssertionError: the banner must precede the report, got banner at 557 and report at 1
✔ a passing coverage check prints no failure banner
ℹ pass 13   ℹ fail 1
```

**정확히 순서만 잡는다.** 성공 경로 테스트는 그대로 통과했다 — 배너가 어디 있든 성공 시에는 안 나오기 때문이고, 두 테스트가 서로 다른 것을 보고 있다는 뜻이다.

되돌린 뒤 `git diff --stat scripts/check-rule-coverage.mjs`가 비어 있음을 확인했다.

```
$ node --test test/rule-coverage.test.ts
ℹ tests 14   ℹ pass 14   ℹ fail 0
```

---

## 결론

1. 배너가 커버리지 표보다 앞에 오는지, 성공 시에는 나오지 않는지를 단언하는 테스트 2건을 추가했다.
2. 배너를 일부러 뒤로 옮겨 실패를 확인하고 되돌렸다 — 이 테스트는 순서만 잡고 다른 것은 잡지 않는다.
3. `npm test` 종료 코드 **0**.

## 다음 작업

- Phase B — 방치된 11건 현황 파악과 우선순위 확정

## 미해소로 남긴 것

- **`parseConditions`의 끝 개행 의존**은 등재하지 않고 이 문서에만 기록했다. 실문서에서는 발생하지 않으나, 조건으로 끝나는 새 규칙을 쓰면 조용히 0개가 된다
- 워크플로 러너 동작은 여전히 **미검증**이다 (push 필요)
