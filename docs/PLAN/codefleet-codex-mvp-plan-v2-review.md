# CodeFleet — Codex MVP Implementation & Acceptance Contract (Revision 2)

> **Status:** `DESIGN_DIRECTIONS_APPROVED / R3_ALIGNED / HOST_PROTOCOL_UNVERIFIED / IMPLEMENTATION_NOT_AUTHORIZED`  
> **Prepared:** 2026-11-04  
> **Source plan:** `docs/implementation/codex-mvp-implementation-plan-proposed.md` (2026-11-03)  
> **Architecture:** `codefleet-target-architecture-v2-review.md`  
> **Execution contract:** `codefleet-execution-contract-r3.md`  
> **Scope:** Codex CLI single-Agent, Host-Native user Objective completion with approved local execution and independently grounded acceptance. No implementation, test, Pilot, install, State mutation or Git action occurred while preparing this plan.

## 0. Product completion and project constraints

CodeFleet is not complete because its DAG, Store, Controller, approval ledger and Judge exist. The proof is **one continuous, observable Objective**: user goal → actual Codex planning and validated contract → approved real implementation → independent tests/Evidence → durable result and next WorkItem → bounded actual repair when needed → target-repository delivery/verification → per-criterion final Judge. Unauthorized effects and ambiguous side effects must be blocked. Never infer cost savings from test counts.

The original 2026-11-03 proposal is design history. This revision addresses gaps found in reviewing it: (i) `submitResponse()` currently requires a staged response before an Attempt exists and so cannot simply become a post-reservation Turn callback; (ii) Host tools modifying the real repository and Controller applying an isolated candidate are different models; (iii) a verified patch artifact does not mean the user's target repository contains the patch; (iv) current `workflow_attempts` uniqueness does not naively permit same-item repair generations; (v) Codex's existing Goals/SDK/app-server may provide Host capabilities that CodeFleet should reuse, subject to local capability proof.

Existing evidence: previous audits/source snapshots, not new test results. First action in G0 is to confirm GitHub `main`, PR #13, local dirty tree, chosen implementation worktree and installed Runtime. Do not assume earlier SHAs are current or merge PR #13 as a prerequisite without owner choice.

The product owner approved the basic D1-D12 design directions on 2026-11-04. Concrete risk grades, budgets, execution scope, first fixture, Git baseline and other values listed in Execution Contract R3 section 13 remain open. This plan must not turn design-policy approval into permission for source edits, live model turns, protected verifier setup, install, Git changes or external side effects.

## 1. Authorized development envelope (for future implementers)

Allowed only **after each milestone's separate scope approval**: smallest explicitly named source/test files, isolated local test fixtures, documented commands, no outside network/mutations by default, preservation of user-owned dirty/untracked work, and source SHA/runtime fingerprint. Not authorized by this plan: Git commit/push/merge/fetch/reset, OS broker bypass, credential extraction, global `safe.directory`, broad Host `--dangerously-bypass-approvals`, installing packages, running paid Codex turns, changing a user's CodeFleet State, Docker/WSL changes, or deploying anything. Get explicit approval for each when genuinely necessary.

Every milestone report distinguishes `CODE_IMPLEMENTED`, `OFFLINE_VERIFIED`, `HOST_LIVE_VERIFIED`, `OBJECTIVE_E2E_ACCEPTED`, `PARTIAL`, `BLOCKED`, `CAPABILITY_GAP`, `NOT_RUN` and `UNKNOWN`. Retain tests/Evidence with source/runtime SHA, target workspace, contracts, Host request/turn/effect receipts (where available), Attempt, candidate hash, observer/backend and Judge.

## 2. Non-negotiable reuse and code-boundary mapping

