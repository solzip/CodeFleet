import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, open, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createAgentAdapter,
  gitProcessEnv,
  isAdapterLocallyAvailable,
  runCommand,
  GIT_EVIDENCE_OUTPUT_CAP_BYTES,
  GIT_EVIDENCE_TIMEOUT_MS,
  LOCAL_ADAPTER_REGISTRY,
  NEW_FILE_CAPTURE_BUDGET_MS,
  VERIFICATION_COMMAND_OUTPUT_CAP_BYTES,
  VERIFICATION_COMMAND_TIMEOUT_MS
} from "./agent.ts";
import { loadConfig } from "./config.ts";
import { renderPrompt } from "./prompt.ts";
import { loadTask } from "./task.ts";
import { contentHashOf, replayApproval } from "./task-ledger.ts";
import type { AgentRunInput, AgentRunResult, RunResultFile } from "./types.ts";
import { normalizeCommand, preflightCommand, type CommandMatcher, type DestructiveMatcher } from "./command-policy.ts";
import {
  checkIsolationRequirement,
  prepareIsolation,
  type PreparedIsolation
} from "./isolation.ts";
import { replayObjective } from "./ledger.ts";
import { evaluatePathPolicy, type PathViolation } from "./path-policy.ts";
import { evaluateRisk, type RiskRule } from "./risk.ts";
import {
  computeRoleEffectiveRestrictions,
  meetMode,
  modeRank,
  resolveAgentRole,
  resolveGuardrails,
  validateCustomRole,
  type CustomRole
} from "./agent-role.ts";
import {
  CORE_REQUIRED_GATES,
  mergeRequiredGates,
  validateRequiredGates,
  type RequiredGates
} from "./required-gates.ts";
import { renderRunRecord } from "./run-record.ts";
import { discoverWorkspace, type FileRef, type WorkspaceDiscovery } from "./workspace.ts";
import { captureWorkspaceSnapshot, collectSnapshotGaps, computeDelta } from "./workspace-snapshot.ts";

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
  scanScope?: {
    outputBytes: number;
    stdoutTruncatedBytes: number;
    stderrTruncatedBytes: number;
    truncatedBytes: number;
    timeoutMs: number;
    outputCapBytes: number;
  };
  unavailableReason: string;
}

interface VerificationEvidence {
  schemaVersion: "0.2";
  documentKind: "VERIFICATION_EVIDENCE";
  taskId: string;
  taskRevision: number | null;
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
  /** Null only for a Run planned before the approval recorded a revision. */
  taskRevision: number | null;
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

/**
 * Whether the Objective queue permits running this revision of this Task.
 *
 * Two things are decided here, and they used to be one. The queue can forbid a
 * Task outright — BLOCKED, CANCELED, SKIPPED — and that has always been checked.
 * What was not checked is whether any relation exists at all, or whether the one
 * that exists names the revision about to run.
 *
 * The model makes execution permission the conjunction of an approved Revision
 * and an accepted Objective relation. Treating "attached to nothing" as
 * permission made the second half optional (P0-13), and filtering relations by
 * taskId alone let a relation pinned to revision 1 vouch for a Run of revision 2
 * (P0-14). A relation names a contract; a different revision is a different
 * contract.
 *
 * `taskRevision` is null only when there is no approval to name one, in which
 * case approval has already refused and this is not reached.
 */
export async function blockedQueueReason(
  rootDir: string,
  taskId: string,
  taskRevision: number | null = null
): Promise<string | null> {
  const objectivesDir = path.join(rootDir, ".codefleet", "objectives");
  let objectiveIds: string[];
  try {
    objectiveIds = await readdir(objectivesDir);
  } catch (error) {
    // No objectives directory means no Objective has ever been created, which
    // is now a refusal rather than a pass: a relation is required, so having
    // nowhere for one to live is the strongest form of not having one. Every
    // other error means the queue could not be read, and unread is not the same
    // as empty — swallowing them let a Task somebody cancelled run because a
    // directory was in the way.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      objectiveIds = [];
    } else {
      throw new Error(
        `Run is blocked: the Objective queue at .codefleet/objectives could not be read ` +
          `(${(error as NodeJS.ErrnoException).code ?? "unknown error"}), so CodeFleet cannot tell ` +
          "whether a decision forbids this Task.\n" +
          "Repair or restore that directory before running."
      );
    }
  }

  const accepted: string[] = [];
  const otherRevisions: string[] = [];

  for (const objectiveId of objectiveIds) {
    const { snapshot } = await replayObjective(rootDir, objectiveId);
    // Ordered before the queue is filtered, not after. A ledger that fails to
    // parse produces an empty queue, so a check placed behind "does this
    // Objective hold the Task" never ran in the one case it was written for.
    // An Objective whose ledger cannot be replayed might hold a decision about
    // any Task, so it blocks every Task rather than the ones it appears to name.
    if (snapshot.replay.replayStatus !== "COMPLETE") {
      const findings = snapshot.replay.findings
        .map((finding) => `  - ${finding.checkId}: ${finding.detail}`)
        .slice(0, 5);
      return [
        `Run is blocked: the ledger of Objective ${objectiveId} replayed as ` +
          `${snapshot.replay.replayStatus}, so its queue decisions cannot be read.`,
        "An Objective that cannot be replayed may hold a decision about any Task, so no Task",
        "runs while one is unreadable. This is deliberate: the alternative is running work",
        "somebody stopped in writing.",
        ...findings,
        "",
        `Repair or restore .codefleet/objectives/${objectiveId}/ledger.jsonl, then run`,
        `'codefleet objective status ${objectiveId}' to confirm the replay is COMPLETE.`
      ].join("\n");
    }
    const items = snapshot.queue.filter((item) => item.taskId === taskId);
    if (items.length === 0) {
      continue;
    }
    for (const item of items) {
      if (item.storedState === "BLOCKED" || item.storedState === "CANCELED" || item.storedState === "SKIPPED") {
        return (
          `Run is blocked: ${item.objectiveQueueItemId} is ${item.storedState} in ${objectiveId}. ` +
          "Reverse that decision explicitly before running."
        );
      }
    }
    // A forbidding decision anywhere wins over a permitting one, so acceptance
    // is only counted after every Objective has been read for a refusal.
    for (const item of items) {
      if (taskRevision === null || item.taskRevision === taskRevision) {
        accepted.push(`${objectiveId}:${item.objectiveQueueItemId}`);
      } else {
        otherRevisions.push(`${item.objectiveQueueItemId} (revision ${item.taskRevision}) in ${objectiveId}`);
      }
    }
  }

  if (accepted.length > 0) {
    return null;
  }

  if (otherRevisions.length > 0) {
    return [
      `Run is blocked: ${taskId} is attached to an Objective, but not at revision ${taskRevision}.`,
      ...otherRevisions.map((entry) => `  - ${entry}`),
      "",
      "A relation names a contract, and a different revision is a different contract.",
      "Attach the revision about to run:",
      `  codefleet objective attach <objective-id> ${taskId} --revision ${taskRevision} --reason "..."`
    ].join("\n");
  }

  return [
    `Run is blocked: ${taskId} is not attached to any Objective.`,
    "",
    "Execution permission has two halves — an approved Task Revision and an accepted",
    "Objective relation — and this Task has only the first. A Task nobody placed in a",
    "queue is work nobody decided to do.",
    "",
    "Attach it, then run:",
    `  codefleet objective attach <objective-id> ${taskId} --revision ${taskRevision} --reason "..."`
  ].join("\n");
}

/**
 * The Objectives this revision is accepted into, for the prompt.
 *
 * The design restricts what may be shown: "accepted 또는 approved Objective
 * context만 Harness prompt에 포함". A queue item the Task is attached to at this
 * revision and that no decision forbids is the accepted case; a BLOCKED,
 * SKIPPED, or CANCELED one is not, and an Objective whose ledger will not
 * replay contributes nothing rather than a guess.
 *
 * Read-only and never a gate. blockedQueueReason decides whether the Run may
 * proceed; this only decides what the agent is told.
 */
async function acceptedObjectiveContext(
  rootDir: string,
  taskId: string,
  taskRevision: number | null
): Promise<{ objectiveId: string; title: string; kind: string; position: string }[]> {
  let objectiveIds: string[];
  try {
    objectiveIds = await readdir(path.join(rootDir, ".codefleet", "objectives"));
  } catch {
    return [];
  }

  const context: { objectiveId: string; title: string; kind: string; position: string }[] = [];
  for (const objectiveId of objectiveIds) {
    const { snapshot } = await replayObjective(rootDir, objectiveId);
    if (snapshot.replay.replayStatus !== "COMPLETE" || snapshot.status !== "OPEN") {
      continue;
    }
    const index = snapshot.queue.findIndex(
      (item) =>
        item.taskId === taskId &&
        (taskRevision === null || item.taskRevision === taskRevision) &&
        item.storedState === "WAITING"
    );
    if (index === -1) {
      continue;
    }
    context.push({
      objectiveId,
      title: snapshot.title,
      kind: snapshot.kind,
      position: `item ${index + 1} of ${snapshot.queue.length}`
    });
  }
  return context;
}

export class RunLockHeldError extends Error {
  readonly holder: RunLockHolder | null;

  constructor(taskId: string, holder: RunLockHolder | null) {
    super(
      holder === null
        ? `A run of ${taskId} is already in progress.`
        : `A run of ${taskId} is already in progress: pid ${holder.pid} on ${holder.host} since ${holder.startedAt} (${holder.runId || "before the runId was reserved"}).`
    );
    this.name = "RunLockHeldError";
    this.holder = holder;
  }
}

