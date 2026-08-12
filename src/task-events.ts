// Task ledger events, and nothing else.
//
// A leaf on purpose. The Objective ledger has to check a relation against the
// Task ledger (P0-15) while the Revision artifact has to snapshot the Objective
// queue, and importing whole modules for that would make ledger.ts and
// task-ledger.ts import each other through task-revision.ts. Reading events is
// the only part either side needs, so it lives here with no product imports.

import { readFile } from "node:fs/promises";
import path from "node:path";

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
  /** Set by TASK_REVISION_SUPERSEDED only: which revision replaced this one. */
  supersededByTaskRevision?: number;
  supersededByRevisionHash?: string;
  actorKind: "HUMAN" | "SYSTEM_POLICY";
  actorId: string;
  reason: string;
  at: string;
}

export function taskLedgerPath(rootDir: string, taskId: string): string {
  return path.join(rootDir, ".codefleet", "tasks", taskId, "task-ledger.jsonl");
}

/**
 * Follows the succession chain forward from a revision.
 *
 * A relation attached at revision 1 has to be able to move to revision 3
 * without stopping at 2, and the chain is what says 3 is the same line of work
 * rather than an unrelated revision number.
 */
export function supersededChain(events: TaskLedgerEvent[], from: number): number[] {
  const chain: number[] = [];
  const seen = new Set<number>([from]);
  let current = from;
  for (;;) {
    const next = events.find(
      (event) =>
        event.type === "TASK_REVISION_SUPERSEDED" &&
        event.taskRevision === current &&
        typeof event.supersededByTaskRevision === "number"
    )?.supersededByTaskRevision;
    // A cycle cannot arise through approveTask, which only ever names a higher
    // revision, but a hand-edited ledger is not a reason to loop forever.
    if (next === undefined || seen.has(next)) {
      return chain;
    }
    chain.push(next);
    seen.add(next);
    current = next;
  }
}

/**
 * A Task ledger that exists but cannot be read as events.
 *
 * Distinct from an absent one, and never silently empty. This reader used to
 * catch everything and return [], which made three different situations
 * identical: no ledger, a ledger with a malformed line, and a ledger that could
 * not be opened. All three read as "this Task was never approved".
 *
 * That was not merely misleading. Approval computes the next revision number
 * from these events, so a ledger holding revision 1 that read as empty made
 * approveTask append a second revision 1 on top of it — corruption turned into
 * different corruption. Only the exclusive create on the revision artifact
 * stopped the rest of the mutation, which is a second line of defence standing
 * in for a missing first one.
 *
 * ledger.ts already treats its own ledger this way: unread is not the same as
 * empty. This is the same rule for the other ledger. P0-16.
 */
export class TaskLedgerUnreadableError extends Error {
  constructor(taskId: string, detail: string) {
    super(
      [
        `The Task ledger for ${taskId} exists but cannot be read: ${detail}.`,
        "",
        "It is append-only and is the only record of which revisions were created and",
        "approved. Reading it as empty would let the next approval reuse a revision number",
        "that is already in the file, so nothing is decided about this Task until it is",
        "readable again.",
        "",
        `Repair or restore .codefleet/tasks/${taskId}/task-ledger.jsonl.`
      ].join("\n")
    );
    this.name = "TaskLedgerUnreadableError";
  }
}

export async function readTaskEvents(rootDir: string, taskId: string): Promise<TaskLedgerEvent[]> {
  let raw: string;
  try {
    raw = await readFile(taskLedgerPath(rootDir, taskId), "utf8");
  } catch (error) {
    // A Task that has never been approved has no ledger, and that is the only
    // absence this reader may report as one.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw new TaskLedgerUnreadableError(taskId, (error as NodeJS.ErrnoException).code ?? "unknown error");
  }

  const events: TaskLedgerEvent[] = [];
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      events.push(JSON.parse(line) as TaskLedgerEvent);
    } catch {
      throw new TaskLedgerUnreadableError(taskId, `line ${index + 1} of ${lines.length} is not valid JSON`);
    }
  }
  return events;
}
