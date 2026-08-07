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

type VerificationAuthority = "NONE" | "PROVIDER_REPORTED_ONLY" | "HARNESS_OBSERVED" | "HARNESS_EXECUTED" | "WAIVED_BY_POLICY";
type ObservedCheck = "PASS" | "FAIL" | "SKIP" | "NONE";
type VerificationGateResult = "SATISFIED" | "NOT_SATISFIED" | "WAIVED_ALLOWED";
type VerificationGateReason = "NOT_REQUIRED" | "PASS" | "WAIVER" | "FAILED" | "MISSING" | "BLOCKED" | "UNAVAILABLE";

interface UnavailableRef {
  unavailableReason: string;
  degraded?: boolean;
}

interface VerificationAttempt {
  commandId: string;
  command: string[];
  cwdRef: string;
  authority: VerificationAuthority;
  decision: "ALLOWED" | "BLOCKED" | "UNAVAILABLE";
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  stdoutRef: FileRef | UnavailableRef;
  stderrRef: FileRef | UnavailableRef;
  logRef: FileRef | UnavailableRef;
  result: ObservedCheck;
  blockedReason: string;
  unavailableReason: string;
}

interface VerificationEvidence {
  schemaVersion: "0.2";
  documentKind: "VERIFICATION_EVIDENCE";
  verificationAttemptId: string;
  runId: string;
  runPlanId: string;
  taskRevisionRef: FileRef;
  runPlanRef: FileRef;
  harnessObservationRef: FileRef;
  verificationPlanRef: FileRef;
  effectivePolicyHash: string;
  authority: VerificationAuthority;
  observedCheck: ObservedCheck;
  verificationGateResult: VerificationGateResult;
  verificationGateReason: VerificationGateReason;
  attempts: VerificationAttempt[];
  providerReportedVerificationRef: UnavailableRef;
  waiverRef: UnavailableRef;
  failureFindingRefs: FileRef[];
  unavailableReason: string;
  createdAt: string;
}

interface RunSummary {
  schemaVersion: "0.2";
  documentKind: "RUN_SUMMARY";
  finalDecisionTruth: false;
  runId: string;
  runPlanId: string;
  taskId: string;
  createdAt: string;
  normalization: {
    status: "COMPLETE" | "PARTIAL" | "BLOCKED";
    unavailableReasons: string[];
  };
  inputs: {
    runPlanRef: FileRef;
    adapterRequestRef: FileRef;
    harnessObservationRef: FileRef;
    adapterResultRef: FileRef;
    verificationEvidenceRefs: FileRef[];
    verificationEvidenceRef: FileRef | UnavailableRef;
  };
  result: {
    value: string;
    derivedFrom: string[];
  };
  check: {
    observedCheck: ObservedCheck;
    verificationGateResult: VerificationGateResult;
    verificationGateReason: VerificationGateReason;
    derivedFromVerificationAttemptIds: string[];
  };
  evidenceAuthority: {
    commandEvidenceAuthority: string;
    changedFilesAuthority: string;
  };
  policy: {
    computedRisk: string;
    pathViolationSummary: {
      evaluated: boolean;
      hasViolation: boolean;
      violationRefs: FileRef[];
      unavailableReason: string;
    };
  };
  safeguards: {
    canProduceVerified: false;
    acceptanceEvidence: false;
    degradedReasons: string[];
  };
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
  const runSummaryPath = path.join(runDir, "run-summary.json");
  const verificationDir = path.join(runDir, "verification");
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
    runSummaryPath: toRelativePath(rootDir, runSummaryPath),
    verificationDir: toRelativePath(rootDir, verificationDir)
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
  const harnessObservationRef = await fileRef(rootDir, harnessObservationPath);

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
  const adapterResultRef = await fileRef(rootDir, adapterResultPath);

