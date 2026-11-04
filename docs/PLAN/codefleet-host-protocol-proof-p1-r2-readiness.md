# CodeFleet P1 R2 App Server Handshake Readiness

> **Prepared against:** GitHub `main` `50a3ccd2ed5f580d8eb8e10cf7f6871ff0458430`
> **State:** `P1_INITIAL_FAIL_PRESERVED / P1_R2_READY_FOR_OWNER_APPROVAL / HOST_PROTOCOL_UNVERIFIED / M1_NOT_AUTHORIZED`

This record prepares a separately approved P1 R2 Handshake. It does not grant execution authority and does not change the first P1 result.

## A. P1 최초 실패의 사실관계

The first P1 started Codex App Server once. Before the matching `model/list` response was accepted, the server emitted `remoteControl/status/changed` without an `id`. The then-approved client did not recognize that Notification, sent no response, failed closed, and recorded `P1_FAIL`. The App Server subsequently exited normally with code 0. No retry occurred. The authoritative historical record remains [the first P1 live result](codefleet-host-protocol-proof-p1-live-result.md); this readiness record neither edits nor reclassifies it.

## B. 공식 Codex 0.166.0 프로토콜 근거

The tagged `rust-v0.166.0` source declares `RemoteControlStatusChanged => "remoteControl/status/changed"` in the server-Notification definitions without an `#[experimental]` attribute. The generated stable TypeScript envelope includes the same method in `ServerNotificationEnvelope`:

- [Codex `rust-v0.166.0` `common.rs`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server-protocol/src/protocol/common.rs)
- [Codex `rust-v0.166.0` `ServerNotificationEnvelope.ts`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/app-server-protocol/schema/typescript/ServerNotificationEnvelope.ts)

This source confirmation resolves only the method's stable Notification classification for Codex 0.166.0. Its live order, count, payload values, and future-version behavior remain `UNVERIFIED` until a separately approved R2 run.

## C. 실제 수정 코드와 변경 이유

The bounded client now admits exactly `remoteControl/status/changed` in `ALLOWED_SERVER_NOTIFICATIONS`. It treats the message as receive-only metadata, increments only a per-method observation count, and writes only the method name in the minimized transcript. It never stores Notification params such as `serverName`, `installationId`, or `environmentId`, never responds to the Notification, and never activates Remote Control.

The change does not widen outbound authority: only `initialize`, `initialized`, and `model/list` remain permitted. A message carrying the same method plus an `id` remains an unapproved Server Request and fails closed. Unknown Notifications, malformed JSON, duplicate or mismatched response IDs, size-limit violations, abnormal exit, timeout, identity mismatch, and unconfirmed or forced termination continue to fail.

Changed repository files are limited to:

- `tools/proofs/p1-appserver-handshake.mjs`
- `tools/proofs/p1-appserver-fake.mjs`
- `tools/proofs/p1-appserver-handshake.test.mjs`
- this readiness record

## D. 오프라인 테스트 결과

Executed without starting Codex or App Server:

| Check | Result |
| --- | --- |
| `node --check` for client, fake server, and test | PASS (3/3) |
| `node --test tools/proofs/p1-appserver-handshake.test.mjs` | PASS (27/27; 0 failed, skipped, or cancelled) |
| Copied R2 client default invocation | PASS; `appServerStarted:false` |

The 27 tests retain the prior 24 cases and add explicit coverage for duplicate response ID, receive-only `remoteControl/status/changed`, and the same method encoded as a Server Request. The fake Notification includes sentinel `serverName`, `installationId`, and `environmentId` values; none appears in the transcript. The outbound transcript remains exactly `initialize`, `initialized`, and `model/list`, proving zero response to that Notification. Unknown Notification, malformed JSON, missing/mismatched response, nonzero exit, timeout, forced termination, hash mismatch before spawn, redaction, and stdout/stderr/line limits remain covered.

No actual Codex executable, App Server, model, Thread, Turn, or tool was started by these checks.

## E. 새 Proof Client SHA-256

| Item | SHA-256 |
| --- | --- |
| Repository client | `53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67` |
| `<PROOF_ROOT_R2>/proof-client/p1-appserver-handshake.mjs` | `53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67` |

## F. 새 Fixture·Manifest·Input·Codex SHA-256

