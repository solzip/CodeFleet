// Answers one question with a number: how many links in this repository point
// at something that is not there?
//
// It exists because the answer was wrong twice in one day. A hand-rolled sweep
// reported "0 broken" while three links were dead, and the reason was a
// fallback: when a target did not resolve against the document, the sweep tried
// again against the repository root, so `[LICENSE](LICENSE)` inside
// docs/archive/2026-08-13/ matched /LICENSE and passed. Markdown does not
// resolve it that way and GitHub returns 404. The failure direction is the
// point -- it was wrong toward green, which is the direction nobody
// investigates. See docs/runs/2026-08-13/link-audit-full.md.
//
// Four ways to fail, each one a thing that has actually broken here or in a
// sibling check:
//   1. a target that does not exist, resolved against the document only
//   2. a target whose casing differs from the file on disk. Windows does not
//      care and Linux does, and this repository already has one local-green /
//      CI-red story on exactly that difference
//   3. an anchor naming a heading the target document does not have
//   4. zero files examined -- a scan that looked at nothing is not a pass
//
// Output is ASCII only. The console this is developed on is CP949 and a single
// em dash is enough to end the run with UnicodeEncodeError instead of a verdict.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Pure text handling. Exported so the checker can be checked without a
// filesystem, a subprocess, or a platform. A verifier nobody verifies is the
// exact failure this whole mechanism exists to catch.
// ---------------------------------------------------------------------------

// A link quoted inside a fence or a code span is an illustration, not a link.
// Counting those is how the first version of this sweep reported a break that
// was a diff block explaining a fix.
export function stripCode(text) {
  const out = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      fenced = !fenced;
      out.push("");
      continue;
    }
    out.push(fenced ? "" : line.replace(/`[^`]*`/g, ""));
  }
  return out.join("\n");
}

const INLINE = /(!?)\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\s*\)/g;
const REFDEF = /^ {0,3}\[[^\]]+\]:\s*<?(\S+)>?/gm;

// Returns every link the renderer would follow, and how many link-shaped
// strings were skipped as quotations. Reporting the second number is the
// difference between "nothing is broken" and "nothing was examined".
export function collectLinks(text) {
  const body = stripCode(text);
  const links = [];
  for (const m of body.matchAll(INLINE)) {
    links.push({ target: m[2].trim(), kind: m[1] === "!" ? "image" : "link" });
  }
  for (const m of body.matchAll(REFDEF)) {
    links.push({ target: m[1].trim(), kind: "refdef" });
  }
  const quoted = [...text.matchAll(INLINE)].length - [...body.matchAll(INLINE)].length;
  return { links, quoted };
}

// GitHub's heading slug, close enough for internal anchors: lowercase, drop
// punctuation, spaces to hyphens, and a -1, -2 suffix on repeats.
export function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function headingAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const line of stripCode(text).split("\n")) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m === null) continue;
    const base = slug(m[2]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

// ---------------------------------------------------------------------------
// The audit. Every filesystem touch arrives through `fs`, so a test can run the
// whole thing over an in-memory repository -- no temp directories, no spawned
// child, no path-string guard. Those are what broke the last two tests added
// here on CI while passing locally.
// ---------------------------------------------------------------------------

export function auditLinks(files, fs) {
  const result = {
    files: files.length,
    checked: 0,
    quoted: 0,
    internal: 0,
    intraDoc: 0,
    external: 0,
    mailto: 0,
    broken: [],
    caseMismatch: [],
    missingAnchor: [],
    errors: [],
  };

  // A check that quantifies over a set must report what it scanned. Zero
  // examined is a failure, not a pass -- this repository has been bitten by a
  // parser that read 0 rules and reported success.
  if (files.length === 0) {
    result.errors.push("no markdown files were examined; the file list is empty");
    return result;
  }

  const anchorCache = new Map();
  const anchorsOf = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, headingAnchors(fs.read(file)));
    return anchorCache.get(file);
  };

  for (const file of files) {
    const { links, quoted } = collectLinks(fs.read(file));
    result.quoted += quoted;
    const dir = path.posix.dirname(file.split(path.sep).join("/"));

    for (const { target } of links) {
      result.checked += 1;
      if (/^https?:\/\//.test(target)) {
        result.external += 1;
        continue;
      }
      if (target.startsWith("mailto:")) {
        result.mailto += 1;
        continue;
      }

      const hash = target.indexOf("#");
      const rawPath = hash === -1 ? target : target.slice(0, hash);
      const fragment = hash === -1 ? "" : target.slice(hash + 1);

      if (rawPath === "") {
        result.intraDoc += 1;
        if (fragment !== "" && !anchorsOf(file).has(slug(fragment))) {
          result.missingAnchor.push(`${file} -> #${fragment}`);
        }
        continue;
      }

      result.internal += 1;
      // Resolved against the document and nothing else. The root fallback that
      // used to live here is the reason three dead links reported green.
      const resolved = path.posix.normalize(path.posix.join(dir, decodeURIComponent(rawPath)));
      if (!fs.exists(resolved)) {
        result.broken.push(`${file} -> ${target}`);
        continue;
      }
      if (!fs.sameCase(resolved)) {
        result.caseMismatch.push(`${file} -> ${target}`);
        continue;
      }
      if (fragment !== "" && resolved.endsWith(".md")) {
        if (!anchorsOf(resolved).has(slug(fragment))) {
          result.missingAnchor.push(`${file} -> ${target}`);
        }
      }
    }
  }

  return result;
}