export interface RunLockHolder {
  pid: number;
  host: string;
  startedAt: string;
  taskId: string;
  runId: string;
}

export interface RunLockEntry {
  taskId: string;
  /** Null when the lock file exists but cannot be read. It still blocks. */
  holder: RunLockHolder | null;
}

// A Run that dies without releasing leaves its lock behind, and a lock nobody
// can clear is a dead end rather than a safeguard. Breaking it stays an explicit
// human action, the same as the mutation lock.
//
// Every run-*.lock file is reported, including one whose contents cannot be
// parsed. What blocks a Run is the file existing, not the file being readable,
// so dropping the unreadable ones would report "no locks" about a workspace
// where a Task cannot run.
export async function listRunLocks(rootDir: string): Promise<RunLockEntry[]> {
  const locksDir = path.join(rootDir, ".codefleet", "locks");
  let fileNames: string[];
  try {
    fileNames = await readdir(locksDir);
  } catch {
    return [];
  }

  const locks: RunLockEntry[] = [];
  for (const fileName of fileNames) {
    if (!fileName.startsWith("run-") || !fileName.endsWith(".lock")) {
      continue;
    }
    const holder = await readRunLockHolder(path.join(locksDir, fileName));
    locks.push({
      taskId: holder?.taskId ?? decodeURIComponent(fileName.slice("run-".length, -".lock".length)),
      holder
    });
  }
  return locks;
}

export async function breakRunLock(rootDir: string, taskId: string): Promise<RunLockEntry | null> {
  const lockPath = runLockPathFor(rootDir, taskId);
  try {
    await stat(lockPath);
  } catch {
    return null;
  }

  const holder = await readRunLockHolder(lockPath);
  await rm(lockPath, { force: true });
  return { taskId, holder };
}

export function runLockPathFor(rootDir: string, taskId: string): string {
  // One lock per Task, not one per workspace. The Mutation Engine's workspace
  // lock is fixed as "not held across Run execution", so a Run cannot borrow it;
  // this reuses the same exclusive-create discipline on a separate file.
  return path.join(rootDir, ".codefleet", "locks", `run-${encodeURIComponent(taskId)}.lock`);
}

// Nothing stopped the same Task from being run twice at once. Both runs derived
// their runId from the same directory listing, got the same id, and then wrote
// over each other inside one Run Trace while both reported success. The lock
// answers "may this Task run now"; reserveRunDir below answers "which id is
// mine", and both are needed because two different Tasks race on the id too.
/**
 * Explicit execution input for one Run request.
 *
 * The design keeps these apart from the Project Profile and from the Task
 * contract: "Run Options는 Project Profile에 저장하지 않는다". An adapter choice
 * is a property of this run, not of the workspace and not of the contract — the
 * role is what the contract fixes, and which CLI carries it out is not.
 *
 * Nothing here widens anything. An override still has to pass the same policy
 * and availability checks the Profile default passes.
 */
export interface RunOptions {
  /** Overrides defaults.run.agentAdapter for this Run only. */
  agentAdapter?: string;
}

export async function runTask(
  rootDir: string,
  taskId: string,
  workspaceDiscovery?: WorkspaceDiscovery,
  runOptions: RunOptions = {}
): Promise<RunExecution> {
  const lockPath = runLockPathFor(rootDir, taskId);
  await acquireRunLock(lockPath, taskId);
  // An isolated tree that outlives its Run is a directory on disk and a
  // registration in the repository that nothing will ever clear. executeRun
  // fills this in the moment the tree exists, so the tree is released on the
  // throwing paths too — the same reason the lock is released in a finally.
  const isolationHandle: IsolationHandle = { prepared: null };
  try {
    return await executeRun(rootDir, taskId, isolationHandle, workspaceDiscovery, runOptions);
  } finally {
    if (isolationHandle.prepared !== null) {
      await isolationHandle.prepared.discard();
    }
    await rm(lockPath, { force: true });
  }
}

/** Lets runTask release a tree executeRun created. */
interface IsolationHandle {
  prepared: PreparedIsolation | null;
}

async function acquireRunLock(lockPath: string, taskId: string): Promise<void> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const holder: RunLockHolder = {
    pid: process.pid,
    host: process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown",
    startedAt: new Date().toISOString(),
    taskId,
    runId: ""
  };

  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(
      `${JSON.stringify({ schemaVersion: "1.0", documentKind: "RUN_LOCK", holder }, null, 2)}\n`,
      "utf8"
    );
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    // Fail fast and name the holder, the same way the mutation lock does. A
    // stale lock is never broken automatically.
    throw new RunLockHeldError(taskId, await readRunLockHolder(lockPath));
  }
}

async function readRunLockHolder(lockPath: string): Promise<RunLockHolder | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, "utf8")) as { holder?: RunLockHolder };
    return parsed.holder ?? null;
  } catch {
    return null;
  }
}

