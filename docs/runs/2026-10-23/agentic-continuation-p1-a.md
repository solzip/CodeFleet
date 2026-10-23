# P1-A: single-Agent continuation and Human Handoff

- Baseline: local and GitHub main `6daff35c1f1903de92de7502cc331be4f1ceabaf`.
- Environment: Windows, PowerShell, Node 24.14.1. No commit or push.
- Scope: the current user's Agentic Development Loop Integration request. This
  is not the older CLI-exit-code P1-A label in the [execution roadmap](../../CODEFLEET_CODEX_EXECUTION_ROADMAP.md).
- Predecessor: the local P0-B proposal investigation (not included in this
  publication). The subsequent explicitly approved local run is identified below.

## Retained P0-B evidence

Task `task-95efc7f6-c13b-4ca7-9b0e-6b739ff647e7`, current revision 7:
`todo=MATERIALIZED`, `tests=LOCAL_PASSED`. Its approved single local run reported
six passed tests, native exit 0, LOCAL_EXECUTED / UNPROTECTED, protected verification
UNSATISFIED and complete false. The evidence reference is
`642811a150845b4dedc66e6541b55a3c17071d28da96c95f63ef447b760b9e0d`.
The pure protected Judge returned ESCALATE separately; it did not advance the workflow.

This turn read the original SQLite state in immutable read-only mode, checked
artifact digests and passed that snapshot to the changed report function.
The result was HUMAN_HANDOFF with the existing evidence's ESCALATE diagnostic.
Before/after hashes of all files in the private experiment root were identical.
No original test, model call, approval, materialization or trust was replayed.

## Reused paths and minimum change

- [Report](../../../src/product/report.mjs): existing `bootstrapActions` still
  chooses dependency-ready actions. Add one advisory `continuation` containing
  the current revision/workflow, one next WorkItem, and proposal/operator/trust/
  handoff status. `executionGranted` and `automaticReplay` are always false.
  Existing nextActions remain compatible. Local completion now explicitly hands
  off the unfinished Objective even when nextActions says NO_FURTHER_ACTION.
- The same report exposes the existing pure Judge result separately from local
  status, with `stateTransition: false`. Stale/invalid evidence is not presented
  as a current judgment. External file drift triggers Human Handoff.
- [Bootstrap tests](../../../test/bootstrap-verify.test.mjs): extend the real
  fixture path from proposal through approval, materialization, next dependent
  item, failed verification, approved repair, success and protected handoff.
  Additional cases cover uncertain execution, stale evidence and revision conflict.
- [Task operations](../../../src/product/tasks.mjs) retain their original gates;
  [Local backend](../../../src/verification/backends.mjs) retains exact-command,
  exact-tree, unisolated acknowledgement and one-use in-memory grants.
- [Controller](../../../src/alpha/controller.mjs),
  [workflow persistence](../../../src/workflow/persistence.mjs) and
  [Store](../../../src/alpha/store.mjs) retain reservation, lease fencing and
  uncertain-STARTED reconciliation. No new scheduler, engine or database.
- [Host Skill](../../../src/hosts/install.mjs) remains proposal-only. The public
  Host execution and OS-authenticated Broker restrictions are unchanged.

## Verification actually executed

| Command | Result |
| --- | --- |
| `node --test test/bootstrap-verify.test.mjs` (initial report change) | exit 0, 15 passed |
| `node --test test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs test/host-planning.test.mjs` (final source) | exit 1, 94 passed / 1 failed of 95 |
| `node --test --test-name-pattern="^(alpha stale worker\|alpha leases\|H3: revision\|graph revisions)" test/alpha.test.mjs test/operator-runtime.test.mjs test/workflow.test.mjs` | exit 0, 4 selected tests passed |
| `node --test test/task-revision.test.ts test/required-gates.test.ts` | exit 0, 20 passed; scoped Legacy regression only |
| Read-only P0-B snapshot/report inspection via Python stdin and Node module evaluation | exit 0; original experiment unchanged |
| `npm.cmd run pretest` then `npm.cmd run test:legacy` | both exit 0; 324 passed |
| `npm.cmd run test:host-core` | exit 0; 13 passed |
| `npm.cmd run posttest` | exit 0; coverage, links, citations and declared facts checked |

The scoped Legacy run initially added its claims to previous generated coverage:
the first facts check exited 1 (mixed claims plus the not-yet-updated INDEX count).
All previous generated coverage was moved intact into a private archive before
the standard pretest/full Legacy sequence regenerated the current measurement.
Historical declarations and thresholds were not changed. INDEX and both README
record counts only account for this added run record, preserving earlier edits.
The initial citation check also exited 1 on sandbox Git ownership; the owner-context
retry passed without Git configuration changes. Final posttest examined 172 Markdown
files, 610 links, 527 citations and 42 fact declarations; no broken living citations
or fact mismatches. It retains 42 unresolved historical citations and 13 suspect
dated citations; exit 0 is not a claim that those historical issues are resolved.

The failed H6 test requires CODEFLEET_TEST_DOCKER=1 and a pinned Operator image;
the required flag was absent. It failed its prerequisite assertion before Docker
execution. This is a failed required gate, not a skipped or passed security test.
Docker protection, full regression, POSIX/macOS, new Codex/Claude Live autonomous
continuation and Host compaction recovery were not verified in this turn.

## Automatic continuation is not accepted

The current Local backend consumes a token once within one backend instance.
Its command hash is not a durable, consumed execution grant across CLI processes.
Bootstrap verification also lacks the protected Workflow's reserved Attempt and
lease lifecycle. Revision CAS protects evidence attachment after execution; the
injected revision-conflict test confirms preservation of unattached evidence,
not prevention of all stale execution before subprocess launch.

Therefore old command hashes must not be resubmitted automatically. Existing
lease tests prove the Store/Workflow fences only, not Bootstrap local fencing.
No automatic executor was added. New durable trust/attempt semantics require a
separate design and explicit approval before execution: bind task revision,
WorkItem, command/tree and one execution decision; atomically reserve with the
existing persistence and lease mechanism; on interruption reconcile rather than
relaunch; test cross-process replay, lease loss and revision changes before spawn.

Status: advisory report integration implemented and scoped offline checks passed;
automatic single-Agent execution remains HUMAN_HANDOFF. The prior explicit
Operator-assisted P0-B run is retained as its original limited Live evidence,
not expanded into autonomous-loop or protected-completion acceptance.
