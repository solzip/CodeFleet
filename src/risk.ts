// Risk rules — no matching language of their own.
//
// matchTarget picks which already-fixed matcher applies, so a risk rule can
// never express something the files policy, the command matcher, or the
// redaction subset cannot. Adding a fourth syntax here would mean a path could
// be matched two ways that disagree.
//
// Conditions inside one rule are a flat allOf. There is no OR because
// computedRisk is already the max over every match, so splitting a rule in two
// is OR. There is no NOT because negation is a way to lower risk on a failed
// match, and lowering only ever goes through an explicit exemption.
//
// UNKNOWN is not a severity. LOW < MEDIUM < HIGH is the axis; UNKNOWN is off it
// and means nothing could be determined. It is never rewritten to HIGH "to be
// safe" — that would make an unmeasured Run indistinguishable from a measured
// dangerous one — and never to MEDIUM. It blocks instead.

import { matchesCommand, type MatchMode } from "./command-policy.ts";
import { matchesPattern, validatePattern } from "./path-policy.ts";

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type ComputedRisk = RiskLevel | "UNKNOWN";

export const MATCH_TARGETS = [
  "PATH",
  "COMMAND",
  "AGENT_ROLE",
  "TASK_SCOPE",
  "DIFF",
  "FILE_CONTENT",
  "RUN_EVIDENCE",
  "HUMAN_OVERRIDE",
  "LLM_SIGNAL"
] as const;
export type MatchTarget = (typeof MATCH_TARGETS)[number];

/** Which already-fixed matcher each target borrows, and the keys it may carry. */
const TARGET_KEYS: Record<MatchTarget, string[]> = {
  PATH: ["glob"],
  TASK_SCOPE: ["glob"],
  DIFF: ["glob"],
  COMMAND: ["argv", "matchMode"],
  FILE_CONTENT: ["pattern"],
  AGENT_ROLE: ["field", "anyOf"],
  RUN_EVIDENCE: ["field", "anyOf"],
  HUMAN_OVERRIDE: ["field", "anyOf"],
  LLM_SIGNAL: ["field", "anyOf"]
};

// Keys that would introduce negation or nesting. Named explicitly so the
// refusal says which forbidden shape was used rather than "unknown key".
const NEGATION_KEYS = ["not", "negate", "none", "exclude", "unless", "noneOf"];
const NESTING_KEYS = ["allOf", "anyOfConditions", "oneOf", "conditions"];

const RULE_ID = /^[A-Z][A-Z0-9_]*$/;

export interface RiskCondition {
  matchTarget: MatchTarget;
  glob?: string;
  argv?: string[];
  matchMode?: MatchMode;
  pattern?: string;
  field?: string;
  anyOf?: unknown[];
}

export interface RiskRule {
  ruleId: string;
  allOf: RiskCondition[];
  riskLevel: RiskLevel;
  definedByRef?: { path: string; hash: string };
}

export interface RiskFinding {
  jsonPointer: string;
  detail: string;
}

export function validateRiskRules(value: unknown, pointer: string): RiskFinding[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "riskRules must be an array" }];
  }

  const findings: RiskFinding[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const at = `${pointer}/${index}`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      findings.push({ jsonPointer: at, detail: "a risk rule must be an object" });
      return;
    }
    const rule = entry as Record<string, unknown>;

    const id = rule.ruleId;
    if (typeof id !== "string" || !RULE_ID.test(id)) {
      findings.push({ jsonPointer: `${at}/ruleId`, detail: "ruleId must match [A-Z][A-Z0-9_]*" });
    } else if (seen.has(id)) {
      findings.push({ jsonPointer: `${at}/ruleId`, detail: `${id} is declared more than once` });
    } else {
      seen.add(id);
    }

    if (typeof rule.riskLevel !== "string" || !(RISK_LEVELS as readonly string[]).includes(rule.riskLevel)) {
      findings.push({
        jsonPointer: `${at}/riskLevel`,
        detail:
          `must be one of ${RISK_LEVELS.join(", ")}. UNKNOWN is not a severity a rule can assign; ` +
          "it means nothing could be determined"
      });
    }

    if (!Array.isArray(rule.allOf) || rule.allOf.length === 0) {
      findings.push({ jsonPointer: `${at}/allOf`, detail: "allOf must be a non-empty array of conditions" });
      return;
    }

    rule.allOf.forEach((condition, ci) => {
      findings.push(...validateCondition(condition, `${at}/allOf/${ci}`));
    });
  });

  return findings;
}

