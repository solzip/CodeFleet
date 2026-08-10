import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reviewRun } from "../src/review.ts";
import { runTask } from "../src/run.ts";

async function seedWorkspace(): Promise<{ root: string; runId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-review-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ version: "0.1.0", defaultAgent: "codex", mode: "dry-run", workspace: { id: "review-test" } })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise review artifacts",
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

  const execution = await runTask(root, "sample");
  return { root, runId: execution.result.runId };
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

test("review writes an evidence bundle and a local decision that is not final truth", async () => {
  const { root, runId } = await seedWorkspace();

  const execution = await reviewRun(root, runId, {
    decision: "NEEDS_CHANGES",
    reason: "dry-run produced no verification evidence"
  });

  const localReview = await readJson(path.join(root, ".codefleet", "runs", runId, "review-decision.local.json"));
  assert.equal(localReview.documentKind, "LOCAL_REVIEW_DECISION");
  assert.equal(localReview.finalDecisionTruth, false);
  assert.equal(localReview.migrationTarget, "RUN_REVIEW_DECIDED");
  assert.equal(localReview.decision, "NEEDS_CHANGES");

  const bundle = await readJson(path.join(root, execution.bundlePath));
  assert.equal(bundle.documentKind, "REVIEW_EVIDENCE_BUNDLE");
  assert.equal(bundle.runId, runId);
  assert.equal(bundle.reviewDecisionId, execution.reviewDecisionId);
});

test("local review never produces VERIFIED or queue progression", async () => {
  const { root, runId } = await seedWorkspace();

  await reviewRun(root, runId, { decision: "REJECTED", reason: "not acceptable" });

  const raw = await readFile(
    path.join(root, ".codefleet", "runs", runId, "review-decision.local.json"),
    "utf8"
  );
  const localReview = JSON.parse(raw) as Record<string, unknown>;
  const safeguards = localReview.safeguards as Record<string, unknown>;

  assert.equal(safeguards.canProduceVerified, false);
  assert.equal(safeguards.canProgressQueue, false);
  assert.equal(safeguards.acceptanceEvidence, false);
  assert.ok(!raw.includes("VERIFIED\""), "local review must not record a VERIFIED state");
  assert.equal(localReview.localReviewStatus === "MIGRATION_READY", false);
});

test("ACCEPTED is refused when the verification gate is not satisfied", async () => {
  const { root, runId } = await seedWorkspace();

  await assert.rejects(
    () => reviewRun(root, runId, { decision: "ACCEPTED", reason: "looks fine" }),
    /ACCEPTED local review is not allowed/
  );
});

test("review refuses an unknown decision and a missing reason", async () => {
  const { root, runId } = await seedWorkspace();

  await assert.rejects(
    () => reviewRun(root, runId, { decision: "APPROVED" as never, reason: "x" }),
    /--decision must be ACCEPTED, REJECTED, or NEEDS_CHANGES/
  );
  await assert.rejects(
    () => reviewRun(root, runId, { decision: "REJECTED", reason: "   " }),
    /Missing required option: --reason/
  );
});

