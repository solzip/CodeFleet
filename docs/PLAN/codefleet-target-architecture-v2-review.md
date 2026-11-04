# CodeFleet — Product-aligned Target Architecture & Execution Contract (Revision 2)

> **Status:** `DESIGN_DIRECTIONS_APPROVED / R3_INTEGRATED / HOST_PROTOCOL_UNVERIFIED / NOT_IMPLEMENTED`  
> **Prepared:** 2026-11-04  
> **Source proposal:** `docs/product-completion/target-architecture-proposed.md` (2026-11-03)  
> **Companion:** `codefleet-codex-mvp-plan-v2-review.md`  
> **Integrated execution contract:** `codefleet-execution-contract-r3.md`  
> **Scope:** Codex CLI Single-Agent MVP architecture; Claude Code / Multi-Agent interfaces preserved  
> **Authority:** detailed supporting architecture for the owner-approved D1-D12 design directions. The integrated Execution Contract R3 controls where this document repeats or conflicts with an execution rule. Neither document grants Operator execution authority, Host Protocol Proof authority, M1 implementation authority, Git authority, or Host Live acceptance.

## 0. Decision and evidence discipline

This revision resolves technical ambiguities in the prior proposal while explicitly separating **(A) source-backed existing behavior**, **(B) approved design principles**, and **(C) still-open execution parameters**. The product owner approved the basic D1-D12 directions on 2026-11-04. Risk levels, budgets, concrete execution scope, first fixture, exact Git baseline and comparable operational values remain open. The two user-provided documents and the 2026-11-03 read-only/product and Coxwave audits are the source baseline. They are not fresh tests. GitHub `main` and a locally uncommitted checkout can differ.

The normative integrated rules and residual-decision register are in `codefleet-execution-contract-r3.md`. This architecture retains rationale and component boundaries; it must not be read as a second execution contract.

Prior design audit baseline: local CodeFleet HEAD `0965b800fd2918a43dc777962be6f86ef15b52f6`, GitHub `main` `b382380891fb0d259787f764f354934839815217`, PR #13 `0f4918a05a744e2f3f061fb2701b4a22867fa31e` (then open). These are **historical observations**, not verified current SHAs. PR #13 Work Log is not main functionality. `G0` must refresh all four source/runtime baselines and inspect local user changes before implementation.

The documented `src/alpha/controller.mjs::executeWorkflow`, `src/workflow/definition.mjs::readyBatch`, `src/workflow/persistence.mjs::{reserve,finish}`, `src/alpha/store.mjs`, `src/hosts/exchange.mjs`, `src/alpha/judge.mjs` establish existing **offline** reservation, candidate/evidence, finish and DAG-advance contracts. A live Codex Turn and public execution admission are **not accepted**. No new tests have run for this revision.

External Codex documents consulted for **integration options, not local capability proof**:

- https://developers.openai.com/blog/codex-as-a-platform — Codex CLI `exec`, Codex SDK, app-server have distinct integration ownership.
- https://developers.openai.com/codex/codex-sdk — SDK start/continue/resume of Codex threads.
- https://developers.openai.com/codex/app-server — thread/turn lifecycle, event streaming, approval request integration.
- https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex — Codex Goals are a **version-dependent, thread-scoped** continuation feature; availability, behavior and permissions must be probed on the target installed build.

**Source of truth:** CodeFleet's persisted Objective/Contract/Workflow/Attempt/Evidence determines admission and Objective completion. Codex thread state, its optional Goal, tool events and summaries remain Host-owned context; none is Operator approval or independent Judge evidence.

## 1. Product contract: why this exists

**Product:** CodeFleet is a Host-Native orchestrator that lets a developer express a software-development Objective once, delegates authorized work to the Host's actual coding tools/agents, preserves progress, enforces risk and resource bounds, repairs actual defects, and reports independently verified completion or justified handoff.

An Objective is accepted only when **Autonomous Execution × Controlled Process × Verified Results** operate **in the same trace**. Generated code volume, DAG size, tests-count, mock fixtures and reported Agent success are not product completion.

**Default user journey:** Goal → clarify material unknowns → versioned Task/Contract/criteria → DAG → review/approval → admit and reserve WorkItem → actual Codex execution → candidate capture → independent test/semantic Evidence → Judge → durable WorkItem outcome → successor via DAG edge / bounded repair / handoff → final integrated candidate in the **intended project state** → Objective-level criteria verification → completion report.

