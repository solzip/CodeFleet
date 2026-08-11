// SYSTEM_POLICY auto-accept and the actor gate.
//
// The bound is eighteen conditions and the test turns each one off in isolation,
// because a conjunction tested only in the all-true and all-false states does not
// tell you which conjunct is actually wired.

import assert from "node:assert/strict";
import test from "node:test";
import {
  actorSatisfiesResultReviewGate,
  AUTO_ACCEPT_BASIS,
  evaluateAutoReview,
  type AutoReviewInput
} from "../src/auto-review.ts";
import { coversRule } from "./rule-coverage.ts";

const BOUND = "SYSTEM_POLICY_AUTO_REVIEW_DECISION_IS_BOUNDED";
const ACTOR = "REVIEW_DECISION_ACTOR_MUST_SATISFY_RESULT_REVIEW_GATE";

/** The only input that passes. Every case below breaks exactly one field. */
const PASSING: AutoReviewInput = {
  autoAdvanceOnDone: true,
  resultReview: { required: true, allowedActors: ["HUMAN", "SYSTEM_POLICY"], explicit: false },
  normalizedResult: "DONE",
  verificationGateResult: "SATISFIED",
  computedRisk: "LOW",
  normalizationStatus: "COMPLETE",
  evidenceCompleteness: "COMPLETE",
  capabilityGaps: 0,
  evidenceDefects: 0,
  blockingFindings: 0,
  unresolvedRequiredFields: 0,
  blockingNeedsReview: 0,
  reviewEvidenceBundleRef: ".codefleet/reviews/r/evidence-bundle.json",
  reviewEvidenceBundleHash: "abc123"
};

function withOne(over: Partial<AutoReviewInput>): AutoReviewInput {
  return { ...PASSING, ...over };
}

test("the bound passes only when every condition holds", () => {
  const ok = evaluateAutoReview(PASSING);
  assert.equal(ok.allowed, true);
  assert.deepEqual(ok.blockedReasons, []);
  assert.equal(ok.scanScope.conditionsFailed, 0);
  assert.ok(ok.scanScope.conditionsChecked > 0, "the evaluation reports how many conditions it checked");

  // What a passing evaluation must write is fixed by the rule, not by the caller.
  assert.deepEqual(ok.decision, {
    actorKind: "SYSTEM_POLICY",
    decision: "ACCEPTED",
    decisionBasis: AUTO_ACCEPT_BASIS
  });

  coversRule(BOUND, "RUN_REVIEW_DECIDED.actorKind == SYSTEM_POLICY");
  coversRule(BOUND, "RUN_REVIEW_DECIDED.decision == ACCEPTED");
  coversRule(BOUND, "RUN_REVIEW_DECIDED.decisionBasis == SYSTEM_POLICY_AUTO_ACCEPT");
});

