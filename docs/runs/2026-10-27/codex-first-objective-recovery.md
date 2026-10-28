# P0-C internal recovery and pending Codex session acceptance

- Date: 2026-10-27, Windows Native / PowerShell / Node v24.14.1.
- Baseline: detached `core-p0-1` at `19ddf671410e92fc9d9e4fa423aeb829981c5bfa` plus existing uncommitted P0 changes. Root main remains `4477e4426960af46076d3aa29808201c1c8911a6`; no equality with remote main assumed. PR #9 Worktree is preserved.
- Type: implementation, process verification and Host approval preparation.
- Predecessors: [P0-B initial record](codex-first-multi-workitem.md), [P0-A](codex-first-bounded-continuation.md), [recovery contract](../../implementation/objective-recovery.md), [Product Charter](../../PRODUCT_VISION.md).
- Finding numbering: existing REGISTER P0-17 / P1-61 maxima retained; P0-C is the user's work label, not a new defect number.

## Preserved P0-B Live baseline

The initial P0-B record described the then-pending Live calls. Subsequent separately
approved Windows Codex calls generated A and B, exact Filesets were applied, and
the final Local test process passed all five tests, exit 0. These later results do
not rewrite that earlier record or establish Protected completion.

- Task: `task-3cfef7bd-df0a-4958-b37e-bde33f5d5847`, current revision **12**.
- Current candidate: `898a5a38c3c13baf136f4b2e877b4df9d7be498caee552deacf1326fa90a3ba6`.
- Integrated Evidence: `010a6883d1530d38bfa8e638a3498f9a205e202754d38f2a36030e409f366cc3`.
- A Evidence: `f39e7d6cbc29b55f61d1a54167e63c7513554fec48b1e4e03b4ffca4e84c23d6`.
- Current trust: `LOCAL_EXECUTED / UNPROTECTED`; Protected Judge `ESCALATE`; Objective `complete=false`.

Local raw receipts are in `.codefleet/p0-b-evidence/`: `live-a-02`, `live-b-01`,
`apply-a-approved-02`, `apply-b-01`, `verify-a-01`, `verify-integrated-01`.
They contain private paths and are not public artifacts. P0-C inventories the old
Fixture/State byte hashes and verifies the above baseline using an inspection copy;
it does not modify, rerun or migrate the P0-B Fixture.

## Minimum change and rationale

[recovery.mjs](../../../src/product/recovery.mjs) assembles a recovery observation
from existing Task/Workflow, events, Filesets, approvals and reservation records.
It reuses `continuationSnapshot`, `localTree`, artifact verification and the current
work-log update rules. CLI `objective recover` accepts only a Task and optional
prior binding. No authorization flag, scheduler, model API or new state store exists.

The public materialize entry now requests `freshOnly`; interrupted Filesets are
shown as reconciliation work, not replayable materialization. Continuation also
refuses an uncertain materialization before selecting another WorkItem. Existing
Controller/Lease/Reservation fences are retained, not replaced.

The first process test failed with `TASK_WORKLOG_REVISION_MISMATCH`: durable
verification records the executed revision and then increments the Task. Recovery
was corrected to interpret that existing contract. The failed log is preserved.
No historical event, test criterion or approval gate was weakened.

The first compatibility run exposed two failures: an unapproved Fileset was
reported as uncertain replay instead of the existing `WAITING_APPROVAL` error.
The ordinary state/approval gate now runs before the fresh-only replay guard.
The original assertions were retained; the repeated compatibility suite passed.

Decision Debt preflight examined the four user-selected current operating documents.
Its four candidate cards were reviewed against their cited text: future roadmap
acceptance, architecture/Charter safety constraints and historical progress limits
are not grounds to abandon the authorized internal recovery change. They were
excluded as blockers, not as product principles. The public Operator boundary and
unmeasured Host/compaction claims remain blocked. The stale P0-B Live wording is
superseded by the measured follow-up above, not by a global preflight clearance.

## Verification

