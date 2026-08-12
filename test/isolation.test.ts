// The 2026-08-10 audit's remaining P0s.
//
// These are not FINAL RULE conditions, so nothing here records a coverage claim.
// They are the four ways an agent process ran with no boundary around it, and
// each test asserts the boundary rather than the absence of one.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_ADAPTER_OUTPUT_CAP_BYTES, DEFAULT_ADAPTER_TIMEOUT_MS, runCommand } from "../src/agent.ts";
import { checkIsolationRequirement, pathExists, prepareIsolation } from "../src/isolation.ts";
import { attachTask, createObjective, ledgerPath, transitionQueueItem } from "../src/ledger.ts";
import { reviewRun } from "../src/review.ts";
import {
  blockedQueueReason,
  captureNewFileContent,
  NEW_FILE_CONTENT_LIMIT_BYTES,
  runTask
} from "../src/run.ts";
import { approveTask, contentHashOf } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";
import { permitRun } from "./task-ledger-fixture.ts";

// Tests that make a discard fail on purpose own the tree afterwards. Windows
// releases a file handle a moment after the process holding it dies, so removal
// is retried rather than attempted once. A test that leaves trees behind grows
// the temp directory on every run.
async function forceRemoveTree(repoPath: string, treeRoot: string): Promise<void> {
  if (treeRoot.length === 0) {
    return;
  }
  const { spawnSync } = await import("node:child_process");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    spawnSync("git", ["worktree", "remove", "--force", treeRoot], { cwd: repoPath });
    try {
      await rm(treeRoot, { recursive: true, force: true });
      await rm(path.dirname(treeRoot), { recursive: true, force: true });
      if (!(await pathExists(path.dirname(treeRoot)))) {
        return;
      }
    } catch {
      // Still held. Fall through to the wait below.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

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
  await permitRun(root, "sample");

  await assert.rejects(() => runTask(root, "sample"), /requireIsolationForMutation is true/);
});

// ------------------------------------------------- P0-7 / P0-8 / P0-4 -----
//
// The 2026-08-11 re-audit found that turning isolation on made the Run blind.
// The agent ran in the worktree and every piece of evidence was collected from
// the workspace it never touched, so a Run that edited files and escaped its
// scope reported "no file change, no path violation" — and the tree was never
// discarded afterwards.
//
// Everything above this line exercises prepareIsolation directly. This is the
// end-to-end case: an actual Run, with GIT_WORKTREE turned on in the Profile.
// The fixture defaults to NONE on purpose, so this test states the mode itself
// rather than changing the fixture for every other test.
//
// Measured on 754acea, before the fix, all four assertions failed in order:
//   changedFiles []                 (expected src/app.js)
//   pathViolations []               (expected PATH_OUTSIDE_ALLOWED_PATHS)
//   verificationGateResult          NOT_SATISFIED / FAILED
//   git worktree list               2 entries after one Run
async function isolatedRunWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-wt-run-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  // The agent edits one file inside the Task scope and creates one outside it.
  // Both have to show up: the first as a change, the second as a violation.
  await writeFile(
    path.join(root, "tools", "agent.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      'writeFileSync("src/app.js", "export const ok = \'edited by the agent\';\\n");',
      'writeFileSync("outside-the-scope.txt", "the agent left the scope\\n");',
      'process.stdout.write("agent done\\n");',
      ""
    ].join("\n"),
    "utf8"
  );
  // Verification passes only if it can see the agent's edit. Run it against the
  // untouched workspace and it fails, which is what made the gate unreachable.
  await writeFile(
    path.join(root, "tools", "check.mjs"),
    [
      'import { readFileSync } from "node:fs";',
      'const body = readFileSync("src/app.js", "utf8");',
      'process.exit(body.includes("edited by the agent") ? 0 : 3);',
      ""
    ].join("\n"),
    "utf8"
  );

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  const doc = profileJson({
    workspaceId: "worktree-run",
    harnessMode: "COMMAND_EXEC",
    isolationMode: "GIT_WORKTREE",
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: true }
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Edit app.js inside an isolated tree",
      "scope:",
      '  include: ["src/**", "tools/**"]',
      "  exclude: []",
      "verification:",
      "  commands:",
      "    - commandId: unit-tests",
      `      command: [${JSON.stringify(process.execPath)}, "tools/check.mjs"]`,
      "constraints: []",
      "doneCriteria: [The agent's edit is visible to verification]",
      "workflow: [IMPLEMENT]",
      ""
    ].join("\n"),
    "utf8"
  );
  return root;
}

