// The 2026-08-11 re-audit's P0-10, and the halves of P0-1 and P0-6 that the
// first fix left open.
//
// A boundary was put around the adapter process and nowhere else. Every other
// child CodeFleet starts — the verification command, git diff, git status, the
// workspace snapshot, git worktree — ran with no time limit, no output limit,
// and the parent's entire environment. Those children produce the evidence this
// product's claims rest on, so they need the boundary more than the adapter,
// not less.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_ADAPTER_OUTPUT_CAP_BYTES,
  DEFAULT_ADAPTER_TIMEOUT_MS,
  GIT_EVIDENCE_OUTPUT_CAP_BYTES,
  GIT_EVIDENCE_TIMEOUT_MS,
  gitProcessEnv,
  ISOLATION_COMMAND_TIMEOUT_MS,
  NEW_FILE_CAPTURE_BUDGET_MS,
  VERIFICATION_COMMAND_OUTPUT_CAP_BYTES,
  VERIFICATION_COMMAND_TIMEOUT_MS
} from "../src/agent.ts";
import { classifyGap, reviewRun } from "../src/review.ts";
import { runProcess, runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

/**
 * A workspace whose Task runs one verification command, written by the caller.
 * The agent does nothing: these tests are about the Harness's own children.
 */
async function workspaceWithVerification(input: {
  name: string;
  checkSource: string;
}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `codefleet-${input.name}-`));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  await writeFile(path.join(root, "tools", "agent.mjs"), 'process.stdout.write("done\\n");\n', "utf8");
  await writeFile(path.join(root, "tools", "check.mjs"), input.checkSource, "utf8");

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  const doc = profileJson({
    workspaceId: input.name,
    harnessMode: "COMMAND_EXEC",
    isolationMode: "NONE",
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: false }
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise the Harness's own child processes",
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
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );
  return root;
}

async function readRunJson(runDir: string, name: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path.join(runDir, name), "utf8")) as Record<string, any>;
}

// A verification command that never exits used to hold `codefleet run` open with
// no way out but Ctrl-C. The limit in force is minutes, so the kill itself is
// exercised at the boundary the Run uses, with a limit small enough to watch.
test("a Harness child that never exits is killed and reported as timed out", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-harness-timeout-"));
  await writeFile(path.join(root, "forever.mjs"), "setInterval(() => {}, 1000);\n", "utf8");

  const started = Date.now();
  const result = await runProcess(process.execPath, ["forever.mjs"], root, {
    limits: { timeoutMs: 400, outputCapBytes: 1024 }
  });
  const elapsed = Date.now() - started;

  assert.equal(result.code, null, "a killed process has no exit code");
  assert.equal(result.timedOut, true, "the timeout has to be reported, not inferred from a null code");
  assert.ok(elapsed < 10_000, `the call must not outlive the limit; took ${elapsed} ms`);
  assert.equal(result.timeoutMs, 400, "the limit in force travels with the result");
});

// The end of that same path: a command the Harness killed must fail the Run
// rather than being read as a pass, and must say why.
test("a verification command that fails is recorded with its reason and does not satisfy the gate", async () => {
  const root = await workspaceWithVerification({
    name: "verify-fail",
    checkSource: 'process.stderr.write("boom\\n");\nprocess.exit(7);\n'
  });
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const summary = await readRunJson(execution.runDir, "run-summary.json");
  const evidence = await readRunJson(
    path.join(execution.runDir, "verification"),
    `${summary.check.derivedFromVerificationAttemptIds[0]}.json`
  );
  const attempt = evidence.attempts[0] as Record<string, any>;

  assert.equal(attempt.result, "FAIL");
  assert.equal(attempt.exitCode, 7);
  assert.equal(summary.check.verificationGateResult, "NOT_SATISFIED");

  // The limits that were in force are recorded with the attempt, so the Run
  // states the ceiling it ran under rather than leaving it to be assumed.
  assert.equal(attempt.scanScope.timeoutMs, VERIFICATION_COMMAND_TIMEOUT_MS);
  assert.equal(attempt.scanScope.outputCapBytes, VERIFICATION_COMMAND_OUTPUT_CAP_BYTES);
});

