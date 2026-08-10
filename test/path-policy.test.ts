import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePathPolicy, matchesPattern, validatePattern } from "../src/path-policy.ts";
import { coversRule } from "./rule-coverage.ts";

const GLOB = "FILES_POLICY_MATCHER_IS_BOUNDED_GLOB_SUBSET";
const DENIED = "DENIED_PATHS_OVERRIDE_ALLOWED_PATHS";
const CANONICAL = "PATHS_ARE_WORKSPACE_RELATIVE_AND_CANONICAL";
const CASE_KEY = "CASE_INSENSITIVE_PATH_MATCH_USES_CANONICAL_KEY";
const SYMLINK = "SYMLINK_TARGET_MUST_NOT_ESCAPE_PATH_POLICY";
const NESTED = "NESTED_REPO_AND_SUBMODULE_REQUIRE_EXPLICIT_ALLOW";

// These assertions are the fixed matcher rule restated as executable checks.
// They were verified by hand once; keeping them as tests is what stops the
// matcher from drifting away from the rule it implements.

test("* matches inside one segment and never crosses a separator", () => {
  assert.equal(matchesPattern("src/a.js", "src/*", true), true);
  assert.equal(matchesPattern("src/a/b.js", "src/*", true), false);
  assert.equal(matchesPattern("src/application-prod.yml", "src/application*.yml", true), true);

  coversRule(GLOB, "`*` never matches across a path separator.");
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

  coversRule(
    GLOB,
    "`dir/**` matches file paths under dir at any depth and does not match the directory entry itself."
  );
});

test("matching is whole-path with no implicit subtree", () => {
  assert.equal(matchesPattern("src/a.js", "src", true), false);
  assert.equal(matchesPattern("src", "src", true), true);
  assert.equal(matchesPattern("src/main/java/A.java", "src/main", true), false);

  coversRule(GLOB, "matching is whole-path and never expands a prefix into an implicit subtree.");
  coversRule(GLOB, "a pattern without a wildcard is an exact normalized path match.");
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

  coversRule(GLOB, "patterns use only literal segments, single-segment `*`, and whole-segment `**`.");
  coversRule(
    GLOB,
    "patterns contain no `?`, character class, brace expansion, negation, extglob, or regular expression."
  );
  coversRule(
    GLOB,
    "`**` occupies a whole path segment and never appears adjacent to other characters inside a segment."
  );
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

  coversRule(DENIED, "deniedPaths are evaluated before allowedPaths");
  coversRule(DENIED, "any deniedPaths match creates a violation even when allowedPaths also match");
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

  coversRule(
    DENIED,
    "absence of allowedPaths match creates a violation unless policy explicitly allows the path class"
  );
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

  coversRule(CANONICAL, "absolute paths are rejected as policy targets");
  coversRule(CANONICAL, "`..` path escape outside workspaceRootRef is rejected");
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

  coversRule(CASE_KEY, "case-insensitive filesystems use case-folded comparison keys for policy matching");
  coversRule(CASE_KEY, "original path casing is preserved as evidence");
  coversRule(
    CASE_KEY,
    "deniedPaths matching uses the same filesystem sensitivity semantics as allowedPaths"
  );
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

  coversRule(SYMLINK, "symlink target realPath must remain inside selectedWorkspaceRootRealPath");
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

  coversRule(NESTED, "nested repo changes are blocked by default");
  coversRule(NESTED, "nested .git directory or gitfile boundary is recorded as NESTED_REPO or SUBMODULE");
});
