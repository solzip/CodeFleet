# Codex-first P0-B — internal development path and Live approval packet

- Date: 2026-10-27 (KST)
- Baseline: `19ddf671410e92fc9d9e4fa423aeb829981c5bfa` in detached `core-p0-1`, plus existing uncommitted P0-1–P0-A. Main remains separately observed at `4477e4426960af46076d3aa29808201c1c8911a6`; no remote-main equality assumed.
- Type: implementation, verification, approval preparation
- Predecessors: [P0-A](codex-first-bounded-continuation.md), [development contract](../../implementation/multi-workitem-development.md), [Product Charter](../../PRODUCT_VISION.md).
- Finding numbering: existing REGISTER maxima P0-17 / P1-61 retained; P0-B is the user's work label.
- Environment: Windows Native / PowerShell / Node v24.14.1. No additional Host model invocation or Git publication.

## Implemented path

The existing Bootstrap path supports the requested Objective and separated source
ownership. The missing link was retaining A's admission history after B adds a file
without pretending A's Evidence verifies the new candidate. A real process test
reproduced the old global `CANDIDATE_CHANGED` stop. The new content-addressed
dependency receipt and historical `LOCAL_CHECKPOINT` projection permit a new final
verification, while the old Evidence has no current Judge verdict or new authority.

The graph uses `fixed-tests`, `normalize`, `verify-normalize`, `todo`,
`verify-integrated`, and `protected-review`, after a planning item. Fixed tests
check whitespace trimming, blank rejection, normalized Todo creation, blank Todo
rejection and fresh object identity. Implementation files are exactly
`src/normalize-title.mjs` and `src/create-todo.mjs`. A and B proposal payloads cannot
include test paths. Current Local execution is unprotected: hashing detects drift;
it does not claim OS-enforced immutable tests against hostile source code.

The new public **read-only** `objective proposal-request` supplies the next eligible
source context. It blocks B before A's current verification passes, and blocks
requests when verification budget is exhausted. It never invokes a model, approves
a Fileset or starts an Attempt. Existing supervised Fileset/Native Local and the
internal bounded continuation remain the execution paths.

Another negative case exposed an existing budget-reporting bug: invalid Evidence
removed a Reservation from the displayed used-Attempt count. Projection now counts
persisted Reservation rows, preserving consumption during Evidence defects. Unknown
time is unavailable. No new ledger was added.

Creation's approval/lease fence is now enforced before writes and final receipt
publication, using the existing Fileset lease. Revoke/expiry/lease loss before writing
leaves B absent; revoke after writing preserves uncertain B bytes and refuses replay.
A's source and prior evidence are retained. Tests/acceptance criteria are unchanged.

The bounded four-document preflight returned four candidates. Source review excluded
them as safety constraints, future acceptance and historical caveats, not conflicting
success claims. The public Operator boundary remains blocked; no global clearance
or new execution approval was inferred from this review.

## Results and Evidence

All A/B source proposals in the internal tests are explicitly **SYNTHETIC_OFFLINE**.
They are not reported as Codex-generated. Separate processes prepare, propose,
approve, materialize, inspect and verify using the same Store. The final tests
re-execute A and B together, on a new whole-candidate hash.

| Observation | Result |
| --- | --- |
| Before implementation | exit 1: B materialized, but next integrated verification missing because A became stale |
| First path after fix | exit 0: one process integration test |
| First negative suite | exit 1: corrupted Evidence exposed used-Attempt count dropping to zero; fixed at the ledger projection |
| Legacy regeneration (`pretest`, `test:legacy`) | exit 0; Legacy 324 pass, no failures/skips |
| Host Core and initial P0-B checks | exit 0; 27 pass, no failures/skips; later cases tracked below |
| Process integration (`development-loop`, `native-local`, `bootstrap-process`) | exit 0; 36 pass, no failures/skips |
| Latest public context and exhausted-budget handoff | exit 0; 2 pass, no failures/skips |
| Impact regression (`development-loop`, `continuation`, `bootstrap`, `bootstrap-verify`, `bootstrap-reservations`, `repair-loop`, `time-safety`) | exit 0; 201 pass, no failures/skips |
| Document checks (`posttest`: coverage, links, citations, facts) | exit 0; historical citation caveats retained |

Commands, raw logs and `summary.json` are retained in local `.codefleet/p0-b-evidence/`. These overlapping suites are not additive coverage counts. The success
case logs `P0-B EVIDENCE` with state location, Task, exact Fileset manifests,
Decisions, Attempts, candidate hashes, Evidence references and final projection.
Raw logs include private temporary paths and are not public artifacts.

The success case consumes two different verification Decisions and Attempts,
reserving 10,000 ms each (20,000 ms total, not measured elapsed time). A verifies two
tests; integrated B verifies all five. Setup/A/B have separate exact Fileset approvals.
Tests prove dependency refusal, source/test scope and overlap refusal, stale revision,
candidate and Evidence refusal, mismatched historical receipt refusal, missing/revoked
authority, budget exhaustion, pre/post-write interruption and preservation of A.

