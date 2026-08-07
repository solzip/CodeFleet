# CodeFleet Session Handoff

Last updated: 2026-08-07

This is the compact handoff for continuing CodeFleet work in another session or
on another machine. The canonical design source is always
`docs/concept-foundation.md`.

## Reading Order

```text
1. docs/concept-foundation.md
2. docs/session-handoff.md
3. docs/design-progress.md
4. docs/architecture-spine-claude.md
5. docs/architecture-structure-claude.md
6. docs/architecture.md and README only as current implementation references
```

Document roles:

```text
docs/concept-foundation.md   fixed design content itself (canonical)
docs/design-progress.md      fixed order and current position
docs/session-handoff.md      minimum state for the next session
README.md                    current implementation usage
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

Design is being completed first. Implementation resumes only after the
remaining design items are fixed.

The next design topic is risk policy rule expression syntax.
The next implementation topic is v0.2 local review, held until design is done.
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
Final model / concept design: about 95%
Implementation: about 25-35%
```

Remaining design items:

```text
1. risk policy rule expression syntax
2. agentRoles role taxonomy
3. profile rule id naming scheme
4. final consistency re-audit
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
-> Mutation Engine minimum contract
-> Command normalization and matcher syntax
-> Export adapter field allowlist tiers
-> Files policy glob matcher syntax
-> Redaction pattern language
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
- Mutation Engine phases run M0 RESOLVE to M7 RELEASE, and M4 ledger append is the single commit point.
- Failure before M4 leaves no durable change; failure at rebuild or postcheck keeps the ledger event and reports snapshot failure only.
- mutationId is derived deterministically from mutationKind, target identity, targetHash, and semantic payload, never from time, order, actorId, or reason text.
- The mutation lock is a single fail-fast workspace lock, is never auto-broken when stale, and is not held across Run execution.
- Corrective events are only for a structurally valid ledger with a wrong decision; snapshot mismatch is rebuild, structural damage is source repair.
- Commands are argv arrays only; shell interpreter invocation is denied and argument spellings are never normalized into an equivalent form.
- Command matching is argv prefix or exact token comparison with no regex and no glob; allowedCommands match case-sensitively and deniedCommands / destructiveCommands match case-insensitively so both directions resolve to the more restrictive outcome.
- verificationPlan commands have no separate allowlist syntax and must pass policies.commands as-is.
- Destructive command approval is granted per categoryId with cwd and runId scope, never per raw command string.
- Export field allowlists resolve from PUBLIC / INTERNAL_SHARED / LOCAL_PRIVATE exposure tiers that must nest, not from per-target lists.
- A target may narrow its tier but can never add a field path, and Profile and Local Overlay cannot widen it either.
- Export field paths name leaves explicitly with no wildcard; an intermediate node path does not cover its children.
- A field absent from the resolved allowlist is dropped and recorded as SCHEMA_UNKNOWN_FIELD in redaction-report.
- Path patterns allow only literal segments, single-segment `*`, and whole-segment `**`; no character class, brace expansion, negation, or regex.
- Path matching is whole-path with no implicit subtree expansion, and `dir/**` does not match the directory entry itself.
- Path exclusion is expressed only through deniedPaths, and path case handling stays on the already-fixed canonical comparison key.
- Redaction does take a pattern language because its matcher decides removal rather than permission and secrets cannot be caught by literals, but backreferences and lookaround are denied so linear-time matching is guaranteed by grammar.
- Redaction action strictness is DROPPED > REDACTED > HASHED > RELATIVIZED; HASHED ranks below REDACTED because a hash preserves equality correlation.
- A broken redaction rule is never skipped; it makes sanitization incomplete and blocks export.
- Redaction runs after exposure tier filtering, and both stages record into the same redaction-report.
```

## Current Bottleneck

```text
risk policy rule expression syntax
```

Why this is next:

```text
Design is being completed before further implementation.
Every matcher and pattern item is now fixed: commands, files, export field allowlist, and redaction.
risk rule expression is the last remaining judgement-logic syntax item, so it comes before the naming-level items.
agentRoles taxonomy and profile rule id naming follow, then the final consistency re-audit.
```

Expected next design slice:

```text
1. Define deterministic risk rule evaluation without free-form expressions.
2. Keep risk lowering restrictions and UNKNOWN semantics intact.
3. Then define agentRoles role taxonomy and profile rule id naming.
4. Then run the final consistency re-audit.
```

Held implementation slice (resumes after design is fixed):

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
