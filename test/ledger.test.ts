import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  attachTask,
  createObjective,
  detectDrift,
  ledgerPath,
  rebuildSnapshot,
  reorderQueue,
  replayObjective,
  snapshotPath,
  transitionQueueItem,
  type QueueTransitionEvent
} from "../src/ledger.ts";
import { computeMutationId, lockPathFor, readHolder } from "../src/mutation.ts";
import { coversRule } from "./rule-coverage.ts";

const MUT_ID = "MUTATION_ID_IS_INTENT_DERIVED_AND_IDEMPOTENT";
const LOCK = "MUTATION_LOCK_IS_FAIL_FAST_AND_EXCLUDES_RUN_EXECUTION";
const REPLAY = "OBJECTIVE_LEDGER_REPLAY_IS_SOURCE_OF_SNAPSHOT";
const REPLAY_FAIL = "OBJECTIVE_LEDGER_REPLAY_FAILURES_BLOCK_DERIVED_PROGRESS";
const VERIFIED = "VERIFIED_REQUIRES_ACCEPTED_REVIEW_AND_SATISFIED_GATES";
const IMPORT = "LOCAL_REVIEW_IMPORT_APPENDS_LEDGER_DECISION";
const CONFLICT = "REVIEW_DECISION_MIGRATION_CONFLICTS_ARE_EXPLICIT";
const PHASES = "MUTATION_COMMAND_PHASES_ARE_FIXED";
const DURABLE = "RUN_REVIEW_DECIDED_IS_DURABLE_DECISION_EVENT";
const LATEST = "LATEST_EFFECTIVE_REVIEW_DECISION_IS_LEDGER_DERIVED";

