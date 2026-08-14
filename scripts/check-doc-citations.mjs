// Answers one question with a number: how many of the file:line citations in
// this repository's prose still point at the code they claim to quote?
//
// This is the third checker of the same family, and the reason it exists is the
// second one's blind spot. check-links.mjs proves a link target exists;
// check-doc-facts.mjs proves a declared number matches a measured one. A
// judgment in docs/REGISTER.md is neither -- it is a path and a line number,
// and nothing looked at it. Three of them had drifted, and one had already
// drifted on the day the register was written:
//
//   $ git show ce3a4c1:src/run.ts | sed -n '1630p'    # the audit that found it
//         approvedCategoryIds: []                      -> correct then
//   $ git show 097681b:src/run.ts | sed -n '1630p'    # the register's own base
//       ].join("\n");                                  -> already wrong there
//
// The number was copied out of the audit rather than measured again, which is
// the failure CLAUDE.md already names: "Never trust a count written in prose
// here. Run the command and read the number it prints." A line number is a
// count written in prose.
//
// The one thing that makes this checkable at all: a citation is relative to its
// document's target commit, not to HEAD. Comparing an August 10th audit against
// today's tree reports a hundred breakages that are not breakages. So each
// document is read at the commit it declares, and a document that declares none
// is checked against HEAD only if it is a living document -- one that is read
// as current truth. Everything else is counted as unresolved and reported,
// because a scan that quietly skips half its input is the silent green this
// repository keeps finding.
//
// Four ways to fail:
//   1. a citation whose file does not exist at that document's commit
//   2. a citation past the end of that file
//   3. a citation in a living document landing on a blank line or a bare
//      closing bracket -- drift, since living documents must track HEAD
//   4. zero citations examined, which is not a pass
//
// Output is ASCII only; the console this runs on is CP949.

import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { repositoryMarkdown } from "./check-links.mjs";

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Documents read as current truth rather than as a record of a moment. These
// are the ones whose citations must track HEAD, and they are exactly where all
// three drifted citations were found.
export const LIVING_DOCS = new Set([
  "README.md",
  "README.en.md",
  "docs/REGISTER.md",
  "docs/INDEX.md",
  "docs/CONVENTIONS.md",
  "docs/archive/2026-08-13/ARCHIVE.md",
  "docs/archive/2026-08-13/LESSONS.md",
  "docs/archive/2026-08-13/DESIGN-NOTES.md",
  "docs/archive/2026-08-13/ENVIRONMENT.md",
]);

// Preserved copies of documents as they were before an edit. Their citations
// describe the old text on purpose.
const PRESERVED = /\.original\.md$/;

const CITATION = /`((?:src|test|scripts)\/[A-Za-z0-9._\-/]+\.(?:ts|mjs|js)):(\d+)(?:-(\d+))?`/g;

// The commit a document was written against. Five spellings are in use across
// three days -- "대상 커밋 해시", "대상 커밋", "커밋", "점검 대상", "대상" --
// in two shapes: a table row on the later documents and a plain `label : hash`
// line inside a ```text block on the earlier ones. Matching one spelling read
// 87 citations and skipped 411, so it matches the label loosely and requires
// the value to be a hash, which is what keeps a row like "대상 | `some/doc.md`"
// from being taken as one.
const COMMIT_LINE = /(대상\s*커밋(?:\s*해시)?|점검\s*대상|커밋|대상)\s*\**\s*[:|]\s*\**\s*`?([0-9a-f]{7,40})`?(?![0-9a-z])/;

// A citation quoted to say it *was* wrong. Correcting a drifted line number
// means writing the old one down, and without this the correction itself reads
// as a fresh breakage -- the first run of this checker reported three, and all
// three were its own repository's corrections. Same shape as the fenced-code
// exemption the other two checkers each had to learn.
const QUOTED = /<!--\s*cite:\s*quoted\s*-->/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Fenced blocks only. Inline code spans are kept because a citation *is* a code
 * span -- stripping them the way check-links.mjs does would leave nothing to
 * check. Line numbering is preserved so a report points at the source line.
 */
export function stripFences(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      out.push("");
      continue;
    }
    out.push(fenced ? "" : line);
  }
  return out.join("\n");
}

