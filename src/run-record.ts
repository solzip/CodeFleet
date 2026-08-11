// run-record.md is the human-readable record of one Run. It is derived from the
// artifacts the Run already wrote and states nothing they do not carry.
//
// It exists separately from exports/summary.md because most Runs are never
// exported and redaction can block an export outright. If the only readable
// record lived in the export set, a Run that actually happened would leave
// nothing a person can read.

import type { Task } from "./types.ts";

export interface RunRecordInput {
  runId: string;
  taskId: string;
  createdAt: string;
  task: Task;
  runSummary: Record<string, unknown>;
  harnessObservation: Record<string, unknown>;
  localReview?: Record<string, unknown> | null;
}

const EVIDENCE_DEFECT_PREFIXES = [
  "HASH_INVALID",
  "ARTIFACT_NOT_READABLE",
  "MISSING_INPUT_REF",
  // Output that was cut is output whose missing part nobody can name, so no
  // person can stand in for it the way they can for something never collected.
  "EVIDENCE_TRUNCATED"
];

/**
 * One line per kind of process the Run started, each stating the ceiling, the
 * usage and the dropped bytes separately. "not measured" is its own outcome:
 * a subject that never ran must not report the same zero as one that ran and
 * stayed inside its limit.
 */
function renderLimitLines(limits: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const label = (name: string): string => name.padEnd(14);

  const adapter = record(limits.adapter);
  if (adapter.measured === true) {
    const dropped = num(adapter.stdoutTruncatedBytes) + num(adapter.stderrTruncatedBytes);
    lines.push(
      `${label("adapter")}limit ${num(adapter.timeoutMs)} ms / ${num(adapter.outputCapBytes)} B` +
        `   used ${num(adapter.stdoutBytes) + num(adapter.stderrBytes)} B   truncated ${dropped} B`
    );
  } else {
    lines.push(`${label("adapter")}not measured: ${str(adapter.unavailableReason, "no process ran")}`);
  }

  const verification = record(limits.verification);
  if (verification.measured === true) {
    lines.push(
      `${label("verification")}limit ${num(verification.timeoutMs)} ms / ${num(verification.outputCapBytes)} B` +
        `   used ${num(verification.outputBytes)} B   truncated ${num(verification.truncatedBytes)} B` +
        `   (${num(verification.truncatedCalls)} of ${num(verification.calls)} command(s) truncated,` +
        ` ${num(verification.timedOutCalls)} timed out)`
    );
  } else {
    lines.push(`${label("verification")}not measured: ${str(verification.unavailableReason, "no command ran")}`);
  }

  const git = record(limits.gitEvidence);
  if (git.measured === true) {
    lines.push(
      `${label("git evidence")}limit ${num(git.timeoutMs)} ms / ${num(git.outputCapBytes)} B` +
        `   used ${num(git.outputBytes)} B   truncated ${num(git.truncatedBytes)} B` +
        `   (${num(git.calls)} call(s), ${num(git.truncatedCalls)} truncated, ${num(git.timedOutCalls)} timed out)`
    );
  } else {
    lines.push(`${label("git evidence")}not measured: ${str(git.unavailableReason, "no call was made")}`);
  }

  const created = record(limits.newFileCapture);
  if (created.measured === true) {
    lines.push(
      `${label("created files")}limit ${num(created.perFileLimitBytes)} B per file / ` +
        `${num(created.totalLimitBytes)} B per Run / ${num(created.budgetMs)} ms budget` +
        `   captured ${num(created.bytesCaptured)} B   not captured ${num(created.contentNotCaptured)} file(s)`
    );
  } else {
    lines.push(`${label("created files")}not measured: this Run created no file`);
  }

  return lines;
}

function classify(reason: string): "CAPABILITY_GAP" | "EVIDENCE_DEFECT" {
  return EVIDENCE_DEFECT_PREFIXES.includes(reason.split(":")[0]) ? "EVIDENCE_DEFECT" : "CAPABILITY_GAP";
}

