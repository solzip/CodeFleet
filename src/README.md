# src/ — read this before you open `run.ts`

Archived 2026-08-13. Covers: [한국어](../README.md) · [English](../README.en.md).

## The thing you are about to notice

`run.ts` is **3,038 lines.** That is the largest single defect in this
repository, it is known, and it is one of the two reasons the project was
closed rather than continued.

One file holds five jobs that should not share a file:

| | |
| --- | --- |
| Run planning | resolve the approved contract, role, mode, adapter, isolation |
| Adapter launch | start the agent inside an isolated worktree |
| Evidence collection | snapshots, changed files, git diff, command records |
| Policy evaluation | path policy, command policy, risk rules |
| Gate computation | decide what the collected evidence permits |

The cost is not aesthetic. **Observation and judgment cannot be tested
apart** when they live in one module: you cannot ask "was the observation
correct?" and "was the verdict correct?" as separate questions, and every
fix to one moves the other. Three of the defects fixed on the last day
were that exact shape — a caller that forgot to pass evidence to the
thing that renders it, so a completed run produced a document asserting
that no evidence existed, two lines above a link to it.

Full reasoning, with the measured chronology of how it got this way:
[`docs/archive/2026-08-13/ARCHIVE.md`](../docs/archive/2026-08-13/ARCHIVE.md) §3-2.

## Why it was not refactored

Splitting it would have been a rewrite of the layer, not a cleanup, and
the successor project starts from that split rather than arriving at it.
Leaving the file at its real size — and saying so here — is more useful
than a partial extraction that hides the shape while keeping the coupling.

## What is worth reading instead

| | |
| --- | --- |
| `mutation.ts` | the eight-phase state change with one commit point, and the idempotency key derived from meaning |
| `task-ledger.ts` | approval replayed from events; no mutable `approved` field exists |
| `command-policy.ts` | argv-based matching, shell interpreters denied at argv[0], denied beats allowed |
| `isolation.ts` | git worktree lifecycle, and what a discard that failed is allowed to claim |
| `review.ts` | the gap / evidence-defect split, and why one of them can never be waived |

`test/` is 11,028 lines against these 13,308 — the failure modes of every
checker are reproduced on purpose rather than assumed.
