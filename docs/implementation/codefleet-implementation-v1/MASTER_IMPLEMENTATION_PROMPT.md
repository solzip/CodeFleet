# Codex / Claude Code master implementation instruction

You are working in the local `solzip/CodeFleet` checkout. Your objective is to extend its **existing bounded, independently verified Alpha** into the platform defined by this packet, NOT build a separate agent framework or replace the original purpose.

**Read first:** repository `CLAUDE.md`, `package.json`, `docs/product-completion/{progress,architecture,roadmap}.md`, README, alpha source/tests, and this packet in README order. Record checked-out HEAD, branch, working tree cleanliness, environment, current CLI behavior and exact baseline test output. Repository current content overrides stale source observations; when conflicting, document the delta. Do not silently interpret this packet as pre-authorization for remote mutation.

## Invariant
AI output is untrusted proposal (`PROVIDER_REPORTED_ONLY`), **never Harness verification**. Keep contract immutability, protected tests, isolation checks, budget unknown-vs-zero distinction, worker claim/lease fencing and remote PR reconciliation. Do not broaden Alpha privilege model simply to enable collaboration.

## Execution plan
Execute work packets `G0` through `G6` in `05-implementation/PHASED_WORK.md` respecting dependencies and blocking gates. Internally decompose into tests-first, measurable vertical slices. At each gate run focused negative tests and full required suites; record commands, exit codes, target HEAD/environment, and unresolved issues. A failed gate halts dependent slices; never weaken tests/required gates or call skipped checks PASS.

1. Verify codebase and current contracts against `02-repository/BASELINE_AND_GAP.md`.
2. Preserve Alpha v1/legacy behavior with deterministic regression tests before refactoring.
3. Implement Provider API, Claude compatibility and safe Codex support in a proven no-tool envelope; if not enforceable, mark Codex capability blocked without taking an unsafe fallback.
4. Add natural-language intent -> untrusted Task Draft -> approved versioned contract; don't confuse initial user request with authorization of privileged actions.
5. Add durable DAG and workflow scheduling under **one** coordinator; parallel agents only when scope and security capabilities allow.
6. Implement collision-safe integration, independent final tree verification, safe recovery, status/reporting and measured rollout.
7. Update canonical docs and `docs/product-completion/progress.md` with only executed evidence. Avoid modifying frozen historical audit records.

## Required outputs
- Implementation matrix mapping each acceptance ID to source/tests and observed results.
- Schema migration with backwards compatibility and rollback/recovery evidence.
- Provider/version/platform capability table with `SUPPORTED/UNAVAILABLE/UNVERIFIED` values.
- A single human-readable final report: changes, measured tests, security limits, remaining blockers, known unsupported features, and a clear disposition (VERIFIED/PARTIAL/BLOCKED).

## Guardrails
- Never remove MIT attribution, rewrite Git history, delete archives, or change author identity.
- No remote push, release, PR creation, merge, deployment, or modifications to external repositories without the owner's separate explicit permission. Local commits only if current repository rules and user's permissions authorize them; otherwise leave changes for review.
- No installing external orchestration frameworks as hidden runtime dependencies.
- No arbitrary shell/tool access to provider unless sandbox, policy enforcement, credential isolation and tests prove it meets the declared capability.
- If a module contract cannot be fulfilled in the supplied environment, implement and test safe local portions, document concrete blocker, do not claim completion.

## Definition of Done
All mandatory CF-GATE tests pass, current Alpha+Legacy tests pass, schema migration and package E2E pass, supported security capabilities proven, no broken existing user contract, and evidence is attached for each VERIFIED assertion. Passing deterministic tests alone does not prove live provider/platform safety.
