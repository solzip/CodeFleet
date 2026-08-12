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
