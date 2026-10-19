# Consolidated architectural decisions (adopted goals; implementation conditional)

## One control plane, one safety model
Modular monolith in current Node ESM stack. A single **Run Coordinator** alone approves command/state transitions. Planner generates proposals; Graph Validator checks versions/dependencies; Scheduler chooses ready items; Router chooses capable Provider; Runtime creates processes; Harness Verifier records facts; Pure Judge computes decisions; Delivery performs authorized external writes. External effects are never inside DB transactions.

## Required layers
```
CLI -> Intent Discovery / Task Draft -> Contract Validator / Policy
    -> immutable authorization -> Workflow Compiler -> versioned WorkItem DAG
    -> Run Coordinator -> Router(Provider+Environment capabilities)
    -> Agent Runtime (Codex/Claude) -> proposed ChangeSet
    -> trusted apply into bounded candidate -> independent verification
    -> serial integration + final tree gates -> Judge -> Report / optional Draft PR
                     \-> Store (state + events + artifacts)
```

## Decisions
1. Existing alpha v1 execution remains supported; introduce a v2 umbrella contract and compile it to bounded per-work-item v1-compatible proposal actions where possible.
2. Provider role != provider name. Provider output has no state mutation rights. Provider capabilities: streaming, schema, resume, no-tool mode; Environment capabilities: filesystem/network/credential/process control, tested on target OS.
3. Multi-agent default = controlled hybrid. Agents may propose delegated work, graph mutations and feedback, but only coordinator may activate changes. Work graph revisions immutable; running attempt contract immutable.
4. Workflow definitions are templates; **one** execution DAG owns dependencies. Skills provide instructions not permissions. Hooks respond to durable events and cannot directly change state.
5. One initial event/state persistence boundary; don't introduce Kafka/Redis/microservices. Normalized state tables+event audit eventually; transition Alpha Store incrementally.
6. Read-only analysis may run concurrently once safe; parallel write attempts require distinct isolated workspace and serial, verified integration. A Git worktree is not an OS sandbox.
7. No mandatory live model call in deterministic CI; Fake providers and negative gate tests are core. Live Codex/Claude compatibility in explicit opt-in jobs.
8. Routing is Balanced with risk overrides after **hard capability filters**. No forced cross-provider session reuse.
9. Runtime modes: `PROPOSAL_ONLY` (default, no tools), `SANDBOXED_AGENT` (future and capability-gated), `CONTROLLED_ACTION` (trusted separately authorized effect executor, not raw model tool).
10. Preserve alpha draft-PR duplicate prevention, provider budget uncertainty and protected test rules. Never conflate accepted patch with published/merged change.

## Decision hierarchy
Safety invariants > effective policy > authorized run contract > workflow DAG > skill/agent suggestions. Security revocation may supersede pinned policy and stop an in-progress run.

## Release boundary
A milestone is not achieved by implementing interfaces alone: requires executed negative tests and supported environment verification, release packaging and user documentation. CLI options must not claim support for security isolation they cannot enforce.