**MVP boundaries:** one actual Codex Agent; new and existing repositories; interactive or Host-return continuation; optional contract-selected Protected verification; bounded repair. Claude/Multi-Agent compatibility remains but are not MVP acceptance gates. No mandatory direct model API key, Docker, always-on service, new Goal engine, or parallel Scheduler DB. An inactive/nonexistent Host cannot be assumed to perform unattended computation.

## 2. Authority matrix

| Authority | Owns | Cannot substitute for |
|---|---|---|
| Codex Host/Skill | Existing model/auth/session/Tools, optional Host Goal, Host permission prompts and actual tool events | Authenticated CodeFleet Operator grant, independent verification, CodeFleet Workflow state |
| CodeFleet Task/Contract | Objective history, active revision, criteria, allowed resources/commands, acceptance and budget | Host model authorization or physical tool isolation |
| Coordinator/Scheduler | DAG readiness, reservation, exact binding, failure-next-action, integration | Grant approval, invent tests or claim success |
| Admission/Harness | Approval/Capability/Lease/Fence/Attempt/Scope verification, effect boundary | Downgrade required Protected to Local |
| Candidate/Verifier | Captured tree/diff, actual check results, observer/backend authority | Agent assertions or future unrun checks |
| Judge | Outcome per verified criterion and Objective | User/product judgment or unseen effects |
| User/Operator | Goal, policy/risk, material scope decision, valid grants | Agent-supplied actor string as authentication |

### 2.1 Modes and labels

- `PROPOSAL_ONLY`: **proven** tool-free structured proposal; no actual code execution claim.
- `HOST_OBSERVED`: Host-driven read/planning under actual permissions; Host observations are not protected Evidence.
- `CONTROLLED_LOCAL`: explicitly approved supervised local change/test; authority is `LOCAL_EXECUTED` where an independent local check was really observed; no strong OS adversarial-isolation guarantee.
- `CONTROLLED_PROTECTED`: actually enforced/authenticated Operator and selected protected Backend. The existing public gate must remain fail-closed until that enforcement is proven.

**Separate axes:** execution mode; observation authority (`HOST_REPORTED`, `LOCAL_EXECUTED`, `PROTECTED_EXECUTED`); Objective result (`COMPLETE`, `REPAIR`, `BLOCKED`, `INCOMPLETE`, `HUMAN_HANDOFF`). No `COMPLETE` where criteria require a stronger backend than was used. Suggested user-facing results: `COMPLETE — LOCALLY VERIFIED (unprotected)` or `COMPLETE — PROTECTED VERIFIED` only after all contractual checks and destination-state checks pass; otherwise show exact missing criterion. **Defaults and eligible risk classes remain D2/D9 owner decisions.**

## 3. Exact Host boundary: two viable lanes, one must be proven

A major prior ambiguity: **existing `stagedExecution()` consumes responses prepared *before* `reserve()`**, and `submitResponse()` refuses submission after attempts exist. It does **not** implement a running Codex Turn after durable reservation. Treat its request binding/validation patterns as reusable but **do not wire current staged APIs directly to post-reservation execution**.

**Lane I — current interactive CLI/Skill:** Codex owns the active session and calls bounded CodeFleet commands. To claim automated DAG continuation, demonstrate an executable protocol that can reserve before Host tools, collect a stable Turn/effect receipt and invoke the next step *without a human re-prompt*. A prompt asking the Host to keep going is not a durable system trigger or security boundary. Codex Goals, where supported, may help keep a Host thread moving but **cannot authorize WorkItems or guarantee exact once**.

**Lane II — Codex SDK/app-server controller:** a CodeFleet-controlled local integration can start/continue/resume Codex threads, observe lifecycle and permission events, and wake an approved WorkItem after persisted state. It may start a separate Host process/thread and must **not claim attachment to the user's already active interactive CLI session without specific proof**. Reuse installed Codex authentication and tools; do not copy access tokens or silently substitute direct Responses/model-API calls. No always-on service is required for Host-return continuation.

**Required G0 feasibility spike, before choosing D1/D11:** read target Codex CLI version/features, inspect skills/hook/Goal support, current Skill command UX, SDK/app-server thread/turn/approval surfaces, actual source/runtime identity, and supported sandbox behavior. Present supported same-session vs controlled-new-thread capabilities. Choose one **primary MVP lane**, document fallback as `BLOCKED/UNSUPPORTED`, and test it independently. Do not build both execution engines.

