# P0-B — sequential development and historical checkpoints

This extends [bounded continuation](bounded-continuation.md), reusing Bootstrap
Task/Draft/Validator/DAG, Filesets, Store, Reservation and Native Local. It adds no
model runner, scheduler, approval issuer or state database.

The acceptance fixture Objective is "제목 정규화와 Todo 생성 기능을 구현하고 실제 테스트로 검증한다."
The reviewed graph is fixed tests → normalize → verify-normalize → todo →
verify-integrated → protected-review. Only the operator-owned setup item creates
tests/configuration. The two development items own one source module each; the
second verification explicitly runs both fixed test files. Proposals that change
tests or overlap source ownership are rejected by existing Fileset/DAG validation.

## Host handoff

`objective proposal-request <task-id> <item-id>` returns current revision, Task and
Workflow hashes, criteria, the exact owned source paths, hash-checked materialized
context and dependency Evidence references. It is data-only and rejects execution
flags. A pending dependency, drift, uncertainty, missing evidence or exhausted
verification budget prevents handoff. An eligible request is not model permission.

The Host's generated response must be reviewed and submitted through existing
Fileset intake; its exact file/content hash needs approval before materialization.
Native Local then requires its exact candidate/command review and fresh Decision.
The internal P0-A continuation can use an external trusted decision transport;
public supervised Local and authenticated offline embedding remain different.

## Historical verification versus current verification

Adding B changes the whole candidate. A's old Evidence cannot judge that candidate.
Previously this change stopped all continuation. New successful materializations
record the current direct verification dependencies' Evidence references in their
content-addressed materialization artifact. No old receipt is synthesized.

`effectiveStates` may project A as `LOCAL_CHECKPOINT` only when all of its observed
file digests remain unchanged and every additional file is an approved downstream
`src/*.mjs` creation whose complete materialization receipt names A's exact Evidence.
Missing, altered, mismatched or non-source additions retain the stale/invalid stop.
The prior reservation and Evidence must still pass the existing integrity checks.

`LOCAL_CHECKPOINT` is deliberately **not** in the set satisfying dependencies. It
cannot authorize another dependent, be rerun using its consumed Decision, produce
a current Judge verdict, or count as Objective completion. It only records why an
already materialized downstream item was admitted. B's verification depends on B's
materialization and creates new Evidence for the complete current candidate.
The report retains historical A in remaining/history rather than relabeling it as
a current pass. Protected acceptance remains unmet; Local-only final closure is P0-E.

Before source creation, existing recorded bytes are rechecked. Creation now uses
the same pre-write approval/lease/revision fence as modification; a revoked or lost
lease cannot publish a completed receipt. Post-write uncertainty stays unresolved.
Reservation budget projection counts persisted rows even if Evidence is corrupt;
unreadable reserved time is unknown and has no available time, never a refund.

## Failure and recovery limits

Current P0-2 classification is reused. A failed B test stops continuation; this
change does not widen its one-repair contract or issue a repair approval. In
particular, failure after earlier WorkItem Attempts may require a new reviewed
repair contract. No retry is inferred from remaining numeric budget. Earlier A
source, Fileset and Evidence are preserved, including across separate processes.

This is an internal integration contract. Actual Codex-generated A/B proposals,
model-call authorization, supervisor approvals and Host Live evidence must be
measured separately. Offline source strings are explicitly synthetic test inputs.
