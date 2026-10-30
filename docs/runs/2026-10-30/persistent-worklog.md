# Persistent Work Log and directive coordination

- Date: 2026-10-30 (Asia/Seoul)
- Baseline: `b382380891fb0d259787f764f354934839815217`
- Branch: `work/p0-persistent-worklog`
- Type: implementation, verification, decision
- Inputs: `AGENTS.md`, `CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/PRODUCT_VISION.md`,
  `docs/product-completion/{architecture,progress,roadmap}.md`,
  `docs/implementation/{objective-recovery,multi-workitem-development,bounded-continuation}.md`,
  local `main-merge-handoff.json` (navigation only).
- Issue numbering: register maximum P0-16 / P1-61; no new numbered finding.
- Environment: Windows, PowerShell, Node 24.14.1. Other operating systems NOT_RUN.

## Baseline and preservation

The supplied workspace was on an older local main (`4477e442`) with existing
changes. The requested baseline was present locally and matched the local
`origin/main` reference; no remote freshness assertion is made. A separate
worktree was created at the exact requested commit. Existing modifications and
other worktrees were preserved. Commit, push, PR and merge were not performed.

The handoff was located in the existing windows-authorization worktree, not at
the initial workspace-relative location. Read-only SQLite recovery confirmed B
and C both RECOVERED and complete, each with three consumed Attempts, 180000 ms
reserved time and zero remaining time. Their task event counts were 46 and 43.
No original Decision, Attempt or Evidence was replayed, edited or refunded.

The decision-debt rule scan covered the six named operating documents and
returned six cards. Checking their citations showed acceptance targets and
explicit limits, dated history, and rules requiring preservation of historical
decisions rather than contradictory current instructions. These candidates were
excluded as blockers for this bounded implementation; no document was archived
or rewritten to manufacture clearance. The sensitive-context warning concerned
the working-rules publication/credential context; raw internal context is not
copied into this public record.

## Reused Core and new connections

Existing Task/Draft/DAG, Contract Revision Review/Accept, immutable artifacts,
SQLite event log, Agent Messages, continuation, Reservation, lease, Local
Evidence/Judge and recovery remain the underlying contracts. No new database,
Goal engine, scheduler or Host compaction implementation was introduced.

`src/product/work-log.mjs` records manager assignments, directive inputs and
decisions, handoff packets and transport/receipt observations in those records.
`src/product/directives.mjs` binds Host-interpreted draft changes to the existing
review and calculates affected Agents from the existing impact closure.
`contract-revisions.mjs` records actual application and prepares affected handoffs
inside its existing atomic commit. `recovery.mjs` reconstructs coordination,
effective requirements and pending handoffs and reads existing Agent Messages.

`continuation.mjs` selects independently eligible items while related handoffs
are pending. `tasks.mjs` and `reservations.mjs` check coordination at admission
and existing effect fences. These checks restrict authority; they never grant
it. Pending interpretation blocks new work conservatively. Exact existing
Fileset and command approvals remain mandatory after acknowledgment.

