// S5 export seam: exposure tiers, field paths, and redaction.
//
// The tier nesting and the strictness order are both asserted from the values
// themselves rather than described, because both are properties that quietly
// stop holding when someone adds one path or one action.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CORE_TIER_ALLOWLISTS,
  EXPOSURE_TIERS,
  exportIsPermitted,
  renderSanitizedSummary,
  resolveAllowlist,
  sanitize,
  tiersNest,
  validateExportTarget,
  validateFieldPath
} from "../src/export.ts";
import { loadProfile } from "../src/profile.ts";
import {
  actionStrictness,
  applyRedaction,
  REDACTION_ACTIONS,
  strictestAction,
  validateRedactionPattern,
  validateRedactionRules,
  type RedactionRule
} from "../src/redaction.ts";
import { profileJson } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";

const TIERS = "EXPORT_FIELD_ALLOWLIST_IS_CORE_OWNED_EXPOSURE_TIER";
const PATHS = "EXPORT_FIELD_PATH_IS_EXPLICIT_LEAF_WITHOUT_WILDCARD";
const UNKNOWN_FIELD = "EXPORT_SCHEMA_UNKNOWN_FIELD_IS_DROPPED_AND_REPORTED";
const SEAM = "S5_EXPORT_SEAM_USES_SANITIZED_SUMMARY_ONLY";
const SUBSET = "REDACTION_PATTERN_IS_LINEAR_TIME_REGEX_SUBSET";
const STRICTNESS = "REDACTION_ACTION_STRICTNESS_ORDER_IS_FIXED";
const FAILURE = "REDACTION_RULE_FAILURE_BLOCKS_EXPORT";

const RUN_SUMMARY = {
  runId: "2026-08-11_001",
  runPlanId: "2026-08-11_001:plan",
  taskId: "sample",
  createdAt: "2026-08-11T00:00:00Z",
  result: { value: "DONE", derivedFrom: [".codefleet/runs/x/adapter-result.json"] },
  check: { observedCheck: "PASS", verificationGateResult: "SATISFIED", verificationGateReason: "PASS" },
  normalization: { status: "PARTIAL", unavailableReasons: ["COMMAND_CHANNEL_NOT_HARNESS_VISIBLE"] },
  policy: { computedRisk: "UNKNOWN", pathViolationSummary: { evaluated: true, hasViolation: false } },
  evidenceAuthority: { commandEvidenceAuthority: "NONE", changedFilesAuthority: "HARNESS_OBSERVED" },
  safeguards: { canProduceVerified: false, acceptanceEvidence: false },
  // Not on any tier list: this is the field the allowlist exists to stop.
  operatorNote: "ssh deploy@10.0.1.50 with key /home/someone/.ssh/id_rsa"
};

test("exposure tiers nest, are Core-owned, and a target may only narrow", () => {
  assert.equal(tiersNest(), true, "PUBLIC subset of INTERNAL_SHARED subset of LOCAL_PRIVATE");
  assert.deepEqual([...EXPOSURE_TIERS], ["PUBLIC", "INTERNAL_SHARED", "LOCAL_PRIVATE"]);

  // Nesting is a property of the values, so assert it directly too.
  for (const p of CORE_TIER_ALLOWLISTS.PUBLIC) {
    assert.ok(CORE_TIER_ALLOWLISTS.INTERNAL_SHARED.includes(p), `${p} must survive into INTERNAL_SHARED`);
  }
  for (const p of CORE_TIER_ALLOWLISTS.INTERNAL_SHARED) {
    assert.ok(CORE_TIER_ALLOWLISTS.LOCAL_PRIVATE.includes(p), `${p} must survive into LOCAL_PRIVATE`);
  }

  assert.deepEqual(validateExportTarget({ targetId: "t", tier: "PUBLIC" }, "/t"), []);
  assert.match(validateExportTarget({ targetId: "t" }, "/t")[0].detail, /exactly one exposure tier/);
  assert.match(validateExportTarget({ targetId: "t", tier: "SECRET" }, "/t")[0].detail, /exactly one exposure tier/);

  // There is no place to add a path, and the refusal says why.
  for (const key of ["addedPaths", "extraPaths", "allowlist", "fieldAllowlist"]) {
    const found = validateExportTarget({ targetId: "t", tier: "PUBLIC", [key]: ["anything"] }, "/t");
    assert.ok(found.some((f) => /Core-owned/.test(f.detail)), `${key} must be refused`);
  }

  const narrowed = resolveAllowlist({ targetId: "t", tier: "PUBLIC", removedPaths: ["taskId"] });
  assert.equal(narrowed.includes("taskId"), false);
  assert.ok(narrowed.length < CORE_TIER_ALLOWLISTS.PUBLIC.length);

  coversRule(TIERS, "every export target declares exactly one exposure tier.");
  coversRule(TIERS, "tier allowlists satisfy PUBLIC subset of INTERNAL_SHARED subset of LOCAL_PRIVATE.");
  coversRule(TIERS, "a target may remove field paths from its tier and can never add one.");
  coversRule(
    TIERS,
    "the field allowlist is Core-owned and has no Project Profile or Local Overlay representation."
  );
});

