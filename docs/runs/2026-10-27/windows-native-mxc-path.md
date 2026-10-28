# Windows Native execution compatibility

- Date: 2026-10-27. Type: implementation, bounded regression, Host environment observation.
- Baseline: `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, existing dirty detached `core-p0-1` worktree; prior changes preserved.
- Predecessor: [P0-C blocked application](codex-host-session2-proposal.md).
- Current contracts: [Core guide](../../product-completion/host-core-guide.md), [Objective recovery](../../implementation/objective-recovery.md).
- Existing issue maxima: P0-17 / P1-61; no new Legacy ID. P0-D development deferred.
- Environment: Windows / PowerShell / Node v24.14.1 / Codex CLI 0.162.1.

## Outcome and boundaries

The official MXC compatibility command was executed exactly once and returned
MXC_OK, exit 0. Explicit MXC also ran CodeFleet's repository-specific doctor against
the existing ordinary-user-owned worktree: AVAILABLE, EXISTING_SOURCE, no Git error,
exit 0. The observation proves native Git reading in that execution context; it
does not prove implementation, verification, recovery or sandbox enforcement for
every operation. No unelevated fallback or saved Codex configuration change occurred.

The previous use_default requests did not establish the identity of the launched
process. A sandbox selection, a Host tool approval, the actual process identity
and Git ownership acceptance are different facts. CodeFleet had directed both
ownership refusal and process-spawn refusal toward command escalation. That advice
could send the next command through a different identity without resolving the
repository compatibility problem. Existing Git ownership checks are retained.

## Product changes

- `src/intent/probe.mjs`: ownership refusal now advises explicit environment review,
  one official compatibility check and no automatic escalation/retry/fallback.
  Process-spawn refusal keeps its separate command-specific Host permission path.
- `src/hosts/cli.mjs`: ownership reports BLOCKED_ENVIRONMENT rather than requesting
  an ownership-fixing approval. Existing grants, task history and effects are untouched.
  `doctor --repository PATH` validates arguments and uses the existing Native Probe.
- `src/hosts/doctor.mjs`: repository readiness is distinct from runtime readiness.
  A failed probe blocks planning/workflow readiness. It reports the current process,
  grants no execution and makes no identity or sandbox attestation. No Store is opened.
- `src/hosts/install.mjs`: generated Codex Skill documents the explicit official
  MXC prefix for scoped commands, preflight before expiring approval, same-path
  execution and mandatory rechecks after a context change. Existing immutable
  installations are not silently rewritten.
- `test/host-core.test.mjs` and `test/bootstrap.test.mjs`: cover unchanged authority,
  preserved blocked tasks, different recovery for ownership/spawn failures, actual
  Git doctor success/non-root failure, invalid options and no sandbox self-selection.

No second scheduler, execution engine, service, account or State database was added.
The normal Materialize/Verification/Reservation fences remain authoritative.
Readiness does not issue a Fileset approval or verification Decision.

## Measured execution

| Scope | Result |
| --- | --- |
| Official compatibility command | one invocation, MXC_OK, exit 0 |
| Explicit MXC repository doctor | exit 0, PID 53112, current user-owned worktree; no State/source writes |
| Initial MXC host-core/bootstrap regression | exit 1, 61 tests: 37 pass, 24 fail, zero skips |
| Failure evidence | Git fixture HEAD/symref writes denied; two cases also failed atomic artifact rename in MXC virtual TEMP |
| Same regression in ordinary Host | exit 0, 61/61, zero skips; not MXC Live acceptance |
| Final Host Core negative-case check | exit 0, 6/6 after adding blocked repository readiness assertion |
| MXC regression with workspace-local temporary fixtures | exit 1, 58/61 pass, 3 fail, zero skips; two non-Git fixture assumptions under a parent repository and one denied symlink creation |
| Documentation checks in explicit MXC | links, citations, declared facts and git diff --check all exit 0; historical citation warnings retained |

The failed MXC suite is retained, not relabeled as a pass. A bounded follow-up
placed test-only temporary fixtures inside the already writable workspace instead
of the virtual TEMP directory. This changes neither sandbox policy nor product
verification criteria. Its separate result is recorded in local
`regression-mxc-workspace.log`. No tests were removed, skipped or weakened.
Workspace-local State artifact writes and ordinary Bootstrap/materialization
regression cases passed there; this is offline evidence, not a real model run.

Local raw observations and the reviewable acceptance request are under
`.codefleet/windows-native-01/`. The request proposes a fresh `user-project` and
`user-state` inside that workspace; neither is the old P0-C task or fixture.
The user must approve project creation/Git initialization and model usage before
that new Live path starts. The packet specifies fixed file contents/hashes,
gpt-6-astra/medium, one proposal-only call, 300 seconds, 2 MiB, no retry/resume and
UNKNOWN dollar/internal request usage. Actual model output then requires exact
Fileset approval; tests require a fresh candidate-bound Local review.

## Official boundary and user intervention

Source: [OpenAI Windows sandbox documentation](https://learn.chatgpt.com/docs/windows/windows-sandbox),
read on this date. Explicit MXC is selected per command with managed requirements;
compatibility does not require changing saved settings. Unelevated has weaker
network isolation and lacks denied-read-path support, so it remains unselected.
The Host launches the official sandbox; CodeFleet neither changes the security
context nor supplies itself with approval. Local Evidence would still remain
unprotected, regardless of the Host sandbox chosen.

One bundled user approval question was presented for the separate new Live fixture
and model call. No answer has yet been observed in this record. Tool-specific
permission requests were also presented for scoped Host/MXC checks and regression;
the tools do not expose which approvals required manual clicks versus saved rules,
so actual human intervention time/count is UNKNOWN rather than zero. New Live
model calls, applied model proposals and verification Attempts: zero so far.

## Conclusion

MXC startup and native Git/CodeFleet repository reads work on the ordinary-user
worktree. Ownership recovery guidance and repository readiness checks are corrected.
The requested full Windows Native development acceptance remains incomplete.

## Next work and unresolved scope

Obtain the pending new-fixture/model approval, then execute the reviewed path in
explicit MXC, with exact Fileset and Local approvals at existing boundaries.
Observe Bootstrap, real proposal, application, tests, Evidence/Judge and recovery
in that new task. Never transfer the old P0-C Objective or claim its session
continuity from new-fixture results. P0-B/P0-C evidence remains preserved;
Protected acceptance, new-fixture Live and macOS/Linux are not established here.
