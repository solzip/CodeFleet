# CodeFleet Host Protocol Proof R1-R4 Approval Contract

> **Status:** `R1_R4_APPROVAL_CONTRACT_PREPARED / P1_NOT_AUTHORIZED / HOST_PROTOCOL_UNVERIFIED / HOST_PROTOCOL_PROOF_NOT_RUN / M1_NOT_AUTHORIZED`  
> **Prepared:** 2026-11-04  
> **Authority:** execution-approval request draft only; not an Operator grant, P1 approval, Proof result, Protected Evidence, or implementation authority.  
> **Inputs:** `codefleet-execution-contract-r3.md`, `CODEFLEET_HOST_PROTOCOL_PROOF_R1_R4_PACKET.md`, `codefleet-host-protocol-proof-r1-r4-p0-preflight.md`, and official Codex App Server stable protocol documentation.

## 0. Outcome

The existing P0 was not repeated. Its observed local values were reconciled with the R1-R4 preparation packet and the stable Codex App Server protocol.

The first P1 Handshake can be bounded without a model Turn. Execution still cannot start because the exact disposable Fixture and the approved Proof client path/hash are open. Costs that cannot be technically enforced remain `UNKNOWN`.

```text
R1_R4_APPROVAL_CONTRACT_PREPARED
P1_NOT_AUTHORIZED
HOST_PROTOCOL_UNVERIFIED
HOST_PROTOCOL_PROOF_NOT_RUN
M1_NOT_AUTHORIZED
```

## 1. R1-R4 packet versus P0

| Subject | Preparation packet | P0 observation | Reconciled state |
| --- | --- | --- | --- |
| Codex version | `0.166.0` reference | `0.166.0` and executable hash observed | `CONFIRMED` |
| App Server transport | prefer `stdio://` | installed help reports default `stdio://` | `CONFIRMED` |
| Stable methods | confirm against installed version | relevant symbols present in binary | presence `CONFIRMED`; behavior `UNVERIFIED` |
| Packet availability | preparation document exists | not found at P0 time | now available; do not rewrite historical P0 observation |
| Fixture | disposable existing Git Fixture | uncreated `%TEMP%` non-Git candidate | choose disposable non-Git Fixture for protocol proof |
| Usage | up to four Turns and 30 minutes proposed | same bound plus reported-token threshold proposed | `PROPOSED` |
| Monetary cost | use `UNKNOWN` if unenforceable | hard monetary cap unavailable | `UNKNOWN` |
| P1/P2/P3 | separate approvals | separation required | aligned |
| M1 | not authorized | not authorized | `M1_NOT_AUTHORIZED` |

The packet becoming available does not retroactively invalidate the P0 evidence that it was unavailable during that run.

## 2. Fixture decision

| Criterion | Existing Git Fixture | New temporary non-Git Fixture |
| --- | --- | --- |
| Repository realism | high | low |
| Existing user-data risk | higher | minimal when correctly isolated |
| HEAD/clean-state requirement | required | not applicable |
| Git ownership/safe-directory risk | possible | none |
| P1 Handshake need | unnecessary complexity | sufficient |
| P2 read-only Turn | suitable | suitable |
| P3 one-file deny/accept | suitable but Git state must be managed | simplest |
| Disposal and repeatability | depends on repository | high |
| Proof of product E2E | partial at most | none |

**Decision recommendation:** use a newly prepared disposable, non-Git temporary Fixture for R1-R4 Host Protocol Proof.

This Proof verifies App Server lifecycle, approval, result, usage and resume contracts. Existing-repository semantics belong to the later existing-repository E2E and must not be inferred from this protocol Proof.

Use variables in public records:

```text
<PROOF_ROOT>      = owner-approved disposable directory outside CodeFleet
<PROOF_ARTIFACTS> = <PROOF_ROOT>\proof-artifacts
<PROOF_INPUT>     = <PROOF_ROOT>\input.txt
<PROOF_OUTPUT>    = <PROOF_ROOT>\proof-output.txt
```

Portable Windows example:

```text
%LOCALAPPDATA%\Temp\codefleet-host-protocol-proof-r1-r4
```

The directory does not currently exist. Its actual path, baseline, ACL and cleanup policy remain `OPEN`; this contract does not authorize its creation.

## 3. Codex 0.166.0 stable P1 Handshake

The official stable protocol uses newline-delimited JSON over `stdio://`. Messages follow JSON-RPC 2.0 semantics while omitting `"jsonrpc":"2.0"` on the wire. Each connection sends `initialize` once and then an `initialized` notification. Omitting `capabilities.experimentalApi`, or leaving it false, selects the stable surface.

Reference: https://developers.openai.com/codex/app-server/

### 3.1 P1 commands

With a separately prepared Fixture and pre-approved client:

```text
codex.cmd app-server generate-json-schema --out "<PROOF_ARTIFACTS>\schema"

<APPROVED_PROOF_CLIENT> \
  --codex "codex.cmd" \
  --fixture "<PROOF_ROOT>" \
  --artifacts "<PROOF_ARTIFACTS>"
```

