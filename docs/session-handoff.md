# CodeFleet Session Handoff

Last updated: 2026-08-10 (through 6c8b82d)

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
docs/concept-foundation.md      fixed design content itself (canonical)
docs/design-progress.md         fixed order and current position
docs/session-handoff.md         minimum state for the next session
docs/spine-pass-*.md            dated SPINE validation records
docs/implementation-audit-*.md  dated rule-to-code audit records
README.md                       current implementation usage (Korean; README.en.md is English)
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

Design is complete as of the final consistency re-audit. Implementation
has resumed.

The Objective loop closes end to end: approve, run, verify, review, import,
derive VERIFIED, advance the queue. The Harness executes verification commands
itself and now enforces policies.commands against them.

One v0.2 evidence gap is left on a fully configured Run, and it is not a
missing implementation: COMMAND_CHANNEL_NOT_HARNESS_VISIBLE stays open until a
Harness-visible command channel exists. See Current Bottleneck.
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
Final model / concept design: complete
Implementation: 155 of 545 FINAL RULE condition lines are claimed by a passing
                test (28.4%). 128 tests, 0 failing.
```

There is no separate implementation percentage. "about 25-35%" stood here with
nothing behind it and has been removed; the coverage number is the only figure
that can be re-derived, and `npm test` prints it on every run.

Known divergences are declared in 0.13 NOT_FINAL_YET, not silently carried.

Design verification result, as `npm test` reports it (test/design-rules.test.ts
for the rule checks, test/rule-coverage.test.ts for parsing, and the posttest
checker for the counts):

```text
FINAL RULE                    83
condition lines               545
YAML parse failures            0
missing sections               0
id format violations           0
duplicate ids                  0
status != FINAL                0   (DESIGN CANDIDATE, NOT_FINAL_YET)
taxonomy-violating category    0
set-quantifying rules         27   missing scanScope 0
enum fields                   52   diverging value sets 8, declared in 0.13
```

This block read 82 from 7e40ca0 (2026-08-07) until now. 13fac97 replaced the
same hand-carried 82 in design-progress.md with the measured 83 and did not
touch this file, so the two docs disagreed for eight commits. The suite prints
the number on every run; do not hand-copy it into a second place.

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
- Changed-files evidence comes from git status with untracked files included, since an agent creating a new file must not be invisible.
- The Harness executes verificationPlan commands itself, so VerificationEvidence can carry HARNESS_EXECUTED and observedCheck PASS.
- Verification commands are argv arrays; a shell interpreter at argv[0] is denied, and preflight runs denied, then allowed, then destructive.
- observedCheck and the gate are computed only from Harness-executed attempts, so a provider claim can never move them.
- verificationAuthority, commandEvidenceAuthority, and changedFilesAuthority are separate fields over separate subjects; the Harness running verification does not make the agent's own commands visible.
- Path policy is evaluated against changed files using the fixed bounded glob subset, denied first, and violations are recorded in HarnessObservation.
- Path policy is not evaluated when changed-files evidence is degraded; it reports unavailable rather than "no violations" over partial input.
- Task scope entries must be valid patterns; a bare directory name is rejected at validation because whole-path matching would silently put its contents out of scope.
- codefleet review assembles ReviewEvidenceBundle from Run Summary refs and re-verifies every referenced artifact hash.
- codefleet review writes review-decision.local.json with finalDecisionTruth false and migrationTarget RUN_REVIEW_DECIDED.
- ACCEPTED is refused unless the bundle is COMPLETE, hashes are valid, the normalized result is DONE, the verification gate is satisfied or waived, and no path violation is unresolved.
- Evidence gaps are classified: a CAPABILITY_GAP is something CodeFleet cannot observe yet, an EVIDENCE_DEFECT is evidence that is missing or fails its hash.
- A human may accept over a CAPABILITY_GAP by waiving each reason by name with a justification; the result is recorded as WAIVED_INCOMPLETE and MIGRATION_READY_WAIVED.
- An EVIDENCE_DEFECT is never waivable by any actor, because nobody can stand in for evidence that does not match its recorded hash.
- Auto-accept additionally requires normalization COMPLETE with no gap of either kind, so CodeFleet can never waive its own blind spot.
- Local review derives MIGRATION_READY / MIGRATION_READY_WAIVED / DEGRADED_RECORDED / MIGRATION_BLOCKED and never records VERIFIED or queue progression.
- Every Run writes run-record.md, a readable account of what it did and what stayed unknown, independently of any export.
- run-record.md lists every unavailableReason with its classification rather than summarising it away, and a review outcome joins the same file.
- exports/summary.md stays the sanitized outward record; the two are separate because most Runs are never exported and redaction can block an export outright.
- The Mutation Engine is the only window for state change: M4 ledger append is the commit point, the workspace lock is fail-fast and never auto-broken, and an identical repeat is a no-op by mutationId.
- The Objective ledger is append-only JSONL; objective.json is rebuilt from replay, and a hand-edited snapshot is READ_MODEL_DRIFT repaired by rebuild, never by patching the ledger.
- A structurally broken ledger blocks replay rather than deriving a plausible snapshot.
- Queue state is stored as WAITING / BLOCKED / SKIPPED / CANCELED and enforced against the fixed transition table; CANCELED is terminal and SKIPPED returns to WAITING only through an explicit unskip with a reason.
- NEXT is derived, never stored, and a SEQUENCE Objective has at most one; QUEUE_REORDERED declares a new future order and refuses to touch decided items.
- The Task ledger owns approval, replayed from events rather than stored on the task file, and approval binds to a content hash.
- An unapproved Task cannot run and leaves no Run Trace; editing after approval revokes executability, and re-approval requires an explicit invalidation first.
- Importing a local review appends RUN_REVIEW_DECIDED with migrationSource and migrationSourceRef; it never promotes the local file in place and never edits it, the bundle, or the Run Trace.
- VERIFIED is derived from the latest effective ledger decision and needs ACCEPTED, a satisfied or waived gate, and a successful result together; missing any one leaves the item unverified and the cursor where it was.
- Only MIGRATION_READY and MIGRATION_READY_WAIVED import; a waived acceptance carries its waived gaps into the ledger, and the same reviewDecisionId with a different bundle hash blocks migration rather than overwriting.
- A rule that quantifies over a set must report what it scanned, because a deterministic check that says nothing about its scope makes examining nothing look like finding nothing.
- Runtime artifacts carry scanScope counts alongside their verdicts: paths checked, attempts recorded and executed, refs hashed, gaps by kind.
- Missing final evidence is represented as unavailable / degraded reason instead of truth.
- policies.commands is read from the Project Profile and actually enforced: effectivePolicy carries the real matchers, verification preflight uses them, and blocked attempts become commandViolations with authority HARNESS_EXECUTED and scanScope HARNESS_EXECUTED_COMMANDS_ONLY. Before this, a profile could deny a command and the Run would still execute it.
- A matcher token containing pattern characters, an unknown key under policies.commands, and a destructive entry without a well-formed categoryId each fail the profile, because each one otherwise produces an empty denylist that looks like a full one.
- A Run whose every verification command was blocked by policy records VERIFICATION_BLOCKED_BY_COMMAND_POLICY with a count, instead of authority NONE with no reason. That path was unreachable while the matchers were always empty.
- policies.harness is read. An execute-mode Run whose commands no Harness-visible channel can see is refused at planning time, before any Run directory exists; proceeding requires policies.harness.allowDegradedCommandObservation, which records the decision without making anything observed.
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
-> Risk rule expression syntax
-> AgentRole field decomposition
-> Policy rule id rules
-> Final consistency re-audit
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
- Risk rules carry no matching language of their own; matchTarget selects the files glob matcher, the command argv matcher, the redaction regex subset, or a declarative field predicate.
- Risk rule conditions combine as a flat allOf; OR is expressed by separate rules since computedRisk is a max, and NOT is denied so a failed match cannot lower risk.
- UNKNOWN risk is an unresolved state off the LOW < MEDIUM < HIGH axis, never rewritten to HIGH, and it blocks progression that needs a concrete level.
- A Core AgentRole owns only defaultMaxMode, deniedCommandCategories, and roleGuidance, and never restates a restriction owned by Guardrail global rules or harnessMode.
- roleGuidance is prompt-only text never read during policy evaluation; restrictions a machine cannot decide belong there.
- The per-role restriction list is a diagnosticOnly read model computed from role fields and global rules; enforcement always reads effectivePolicy.
- Policy rule ids match [A-Z][A-Z0-9_]* and are unique across the combined Core and Project Profile id space.
- Rule origin is recorded in definedByRef as path and hash, never encoded as an id prefix, so promoting a rule between origins never changes its id.
- Rule ids are permanent; a retired id is never reassigned, so past evidence stays resolvable.
- The three fields named authority are three different enums: verification 5 values, command 4, changedFiles 3. Implementations must not merge them into one type.
- Core owns seven destructive command categories: INFRA_APPLY, INFRA_DESTROY, CLOUD_RESOURCE_MUTATION, SERVICE_LIFECYCLE, DEPLOYMENT_MUTATION, DATA_DESTRUCTION, VCS_HISTORY_REWRITE.
```

