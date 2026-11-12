# P1 R3 Native Codex Handshake — Reported Live Observation and Acceptance Review

**Observation date:** 2026-11-11 (owner Windows environment)
**Evidence status:** P1_R3_REPORTED_SUCCESS / P1_R3_EVIDENCE_STRUCTURALLY_CONSISTENT
**Authority status:** HOST_PROCESS_PROVENANCE_INDEPENDENTLY_UNVERIFIED / OWNER_FINAL_ADJUDICATION_PENDING
**P2 authority:** NOT_GRANTED
**Historical P1 / R2:** P1_INITIAL_FAIL_PRESERVED / R2_NOT_RUN

This document reconciles the operator-provided bounded console output and
local evidence SHA-256 digests with the reviewed source. It does not contain
or claim access to the private Fixture or raw Transcript, and is not a
self-issued independent Host Live certificate. No new Codex process was
started in preparing this record.

## 1. Reviewed source and scope

| Binding | Value / provenance |
| --- | --- |
| Repository | solzip/CodeFleet, Draft PR #24 (not merged) |
| CodeFleet source HEAD observed in owner local preflight | 622c2d85ecee3c924b71a8096bf6fff2d4e8d331 |
| Source HEAD Windows/Linux CI | GitHub Actions 42942452693: SUCCESS both OS jobs |
| Native Codex version reported by npm | @openai/codex 0.167.0 |
| Native Windows executable SHA-256 | EDFDD48F8B458AF0906E507B4CB05217B326C3D6E515E9F024E05E3B8D650F70 |
| Native Windows Authenticode | Valid; signer subject OpenAI OpCo, LLC (as locally reported) |
| Copied R3 Proof Client SHA-256 | 7B51CC058EE5D8C2E29B7558539C6314BB57650CED662731FBBB4DDFC401EDF9 |
| Fixed input SHA-256 | 4422903953D9E13F4393177E5A851C37E759A8DE57EDBB4E3CA09EB6B69F84B8 |
| R3 Fixture manifest SHA-256 | 764FAF1953D739FDAB3B0108F78FBBEC273F6DAC653AE10732A3283D3ABAB455 |
| Fixture | Separate, repository-external Windows R3 root; private path withheld |
| Execution limits approved in conversation | At most one native App Server Handshake; only initialize/initialized/model/list outbound; zero model Turns/tools; zero retries; no P2; max 300000ms; two exclusive-create Evidence files |
| Client-requested timeout | 290000ms; separate close/shutdown allowance |

The reported local preflight was PASS for code HEAD, status,
native/client/input/manifest SHA-256 and an empty evidence directory.
The R3 Fixture was created under a separately approved new-root write
scope, and the owner reported a separate local read-only inspection PASS
before starting the Handshake. These are reported observations, not
independently authenticated filesystem/process metadata.

## 2. Single reported P1 R3 attempt and result

| Observation | Reported result |
| --- | --- |
| Client output status | P1_HANDSHAKE_OBSERVED |
| Client passed | true |
| Proof Client exit code | 0 |
| App Server process termination | code 0 / signal null |
| Close confirmed | true |
| Forced termination | false |
| Elapsed time | 2259ms |
| Captured stdout bytes | 9542 |
| Captured stderr bytes | 0 |
| Transcript SHA-256 emitted by client | 9D3126AAC02931F33B1A57F0F6B18C6164820855E8A4DF3DD50CB47A670EE1B9 |
| Result file exists | true |
| Transcript file exists | true |
| Read-only Evidence reviewer exit | 0 |
| Reviewer verdict | P1_EVIDENCE_STRUCTURALLY_CONSISTENT_REVIEW_REQUIRED |
| Reviewer notification count | 2 |
| P1 Result file SHA-256 | 3C243161BBAB002017F7C7FD66DFD7E055C64534B860A54ED0BEE89F40B6554B |
| Actual model Thread/Turn/tool run | Not requested by this P1 client; no independent runtime effect monitor provided |

The user's report shows an outbound Handshake that reached an accepted
model/list response, followed by a clean subprocess close according to the
pinned client. Notification methods include account/updated and
remoteControl/status/changed. The console redaction replaced the
account/updated count with a placeholder; the separate structural reviewer
reported two total approved receive-only Notifications from its locally
read stored artifacts. No raw account payload was shared or added here.

The redacted Transcript and Result remain on the owner machine. The
structure reviewer checked the transcript byte hash and strict
request/response ordering, but did not attest which native process
produced them.

## 3. Deviations and evidence boundaries

- The PowerShell preflight initially failed because a prior assistant
  command omitted characters from the fixed input SHA-256. The owner
  corrected the comparison value, re-ran all seven preflight checks, and
  reported all TRUE and R3_PRE_EXECUTION_CHECK=PASS.
- During the execution handoff, the interactive Read-Host check did not
  receive the expected NOT_RUN response and printed an execution-stop
  exception. The operator then manually proceeded with the command
  assembly and did invoke the actual proof client once in the reported
  transcript. **This failed guard cannot be counted as a successfully
  enforced runtime authorization fence.**
- Separate owner authorization to perform one bounded P1 R3 Handshake had
  been given in the chat before this attempt, but the available Evidence
  does not independently attest approval actor identity, OS process
  identity/PID, exact process start count, sandbox enforcement, absence of
  external side effects, or completeness of OS audit logs.
- The pinned proof client prohibits outbound model Thread/Turn requests and
  produces a bounded JSONL receipt, but assertions about OS confinement,
  provider accounting and independent process provenance exceed this P1
  source's capabilities.
- The initial P1 actual Live FAIL on 2026-11-04 remains FAIL; R2 was
  prepared but never executed. This R3 observation is a distinct attempt
  and never overwrites or reclassifies older Evidence.

## 4. Integrity checkpoint — preserve this pair unchanged

| Private local artifact | SHA-256 observed by owner |
| --- | --- |
| p1-result.json | 3C243161BBAB002017F7C7FD66DFD7E055C64534B860A54ED0BEE89F40B6554B |
| p1-redacted-transcript.jsonl | 9D3126AAC02931F33B1A57F0F6B18C6164820855E8A4DF3DD50CB47A670EE1B9 |

Do not rerun P1 R3, delete or modify the Fixture, reset the evidence
directory, publish the raw Transcript, or store any credentials in Git.

## 5. Verdict and remaining manual adjudication

**Reproducible from the provided owner output:** one successful P1 R3
Handshake is *reported*, and the locally reviewed two-artifact redacted
Evidence set is *structurally consistent*, with a normal recorded close,
as checked by the existing offline acceptance reviewer.

**Not established:** independently authenticated actual Host process
provenance, enforced no-effect policy, independently witnessed process
start count, or a human owner-signed final Live approval receipt.
Consequently the product must not set the internal
HOST_LIVE_VERIFIED/P1_ACCEPTED flag based only on this document.

The next owner adjudication should compare the two actual private hashes,
the pinned reviewed client and Codex executable, the signed binary and npm
version, exact authorized invocation, process observation/audit where
available, and the failed interactive confirmation step. If independent
authentication is not available, preserve
P1_R3_REPORTED_SUCCESS_WITH_UNVERIFIED_PROVENANCE, and explicitly
decide whether that is sufficient for a *limited P2 design* gate.
Do not infer that P2 execution has been approved.

P2 design may proceed on paper; **P2 Live, P2 billing, public Operator
admission, source edits and Objective E2E all require distinct grants.**
