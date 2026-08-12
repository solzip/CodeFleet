// Reintegration: moving an accepted Run's changes from the isolated tree into
// the workspace.
//
// Isolation made agent work unable to reach the workspace, which was the point
// — and left no way for it to ever arrive, so a SEQUENCE Objective could not
// chain: every Task started from the same untouched workspace. P1-27.
//
// The design does not regulate this path. The choice recorded here is an
// explicit `codefleet apply <run-id>` with a ledger entry, rather than an
// ACCEPTED review applying automatically, because isolation exists so an
// agent's work does not reach the workspace without somebody deciding it
// should. Folding the two together removes that decision.
//
// The refusals are the substance. Applying half a change, or a change nobody
// accepted, is the failure this tool exists to prevent.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyRunResult, planApply } from "../src/apply.ts";
import { importLocalReview } from "../src/ledger.ts";
import { reviewRun } from "../src/review.ts";
import { runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";
import { permitRun } from "./task-ledger-fixture.ts";

// git normalizes line endings on checkout, so a byte comparison would fail on
// Windows for a reason that has nothing to do with what is being tested.
const normalize = (text: string): string => text.split("\r\n").join("\n");

async function approvedWorkspace(name: string, isolationMode = "GIT_WORKTREE"): Promise<string> {
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

  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(
      profileJson({
        workspaceId: name,
        harnessMode: "COMMAND_EXEC",
        agentRole: "INFRA_OPERATOR",
        isolationMode,
        harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: isolationMode !== "NONE" }
      }),
      null,
      2
    )}\n`,
    "utf8"
  );
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

  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });
  await permitRun(root, "sample");
  return root;
}

async function accept(root: string, runId: string): Promise<void> {
  // The Run has capability gaps this build cannot close (no harness-visible
  // command channel), so acceptance requires waiving them by hand. That is the
  // product working, not fixture noise: an unwaived gap is not acceptable.
  await reviewRun(root, runId, {
    decision: "ACCEPTED" as const,
    reason: "the change is what the contract asked for",
    actorId: "tester",
    waivedGaps: ["COMMAND_CHANNEL_NOT_HARNESS_VISIBLE", "PROVIDER_TRANSCRIPT_NOT_STRUCTURED"],
    waiveJustification: "checked the isolated tree by hand"
  });
  const localPath = path.join(root, ".codefleet", "runs", runId, "review-decision.local.json");
  const raw = await readFile(localPath, "utf8");
  const { createHash } = await import("node:crypto");
  const outcome = await importLocalReview(root, {
    objectiveId: "fixture-objective",
    runId,
    localReview: JSON.parse(raw) as Record<string, unknown>,
    localReviewRef: {
      path: `.codefleet/runs/${runId}/review-decision.local.json`,
      hash: createHash("sha256").update(raw).digest("hex")
    },
    reason: "imported",
    actorId: "tester"
  });
  assert.equal(outcome.failedPhase, null, outcome.failureMessage);
}

test("an accepted isolated Run is applied to the workspace and recorded", async () => {
  const root = await approvedWorkspace("apply-happy");
  const execution = await runTask(root, "sample");
  assert.equal(execution.result.status, "SUCCEEDED");

  const appPath = path.join(root, "src", "app.js");
  // The whole point of isolation: the agent's edit is not here yet.
  assert.equal(normalize(await readFile(appPath, "utf8")), "export const ok = true;\n");

  await accept(root, execution.result.runId);

  const plan = await planApply(root, execution.result.runId);
  assert.equal(plan.blockedReason, "", "an accepted isolated Run with a clean workspace is applicable");
  assert.equal(plan.taskId, "sample");
  assert.equal(plan.taskRevision, 1);

  const outcome = await applyRunResult(root, {
    runId: execution.result.runId,
    actorId: "tester",
    reason: "accepted, carrying it into the workspace"
  });
  assert.equal(outcome.failedPhase, null, outcome.failureMessage);
  assert.equal(normalize(await readFile(appPath, "utf8")), "export const ok = 2;\n", "the change arrived");

  // Recorded, and repeating is a no-op rather than a second application.
  const after = await planApply(root, execution.result.runId);
  assert.equal(after.alreadyApplied, true);
  const repeat = await applyRunResult(root, {
    runId: execution.result.runId,
    actorId: "tester",
    reason: "again"
  });
  assert.equal(repeat.failedPhase, null, repeat.failureMessage);
  assert.equal(normalize(await readFile(appPath, "utf8")), "export const ok = 2;\n", "applied once, not twice");
});

test("a Run nobody accepted is not applied", async () => {
  const root = await approvedWorkspace("apply-unreviewed");
  const execution = await runTask(root, "sample");
  const appPath = path.join(root, "src", "app.js");

  // No review at all: the decision this command acts on does not exist.
  const unreviewed = await planApply(root, execution.result.runId);
  assert.match(unreviewed.blockedReason, /no review decision/);
  assert.match(unreviewed.blockedReason, /codefleet review/, "the refusal says what is missing");
  await assert.rejects(
    () => applyRunResult(root, { runId: execution.result.runId, actorId: "t", reason: "forcing it" }),
    /no review decision/
  );
  assert.equal(normalize(await readFile(appPath, "utf8")), "export const ok = true;\n", "a refusal changes nothing");

  // Reviewing it as REJECTED does not change that, but not for the reason an
  // earlier version of this comment gave.
  //
  // deriveLocalReviewStatus sends a non-ACCEPTED decision to DEGRADED_RECORDED
  // only when the evidence bundle is DEGRADED; otherwise it returns
  // MIGRATION_READY and import accepts it. What makes every rejection
  // unimportable today is that this build has no harness-visible command
  // channel, so every Run carries at least one capability gap and every bundle
  // is degraded. That is a property of the build, not of the review model — see
  // the test below, which covers the branch this makes unreachable.
  await reviewRun(root, execution.result.runId, {
    decision: "REJECTED" as const,
    reason: "not what was asked for",
    actorId: "tester"
  });
  const localPath = path.join(root, ".codefleet", "runs", execution.result.runId, "review-decision.local.json");
  const raw = await readFile(localPath, "utf8");
  const { createHash } = await import("node:crypto");
  const imported = await importLocalReview(root, {
    objectiveId: "fixture-objective",
    runId: execution.result.runId,
    localReview: JSON.parse(raw) as Record<string, unknown>,
    localReviewRef: {
      path: `.codefleet/runs/${execution.result.runId}/review-decision.local.json`,
      hash: createHash("sha256").update(raw).digest("hex")
    },
    reason: "imported",
    actorId: "tester"
  });
  assert.equal(imported.failedPhase, "M2_PRECHECK");
  assert.match(imported.failureMessage, /DEGRADED_RECORDED cannot be imported/);

  const rejected = await planApply(root, execution.result.runId);
  assert.match(rejected.blockedReason, /no review decision/);
  assert.equal(normalize(await readFile(appPath, "utf8")), "export const ok = true;\n");
});

test("a workspace that moved since the Run is a refusal, not a merge", async () => {
  const root = await approvedWorkspace("apply-conflict");
  const execution = await runTask(root, "sample");
  await accept(root, execution.result.runId);

  // Somebody edited the same line while the Run was in flight. The patch
  // describes content that is no longer there, and guessing which side wins is
  // not this tool's job.
  const appPath = path.join(root, "src", "app.js");
  await writeFile(appPath, "export const ok = 99;\n", "utf8");

  // Refused in the mutation's precheck, so it is reported as an outcome rather
  // than thrown — the same shape as an approval refusal.
  const outcome = await applyRunResult(root, {
    runId: execution.result.runId,
    actorId: "t",
    reason: "apply anyway"
  });
  assert.equal(outcome.failedPhase, "M2_PRECHECK");
  assert.equal(outcome.applied, false, "nothing was written");
  assert.match(outcome.failureMessage, /does not apply to the workspace as it is now/);
  // git's own account of what did not fit, not a summary of it.
  assert.match(outcome.failureMessage, /git reported:/);
  assert.equal(normalize(await readFile(appPath, "utf8")), "export const ok = 99;\n", "the local edit survives intact");
});

test("a Run that edited the workspace directly has nothing to apply", async () => {
  const root = await approvedWorkspace("apply-no-isolation", "NONE");
  const execution = await runTask(root, "sample");
  await accept(root, execution.result.runId);

  // Without isolation the change already landed. Applying the diff on top would
  // apply the same change twice.
  const plan = await planApply(root, execution.result.runId);
  assert.match(plan.blockedReason, /ran without isolation/);
  assert.match(plan.blockedReason, /nothing to apply/);
});

// The reason reintegration exists: without it, isolation meant every Task in a
// SEQUENCE started from the same untouched workspace, so a second Task could
// never build on the first. S5-2.
test("a second Run starts from the applied result of the first", async () => {
  const root = await approvedWorkspace("apply-chain");

  const first = await runTask(root, "sample");
  await accept(root, first.result.runId);
  const applied = await applyRunResult(root, {
    runId: first.result.runId,
    actorId: "tester",
    reason: "carrying the first result forward"
  });
  assert.equal(applied.failedPhase, null, applied.failureMessage);

  // Commit it, the way a person would before the next Task: the isolated tree
  // for the second Run is created from the repository, so uncommitted work does
  // not travel into it. That boundary is worth stating rather than assuming.
  const { spawnSync } = await import("node:child_process");
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"], { cwd: root });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "applied"], { cwd: root });

  // A second Run of the same contract now observes the first result as its
  // starting point. Its agent writes the same content, so the change it
  // observes is empty — which is exactly the evidence that it started from the
  // applied state rather than from the original.
  const second = await runTask(root, "sample");
  assert.equal(second.result.status, "SUCCEEDED");
  const patch = await readFile(path.join(root, ".codefleet", "runs", second.result.runId, "git-diff.patch"), "utf8");
  assert.equal(patch.trim(), "", "the second Run began where the first one left off");

  // And the decision is checked before the content: an unreviewed Run is
  // refused for being unreviewed, not for being empty. That ordering is
  // deliberate — "nobody decided this" is the more useful thing to hear.
  const plan = await planApply(root, second.result.runId);
  assert.match(plan.blockedReason, /no review decision/);

  await accept(root, second.result.runId);
  const reviewed = await planApply(root, second.result.runId);
  assert.match(reviewed.blockedReason, /changed nothing/, "a Run with no change has nothing to apply");
});

// The guard that stops a rejected Run from being applied, covered directly.
//
// Nothing reached it: every Run in this build carries a capability gap, so every
// evidence bundle is degraded, so every non-ACCEPTED review becomes
// DEGRADED_RECORDED and import refuses it. The Objective ledger therefore only
// ever holds ACCEPTED decisions today, and the check reads as dead code.
//
// It stops being dead the moment a harness-visible command channel exists. A
// non-degraded bundle makes deriveLocalReviewStatus return MIGRATION_READY for a
// REJECTED decision, import accepts it, and this branch becomes the only thing
// between a rejected Run and the workspace. Found by disabling each new gate in
// turn and counting which tests noticed: this one had none.
test("a rejected decision in the ledger does not authorise an apply", async () => {
  const root = await approvedWorkspace("apply-rejected-ledger");
  const execution = await runTask(root, "sample");
  await accept(root, execution.result.runId);

  // Applicable, so the only thing changed below is the decision itself.
  assert.equal((await planApply(root, execution.result.runId)).blockedReason, "");

  // The decision is rewritten in the ledger to REJECTED, standing in for the
  // import path that a harness-visible command channel would open. Editing the
  // ledger directly is what makes the branch reachable at all.
  const ledger = path.join(root, ".codefleet", "objectives", "fixture-objective", "ledger.jsonl");
  const rewritten = (await readFile(ledger, "utf8"))
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) {
        return line;
      }
      const event = JSON.parse(line) as Record<string, any>;
      if (event.type === "RUN_REVIEW_DECIDED" && event.payload?.runId === execution.result.runId) {
        event.payload.decision = "REJECTED";
        return JSON.stringify(event);
      }
      return line;
    })
    .join("\n");
  await writeFile(ledger, rewritten, "utf8");

  const plan = await planApply(root, execution.result.runId);
  assert.match(plan.blockedReason, /reviewed as REJECTED, not ACCEPTED/);

  const appPath = path.join(root, "src", "app.js");
  const before = await readFile(appPath, "utf8");
  await assert.rejects(
    () => applyRunResult(root, { runId: execution.result.runId, actorId: "t", reason: "apply a rejection" }),
    /not ACCEPTED/
  );
  assert.equal(await readFile(appPath, "utf8"), before, "the workspace is untouched");
});
