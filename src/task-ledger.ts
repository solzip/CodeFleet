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
import { runMutation, type MutationOutcome } from "./mutation.ts";

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
  approvedHash: string;
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

  let latestRevision = 0;
  let latestRevisionHash = "";
  let approvedRevision: number | null = null;
  let approvedHash = "";
  let approvedBy = "";
  let approvedAt = "";

  for (const event of events) {
    if (event.type === "TASK_REVISION_CREATED") {
      latestRevision = event.taskRevision;
      latestRevisionHash = event.revisionHash;
    } else if (event.type === "TASK_APPROVED") {
      approvedRevision = event.taskRevision;
      approvedHash = event.approvalTargetHash;
      approvedBy = event.actorId;
      approvedAt = event.at;
    } else if (event.type === "TASK_APPROVAL_INVALIDATED" || event.type === "TASK_REVISION_SUPERSEDED") {
      if (approvedRevision === event.taskRevision) {
        approvedRevision = null;
        approvedHash = "";
        approvedBy = "";
        approvedAt = "";
      }
    }
  }

  let blockedReason = "";
  if (approvedRevision === null) {
    blockedReason = latestRevision === 0 ? "NO_REVISION_CREATED" : "NO_VALID_APPROVAL";
  } else if (approvedHash !== currentHash) {
    // The file changed after approval. The approval named the old content and
    // does not extend to what is on disk now.
    blockedReason = "TASK_CONTENT_CHANGED_AFTER_APPROVAL";
  }

  return {
    taskId,
    latestRevision,
    latestRevisionHash,
    approvedRevision,
    approvedHash,
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
  fields: { taskRevision: number; revisionHash: string; approvalTargetHash: string; actorId: string; reason: string }
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

  return runMutation(
    rootDir,
    {
      mutationKind: "TASK_APPROVE",
      targetId: taskId,
      targetHash: currentHash,
      semanticPayload: {}
    },
    {
      precheck: async (): Promise<void> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        if (state.approvedHash === currentHash) {
          return;
        }
        if (state.approvedRevision !== null && state.approvedHash !== currentHash) {
          // The prior approval is not silently carried forward; it has to be
          // invalidated explicitly before this content can be approved.
          throw new Error(
            `revision ${state.approvedRevision} is approved for different content; invalidate it first`
          );
        }
      },
      isAlreadyApplied: async (): Promise<boolean> => {
        const state = await replayApproval(rootDir, taskId, currentHash);
        return state.approvedHash === currentHash;
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
          approvalTargetHash: currentHash,
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
