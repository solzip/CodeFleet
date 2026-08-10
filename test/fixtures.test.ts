import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// A fixture that calls runTask without approving passes only by accident: it
// would be refused for the wrong reason, and the assertion it makes would no
// longer describe what it verified. Two tests already drifted that way when
// approval gating landed, so this checks the whole suite mechanically instead
// of relying on the next reader noticing.
test("every runTask call in the suite either approves first or asserts the refusal", async () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = (await readdir(dir)).filter((name) => name.endsWith(".test.ts"));
  const offenders: string[] = [];

  for (const file of files) {
    const lines = (await readFile(path.join(dir, file), "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("runTask(root") || line.includes("async function")) {
        return;
      }
      // A call wrapped in assert.rejects is testing a refusal on purpose.
      if (line.includes("rejects") || lines[index - 1]?.includes("rejects")) {
        return;
      }
      // Look back to the start of the enclosing test rather than a fixed
      // window, so an approval made earlier in the body still counts.
      const starts = lines.slice(0, index).map((entry) => entry.startsWith("test("));
      const before = lines.slice(Math.max(0, starts.lastIndexOf(true)), index).join("\n");
      if (!/approveForTest|approveTask|approve\(root/.test(before)) {
        offenders.push(`${file}:${index + 1} ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(offenders, [], `runTask called without an approval:\n${offenders.join("\n")}`);
});