`<PROOF_ROOT_R2>` denotes the private, repository-external R2 Fixture root. Its actual user path is intentionally not published.

| Binding | State / SHA-256 |
| --- | --- |
| Fixture root | newly created; not a Git repository; no pre-existing user files |
| `fixture-manifest.json` | `F1DA12AB30B72668B0D6BFD7398EDC993433419AAFB256844D9DA8A0F00C0200` |
| `input.txt` | fixed `CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1` plus LF; `4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8` |
| copied Proof Client | `53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67` |
| installed native `<CODEX_EXE>` | unchanged; `9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42` |
| `proof-artifacts/` | exists and empty |
| `proof-output.txt` | absent |
| links / Junctions | none observed in the complete Fixture tree |

The complete Fixture tree contains only `fixture-manifest.json`, `input.txt`, `proof-artifacts/`, `proof-client/`, and the single copied client within `proof-client/`. File hashes and structure were re-read after creation. The Fixture and its future local Evidence are excluded from Git.

## G. 새로 승인받아야 할 P1 실행 범위

The product owner must separately approve all of the following as one exact R2 binding:

1. execute only `<PROOF_ROOT_R2>/proof-client/p1-appserver-handshake.mjs` with the four SHA-256 values in sections E-F;
2. start the unchanged native `<CODEX_EXE>` App Server at most once with `app-server --listen stdio:// --strict-config`, `shell:false`, and Fixture working directory;
3. permit outbound methods only `initialize`, `initialized`, and `model/list`; permit inbound receive-only Notifications only `account/updated`, `account/rateLimits/updated`, and `remoteControl/status/changed`;
4. create zero Threads and zero model Turns; perform no tool call, approval response, login, API-key creation, Remote Control activation, retry, P2, or P3;
5. allow at most 300,000 ms total and zero retries;
6. permit exactly two exclusive-create files under `<PROOF_ROOT_R2>/proof-artifacts/`: `p1-redacted-transcript.jsonl` and `p1-result.json`;
7. stop and report failure on any pre-spawn identity/path/Fixture mismatch, unregistered Notification, any Server Request, malformed or oversized protocol data, unexpected exit, timeout, nonzero exit, forced or unconfirmed termination, or any write outside the two Evidence files.

The exact proposed command remains the readiness client's `--execute` form with `<CODEX_EXE>`, `<PROOF_ROOT_R2>`, its `proof-artifacts`, `fixture-manifest.json`, the four hashes above, and `--timeout-ms 300000`. `CODEFLEET_P1_HANDSHAKE_APPROVED=P1_APP_SERVER_HANDSHAKE_APPROVED` is only a local execution acknowledgement; it cannot substitute for owner approval or identity validation.

## H. 기존 P1 Evidence 보존 확인

The existing first-run Evidence was read only after R2 preparation and retained its published hashes:

| Historical Evidence | SHA-256 |
| --- | --- |
| `p1-redacted-transcript.jsonl` | `44417CAB0F1A4BF2613F7445A9DCD526EAF0656A10FA601140F0D8BBFE74CE7F` |
| `p1-result.json` | `76B2CCE4D2B94CF66294B67F863088AF7B0C4BF3B334702FD7CD367FD16F3D1C` |

Neither historical file was deleted, overwritten, edited, copied into the repository, or reclassified. The first P1 remains `FAIL`.

## I. 재실행하지 않은 항목

- Codex App Server: `NOT_RUN`
- P1 R2 live Handshake: `NOT_RUN`
- model Thread / Turn / tool execution: `0 / 0 / 0`
- Remote Control activation or response: `NOT_RUN`
- P2 / P3: `NOT_RUN`
- CodeFleet product source, Runtime, and State changes: `NOT_RUN`
- M1 implementation: `NOT_AUTHORIZED`

## J. 최종 준비 상태

The code fix, offline fake-process verification, new isolated Fixture, identity hashes, historical Evidence preservation check, and bounded approval request are complete. Live compatibility is not established until a new owner-approved execution succeeds and its Evidence is reviewed.

```text
P1_INITIAL_FAIL_PRESERVED
P1_R2_READY_FOR_OWNER_APPROVAL
HOST_PROTOCOL_UNVERIFIED
M1_NOT_AUTHORIZED
```
