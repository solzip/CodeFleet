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

## Reviewed planning repository identity and request integrity (offline CI pending)

The trusted `prepareReviewedCodexWorkflow` bridge now binds the persisted VALIDATED planning request to the canonical repository identity from the original Host code discovery, not only its Git baseline SHA. The exact independent review scope includes the canonical target root and hashed repository ID. Before and after asynchronous review the bridge verifies the target's identity, stored planning-request digest and result, preventing replay into a second clean clone with the same commit or acceptance of a changed raw request. The existing `createWorkflow` still independently rejects dirty or changed baselines; these checks do **not** grant execution, prove Host authentication or accept an Objective. Regression fixtures cover same-HEAD cross-repository replay and changed request bytes before/during review. The new head requires separate Windows/Linux CI before these tests can be reported as passing.

## Candidate root ancestor link boundary (offline CI pending)

The shared regular-file observer now checks every existing directory ancestor
of the Candidate or delivered repository root with `lstat`, not just the root
and its descendants. A real final directory reached through a symlinked parent
or Windows junction is rejected before reading context files or reevaluating a
persisted COMPLETE Objective. Regression tests exercise both the Host context
manifest and delivered-tree read-only Objective status on the same-byte target.
This is a pre-read guard rather than OS confinement or atomic protection from
filesystem races. Existing Host Live and final Objective acceptance remain
UNVERIFIED. The new commit requires its own Windows/Linux CI results.

## Delivery destination ancestry and grant-time drift (offline CI pending)

Supervised Local delivery now rejects repository roots reached through a
symlinked ancestor or Windows Junction before owner grant or filesystem effect.
After asynchronous exact-scope owner approval, and before storing the effect
intent or creating sibling stage files, delivery rechecks the Git baseline,
canonical repository root, parent directory types and original target bytes.
Offline regression fixtures cover an ancestor link, a parent swapped during
grant and source drift during review. This is a pre-effect guard only, not
atomic OS-level confinement against simultaneous path swaps. Native Codex Host
Live and final Objective acceptance remain UNVERIFIED. The new head requires
its own Windows/Linux CI before calling this change tested.

## Delivered-tree Objective Evidence type and protection consistency (offline CI pending)

The independent Objective Judge now requires a typed, explicitly complete
criterion observation with a nonempty verification-backend identity and a
protection label consistent with its claimed authority. A Local backend cannot
self-upgrade to `PROTECTED_EXECUTED` by changing the authority field, and an
incomplete or untyped observation cannot satisfy an Objective merely because
its test counts and hashes resemble a PASS. The read-only delivered Objective
status projection reuses this predicate and thus rejects the same stale or
mislabeled persisted Evidence. Offline negative tests cover both direct judging
and formerly COMPLETE status re-evaluation, while the synthetic joined fixture
continues to identify its fake Local observer. This is schema/authority
consistency checking, **not** attestation of an isolated verification backend,
Host Live proof or owner-criterion binding. The new head needs its own
Windows/Linux CI before reporting offline PASS.

## Pre-effect owner criterion scope binding (fresh CI required)

The supervised Local delivery Controller now requires an explicit bounded
`destinationDelivery.approvedCriteria` set supplied by the trusted embedding.
Before any destination mutation, the exact owner delivery grant receives the
Workflow hash and canonical mandatory criterion set/hash; the Controller
persists that reviewed set alongside the pre-effect delivery intent. The
post-delivery independent verifier may supply Evidence, **not** change, omit
or downgrade the originally reviewed criteria. Recovery refuses to complete
an already-delivered Objective without the original pre-effect criterion
record or if a new verifier supplies different requirements. The read-only
Objective projection requires the persisted approval and decision criterion
snapshots to match; legacy delivered outcomes without this binding fail
closed instead of being automatically grandfathered in. The Local verifier
exposes a defensive copy of its configured criteria; it cannot grant itself
new authority. Regression coverage includes the synthetic joined path,
criterion normalization and former COMPLETE revalidation against changed or
absent original approval. This still relies on a trusted embedding's owner
grant, not model-supplied authentication, Host Live or protected verification.
New Windows/Linux CI is necessary before declaring these offline tests PASS.


## Pre-effect Objective approval and Delivery receipt provenance (fresh CI required)

The delivered Objective status projection and Controller recovery path now require
an immutable joined chain: the persisted pre-effect delivery intent binds the
approved mandatory criterion artifact reference and criterion hash; the delivery
receipt must point to that intent and its applied file hashes must match the
approved changed-file hashes. Missing or mismatched intent, revision, Workflow
scope, repository, criterion approval, delivered files or receipt fails closed
instead of presenting Objective COMPLETE. An intent without a receipt is
reported as RECONCILING (uncertain external effect), not as a verified
Candidate; this projection does not replay or repair filesystem effects.
Historical delivery records without this link are not grandfathered into
COMPLETE. Synthetic joined-fixture and negative status tests exercise this
consistency invariant. It does not authenticate the embedding, prove Host Live
or attest protected verification. New Windows/Linux CI must pass separately.

## Post-intent destination path integrity (new offline CI required)

The supervised Local delivery path now repeats the clean Git baseline, lexical
root/ancestor, regular-file type, original-byte and mode checks **after** the
asynchronous durable intent callback and **before** creating any sibling stage
files. It also rechecks root, parent and target types, bytes and modes immediately
before each staged rename. A same-byte symlink substitution or parent Junction
introduced while recording the intent is treated as `DESTINATION_UNCERTAIN`
and never produces a Delivery receipt. Regression cases simulate both post-intent
path swaps. This narrows observable time-of-check/time-of-use windows but cannot
provide atomicity or OS-level confinement; Host Live remains UNVERIFIED.
The new head requires its own Windows/Linux CI result before an offline PASS claim.

## Candidate hard-link and case-alias boundary (new offline CI required)

The shared Candidate/Host-context/delivered Objective observer now rejects a
regular leaf with multiple hard links (`nlink !== 1`) and rejects case-folded
collisions among requested paths. An outside hard link may have identical bytes
and no symlink flag; it must not be accepted as an independent in-scope file.
Offline regression cases cover the Host context manifest and read-only COMPLETE
status after an identical-byte hard-link substitution. A platform unable to
create the hard link skips only that adversarial case. This is a fail-closed
regular-file identity check, not OS confinement, protection against concurrent
link swaps, or Host Live acceptance. The new head needs its own Windows/Linux
CI before reporting these tests as passing.

## Public read-only delivered Objective status (CI pending)

The existing `codefleet-alpha objective` entry now exposes:
`delivered-status <workflow-id>`. The command opens the SQLite Store read-only,
calls the trusted `readDeliveredObjectiveStatus` projection, and exits 0 only
for a genuinely COMPLETE delivered Objective; unverified or artifact-only results
exit 2. It rejects extra execution/approval/model flags and never starts a Host
Turn or initializes Task/Workflow tables. A read-only regression fixture checks
that a legacy artifact-only COMPLETED Workflow is reported only as
`VERIFIED_CANDIDATE_AVAILABLE`, preserves the original event count, and rejects
execution flags. This is an **observation/UX** increment, not the authenticated
Host execution entrypoint or proof of Codex Live acceptance. The changed head
requires its own Windows/Linux CI before declaring offline PASS.

## Accepted predecessor overlay hard-link and ancestor boundary (fresh CI required)

The A→B predecessor overlay now reuses the shared `candidateHash` regular-file
observer before any materialization and repeats a scoped observation immediately
before each write. Previously, a hard-linked Candidate leaf was regular by
`lstat` and `writeFile` could mutate the same inode outside the Candidate;
likewise a Candidate reached through a linked ancestor was not detected by its
leaf-root check. Regression cases cover an in-scope earlier file remaining
untouched when a later input is a hard link and a linked Candidate ancestor
refusing writes. This narrows pre-write drift windows; it is not atomic OS
confinement and does not establish Host Live or final Objective acceptance.
The new head requires its own Windows/Linux CI before reporting offline PASS.

## Post-observation Local Delivery approval guard (new offline CI required)

The supervised exact-scope Local delivery path now rechecks its trusted live
cancellation/lease/approval callback after the final awaited delivered-tree
observation and before it returns a success receipt. Previously a revocation
arising during the last filesystem observation could leave a successful
`DELIVERED_NOT_VERIFIED` result even though the approval was no longer valid.
The regression fixture revokes only at that final fence, and asserts the
already-applied bytes are treated as `DESTINATION_UNCERTAIN` with one
possibly applied file, never as a successful receipt. This guards the final
observed transition but does not make filesystem changes atomic, authenticate
the grant callback, prove Host Live, or accept an Objective. New Windows/Linux
CI is required for this head.

## Pre-dispatch Codex planning approval/source freshness (new offline CI required)

A managed planning request now reobserves the discovered Git source context
**after** the asynchronous trusted owner grant and **before** reserving a
billable App Server Turn. Dirty or newly committed code changes and expired
approval stop the Turn and cancel the stale OPEN planning session instead of
launching a Host Turn that can only fail validation after consuming usage.
The transactional dispatch reservation also verifies the stored request body
against its original digest to detect tampering during review. Negative offline
fixtures cover dirty source drift, clean HEAD replacement, and a changed
persisted planning request; none starts the injected Host transport. This is
a pre-dispatch freshness fence, not an atomic filesystem isolation guarantee,
Host Live proof, authenticated public admission or Objective acceptance.
A new Windows/Linux GitHub Actions run is required before an offline PASS claim.

## Codex planning repository cwd and denied-grant lifecycle (new offline CI required)

The trusted managed planning adapter now compares the canonical real paths of
its pinned source repository and Host cwd before opening a planning session.
An absolute but different cwd cannot start a Host Turn against unreviewed code.
A rejected or throwing asynchronous owner grant and an oversized serialized
Host prompt cancel the otherwise submit-capable OPEN planning session. Offline
regression fixtures exercise mismatched cwd, denied and throwing grants, and
escaped source text that exceeds the Host prompt limit without running a model.
This is a trusted-adapter integrity fix, not native Host Live proof, public
Operator authentication, or Objective E2E acceptance. The new head requires
its own Windows/Linux CI; previous green results cannot cover this change.

## Bootstrap Local verification grant freshness (offline CI required)

The trusted NEW_PROJECT/EXISTING_LOCAL facade now binds its independent Local
verification review to the current Bootstrap task revision, Workflow hash,
repository root, exact executable/arguments and recorded file digests.
After an asynchronous grant it reads the current task/Workflow again and
repeats the existing read-only command/tree preview before invoking the Local
backend. A task revision change with identical source bytes or a mutated
command during review cannot consume the earlier grant. Negative offline tests
exercise both stale-review cases without running any verification subprocess.
This remains supervised, UNPROTECTED Local verification behind a trusted
embedding, not a public Operator authorization, atomic filesystem confinement,
Host Live proof, or Objective acceptance. This head needs fresh Windows/Linux
GitHub Actions evidence before any PASS claim.

## Host Planning Contract/DAG review via existing Objective CLI (CI pending)

The existing `codefleet-alpha objective` command now exposes
`review-codex-plan <planning-session-id>`. It opens the existing Store
**read-only** and reuses the same strict persisted Codex Host Planning
validation as the trusted Workflow preparer. The response contains only
the pinned user Objective, source baseline, repo identity hash, Contract
scope, WorkItem dependencies/criteria, budget/time limits, and immutable
Workflow/source hashes. It reports `REVIEW_REQUIRED` (not approved or
executable) for a valid submitted planning session, `BLOCKED` for
tampered/unsubmitted output, or `UNAVAILABLE` when no planning table exists.
It never starts a model, creates a Workflow, migrates State or accepts
approval flags. The public command is a review-only entry point to the
existing trusted `prepareReviewedCodexWorkflow` path; it does not create an
authenticated grant or solve production Host execution admission. Negative
tests cover stale/tampered receipts, disallowed CLI options, read-only database
access and absence of effects. The updated head needs its own Windows/Linux
GitHub Actions result before this regression test may be marked passing.

## Immutable Bootstrap destination during supervised Fileset materialization (new CI pending)

The trusted NEW_PROJECT/EXISTING_LOCAL materialization facade now includes the
immutable source Plan artifact reference in its exact owner review scope and
rechecks both that reference and the destination repository root after the
asynchronous grant. A task Plan pointer or repository substitution with an
unchanged task revision, Workflow hash and Fileset hash cannot consume the old
grant. An offline positive Fileset materialization fixture and an adversarial
Plan substitution test cover this trusted entry; no Host model, PROTECTED
verification or final Objective acceptance is claimed. Windows/Linux CI for
this new commit must be evaluated independently.

