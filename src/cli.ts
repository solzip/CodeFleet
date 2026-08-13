#!/usr/bin/env node
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { initProject, loadConfig } from "./config.ts";
import {
  attachTask,
  createObjective,
  importLocalReview,
  detectDrift,
  rebuildSnapshot,
  reorderQueue,
  replayObjective,
  transitionQueueItem,
  type ObjectiveKind,
  type QueueTransitionEvent
} from "./ledger.ts";
import { applyRunResult, planApply } from "./apply.ts";
import { breakLock, lockPathFor, readHolder } from "./mutation.ts";
import { renderPrompt } from "./prompt.ts";
import { reviewRun, type ReviewDecision } from "./review.ts";
import { breakRunLock, listRunLocks, resolveContractForPrompt, runTask, listRuns } from "./run.ts";
import { formatValidationErrors, loadTaskForValidation } from "./task.ts";
import {
  approveTask,
  contentHashOf,
  deriveDraftState,
  deriveRevisionStates,
  invalidateApproval,
  readTaskEvents,
  replayApproval
} from "./task-ledger.ts";
import { listTaskRevisions, readTaskRevision } from "./task-revision.ts";
import { discoverWorkspace, type WorkspaceDiscovery } from "./workspace.ts";

interface CliOptions {
  workspace?: string;
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseGlobalOptions(argv);
  const [command, ...args] = parsed.args;
  const cwd = process.cwd();

  try {
    switch (command) {
      case "init":
        await handleInit(cwd, parsed.options);
        return 0;
      case "run":
        await handleRun(cwd, parsed.options, requireArg(args[0], "task-id"), args.slice(1));
        return 0;
      case "prompt":
        await handlePrompt(cwd, parsed.options, requireArg(args[0], "task-id"));
        return 0;
      case "task":
        await handleTask(cwd, parsed.options, args);
        return 0;
      case "status":
        await handleStatus(cwd, parsed.options);
        return 0;
      case "runs":
        await handleRuns(cwd, parsed.options);
        return 0;
      case "apply":
        await handleApply(cwd, parsed.options, args);
        return 0;
      case "review":
        await handleReview(cwd, parsed.options, args);
        return 0;
      case "objective":
        await handleObjective(cwd, parsed.options, args);
        return 0;
      case "lock":
        await handleLock(cwd, parsed.options, args);
        return 0;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        return 0;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function handleInit(cwd: string, options: CliOptions): Promise<void> {
  const rootDir = options.workspace === undefined ? cwd : path.resolve(cwd, options.workspace);
  const result = await initProject(rootDir);
  console.log("CodeFleet initialized.");
  console.log(`directory: ${path.relative(rootDir, result.codefleetDir) || "."}`);
  console.log(`config: ${result.createdConfig ? "created" : "already exists"}`);
}

async function handleRun(cwd: string, options: CliOptions, taskId: string, argv: string[] = []): Promise<void> {
  const discovery = await workspaceDiscovery(cwd, options);
  const rootDir = discovery.selectedWorkspaceRootRealPath;
  // Run Options are inputs to this request and are not written back anywhere,
  // so they are read from argv rather than from the Profile.
  const flags = parseReviewFlags(argv);
  const execution = await runTask(rootDir, taskId, discovery, {
    agentAdapter: flags.adapter
  });
  console.log("CodeFleet run complete.");
  console.log(`runId: ${execution.result.runId}`);
  console.log(`taskId: ${execution.result.taskId}`);
  console.log(`agent: ${execution.result.agent}`);
  console.log(`status: ${execution.result.status}`);
  console.log(`runDir: ${path.relative(rootDir, execution.runDir)}`);
  console.log(`runPlan: ${execution.result.runPlanPath}`);
  console.log(`adapterRequest: ${execution.result.adapterRequestPath}`);
  console.log(`harnessObservation: ${execution.result.harnessObservationPath}`);
  console.log(`adapterResult: ${execution.result.adapterResultPath}`);
  console.log(`result: ${execution.result.resultPath}`);
}

// Reintegration is an explicit act with a ledger entry, not a side effect of an
// ACCEPTED review. Isolation exists so an agent's work does not reach the
// workspace without somebody deciding it should, and folding the two together
// would remove the decision this command exists to record.
async function handleApply(cwd: string, options: CliOptions, args: string[]): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  const runId = requireArg(args[0], "run-id");
  const flags = parseReviewFlags(args.slice(1));

  // --check answers "would this apply" without touching anything, through the
  // same planner the mutation uses. A preview computed a second way is a
  // preview of something else.
  if (args.includes("--check")) {
    const plan = await planApply(rootDir, runId);
    console.log(`run: ${runId}`);
    console.log(`objective: ${plan.objectiveId || "(none)"}`);
    console.log(`task: ${plan.taskId || "(none)"} revision ${plan.taskRevision}`);
    console.log(`alreadyApplied: ${plan.alreadyApplied ? "yes" : "no"}`);
    console.log(`applicable: ${plan.blockedReason.length === 0 ? "yes" : "no"}`);
    if (plan.blockedReason.length > 0) {
      console.log("");
      console.log(plan.blockedReason);
    }
    return;
  }

  const outcome = await applyRunResult(rootDir, {
    runId,
    actorId: flags.actor ?? "local-user",
    reason: requireArg(flags.reason, "--reason")
  });
  reportOutcome(outcome, `applied ${runId} to the workspace`);
}

// The preview and the delegation resolve the same contract through the same
// code. Rendering the Task file's own fields here showed a document the Run
// never sends: no role, no ceiling, no Objective context, and no statement of
// what the Harness will execute — the three things that make a prompt a
// delegation rather than a description. P1-53.
async function handlePrompt(cwd: string, options: CliOptions, taskId: string): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  // Throws when the contract cannot be resolved. Nothing is written on that
  // path: a prompt nobody approved is worse than no prompt.
  const { task, contract, taskRevision } = await resolveContractForPrompt(rootDir, taskId);
  const promptDir = path.join(rootDir, ".codefleet", "prompts");
  const promptPath = path.join(promptDir, `${taskId}.md`);
  await mkdir(promptDir, { recursive: true });
  await writeFile(promptPath, renderPrompt(task, contract), "utf8");
  console.log(`Prompt written: ${path.relative(rootDir, promptPath)}`);
  console.log(`taskRevision: ${taskRevision ?? "(none)"}`);
  console.log(`role: ${contract.roleId} (effective mode ${contract.effectiveMode})`);
}

async function handleTask(cwd: string, options: CliOptions, args: string[]): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  const [subcommand, taskId] = args;
  const id = requireArg(taskId, "task-id");
  await loadConfig(rootDir);