CLI commands and packet schemas are documented in
[the existing recovery contract](../../implementation/objective-recovery.md#persistent-coordination-and-directive-reconciliation).
The new tests are part of `test:host-core`.

## Verification

Initial focused `node --test test/work-log.test.mjs`: five passed, no failures,
exit 0. Synthetic Host transport plus actual local commands exercised directive
revision, selective handoff, new-process recovery and once-only continuation to
Local completion. This is not actual Host delivery or a fresh model session.

Initial `node --test test/recovery.test.mjs`: 41 passed, no failures, exit 0.
This is regression testing with fresh fixtures, not replay of the completed
B/C Repair Objectives. Expanded and final focused results follow.

Expanded validation on Windows / PowerShell / Node 24.14.1:

| Command | Result | Scope |
| --- | --- | --- |
| `npm.cmd run test:host-core` | 117 passed, exit 0 | Core and initial coordination tests |
| `node --test test/continuation.test.mjs test/bootstrap-reservations.test.mjs test/native-local.test.mjs` | 110 passed, exit 0 | Continuation and existing execution boundaries |
| `npm.cmd run pretest`, `npm.cmd run test:legacy` | 324 passed, exit 0 | Fresh Legacy measurement; no baseline adjustment |
| `node scripts/check-rule-coverage.mjs` | exit 0 | 345/545 condition lines; existing baseline retained |
| `node --test --test-name-pattern='unprepared draft\|removing prepared' test/recovery.test.mjs` | 2 passed, exit 0 | Final draft recovery changes |
| `node --test test/work-log.test.mjs test/continuation.test.mjs` | 37 passed, exit 0 | Expanded coordination, uncertain effects and consumed-budget tests |
| `node --test test/work-log.test.mjs test/verification-backends.test.mjs` | Final: 16 passed, exit 0 | Final direct Local authorization fence and eight coordination tests |
| `node scripts/check-links.mjs` | exit 0 | 202 Markdown files, 756 links; external URLs not fetched |
| `node scripts/check-doc-citations.mjs` | exit 0 | 527 citations; no broken living-doc citations |
| `node scripts/check-doc-facts.mjs` | exit 0 | 42 declarations, zero mismatches; 539 numbers remain unchecked |

Document checks initially failed because the sandbox account could not read Git
under its ownership check; read-only checks were rerun under the original user.
The first fact check then reported 19 errors: missing Legacy measurement and
the new report's document-count delta. Legacy execution and measured counts
resolved them; coverage/anchor baselines were not changed. Citation inspection
retains 65 unresolved citations and 13 suspect historical citations; these were
not relabelled as current success. No full `npm test` or protected suite pass is
claimed. Local raw logs are retained in ignored
`.codefleet/persistent-worklog-validation/` and may contain private paths.

The final direct-Local test initially failed (15 pass / 1 fail, exit 1): a
directive arriving during asynchronous authorization stopped execution via generic
cancellation, losing the specific blocker reason. An explicit coordination check
immediately after authorization preserves DIRECTIVE_REVIEW_REQUIRED. The same
unweakened test and backend suite then passed. The failing log is retained.
The broad Host Core run preceded the final draft/direct-Local refinements;
the later focused runs cover those changes. These overlapping counts must not
be summed as unique tests or described as a final full protected regression.

## Live acceptance and remaining boundaries

A fresh Local-only Objective was prepared with fixed tests, two source WorkItems
and dependent verification, separate from B/C. Its ID is
`task-9fc6468c-8cfc-452f-9a2b-4e35d33ed481`. The original SQLite and exact prompt,
candidate binding, handoff and supervision packet are kept in the ignored
`.codefleet/persistent-worklog-live/` directory of this worktree.
It is incomplete; its initial handoff is PREPARED, not delivered.
The preapproval read-only recovery records Task revision 4, Contract revision 1,
seven events, zero Attempts and 120000 ms remaining execution budget. Both source
items are assigned to the logical single Host coordinator; the actual Host
session identity and receipt are not yet observed. Its recovery status is
HUMAN_HANDOFF, with no execution grant.

Actual Host proposal invocation requires separate user supervision: one fresh
session/turn, read-only proposal for `src/normalize-title.mjs`, no tools, source
writes, tests, subagents or retry, at most sixty seconds, expiring one hour after
approval or earlier on binding change. Token thresholds are observed, not hard
enforced caps; cost remains unknown. Later exact Fileset/verification approvals
must bind the resulting proposal/candidate. No existing B/C approval is reused.

Trusted transport and receipt callbacks are implemented but are not an
authenticated public adapter. Actual Host delivery/acknowledgment, requirement
change across Host sessions, resumed development and final Live Judge acceptance
remain NOT_RUN pending authorization and observations. Host Context Compaction is
NOT_VERIFIED. UNDELIVERED packets require human handling; there is no automatic
retry. Recovery conservatively reports any unresolved handoff even when the
continuation selector can identify independent work.

PUBLIC_DELEGATION_BLOCKED and Protected UNSATISFIED remain unchanged. Full
protected/security regression, browser acceptance and cross-platform acceptance
are not claimed.

## Conclusion

Existing persistent records now connect directive review, assignments, handoff
observations and recovery to guarded continuation. Synthetic/local verification
and actual Host Live remain separate; product E2E acceptance is incomplete.

## Next work

Obtain exact supervision for the prepared first Host proposal and subsequent
review-bound effects; complete actual Host/session acceptance before claiming
the Objective's product E2E criteria.

## Unresolved

Actual Host transport/session/continuation acceptance and compaction observations;
authenticated public delegation and protected verification remain unavailable.