async function executeRun(
  rootDir: string,
  taskId: string,
  isolationHandle: IsolationHandle,
  workspaceDiscovery?: WorkspaceDiscovery,
  runOptions: RunOptions = {}
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
    throw new Error(approvalRefusal(taskId, approval.blockedReason));
  }

  // The Task ledger owns approval; the Objective ledger owns whether the queue
  // still wants this Task run. Checking only the first let a Task that someone
  // blocked or cancelled with a written reason run anyway.
  // The revision that is about to run, not the Task. A relation pinned to an
  // earlier revision does not carry forward to this one.
  const queueBlock = await blockedQueueReason(rootDir, taskId, approval.approvedRevision);
  if (queueBlock !== null) {
    throw new Error(queueBlock);
  }

  // Run Planning is blocked when the Run may execute commands that no
  // Harness-visible channel can observe. CodeFleet has no command proxy or
  // sandbox log yet, so that channel never exists, and running anyway means
  // producing a Run whose command evidence can only ever be a provider claim.
  // Allowing it is a decision a person makes in the profile, in writing.
  const commandChannelBlock = blockedCommandChannelReason({
    commandExecution: config.mode === "execute",
    requireHarnessVisibleCommandChannel: config.policies.commands.requireHarnessVisibleCommandChannel,
    harnessVisibleCommandChannel: HARNESS_VISIBLE_COMMAND_CHANNEL,
    allowDegradedCommandObservation: config.policies.harness.allowDegradedCommandObservation
  });
  if (commandChannelBlock !== null) {
    throw new Error(commandChannelBlock);
  }

  // The adapter is resolved before any artifact exists. REQUIRE_EXPLICIT is a
  // deferral, not a value, so a Run that still holds one has not been planned;
  // and an adapter the policy forbids or this build cannot run must stop here
  // rather than after a Run Trace exists to explain.
  // The role is a classification: it contributes an upper bound and nothing
  // else. Guardrails then narrow further, never wider.
  const roleBlock = config.agentRoles;
  const customRoles: Record<string, CustomRole> = {};
  for (const [id, value] of Object.entries((roleBlock.customRoles ?? {}) as Record<string, unknown>)) {
    const findings = validateCustomRole(id, value, `/policies/agentRoles/customRoles/${id}`);
    if (findings.length > 0) {
      throw new Error(
        [`Invalid custom AgentRole ${id}:`]
          .concat(findings.map((f) => `  - ${f.jsonPointer}: ${f.detail}`))
          .join("\n")
      );
    }
    customRoles[id] = value as CustomRole;
  }

  const roleResolution = resolveAgentRole({
    taskRole: task.agentRole ?? config.defaultAgentRole,
    allowedAgentRoles: Array.isArray(roleBlock.allowedAgentRoles)
      ? (roleBlock.allowedAgentRoles as string[])
      : [],
    customRoles
  });
  if (roleResolution.blockedReason !== "" || roleResolution.role === null) {
    throw new Error(roleResolution.blockedReason);
  }

  const guardrailResolution = resolveGuardrails({
    guardrails: task.guardrails,
    roleMaxMode: roleResolution.role.defaultMaxMode,
    profileMaxMode: config.harnessMode
  });
  if (guardrailResolution.blockedReason !== "") {
    throw new Error(guardrailResolution.blockedReason);
  }
  const effectiveMode = guardrailResolution.mode;

  const adapterResolution = resolveAgentAdapter(config, runOptions);
  if (adapterResolution.blockedReason !== "") {
    throw new Error(adapterResolution.blockedReason);
  }
  const isolation = resolveIsolation(config);
  if (isolation.blockedReason !== "") {
    throw new Error(isolation.blockedReason);
  }

  const projectPath = await resolveWorkspaceProjectPath(discovery.selectedWorkspaceRootRealPath, task.projectPath);
  const startedAtDate = new Date();
  const { runId, runDir } = await reserveRunDir(rootDir, startedAtDate);
  const runPlanId = `${runId}:plan`;

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
  const preRunSnapshotPath = path.join(runDir, "workspace-pre-run.json");
  const postRunSnapshotPath = path.join(runDir, "workspace-post-run.json");
  const providerCommandsPath = path.join(runDir, "provider-commands.json");

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
  // Command policy comes from the Project Profile, not the Task. A Task states
  // what work it wants; it does not get to widen what the workspace permits.
  const commandPolicy = config.policies.commands;
  // meet(harnessMode, roleMaxMode, guardrails.mode) already happened above.
  // WORKSPACE_EDIT and up may edit files; only COMMAND_EXEC may run commands.
  const capabilities = {
    fileEdit: modeRank(effectiveMode) >= modeRank("WORKSPACE_EDIT"),
    commandExecution: modeRank(effectiveMode) >= modeRank("COMMAND_EXEC"),
    allowedPaths: task.scope.include,
    deniedPaths: task.scope.exclude,
    allowedCommands: commandPolicy.allowedCommands,
    deniedCommands: commandPolicy.deniedCommands,
    destructiveCommands: commandPolicy.destructiveCommands
  };
  // Risk is evaluated at planning time from what the plan itself knows: the
  // Task scope and the verification commands. Changed files do not exist yet,
  // so a PATH or DIFF rule reports as not-evaluable rather than not-matched.
  const riskEvaluation = evaluateRisk({
    rules: config.riskRules as RiskRule[],
    subject: {
      changedPaths: [],
      scopePatterns: [...task.scope.include, ...task.scope.exclude],
      commands: (task.verification?.commands ?? []).map((entry) => entry.command),
      fields: {
        agentRole: roleResolution.roleId,
        harnessMode: effectiveMode,
        isolationMode: isolation.mode
      },
      caseSensitivePaths: true
    },
    evidenceAvailable: true
  });

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
  // Gates merge per dimension across Core, the Profile default, and the Task
  // Revision. computedRisk is UNKNOWN until the risk engine exists, and UNKNOWN
  // is not LOW, so resultReview stays required rather than being relaxed by a
  // risk nobody computed.
  const gateSources = [{ label: "CORE", gates: CORE_REQUIRED_GATES }];
  const profileGates = (config.profileRequiredGates ?? undefined) as Partial<RequiredGates> | undefined;
  if (profileGates !== undefined) {
    gateSources.push({ label: "PROFILE_DEFAULT", gates: profileGates });
  }
  if (task.requiredGates !== undefined) {
    const taskGateFindings = validateRequiredGates(task.requiredGates, {
      allowRequireExplicit: false,
      pointer: "requiredGates"
    });
    if (taskGateFindings.length > 0) {
      throw new Error(
        ["Task Revision requiredGates must be concrete:"]
          .concat(taskGateFindings.map((f) => `  - ${f.jsonPointer}: ${f.detail}`))
          .join("\n")
      );
    }
    gateSources.push({ label: "TASK_REVISION", gates: task.requiredGates as Partial<RequiredGates> });
  }

  const mergedGates = mergeRequiredGates(gateSources, "UNKNOWN");
  if (mergedGates.blockedReasons.length > 0) {
    throw new Error(
      ["Run Planning is blocked: requiredGates did not resolve."]
        .concat(mergedGates.blockedReasons.map((reason) => `  - ${reason}`))
        .join("\n")
    );
  }

  const effectivePolicySeed = {
    capabilities,
    requiredGates: mergedGates.gates,
    gateMergeScanScope: mergedGates.scanScope,
    // Starts from the Profile candidate and can only be lowered. A Task
    // guardrail, the Local Overlay, or a Run Option may set it false; none of
    // them may set it true when the Profile did not.
    autoAdvanceOnDone: mergeAutoAdvanceOnDone(config.autoAdvanceOnDone, [
      task.guardrails?.autoAdvanceOnDone,
      loweringFrom(config)
    ])
  };
  const effectivePolicy = {
    policyHash: hashJson(effectivePolicySeed),
    ...effectivePolicySeed
  };

  // The isolated tree is prepared before the Run Plan is written, so the plan
  // records where the Run actually happened rather than only which mode was
  // asked for. Everything that could still refuse the Run — gates, roles, the
  // adapter, the isolation mode itself — has already run, so no tree is created
  // for a Run that was never going to start.
  const prepared = await prepareIsolation({ projectPath, runId, mode: isolation.mode });
  const requirement = checkIsolationRequirement({
    requireIsolationForMutation: config.policies.harness.requireIsolationForMutation,
    fileEdit: capabilities.fileEdit,
    prepared
  });
  if (requirement.blocked) {
    const discarded = await prepared.discard();
    throw new Error(
      discarded.unavailableReason.length > 0
        ? `${requirement.reason}\n${discarded.unavailableReason}: ${discarded.detail}`
        : requirement.reason
    );
  }

  // From here the tree exists. runTask holds the other end of this so that a
  // throw anywhere below still discards it; the normal path discards explicitly
  // once evidence collection is done, and discard is idempotent.
  isolationHandle.prepared = prepared;

  // Every artifact names the contract it belongs to. Before this only
  // run-plan.json did, so losing or failing to verify that one file left the
  // other six unable to say which Revision they were evidence for — the link to
  // the contract ran through a single point. P1-37.
  const contractRef = { taskId: task.id, taskRevision: approval.approvedRevision };

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
      // The two halves of the target, so the approval and the execution can be
      // compared after the fact rather than taken on trust.
      revisionHash: approval.approvedRevisionHash,
      guardrailHash: approval.approvedGuardrailHash,
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
      mode: config.mode,
      // What this Run request supplied, so the Run Plan answers "was this the
      // workspace default or a choice somebody made here" without inference.
      agentAdapter: runOptions.agentAdapter ?? null
    },
    selectedAgentAdapter: {
      adapterId: adapterResolution.selectedAgentAdapter,
      selectionSource: adapterResolution.selectionSource
    },
    selectedAgentRole: {
      roleId: roleResolution.roleId,
      source: roleResolution.source,
      effectiveMode
    },
    roleEffectiveRestrictions: computeRoleEffectiveRestrictions(roleResolution.roleId, roleResolution.role),
    adapterResolution: {
      selectionSource: adapterResolution.selectionSource,
      policyAllowed: adapterResolution.policyAllowed,
      locallyAvailable: adapterResolution.locallyAvailable,
      evidence: {
        allowedAdaptersRef: `${toRelativePath(rootDir, discovery.configRef.path)}#/policies/agentAdapters/allowedAdapters`,
        localRegistry: adapterResolution.localRegistry
      },
      scanScope: {
        allowedAdaptersDeclared: adapterResolution.allowedAdapters.length,
        localRegistrySize: adapterResolution.localRegistry.length
      }
    },
    effectivePolicy,
    computedRisk: {
      level: riskEvaluation.level,
      reasons: riskEvaluation.reasons,
      matchedRuleIds: riskEvaluation.matchedRuleIds,
      scanScope: riskEvaluation.scanScope
    },
    isolation: {
      mode: isolation.mode,
      reason: isolation.reason,
      // Where the Run actually happened. Without it a reader of an isolated Run
      // cannot tell which tree the evidence below describes, and cannot find the
      // edits the Run produced.
      isolatedPath: prepared.workPath,
      treeRoot: prepared.treeRoot,
      unavailableReason: prepared.unavailableReason,
      detail: prepared.detail
    },
    verificationPlan,
    artifactPlan,
    // The design fixes this block's shape, so it is written even though resume
    // itself does not exist yet. sourceHashPolicy is not decorative: the
    // approval target is sha256(revisionHash, guardrailHash), so a Run whose
    // Task or whose guardrails have moved is already refused, and
    // test/approval-contract.test.ts ties the declaration to that refusal
    // rather than letting it stand as prose. P1-43.
    resume: {
      boundary: "PLANNED_BEFORE_ADAPTER_REQUEST",
      sourceHashPolicy: "TASK_AND_PROFILE_MUST_MATCH",
      localRevalidationRequired: true,
      allowMutation: false
    }
  };
  await writeJson(runPlanPath, runPlan);
  const runPlanRef = await fileRef(rootDir, runPlanPath);

  // The contract as resolved, not as written. The role may have come from the
  // Profile default and the mode is the meet of three sources, so rendering the
  // Task file's own fields would show the agent something other than what it is
  // actually operating under.
  await writeFile(
    promptPath,
    renderPrompt(task, {
      roleId: roleResolution.roleId,
      roleGuidance: roleResolution.role.roleGuidance,
      effectiveMode,
      verificationCommands: verificationPlanSeed.commands.map((entry) => ({
        commandId: entry.commandId,
        command: entry.command
      })),
      objectives: await acceptedObjectiveContext(rootDir, task.id, approval.approvedRevision)
    }),
    "utf8"
  );
  const promptRef = await fileRef(rootDir, promptPath);

  const adapterRequest = {
    schemaVersion: "0.2",
    documentKind: "ADAPTER_REQUEST",
    runId,
    runPlanId,
    ...contractRef,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlanRef,
    taskRevisionRef: sourceTaskRef,
    taskSnapshotRef,
    promptRef,
    selectedAgentAdapter: {
      adapterId: config.agentAdapter
    },
    capabilities,
    workingDirectoryRef: task.projectPath,
    providerSpecific: false
  };

  // The request is the only record of what the adapter was permitted to do, so
  // it is checked against the effective policy before it becomes that record.
  // The two are built from the same source today; this fails the moment they
  // stop agreeing, rather than letting a widened request pass as the contract.
  const expansions = findCapabilityExpansions(
    adapterRequest.capabilities as unknown as Record<string, unknown>,
    effectivePolicy.capabilities as unknown as Record<string, unknown>
  );
  if (expansions.length > 0) {
    throw new Error(
      "AdapterRequest exceeds the effective policy and cannot be issued:\n" +
        expansions.map((e) => `  - ${e.detail}`).join("\n")
    );
  }

  await writeJson(adapterRequestPath, adapterRequest);
  const adapterRequestRef = await fileRef(rootDir, adapterRequestPath);

  // Every observation below reads observedPath, never projectPath. The agent
  // runs in the isolated tree, so that is the only tree whose state says
  // anything about what this Run did. Watching the workspace instead reported
  // no changes and no violations for a Run that made both, which is the exact
  // shape of claim this product exists to refuse.
  const observedPath = prepared.workPath;

  // One accumulator for this Run's git evidence calls. Every one of them goes
  // through it, so the Run can state how many it made rather than implying it.
  const gitEvidenceUsage = newProcessUsage(GIT_EVIDENCE_TIMEOUT_MS, GIT_EVIDENCE_OUTPUT_CAP_BYTES);
  const runGitEvidence = gitEvidenceRunner(gitEvidenceUsage);
  const runGitEvidenceProcess = gitEvidenceProcessRunner(gitEvidenceUsage);

  // Captured before the adapter is given control. A snapshot taken any later
  // would already contain the agent's changes and the delta would read empty.
  // The scope patterns come from the derived effectivePolicy, not the Task, for
  // the same reason path enforcement does: the derived copy is the narrow one.
  const preRunSnapshot = await captureWorkspaceSnapshot({
    projectPath: observedPath,
    runId,
    ...contractRef,
    phase: "PRE_RUN",
    scopePatterns: effectivePolicy.capabilities.allowedPaths,
    capturedAt: formatDateTimeWithOffset(new Date()),
    workspaceRootRef: ".",
    selectedWorkspaceRootRealPath: discovery.selectedWorkspaceRootRealPath,
    workingDirectoryRef: task.projectPath,
    runProcess: runGitEvidenceProcess
  });
  await writeJson(preRunSnapshotPath, preRunSnapshot);
  const preRunSnapshotRef = await fileRef(rootDir, preRunSnapshotPath);

  // The resolved adapter, not the Profile default. Reading config here meant a
  // Run Option was recorded in the Run Plan and then ignored at launch — the
  // Run Trace said one adapter and another one ran. Only a second adapter could
  // surface it: with one, both values were always the same string.
  const agentName = adapterResolution.selectedAgentAdapter;
  const agentResult = await runAgentSafely(agentName, {
    task,
    runDir,
    promptPath,
    projectPath: observedPath,
    config,
    // The adapter is handed the capabilities the AdapterRequest recorded, so
    // "the agent was not allowed to run commands" stops being a sentence in a
    // file the agent never opens.
    capabilities: {
      fileEdit: capabilities.fileEdit,
      commandExecution: capabilities.commandExecution
    }
  });

  await writeFile(stdoutLogPath, agentResult.stdout, "utf8");
  await writeFile(stderrLogPath, agentResult.stderr, "utf8");
  const diffEvidence = await captureGitDiff(observedPath, runGitEvidence);
  await writeFile(diffPath, diffEvidence.content, "utf8");
  const stdoutRef = await fileRef(rootDir, stdoutLogPath);
  const stderrRef = await fileRef(rootDir, stderrLogPath);
  const diffRef = await fileRef(rootDir, diffPath);
  const changedFilesEvidence = await captureGitChangedFiles(observedPath, runGitEvidence);

  const postRunSnapshot = await captureWorkspaceSnapshot({
    projectPath: observedPath,
    runId,
    ...contractRef,
    phase: "POST_RUN",
    scopePatterns: effectivePolicy.capabilities.allowedPaths,
    capturedAt: formatDateTimeWithOffset(new Date()),
    workspaceRootRef: ".",
    selectedWorkspaceRootRealPath: discovery.selectedWorkspaceRootRealPath,
    workingDirectoryRef: task.projectPath,
    runProcess: runGitEvidenceProcess
  });
  await writeJson(postRunSnapshotPath, postRunSnapshot);
  const postRunSnapshotRef = await fileRef(rootDir, postRunSnapshotPath);
  const workspaceDelta = computeDelta(preRunSnapshot, postRunSnapshot);
  const snapshotGaps = collectSnapshotGaps(preRunSnapshot, postRunSnapshot);

  // The adapter read its own transcript; Core only records what came back. If
  // the adapter reported nothing at all, that is itself an unavailable reading
  // rather than an empty one.
  const transcript = agentResult.providerTranscript ?? {
    commands: [],
    unavailableReason: "PROVIDER_TRANSCRIPT_NOT_PROVIDED_BY_ADAPTER",
    scanScope: { linesRead: 0, jsonLinesParsed: 0, commandEventsFound: 0, unrecognizedJsonLines: 0 }
  };
  let providerCommandsRef: FileRef | null = null;
  if (transcript.commands.length > 0) {
    await writeJson(providerCommandsPath, {
      schemaVersion: "0.2",
      documentKind: "PROVIDER_REPORTED_COMMANDS",
      ...contractRef,
      runId,
      authority: "PROVIDER_REPORTED_ONLY",
      notCommandTruth: true,
      commands: transcript.commands,
      scanScope: transcript.scanScope
    });
    providerCommandsRef = await fileRef(rootDir, providerCommandsPath);
  }

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
        caseSensitive: await detectCaseSensitivity(observedPath),
        symlinkEscapes: await findEscapingSymlinks(observedPath, changedFilesEvidence.files),
        nestedRepoPaths: await findNestedRepositories(observedPath)
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

  // Verification runs before the HarnessObservation is written because its
  // command preflight is a Harness-owned check, and policyChecks is where
  // Harness-owned checks belong.
  await mkdir(verificationDir, { recursive: true });
  const verificationAttemptId = await nextVerificationAttemptId(verificationDir);
  const verificationEvidencePath = path.join(verificationDir, `${verificationAttemptId}.json`);
  const verificationAttempts = await runVerificationCommands({
    runDir,
    rootDir,
    // Verification runs where the work is. Running it against the workspace
    // while the agent worked in the isolated tree checked code nobody wrote,
    // and no isolated Run could ever satisfy the gate.
    projectPath: observedPath,
    verificationAttemptId,
    commands: verificationPlanSeed.commands,
    commandExecution: effectivePolicy.capabilities.commandExecution,
    allowedCommands: effectivePolicy.capabilities.allowedCommands as CommandMatcher[],
    deniedCommands: effectivePolicy.capabilities.deniedCommands as CommandMatcher[],
    destructiveCommands: effectivePolicy.capabilities.destructiveCommands as DestructiveMatcher[],
    cwdRef: task.projectPath
  });
  const commandViolations = verificationAttempts
    .filter((attempt) => attempt.decision === "BLOCKED")
    .map((attempt) => ({
      commandId: attempt.commandId,
      command: attempt.command,
      cwdRef: attempt.cwdRef,
      violationCode: attempt.blockedReason,
      // Harness-executed only. A command the provider merely claimed to run is
      // not judged here: judging it would mean believing it.
      authority: "HARNESS_EXECUTED"
    }));

  // Every observation is taken. The tree has nothing left to tell, so it goes
  // now rather than at the end of the process, and the outcome is recorded
  // below — a discard that failed left a tree behind and must say so.
  const discardOutcome = await prepared.discard();

  const harnessObservation = {
    schemaVersion: "0.2",
    documentKind: "HARNESS_OBSERVATION",
    runId,
    runPlanId,
    ...contractRef,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlanRef,
    adapterRequestRef,
    workspace: {
      workspaceRootRef: ".",
      selectedWorkspaceRootRealPath: discovery.selectedWorkspaceRootRealPath,
      workingDirectoryRef: task.projectPath,
      // The tree these observations describe. Under isolation it is not the
      // workspace, and a reader who assumed otherwise would draw conclusions
      // about files this Run never touched.
      workingDirectoryRealPath: observedPath,
      workspaceRealPath: projectPath,
      // What the tree was, and what became of it. An isolated Run's edits are
      // not in the workspace and are not brought back by anything here; saying
      // so is the difference between a decision recorded and a fact hidden.
      isolation: {
        mode: isolation.mode,
        isolatedPath: prepared.workPath,
        treeRoot: prepared.treeRoot,
        // Derived, not assumed: a mode that was requested and could not be
        // provided leaves the agent in the workspace, and claiming otherwise
        // would be the same false reading this Run Trace exists to prevent.
        editsInWorkspace: prepared.workPath === projectPath,
        modeUnavailableReason: prepared.unavailableReason,
        discarded: discardOutcome.discarded,
        unavailableReason: discardOutcome.unavailableReason,
        detail: discardOutcome.detail
      },
      preRunStateRef: preRunSnapshotRef,
      postRunStateRef: postRunSnapshotRef,
      preRunStateHash: preRunSnapshot.stateHash.value,
      postRunStateHash: postRunSnapshot.stateHash.value,
      // A snapshot that exists is not a snapshot that saw everything. Each
      // section that could not be read stays named here so a partial snapshot
      // cannot pass as a complete one.
      snapshotGaps,
      scanScope: {
        preRunFilesHashed: preRunSnapshot.scanScope.scopedFilesHashed,
        postRunFilesHashed: postRunSnapshot.scanScope.scopedFilesHashed,
        preRunStatusEntries: preRunSnapshot.scanScope.statusEntries,
        postRunStatusEntries: postRunSnapshot.scanScope.statusEntries,
        scopePatterns: postRunSnapshot.scanScope.scopePatterns,
        snapshotGapsFound: snapshotGaps.length
      }
    },
    stdio: {
      stdoutRef,
      stderrRef
    },
    changes: {
      diffRef,
      changedFiles: changedFilesEvidence.files,
      // A created file used to appear here by name while its content existed in
      // no artifact at all. It travels in the patch now; whatever could not
      // travel is named with the reason rather than left out quietly.
      newFileCapture: {
        notCaptured: diffEvidence.newFileCapture.notCaptured,
        scanScope: diffEvidence.newFileCapture.scanScope,
        unavailableReason: diffEvidence.newFileCapture.unavailableReason
      },
      // Independent of git: the delta is postRunState minus preRunState over the
      // scoped snapshot, so a file git never tracks still shows up as changed.
      workspaceDelta: {
        added: workspaceDelta.added,
        modified: workspaceDelta.modified,
        removed: workspaceDelta.removed,
        scanScope: {
          added: workspaceDelta.added.length,
          modified: workspaceDelta.modified.length,
          removed: workspaceDelta.removed.length,
          preRunFilesCompared: preRunSnapshot.scopedFiles.value.length,
          postRunFilesCompared: postRunSnapshot.scopedFiles.value.length
        },
        unavailableReason: workspaceDelta.unavailableReason
      },
      unavailableReason: diffEvidence.unavailableReason ?? changedFilesEvidence.unavailableReason ?? ""
    },
    commands: {
      // PROVIDER_REPORTED_ONLY is a lower grade than NONE is an absence: it says
      // commands exist on the record but nothing observed them. It can never
      // satisfy command policy, verification, or VERIFIED.
      authority: transcript.commands.length > 0 ? "PROVIDER_REPORTED_ONLY" : "NONE",
      commandLogRef: {
        unavailableReason: "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"
      },
      providerReportedCommandsRef:
        providerCommandsRef ?? { unavailableReason: transcript.unavailableReason },
      commandsObserved: transcript.commands,
      commandsExecutedByHarness: [],
      transcriptScanScope: transcript.scanScope,
      // The Harness still cannot see the agent's command channel. A provider
      // claim does not change that, so this reason stays.
      unavailableReason: "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"
    },
    policyChecks: {
      pathViolations: pathPolicy.violations,
      commandViolations,
      capabilityViolations: [],
      commandPolicyEvaluation: {
        evaluated: true,
        // Only commands the Harness ran are subject to this evaluation, so the
        // scope says so rather than implying it covered every command the Run
        // caused to execute.
        scope: "HARNESS_EXECUTED_COMMANDS_ONLY",
        scanScope: {
          commandsChecked: verificationAttempts.filter((a) => a.decision !== "UNAVAILABLE").length,
          violationsFound: commandViolations.length,
          allowedMatchers: effectivePolicy.capabilities.allowedCommands.length,
          deniedMatchers: effectivePolicy.capabilities.deniedCommands.length,
          destructiveMatchers: effectivePolicy.capabilities.destructiveCommands.length
        },
        unavailableReason: ""
      },
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
    // What each kind of child was allowed, what it used, and what was dropped.
    // The counts existed before this and were discarded at the boundary that
    // produced them, which made a capped transcript indistinguishable from a
    // complete one.
    resourceLimits: buildResourceLimits({
      agentResult,
      attempts: verificationAttempts,
      gitEvidenceUsage,
      newFileCapture: diffEvidence.newFileCapture
    }),
    observationSource: {
      kind: "HARNESS",
      method: "GIT_DIFF"
    },
    artifactRefs: [
      stdoutRef,
      stderrRef,
      diffRef,
      preRunSnapshotRef,
      postRunSnapshotRef,
      ...(providerCommandsRef === null ? [] : [providerCommandsRef])
    ]
  };
  await writeJson(harnessObservationPath, harnessObservation);
  const harnessObservationRef = await fileRef(rootDir, harnessObservationPath);

  const adapterResult = {
    schemaVersion: "0.2",
    documentKind: "ADAPTER_RESULT",
    runId,
    runPlanId,
    ...contractRef,
    createdAt: formatDateTimeWithOffset(new Date()),
    runPlanRef,
    adapterRequestRef,
    adapterId: agentName,
    adapterExecutionStatus: toAdapterExecutionStatus(agentResult),
    synthetic: agentResult.status === "DRY_RUN" || agentResult.exitCode === null,
    exitCode: agentResult.exitCode,
    status: agentResult.status,
    // runCommand counted what it dropped and the count stopped at its return
    // value. A capped transcript looked exactly like one that ended.
    scanScope: agentResult.scanScope ?? {
      unavailableReason: "ADAPTER_PROCESS_NOT_STARTED"
    },
    providerReportedObservations: {
      degraded: true,
      reason: "PROVIDER_REPORTED_OBSERVATIONS_ARE_NOT_CORE_TRUTH",
      commandsReported: transcript.scanScope.commandEventsFound,
      transcriptScanScope: transcript.scanScope,
      unavailableReason: transcript.unavailableReason
    },
    adapterError: adapterError(agentResult)
  };
  await writeJson(adapterResultPath, adapterResult);
  const adapterResultRef = await fileRef(rootDir, adapterResultPath);

  const verificationEvidence = buildVerificationEvidence({
    verificationAttemptId,
    runId,
    runPlanId,
    ...contractRef,
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
    ...contractRef,
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
      verificationEvidence: verificationEvidence as unknown as Record<string, unknown> | null,
      localReview: null
    }),
    "utf8"
  );

  const result: RunResultFile = {
    runId,
    ...contractRef,
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
  taskRevision: number | null;
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
    taskRevision: input.taskRevision,
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
  // A tree that could not be discarded is still on disk holding this Run's
  // edits. That is a fact about the Run, so it travels to review rather than
  // staying in one field of one artifact.
  addUnavailableReason(reasons, workspace?.isolation);
  for (const gap of Array.isArray(workspace?.snapshotGaps) ? workspace.snapshotGaps : []) {
    if (typeof gap === "string" && gap.length > 0) {
      reasons.add(gap);
    }
  }
  addUnavailableReason(reasons, input.harnessObservation.changes);
  const changes = input.harnessObservation.changes as Record<string, unknown> | undefined;
  addUnavailableReason(reasons, changes?.workspaceDelta);
  // A patch missing a created file's content is a partial record of the work,
  // and after an isolated tree is discarded it is the only record. Review sees
  // it rather than reading the patch as complete.
  addUnavailableReason(reasons, changes?.newFileCapture);
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
  // A capped or killed verification command is a fact about this Run, and the
  // attempt is the only place that fact exists.
  for (const attempt of input.verificationEvidence?.attempts ?? []) {
    addUnavailableReason(reasons, attempt);
  }
  if (input.verificationEvidence === null) {
    reasons.add("VERIFICATION_EVIDENCE_NOT_AVAILABLE");
  }
  if (input.agentResult.status === "DRY_RUN") {
    reasons.add("DRY_RUN_NOT_EXECUTED");
  }
  return Array.from(reasons).sort();
}

