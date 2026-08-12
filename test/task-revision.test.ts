// The Revision artifact, and the three findings it closes.
//
// The Task ledger recorded that a revision was approved and what its hash was,
// but the hash only proves a match against a file that still exists. Edit the
// Task and the approved bytes were gone: "which contract was approved" had no
// answer inside the workspace (P1-41), the approved body could not be restored
// (P1-38), the Draft and Revision state machines the design specifies had no
// representation (P1-39), and six of the seven Run artifacts could not name the
// Revision they were evidence for (P1-37).

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runTask } from "../src/run.ts";
import {
  approveTask,
  contentHashOf,
  deriveDraftState,
  deriveRevisionStates,
  invalidateApproval,
  readTaskEvents
} from "../src/task-ledger.ts";
import {
  listTaskRevisions,
  readTaskRevision,
  taskRevisionPath,
  TaskRevisionDefectError
} from "../src/task-revision.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

async function workspace(name: string): Promise<string> {
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
        isolationMode: "NONE",
        harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: false }
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
  return root;
}

test("approval fixes the contract in a Revision artifact", async () => {
  const root = await workspace("revision-artifact");
  const taskPath = await findTaskPath(root, "sample");
  const approvedSource = await readFile(taskPath, "utf8");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });

  assert.deepEqual(await listTaskRevisions(root, "sample"), [1]);
  const document = await readTaskRevision(root, "sample", 1);

  assert.equal(document.documentKind, "TASK_REVISION");
  assert.equal(document.taskRevision, 1);
  assert.equal(document.contract.source, approvedSource, "the artifact holds the exact approved bytes");
  assert.equal(document.contract.contentHash, await contentHashOf(taskPath));
  assert.ok(document.approvalTargetHash.length > 0);
  assert.ok(document.guardrailHash.length > 0);

  // The design is explicit that this file is a source, not authority. Marking
  // the references keeps a later reader from treating a stale snapshot as the
  // current decision.
  assert.equal(document.approvalDecisionRef.authoritative, false);
  assert.equal(document.objectiveRelationSnapshot.authoritative, false);
  assert.equal(document.approvalDecisionRef.actorId, "tester");
  // Nothing was examined and nothing was found have to be distinguishable.
  assert.equal(document.objectiveRelationSnapshot.scanScope.objectivesRead, 0);
  assert.deepEqual(document.objectiveRelationSnapshot.relations, []);
});

test("the approved contract survives an edit to the working file", async () => {
  const root = await workspace("revision-restore");
  const taskPath = await findTaskPath(root, "sample");
  const approvedSource = await readFile(taskPath, "utf8");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });

  // This is the case the ledger could not answer: the file no longer holds what
  // was approved, and the hash can only say so, not say what it was.
  await writeFile(taskPath, approvedSource.replace("goal: edit app.js", "goal: something else"), "utf8");

  const document = await readTaskRevision(root, "sample", 1);
  assert.equal(document.contract.source, approvedSource);
  assert.notEqual(await contentHashOf(taskPath), document.contract.contentHash);
});

test("a Revision whose stored contract was altered is refused, not returned", async () => {
  const root = await workspace("revision-tamper");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });

  // Reading is what verifies. Returning an altered contract would answer "what
  // was approved" with something nobody approved — worse than answering nothing.
  const artifact = taskRevisionPath(root, "sample", 1);
  const document = JSON.parse(await readFile(artifact, "utf8"));
  document.contract.source = `${document.contract.source}# appended after approval\n`;
  await writeFile(artifact, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  await assert.rejects(
    () => readTaskRevision(root, "sample", 1),
    (error: Error) => {
      assert.ok(error instanceof TaskRevisionDefectError);
      assert.match(error.message, /does not match its own contentHash/);
      return true;
    }
  );
});

test("a revision file is claimed once and never overwritten", async () => {
  const root = await workspace("revision-exclusive");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });

  // Re-approving identical content is idempotent and must not rewrite the
  // artifact; approving new content claims the next number instead.
  const before = await readFile(taskRevisionPath(root, "sample", 1), "utf8");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1 again" });
  assert.equal(await readFile(taskRevisionPath(root, "sample", 1), "utf8"), before);
  assert.deepEqual(await listTaskRevisions(root, "sample"), [1]);
});