## Immutable Bootstrap Local verification review scope (new CI pending)

The trusted Bootstrap Local verification facade now includes the immutable Plan
and Workflow artifact references in its exact grant scope, and rechecks both
after asynchronous owner review. A swapped Plan pointer with unchanged revision,
repository root, Workflow hash, command and tree digests cannot consume the
old grant. The criterion file-digest snapshot is frozen before it is shared
with the grant callback to prevent accidental scope mutation. Offline regression
checks assert a substituted Plan is rejected before backend authorization.
This does not authenticate callers, provide OS confinement, verify a live Codex
Turn or accept the final Objective. Fresh Windows/Linux CI is required.

## Managed Host Workflow approval rotation fence (new offline CI required)

The trusted `runExistingWorkflow` execution scope now pins a hash of the exact
current Workflow approval record (actor, workflow digest and expiry) or the
already-required protected Operator binding. After asynchronous embedding-owned
authorization, it re-reads this fingerprint before dispatching Controller/Host
work. A replacement approval for the same revision/Workflow cannot silently
reuse an earlier Host execution grant. Negative offline tests exercise actor
replacement and expiry extension without launching a Host. This does not supply
public Operator authentication or Host Live acceptance. This head needs its
own Windows/Linux CI evidence.

## Exact Codex Contract/DAG reviewer scope (fresh CI required)

The trusted persisted Host Planning-to-Workflow bridge now presents the
independent reviewer with immutable WorkItem dependencies, per-item acceptance
criteria, final mandatory verification criterion, source context and bounded
attempt/time/cost limits rather than only opaque hashes and flat file lists.
Review denial still creates no Workflow or authorization. A regression test
checks frozen nested scopes and zero creation effects. No public Operator
admission, Host Live Turn or Objective acceptance is implied. This head needs
independent Windows/Linux CI.

## Public planning review shows mandatory final verification (fresh CI required)

The read-only `objective review-codex-plan` result now includes the trusted
independent review scope's WorkItem priorities, DAG edges, per-item acceptance
criteria, source context, required capabilities, delivery mode and explicit final
mandatory acceptance gate. Previously, the public preview only showed a flat
criterion list, hiding the final protected source-contract test requirement from
the Operator. The command still cannot grant approval, start a Host Turn or
change the Store. This is an offline UX/approval-transparency improvement; no
Host Live, protected verification or Objective E2E acceptance is claimed. New
Windows/Linux CI is required before reporting offline PASS.

## Bootstrap Local reviewer receives immutable executable/argv scope (fresh CI required)

The trusted NEW_PROJECT/EXISTING_LOCAL verification approval callback now sees a
frozen exact command specification (canonical executable and bytes hash, argv,
cwd, timeout, candidate tree hash and command hash), not just opaque hashes.
After asynchronous owner review, the facade compares this full snapshot with a
fresh independent command preview before permitting the existing Local verifier.
An offline denial regression checks frozen argument arrays and no backend effect
when a reviewer rejects the inspected command. This is still UNPROTECTED Local
only, not public Operator authentication, Codex Host Live or Objective acceptance.
The changed head requires its own Windows/Linux Actions result.


## Trusted Host execution grant inspects pinned DAG and source (fresh CI required)

Before the existing Controller starts a bounded Codex Host Workflow, the trusted
facade now validates the persisted Workflow graph and original source-contract
artifact against their content hashes and the existing Workflow validator.
Independent owner review sees immutable actual WorkItem edges, files, tests,
acceptance criteria, required capabilities and limits, rather than approving
only an opaque Workflow digest. The graph/source are revalidated after the
asynchronous reviewer callback, before dispatch. Negative offline regressions
cover tampered in-memory persisted source/DAG and grant-time changes that must
not reach Controller or Host. This does not authenticate a public Operator,
run a real Codex Turn or establish protected Objective acceptance. The new head
requires Windows/Linux CI before any offline PASS claim.

## Host planning cwd alias drift during owner review and Turn (fresh CI required)

The managed Codex Planning adapter now pins the canonical repository root before
opening a durable session and rechecks both the source and Host cwd after the
asynchronous owner grant. A replaced directory alias cancels the OPEN session
before a billable Turn. After a dispatched Turn, a changed Host cwd causes
RECONCILING instead of accepting a mismatched planning receipt. Offline tests
exercise both transitions with a repointed local directory link (skipped when
the runner cannot create directory links). This narrows grant-time drift but
is not atomic filesystem confinement or Host Live proof. Windows/Linux CI is
required before marking this change tested.

## Codex workspace Candidate hard-link and ancestor guard (new CI required)

The supervised UNPROTECTED Host workspace-write adapter now rejects hard-linked
Candidate leaves in both its pre-grant and post-Turn byte snapshots, and checks
every directory ancestor for symlinks/Junctions. Previously, an externally
shared hard-linked inode could be accepted as an ordinary scoped file despite
potential effects outside the Candidate, and a linked Windows parent could
redirect the observed root. Offline negative tests cover pre-grant refusal,
post-Turn hard-link substitution, and a linked directory ancestor. This does
not prevent Host-origin external effects, provide OS confinement, prove live
Codex execution, or establish a verified Objective. Windows/Linux CI for this
commit is required before reporting these offline tests as PASS.

## Executable-mode bound Candidate / delivered-tree hashes (fresh CI required)

The shared Candidate tree observer now pins the Git-style executable bit
(100644 vs 100755) alongside each file's bytes. An otherwise identical
delivered file with newly executable permissions cannot retain Objective
COMPLETE. The Local delivery fixture uses the mode-aware hash, and an offline
delivered Objective test checks byte-identical executable-mode drift.
Previously persisted byte-only Candidate hashes are not silently promoted;
they require the current bound verification path. Windows executable-bit
mutation is not claimed to be supported or tested by the POSIX-specific case.
Native Codex Host Live and final independent acceptance remain UNVERIFIED.

## Submitted Codex planning discovery bound to original review scope (fresh CI required)

The existing read-only `objective review-codex-plan` and trusted
`prepareReviewedCodexWorkflow` bridge now reject a submitted Host Planning
result whose repository-discovery snapshot differs from the original pinned
request. This includes repository identity and clean/dirty source metadata,
even if the stored result digest has been recomputed. The same validator is
used before the public review displays a reviewable DAG and before the
independent owner callback can create an unapproved Workflow. Offline negative
regressions cover repository-identity and dirty-status substitution with no
Workflow or Attempt created. This is a bounded handoff integrity fix, not
public Operator authentication, Host Live acceptance or Objective completion.
The new commit requires its own Windows/Linux GitHub Actions results.

## Offline reviewed-Goal-to-Host admission integration (new CI required)

A real SQLite Store/repository integration test now joins the public read-only
pinned Codex planning preview, trusted independent planning review, creation
of a still-unapproved Workflow, explicit existing Local Workflow approval, and
a separately denied managed-Host execution grant. It asserts that neither an
unapproved Workflow nor a merely approved Workflow reserves an Attempt, runs
a Host Turn, produces a delivery, or claims Objective completion. This is
an authorization-boundary integration fixture only: the Local actor is not
OS-authenticated, the Host transport and verifier are fake, and no Host Live
or final Objective acceptance occurred. The new commit requires its own
Windows/Linux GitHub Actions result before claiming the test passed.

## Managed Host independent verifier method pinning (fresh CI required)

The trusted `runExistingWorkflow` entry now snapshots its injected verifier
`prepare`, `verify` and `cleanup` functions before asynchronous owner
execution review. A changed verifier implementation after review begins is
refused before Controller reservation or Host dispatch. The Controller receives
stable bound copies of the original methods, not mutable method slots on the
embedding object. A negative test simulates replacement of each method during
review without ever invoking the verifier or Host. This is a pre-dispatch
method-identity fence, not authentication of the embedding, attestation of a
protected backend, or protection from internal backend state mutation and
OS-level races. Native Codex Host Live and independent Objective acceptance
remain UNVERIFIED. This head needs its own Windows/Linux CI result.

## Validated Codex Goal through approved synthetic Host delivery (new CI required)

An offline integration fixture now starts with persisted VALIDATED Codex Host
Planning, applies independent Contract/DAG review, creates a pending Workflow,
records a separate explicit Local Workflow approval and requires a managed-Host
execution grant. It then reuses the real Controller, Candidate, local delivery,
criterion Evidence and read-only delivered Objective Judge with an injected
**fake** Codex Host transport and **fake** verifier. It checks that no Host
Turn occurs before approval, the final Objective stays `UNPROTECTED`, and
post-delivery source drift revokes the previously complete read-only status.
This is a synthetic cross-module regression, **not** native Codex Host Live,
OS-authenticated Operator admission, protected verification or final real
project acceptance. This new commit requires its own Windows/Linux CI run.

## Managed Host delivery authority method pinning (fresh CI required)

The trusted managed Workflow execution grant now snapshots both the exact
Local delivery owner-authorization callback and the independent delivered-tree
verifier callback before asynchronous Host admission review. Replacing either
callback during review blocks Controller reservation and Host dispatch. After
review, the Controller receives only wrappers bound to the originally reviewed
callback references, alongside the immutable criterion snapshot. Offline
regressions cover both callback replacements with zero delivery effects. This
does not authenticate the embedding, attest the verifier's internals or provide
OS isolation; native Codex Host Live and final Objective acceptance remain
UNVERIFIED. Windows/Linux CI for this new head must be evaluated separately.

## Managed Host unknown-cost authority frozen across execution review (fresh CI required)

The trusted managed-Host Workflow review now explicitly displays whether
continuation after unpriced Codex subscription usage needs an independent
exact owner grant or is blocked by default. The separate unknown-cost grant
callback is pinned before asynchronous Workflow review, checked again before
Controller entry and passed to the existing Controller as a bound function.
Replacing its method during review cannot silently authorize another billable
WorkItem. Two offline negative/readability regressions cover both the swapped
callback and default-denied review scope. This does **not** authorize a budget,
measure subscription cost, authenticate a public Operator or verify Host Live.
The new head needs its own Windows/Linux CI before claiming offline PASS.


## Explicit public Codex plan → pending Workflow transition (new CI required)

The existing Objective CLI now accepts `prepare-codex-workflow <session-id>
--repository ABSOLUTE_PATH --hash <workflowHash> --source-hash <sourceContractHash>`.
A user first inspects `review-codex-plan --repository ...`, then confirms both
immutable Contract and source hashes. The command reuses the persisted planning
validator, independent exact-scope review callback and pinned clean repository
checks before creating a deterministic, idempotent **WAITING_APPROVAL** Workflow.
It never starts Codex, approves the Workflow, grants budget/Host execution,
or touches repository source files. This Local CLI hash confirmation is **not**
authenticated Operator admission; the existing approval and trusted managed-Host
execution authority remain separate. Offline positive, idempotence, altered
hash, prohibited execution-flag and dirty-checkout tests were authored. The new
commit requires its own Windows/Linux CI; native Codex Host Live and final
independent Objective acceptance remain UNVERIFIED.

## Authenticated embedding gate for reviewed Codex Workflow execution (fresh CI required)

The Objective command dispatcher now routes `run-codex-workflow` and
`resume-codex-workflow` only through an embedding-injected authenticated
Operator admission function and a genuine `createCodexMvpFacade` instance.
The request is bound to the exact Workflow hash, revision, source/graph refs,
repository and baseline; asynchronous authorization must preserve this scope.
The facade then independently requires the existing persisted Workflow approval,
Host executable identity, bounded budget/Lease and exact managed Host execution
grant before entering the Controller. The plain public CLI explicitly fails
closed **before Store open** because no authenticated Host binding is installed.
Only the trusted in-process dispatcher can supply this dependency; CLI flags,
actor names and JSON cannot do so. Negative offline tests cover missing or fake
admission, no Workflow approval, denied Host grant, authentication denial and
scope rotation without starting a Host Turn. This is an integration seam, **not**
a deployed Operator authentication provider or a generally usable public Host
command. Native Codex Host Live, protected execution and final Objective
acceptance remain UNVERIFIED. The new head needs its own Windows/Linux CI.


## Authenticated Codex entry Store binding (fresh CI required)

A genuine trusted Codex MVP facade is now bound to its original Store object.
The authenticated `run-codex-workflow` / `resume-codex-workflow` dispatcher
rejects facades from another Store before consulting Operator authorization,
even if another handle points to the same SQLite database. This prevents
reviewing one Workflow connection and dispatching a different one through a
legitimate but mismatched facade. Offline denial tests cover cross-database and
same-database/different-handle mismatches with no Host admission or Attempt.
This is **not** an Operator authentication provider, Host Live verification,
protected execution or Objective acceptance. Windows/Linux CI for this new
head must be evaluated independently.


