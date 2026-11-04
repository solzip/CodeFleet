# CodeFleet Host Protocol Proof R1-R4 P0 Preflight

> **Status:** `P0_READ_ONLY_PREFLIGHT_COMPLETE / PACKET_NOT_AVAILABLE / HOST_PROTOCOL_NOT_RUN / HOST_PROTOCOL_UNVERIFIED / M1_NOT_AUTHORIZED`  
> **Observed:** 2026-11-04  
> **Contract:** `docs/PLAN/codefleet-execution-contract-r3.md`  
> **Scope:** installed Codex CLI/App Server and a proposed external Fixture, read-only inspection only  
> **Authority:** this report is not a CodeFleet Operator grant, Host Protocol Proof result, M1 implementation approval, Git authority, or Protected Evidence.

Public path notation: `<PROOF_ROOT>` denotes the originally inspected disposable candidate under the current user's local temporary directory. This redaction does not change the historical P0 observation or its `NOT_RUN` status.

## 0. Executive result

The local installation exposes an experimental Codex App Server with `stdio://` as its default transport. The installed binary contains protocol symbols for `initialize`, `thread/start`, `turn/start`, `thread/resume`, approval events, terminal Turn events, token usage and rate-limit events. This establishes local presence only; it does not prove that the lifecycle, approval binding, sandbox enforcement, result provenance, recovery or cost controls work as required by Execution Contract R3.

`CODEFLEET_HOST_PROTOCOL_PROOF_R1_R4_PACKET.md` was not found in the repository or its parent CodeFleet directory. Packet-specific values therefore remain `UNVERIFIED`. The App Server was not started, no model Turn ran, no Fixture was created, and no source, test, State, Runtime or Git state was changed.

Final state:

```text
P0_READ_ONLY_PREFLIGHT_COMPLETE
PACKET_REVIEW_BLOCKED_FILE_NOT_AVAILABLE
HOST_PROTOCOL_PROOF_NOT_RUN
HOST_PROTOCOL_UNVERIFIED
M1_IMPLEMENTATION_NOT_AUTHORIZED
```

## A. Actual Git and Runtime baseline

Git ownership protection was not bypassed. Git identities were read directly from `.git/HEAD` and local ref files; no fetch occurred.

| Item | Observed value | Status |
| --- | --- | --- |
| Local branch | `main` | observed |
| Local `main` ref | `e5299af6bcc698c7fc9e9989ea30ccf690059753` | observed |
| Local `origin/main` tracking ref | `4cb1f6e25458d110cd0536d8cb9870192aaf2e52` | observed locally |
| Actual current GitHub main | network refresh prohibited | `UNVERIFIED` |
| Execution Contract R3 SHA-256 | `5F1FB400230742D90DB7FD66494C8F2489F3425C8C9D47A0E13F48DAD0530274` | observed |
| Codex CLI | `codex-cli 0.166.0` | observed |
| App Server | installed as `[experimental]` Codex subcommand | observed |
| Codex executable SHA-256 | `9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42` | observed |
| Codex package manifest SHA-256 | `E554D18C0A7C06BB9D81D5C154E869F6D4E55AD7906E2DD2DE0258750861D0F6` | observed |
| Node | `v24.14.1` | observed |
| npm | `11.11.0` | observed |
| OS | Windows NT `10.0.26200.0` | observed |
| PowerShell | `5.1.26100.9711` | observed |
| R1-R4 packet | not found locally | `UNVERIFIED` |

The Decision Debt preflight examined R3 only: one document, zero grounded final blockers and one sensitive-context exclusion. The missing R1-R4 packet was outside that audit, so this result does not clear the packet or authorize execution.

## B. R1-R4 confirmed and open values

| ID | Confirmable in this P0 | Still open or unverified |
| --- | --- | --- |
| R1 Fixture | a proposed `%TEMP%` child path is outside the CodeFleet repository | actual Fixture content, baseline, allowed files, creation and cleanup authority |
| R2 App Server | Codex `0.166.0`; App Server present; `stdio://` is the documented local default in installed help | exact protocol/schema version, request fields, response fields and approved client harness |
| R3 usage boundary | an external Turn/time limit can be imposed; normal path should reuse Host authentication | account boundary, model, hard token cutoff, price basis and hard monetary cap |
| R4 actions | schema inspection and bounded read/deny/write/resume cases can be separated | exact client command, JSON payloads, approval mapping and measured sandbox enforcement |

No R1-R4 item is sufficiently bound for execution approval yet.

## C. Installed App Server support and limits

### C.1 Confirmed from local help

The installed `codex app-server` supports these command surfaces:

- default `stdio://` transport and the `--stdio` alias;
- `unix://`, `unix://PATH`, `ws://IP:PORT` and `off` listen values;
- WebSocket `capability-token` and `signed-bearer-token` authentication modes;
- JSON Schema and TypeScript binding generation;
- daemon management and stdio proxy commands.

