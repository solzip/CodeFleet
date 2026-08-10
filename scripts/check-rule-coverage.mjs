// Answers one question with a number: how much of the design does the test
// suite actually check?
//
// Runs after the suite, over what the passing tests recorded. Three ways to
// fail, all of them silent-green hazards this project has already been bitten
// by once:
//   1. a claim naming a rule that does not exist
//   2. a claim quoting a condition the rule does not contain
//   3. coverage lower than the recorded baseline
//
// It does not certify that the design is implemented. It measures how many
// condition lines a passing test claims to check, and names every line nobody
// claims. Those are different statements and the report says so.

import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BASELINE_PATH, COVERAGE_DIR, REPO_ROOT, STATUS_PATH, loadRuleIndex } from "./design-doc.mjs";

// Exported so the checker can be checked. A verifier nobody verifies is the
// exact failure this whole mechanism exists to catch.
export function evaluateCoverage(rules, claims, baseline) {
  const byId = new Map(rules.map((rule) => [rule.ruleId, rule]));
  const errors = [];
  const covered = new Map();

  for (const claim of claims) {
    const rule = byId.get(claim.ruleId);
    if (rule === undefined) {
      errors.push(`unknown ruleId claimed: ${claim.ruleId}`);
      continue;
    }
    if (!rule.conditions.includes(claim.conditionQuote)) {
      // A quote that is not in the rule means the test is checking something
      // else, or the rule changed underneath it. Either way the claim is wrong.
      errors.push(
        `${claim.ruleId}: claimed condition is not in the rule: ${JSON.stringify(claim.conditionQuote)}`
      );
      continue;
    }
    const set = covered.get(claim.ruleId) ?? new Set();
    set.add(claim.conditionQuote);
    covered.set(claim.ruleId, set);
  }

  // Zero examined must never read as clean. A run that recorded nothing is a
  // broken harness, not a project with no coverage.
  if (claims.length === 0) {
    errors.push("no coverage claims were recorded at all — the sink or the suite is broken");
  }

  const coveredConditions = [...covered.values()].reduce((sum, set) => sum + set.size, 0);
  const totalConditions = rules.reduce((sum, rule) => sum + rule.conditions.length, 0);

  if (baseline !== null && baseline !== undefined) {
    if (coveredConditions < baseline.coveredConditions) {
      errors.push(
        `coverage fell: ${coveredConditions} covered, baseline is ${baseline.coveredConditions}. ` +
          "A rule stopped being checked."
      );
    }
    for (const [ruleId, count] of Object.entries(baseline.perRule ?? {})) {
      const now = covered.get(ruleId)?.size ?? 0;
      if (now < count) {
        errors.push(`${ruleId}: covered conditions fell from ${count} to ${now}`);
      }
    }
  }

  return {
    errors,
    covered,
    stats: {
      rules: rules.length,
      totalConditions,
      claimsRecorded: claims.length,
      coveredConditions,
      rulesTouched: covered.size,
      rulesFullyCovered: rules.filter(
        (rule) => rule.conditions.length > 0 && (covered.get(rule.ruleId)?.size ?? 0) === rule.conditions.length
      ).length
    }
  };
}

const STATUSES = new Set([
  "NOT_IMPLEMENTED",
  "IMPLEMENTED_UNMAPPED",
  "IMPLEMENTED_UNTESTED",
  "NOT_CODE_VERIFIABLE"
]);

// Every rule must be accounted for exactly once: either a passing test claims a
// condition, or the status file says why not. Without this, a rule can drop out
// of both and read as neither covered nor outstanding.
export function evaluateStatus(rules, covered, status, fileExists) {
  const errors = [];
  const entries = status?.rules ?? {};
  const ruleIds = new Set(rules.map((rule) => rule.ruleId));

  for (const [ruleId, entry] of Object.entries(entries)) {
    if (!ruleIds.has(ruleId)) {
      errors.push(`status file classifies a rule that does not exist: ${ruleId}`);
      continue;
    }
    if (!STATUSES.has(entry.status)) {
      errors.push(`${ruleId}: unknown status ${JSON.stringify(entry.status)}`);
    }
    if (typeof entry.detail !== "string" || entry.detail.trim().length === 0) {
      errors.push(`${ruleId}: status needs a detail saying what was checked`);
    }
    // A path nobody can open is not evidence. This is what stops the status file
    // from becoming a place to assert findings that were never made.
    if (typeof entry.evidence !== "string" || !fileExists(entry.evidence)) {
      errors.push(`${ruleId}: evidence path does not exist: ${JSON.stringify(entry.evidence)}`);
    }
    if ((covered.get(ruleId)?.size ?? 0) > 0) {
      errors.push(
        `${ruleId}: a passing test now claims this rule, so its status entry is stale and must be removed`
      );
    }
  }

  const unaccounted = rules
    .filter((rule) => (covered.get(rule.ruleId)?.size ?? 0) === 0 && entries[rule.ruleId] === undefined)
    .map((rule) => rule.ruleId);
  for (const ruleId of unaccounted) {
    errors.push(`${ruleId}: no coverage claim and no status entry saying why`);
  }

  const byStatus = {};
  for (const entry of Object.values(entries)) {
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }
  return { errors, byStatus };
}

