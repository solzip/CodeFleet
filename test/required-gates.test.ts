// requiredGates: schema, concreteness, and per-dimension merge.
//
// The three dimensions are never collapsed. Most of these tests break exactly
// one field of one gate, because a validator that reports "requiredGates is
// invalid" for any of sixteen different reasons tells the reader nothing.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadProfile } from "../src/profile.ts";
import {
  CORE_REQUIRED_GATES,
  mergeRequiredGates,
  validateRequiredGates,
  type RequiredGates
} from "../src/required-gates.ts";
import { runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";

const PROFILE_SCHEMA = "PROFILE_DEFAULTS_REQUIRED_GATES_SCHEMA";
const CONCRETE = "TASK_REVISION_REQUIRED_GATES_ARE_CONCRETE";
const MERGE = "EFFECTIVE_REQUIRED_GATES_MERGE_BY_DIMENSION";

const CONCRETE_GATES: RequiredGates = {
  runApproval: { required: false, allowedActors: [], explicit: false },
  resultReview: { required: true, allowedActors: ["HUMAN"], explicit: false },
  verification: { required: true, waiver: { allowed: false, allowedActors: [], explicit: true } }
};

function gates(mutate: (g: Record<string, unknown>) => void): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(CONCRETE_GATES)) as Record<string, unknown>;
  mutate(copy);
  return copy;
}

function profileFindings(value: unknown): string[] {
  return validateRequiredGates(value, { allowRequireExplicit: true, pointer: "/g" }).map((f) => f.detail);
}

function revisionFindings(value: unknown): string[] {
  return validateRequiredGates(value, { allowRequireExplicit: false, pointer: "/g" }).map((f) => f.detail);
}

test("a gate set has exactly the three dimensions and each matches its schema", () => {
  assert.deepEqual(profileFindings(CONCRETE_GATES), []);

  assert.match(profileFindings(gates((g) => delete g.verification))[0], /missing verification/);
  assert.match(profileFindings(gates((g) => (g.resultReview2 = {})))[0], /unexpected resultReview2/);
  assert.match(profileFindings(gates((g) => (g.runApproval = [])))[0], /DecisionGate object/);
  assert.match(profileFindings(gates((g) => (g.verification = "yes")))[0], /EvidenceGate object/);

  coversRule(PROFILE_SCHEMA, "requiredGates has exactly runApproval, resultReview, verification keys");
  coversRule(PROFILE_SCHEMA, "runApproval matches DecisionGate schema");
  coversRule(PROFILE_SCHEMA, "resultReview matches DecisionGate schema");
  coversRule(PROFILE_SCHEMA, "verification matches EvidenceGate schema");
  coversRule(CONCRETE, "Task Revision.requiredGates has runApproval, resultReview, verification keys");
  coversRule(CONCRETE, "runApproval matches concrete DecisionGate schema");
  coversRule(CONCRETE, "resultReview matches concrete DecisionGate schema");
  coversRule(CONCRETE, "verification matches concrete EvidenceGate schema");
});

test("REQUIRE_EXPLICIT is a Profile deferral and never a Task Revision value", () => {
  const deferred = gates((g) => {
    (g.runApproval as Record<string, unknown>).required = "REQUIRE_EXPLICIT";
    (g.resultReview as Record<string, unknown>).explicit = "REQUIRE_EXPLICIT";
    (g.verification as Record<string, unknown>).required = "REQUIRE_EXPLICIT";
    ((g.verification as Record<string, unknown>).waiver as Record<string, unknown>).explicit = "REQUIRE_EXPLICIT";
  });

  assert.deepEqual(profileFindings(deferred), [], "a Profile default may defer every deferrable field");

  const refused = revisionFindings(deferred);
  assert.equal(refused.length, 4, "every deferral must be named, not just the first");
  assert.ok(refused.every((d) => /deferral, and a Task Revision must be concrete/.test(d)));

  coversRule(PROFILE_SCHEMA, "DecisionGate.required is true, false, or REQUIRE_EXPLICIT");
  coversRule(PROFILE_SCHEMA, "DecisionGate.explicit is true, false, or REQUIRE_EXPLICIT");
  coversRule(PROFILE_SCHEMA, "EvidenceGate.required is true, false, or REQUIRE_EXPLICIT");
  coversRule(PROFILE_SCHEMA, "EvidenceGate.waiver.explicit is true, false, or REQUIRE_EXPLICIT");
  coversRule(CONCRETE, "Task Revision.requiredGates contains no REQUIRE_EXPLICIT value anywhere");
  coversRule(CONCRETE, "DecisionGate.required is true or false");
  coversRule(CONCRETE, "DecisionGate.explicit is true or false");
  coversRule(CONCRETE, "EvidenceGate.required is true or false");
  coversRule(CONCRETE, "EvidenceGate.waiver.explicit is true or false");
});

