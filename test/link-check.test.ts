import assert from "node:assert/strict";
import test from "node:test";
import {
  auditLinks,
  collectLinks,
  failureCount,
  headingAnchors,
  report,
  slug,
} from "../scripts/check-links.mjs";

// The link checker reported "0 broken" while three links were dead. Every test
// below is one of the ways it was wrong, pinned so it cannot be wrong that way
// again. A verifier nobody verifies is the failure this project exists to catch.
//
// None of these spawn a child process or build a path string by hand. The two
// tests added here that did both passed locally and failed on CI, which is the
// second reason this file looks the way it does.

// An in-memory repository. Keys are repo-relative POSIX paths, values are file
// contents. `sameCase` answers the way a case-sensitive filesystem would.
function repo(files) {
  return {
    read: (rel) => {
      const text = files[rel];
      if (text === undefined) throw new Error(`no such file: ${rel}`);
      return text;
    },
    exists: (rel) => Object.keys(files).some((k) => k === rel || k.toLowerCase() === rel.toLowerCase()),
    sameCase: (rel) => Object.hasOwn(files, rel),
  };
}

test("a link to a file that is not there is reported", () => {
  const files = { "docs/a.md": "see [b](b.md)" };
  const result = auditLinks(["docs/a.md"], repo(files));
  assert.deepEqual(result.broken, ["docs/a.md -> b.md"]);
  assert.equal(failureCount(result), 1);
});

test("a target that only resolves from the repository root is still broken", () => {
  // The exact defect. `[LICENSE](LICENSE)` sits in docs/archive/2026-08-13/, a
  // LICENSE exists at the root, and the old sweep fell back to the root and
  // called it green. Markdown resolves against the document; GitHub returns 404.
  const files = {
    "LICENSE.md": "the licence",
    "docs/archive/2026-08-13/README.original.md": "terms in [LICENSE](LICENSE.md)",
  };
  const result = auditLinks(["docs/archive/2026-08-13/README.original.md"], repo(files));
  assert.deepEqual(result.broken, ["docs/archive/2026-08-13/README.original.md -> LICENSE.md"]);
});

test("a relative path that climbs out of the directory resolves", () => {
  // The fix for the case above, so the test proves the checker accepts the
  // correct form rather than merely rejecting the wrong one.
  const files = {
    "LICENSE.md": "the licence",
    "docs/archive/2026-08-13/README.original.md": "terms in [LICENSE](../../../LICENSE.md)",
  };
  const result = auditLinks(["docs/archive/2026-08-13/README.original.md"], repo(files));
  assert.equal(failureCount(result), 0);
  assert.equal(result.internal, 1);
});

test("a target whose casing differs from the file on disk is reported", () => {
  // Windows says this file exists. Linux, and GitHub, do not. This repository
  // already shipped one local-green / CI-red difference of exactly this kind.
  const files = { "docs/README.md": "x", "docs/a.md": "see [r](readme.md)" };
  const result = auditLinks(["docs/a.md"], repo(files));
  assert.deepEqual(result.caseMismatch, ["docs/a.md -> readme.md"]);
  assert.deepEqual(result.broken, []);
});

test("an anchor naming a heading the target does not have is reported", () => {
  const files = {
    "docs/b.md": "# Real Heading\n",
    "docs/a.md": "see [b](b.md#imagined-heading)",
  };
  const result = auditLinks(["docs/a.md"], repo(files));
  assert.deepEqual(result.missingAnchor, ["docs/a.md -> b.md#imagined-heading"]);
});

test("an anchor that names a real heading passes", () => {
  const files = {
    "docs/b.md": "# Real Heading\n",
    "docs/a.md": "see [b](b.md#real-heading)",
  };
  assert.equal(failureCount(auditLinks(["docs/a.md"], repo(files))), 0);
});

test("a same-document anchor is checked against that document", () => {
  const files = { "docs/a.md": "## Section One\n\njump to [nowhere](#section-two)" };
  const result = auditLinks(["docs/a.md"], repo(files));
  assert.equal(result.intraDoc, 1);
  assert.deepEqual(result.missingAnchor, ["docs/a.md -> #section-two"]);
});

test("repeated headings get the suffix GitHub gives them", () => {
  const anchors = headingAnchors("# Same\n# Same\n# Same\n");
  assert.deepEqual([...anchors].sort(), ["same", "same-1", "same-2"]);
});

test("a link quoted inside a code fence is not a link", () => {
  // The first version of this sweep reported a break that was an illustration
  // inside a diff block explaining a fix. It was wrong toward red, which is at
  // least loud; the root fallback was wrong toward green, which is not.
  const text = "```diff\n- [gone](nowhere.md)\n```\n";
  const { links, quoted } = collectLinks(text);
  assert.deepEqual(links, []);
  assert.equal(quoted, 1);
});

test("a link inside an inline code span is not a link", () => {
  const { links, quoted } = collectLinks("write it as `[label](target.md)` when quoting");
  assert.deepEqual(links, []);
  assert.equal(quoted, 1);
});

test("images and reference definitions are collected, not only inline links", () => {
  const { links } = collectLinks("![shot](a.png)\n\n[ref]: b.md\n\n[inline](c.md)\n");
  assert.deepEqual(links.map((l) => l.kind).sort(), ["image", "link", "refdef"]);
});

test("external URLs are counted and not resolved as paths", () => {
  const files = { "docs/a.md": "see [spec](https://example.invalid/x) and [mail](mailto:a@b.c)" };
  const result = auditLinks(["docs/a.md"], repo(files));
  assert.equal(result.external, 1);
  assert.equal(result.mailto, 1);
  assert.equal(failureCount(result), 0);
});

test("examining no files is a failure, not a pass", () => {
  // A check that quantifies over a set must report what it scanned. This repo
  // has already been bitten by a parser that read 0 rules and reported success.
  const result = auditLinks([], repo({}));
  assert.equal(result.checked, 0);
  assert.equal(failureCount(result), 1);
  assert.match(result.errors[0], /no markdown files were examined/);
});

test("the report states what it skipped, not only what failed", () => {
  // "0 broken" prints identically whether the checker examined everything or
  // nothing. The counts are what make the verdict readable.
  const files = { "docs/a.md": "ok [b](b.md)\n\n```\n[x](y.md)\n```\n", "docs/b.md": "# B\n" };
  const lines: string[] = [];
  report(auditLinks(["docs/a.md"], repo(files)), (line: string) => lines.push(line));
  const text = lines.join("\n");
  assert.match(text, /markdown files examined\s+1/);
  assert.match(text, /skipped as quotations\s+1/);
  assert.match(text, /missing target\s+0/);
});

test("the report is ASCII only", () => {
  // The console this is developed on is CP949. One em dash ends the run with an
  // encoding error instead of a verdict.
  const files = { "docs/a.md": "[b](nowhere.md)" };
  const lines: string[] = [];
  report(auditLinks(["docs/a.md"], repo(files)), (line: string) => lines.push(line));
  for (const line of lines) {
    assert.ok(/^[\x20-\x7e]*$/.test(line), `non-ASCII in report line: ${JSON.stringify(line)}`);
  }
});

test("slugs drop punctuation and keep non-Latin letters", () => {
  assert.equal(slug("## `code`, and (parens)!"), "code-and-parens");
  assert.equal(slug("한국어 제목"), "한국어-제목");
});