| Existing responsibility | Expected reuse / modification boundary | Evidence today |
|---|---|---|
| Intent/Bootstrap/G3 | `src/intent/{discovery,engine,semantic,bootstrap,contract}.mjs`, `src/product/tasks.mjs` | implementation/offline historical; Host Live unaccepted |
| DAG/ready | `src/workflow/definition.mjs::readyBatch`, validation and revision | existing, no new DAG engine |
| Approval/reserve/finish | `src/workflow/persistence.mjs::{approveWorkflow,reserve,finish,attempts}` | existing pre-effect transaction / one Attempt per item caveat |
| Controller/child | `src/alpha/controller.mjs::{execute,executeWorkflow}` | existing `dependencies.hostExecution` seam, final integration and Judge offline |
| Store/state/ledger | `src/alpha/store.mjs::{claim,save,event,artifact}`, workflow events | existing SQLite, lease/fencing; keep one authoritative ledger |
| Host staging | `src/hosts/exchange.mjs::{issueRequests,submitResponse,stagedExecution}` | current data-only **pre-reservation** route; reuse binding logic, not execution order unchanged |
| Host ingress/operator | `src/hosts/{cli,operator,operator-runtime,harness-service,workflow-authorization}.mjs` | public protected route currently blocked; no actor-approval bypass |
| Candidate/evidence | `src/alpha/{workspace,evidence,judge}.mjs`, `src/verification/backends.mjs` | existing protected-oriented path, need observed actual target delivery |
| Bootstrap filesets | `src/product/tasks.mjs`, `src/workflow/bootstrap-files.mjs` | can create/review scoped files; cannot assume existing HEAD |
| Work Log | PR #13 proposed `src/product/work-log.mjs` etc. | not current `main`; D5 decision necessary |
| Codex engine | existing installed Codex Host Skill; official Codex SDK/app-server/Goals if supported | capability options only, not verified current runtime |

No source path listed here is a guarantee it exists in the chosen local HEAD. At G0, produce a `path:function:line` call graph and change only files truly needed. Any new DB schema requires migration/reopen/rollback tests for historical states. Never weaken Legacy/Alpha approvals or protected evidence.

## 3. G0 — Decide the execution product contract and lock baseline (NO product implementation)

G0 is now split into three non-substitutable gates:

1. `G0_DESIGN_POLICY_APPROVED`: complete for the basic D1-D12 directions and documented by Execution Contract R3.
2. `HOST_PROTOCOL_PROVEN`: not run and `UNVERIFIED`; it requires a separately approved proof request with exact target, permissions, fixture, commands, budget, duration and acceptance criteria.
3. `M1_IMPLEMENTATION_AUTHORIZED`: not granted; it requires the proof result, an approved baseline, bound M1 parameters and an explicit implementation WorkItem.

The legacy G0-A/B/C subsections below remain as planning decomposition. Where their owner-selection language conflicts with the approved direction, R3 controls. Baseline discovery that changes no product state may support a later approval request, but no live Host probe or implementation is authorized by this document.

### G0-A: source/runtime reality

Deliver a baseline report with: actual local HEAD, selected implementation branch/worktree, remote main SHA, PR #13 remote head and patch contents, working tree tracked/untracked differences, Node/OS/Codex versions, actual `$codefleet` Skill entrypoint, installed package/CLI hashes, State schema version, valid historic test/Host Evidence SHA. User changes remain untouched. If prior source references differ from the current tree, update file/function mapping **before** coding.

### G0-B: Host capability & ownership decision (D1/D11)

Compare two primary candidates, based on **actual installed version** and official supported interfaces, without using new model invocations at design-review time:

| Lane | Strength | Unresolved | Go/no-go proof |
|---|---|---|---|
| I: current interactive Codex Skill | Best original-session UX; uses Host's owned model and tools | Can it reserve-before-write, receive trusted Turn/effect receipts, and automatically continue to next WorkItem without another prompt? Can a Codex Goal coexist without bypass? | Actual permitted sequence in a later approved fixture, stable receipts, zero invalid launch |
| II: Codex SDK / app-server | Programmatic start/resume/stream and approval lifecycle surfaces | May create separate thread/process rather than attach current CLI session; resource/permission/sandbox handling needs proof | End-to-end Turn lifecycle receipt bound to reserved Attempt; approved policy and no credential copying |

