import assert from "node:assert/strict";
import test from "node:test";
import {
  collectDeclarations,
  compareFacts,
  countIndexRows,
  countNumericClaims,
  parseRegister,
  parseTestSummary,
  report,
} from "../scripts/check-doc-facts.mjs";

// This checker exists because prose was where the false statements lived, and
// two reviews found them by reading rather than by running anything. If it can
// be fooled, the numbers it blesses are decoration. So: every way it could be
// fooled, pinned.

test("a declared value that does not match the measurement fails", () => {
  const decls = collectDeclarations("we registered 77 findings <!-- fact: registered-findings = 77 -->", "R.md");
  const { errors } = compareFacts(decls, { "registered-findings": 78 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /R\.md:1: registered-findings declared 77, measured 78/);
});

test("a declared value that matches passes", () => {
  const decls = collectDeclarations("<!-- fact: registered-findings = 77 -->", "R.md");
  assert.deepEqual(compareFacts(decls, { "registered-findings": 77 }).errors, []);
});

test("a fact name nothing measures fails rather than being ignored", () => {
  // A typo that silently checks nothing is worse than no check: the document
  // looks defended and is not.
  const decls = collectDeclarations("<!-- fact: registerd-findings = 77 -->", "R.md");
  const { errors } = compareFacts(decls, { "registered-findings": 77 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /nothing measures a fact named "registerd-findings"/);
});

test("examining no declarations is a failure, not a pass", () => {
  const { errors } = compareFacts([], { "registered-findings": 77 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /examined nothing/);
});

test("a measurable fact nobody declares is named, not hidden", () => {
  // Not an error -- an undeclared number is simply one this check cannot
  // defend. Saying which ones is the difference between "everything matches"
  // and "everything I was pointed at matches".
  const decls = collectDeclarations("<!-- fact: a = 1 -->", "R.md");
  const { errors, undeclared } = compareFacts(decls, { a: 1, b: 2, c: 3 });
  assert.deepEqual(errors, []);
  assert.deepEqual(undeclared, ["b", "c"]);
});

test("a declaration quoted in a code fence is not a declaration", () => {
  // The documentation for this checker shows the syntax. The first run read its
  // own example as a claim and failed on a fact called "name" -- the same
  // mistake the link checker made with a diff block, repeated within the hour.
  const text = "```markdown\n- text <!-- fact: name = value -->\n```\n";
  assert.deepEqual(collectDeclarations(text, "doc.md"), []);
});

test("a declaration quoted in an inline code span is not a declaration", () => {
  const text = "write it as `<!-- fact: name = value -->` next to the sentence";
  assert.deepEqual(collectDeclarations(text, "doc.md"), []);
});

test("stripping quotations does not shift the reported line number", () => {
  // A line number that points at the wrong line sends the reader hunting, which
  // is most of the value of reporting one at all.
  const text = "```\nquoted\n```\nreal <!-- fact: x = 5 -->";
  assert.deepEqual(collectDeclarations(text, "doc.md"), [
    { file: "doc.md", line: 4, name: "x", value: "5" },
  ]);
});

test("a declaration records the file and line it was found on", () => {
  const decls = collectDeclarations("one\ntwo <!-- fact: x = 5 -->\nthree", "docs/A.md");
  assert.deepEqual(decls, [{ file: "docs/A.md", line: 2, name: "x", value: "5" }]);
});

test("several declarations on one line are all collected", () => {
  // They are appended to the end of an existing sentence so the rendered page
  // is unchanged, which means one line routinely carries seven of them.
  const decls = collectDeclarations("text <!-- fact: a = 1 --> <!-- fact: b = 2 -->", "R.md");
  assert.deepEqual(decls.map((d) => d.name), ["a", "b"]);
});

test("a non-integer measurement is compared as written", () => {
  // The coverage percentage is "63.3", not 63.3 -- comparing as numbers would
  // let 63.30 and 63.3 disagree, and comparing loosely would let 63 pass.
  const decls = collectDeclarations("<!-- fact: coverage-percent = 63.3 -->", "R.md");
  assert.deepEqual(compareFacts(decls, { "coverage-percent": "63.3" }).errors, []);
  assert.equal(compareFacts(decls, { "coverage-percent": "63.4" }).errors.length, 1);
});

const ROW = (id: string, status: string) => `| ${id} | summary | P1 | ${status} | \`a.md\` | \`b.md\` |`;

test("a status that contains another status is not counted as that other one", () => {
  // The trap: "부분해소" contains "해소", and "미해소(수용)" contains "미해소".
  // Matching the short label first still sums to the right total and puts the
  // findings in the wrong buckets, which is exactly the kind of wrong number
  // that reads as right.
  const text = [
    ROW("P1-1", "해소"),
    ROW("P1-2", "부분해소"),
    ROW("P1-3", "미해소"),
    ROW("P1-4", "미해소(수용)"),
    ROW("P1-5", "미확인"),
    ROW("P1-6", "재현안됨"),
  ].join("\n");
  const { counts, total } = parseRegister(text);
  assert.equal(total, 6);
  assert.equal(counts.get("findings-resolved"), 1);
  assert.equal(counts.get("findings-partial"), 1);
  assert.equal(counts.get("findings-open"), 1);
  assert.equal(counts.get("findings-accepted-limit"), 1);
  assert.equal(counts.get("findings-unchecked"), 1);
  assert.equal(counts.get("findings-not-reproduced"), 1);
});

test("an id repeated in a later table is counted once", () => {
  const text = [ROW("P1-1", "해소"), ROW("P1-1", "미해소")].join("\n");
  const { total, counts } = parseRegister(text);
  assert.equal(total, 1);
  assert.equal(counts.get("findings-resolved"), 1);
});

test("a reserved but unused id is not counted as a finding", () => {
  const text = [ROW("P1-1", "해소"), "| **P0-17** | **미사용** | — | — | — | `x.md` |"].join("\n");
  const { total, unused } = parseRegister(text);
  assert.equal(total, 1);
  assert.equal(unused, 1);
});

test("bold markup around an id and a status does not hide the row", () => {
  const text = "| **P1-50** | summary | **P0** | 미해소 ★ | `a.md` | `b.md` |";
  const { total, counts } = parseRegister(text);
  assert.equal(total, 1);
  assert.equal(counts.get("findings-open"), 1);
});

test("the index count is of distinct documents, not of mentions", () => {
  const text = "| a | `runs/x.md` | ... |\n| b | `runs/x.md` | ... |\n| c | `audits/y.md` | ... |";
  assert.equal(countIndexRows(text), 2);
});

test("the report states how many declarations it checked, not only failures", () => {
  const lines: string[] = [];
  const decls = collectDeclarations("<!-- fact: a = 1 -->", "R.md");
  report(compareFacts(decls, { a: 1 }), { a: 1 }, null, (line: string) => lines.push(line));
  assert.match(lines.join("\n"), /declarations checked\s+1/);
});

test("the report is ASCII only", () => {
  const lines: string[] = [];
  const decls = collectDeclarations("<!-- fact: a = 1 -->", "R.md");
  report(compareFacts(decls, { a: 2 }), { a: 2 }, null, (line: string) => lines.push(line));
  for (const line of lines) {
    assert.ok(/^[\x20-\x7e]*$/.test(line), `non-ASCII in report line: ${JSON.stringify(line)}`);
  }
});


// ---------------------------------------------------------------------------
// The test count, and the denominator. Both were added because this checker
// went green while three cover documents said 273 and the suite said 291.
// ---------------------------------------------------------------------------

const tapOf = (...lines: string[]): string => lines.join("\n") + "\n";

test("the test count is read from the runner's own TAP output", () => {
  const tap = tapOf("TAP version 13", "# tests 291", "# suites 0", "# pass 291", "# fail 0");
  assert.deepEqual(parseTestSummary(tap), { pass: 291, fail: 0 });
});

test("a truncated or missing summary measures nothing rather than measuring zero", () => {
  assert.equal(parseTestSummary(tapOf("TAP version 13", "# tests 291")), null);
  assert.equal(parseTestSummary(""), null);
});

test("a failing suite is measured as failing, so a document cannot declare 0", () => {
  assert.deepEqual(parseTestSummary(tapOf("# pass 288", "# fail 3")), { pass: 288, fail: 3 });
});

test("the denominator counts numbers stated as claims", () => {
  assert.equal(countNumericClaims("we found 21 valid and 4 invalid"), 2);
});

// The stripped forms are the ones this repository actually writes: ISO dates,
// bare years, section marks, and file:line inside a code span. A bare "4.1" in
// running prose still counts -- the report calls the number rough for exactly
// this reason, and over-counting the exposure is the safe direction to err.
test("dates, years, section marks and code spans are identifiers, not claims", () => {
  assert.equal(countNumericClaims("on 2026-08-14, per 2026 and §4.1, `src/run.ts:1696` moved"), 0);
});

test("a fenced example does not inflate the denominator", () => {
  assert.equal(countNumericClaims(tapOf("```", "99 100 101", "```", "2 findings")), 1);
});

test("a declaration does not count itself as an unchecked number", () => {
  assert.equal(countNumericClaims("77 findings <!-- fact: registered-findings = 77 -->"), 1);
});

test("the report names the unchecked remainder, not only what it checked", () => {
  const out: string[] = [];
  const decls = collectDeclarations("<!-- fact: a = 1 -->", "R.md");
  report(compareFacts(decls, { a: 1 }), { a: 1 }, { claims: 100, declared: 7 }, (line: string) => out.push(line));
  const text = out.join(" | ");
  assert.match(text, /of those, anchored\s+7\s+=\s+7\.0%/);
  assert.match(text, /UNCHECKED NUMBERS\s+93/);
});
