# Codex Core continuation and supervised review UX

- Date: 2026-10-28
- Baseline: core-p0-1 detached at `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, with preserved local changes; not GitHub main.
- Work: implementation, internal process regression, actual isolated acceptance preparation.
- Predecessor: [bounded continuation](../../implementation/bounded-continuation.md).
- Numbering: descriptive run name; no audit ID allocated.

## Implemented behavior

BootstrapOperator accepts one externally signed, exact verification delegation,
then issues separate candidate-bound one-use Decisions through the existing
Reservation transaction. Existing events/artifacts hold acceptance, revocation
and expiry; no new DB or signer exists. Exact commands, candidate, contract,
acceptance mode, scope, environment and total consumed budget are checked.
Pending issuance, failed/uncertain effects, lost lease and contract changes stop.
The trusted embedding can reopen and continue remaining dependent verification.
This is NOT future-source/model delegation or a public authenticated Host service.

Continuation now preserves actual Local-only Judge completion instead of returning
Human Handoff after the last successful verification. Protected requirements remain.

Native `local-review` generates and persists revision/request/expiry fields.
`local-accept` uses that artifact and explicit review consent. The generated Skill
documents the path. Consent is not inferred from packet creation or actor strings.

Recovery now distinguishes a normal unprepared Bootstrap Draft from corrupt
execution records. Missing metadata after preparation is still rejected.

## Actual acceptance boundary

Copied the original accepted Todo project's 10 manifest files, checked every hash,
and installed the existing Codex Skill into a separate acceptance root. Original
browser storage and project/state/evidence were not changed. No Git publication,
new API credentials, model subprocess or app test rerun occurred.

Actual Task: `task-621ea1d5-f8c2-4bcc-9d09-92eaa3d24162`, revision 2.
Host plan returned NEEDS_INPUT / NEW_PROJECT for the non-Git existing source copy.
Current Bootstrap refuses existing paths as new files; existing-repository
execution requires its supported baseline. No baseline was fabricated or committed.
The requested two dependent source improvements therefore were NOT_EXECUTED.

Skill installation is INSTALLED_OFFLINE, not proof of current-session discovery
or actual `$codefleet` invocation. No independently trusted production signer
or Host approval-delegation transport is connected. Public execution stays blocked.
No Agent-generated signing key was used for Live acceptance; keys remain test-only.

Packaged recovery initially returned RECOVERY_RECORD_DEFECT for the unprepared
Draft. After the minimal source fix, a new actual CLI process returned RECOVERED,
stage DRAFT, next REVIEW_DRAFT, no execution authority, unchanged revision and
two Work Log events. The installed immutable snapshot predates this recovery fix.

## Verification and remaining work

See the appended measured results. Internal signatures/process tests establish
only their tested embedding boundary; they are not live autonomous development.
The original Todo remains COMPLETE_LOCAL with 8 passing Local tests and user
reported manual browser acceptance; Protected remains UNSATISFIED.

Next required product work: trusted Host approval transport; scoped source and
repair delegation; existing-source Local onboarding without inventing a Git base;
actual Skill invocation and two implementation WorkItems; live interruption and
recovery; approved requirement-revision transitions. No overall completion claim.

## Measured scoped results

Windows, PowerShell, Node 24.14.1, ordinary user Native Local; not MXC attestation or cross-platform acceptance. Existing regression runner preserves JSON/logs.

| Suite | Final result | Evidence log stem |
| --- | --- | --- |
| Bootstrap Operator + Continuation | 73 PASS, 0 FAIL, exit 0 | regression-1793149962310 |
| Native Local + Local acceptance | 17 PASS, 0 FAIL, exit 0 | regression-1793149622211 |
| Host | 18 PASS, 0 FAIL, 1 Docker opt-in SKIP, exit 0 | external acceptance-root regression log |
| Recovery | 32 PASS, 0 FAIL, exit 0 | regression-1793150092825 |
| Existing Repair + Bootstrap Reservation | 79 PASS, 0 FAIL, exit 0 | final scoped repair/reservation regression log |

Earlier failed runs remain: Operator/Continuation 67 PASS / 3 FAIL (test reopen/signing helpers corrected); combined Native/Host/Local 29 PASS / 6 FAIL / 1 SKIP (candidate-drift expectation corrected, Host CJS fixtures rerun outside the source ESM tree using the existing junction). No product guard or acceptance criterion was relaxed. Host fixtures are internal simulated provider tests, not Codex Live.

For exact already-reviewed verification only, one external signed root authorization replaces two separate review authorizations in the trusted test embedding. Both child Decisions remain distinct and one-use. Production user-intervention reduction is NOT_VERIFIED. No additional model subprocess was called; unobserved model cost remains UNKNOWN.

## Final checks

The original Todo success manifest still matches all 10 actual source/test files (0 hash mismatches). No original app test rerun was made. Git diff --check, document facts and citation checks exited 0. The full link checker exited 1: three missing targets exist in the preserved failed Host safety test temporary Skill runtime under evidence/test-temp. Neither the evidence nor the checker was altered to turn this green. Historical unresolved citations remain reported by the citation checker.

## Conclusion

Exact signed verification continuation, supervised review UX and Draft recovery improved. Full Codex autonomous development is not accepted; no new Live implementation Decision/Attempt/Evidence or Judge completion is claimed.

## Next work

Connect an independently trusted Host approval boundary and existing-project source-change onboarding, then accept the actual two-WorkItem development loop. Preserve the supervised Local path until then.

## Unresolved

Source/model/repair predelegation, public Host authorization, actual Skill discovery/invocation, arbitrary requirement-revision transitions and full live recovery remain incomplete. Protected verification and cross-platform acceptance were not run. Working changes are uncommitted and not integrated into official main; preserved generated temporary files also prevent a clean full link check.
