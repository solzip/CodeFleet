// defaults.run resolution: which adapter, which isolation, and what the
// AdapterRequest is allowed to say.
//
// REQUIRE_EXPLICIT is a deferral, not a value. Every test here checks that it is
// resolved or refused before an artifact exists, because an artifact carrying
// REQUIRE_EXPLICIT would be a Run Plan that never planned anything.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { loadProfile } from "../src/profile.ts";
import { findCapabilityExpansions, resolveAgentAdapter, resolveIsolation, runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson, type ProfileOverrides } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";
import { permitRun } from "./task-ledger-fixture.ts";

const ADAPTERS_BLOCK = "PROFILE_POLICY_AGENT_ADAPTERS_BLOCK";
const ADAPTER_SCHEMA = "PROFILE_DEFAULTS_RUN_AGENT_ADAPTER_SCHEMA";
const ISOLATION_SCHEMA = "PROFILE_DEFAULTS_RUN_ISOLATION_MODE_SCHEMA";
const WORKFLOW_SCHEMA = "PROFILE_DEFAULTS_TASK_WORKFLOW_SCHEMA";
const RESOLUTION = "RUN_PLAN_AGENT_ADAPTER_RESOLUTION";
const NO_EXPANSION = "ADAPTER_CANNOT_EXPAND_CAPABILITIES";

async function seedWith(document: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-adapter-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf8"
  );
  return root;
}

async function seedProfile(overrides: ProfileOverrides = {}): Promise<string> {
  return seedWith(profileJson(overrides));
}

function edited(mutate: (doc: Record<string, unknown>) => void): Record<string, unknown> {
  const doc = profileJson() as Record<string, unknown>;
  mutate(doc);
  return doc;
}

async function seedApprovedTask(root: string): Promise<void> {
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise adapter resolution",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
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
}

test("allowedAdapters must be a non-empty list of provider-agnostic AdapterIds", async () => {
  const empty = await seedWith(
    edited((d) => ((d.policies as Record<string, unknown>).agentAdapters = { allowedAdapters: [] }))
  );
  await assert.rejects(() => loadProfile(empty), /non-empty array/);

  // Each rejected value is a different way of naming a provider rather than a
  // capability: a model, a path, an executable, a CLI option.
  for (const bad of ["gpt-4.1", "/usr/local/bin/codex", "codex.exe", "--model", "Codex"]) {
    const root = await seedWith(
      edited((d) => ((d.policies as Record<string, unknown>).agentAdapters = { allowedAdapters: [bad] }))
    );
    await assert.rejects(() => loadProfile(root), /stable provider-agnostic AdapterId/, `${bad} must be refused`);
  }

  // A credential is shaped like a valid AdapterId, so the id rule alone would
  // accept it. The secret scan is what refuses it, and the rule is only
  // satisfied because both run over the same block.
  const token = await seedWith(
    edited(
      (d) =>
        ((d.policies as Record<string, unknown>).agentAdapters = {
          allowedAdapters: ["ghp-0123456789abcdefghijklmnop"]
        })
    )
  );
  await assert.rejects(() => loadProfile(token), /Invalid Project Profile/);

  coversRule(ADAPTERS_BLOCK, "policies.agentAdapters.allowedAdapters is a non-empty array");
  coversRule(ADAPTERS_BLOCK, "every allowedAdapters item is a stable provider-agnostic AdapterId");
  coversRule(
    ADAPTERS_BLOCK,
    "allowedAdapters contains no model name, command path, executable path, token, API key, CLI option, or transcript parsing rule"
  );
});

test("defaults.run.agentAdapter is REQUIRE_EXPLICIT or an allowed AdapterId", async () => {
  const deferred = await loadConfig(await seedProfile({ agentAdapter: "REQUIRE_EXPLICIT" }));
  assert.equal(deferred.agentAdapter, "REQUIRE_EXPLICIT", "the deferral survives load and is resolved later");

  for (const bad of ["gpt-4.1", "/usr/bin/codex", "--adapter"]) {
    const root = await seedWith(
      edited((d) => (((d.defaults as Record<string, unknown>).run as Record<string, unknown>).agentAdapter = bad))
    );
    await assert.rejects(() => loadProfile(root), /REQUIRE_EXPLICIT or a stable AdapterId/, `${bad} must be refused`);
  }

  // A default the policy forbids is a Profile that contradicts itself.
  const contradiction = await seedProfile({ agentAdapter: "other", allowedAdapters: ["codex"] });
  await assert.rejects(() => loadProfile(contradiction), /not in policies\.agentAdapters\.allowedAdapters/);

  coversRule(ADAPTER_SCHEMA, "defaults.run.agentAdapter is either REQUIRE_EXPLICIT or a stable AdapterId");
  coversRule(ADAPTER_SCHEMA, "if concrete, defaults.run.agentAdapter is in policies.agentAdapters.allowedAdapters");
  coversRule(
    ADAPTER_SCHEMA,
    "defaults.run.agentAdapter is not a model name, command path, executable path, token, API key, CLI option, or provider-specific setting"
  );
});