// There is no command proxy, sandbox log, or container exec log. This constant
// is the single place that claim is made, so implementing such a channel is one
// edit and not a search.
const HARNESS_VISIBLE_COMMAND_CHANNEL = false;

export function blockedCommandChannelReason(input: {
  commandExecution: boolean;
  requireHarnessVisibleCommandChannel: boolean;
  harnessVisibleCommandChannel: boolean;
  allowDegradedCommandObservation: boolean;
}): string | null {
  if (!input.commandExecution) {
    return null;
  }
  if (input.harnessVisibleCommandChannel) {
    return null;
  }
  if (!input.requireHarnessVisibleCommandChannel || input.allowDegradedCommandObservation) {
    return null;
  }
  return [
    "Run Planning is blocked: this Run may execute commands, and no Harness-visible",
    "command channel exists to observe them.",
    "",
    "Command evidence would be a provider claim only, which cannot satisfy command",
    "policy, verification, or VERIFIED.",
    "",
    "To run anyway, record the decision in .codefleet/config.json:",
    '  "policies": { "harness": { "allowDegradedCommandObservation": true } }',
    "",
    "Every Run under that setting keeps COMMAND_CHANNEL_NOT_HARNESS_VISIBLE and",
    "requires a human review."
  ].join("\n");
}

