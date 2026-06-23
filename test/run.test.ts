import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTask } from "../src/run.ts";

test("runTask writes run-plan and S2 artifacts before legacy result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ version: "0.1.0", defaultAgent: "codex", mode: "dry-run", workspace: { id: "run-test" } })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise run artifacts",
      "scope:",
      "  include: [src]",
      "  exclude: [secrets]",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Run dry-run adapter]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  const execution = await runTask(root, "sample");

  const runPlan = await readJson(path.join(execution.runDir, "run-plan.json"));
  const adapterRequest = await readJson(path.join(execution.runDir, "adapter-request.json"));
  const harnessObservation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const adapterResult = await readJson(path.join(execution.runDir, "adapter-result.json"));
  const legacyResult = await readJson(path.join(execution.runDir, "result.json"));

  assert.equal(runPlan.documentKind, "RUN_PLAN");
  assert.equal(runPlan.workspaceDiscovery.workspaceId, "run-test");
  assert.equal(runPlan.artifactPlan.adapterRequestPath, execution.result.adapterRequestPath);
  const sourceRefs = runPlan.sourceRefs as {
    taskRevisionRef: { path: string };
    taskSnapshotRef: { path: string };
  };
  assert.equal(sourceRefs.taskRevisionRef.path, ".codefleet/tasks/sample.yaml");
  assert.match(sourceRefs.taskSnapshotRef.path, /^\.codefleet\/runs\/.+\/task\.yaml$/);
  const effectivePolicy = runPlan.effectivePolicy as {
    policyHash: string;
    capabilities: unknown;
  };
  assert.notEqual(effectivePolicy.policyHash, hashJson(effectivePolicy.capabilities));
  assert.equal(adapterRequest.documentKind, "ADAPTER_REQUEST");
  assert.equal(adapterRequest.runPlanRef.path, execution.result.runPlanPath);
  assert.equal((adapterRequest.taskRevisionRef as { path: string }).path, ".codefleet/tasks/sample.yaml");
  assert.match((adapterRequest.taskSnapshotRef as { path: string }).path, /^\.codefleet\/runs\/.+\/task\.yaml$/);
  assert.equal(adapterRequest.taskContractRef, undefined);
  assert.equal(adapterRequest.providerSpecific, false);
  assert.equal(adapterRequest.command, undefined);
  assert.equal(adapterRequest.args, undefined);
  assert.equal(harnessObservation.documentKind, "HARNESS_OBSERVATION");
  assert.equal(harnessObservation.commands.authority, "NONE");
  assert.equal(adapterResult.documentKind, "ADAPTER_RESULT");
  assert.equal(adapterResult.synthetic, true);
  assert.equal(adapterResult.adapterExecutionStatus, "NOT_EXECUTED");
  assert.equal(legacyResult.adapterResultPath, execution.result.adapterResultPath);
});

test("runTask rejects projectPath outside the workspace before S2 artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-path-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "codefleet-outside-project-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ version: "0.1.0", defaultAgent: "codex", mode: "dry-run", workspace: { id: "path-test" } })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      `projectPath: ${outside}`,
      "goal: Reject outside project path",
      "scope:",
      "  include: [src]",
      "  exclude: [secrets]",
      "constraints: []",
      "doneCriteria: [No run artifacts]",
      "workflow: [Plan]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await assert.rejects(() => runTask(root, "sample"), /workspace-relative/);
  assert.deepEqual(await readdir(path.join(root, ".codefleet", "runs")), []);
});

test("runTask rejects file projectPath before S2 artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-file-path-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "not a working directory\n", "utf8");
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ version: "0.1.0", defaultAgent: "codex", mode: "dry-run", workspace: { id: "file-path-test" } })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: README.md",
      "goal: Reject file project path",
      "scope:",
      "  include: [src]",
      "  exclude: [secrets]",
      "constraints: []",
      "doneCriteria: [No run artifacts]",
      "workflow: [Plan]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await assert.rejects(() => runTask(root, "sample"), /workspace directory/);
  assert.deepEqual(await readdir(path.join(root, ".codefleet", "runs")), []);
});

test("runTask preserves S2 artifacts when adapter creation fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-failure-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ version: "0.1.0", defaultAgent: "missing-adapter", mode: "dry-run", workspace: { id: "failure-test" } })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise failed adapter artifacts",
      "scope:",
      "  include: [src]",
      "  exclude: [secrets]",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Run missing adapter]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  const execution = await runTask(root, "sample");

  const adapterRequest = await readJson(path.join(execution.runDir, "adapter-request.json"));
  const harnessObservation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const adapterResult = await readJson(path.join(execution.runDir, "adapter-result.json"));
  const legacyResult = await readJson(path.join(execution.runDir, "result.json"));

  assert.equal(execution.result.status, "FAILED");
  assert.equal(adapterRequest.documentKind, "ADAPTER_REQUEST");
  assert.equal(harnessObservation.documentKind, "HARNESS_OBSERVATION");
  assert.equal(adapterResult.documentKind, "ADAPTER_RESULT");
  assert.equal(adapterResult.adapterId, "missing-adapter");
  assert.equal(adapterResult.synthetic, true);
  assert.equal(adapterResult.adapterExecutionStatus, "ADAPTER_FAILED");
  const adapterError = adapterResult.adapterError as { code: string; message: string };
  assert.equal(adapterError.code, "LAUNCH_FAILED");
  assert.match(adapterError.message, /Unsupported agent: missing-adapter/);
  assert.equal(legacyResult.error, "Unsupported agent: missing-adapter");
});

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