## Current Bottleneck

```text
a Harness-visible command channel
```

Why this is next:

```text
A verified in-scope Run now reaches result DONE, observedCheck PASS, gate
SATISFIED, and no path violation. ACCEPTED is still refused, for one reason:
the bundle is DEGRADED because run-summary normalization is PARTIAL.

The remaining count depends on what the adapter emits, which is the honest
answer rather than a single number:

  adapter emits a recognized command event   1 gap
    COMMAND_CHANNEL_NOT_HARNESS_VISIBLE
  adapter emits prose only                   2 gaps
    + PROVIDER_TRANSCRIPT_NOT_STRUCTURED
  adapter emits an unknown structured format 2 gaps
    + PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED

This is now pinned by tests rather than by a one-off manual measurement. The
1-gap case is test/run.test.ts: a Run given a recognized command event keeps
COMMAND_CHANNEL_NOT_HARNESS_VISIBLE, asserted with "the observation gap must
remain: parsing a transcript did not make commands observable". The other two
are test/provider-transcript.test.ts.

Closed since: WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02,
PROVIDER_TRANSCRIPT_PARSING_NOT_IMPLEMENTED_V02, and the unenforced command
policy.

A fourth reason exists and does not appear above because it is not reachable on
a fully configured Run: VERIFICATION_BLOCKED_BY_COMMAND_POLICY:<n>, recorded
when every verification command was refused by policies.commands.
```

