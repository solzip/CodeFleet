import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileRef } from "./workspace.ts";

export type ReviewDecision = "ACCEPTED" | "REJECTED" | "NEEDS_CHANGES";

export type LocalReviewStatus =
  | "MIGRATION_READY"
  | "MIGRATION_READY_WAIVED"
  | "DEGRADED_RECORDED"
  | "MIGRATION_BLOCKED"
  | "SUPERSEDED";

export interface ReviewOptions {
  decision: ReviewDecision;
  reason: string;
  actorId?: string;
  noteRef?: string;
  aiReviewRef?: string;
  supersedesLocalReviewId?: string;
  /** Specific CAPABILITY_GAP reasons a human takes responsibility for. */
  waivedGaps?: string[];
  waiveJustification?: string;
}

export type GapKind = "CAPABILITY_GAP" | "EVIDENCE_DEFECT";

export interface EvidenceGap {
  reason: string;
  kind: GapKind;
}

// A CAPABILITY_GAP is something CodeFleet cannot observe yet; a person can check
// the repository and stand in for it. An EVIDENCE_DEFECT means this Run's
// evidence is missing or does not match its recorded hash, which nobody can
// stand in for, so it is never waivable.
const EVIDENCE_DEFECT_PREFIXES = ["HASH_INVALID", "ARTIFACT_NOT_READABLE", "MISSING_INPUT_REF"];

export function classifyGap(reason: string): GapKind {
  const head = reason.split(":")[0];
  return EVIDENCE_DEFECT_PREFIXES.includes(head) ? "EVIDENCE_DEFECT" : "CAPABILITY_GAP";
}

interface ReviewEvidenceBundle {
  schemaVersion: "0.2";
  documentKind: "REVIEW_EVIDENCE_BUNDLE";
  reviewDecisionId: string;
  reviewEvidenceBundleId: string;
  runId: string;
  runPlanId: string;
  taskId: string;
  bundleStatus: "COMPLETE" | "DEGRADED";
  unavailableReasons: string[];
  runSummaryRef: FileRef;
  runPlanRef: FileRef | null;
  adapterRequestRef: FileRef | null;
  harnessObservationRef: FileRef | null;
  adapterResultRef: FileRef | null;
  verificationEvidenceRefs: FileRef[];
  observedResultSnapshot: string;
  observedCheckSnapshot: string;
  verificationGateResult: string;
  verificationGateReason: string;
  computedRisk: string;
  commandEvidenceAuthority: string;
  pathViolationSummary: {
    evaluated: boolean;
    hasViolation: boolean;
    violationRefs: FileRef[];
    unavailableReason: string;
  };
  hashChecks: HashCheck[];
  createdAt: string;
}

interface HashCheck {
  path: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
  unavailableReason: string;
}

interface LocalReviewDecision {
  schemaVersion: "0.2";
  documentKind: "LOCAL_REVIEW_DECISION";
  finalDecisionTruth: false;
  migrationTarget: "RUN_REVIEW_DECIDED";
  localReviewId: string;
  reviewDecisionId: string;
  runId: string;
  taskId: string;
  decision: ReviewDecision;
  actorKind: "HUMAN";
  actorId: string;
  decisionBasis: "HUMAN_REVIEW";
  reason: string;
  runSummaryRef: FileRef;
  reviewEvidenceBundleRef: FileRef;
  bundleStatus: "COMPLETE" | "DEGRADED";
  observedResultSnapshot: string;
  observedCheckSnapshot: string;
  verificationGateResult: string;
  verificationGateReason: string;
  computedRisk: string;
  pathViolationSummary: {
    evaluated: boolean;
    hasViolation: boolean;
    violationRefs: FileRef[];
    unavailableReason: string;
  };
  reviewNoteRef: string;
  aiReviewHintRef: string;
  supersedesLocalReviewId: string;
  evidenceCompleteness: "COMPLETE" | "WAIVED_INCOMPLETE" | "INCOMPLETE";
  waivedCapabilityGaps: { reason: string; acknowledgedBy: string; justification: string }[];
  localReviewStatus: LocalReviewStatus;
  localReviewStatusReasons: string[];
  safeguards: {
    canProduceVerified: false;
    canProgressQueue: false;
    acceptanceEvidence: false;
  };
  createdAt: string;
}

