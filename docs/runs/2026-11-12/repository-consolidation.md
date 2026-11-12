# Repository consolidation — owner-authorized execution record

| Field | Value |
| --- | --- |
| Work date | 2026-11-12 KST |
| Target commit | `d476bc35bf71f520bd2cd1da74d515f2bf4a496e` |
| Type | All-branch integration, exact-source validation and reversible ref cleanup |
| Predecessor | [Branch review](../../handoffs/2026-11-12/REPORT_KO.md) |
| New audit ID | None; no finding is reclassified |

## Scope and resolution

All original 26 branch HEADs are ancestors of the target commit, including all six maximal source tips. No branch content was discarded merely because it was old. Duplicate patch histories were joined after verifying that they introduced no additional file changes.

The managed Goal/recovery CLI and MCP/Work Log commands are retained together. Read-only Store commands are the union of both reviewed lists. Package scripts retain MCP, installed Goal, Todo, Live-safety and managed recovery coverage, plus the P1/P2 offline suites. Documentation index entries from both histories are retained and measured counts recomputed. Existing item-binding and criterion-identity fixes remain present.

P2 native execution remains blocked; P1 old-R2 execution remains on hold. Source integration, offline tests and repository cleanup do not grant model usage or establish Host Live, protected Owner identity or a monetary cost cap.

## Evidence and deletion gates

[Snapshot and source tree digests](../../handoffs/2026-11-12/branch-consolidation.json) bind every original branch. Source/test/tools/package trees equal the independently reviewed local integration. Local Node 22 syntax and link checks passed; local facts check exited 1 because Legacy measurements had not run. The exact integrated candidate must pass Node 24.14.1 Windows and Linux mandatory suites and both no-model Codex CLI compatibility jobs before cleanup.

At this record's creation CI and cleanup are PENDING. Actual results are in Repository consolidation Actions, including its candidate SHA, job conclusions and cleanup artifact. No future PASS is asserted here.

Cleanup requires an unchanged remote snapshot, all original HEADs in candidate ancestry, remotely confirmed archive tags, and success of every required validation job. It then atomically fast-forwards main and deletes only the snapshotted non-main branches using exact ref leases. The work branch stays at the same tested candidate. Any drift or failed gate stops deletion. Superseded PR discussions and their historical evidence remain available.

## Conclusion

All source histories are integrated; actual CI and ref-mutation results must be read from the exact Actions run. No real model acceptance is claimed.

## Next work

Use the [consolidated local instructions](../../handoffs/2026-11-12/CONSOLIDATED_LOCAL_TESTS_KO.md) after cleanup. Do not reuse the historical fde7689-only checkout gate.

## Unresolved

Actual Codex/Claude model acceptance, browser E2E, Owner authentication and cost limits remain open. The user's local branches, unpublished commits and worktrees were not deleted or inspected.