The client must spawn App Server without a shell using exactly:

```text
codex.cmd app-server --listen stdio:// --strict-config
```

P1 prohibits:

- `--experimental` and `experimentalApi`;
- WebSocket, Unix socket, daemon and remote transport;
- automatic approval and sandbox bypass;
- config-write methods;
- `thread/start`, `thread/resume` and `turn/start`;
- Goal, MCP, plugin, skill or model execution.

### 3.2 Exact P1 JSONL

Initialize:

```json
{"method":"initialize","id":1,"params":{"clientInfo":{"name":"codefleet_host_protocol_proof","title":"CodeFleet Host Protocol Proof","version":"p1"}}}
```

The matching response must have `id: 1` and a `result`. Record only:

```text
result.userAgent
result.platformFamily
result.platformOs
```

Then send:

```json
{"method":"initialized","params":{}}
```

P1 should also permit the stable metadata request needed to select a P2 model:

```json
{"method":"model/list","id":2,"params":{"limit":20,"includeHidden":false}}
```

This is not a model Turn. Record only returned model identifiers, defaults and supported reasoning efforts. Do not record credentials or account details.

### 3.3 Proof client requirements

- pre-existing file with owner-approved absolute path and SHA-256;
- Node built-ins only; no dependency installation;
- child process launched with `shell: false`;
- stdin/stdout pipes and protocol stderr separation;
- exactly one JSON object per stdout line;
- outbound allowlist limited to `initialize`, `initialized`, `model/list`;
- no `experimentalApi` capability;
- stop on an unknown server request instead of responding or approving;
- redact credentials, tokens and personal home paths from transcripts;
- stop on malformed JSON, response-ID mismatch or protocol error;
- no reconnect, restart or retry;
- explicit stdin EOF and child termination handling;
- transcripts written only under `<PROOF_ARTIFACTS>`;
- no CodeFleet State, Lease, Attempt or Evidence/Judge access.

The exact Proof client path, hash and invocation remain `OPEN`.

## 4. Separate P1, P2 and P3 authority

### 4.1 P1 — process and handshake

Allowed:

- version-specific stable schema generation;
- one App Server start;
- `initialize`, `initialized`, and `model/list`;
- schema and redacted transcript artifacts.

| Resource | Limit |
| --- | ---: |
| App Server starts | 1 |
| Threads | 0 |
| model Turns | 0 |
| JSON-RPC requests | 2 |
| client notifications | 1 |
| elapsed time | 5 minutes |
| retries | 0 |
| tool calls | 0 |
| Fixture content writes | 0 |
| artifacts | schema and redacted transcript only |
| monetary ceiling | `UNKNOWN` |

P1 intends zero model Turns. Host metadata or account-policy costs cannot currently be enforced as a monetary limit, so monetary cost must not be represented as zero.

### 4.2 P2 — one read-only model Turn

P2 requires separate approval after P1 acceptance.

| Resource | Proposed limit |
| --- | ---: |
| Threads | 1 |
| `turn/start` | 1 |
| elapsed time | 10 minutes |
| retries | 0 |
| approval policy | `on-request` |
| sandbox | restricted read-only `<PROOF_ROOT>` |
| tool writes | 0 |
| tool network | 0 |
| reported-token stop threshold | 20,000 |
| monetary ceiling | `UNKNOWN` |

Use the actual model returned by P1:

```json
{"method":"thread/start","id":10,"params":{"model":"<P1_SELECTED_MODEL>","cwd":"<PROOF_ROOT>","approvalPolicy":"on-request","sandbox":"read-only","serviceName":"codefleet_host_protocol_proof"}}
```

Proposed `turn/start`, subject to the generated 0.166.0 stable schema:

```json
{"method":"turn/start","id":11,"params":{"threadId":"<THREAD_ID>","input":[{"type":"text","text":"Read input.txt and return its exact text. Do not modify files, run network tools, or inspect paths outside the approved fixture."}],"cwd":"<PROOF_ROOT>","approvalPolicy":"on-request","sandboxPolicy":{"type":"readOnly","access":{"type":"restricted","includePlatformDefaults":true,"readableRoots":["<PROOF_ROOT>"]}},"model":"<P1_SELECTED_MODEL>","effort":"low","summary":"concise"}}
```

The `turn/start` payload remains `PROPOSED` until checked against the generated schema.

### 4.3 P3 — write, approval and recovery

P3 requires separate approval after P2 acceptance. Each case remains distinct:

1. `P3-DENY`: decline an exact `proof-output.txt` write and observe zero effect.
2. `P3-ACCEPT`: approve only one exact file write of at most 1 KiB.
3. `P3-RESUME`: resume stored Thread metadata/session state.
4. `P3-INTERRUPT`: demonstrate no blind replay of an uncertain effect.