export function renderRunRecord(input: RunRecordInput): string {
  const { runId, taskId, createdAt, task, runSummary, harnessObservation } = input;
  const result = record(runSummary.result);
  const check = record(runSummary.check);
  const policy = record(runSummary.policy);
  const authority = record(runSummary.evidenceAuthority);
  const normalization = record(runSummary.normalization);
  const policyChecks = record(harnessObservation.policyChecks);
  const changes = record(harnessObservation.changes);

  const lines: string[] = [];

  lines.push(`# Run ${runId}`);
  lines.push("");
  lines.push(`- task: ${taskId}`);
  lines.push(`- created: ${createdAt}`);
  lines.push(`- result: ${str(result.value, "UNKNOWN")}`);
  lines.push("");

  lines.push("## What this Run was for");
  lines.push("");
  lines.push(task.goal);
  lines.push("");
  if (task.doneCriteria.length > 0) {
    lines.push("Done criteria:");
    lines.push("");
    for (const item of task.doneCriteria) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  lines.push("Scope:");
  lines.push("");
  lines.push("```text");
  lines.push(`include: ${task.scope.include.join(", ") || "(none)"}`);
  lines.push(`exclude: ${task.scope.exclude.join(", ") || "(none)"}`);
  lines.push("```");
  lines.push("");

  // Where the Run ran comes before what it changed. Under isolation the two
  // sections describe a tree that is not the workspace, and a reader who takes
  // "modified src/app.js" to mean their own file would be wrong about every
  // line below.
  const workspace = record(harnessObservation.workspace);
  const isolation = record(workspace.isolation);
  const isolationMode = str(isolation.mode, "");
  // Gated on where the edits actually are, not on the mode that was asked for.
  // A worktree that could not be created leaves the agent in the workspace, and
  // this section would then describe a separation that did not happen.
  if (isolationMode !== "" && isolation.editsInWorkspace === false) {
    lines.push("## Where this Run ran");
    lines.push("");
    lines.push(`This Run was isolated (${isolationMode}). Everything reported below was`);
    lines.push("observed in the isolated tree, not in the workspace:");
    lines.push("");
    lines.push("```text");
    lines.push(`isolated tree : ${str(isolation.isolatedPath, "not recorded")}`);
    lines.push("```");
    lines.push("");
    // Reintegration is a separate decision nobody has made. Silence would read
    // as "it was applied", which is the more dangerous of the two readings.
    lines.push(
      "The edits made there are **not applied to the workspace**, by this Run or by"
    );
    lines.push(
      "accepting it. Bringing them back is a manual step CodeFleet does not perform."
    );
    lines.push("");
    if (str(isolation.unavailableReason, "").length > 0) {
      lines.push(
        `The tree was **not discarded**: ${str(isolation.unavailableReason, "")} — ${str(isolation.detail, "no detail recorded")}.`
      );
      lines.push("It is still on disk and still holds this Run's edits.");
    } else if (isolation.discarded === true) {
      lines.push("The tree was discarded when the Run finished, so those edits are gone.");
    }
    lines.push("");
  }

  // Before the evidence, not after it. A reader who learns halfway down that
  // output was dropped has already taken the sections above as complete, and
  // the whole point of counting the dropped bytes is that they change how the
  // rest is read.
  const limits = record(harnessObservation.resourceLimits);
  if (Object.keys(limits).length > 0) {
    lines.push("## What the limits did");
    lines.push("");
    lines.push("```text");
    for (const line of renderLimitLines(limits)) {
      lines.push(line);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## What changed");
  lines.push("");
  const changedFiles = list(changes.changedFiles).filter((v): v is string => typeof v === "string");
  if (changedFiles.length === 0) {
    lines.push("No file change was observed.");
  } else {
    for (const file of changedFiles) {
      lines.push(`- ${file}`);
    }
  }
  lines.push("");

  // The workspace delta is measured independently of git, so it is stated
  // separately. Where the two disagree, that disagreement is the finding.
  const delta = record(changes.workspaceDelta);
  const deltaScope = record(delta.scanScope);
  lines.push("Workspace delta (post-run state minus pre-run state, over the Task scope):");
  lines.push("");
  if (str(delta.unavailableReason, "").length > 0) {
    lines.push(`Not measured: ${str(delta.unavailableReason, "reason not recorded")}`);
  } else {
    lines.push("```text");
    lines.push(
      `added ${num(deltaScope.added)}, modified ${num(deltaScope.modified)}, removed ${num(deltaScope.removed)}`
    );
    lines.push(
      `compared ${num(deltaScope.preRunFilesCompared)} pre-run file(s) against ${num(deltaScope.postRunFilesCompared)} post-run file(s)`
    );
    lines.push("```");
    for (const [label, key] of [["added", "added"], ["modified", "modified"], ["removed", "removed"]] as const) {
      const files = list(delta[key]).filter((v): v is string => typeof v === "string");
      for (const file of files) {
        lines.push(`- ${label}: ${file}`);
      }
    }
  }
  lines.push("");

  const violations = list(policyChecks.pathViolations)
    .map((entry) => record(entry))
    .filter((entry) => typeof entry.path === "string");
  const pathEvaluation = record(policyChecks.pathPolicyEvaluation);
  const pathScope = record(pathEvaluation.scanScope);
  if (pathEvaluation.evaluated !== true) {
    lines.push(
      `Path policy was not evaluated: ${str(pathEvaluation.unavailableReason, "reason not recorded")}`
    );
  } else if (violations.length === 0) {
    // Saying "no violation" without saying how much was looked at leaves the
    // reader unable to tell a clean run from an unexamined one.
    lines.push(
      `No path violation. ${num(pathScope.pathsChecked)} path(s) checked against ` +
        `${num(pathScope.allowedPatterns)} allowed and ${num(pathScope.deniedPatterns)} denied pattern(s).`
    );
  } else {
    lines.push("Path violations:");
    lines.push("");
    for (const entry of violations) {
      lines.push(`- ${str(entry.violationCode, "?")}: ${str(entry.path, "?")}`);
    }
  }
  lines.push("");

  lines.push("## What was verified");
  lines.push("");
  const verifyScope = record(record(runSummary.check).scanScope);
  lines.push("```text");
  lines.push(`observedCheck          : ${str(check.observedCheck, "NONE")}`);
  lines.push(`verificationGateResult : ${str(check.verificationGateResult, "NOT_SATISFIED")}`);
  lines.push(`verificationGateReason : ${str(check.verificationGateReason, "UNAVAILABLE")}`);
  lines.push(`verificationAuthority  : ${str(authority.verificationAuthority, "NONE")}`);
  lines.push(`commandEvidenceAuthority: ${str(authority.commandEvidenceAuthority, "NONE")}`);
  lines.push(`computedRisk           : ${str(policy.computedRisk, "UNKNOWN")}`);
  lines.push(
    `attempts               : ${num(verifyScope.attemptsExecuted)} executed of ${num(verifyScope.attemptsRecorded)} recorded, ${num(verifyScope.attemptsBlocked)} blocked`
  );
  lines.push("```");
  lines.push("");

  // A readable summary is the easiest place to paper over gaps with prose, so
  // every unavailable reason is listed with its classification rather than
  // summarised away.
  lines.push("## What is not known");
  lines.push("");
  const reasons = list(normalization.unavailableReasons).filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  if (reasons.length === 0) {
    lines.push("Nothing. Every observation boundary was evaluated.");
  } else {
    lines.push(`normalization: ${str(normalization.status, "UNKNOWN")}`);
    lines.push("");
    for (const reason of reasons) {
      lines.push(`- ${classify(reason)}: ${reason}`);
    }
    lines.push("");
    lines.push(
      "A CAPABILITY_GAP is something CodeFleet cannot observe yet and a person can check instead. An EVIDENCE_DEFECT is evidence that is missing or does not match its hash, which nobody can stand in for."
    );
  }
  lines.push("");

  const review = input.localReview ?? null;
  lines.push("## Review");
  lines.push("");
  if (review === null) {
    lines.push("No review has been recorded for this Run.");
  } else {
    lines.push("```text");
    lines.push(`decision            : ${str(review.decision, "?")}`);
    lines.push(`actor               : ${str(review.actorId, "?")}`);
    lines.push(`evidenceCompleteness: ${str(review.evidenceCompleteness, "?")}`);
    lines.push(`localReviewStatus   : ${str(review.localReviewStatus, "?")}`);
    lines.push("```");
    lines.push("");
    lines.push(`Reason: ${str(review.reason, "(none)")}`);
    const waived = list(review.waivedCapabilityGaps).map((entry) => record(entry));
    if (waived.length > 0) {
      lines.push("");
      lines.push("Waived capability gaps:");
      lines.push("");
      for (const gap of waived) {
        lines.push(`- ${str(gap.reason, "?")} — ${str(gap.justification, "(no justification)")}`);
      }
    }
    lines.push("");
    lines.push(
      "This is a local review record, not final decision truth. It does not produce VERIFIED and does not progress a queue."
    );
  }
  lines.push("");

  lines.push("## Evidence");
  lines.push("");
  lines.push("```text");
  for (const [label, ref] of Object.entries(record(runSummary.inputs))) {
    const entry = record(ref);
    if (typeof entry.path === "string") {
      lines.push(`${label}: ${entry.path}`);
    }
  }
  lines.push("```");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
