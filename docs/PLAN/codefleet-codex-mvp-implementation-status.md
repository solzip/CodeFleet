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
| `src/product/codex-mvp-facade.mjs` | Trusted facade joining existing Codex planning, reviewed Contract/DAG → pending Workflow, Bootstrap Fileset, approved Controller Workflows and delivered-tree reporting without a second scheduler | Code and denial tests authored; not a public Host execution route |
| `src/product/codex-reviewed-workflow.mjs` | Promotes persisted VALIDATED Codex planning result to an exact pending-approval Workflow only after independent hash-bound scope review; deterministic idempotent creation | Code and acceptance/denial/stale-binding tests authored; no run grant |
| `test/codex-mvp-joined-fixture.test.mjs` | Synthetic two-dependent-WorkItem joined trace: persisted A before B, candidate, approved local delivery, criterion Judge and current target drift detection | Fake Host and fake verifier only; never Host Live or product E2E acceptance |
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
3. The trusted facade now connects persisted VALIDATED Host planning to a reviewed, still-unapproved Workflow/DAG. The final user-facing Host Skill/CLI entry, authenticated grant authority and native Host Live acceptance remain incomplete; do not mistake a submitted plan for authorized implementation.
4. Review and test the authored criterion-indexed destination evidence producer and read-only Objective status projection against the real target tree; integrate their visibility into a trusted user-facing surface.
5. Demonstrate A→B continuity, bounded real Repair, crash/restart reconciliation, and new/existing repository acceptance with approved fixtures and actual Codex Host.
6. Measure interventions, time, known/unknown cost and compare to baseline Codex development where feasible.

The Draft PR must not be merged or labelled `HOST_LIVE_VERIFIED` / `CODEX_MVP_ACCEPTED` merely because code was committed. This document does not grant any public execution or user data mutation authority.
\n## Implementation audit checkpoint\n\nThe existing Draft PR workflow reported a successful GitHub Actions run on the pre-change branch head (offline validation only, not native Codex Host Live). Any subsequent commit requires new CI and the current checkout still needs independent source/runtime verification. CodeFleet is not ready for Codex final verification or main merge.\n
## Trusted facade scope

The experimental `createCodexMvpFacade` composes existing modules behind an embedding-owned `enableHostTurns` switch and exact-scope grant callbacks. It neither authenticates an Operator by itself nor supplies a public CodeFleet command. A production CLI cannot pass untrusted callbacks as authorization. The existing fail-closed public isolation boundary remains unchanged. The facade's workflow runner may return an artifact-only candidate status rather than Objective COMPLETE.

## Synthetic joined trace

A new synthetic nonproduction fixture exercises the entire Workflow+delivery+Objective projection code path using explicit fake Host receipts and a fake independent observer. The test must never be described as an actual Codex model Turn, protected execution, or product MVP acceptance. It is included in `npm run test:codex-mvp` and GitHub CI. Native Codex final independent validation remains deferred under the user's instruction.

## NEW_PROJECT supervised Local bridge

The trusted Codex MVP facade additionally exposes approved Fileset materialization
through existing `materializeTask` and separately approved exact local verification
through `verifyTask`. It does not authorize a Fileset, create approval, bypass the
bootstrap owner or production OS isolation gates, or claim PROTECTED Evidence.
A model-produced proposal alone cannot modify the target. Every grant comes from
the trusted embedding, and the underlying store/lease/revision checks remain in
charge. This path still needs native Host Live and full NEW_PROJECT objective
acceptance after code completion.

## Workspace-write grant-time Candidate drift guard

An asynchronously reviewed supervised Host workspace-write grant is now tied to a second complete Candidate tree observation immediately **after** exact-grant approval and **before** the first write-enabled Host Turn. Changed approved source bytes, out-of-scope bytes, file modes or tree entries stop the Turn with `UNKNOWN_NO_REPLAY` instead of accepting a stale `baseTreeHash`. Two isolated negative regression tests assert that the transport is not invoked after grant-time drift. This narrows a local time-of-check/time-of-use window; it does **not** provide OS confinement, prove post-check immunity to races, authorize the Host, or constitute Host Live acceptance. The previous `ba44534c` GitHub Actions run succeeded on Windows and Linux; this new commit requires its **own** CI result before any offline PASS claim.

