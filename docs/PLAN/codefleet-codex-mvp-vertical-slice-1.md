# Codex App Server — first isolated implementation slice

Status: `CODE_WRITTEN / OFFLINE_NOT_RUN / HOST_LIVE_UNVERIFIED / NOT_AUTHORIZED_FOR_PUBLIC_EXECUTION`.

Source baseline: `b89f0feaf8fb4e30db0031173aeb7c61095abf1a`.
Design authority: `docs/PLAN/codefleet-execution-contract-r3.md`.
Branch: `work/codex-mvp-vertical`.

## Implemented in this slice

- `src/hosts/codex-app-server-session.mjs` expresses a **one-process, one-thread,
  one-turn, read-only proposal** lifecycle against the official Codex 0.166.0
  App Server JSONL protocol. It checks request IDs, returned thread/turn IDs,
  terminal status and a bounded set of events, and rejects tool events and server
  approval requests instead of automatically answering them.
- `src/hosts/codex-managed-host-execution.mjs` supplies the existing
  `executeWorkflow(..., {hostExecution})` seam. It requires an already-reserved
  Workflow child, live parent lease, current Workflow approval and revision
  binding **before** it calls a Host transport, and rechecks after the Turn.
  The Turn cwd is read from the child's persisted isolated candidate directory,\n  never accepted from Host output or an external adapter override. The child\n  must have entered the existing `GENERATING` state with a reserved billable\n  attempt before any Turn. It only returns an untrusted `PROPOSAL_ONLY` result; the existing Controller
  remains responsible for applying proposed edits in an isolated candidate,
  running verification and using the existing Judge. Cost remains `UNKNOWN`.
- Focused protocol and adapter tests (the latter uses a fake Store and a fake
  transport) cover baseline wiring, denied/unreserved dispatch, stale revisions,
  unexpected methods, tool items, response identity and result rejection.

The default adapter is `enabled: false`. The slice creates **no public CLI
entrypoint**, installer, service, direct API credentials, Operator grant, altered
Workflow DB schema, migration or alternative scheduler. Calling code must
separately establish an actual trusted execution policy before enabling the
injected Host seam. No existing production isolation guard is removed.

## Explicit limitations and future integration gates

1. **This is not a completed Host Protocol Proof.** The first P1 failed on
   a missing stable Notification allowance. P1 R2 remains unexecuted and needs
   independent local authorization. This branch does not perform that run.
2. A Codex read-only proposal Turn is **not Codex applying actual code edits**.
   The Controller's existing proposed-edit candidate route remains in place.
   Real bounded Host writes, strict workspace enforcement and tool-effect
   receipts require separately implemented and locally verified contracts.
3. Workflow reserve/finish are reused unchanged. The existing
   `workflow_attempts(runId,itemId)` key prohibits same-item Repair generations;
   this slice does not pretend to solve D12.
4. Candidate acceptance is **not delivery to the user's target repository**.
   There is no local destination apply/post-apply verification in this slice.
5. Current Alpha has a pre-existing failing-regression requirement. A general
   user Objective/new-project flow is **not** implemented by this slice.
6. The proposed read-only Turn currently rejects any tool activity, even
   benign command-based reads, because tool provenance and scopes are not yet
   proven. Real Codex may therefore return a safe failure instead of a proposal.
7. The App Server Notification allowlist is a minimal proposed 0.166.0 profile,
   not a claim of exhaustive version compatibility. Unexpected events fail closed.
8. No exact-once effect claim is made: a transport error leaves effect status
   uncertain, and the existing persisted Attempt must not be automatically
   replayed.

## Next bounded validation

In a trusted local clone/worktree, without touching user-owned dirty files:

```text
node --check src/hosts/codex-app-server-session.mjs
node --check src/hosts/codex-managed-host-execution.mjs
node --test test/codex-app-server-session.test.mjs test/codex-managed-host-execution.test.mjs
```

Record full outcomes, source SHA, Node/Codex version and failing traces in the
local verification report. These commands **have not been executed by the
GitHub-only authoring environment**.

Acceptance remains gated on P1 R2 -> read-only Turn/P2 -> real bounded Host
edits/P3 -> actual independent Evidence/Judge -> approved destination delivery
and Objective E2E, using the Product Vision and R3 distinctions. Never label
this slice `HOST_LIVE_VERIFIED`, `PROTECTED`, or `OBJECTIVE_COMPLETE`.
