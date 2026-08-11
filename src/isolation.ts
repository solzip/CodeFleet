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

import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gitProcessEnv, ISOLATION_COMMAND_TIMEOUT_MS, runCommand } from "./agent.ts";

export type IsolationMode = "NONE" | "GIT_WORKTREE" | "TEMP_WORKSPACE" | "CONTAINER";

/**
 * What happened to the isolated tree. A discard that failed leaves a tree on
 * disk and a registration in the repository, so it is reported rather than
 * swallowed: silence here would read as "cleaned up".
 */
export interface DiscardOutcome {
  discarded: boolean;
  unavailableReason: string;
  detail: string;
}

export interface PreparedIsolation {
  mode: IsolationMode;
  /**
   * Where the adapter runs and where every piece of evidence is collected.
   * This is the isolated tree's counterpart of projectPath, not the tree root:
   * a Task working in a subdirectory must be observed in that subdirectory.
   * Equals projectPath when mode is NONE.
   */
  workPath: string;
  /** The isolated tree itself. Equals projectPath when mode is NONE. */
  treeRoot: string;
  /** Set when the requested mode could not be provided. */
  unavailableReason: string;
  /** Removes the isolated tree. Idempotent, and a no-op for NONE. */
  discard: () => Promise<DiscardOutcome>;
  /** Kept so the caller can record what was actually done. */
  detail: string;
}

/**
 * Every git call this module makes goes through the same bounded runner the
 * adapter uses. `git worktree add` checks out the repository, so it gets the
 * isolation ceiling rather than the shorter one evidence reads use, and it sees
 * a named environment rather than everything the operator happens to export.
 */
async function run(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const result = await runCommand(command, args, "", cwd, {
    limits: { timeoutMs: ISOLATION_COMMAND_TIMEOUT_MS, outputCapBytes: 4 * 1024 * 1024 },
    env: gitProcessEnv()
  });
  return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0] ?? "";
}

async function isGitRepository(projectPath: string): Promise<boolean> {
  const result = await run("git", ["-c", `safe.directory=${projectPath}`, "rev-parse", "--git-dir"], projectPath);
  return result.code === 0;
}

/**
 * Where projectPath sits inside its repository, as git reports it. Asking git
 * avoids comparing two paths this process normalised itself — on Windows the
 * workspace path and git's top level can differ in case and in short-name form,
 * and a wrong answer here would point evidence collection at the wrong subtree.
 */
async function repositoryPrefix(projectPath: string): Promise<string> {
  const result = await run(
    "git",
    ["-c", `safe.directory=${projectPath}`, "rev-parse", "--show-prefix"],
    projectPath
  );
  if (result.code !== 0) {
    return "";
  }
  return result.stdout.trim().replace(/\/+$/, "");
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
      treeRoot: projectPath,
      unavailableReason: "",
      discard: nothingToDiscard,
      detail: "the agent runs in the workspace itself; nothing is isolated and nothing can be rolled back"
    };
  }

  if (mode === "GIT_WORKTREE") {
    if (!(await isGitRepository(projectPath))) {
      return {
        mode: "GIT_WORKTREE",
        workPath: projectPath,
        treeRoot: projectPath,
        unavailableReason: "GIT_WORKTREE_REQUIRES_A_GIT_REPOSITORY",
        discard: nothingToDiscard,
        detail: "the workspace is not a git repository, so no worktree can be added"
      };
    }

    const prefix = await repositoryPrefix(projectPath);
    const parent = await mkdtemp(path.join(os.tmpdir(), "codefleet-worktree-"));
    const treeRoot = path.join(parent, runId.replace(/[^A-Za-z0-9_-]/g, "-"));
    const created = await run(
      "git",
      ["-c", `safe.directory=${projectPath}`, "worktree", "add", "--detach", treeRoot, "HEAD"],
      projectPath
    );
    if (created.code !== 0) {
      await rm(parent, { recursive: true, force: true });
      return {
        mode: "GIT_WORKTREE",
        workPath: projectPath,
        treeRoot: projectPath,
        unavailableReason: "GIT_WORKTREE_ADD_FAILED",
        discard: nothingToDiscard,
        detail: firstLine(created.stderr) || "git worktree add failed"
      };
    }

    // git worktree add checks out the whole repository, so the Task's working
    // directory is the same distance below the tree root as it is below the
    // repository root. Handing back the tree root instead would observe a
    // different subtree than the one the Task named.
    const workPath = prefix === "" ? treeRoot : path.join(treeRoot, prefix);

    let outcome: DiscardOutcome | null = null;
    return {
      mode: "GIT_WORKTREE",
      workPath,
      treeRoot,
      unavailableReason: "",
      // Removing the worktree registration first, so the repository does not
      // keep a record pointing at a directory that no longer exists. Called on
      // every exit path, so it memoises: the second call reports what the first
      // one did rather than failing on an already-removed tree.
      discard: async (): Promise<DiscardOutcome> => {
        if (outcome !== null) {
          return outcome;
        }
        const removed = await run(
          "git",
          ["-c", `safe.directory=${projectPath}`, "worktree", "remove", "--force", treeRoot],
          projectPath
        );
        if (removed.code !== 0) {
          outcome = {
            discarded: false,
            unavailableReason: "ISOLATION_DISCARD_FAILED",
            detail: `${treeRoot}: ${firstLine(removed.stderr) || "git worktree remove failed"}`
          };
          return outcome;
        }
        try {
          await rm(parent, { recursive: true, force: true });
        } catch (error) {
          outcome = {
            discarded: false,
            unavailableReason: "ISOLATION_DISCARD_FAILED",
            detail: `${parent}: ${error instanceof Error ? error.message : String(error)}`
          };
          return outcome;
        }
        outcome = { discarded: true, unavailableReason: "", detail: `removed the worktree at ${treeRoot}` };
        return outcome;
      },
      detail: `git worktree at ${treeRoot}`
    };
  }

  // TEMP_WORKSPACE and CONTAINER are schema values the design fixes; neither has
  // an implementation. Reporting them as unavailable keeps a Run from silently
  // running unisolated under a mode that says otherwise.
  return {
    mode: mode as IsolationMode,
    workPath: projectPath,
    treeRoot: projectPath,
    unavailableReason: `ISOLATION_MODE_NOT_IMPLEMENTED:${mode}`,
    discard: nothingToDiscard,
    detail: `${mode} is a fixed schema value with no implementation in this build`
  };
}

// Distinct from a discard that ran and succeeded. Nothing was isolated, so
// nothing was removed, and reporting discarded: true would claim a rollback
// that never happened.
async function nothingToDiscard(): Promise<DiscardOutcome> {
  return { discarded: false, unavailableReason: "", detail: "no isolated tree to discard" };
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