test("defaults.run.isolationMode names a mode, and the Run Plan records a concrete one", async () => {
  for (const bad of ["/tmp/worktree", "sha256:abc", "docker.sock", "git worktree add"]) {
    const root = await seedWith(
      edited((d) => (((d.defaults as Record<string, unknown>).run as Record<string, unknown>).isolationMode = bad))
    );
    await assert.rejects(() => loadProfile(root), /must be one of/, `${bad} must be refused`);
  }

  for (const mode of ["NONE", "GIT_WORKTREE", "TEMP_WORKSPACE", "CONTAINER", "REQUIRE_EXPLICIT"]) {
    const config = await loadConfig(await seedProfile({ isolationMode: mode }));
    assert.equal(config.isolationMode, mode);
  }

  // REQUIRE_EXPLICIT is resolved before the AdapterRequest exists, or refused.
  const deferred = await loadConfig(await seedProfile({ isolationMode: "REQUIRE_EXPLICIT" }));
  assert.match(resolveIsolation(deferred).blockedReason, /isolationMode is REQUIRE_EXPLICIT/);

  const concrete = resolveIsolation(await loadConfig(await seedProfile({ isolationMode: "GIT_WORKTREE" })));
  assert.equal(concrete.blockedReason, "");
  assert.equal(concrete.mode, "GIT_WORKTREE");
  assert.ok(concrete.reason.length > 0, "a recorded mode carries the reason it was chosen");

  const root = await seedProfile({ isolationMode: "NONE" });
  await seedApprovedTask(root);
  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, unknown>;
  const isolation = plan.isolation as { mode: string; reason: string };
  assert.equal(isolation.mode, "NONE");
  assert.ok(isolation.reason.length > 0);

  coversRule(
    ISOLATION_SCHEMA,
    "defaults.run.isolationMode is one of REQUIRE_EXPLICIT, NONE, GIT_WORKTREE, TEMP_WORKSPACE, CONTAINER"
  );
  coversRule(
    ISOLATION_SCHEMA,
    "defaults.run.isolationMode does not contain a local path, container id, image tag, socket path, token, credential, or shell command"
  );
  coversRule(ISOLATION_SCHEMA, "Run Plan resolves REQUIRE_EXPLICIT before AdapterRequest creation");
  coversRule(ISOLATION_SCHEMA, "Run Plan records a concrete isolation.mode and reason");
});

test("defaults.task.workflow stages are ordered planner stages, not Run Summary labels", async () => {
  const withWorkflow = (stages: unknown): Record<string, unknown> =>
    edited((d) => (((d.defaults as Record<string, unknown>).task as Record<string, unknown>).workflow = { stages }));

  assert.equal((await loadProfile(await seedProfile())).profile.defaults !== undefined, true, "absent is allowed");

  const emptyStages = await seedWith(withWorkflow([]));
  await assert.rejects(() => loadProfile(emptyStages), /non-empty ordered array/);

  const deferredStage = await seedWith(withWorkflow(["PLAN", "REQUIRE_EXPLICIT"]));
  await assert.rejects(() => loadProfile(deferredStage), /REQUIRE_EXPLICIT is not a stage/);
  for (const label of ["BUILD", "FIX", "CHECK", "DOCS", "OPS"]) {
    const root = await seedWith(withWorkflow(["PLAN", label]));
    await assert.rejects(() => loadProfile(root), /Run Summary label/, `${label} must be refused`);
  }
  const unknownStage = await seedWith(withWorkflow(["IMPLEMENT"]));
  await assert.rejects(() => loadProfile(unknownStage), /must be one of PLAN/);

  const ok = await loadProfile(await seedWith(withWorkflow(["PLAN", "INSPECT", "APPLY", "VERIFY", "REVIEW"])));
  assert.ok(ok.profile.defaults);

  coversRule(WORKFLOW_SCHEMA, "defaults.task.workflow is absent or an object with a stages array");
  coversRule(WORKFLOW_SCHEMA, "when present, workflow.stages is a non-empty ordered array");
  coversRule(WORKFLOW_SCHEMA, "every workflow.stages item is one of PLAN, INSPECT, APPLY, VERIFY, REVIEW");
  coversRule(WORKFLOW_SCHEMA, "workflow.stages contains no REQUIRE_EXPLICIT value");
  coversRule(
    WORKFLOW_SCHEMA,
    "workflow.stages contains no RunSummary-only value such as BUILD, FIX, CHECK, DOCS, OPS"
  );
});