async function readClaims() {
  let files;
  try {
    files = await readdir(COVERAGE_DIR);
  } catch {
    return [];
  }
  const claims = [];
  for (const file of files.filter((name) => name.endsWith(".jsonl"))) {
    const text = await readFile(path.join(COVERAGE_DIR, file), "utf8");
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) {
        claims.push(JSON.parse(line));
      }
    }
  }
  return claims;
}

// Only run the CLI when invoked directly, so importing this from a test does
// not read the real sink or exit the process.
if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  const updateBaseline = process.argv.includes("--update-baseline");
  const { rules } = await loadRuleIndex();
  const claims = await readClaims();

  let baseline = null;
  try {
    baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch {
    baseline = null;
  }

  const { errors, covered, stats } = evaluateCoverage(rules, claims, updateBaseline ? null : baseline);
  const percent = stats.totalConditions === 0 ? "0" : ((stats.coveredConditions / stats.totalConditions) * 100).toFixed(1);

  let status = null;
  try {
    status = JSON.parse(await readFile(STATUS_PATH, "utf8"));
  } catch {
    status = null;
  }
  const statusCheck = evaluateStatus(rules, covered, status, (p) => existsSync(path.join(REPO_ROOT, p)));
  errors.push(...statusCheck.errors);

  console.log("");
  console.log("=== FINAL RULE coverage by condition line ===");
  console.log(`  rules                  ${stats.rules}`);
  console.log(`  condition lines        ${stats.totalConditions}`);
  console.log(`  claims recorded        ${stats.claimsRecorded}`);
  console.log(`  conditions covered     ${stats.coveredConditions}  (${percent}%)`);
  console.log(`  rules touched at all   ${stats.rulesTouched} of ${stats.rules}`);
  console.log(`  rules fully covered    ${stats.rulesFullyCovered} of ${stats.rules}`);
  console.log(`  rules with no claim    ${stats.rules - stats.rulesTouched}`);
  console.log("");
  console.log("  Why the unclaimed rules are unclaimed:");
  for (const [name, count] of Object.entries(statusCheck.byStatus).sort(([a], [b]) => (a < b ? -1 : 1))) {
    console.log(`    ${name.padEnd(22)} ${count}`);
  }
  console.log("");
  console.log("  A claim means a passing test quoted that condition. It does not");
  console.log("  mean the condition is correctly implemented.");
  console.log("");

  if (updateBaseline && errors.length === 0) {
    await writeFile(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          note: "Written by npm run coverage:baseline. Coverage may not fall below this.",
          coveredConditions: stats.coveredConditions,
          totalConditions: stats.totalConditions,
          rulesTouched: stats.rulesTouched,
          perRule: Object.fromEntries(
            [...covered.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, set]) => [id, set.size])
          )
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.log(`  baseline written: ${stats.coveredConditions} covered conditions`);
  } else if (baseline === null && !updateBaseline) {
    console.log("  no baseline recorded yet; run `npm run coverage:baseline` to set one");
  }

  if (process.argv.includes("--list-uncovered")) {
    const uncovered = rules
      .map((rule) => ({ rule, missing: rule.conditions.filter((c) => !(covered.get(rule.ruleId)?.has(c) ?? false)) }))
      .filter((entry) => entry.missing.length > 0)
      .sort((a, b) => b.missing.length - a.missing.length);
    console.log(`  ${uncovered.length} rule(s) have unclaimed conditions:`);
    console.log("");
    for (const { rule, missing } of uncovered) {
      console.log(`  ${rule.ruleId}  ${missing.length}/${rule.conditions.length} unclaimed`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.error("rule coverage check failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}