D1 conditionally selects **Lane II, Codex App Server managed Thread, as the first proof lane**. Lane I remains a future adapter, not a hidden fallback. The selected lane remains `UNVERIFIED` until the separately authorized Host Protocol Proof establishes its actual lifecycle. Where the installed Host API is unsupported, mark `CAPABILITY_GAP` and return to design; do not switch lanes or invent a command. Codex Goal may carry Host context only; CodeFleet Controller remains the sole scheduling decision-maker and two automatic loops are forbidden.

### G0-C: owner decisions and design freeze

The principle-level dispositions for D1-D12 are recorded in Execution Contract R3 and Architecture section 10. Bind only the residual values needed by the next gate: Host Protocol Proof values before that proof; baseline and bounded M1 values before implementation; D2/D9/D10 values before mutating execution; D4 fixture criteria before acceptance; D8/D12 values before repair migration. Select the clean integration source and PR #13 policy separately from any Git operation.

**Current G0 result:** design policy is approved and integrated, but Host Protocol Proof and M1 implementation remain blocked. A supported Host lifecycle, approved current baseline, selected Candidate/delivery parameters and bounded M1 WorkItem are later gate inputs, not retroactive conditions for the already completed design-policy decision. Missing inputs retain `OPEN`, `UNVERIFIED`, `BLOCKED` or `NOT_RUN`; do not leap to M1 or M2.

## 4. M1 — Codex Goal → validated Contract/DAG (Host Live)

**Value:** the user states a real development goal once; CodeFleet preserves raw Objective and can produce a reviewable contract and DAG without manual JSON authoring.

**Planned scope:** inspect current `src/hosts/cli.mjs::dispatchHost`, `src/product/cli.mjs`, `src/intent/*`, `src/product/tasks.mjs`, `src/workflow/{definition,bootstrap}.mjs`. Preserve raw Objective; clarify only decisions material to acceptance/scope/risk. Compile stable criterion IDs and evidence requirements into a versioned Contract. Both `NEW_PROJECT` and `EXISTING_REPOSITORY` must lead to a common approved execution *contract*, not necessarily identical physical bootstrap steps. Persist/re-query Task, graph, revision, scope, policy and minimal context references. Do not equate an approved plan with a write grant.

**Offline tests:** raw goal preservation, new vs existing repo, no-HEAD bootstrap, missing/stale citations, G3 validation, DAG cycle/edge error, revision migration, unapproved write denial, contract reload.

**Host Live:** actual installed Codex receives a natural-language goal via selected Host lane; returns validated Draft+Contract+DAG and re-queries same IDs. No external modification or permission promotion. No ungrounded auto acceptance criteria.

**Gate:** `M1_HOST_LIVE_VERIFIED` only with actual Skill/Host receipt and validated Contract/DAG. A fixture alone stays `OFFLINE_VERIFIED`. Owner-selected D4 has specific criteria and test plan before M1 can be done.

## 5. M2 — Real controlled Codex Single-Agent execution (P0)

This milestone has three separately testable slices. Nothing here grants a new public execution capability until approved Local/Protected gates have been correctly designed and verified.

### M2-A. Request/Attempt/Host Turn protocol

**Existing contract issue:** `src/hosts/exchange.mjs::submitResponse()` rejects submissions once an Attempt is present. `stagedExecution()` consumes a submitted response under an already active child reservation, but it never starts a Host Turn. Therefore reuse hash binding/request validation but **specify a separate post-reservation Host execution protocol**. Do not weaken the current staging gate.

**Proposed invariant:** persist approved request → atomic `reserve()` → bind `attemptId` and dispatch intent → one actual supported Codex Turn → bound response/effect receipt → observed candidate. Store `(requestId, attemptId, workflowHash/revision, hostThreadId/turnId if provided, executionMode, candidateWorkspaceRef, status)` as versioned records/artifact references using the existing Store. Do not pretend a guessed `turnId` or caller-provided actor authenticates an effect. Crash before/after Host start may remain `RECONCILING`.