// 01-p0-1-guardrails.md §C-1, moved out of a one-off script and into the suite.
test("a verification command cannot read the parent's environment", async () => {
  const root = await workspaceWithVerification({
    name: "verify-env",
    checkSource: [
      'import { writeFileSync } from "node:fs";',
      'writeFileSync("env-seen.txt", String(process.env.CODEFLEET_VERIFY_SECRET ?? "absent"));',
      "process.exit(0);",
      ""
    ].join("\n")
  });
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  process.env.CODEFLEET_VERIFY_SECRET = "verification-child-should-not-see-this";
  try {
    await runTask(root, "sample");
    assert.equal(
      await readFile(path.join(root, "env-seen.txt"), "utf8"),
      "absent",
      "a boundary the adapter has and the Harness's own children do not is not a boundary"
    );
  } finally {
    delete process.env.CODEFLEET_VERIFY_SECRET;
  }
});

test("a verification command's runaway output is capped and the dropped bytes are counted", async () => {
  const root = await workspaceWithVerification({
    name: "verify-output",
    checkSource: [
      `process.stdout.write("x".repeat(${VERIFICATION_COMMAND_OUTPUT_CAP_BYTES + 5000}));`,
      "process.exit(0);",
      ""
    ].join("\n")
  });
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const summary = await readRunJson(execution.runDir, "run-summary.json");
  const evidence = await readRunJson(
    path.join(execution.runDir, "verification"),
    `${summary.check.derivedFromVerificationAttemptIds[0]}.json`
  );
  const attempt = evidence.attempts[0] as Record<string, any>;

  const logged = await readFile(path.join(execution.runDir, "verification", evidence.verificationAttemptId, "unit-tests.stdout.log"), "utf8");
  assert.ok(
    Buffer.byteLength(logged) <= VERIFICATION_COMMAND_OUTPUT_CAP_BYTES,
    `stdout must be capped, got ${Buffer.byteLength(logged)}`
  );
  assert.ok(
    (attempt.scanScope?.stdoutTruncatedBytes ?? 0) > 0,
    "a truncated log must be distinguishable from one that simply ended"
  );

  // The exit code still decides the gate, so a capped log does not turn a pass
  // into a failure. It is surfaced as a gap a person can stand in for.
  assert.equal(attempt.result, "PASS");
  assert.ok(
    (summary.normalization.unavailableReasons as string[]).includes("VERIFICATION_OUTPUT_TRUNCATED"),
    `the truncation must reach review, got ${JSON.stringify(summary.normalization.unavailableReasons)}`
  );

  // Waivable on purpose: the verdict came from the exit code, not the log.
  const rejected = await reviewRun(root, execution.result.runId, {
    decision: "REJECTED",
    reason: "reading the bundle"
  });
  const bundle = JSON.parse(
    await readFile(path.join(root, ".codefleet", "reviews", rejected.reviewDecisionId, "evidence-bundle.json"), "utf8")
  ) as Record<string, any>;
  assert.equal(bundle.scanScope.evidenceDefects, 0, "a capped test log is not an evidence defect");
  assert.ok((bundle.unavailableReasons as string[]).includes("VERIFICATION_OUTPUT_TRUNCATED"));
});

test("the limits are finite, named in one place, and separate from the adapter's", async () => {
  // A verification command is not an agent session: the adapter's 30 minutes is
  // the wrong ceiling for a test suite, and the evidence calls are the wrong
  // place for either.
  for (const value of [
    VERIFICATION_COMMAND_TIMEOUT_MS,
    VERIFICATION_COMMAND_OUTPUT_CAP_BYTES,
    GIT_EVIDENCE_TIMEOUT_MS,
    GIT_EVIDENCE_OUTPUT_CAP_BYTES,
    ISOLATION_COMMAND_TIMEOUT_MS,
    NEW_FILE_CAPTURE_BUDGET_MS
  ]) {
    assert.ok(Number.isFinite(value) && value > 0, `every limit must be finite and positive, got ${value}`);
  }
  assert.ok(
    VERIFICATION_COMMAND_TIMEOUT_MS < DEFAULT_ADAPTER_TIMEOUT_MS,
    "a verification command does not get the agent's budget"
  );
  assert.ok(GIT_EVIDENCE_TIMEOUT_MS < VERIFICATION_COMMAND_TIMEOUT_MS, "reading git state is not running a test suite");
});