### 3.1 Proposed logical protocol (`HostExecutionV1`, not current implementation)

1. **Prepare:** persist an immutable reviewed `WorkRequest` referencing `objectiveId`, `taskId`, `contractRevision/hash`, `workflowId/revision/hash`, `workItemId`, `baseHash`, allowed file/command/resource scopes, context and criterion refs, budget, execution mode, expected observer/backend, approval reference. This is *not* authority.
2. **Admit + reserve:** Coordinator checks current approval/capability/base/lease/conflicts/limits and atomically reserves **attempt identity** + `STARTED` record before dispatch. A request not bound to the reserved attempt cannot be launched.
3. **Dispatch intent:** persist an immutable association `(requestId, attemptId, workflowRevision, hostExecutionMode, candidateWorkspaceRef)` and a non-authoritative dispatch state (`PREPARED`/`DISPATCH_REQUESTED`/`ACKNOWLEDGED`/`UNKNOWN`). A crash after intent but before start is still *potentially uncertain* unless the Host can confirm no effect.
4. **Host execution:** the selected Host lane performs one bounded Codex Turn with supported permission/sandbox semantics. Collect *observed* `threadId`, `turnId`, tool request/event IDs and completion/failure/cancellation statuses **only when the Host actually provides them**. Missing receipts remain `UNKNOWN`; no synthesized identifiers. Host prompt/tool-result content is untrusted.
5. **Result intake:** validate request/attempt/thread binding, freshness, identity, scope, cancellation, actual changed files and receipts. An Agent-reported diff/summary cannot stand in for a captured candidate. Duplicate response is idempotently rejected/recognized by exact identity; conflicting response is blocked.
6. **Verification:** capture candidate tree and hashes, execute only approved checks in the permitted backend, persist Evidence with observer/authority and acceptance criterion IDs, and call existing Judge (extended only for criterion-level semantics).
7. **Commit outcome:** persist child terminal result and artifacts; validate them; perform atomic parent `finish()`/event update; **re-read or conditionally revalidate persisted parent revision/state before next reservation**. Successor edges depend on committed, current, accepted Evidence, not memory-only `SUCCEEDED`.
8. **Follow-on:** next eligible WorkItem in same supported Host lane, new approved repair Attempt, explicit `RECONCILING`, or final integrated Objective acceptance. No dispatch without an available execution subject.

The exact API method and files are **G0-dependent**; `HostExecutionV1` is a *logical* contract, not an assertion that existing `issueRequests/submitResponse` implement this ordering. No privilege is derived from a `bindingHash` alone.

### 3.2 Minimum record relations (proposed, reuse existing DB/artifacts)

```text
Objective/Task --(contractRevision)--> Contract + criterion matrix
WorkflowRevision --(compiledFrom)--> ContractRevision
WorkItem --(dependsOn edges)--> prerequisite WorkItems
Attempt --(reservedFor)--> WorkItem + WorkflowRevision + approval/capability
HostTurnReceipt --(for)--> exact Attempt + request + workspace + Host identity
Candidate --(capturedFrom)--> actual isolated working tree + Attempt
Evidence --(observes)--> Candidate + ContractRevision + criterion + backend
JudgeDecision --(derivedFrom)--> current Evidence set
WorkItemOutcome --(committedBy finish)--> accepted child + valid Evidence
ObjectiveDecision --(derivedFrom)--> final delivered tree + all mandatory criteria
```

No new database/Goal engine. Existing `runs`, `workflow_attempts`, events, content-addressed artifacts and PR #13 candidates are preferred. Add columns/events only after G0 demonstrates current storage cannot express a required lifecycle fact. A text `actor`, `threadId`, hash, or Host approval UI alone does not establish an authenticated Operator boundary.

## 4. Candidate workspace and delivery contract — new explicit design gate D10

The old proposal said both “Codex edits files using Host tools” and “Controller applies an isolated proposal”. Those are **different execution models** and must not be mixed silently.

