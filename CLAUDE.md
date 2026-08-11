# CodeFleet — working rules

CodeFleet exists to make "the AI said it worked" structurally untrustworthy. Only evidence the Harness observed counts. That standard applies to this repository's own development too: the rules below are the same rules the product enforces, turned on the work of building it.

## Setup

No dependencies, no `npm install`. Node 24+ only (native TypeScript stripping).

```bash
node -v          # must be >= 24
npm test         # runs the suite, then the design-coverage checker
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

The address changed once, on 2026-08-11, from `cysph413@naver.com` to
`solarchive.dev@gmail.com`, to use one address across every project. All 129
commits were rewritten and force pushed; author and committer dates were
preserved and no file content changed. Do not reintroduce the old address, and
do not "restore" it on seeing it in an old clone or a cached fork — a clone
taken before that date has the old address in every commit and is stale, not
authoritative.

### Line endings

`.gitattributes` normalises text files to LF in the index on every platform.
CRLF has already caused one silent-green failure here — a rule parser that read 0
blocks and passed — so this is a correctness setting. Do not remove it, and do
not commit a file whose line endings an editor converted.

## Commits

State the measured before/after. Name the defect the change exposed, if any. Do not claim a rule is implemented without a claim proving a passing test checks it.
