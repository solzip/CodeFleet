// Task Revision artifact — the fixed record of what was approved.
//
// The Task ledger says a revision was approved and names its hash, but the hash
// only proves a match against a file that still exists. Edit the Task and the
// bytes the approval named are gone, so "which contract was approved" became
// unanswerable from inside the workspace. P1-41, and the reason P1-37 and P1-38
// looked like separate findings.
//
// The design fixes the contents:
//
//   - immutable Task contract
//   - contentHash
//   - approval target hash / approval decision reference
//   - objective relation snapshot / reference
//
// and fixes their standing: this file is a source, not authority. The current
// approval state and the current Objective relation are computed by replaying
// their ledgers. Nothing here is consulted to decide whether a Run may proceed,
// and nothing rewrites this file when an approval is later invalidated — an
// invalidated approval still had a contract, and erasing it would lose the only
// copy of what somebody agreed to.

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { replayObjective } from "./ledger.ts";

export interface TaskRevisionRelation {
  objectiveId: string;
  objectiveQueueItemId: string;
  taskRevision: number;
  storedState: string;
  derivedState: string;
}

export interface TaskRevisionDocument {
  schemaVersion: "0.2";
  documentKind: "TASK_REVISION";
  taskId: string;
  taskRevision: number;
  createdAt: string;
  contract: {
    /** Workspace-relative, so the document survives being moved or read elsewhere. */
    sourcePath: string;
    /** The exact bytes the approval named. */
    source: string;
    contentHash: string;
  };
  approvalTargetHash: string;
  guardrailHash: string;
  /** A reference, not a decision. Replay the Task ledger for the current state. */
  approvalDecisionRef: {
    authoritative: false;
    mutationId: string;
    eventId: string;
    actorId: string;
    at: string;
    reason: string;
  };
  /** A snapshot, not a decision. Replay the Objective ledger for the current state. */
  objectiveRelationSnapshot: {
    authoritative: false;
    capturedAt: string;
    /** What was read, so "no relations" and "nothing scanned" cannot be confused. */
    scanScope: { objectivesRead: number; queueItemsScanned: number };
    relations: TaskRevisionRelation[];
  };
}

export function taskRevisionsDir(rootDir: string, taskId: string): string {
  return path.join(rootDir, ".codefleet", "tasks", taskId, "revisions");
}

export function taskRevisionPath(rootDir: string, taskId: string, revision: number): string {
  return path.join(taskRevisionsDir(rootDir, taskId), `${revision.toString().padStart(4, "0")}.json`);
}

/**
 * What the Objective ledgers said about this Task when the approval was given.
 *
 * Captured rather than depended on. The design is explicit that approval does
 * not write Objective relation authority into the Revision, so this exists to
 * answer "what did the queue look like at the time", nothing more.
 *
 * A missing objectives directory yields an empty snapshot with a zero scanScope;
 * an unreadable one is not swallowed, because zero items examined must not read
 * the same as zero items found.
 */
async function captureRelations(
  rootDir: string,
  taskId: string
): Promise<TaskRevisionDocument["objectiveRelationSnapshot"]> {
  const objectivesDir = path.join(rootDir, ".codefleet", "objectives");
  let objectiveIds: string[];
  try {
    objectiveIds = await readdir(objectivesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      objectiveIds = [];
    } else {
      throw error;
    }
  }

  const relations: TaskRevisionRelation[] = [];
  let queueItemsScanned = 0;
  for (const objectiveId of objectiveIds) {
    const { snapshot } = await replayObjective(rootDir, objectiveId);
    queueItemsScanned += snapshot.queue.length;
    for (const item of snapshot.queue) {
      if (item.taskId !== taskId) {
        continue;
      }
      relations.push({
        objectiveId,
        objectiveQueueItemId: item.objectiveQueueItemId,
        taskRevision: item.taskRevision,
        storedState: item.storedState,
        derivedState: item.derivedState
      });
    }
  }

  return {
    authoritative: false,
    capturedAt: new Date().toISOString(),
    scanScope: { objectivesRead: objectiveIds.length, queueItemsScanned },
    relations
  };
}

export async function writeTaskRevision(
  rootDir: string,
  input: {
    taskId: string;
    taskRevision: number;
    taskPath: string;
    contentHash: string;
    approvalTargetHash: string;
    guardrailHash: string;
    mutationId: string;
    eventId: string;
    actorId: string;
    at: string;
    reason: string;
  }
): Promise<string> {
  const source = await readFile(input.taskPath, "utf8");
  const document: TaskRevisionDocument = {
    schemaVersion: "0.2",
    documentKind: "TASK_REVISION",
    taskId: input.taskId,
    taskRevision: input.taskRevision,
    createdAt: input.at,
    contract: {
      sourcePath: path.relative(rootDir, input.taskPath).split(path.sep).join("/"),
      source,
      contentHash: input.contentHash
    },
    approvalTargetHash: input.approvalTargetHash,
    guardrailHash: input.guardrailHash,
    approvalDecisionRef: {
      authoritative: false,
      mutationId: input.mutationId,
      eventId: input.eventId,
      actorId: input.actorId,
      at: input.at,
      reason: input.reason
    },
    objectiveRelationSnapshot: await captureRelations(rootDir, input.taskId)
  };

  const target = taskRevisionPath(rootDir, input.taskId, input.taskRevision);
  await mkdir(path.dirname(target), { recursive: true });
  // Exclusive: a revision number is claimed once. Overwriting one would mean an
  // approved contract could be swapped underneath its own hash.
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return target;
}

export class TaskRevisionDefectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskRevisionDefectError";
  }
}

/**
 * Reading verifies. A stored contract whose bytes no longer hash to the value
 * the approval named is worse than a missing one: it answers "what was
 * approved" with something nobody approved.
 */
export async function readTaskRevision(
  rootDir: string,
  taskId: string,
  revision: number
): Promise<TaskRevisionDocument> {
  const target = taskRevisionPath(rootDir, taskId, revision);
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new TaskRevisionDefectError(
        `Task ${taskId} has no stored revision ${revision}. ` +
          `Revisions approved before this artifact existed have no file; ` +
          `the Task ledger still records the approval and its hash.`
      );
    }
    throw error;
  }

  let document: TaskRevisionDocument;
  try {
    document = JSON.parse(raw) as TaskRevisionDocument;
  } catch (error) {
    throw new TaskRevisionDefectError(`revision ${revision} of ${taskId} is not readable JSON: ${String(error)}`);
  }

  const recomputed = createHash("sha256").update(document.contract?.source ?? "").digest("hex");
  if (recomputed !== document.contract?.contentHash) {
    throw new TaskRevisionDefectError(
      [
        `revision ${revision} of ${taskId} does not match its own contentHash.`,
        `  stored     ${document.contract?.contentHash ?? "(absent)"}`,
        `  recomputed ${recomputed}`,
        "The stored contract has been altered. It cannot stand in for what was approved."
      ].join("\n")
    );
  }
  return document;
}

export async function listTaskRevisions(rootDir: string, taskId: string): Promise<number[]> {
  let names: string[];
  try {
    names = await readdir(taskRevisionsDir(rootDir, taskId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => Number.parseInt(name.slice(0, -".json".length), 10))
    .filter((value) => Number.isInteger(value))
    .sort((a, b) => a - b);
}
