import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { blockedCommandChannelReason, runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { coversRule } from "./rule-coverage.ts";
import { profileJson, writeLocalOverlay } from "./profile-fixture.ts";

const SNAPSHOT = "HARNESS_WORKSPACE_SNAPSHOT_IS_STATE_EVIDENCE";
const COMMAND_TRUTH = "COMMAND_TRUTH_REQUIRES_HARNESS_VISIBLE_CHANNEL";
const UNTRACKED = "GENERATED_UNTRACKED_AND_GITIGNORED_FILES_ARE_POLICY_SUBJECTS";
const DELETE_RENAME = "DELETE_AND_RENAME_CHECK_SOURCE_AND_TARGET";
const SYMLINK = "SYMLINK_TARGET_MUST_NOT_ESCAPE_PATH_POLICY";
const S2_LAYOUT = "S2_MINIMUM_ARTIFACT_LAYOUT_IS_FIXED";
const S2_THREE = "S2_RUN_ATTEMPT_ALWAYS_LEAVES_THREE_ARTIFACTS";
const REQ_AGNOSTIC = "ADAPTER_REQUEST_IS_PROVIDER_AGNOSTIC";
const RESULT_EVIDENCE = "ADAPTER_RESULT_IS_EVIDENCE_NOT_DECISION";
const TRACE_ARTIFACTS = "ADAPTER_REQUEST_AND_RESULT_ARE_RUN_TRACE_ARTIFACTS";
const OBSERVATION = "HARNESS_OBSERVATION_OWNS_EXECUTION_EVIDENCE";
const VERIF_EVIDENCE = "VERIFICATION_EVIDENCE_IS_HARNESS_OWNED";
const VERIF_EXEC = "VERIFICATION_EXECUTION_IS_HARNESS_OWNED_EVIDENCE";
const SUMMARY_LAYOUT = "RUN_SUMMARY_VERIFICATION_AND_LOCAL_REVIEW_LAYOUT_FIXED";
const PLAN_IMMUTABLE = "RUN_PLAN_IS_IMMUTABLE_RESUME_BOUNDARY";
const TASK_SOURCE = "TASK_REVISION_MINIMUM_CONTRACT_IS_SOURCE_ONLY";
const CMD_AUTHORITY = "COMMAND_EXECUTION_REQUIRES_OBSERVABLE_AUTHORITY_OR_DEGRADED_POLICY";

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

test("runTask writes run-plan and S2 artifacts before legacy result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "run-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
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

  const runPlan = await readJson(path.join(execution.runDir, "run-plan.json"));
  const adapterRequest = await readJson(path.join(execution.runDir, "adapter-request.json"));
  const harnessObservation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const adapterResult = await readJson(path.join(execution.runDir, "adapter-result.json"));
  const verificationEvidence = await readJson(path.join(execution.runDir, "verification", "verify-001.json"));
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));
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
  assert.equal(verificationEvidence.documentKind, "VERIFICATION_EVIDENCE");
  assert.equal(verificationEvidence.verificationAttemptId, "verify-001");
  assert.equal(verificationEvidence.authority, "NONE");
  assert.equal(verificationEvidence.observedCheck, "NONE");
  assert.equal(verificationEvidence.verificationGateResult, "NOT_SATISFIED");
  assert.equal(verificationEvidence.verificationGateReason, "MISSING");
  assert.equal(verificationEvidence.unavailableReason, "NO_VERIFICATION_COMMANDS_CONFIGURED");
  assert.deepEqual(verificationEvidence.attempts, [
    {
      commandId: "verification-unavailable",
      command: [],
      cwdRef: "",
      authority: "NONE",
      decision: "UNAVAILABLE",
      startedAt: verificationEvidence.createdAt,
      endedAt: verificationEvidence.createdAt,
      exitCode: null,
      stdoutRef: {
        unavailableReason: "COMMAND_NOT_EXECUTED"
      },
      stderrRef: {
        unavailableReason: "COMMAND_NOT_EXECUTED"
      },
      logRef: {
        unavailableReason: "NO_VERIFICATION_COMMANDS_CONFIGURED"
      },
      result: "NONE",
      blockedReason: "",
      unavailableReason: "NO_VERIFICATION_COMMANDS_CONFIGURED"
    }
  ]);
  assert.equal(
    (verificationEvidence.verificationPlanRef as { path: string }).path,
    `${execution.result.runPlanPath}#/verificationPlan`
  );
  assert.equal(runSummary.documentKind, "RUN_SUMMARY");
  assert.equal(runSummary.finalDecisionTruth, false);
  assert.equal((runSummary.result as { value: string }).value, "UNKNOWN");
  assert.deepEqual(runSummary.check, {
    observedCheck: "NONE",
    verificationGateResult: "NOT_SATISFIED",
    verificationGateReason: "MISSING",
    derivedFromVerificationAttemptIds: ["verify-001"],
    // No verification plan means nothing was attempted, and the counts say so
    // rather than leaving a reader to infer it from the gate reason.
    scanScope: { attemptsRecorded: 0, attemptsExecuted: 0, attemptsBlocked: 0 }
  });
  const runSummaryInputs = runSummary.inputs as {
    runPlanRef: { path: string };
    adapterRequestRef: { contentHash: string };
    verificationEvidenceRef: { path: string; contentHash: string };
    verificationEvidenceRefs: Array<{ path: string; contentHash: string }>;
  };
  assert.equal(runSummaryInputs.runPlanRef.path, execution.result.runPlanPath);
  assert.equal(
    runSummaryInputs.adapterRequestRef.contentHash,
    hashFile(JSON.stringify(adapterRequest, null, 2) + "\n")
  );
  assert.match(runSummaryInputs.verificationEvidenceRef.path, /^\.codefleet\/runs\/.+\/verification\/verify-001\.json$/);
  assert.equal(
    runSummaryInputs.verificationEvidenceRef.contentHash,
    hashFile(JSON.stringify(verificationEvidence, null, 2) + "\n")
  );
  assert.deepEqual(runSummaryInputs.verificationEvidenceRefs, [runSummaryInputs.verificationEvidenceRef]);
  assert.equal(
    (runSummary.evidenceAuthority as { commandEvidenceAuthority: string }).commandEvidenceAuthority,
    "NONE"
  );
  assert.equal((runSummary.policy as { computedRisk: string }).computedRisk, "UNKNOWN");
  const pathViolationSummary = (runSummary.policy as {
    pathViolationSummary: { evaluated: boolean; unavailableReason: string };
  }).pathViolationSummary;
  // No git repository exists in this fixture, so changed-files evidence is
  // unavailable and path policy must report that rather than "no violations".
  assert.equal(pathViolationSummary.evaluated, false);
  assert.equal(pathViolationSummary.unavailableReason, "GIT_CHANGED_FILES_FAILED");
  const normalization = runSummary.normalization as { status: string; unavailableReasons: string[] };
  assert.equal(normalization.status, "PARTIAL");
  assert.ok(normalization.unavailableReasons.includes("COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"));
  assert.ok(normalization.unavailableReasons.includes("NO_VERIFICATION_COMMANDS_CONFIGURED"));
  assert.ok(normalization.unavailableReasons.includes("GIT_CHANGED_FILES_FAILED"));
  assert.ok(!normalization.unavailableReasons.includes("VERIFICATION_EVIDENCE_NOT_IMPLEMENTED_V02"));
  assert.equal((runSummary.safeguards as { canProduceVerified: boolean }).canProduceVerified, false);
  assert.equal(legacyResult.adapterResultPath, execution.result.adapterResultPath);
  assert.equal(legacyResult.runSummaryPath, execution.result.runSummaryPath);

  coversRule(
    S2_LAYOUT,
    "adapter-request.json contains no provider token, provider model, provider-specific CLI option, local command path, or transcript parsing rule"
  );
  coversRule(
    S2_LAYOUT,
    "adapter-result.json is created after adapter completion, launch failure, timeout, cancellation, or malformed output"
  );
  coversRule(REQ_AGNOSTIC, "AdapterRequest contains stable CodeFleet ids and references");
  coversRule(REQ_AGNOSTIC, "AdapterRequest contains no provider-specific CLI option");
  coversRule(RESULT_EVIDENCE, "AdapterResult records adapterExecutionStatus");
  coversRule(
    RESULT_EVIDENCE,
    "Core normalizer derives Run Summary from Run Trace, AdapterResult, HarnessObservation, and verification evidence"
  );
  coversRule(
    SUMMARY_LAYOUT,
    "run-summary.json contains normalized execution fields plus refs/hash for its evidence inputs"
  );
  coversRule(
    SUMMARY_LAYOUT,
    "VerificationEvidence hash is the canonical content hash of the attempt artifact"
  );
  coversRule(
    VERIF_EVIDENCE,
    "if verification is required, Execution Harness creates VerificationEvidence even when no command could be run"
  );
  coversRule(VERIF_EVIDENCE, "VerificationEvidence is stored as a durable Run Trace Evidence artifact");
  coversRule(PLAN_IMMUTABLE, "run-plan.json has a stable runPlanId and runId");
  coversRule(
    PLAN_IMMUTABLE,
    "run-plan.json records source refs and hashes for Task Revision and Project Profile"
  );
  coversRule(PLAN_IMMUTABLE, "run-plan.json records artifactPlan paths for required Run artifacts");
  coversRule(TRACE_ARTIFACTS, "prompt artifact is referenced by AdapterRequest");
});