**Preferred controlled approach for an existing repository:** pin a real baseline and manifest; prepare a bounded isolated worktree/candidate root **if supported by the chosen Host tool policy**; allow Codex writes only within the candidate scope; capture the *actual filesystem change* including symlinks/modes/renames/deletes; verify against fixed scope and base. Never treat a text edit proposal as proof of actual writes. If OS-enforced isolation is unavailable, call it **supervised unprotected Local**, require explicit risk acceptance, and do not claim out-of-scope effects were impossible.

**NEW_PROJECT:** lack of HEAD and planned-but-nonexistent files are normal; reuse Bootstrap drafts/filesets and a distinct initial candidate area. Do not forge existing references, automatically `git init`/commit, or require an existing HEAD merely to plan. Only converge to existing repo workflow where actual repository/contract preconditions permit it.

**Destination delivery is a separate observable transition:**

```text
CANDIDATE_CAPTURED -> CANDIDATE_VERIFIED -> DELIVERY_ELIGIBLE
  -> approved destination apply/materialize (bounded, no automatic commit/push)
  -> verify destination tree/diff identity and required post-apply checks
  -> Objective evidence aggregation -> COMPLETE or INCOMPLETE/BLOCKED
```

- If a locally verified candidate remains only in an artifact, state = `VERIFIED_CANDIDATE_AVAILABLE`, **not** “user project implemented”.
- Before apply, require current destination base/status and exact changed-files manifest; if drift/conflict, stop or request revision. Scope/mode/symlink escapes are blockers, not sanitized after-effect permissions.
- Delivery may need separate approval if not covered by the current exact action/risk contract. Never silently commit, push, deploy, change secrets, install dependencies or contact external systems.
- After apply, observe destination state. Completion Evidence binds the *actual delivered tree*, not just a previous isolated candidate. Post-apply checks follow the selected Contract. A failure of destination verification leaves Objective incomplete and preserves recoverable artifacts.
- For interactive in-place Local editing **if owner elects it**, record a pre-edit baseline, provenance and post-edit capture, explicit `UNPROTECTED` trust label and limitation; if outside-scope effects might have occurred, fail closed for protected claims. Prefer the isolated candidate path for MVP.

**D10 must select isolation+delivery semantics before M2 implementation.** “Host tools respect a prompt” is not proof of filesystem enforcement.

## 5. Persistent DAG, context and completion contract

### 5.1 Node/Edge semantics

- **Node** = bounded WorkItem with stable identity, current Contract revision, inputs, declared file/resource scope, criterion IDs, needed Evidence and allowed execution lane. A role string is not another Agent.
- **Edge** = a prerequisite over **persisted accepted outcomes** and current Evidence authority; not just an ordering arrow or Host “done”. For mandatory fan-in, *all* predecessor gates must be satisfied. Independent accepted outcomes survive unrelated failure.
- **Ready** = dependencies valid. **Admitted** = ready plus current approval, capability, lease, budget, conflict and scope. Keep `readyBatch()` for ordering and `reserve()`/Controller for admission; do not make a second state machine.
- **Workflow terminal** = required WorkItems + final integration accepted. **Objective complete** = integrated, delivered target tree plus every mandatory current semantic criterion satisfied at the required observation authority.

### 5.2 Persist before execute and advance — invariants

| ID | Invariant | Evidence for acceptance |
|---|---|---|
| I01 | Unreserved WorkItem does not cause an external effect | ledger sequence + zero-effect negative test |
| I02 | Approval, revision, capability, lease, budget and conflict are current at dispatch | admission trace, blocked-effect zero |
| I03 | Attempt/dispatch are bound to one WorkItem+revision+workspace+Host receipt | bound references, replay/revision mismatch test |
| I04 | Candidate hashes are obtained from actual bytes, not Agent text | before/after file manifest and hash test |
| I05 | Child result cannot be accepted from Host report alone | observed checks and Judge rejection test |
| I06 | Child Evidence and accepted patch exist durably before `finish()` | crash/rollback test |
| I07 | `finish()` atomically updates attempt terminal + parent outcome + event | transaction fault injection |
| I08 | Successor never launches before committed predecessor acceptance | controlled event order and Host trace |
| I09 | No stale candidate/criterion/backend passes a revision edge | invalidation and negative tests |
| I10 | Wake-up is at-least-once and never authority; duplicate wake-ups cause ≤1 admitted logical attempt | two-process contention / duplicate trigger |
| I11 | Uncertain effects are reconciled or handed off, not blindly repeated | crash-point tests, Host call/effect count |
| I12 | `COMPLETE` means all mandatory criteria on the actual delivered tree at required authority | per-criterion matrix and final hash |

