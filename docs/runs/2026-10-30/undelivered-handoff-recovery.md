# Explicit recovery from observed Agent Handoff nondelivery

- 작업 일시: 2026-10-30 17:40 KST 이후
- 대상 커밋: `051314e0a30f4b527f9750c6ee839335cb559b44`, `work/p0-persistent-worklog`
- 작업 유형: scoped Core correction and regression; no Live execution or Git publication.
- 선행 문서: [PR 13](https://github.com/solzip/CodeFleet/pull/13), [Recovery contract](../../implementation/objective-recovery.md), [prior combined regression](supervised-adoption-repair.md).
- 번호 실측 최대값: P0-17 / P1-61 from the existing audit; no new registry ID.

## Reproduction

Git started clean at the approved branch/commit. GitHub inline-review lookup returned
no threads; the user's reported defect was verified directly against this baseline.
Three new regressions failed before the fix: exit 1, 0 PASS / 3 FAIL. The two
same-contract/revised-contract cases demonstrated the lack of an explicit closure
command after a confirmed false receipt; their existing prepare/deliver calls were
already blocked. The third exposed missing `delivered` being treated as false.
The original log is retained locally as `.codefleet/undelivered-before.log`.

## Minimum change and authority

- `src/product/work-log.mjs`: validate explicit boolean nondelivery receipts;
  append a separate AGENT_HANDOFF_CLOSED event for an exact current-revision user
  request; preserve status UNDELIVERED and observation history. Only coordination
  is resolved. Guard newer dispatches while an older same-WorkItem handoff remains
  unresolved, including stale uncertain dispatches. Never infer nondelivery from a
  missing outcome or discard uncertainty merely because the contract changed.
- `src/product/cli.mjs`: expose `objective handoff-close TASK INPUT.json`, accepting
  only revision/handoffId/reason. It cannot accept an observation or call a Host.
- `test/work-log.test.mjs`: five new combined and negative cases.

After closure, an explicit ordinary handoff preparation binds a new packet and ID to
the current workflow, contract, WorkItem and assigned Agent. A revision may already
have prepared the replacement through the existing revision transaction; closure
does not prepare another. Reusing or acknowledging the old closed packet is refused.
Assignment can change only after pending handoffs are resolved. Preparation and
closure retain executionGranted/modelInvocationGranted/automaticReplay false.

The original UNDELIVERED receipt is not rewritten into ACKNOWLEDGED or a completed
WorkItem. DELIVERY_UNCONFIRMED stays RECONCILE until independently supplied trusted
transport records settle it. A late confirmed false receipt remains UNDELIVERED and
can be explicitly closed even after a revision; no old contract response is adopted.
Malformed legacy nondelivery records now fail closed instead of becoming closure
authority. This is deliberate; no migration fabricates missing observations.

## Regression scope

The five tests cover:

1. Observed false -> explicit closure -> reassignment/new preparation on the same
   contract, preserving previously consumed decisions, attempts, approvals and Evidence.
2. Observed false -> accepted Contract Revision -> explicit old-packet closure,
   retaining the already-prepared current-contract packet and the same budget.
3. Missing outcome, caller JSON and untrusted reconciliation cannot close uncertainty;
   duplicate dispatch is blocked and separate-process Recovery remains RECONCILE.
4. Revision changes inside the transport callback but no outcome is returned: the
   old uncertainty blocks the new packet; late trusted false plus explicit closure
   permits review of the new packet without sending it.
5. A provider-labelled forged nondelivery event cannot become closure evidence;
   Recovery fails closed and no closure event is written.

The observations are injected through the trusted embedding seam in synthetic
fixtures. There are no actual Host model/message calls. This proves Core transition
and persistence behavior, not independent Host Live delivery observation. Separate
Node processes read the same SQLite to verify recovery and preserved budgets.

Initial fix selected regression: exit 0, 3 PASS. Expanded selected regression:
exit 0, 5 PASS / 0 FAIL / 0 SKIP.

Final regression commands (each exit 0, no failures or skips):

| Command | Result |
| --- | --- |
| `npm.cmd run test:host-core` | 132 PASS, including all 20 Work Log tests |
| `node --test test/continuation.test.mjs test/repair-loop.test.mjs test/native-local.test.mjs` | 85 PASS |

Legacy 324 PASS is the prior baseline, not a new execution in this run.
`npm.cmd run posttest` also passed (exit 0): no broken links, living-document
citations or fact mismatches. Historical citation warnings remain unchanged:
65 unresolved and 15 suspect; the unchecked-number baseline remains 539.
Final tested SHA-256 values:

- `src/product/work-log.mjs`: `88556bbe2f2f262cd415b6076779154c3f6f7ddd633c7293834fe837cd27cefe`
- `src/product/cli.mjs`: `eb86129f84a00da3f2a20a9ccd4811b0ee0a8482aeb708e2f200854a95e9d1c4`
- `test/work-log.test.mjs`: `f45a2f4001d37467a8f6d5caf9ce5e0c593cfa5de22e1c4f113e18622cf19cf9`

Environment: Windows / PowerShell / Node 24.14.1.

## Live preservation and limits

The completed Live Objective was not executed. Read-only State table fingerprint
still matches `bfdf8950b0ed0031cd312be32c2e1d152d6dd011c3c733ca61842337456eb9f5`;
all 55 Artifact filename/byte hashes match
`b85ae659f1c4d4772d4cabed9c9fc11f01196fb2923ef6a42c5a3a45c2c69fea`.
No existing Evidence, approval, Decision or budget record was changed.

The same-user Store and trusted callback remain the authority boundary. This does
not authenticate arbitrary embedding code or attacker-controlled database contents.
PUBLIC_DELEGATION_BLOCKED, Protected UNSATISFIED and actual Host-session/compaction
NOT_VERIFIED remain. No new DB, scheduler, Agent engine or automatic retry was added.
No Commit, Push, PR mutation, Merge or other Worktree modification was performed.

## 결론

Confirmed nondelivery now has a separate explicit closure and fresh-preparation
path; uncertain delivery never receives an automatic retry or execution grant.

## 다음 작업

Review the bounded correction and final regressions for PR integration. Commit and
Push require separate approval; this task does not alter PR 13 remotely.

## 미해소로 남긴 것

Actual Host Live false-delivery/restart/compaction acceptance, public delegation,
Protected verification, macOS/Linux and product-wide E2E remain outside this run.
