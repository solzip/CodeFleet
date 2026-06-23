#!/usr/bin/env node
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { initProject, loadConfig } from "./config.ts";
import { renderPrompt } from "./prompt.ts";
import { runTask, listRuns } from "./run.ts";
import { formatValidationErrors, loadTask, loadTaskForValidation } from "./task.ts";
import { discoverWorkspace, type WorkspaceDiscovery } from "./workspace.ts";

interface CliOptions {
  workspace?: string;
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseGlobalOptions(argv);
  const [command, ...args] = parsed.args;
  const cwd = process.cwd();

  try {
    switch (command) {
      case "init":
        await handleInit(cwd, parsed.options);
        return 0;
      case "run":
        await handleRun(cwd, parsed.options, requireArg(args[0], "task-id"));
        return 0;
      case "prompt":
        await handlePrompt(cwd, parsed.options, requireArg(args[0], "task-id"));
        return 0;
      case "task":
        await handleTask(cwd, parsed.options, args);
        return 0;
      case "status":
        await handleStatus(cwd, parsed.options);
        return 0;
      case "runs":
        await handleRuns(cwd, parsed.options);
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

async function handleInit(cwd: string, options: CliOptions): Promise<void> {
  const rootDir = options.workspace === undefined ? cwd : path.resolve(cwd, options.workspace);
  const result = await initProject(rootDir);
  console.log("CodeFleet initialized.");
  console.log(`directory: ${path.relative(rootDir, result.codefleetDir) || "."}`);
  console.log(`config: ${result.createdConfig ? "created" : "already exists"}`);
}

async function handleRun(cwd: string, options: CliOptions, taskId: string): Promise<void> {
  const discovery = await workspaceDiscovery(cwd, options);
  const rootDir = discovery.selectedWorkspaceRootRealPath;
  const execution = await runTask(rootDir, taskId, discovery);
  console.log("CodeFleet run complete.");
  console.log(`runId: ${execution.result.runId}`);
  console.log(`taskId: ${execution.result.taskId}`);
  console.log(`agent: ${execution.result.agent}`);
  console.log(`status: ${execution.result.status}`);
  console.log(`runDir: ${path.relative(rootDir, execution.runDir)}`);
  console.log(`runPlan: ${execution.result.runPlanPath}`);
  console.log(`adapterRequest: ${execution.result.adapterRequestPath}`);
  console.log(`harnessObservation: ${execution.result.harnessObservationPath}`);
  console.log(`adapterResult: ${execution.result.adapterResultPath}`);
  console.log(`result: ${execution.result.resultPath}`);
}

async function handlePrompt(cwd: string, options: CliOptions, taskId: string): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  await loadConfig(rootDir);
  const { task } = await loadTask(rootDir, taskId);
  const promptDir = path.join(rootDir, ".codefleet", "prompts");
  const promptPath = path.join(promptDir, `${taskId}.md`);
  await mkdir(promptDir, { recursive: true });
  await writeFile(promptPath, renderPrompt(task), "utf8");
  console.log(`Prompt written: ${path.relative(rootDir, promptPath)}`);
}

async function handleTask(cwd: string, options: CliOptions, args: string[]): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
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

async function handleStatus(cwd: string, options: CliOptions): Promise<void> {
  const discovery = await discoverWorkspace({ cwd, workspace: options.workspace });
  const rootDir = discovery.selectedWorkspaceRootRealPath;
  const config = await loadConfig(rootDir);
  const tasks = await listYamlFiles(path.join(rootDir, ".codefleet", "tasks"));
  const runs = await listRuns(rootDir);

  console.log("CodeFleet status");
  console.log(`version: ${config.version}`);
  console.log(`defaultAgent: ${config.defaultAgent}`);
  console.log(`mode: ${config.mode}`);
  console.log(`workspace: ${discovery.workspaceId}`);
  console.log(`discovery: ${discovery.discoveryMode}`);
  console.log(`tasks: ${tasks.length}`);
  console.log(`runs: ${runs.length}`);
}

async function handleRuns(cwd: string, options: CliOptions): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
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

async function workspaceRoot(cwd: string, options: CliOptions): Promise<string> {
  return (await workspaceDiscovery(cwd, options)).selectedWorkspaceRootRealPath;
}

async function workspaceDiscovery(cwd: string, options: CliOptions): Promise<WorkspaceDiscovery> {
  return discoverWorkspace({ cwd, workspace: options.workspace });
}

function parseGlobalOptions(argv: string[]): { args: string[]; options: CliOptions } {
  const args: string[] = [];
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--workspace") {
      const workspace = argv[index + 1];
      if (workspace === undefined || workspace.startsWith("--")) {
        throw new Error("Missing required value for --workspace");
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }
    if (value.startsWith("--workspace=")) {
      const workspace = value.slice("--workspace=".length);
      if (workspace.length === 0) {
        throw new Error("Missing required value for --workspace");
      }
      options.workspace = workspace;
      continue;
    }
    args.push(value);
  }

  return { args, options };
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
  codefleet [--workspace <path>] init
  codefleet [--workspace <path>] run <task-id>
  codefleet [--workspace <path>] prompt <task-id>
  codefleet [--workspace <path>] task validate <task-id>
  codefleet [--workspace <path>] status
  codefleet [--workspace <path>] runs

Notes:
  Run 'codefleet init' before other commands.
  Tasks are read from .codefleet/tasks/<task-id>.yaml.
  Commands discover .codefleet/config.json from the current directory or --workspace.
`);
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
