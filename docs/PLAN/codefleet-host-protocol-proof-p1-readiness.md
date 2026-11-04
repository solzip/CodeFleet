# CodeFleet Host Protocol Proof P1 Readiness

> **Prepared:** 2026-11-04
> **Status:** `P1_CLIENT_HARDENING_COMPLETE / FIXTURE_CLIENT_SYNC_REQUIRED / P1_NOT_AUTHORIZED / HOST_PROTOCOL_UNVERIFIED / M1_NOT_AUTHORIZED`
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

Fixture manifest at the original `d48d4dbe490399fcc80500f794e14b33c7c3b018` preparation baseline (historical snapshot, not rewritten by the hardening work):

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
Original prepared SHA-256 388442E6ED0549A51E450EB7AC10EE602DFC22BDD4933B9CE569F3A63F31BCED
Hardened source SHA-256 45E930E65FE48267D2D469E8E4C372651DBFEEA333110A9A89DB1C3207779DA9
```

The external Fixture was deliberately not modified in this hardening task. Its copied client and manifest therefore still bind the original prepared client hash. P1 cannot be approved or run until a separately authorized Fixture synchronization copies the hardened client, updates the manifest client hash, recomputes the manifest hash, confirms the Fixture is otherwise unchanged, and records those new values. The client will reject the stale Fixture before spawn.

The installed host was observed as Codex CLI `0.166.0`. The native Windows `codex.exe` SHA-256 is:

```text
9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42
```

Direct `codex.exe --version` execution succeeded without a shell. Therefore the earlier approval-contract example using `codex.cmd` is superseded for this Windows P1 by direct `<CODEX_EXE>` execution with `shell: false`. This observation did not start App Server.

The client uses Node.js built-ins only and defaults to dry-run. Live mode requires both `--execute` and the explicit environment acknowledgement `CODEFLEET_P1_HANDSHAKE_APPROVED=P1_APP_SERVER_HANDSHAKE_APPROVED`. That acknowledgement is only an accidental-execution guard; it is not product-owner approval and cannot replace the four required SHA-256 checks.

Before spawn, the hardened client verifies the approved SHA-256 of `<CODEX_EXE>`, its own executed Fixture copy, `<PROOF_INPUT>`, and `<PROOF_ROOT>\fixture-manifest.json`. It also verifies the manifest's variable bindings and embedded input/client hashes; exact real paths; absence of link/Junction resolution; the exact four-entry Fixture root; the single expected client file; and an empty `<PROOF_ARTIFACTS>`. Missing or mismatched identity blocks before the spawn function is called.

The only outbound protocol methods are `initialize`, `initialized`, and `model/list`. The client omits `experimentalApi`; forbids `thread/start`, `turn/start`, `thread/resume`, approval responses, and every unlisted method; validates response IDs and result shapes; stops on malformed JSON, protocol errors, timeout, or early process exit; performs no retry; and launches only `<CODEX_EXE> app-server --listen stdio:// --strict-config`.

A server message with `id` and `method` is a Request and is always rejected without response. A message with `method` and no `id` is a Notification. P1 permits only the officially documented stable `account/updated` and `account/rateLimits/updated` Notifications and records only their method names; all other Notifications fail closed. The official documentation is current, but the completeness of this allowlist for installed Codex `0.166.0` remains `UNVERIFIED` until version-specific schema evidence exists. No unknown event is inferred safe.

Raw stdout/stderr is not persisted. Each JSONL line is limited to 256 KiB, total stdout to 2 MiB, stderr to 64 KiB, and the manifest to 64 KiB. The public transcript retains only direction, method, response ID, selected initialize platform fields, and model identifier/default/reasoning-effort metadata. Notification params, account data, credentials, tokens, descriptions, user paths, and arbitrary response fields are omitted. Stderr content is never stored.

After handshake completion the client closes stdin and requires the child to exit. A bounded forced termination may clean up a failing process but cannot produce PASS. PASS requires confirmed termination with exit code 0. The result artifact records the redacted command, elapsed milliseconds, stdout/stderr byte counts, exit code/signal/forced status, minimal error, and transcript SHA-256. Both success and post-spawn failure produce minimal evidence using exclusive-create semantics; pre-spawn identity failure produces no artifact mutation.

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

### D.1 Hardening verification at current baseline

The earlier 10-test result above remains a historical preparation result. The hardened client was independently checked with a separate fake local process; no Codex executable or App Server was started.

| Command | Exit | Result |
| --- | ---: | --- |
| `node --check tools/proofs/p1-appserver-handshake.mjs` | 0 | syntax valid |
| `node --check tools/proofs/p1-appserver-fake.mjs` | 0 | syntax valid |
| `node --check tools/proofs/p1-appserver-handshake.test.mjs` | 0 | syntax valid |
| `node --test tools/proofs/p1-appserver-handshake.test.mjs` | 0 | 24 passed, 0 failed/skipped |

Verified hardening file identities:

| File | SHA-256 |
| --- | --- |
| `tools/proofs/p1-appserver-handshake.mjs` | `45E930E65FE48267D2D469E8E4C372651DBFEEA333110A9A89DB1C3207779DA9` |
| `tools/proofs/p1-appserver-handshake.test.mjs` | `142A15503F6E3963F74FFE7AD28FB55D4F8ACAAF37A6933630018BB7CE31BACD` |
| `tools/proofs/p1-appserver-fake.mjs` | `9A4AE072993F5BD9AF6BD32C29AC88B6B376B28224CCFF880E3706B3B9CD315F` |

