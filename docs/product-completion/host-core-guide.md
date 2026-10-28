# Host-Native core and verification backends

CodeFleet extends the existing Codex CLI or Claude Code session. The Host owns
authentication, models, sessions and native tools. CodeFleet owns Intent/Task,
Workflow/DAG, roles, policy, recovery and evidence-bound completion.
No direct model API, Docker, WSL or separate OS account is required to prepare
work. The current local runtime requires Node 24.14.1 or newer and Git.

This is an unreleased implementation. [Windows supervised Codex Live acceptance](../runs/2026-10-28/public-existing-local-v2.md)
covers installed Skill invocation, two implementation WorkItems, Local verification
and Recovery. Authenticated public delegation remains blocked; this does not
establish Protected verification or a production Host Sandbox profile.

Maintainers can check the installed package without fixture commits or model calls:

```text
npm.cmd run alpha:package-smoke -- --supervised-only --repository REPO --recovery-state STATE --recovery-task TASK
```

Recovery options are optional as a pair. Planning uses temporary State and the
repository hash must remain unchanged. This is distribution verification, not a
new Host Live or application test. The legacy default smoke creates fixture
commits and requires its own authorization. See the [observed result](../runs/2026-10-28/trusted-authorization-boundary.md).

## Docker-free preparation

Install the existing standalone Skill with `scripts/host-install.mjs`; see the
[installation guide](host-native-guide.md). Existing installations are immutable:
review/remove an unmodified installation before reinstalling; modified files
are never overwritten. The strict H6 `codefleet-plan` remains separate.

`CLI` below means `src/alpha/cli.mjs` or the installed Skill's
`runtime/alpha/cli.mjs`. Use one preparation `STATE` outside the target repository,
never the protected Operator state. Use a reviewed, clean repository for a
validated executable contract; unresolved goals remain drafts.

```text
node CLI host codex doctor
node CLI host codex doctor --repository REPO
node CLI --state STATE host codex plan "Fix subtraction" REPO
node CLI --state STATE host codex status TASK
node CLI --state STATE host codex review TASK --files src/a.js --tests test/a.test.js --criterion "Subtraction passes"
node CLI --state STATE host codex prepare TASK
node CLI --state STATE host codex workflow TASK
node CLI --state STATE host codex explain TASK
node CLI --state STATE host codex approval-request TASK
```

Replace `codex` with `claude`. No command above launches a model. The existing
session supplies reasoning and uses read/search within its actual Host policy.
Local context matching only suggests source/test candidates; it is not semantic
verification. Skill instructions are not a sandbox.

### Windows Native execution path

Keep the Host sandbox choice separate from the identity actually running Git and
from CodeFleet execution approval. `doctor --repository REPO` observes native Git
in its own process and creates no State. Runtime readiness alone is not repository
readiness: an ownership or repository error returns BLOCKED_ENVIRONMENT. The
observation is not a reusable grant or sandbox attestation.

