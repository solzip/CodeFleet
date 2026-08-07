# CodeFleet

CodeFleet is an AI-native development orchestration CLI. It structures a user's development/operations Objective into Tasks, defines backend/infrastructure work with role, scope, guardrails, and verification conditions, delegates approved Tasks to AI agents, and tracks execution through logs, diffs, tests, and review evidence.

The point is not to call an AI model. The point is that delegated work carries an approval decision, runs inside enforced boundaries, and leaves evidence that does not depend on what the agent claims it did.

## What CodeFleet Is Not

CodeFleet is not a Codex runner, a prompt generator, an AI CLI wrapper, a central project management tool, a web dashboard, a DB-backed task system, a CI/CD replacement, a deployment tool, a secret manager, or a full sandbox. This scope is fixed and is not planned to widen.

## Current Implementation Scope

This README documents the current local CLI as it exists today. The v0.1 seed executes, tracks, and reviews development work by task through a Codex adapter. Later slices add the workspace, run plan, adapter, verification, and review boundaries described in the concept foundation.

The canonical product definition is `docs/concept-foundation.md`, not this file.

## Current Features

- `codefleet init` creates a local `.codefleet` workspace.
- YAML task files are read from `.codefleet/tasks`.
- Required task fields are validated.
- Codex-oriented prompts are generated from tasks.
- Runs are stored under `.codefleet/runs/<run-id>`.
- Dry-run mode is the default, so Codex is not executed unless configured.
- Each run records `task.yaml`, `prompt.md`, `stdout.log`, `stderr.log`, `git-diff.patch`, and `result.json`.
- A small Agent Adapter layer exists with a first `codex` adapter.

## Requirements

- Node.js 24 or newer
- npm or pnpm only if you want package-script convenience

This project currently has no external runtime dependencies.

## Install

From this repository:

```bash
npm install
npm link
```

You can also run the CLI without linking:

```bash
node ./src/cli.ts --help
```

On Windows PowerShell, if npm script execution is restricted, use `cmd.exe /c npm ...` or call Node directly.

## Initialize

In the project you want CodeFleet metadata to live in:

```bash
codefleet init
```

This creates:

```text
.codefleet/
  tasks/
  runs/
  config.json
```

Default config:

```json
{
  "version": "0.1.0",
  "defaultAgent": "codex",
  "mode": "dry-run",
  "agents": {
    "codex": {
      "command": "codex",
      "args": ["exec", "-"]
    }
  }
}
```

## Write a Task

Create `.codefleet/tasks/task-001.yaml`.

```yaml
id: task-001
title: "API response structure standardization"
projectPath: "."
goal: "Make successful controller responses use a common ApiResponse<T> shape."
scope:
  include:
    - "src/main/java/**"
  exclude:
    - "src/main/resources/application*.yml"
constraints:
  - "Do not change the database schema."
  - "Do not modify files unrelated to the task scope."
doneCriteria:
  - "Successful controller responses return ApiResponse<T>."
  - "Existing tests pass when they can be run."
workflow:
  - PLAN
  - IMPLEMENT
  - REVIEW
status: READY
```

A copy of this sample is available at `examples/tasks/task-001.yaml`.

## Validate a Task

```bash
codefleet task validate task-001
```

## Generate a Prompt

```bash
codefleet prompt task-001
```

The prompt is written to:

```text
.codefleet/prompts/task-001.md
```

## Run a Task

```bash
codefleet run task-001
```

In the default `dry-run` mode, CodeFleet does not execute Codex. It creates the run directory and records the prompt and result files.

Run output is stored like this:

```text
.codefleet/runs/2026-05-27_001/
  task.yaml
  prompt.md
  stdout.log
  stderr.log
  git-diff.patch
  result.json
```

## Review Results

List recent runs:

```bash
codefleet runs
```

Show workspace status:

```bash
codefleet status
```

Open the run result:

```text
.codefleet/runs/<run-id>/result.json
```

## Execute Mode

Dry-run is the supported default for v0.1. To let the Codex adapter launch a process, change `.codefleet/config.json`:

```json
{
  "version": "0.1.0",
  "defaultAgent": "codex",
  "mode": "execute",
  "agents": {
    "codex": {
      "command": "codex",
      "args": ["exec", "-"]
    }
  }
}
```

The generated prompt is passed to the configured command on stdin. Treat execute mode as an adapter hook that may need adjustment for your installed Codex CLI.

## Roadmap

- Stronger YAML support through a dedicated parser package if needed.
- Multi-phase workflow handling beyond a single prompt.
- Additional adapters for Claude Code, Gemini CLI, local agents, reviewers, testers, and docs agents.
- Task dependency handling.
- Pull request and issue integrations through the export seam.
- Run metrics and success/failure analysis.

Export to external tools is limited to the sanitized Run Summary export seam. A web dashboard, a central task DB, and a general-purpose agent platform are explicit non-goals, not deferred work.

## Architecture

See `docs/architecture.md` for a text-based architecture overview with diagrams that do not require Mermaid rendering.

## Concept Foundation

See `docs/concept-foundation.md` for the canonical product definition, Core/Workspace/Profile/Harness concepts, and the fixed orchestration direction.

See `docs/design-progress.md` for the order in which the design was fixed and which step is currently in progress.
