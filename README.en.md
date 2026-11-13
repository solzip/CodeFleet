# CodeFleet

CodeFleet is a **Host-Native development orchestration extension for Codex CLI and Claude Code**. It reuses the Host's models, authentication and sessions to connect natural-language goals with reviewed tasks, approved changes, verification, recovery and completion decisions. A single Agent is the default; Host Agent/Subagent facilities are used where appropriate.

**The product is under development and acceptance testing.** Planning, review, supervised Local changes and recovery across processes are implemented. Limited supervised Windows Codex runs have been observed. Public authenticated delegation, protected execution, full platform acceptance and external-user productivity remain incomplete. [Current status](project/PROGRESS.md) owns the latest results and limits.

The Live runner allowlists only Codex CLI `0.167.0`, which passed an actual compatibility exercise, and the CI-pinned `0.167.1`. On Windows with `0.167.0`, an existing Node project completed proposal → separate Owner source application → rediscovery of the same Task in a new session → separate Owner approval of fixed tests → `COMPLETE_LOCAL`. A separate `VERIFY_CURRENT` scenario also completed actual model planning → one Owner verification approval → `COMPLETE_LOCAL` with unchanged source. Earlier MCP/Git-ownership failures and unresolved records remain in [current status](project/PROGRESS.md). This accepts the selected supervised Local paths; it does not establish full Host-profile acceptance, actual Compaction recovery, Protected Evidence, independent Owner identity, a spending cap or acceptance on other operating systems.

[Documentation](docs/README.md) · [Product principles](docs/PRODUCT_VISION.md) · [Roadmap](docs/product-completion/roadmap.md) · [Architecture](docs/product-completion/architecture.md) · [한국어](README.md)

## What can it do?

| Task | Current scope |
| --- | --- |
| Review a development goal | Draft, acceptance criteria, file scope, Validator and Workflow/DAG review |
| Improve an existing project | Proposal review, exact Fileset approval and application, Local tests and acceptance |
| Bootstrap a new project | Approved file creation, verification, Repair and recovery implemented; full real-Host acceptance pending |
| Resume interrupted work | Persisted Goal, contract, Work Log and Evidence discovery; process recovery and observed recovery of a settled checkpoint in the selected Codex new-session path |
| Repair a failed change | Bounded Repair and re-verification tied to failure evidence and separate approval |

The flow is `Goal → Draft → Validator → DAG → Approval → Execution → Evidence → Judge`. A valid plan does not authorize execution. An AI success report is not independent evidence. Local completion must be reobserved if the source changes afterwards.

## Install and start

Use Node.js **24.14.1 or newer**, Git and your existing Host. Basic planning needs no Docker, WSL, separate OS account or direct model API key. No runtime dependency installation is needed in a source checkout.

```sh
git clone https://github.com/solzip/CodeFleet.git
cd CodeFleet
node --version
node src/alpha/cli.mjs --help
```

Replace `PROJECT` with an existing project directory and choose your Host:

```text
node scripts/host-install.mjs install codex PROJECT
node scripts/host-install.mjs install claude PROJECT
```

| Host | Project installation | Invoke in the Host session |
| --- | --- | --- |
| Codex CLI | `.agents/skills/codefleet/` | `$codefleet` |
| Claude Code | `.claude/skills/codefleet/` | `/codefleet` |

Installation adds a Skill, runtime snapshot and license. Existing installations are not overwritten or automatically upgraded. Management commands are `status`, `disable`, `enable` and `remove`. Discovery and real model execution are separate checks. Follow the [installation guide](guides/host-native-guide.md).

Start by reviewing a small task:

```text
Add a filter that hides completed todos.
Propose the change scope, acceptance criteria and tests, then wait for approval.
```

For a command-line planning check, replace `STATE` with an external preparation state directory and `REPO` with the repository to review. This command records preparation state without model calls or source changes. It may return exit 2 when more input is required.

```text
node src/alpha/cli.mjs --state STATE host codex plan "Fix duplicate event handling" REPO
```

Follow the [Core guide](guides/host-core-guide.md) for Draft submission, contract review and approval requests. Existing projects use a reviewed Git baseline; new projects use the Bootstrap contract. Do not copy authentication material or sessions.

## Verification levels and limits

Local Verification executes an explicitly trusted exact command with local user permissions. `COMPLETE_LOCAL` accepts that contract and candidate. It does not establish OS isolation or Protected Verification.

Container Verification is a separate backend requiring Docker, fixed verification inputs and qualified isolation. Local success cannot replace it when the contract requires protection. Host Sandbox is `NOT_VERIFIED`; public authenticated delegation is `PUBLIC_DELEGATION_BLOCKED`. Fully unattended Repair, complete Host compaction and long-running recovery acceptance, and Multi-Agent time/cost advantages remain unproven.

See the [Alpha guide](guides/alpha-quickstart.md) for existing Node/Java workflows and the [Core guide](guides/host-core-guide.md) for backend guarantees. Do not assume source main and the existing public Alpha package support the same scope.

## Development and repository layout

| Location | Responsibility |
| --- | --- |
| `src/` | [Product modules and Legacy compatibility](src/README.md) |
| `test/`, `tools/proofs/` | Functional regression, negative cases and Host protocol verification |
| `scripts/`, `.github/` | Installation, diagnostics, verification, packaging and CI |
| `examples/` | Legacy Task and Java contract examples |
| `docs/` | Official product documents, current implementation contracts and checker baselines |

Run basic Docker-free regression in this order. Use `npm.cmd` in Windows PowerShell.

```sh
npm run pretest
npm run test:legacy
npm run test:host-core
npm run posttest
```

`npm run test:installed-goal-loop` exercises the installed package's Local flow using synthetic proposals and no model calls. Full `npm test` includes mandatory protected Docker checks; prepare the environment described in [.github/workflows/alpha.yml](.github/workflows/alpha.yml). Basic regression is not full protected acceptance.

Follow the [working rules](CLAUDE.md) and report commands, exit codes, skips and unverified scope. Use [SECURITY.md](SECURITY.md) for security reports. Do not publish personal paths, credentials, session transcripts or runtime databases.

<details>
<summary>Machine-checked Legacy figures</summary>

The frozen register's 77 findings are not the current product's unresolved-defect count. <!-- fact: registered-findings = 77 --> Read them within their [historical scope](test/contracts/legacy/INDEX.md).

| Measured surface | Value and scope |
| --- | --- |
| Frozen register | 77 findings <!-- fact: registered-findings = 77 --> |
| Resolved / partial at freeze | 25 / 8 <!-- fact: findings-resolved = 25 --> <!-- fact: findings-partial = 8 --> |
| Not reproduced / open at freeze | 1 / 15 <!-- fact: findings-not-reproduced = 1 --> <!-- fact: findings-open = 15 --> |
| Accepted limit / unchecked at freeze | 1 / 27 <!-- fact: findings-accepted-limit = 1 --> <!-- fact: findings-unchecked = 27 --> |
| Current Legacy tests | 327 passing / 0 failing <!-- fact: tests-passing = 327 --> <!-- fact: tests-failing = 0 --> |
| Quoted rule-condition coverage | 345 of 545 lines, 63.3%; not implementation completeness <!-- fact: conditions-covered = 345 --> <!-- fact: condition-lines = 545 --> <!-- fact: coverage-percent = 63.3 --> |
| Audit/run records in the current tree | 0; originals remain in Git history <!-- fact: audit-run-records = 0 --> |

These figures are compared against generated Legacy test results, the register and disk. They do not replace execution evidence from a new environment.

</details>

[MIT License](LICENSE). Permission to use is not a claim of product completion or production suitability.
