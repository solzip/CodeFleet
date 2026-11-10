# CodeFleet P1 R2 — Offline Evidence Structure Review

> State: TOOL_IMPLEMENTED_FOR_OFFLINE_REVIEW / LIVE_EVIDENCE_NOT_PROVIDED / HOST_PROTOCOL_UNVERIFIED
>
> This aid is **not** the P1 R2 Host Proof, an execution authorization, an
> independent OS attestation, or a product Objective acceptance decision.

## Purpose

After a separately authorized Codex 0.166.0 P1 R2 Handshake **actually**
produces the two local Evidence files, this command can check whether their
redacted content has the bounded shape and internally consistent sequence of
the approved P1 Handshake. It does not connect to Codex, start any model,
read Codex credentials, modify the Fixture, or write Evidence.

The historical first P1 result is P1_FAILED; the reviewer must reject it.
A fake process can create structurally consistent files, so a structural
PASS must **never** be labelled real Host Live verified.

## Read-only command

From the reviewed CodeFleet source checkout, after the actual P1 R2 Proof
has completed, run:

~~~powershell
node tools/proofs/p1-r2-evidence-review.mjs --artifacts "<PROOF_ROOT_R2>\proof-artifacts"
~~~

This command accepts exactly the --artifacts flag and an absolute
directory path. It reads exactly two files:

- p1-redacted-transcript.jsonl
- p1-result.json

Do not upload raw stdout/stderr, the Codex executable, credentials, account
information, private local absolute paths, or the entire Fixture.

## What the tool checks

- The two-file Evidence set has bounded regular files and no extra entries.
- The result reports P1_HANDSHAKE_OBSERVED, passed=true, the exact approved
  command arguments, no reported error, bounded byte counts and duration,
  and a confirmed, non-forced, clean App Server exit.
- The transcript's SHA-256 matches the exact bytes referenced by the result.
- Transcript content is the minimized, no-raw-params form and shows the
  expected initialize request and response, initialized notification,
  model/list request and response **in order**.
- Only the three explicitly allowed receive-only notification method names
  may appear before completion; their counts must agree with the result.
- Unexpected commands, server requests, extra payload fields, post-completion
  frames, malformed JSONL, failed/partial Evidence, and structural drift
  are rejected.

## Result and authority boundary

A successful structure check returns:

P1_EVIDENCE_STRUCTURALLY_CONSISTENT_REVIEW_REQUIRED

It also returns two *file* SHA-256 digests and p1Accepted=false,
hostProtocolVerified=false, executionAuthorized=false, and
ownerReviewRequired=true. The digests can be independently compared with
the owner's actual Evidence files. They do **not** prove where files came
from, whether the installed Codex was invoked, or whether a person approved it.

A failing check prints P1_EVIDENCE_NOT_ACCEPTED, a bounded reasonCode,
and exits with status 2. The tool does not echo raw Evidence or user paths.

## Mandatory manual checks before considering P1 R2 accepted

1. Reconcile the *actual owner-approved execution* and unchanged R2 client
   hash in codefleet-host-protocol-proof-p1-r2-readiness.md.
2. Independently inspect the approved native Codex executable version and
   SHA-256, full Fixture identity and initial empty artifacts directory,
   and run command, count, duration, no-retry and approval scope.
3. Bind the two actual locally produced Evidence file SHA-256 values and
   transcript to the original P1 R2 execution record. A self-reported JSON
   result cannot authenticate itself.
4. Review any deviations, nonzero exit, extra effects, unknown outputs or
   missing receipts; preserve historical failed Evidence without overwrite.
5. Record a separate explicit P1_R2_HOST_LIVE_VERIFIED or P1_R2_FAIL
   adjudication based on the **real** observed Host, not this tool.
6. P2 model Turn and M1/M2 implementation/Operator permissions remain distinct
   subsequent owner approvals; no approval is inherited from a P1 report.

The independent Objective Judge is a later, separate product gate and cannot
be satisfied by a successful App Server handshake.
