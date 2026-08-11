// Redaction — the one place in CodeFleet that takes a pattern language.
//
// Everywhere else a matcher is literal tokens or a bounded glob, because a
// matcher that decides permission must be readable at a glance. Redaction is
// different: it decides removal, and secrets cannot be caught by literals. So it
// gets a regex, and the risk that comes with one is bounded by grammar rather
// than by care.
//
// Backreferences and lookaround are refused, not discouraged. Both are what make
// a regex able to take exponential time on a crafted input, and a sanitizer that
// can be stalled by the content it sanitizes is a sanitizer that fails open on
// the exports that matter most. Unbounded upper repetition is refused for the
// same reason: {2,} has no ceiling to reason about.

export const REDACTION_ACTIONS = ["DROPPED", "REDACTED", "HASHED", "RELATIVIZED"] as const;
export type RedactionAction = (typeof REDACTION_ACTIONS)[number];

/**
 * Strictness order, strictest first. HASHED ranks below REDACTED because a hash
 * still preserves equality: the same secret hashes the same way across Runs, so
 * an observer learns that two exports touched the same value.
 */
export function actionStrictness(action: RedactionAction): number {
  return REDACTION_ACTIONS.indexOf(action);
}

export function strictestAction(actions: RedactionAction[]): RedactionAction | null {
  if (actions.length === 0) {
    return null;
  }
  return actions.reduce((a, b) => (actionStrictness(a) <= actionStrictness(b) ? a : b));
}

export interface RedactionRule {
  ruleId: string;
  pattern: string;
  action: RedactionAction;
  /** Export field paths this applies to. Empty means all sanitized content. */
  appliesTo?: string[];
}

export interface PatternProblem {
  problem: string;
  detail: string;
}

// Each entry names one construct the subset excludes. They are listed
// individually so a refusal says which one was used rather than "unsupported".
const FORBIDDEN_CONSTRUCTS: { problem: string; re: RegExp; detail: string }[] = [
  {
    problem: "BACKREFERENCE",
    re: /\\[1-9]\d*|\\k<[^>]*>/,
    detail: "a backreference makes matching non-regular and can take exponential time"
  },
  {
    problem: "LOOKAROUND",
    re: /\(\?<?[=!]/,
    detail: "lookahead and lookbehind are not expressible in a finite automaton"
  },
  { problem: "RECURSION", re: /\(\?R\)|\(\?\d+\)|\(\?&/, detail: "recursion is not a regular construct" },
  { problem: "CONDITIONAL", re: /\(\?\(/, detail: "a conditional depends on capture state" },
  { problem: "ATOMIC_GROUP", re: /\(\?>/, detail: "an atomic group exists to control backtracking, which this subset does not do" },
  {
    problem: "POSSESSIVE_QUANTIFIER",
    re: /(?:[*+?]|\{\d+(?:,\d*)?\})\+/,
    detail: "a possessive quantifier exists to control backtracking, which this subset does not do"
  },
  {
    problem: "UNBOUNDED_REPETITION_RANGE",
    re: /\{\d+,\}/,
    detail: "repetition bounds must be explicit and finite; write {n,m}"
  }
];

export function validateRedactionPattern(pattern: string): PatternProblem | null {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return { problem: "EMPTY", detail: "a redaction pattern must be a non-empty string" };
  }

  for (const construct of FORBIDDEN_CONSTRUCTS) {
    if (construct.re.test(pattern)) {
      return { problem: construct.problem, detail: construct.detail };
    }
  }

  // Compiling last: a pattern may be inside the subset and still be malformed,
  // and the two failures have different repairs.
  try {
    new RegExp(pattern, "g");
  } catch (error) {
    return {
      problem: "DOES_NOT_COMPILE",
      detail: error instanceof Error ? error.message : String(error)
    };
  }

  return null;
}

export interface RuleFinding {
  jsonPointer: string;
  detail: string;
}

export function validateRedactionRules(value: unknown, pointer: string): RuleFinding[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "redactionRules must be an array" }];
  }

  const findings: RuleFinding[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const at = `${pointer}/${index}`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      findings.push({ jsonPointer: at, detail: "a redaction rule must be an object" });
      return;
    }
    const rule = entry as Record<string, unknown>;

    if (typeof rule.ruleId !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(rule.ruleId)) {
      findings.push({ jsonPointer: `${at}/ruleId`, detail: "ruleId must match [A-Z][A-Z0-9_]*" });
    } else if (seen.has(rule.ruleId)) {
      findings.push({ jsonPointer: `${at}/ruleId`, detail: `${rule.ruleId} is declared more than once` });
    } else {
      seen.add(rule.ruleId);
    }

    if (typeof rule.action !== "string" || !(REDACTION_ACTIONS as readonly string[]).includes(rule.action)) {
      findings.push({ jsonPointer: `${at}/action`, detail: `must be one of ${REDACTION_ACTIONS.join(", ")}` });
    }

    const problem = validateRedactionPattern(rule.pattern as string);
    if (problem !== null) {
      findings.push({ jsonPointer: `${at}/pattern`, detail: `${problem.problem} — ${problem.detail}` });
    }

    if (rule.appliesTo !== undefined) {
      if (!Array.isArray(rule.appliesTo) || rule.appliesTo.some((p) => typeof p !== "string")) {
        findings.push({ jsonPointer: `${at}/appliesTo`, detail: "must be an array of export field paths" });
      }
    }
  });

  return findings;
}

export interface RedactionEntry {
  ruleId: string;
  fieldPath: string;
  matchKind: string;
  action: RedactionAction;
  severity: "WARNING" | "CORRUPTION";
}

export interface RedactionOutcome {
  value: unknown;
  entries: RedactionEntry[];
}

/**
 * Applies the strictest matching rule to one string value. Every rule that
 * matched is recorded, not only the one that won, so the report says what was
 * considered rather than only what happened.
 */
export function applyRedaction(
  fieldPath: string,
  value: unknown,
  rules: RedactionRule[]
): RedactionOutcome {
  if (typeof value !== "string") {
    return { value, entries: [] };
  }

  const entries: RedactionEntry[] = [];
  const matched: RedactionAction[] = [];

  for (const rule of rules) {
    if (rule.appliesTo !== undefined && rule.appliesTo.length > 0 && !rule.appliesTo.includes(fieldPath)) {
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, "g");
    } catch {
      continue; // validation already blocked the export; nothing is applied here
    }
    if (!re.test(value)) {
      continue;
    }
    matched.push(rule.action);
    entries.push({
      ruleId: rule.ruleId,
      fieldPath,
      matchKind: "REDACTION_RULE_MATCH",
      action: rule.action,
      severity: "WARNING"
    });
  }

  const winner = strictestAction(matched);
  if (winner === null) {
    return { value, entries };
  }

  return { value: transform(value, winner, rules, fieldPath), entries };
}

function transform(value: string, action: RedactionAction, rules: RedactionRule[], fieldPath: string): unknown {
  switch (action) {
    case "DROPPED":
      return undefined;
    case "REDACTED":
      return "[REDACTED]";
    case "HASHED":
      return `sha256:${simpleHash(value)}`;
    case "RELATIVIZED":
      // Only the matched span is relativized, so surrounding text survives.
      return rules
        .filter((r) => r.action === "RELATIVIZED" && (r.appliesTo === undefined || r.appliesTo.length === 0 || r.appliesTo.includes(fieldPath)))
        .reduce((text, rule) => text.replace(new RegExp(rule.pattern, "g"), "<relative>"), value);
  }
}

// Not a cryptographic identity; the point is that HASHED preserves equality,
// which is exactly why it ranks below REDACTED.
function simpleHash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
