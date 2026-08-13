# CodeFleet — Archived

> **This repository was frozen on 2026-08-13.** It is not maintained, and issues and pull requests are not accepted.
> Development continues in a different repository.

[한국어](README.md) | English

## What it was

A CLI that tried to judge delegated development work **by evidence the Harness observed itself, rather than by what the agent said it did**. Work was defined as a contract carrying scope, role, guardrails, and verification conditions; only a human-approved contract could execute; and the result was recorded as a diff, a hash, and verification commands the Harness ran on its own.

The central claim was never "it calls an AI" but **"an agent's account of its own work is not evidence."** That distinction held to the end — in the one real run, the verification command the agent ran for itself was stored separately as `PROVIDER_REPORTED_ONLY` and never reached the gate, while the same command re-executed by the Harness is what the judgment rested on.

## Why it closed

Two things that no partial fix would close.

**The product definition was fixed after the code, so it could not constrain it.** The definition (`docs/concept-foundation.md`, 83 FINAL RULEs) was settled well after the code was underway. It therefore became a document to *compare* the code against rather than a place that could stop it, and the comparison had to be carried out by a person, as an audit.

**The judgment layer was never separated from the execution-observation layer.** A single file, `src/run.ts`, runs past 3,000 lines covering Run planning, adapter launch, evidence collection, policy evaluation, and gate derivation. In that shape you cannot test "is the observation right?" separately from "is the judgment right?".

→ Full account: [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md)

## What actually worked

**On a controlled fixture it completed once.** Against an ASCII-path repository of three files it went from approval through queue attachment, isolated execution, Harness verification, review, and reintegration; the workspace really changed, and the applied patch was byte-identical to the one the Harness had observed. **Four workarounds were holding it up** — a substituted role, degraded observation accepted in writing, an extra adapter argument, and a preview command skipped because it cannot run.

**On a real project (Spring Boot) it did not complete.** Of fifteen steps, four were blocked and one failed. The verification command that satisfied the gate was `gradle --version`. A full lap left the repository unchanged.

| | |
| --- | --- |
| Registered findings | **77** — 25 resolved / 8 partial / 1 not reproduced / 15 open / 1 accepted limit / **27 never checked** |
| `npm test` | exit code **0** (257 passing, 0 failing) |
| Condition coverage | 345 of 545 lines (63.3%) |
| CI | a workflow file exists but **has never run** |

**The 27 unchecked findings are closed as unchecked.** Nobody looked at them after they were registered, and there is no basis for saying whether they still hold. (An investigation just before the freeze brought this from 39 to 27 by settling twelve of them, each with a file:line citation.)

**63.3% coverage does not mean 63.3% of the design is implemented.** It means a passing test quoted that many condition lines — not that those conditions are correctly implemented.

> **Runnability is not warranted.** The numbers above are observations at the moment of freezing, not a guarantee that anything runs.

## What survived

The code is discarded. These are the inputs to the next project.

| Document | Why it survived |
| --- | --- |
| [`docs/archive/2026-08-13/LESSONS.md`](docs/archive/2026-08-13/LESSONS.md) | Groups the 50 judged findings into **seven recurring types**, each with its structural cause and what would prevent it. The only output here that outlives the individual defects |
| [`docs/archive/2026-08-13/ENVIRONMENT.md`](docs/archive/2026-08-13/ENVIRONMENT.md) | What was **measured** on Windows, git, and spawn: a CP949 console, wrappers unreachable, worktree paths that must be asked of git, a spawn environment stripped to `PATH`. The code goes; the environment stays. 3 unresolved / 4 unverified / 1 unmeasured |
| [`docs/archive/2026-08-13/ARCHIVE.md`](docs/archive/2026-08-13/ARCHIVE.md) | State, reasons, and asset list at close. The source of every number above |
| [`docs/concept-foundation.md`](docs/concept-foundation.md) | The design of record at archive time (83 FINAL RULEs). **The successor writes its own** |
| [`docs/audits/`](docs/audits/) · [`docs/runs/`](docs/runs/) | 43 audit and run records (36 audits, 7 runs). Every judgment is cited to a file and line |
| [`docs/REGISTER.md`](docs/REGISTER.md) · [`docs/INDEX.md`](docs/INDEX.md) | The frozen findings register and the document index |
| [`docs/archive/2026-08-13/README.original.md`](docs/archive/2026-08-13/README.original.md) · [`README.en.original.md`](docs/archive/2026-08-13/README.en.original.md) | The READMEs as they stood before the freeze — evidence of how this was described before the definition existed |

## What comes next

The product definition has been reworked and continues in a new repository named **Warrant**. There is no URL yet.

What changed maps directly onto why this one closed.

- **Redefined as a judgment layer.** Not an orchestrator, but the layer that answers "does this change satisfy the approval conditions?"
- **It does not own an execution engine.** Launching and supervising agents is not its responsibility
- **Judgment is separated from observation.** The layer that describes what was observed is not the layer that rules on it

---

Published for reference. **No warranty of operation for any purpose.**
