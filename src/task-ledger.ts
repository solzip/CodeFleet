// Task ledger — owns revision creation, approval, and invalidation.
//
// Approval binds to a revision, not to a task. Editing the task produces a new
// content hash, and the approval that named the old hash no longer covers it, so
// approval cannot silently carry across an edit.
//
// A revision is executable only when the Task ledger holds a valid TASK_APPROVED
// and the Objective ledger holds a valid queue decision. This module owns the
// first half; ledger.ts owns the second.

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { meetMode, modeRank, resolveAgentRole, type CustomRole } from "./agent-role.ts";
import { loadConfig } from "./config.ts";
import { runMutation, type MutationOutcome } from "./mutation.ts";
import { loadTask } from "./task.ts";
import type { CodeFleetConfig } from "./types.ts";

export type TaskLedgerEventType =
  | "TASK_REVISION_CREATED"
  | "TASK_APPROVED"
  | "TASK_APPROVAL_INVALIDATED"
  | "TASK_REVISION_SUPERSEDED";

export interface TaskLedgerEvent {
  mutationId: string;
  eventId: string;
  seq: number;
  type: TaskLedgerEventType;
  taskId: string;
  taskRevision: number;
  revisionHash: string;
  approvalTargetHash: string;
  /** Empty on events written before guardrails joined the approval target. */
  guardrailHash?: string;
  actorKind: "HUMAN" | "SYSTEM_POLICY";
  actorId: string;
  reason: string;
  at: string;
}

export interface ApprovalState {
  taskId: string;
  latestRevision: number;
  latestRevisionHash: string;
  approvedRevision: number | null;
  /** The combined target: what the approval actually named. */
  approvedHash: string;
  /** The Task half of that target, kept apart so a refusal can say which moved. */
  approvedRevisionHash: string;
  /** The guardrail projection in force when the approval was given. */
  approvedGuardrailHash: string;
  approvedBy: string;
  approvedAt: string;
  /** Why the current content is not executable, empty when it is. */
  blockedReason: string;
}

export function taskLedgerPath(rootDir: string, taskId: string): string {
  return path.join(rootDir, ".codefleet", "tasks", taskId, "task-ledger.jsonl");
}

