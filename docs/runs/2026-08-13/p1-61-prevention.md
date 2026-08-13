# P1-61 재발 방지 — 배너·CI·규약 구현

| 항목 | 값 |
| --- | --- |
| 작업 일시 | 2026-08-13 14:20 (KST) |
| 대상 커밋 해시 | `d697aa2` (작업 시작 시점) |
| 작업 유형 | **수정** (제안 3건 구현 + 미확인 구간 마무리) |
| 선행 문서 | `docs/runs/2026-08-13/p1-61-posttest-green.md` |
| 번호 실측 최대값 | **P0-16 / P1-61** (`grep -rhoE "P[01]-[0-9]+" docs/ src/ test/`) |
| **테스트 근거** | `npm test > /dev/null 2>&1; echo $?` → **0** |

테스트 근거를 종료 코드로 적는 것은 이번 작업이 만든 규칙이다. **자기 적용이다.**

---

## 작업 1 — 실패 배너

### 변경

`scripts/check-rule-coverage.mjs`. 에러가 확정된 직후, 커버리지 표를 찍기 **전에** 배너를 낸다. 성공 경로는 한 글자도 바뀌지 않았다.

두 가지 설계 결정에 사유를 주석으로 남겼다.

**색을 쓰지 않는다.** CI 로그·파이프·파일은 이스케이프 코드를 버리는데, 실패가 실제로 묻힌 곳이 바로 그런 자리다. ASCII `#` 박스만 쓴다.

**stderr가 아니라 stdout에 찍는다.** 에러이므로 stderr가 관례지만, 보고서가 stdout이고 `2>&1`로 병합된 두 스트림 사이에는 **순서 보장이 없다.** stderr에 찍으면 자기가 앞서야 할 표보다 뒤에 나올 수 있다. 종료 경로의 한 줄만 stderr에 남겼다.

바닥의 기존 블록은 목록을 반복하지 않고 위를 가리키는 한 줄로 줄였다 — 같은 사실을 두 번 적으면 꼬리만 본 사람이 그게 전부라고 믿는다.

### 검증 — 일부러 실패시킨 출력 발췌

`test/zz-probe.test.ts`에 규칙에 없는 조건을 인용하는 주장을 심고 `npm test`를 돌렸다. (`pretest`가 `.rule-coverage/`를 지우므로 파일에 심어야 재현된다.)

```
> codefleet@0.1.0 posttest
> node ./scripts/check-rule-coverage.mjs


######################################################################
#  RULE COVERAGE CHECK FAILED
#  npm test exits non-zero. The report below is context, not a pass.
######################################################################

  - RUN_PLAN_AGENT_ADAPTER_RESOLUTION: claimed condition is not in the rule: "selectionSource"

=== FINAL RULE coverage by condition line ===
  rules                  83
  condition lines        545
  claims recorded        353
  conditions covered     345  (63.3%)
  ...
```

마지막 3줄:

```
  mean the condition is correctly implemented.

rule coverage check failed: 1 error(s). See the banner above the report.
```

**배너가 표보다 먼저 나오고 사유가 함께 붙는다.** probe는 확인 후 제거했다.

## 작업 2 — CI 워크플로

`.github/workflows/test.yml` 신규.

| 항목 | 값 | 사유 |
| --- | --- | --- |
| 트리거 | `push`, `pull_request` | 지시대로 |
| 러너 | **`windows-latest`, `ubuntu-latest`** | 개발 환경이 Windows이고 P0-6·P0-8·P1-21이 win32 한정으로 등재돼 있다. 최소 하나는 실제 개발 환경과 같아야 한다는 조건을 windows-latest가 만족하고, ubuntu는 그 한정 판정 중 무엇이 정말 플랫폼 특정인지 말해준다 |
| `fail-fast` | `false` | 한쪽이 빨개졌다고 다른 쪽을 취소하면, win32 한정 결함을 판별할 수 없다 |
| Node | `24` | `package.json` engines가 `>=24`. 네이티브 TS 스트리핑이 빌드 단계 없이 `node --test`를 돌리는 근거다 |
| install 단계 | **없음** | 의존성 0개, lockfile 없음(실측: `dependencies {} / devDependencies {}`, `package-lock.json` 부재). `npm ci`는 lockfile이 없어 실패하고 `npm i`는 없는 lockfile을 만들 뿐이다 |
| `continue-on-error` / `\|\| true` | **없음** | 실패할 수 없는 단계는 아무도 읽지 않는 단계이고, 그게 이 파일이 없애려는 실패다 |

### posttest가 빌드를 깨는가 — **실측했다**

지시가 "반드시 확인"을 요구한 항목이다. 위 배너 검증과 같은 실행에서 종료 코드를 쟀다.

```
$ npm test > /tmp/probe.txt 2>&1; echo $?
1
```

**`npm test`는 posttest를 포함해 실행되고, posttest 실패가 종료 코드 1로 전파된다.** 워크플로의 `run: npm test`는 그 코드를 그대로 받으므로 잡이 실패한다.

정상 상태에서도 쟀다:

```
$ npm test > /dev/null 2>&1; echo $?
0
```

### 워크플로 자체는 **미검증**

