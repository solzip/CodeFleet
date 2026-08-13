import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCoverage, evaluateStatus } from "../scripts/check-rule-coverage.mjs";
import { loadRuleIndex } from "../scripts/design-doc.mjs";

// The coverage checker is the thing that will tell us, from here on, how much of
// the design the suite actually checks. If it silently accepts a made-up claim
// then every number it prints is decoration. These tests are the checker being
// checked.

const RULES = [
  { ruleId: "RULE_A", conditions: ["a first condition", "a second condition"] },
  { ruleId: "RULE_B", conditions: ["only condition"] }
];

test("a claim naming a rule that does not exist fails", () => {
  const { errors } = evaluateCoverage(RULES, [{ ruleId: "RULE_Z", conditionQuote: "anything" }], null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /unknown ruleId claimed: RULE_Z/);
});

test("a claim quoting a condition the rule does not contain fails", () => {
  // The failure this prevents: a test that checks something unrelated, labelled
  // with a rule id, inflating the number nobody re-derives.
  const { errors } = evaluateCoverage(
    RULES,
    [{ ruleId: "RULE_A", conditionQuote: "a condition I invented" }],
    null
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /claimed condition is not in the rule/);
});

test("recording nothing at all is a failure, not full marks", () => {
  const { errors } = evaluateCoverage(RULES, [], null);
  assert.match(errors.join(""), /no coverage claims were recorded at all/);
});

test("the same condition claimed twice counts once", () => {
  const { stats } = evaluateCoverage(
    RULES,
    [
      { ruleId: "RULE_A", conditionQuote: "a first condition" },
      { ruleId: "RULE_A", conditionQuote: "a first condition" }
    ],
    null
  );
  assert.equal(stats.claimsRecorded, 2);
  assert.equal(stats.coveredConditions, 1);
});

test("a rule counts as fully covered only when every condition is claimed", () => {
  const partial = evaluateCoverage(RULES, [{ ruleId: "RULE_A", conditionQuote: "a first condition" }], null);
  assert.equal(partial.stats.rulesTouched, 1);
  assert.equal(partial.stats.rulesFullyCovered, 0);

  const full = evaluateCoverage(
    RULES,
    [
      { ruleId: "RULE_A", conditionQuote: "a first condition" },
      { ruleId: "RULE_A", conditionQuote: "a second condition" }
    ],
    null
  );
  assert.equal(full.stats.rulesFullyCovered, 1);
});

test("coverage falling below the baseline fails", () => {
  const claims = [{ ruleId: "RULE_A", conditionQuote: "a first condition" }];
  const baseline = { coveredConditions: 2, perRule: { RULE_A: 2 } };

  const { errors } = evaluateCoverage(RULES, claims, baseline);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /coverage fell: 1 covered, baseline is 2/);
  assert.match(errors[1], /RULE_A: covered conditions fell from 2 to 1/);
});

// The status file is where "why is this rule unclaimed?" gets answered. Its
// answers are prose, so the only thing keeping them honest is that every claim
// they make is checked against something.

const ALWAYS_EXISTS = () => true;
const OK_ENTRY = { status: "NOT_IMPLEMENTED", evidence: "src/", detail: "searched, found nothing" };

function statusOf(entries: Record<string, unknown>) {
  return { rules: entries };
}

test("a rule with neither a claim nor a status entry fails", () => {
  const { errors } = evaluateStatus(RULES, new Map(), statusOf({ RULE_A: OK_ENTRY }), ALWAYS_EXISTS);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /RULE_B: no coverage claim and no status entry/);
});

test("a status entry whose evidence path does not exist fails", () => {
  // Prose can assert anything. A path that cannot be opened is the one part of
  // the claim a machine can refuse.
  const { errors } = evaluateStatus(
    RULES,
    new Map(),
    statusOf({
      RULE_A: { ...OK_ENTRY, evidence: "src/does-not-exist.ts" },
      RULE_B: OK_ENTRY
    }),
    (p) => p === "src/"
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /evidence path does not exist/);
});

test("a status entry becomes stale the moment a test claims the rule", () => {
  const covered = new Map([["RULE_A", new Set(["a first condition"])]]);
  const { errors } = evaluateStatus(
    RULES,
    covered,
    statusOf({ RULE_A: OK_ENTRY, RULE_B: OK_ENTRY }),
    ALWAYS_EXISTS
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /RULE_A: a passing test now claims this rule/);
});

test("a status entry naming a rule that does not exist fails", () => {
  const { errors } = evaluateStatus(
    RULES,
    new Map(),
    statusOf({ RULE_A: OK_ENTRY, RULE_B: OK_ENTRY, RULE_GHOST: OK_ENTRY }),
    ALWAYS_EXISTS
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /classifies a rule that does not exist: RULE_GHOST/);
});

test("an unknown status value and an empty detail are both refused", () => {
  const { errors } = evaluateStatus(
    RULES,
    new Map(),
    statusOf({
      RULE_A: { status: "PROBABLY_FINE", evidence: "src/", detail: "x" },
      RULE_B: { status: "NOT_IMPLEMENTED", evidence: "src/", detail: "   " }
    }),
    ALWAYS_EXISTS
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /unknown status/);
  assert.match(errors[1], /needs a detail/);
});