export async function contentHashOf(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

/**
 * The part of the Project Profile that decides how an approved contract may
 * execute. The model puts guardrails inside the contract, so this travels with
 * the approval; everything else in the Profile does not.
 *
 * A projection rather than the whole file on purpose. Hashing config.json would
 * make renaming the project revoke every approval in the workspace, which
 * teaches people to re-approve without reading — the opposite of the point.
 */
export function guardrailProjection(config: CodeFleetConfig): Record<string, unknown> {
  return {
    harnessMode: config.harnessMode,
    mode: config.mode,
    isolationMode: config.isolationMode,
    allowedAdapters: [...config.allowedAdapters].sort(),
    defaultAgentRole: config.defaultAgentRole ?? "",
    agentRoles: config.agentRoles,
    profileRequiredGates: config.profileRequiredGates ?? {},
    autoAdvanceOnDone: config.autoAdvanceOnDone,
    commands: config.policies.commands,
    harness: config.policies.harness
  };
}

/** Stable across reads: key order must not change the hash. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function guardrailHashOf(rootDir: string): Promise<string> {
  const config = await loadConfig(rootDir);
  return createHash("sha256").update(canonicalJson(guardrailProjection(config))).digest("hex");
}

/**
 * What the approval names: the contract body and the guardrails it may run
 * under. Kept as one value so a stored approval cannot match a Run whose
 * guardrails have since moved.
 */
/**
 * Whether this contract could execute at all. The design makes it a condition of
 * turning a Draft into a Revision, and without it an approval means "you may try
 * to run this" rather than "you may run this": the default profile approves a
 * BACKEND_IMPLEMENTER contract carrying verification commands, and the adapter
 * then refuses to launch because the role caps below COMMAND_EXEC.
 *
 * Only what can be decided at approval time is checked here. Whether a command
 * passes command policy, or whether the tool exists on the machine, belongs to
 * the Run.
 */
export async function contractFeasibility(
  rootDir: string,
  taskId: string
): Promise<{ feasible: boolean; reason: string }> {
  const config = await loadConfig(rootDir);
  const { task } = await loadTask(rootDir, taskId);

  const roleBlock = config.agentRoles as { allowedAgentRoles?: unknown; customRoles?: unknown };
  const resolution = resolveAgentRole({
    taskRole: task.agentRole ?? config.defaultAgentRole,
    allowedAgentRoles: Array.isArray(roleBlock.allowedAgentRoles) ? (roleBlock.allowedAgentRoles as string[]) : [],
    customRoles: (roleBlock.customRoles ?? {}) as Record<string, CustomRole>
  });
  if (resolution.blockedReason !== "" || resolution.role === null) {
    return {
      feasible: false,
      reason: resolution.blockedReason || `agentRole ${resolution.roleId} does not resolve`
    };
  }

  const commands = task.verification?.commands ?? [];
  if (commands.length === 0) {
    return { feasible: true, reason: "" };
  }

  // meet(profile, role) is the ceiling this contract can ever reach. Task
  // guardrails may lower it further but never raise it, so a ceiling below
  // COMMAND_EXEC here can never run the commands the contract declares.
  const ceiling = meetMode(config.harnessMode, resolution.role.defaultMaxMode);
  if (modeRank(ceiling) >= modeRank("COMMAND_EXEC")) {
    return { feasible: true, reason: "" };
  }
  return {
    feasible: false,
    reason: [
      `this contract declares ${commands.length} verification command(s) but cannot run them.`,
      `  agentRole ${resolution.roleId} caps at ${resolution.role.defaultMaxMode}`,
      `  defaults.task.harnessMode is ${config.harnessMode}`,
      `  together they allow at most ${ceiling}, and running commands needs COMMAND_EXEC`,
      "",
      "Either choose a role whose ceiling reaches COMMAND_EXEC, or remove the",
      "verification commands this contract cannot execute."
    ].join("\n")
  };
}

export function approvalTargetOf(revisionHash: string, guardrailHash: string): string {
  return createHash("sha256").update(`${revisionHash}\n${guardrailHash}`).digest("hex");
}

export async function readTaskEvents(rootDir: string, taskId: string): Promise<TaskLedgerEvent[]> {
  try {
    const raw = await readFile(taskLedgerPath(rootDir, taskId), "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as TaskLedgerEvent);
  } catch {
    return [];
  }
}

// Approval state is replayed from the ledger, never read from a mutable field on
// the task file, so an edit cannot quietly leave a stale "approved" flag behind.
export async function replayApproval(
  rootDir: string,
  taskId: string,
  currentHash: string
): Promise<ApprovalState> {
  const events = [...(await readTaskEvents(rootDir, taskId))].sort((a, b) => a.seq - b.seq);

  const currentGuardrailHash = await guardrailHashOf(rootDir);

  let latestRevision = 0;
  let latestRevisionHash = "";
  let approvedRevision: number | null = null;
  let approvedHash = "";
  let approvedRevisionHash = "";
  let approvedGuardrailHash = "";
  let approvedBy = "";
  let approvedAt = "";

  for (const event of events) {
    if (event.type === "TASK_REVISION_CREATED") {
      latestRevision = event.taskRevision;
      latestRevisionHash = event.revisionHash;
    } else if (event.type === "TASK_APPROVED") {
      approvedRevision = event.taskRevision;
      approvedHash = event.approvalTargetHash;
      approvedRevisionHash = event.revisionHash;
      approvedGuardrailHash = event.guardrailHash ?? "";
      approvedBy = event.actorId;
      approvedAt = event.at;
    } else if (event.type === "TASK_APPROVAL_INVALIDATED" || event.type === "TASK_REVISION_SUPERSEDED") {
      if (approvedRevision === event.taskRevision) {
        approvedRevision = null;
        approvedHash = "";
        approvedRevisionHash = "";
        approvedGuardrailHash = "";
        approvedBy = "";
        approvedAt = "";
      }
    }
  }

  let blockedReason = "";
  if (approvedRevision === null) {
    blockedReason = latestRevision === 0 ? "NO_REVISION_CREATED" : "NO_VALID_APPROVAL";
  } else if (approvedRevisionHash !== currentHash) {
    // The file changed after approval. The approval named the old content and
    // does not extend to what is on disk now.
    blockedReason = "TASK_CONTENT_CHANGED_AFTER_APPROVAL";
  } else if (approvedHash !== approvalTargetOf(currentHash, currentGuardrailHash)) {
    // The contract body is untouched but the guardrails it was approved under
    // are not the ones in force. Naming this separately matters: the operator
    // did not edit the Task and would otherwise be told that they had.
    blockedReason = "PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL";
  }

  return {
    taskId,
    latestRevision,
    latestRevisionHash,
    approvedRevision,
    approvedHash,
    approvedRevisionHash,
    approvedGuardrailHash,
    approvedBy,
    approvedAt,
    blockedReason
  };
}

async function appendTaskEvent(
  rootDir: string,
  taskId: string,
  mutationId: string,
  type: TaskLedgerEventType,
  fields: {
    taskRevision: number;
    revisionHash: string;
    approvalTargetHash: string;
    guardrailHash?: string;
    actorId: string;
    reason: string;
  }
): Promise<TaskLedgerEvent> {
  const events = await readTaskEvents(rootDir, taskId);
  const seq = events.length + 1;
  const event: TaskLedgerEvent = {
    mutationId,
    eventId: `evt_${seq.toString().padStart(6, "0")}_${mutationId.slice(4, 12)}`,
    seq,
    type,
    taskId,
    taskRevision: fields.taskRevision,
    revisionHash: fields.revisionHash,
    approvalTargetHash: fields.approvalTargetHash,
    guardrailHash: fields.guardrailHash ?? "",
    actorKind: "HUMAN",
    actorId: fields.actorId,
    reason: fields.reason,
    at: new Date().toISOString()
  };
  await mkdir(path.dirname(taskLedgerPath(rootDir, taskId)), { recursive: true });
  await appendFile(taskLedgerPath(rootDir, taskId), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

// Approving current content creates the revision and the approval together. The
// revision is identified by the content hash, so approving edited content
// produces a new revision rather than re-approving the old one.
export async function approveTask(
  rootDir: string,
  input: { taskId: string; taskPath: string; actorId: string; reason: string }
): Promise<MutationOutcome<TaskLedgerEvent>> {
  const { taskId, taskPath, actorId, reason } = input;
  if (reason.trim().length === 0) {
    throw new Error("TASK_APPROVED requires a reason");
  }
  const currentHash = await contentHashOf(taskPath);
  const guardrailHash = await guardrailHashOf(rootDir);
  const targetHash = approvalTargetOf(currentHash, guardrailHash);

  return runMutation(
    rootDir,
    {
      mutationKind: "TASK_APPROVE",
      targetId: taskId,
      targetHash,
      semanticPayload: {}
    },
    {
      precheck: async (): Promise<void> => {
        const feasibility = await contractFeasibility(rootDir, taskId);
        if (!feasibility.feasible) {
          throw new Error(`Contract cannot be approved: ${feasibility.reason}`);
        }
        const state = await replayApproval(rootDir, taskId, currentHash);
        if (state.approvedHash === targetHash) {
          return;
        }
        if (state.approvedRevision !== null && state.approvedHash !== targetHash) {
          // The prior approval is not silently carried forward; it has to be
          // invalidated explicitly before this content can be approved.
          throw new Error(
            `revision ${state.approvedRevision} is approved for different content; invalidate it first`
          );
        }
      },
      isAlreadyApplied: async (): Promise<boolean> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        return state.approvedHash === targetHash;
      },
      append: async (mutationId): Promise<TaskLedgerEvent> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        const revision = state.latestRevision + 1;
        await appendTaskEvent(rootDir, taskId, mutationId, "TASK_REVISION_CREATED", {
          taskRevision: revision,
          revisionHash: currentHash,
          approvalTargetHash: "",
          actorId,
          reason
        });
        return appendTaskEvent(rootDir, taskId, mutationId, "TASK_APPROVED", {
          taskRevision: revision,
          revisionHash: currentHash,
          approvalTargetHash: targetHash,
          guardrailHash,
          actorId,
          reason
        });
      },
      rebuild: async (): Promise<void> => {
        // Approval state is computed on read; there is no snapshot to rebuild.
      },
      postcheck: async (): Promise<void> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        if (state.blockedReason.length > 0) {
          throw new Error(`approval did not take effect: ${state.blockedReason}`);
        }
      }
    }
  );
}

export async function invalidateApproval(
  rootDir: string,
  input: { taskId: string; taskPath: string; actorId: string; reason: string }
): Promise<MutationOutcome<TaskLedgerEvent>> {
  const { taskId, taskPath, actorId, reason } = input;
  if (reason.trim().length === 0) {
    throw new Error("TASK_APPROVAL_INVALIDATED requires a reason");
  }
  const currentHash = await contentHashOf(taskPath);

  return runMutation(
    rootDir,
    {
      mutationKind: "TASK_APPROVAL_INVALIDATE",
      targetId: taskId,
      semanticPayload: {}
    },
    {
      precheck: async (): Promise<void> => {
        const events = await readTaskEvents(rootDir, taskId);
        if (!events.some((event) => event.type === "TASK_APPROVED")) {
          throw new Error(`no approval to invalidate for ${taskId}`);
        }
      },
      isAlreadyApplied: async (): Promise<boolean> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        return state.approvedRevision === null;
      },
      append: async (mutationId): Promise<TaskLedgerEvent> => {
        const events = await readTaskEvents(rootDir, taskId);
        const approved = [...events].reverse().find((event) => event.type === "TASK_APPROVED");
        return appendTaskEvent(rootDir, taskId, mutationId, "TASK_APPROVAL_INVALIDATED", {
          taskRevision: approved?.taskRevision ?? 0,
          revisionHash: approved?.revisionHash ?? "",
          approvalTargetHash: approved?.approvalTargetHash ?? "",
          actorId,
          reason
        });
      },
      rebuild: async (): Promise<void> => {},
      postcheck: async (): Promise<void> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        if (state.approvedRevision !== null) {
          throw new Error("approval is still effective after invalidation");
        }
      }
    }
  );
}
