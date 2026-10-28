# Alpha release source and gate qualification

- Date: 2026-10-28.
- Baseline: core-p0-1 at 19ddf671410e92fc9d9e4fa423aeb829981c5bfa plus preserved uncommitted implementation.
- Type: frozen package audit, Windows regression, Linux protected gate and integration preparation.
- Predecessor: [Codex Core release candidate](codex-core-release-candidate.md).
- Numbering: descriptive run; no audit number allocated.

## 1. Frozen installable candidate

The retained codefleet-0.2.0-alpha.4.tgz has SHA-256 f38ee966a9b424329552a7fd602dfc5be08af473f03e4682e8dd8ca4492d0c75 and integrity sha512-3s2gcHW6f3GWv/o6GxGXk0MQctXFateHTmAGqmwE5QwPXYiNWzl7YWMXuNbr9ep6VwJLhCxjqrrpU8+pW9l2NA==.

Extraction and byte comparison found all 457 package entries equal to the working files before this gate record was written. This includes 91 source files and the public Skill installer. A second pack from the same source produced exactly the same integrity. No product source change was required in this run.

The package includes src/, product/historical docs, examples, MIT license, security/readme files and scripts/host-install.mjs. It excludes root test/, evidence/, .codefleet/, .git/, node_modules and SQLite State. The current private user-profile path scan found no matches in the extracted package. This is a bounded packaging check, not proof of absence of all possible secrets. Existing linked historical documentation evidence remains; new raw logs stay local and are not added to the package.

The bin named codefleet retains the Legacy src/cli.ts entry; codefleet-alpha uses src/alpha/cli.mjs. Installed $codefleet uses its runtime/alpha/cli.mjs snapshot and reuses the existing product CLI, Tasks, Reservation, Native Local and Evidence/Judge. Node >=24.14.1 and Git are prerequisites; no npm runtime dependencies, direct model key or Docker requirement for supervised preparation.

Local retained paths: .codefleet/rc-stabilization/artifacts/ contains the tarball and release.json; release-audit/audit.json contains every packaged file SHA-256. This report and final gate metadata are subsequent release records, not changes to the frozen tarball.

## 2. Actual Windows gates

Windows / PowerShell / Node 24.14.1, ordinary-user execution:

| Command/scope | Result |
| --- | --- |
| npm run pretest | Exit 0; previous coverage directory copied before reset |
| npm run test:legacy | 324 PASS, zero failures/skips, exit 0 |
| npm run test:host-core | 89 PASS, zero failures/skips, exit 0 |
| npm run test:host | 20 PASS, 1 declared Windows Docker Harness SKIP, exit 0 |
| Native Bootstrap/Reservation/Continuation/Repair/Operator/time/Local suites | 263 PASS, zero failures/skips, exit 0 |
| npm run posttest | Exit 0; coverage, links, citations and facts pass |
| supervised-only package smoke | Exit 0; install/remove/reinstall, help, capability, HEAD recognition, Recovery and repository preservation |

The full Windows run was performed once. The explicit execution permission included commits made by existing tests only in disposable Fixture repositories. Product/worktree/acceptance Git history was not changed.

Raw results and logs are retained in release-gates-RkJqSL under the local acceptance directory. Package reinstall evidence is in temporary directory codefleet-packaged-YWXYhh. The installed Skill was ENABLED after reinstall and then removed through the supported lifecycle. Existing acceptance Recovery returned RECOVERED with no unresolved effects or remaining work; this does not rerun its completed implementation or tests.

Historical citation warnings remain distinct from broken current documentation. No coverage or acceptance baseline was reduced. Test-only signed Operator fixtures remain synthetic safety evidence, not authenticated public delegation.

## 3. Linux protected qualification

The existing Docker Desktop Linux Engine was available. The existing pinned CI image contains Node 24.21.0, Git 2.47.3, Docker CLI 26.1.5 and JDK 21.0.7. Source was mounted read-only and copied into one isolated Docker VM directory. The full existing scripts/test-alpha-ci.mjs and Host Core command were selected; no protected tests were deleted or filtered.

The Host explicitly approved Docker socket access, which grants Docker control, and the dedicated VM temporary root. The runner uses no external network or model and retains logs. Existing immutable Operator, IPC and Maven images were reused. Linux container qualification is not Linux desktop Codex acceptance.

Initial execution failed, and those exits remain failure evidence:

| Gate | Actual initial result |
| --- | --- |
| Alpha H6 first stage | 7 PASS / 0 FAIL |
| Remaining complete Alpha list | 466 PASS / 5 FAIL, exit 1 |
| Linux Host Core | 86 PASS / 3 FAIL, exit 1 |

Five Alpha failures: candidate denial setup, installed Claude Local process, stale-task reservation recovery, H4 IPC integration and killed Repair worker. Three Core failures: post-work-item drift, old-review environment recovery and Docker-free PATH.

