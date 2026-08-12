// A second adapter, which is the only way to find out whether the adapter
// abstraction was one.
//
// With a single adapter, "provider-agnostic" was a claim about code that had
// never been asked to be. This adds `claude` and moves the parts that turned
// out to be shared — the dry-run short circuit, the capability refusal, reading
// the prompt, the bounded launch — behind one implementation, leaving each
// adapter with what genuinely differs: its default command and how its
// transcript reads. S6-6.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAgentAdapter, isAdapterLocallyAvailable, readClaudeTranscript } from "../src/agent.ts";
import { runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";
import { permitRun } from "./task-ledger-fixture.ts";

// Claude Code's stream-json: a shell call is a tool_use block nested inside an
// assistant message, and its command is a shell string rather than an argv.
const claudeEvent = (command: string): string =>
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] }
  });

test("the Claude transcript reading keeps a shell string a shell string", () => {
  const reading = readClaudeTranscript(
    [claudeEvent("npm test"), claudeEvent("git status --short"), ""].join("\n")
  );

  assert.equal(reading.commands.length, 2);
  assert.equal(reading.commands[0].raw, "npm test");
  // Splitting a shell string invents word boundaries, so argv stays empty and
  // the claim can never satisfy command policy. The same rule as Codex, which
  // is the point: the domain never learns a transcript format.
  assert.deepEqual(reading.commands[0].argv, []);
  assert.equal(reading.commands[0].exitCode, null, "the provider did not report one, so none is recorded");
  assert.equal(reading.unavailableReason, "");
  assert.equal(reading.scanScope.jsonLinesParsed, 2);
});

test("a transcript this build does not recognise degrades rather than inventing commands", () => {
  // Structured, but not a shape this parser claims to understand. Guessing at
  // it would produce a command record nobody can stand behind.
  const foreign = readClaudeTranscript(
    [JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } }), ""].join("\n")
  );
  assert.deepEqual(foreign.commands, []);
  assert.equal(foreign.unavailableReason, "PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED");
  assert.equal(foreign.scanScope.unrecognizedJsonLines, 1);

  // A tool_use that is not the shell tool is not a command. Recording it would
  // overstate what the provider claimed.
  const edit = readClaudeTranscript(
    [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "src/app.js" } }] }
      }),
      ""
    ].join("\n")
  );
  assert.deepEqual(edit.commands, []);

  // No JSON at all is a different failure from JSON in an unknown shape, and
  // they are reported differently.
  const prose = readClaudeTranscript("I ran the tests and they passed.\n");
  assert.equal(prose.unavailableReason, "PROVIDER_TRANSCRIPT_NOT_STRUCTURED");
});

test("both adapters are in the local registry and construct", () => {
  assert.equal(isAdapterLocallyAvailable("codex"), true);
  assert.equal(isAdapterLocallyAvailable("claude"), true);
  assert.equal(isAdapterLocallyAvailable("something-else"), false);

  assert.equal(createAgentAdapter("codex").name, "codex");
  assert.equal(createAgentAdapter("claude").name, "claude");
  assert.throws(() => createAgentAdapter("something-else"), /Unsupported agent/);
});

test("a Run Option selects the second adapter end to end", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-claude-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const ok = true;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  // Stands in for the CLI: emits a Claude-shaped transcript and edits a file.
  // The adapter under test is CodeFleet's, not the vendor's — what is being
  // checked is that selection, launch, and transcript reading are wired.
  await writeFile(
    path.join(root, "tools", "fake-claude.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      'writeFileSync("src/app.js", "export const ok = 2;\\n");',
      `process.stdout.write(${JSON.stringify(`${claudeEvent("npm test")}\n`)});`,
      ""
    ].join("\n"),
    "utf8"
  );
  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  const doc = profileJson({
    workspaceId: "claude-adapter",
    harnessMode: "COMMAND_EXEC",
    agentRole: "INFRA_OPERATOR",
    isolationMode: "NONE",
    // The allowlist is a decision, so a fresh workspace does not permit a second
    // adapter until somebody says so. This is that decision.
    allowedAdapters: ["codex", "claude"],
    harness: { allowDegradedCommandObservation: true, requireIsolationForMutation: false }
  }) as Record<string, any>;
  doc.defaults.run.agentAdapter = "codex";
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  // Through the fixture helper, not by hand. The overlay lives in local.json,
  // and a hand-written file at the wrong path falls through to the adapter's
  // default command silently — which in this test means launching the real CLI.
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/fake-claude.mjs"] });
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

  // The Profile default is codex. Only the Run Option accounts for claude
  // running instead.
  const execution = await runTask(root, "sample", undefined, { agentAdapter: "claude" });
  assert.equal(execution.result.status, "SUCCEEDED");
  assert.equal(execution.result.agent, "claude");

  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<
    string,
    any
  >;
  assert.equal(plan.selectedAgentAdapter.adapterId, "claude");
  assert.equal(plan.selectedAgentAdapter.selectionSource, "RUN_OPTION");

  // The Claude-shaped transcript was read by the Claude reader — a Codex-shaped
  // parser finds nothing in it, so this is the adapter's own parser running.
  const claimed = JSON.parse(
    await readFile(path.join(execution.runDir, "provider-commands.json"), "utf8")
  ) as Record<string, any>;
  assert.equal(claimed.authority, "PROVIDER_REPORTED_ONLY", "a claim is still only a claim");
  assert.equal(claimed.commands.length, 1);
  assert.equal(claimed.commands[0].raw, "npm test");
  assert.deepEqual(claimed.commands[0].argv, []);
});