test("an isolated Run observes the tree the agent actually ran in", async () => {
  const root = await isolatedRunWorkspace();
  // Approving here rather than inside the helper, so the approval is visible at
  // the call site the way test/fixtures.test.ts requires of every runTask.
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });
  await permitRun(root, "sample");
  const execution = await runTask(root, "sample");
  const runDir = execution.runDir;

  const observation = JSON.parse(await readFile(path.join(runDir, "harness-observation.json"), "utf8")) as Record<string, any>;
  const summary = JSON.parse(await readFile(path.join(runDir, "run-summary.json"), "utf8")) as Record<string, any>;
  const plan = JSON.parse(await readFile(path.join(runDir, "run-plan.json"), "utf8")) as Record<string, any>;

  assert.equal(plan.isolation.mode, "GIT_WORKTREE", "the fixture must actually be running isolated");

  // 1. The agent's edit is observed. Before the fix this list was empty, and a
  //    Run that rewrote a file reported that nothing changed.
  assert.ok(
    (observation.changes.changedFiles as string[]).includes("src/app.js"),
    `changedFiles must contain the agent's edit, got ${JSON.stringify(observation.changes.changedFiles)}`
  );
  assert.ok(
    (observation.changes.workspaceDelta.modified as string[]).includes("src/app.js"),
    "the workspace delta is measured over the same tree as changed files"
  );

  // 2. Leaving the scope is a violation wherever the agent ran. Isolation must
  //    not be a way to make path enforcement unreachable.
  const violations = observation.policyChecks.pathViolations as { path: string; violationCode: string }[];
  assert.deepEqual(
    violations.map((entry) => [entry.path, entry.violationCode]),
    [["outside-the-scope.txt", "PATH_OUTSIDE_ALLOWED_PATHS"]],
    "the out-of-scope file the agent created must be reported"
  );

  // 3. Verification runs where the work is. Otherwise no isolated Run can ever
  //    satisfy the gate, and the product stops working when isolation is on.
  assert.equal(summary.check.observedCheck, "PASS");
  assert.equal(
    summary.check.verificationGateResult,
    "SATISFIED",
    `verification must observe the agent's edit, got ${summary.check.verificationGateReason}`
  );

  // 4. Containment still holds: the workspace itself is untouched.
  assert.equal(await readFile(path.join(root, "src", "app.js"), "utf8"), "export const ok = true;\n");
  assert.equal(
    (await readdir(root)).includes("outside-the-scope.txt"),
    false,
    "an isolated Run must not write into the workspace"
  );

  // 5. The tree is discarded when the Run is over. One leaked worktree per Run
  //    is a registration the repository keeps pointing at a directory nobody
  //    will look at again.
  const { spawnSync } = await import("node:child_process");
  const listed = spawnSync("git", ["worktree", "list"], { cwd: root, encoding: "utf8" });
  const entries = String(listed.stdout).split(/\r?\n/).filter((line) => line.trim().length > 0);
  assert.equal(entries.length, 1, `only the workspace itself may remain, got:\n${listed.stdout}`);

  // The Run says where it ran and what happened to that tree, so a reader is
  // never left guessing which tree the evidence describes.
  assert.ok(String(plan.isolation.isolatedPath).length > 0, "the Run Plan must record where the agent ran");
  assert.equal(await pathExists(String(plan.isolation.isolatedPath)), false, "the recorded tree is gone");
  assert.equal(observation.workspace.isolation.discarded, true);
  assert.equal(observation.workspace.isolation.unavailableReason, "");
  assert.equal(observation.workspace.workingDirectoryRealPath, plan.isolation.isolatedPath);

  // The reviewer's one readable document has to say the edits were not brought
  // back. Reintegration is a separate decision, and silence would read as "it
  // was applied".
  const runRecord = await readFile(path.join(runDir, "run-record.md"), "utf8");
  assert.match(runRecord, /GIT_WORKTREE/);
  assert.match(runRecord, /not.*applied to the workspace/i);
});