export interface ReviewExecution {
  runId: string;
  reviewDecisionId: string;
  localReviewId: string;
  decision: ReviewDecision;
  localReviewStatus: LocalReviewStatus;
  bundleStatus: "COMPLETE" | "DEGRADED";
  evidenceCompleteness: "COMPLETE" | "WAIVED_INCOMPLETE" | "INCOMPLETE";
  bundlePath: string;
  localReviewPath: string;
  blockedReasons: string[];
}

const REQUIRED_BUNDLE_INPUTS = [
  "runPlanRef",
  "adapterRequestRef",
  "harnessObservationRef",
  "adapterResultRef"
] as const;

export async function reviewRun(
  rootDir: string,
  runId: string,
  options: ReviewOptions
): Promise<ReviewExecution> {
  assertDecision(options.decision);
  if (options.reason.trim().length === 0) {
    throw new Error("Missing required option: --reason");
  }

  const runDir = path.join(rootDir, ".codefleet", "runs", runId);
  const runSummaryPath = path.join(runDir, "run-summary.json");
  const runSummary = await readJson(runSummaryPath);
  if (runSummary === null) {
    throw new Error(`Run Summary not found for run: ${runId}`);
  }

  const createdAt = new Date().toISOString();
  const reviewDecisionId = await nextReviewDecisionId(rootDir, runId);
  const localReviewId = `${reviewDecisionId}:local`;

  const bundle = await buildEvidenceBundle({
    rootDir,
    runId,
    reviewDecisionId,
    runSummary,
    runSummaryRef: await fileRef(rootDir, runSummaryPath),
    createdAt
  });

  const reviewDir = path.join(rootDir, ".codefleet", "reviews", reviewDecisionId);
  await mkdir(reviewDir, { recursive: true });
  const bundlePath = path.join(reviewDir, "evidence-bundle.json");
  await writeJson(bundlePath, bundle);

  const acceptance = evaluateAcceptance(bundle, options.waivedGaps ?? []);
  if (options.decision === "ACCEPTED" && !acceptance.allowed) {
    throw new Error(
      `ACCEPTED local review is not allowed for ${runId}.\n` +
        acceptance.blockedReasons.map((reason) => `  - ${reason}`).join("\n")
    );
  }

  const localReviewPath = path.join(runDir, "review-decision.local.json");
  const statusResult = deriveLocalReviewStatus({
    decision: options.decision,
    bundle,
    acceptance,
    supersedesLocalReviewId: options.supersedesLocalReviewId ?? ""
  });

  const localReview: LocalReviewDecision = {
    schemaVersion: "0.2",
    documentKind: "LOCAL_REVIEW_DECISION",
    finalDecisionTruth: false,
    migrationTarget: "RUN_REVIEW_DECIDED",
    localReviewId,
    reviewDecisionId,
    runId,
    taskId: bundle.taskId,
    decision: options.decision,
    actorKind: "HUMAN",
    actorId: options.actorId ?? "local-user",
    decisionBasis: "HUMAN_REVIEW",
    reason: options.reason,
    runSummaryRef: bundle.runSummaryRef,
    reviewEvidenceBundleRef: await fileRef(rootDir, bundlePath),
    bundleStatus: bundle.bundleStatus,
    observedResultSnapshot: bundle.observedResultSnapshot,
    observedCheckSnapshot: bundle.observedCheckSnapshot,
    verificationGateResult: bundle.verificationGateResult,
    verificationGateReason: bundle.verificationGateReason,
    computedRisk: bundle.computedRisk,
    pathViolationSummary: bundle.pathViolationSummary,
    reviewNoteRef: options.noteRef ?? "",
    aiReviewHintRef: options.aiReviewRef ?? "",
    supersedesLocalReviewId: options.supersedesLocalReviewId ?? "",
    evidenceCompleteness: evidenceCompleteness(bundle, acceptance.waived),
    waivedCapabilityGaps: acceptance.waived.map((reason) => ({
      reason,
      acknowledgedBy: options.actorId ?? "local-user",
      justification: options.waiveJustification ?? options.reason
    })),
    localReviewStatus: statusResult.status,
    localReviewStatusReasons: statusResult.reasons,
    safeguards: {
      canProduceVerified: false,
      canProgressQueue: false,
      acceptanceEvidence: false
    },
    createdAt
  };

  assertLocalReview(localReview, bundle);
  await writeJson(localReviewPath, localReview);

  return {
    runId,
    reviewDecisionId,
    localReviewId,
    decision: options.decision,
    localReviewStatus: statusResult.status,
    bundleStatus: bundle.bundleStatus,
    evidenceCompleteness: localReview.evidenceCompleteness,
    bundlePath: toRelativePath(rootDir, bundlePath),
    localReviewPath: toRelativePath(rootDir, localReviewPath),
    blockedReasons: acceptance.blockedReasons
  };
}

