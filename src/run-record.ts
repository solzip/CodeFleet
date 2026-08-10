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

const EVIDENCE_DEFECT_PREFIXES = ["HASH_INVALID", "ARTIFACT_NOT_READABLE", "MISSING_INPUT_REF"];

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