## Current read-only Objective Evidence revalidation

The Objective status projection now re-runs the existing independent delivered-tree
Judge against each persisted criterion Evidence reference before presenting COMPLETE.
Missing, stale or downgraded Evidence and a forged PROTECTED decision are not
accepted from a decision artifact alone. Offline negative regression tests were
added; this is still not Host Live acceptance or an execution authorization.
The change needs its own Windows/Linux GitHub Actions run before claiming CI PASS.

## Immutable mandatory criterion snapshot for Objective reporting

The Controller now persists a separate content-addressed criterion-set snapshot
bound to the Workflow revision, workflow hash and exact delivery receipt before
recording a final Objective decision. Read-only Objective status re-evaluates the
full pinned set, rather than reconstructing its requirements from the final
verdict; missing, mismatched or truncated sets cannot yield COMPLETE. The pure
Judge also rejects delivery receipts from a different Objective or revision.
Negative offline tests cover deleted/stale snapshots and cross-Objective replay.
This does **not** prove that the trusted destination verifier was initially
configured from owner-approved criteria, nor constitute Host Live acceptance.
The new head requires its own Windows/Linux CI before any PASS claim.

## Live cancellation and exact receipt binding for delivered-tree Local checks

The trusted post-apply Local destination verifier now requires an explicit coordinator
cancellation callback, and checks the delivery receipt's Objective ID, revision,
Candidate hash and unverified status before any grant or subprocess. The Workflow
Controller supplies its live lease/approval/control/time-budget guard as that callback,
rechecks the guard after verification, and the Local backend receives it for process
cancellation. A revoked/expired approval, cancellation or lost coordinator fence can
no longer leave a successful criterion artifact on this verification path. Negative
offline tests cover a missing fence, cross-Objective/revision receipt reuse,
revocation during asynchronous grant, and cancellation during a running check.
This narrows the Local path only: it does not provide OS isolation, eliminate all
races, prove Host Live execution or bind the initial criterion set to owner-approved
requirements. The new head needs its own Windows/Linux CI result.

## Regular-file boundary for Candidate and delivered Objective observations

The shared `candidateHash` observer now rejects symlinked/nonregular file
entries and symlinked parents before reading bytes, including same-byte link
substitution after Local delivery and unchanged tracked paths. It also rejects
unsafe relative paths and non-directory/symlink roots. The post-delivery Local
criterion producer and the read-only Objective status projection use this same
fail-closed observer. Negative tests cover a same-byte substituted link at the
verification boundary, the formerly COMPLETE read-only status, and path traversal.
Symlink creation may be unavailable on some Windows CI runners; such a case
is reported as a test skip rather than falsely called verified. This inspection
does not create OS confinement, guarantee atomicity against concurrent swaps,
or yet attest all file modes. The previous `327fdc6` Windows/Linux CI succeeded;
the new head requires fresh CI before any PASS claim.

## Context manifest path boundary (offline regression pending)

Before a trusted Alpha Controller builds the pinned context manifest for a Host Turn,
`context()` now invokes the same `candidateHash` regular-file observer used for
Candidate and delivered-tree observations on the complete requested source/test
set. This blocks absolute/traversal paths, symlinked parent directories and
symlinked Candidate roots before reading a file into Host context, even if the
final file itself is regular and readable. Offline regression fixtures cover
normal portable hidden files, out-of-root traversal, symlinked parents and
symlinked roots. This is a best-effort pre-read boundary, not atomic filesystem
confinement against concurrent swaps, nor an authorization to run a Host.
The new commit requires its own Windows/Linux CI before calling these tests PASS.
