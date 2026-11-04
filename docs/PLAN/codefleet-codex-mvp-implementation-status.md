# CodeFleet Codex MVP — GitHub implementation branch status

> **Branch:** `work/codex-mvp-vertical`
> **Contract:** `docs/PLAN/codefleet-execution-contract-r3.md`
> **State:** `CODE_IMPLEMENTED_PARTIAL / OFFLINE_NOT_RUN / HOST_LIVE_UNVERIFIED / OBJECTIVE_E2E_NOT_ACCEPTED`
> **Verification responsibility:** CodeFleet implementation is authored in the GitHub Draft PR; Codex local execution and independent acceptance are deferred until the implementation is ready for final verification.

## Preserved constraints

The existing Controller, SQLite Store, DAG readiness/reservation, Evidence/Judge and production OS-Operator isolation guard remain authoritative. There is no direct Responses API replacement, new Goal/Scheduler database, public permission bypass, or automatic merge. Proposed read-only managed Thread is an additional **trusted injection seam**, off by default. The GitHub implementation environment has not run Node tests or native Codex.

## Implemented modules

| Path | Proposed responsibility | Accepted evidence |
| --- | --- | --- |
| `src/hosts/codex-app-server-session.mjs` | Bounded 0.166.0 JSONL read-only Thread/Turn protocol, identity and terminal-event checks, tool/approval rejection | Code, tests authored; live not run |
| `src/hosts/codex-managed-host-execution.mjs` | Reserved child and lease/revision/approval validation, Candidate-bound cwd, unknown cost label | Code, tests authored |
| `src/workflow/predecessor-context.mjs` | Accepted predecessor patch bytes and immutable Evidence references materialized in dependent candidate before Host Turn | Code, tests authored |
| `src/product/controlled-delivery.mjs` | Exact locally authorized clean-baseline destination apply, full delivered tree re-observation; partial apply remains uncertain | Code, tests authored |
| `src/product/objective-judge.mjs` | Mandatory criterion-indexed independent Evidence on delivered target; Local vs Protected vs owner review separation | Code, tests authored |
| `src/alpha/development-baseline.mjs` | Explicit trusted green-baseline development mode (Alpha regression-only default unchanged) | Code, tests authored |
| `src/workflow/repair-generations.mjs` | Additive immutable generation storage without overwriting legacy Attempt rows, new failed-evidence-bound child | Code, tests authored |
| Existing Controller/Workflow Store | Optional successor overlay, bounded unknown subscription usage grant, Repair generation dispatch, destination intent, post-apply Objective gate | Integration authored; not accepted |

## Actual implementation versus acceptance

- A **real Codex model Turn making source edits** has not been demonstrated.
- The Host adapter currently consumes a structured `PROPOSAL_ONLY` result; the Controller, not Codex Tools, applies bounded edits in an isolated candidate. A Host tool-driven workspace mode is a future separate capability and may not be silently substituted.
- The current existing-repository Alpha contract still requires declared source and regression tests. A trusted green-baseline exception is opt-in and limited by independent verification.
- Local delivery is explicitly `UNPROTECTED`; even post-apply byte matching is not semantic Objective completion.
- Semantic completion requires exact current criterion Evidence from an independently trusted producer; the pure Objective judge does not manufacture that Evidence.
- No local Codex Handshake, Model Turn, test runner, protected backend or original user repository was invoked from GitHub.
- Original P1 FAIL is preserved. P1 R2 remains a separate local Host capability proof and is not automatically approved.

## Remaining work before final Codex verification

1. Validate syntax, module imports and workflow/repair/delivery negative tests locally; resolve any discovered gaps without weakening default policies.
2. Bind authenticated supervised-local/approved protected admission to the proposed trusted Host and delivered-tree interfaces, without exposing a public bypass.
3. Implement a full natural-language Objective → validated Contract/DAG Host-native intake using the existing intent/bootstrap modules, including NEW_PROJECT pre-HEAD.
4. Provide a trusted criterion-indexed post-apply verification evidence producer and exact user-facing Objective report.
5. Demonstrate A→B continuity, bounded real Repair, crash/restart reconciliation, and new/existing repository acceptance with approved fixtures and actual Codex Host.
6. Measure interventions, time, known/unknown cost and compare to baseline Codex development where feasible.

The Draft PR must not be merged or labelled `HOST_LIVE_VERIFIED` / `CODEX_MVP_ACCEPTED` merely because code was committed. This document does not grant any public execution or user data mutation authority.