| Resource | Proposed aggregate limit |
| --- | ---: |
| Threads | 2 |
| Turns | 3 |
| App Server starts | 2 |
| elapsed time | 20 minutes |
| retries | 0 |
| write targets | one file |
| write bytes | 1 KiB |
| `acceptForSession` | prohibited |
| tool network | 0 |
| reported-token stop threshold | 30,000 cumulative |
| monetary ceiling | `UNKNOWN` |

Stable resume shape:

```json
{"method":"thread/resume","id":20,"params":{"threadId":"<THREAD_ID>","excludeTurns":true}}
```

Approval handling must bind `threadId`, `turnId` and `itemId`. This Proof permits only `accept`, `decline` or `cancel`. It prohibits `acceptForSession` and exec-policy amendments.

## 5. Minimal public P0 privacy correction

No existing document is changed by this contract.

In `codefleet-host-protocol-proof-r1-r4-p0-preflight.md`, replace the personal absolute path in these sections:

- `D. Safe Proof Fixture candidate`;
- `H. Minimum owner approval request`.

Replace it with:

```text
<PROOF_ROOT>
```

Add this definition at first use:

```text
<PROOF_ROOT> is an owner-approved disposable directory outside the CodeFleet repository.
Windows example: %LOCALAPPDATA%\Temp\codefleet-host-protocol-proof-r1-r4
```

Do not change historical hashes, versions, status or the fact that the packet was unavailable during P0.

## 6. Final R1-R4 decision table

| ID | `CONFIRMED` | `PROPOSED` | `OPEN` |
| --- | --- | --- | --- |
| R1 | separate from CodeFleet source/State; destination `none` | disposable non-Git `<PROOF_ROOT>` | actual path, preparation authority, baseline/hash, ACL and cleanup |
| R2 | Codex `0.166.0`; executable hash; stable `stdio://` and initialization lifecycle | schema generation followed by P1 handshake | Proof client path/hash and generated-schema hash |
| R3 | phase separation; enforceable Turn/time bounds; unenforceable cost is `UNKNOWN` | P1 five minutes/zero Turns; P2 one Turn; P3 up to three Turns | account boundary, actual model, usage completeness and monetary enforcement |
| R4 | P1 allowlist and common prohibitions | P2 read-only and P3 deny/accept/resume cases | exact client, version-specific sandbox schema, artifact and redaction paths |

## 7. First P1 execution approval request

```text
Decision:
  APPROVE | REVISE | REJECT

Scope:
  P1 App Server stable handshake only

Contract:
  CodeFleet Execution Contract R3
  SHA-256:
  5F1FB400230742D90DB7FD66494C8F2489F3425C8C9D47A0E13F48DAD0530274

Installed Runtime:
  Codex CLI 0.166.0
  codex.exe SHA-256:
  9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42

Fixture:
  <PROOF_ROOT>
  Must be pre-created outside CodeFleet.
  No Git initialization.
  Actual path and baseline hash: OPEN

Proof artifacts:
  <PROOF_ARTIFACTS>
  Schema and redacted transcript only.

Proof client:
  Exact path: OPEN
  SHA-256: OPEN
  shell: false
  Dependencies: Node built-ins only

Allowed process commands:
  codex.cmd app-server generate-json-schema
    --out "<PROOF_ARTIFACTS>\schema"

  proof-client spawning:
    codex.cmd app-server --listen stdio:// --strict-config

Allowed protocol messages:
  initialize id=1 with fixed clientInfo
  initialized notification
  model/list id=2, limit=20, includeHidden=false

Experimental API:
  Disabled.
  capabilities.experimentalApi must be absent.

Limits:
  Schema generator processes: 1
  App Server starts: 1
  Threads: 0
  Model Turns: 0
  JSON-RPC requests: 2
  Client notifications: 1
  Elapsed time: 5 minutes
  Retries/restarts: 0
  Tool calls: 0
  Fixture data writes: 0
  Artifact writes: schema and redacted transcript only
  Monetary cost ceiling: UNKNOWN

Network:
  No tool or arbitrary network.
  Existing Host metadata/auth service access only if required by model/list.
  No new login, OAuth flow, API key or credential output.

Stop conditions:
  Runtime or hash mismatch
  Stable schema generation failure
  Any request for experimentalApi
  Any authentication mutation or credential prompt
  Any server request not on the allowlist
  Any Thread or Turn creation
  Any Fixture content mutation
  Any CodeFleet source/test/Runtime/State/Git access or mutation
  Malformed JSONL, response ID mismatch or protocol error
  Process not terminated within the five-minute window
  Need for retry or permission expansion

Evidence:
  Command argv and exit status
  Schema file hashes
  Redacted JSONL transcript
  initialize response: userAgent, platformFamily, platformOs
  model/list returned model ids and efforts
  Process start/end timestamps
  Unexpected events and omissions

Non-authority:
  P1 approval does not authorize P2, P3, M1,
  CodeFleet Operator execution, Protected Evidence,
  product source changes or Objective acceptance.
```

P1 cannot run until `<PROOF_ROOT>`, `<PROOF_ARTIFACTS>` and the Proof client path/hash are resolved and explicitly approved.