async function buildEvidenceBundle(input: {
  rootDir: string;
  runId: string;
  reviewDecisionId: string;
  runSummary: Record<string, unknown>;
  runSummaryRef: FileRef;
  createdAt: string;
}): Promise<ReviewEvidenceBundle> {
  const { rootDir, runId, reviewDecisionId, runSummary, runSummaryRef, createdAt } = input;
  const inputs = asRecord(runSummary.inputs);
  const unavailableReasons: string[] = [];
  const hashChecks: HashCheck[] = [];

  const resolved: Record<string, FileRef | null> = {};
  for (const key of REQUIRED_BUNDLE_INPUTS) {
    const declared = asFileRef(inputs[key]);
    if (declared === null) {
      resolved[key] = null;
      unavailableReasons.push(`MISSING_INPUT_REF:${key}`);
      continue;
    }
    resolved[key] = declared;
    hashChecks.push(await verifyHash(rootDir, declared));
  }

  const verificationRefs: FileRef[] = [];
  for (const value of asArray(inputs.verificationEvidenceRefs)) {
    const declared = asFileRef(value);
    if (declared === null) {
      continue;
    }
    verificationRefs.push(declared);
    hashChecks.push(await verifyHash(rootDir, declared));
  }
  if (verificationRefs.length === 0) {
    unavailableReasons.push("NO_VERIFICATION_EVIDENCE");
  }

  for (const check of hashChecks) {
    if (!check.valid) {
      unavailableReasons.push(`HASH_INVALID:${check.path}`);
    }
  }

  const result = asRecord(runSummary.result);
  const check = asRecord(runSummary.check);
  const evidenceAuthority = asRecord(runSummary.evidenceAuthority);
  const policy = asRecord(runSummary.policy);
  const pathViolation = asRecord(policy.pathViolationSummary);
  const normalization = asRecord(runSummary.normalization);

  // Carry the individual normalization reasons rather than an aggregate. A
  // waiver has to name a specific gap, and an aggregate would force the reviewer
  // to waive everything at once without seeing what "everything" is.
  if (normalization.status !== "COMPLETE") {
    const reasons = asArray(normalization.unavailableReasons).filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
    if (reasons.length === 0) {
      unavailableReasons.push(`RUN_SUMMARY_NORMALIZATION:${asString(normalization.status, "UNKNOWN")}`);
    } else {
      unavailableReasons.push(...reasons);
    }
  }

  const violationRefs: FileRef[] = [];
  for (const value of asArray(pathViolation.violationRefs)) {
    const declared = asFileRef(value);
    if (declared !== null) {
      violationRefs.push(declared);
    }
  }

  const bundleStatus = unavailableReasons.length === 0 ? "COMPLETE" : "DEGRADED";

  return {
    schemaVersion: "0.2",
    documentKind: "REVIEW_EVIDENCE_BUNDLE",
    reviewDecisionId,
    reviewEvidenceBundleId: `${reviewDecisionId}:bundle`,
    runId,
    runPlanId: asString(runSummary.runPlanId, ""),
    taskId: asString(runSummary.taskId, ""),
    bundleStatus,
    unavailableReasons,
    runSummaryRef,
    runPlanRef: resolved.runPlanRef ?? null,
    adapterRequestRef: resolved.adapterRequestRef ?? null,
    harnessObservationRef: resolved.harnessObservationRef ?? null,
    adapterResultRef: resolved.adapterResultRef ?? null,
    verificationEvidenceRefs: verificationRefs,
    observedResultSnapshot: asString(result.value, "UNKNOWN"),
    observedCheckSnapshot: asString(check.observedCheck, "NONE"),
    verificationGateResult: asString(check.verificationGateResult, "NOT_SATISFIED"),
    verificationGateReason: asString(check.verificationGateReason, "UNAVAILABLE"),
    computedRisk: asString(policy.computedRisk, "UNKNOWN"),
    commandEvidenceAuthority: asString(evidenceAuthority.commandEvidenceAuthority, "NONE"),
    pathViolationSummary: {
      evaluated: pathViolation.evaluated === true,
      hasViolation: pathViolation.hasViolation === true,
      violationRefs,
      unavailableReason: asString(pathViolation.unavailableReason, "")
    },
    hashChecks,
    createdAt
  };
}

