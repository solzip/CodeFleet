# CodeFleet Codex MVP — GitHub implementation branch status

> **Branch:** `work/codex-mvp-vertical`
> **Contract:** `docs/PLAN/codefleet-execution-contract-r3.md`
> **State:** `CODE_IMPLEMENTED_PARTIAL / OFFLINE_NOT_RUN / HOST_LIVE_UNVERIFIED / OBJECTIVE_E2E_NOT_ACCEPTED`
> **Verification responsibility:** CodeFleet implementation is authored in the GitHub Draft PR; Codex local execution and independent acceptance are deferred until the implementation is ready for final verification.

## Preserved constraints

The existing Controller, SQLite Store, DAG readiness/reservation, Evidence/Judge and production OS-Operator isolation guard remain authoritative. There is no direct Responses API replacement, new Goal/Scheduler database, public permission bypass, or automatic merge. Proposed read-only managed Thread is an additional **trusted injection seam**, off by default. Codex native Host Live verification remains deferred. GitHub PR CI is an independent offline checkpoint; record each new head's status rather than assuming earlier commits cover later changes.

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
| Existing Controller/Workflow Store | Optional successor overlay, bounded unknown subscription usage grant, Repair generation dispatch, destination intent, post-apply Objective gate | Integration authored; not Host-Live accepted |
| `src/product/destination-evidence.mjs` | Scoped Local post-delivery criterion checks with independent observation and explicit grant | Code and tests authored; unprotected Local |
| `src/product/objective-status.mjs` | Read-only Objective status projection: reobserve actual target; never equate artifact-only COMPLETED with Objective COMPLETE | Code and tests authored; live not run |
| `src/product/codex-mvp-facade.mjs` | Trusted facade joining existing Codex planning, Bootstrap Fileset, approved Controller Workflows and delivered-tree reporting without a second scheduler | Code and denial tests authored; not a public Host execution route |
| Repair Generation 3+ | Contiguous immutable generations reference the latest FAILED attempt rather than blindly reopening generation 1 | Code and regression test authored |

## Actual implementation versus acceptance

- A **real Codex model Turn making source edits** has not been demonstrated. A supervised workspace-write route is implemented behind trusted injection and UNPROTECTED labels but remains unaccepted and is not a public authorization path.
- The Host adapter supports both proposal-only (Controller applies bounded edits) and opt-in inspected Host workspace-write modes. Neither mode is Host-Live accepted; a Host tool receipt alone is not independent verification or a protected sandbox.
- The current existing-repository Alpha contract still requires declared source and regression tests. A trusted green-baseline exception is opt-in and limited by independent verification.
- Local delivery is explicitly `UNPROTECTED`; even post-apply byte matching is not semantic Objective completion.
- Semantic completion requires exact current criterion Evidence from an independently trusted producer; the pure Objective judge does not manufacture that Evidence.
- No local Codex Handshake, Model Turn, test runner, protected backend or original user repository was invoked from GitHub.
- Original P1 FAIL is preserved. P1 R2 remains a separate local Host capability proof and is not automatically approved.

## Remaining work before final Codex verification

1. Validate syntax, module imports and workflow/repair/delivery negative tests locally; resolve any discovered gaps without weakening default policies.
2. Bind authenticated supervised-local/approved protected admission to the proposed trusted Host and delivered-tree interfaces, without exposing a public bypass.
3. The trusted facade exposes existing planning and pre-HEAD Bootstrap proposal modules. Complete and independently verify their actual Draft/Contract/DAG-to-approved-Workflow transition, especially the user-facing entry UX; do not mistake submitted proposals for approved implementation.
4. Review and test the authored criterion-indexed destination evidence producer and read-only Objective status projection against the real target tree; integrate their visibility into a trusted user-facing surface.
5. Demonstrate A→B continuity, bounded real Repair, crash/restart reconciliation, and new/existing repository acceptance with approved fixtures and actual Codex Host.
6. Measure interventions, time, known/unknown cost and compare to baseline Codex development where feasible.

The Draft PR must not be merged or labelled `HOST_LIVE_VERIFIED` / `CODEX_MVP_ACCEPTED` merely because code was committed. This document does not grant any public execution or user data mutation authority.
\n## Implementation audit checkpoint\n\nThe existing Draft PR workflow reported a successful GitHub Actions run on the pre-change branch head (offline validation only, not native Codex Host Live). Any subsequent commit requires new CI and the current checkout still needs independent source/runtime verification. CodeFleet is not ready for Codex final verification or main merge.\n
## Trusted facade scope

The experimental `createCodexMvpFacade` composes existing modules behind an embedding-owned `enableHostTurns` switch and exact-scope grant callbacks. It neither authenticates an Operator by itself nor supplies a public CodeFleet command. A production CLI cannot pass untrusted callbacks as authorization. The existing fail-closed public isolation boundary remains unchanged. The facade's workflow runner may return an artifact-only candidate status rather than Objective COMPLETE.