test("actor lists hold only HUMAN or SYSTEM_POLICY, once each", () => {
  assert.match(
    profileFindings(gates((g) => ((g.resultReview as Record<string, unknown>).allowedActors = ["ROBOT"])))[0],
    /not HUMAN or SYSTEM_POLICY/
  );
  assert.match(
    profileFindings(gates((g) => ((g.resultReview as Record<string, unknown>).allowedActors = ["HUMAN", "HUMAN"])))[0],
    /listed more than once/
  );
  assert.match(
    profileFindings(
      gates((g) => (((g.verification as Record<string, unknown>).waiver as Record<string, unknown>).allowedActors = ["nobody"]))
    )[0],
    /not HUMAN or SYSTEM_POLICY/
  );

  coversRule(
    PROFILE_SCHEMA,
    "DecisionGate.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY"
  );
  coversRule(
    PROFILE_SCHEMA,
    "EvidenceGate.waiver.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY"
  );
  coversRule(
    CONCRETE,
    "DecisionGate.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY"
  );
  coversRule(
    CONCRETE,
    "EvidenceGate.waiver.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY"
  );
});

test("a gate that nobody can satisfy, and a gate carrying actors it never uses, both fail", () => {
  // required=true with no actor is a gate no decision can ever close.
  assert.match(
    profileFindings(gates((g) => ((g.resultReview as Record<string, unknown>).allowedActors = [])))[0],
    /required=true needs at least one allowedActor/
  );
  assert.match(
    profileFindings(
      gates((g) => {
        const w = (g.verification as Record<string, unknown>).waiver as Record<string, unknown>;
        w.allowed = true;
        w.allowedActors = [];
      })
    )[0],
    /needs at least one waiver.allowedActor/
  );

  // required=false carrying actors says more than the policy does.
  assert.match(
    profileFindings(gates((g) => ((g.runApproval as Record<string, unknown>).allowedActors = ["HUMAN"])))[0],
    /required=false must carry allowedActors=\[\] and explicit=false/
  );

  assert.match(
    profileFindings(
      gates((g) => (((g.verification as Record<string, unknown>).waiver as Record<string, unknown>).allowed = "REQUIRE_EXPLICIT"))
    )[0],
    /must be true or false/
  );

  for (const rule of [PROFILE_SCHEMA, CONCRETE]) {
    coversRule(rule, "a DecisionGate with required=false has allowedActors=[] and explicit=false");
    coversRule(rule, "a DecisionGate with required=true has at least one allowedActor");
    coversRule(rule, "an EvidenceGate waiver with allowed=true has at least one waiver.allowedActor");
    coversRule(rule, "EvidenceGate.waiver.allowed is true or false");
  }
});

test("scalar gate labels are refused wherever they appear", () => {
  for (const label of ["NONE", "HUMAN_REVIEW", "EXPLICIT_APPROVAL", "REQUIRED"]) {
    const detail = profileFindings(gates((g) => ((g.resultReview as Record<string, unknown>).required = label)))[0];
    assert.match(detail, /scalar gate label/, `${label} must be named as a scalar label`);
  }

  const blocked = profileFindings(gates((g) => ((g.runApproval as Record<string, unknown>).explicit = "BLOCKED_UNTIL_POLICY")))[0];
  assert.match(blocked, /scalar gate label/);

  coversRule(
    PROFILE_SCHEMA,
    "scalar gate labels such as NONE, HUMAN_REVIEW, EXPLICIT_APPROVAL, REQUIRED are not accepted as final schema values"
  );
  coversRule(PROFILE_SCHEMA, "BLOCKED_UNTIL_POLICY is not accepted as a defaults.task.requiredGates value");
  coversRule(
    CONCRETE,
    "scalar gate labels such as NONE, HUMAN_REVIEW, EXPLICIT_APPROVAL, REQUIRED are not accepted"
  );
});

