# CodeFleet — working rules

## Active alpha development

CodeFleet is a Host-Native AI development orchestration extension for Codex CLI
and Claude Code, using the existing Host's models, authentication and session.
[Product principles](docs/PRODUCT_VISION.md) define the product invariants;
[architecture](docs/product-completion/architecture.md) owns current structure,
[progress](project/PROGRESS.md) owns implementation and verification
status, and [roadmap](docs/product-completion/roadmap.md) owns next work and acceptance.
The freeze notes below describe the legacy engine only.

Natural-language goals become Task Drafts, pass through a Validator and form a
Workflow/DAG. Single Agent is the default; role-based collaboration does not
prove automatic Host delegation. Policy, Capability, approvals, state and recovery
govern execution. Only independent Evidence and Judge can establish completion;
an AI success claim is not verification evidence.

Basic planning and DAG preparation do not require Docker, WSL, separate OS
accounts or direct model API keys. Docker is an optional protected verification
backend, required for contracts that need it. Explicit-trust Local Verification
is not Protected Verification; Host Sandbox remains unverified. Do not promote
offline tests to Host Live or automatic delegation certification.

New-project Bootstrap without Git HEAD is implemented on this baseline: probe,
BootstrapDraft, Validator, bootstrap DAG, approved fileset creation and local
verification, covered by offline and process-level tests. Real Host Live is not
run and Protected Verification stays unsatisfied for NEW_PROJECT; do not claim either.

`src/alpha/` is a separate test-driven Node and Java workflow. The aggregate
`npm test` includes legacy, alpha and Host Core suites plus document checks;
it requires the protected test environment described under **Verification paths**.
Legacy TAP and rule coverage stay
separate so the archive's measured facts retain their original meaning. Real
provider and remote acceptance scripts are opt-in and must not run in CI with
credentials. The owner approved MIT licensing on 2026-09-30. Publish only tested
alpha artifacts and distinguish public availability from external pilot evidence.

CodeFleet exists to make "the AI said it worked" structurally untrustworthy. Only evidence the Harness observed counts. That standard applies to this repository's own development too: the rules below are the same rules the product enforces, turned on the work of building it.

## Host collaboration and bounded improvement

Use the [product principles](docs/PRODUCT_VISION.md) for the Agentic Development
Loop and Harness Engineering boundaries; [Codex instructions](AGENTS.md) apply
the same principles to repository development. Keep one Agent as the default.
When delegation is authorized and useful, use Claude Code's available Skill,
Agent and Subagent facilities within the Host's actual permissions. A Skill or
role name grants no authority and does not prove that a separate Agent ran.

The Manager/Coordinator assigns each WorkItem's scope, dependencies, inputs,
outputs and verification owner, manages resource/write conflicts and integrates
results. Parallelize only independent approved work; serialize overlapping writes
and verify the integrated candidate. Subagent reviews and messages are proposals,
not Protected Evidence. The Harness retains control of Policy, Capability,
approval revision, budget and verification state. Reuse existing Persistent
State/Work Log, Lease and Recovery instead of adding another execution engine.

For a failed attempt, inspect evidence, state a repair hypothesis and reverify the
new candidate within the approved scope and remaining attempt/time/cost budget.
Stop on repeated failure or no progress, lost lease, changed approval, uncertain
effects, exhausted budget or missing capability. Hand off the blocker, evidence
and required decision to the user. Never relax tests or completion
criteria to continue. Actual tests and required Host Live Evidence must precede
feature acceptance; documentation updates remain DOCUMENTED.

Maintain Windows, macOS and Linux compatibility as a product goal, without making
Docker, WSL or extra API keys basic requirements. Report the platform tested and keep
Local results separate from Protected Evidence. Git actions and effects outside
Git (deployment, external messages, service/data changes) require their respective
authorization; a file-edit request alone grants neither. For real-use pilots,
follow the roadmap's company/side-project outcome measurements.

