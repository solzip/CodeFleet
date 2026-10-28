# Existing-project supervised Codex Local acceptance

- Date: 2026-10-28
- Baseline: core-p0-1 detached at `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, preserving earlier uncommitted changes; not GitHub main.
- Type: product implementation, negative regression, supervised actual application acceptance.
- Predecessor: [Core continuation](codex-core-continuation.md).
- Numbering: descriptive run; no new audit ID allocated.

## Actual result

Current Codex session generated two real changes to an isolated copy of the accepted Todo app:
`src/todo.mjs` adds a reusable date-grouping helper; dependent `src/calendar.mjs` imports it and groups once rather than filtering all todos for each of 42 cells.
The original tests, persistence format and app data were unchanged. This is a small implementation improvement, not a new Todo feature or a hard-coded fixture result.

Installed packaged CLI: Host plan -> ExistingLocalDraft -> Validator/DAG -> two reviewed Filesets -> materialize -> separate-process Recovery after each -> exact Local review -> one integrated test Attempt -> Evidence -> Local Judge -> final Recovery.

Observed: 8 PASS / 0 FAIL / 0 SKIP, exit 0; COMPLETE_LOCAL. Protected UNSATISFIED.
The successful launcher measured 8,281 ms including preparation, application and verification; this is not total development or human review time.
The actual repository had existing source files and uncommitted content, with an unborn Git HEAD. No commit was made or invented.

## Bindings

| Record | Value |
| --- | --- |
| Task | `task-3a24bf76-f81a-4b99-9aea-55413b22d557` |
| Final revision | 9 (verification bound to revision 8) |
| Workflow | `95b73a8f47f341255d9d749be057b82b5d9084c64e74bcd2f2f328fbca0a37a4` |
| Candidate | `d8acbe692c7e52b0277f931087b6bc9e63a41a448094c217be291fcd4eb5101d` |
| Decision | `bc3ec74a-1732-492c-a97e-d1ca659d0283` |
| Attempt | `bootstrap-attempt-f3a9ac41-1a92-4880-af65-7d9d0f62b1db` |
| Evidence | `6816eefe17ce4d9bf1002d8368c85a9fdd6b98bebe1dd2cad0f988738b7c53e6` |
| Command hash | `a000579560a863d945339bec2ec1ad61472830205cdf2cde71df1f9e74887c0d` |
| Verification Review | `944d9a727b82e02dc8838e1c70196b69f800e9e35610a44c4a79fe007503ef08` |

Command: `node --test --test-reporter=tap test/todo.test.mjs test/calendar.test.mjs test/server.test.mjs`, maximum one Attempt / 30 seconds, no retry.
The Decision is CONSUMED with zero remaining executions. Remaining Task budget is zero Attempts / zero reserved time.
Materialization receipts: `e0295137f52ba46bf2004de3a457a036e52ec9afaa8ce4778575b27813e75ccc`, `9b3c3d516e16954c0793376effae34f5ec6da35bc2bf07fb5bff89eb303b1530`.
Final read-only check matched the actual candidate, all expected copy files and all 10 original files; no unexpected project files outside Git metadata. Original failed Evidence `46088cdf899866b27732de676bb3a710422ec65e631275e99ca24a3e302ea338` still matches its hash.

Raw CLI stdout/stderr, exit codes, proposals, reviews, receipts, recoveries and summary remain in the private acceptance evidence directory named `public-existing-01`. No private machine paths are published here.

## Reused implementation and scope

Opt-in `host codex plan "goal" REPO --local-existing --acceptance LOCAL_ONLY` selects EXISTING_LOCAL at Task creation. No existing Protected contract is changed.
It retains the observed Git baseline and full bounded working-tree inventory, including uncommitted file contents. Validation reuses Bootstrap Draft/DAG infrastructure; existing acceptance tests have no writing WorkItem.
Initially supported changes are exact replacements of existing `src/**/*.mjs` modules, not file creation/deletion or arbitrary language onboarding.

Existing materializer, hash-bound workflow approval, lease, task revisions and Work Log enforce Filesets. New `local-files-review` / `local-files-accept` manage exact supervised packets, candidate/expiry checks and no-replay behavior. Observed expiry cannot revive after clock rollback.
Existing Native Local / Reservation produces the test Decision, Attempt and Evidence. Existing Recovery and Local Judge evaluate them.
No engine, DB, scheduler, signing service or model subprocess was added.

## Approval and Host limits

The Host command approval covered the exact proposal bytes, both applications and one fixed test command. CodeFleet produced separate exact Fileset reviews and a fresh verification review.
This remains SAME_USER_UNPROTECTED consent, not independently authenticated long-term delegation. Agent JSON cannot enter the signed Operator path; enrolled Operator bypass is negatively tested.

[Official App Server approvals](https://learn.chatgpt.com/docs/app-server#approvals) describe server requests answered by the client. That protocol does not itself authenticate an Agent-controlled client as a human approval authority. No independently protected client approval transport was connected here; PUBLIC_DELEGATION_BLOCKED remains.

The packaged Skill/CLI procedure was used from this Codex session. Automatic Skill discovery and literal `$codefleet` dispatch in a fresh Host session were NOT_VERIFIED; installation and scripted CLI calls do not prove them. No additional model subprocess was called. Total model request count, billing and human review time are UNKNOWN.

Two actual acceptance launcher approval requests occurred: the first stopped at planning, the second completed after an approved target-path correction. One intervening read-only Doctor request identified the blocker. These are tool request counts, not an independently measured count of human clicks. The successful run used one bounded user execution approval for the three internal reviews, with no repeated Fileset prompt.

## Failure, regression and recovery

The first copy directory was mistakenly created in the sandbox identity before ordinary-user execution. Git init succeeded, but Native Probe refused ownership at planning. Task `task-9063402a-3f16-45f8-9c57-3b37521e5e03` remains BLOCKED, with zero materializations/test Attempts.
Existing Native Doctor identified GIT_OWNERSHIP; no ACL, ownership or safe.directory change was made. A newly approved user-owned copy was created entirely by the ordinary-user process. Neither the failed Task nor its artifacts were deleted or replayed. Existing Local planning now retains probe failures instead of discarding the diagnostic.

Final scoped Windows / PowerShell / Node 24.14.1 results:
- Bootstrap + Native Local: 79 PASS, exit 0, external regression log `regression-1793151718138`.
- Final Existing Local negative cases + installed package checks: 12 PASS, exit 0, including expired-consent revival and enrolled Operator bypass refusal.
- Earlier combined regression: 157 PASS / 1 FAIL / 1 Docker SKIP, exit 1, `regression-1793151556954`. Recovery, Host, Local acceptance and Repair passed; the failing Bootstrap assertion expected the existing baseline-change error. Product ordering was corrected without weakening that assertion, then the affected suites passed above.
- Earlier wrong-TEMP invocation: 76 PASS / 3 FAIL, exit 1. Non-Git and junction fixture assumptions failed because the runner was invoked inside a repository. Corrected invocation uses the already-provisioned external fixture; tests were retained.
- Initial installed-link test incorrectly imported a non-exported helper; corrected the test to inspect every packaged Markdown link target. Both Host install smoke tests passed.

Actual separate CLI processes recovered revisions 6 and 8 before continuing and revision 9 after verification; no uncertain effects or duplicate implementation occurred. This is process recovery, not proof of Codex context-compaction recovery.
No actual app test failed in this acceptance, so Live app Repair was not exercised; existing Repair failure/success regression remains separate evidence.

## Installation links and publication

The three historical broken links originated in repository `src/README.md`, which was indeed copied into installed runtime. Installer now supplies an installation-specific runtime README with a valid packaged MIT link. Tests check actual installed target existence for Codex and Claude.
Old generated failed-test installations remain untouched. `/evidence/test-temp/` is explicitly classified as generated, non-distributable regression workspaces in .gitignore; raw regression logs remain outside that exclusion. No checker was modified or failing historical artifact deleted.
Full current-source link check: zero missing targets/case errors/anchors. Document facts and diff checks passed before final record addition; final checks recorded below.

## Conclusion

Existing-source supervised Local development completed two real dependent implementation WorkItems and independent integrated verification.
Public unattended delegation and automatic Skill entry are not accepted.

## Next work

Connect a trusted Host-side approval source if public delegation is required; accept literal Skill invocation in a fresh Host session; extend onboarding beyond existing ESM replacements with separate contracts.

## Unresolved

Protected verification, automatic public approval delegation, arbitrary contract-revision migration, broader existing-repository/language support, browser E2E of the improved copy and Codex session-compaction recovery remain unverified. Core work is uncommitted and not integrated into official main. No Git publication occurred.

## Final integrity follow-up

Completion now rehashes the whole current Candidate, including added files, rather than checking only the recorded file set. A post-verification unreviewed-file addition now cancels Local completion. The targeted real execution/drift test passed; unfiltered Local-only and Protected-required acceptance tests both passed (exit 0). An initial filtered invocation selected no acceptance cases; that file-level runner result was not counted as acceptance.

Latest source Recovery of the actual completed Task returned RECOVERED / complete true at revision 9 with the same Candidate, no blockers, no active leases and no uncertain effects. No test was rerun. The sandbox could not open the ordinary-user SQLite file; the authorized original Native context performed this read-only check. The installed immutable snapshot predates this final read-time hardening; source and next installation contain it.

Final current-source link, declared-fact, citation and git diff whitespace checks all passed. Historical unresolved/suspect citations remain reported separately; no baseline was changed.
