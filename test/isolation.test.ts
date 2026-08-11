// The 2026-08-10 audit's remaining P0s.
//
// These are not FINAL RULE conditions, so nothing here records a coverage claim.
// They are the four ways an agent process ran with no boundary around it, and
// each test asserts the boundary rather than the absence of one.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_ADAPTER_OUTPUT_CAP_BYTES, DEFAULT_ADAPTER_TIMEOUT_MS, runCommand } from "../src/agent.ts";
import { checkIsolationRequirement, prepareIsolation } from "../src/isolation.ts";
import { attachTask, createObjective, transitionQueueItem } from "../src/ledger.ts";
import { blockedQueueReason, runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

async function gitRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-iso-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }
  return root;
}

// ---------------------------------------------------------------- P0-6 -----

test("the adapter process has a time limit and is killed when it exceeds it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-timeout-"));
  await writeFile(path.join(root, "forever.mjs"), "setInterval(() => {}, 1000);\n", "utf8");

  const started = Date.now();
  const result = await runCommand(process.execPath, ["forever.mjs"], "", root, {
    limits: { timeoutMs: 400 }
  });
  const elapsed = Date.now() - started;

  assert.equal(result.status, "FAILED");
  assert.equal(result.exitCode, null);
  assert.match(result.stderr, /exceeded the 400 ms limit and was terminated/);
  // Before this, a process that never exits left codefleet run waiting forever.
  assert.ok(elapsed < 10_000, `the run must not outlive the limit; took ${elapsed} ms`);
});

test("output is capped, and the dropped bytes are counted rather than silently lost", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-cap-"));
  await writeFile(
    path.join(root, "loud.mjs"),
    "process.stdout.write('x'.repeat(50000));\nprocess.stderr.write('e'.repeat(50000));\n",
    "utf8"
  );

  const result = await runCommand(process.execPath, ["loud.mjs"], "", root, {
    limits: { outputCapBytes: 1000 }
  });

  assert.ok(result.stdout.length <= 1000, `stdout must be capped, got ${result.stdout.length}`);
  assert.ok(result.stderr.length <= 1000);
  // A truncated transcript must be distinguishable from one that simply ended.
  assert.ok((result.scanScope?.stdoutTruncatedBytes ?? 0) > 0);
  assert.ok((result.scanScope?.stderrTruncatedBytes ?? 0) > 0);
  assert.equal(result.scanScope?.outputCapBytes, 1000);

  // Defaults exist so a Profile that says nothing still has a ceiling.
  assert.ok(DEFAULT_ADAPTER_TIMEOUT_MS > 0);
  assert.ok(DEFAULT_ADAPTER_OUTPUT_CAP_BYTES > 0);
});

// ---------------------------------------------------------------- P0-1 -----

test("the child does not inherit the parent environment", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-env-"));
  await writeFile(path.join(root, "leak.mjs"), "process.stdout.write(process.env.CODEFLEET_SECRET ?? 'absent');\n", "utf8");

  process.env.CODEFLEET_SECRET = "should-not-reach-the-agent";
  try {
    const inherited = await runCommand(process.execPath, ["leak.mjs"], "", root);
    assert.equal(
      inherited.stdout,
      "absent",
      "an adapter receiving every exported credential is a boundary that does not exist"
    );

    // The caller may still pass what the adapter needs, explicitly.
    const explicit = await runCommand(process.execPath, ["leak.mjs"], "", root, {
      env: { PATH: process.env.PATH ?? "", CODEFLEET_SECRET: "named-on-purpose" }
    });
    assert.equal(explicit.stdout, "named-on-purpose");
  } finally {
    delete process.env.CODEFLEET_SECRET;
  }
});

// ---------------------------------------------------------------- P0-4 -----

test("a git worktree isolates the Run, and discarding it removes the edits", async () => {
  const root = await gitRepo();
  const prepared = await prepareIsolation({ projectPath: root, runId: "2026-08-11_001", mode: "GIT_WORKTREE" });

  assert.equal(prepared.unavailableReason, "", prepared.detail);
  assert.notEqual(prepared.workPath, root, "the agent must not run in the workspace itself");
  assert.ok((await readdir(prepared.workPath)).includes("src"), "the worktree is a checkout of the same repository");

  // An edit in the isolated tree does not reach the workspace.
  await writeFile(path.join(prepared.workPath, "src", "app.js"), "export const ok = false;\n", "utf8");
  assert.equal(await readFile(path.join(root, "src", "app.js"), "utf8"), "export const ok = true;\n");

  await prepared.discard();
  assert.equal(
    (await readdir(path.dirname(prepared.workPath)).catch(() => [])).length,
    0,
    "discarding removes the tree, which is what makes REJECTED mean something"
  );
  assert.equal(await readFile(path.join(root, "src", "app.js"), "utf8"), "export const ok = true;\n");
});