  await mkdir(verificationDir, { recursive: true });
  const verificationAttemptId = await nextVerificationAttemptId(verificationDir);
  const verificationEvidencePath = path.join(verificationDir, `${verificationAttemptId}.json`);
  const verificationEvidence = buildVerificationEvidence({
    verificationAttemptId,
    runId,
    runPlanId,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlan,
    runPlanRef,
    sourceTaskRef,
    harnessObservationRef
  });
  assertVerificationEvidence(verificationEvidence);
  await writeJson(verificationEvidencePath, verificationEvidence);
  const verificationEvidenceRef = await fileRef(rootDir, verificationEvidencePath);

  const finishedAt = new Date();
  const runSummary = buildRunSummary({
    runId,
    runPlanId,
    taskId: task.id,
    createdAt: formatDateTimeWithOffset(finishedAt),
    runPlanRef,
    adapterRequestRef,
    harnessObservationRef,
    adapterResultRef,
    agentResult,
    runPlan,
    harnessObservation,
    verificationEvidenceRef,
    verificationEvidence
  });
  assertRunSummary(runSummary);
  await writeJson(runSummaryPath, runSummary);

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
    runSummaryPath: toRelativePath(rootDir, runSummaryPath),
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

function buildRunSummary(input: {
  runId: string;
  runPlanId: string;
  taskId: string;
  createdAt: string;
  runPlanRef: FileRef;
  adapterRequestRef: FileRef;
  harnessObservationRef: FileRef;
  adapterResultRef: FileRef;
  agentResult: AgentRunResult;
  runPlan: Record<string, unknown>;
  harnessObservation: Record<string, unknown>;
  verificationEvidenceRef: FileRef | null;
  verificationEvidence: VerificationEvidence | null;
}): RunSummary {
  const unavailableReasons = runSummaryUnavailableReasons(input);
  const verificationRequired = isVerificationRequired(input.runPlan);
  const observedCheck = typeof input.verificationEvidence?.observedCheck === "string" ? input.verificationEvidence.observedCheck : "NONE";
  const verificationGateResult = typeof input.verificationEvidence?.verificationGateResult === "string"
    ? input.verificationEvidence.verificationGateResult
    : verificationRequired ? "NOT_SATISFIED" : "SATISFIED";
  const verificationGateReason = typeof input.verificationEvidence?.verificationGateReason === "string"
    ? input.verificationEvidence.verificationGateReason
    : verificationRequired ? "MISSING" : "NOT_REQUIRED";
  const verificationAttemptId = typeof input.verificationEvidence?.verificationAttemptId === "string"
    ? input.verificationEvidence.verificationAttemptId
    : null;

  return {
    schemaVersion: "0.2",
    documentKind: "RUN_SUMMARY",
    finalDecisionTruth: false,
    runId: input.runId,
    runPlanId: input.runPlanId,
    taskId: input.taskId,
    createdAt: input.createdAt,
    normalization: {
      status: unavailableReasons.length > 0 ? "PARTIAL" : "COMPLETE",
      unavailableReasons
    },
    inputs: {
      runPlanRef: input.runPlanRef,
      adapterRequestRef: input.adapterRequestRef,
      harnessObservationRef: input.harnessObservationRef,
      adapterResultRef: input.adapterResultRef,
      verificationEvidenceRefs: input.verificationEvidenceRef === null ? [] : [input.verificationEvidenceRef],
      verificationEvidenceRef: input.verificationEvidenceRef ?? {
        unavailableReason: "VERIFICATION_EVIDENCE_NOT_AVAILABLE"
      }
    },
    result: {
      value: normalizedRunResult(input.agentResult),
      derivedFrom: [input.adapterResultRef.path]
    },
    check: {
      observedCheck,
      verificationGateResult,
      verificationGateReason,
      derivedFromVerificationAttemptIds: verificationAttemptId === null ? [] : [verificationAttemptId]
    },
    evidenceAuthority: {
      commandEvidenceAuthority: commandEvidenceAuthority(input.harnessObservation),
      changedFilesAuthority: changedFilesAuthority(input.harnessObservation)
    },
    policy: {
      computedRisk: ((input.runPlan.computedRisk as Record<string, unknown> | undefined)?.level as string | undefined) ?? "UNKNOWN",
      pathViolationSummary: {
        evaluated: false,
        hasViolation: false,
        violationRefs: [],
        unavailableReason: "PATH_POLICY_EVALUATION_NOT_IMPLEMENTED_V02"
      }
    },
    safeguards: {
      canProduceVerified: false,
      acceptanceEvidence: false,
      degradedReasons: [
        "RUN_SUMMARY_IS_DERIVED_NOT_DECISION_TRUTH",
        "PROVIDER_REPORTED_OBSERVATIONS_ARE_NOT_CORE_TRUTH"
      ]
    }
  };
}

function runSummaryUnavailableReasons(input: {
  agentResult: AgentRunResult;
  harnessObservation: Record<string, unknown>;
  verificationEvidence: VerificationEvidence | null;
}): string[] {
  const reasons = new Set<string>();
  const workspace = input.harnessObservation.workspace as Record<string, unknown> | undefined;
  addUnavailableReason(reasons, workspace?.preRunStateRef);
  addUnavailableReason(reasons, workspace?.postRunStateRef);
  addUnavailableReason(reasons, input.harnessObservation.changes);
  addUnavailableReason(reasons, input.harnessObservation.commands);
  const commands = input.harnessObservation.commands as Record<string, unknown> | undefined;
  addUnavailableReason(reasons, commands?.commandLogRef);
  addUnavailableReason(reasons, commands?.providerReportedCommandsRef);
  const policyChecks = input.harnessObservation.policyChecks as Record<string, unknown> | undefined;
  addUnavailableReason(reasons, policyChecks?.pathPolicyEvaluationRef);
  addUnavailableReason(reasons, input.verificationEvidence);
  if (input.verificationEvidence === null) {
    reasons.add("VERIFICATION_EVIDENCE_NOT_AVAILABLE");
  }
  if (input.agentResult.status === "DRY_RUN") {
    reasons.add("DRY_RUN_NOT_EXECUTED");
  }
  return Array.from(reasons).sort();
}

function addUnavailableReason(reasons: Set<string>, value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const reason = (value as Record<string, unknown>).unavailableReason;
  if (typeof reason === "string" && reason.length > 0) {
    reasons.add(reason);
  }
}

function buildVerificationEvidence(input: {
  verificationAttemptId: string;
  runId: string;
  runPlanId: string;
  createdAt: string;
  runPlan: Record<string, unknown>;
  runPlanRef: FileRef;
  sourceTaskRef: FileRef;
  harnessObservationRef: FileRef;
}): VerificationEvidence {
  const verificationPlan = input.runPlan.verificationPlan ?? {};
  const unavailableReason = verificationUnavailableReason(input.runPlan);
  return {
    schemaVersion: "0.2",
    documentKind: "VERIFICATION_EVIDENCE",
    verificationAttemptId: input.verificationAttemptId,
    runId: input.runId,
    runPlanId: input.runPlanId,
    taskRevisionRef: input.sourceTaskRef,
    runPlanRef: input.runPlanRef,
    harnessObservationRef: input.harnessObservationRef,
    verificationPlanRef: {
      path: `${input.runPlanRef.path}#/verificationPlan`,
      contentHash: hashJson(verificationPlan),
      present: true
    },
    effectivePolicyHash: effectivePolicyHash(input.runPlan),
    authority: "NONE",
    observedCheck: "NONE",
    verificationGateResult: isVerificationRequired(input.runPlan) ? "NOT_SATISFIED" : "SATISFIED",
    verificationGateReason: isVerificationRequired(input.runPlan) ? "MISSING" : "NOT_REQUIRED",
    attempts: [
      {
        commandId: "verification-unavailable",
        command: [],
        cwdRef: "",
        authority: "NONE",
        decision: "UNAVAILABLE",
        startedAt: input.createdAt,
        endedAt: input.createdAt,
        exitCode: null,
        stdoutRef: {
          unavailableReason: "COMMAND_NOT_EXECUTED"
        },
        stderrRef: {
          unavailableReason: "COMMAND_NOT_EXECUTED"
        },
        logRef: {
          unavailableReason
        },
        result: "NONE",
        blockedReason: "",
        unavailableReason
      }
    ],
    providerReportedVerificationRef: {
      unavailableReason: "PROVIDER_REPORTED_VERIFICATION_NOT_IMPLEMENTED_V02",
      degraded: true
    },
    waiverRef: {
      unavailableReason: "VERIFICATION_WAIVER_NOT_PRESENT"
    },
    failureFindingRefs: [],
    unavailableReason,
    createdAt: input.createdAt
  };
}

async function nextVerificationAttemptId(verificationDir: string): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(verificationDir);
  } catch {
    return "verify-001";
  }

  const last = entries
    .map((entry) => entry.match(/^verify-(\d{3})\.json$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => Number(match[1]))
    .reduce((max, value) => Math.max(max, value), 0);

  return `verify-${String(last + 1).padStart(3, "0")}`;
}

