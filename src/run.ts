import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgentAdapter } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { renderPrompt } from "./prompt.ts";
import { loadTask } from "./task.ts";
import { contentHashOf, replayApproval } from "./task-ledger.ts";
import type { AgentRunInput, AgentRunResult, RunResultFile } from "./types.ts";
import { normalizeCommand, preflightCommand, type CommandMatcher, type DestructiveMatcher } from "./command-policy.ts";
import { evaluatePathPolicy, type PathViolation } from "./path-policy.ts";
import { renderRunRecord } from "./run-record.ts";
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
  // Reporting what was scanned, not only the verdict: zero attempts examined
  // and zero attempts failing must not look the same.
  scanScope: {
    attemptsRecorded: number;
    attemptsExecuted: number;
    attemptsBlocked: number;
  };
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
    scanScope: {
      attemptsRecorded: number;
      attemptsExecuted: number;
      attemptsBlocked: number;
    };
  };
  evidenceAuthority: {
    commandEvidenceAuthority: string;
    changedFilesAuthority: string;
    verificationAuthority: string;
  };
  policy: {
    computedRisk: string;
    pathViolationSummary: {
      evaluated: boolean;
      hasViolation: boolean;
      violations: PathViolation[];
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
  // Approval is checked before anything else about how to run. It answers
  // whether this contract may execute at all; projectPath only answers where.
  // Reporting a path problem to someone who has not approved sends them the
  // wrong way, and no artifact is written either way.
  const approval = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
  if (approval.blockedReason.length > 0) {
    throw new Error(
      `Task is not approved for execution: ${taskId} (${approval.blockedReason}).
` +
        "Run 'codefleet task approve " + taskId + " --reason <text>' first."
    );
  }

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
    commands: (task.verification?.commands ?? []).map((entry) => ({
      commandId: entry.commandId,
      command: entry.command,
      cwdRef: task.projectPath
    })),
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
    approval: {
      taskRevision: approval.approvedRevision,
      approvalTargetHash: approval.approvedHash,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt
    },
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

  // Path policy can only be evaluated when changed-files evidence is itself
  // trustworthy. If the observation is degraded, the evaluation stays
  // unavailable rather than reporting "no violations" over partial input.
  // Enforcement reads the derived effectivePolicy, not the Task scope. The two
  // are identical today, but guardrails and Local Overlay narrow the derived
  // copy, and enforcing the un-narrowed source would widen permission.
  const enforcedAllowedPaths = effectivePolicy.capabilities.allowedPaths;
  const enforcedDeniedPaths = effectivePolicy.capabilities.deniedPaths;

  const pathPolicy = changedFilesEvidence.unavailableReason === undefined
    ? evaluatePathPolicy({
        changedFiles: changedFilesEvidence.files,
        allowedPaths: enforcedAllowedPaths,
        deniedPaths: enforcedDeniedPaths,
        caseSensitive: await detectCaseSensitivity(projectPath),
        symlinkEscapes: await findEscapingSymlinks(projectPath, changedFilesEvidence.files),
        nestedRepoPaths: await findNestedRepositories(projectPath)
      })
    : {
        evaluated: false,
        caseSensitive: true,
        allowedPaths: enforcedAllowedPaths,
        deniedPaths: enforcedDeniedPaths,
        checkedPaths: [],
        violations: [],
        unavailableReason: changedFilesEvidence.unavailableReason
      };

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
      pathViolations: pathPolicy.violations,
      commandViolations: [],
      capabilityViolations: [],
      pathPolicyEvaluation: {
        evaluated: pathPolicy.evaluated,
        caseSensitive: pathPolicy.caseSensitive,
        allowedPaths: pathPolicy.allowedPaths,
        deniedPaths: pathPolicy.deniedPaths,
        checkedPaths: pathPolicy.checkedPaths,
        scanScope: {
          pathsChecked: pathPolicy.checkedPaths.length,
          violationsFound: pathPolicy.violations.length,
          allowedPatterns: pathPolicy.allowedPaths.length,
          deniedPatterns: pathPolicy.deniedPaths.length
        },
        unavailableReason: pathPolicy.unavailableReason
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
  const verificationAttempts = await runVerificationCommands({
    runDir,
    rootDir,
    projectPath,
    verificationAttemptId,
    commands: verificationPlanSeed.commands,
    commandExecution: effectivePolicy.capabilities.commandExecution,
    allowedCommands: effectivePolicy.capabilities.allowedCommands as unknown as CommandMatcher[],
    deniedCommands: effectivePolicy.capabilities.deniedCommands as unknown as CommandMatcher[],
    destructiveCommands: [] as DestructiveMatcher[],
    cwdRef: task.projectPath
  });
  const verificationEvidence = buildVerificationEvidence({
    verificationAttemptId,
    runId,
    runPlanId,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlan,
    runPlanRef,
    sourceTaskRef,
    harnessObservationRef,
    attempts: verificationAttempts
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

  // Written for every Run, not only exported ones, so a person always has one
  // file describing what happened and what stayed unknown.
  await writeFile(
    path.join(runDir, "run-record.md"),
    renderRunRecord({
      runId,
      taskId: task.id,
      createdAt: formatDateTimeWithOffset(startedAtDate),
      task,
      runSummary: runSummary as unknown as Record<string, unknown>,
      harnessObservation,
      localReview: null
    }),
    "utf8"
  );

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
      derivedFromVerificationAttemptIds: verificationAttemptId === null ? [] : [verificationAttemptId],
      scanScope: input.verificationEvidence?.scanScope ?? {
        attemptsRecorded: 0,
        attemptsExecuted: 0,
        attemptsBlocked: 0
      }
    },
    evidenceAuthority: {
      commandEvidenceAuthority: commandEvidenceAuthority(input.harnessObservation),
      changedFilesAuthority: changedFilesAuthority(input.harnessObservation),
      verificationAuthority: input.verificationEvidence?.authority ?? "NONE"
    },
    policy: {
      computedRisk: ((input.runPlan.computedRisk as Record<string, unknown> | undefined)?.level as string | undefined) ?? "UNKNOWN",
      pathViolationSummary: pathViolationSummary(input.harnessObservation)
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
  const pathEvaluation = policyChecks?.pathPolicyEvaluation as Record<string, unknown> | undefined;
  if (pathEvaluation?.evaluated !== true) {
    addUnavailableReason(reasons, pathEvaluation);
  }
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

interface PlannedVerificationCommand {
  commandId: string;
  command: string[];
  cwdRef: string;
}

// The Harness runs verification commands itself, which is what makes the result
// HARNESS_EXECUTED rather than a provider claim. This channel covers only these
// planned commands; commands the agent ran on its own remain invisible and keep
// HarnessObservation.commands.authority at NONE.
async function runVerificationCommands(input: {
  runDir: string;
  rootDir: string;
  projectPath: string;
  verificationAttemptId: string;
  commands: PlannedVerificationCommand[];
  commandExecution: boolean;
  allowedCommands: CommandMatcher[];
  deniedCommands: CommandMatcher[];
  destructiveCommands: DestructiveMatcher[];
  cwdRef: string;
}): Promise<VerificationAttempt[]> {
  if (input.commands.length === 0) {
    return [];
  }

  const logDir = path.join(input.runDir, "verification", input.verificationAttemptId);
  await mkdir(logDir, { recursive: true });
  const attempts: VerificationAttempt[] = [];

  for (const planned of input.commands) {
    const normalized = normalizeCommand(planned.command, input.projectPath);
    const preflight = preflightCommand({
      normalized,
      commandExecution: input.commandExecution,
      allowedCommands: input.allowedCommands,
      deniedCommands: input.deniedCommands,
      destructiveCommands: input.destructiveCommands,
      approvedCategoryIds: []
    });
    const startedAt = formatDateTimeWithOffset(new Date());

    if (preflight.decision === "BLOCKED") {
      attempts.push({
        commandId: planned.commandId,
        command: normalized.argv,
        cwdRef: input.cwdRef,
        authority: "NONE",
        decision: "BLOCKED",
        startedAt,
        endedAt: startedAt,
        exitCode: null,
        stdoutRef: { unavailableReason: "COMMAND_NOT_EXECUTED" },
        stderrRef: { unavailableReason: "COMMAND_NOT_EXECUTED" },
        logRef: { unavailableReason: "COMMAND_NOT_EXECUTED" },
        result: "SKIP",
        blockedReason: preflight.blockedReason,
        unavailableReason: ""
      });
      continue;
    }

    const result = await runProcess(normalized.argv[0], normalized.argv.slice(1), input.projectPath);
    const endedAt = formatDateTimeWithOffset(new Date());
    const stdoutPath = path.join(logDir, `${planned.commandId}.stdout.log`);
    const stderrPath = path.join(logDir, `${planned.commandId}.stderr.log`);
    await writeFile(stdoutPath, result.stdout, "utf8");
    await writeFile(stderrPath, result.stderr, "utf8");

    attempts.push({
      commandId: planned.commandId,
      command: normalized.argv,
      cwdRef: input.cwdRef,
      authority: "HARNESS_EXECUTED",
      decision: "ALLOWED",
      startedAt,
      endedAt,
      exitCode: result.code,
      stdoutRef: await fileRef(input.rootDir, stdoutPath),
      stderrRef: await fileRef(input.rootDir, stderrPath),
      logRef: await fileRef(input.rootDir, stdoutPath),
      result: result.code === 0 ? "PASS" : "FAIL",
      blockedReason: "",
      unavailableReason: ""
    });
  }

  return attempts;
}

// observedCheck and the gate are computed from Harness-executed attempts only.
// A provider claim never appears here, so it can never move the gate.
function deriveVerificationOutcome(
  attempts: VerificationAttempt[],
  runPlan: Record<string, unknown>
): {
  authority: VerificationAuthority;
  observedCheck: ObservedCheck;
  verificationGateResult: VerificationGateResult;
  verificationGateReason: VerificationGateReason;
} {
  const required = isVerificationRequired(runPlan);
  const executed = attempts.filter((attempt) => attempt.authority === "HARNESS_EXECUTED");

  if (executed.length === 0) {
    const blocked = attempts.some((attempt) => attempt.decision === "BLOCKED");
    return {
      authority: "NONE",
      observedCheck: blocked ? "SKIP" : "NONE",
      verificationGateResult: required ? "NOT_SATISFIED" : "SATISFIED",
      verificationGateReason: required ? (blocked ? "BLOCKED" : "MISSING") : "NOT_REQUIRED"
    };
  }

  if (executed.length !== attempts.length) {
    // A partially executed plan cannot show that verification passed.
    return {
      authority: "HARNESS_EXECUTED",
      observedCheck: "SKIP",
      verificationGateResult: required ? "NOT_SATISFIED" : "SATISFIED",
      verificationGateReason: required ? "BLOCKED" : "NOT_REQUIRED"
    };
  }

  const failed = executed.some((attempt) => attempt.result === "FAIL");
  return {
    authority: "HARNESS_EXECUTED",
    observedCheck: failed ? "FAIL" : "PASS",
    verificationGateResult: failed ? "NOT_SATISFIED" : "SATISFIED",
    verificationGateReason: failed ? "FAILED" : "PASS"
  };
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
  attempts: VerificationAttempt[];
}): VerificationEvidence {
  const verificationPlan = input.runPlan.verificationPlan ?? {};
  const executed = input.attempts.filter((attempt) => attempt.decision !== "UNAVAILABLE");
  const unavailableReason = executed.length > 0 ? "" : verificationUnavailableReason(input.runPlan);
  const outcome = deriveVerificationOutcome(input.attempts, input.runPlan);
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
    authority: outcome.authority,
    observedCheck: outcome.observedCheck,
    verificationGateResult: outcome.verificationGateResult,
    verificationGateReason: outcome.verificationGateReason,
    scanScope: {
      attemptsRecorded: input.attempts.length,
      attemptsExecuted: input.attempts.filter((a) => a.authority === "HARNESS_EXECUTED").length,
      attemptsBlocked: input.attempts.filter((a) => a.decision === "BLOCKED").length
    },
    attempts: input.attempts.length > 0
      ? input.attempts
      : [
          {
            commandId: "verification-unavailable",
            command: [],
            cwdRef: "",
            authority: "NONE",
            decision: "UNAVAILABLE",
            startedAt: input.createdAt,
            endedAt: input.createdAt,
            exitCode: null,
            stdoutRef: { unavailableReason: "COMMAND_NOT_EXECUTED" },
            stderrRef: { unavailableReason: "COMMAND_NOT_EXECUTED" },
            logRef: { unavailableReason },
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
  // observedCheck is a verification result, so it is justified by verification
  // authority. commandEvidenceAuthority describes commands the agent ran on its
  // own and stays NONE even when the Harness executed verification itself. These
  // are different enums over different subjects and must not be conflated.
  if (
    value.check.observedCheck === "PASS" &&
    value.evidenceAuthority.verificationAuthority !== "HARNESS_EXECUTED" &&
    value.evidenceAuthority.verificationAuthority !== "HARNESS_OBSERVED"
  ) {
    errors.push(
      `verification authority ${value.evidenceAuthority.verificationAuthority} cannot produce observedCheck PASS`
    );
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

function pathViolationSummary(harnessObservation: Record<string, unknown>): {
  evaluated: boolean;
  hasViolation: boolean;
  violations: PathViolation[];
  unavailableReason: string;
} {
  const policyChecks = harnessObservation.policyChecks as Record<string, unknown> | undefined;
  const evaluation = policyChecks?.pathPolicyEvaluation as Record<string, unknown> | undefined;
  const violations = Array.isArray(policyChecks?.pathViolations)
    ? (policyChecks.pathViolations as PathViolation[])
    : [];

  if (evaluation?.evaluated !== true) {
    return {
      evaluated: false,
      hasViolation: false,
      violations: [],
      unavailableReason:
        typeof evaluation?.unavailableReason === "string" && evaluation.unavailableReason.length > 0
          ? evaluation.unavailableReason
          : "PATH_POLICY_EVALUATION_UNAVAILABLE"
    };
  }

  return {
    evaluated: true,
    hasViolation: violations.length > 0,
    violations,
    unavailableReason: ""
  };
}

// A changed path may be a symlink whose target resolves outside the workspace.
// Matching the link's own path against allowedPaths would say nothing about
// where a write through it actually lands.
async function findEscapingSymlinks(projectPath: string, changedFiles: string[]): Promise<string[]> {
  const escaping: string[] = [];
  const rootReal = await realpath(projectPath).catch(() => projectPath);

  // git reports what lies inside a linked directory, not the link itself, so a
  // junction planted in the workspace makes outside files look like in-scope
  // paths. Checking only the leaf would miss that, so every ancestor segment is
  // checked too.
  for (const file of changedFiles) {
    const segments = file.split("/").filter((segment) => segment.length > 0);
    let escaped = false;

    for (let depth = 1; depth <= segments.length && !escaped; depth += 1) {
      const partial = segments.slice(0, depth).join("/");
      const absolute = path.join(projectPath, partial);
      try {
        const info = await lstat(absolute);
        if (!info.isSymbolicLink()) {
          continue;
        }
        const target = await realpath(absolute);
        const relative = path.relative(rootReal, target);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          escaping.push(file);
          escaped = true;
        }
      } catch {
        // A broken link resolves nowhere, so it cannot escape the workspace.
      }
    }
  }

  return escaping;
}

// git status stops at a nested repository or submodule boundary, so changes
// inside one never appear in changed-files evidence.
async function findNestedRepositories(projectPath: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (dir: string, relative: string, depth: number): Promise<void> => {
    if (depth > 3) {
      return;
    }
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".codefleet") {
        continue;
      }
      const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.name === ".git") {
        if (relative !== "") {
          found.push(relative);
        }
        continue;
      }
      await walk(path.join(dir, entry.name), childRelative, depth + 1);
    }
  };

  await walk(projectPath, "", 0);
  return found;
}

// Windows and macOS default to case-insensitive filesystems. Detection keeps
// allowed and denied matching on the same canonical key, as the fixed rule
// requires, instead of branching on platform at policy level.
async function detectCaseSensitivity(projectPath: string): Promise<boolean> {
  try {
    const upper = path.join(projectPath, ".codefleet");
    const lower = path.join(projectPath, ".CODEFLEET");
    const a = await stat(upper);
    const b = await stat(lower);
    return a.ino !== b.ino || a.ino === 0;
  } catch {
    return process.platform !== "win32" && process.platform !== "darwin";
  }
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
