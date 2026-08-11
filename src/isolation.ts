// Execution isolation.
//
// Without it the agent edits the working directory itself, and a Run that fails
// or a review that rejects leaves those edits in place — CodeFleet reverts
// nothing, and the workspace snapshot stores hashes rather than content, so it
// cannot restore anything either. Recovery is entirely the operator's own use of
// git.
//
// A git worktree gives the Run its own checkout of the same repository. Discard
// it and the edits are gone; keep it and they can be inspected. That is what
// makes REJECTED mean something operationally rather than only in the record.

import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type IsolationMode = "NONE" | "GIT_WORKTREE" | "TEMP_WORKSPACE" | "CONTAINER";

export interface PreparedIsolation {
  mode: IsolationMode;
  /** Where the adapter actually runs. Equals projectPath when mode is NONE. */
  workPath: string;
  /** Set when the requested mode could not be provided. */
  unavailableReason: string;
  /** Removes the isolated tree. A no-op for NONE. */
  discard: () => Promise<void>;
  /** Kept so the caller can record what was actually done. */
  detail: string;
}

function run(command: string, args: string[], cwd: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: null, stderr: error.message }));
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function isGitRepository(projectPath: string): Promise<boolean> {
  const result = await run("git", ["-c", `safe.directory=${projectPath}`, "rev-parse", "--git-dir"], projectPath);
  return result.code === 0;
}

export async function prepareIsolation(input: {
  projectPath: string;
  runId: string;
  mode: string;
}): Promise<PreparedIsolation> {
  const { projectPath, runId, mode } = input;

  if (mode === "NONE") {
    return {
      mode: "NONE",
      workPath: projectPath,
      unavailableReason: "",
      discard: async () => {},
      detail: "the agent runs in the workspace itself; nothing is isolated and nothing can be rolled back"
    };
  }

  if (mode === "GIT_WORKTREE") {
    if (!(await isGitRepository(projectPath))) {
      return {
        mode: "GIT_WORKTREE",
        workPath: projectPath,
        unavailableReason: "GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY",
        discard: async () => {},
        detail: "the workspace is not a git repository, so no worktree can be added"
      };
    }

    const parent = await mkdtemp(path.join(os.tmpdir(), "codefleet-worktree-"));
    const workPath = path.join(parent, runId.replace(/[^A-Za-z0-9_-]/g, "-"));
    const created = await run(
      "git",
      ["-c", `safe.directory=${projectPath}`, "worktree", "add", "--detach", workPath, "HEAD"],
      projectPath
    );
    if (created.code !== 0) {
      await rm(parent, { recursive: true, force: true });
      return {
        mode: "GIT_WORKTREE",
        workPath: projectPath,
        unavailableReason: "GIT_WORKTREE_ADD_FAILED",
        discard: async () => {},
        detail: created.stderr.trim().split("\n")[0] || "git worktree add failed"
      };
    }

    return {
      mode: "GIT_WORKTREE",
      workPath,
      unavailableReason: "",
      // Removing the worktree registration first, so the repository does not
      // keep a record pointing at a directory that no longer exists.
      discard: async () => {
        await run("git", ["-c", `safe.directory=${projectPath}`, "worktree", "remove", "--force", workPath], projectPath);
        await rm(parent, { recursive: true, force: true });
      },
      detail: `git worktree at ${workPath}`
    };
  }

  // TEMP_WORKSPACE and CONTAINER are schema values the design fixes; neither has
  // an implementation. Reporting them as unavailable keeps a Run from silently
  // running unisolated under a mode that says otherwise.
  return {
    mode: mode as IsolationMode,
    workPath: projectPath,
    unavailableReason: `ISOLATION_MODE_NOT_IMPLEMENTED:${mode}`,
    discard: async () => {},
    detail: `${mode} is a fixed schema value with no implementation in this build`
  };
}

export interface IsolationRequirement {
  blocked: boolean;
  reason: string;
}

/**
 * requireIsolationForMutation defaults to true and, until now, nothing read it.
 * A flag that is on by default and has no effect is the most misleading state a
 * policy can be in: the profile says mutation requires isolation and it does not.
 */
export function checkIsolationRequirement(input: {
  requireIsolationForMutation: boolean;
  fileEdit: boolean;
  prepared: PreparedIsolation;
}): IsolationRequirement {
  const { requireIsolationForMutation, fileEdit, prepared } = input;

  if (!fileEdit || !requireIsolationForMutation) {
    return { blocked: false, reason: "" };
  }

  if (prepared.mode === "NONE") {
    return {
      blocked: true,
      reason:
        "Run Planning is blocked: this Run may edit files and policies.harness.requireIsolationForMutation is true, " +
        "but defaults.run.isolationMode is NONE.\n" +
        "Set isolationMode to GIT_WORKTREE, or set requireIsolationForMutation to false to accept edits in the workspace itself."
    };
  }

  if (prepared.unavailableReason.length > 0) {
    return {
      blocked: true,
      reason:
        `Run Planning is blocked: isolation ${prepared.mode} was requested but is unavailable ` +
        `(${prepared.unavailableReason}: ${prepared.detail}), and requireIsolationForMutation is true.`
    };
  }

  return { blocked: false, reason: "" };
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
