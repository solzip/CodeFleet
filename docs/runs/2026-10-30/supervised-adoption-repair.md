# Supervised adoption across independently approved Repair Filesets

- 작업 일시: 2026-10-30 16:58 KST 이후
- 대상 커밋: `b382380891fb0d259787f764f354934839815217`, `work/p0-persistent-worklog`, existing uncommitted Core preserved.
- 작업 유형: scoped implementation and regression, no Live execution.
- 선행 문서: [integration finding](../../audits/2026-10-30/01-persistent-worklog-integration.md), [recovery contract](../../implementation/objective-recovery.md), [previous Core results](supervised-proposal-continuation.md).
- 번호 실측 최대값: P0-17 / P1-61, unchanged; no new finding ID assigned.

## Cause and bounded change

The audit's cause was confirmed in the actual worktree: `submitRepairFiles` replaces
the current Fileset pointer and retains the completed original in `bootstrap.history`.
The old adoption predicate examined only the current run's `supervisedProposal`.
Repair deliberately has different contents and a new approval, so copying that
original proposal onto the replacement would misrepresent its provenance.

Only two Core modules changed in this follow-up:

- `src/product/work-log.mjs`: resolve the original immutable adoption through the
  existing completed history entry only when the current Repair, recorded failure,
  source base digests, Task/WorkItem, contract/workflow and original packet match.
  Check the historical materialization receipt and original manifest hash. Keep
  the guard for other pending handoffs and all uncertain dispatches.
- `src/product/native-local.mjs`: recheck coordination before Fileset Review and
  before accepting its approval; honor recorded Native Fileset Review revocation.
  Existing expiry, candidate, exact hash, fresh materialization and reservation
  paths continue to own execution. No new approval or revocation CLI is added.

`test/work-log.test.mjs` adds three combined regressions using real Local processes
and existing fixtures. No acceptance-test fixture or threshold was weakened.
No change was needed to `submitBootstrapFiles`, `inspectCompletedRepair`, the
Reservation engine or Recovery persistence: the existing history and exact repair
validation supply the bindings. Recovery still shows original provenance on the
historical Fileset and independent materialization on the replacement.

The original approval may expire without erasing adoption. That approval is never
used to authorize new Repair bytes. The replacement remains WAITING_APPROVAL until
its own exact Review is accepted; reverification needs another exact Local Review.
Handoff stays PREPARED, original provenance PROVIDER_REPORTED_ONLY, protected Judge
ESCALATE, PUBLIC_DELEGATION_BLOCKED and Protected UNSATISFIED.

## Combined regression evidence

The success fixture first materializes and verifies normalize, revises the contract,
adopts a deliberately incorrect direct Todo proposal, reviews/applies it and records
a real LOCAL_FAILED result. It then submits an exact failure-bound Repair through
the existing Fileset path, separately reviews/applies it, obtains a fresh Native
verification Review and passes on the changed candidate. Local acceptance becomes
COMPLETE_LOCAL and a separate Node process restores it from SQLite.

Assertions preserve original proposal/Fileset/failure Evidence and fixed tests,
require a fresh Attempt, and prove duplicate Apply/Verification are record-only.
Tests also cover missing/tampered/stale adoption, wrong failure reference/candidate,
wrong source/base hash, missing approval, expired/revoked Review, active lease,
uncertain materialization/Host dispatch, exhausted budget and forged acknowledgment.
Existing Work Log cases continue to test unrelated work, old proposals, directives
at reservation/materialization boundaries and interrupted transport.

Initial selected run: exit 1, 1 PASS / 2 FAIL. Repair and Recovery already succeeded;
last assertions expected a completion action for an ineligible new review and the
wrong error text for a corrupted contract history. Corrected expectations to the
existing no-new-review behavior and exact contract rejection. Next selected run:
exit 0, 3 PASS. A stronger active-lease case then failed during fixture approval
(exit 1, 2 PASS / 1 FAIL), because approval itself correctly refuses an active lease.
Moved fixture approval before introducing the lease, so actual Apply is exercised.
No production gate was weakened to make these cases pass.

Final results on Windows / PowerShell / Node 24.14.1:

