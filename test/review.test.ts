import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reviewRun } from "../src/review.ts";
import { runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { coversRule } from "./rule-coverage.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

const BUNDLE = "REVIEW_DECISION_REQUIRES_FROZEN_EVIDENCE_BUNDLE";
const HASH = "REVIEW_EVIDENCE_ABSENCE_AND_HASH_MISMATCH_HAVE_DIFFERENT_EFFECTS";
const RECORD = "RUN_RECORD_IS_LOCAL_DERIVED_NARRATIVE";
const MIG = "LOCAL_REVIEW_MIGRATION_STATUS_IS_DERIVED";
const V02 = "REVIEW_MODEL_V02_IS_LOCAL_MIGRATION_PATH";
const SUMMARY_LAYOUT = "RUN_SUMMARY_VERIFICATION_AND_LOCAL_REVIEW_LAYOUT_FIXED";

// Running now requires an approval bound to the exact task content, so every
// fixture approves before it runs.
async function approveForTest(root: string, taskId: string): Promise<void> {
  await approveTask(root, {
    taskId,
    taskPath: await findTaskPath(root, taskId),
    actorId: "tester",
    reason: "approved for test"
  });
}

async function seedWorkspace(): Promise<{ root: string; runId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-review-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "review-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
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

  await approveForTest(root, "sample");

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

  coversRule(BUNDLE, "ReviewEvidenceBundle references the Run evidence considered at decision time");
  coversRule(BUNDLE, "ReviewEvidenceBundle records observedResultSnapshot and observedCheckSnapshot");
  coversRule(BUNDLE, "ReviewEvidenceBundle records verificationGateResult calculated by CodeFleet");
  coversRule(V02, "normal v0.2 review creates ReviewEvidenceBundle before writing review-decision.local.json.");
  coversRule(
    V02,
    "review-decision.local.json has finalDecisionTruth false and migrationTarget RUN_REVIEW_DECIDED."
  );
  coversRule(SUMMARY_LAYOUT, "local review artifact is explicitly marked finalDecisionTruth false");
  coversRule(SUMMARY_LAYOUT, "local review artifact contains migrationTarget RUN_REVIEW_DECIDED");
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

  coversRule(RECORD, "run-record.md is not decision truth and cannot produce VERIFIED or queue progression.");
  coversRule(MIG, "DEGRADED_RECORDED is derived only from REJECTED or NEEDS_CHANGES with explicit degraded or unavailable evidence.");
});