**Candidate files/functions:** `src/hosts/exchange.mjs`, `src/hosts/cli.mjs`, `src/hosts/harness-service.mjs`, `src/hosts/workflow-authorization.mjs`, `src/alpha/controller.mjs::executeWorkflow`, selected Host adapter. Public `requireProductionHostIsolation()` cannot simply be removed. Supervised Local route and Protected route require separate evidence/claims.

**Offline negative tests:** attempts=0 before actual dispatch; stale contract/revision, duplicate/late/conflicting response, approval revoked, wrong workspace, invalid receipt, unknown cost, lost lease, scope denial, no bypass of Operator gate; no external calls when reservation transaction fails.

**Host Live:** permitted Codex Turn starts only after durable reservation, returns identifiable result and tool events, change is observed; negative denied action has zero observed effect where testable.

### M2-B. Workspace/candidate and destination delivery (D10)

Select a bounded isolated candidate for existing repos (e.g. dedicated verified worktree only where valid) and a distinct approved Bootstrap candidate for new repos without HEAD. Record full baseline manifests, modes/renames/edits, actual after-tree and scope drift; never trust patch text as filesystem proof. If selected Host environment cannot enforce isolation, label supervised Local unprotected and require explicit owner acceptance; do not assert protected isolation.

Follow `CANDIDATE_CAPTURED → CANDIDATE_VERIFIED → DELIVERY_ELIGIBLE → approved APPLY/MATERIALIZE → DESTINATION_OBSERVED`. If target changed since baseline, stop/reconcile; do not silently reset user files. No automatic commit/push/deploy/init. An accepted isolated patch alone leaves Objective `INCOMPLETE / VERIFIED_CANDIDATE_AVAILABLE`; verify the actual delivered tree and post-apply criteria before Objective completion.

**Offline negatives:** out-of-scope writes, symlinks, path traversal, target baseline drift, stale candidate, duplicate delivery, partial apply/recovery, missing target hash, rejected delivery. **Host Live:** Codex makes a real bounded change; independent verifier observes candidate; approved destination apply creates the intended files and the actual target tree identity is recorded.

### M2-C. Verification/admission gate and first actual WorkItem

Reuse `src/verification/backends.mjs`, `src/alpha/evidence.mjs`, `src/alpha/judge.mjs`, Controller child execution. Require actual test command identity/output/exit and candidate hash; Host narrative isn't evidence. Local Verified and Protected Verified are distinct; missing required protected backend returns `BLOCKED`.

**M2 acceptance:** one real Codex WorkItem is reserved, edits the approved candidate, is checked by an actual independent Local or contract-selected Protected verifier, is durably accepted or blocked, and an approved delivery/review path exists. No claim that full Objective is complete. Every artifact must carry source/runtime/Host/Attempt/target references.

**Stop:** if OS Operator required but unavailable, Host cannot produce required event/provenance, authorization cannot be enforced, or candidate workspace cannot be observed. Do not disable security checks for a PASS.

## 6. M3 — Persistent DAG continuation and bounded safe resume

**Value:** after A is accepted, B can continue without repeated direction, and a session restart does not lose progress or duplicate uncertain effects.

**Existing:** `readyBatch`, `reserve`, `finish`, Store claim/fencing, completed-child Evidence reconciliation, uncertain `STARTED` no-replay. **Change only gaps:** durable re-entry on supported Host return, minimal context rebuild, Host result reconciliation, and no competing Host Goal auto-loop. Adopt PR #13 records only if D5 approves selected fields after code diff.

**Design/test sequence:**

1. A is accepted with actual Evidence; `finish()` commits parent+attempt+event atomically.
2. Next ready eligibility is re-read or conditionally validated against current persisted workflow and permission/lease/budget.
3. A successor gets a distinct pre-effect reservation and the minimal context manifest built from predecessor *artifacts*, not untrusted chat memory.
4. On restart with no outstanding effect, a trusted Host wake-up/query finds READY B and proceeds. Duplicate wake-ups are non-authoritative; existing fence and reservation ensure one logical attempt.
5. If `STARTED` is unresolved, reconcile authenticated Host status or `HUMAN_HANDOFF`; never reset blindly. Child completed but parent unfinished may be finished from existing Evidence without Host replay.

