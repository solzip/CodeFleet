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

export interface TaskVerificationCommand {
  commandId: string;
  command: string[];
}

export interface TaskVerification {
  commands: TaskVerificationCommand[];
}

export interface Task {
  id: string;
  title: string;
  projectPath: string;
  goal: string;
  scope: TaskScope;
  verification?: TaskVerification;
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

// A command the provider says it ran. Never command truth: the Harness did not
// see it happen. Core stores it and Review may read it as a hint, and that is
// the whole of what it is allowed to do.
export interface ProviderReportedCommand {
  eventType: string;
  argv: string[];
  raw: string;
  exitCode: number | null;
  lineNumber: number;
}

// What the adapter could and could not read out of its own transcript. The
// counts are here so an unparsed transcript and an empty one stay distinct.
export interface ProviderTranscriptReading {
  commands: ProviderReportedCommand[];
  unavailableReason: string;
  scanScope: {
    linesRead: number;
    jsonLinesParsed: number;
    commandEventsFound: number;
    unrecognizedJsonLines: number;
  };
}

export interface AgentRunResult {
  status: RunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  // Provider-agnostic by contract. The adapter owns the parsing rule; Core
  // never learns which provider produced this or how it was recognized.
  providerTranscript?: ProviderTranscriptReading;
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
