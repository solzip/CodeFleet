# PR CI environment and execution contract

- Date: 2026-10-21 (Asia/Seoul)
- Target commit: d993e0feed55f4880118ea37df8170915d09eb48; local CI correction on integration/host-native-baseline.
- Type: correction / execution
- Predecessor: [Host baseline readiness](../2026-10-20/host-native-baseline-readiness.md).
- Measured finding IDs before work: P0 maximum 17; P1 maximum 61. No new finding ID assigned.
- GitHub run: https://github.com/solzip/CodeFleet/actions/runs/39517999218 (PR #6).

## Confirmed failure and scope

The original linux-alpha and windows Alpha stages each reported 212 tests,
201 passed, 5 failed, 6 skipped, process exit 1. Windows Legacy passed 324.
Both jobs invoked Alpha before providing its required Docker environment;
the original Linux image pull was after the failed command.
Evidence: original `.github/workflows/alpha.yml:21` and
`.github/workflows/alpha.yml:49`; mandatory assertions in
`test/host-ipc.test.mjs:15`, `test/host-planning.test.mjs:96`,
`test/operator-runtime.test.mjs:84` and `test/operator.test.mjs:160`.
The five failures cover H4, H6, H3, independent Docker WorkItem execution,
and H2 Fake Agent isolation. Merely exporting a flag cannot satisfy them:
they require real immutable images and observed isolation results.

Only CI configuration, CI fixture preparation/execution and one stale injected audit
fixture change. No product source, unit-test file, assertion, Judge, policy,
Docker security option or protected verification success condition changes.
The additional README/index edits only maintain required record counts.

## Platform execution contract

| Job | Required commands and scope | Explicit boundary |
| --- | --- | --- |
| windows | pretest; test:legacy; test:host-core; test:host; posttest; package installation smoke | Native Legacy and Docker-free Host functionality. Host suite's existing Docker case is skipped here, not passed. |
| linux-alpha | prepare-alpha-ci; test-alpha-ci (complete Alpha list, H6 first, then serial files); test:host-core; verifier smoke; quality audit; final review; Docker quality audit | All Alpha files, no name filters; Node/Maven protected verification, Contract/DAG/Hybrid, approvals/Lease/Recovery, H2/H3/H4/H6. |

Both jobs must pass before integration. Legacy retains its existing Windows CI
assignment. Linux isolation is not certified by the Windows result. Host Live
and model transport qualification remain NOT_RUN.

Linux checkout now fetches full history, needed by history-sensitive checks.
JDK 21 is explicitly provisioned with the official setup-java v4 commit.
Preparation uses the pinned Node/Python fixture images, existing Operator and
Host IPC Dockerfiles, and the existing production prepareJava implementation
with a disposable Git repository containing only examples/java-maven.
Only the two Dockerfiles enter the Operator/IPC build context. Public image,
apt and Maven dependency downloads happen during preparation. Candidate tests
continue to run offline with unchanged read-only mounts, dropped capabilities,
resource ceilings, UID separation and no-new-privileges.

The preparer refuses a non-Linux/unavailable Docker engine and only exports
CODEFLEET_TEST_DOCKER=1 plus immutable Operator, IPC and Maven image IDs after
all preparation succeeds. Actual capabilities are proven by the unchanged
mandatory tests; failure stays fatal. Prepared images and runtime state are
local artifacts, not committed. The job timeout includes cold image builds. Linux also prepends a dedicated
Git-only symlink directory, so the existing PATH-restriction test really excludes
Docker without changing its assertions. Normal CI PATH still retains Docker.

The injected-controller branch of alpha-quality-audit previously omitted the
mandatory HARNESS_EXECUTED field from its synthetic Harness fixture. It exited
2 without entering recovery (verificationCalls=0). Adding the field matches
`test/alpha.test.mjs:19`; no defect predicate changes. After correction the
provider error observes one unknown-cost attempt, and recovery completes with
one verification call. These are injected results, not real protected evidence.
The Docker branch remains a separate actual verifier audit. Missing-authority
and provider-only rejection tests remain unchanged and pass in the full suite.

## Local validation

Host: Windows, Node v24.14.1, JDK 21, Docker Linux engine. Authentication-free
Docker configuration; no Host/model call or remote mutation.