| Command | Result |
| --- | --- |
| `npm.cmd run pretest` | exit 0 |
| `node --test test/work-log.test.mjs` | 15 PASS / 0 FAIL / 0 SKIP, exit 0; includes the 3 new combined cases |
| `node --test test/continuation.test.mjs test/repair-loop.test.mjs test/native-local.test.mjs` | 85 PASS / 0 FAIL / 0 SKIP, exit 0 |
| `npm.cmd run test:host-core` | 127 PASS / 0 FAIL / 0 SKIP, exit 0 |
| `npm.cmd run test:legacy` | 324 PASS / 0 FAIL / 0 SKIP, exit 0 |
| `npm.cmd run posttest` | exit 0; links missing/case/anchor 0, living citation errors 0, fact declarations 42 / mismatch 0 |
| `git diff --check` | exit 0 |

The 15 Work Log cases overlap the Host Core suite; do not add these counts as
independent tests. Prior Host Core 124, safety 85 and Legacy 324 remain historical
results in their original record, not evidence for this modified candidate.
Raw logs are retained locally under `.codefleet/supervised-repair-*.log` and are
excluded from publication. Full Alpha/Docker Protected suites were NOT_RUN.
Existing dated citation suspects 15 and unresolved citations 65 remain historical
limitations. Coverage/anchor/unchecked-number baselines were not changed.

Exact tested file SHA-256 values (before documentation-only changes):

| File | SHA-256 |
| --- | --- |
| src/product/work-log.mjs | 7fb296cfceb2b71dcd4bdab78542bb72d1b0924907d17e1289226ebfd200f0cc |
| src/product/native-local.mjs | 10379d236c54a306d225988dfbfbaa58ebc8d7af068fa26567e84058ef197028 |
| test/work-log.test.mjs | cab58e10ee0c75cd8914ad2816799ac1d358417d653554c01f25c2f761366c3f |

## Live state preservation

The completed Live Task was only read. Before/after hashes over product_tasks,
events, runs, decisions, reservations, workflow_attempts and workflow_approvals match:
`bfdf8950b0ed0031cd312be32c2e1d152d6dd011c3c733ca61842337456eb9f5`.
The sorted Artifact filename/byte-hash inventory matches:
`b85ae659f1c4d4772d4cabed9c9fc11f01196fb2923ef6a42c5a3a45c2c69fea` (55 artifacts).

Read-only Recovery: RECOVERED, complete true, Task 11 / Contract 2 / seq 77;
remaining 1 Attempt / 60000 ms, no active lease or uncertain effects.
Candidate remains `cff4a24fd0aee1a4c7ab0703096dfa8d5fdaccf1b63e98b4d63ec411e25e4d11`.
No Live Event, model call, Fileset application or Verification was added.

## Scope and integration

The user-selected integration audit alone was scanned using Decision Debt preflight:
one document, zero final blockers, one excluded sensitive-context candidate (generic
authentication/Host-identity terminology, not a discovered credential). This is not
publication clearance. No external baseline was used as primary evidence.

Baseline Git reads used the approved owner execution context after the default
sandbox ownership rejection. No ownership, SID, ACL, authentication or safe.directory
experiment/change was performed. Existing worktrees and uncommitted files remain.
Local raw logs, SQLite, artifacts, model data and helpers remain excluded from Git.
The audit remains a historical pre-fix finding; this record supersedes its Repair
blocker on the regression evidence reported here. The integration allowlist is the
previous 21 files plus this run record (22 total); raw local state remains excluded.
No commit, push, PR or merge.

## 결론

Historical adoption and a replacement Repair's new execution approval are separated
using existing records. Combined and existing regressions pass; the scoped Repair
integration blocker is resolved at Core/Local regression level, not Host Live level.

## 다음 작업

Review the bounded diff and its actual regression results for Git integration;
Commit, Push and PR still require separate approval. Do not expand feature scope.

## 미해소로 남긴 것

Actual Host-session restart/compaction continuity, public delegation, Protected
verification, macOS/Linux and product-wide E2E are not certified by these Windows
Local regressions. An in-progress Objective needs separately approved Host Live
continuity acceptance; the already completed Todo Objective must not be replayed.