**Persistence failure:** an artifact write, store transaction, terminal update, or recovery read failure blocks dependent dispatch. Do not report a fake successful finish. A completed child interrupted before parent finish is reconciled with verified Evidence; a finished parent interrupted before next selection is re-entered using stored state.

### 5.3 Context and Codex Goals

Next WorkItem receives only a minimal deterministic context manifest: raw Objective reference, active Contract/Workflow revision/hash, WorkItem and prior accepted artifact refs, candidate base/current tree, relevant failure evidence, approvals/capabilities/remaining bounds, and outstanding owner decisions. Do not replay whole chat or treat a compaction summary as authority.

**Host Goals coexistence:** in Codex versions supporting `/goal`, it can help the Host continue turns toward a bounded outcome. CodeFleet **must not build a second general Goal engine**. It retains the independent contract/verification ledger needed for multiple WorkItems and protection. Do not activate two competing auto-continue loops for the same Objective. Host Goal may drive UI-level continuation only when each effect still passes CodeFleet admission, and its reported `complete` cannot bypass Judge. If impossible to gate, disable Goal for controlled execution and document `UNSUPPORTED` (D11).

## 6. Crash, recovery and trigger contract

| Crash boundary | Durable state requirement | Permitted next action |
|---|---|---|
| Before reserve | no Attempt | recompute eligibility; one reservation possible |
| Reserve/dispatch-intent committed, Host start uncertain | `STARTED` and request identity | query authenticated Host receipt if supported, else `RECONCILING`; no blind re-run |
| During Host tool effect | `STARTED` + observed event refs | inspect known effect, reconcile or handoff; not `PENDING` reset |
| Host finished, result not stored | persisted intent but no authoritative result | query validated Host result/change manifest or handoff |
| Child result/Evidence stored, parent unfinished | valid child, `STARTED` parent attempt | validate hashes/revision/authority then atomic `finish()`, no Host call |
| Parent finished, next not selected | terminal parent outcome | recompute ready from Store and proceed only with current admission |
| Approval wait | exact pending action+revision | verified approval transition and re-admission before wake-up |
| Host process gone | durable CodeFleet state | no background computation promise; resume on Host return if D3 approved |
| Compaction/new thread | current Work Log/contract/artifact refs | rebuild context, refresh eligibility; uncertain old turn may block |

A `wake-up` can be a non-authoritative persisted hint or a derivation from runnable Store state when a supported Host session resumes. Do **not** add an always-on polling service by default. Absence of a Host capability to launch/resume automatically must remain an explicit product limitation. Recovery may consume bounded reads to reconcile but must not use this allowance for unapproved new mutations.

## 7. Repair Attempt model — explicit storage gate D12

The old proposal recommends “new Attempt in same approved Contract”, but current `workflow_attempts(runId,itemId)` uniqueness and prior-attempt no-replay semantics make naïve re-reservation impossible. **A retry of one effect is not a Repair Attempt.** Do not mutate an old `STARTED` or overwrite terminal history.

**Proposed invariant and least-change representation (to be validated on G0 baseline):** one stable `WorkItem` may have ordered immutable `AttemptGeneration` records `(runId, itemId, generation)` with unique child ID, exactly one active reservation per item and a terminal status per generation. Parent `WorkItemOutcome` points to the currently accepted generation. Every generation is bound to current Contract/Workflow revision, predecessor accepted outputs, `repairOfEvidenceRef`, previous candidate hash, remaining budget and actual authorization. Existing v1 rows map to `generation=1` without loss; retain old reads and add versioned migration fixtures if a schema extension is necessary.

**Repair flow:** actual failing Evidence → classify (`TRANSIENT_IDEMPOTENT`, `CODE_DEFECT`, `CONTRACT_DEFECT`, `ENVIRONMENT`, `UNCERTAIN_EFFECT`) → check eligibility, no-progress and budget → reserve **new** generation before new Codex Turn → actual edit candidate with fixed scope → new independent verification/Evidence → Judge → atomic accepted outcome or bounded stop. No cyclic DAG edge is required. Revision/fresh approval is required for scope/criterion/backend/risks changes. A failed final integration uses explicit repair scope/review; do not silently mutate already accepted WorkItems.