test("field paths name leaves explicitly and carry no pattern language", () => {
  for (const good of ["runId", "result.value", "result.derivedFrom[]", "normalization.unavailableReasons[]"]) {
    assert.equal(validateFieldPath(good), null, `${good} must be accepted`);
  }

  for (const bad of ["result.*", "result.**", "check.?", "inputs.{a,b}", "list[0]"]) {
    const problem = validateFieldPath(bad);
    assert.ok(problem !== null, `${bad} must be refused`);
  }

  assert.match(validateFieldPath("result.*")!.detail, /grow the allowlist whenever the schema does/);
  assert.match(validateFieldPath("")!.problem, /EMPTY/);
  assert.match(validateFieldPath("a..b")!.problem, /MALFORMED/);

  // Array elements are enumerated by naming the list, not by indexing into it.
  assert.equal(validateFieldPath("result.derivedFrom[]"), null);
  assert.ok(validateFieldPath("result.derivedFrom[0]") !== null);

  // Every Core path is itself a valid leaf path.
  for (const tier of EXPOSURE_TIERS) {
    for (const p of CORE_TIER_ALLOWLISTS[tier]) {
      assert.equal(validateFieldPath(p), null, `${p} in ${tier} must be a valid field path`);
    }
  }

  coversRule(PATHS, "field paths address leaves using field, parent.child, list[], and list[].child forms.");
  coversRule(PATHS, "field paths contain no wildcard and no pattern language.");
  coversRule(PATHS, "array element fields are enumerated individually.");
});

test("a field absent from the resolved allowlist is dropped and reported", () => {
  const result = sanitize({
    runSummary: RUN_SUMMARY,
    target: { targetId: "public-feed", tier: "PUBLIC" },
    redactionRules: []
  });

  assert.equal(result.sanitized.operatorNote, undefined, "an unlisted field must not reach the payload");
  assert.equal((result.sanitized.result as Record<string, unknown>).derivedFrom, undefined);
  assert.equal(result.sanitized.runId, "2026-08-11_001");

  const dropped = result.report.entries.filter((e) => e.matchKind === "SCHEMA_UNKNOWN_FIELD");
  assert.ok(dropped.length > 0);
  assert.ok(dropped.every((e) => e.action === "DROPPED" && e.severity === "WARNING"));
  assert.ok(dropped.some((e) => e.fieldPath === "operatorNote"));

  // Dropping an unlisted field is not by itself a reason to block.
  assert.equal(result.report.blockedExport, false);
  assert.equal(exportIsPermitted(result.report), true);

  // Nothing examined must not look like nothing found.
  assert.ok(result.report.scanScope.leavesVisited > 0);
  assert.equal(result.report.scanScope.leavesDropped, dropped.length);
  assert.equal(result.report.scanScope.allowlistSize, CORE_TIER_ALLOWLISTS.PUBLIC.length);

  coversRule(UNKNOWN_FIELD, "a present field path absent from the resolved allowlist is dropped from the payload.");
  coversRule(
    UNKNOWN_FIELD,
    "the drop is recorded in redaction-report with matchKind SCHEMA_UNKNOWN_FIELD and action DROPPED."
  );
  coversRule(UNKNOWN_FIELD, "the recorded severity is WARNING.");
  coversRule(UNKNOWN_FIELD, "blockedExport becomes true only when redaction policy requires it.");
});