// A Run whose tree is discarded leaves git-diff.patch as the only surviving copy
// of the work. `git diff` does not report untracked files, so a created file was
// named in changed files and its content existed nowhere — silently, which is
// the shape of defect this product exists to refuse. P0-11.
//
// Measured before the fix:
//   modification src/app.js       : carried
//   deletion     src/doomed.js    : carried
//   creation     src/brand-new.js : ABSENT
test("the diff artifact carries a created file's content, not only its name", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-newfile-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, "src", "doomed.js"), "export const gone = 1;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  // One Run doing all three kinds of work, because a fix that carries creations
  // by dropping modifications or deletions is not a fix.
  await writeFile(
    path.join(root, "tools", "agent.mjs"),
    [
      'import { writeFileSync, rmSync } from "node:fs";',
      'writeFileSync("src/app.js", "export const ok = 2;\\n");',
      'rmSync("src/doomed.js");',
      'writeFileSync("src/brand-new.js", "export const fresh = true;\\nexport const second = 2;\\n");',
      'process.stdout.write("done\\n");',
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(path.join(root, "tools", "check.mjs"), "process.exit(0);\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  const doc = profileJson({
    workspaceId: "newfile",
    harnessMode: "COMMAND_EXEC",
    isolationMode: "GIT_WORKTREE",
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: true }
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Create, modify and delete in one Run",
      "scope:",
      '  include: ["src/**", "tools/**"]',
      "  exclude: []",
      "verification:",
      "  commands:",
      "    - commandId: unit-tests",
      `      command: [${JSON.stringify(process.execPath)}, "tools/check.mjs"]`,
      "constraints: []",
      "doneCriteria: [The patch describes every change]",
      "workflow: [IMPLEMENT]",
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
  await permitRun(root, "sample");

  const execution = await runTask(root, "sample");
  const patch = await readFile(path.join(execution.runDir, "git-diff.patch"), "utf8");
  const observation = JSON.parse(
    await readFile(path.join(execution.runDir, "harness-observation.json"), "utf8")
  ) as Record<string, any>;

  // The name was never the problem. The content was.
  assert.ok(
    (observation.changes.changedFiles as string[]).includes("src/brand-new.js"),
    "changed files must name the created file"
  );
  assert.ok(patch.includes("src/brand-new.js"), "the patch must name the created file");
  assert.ok(
    patch.includes("export const fresh = true;") && patch.includes("export const second = 2;"),
    `the patch must carry every line of the created file, got:\n${patch}`
  );
  assert.match(patch, /new file mode/, "a creation is recorded as a creation");

  // Regression: the two kinds that already worked must keep working.
  assert.ok(patch.includes("-export const ok = true;"), "the modification must still be carried");
  assert.ok(patch.includes("+export const ok = 2;"));
  assert.match(patch, /deleted file mode/, "the deletion must still be carried");
  assert.ok(patch.includes("-export const gone = 1;"));

  // Nothing was dropped, so nothing is reported as dropped.
  assert.equal(observation.changes.newFileCapture.unavailableReason, "");
  assert.equal(observation.changes.newFileCapture.scanScope.contentCaptured, 1);
  assert.equal(observation.changes.newFileCapture.scanScope.contentNotCaptured, 0);
});