### Objective continuity after compaction or restart

A Claude Code turn, Attempt, Subagent result or session ending is not Objective
completion. Continue safe approved work within the current budget; otherwise
hand off the unmet criteria, evidence, blocker and next permitted action without
marking the Objective complete. A conversation summary is not acceptance evidence.

After Claude Code compaction/restart, use the Host's own context facilities and
re-read current instructions plus the authoritative contract/revision, approval,
DAG/WorkItems, stored state/events, attempt/lease, remaining budget and evidence.
Recover context from the existing manifest where available or that path's pinned
base/context hashes and artifacts. Reconcile uncertain effects before resuming;
do not reset budgets, reissue pending work or trust a summary over durable records.
Missing or conflicting records require a handoff for the affected execution.
Do not implement compaction or a second Goal/state engine in CodeFleet.

When requirements change, assess the affected scope, dependencies, context,
tests, approvals and evidence; use supported revision/new-task paths and required
approval before execution. Preserve superseded evidence without treating it as
proof for the new contract. Reverify affected candidates before accepting them.
For an authorized baseline comparison, record Host single-Agent, CodeFleet
single-Agent and CodeFleet multi-Agent results under the roadmap's common time,
quality and cost criteria; a comparison plan does not authorize Subagent execution.

## Setup

No runtime dependencies, no `npm install`. Use the Node version required by
`package.json` (native TypeScript stripping).

```bash
node -v          # compare with package.json engines.node
```

`.codefleet/` is not tracked. It holds this repo's own trial runs, not state you need to resume.

For an authorized maintainer publishing this repository under its established
identity, the following repository-local settings illustrate that policy.
They are not installation/test prerequisites or defaults for another developer's
PC. Inspect the existing identity before an approved commit; do not run these
commands or change a user's local/global Git settings without authorization.
See **Publication constraints**:

```bash
git config user.name "sol"
git config user.email "solarchive.dev@gmail.com"
```

## Verification paths

**Basic development/regression (without Docker).** Use existing scripts for the
changed scope. The following sequence covers Legacy, Host Core and document
checks; run each command only after the preceding one succeeds:

```text
npm run pretest
npm run test:legacy
npm run test:host-core
npm run posttest
```

`pretest` resets the generated rule-coverage data; `test:legacy` regenerates it.
`posttest` checks coverage, links, citations and declared facts. For document-only
work, the existing `check:links`, `check:citations` and `check:facts` scripts can
also run separately; facts/coverage checks need valid Legacy measurement data.
This basic sequence is not the full Alpha/security suite. An unavailable optional
backend does not block independent basic checks. On Windows, use `npm.cmd` when
the PowerShell shim is blocked. Record each actual command, its exit code,
failures and skips; do not infer success from the last command in a pipeline.

**Full security/protected verification.** Keep `npm test`, the existing Docker
isolation tests and all required gates. Follow the prepared-environment scope in
[Alpha validation CI](.github/workflows/alpha.yml), including its Linux protected
job; the basic sequence above does not replace it. `test:alpha` contains mandatory
Docker prerequisites and is not a Docker-free shortcut. If prerequisites are
missing, report the path as BLOCKED and unexecuted checks as NOT_RUN. A command
that actually fails remains a failure with its nonzero exit code. Do not remove
tests, filter out required gates or claim full regression from partial passes.

**Host Live verification.** Obtain separate execution evidence from actual Codex
and Claude sessions within the approved scope. Offline passes, Skill discovery
and Host reports alone do not prove Live success. Preserve Local/Protected
Evidence boundaries and the current unverified Host Live/automatic delegation
status; no test command here grants Live execution or external-write approval.

## Where to start reading

Start with the current product documents linked above and the
[Host guide](guides/host-native-guide.md) and
[Core guide](guides/host-core-guide.md).

