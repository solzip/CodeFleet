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

The next discussion/implementation topic is v0.2 run-summary normalization.
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
Final model / concept design: about 70%
Implementation: about 15-25%
```

Current implementation status:

```text
- Workspace discovery helper exists.
- CLI supports --workspace and nearest-parent .codefleet/config.json discovery.
- codefleet run creates run-plan.json before AdapterRequest.
- codefleet run creates adapter-request.json before AgentAdapter execution.
- codefleet run creates harness-observation.json and adapter-result.json after execution.
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
```

## Current Bottleneck

```text
v0.2 run-summary normalization
```

Why this is next:

```text
Workspace discovery, run-plan creation, and the S2 artifact split now exist in runtime.
The next derived artifact is run-summary.json.
Run Summary must derive from AdapterRequest, HarnessObservation, and AdapterResult.
Run Summary must preserve unavailable / degraded evidence boundaries.
Run Summary must not create Review Decision, VERIFIED, DONE, or queue progression by itself.
```

Expected next implementation slice:

```text
1. Define minimal RunSummary type.
2. Create .codefleet/runs/<runId>/run-summary.json after S2 artifacts exist.
3. Reference run-plan, adapter-request, harness-observation, and adapter-result by path/hash.
4. Normalize adapter status and harness evidence into derived result fields.
5. Keep verificationGateResult unavailable / missing until VerificationEvidence exists.
6. Add tests proving missing/degraded evidence does not become acceptance truth.
```

## Repository Note

Other machines should continue from committed and pushed files. Local untracked
files are not a handoff source.

Canonical design file:

```text
docs/concept-foundation.md
```
