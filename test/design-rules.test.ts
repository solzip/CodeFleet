import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The design consistency checks were run by hand from throwaway scripts all
// through this work. Each run reported a number that nobody could reproduce
// afterwards, which is the same failure as a verification that leaves no
// artifact. They live here now so every run reports its measured surface.

const REQUIRED_RULE_FIELDS = [
  "sourceOfTruth",
  "inputs",
  "preconditions",
  "condition",
  "allowedEffect",
  "deniedEffect",
  "evidence"
];

const FINDING_CATEGORIES = new Set([
  "SNAPSHOT_CONSISTENCY",
  "READ_MODEL_CONSISTENCY",
  "LEDGER_INTEGRITY",
  "REFERENCE_INTEGRITY",
  "STATE_TRANSITION_INTEGRITY",
  "EXECUTION_EVIDENCE_INTEGRITY",
  "REVIEW_INTEGRITY",
  "CARRY_FORWARD_INTEGRITY",
  "POLICY_ENFORCEMENT_INTEGRITY",
  "WORKSPACE_GROUNDING"
]);

const SEVERITIES = new Set(["INFO", "WARNING", "REBUILD_REQUIRED", "CORRUPTION"]);

// Field names already known to hold different value sets. Declared in 0.13 and
// left unfixed on purpose, so the check pins the count rather than the outcome:
// a new divergence must fail even though these seven are tolerated.
const DECLARED_DIVERGENCES = [
  "authority",
  "changeKind",
  "decision",
  "mode",
  "pathKind",
  "result",
  "source",
  "status"
];

async function designDoc(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, "..", "docs", "concept-foundation.md"), "utf8");
  // The working copy carries CRLF on Windows, so every \n in the patterns below
  // would miss. Normalising here is what makes the counts platform-independent.
  return raw.split("\r\n").join("\n");
}

interface ParsedRule {
  ruleId: string;
  body: string;
}

function parseRules(doc: string): ParsedRule[] {
  const blocks = doc.match(/```yaml\n(ruleId: [\s\S]*?)\n```/g) ?? [];
  const rules: ParsedRule[] = [];
  for (const block of blocks) {
    const body = block.replace(/^```yaml\n/, "").replace(/\n```$/, "");
    const id = /^ruleId:\s*([A-Z_0-9]+)\s*$/m.exec(body)?.[1];
    if (id !== undefined) {
      rules.push({ ruleId: id, body });
    }
  }
  return rules;
}

test("every FINAL RULE carries the fields the writing standard requires", async () => {
  const rules = parseRules(await designDoc());
  console.log(`FINAL RULE blocks parsed: ${rules.length}`);

  // A parse that finds nothing would pass every assertion below in silence.
  assert.ok(rules.length >= 80, `expected at least 80 rules, parsed ${rules.length}`);

  const missing = rules
    .map((rule) => ({
      ruleId: rule.ruleId,
      absent: REQUIRED_RULE_FIELDS.filter((field) => !new RegExp(`^\\s*${field}:`, "m").test(rule.body))
    }))
    .filter((entry) => entry.absent.length > 0);

  assert.deepEqual(
    missing.map((entry) => `${entry.ruleId} missing ${entry.absent.join(", ")}`),
    []
  );
});

test("rule ids are unique and well formed, and every rule is FINAL", async () => {
  const rules = parseRules(await designDoc());
  const ids = rules.map((rule) => rule.ruleId);

  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);

  const malformed = ids.filter((id) => !/^[A-Z][A-Z0-9_]*$/.test(id));
  assert.deepEqual(malformed, []);

  const notFinal = rules
    .filter((rule) => !/^status:\s*FINAL\s*$/m.test(rule.body))
    .map((rule) => rule.ruleId);
  assert.deepEqual(notFinal, []);

  console.log(`rule ids checked: ${ids.length}`);
});

test("findings use only the fixed category and severity taxonomies", async () => {
  const rules = parseRules(await designDoc());
  const categories = new Set<string>();
  const severities = new Set<string>();

  for (const rule of rules) {
    for (const match of rule.body.matchAll(/^\s*-?\s*category:\s*([A-Z_]+)\s*$/gm)) {
      categories.add(match[1]);
    }
    for (const match of rule.body.matchAll(/^\s*-?\s*severity:\s*([A-Z_]+)\s*$/gm)) {
      severities.add(match[1]);
    }
  }

  console.log(`distinct categories ${categories.size}, severities ${severities.size}`);
  assert.ok(categories.size > 0 && severities.size > 0, "no findings were parsed at all");

  assert.deepEqual([...categories].filter((value) => !FINDING_CATEGORIES.has(value)), []);
  assert.deepEqual([...severities].filter((value) => !SEVERITIES.has(value)), []);
});

test("no new field name holds two different value sets", async () => {
  const doc = await designDoc();
  const byField = new Map<string, Set<string>>();

  for (const match of doc.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*"([A-Z_]+(?:\s*\|\s*[A-Z_]+)+)"\s*$/gm)) {
    const values = match[2]
      .split("|")
      .map((value) => value.trim())
      .sort()
      .join("|");
    const set = byField.get(match[1]) ?? new Set<string>();
    set.add(values);
    byField.set(match[1], set);
  }

  const diverging = [...byField.entries()]
    .filter(([, sets]) => sets.size > 1)
    .map(([field]) => field)
    .sort();

  console.log(`enum fields scanned ${byField.size}, diverging ${diverging.length}`);
  assert.ok(byField.size >= 40, `expected at least 40 enum fields, scanned ${byField.size}`);

  // Pinning the known set rather than the count alone, so a new divergence
  // fails even if an old one is fixed in the same change.
  assert.deepEqual(diverging, DECLARED_DIVERGENCES);
});