// The worst thing this slice could produce is a Run whose patch was cut and
// which was accepted anyway. Excluding a file for its size is something a person
// can check instead; bytes dropped from a diff are not, because nobody can say
// which bytes they were. So the two land on opposite sides of the waiver line.
test("a truncated diff is an evidence defect and cannot be waived; a skipped file is a gap and can", async () => {
  assert.equal(classifyGap("EVIDENCE_TRUNCATED:GIT_DIFF"), "EVIDENCE_DEFECT");
  assert.equal(classifyGap("EVIDENCE_TRUNCATED:GIT_STATUS"), "EVIDENCE_DEFECT");
  assert.equal(classifyGap("EVIDENCE_TRUNCATED:GIT_DIFF_NEW_FILE"), "EVIDENCE_DEFECT");
  assert.equal(classifyGap("NEW_FILE_CONTENT_NOT_CAPTURED"), "CAPABILITY_GAP");
  assert.equal(classifyGap("VERIFICATION_OUTPUT_TRUNCATED"), "CAPABILITY_GAP");
});

test("a Run whose diff was cut off cannot be accepted, even with the reason waived", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-cut-diff-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  // Large enough that rewriting it produces more patch than the cap allows.
  const line = `${"a".repeat(99)}\n`;
  const original = line.repeat(Math.ceil((GIT_EVIDENCE_OUTPUT_CAP_BYTES * 0.6) / 100));
  await writeFile(path.join(root, "src", "big.txt"), original, "utf8");
  await writeFile(
    path.join(root, "tools", "agent.mjs"),
    [
      'import { readFileSync, writeFileSync } from "node:fs";',
      'writeFileSync("src/big.txt", readFileSync("src/big.txt", "utf8").replaceAll("a", "b"));',
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
    workspaceId: "cut-diff",
    harnessMode: "COMMAND_EXEC",
    isolationMode: "NONE",
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: false }
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Produce more diff than the evidence cap allows",
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

  const execution = await runTask(root, "sample");
  const observation = await readRunJson(execution.runDir, "harness-observation.json");
  const summary = await readRunJson(execution.runDir, "run-summary.json");

  assert.equal(
    observation.changes.unavailableReason,
    "EVIDENCE_TRUNCATED:GIT_DIFF",
    "a patch that was cut has to say so where the changes are reported"
  );
  assert.ok(
    (summary.normalization.unavailableReasons as string[]).includes("EVIDENCE_TRUNCATED:GIT_DIFF"),
    `it must reach the Run Summary, got ${JSON.stringify(summary.normalization.unavailableReasons)}`
  );

  const rejected = await reviewRun(root, execution.result.runId, {
    decision: "REJECTED",
    reason: "reading the bundle"
  });
  const bundle = JSON.parse(
    await readFile(path.join(root, ".codefleet", "reviews", rejected.reviewDecisionId, "evidence-bundle.json"), "utf8")
  ) as Record<string, any>;
  assert.ok(bundle.scanScope.evidenceDefects >= 1, "a cut patch is a defect, not a gap");

  // Waiving it must not help. This is the assertion the whole slice turns on.
  await assert.rejects(
    () =>
      reviewRun(root, execution.result.runId, {
        decision: "ACCEPTED",
        reason: "trying to accept a partial record",
        waivedGaps: summary.normalization.unavailableReasons as string[],
        waiveJustification: "looked at it myself"
      }),
    /evidence defect cannot be waived: EVIDENCE_TRUNCATED:GIT_DIFF/
  );
});