## Windows CI: close secondary SQLite connections before fixture teardown (fresh CI required)

The authenticated Codex Store-identity regression now closes both deliberately opened
secondary Store handles in a `finally` block **before** the shared fixture deletes
its temporary SQLite database. On the previous head `c27b2699`, Linux CI passed,
but Windows CI failed with `EBUSY` unlinking `state.sqlite`: the secondary close
hooks ran after the fixture cleanup hook. This is test resource-lifetime repair,
not an Operator authentication implementation or Host Live verification. The new
head requires independent Windows/Linux CI results before claiming this fix passed.


## Authenticated Codex entry pins the existing Workflow approval (fresh CI required)

The trusted `run-codex-workflow` / `resume-codex-workflow` dispatcher now
requires the existing Workflow approval **before** Operator admission and binds
the exact approval identity (digest, actor and expiry, or existing protected
Operator marker) into the immutable authenticated review scope. After an
asynchronous Operator review it checks the same current approval snapshot
before calling the managed facade; rotated actors or extended expiry cannot
reuse the earlier Operator grant. An offline negative regression covers both
mutations with zero Host grant and zero Attempt. This is **not** a deployed
Operator authentication provider, nor Host Live, protected verification or
Objective acceptance. Windows/Linux CI for this new head is still required.

## CI regression repair: scope-change fixture requires initial Workflow approval (fresh CI required)

On `aab3191566667781f3fd8b5d393918cb6e4a354d`, both Windows and Linux
GitHub Actions failed one of 235 offline Codex MVP tests. The existing
`resume-codex-workflow` entry correctly rejected the scope-mutation fixture
*before* authenticated Operator review because it had no Workflow approval;
the fixture incorrectly expected a later authenticated-scope-change rejection.
The regression fixture now creates a bounded explicit Local Workflow approval
before Operator review, verifies that the Operator callback was actually
entered once, and still changes the persisted Workflow revision during that
review to assert rejection before Host grant or any Attempt. The product
admission and approval rules remain unchanged. These are authored offline
test corrections only; the new head requires its own Windows/Linux CI and
native Host Live/final independent Objective acceptance remain UNVERIFIED.

## Authenticated Operator reviews the exact validated Contract/DAG (fresh CI required)

The trusted `run-codex-workflow` and `resume-codex-workflow` entry now
validates the stored source artifact and Workflow DAG against their pinned
hashes and the existing Workflow validator **before** authenticated Operator
review. The Operator receives deeply frozen copies of the actual source
contract and Workflow graph, including WorkItems, dependencies, criteria and
limits, rather than only opaque hashes. After asynchronous admission, both
artifacts are validated again; a changed DAG cannot inherit the earlier review.
Offline tests cover immutable reviewer scope, stale source pointers, altered
DAGs and same-hash mutation during review with no Host grant or Attempt.
This enables inspectable admission by a future trusted provider but **does
not deploy Operator authentication**, authorize model calls or establish native
Host Live or final Objective acceptance. New Windows/Linux CI is required.

## Read-only post-planning Codex Workflow review (fresh CI required)

The existing Objective CLI now exposes `review-codex-workflow <workflow-id>`.
After explicit plan-to-Workflow promotion, it opens the Store read-only and
shows the current validated Contract/DAG, immutable source/initial Planning
lineage, bounded limits, WorkItems, mandatory criteria and current Workflow
approval validity. Missing/expired approval is reported separately from a
tampered or unrelated Workflow. Even a currently approved Local Workflow
remains `executionGranted:false`: the ordinary public CLI still cannot
supply authenticated Operator admission or a managed Codex Host grant.
Negative offline fixtures reject changed source/DAG, repository identity,
initial graph provenance and execution/approval flags without reserving an
Attempt or starting a Host. This is user-visible review continuity, not
an authenticated Operator provider, Host Live proof or Objective acceptance.
The new head requires its own Windows/Linux CI results.


## Read-only Codex Workflow source freshness review (fresh CI required)

The public `objective review-codex-workflow <id> --repository ABSOLUTE_PATH`
now optionally reobserves the canonical repository identity, clean working tree
and exact pinned Git baseline, reusing the existing Planning source freshness
check. It reports `PINNED_CLEAN_AT_REVIEW` only for the original checkout
without drift; a dirty tree, a second clean clone with the same HEAD, or a new
commit returns `BLOCKED` / `STALE_OR_MISMATCHED` without presenting stale
Contract/DAG approval readiness. Without `--repository`, the read-only display
explicitly says `NOT_RECHECKED`. Offline regressions were authored for all
three negative cases and a clean positive case. This is a point-in-time
read-only UX boundary, **not** a Host execution grant, OS-authenticated Operator,
Host Live verification, or final Objective acceptance. This head requires its
own Windows/Linux CI result.

## Authenticated Codex execution requires persisted Planning provenance (fresh CI required)

The authenticated `run-codex-workflow` / `resume-codex-workflow` entry now
requires the existing read-only reviewed-Workflow projection to validate the
original submitted VALIDATED Host Planning result, immutable first DAG revision,
source artifact, repository identity and current Contract/DAG before requesting
Operator authentication. It pins the planning-review digest in the immutable
Operator scope and revalidates it after asynchronous authentication, so a
replaced planning record or first graph revision cannot be silently executed
under a prior Operator decision. Offline denial coverage checks both pre-grant
and grant-time provenance mutation, with no Host review or Attempt creation.
This is not an authenticated Operator provider, Codex Host Live proof,
PROTECTED verification or independently accepted Objective. Its new HEAD
requires separate Windows/Linux CI results.

## CI regression repair: authenticated provenance gate changes rejection precedence (fresh CI required)

The previous commit `0155ad50a99148b2468ee5c43797b77a2b4a01d2`
failed `npm run test:codex-mvp` on both Linux (239/240 passed)
and Windows (235/240 passed; four skipped). The negative fixture
`authenticated Codex Operator review fails closed on changed source and DAG artifacts`
still expected the former Contract/DAG artifact-validation error after
the new originating Planning provenance gate began rejecting the same
tampering **before** Operator admission. After asynchronous Operator
review, the same invalidating DAG mutation is also rejected by the
pinned Planning provenance recheck, before Host grant or Attempt creation.

The fixture now expects those two explicit fail-closed provenance error
messages without changing execution logic, approvals, or test assertions
that Operator/Host callbacks and Attempt reservation are not reached
when forbidden. This is an offline test expectation repair, not proof
of Host Live, a public authentication provider, PROTECTED execution or
Objective acceptance. The new commit requires its own Windows/Linux CI.

## Original reviewed Codex DAG lineage cannot be rewritten (fresh CI required)

The read-only `review-codex-workflow` and authenticated managed-Host
admission now compare the complete persisted revision-1 DAG with the original
VALIDATED Host Planning DAG, not merely the revision row's digest and the
body's self-declared workflowHash. Rewriting a mandatory WorkItem criterion,
dependency or file scope in the historical graph body blocks read-only review,
and a rewrite during asynchronous Operator admission blocks before Host grant
or Attempt reservation. An offline regression covers both entry-time and
admission-time mutation and verifies zero Host grants/Attempts. This prevents
a history/provenance integrity bypass; it does **not** authenticate an
Operator, grant a Host, prove native Codex Live or accept an Objective.
Windows/Linux CI for this change must be checked on its own commit.


## Active Codex Workflow revision row is required for review and Operator admission (fresh CI required)

A valid first Planning DAG is not sufficient to authorize a subsequently revised
Workflow. The public read-only `review-codex-workflow` projection now checks
that the **current** Workflow DAG has a matching persisted `graph_revisions`
row for its exact revision, including digest, complete body and
`workflowVersion`. A missing row, stale digest or rewritten current body
returns BLOCKED, and the authenticated Codex CLI reuses this check before any
Operator or managed-Host grant. An offline regression starts with a legitimate
revision-2 Workflow, checks its normal pending/approved review state, and then
rejects missing/mismatched revision rows without Host grants or Attempts.
This does not authenticate an Operator, grant execution, prove native Codex
Host Live or independently accept an Objective. Fresh Windows/Linux CI must
be checked for this commit.

## CI regression repair: invalid JS regexp in active DAG revision fixture (fresh CI required)

The prior head `2b321dc97c954af087dca8759ff172430a2fc264` failed the same `npm run test:codex-mvp` step on
Windows and Linux before loading `test/codex-reviewed-workflow.test.mjs`:
Node reported `SyntaxError: Invalid regular expression flags` at line 1084.
The new active-revision negative fixture accidentally double-escaped the
slash delimiters in the expected originating Planning/Contract/DAG error.
The assertion now uses valid JavaScript regex escaping and still expects the
same fail-closed admission error for missing/mismatched current revision rows.
No product admission or execution logic changed. A local Node 22 syntax
and sample-match smoke check covered the corrected regex expression only;
the complete source test and full Windows/Linux CI remain unverified until
this new commit's own results are available. No Codex Host Live or independent
Objective acceptance was performed.

## Read-only delivered Objective status invalidates concurrent Store changes (fresh CI required)

The delivered Objective projection now pins the persisted Workflow and final
Candidate/Attempt records before its asynchronous destination-tree observation.
Immediately after the observation it re-reads both Store records and refuses
a previously COMPLETE verdict if either record changed, disappeared or became
unreadable during the filesystem await. Negative offline regressions cover
revision, cancellation/reconciliation state, decision/approval reference changes,
Candidate hash rotation and a failed final-record read. Existing stable-record
and target-drift checks remain unchanged. This narrows a read-only stale-report
race; it does not make filesystem reads atomic, attest Host execution, authorize
delivery or constitute independent Host Live acceptance. The prior
`38da77aefd256c225f6aabb069d07f779b54db95` CI passed Windows and Linux;
the new head requires its own CI result.

## Read-only Objective status revalidates delivery and decision artifacts after observation (fresh CI required)

A persisted Workflow and final Candidate can remain unchanged while a separate
writer replaces or damages the content-addressed delivery receipt, pre-effect
intent, approved/mandatory criterion snapshots or Objective decision during
the asynchronous destination-tree observation. The read-only status projection
now pins each loaded artifact and re-reads its exact reference before reporting
a formerly COMPLETE Objective. Changed or unreadable records fail closed as
BLOCKED, even when the delivered file bytes still match. Offline negative
regressions cover all five artifact types and a failed post-observation read.
The persistent artifact reader already verifies SHA-256; this addition closes
the pre-read/post-await stale snapshot gap, not concurrent filesystem races,
Host Live authorization, protected execution or final Objective acceptance.
This commit requires its own Windows/Linux CI results.

## Managed Host Repair authority and generation limit pinned across review (fresh CI required)

The trusted Workflow execution grant now discloses whether bounded Repair is
available, its immutable generation ceiling and whether opt-in Repair storage is
enabled. The embedding's separate failure-Evidence-bound Repair callback and
generation/storage settings are snapshotted before asynchronous owner review.
Changing any of them during review blocks Controller entry; the Controller
receives only the originally reviewed values and a bound callback. Invalid
generation settings outside the existing 2..5 range are rejected before review.
Offline regressions cover switched authorization, expanded generations, changed
storage policy and explicit Repair-disabled review. This does not grant Repair,
authenticate a deployed Operator, run native Codex Host Live or independently
accept an Objective. The new head requires its own Windows/Linux CI results.

## Authenticated Codex admission rechecks current repository before and after review (fresh CI required)

The public `run-codex-workflow` / `resume-codex-workflow` trusted-injection
boundary now reuses the existing read-only reviewed-Workflow source check on the
actual repository **before** consuming authenticated Operator approval and
**after** the asynchronous callback, immediately before managed Host admission.
A dirty tree, different canonical repository or a clean but changed Git HEAD
cannot reuse the reviewed Planning/Workflow grant. Offline negative fixtures
cover dirty source before review, dirty source introduced during review, and a
new clean HEAD committed during review; each must stop without an Operator/Host
review where appropriate or an Attempt. The source check is read-only and does
not alter the user's working tree. This reduces stale-grant risk, but does not
provide atomic filesystem confinement, implement an Operator authentication
provider, invoke actual Codex Host Live or independently accept an Objective.
The new head requires its **own** Windows/Linux CI result before claiming PASS.

## Managed Workflow owner review pins optional WorkItem policy (fresh CI required)

