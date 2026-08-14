# CodeFleet — how do you verify work an agent says it did?

> A structure that keeps an agent's "tests pass" from **reaching the decision at all**, tested end to end.
> It **completed once under controlled conditions and never on a real project.** 77 findings were registered and
> adjudicated, each cited to a file and line. <!-- fact: registered-findings = 77 -->
> Archived 2026-08-13 — not maintained; issues and pull requests are not accepted.

English | [한국어](README.md)

## The question

An agent edits your repository and reports "tests pass." You now hold a claim, not a fact. If you store it as `verified: true`, the value that decides your gate no longer remembers whether anything observed it.

CodeFleet asked whether that could be closed structurally — not by trusting the agent less, but by making its report **unable to reach the decision at all.**

There are three things here worth taking even if you never touch an agent: **deriving an idempotency key from meaning rather than from the caller**, **treating a check that examined nothing as a failure rather than a pass**, and **giving state changes exactly one commit point and naming it.** All three are below under "What it figured out" with their evidence — the first as code, the second as the three silent-green bugs the rule caught — **one of which was this repository** — the third as the eight phases by name — and none of them depend on this project being about agents.

## The answer: one command, two files

The single completed run left a trace containing two files. Both record the same shell command.

| File | What it is | Weight |
| --- | --- | --- |
| `provider-commands.json` | `node test/check.js` — the agent's own account of what it ran | `PROVIDER_REPORTED_ONLY`, `notCommandTruth: true`. **Moves nothing** |
| `verification/verify-001.json` | `node test/check.js` — re-executed by the Harness | `HARNESS_EXECUTED`, `exitCode: 0`. **This is what moved the gate** |

The agent's report is not discarded — it is stored, graded, and structurally excluded. The grade is a type, not a flag:

```ts
type VerificationAuthority =
  "NONE" | "PROVIDER_REPORTED_ONLY" | "HARNESS_OBSERVED" | "HARNESS_EXECUTED" | "WAIVED_BY_POLICY";

// Gate computation filters before it reads anything:
const executed = attempts.filter((a) => a.authority === "HARNESS_EXECUTED");
```

A `boolean` plus a separate `source` field can drift apart. One graded value cannot — there is no state in which a claim is readable as an observation.

That was the whole thesis, and in the one run that finished, it held. Below: what it looked like in practice, what came out of it, and what it cost.

### The contract those files came from

"Contract" is the load-bearing word, so here is a real one — the task that produced the run above, verbatim:

```yaml
id: add-subtract
goal: "Add a subtract(a, b) function to src/math.js that returns a - b, and export it."
agentRole: INFRA_OPERATOR          # a classification: contributes a ceiling, never a grant
scope:
  include: ["src/**"]              # enforced against the observed changed-file list
  exclude: ["test/**"]             # the agent cannot edit what scores it
verification:
  commands:
    - commandId: fixture-check
      command: ["node", "test/check.js"]    # argv, never a shell string
doneCriteria:
  - "src/math.js defines subtract(a, b) returning a - b."
  - "node test/check.js exits 0."
```

Two details carry most of the design. `command` is an **argv array, never a shell string** — a shell string cannot be matched against a command policy, so accepting one would make the policy decorative. And `scope.exclude` is what keeps the agent out of the file that judges it, checked against what the Harness observed changing rather than against what the agent said it touched.

Approving this task freezes it: `sha256(revisionHash, guardrailHash)` covers both the text above and the workspace policy in force at that moment.

### The run

The verification command was written to fail unless `subtract` exists and returns the right values — and was **confirmed failing before the run started**, because a check that passes without the change proves nothing.

```
task approve       → contract frozen as sha256(revisionHash, guardrailHash)
objective attach   → the approved revision is placed in a queue
objective run-next → git worktree created; the agent works there, never in the workspace
                     Harness runs `node test/check.js` itself → exit 0
                     worktree discarded
review             → refused: an unwaived capability gap
review --waive-gap → accepted, recorded as DEGRADED / WAIVED_INCOMPLETE
objective import-review → decision appended to the ledger
apply              → the observed patch applied to the workspace
```

