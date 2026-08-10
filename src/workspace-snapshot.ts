// HarnessWorkspaceSnapshot — the state of the workspace before and after a Run.
//
// The field grouping follows the design's minimum-field shape: git evidence,
// scoped file evidence, and state hash are separated because they answer
// different questions. git status gives the changed-file list, git diff gives
// content a person can review, the scoped snapshot covers what git does not
// see, and stateHash is integrity only. Each carries its own unavailableReason
// so a missing piece stays visible instead of being absorbed by the others.
//
// Values are inlined rather than written as separate ref files, matching how
// every other v0.2 Run Trace document records its evidence.

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { matchesPattern } from "./path-policy.ts";

export type SnapshotPhase = "PRE_RUN" | "POST_RUN";

export interface SnapshotSection<T> {
  value: T;
  unavailableReason: string;
}

export interface ScopedFileEntry {
  path: string;
  size: number;
  contentHash: string;
}

export interface HarnessWorkspaceSnapshot {
  schemaVersion: "0.2";
  documentKind: "HARNESS_WORKSPACE_SNAPSHOT";
  phase: SnapshotPhase;
  runId: string;
  capturedAt: string;
  workspaceRootRef: string;
  selectedWorkspaceRootRealPath: string;
  workingDirectoryRef: string;
  workingDirectoryRealPath: string;
  git: {
    headRef: SnapshotSection<string>;
    status: SnapshotSection<string[]>;
    diff: SnapshotSection<string>;
    // Untracked files are policy subjects, so they are snapshotted, not listed
    // and not ignored.
    untrackedPolicy: "SNAPSHOT";
  };
  scopedFiles: SnapshotSection<ScopedFileEntry[]> & {
    scopeBasis: "EFFECTIVE_ALLOWED_PATHS";
    scopePatterns: string[];
  };
  stateHash: SnapshotSection<string> & { algorithm: "sha256" };
  scanScope: {
    statusEntries: number;
    scopedFilesHashed: number;
    scopePatterns: number;
  };
}

export interface SnapshotDelta {
  added: string[];
  modified: string[];
  removed: string[];
  unavailableReason: string;
}

type RunProcess = (
  command: string,
  args: string[],
  cwd: string
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export async function captureWorkspaceSnapshot(input: {
  projectPath: string;
  runId: string;
  phase: SnapshotPhase;
  scopePatterns: string[];
  capturedAt: string;
  workspaceRootRef?: string;
  selectedWorkspaceRootRealPath?: string;
  workingDirectoryRef?: string;
  runProcess: RunProcess;
}): Promise<HarnessWorkspaceSnapshot> {
  const { projectPath, runId, phase, scopePatterns, capturedAt, runProcess } = input;
  const git = (args: string[]) =>
    runProcess("git", ["-c", `safe.directory=${projectPath}`, ...args], projectPath);

  const headResult = await git(["rev-parse", "HEAD"]);
  const headRef: SnapshotSection<string> =
    headResult.code === 0
      ? { value: headResult.stdout.trim(), unavailableReason: "" }
      : { value: "", unavailableReason: "GIT_HEAD_UNAVAILABLE" };

  const statusResult = await git(["status", "--porcelain=v1", "--untracked-files=all", "--", "."]);
  const status: SnapshotSection<string[]> =
    statusResult.code === 0
      ? {
          value: statusResult.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0),
          unavailableReason: ""
        }
      : { value: [], unavailableReason: "GIT_STATUS_FAILED" };

  const diffResult = await git(["diff", "--no-ext-diff", "--", "."]);
  const diff: SnapshotSection<string> =
    diffResult.code === 0
      ? { value: diffResult.stdout, unavailableReason: "" }
      : { value: "", unavailableReason: "GIT_DIFF_FAILED" };

  // git misses files it never tracks, so the scoped snapshot hashes what the
  // effective allowed paths cover regardless of what git reports.
  const scoped = await captureScopedFiles(projectPath, scopePatterns);

  // stateHash is for integrity and replay comparison. It is deliberately not
  // review evidence on its own: a matching hash says nothing about whether the
  // change was correct.
  const stateHash: SnapshotSection<string> & { algorithm: "sha256" } =
    scoped.unavailableReason.length > 0 && status.unavailableReason.length > 0
      ? { algorithm: "sha256", value: "", unavailableReason: "NO_STATE_INPUT_AVAILABLE" }
      : {
          algorithm: "sha256",
          value: createHash("sha256").update(JSON.stringify([status.value, scoped.value])).digest("hex"),
          unavailableReason: ""
        };

  return {
    schemaVersion: "0.2",
    documentKind: "HARNESS_WORKSPACE_SNAPSHOT",
    phase,
    runId,
    capturedAt,
    workspaceRootRef: input.workspaceRootRef ?? ".",
    selectedWorkspaceRootRealPath: input.selectedWorkspaceRootRealPath ?? "",
    workingDirectoryRef: input.workingDirectoryRef ?? ".",
    workingDirectoryRealPath: projectPath,
    git: { headRef, status, diff, untrackedPolicy: "SNAPSHOT" },
    scopedFiles: {
      scopeBasis: "EFFECTIVE_ALLOWED_PATHS",
      scopePatterns,
      value: scoped.value,
      unavailableReason: scoped.unavailableReason
    },
    stateHash,
    scanScope: {
      statusEntries: status.value.length,
      scopedFilesHashed: scoped.value.length,
      scopePatterns: scopePatterns.length
    }
  };
}