The trusted Codex Workflow execution facade now includes the full detached,
deeply immutable optional WorkItem policy in the owner-reviewed Host scope.
It snapshots the policy before asynchronous Workflow authorization, rejects a
changed original policy after the grant, and passes only the reviewed detached
rules to the existing Controller's per-WorkItem capability gate. An offline
negative regression checks nested scope immutability and policy relaxation
during owner review without entering Controller dispatch. This does not
authenticate a deployed Operator, enable unsupported capabilities, prove
Codex Host Live or accept an Objective. Its new Windows/Linux CI results
must be inspected independently.

## Trusted product CLI admission factory for Codex Workflow (fresh CI required)

A trusted Host embedding may now invoke the existing `productCli` wrapper with
an in-process `createCodexAdmission(store)` factory. The factory receives the
exact command-owned Store handle and must supply an authenticated Operator
callback plus a genuine `createCodexMvpFacade` bound to that same Store.
This connects the real CLI command dispatcher to the previously implemented
managed-Host integration without requiring the embedding to manually open and
close a matching Store. Malformed Workflow/hash/flag requests are refused
before invoking the privileged factory; the command closes the Store on both
authorization rejection and success. The ordinary `codefleet-alpha objective`
process supplies **no** factory and still blocks Host execution before Store
open. Existing independent Workflow approval, Operator admission, Controller,
Lease, budget and exact Host grants remain mandatory. Offline regression
fixtures exercise malformed options, missing Workflow approval, denied
Operator admission for run/resume, and forged facade rejection, without
launching a Host or recording any Attempt. This is a trusted injection
**integration seam**, not an OS-authenticated Operator implementation,
public Host execution permission, native Codex Host Live verification or
Objective acceptance. Fresh Windows/Linux CI is required for this commit.

## Trusted Codex natural-language Goal CLI planning entry (fresh CI required)

The trusted `productCli` Host embedding now accepts `plan-codex-goal "Goal"
--repository ABSOLUTE_PATH` using the same Store-bound genuine Codex facade
factory as reviewed Workflow execution. It routes directly to the existing
read-only managed Codex planning Turn and its independent exact-scope
`authorizePlanning` gate, preserving the pinned Git discovery, unknown-cost
notice, durable session and cited Draft validation. Malformed Goal/repository
or execution flags stop before invoking any privileged factory; ordinary CLI
calls still fail closed before Store open. Offline regression coverage exercises
a synthetic validated Host planning receipt, denied grants, fake facade and
unsupported flags. No Workflow approval, Host execution or Objective COMPLETE is
automatically granted. The synthetic transport is **not** native Codex Live;
actual Operator authentication, supported Host Live and independent final
acceptance remain UNVERIFIED. This new head needs separate Windows/Linux CI.

## CI repair: planning-only CLI fixtures do not initialize Workflow Attempt table (fresh CI required)

The previous head `16c4a2bce499a52f1096c1c765c2f74321bfe43a` failed `npm run test:codex-mvp` on both
Windows and Linux (two new offline CLI fixtures each) with SQLite
`no such table: workflow_attempts`. A successful or denied managed Planning
Turn need not create a Workflow, and this Store lazily initializes the optional
Workflow Attempt table only when the Workflow path uses it. The new tests
incorrectly queried that absent optional table as though it were always present.
The two fixtures now count Attempts as zero if the optional table is absent,
and still query/count rows if it exists. The denied-path fixture also asserts
that no Workflow run was created. This changes **test assertions only**, not
Planning approval, Host dispatch, persistence or schema migration. A local
Node 22 SQLite smoke check covered absent, empty and populated optional-table
states; the complete Codex MVP suite was not run locally. Fresh Windows/Linux
CI must be checked for this new commit. Native Codex Host Live, authenticated
Operator admission and final independent Objective acceptance remain UNVERIFIED.

## Trusted CLI NEW_PROJECT Fileset proposal bridge (fresh CI required)

The trusted `productCli` Host embedding now supports
`propose-codex-bootstrap-files <task-id> <local-edit-item-id>` against a
validated NEW_PROJECT Bootstrap task. It reuses the existing Store-bound Codex
facade and the independent exact `authorizeBootstrap` owner grant, durable
Host intent, revision/WorkItem validation and no-replay semantics. The command
submits an unapproved Fileset proposal only; the separate exact Fileset approval
and materialization/verification decisions remain mandatory. Invalid flags
and a missing/forged trusted facade are rejected before any privileged Host
factory or model Turn, and the ordinary CLI stays blocked. Offline synthetic
tests cover successful proposal-without-writes and malformed, forged or
denied admission. This is not authenticated public Host execution, a live Codex
Turn, protected verification or Objective acceptance. Its new Windows/Linux CI
must be checked before reporting offline PASS.


## Trusted CLI applies separately approved NEW_PROJECT Fileset (fresh CI required)

The trusted `productCli` embedding now exposes
`materialize-codex-bootstrap-files <task-id> <local-edit-item-id>`.
Only a genuine Store-bound Codex MVP facade can invoke the existing
`materializeApprovedBootstrap` path. The facade requires its separate
owner-reviewed exact file contents and the underlying Bootstrap Controller
still enforces the already-approved Fileset, Workflow, dependencies, hashes
and destination drift before file creation. Ordinary CLI invocation, injected
forged objects and execution/approval flags fail closed before an effect.
Synthetic regression fixtures cover exact approved file creation and denial
without writes. This is Local `UNPROTECTED` materialization, not an
Operator authentication provider, a Codex Host Live demonstration or
independently accepted Objective. The new HEAD requires its own Windows/Linux
CI results before offline PASS can be claimed.

## Trusted CLI NEW_PROJECT approved Local verification bridge (fresh CI required)

The Store-bound trusted `productCli` now exposes
`verify-codex-bootstrap <task-id> <local-verification-item-id> REQUEST.json`.
The request file is untrusted command input, never proof of approval. Only an
authentic Codex MVP facade for that exact Store may call the existing
`verifyApprovedBootstrap` path, which independently previews executable,
arguments, repository bytes and tree, requests an exact trusted owner grant,
rechecks task revision and command hash, and delegates Local execution and
Evidence recording to the existing Bootstrap Controller. Invalid CLI flags,
missing trust binding, forged facades and denied grants are rejected before any
verification subprocess. Offline synthetic regressions cover the actual
disposable local test runner and negative admission cases. A successful check
remains `LOCAL_EXECUTED` / `UNPROTECTED` with Objective `complete:false` and
Host Live `UNVERIFIED`; it is not Protected verification, authenticated public
Operator admission or independent Objective acceptance. This new commit needs
its own Windows/Linux CI results before calling offline tests passing.

## Trusted CLI NEW_PROJECT failure-Evidence Repair Fileset proposal (fresh CI required)

The trusted Store-bound `productCli` now exposes
`propose-codex-bootstrap-repair <task-id> <local-edit-item-id> <failed-verification-item-id>`.
It reuses the existing `proposeBootstrapRepairFiles` facade and Bootstrap
failure-Evidence-aware Host proposal path: only current dependent
`LOCAL_FAILED` verification Evidence and the recorded materialized source
hashes can be used to request an exact separately approved modification
Fileset. An owner grant still gates the managed Host Turn, and the returned
Fileset is `WAITING_APPROVAL` without modifying any destination file.
Ordinary CLI calls, forged facades, malformed flags, missing failure Evidence
and denied owner grants fail closed. Offline synthetic CLI regression tests
exercise both the proposed repair and those refusal paths. Actual Fileset
approval, materialization and Local re-verification remain separate actions;
this is not autonomous Host Live Repair, Operator authentication, protected
execution or Objective acceptance. This head requires its own Windows/Linux
CI before any offline PASS claim.

## Trusted CLI NEW_PROJECT Repair apply-to-reverification integration (fresh CI required)

A disposable synthetic integration fixture now exercises the trusted CLI across
separately opened SQLite Stores: an actual Local verification produces current
`LOCAL_FAILED` Evidence; the fake Codex Host proposes a failure-bound Repair;
an unapproved Fileset cannot modify bytes; explicit exact Fileset approval
permits the existing Bootstrap Controller to apply only the reviewed source
change; and a new independently approved Local verification records
`LOCAL_PASSED` Evidence. The stale failure Evidence is not reused and the
Objective remains incomplete, `UNPROTECTED`, and Host Live `UNVERIFIED`.
This adds an offline CLI integration test only, not a real Codex Turn, an
Operator authenticator, automatic approval, or final Objective acceptance.
The new head requires its own Windows/Linux CI result.

## NEW_PROJECT Local verification JSON preflight before trusted admission (fresh CI required)

The Store-bound `verify-codex-bootstrap` CLI now parses and enforces the existing
220 KB limit on untrusted `REQUEST.json` **before** opening SQLite or invoking
the privileged `createCodexAdmission` factory. The validated JSON value is
passed to the existing independent exact-command owner review as the same
snapshot, avoiding a second filesystem read and request-file replacement gap.
Direct trusted `dispatchProduct` callers retain their own bounded JSON read.
Offline negative fixtures cover malformed and oversized JSON, zero privileged
factory calls and zero verification Evidence; existing successful/denied Local
verification fixtures cover the unchanged owner grant and Controller.
This is input preflight, **not** authentication of the embedding, Host Live
execution, PROTECTED verification or Objective acceptance. Its new Windows/Linux
CI must be inspected separately before claiming tests PASS.

## Bootstrap verification request shape preflight (new CI required)

The trusted `verify-codex-bootstrap` CLI now rejects JSON values that are not an
exact bounded native Local verification command **before** SQLite Store creation
or privileged Host admission factory construction. A valid JSON scalar, array,
extra authority field, non-array arguments, NUL argument, relative executable
or out-of-range timeout cannot consume a trusted factory/owner review. The same
pure input check also applies to directly injected trusted dispatch requests.
The existing Bootstrap Controller remains responsible for executable/tree
observation, task freshness, independent owner authorization and UNPROTECTED
Local Evidence. A negative offline regression exercises eight malformed
command shapes without Host admission or verification effects. This is not
public Operator authentication, OS confinement, native Codex Host Live proof
or Objective acceptance. Fresh Windows/Linux CI is required for this head.

## Bootstrap verification NUL and script-wrapper preflight correction (new CI required)

The previous preflight checked a literal backslash-zero sequence rather than
an actual NUL character in the Local verification request arguments. Its
script-wrapper expression also failed to recognize ordinary `.cmd`, `.bat`,
or `.ps1` executable suffixes reliably. The preflight now rejects actual NUL
characters in executable, directory and argument strings and disallows
case-insensitive script-wrapper suffixes before Store creation or privileged
Host admission; the existing conservative literal backslash-zero argument
refusal is preserved. Cross-platform synthetic negative fixtures exercise
real NUL characters and all three wrapper suffixes while asserting no Host
factory or verification Evidence is reached. This repairs an input-validation
boundary, not Operator authentication, OS confinement, Host Live verification
or Objective acceptance. Windows/Linux CI for this head must be checked.

## Trusted NEW_PROJECT Local verification path bounds (fresh CI required)

The `verify-codex-bootstrap` REQUEST.json preflight now requires an **absolute**
verification directory and bounds both the executable and directory path strings
to 4096 characters before opening a SQLite Store or calling the privileged
Host admission factory. Previously a relative directory or arbitrarily long
path could reach the trusted factory even though the downstream Controller
would reject a nonmatching repository root or an invalid native command.
The Controller retains independent canonical repository-root, exact command,
owner-grant, revision and Evidence enforcement. Offline negative fixtures cover
relative directories and oversized paths with zero factory calls and no
verification Evidence. This preflight is not filesystem confinement, public
Operator authentication, Host Live execution or Objective acceptance. The
previous `5c20d8a9` Windows/Linux CI succeeded; this new head needs its own
Windows/Linux CI before reporting PASS.

## Bootstrap Local verifier method-rotation fence (fresh CI required)

The NEW_PROJECT/EXISTING_LOCAL trusted `verifyApprovedBootstrap` bridge now pins
an injected Local verification backend's `authorize` and `verify` methods
before asynchronous command preview and independent owner review. It refuses
method-slot rotation before submitting any Local subprocess, and passes
receiver-bound wrappers for the originally reviewed methods to the existing
Bootstrap Controller. An incomplete injected backend fails during facade
construction. Offline negative regressions rotate each method during owner
review and assert no backend call or verification Evidence is recorded. This
does **not** attest backend internals, create an OS-authenticated Operator,
make Local verification PROTECTED, prove Codex Host Live, or accept an Objective.
New Windows/Linux CI is required for this head.

## CI repair: Bootstrap Local verifier fixtures must implement the full interface (fresh CI required)