**Offline tests:** controlled process crash windows (before reserve; after reserve but before Host ack; during tool; after result before finish; after finish before selection), duplicate wakeups, lost lease, revision/approval change, cost/Attempt preservation, context digest mismatch, unresolvable attempt no-replay, fan-out/fan-in.

**Host Live:** two dependent real Codex WorkItems in one Objective; B does not start before A accepted commit; new Host session/compaction reopens same identity with zero A replay; if an effect cannot be reconciled, it stops safely.

**Gate:** M3 is accepted only under approved D3 (`HOST_AVAILABLE_CONTINUATION / RESUME_ON_RETURN` is the current recommendation). Do not promise computation while no Host execution subject exists. No new scheduler DB or resident daemon.

## 7. M4 — Actual bounded Codex Repair with generation-aware Attempts

**Value:** a real failing test becomes a bounded source correction and a new candidate, not merely `RETRY` or an extra prompt to the user.

**Storage precondition:** review `workflow_attempts(runId,itemId)` uniqueness and all code/fixtures before implementing a second Attempt for the same WorkItem. An old terminal record cannot be replaced, and the previous `STARTED` cannot be replayed. G0/D12 must choose a backward-compatible immutable attempt generation representation in existing Store (`(runId,itemId,generation)` or safe artifact-backed equivalent), and migration/read-compatibility/rollback tests. If safe migration is unsupported, M4 remains `BLOCKED`.

**Repair sequence:** failed actual verification Evidence → categorize defect vs transient vs contract/infra/uncertain → check scope/approval/remaining time/cost/Attempt and no-progress → reserve new generation → a new real Codex Turn receives fixed failure Evidence+candidate+diagnosis constraints → modify source in allowed candidate → independent reverify → new Evidence/Judge and updated accepted generation or handoff.

**Offline:** missing/Agent-fabricated failure Evidence denied, identical failure/no diff stop, exhausted budget, stale attempt, scope expansion requires revision, final integrated repair conflicts, no dead loops, migration from existing attempt rows. **Host Live:** one deterministic source defect, failing test, changed candidate and passing recheck in approved bounds; also failure/handoff case.

**Gate:** `M4_HOST_LIVE_VERIFIED` only with actual Codex edit and new candidate/verification. A repeated identical command or unmodified candidate is not Repair.

## 8. M5 — Objective-level semantic Evidence/Judge and delivered-project proof

**Value:** developer trusts that the requested behavior is in the actual target repository and meets approved acceptance criteria, not just a test runner's exit status.

D4 selects **one real Objective first** and its criterion matrix (e.g. Todo+Calendar: same task data reflected in list and calendar; CRUD, completion, date/time and month/week view; use only those owner-approved). For each criterion specify criterion ID, required observation, exact tool/test, environment/backend, minimum authority, expected result and handoff for subjective decisions. Never invent missing tests or mark UI behavior proven by mere compilation.

**Reusable:** content-addressed Evidence, Candidate/Contract hashing, final integration, Judge. **Missing:** criterion-indexed actual observation producers and aggregation bound to final **delivered destination tree**.

**Tests:** missing/unrun criterion → `INCOMPLETE`; stale candidate/revision/backend → reject; Local evidence for Protected requirement → reject; Host report only → reject; subjective review → handoff; validated candidate but unapplied → not complete; after-apply tree differs → reject; all required delivered-tree observations → `COMPLETE` with authority label.

**Gate:** objective decision artifact records every criterion and validated target tree, with `COMPLETE`, `REPAIR`, `BLOCKED`, `INCOMPLETE` or `HUMAN_HANDOFF`; no unmeasured success claims.

## 9. M6 — Codex MVP technical acceptance and product value

There are **two different acceptance milestones** (the older plan ambiguously allowed only one project shape for final MVP):

