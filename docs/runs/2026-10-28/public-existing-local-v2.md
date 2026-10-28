# Existing-project supervised Codex Local acceptance v2

- Date: 2026-10-28.
- Baseline: core-p0-1 detached at `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`; preexisting uncommitted implementation preserved, not GitHub main.
- Type: bounded Core implementation, internal regression and actual Windows Native supervised acceptance.
- Predecessor: [existing-project acceptance](public-existing-local.md).
- Numbering: descriptive run, no audit number allocated.

## Observed product outcome

A separate Todo copy with a real HEAD completed two dependent implementation WorkItems:
create `src/summary.js`, then modify `src/calendar.mjs` to expose per-day completion counts.
The copy's baseline commit was separately authorized and created only in the acceptance repository.
Original Todo data/source, older acceptance repositories and Evidence were preserved.
Tracked dirty developer notes and an untracked note survived. All original acceptance tests
and the new summary acceptance test were frozen before the model invocation.

One fresh Codex session received a literal `$codefleet` goal, read the installed
`.agents/skills/codefleet/SKILL.md` and actual sources/tests, then generated complete
contents for the two files. JSONL records the successful Skill read. This verifies an
explicit Skill invocation in a fresh session, not a separate automatic-discovery UI event.
The model used read-only sandboxing and did not apply files, run tests or grant approvals.
The supervising Host applied the exact proposals via the installed public CLI with
explicit user-approved Local scope. This is a supervised two-process experience,
not uninterrupted autonomous execution by the child session.

Actual integrated verification: **11 PASS / 0 FAIL / 0 SKIP, exit 0**.
The eight existing tests and three new feature tests passed. Objective COMPLETE_LOCAL;
Protected UNSATISFIED. Separate CLI processes recovered after each materialization
and after verification, with no unresolved effects or duplicate execution.
This proves process recovery; Host context compaction recovery remains unverified.
No application failure occurred, so Live Repair was not exercised or fabricated.

## Contract and implementation

ExistingLocalDraft version 2 uses a distinct policy hash. Version 1's original existing
ESM-module contract remains valid and is not retroactively expanded.
Version 2 admits declared bounded text sources with separate creation and replacement
WorkItems. Creates require explicit null baseSha256; replacements require the recorded
base digest. Mixing creates and replacements in a single WorkItem is currently rejected.
Existing tests remain immutable baseline inputs; adding acceptance tests after planning
requires a separately reviewed new contract.

Changes reuse the current Draft/Validator/DAG, createFiles/modifyFiles, Fileset review,
Lease, Reservation, Decision, SQLite, Recovery and Local Judge. Repository preflight now
compares the complete current inventory against recorded digests, including approved new
paths, while preserving baseline file modes and unrelated Git status.
No replacement engine, store, signer, credential copy or persistent approval service was added.

Changed product areas: `src/intent/bootstrap.mjs`, `src/workflow/bootstrap.mjs`,
`src/product/tasks.mjs`, `src/product/continuation.mjs`, `src/hosts/install.mjs`.
Related regression: `test/native-local.test.mjs`; contract:
[bounded continuation](../../implementation/bounded-continuation.md).

## Live bindings

| Record | Value |
| --- | --- |
| Acceptance label | public-head-01 |
| Repository HEAD | `4a3256640439f1e79675ae6d0623263b108d0b7b` |
| Codex session | `01a1805a-fe24-7322-9a17-9ec9922135ea` |
| Task | `task-99a19937-cd46-417d-82da-c78f0f1cf894` |
| Workflow | `434fb09be7058dfc34f7594c677151a15a3a346c6c1a80877cc3634e22e05e3c` |
| Final revision | 9; verification bound to revision 8 |
| Candidate | `98cc082e486c9b10683b0b2dca3aa88bfad68bacb736fc1f98e933037fcb047f` |
| Decision | `e3ea9486-83a0-4772-8fa4-e4e21020bad7` |
| Attempt | `bootstrap-attempt-d29851ed-2220-4fd1-9c0a-abfa66be6c42` |
| Evidence | `857f33d89900107c18ef475ef502582a63a3b8e9aba75fcb09ca372506a991d9` |
| Command hash | `c07562bdca27ac996fd89ef1e9813a0c5bf9006e3a46fe5d156b1c24111a22d9` |
| Approved scope digest | `142b2151ef3ed005e1a59af60edc3dd1612acc140886ceecef1acea76552b5e2` |