test("each condition is wired: turning one off blocks, and names that one", () => {
  const cases: [Partial<AutoReviewInput>, RegExp][] = [
    [{ autoAdvanceOnDone: false }, /AUTO_ADVANCE_ON_DONE_NOT_ENABLED/],
    [
      { resultReview: { required: true, allowedActors: ["HUMAN"], explicit: false } },
      /SYSTEM_POLICY_NOT_IN_RESULT_REVIEW_ALLOWED_ACTORS/
    ],
    [
      { resultReview: { required: true, allowedActors: ["HUMAN", "SYSTEM_POLICY"], explicit: true } },
      /RESULT_REVIEW_REQUIRES_EXPLICIT_DECISION/
    ],
    [{ normalizedResult: "FAILED" }, /NORMALIZED_RESULT_NOT_DONE:FAILED/],
    [{ verificationGateResult: "NOT_SATISFIED" }, /VERIFICATION_GATE_NOT_SATISFIED/],
    [{ computedRisk: "HIGH" }, /COMPUTED_RISK_NOT_LOW:HIGH/],
    [{ normalizationStatus: "PARTIAL" }, /RUN_SUMMARY_NORMALIZATION_NOT_COMPLETE:PARTIAL/],
    [{ evidenceCompleteness: "WAIVED_INCOMPLETE" }, /EVIDENCE_COMPLETENESS_NOT_COMPLETE:WAIVED_INCOMPLETE/],
    [{ capabilityGaps: 1 }, /UNRESOLVED_CAPABILITY_GAPS:1/],
    [{ evidenceDefects: 1 }, /UNRESOLVED_EVIDENCE_DEFECTS:1/],
    [{ blockingFindings: 2 }, /BLOCKING_FINDINGS:2/],
    [{ unresolvedRequiredFields: 1 }, /UNRESOLVED_REQUIRED_FIELDS:1/],
    [{ blockingNeedsReview: 1 }, /BLOCKING_NEEDS_REVIEW:1/],
    [{ reviewEvidenceBundleRef: "" }, /REVIEW_EVIDENCE_BUNDLE_REF_MISSING/],
    [{ reviewEvidenceBundleHash: "" }, /REVIEW_EVIDENCE_BUNDLE_HASH_MISSING/]
  ];

  for (const [over, pattern] of cases) {
    const result = evaluateAutoReview(withOne(over));
    assert.equal(result.allowed, false, `${JSON.stringify(over)} must block`);
    assert.ok(
      result.blockedReasons.some((r) => pattern.test(r)),
      `${JSON.stringify(over)} must be named: got ${result.blockedReasons.join(", ")}`
    );
  }

  // A WAIVED gate is the one relaxation the rule does allow.
  assert.equal(evaluateAutoReview(withOne({ verificationGateResult: "WAIVED_ALLOWED" })).allowed, true);

  // UNKNOWN risk is reported as its own reason as well as not-LOW, because the
  // operator's next step differs: one is a dangerous Run, the other is a
  // Run nobody measured.
  const unknown = evaluateAutoReview(withOne({ computedRisk: "UNKNOWN" }));
  assert.ok(unknown.blockedReasons.some((r) => /COMPUTED_RISK_IS_UNKNOWN/.test(r)));
  assert.ok(unknown.blockedReasons.some((r) => /COMPUTED_RISK_NOT_LOW/.test(r)));

  // Every failed condition is reported, not the first.
  const many = evaluateAutoReview(
    withOne({ autoAdvanceOnDone: false, normalizedResult: "FAILED", capabilityGaps: 3 })
  );
  assert.ok(many.blockedReasons.length >= 3, "one reason at a time hides the shape of the problem");
  assert.equal(many.scanScope.conditionsFailed, many.blockedReasons.length);

  coversRule(BOUND, "effectivePolicy.autoAdvanceOnDone == true");
  coversRule(BOUND, "SYSTEM_POLICY is in resultReview.allowedActors");
  coversRule(BOUND, "resultReview.explicit == false");
  coversRule(BOUND, "normalized Run result == DONE");
  coversRule(BOUND, "verificationGateResult is SATISFIED or WAIVED_ALLOWED");
  coversRule(BOUND, "computedRisk == LOW");
  coversRule(BOUND, "computedRisk is not unknown");
  coversRule(BOUND, "no blocking finding exists");
  coversRule(BOUND, "no unresolved required field exists");
  coversRule(BOUND, "no blocking needsReview exists");
  coversRule(BOUND, "run-summary normalization status is COMPLETE");
  coversRule(BOUND, "no CAPABILITY_GAP and no EVIDENCE_DEFECT remains unresolved");
  coversRule(BOUND, "evidenceCompleteness is COMPLETE and never WAIVED_INCOMPLETE");
  coversRule(BOUND, "reviewEvidenceBundleRef exists at decision time");
  coversRule(BOUND, "reviewEvidenceBundleHash exists at decision time");
});