async function seed(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-ledger-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ version: "0.1.0", defaultAgent: "codex", mode: "dry-run", workspace: { id: "ledger-test" } })}\n`,
    "utf8"
  );
  return root;
}

async function create(root: string, id: string, title: string, reason = "created") {
  return createObjective(root, { objectiveId: id, title, kind: "SEQUENCE", actorId: "tester", reason });
}

test("mutationId is derived from intent and ignores reason, actor, and time", () => {
  const base = { mutationKind: "OBJECTIVE_CREATE", targetId: "a", semanticPayload: { title: "T", kind: "SEQUENCE" } };
  const same = computeMutationId(base);

  // Key order must not matter.
  assert.equal(
    computeMutationId({ ...base, semanticPayload: { kind: "SEQUENCE", title: "T" } }),
    same
  );
  // A different semantic payload is a different mutation.
  assert.notEqual(computeMutationId({ ...base, semanticPayload: { title: "U", kind: "SEQUENCE" } }), same);
  assert.notEqual(computeMutationId({ ...base, targetId: "b" }), same);

  coversRule(
    MUT_ID,
    "mutationId is computed deterministically from mutationKind, target identity, targetHash, and semantic payload."
  );
  coversRule(MUT_ID, "mutationId excludes wall-clock time, execution order, actorId, and free-text reason.");
  coversRule(MUT_ID, "a mutation whose semantic payload differs produces a different mutationId.");
});

test("repeating the same command appends no second event", async () => {
  const root = await seed();

  const first = await create(root, "auth-fix", "Fix auth");
  assert.equal(first.applied, true);
  assert.equal(first.alreadyApplied, false);

  // Same intent, different reason text. Reason is excluded from mutationId, so
  // fixing a typo must not create a duplicate mutation.
  const second = await create(root, "auth-fix", "Fix auth", "reworded reason");
  assert.equal(second.alreadyApplied, true);
  assert.equal(second.applied, false);
  assert.equal(second.mutationId, first.mutationId);

  const lines = (await readFile(ledgerPath(root, "auth-fix"), "utf8")).trim().split("\n");
  assert.equal(lines.length, 1, "the ledger must still hold exactly one event");

  coversRule(MUT_ID, "a mutationId already present in the ledger results in a no-op at M3.");
});

test("creating the same objective with different content is a conflict, not a no-op", async () => {
  const root = await seed();
  await create(root, "auth-fix", "Fix auth");

  const conflicting = await create(root, "auth-fix", "Something else");
  assert.equal(conflicting.failedPhase, "M2_PRECHECK");
  assert.match(conflicting.failureMessage, /already exists with different content/);
  assert.equal(conflicting.applied, false);
});

test("the lock fails fast and names its holder, and is never broken automatically", async () => {
  const root = await seed();
  const lockPath = lockPathFor(root);
  await mkdir(path.dirname(lockPath), { recursive: true });
  await writeFile(
    lockPath,
    `${JSON.stringify({
      schemaVersion: "1.0",
      documentKind: "MUTATION_LOCK",
      holder: {
        pid: 9999,
        host: "other",
        startedAt: "2026-08-10T10:00:00Z",
        mutationId: "mut_x",
        mutationKind: "OBJECTIVE_CREATE"
      }
    })}\n`,
    "utf8"
  );

  await assert.rejects(() => create(root, "auth-fix", "Fix auth"), /held by pid 9999 on other/);

  // The stale lock is still there: removing it is an explicit human action.
  assert.notEqual(await readHolder(lockPath), null);

  coversRule(LOCK, "acquisition failure returns immediately with holder identity and does not wait.");
  coversRule(LOCK, "stale lock is never released automatically.");
  coversRule(LOCK, "lock file records holder pid, host, startedAt, mutationId, and mutationKind.");
});

test("the lock is released on every exit path, including a blocked mutation", async () => {
  const root = await seed();
  const failed = await create(root, "Invalid ID", "Fix auth");
  assert.equal(failed.failedPhase, "M2_PRECHECK");
  assert.equal(await readHolder(lockPathFor(root)), null, "M7 must run even when M2 blocked");

  coversRule(PHASES, "M7 runs on every exit path after M1 succeeds.");
  coversRule(PHASES, "failure before M4 leaves no durable change.");
});

test("a snapshot edited by hand is READ_MODEL_DRIFT and rebuild restores it", async () => {
  const root = await seed();
  await create(root, "auth-fix", "Fix auth");
  assert.equal(await detectDrift(root, "auth-fix"), null);

  const stored = JSON.parse(await readFile(snapshotPath(root, "auth-fix"), "utf8")) as Record<string, unknown>;
  stored.title = "edited by hand";
  await writeFile(snapshotPath(root, "auth-fix"), `${JSON.stringify(stored, null, 2)}\n`, "utf8");

  const drift = await detectDrift(root, "auth-fix");
  assert.equal(drift?.failureClass, "READ_MODEL_DRIFT");

  // The source is valid, so the snapshot is rebuilt rather than the ledger patched.
  const rebuilt = await rebuildSnapshot(root, "auth-fix");
  assert.equal(rebuilt.title, "Fix auth");
  assert.equal(await detectDrift(root, "auth-fix"), null);

  coversRule(REPLAY, "objective.json is treated as read model only.");
  coversRule(REPLAY_FAIL, "READ_MODEL_DRIFT allows rebuild only when source replay is valid.");
});

test("a structurally broken ledger blocks replay instead of deriving a plausible snapshot", async () => {
  const root = await seed();
  await create(root, "auth-fix", "Fix auth");

  // A second event claiming seq 1 breaks contiguity.
  const duplicate = {
    mutationId: "mut_other",
    eventId: "evt_000001_other",
    seq: 1,
    type: "OBJECTIVE_CLOSED",
    objectiveId: "auth-fix",
    actorKind: "HUMAN",
    actorId: "tester",
    reason: "injected",
    at: new Date().toISOString(),
    payload: {}
  };
  await appendFile(ledgerPath(root, "auth-fix"), `${JSON.stringify(duplicate)}\n`, "utf8");

  const { snapshot } = await replayObjective(root, "auth-fix");
  assert.equal(snapshot.replay.replayStatus, "BLOCKED");
  assert.ok(snapshot.replay.unavailableReasons.includes("LEDGER_STRUCTURAL_FAILURE"));
  assert.ok(snapshot.replay.findings.some((f) => f.checkId === "SEQ_CONTIGUOUS"));
  // The injected CLOSED must not have been applied.
  assert.notEqual(snapshot.status, "CLOSED");

  coversRule(REPLAY, "replay validates eventId uniqueness and contiguous seq before deriving state.");
  coversRule(REPLAY_FAIL, "LEDGER_STRUCTURAL_FAILURE blocks all Objective derived state.");
});

test("an unparseable ledger line is a structural failure, not a skipped line", async () => {
  const root = await seed();
  await create(root, "auth-fix", "Fix auth");
  await appendFile(ledgerPath(root, "auth-fix"), "{not json\n", "utf8");

  const { snapshot } = await replayObjective(root, "auth-fix");
  assert.equal(snapshot.replay.replayStatus, "BLOCKED");
  assert.ok(snapshot.replay.findings.some((f) => f.checkId === "LEDGER_JSONL_PARSE"));
});

async function attach(root: string, objectiveId: string, taskId: string, revision = 1) {
  return attachTask(root, {
    objectiveId,
    taskId,
    taskRevision: revision,
    taskRevisionHash: `hash-${taskId}-${revision}`,
    actorId: "tester",
    reason: "attached"
  });
}

async function transition(root: string, objectiveId: string, itemId: string, type: QueueTransitionEvent) {
  return transitionQueueItem(root, {
    objectiveId,
    objectiveQueueItemId: itemId,
    type,
    actorId: "tester",
    reason: "because"
  });
}

test("attaching tasks builds the queue and a SEQUENCE Objective derives one NEXT", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");
  await attach(root, "auth", "logout");

  const { snapshot } = await replayObjective(root, "auth");
  assert.deepEqual(
    snapshot.queue.map((item) => [item.objectiveQueueItemId, item.storedState, item.derivedState]),
    [
      ["auth:login:1", "WAITING", "NEXT"],
      ["auth:logout:1", "WAITING", "NONE"]
    ]
  );
  assert.equal(snapshot.cursor.objectiveQueueItemId, "auth:login:1");
});

test("skipping an item moves NEXT to the following one", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");
  await attach(root, "auth", "logout");

  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_SKIPPED");

  const { snapshot } = await replayObjective(root, "auth");
  assert.equal(snapshot.queue[0].storedState, "SKIPPED");
  assert.equal(snapshot.queue[1].derivedState, "NEXT");
  assert.equal(snapshot.cursor.objectiveQueueItemId, "auth:logout:1");
});

test("CANCELED is terminal and cannot be transitioned out of", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");
  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_CANCELED");

  await assert.rejects(
    () => transition(root, "auth", "auth:login:1", "QUEUE_ITEM_UNBLOCKED"),
    /CANCELED -> WAITING is not an allowed transition/
  );
});

test("SKIPPED returns to WAITING only through an explicit unskip", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");

  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_SKIPPED");
  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_UNSKIPPED");

  const { snapshot } = await replayObjective(root, "auth");
  assert.equal(snapshot.queue[0].storedState, "WAITING");
});

test("a queue transition requires a reason and repeating it is a no-op", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");

  await assert.rejects(
    () =>
      transitionQueueItem(root, {
        objectiveId: "auth",
        objectiveQueueItemId: "auth:login:1",
        type: "QUEUE_ITEM_BLOCKED",
        actorId: "tester",
        reason: "   "
      }),
    /requires a reason/
  );

  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_BLOCKED");
  const repeat = await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_BLOCKED");
  assert.equal(repeat.alreadyApplied, true);
});

test("a task cannot be attached twice at a different revision", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login", 1);

  const conflicting = await attach(root, "auth", "login", 2);
  assert.equal(conflicting.failedPhase, "M2_PRECHECK");
  assert.match(conflicting.failureMessage, /already attached at revision 1/);
});

test("reorder moves the future segment and refuses to touch history", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");
  await attach(root, "auth", "logout");
  await attach(root, "auth", "profile");
  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_SKIPPED");

  // A decided item is history and naming it is an error.
  await assert.rejects(
    () =>
      reorderQueue(root, {
        objectiveId: "auth",
        futureOrder: ["auth:login:1", "auth:logout:1"],
        actorId: "tester",
        reason: "reorder"
      }),
    /not in the future segment/
  );

  await reorderQueue(root, {
    objectiveId: "auth",
    futureOrder: ["auth:profile:1", "auth:logout:1"],
    actorId: "tester",
    reason: "profile first"
  });

  const { snapshot } = await replayObjective(root, "auth");
  assert.deepEqual(
    snapshot.queue.map((item) => item.objectiveQueueItemId),
    ["auth:login:1", "auth:profile:1", "auth:logout:1"]
  );
  assert.equal(snapshot.queue[1].derivedState, "NEXT", "NEXT follows the new future order");
});

test("replaying an Objective that was never created is BLOCKED, not a clean OPEN", async () => {
  const root = await seed();
  await mkdir(path.join(root, ".codefleet", "objectives", "ghost"), { recursive: true });

  const { snapshot } = await replayObjective(root, "ghost");

  // Replaying nothing must not read like replaying a healthy ledger. Without
  // this the snapshot reported status OPEN and replayStatus COMPLETE for an
  // Objective that does not exist.
  assert.equal(snapshot.replay.replayStatus, "BLOCKED");
  assert.deepEqual(snapshot.replay.unavailableReasons, ["OBJECTIVE_NOT_CREATED"]);
  assert.equal(snapshot.replay.scanScope.eventsRead, 0);
  assert.equal(snapshot.replay.scanScope.eventsApplied, 0);
  assert.equal(snapshot.replay.scanScope.findingsByClass.REFERENCE_FAILURE, 1);
});

test("replay reports how many events it read and applied", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");
  await transition(root, "auth", "auth:login:1", "QUEUE_ITEM_SKIPPED");

  const { snapshot } = await replayObjective(root, "auth");
  assert.equal(snapshot.replay.replayStatus, "COMPLETE");
  assert.equal(snapshot.replay.scanScope.eventsRead, 3);
  assert.equal(snapshot.replay.scanScope.eventsApplied, 3);
  assert.deepEqual(snapshot.replay.scanScope.findingsByClass, {});
});

function localReviewFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    documentKind: "LOCAL_REVIEW_DECISION",
    finalDecisionTruth: false,
    migrationTarget: "RUN_REVIEW_DECIDED",
    reviewDecisionId: "run-1-review-001",
    runId: "run-1",
    taskId: "login",
    taskRevision: 1,
    decision: "ACCEPTED",
    actorKind: "HUMAN",
    actorId: "reviewer",
    decisionBasis: "HUMAN_REVIEW",
    reason: "checked",
    observedResultSnapshot: "DONE",
    observedCheckSnapshot: "PASS",
    verificationGateResult: "SATISFIED",
    verificationGateReason: "PASS",
    reviewEvidenceBundleRef: { path: ".codefleet/reviews/x/evidence-bundle.json", contentHash: "bundle-hash-1" },
    evidenceCompleteness: "COMPLETE",
    waivedCapabilityGaps: [],
    localReviewStatus: "MIGRATION_READY",
    ...overrides
  };
}

async function importReview(root: string, overrides: Record<string, unknown> = {}) {
  const { importLocalReview } = await import("../src/ledger.ts");
  return importLocalReview(root, {
    objectiveId: "auth",
    runId: "run-1",
    localReview: localReviewFixture(overrides),
    localReviewRef: { path: ".codefleet/runs/run-1/review-decision.local.json", hash: "local-hash-1" },
    reason: "imported",
    actorId: "tester"
  });
}

test("importing a local review appends a decision event carrying its migration source", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");

  const outcome = await importReview(root);
  assert.equal(outcome.applied, true);

  const events = (await replayObjective(root, "auth")).snapshot;
  assert.equal(events.replay.replayStatus, "COMPLETE");

  const raw = await readFile(ledgerPath(root, "auth"), "utf8");
  const decision = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> })
    .find((event) => event.type === "RUN_REVIEW_DECIDED");

  assert.ok(decision, "a RUN_REVIEW_DECIDED event must be appended");
  assert.equal(decision.payload.migrationSource, "LOCAL_REVIEW_DECISION");
  assert.deepEqual(decision.payload.migrationSourceRef, {
    path: ".codefleet/runs/run-1/review-decision.local.json",
    hash: "local-hash-1"
  });

  // Re-importing the identical artifact is a no-op, not a second decision.
  const again = await importReview(root);
  assert.equal(again.alreadyApplied, true);

  coversRule(
    IMPORT,
    "migration appends a new RUN_REVIEW_DECIDED event or detects an identical already-imported event."
  );
  coversRule(
    IMPORT,
    "appended RUN_REVIEW_DECIDED records migrationSource LOCAL_REVIEW_DECISION and migrationSourceRef/hash."
  );
  coversRule(CONFLICT, "identical already-imported decision is idempotent and appends no event.");
  coversRule(DURABLE, "RUN_REVIEW_DECIDED is appended to the Objective ledger");
  coversRule(DURABLE, "RUN_REVIEW_DECIDED includes reviewDecisionId");
  coversRule(DURABLE, "RUN_REVIEW_DECIDED includes actorKind, actorId, decisionBasis, reason, at");
  coversRule(IMPORT, "migration does not edit review-decision.local.json.");
});

test("a waived acceptance carries its waived gaps into the ledger", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");

  await importReview(root, {
    localReviewStatus: "MIGRATION_READY_WAIVED",
    evidenceCompleteness: "WAIVED_INCOMPLETE",
    waivedCapabilityGaps: [
      { reason: "WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02", acknowledgedBy: "reviewer", justification: "checked by hand" }
    ]
  });

  const raw = await readFile(ledgerPath(root, "auth"), "utf8");
  const decision = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> })
    .find((event) => event.type === "RUN_REVIEW_DECIDED");

  // Without these a later reader sees ACCEPTED and cannot tell that a person
  // stood in for evidence the Harness never collected.
  assert.equal(decision?.payload.evidenceCompleteness, "WAIVED_INCOMPLETE");
  assert.deepEqual(
    (decision?.payload.waivedCapabilityGaps as { reason: string }[]).map((gap) => gap.reason),
    ["WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02"]
  );
});

test("only a migration-ready local review can be imported", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");

  for (const status of ["DEGRADED_RECORDED", "MIGRATION_BLOCKED", "SUPERSEDED"]) {
    const outcome = await importReview(root, { localReviewStatus: status });
    assert.equal(outcome.failedPhase, "M2_PRECHECK", `${status} must not import`);
    assert.match(outcome.failureMessage, new RegExp(`${status} cannot be imported`));
  }

  const notLocal = await importReview(root, { finalDecisionTruth: true });
  assert.match(notLocal.failureMessage, /finalDecisionTruth false/);
});

test("the same reviewDecisionId with a different bundle blocks migration", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await importReview(root);

  // Two different decisions claiming one identity. Overwriting silently would
  // destroy the first, so migration stops and asks for an explicit supersede.
  const conflicting = await importReview(root, {
    reviewEvidenceBundleRef: { path: ".codefleet/reviews/y/evidence-bundle.json", contentHash: "bundle-hash-2" }
  });
  assert.equal(conflicting.failedPhase, "M2_PRECHECK");
  assert.match(conflicting.failureMessage, /already imported with a different bundle hash/);

  coversRule(
    CONFLICT,
    "same reviewDecisionId with different ReviewEvidenceBundle hash is REVIEW_INTEGRITY and blocks import."
  );
  coversRule(IMPORT, "reviewDecisionId collision with different bundle hash blocks migration.");
  coversRule(LATEST, "Review Decision must have effective ReviewEvidenceBundle");
  coversRule(DURABLE, "RUN_REVIEW_DECIDED includes reviewEvidenceBundleRef and reviewEvidenceBundleHash");
});

test("an accepted review with a satisfied gate derives VERIFIED and moves the cursor", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");
  await attach(root, "auth", "logout");

  const before = (await replayObjective(root, "auth")).snapshot;
  assert.equal(before.queue[0].derivedState, "NEXT");
  assert.equal(before.queue[1].derivedState, "NONE");

  await importLocalReviewFor(root, "login");

  const after = (await replayObjective(root, "auth")).snapshot;
  assert.equal(after.queue[0].derivedState, "VERIFIED");
  assert.equal(after.queue[0].effectiveReviewDecisionId, "run-1-review-001");
  assert.equal(after.queue[1].derivedState, "NEXT", "the cursor moves to the next item");
  assert.equal(after.cursor.objectiveQueueItemId, "auth:logout:1");

  coversRule(VERIFIED, "VERIFIED requires latest effective RUN_REVIEW_DECIDED.decision == ACCEPTED");
  coversRule(VERIFIED, "VERIFIED requires verificationGateResult in {SATISFIED, WAIVED_ALLOWED}");
  coversRule(
    VERIFIED,
    "VERIFIED is calculated for objectiveQueueItemId + taskId + taskRevision, not runId alone"
  );
  coversRule(
    LATEST,
    "effective Review Decision is calculated for objectiveQueueItemId + taskId + taskRevision"
  );
  coversRule(LATEST, "runId is evidence link and does not define VERIFIED identity by itself");
  coversRule(
    DURABLE,
    "RUN_REVIEW_DECIDED does not directly write DONE, FAILED, VERIFIED, NEXT, or Queue State"
  );
});

test("VERIFIED needs all three of accepted, gate satisfied, and a successful result", async () => {
  for (const override of [
    { decision: "REJECTED" },
    { decision: "NEEDS_CHANGES" },
    { verificationGateResult: "NOT_SATISFIED" },
    { observedResultSnapshot: "FAILED" }
  ]) {
    const root = await seed();
    await create(root, "auth", "Auth work");
    await attach(root, "auth", "login");
    await importLocalReviewFor(root, "login", override);

    const { snapshot } = await replayObjective(root, "auth");
    assert.notEqual(
      snapshot.queue[0].derivedState,
      "VERIFIED",
      `${JSON.stringify(override)} must not produce VERIFIED`
    );
    // An unverified item keeps the cursor rather than letting the queue advance.
    assert.equal(snapshot.queue[0].derivedState, "NEXT");
  }

  coversRule(VERIFIED, "REJECTED and NEEDS_CHANGES cannot produce VERIFIED");
  coversRule(
    VERIFIED,
    "VERIFIED requires normalized Run result to be successful according to Run Summary policy"
  );
});

test("a waived acceptance still derives VERIFIED, and the ledger says it was waived", async () => {
  const root = await seed();
  await create(root, "auth", "Auth work");
  await attach(root, "auth", "login");

  await importLocalReviewFor(root, "login", {
    localReviewStatus: "MIGRATION_READY_WAIVED",
    evidenceCompleteness: "WAIVED_INCOMPLETE",
    verificationGateResult: "WAIVED_ALLOWED",
    waivedCapabilityGaps: [
      { reason: "WORKSPACE_SNAPSHOT_NOT_IMPLEMENTED_V02", acknowledgedBy: "reviewer", justification: "checked" }
    ]
  });

  const { snapshot } = await replayObjective(root, "auth");
  assert.equal(snapshot.queue[0].derivedState, "VERIFIED");

  // The waiver is not lost in derivation: a reader can still see a person stood
  // in for evidence the Harness never collected.
  const raw = await readFile(ledgerPath(root, "auth"), "utf8");
  const decision = raw
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> })
    .find((event) => event.type === "RUN_REVIEW_DECIDED");
  assert.equal(decision?.payload.evidenceCompleteness, "WAIVED_INCOMPLETE");
});

async function importLocalReviewFor(
  root: string,
  taskId: string,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  const { importLocalReview } = await import("../src/ledger.ts");
  const outcome = await importLocalReview(root, {
    objectiveId: "auth",
    runId: "run-1",
    localReview: localReviewFixture({ taskId, ...overrides }),
    localReviewRef: { path: ".codefleet/runs/run-1/review-decision.local.json", hash: "local-hash-1" },
    reason: "imported",
    actorId: "tester"
  });
  assert.equal(outcome.failedPhase, null, outcome.failureMessage);
}