  if (subcommand === "validate") {
    const { validation } = await loadTaskForValidation(rootDir, id);
    if (validation.errors.length > 0) {
      throw new Error(formatValidationErrors(id, validation));
    }
    console.log(`Task is valid: ${id}`);
    for (const warning of validation.warnings) {
      console.log(`warning: ${warning}`);
    }
    return;
  }

  if (subcommand === "approve" || subcommand === "invalidate") {
    const { taskPath, validation } = await loadTaskForValidation(rootDir, id);
    if (subcommand === "approve" && validation.errors.length > 0) {
      // An invalid Task cannot become an executable contract.
      throw new Error(formatValidationErrors(id, validation));
    }
    const flags = parseReviewFlags(args.slice(2));
    const reason = requireArg(flags.reason, "--reason");
    const actorId = flags.actor ?? "local-user";
    const outcome =
      subcommand === "approve"
        ? await approveTask(rootDir, { taskId: id, taskPath, actorId, reason })
        : await invalidateApproval(rootDir, { taskId: id, taskPath, actorId, reason });
    reportOutcome(outcome, `${subcommand}d: ${id}`);
    return;
  }

  if (subcommand === "status") {
    const { taskPath } = await loadTaskForValidation(rootDir, id);
    const state = await replayApproval(rootDir, id, await contentHashOf(taskPath));
    console.log(`task: ${id}`);

    // Draft state and Revision state are separate models in the design, and
    // collapsing them is what made "why can I not approve this" unanswerable.
    const draft = await deriveDraftState(rootDir, id);
    console.log(`draftState: ${draft.state}`);
    for (const reason of draft.reasons) {
      for (const line of reason.split("\n")) {
        console.log(`  ${line}`);
      }
    }

    const revisions = deriveRevisionStates(await readTaskEvents(rootDir, id));
    const stored = new Set(await listTaskRevisions(rootDir, id));
    if (revisions.length === 0) {
      console.log("revisions: (none)");
    } else {
      console.log("revisions:");
      for (const revision of revisions) {
        // A revision with no stored contract is called out rather than listed
        // as if it could be recovered.
        const artifact = stored.has(revision.taskRevision) ? "contract stored" : "contract not stored";
        console.log(
          `  ${revision.taskRevision}  ${revision.state.padEnd(12)} ${revision.revisionHash.slice(0, 12)}  ` +
            `${revision.approvedBy || "(none)"}  ${artifact}`
        );
      }
    }

    console.log(`latestRevision: ${state.latestRevision}`);
    console.log(`approvedRevision: ${state.approvedRevision ?? "(none)"}`);
    console.log(`approvedBy: ${state.approvedBy || "(none)"}`);
    console.log(`executable: ${state.blockedReason.length === 0 ? "yes" : `no (${state.blockedReason})`}`);
    return;
  }