test("the workspace snapshot sees a change git is configured to ignore", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-snapshot-e2e-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "tracked.js"), "export const a = 1;\n", "utf8");
  // git is told to ignore the generated file, so git status and git diff will
  // both report nothing about it. The scoped snapshot is the only channel that
  // can still see it, which is the whole reason it exists.
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\nsrc/generated.js\n", "utf8");

  const git = async (args: string[]): Promise<void> => {
    const { spawnSync } = await import("node:child_process");
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  };
  await git(["init"]);
  await git(["add", "-A"]);
  await git(["commit", "-m", "init"]);

  const agentPath = path.join(root, "agent.mjs");
  await writeFile(
    agentPath,
    [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync("src/tracked.js", ${JSON.stringify("export const a = 2;\n")});`,
      `writeFileSync("src/generated.js", ${JSON.stringify("export const g = 1;\n")});`,
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "snapshot-e2e", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise workspace state evidence",
      "scope:",
      "  include: [src/**]",
      "  exclude: [secrets/**]",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));
  const pre = await readJson(path.join(execution.runDir, "workspace-pre-run.json"));
  const post = await readJson(path.join(execution.runDir, "workspace-post-run.json"));

  assert.equal(pre.phase, "PRE_RUN");
  assert.equal(post.phase, "POST_RUN");
  assert.equal(pre.documentKind, "HARNESS_WORKSPACE_SNAPSHOT");

  const workspace = observation.workspace as {
    preRunStateRef: { path?: string; unavailableReason?: string };
    postRunStateRef: { path?: string; unavailableReason?: string };
    snapshotGaps: string[];
    scanScope: Record<string, number>;
  };
  assert.match(String(workspace.preRunStateRef.path), /workspace-pre-run\.json$/);
  assert.match(String(workspace.postRunStateRef.path), /workspace-post-run\.json$/);
  assert.deepEqual(workspace.snapshotGaps, []);
  assert.equal(workspace.scanScope.preRunFilesHashed, 1);
  assert.equal(workspace.scanScope.postRunFilesHashed, 2);

  const changes = observation.changes as {
    changedFiles: string[];
    workspaceDelta: { added: string[]; modified: string[]; removed: string[]; unavailableReason: string };
  };
  assert.deepEqual(changes.workspaceDelta.added, ["src/generated.js"]);
  assert.deepEqual(changes.workspaceDelta.modified, ["src/tracked.js"]);
  assert.deepEqual(changes.workspaceDelta.removed, []);
  assert.equal(changes.workspaceDelta.unavailableReason, "");

  // The point of the comparison: git's channel misses the ignored file, so if
  // the delta agreed with git it would be adding nothing.
  assert.ok(
    !changes.changedFiles.includes("src/generated.js"),
    "git is expected to miss the ignored file; if it stops missing it this test proves nothing"
  );

  const normalization = runSummary.normalization as { unavailableReasons: string[] };
  assert.ok(
    !normalization.unavailableReasons.includes("WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02"),
    "the capability gap must be gone, not merely unreported"
  );
  assert.ok(
    !normalization.unavailableReasons.some((reason) => reason.startsWith("PRE_RUN_")),
    "a complete snapshot must leave no pre-run gap"
  );

  const record = await readFile(path.join(execution.runDir, "run-record.md"), "utf8");
  assert.match(record, /added 1, modified 1, removed 0/);
  assert.match(record, /added: src\/generated\.js/);

  coversRule(SNAPSHOT, "preRunStateRef references a HarnessWorkspaceSnapshot with phase = PRE_RUN");
  coversRule(SNAPSHOT, "postRunStateRef references a HarnessWorkspaceSnapshot with phase = POST_RUN");
  coversRule(UNTRACKED, "gitignored files inside scoped snapshot coverage do not bypass path policy");
});

test("a provider-reported command is recorded but never becomes command truth", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-transcript-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "a.js"), "export const a = 1;\n", "utf8");

  // The agent claims, in its transcript, to have run a command that the Task
  // scope would forbid and that would satisfy verification if believed.
  const claims = [
    JSON.stringify({ type: "exec_command_begin", command: ["rm", "-rf", "/etc"] }),
    JSON.stringify({ type: "command", command: ["npm", "test"], exitCode: 0 })
  ];
  await writeFile(
    path.join(root, "agent.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync("src/a.js", ${JSON.stringify("export const a = 2;\n")});`,
      ...claims.map((line) => `console.log(${JSON.stringify(line)});`),
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "transcript-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise provider-reported command evidence",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));
  const claimed = await readJson(path.join(execution.runDir, "provider-commands.json"));

  const commands = observation.commands as {
    authority: string;
    commandsObserved: unknown[];
    commandsExecutedByHarness: unknown[];
    providerReportedCommandsRef: { path?: string; unavailableReason?: string };
    transcriptScanScope: Record<string, number>;
    unavailableReason: string;
  };

  // Recorded, and recorded at the grade that says nobody watched it happen.
  assert.equal(commands.authority, "PROVIDER_REPORTED_ONLY");
  assert.equal(commands.commandsObserved.length, 2);
  assert.match(String(commands.providerReportedCommandsRef.path), /provider-commands\.json$/);
  assert.equal(commands.transcriptScanScope.commandEventsFound, 2);
  assert.equal(claimed.notCommandTruth, true);

  // The claims change nothing a decision depends on.
  assert.deepEqual(commands.commandsExecutedByHarness, []);
  assert.equal(
    commands.unavailableReason,
    "COMMAND_CHANNEL_NOT_HARNESS_VISIBLE",
    "a provider claim does not make the command channel visible"
  );
  const policyChecks = observation.policyChecks as { commandViolations: unknown[] };
  assert.deepEqual(
    policyChecks.commandViolations,
    [],
    "a claimed rm -rf must not be judged as a violation: judging it would mean believing it"
  );
  const check = runSummary.check as { observedCheck: string; verificationGateResult: string };
  assert.equal(check.observedCheck, "NONE", "a claimed passing npm test must not open the gate");
  assert.equal(check.verificationGateResult, "NOT_SATISFIED");
  const authority = runSummary.evidenceAuthority as { verificationAuthority: string };
  assert.equal(authority.verificationAuthority, "NONE");

  const reasons = (runSummary.normalization as { unavailableReasons: string[] }).unavailableReasons;
  assert.ok(
    !reasons.includes("PROVIDER_TRANSCRIPT_PARSING_NOT_IMPLEMENTED_V02"),
    "the parsing gap must be gone"
  );
  assert.ok(
    reasons.includes("COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"),
    "the observation gap must remain: parsing a transcript did not make commands observable"
  );

  coversRule(COMMAND_TRUTH, "PROVIDER_REPORTED_ONLY commands are not command truth");
  coversRule(COMMAND_TRUTH, "provider transcript claims are not command truth");
  coversRule(COMMAND_TRUTH, "command policy compliance cannot be satisfied from PROVIDER_REPORTED_ONLY");
  coversRule(COMMAND_TRUTH, "verification command evidence cannot be satisfied from PROVIDER_REPORTED_ONLY");
});