test("the pattern subset excludes exactly the constructs that make matching non-linear", () => {
  for (const good of ["AKIA[0-9A-Z]{16}", "secret|token", "^ssh-rsa ", "[0-9]{1,3}(\\.[0-9]{1,3}){3}", "a+b*"]) {
    assert.equal(validateRedactionPattern(good), null, `${good} must be accepted`);
  }

  const refusals: [string, string][] = [
    ["(a)\\1", "BACKREFERENCE"],
    ["(?<name>a)\\k<name>", "BACKREFERENCE"],
    ["foo(?=bar)", "LOOKAROUND"],
    ["foo(?!bar)", "LOOKAROUND"],
    ["(?<=foo)bar", "LOOKAROUND"],
    ["(?R)", "RECURSION"],
    ["(?(1)a|b)", "CONDITIONAL"],
    ["(?>abc)", "ATOMIC_GROUP"],
    ["a++", "POSSESSIVE_QUANTIFIER"],
    ["a{2,}", "UNBOUNDED_REPETITION_RANGE"]
  ];
  for (const [pattern, problem] of refusals) {
    const found = validateRedactionPattern(pattern);
    assert.equal(found?.problem, problem, `${pattern} must be refused as ${problem}`);
  }

  // Inside the subset but malformed is a different failure with a different fix.
  assert.equal(validateRedactionPattern("[unterminated")?.problem, "DOES_NOT_COMPILE");

  // appliesTo reuses the export field path notation, and empty means everything.
  const rules: RedactionRule[] = [
    { ruleId: "SCOPED", pattern: "secret", action: "REDACTED", appliesTo: ["result.value"] }
  ];
  assert.equal(applyRedaction("result.value", "a secret here", rules).value, "[REDACTED]");
  assert.equal(applyRedaction("runId", "a secret here", rules).value, "a secret here");
  const everywhere: RedactionRule[] = [{ ruleId: "ALL", pattern: "secret", action: "REDACTED", appliesTo: [] }];
  assert.equal(applyRedaction("runId", "a secret here", everywhere).value, "[REDACTED]");

  coversRule(
    SUBSET,
    "patterns use literal text, character classes, alternation, quantifiers, bounded repetition, anchors, and grouping only."
  );
  coversRule(
    SUBSET,
    "patterns contain no backreference, lookaround, recursion, conditional, atomic group, or possessive quantifier."
  );
  coversRule(SUBSET, "repetition bounds are explicit and finite.");
  coversRule(SUBSET, "appliesTo reuses the export field path notation and applies to all sanitized content when empty.");
});

test("the strictest matched action wins, and HASHED ranks below REDACTED", () => {
  assert.deepEqual([...REDACTION_ACTIONS], ["DROPPED", "REDACTED", "HASHED", "RELATIVIZED"]);
  assert.ok(actionStrictness("DROPPED") < actionStrictness("REDACTED"));
  // A hash preserves equality across Runs, so it reveals more than a mask does.
  assert.ok(actionStrictness("REDACTED") < actionStrictness("HASHED"));
  assert.ok(actionStrictness("HASHED") < actionStrictness("RELATIVIZED"));
  assert.equal(strictestAction(["RELATIVIZED", "HASHED", "REDACTED"]), "REDACTED");
  assert.equal(strictestAction([]), null);

  const rules: RedactionRule[] = [
    { ruleId: "AS_HASH", pattern: "token", action: "HASHED" },
    { ruleId: "AS_REDACT", pattern: "token", action: "REDACTED" }
  ];
  const outcome = applyRedaction("runId", "my token", rules);
  assert.equal(outcome.value, "[REDACTED]", "the stricter of two matches is applied");
  // Both matches are recorded, so the report says what was considered.
  assert.deepEqual(outcome.entries.map((e) => e.ruleId).sort(), ["AS_HASH", "AS_REDACT"]);
  assert.ok(outcome.entries.every((e) => e.matchKind === "REDACTION_RULE_MATCH"));

  const hashed = applyRedaction("runId", "my token", [rules[0]]);
  assert.match(String(hashed.value), /^sha256:/);
  assert.equal(applyRedaction("runId", "my token", [{ ruleId: "GO", pattern: "token", action: "DROPPED" }]).value, undefined);

  coversRule(STRICTNESS, "action strictness order is DROPPED, then REDACTED, then HASHED, then RELATIVIZED.");
  coversRule(STRICTNESS, "the strictest matched action is applied to the value.");
  coversRule(STRICTNESS, "HASHED ranks below REDACTED because a hash preserves equality correlation across Runs.");
  coversRule(STRICTNESS, "every applied action is recorded per rule in redaction-report.");
});