function validateCondition(value: unknown, pointer: string): RiskFinding[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "a condition must be an object" }];
  }
  const condition = value as Record<string, unknown>;
  const findings: RiskFinding[] = [];

  const target = condition.matchTarget;
  if (typeof target !== "string" || !(MATCH_TARGETS as readonly string[]).includes(target)) {
    return [
      {
        jsonPointer: `${pointer}/matchTarget`,
        detail: `must be one of ${MATCH_TARGETS.join(", ")}`
      }
    ];
  }

  for (const key of Object.keys(condition)) {
    if (NESTING_KEYS.includes(key)) {
      findings.push({
        jsonPointer: `${pointer}/${key}`,
        detail: "allOf entries do not nest; write a flat conjunction"
      });
    }
    if (NEGATION_KEYS.includes(key)) {
      findings.push({
        jsonPointer: `${pointer}/${key}`,
        detail:
          "negation is not expressible in a risk rule. A rule that fires on a failed match could lower " +
          "risk, and lowering goes only through an explicit exemption"
      });
    }
  }

  // A condition carries only the keys its matchTarget defines. Anything else is
  // a matcher this rule does not get to use.
  const allowed = new Set(["matchTarget", ...TARGET_KEYS[target as MatchTarget]]);
  const extra = Object.keys(condition).filter(
    (k) => !allowed.has(k) && !NEGATION_KEYS.includes(k) && !NESTING_KEYS.includes(k)
  );
  if (extra.length > 0) {
    findings.push({
      jsonPointer: pointer,
      detail: `${target} conditions carry only ${TARGET_KEYS[target as MatchTarget].join(", ")}; unexpected ${extra.sort().join(", ")}`
    });
  }

  switch (target) {
    case "PATH":
    case "TASK_SCOPE":
    case "DIFF": {
      if (typeof condition.glob !== "string" || condition.glob.length === 0) {
        findings.push({ jsonPointer: `${pointer}/glob`, detail: "must be a files policy glob" });
        break;
      }
      // Borrowed wholesale: the same validator the files policy uses.
      const problem = validatePattern(condition.glob);
      if (problem !== null) {
        findings.push({ jsonPointer: `${pointer}/glob`, detail: `${problem.problem} — ${problem.detail}` });
      }
      break;
    }
    case "COMMAND": {
      if (!Array.isArray(condition.argv) || condition.argv.length === 0 || condition.argv.some((a) => typeof a !== "string")) {
        findings.push({ jsonPointer: `${pointer}/argv`, detail: "must be a non-empty argv array" });
      }
      if (condition.matchMode !== undefined && condition.matchMode !== "PREFIX" && condition.matchMode !== "EXACT") {
        findings.push({ jsonPointer: `${pointer}/matchMode`, detail: "must be PREFIX or EXACT" });
      }
      break;
    }
    case "FILE_CONTENT": {
      if (typeof condition.pattern !== "string" || condition.pattern.length === 0) {
        findings.push({ jsonPointer: `${pointer}/pattern`, detail: "must be a redaction-subset pattern" });
      }
      break;
    }
    default: {
      if (typeof condition.field !== "string" || condition.field.length === 0) {
        findings.push({ jsonPointer: `${pointer}/field`, detail: "must name a field" });
      }
      if (!Array.isArray(condition.anyOf) || condition.anyOf.length === 0) {
        findings.push({ jsonPointer: `${pointer}/anyOf`, detail: "must be a non-empty value list" });
      }
      break;
    }
  }

  return findings;
}

export interface RiskSubject {
  changedPaths: string[];
  scopePatterns: string[];
  commands: string[][];
  fields: Record<string, unknown>;
  caseSensitivePaths: boolean;
}