The general Codex CLI advertises:

- sandbox modes `read-only`, `workspace-write` and `danger-full-access`;
- approval policies `on-request` and `never`;
- automatic review via `--approve-for-me`;
- unsafe bypass via `--dangerously-bypass-approvals-and-sandbox`.

The Proof must prohibit automatic approval and unsafe bypass. CLI option presence does not prove equivalent App Server protocol enforcement.

### C.2 Symbols present in the installed executable

Read-only binary string inspection found:

```text
initialize
thread/start
turn/start
thread/resume
turn/started
turn/completed
item/commandExecution/requestApproval
item/fileChange/requestApproval
thread/tokenUsage/updated
account/rateLimits/read
account/rateLimits/updated
```

These findings do not prove callability, schema compatibility or correct behavior.

### C.3 Unverified behavior

- exact stable protocol and schema version;
- initialized-handshake requirements and exact payload fields;
- approval request/response binding to an exact Turn and action;
- terminal result and tool-effect provenance;
- process-restart and disconnect recovery semantics;
- selected sandbox/workspace enforcement;
- token-usage completeness and accuracy;
- per-Turn token cutoff or hard monetary cap.

Schema generation writes files and was therefore not run. App Server and daemon processes were not started or queried.

## D. Safe Proof Fixture candidate

Proposed path:

```text
<PROOF_ROOT>
```

Observed properties:

| Property | Result |
| --- | --- |
| outside CodeFleet repository | yes |
| parent `%TEMP%` exists | yes |
| local filesystem | yes |
| candidate directory exists | no |
| Fixture created in this P0 | no |
| sandbox isolation proven | `UNVERIFIED` |

Recommended future contents:

```text
input.txt
proof-output.txt
proof-artifacts/
```

`input.txt` should be read-only input. `proof-output.txt` should be the only allowed model-mediated write target. `proof-artifacts/` should contain generated schemas and protocol transcripts. Git initialization is unnecessary and should remain prohibited.

The path is only a candidate. It is not a ready or approved Fixture.

## E. Proposed Host Protocol Proof scenario

This sequence is a future authorization request, not an executed result.

1. Supply and review the missing R1-R4 packet.
2. Bind the packet, R3 hash, Codex version and executable hash.
3. Create an approved external Fixture and record its paths, hashes and ACL.
4. Generate the stable JSON Schema into the Fixture artifact directory without experimental fields.
5. Freeze an exact client path, hash, command and protocol payload from that schema.
6. Start App Server with `stdio://` and strict configuration.
7. Perform `initialize` and the schema-required initialized handshake.
8. Run one effect-free Turn and record stable Thread/Turn identity and terminal result.
9. Run a bounded write-request case and deny the exact action.
10. Verify externally that denial caused zero filesystem effect.
11. In a separate Turn, explicitly approve only the exact `proof-output.txt` write.
12. Bind approval, tool event, terminal result and actual bytes.
13. Perform a separately bounded interruption/reconnect/restart-resume case.
14. Verify that uncertain effects are reconciled without blind replay.
15. Stop all processes and inspect the Fixture and allowed artifact locations.
16. Report `PASS`, `FAIL`, `BLOCKED` and `UNVERIFIED` findings separately.

The Proof must not connect to CodeFleet production State, Lease, Attempt or Evidence/Judge as a substitute for future integration evidence.

## F. Proposed exact commands, files and limits

### F.1 Process commands

```text
codex.cmd --version
codex.cmd app-server generate-json-schema --out <fixture>\proof-artifacts\schema
codex.cmd app-server --listen stdio:// --strict-config
<approved-proof-client> <approved-config>
```

The client path, hash and invocation are `OPEN` because the packet is unavailable. No Proof may start until they are fixed.

### F.2 Fixture tool commands

The future approval should allow only the semantic equivalents of these exact Windows commands:

```text
Get-Content -LiteralPath <fixture>\input.txt
Test-Path -LiteralPath <fixture>\proof-output.txt
Set-Content -LiteralPath <fixture>\proof-output.txt -Value 'codefleet-host-protocol-proof'
```

The final write command is allowed only in the explicit acceptance case. The denial case must not execute it.

### F.3 File scope

Allowed:

```text
<fixture>\input.txt
<fixture>\proof-output.txt
<fixture>\proof-artifacts\**
```

Read-only Runtime evidence:

```text
<installed-codex>\package.json
<installed-codex>\codex.exe
```

Forbidden:

- CodeFleet product source, tests, Runtime, State and `.git/**`;
- user authentication or credential files;
- Fixture-external reads or writes except the explicitly listed Runtime evidence;
- symlinks, junctions and alternate writable directories;
- package installation, Git operations, deployment and external service/data changes.

