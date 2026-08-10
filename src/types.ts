export type CodeFleetMode = "dry-run" | "execute";

export type RunStatus = "DRY_RUN" | "SUCCEEDED" | "FAILED";

export interface AgentCommandConfig {
  command?: string;
  args?: string[];
}

export interface CommandMatcherConfig {
  argv: string[];
  matchMode?: "PREFIX" | "EXACT";
}

export interface DestructiveMatcherConfig extends CommandMatcherConfig {
  categoryId: string;
}

// policies.commands from the Project Profile. This is workspace policy, not
// local machine state, which is why command paths and tokens never live here.
export interface CommandPolicyConfig {
  allowedCommands: CommandMatcherConfig[];
  deniedCommands: CommandMatcherConfig[];
  destructiveCommands: DestructiveMatcherConfig[];
  requireHarnessVisibleCommandChannel: boolean;
  allowProviderReportedCommandTruth: boolean;
}

// policies.harness. Only the two command-observation switches are enforced
// today; the mode fields are accepted so a profile can carry them, and the
// status file records that they are not yet applied.
export interface HarnessPolicyConfig {
  allowedModes: string[];
  maxMode: string;
  requireIsolationForMutation: boolean;
  allowDegradedCommandObservation: boolean;
  approvalRequiredForDestructiveCommands: boolean;
}

export interface ProfilePolicies {
  commands: CommandPolicyConfig;
  harness: HarnessPolicyConfig;
}

export const DEFAULT_HARNESS_POLICY: HarnessPolicyConfig = {
  allowedModes: ["DRY_RUN", "SUGGEST_ONLY", "WORKSPACE_EDIT", "COMMAND_EXEC"],
  maxMode: "COMMAND_EXEC",
  requireIsolationForMutation: true,
  // AND, false wins. Running commands nobody can observe is a decision someone
  // has to make on purpose, so silence is not that decision.
  allowDegradedCommandObservation: false,
  approvalRequiredForDestructiveCommands: true
};

export interface CodeFleetConfig {
  version: string;
  defaultAgent: string;
  mode: CodeFleetMode;
  agents?: Record<string, AgentCommandConfig>;
  policies: ProfilePolicies;
}

export const DEFAULT_COMMAND_POLICY: CommandPolicyConfig = {
  allowedCommands: [],
  deniedCommands: [],
  destructiveCommands: [],
  // Defaults are the strict end of each switch. A profile that says nothing
  // must not be read as a profile that permits everything.
  requireHarnessVisibleCommandChannel: true,
  allowProviderReportedCommandTruth: false
};

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
  },
  policies: {
    commands: DEFAULT_COMMAND_POLICY,
    harness: DEFAULT_HARNESS_POLICY
  }
};
