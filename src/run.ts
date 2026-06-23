import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgentAdapter } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { renderPrompt } from "./prompt.ts";
import { loadTask } from "./task.ts";
import type { AgentRunInput, AgentRunResult, RunResultFile } from "./types.ts";
import { discoverWorkspace, type FileRef, type WorkspaceDiscovery } from "./workspace.ts";

export interface RunExecution {
  runId: string;
  runDir: string;
  result: RunResultFile;
}

export async function runTask(
  rootDir: string,
  taskId: string,
  workspaceDiscovery?: WorkspaceDiscovery
): Promise<RunExecution> {
  const discovery = workspaceDiscovery ?? await discoverWorkspace({ cwd: rootDir, workspace: rootDir });
  const config = await loadConfig(rootDir);
  const { task, taskPath } = await loadTask(rootDir, taskId);
  const projectPath = await resolveWorkspaceProjectPath(discovery.selectedWorkspaceRootRealPath, task.projectPath);
  const startedAtDate = new Date();
  const runId = await nextRunId(rootDir, startedAtDate);
  const runPlanId = `${runId}:plan`;
  const runDir = path.join(rootDir, ".codefleet", "runs", runId);

  await mkdir(runDir, { recursive: true });

  const runPlanPath = path.join(runDir, "run-plan.json");
  const promptPath = path.join(runDir, "prompt.md");
  const adapterRequestPath = path.join(runDir, "adapter-request.json");
  const harnessObservationPath = path.join(runDir, "harness-observation.json");
  const adapterResultPath = path.join(runDir, "adapter-result.json");
  const stdoutLogPath = path.join(runDir, "stdout.log");
  const stderrLogPath = path.join(runDir, "stderr.log");
  const diffPath = path.join(runDir, "git-diff.patch");
  const resultPath = path.join(runDir, "result.json");

  await copyFile(taskPath, path.join(runDir, "task.yaml"));
  const sourceTaskRef = await fileRef(rootDir, taskPath);
  const taskSnapshotRef = await fileRef(rootDir, path.join(runDir, "task.yaml"));

  const artifactPlan = {
    runTracePath: toRelativePath(rootDir, runDir),
    adapterRequestPath: toRelativePath(rootDir, adapterRequestPath),
    harnessObservationPath: toRelativePath(rootDir, harnessObservationPath),
    adapterResultPath: toRelativePath(rootDir, adapterResultPath),
    runSummaryPath: toRelativePath(rootDir, path.join(runDir, "run-summary.json")),
    verificationDir: toRelativePath(rootDir, path.join(runDir, "verification"))
  };
  const capabilities = {
    fileEdit: config.mode === "execute",
    commandExecution: config.mode === "execute",
    allowedPaths: task.scope.include,
    deniedPaths: task.scope.exclude,
    allowedCommands: [] as string[],
    deniedCommands: [] as string[]
  };
  const verificationPlanSeed = {
    commands: [] as unknown[],
    manualChecks: [] as unknown[],
    expectedEvidence: [] as unknown[]
  };
  const verificationPlan = {
    planHash: hashJson(verificationPlanSeed),
    ...verificationPlanSeed
  };
  const effectivePolicySeed = {
    capabilities,
    requiredGates: {
      runApproval: { required: false, allowedActors: [], explicit: false },
      resultReview: { required: true, allowedActors: [], explicit: false },
      verification: {
        required: true,
        waiver: { allowed: false, allowedActors: [], explicit: true }
      }
    },
    autoAdvanceOnDone: false
  };
  const effectivePolicy = {
    policyHash: hashJson(effectivePolicySeed),
    ...effectivePolicySeed
  };
  const runPlan = {
    schemaVersion: "0.2",
    documentKind: "RUN_PLAN",
    runPlanId,
    runId,
    taskId: task.id,
    createdAt: formatDateTimeWithOffset(startedAtDate),
    sourceRefs: {
      taskRevisionRef: sourceTaskRef,
      taskSnapshotRef,
      projectProfileRef: discovery.configRef,
      localOverlayRef: discovery.localOverlayRef
    },
    workspaceDiscovery: toPortableWorkspaceDiscovery(discovery),
    runOptions: {
      mode: config.mode
    },
    selectedAgentAdapter: {
      adapterId: config.defaultAgent
    },
    effectivePolicy,
    computedRisk: {
      level: "UNKNOWN",
      reasons: ["RISK_ENGINE_NOT_IMPLEMENTED_V02"]
    },
    isolation: {
      mode: "NONE",
      reason: "V0.2_MINIMAL_LOCAL_TRANSPORT"
    },
    verificationPlan,
    artifactPlan,
    resume: {
      boundary: "PLANNED_BEFORE_ADAPTER_REQUEST",
      sourceHashPolicy: "TASK_AND_PROFILE_MUST_MATCH",
      localRevalidationRequired: true,
      allowMutation: false
    }
  };
  await writeJson(runPlanPath, runPlan);
  const runPlanRef = await fileRef(rootDir, runPlanPath);

  await writeFile(promptPath, renderPrompt(task), "utf8");
  const promptRef = await fileRef(rootDir, promptPath);

  const adapterRequest = {
    schemaVersion: "0.2",
    documentKind: "ADAPTER_REQUEST",
    runId,
    runPlanId,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlanRef,
    taskRevisionRef: sourceTaskRef,
    taskSnapshotRef,
    promptRef,
    selectedAgentAdapter: {
      adapterId: config.defaultAgent
    },
    capabilities,
    workingDirectoryRef: task.projectPath,
    providerSpecific: false
  };
  await writeJson(adapterRequestPath, adapterRequest);
  const adapterRequestRef = await fileRef(rootDir, adapterRequestPath);

  const agentName = config.defaultAgent;
  const agentResult = await runAgentSafely(agentName, {
    task,
    runDir,
    promptPath,
    projectPath,
    config
  });

  await writeFile(stdoutLogPath, agentResult.stdout, "utf8");
  await writeFile(stderrLogPath, agentResult.stderr, "utf8");
  const diffEvidence = await captureGitDiff(projectPath);
  await writeFile(diffPath, diffEvidence.content, "utf8");
  const stdoutRef = await fileRef(rootDir, stdoutLogPath);
  const stderrRef = await fileRef(rootDir, stderrLogPath);
  const diffRef = await fileRef(rootDir, diffPath);
  const changedFilesEvidence = await captureGitChangedFiles(projectPath);

  const harnessObservation = {
    schemaVersion: "0.2",
    documentKind: "HARNESS_OBSERVATION",
    runId,
    runPlanId,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlanRef,
    adapterRequestRef,
    workspace: {
      workspaceRootRef: ".",
      selectedWorkspaceRootRealPath: discovery.selectedWorkspaceRootRealPath,
      workingDirectoryRef: task.projectPath,
      workingDirectoryRealPath: projectPath,
      preRunStateRef: {
        unavailableReason: "WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02"
      },
      postRunStateRef: {
        unavailableReason: "WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02"
      }
    },
    stdio: {
      stdoutRef,
      stderrRef
    },
    changes: {
      diffRef,
      changedFiles: changedFilesEvidence.files,
      unavailableReason: diffEvidence.unavailableReason ?? changedFilesEvidence.unavailableReason ?? ""
    },
    commands: {
      authority: "NONE",
      commandLogRef: {
        unavailableReason: "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"
      },
      providerReportedCommandsRef: {
        unavailableReason: "PROVIDER_TRANSCRIPT_PARSING_NOT_IMPLEMENTED_V02"
      },
      commandsObserved: [],
      commandsExecutedByHarness: [],
      unavailableReason: "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"
    },
    policyChecks: {
      pathViolations: [],
      commandViolations: [],
      capabilityViolations: [],
      pathPolicyEvaluationRef: {
        unavailableReason: "PATH_POLICY_EVALUATION_NOT_IMPLEMENTED_V02"
      }
    },
    observationSource: {
      kind: "HARNESS",
      method: "GIT_DIFF"
    },
    artifactRefs: [stdoutRef, stderrRef, diffRef]
  };
  await writeJson(harnessObservationPath, harnessObservation);

  const adapterResult = {
    schemaVersion: "0.2",
    documentKind: "ADAPTER_RESULT",
    runId,
    runPlanId,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlanRef,
    adapterRequestRef,
    adapterId: agentName,
    adapterExecutionStatus: toAdapterExecutionStatus(agentResult),
    synthetic: agentResult.status === "DRY_RUN" || agentResult.exitCode === null,
    exitCode: agentResult.exitCode,
    status: agentResult.status,
    providerReportedObservations: {
      degraded: true,
      reason: "PROVIDER_REPORTED_OBSERVATIONS_ARE_NOT_CORE_TRUTH"
    },
    adapterError: adapterError(agentResult)
  };
  await writeJson(adapterResultPath, adapterResult);

  const finishedAt = new Date();
  const result: RunResultFile = {
    runId,
    taskId: task.id,
    agent: agentName,
    status: agentResult.status,
    startedAt: formatDateTimeWithOffset(startedAtDate),
    finishedAt: formatDateTimeWithOffset(finishedAt),
    runPlanPath: toRelativePath(rootDir, runPlanPath),
    adapterRequestPath: toRelativePath(rootDir, adapterRequestPath),
    harnessObservationPath: toRelativePath(rootDir, harnessObservationPath),
    adapterResultPath: toRelativePath(rootDir, adapterResultPath),
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

async function runAgentSafely(agentName: string, input: AgentRunInput): Promise<AgentRunResult> {
  try {
    const agent = createAgentAdapter(agentName);
    return await agent.run(input);
  } catch (error) {
    return {
      status: "FAILED",
      exitCode: null,
      stdout: "",
      stderr: `${error instanceof Error ? error.message : String(error)}\n`
    };
  }
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

async function captureGitDiff(projectPath: string): Promise<{ content: string; unavailableReason?: string }> {
  const result = await runProcess("git", ["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--", "."], projectPath);
  if (result.code === 0) {
    return { content: result.stdout };
  }

  return {
    content: [
      "git diff failed.",
      "",
      result.stderr.trim() || "No stderr output was produced.",
      ""
    ].join("\n"),
    unavailableReason: "GIT_DIFF_FAILED"
  };
}

async function captureGitChangedFiles(projectPath: string): Promise<{ files: string[]; unavailableReason?: string }> {
  const result = await runProcess("git", ["-c", `safe.directory=${projectPath}`, "diff", "--name-only", "--", "."], projectPath);
  if (result.code !== 0) {
    return {
      files: [],
      unavailableReason: "GIT_CHANGED_FILES_FAILED"
    };
  }

  return {
    files: result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  };
}

function runProcess(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    try {
      const child = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });

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
    } catch (error) {
      resolve({
        code: null,
        stdout,
        stderr: `${error instanceof Error ? error.message : String(error)}\n`
      });
    }
  });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileRef(rootDir: string, filePath: string): Promise<FileRef> {
  const raw = await readFile(filePath);
  return {
    path: toRelativePath(rootDir, filePath),
    contentHash: createHash("sha256").update(raw).digest("hex"),
    present: true
  };
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toPortableWorkspaceDiscovery(discovery: WorkspaceDiscovery): Record<string, unknown> {
  return {
    discoveryMode: discovery.discoveryMode,
    explicitWorkspaceProvided: discovery.explicitWorkspaceInput !== null,
    workspaceRootRef: discovery.workspaceRootRef,
    metadataRootRef: discovery.metadataRootRef,
    workspaceId: discovery.workspaceId,
    configRef: discovery.configRef,
    localOverlayRef: discovery.localOverlayRef,
    selectedBy: discovery.selectedBy,
    candidateRoots: discovery.candidateRoots.map((candidate) => path.relative(discovery.selectedWorkspaceRootRealPath, candidate) || "."),
    nestedWorkspaceRefs: discovery.nestedWorkspaceRefs,
    warnings: discovery.warnings
  };
}

function toAdapterExecutionStatus(result: { status: string; exitCode: number | null }): string {
  if (result.status === "DRY_RUN") {
    return "NOT_EXECUTED";
  }
  if (result.status === "SUCCEEDED") {
    return "COMPLETED";
  }
  if (result.exitCode === null) {
    return "ADAPTER_FAILED";
  }
  return "ADAPTER_FAILED";
}

function adapterError(result: { status: string; exitCode: number | null; stderr: string }): Record<string, string> | null {
  if (result.status === "SUCCEEDED") {
    return null;
  }
  if (result.status === "DRY_RUN") {
    return {
      code: "DRY_RUN",
      message: "Adapter execution was skipped because CodeFleet is in dry-run mode."
    };
  }
  if (result.exitCode === null) {
    return {
      code: "LAUNCH_FAILED",
      message: firstLine(result.stderr) || "Adapter process did not launch successfully."
    };
  }
  return {
    code: "NON_ZERO_EXIT",
    message: firstLine(result.stderr) || `Adapter process exited with code ${result.exitCode}.`
  };
}

async function resolveWorkspaceProjectPath(workspaceRootRealPath: string, projectPath: string): Promise<string> {
  if (path.isAbsolute(projectPath)) {
    throw new Error("Task projectPath must be workspace-relative.");
  }

  const normalized = path.normalize(projectPath);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) {
    throw new Error("Task projectPath must stay inside the workspace.");
  }

  const resolved = path.resolve(workspaceRootRealPath, normalized);
  const real = await realpath(resolved);
  assertInside(workspaceRootRealPath, real, "Task projectPath must stay inside the workspace.");
  const info = await stat(real);
  if (!info.isDirectory()) {
    throw new Error("Task projectPath must point to a workspace directory.");
  }
  return real;
}

function assertInside(root: string, target: string, message: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(message);
  }
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