What closing it actually requires:

```text
COMMAND_CHANNEL_NOT_HARNESS_VISIBLE is not an unimplemented rule. CodeFleet has
no command proxy, sandbox log, or container exec log, so the channel does not
exist to be read. Until one does, an agent's own commands can only ever be a
provider claim, which by design cannot satisfy command policy, verification, or
VERIFIED.

HARNESS_VISIBLE_COMMAND_CHANNEL is a single named constant (src/run.ts, `= false`),
so introducing a real channel is one edit rather than a search.

Until then, execute mode requires the decision to be recorded in the profile:

  "policies": { "harness": { "allowDegradedCommandObservation": true } }

The flag does not make anything observed. Runs under it keep the gap and still
require human review.
```

HarnessWorkspaceSnapshot, the slice that closed the state-evidence gap
(src/workspace-snapshot.ts, test/workspace-snapshot.test.ts):

```text
1. PRE_RUN snapshot captured before the adapter is given control, POST_RUN after.
2. git headRef / status / diff, scoped file snapshot, and stateHash each carry
   their own unavailableReason; a partial snapshot cannot pass as a whole one.
3. HarnessObservation.workspace references both snapshots and reports
   snapshotGaps plus scanScope counts.
4. changes.workspaceDelta = post minus pre over the scoped snapshot, so a file
   git is configured to ignore still shows as changed. Proved by an e2e test
   that gitignores the file the agent creates.
```

Design-to-code coverage, added 2026-08-10:

```text
npm test now ends with a coverage number over FINAL RULE condition lines.

  155 of 545 condition lines claimed by a passing test  (28.4%)
  42 of 83 rules touched, 2 fully covered, 41 with no claim at all

A claim is coversRule(ruleId, "condition text") called inside a test body, so
only a passing test records one. An unknown ruleId, a condition quote that is
not in the rule, zero claims, or coverage below the baseline all fail the run.
The checker is itself tested in test/rule-coverage.test.ts.

Before this existed, "is it implemented as designed?" had no answer that could
be re-derived. The doc header said "구현 진행도 약 60-70%" with nothing behind it.

Every unclaimed rule is classified in docs/rule-implementation-status.json, and
the checker enforces the classification: every rule needs a claim or an entry,
an entry goes stale the moment a test claims that rule, and an evidence path that
does not exist fails the run.

  NOT_IMPLEMENTED        32 rules  198 condition lines  no code
  IMPLEMENTED_UNTESTED    6 rules   31 lines            code exists, no test
  NOT_CODE_VERIFIABLE     3 rules   17 lines            design/process rules
  claimed, still open              144 lines            inside the 42 touched rules

The 16 IMPLEMENTED_UNMAPPED rules (148 lines) were labelled on 2026-08-10 and
moved coverage from 15.8% to 27.5% without a line of product code.

198 lines is the real size of the remaining build, re-derived after the command
policy work rather than carried forward:

  Project Profile schema, overlay, adapters     52  12 rules
  requiredGates concretion and merge            48   3 rules
  Export / Redaction / S5                       32   7 rules
  system auto-review bound + actor gate         23   2 rules
  AgentRole / Guardrail                         23   4 rules
  Risk engine                                   16   3 rules
  ledger corrective event                        4   1 rule

The 144 open lines inside already-claimed rules are the next largest single
block and are mostly unimplemented conditions, not unmapped ones — e.g. Task
YAML has no agentRole, guardrails, or requiredGates field at all.
  npm run coverage:uncovered
```

Next implementation slice:

```text
NOT CHOSEN YET. The previous entry here — connect command policy to the Run —
was completed in 3380691 and 0724e18 and is described under Current
implementation status.

Three candidates remain, with their measured sizes:

  Project Profile schema        52 lines / 12 rules
    Largest block, and the precondition for several others: requiredGates,
    agentRoles, and adapter resolution all read from the Profile.
  requiredGates concretion      48 lines /  3 rules
    Task YAML has no requiredGates field at all, so this is schema plus merge
    plus gate evaluation, not a wiring job.
  Export / Redaction / S5       32 lines /  7 rules
    Self-contained. The only one that can be built without touching the
    Profile first.

Not a candidate: a Harness-visible command channel. It is the current
bottleneck but not an unclaimed rule — see Current Bottleneck for why it needs
a proxy or sandbox rather than an implementation slice.
```

Standing constraint for any of them:

```text
Do not judge PROVIDER_REPORTED_ONLY commands against the policy. Judging a
claimed command means believing it, and a rejected Run built on a claim is a
decision made from evidence the design says is not evidence.
```

## Repository Note

Other machines should continue from committed and pushed files. Local untracked
files are not a handoff source.

Canonical design file:

```text
docs/concept-foundation.md
```
