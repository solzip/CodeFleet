# Source map

CodeFleet extends the existing Codex CLI and Claude Code Host. Product boundaries
are defined in the [architecture](../docs/product-completion/architecture.md);
implementation and acceptance status are in [progress](../docs/product-completion/progress.md).

| Location | Responsibility |
| --- | --- |
| `hosts/` | Host installation, proposal exchange, MCP, planning, execution admission and platform isolation interfaces |
| `intent/` | Repository discovery, goal interpretation, Draft preparation and validation |
| `workflow/` | DAG, dependencies, capability checks, reservations and repair generations |
| `product/` | User-facing Objective commands, reviews, Local acceptance, delivery, Work Log and recovery |
| `verification/` | Local / Container backend contracts and capability boundaries |
| `alpha/` | Shared Controller, Store, process handling, protected verification and existing Node/Java workflow |
| `providers/` | Host/provider adapters and optional direct model transports |
| Root TypeScript modules | Legacy engine contracts, policy, ledger, review and execution; retained for compatibility |

The Host-Native command entry is `alpha/cli.mjs`; `hosts/codex-mcp.mjs` is the
MCP server. `cli.ts` remains the separate Legacy entry. An executable module
can be launched by a process or a container without a static import, so lack
of imports alone does not establish that it is unused.

Persistent state, approval, lease and recovery belong to the existing Store and
Controller paths. Changes must preserve the Legacy FINAL RULE and Alpha safety
contracts. Local execution, synthetic Host fixtures and Protected Evidence retain
their separate acceptance levels.

The large Legacy `run.ts` still combines planning, adapter launch, observation,
policy and gate calculation. A structural extraction needs a scoped design and
regression evidence. The [Legacy account](../docs/archive/2026-08-13/ARCHIVE.md)
preserves its original findings and measurements.
