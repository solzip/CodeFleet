# CodeFleet (Archived)

> **Frozen on 2026-08-13.** This repository is no longer maintained.
> Issues and pull requests are not accepted.

English | [한국어](README.ko.md)

## What it was

CodeFleet was a CLI that tried to judge AI-delegated development work by evidence a harness observed itself, rather than by what the agent reported. Work was expressed as a contract carrying scope, role, guardrails, and verification conditions; only a human-approved contract could execute; and the outcome was recorded as a diff, a hash, and verification commands the harness ran on its own. The claim it was built around was that an agent's account of its own work is not evidence.

## Why it was archived

Two structural reasons. Neither would have closed with a partial fix, and both are worth more to a reader than the individual defects.

**The definition was written after the code, so it could not constrain it.** The product definition — 83 FINAL RULEs over 545 condition lines — was settled well after implementation was underway. It became a document to *compare* the code against rather than a place that could stop it, and that comparison had to be carried out by a person, as an audit. The first conformance audit against the definition produced two new P0 findings, one of which had been passed a day earlier on the strength of a code comment. A definition fixed after the fact can judge code; it cannot prevent it.

**Judgment was never separated from observation.** One file grew past 3,000 lines covering run planning, adapter launch, evidence collection, policy evaluation, and gate derivation. In that shape "is the observation correct?" and "is the judgment correct?" cannot be tested independently — changing one moves the other. The clearest symptom: recording a review re-rendered the human-readable run record without passing it the verification evidence, so the document stated that no verification evidence had been produced while linking to that evidence two lines further down.

→ Full account, with measurements: [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md)

## State at freeze

- **On a controlled fixture the pipeline completed once** — approval, queue attachment, isolated execution, harness-run verification, review, and reintegration. The workspace changed, and the applied patch was byte-identical to the one the harness had observed. Four workarounds were holding it up.
- **On a real Spring Boot project it did not complete.** Of fifteen steps, four were blocked and one failed; the command that satisfied the verification gate was `gradle --version`. Our implementation could not invoke Gradle or Maven wrappers on Windows — the rule forbidding shell interpreters left no way to reach a batch file.
- **77 registered findings** — 25 resolved, 8 partially resolved, 1 not reproduced, 15 open, 1 accepted as a limit, and **27 never checked**. The 27 close as unchecked: nobody looked at them after they were registered, and there is no basis for saying whether they still hold.
- `npm test` exits **0** (257 passing, 0 failing). Condition coverage is 345 of 545 lines (63.3%), which means a passing test quoted that many lines — **not** that those conditions are correctly implemented.
- A CI workflow file exists and **has never run**.

> Runnability is not warranted. These are observations at the moment of freezing.

## What's worth reading

| | |
| --- | --- |
| [`docs/archive/2026-08-13/LESSONS.md`](docs/archive/2026-08-13/LESSONS.md) | The 50 judged findings grouped into **seven recurring types**, each with its structural cause. The largest is schema fields that no code ever consumes; three of the types share one root — not distinguishing absence from a value |
| [`docs/archive/2026-08-13/ENVIRONMENT.md`](docs/archive/2026-08-13/ENVIRONMENT.md) | Measured behaviour on Windows, for anyone building agent tooling there: a CP949 console against UTF-8 decoding, batch-file wrappers unreachable behind a shell-interpreter rule, worktree paths that must be asked of git rather than normalised, and a spawn environment stripped to `PATH` — which cost the child process its home directory. 3 unresolved, 4 unverified, 1 unmeasured, each labelled |
| [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md) | State, reasons, and asset list at close. The source of every number above |

Every judgment here is cited to a file and line. The audit and run records are indexed in [`docs/INDEX.md`](docs/INDEX.md); the findings register is [`docs/REGISTER.md`](docs/REGISTER.md).

## Successor

The product definition has been reworked and restarted under the name **Warrant**. There is no repository URL yet.

## License

Published for reading and evaluation only — see [`LICENSE`](LICENSE). Not open source, and no warranty of operation for any purpose.