| Scope | Command/result |
| --- | --- |
| Initial recovery process | `node --test --test-name-pattern='P0-C A:' test/recovery.test.mjs`: exit 1, revision interpretation defect reproduced |
| Initial complete recovery suite | `node --test test/recovery.test.mjs`: exit 0, 13 pass, no failures/skips |
| Final recovery suite | `node --test test/recovery.test.mjs`: exit 0, 14 pass, no failures/skips |
| Impact regression | `node --test --test-concurrency=1 test/recovery.test.mjs test/continuation.test.mjs test/development-loop.test.mjs test/bootstrap-reservations.test.mjs test/native-local.test.mjs test/time-safety.test.mjs`: exit 0, 130 pass, no failures/skips (includes the 14 recovery cases) |
| Bootstrap/process/backend compatibility | `node --test --test-concurrency=1 test/bootstrap-process.test.mjs test/bootstrap.test.mjs test/host-core.test.mjs test/verification-backends.test.mjs`: initial exit 1 (two failures above); corrected run exit 0, 75 pass, no failures/skips |
| Repair/Operator regression | `node --test --test-concurrency=1 test/repair-loop.test.mjs test/bootstrap-operator.test.mjs`: exit 0, 52 pass, no failures/skips |
| Document checks | `npm.cmd run posttest`: exit 0; existing historical citation warnings retained |

The final P0-B byte inventory comparison passed: Fixture and State unchanged,
revision 12 and integrated Evidence preserved. `git diff --check` passed. The
unapproved Host packet paths were normalized with Node UTF-8 and its executable,
prompt and schema hashes were rechecked without a model call.

Raw logs and process IDs are retained under `.codefleet/p0-c-evidence/`. Fixtures
use explicitly synthetic internal proposals and offline test authority. Each action
starts a separate Node process. Crash workers exit at committed reservation, after
test exit, before final Evidence commit, and after file write before materialization
commit. Replay only reports uncertain state; no extra Attempt or budget refund is
allowed. Expiry/revocation, candidate/revision mismatch, corrupted Evidence/receipts,
forged conversation binding and forbidden execution flags are negative cases.

The positive path recovers A, admits a separately approved B, rejects the old binding,
preserves historical A and records distinct integrated Evidence. Verification
consumes two reservations of 10,000 ms each; this is reserved time, not elapsed time.
The source/test bytes and prior results remain intact. An unused numeric attempt
budget is not permission to retry. No automated resolution of unknown effects is claimed.

## Exact pending Host acceptance

Fresh Fixture: `.codefleet/p0-c-evidence/host-recovery-fixture/`; fixed tests only,
no A/B source. Task `task-8f9e7574-8485-48d9-b441-09a559dcc521`, revision **6**.
Workflow `6b86ce71bb9f1f1465d0885f050e228201becb5fc63f0f18c3f3f4b6b9041047`.
Prompt SHA-256 `2e5a27fdd867f171f5c8fe5a5368842fcb89abc5ded82b283fe2d66f2b8f687e`.
Schema SHA-256 `359d14cbd4d5f21816403c4850281d74195faf49e41120f881d0fbad32041ce4`.
Exact absolute executable, argument array, binding and inputs are in local
`host-session1-approval.json`; no model launch has been made.

The requested first separate approval would allow one ephemeral Codex CLI call,
`gpt-6-astra` / `medium`, at most 300 seconds and 2 MiB captured output, with no
tools, retry, resume or subagents. It receives the freshly reconstructed recovery
and fixed input context on stdin, and only proposes A. It uses existing Host auth,
read-only sandbox, approval never and disabled apps/plugins/multi-agent/web.
`--ignore-rules` excludes Host rules but does not grant CodeFleet authority. Actual
no-tool behavior must be checked from events. Auth/flags/confinement and all hashes
must be rechecked immediately before any separately approved launch.

Host dollar limits are not technically enforced. CLI token observations can be
recorded, while internal request count and unmeasured USD remain `UNKNOWN`. Explicit
acceptance of that bounded but unmetered call is required. No API key is requested.

After the first session ends, its exact proposal needs separate application and
Local verification approvals. A second fresh Codex session then receives a new
recovery packet for the same Objective and B, with no first-session transcript or
resume. Its exact dynamic packet and model call need a separate approval. Compare
distinct Host thread IDs and actual subsequent Evidence. The second packet cannot
be fixed before the first session's candidate and verification exist.

## Conclusion

Internal recovery is implemented and measured at the scope shown above.
P0-C actual Codex cross-session continuation is **NOT_RUN / awaiting approval**.
Host compaction recovery and Protected Verification are **NOT_RUN**.

## Next work

Obtain the exact first Host session approval, including unmetered usage acceptance;
then collect both actual sessions and independently approved execution Evidence.

## Unresolved

Public unattended authenticated approval; unknown-effect manual reconciliation;
actual new-session and compaction acceptance; Host monetary metering; P0-D changed
requirements and P0-E Local-only completion; Protected and macOS/Linux acceptance.
