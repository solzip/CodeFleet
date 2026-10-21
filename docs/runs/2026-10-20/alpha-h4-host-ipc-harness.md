# H4 — Host IPC & Trusted Harness Integration

2026-10-20. H4 implementation and regression record. Actual Host Live and human authorization remain **BLOCKED**; no HOST_LIVE_VERIFIED claim.

## Starting evidence and preservation

Worktree `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`, actual HEAD `9dc429835fd272253f8efac60ac0f76bf7188de5`. Existing G1–H3 tracked and untracked changes were retained. All 11 H3 source manifest hashes matched before editing. No reset, source removal, commit, push, PR, deployment, model call or real API key use.

The decision-debt scan covered only the two user-selected H3 operating documents. It returned blocked, one final candidate and one sensitivity exclusion. Its cited execution mismatch mixed attack rejection, historical failed attempts and final success. Source hashes, cited passages and final logs were checked; the H3 product BLOCKED judgment was retained. Implementation proceeded to address the explicitly identified missing IPC/Harness connection, not by claiming the tool returned clear.

## Changes and boundaries

New `src/hosts/ipc-client.mjs` and `harness-service.mjs` adapt existing APIs. `operator-runtime.mjs` and `operator-ipc.py` extend the H3 runtime/peer-credential bridge. `install.mjs` registers both Skills' IPC instructions. Existing controller, staged exchange, guard, Docker verifier, Judge, report and SQLite/Recovery own execution and completion; they are not replaced. Package tests include the new H4 client and real-process E2E; existing Host install tests also check the packaged client.

See [the full IPC contract and deployment limitations](../../implementation/host-ipc.md). Agent UID and Operator UID differ; private repository/state/key/ledger/code and Unix socket checks are enforced. Message schemas, limits, deadlines and durable request IDs prevent arbitrary execution and replay. Requests reserve before effects; unknown crash outcomes require reconciliation. `verify` rechecks stored independent evidence, never accepts Agent evidence. Execution uses the default production Docker verifier, not an injected fake verification callback.

Both Skills use the same protocol. Natural-language goals are untrusted proposals for already provisioned contracts; arbitrary new scope/WorkItem activation remains blocked. Risky execution and Operator decisions remain blocked because actual human input is not attested. OS process authentication is not human presence. Confined automatic work remains available in the Linux fixture. No Host credentials/session artifacts are forwarded.

## Execution record

Initial H4 image preparation installed Git and Docker tools. A first image unnecessarily included the Docker daemon package; the final Dockerfile installs Git and Docker CLI only. A build using a raw image ID as a Dockerfile FROM reference failed (exit 1); the local H3 tag was restored and the final build passed (exit 0). Final H4 image: `sha256:47e30452abb8ab756bf3c09ad729f4a3469f3babb5b4c602912fdb88ec153f8a`. Image preparation downloaded Debian packages; runtime tests use no network/model. No host Docker socket permissions were changed.

Initial targeted attempts failed (each exit 1, one of two tests passed): Operator could not write Docker Desktop's root-owned 0755 socket; an explicit UID/group probe confirmed the denial; copied Windows source permissions failed the new read-only runtime check; the fixture Docker transport dropped output by treating half-close as full close. The latter produced empty baseline evidence and WAITING_HUMAN, correctly not success. Fixes were confined to provisioning/transport and stricter code checks; no Judge or verification requirement was weakened. The sixth targeted attempt passed (exit 0, two tests, no skips), including actual Docker baseline/candidate/integration verification and 23 named observations. The expanded H4 E2E passed 28 named observations. Combined H4/H3/Host targeted regression ran 26 tests: 24 passed, two existing install tests failed because the rewritten Skill omitted the lowercase word `operator`. The Skill wording was corrected without changing those assertions. The first full `npm test` ran all 522 code tests successfully (Legacy 324 + Alpha 198, zero failed/skipped), but exited 1 in posttest: CRLF rewriting of the guide made the existing anchor checker miss `before-live-acceptance`. Restoring LF fixed the link check (131 Markdown files, 330 links, zero errors) and fact check (42 declarations, 17 measurable facts, zero mismatches; 539 other numeric claims remain outside that check). A sandbox-only Git lookup failure on standalone document checks was rerun under the normal test account; no global Git configuration was changed.

## Status and remaining gates

