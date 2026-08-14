# 세 번째 검사기와, 검사기가 숨기고 있던 분모

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-14 11:40 (KST) |
| 대상 커밋 해시 | `c448b7d` (작업 시점 HEAD) |
| 작업 유형 | **수정** (코드 추가. **동결 이후 세 번째 비문서 변경**) |
| 선행 문서 | `docs/runs/2026-08-14/unchecked-27-adjudication.md` §B-3, `docs/runs/2026-08-13/link-checker-in-repo.md`, `docs/runs/2026-08-13/prose-fact-check.md` |
| 번호 실측 최대값 | **P0-17 / P1-61** (`P0-17`은 미사용 등재 ID) |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0**. 318 통과 / 0 실패 (291 + 신규 27) |

---

## 왜 이 작업을 했나 — "왜 계속 비슷한 걸 반복하나"라는 질문

같은 형태의 결함을 사흘째 잡고 있었다.

| 날짜 | 무엇이 틀렸나 | 대응 |
| --- | --- | --- |
| 08-13 | 링크 검사가 "깨짐 0건"이라고 거짓 보고 | `check-links.mjs`를 저장소에 넣음 |
| 08-13 | 산문의 숫자가 실측과 어긋남 | `check-doc-facts.mjs`를 만듦 |
| 08-14 | 등재부의 파일:라인 3건이 어긋남 | **또 검사기?** |

세 번째 검사기를 만들기 전에 **왜 매번 새 표면이 생기는지**를 먼저 셌다. 그 측정이 이 작업의 방향을 바꿨다.

### 측정 1 — 검사기가 분자만 보고한다

`check-doc-facts.mjs`가 묻는 것은 *"측정 가능한 사실이 **어딘가** 선언돼 있나"*다(`undeclared`). `audit-run-records`가 README에 한 번 선언돼 있으면 `undeclared = 0`, 초록. 그동안 `ARCHIVE.md`의 맨숫자 "49개 문서"는 **애초에 검사 대상이 아니었다.**

출력이 이랬다:

```
declarations checked   34
mismatches             0
```

**분모가 없다.** 살아 있는 문서에서 수로 진술된 주장을 세면 **567개**이고 앵커는 34개다 — **6.0%**. 나머지 533개는 이 검사가 방어하지 않는다. 그런데 출력은 "34개 검사, 불일치 0"이라 **전부 맞다고 읽힌다.**

`CLAUDE.md`가 이미 써 둔 규율이 정확히 이것이다:

> A check that quantifies over a set must report what it scanned, not only its verdict. **Zero items examined is a failure, not a pass.**

검사기가 그 규율을 **절반만** 지키고 있었다. 검사한 34개는 세면서 검사하지 않은 533개는 세지 않았다.

### 측정 2 — 한 사실이 5~20곳에 복제돼 있다

| 사실 | 복제된 문서 수 |
| --- | --- |
| 커버리지 63.3% | **20** |
| 미확인 27건 | **11** |
| 결함 77건 | 8 |
| 테스트 통과 수 | 8 |
| 감사·실행 기록 수 | 5 |

갱신은 **쓰는 사람이 보고 있는 한 곳**에만 일어난다. 그래서 같은 실패가 형태만 바꿔 반복된다 — `prose-fact-check`가 291을 자기 문서에만 적은 것, `triage`가 확정한 8건을 등재부가 안 받은 것, `2026-08-12/SUMMARY.md`의 P1-14 [무효화됨] 판정이 등재부로 안 건너온 것이 **전부 같은 사건**이다.

**결함 유형이 "숫자가 낡는다"가 아니라 "한 사실에 사본이 여럿이고 단일 출처가 없다"이다.** 검사기를 하나 더 만드는 것은 그 위에 탐지기를 하나 더 얹는 일이고, 복제는 계속 새 표면을 만든다.

그래서 세 가지를 만들었다. **셋째가 요청받은 것이고, 첫째가 질문에 답하는 것이다.**

---

## 1. 분모를 드러냈다 — `check-doc-facts.mjs`

`countNumericClaims()`를 추가하고, 리포트가 비율을 함께 낸다.

```
declared-fact check
  declarations checked      40
  numbers stated in living docs  567  (rough count)
  of those, anchored             40  =  7.1%
  UNCHECKED NUMBERS             527  <- not defended by this check
  mismatches                0
```

날짜·연도·`§`절번호·코드 스팬은 식별자이지 측정값이 아니므로 먼저 걷어낸다. 0과 1은 서수·불릿 노이즈가 많아 제외한다. **의도적으로 거친 추정이고, 리포트가 `rough count`라고 적는다.** 노출을 과대평가하는 방향이 안전한 오차다.

