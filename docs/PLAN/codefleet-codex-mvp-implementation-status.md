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