**Migration/compatibility rule:** do not assume the parent/child data model can support this today. First inspect existing code, PR #13 proposals, schema versioning and historical fixtures. Consider additive artifact-backed history versus a versioned DB key; choose the smallest safe solution with an old-row reopen test and crash/rollback negative test. If it cannot be safely represented, `M4=BLOCKED`, not replay of the same attempt.

## 8. Evidence, Semantic Judge and delivery acceptance

Every acceptance criterion has a stable ID, explicit observable behavior, allowed verification command/tool/backend, minimum authority, target candidate/destination binding and failure/handoff semantics. User's words and required acceptance criteria remain versioned; tests are **evidence producers**, not universal definitions of success.

Evidence envelope: `objective/task/contractRevision/workflowRevision/workItem/attemptGeneration`, criterion ID, candidate and delivered tree identities, command/tool identity, observer/backend/authority, environment, timestamp/result/exit, sanitized artifacts+hashes, and limitations. A Host event is *provenance*, not `HARNESS_EXECUTED`.

Objective Judge outcomes: `COMPLETE`, `REPAIR`, `BLOCKED`, `INCOMPLETE`, `HUMAN_HANDOFF`. `COMPLETE` requires *every mandatory current criterion* proven at required authority on the actual target. `REPAIR` is only eligibility, not evidence of repair execution. Subjective criteria require an explicit owner decision (no invented semantic confidence score). Local and Protected success are never conflated.

**Candidate vs delivery:** acceptance of a patch candidate is not evidence the user's repository contains it. Record delivery decision and actual post-apply file identity; if no destination operation is approved, report `VERIFIED_CANDIDATE_AVAILABLE / INCOMPLETE` rather than project completion. If a contract intentionally targets *artifact production* rather than applied software, that must be a distinct approved Objective definition.

## 9. Exact scope / capability / budget rules

The owner defines D2/D9 defaults; until approved, the system fails closed for new writes and protected claims. Recommended MVP policy:

- Planning/read-only inspection within Host policy: no CodeFleet change approval, no product completion or hidden write.
- Ordinary local file edits/test commands: bounded WorkItem/fileset/command/tree scope, exact explicit human action and real Host permissions; no auto approval from a string actor.
- External/network/package installation/Git mutation/deployment/secrets/credentials: separate explicit approval, no implicit inclusion in goal text.
- Protected gate: only on authenticated/enforced Operator+backend proof; keep `requireProductionHostIsolation()` fail-closed until supported. A same-account shell is not an OS Operator boundary.
- Time/Attempts/cost: dispatch checks current bounds; uncertain cost remains `UNKNOWN` and never equals zero; exhaustion stops new effects. Monitor count of user interventions and unnecessary approval requests from the first Host pilot.

## 10. Approved directions and open execution parameters (D1–D12)

| ID | Approved design principle | Still-open execution parameter |
|---|---|---|
| D1 Host integration | Codex App Server managed Thread is the first Host-Native proof lane; no direct API key or duplicate Agent engine | installed-version protocol, events, approvals, result receipt, reconnect behavior and proof budget; all remain `UNVERIFIED` |
| D2 Local/Protected | supervised low-risk Local is permitted and cannot be promoted to Protected | risk classes, allowed commands/effects, backend and label matrix |
| D3 Continuation | auto-continue while the controlling Host is active; safely resume after Host re-entry | wake/re-entry trigger, retry timing and interruption timeout |
| D4 Acceptance sequence | first E2E uses a small existing-repository task; final MVP acceptance uses Todo+Calendar | exact fixtures, behaviors, platforms and acceptance commands after fixture inspection |
| D5 Existing code | reuse current contracts and PR #13 Work Log concepts only where compatible; no automatic merge | exact reusable diff, integration base and disposition of PR #13 |
| D6 Contract convergence | reuse common validated contract/admission/evidence paths while preserving truthful new-project pre-HEAD state | exact convergence boundary and migration sequence |
| D7 Runtime identity | bind source, Skill, Host/runtime and protocol identity to execution artifacts | supported versions, drift policy and fingerprint fields |
| D8 Repair | use a new bounded generation/Attempt/Candidate inside unchanged approved scope; revise and reapprove changed scope | attempt/time/cost limits and migration proof |
| D9 Approval bundle | exact scope, commands, budgets and duration may be approved together; risk or scope change requires separate approval | risk thresholds, expiry, command/fileset limits and budget values |
| D10 Candidate delivery | separate isolated Candidate verification, approved destination apply and post-apply target revalidation | destination, apply method, allowed mutation set and when a fresh approval is mandatory |
| D11 Scheduling | CodeFleet Controller is the only execution schedule decision-maker; Host Goals may carry context but cannot dispatch independently | supported Host wake mechanism and Goals compatibility proof |
| D12 Attempt history | keep existing Attempt invariants; generation-aware migration must preserve immutable history and compatibility | schema mapping, rollback, dual-read/write policy and migration acceptance corpus |

