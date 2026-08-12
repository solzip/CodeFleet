import assert from "node:assert/strict";
import test from "node:test";
import { parseYaml } from "../src/yaml.ts";
import { validateTask } from "../src/task.ts";

test("parseYaml reads the v0.1 task shape", () => {
  const parsed = parseYaml(`
id: task-001
title: "Sample"
projectPath: "."
goal: "Do the work."
scope:
  include:
    - "src/**"
  exclude:
    - "dist/**"
constraints:
  - "Keep changes small."
doneCriteria:
  - "Tests pass."
workflow: [PLAN, IMPLEMENT, REVIEW]
`);

  assert.deepEqual(parsed, {
    id: "task-001",
    title: "Sample",
    projectPath: ".",
    goal: "Do the work.",
    scope: {
      include: ["src/**"],
      exclude: ["dist/**"]
    },
    constraints: ["Keep changes small."],
    doneCriteria: ["Tests pass."],
    workflow: ["PLAN", "IMPLEMENT", "REVIEW"]
  });
});

test("validateTask reports missing required fields", () => {
  const validation = validateTask({ id: "task-001" });
  assert.ok(validation.errors.some((error) => error.includes("title")));
  assert.ok(validation.errors.some((error) => error.includes("scope")));
});

// The field was removed, not merely stopped being read. Without this the change
// is indistinguishable from deleting the validation: a Task carrying a stale
// `status: DONE` would load silently and the contract would still contain an
// execution outcome. Design §0.6 puts RUNNING / DONE / FAILED / BLOCKED in
// Run-derived state, never in the Revision. P1-40.
test("a Task that declares an execution status is refused", () => {
  const contract = {
    id: "task-001",
    title: "Sample",
    projectPath: ".",
    goal: "Do the work.",
    scope: { include: ["src/**"], exclude: [] },
    constraints: [],
    doneCriteria: ["Tests pass."],
    workflow: ["IMPLEMENT"]
  };

  for (const status of ["READY", "RUNNING", "DONE", "FAILED", "BLOCKED"]) {
    const validation = validateTask({ ...contract, status });
    const refusal = validation.errors.find((error) => error.startsWith("status does not belong"));
    assert.ok(refusal, `status: ${status} must be refused, not ignored`);
    // A refusal that does not say where the state went reads as the feature
    // being deleted rather than moved.
    assert.match(refusal, /codefleet status/);
    assert.match(refusal, /codefleet run list/);
  }

  assert.deepEqual(validateTask(contract).errors, [], "the same contract without the field is valid");
});