/**
 * Why this Task may not run, and what to do about it. The guardrail case is
 * separated because the operator did not touch the Task and would otherwise be
 * told to re-approve an edit they never made.
 */
function approvalRefusal(taskId: string, blockedReason: string): string {
  const head = `Task is not approved for execution: ${taskId} (${blockedReason}).`;
  if (blockedReason === "PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL") {
    return [
      head,
      "",
      "The Task is unchanged. What moved is the Project Profile: the guardrails this",
      "contract was approved under are not the ones now in force, and an approval",
      "covers the guardrails it was given under.",
      "",
      "Restore the guardrails, or approve the contract again under the new ones:",
      `  codefleet task invalidate ${taskId} --reason <text>`,
      `  codefleet task approve ${taskId} --reason <text>`
    ].join("\n");
  }
  if (blockedReason === "TASK_CONTENT_CHANGED_AFTER_APPROVAL") {
    return [
      head,
      "",
      "The Task file changed after it was approved, so the approval no longer names",
      "what is on disk.",
      "",
      `  codefleet task invalidate ${taskId} --reason <text>`,
      `  codefleet task approve ${taskId} --reason <text>`
    ].join("\n");
  }
  return `${head}\nRun 'codefleet task approve ${taskId} --reason <text>' first.`;
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
  timeoutMs?: number;
  outputCapBytes?: number;
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

    const result = await runProcess(normalized.argv[0], normalized.argv.slice(1), input.projectPath, {
      limits: {
        timeoutMs: input.timeoutMs ?? VERIFICATION_COMMAND_TIMEOUT_MS,
        outputCapBytes: input.outputCapBytes ?? VERIFICATION_COMMAND_OUTPUT_CAP_BYTES
      }
    });
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
      // The gate reads the exit code, so a capped log does not change the
      // verdict. It still has to be visible: a reviewer reading a truncated log
      // must not take it for the whole run.
      scanScope: {
        outputBytes: Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
        stdoutTruncatedBytes: result.stdoutTruncatedBytes,
        stderrTruncatedBytes: result.stderrTruncatedBytes,
        truncatedBytes: result.truncatedBytes,
        timeoutMs: result.timeoutMs,
        outputCapBytes: result.outputCapBytes
      },
      unavailableReason: result.timedOut
        ? `VERIFICATION_COMMAND_TIMED_OUT:${planned.commandId}`
        : result.truncatedBytes > 0
          ? "VERIFICATION_OUTPUT_TRUNCATED"
          : ""
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
  taskId: string;
  taskRevision: number | null;
  createdAt: string;
  runPlan: Record<string, unknown>;
  runPlanRef: FileRef;
  sourceTaskRef: FileRef;
  harnessObservationRef: FileRef;
  attempts: VerificationAttempt[];
}): VerificationEvidence {
  const verificationPlan = input.runPlan.verificationPlan ?? {};
  // A blocked attempt is a recorded attempt but not an executed one. Counting
  // it as executed left authority NONE with no reason attached, which the
  // evidence guard rejects — and rightly: a Run where policy blocked every
  // verification command must say so, not go quiet.
  const executed = input.attempts.filter((attempt) => attempt.authority === "HARNESS_EXECUTED");
  const blocked = input.attempts.filter((attempt) => attempt.decision === "BLOCKED");
  const unavailableReason =
    executed.length > 0
      ? ""
      : blocked.length > 0
        ? `VERIFICATION_BLOCKED_BY_COMMAND_POLICY:${blocked.length}`
        : verificationUnavailableReason(input.runPlan);
  const outcome = deriveVerificationOutcome(input.attempts, input.runPlan);
  return {
    schemaVersion: "0.2",
    documentKind: "VERIFICATION_EVIDENCE",
    verificationAttemptId: input.verificationAttemptId,
    runId: input.runId,
    runPlanId: input.runPlanId,
    taskId: input.taskId,
    taskRevision: input.taskRevision,
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

export interface AdapterResolution {
  selectedAgentAdapter: string;
  selectionSource: "PROFILE_DEFAULT" | "RUN_OPTION" | "REQUIRE_EXPLICIT_UNRESOLVED";
  policyAllowed: boolean;
  locallyAvailable: boolean;
  allowedAdapters: string[];
  localRegistry: string[];
  blockedReason: string;
}

// Selection reads the Profile and writes nothing back to it. Run Planning may
// not edit the Project Profile, the Local Overlay, or the Task Revision while
// choosing, so this takes the resolved config and returns a record.
export function resolveAgentAdapter(config: CodeFleetConfig, runOptions: RunOptions = {}): AdapterResolution {
  // A Run Option is an input to this Run, so it is read here and written
  // nowhere. It replaces the Profile default rather than being merged with it:
  // there is nothing to merge, and the Run Plan records which one was used.
  const override = runOptions.agentAdapter;
  const selected = override ?? config.agentAdapter;
  const allowedAdapters = config.allowedAdapters;
  const localRegistry = [...LOCAL_ADAPTER_REGISTRY];
  const selectionSource = override === undefined ? "PROFILE_DEFAULT" : "RUN_OPTION";

  if (selected === "REQUIRE_EXPLICIT") {
    return {
      selectedAgentAdapter: selected,
      selectionSource: "REQUIRE_EXPLICIT_UNRESOLVED",
      policyAllowed: false,
      locallyAvailable: false,
      allowedAdapters,
      localRegistry,
      blockedReason:
        "Run Planning is blocked: defaults.run.agentAdapter is REQUIRE_EXPLICIT and no Run Option chose an adapter.\n" +
        `Set defaults.run.agentAdapter to one of: ${allowedAdapters.join(", ") || "(none allowed)"}`
    };
  }

  const policyAllowed = allowedAdapters.includes(selected);
  const locallyAvailable = isAdapterLocallyAvailable(selected);

  let blockedReason = "";
  if (!policyAllowed) {
    // An override is checked against the same allowlist as a default. A Run
    // Option that could reach outside it would be a way to widen policy per
    // run, which is the one thing it must not be.
    blockedReason =
      `Run Planning is blocked: adapter ${selected} ${override === undefined ? "" : "(chosen with --adapter) "}` +
      `is not in policies.agentAdapters.allowedAdapters ` +
      `(${allowedAdapters.join(", ") || "empty"}).`;
  } else if (!locallyAvailable) {
    // Policy-allowed and locally-missing are different failures. Reporting them
    // as one would send someone to edit the Profile over a missing build.
    blockedReason =
      `Run Planning is blocked: adapter ${selected} is allowed by policy but is not in this build's ` +
      `adapter registry (${localRegistry.join(", ")}).`;
  }

  return {
    selectedAgentAdapter: selected,
    selectionSource,
    policyAllowed,
    locallyAvailable,
    allowedAdapters,
    localRegistry,
    blockedReason
  };
}

export interface IsolationResolution {
  mode: string;
  reason: string;
  blockedReason: string;
}

// The Run Plan records a concrete mode and a reason. REQUIRE_EXPLICIT resolves
// here or the Run does not start, so no artifact ever carries the deferral.
export function resolveIsolation(config: CodeFleetConfig): IsolationResolution {
  if (config.isolationMode === "REQUIRE_EXPLICIT") {
    return {
      mode: "",
      reason: "",
      blockedReason:
        "Run Planning is blocked: defaults.run.isolationMode is REQUIRE_EXPLICIT and nothing resolved it.\n" +
        "Set it to one of NONE, GIT_WORKTREE, TEMP_WORKSPACE, CONTAINER."
    };
  }
  return {
    mode: config.isolationMode,
    reason: config.isolationMode === "NONE" ? "V0.2_MINIMAL_LOCAL_TRANSPORT" : "PROFILE_DEFAULT",
    blockedReason: ""
  };
}

/**
 * OR would let a lower-precedence source hand back a permission the Profile
 * withheld, so this is AND over every source that expressed an opinion.
 */
export function mergeAutoAdvanceOnDone(candidate: boolean, restrictOnlySources: unknown[]): boolean {
  if (!candidate) {
    return false;
  }
  return !restrictOnlySources.some((value) => value === false);
}

function loweringFrom(config: CodeFleetConfig): unknown {
  // Placeholder for Local Overlay and Run Option lowering. Both are restrict
  // only, so an absent one expresses no opinion rather than permission.
  return undefined;
}

export interface CapabilityExpansion {
  field: string;
  detail: string;
}

// An adapter may narrow what it was given and never widen it. Checked on the
// AdapterRequest before the adapter is handed control, because afterwards the
// only record of what it was allowed to do is the request itself.
export function findCapabilityExpansions(
  requested: Record<string, unknown>,
  effective: Record<string, unknown>
): CapabilityExpansion[] {
  const found: CapabilityExpansion[] = [];

  for (const field of ["fileEdit", "commandExecution"] as const) {
    if (requested[field] === true && effective[field] !== true) {
      found.push({ field, detail: `AdapterRequest ${field} is true while effectivePolicy ${field} is not` });
    }
  }

  // Allowed lists may only shrink; denied lists may only grow.
  for (const field of ["allowedPaths", "allowedCommands"] as const) {
    const extra = asStringSet(requested[field]).filter((v) => !asStringSet(effective[field]).includes(v));
    if (extra.length > 0) {
      found.push({ field, detail: `AdapterRequest ${field} adds ${extra.join(", ")}` });
    }
  }
  for (const field of ["deniedPaths", "deniedCommands"] as const) {
    const dropped = asStringSet(effective[field]).filter((v) => !asStringSet(requested[field]).includes(v));
    if (dropped.length > 0) {
      found.push({ field, detail: `AdapterRequest ${field} drops ${dropped.join(", ")}` });
    }
  }

  return found;
}

function asStringSet(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)));
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

