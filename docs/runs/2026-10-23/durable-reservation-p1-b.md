# P1-B durable Bootstrap execution reservation

- Date: 2026-10-23; work type: implementation, isolated execution, verification.
- Baseline: local HEAD and GitHub main both
  `4477e4426960af46076d3aa29808201c1c8911a6`.
- Branch: `work/p1-b-durable-reservation`, separate Worktree; no commit/push/PR.
- Environment: Windows, PowerShell, Node v24.14.1; single Agent, no model calls.
- Predecessors: [P1-A](agentic-continuation-p1-a.md),
  [P1-B proposal and gap](bounded-continuation-p1-b.md).
- Finding-number inventory: maximum P0-17 / P1-61; no new register ID.
- Authorization: current user request permits this implementation and isolated
  fixtures only; no new P0-B or actual Host Live execution.

## Scope and implementation

The [new contract](../../implementation/bootstrap-reservations.md) makes the
previously proposed one-shot reservation concrete. The historical P1-B proposal
remains unchanged; its approval-pending wording describes that earlier turn.
Bounded decision-debt preflight found no grounded blocking cards; its one
excluded candidate concerned private experiment context. That result did not
certify all documents or grant execution authority.

| Changed files | Responsibility / reused boundary |
| --- | --- |
| `src/product/reservations.mjs` | Exact Operator decision issuance/revocation, atomic reservation, same-request recovery, evidence commit |
| `src/product/tasks.mjs` | Existing Bootstrap inspection/dependency checks reused; durable Tasks reject legacy hash-only execution; bound evidence validation |
| `src/product/cli.mjs` | Trusted local authorize-local / decision-based verify / reservation / revoke-local routes; no Host ingress changes |
| `src/product/report.mjs` | Durable reservation status and conservative Human Handoff; no automatic replay guidance |
| `src/verification/backends.mjs` | Trusted pre-spawn callback after asynchronous setup; existing one-use memory token and process cancellation |
| `test/bootstrap-reservations.test.mjs`, fixture helpers/worker | Real CLI race, native test processes, kill/restart, drift/fence/budget/evidence counterexamples |
| `test/bootstrap-verify.test.mjs` | Remove historical duplicate-execution gap characterization, replaced by durable rejection tests; retain existing Fileset/repair regressions |
| `package.json` | Include new suite in existing Alpha test command |
| Contract/progress/index/README counts | Current scoped status and evidence navigation; no historical baseline changes |

Existing Store transactions, events, artifacts, runs owner/lease/heartbeat/release,
Bootstrap workflow validation, candidate hashing, Local Backend, process runner,
and protected Judge are reused. Additive SQLite tables `bootstrap_decisions` and
`bootstrap_reservations` live in the same Store, with checked extension version.
Run FK ownership is preserved; no Bootstrap row is inserted into protected
`workflow_attempts`. No scheduler, Agent engine, Goal database or API service.

Decision/request IDs are distinct from commandHash. Binding includes Task hash and
revision, workflow, item, repository identity, command/tree/executable/arguments,
timeout/policy, explicit unisolated acknowledgement, expiry and finite budgets.
Consumption, attempt/time allocation, Run owner/fence and event commit atomically.
The final pre-spawn gate rechecks the current binding; final Task CAS and terminal
reservation state commit under the same fence. Artifacts remain immutable and
unattached if finalization fails. Once consumed, no automatic refund or relaunch.

## Executed verification

All counts below are scoped, overlapping runs, not a summed regression total.
Native exit codes were captured immediately, without a pipeline masking them.

| Command | Native result |
| --- | --- |
| `node --test test/bootstrap-reservations.test.mjs` initial counter fixture | exit 0; 24 pass, 0 fail/skip |
| `node --test test/bootstrap-reservations.test.mjs test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs` | exit 0; 114 pass, 0 fail/skip |
| `npm.cmd run pretest` | exit 0; new Worktree coverage only |
| `npm.cmd run test:legacy` | exit 0; 324 pass, 0 fail/skip |
| Scoped existing Alpha/Workflow command below | exit 0; 13 selected pass, 0 fail/skip; other cases NOT_RUN |
| `npm.cmd run test:host-core` | exit 0; 13 pass, 0 fail/skip |
| New suite after switching fixture to real node:test | exit 1; 24 pass, 5 fail, 0 skip; fixture omitted TAP reporter, so genuine execution summaries were INCONCLUSIVE |
| New suite with explicit TAP reporter | exit 0; 29 pass, 0 fail/skip |
| `node --test test/bootstrap-reservations.test.mjs` final candidate, including actual CLI decision lifecycle | exit 0; 30 pass, 0 fail/skip |
| `npm.cmd run posttest` final owner-context run | exit 0; 174 Markdown files, 629 links, 527 citations, 42 fact declarations; no current mismatches |
| `git diff --check` final separate command | exit 0 |