test("a Revision stores gate requirements, not the decision that satisfies them", () => {
  // approvedBy / decidedAt belong to the ledger event, not the contract.
  for (const key of ["approvedBy", "decidedAt", "reviewDecisionId"]) {
    const detail = revisionFindings(gates((g) => (g[key] = "x")))[0];
    assert.match(detail, new RegExp(`unexpected ${key}`), `${key} must not live in requiredGates`);
  }

  coversRule(
    CONCRETE,
    "Task Revision stores gate requirements, not the approval or review decision event that satisfies them"
  );
});

test("the Profile refuses a malformed defaults.task.requiredGates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-gates-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  const doc = profileJson() as Record<string, unknown>;
  ((doc.defaults as Record<string, unknown>).task as Record<string, unknown>).requiredGates = gates((g) => {
    (g.resultReview as Record<string, unknown>).allowedActors = ["ROBOT"];
  });
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  await assert.rejects(() => loadProfile(root), /PROFILE_DEFAULTS_REQUIRED_GATES_SCHEMA/);
});

test("merging is per dimension and only ever narrows", () => {
  const permissive: Partial<RequiredGates> = {
    runApproval: { required: false, allowedActors: [], explicit: false },
    resultReview: { required: false, allowedActors: [], explicit: false },
    verification: { required: false, waiver: { allowed: true, allowedActors: ["HUMAN"], explicit: false } }
  };
  const strict: Partial<RequiredGates> = {
    runApproval: { required: true, allowedActors: ["HUMAN", "SYSTEM_POLICY"], explicit: true },
    resultReview: { required: true, allowedActors: ["HUMAN"], explicit: false },
    verification: { required: true, waiver: { allowed: false, allowedActors: [], explicit: true } }
  };

  const merged = mergeRequiredGates(
    [
      { label: "PERMISSIVE", gates: permissive },
      { label: "STRICT", gates: strict }
    ],
    "LOW"
  ).gates;

  // required and explicit OR: one source asking for a gate is enough.
  assert.equal(merged.runApproval.required, true);
  assert.equal(merged.runApproval.explicit, true);
  assert.equal(merged.resultReview.required, true);
  assert.equal(merged.verification.required, true);
  // waiver.allowed ANDs: one source withholding it withholds it.
  assert.equal(merged.verification.waiver.allowed, false);
  assert.equal(merged.verification.waiver.explicit, true);

  // Order must not matter; a permissive source cannot overwrite a strict one.
  const reversed = mergeRequiredGates(
    [
      { label: "STRICT", gates: strict },
      { label: "PERMISSIVE", gates: permissive }
    ],
    "LOW"
  ).gates;
  assert.deepEqual(reversed, merged, "no dimension may be overwritten by a less restrictive gate object");

  // Actors intersect across the sources that require the gate.
  const narrowed = mergeRequiredGates(
    [
      { label: "A", gates: { runApproval: { required: true, allowedActors: ["HUMAN", "SYSTEM_POLICY"], explicit: false } } },
      { label: "B", gates: { runApproval: { required: true, allowedActors: ["HUMAN"], explicit: false } } }
    ],
    "LOW"
  ).gates;
  assert.deepEqual(narrowed.runApproval.allowedActors, ["HUMAN"]);

  // An empty intersection is a gate nobody can close, and blocks rather than
  // silently producing one.
  const disjoint = mergeRequiredGates(
    [
      { label: "A", gates: { runApproval: { required: true, allowedActors: ["HUMAN"], explicit: false } } },
      { label: "B", gates: { runApproval: { required: true, allowedActors: ["SYSTEM_POLICY"], explicit: false } } }
    ],
    "LOW"
  );
  assert.match(disjoint.blockedReasons.join("\n"), /allowedActors intersection across sources is empty/);

  const waiverDisjoint = mergeRequiredGates(
    [
      {
        label: "A",
        gates: { verification: { required: true, waiver: { allowed: true, allowedActors: ["HUMAN"], explicit: false } } }
      },
      {
        label: "B",
        gates: {
          verification: { required: true, waiver: { allowed: true, allowedActors: ["SYSTEM_POLICY"], explicit: false } }
        }
      }
    ],
    "LOW"
  );
  assert.match(waiverDisjoint.blockedReasons.join("\n"), /waiver.allowedActors intersection is empty/);

  coversRule(MERGE, "effectivePolicy.requiredGates.runApproval.required is OR(candidate required)");
  coversRule(MERGE, "effectivePolicy.requiredGates.resultReview.required is OR(candidate required)");
  coversRule(MERGE, "effectivePolicy.requiredGates.runApproval.explicit is OR(candidate explicit)");
  coversRule(MERGE, "effectivePolicy.requiredGates.resultReview.explicit is OR(candidate explicit)");
  coversRule(MERGE, "effectivePolicy.requiredGates.verification.required is OR(candidate required)");
  coversRule(MERGE, "effectivePolicy.requiredGates.verification.waiver.allowed is AND(candidate waiver.allowed)");
  coversRule(MERGE, "effectivePolicy.requiredGates.verification.waiver.explicit is OR(candidate waiver.explicit)");
  coversRule(MERGE, "required DecisionGate allowedActors are intersected across required sources");
  coversRule(MERGE, "if a merged DecisionGate has required=true, its allowedActors intersection is non-empty");
  coversRule(MERGE, "waiver.allowedActors are intersected across sources that allow waiver");
  coversRule(MERGE, "if merged waiver.allowed=true, its waiver.allowedActors intersection is non-empty");
  coversRule(MERGE, "no dimension is overwritten by a less restrictive gate object");
});