test("a new file whose content cannot travel is named rather than dropped", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-newfile-cap-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  // Binary content and content past the per-file limit are the two cases whose
  // bytes do not go into a patch. Neither may leave silently.
  await writeFile(path.join(root, "src", "image.bin"), Buffer.from([0, 1, 2, 255, 0, 7]));
  await writeFile(path.join(root, "src", "huge.txt"), "x".repeat(NEW_FILE_CONTENT_LIMIT_BYTES + 1), "utf8");
  await writeFile(path.join(root, "src", "small.txt"), "kept\n", "utf8");

  const captured = await captureNewFileContent(root, ["src/image.bin", "src/huge.txt", "src/small.txt"]);

  assert.ok(captured.content.includes("+kept"), "a file within the limit still travels whole");
  assert.equal(captured.scanScope.contentCaptured, 1);
  assert.equal(captured.scanScope.contentNotCaptured, 2);
  assert.equal(captured.unavailableReason, "NEW_FILE_CONTENT_NOT_CAPTURED");
  assert.deepEqual(
    captured.notCaptured.map((entry) => entry.path).sort(),
    ["src/huge.txt", "src/image.bin"]
  );
  // Reading only the patch has to be enough to learn something was left out.
  assert.match(captured.content, /content is not in this patch/);
  assert.match(captured.content, /src\/huge\.txt/);
  assert.match(captured.content, /src\/image\.bin/);
  assert.ok(
    captured.notCaptured.some((entry) => /binary/i.test(entry.reason)),
    "the reason has to distinguish binary from too large"
  );
  assert.ok(captured.notCaptured.some((entry) => /exceeds/i.test(entry.reason)));
});

test("a discard that fails says so, and saying it twice says the same thing", async () => {
  const root = await gitRepo();

  // A discard that cannot remove the tree leaves this Run's edits on disk and a
  // registration pointing at them. Returning nothing would read as cleaned up,
  // so the git exit code is checked rather than assumed.
  const failing = await prepareIsolation({ projectPath: root, runId: "r1", mode: "GIT_WORKTREE" });
  const { spawnSync } = await import("node:child_process");
  spawnSync("git", ["worktree", "remove", "--force", failing.treeRoot], { cwd: root });
  const failed = await failing.discard();
  // discard stopped at the failure and reported it, which is correct and leaves
  // the temp parent behind. The test made that failure, so the test clears it.
  await forceRemoveTree(root, failing.treeRoot);
  assert.equal(failed.discarded, false);
  assert.equal(failed.unavailableReason, "ISOLATION_DISCARD_FAILED");
  assert.match(failed.detail, /is not a working tree/);

  // Called on the normal path and again from runTask's finally, so the second
  // call must report what the first one did instead of failing on its own.
  assert.deepEqual(await failing.discard(), failed, "discard is idempotent");

  const working = await prepareIsolation({ projectPath: root, runId: "r2", mode: "GIT_WORKTREE" });
  const removed = await working.discard();
  assert.equal(removed.discarded, true);
  assert.equal(removed.unavailableReason, "");
  assert.equal(await pathExists(working.treeRoot), false);

  // Nothing was isolated, so nothing was removed. Reporting discarded: true here
  // would claim a rollback that never happened.
  const none = await prepareIsolation({ projectPath: root, runId: "r3", mode: "NONE" });
  assert.deepEqual(await none.discard(), {
    discarded: false,
    unavailableReason: "",
    detail: "no isolated tree to discard"
  });
});