「살아 있는 문서」는 9개다 — README 한/영, `INDEX.md`, `REGISTER.md`, `CONVENTIONS.md`, 아카이브 표지 4종. 날짜가 붙은 감사·실행 기록은 제외한다. **그 문서들은 그 시점의 사실을 적은 것이지 현재 진술이 아니다.**

## 2. 테스트 건수를 측정 항목으로 만들었다

어제 마지막 커밋이 테스트 18건을 추가하고 표지 3곳에 **273**을 남겼다. 산문 검사기를 만든 그 커밋이 산문에 낡은 수를 남긴 것이고, 앵커가 없어 검사기가 보지 못했다.

`node --test`의 TAP 리포터를 사람이 읽는 출력과 **함께** 쓰게 했다. 파이프를 쓰지 않으므로 종료 코드가 보존된다 — 규약 §「테스트 근거」가 경고한 그 함정이다.

```json
"test": "node --test --test-reporter=spec --test-reporter-destination=stdout
                  --test-reporter=tap --test-reporter-destination=.rule-coverage/test-summary.tap"
```

`parseTestSummary()`가 `# pass N` / `# fail N`을 읽어 `tests-passing`·`tests-failing`으로 측정한다. **요약이 없거나 잘려 있으면 `null`을 돌려준다** — 0을 돌려주면 "테스트가 하나도 안 돌았다"가 "전부 통과"로 읽힌다.

**이 앵커는 붙이자마자 제 일을 했다.** 291로 선언하고 커밋 직전에 스위트를 돌리니:

```
x  README.en.md:220: tests-passing declared 291, measured 318
x  README.md:220: tests-passing declared 291, measured 318
x  docs/archive/2026-08-13/ARCHIVE.md:58: tests-passing declared 291, measured 318
```

이번에 추가한 27건이 잡힌 것이다. **어제 놓친 것과 정확히 같은 실패 모드이고, 이번에는 사람이 아니라 스위트가 잡았다.**

## 3. 파일:라인 검사기 — `scripts/check-doc-citations.mjs`

### 이 검사가 어려운 이유

**인용은 HEAD 기준이 아니라 그 문서의 대상 커밋 기준이다.** 순진하게 HEAD와 대조하면 2026-08-10 감사의 `run.ts:264`가 깨진 것처럼 보인다 — 그 커밋에서는 맞았다. 실제로 첫 시도에서 후보 103건이 나왔고 대부분이 이 노이즈였다.

그래서 문서마다 대상 커밋을 읽고 `git show <commit>:<path>`로 대조한다.

### 대상 커밋 표기가 다섯 가지였다

```
2026-08-13 이후, 표 행으로:
    | 대상 커밋 해시 | `c448b7d` |
    | 커밋 | `e5fb188...` (working tree clean) |

2026-08-10·08-11, text 펜스 안의 라벨 줄로:
    점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902
    대상 커밋   : 754acea... (수정 전 HEAD)
```

한 표기만 맞추면 **87건을 읽고 411건을 건너뛴다.** 라벨을 느슨하게 맞추되 값이 해시일 것을 요구하도록 고쳐 **건너뛴 것을 0으로 만들었다.** 값이 해시일 것을 요구하는 부분이, `| 대상 | \`docs/runs/....md\` |` 같은 행을 커밋으로 오인하지 않게 한다.

### 판정 결과

```
citations examined        248
skipped as quotations     8    (marked <!-- cite: quoted -->)
unresolved (no commit)    0
unverifiable (dead commit) 242  (history rewrite; no edit can fix these)
broken in living docs     0
suspect in dated records  7    (wrong at their own commit; no edit fixes these)
```

**세 개의 서로 다른 "검사 못 함"을 구분한다.** 하나로 뭉치면 242건이 결함으로 보이고, 숨기면 검사가 절반만 돌았다는 사실이 사라진다.

### 발견 1 — 2026-08-10 감사의 커밋이 이 저장소에 없다

```
$ git cat-file -t 70fa598c39ae42038c26992a099caec18cb2657f
fatal: git cat-file: could not get object info
```

`CLAUDE.md`가 적은 대로 2026-08-11에 **129커밋 전부를 재작성**해 신원을 하나로 만들었다. 그 재작성 이전에 기록된 해시는 함께 죽었다. 2026-08-10 감사 7편의 **인용 242건이 영구히 검증 불가**다 — 틀린 게 아니라 대조할 대상이 없다.

**이 사실은 어디에도 적혀 있지 않았다.** `ENVIRONMENT.md`도 `ARCHIVE.md`도 재작성이 옛 해시를 무효화했다는 말을 하지 않는다.