test("adapter resolution is concrete, policy-allowed, locally available, and recorded", async () => {
  const deferred = resolveAgentAdapter(await loadConfig(await seedProfile({ agentAdapter: "REQUIRE_EXPLICIT" })));
  assert.equal(deferred.selectionSource, "REQUIRE_EXPLICIT_UNRESOLVED");
  assert.match(deferred.blockedReason, /REQUIRE_EXPLICIT/);

  // Policy-allowed but absent from this build is a different failure from
  // policy-forbidden, and saying so sends the reader to the right file.
  const unavailable = resolveAgentAdapter(
    await loadConfig(await seedProfile({ agentAdapter: "other", allowedAdapters: ["codex", "other"] }))
  );
  assert.equal(unavailable.policyAllowed, true);
  assert.equal(unavailable.locallyAvailable, false);
  assert.match(unavailable.blockedReason, /not in this build's adapter registry/);

  const ok = resolveAgentAdapter(await loadConfig(await seedProfile()));
  assert.equal(ok.blockedReason, "");
  assert.equal(ok.selectedAgentAdapter, "codex");
  assert.equal(ok.selectionSource, "PROFILE_DEFAULT");

  // A blocked plan leaves no Run Trace, and touches none of its sources.
  const blocked = await seedProfile({ agentAdapter: "other", allowedAdapters: ["codex", "other"] });
  await seedApprovedTask(blocked);
  const profileBefore = await readFile(path.join(blocked, ".codefleet", "config.json"), "utf8");
  const taskBefore = await readFile(path.join(blocked, ".codefleet", "tasks", "sample.yaml"), "utf8");
  await assert.rejects(() => runTask(blocked, "sample"), /adapter registry/);
  assert.deepEqual(await readdir(path.join(blocked, ".codefleet", "runs")), [], "a blocked plan writes no Run directory");
  assert.equal(await readFile(path.join(blocked, ".codefleet", "config.json"), "utf8"), profileBefore);
  assert.equal(await readFile(path.join(blocked, ".codefleet", "tasks", "sample.yaml"), "utf8"), taskBefore);

  const root = await seedProfile();
  await seedApprovedTask(root);
  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, unknown>;
  const recorded = plan.adapterResolution as Record<string, unknown>;
  assert.equal(recorded.selectionSource, "PROFILE_DEFAULT");
  assert.equal(recorded.policyAllowed, true);
  assert.equal(recorded.locallyAvailable, true);
  assert.ok((recorded.evidence as Record<string, unknown>).allowedAdaptersRef);

  coversRule(RESOLUTION, "selectedAgentAdapter is concrete");
  coversRule(RESOLUTION, "selectedAgentAdapter is in policies.agentAdapters.allowedAdapters");
  coversRule(RESOLUTION, "selectedAgentAdapter is available in the local adapter registry");
  coversRule(
    RESOLUTION,
    "RunPlan.adapterResolution records selectionSource, policyAllowed, locallyAvailable, and evidence references"
  );
  coversRule(
    RESOLUTION,
    "Run Planning does not modify Project Profile, Local Overlay, or Task Revision while selecting an adapter"
  );
});

test("an AdapterRequest may narrow the effective policy and never widen it", () => {
  const effective = {
    fileEdit: false,
    commandExecution: false,
    allowedPaths: ["src/**"],
    deniedPaths: ["secrets/**", ".env"],
    allowedCommands: ["npm test"],
    deniedCommands: ["git push", "rm -rf"]
  };

  assert.deepEqual(findCapabilityExpansions({ ...effective }, effective), [], "an identical request expands nothing");
  assert.deepEqual(
    findCapabilityExpansions(
      { ...effective, allowedPaths: [], deniedPaths: ["secrets/**", ".env", "extra/**"] },
      effective
    ),
    [],
    "narrower allowed and broader denied are both permitted"
  );

  const widened: [Record<string, unknown>, string][] = [
    [{ ...effective, fileEdit: true }, "fileEdit"],
    [{ ...effective, commandExecution: true }, "commandExecution"],
    [{ ...effective, allowedPaths: ["src/**", "infra/**"] }, "allowedPaths"],
    [{ ...effective, deniedPaths: ["secrets/**"] }, "deniedPaths"],
    [{ ...effective, allowedCommands: ["npm test", "terraform apply"] }, "allowedCommands"],
    [{ ...effective, deniedCommands: ["git push"] }, "deniedCommands"]
  ];
  for (const [request, field] of widened) {
    const found = findCapabilityExpansions(request, effective);
    assert.equal(found.length, 1, `${field} must be reported`);
    assert.equal(found[0].field, field);
  }

  coversRule(NO_EXPANSION, "AdapterRequest fileEdit does not exceed effectivePolicy file edit permission");
  coversRule(
    NO_EXPANSION,
    "AdapterRequest commandExecution does not exceed effectivePolicy command execution permission"
  );
  coversRule(NO_EXPANSION, "AdapterRequest allowedPaths are equal to or narrower than effectivePolicy allowed paths");
  coversRule(NO_EXPANSION, "AdapterRequest deniedPaths are equal to or broader than effectivePolicy denied paths");
  coversRule(
    NO_EXPANSION,
    "AdapterRequest allowedCommands are equal to or narrower than effectivePolicy allowed commands"
  );
  coversRule(
    NO_EXPANSION,
    "AdapterRequest deniedCommands are equal to or broader than effectivePolicy denied commands"
  );
});

// Run Options: explicit execution input for one Run request.
//
// The design separates them from both the Project Profile and the Task
// contract — "Run Options는 Project Profile에 저장하지 않는다" — and names an
// agentAdapter override as the example. The contract fixes the role; which CLI
// carries it out is a property of this run. Before this the adapter could only
// come from the Profile, so running the same contract through a different
// adapter meant editing the workspace's default. S4.
test("a Run Option chooses the adapter for one Run and is recorded as its source", async () => {
  const root = await seedWith(
    profileJson({
      workspaceId: "run-options",
      // REQUIRE_EXPLICIT is a deferral. Nothing in the Profile answers it, so a
      // Run that proceeds here proceeded because the Run Option answered it.
      agentAdapter: "REQUIRE_EXPLICIT",
      allowedAdapters: ["codex"]
    })
  );
  await seedApprovedTask(root);

  await assert.rejects(() => runTask(root, "sample"), /REQUIRE_EXPLICIT/);

  const execution = await runTask(root, "sample", undefined, { agentAdapter: "codex" });
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<
    string,
    any
  >;
  assert.equal(plan.selectedAgentAdapter.adapterId, "codex");
  assert.equal(
    plan.selectedAgentAdapter.selectionSource,
    "RUN_OPTION",
    "the Run Plan says the choice was made here, not inherited from the workspace"
  );
  assert.equal(plan.runOptions.agentAdapter, "codex", "the request is recorded as given");

  // And it is not written back. The next Run without the option is deferred
  // again, which is what "not stored in the Project Profile" has to mean.
  const config = await loadConfig(root);
  assert.equal(config.agentAdapter, "REQUIRE_EXPLICIT");
  await assert.rejects(() => runTask(root, "sample"), /REQUIRE_EXPLICIT/);
});

test("a Run Option cannot reach outside the adapter allowlist", async () => {
  const config = await loadConfig(
    await seedWith(profileJson({ workspaceId: "run-options-policy", allowedAdapters: ["codex"] }))
  );

  // An override that could bypass policy would be a way to widen it per run,
  // which is the one thing a Run Option must not be.
  const denied = resolveAgentAdapter(config, { agentAdapter: "something-else" });
  assert.notEqual(denied.blockedReason, "");
  assert.match(denied.blockedReason, /allowedAdapters/);
  // The refusal says the choice was made with the flag, so the reader edits the
  // right thing.
  assert.match(denied.blockedReason, /chosen with --adapter/);

  // No option at all still resolves from the Profile, so the refusal above is
  // the allowlist working rather than overrides being broken.
  const fromProfile = resolveAgentAdapter(config);
  assert.equal(fromProfile.blockedReason, "");
  assert.equal(fromProfile.selectionSource, "PROFILE_DEFAULT");

  // No coverage claim here on purpose. This test checks the allowlist refusal,
  // and that condition is already claimed above by the test that reads the
  // Run Plan. A claim quoting "selectionSource" stood here and quoted no
  // condition line at all — the checker rejected it and npm test exited
  // non-zero from S4 (3db7d64) until it was removed. P1-61.
});
