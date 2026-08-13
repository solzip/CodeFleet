# 링크 체커를 저장소에 넣고 `npm test`가 읽게 했다

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 19:30 (KST) |
| 대상 커밋 해시 | `d9c107f` (작업 시점 HEAD) |
| 작업 유형 | **수정** (코드 추가. **동결 이후 두 번째 비문서 변경**) |
| 선행 문서 | `docs/runs/2026-08-13/link-audit-full.md` |
| 번호 실측 최대값 | **P0-17 / P1-61** (`P0-17`은 미사용 등재 ID) |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0**. 273 통과 / 0 실패 (동결 시점 257 + 신규 16) |

---

## 동결 규칙에 대해 먼저

이 저장소는 **"코드는 단 한 줄도 수정하지 않는다"**는 조건으로 동결됐다. 이번 변경은 **명시적 요청에 따른 예외**이며, 감추지 않고 여기에 적는다.

- 동결 이후 비문서 변경은 이제 **2건**이다 — `.github/workflows/test.yml` 제거, 그리고 이번 추가
- `ci-first-run.md`가 "**동결 이후 유일한 비문서 변경**"이라고 적은 문장은 **더 이상 참이 아니다.** 원문은 규약 §7에 따라 고치지 않고 각주로 표시했다
- `src/`는 여전히 무변경이다. 이번에 손댄 것은 `scripts/`, `test/`, `package.json`뿐이다

## 왜 넣었나

직전 문서가 미해소로 남긴 문장이 이것이었다.

> **검사기는 저장소에 들어가지 않았다.** 임시 스크립트로 돌렸을 뿐이라 **다음에 링크가 깨져도 아무도 알지 못한다.**

**임시 스크립트로 낸 PASS는 그 순간에만 참이다.** 게다가 그 스크립트는 같은 세션에 세 번 틀렸고, 그중 한 번은 **초록 쪽으로** 틀려서 깨진 링크 3건을 통과시켰다. 저장소 밖에 있는 검사기는 고쳐도 다음 사람에게 전달되지 않는다.

## 넣은 것

| 파일 | 내용 |
| --- | --- |
| `scripts/check-links.mjs` | 체커 본체. Node 24, 의존성 없음 (기존 `check-rule-coverage.mjs`와 같은 조건) |
| `test/link-check.test.ts` | **체커를 일부러 실패시키는 테스트 16건** |
| `package.json` | `posttest`가 커버리지 체커 뒤에 링크 체커를 실행. `npm run check:links`로 단독 실행 |

```json
"posttest": "node ./scripts/check-rule-coverage.mjs && node ./scripts/check-links.mjs",
"check:links": "node ./scripts/check-links.mjs",
```

## 설계에서 의도적으로 고른 것

### 1. 파일시스템을 주입한다 — 하위 프로세스도, 손으로 만든 경로 문자열도 없다

`auditLinks(files, fs)`가 `fs.read` · `fs.exists` · `fs.sameCase`를 **인자로** 받는다. 테스트는 메모리 안의 가짜 저장소를 넘긴다. 임시 디렉터리도, 자식 프로세스도, 플랫폼도 개입하지 않는다.

**이건 취향이 아니라 이 저장소가 지불한 대가에서 나왔다.** 직전에 추가한 배너 테스트 2건은 자식 프로세스를 띄우고 경로 문자열을 비교했고, **로컬 win32에서 통과하고 CI win32에서 깨졌다**(`ci-first-run.md`). 같은 함정을 두 번 밟지 않는다.

### 2. CLI 가드는 `pathToFileURL`로 쓴다

```js
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
```

기존 `check-rule-coverage.mjs:159`는 `new URL('file://' + process.argv[1].replace(...))`로 **URL을 손으로 조립한다.** 그게 CI windows에서 내 배너 테스트를 깨뜨린 원인으로 **추정**되는 자리다. 새 파일은 Node가 주는 변환을 쓴다.

**기존 파일은 고치지 않았다.** 이번 요청 범위 밖이고, 고치려면 그 실패를 CI에서 재현해 원인을 확정해야 하는데 CI를 제거했다.

### 3. 출력은 ASCII만

개발 콘솔이 CP949다. 임시 Python 검사기는 **em dash 하나 때문에 판정 대신 `UnicodeEncodeError`로 끝났다** — 이번 세션에 실제로 일어난 일이다. 그래서 `test/link-check.test.ts`에 **보고서가 ASCII인지 확인하는 테스트**가 들어 있다.

### 4. 0건 검사는 실패다

파일 목록이 비면 판정이 아니라 오류다. `CLAUDE.md`의 「**검사한 항목이 0이면 통과가 아니라 실패다**」 그대로이며, 이 저장소는 이미 0개 규칙을 읽고 초록을 낸 파서에 물린 적이 있다.

### 5. 배너가 보고서보다 **먼저** 나온다

P1-61에서 정한 순서다. 숫자 벽 아래에 찍힌 실패는 아무도 읽지 않는다.

### 6. 대상 경로는 문서 기준으로만 해석한다

루트 기준 대체 탐색이 **거짓 통과 3건**을 만들었다. 그 대체 규칙은 새 체커에 없고, `test/link-check.test.ts`가 그 시나리오를 그대로 재현해 고정한다.