// Deriving the id from a directory listing and creating the directory afterwards
// are two steps, and concurrent Runs used to interleave between them: both read
// the same listing, both picked the same id, and mkdir with recursive: true
// accepted the second one silently, so one Run Trace ended up holding two Runs'
// artifacts. Creating the directory is now the reservation itself — exclusive,
// non-recursive, and retried on collision — so a taken id is taken.
async function reserveRunDir(rootDir: string, date: Date): Promise<{ runId: string; runDir: string }> {
  const datePart = formatDate(date);
  const runsDir = path.join(rootDir, ".codefleet", "runs");
  await mkdir(runsDir, { recursive: true });

  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    entries = [];
  }

  let candidate = entries
    .map((entry) => entry.match(new RegExp(`^${datePart}_(\\d{3})$`)))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => Number(match[1]))
    .reduce((max, value) => Math.max(max, value), 0);

  // 999 Runs in one day is the id format's ceiling, not a policy. Exhausting it
  // must say so rather than overwrite the last Run of the day.
  while (candidate < 999) {
    candidate += 1;
    const runId = `${datePart}_${String(candidate).padStart(3, "0")}`;
    const runDir = path.join(runsDir, runId);
    try {
      await mkdir(runDir);
      return { runId, runDir };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  throw new Error(`No runId is available for ${datePart}: 999 Runs already exist for that date.`);
}

/**
 * Bytes of a created file that will travel in the patch. A patch is evidence a
 * person reads and a machine may later apply, and neither survives one Run
 * embedding a checked-in artifact. Files past this are named instead, never
 * dropped in silence.
 */
export const NEW_FILE_CONTENT_LIMIT_BYTES = 1024 * 1024;

/** Ceiling across all created files in one Run, for the same reason. */
export const NEW_FILE_CONTENT_TOTAL_LIMIT_BYTES = 8 * 1024 * 1024;

export interface NewFileCapture {
  content: string;
  notCaptured: { path: string; reason: string }[];
  unavailableReason: string;
  scanScope: {
    newFilesFound: number;
    contentCaptured: number;
    contentNotCaptured: number;
    bytesCaptured: number;
    perFileLimitBytes: number;
    totalLimitBytes: number;
  };
}

/**
 * `git diff` reports tracked changes only, so a file the agent created appeared
 * in changed files by name while its content existed nowhere. Once a Run
 * discards its isolated tree the patch is the only surviving copy of the work,
 * and a creation was the one kind of change that copy did not hold.
 *
 * `--no-index` is used rather than intent-to-add: `git add -N` would write to
 * the index, and when a Run is not isolated that index belongs to the operator.
 * Observation must not mutate what it observes.
 */
export async function captureNewFileContent(
  projectPath: string,
  newFiles: string[],
  options: { budgetMs?: number; runGitEvidence?: GitEvidenceRunner } = {}
): Promise<NewFileCapture> {
  const budgetMs = options.budgetMs ?? NEW_FILE_CAPTURE_BUDGET_MS;
  const runGitEvidence =
    options.runGitEvidence ??
    gitEvidenceRunner(newProcessUsage(GIT_EVIDENCE_TIMEOUT_MS, GIT_EVIDENCE_OUTPUT_CAP_BYTES));
  const parts: string[] = [];
  const notCaptured: { path: string; reason: string }[] = [];
  const deadline = Date.now() + budgetMs;
  let bytesCaptured = 0;
  let captured = 0;
  let truncatedReason = "";

  for (const file of newFiles) {
    // One call per file means a per-call limit leaves the total unbounded in the
    // number of files. Past the budget the remaining files are named without
    // being read, which is an exclusion this Run knows the extent of.
    if (Date.now() >= deadline) {
      notCaptured.push({
        path: file,
        reason: `the ${budgetMs} ms budget for reading created files was exhausted`
      });
      continue;
    }
    let size: number;
    try {
      size = (await stat(path.join(projectPath, file))).size;
    } catch {
      notCaptured.push({ path: file, reason: "the file could not be read when the patch was built" });
      continue;
    }
    if (size > NEW_FILE_CONTENT_LIMIT_BYTES) {
      notCaptured.push({
        path: file,
        reason: `${size} bytes exceeds the ${NEW_FILE_CONTENT_LIMIT_BYTES} byte per-file limit`
      });
      continue;
    }
    if (bytesCaptured + size > NEW_FILE_CONTENT_TOTAL_LIMIT_BYTES) {
      notCaptured.push({
        path: file,
        reason: `the ${NEW_FILE_CONTENT_TOTAL_LIMIT_BYTES} byte total limit for created files was already reached`
      });
      continue;
    }

    // --no-index exits 1 when the two inputs differ, which is the normal result
    // here and not a failure.
    const result = await runGitEvidence(
      ["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--no-index", "--", "/dev/null", file],
      projectPath
    );
    if (result.code !== 0 && result.code !== 1) {
      notCaptured.push({
        path: file,
        reason: result.timedOut
          ? `reading it exceeded the ${result.timeoutMs} ms limit`
          : firstLine(result.stderr) || "git diff --no-index failed"
      });
      continue;
    }
    // Cut output is the one case where what is missing cannot be described, so
    // it outranks every exclusion this function decided on its own.
    if (result.truncatedBytes > 0) {
      truncatedReason = evidenceTruncationReason(result, "GIT_DIFF_NEW_FILE");
      notCaptured.push({ path: file, reason: `its patch was cut at the ${result.outputCapBytes} byte output limit` });
      parts.push(result.stdout);
      continue;
    }
    parts.push(result.stdout);
    // git names a binary file and refuses to inline it. The name travels, the
    // bytes do not, and that difference is the whole subject of this record.
    if (/^Binary files /m.test(result.stdout)) {
      notCaptured.push({ path: file, reason: "binary content is named by git but not carried in a patch" });
      continue;
    }
    bytesCaptured += size;
    captured += 1;
  }

  // Someone reading only the .patch has to be able to learn that it is partial.
  if (notCaptured.length > 0) {
    parts.push(
      [
        `# CodeFleet: ${notCaptured.length} created file(s) are named in this Run's changed files,`,
        "# but their content is not in this patch:",
        ...notCaptured.map((entry) => `#   ${entry.path} — ${entry.reason}`),
        ""
      ].join("\n")
    );
  }

  return {
    content: parts.join(""),
    notCaptured,
    // Truncation wins over exclusion: a human can open a file that was skipped
    // for its size, but nobody can describe bytes that were dropped.
    unavailableReason:
      truncatedReason.length > 0
        ? truncatedReason
        : notCaptured.length > 0
          ? "NEW_FILE_CONTENT_NOT_CAPTURED"
          : "",
    scanScope: {
      newFilesFound: newFiles.length,
      contentCaptured: captured,
      contentNotCaptured: notCaptured.length,
      bytesCaptured,
      perFileLimitBytes: NEW_FILE_CONTENT_LIMIT_BYTES,
      totalLimitBytes: NEW_FILE_CONTENT_TOTAL_LIMIT_BYTES
    }
  };
}

async function captureGitDiff(
  projectPath: string,
  runGitEvidence: GitEvidenceRunner
): Promise<{ content: string; unavailableReason?: string; newFileCapture: NewFileCapture }> {
  const empty: NewFileCapture = {
    content: "",
    notCaptured: [],
    unavailableReason: "",
    scanScope: {
      newFilesFound: 0,
      contentCaptured: 0,
      contentNotCaptured: 0,
      bytesCaptured: 0,
      perFileLimitBytes: NEW_FILE_CONTENT_LIMIT_BYTES,
      totalLimitBytes: NEW_FILE_CONTENT_TOTAL_LIMIT_BYTES
    }
  };

  const result = await runGitEvidence(
    ["-c", `safe.directory=${projectPath}`, "diff", "--no-ext-diff", "--", "."],
    projectPath
  );
  if (result.code !== 0) {
    return {
      content: [
        "git diff failed.",
        "",
        result.stderr.trim() || "No stderr output was produced.",
        ""
      ].join("\n"),
      unavailableReason: result.timedOut ? "GIT_DIFF_TIMED_OUT" : "GIT_DIFF_FAILED",
      newFileCapture: empty
    };
  }

  // A patch cut off mid-hunk describes a change nobody can reconstruct, and it
  // looks exactly like a complete one. It is a defect, not a gap.
  const diffTruncated = evidenceTruncationReason(result, "GIT_DIFF");
  if (diffTruncated.length > 0) {
    return { content: result.stdout, unavailableReason: diffTruncated, newFileCapture: empty };
  }

  const untracked = await captureUntrackedFiles(projectPath, runGitEvidence);
  if (untracked === null) {
    // Tracked changes are still evidence; what is unknown is whether anything
    // was created. Reporting that as "nothing was created" is the failure this
    // whole finding is about.
    return {
      content: result.stdout,
      newFileCapture: {
        ...empty,
        notCaptured: [{ path: "(unknown)", reason: "created files could not be listed" }],
        unavailableReason: "NEW_FILE_CONTENT_NOT_CAPTURED"
      }
    };
  }

  const newFileCapture = await captureNewFileContent(projectPath, untracked, { runGitEvidence });
  return { content: `${result.stdout}${newFileCapture.content}`, newFileCapture };
}

/** Untracked paths only. Modifications and deletions are already in the diff. */
async function captureUntrackedFiles(
  projectPath: string,
  runGitEvidence: GitEvidenceRunner
): Promise<string[] | null> {
  const result = await runGitEvidence(
    ["-c", `safe.directory=${projectPath}`, "status", "--porcelain=v1", "--untracked-files=all", "--", "."],
    projectPath
  );
  // A truncated listing is a listing of unknown length, so it cannot be read as
  // the set of created files.
  if (result.code !== 0 || result.truncatedBytes > 0) {
    return null;
  }

  const files: string[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.startsWith("?? ")) {
      continue;
    }
    const value = unquoteGitPath(line.slice(3).trim());
    // CodeFleet's own Run Trace is written during the Run. Embedding it in the
    // Run's own patch would grow without bound.
    if (value.length === 0 || isCodefleetMetadataPath(value)) {
      continue;
    }
    files.push(value);
  }
  return files.sort();
}

