# Executable contracts and state machine specifications

## Intent / Draft
Input `ObjectiveRequest`: original text, repository identity + baseline, actor, routing preference (optional), constraints. Discovery is bounded and read-only. AI output `TaskDraft` contains objective, code references, proposed file scopes, risks, required checks, unknowns, provenance. Draft is **untrusted**; schema validator checks paths, baseline and validation methods before any authorization. Unknown required criteria -> `NEEDS_INPUT` not silent inferred success.

## Authorization
`ApprovedContract` binds `contractHash`, version, baseline commit, affected paths, protected tests, accepted effects, policy hash, actor/decision, approval expiry and allowed uses, checks + checks provenance, budgets. Risky effects require separate approval linked to specific action digest. User's initial natural-language request is not a blanket privilege token.

## DAG / WorkItem
`GraphRevision{runId,revision,baseRevision,nodes,edges,hash}` immutable on activation. `WorkItem{workItemId,role,kind,effectClass,contractRef,dependsOn,requiredGates}`. Edges acyclic; known refs only; graph CAS commit. Existing executing attempt cannot be rewritten; later revision requires safe pause/reconcile. Workflow stages compile into WorkItem nodes/gates; no second scheduler.

## Attempt / Result
`Attempt{attemptId,workItemId,providerId,workspaceId,leaseOwner,fencingEpoch,startedAt,endedAt,processIdentity,resultRef}`. Provider exit zero is not Verification PASS. Artifacts include original provider output, normalized events, Harness-observed diff, independent test process exit, scope checks, environment fingerprint, final tree identity and unavailable reasons. Unknown != zero or success.

## Store and migration
Alpha DB currently `user_version=1`, `runs(id,body,owner,leaseUntil,pid,control)` and `events(seq,runId,at,type,body)`. Define schema migration from 1 to 2 preserving all records, import/export and old CLI. Add graph/workitem/attempt/approval/outbox metadata behind new code; do not rewrite legacy evidence nor use destructive DROP on user state. DB writes + event/outbox in same short transaction; external CLI and network outside transaction. WAL enabled with per-connection FK and busy timeout. Save artifact bytes under validated content hash before durable reference; reconcile orphaned blobs.

## State contract
Run: CREATED/PLANNING/READY/RUNNING/WAITING_APPROVAL/PAUSING/PAUSED/VERIFYING/COMPLETED/FAILED/CANCELLING/CANCELLED. Add migration mapping for existing alpha READY/GENERATING/BASELINE/VERIFYING/DELIVERING/RECONCILING/WAITING_HUMAN etc rather than directly overwriting them. Existing alpha run state must remain readable. Attempt: CREATED/STARTING/RUNNING/SUCCEEDED/FAILED/TIMED_OUT/CANCELLED/LOST. WorkItem: PENDING/BLOCKED/READY/ASSIGNED/RUNNING/VERIFYING/SUCCEEDED/FAILED/CANCELLED/SKIPPED. TERMINAL states immutable; resumed terminated runs create child runs if appropriate. Failed/unknown outer effects may only resume after reconciliation.

## Approval and outbox
Commands are idempotent by command id+payload digest; mismatched payload with same ID is rejected. Approvals expire and invalidate on scope/action/version change. Outbox at-least-once; dedupe/reconcile external effects before repeating. `PENDING/IN_FLIGHT/CONFIRMED/UNKNOWN` for effect states. Late stale lease responses cannot mutate coordinator state; fencing cannot stop non-cooperating external processes.

## Recovery
Safe automated retry requires recorded effect class + confirmed prior process termination + isolated workspace safety + budget + still-valid authorization. `EXTERNAL_EFFECT`/`DESTRUCTIVE_EFFECT` unknown outcome -> stop/manual or target-side reconciliation. A `pause` stops scheduling; a `cancel` records intention, attempts termination, confirms side effects and then finalizes. PID alone insufficient to confirm ownership.

## Provider capability contract
`probe` local installation/version/options; `prepare` execute spec; `start`/`events`/`cancel`/`reconcile` methods, normalized events retain raw refs. Unavailable required capability -> DENY; support from help output alone is not proof of enforced security. Codex structured output/no-tools equivalence must be tested in the installed version before accepting as production default.
