// Answers one question with a number: how many figures quoted in the prose
// still match what the repository actually contains?
//
// It exists because two full reviews found the same class of defect and neither
// found it with a tool. The registers summed, the coverage matched, the index
// listed exactly what was on disk -- and the sentences summarising those numbers
// were wrong anyway. "43 audit records" long after there were 48. "the 27
// unchecked findings, which nobody looked at" after CI had confirmed one of
// them. Nothing checked prose, so prose was where the false statements lived.
//
// The mechanism is the one this repository already uses for design coverage: a
// claim has to be written down explicitly, and then it is checked. A test says
// coversRule(id, "quoted condition"); a document says
//
//   <!-- fact: registered-findings = 77 -->
//
// next to the sentence that states it. HTML comments render as nothing, so the
// page is unchanged and the claim is machine-checkable. An undeclared number is
// not checked -- this cannot find a figure nobody marked, and it says so rather
// than implying full coverage.
//
// Four ways to fail:
//   1. a declared value that does not match the measured one
//   2. a fact name nothing measures, which is a typo pretending to be a check
//   3. a measurable fact that no document declares anywhere
//   4. zero declarations found -- a scan that examined nothing is not a pass
//
// Output is ASCII only; the console this runs on is CP949.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BASELINE_PATH, COVERAGE_DIR, loadRuleIndex } from "./design-doc.mjs";
import { evaluateCoverage } from "./check-rule-coverage.mjs";
import { stripCode } from "./check-links.mjs";
import { LIVING_DOCS } from "./check-doc-citations.mjs";

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ANCHOR_BASELINE_PATH = path.join(REPO_ROOT, "docs", "doc-anchor-baseline.json");

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

const DECLARATION = /<!--\s*fact:\s*([a-z0-9-]+)\s*=\s*([^\s>]+)\s*-->/g;

