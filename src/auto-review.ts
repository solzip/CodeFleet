// SYSTEM_POLICY auto-accept, and the actor gate every Review Decision passes.
//
// Eighteen conditions, all of which must hold. That is not caution for its own
// sake: an automatic ACCEPTED is CodeFleet deciding that its own evidence is
// good enough, and the one thing it must never be able to do is waive its own
// blind spot. So every gap of either kind must be absent — not waived, absent —
// and evidenceCompleteness must be COMPLETE and never WAIVED_INCOMPLETE. A human
// may stand in for something CodeFleet cannot observe; CodeFleet may not stand
// in for itself.
//
// Every failed condition is reported, not the first. One reason reads like one
// thing to fix, and an operator who fixes it and tries again learns the next
// reason instead of the shape of the problem.

export type ActorKind = "HUMAN" | "SYSTEM_POLICY";

export interface DecisionGateSnapshot {
  required: boolean;
  allowedActors: ActorKind[];
  explicit: boolean;
}

export interface AutoReviewInput {
  autoAdvanceOnDone: boolean;
  resultReview: DecisionGateSnapshot;
  normalizedResult: string;
  verificationGateResult: string;
  computedRisk: string;
  normalizationStatus: string;
  evidenceCompleteness: string;
  capabilityGaps: number;
  evidenceDefects: number;
  blockingFindings: number;
  unresolvedRequiredFields: number;
  blockingNeedsReview: number;
  reviewEvidenceBundleRef: string;
  reviewEvidenceBundleHash: string;
}

export interface AutoReviewResult {
  allowed: boolean;
  blockedReasons: string[];
  /** What a passing evaluation must write, so the caller cannot vary it. */
  decision: { actorKind: ActorKind; decision: string; decisionBasis: string };
  scanScope: { conditionsChecked: number; conditionsFailed: number };
}

const AUTO_ACCEPT_BASIS = "SYSTEM_POLICY_AUTO_ACCEPT";

export function evaluateAutoReview(input: AutoReviewInput): AutoReviewResult {
  const blocked: string[] = [];
  const check = (ok: boolean, reason: string): void => {
    if (!ok) {
      blocked.push(reason);
    }
  };

  check(input.autoAdvanceOnDone === true, "AUTO_ADVANCE_ON_DONE_NOT_ENABLED");
  check(input.resultReview.allowedActors.includes("SYSTEM_POLICY"), "SYSTEM_POLICY_NOT_IN_RESULT_REVIEW_ALLOWED_ACTORS");
  // An explicit gate is one a person said must be decided explicitly. Automating
  // it would be answering the question it exists to ask.
  check(input.resultReview.explicit === false, "RESULT_REVIEW_REQUIRES_EXPLICIT_DECISION");
  check(input.normalizedResult === "DONE", `NORMALIZED_RESULT_NOT_DONE:${input.normalizedResult}`);
  check(
    input.verificationGateResult === "SATISFIED" || input.verificationGateResult === "WAIVED_ALLOWED",
    `VERIFICATION_GATE_NOT_SATISFIED:${input.verificationGateResult}`
  );
  check(input.computedRisk === "LOW", `COMPUTED_RISK_NOT_LOW:${input.computedRisk}`);
  // Named separately from the check above because UNKNOWN is not a high risk, it
  // is an absent one, and the operator's next step differs.
  check(input.computedRisk !== "UNKNOWN", "COMPUTED_RISK_IS_UNKNOWN");
  check(input.blockingFindings === 0, `BLOCKING_FINDINGS:${input.blockingFindings}`);
  check(input.unresolvedRequiredFields === 0, `UNRESOLVED_REQUIRED_FIELDS:${input.unresolvedRequiredFields}`);
  check(input.blockingNeedsReview === 0, `BLOCKING_NEEDS_REVIEW:${input.blockingNeedsReview}`);
  check(input.normalizationStatus === "COMPLETE", `RUN_SUMMARY_NORMALIZATION_NOT_COMPLETE:${input.normalizationStatus}`);
  check(input.capabilityGaps === 0, `UNRESOLVED_CAPABILITY_GAPS:${input.capabilityGaps}`);
  check(input.evidenceDefects === 0, `UNRESOLVED_EVIDENCE_DEFECTS:${input.evidenceDefects}`);
  // WAIVED_INCOMPLETE is exactly the state a human may accept and CodeFleet may
  // not: it means someone stood in for evidence that was never collected.
  check(
    input.evidenceCompleteness === "COMPLETE",
    `EVIDENCE_COMPLETENESS_NOT_COMPLETE:${input.evidenceCompleteness}`
  );
  check(input.reviewEvidenceBundleRef.length > 0, "REVIEW_EVIDENCE_BUNDLE_REF_MISSING");
  check(input.reviewEvidenceBundleHash.length > 0, "REVIEW_EVIDENCE_BUNDLE_HASH_MISSING");

  return {
    allowed: blocked.length === 0,
    blockedReasons: blocked,
    decision: { actorKind: "SYSTEM_POLICY", decision: "ACCEPTED", decisionBasis: AUTO_ACCEPT_BASIS },
    scanScope: { conditionsChecked: 16, conditionsFailed: blocked.length }
  };
}

export interface ActorGateInput {
  actorKind: string;
  actorId: string;
  decisionBasis: string;
  resultReview: DecisionGateSnapshot;
}

export interface ActorGateResult {
  effective: boolean;
  reasons: string[];
}

/**
 * Whether a Review Decision is effective at all. actorId is audit identity and
 * never a substitute: two people with different ids and the same actorKind pass
 * or fail together, because the gate is about what kind of decider is allowed.
 */
export function actorSatisfiesResultReviewGate(input: ActorGateInput): ActorGateResult {
  const reasons: string[] = [];

  if (input.actorKind !== "HUMAN" && input.actorKind !== "SYSTEM_POLICY") {
    reasons.push(`ACTOR_KIND_UNKNOWN:${input.actorKind || "(none)"}`);
  } else if (!input.resultReview.allowedActors.includes(input.actorKind)) {
    reasons.push(
      `ACTOR_KIND_NOT_ALLOWED:${input.actorKind} (allowed: ${input.resultReview.allowedActors.join(", ") || "none"})`
    );
  }

  if (input.actorKind === "HUMAN" && input.decisionBasis !== "HUMAN_REVIEW") {
    reasons.push(`HUMAN_DECISION_BASIS_MUST_BE_HUMAN_REVIEW:${input.decisionBasis || "(none)"}`);
  }
  if (input.actorKind === "SYSTEM_POLICY") {
    // A policy decision must name the policy it acted under. An empty basis
    // would make an automated decision indistinguishable from an unattributed one.
    if (input.decisionBasis.length === 0 || input.decisionBasis === "HUMAN_REVIEW") {
      reasons.push(`SYSTEM_POLICY_DECISION_BASIS_MUST_BE_EXPLICIT_POLICY:${input.decisionBasis || "(none)"}`);
    }
  }

  return { effective: reasons.length === 0, reasons };
}

export { AUTO_ACCEPT_BASIS };