- **`FIRST_VERTICAL_SUCCESS`:** one approved real Objective, either new or existing project, demonstrates Goal/Contract/DAG → actual Host write/test → persist/next WorkItem → bounded Repair if necessary → delivered target state → Objective Judge **COMPLETE** and explicit Evidence. A justified safe stop is a distinct `SAFE_VERTICAL_STOP`, not `FIRST_VERTICAL_SUCCESS`. Actual repair success must be separately demonstrated for M4 acceptance even if the first Objective has no defect.
- **`CODEX_SINGLE_AGENT_MVP_ACCEPTED`:** both `NEW_PROJECT` and `EXISTING_REPOSITORY` under approved supported platform/Host configuration; mandatory criteria Evidence and negative guard tests; real restart/compaction where claimed; one correct final delivered target each; no silent protected claims. Claude and true Multi-Agent are follow-up, not MVP blockers.

**Measurements begin at M1/M2**, not newly at M6. Reuse event/report records to log: Objective ID/complexity, human prompts and steering count/time, approval count/time, wall-clock completion, Agent/Turn/tool count, reported/unknown model or subscription cost, failed/retried operations, test coverage/defects/rework, E2E result and unsupported/missing data. Unknown cost ≠ zero.

After first E2E, compare A: ordinary Codex single Agent vs B: CodeFleet single Agent with same initial repo/goal/criterion/backend/Host version where practical. Mark `NOT_MEASURED`/`INCONCLUSIVE` if no fair data. MVP technical acceptance and established productivity improvement are distinct verdicts.

## 10. Acceptance tests — explicit trace requirements

| ID | Contract assertion | Planned evidence | Phase |
|---|---|---|---|
| A01 | Actual Codex natural goal creates valid persisted Task/Contract/DAG | initial Goal receipt, IDs, validation/re-query | M1 |
| A02 | Unapproved/stale/scope/capability/lease/budget action has zero effect | offline negative tests + Host denied action | M2 |
| A03 | Real Host Turn starts **after** exact Attempt reservation | durable ordered events and actual thread/turn receipt | M2 |
| A04 | Candidate is based on actual isolated bytes, not just model narrative | before/after hashes and file manifest | M2 |
| A05 | B waits for persisted accepted A and current predecessor Evidence | parent finish event before B launch/receipt | M3 |
| A06 | Duplicate wake-up produces no duplicated logical Attempt/effect | process-race traces, Host call count | M3 |
| A07 | Uncertain tool side effect causes reconciliation/handoff, no blind retry | interrupted-turn trace | M3 |
| A08 | Child completed before parent crash is reconciled without a new Turn | child Evidence, parent finish, count 0 | M3 |
| A09 | Approval wait resumes only for current exact approved action | deny/revoke/expiry negative and approve positive | M2/M3 |
| A10 | Failure causes **new** real repair Attempt/Candidate/reverify | failing Evidence → new Codex change → new Evidence | M4 |
| A11 | Objective Judge evaluates all mandatory criteria on delivered tree | criterion matrix, target hash, Judge decision | M5 |
| A12 | New and existing repo paths accepted with their distinct initial conditions | separate Host Live/target traces | M1/M5/M6 |
| A13 | Verified but unapplied artifact cannot claim completed target | blocked/INCOMPLETE negative test | M2/M5 |
| A14 | Host Goals optional; no competing unsafe continuation or approval bypass | capability check + relevant negative trace | M3 |
| A15 | Installed Runtime/Skill/SHA/protocol identity matches run | receipt and version matrix | G0/M2 |
| A16 | Human intervention/time/call/cost outcome honestly recorded | event/report baseline and A/B dataset if available | M1–M6 |

**Mandatory joined trace** for each actual Objective: `(source SHA, installed runtime receipt, Codex version, OS, Objective/Contract/Workflow revisions, approval identity/scope, WorkItem/Attempt generation, reserve event, Host request/Turn/tool refs, candidate workspace/base+tree, actual verification check and backend authority, Evidence refs, Judge decision, parent finish, next ready selection, delivery receipt+target tree, Objective criterion matrix and final status)`.

