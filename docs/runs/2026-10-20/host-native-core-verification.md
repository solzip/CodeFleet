# Host-Native core and pluggable verification

- Date: 2026-10-20, Asia/Seoul.
- Target HEAD: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03`.
- Branch: `feature/alpha-g0-refresh`.
- Type: implementation, verification, architecture decision.
- Predecessor: [Host execution review](../../product-completion/host-execution-modes-review.md) and the owner's subsequent Host-Native Core implementation instruction.
- Measured REGISTER maxima: P0-17 / P1-61. No finding status or grade changes.

## Scope and preservation

Initial Git inventory found existing changes to both READMEs, INDEX and progress,
plus untracked H7/H8 evidence and `.trials/`. These are preserved.
Git initially rejected sandbox ownership; command-local safe.directory was used,
without changing global Git configuration. A pre-edit file/hash inventory is
retained in ignored `.trials/host-core-checkpoint/before.json`.

Decision-debt checked the one user-selected operating document: final decisions
zero, excluded sensitive-context candidate one, warnings zero; no grounded blocker.
The current user instruction authorizes offline implementation, not a Live pilot.
No model calls, real authentication reads/copies, installation, product commits,
pushes, PRs or deployment are part of this work. Tests create commits solely in
their existing disposable fixture repositories.

## Implementation

Evidence envelopes and protected Judge checks are additive. Legacy evidence
remains compatible; partial new envelopes fail closed. Container results retain
Harness authority and gain explicit fields; Local results use LOCAL_EXECUTED.
Local passes cannot satisfy protected gates or complete Alpha Runs.

The existing Controller/Scheduler, TaskDraft and semantic reference validators,
Workflow persistence, approvals, leases, snapshots, test identity checks, Judge
and recovery are reused. No replacement orchestration engine is introduced.

Additional WorkItem policies are bound to workflow/revision and pinned in state.
Independent ready items proceed despite another item's capability failure;
descendants wait. Failed attempts do not replay. Missing/changing pinned policy
fails closed on resume. Existing protected Operator checks still run at reservation.

Default Skill preparation now supports the current Host session without Docker,
separate OS accounts or API credentials. Draft intake rejects additional authority
fields, stale revisions and forged code references. Workflow/explain and request-only
approval are available. Strict H6 remains separate and unchanged.

Container Backend delegates to the unchanged Node/Java isolation implementation.
Local Backend requires exact reviewed command/snapshot and a one-use token; it
uses real local processes with cancellation and reports no security isolation.
Host Sandbox cannot activate. Public Host ingress cannot invoke Local execution,
approve a Run or submit verification evidence.

Host Doctor separates basic runtime and optional backend readiness. Alpha Doctor's
default meaning is unchanged; explicit --no-auth reports incomplete authentication
readiness and never calls auth status.

Changed implementation areas: `src/alpha/{controller,judge,verifier,verification-evidence,cli}.mjs`,
`src/verification/backends.mjs`, `src/workflow/capability-policy.mjs`,
`src/hosts/{cli,install,doctor,harness-service,workflow-authorization}.mjs`,
`src/product/{tasks,report}.mjs`, package scripts and focused tests.
See the [usage and assurance contract](../../product-completion/host-core-guide.md).

## Verification

Stage A: `node --test test/verification-backends.test.mjs` exit 0,
two passed, none failed/skipped.

Stage B: `node --test test/workflow.test.mjs test/hybrid.test.mjs test/verification-backends.test.mjs`
exit 0, 43 passed, zero failed, two Docker tests not run in this first focused pass.

Stage C: `node --test test/host-core.test.mjs` exit 0, four passed, zero failed/skipped.
Actual CLI subprocesses use a PATH without Docker/Host binaries; fake Host data is
distinct from real Host invocation. SQLite is real, including reopen between calls.

Stage D: `node --test test/verification-backends.test.mjs` exit 0,
six passed, zero failed/skipped. Missing Container and Host Sandbox cases are
fake/backend refusal tests; local Node TAP, one-use races, cancellation and
self-modification use actual processes.

First backend regression: Node/Java Docker plus the new backend/core tests:
`node --test test/verification-backends.test.mjs test/host-core.test.mjs test/alpha.test.mjs test/alpha-java.test.mjs`
exit 0, 49 passed, zero failed/skipped. Additional tests were added afterward;
final validation is recorded below.

Docker's first default-config query was denied by the sandbox before configuration
could be read. Subsequent commands use an empty dedicated Docker config and the
explicit local engine, without loading existing authentication settings. No image
downloads or dependency preparation are needed.

Final full-suite after the baseline correction: `npm.cmd test` **exit 0**.
Legacy 324 + Alpha 211 + Core/Backend 12 = **547 passed, failed 0, skipped 0**.
Posttest passed without changing coverage or document baselines.
[Final full log](host-core-full-final-v2.log).

First full `npm.cmd test`: tests passed (Legacy 324, Alpha 210, Core 10;
544 total, failed/skipped zero), but **exit 1** at posttest. The three failures
were the README record-count declarations (two) and an extra unanchored numeral
in the existing H8 index summary. Both README counts now match the measured
record inventory; the index points to the preserved H8 record for probe counts.
No checker, coverage requirement or baseline was lowered.

The next `npm.cmd test` passed with **exit 0**, Legacy 324 + Alpha 211 + Core 11
= 546, failed/skipped zero. During final inspection a new targeted negative test
then exposed an explicit `MISMATCH` baseline still passing the historical baseline
predicate. That test failed (exit 1, one assertion failure); the additive predicate
now rejects unknown/mismatched integrity for new envelopes while preserving
unbound Container baseline and historical evidence semantics.
Focused backend tests then passed (exit 0, eight passed, failed/skipped zero).
The final full regression after that correction is recorded separately.
An earlier inline Node reproduction did not execute due to PowerShell quote
handling (syntax error, exit 1); only the actual test established the defect.

Extra trusted-guard/Local CLI regression: exit 0, 13 passed, failed/skipped zero.
The mixed workflow used a fake staged proposal source and the real Container
Backend: risky `a` BLOCKED, independent `b` SUCCEEDED, dependent `c` BLOCKED,
one attempt, no final integration, overall WAITING_HUMAN. Existing H3 real
Linux UID/IPC tests also ran. This is not actual Host delegation or human presence.

Doctor commands:

- `node src/alpha/cli.mjs host codex doctor --probe-container`: exit 0.
  Core/Planning/Workflow AVAILABLE, Local CONDITIONAL, Container AVAILABLE,
  Host Sandbox NOT_VERIFIED, authentication NOT_INSPECTED, Host Live NOT_RUN.
- `node src/alpha/cli.mjs doctor --no-auth`: exit 2, deliberately incomplete.
  Git/Claude version/gh/isolated verifier passed; authentication not checked.
  Default authenticated Alpha Doctor was not run because credential access is
  prohibited for this task. No full authenticated readiness claim is made.

Environment: Node v24.14.1, existing local JDK, CODEFLEET_TEST_DOCKER=1;
CODEFLEET_TEST_MAVEN_IMAGE=`sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`,
CODEFLEET_OPERATOR_IMAGE=`sha256:26c04a69d0bb84a2ed1cb865c36a0f690bbe772197ee41d914563bea5236200d`,
CODEFLEET_HOST_IPC_IMAGE=`sha256:47e30452abb8ab756bf3c09ad729f4a3469f3babb5b4c602912fdb88ec153f8a`.
Local images were inspected; no image download was requested.

## Required counterexamples

| Requirement | Evidence exercised |
| --- | --- |
| Docker-free planning and DAG management | Real CLI with PATH excluding Docker and Host binaries, plus both Host adapters |
| Missing Docker blocks protected verification | Real Alpha CLI in the same PATH: WAITING_HUMAN, zero attempts |
| Local success cannot become protected VERIFIED | Judge envelope tests and an actual Controller Run retained at WAITING_HUMAN |
| Required gates prevent completion | Local evidence and mixed blocked DAG lack accepted/final artifacts |
| Independent items continue; descendants wait | Policy fixture, serial failure fixture and actual Docker mixed-workflow guard test |
| Unapproved risky work denied | Existing H2/H3/H4 denial tests and additional per-item admission |
| Agent approval/evidence forgery rejected | Public Host draft/command tests, existing exchange/Operator negative tests |
| Existing Docker Alpha/Node/Java | Full Alpha tests including fixed-proposal real Node and Maven execution |
| SQLite/recovery/Skill compatibility | Existing migration, process-death, replay, lease, install lifecycle and H6 tests |

Fake adapters test policy/control behavior; actual Local processes test Local
execution; actual Container tests establish the existing limited isolation path.
Historical test-only injected verifiers retain their existing fixture semantics;
they are not the new Local Backend and do not certify it as protected.

## Evidence and preservation

- [First full run, failed at document checks](host-core-full-first.log).
- [Intermediate full pass, before final baseline correction](host-core-full-final.log).
- [Failing baseline counterexample](host-core-baseline-negative.log).
- [Backend/Node/Java regression](host-core-backend-regression.log).
- [Operator and Local CLI regression](host-core-hardened.log).
- [Host Doctor](host-core-host-doctor.log), [Alpha Doctor without auth](host-core-alpha-doctor.log).
- [Source hashes and preservation](host-native-core-source-evidence.json).
- [Bounded public-file security scan](host-core-security.json).
- [Final document/coverage checks](host-core-final-docs.log): `npm.cmd run posttest`
  exit 0 after the implementation record was completed.

The pre-edit inventory examined 411 existing src/test/scripts/docs files:
16 changed, 395 unchanged, zero missing. All 66 Legacy TypeScript source/test
files and all 39 matched G1-H8 record files retain their original hashes.
Root README/package/gitignore changes are outside that pre-edit inventory and
are shown separately in Git diff; initial README edits were extended, not reset.
No old source/test or record was deleted. H3/H4/H6 tests remain in the full command.

Current working-tree source map, bound by the accompanying source hashes rather
than a claim that the new files existed at the baseline HEAD:

```text
src/alpha/verification-evidence.mjs:13   protected execution metadata
src/alpha/judge.mjs:6                  baseline authority/integrity
src/alpha/judge.mjs:14                 protected completion Judge
src/alpha/controller.mjs:239           pinned policy on resume
src/alpha/controller.mjs:305           per-item admission and dependency gating
src/verification/backends.mjs:9        existing Container implementation adapter
src/verification/backends.mjs:68       explicitly trusted Local backend
src/product/tasks.mjs:72              bounded Host draft intake
src/hosts/cli.mjs:38                   basic preparation dispatch
src/hosts/doctor.mjs:14                separate optional-backend readiness
```

The final full document pass examined 140 Markdown files. Declared facts checked:
42; mismatches zero; other numeric claims outside that check: 539, unchanged
baseline. Living broken citations zero; historical unresolved 10 and suspect 13
remain reported rather than erased. `git diff --check` exited 0; existing CRLF
normalization warnings are not source errors.
Public logs replace personal path/name prefixes. The security scan checks only
personal identifiers and common key patterns in changed/new public files; it is
not a universal secrets or vulnerability certification. Its exact denominator
and matches are in the linked JSON.
Final bounded scan: 39 changed/new public files examined, zero matches.
HEAD remains the initial commit; no product commit or push was made.

## Conclusion

Host-Native preparation and pluggable verification are OFFLINE_VERIFIED.
The final full regression passed; protected completion requirements are retained.
Host Live remains NOT_RUN, not HOST_LIVE_VERIFIED.

## Next action

Before a separately authorized Host Live trial, verify actual Skill discovery and
invocation, effective Host permissions, role/attempt mapping and cancellation.
Protected execution additionally requires the appropriate qualified backend and
protected Operator/state boundary. H8 installation is not a core prerequisite.

## Unresolved

Host Sandbox qualification, actual Host Skill invocation and automatic role
delegation, authenticated risky Host dispatch and general development goals remain
unverified/unsupported. Local verification cannot enforce filesystem/network
isolation, prevent TOCTOU, or protect evidence against the same OS identity.