The 24 tests cover successful handshake and confirmed zero exit; forced-termination rejection; documented and unapproved Notifications; unapproved server Request without response; missing, mismatched, and malformed responses; nonzero exit; timeout; per-line, total stdout, and stderr size limits; Codex/client/input/manifest hash mismatches before spawn; artifact-path mismatch before spawn; minimal transcript fields and redaction; transcript hash; dry-run default; and the non-authoritative execution acknowledgement. Temporary fake fixtures were deleted by the tests. The prepared external Fixture was not read or changed by these tests.

The current link and citation checks exited 0. `check:facts` again exited 1 because product tests were prohibited and the existing measurement sink remained empty; the same 15 existing anchors were unmeasured. This failure is retained and no baseline or claim was altered.

## E. R1-R4 resolved and unresolved values

| Revision | `CONFIRMED` | `PROPOSED` for separately approved P1 | `OPEN` / `UNVERIFIED` |
| --- | --- | --- | --- |
| R1 Fixture | original isolated non-Git Fixture snapshot exists; input hash remains historical | separately authorize hardened-client copy and manifest rebind before P1 | new Fixture client/manifest hashes; Host sandbox enforcement; later P3 write destination and cleanup authority |
| R2 Host protocol | CLI `0.166.0`; native executable hash; shell-free direct launch; stable JSONL sequence encoded and fake-process tested | one `stdio://` process; fixed `initialize` id 1, `initialized`, `model/list` id 2 | installed-version Notification completeness, actual response schema/fields, process lifecycle, authentication metadata, runtime events |
| R3 Authority/budget | P1 has 0 Threads, 0 model Turns, 0 retries; P2/P3 prohibited | one process, 5-minute wall timeout, existing Host login only, no new login/API key | P1 execution approval; enforceable monetary cap and actual cost are `UNKNOWN`; model usage/rate-limit reporting |
| R4 Acceptance | offline client checks pass; fail-closed conditions implemented | accept only matching IDs/results, model list array, clean bounded shutdown, redacted evidence, and unchanged Fixture output | all live observations; approval/sandbox/tool/Turn/recovery behavior belongs to later separately approved phases |

## F. Exact P1 execution approval request

The earlier approval-contract examples in sections 3.1, 3.3, and 7 remain preparation history: their `codex.cmd`, schema-generation, single-transcript, and `OPEN` client values are not executable authority. For Windows P1, this hardened readiness contract supersedes those command/client/artifact details with direct native `<CODEX_EXE>` execution, four mandatory identity hashes, and the two minimal Evidence files below. No approval is implied by this reconciliation.

The product owner is asked to approve only the following atomic action:

1. After separately authorized Fixture synchronization, run `<PROOF_CLIENT>` only if its SHA-256 is `45E930E65FE48267D2D469E8E4C372651DBFEEA333110A9A89DB1C3207779DA9` and the newly recorded manifest hash matches.
2. Permit it to launch the reviewed `<CODEX_EXE>` with SHA-256 `9D563E...EB42` exactly once as `app-server --listen stdio:// --strict-config`, without a shell.
3. Permit only `initialize` id 1, `initialized`, and `model/list` id 2 over local stdio JSONL.
4. Permit existing Host metadata/auth service access only if `model/list` requires it; prohibit new login, credential creation/copying, API-key creation, network tools, model Turns, tools, Threads, approvals, retries, and P2/P3.
5. Allow at most five minutes wall time and two exclusive-create Evidence files under `<PROOF_ARTIFACTS>`: `p1-redacted-transcript.jsonl` and `p1-result.json`; allow no other write.

Approval must bind the exact hashes above and the manifest hash. A changed executable, client, manifest, input, method set, command, path mapping, time limit, or permission invalidates the approval and requires review.

## G. P1 command and expected evidence

Only after explicit P1 approval, set the non-secret acknowledgement for that process and run:

```powershell
$env:CODEFLEET_P1_HANDSHAKE_APPROVED = 'P1_APP_SERVER_HANDSHAKE_APPROVED'
node "<PROOF_CLIENT>" --execute `
  --codex-exe "<CODEX_EXE>" --fixture "<PROOF_ROOT>" `
  --artifacts "<PROOF_ARTIFACTS>" --manifest "<PROOF_ROOT>\fixture-manifest.json" `
  --codex-sha256 "9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42" `
  --client-sha256 "45E930E65FE48267D2D469E8E4C372651DBFEEA333110A9A89DB1C3207779DA9" `
  --input-sha256 "4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8" `
  --manifest-sha256 "<APPROVED_UPDATED_MANIFEST_SHA256>" --timeout-ms 300000
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

P1 remains blocked first on separately authorized Fixture client/manifest synchronization and verification, then on explicit owner approval binding the exact command, all four hashes, one-process/five-minute/no-retry budget, existing-login metadata access, Notification policy, and two-file artifact policy. The live protocol and runtime observations remain `UNVERIFIED`. P2/P3 require new, independent authority even if P1 succeeds.

Stop P1 immediately on any hash/baseline mismatch, unexpected Fixture content, unknown server method, malformed JSON, mismatched ID, protocol error, request for login/credential/approval, attempted Thread/Turn/tool creation, output outside `<PROOF_ARTIFACTS>`, timeout, process restart, retry, or uncertain side effect. Preserve the Fixture and report the failure; do not broaden authority or auto-repair.

## I. Current determination

```text
P1_CLIENT_HARDENING_COMPLETE
FIXTURE_CLIENT_SYNC_REQUIRED
P1_NOT_AUTHORIZED
HOST_PROTOCOL_UNVERIFIED
M1_NOT_AUTHORIZED
```

This preparation is `DOCUMENTED` and locally verified at the offline-client level only. It is not Host Live or Protected Evidence.