## 측정

### 통과 경로

```
$ node ./scripts/check-links.mjs ; echo $?
link check
  markdown files examined   70
  links collected           35  (inline, image, reference)
    repo-relative paths     33
    same-document anchors   2
    external URLs           0  (not fetched; this check is offline)
    mailto                  0
  skipped as quotations     9  (inside code fences or spans)

  missing target          0
  case mismatch           0
  missing anchor          0
0
```

```
$ npm test > /dev/null 2>&1 ; echo $?
0
```
tests 273 / pass 273 / fail 0.

### 실패 경로 — 일부러 깨뜨려 실측했다

깨진 링크 하나를 담은 파일을 추가하고 돌렸다.

```
######################################################################
#  LINK CHECK FAILED
#  npm test exits non-zero. The report below is context, not a pass.
######################################################################

  missing target          1
      x  docs/_tmp-broken.md -> does-not-exist.md

link check failed: 1 error(s). See the banner above the report.
종료 코드: 1
```

**배너가 보고서보다 먼저 나오고, 종료 코드가 1이다.** 파일을 지운 뒤 다시 0으로 돌아오는 것까지 확인했다.

### 임시 검사기와 교차 확인

| 항목 | Python(임시) | Node(저장소) |
| --- | --- | --- |
| 실링크 | 35 | 35 |
| 내부 경로 | 33 | 33 |
| 문서 내 앵커 | 2 | 2 |
| 실패 | 0 | 0 |
| 검사 파일 | **69** | **70** |

**파일 수만 다르다.** `git ls-files`는 추적된 파일만 준다 — Python으로 잴 때 `link-audit-full.md`가 아직 미추적이라 **검사에서 빠져 있었다.** 커밋한 뒤 70이 됐다.

**즉 새로 만든 문서는 커밋되기 전까지 검사되지 않는다.** 발행되는 것만 검사한다는 점에서 의도에 맞지만, 처음 쓸 때 링크가 틀려도 그 자리에서는 알 수 없다.

## 이 변경이 거짓으로 만든 문장들 — 전부 고쳤다

| 문서 | 전 | 후 |
| --- | --- | --- |
| `README.md` / `README.en.md` | 257 통과 | **273 통과** |
| `README.md` / `README.en.md` | 감사·실행 기록 43편 | **47편** |
| `ARCHIVE.md` 상태표 | 257 통과 / 0 실패 | **273 통과 / 0 실패** + 내역 주석 |
| `ARCHIVE.md` 자산표 | 46개 문서(실행 10) | **47개 문서**(실행 11) |
| `CLAUDE.md` 설정 절 | `npm test` = 스위트 + 커버리지 체커 | **+ 링크 체커** |
| `ci-first-run.md` | "동결 이후 **유일한** 비문서 변경" | 원문 유지 + **각주로 정정** |
| `link-audit-full.md` 미해소 2건 | 미해소 | **해소** 표시 + 원문 유지 |

**`README`의 "Linux에서는 6건이 깨진다"는 고치지 않았다.** 그건 `8ce118b`에서 CI가 실제로 낸 값이고, 이번 변경으로 다시 재지 않았다.

## 결론

1. `scripts/check-links.mjs`와 **실패 테스트 16건**이 저장소에 들어갔고, `posttest`가 이를 소비한다. `npm test` **종료 코드 0**, 273 통과 / 0 실패.
2. **실패 경로를 실측했다** — 일부러 깨뜨리자 배너가 보고서보다 먼저 나오고 종료 코드 1이 떴다. 통과만 확인한 검사기는 검사기가 아니다.
3. **동결 이후 두 번째 비문서 변경이며, 명시적 요청에 따른 것이다.** `src/`는 여전히 무변경이고, 이 변경이 거짓으로 만든 문장 7곳을 전부 고쳤다.

## 다음 작업

없음.

## 미해소로 남긴 것

- **새 체커는 Linux에서 한 번도 돌지 않았다.** CI를 제거했으므로 확인할 수단이 없다. 하위 프로세스와 경로 문자열을 피해 설계했지만 **그건 근거이지 실측이 아니다**
- **`check-rule-coverage.mjs:159`의 CLI 가드는 그대로다.** CI windows 실패 2건의 추정 원인이고, 새 파일은 다른 방식을 쓰지만 **기존 파일은 고치지 않았다.** 고치려면 재현이 필요한데 재현할 CI가 없다
- **외부 URL은 검사하지 않는다.** 현재 0건이라 드러나지 않지만, 외부 링크가 생겨도 이 체커는 그것을 보지 않고 PASS를 낸다
- **앵커 슬러그는 GitHub 구현의 근사다.** 한글·기호 제목에서 어긋날 수 있고 실제 렌더링과 대조하지 않았다
- ~~**미추적 파일은 검사되지 않는다.**~~ **해소** — `git ls-files --others --exclude-standard`로 커밋 전 문서도 검사한다 (`runs/2026-08-13/prose-fact-check.md`). 원문: **미추적 파일은 검사되지 않는다.** 새 문서는 커밋 후에야 검사 대상이 된다
- **`npm test`의 종료 코드를 읽는 자동 소비자는 여전히 0개다.** 체커는 사람이 `npm test`를 돌릴 때만 말한다