// The counts existed and were thrown away: runCommand measured what it dropped,
// and nothing carried the number into an artifact. A 16 MB transcript cut to
// 16 MB looks exactly like one that ended. Stage 2 added three more kinds of
// child, so all four report the ceiling they ran under, what they used, and
// what was dropped — and "nothing was dropped" never looks like "nobody counted".
test("every process the Run started reports its ceiling, its usage, and what was dropped", async () => {
  const root = await workspaceWithVerification({
    name: "limits-surfaced",
    checkSource: [
      `process.stdout.write("x".repeat(${VERIFICATION_COMMAND_OUTPUT_CAP_BYTES + 5000}));`,
      "process.exit(0);",
      ""
    ].join("\n")
  });
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const observation = await readRunJson(execution.runDir, "harness-observation.json");
  const adapterResult = await readRunJson(execution.runDir, "adapter-result.json");
  const limits = observation.resourceLimits as Record<string, any>;

  // 1. The adapter's own counts reach its artifact. This is the field the
  //    re-audit found missing from adapter-result.json.
  assert.ok(adapterResult.scanScope, "adapter-result.json must carry the adapter's scanScope");
  assert.equal(adapterResult.scanScope.outputCapBytes, DEFAULT_ADAPTER_OUTPUT_CAP_BYTES);
  assert.equal(adapterResult.scanScope.timeoutMs, DEFAULT_ADAPTER_TIMEOUT_MS);
  assert.equal(adapterResult.scanScope.stdoutTruncatedBytes, 0);

  // 2. All four subjects are accounted for, each with its own ceiling.
  assert.equal(limits.adapter.measured, true);
  assert.equal(limits.adapter.outputCapBytes, DEFAULT_ADAPTER_OUTPUT_CAP_BYTES);
  assert.equal(limits.verification.measured, true);
  assert.equal(limits.verification.outputCapBytes, VERIFICATION_COMMAND_OUTPUT_CAP_BYTES);
  assert.equal(limits.verification.timeoutMs, VERIFICATION_COMMAND_TIMEOUT_MS);
  assert.ok(limits.verification.truncatedBytes > 0, "the capped verification output must be counted");
  assert.equal(limits.verification.truncatedCalls, 1);
  assert.equal(limits.gitEvidence.measured, true);
  assert.equal(limits.gitEvidence.outputCapBytes, GIT_EVIDENCE_OUTPUT_CAP_BYTES);
  assert.ok(limits.gitEvidence.calls > 0, "the git evidence calls must be counted, not assumed");
  assert.equal(limits.gitEvidence.truncatedBytes, 0);
  assert.equal(limits.newFileCapture.budgetMs, NEW_FILE_CAPTURE_BUDGET_MS);

  // 3. Usage is reported apart from the ceiling, so a Run that came nowhere
  //    near its limit reads differently from one that hit it.
  assert.ok(limits.verification.outputBytes > 0);
  assert.ok(limits.gitEvidence.outputBytes >= 0);

  // 4. A person reading the one human document sees it, and sees it before the
  //    evidence rather than after.
  const record = await readFile(path.join(execution.runDir, "run-record.md"), "utf8");
  const limitsAt = record.indexOf("## What the limits did");
  const changedAt = record.indexOf("## What changed");
  assert.ok(limitsAt > 0, `run-record.md must report the limits, got:\n${record.slice(0, 400)}`);
  assert.ok(
    limitsAt < changedAt,
    "the reader must learn output was dropped before reading the evidence, not after"
  );
  assert.match(record, /truncated/i);
  assert.match(record, new RegExp(String(VERIFICATION_COMMAND_OUTPUT_CAP_BYTES)));
});

test("a limit nobody measured is not reported as a limit nothing hit", async () => {
  // dry-run never starts an adapter process, so there is no measurement to
  // report. Saying "0 bytes truncated" would claim a check that never ran.
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-unmeasured-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "unmeasured", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Plan only",
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

  const execution = await runTask(root, "sample");
  const observation = await readRunJson(execution.runDir, "harness-observation.json");
  const limits = observation.resourceLimits as Record<string, any>;

  assert.equal(limits.adapter.measured, false, "a dry run started no adapter process");
  assert.equal(limits.verification.measured, false, "this Task declares no verification command");

  const record = await readFile(path.join(execution.runDir, "run-record.md"), "utf8");
  assert.match(record, /## What the limits did/);
  assert.match(record, /not measured/i, "an unmeasured subject says so rather than reporting zero");
});

test("a git child sees a named environment, not everything the operator exported", async () => {
  process.env.CODEFLEET_GIT_SECRET = "git-child-should-not-see-this";
  try {
    const env = gitProcessEnv();
    assert.equal(env.CODEFLEET_GIT_SECRET, undefined, "a credential must not reach a git child");
    assert.ok(typeof env.PATH === "string", "git still needs to be found");
    // git resolves its configuration from the home directory. Cutting that off
    // would change what a diff says — core.autocrlf alone rewrites every line
    // ending — so protecting evidence must not start by altering it.
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (typeof home === "string") {
      assert.equal(env.HOME ?? env.USERPROFILE, home, "git's configuration lookup is preserved on purpose");
    }
    assert.equal(Object.values(env).includes("git-child-should-not-see-this"), false);
  } finally {
    delete process.env.CODEFLEET_GIT_SECRET;
  }
});