// `git diff --name-only` reports tracked modifications only, so an agent that
// creates a new file would leave no trace in changed-files evidence. Untracked
// files are policy subjects, so changed-files truth must include them.
async function captureGitChangedFiles(
  projectPath: string,
  runGitEvidence: GitEvidenceRunner
): Promise<{ files: string[]; unavailableReason?: string }> {
  const result = await runGitEvidence(
    ["-c", `safe.directory=${projectPath}`, "status", "--porcelain=v1", "--untracked-files=all", "--", "."],
    projectPath
  );
  const truncated = evidenceTruncationReason(result, "GIT_STATUS");
  if (result.code !== 0 || truncated.length > 0) {
    return {
      files: [],
      unavailableReason:
        truncated.length > 0
          ? truncated
          : result.timedOut
            ? "GIT_CHANGED_FILES_TIMED_OUT"
            : "GIT_CHANGED_FILES_FAILED"
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

export interface HarnessProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Bytes the output cap dropped. Above zero means the output is partial. */
  truncatedBytes: number;
  stdoutTruncatedBytes: number;
  stderrTruncatedBytes: number;
  /** True only when a timeout was observed, never as a default for "unknown". */
  timedOut: boolean;
  timeoutMs: number;
  outputCapBytes: number;
}

/**
 * Every child the Harness starts itself. It used to spawn directly with no time
 * limit, no output limit and the parent's whole environment, which meant the
 * boundary put around the agent stopped exactly where the evidence began.
 * Delegating to runCommand gives all of them one implementation of the limits,
 * so a new kind of child cannot quietly get none.
 */
export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  options: { limits?: { timeoutMs: number; outputCapBytes: number }; env?: Record<string, string> } = {}
): Promise<HarnessProcessResult> {
  const timeoutMs = options.limits?.timeoutMs ?? VERIFICATION_COMMAND_TIMEOUT_MS;
  const outputCapBytes = options.limits?.outputCapBytes ?? VERIFICATION_COMMAND_OUTPUT_CAP_BYTES;

  return runCommand(command, args, "", cwd, {
    limits: { timeoutMs, outputCapBytes },
    env: options.env ?? { PATH: process.env.PATH ?? "" }
  }).then((result) => {
    const scanScope = result.scanScope ?? {
      stdoutTruncatedBytes: 0,
      stderrTruncatedBytes: 0,
      timeoutMs,
      outputCapBytes
    };
    return {
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      truncatedBytes: scanScope.stdoutTruncatedBytes + scanScope.stderrTruncatedBytes,
      stdoutTruncatedBytes: scanScope.stdoutTruncatedBytes,
      stderrTruncatedBytes: scanScope.stderrTruncatedBytes,
      // runCommand reports a timeout by killing the child and resolving with a
      // null exit code and that sentence in stderr. Reading it back here keeps
      // one implementation of the limit and one of its detection.
      timedOut: result.exitCode === null && / limit and was terminated\./.test(result.stderr),
      timeoutMs: scanScope.timeoutMs,
      outputCapBytes: scanScope.outputCapBytes
    };
  });
}

/**
 * What one kind of child process was allowed and what it actually used.
 *
 * measured stays false until a call happens, because a subject that never ran
 * and a subject that ran without hitting its ceiling are different facts and
 * reporting both as "0 bytes dropped" claims a measurement nobody took.
 */
interface ResourceLimitsReport {
  adapter: {
    measured: boolean;
    timeoutMs: number | null;
    outputCapBytes: number | null;
    stdoutBytes: number;
    stderrBytes: number;
    stdoutTruncatedBytes: number;
    stderrTruncatedBytes: number;
    unavailableReason: string;
  };
  verification: {
    measured: boolean;
    timeoutMs: number | null;
    outputCapBytes: number | null;
    calls: number;
    outputBytes: number;
    truncatedBytes: number;
    truncatedCalls: number;
    timedOutCalls: number;
    unavailableReason: string;
  };
  gitEvidence: ProcessUsage & { unavailableReason: string };
  newFileCapture: {
    measured: boolean;
    perFileLimitBytes: number;
    totalLimitBytes: number;
    budgetMs: number;
    filesFound: number;
    bytesCaptured: number;
    contentNotCaptured: number;
    unavailableReason: string;
  };
}

/**
 * Every subject reports the same three things: the ceiling it ran under, what
 * it used, and what was dropped. measured false means no process of that kind
 * ran, which is why the ceilings are null there — stating one would describe a
 * limit nothing was ever checked against.
 */
function buildResourceLimits(input: {
  agentResult: AgentRunResult;
  attempts: VerificationAttempt[];
  gitEvidenceUsage: ProcessUsage;
  newFileCapture: NewFileCapture;
}): ResourceLimitsReport {
  const adapterScope = input.agentResult.scanScope;
  const executed = input.attempts.filter((attempt) => attempt.scanScope !== undefined);
  const verification = executed.reduce(
    (acc, attempt) => {
      const scope = attempt.scanScope as NonNullable<VerificationAttempt["scanScope"]>;
      return {
        outputBytes: acc.outputBytes + scope.outputBytes,
        truncatedBytes: acc.truncatedBytes + scope.truncatedBytes,
        truncatedCalls: acc.truncatedCalls + (scope.truncatedBytes > 0 ? 1 : 0),
        timedOutCalls:
          acc.timedOutCalls + (attempt.unavailableReason.startsWith("VERIFICATION_COMMAND_TIMED_OUT") ? 1 : 0)
      };
    },
    { outputBytes: 0, truncatedBytes: 0, truncatedCalls: 0, timedOutCalls: 0 }
  );
  const first = executed[0]?.scanScope;

  return {
    adapter: {
      measured: adapterScope !== undefined,
      timeoutMs: adapterScope?.timeoutMs ?? null,
      outputCapBytes: adapterScope?.outputCapBytes ?? null,
      stdoutBytes: Buffer.byteLength(input.agentResult.stdout),
      stderrBytes: Buffer.byteLength(input.agentResult.stderr),
      stdoutTruncatedBytes: adapterScope?.stdoutTruncatedBytes ?? 0,
      stderrTruncatedBytes: adapterScope?.stderrTruncatedBytes ?? 0,
      unavailableReason: adapterScope === undefined ? "ADAPTER_PROCESS_NOT_STARTED" : ""
    },
    verification: {
      measured: executed.length > 0,
      timeoutMs: first?.timeoutMs ?? null,
      outputCapBytes: first?.outputCapBytes ?? null,
      calls: executed.length,
      ...verification,
      unavailableReason: executed.length === 0 ? "NO_VERIFICATION_COMMAND_EXECUTED" : ""
    },
    gitEvidence: {
      ...input.gitEvidenceUsage,
      unavailableReason: input.gitEvidenceUsage.measured ? "" : "NO_GIT_EVIDENCE_CALL_MADE"
    },
    newFileCapture: {
      measured: input.newFileCapture.scanScope.newFilesFound > 0,
      perFileLimitBytes: input.newFileCapture.scanScope.perFileLimitBytes,
      totalLimitBytes: input.newFileCapture.scanScope.totalLimitBytes,
      budgetMs: NEW_FILE_CAPTURE_BUDGET_MS,
      filesFound: input.newFileCapture.scanScope.newFilesFound,
      bytesCaptured: input.newFileCapture.scanScope.bytesCaptured,
      contentNotCaptured: input.newFileCapture.scanScope.contentNotCaptured,
      unavailableReason: input.newFileCapture.unavailableReason
    }
  };
}

export interface ProcessUsage {
  measured: boolean;
  timeoutMs: number;
  outputCapBytes: number;
  calls: number;
  outputBytes: number;
  truncatedBytes: number;
  truncatedCalls: number;
  timedOutCalls: number;
}

export function newProcessUsage(timeoutMs: number, outputCapBytes: number): ProcessUsage {
  return {
    measured: false,
    timeoutMs,
    outputCapBytes,
    calls: 0,
    outputBytes: 0,
    truncatedBytes: 0,
    truncatedCalls: 0,
    timedOutCalls: 0
  };
}

function recordUsage(usage: ProcessUsage, result: HarnessProcessResult): HarnessProcessResult {
  usage.measured = true;
  usage.calls += 1;
  usage.outputBytes += Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
  usage.truncatedBytes += result.truncatedBytes;
  if (result.truncatedBytes > 0) {
    usage.truncatedCalls += 1;
  }
  if (result.timedOut) {
    usage.timedOutCalls += 1;
  }
  return result;
}

export type GitEvidenceRunner = (args: string[], cwd: string) => Promise<HarnessProcessResult>;

/**
 * Reading git state, with the limits and environment that kind of call gets.
 * The accumulator is passed in rather than held in module state: two Runs in
 * one process would otherwise report each other's numbers.
 */
export function gitEvidenceRunner(usage: ProcessUsage): GitEvidenceRunner {
  return (args, cwd) => gitEvidenceProcessRunner(usage)("git", args, cwd);
}

/** The same boundary in the shape the workspace snapshot asks for. */
export function gitEvidenceProcessRunner(
  usage: ProcessUsage
): (command: string, args: string[], cwd: string) => Promise<HarnessProcessResult> {
  return (command, args, cwd) =>
    runProcess(command, args, cwd, {
      limits: { timeoutMs: GIT_EVIDENCE_TIMEOUT_MS, outputCapBytes: GIT_EVIDENCE_OUTPUT_CAP_BYTES },
      env: gitProcessEnv()
    }).then((result) => recordUsage(usage, result));
}

/**
 * Truncated evidence is not shortened evidence. The bytes that were dropped are
 * exactly the ones nobody can describe, so a patch or a status listing that was
 * cut cannot be read as a complete account of the change and cannot be waived.
 */
function evidenceTruncationReason(result: HarnessProcessResult, what: string): string {
  return result.truncatedBytes > 0 ? `EVIDENCE_TRUNCATED:${what}` : "";
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