function evaluateAcceptance(
  bundle: ReviewEvidenceBundle,
  waivedGaps: string[]
): { allowed: boolean; blockedReasons: string[]; waived: string[] } {
  const blockedReasons: string[] = [];
  const waived: string[] = [];

  for (const reason of bundle.unavailableReasons) {
    if (classifyGap(reason) === "EVIDENCE_DEFECT") {
      // Nobody can stand in for evidence that is missing or does not match its
      // recorded hash, so this is never waivable.
      blockedReasons.push(`evidence defect cannot be waived: ${reason}`);
      continue;
    }
    if (waivedGaps.includes(reason)) {
      waived.push(reason);
      continue;
    }
    blockedReasons.push(`capability gap not waived: ${reason}`);
  }

  // An invalid hash is already reported above as HASH_INVALID:<path>, which names
  // the artifact. Reporting it a second time in aggregate would state one fact
  // twice and hide which artifact failed.
  if (bundle.observedResultSnapshot !== "DONE") {
    blockedReasons.push(`normalized result is ${bundle.observedResultSnapshot}, not DONE`);
  }
  if (
    bundle.verificationGateResult !== "SATISFIED" &&
    bundle.verificationGateResult !== "WAIVED_ALLOWED"
  ) {
    blockedReasons.push(
      `verification gate is ${bundle.verificationGateResult} (${bundle.verificationGateReason})`
    );
  }
  // An unevaluated path policy is a capability gap, not a finding: the reason it
  // could not run is already carried in the gap list above and is waivable there.
  // An actual violation is a finding and is never waivable.
  if (bundle.pathViolationSummary.evaluated && bundle.pathViolationSummary.hasViolation) {
    blockedReasons.push("unresolved path violation is present");
  }

  return { allowed: blockedReasons.length === 0, blockedReasons, waived };
}