// A declaration quoted in a fence or a code span is an illustration of the
// syntax, not a claim. The link checker had to learn this the same way -- its
// first run reported a break that was a diff block explaining a fix -- and this
// checker repeated it within the hour, reading its own documentation's example
// as a declaration. stripCode preserves line numbering, so a reported line
// still points at the source.
export function collectDeclarations(text, file = "") {
  const found = [];
  const lines = stripCode(text).split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(DECLARATION)) {
      found.push({ file, line: i + 1, name: m[1], value: m[2] });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Measurement. Each function takes already-read inputs so the whole comparison
// can be exercised without a filesystem.
// ---------------------------------------------------------------------------

// Longest first: "부분해소" contains "해소", and "미해소(수용)" contains
// "미해소". Matching the short one first would silently move findings between
// buckets -- the counts would still sum to 77 and still be wrong.
const STATUS_ORDER = [
  ["미해소(수용)", "findings-accepted-limit"],
  ["부분해소", "findings-partial"],
  ["재현안됨", "findings-not-reproduced"],
  ["미확인", "findings-unchecked"],
  ["미해소", "findings-open"],
  ["해소", "findings-resolved"],
];

export function parseRegister(text) {
  const counts = new Map(STATUS_ORDER.map(([, key]) => [key, 0]));
  const seen = new Set();
  let unused = 0;

  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    if (cells.length !== 6) continue;
    const id = /^\**\s*(P[01]-\d+)\s*\**$/.exec(cells[0])?.[1];
    if (id === undefined || seen.has(id)) continue;

    const status = cells[3].replace(/[*★\s]/g, "");
    if (status.includes("미사용") || cells[1].includes("**미사용**")) {
      seen.add(id);
      unused += 1;
      continue;
    }
    const match = STATUS_ORDER.find(([label]) => status.startsWith(label));
    if (match === undefined) continue;
    seen.add(id);
    counts.set(match[1], counts.get(match[1]) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return { counts, total, unused };
}

export function countIndexRows(text) {
  return new Set([...text.matchAll(/\|\s*`((?:audits|runs|archive)\/[^`]+\.md)`/g)].map((m) => m[1])).size;
}

// `node --test`'s TAP reporter, written alongside the human output so the count
// can be measured instead of retyped. It exists because the commit that built
// *this* checker added 18 tests, updated its own record to 291, and left 273
// standing in three cover documents -- a number with no anchor, so nothing
// looked at it. The lesson the checker had just been written to enforce.
export function parseTestSummary(tap) {
  const read = (label) => {
    const m = new RegExp(`^# ${label} (\\d+)$`, "m").exec(tap);
    return m === null ? null : Number(m[1]);
  };
  const pass = read("pass");
  const fail = read("fail");
  if (pass === null || fail === null) return null;
  return { pass, fail };
}

// How many numbers in a document are stated as claims, whether or not anyone
// declared them. This is the denominator the report was missing: "34 checked"
// reads as complete, and "34 of 509" does not.
//
// Dates, years, section marks and code spans are removed first -- they are
// identifiers, not measurements -- and 0 and 1 are dropped because ordinals and
// list markers swamp the count. It is an estimate of the exposure, deliberately
// rough, and the report says so.
export function countNumericClaims(text) {
  const body = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/20\d{2}/g, "")
    .replace(/§[\d.]+/g, "")
    .replace(/`[^`]*`/g, "");
  return [...body.matchAll(/(?<![\w.:\-/])\d{1,6}(?:\.\d+)?(?![\w.\-/])/g)].filter((m) => Number(m[0]) > 1)
    .length;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function compareFacts(declarations, measured) {
  const errors = [];
  const declaredNames = new Set();

  for (const d of declarations) {
    declaredNames.add(d.name);
    if (!Object.hasOwn(measured, d.name)) {
      errors.push(`${d.file}:${d.line}: nothing measures a fact named "${d.name}"`);
      continue;
    }
    const actual = String(measured[d.name]);
    if (d.value !== actual) {
      errors.push(`${d.file}:${d.line}: ${d.name} declared ${d.value}, measured ${actual}`);
    }
  }

  // A fact nothing declares is a number this check cannot defend. Naming them
  // is the difference between "everything matches" and "everything I was
  // pointed at matches".
  const undeclared = Object.keys(measured).filter((name) => !declaredNames.has(name)).sort();

  if (declarations.length === 0) {
    errors.push("no fact declarations were found; the scan examined nothing");
  }

  return { errors, undeclared, checked: declarations.length };
}

// ---------------------------------------------------------------------------
// Real repository
// ---------------------------------------------------------------------------

export function repositoryMarkdown(root) {
  // --others --exclude-standard also lists files that are not committed yet but
  // are not ignored either. A document is worth checking before it is published,
  // not only after: checking tracked files alone left every brand new record
  // invisible to both checkers until the very commit that published it.
  const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: root, encoding: "utf8" });
  if (git.error !== undefined || git.status !== 0) {
    throw new Error(`could not list tracked files: ${git.error?.message ?? `git exited ${git.status}`}`);
  }
  return git.stdout.split("\n").map((l) => l.trim()).filter((l) => l.endsWith(".md")).sort();
}

async function readClaims() {
  let files;
  try {
    files = await readdir(COVERAGE_DIR);
  } catch {
    return null;
  }
  const claims = [];
  for (const file of files.filter((name) => name.endsWith(".jsonl"))) {
    const text = await readFile(path.join(COVERAGE_DIR, file), "utf8");
    for (const line of text.split("\n")) {
      if (line.trim().length > 0) claims.push(JSON.parse(line));
    }
  }
  return claims;
}

async function measureAll(root, files) {
  const register = parseRegister(await readFile(path.join(root, "docs", "REGISTER.md"), "utf8"));
  const indexRows = countIndexRows(await readFile(path.join(root, "docs", "INDEX.md"), "utf8"));

  const docs = files.filter((f) => /^docs\/(audits|runs|archive)\//.test(f));
  const auditRun = docs.filter((f) => /^docs\/(audits|runs)\//.test(f)).length;

  const measured = {
    "registered-findings": register.total,
    ...Object.fromEntries(register.counts),
    "docs-indexed": indexRows,
    "docs-on-disk": docs.length,
    "audit-run-records": auditRun,
  };

  const summary = await readFile(path.join(COVERAGE_DIR, "test-summary.tap"), "utf8")
    .then(parseTestSummary)
    .catch(() => null);
  if (summary !== null) {
    measured["tests-passing"] = summary.pass;
    measured["tests-failing"] = summary.fail;
  }

  const claims = await readClaims();
  if (claims === null || claims.length === 0) {
    // Reporting 0 here would be worse than reporting nothing: every coverage
    // fact would "mismatch" and the real message -- that the sink is empty
    // because the suite has not run -- would be buried.
    return { measured, coverageAvailable: false };
  }

  const { rules } = await loadRuleIndex();
  let baseline = null;
  try {
    baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch {
    baseline = null;
  }
  const { stats } = evaluateCoverage(rules, claims, baseline);
  measured["rules-total"] = stats.rules;
  measured["condition-lines"] = stats.totalConditions;
  measured["claims-recorded"] = stats.claimsRecorded;
  measured["conditions-covered"] = stats.coveredConditions;
  measured["coverage-percent"] = ((stats.coveredConditions / stats.totalConditions) * 100).toFixed(1);
  return { measured, coverageAvailable: true };
}

// ---------------------------------------------------------------------------
// Anchor baseline
// ---------------------------------------------------------------------------

/**
 * Reporting the ratio told the next reader that 93% of the numbers here are
 * undefended. It did not stop that share from growing, and a figure nothing
 * defends is exactly how three cover documents kept saying 273. So the ratio
 * gets the same treatment rule coverage already has: it may not erode without
 * somebody writing down that they let it.
 *
 * Two directions, because they fail differently. Deleting an anchor lowers
 * `declared`; adding an unanchored number to a living document raises
 * `unchecked` while `declared` sits still. Guarding only the first would let
 * the exposure grow indefinitely as long as nobody removed anything.
 */
export function evaluateAnchors(exposure, baseline) {
  const errors = [];
  if (baseline === null || baseline === undefined) return { errors };

  if (exposure.declared < baseline.declared) {
    errors.push(
      `anchors fell: ${exposure.declared} declared, baseline is ${baseline.declared}. ` +
        "Restore the declaration, or run `npm run anchors:baseline` and say why in the commit."
    );
  }

  const unchecked = exposure.claims - exposure.declared;
  if (unchecked > baseline.unchecked) {
    errors.push(
      `unchecked numbers rose: ${unchecked}, baseline is ${baseline.unchecked}. ` +
        "Anchor the figures this change added to a living document, or re-baseline deliberately."
    );
  }

  for (const [file, was] of Object.entries(baseline.perDoc ?? {})) {
    const now = exposure.perDoc[file] ?? 0;
    if (now < was) {
      errors.push(`anchors fell in ${file}: ${now}, baseline is ${was}`);
    }
  }

  return { errors };
}

const BANNER = [
  "######################################################################",
  "#  DOC FACT CHECK FAILED",
  "#  npm test exits non-zero. The report below is context, not a pass.",
  "######################################################################",
];

export function report(result, measured, exposure = null, log = console.log) {
  log("");
  log("declared-fact check");
  log(`  declarations checked      ${result.checked}`);
  // The denominator. Without it "34 checked / 0 mismatches" reads as "every
  // number in this repository is right", which is how three cover documents
  // kept a stale test count through a green run. The ratio is the honest
  // headline: this check defends the numbers somebody marked, and nothing else.
  if (exposure !== null) {
    const pct = ((exposure.declared / exposure.claims) * 100).toFixed(1);
    const unchecked = exposure.claims - exposure.declared;
    log(`  numbers stated in living docs  ${exposure.claims}  (rough count)`);
    log(`  of those, anchored             ${exposure.declared}  =  ${pct}%`);
    log(
      `  UNCHECKED NUMBERS             ${unchecked}  <- not defended by this check` +
        (exposure.baseline === undefined ? "" : `  (baseline ${exposure.baseline})`)
    );
  }
  log(`  measurable facts          ${Object.keys(measured).length}`);
  log(`  mismatches                ${result.errors.length}`);
  for (const err of result.errors) log(`      x  ${err}`);
  if (result.undeclared.length > 0) {
    log(`  measured but declared nowhere  ${result.undeclared.length}`);
    for (const name of result.undeclared) log(`      -  ${name} = ${measured[name]}`);
  }
  log("");
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = repositoryMarkdown(REPO_ROOT);
  const { measured, coverageAvailable } = await measureAll(REPO_ROOT, files);

  const declarations = [];
  const exposure = { claims: 0, declared: 0, perDoc: {} };
  for (const file of files) {
    const text = await readFile(path.join(REPO_ROOT, file), "utf8");
    const found = collectDeclarations(text, file);
    declarations.push(...found);
    const key = file.replaceAll("\\", "/");
    if (LIVING_DOCS.has(key)) {
      exposure.claims += countNumericClaims(text);
      exposure.declared += found.length;
      exposure.perDoc[key] = found.length;
    }
  }

  const updateBaseline = process.argv.includes("--update-baseline");
  let anchorBaseline = null;
  try {
    anchorBaseline = JSON.parse(await readFile(ANCHOR_BASELINE_PATH, "utf8"));
  } catch {
    anchorBaseline = null;
  }
  if (anchorBaseline !== null) exposure.baseline = anchorBaseline.unchecked;

  const result = compareFacts(declarations, measured);
  const anchors = evaluateAnchors(exposure, updateBaseline ? null : anchorBaseline);
  const errors = [...result.errors, ...anchors.errors];

  if (errors.length > 0) for (const line of BANNER) console.log(line);
  report({ ...result, errors }, measured, exposure);
  if (!coverageAvailable) {
    console.log("  coverage facts were not measured: the claim sink is empty. Run `npm test`.");
    console.log("");
  }

  if (updateBaseline) {
    await writeFile(
      ANCHOR_BASELINE_PATH,
      `${JSON.stringify(
        {
          note: "Written by npm run anchors:baseline. Anchors may not fall and unchecked numbers may not rise.",
          declared: exposure.declared,
          claims: exposure.claims,
          unchecked: exposure.claims - exposure.declared,
          perDoc: Object.fromEntries(Object.entries(exposure.perDoc).sort()),
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.log(`  anchor baseline written: ${exposure.declared} anchored, ${exposure.claims - exposure.declared} unchecked`);
    console.log("");
  } else if (anchorBaseline === null) {
    console.log("  no anchor baseline recorded yet; run `npm run anchors:baseline` to set one");
    console.log("");
  }

  if (errors.length > 0) {
    console.error(`declared-fact check failed: ${errors.length} error(s). See the banner above the report.`);
    process.exit(1);
  }
}