test("Draft state and Revision state are derived separately", async () => {
  const root = await workspace("revision-states");
  const taskPath = await findTaskPath(root, "sample");

  // A valid, feasible contract is a candidate for approval; the design calls
  // that READY_FOR_APPROVAL, and until now no such moment existed. P1-39.
  const draft = await deriveDraftState(root, "sample");
  assert.equal(draft.state, "READY_FOR_APPROVAL");
  assert.deepEqual(draft.reasons, []);

  assert.deepEqual(deriveRevisionStates(await readTaskEvents(root, "sample")), []);

  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });
  const afterFirst = deriveRevisionStates(await readTaskEvents(root, "sample"));
  assert.equal(afterFirst.length, 1);
  assert.equal(afterFirst[0].state, "APPROVED");

  // The design's own worked example: approve r1, invalidate r1, approve r2. It
  // replays revision 1 as "승인된 적 있음 / 무효화됨 / 현재 실행 불가" — not as
  // SUPERSEDED. Deriving SUPERSEDED from a newer revision existing would invent
  // a corrective decision nobody appended, and TASK_REVISION_SUPERSEDED carries
  // fields only that event can supply.
  await invalidateApproval(root, { taskId: "sample", taskPath, actorId: "tester", reason: "reopening" });
  const afterInvalidate = deriveRevisionStates(await readTaskEvents(root, "sample"));
  assert.equal(afterInvalidate[0].state, "INVALIDATED");

  const original = await readFile(taskPath, "utf8");
  await writeFile(taskPath, original.replace("goal: edit app.js", "goal: edit app.js twice"), "utf8");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r2" });

  const afterSecond = deriveRevisionStates(await readTaskEvents(root, "sample"));
  assert.deepEqual(
    afterSecond.map((entry) => [entry.taskRevision, entry.state]),
    [
      [1, "INVALIDATED"],
      [2, "APPROVED"]
    ],
    "SUPERSEDED stays unreachable until something appends the event. P1-42, closed by S3-1d"
  );
  // Both contracts are recoverable, including the one that was replaced.
  assert.deepEqual(await listTaskRevisions(root, "sample"), [1, 2]);
  assert.equal((await readTaskRevision(root, "sample", 1)).contract.source, original);
});

test("a draft that cannot be approved reports why instead of looking ready", async () => {
  const root = await workspace("revision-draft-blocked");
  const taskPath = await findTaskPath(root, "sample");
  const original = await readFile(taskPath, "utf8");

  // The role caps below COMMAND_EXEC while the contract declares verification
  // commands: valid YAML, unapprovable contract. Reporting READY_FOR_APPROVAL
  // here is what made "why does approve fail" unanswerable.
  await writeFile(taskPath, original.replace("agentRole: INFRA_OPERATOR", "agentRole: BACKEND_IMPLEMENTER"), "utf8");
  const blocked = await deriveDraftState(root, "sample");
  assert.equal(blocked.state, "EDITING");
  assert.ok(blocked.reasons.length > 0);
  assert.match(blocked.reasons.join("\n"), /BACKEND_IMPLEMENTER/);

  // And a schema error reaches the same state by the other route.
  await writeFile(taskPath, original.replace("goal: edit app.js", ""), "utf8");
  assert.equal((await deriveDraftState(root, "sample")).state, "EDITING");

  // A standing approval over different content blocks approve too. The state
  // claims "approve 가능"; reporting READY_FOR_APPROVAL while approve refuses
  // would answer a different question than the field asks.
  await writeFile(taskPath, original, "utf8");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });
  await writeFile(taskPath, original.replace("goal: edit app.js", "goal: edited after approval"), "utf8");
  const conflicted = await deriveDraftState(root, "sample");
  assert.equal(conflicted.state, "EDITING");
  assert.match(conflicted.reasons.join("\n"), /invalidate it before approving/);
});

// P1-37 measured the artifacts of a real Run. The recheck corrected the set to
// nine JSON documents — the two workspace snapshots were missed the first time —
// of which one carried taskRevision, three carried taskId, and five carried
// neither. This re-measures the corrected set of nine rather than asserting on
// whichever files were changed by hand.
test("every Run artifact names the contract it is evidence for", async () => {
  const root = await workspace("revision-run-artifacts");
  const taskPath = await findTaskPath(root, "sample");
  await approveTask(root, { taskId: "sample", taskPath, actorId: "tester", reason: "approve r1" });

  const execution = await runTask(root, "sample");
  assert.equal(execution.result.status, "SUCCEEDED");

  const expected = [
    "run-plan.json",
    "adapter-request.json",
    "harness-observation.json",
    "adapter-result.json",
    "run-summary.json",
    "result.json",
    "workspace-pre-run.json",
    "workspace-post-run.json",
    path.join("verification", "verify-001.json")
  ];

  const missing: string[] = [];
  let checked = 0;
  for (const relative of expected) {
    const document = JSON.parse(await readFile(path.join(execution.runDir, relative), "utf8")) as Record<
      string,
      unknown
    >;
    checked += 1;
    const taskId = document.taskId;
    // run-plan keeps the revision inside its approval block, where it names the
    // decision rather than repeating a label.
    const revision =
      document.taskRevision ?? (document.approval as Record<string, unknown> | undefined)?.taskRevision;
    if (taskId !== "sample" || revision !== 1) {
      missing.push(`${relative}: taskId=${String(taskId)} taskRevision=${String(revision)}`);
    }
  }

  // Zero examined must not read as zero missing.
  assert.equal(checked, 9, "all nine artifacts of the corrected measured set were read");
  assert.deepEqual(missing, [], "each artifact names its Task and Revision on its own");

  // And the Run Trace's directory listing did not quietly lose a file the
  // measurement assumed was there.
  const present = new Set(await readdir(execution.runDir));
  for (const relative of expected.filter((name) => !name.includes(path.sep))) {
    assert.ok(present.has(relative), `${relative} exists in the Run Trace`);
  }
});
