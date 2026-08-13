# CodeFleet — how do you verify work an agent says it did?

> An experiment, archived on 2026-08-13 with its result and its cost.
> Not maintained; issues and pull requests are not accepted.

English | [한국어](README.ko.md)

## The question

An agent edits your repository and reports "tests pass." You now hold a claim, not a fact. If you store it as `verified: true`, the value that decides your gate no longer remembers whether anything observed it.

CodeFleet asked whether that could be closed structurally — not by trusting the agent less, but by making its report **unable to reach the decision at all.**

## The answer: one command, two files

The single completed run left a trace containing two files. Both record the same shell command.

| File | What it is | Weight |
| --- | --- | --- |
| `provider-commands.json` | `node test/check.js` — the agent's own account of what it ran | `PROVIDER_REPORTED_ONLY`, `notCommandTruth: true`. **Moves nothing** |
| `verification/verify-001.json` | `node test/check.js` — re-executed by the Harness | `HARNESS_EXECUTED`, `exitCode: 0`. **This is what moved the gate** |

The agent's report is not discarded — it is stored, graded, and structurally excluded. Gate computation filters for `HARNESS_EXECUTED` before it reads anything, so a claim cannot be mistaken for an observation even by accident.

That was the whole thesis, and in the one run that finished, it held. The rest of this page is what it cost.

Here is the run that produced those files. The task: add `subtract(a, b)` to `src/math.js`. The verification command was written to fail unless that function exists and returns the right values — and was **confirmed failing before the run started**, because a check that passes without the change proves nothing.

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

## What it figured out

Ten conclusions, with where each lives and how far it was actually checked.

| | Conclusion | Status |
| --- | --- | --- |
| 1 | **Type the source; don't flag it.** An authority ladder (`NONE` → `PROVIDER_REPORTED_ONLY` → `HARNESS_OBSERVED` → `HARNESS_EXECUTED`) makes a claim and an observation different values. A `boolean` plus a `source` field can drift apart; one graded value cannot | observed |
| 2 | **One window for state change, with a named commit point.** Eight fixed phases; nothing before M4 is durable, and a failure after M4 keeps the event rather than rolling back, because silent rollback erases what happened | observed |
| 3 | **Idempotency keys derived from meaning.** The key hashes only what changes the resulting state — no reason text, no timestamps — so a repeated request is idempotent without the caller cooperating | observed |
| 4 | **Decisions append-only; state replayed.** No mutable `approved` flag exists to go stale. The snapshot file is a read model with no authority: if it disagrees with replay, the ledger wins and the snapshot is rebuilt | observed |
| 5 | **Approval covers the contract *and* the conditions it was approved under.** `sha256(revisionHash, guardrailHash)`. Hashing only the task lets someone change the policy afterwards and still look approved — which is exactly what happened before this was fixed | observed |
| 6 | **Split what you couldn't check into two kinds.** A capability gap is something the tool cannot see yet, and a person may sign for it by name with a reason. An evidence defect is missing or hash-mismatched evidence and is never waivable. The distinction lives in data, not in judgement | observed |
| 7 | **Every check reports what it scanned, not just its verdict.** Otherwise `violations: []` means both "all clear" and "nothing was examined". Zero examined is treated as failure — this caught two silent-green bugs here | observed |
| 8 | **Keep a decision apart from its side effect.** An accepted review does not touch the workspace; `apply` is a separate human act with its own ledger entry, and it applies the *observed patch* rather than a directory that may have drifted | observed |
| 9 | **Child processes get an allowlisted environment and per-kind limits.** A secret exported in the parent was measurably absent in the child. An agent session, a test suite, and a git read do not share one timeout | observed |
| 10 | **Treat the human-readable record as an artifact.** It is the only thing anyone reads. This one is listed because it **failed twice** — first by staying silent about which command satisfied a gate, then, after that fix, by asserting that evidence it linked to did not exist | failed |
| — | **Policy composes by `meet` only; roles contribute a ceiling, never a grant.** Narrowing was observed; a widening attempt is refused in tests but never seen in real use | code only |

Two of these turned out to be one idea stated twice. The authority ladder and the gap/defect split are both answers to **how you represent not knowing, as data** — and three of the seven defect types in `LESSONS.md` share that same root: failing to distinguish *absent* from *a value*. The problem this project actually spent itself on was not verifying AI. It was representing absence.

The clearest thing to drop is the role table. Narrowing-only was right, but file-edit permission and command-execution permission were hung on one axis, so no built-in role can both write application code and run a test.

→ Each conclusion with its problem, implementation, evidence, and what to carry forward: [`docs/archive/2026-08-13/DESIGN-NOTES.md`](docs/archive/2026-08-13/DESIGN-NOTES.md)

## How far any of this was checked

Short version: **less than the list above might suggest.** "Observed" mostly means observed once.

- **The pipeline completed exactly once**, on a controlled fixture, and **four workarounds were holding it up.** One was a role substitution — of seven built-in roles, only two permit command execution, and neither of those two is a role that writes application code.
- **On a real Spring Boot project it did not complete.** Of fifteen steps, four were blocked and one failed. The command that ended up satisfying the verification gate was `gradle --version`. Our implementation could not invoke Gradle or Maven wrappers on Windows: the rule forbidding shell interpreters is correct, and it left no path to a batch file.
- **77 registered findings** — 25 resolved, 8 partial, 1 not reproduced, 15 open, 1 accepted as a limit, and **27 never checked**. Those 27 close as unchecked. Nobody looked at them after registration, and there is no basis for claiming they still hold — or that they don't.
- `npm test` exits **0** (257 passing, 0 failing). Condition coverage is 345 of 545 lines (63.3%), which means a passing test quoted that many lines — **not** that those conditions are correctly implemented.
- A CI workflow file exists and **has never run**. Nothing here was exercised under repetition, concurrency, or on POSIX.

> Runnability is not warranted. These are observations at the moment of freezing, not a claim that anything works.

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

Every judgment in this repository is cited to a file and line. The 43 audit and run records are indexed in [`docs/INDEX.md`](docs/INDEX.md); the frozen findings register is [`docs/REGISTER.md`](docs/REGISTER.md); the working conventions, each with the incident that made it necessary, are in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Successor

The product definition has been reworked and restarted under the name **Warrant** — a judgment layer that does not own an execution engine, and that keeps judgment separate from observation. There is no repository URL yet.

## License

Published for reading and evaluation only — see [`LICENSE`](LICENSE). Not open source, and no warranty of operation for any purpose.