async function seedCommandPolicyRun(
  label: string,
  commandsPolicy: Record<string, unknown>,
  verification: string[]
): Promise<{ root: string; runDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), `codefleet-${label}-`));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "a.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, "agent.mjs"), "\n", "utf8");
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: label, harnessMode: "COMMAND_EXEC", policies: {
        commands: commandsPolicy,
        // Commands run outside any Harness-visible channel, which Run Planning
        // blocks unless the profile records that decision.
        harness: { allowDegradedCommandObservation: true }
      } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise command policy",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [edit]",
      "status: READY",
      "verification:",
      "  commands:",
      "    - commandId: v1",
      `      command: [${verification.join(", ")}]`,
      ""
    ].join("\n"),
    "utf8"
  );
  await approveForTest(root, "sample");
  const execution = await runTask(root, "sample");
  return { root, runDir: execution.runDir };
}

test("a Run that may execute unobservable commands is blocked before any artifact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-channel-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(path.join(root, "agent.mjs"), "\n", "utf8");
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    // No policies block at all: the strict default must apply.
    `${JSON.stringify(profileJson({ workspaceId: "channel-test", harnessMode: "COMMAND_EXEC" }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise the command channel block",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [edit]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );
  await approveForTest(root, "sample");

  await assert.rejects(() => runTask(root, "sample"), /Run Planning is blocked/);

  // Blocked at planning means no Run Trace: there is nothing to review, and a
  // half-written Run directory would look like an attempt that happened.
  assert.deepEqual(await readdir(path.join(root, ".codefleet", "runs")), []);

  coversRule(
    "COMMAND_EXECUTION_REQUIRES_OBSERVABLE_AUTHORITY_OR_DEGRADED_POLICY",
    "if commandExecution is true and no Harness-visible command channel exists, Run Planning is blocked by default"
  );
  coversRule(
    "COMMAND_EXECUTION_REQUIRES_OBSERVABLE_AUTHORITY_OR_DEGRADED_POLICY",
    "degraded command observation may be allowed only by explicit policy"
  );
});

test("the command channel block turns on and off for exactly one reason each", () => {
  const base = {
    commandExecution: true,
    requireHarnessVisibleCommandChannel: true,
    harnessVisibleCommandChannel: false,
    allowDegradedCommandObservation: false
  };

  assert.match(String(blockedCommandChannelReason(base)), /Run Planning is blocked/);

  // A dry run executes nothing, so there is nothing to observe.
  assert.equal(blockedCommandChannelReason({ ...base, commandExecution: false }), null);
  // An observable channel removes the reason entirely.
  assert.equal(blockedCommandChannelReason({ ...base, harnessVisibleCommandChannel: true }), null);
  // Either switch alone is enough to permit it, and both are written decisions.
  assert.equal(blockedCommandChannelReason({ ...base, allowDegradedCommandObservation: true }), null);
  assert.equal(blockedCommandChannelReason({ ...base, requireHarnessVisibleCommandChannel: false }), null);
});

test("a denied verification command is blocked and recorded as a command violation", async () => {
  // The whole point of policies.commands: before this was wired, this command
  // ran and passed, and commandViolations was a hardcoded empty list.
  const { runDir } = await seedCommandPolicyRun(
    "cmd-denied",
    { deniedCommands: [{ argv: ["node", "-e"] }] },
    ["node", "-e", '"process.exit(0)"']
  );

  const observation = await readJson(path.join(runDir, "harness-observation.json"));
  const runSummary = await readJson(path.join(runDir, "run-summary.json"));
  const checks = observation.policyChecks as {
    commandViolations: { violationCode: string; authority: string; commandId: string }[];
    commandPolicyEvaluation: { evaluated: boolean; scope: string; scanScope: Record<string, number> };
  };

  assert.equal(checks.commandViolations.length, 1);
  assert.equal(checks.commandViolations[0].violationCode, "MATCHES_DENIED_COMMANDS");
  assert.equal(checks.commandViolations[0].commandId, "v1");
  assert.equal(checks.commandViolations[0].authority, "HARNESS_EXECUTED");
  assert.equal(checks.commandPolicyEvaluation.scope, "HARNESS_EXECUTED_COMMANDS_ONLY");
  assert.equal(checks.commandPolicyEvaluation.scanScope.deniedMatchers, 1);
  assert.equal(checks.commandPolicyEvaluation.scanScope.violationsFound, 1);

  // A blocked command produces SKIP, never PASS, and the gate stays shut.
  const check = runSummary.check as {
    observedCheck: string;
    verificationGateResult: string;
    verificationGateReason: string;
  };
  assert.equal(check.observedCheck, "SKIP");
  assert.equal(check.verificationGateResult, "NOT_SATISFIED");
  assert.equal(check.verificationGateReason, "BLOCKED");

  // The Run must name why it has no verification evidence rather than leaving
  // authority NONE with nothing attached.
  const reasons = (runSummary.normalization as { unavailableReasons: string[] }).unavailableReasons;
  assert.ok(
    reasons.includes("VERIFICATION_BLOCKED_BY_COMMAND_POLICY:1"),
    `expected a blocked-by-policy reason, got ${JSON.stringify(reasons)}`
  );
});

test("a command outside a non-empty allowlist is blocked, and inside it runs", async () => {
  const outside = await seedCommandPolicyRun(
    "cmd-outside",
    { allowedCommands: [{ argv: ["npm", "test"] }] },
    ["node", "-e", '"process.exit(0)"']
  );
  const outsideChecks = (await readJson(path.join(outside.runDir, "harness-observation.json")))
    .policyChecks as { commandViolations: { violationCode: string }[] };
  assert.equal(outsideChecks.commandViolations[0].violationCode, "OUTSIDE_ALLOWED_COMMANDS");

  const inside = await seedCommandPolicyRun(
    "cmd-inside",
    { allowedCommands: [{ argv: ["node"] }] },
    ["node", "-e", '"process.exit(0)"']
  );
  const insideObservation = await readJson(path.join(inside.runDir, "harness-observation.json"));
  const insideChecks = insideObservation.policyChecks as {
    commandViolations: unknown[];
    commandPolicyEvaluation: { scanScope: Record<string, number> };
  };
  assert.deepEqual(insideChecks.commandViolations, []);
  assert.equal(insideChecks.commandPolicyEvaluation.scanScope.commandsChecked, 1);

  // Zero violations must be distinguishable from zero commands examined.
  assert.equal(insideChecks.commandPolicyEvaluation.scanScope.allowedMatchers, 1);
  const insideSummary = await readJson(path.join(inside.runDir, "run-summary.json"));
  assert.equal((insideSummary.check as { observedCheck: string }).observedCheck, "PASS");
});

test("a destructive command is blocked when no approval covers its category", async () => {
  const { runDir } = await seedCommandPolicyRun(
    "cmd-destructive",
    { destructiveCommands: [{ categoryId: "NODE_EVAL", argv: ["node", "-e"] }] },
    ["node", "-e", '"process.exit(0)"']
  );

  const checks = (await readJson(path.join(runDir, "harness-observation.json"))).policyChecks as {
    commandViolations: { violationCode: string }[];
    commandPolicyEvaluation: { scanScope: Record<string, number> };
  };
  assert.equal(checks.commandViolations[0].violationCode, "DESTRUCTIVE_WITHOUT_APPROVAL");
  assert.equal(checks.commandPolicyEvaluation.scanScope.destructiveMatchers, 1);

  coversRule(
    "DESTRUCTIVE_COMMAND_CATEGORY_IS_APPROVAL_UNIT",
    "matching a destructive entry blocks execution unless a covering durable approval exists."
  );
});

test("runTask rejects projectPath outside the workspace before S2 artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-path-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "codefleet-outside-project-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "path-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
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
      "  include: [src/**]",
      "  exclude: [secrets/**]",
      "constraints: []",
      "doneCriteria: [No run artifacts]",
      "workflow: [Plan]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  // Approved, so the refusal below is genuinely about the path rather than a
  // missing approval that would be reported first.
  await approveForTest(root, "sample");

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
    `${JSON.stringify(profileJson({ workspaceId: "file-path-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
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
      "  include: [src/**]",
      "  exclude: [secrets/**]",
      "constraints: []",
      "doneCriteria: [No run artifacts]",
      "workflow: [Plan]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  await assert.rejects(() => runTask(root, "sample"), /workspace directory/);
  assert.deepEqual(await readdir(path.join(root, ".codefleet", "runs")), []);
});

test("runTask preserves S2 artifacts when adapter creation fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-run-failure-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "failure-test", agentAdapter: "missing-adapter", harnessMode: "DRY_RUN" }), null, 2)}\n`,
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
      "  include: [src/**]",
      "  exclude: [secrets/**]",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Run missing adapter]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");

  const adapterRequest = await readJson(path.join(execution.runDir, "adapter-request.json"));
  const harnessObservation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const adapterResult = await readJson(path.join(execution.runDir, "adapter-result.json"));
  const verificationEvidence = await readJson(path.join(execution.runDir, "verification", "verify-001.json"));
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));
  const legacyResult = await readJson(path.join(execution.runDir, "result.json"));

  assert.equal(execution.result.status, "FAILED");
  assert.equal(adapterRequest.documentKind, "ADAPTER_REQUEST");
  assert.equal(harnessObservation.documentKind, "HARNESS_OBSERVATION");
  assert.equal(adapterResult.documentKind, "ADAPTER_RESULT");
  assert.equal(adapterResult.adapterId, "missing-adapter");
  assert.equal(adapterResult.synthetic, true);
  assert.equal(adapterResult.adapterExecutionStatus, "ADAPTER_FAILED");
  assert.equal(verificationEvidence.authority, "NONE");
  assert.equal(verificationEvidence.verificationGateResult, "NOT_SATISFIED");
  assert.equal((runSummary.result as { value: string }).value, "FAILED");
  assert.equal((runSummary.check as { verificationGateResult: string }).verificationGateResult, "NOT_SATISFIED");
  assert.equal((runSummary.safeguards as { acceptanceEvidence: boolean }).acceptanceEvidence, false);
  const adapterError = adapterResult.adapterError as { code: string; message: string };
  assert.equal(adapterError.code, "LAUNCH_FAILED");
  assert.match(adapterError.message, /Unsupported agent: missing-adapter/);
  assert.equal(legacyResult.error, "Unsupported agent: missing-adapter");

  coversRule(S2_THREE, "every Run attempt that reaches AdapterRequest creation leaves an AdapterRequest artifact");
  coversRule(S2_THREE, "every Run attempt that reaches AdapterRequest creation leaves a HarnessObservation artifact");
  coversRule(
    S2_THREE,
    "every Run attempt that reaches AdapterRequest creation leaves an AdapterResult artifact or synthetic AdapterResult artifact"
  );
  coversRule(
    S2_THREE,
    "adapter launch failure produces synthetic AdapterResult with adapterExecutionStatus = ADAPTER_FAILED and adapterError.code = LAUNCH_FAILED"
  );
  coversRule(S2_THREE, "adapter failure does not erase HarnessObservation");
  coversRule(
    S2_LAYOUT,
    "if the adapter cannot produce structured AdapterResult, Execution Harness creates synthetic adapter-result.json"
  );
  coversRule(
    S2_LAYOUT,
    "harness-observation.json is created for every Run attempt that reaches AdapterRequest creation"
  );
  coversRule(RESULT_EVIDENCE, "synthetic AdapterResult records adapterError.code and adapterError.message");
  coversRule(
    RESULT_EVIDENCE,
    "if AgentAdapter failed before returning structured output, Execution Harness creates synthetic=true AdapterResult"
  );
  coversRule(
    OBSERVATION,
    "Execution Harness creates a HarnessObservation artifact for every Run attempt"
  );
});

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashFile(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("changed-files evidence includes untracked files created during the Run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-untracked-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "tracked.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  const git = async (args: string[]): Promise<void> => {
    const { spawnSync } = await import("node:child_process");
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  };
  await git(["init"]);
  await git(["add", "-A"]);
  await git(["commit", "-m", "init"]);

  // Stand in for an agent that edits a tracked file and creates a new one
  // outside the task scope.
  const agentPath = path.join(root, "agent.mjs");
  await writeFile(
    agentPath,
    [
      'import { writeFileSync, mkdirSync } from "node:fs";',
      `writeFileSync("src/tracked.js", ${JSON.stringify("export const a = 2;\n")});`,
      'mkdirSync("infra", { recursive: true });',
      `writeFileSync("infra/deploy.sh", ${JSON.stringify("echo deploy\n")});`,
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "untracked-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise untracked change evidence",
      "scope:",
      "  include: [src/**]",
      "  exclude: [secrets/**]",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const changes = observation.changes as { changedFiles: string[]; unavailableReason: string };

  assert.ok(changes.changedFiles.includes("src/tracked.js"), "tracked modification must be reported");
  assert.ok(
    changes.changedFiles.includes("infra/deploy.sh"),
    "an untracked file created outside task scope must be reported"
  );
  assert.ok(
    changes.changedFiles.every((file) => !file.startsWith(".codefleet/")),
    "CodeFleet's own run artifacts are not agent changes"
  );

  coversRule(UNTRACKED, "untracked files do not bypass path policy");
});

test("an out-of-scope untracked file is recorded as a path violation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-pathpolicy-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "keep.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  await writeFile(
    path.join(root, "agent.mjs"),
    [
      'import { writeFileSync, mkdirSync } from "node:fs";',
      `writeFileSync("src/keep.js", ${JSON.stringify("export const a = 2;\n")});`,
      'mkdirSync("infra", { recursive: true });',
      `writeFileSync("infra/deploy.sh", ${JSON.stringify("echo deploy\n")});`,
      `writeFileSync("src/secret.key", ${JSON.stringify("token\n")});`,
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "path-policy-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise path policy",
      "scope:",
      '  include: ["src/**"]',
      '  exclude: ["src/*.key"]',
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));

  const violations = (observation.policyChecks as { pathViolations: { path: string; violationCode: string }[] })
    .pathViolations;
  const byPath = new Map(violations.map((entry) => [entry.path, entry.violationCode]));

  assert.equal(byPath.get("infra/deploy.sh"), "PATH_OUTSIDE_ALLOWED_PATHS");
  assert.equal(byPath.get("src/secret.key"), "PATH_MATCHES_DENIED_PATHS");
  assert.equal(byPath.has("src/keep.js"), false, "an in-scope change is not a violation");
  assert.equal(byPath.has("agent.mjs"), true, "a file outside src/** is a violation even at the root");

  const summary = (runSummary.policy as {
    pathViolationSummary: { evaluated: boolean; hasViolation: boolean };
  }).pathViolationSummary;
  assert.equal(summary.evaluated, true);
  assert.equal(summary.hasViolation, true);

  coversRule(
    UNTRACKED,
    "generated / untracked / gitignored files outside allowedPaths are violations unless explicitly allowed by policy"
  );
  coversRule(UNTRACKED, "generated / untracked / gitignored files matching deniedPaths are violations");
});

test("a nested repository degrades the path policy evaluation instead of claiming completeness", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-nested-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "vendor", "lib"), { recursive: true });
  await writeFile(path.join(root, "src", "keep.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  const { spawnSync } = await import("node:child_process");
  const git = (cwd: string, args: string[]): void => {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd });
  };
  git(root, ["init"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "init"]);
  // A repository inside the workspace: git status stops at its boundary.
  git(path.join(root, "vendor", "lib"), ["init"]);

  await writeFile(
    path.join(root, "agent.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync("src/keep.js", ${JSON.stringify("export const a = 2;\n")});`,
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "nested-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise nested repo detection",
      "scope:",
      '  include: ["src/**"]',
      '  exclude: []',
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const evaluation = (observation.policyChecks as {
    pathPolicyEvaluation: { evaluated: boolean; unavailableReason: string };
  }).pathPolicyEvaluation;

  assert.equal(evaluation.evaluated, false, "a nested repo makes the evaluation incomplete");
  assert.match(evaluation.unavailableReason, /^NESTED_REPO_NOT_TRAVERSED:/);
  assert.match(evaluation.unavailableReason, /vendor\/lib/);
});