/**
 * Read on the raw text, not the fence-stripped copy: the 2026-08-10 and 08-11
 * documents put their metadata inside a ```text block, so stripping fences
 * first hides exactly the declarations that matter most.
 *
 * A line labelled with 커밋 wins over one labelled 대상, because a document can
 * carry both and only the first names a commit.
 */
export function commitOf(text) {
  let fallback = null;
  for (const line of text.split("\n")) {
    const m = COMMIT_LINE.exec(line);
    if (m === null) continue;
    if (m[1].includes("커밋")) return m[2];
    fallback ??= m[2];
  }
  return fallback;
}

export function collectCitations(text, file = "") {
  const found = [];
  const lines = stripFences(text).split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (QUOTED.test(lines[i])) continue;
    for (const m of lines[i].matchAll(CITATION)) {
      found.push({
        file,
        line: i + 1,
        target: m[1],
        start: Number(m[2]),
        end: m[3] === undefined ? Number(m[2]) : Number(m[3]),
      });
    }
  }
  return found;
}

/** Citations skipped as quotations, counted so the exemption stays visible. */
export function countQuoted(text) {
  return stripFences(text)
    .split("\n")
    .filter((line) => QUOTED.test(line))
    .reduce((n, line) => n + [...line.matchAll(CITATION)].length, 0);
}

// ---------------------------------------------------------------------------
// Judgement
// ---------------------------------------------------------------------------

// A line that is blank, or nothing but closers, cannot be the code a sentence
// says it is. This is a signal of drift, not proof of it -- and the inverse is
// not proof either, since a shifted line can land on a plausible one. It caught
// all three real cases, and the report says what it is.
export function looksDrifted(body) {
  const t = body.trim();
  return t === "" || /^[)}\];,]+$/.test(t);
}

/**
 * @param citations  from collectCitations, with a `file` on each
 * @param resolve    (ref, path) => string[] | null -- file lines, or null if
 *                   the path does not exist at that ref
 * @param refOf      (file) => { ref, living, unresolved }
 */
export function auditCitations(citations, resolve, refOf, refExists = () => true) {
  const errors = [];
  const drifted = [];
  let checked = 0;
  const unresolved = new Map();
  const unverifiable = new Map();

  for (const c of citations) {
    const { ref, living, unresolved: skip } = refOf(c.file);
    if (skip) {
      unresolved.set(c.file, (unresolved.get(c.file) ?? 0) + 1);
      continue;
    }
    // A commit this repository no longer contains. The 2026-08-10 audits name
    // one: the history was rewritten on 2026-08-11 to carry a single identity,
    // and every hash recorded before that rewrite died with it. Those citations
    // are not wrong, they are unverifiable -- and calling them broken would
    // report 200 defects that no edit can fix.
    if (!refExists(ref)) {
      const key = `${c.file}  @${ref.slice(0, 7)}`;
      unverifiable.set(key, (unverifiable.get(key) ?? 0) + 1);
      continue;
    }

    // Only a living document's citation is actionable. A dated record is
    // checked at the commit it declares, and anything wrong there was wrong
    // when it was written -- no edit made today fixes it, and one of the two
    // shapes below is not even an error: a `fixes/` document declares the
    // commit *before* its own change and then cites the tree after it. Both are
    // reported and neither is fatal, because burying them and failing on them
    // are the same mistake in opposite directions.
    const fail = (note) => (living ? errors : drifted).push(note);

    const lines = resolve(ref, c.target);
    if (lines === null) {
      fail(`${c.file}:${c.line}: ${c.target} does not exist at ${ref}`);
      continue;
    }
    checked += 1;

    if (c.end > lines.length) {
      fail(
        `${c.file}:${c.line}: ${c.target}:${c.start}-${c.end} is past the end of the file at ${ref.slice(0, 7)} (${lines.length} lines)`
      );
      continue;
    }

    if (looksDrifted(lines[c.start - 1] ?? "")) {
      const body = (lines[c.start - 1] ?? "").trim();
      fail(`${c.file}:${c.line}: ${c.target}:${c.start} is ${body === "" ? "a blank line" : `"${body}"`}`);
    }
  }

  if (checked === 0) errors.push("no citations were examined; the scan covered nothing");

  return { errors, drifted, checked, unresolved, unverifiable };
}

