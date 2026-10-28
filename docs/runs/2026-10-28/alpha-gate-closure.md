# Alpha gate closure: focused verification and remaining qualification

- Date: 2026-10-28.
- Baseline: core-p0-1 at 19ddf671410e92fc9d9e4fa423aeb829981c5bfa plus preserved uncommitted implementation.
- Type: H4/Repair failure analysis, focused regression and independent package installation.
- Predecessor: [Alpha release gates](alpha-release-gates.md).
- Numbering: descriptive run; no audit number allocated.

## Failure cause and bounded change

The first failed H4 log records CLAIMED at 04:21:53.685, ATTEMPT_RESERVED at 04:21:53.713 and the subsequent HOST_EXECUTION_ERROR at 04:21:53.474. The execution clock moved backwards by 239 ms. Store heartbeat renews a 30-second lease only within its original validity window; a backwards clock invalidates that lease. The Coordinator checks every 250 ms, cancels children when renewal fails, and persistence refuses completion with `Coordinator lease/revision lost`. No revision mutation is recorded for this safe scenario. The observed rollback and existing invalidation path explain safe refusal; they do not establish an unsafe runtime defect.

The second historical H4 failure has no heartbeat-level row trace: Repair succeeded, the final verification was cancelled and no accepted Evidence was produced. Its precise invalidation cause cannot be reconstructed from the retained coarse events. Do not assert that it necessarily had the same cause. The original failure logs remain unchanged.

The Repair setup failure records reservedAt 1793161809245 and observed time 1793161809181, with monotonic elapsed time approximately 375 ms. Wall time reversed 64 ms before the kill-started scenario reached its marker. Refusal was correct: no valid approval, expiry or consumed budget was extended. This is an unstable execution-clock condition, not evidence that the kill/recovery assertion should be skipped.

No product runtime change was justified. Two test changes preserve existing checks:

- `test/fixtures/host-ipc-probe.py`: bounded read-only SQLite lease/revision tracing under the existing Operator identity, plus wall/monotonic observations. Trace is included on failure before fixture cleanup; it cannot mutate State or grant authority.
- `test/time-safety.test.mjs`: deterministic rollback proof with unchanged revision. Heartbeat invalidates the lease, finish refuses terminal rewrite, and later clock recovery cannot revive that lease or finish the STARTED Attempt. This synthetic test is not a live environment recovery claim.

## Executed checks

| Environment and scope | Actual result |
| --- | --- |
| Linux pinned CI container, complete host-ipc.test.mjs | 2 PASS / 0 FAIL, exit 0; real H4 IPC/Docker verification |
| Linux focused time/Repair/lease/revision/budget/kill-started | 12 PASS / 0 FAIL / 0 SKIP, exit 0 |
| Windows Node 24.14.1, focused Repair/lease/revision/budget/kill-started | 7 PASS / 0 FAIL / 0 SKIP, exit 0 |
| Windows time-safety.test.mjs including new rollback proof | 5 PASS / 0 FAIL, exit 0 |
| Windows supervised-only package lifecycle and existing project Recovery | Exit 0 |

The prior complete Windows Legacy/Core/Native results remain applicable to byte-identical runtime files; they were not rerun. The failed initial Linux full suites remain failed historical executions. Focused passes do not certify Linux desktop Host support or repair the underlying VM clock. No lease, clock guard, timeout, budget or acceptance condition was relaxed. Raw Linux logs/results are retained under `.codefleet/rc-stabilization/closure-evidence`; prior logs remain in `linux-results`.

## Installed artifact and actual acceptance level

The independently installed archive is retained at `.codefleet/rc-stabilization/artifacts/closure/codefleet-0.2.0-alpha.4.tgz`:

- SHA-256: `fd032b3fbf3368fe7840c14817dc05d8f496856f9dd3b62d6e5554b3d35cd35d`.
- 458 packaged files. All 91 source files and the public Skill installer are byte-identical to the old archive.
- Six documentation paths differ: INDEX, progress, REGISTER, the predecessor run record and both READMEs. No removed files. The added predecessor record accounts for 457 becoming 458 entries.
- Original 457-file archive remains unchanged at SHA-256 `f38ee966a9b424329552a7fd602dfc5be08af473f03e4682e8dd8ca4492d0c75`.
- `closure.json` records the full file hashes and comparison. This closure report and its index updates are subsequent qualification records, not contents of that frozen archive.

The existing supervised-only smoke installed the npm tarball in a separate temporary directory, used the public Skill installer, exercised enable/disable/remove/reinstall, help/capabilities without implicit State, recognized the accepted Git HEAD project, preserved its hashes, and recovered the completed Objective with no unresolved effects or remaining work. It then removed the Skill and npm installation. No application test, implementation or completed WorkItem was replayed. STATE and original failure/success Evidence remain preserved.

The earlier fresh Codex session actually discovered the installed Skill and executed help/capabilities. This run reuses that evidence only for unchanged runtime; it did not invoke a new model or represent a CLI smoke as a new Codex session. Actual previous Local implementation/verification and Recovery evidence remains separately identified in the predecessor. Separate clean Windows machine and macOS acceptance: NOT_VERIFIED. Current additional model calls: 0. Historical monetary costs and human elapsed effort: unobserved.

## Release decision and integration boundary

| Status | Decision |
| --- | --- |
| WINDOWS_SUPERVISED_RC_PASS | Verified Windows supervised candidate; focused safety and independent installation passed |
| WINDOWS_ALPHA_RELEASE_READY | Technical Windows-only candidate prepared; official publication is pending Git review/integration approval, not published |
| LINUX_COMPATIBILITY_BLOCKED | Focused failures now pass, but unstable-clock full qualification and desktop Host acceptance are incomplete |
| PROTECTED_UNSATISFIED | Existing Local Objectives are not promoted by protected regression tests |
| PUBLIC_DELEGATION_BLOCKED | Trusted public Objective authentication/issuance remains unsupported |

No common unsafe runtime defect was observed; this is not a proof of the unobserved second H4 failure cause. If release policy requires an entirely green multi-platform full gate or separate clean machine, release remains blocked under that policy. Windows supervised scope must be stated explicitly.

Read-only baseline inspection retains main 4477e4426960af46076d3aa29808201c1c8911a6 and open PR #9 head 19ddf671410e92fc9d9e4fa423aeb829981c5bfa. The detailed integration ordering in the predecessor remains applicable: PR #9 foundation, Core safety/Reservation/Recovery, Native/Host integration, CLI/Skill/packaging, then release tests/records. Shared tasks/CLI/reservation/report hunks require joint review. Proposed follow-up branch `release/codex-supervised-alpha4`, targeting `main`, is not created. Required future permission covers reviewed commits and push/PR on that branch; PR #9 merge and final merge remain separate explicit decisions. No commit, push, PR, merge, reset or branch deletion occurred here.

Autonomous completion still requires authenticated Objective-scoped approval, trusted candidate-specific Decision issuance and actual multi-implementation Host acceptance under that authority. Supervisor-mode readiness does not meet that final goal.