The negative B implementation produces actual `LOCAL_FAILED` Evidence. Existing P0-2
triage is invoked, and another Attempt is refused. No automatic repair is claimed:
the current one-repair contract cannot simply be widened after earlier WorkItems.
Existing approved single-repair behavior is covered by impact regression.

The final current candidate has fresh integrated Local Evidence. Protected Judge
still escalates and `complete` remains false; historical A and protected-review
remain explicit in the projection. This is not P0-E Local-only completion or
Protected Verification acceptance. Current Host Live and macOS/Linux remain NOT_RUN.

## Prepared Live approval packet — no authorization granted yet

An isolated fresh fixture is prepared at the Worktree-relative
`.codefleet/p0-b-evidence/live/`; only fixed test/configuration setup has been
materialized. Neither A nor B source exists there. The exact data-only Host context,
schema and prompt are saved outside its repository. No real Todo + Calendar project
was changed. The existing P0-5A single-file Live case was not rerun.

| Binding / limit | Prepared value |
| --- | --- |
| Task | `task-3cfef7bd-df0a-4958-b37e-bde33f5d5847`, revision `6` |
| Workflow | `13b436333c4bac5ee4c2e241de90c64d60bbed4a265e4839db9a0ea950af1cb3` |
| Task hash | `693d2770f2b09a6381af443f7c9d9318047f4300cf870808af4e834817087a03` |
| Context hash | `99ab11b474c5a43f0c2cde065e0497a37f6d780dbf38acb3b8825012e1708b40` |
| Prompt | `prompt-a-bound.txt`, SHA-256 `3402fb7568364b5a2015d3f728b0868daef7c47fe9311e6a4c4d000cd3c0802d` |
| Output schema | `proposal-a.schema.json`, SHA-256 `19019f8d1855e354a76b8f665caa627d3c7b9ac34ecab6df16e552da6523ba1f` |
| Host | Windows Native `codex-cli 0.162.1`; version/help only checked, no model invocation |
| Proposed model | `gpt-6-astra`, reasoning `medium`; current access not exercised |
| Requested call now | **One** ephemeral proposal-only `codex exec` for A; no retry/resume/subagents |
| Target output | Only `src/normalize-title.mjs` content and rationale, bound to Task/revision/Workflow |
| Time/output limits | 300 seconds process wall limit; 2 MiB combined captured output limit |
| Cost | Existing Host authentication; no direct model API or new key. Token/quota/USD consumption unknown; **no enforceable dollar cap**. Numeric Task `attemptBudgetUsd` does not meter Host calls. Approval must explicitly accept this bounded-call but unmetered usage, or keep Live blocked until a metered boundary exists. |
| Effects allowed by proposed packet | Host model transport and captured proposal/event files only; no source writes, tests, state/approval commands, Git effects or other tools |
| Launch prerequisites | Recheck fixture/Task/prompt hashes, Host authentication, installed flags and actual read-only confinement for this new context. Missing prerequisites keep launch blocked. No authority is inferred from P0-5A. |

Proposed invocation reuses the P0-5A native proposal-only profile: `exec`, ephemeral,
read-only sandbox, user configuration/rules excluded, approval policy never, web,
apps, plugins and multi-agent disabled, explicit model/effort, JSON event capture,
exact output schema, stdin prompt, bounded process-tree cleanup. There is no automatic
launch command in the preparation scripts. A successful response remains untrusted
proposal data. A Fileset/content approval and a distinct exact verification decision
are still required before its application and test execution.

B needs a **separate later call packet**, generated by `proposal-request` only after
A's approved current candidate passes. Its exact A context cannot be fixed before
A exists. This packet does not authorize that second call, repairs, or model retries.

## User intervention and acceptance

Actual new model calls: **0**. Actual new Live approvals/interventions after the
implementation instruction: **0**. Internal test actors simulate Fileset approvals
and fresh decisions; they are not human actions or qualified public authentication.
The prepared Live fixture has no verification Decision/Attempt and no A/B proposal.

A fully supervised success is expected to require separate decisions for A model
call, A Fileset, A verification, then B model call, B Fileset and integrated
verification (six approval points, not yet observed). The present code automates
eligibility, binding, execution under supplied authority, budget accounting and
Evidence projection; it does not replace these user authorities.

## Conclusion

Internal multi-WorkItem integration is implemented; validation results are recorded above.
P0-B Live success remains unfulfilled because no separately approved Codex-generated A/B proposals exist.

## Next work

Obtain the explicit A proposal-only call approval, including unknown monetary usage,
then pass the exact launch prerequisites. Review the actual A response before any
source application. Generate B's packet only from verified A. P0-C/D/E follow actual
multi-WorkItem Live evidence; no status is promoted now.

## Unresolved

Actual Codex A/B generation; supervisor decisions and integration Live; public
authenticated preapproval; multi-WorkItem failure repair beyond the existing bounded
contract; Host usage metering; actual context recovery; Local-only final Judge policy;
Protected Verification and other-platform acceptance.