// A discard that fails leaves this Run's edits on disk under a path nobody will
// look at again. The reason has to reach the review gate, not stop at one field
// of one artifact — otherwise a Run whose tree leaked is accepted as if it had
// been cleaned up. The unit test above covers the outcome object; this covers
// the wiring from there to the bundle, which nothing else does.
test("a failed discard reaches the review bundle and blocks an unwaived accept", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-discard-run-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  // Holding an open handle on a file inside the worktree is what makes removal
  // fail. The holder writes its pid so this test can end it deterministically
  // rather than waiting it out — a survivor would hold the tree open and every
  // later Run test would inherit the mess.
  //
  // The pid file goes in the workspace, not the worktree. A first version wrote
  // it beside the held file; the failing discard deleted what it could reach
  // first, the pid file went with it, and the cleanup then had nothing to kill
  // while reporting success. That is the exact failure this test exists to
  // prevent, reproduced inside the test itself.
  const pidFile = path.join(root, "holder.pid");
  await writeFile(
    path.join(root, "tools", "holder.mjs"),
    [
      'import { openSync, writeFileSync } from "node:fs";',
      'openSync(process.argv[2], "w");',
      "writeFileSync(process.argv[3], String(process.pid));",
      "setTimeout(() => {}, 60000);",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, "tools", "agent.mjs"),
    [
      'import { writeFileSync, existsSync } from "node:fs";',
      'import { spawn } from "node:child_process";',
      'import path from "node:path";',
      'writeFileSync("src/app.js", "export const ok = 2;\\n");',
      'const held = path.join(process.cwd(), "src", "held.bin");',
      `const pidFile = ${JSON.stringify(pidFile)};`,
      'const child = spawn(process.execPath, ["tools/holder.mjs", held, pidFile], { detached: true, stdio: "ignore" });',
      "child.unref();",
      "for (let i = 0; i < 200 && !existsSync(pidFile); i++) {",
      "  await new Promise((r) => setTimeout(r, 25));",
      "}",
      'process.stdout.write("done\\n");',
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(path.join(root, "tools", "check.mjs"), "process.exit(0);\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  const doc = profileJson({
    workspaceId: "discard-run",
    harnessMode: "COMMAND_EXEC",
    isolationMode: "GIT_WORKTREE",
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: true }
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Leave the isolated tree undeletable",
      "scope:",
      '  include: ["src/**", "tools/**"]',
      "  exclude: []",
      "verification:",
      "  commands:",
      "    - commandId: unit-tests",
      `      command: [${JSON.stringify(process.execPath)}, "tools/check.mjs"]`,
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [IMPLEMENT]",
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
  await permitRun(root, "sample");

  let treeRoot = "";
  let holderAlive = false;
  try {
    const execution = await runTask(root, "sample");
    const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, any>;
    treeRoot = String(plan.isolation.treeRoot);

    const observation = JSON.parse(
      await readFile(path.join(execution.runDir, "harness-observation.json"), "utf8")
    ) as Record<string, any>;
    const summary = JSON.parse(
      await readFile(path.join(execution.runDir, "run-summary.json"), "utf8")
    ) as Record<string, any>;

    assert.equal(observation.workspace.isolation.discarded, false, "the holder must actually block removal");
    assert.equal(observation.workspace.isolation.unavailableReason, "ISOLATION_DISCARD_FAILED");

    // The step nothing guarded: from the observation into the Run Summary.
    assert.ok(
      (summary.normalization.unavailableReasons as string[]).includes("ISOLATION_DISCARD_FAILED"),
      `the Run Summary must carry it, got ${JSON.stringify(summary.normalization.unavailableReasons)}`
    );

    const review = await reviewRun(root, execution.result.runId, {
      decision: "REJECTED",
      reason: "recording what the bundle carries"
    });
    const bundle = JSON.parse(
      await readFile(path.join(root, ".codefleet", "reviews", review.reviewDecisionId, "evidence-bundle.json"), "utf8")
    ) as Record<string, any>;
    assert.ok(
      (bundle.unavailableReasons as string[]).includes("ISOLATION_DISCARD_FAILED"),
      "the review bundle must carry it"
    );

    // A leaked tree is something a person can go and deal with, so it is a
    // capability gap and waivable in writing — but never silently absent.
    await assert.rejects(
      () => reviewRun(root, execution.result.runId, { decision: "ACCEPTED", reason: "accept without waiving" }),
      /capability gap not waived: ISOLATION_DISCARD_FAILED/
    );

    const record = await readFile(path.join(execution.runDir, "run-record.md"), "utf8");
    assert.match(record, /not discarded/i, "the reader's one document has to say the tree is still there");
  } finally {
    // End the holder before anything else. A survivor keeps a handle on a temp
    // directory for the rest of the suite. Not finding the pid counts as still
    // running: an unknown process is not a stopped one.
    holderAlive = true;
    const pid = Number(await readFile(pidFile, "utf8").catch(() => ""));
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid);
      } catch {
        // Already gone. Nothing to end.
      }
      for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
          process.kill(pid, 0);
        } catch {
          holderAlive = false;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    await forceRemoveTree(root, treeRoot);
  }

  assert.equal(holderAlive, false, "the test must not leave a process holding a temp directory open");
  assert.equal(
    await pathExists(path.dirname(treeRoot)),
    false,
    "the deliberately undeletable tree must not outlive the test that made it"
  );
});

