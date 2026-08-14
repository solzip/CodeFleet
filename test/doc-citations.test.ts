// Every failure mode of the citation checker, made to happen on purpose.
//
// The checker exists because prose citations drifted with nothing watching. A
// checker that watches nothing looks exactly the same from outside, so each
// branch below is driven to fail and the failure is asserted -- the same
// standard test/rule-coverage.test.ts and test/link-check.test.ts hold.

import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCitations,
  collectCitations,
  commitOf,
  countQuoted,
  looksDrifted,
  report,
  stripFences,
} from "../scripts/check-doc-citations.mjs";

const LIVING = { ref: "WORKTREE", living: true, unresolved: false };
const DATED = { ref: "abc1234", living: false, unresolved: false };
const NO_COMMIT = { ref: null, living: false, unresolved: true };

const lines = (n: number, body = "const x = 1;"): string[] => Array.from({ length: n }, () => body);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("a citation inside a fenced block is an illustration, not a claim", () => {
  const text = ["`src/a.ts:10`", "```", "`src/b.ts:20`", "```", "`src/c.ts:30`"].join("\n");
  const found = collectCitations(text, "d.md");
  assert.deepEqual(
    found.map((c) => c.target),
    ["src/a.ts", "src/c.ts"]
  );
});

test("stripping fences preserves line numbering so a report points at the source", () => {
  const text = ["one", "```", "two", "```", "`src/a.ts:5`"].join("\n");
  assert.equal(collectCitations(text, "d.md")[0].line, 5);
  assert.equal(stripFences(text).split("\n").length, text.split("\n").length);
});

test("a range citation carries both ends", () => {
  const [c] = collectCitations("`src/a.ts:10-20`", "d.md");
  assert.equal(c.start, 10);
  assert.equal(c.end, 20);
});

test("a quoted citation is skipped and counted, not silently dropped", () => {
  const text = "| was `src/a.ts:1` | now `src/a.ts:2` | <!-- cite: quoted -->";
  assert.equal(collectCitations(text, "d.md").length, 0);
  assert.equal(countQuoted(text), 2);
});

// ---------------------------------------------------------------------------
// Commit resolution -- the reason a naive version reported 100 false breakages
// ---------------------------------------------------------------------------

test("a commit is read from a table row", () => {
  assert.equal(commitOf("| 대상 커밋 해시 | `c448b7d` |"), "c448b7d");
});

test("a commit is read from a plain label line inside a text block", () => {
  const text = ["```text", "점검 대상   : 754acea73f15729a100e3102e0ff7c5b47869902 (main)", "```"].join("\n");
  assert.equal(commitOf(text), "754acea73f15729a100e3102e0ff7c5b47869902");
});

test("a row labelled 대상 that names a document is not mistaken for a commit", () => {
  assert.equal(commitOf("| 대상 | `docs/runs/2026-08-13/first-full-loop.md` |"), null);
});

test("a row labelled 커밋 wins over an earlier row labelled 대상", () => {
  const text = ["| 대상 | `abcdef1234567` |", "| 커밋 | `9999999` |"].join("\n");
  assert.equal(commitOf(text), "9999999");
});

// ---------------------------------------------------------------------------
// Judgement
// ---------------------------------------------------------------------------

test("a blank line and a bare closer both read as drift", () => {
  assert.ok(looksDrifted(""));
  assert.ok(looksDrifted("   "));
  assert.ok(looksDrifted("  });"));
  assert.ok(!looksDrifted("const x = 1;"));
});

test("a citation past the end of the file fails", () => {
  const c = collectCitations("`src/a.ts:400`", "R.md");
  const r = auditCitations(c, () => lines(10), () => LIVING);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /past the end of the file/);
});

// Two errors, not one: the path is missing *and* nothing ended up examined.
// The second is not noise -- a run where every citation resolves to nothing
// would otherwise report per-file failures while implying the scan itself ran.
test("a citation to a path that does not exist at that ref fails", () => {
  const c = collectCitations("`src/gone.ts:1`", "R.md");
  const r = auditCitations(c, () => null, () => LIVING);
  assert.match(r.errors[0], /does not exist at/);
  assert.equal(r.checked, 0);
  assert.match(r.errors.join("\n"), /covered nothing/);
});

test("drift in a living document is fatal", () => {
  const c = collectCitations("`src/a.ts:2`", "README.md");
  const r = auditCitations(c, () => ["code", "", "code"], () => LIVING);
  assert.equal(r.errors.length, 1);
  assert.equal(r.drifted.length, 0);
});

// Nothing a later session edits can fix a citation that was wrong at the commit
// it names. Failing on it would make the suite permanently red for history.
test("the same drift in a dated record is reported but not fatal", () => {
  const c = collectCitations("`src/a.ts:2`", "docs/audits/2026-08-11/x.md");
  const r = auditCitations(c, () => ["code", "", "code"], () => DATED);
  assert.equal(r.errors.length, 0);
  assert.equal(r.drifted.length, 1);
});

test("a document with no commit is counted as unresolved, not quietly skipped", () => {
  const c = collectCitations("`src/a.ts:1`", "docs/audits/x.md");
  const r = auditCitations(c, () => lines(10), () => NO_COMMIT);
  assert.equal(r.unresolved.get("docs/audits/x.md"), 1);
  // It examined nothing, and that is a failure rather than a pass.
  assert.match(r.errors.join("\n"), /covered nothing/);
});

test("a commit this repository no longer has is unverifiable, not broken", () => {
  const c = collectCitations("`src/a.ts:1`\n`src/b.ts:1`", "docs/audits/x.md");
  const r = auditCitations(
    c,
    () => lines(10),
    () => ({ ref: "70fa598", living: false, unresolved: false }),
    () => false
  );
  assert.equal(r.errors.filter((e) => !/covered nothing/.test(e)).length, 0);
  assert.equal([...r.unverifiable.values()].reduce((a, b) => a + b, 0), 2);
});

test("examining zero citations is a failure, not a pass", () => {
  const r = auditCitations([], () => lines(10), () => LIVING);
  assert.equal(r.checked, 0);
  assert.match(r.errors.join("\n"), /covered nothing/);
});

test("a correct citation passes and is counted", () => {
  const c = collectCitations("`src/a.ts:3`", "README.md");
  const r = auditCitations(c, () => lines(10), () => LIVING);
  assert.equal(r.errors.length, 0);
  assert.equal(r.checked, 1);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

test("the report states what it examined and what it skipped, not only failures", () => {
  const out: string[] = [];
  const c = collectCitations("`src/a.ts:3`", "README.md");
  const r = auditCitations(c, () => lines(10), () => LIVING);
  report({ ...r, quoted: 4 }, (line: string) => out.push(line));
  const text = out.join("\n");
  assert.match(text, /citations examined\s+1/);
  assert.match(text, /skipped as quotations\s+4/);
  assert.match(text, /unverifiable \(dead commit\)/);
});

test("the report is ASCII only", () => {
  const out: string[] = [];
  const c = collectCitations("`src/a.ts:400`", "README.md");
  report({ ...auditCitations(c, () => lines(10), () => LIVING), quoted: 0 }, (line: string) => out.push(line));
  for (const line of out) {
    assert.ok(/^[\x20-\x7e]*$/.test(line), `non-ASCII in report line: ${JSON.stringify(line)}`);
  }
});
