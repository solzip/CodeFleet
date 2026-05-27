#!/usr/bin/env node
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { initProject, loadConfig } from "./config.ts";
import { renderPrompt } from "./prompt.ts";
import { runTask, listRuns } from "./run.ts";
import { formatValidationErrors, loadTask, loadTaskForValidation } from "./task.ts";

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  const rootDir = process.cwd();

  try {
    switch (command) {
      case "init":
        await handleInit(rootDir);
        return 0;
      case "run":
        await handleRun(rootDir, requireArg(args[0], "task-id"));
        return 0;
      case "prompt":
        await handlePrompt(rootDir, requireArg(args[0], "task-id"));
        return 0;
      case "task":
        await handleTask(rootDir, args);
        return 0;
      case "status":
        await handleStatus(rootDir);
        return 0;
      case "runs":
        await handleRuns(rootDir);
        return 0;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        return 0;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function handleInit(rootDir: string): Promise<void> {
  const result = await initProject(rootDir);
  console.log("CodeFleet initialized.");
  console.log(`directory: ${path.relative(rootDir, result.codefleetDir) || "."}`);
  console.log(`config: ${result.createdConfig ? "created" : "already exists"}`);
}

async function handleRun(rootDir: string, taskId: string): Promise<void> {
  const execution = await runTask(rootDir, taskId);
  console.log("CodeFleet run complete.");
  console.log(`runId: ${execution.result.runId}`);
  console.log(`taskId: ${execution.result.taskId}`);
  console.log(`agent: ${execution.result.agent}`);
  console.log(`status: ${execution.result.status}`);
  console.log(`runDir: ${path.relative(rootDir, execution.runDir)}`);
  console.log(`result: ${execution.result.resultPath}`);
}

async function handlePrompt(rootDir: string, taskId: string): Promise<void> {
  await loadConfig(rootDir);
  const { task } = await loadTask(rootDir, taskId);
  const promptDir = path.join(rootDir, ".codefleet", "prompts");
  const promptPath = path.join(promptDir, `${taskId}.md`);
  await mkdir(promptDir, { recursive: true });
  await writeFile(promptPath, renderPrompt(task), "utf8");
  console.log(`Prompt written: ${path.relative(rootDir, promptPath)}`);
}

async function handleTask(rootDir: string, args: string[]): Promise<void> {
  const [subcommand, taskId] = args;
  if (subcommand !== "validate") {
    throw new Error("Usage: codefleet task validate <task-id>");
  }

  const id = requireArg(taskId, "task-id");
  await loadConfig(rootDir);
  const { validation } = await loadTaskForValidation(rootDir, id);

  if (validation.errors.length > 0) {
    throw new Error(formatValidationErrors(id, validation));
  }

  console.log(`Task is valid: ${id}`);
  for (const warning of validation.warnings) {
    console.log(`warning: ${warning}`);
  }
}

async function handleStatus(rootDir: string): Promise<void> {
  const config = await loadConfig(rootDir);
  const tasks = await listYamlFiles(path.join(rootDir, ".codefleet", "tasks"));
  const runs = await listRuns(rootDir);

  console.log("CodeFleet status");
  console.log(`version: ${config.version}`);
  console.log(`defaultAgent: ${config.defaultAgent}`);
  console.log(`mode: ${config.mode}`);
  console.log(`tasks: ${tasks.length}`);
  console.log(`runs: ${runs.length}`);
}

async function handleRuns(rootDir: string): Promise<void> {
  await loadConfig(rootDir);
  const runs = await listRuns(rootDir);
  if (runs.length === 0) {
    console.log("No runs found.");
    return;
  }

  for (const run of runs) {
    console.log(`${run.runId}  ${run.status}  ${run.taskId}  ${run.agent}`);
  }
}

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith(".yaml") || entry.endsWith(".yml"));
  } catch {
    return [];
  }
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function printHelp(): void {
  console.log(`CodeFleet v0.1

Usage:
  codefleet init
  codefleet run <task-id>
  codefleet prompt <task-id>
  codefleet task validate <task-id>
  codefleet status
  codefleet runs

Notes:
  Run 'codefleet init' before other commands.
  Tasks are read from .codefleet/tasks/<task-id>.yaml.
`);
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
