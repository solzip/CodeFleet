// S5 export seam — sanitized artifacts only.
//
// The allowlist is Core-owned and has no Profile or Overlay representation. That
// is deliberate: a workspace that could add a field path to its own export
// allowlist could export anything, and the allowlist would document intent
// rather than constrain it. A target picks one tier and may remove paths from
// it; nothing anywhere can add one.
//
// Field paths name leaves explicitly. There is no wildcard, because a wildcard
// makes the allowlist grow silently whenever the schema does — the one moment
// you most want it not to.

import {
  applyRedaction,
  type RedactionAction,
  type RedactionEntry,
  type RedactionRule
} from "./redaction.ts";

export const EXPOSURE_TIERS = ["PUBLIC", "INTERNAL_SHARED", "LOCAL_PRIVATE"] as const;
export type ExposureTier = (typeof EXPOSURE_TIERS)[number];

/**
 * Core-owned tier allowlists over run-summary.json. Each tier is a superset of
 * the one before it; the nesting is asserted rather than assumed.
 */
const PUBLIC_PATHS = [
  "runId",
  "taskId",
  "result.value",
  "check.observedCheck",
  "check.verificationGateResult"
];

const INTERNAL_SHARED_PATHS = [
  ...PUBLIC_PATHS,
  "runPlanId",
  "createdAt",
  "normalization.status",
  "normalization.unavailableReasons[]",
  "check.verificationGateReason",
  "policy.computedRisk",
  "evidenceAuthority.commandEvidenceAuthority",
  "evidenceAuthority.changedFilesAuthority",
  "safeguards.canProduceVerified",
  "safeguards.acceptanceEvidence"
];

const LOCAL_PRIVATE_PATHS = [
  ...INTERNAL_SHARED_PATHS,
  "result.derivedFrom[]",
  "inputs.runPlanRef.path",
  "inputs.runPlanRef.contentHash",
  "policy.pathViolationSummary.evaluated",
  "policy.pathViolationSummary.hasViolation"
];

export const CORE_TIER_ALLOWLISTS: Record<ExposureTier, string[]> = {
  PUBLIC: PUBLIC_PATHS,
  INTERNAL_SHARED: INTERNAL_SHARED_PATHS,
  LOCAL_PRIVATE: LOCAL_PRIVATE_PATHS
};

export interface PathProblem {
  problem: string;
  detail: string;
}

const WILDCARD = /[*?]|\[\s*\d|\{|\}/;

/**
 * field, parent.child, list[], list[].child. Nothing else, and no path that
 * stops at an intermediate node.
 */
export function validateFieldPath(fieldPath: string): PathProblem | null {
  if (typeof fieldPath !== "string" || fieldPath.length === 0) {
    return { problem: "EMPTY", detail: "a field path must be a non-empty string" };
  }
  if (WILDCARD.test(fieldPath)) {
    return {
      problem: "WILDCARD",
      detail: "field paths name leaves explicitly; a wildcard would grow the allowlist whenever the schema does"
    };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\[\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\])?)*$/.test(fieldPath)) {
    return { problem: "MALFORMED", detail: "use field, parent.child, list[], or list[].child" };
  }
  return null;
}

export interface TargetSpec {
  targetId: string;
  tier: ExposureTier;
  /** Paths removed from the tier. A target may only narrow. */
  removedPaths?: string[];
}

export interface TargetFinding {
  jsonPointer: string;
  detail: string;
}

export function validateExportTarget(target: unknown, pointer: string): TargetFinding[] {
  if (target === null || typeof target !== "object" || Array.isArray(target)) {
    return [{ jsonPointer: pointer, detail: "an export target must be an object" }];
  }
  const spec = target as Record<string, unknown>;
  const findings: TargetFinding[] = [];

  const tier = spec.tier;
  if (typeof tier !== "string" || !(EXPOSURE_TIERS as readonly string[]).includes(tier)) {
    findings.push({
      jsonPointer: `${pointer}/tier`,
      detail: `every export target declares exactly one exposure tier: ${EXPOSURE_TIERS.join(", ")}`
    });
  }
  if (Array.isArray(spec.tier)) {
    findings.push({ jsonPointer: `${pointer}/tier`, detail: "exactly one tier, not a list" });
  }

  // addedPaths has no representation on purpose; naming it explicitly makes the
  // refusal say why rather than "unknown key".
  for (const forbidden of ["addedPaths", "extraPaths", "allowlist", "fieldAllowlist"]) {
    if (Object.prototype.hasOwnProperty.call(spec, forbidden)) {
      findings.push({
        jsonPointer: `${pointer}/${forbidden}`,
        detail:
          "the field allowlist is Core-owned. A target may remove paths from its tier and can never add one, " +
          "so there is no place to declare additions"
      });
    }
  }

  if (spec.removedPaths !== undefined) {
    if (!Array.isArray(spec.removedPaths)) {
      findings.push({ jsonPointer: `${pointer}/removedPaths`, detail: "must be an array of field paths" });
    } else {
      spec.removedPaths.forEach((p, i) => {
        const problem = validateFieldPath(p as string);
        if (problem !== null) {
          findings.push({ jsonPointer: `${pointer}/removedPaths/${i}`, detail: `${problem.problem} — ${problem.detail}` });
        }
      });
    }
  }

  return findings;
}