function verificationUnavailableReason(runPlan: Record<string, unknown>): string {
  const commands = verificationPlanCommands(runPlan);
  if (commands.length === 0) {
    return "NO_VERIFICATION_COMMANDS_CONFIGURED";
  }
  return "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE";
}

function verificationPlanCommands(runPlan: Record<string, unknown>): unknown[] {
  const commands = (runPlan.verificationPlan as Record<string, unknown> | undefined)?.commands;
  return Array.isArray(commands) ? commands : [];
}

function assertVerificationEvidence(value: VerificationEvidence): void {
  const errors: string[] = [];
  if (value.schemaVersion !== "0.2") {
    errors.push("schemaVersion must be 0.2");
  }
  if (value.documentKind !== "VERIFICATION_EVIDENCE") {
    errors.push("documentKind must be VERIFICATION_EVIDENCE");
  }
  if (!/^verify-\d{3}$/.test(value.verificationAttemptId)) {
    errors.push("verificationAttemptId must be verify-NNN");
  }
  if (value.authority === "NONE" && value.observedCheck === "PASS") {
    errors.push("authority NONE cannot produce observedCheck PASS");
  }
  if (value.verificationGateResult === "SATISFIED" && value.verificationGateReason !== "NOT_REQUIRED" && value.observedCheck !== "PASS") {
    errors.push("SATISFIED requires PASS unless verification is not required");
  }
  if (value.attempts.length === 0) {
    errors.push("attempts must include an explicit unavailable attempt when verification is not executed");
  }
  for (const attempt of value.attempts) {
    if (attempt.authority === "NONE" && attempt.result === "PASS") {
      errors.push(`attempt ${attempt.commandId} has authority NONE but result PASS`);
    }
    if (attempt.decision === "UNAVAILABLE" && attempt.unavailableReason.length === 0) {
      errors.push(`attempt ${attempt.commandId} is UNAVAILABLE without unavailableReason`);
    }
  }
  if (value.unavailableReason.length === 0 && value.authority === "NONE") {
    errors.push("authority NONE requires unavailableReason");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid VerificationEvidence: ${errors.join("; ")}`);
  }
}

function assertRunSummary(value: RunSummary): void {
  const errors: string[] = [];
  if (value.schemaVersion !== "0.2") {
    errors.push("schemaVersion must be 0.2");
  }
  if (value.documentKind !== "RUN_SUMMARY") {
    errors.push("documentKind must be RUN_SUMMARY");
  }
  if (value.finalDecisionTruth !== false) {
    errors.push("RunSummary cannot be final decision truth");
  }
  if (value.check.observedCheck === "PASS" && value.evidenceAuthority.commandEvidenceAuthority === "NONE") {
    errors.push("command authority NONE cannot produce observedCheck PASS");
  }
  if (value.safeguards.canProduceVerified || value.safeguards.acceptanceEvidence) {
    errors.push("RunSummary cannot produce VERIFIED or acceptance evidence");
  }
  if (value.inputs.verificationEvidenceRefs.length > 0 && value.check.derivedFromVerificationAttemptIds.length === 0) {
    errors.push("verification evidence refs require derived attempt ids");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid RunSummary: ${errors.join("; ")}`);
  }
}