  // The approved contract, recovered from the artifact rather than from the
  // working file. Without this an edited Task left no way to read what was
  // approved, only a hash to compare it against. P1-38.
  if (subcommand === "revision") {
    const revisions = await listTaskRevisions(rootDir, id);
    const requested = args[2];
    if (requested === undefined) {
      if (revisions.length === 0) {
        console.log(`no stored revisions for ${id}`);
        return;
      }
      console.log(revisions.join("\n"));
      return;
    }
    const number = Number.parseInt(requested, 10);
    if (!Number.isInteger(number)) {
      throw new Error(`revision must be a number; got ${requested}`);
    }
    const document = await readTaskRevision(rootDir, id, number);
    if (args.includes("--json")) {
      console.log(JSON.stringify(document, null, 2));
      return;
    }
    process.stdout.write(document.contract.source);
    return;
  }

  throw new Error("Usage: codefleet task validate|approve|invalidate|status|revision <task-id> [revision] [--json]");
}

async function handleStatus(cwd: string, options: CliOptions): Promise<void> {
  const discovery = await discoverWorkspace({ cwd, workspace: options.workspace });
  const rootDir = discovery.selectedWorkspaceRootRealPath;
  const config = await loadConfig(rootDir);
  const tasks = await listYamlFiles(path.join(rootDir, ".codefleet", "tasks"));
  const runs = await listRuns(rootDir);

  console.log("CodeFleet status");
  console.log(`schemaVersion: ${config.schemaVersion}`);
  console.log(`agentAdapter: ${config.agentAdapter}`);
  console.log(`harnessMode: ${config.harnessMode}`);
  console.log(`isolationMode: ${config.isolationMode}`);
  console.log(`workspace: ${discovery.workspaceId}`);
  console.log(`discovery: ${discovery.discoveryMode}`);
  console.log(`tasks: ${tasks.length}`);
  console.log(`runs: ${runs.length}`);
}

async function handleRuns(cwd: string, options: CliOptions): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  await loadConfig(rootDir);
  const runs = await listRuns(rootDir);
  if (runs.length === 0) {
    console.log("No runs found.");
    return;
  }

  for (const run of runs) {
    console.log(`${run.runId}  ${run.status}  ${run.taskId}  ${run.agent}`);
  }
}

async function handleReview(cwd: string, options: CliOptions, args: string[]): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  await loadConfig(rootDir);

  const runId = requireArg(args[0], "run-id");
  const flags = parseReviewFlags(args.slice(1));
  const decision = requireArg(flags.decision, "--decision") as ReviewDecision;
  const reason = requireArg(flags.reason, "--reason");

  const execution = await reviewRun(rootDir, runId, {
    decision,
    reason,
    actorId: flags.actor,
    noteRef: flags.note,
    aiReviewRef: flags.aiReviewFile,
    supersedesLocalReviewId: flags.supersedes,
    waivedGaps: flags.waiveGap === undefined ? [] : flags.waiveGap.split(",").map((v) => v.trim()).filter((v) => v.length > 0),
    waiveJustification: flags.waiveReason
  });

  console.log("CodeFleet local review recorded.");
  console.log(`runId: ${execution.runId}`);
  console.log(`reviewDecisionId: ${execution.reviewDecisionId}`);
  console.log(`decision: ${execution.decision}`);
  console.log(`bundleStatus: ${execution.bundleStatus}`);
  console.log(`evidenceCompleteness: ${execution.evidenceCompleteness}`);
  console.log(`localReviewStatus: ${execution.localReviewStatus}`);
  console.log(`evidenceBundle: ${execution.bundlePath}`);
  console.log(`localReview: ${execution.localReviewPath}`);
  console.log("note: local review is migration input, not final decision truth.");
}