The prior head `3541c4384b94db0ec99d37934e03330d260c7513` failed `npm run test:codex-mvp` on **both Windows and Linux**: four existing negative Bootstrap Local verification tests provided only `authorize` as an injected backend. The new fail-closed facade constructor correctly requires **both** `authorize` and `verify`, so those fixtures failed during construction before reaching the intended revision, Plan, command immutability and owner-denial assertions.

The four fake backends now explicitly implement `verify` as a throwing, call-counted forbidden operation alongside the already-throwing `authorize`. An additional constructor-negative regression asserts that an incomplete Local verifier is still rejected; the production interface check and exact owner approval remain unchanged. No real Host, user repository, credential, PROTECTED backend or Objective completion is exercised. This commit requires fresh Windows/Linux CI before these regression tests may be called passing.

## Trusted NEW_PROJECT persisted single-step Codex continuation (fresh CI required)

The trusted Objective CLI now exposes `advance-codex-bootstrap <task-id>` for
one **NEW_PROJECT** continuation step selected from the existing persisted
`taskReport().continuation` projection. A ready Local Fileset WorkItem may
request an independently authorized Codex Host proposal; an already-approved
Fileset may be materialized through the existing separately reviewed Bootstrap
Controller. Each invocation performs **at most one** step. Pending Fileset
approval, Local verification, Repair, drift and uncertain effects return an
explicit human handoff rather than silently granting, retrying or skipping an
action. Ordinary CLI calls and forged facade instances remain blocked.
Synthetic cross-Store tests cover propose → approval wait → approved apply →
Local verification wait and denial cases. This is not a new scheduler, not a
deployed Operator authenticator, not Host Live proof and not Objective
acceptance. Fresh Windows/Linux CI is required for this commit.


## NEW_PROJECT continuation CI failure — exact failure capture (fresh CI required)

The prior head `6cc16d0f1a3f0cbcbe7ee876aec41afb44e06798` failed the same
`npm run test:codex-mvp` step on Windows and Linux: the new cross-Store
continuation fixture received exit code 1 instead of the required human-handoff
exit code 2 after successful approved Fileset materialization. The failure was
previously reported only as `1 !== 2`, which does not identify whether the
persisted continuation, re-opened Store or CLI admission path failed.

The fixture now checks the already returned post-materialization continuation
and includes the complete later CLI error/status in its failure assertion. This
is a diagnostic regression increment, **not a verified product bug fix**. The
next action is to inspect this commit's own Windows/Linux CI logs and fix the
identified cause without relaxing approval, Lease, Store or Host checks. No
Codex Host Live, actual user source mutation or Objective acceptance occurred.

## NEW_PROJECT Todo → Calendar continuation fixture correction (fresh CI required)

The prior `d7db6739` run failed on Windows and Linux because the continuation
test expected `RUN_LOCAL_VERIFICATION` immediately after Todo materialization.
Its actual persisted DAG is `requirements → todo → calendar → tests`, and the
Controller correctly selected `PROPOSE_FILESET(calendar)` next. The failure
was an incorrect test expectation, not evidence of a Controller scheduling bug.

The offline integration fixture now exercises **both** local-edit WorkItems:
Todo proposal → human approval → materialization; then Calendar proposal →
separate human approval → materialization; only then a Local verification
human handoff. It checks that unapproved Calendar bytes are absent, calls
advance once per step, preserves separate Host/owner grant counts, and never
equates Local readiness with Objective COMPLETE. Existing Store, approval,
budget, Lease, Controller and protected verification behavior is unchanged.
The Host receipt remains synthetic; no actual Codex Host Live or final
Objective acceptance was run. This new head requires its own Windows/Linux
GitHub Actions result before reporting an offline PASS.

## Explicit persisted NEW_PROJECT Repair continuation (fresh CI required)

The trusted `advance-codex-bootstrap <task-id> [--repair-item <local-edit-id>]`
entry now derives the exact repairable ancestor WorkItems and current failed
Local Evidence from the persisted Bootstrap DAG after a Local verification
failure. It reports `AWAIT_REPAIR_SELECTION` and refuses to guess between
Todo and Calendar. Only an explicitly selected current materialized predecessor
can trigger **one** failure-Evidence-bound Host Repair Fileset proposal through
the existing Store-bound facade and independent exact Host owner grant. The
proposal remains `WAITING_APPROVAL`; it cannot write bytes or reuse a prior
Fileset approval. Missing/invalid selections, pre-repair states, and repeated
calls while approval is pending cannot silently start another Turn. An offline
cross-Store CLI fixture checks multiple predecessor choices, denied selection,
separate Repair approval and post-Repair Local re-verification. No real Codex
Host, authenticated public Operator grant, PROTECTED verdict or Objective
completion is established. Fresh Windows/Linux CI is required for this head.

## CI repair: failed Local verification continuation explicitly selects Repair ancestor (fresh CI required)

The preceding head `aef61f97edc11593915b6a41f2c193896d334ff3` ran its
Windows workflow job successfully but failed Linux (`test/bootstrap-verify.test.mjs`)
because an older fixture still expected `HUMAN_HANDOFF` for a failed Local
verification. The new persisted Repair continuation correctly projects
`AWAIT_REPAIR_SELECTION` with the exact current failed Evidence and the
materialized editable ancestors (Todo and Calendar); it does not auto-select
or grant a new Host Turn. The fixture now asserts those candidate IDs, the
failed-Evidence reference, `automaticReplay:false` and
`executionGranted:false`. It continues to require `HUMAN_HANDOFF` on
`INCONCLUSIVE` execution, preserving no-replay recovery behavior. Production
scheduling, approval and verification policy are unchanged. No local Codex Host
Live, user repository mutation, Protected verification or Objective acceptance
was run. The updated head requires its own Windows/Linux GitHub Actions
results before any offline PASS claim.

## Explicit NEW_PROJECT Local verification continuation (fresh CI required)

The trusted `advance-codex-bootstrap <task-id> --verification-request REQUEST.json`
command can now execute the next persisted `AWAIT_LOCAL_TRUST` verification
WorkItem as **one** continuation step. The request file is parsed and shape/bounds
checked before SQLite is opened or a trusted Host factory is constructed. The
same frozen input snapshot is passed through the existing Store-bound Codex MVP
facade, which independently previews current executable, argv and repository
bytes, obtains a separate exact owner approval, checks revision/drift and invokes
the existing Bootstrap Local verifier to record Evidence. Missing input still
produces an explicit human handoff; failed, inconclusive or already completed
checks cannot be silently replayed through continuation. Repair-selection and
verification-request flags are mutually exclusive. Offline synthetic integration
tests cover a passing executable Local check, once-only behavior, bad input
before Host factory and denied owner trust with no Evidence. This extends the
NEW_PROJECT single-step product path without granting a public Operator identity,
protected verification, automatic command approval, native Codex Host Live or
Objective completion. Fresh Windows/Linux CI must be checked for this head.

## Existing-repository persisted continuation and recovery handoff (fresh CI required)

The read-only `objective workflow-progress <workflow-id>` projection now includes
an advisory `continuation` derived from the existing Workflow, latest Repair
generation, live Attempt records, current approval and delivered Objective Judge.
An in-flight Attempt or RECONCILING state takes priority and requests effect/Lease
reconciliation without replay; an unapproved Workflow requests hash-bound
approval, and a COMPLETED Candidate without accepted destination criteria requests
independent Objective Evidence rather than claiming COMPLETE. Failed generations
require separate Repair review; dependency-ready items still need authenticated
Operator/Host/budget/Lease admission. This does **not** schedule work, authorize
execution, authenticate an Operator or change stored state. Offline CLI fixtures
cover uncertain Repair Attempt precedence, missing approval, Candidate-only
completion and unchanged event counts. Real Codex Host Live, independent final
acceptance and Windows/Linux CI for this new head remain unverified.


## Existing Workflow continuation CI fixture schema correction (fresh CI required)

The preceding head `b0428bf6886b1eb924f20b4389fad7f74051a492` failed `npm run test:codex-mvp` on
both Windows and Linux in the new read-only `workflow-progress` fixture
(`1 !== 2` at the first pending-approval query). The fixture inserted
Workflow rows in an ordinary V1 Store without enabling the existing opt-in
Workflow Attempt/approval tables, even though `runReport` reads those tables.
The fixture now explicitly calls `Store.enableWorkflows()` **before** creating
synthetic Workflow rows, mirroring the actual `createWorkflow` initializer.
It also asserts that subsequent read-only status calls leave schema version 2,
zero Attempt rows and original event counts unchanged. The production read path
continues to fail closed on unmigrated state and does not silently initialize
or authorize execution. The exact underlying CLI error was not emitted by the
previous failing assertion; this is a source-inspection-based root-cause fix
pending this commit's own Windows/Linux CI. No native Codex Host Live, real
repository mutation or final Objective acceptance was performed.

## Existing Workflow unresolved destination delivery intent handoff (fresh CI required)

A completed Candidate Workflow can retain a durable destination delivery intent
without an accepted delivery receipt after an interrupted external filesystem
effect. The read-only delivered Objective already projects this as
`RECONCILING`, but `workflow-progress` previously checked only the Workflow
row's `RECONCILING` state and incorrectly advised
`OBJECTIVE_EVIDENCE_REQUIRED` for a `COMPLETED` Workflow. The advisory
continuation now prioritizes the actual delivered Objective's
`RECONCILING` projection and requests destination-effect reconciliation,
without replay, a new grant, or a claim that delivery succeeded. An offline
CLI regression fixture covers the persisted `COMPLETED` / pending-intent /
no-receipt case and checks read-only event counts. This is a Recovery handoff
fix, **not** automated delivery recovery, Host Live acceptance or Objective
completion. The immediately preceding `28ad6312` Windows/Linux CI passed;
this change needs its own Windows/Linux CI before claiming offline PASS.

## Existing Workflow invalid delivery Evidence must not be presented as verification-ready (fresh CI required)

The existing-repository `workflow-progress` advisory previously treated a
`COMPLETED` Workflow with a persisted but unreadable delivery receipt as
`OBJECTIVE_EVIDENCE_REQUIRED`, even though the independent delivered Objective
projection correctly returned `BLOCKED`. This could misdirect recovery toward
new verification while the immutable receipt or approval chain was defective.
The continuation now prioritizes `DELIVERED_EVIDENCE_REVIEW_REQUIRED` on
`BLOCKED` and `DELIVERED_TARGET_DRIFT_REVIEW_REQUIRED` when the current
delivered tree differs from its pinned Evidence, before offering any new
Workflow or verification admission. Both are advisory, deny automatic replay,
and confer no approval. The synthetic cross-Store CLI regression asserts a
missing receipt is `BLOCKED`, cannot trigger execution, and does not mutate
Workflow events. Candidate-only and unsettled delivery intent handoffs stay
unchanged. The preceding `e61d324a` Windows/Linux CI passed; this commit
requires its own CI. Native Codex Host Live, actual target mutation,
authenticated Operator integration and Objective acceptance remain deferred.

## Existing Workflow provider cost ambiguity in progress and recovery (fresh CI required)

The read-only `workflow-progress` report previously summed every Attempt's
`reportedCostUsd` and `unknownCostAttempts` without validating the persisted
values. An older/incomplete Host Attempt without a cost field could yield
`NaN` (serialized as `null` by JSON) and an invalid unknown count, obscuring
whether a billable Turn was measured. The projection now returns
`reportedUsd:null` when any Attempt lacks a finite nonnegative provider amount,
and counts at least one unknown Attempt when its usage record is incomplete.
Valid provider-reported subtotals and separately recorded unknown counts remain
unchanged. Synthetic cross-Store regressions cover known and missing amounts,
read-only event stability and no automatic replay during an active Attempt.
This is budget **reporting**, not new billing authority, Host Live proof,
Operator authentication or Objective acceptance. The preceding
`98d3e96d` Windows/Linux CI passed; this head requires its own CI.

## Trusted existing Workflow result includes persisted next-step handoff (fresh CI required)

The trusted `runExistingWorkflow` response now includes the existing read-only
`workflowProgress` projection immediately after the Controller settles. The
same persisted DAG/Attempt, delivery Objective Judge, unknown-cost accounting and
advisory continuation are available to the authenticated embedding without
inventing a second scheduler or treating Host completion as Objective success.
`progress.executionGranted` remains false and `automaticReplay` remains false;
a follow-up Host Turn, Repair, verification or delivery still requires its own
current grant and Controller checks. The synthetic A→B/delivery/Judge fixture
asserts that the returned result contains successful persisted WorkItems, an
independently satisfied Local Objective, and a read-only no-replay completion
handoff. This is **not** a public Operator authenticator, native Codex Host
Live test, Protected verification or final product acceptance. Previous head
`83723640` passed Windows/Linux GitHub CI; this new head needs fresh CI.