test("a mode that cannot be provided is reported, never silently downgraded", async () => {
  const notGit = await mkdtemp(path.join(os.tmpdir(), "codefleet-notgit-"));
  const worktree = await prepareIsolation({ projectPath: notGit, runId: "r", mode: "GIT_WORKTREE" });
  assert.equal(worktree.unavailableReason, "GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY");

  // Fixed schema values with no implementation say so rather than running
  // unisolated under a mode that claims otherwise.
  for (const mode of ["TEMP_WORKSPACE", "CONTAINER"]) {
    const prepared = await prepareIsolation({ projectPath: notGit, runId: "r", mode });
    assert.match(prepared.unavailableReason, new RegExp(`ISOLATION_MODE_NOT_IMPLEMENTED:${mode}`));
  }

  const none = await prepareIsolation({ projectPath: notGit, runId: "r", mode: "NONE" });
  assert.equal(none.workPath, notGit);
  assert.equal(none.unavailableReason, "");
});

test("requireIsolationForMutation is read, and it blocks rather than warning", async () => {
  const unisolated = await prepareIsolation({ projectPath: "/tmp/x", runId: "r", mode: "NONE" });

  // The flag is true by default, and this is the case the audit called the most
  // dangerous: on by default and consumed nowhere.
  const blocked = checkIsolationRequirement({
    requireIsolationForMutation: true,
    fileEdit: true,
    prepared: unisolated
  });
  assert.equal(blocked.blocked, true);
  assert.match(blocked.reason, /isolationMode is NONE/);
  assert.match(blocked.reason, /requireIsolationForMutation to false to accept edits/);

  // A Run that cannot edit files has nothing to isolate.
  assert.equal(
    checkIsolationRequirement({ requireIsolationForMutation: true, fileEdit: false, prepared: unisolated }).blocked,
    false
  );
  // Accepting the risk is allowed, in writing.
  assert.equal(
    checkIsolationRequirement({ requireIsolationForMutation: false, fileEdit: true, prepared: unisolated }).blocked,
    false
  );

  // Requested but unavailable is also blocked: a Profile that asked for a
  // worktree and got none has not had its requirement met.
  const notGit = await mkdtemp(path.join(os.tmpdir(), "codefleet-req-"));
  const unavailable = await prepareIsolation({ projectPath: notGit, runId: "r", mode: "GIT_WORKTREE" });
  const stillBlocked = checkIsolationRequirement({
    requireIsolationForMutation: true,
    fileEdit: true,
    prepared: unavailable
  });
  assert.equal(stillBlocked.blocked, true);
  assert.match(stillBlocked.reason, /was requested but is unavailable/);
});

test("an editing Run with the flag on and no isolation is refused before it starts", async () => {
  const root = await gitRepo();
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });

  const doc = profileJson({ workspaceId: "iso", harnessMode: "COMMAND_EXEC" }) as Record<string, unknown>;
  (doc.policies as Record<string, unknown>).harness = {
    allowDegradedCommandObservation: true,
    requireIsolationForMutation: true
  };
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["-e", ""] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise the isolation requirement",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
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

  await assert.rejects(() => runTask(root, "sample"), /requireIsolationForMutation is true/);
});

// ---------------------------------------------------------------- P0-2 -----

test("a queue decision blocks the Run, and an unattached Task is not blocked", async () => {
  const root = await gitRepo();
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "queue" }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise the queue gate",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
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

  // Attached to nothing: the queue has expressed no opinion, so it does not block.
  assert.equal(await blockedQueueReason(root, "sample"), null);
  const first = await runTask(root, "sample");
  assert.ok(first.result.runId.length > 0);

  await createObjective(root, {
    objectiveId: "auth",
    title: "Auth",
    kind: "SEQUENCE",
    actorId: "tester",
    reason: "created"
  });
  await attachTask(root, {
    objectiveId: "auth",
    taskId: "sample",
    taskRevision: 1,
    taskRevisionHash: "h",
    actorId: "tester",
    reason: "attached"
  });
  assert.equal(await blockedQueueReason(root, "sample"), null, "WAITING does not block");

  // Someone blocked it, with a written reason. Before this, the Run started anyway.
  for (const [type, state] of [
    ["QUEUE_ITEM_BLOCKED", "BLOCKED"],
    ["QUEUE_ITEM_SKIPPED", "SKIPPED"]
  ] as const) {
    await transitionQueueItem(root, {
      objectiveId: "auth",
      objectiveQueueItemId: "auth:sample:1",
      type,
      actorId: "tester",
      reason: "waiting on a decision"
    });
    const reason = await blockedQueueReason(root, "sample");
    assert.match(String(reason), new RegExp(`is ${state} in auth`), `${state} must block`);
    await assert.rejects(() => runTask(root, "sample"), new RegExp(`is ${state} in auth`));

    if (type === "QUEUE_ITEM_BLOCKED") {
      await transitionQueueItem(root, {
        objectiveId: "auth",
        objectiveQueueItemId: "auth:sample:1",
        type: "QUEUE_ITEM_UNBLOCKED",
        actorId: "tester",
        reason: "resolved"
      });
    }
  }
});
