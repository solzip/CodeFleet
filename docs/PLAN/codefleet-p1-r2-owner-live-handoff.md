# P1 R2 Owner Live Handoff — Native Windows (No Model Turns)

> **HOLD — prepared R2 client NOT safe for owner Live acceptance.**
> An offline safety audit after this handoff was written found that its
> originally pinned P1 client can accept a completed model/list response while
> discarding a trailing incomplete JSONL fragment. The client must observe
> fully drained stdio before success. **Do not run the old R2 command below**.
> This preparation remains historical; use a separately reviewed and
> owner-approved replacement client/new Fixture. See
> codefleet-host-protocol-proof-p1-r3-pending.md. P1 R2 was NOT_RUN.
>
**State:** P1_R2_READY_FOR_OWNER_APPROVAL / HOST_PROTOCOL_UNVERIFIED / NOT_RUN

**Not an execution approval.** This handoff does not run Codex, alter the
existing P1 result, permit a P2 model Turn or authorize a CodeFleet MVP merge.

## Source and scope

- Product integration review: Draft PR #19
- Preflight and post-proof Evidence reader: Draft PR #20
- Historical first P1: FAIL, never overwritten or reclassified.
- Exact R2 bindings: codefleet-host-protocol-proof-p1-r2-readiness.md,
  sections E–G.
- Only the copied, hash-matched proof client inside the private R2 Fixture
  may run P1 R2. Do not invoke the repository source copy instead.

### Prepared SHA-256 identities

| Object | SHA-256 |
| --- | --- |
| Native Windows codex.exe | 9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42 |
| Copied R2 proof client | 53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67 |
| R2 input.txt | 4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8 |
| R2 fixture-manifest.json | F1DA12AB30B72668B0D6BFD7398EDC993433419AAFB256844D9DA8A0F00C0200 |

These hashes describe the previously prepared installation. A newly
installed Codex version, replaced client or changed Fixture requires fresh
review. Do not change hashes simply to obtain a PASS.

## 1. Read-only local preflight — no Codex process

Use an existing, reviewed CodeFleet checkout containing the PR #19 and PR
#20 scripts. Replace each placeholder with the actual private absolute
Windows path, without publishing those paths:

~~~powershell
$ErrorActionPreference = 'Stop'
$codefleet = '<REVIEWED_CODEFLEET_CHECKOUT_ABSOLUTE_PATH>'
$codexExe = '<APPROVED_NATIVE_CODEX_EXE_ABSOLUTE_PATH>'
$fixture = '<EXISTING_PRIVATE_R2_FIXTURE_ABSOLUTE_PATH>'
Set-Location -LiteralPath $codefleet
node tools/proofs/p1-r2-preflight.mjs --codex-exe "$codexExe" --fixture "$fixture"
~~~

Expected: P1_R2_PREFLIGHT_MATCHED with appServerStarted=false,
ownerApproval=NOT_ASSERTED, executionAuthorized=false, and
hostLiveVerified=false. On any other status: STOP; do not retry after
modifying Fixture contents or overwrite historical Evidence.

## 2. Mandatory separate owner authorization

The product owner must explicitly and separately approve the actual private
paths and all four exact hashes above, plus these bounds:

- One native Codex 0.166.0 App Server process at most, with shell=false,
  Fixture working directory and exactly
  app-server --listen stdio:// --strict-config.
- Outbound: initialize, initialized, model/list only.
- Receive-only: account/updated, account/rateLimits/updated,
  remoteControl/status/changed only, with no response.
- Zero Threads, model Turns, tools, approval responses, credential/login
  mutation, Remote Control activation, P2/P3 and automatic retries.
- Total wall-clock limit 300,000 milliseconds and zero retries.
- Only two exclusive-create files in the approved proof-artifacts directory:
  p1-redacted-transcript.jsonl and p1-result.json.
- On identity mismatch, unknown message, missing reply, abnormal exit,
  timeout or uncertain effect: STOP. Do not broaden the scope.

The acknowledgement environment variable in the next section does not
substitute for the owner's actual authorization. This document confers no
execution permission.

## 3. Single P1 R2 invocation — ONLY after that exact authorization

Never run this block just because the preflight matches. Check the binding
and approval immediately before starting it.

~~~powershell
$client = Join-Path $fixture 'proof-client\p1-appserver-handshake.mjs'
$artifacts = Join-Path $fixture 'proof-artifacts'
$manifest = Join-Path $fixture 'fixture-manifest.json'
$proofArgs = @(
  '--execute',
  '--codex-exe', $codexExe,
  '--fixture', $fixture,
  '--artifacts', $artifacts,
  '--manifest', $manifest,
  '--codex-sha256', '9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42',
  '--client-sha256', '53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67',
  '--input-sha256', '4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8',
  '--manifest-sha256', 'F1DA12AB30B72668B0D6BFD7398EDC993433419AAFB256844D9DA8A0F00C0200',
  '--timeout-ms', '300000'
)
$env:CODEFLEET_P1_HANDSHAKE_APPROVED = 'P1_APP_SERVER_HANDSHAKE_APPROVED'
try {
  node "$client" @proofArgs
  $proofExitCode = $LASTEXITCODE
} finally {
  Remove-Item Env:CODEFLEET_P1_HANDSHAKE_APPROVED -ErrorAction SilentlyContinue
}
Write-Output "P1_R2_CLIENT_EXIT_CODE=$proofExitCode"
~~~

A nonzero exit is a STOP, not a retry instruction. Do not run from GitHub
Actions. If pre-spawn identity checks fail, Evidence may not be generated;
a subsequent attempt with different hashes requires new authorization.
Never publish raw Host data, credentials or the private paths.

## 4. Structural Evidence review — read-only

If the authorized P1 R2 attempt generated exactly the two expected files:

~~~powershell
node tools/proofs/p1-r2-evidence-review.mjs --artifacts "$artifacts"
~~~

A structure-only match is:
P1_EVIDENCE_STRUCTURALLY_CONSISTENT_REVIEW_REQUIRED.
This explicitly remains p1Accepted=false, hostProtocolVerified=false,
executionAuthorized=false, ownerReviewRequired=true. Self-reported
transcript bytes cannot authenticate the actual producing process.

The separate owner adjudication must bind actual approved scope, native
Codex executable/version/SHA, copied client SHA, complete Fixture identity,
single process/command observation, lack of retry or additional effects,
and the two real Evidence file hashes. Only then can the owner determine
P1_R2_HOST_LIVE_VERIFIED versus P1_R2_FAIL. Preserve historical failed
Evidence; never relabel it.

## 5. Subsequent gates not authorized

P2 model Turn, M1 real Goal/Contract/DAG, M2 actual bounded source edits,
independent test and delivered-target Objective Judge, protected execution,
public delegation, main merge and product release all remain separate.

## Safe outputs for reporting

Only bring back bounded preflight status/reasonCode, P1 exit code, the
structural-review status/reasonCode, the two redacted Evidence file SHA-256
digests and whether independently observed owner approval/process evidence
is available. Keep all private paths and raw Host output on the local PC.