The logs explicitly include decision issuance occurring after the observed current clock and execution wall-clock rollback. H4 reports coordinator lease/revision loss; the killed Repair worker does not reach its expected marker within the fixed timeout. These are retained observations, not proof that every failure shares one cause. No clock guard, lease rule, timeout or expectation was weakened.

The Docker-free PATH failure had a confirmed runner preparation defect: /usr/bin contained both Git and Docker, while the official CI explicitly prepends a Git-only directory. The isolated runner had omitted that preparation. An approved bounded follow-up restores the existing CI preparation and selects only the eight original failures, without product/test edits or global clock changes. Full original logs remain in .codefleet/rc-stabilization/linux-results; Docker VM source/results remain under the dedicated release root.

The single bounded recheck ended with 6 PASS / 2 FAIL, exit 1. Git-only PATH and five other selected cases passed. Remaining failures:

- H4 IPC integration again records Coordinator lease/revision lost. This time its repair WorkItem succeeded, but the final verification Attempt was CANCELLED and no accepted Evidence was produced. A common clock cause is plausible but not established for this failure; retain it as unresolved rather than labelling an environment-only defect.
- The killed Repair worker test failed during setup because the execution clock moved backwards: reserved=1793161809245, observed=1793161809181 while monotonic elapsed time was approximately 375 ms. CodeFleet correctly handed off without accepting success. This reproduces the environmental clock blocker; do not waive the rollback guard.

No third execution was attempted. The current full Alpha release gate is FAILED/BLOCKED, even though the Windows supervised scope passes. Required next work is a stable Linux clock/execution environment and diagnosis of H4 lease loss with existing logs, followed by the affected gates. This task did not modify OS time, increase lease/time limits or change tests.

## 4. Actual support labels

| Label | Meaning for this candidate |
| --- | --- |
| SUPERVISED_READY | Windows Codex exact user-reviewed Local implementation/verification and recovery; not final autonomous development |
| PUBLIC_DELEGATION_BLOCKED | No trusted public Objective authenticator/issuer; Host permission is not delegation |
| PROTECTED_UNSATISFIED | Existing Todo and project Local Objectives have no qualifying Protected Evidence; regression success cannot promote them |
| HOST/OS_NOT_VERIFIED | Separate clean machine, macOS and Linux desktop Host acceptance not executed |

The previous fresh Codex session read the installed Skill and executed help/capabilities successfully. This run made no new model calls and did not relabel CLI-only package checks as fresh Host Live. Its runtime is byte-identical to that accepted snapshot. Dollar costs and human time remain unmeasured.

## 5. Commit candidates and integration order

Read-only GitHub checks still show main 4477e4426960af46076d3aa29808201c1c8911a6, PR #9 open/unmerged at 19ddf671410e92fc9d9e4fa423aeb829981c5bfa. Local main/origin/main matched. core-p0-1 is already based on that PR head; do not duplicate its two commits.

1. Review/land the existing PR #9 reservation foundation through a separately approved Git operation.
2. Core execution and safety: Store/read-only access, Reservation/Continuation/Repair/Recovery, environment and Local acceptance, with their contracts and negative tests.
3. Existing project and Host integration: intent/probe/bootstrap, Filesets, tasks/report/CLI, backends, Host exchange/installer and Native Local tests. Shared tasks/CLI/reservation/report files need hunk-level review against step 2.
4. Distribution: package file list, public installer, state-free help/capability handling, package smoke and necessary product/user guidance.
5. Attach sanitized run records and integration qualification; retain raw State/evidence locally rather than staging them wholesale.

These are reviewable grouping candidates, not claims that the current working diff can be split mechanically without dependencies. Include untracked product modules/tests with their callers; omission would produce a broken official baseline. Revalidate any source changed during splitting or conflict resolution.

No Commit/Push/PR/Merge/Rebase/Reset/Cherry-pick was performed. Future approval must name the selected file/hunk groups, target branch, destination remote and whether it authorizes updating PR #9, opening a follow-up PR or merging. This task does not authorize any of those operations. package.json remains private:true; local tarball installation is supported, npm registry publication is not enabled.

## 6. Conclusion, next work and unresolved conditions

The frozen supervised tarball is installable and matches the verified Windows runtime. The full Alpha release gate has not passed; official Git integration and public release remain blocked.

Next: resolve the two remaining Linux gate failures without weakening safety, then review the recorded Git integration groups. No Commit/Push/PR/Merge approval is requested or exercised prematurely.

Unresolved: authenticated Objective approval with Agent-inaccessible authority, candidate-specific trusted Decision issuance for future model-generated implementation, real delegated multi-WorkItem Live acceptance, separate clean-machine/desktop OS qualification and official baseline integration. The minimal Windows authorization contract remains in the predecessor record; no userVerification re-probe was made.