### 발견 2 — 살아 있는 문서에서 네 번째 드리프트

어제 판정한 3건 외에 하나가 더 있었다.

| 문서 | 인용 | 그 줄 | 옳은 위치 |
| --- | --- | --- | --- |
| `LESSONS.md:109` | `src/run.ts:1388-1389` | `);` | **`src/run.ts:1384-1385`** |

`| null`을 명시하는 관용구를 가리키는 인용인데 4줄 밀려 있었다. **사람이 세 번 읽어서 찾은 것이 3건이고, 검사기가 한 번 돌아 4건째를 찾았다.**

### 설계 결함 하나를 자기 자신에게서 찾았다

첫 실행이 오류 3건을 보고했는데 **전부 이 저장소의 정정문이었다.** 드리프트를 고치려면 옛 번호를 적어야 하고, 그 인용이 새 결함으로 읽힌다.

`<!-- cite: quoted -->`로 표시하면 건너뛰되 **건수를 따로 센다.** 링크 체커가 코드 펜스를, 사실 검사기가 자기 문서의 예시를 각각 같은 방식으로 배웠다 — **세 검사기가 모두 "인용은 주장이 아니다"를 따로 배웠다.**

---

## 검사한 것과 안 한 것

**실패를 일부러 만드는 테스트 27건**을 붙였다(`test/doc-citations.test.ts` 19, `test/doc-facts.test.ts` 8). 펜스 안의 인용, 다섯 가지 커밋 표기, 표기가 없는 문서, 죽은 커밋, 파일 끝을 넘는 줄 번호, 살아 있는 문서와 날짜 문서의 처리 차이, **0건 검사가 실패라는 것**, 잘린 TAP이 0이 아니라 `null`이라는 것.

작성 중 기존 테스트 1건이 빨개졌다 — `report()`에 인자를 하나 끼워 넣었더니 `doc-facts.test.ts:149`가 잡았다. **의도한 대로 동작한 것이므로 기록해 둔다.**

---

## 결론

1. **세 번째 검사기를 만들기 전에 왜 반복되는지를 셌고, 그 측정이 첫 번째 작업을 바꿨다** — 살아 있는 문서의 수치 주장 567개 중 앵커가 34개(6.0%)였고, 검사기는 분자만 보고하고 있었다. 이제 분모와 미검사 잔여를 함께 낸다.
2. **파일:라인 검사기가 살아 있는 문서에서 네 번째 드리프트를 찾았고**, 2026-08-10 감사 7편의 인용 242건이 **히스토리 재작성으로 영구 검증 불가**임을 드러냈다. 어디에도 기록되지 않았던 사실이다.
3. **테스트 건수 앵커가 붙자마자 제 일을 했다** — 291로 선언한 것을 스위트가 318로 정정시켰다. 어제 사람이 놓친 것과 같은 실패 모드다.

---

## 추가 (2026-08-14 13:05 KST) — 앵커 기준선

위 「다음 작업」의 두 번째 항목을 같은 날 이어서 했다. 비율을 보고하는 것은 **노출의 크기를 알려줄 뿐 그 크기가 자라는 것을 막지 못한다.** 아무도 방어하지 않는 수가 바로 표지 세 곳이 273을 유지한 방식이었다.

`docs/doc-anchor-baseline.json`을 두고 `npm run anchors:baseline`으로 갱신한다 — `rule-coverage-baseline.json`과 같은 관용구다.

**두 방향을 다 막는다.** 실패하는 방식이 다르기 때문이다.

| 무엇을 하면 | 어느 값이 움직이나 | 결과 |
| --- | --- | --- |
| 앵커를 지운다 | `declared` 하락 | **빨강** |
| 살아 있는 문서에 앵커 없는 수를 넣는다 | `declared`는 그대로, `unchecked` 상승 | **빨강** |
| 앵커를 문서 사이로 옮긴다 | 총계는 유지, `perDoc` 하락 | **빨강** |
| 이미 있던 수에 앵커를 단다 | `unchecked` 하락 | 초록 |

첫 번째만 막으면 **아무것도 지우지 않는 한 노출은 무한히 자란다.** 실제로 이 세션이 그 경로로 걸었다.

### 실제로 빨개지는지 확인했다

```
$ echo "값 42와 값 99가 여기 있다." >> README.md
$ node scripts/check-doc-facts.mjs
#  DOC FACT CHECK FAILED
  UNCHECKED NUMBERS   538  <- not defended by this check  (baseline 536)
      x  unchecked numbers rose: 538, baseline is 536.
exit=1

$ sed -i '0,/<!-- fact: findings-unchecked = 27 -->/s///' docs/REGISTER.md
      x  anchors fell: 39 declared, baseline is 40.
      x  anchors fell in docs/REGISTER.md: 6, baseline is 7
exit=1
```

