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
status: READY
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
    workflow: ["PLAN", "IMPLEMENT", "REVIEW"],
    status: "READY"
  });
});

test("validateTask reports missing required fields", () => {
  const validation = validateTask({ id: "task-001" });
  assert.ok(validation.errors.some((error) => error.includes("title")));
  assert.ok(validation.errors.some((error) => error.includes("scope")));
});