test("verification commands are executed by the Harness and open the gate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-verify-"));
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
    `${JSON.stringify(profileJson({ workspaceId: "verify-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise Harness-executed verification",
      "scope:",
      '  include: ["src/**"]',
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
  const evidence = await readJson(path.join(execution.runDir, "verification", "verify-001.json"));
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));

  assert.equal(evidence.authority, "HARNESS_EXECUTED");
  assert.equal(evidence.observedCheck, "PASS");
  assert.equal(evidence.verificationGateResult, "SATISFIED");

  const attempt = (evidence.attempts as { decision: string; exitCode: number; stdoutRef: { path?: string } }[])[0];
  assert.equal(attempt.decision, "ALLOWED");
  assert.equal(attempt.exitCode, 0);
  assert.ok(attempt.stdoutRef.path, "an executed attempt records a real stdout ref");

  // The Harness ran verification itself, but commands the agent ran on its own
  // are still invisible. These are different subjects and must not merge.
  const authority = runSummary.evidenceAuthority as Record<string, string>;
  assert.equal(authority.verificationAuthority, "HARNESS_EXECUTED");
  assert.equal(authority.commandEvidenceAuthority, "NONE");

  coversRule(
    COMMAND_TRUTH,
    "HARNESS_EXECUTED command truth must come from Execution Harness direct command execution"
  );
  coversRule(
    VERIF_EVIDENCE,
    "HARNESS_EXECUTED verification evidence may satisfy observedCheck PASS when the command matches verificationPlan and exits successfully"
  );
  coversRule(VERIF_EVIDENCE, "observedCheck is derived from VerificationEvidence, not from human input");
  coversRule(
    VERIF_EVIDENCE,
    "verificationGateResult and verificationGateReason are derived by CodeFleet from requiredGates.verification, observedCheck, and waiver policy"
  );
  coversRule(VERIF_EXEC, "observedCheck is derived from VerificationEvidence.");
  coversRule(
    VERIF_EXEC,
    "HARNESS_EXECUTED and HARNESS_OBSERVED satisfying 8.2.2 channel-integrity conditions are the only PASS authorities."
  );
  coversRule(VERIF_EXEC, "Task Revision verification.commands are execution intent, not command permission.");
});

test("a shell interpreter is denied as a verification command", async () => {
  const { normalizeCommand, preflightCommand } = await import("../src/command-policy.ts");
  const result = preflightCommand({
    normalized: normalizeCommand(["/bin/sh", "-c", "npm test"], "."),
    commandExecution: true,
    allowedCommands: [],
    deniedCommands: [],
    destructiveCommands: [],
    approvedCategoryIds: []
  });

  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.blockedReason, "SHELL_INTERPRETER_DENIED");

  coversRule(VERIF_EXEC, "Verification commands must pass command policy preflight.");
  coversRule(
    TASK_SOURCE,
    "Task Revision.verification.commands may request verification but does not grant command execution permission"
  );
});

test("a provider claim alone never satisfies the verification gate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-claim-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "claim-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Agent claims tests passed without a verification plan",
      "scope:",
      '  include: ["src/**"]',
      "  exclude: []",
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
  const evidence = await readJson(path.join(execution.runDir, "verification", "verify-001.json"));

  assert.equal(evidence.authority, "NONE");
  assert.equal(evidence.observedCheck, "NONE");
  assert.equal(evidence.verificationGateResult, "NOT_SATISFIED");
  assert.equal(evidence.verificationGateReason, "MISSING");

  coversRule(
    COMMAND_TRUTH,
    "command truth is recognized only when commands.authority is HARNESS_OBSERVED or HARNESS_EXECUTED"
  );
  coversRule(
    VERIF_EVIDENCE,
    "PROVIDER_REPORTED_ONLY verification is degraded evidence and cannot satisfy observedCheck PASS"
  );
  coversRule(VERIF_EXEC, "PROVIDER_REPORTED_ONLY must not produce observedCheck PASS.");
  coversRule(VERIF_EXEC, "blocked or unavailable verification command produces SKIP or NONE, not PASS.");
  coversRule(
    CMD_AUTHORITY,
    "degraded command observation uses commands.authority = PROVIDER_REPORTED_ONLY or NONE"
  );
  coversRule(CMD_AUTHORITY, "degraded command observation blocks automatic VERIFIED calculation");
});

test("run-plan.json is written once and is not rewritten later in the Run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-immutable-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "immutable-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise run plan immutability",
      "scope:",
      '  include: ["src/**"]',
      "  exclude: []",
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
  const runPlanPath = path.join(execution.runDir, "run-plan.json");
  const planAfterRun = await readFile(runPlanPath, "utf8");

  // The Run Summary references run-plan by hash, so the plan the Run finished
  // with must be the plan every later artifact points at.
  const runSummary = await readJson(path.join(execution.runDir, "run-summary.json"));
  const planRef = (runSummary.inputs as { runPlanRef: { contentHash: string } }).runPlanRef;
  assert.equal(planRef.contentHash, hashFile(planAfterRun), "run-plan hash must still match its recorded ref");

  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  assert.equal(
    (observation.runPlanRef as { contentHash: string }).contentHash,
    planRef.contentHash,
    "every artifact must reference the same run-plan content"
  );

  coversRule(PLAN_IMMUTABLE, "run-plan.json is immutable after its hash is finalized");
  coversRule(
    S2_LAYOUT,
    "harness-observation.json references run-plan.json and adapter-request.json by path and hash"
  );
  coversRule(TRACE_ARTIFACTS, "artifact paths are inside the Run Trace or allowed workspace evidence location");
});

test("a delete and a rename are both reported, naming each side", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-rename-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "gone.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, "src", "old.js"), "export const b = 2;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  await writeFile(
    path.join(root, "agent.mjs"),
    [
      'import { rmSync, renameSync } from "node:fs";',
      'rmSync("src/gone.js");',
      'renameSync("src/old.js", "src/new.js");',
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "rename-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise delete and rename evidence",
      "scope:",
      '  include: ["src/**"]',
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const changed = (observation.changes as { changedFiles: string[] }).changedFiles;

  assert.ok(changed.includes("src/gone.js"), "a deleted file is a policy subject");
  // Both sides of a rename are recorded: the delete and the create are each a
  // policy subject on their own.
  assert.ok(changed.includes("src/old.js"), "the rename source must be reported");
  assert.ok(changed.includes("src/new.js"), "the rename target must be reported");

  coversRule(DELETE_RENAME, "DELETE evaluates the deleted source path");
  coversRule(DELETE_RENAME, "RENAME evaluates both source path and target path");
});

test("a symlink whose target leaves the workspace is recorded as a violation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-symlink-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "codefleet-outside-"));
  await writeFile(path.join(outside, "secret.txt"), "outside the workspace\n", "utf8");

  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "keep.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  // A file symlink needs privileges on Windows, but a directory junction does
  // not, and both resolve through realpath. Fall back so this is verified
  // everywhere rather than skipped on the platform being developed on.
  const { symlink } = await import("node:fs/promises");
  let linkName = "escape.txt";
  try {
    await symlink(path.join(outside, "secret.txt"), path.join(root, "src", linkName));
  } catch {
    linkName = "escape-dir";
    try {
      await symlink(path.join(outside), path.join(root, "src", linkName), "junction");
    } catch {
      t.skip("neither a symlink nor a junction can be created here");
      return;
    }
  }

  await writeFile(path.join(root, "agent.mjs"), "process.stdout.write('noop\n');\n", "utf8");
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "symlink-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise symlink escape detection",
      "scope:",
      '  include: ["src/**", "*.mjs"]',
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [Edit files]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  await approveForTest(root, "sample");

  const execution = await runTask(root, "sample");
  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const violations = (observation.policyChecks as { pathViolations: { path: string; violationCode: string }[] })
    .pathViolations;

  // Matching the link's own path against allowedPaths says nothing about where a
  // write through it lands, so the escape is a violation regardless of scope.
  assert.ok(
    violations.some(
      (v) => v.path.startsWith("src/escape") && v.violationCode === "SYMLINK_TARGET_ESCAPES_WORKSPACE"
    ),
    `expected a symlink escape violation, got ${JSON.stringify(violations)}`
  );

  coversRule(SYMLINK, "symlink target realPath must remain inside selectedWorkspaceRootRealPath");
});

test("an unapproved Task cannot run and leaves no Run Trace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-approval-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "approval-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  const taskYaml = [
    "id: sample",
    "title: Sample task",
    "projectPath: .",
    "goal: Exercise approval gating",
    "scope:",
    '  include: ["src/**"]',
    "  exclude: []",
    "constraints: []",
    "doneCriteria: [Artifacts exist]",
    "workflow: [IMPLEMENT]",
    "status: READY",
    ""
  ].join("\n");
  await writeFile(path.join(root, ".codefleet", "tasks", "sample.yaml"), taskYaml, "utf8");

  await assert.rejects(() => runTask(root, "sample"), /not approved for execution.*NO_REVISION_CREATED/s);
  assert.deepEqual(await readdir(path.join(root, ".codefleet", "runs")), [], "a refused Task writes no Run");

  await approveForTest(root, "sample");
  const execution = await runTask(root, "sample");

  // The Run Plan records which approval authorised it.
  const runPlan = await readJson(path.join(execution.runDir, "run-plan.json"));
  const approval = runPlan.approval as { taskRevision: number; approvalTargetHash: string; approvedBy: string };
  assert.equal(approval.taskRevision, 1);
  assert.equal(approval.approvedBy, "tester");
  assert.equal(approval.approvalTargetHash.length, 64);
});

test("editing a Task after approval revokes its executability", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-reapprove-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "reapprove-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  const taskPath = path.join(root, ".codefleet", "tasks", "sample.yaml");
  const body = (goal: string): string =>
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      `goal: ${goal}`,
      "scope:",
      '  include: ["src/**"]',
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [IMPLEMENT]",
      "status: READY",
      ""
    ].join("\n");

  await writeFile(taskPath, body("original goal"), "utf8");
  await approveForTest(root, "sample");
  await runTask(root, "sample");

  // Approval named the old content hash and does not extend to the edit.
  await writeFile(taskPath, body("a different goal entirely"), "utf8");
  await assert.rejects(
    () => runTask(root, "sample"),
    /TASK_CONTENT_CHANGED_AFTER_APPROVAL/
  );

  // Re-approving the edited content is refused until the old approval is
  // invalidated explicitly, so approval never carries across an edit silently.
  const { approveTask: approve, invalidateApproval } = await import("../src/task-ledger.ts");
  const blocked = await approve(root, { taskId: "sample", taskPath, actorId: "tester", reason: "re-approve" });
  assert.equal(blocked.failedPhase, "M2_PRECHECK");
  assert.match(blocked.failureMessage, /approved for different content; invalidate it first/);

  await invalidateApproval(root, { taskId: "sample", taskPath, actorId: "tester", reason: "task edited" });
  await approve(root, { taskId: "sample", taskPath, actorId: "tester", reason: "re-approved after edit" });

  const execution = await runTask(root, "sample");
  const runPlan = await readJson(path.join(execution.runDir, "run-plan.json"));
  assert.equal((runPlan.approval as { taskRevision: number }).taskRevision, 2, "a new revision was created");
});

test("approval is refused before a bad projectPath is reported", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-order-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "order-test", harnessMode: "DRY_RUN" }), null, 2)}\n`,
    "utf8"
  );
  // Both wrong at once: unapproved and pointing outside the workspace.
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: ../outside",
      "goal: Exercise refusal order",
      "scope:",
      '  include: ["src/**"]',
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [Artifacts exist]",
      "workflow: [IMPLEMENT]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );

  // Approval answers whether this may run at all, so it is reported first.
  // Telling someone to fix a path when they have not approved sends them the
  // wrong way.
  await assert.rejects(() => runTask(root, "sample"), /not approved for execution/);
  assert.deepEqual(await readdir(path.join(root, ".codefleet", "runs")), []);
});