Command: `node --test --test-reporter=tap test/todo.test.mjs test/calendar.test.mjs test/server.test.mjs test/summary.test.mjs`.
One Attempt, 30-second reservation, consumed Decision remaining executions zero, no retry.
Execution launcher elapsed 14,355 ms; this excludes preparation, model and human time.
Model JSONL reports input_tokens 63590, cached_input_tokens 40192, output_tokens 552,
reasoning_output_tokens 43. Dollar cost and total human time were not observed.

Raw local Evidence: `public-head-01/evidence/model-execution.json`, `post-model-integrity.json`,
`execution-request.json`, `live-01-*` through `live-16-*`, and `live-summary.json`.
Model-phase before/after candidate matched; application-phase inventory matched only
the two approved changes. Evidence/state remain outside the project.

## Verification and failures

Windows / PowerShell / Node 24.14.1; no cross-platform acceptance claim.
Existing Local selected regression: 12 PASS, exit 0, including generated-source creation,
dependent replacement, review/candidate/expiry/revision rejection and signed Operator exclusion.
Broader Bootstrap, Native Local, Recovery, Host install and Local acceptance:
134 PASS, 0 FAIL, 1 optional Protected skip, exit 0;
raw `windows-mxc-01/evidence/regression-1793154807137.{json,log}`.
The initial command incorrectly named repair.test.mjs; it did not establish Repair coverage.
The actual repair-loop suite plus Reservation and Continuation subsequently passed
109 tests, 0 failures, exit 0; raw windows-mxc-01/evidence/regression-1793155390126.{json,log}.
Final link, declared-fact and citation checks exited 0; no missing links or fact mismatches.
Historical citation warnings remain 65 unresolved and 13 suspect records. git diff --check passed.

Acceptance preparation encountered a log filename collision and an incorrect objective-draft
CLI route. The persisted revision remained 2, with no Fileset materialization or verification.
After confirming those effects, the script used the existing host codex draft/prepare route.
Old artifacts were retained; no model or test was automatically retried.
A sandbox-context Git status read hit the already-known ownership boundary; the ordinary-user
read succeeded without configuration, ownership or policy changes.

## Authority and remaining release gates

PUBLIC_DELEGATION_BLOCKED remains. The user authorized the concrete execution scope through
Host command approval; Local CLI acknowledgement is explicit same-user trust, not independent
operator authentication. Host command consent is not a reusable authenticated Objective grant.
No agent signer, mock authority or public autonomous-success claim was introduced.
Official non-interactive session interface: [Codex documentation](https://learn.chatgpt.com/docs/non-interactive-mode).

Three acceptance-related approval scopes were presented: isolated baseline/model execution,
contract preparation, exact Filesets plus one test execution. Preparation correction commands
used the same preparation permission. Internal-regression/Host tool approvals are additional.
Actual UI click count and human elapsed time are unobserved; do not claim one-click autonomy.

Conclusion: HEAD-bearing Git, new text source, existing source replacement, actual fresh-session
model proposals and supervised Local acceptance are verified. Public autonomous delegation is not.
Next: integrate an independently authenticated approval source if available, and measure an
end-user Skill session controlling the complete supervised loop without the acceptance launcher.
Unresolved: mixed-operation Filesets, tests added after planning, whole-session recovery,
cross-platform Live, Protected gates and full distribution regression/review.
Core changes remain uncommitted; only the expressly approved isolated baseline commit was made.
