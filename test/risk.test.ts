// Risk rules.
//
// The three things worth testing are all negative: a risk rule cannot invent a
// matcher, cannot express OR or NOT, and cannot turn "nothing was determined"
// into a severity.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadProfile } from "../src/profile.ts";
import {
  blocksAutomaticProgression,
  evaluateRisk,
  MATCH_TARGETS,
  RISK_LEVELS,
  validateRiskRules,
  type RiskRule,
  type RiskSubject
} from "../src/risk.ts";
import { runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";

const MATCHERS = "RISK_RULE_REUSES_FIXED_MATCHERS";
const FLAT = "RISK_RULE_CONJUNCTION_IS_FLAT_AND_NEGATION_IS_DENIED";
const UNKNOWN = "UNKNOWN_RISK_IS_UNRESOLVED_STATE_NOT_HIGH_SEVERITY";

const SUBJECT: RiskSubject = {
  changedPaths: ["src/main/java/App.java", "infra/main.tf"],
  scopePatterns: ["src/**"],
  commands: [["terraform", "apply", "-auto-approve"], ["npm", "test"]],
  fields: { agentRole: "IAC_ENGINEER", harnessMode: "COMMAND_EXEC" },
  caseSensitivePaths: true
};

function rule(over: Partial<RiskRule> = {}): RiskRule {
  return {
    ruleId: "TOUCHES_INFRA",
    allOf: [{ matchTarget: "PATH", glob: "infra/**" }],
    riskLevel: "HIGH",
    ...over
  };
}

test("matchTarget selects an existing matcher and a condition carries only its keys", () => {
  assert.deepEqual(validateRiskRules([rule()], "/r"), []);

  // Each target borrows a matcher that already exists elsewhere.
  assert.deepEqual(
    validateRiskRules(
      [
        rule({ ruleId: "A", allOf: [{ matchTarget: "TASK_SCOPE", glob: "src/**" }] }),
        rule({ ruleId: "B", allOf: [{ matchTarget: "DIFF", glob: "infra/**" }] }),
        rule({ ruleId: "C", allOf: [{ matchTarget: "COMMAND", argv: ["terraform", "apply"], matchMode: "PREFIX" }] }),
        rule({ ruleId: "D", allOf: [{ matchTarget: "AGENT_ROLE", field: "agentRole", anyOf: ["IAC_ENGINEER"] }] })
      ],
      "/r"
    ),
    []
  );

  // The glob goes through the files policy validator, so a pattern the files
  // policy refuses is refused here with the same reason.
  const badGlob = validateRiskRules([rule({ allOf: [{ matchTarget: "PATH", glob: "src/**/*.{ts,js}" }] })], "/r");
  assert.ok(badGlob.length > 0, "a pattern outside the bounded glob subset must be refused");

  // Keys that belong to a different target are not silently ignored.
  const mixed = validateRiskRules(
    [rule({ allOf: [{ matchTarget: "PATH", glob: "infra/**", argv: ["terraform"] } as never] })],
    "/r"
  );
  assert.match(mixed[0].detail, /PATH conditions carry only glob; unexpected argv/);

  const unknownTarget = validateRiskRules([rule({ allOf: [{ matchTarget: "VIBES" } as never] })], "/r");
  assert.match(unknownTarget[0].detail, /must be one of/);

  assert.equal(MATCH_TARGETS.length, 9);

  coversRule(MATCHERS, "matchTarget selects which already-fixed matcher applies to a condition.");
  coversRule(MATCHERS, "PATH, TASK_SCOPE, and DIFF conditions use the files policy glob matcher.");
  coversRule(MATCHERS, "COMMAND conditions use the command argv matcher and its matchMode.");
  coversRule(MATCHERS, "remaining match targets use a declarative field and anyOf predicate.");
  coversRule(MATCHERS, "a condition carries only the keys its matchTarget defines.");
  coversRule(MATCHERS, "risk rules introduce no matching language of their own.");
});

test("conditions are a flat conjunction: no nesting, no negation, no OR", () => {
  for (const key of ["allOf", "oneOf", "conditions"]) {
    const found = validateRiskRules([rule({ allOf: [{ matchTarget: "PATH", glob: "a/**", [key]: [] } as never] })], "/r");
    assert.ok(found.some((f) => /do not nest/.test(f.detail)), `${key} must be refused as nesting`);
  }

  for (const key of ["not", "negate", "exclude", "unless", "noneOf"]) {
    const found = validateRiskRules([rule({ allOf: [{ matchTarget: "PATH", glob: "a/**", [key]: "x" } as never] })], "/r");
    assert.ok(found.some((f) => /negation is not expressible/.test(f.detail)), `${key} must be refused as negation`);
  }

  // Every condition must match for the rule to contribute.
  const both: RiskRule = {
    ruleId: "INFRA_AND_TERRAFORM",
    allOf: [
      { matchTarget: "PATH", glob: "infra/**" },
      { matchTarget: "COMMAND", argv: ["terraform", "apply"] }
    ],
    riskLevel: "HIGH"
  };
  assert.equal(evaluateRisk({ rules: [both], subject: SUBJECT, evidenceAvailable: true }).level, "HIGH");

  const partial: RiskRule = {
    ...both,
    allOf: [
      { matchTarget: "PATH", glob: "infra/**" },
      { matchTarget: "COMMAND", argv: ["kubectl", "delete"] }
    ]
  };
  const partialResult = evaluateRisk({ rules: [partial], subject: SUBJECT, evidenceAvailable: true });
  assert.equal(partialResult.level, "LOW", "a partly matched rule contributes nothing");
  assert.deepEqual(partialResult.matchedRuleIds, []);

  // OR is two rules, and the result is the max of what matched.
  const asOr = evaluateRisk({
    rules: [
      { ruleId: "LOW_ONE", allOf: [{ matchTarget: "PATH", glob: "src/**" }], riskLevel: "LOW" },
      { ruleId: "HIGH_ONE", allOf: [{ matchTarget: "PATH", glob: "infra/**" }], riskLevel: "HIGH" },
      { ruleId: "MEDIUM_ONE", allOf: [{ matchTarget: "PATH", glob: "infra/**" }], riskLevel: "MEDIUM" }
    ],
    subject: SUBJECT,
    evidenceAvailable: true
  });
  assert.equal(asOr.level, "HIGH", "computedRisk is the max over every match");
  assert.equal(asOr.matchedRuleIds.length, 3);

  coversRule(FLAT, "conditions inside one rule combine as a flat allOf conjunction.");
  coversRule(FLAT, "allOf entries do not nest.");
  coversRule(
    FLAT,
    "disjunction is expressed by writing separate rules, since computedRisk is the max of all matches."
  );
  coversRule(FLAT, "negation is not expressible in a risk rule.");
  coversRule(FLAT, "a rule contributes its riskLevel only when every allOf condition matched.");
});

test("UNKNOWN is off the severity axis and is never rewritten", () => {
  assert.deepEqual([...RISK_LEVELS], ["LOW", "MEDIUM", "HIGH"]);
  assert.equal((RISK_LEVELS as readonly string[]).includes("UNKNOWN"), false);

  // A rule may not assign it: it is not a severity anyone can choose.
  const assigned = validateRiskRules([rule({ riskLevel: "UNKNOWN" as never })], "/r");
  assert.match(assigned[0].detail, /UNKNOWN is not a severity a rule can assign/);

  // No rules is not "no risk": nobody determined anything.
  const noRules = evaluateRisk({ rules: [], subject: SUBJECT, evidenceAvailable: true });
  assert.equal(noRules.level, "UNKNOWN");
  assert.deepEqual(noRules.unavailableReasons, ["NO_RISK_RULES_CONFIGURED"]);

  // Degraded evidence is UNKNOWN even when a HIGH rule would have matched, and
  // it is not promoted to HIGH "to be safe" — that would make an unmeasured Run
  // read identically to a measured dangerous one.
  const degraded = evaluateRisk({ rules: [rule()], subject: SUBJECT, evidenceAvailable: false });
  assert.equal(degraded.level, "UNKNOWN");
  assert.notEqual(degraded.level, "HIGH");
  assert.notEqual(degraded.level, "MEDIUM");
  assert.ok(degraded.unavailableReasons.includes("RISK_INPUT_EVIDENCE_DEGRADED"));

  // A condition whose matcher does not exist yet is not-evaluable, not
  // not-matched.
  const fileContent = evaluateRisk({
    rules: [rule({ allOf: [{ matchTarget: "FILE_CONTENT", pattern: "AKIA[0-9A-Z]{16}" }] })],
    subject: SUBJECT,
    evidenceAvailable: true
  });
  assert.equal(fileContent.level, "UNKNOWN");
  assert.ok(fileContent.unavailableReasons.some((r) => r.startsWith("RISK_CONDITION_NOT_EVALUABLE")));

  assert.equal(blocksAutomaticProgression("UNKNOWN"), true);
  for (const level of RISK_LEVELS) {
    assert.equal(blocksAutomaticProgression(level), false, `${level} is concrete and does not block`);
  }

  // Nothing examined must not look like nothing found.
  const scanned = evaluateRisk({ rules: [rule()], subject: SUBJECT, evidenceAvailable: true });
  assert.equal(scanned.scanScope.rulesEvaluated, 1);
  assert.equal(scanned.scanScope.conditionsEvaluated, 1);
  assert.equal(scanned.scanScope.rulesMatched, 1);

  coversRule(UNKNOWN, "UNKNOWN is not a value on the LOW < MEDIUM < HIGH severity axis.");
  coversRule(UNKNOWN, "UNKNOWN means no concrete risk could be determined from available evidence.");
  coversRule(UNKNOWN, "UNKNOWN blocks every automatic progression that requires a concrete risk level.");
  coversRule(UNKNOWN, "UNKNOWN is not rewritten to HIGH and is not rewritten to MEDIUM.");
});

test("the Profile refuses a malformed risk rule, and the Run Plan records what was scanned", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-risk-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });

  const withBadRule = profileJson({ workspaceId: "risk" }) as Record<string, unknown>;
  (withBadRule.policies as Record<string, unknown>).risk = {
    riskRules: [{ ruleId: "lowercase", allOf: [{ matchTarget: "PATH", glob: "a/**" }], riskLevel: "HIGH" }]
  };
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(withBadRule, null, 2)}\n`, "utf8");
  await assert.rejects(() => loadProfile(root), /RISK_RULE_REUSES_FIXED_MATCHERS/);

  const good = profileJson({ workspaceId: "risk" }) as Record<string, unknown>;
  (good.policies as Record<string, unknown>).risk = {
    riskRules: [
      { ruleId: "SCOPED_TO_SRC", allOf: [{ matchTarget: "TASK_SCOPE", glob: "src/**" }], riskLevel: "MEDIUM" }
    ]
  };
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(good, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise risk",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, unknown>;
  const risk = plan.computedRisk as { level: string; matchedRuleIds: string[]; scanScope: Record<string, number> };

  assert.equal(risk.level, "MEDIUM", "the scope rule matched, so the level is no longer a constant");
  assert.deepEqual(risk.matchedRuleIds, ["SCOPED_TO_SRC"]);
  assert.equal(risk.scanScope.rulesEvaluated, 1);
});