test("artifacts report what was scanned, so nothing examined differs from nothing found", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-scope-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tools"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".codefleet/\n", "utf8");
  await writeFile(
    path.join(root, "tools", "agent.mjs"),
    [
      'import { writeFileSync, mkdirSync } from "node:fs";',
      `writeFileSync("src/app.js", ${JSON.stringify("export const a = 2;\n")});`,
      'mkdirSync("infra", { recursive: true });',
      `writeFileSync("infra/x.sh", ${JSON.stringify("echo x\n")});`,
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(path.join(root, "tools", "check.mjs"), "process.exit(0);\n", "utf8");

  const { spawnSync } = await import("node:child_process");
  for (const args of [["init"], ["add", "-A"], ["commit", "-m", "init"]]) {
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root });
  }

  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "scope-test", harnessMode: "COMMAND_EXEC", policies: { harness: { allowDegradedCommandObservation: true } } }), null, 2)}\n`,
    "utf8"
  );
  await writeLocalOverlay(root, { command: process.execPath, args: ["tools/agent.mjs"] });
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise scan scope reporting",
      "scope:",
      '  include: ["src/**"]',
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

  const observation = await readJson(path.join(execution.runDir, "harness-observation.json"));
  const pathScope = (observation.policyChecks as {
    pathPolicyEvaluation: { scanScope: Record<string, number> };
  }).pathPolicyEvaluation.scanScope;

  // The counts are what separate "checked two paths, one was a violation" from
  // "checked nothing and therefore found nothing".
  const violations = (observation.policyChecks as { pathViolations: { path: string }[] }).pathViolations;
  assert.ok(pathScope.pathsChecked > 0, "a run that changed files must report paths checked");
  assert.equal(pathScope.violationsFound, violations.length, "the count must match the recorded violations");
  assert.deepEqual(violations.map((entry) => entry.path), ["infra/x.sh"]);
  assert.equal(pathScope.allowedPatterns, 1);

  const evidence = await readJson(path.join(execution.runDir, "verification", "verify-001.json"));
  const verifyScope = evidence.scanScope as Record<string, number>;
  assert.equal(verifyScope.attemptsRecorded, 1);
  assert.equal(verifyScope.attemptsExecuted, 1);
  assert.equal(verifyScope.attemptsBlocked, 0);
});
