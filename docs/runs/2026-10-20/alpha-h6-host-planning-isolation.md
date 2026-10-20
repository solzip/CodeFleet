# H6 — Planning Skill and isolated offline preflight

Date: 2026-10-20 (Asia/Seoul). HEAD: `81144a6dedb7e73b41b0029d14161943bffdfaeb`.
Branch: `feature/alpha-g0-refresh`. Type: implementation / offline verification.
Predecessor: [execution-mode review](../../product-completion/host-execution-modes-review.md).
Prior measured finding maxima: P0-17/P1-61; no new IDs.

## Result scope

OFFLINE_VERIFIED applies only to the fake read/search worker and trusted Draft
intake after successful checks. Actual Host confinement, authentication/model
transport and Live execution remain BLOCKED. No HOST_LIVE_VERIFIED claim.
No model call, direct API, credential copying, product commit, push or deployment.
The prior H5 changes, `.trials/`, history and all G1-H4 records are retained.
New discovery projects have Git initialization only, no baseline commits.
Existing regression fixtures retain their synthetic baseline behavior.

The specified design was the decision-debt preflight input: no final blocker,
one excluded sensitive-context candidate. This permits scoped offline work,
not production deployment or disclosure of credentials.

## Actual implementation

- `src/hosts/planning.mjs`: explicit execution modes, fresh bounded profile,
  durable requests/submissions, existing G3 validators and G4 preview.
- `src/hosts/planning-cli.mjs`: local planning Skill lifecycle/profile; Live denied.
- `src/hosts/planning-isolation.py`: Linux x86_64 UID/chroot/seccomp read/search worker.
- `src/hosts/install.mjs`: additive `codefleet-plan` installation, existing path retained.
- `scripts/host-codex-discovery.mjs`: optional planning selector; RPC allowlist unchanged.
- `test/host-planning.test.mjs`, `test/fixtures/planning-isolation-probe.py`:
  fake planning and real isolated-process adversarial tests.
- `package.json`: H6 test included in full Alpha suite and dedicated script.
- Documentation: [boundary and operation](../../implementation/host-planning.md),
  this run/evidence/logs, index/readme counts and product progress.

Use `$codefleet-plan` or `/codefleet-plan` after local installation as documented.
This is a plan-only Skill and does not require a provisioned H4 Run/socket.
It returns structured data; a trusted collector submits to the validator.
There is no new approval API, Coordinator, Judge or Policy Engine.

## Boundary and observations

The profile binds HOST_OBSERVED, fresh session, read/search, no writes/network/
delegation/Operator/Docker, one Draft response, bounded time/output and tool count.
The current implementation only starts fake local workers, never a real Host.
Model transport and authentication are explicitly UNVERIFIED.

Linux tests use a root-owned immutable jail and Agent UID 1001, private pipes,
closed inherited descriptors, cleared environment, resource limits and seccomp.
The trusted supervisor alone retains child-termination capability.
The tests attempt real outside reads, fixture writes, forged tools, socket creation,
root regain, symlink/traversal, path replacement, mount/namespace/exec syscalls,
child escapes and signaling the supervisor. Fake secret/ledger/socket targets
exist before the attempts. Timeout cleanup, request/output bounds and unchanged
fixture hashes are checked. The model channel is a fake private pipe, not a
verified real Host service connection.

Actual confined read results are fed through Fake Host references to the existing
semantic Draft validator and G4 preview. VALIDATED leaves approved/executable/
complete false and creates no execution Run. NEEDS_INPUT/CAPABILITY_GAP do not
produce workflows. Host reports cannot add evidence or grant fields.

Codex loader uses a clean temporary home and initialize/skills/list only:
enabled 1, disabled 0, re-enabled 1; errors 0; authentication false, model turns 0.
Both Skills pass local lifecycle smoke. Claude actual discovery/call remains
NOT_RUN. Windows Native and WSL2 confinement are not certified.

## Test commands and repair history

`node --test test/host-planning.test.mjs` with Docker and pinned H3 runtime:

- First run: exit 1, 6 pass / 1 fail. Expected observation count was 20; actual
  list contained 21. Replaced the guessed count with explicit observation names.
- Next run: exit 0, 7 pass / 0 fail.
- Added existing fake targets, request/output limits, timeout and real read-to-
  validator integration. Run failed because the capability-dropped supervisor
  could not kill a different-UID child.
- Granted KILL only to the trusted test supervisor. Agent cannot signal that
  supervisor; timeout process group is gone. Latest targeted run: exit 0,
  7 pass / 0 fail / 0 skipped, 28 named isolation observations.

| Command | Exit | Measured result |
| --- | --- | --- |
| `npm.cmd test` | 0 | Legacy 324 + Alpha 205 = 529 passed; failed/skipped 0 |
| `node src/alpha/cli.mjs doctor` | 0 | Environment/auth-status diagnostics; no model |
| `node --test test/host-planning.test.mjs` (latest) | 0 | 7 passed; failed/skipped 0 |
| `node scripts/host-codex-discovery.mjs <native> <temporary-preparation> planning` | 0 | Loader lifecycle, model turns 0 |
| `node src/hosts/planning-cli.mjs profile` | 0 | Explicit bounded profile; Live blocked |
| `node src/hosts/planning-cli.mjs live` | 2 | Expected fail-closed refusal; no Host launch |

Full regression included Docker/Node/JDK/Maven, G1-H5, Host/Operator/Harness,
SQLite/recovery, DAG and Hybrid tests. It used CODEFLEET_TEST_DOCKER=1, the
installed Java executable, existing Maven image
`sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`,
Operator image
`sha256:26c04a69d0bb84a2ed1cb865c36a0f690bbe772197ee41d914563bea5236200d`,
and H4 image
`sha256:47e30452abb8ab756bf3c09ad729f4a3469f3babb5b4c602912fdb88ec153f8a`.
No image download or actual model request was needed.

Evidence: [source hashes and structured observations](alpha-h6-source-evidence.json),
[full regression](codefleet-h6-full.log), [Doctor](codefleet-h6-doctor.log),
[Codex discovery result](codefleet-h6-discovery.log). Private/temp paths are
redacted. An auxiliary log export initially used an invalid encoding alias;
it was corrected without changing test results. Earlier failed test logs remain
in the ignored checkpoint and their causes are recorded above.

No existing test expectation or security policy was relaxed. Only the new
test's miscount was corrected, and its timeout failure required an explicit
supervisor capability plus an Agent-denial countertest.

Final link, citation and declared-fact checks each exited zero after the records
were added. Declared-fact coverage is 42 of 581 living-document numbers; 539
remain unchecked by that checker. Source manifest byte hashes match 8/8 files.
A limited scan of 14 H6 source/evidence/document files against three private-path/
key patterns found zero matches; this is not proof that every possible secret
form is absent. Tracked diff whitespace check exited zero. HEAD is unchanged.

## Remaining gates and next action

The Linux worker is not a complete real Host sandbox. Real Host tool/native-file/
hook/connector confinement, authenticated model transport, credentials inaccessible
to tools, runtime scratch policy, effective session configuration, and trusted
collection of live output require further offline implementation/attestation.
Do not copy auth files or activate a live fallback.

Only after those gates pass may a new approval name exact host/version, profile,
Skill and fixture hashes, read/search rights, network/auth boundary, runtime
side effects and one bounded Live turn. A valid draft remains separate from
activation. High-risk human approval is still blocked by H4.

## Conclusion

Planning and independent execution remain separate. The verified offline scope
does not complete the Host-native product or authorize a real session.