// A review that did not attempt acceptance still has to state its evidence
// honestly. Without INCOMPLETE, a Run with open gaps would record COMPLETE and
// claim a completeness it does not have.
function evidenceCompleteness(
  bundle: ReviewEvidenceBundle,
  waived: string[]
): "COMPLETE" | "WAIVED_INCOMPLETE" | "INCOMPLETE" {
  if (bundle.unavailableReasons.length === 0) {
    return "COMPLETE";
  }
  const unwaived = bundle.unavailableReasons.filter((reason) => !waived.includes(reason));
  return unwaived.length === 0 ? "WAIVED_INCOMPLETE" : "INCOMPLETE";
}

function deriveLocalReviewStatus(input: {
  decision: ReviewDecision;
  bundle: ReviewEvidenceBundle;
  acceptance: { allowed: boolean; blockedReasons: string[]; waived: string[] };
  supersedesLocalReviewId: string;
}): { status: LocalReviewStatus; reasons: string[] } {
  const { decision, bundle, acceptance } = input;

  // Status derivation reads the same classification the acceptance gate reads,
  // so a defect cannot block one and pass the other.
  const defects = bundle.unavailableReasons.filter((reason) => classifyGap(reason) === "EVIDENCE_DEFECT");
  if (defects.length > 0) {
    return { status: "MIGRATION_BLOCKED", reasons: defects };
  }

  if (decision === "ACCEPTED") {
    if (!acceptance.allowed) {
      return { status: "MIGRATION_BLOCKED", reasons: acceptance.blockedReasons };
    }
    if (acceptance.waived.length > 0) {
      return { status: "MIGRATION_READY_WAIVED", reasons: acceptance.waived };
    }
    return { status: "MIGRATION_READY", reasons: [] };
  }

  if (bundle.bundleStatus === "DEGRADED") {
    return { status: "DEGRADED_RECORDED", reasons: bundle.unavailableReasons };
  }

  return { status: "MIGRATION_READY", reasons: [] };
}

async function verifyHash(rootDir: string, ref: FileRef): Promise<HashCheck> {
  const absolute = path.join(rootDir, ref.path);
  try {
    const raw = await readFile(absolute);
    const actualHash = createHash("sha256").update(raw).digest("hex");
    return {
      path: ref.path,
      expectedHash: ref.contentHash,
      actualHash,
      valid: actualHash === ref.contentHash,
      unavailableReason: ""
    };
  } catch {
    return {
      path: ref.path,
      expectedHash: ref.contentHash,
      actualHash: "",
      valid: false,
      unavailableReason: "ARTIFACT_NOT_READABLE"
    };
  }
}

function assertDecision(value: string): asserts value is ReviewDecision {
  if (value !== "ACCEPTED" && value !== "REJECTED" && value !== "NEEDS_CHANGES") {
    throw new Error("--decision must be ACCEPTED, REJECTED, or NEEDS_CHANGES");
  }
}

