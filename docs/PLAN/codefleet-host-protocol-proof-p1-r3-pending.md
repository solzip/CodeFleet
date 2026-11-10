# P1 R3 candidate — stdio-drain safety and new approval requirements

> **State:** R2_SUPERSEDED_UNEXECUTED / R3_CODE_CANDIDATE /
> R3_FIXTURE_NOT_PREPARED / R3_OWNER_APPROVAL_NOT_GRANTED /
> HOST_PROTOCOL_UNVERIFIED

This is a candidate code/review record, **not** an owner approval or
an authorization to create/alter private Fixture files. The original
2026-11-04 P1 Live result remains FAIL. P1 R2 remains NOT_RUN.

## Confirmed finding

The old P1 R2 proof client treated process exit as enough to confirm
termination without draining stdout/stderr or rejecting trailing incomplete
JSONL after a successful model/list response. A deterministic offline
simulation of its exact handshake loop accepted malformed trailing data and
returned P1_HANDSHAKE_OBSERVED / passed=true.

**Do not execute the former R2 command or reuse its private Fixture.**
Neither its original failure history nor its NOT_RUN status may be changed.

## Corrected candidate in Draft PR #21

The client now observes process close before accepting a successful
Handshake, rejects trailing non-whitespace partial JSONL and any unsolicited
post-completion requests, fails on unconfirmed stream close, and redacts
untrusted child/pipe error details. Fake-process negative regressions verify
these conditions without real Codex calls.

| Identity | SHA-256 |
| --- | --- |
| Historical prepared R2 copied client — DO NOT EXECUTE | 53E3DBBBB9C8C1318FAA7A0563E27C368A87494F2862DBA6332FF80E7FE67C67 |
| Corrected candidate client source — NOT YET APPROVED | 7B51CC058EE5D8C2E29B7558539C6314BB57650CED662731FBBB4DDFC401EDF9 |
| Historical native Codex executable binding — RECHECK REQUIRED | 9D563EE4E0441FF9D59D612013E0460DDF8E5709735C2D9F6B98B7EF8CA4EB42 |
| Historical fixed input binding — RECHECK REQUIRED | 4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8 |
| New copied client and Fixture manifest | UNPREPARED / NOT_VERIFIED |

The new source SHA-256 was computed from GitHub's exact candidate bytes;
the hash implementation was checked against the known old R2 file digest.
This is not an attestation of the user's local Windows executable, client
copy, or new Fixture/manifest.

## Remaining mandatory gates

1. Confirm PR #21's exact-head Windows and Linux CI including all new
   trailing-message tests and the existing P1 negative checks.
2. Separately review and approve candidate source and a **new R3 Fixture
   preparation** scope. Preserve the existing R2 Fixture and historical
   failed Evidence unchanged. No automatic creation or modification.
3. On the owner Windows PC, reobserve real native Codex version and
   SHA-256, copied R3 client hash, exact input bytes, newly created
   manifest hash, directory ACLs, no symlinks/Junctions, empty artifacts,
   and exact proposed process command. Pin all four CURRENT hashes.
4. Update the read-only preflight to the approved R3 identity set, with
   independent CI. Do not allow arbitrary CLI override of approved hashes.
5. Obtain **separate explicit owner R3 Live approval**: one native
   App Server process with exact stdio and stable methods, no model Turns,
   no tools, no unapproved requests, no remote mutation, zero retries,
   at most 300,000 ms, only two exclusive-create Evidence files.
6. Run one exact approved P1 R3 Handshake. Authenticate real OS process
   observation, source/runtime identity, command, exit and Evidence SHA-256.
   The read-only Evidence reviewer is structural only; an owner must
   separately adjudicate P1 success or failure.
7. Real P2 model, M1 planning, M2 implementation, independent Objective
   E2E, Operator permissions and main merge are separately gated.

No R3 execution command is authorized or published until the new private
Fixture exists with reviewed hashes and separate explicit owner approval.

## Read-only R3 source/manifest identity packet

The candidate source and a deterministic **new, unapproved** manifest
serialization can now be inspected directly from the reviewed PR #22 source,
without starting Codex or creating or modifying a Fixture:

~~~powershell
node tools/proofs/p1-r3-source-packet.mjs
~~~

The tool accepts **no** command-line options, rejects --execute and
--prepare, pins the reviewed source-client SHA-256, computes the fixed input
and manifest SHA-256 from exact bytes, and emits an unapproved binding.
The resulting candidate manifest bytes are exercised against the existing
P1 strict identity validator using a *disposable fake* Codex file in CI.

The current deterministic **candidate** manifest SHA-256 is
764FAF1953D739FDAB3B0108F78FBBEC273F6DAC653AE10732A3283D3ABAB455.
This serialization reproduces the old R2 Manifest digest exactly when
substituting the old client's SHA-256, which cross-checks the expected
format. It is **not** the hash of an observed R3 Manifest on the owner PC.

This packet does **not** observe the owner's native Codex binary, file
system, ACLs, actual private Fixture, or owner approval. Its result says
fixturePrepared=false / nativeCodexObserved=false /
executionAuthorized=false / hostLiveVerified=false. Use these calculated
identities only as inputs to a **subsequent** separately approved private
Fixture preparation and local owner audit. Do not treat a newly printed
manifest hash as approval of any real manifest on disk.
