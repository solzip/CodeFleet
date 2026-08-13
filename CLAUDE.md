# CodeFleet — working rules

CodeFleet exists to make "the AI said it worked" structurally untrustworthy. Only evidence the Harness observed counts. That standard applies to this repository's own development too: the rules below are the same rules the product enforces, turned on the work of building it.

## Setup

No dependencies, no `npm install`. Node 24+ only (native TypeScript stripping).

```bash
node -v          # must be >= 24
npm test         # suite, then the coverage, link and declared-fact checkers
```

`.codefleet/` is not tracked. It holds this repo's own trial runs, not state you need to resume.

On a machine that has not built this repository before, set the commit identity
before the first commit. See **Publication constraints** for why it matters:

```bash
git config user.name "sol"
git config user.email "solarchive.dev@gmail.com"
```

## Where to resume

```
docs/session-handoff.md               next slice, and why it is next
docs/design-progress.md               ordered design steps, current position, measured counts
docs/concept-foundation.md            the design. FINAL RULEs are canonical
docs/rule-implementation-status.json  why each unclaimed rule is unclaimed
docs/audits/<date>/SUMMARY.md         open findings by severity, and the slice they suggest
npm run coverage:uncovered            rules with unclaimed conditions, right now
```

Never trust a count written in prose here. Run the command and read the number it prints.

## Rules

### Every judgment carries a number

"조심하자", "확인했다", "looks fine" say nothing. Report `3 gaps → 2`, `150 of 545 condition lines`, `13 failures, all one cause`.

A check that quantifies over a set must report what it scanned, not only its verdict. **Zero items examined is a failure, not a pass.** This has already caught two silent-green bugs here: a rule parser that read 0 blocks because of CRLF, and a coverage run that recorded no claims. Both would have passed.

When one number would blend two different things, split it. Mixing "no code exists" with "code exists but was never labelled" made the remaining work look larger than it was.

Do not estimate to fill a gap in measurement. Say the classification has not been done.

### Verify the verifier

Anything that measures or validates needs tests that make it fail on purpose. A guard that always returns null looks exactly like a guard that works.

`test/rule-coverage.test.ts` reproduces every failure mode of the coverage checker. `scripts/check-rule-coverage.mjs` refuses an evidence path that cannot be opened, because prose can assert anything but a path is checkable.

Record only what executed. Coverage claims are `coversRule(ruleId, "condition text")` called inside a test body, so a failing or unrun test contributes nothing — the same standard the product applies to agents.

### Confirm why tests broke before fixing them

Do not say "that breakage is expected" and move on. Group the failure messages and confirm every failure has the cause you think it has.

Then keep the fix falsifiable. When a design change required adding a policy flag to 13 fixtures, a separate test with no policy block was added, asserting the refusal — otherwise the fixture edit is indistinguishable from turning the rule off.

This matters because it already went wrong: a regex sweep missed `assert.rejects(() => runTask(...))` and two tests passed for the wrong reason.

### The design fixes the shape; the implementation conforms

When `docs/concept-foundation.md` already fixes field names, phase order, or matcher syntax, match it rather than inventing a variant. The HarnessWorkspaceSnapshot field grouping was written differently once and had to be rewritten.

If the design is wrong, change the design first and say so. Do not diverge silently.

FINAL RULEs are checked mechanically by `test/design-rules.test.ts`: required fields, id format and uniqueness, taxonomy membership, `scanScope` on any rule quantifying over a set, and the 8 declared enum divergences pinned by count.

### Distinguish what cannot be observed from what was not done

`CAPABILITY_GAP` — CodeFleet cannot observe it yet. A human can check it instead, and may waive it item by item with a justification.

`EVIDENCE_DEFECT` — evidence is missing or does not match its hash. Nobody can stand in for it. Never waivable.

A provider claim is neither. It is recorded at `PROVIDER_REPORTED_ONLY` and cannot satisfy command policy, verification, or VERIFIED. **Do not judge a claimed command against policy** — judging it means believing it.

## Coverage workflow

```bash
npm test                      # fails if coverage falls below docs/rule-coverage-baseline.json
npm run coverage:uncovered    # list rules with unclaimed conditions
npm run coverage:baseline     # raise the baseline after adding claims
```

The checker fails on: an unknown ruleId, a condition quote not present in the rule, zero claims recorded, coverage below baseline, a rule with neither a claim nor a status entry, a status entry that survived after its rule got a claim, or an evidence path that does not exist.

