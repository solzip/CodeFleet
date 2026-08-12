// The approval binds a contract, and the model says that contract includes the
// guardrails. Until now it bound the Task file alone, so the guardrail that
// decides whether the agent edits an isolated tree or the workspace itself sat
// outside the thing being approved: approve under GIT_WORKTREE, flip the Profile
// to NONE, and the same approval carried a materially different execution.
//
// The design says the same thing from the other direction — one of its
// conditions for approving a Draft into a Revision is "Project Profile보다
// 권한 완화 없음" — and run.ts already writes TASK_AND_PROFILE_MUST_MATCH into
// every Run Plan. P0-12.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTask } from "../src/run.ts";
import { approveTask, contentHashOf, guardrailHashOf, replayApproval } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

async function workspace(name: string, isolation = "GIT_WORKTREE"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `codefleet-${name}-`));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  await writeFile(
    path.join(root, "tools", "agent.mjs"),
    'import { writeFileSync } from "node:fs";\nwriteFileSync("src/app.js", "export const ok = 2;\\n");\nprocess.stdout.write("done\\n");\n',
    "utf8"
  );
  await writeFile(path.join(root, "tools", "check.mjs"), "process.exit(0);\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  const doc = profileJson({
    workspaceId: name,
    harnessMode: "COMMAND_EXEC",
    agentRole: "INFRA_OPERATOR",
    isolationMode: isolation,
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: true }
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample",
      "projectPath: .",
      "agentRole: INFRA_OPERATOR",
      "goal: edit app.js",
      "scope:",
      '  include: ["src/**", "tools/**"]',
      "  exclude: []",
      "verification:",
      "  commands:",
      "    - commandId: c",
      `      command: [${JSON.stringify(process.execPath)}, "tools/check.mjs"]`,
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [IMPLEMENT]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );
  return root;
}

const editProfile = async (root: string, mutate: (doc: any) => void): Promise<void> => {
  const p = path.join(root, ".codefleet", "config.json");
  const doc = JSON.parse(await readFile(p, "utf8"));
  mutate(doc);
  await writeFile(p, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
};

test("changing the guardrail the Task was approved under revokes the approval", async () => {
  const root = await workspace("guardrail-bound");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approved under GIT_WORKTREE" });

  assert.equal((await replayApproval(root, "sample", await contentHashOf(taskPath))).blockedReason, "");

  // The Task file is untouched. Only the guardrail moves.
  await editProfile(root, (doc) => {
    doc.defaults.run.isolationMode = "NONE";
    doc.policies.harness.requireIsolationForMutation = false;
  });

  const after = await replayApproval(root, "sample", await contentHashOf(taskPath));
  assert.equal(
    after.blockedReason,
    "PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL",
    "the approval named a guardrail, and that guardrail is no longer in force"
  );
  // Naming which half moved is the difference between an actionable refusal and
  // a puzzle: the Task did not change.
  await assert.rejects(() => runTask(root, "sample"), /PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL/);
});

test("an edit that cannot change execution does not revoke the approval", async () => {
  const root = await workspace("guardrail-irrelevant");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approved" });

  // Project name is not a guardrail. Binding the whole Profile would make every
  // approval in the workspace collapse on an unrelated edit.
  await editProfile(root, (doc) => {
    doc.project.name = "renamed after approval";
  });

  assert.equal(
    (await replayApproval(root, "sample", await contentHashOf(taskPath))).blockedReason,
    "",
    "only the guardrail projection is part of the contract, not the whole file"
  );
});

test("the two halves of the approval target are told apart", async () => {
  const root = await workspace("guardrail-halves");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approved" });

  // Editing the Task still reports the Task, not the guardrail.
  const original = await readFile(taskPath, "utf8");
  await writeFile(taskPath, original.replace("goal: edit app.js", "goal: something else"), "utf8");
  assert.equal(
    (await replayApproval(root, "sample", await contentHashOf(taskPath))).blockedReason,
    "TASK_CONTENT_CHANGED_AFTER_APPROVAL"
  );
  await writeFile(taskPath, original, "utf8");
  assert.equal((await replayApproval(root, "sample", await contentHashOf(taskPath))).blockedReason, "");

  // The guardrail hash is a projection: it must be stable across reads and must
  // move when a guardrail moves.
  const before = await guardrailHashOf(root);
  assert.equal(before, await guardrailHashOf(root), "the projection is deterministic");
  await editProfile(root, (doc) => {
    doc.policies.commands.deniedCommands = [{ argv: ["rm"] }];
  });
  assert.notEqual(await guardrailHashOf(root), before, "command policy is a guardrail");
});

test("a Run under an unchanged guardrail still runs", async () => {
  const root = await workspace("guardrail-unchanged");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approved" });
  const execution = await runTask(root, "sample");
  assert.equal(execution.result.status, "SUCCEEDED");

  // The Run Plan records the guardrail it ran under, so the approval and the
  // execution can be compared after the fact.
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, any>;
  assert.equal(typeof plan.approval.guardrailHash, "string");
  assert.ok(plan.approval.guardrailHash.length > 0);
  assert.equal(plan.approval.guardrailHash, await guardrailHashOf(root));
});
