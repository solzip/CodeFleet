# Development and evidence records

## Current authority

Read [product principles](docs/PRODUCT_VISION.md), [architecture](docs/product-completion/architecture.md), [roadmap](docs/product-completion/roadmap.md) and the applicable [implementation contract](docs/implementation/) before implementation. [Progress](project/PROGRESS.md) records actual verified scope, not a second specification. Host instructions in AGENTS.md and CLAUDE.md apply.

## Where information belongs

- `docs/`: current product principles, architecture, acceptance criteria and active implementation contracts only. Update the responsible document instead of adding session reports or competing specifications.
- `guides/`: public installation and usage instructions, with explicit support limits.
- `project/PROGRESS.md`: one current implementation/verification/blocker summary with evidence references and the next permitted action.
- `project/records/`: deliberately published, sanitized audit, decision or execution records when a durable report is needed. Use `YYYY-MM-DD-slug.md`, with `-v2` for a distinct rerun; never overwrite an earlier result.
- Existing run state, Work Log and evidence artifacts remain in their existing stores. Do not create a second execution store. Raw local runs, Host responses and databases are not public documentation.
- `test/contracts/legacy/`: preserved Legacy/Alpha specifications, historical measurement inputs and immutable coverage baselines. These are regression contracts, not the current product roadmap.

Do not recreate `docs/audits`, `docs/runs`, per-session indexes or a second current defect register. An analysis-only response does not require a new public file unless requested; changes must leave their durable outcome in the responsible contract/status document. Put only significant reusable evidence in a separate published record.

## Required evidence

For a published verification record, state date, baseline and candidate, contract/revision, scope, OS/shell/runtime, actual commands and each immediate exit code. Report failures, skips, NOT_RUN and BLOCKED separately. Include conclusions, unmet criteria, evidence locations and next permitted action. Never turn historical or offline passes into current Host Live or Protected acceptance.

Use stable finding IDs if a finding is recorded; inspect existing IDs before allocation. Corrections preserve the original evidence and identify what changed. Cite the actual candidate's source/test locations; do not invent missing evidence. Zero examined items is not a pass. A feature without required tests and Live evidence is not accepted.

Capture exit codes before any subsequent command or pipeline. On PowerShell use `$LASTEXITCODE` immediately after the native command; on POSIX capture `$?` immediately. Do not discard failure output or rely on a pipeline's final exit code.

## Verification and publication

Follow [verification paths](CLAUDE.md#verification-paths). A documentation edit does not authorize lowering rule coverage or numeric-anchor baselines. When moving an asset, update all consumers and test missing/malformed-input failures as well as success. Preserve existing FINAL RULEs, Alpha contracts, security gates, licenses and historical findings.

Public records must not contain legal names, private machine paths, credentials, tokens or raw Host responses. Use repository-relative paths and placeholders. Git commit/push and effects outside Git require their own user authorization.

Historical incidents behind these rules remain available at [the pre-reorganization baseline](https://github.com/solzip/CodeFleet/blob/f7441d1551ce296b721ce102f315e7b03ba0ee67/docs/CONVENTIONS.md); they are not instructions to recreate obsolete directories.