test("an unusable redaction rule blocks the export instead of being skipped", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-export-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  const doc = profileJson({ workspaceId: "export" }) as Record<string, unknown>;
  (doc.policies as Record<string, unknown>).redaction = {
    redactionRules: [{ ruleId: "BAD", pattern: "(a)\\1", action: "REDACTED" }]
  };
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await assert.rejects(() => loadProfile(root), /REDACTION_RULE_FAILURE_BLOCKS_EXPORT/);

  assert.match(
    validateRedactionRules([{ ruleId: "BAD", pattern: "a{2,}", action: "REDACTED" }], "/r")[0].detail,
    /UNBOUNDED_REPETITION_RANGE/
  );

  // A rule that could not be used makes sanitization incomplete, and incomplete
  // sanitization blocks rather than shipping what it managed.
  const blocked = sanitize({
    runSummary: RUN_SUMMARY,
    target: { targetId: "t", tier: "PUBLIC" },
    redactionRules: [],
    ruleFailures: ["BAD"]
  });
  assert.equal(blocked.report.blockedExport, true);
  assert.deepEqual(blocked.report.blockedReasons, ["REDACTION_RULE_UNUSABLE:BAD"]);
  assert.equal(exportIsPermitted(blocked.report), false);

  coversRule(FAILURE, "a rule using unsupported syntax fails Project Profile validation.");
  coversRule(FAILURE, "a pattern that fails to compile makes sanitization incomplete.");
  coversRule(FAILURE, "incomplete sanitization sets blockedExport true.");
  coversRule(FAILURE, "an unusable rule is never skipped so that export can proceed.");
});

test("the seam consumes sanitized artifacts only", () => {
  const rules: RedactionRule[] = [{ ruleId: "IPV4", pattern: "[0-9]{1,3}(\\.[0-9]{1,3}){3}", action: "REDACTED" }];
  const result = sanitize({
    runSummary: RUN_SUMMARY,
    target: { targetId: "internal", tier: "INTERNAL_SHARED" },
    redactionRules: rules
  });

  // summary.md is built from the sanitized document, so anything the tier
  // dropped cannot reappear in the rendered form.
  const markdown = renderSanitizedSummary(result.sanitized);
  assert.equal(markdown.includes("10.0.1.50"), false);
  assert.equal(markdown.includes("id_rsa"), false);
  assert.equal(markdown.includes("operatorNote"), false);
  assert.ok(markdown.includes("runId: 2026-08-11_001"));

  // Every action is in one report, whatever produced it.
  assert.equal(result.report.documentKind, "REDACTION_REPORT");
  assert.ok(result.report.entries.length > 0);
  assert.equal(result.report.tier, "INTERNAL_SHARED");

  // Redaction runs after tier filtering: the dropped field is reported as a
  // schema drop, never as a redaction match, because it never reached redaction.
  const noteEntries = result.report.entries.filter((e) => e.fieldPath === "operatorNote");
  assert.equal(noteEntries.length, 1);
  assert.equal(noteEntries[0].matchKind, "SCHEMA_UNKNOWN_FIELD");

  coversRule(SEAM, "sanitized-run-summary.json is created from run-summary.json with forbidden content removed");
  coversRule(SEAM, "summary.md is created from sanitized-run-summary.json");
  coversRule(SEAM, "redaction-report.json records all redaction, drop, relativize, and hash actions");
  coversRule(SEAM, "export adapters consume only sanitized artifacts");
  coversRule(SEAM, "blocked redaction prevents external transmission");
  coversRule(SUBSET, "redaction runs after exposure tier filtering, never before.");
});