## Authenticated existing-Workflow blocked Host handoff (fresh CI required)

After a valid hash-bound Workflow approval and independently authenticated
Operator admission, a managed Host/Controller failure previously surfaced only
as a generic CLI error, hiding the persisted recovery guidance. The trusted
`run-codex-workflow` and `resume-codex-workflow` entry now returns a nonzero
`CODEX_WORKFLOW_EXECUTION_BLOCKED` response containing the original error,
read-only `workflowProgress` snapshot and explicit no-replay continuation
when that snapshot is available. If the Store report itself fails, the original
execution error propagates rather than inventing progress. No Host grant,
approval, repeat execution or Objective completion is inferred from this
advisory output. An offline cross-Store regression confirms an actual
independent managed Workflow grant denial produces a recovery handoff without
Host/verifier effects, new Attempts or modified Workflow events. No real Codex
Host Live, Operator credential flow, protected execution or final independent
acceptance was run. Fresh Windows/Linux CI is required for this commit.

## NEW_PROJECT uncertain Fileset must precede unrelated approval (new CI required)

The read-only Bootstrap next-action projection now puts `RECONCILE` ahead of
`AWAIT_FILESET_APPROVAL` when an existing Fileset is still `MATERIALIZING` or
`WAITING_HUMAN`. Such effects are included even if their DAG dependencies
subsequently became blocked; dependency readiness must not hide a possibly
partially applied Fileset. Separate offline regressions cover ready and
dependency-blocked uncertain WorkItems alongside a second approval request.
This only changes advisory recovery ordering and never replays writes, grants
approval, establishes OS confinement, runs a native Codex Turn, or accepts an
Objective. Fresh Windows/Linux CI is needed for this commit.

## NEW_PROJECT continuation reconciliation precedence over Evidence defect (CI pending)

The read-only Bootstrap action list already places unresolved Fileset effects
ahead of unrelated approvals, but the single-step continuation previously
overrode that ordering whenever another item had EVIDENCE_INVALID. The trusted
Host handoff could therefore direct an operator to Evidence repair while an
independent Fileset was MATERIALIZING or WAITING_HUMAN, including an effect
whose dependencies later became blocked. Continuation now recommends
RECONCILE first, preserving EVIDENCE_DEFECT priority when no uncertain effect
remains. Two focused nonproduction regressions check the priority and assert
that neither path grants execution nor automatic replay. This is advisory
Recovery UX only, not actual Host Live proof, autonomous recovery,
Protected Evidence or Objective acceptance. The new commit requires its own
Windows/Linux CI result.

## Trusted NEW_PROJECT step failure includes persisted handoff (new CI required)

The one-step `advance-codex-bootstrap` entry returns a nonzero
`CODEX_BOOTSTRAP_STEP_BLOCKED` result after a denied or failed separately
reviewed Host/Fileset/Repair/Local-verification action. It preserves the
original error plus the current read-only `TaskReport` and its advisory
continuation. A failed grant never authorizes an automatic replay or future
effect. The result distinguishes optional Local completion from protected
Objective acceptance; if the current Store cannot be read after failure,
the original error is propagated rather than inventing recovery readiness.
Existing denial fixtures verify the result with no additional Host or
verification effects. New Windows/Linux CI is required; native Codex Host
Live and final Objective E2E remain unverified.

## NEW_PROJECT drift plus uncertain Fileset keeps targeted recovery (new CI required)

The read-only Bootstrap continuation now preserves the exact `RECONCILE`
target when the same Project has changed files and a Fileset still in
`MATERIALIZING` or `WAITING_HUMAN`. Previously the drift guard returned
only a generic changed-files handoff, hiding a potentially partially applied
effect. Drift without an uncertain Fileset remains a blocking handoff with no
next execution step. Neither case grants approval, retries a write, runs a
Host, or reports protected Objective acceptance. The two offline regression
tests require fresh Windows/Linux CI; Host Live acceptance remains unverified.

## Public read-only Codex Planning lifecycle and uncertain Host handoff (new CI required)

The existing `codefleet-alpha objective` CLI now supports
`codex-planning-status <planning-session-id>`. It opens the existing Store
read-only and validates the persisted Codex request digest, profile/context/
skill binding and submitted outcome/Contract integrity before reporting any
reviewable result. `SUBMITTED`/VALIDATED requires an independent Contract
review of the current checkout; it is NOT an execution approval.
`DISPATCHED` and `RECONCILING` expose a manual Host Turn reconciliation
handoff without automatic replay, even if the original approval expired.
`CANCELLED` needs a new planning review. Tampered/absent/legacy state is
reported only as BLOCKED/NOT_FOUND/UNAVAILABLE without leaking raw provider
response or creating tables. Four offline regressions cover valid submission,
uncertain/cancelled states, tampering and forbidden flags, and legacy read-only
compatibility. This is status UX, not authenticated Host admission, real
Codex Host Live verification, protected execution or Objective acceptance.
The new head requires Windows/Linux GitHub Actions CI before reporting PASS.

## Trusted Codex Goal CLI preserves dispatched Planning recovery context (new CI required)

The managed Codex planning adapter now distinguishes an error **after** the
durable Host Turn reservation from pre-dispatch approval/preflight errors by
a typed `CodexPlanningDispatchError` carrying only the exact session ID.
The existing trusted `plan-codex-goal` entry catches that type and returns
nonzero `CODEX_PLANNING_TURN_BLOCKED` with the original error, current
read-only `codex-planning-status` projection, and persisted continuation.
A thrown Host transport or unacceptable provider receipt must retain
`RECONCILING`, explicit `UNKNOWN` cost visibility and `automaticReplay:false`;
the CLI does not silently replay a potentially billable Turn, grant
execution, or claim planning validation. Denied grants prior to dispatch keep
the generic blocked result without pretending a Host Turn was reserved.
Offline regressions cover a failed injected Host transport, invalid receipt,
identical later read-only status and unchanged Workflow/Attempt counts.
Native Codex Host Live and end-to-end Objective acceptance remain deferred;
fresh Windows/Linux GitHub Actions CI is required before claiming PASS.

## Read-only Goal-to-Objective progress via existing CLI (new CI required)

The existing `codefleet-alpha objective` entry now supports
`codex-goal-progress <planning-session-id>`. It joins the already persisted
Codex Planning status to the deterministically promoted, independently
reviewed `planning-<session-id>` Workflow and existing `workflowProgress`
projection. A VALIDATED Planning proposal with no promoted Workflow reports
`AWAIT_WORKFLOW_REVIEW` without creating one. A promoted Workflow must still
pass originating Planning, immutable revision-1 graph, active revision and
source artifact provenance checks before its WorkItems, repair handoff and
delivered-tree Objective Judge can be shown. A missing or corrupt origin
fails closed. Completion is taken solely from the reobserved delivered
Objective; a successful Host Turn or candidate Workflow completion is not
enough. The view opens Store read-only, rejects execution/approval flags,
never invokes a Host or a second scheduler and never authorizes automatic
replay. Offline tests cover Planning-only → pending approval, a synthetic
delivered Objective COMPLETE → user target drift transition, forged Workflow
provenance, and prohibited flags. This improves one-Goal operator UX but
does not provide public Operator authentication, Host Live proof, Protected
confinement, cost measurements or final Objective E2E acceptance.
Fresh Windows/Linux CI is required for this commit.

## Current-source check for persisted Codex Planning status (offline CI pending)

The read-only `codex-planning-status <session-id> --repository ABSOLUTE_PATH` now
reuses the existing strict planning source observer for a persisted VALIDATED
result. A clean pinned checkout shows `PINNED_CLEAN_AT_REVIEW`; a dirty,
changed-HEAD or different repository reports `STALE_OR_MISMATCHED`, exits
pending and directs explicit source review/replanning rather than presenting
the original Contract/DAG as ready for promotion. Unsure/RECONCILING Host Turns
keep their no-replay handoff and are not silently redispatched. The new test
checks current and mutated source, invalid paths and zero Store events/runs.
This is advisory read-only UX, not an approval, Host grant, independent Judge
or Host Live acceptance. Windows/Linux CI for this new head is required.

## Trusted Goal-ID execution delegates to existing authenticated Workflow lane (CI pending)

The existing `codefleet-alpha objective` CLI now exposes
`run-codex-goal|resume-codex-goal <planning-session-id> --hash <workflowHash>`.
This is a user-facing handoff from a natural-language Goal to its reviewed
Contract/DAG and previously approved Controller lane. The exact persisted
`planning-<session-id>` Workflow must pass the read-only Goal provenance,
current revision, hash and Objective checks. The invocation then delegates
directly to the existing `run-codex-workflow|resume-codex-workflow`
implementation with the **same Store-bound authenticated facade and Operator
callback**. It does not create a Workflow, approve an Operator identity, start
a second scheduler, bypass current Git source/Lease/budget checks or issue a
new Host grant. The plain CLI remains unavailable for model execution without
a trusted embedding; invalid IDs, hashes and extra flags fail before invoking
the privileged admission factory. A fully delivered and currently independently
verified Objective returns a no-op COMPLETE projection with no new Host Turn.
Offline regressions cover Planning-only, pending approval, separate Operator
and Host grant denials, no attempted model/verifier effects, resume handoff,
incorrect hashes and already-COMPLETE no-op. This does not establish native
Codex Host Live, real Operator authentication integration, PROTECTED execution
or final product Objective acceptance. Fresh Windows/Linux CI is required.

## Goal-ID authenticated CLI positive joined trace (fresh CI required)

The original synthetic accepted Objective fixture now executes through the
`run-codex-goal <planning-session-id> --hash <workflowHash>` trusted CLI
wrapper with a fresh Store connection, instead of invoking the trusted facade
runner directly. It first promotes an independently reviewed Host Planning
result to a pending Workflow; separate exact Workflow approval, authenticated
Operator review, and independent bounded Host grant are then required.
A fake Codex proposal travels through the existing Controller, independent
fake verifier, approved Local Delivery, criterion Evidence, Objective Judge
and persisted Goal progress. The fixture checks the one Operator review,
one managed-Host grant, single WorkItem Turn, read-only Goal COMPLETE
projection, no automatic replay and revocation of current Objective COMPLETE
after a user file edit. The preexisting denial and hash-integrity tests are
retained. It is not a native Codex model Turn, independent real-world
verifier/protected OS isolation, public Operator authentication, or final
MVP acceptance. Fresh Windows/Linux GitHub Actions CI is required.

## Natural-language Goal CLI → reviewed Contract → authenticated execution → Objective joined fixture (CI pending)

The synthetic accepted Goal trace now begins with a **fresh** trusted
`plan-codex-goal` invocation, rather than pre-seeding a validated Planning
result and invoking only the downstream execution command. The same original
Goal is sent through the managed read-only Planning Turn using a fake Codex
transport and independently reviewed immutable repository/context scope.
The returned session ID drives the actual read-only `review-codex-plan`
command, explicit hash-confirmed `prepare-codex-workflow`, separate
Workflow approval and `run-codex-goal` with authenticated-embedding-only
Operator and managed-Host grants. The existing Controller then applies a
bounded fake proposal, performs independent fake regression checks, approved
Local Delivery and criterion-indexed delivered Objective Judge. After
Objective COMPLETE, another Goal command must not dispatch a Turn, and
source drift must revoke the current completion projection.

This extends the offline **product-CLI-to-product-CLI** acceptance coverage
without modifying the underlying scheduler or adding a grant. It does not
establish a native billable Codex model Turn, production Operator
authentication, protected sandbox or independent real-world Objective
acceptance. The new revision requires its own Windows/Linux GitHub CI.

## NEW_PROJECT user-facing Todo → Calendar → actual Local verification (fresh CI required)

A new offline integration test uses the existing trusted
`advance-codex-bootstrap <task-id>` product CLI across independent Store
openings, not a direct facade shortcut. It advances the persisted
`requirements → todo → calendar → tests` DAG one step at a time, preserving
separate Host Fileset proposal grants, explicit Fileset review/approval,
per-item bounded materialization grants, and a separate exact Local command
grant. The synthetic Codex Host returns scoped Todo and Calendar source/test
files, but the final `node --test --test-reporter=tap` runs as an **actual
Local subprocess** in the disposable NEW_PROJECT fixture. Both tests must
pass, while Protected verification and Objective COMPLETE remain
`UNSATISFIED`/false. A repeated Local request is rejected without a second
grant; no Host Turn is replayed. The test neither supplies real Codex
model output nor upgrades Local trust to protected acceptance.

