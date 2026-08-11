// policies.autoAdvanceOnDone.
//
// This is the one switch that lets CodeFleet accept its own work, so the tests
// are about what it cannot do: it cannot be raised by anything downstream of the
// Profile, and on its own it accepts nothing.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateAutoReview } from "../src/auto-review.ts";
import { loadConfig } from "../src/config.ts";
import { loadProfile, PROFILE_POLICY_SCALAR_KEYS } from "../src/profile.ts";
import { mergeAutoAdvanceOnDone, runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";

const AUTO = "PROFILE_POLICY_AUTO_ADVANCE_ON_DONE_IS_BOOLEAN";
const BLOCK_KEYS = "PROFILE_POLICY_BLOCK_KEYS_FIXED";

async function seed(policies: Record<string, unknown> = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-autoadvance-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  const doc = profileJson({ workspaceId: "auto-advance" }) as Record<string, unknown>;
  Object.assign(doc.policies as Record<string, unknown>, policies);
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return root;
}

test("the scalar is optional, boolean, and the only extra key policies may carry", async () => {
  assert.deepEqual([...PROFILE_POLICY_SCALAR_KEYS], ["autoAdvanceOnDone"]);

  // Absent is legal and means false: a Profile that says nothing has not
  // enabled it.
  assert.equal((await loadConfig(await seed())).autoAdvanceOnDone, false);
  assert.equal((await loadConfig(await seed({ autoAdvanceOnDone: false }))).autoAdvanceOnDone, false);
  assert.equal((await loadConfig(await seed({ autoAdvanceOnDone: true }))).autoAdvanceOnDone, true);

  for (const bad of ["true", 1, null, {}, []]) {
    const root = await seed({ autoAdvanceOnDone: bad });
    await assert.rejects(() => loadProfile(root), /must be absent or boolean/, `${JSON.stringify(bad)} must be refused`);
  }

  // One name is admitted, not scalars in general. A typo is still unexpected.
  for (const typo of ["autoAdvance", "autoAdvanceOnDon", "AutoAdvanceOnDone"]) {
    const root = await seed({ [typo]: true });
    await assert.rejects(() => loadProfile(root), /unexpected/, `${typo} must still be refused`);
  }

  // The nine blocks stay required.
  const root = await seed();
  const doc = profileJson({ workspaceId: "auto-advance" }) as Record<string, unknown>;
  delete (doc.policies as Record<string, unknown>).risk;
  (doc.policies as Record<string, unknown>).autoAdvanceOnDone = true;
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await assert.rejects(() => loadProfile(root), /missing risk/);

  coversRule(AUTO, "policies.autoAdvanceOnDone is absent or boolean");
  coversRule(AUTO, "projectPolicy.autoAdvanceOnDone is parsed Project Profile value when present");
  coversRule(AUTO, "projectPolicy.autoAdvanceOnDone is false when Project Profile value is absent");
  coversRule(AUTO, "Project Profile explicit true may set projectPolicy.autoAdvanceOnDone=true");
  coversRule(
    BLOCK_KEYS,
    "policies block keys are exactly harness, agentAdapters, files, commands, risk, verification, redaction, carryForward, agentRoles, and the only additional permitted key is the optional scalar autoAdvanceOnDone"
  );
});

test("restrict-only merging can lower it and can never raise it", () => {
  // Starts from the candidate.
  assert.equal(mergeAutoAdvanceOnDone(true, []), true);
  assert.equal(mergeAutoAdvanceOnDone(false, []), false);

  // Any source saying false wins.
  assert.equal(mergeAutoAdvanceOnDone(true, [false]), false);
  assert.equal(mergeAutoAdvanceOnDone(true, [undefined, false, undefined]), false);

  // Nothing downstream can raise it. This is the direction that matters: OR
  // would let a Task guardrail hand back a permission the Profile withheld.
  assert.equal(mergeAutoAdvanceOnDone(false, [true]), false);
  assert.equal(mergeAutoAdvanceOnDone(false, [true, true, true]), false);

  // Silence is not permission and not refusal.
  assert.equal(mergeAutoAdvanceOnDone(true, [undefined, null]), true);

  coversRule(AUTO, "effectivePolicy.autoAdvanceOnDone starts from projectPolicy.autoAdvanceOnDone");
  coversRule(AUTO, "effectivePolicy.autoAdvanceOnDone becomes false if any restrict-only source sets false");
  coversRule(
    AUTO,
    "effectivePolicy.autoAdvanceOnDone remains true only when projectPolicy.autoAdvanceOnDone is true and no restrict-only source sets false"
  );
  coversRule(
    AUTO,
    "Local Overlay, Task guardrails, and Run Options cannot set true when projectPolicy.autoAdvanceOnDone is false"
  );
});

test("the Run Plan records the merged value, and a Task guardrail can only lower it", async () => {
  const root = await seed({ autoAdvanceOnDone: true });
  const yaml = (guardrails: string): string =>
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise autoAdvanceOnDone",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
      "status: READY",
      guardrails,
      ""
    ].join("\n");

  await writeFile(path.join(root, ".codefleet", "tasks", "sample.yaml"), yaml(""), "utf8");
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, unknown>;
  assert.equal((plan.effectivePolicy as Record<string, unknown>).autoAdvanceOnDone, true);
});

test("the switch alone accepts nothing", () => {
  // Turning it on satisfies exactly one of the bound's conditions. Everything a
  // real Run looks like today still refuses.
  const asRunsLookNow = evaluateAutoReview({
    autoAdvanceOnDone: true,
    resultReview: { required: true, allowedActors: ["HUMAN"], explicit: false },
    normalizedResult: "DONE",
    verificationGateResult: "SATISFIED",
    computedRisk: "UNKNOWN",
    normalizationStatus: "PARTIAL",
    evidenceCompleteness: "WAIVED_INCOMPLETE",
    capabilityGaps: 1,
    evidenceDefects: 0,
    blockingFindings: 0,
    unresolvedRequiredFields: 0,
    blockingNeedsReview: 0,
    reviewEvidenceBundleRef: "ref",
    reviewEvidenceBundleHash: "hash"
  });

  assert.equal(asRunsLookNow.allowed, false);
  assert.ok(
    asRunsLookNow.blockedReasons.length >= 5,
    `the switch is one condition of many; got ${asRunsLookNow.blockedReasons.join(", ")}`
  );
  assert.equal(
    asRunsLookNow.blockedReasons.some((r) => /AUTO_ADVANCE_ON_DONE_NOT_ENABLED/.test(r)),
    false,
    "the switch itself is satisfied, and the Run is still refused"
  );
});
