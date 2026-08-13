# CodeFleet (Archived)

> **Frozen on 2026-08-13.** No longer maintained. Issues and pull requests are not accepted.

English | [한국어](README.ko.md)

## What it was

CodeFleet was a CLI that tried to judge AI-delegated development work by evidence a Harness observed itself, rather than by what the agent reported. Work was expressed as a contract carrying scope, role, guardrails, and verification conditions; only a human-approved contract could execute; and the outcome was recorded as a diff, a hash, and verification commands the Harness ran on its own. It was built around one claim: **an agent's account of its own work is not evidence.**

That claim held. In the one full run, the verification command the agent ran for itself was stored as `PROVIDER_REPORTED_ONLY` and never reached the gate, while the same command re-executed by the Harness is what the judgment rested on. What did not hold was everything needed to make that claim routine.

## Why it was archived

Two structural reasons. Neither would have closed with a partial fix, and both are worth more to a reader than any individual defect.

### The design came first; the machinery that made it binding came last

It is tempting to read this as "they built before they designed." The commit record says otherwise.

| | Design document | **Machine-checkable rules** | Code (`src/`) |
| --- | --- | --- | --- |
| 2026-05-27 | first commit | 0 | first commit (same day) |
| **2026-06-23** | **420,516 B — 76% of final size** | **0** | **9 files, `run.ts` at 527 lines** |
| 2026-08-07 | — | 23 rules / 130 condition lines | August work begins |
| **2026-08-10** | — | **84 rules / 545 lines** | **coverage checker introduced** |
| 2026-08-13 | 553,130 B | 83 rules / 545 lines | 29 files, 13,308 lines |

Two months of design preceded the code: 68 of the 90 commits to the design document landed in May and June, by which point it was already three-quarters of its final size. But **none of it was in a form a machine could check.** The FINAL RULE blocks first appear on 7 August and reach their full count on 10 August — inside the same six days that carried 49 of the 51 commits to `src/`. The tool that checks code against those rules arrived on the last of those days.

So the rules, the enforcement, and the code they were meant to constrain were all written in the same week. The measured consequence: **345 of 545 condition lines are quoted by a passing test (63.3%)** — the rest are unverified either way — and the first audit performed against the definition produced two new P0 findings, one of which had been passed the day before on the strength of a code comment.

**Having a design and having a design that binds code are different projects.** This repository spent two months on the first and six days on the second.

### Judgment was never separated from observation

One file grew past 3,000 lines covering run planning, adapter launch, evidence collection, policy evaluation, and gate derivation. In that shape "is the observation correct?" and "is the judgment correct?" cannot be tested apart — changing one moves the other.

The clearest symptom is small and exact. Recording a review re-renders the human-readable run record, and that call site did not pass it the verification evidence. So the document states that no verification evidence was produced, while linking to that evidence two lines further down. Three separate fixes on the final day all had this shape: one call site updated, another silently left behind.

→ Full account with every measurement: [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md)

## State at freeze

- **On a controlled fixture the pipeline completed once** — approval, queue attachment, isolated execution, Harness-run verification, review, and reintegration. The workspace changed, and the applied patch was byte-identical to the one the Harness had observed. Four workarounds were holding it up, including a role substitution: of seven built-in roles, only two permit command execution, and none of those two is a role that writes application code.
- **On a real Spring Boot project it did not complete.** Of fifteen steps, four were blocked and one failed. The command that ended up satisfying the verification gate was `gradle --version`. Our implementation could not invoke Gradle or Maven wrappers on Windows: the rule forbidding shell interpreters is correct, and it left no path to a batch file.
- **77 registered findings** — 25 resolved, 8 partial, 1 not reproduced, 15 open, 1 accepted as a limit, and **27 never checked**. The 27 close as unchecked. Nobody looked at them after they were registered, and there is no basis for claiming they still hold — or that they don't.
- `npm test` exits **0** (257 passing, 0 failing). Condition coverage is 345 of 545 lines (63.3%), which means a passing test quoted that many lines — **not** that those conditions are correctly implemented.
- A CI workflow file exists and **has never run**.

> Runnability is not warranted. These are observations at the moment of freezing, not a claim that anything works.

## What one completed run looked like

The single fixture run is the whole working record, so it is worth stating concretely. A task said: add `subtract(a, b)` to `src/math.js`. The verification command was `node test/check.js`, written so it fails unless that function exists and returns the right values — checked first, because a verification that passes without the change proves nothing.

```
task approve      → contract frozen as sha256(revisionHash, guardrailHash)
objective attach  → the approved revision is placed in a queue
objective run-next→ git worktree created; agent runs there, never in the workspace
                    Harness runs `node test/check.js` itself → exit 0
                    worktree discarded
review            → refused: an unwaived capability gap
review --waive-gap→ accepted, recorded as DEGRADED / WAIVED_INCOMPLETE
objective import-review → decision appended to the ledger
apply             → observed patch applied to the workspace
```

That left a full run trace. Two of its files carry the same shell command, and the pair is the clearest thing this project produced:

| File | Content | Weight |
| --- | --- | --- |
| `provider-commands.json` | `node test/check.js` — the agent's own account | `PROVIDER_REPORTED_ONLY`, `notCommandTruth: true`. Moves nothing |
| `verification/verify-001.json` | `node test/check.js` — re-run by the Harness | `HARNESS_EXECUTED`, `exitCode: 0`. **This is what moved the gate** |

The workspace change was real: `git diff HEAD` came out byte-identical to the patch the Harness had recorded, and the ledger's `patchRef.hash` recomputed to match. The worktree was gone from disk and from `git worktree list` before any of that was applied — the patch survived as evidence, not as a directory.

