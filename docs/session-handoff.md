# CodeFleet Session Handoff

Last updated: 2026-06-23

This is the compact handoff for continuing CodeFleet work in another session or
on another machine. The canonical design source is always
`docs/concept-foundation.md`.

## Reading Order

```text
1. docs/concept-foundation.md
2. docs/session-handoff.md
3. docs/architecture-spine-claude.md
4. docs/architecture-structure-claude.md
5. docs/architecture.md and README only as current implementation references
```

Do not start from implementation alone. First check the final goal, boundaries,
fixed rules, and the current next bottleneck.

## Session Starter

```text
Read docs/concept-foundation.md and docs/session-handoff.md first.
Continue from the current CodeFleet design and implementation state.
Reflect each fixed decision in the docs, then commit and push.

Important criteria:
- Every FINAL RULE must be concrete.
- Every FINAL RULE must be deterministic and machine-checkable.
- Every FINAL RULE must include sourceOfTruth, inputs, preconditions,
  condition, allowedEffect, deniedEffect, and evidence.
- Do not decide by human intuition, LLM inference, or guesswork.
- Anything not fixed must remain DESIGN CANDIDATE or VERSION_PLAN.

The next implementation topic is v0.2 local review.
The next design topic is Mutation Engine minimum contract.
```

## Product Definition

```text
CodeFleet is an AI-native development orchestration CLI.
It structures a user's development/operations Objective into Tasks,
defines backend/infrastructure work with role, scope, guardrails, and
verification conditions, delegates approved Tasks to AI agents, and tracks
execution through logs, diffs, tests, and review evidence.
```

## Progress

```text
Final model / concept design: about 78%
Implementation: about 25-35%
```

Current implementation status:

```text
- Workspace discovery helper exists.
- CLI supports --workspace and nearest-parent .codefleet/config.json discovery.
- codefleet run creates run-plan.json before AdapterRequest.
- codefleet run creates adapter-request.json before AgentAdapter execution.
- codefleet run creates harness-observation.json and adapter-result.json after execution.
- codefleet run creates run-summary.json as a derived summary after S2 artifacts exist.
- codefleet run creates VerificationEvidence with authority NONE when required verification cannot be run by the Harness.
- VerificationEvidence distinguishes NO_VERIFICATION_COMMANDS_CONFIGURED from COMMAND_CHANNEL_NOT_HARNESS_VISIBLE.
- Legacy result.json is still kept for v0.x compatibility.
- Missing final evidence is represented as unavailable / degraded reason instead of truth.
```

## Fixed Model

High-level fixed sequence:

```text
S2 Adapter seam
-> S4 Review record
-> S3 Verification seam
-> S1 Task Spec minimum schema
-> run-plan.json
-> S2 artifact layout
-> run-summary / verification / local review artifact layout
-> minimum CLI flow
-> SPINE manual verification contract
-> S5 Export seam
-> Project Profile defaults/policies
-> Harness enforcement
-> AgentRole / Guardrail taxonomy
-> Verification execution policy
-> Workspace discovery
-> v0.1 / v0.2 / final implementation slicing
-> Review model v0.2 implementation detail
-> Objective ledger RUN_REVIEW_DECIDED migration path
-> Objective ledger minimum replay / snapshot model
-> v0.2 implementation kickoff
```

Important fixed boundaries:

```text
- S2 is AdapterRequest -> AgentAdapter -> AdapterResult.
- AdapterRequest, HarnessObservation, and AdapterResult are Run Trace Evidence, not final decisions.
- HarnessObservation owns changed-files, diff, command observation, and policy violation evidence.
- AdapterResult is provider execution report only.
- Provider-reported commands, changed files, and verification are degraded hints, not truth.
- run-plan.json is an immutable derived execution snapshot / resume boundary for one Run.
- run-plan.json is not a project-wide plan.
- Project Profile does not choose or store workspaceRoot.
- Workspace discovery is a Core invariant: explicit --workspace or nearest-parent .codefleet/config.json.
- Portable refs/hash and local realpath evidence must stay separated.
- Review Decision final truth belongs to ledger-backed RUN_REVIEW_DECIDED, not run-local notes.
- v0.2 review-decision.local.json is migration input, not final decision truth.
- AI review output and human review notes are not evidence truth.
- Degraded local review cannot be acceptance evidence.
- v0.2 local review assembles ReviewEvidenceBundle deterministically from Run Summary refs.
- v0.2 ACCEPTED local review requires COMPLETE bundle, valid hashes, successful normalized result, satisfied-or-waived verification gate, and no unresolved path violation.
- MIGRATION_READY, DEGRADED_RECORDED, MIGRATION_BLOCKED, and SUPERSEDED are local review migration statuses only.
- Objective ledger migration appends RUN_REVIEW_DECIDED with migrationSourceRef/hash; it does not promote local review files in place.
- Review migration conflicts are resolved only by ledger append order, ReviewEvidenceBundle hash, and explicit supersedes/invalidates references.
- Objective ledger replay deterministically rebuilds objective.json from ledger seq order, Task ledger approval, Run Trace, Run Summary, and ReviewEvidenceBundle.
- Partial replay is diagnostic only and cannot produce VERIFIED, NEXT, queue progression, or Objective closure.
- objective.json is a COMPLETE/BLOCKED read model, not source truth.
```

## Current Bottleneck

```text
v0.2 local review implementation
```

Why this is next:

```text
Workspace discovery, run-plan creation, S2 artifact split, run-summary normalization, and minimal VerificationEvidence now exist in runtime.
The local review migration design now defines deterministic ReviewEvidenceBundle assembly, local ACCEPTED gates, and derived migration statuses.
Objective ledger migration design now defines how MIGRATION_READY local reviews become RUN_REVIEW_DECIDED events without becoming prior final truth.
The next implementation boundary is codefleet review.
review-decision.local.json must stay migration input, not final ledger truth.
No local review artifact may produce VERIFIED or queue progression by itself.
```

Expected next implementation slice:

```text
1. Define minimal ReviewEvidenceBundle type.
2. Add non-interactive codefleet review <runId> --decision ... --reason ...
3. Read run-summary, VerificationEvidence, AdapterRequest, HarnessObservation, and AdapterResult refs/hash.
4. Write review-decision.local.json with finalDecisionTruth false and migrationTarget RUN_REVIEW_DECIDED.
5. Preserve observed result/check/gate snapshots from Run Summary.
6. Derive MIGRATION_READY / DEGRADED_RECORDED / MIGRATION_BLOCKED / SUPERSEDED local statuses.
7. Add tests proving local review does not create VERIFIED or queue progression.
```

## Repository Note

Other machines should continue from committed and pushed files. Local untracked
files are not a handoff source.

Canonical design file:

```text
docs/concept-foundation.md
```