export function failureCount(result) {
  return (
    result.errors.length +
    result.broken.length +
    result.caseMismatch.length +
    result.missingAnchor.length
  );
}

// ---------------------------------------------------------------------------
// Real filesystem, real repository.
// ---------------------------------------------------------------------------

function realFs(root) {
  return {
    read: (rel) => readFileSync(path.join(root, rel), "utf8"),
    exists: (rel) => existsSync(path.join(root, rel)),
    // Walks the path one segment at a time and compares against what the
    // directory actually reports. existsSync alone answers "yes" on Windows for
    // a casing GitHub will 404 on.
    sameCase: (rel) => {
      let dir = root;
      for (const part of rel.split("/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") {
          dir = path.dirname(dir);
          continue;
        }
        try {
          if (!readdirSync(dir).includes(part)) return false;
        } catch {
          return false;
        }
        dir = path.join(dir, part);
      }
      return true;
    },
  };
}

export function repositoryMarkdown(root) {
  // --others --exclude-standard also lists files that are not committed yet but
  // are not ignored either. A document is worth checking before it is published,
  // not only after: checking tracked files alone left every brand new record
  // invisible to both checkers until the very commit that published it.
  const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { cwd: root, encoding: "utf8" });
  if (git.error !== undefined || git.status !== 0) {
    // Falling back to a directory walk here would quietly change what "every
    // file" means. Say the scope could not be established instead.
    throw new Error(
      `could not list tracked files: ${git.error?.message ?? `git exited ${git.status}`}`
    );
  }
  return git.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".md"))
    .filter((line) => {
      const full = path.join(root, line);
      return existsSync(full) && statSync(full).isFile();
    })
    .sort();
}

const BANNER = [
  "######################################################################",
  "#  LINK CHECK FAILED",
  "#  npm test exits non-zero. The report below is context, not a pass.",
  "######################################################################",
];

export function report(result, log = console.log) {
  log("");
  log("link check");
  log(`  markdown files examined   ${result.files}`);
  log(`  links collected           ${result.checked}  (inline, image, reference)`);
  log(`    repo-relative paths     ${result.internal}`);
  log(`    same-document anchors   ${result.intraDoc}`);
  log(`    external URLs           ${result.external}  (not fetched; this check is offline)`);
  log(`    mailto                  ${result.mailto}`);
  log(`  skipped as quotations     ${result.quoted}  (inside code fences or spans)`);
  log("");
  for (const [label, list] of [
    ["missing target", result.broken],
    ["case mismatch", result.caseMismatch],
    ["missing anchor", result.missingAnchor],
  ]) {
    log(`  ${label.padEnd(24)}${list.length}`);
    for (const item of list) log(`      x  ${item}`);
  }
  for (const err of result.errors) log(`      x  ${err}`);
  log("");
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const files = repositoryMarkdown(REPO_ROOT);
  const result = auditLinks(files, realFs(REPO_ROOT));
  const failures = failureCount(result);

  // The banner goes to stdout before the report, not after it. A failure
  // printed under a wall of numbers is a failure nobody reads.
  if (failures > 0) for (const line of BANNER) console.log(line);
  report(result);

  if (failures > 0) {
    console.error(`link check failed: ${failures} error(s). See the banner above the report.`);
    process.exit(1);
  }
}
