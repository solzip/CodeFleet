# Delivery, change log and decisions needed

## Confirmed design choices
Independent verifiable orchestration platform; controlled hybrid cooperation; Codex+Claude provider target; capability-based adapter; Balanced routing with risk override; local CLI+isolated workspace first; single agent default; modular monolith; no provider-reported pass as truth.

## Defaults pending practical acceptance
- Which public CLI spelling will coexist with legacy `codefleet run <task-id>`? Recommend explicit namespaced natural-language command until compatibility strategy tested.
- Security and live Codex/Claude capability by OS/version is an empirical gate. Do not hardcode SUPPORT without live proof.
- Multi-agent write concurrency disabled until sandbox and integration tests pass.
- Legacy -> alpha runtime migration gradual, no historical schema overwrite.

## Package usage
Copy into repository under a non-runtime design directory e.g. `docs/implementation-packages/codefleet-orchestration-v1/` on a working branch (check repo conventions), then run master prompt from repository root. The package is instructions, not executable code. Preserve a copy for design traceability. Do not put the package in `.codefleet` runtime state without checking privacy and ignore rules.

## Future records
Record actual baseline SHA, implemented paths, executed test count/exit codes, provider versions, supported platforms and migration result. Update this packet if preflight identifies changes in main.