test("ACCEPTED is refused when the verification gate is not satisfied", async () => {
  const { root, runId } = await seedWorkspace();

  await assert.rejects(
    () => reviewRun(root, runId, { decision: "ACCEPTED", reason: "looks fine" }),
    /ACCEPTED local review is not allowed/
  );

  coversRule(
    V02,
    "ACCEPTED local review requires successful normalized result, satisfied or waived verification gate, and no unresolved path violation."
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

  coversRule(
    V02,
    "a CAPABILITY_GAP blocks ACCEPTED unless a human waives that specific reason with a justification."
  );
  coversRule(
    V02,
    "a waived ACCEPTED records evidenceCompleteness WAIVED_INCOMPLETE and lists every waived reason."
  );
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

  coversRule(V02, "an EVIDENCE_DEFECT in the bundle blocks ACCEPTED and cannot be waived by any actor.");
  coversRule(
    V02,
    "a local review degraded by EVIDENCE_DEFECT cannot be ACCEPTED and cannot be used as acceptance evidence."
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
    `${JSON.stringify(profileJson({ workspaceId: "verified-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
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

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  return { root, runId: execution.result.runId };
}

test("a review that did not waive its gaps records INCOMPLETE, not COMPLETE", async () => {
  const { root, runId } = await seedWorkspace();

  const execution = await reviewRun(root, runId, {
    decision: "REJECTED",
    reason: "not acceptable"
  });

  assert.equal(execution.evidenceCompleteness, "INCOMPLETE");

  const localReview = await readJson(path.join(root, ".codefleet", "runs", runId, "review-decision.local.json"));
  assert.equal(localReview.evidenceCompleteness, "INCOMPLETE");
  assert.notEqual(localReview.bundleStatus, "COMPLETE");

  coversRule(V02, "review-decision.local.json references ReviewEvidenceBundle when bundleStatus is COMPLETE.");
});

test("an evidence defect is reported once, naming the artifact", async () => {
  const { root, runId } = await seedWorkspace();
  const observationPath = path.join(root, ".codefleet", "runs", runId, "harness-observation.json");
  const observation = await readJson(observationPath);
  observation.tampered = true;
  await writeFile(observationPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");

  let message = "";
  try {
    await reviewRun(root, runId, { decision: "ACCEPTED", reason: "ship it" });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  const hashLines = message.split("\n").filter((line) => line.includes("hash") || line.includes("HASH_INVALID"));
  assert.equal(hashLines.length, 1, `hash invalidity must be reported once, got:\n${message}`);
  assert.match(hashLines[0], /HASH_INVALID:.*harness-observation\.json/);

  coversRule(HASH, "referenced artifact hash mismatch is REVIEW_INTEGRITY failure");
  coversRule(HASH, "hash mismatch makes the Review Decision ineffective until corrected");
  coversRule(MIG, "MIGRATION_BLOCKED is derived when required migration fields or hashes are invalid.");
});

test("the decision record cannot state a claim its own bundle contradicts", async () => {
  const { root, runId } = await seedWorkspace();
  const execution = await reviewRun(root, runId, { decision: "REJECTED", reason: "not acceptable" });

  const localReviewPath = path.join(root, ".codefleet", "runs", runId, "review-decision.local.json");
  const localReview = await readJson(localReviewPath);
  const bundle = await readJson(path.join(root, execution.bundlePath));

  // Every value the record copies must be the value the bundle holds. This is
  // the artifact that migrates into an append-only ledger, so a false claim here
  // cannot be corrected later.
  for (const key of [
    "bundleStatus",
    "observedResultSnapshot",
    "observedCheckSnapshot",
    "verificationGateResult",
    "verificationGateReason",
    "computedRisk"
  ]) {
    assert.equal(localReview[key], bundle[key], `${key} must match the evidence bundle`);
  }
  assert.deepEqual(localReview.pathViolationSummary, bundle.pathViolationSummary);
  assert.equal(
    (localReview.runSummaryRef as { contentHash: string }).contentHash,
    (bundle.runSummaryRef as { contentHash: string }).contentHash
  );

  // And a status that outruns the evidence is refused.
  assert.notEqual(
    [localReview.localReviewStatus, localReview.evidenceCompleteness].join("/"),
    "MIGRATION_READY/INCOMPLETE"
  );

  coversRule(BUNDLE, "ReviewEvidenceBundle records computedRisk and commandEvidenceAuthority");
  coversRule(BUNDLE, "ReviewEvidenceBundle records pathViolationSummary");
  coversRule(BUNDLE, "ReviewEvidenceBundle stores hashes for referenced artifacts when available");
});

test("every Run leaves a readable record, and it does not hide what is unknown", async () => {
  const { root, runId } = await seedWorkspace();
  const recordPath = path.join(root, ".codefleet", "runs", runId, "run-record.md");

  // Written by the Run itself, with no export requested.
  let text = await readFile(recordPath, "utf8");
  assert.match(text, new RegExp(`# Run ${runId}`));
  assert.match(text, /## What this Run was for/);
  assert.match(text, /## What is not known/);

  const summary = await readJson(path.join(root, ".codefleet", "runs", runId, "run-summary.json"));
  const gaps = (summary.normalization as { unavailableReasons: string[] }).unavailableReasons;
  for (const gap of gaps) {
    assert.ok(text.includes(gap), `run-record must list ${gap} rather than summarise it away`);
  }
  assert.match(text, /No review has been recorded/);

  await reviewRun(root, runId, { decision: "REJECTED", reason: "not acceptable" });

  // The review outcome joins the same record, so one file stays the whole story.
  text = await readFile(recordPath, "utf8");
  assert.match(text, /decision\s*:\s*REJECTED/);
  assert.match(text, /Reason: not acceptable/);
  assert.match(text, /not final decision truth/);

  coversRule(RECORD, "run-record.md is created for every Run, independently of any export.");
  coversRule(RECORD, "run-record.md is derived from existing artifacts and states no claim they do not carry.");
  coversRule(
    RECORD,
    "run-record.md lists every unavailableReason with its CAPABILITY_GAP or EVIDENCE_DEFECT classification."
  );
});
