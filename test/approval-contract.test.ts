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
import { permitRun } from "./task-ledger-fixture.ts";

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
  await permitRun(root, "sample");

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
  await permitRun(root, "sample");

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
  await permitRun(root, "sample");

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
  await permitRun(root, "sample");
  const execution = await runTask(root, "sample");
  assert.equal(execution.result.status, "SUCCEEDED");

  // The Run Plan records the guardrail it ran under, so the approval and the
  // execution can be compared after the fact.
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, any>;
  assert.equal(typeof plan.approval.guardrailHash, "string");
  assert.ok(plan.approval.guardrailHash.length > 0);
  assert.equal(plan.approval.guardrailHash, await guardrailHashOf(root));
});

// A contract that cannot execute must not be approvable. The design lists ten
// conditions for turning a Draft into a Revision; the code checked roughly the
// schema, so a Task whose role forbids running commands could be approved with
// verification commands attached and then fail at the adapter. That is the
// default profile's behaviour: init writes BACKEND_IMPLEMENTER, whose ceiling is
// WORKSPACE_EDIT, and the adapter refuses to launch without command execution.
// P1-36, and the root of P1-32.
test("a contract whose role forbids its own verification cannot be approved", async () => {
  const root = await workspace("infeasible");
  const taskPath = await findTaskPath(root, "sample");
  const original = await readFile(taskPath, "utf8");
  await writeFile(taskPath, original.replace("agentRole: INFRA_OPERATOR", "agentRole: BACKEND_IMPLEMENTER"), "utf8");

  const outcome = await approveTask(root, {
    taskId: "sample",
    taskPath,
    actorId: "tester",
    reason: "role cannot run the commands this contract declares"
  });

  assert.notEqual(outcome.failedPhase, null, "approval must refuse a contract that cannot run");
  assert.match(
    String(outcome.failureMessage),
    /BACKEND_IMPLEMENTER/,
    "the refusal has to name the role that caused it"
  );
  assert.match(String(outcome.failureMessage), /verification/i);

  // And it stays unapproved rather than half-approved.
  const state = await replayApproval(root, "sample", await contentHashOf(taskPath));
  assert.equal(state.approvedRevision, null);
});

// S1-1 and S1-3 read the same two inputs and could disagree. Feasibility is
// decided once, at approval; if the Profile could later drop below the ceiling
// the contract needs, an approval given over a feasible contract would carry an
// infeasible one. The guardrail half of the approval target is what stops it,
// so this is the seam between the two fixes rather than either one alone.
test("lowering the Profile below what the contract needs revokes the approval", async () => {
  const root = await workspace("feasibility-drift");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "feasible at approval time" });
  await permitRun(root, "sample");
  assert.equal((await replayApproval(root, "sample", await contentHashOf(taskPath))).blockedReason, "");

  // The contract still declares verification commands. The ceiling that let it
  // run them is what moves.
  await editProfile(root, (doc) => {
    doc.defaults.task.harnessMode = "WORKSPACE_EDIT";
  });

  assert.equal(
    (await replayApproval(root, "sample", await contentHashOf(taskPath))).blockedReason,
    "PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL",
    "an approval must not survive into a Profile that cannot execute what it approved"
  );

  // And re-approving under the lowered Profile is refused rather than granted:
  // otherwise the operator's way out of the block is to create the exact
  // unexecutable approval S1-3 exists to prevent.
  const outcome = await approveTask(root, {
    taskId: "sample",
    taskPath,
    actorId: "tester",
    reason: "re-approve under the lowered profile"
  });
  assert.notEqual(outcome.failedPhase, null, "re-approval must not launder an infeasible contract");
  assert.match(String(outcome.failureMessage), /WORKSPACE_EDIT/);
});

test("a contract with no verification commands is approvable under any role", async () => {
  const root = await workspace("no-verification");
  const taskPath = await findTaskPath(root, "sample");
  const original = await readFile(taskPath, "utf8");
  // Drop the verification block and lower the role: nothing needs commands.
  const noVerify = original
    .replace("agentRole: INFRA_OPERATOR", "agentRole: DOCS_WRITER")
    .replace(/verification:\n(  .*\n)+/, "");
  await writeFile(taskPath, noVerify, "utf8");

  const outcome = await approveTask(root, {
    taskId: "sample",
    taskPath,
    actorId: "tester",
    reason: "no commands to run"
  });
  assert.equal(outcome.failedPhase, null, outcome.failureMessage);
});

// Every Run Plan declares resume.sourceHashPolicy = TASK_AND_PROFILE_MUST_MATCH,
// and nothing read it: production 1, consumption 0. Resume does not exist yet,
// so the field cannot be consumed by the feature it describes — but a
// declaration nobody checks is prose in a JSON file, and this Run Plan is
// evidence. This ties the words to the two refusals that make them true. P1-43.
test("the Run Plan's declared source-hash policy is the one actually enforced", async () => {
  const root = await workspace("resume-policy");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approved" });
  await permitRun(root, "sample");

  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<
    string,
    any
  >;
  assert.equal(plan.resume.sourceHashPolicy, "TASK_AND_PROFILE_MUST_MATCH");
  assert.equal(plan.resume.allowMutation, false);

  // "TASK ... MUST MATCH" — the Task half.
  const approvedSource = await readFile(taskPath, "utf8");
  await writeFile(taskPath, approvedSource.replace("goal: edit app.js", "goal: moved"), "utf8");
  await assert.rejects(() => runTask(root, "sample"), /TASK_CONTENT_CHANGED_AFTER_APPROVAL/);
  await writeFile(taskPath, approvedSource, "utf8");

  // "... AND PROFILE MUST MATCH" — the guardrail half. Both are required for
  // the declaration to be true, and only checking one would leave it half prose.
  await editProfile(root, (doc) => {
    doc.defaults.run.isolationMode = "NONE";
    doc.policies.harness.requireIsolationForMutation = false;
  });
  await assert.rejects(() => runTask(root, "sample"), /PROFILE_GUARDRAILS_CHANGED_AFTER_APPROVAL/);
});