둘 다 복원 후 `exit=0`. 테스트 6건이 두 방향과 경계(정확히 기준선에 걸침, 기준선 없음)를 고정한다.

### 기준선 기록

```json
{ "declared": 40, "claims": 576, "unchecked": 536,
  "perDoc": { "README.md": 13, "README.en.md": 13, "docs/REGISTER.md": 7,
              "docs/archive/2026-08-13/ARCHIVE.md": 5, "docs/INDEX.md": 2,
              "docs/CONVENTIONS.md": 0, "docs/archive/2026-08-13/DESIGN-NOTES.md": 0,
              "docs/archive/2026-08-13/ENVIRONMENT.md": 0, "docs/archive/2026-08-13/LESSONS.md": 0 } }
```

**앵커가 0개인 문서가 4개다.** `LESSONS.md`·`DESIGN-NOTES.md`·`ENVIRONMENT.md`·`CONVENTIONS.md`는 수를 진술하면서 하나도 방어하지 않는다. 기준선은 그 0을 고정할 뿐 올리지 않는다 — **0에서 시작한다는 사실 자체가 기록으로 남는다.**

그리고 이 추가 작업 중에 앵커가 두 번 더 제 일을 했다.

**하나** — 테스트 6건이 늘어 318 → 324가 됐고, `README.en.md`의 앵커 하나가 `sed` 두 번 통과에서 빠져 남아 있던 것을 스위트가 잡았다.

**둘** — `declarations checked`가 40에서 **41**로 늘었다. 값은 전부 일치해서 `mismatches`는 0이었고, **분자만 봤다면 아무 일도 없는 것처럼 보였을 것이다.** 41번째를 추적하니 이 문서였다.

```
docs/runs/2026-08-14/citation-and-denominator-checks.md:208  findings-unchecked
```

원인은 검사기가 아니라 **이 문서다.** 대상 커밋 표기를 설명하면서 코드 블록 **안에** ` ```text `를 적었고, 그 줄이 펜스를 닫아버려 이후 블록의 안팎이 뒤집혔다. 그래서 검사기가 예시로 적은 `sed` 명령 속 앵커를 진짜 선언으로 읽었다.

`prose-fact-check.md`가 **"자기 문서의 예시를 선언으로 읽었다"**고 적은 그 실패가, 검사기가 아니라 문서 쪽에서 한 번 더 일어난 것이다. 블록을 고쳐 40으로 돌아왔다. **분모를 붙인 바로 그 출력 줄이 이것을 드러냈다.**

---

## 다음 작업

- **복제 자체는 줄이지 않았다.** 검사기 셋은 전부 탐지기이고, 한 사실에 사본이 5~20개인 구조는 그대로다. 단일 출처를 만드는 것이 근본 대응이며 **하지 않았다**
- **서술은 여전히 아무도 검사하지 않는다.** "아무도 확인하지 않았다" 같은 문장은 수가 아니라 주장이고, 이 세션에서 거짓이 된 문장 네 개가 전부 그 형태였다. 숫자 앵커와 같은 장치를 서술에 두려면 설계가 필요하다

## 미해소로 남긴 것

- **앵커 비율 6.9% 자체는 올리지 않았다.** 기준선은 **더 나빠지는 것만** 막는다. 536개는 여전히 검사되지 않고, 문서 4개는 앵커가 0개다
- **`suspect in dated records` 7건을 고치지 않았다.** 자기 커밋에서 이미 틀렸던 인용이거나(`12-waiver-conformance.md`), `fixes/` 문서가 **수정 전** 커밋을 적고 수정 후 트리를 인용한 경우다(`stage1-isolation.md` 6건). 후자는 문서의 커밋 표기를 고쳐야 하는데 그 표기가 무엇이어야 하는지가 불확실하다
- **검증 불가 242건은 복구할 수 없다.** 죽은 커밋을 되살릴 방법이 없으므로 2026-08-10 감사의 인용은 영구히 대조 불가로 남는다. 이 사실을 `ENVIRONMENT.md`에 옮기지 **않았다**
- **`countNumericClaims`는 거친 추정이다.** 산문의 `4.1` 같은 값을 주장으로 센다. 리포트가 `rough count`라 적고 테스트가 그 동작을 고정하지만, 정확한 수는 아니다
- **`<!-- cite: quoted -->`는 줄 단위다.** 정정 표의 한 행에 옛 인용과 새 인용이 함께 있으면 둘 다 건너뛴다. 이번 3개 행이 그 경우이고, 같은 새 인용이 `REGISTER.md`에서 검사되므로 감수했다
