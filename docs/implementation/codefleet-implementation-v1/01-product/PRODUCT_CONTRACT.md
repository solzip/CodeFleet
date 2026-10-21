# Product and trust contract — normative

**Product:** CodeFleet is a verifiable autonomous AI development orchestration platform. It accepts an objective, generates a reviewable execution contract, coordinates Codex and Claude Code as optional specialist agents, enforces scope/approval/resource policy, independently verifies results, and returns traceable code changes and optional draft PR.

## Non-negotiable invariants
- Provider output is a **proposal**, not execution truth or authorization. Keep `PROVIDER_REPORTED_ONLY` separate from Harness-executed checks. A provider claiming tests passed cannot satisfy a gate.
- Observation, verification, adjudication, approval, and delivery are separately attributable. Zero tests discovered, missing/altered evidence, truncated required data, or unknown external effect cannot equal PASS.
- Immutable authorized contracts bind content, baseline, scope, policy, acceptance methods, and run budget. A planner cannot approve its own plan.
- Single and multi-agent runs share the same coordinator and state rules. Parallelism is opt-in and gated; default one worker.
- Workspace/change isolation != OS security isolation. Enforce supported capabilities or fail closed.
- No unapproved external writes, pushes, merges, deployments, DB schema/data changes or secret exposure.
- Safe pause/cancel/resume must reconcile reality; lease expiry is not proof a child process stopped.
- Preserve historical evidence and migration compatibility; never lower gates to get green tests.

## User-visible target
`codefleet run "fix duplicate chatbot sessions and verify"` -> discovery -> proposed Task Draft -> policy+acceptance validation -> immutable approved contract -> Workflow/DAG -> agent proposal(s) -> independent testing -> human review where needed -> report/draft PR if separately authorized.

## Explicit non-goals for first extension milestone
Full autonomous shell access, arbitrary hostile JavaScript safe execution, cross-provider session portability, distributed remote workers, general-purpose model-billing guarantees, automatic PR merge/deploy, production DB mutation, multi-repository dependency stacks.

## Authorization distinction
User request allows exploration and proposal. It does **not** imply authorization for all discovered work. Automatically authorize only bounded local actions explicitly allowed by policy. Important missing acceptance criteria require a user decision or a verifiable additional check.