// ---------------------------------------------------------------------------
// Real repository
// ---------------------------------------------------------------------------

export function makeRefChecker(root) {
  const cache = new Map();
  return (ref) => {
    if (ref === "WORKTREE") return true;
    if (!cache.has(ref)) {
      const git = spawnSync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd: root, encoding: "utf8" });
      cache.set(ref, git.status === 0);
    }
    return cache.get(ref);
  };
}

export function makeGitResolver(root) {
  const cache = new Map();
  return (ref, target) => {
    const key = `${ref}:${target}`;
    if (cache.has(key)) return cache.get(key);
    const git = spawnSync("git", ["show", `${ref}:${target}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const value = git.status === 0 ? git.stdout.split(/\r?\n/) : null;
    cache.set(key, value);
    return value;
  };
}

export async function scanRepository(root, files) {
  const citations = [];
  const refs = new Map();
  let quoted = 0;

  for (const file of files) {
    if (PRESERVED.test(file)) continue;
    const text = await readFile(path.join(root, file), "utf8");
    quoted += countQuoted(text);
    const found = collectCitations(text, file);
    if (found.length === 0) continue;
    citations.push(...found);

    const living = LIVING_DOCS.has(file.replaceAll("\\", "/"));
    const commit = commitOf(text);
    // A living document is measured against the working tree, because that is
    // what its reader will open. `git show HEAD:` would miss exactly the drift
    // an uncommitted edit introduces.
    if (living) refs.set(file, { ref: "WORKTREE", living: true, unresolved: false });
    else if (commit !== null) refs.set(file, { ref: commit, living: false, unresolved: false });
    else refs.set(file, { ref: null, living: false, unresolved: true });
  }

  const git = makeGitResolver(root);
  const worktree = new Map();
  const resolve = (ref, target) => {
    if (ref !== "WORKTREE") return git(ref, target);
    if (!worktree.has(target)) {
      try {
        worktree.set(target, readFileSync(path.join(root, target), "utf8").split(/\r?\n/));
      } catch {
        worktree.set(target, null);
      }
    }
    return worktree.get(target);
  };

  return {
    ...auditCitations(citations, resolve, (file) => refs.get(file), makeRefChecker(root)),
    quoted,
  };
}

const BANNER = [
  "######################################################################",
  "#  DOC CITATION CHECK FAILED",
  "#  npm test exits non-zero. The report below is context, not a pass.",
  "######################################################################",
];

export function report(result, log = console.log) {
  const skipped = [...result.unresolved.values()].reduce((a, b) => a + b, 0);
  log("");
  log("file:line citation check");
  log(`  citations examined        ${result.checked}`);
  log(`  skipped as quotations     ${result.quoted ?? 0}  (marked <!-- cite: quoted -->)`);
  log(`  unresolved (no commit)    ${skipped}${skipped > 0 ? `  in ${result.unresolved.size} document(s)` : ""}`);
  for (const [file, n] of result.unresolved) log(`      -  ${file}  (${n})`);
  const dead = [...(result.unverifiable?.values() ?? [])].reduce((a, b) => a + b, 0);
  log(`  unverifiable (dead commit) ${dead}  (history rewrite; no edit can fix these)`);
  for (const [key, n] of result.unverifiable ?? []) log(`      ?  ${key}  (${n})`);
  log(`  broken in living docs     ${result.errors.length}`);
  for (const err of result.errors) log(`      x  ${err}`);
  log(`  suspect in dated records  ${result.drifted.length}  (wrong at their own commit; no edit fixes these)`);
  for (const d of result.drifted) log(`      ~  ${d}`);
  log("");
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = repositoryMarkdown(REPO_ROOT);
  const result = await scanRepository(REPO_ROOT, files);
  if (result.errors.length > 0) for (const line of BANNER) console.log(line);
  report(result);
  if (result.errors.length > 0) {
    console.error(`citation check failed: ${result.errors.length} error(s). See the banner above the report.`);
    process.exit(1);
  }
}
