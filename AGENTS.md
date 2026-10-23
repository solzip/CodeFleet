# CodeFleet — Codex development instructions

## Read the current contract first

CodeFleet is a Host-Native development orchestration extension for Codex CLI
and Claude Code. Reuse the Host's models, authentication, sessions, tools and
Agent/Subagent facilities within their actual capabilities and permissions.
Do not build a replacement Agent engine, copy credentials or require direct API
keys to perform the normal Host workflow.

| Source | Responsibility |
| --- | --- |
| [Product principles](docs/PRODUCT_VISION.md) | Product purpose and invariants |
| [Architecture](docs/product-completion/architecture.md) | Current structure, responsibility boundaries and design limits |
| [Progress](docs/product-completion/progress.md) | Implemented, verified, blocked and unverified scope |
| [Roadmap](docs/product-completion/roadmap.md) | Dependencies and acceptance criteria for next work |
| [Implementation contracts](docs/implementation/) | Detailed contracts for the selected path |
| [Working rules](CLAUDE.md) and [recording conventions](docs/CONVENTIONS.md) | Shared verification, publication and evidence discipline |

Check Git status, branch, target baseline and relevant instructions before edits.
Preserve staged, unstaged and untracked work, other worktrees and existing run
records. Do not assume local main equals GitHub main. Avoid repeating a completed
analysis unless the baseline, scope or evidence has changed.

Preserve Legacy FINAL RULEs, Alpha contracts and Host-Native compatibility.
Historical audits and measured figures describe their original scope; do not
rewrite them to make current work appear complete. Product principles belong in
the linked documents, not in a competing specification here.

## Execute a bounded development loop

Connect Task Draft → Validator → Workflow/DAG → approved execution → Evidence/Judge.
Before implementation, identify the WorkItem's scope, dependencies, acceptance
criteria, verification commands and authorization. A valid Draft or ready DAG
does not grant execution permission.

Use one Agent by default. Delegate only when the user or applicable instructions
authorize it and independent roles improve the selected task. Prefer existing
Host facilities; availability of an Agent or Skill is not permission to use it.
The Manager/Coordinator must assign explicit file scope, inputs, dependencies,
expected outputs and verification responsibility to each role. Keep overlapping
writes serial, track resource conflicts and integrate results against a known
baseline. Revalidate the integrated candidate; individual results are insufficient.
Agent messages and reviews remain proposals, not independent execution evidence.
Do not describe role metadata or offline fixtures as automatic Host delegation.

The Harness enforces Policy, actual Capability, current approvals, budgets and
verification state. A Manager or Agent cannot override those gates. Reuse the
existing Controller, Persistent State/Work Log, Lease and Recovery mechanisms;
do not create a second scheduler or state store for convenience. Record contract
revision, attempt, candidate and evidence references at the existing boundaries.
After interruption, inspect persisted effects and lease ownership before retrying.

On failure, use a Bounded Improvement Loop only within the approved scope and
remaining attempt/time/cost limits: inspect evidence, state a repair hypothesis,
make the bounded change, then rerun independent verification on the new candidate.
Stop on repeated failure or no progress, exhausted budget, lost lease, changed
approval, missing capability or uncertain effects. Report the blocker and required
decision. Never weaken tests, approval checks or completion criteria to turn a
failure green. Existing Bootstrap repair is not proof of an autonomous Live loop.

## Verify claims at their actual level

Maintain Windows, macOS and Linux compatibility as a product goal. Use portable
paths, argument handling and process cleanup; preserve LF via `.gitattributes`.
Record the OS, shell and runtime actually tested. One platform's pass does not
establish support on the others.

Basic planning requires no Docker, WSL, separate OS account or extra API key.
Docker remains an optional protected verification backend and is still required
by contracts that select it. Explicit-trust Local Verification is not Protected
Evidence. Host Sandbox remains unverified until actual enforcement is measured.
Do not silently downgrade a required backend when it is unavailable.

Use the repository's existing commands with Node matching `package.json`:

```text
npm test
npm run check:links
npm run check:citations
npm run check:facts
```

No runtime dependency installation is needed. On Windows use `npm.cmd` if the
PowerShell shim is blocked. Capture the command's exit code immediately, including
posttest; a pipeline's last exit code or a passing test count is not enough.
Run relevant contract/regression tests and the document checks for the change.
Do not change coverage or anchor baselines merely to pass a documentation edit.
Zero examined items, missing evidence and unrun tests are not success.

Test validators with negative cases when changing their behavior. Preserve the
distinction between CAPABILITY_GAP, non-waivable EVIDENCE_DEFECT and
PROVIDER_REPORTED_ONLY. Bind evidence to its contract, candidate and environment.
Report executed commands, results, failures, skips and unverified scope separately.
Do not declare feature acceptance without actual tests and the required Host Live
Evidence. Documentation completion is only DOCUMENTED; offline passes, install
discovery and past Alpha Live results do not certify current Host Live behavior.

## Preserve authority and report useful outcomes

Git operations and effects outside Git have separate approval scopes. Do not
infer permission for commit, push, PR, merge, branch deletion, deployment, external
messages, service/data changes or credential use from a request to edit files.
Act only within the user's current authorization and the enforced environment.
Preserve the MIT notice and pseudonymous publication identity; never record legal
names, secrets, authentication tokens or private machine paths in public artifacts.

Follow the recording conventions within the requested documentation scope.
Report changed files and purpose, reused contracts, validation results and limits,
remaining work and needed decisions. For company or side-project pilots, measure
human preparation, intervention and review time, quality/rework and observable
cost against a comparable baseline. Todo + Calendar MVP is an acceptance target,
not evidence of shipped functionality or proven business value.