// The decision record is the artifact that migrates into an append-only ledger,
// so a false claim in it cannot be corrected later, only appended over. Every
// value it copies from the bundle is re-checked here against that bundle, so the
// record cannot state something its own evidence contradicts.
function assertLocalReview(value: LocalReviewDecision, bundle: ReviewEvidenceBundle): void {
  const errors: string[] = [];

  const copied: [string, unknown, unknown][] = [
    ["bundleStatus", value.bundleStatus, bundle.bundleStatus],
    ["observedResultSnapshot", value.observedResultSnapshot, bundle.observedResultSnapshot],
    ["observedCheckSnapshot", value.observedCheckSnapshot, bundle.observedCheckSnapshot],
    ["verificationGateResult", value.verificationGateResult, bundle.verificationGateResult],
    ["verificationGateReason", value.verificationGateReason, bundle.verificationGateReason],
    ["computedRisk", value.computedRisk, bundle.computedRisk],
    ["runSummaryRef.contentHash", value.runSummaryRef.contentHash, bundle.runSummaryRef.contentHash],
    [
      "pathViolationSummary",
      JSON.stringify(value.pathViolationSummary),
      JSON.stringify(bundle.pathViolationSummary)
    ]
  ];
  for (const [name, actual, expected] of copied) {
    if (actual !== expected) {
      errors.push(`${name} does not match the evidence bundle: ${String(actual)} vs ${String(expected)}`);
    }
  }

  if (value.localReviewStatus === "MIGRATION_READY" && value.evidenceCompleteness !== "COMPLETE") {
    errors.push("MIGRATION_READY requires evidenceCompleteness COMPLETE");
  }
  if (value.localReviewStatus === "MIGRATION_READY_WAIVED" && value.evidenceCompleteness !== "WAIVED_INCOMPLETE") {
    errors.push("MIGRATION_READY_WAIVED requires evidenceCompleteness WAIVED_INCOMPLETE");
  }
  if (value.decision === "ACCEPTED" && value.localReviewStatus === "MIGRATION_BLOCKED") {
    errors.push("ACCEPTED cannot be recorded as MIGRATION_BLOCKED");
  }
  if (value.finalDecisionTruth !== false) {
    errors.push("finalDecisionTruth must be false");
  }
  if (value.migrationTarget !== "RUN_REVIEW_DECIDED") {
    errors.push("migrationTarget must be RUN_REVIEW_DECIDED");
  }
  if (value.safeguards.canProduceVerified !== false) {
    errors.push("local review cannot produce VERIFIED");
  }
  if (value.safeguards.canProgressQueue !== false) {
    errors.push("local review cannot progress the queue");
  }
  if (value.safeguards.acceptanceEvidence !== false) {
    errors.push("local review is not acceptance evidence");
  }
  if (value.reason.trim().length === 0) {
    errors.push("reason must be present");
  }
  for (const gap of value.waivedCapabilityGaps) {
    if (classifyGap(gap.reason) !== "CAPABILITY_GAP") {
      errors.push(`${gap.reason} is an evidence defect and cannot be waived`);
    }
    if (gap.justification.trim().length === 0) {
      errors.push(`${gap.reason} was waived without a justification`);
    }
  }
  if (value.evidenceCompleteness === "WAIVED_INCOMPLETE" && value.waivedCapabilityGaps.length === 0) {
    errors.push("WAIVED_INCOMPLETE requires at least one waived gap");
  }
  if (value.evidenceCompleteness === "COMPLETE" && value.bundleStatus !== "COMPLETE") {
    errors.push("evidenceCompleteness COMPLETE contradicts a DEGRADED bundle");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid local review decision:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}

async function nextReviewDecisionId(rootDir: string, runId: string): Promise<string> {
  const reviewsDir = path.join(rootDir, ".codefleet", "reviews");
  let existing: string[] = [];
  try {
    existing = await readdir(reviewsDir);
  } catch {
    existing = [];
  }

  // reviewDecisionId names a directory under .codefleet/reviews, so it must stay
  // path-safe on every platform. Colon separators are reserved for ids that are
  // never used as a path segment.
  const prefix = `${runId}-review-`;
  let next = 1;
  for (const entry of existing) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const parsed = Number.parseInt(entry.slice(prefix.length), 10);
    if (Number.isInteger(parsed) && parsed >= next) {
      next = parsed + 1;
    }
  }

  return `${prefix}${String(next).padStart(3, "0")}`;
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileRef(rootDir: string, filePath: string): Promise<FileRef> {
  const raw = await readFile(filePath);
  return {
    path: toRelativePath(rootDir, filePath),
    contentHash: createHash("sha256").update(raw).digest("hex"),
    present: true
  };
}

function toRelativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asFileRef(value: unknown): FileRef | null {
  const record = asRecord(value);
  if (typeof record.path !== "string" || record.path.length === 0) {
    return null;
  }
  if (typeof record.contentHash !== "string" || record.contentHash.length === 0) {
    return null;
  }
  if (record.present === false) {
    return null;
  }
  return {
    path: record.path,
    contentHash: record.contentHash,
    present: true
  };
}
