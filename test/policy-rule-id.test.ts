// Policy rule ids and corrective-event routing.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  appendCorrectiveEvent,
  attachTask,
  createObjective,
  importLocalReview,
  ledgerPath,
  repairRoutingFor,
  type ReplayFailureClass
} from "../src/ledger.ts";
import { CORE_POLICY_RULE_IDS, originOf, validatePolicyRuleIds } from "../src/policy-rule-id.ts";
import { loadProfile } from "../src/profile.ts";
import { profileJson } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";
import { seedApprovedRevision } from "./task-ledger-fixture.ts";

const IDS = "POLICY_RULE_ID_IS_UNIQUE_WITH_REF_RECORDED_ORIGIN";
const CORRECTIVE = "CORRECTIVE_EVENT_REQUIRES_VALID_LEDGER_AND_WRONG_DECISION";

const DESIGN = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "concept-foundation.md"
);

test("the Core id space in code matches the design, id for id", async () => {
  const doc = await readFile(DESIGN, "utf8");
  const fromDesign = [
    ...new Set(
      [...doc.matchAll(/^ruleId:\s*(\S+)/gm)]
        .map((m) => m[1])
        .filter((id) => /^[A-Z][A-Z0-9_]*$/.test(id))
    )
  ].sort();

  // Not a count comparison. A list that drifted by one added and one removed id
  // would keep the same length.
  assert.deepEqual(
    [...CORE_POLICY_RULE_IDS].sort(),
    fromDesign,
    "CORE_POLICY_RULE_IDS must name exactly the design's rule ids"
  );
  assert.equal(new Set(CORE_POLICY_RULE_IDS).size, CORE_POLICY_RULE_IDS.length, "no duplicates");
});

test("an id is well formed and unique across the whole shared space", () => {
  assert.deepEqual(
    validatePolicyRuleIds([{ rules: [{ ruleId: "TOUCHES_INFRA" }], pointer: "/r" }]),
    []
  );

  for (const bad of ["lowercase", "Mixed_Case", "9LEADING", "HAS-DASH", "", 42]) {
    const found = validatePolicyRuleIds([{ rules: [{ ruleId: bad }], pointer: "/r" }]);
    assert.match(found[0].detail, /\[A-Z\]\[A-Z0-9_\]\*/, `${String(bad)} must be refused`);
  }

  // Core ids are reserved. Reusing one would make the same id resolve to two
  // different rules depending on where the reader looked.
  const collision = validatePolicyRuleIds([
    { rules: [{ ruleId: "PROFILE_TOP_LEVEL_KEYS_FIXED" }], pointer: "/policies/risk/riskRules" }
  ]);
  assert.match(collision[0].detail, /is a Core rule id/);

  // Uniqueness spans groups, not just one list.
  const across = validatePolicyRuleIds([
    { rules: [{ ruleId: "SHARED" }], pointer: "/policies/risk/riskRules" },
    { rules: [{ ruleId: "SHARED" }], pointer: "/policies/redaction/redactionRules" }
  ]);
  assert.match(across[0].detail, /already declared at \/policies\/risk\/riskRules\/0/);

  coversRule(IDS, "policy rule ids match [A-Z][A-Z0-9_]* .");
  coversRule(
    IDS,
    "an id is unique across its whole id space, including Core and Project Profile definitions together."
  );
});

test("origin is read from definedByRef and never inferred from the id", () => {
  const ref = { path: "docs/policies/infra.yaml", hash: "abc123" };

  // Two ids with nothing in common, and one with a prefix that looks like it
  // says where it came from. All three resolve origin the same way: by reading
  // definedByRef, which is why promoting a rule never has to rename it.
  for (const ruleId of ["TOUCHES_INFRA", "PROFILE_TOUCHES_INFRA", "CORE_TOUCHES_INFRA"]) {
    assert.deepEqual(originOf({ ruleId, definedByRef: ref }), ref);
  }
  assert.equal(originOf({ ruleId: "PROFILE_ANYTHING" }), null, "a prefix is not an origin");

  for (const bad of [{ path: "", hash: "h" }, { path: "p", hash: "" }, null]) {
    const found = validatePolicyRuleIds([{ rules: [{ ruleId: "OK", definedByRef: bad }], pointer: "/r" }]);
    assert.match(found[0].detail, /path and hash/, `${JSON.stringify(bad)} must be refused`);
  }

  coversRule(IDS, "origin is recorded in definedByRef with path and hash, never encoded as an id prefix.");
  coversRule(IDS, "evidence recording a ruleId also records its definedByRef.");
  coversRule(IDS, "an id is never reused for a different meaning, and a retired id is not reassigned.");
});

test("the Profile refuses a rule id that collides with Core", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-ruleid-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  const doc = profileJson({ workspaceId: "ids" }) as Record<string, unknown>;
  (doc.policies as Record<string, unknown>).risk = {
    riskRules: [
      { ruleId: "RISK_RULE_REUSES_FIXED_MATCHERS", allOf: [{ matchTarget: "PATH", glob: "a/**" }], riskLevel: "HIGH" }
    ]
  };
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await assert.rejects(() => loadProfile(root), /POLICY_RULE_ID_IS_UNIQUE_WITH_REF_RECORDED_ORIGIN/);
});