- **문법**: PyYAML로 파싱해 구조를 확인했다 — `jobs: ['test']`, `matrix.os: ['windows-latest','ubuntu-latest']`, `steps: 4`, `on: {push, pull_request}`. 탭 문자 0개, CRLF 0줄
- **실행**: **하지 않았다.** 원격(`github.com/solzip/CodeFleet`)은 있으므로 push하면 트리거되지만, 이번 작업에서 push하지 않았다
- 따라서 **"이 워크플로가 실제로 통과한다"고 단정하지 않는다.** 러너에서의 동작은 미검증이다. 첫 push가 그것을 판정한다

## 작업 3 — 규약에 종료 코드 규칙

`CLAUDE.md`에 「테스트 근거」 절을 추가하고, `docs/CONVENTIONS.md`에 §11로 사유와 함께 넣었다(기존 §11은 §12로 밀렸다).

사유로 붙인 사건은 둘이다.

1. **P1-61 본체** — 9개 커밋 동안 종료 코드 1. 인용 5건은 전부 통과 건수를 참으로 적었고, 커맨드가 실패한다는 사실만 빠져 있었다
2. **측정 방법 자체** — P1-61 조사 중 `npm test 2>&1 | tail -28; echo "exit=$?"`로 읽은 `0`은 `tail`의 종료 코드였다. **파이프가 판정을 뒤집는다.** 그래서 규칙이 형식까지 못 박는다

## 작업 4 — 미확인 구간

선행 문서가 "`38cf9c9` 이전 구간이 초록이었는지 미확인"으로 남긴 항목이다.

### 판단 — 전수 대신 인용된 커밋만 실측했다

전체 이력은 129개 커밋이고 커밋당 `npm test`가 약 25초다(전수 ≈ 55분). 그런데 답이 필요한 질문은 "모든 커밋이 초록이었나"가 아니라 **"문서가 근거로 인용한 커밋이 초록이었나"**다. 아무도 인용하지 않은 커밋의 색은 어떤 판정도 떠받치지 않는다.

그래서 **감사 문서가 상단에 대상 커밋으로 적은 해시 전부**를 실측했다.

```
754acea exit=0   feat: put a boundary around the agent process        (2026-08-11 감사 7건)
6a458eb exit=0   feat: put the same boundary around every process     (stage3-4)
244fac7 exit=0   fix: stop reading an unreadable queue as permission  (2026-08-12 SUMMARY·01·03·04)
9bbfcbf exit=0   docs: re-audit all eleven P0s after four slices      (10-first-real-run)
b750e9e exit=0   docs: run the whole loop against a real Spring Boot  (11-model-conformance)
5d989f1 exit=0   docs: the three questions the model audit left open  (12-recheck·12-roadmap)
57a80de exit=0   feat: bind the guardrails into the approval itself   (13-system-review 기준선)
38cf9c9 exit=0   S3 (선행 문서에서 이미 확인)
```

**8개 전부 초록이다.** 따라서 `3db7d64` 이전에 내려진 [해소] 판정들은 실제로 초록인 커맨드 위에 서 있었다. 오염 구간은 `3db7d64`~`d697aa2`의 9개 커밋으로 한정된다.

### 남는 미확인

인용되지 않은 커밋 약 121개는 여전히 미확인이다. **의도적으로 확인하지 않았다** — 어떤 판정도 그 위에 서 있지 않으므로 55분을 쓸 근거가 없다. 나중에 그 구간의 커밋을 근거로 삼는 문서가 생기면 그때 재야 한다.

---

## 결론

1. 실패 배너를 커버리지 표 앞으로 옮겼다. 색에 의존하지 않고, 순서 보장을 위해 stdout에 찍는다. 일부러 실패시켜 눈으로 확인했다.
2. `.github/workflows/test.yml`을 추가했다. posttest 실패가 `npm test`를 종료 코드 1로 끝낸다는 것은 실측했고, **워크플로의 러너 동작은 미검증**이다.
3. 규약에 "테스트 근거는 종료 코드로" 규칙을 넣고 이번 문서부터 적용했다. 미확인 구간은 인용된 커밋 8개를 실측해 전부 초록임을 확인했고, 오염 구간을 9개 커밋으로 한정했다.

## 다음 작업

- **워크플로 첫 실행** — push해야 판정된다. 이번 작업 범위 밖
- 영향받은 판정 6건 재판정 (별도 작업)
- 방치된 11건 — P0-14~16, P1-42~49 (별도 작업)

## 미해소로 남긴 것

- **워크플로가 러너에서 실제로 통과하는지는 미검증이다.** 문법 파싱까지만 했다
- **인용되지 않은 약 121개 커밋의 posttest 상태는 미확인**이며, 위 사유로 의도적으로 남긴다
- 영향받은 판정 6건은 여전히 재판정되지 않았다 — 그 근거는 `3db7d64`~`d697aa2` 구간이므로 오염이 확정된 쪽이다
- **배너를 회귀 테스트로 고정하지 않았다.** `test/rule-coverage.test.ts`가 체커의 실패 모드를 재현하지만 출력 순서는 단언하지 않는다. 배너가 표 뒤로 돌아가도 테스트는 통과한다 — P1-60(산출물 본문 미단언)과 같은 형태이며, 이번에 닫지 않았다