`git diff HEAD` came out byte-identical to the patch the Harness had recorded, and the ledger's `patchRef.hash` recomputed to match. The worktree was already gone from disk and from `git worktree list` — the patch survived as evidence, not as a directory, which is why reintegration was still possible.

### What "evidence" actually means here

The run left a directory. Its contents are the answer to "what would you need in order to disagree with this decision six months from now":

```
run-plan.json            the contract as resolved: approval hashes, effective policy, gates
prompt.md                what the agent was actually told
adapter-request.json     what the adapter was permitted to do
harness-observation.json changed files, path/command policy checks, workspace snapshots
provider-commands.json   what the agent said it ran          ← graded, disregarded
verification/verify-001.json  what the Harness ran itself    ← this moved the gate
adapter-result.json      exit status, truncation counts
git-diff.patch           the observed change
run-summary.json         derived, explicitly not decision truth
run-record.md            the one file a person reads
```

Two properties matter more than the list. Every artifact names the contract it belongs to (`taskId` + `taskRevision`), so losing any one of them does not orphan the rest. And each one records `unavailableReason` for anything it could not collect, so a gap in the evidence is a value in the file rather than a shorter file.

The decision itself lives somewhere else — one line appended to a ledger, which is what "append-only" means concretely:

```json
{ "seq": 4, "eventId": "evt_000004_fa210ced", "type": "RUN_RESULT_APPLIED",
  "actorId": "sol", "at": "2026-08-13T01:06:55.478Z",
  "reason": "accepted review 2026-08-13_001-review-002; bring the isolated tree's change into the workspace",
  "payload": {
    "runId": "2026-08-13_001", "taskId": "add-subtract", "taskRevision": 1,
    "reviewDecisionId": "2026-08-13_001-review-002",
    "patchRef": { "path": ".codefleet/runs/.../git-diff.patch",
                  "hash": "7ee840706a78708ed4b527dd6d21fb688e9b5c2eee968be5102201c49595d0c8" } } }
```

`reason` is required and free text; `seq` and `eventId` make gaps detectable; `patchRef.hash` is what lets someone recompute, months later, whether the change in the workspace is the change that was approved. Recomputing it after the fact is how the byte-identity above was confirmed.

## What it figured out

Ten conclusions. **Two of them** — 2 and 7 in the table below — transfer to any backend with no agent involved, and because 2 has two halves that comes to three things to take. Those first.

**Idempotency keys derived from meaning, not from the caller.** Most idempotency is a client-supplied request id, which means it works only when the client cooperates. Here the key is a hash of what actually changes the resulting state — and deliberately excludes reason text and timestamps, so the same decision made twice collapses to one:

```ts
export function computeMutationId(intent: MutationIntent): string {
  const canonical = JSON.stringify([
    intent.mutationKind,
    intent.targetId,
    intent.targetHash ?? "",
    canonicalize(intent.semanticPayload)   // only fields that change state
  ]);
  return `mut_${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}