test("CodeFleet cannot accept over its own blind spot", () => {
  // A human may accept a CAPABILITY_GAP by waiving it. That same state is
  // exactly what SYSTEM_POLICY may not accept, because waiving means someone
  // stood in for evidence that was never collected - and CodeFleet cannot stand
  // in for itself.
  const waived = evaluateAutoReview(
    withOne({ evidenceCompleteness: "WAIVED_INCOMPLETE", capabilityGaps: 1 })
  );
  assert.equal(waived.allowed, false);
  assert.ok(waived.blockedReasons.some((r) => /EVIDENCE_COMPLETENESS_NOT_COMPLETE/.test(r)));
  assert.ok(waived.blockedReasons.some((r) => /UNRESOLVED_CAPABILITY_GAPS/.test(r)));
});

test("the actor gate decides effectiveness, and actorId never substitutes for actorKind", () => {
  const humanOnly = { required: true, allowedActors: ["HUMAN" as const], explicit: false };
  const both = { required: true, allowedActors: ["HUMAN" as const, "SYSTEM_POLICY" as const], explicit: false };

  assert.equal(
    actorSatisfiesResultReviewGate({
      actorKind: "HUMAN",
      actorId: "reviewer",
      decisionBasis: "HUMAN_REVIEW",
      resultReview: humanOnly
    }).effective,
    true
  );

  const refused = actorSatisfiesResultReviewGate({
    actorKind: "SYSTEM_POLICY",
    actorId: "codefleet",
    decisionBasis: AUTO_ACCEPT_BASIS,
    resultReview: humanOnly
  });
  assert.equal(refused.effective, false);
  assert.match(refused.reasons.join(" "), /ACTOR_KIND_NOT_ALLOWED:SYSTEM_POLICY/);

  // Two different ids with the same kind pass or fail together: the gate is
  // about what kind of decider is allowed, and actorId is audit identity.
  for (const actorId of ["alice", "bob", "", "cto@example.com"]) {
    assert.equal(
      actorSatisfiesResultReviewGate({
        actorKind: "SYSTEM_POLICY",
        actorId,
        decisionBasis: AUTO_ACCEPT_BASIS,
        resultReview: humanOnly
      }).effective,
      false,
      `${actorId || "(empty)"} must not change the gate outcome`
    );
  }

  // Each kind must state the basis its kind uses.
  assert.match(
    actorSatisfiesResultReviewGate({
      actorKind: "HUMAN",
      actorId: "r",
      decisionBasis: AUTO_ACCEPT_BASIS,
      resultReview: both
    }).reasons.join(" "),
    /HUMAN_DECISION_BASIS_MUST_BE_HUMAN_REVIEW/
  );
  assert.match(
    actorSatisfiesResultReviewGate({
      actorKind: "SYSTEM_POLICY",
      actorId: "c",
      decisionBasis: "HUMAN_REVIEW",
      resultReview: both
    }).reasons.join(" "),
    /SYSTEM_POLICY_DECISION_BASIS_MUST_BE_EXPLICIT_POLICY/
  );
  assert.match(
    actorSatisfiesResultReviewGate({
      actorKind: "SYSTEM_POLICY",
      actorId: "c",
      decisionBasis: "",
      resultReview: both
    }).reasons.join(" "),
    /SYSTEM_POLICY_DECISION_BASIS_MUST_BE_EXPLICIT_POLICY/
  );

  assert.match(
    actorSatisfiesResultReviewGate({
      actorKind: "ROBOT",
      actorId: "r",
      decisionBasis: "x",
      resultReview: both
    }).reasons.join(" "),
    /ACTOR_KIND_UNKNOWN:ROBOT/
  );

  coversRule(ACTOR, "actorKind must be in resultReview.allowedActors for the decision to be effective");
  coversRule(ACTOR, "actorId is audit identity and does not replace actorKind gate matching");
  coversRule(ACTOR, "HUMAN decisions use decisionBasis = HUMAN_REVIEW");
  coversRule(
    ACTOR,
    "SYSTEM_POLICY decisions use decisionBasis = SYSTEM_POLICY_AUTO_ACCEPT or another explicit policy basis"
  );
  coversRule(ACTOR, "SYSTEM_POLICY may append ACCEPTED only when SYSTEM_POLICY_AUTO_REVIEW_DECISION_IS_BOUNDED passes");
});