A dry-run of CLI methods, Mock fixture, test count, or Agent “done” message is **never** a substitute for joined E2E Evidence. Negative tests must not require production effects; use isolated fixtures with approved limits only.

## 11. File/function-level delta and compatibility strategy

| Stage | Likely primary files | Minimal change intent | Do not change |
|---|---|---|---|
| G0 | `src/hosts/install.mjs`, `doctor.mjs`, docs/receipts | source/runtime/protocol binding; decision recording | user worktree, installed runtime without approval |
| M1 | `src/hosts/cli.mjs`, `src/product/cli.mjs`, `src/intent/*`, `src/product/tasks.mjs`, `src/workflow/{definition,bootstrap}.mjs` | actual Host planning → validated contract, criteria and common approval contract | legacy G3 citation integrity / automatic Git init |
| M2A | `src/hosts/{exchange,cli,harness-service,workflow-authorization}.mjs`, selected new Host adapter, `src/alpha/controller.mjs` | reserve-before-Host-turn lifecycle; real receipts and separate supervised/protected ingress | existing staged-pre-reservation semantics or isolation gate as a shortcut |
| M2B | `src/alpha/workspace.mjs`, `src/verification/backends.mjs`, `src/product/tasks.mjs`, integration/delivery contract | actual candidate capture, scope, approved target apply and target observation | user-owned uncommitted files; automatic commit/push |
| M3 | `src/alpha/controller.mjs`, `src/alpha/store.mjs`, `src/workflow/persistence.mjs`, selected Host adapter + PR #13 if approved | persisted wake-up / no-replay / context restore | new Scheduler DB / unbounded polling / automatic lease bypass |
| M4 | `src/workflow/persistence.mjs`, `src/alpha/controller.mjs`, `src/product/tasks.mjs`, repair artifact/contracts | versioned attempt generations; actual repair Agent, retention/migration tests | overwrite historical attempt / cyclic DAG retries |
| M5 | `src/alpha/{evidence,judge}.mjs`, `src/product/report.mjs`, `src/verification/backends.mjs` | criterion evidence producer, target tree-bound Objective decision | protected gate weakening / self-scored success |
| M6 | existing events/report/export; optionally minimal measurement metadata | matched comparison and final supported-scope report | benchmark platform/rewrite for MVP |

These are **candidate targets**, not source edit permissions or a fake exact diff. G0 must confirm actual paths and functions at the chosen baseline; each WorkItem freeze lists precise files, commands, behavioral invariants, tests, owner risk grant and rollback/Handoff before any edit. Preserve Windows/WSL/Linux/macOS as product targets without claiming untested platforms accepted.

## 12. Approved design directions and residual execution parameters

The product owner approved the D1-D12 design directions. This table is a planning index; Execution Contract R3 sections 3 and 13 contain the normative distinction between approved principle and open value.

| Decision | Approved direction | Residual value that still blocks affected work |
|---|---|---|
| D1 Host integration | App Server managed Thread first, Host-Native and no duplicate engine/API key | exact protocol/proof target, permissions, budget, lifecycle acceptance; `UNVERIFIED` |
| D2 Local/Protected | Permit supervised Local verified delivery with explicit trust label; protect only when contract/risk requires; no protected downgrade | M2 public completion labels `BLOCKED` |
| D3 Host exit | MVP resume-on-Host-return + active-session continuation; post-exit unattended daemon deferred | M3 claim `BLOCKED` |
| D4 Acceptance | small existing-repository first E2E; Todo+Calendar final MVP acceptance | inspected fixtures, exact criteria, backend/platform/command matrix |
| D5 Work Log | compare PR #13, integrate only minimum compatible Objective/revision/handoff facts; no automatic merge | M3 exact schema plan `BLOCKED` |
| D6 Bootstrap | converge at validated Contract and approved workflow; keep genuine NEW_PROJECT constraints | M1 unified acceptance `BLOCKED` |
| D7 Runtime | receipt hashes, hard protocol mismatch block and drift warning | reproducibility gate `BLOCKED` |
| D8 Repair | immutable bounded new generation within same Contract; revision for expanded scope | M4 `BLOCKED` |
| D9 Approval bundle | exact scope, commands, budget and duration may be bundled; risk/scope change needs new approval | concrete grades, limits, expiry and budget |
| D10 Workspace/delivery | isolate and verify Candidate, separately apply to approved destination, then reverify target | destination, apply mechanism, mutation boundary and fresh-approval triggers |
| D11 Scheduling | CodeFleet Controller is the only schedule decision-maker; Goals cannot independently dispatch | supported wake/re-entry mechanism and compatibility proof |
| D12 Attempt storage | preserve existing Attempt invariants and immutable generation history in the existing Store | migration mapping, rollback, compatibility corpus and acceptance thresholds |

