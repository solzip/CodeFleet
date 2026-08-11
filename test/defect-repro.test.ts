// Reproductions for two defects found in the 2026-08-10 audit.
//
// These two are not unimplemented rules. Every other P0 from that audit has a
// NOT_IMPLEMENTED entry in docs/rule-implementation-status.json, so the status
// file already says the code is not there. These two have no entry at all: the
// code exists, is believed to work, and is broken. Nothing in the suite fails
// because of them, which is exactly the problem this file fixes.
//
// Every test here failed on the code as it stood, then the defect was fixed.
// They are kept as the regression guard for both.
//
//   P0-5  importLocalReview defaulted a missing taskRevision to 1
//         fixture-supplied taskRevision in test/ledger.test.ts hid it
//         failed at: undefined !== 2
//
//   P0-3  concurrent runs derived one runId from one directory listing
//         reproduced at 8 concurrent runs, not at 2 — see the numbers below
//         failed at: 8 runs started but produced 5 distinct runIds

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  attachTask,
  createObjective,
  importLocalReview,
  ledgerPath,
  replayObjective
} from "../src/ledger.ts";
import { reviewRun } from "../src/review.ts";
import { breakRunLock, listRunLocks, runLockPathFor, runTask } from "../src/run.ts";
import { approveTask, contentHashOf, invalidateApproval, replayApproval } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function taskYaml(goal: string): string {
  return [
    "id: sample",
    "title: Sample task",
    "projectPath: .",
    `goal: ${goal}`,
    "scope:",
    '  include: ["src/**", "tools/**"]',
    "  exclude: []",
    "verification:",
    "  commands:",
    "    - commandId: unit-tests",
    `      command: [${JSON.stringify(process.execPath)}, "tools/check.mjs"]`,
    "constraints: []",
    "doneCriteria: [Artifacts exist]",
    "workflow: [IMPLEMENT]",
    "status: READY",
    ""
  ].join("\n");
}

// A workspace whose Run reaches result DONE with a satisfied verification gate,
// so the only thing standing between it and VERIFIED is the review chain itself.
async function seedVerifiedWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-defect-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  await writeFile(path.join(root, "tools", "agent.mjs"), 'import { writeFileSync } from "node:fs";\n', "utf8");
  await writeFile(path.join(root, "tools", "check.mjs"), "process.exit(0);\n", "utf8");

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "defect-repro", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(path.join(root, ".codefleet", "tasks", "sample.yaml"), taskYaml("Reach DONE at revision 1"), "utf8");

  return root;
}

// P0-5. LocalReviewDecision has no taskRevision field (src/review.ts:96-137),
// and importLocalReview fills the hole with `?? 1` (src/ledger.ts:855,857). A
// Task edited and re-approved runs at revision 2, but its review imports onto
// the revision 1 queue item, which does not exist. The event is appended anyway,
// the CLI prints success, and the queue item can never reach VERIFIED.
//
// The existing ledger tests do not catch this because localReviewFixture in
// test/ledger.test.ts hand-supplies `taskRevision: 1` — a field the real review
// writer never produces. This test uses the artifact reviewRun actually wrote.
test("a review of revision 2 imports onto the revision 2 queue item", async () => {
  const root = await seedVerifiedWorkspace();
  const taskPath = await findTaskPath(root, "sample");

  // Revision 1: approve, then edit, invalidate, and re-approve to reach 2.
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "first approval" });
  await writeFile(taskPath, taskYaml("Reach DONE at revision 2"), "utf8");
  await invalidateApproval(root, { taskId: "sample", taskPath, actorId: "tester", reason: "edited the task" });
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "second approval" });

  const approval = await replayApproval(root, "sample", await contentHashOf(taskPath));
  assert.equal(approval.approvedRevision, 2, "the fixture must actually be at revision 2");

  await createObjective(root, {
    objectiveId: "auth",
    title: "Auth work",
    kind: "SEQUENCE",
    actorId: "tester",
    reason: "created"
  });
  await attachTask(root, {
    objectiveId: "auth",
    taskId: "sample",
    taskRevision: 2,
    taskRevisionHash: approval.approvedHash,
    actorId: "tester",
    reason: "attached at the approved revision"
  });

  const execution = await runTask(root, "sample");
  const runId = execution.result.runId;

  // The Run knows the revision. Everything downstream of here is where it is lost.
  const runPlan = await readJson(path.join(execution.runDir, "run-plan.json"));
  assert.equal((runPlan.approval as { taskRevision: number }).taskRevision, 2);

  const summary = await readJson(path.join(root, ".codefleet", "runs", runId, "run-summary.json"));
  const gaps = (summary.normalization as { unavailableReasons: string[] }).unavailableReasons;
  const review = await reviewRun(root, runId, {
    decision: "ACCEPTED",
    reason: "checked the repository directly",
    waivedGaps: gaps,
    waiveJustification: "reviewed git status and diff by hand"
  });
  assert.equal(review.localReviewStatus, "MIGRATION_READY_WAIVED");

  const localReviewPath = path.join(root, ".codefleet", "runs", runId, "review-decision.local.json");
  const raw = await readFile(localReviewPath, "utf8");
  const localReview = JSON.parse(raw) as Record<string, unknown>;

  // The migration input must carry the revision it decided on. Without it the
  // importer has nothing to read and defaults to 1.
  assert.equal(
    localReview.taskRevision,
    2,
    "review-decision.local.json must record the taskRevision it decided on"
  );

  const outcome = await importLocalReview(root, {
    objectiveId: "auth",
    runId,
    localReview,
    localReviewRef: {
      path: `.codefleet/runs/${runId}/review-decision.local.json`,
      hash: (await import("node:crypto")).createHash("sha256").update(raw).digest("hex")
    },
    reason: "imported",
    actorId: "tester"
  });
  assert.equal(outcome.failedPhase, null, outcome.failureMessage);

  const decision = (await readFile(ledgerPath(root, "auth"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> })
    .find((event) => event.type === "RUN_REVIEW_DECIDED");

  assert.ok(decision, "a RUN_REVIEW_DECIDED event must be appended");
  assert.equal(decision.payload.taskRevision, 2, "the decision must name the revision it reviewed");
  assert.equal(
    decision.payload.objectiveQueueItemId,
    "auth:sample:2",
    "the decision must target the queue item that exists"
  );

  // The whole chain exists to make this derivable. A decision that lands on a
  // queue item nobody attached leaves the item unverified forever while every
  // command along the way reports success.
  const { snapshot } = await replayObjective(root, "auth");
  assert.deepEqual(
    snapshot.replay.findings.filter((finding) => finding.checkId === "REVIEW_TARGETS_QUEUE_ITEM"),
    [],
    "the imported decision must not reference an unknown queue item"
  );
  assert.equal(snapshot.queue[0].derivedState, "VERIFIED");
});

