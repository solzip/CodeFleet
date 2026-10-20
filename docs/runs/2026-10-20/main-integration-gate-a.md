# Main integration: checkpoint approval packet

- Time: 2026-10-20, Asia/Seoul; local audit and validation.
- Target commit: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03`.
- Type: audit / execution / decision preparation; no product implementation.
- Predecessors: [Hybrid checkpoint](hybrid-concurrency-checkpoint.md),
  [candidate inventory](hybrid-checkpoint-inventory.json),
  [Host core guide](../../product-completion/host-core-guide.md).
- Register measured maximum: P0-17 / P1-61; no new defect ID or grade assigned.
- State: **AWAITING_GATE_A**. No product commit, remote write or deletion authorized.

## Observed repository and preservation

The repository remote is `https://github.com/solzip/CodeFleet`. The root worktree
uses `feature/controlled-agent-orchestration`; the development worktree remains
`.codefleet/worktrees/alpha-g0` on `feature/alpha-g0-refresh`. Neither was switched,
reset, cleaned or removed. The existing staging area was empty.

Live `git ls-remote --heads` returned eight heads, all exactly matching the local
remote-tracking references. No fetch was necessary to obtain different objects.
GitHub returned two open draft PRs: [2](https://github.com/solzip/CodeFleet/pull/2)
and [4](https://github.com/solzip/CodeFleet/pull/4). Both target
`alpha/acceptance-baseline`, not main.

The remote main SHA is `c61e9b829b62dd41336a7225bf3b9165136484db`.
Alpha HEAD descends from it with four commits and zero commits behind:

1. `effb42b501c25865b19d955cea828cc5a7eb4b08`: controlled orchestration G1-G6.
2. `9dc429835fd272253f8efac60ac0f76bf7188de5`: proposal-only model interfaces and bounded transport.
3. `81144a6dedb7e73b41b0029d14161943bffdfaeb`: Host IPC / trusted Harness.
4. `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03`: Skills / planning isolation.

All four use the required author and committer identity. Existing commits are
not rewritten. No files are deleted by their net diff against remote main.
G0 records already exist in Alpha: all twelve root-worktree untracked
`docs/implementation/` files match their Alpha counterparts byte for byte.
They require no duplicate import.

Local main and the root worktree branch both point to
`df556af5eade0e07d8252278eb4359862fad9237`, with 122 unique historical commits
and 229 commits behind remote main. All 122 use identities outside the current
publication policy. Do not publish this history or merge it into integration.
Patch comparison found 119 equivalents and three residual patches. Two residual
implementation subjects have corresponding rewritten canonical commits:
workspace snapshot `2fa7f94` and provider transcript `2689497`. The remaining
overview document and later changes are not grounds for automatically copying
old documentation into the current product. Preserve the local branch for review.

## Full branch inventory and proposed disposition

Ahead / behind are measured against the observed remote main. Full SHAs and every
unique commit are in [branch evidence](main-integration-branches.json).

| Ref (remote names prefixed origin/) | HEAD prefix | Ahead / behind | Disposition |
| --- | --- | --- | --- |
| main (local) | df556af5eade | 122 / 229 | KEEP; never delete main; old divergent history |
| feature/controlled-agent-orchestration (local) | df556af5eade | 122 / 229 | REVIEW_REQUIRED; active root worktree |
| feature/alpha-g0-refresh (local) | c3bca1e8b348 | 4 / 0 | KEEP; active development worktree |
| origin/main | c61e9b829b62 | 0 / 0 | KEEP |
| origin/feature/alpha-g0-refresh | effb42b501c2 | 1 / 0 | KEEP; active development |
| origin/alpha/acceptance-baseline | 1351f28c1fea | 1 / 16 | KEEP; open PR base and intentionally failing fixture |
| origin/codefleet/21522e48-d17a-4964-bfac-7232e8ad4f58 | f9fe8e423bd5 | 2 / 16 | KEEP; open draft PR 2 |
| origin/codefleet/cc44ffc7-f6b0-42d4-806d-c7e284dff4fb | 2cd26a3ee06f | 2 / 16 | KEEP; open draft PR 4 |
| origin/docs/product-completion-plan | 5a20e1317cee | 0 / 2 | SAFE_TO_DELETE candidate; approval required |
| origin/feat/java-build-verification | 5a20e1317cee | 0 / 2 | SAFE_TO_DELETE candidate; approval required |
| origin/feat/public-alpha-foundation | 5a20e1317cee | 0 / 2 | SAFE_TO_DELETE candidate; approval required |
| integration/host-native-baseline (new local) | c61e9b829b62 | 0 / 0 | KEEP; integration reference only |

The three deletion candidates share full HEAD
`5a20e1317cee91138bef9e3743c6c52d0f1427ee`, already an ancestor of remote main.
They have no unique commits, open PR or worktree references. Nothing is deleted
in this phase. Recheck those conditions after main integration and before seeking
deletion approval.

The acceptance branches contain a separate intentionally incorrect
`src/alpha-sample.js` plus its test; the two PRs each change addition to subtraction.
These are preserved delivery evidence, not missing CodeFleet product features.
Do not merge them into product main just to make them eligible for deletion.

## Candidate review and commit composition

Before this audit added records, Alpha had 21 tracked modifications, 52 public
untracked candidates and eight local-only untracked files; no staged changes.
The 73 public candidates comprised implementation 14, tests 6, documentation 13,
evidence 38 and configuration 2.

Against the Hybrid inventory: 62 candidates were unchanged, three changed
(both READMEs and INDEX), eight were added, and none were missing. The additions
are subsequent Host acceptance preparation evidence and the inventory itself.
Existing product source and test bytes match that checkpoint.
These are arrival counts before the publication-format cleanup below, not a
claim that the final normalized log hashes still equal the historical manifest.

The [exact allowlist and hashes](main-integration-inventory.json) includes this
approval packet and its evidence: 84 files (20 / 1 / 63 in the groups below).
Never use `git add .`. Proposed commits:

1. `feat(hosts): separate host preparation and verification capabilities`:
   fourteen source files, five corresponding tests, and package.json. Reuses
   Controller, Judge, Workflow, Store, Operator, Skill installer and CLI.
2. `test(hybrid): synchronize concurrent verifier observations`:
   only `test/hybrid.test.mjs`. The rendezvous removes the accidental 30ms overlap
   assumption and retains the parallel-launch assertion and serial negative
   control. It does not claim a Scheduler defect was fixed.
3. `docs: preserve host-native qualification and integration evidence`:
   documentation, historical passing and failing logs, manifests, this audit,
   narrow local ignore rules, and README/INDEX counts together. Keeping the
   linked records and measured counters in one commit avoids broken intermediate
   document claims.

Gate A approval applies only to the exact manifest and these local commits.
Immediately before committing, recheck bytes, staged paths/content, whitespace,
identity `sol <solarchive.dev@gmail.com>`, and absence of excluded artifacts.
Any changed candidate requires review rather than silently extending approval.
Current staging and final staged-content checks remain NOT_RUN.

Excluded: all `.trials/` raw logs, diagnostic copies, fixture repository and
state; `.codefleet/` local configuration/runtime/host homes; SQLite/WAL/SHM;
authentication files; global Skills; `.claude/` root settings; local root duplicate
documents. No excluded credential/runtime file was opened for publication review.
The fixture's earlier authorized initial commit remains an independent repository.

## Public suitability and security review

[Security evidence](main-integration-security.json) records a bounded scan of
73 initial working candidates and 248 changed blobs across all four outgoing
commits. Candidate findings: zero. Sixteen historical pattern hits were reviewed:
one redaction-regex source line, thirteen already anonymized profile paths in
preserved logs, and two explicitly public disposable loopback TLS test keys.
Those keys are test inputs documented in `test/fixtures/model-tls/README.txt`,
not user credentials. The existing 22,042-byte UTF-16 G0 log was decoded for
inspection and preserved; no actual username or user-profile path was found.
No scanned file exceeded 2 MiB. This is not a guarantee against every possible
secret encoding.

The source/test diff review checked authority separation, new-envelope fail-closed
behavior, pinned policy persistence, current Operator checks before reservation,
dependency blocking, independent-item progress, and final protected gates.
Local evidence remains LOCAL_EXECUTED and cannot become protected VERIFIED.
Container verification retains its original implementation and controls.
Host Sandbox remains NOT_VERIFIED. The default Skill explicitly distinguishes
Docker-free preparation from protected execution and strict H6 planning.
No Legacy TypeScript code or existing protected test was removed.

New public logs replace real worktree and user-home paths. Raw output remains
ignored. A final manifest scan includes the new public records; findings and
scope are recorded with their actual validation results.
Checking added files against an empty file found whitespace problems in thirty
untracked logs that the ordinary tracked-only diff check did not cover.
The original bytes were retained under ignored
`.trials/host-core-checkpoint/main-integration-original-logs/`; public copies
normalize line endings and remove trailing whitespace/extra final blank lines.
Every non-whitespace character is unchanged. Before/after SHA-256 mappings are
in the security evidence; historical manifests retain their original hashes.
No passing/failing result, count, assertion or diagnostic text was removed.

## Checks actually executed

[Results](main-integration-results.json), [full log](main-integration-full.log),
[Alpha Doctor](main-integration-doctor.log),
[Host Doctor](main-integration-host-doctor.log).

| Check | Result / scope |
| --- | --- |
| npm.cmd test | exit 0; Legacy 324 + Alpha 212 + Host Core 12 = 548 passed; failed/skipped 0 |
| Docker / Java | Real local Docker 24.0.6, existing pinned Maven/Operator/IPC images, JDK 21 parser; no image download or model call |
| Legacy / Alpha | Existing suites retained; SQLite, cancellation, lease, recovery and protected Node/Java tests executed |
| G3 / G4 / G5 | Contract, DAG, collaboration, Hybrid concurrency and final integration regressions executed |
| H3 / H4 / H6 | Existing Linux container process/UID/IPC/isolation checks executed; not real Host Live |
| Host Skills | Existing Codex/Claude installation/receipt/compatibility tests; actual session invocation NOT_RUN |
| Docker-free path | Actual CLI test with Docker absent from PATH; plan/review/prepare/DAG/request work, protected run blocks before attempts |
| Local evidence | Real local Node process plus labelled fake-backend negatives; Local success rejected by protected Judge |
| Approval/capability | Forged fields rejected; blocked descendants do not run; independent item proceeds; incomplete workflow cannot complete |
| Alpha Doctor --no-auth | exit 2: executable and isolated verifier checks passed, authentication NOT_CHECKED; NOT full Alpha readiness |
| Host Doctor --probe-container | exit 0: core AVAILABLE, Local CONDITIONAL, Container AVAILABLE, Host Sandbox NOT_VERIFIED, Host Live NOT_RUN |
| Posttest with full suite | coverage/link/citation/fact commands exit 0; zero broken living-doc citations, 13 historical suspect citations; 42 facts / 0 mismatches, 539 unchecked numbers |
| git diff --check | exit 0 for tracked worktree changes; final staged check awaits Gate A |
| Added-file whitespace | Each public untracked file checked with `git diff --no-index --check -- NUL FILE`; no diagnostics after normalization. Exit 1 means an added-file difference, not a test failure; diagnostic exit 3 was resolved |

No failure was relabelled PASS. Historical failed runs remain historical evidence.
The first document-only recheck inside the managed sandbox exited 1 because
Git ownership protection prevented tracked-file enumeration. A preceding helper
also used the worktree-relative path twice and stopped before editing any file.
The path was corrected; the Git-dependent check was rerun in the approved native
context. The [failed sandbox log](main-integration-docs-sandbox-failed.log)
is preserved separately; it is not a product-test failure or a passing check.
The native recheck then caught one unanchored number added to the INDEX summary
(540 unchecked numbers against the existing 539 baseline). The duplicate number
was removed from the summary while retaining the measured count in this record.
The baseline and checker were not relaxed. The
[fact-check failure](main-integration-docs-facts-failed.log) is also preserved.
The final document-only recording check is recorded separately in
[document log](main-integration-docs.log). Full npm tests need not be repeated
solely because a record was added; changed runtime or test bytes require rerun.

## Integration and subsequent gates

Created only the local `integration/host-native-baseline` reference at the
observed remote main; no checkout, merge or commit. No conflicts can arise from
fast-forwarding that unchanged base to current Alpha ancestry. This says nothing
about remote changes after this observation.

After Gate A, create the approved commits in Alpha. Then use a separate clean
integration worktree and fast-forward the integration branch to that exact
approved tip. Preserve all existing commits instead of cherry-picking duplicates
or merging the stale local main. Re-run the integrated-tree checks, refresh remote
heads, and report the exact final HEAD and `origin/main...integration` diff.
If remote main advanced, inspect and resolve conflicts with evidence before
seeking Gate B. Stop main publication on failed required checks.

Gate B must name the final reviewed SHA, public file set, checks and risk, and
authorize publishing an integration branch/PR and merging into main. PR integration
should preserve ancestry rather than squashing away the reviewed commits.
No PR, push or main merge occurs under Gate A.

Deletion approval comes after integration and must repeat each exact branch name,
HEAD, ancestry and PR/worktree check. Main and active worktrees are never deleted.
For subsequent development, create a new branch/worktree from refreshed
`origin/main`; leave the divergent local main and both existing worktrees intact
until a separately reviewed transition is chosen.

## Conclusion

The tested Alpha candidate is ready for a bounded local-commit approval request.
Main is unchanged; no integration commit/PR or branch deletion exists yet.
Autonomous Execution. Controlled Process. Verified Results.

## Next action

Obtain Gate A approval for the manifest and three local commits; recheck/stage only
that allowlist. Gate B and deletion approval remain separate.

## Unresolved

Final staged check and committed integration-tree validation; Gate A/B/deletion
approvals; old divergent local history review; real Host permission/network/model
conditions and Host Live authorization. Automated decision-debt tooling was
unavailable, so no plugin preflight verdict is claimed. Current instructions,
manifests and actual diffs were reviewed directly; no G0-H8 audit was repeated.