The values above must be bound before their affected execution. D1 Protocol Proof parameters block the proof itself; D2/D9/D10 parameters block mutating execution; D4 parameters block milestone acceptance; D5 and the Git baseline block integration; D8/D12 parameters block repair migration. Design-policy approval does not resolve any of them. The complete normative wording and residual-decision IDs are in Execution Contract R3 sections 3 and 13.

## 11. Target acceptance matrix

| ID | Observable result | Required level |
|---|---|---|
| A01 | Actual Codex Goal → valid Task/Contract/DAG, re-query and unchanged repository | Host Live |
| A02 | Negative scope/approval/capability/lease/budget tests stop before effects | Offline + Host Live denied-action check |
| A03 | One actual Codex Turn is reserved-before-start; correct thread/Attempt and candidate recorded | Host Live |
| A04 | Candidate captured from actual bytes within scoped workspace; out-of-scope attempt blocked/labelled honestly | Offline + Host Live |
| A05 | A accepted/Evidence persisted before B Host launch, join waits all parents | Offline + Host Live |
| A06 | Duplicate wake-up/restart cannot reserve duplicate logical Attempt | Offline concurrency + Host Live |
| A07 | Uncertain effect is `RECONCILING` and not silently replayed | Offline + Host Live interrupted-turn |
| A08 | Child accepted before parent finish survives crash with no second Host call | Offline crash fault injection |
| A09 | Exact pending approval can resume; stale/revoked/expired approval causes zero effect | Offline + Host Live |
| A10 | Actual failing code → new approved repair generation → new Candidate → reverify or bounded handoff | Offline + Host Live |
| A11 | Current criteria + actual backend + final delivered tree yield Objective Judge result | Offline + Host Live + E2E |
| A12 | New repo Bootstrap and existing repo edit both accepted under truthful distinct initial evidence | Host Live + E2E |
| A13 | Candidate accepted but not applied cannot be reported as user project complete | Offline negative |
| A14 | Host Goal/Skill or SDK/app-server does not create a parallel unbounded continuation path | Offline + supported Host Live |
| A15 | Runtime/Skill/source fingerprint and Host version bound to execution artifacts | Offline + Host Live |
| A16 | People/approval counts, duration and measured/unknown agent/tool cost logged without fabricated savings | E2E telemetry |

**Two acceptance milestones:** `FIRST_VERTICAL_SUCCESS`: a real **COMPLETE** Objective with joined evidence for A01–A11 as applicable in one repository shape; a justified safe stop is a separate `SAFE_VERTICAL_STOP`, **not** success. `CODEX_MVP_ACCEPTED`: all mandatory A01–A16 and both NEW_PROJECT and EXISTING_REPOSITORY cases on supported selected OS/Host combinations. Module-level PASS counts do not substitute for a joined trace. An unverified required protected gate prevents completion, even after local tests pass.

## 12. Implementation and governance boundary

This is the detailed architecture supporting Execution Contract R3, not a claim that runtime, installation, security boundary or file delivery works. Use the companion implementation plan for gated G0→M6 sequencing. Before source changes: complete an explicitly authorized Host Protocol Proof, refresh and approve the real Git/source baseline, bind the affected residual parameters, and separately authorize the M1 WorkItem. Do not rewrite historic audit artifacts or silently merge PR #13. A documentation decision, code change, or offline pass cannot be promoted to Host Live acceptance. At every milestone report `DOCUMENTED`, `IMPLEMENTED`, `OFFLINE_VERIFIED`, `HOST_LIVE_VERIFIED`, `E2E_ACCEPTED`, `BLOCKED`, `CAPABILITY_GAP`, `NOT_RUN` separately.