Linux separated-process fixed-contract E2E: OFFLINE_VERIFIED, 28 named observations. The final full-command retry passed as recorded below. Host Skill installation and actual invocation are distinct. Actual Codex/Claude sessions, actual WSL2 and Windows-native isolation, human approval, new-scope activation and automated Host collaboration are not verified. Overall product remains BLOCKED.

The fixture-only root Docker transport grants broad Docker authority exclusively to Operator, checks peer UID and is inaccessible to Agent. It is not a production installer or a new orchestration service. Trusted administrator/root compromise remains outside the boundary. Abrupt kill may leave a verifier container until its bounded timeout; resume must reconcile, not duplicate an attempt.

Next acceptance: audit a real protected Linux deployment and Host/descendant confinement, implement/authenticate a separate human input channel before risk grants, then obtain explicit approval for small Codex and Claude live scenarios. H4 does not proceed to those steps.

## Evidence and command scope

Targeted command: `node --test test/host-ipc.test.mjs test/operator-runtime.test.mjs test/host.test.mjs`. Full command: `npm test`, with CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA pointing to the discovered local JDK, the existing Maven image `sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`, H3 Operator image `sha256:26c04a69d0bb84a2ed1cb865c36a0f690bbe772197ee41d914563bea5236200d` and the H4 image above. Existing Alpha/Legacy, Node Docker, Java/Maven/JDK, SQLite, Lease, Recovery, staged Host and optional API security regressions remain included.

Alpha Doctor (`node src/alpha/cli.mjs doctor`) exited 0, including isolated-verifier readiness. Authentication diagnostics omit identity/tokens and do not call a model. Offline installation tests inspect both packaged IPC clients and exercise install/disable/enable/remove; they do not prove actual Skill invocation.

Preserved sanitized evidence: [first Docker denial](codefleet-h4-first.log), [UID/mode probe](codefleet-h4-second.log), [code permission rejection](codefleet-h4-third.log), [empty baseline](codefleet-h4-fourth.log), [baseline detail](codefleet-h4-fifth.log), [first successful E2E](codefleet-h4-sixth.log), [expanded targeted/installation failure](codefleet-h4-targeted.log), [Doctor](codefleet-h4-doctor.log).

The 28 E2E observations include normal fixed-contract execution and independent verification, unknown UID/Agent/Operator decision rejection, actor/command injection, missing proposals, risky execution denial, request-only approval, actual key/ledger/repository/Docker and descendant access denials, server message size bound, changed Graph Revision, forged evidence fields, durable duplicate replay/conflict, restart persistence, cancel/resume denial, abrupt worker kill with identical child attempt IDs and RECONCILING, uncertain journal refusal, and tampered artifact invalidation. H3's full regression retains same-UID startup denial, stale Lease, expiry, revocation and actual approved reservation. H4 does not claim to test a real person's approval.

## Final validation

Final `npm test`: **exit 0, 522 passed = Legacy 324 + Alpha 198; failed/skipped 0**. This includes H4's two tests, H3's five runtime tests and all previous suites. The full command's rule coverage, links, citations and declared-fact posttest checks passed. Historical dated citation warnings were preserved. Evidence: [first full command (code passed, posttest failed)](codefleet-h4-full.log), [final full command](codefleet-h4-final.log), [eleven final source hashes](alpha-h4-source-evidence.json).

Final source/test changes are enumerated in that source manifest. Documentation changes are this H4 record, `docs/implementation/host-ipc.md`, the H4 addendum to `operator-runtime.md`, `host-native-guide.md`, product `progress.md`, `docs/INDEX.md`, and the README/README.en indexed-document counters. Existing H1/H2/H3 execution records and historical source manifests were not rewritten. Sanitized command logs are new evidence files. A complete cumulative changed-path/hash inventory is retained only in the ignored local checkpoint; it is not a commit or a content-complete security audit.

Product principles are preserved: Host reasoning stays provider-reported; Workflow/DAG/roles, approval fences, existing independent Harness/Judge and evidence-based completion remain authoritative. No required test or security policy was weakened. H4 stops at OFFLINE_VERIFIED for the bounded Linux fixture, with the product/actual-human/Host Live gates BLOCKED.

Final document checks after the record was finalized: exit 0 ([log](codefleet-h4-docs.log)). `git diff --check` exited 0; branch and HEAD remain unchanged. Eleven source hashes matched. A bounded private-path/key-pattern scan examined 24 source/evidence files with zero matches; this is not proof that all secrets or attacks are absent. The subsequently sanitized document log contains no matching private-path/key pattern.