test("each failure class routes to one repair, and only one permits a corrective event", () => {
  const routes: [ReplayFailureClass, string[], string | null][] = [
    ["READ_MODEL_DRIFT", ["REBUILD_SNAPSHOT"], "REBUILD_SNAPSHOT"],
    ["REFERENCE_FAILURE", ["SOURCE_RESTORE", "CORRECTIVE_EVENT"], "SOURCE_RESTORE"],
    ["POLICY_EVALUATION_FAILURE", ["POLICY_SOURCE_REPAIR"], "POLICY_SOURCE_REPAIR"],
    ["LEDGER_STRUCTURAL_FAILURE", [], null]
  ];

  for (const [failureClass, allowed, preferred] of routes) {
    const routing = repairRoutingFor(failureClass);
    assert.deepEqual(routing.allowed, allowed, `${failureClass} allows exactly ${allowed.join(", ") || "nothing"}`);
    assert.equal(routing.preferred, preferred);
    assert.ok(routing.detail.length > 0, "a routing says why, not just what");
  }

  // Drift is a derivation problem. Appending a decision to fix it would write a
  // decision nobody made in order to paper over a read model.
  assert.equal(repairRoutingFor("READ_MODEL_DRIFT").allowed.includes("CORRECTIVE_EVENT"), false);
  // Nothing derived from a broken ledger can be trusted, including the judgement
  // that a corrective event is the right repair.
  assert.deepEqual(repairRoutingFor("LEDGER_STRUCTURAL_FAILURE").allowed, []);

  coversRule(CORRECTIVE, "READ_MODEL_DRIFT is repaired by rebuild only.");
  coversRule(
    CORRECTIVE,
    "REFERENCE_FAILURE prefers source restore and allows a corrective event only when the event decision itself is wrong."
  );
  coversRule(CORRECTIVE, "POLICY_EVALUATION_FAILURE is repaired by policy source restore or explicit policy update.");
  coversRule(
    CORRECTIVE,
    "LEDGER_STRUCTURAL_FAILURE allows neither rebuild nor corrective event until the source is repaired."
  );
});

test("a corrective event is refused by class, and refused when it supersedes nothing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-corrective-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "corrective" }), null, 2)}\n`,
    "utf8"
  );

  await createObjective(root, {
    objectiveId: "auth",
    title: "Auth",
    kind: "SEQUENCE",
    actorId: "tester",
    reason: "created"
  });
  // A relation names a revision the Task ledger holds; this test is about
  // review policy, not approval, so the ledger is seeded directly.
  await seedApprovedRevision(root, "login", 1, "hash-login-1");
  await attachTask(root, {
    objectiveId: "auth",
    taskId: "login",
    taskRevision: 1,
    taskRevisionHash: "hash-login-1",
    actorId: "tester",
    reason: "attached"
  });
  await importLocalReview(root, {
    objectiveId: "auth",
    runId: "run-1",
    localReview: {
      documentKind: "LOCAL_REVIEW_DECISION",
      finalDecisionTruth: false,
      reviewDecisionId: "run-1-review-001",
      runId: "run-1",
      taskId: "login",
      taskRevision: 1,
      decision: "ACCEPTED",
      actorKind: "HUMAN",
      actorId: "reviewer",
      decisionBasis: "HUMAN_REVIEW",
      observedResultSnapshot: "DONE",
      observedCheckSnapshot: "PASS",
      verificationGateResult: "SATISFIED",
      reviewEvidenceBundleRef: { path: ".codefleet/reviews/x/evidence-bundle.json", contentHash: "bundle-1" },
      evidenceCompleteness: "COMPLETE",
      waivedCapabilityGaps: [],
      localReviewStatus: "MIGRATION_READY"
    },
    localReviewRef: { path: ".codefleet/runs/run-1/review-decision.local.json", hash: "local-1" },
    reason: "imported",
    actorId: "tester"
  });

  for (const failureClass of ["READ_MODEL_DRIFT", "POLICY_EVALUATION_FAILURE", "LEDGER_STRUCTURAL_FAILURE"] as const) {
    const refused = await appendCorrectiveEvent(root, {
      objectiveId: "auth",
      failureClass,
      supersedesReviewDecisionId: "run-1-review-001",
      reason: "wrong decision",
      actorId: "tester"
    });
    assert.equal(refused.failedPhase, "M2_PRECHECK", `${failureClass} must not permit a corrective event`);
    assert.match(refused.failureMessage, /does not permit a corrective event/);
  }

  // A correction supersedes a decision that was made. Superseding nothing would
  // append a rejection of something no reader can find.
  const dangling = await appendCorrectiveEvent(root, {
    objectiveId: "auth",
    failureClass: "REFERENCE_FAILURE",
    supersedesReviewDecisionId: "never-existed",
    reason: "wrong decision",
    actorId: "tester"
  });
  assert.equal(dangling.failedPhase, "M2_PRECHECK");
  assert.match(dangling.failureMessage, /is not in the ledger/);

  const applied = await appendCorrectiveEvent(root, {
    objectiveId: "auth",
    failureClass: "REFERENCE_FAILURE",
    supersedesReviewDecisionId: "run-1-review-001",
    reason: "the recorded decision was wrong",
    actorId: "tester"
  });
  assert.equal(applied.failedPhase, null, applied.failureMessage);

  // The original event is still there: the ledger is append-only, so a
  // correction adds a decision rather than editing one.
  const lines = (await readFile(ledgerPath(root, "auth"), "utf8")).trim().split("\n");
  const decisions = lines
    .map((l) => JSON.parse(l) as { type: string; payload: Record<string, unknown> })
    .filter((e) => e.type === "RUN_REVIEW_DECIDED");
  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].payload.decision, "ACCEPTED");
  assert.equal(decisions[1].payload.supersedesReviewDecisionId, "run-1-review-001");
  assert.equal(decisions[1].payload.correctsFailureClass, "REFERENCE_FAILURE");
});