```text
node --test --test-name-pattern="^(P1-B: revoked|graph revisions|reserved attempt|attempt reservation|operator cancellation|expired approvals|verification failure|DAG rejects|alpha stale worker|alpha leases|alpha exhausts attempt|alpha resumes after worker|alpha recovers a last-attempt)" test/workflow.test.mjs test/alpha.test.mjs
```

The five fixture failures were retained and diagnosed from evidence: child native
exit was zero but counts were null under the default spec reporter. The repair
adds `--test-reporter=tap` to the approved fixture command. No verifier/parser or
acceptance criterion was weakened. Raw logs are retained privately in this
Worktree, including the failed run.

The first posttest exited 1 because its Git enumeration was unavailable under
the sandbox ownership boundary. The owner-context retry exited 1 with one INDEX
count mismatch: the new row used a Markdown link instead of the existing
backtick-path indexing format. Matching that format fixed the measurement;
no checker, coverage or anchor baseline changed. An initial diff check found
one trailing blank line in the shortened boundary test; it was removed and the
separate final check exited 0. Historical citation diagnostics remain 42
unresolved and 13 suspect; the passing document check does not resolve them.
Raw logs are in `.codefleet/runs/p1-b-implementation/` in the implementation
Worktree. README/INDEX counts describe this Worktree without the original
checkout's uncommitted P0-B record; later integration must retain that record's
separate count contribution.

## Process and failure evidence

- Two real `objective verify` CLI processes compete for one decision/request.
  A counter outside the approved candidate records one launch. A third fresh CLI
  retrieves the same outcome, with one reservation and one Task revision change.
- Actual Worker processes are forcibly killed at RESERVED, while a native child
  runs, and after execution before Evidence writing. Restarted CLI returns
  HUMAN_HANDOFF. Launch counts remain respectively zero, one and one; consumed
  decisions and allocated budgets stay consumed.
- Expired/revoked decisions, changed revisions/dependencies/capability/tree,
  post-reservation drift and replaced leases refuse dispatch. During-run expiry
  and lease changes request process-tree cancellation and prevent stale success.
- After-observation revision/revocation/fence changes retain the artifact but
  cannot attach it to the Task. Corrupted/misbound artifact references cannot
  supply valid report evidence. Event insertion failure rolls back consumption,
  Run creation and reservation together.
- Launch, cumulative time and consecutive failure limits persist across fresh
  exact decisions and reopened Stores. Time allocated at reservation is never
  refunded. Reports hand off instead of suggesting legacy hash replay.
- Local success is LOCAL_EXECUTED / UNPROTECTED; protected verification remains
  UNSATISFIED, Judge ESCALATE, complete false.

## Preserved work and limits

The original main checkout retains its README/INDEX edits and untracked P0-B
record. Existing worktrees, SQLite, artifacts and execution logs were not edited
or removed. Only an additional implementation Worktree was created. P0-B Task
execution/approval/materialization was not invoked and its evidence was not
relabelled. This preservation statement follows the write scope; it is not a new
full private-artifact hash audit or replay of prior investigations.

This is cooperative at-most-once dispatch for a shared, intact Store. Same-user
code can access files/processes or create another Store; no OS confinement,
rollback resistance, universal external-effect prevention or physical-human
attestation is claimed. The final filesystem-to-spawn race cannot be eliminated
by hashing. Polling cannot undo prior effects. Hard Worker termination may leave
descendants running: the running fixture child has a bounded lifetime, and the
test waits for that bound rather than claiming universal cleanup.

Uncertain effects, dead/expired/replaced leases, changed contracts, failed or
exhausted budgets and evidence defects require Human Handoff. Uncertain records
keep the repository reservation occupied. No automatic reclaim/force-unlock or
budget reset API was added. Human review must establish effects and a follow-up
reconciliation contract before further affected execution.

Protected/Docker full regression, new Codex/Claude Host Live, macOS/Linux and
Host compaction recovery are NOT_RUN. Public Host/Broker protection stays intact.
No claim of full Agentic Development Loop or product completion follows.

## Conclusion

The bounded implementation is OFFLINE_VERIFIED on Windows. No Host Live,
Protected or full Agentic Development Loop acceptance is claimed.

## Next work

Review this uncommitted candidate. Sequential WorkItems can reuse these bindings,
but need separately authorized decisions, revision transitions, cumulative
budget/reconciliation rules and their own negative tests. No multi-item loop was
enabled by this implementation.

## Unresolved

Same-user isolation/TOCTOU/external effects, orphan descendants after hard kill,
manual reconciliation of uncertain reservations, other OSes, Host Live and
Protected acceptance remain outside the demonstrated scope.