After adding claims, the status entry for that rule must be removed from `docs/rule-implementation-status.json` — the run tells you which ones.

## Publication constraints

This repository is public. The three decisions below are already made. Each one
was expensive to reach, and reversing one silently cannot be undone from inside
the repository.

**The owner's legal name appears nowhere.** It was removed from every commit by
rewriting history, and the GitHub repository was then deleted and recreated so
the old objects were purged server-side rather than left unreachable by hash. Use
`solzip` or `sol`. The LICENSE copyright holder is `solzip` on purpose — that is
the pseudonymous handle, not an oversight to correct. Never write a legal name
into LICENSE, docs, commit messages, or path examples; use a placeholder.

**This is source-available, not open source.** LICENSE is all-rights-reserved:
readable and forkable for reading, with no grant to use, run, copy, modify,
distribute, or train on. Do not substitute an OSI license, add an SPDX identifier
implying one, or call the project open source in the README, `package.json`, or
the repository description. GitHub does not show a license in its sidebar for
this file; that is expected, not a defect to fix.

**Commits carry one identity, `sol <solarchive.dev@gmail.com>`.** Every commit
was rewritten to it. One commit from a second identity puts the history back to
two authors, and the only remedy is another rewrite and a force push. Set it
repository-locally on each machine rather than relying on a global default.

The address changed once, on 2026-08-11. All 129 commits were rewritten to the
address above and force pushed; author and committer dates were preserved and no
file content changed. The previous address is deliberately not written here —
recording it would put back in the tree exactly what the rewrite removed from the
history.

A clone taken before that date carries the previous address in every commit. It
is stale, not authoritative. Do not "restore" an address found in such a clone,
and do not copy one out of a local reflog.

### Line endings

`.gitattributes` normalises text files to LF in the index on every platform.
CRLF has already caused one silent-green failure here — a rule parser that read 0
blocks and passed — so this is a correctness setting. Do not remove it, and do
not commit a file whose line endings an editor converted.

## Commits

State the measured before/after. Name the defect the change exposed, if any. Do not claim a rule is implemented without a claim proving a passing test checks it.

## 작업 기록 규약 (지시 없이도 항상 적용)

감사·수정·실행 작업을 하면 채팅 응답과 별개로 반드시 파일에 기록한다.
채팅에만 답하고 끝내는 것은 작업 미완료다.

**위치**
- 감사(읽기 전용 판정): `docs/audits/YYYY-MM-DD/NN-slug.md`
- 실행·수정 작업: `docs/runs/YYYY-MM-DD/slug.md`
- 같은 날 재실행은 덮어쓰지 않고 `-v2`, `-v3`

**상단 메타데이터 (예외 없음)**
작업 일시 / 대상 커밋 해시 / 작업 유형 [감사·수정·실행·결정] /
선행 문서 경로 / 번호 실측 최대값

**하단 필수 절**
- 결론 — 3줄 이내, 판정 결과만
- 다음 작업 — 없으면 "없음" 명시
- 미해소로 남긴 것 — 없으면 "없음" 명시

**매 작업 갱신 대상**
- `docs/INDEX.md` 에 이 문서를 추가
- 등재·등급·상태 변경 시 `docs/REGISTER.md` 갱신

**번호**
- 프롬프트에 박힌 번호를 그대로 쓰지 않는다.
  `grep -rhoE "P[01]-[0-9]+"` 로 실측 최대값을 확인하고 그 다음부터 부여한다
- 등급이 바뀌어도 ID는 유지한다
- 등급·상태 변경은 원 문서를 고치지 않고 새 문서에 정정 사실을 기록한다

**판정**
- 판정 기준은 제품 정의 문서이지 코드 주석이 아니다
- 근거 없는 판정 금지. 파일:라인 필수
- 테스트가 없으면 코드가 맞아 보여도 [부분해소]까지만
- 산출물이 거짓 문장을 만드는 결함은 미구현보다 무겁게 등급한다

**테스트 근거**
- 통과 건수가 아니라 **커맨드 종료 코드**로 적는다.
  "255 pass / 0 fail"은 참이면서도 불충분하다 — posttest 실패가 그 뒤에 온다
- 형식: `npm test > /dev/null 2>&1; echo $?` → `0`
- 파이프를 거치면 `$?`가 마지막 명령(`tail` 등)의 것이 되므로,
  **출력을 버리고 재야 한다**

전문: `docs/CONVENTIONS.md`
