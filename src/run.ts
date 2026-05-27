import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgentAdapter } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { renderPrompt } from "./prompt.ts";
import { loadTask } from "./task.ts";
import type { RunResultFile } from "./types.ts";

export interface RunExecution {
  runId: string;
  runDir: string;
  result: RunResultFile;
}

export async function runTask(rootDir: string, taskId: string): Promise<RunExecution> {
  const config = await loadConfig(rootDir);
  const { task, taskPath } = await loadTask(rootDir, taskId);
  const startedAtDate = new Date();
  const runId = await nextRunId(rootDir, startedAtDate);
  const runDir = path.join(rootDir, ".codefleet", "runs", runId);

  await mkdir(runDir, { recursive: true });

  const promptPath = path.join(runDir, "prompt.md");
  const stdoutLogPath = path.join(runDir, "stdout.log");
  const stderrLogPath = path.join(runDir, "stderr.log");
  const diffPath = path.join(runDir, "git-diff.patch");
  const resultPath = path.join(runDir, "result.json");

  await copyFile(taskPath, path.join(runDir, "task.yaml"));
  await writeFile(promptPath, renderPrompt(task), "utf8");

  const projectPath = resolveProjectPath(rootDir, task.projectPath);
  const agent = createAgentAdapter(config.defaultAgent);
  const agentResult = await agent.run({
    task,
    runDir,
    promptPath,
    projectPath,
    config
  });

  await writeFile(stdoutLogPath, agentResult.stdout, "utf8");
  await writeFile(stderrLogPath, agentResult.stderr, "utf8");
  await writeFile(diffPath, await captureGitDiff(projectPath), "utf8");

  const finishedAt = new Date();
  const result: RunResultFile = {
    runId,
    taskId: task.id,
    agent: agent.name,
    status: agentResult.status,
    startedAt: formatDateTimeWithOffset(startedAtDate),
    finishedAt: formatDateTimeWithOffset(finishedAt),
    promptPath: toRelativePath(rootDir, promptPath),
    stdoutLogPath: toRelativePath(rootDir, stdoutLogPath),
    stderrLogPath: toRelativePath(rootDir, stderrLogPath),
    diffPath: toRelativePath(rootDir, diffPath),
    resultPath: toRelativePath(rootDir, resultPath),
    exitCode: agentResult.exitCode
  };

  if (agentResult.status === "FAILED" && agentResult.stderr.trim().length > 0) {
    result.error = firstLine(agentResult.stderr);
  }

  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  return { runId, runDir, result };
}

export async function listRuns(rootDir: string): Promise<RunResultFile[]> {
  const runsDir = path.join(rootDir, ".codefleet", "runs");
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return [];
  }

  const results: RunResultFile[] = [];
  for (const entry of entries.sort().reverse()) {
    try {
      const raw = await readFile(path.join(runsDir, entry, "result.json"), "utf8");
      results.push(JSON.parse(raw) as RunResultFile);
    } catch {
      // Ignore incomplete run directories in the listing.
    }
  }

  return results;
}

async function nextRunId(rootDir: string, date: Date): Promise<string> {
  const datePart = formatDate(date);
  const runsDir = path.join(rootDir, ".codefleet", "runs");
  let entries: string[] = [];

  try {
    entries = await readdir(runsDir);
  } catch {
    await mkdir(runsDir, { recursive: true });
  }

  const last = entries
    .map((entry) => entry.match(new RegExp(`^${datePart}_(\\d{3})$`)))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => Number(match[1]))
    .reduce((max, value) => Math.max(max, value), 0);

  return `${datePart}_${String(last + 1).padStart(3, "0")}`;
}

async function captureGitDiff(projectPath: string): Promise<string> {
  const result = await runProcess("git", ["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--", "."], projectPath);
  if (result.code === 0) {
    return result.stdout;
  }

  return [
    "git diff failed.",
    "",
    result.stderr.trim() || "No stderr output was produced.",
    ""
  ].join("\n");
}

function runProcess(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function resolveProjectPath(rootDir: string, projectPath: string): string {
  return path.isAbsolute(projectPath) ? path.normalize(projectPath) : path.resolve(rootDir, projectPath);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeWithOffset(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const offsetHour = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const offsetMinute = String(Math.abs(offset) % 60).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHour}:${offsetMinute}`;
}

function toRelativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0] ?? value.trim();
}
