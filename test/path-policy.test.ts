import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePathPolicy, matchesPattern, validatePattern } from "../src/path-policy.ts";

// These assertions are the fixed matcher rule restated as executable checks.
// They were verified by hand once; keeping them as tests is what stops the
// matcher from drifting away from the rule it implements.

test("* matches inside one segment and never crosses a separator", () => {
  assert.equal(matchesPattern("src/a.js", "src/*", true), true);
  assert.equal(matchesPattern("src/a/b.js", "src/*", true), false);
  assert.equal(matchesPattern("src/application-prod.yml", "src/application*.yml", true), true);
});

test("** spans any depth but never matches the directory entry itself", () => {
  assert.equal(matchesPattern("src/a.js", "src/**", true), true);
  assert.equal(matchesPattern("src/a/b/c.js", "src/**", true), true);
  assert.equal(matchesPattern("src", "src/**", true), false);
  assert.equal(matchesPattern("a/target/x.js", "**/target/**", true), true);
  // A leading ** may consume zero segments, so "**/.env" catches a root-level
  // .env too. If it did not, a secret at the repository root would slip past a
  // denied pattern written exactly to catch it. Only a trailing ** is required
  // to consume at least one segment, so "src/**" never matches "src" itself.
  assert.equal(matchesPattern(".env", "**/.env", true), true);
  assert.equal(matchesPattern("a/b/.env", "**/.env", true), true);
});

test("matching is whole-path with no implicit subtree", () => {
  assert.equal(matchesPattern("src/a.js", "src", true), false);
  assert.equal(matchesPattern("src", "src", true), true);
  assert.equal(matchesPattern("src/main/java/A.java", "src/main", true), false);
});

test("unsupported pattern syntax is rejected", () => {
  assert.equal(validatePattern("src/[ab].js")?.problem, "UNSUPPORTED_SYNTAX");
  assert.equal(validatePattern("src/{a,b}.js")?.problem, "UNSUPPORTED_SYNTAX");
  assert.equal(validatePattern("!src/**")?.problem, "UNSUPPORTED_SYNTAX");
  assert.equal(validatePattern("src/a?.js")?.problem, "UNSUPPORTED_SYNTAX");
  assert.equal(validatePattern("a**b")?.problem, "GLOBSTAR_NOT_WHOLE_SEGMENT");
  assert.equal(validatePattern("/etc/passwd")?.problem, "ABSOLUTE");
  assert.equal(validatePattern("C:/x/**")?.problem, "ABSOLUTE");
  assert.equal(validatePattern("../x/**")?.problem, "PARENT_ESCAPE");
  assert.equal(validatePattern("src")?.problem, "DIRECTORY_WITHOUT_WILDCARD");
  assert.equal(validatePattern("src/**"), null);
  assert.equal(validatePattern("pom.xml"), null);
});

test("denied is evaluated before allowed and wins", () => {
  const result = evaluatePathPolicy({
    changedFiles: ["src/a.key"],
    allowedPaths: ["src/**"],
    deniedPaths: ["src/*.key"],
    caseSensitive: true
  });
  assert.equal(result.violations[0].violationCode, "PATH_MATCHES_DENIED_PATHS");
  assert.equal(result.violations[0].matchedPattern, "src/*.key");
});

test("a path outside allowedPaths is a violation, and an empty allowlist does not constrain", () => {
  const constrained = evaluatePathPolicy({
    changedFiles: ["infra/deploy.sh"],
    allowedPaths: ["src/**"],
    deniedPaths: [],
    caseSensitive: true
  });
  assert.equal(constrained.violations[0].violationCode, "PATH_OUTSIDE_ALLOWED_PATHS");

  const unconstrained = evaluatePathPolicy({
    changedFiles: ["infra/deploy.sh"],
    allowedPaths: [],
    deniedPaths: [],
    caseSensitive: true
  });
  assert.deepEqual(unconstrained.violations, []);
});

test("non-workspace-relative paths are violations before any matching", () => {
  const result = evaluatePathPolicy({
    changedFiles: ["/etc/passwd", "../outside.js"],
    allowedPaths: ["src/**"],
    deniedPaths: [],
    caseSensitive: true
  });
  assert.equal(result.violations.length, 2);
  assert.ok(result.violations.every((v) => v.violationCode === "PATH_NOT_WORKSPACE_RELATIVE"));
});

test("case-insensitive matching applies to allowed and denied alike, and evidence keeps original casing", () => {
  assert.equal(matchesPattern("SRC/A.JS", "src/**", false), true);
  assert.equal(matchesPattern("SRC/A.JS", "src/**", true), false);

  const result = evaluatePathPolicy({
    changedFiles: ["SRC/A.JS"],
    allowedPaths: ["src/**"],
    deniedPaths: [],
    caseSensitive: false
  });
  assert.deepEqual(result.violations, []);
  assert.equal(result.checkedPaths[0], "SRC/A.JS");
});

test("a symlink escaping the workspace is a violation on its own", () => {
  const result = evaluatePathPolicy({
    changedFiles: ["src/link.js"],
    allowedPaths: ["src/**"],
    deniedPaths: [],
    caseSensitive: true,
    symlinkEscapes: ["src/link.js"]
  });
  assert.equal(result.violations[0].violationCode, "SYMLINK_TARGET_ESCAPES_WORKSPACE");
});

test("a nested repository degrades the evaluation rather than reporting no violations", () => {
  const result = evaluatePathPolicy({
    changedFiles: ["src/a.js"],
    allowedPaths: ["src/**"],
    deniedPaths: [],
    caseSensitive: true,
    nestedRepoPaths: ["vendor/lib"]
  });
  assert.equal(result.evaluated, false);
  assert.match(result.unavailableReason, /^NESTED_REPO_NOT_TRAVERSED:vendor\/lib$/);
});