The D1 product choice is no longer open, but the protocol is not proven. A managed App Server Thread is acceptable only as an actual installed Codex Host facility using Host authentication/session/tool policy; it must not be redefined as a new server running a Codex-like replacement engine. Remaining choices must be recorded with option, boundary, date and supported authority. A design-record approval is not an authenticated Operator grant.

## 13. Separate gate checklists

### A. G0 design policy

- [x] D1-D12 basic directions approved by the product owner and integrated into Execution Contract R3.
- [x] Approved principles separated from residual execution parameters.
- [x] Design approval explicitly excluded from Operator, Host Proof, implementation and Git authority.

### B. Host Protocol Proof authorization and completion

- [ ] Exact installed App Server target/version and protocol surface recorded.
- [ ] Read-only fixture, allowed process/files, approval behavior, event capture, duration and model/tool budgets approved.
- [ ] Start/reserve ordering, Turn lifecycle, approval request/response, terminal result, reconnect/re-entry and no-duplicate-dispatch criteria approved.
- [ ] Separate execution authority granted; proof run remains `NOT_RUN` until then.
- [ ] Actual result reviewed as `PROVEN`, `FAILED`, `CAPABILITY_GAP` or `INCONCLUSIVE`; no design text can check this box.

### C. M1 implementation authorization

- [ ] G0 local/remote/PR/installed Runtime baselines reconciled; dirty user files preserved.
- [ ] Current actual Codex version and chosen Host lane demonstrated or honestly `BLOCKED`.
- [ ] D1 proof result is accepted and the first existing-repository fixture/criteria/backend are selected after inspection.
- [ ] Exact workspace/target delivery semantics and risk policy approved.
- [ ] Source-to-contract versioning / migration / rollback and compatibility plans reviewed.
- [ ] Each milestone WorkItem has paths/functions, **permitted test commands**, model/Host budget, approval scope, negative cases and stop/rollback conditions.
- [ ] State/approval/Lease/Evidence authority remains enforceable; no external effect authorized by plan text.
- [ ] New/Existing repo E2E scope and completion label defined.
- [ ] Product owner explicitly approves **M1 implementation scope**; G0 design approval and Host Protocol Proof approval are not code-change approval.

If any applicable requirement is missing, report `DESIGN_OR_CAPABILITY_BLOCKED`. After each approved milestone, record actual source SHA, changed files, executed tests, Host evidence, failures, capability gaps and cost measurement. Do not revise historical test PASS as if it reran on a later checkout.

## 14. Ready-to-use Codex handoff instruction for **design validation only**

> Read `codefleet-target-architecture-v2-review.md` and this plan in full alongside the current local CodeFleet repository and prior audits. Perform a **read-only feasibility and compatibility review**, verify current file/function references and exact Git/Runtime baselines, compare currently supported Codex in-session Skill, SDK, app-server and Goals capabilities, and identify any missing lifecycle, workspace, delivery, Attempt-generation or Owner decision that would make M1/M2 unsafe or unrealizable. Produce a decision-ready report with code/evidence paths, per-decision alternatives, and a frozen *proposed* M1 WorkItem; do not modify source/tests/State, install dependencies, run Model/Pilot/tests, commit, push, merge or alter Git. Do not begin implementation until separate owner approval is given.

**Current result:** design revision completed; **no source changes, runtime changes, test results or Host Live execution** have been produced as part of this document.
