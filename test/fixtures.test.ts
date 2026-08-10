import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// A fixture that calls runTask without approving passes only by accident: it
// would be refused for the wrong reason, and the assertion it makes would no
// longer describe what it verified. Two tests drifted that way when approval
// gating landed, so this checks the suite mechanically.
//
// A checker that reports only a verdict cannot be distinguished from one that
// examined nothing, so this reports what it measured and fails if the measured
// surface disappears.

interface CallSite {
  file: string;
  line: number;
  text: string;
  classification: "APPROVED" | "ASSERTS_REFUSAL" | "UNAPPROVED";
}

async function scanRunTaskCallSites(): Promise<CallSite[]> {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = (await readdir(dir)).filter((name) => name.endsWith(".test.ts"));
  const sites: CallSite[] = [];

  for (const file of files) {
    const lines = (await readFile(path.join(dir, file), "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("runTask(root") || line.includes("async function")) {
        return;
      }

      const assertsRefusal = line.includes("rejects") || (lines[index - 1]?.includes("rejects") ?? false);
      const starts = lines.slice(0, index).map((entry) => entry.startsWith("test("));
      const body = lines.slice(Math.max(0, starts.lastIndexOf(true)), index).join("\n");
      const approves = /approveForTest|approveTask|approve\(root/.test(body);

      sites.push({
        file,
        line: index + 1,
        text: line.trim(),
        classification: assertsRefusal ? "ASSERTS_REFUSAL" : approves ? "APPROVED" : "UNAPPROVED"
      });
    });
  }

  return sites;
}

test("every runTask call in the suite either approves first or asserts the refusal", async () => {
  const sites = await scanRunTaskCallSites();
  const counts = {
    total: sites.length,
    approved: sites.filter((s) => s.classification === "APPROVED").length,
    assertsRefusal: sites.filter((s) => s.classification === "ASSERTS_REFUSAL").length,
    unapproved: sites.filter((s) => s.classification === "UNAPPROVED").length
  };

  // Report the measured surface, not just the verdict. A silent pass over an
  // empty scan is the failure this check exists to prevent.
  console.log(
    `runTask call sites: ${counts.total} (approved ${counts.approved}, asserts refusal ${counts.assertsRefusal}, unapproved ${counts.unapproved})`
  );

  // If the scan finds nothing, the checker has stopped measuring anything and
  // its green result means nothing.
  assert.ok(counts.total >= 10, `expected at least 10 runTask call sites, scanned ${counts.total}`);
  assert.ok(
    counts.assertsRefusal >= 1,
    "expected at least one call asserting a refusal; the exemption path is unexercised"
  );
  assert.equal(counts.approved + counts.assertsRefusal, counts.total);

  const offenders = sites.filter((s) => s.classification === "UNAPPROVED");
  assert.deepEqual(
    offenders.map((s) => `${s.file}:${s.line} ${s.text}`),
    [],
    "runTask called without an approval"
  );
});

test("the fixture check detects a removed approval", async () => {
  // Proving the checker fires, rather than trusting that it would. The same
  // classification runs over a synthetic body with the approval taken out.
  const withApproval = [
    'test("example", async () => {',
    '  await approveForTest(root, "sample");',
    '  const execution = await runTask(root, "sample");',
    "});"
  ];
  const withoutApproval = [
    'test("example", async () => {',
    '  const execution = await runTask(root, "sample");',
    "});"
  ];

  const classify = (lines: string[]): string => {
    const index = lines.findIndex((line) => line.includes("runTask(root"));
    const assertsRefusal = lines[index].includes("rejects") || (lines[index - 1]?.includes("rejects") ?? false);
    const starts = lines.slice(0, index).map((entry) => entry.startsWith("test("));
    const body = lines.slice(Math.max(0, starts.lastIndexOf(true)), index).join("\n");
    const approves = /approveForTest|approveTask|approve\(root/.test(body);
    return assertsRefusal ? "ASSERTS_REFUSAL" : approves ? "APPROVED" : "UNAPPROVED";
  };

  assert.equal(classify(withApproval), "APPROVED");
  assert.equal(classify(withoutApproval), "UNAPPROVED", "removing the approval must be detected");
});