// P0-3. nextRunId (src/run.ts:1345-1363) derives the next id by reading the runs
// directory, and runTask holds no lock, so two concurrent runs of one task read
// the same directory listing and pick the same id. mkdir(runDir, { recursive:
// true }) (src/run.ts:178) swallows the collision, and both Runs then write over
// each other inside one directory.
//
// A fix may either serialize each run onto its own id or refuse the extras
// fail-fast, the way the mutation lock already refuses. Both are acceptable; two
// Runs reporting success while sharing one Run Trace is not.
//
// Concurrency is 8 and the race is repeated, because the collision is a timing
// window and a test that reproduces it sometimes pins nothing. Measured on this
// code before any fix:
//
//   N=2   0/20 and 2/10 collisions across two separate measurements
//   N=3   5/20      N=4  10/20      N=6  14/20
//   N=8  20/20 and 39/40 across two separate measurements
//
// At 39/40 per trial, 3 trials leave roughly a 2-in-100,000 chance of passing
// while the defect is present. One trial costs about 725 ms.
const RACE_TRIALS = 3;
const RACE_WIDTH = 8;

test("concurrent runs of one task do not share a runId", async () => {
  for (let trial = 1; trial <= RACE_TRIALS; trial++) {
    const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-concurrent-"));
    await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
    await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
    await writeFile(
      path.join(root, ".codefleet", "config.json"),
      `${JSON.stringify(profileJson({ workspaceId: "concurrent-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(root, ".codefleet", "tasks", "sample.yaml"),
      [
        "id: sample",
        "title: Sample task",
        "projectPath: .",
        "goal: Exercise concurrent runs",
        "scope:",
        "  include: [src/**]",
        "  exclude: [secrets/**]",
        "constraints: []",
        "doneCriteria: [Artifacts exist]",
        "workflow: [Run dry-run adapter]",
        "status: READY",
        ""
      ].join("\n"),
      "utf8"
    );

    await approveTask(root, {
      taskId: "sample",
      taskPath: await findTaskPath(root, "sample"),
      actorId: "tester",
      reason: "approved for test"
    });

    const settled = await Promise.allSettled(
      Array.from({ length: RACE_WIDTH }, () => runTask(root, "sample"))
    );
    const started = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);

    assert.ok(started.length >= 1, `trial ${trial}: at least one run must start`);

    // A run that did not start must have been refused on purpose and said so. A
    // fix that serialises instead of refusing produces no rejections at all,
    // which is equally acceptable and leaves this loop empty.
    for (const entry of settled) {
      if (entry.status === "rejected") {
        assert.match(
          entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
          /already in progress/,
          `trial ${trial}: a run that did not start must name why`
        );
      }
    }

    const runIds = new Set(started.map((entry) => entry.result.runId));
    assert.equal(
      runIds.size,
      started.length,
      `trial ${trial}: ${started.length} runs started but produced ${runIds.size} distinct runIds`
    );

    // The directory count is the observable consequence: a shared id means one
    // Run Trace holding several Runs' artifacts, with the losers silently
    // overwritten. A run that never started must leave no trace either.
    const runDirs = await readdir(path.join(root, ".codefleet", "runs"));
    assert.equal(
      runDirs.length,
      started.length,
      `trial ${trial}: ${started.length} runs started but left ${runDirs.length} Run Trace directories`
    );
  }
});

// A lock that outlives its Run and cannot be cleared is a dead end, not a
// safeguard, so the refusal has to name its holder and there has to be a way out.
test("a stale run lock blocks, names its holder, and is never broken automatically", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-runlock-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "runlock-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise the run lock",
      "scope:",
      "  include: [src/**]",
      "  exclude: [secrets/**]",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Run dry-run adapter]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const lockPath = runLockPathFor(root, "sample");
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(
    lockPath,
    `${JSON.stringify({
      schemaVersion: "1.0",
      documentKind: "RUN_LOCK",
      holder: {
        pid: 9999,
        host: "other",
        startedAt: "2026-08-11T10:00:00Z",
        taskId: "sample",
        runId: "2026-08-11_001"
      }
    })}\n`,
    "utf8"
  );

  await assert.rejects(() => runTask(root, "sample"), /pid 9999 on other/);

  // The refusal leaves the lock alone; clearing it is an explicit action.
  const held = await listRunLocks(root);
  assert.deepEqual(held.map((lock) => [lock.taskId, lock.holder?.pid]), [["sample", 9999]]);

  const broken = await breakRunLock(root, "sample");
  assert.equal(broken?.holder?.pid, 9999);
  assert.deepEqual(await listRunLocks(root), []);
  assert.equal(await breakRunLock(root, "sample"), null, "breaking a lock that is not there is not a lie");

  // A lock file that cannot be parsed still blocks, because what blocks is the
  // file existing. Reporting it as no lock at all would describe a workspace
  // where the Task cannot run as one with nothing holding it.
  await writeFile(lockPath, "{ this is not json\n", "utf8");
  await assert.rejects(() => runTask(root, "sample"), /already in progress/);
  assert.deepEqual(
    (await listRunLocks(root)).map((lock) => [lock.taskId, lock.holder]),
    [["sample", null]]
  );
  assert.equal((await breakRunLock(root, "sample"))?.holder, null);
  assert.deepEqual(await listRunLocks(root), []);

  // Releasing has to happen on the failure path too, or one refused Run locks
  // the Task out permanently.
  const execution = await runTask(root, "sample");
  assert.ok(execution.result.runId.length > 0);
  assert.deepEqual(await listRunLocks(root), [], "a finished run releases its lock");

  await assert.rejects(() => runTask(root, "missing-task"));
  assert.deepEqual(await listRunLocks(root), [], "a failed run releases its lock");
});

// The concurrency test above is satisfied by a per-Task lock alone: 7 of the 8 are refused,
// so only one run ever reserves an id and the id derivation is never exercised.
// runId is global per date, not per Task, so different Tasks race on it with no
// lock between them. Measured after the fix: 8 different Tasks start 8 runs with
// 8 distinct ids and 8 Run Trace directories, where the same-Task case starts 1
// and refuses 7. This is the half a lock cannot cover.
test("concurrent runs of different tasks do not share a runId", async () => {
  for (let trial = 1; trial <= RACE_TRIALS; trial++) {
    const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-multitask-"));
    await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
    await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
    await writeFile(
      path.join(root, ".codefleet", "config.json"),
      `${JSON.stringify(profileJson({ workspaceId: "multitask-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
      "utf8"
    );

    const taskIds = Array.from({ length: RACE_WIDTH }, (_, index) => `task-${index}`);
    for (const id of taskIds) {
      await writeFile(
        path.join(root, ".codefleet", "tasks", `${id}.yaml`),
        [
          `id: ${id}`,
          `title: Task ${id}`,
          "projectPath: .",
          "goal: Exercise concurrent runs of distinct tasks",
          "scope:",
          "  include: [src/**]",
          "  exclude: [secrets/**]",
          "constraints: []",
          "doneCriteria: [Artifacts exist]",
          "workflow: [Run dry-run adapter]",
          "status: READY",
          ""
        ].join("\n"),
        "utf8"
      );
      await approveTask(root, {
        taskId: id,
        taskPath: await findTaskPath(root, id),
        actorId: "tester",
        reason: "approved for test"
      });
    }

    const settled = await Promise.allSettled(taskIds.map((id) => runTask(root, id)));
    const started = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);

    // Nothing here contends for the same Task, so every run must start.
    assert.equal(
      started.length,
      RACE_WIDTH,
      `trial ${trial}: ${RACE_WIDTH} distinct tasks but only ${started.length} runs started`
    );

    const runIds = new Set(started.map((entry) => entry.result.runId));
    assert.equal(
      runIds.size,
      RACE_WIDTH,
      `trial ${trial}: ${RACE_WIDTH} runs produced ${runIds.size} distinct runIds`
    );

    const runDirs = await readdir(path.join(root, ".codefleet", "runs"));
    assert.equal(
      runDirs.length,
      RACE_WIDTH,
      `trial ${trial}: ${RACE_WIDTH} runs left ${runDirs.length} Run Trace directories`
    );
  }
});