async function handleObjective(cwd: string, options: CliOptions, args: string[]): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  await loadConfig(rootDir);
  const [subcommand, objectiveId] = args;

  if (subcommand === "create") {
    const id = requireArg(objectiveId, "objective-id");
    const flags = parseReviewFlags(args.slice(2));
    const outcome = await createObjective(rootDir, {
      objectiveId: id,
      title: requireArg(flags.title, "--title"),
      kind: (flags.kind ?? "ONE_OFF") as ObjectiveKind,
      actorId: flags.actor ?? "local-user",
      reason: flags.reason ?? "objective created"
    });

    console.log(`mutationId: ${outcome.mutationId}`);
    if (outcome.alreadyApplied) {
      console.log("already applied; no new ledger event appended");
      return;
    }
    if (outcome.failedPhase !== null) {
      // A failure after M4 keeps the event; the command still reports the phase.
      throw new Error(
        `${outcome.failedPhase} failed: ${outcome.failureMessage}` +
          (outcome.applied ? " (ledger event was appended and is kept)" : "")
      );
    }
    console.log(`objective: ${id}`);
    console.log(`event: ${outcome.result?.eventId} seq=${outcome.result?.seq}`);
    console.log(`ledger: .codefleet/objectives/${id}/ledger.jsonl`);
    console.log(`snapshot: .codefleet/objectives/${id}/objective.json`);
    return;
  }

  if (subcommand === "attach") {
    const id = requireArg(objectiveId, "objective-id");
    const taskId = requireArg(args[2], "task-id");
    const flags = parseReviewFlags(args.slice(3));
    const { taskPath } = await loadTaskForValidation(rootDir, taskId);

    // The revision and its hash come from the Task ledger, not from the working
    // file. Defaulting to revision 1 and hashing whatever is on disk produced a
    // pair that agreed with each other and with nothing else; attachTask now
    // checks them against the ledger, so guessing them here only moves the
    // refusal later.
    const state = await replayApproval(rootDir, taskId, await contentHashOf(taskPath));
    const requested = flags.revision === undefined ? state.approvedRevision : Number(flags.revision);
    if (requested === null || !Number.isInteger(requested)) {
      throw new Error(
        `Cannot attach ${taskId}: it has no approved revision to attach.\n` +
          `Approve it first — 'codefleet task approve ${taskId} --reason ...' — or name one with --revision.`
      );
    }
    const events = await readTaskEvents(rootDir, taskId);
    const created = events.find(
      (event) => event.type === "TASK_REVISION_CREATED" && event.taskRevision === requested
    );

    const outcome = await attachTask(rootDir, {
      objectiveId: id,
      taskId,
      taskRevision: requested,
      taskRevisionHash: created?.revisionHash ?? "",
      actorId: flags.actor ?? "local-user",
      reason: flags.reason ?? "task attached"
    });
    reportOutcome(outcome, `attached ${taskId} to ${id}`);
    return;
  }

  const transitions: Record<string, QueueTransitionEvent> = {
    block: "QUEUE_ITEM_BLOCKED",
    unblock: "QUEUE_ITEM_UNBLOCKED",
    skip: "QUEUE_ITEM_SKIPPED",
    unskip: "QUEUE_ITEM_UNSKIPPED",
    "cancel-item": "QUEUE_ITEM_CANCELED"
  };
  if (subcommand !== undefined && transitions[subcommand] !== undefined) {
    const id = requireArg(objectiveId, "objective-id");
    const itemId = requireArg(args[2], "queue-item-id");
    const flags = parseReviewFlags(args.slice(3));
    const outcome = await transitionQueueItem(rootDir, {
      objectiveId: id,
      objectiveQueueItemId: itemId,
      type: transitions[subcommand],
      actorId: flags.actor ?? "local-user",
      reason: requireArg(flags.reason, "--reason")
    });
    reportOutcome(outcome, `${subcommand}: ${itemId}`);
    return;
  }

  if (subcommand === "reorder") {
    const id = requireArg(objectiveId, "objective-id");
    const flags = parseReviewFlags(args.slice(2));
    const order = requireArg(flags.order, "--order").split(",").map((v) => v.trim()).filter((v) => v.length > 0);
    const outcome = await reorderQueue(rootDir, {
      objectiveId: id,
      futureOrder: order,
      actorId: flags.actor ?? "local-user",
      reason: requireArg(flags.reason, "--reason")
    });
    reportOutcome(outcome, `reordered ${id}`);
    return;
  }

  if (subcommand === "import-review") {
    const id = requireArg(objectiveId, "objective-id");
    const runId = requireArg(args[2], "run-id");
    const flags = parseReviewFlags(args.slice(3));

    const { readFile } = await import("node:fs/promises");
    const { createHash } = await import("node:crypto");
    const localPath = path.join(rootDir, ".codefleet", "runs", runId, "review-decision.local.json");
    const raw = await readFile(localPath, "utf8");
    const outcome = await importLocalReview(rootDir, {
      objectiveId: id,
      runId,
      localReview: JSON.parse(raw) as Record<string, unknown>,
      localReviewRef: {
        path: `.codefleet/runs/${runId}/review-decision.local.json`,
        hash: createHash("sha256").update(raw).digest("hex")
      },
      reason: flags.reason ?? "imported local review",
      actorId: flags.actor ?? "local-user"
    });
    reportOutcome(outcome, `imported review for ${runId} into ${id}`);
    return;
  }

  if (subcommand === "status") {
    const id = requireArg(objectiveId, "objective-id");
    const { snapshot } = await replayObjective(rootDir, id);
    const drift = await detectDrift(rootDir, id);
    console.log(`objective: ${snapshot.objectiveId}`);
    console.log(`title: ${snapshot.title}`);
    console.log(`status: ${snapshot.status}`);
    console.log(`kind: ${snapshot.kind}`);
    console.log(`replayStatus: ${snapshot.replay.replayStatus}`);
    console.log(`lastSeq: ${snapshot.replay.lastSeq}`);
    console.log(`drift: ${drift === null ? "none" : `${drift.checkId} — ${drift.detail}`}`);
    console.log(`cursor: ${snapshot.cursor.objectiveQueueItemId || "(none)"}`);
    if (snapshot.queue.length === 0) {
      console.log("queue: (empty)");
    } else {
      console.log("queue:");
      for (const item of snapshot.queue) {
        console.log(`  ${item.objectiveQueueItemId}  ${item.storedState}/${item.derivedState}`);
      }
    }
    for (const finding of snapshot.replay.findings) {
      console.log(`finding: ${finding.failureClass} ${finding.checkId} — ${finding.detail}`);
    }
    return;
  }

  // NEXT is already derived by replay; these two only surface it and act on it
  // once. The design is explicit that DONE does not advance a queue by itself —
  // "stop and wait for review" — so there is deliberately no loop here. A
  // command that kept going would be the auto-advance the design refuses.
  if (subcommand === "next" || subcommand === "run-next") {
    const id = requireArg(objectiveId, "objective-id");
    const { snapshot } = await replayObjective(rootDir, id);
    if (snapshot.replay.replayStatus !== "COMPLETE") {
      throw new Error(
        `Objective ${id} replayed as ${snapshot.replay.replayStatus}, so its queue cannot be read.\n` +
          `Run 'codefleet objective status ${id}' for the findings.`
      );
    }

    const next = snapshot.queue.find((item) => item.derivedState === "NEXT");
    if (next === undefined) {
      // Why there is no NEXT matters more than the fact of it: a queue waiting
      // on a review and a queue that is finished look the same otherwise.
      const waitingOnReview = snapshot.queue.filter(
        (item) => item.derivedState === "DONE" || item.derivedState === "FAILED"
      );
      console.log(`objective: ${id}`);
      console.log("next: (none)");
      if (waitingOnReview.length > 0) {
        console.log(
          `${waitingOnReview.length} item(s) are awaiting review. A Run that succeeded does not advance the`
        );
        console.log("queue on its own — review it, and the next item becomes NEXT:");
        for (const item of waitingOnReview) {
          console.log(`  codefleet review <run-id> --decision ACCEPTED --reason "..."   # ${item.objectiveQueueItemId}`);
        }
      }
      return;
    }

    console.log(`objective: ${id}`);
    console.log(`next: ${next.objectiveQueueItemId}`);
    console.log(`taskId: ${next.taskId}`);
    console.log(`taskRevision: ${next.taskRevision}`);

    // A Run leaves no mark on the queue until a review is imported, so an item
    // that has already run looks exactly like one that never started. Without
    // this, run-next repeated would keep re-running the same item and nothing
    // would say so.
    const priorRuns = (await listRuns(rootDir)).filter((run) => run.taskId === next.taskId);
    if (priorRuns.length > 0) {
      console.log(`priorRuns: ${priorRuns.length}`);
      for (const run of priorRuns.slice(-3)) {
        console.log(`  ${run.runId}  ${run.status}`);
      }
      console.log("The queue does not move until one of these is reviewed. Running again starts a new Run.");
    }

    if (subcommand === "next") {
      return;
    }

    const flags = parseReviewFlags(args.slice(2));
    const discovery = await workspaceDiscovery(cwd, options);
    const execution = await runTask(discovery.selectedWorkspaceRootRealPath, next.taskId, discovery, {
      agentAdapter: flags.adapter
    });
    console.log(`runId: ${execution.result.runId}`);
    console.log(`status: ${execution.result.status}`);
    console.log(`runDir: ${path.relative(rootDir, execution.runDir)}`);
    console.log("");
    console.log("This ran one item and stopped. Review it before the queue moves on.");
    return;
  }

  if (subcommand === "rebuild") {
    const id = requireArg(objectiveId, "objective-id");
    const snapshot = await rebuildSnapshot(rootDir, id);
    console.log(`rebuilt: ${id} (replayStatus ${snapshot.replay.replayStatus}, lastSeq ${snapshot.replay.lastSeq})`);
    return;
  }

  throw new Error(
    "Usage: codefleet objective create|attach|block|unblock|skip|unskip|cancel-item|reorder|status|next|run-next|rebuild <objective-id>"
  );
}

