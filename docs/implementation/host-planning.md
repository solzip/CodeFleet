# H6 planning-only Host boundary

H6 is an offline implementation. Actual Codex/Claude execution, authentication
reuse and model transport remain BLOCKED. Neither Skill instructions nor a
profile declaration certify isolation.

## Entry points

From the trusted checkout:

```text
node src/hosts/planning-cli.mjs install codex TEMP_PROJECT
node src/hosts/planning-cli.mjs install claude TEMP_PROJECT
node src/hosts/planning-cli.mjs status codex TEMP_PROJECT
node src/hosts/planning-cli.mjs disable codex TEMP_PROJECT
node src/hosts/planning-cli.mjs enable codex TEMP_PROJECT
node src/hosts/planning-cli.mjs remove codex TEMP_PROJECT
node src/hosts/planning-cli.mjs profile
```

Invocation syntax is `$codefleet-plan` or `/codefleet-plan`. The additive
`codefleet-plan` installation contains only SKILL.md and LICENSE, with an
integrity receipt. Existing `codefleet` installation and H4 behavior are retained.
No global paths are changed or existing installations overwritten. Claude uses
the same lifecycle commands with `claude` as host.

The Skill asks for read/search-only exploration and one JSON response containing
sessionId, requestHash and proposal (draft, references, inferences). It never
asks the Agent to invoke a shell, validator CLI, Operator or Harness.
Submission is by a trusted collector, not a model-writable execution state.
There is deliberately no live launcher; `live` rejects unconditionally.

## Trusted data intake

`beginPlanning(store, repo, objective, options)` reuses pinned G3 code discovery.
It requires a clean existing baseline, bounded complete context and known host.
`createPlanning` is the lower-level trusted snapshot seam used by offline tests,
not a public endpoint accepting arbitrary model-supplied discovery.

The additive SQLite `host_planning` table holds an expiring request, profile,
skill, intent, context and baseline hashes. It does not create a Run, grant,
workflow approval or lease. The store must remain outside Agent access.
Same-account mutable stores are not a production authority boundary.

`submitPlanning(store, rawResponse, currentBindings)` bounds input, checks exact
schema, session/request/profile/skill/context hashes, expiry and cancellation,
then calls existing `validateSemanticProposal` and `validateDraft`.
The trusted collector must freshly measure currentBindings; never copy them
from a Host response. Each proposed source/test needs a real pinned quote.
Unverifiable criteria produce NEEDS_INPUT with no workflow; unsupported effects
produce CAPABILITY_GAP. A valid proposal produces a G4 `fromPlan` preview only.
G3/G4 policy and PROPOSAL_ONLY contracts are unchanged.

The response and result hashes persist. Exact duplicate delivery returns the
stored result; conflicting duplication fails. Expired/cancelled/changed sessions
fail even on retry. Reopening Store preserves this fence. `cancelPlanning`
cancels open requests; it is not retroactive revocation of a completed draft.
A changed mode/profile requires a fresh request and review. No approval reuse
or transition to execution exists in this module.

Host assertions retain PROVIDER_REPORTED_ONLY authority. Code-reference matching
means the trusted validator checked pinned code, not that Host execution was
observed. Tool use, final file state, usage and isolation remain unobserved in
that result unless separately measured. Evidence from the offline supervisor
is kept separate; it cannot be supplied as extra response fields.

## Linux offline worker

`planning-isolation.py` is a reusable read/search worker, not a Codex/Claude
sandbox launcher. A trusted supervisor provisions a root-owned immutable jail.
The worker requires Linux x86_64, root-owned non-writable ancestors and private
pipe stdin/stdout/stderr. It closes other descriptors, clears environment, chroots,
drops to non-root UID, applies no_new_privs and a seccomp filter.

The filter rejects sockets, exec variants, mounting/namespaces, privilege
changes and cross-process memory access. The fixture is root-owned and read-only.
Read/search uses bounded regular files, component-by-component O_NOFOLLOW opens
and no relative escapes. Forked children inherit restrictions; process/CPU/file
size limits apply. The supervisor owns wall-clock timeout and process-group
cleanup. The agent cannot signal its supervisor.

Offline tests use the existing pinned H3 image, no network, read-only root,
bounded tmpfs, PID/memory/CPU limits, no Docker socket. Only the trusted supervisor
has SYS_CHROOT/SETUID/SETGID/KILL; dropped Agent UID has no corresponding authority.
This runs inside a disposable test container, not a privileged workstation daemon.
Fake credentials/ledger and bound fake Unix sockets exist outside the jail.
No real credential is read or copied.

Private stdin/stdout demonstrates a fake transport distinct from denied worker
network sockets. It does **not** establish production Host authentication or
model-service egress. Codex/Claude binaries are not started inside this worker;
its no-exec boundary cannot be advertised as their verified runtime.

## Capability and Live gates

| Capability | Status and exact scope |
| --- | --- |
| Linux read/search, outside-file denial, write denial, syscall/child restrictions | Offline worker verified |
| Draft, citations, freshness, duplicate/cancel and G4 preview | Offline validator verified |
| Codex planning Skill discovery | Local loader, no model |
| Claude installation/lifecycle | Verified; actual loader/invocation not run |
| Windows/WSL Host isolation | Unverified; no generalization from Docker Linux |
| Real Host tool confinement and event collector | BLOCKED |
| Existing Host authentication reuse and model transport separation | BLOCKED |
| Operator human approval / controlled live execution | Existing H4 restrictions unchanged |

A later separately authorized implementation must connect an actual Host to
an attested session boundary and a trusted collector without expanding filesystem,
credential or network access. First verify effective policy and negative probes
without a model. Then seek a new authorization naming host/version, exact profile/
skill/fixture hashes, allowed tools, protected auth/transport, scratch/evidence
writes, one session/turn and usage/time bounds. The old no-tool approval does
not cover HOST_OBSERVED tools. Code changes/Harness execution need another scope.

See the [H6 run](../runs/2026-10-20/alpha-h6-host-planning-isolation.md).