/** PUBLIC ⊆ INTERNAL_SHARED ⊆ LOCAL_PRIVATE, checked rather than assumed. */
export function tiersNest(): boolean {
  const pub = new Set(CORE_TIER_ALLOWLISTS.PUBLIC);
  const internal = new Set(CORE_TIER_ALLOWLISTS.INTERNAL_SHARED);
  const local = new Set(CORE_TIER_ALLOWLISTS.LOCAL_PRIVATE);
  return (
    [...pub].every((p) => internal.has(p)) && [...internal].every((p) => local.has(p))
  );
}

export function resolveAllowlist(target: TargetSpec): string[] {
  const removed = new Set(target.removedPaths ?? []);
  return CORE_TIER_ALLOWLISTS[target.tier].filter((p) => !removed.has(p));
}

export interface SanitizeResult {
  sanitized: Record<string, unknown>;
  report: {
    schemaVersion: "0.2";
    documentKind: "REDACTION_REPORT";
    targetId: string;
    tier: ExposureTier;
    entries: RedactionEntry[];
    blockedExport: boolean;
    blockedReasons: string[];
    scanScope: {
      allowlistSize: number;
      leavesVisited: number;
      leavesDropped: number;
      rulesApplied: number;
    };
  };
}

/**
 * Tier filtering first, then redaction. Reversing them would redact content the
 * tier was going to drop anyway, and — worse — would leave a field the tier
 * forbids in the payload whenever no redaction rule happened to match it.
 */
export function sanitize(input: {
  runSummary: Record<string, unknown>;
  target: TargetSpec;
  redactionRules: RedactionRule[];
  ruleFailures?: string[];
}): SanitizeResult {
  const { runSummary, target, redactionRules, ruleFailures = [] } = input;
  const allowlist = resolveAllowlist(target);
  const allowed = new Set(allowlist);

  const entries: RedactionEntry[] = [];
  const sanitized: Record<string, unknown> = {};
  let leavesVisited = 0;
  let leavesDropped = 0;

  const walk = (node: unknown, prefix: string, into: Record<string, unknown>, key: string): void => {
    if (Array.isArray(node)) {
      const listPath = `${prefix}[]`;
      leavesVisited += 1;
      if (!allowed.has(listPath)) {
        leavesDropped += 1;
        entries.push({
          ruleId: "CORE_TIER_ALLOWLIST",
          fieldPath: listPath,
          matchKind: "SCHEMA_UNKNOWN_FIELD",
          action: "DROPPED",
          severity: "WARNING"
        });
        return;
      }
      into[key] = node.map((item) => {
        const outcome = applyRedaction(listPath, item, redactionRules);
        entries.push(...outcome.entries);
        return outcome.value;
      });
      return;
    }

    if (node !== null && typeof node === "object") {
      const child: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, prefix === "" ? k : `${prefix}.${k}`, child, k);
      }
      if (Object.keys(child).length > 0) {
        into[key] = child;
      }
      return;
    }

    leavesVisited += 1;
    if (!allowed.has(prefix)) {
      leavesDropped += 1;
      entries.push({
        ruleId: "CORE_TIER_ALLOWLIST",
        fieldPath: prefix,
        matchKind: "SCHEMA_UNKNOWN_FIELD",
        action: "DROPPED",
        severity: "WARNING"
      });
      return;
    }

    const outcome = applyRedaction(prefix, node, redactionRules);
    entries.push(...outcome.entries);
    if (outcome.value !== undefined) {
      into[key] = outcome.value;
    } else {
      leavesDropped += 1;
    }
  };

  for (const [k, v] of Object.entries(runSummary)) {
    walk(v, k, sanitized, k);
  }

  // An unusable rule is never skipped so export can proceed. Sanitization that
  // could not complete blocks rather than shipping whatever it managed.
  const blockedReasons = ruleFailures.map((r) => `REDACTION_RULE_UNUSABLE:${r}`);

  return {
    sanitized,
    report: {
      schemaVersion: "0.2",
      documentKind: "REDACTION_REPORT",
      targetId: target.targetId,
      tier: target.tier,
      entries,
      blockedExport: blockedReasons.length > 0,
      blockedReasons,
      scanScope: {
        allowlistSize: allowlist.length,
        leavesVisited,
        leavesDropped,
        rulesApplied: entries.filter((e) => e.matchKind === "REDACTION_RULE_MATCH").length
      }
    }
  };
}

/** summary.md is built from the sanitized document, never from run-summary.json. */
export function renderSanitizedSummary(sanitized: Record<string, unknown>): string {
  const lines = ["# Run Summary (sanitized)", ""];
  const emit = (node: unknown, prefix: string): void => {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        emit(v, prefix === "" ? k : `${prefix}.${k}`);
      }
      return;
    }
    lines.push(`- ${prefix}: ${Array.isArray(node) ? node.join(", ") : String(node)}`);
  };
  emit(sanitized, "");
  lines.push("");
  return lines.join("\n");
}

export function exportIsPermitted(report: SanitizeResult["report"]): boolean {
  return !report.blockedExport;
}

export type { RedactionAction };
