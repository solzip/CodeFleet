# P1-B final-review defect repair

- Date: 2026-10-23; type: implementation and isolated verification.
- Baseline: `4477e4426960af46076d3aa29808201c1c8911a6`, branch
  `work/p1-b-durable-reservation`, including its existing uncommitted candidate.
- Predecessor: [final review](../../audits/2026-10-23/01-durable-reservation-final-review.md)
  and [reservation contract](../../implementation/bootstrap-reservations.md).
- Number inventory: prior maximum P0-17 / P1-61; R1/R2 retain their review-local IDs.
- Environment: Windows / PowerShell / Node v24.14.1; one Agent.
- Authorization: user-directed repair of R1/R2 and isolated regressions only.
  No commit, push, PR, merge, Host Live or P0-B execution.

## Minimum causes and changes

R1: SQL rollback did not undo mutation of the outer JavaScript reservation.
The catch persisted its uncommitted success payload in HUMAN_HANDOFF, and status
preferred that payload. Finalization now writes a separate terminal object;
the caller reads it only after transaction completion. Status uses one SQLite
transaction to check terminal reservation, Run/attempt body, consumed decision,
Task revision/state/evidence attachment and terminal event. It validates the
content-addressed Evidence as before. Inconsistent terminal records fail with
EVIDENCE_DEFECT; nonterminal records cannot expose a stale result payload.
No observation artifact is promoted into a committed success on recovery.

R2: `hash(request)` used insertion-order JSON serialization, while the approved
projection had a fixed field order. The request now has exact allowed fields
and uses the existing `canonical` function from `src/hosts/operator.mjs` for
comparison. Decision/request IDs, commandHash, candidate inspection, Task hash,
revision, workflow, dependency, capability, policy, lease and budget gates remain.
Arrays retain order. No Broker implementation or shared hash format was changed.

Product code changes are confined to `src/product/reservations.mjs`.
`test/bootstrap-reservations.test.mjs` adds finalization faults, binding and
recovery regressions while retaining the original tests. This record, INDEX,
REGISTER, progress and README document-count updates describe the new evidence;
the original implementation and review records remain unchanged.

## Counterexamples and durable outcomes

The original private review probes were reused without edits. Before repair:
exit 1, one pass and two failures. Terminal-event rollback returned execution
CLI exit 0 / LOCAL_PASSED; stored state was HUMAN_HANDOFF; reopened status was
LOCAL_PASSED. Task revision stayed unchanged, evidence attachment was absent,
grant remaining was zero and no terminal event existed. Key-order execution
failed at binding validation. Task-CAS rejection already passed.

After repair the same probes exit 0: three pass, zero fail/skip. The terminal
failure now returns execution CLI exit 2 / HUMAN_HANDOFF immediately and on
reopen; no Task success or terminal event survives. Key-order execution passes.

New persistent SQLite fixtures cover both terminal-event ABORT and a genuine
COMMIT rejection: a final-event trigger inserts an invalid deferred foreign key,
so the final transaction body succeeds but SQLite COMMIT fails. Both actual CLI
runs return exit 2 / HUMAN_HANDOFF. Reservation and Run persist HUMAN_HANDOFF
without result, Task revision is unchanged, no verification is attached and no
terminal event survives. The observation artifact remains LOCAL_PASSED as an
unattached observation; the decision remains consumed. A fresh status CLI exits
0 because its read succeeds, and reports HUMAN_HANDOFF, never LOCAL_PASSED.
Execution replay exits 2 and the child execution counter remains one.

All 24 object-key permutations are accepted against the same decision, with one
execution total. Changed executable, directory, timeout, argument order/content,
extra field, WorkItem or decision/request ID is rejected without consuming the
grant. Existing tests cover changed Task revision, candidate tree, dependencies,
policy/capability and cumulative budgets. Reopened-state tests reject missing
result, missing Task attachment, mismatched Run, absent terminal event and corrupt
Evidence. A legacy HUMAN_HANDOFF record containing success payload returns only
handoff, without reconstructing success.

## Validation

| Command | Result |
| --- | --- |
| Original private `review-probes.test.mjs`, before repair | exit 1; 1 pass, 2 fail, 0 skip |
| Same probes, after repair | exit 0; 3 pass, 0 fail/skip |
| `node --test test/bootstrap-reservations.test.mjs` | exit 0; 39 pass (original 30 + new 9), 0 fail/skip |
| `node --test test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs` | exit 0; 88 pass, 0 fail/skip |
| `npm.cmd run pretest` | exit 0 |
| `npm.cmd run test:legacy` | exit 0; 324 pass, 0 fail/skip |
| Scoped Alpha/Workflow command below | exit 0; 13 pass, 0 fail/skip; unselected cases NOT_RUN |
| Scoped Operator command below | exit 0; 4 pass, 0 fail/skip; unselected cases NOT_RUN |
| `npm.cmd run posttest` with process-local safe.directory | exit 0; coverage, links, citations, 42 declared facts; zero fact mismatches |
| `git diff --check` with process-local safe.directory | exit 0 |

Document checks examined 176 Markdown files, 635 links and 527 citations.
The 49 unresolved citations and 13 suspect historical citations remain checker
limitations, not newly verified references. Coverage and anchor baselines were
not changed. No feature acceptance follows from document-check exit zero.

```text
node --test --test-name-pattern="^(P1-B: revoked|graph revisions|reserved attempt|attempt reservation|operator cancellation|expired approvals|verification failure|DAG rejects|alpha stale worker|alpha leases|alpha exhausts attempt|alpha resumes after worker|alpha recovers a last-attempt)" test/workflow.test.mjs test/alpha.test.mjs
node --test --test-name-pattern="^operator: (fake signed|command changes|actual public CLI|actor strings)" test/operator.test.mjs
```

The reservation suite includes two real competing CLI processes, killed workers
at RESERVED/running/before-Evidence, restart without relaunch, owner/fence loss,
expiry, revocation, candidate and Evidence changes, and admission rollback.
Local success remains UNPROTECTED / protected UNSATISFIED / complete false;
public Host execution stays blocked. No automatic retry, refund or trust bypass
was added. These are scoped Windows results, not full security acceptance.

Git read initially failed under the sandbox account's ownership check. Reading
as the original user succeeded without changing Git configuration. Existing
staged/unstaged/untracked work was inspected; the Worktree's pre-existing changes
were retained. Writes were confined to the named Worktree and isolated test
fixtures. Original P0-B state/evidence, other Worktrees and private user material
were not used as test fixtures or changed. No new whole-root preservation hash
claim is made. Private probes, logs and SQLite remain outside publication.

## Conclusion

READY_FOR_PR for the bounded R1/R2 repair: both defects and the required scoped
regressions pass. This is not Protected/Host Live or overall product acceptance.
No PR was created.

## Next work

No remaining implementation for R1/R2. Publication requires separate user
authorization; preserve the original checkout's separate P0-B contribution when
later integrating. Broader acceptance retains the NOT_RUN items below.

## Unresolved

Docker/Protected/full `npm test`, Host Live, macOS and Linux: NOT_RUN.
Disk/power-loss fault qualification, same-user tampering/TOCTOU, orphan-descendant
cleanup and automatic reconciliation remain outside this bounded repair.