```

Running `apply` twice produced the same `mut_fa210cedffe0ce00` and appended no second event.

**Every check reports what it scanned, not just its verdict.** Otherwise `violations: []` means both *all clear* and *nothing was examined*, and those are the same value. Zero examined is treated as a failure, not a pass. This caught **three** silent-green bugs here: a rule parser that read 0 blocks because of CRLF and reported success, a coverage run that recorded no claims at all, and **this repository itself**.

The third took longest. The checker built to stop figures in the documentation going stale printed only this:

```
declarations checked   34
mismatches             0
```

The other **533 numbers in those same documents were not being checked**, and that output read as "the figures here are correct." It is the `violations: []` defect exactly — *all clear* and *only what I was pointed at* collapsing to one value. **A repository that wrote the rule down as a conclusion then broke it in the tool built to enforce that conclusion**, and stayed green for a day. It now prints the denominator and the unchecked remainder, with a baseline under the ratio.

**Every state change goes through eight fixed phases, and exactly one of them commits.**

```
M0_RESOLVE      derive the mutation id from meaning
M1_ACQUIRE      take the lock, naming the holder
M2_PRECHECK     refuse here — nothing durable has happened yet
M3_IDEMPOTENCY  this id already in the ledger? then stop, report, change nothing
M4_APPEND       ← the commit point
M5_REBUILD      regenerate the read model
M6_POSTCHECK    does the rebuilt state validate?
M7_RELEASE      release the lock
```

A failure before M4 leaves nothing behind. A failure *after* M4 does **not** roll back — the event stays and the outcome reports which phase died, because silent rollback erases the fact that something happened. That is the opposite of the usual instinct, and it is deliberate: an append-only ledger that quietly un-appends is not append-only.

The rest, in brief — each expanded with implementation and evidence in [`DESIGN-NOTES.md`](docs/archive/2026-08-13/DESIGN-NOTES.md):

| | Conclusion | Status |
| --- | --- | --- |
| 1 | Type the source, don't flag it — **the authority ladder above** | observed |
| 2 | One window for state change, with a named commit point — **the idempotency key and eight phases above** | observed |
| 3 | Decisions append-only, state replayed. The snapshot is a read model with no authority | observed |
| 4 | Approval covers the contract *and* the conditions it was approved under | observed |
| 5 | Policy composes by `meet` only; roles contribute a ceiling, never a grant. Narrowing was observed; a widening attempt is refused in tests but never seen in real use | **code only** |
| 6 | Split what you couldn't check into two kinds — a gap a person may sign for, and an evidence defect nobody can stand in for. The distinction lives in data, not in judgement | observed |
| 7 | Every check reports what it examined, not only its verdict — **the zero-items rule above** | observed |
| 8 | Keep a decision apart from its side effect. `apply` is a separate human act, and it applies the *observed patch*, not a directory that may have drifted | observed |
| 9 | Child processes get an allowlisted environment and per-kind limits. A secret exported in the parent was measurably absent in the child | observed |
| 10 | Treat the human-readable record as an artifact — listed because it **failed twice**: first silent about which command satisfied a gate, then asserting that evidence it linked to did not exist | **failed** |

Two of these turned out to be one idea stated twice. The authority ladder and the gap/defect split are both answers to **how you represent not knowing, as data** — and three of the seven defect types in `LESSONS.md` share that same root: failing to distinguish *absent* from *a value*. The problem this project actually spent itself on was not verifying AI. It was representing absence. That was not the problem it set out to solve: **it took writing all ten down to see they were one.**

→ Each conclusion with its problem, implementation, evidence, and what to carry forward: [`docs/archive/2026-08-13/DESIGN-NOTES.md`](docs/archive/2026-08-13/DESIGN-NOTES.md)

## "Isn't this just CI?"

It is the first thing anyone asks, and it is about ninety percent right. Running the tests yourself after the agent finishes gets you most of this for almost none of the cost. If that is all you need, do that.

What it does not get you is the other ten percent, and the four pieces of it are the part worth arguing about:

- **The contract is fixed before execution, not after.** Approval hashes the task *and* the policy it was approved under — `sha256(revisionHash, guardrailHash)`. Change the workspace policy afterwards and the run is refused, because the approval covered conditions that no longer hold. Re-running CI against a moved target tells you nothing about what was agreed.
- **The agent cannot edit the thing that judges it.** Scope is `include: src/**`, `exclude: test/**`, enforced against the observed changed-file list. The fixture run reports `1 path(s) checked against 1 allowed and 1 denied pattern(s)`. A green CI run says the tests passed; it does not say the agent left the tests alone.
- **What could not be checked is recorded, not omitted.** A CI run that skips a step is usually just a shorter log. Here an unobservable channel becomes a named `CAPABILITY_GAP` that blocks acceptance until a person signs for it by name — and the signature, with its reason, lands in the ledger.
- **The decision is append-only.** There is no mutable `approved` field to quietly become true. State is replayed from events; a snapshot that disagrees loses to the ledger.

So: CI answers *did the tests pass*. This was trying to answer *is the record of this work something you can rely on later* — and those turn out to be different questions once the thing doing the work is also the thing reporting on it.

## What not to repeat

Five shapes in this codebase produced defects. The first three are small enough to recognise on sight; the last one happened in the record rather than in the code.

**An optional argument for something that is never actually optional.** The run record renderer took its evidence like this:

```ts
export interface RunRecordInput {
  // ...
  verificationEvidence?: Record<string, unknown> | null;   // ← the whole defect
}
```

Every run produces verification evidence, so this was never genuinely optional — it became optional because one call site did not pass it. `undefined` then selected the branch that prints *"No verification evidence was produced."* A false sentence in the only document a person reads, produced by a question mark.

The fix idiom was already in the same file's neighbour: `verificationEvidenceRef: FileRef | null` forces every call site to state something. **Prefer `| null` over `?:` for anything an artifact will assert.** The type system will not ask you the question; the punctuation decides it silently.

**A renderer that receives evidence as an argument instead of reading it.** The same defect from a different angle. As long as the renderer is *handed* the evidence, a call site that forgets is possible; if it reads from the evidence store itself, that failure mode does not exist. Passing state to a formatter feels cleaner and creates a second place where the truth can be wrong.

**Defaults that fabricate a value for absence.**

```ts
workspaceRootRef: input.workspaceRootRef ?? ".",
selectedWorkspaceRootRealPath: input.selectedWorkspaceRootRealPath ?? "",
```

`?? "."` is not an absence marker — it is an assertion that the working directory *is* the repository root. Every other field in that same artifact expresses absence as `{ value, unavailableReason }`; these three quietly opted out. `??` and `||` are the shortest way to satisfy a type checker, and the type checker never asks what the default means.

**One axis carrying two unrelated permissions.** Roles set a ceiling over both file editing and command execution at once, so of seven built-in roles only two allow running commands, and neither of those is a role that writes application code. The narrowing rule was correct; hanging two independent capabilities on one ordering was not. The completed run needed a role substitution purely because of this.

**Whoever fixed it did not update the register.** This is a defect in the record rather than in the code, and it happened more often than the three above combined. Opening eleven stranded findings showed **eight were already fixed** and only the register did not know. When the 27 unchecked ones were adjudicated after the freeze, one of them had been judged *invalidated* two days earlier. If fixing a defect and carrying the judgment across are two separate jobs, the second stops happening.

**This one is not fixed.** Three document checkers (links, prose figures, file:line citations) hang off `npm test`, but what they catch is a **stale figure, a broken link, a drifted citation** — not a judgment that was never carried across. That still needs a person. The root is the same one: **a single fact lives in many copies with no source of truth.** The checkers sit on top of that; they did not reduce it.

The first three share the root named above: **absence and value were not kept distinct.** A missing argument, a fabricated default, and a field declared but never produced are the same mistake wearing different clothes — which is why the fix for each is the same instinct, to make the type refuse to compile until someone says what absence means here.

## How far any of this was checked

Short version: **less than the list above might suggest.** "Observed" mostly means observed once.

- **The pipeline completed exactly once**, on a controlled fixture, and **four workarounds were holding it up.** One was a role substitution — of seven built-in roles, only two permit command execution, and neither of those two is a role that writes application code.
- **On a real Spring Boot project it did not complete.** Of fifteen steps, four were blocked and one failed. The command that ended up satisfying the verification gate was `gradle --version`. Our implementation could not invoke Gradle or Maven wrappers on Windows: the rule forbidding shell interpreters is correct, and it left no path to a batch file.
- **77 registered findings** — 25 resolved, 8 partial, 1 not reproduced, 15 open, 1 accepted as a limit, and **27 never checked**. The register froze those 27 as unchecked, and every one was adjudicated afterwards — **21 valid / 3 resolved / 1 invalidated / 2 partial** ([record](docs/runs/2026-08-14/unchecked-27-adjudication.md)). The counts above and the status column were left alone under the freeze rule, so **reading this table alone says "nobody looked", and that is no longer true.** <!-- fact: registered-findings = 77 --> <!-- fact: findings-resolved = 25 --> <!-- fact: findings-partial = 8 --> <!-- fact: findings-not-reproduced = 1 --> <!-- fact: findings-open = 15 --> <!-- fact: findings-accepted-limit = 1 --> <!-- fact: findings-unchecked = 27 -->
- `npm test` exits **0 on Windows**, where this was developed (324 passing, 0 failing). <!-- fact: tests-passing = 324 --> <!-- fact: tests-failing = 0 --> **The one time CI ran, both platforms failed** — six tests on Linux, two on Windows. One of the six is a POSIX behaviour this archive predicted and never measured; the two on Windows are **tests added just before the freeze, failing on themselves**. **The workflow was then removed** — an archive has nobody to read a red check and act on it — and the run ids are kept in the record ([record](docs/runs/2026-08-13/ci-first-run.md)). Condition coverage is 345 of 545 lines (63.3%), which means a passing test quoted that many lines — **not** that those conditions are correctly implemented. <!-- fact: conditions-covered = 345 --> <!-- fact: condition-lines = 545 --> <!-- fact: coverage-percent = 63.3 -->
- **Nothing here was exercised under repetition, concurrency, or multiple users.**

> Runnability is not warranted. These are observations, not a claim that anything works.
> **The test count and the CI results were measured after the freeze**; the rest are figures from the moment of freezing.

## Why it stopped here

Two structural reasons, neither of which a partial fix would have closed.

**The design led by two months; the machinery that made it binding arrived at the end.** 68 of the 90 commits to the design document landed in May and June, by which point it was three-quarters of its final size — but **none of it was in a form a machine could check.** The rule blocks first appear on 7 August and complete on 10 August, inside the same six days that carried 49 of the 51 commits to `src/`, and the tool that checks code against them arrived on the last of those days. Having a design and having a design that binds code are different projects; this repository spent two months on the first and six days on the second. 63.3% is the size of what that left.

**Judgment was never separated from observation.** One file grew past 3,000 lines covering run planning, adapter launch, evidence collection, policy evaluation, and gate derivation. In that shape "is the observation correct?" and "is the judgment correct?" cannot be tested apart. The symptom is exact: recording a review re-renders the human-readable run record, and that call site did not pass it the verification evidence — so the document asserts that no verification evidence was produced while linking to that evidence two lines further down. Three separate fixes on the final day all had this shape.

→ Full account with the measured chronology: [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md)

## Further reading

| | |
| --- | --- |
| [`DESIGN-NOTES.md`](docs/archive/2026-08-13/DESIGN-NOTES.md) | The ten conclusions in full — problem, implementation, evidence, and what a successor should keep or drop |
| [`LESSONS.md`](docs/archive/2026-08-13/LESSONS.md) | The 50 judged findings grouped into seven recurring types with their structural causes. The largest is schema fields no code consumes |
| [`ENVIRONMENT.md`](docs/archive/2026-08-13/ENVIRONMENT.md) | Measured behaviour for anyone building agent tooling on Windows: a CP949 console against UTF-8 decoding of child output, batch wrappers unreachable behind a shell-interpreter rule, worktree paths that must be asked of git, `SIGTERM` that only reliably kills because Windows maps it to `TerminateProcess`, and a spawn environment narrowed to `PATH` — which left the child without a home directory. Each with its reproduction condition; 3 unresolved, 4 unverified, 1 unmeasured |
| [`ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md) | State, reasons, and asset list at close. The source of every number on this page |

Every judgment in this repository is cited to a file and line. The 51 audit and run records are indexed in [`docs/INDEX.md`](docs/INDEX.md); <!-- fact: audit-run-records = 51 --> the frozen findings register is [`docs/REGISTER.md`](docs/REGISTER.md); the working conventions, each with the incident that made it necessary, are in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Successor

The product definition has been reworked and restarted under the name **Warrant** — a judgment layer that does not own an execution engine, and that keeps judgment separate from observation. There is no repository URL yet.

## License

Published for reading and evaluation only — see [`LICENSE`](LICENSE). Not open source, and no warranty of operation for any purpose.
