// Reintegration — moving an accepted Run's changes from the isolated tree into
// the workspace.
//
// This is the one part of the model the design does not regulate, and the
// choice made here is explicit application: `codefleet apply <run-id>`, a human
// action recorded in the ledger. The alternative — an ACCEPTED review applying
// automatically — collapses the review decision and the workspace change into
// one act, and isolation exists precisely so an agent's work does not reach the
// workspace without somebody deciding it should.
//
// The isolated tree is discarded when the Run ends, so what is applied is the
// diff the Harness observed, not a directory that may have drifted since. That
// means the patch is evidence, and every reason it might not be trustworthy is
// a refusal here rather than a partial write:
//
//   - no accepted review              nobody decided this should land
//   - truncated diff                  applying part of a change is worse than none
//   - the Run edited the workspace    there is nothing to move
//   - the workspace has moved         the patch was written against other content
//
// A refusal leaves the workspace untouched. Applying half a change and
// reporting an error would be the failure mode this whole tool exists to
// prevent.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runCommand, gitProcessEnv, ISOLATION_COMMAND_TIMEOUT_MS } from "./agent.ts";
import { appendEvent, objectiveDir, readEvents, replayObjective, type LedgerEvent } from "./ledger.ts";
import { runMutation, type MutationOutcome } from "./mutation.ts";

export interface ApplyPlan {
  runId: string;
  objectiveId: string;
  taskId: string;
  taskRevision: number;
  reviewDecisionId: string;
  patchPath: string;
  /** Empty when the Run is applicable. */
  blockedReason: string;
  /** True when this Run's result is already in the workspace. */
  alreadyApplied: boolean;
}

