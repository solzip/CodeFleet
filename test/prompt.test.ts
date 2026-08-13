// The prompt a person previews must be the prompt the agent receives.
//
// renderPrompt takes the contract as an optional second argument, and only one
// of its two call sites passed it: the Run did, `codefleet prompt` did not. The
// preview was missing exactly the three sections that carry the contract —
// role and ceiling, Objective context, and what the Harness will execute — so
// the one command whose purpose is "show me what the agent is told" answered
// with a different document. P1-53.
//
// There was no test for renderPrompt at all before this file, which is why the
// divergence survived the change that introduced it.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { contentHashOf, approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson } from "./profile-fixture.ts";
import { permitRun } from "./task-ledger-fixture.ts";

const TASK_SOURCE = `id: sample
title: "Add a helper"
projectPath: "."
goal: "Add a subtract helper to src/app.js."
agentRole: INFRA_OPERATOR
scope:
  include:
    - "src/**"
  exclude:
    - "tools/**"
verification:
  commands:
    - commandId: unit
      command: ["node", "tools/check.mjs"]
constraints:
  - "Do not change unrelated files."
doneCriteria:
  - "The helper exists and is exported."
workflow:
  - IMPLEMENT
`;

async function seedWorkspace(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `codefleet-${name}-`));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, "tools", "check.mjs"), "process.exit(0);\n", "utf8");
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: name, harnessMode: "COMMAND_EXEC" }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(root, ".codefleet", "tasks", "sample.yaml"), TASK_SOURCE, "utf8");
  return root;
}

test("codefleet prompt writes the contract the agent is delegated, not the scope alone", async () => {
  const root = await seedWorkspace("prompt-contract");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });
  await permitRun(root, "sample");

  const result = await runCli(["prompt", "sample"], root);
  assert.equal(result.code, 0, `prompt failed: ${result.stderr}`);

  const prompt = await readFile(path.join(root, ".codefleet", "prompts", "sample.md"), "utf8");

  // Each half of the contract, named rather than sampled. A preview missing one
  // of these shows a delegation the Run never made.
  const required: [string, RegExp][] = [
    ["role", /## Role and Guardrails/],
    ["resolved role id", /Acting as: INFRA_OPERATOR/],
    ["effective mode", /Effective mode: COMMAND_EXEC/],
    ["ceiling is enforced", /enforced by the Harness/],
    ["objective context", /## Objective Context/],
    ["objective id", /fixture-objective/],
    ["verification section", /## Verification/],
    ["verification command", /unit: node tools\/check\.mjs/],
    ["verification is executed, not claimed", /Reporting that they pass does not make them pass/]
  ];

  const missing = required.filter(([, pattern]) => !pattern.test(prompt)).map(([label]) => label);
  assert.deepEqual(
    missing,
    [],
    `codefleet prompt omitted ${missing.length} of ${required.length} contract elements:\n${prompt}`
  );
});

// The refusal matters as much as the rendering: a prompt built from a Task that
// no approved Revision stands behind is a delegation of something nobody
// approved. Producing it and letting a person paste it into an agent is worse
// than failing here.
test("codefleet prompt refuses a Task with no approved revision rather than rendering a contract-less prompt", async () => {
  const root = await seedWorkspace("prompt-unapproved");

  const result = await runCli(["prompt", "sample"], root);

  assert.notEqual(result.code, 0, `expected a refusal, got:\n${result.stdout}`);
  assert.match(result.stderr, /sample/);
  assert.match(
    result.stderr,
    /approve/i,
    `the refusal has to say what to do about it, got: ${result.stderr}`
  );

  // Nothing is written on the refusing path.
  await assert.rejects(
    () => readFile(path.join(root, ".codefleet", "prompts", "sample.md"), "utf8"),
    "a refused prompt must leave no file behind"
  );
});

// The approval hash is what makes the preview trustworthy: a Task edited after
// approval is a different contract, and rendering it under the old approval
// would show a delegation that cannot execute.
test("codefleet prompt refuses a Task edited after approval", async () => {
  const root = await seedWorkspace("prompt-drifted");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });
  await permitRun(root, "sample");

  const before = await contentHashOf(taskPath);
  await writeFile(taskPath, `${TASK_SOURCE}# edited after approval\n`, "utf8");
  assert.notEqual(await contentHashOf(taskPath), before, "the fixture must actually change the contract");

  const result = await runCli(["prompt", "sample"], root);
  assert.notEqual(result.code, 0, `expected a refusal, got:\n${result.stdout}`);
});

function runCli(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "src", "cli.ts"), ...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
