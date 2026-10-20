# H2 Operator authorization contract

Implementation scope: offline authorization core and fail-closed Host CLI. Production operator identity enrollment, OS service/IPC authentication and Host sandbox deployment are **BLOCKED**. A signed message proves possession of an enrolled key, not that a human saw a dialog. No production signing key or user enrollment is created here.

## Boundary choice

A host-native confirmation is insufficient without an authenticated, unforgeable decision channel and observed constraints on the host and descendants. B (a separate process) alone is insufficient under the same unrestricted OS account. Choose B+C: an operator-owned broker and ledger, OS-isolated agent, authenticated operator ingress, and a narrow agent ingress. The broker must own the runtime, policy, canonical repository, lease and execution path. Agent must have no access to the broker's files, process handles, credentials, container daemon or operator ingress. This is the target deployment contract, not an implemented production service.

Offline tests enroll generated Ed25519 public keys as fake operators in trusted test setup. Only signed decisions from an enrolled key can approve/deny/revoke. The Agent interface offers request/status, no approval method. Its request is an untrusted immutable proposal and does not create domain approval. Raw actor strings, Hooks, environment flags and host-supplied “isolated” fields establish no authority.

Each one-use grant binds request ID, Run ID, WorkItem ID, revision, contract hash, action digest, canonical repository identity, execution environment digest, current policy digest and lease owner. Decisions bind their kind, key fingerprint, expiry and use limit. Current state must be re-derived by the trusted executor immediately before dispatch. Policy change, contract/target change, cancel, pause, lease loss, expiry, denial or revocation fail closed. Approval receipt is not a bearer credential. Expiry and revocation cannot resurrect a consumed grant.

The independent SQLite ledger persists signed decisions, terminal denial/revocation, a unique consumed dispatch intent and the exact command specification. Dispatch consumes before execution: crash after consumption is uncertain, never automatic retry. A failed command remains consumed. Final success requires the existing independent Harness; a dispatch receipt is not completion evidence. Ledger tampering by its OS owner is outside the core's cryptographic guarantees: OS separation is mandatory, including protection against rollback of used/revoked state.

The offline core has no default executor, model, CLI enrollment, network listener or production bypass switch. Its caller is trusted. Fake callers exercise verification logic; they do not certify OS isolation. A separate hardened Docker probe tests a fake agent and its child against a private fixture. It does not certify Codex/Claude confinement.

## Integration and compatibility

Public `host ... run/resume/requests/submit` paths are blocked until an enforceable broker deployment exists. Plan/review/prepare/approval-request/status/report/cancel remain available. In-process staged execution stays an internal trusted coordinator seam for existing offline tests. No flag, token or actor argument enables public H2 execution. Existing Alpha/Legacy APIs and SQLite schemas remain unchanged and are not exposed as H2 broker endpoints. An unrestricted OS user can still import internal modules, edit code or invoke legacy CLIs; therefore this deployment is unsupported, not a secure same-user sandbox.

Future integration must enforce grants at each risky effect, including workspace integration, remote writes and policy changes, under the same lease/state ownership boundary. Merely wrapping the initial workflow launch cannot meet that condition. Remote writes, permission expansion and policy changes are not enabled by this offline core.

## Threat coverage

| Threat | Enforcement / limitation |
| --- | --- |
| Forged actor, direct approval CLI, Hook impersonation | No actor-based approval ingress; enrolled key signature required; public Host execution blocked |
| Agent edits approval DB or steals private key | OS separation required; isolated fixture probe; same-user access explicitly unsupported |
| Stolen approval receipt / replay | Signature binds all fields; one consumption; permanent denial/revocation; no bearer execution endpoint |
| Contract, repository, environment, command or policy changes | Exact current binding and command digest checked at dispatch |
| Lease loss, cancellation, expiry | Trusted current snapshot and clock checked immediately before dispatch |
| Child process escape | Probe checks child with identical confinement; no global Host guarantee |
| Crash after reservation | Durable dispatch intent; no retry or refund of use |

Sources checked 2026-10-20: [Microsoft access tokens](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-tokens), [Windows UAC process inheritance](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works), [Docker run isolation controls](https://docs.docker.com/engine/containers/run/), [Docker daemon security](https://docs.docker.com/engine/security/). These describe primitives; only executed probes establish local observations.
