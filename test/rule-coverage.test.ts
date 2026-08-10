import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCoverage } from "../scripts/check-rule-coverage.mjs";
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