const readJson = async (target: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Whether this Run may be applied, and why not.
 *
 * Separated from the application so `apply --check` and the mutation precheck
 * ask exactly the same question. A gate that is re-implemented at the point of
 * use is a gate with two answers.
 */
export async function planApply(rootDir: string, runId: string): Promise<ApplyPlan> {
  const runDir = path.join(rootDir, ".codefleet", "runs", runId);
  const blocked = (reason: string, partial: Partial<ApplyPlan> = {}): ApplyPlan => ({
    runId,
    objectiveId: "",
    taskId: "",
    taskRevision: 0,
    reviewDecisionId: "",
    patchPath: path.join(runDir, "git-diff.patch"),
    alreadyApplied: false,
    ...partial,
    blockedReason: reason
  });

  const summary = await readJson(path.join(runDir, "run-summary.json"));
  if (summary === null) {
    return blocked(
      `Run ${runId} has no readable run-summary.json, so there is no record of what it produced.`
    );
  }

  // Find the accepted review. It lives in the Objective ledger, which is where
  // review decisions are authoritative — a local decision file is a candidate
  // for import, not a decision.
  let objectiveIds: string[];
  try {
    const { readdir } = await import("node:fs/promises");
    objectiveIds = await readdir(path.join(rootDir, ".codefleet", "objectives"));
  } catch {
    objectiveIds = [];
  }

  let decision: Record<string, unknown> | null = null;
  let objectiveId = "";
  let applied = false;
  for (const candidate of objectiveIds) {
    const { snapshot } = await replayObjective(rootDir, candidate);
    if (snapshot.replay.replayStatus !== "COMPLETE") {
      return blocked(
        `Objective ${candidate} replayed as ${snapshot.replay.replayStatus}, so its review decisions cannot be read.\n` +
          "A decision that cannot be read is not a decision that was made."
      );
    }
    const { events } = await readEvents(rootDir, candidate);
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      if (payload.runId !== runId) {
        continue;
      }
      if (event.type === "RUN_REVIEW_DECIDED") {
        // The latest decision for this Run wins; a correction supersedes.
        decision = payload;
        objectiveId = candidate;
      } else if (event.type === "RUN_RESULT_APPLIED") {
        applied = true;
        objectiveId = candidate;
      }
    }
  }

  if (decision === null) {
    return blocked(
      [
        `Run ${runId} has no review decision in any Objective ledger.`,
        "",
        "Applying a Run's changes is acting on a decision, so the decision has to exist first:",
        `  codefleet review ${runId} --decision ACCEPTED --reason "..."`,
        `  codefleet objective import-review <objective-id> ${runId}`
      ].join("\n")
    );
  }

  const context = {
    objectiveId,
    taskId: String(decision.taskId ?? ""),
    taskRevision: Number(decision.taskRevision ?? 0),
    reviewDecisionId: String(decision.reviewDecisionId ?? ""),
    alreadyApplied: applied
  };

  if (applied) {
    // Reported rather than refused: the caller decides whether repeating is an
    // error, and the mutation treats it as already applied.
    return { ...blocked("", context), blockedReason: "" };
  }

  if (decision.decision !== "ACCEPTED") {
    return blocked(
      `Run ${runId} was reviewed as ${String(decision.decision)}, not ACCEPTED. Only an accepted Run may be applied.`,
      context
    );
  }

  // Isolation. A Run that edited the workspace directly has already had its
  // effect; there is nothing to move, and applying its diff on top would apply
  // the same change twice. Read from the observation, which records where the
  // edits actually landed rather than which mode was requested.
  const observation = await readJson(path.join(runDir, "harness-observation.json"));
  if (observation === null) {
    return blocked(
      `Run ${runId} has no readable harness-observation.json, so CodeFleet cannot tell where it made its changes.`,
      context
    );
  }
  const isolation = ((observation.workspace ?? {}) as Record<string, unknown>).isolation as
    | Record<string, unknown>
    | undefined;
  if (isolation?.editsInWorkspace !== false) {
    return blocked(
      `Run ${runId} ran without isolation, so its changes are already in the workspace.\n` +
        "There is nothing to apply.",
      context
    );
  }

  // Evidence completeness. A truncated diff is an EVIDENCE_DEFECT and never
  // waivable; applying one would write part of a change and report success.
  const normalization = (summary.normalization ?? {}) as Record<string, unknown>;
  const reasons = Array.isArray(normalization.unavailableReasons)
    ? (normalization.unavailableReasons as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const diffDefect = reasons.find((reason) => reason.includes("TRUNCATED") || reason.includes("DIFF"));
  if (diffDefect !== undefined) {
    return blocked(
      [
        `Run ${runId} produced incomplete diff evidence (${diffDefect}), so its patch does not describe the whole change.`,
        "Applying part of a change is worse than applying none of it. This cannot be waived."
      ].join("\n"),
      context
    );
  }

  const patchPath = path.join(runDir, "git-diff.patch");
  let patch: string;
  try {
    patch = await readFile(patchPath, "utf8");
  } catch {
    return blocked(`Run ${runId} has no readable git-diff.patch, so there is nothing to apply.`, context);
  }
  if (patch.trim().length === 0) {
    return blocked(`Run ${runId} changed nothing. There is no patch to apply.`, context);
  }

  // The workspace must be what the patch was written against. The pre-run
  // snapshot recorded a stateHash over the same scope; if the workspace has
  // moved since, the patch describes content that is no longer there.
  const preRun = await readJson(path.join(runDir, "workspace-pre-run.json"));
  const recordedHash = ((preRun?.stateHash ?? {}) as Record<string, unknown>).value;
  if (typeof recordedHash !== "string" || recordedHash.length === 0) {
    return blocked(
      `Run ${runId} recorded no pre-run state hash, so CodeFleet cannot tell whether the workspace has moved since.\n` +
        "Unknown is not the same as unchanged.",
      context
    );
  }

  return { ...context, runId, patchPath, blockedReason: "" };
}

/**
 * Applies the Run's observed diff to the workspace and records that it happened.
 *
 * `git apply --check` runs first, so a patch that would not apply cleanly is a
 * refusal rather than a partial write. That check is also the conflict
 * detection: a workspace that moved in a way the patch cannot accommodate fails
 * here with git's own account of which hunk did not fit.
 */
export async function applyRunResult(
  rootDir: string,
  input: { runId: string; actorId: string; reason: string }
): Promise<MutationOutcome<LedgerEvent>> {
  const { runId, actorId, reason } = input;
  if (reason.trim().length === 0) {
    throw new Error("RUN_RESULT_APPLIED requires a reason");
  }

  const plan = await planApply(rootDir, runId);
  if (plan.blockedReason.length > 0) {
    throw new Error(plan.blockedReason);
  }

  const patch = await readFile(plan.patchPath, "utf8");
  const patchHash = createHash("sha256").update(patch).digest("hex");

  const git = (args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }> =>
    runCommand("git", args, "", rootDir, {
      limits: { timeoutMs: ISOLATION_COMMAND_TIMEOUT_MS, outputCapBytes: 4 * 1024 * 1024 },
      env: gitProcessEnv()
    });

  return runMutation(
    rootDir,
    {
      mutationKind: "RUN_RESULT_APPLY",
      targetId: plan.objectiveId,
      targetHash: patchHash,
      semanticPayload: { runId, taskId: plan.taskId, taskRevision: plan.taskRevision }
    },
    {
      precheck: async (): Promise<void> => {
        // Asked again inside the lock: the plan was computed before it was held.
        const current = await planApply(rootDir, runId);
        if (current.blockedReason.length > 0) {
          throw new Error(current.blockedReason);
        }
        if (current.alreadyApplied) {
          return;
        }
        const check = await git(["apply", "--check", "--whitespace=nowarn", plan.patchPath]);
        if (check.exitCode !== 0) {
          throw new Error(
            [
              `The patch from ${runId} does not apply to the workspace as it is now.`,
              "Nothing was changed. git reported:",
              ...check.stderr.trim().split("\n").slice(0, 10).map((line) => `  ${line}`),
              "",
              "The Run observed a different starting state. Re-run the Task against the current",
              "workspace rather than forcing this patch onto it."
            ].join("\n")
          );
        }
      },
      isAlreadyApplied: async (): Promise<boolean> => (await planApply(rootDir, runId)).alreadyApplied,
      append: async (mutationId): Promise<LedgerEvent> => {
        const applied = await git(["apply", "--whitespace=nowarn", plan.patchPath]);
        if (applied.exitCode !== 0) {
          // --check passed and the real apply did not. The workspace may now be
          // partially written, so this says so rather than reporting a clean
          // failure it cannot guarantee.
          throw new Error(
            [
              `The patch from ${runId} passed 'git apply --check' and then failed to apply.`,
              "The workspace may be partially changed. Inspect it before doing anything else:",
              `  git status`,
              `  git diff`,
              "",
              ...applied.stderr.trim().split("\n").slice(0, 10).map((line) => `  ${line}`)
            ].join("\n")
          );
        }

        return appendEvent(rootDir, plan.objectiveId, mutationId, "RUN_RESULT_APPLIED", actorId, reason, {
          runId,
          taskId: plan.taskId,
          taskRevision: plan.taskRevision,
          reviewDecisionId: plan.reviewDecisionId,
          patchRef: {
            path: path.relative(rootDir, plan.patchPath).split(path.sep).join("/"),
            hash: patchHash
          }
        });
      },
      rebuild: async (): Promise<void> => {
        const { rebuildSnapshot } = await import("./ledger.ts");
        await rebuildSnapshot(rootDir, plan.objectiveId);
      },
      postcheck: async (): Promise<void> => {
        const after = await planApply(rootDir, runId);
        if (!after.alreadyApplied) {
          throw new Error(`the workspace was changed but ${runId} is not recorded as applied`);
        }
        // The Objective directory has to still be readable, or the record of
        // what just happened to the workspace is unreachable.
        await readEvents(rootDir, path.basename(objectiveDir(rootDir, plan.objectiveId)));
      }
    }
  );
}