test("a tampered run artifact makes the local review MIGRATION_BLOCKED", async () => {
  const { root, runId } = await seedWorkspace();
  const observationPath = path.join(root, ".codefleet", "runs", runId, "harness-observation.json");
  const observation = await readJson(observationPath);
  observation.tampered = true;
  await writeFile(observationPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");

  const execution = await reviewRun(root, runId, {
    decision: "REJECTED",
    reason: "evidence no longer matches recorded hashes"
  });

  assert.equal(execution.localReviewStatus, "MIGRATION_BLOCKED");

  const bundle = await readJson(path.join(root, execution.bundlePath));
  const hashChecks = bundle.hashChecks as { path: string; valid: boolean }[];
  assert.ok(hashChecks.some((entry) => !entry.valid), "tampered artifact must fail its hash check");
});

test("review does not mutate Run Trace artifacts", async () => {
  const { root, runId } = await seedWorkspace();
  const runDir = path.join(root, ".codefleet", "runs", runId);
  const names = ["run-plan.json", "adapter-request.json", "harness-observation.json", "adapter-result.json", "run-summary.json"];
  const before = new Map<string, string>();
  for (const name of names) {
    before.set(name, await readFile(path.join(runDir, name), "utf8"));
  }

  await reviewRun(root, runId, { decision: "REJECTED", reason: "no changes to trace" });

  for (const name of names) {
    assert.equal(await readFile(path.join(runDir, name), "utf8"), before.get(name), `${name} must not change`);
  }
});

test("a second review creates a new reviewDecisionId", async () => {
  const { root, runId } = await seedWorkspace();

  const first = await reviewRun(root, runId, { decision: "NEEDS_CHANGES", reason: "first pass" });
  const second = await reviewRun(root, runId, {
    decision: "REJECTED",
    reason: "second pass",
    supersedesLocalReviewId: first.localReviewId
  });

  assert.notEqual(first.reviewDecisionId, second.reviewDecisionId);

  const localReview = await readJson(path.join(root, ".codefleet", "runs", runId, "review-decision.local.json"));
  assert.equal(localReview.supersedesLocalReviewId, first.localReviewId);
});

test("a capability gap can be waived by a human, item by item", async () => {
  const { root, runId } = await seedVerifiedWorkspace();

  await assert.rejects(
    () => reviewRun(root, runId, { decision: "ACCEPTED", reason: "looks fine" }),
    /capability gap not waived/
  );

  const summary = await readJson(path.join(root, ".codefleet", "runs", runId, "run-summary.json"));
  const gaps = (summary.normalization as { unavailableReasons: string[] }).unavailableReasons;

  const execution = await reviewRun(root, runId, {
    decision: "ACCEPTED",
    reason: "checked the repository directly",
    waivedGaps: gaps,
    waiveJustification: "reviewed git status and diff by hand"
  });

  assert.equal(execution.decision, "ACCEPTED");
  assert.equal(execution.evidenceCompleteness, "WAIVED_INCOMPLETE");
  assert.equal(execution.localReviewStatus, "MIGRATION_READY_WAIVED");

  const localReview = await readJson(path.join(root, ".codefleet", "runs", runId, "review-decision.local.json"));
  const waived = localReview.waivedCapabilityGaps as { reason: string; justification: string }[];
  assert.equal(waived.length, gaps.length, "every waived gap is recorded by name");
  assert.ok(waived.every((entry) => entry.justification.length > 0));
});

test("an evidence defect cannot be waived by anyone", async () => {
  const { root, runId } = await seedWorkspace();
  const observationPath = path.join(root, ".codefleet", "runs", runId, "harness-observation.json");
  const observation = await readJson(observationPath);
  observation.tampered = true;
  await writeFile(observationPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");

  const summary = await readJson(path.join(root, ".codefleet", "runs", runId, "run-summary.json"));
  const gaps = (summary.normalization as { unavailableReasons: string[] }).unavailableReasons;
  const hashRef = `HASH_INVALID:.codefleet/runs/${runId}/harness-observation.json`;

  // Waive everything, including the hash defect itself. It must still refuse.
  await assert.rejects(
    () =>
      reviewRun(root, runId, {
        decision: "ACCEPTED",
        reason: "I checked it myself",
        waivedGaps: [...gaps, hashRef],
        waiveJustification: "trying to waive a hash mismatch"
      }),
    /evidence defect cannot be waived/
  );
});

test("waiving a gap without a justification is rejected", async () => {
  const { root, runId } = await seedWorkspace();
  const summary = await readJson(path.join(root, ".codefleet", "runs", runId, "run-summary.json"));
  const gaps = (summary.normalization as { unavailableReasons: string[] }).unavailableReasons;

  await assert.rejects(
    () =>
      reviewRun(root, runId, {
        decision: "ACCEPTED",
        reason: "   ",
        waivedGaps: gaps,
        waiveJustification: "   "
      }),
    /Missing required option: --reason/
  );
});

// A workspace whose Run reaches DONE with a Harness-executed verification and an
// evaluated path policy, so only capability gaps remain between it and ACCEPTED.
async function seedVerifiedWorkspace(): Promise<{ root: string; runId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-verified-"));
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
    `${JSON.stringify({
      version: "0.1.0",
      defaultAgent: "codex",
      mode: "execute",
      agents: { codex: { command: process.execPath, args: ["tools/agent.mjs"] } },
      workspace: { id: "verified-test" }
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Reach DONE with verification",
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
    ].join("\n"),
    "utf8"
  );

  const execution = await runTask(root, "sample");
  return { root, runId: execution.result.runId };
}