export interface RiskEvaluation {
  level: ComputedRisk;
  reasons: string[];
  matchedRuleIds: string[];
  unavailableReasons: string[];
  scanScope: { rulesEvaluated: number; conditionsEvaluated: number; rulesMatched: number };
}

/**
 * computedRisk is the max over every rule whose allOf matched completely.
 * Anything that cannot be decided yields UNKNOWN rather than a level, and
 * UNKNOWN wins over any level because it means the picture is incomplete.
 */
export function evaluateRisk(input: {
  rules: RiskRule[];
  subject: RiskSubject;
  evidenceAvailable: boolean;
}): RiskEvaluation {
  const { rules, subject, evidenceAvailable } = input;
  const unavailableReasons: string[] = [];
  const matchedRuleIds: string[] = [];
  const reasons: string[] = [];
  let conditionsEvaluated = 0;
  let highest = -1;

  if (!evidenceAvailable) {
    unavailableReasons.push("RISK_INPUT_EVIDENCE_DEGRADED");
  }
  if (rules.length === 0) {
    // No rules is not "no risk". Nobody determined anything.
    unavailableReasons.push("NO_RISK_RULES_CONFIGURED");
  }

  for (const rule of rules) {
    let allMatched = true;
    for (const condition of rule.allOf) {
      conditionsEvaluated += 1;
      const outcome = evaluateCondition(condition, subject);
      if (outcome === "UNAVAILABLE") {
        unavailableReasons.push(`RISK_CONDITION_NOT_EVALUABLE:${rule.ruleId}:${condition.matchTarget}`);
        allMatched = false;
        break;
      }
      if (!outcome) {
        allMatched = false;
        break;
      }
    }
    // A rule contributes only when every condition matched. A partial match
    // contributes nothing, which is what makes allOf a conjunction.
    if (allMatched) {
      matchedRuleIds.push(rule.ruleId);
      reasons.push(`${rule.ruleId}:${rule.riskLevel}`);
      highest = Math.max(highest, RISK_LEVELS.indexOf(rule.riskLevel));
    }
  }

  const scanScope = { rulesEvaluated: rules.length, conditionsEvaluated, rulesMatched: matchedRuleIds.length };

  if (unavailableReasons.length > 0) {
    return { level: "UNKNOWN", reasons: unavailableReasons, matchedRuleIds, unavailableReasons, scanScope };
  }

  return {
    level: highest >= 0 ? RISK_LEVELS[highest] : "LOW",
    reasons: highest >= 0 ? reasons : ["NO_RISK_RULE_MATCHED"],
    matchedRuleIds,
    unavailableReasons,
    scanScope
  };
}

function evaluateCondition(condition: RiskCondition, subject: RiskSubject): boolean | "UNAVAILABLE" {
  switch (condition.matchTarget) {
    case "PATH":
    case "DIFF":
      return subject.changedPaths.some((p) => matchesPattern(p, condition.glob ?? "", subject.caseSensitivePaths));
    case "TASK_SCOPE":
      return subject.scopePatterns.some((p) => p === condition.glob);
    case "COMMAND":
      return subject.commands.some((argv) =>
        // Case-sensitive, matching how allowedCommands compare. A risk rule
        // reads the same way the command policy does or the two disagree.
        matchesCommand(argv, { argv: condition.argv ?? [], matchMode: condition.matchMode ?? "PREFIX" }, true)
      );
    case "FILE_CONTENT":
      // The redaction subset is the matcher this borrows, and it does not exist
      // yet. Reporting it as unavailable keeps a rule nobody could evaluate from
      // reading as a rule that did not match.
      return "UNAVAILABLE";
    default: {
      const value = subject.fields[condition.field ?? ""];
      if (value === undefined) {
        return "UNAVAILABLE";
      }
      return (condition.anyOf ?? []).some((candidate) => candidate === value);
    }
  }
}

/** UNKNOWN blocks anything that needs a concrete level; it is never rewritten. */
export function blocksAutomaticProgression(level: ComputedRisk): boolean {
  return level === "UNKNOWN";
}