| Command / observation | Actual result |
| --- | --- |
| node scripts/prepare-alpha-ci.mjs with a local env-file | Exit 0; real Operator/IPC builds and public Maven cache preparation |
| Same preparer with unavailable Docker endpoint | Exit 1; no environment file exported (expected refusal) |
| npm test with prepared images and JDK | Exit 0; Legacy 324, Alpha 212, Host Core 12 passed; total 548, failures 0, skipped 0; posttest passed |
| Windows pretest / test:legacy / test:host-core / test:host / posttest | Each exit 0; 354 passed, 0 failed, 1 skipped across 355 selected tests |
| Package smoke in an external temporary directory | Exit 0; installed codefleet-alpha --help succeeds |
| node scripts/alpha-verifier-smoke.mjs | Exit 0; real Docker boundary, failing implementation and timeout checks |
| node scripts/alpha-quality-audit.mjs | Initial exit 2; corrected injected fixture exit 0 |
| node scripts/alpha-final-review.mjs | Exit 0; local/mock remote reconciliation checks |
| node scripts/alpha-quality-audit.mjs --docker | Exit 0; actual Docker attacks and correct-repair control |
| node src/alpha/cli.mjs doctor --no-auth | Exit 2; authentication NOT_CHECKED, full Alpha readiness not established; not a full success |
| actionlint v1.7.12 (official checksum verified) | Exit 0; shellcheck/pyflakes integrations disabled/unavailable |
| Verification Backend tests with trailing --test-concurrency=1 | Exit 0; all 8 passed, including real Local tests and protected promotion rejection |

A separate disposable Linux container used the unchanged target commit's
source/tests, Node v24.21.0 from the pinned verifier image, JDK 21, Git, Docker
socket and a dedicated volume for daemon-visible paths. This is not the GitHub
Ubuntu runner or an exact Node v24.14.1 reproduction.

- Exploratory Linux npm test: exit 1, Legacy 306 passed, 17 failed, 1 skipped.
  EPIPE and platform-sensitive legacy behaviors remain unresolved; no Legacy
  test is changed or deleted. The normal Linux job previously ran Alpha only.
- Parallel Linux Alpha: exit 1, 211 passed, 1 failed, 0 skipped. H6 fork raised
  BlockingIOError (EAGAIN) under its process ceiling. Fixed UID resource
  accounting across concurrent containers is the suspected source.
- Serial Linux Alpha without reordering: exit 1, 211 passed, 1 failed, 0 skipped;
  H6 still failed. Serialization alone did not resolve the observed interference.
- Standalone H6 in a fresh Linux container: exit 0, 7 passed. Windows H6
  recheck with the same image also passed 7, exit 0.
- H6-first Linux Alpha: both groups exited 0, 7 + 205 passed, 0 skipped.
  The following Host Core step initially failed (11 passed, 1 failed): Git and
  Docker shared /usr/bin, violating the test's Git-only PATH prerequisite.
  A dedicated directory containing only a Git symlink fixed the environment;
  unchanged Host Core then passed all 12, exit 0.
- Final combined Linux sequence: exit 0. H6 7 + remaining Alpha 205 + Host Core
  12 passed (224 total), failures 0, skipped 0. All four existing smoke/audit
  commands also completed with exit 0 in the same Linux sequence.
  The CI runner reads the unchanged package.json Alpha list, rejects duplicate
  or unexpected arguments, runs H6 first, then all remaining files serially.
  No file is omitted or assertion changed; Hybrid's internal concurrency stays.
  The exact kernel resource lifetime behind the order dependence is not proven.
- Four synthetic CI-runner checks passed: all files run in order, failure of
  the first group stops execution, a later failure remains nonzero, and an
  unexpected skip argument is rejected. These are not protected evidence.

Local reproduction setup also encountered a Dockerfile image-ID reference
error and CRLF shell script before tests; corrected only temporary artifacts.
An initial package smoke directory nested inside the repository made npm select
the ancestor package. Its package.json/package-lock changes were immediately
reverted to the original bytes; final install used an external temporary path.
PowerShell stderr handling was distinguished from native exit codes. Failed
attempt logs are retained locally; none is reclassified as a successful run.

Public review covers exactly eight files: the workflow, prepare-alpha-ci,
test-alpha-ci, alpha-quality-audit, this run record, docs/INDEX and both README
record counters. Product src/, test/ and package.json have no diff. Content and
added-line review found no credentials, private paths or runtime artifacts in
these candidates. Raw logs, environment image IDs, checksums and failures are retained in ignored
`.trials/host-core-checkpoint/gate-b/ci-fix/`. They are not uploaded because raw
local logs can contain machine paths. Public evidence is this sanitized record.

## Conclusion

CI prepares mandatory verification dependencies, explicit platform scopes and the observed H6-first execution order.
Local results do not establish a green GitHub run or Host Live acceptance.
No remote push, PR edit, merge or branch deletion was performed.

## Next action

Request separate authorization to push the resulting local correction commit
to origin/integration/host-native-baseline for PR #6. Require both GitHub jobs
and actual protected test observations before any separate merge approval.

## Unresolved

GitHub rerun is NOT_RUN pending push approval. Native Ubuntu runner execution (including its shared UID resource budget),
cold public dependency availability, and the Linux Legacy failures remain
unverified/unresolved. Host Live remains NOT_RUN. No authentication or model
capability approval is implied by this change.