## What it figured out

Ten conclusions, each with where it lives and how far it was actually checked. **"Validated" mostly means observed once** — one run, on a fixture, propped up by four workarounds. Nothing here was exercised under repetition, concurrency, or on POSIX.

| | Conclusion | Status |
| --- | --- | --- |
| 1 | **Type the source, don't flag it.** An authority ladder (`NONE` → `PROVIDER_REPORTED_ONLY` → `HARNESS_OBSERVED` → `HARNESS_EXECUTED`) makes a claim and an observation different values, so a gate literally cannot read one as the other. A `boolean` plus a `source` field can drift apart; one graded value cannot | observed |
| 2 | **One window for state change, with a named commit point.** Eight fixed phases; nothing before M4 is durable, and a failure after M4 keeps the event instead of rolling back, because silent rollback erases what happened | observed |
| 3 | **Idempotency keys derived from meaning.** The key hashes what changes the resulting state — no reason text, no timestamps — so repeating a request is idempotent without the caller cooperating | observed |
| 4 | **Decisions append-only; state replayed.** No mutable `approved` flag exists to go stale. The snapshot file is a read model with no authority: if it disagrees with replay, the ledger wins and the snapshot is rebuilt | observed |
| 5 | **Approval covers the contract *and* the conditions it was approved under.** `sha256(revisionHash, guardrailHash)`. Hashing only the task lets someone change the policy afterwards and still look approved — which is exactly what happened before this was fixed | observed |
| 6 | **Split what you couldn't check into two kinds.** A capability gap is something the tool cannot see yet and a person may sign for, by name, with a reason. An evidence defect is missing or hash-mismatched evidence and is never waivable. The distinction lives in data, not in judgement | observed |
| 7 | **Every check reports what it scanned, not just its verdict.** `violations: []` otherwise means both "all clear" and "nothing was examined". Zero examined is treated as failure. This caught two silent-green bugs here | observed |
| 8 | **Keep the decision and its side effect apart.** An accepted review does not touch the workspace; `apply` is a separate human act with its own ledger entry, applying the *observed patch* rather than a directory that may have drifted | observed |
| 9 | **Child processes get an allowlisted environment and per-kind limits.** A secret exported in the parent was measurably absent in the child. An agent session, a test suite, and a git read do not share one timeout | observed |
| 10 | **Treat the human-readable record as an artifact.** It is the only thing anyone reads. This one is here because it failed twice — first by staying silent about which command satisfied a gate, then, after that fix, by asserting that evidence it linked to did not exist | failed |
| — | **Policy composes by `meet` only; roles contribute a ceiling, never a grant.** Narrowing was observed; a widening attempt is refused in tests but was never seen in real use | code only |

Two of these turned out to be one idea stated twice. The authority ladder and the gap/defect split are both answers to **how do you represent not knowing, as data** — and three of the seven defect types in `LESSONS.md` share that same root, failing to distinguish *absent* from *a value*. The problem this project actually spent itself on was not verifying AI; it was representing absence.

The clearest thing to drop is the role table. Narrowing-only was right, but file-edit permission and command-execution permission were hung on one axis, so no built-in role can both write application code and run a test — which is why the one completed run needed a role substitution to finish.

→ Each conclusion with its problem, implementation, evidence, and what to carry forward: [`docs/archive/2026-08-13/DESIGN-NOTES.md`](docs/archive/2026-08-13/DESIGN-NOTES.md)

## What's worth reading

| | |
| --- | --- |
| [`docs/archive/2026-08-13/DESIGN-NOTES.md`](docs/archive/2026-08-13/DESIGN-NOTES.md) | **Ten backend design conclusions**, each with where it was implemented and how far it was actually validated — 8 observed in a run or test, 1 code-only, 1 that failed twice. The two that earned their keep both turned out to be the same problem: how to represent *not knowing* as data. An authority ladder that types a claim differently from an observation, so a gate cannot be moved by what an agent said about itself; and a split between gaps a person may sign for and evidence defects nobody can stand in for |
| [`docs/archive/2026-08-13/LESSONS.md`](docs/archive/2026-08-13/LESSONS.md) | The 50 judged findings grouped into **seven recurring types**, each with its structural cause and what would prevent it. The largest is schema fields no code consumes. Three of the types share one root — not distinguishing *absent* from *a value* — which is also why a document could end up asserting that evidence it linked to did not exist |
| [`docs/archive/2026-08-13/ENVIRONMENT.md`](docs/archive/2026-08-13/ENVIRONMENT.md) | Measured behaviour for anyone building agent tooling on Windows: a CP949 console against UTF-8 decoding of child output, batch-file wrappers unreachable behind a shell-interpreter rule, worktree paths that must be asked of git rather than normalised by the process, `SIGTERM` that only reliably kills because Windows maps it to `TerminateProcess`, and a spawn environment narrowed to `PATH` — which left the child without a home directory and made one CLI create a literal `~` folder. Each item carries its reproduction condition; 3 unresolved, 4 unverified, 1 unmeasured |
| [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md) | State, reasons, and asset list at close. The source of every number on this page, including the correction history of the section above |

Every judgment in this repository is cited to a file and line. The 43 audit and run records are indexed in [`docs/INDEX.md`](docs/INDEX.md); the frozen findings register is [`docs/REGISTER.md`](docs/REGISTER.md); the working conventions, each with the incident that made it necessary, are in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Successor

The product definition has been reworked and restarted under the name **Warrant** — redefined as a judgment layer that does not own an execution engine, and that keeps judgment separate from observation. There is no repository URL yet.

## License

Published for reading and evaluation only — see [`LICENSE`](LICENSE). Not open source, and no warranty of operation for any purpose.