test("the real design document parses into rules that all carry conditions", async () => {
  const { rules } = await loadRuleIndex();

  // A parse returning nothing would make every coverage percentage a division
  // by a number nobody checked.
  assert.ok(rules.length >= 80, `expected at least 80 rules, parsed ${rules.length}`);

  const withoutConditions = rules.filter((rule) => rule.conditions.length === 0).map((rule) => rule.ruleId);
  assert.deepEqual(withoutConditions, [], "every FINAL RULE must state at least one condition");

  const total = rules.reduce((sum, rule) => sum + rule.conditions.length, 0);
  console.log(`design document: ${rules.length} rules, ${total} condition lines`);
  assert.ok(total >= 300, `expected at least 300 condition lines, parsed ${total}`);
});

// The verdict has to arrive before the report, and a test has to hold it there.
//
// The checker reported a broken claim correctly for nine commits and nobody
// read it, because the failure printed after a success-shaped report. 21f2080
// moved the banner in front of the table. Nothing asserted the order, so the
// banner could drift back behind the table and every test would still pass —
// the defence would be undefended. P1-61.
//
// This runs the real script rather than a copy of its logic: the ordering is a
// property of its output, and a reimplementation here would be a second program
// that agrees with itself.

// allowedEffect is not decoration. parseConditions matches condition lines that
// end in a newline, and the block body has its trailing newline stripped with
// the closing fence, so a rule whose condition list is the last thing in the
// block parses as zero conditions. Every rule in the real document is followed
// by another key, which is why this only shows up in a fixture.
const FIXTURE_RULE_DOC = [
  "# fixture design document",
  "",
  "```yaml",
  "ruleId: FIXTURE_RULE",
  "status: FINAL",
  "scope: RUN",
  "condition:",
  "- the only condition",
  "allowedEffect:",
  "- nothing",
  "```",
  ""
].join("\n");

const BANNER = "RULE COVERAGE CHECK FAILED";
const REPORT = "=== FINAL RULE coverage by condition line ===";

/**
 * The checker, run against a design document and a claim sink this test owns.
 *
 * REPO_ROOT is derived from the script's own location, so redirecting it means
 * placing the script somewhere else. Copying the two modules into a skeleton is
 * what makes this independent of the live .rule-coverage sink, which the rest of
 * the suite is writing to while this runs.
 */
async function runChecker(claims: { ruleId: string; conditionQuote: string }[]): Promise<{
  code: number | null;
  stdout: string;
}> {
  const { copyFile, mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");

  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-checker-"));
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await mkdir(path.join(root, ".rule-coverage"), { recursive: true });

  for (const name of ["design-doc.mjs", "check-rule-coverage.mjs"]) {
    await copyFile(path.join(process.cwd(), "scripts", name), path.join(root, "scripts", name));
  }
  await writeFile(path.join(root, "docs", "concept-foundation.md"), FIXTURE_RULE_DOC, "utf8");
  await writeFile(
    path.join(root, ".rule-coverage", "claims.jsonl"),
    `${claims.map((claim) => JSON.stringify(claim)).join("\n")}\n`,
    "utf8"
  );

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "check-rule-coverage.mjs")], {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    // stderr is drained so the child never blocks on a full pipe. The assertions
    // below are about stdout on purpose: the banner shares a stream with the
    // report precisely so that 2>&1 cannot reorder them.
    child.stderr.resume();
    child.on("close", (code) => {
      resolve({ code, stdout });
    });
  });
}

test("a failing coverage check announces itself before it prints the report", async () => {
  const { code, stdout } = await runChecker([
    { ruleId: "FIXTURE_RULE", conditionQuote: "a condition this rule does not contain" }
  ]);

  assert.equal(code, 1, `the checker must exit non-zero, got ${code}:\n${stdout}`);

  const bannerAt = stdout.indexOf(BANNER);
  const reportAt = stdout.indexOf(REPORT);
  assert.ok(bannerAt >= 0, `the failure banner is missing from stdout:\n${stdout}`);
  assert.ok(reportAt >= 0, `the coverage report is missing from stdout:\n${stdout}`);
  assert.ok(
    bannerAt < reportAt,
    `the banner must precede the report, got banner at ${bannerAt} and report at ${reportAt}:\n${stdout}`
  );
});

test("a passing coverage check prints no failure banner", async () => {
  const { code, stdout } = await runChecker([
    { ruleId: "FIXTURE_RULE", conditionQuote: "the only condition" }
  ]);

  assert.equal(code, 0, `the checker must exit zero when every condition is claimed:\n${stdout}`);
  assert.ok(stdout.includes(REPORT), `the report is still printed on success:\n${stdout}`);
  assert.equal(
    stdout.includes(BANNER),
    false,
    `a passing run must not print the failure banner:\n${stdout}`
  );
});
