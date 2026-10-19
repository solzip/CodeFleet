# Repository baseline and source-linked change mapping

This mapping is based on a **read-only inspection** of GitHub `main` on 2026-10-19. Before editing, capture `git rev-parse HEAD`, `git status --porcelain`, runtime versions, full test exit codes, and inspect code locally. The branch may have changed.

## Verified by source inspection (NOT by executing)
- `package.json`: `0.2.0-alpha.4`; Node `>=24.14.1`, ESM, test:legacy + test:alpha, separate `codefleet` and `codefleet-alpha` bins.
- `src/alpha/controller.mjs`: `createRun`, `execute`; baseline verification, bounded generation/repair, lease/control, delivery reconciliation.
- `src/alpha/store.mjs`: Node `DatabaseSync`, WAL, tables `runs` and `events`, owner/lease/pid, hash-addressed JSON artifacts, schema `user_version=1`.
- `src/alpha/provider.mjs`: Claude `--print` JSON-schema, **no tools**, constrained edit proposals; provider-reported cost only.
- `src/alpha/contract.mjs`: schema v1 explicit path/test scope; bounded edits, source-only edit restrictions; no automatic natural-language parser.
- `src/alpha/verifier.mjs`: isolated verifier; `src/alpha/workspace.mjs`: repository snapshot/context.
- `src/alpha/delivery.mjs`: draft PR and remote reconciliation, bounded external effect.
- `src/cli.ts`, `src/run.ts`, `src/task-ledger.ts`: legacy approved revision / run / review / apply pathway; archive semantics.
- `CLAUDE.md`: current alpha scope is `docs/product-completion/`; legacy freeze text is historical. Tests/document checks are contractual.
- `docs/product-completion/progress.md`: public alpha.4 and internal Node/Java exercise recorded; independent external self-onboarding remains pending at dated snapshot.

## Map: reuse / extend / new
| Requirement | Existing location | Change |
|---|---|---|
| Core verification truth | alpha/controller, verifier, contract | PRESERVE; pull out pure decision function only under behavior-equivalent tests |
| Task/approval/event semantics | legacy task-ledger; alpha contract | REUSE semantic invariants, don't directly couple alpha runtime to frozen legacy TS APIs |
| SQLite + lease + artifacts | alpha/store | EXTEND via versioned migration, preserving old DB read/write paths |
| Claude proposal provider | alpha/provider | WRAP behind provider adapter without loosening no-tool constraints |
| Codex proposal provider | none in alpha; legacy adapter exists | ADD via capability-gated no-tool structured proposal; live compatibility test before declaring supported |
| Natural-language intent | none confirmed in alpha | ADD untrusted planner proposal -> V2 draft -> explicit validation/authorization |
| WorkItem DAG and revision | no general multi-workitem engine confirmed | ADD gradually, using one coordinator and durable graph revisions |
| Scheduler and role routing | partial legacy concepts | ADD on confirmed capability subset; one worker default |
| Parallel integration | none confirmed | ADD only after isolated write and deterministic integration gates |
| CLI | alpha/cli, legacy/cli | EXTEND preserving both old commands, expose new command only after E2E |
| Evidence/report | alpha artifacts, legacy run-record | ADD derivative views, do not replace authority truth |

## Current conflicts with earlier conceptual package
1. `.codefleet/config.yaml` is not a known current Alpha configuration; legacy docs describe `.codefleet/config.json`. DO NOT silently replace it.
2. New greenfield SQLite `runs/work_items/attempts` schema cannot replace alpha's existing JSON run body and `user_version=1` without a migration.
3. Existing `codefleet-alpha run` requires a contract file; new `codefleet run "goal"` must coexist with legacy `run <task-id>` or use disambiguation / new explicit subcommand before changing dispatch.
4. Alpha is **proposal-only**, not free tool-using AI. Broadening permissions contradicts the current enforced safety boundary.
5. Current Alpha `Store` has real lease and event logic; do not duplicate it in a parallel persistence engine.
6. Published alpha status does not establish independent user adoption or arbitrary runtime/security guarantees.

## Preflight blockers
- Dirty checkout; unknown Node/Claude/Codex/Docker availability; main diverged; previous tests failing; migration feasibility unclear; OS capability tests absent. Report individually rather than marking done.