// ---------------------------------------------------------------- P0-2 -----

// P0-9. The gate held a check written for exactly this — "a replay that could
// not be trusted must not be read as permission" — behind a filter that a
// broken ledger never gets past, because a ledger that fails to parse yields an
// empty queue. So a Task somebody cancelled in writing ran anyway, and moving
// the objectives directory did the same thing.
async function queueGateWorkspace(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `codefleet-${name}-`));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: name }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise the queue gate against an unreadable ledger",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
      ""
    ].join("\n"),
    "utf8"
  );
  return root;
}

test("a ledger that cannot be replayed blocks the Run instead of reading as permission", async () => {
  const root = await queueGateWorkspace("queue-corrupt");
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });
  await permitRun(root, "sample");
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
    // The Task ledger records this hash; a relation naming any other value is
    // refused, so the fixture reads it rather than inventing one.
    taskRevisionHash: await contentHashOf(await findTaskPath(root, "sample")),
    actorId: "tester",
    reason: "attached"
  });
  await transitionQueueItem(root, {
    objectiveId: "auth",
    objectiveQueueItemId: "auth:sample:1",
    type: "QUEUE_ITEM_CANCELED",
    actorId: "tester",
    reason: "requirement withdrawn"
  });

  // The decision is on the record. Breaking the file must not erase it.
  await writeFile(ledgerPath(root, "auth"), "{ this is not json\n", "utf8");

  const reason = await blockedQueueReason(root, "sample");
  assert.match(String(reason), /auth/, "the objective whose ledger failed has to be named");
  assert.match(String(reason), /cannot be read/i);
  // The remedy belongs in the refusal: a Run blocked with no way forward is a
  // dead end rather than a safeguard.
  assert.match(String(reason), /repair|restore/i, "the refusal has to say what to do about it");
  await assert.rejects(() => runTask(root, "sample"), /auth/);
});

// An absent objectives directory used to mean "no opinion, so run". Execution
// permission has two halves in the model — an approved Revision and an accepted
// Objective relation — and treating absence as permission made the second half
// optional. P0-13. The unreadable case is separate and was already correct:
// unread is not the same as empty.
test("no Objective relation blocks the Run, and an unreadable queue blocks it differently", async () => {
  const root = await queueGateWorkspace("queue-unreadable");
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  // Approved, and nothing else. There is no objectives directory at all.
  const unattached = await blockedQueueReason(root, "sample", 1);
  assert.match(String(unattached), /not attached to any Objective/);
  // The refusal has to say what to do; a gate that only says no teaches people
  // to look for a way around it.
  assert.match(String(unattached), /codefleet objective attach/);
  await assert.rejects(() => runTask(root, "sample"), /not attached to any Objective/);

  // With the other half supplied, the same Run proceeds.
  await permitRun(root, "sample");
  assert.equal(await blockedQueueReason(root, "sample", 1), null);
  const ran = await runTask(root, "sample");
  assert.ok(ran.result.runId.length > 0);

  // A file where the directory should be fails readdir with ENOTDIR. Any error
  // other than "it is not there" means the queue could not be read, and that is
  // reported as unreadable rather than as an absent relation.
  await rm(path.join(root, ".codefleet", "objectives"), { recursive: true, force: true });
  await writeFile(path.join(root, ".codefleet", "objectives"), "not a directory\n", "utf8");
  await assert.rejects(
    () => blockedQueueReason(root, "sample", 1),
    /could not be read/i,
    "an unreadable objectives directory must not resolve to no opinion"
  );
  await assert.rejects(() => runTask(root, "sample"), /could not be read/i);
});

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
  await permitRun(root, "sample");

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
    // The Task ledger records this hash; a relation naming any other value is
    // refused, so the fixture reads it rather than inventing one.
    taskRevisionHash: await contentHashOf(await findTaskPath(root, "sample")),
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
