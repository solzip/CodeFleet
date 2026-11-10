# Handoff trust and revision deferral correction

- 작업 일시: 2026-10-30 KST
- 대상 커밋: `051314e0a30f4b527f9750c6ee839335cb559b44`, `work/p0-persistent-worklog`, with the existing uncommitted nondelivery correction.
- 작업 유형: bounded Core correction and fixture regression; no Host Live execution or Git publication.
- 선행 문서: [initial correction](undelivered-handoff-recovery.md), [Recovery contract](../../implementation/objective-recovery.md), user review of PR 13.
- 번호 실측 최대값: P0-17 / P1-61 from the existing audit; no new registry ID.

## Why the prior result was insufficient

The initial 132/85 passing suites treated an internal callback and `observed:true`
as trusted observation. The reconciliation function could persist caller receipts
with HOST_TRANSPORT_OBSERVED authority. Contract Revision also prepared a replacement
before closing an old failed delivery. Those passes did not establish the stronger
trust and preparation conditions requested during the commit review. No commit or
push was performed after that review.

## Current transitions

| Input / existing record | Supported result |
| --- | --- |
| Authorized embedding transport callback | Persist pending effect before calling it; matched true/false report is EMBEDDING_REPORTED_ONLY, status DELIVERY_UNCONFIRMED |
| Caller receipt with observed:true | Reconciliation/ACK rejected; no independent observation event is written |
| Independent authenticated Host event | No supported verifier in this adapter; HOST_ADAPTER_UNAVAILABLE |
| Historical UNDELIVERED / DELIVERED / ACKNOWLEDGED / closure | Preserve original ledger and status, but keep unresolved with observationBlocker HOST_ADAPTER_UNAVAILABLE |
| Explicit handoff-close | Cannot authorize closure with the available evidence; fail closed without writes |
| Revision with unresolved prior handoff | Commit revised contract and AGENT_HANDOFF_PREPARATION_DEFERRED atomically; do not create replacement PREPARED |
| Revision of an unsent PREPARED packet | REJECTED_STALE for the old unsent packet; fresh packet can bind the new revision and assigned scope |

Revision deferral was chosen instead of rejecting the entire contract. An explicit
preparation still checks the current Task revision, WorkItem, assigned Agent and
all pending handoffs. Deferred preparation is never automatically replayed.
No valid independently grounded nondelivery closure can currently be produced.
The positive failed-delivery closure/reprepare case is therefore BLOCKED, not
VERIFIED by a fixture that injects an authority label. This limitation is intentional.

Only work-log.mjs and CLI help changed in production. Existing SQLite transactions,
events, artifacts, guards and Recovery projections are reused. Historical labels
are not rewritten or upgraded. No new verifier, credential mechanism or state store
was introduced. Local supervised proposal adoption remains available for an unsent
PREPARED packet; a dispatch report cannot be used to enter that exception.

## Regression evidence

The first transitional Work Log run retained old success expectations and returned
exit 1: 16 PASS / 4 FAIL. These failures exposed assumptions that must no longer
hold (callback false confirms failure; revision prepares a new packet; caller
observed=true resolves uncertainty). Its log is retained locally. An editing helper
also failed with a Python quoting SyntaxError before changing any file; subsequent
edits used apply_patch.

The updated combined flow uses the existing supervised proposal review and separate
approvals to finish Local work; it no longer fabricates a Host ACK. Consumed Decisions,
Attempts, approvals, reservations and Evidence remain checked across revision and
separate-process Recovery. False/true embedding reports, forged authority fields,
wrong Agent/packet, late old-contract results, duplicate sends, legacy closure and
ACK labels are covered. Existing repair and execution-safety tests are retained.

The intermediate updated Work Log suite returned exit 0: 22 PASS / 0 FAIL / 0 SKIP.
One additional historical DELIVERED/ACKNOWLEDGED negative case was then added.
Final results (each exit 0, no failures or skips):

| Command | Result |
| --- | --- |
| `npm.cmd run test:host-core` | 135 PASS, including all 23 Work Log combination/negative tests |
| `node --test test/continuation.test.mjs test/repair-loop.test.mjs test/native-local.test.mjs` | 85 PASS |

Legacy 324 PASS remains historical; that suite was not rerun. Final tested SHA-256:

- `src/product/work-log.mjs`: `77fb0a616e15228d62c053621fd9f2f4f43834f577d72fd8cff3ac39f564f723`
- `src/product/cli.mjs`: `557ee188e036cdc50d4cdaca8cec963cfb98c97b5e8872a4527b84554f85e3ea`
- `test/work-log.test.mjs`: `b23a004e835a596753d26612d40c17a7e9bfa6064110e3fe3679c7a1eec7f3b7`

`npm.cmd run posttest` passed with exit 0: no link, living citation or declared-fact
errors. Historical warnings remain 65 unresolved citations and 15 suspect citations;
the unchecked-number baseline remains 539. `git diff --check` passed with exit 0.

Environment: Windows,
PowerShell, Node 24.14.1. All Host callback results are synthetic fixture reports,
not actual independently observed Host delivery events.

## Preservation

Read-only inspection matched the existing Live State fingerprint
`bfdf8950b0ed0031cd312be32c2e1d152d6dd011c3c733ca61842337456eb9f5`
and all 55 Artifact filename/content hashes
`b85ae659f1c4d4772d4cabed9c9fc11f01196fb2923ef6a42c5a3a45c2c69fea`.
The completed Live Objective was not executed. No model or subagent was invoked;
no other Worktree was modified. Raw logs/fixtures remain outside tracked files.

## 결론

Internal reports no longer create independently observed delivery success/failure.
Unresolved handoffs defer revision-time preparation and retain conservative recovery.

## 다음 작업

Review this bounded correction for Git integration. Commit, Push, Ready and Merge
were not performed. Actual Host observation requires a supported interface and
separate acceptance; this change does not implement that capability.

## 미해소로 남긴 것

Delivered/nondelivered authentication and successful failed-delivery closure are
HOST_ADAPTER_UNAVAILABLE. Actual Host session boundaries and compaction remain
NOT_VERIFIED; PUBLIC_DELEGATION_BLOCKED and Protected UNSATISFIED remain.
