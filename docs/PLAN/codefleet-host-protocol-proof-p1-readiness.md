# CodeFleet Host Protocol Proof P1 Readiness

> **Prepared:** 2026-11-04
> **Status:** `P1_PREPARATION_COMPLETE / P1_NOT_AUTHORIZED / HOST_PROTOCOL_UNVERIFIED / M1_NOT_AUTHORIZED`
> **Authority:** preparation evidence only; this document grants no App Server, model, CodeFleet Operator, P2/P3, or M1 execution authority.
> **Protocol reference:** [Codex App Server](https://developers.openai.com/codex/app-server/)

## A. Work baseline and actual changes

The owner-selected source baseline and the isolated integration worktree HEAD were both:

```text
ab7d97d4288c6ff0243bf8c7cb1188bdb4971c48
```

The baseline was independently confirmed as the current GitHub `origin/main` before preparation. Work occurred on temporary branch `work/p1-prep-ab7d97d-20261104` in a separate clean worktree. The original local `main`, its tracked/untracked files, Runtime, State, Lease, Attempts, and Evidence/Judge records were not changed.

Prepared repository changes:

- `tools/proofs/p1-appserver-handshake.mjs`: bounded, dry-run-by-default P1 client;
- `tools/proofs/p1-appserver-handshake.test.mjs`: offline positive and negative tests;
- this readiness record;
- minimal privacy edit in `codefleet-host-protocol-proof-r1-r4-p0-preflight.md`, replacing two personal absolute paths with `<PROOF_ROOT>` while preserving the historical observation and `NOT_RUN` status.

Execution Contract R3 SHA-256 remains:

```text
5F1FB400230742D90DB7FD66494C8F2489F3425C8C9D47A0E13F48DAD0530274
```

## B. Fixture creation and validation

Public variables are binding aliases for the locally prepared paths:

```text
<PROOF_ROOT>      = disposable directory outside the CodeFleet repository
<PROOF_ARTIFACTS> = <PROOF_ROOT>\proof-artifacts
<PROOF_INPUT>     = <PROOF_ROOT>\input.txt
<PROOF_OUTPUT>    = <PROOF_ROOT>\proof-output.txt
<PROOF_CLIENT>    = <PROOF_ROOT>\proof-client\p1-appserver-handshake.mjs
<CODEX_EXE>       = installed native Codex executable
```

Before creation, `<PROOF_ROOT>` did not exist. Its existing parent was a local directory, not a link or Junction. After creation, every Fixture item was inspected: no item is a link or Junction, the root is owned by the current local account, and access is inherited from the local temporary directory. This confirms ordinary filesystem separation from CodeFleet; it does **not** prove Host sandbox enforcement.

The first directory-creation invocation used an unsupported `New-Item -LiteralPath` parameter and failed before creating anything. The candidate was rechecked as absent, then created once with the same fixed path using `-Path`; subsequent structure and manifest checks passed.

Fixture manifest:

| Item | State / SHA-256 |
| --- | --- |
| `<PROOF_INPUT>` | fixed UTF-8 text `CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1` plus LF; `4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8` |
| `<PROOF_CLIENT>` | copied from the reviewed repository client; `388442E6ED0549A51E450EB7AC10EE602DFC22BDD4933B9CE569F3A63F31BCED` |
| `<PROOF_ARTIFACTS>` | exists and empty |
| `<PROOF_OUTPUT>` | absent; must remain absent through P1 |
| `<PROOF_ROOT>\fixture-manifest.json` | variable-only manifest; `6C40FE873B65F2C2CFCBD89C4EFD8322B67050F37514F5BD9583CCE0BD48A9B4` |

The Fixture is not a Git repository and contains no user pre-existing files, credential, token, transcript, product source, Runtime, or State.

## C. Proof Client identity, function, and security boundary

Repository source:

```text
tools/proofs/p1-appserver-handshake.mjs
SHA-256 388442E6ED0549A51E450EB7AC10EE602DFC22BDD4933B9CE569F3A63F31BCED
```

The installed host was observed as Codex CLI `0.166.0`. The native Windows `codex.exe` SHA-256 is:

```text
9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42
```

Direct `codex.exe --version` execution succeeded without a shell. Therefore the earlier approval-contract example using `codex.cmd` is superseded for this Windows P1 by direct `<CODEX_EXE>` execution with `shell: false`. This observation did not start App Server.

The client uses Node.js built-ins only and defaults to dry-run. Live mode requires both `--execute` and the explicit environment acknowledgement `CODEFLEET_P1_HANDSHAKE_APPROVED=P1_APP_SERVER_HANDSHAKE_APPROVED`. These gates prevent accidental execution but do not themselves grant approval.

The only outbound protocol methods are `initialize`, `initialized`, and `model/list`. The client omits `experimentalApi`; forbids `thread/start`, `turn/start`, `thread/resume`, approval responses, and every unlisted method; validates response IDs and result shapes; stops on malformed JSON, protocol errors, unknown server requests/notifications, timeout, or early process exit; performs no retry; and launches only `<CODEX_EXE> app-server --listen stdio:// --strict-config`.

Raw stdout/stderr is not persisted. The only possible live transcript is a redacted JSONL file under `<PROOF_ARTIFACTS>`. Secret-like keys, bearer values, token patterns, the executable path, Fixture path, and artifact path are redacted. Stderr is reduced to a boolean observation and not copied into the public record.

## D. Offline validation

Environment actually checked: Windows PowerShell, Node.js `v24.14.1`.

| Command | Exit | Result |
| --- | ---: | --- |
| `node --check tools/proofs/p1-appserver-handshake.mjs` | 0 | syntax valid |
| `node --check tools/proofs/p1-appserver-handshake.test.mjs` | 0 | syntax valid |
| `node --test tools/proofs/p1-appserver-handshake.test.mjs` | 0 | 10 passed, 0 failed/skipped |
| `node tools/proofs/p1-appserver-handshake.mjs` | 0 | dry-run; `appServerStarted:false` |
| Fixture manifest/hash/output/artifact check | 0 | input/client hashes match; output absent; artifacts empty |
| `npm.cmd run check:links` | 0 | 208 Markdown files; 0 missing targets/case mismatches/anchors; external URLs not fetched |
| `npm.cmd run check:citations` | 0 | 0 broken citations in living docs; pre-existing dated/unresolved records retained |
| `npm.cmd run check:facts` | 1 | expected measurement precondition failure: product tests were not authorized/run, leaving the existing claim sink empty and 15 existing anchors unmeasured |
| `git diff --check` | 0 | no whitespace errors |

Negative coverage includes malformed JSON, mismatched/duplicate response IDs, unapproved outbound and inbound methods, `experimentalApi`, timeout, process termination, secret/path redaction, and execution without the separate approval acknowledgement. No App Server mock process was needed; protocol state and process-boundary helpers were exercised offline.

The fact-check failure is retained as a failure, not relabeled as a pass. Running `npm test` to populate its measurement sink would execute prohibited product tests, so no baseline or anchor was changed to make it green. Product regression suites remain deliberately `NOT_RUN`: this preparation does not change product behavior and the owner authorized only the bounded proof-client checks. Cross-platform behavior is `UNVERIFIED`.

## E. R1-R4 resolved and unresolved values

| Revision | `CONFIRMED` | `PROPOSED` for separately approved P1 | `OPEN` / `UNVERIFIED` |
| --- | --- | --- | --- |
| R1 Fixture | isolated non-Git Fixture exists; fixed input/client/manifest hashes; output absent; artifacts empty; no links/Junctions | retain Fixture after P1 on failure; cleanup only under separate instruction | Host sandbox enforcement; later P3 write destination and cleanup authority |
| R2 Host protocol | CLI `0.166.0`; native executable hash; shell-free direct launch; stable JSONL sequence encoded by client | one `stdio://` process; fixed `initialize` id 1, `initialized`, `model/list` id 2 | actual response schema/fields, notifications, process lifecycle, authentication metadata, runtime events |
| R3 Authority/budget | P1 has 0 Threads, 0 model Turns, 0 retries; P2/P3 prohibited | one process, 5-minute wall timeout, existing Host login only, no new login/API key | P1 execution approval; enforceable monetary cap and actual cost are `UNKNOWN`; model usage/rate-limit reporting |
| R4 Acceptance | offline client checks pass; fail-closed conditions implemented | accept only matching IDs/results, model list array, clean bounded shutdown, redacted evidence, and unchanged Fixture output | all live observations; approval/sandbox/tool/Turn/recovery behavior belongs to later separately approved phases |

## F. Exact P1 execution approval request

The product owner is asked to approve only the following atomic action:

1. Run the reviewed Fixture copy `<PROOF_CLIENT>` with SHA-256 `388442...BCED` under Node.js `v24.14.1`.
2. Permit it to launch the reviewed `<CODEX_EXE>` with SHA-256 `9D563E...EB42` exactly once as `app-server --listen stdio:// --strict-config`, without a shell.
3. Permit only `initialize` id 1, `initialized`, and `model/list` id 2 over local stdio JSONL.
4. Permit existing Host metadata/auth service access only if `model/list` requires it; prohibit new login, credential creation/copying, API-key creation, network tools, model Turns, tools, Threads, approvals, retries, and P2/P3.
5. Allow at most five minutes wall time and one redacted transcript creation under `<PROOF_ARTIFACTS>`; allow no other write.

Approval must bind the exact hashes above and the manifest hash. A changed executable, client, manifest, input, method set, command, path mapping, time limit, or permission invalidates the approval and requires review.

## G. P1 command and expected evidence

Only after explicit P1 approval, set the non-secret acknowledgement for that process and run:

```powershell
$env:CODEFLEET_P1_HANDSHAKE_APPROVED = 'P1_APP_SERVER_HANDSHAKE_APPROVED'
node "<PROOF_CLIENT>" --execute --codex-exe "<CODEX_EXE>" --fixture "<PROOF_ROOT>" --artifacts "<PROOF_ARTIFACTS>" --timeout-ms 300000
Remove-Item Env:CODEFLEET_P1_HANDSHAKE_APPROVED
```

Expected bounded evidence is:

- process launch identity and fixed command;
- matching `initialize` response id 1 with an object result;
- emission of `initialized` followed by `model/list` id 2;
- matching id 2 with `result.data` array;
- redacted transcript hash and a result summary;
- exit/termination outcome, elapsed time, and confirmation that `<PROOF_OUTPUT>` remains absent.

The observed schema, response fields, notifications, stderr presence, and termination behavior must be reported as observed, not inferred. A successful handshake proves only this stable P1 surface; it does not prove a model Turn, approval, sandbox, tool, recovery, cost control, Protected Evidence, or Execution Contract R3 end-to-end compliance.

## H. Not run and remaining blockers

The following were not run: App Server, schema generation, actual Host communication, `thread/start`, `turn/start`, `thread/resume`, approvals, model Turn, tool execution, P2, P3, product tests, Pilot, CodeFleet Runtime/State, merge, or M1 implementation.

P1 remains blocked only on an explicit owner approval binding the exact command, hashes, one-process/five-minute/no-retry budget, existing-login metadata access, and artifact policy. The live protocol and runtime observations remain `UNVERIFIED`. P2/P3 require new, independent authority even if P1 succeeds.

Stop P1 immediately on any hash/baseline mismatch, unexpected Fixture content, unknown server method, malformed JSON, mismatched ID, protocol error, request for login/credential/approval, attempted Thread/Turn/tool creation, output outside `<PROOF_ARTIFACTS>`, timeout, process restart, retry, or uncertain side effect. Preserve the Fixture and report the failure; do not broaden authority or auto-repair.

## I. Current determination

```text
P1_PREPARATION_COMPLETE
P1_NOT_AUTHORIZED
HOST_PROTOCOL_UNVERIFIED
M1_NOT_AUTHORIZED
```

This preparation is `DOCUMENTED` and locally verified at the offline-client level only. It is not Host Live or Protected Evidence.