The existing-repository Codex semantic Planning compiler currently fixes
`maxAttempts:1` and initially emits one `change` WorkItem; this
NEW_PROJECT exercise is **not** evidence that natural-language Codex
Planning can yet generate and authorize a multi-WorkItem source DAG. That
capability needs a separately reviewed Contract/attempt-budget extension.
Fresh Windows/Linux GitHub Actions CI is required for this change.

## Explicit bounded multi-WorkItem Codex Planning DAG (new CI required)

The prior semantic Codex Goal contract always compiled a VALIDATED planning
draft into one `change` WorkItem with `maxAttempts:1`, preventing natural
language plans from preserving independent source tasks and their dependencies.
An optional planner-proposed `draft.workItems` field can now describe **2..5**
WorkItems using the existing immutable Contract/DAG validator. Each item
supplies exactly `id`, `dependencies`, `priority`, `files`, `tests` and
`acceptanceCriteria`. The planner may not expand the discovered source or
protected-test scope, assign one file to multiple items, omit a planned file
or criterion, invent an acceptance method, duplicate IDs, or introduce a
missing/cyclic dependency. Every criterion must be backed by a protected test
selected for its WorkItem. A legacy draft without `workItems` still compiles
to the unchanged single `change` node.

A validated multi-step plan compiles `maxAttempts` equal to the number of
WorkItems (up to five): **no unapproved retry or Repair capacity is added**.
Unknown model cost remains explicitly unknown and needs the existing separate
exact owner authorization before later turns. The originating planning
artifact, per-WorkItem source ownership, DAG, mandatory integrated
verification, and cost/attempt limits remain visible during Contract review;
Workflow creation is unapproved until the existing authenticated execution
admission and separate Host grants. A two-step A→B offline product CLI fixture
tests dependency order, accepted A context in B, verifier checks, final
integrated target Delivery, independent synthetic Local Objective Evidence,
and immutable status without real/billable Codex.

The Host Planning Skill and managed read-only planning prompt now describe
optional explicit decomposition. This changes the Skill hash: previously
SUBMITTED sessions remain readable under the exact former trusted Skill hash,
but previously OPEN/DISPATCHED sessions cannot dispatch with new instructions
and must be separately replanned. New fixture checks the historical hash
boundary, immutable submission, and no implicit Workflow approval.
This is not a real Codex Host Live run, protected verification, production
Operator credential flow or final Objective E2E acceptance. Fresh Windows/Linux
CI is required.

## Persisted A→B handoff observation during a managed Turn (CI pending)

The existing reviewed multi-WorkItem Goal CLI integration test now opens an
independent read-only Store during the synthetic **B** Host Turn. It checks that
A was durably recorded as SUCCEEDED before B dispatch, B is explicitly STARTED
and unresolved, and the user-facing Goal continuation requires reconciliation
rather than automatic replay after interruption. This tests recovery visibility
at the dependent WorkItem boundary; it does not simulate a native Codex process
crash, certify Host Live, or accept a Protected Objective. Fresh Windows/Linux
CI is required for this test-only revision.

## Goal-ID managed execution returns current Goal-level continuation (new CI required)

The trusted `run-codex-goal` / `resume-codex-goal` entry now includes a fresh
read-only `codex-goal-progress` projection after delegated Controller execution,
alongside the Workflow result and originating Planning session ID. The embedding
can present the current Goal → reviewed Contract/DAG → WorkItems → delivered
Objective handoff after a managed Host denial or settled execution without a
second CLI invocation. No new authorization or replay is introduced. If the
read-only observation fails, `goalProgressStatus: UNAVAILABLE` and
`goalProgress: null` explicitly avoid an invented completed Objective.
Synthetic regressions cover a rejected Host grant and a delivered two-WorkItem
Goal. This is not native Codex Host Live, authenticated Operator credential
integration, protected execution or independent final Objective acceptance.
Fresh Windows/Linux CI is required.

## One-command Goal source readiness before Host dispatch (fresh CI required)

The read-only `codex-goal-progress <planning-session-id> --repository ABSOLUTE_PATH`
option checks the canonical checkout against the original persisted
Planning/Workflow repository identity and clean pinned Git baseline before
any WorkItem dispatch. A different repository, dirty working tree, changed
HEAD or missing checkout returns `SOURCE_REVIEW_REQUIRED` with an explicit
no-replay review/replan handoff rather than suggesting Workflow approval
against stale source. Once a WorkItem has been attempted or delivery has
settled, the optional pre-dispatch check is skipped and labeled
`NOT_RECHECKED_AFTER_DISPATCH`: persisted recovery and independent delivered
Objective re-observation remain authoritative. Offline regressions cover
Planning and pending Workflow, source drift, invalid relative paths, unchanged
Store events/Attempts and completed Delivery. This grants no Operator/Host
authority and does not prove Host Live or final Objective acceptance.
New Windows/Linux CI is required for this revision.

## Current-source Goal readiness includes exact Contract/DAG preview (fresh CI required)

The read-only `codex-goal-progress <session-id> --repository ABSOLUTE_PATH`
now includes `planReview` from the existing `review-codex-plan` validator
when a validated Plan has no Workflow yet **and** its original repository,
Git HEAD and clean source baseline have been reobserved. Developers can
inspect the WorkItem DAG, mandatory final criterion, exact Workflow and
source-contract hashes, execution limits and required verification in one
Goal-level status call before explicitly preparing a pending Workflow.
Without `--repository`, after Workflow creation, or when source drift is
observed, this field is absent; the mismatched source requires review or
replanning. The projection remains read-only and does not approve a plan,
create a Workflow, authenticate an Operator, start Codex or grant a Lease.
An offline regression compares the embedded review with the existing
independent review command and checks stale-source omission and no new
Attempts. This is not Host Live or final Objective acceptance. The new
HEAD needs independent Windows/Linux CI.

## Goal-level approved Workflow review before first Host dispatch (fresh CI required)

The read-only `codex-goal-progress <session-id> --repository ABSOLUTE_PATH`
now includes the existing independent `review-codex-workflow` projection as
`workflowReview` when a validated Plan has already been promoted, the exact
original repository is still clean/pinned, and no WorkItem Attempt or Delivery
requires recovery. This surfaces the current Workflow DAG and Contract hash,
`MISSING_OR_EXPIRED` versus `CURRENT_WORKFLOW_APPROVAL_VALID` approval state,
and the separate authenticated Operator/managed-Host grant handoff without
asking the developer to guess another command. Source drift suppresses this
review and demands explicit source review/replanning; after dispatch the
persisted recovery and delivered Objective state remain authoritative.
Offline regression checks parity with the existing Workflow review command,
missing/valid approval, zero new Attempts, and review omission on source drift.
This is read-only visibility, not permission to execute or evidence of Codex
Host Live, PROTECTED verification or Objective completion. This HEAD requires
its own Windows/Linux CI before treating the new regressions as passing.

## Goal execution before Workflow review returns actionable handoff (fresh CI required)

The trusted `run-codex-goal` and `resume-codex-goal` aliases now return an
explicit `CODEX_GOAL_EXECUTION_NOT_READY` response when the persisted Goal
is still in Planning, awaiting independent Workflow preparation, or blocked
by invalid provenance. It includes the current read-only `goalProgress`,
a non-replay continuation and a concrete review/replan instruction rather than
only an opaque Workflow hash error. An invalid hash against an existing
reviewed Workflow still fails closed. Offline regressions exercise both
aliases before Workflow creation with zero Host Turns or WorkItem Attempts.
This is a recovery/entry UX improvement, not a grant, native Host Live
evidence or Objective acceptance. The new HEAD requires its own CI result.

## Delivered Goal run/resume no-op response parity (fresh CI required)

After a previously delivered Goal has a currently independently observed
`OBJECTIVE_COMPLETE` verdict, both trusted `run-codex-goal` and
`resume-codex-goal` now return the same `planningSessionId`,
`goalProgressStatus: OBSERVED`, and read-only `goalProgress` envelope as
the delegated execution path. The no-op still reports
`executionSucceeded: false` and `executionGranted: false`; it never
repeats a Host Turn or reuses a prior Operator grant for a new effect.
The two-WorkItem synthetic CLI fixture checks both aliases, unchanged
attempt/event counts, exact current Goal progress, and no additional Turns.
This is offline UX consistency, not a Host Live or Protected Objective proof.
Fresh Windows/Linux CI is required for this change.

## NEW_PROJECT one-command progress and handoff parity (fresh CI required)

The trusted `advance-codex-bootstrap` response now includes the existing
read-only `TaskReport` snapshot for both one-step results and human handoffs,
with Task ID, Local completion diagnostic and explicit non-Objective completion.
A developer can continue the NEW_PROJECT Fileset → approved materialization →
Local verification handoff without a separate status round-trip. No new
execution, approval, replay, source write or scheduler authority is introduced.
The existing synthetic Todo/Calendar progression fixture checks the response
against the same persisted TaskReport at proposal, pending approval, materialized
state and Local-verification handoff. This is not native Codex Host Live,
protected verification or final independent Objective acceptance. The new
commit requires its own Windows/Linux CI before claiming offline PASS.

## Single-command Goal Planning returns a current-source Contract/DAG preview (new CI required)

The trusted `plan-codex-goal` result now includes the Planning session ID and
the existing independent `review-codex-plan --repository` projection for a
persisted VALIDATED draft. The response exposes the source-bound Workflow and
source-contract hashes, ordered WorkItems/dependencies, mandatory final
acceptance criteria and limits immediately after the Host planning Turn.
A changed/mismatched repository produces a BLOCKED review rather than a
reviewable Contract; an unvalidated or denied plan has no review preview.
The separate explicit `prepare-codex-workflow` confirmation, Workflow approval,
authenticated Operator admission, Host grant and Lease remain mandatory.
Offline regression assertions compare the embedded projection to the standalone
review and require no Workflow/Attempt creation or additional Host Turn.
The current environment cannot check out the full repo or run Node 24/Docker;
Windows/Linux CI for this new head is the pending independent offline check.
This is not native Codex Host Live or Objective E2E acceptance.

## Goal Plan-to-Workflow structured preparation handoff (fresh CI required)

The trusted `plan-codex-goal` result and the read-only
`codex-goal-progress <session-id> --repository ABSOLUTE_PATH` preview
now return an exact `prepareCommand.argv` for the persisted, independently
reviewable Plan when the original repository is currently pinned and clean.
The structured argument vector carries the exact session, absolute source
root and both bound Workflow/source-contract hashes. It avoids manual hash
transcription in the developer's Goal → Contract/DAG → pending Workflow path.
A missing/stale review, missing source check, or already-promoted Workflow
does not produce a preparation command. This is a suggestion for **explicit
human review**, not an automatic invocation, execution grant, Workflow
approval or Operator admission. Existing source freshness and authorization
guards remain authoritative at the actual preparation/execution boundary.
Offline regressions assert exact argv for the trusted Planning and read-only
Goal paths and omission after promotion or source drift. The full repository
checkout, Node 24 and Docker are unavailable in this runtime, so the
new HEAD requires independent Windows/Linux CI before any offline PASS claim.
Native Codex Host Live and final Objective E2E acceptance remain deferred.

## Pending Workflow promotion immediately returns independent approval review (fresh CI required)

The explicit `prepare-codex-workflow` result now includes the existing
independent `review-codex-workflow --repository` projection for the newly
persisted, still-unapproved Workflow. A developer receives the current-source
Contract/DAG, approval state and separate authenticated Operator/Host handoff
in the same response, including idempotent repeat preparation. When the
post-promotion source observation is unavailable or stale, the projection
is suppressed with `workflowReviewStatus: RECHECK_REQUIRED` instead of
presenting a stale review as current. This adds no Workflow approval, grant,
execution, WorkItem Attempt or Objective claim. The offline test compares the
embedded review with the independent command, checks approval absence and
idempotent no-dispatch behavior. Full local checkout, Node 24 and Docker
remain unavailable in the current automation environment; the new HEAD
requires its own Windows/Linux CI before calling the regression passed.
Native Host Live and final Objective E2E acceptance remain deferred.

## Exact authenticated Goal run handoff after Workflow approval (new CI required)

