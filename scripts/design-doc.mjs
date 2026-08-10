// Shared reader for the design document. Both the rule-shape test and the
// coverage checker parse the same blocks, so the parser lives in one place: two
// parsers would eventually disagree about how many rules exist.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COVERAGE_DIR = path.join(REPO_ROOT, ".rule-coverage");
export const BASELINE_PATH = path.join(REPO_ROOT, "docs", "rule-coverage-baseline.json");

export async function readDesignDoc() {
  const raw = await readFile(path.join(REPO_ROOT, "docs", "concept-foundation.md"), "utf8");
  // The working copy carries CRLF on Windows, so every \n below would miss.
  return raw.split("\r\n").join("\n");
}

export function parseRules(doc) {
  const blocks = doc.match(/```yaml\n(ruleId: [\s\S]*?)\n```/g) ?? [];
  const rules = [];
  for (const block of blocks) {
    const body = block.replace(/^```yaml\n/, "").replace(/\n```$/, "");
    const ruleId = /^ruleId:\s*([A-Z_0-9]+)\s*$/m.exec(body)?.[1];
    if (ruleId !== undefined) {
      rules.push({ ruleId, body, conditions: parseConditions(body) });
    }
  }
  return rules;
}

// A rule's condition list is what it actually asserts. Counting coverage per
// rule would let one test on a five-condition rule read as full coverage, so
// the unit of measurement is the condition line.
function parseConditions(body) {
  const block = /\ncondition:\n((?:[ ]*-[ ].*\n)+)/.exec(body)?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => unquote(line.replace(/^\s*-\s*/, "").trim()))
    .filter((line) => line.length > 0);
}

// A condition starting with a backtick has to be quoted to stay valid YAML. The
// quotes are syntax, not part of the condition, so a claim quoting the text a
// reader sees must match.
function unquote(value) {
  const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value);
  return quoted === null ? value : quoted[1];
}

export async function loadRuleIndex() {
  const rules = parseRules(await readDesignDoc());
  const byId = new Map(rules.map((rule) => [rule.ruleId, rule]));
  return { rules, byId };
}