function isVerificationRequired(runPlan: Record<string, unknown>): boolean {
  return Boolean(
    (((runPlan.effectivePolicy as Record<string, unknown> | undefined)?.requiredGates as Record<string, unknown> | undefined)
      ?.verification as Record<string, unknown> | undefined)?.required
  );
}

function effectivePolicyHash(runPlan: Record<string, unknown>): string {
  const policyHash = (runPlan.effectivePolicy as Record<string, unknown> | undefined)?.policyHash;
  return typeof policyHash === "string" ? policyHash : "";
}

function normalizedRunResult(result: AgentRunResult): string {
  if (result.status === "SUCCEEDED") {
    return "DONE";
  }
  if (result.status === "FAILED") {
    return "FAILED";
  }
  return "UNKNOWN";
}

function commandEvidenceAuthority(harnessObservation: Record<string, unknown>): string {
  const commands = harnessObservation.commands as Record<string, unknown> | undefined;
  return typeof commands?.authority === "string" ? commands.authority : "NONE";
}

function changedFilesAuthority(harnessObservation: Record<string, unknown>): string {
  const changes = harnessObservation.changes as Record<string, unknown> | undefined;
  return typeof changes?.unavailableReason === "string" && changes.unavailableReason.length > 0 ? "NONE" : "HARNESS_OBSERVED";
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

// `git diff --name-only` reports tracked modifications only, so an agent that
// creates a new file would leave no trace in changed-files evidence. Untracked
// files are policy subjects, so changed-files truth must include them.
async function captureGitChangedFiles(projectPath: string): Promise<{ files: string[]; unavailableReason?: string }> {
  const result = await runProcess(
    "git",
    ["-c", `safe.directory=${projectPath}`, "status", "--porcelain=v1", "--untracked-files=all", "--", "."],
    projectPath
  );
  if (result.code !== 0) {
    return {
      files: [],
      unavailableReason: "GIT_CHANGED_FILES_FAILED"
    };
  }

  const files = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length < 4) {
      continue;
    }
    const entry = parsePorcelainEntry(line);
    if (entry === null) {
      continue;
    }
    for (const value of entry) {
      files.add(value);
    }
  }

  return { files: [...files].sort() };
}

// Porcelain v1 line: XY <path> or XY <old> -> <new> for renames and copies.
// Both sides of a rename are recorded because delete and create are each a
// policy subject on their own.
function parsePorcelainEntry(line: string): string[] | null {
  const status = line.slice(0, 2);
  const rest = line.slice(3).trim();
  if (rest.length === 0) {
    return null;
  }

  const paths = rest.includes(" -> ") ? rest.split(" -> ") : [rest];
  const cleaned = paths
    .map((value) => unquoteGitPath(value.trim()))
    .filter((value) => value.length > 0 && !isCodefleetMetadataPath(value));

  return cleaned.length > 0 && status.trim().length > 0 ? cleaned : null;
}

function unquoteGitPath(value: string): string {
  if (!value.startsWith("\"") || !value.endsWith("\"") || value.length < 2) {
    return value;
  }

  try {
    return JSON.parse(value) as string;
  } catch {
    return value.slice(1, -1);
  }
}

// CodeFleet's own run artifacts are written during the Run and are not agent
// changes, so they are excluded from changed-files evidence.
function isCodefleetMetadataPath(value: string): boolean {
  return value === ".codefleet" || value.startsWith(".codefleet/");
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