The legacy engine was frozen on 2026-08-13. The map below describes that historical
baseline, not the resumed product's work queue. Legacy FINAL RULEs remain the
machine-checked contract for that engine, not the current product architecture.

```
README.md                             what this was, and what it actually measured
test/contracts/legacy/archive/2026-08-13/ARCHIVE.md    why it stopped; the source of every figure on the cover
test/contracts/legacy/INDEX.md                         every audit and run record, newest first
test/contracts/legacy/REGISTER.md                      the findings, frozen at 2026-08-13
test/contracts/legacy/concept-foundation.md            the design. FINAL RULEs are canonical
CONTRIBUTING.md                   the recording rules, each with the incident that produced it
test/contracts/legacy/rule-implementation-status.json  why each unclaimed rule is unclaimed
npm run coverage:uncovered            rules with unclaimed conditions, right now
```

The obsolete 2026-08 design handoff and progress documents were removed during the
2026-11-12 documentation consolidation. Use `project/PROGRESS.md` for
current state and `test/contracts/legacy/INDEX.md` for preserved historical evidence.

Never trust a count written in prose here. Run the command and read the number it prints.

## Rules

### Every judgment carries a number

"조심하자", "확인했다", "looks fine" say nothing. Report `3 gaps → 2`, `150 of 545 condition lines`, `13 failures, all one cause`.

A check that quantifies over a set must report what it scanned, not only its verdict. **Zero items examined is a failure, not a pass.** This has already caught two silent-green bugs here: a rule parser that read 0 blocks because of CRLF, and a coverage run that recorded no claims. Both would have passed.

**Report the denominator, not only the numerator.** `check-doc-facts.mjs` said "34 declarations checked, 0 mismatches" and was read as "every number here is right" — while 533 numbers in the same documents carried no anchor and were never looked at. It now prints the ratio and the unchecked remainder. A checker that names only what it covered is making the claim its subject is not allowed to make.

Naming an exposure does not stop it growing, so the ratio has a baseline the way rule coverage does — `npm run anchors:baseline`, `test/contracts/legacy/doc-anchor-baseline.json`. It guards both directions: removing an anchor lowers `declared`, and adding an unanchored number to a living document raises `unchecked` while `declared` sits still. Guarding only the first lets the exposure grow forever as long as nobody deletes anything.

When one number would blend two different things, split it. Mixing "no code exists" with "code exists but was never labelled" made the remaining work look larger than it was.

Do not estimate to fill a gap in measurement. Say the classification has not been done.

### Verify the verifier

Anything that measures or validates needs tests that make it fail on purpose. A guard that always returns null looks exactly like a guard that works.

`test/rule-coverage.test.ts` reproduces every failure mode of the coverage checker. `scripts/check-rule-coverage.mjs` refuses an evidence path that cannot be opened, because prose can assert anything but a path is checkable.

The same standard holds for the three document checkers — links, declared facts, file:line citations — each with a test file that drives every branch to fail on purpose. Two things they each had to learn separately, so a fourth would learn them again: **a quotation is not a claim** (a citation inside a fence, an example of the syntax, an old line number written down to correct it), and **a citation is relative to its document's target commit, not to HEAD** — comparing a dated audit against today's tree reports a hundred breakages that are not breakages.

Record only what executed. Coverage claims are `coversRule(ruleId, "condition text")` called inside a test body, so a failing or unrun test contributes nothing — the same standard the product applies to agents.

### Confirm why tests broke before fixing them

Do not say "that breakage is expected" and move on. Group the failure messages and confirm every failure has the cause you think it has.

Then keep the fix falsifiable. When a design change required adding a policy flag to 13 fixtures, a separate test with no policy block was added, asserting the refusal — otherwise the fixture edit is indistinguishable from turning the rule off.

This matters because it already went wrong: a regex sweep missed `assert.rejects(() => runTask(...))` and two tests passed for the wrong reason.

### The design fixes the shape; the implementation conforms