For Codex CLI 0.162.1, use the [official Windows sandbox guidance](https://learn.chatgpt.com/docs/windows/windows-sandbox).
With user authorization, perform the documented MXC compatibility command once:

```text
codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK
```

After a successful check, retain explicit MXC selection and managed policy for
each approved CodeFleet command, including the preflight before requesting an
expiring approval:

```text
codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- node CLI host codex doctor --repository REPO
codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- node CLI --state STATE objective recover TASK
```

Use that same official prefix for separately approved Bootstrap, materialization
and Local verification commands. Do not create a second launcher or scheduler.
Git initialization and other Git mutations require their own approved Host action;
the workspace sandbox can forbid `.git` writes even when native Git reads pass.
Prepare a new user-owned acceptance project only with explicit scope approval.
Preserve failed fixtures and never transplant their Task or Evidence.

GIT_OWNERSHIP is not an instruction to escalate. Re-query effects and leases, then
review the execution path with the user. Changing the Host path requires fresh
Native Probe, contract/candidate, capability and approval checks; it does not
authorize replay or refresh expired grants. The Agent never issues its own approval.
If MXC is unavailable, discuss the official unelevated fallback before use: it has
weaker network isolation and lacks denied-read-path support. No silent fallback,
safe.directory exception, ownership/ACL repair or default Full Access is supported.
Local Evidence remains unprotected even when the Host command ran inside MXC.

For a Host-generated semantic draft, use `host codex draft TASK proposal.json`
before preparation. The envelope is `{revision,proposal:{draft,references,inferences}}`.
The draft uses the existing TaskDraft schema: `schemaVersion:2`, original
`objective`, pinned `base`, `files`, `tests`, `criteria`, `risks`, `unknowns`,
`effects`. Each criterion has `description`, `method:"protected-tests"`, `tests`.
Each reference has `path`, one-based `line`, exact `quote`; every proposed source
and test needs a matching reference in the pinned context. Revision/base changes,
extra approval/evidence fields and fabricated references are rejected.

Draft validation and DAG preparation never approve or execute work. General
goals can be received, but executable scope still follows the existing bounded
Node/Java repair contracts. Unsupported goals stay `NEEDS_INPUT`/`CAPABILITY_GAP`.

## Separate readiness

Host Doctor checks the core runtime and reports packaged Skills separately from
actual Host discovery. Local Verification is `CONDITIONAL`. Container Verification
is `NOT_INSTALLED` or `NOT_CHECKED` unless `--probe-container` is explicitly used.
Optional container failure does not fail basic preparation.
Host Sandbox stays `NOT_VERIFIED`; authentication is not inspected.

The original `doctor [contract.json]` still means Alpha provider and protected
verifier readiness. Its optional `--no-auth` skips authentication inspection and
returns exit 2 when other checks pass: it does not claim full readiness.
The default Alpha Doctor behavior is unchanged.

## Evidence contract

New Container and Local evidence separates `verificationBackend`,
`executionAuthority`, `isolationCapabilities`, `verifierIndependence`,
`evidenceIntegrity`, `contractHash`, `candidateTreeHash`, `requiredGateResults`.
Backend names convey no authority. Partial new envelopes fail closed.

Historical Alpha evidence and Run schemas remain readable with their historical
semantics. New Container evidence preserves `HARNESS_EXECUTED`; new Local evidence
uses `LOCAL_EXECUTED`, never `HARNESS_EXECUTED`. Only the trusted coordinator binds
protected results to the contract, candidate tree and baseline test identities.
An artifact hash detects changes relative to its recorded digest, not an attacker
who controls the whole store. Agent reports cannot enter this trusted seam.

Protected Judge still requires the executed failing baseline, matching nonempty
test identities, all tests passing without skips, intact candidate and artifacts,
and all required gates. Local success cannot complete an Alpha Run.
Reports expose the extended fields; old evidence is explicitly labelled legacy.

## Backend guarantees and limits

| Backend | Guarantee within its tested scope | Limits |
| --- | --- | --- |
| Local | Exact reviewed executable/arguments/snapshot, one-use grant, observed output, timeout/cancellation and before/after hashes | Same-user process; no OS containment, hard resource isolation or protected evidence; TOCTOU cannot be prevented |
| Container | Existing pinned images, network denial, protected inputs, resource limits and independent Harness execution | Does not prove human identity or protect an Agent-writable Harness/store; arbitrary hostile in-process code remains outside Alpha's verified scope |
| Host Sandbox | Disabled until a real platform/tool profile is qualified | Advertising a feature or passing model-provided capability fields cannot activate it |

`PROTECTED_TEST_INPUTS` describes the Container evidence's existing test/input
boundary. It is not an assertion of full Operator/Agent OS separation. H3/H4
deployment requirements continue to apply to protected Host execution.

Container verification uses the existing Node and Java implementations, including
Java preparation and offline dependency cache. Missing Docker does not select
Local automatically. A failed Container preparation blocks that verification.

## Explicitly trusted Local Verification

Only use a disposable, fully reviewed snapshot and a native executable.
Repository tests, build tools, configuration and plugins may run arbitrary code.
An executable name, a successful hash comparison or this CLI's acknowledgement
does not make untrusted code safe.

Create a request outside the snapshot:

```json
{
  "executable": "/absolute/path/to/node",
  "args": ["--test", "--test-reporter=tap", "test/check.cjs"],
  "directory": "/absolute/path/to/reviewed-snapshot",
  "timeoutMs": 30000
}
```

```text
node CLI inspect-local request.json
node CLI verify-local request.json --trust REVIEWED_COMMAND_HASH --acknowledge-unisolated
```

Review the complete inputs before supplying the digest returned by inspection.
It binds executable bytes, exact arguments, directory, full snapshot and timeout.
Execution uses no shell and a minimal environment with fresh scratch; this does
not prevent a trusted command from accessing other same-user files or networking.
Scratch may contain diagnostics and is retained locally for inspection.
TAP output is currently the supported result format. Other output is inconclusive.
`LOCAL_PASSED` and exit zero describe this local check only, with `complete:false`
and `protectedVerification:UNSATISFIED`.

The embedding API uses a process-local, one-use token. Serialized Agent objects
cannot supply it. The local operator CLI is explicit trust, not authenticated
human authorization; the public Host CLI does not expose it. It must not be used
to run dangerous untrusted work or to satisfy protected gates.

## WorkItem policy and recovery

Policy distinguishes planning, analysis, local edit, local verification, isolated
execution, protected verification and external/risky effects. Missing capability
or current action approval blocks the affected item. Dependencies wait; independent
ready items can continue. Failed attempts are never automatically replayed.
Final integration still requires every WorkItem and protected verification.

The existing Scheduler evaluates an optional trusted `workItemPolicy` envelope
bound to workflow hash/revision. This adds restrictions, never grants capabilities
to an Agent or relaxes Alpha's mandatory protected checks. Its digest is persisted;
resume cannot omit or change it. A changed policy requires a new reviewed workflow.
Host-supplied capability/approval fields are not accepted. The existing H3/H4
Operator guard continues to validate authorization immediately before reservation.
Human input for risky H4 dispatch remains unattested; risky items stay blocked.

The `explain` command reports preparation-level work categories without certifying
runtime capabilities. Detailed runtime denial reasons appear per WorkItem in
reports. An unprotected preparation state is never treated as a protected ledger.

## Verification and follow-up

`npm run test:host-core` exercises actual Docker-free CLI paths and real Local
processes plus explicitly labelled fake-backend negative tests. `npm test` retains
all Legacy/Alpha/H3/H4/H6 checks and requires their existing Docker/JDK fixture
configuration. A Docker-free user need not run the full security qualification
suite to use planning; omission of that suite is never a security pass.

See the [implementation record](../runs/2026-10-20/host-native-core-verification.md).
Later Host Live work needs separate authorization, actual Skill discovery/invocation,
effective permissions, protected state/approval boundaries where required, and
measured cancellation/stale-result handling. H8 installation is not a prerequisite
for the Docker-free core. No `HOST_LIVE_VERIFIED` claim is made.
