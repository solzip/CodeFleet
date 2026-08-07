export type CodeFleetMode = "dry-run" | "execute";

export type RunStatus = "DRY_RUN" | "SUCCEEDED" | "FAILED";

export interface AgentCommandConfig {
  command?: string;
  args?: string[];
}

export interface CodeFleetConfig {
  version: string;
  defaultAgent: string;
  mode: CodeFleetMode;
  agents?: Record<string, AgentCommandConfig>;
}

export interface TaskScope {
  include: string[];
  exclude: string[];
}

export interface Task {
  id: string;
  title: string;
  projectPath: string;
  goal: string;
  scope: TaskScope;
  constraints: string[];
  doneCriteria: string[];
  workflow: string[];
  status: string;
}

export interface LoadedTask {
  task: Task;
  taskPath: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface AgentRunInput {
  task: Task;
  runDir: string;
  promptPath: string;
  projectPath: string;
  config: CodeFleetConfig;
}

export interface AgentRunResult {
  status: RunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface RunResultFile {
  runId: string;
  taskId: string;
  agent: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  runPlanPath?: string;
  adapterRequestPath?: string;
  harnessObservationPath?: string;
  adapterResultPath?: string;
  runSummaryPath?: string;
  promptPath: string;
  stdoutLogPath: string;
  stderrLogPath: string;
  diffPath: string;
  resultPath: string;
  exitCode: number | null;
  error?: string;
}

export const DEFAULT_CONFIG: CodeFleetConfig = {
  version: "0.1.0",
  defaultAgent: "codex",
  mode: "dry-run",
  agents: {
    codex: {
      command: "codex",
      args: ["exec", "-"]
    }
  }
};
