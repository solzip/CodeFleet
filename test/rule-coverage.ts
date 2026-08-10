// coversRule records that a passing test checked one condition of one FINAL
// RULE.
//
// It is called from inside the test body on purpose. A comment or a table would
// record an intention; this records an execution, so a test that fails or never
// runs contributes nothing. That is the same standard the product applies to
// agents: only what was observed counts.
//
// The claim argument must quote a condition line from the rule verbatim. The
// checker rejects a quote that does not appear in the rule, which is what stops
// this from becoming a place to assert coverage that was never written.

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COVERAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".rule-coverage");

let sink: string | null = null;

export function coversRule(ruleId: string, conditionQuote: string): void {
  if (sink === null) {
    mkdirSync(COVERAGE_DIR, { recursive: true });
    // node --test runs one process per file, so each process owns its own sink
    // and no two writers share a handle.
    sink = path.join(COVERAGE_DIR, `${process.pid}.jsonl`);
  }
  appendFileSync(sink, `${JSON.stringify({ ruleId, conditionQuote })}\n`, "utf8");
}
