# Windows MXC product completion sprint

- Date: 2026-10-27. Type: implementation and execution, pending exact Fileset approval.
- Baseline: `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, dirty detached `core-p0-1`.
- Predecessor: [Windows Native path](windows-native-mxc-path.md).
- Contracts: [Local-only acceptance](../../implementation/local-only-acceptance.md),
  [bounded continuation](../../implementation/bounded-continuation.md),
  [Objective recovery](../../implementation/objective-recovery.md).
- Existing issue maxima: P0-17 / P1-61, measured in REGISTER; no new Legacy ID.
- Environment: Windows Native, PowerShell, Node v24.14.1, explicit Codex MXC.

## Actual product state

The prior MXC regression now passes with real non-Git temporary fixtures outside
the source repository and a real junction provisioned before sandbox startup.
The materializer still rejects writing through that junction. No test is deleted,
skipped, mocked or weakened. The non-Git fixture explicitly detects an invalid
parent-repository assumption. Junction creation is a test setup requirement,
not a normal product requirement.

New Tasks can explicitly select Local-only acceptance. Existing contracts retain
Protected requirements. Current candidate integrity, nonempty all-pass execution,
explicit criterion test paths and transitive implementation dependencies are
required for Local completion. Existing reservation and Recovery mechanisms are
reused. There is no public autonomous approval issuer.

The current Codex session generated a Todo + Calendar implementation, rather than
using an existing fixture implementation or a nested model invocation. It includes
Todo CRUD, title normalization, completion, date validation, localStorage, a monthly
grid, DOM UI and a dependency-free loopback static server. These are currently
**proposals**, not applied or accepted application functionality.

## Acceptance Workspace and persisted state

The user-selected `%LOCALAPPDATA%/CodeFleetAcceptance/windows-mxc-01` is fixed.
It was absent, normalized and checked against the source path before creating
`project`, `state`, and `evidence`. A fresh `git init` succeeded without ownership
changes or Git configuration overrides. Subsequent acceptance commands use the
official MXC workspace profile with managed requirements. Normal Host reads had
an ownership refusal; no repeated compatibility probe or downgrade was performed.

Task: `task-f669a4d3-ce63-4304-8bc4-25d015fb4aff`, revision 7.
Workflow: `6c2fb1f8a6e1e605a247b78138da3be4d12583a2ac7f4fb29d02fb8581d4f9e9`.
The validated DAG is requirements → setup → data → calendar → integrated.
`data` and `calendar` are distinct implementation WorkItems with distinct owned
source paths. Acceptance is LOCAL_ONLY, with three Attempts and 120 seconds of
reserved verification time; no execution permission is inferred from those limits.

`evidence/prepared.json`, `draft.json`, and the three `*-proposal.json` files
preserve the actual plan, code, file hashes and approval requests. Exact Fileset
approval was requested from the user. At this checkpoint there is no response,
no application materialization and no application test Attempt. The reviewable
application command is staged but must not run before approval.

## Validation so far

| Executed scope | Result |
| --- | --- |
| MXC `test/host-core.test.mjs test/bootstrap.test.mjs` | 61 pass, zero failures/skips, exit 0 |
| MXC Local acceptance, Native Local, Continuation, development and Recovery suites | 92 pass, zero failures/skips, exit 0 |
| `npm.cmd run pretest` in ordinary Host | exit 0 |
| `npm.cmd run test:legacy` in ordinary Host | 324 pass, zero failures/skips, exit 0 |
| Expanded MXC Bootstrap/Repair/Reservation/Host suites | 158 total: 155 pass, 2 fail, 1 existing optional Docker skip; exit 1 |
| First targeted correction check | 37 total: 34 pass, 2 fail, 1 existing optional Docker skip; exit 1 |
| Final MXC Bootstrap verification and Local acceptance check | 18 pass, zero failures/skips, exit 0 |
| Final MXC `npm.cmd run posttest` | exit 0; coverage, links, citations and facts passed; historical citation warnings retained |
| MXC `git diff --check` | exit 0 |
| Generated application module syntax checks | exit 0; no application execution or acceptance claim |

The expanded failures were an old expectation of MATERIALIZE after repair conflict
and a second real-junction setup requirement in Host installer tests. Recovery's
existing contract requires RECONCILE after uncertain/conflicting effects. The test
now also proves public replay is refused and user bytes are preserved. Installer
redirection is tested against another preprovisioned real junction; nothing is
written through it. Its targeted rerun passed. The first correction accidentally
changed the wrong identical assertion; this introduced one temporary test failure
and left the intended failure unresolved. Both were corrected at their exact
contexts and the final suite passed. These failed runs remain in the evidence.

The ordinary-Host posttest failed at Git ownership (exit 1), then MXC posttest
found two stale README document-count declarations (exit 1). The declarations
were updated to the measured count from the newly added run record, without
changing coverage or anchor baselines. The final posttest exited zero.

The normal Host installer was initially addressed relative to the wrong working
directory and exited 1 before any write. The absolute installer path then ran
inside MXC and installed `$codefleet` at the acceptance root, returning
INSTALLED_OFFLINE / liveValidation NOT_RUN. The application repository itself
was not changed. Installation is not actual Skill invocation evidence.

Local raw MXC logs and individual exit-code records are in the acceptance
Workspace's `evidence/regression-*.log` and `regression-*.json`. The temporary
acceptance driver and generated proposals are under ignored
`.codefleet/windows-mxc-sprint/` in the development worktree, not shipped fixtures.

This sprint changed `src/product/tasks.mjs`, `cli.mjs`, `report.mjs`,
`continuation.mjs`, `native-local.mjs`, `recovery.mjs` and added
`local-acceptance.mjs`. It updated the generated Host Skill, the affected Bootstrap
and Host tests, the reservation test fixture, the Host Core suite command and
current documentation. Pre-existing dirty changes remain. GitHub main was not
fetched or changed; none of these local changes has been published.

The bounded decision-debt scan covered the four user-selected product documents.
It flagged their existing unfinished/verification language. Original context and
the current sprint instruction preserve those limitations; historical Protected
and Live success were not assumed. This is not certification of the full corpus.

## Intervention and limits

Host execution approvals and exact CodeFleet Fileset approvals are separate.
The UI does not expose how many Host approvals were manual versus saved-rule
decisions. Human preparation/review time and dollar cost remain UNKNOWN.
No measured cost is reported as zero. No extra model subprocess was launched.

Actual browser interaction, application E2E, application Repair and new-objective
Recovery are NOT_RUN. Existing offline repair/recovery evidence is not Live
acceptance of this application. Protected verification, macOS/Linux execution,
unattended approval delegation and product release remain unverified. Prior
P0-5A/P0-B/P0-C evidence and PR 9 are preserved; no source commit/push/PR/merge.

## Conclusion

MXC regression failures are resolved at their actual test-environment boundaries.
Local-only completion is implemented with negative and actual execution checks.
Todo + Calendar remains a reviewable implementation awaiting exact application approval.

## Next work

After receiving exact approval, apply the Filesets in DAG order, review the resulting exact Local command,
execute it once, inspect Evidence/Judge, and recover from a fresh process without
replaying completed effects. The prepared command is `apply-reviewed.mjs` with
the three hashes in `evidence/prepared.json`; it must not execute without the
pending user approval. It will create the actual candidate-bound Local review,
not approve or execute that review automatically.

## Unresolved

Pending exact Fileset approval; no application acceptance or release claim.