function reportOutcome(
  outcome: { mutationId: string; alreadyApplied: boolean; failedPhase: string | null; failureMessage: string; applied: boolean },
  successLine: string
): void {
  console.log(`mutationId: ${outcome.mutationId}`);
  if (outcome.alreadyApplied) {
    console.log("already applied; no new ledger event appended");
    return;
  }
  if (outcome.failedPhase !== null) {
    throw new Error(
      `${outcome.failedPhase} failed: ${outcome.failureMessage}` +
        (outcome.applied ? " (ledger event was appended and is kept)" : "")
    );
  }
  console.log(successLine);
}

async function handleLock(cwd: string, options: CliOptions, args: string[]): Promise<void> {
  const rootDir = await workspaceRoot(cwd, options);
  const [subcommand] = args;

  if (subcommand === "status") {
    const holder = await readHolder(lockPathFor(rootDir));
    console.log(holder === null ? "lock: free" : `lock: held by pid ${holder.pid} on ${holder.host} since ${holder.startedAt} (${holder.mutationKind})`);

    // Run locks are per Task and separate from the mutation lock. Reporting the
    // count says nothing was found rather than leaving nothing examined and
    // nothing found looking the same.
    const runLocks = await listRunLocks(rootDir);
    console.log(`run locks: ${runLocks.length}`);
    for (const { taskId, holder } of runLocks) {
      console.log(
        holder === null
          ? `  ${taskId}: present but unreadable, and it still blocks runs`
          : `  ${taskId}: pid ${holder.pid} on ${holder.host} since ${holder.startedAt}` +
            ` (${holder.runId || "before the runId was reserved"})`
      );
    }
    return;
  }
  if (subcommand === "break") {
    const taskId = parseReviewFlags(args.slice(1)).task;
    if (taskId !== undefined) {
      const broken = await breakRunLock(rootDir, taskId);
      console.log(
        broken === null
          ? `no run lock to break for ${taskId}`
          : broken.holder === null
            ? `broke unreadable run lock for ${taskId}`
            : `broke run lock for ${broken.taskId} held by pid ${broken.holder.pid}`
      );
      return;
    }
    const holder = await breakLock(rootDir);
    console.log(holder === null ? "no lock to break" : `broke lock held by pid ${holder.pid} (${holder.mutationKind})`);
    return;
  }

  throw new Error("Usage: codefleet lock status|break [--task <task-id>]");
}

