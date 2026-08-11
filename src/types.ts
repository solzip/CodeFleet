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

// The four requested harness modes. `mode` below is the derived two-value view
// the Run currently acts on; the four-value axis is what the Profile stores and
// what policies.harness bounds.
export type HarnessMode = "DRY_RUN" | "SUGGEST_ONLY" | "WORKSPACE_EDIT" | "COMMAND_EXEC";

export const HARNESS_MODES: HarnessMode[] = [
  "DRY_RUN",
  "SUGGEST_ONLY",
  "WORKSPACE_EDIT",
  "COMMAND_EXEC"
];

// A derived read model over the Project Profile and its Local Overlay, not a
// second source of truth. Every field here is computed at load time; nothing
// writes back to it, and the Profile stays the only thing on disk.
export interface CodeFleetConfig {
  schemaVersion: string;
  workspaceId: string;
  harnessMode: HarnessMode;
  /** COMMAND_EXEC is the only mode that both edits files and runs commands. */
  mode: CodeFleetMode;
  /** Resolved AdapterId. Provider-agnostic: never a command path or model name. */
  agentAdapter: string;
  /** policies.agentAdapters.allowedAdapters. Resolution is checked against it. */
  allowedAdapters: string[];
  isolationMode: string;
  /** defaults.task.requiredGates, unresolved. The Run Plan merges it. */
  profileRequiredGates?: Record<string, unknown>;
  /** defaults.task.agentRole, used when the Task names none. */
  defaultAgentRole?: string;
  /** policies.agentRoles: allowedAgentRoles and any custom roles. */
  agentRoles: Record<string, unknown>;
  /** policies.risk.riskRules, already validated by the Profile loader. */
  riskRules: unknown[];
  /** projectPolicy candidate. Restrict-only sources may lower it, never raise it. */
  autoAdvanceOnDone: boolean;
  /** Comes from the Local Overlay. The Profile may not carry a command path. */
  adapterCommand: AgentCommandConfig;
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
  /** Optional in the YAML; the resolved Revision must be concrete. */
  requiredGates?: Record<string, unknown>;
  /** Classification, not a grant. Contributes an upper bound to effectivePolicy. */
  agentRole?: string;
  /** Task-local narrowing. Never widens what the Profile or the role allows. */
  guardrails?: Record<string, unknown>;
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
  /** What the AdapterRequest permitted. The adapter reads it and refuses beyond it. */
  capabilities?: { fileEdit: boolean; commandExecution: boolean };
  limits?: { timeoutMs?: number; outputCapBytes?: number };
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
  /** Bytes dropped by the output cap, and the limits that were in force. */
  scanScope?: {
    stdoutTruncatedBytes: number;
    stderrTruncatedBytes: number;
    timeoutMs: number;
    outputCapBytes: number;
  };
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

/** What `codefleet init` writes. Shaped by PROFILE_TOP_LEVEL_KEYS_FIXED. */
export const DEFAULT_PROFILE = {
  schemaVersion: "1.0.0",
  project: { id: "", name: "" },
  workspace: { id: "codefleet-workspace" },
  defaults: {
    task: { harnessMode: "DRY_RUN", agentRole: "BACKEND_IMPLEMENTER" },
    run: { agentAdapter: "codex", isolationMode: "NONE" }
  },
  policies: {
    harness: DEFAULT_HARNESS_POLICY,
    agentAdapters: { allowedAdapters: ["codex"] },
    files: {},
    commands: DEFAULT_COMMAND_POLICY,
    risk: {},
    verification: {},
    redaction: {},
    carryForward: {},
    agentRoles: {}
  },
  references: {},
  localPolicy: {
    mergeMode: "RESTRICT_ONLY",
    overlayPath: ".codefleet/local.json",
    // The adapter command is one machine's path, not the workspace's policy.
    allowedLocalKeys: ["adapterCommand"]
  }
};

/** What `codefleet init` writes to the Local Overlay. Never committed. */
export const DEFAULT_LOCAL_OVERLAY = {
  adapterCommand: { command: "codex", args: ["exec", "-"] }
};

export const DEFAULT_CONFIG: CodeFleetConfig = {
  schemaVersion: "1.0.0",
  workspaceId: "codefleet-workspace",
  harnessMode: "DRY_RUN",
  mode: "dry-run",
  agentAdapter: "codex",
  allowedAdapters: ["codex"],
  agentRoles: {},
  riskRules: [],
  autoAdvanceOnDone: false,
  isolationMode: "NONE",
  adapterCommand: {},
  policies: {
    commands: DEFAULT_COMMAND_POLICY,
    harness: DEFAULT_HARNESS_POLICY
  }
};