The read-only `codex-goal-progress <session-id> --repository ABSOLUTE_PATH`
now offers a structured `runCommand.argv` with the exact reviewed Workflow
hash only when the original repository is pinned and clean, a Workflow exists,
and its current independent approval is valid **before first dispatch**.
A validated Plan or unapproved Workflow exposes no run command; stale source,
in-flight Attempts, recovery and completed Delivery also suppress the hint.
The command is for a **trusted authenticated Host embedding**, not a plain
unauthenticated CLI entry point: Operator admission, managed Host grant, Lease
and budget remain enforced on actual dispatch. Regression checks cover
unapproved, approved, stale and delivered views without extra Attempts.
This is a read-only UX improvement, not Host Live or Objective acceptance.
Local Node 24/full-checkout/Docker validation is unavailable here; this HEAD
must receive separate Windows/Linux CI before claiming an offline PASS.

## Persisted A-to-B Goal resume command handoff (independent CI required)

The read-only `codex-goal-progress` projection now returns an exact
`resume-codex-goal <planning-session-id> --hash <workflowHash>` argv only
when at least one WorkItem has a persisted terminal SUCCEEDED attempt,
another dependency-ready WorkItem remains, Workflow approval is current,
and the coordinator's lease is inactive. Live leases, pending/uncertain
Attempts, incomplete approval and completed Objectives expose no resume
command. The command is **advisory only**, explicitly states that source was
not rechecked, and still requires a new authenticated Operator review,
the existing Controller/Lease/budget guard and a separate managed Host grant.
Offline tests model a settled A, ready B, active Lease and unresolved B;
they do not certify accepted child Evidence, real process restart or Host Live.
The runtime here has Node 22, no full GitHub checkout/Docker and cannot run
the required Node 24/Alpha regression locally. The new HEAD requires its own
Windows/Linux GitHub CI before these tests can be called passing.

## Goal WorkItem reconciliation and bounded Repair review handoff (fresh CI required)

The read-only `codex-goal-progress` projection now returns a structured
`recoveryHandoff` when the existing Controller reports an unresolved
Host/Delivery effect or a terminal failed WorkItem. It identifies the current
Workflow revision, affected WorkItems, persisted Attempt child/generation/status,
and a read-only `workflow-progress` inspection command; uncertain delivery
also points to read-only `delivered-status`. It never suggests
`resume-codex-goal` for uncertain or failed work and cannot mint a Repair
authorization, Operator grant or Host execution capability. An offline
regression changes synthetic B from STARTED to FAILED after persisted A and
checks both no-replay and separate Repair review. Full local Node 24/Docker
regression is not available in the current environment; the new commit needs
its own Windows/Linux CI. Host Live and final Objective E2E acceptance
remain deferred.

## Persisted WorkItem recovery diagnostics through the existing report command (fresh CI required)

A failed or uncertain WorkItem in the read-only `codex-goal-progress`
`recoveryHandoff` now includes its persisted diagnostic reason and an exact
`report <childId>` command for that same generation's child Run. This reuses
the existing RunReport rather than inventing a second evidence reader. The
report command is diagnostic, not an execution grant, approval, replay, verified
Evidence or an automatic Repair. An offline regression exercises a synthetic
A-settled/B-uncertain-to-failed transition, resolves the actual recorded child
report and checks there is no new Attempt or Workflow event. It is not an actual
Host failure or native Codex recovery proof. Fresh Windows/Linux CI is required;
Host Live and final Objective E2E acceptance remain UNVERIFIED.


## Controller WAITING_HUMAN failed-WorkItem Repair handoff (fresh CI required)

A real managed-Host child failure is persisted by the existing Controller as
an immutable FAILED WorkItem Attempt while the parent Workflow enters
`WAITING_HUMAN`. The read-only Workflow/Goal progress projection previously
returned a generic HUMAN_HANDOFF before inspecting that failed Attempt, so
its already implemented `recoveryHandoff` and exact child `report` command
were missing in this ordinary post-failure path. It now exposes
`REPAIR_REVIEW_REQUIRED` for persisted failed children even when the parent
is waiting, with the current evidence, budget and approval requiring separate
human review; pause/cancel and WAITING_HUMAN without failure retain generic
HUMAN_HANDOFF. No automatic replay, new grant, or Repair Attempt is created.
The offline regression models the real WAITING_HUMAN state after B failure,
compares the Workflow and Goal status, and checks the existing diagnostic
child-report/no-additional-Attempt contract. Native Host Live and Objective
E2E acceptance are still unverified; independent Windows/Linux CI for the
new commit must be checked before reporting an offline test PASS.
 
## Discoverable top-level Codex Goal review path (fresh CI required)

The top-level `codefleet-alpha --help` now points developers to
`objective help`, `codex-goal-progress`, `review-codex-plan`, and
`review-codex-workflow` with explicit clean-repository review options.
Previously these Objective entry points were documented only behind
`codefleet-alpha objective help`, making the Goal-to-DAG review route
difficult to discover at first launch. The help separates read-only public
review from trusted Host planning and authenticated Workflow execution
(approval, budget and Lease remain unchanged). A subprocess regression
asserts the actual top-level help output. This is developer entry-point UX,
not Operator binding, Host Live, or Objective E2E acceptance. Local Node 24,
full repository checkout and Docker are unavailable; separate Windows/Linux
CI for this new HEAD remains required before reporting test PASS.

## Read-only NEW_PROJECT Bootstrap continuation from ordinary CLI (CI required)

The public `codefleet-alpha objective codex-bootstrap-progress <task-id>` now
opens an existing Store read-only and returns the current persisted NEW_PROJECT
`TaskReport`, next permitted Fileset/DAG/Repair/Local verification handoff,
and explicit local-vs-Objective completion separation. It does not initialize
Task tables, request an Operator or Host grant, run a model, apply Filesets,
replay a failed verification or promote Local evidence to Protected/Objective
acceptance. The existing trusted `advance-codex-bootstrap` still owns every
separately authorized effect. An offline regression inspects both a prepared
Bootstrap and a Fileset-materialized Bootstrap through a separate read-only
CLI Store, rejects execution/approval options, and checks persisted Task bytes
and event counts remain unchanged. This is persistence/recovery UX, not actual
Codex Host Live or independent Objective E2E acceptance. Full local Node 24,
checkout and Docker are unavailable here; Windows/Linux CI for this exact
commit is required before claiming the tests pass.

## NEW_PROJECT recovery handoff command discovery (new CI required)

The top-level alpha help now exposes the read-only `codex-bootstrap-progress`
entry. Its persisted status response additionally presents exact `advance-codex-bootstrap`
argv hints for a currently ready Fileset proposal, independently reviewed
materialization, or each eligible failed-Evidence Repair predecessor.
No hint is produced for uncertain effects, stale/drifting source, unreviewed
Local verification commands or completed Local work. Every hint explicitly
requires the existing trusted embedding and a separate independent grant;
none replays an Attempt, approves costs, modifies files or claims Objective
completion. Existing read-only Store and one-step Controller boundaries
remain unchanged. Negative and synthetic continuation tests are added.
Windows/Linux CI for the new HEAD must pass before claiming offline success;
actual Codex Host Live and independent delivered Objective E2E remain unverified.

## Reopened Store synthetic Goal delivery check (fresh CI required)

The existing two-dependent-WorkItem synthetic managed Host fixture now closes
and reopens the real SQLite Store after A→B and final local delivery. It checks
that immutable Attempt identities, persisted event counts, independently
observed delivered-Objective status, and WorkItem outcomes survive the Store
reopen without an additional Host Turn, before confirming source drift still
invalidates current Objective completion. This covers durable read-only
re-observation after completion, **not** mid-Turn crash recovery, a real
Codex Host session, protected verification, or independent Objective E2E
acceptance. The new HEAD needs its own Windows/Linux CI.

## Separate CLI process recovery of pending and failed WorkItem (CI required)

The existing read-only Codex Goal continuation regression now launches the
actual `codefleet-alpha --state ... objective codex-goal-progress` command
in a separate Node process at both a persisted B `STARTED`/uncertain
checkpoint and a B `FAILED` human handoff. It checks no automatic resume
or new Attempt/event, preserved child identity, and the separate-process
`report <child-id>` failure diagnostic. This verifies process-boundary
inspection of the persisted synthetic state, not safe replay, a real
mid-Turn crash, authenticated Operator binding, Codex Host Live, or final
Objective E2E acceptance. Windows/Linux CI of the new commit must be
checked before reporting offline PASS.

## Post-dispatch Codex Goal completion re-observation (fresh CI required)

The trusted `run-codex-goal`/`resume-codex-goal` path now returns a successful
Goal-level CLI exit only when its separately reobserved persisted delivered
Objective remains COMPLETE for the same Workflow ID and hash. Previously, a
managed Workflow could return exit 0 while the second Goal projection was
missing, incomplete or stale, and the CLI would still report success. The
new `CODEX_GOAL_COMPLETION_UNVERIFIED` response exits 2, preserves the
original Workflow result as diagnostic `workflowExecution`, and prohibits
implicit replay. A pure regression checks successful, unavailable, incomplete
and mismatched post-dispatch observations as well as blocked grant outcomes.
The isolated Node 22 helper smoke test passed locally; full Node 24 repo tests
and Docker were unavailable. This HEAD needs fresh Windows/Linux CI before an
offline regression PASS claim. The change does not authenticate the Operator,
provide a live Host binding, or establish final Objective E2E acceptance.

## Persisted Codex Goal session discovery across CLI restarts (new CI required)

The ordinary read-only `objective codex-goals [--offset N]` entry now lists up to 20
persisted Codex Planning session IDs per page in newest-first order, with each
session's independently inspected Planning status and exact read-only
`codex-goal-progress` argv. This addresses losing the Planning session ID after
restarting the Host/CLI; the index intentionally does not expose raw Goal/model
output, reconstruct authorization, recheck repository freshness, start Turns or
claim Objective completion. Malformed/execution flags are rejected, legacy
Stores are not migrated, and separate-process/pagination/no-mutation offline
regressions are authored. Full Node 24/local Docker validation is unavailable;
check fresh Windows/Linux CI for this commit before claiming offline PASS.
The authenticated Operator/managed Codex Host execution binding, actual Host
Live and final independent Objective E2E acceptance remain incomplete.

## Read-only Goal index includes persisted Workflow handoff (fresh CI required)

The bounded `objective codex-goals` list now reuses the existing read-only
`inspectCodexGoalProgress` projection for each of at most 20 persisted Codex
sessions. Developers returning after a CLI restart can distinguish unprepared
Plans from a reviewed Workflow awaiting approval and see its ID, continuation
status, possible recovery handoff and independently reobserved Objective
completion without manually opening every Goal. The index never supplies an
approval, Host grant, source-freshness proof or automatic resume; the detailed
`codex-goal-progress` review remains required. The new regression covers a
separate CLI process, the pending-approval Workflow state and no new
Attempt/event. Node 24/full local tests and Docker are unavailable; fresh
Windows/Linux CI is required for this HEAD. Real Codex Host Live and final
independent Objective E2E remain unverified.

## Persisted Goal discovery after delivered Objective and source drift (fresh CI required)

The existing approved synthetic A→B managed-Host joined fixture now observes
`codex-goals` after Local delivery and asserts that the read-only Goal index
shows the independently reobserved COMPLETE Objective, its Workflow handoff,
and no execution authority. It then changes a delivered source file outside
CodeFleet and launches a separate CLI process to confirm the index no longer
claims Objective completion, without a new Attempt, event or Host Turn.
This is a regression of delivered-tree status visibility across CLI restarts,
not a Codex Host Live run, OS-authenticated Operator grant, protected verification
or final Objective E2E acceptance. The changed HEAD requires its own Windows
and Linux GitHub Actions results before claiming the new assertions passed.

## Read-only Codex Goal discovery survives one unreadable session (fresh CI required)

When the persisted Codex Goal list contains a malformed session identifier or
an individual Goal projection throws, the bounded index now preserves the other
recoverable sessions instead of aborting the entire CLI discovery. The affected
row is marked `BLOCKED / PERSISTED_GOAL_UNREADABLE`, with no progress or resume
command; the index returns `PARTIAL_BLOCKED` and CLI exit code 2 so users cannot
mistake partial discovery for a clean result. A regression fixture corrupts one
Planning identifier and verifies that another submitted Goal remains discoverable
after a separate CLI process restart, that pagination remains stable, and that
the read-only command creates no events or Attempts. This repairs persistence
and recovery UX only: it does not reconcile unknown Host effects, authenticate
an Operator, prove Codex Host Live, or accept a delivered Objective. The new
commit requires its own Windows/Linux CI before any offline PASS claim.