interface ReviewFlags {
  decision?: string;
  reason?: string;
  actor?: string;
  note?: string;
  aiReviewFile?: string;
  supersedes?: string;
  waiveGap?: string;
  waiveReason?: string;
  title?: string;
  kind?: string;
  revision?: string;
  order?: string;
  task?: string;
  adapter?: string;
}

function parseReviewFlags(argv: string[]): ReviewFlags {
  const flags: ReviewFlags = {};
  const names: Record<string, keyof ReviewFlags> = {
    "--decision": "decision",
    "--reason": "reason",
    "--actor": "actor",
    "--note": "note",
    "--ai-review-file": "aiReviewFile",
    "--supersedes": "supersedes",
    "--waive-gap": "waiveGap",
    "--waive-reason": "waiveReason",
    "--title": "title",
    "--kind": "kind",
    "--revision": "revision",
    "--order": "order",
    "--task": "task",
    "--adapter": "adapter"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const key = names[value];
    if (key !== undefined) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing required value for ${value}`);
      }
      flags[key] = next;
      index += 1;
      continue;
    }

    const eq = value.indexOf("=");
    if (value.startsWith("--") && eq > 0) {
      const flagKey = names[value.slice(0, eq)];
      if (flagKey !== undefined) {
        const flagValue = value.slice(eq + 1);
        if (flagValue.length === 0) {
          throw new Error(`Missing required value for ${value.slice(0, eq)}`);
        }
        flags[flagKey] = flagValue;
        continue;
      }
    }

    throw new Error(`Unknown option for review: ${value}`);
  }

  return flags;
}

async function workspaceRoot(cwd: string, options: CliOptions): Promise<string> {
  return (await workspaceDiscovery(cwd, options)).selectedWorkspaceRootRealPath;
}

async function workspaceDiscovery(cwd: string, options: CliOptions): Promise<WorkspaceDiscovery> {
  return discoverWorkspace({ cwd, workspace: options.workspace });
}

function parseGlobalOptions(argv: string[]): { args: string[]; options: CliOptions } {
  const args: string[] = [];
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--workspace") {
      const workspace = argv[index + 1];
      if (workspace === undefined || workspace.startsWith("--")) {
        throw new Error("Missing required value for --workspace");
      }
      options.workspace = workspace;
      index += 1;
      continue;
    }
    if (value.startsWith("--workspace=")) {
      const workspace = value.slice("--workspace=".length);
      if (workspace.length === 0) {
        throw new Error("Missing required value for --workspace");
      }
      options.workspace = workspace;
      continue;
    }
    args.push(value);
  }

  return { args, options };
}

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith(".yaml") || entry.endsWith(".yml"));
  } catch {
    return [];
  }
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function printHelp(): void {
  console.log(`CodeFleet v0.1

Usage:
  codefleet [--workspace <path>] init
  codefleet [--workspace <path>] run <task-id>
  codefleet [--workspace <path>] prompt <task-id>
  codefleet [--workspace <path>] task validate|status <task-id>
  codefleet [--workspace <path>] task approve|invalidate <task-id> --reason <text>
  codefleet [--workspace <path>] status
  codefleet [--workspace <path>] runs
  codefleet [--workspace <path>] objective create <id> --title <text> [--kind ONE_OFF|SEQUENCE|WORKSTREAM]
  codefleet [--workspace <path>] objective attach <id> <task-id> [--revision N]
  codefleet [--workspace <path>] apply <run-id> --reason "..." [--check]
  codefleet [--workspace <path>] objective next <id>
  codefleet [--workspace <path>] objective run-next <id> [--adapter <adapter-id>]
  codefleet [--workspace <path>] objective block|unblock|skip|unskip|cancel-item <id> <queue-item-id> --reason <text>
  codefleet [--workspace <path>] objective import-review <id> <run-id> --reason <text>
  codefleet [--workspace <path>] objective reorder <id> --order <id,id> --reason <text>
  codefleet [--workspace <path>] objective status <id>
  codefleet [--workspace <path>] objective rebuild <id>
  codefleet [--workspace <path>] lock status|break [--task <task-id>]
  codefleet [--workspace <path>] review <run-id> --decision <ACCEPTED|REJECTED|NEEDS_CHANGES> --reason <text>

Review options:
  --actor <actorId>
  --note <path>
  --ai-review-file <path>
  --supersedes <localReviewId>
  --waive-gap <REASON[,REASON]>   accept responsibility for a capability gap
  --waive-reason <text>           what you checked instead

Notes:
  Run 'codefleet init' before other commands.
  Tasks are read from .codefleet/tasks/<task-id>.yaml.
  Commands discover .codefleet/config.json from the current directory or --workspace.
  review writes review-decision.local.json as migration input for a future
  RUN_REVIEW_DECIDED ledger event. It never produces VERIFIED or queue progression.
`);
}

const exitCode = await main(process.argv.slice(2));
process.exitCode = exitCode;
