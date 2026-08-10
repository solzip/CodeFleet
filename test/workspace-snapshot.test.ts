import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { captureWorkspaceSnapshot, collectSnapshotGaps, computeDelta } from "../src/workspace-snapshot.ts";

const OK = async () => ({ code: 0, stdout: "", stderr: "" });
const FAIL = async () => ({ code: 1, stdout: "", stderr: "boom" });

async function workspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "codefleet-snapshot-"));
}

async function capture(
  root: string,
  phase: "PRE_RUN" | "POST_RUN",
  scopePatterns: string[],
  runProcess: Parameters<typeof captureWorkspaceSnapshot>[0]["runProcess"] = OK
) {
  return captureWorkspaceSnapshot({
    projectPath: root,
    runId: "r1",
    phase,
    scopePatterns,
    capturedAt: "2026-08-10T00:00:00+09:00",
    runProcess
  });
}

test("a scoped snapshot hashes exactly the files the scope covers", async () => {
  const root = await workspace();
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "a", "utf8");
    await writeFile(path.join(root, "src", "b.ts"), "b", "utf8");
    await writeFile(path.join(root, "outside.txt"), "x", "utf8");

    const snapshot = await capture(root, "PRE_RUN", ["src/**"]);

    assert.deepEqual(
      snapshot.scopedFiles.value.map((entry) => entry.path),
      ["src/a.ts", "src/b.ts"]
    );
    assert.equal(snapshot.scanScope.scopedFilesHashed, 2);
    assert.equal(snapshot.scanScope.scopePatterns, 1);
    assert.equal(snapshot.scopedFiles.unavailableReason, "");
    assert.equal(snapshot.scopedFiles.scopeBasis, "EFFECTIVE_ALLOWED_PATHS");
    assert.equal(snapshot.git.untrackedPolicy, "SNAPSHOT");
    assert.equal(snapshot.stateHash.algorithm, "sha256");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a scope that matches nothing is reported as zero, not as unavailable", async () => {
  const root = await workspace();
  try {
    await writeFile(path.join(root, "outside.txt"), "x", "utf8");
    const snapshot = await capture(root, "PRE_RUN", ["src/**"]);

    // Zero files scanned and zero files found look identical unless the count
    // is on the record, which is why scanScope carries it.
    assert.equal(snapshot.scanScope.scopedFilesHashed, 0);
    assert.equal(snapshot.scopedFiles.unavailableReason, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("each evidence section fails on its own, and every failure is named", async () => {
  const root = await workspace();
  try {
    const snapshot = await capture(root, "PRE_RUN", [], FAIL);

    assert.equal(snapshot.git.headRef.unavailableReason, "GIT_HEAD_UNAVAILABLE");
    assert.equal(snapshot.git.status.unavailableReason, "GIT_STATUS_FAILED");
    assert.equal(snapshot.git.diff.unavailableReason, "GIT_DIFF_FAILED");
    assert.equal(snapshot.scopedFiles.unavailableReason, "NO_SCOPE_PATTERNS");
    assert.equal(snapshot.stateHash.unavailableReason, "NO_STATE_INPUT_AVAILABLE");

    // One aggregate token would hide four separate things a reviewer has to
    // check by hand, so the gap list is per section.
    assert.deepEqual(collectSnapshotGaps(snapshot, snapshot), [
      "PRE_RUN_GIT_HEAD_UNAVAILABLE:GIT_HEAD_UNAVAILABLE",
      "PRE_RUN_GIT_STATUS_UNAVAILABLE:GIT_STATUS_FAILED",
      "PRE_RUN_GIT_DIFF_UNAVAILABLE:GIT_DIFF_FAILED",
      "PRE_RUN_SCOPED_FILES_UNAVAILABLE:NO_SCOPE_PATTERNS",
      "PRE_RUN_STATE_HASH_UNAVAILABLE:NO_STATE_INPUT_AVAILABLE",
      "PRE_RUN_GIT_HEAD_UNAVAILABLE:GIT_HEAD_UNAVAILABLE",
      "PRE_RUN_GIT_STATUS_UNAVAILABLE:GIT_STATUS_FAILED",
      "PRE_RUN_GIT_DIFF_UNAVAILABLE:GIT_DIFF_FAILED",
      "PRE_RUN_SCOPED_FILES_UNAVAILABLE:NO_SCOPE_PATTERNS",
      "PRE_RUN_STATE_HASH_UNAVAILABLE:NO_STATE_INPUT_AVAILABLE"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the delta is post minus pre and separates added, modified, and removed", async () => {
  const root = await workspace();
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "keep.ts"), "same", "utf8");
    await writeFile(path.join(root, "src", "edit.ts"), "before", "utf8");
    await writeFile(path.join(root, "src", "gone.ts"), "bye", "utf8");
    const pre = await capture(root, "PRE_RUN", ["src/**"]);

    await writeFile(path.join(root, "src", "edit.ts"), "after", "utf8");
    await rm(path.join(root, "src", "gone.ts"));
    await writeFile(path.join(root, "src", "new.ts"), "hello", "utf8");
    const post = await capture(root, "POST_RUN", ["src/**"]);

    const delta = computeDelta(pre, post);
    assert.deepEqual(delta.added, ["src/new.ts"]);
    assert.deepEqual(delta.modified, ["src/edit.ts"]);
    assert.deepEqual(delta.removed, ["src/gone.ts"]);
    assert.equal(delta.unavailableReason, "");
    assert.notEqual(pre.stateHash.value, post.stateHash.value);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an untouched workspace produces an empty delta and a stable stateHash", async () => {
  const root = await workspace();
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "a", "utf8");

    const pre = await capture(root, "PRE_RUN", ["src/**"]);
    const post = await capture(root, "POST_RUN", ["src/**"]);
    const delta = computeDelta(pre, post);

    assert.deepEqual([delta.added, delta.modified, delta.removed], [[], [], []]);
    assert.equal(pre.stateHash.value, post.stateHash.value);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a delta over missing snapshot evidence refuses to report no change", async () => {
  const root = await workspace();
  try {
    const pre = await capture(root, "PRE_RUN", []);
    const post = await capture(root, "POST_RUN", []);
    const delta = computeDelta(pre, post);

    // The dangerous failure is an unmeasured delta that looks like a clean one.
    assert.equal(delta.unavailableReason, "NO_SCOPE_PATTERNS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CodeFleet's own run artifacts are not counted as workspace changes", async () => {
  const root = await workspace();
  try {
    await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });
    await writeFile(path.join(root, ".codefleet", "runs", "x.json"), "{}", "utf8");
    const snapshot = await capture(root, "POST_RUN", ["**"]);

    assert.deepEqual(
      snapshot.scopedFiles.value.filter((entry) => entry.path.startsWith(".codefleet")),
      []
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
