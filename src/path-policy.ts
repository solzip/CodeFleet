// Path matching for policies.files allowedPaths / deniedPaths.
//
// The pattern language is the fixed bounded glob subset: literal segments,
// single-segment `*`, and whole-segment `**`. No character class, brace
// expansion, negation, or regex. Matching is whole-path with no implicit
// subtree expansion, so `src` matches a file named `src` and never
// `src/greet.js`.

export type PatternProblem =
  | "EMPTY"
  | "ABSOLUTE"
  | "PARENT_ESCAPE"
  | "UNSUPPORTED_SYNTAX"
  | "GLOBSTAR_NOT_WHOLE_SEGMENT"
  | "DIRECTORY_WITHOUT_WILDCARD";

export interface PatternValidation {
  pattern: string;
  problem: PatternProblem;
  message: string;
}

export type ViolationCode =
  | "PATH_MATCHES_DENIED_PATHS"
  | "PATH_OUTSIDE_ALLOWED_PATHS"
  | "PATH_NOT_WORKSPACE_RELATIVE";

export interface PathViolation {
  path: string;
  violationCode: ViolationCode;
  matchedPattern: string;
}

export interface PathPolicyEvaluation {
  evaluated: boolean;
  caseSensitive: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
  checkedPaths: string[];
  violations: PathViolation[];
  unavailableReason: string;
}

const UNSUPPORTED = /[?\[\]{}!()+@]/;

export function validatePattern(pattern: string): PatternValidation | null {
  const value = pattern.trim();

  if (value.length === 0) {
    return problem(pattern, "EMPTY", "pattern must not be empty");
  }
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    return problem(pattern, "ABSOLUTE", "pattern must be workspace-relative");
  }
  if (value.split("/").includes("..")) {
    return problem(pattern, "PARENT_ESCAPE", "pattern must not escape the workspace with ..");
  }
  if (UNSUPPORTED.test(value)) {
    return problem(
      pattern,
      "UNSUPPORTED_SYNTAX",
      "only literal segments, single-segment * and whole-segment ** are supported"
    );
  }

  const segments = value.split("/");
  for (const segment of segments) {
    if (segment.includes("**") && segment !== "**") {
      return problem(
        pattern,
        "GLOBSTAR_NOT_WHOLE_SEGMENT",
        "** must occupy a whole path segment"
      );
    }
  }

  // A wildcard-free pattern matches exactly one file path. Writing a bare
  // directory name is almost always meant as a subtree, and silently matching
  // nothing would put every file in that directory outside the scope.
  if (!value.includes("*")) {
    const last = segments[segments.length - 1];
    if (!last.includes(".")) {
      return problem(
        pattern,
        "DIRECTORY_WITHOUT_WILDCARD",
        `"${value}" matches only a file named "${value}". Write "${value}/**" for a subtree.`
      );
    }
  }

  return null;
}

export function matchesPattern(filePath: string, pattern: string, caseSensitive: boolean): boolean {
  const target = normalizeForCompare(filePath, caseSensitive).split("/");
  const source = normalizeForCompare(pattern.trim(), caseSensitive).split("/");
  return matchSegments(target, 0, source, 0);
}

function matchSegments(
  target: string[],
  targetIndex: number,
  pattern: string[],
  patternIndex: number
): boolean {
  if (patternIndex === pattern.length) {
    return targetIndex === target.length;
  }

  const segment = pattern[patternIndex];

  if (segment === "**") {
    // `**` consumes zero or more whole segments. Consuming zero would let
    // "src/**" match the directory entry "src" itself, which the fixed rule
    // excludes, so a trailing ** requires at least one remaining segment.
    const isTrailing = patternIndex === pattern.length - 1;
    const minimum = isTrailing ? 1 : 0;
    for (let skip = minimum; targetIndex + skip <= target.length; skip += 1) {
      if (matchSegments(target, targetIndex + skip, pattern, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }

  if (targetIndex === target.length) {
    return false;
  }
  if (!matchSegment(target[targetIndex], segment)) {
    return false;
  }

  return matchSegments(target, targetIndex + 1, pattern, patternIndex + 1);
}

// `*` matches within one segment and never crosses a separator.
function matchSegment(value: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return value === pattern;
  }

  const parts = pattern.split("*");
  let cursor = 0;

  const first = parts[0];
  if (!value.startsWith(first)) {
    return false;
  }
  cursor = first.length;

  for (let index = 1; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (part.length === 0) {
      continue;
    }
    const found = value.indexOf(part, cursor);
    if (found === -1) {
      return false;
    }
    cursor = found + part.length;
  }

  const last = parts[parts.length - 1];
  return value.length - cursor >= last.length && value.endsWith(last);
}

export function evaluatePathPolicy(input: {
  changedFiles: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  caseSensitive: boolean;
}): PathPolicyEvaluation {
  const { changedFiles, allowedPaths, deniedPaths, caseSensitive } = input;
  const violations: PathViolation[] = [];

  for (const filePath of changedFiles) {
    if (filePath.startsWith("/") || /^[A-Za-z]:/.test(filePath) || filePath.split("/").includes("..")) {
      violations.push({
        path: filePath,
        violationCode: "PATH_NOT_WORKSPACE_RELATIVE",
        matchedPattern: ""
      });
      continue;
    }

    // Denied wins, and it is evaluated first.
    const denied = deniedPaths.find((pattern) => matchesPattern(filePath, pattern, caseSensitive));
    if (denied !== undefined) {
      violations.push({
        path: filePath,
        violationCode: "PATH_MATCHES_DENIED_PATHS",
        matchedPattern: denied
      });
      continue;
    }

    if (allowedPaths.length === 0) {
      continue;
    }

    const allowed = allowedPaths.find((pattern) => matchesPattern(filePath, pattern, caseSensitive));
    if (allowed === undefined) {
      violations.push({
        path: filePath,
        violationCode: "PATH_OUTSIDE_ALLOWED_PATHS",
        matchedPattern: ""
      });
    }
  }

  return {
    evaluated: true,
    caseSensitive,
    allowedPaths,
    deniedPaths,
    checkedPaths: changedFiles,
    violations,
    unavailableReason: ""
  };
}

function normalizeForCompare(value: string, caseSensitive: boolean): string {
  const normalized = value.split("\\").join("/").replace(/^\.\//, "");
  return caseSensitive ? normalized : normalized.toLowerCase();
}

function problem(pattern: string, code: PatternProblem, message: string): PatternValidation {
  return { pattern, problem: code, message };
}