### F.4 Proposed limits

| Resource | Maximum |
| --- | ---: |
| App Server process starts | 2 |
| Threads | 3 |
| model Turns | 4 |
| concurrent Turns | 1 |
| total elapsed time | 30 minutes |
| individual Turn | 5 minutes |
| write targets | 1 file |
| write size | 1 KiB |
| tool network calls | 0 |
| retries per case | 0 |
| cumulative reported tokens | 50,000 stop threshold |
| direct API keys | 0 |

The 50,000-token value is a between-Turn stop threshold, not a proven in-Turn hard cutoff. If usage events are absent, no subsequent Turn may start. Subscription inclusion, currency price and hard monetary enforcement remain `UNVERIFIED`.

## G. Acceptance and stop conditions

### G.1 Full PASS criteria

All of the following are required:

- actual protocol/schema version is captured as an artifact;
- `initialize`, `thread/start` and `turn/start` succeed against the installed version;
- stable Thread and Turn identifiers are observed;
- completed, failed and interrupted terminal states are distinguishable;
- approval events bind to the exact Thread, Turn and action;
- denial results in zero effect;
- acceptance affects only `proof-output.txt` within the byte limit;
- result/tool events can be joined to actual filesystem bytes;
- `thread/resume` or an explicitly supported equivalent works in the approved recovery case;
- interruption/restart does not blind-replay an uncertain effect;
- existing Host authentication is used without a separate API key;
- CodeFleet Controller can remain the sole scheduling authority;
- no Fixture-external effect occurs;
- usage and missing events are reported honestly.

Method names, help text, embedded symbols, schema generation or a model summary alone cannot establish PASS.

### G.2 Immediate stop conditions

- packet, schema, installed version or command mismatch;
- any Fixture-external write or unapproved read;
- credential extraction or new API-key requirement;
- automatic approval or sandbox bypass requirement;
- approval not bound to an exact action;
- any effect after denial;
- missing Thread, Turn or result identity;
- missing usage event when another Turn would be required;
- time, Turn or usage threshold reached;
- uncertain effect after interruption or process exit;
- need to alter CodeFleet State, Lease, Attempt or Evidence/Judge;
- request to retry the same failed case;
- protected isolation is required but cannot be demonstrated.

## H. Minimum owner approval request

Execution should not be approved until the missing packet and client identity are supplied. The minimum future approval should bind the following:

```text
Purpose:
  Verify Codex CLI 0.166.0 App Server lifecycle capability only.

Contract:
  R3 SHA-256
  5F1FB400230742D90DB7FD66494C8F2489F3425C8C9D47A0E13F48DAD0530274

Fixture:
  <PROOF_ROOT>

Fixture baseline/hash:
  OPEN — bind after separately authorized preparation.

Codex executable hash:
  9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42

Proof client path/hash/command:
  OPEN — must be supplied by the packet or a separate approval.

Transport:
  stdio:// only.

Protocol:
  Generated stable schema only; experimental fields disabled.
  Exact version remains UNVERIFIED until schema capture.

Allowed commands:
  Only the commands in section F after placeholders are resolved.

Sandbox:
  workspace-write requested for the Fixture only.
  Enforcement remains UNVERIFIED until measured.
  Automatic approval and dangerous bypass are prohibited.

Network:
  Host-owned model transport only; model-invoked network tools prohibited.

Limits:
  2 process starts, 3 Threads, 4 Turns, 30 minutes total,
  5 minutes per Turn, 50,000 reported-token stop threshold,
  one write target, 1 KiB maximum, zero retries.

Forbidden:
  CodeFleet source/test/Runtime/State/Lease/Attempt/Evidence mutation,
  package installation, credentials, direct API key, Git operations,
  deployment, destination delivery and external data/service effects.

Validity:
  One exact execution window; date/time OPEN.

Result labels:
  PASS | FAIL | BLOCKED | UNVERIFIED.

Non-authority:
  This Proof approval does not authorize M1 implementation,
  CodeFleet Operator execution, Protected Evidence or Objective acceptance.
```

## I. Commands executed during this P0

Only read-only inspection was performed:

- local file discovery and content reads;
- direct `.git/HEAD` and ref-file reads without Git ownership bypass;
- `codex.cmd --version`;
- Codex and App Server `--help` commands;
- Node/npm/OS/PowerShell version inspection;
- installed package manifest and executable-path inspection;
- SHA-256 hashing;
- read-only binary string presence checks;
- `%TEMP%` path existence and ACL summary inspection;
- bounded Decision Debt analysis of R3 text.

Not run:

- App Server or daemon startup;
- protocol schema generation;
- Codex model Turn;
- Fixture creation or Git initialization;
- tests, Pilot or CodeFleet Runtime;
- approval issuance;
- Git command, fetch, commit, push or merge;
- package installation or configuration change.

