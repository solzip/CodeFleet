// A Task ledger for fixtures whose subject is the Objective queue.
//
// attachTask verifies the revision and hash it is given against the Task ledger
// (P0-15), so a fixture that only cares about queue behaviour still needs a
// Task ledger to attach to. Going through approveTask would drag a Project
// Profile, a valid Task file, and a feasibility check into tests about queue
// transitions.
//
// This writes the two events approval writes, and nothing else. It is not a
// stand-in for approval: test/task-revision.test.ts covers what approveTask
// produces, and test/ledger.test.ts asserts that attaching without this helper
// is refused — otherwise using it here would be indistinguishable from having
// turned the check off.

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { attachTask, createObjective } from "../src/ledger.ts";
import { taskLedgerPath } from "../src/task-events.ts";
import { contentHashOf, replayApproval } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";

/**
 * The second half of execution permission, for fixtures whose subject is the
 * Run rather than the queue.
 *
 * A Run needs an approved Revision and an accepted Objective relation, and
 * until P0-13 was closed only the first was enforced — so every Run fixture
 * approved and ran with no Objective at all. This supplies the missing half at
 * the revision that is actually approved.
 *
 * It throws rather than skipping when there is no approved revision. A helper
 * that quietly did nothing would turn "the fixture forgot to approve" into a
 * Run refusal several steps later, pointing at the wrong thing.
 */
export async function permitRun(
  rootDir: string,
  taskId: string,
  objectiveId = "fixture-objective"
): Promise<void> {
  const taskPath = await findTaskPath(rootDir, taskId);
  const approval = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
  if (approval.approvedRevision === null) {
    throw new Error(`permitRun: ${taskId} has no approved revision to attach`);
  }

  const created = await createObjective(rootDir, {
    objectiveId,
    title: "Fixture objective",
    kind: "SEQUENCE",
    actorId: "fixture",
    reason: "the Run fixture needs an Objective relation"
  });
  if (created.failedPhase !== null && !/already exists/i.test(String(created.failureMessage))) {
    throw new Error(`permitRun: ${String(created.failureMessage)}`);
  }

  const attached = await attachTask(rootDir, {
    objectiveId,
    taskId,
    taskRevision: approval.approvedRevision,
    taskRevisionHash: approval.approvedRevisionHash,
    actorId: "fixture",
    reason: "attached at the approved revision"
  });
  if (attached.failedPhase !== null) {
    throw new Error(`permitRun: ${String(attached.failureMessage)}`);
  }
}

export async function seedApprovedRevision(
  rootDir: string,
  taskId: string,
  taskRevision: number,
  revisionHash: string
): Promise<void> {
  const target = taskLedgerPath(rootDir, taskId);
  await mkdir(path.dirname(target), { recursive: true });
  const at = new Date().toISOString();
  const base = {
    mutationId: `mut_fixture_${taskId}_${taskRevision}`,
    taskId,
    taskRevision,
    revisionHash,
    actorKind: "HUMAN" as const,
    actorId: "fixture",
    reason: "seeded by a test fixture",
    at
  };
  const lines = [
    { ...base, eventId: `evt_fixture_${taskRevision}_created`, seq: taskRevision * 2 - 1, type: "TASK_REVISION_CREATED", approvalTargetHash: "" },
    { ...base, eventId: `evt_fixture_${taskRevision}_approved`, seq: taskRevision * 2, type: "TASK_APPROVED", approvalTargetHash: `target-${revisionHash}` }
  ];
  await appendFile(target, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
}