async function captureScopedFiles(
  projectPath: string,
  scopePatterns: string[]
): Promise<SnapshotSection<ScopedFileEntry[]>> {
  if (scopePatterns.length === 0) {
    return { value: [], unavailableReason: "NO_SCOPE_PATTERNS" };
  }

  const entries: ScopedFileEntry[] = [];
  const walk = async (dir: string, relative: string, depth: number): Promise<void> => {
    if (depth > 12) {
      return;
    }
    let items: Awaited<ReturnType<typeof readdir>>;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.name === ".git" || item.name === "node_modules" || item.name === ".codefleet") {
        continue;
      }
      const childRelative = relative === "" ? item.name : `${relative}/${item.name}`;
      const childPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(childPath, childRelative, depth + 1);
        continue;
      }
      if (!scopePatterns.some((pattern) => matchesPattern(childRelative, pattern, true))) {
        continue;
      }
      try {
        const info = await stat(childPath);
        entries.push({
          path: childRelative,
          size: info.size,
          contentHash: createHash("sha256").update(await readFile(childPath)).digest("hex")
        });
      } catch {
        // A file that disappeared between listing and reading is not in the
        // snapshot; the delta will show it as removed.
      }
    }
  };

  await walk(projectPath, "", 0);
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { value: entries, unavailableReason: "" };
}

// The Run delta is postRun minus preRun over the scoped snapshot, which is what
// makes it independent of whether git happened to report a file.
export function computeDelta(
  pre: HarnessWorkspaceSnapshot,
  post: HarnessWorkspaceSnapshot
): SnapshotDelta {
  if (pre.scopedFiles.unavailableReason.length > 0 || post.scopedFiles.unavailableReason.length > 0) {
    return {
      added: [],
      modified: [],
      removed: [],
      unavailableReason: pre.scopedFiles.unavailableReason || post.scopedFiles.unavailableReason
    };
  }

  const before = new Map(pre.scopedFiles.value.map((entry) => [entry.path, entry.contentHash]));
  const after = new Map(post.scopedFiles.value.map((entry) => [entry.path, entry.contentHash]));

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [file, hash] of after) {
    const previous = before.get(file);
    if (previous === undefined) {
      added.push(file);
    } else if (previous !== hash) {
      modified.push(file);
    }
  }
  for (const file of before.keys()) {
    if (!after.has(file)) {
      removed.push(file);
    }
  }

  return { added, modified, removed, unavailableReason: "" };
}

// Each snapshot section fails on its own, so each is named on its own. Folding
// them into one WORKSPACE_SNAPSHOT_DEGRADED token would hide which part of the
// state a reviewer still has to check by hand.
export function collectSnapshotGaps(
  pre: HarnessWorkspaceSnapshot,
  post: HarnessWorkspaceSnapshot
): string[] {
  const gaps: string[] = [];
  for (const snapshot of [pre, post]) {
    const sections: Array<[string, string]> = [
      ["GIT_HEAD", snapshot.git.headRef.unavailableReason],
      ["GIT_STATUS", snapshot.git.status.unavailableReason],
      ["GIT_DIFF", snapshot.git.diff.unavailableReason],
      ["SCOPED_FILES", snapshot.scopedFiles.unavailableReason],
      ["STATE_HASH", snapshot.stateHash.unavailableReason]
    ];
    for (const [section, reason] of sections) {
      if (reason.length > 0) {
        gaps.push(`${snapshot.phase}_${section}_UNAVAILABLE:${reason}`);
      }
    }
  }
  return gaps;
}
