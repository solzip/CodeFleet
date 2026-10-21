# Implementation work packages and dependencies

Each package: describe touched files, new modules, invariants, negative tests, integration evidence. Work on a feature branch. Never treat docs alone as implementation progress. Do not change history or push without the user's explicit permission.

## G0 — Read-only repository audit (blocking)
Target `package.json`, `CLAUDE.md`, current `docs/product-completion`, alpha + legacy CLI, alpha controller/store/provider/contract/verifier/delivery, tests. Run Node version, clean working tree, `npm test`, `node src/alpha/cli.mjs doctor` (no live calls unless opt-in), check package and release state. Record actual HEAD, status, environment, test command/exit, failures. If baseline is red classify; do not change tests to hide. Map active alpha states, published formats and data locations.

## G1 — Contract preservation and safe seams
Target `src/alpha/controller.mjs`, `contract.mjs`, `store.mjs`, `verifier.mjs`, `test/alpha*.test.mjs`. Extract pure `judge` and orchestration seams only where it allows behavior-equivalent tests. Keep v1 spec and protected checks. Add no new privileged provider capability. Gate: original Node and Java fixture end-to-end unchanged and negative regression tests green.

## G2 — Capability-based Provider API
Target `src/alpha/provider.mjs` and new `src/providers/{interface,claude,codex,capabilities}.mjs` (names indicative). Wrap existing Claude no-tool JSON proposal unchanged. Implement Codex no-tool structured edit *only when sandbox/no-tool capability and schema contract proven*. Build fake adapter and streaming parser fixtures; do not assume CLI flags. Gate: both providers' same edit envelope valid, malformed/scope-violating proposals rejected; explicit live opt-in compatibility checks. If Codex cannot enforce required constraints, leave blocked and preserve Claude path.

## G3 — Intent-to-approved-contract
New `src/intent/` modules for read-only discovery, bounded planner, draft validation, completion-method planning. Add contract v2 *alongside* v1; compile to existing bounded Alpha execution for straightforward tasks. Guard the legacy `codefleet run <task-id>` command: introduce unambiguous `codefleet-alpha plan "..."` or explicit `codefleet objective plan` until CLI resolution is proven. Gate: language request cannot auto-authorize or expand paths; incomplete checks yield NEEDS_INPUT; old contract runs still pass.

## G4 — Durable WorkItem / Graph and Workflow
Extend `src/alpha/store.mjs` with versioned migration and durable graph/work-item/attempt records; do not replace run JSON. Workflow compile->single DAG. Scheduler uses existing coordinator's reservation and bounded retry, one worker by default. Gate: migration v1->v2 backcompat; cycle rejected; stale graph mutation rejected; crashes restart without double attempt or side effect.

## G5 — Controlled hybrid collaboration
Add role assignments and mailbox messages (findings, questions, proposals), graph revision proposals evaluated by coordinator. Start with read-only concurrent analysis; then isolated parallel writing with serial integration and final-tree verification. Gate: no lateral permissions or direct agent state mutation; collision/semantic mismatch yields blocked integration; scope+budget enforced.

## G6 — CLI/report/packaging
Extend `src/alpha/cli.mjs` while preserving its commands, and integrate target main CLI only after collision-aware migration. CLI lifecycle: plan/run/status/logs/approve/pause/resume/cancel/verify/report/doctor; don't expose unsupported commands. Keep JSON stdout free of progress text and stable error codes; diagnostics no model spend unless opt-in. Update docs and package scripts. Gate: installed package smoke, platform gates, migration, security capability tests, live provider tests on claimed combinations.

## Done and blocker policy
- 'DONE' only when source+tests+trace evidence and all required security gates pass.
- 'BLOCKED' for missing CLI version capability, unavailable OS sandbox, untrusted external effects, missing credentials or unsupported platform; do not invent fallback privilege.
- 'NOT VERIFIED' for skipped/inconclusive tests, not PASS.
- Record exactly which areas are feature-complete vs operationally verified vs unsupported.
