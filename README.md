# CodeFleet

CodeFleet is a local CLI foundation for orchestrating AI coding agents as a development fleet.

The long-term goal is a multi-agent development platform. CodeFleet v0.1 keeps the scope small: it turns structured development tasks into Codex-ready prompts, records each run, and stores logs, diffs, and results in the local filesystem.

## v0.1 Goal

CodeFleet v0.1 is a Codex-based development orchestration CLI for executing, tracking, and reviewing development work by task.

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
- Pull request and issue integrations.
- Run metrics and success/failure analysis.
- Optional dashboard after the local CLI foundation is stable.

## Architecture

See `docs/architecture.md` for a text-based architecture overview with diagrams that do not require Mermaid rendering.
