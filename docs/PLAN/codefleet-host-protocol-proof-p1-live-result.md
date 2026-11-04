# CodeFleet P1 App Server Handshake Live Result

> **Executed:** 2026-11-04
> **Verdict:** `P1_FAIL / HOST_PROTOCOL_UNVERIFIED / M1_NOT_AUTHORIZED`
> **Git baseline:** `d2708b218fd3f11d44416a83f032f89a8e463cf7`
> **Authority:** the product owner explicitly authorized one P1 App Server Handshake execution under `codefleet-host-protocol-proof-p1-readiness.md` sections F-H. This record grants no retry, P2/P3, Operator, product implementation, Runtime/State, or M1 authority.

## 1. Outcome

P1 was executed exactly once. The pre-spawn identity and Fixture checks passed. The client sent the approved initialization sequence, received a matching initialize response, then sent `initialized` and `model/list`.

Before a matching `model/list` response was accepted, Codex App Server emitted `remoteControl/status/changed`. That Notification was not in the approved P1 server-Notification allowlist. The client did not respond or approve it and failed closed as required. No retry or client modification occurred.

The App Server process then terminated normally with exit code 0. The Proof Client returned exit code 1 because the approved Handshake was not completed. Therefore P1 is `FAIL`, not PASS or INCONCLUSIVE.

## 2. Execution identity and preconditions

Immediately before the single execution, all approved values matched:

| Identity | Verified SHA-256 |
| --- | --- |
| Codex native executable | `9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42` |
| Proof Client | `45E930E65FE48267D2D469E8E4C372651DBFEEA333110A9A89DB1C3207779DA9` |
| Fixture input | `4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8` |
| Fixture manifest | `9452C006EC8C252A749DEFC75D3BC040CBA72BD9C07320DB80D9E8320BBA8802` |

The Fixture contained exactly the approved root entries and single Proof Client. `proof-artifacts` was empty, `proof-output.txt` was absent, and no link or Junction was present. Manifest input/client bindings matched the actual files.

## 3. Actual execution and protocol observation

Redacted command identity:

```text
<CODEX_EXE> app-server --listen stdio:// --strict-config
```

| Observation | Result |
| --- | --- |
| App Server starts | `1` |
| retries/restarts | `0` |
| Proof Client exit code | `1` |
| App Server exit code | `0` |
| process termination confirmed | `true` |
| forced termination | `false` |
| client-measured elapsed time | `1778 ms` |
| captured stdout bytes | `441` |
| captured stderr bytes | `0` |
| Threads | `0` |
| model Turns | `0` |
| tool calls / approvals | `0` |
| Fixture content writes | `0` |
| `proof-output.txt` | absent |

Minimal observed sequence:

1. client sent `initialize`, id 1;
2. server returned response id 1 with an object result and Windows platform metadata;
3. client sent `initialized`;
4. client sent `model/list`, id 2;
5. server emitted `remoteControl/status/changed` without an id;
6. client classified it as an unapproved server Notification, sent no response, and stopped;
7. App Server exited normally.

No matching `model/list` response was accepted. Model identifiers, account data, credentials, tokens, raw stdout, and raw stderr are not included in this public record.

## 4. Local Evidence

Exactly the two approved Evidence files were created under `<PROOF_ARTIFACTS>`. They remain local and are not committed to Git.

| Local Evidence | SHA-256 |
| --- | --- |
| `p1-redacted-transcript.jsonl` | `44417CAB0F1A4BF2613F7445A9DCD526EAF0656A10FA601140F0D8BBFE74CE7F` |
| `p1-result.json` | `76B2CCE4D2B94CF66294B67F863088AF7B0C4BF3B334702FD7CD367FD16F3D1C` |

The result artifact binds the same transcript SHA-256, records `P1_FAILED`, and confirms normal non-forced App Server termination. The transcript contains only the approved minimized protocol records; the rejected Notification method is retained only as the minimal failure reason in the result artifact.

## 5. Verdict and remaining authority

Acceptance required a matching `model/list` result and clean bounded termination. Termination passed, but the Handshake did not complete because a server Notification outside the approved allowlist was observed. The correct result is:

```text
P1_FAIL
APP_SERVER_EXECUTIONS_1
RETRIES_0
HOST_PROTOCOL_UNVERIFIED
M1_NOT_AUTHORIZED
```

Whether `remoteControl/status/changed` is a normal stable Notification for installed Codex `0.166.0`, and what minimal payload policy would be safe, remain `UNVERIFIED`. Resolving that question would require a new design decision, reviewed client/allowlist change, new client and manifest hashes, Fixture synchronization, and a separate execution approval. This run does not authorize any of those actions.

P2, P3, Thread/Turn creation, model execution, approval handling, sandbox enforcement, recovery, product implementation, Runtime/State changes, and M1 remain `NOT_RUN` or `NOT_AUTHORIZED`.