test("risk that is not LOW forces a review gate, and a deferral blocks the merge", () => {
  const noReview: Partial<RequiredGates> = {
    resultReview: { required: false, allowedActors: [], explicit: false }
  };

  for (const risk of ["MEDIUM", "HIGH", "UNKNOWN"]) {
    const merged = mergeRequiredGates([{ label: "T", gates: noReview }], risk).gates;
    assert.equal(merged.resultReview.required, true, `${risk} must force resultReview`);
    assert.ok(merged.resultReview.allowedActors.length > 0, "a forced gate still needs someone who can close it");
  }
  assert.equal(mergeRequiredGates([{ label: "T", gates: noReview }], "LOW").gates.resultReview.required, false);

  // A deferral that survived into the merge blocks, and no REQUIRE_EXPLICIT
  // reaches the result.
  const deferred = mergeRequiredGates(
    [
      {
        label: "T",
        gates: {
          runApproval: { required: "REQUIRE_EXPLICIT", allowedActors: [], explicit: false },
          verification: { required: true, waiver: { allowed: false, allowedActors: [], explicit: "REQUIRE_EXPLICIT" } }
        }
      }
    ],
    "LOW"
  );
  assert.equal(deferred.blockedReasons.length, 2);
  assert.match(deferred.blockedReasons.join("\n"), /runApproval.required is still REQUIRE_EXPLICIT/);
  assert.match(deferred.blockedReasons.join("\n"), /waiver.explicit is still REQUIRE_EXPLICIT/);
  assert.equal(JSON.stringify(deferred.gates).includes("REQUIRE_EXPLICIT"), false);

  coversRule(MERGE, "no REQUIRE_EXPLICIT value reaches effectivePolicy.requiredGates");
  coversRule(MERGE, "unresolved required / explicit fields block Run Planning before merge completion");
  coversRule(
    MERGE,
    "if computedRisk is MEDIUM, HIGH, or unknown, effectivePolicy.requiredGates.resultReview.required is true"
  );
});

test("the Run Plan records merged gates, and a deferred Task Revision refuses to plan", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-gates-run-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify(profileJson({ workspaceId: "gates" }), null, 2)}\n`,
    "utf8"
  );

  const yaml = (extra: string): string =>
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise gate merge",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
      "status: READY",
      extra,
      ""
    ].join("\n");

  await writeFile(path.join(root, ".codefleet", "tasks", "sample.yaml"), yaml(""), "utf8");
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, unknown>;
  const effective = plan.effectivePolicy as Record<string, unknown>;
  const merged = effective.requiredGates as RequiredGates;

  // Core alone: review required with an actor that can close it, and no
  // deferral anywhere.
  assert.equal(merged.resultReview.required, true);
  assert.deepEqual(merged.resultReview.allowedActors, CORE_REQUIRED_GATES.resultReview.allowedActors);
  assert.equal(JSON.stringify(merged).includes("REQUIRE_EXPLICIT"), false);
  assert.ok((effective.gateMergeScanScope as { sourcesMerged: number }).sourcesMerged >= 1);
});