For the legacy engine, when `test/contracts/legacy/concept-foundation.md` already fixes field names, phase order, or matcher syntax, match it rather than inventing a variant. The HarnessWorkspaceSnapshot field grouping was written differently once and had to be rewritten. Current Host architecture is maintained in `docs/product-completion/architecture.md`; detailed implementation contracts remain under `docs/implementation/`.

If the design is wrong, change the design first and say so. Do not diverge silently.

FINAL RULEs are checked mechanically by `test/design-rules.test.ts`: required fields, id format and uniqueness, taxonomy membership, `scanScope` on any rule quantifying over a set, and the 8 declared enum divergences pinned by count.

### Distinguish what cannot be observed from what was not done

`CAPABILITY_GAP` — CodeFleet cannot observe it yet. A human can check it instead, and may waive it item by item with a justification.

`EVIDENCE_DEFECT` — evidence is missing or does not match its hash. Nobody can stand in for it. Never waivable.

A provider claim is neither. It is recorded at `PROVIDER_REPORTED_ONLY` and cannot satisfy command policy, verification, or VERIFIED. **Do not judge a claimed command against policy** — judging it means believing it.

## Coverage workflow

```bash
npm test                      # fails if coverage falls below test/contracts/legacy/rule-coverage-baseline.json
npm run coverage:uncovered    # list rules with unclaimed conditions
npm run coverage:baseline     # raise the baseline after adding claims
```

The checker fails on: an unknown ruleId, a condition quote not present in the rule, zero claims recorded, coverage below baseline, a rule with neither a claim nor a status entry, a status entry that survived after its rule got a claim, or an evidence path that does not exist.

## Document checkers

```bash
npm run check:links           # link targets, case, anchors
npm run check:citations       # file:line citations, each at its document's commit
npm run check:facts           # declared numbers against measured ones
npm run anchors:baseline      # after anchoring figures, or after deciding to let the ratio slip
```

The checkers retain the legacy living-document set (both READMEs, the relocated INDEX, REGISTER and archive cover, plus CONTRIBUTING) so relocation does not hide existing claims. Their figures retain the unchanged thresholds in `test/contracts/legacy/doc-anchor-baseline.json`. Historical findings are not current product acceptance; `project/PROGRESS.md` owns current status. Dated records are checked at their declared commits; historical unverifiable citations remain reported rather than being rewritten as current evidence.

After adding claims, the status entry for that rule must be removed from `test/contracts/legacy/rule-implementation-status.json` — the run tells you which ones.

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

**The current release is MIT licensed.** The owner explicitly approved replacing
the former all-rights-reserved policy on 2026-09-30. Preserve the `solzip`
copyright and MIT notice in distributions. Historical records describe the
policy at their original commits; they do not override the current LICENSE.
Licensing permits use but does not certify correctness or production readiness.

**This repository's official publication identity remains
`sol <solarchive.dev@gmail.com>`.** Its history was rewritten to that identity.
Preserve that policy for authorized maintainer publication; it is not a universal
Git identity for contributors or users of CodeFleet. If an intended author's
identity conflicts with this repository's policy, resolve it with the owner
before publishing, rather than impersonating the maintainer or rewriting history.
Do not automatically change local/global Git settings. Identity configuration
does not grant commit, push or PR approval.

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

## 작업 기록 규약

[CONTRIBUTING.md](CONTRIBUTING.md)가 현재 기록 규칙이다. `docs/`에는 현재 설계·수락 계약만 둔다. 사용 안내는 `guides/`, 현재 상태는 `project/PROGRESS.md`, 의도적으로 공개할 상세 증거는 `project/records/`에 둔다. 기존 실행 상태와 Work Log는 기존 저장소를 사용한다. `docs/audits`, `docs/runs`와 작업별 INDEX/REGISTER 갱신 규칙은 폐기한다. 과거 사건은 고정 Git 이력으로 보존하며 최신 상태로 재해석하지 않는다.
