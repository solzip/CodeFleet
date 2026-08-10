// Objective ledger — append-only decision log, and the replay that rebuilds
// objective.json from it.
//
// objective.json is a read model. When it disagrees with replay, replay wins,
// and the snapshot is rebuilt rather than patched.

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runMutation, writeJsonFile, type MutationOutcome } from "./mutation.ts";

export type ObjectiveStatus = "OPEN" | "CLOSED" | "CANCELED";
export type ObjectiveKind = "SEQUENCE" | "WORKSTREAM" | "ONE_OFF";

export type LedgerEventType =
  | "OBJECTIVE_CREATED"
  | "OBJECTIVE_UPDATED"
  | "OBJECTIVE_CLOSED"
  | "OBJECTIVE_REOPENED"
  | "OBJECTIVE_CANCELED"
  | "TASK_ATTACHED"
  | "QUEUE_ITEM_BLOCKED"
  | "QUEUE_ITEM_UNBLOCKED"
  | "QUEUE_ITEM_SKIPPED"
  | "QUEUE_ITEM_UNSKIPPED"
  | "QUEUE_ITEM_CANCELED"
  | "QUEUE_REORDERED"
  | "RUN_REVIEW_DECIDED";

export type QueueStoredState = "WAITING" | "BLOCKED" | "SKIPPED" | "CANCELED";
export type QueueDerivedState = "NEXT" | "ACTIVE" | "DONE" | "FAILED" | "VERIFIED" | "NONE";

export interface QueueItem {
  objectiveQueueItemId: string;
  taskId: string;
  taskRevision: number;
  taskRevisionHash: string;
  storedState: QueueStoredState;
  derivedState: QueueDerivedState;
  effectiveReviewDecisionId: string;
  effectiveDecision: string;
  effectiveGateResult: string;
  effectiveResult: string;
}

// The fixed transition table. CANCELED is terminal; SKIPPED returns to WAITING
// only through an explicit unskip.
const QUEUE_TRANSITIONS: Record<QueueStoredState, QueueStoredState[]> = {
  WAITING: ["BLOCKED", "SKIPPED", "CANCELED"],
  BLOCKED: ["WAITING", "SKIPPED", "CANCELED"],
  SKIPPED: ["WAITING", "CANCELED"],
  CANCELED: []
};

const QUEUE_EVENT_TARGET: Record<string, QueueStoredState> = {
  QUEUE_ITEM_BLOCKED: "BLOCKED",
  QUEUE_ITEM_UNBLOCKED: "WAITING",
  QUEUE_ITEM_SKIPPED: "SKIPPED",
  QUEUE_ITEM_UNSKIPPED: "WAITING",
  QUEUE_ITEM_CANCELED: "CANCELED"
};

export interface LedgerEvent {
  mutationId: string;
  eventId: string;
  seq: number;
  type: LedgerEventType;
  objectiveId: string;
  actorKind: "HUMAN" | "SYSTEM_POLICY";
  actorId: string;
  reason: string;
  at: string;
  payload: Record<string, unknown>;
}

export type ReplayFailureClass =
  | "LEDGER_STRUCTURAL_FAILURE"
  | "REFERENCE_FAILURE"
  | "POLICY_EVALUATION_FAILURE"
  | "READ_MODEL_DRIFT";

export interface ReplayFinding {
  failureClass: ReplayFailureClass;
  checkId: string;
  detail: string;
  affectedSeq: number | null;
}

export interface ObjectiveSnapshot {
  schemaVersion: "0.2";
  documentKind: "OBJECTIVE_SNAPSHOT";
  sourceLedgerRef: { path: string; hash: string };
  objectiveId: string;
  status: ObjectiveStatus;
  kind: ObjectiveKind;
  title: string;
  queue: QueueItem[];
  cursor: { objectiveQueueItemId: string; derived: true };
  replay: {
    replayStatus: "COMPLETE" | "BLOCKED";
    lastSeq: number;
    sourceHash: string;
    generatedAt: string;
    unavailableReasons: string[];
    findings: ReplayFinding[];
    // Replaying no events and replaying a healthy ledger must not look the
    // same. An Objective with no OBJECTIVE_CREATED has nothing to derive from.
    scanScope: {
      eventsRead: number;
      eventsApplied: number;
      findingsByClass: Record<string, number>;
    };
  };
}

export interface ReplayResult {
  snapshot: ObjectiveSnapshot;
  findings: ReplayFinding[];
}

export function objectiveDir(rootDir: string, objectiveId: string): string {
  return path.join(rootDir, ".codefleet", "objectives", objectiveId);
}

export function ledgerPath(rootDir: string, objectiveId: string): string {
  return path.join(objectiveDir(rootDir, objectiveId), "ledger.jsonl");
}

export function snapshotPath(rootDir: string, objectiveId: string): string {
  return path.join(objectiveDir(rootDir, objectiveId), "objective.json");
}

export async function readEvents(rootDir: string, objectiveId: string): Promise<{
  events: LedgerEvent[];
  parseFindings: ReplayFinding[];
  raw: string;
}> {
  let raw = "";
  try {
    raw = await readFile(ledgerPath(rootDir, objectiveId), "utf8");
  } catch {
    return { events: [], parseFindings: [], raw: "" };
  }

  const events: LedgerEvent[] = [];
  const parseFindings: ReplayFinding[] = [];

  raw.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    try {
      events.push(JSON.parse(line) as LedgerEvent);
    } catch {
      parseFindings.push({
        failureClass: "LEDGER_STRUCTURAL_FAILURE",
        checkId: "LEDGER_JSONL_PARSE",
        detail: `line ${index + 1} is not valid JSON`,
        affectedSeq: null
      });
    }
  });

  return { events, parseFindings, raw };
}

// Replay reads events in seq order and derives the snapshot. Structural failure
// stops derivation entirely rather than producing a plausible-looking snapshot.
export async function replayObjective(rootDir: string, objectiveId: string): Promise<ReplayResult> {
  const { events, parseFindings, raw } = await readEvents(rootDir, objectiveId);
  const findings: ReplayFinding[] = [...parseFindings];

  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.eventId)) {
      findings.push({
        failureClass: "LEDGER_STRUCTURAL_FAILURE",
        checkId: "EVENT_ID_UNIQUE",
        detail: `duplicate eventId ${event.eventId}`,
        affectedSeq: event.seq
      });
    }
    seen.add(event.eventId);

    if (event.objectiveId !== objectiveId) {
      findings.push({
        failureClass: "LEDGER_STRUCTURAL_FAILURE",
        checkId: "EVENT_OBJECTIVE_MATCHES",
        detail: `event ${event.eventId} belongs to ${event.objectiveId}`,
        affectedSeq: event.seq
      });
    }
  }

  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  ordered.forEach((event, index) => {
    if (event.seq !== index + 1) {
      findings.push({
        failureClass: "LEDGER_STRUCTURAL_FAILURE",
        checkId: "SEQ_CONTIGUOUS",
        detail: `expected seq ${index + 1}, found ${event.seq}`,
        affectedSeq: event.seq
      });
    }
  });

  const structural = findings.some((f) => f.failureClass === "LEDGER_STRUCTURAL_FAILURE");
  // An Objective that was never created cannot be reported as an OPEN one with
  // a clean replay. There is no source to derive any state from.
  const created = ordered.some((event) => event.type === "OBJECTIVE_CREATED");
  if (!structural && !created) {
    findings.push({
      failureClass: "REFERENCE_FAILURE",
      checkId: "OBJECTIVE_CREATED_PRESENT",
      detail: `no OBJECTIVE_CREATED event for ${objectiveId}`,
      affectedSeq: null
    });
  }
  let status: ObjectiveStatus = "OPEN";
  let kind: ObjectiveKind = "ONE_OFF";
  let title = "";
  const queue: QueueItem[] = [];

  const reviewEvents: LedgerEvent[] = [];
  let eventsApplied = 0;
  if (!structural && created) {
    for (const event of ordered) {
      eventsApplied += 1;
      if (event.type === "OBJECTIVE_CREATED") {
        status = "OPEN";
        kind = (event.payload.kind as ObjectiveKind) ?? "ONE_OFF";
        title = String(event.payload.title ?? "");
      } else if (event.type === "OBJECTIVE_UPDATED") {
        title = String(event.payload.title ?? title);
      } else if (event.type === "OBJECTIVE_CLOSED") {
        status = "CLOSED";
      } else if (event.type === "OBJECTIVE_REOPENED") {
        status = "OPEN";
      } else if (event.type === "OBJECTIVE_CANCELED") {
        status = "CANCELED";
      } else if (event.type === "TASK_ATTACHED") {
        queue.push({
          objectiveQueueItemId: String(event.payload.objectiveQueueItemId ?? ""),
          taskId: String(event.payload.taskId ?? ""),
          taskRevision: Number(event.payload.taskRevision ?? 1),
          taskRevisionHash: String(event.payload.taskRevisionHash ?? ""),
          storedState: "WAITING",
          derivedState: "NONE",
          effectiveReviewDecisionId: "",
          effectiveDecision: "",
          effectiveGateResult: "",
          effectiveResult: ""
        });
      } else if (event.type === "RUN_REVIEW_DECIDED") {
        reviewEvents.push(event);
      } else if (event.type === "QUEUE_REORDERED") {
        applyReorder(queue, event, findings);
      } else if (QUEUE_EVENT_TARGET[event.type] !== undefined) {
        applyQueueTransition(queue, event, findings);
      }
    }

    applyReviewDecisions(queue, reviewEvents, findings);
    deriveQueueStates(queue, kind);
  }

  const sourceHash = createHash("sha256").update(raw).digest("hex");
  const snapshot: ObjectiveSnapshot = {
    schemaVersion: "0.2",
    documentKind: "OBJECTIVE_SNAPSHOT",
    sourceLedgerRef: {
      path: toPosix(path.relative(rootDir, ledgerPath(rootDir, objectiveId))),
      hash: sourceHash
    },
    objectiveId,
    status,
    kind,
    title,
    queue,
    cursor: { objectiveQueueItemId: cursorOf(queue), derived: true },
    replay: {
      replayStatus: structural || !created ? "BLOCKED" : "COMPLETE",
      lastSeq: ordered.length === 0 ? 0 : ordered[ordered.length - 1].seq,
      sourceHash,
      generatedAt: new Date().toISOString(),
      // A blocked replay must not present itself as a fresh complete snapshot.
      unavailableReasons: structural
        ? ["LEDGER_STRUCTURAL_FAILURE"]
        : created
          ? []
          : ["OBJECTIVE_NOT_CREATED"],
      findings,
      scanScope: {
        eventsRead: events.length,
        eventsApplied,
        findingsByClass: findings.reduce<Record<string, number>>((acc, finding) => {
          acc[finding.failureClass] = (acc[finding.failureClass] ?? 0) + 1;
          return acc;
        }, {})
      }
    }
  };

  return { snapshot, findings };
}

function applyQueueTransition(queue: QueueItem[], event: LedgerEvent, findings: ReplayFinding[]): void {
  const itemId = String(event.payload.objectiveQueueItemId ?? "");
  const item = queue.find((entry) => entry.objectiveQueueItemId === itemId);
  if (item === undefined) {
    findings.push({
      failureClass: "REFERENCE_FAILURE",
      checkId: "QUEUE_ITEM_EXISTS",
      detail: `${event.type} references unknown queue item ${itemId}`,
      affectedSeq: event.seq
    });
    return;
  }

  const target = QUEUE_EVENT_TARGET[event.type];
  if (!QUEUE_TRANSITIONS[item.storedState].includes(target)) {
    // An illegal transition is a state machine violation, not something to
    // apply anyway and hope the snapshot still means something.
    findings.push({
      failureClass: "LEDGER_STRUCTURAL_FAILURE",
      checkId: "QUEUE_TRANSITION_ALLOWED",
      detail: `${item.storedState} -> ${target} is not an allowed transition for ${itemId}`,
      affectedSeq: event.seq
    });
    return;
  }

  item.storedState = target;
}

// Reorder declares a new future order. Items already decided are history and
// keep their position; only the undecided tail moves.
function applyReorder(queue: QueueItem[], event: LedgerEvent, findings: ReplayFinding[]): void {
  const order = Array.isArray(event.payload.futureOrder)
    ? (event.payload.futureOrder as unknown[]).map((v) => String(v))
    : [];
  const isHistory = (item: QueueItem): boolean =>
    item.storedState === "SKIPPED" || item.storedState === "CANCELED";

  const history = queue.filter(isHistory);
  const future = queue.filter((item) => !isHistory(item));
  const futureIds = new Set(future.map((item) => item.objectiveQueueItemId));

  for (const id of order) {
    if (!futureIds.has(id)) {
      findings.push({
        failureClass: "REFERENCE_FAILURE",
        checkId: "REORDER_TARGETS_FUTURE_SEGMENT",
        detail: `reorder references ${id}, which is not in the future segment`,
        affectedSeq: event.seq
      });
      return;
    }
  }

  const reordered = order
    .map((id) => future.find((item) => item.objectiveQueueItemId === id))
    .filter((item): item is QueueItem => item !== undefined);
  const untouched = future.filter((item) => !order.includes(item.objectiveQueueItemId));

  queue.length = 0;
  queue.push(...history, ...reordered, ...untouched);
}

// The latest effective decision per queue item, chosen by ledger seq order.
// Decisions naming a supersede or invalidation remove the target first, so an
// overturned decision cannot come back as the latest one.
function applyReviewDecisions(
  queue: QueueItem[],
  reviewEvents: LedgerEvent[],
  findings: ReplayFinding[]
): void {
  const invalidated = new Set<string>();
  for (const event of reviewEvents) {
    const payload = event.payload as unknown as Record<string, unknown>;
    for (const key of ["supersedesReviewDecisionId", "invalidatesReviewDecisionId"]) {
      const target = payload[key];
      if (typeof target === "string" && target.length > 0) {
        invalidated.add(target);
      }
    }
  }

  for (const event of reviewEvents) {
    const payload = event.payload as unknown as Record<string, unknown>;
    const itemId = String(payload.objectiveQueueItemId ?? "");
    const item = queue.find((entry) => entry.objectiveQueueItemId === itemId);
    if (item === undefined) {
      findings.push({
        failureClass: "REFERENCE_FAILURE",
        checkId: "REVIEW_TARGETS_QUEUE_ITEM",
        detail: `review decision references unknown queue item ${itemId}`,
        affectedSeq: event.seq
      });
      continue;
    }

    const decisionId = String(payload.reviewDecisionId ?? "");
    if (invalidated.has(decisionId)) {
      continue;
    }

    const bundleHash = String(
      ((payload.reviewEvidenceBundleRef ?? {}) as Record<string, unknown>).hash ?? ""
    );
    if (bundleHash.length === 0) {
      // A decision without frozen evidence is not an effective decision.
      findings.push({
        failureClass: "REFERENCE_FAILURE",
        checkId: "REVIEW_HAS_EVIDENCE_BUNDLE",
        detail: `review decision ${decisionId} has no evidence bundle hash`,
        affectedSeq: event.seq
      });
      continue;
    }

    // Later seq wins for the same identity.
    item.effectiveReviewDecisionId = decisionId;
    item.effectiveDecision = String(payload.decision ?? "");
    item.effectiveGateResult = String(payload.verificationGateResult ?? "");
    item.effectiveResult = String(payload.observedResultSnapshot ?? "");
  }
}

// NEXT, ACTIVE, DONE, VERIFIED are never stored. VERIFIED needs an accepted
// effective decision, a satisfied or waived gate, and a successful result; any
// one of those missing leaves the item unverified rather than optimistic.
function deriveQueueStates(queue: QueueItem[], kind: ObjectiveKind): void {
  let nextAssigned = false;
  for (const item of queue) {
    const verified =
      item.effectiveDecision === "ACCEPTED" &&
      (item.effectiveGateResult === "SATISFIED" || item.effectiveGateResult === "WAIVED_ALLOWED") &&
      item.effectiveResult === "DONE";

    if (verified) {
      item.derivedState = "VERIFIED";
      continue;
    }
    if (item.storedState !== "WAITING") {
      item.derivedState = "NONE";
      continue;
    }
    // A rejected or unverified item still holds the cursor: progression past it
    // would be exactly the automatic advance this design refuses.
    if (nextAssigned) {
      item.derivedState = "NONE";
      continue;
    }
    item.derivedState = "NEXT";
    if (kind === "SEQUENCE") {
      nextAssigned = true;
    }
  }
}

function cursorOf(queue: QueueItem[]): string {
  return queue.find((item) => item.derivedState === "NEXT")?.objectiveQueueItemId ?? "";
}

export async function rebuildSnapshot(rootDir: string, objectiveId: string): Promise<ObjectiveSnapshot> {
  const { snapshot } = await replayObjective(rootDir, objectiveId);
  await writeJsonFile(snapshotPath(rootDir, objectiveId), snapshot);
  return snapshot;
}

// A stored snapshot that disagrees with replay is READ_MODEL_DRIFT: the source
// is fine and the snapshot is rebuilt, never the other way round.
export async function detectDrift(rootDir: string, objectiveId: string): Promise<ReplayFinding | null> {
  const { snapshot } = await replayObjective(rootDir, objectiveId);
  let stored: ObjectiveSnapshot | null = null;
  try {
    stored = JSON.parse(await readFile(snapshotPath(rootDir, objectiveId), "utf8")) as ObjectiveSnapshot;
  } catch {
    return {
      failureClass: "READ_MODEL_DRIFT",
      checkId: "SNAPSHOT_PRESENT",
      detail: "objective.json is missing and can be rebuilt from the ledger",
      affectedSeq: null
    };
  }

  if (comparable(stored) !== comparable(snapshot)) {
    return {
      failureClass: "READ_MODEL_DRIFT",
      checkId: "SNAPSHOT_MATCHES_REPLAY",
      detail: "objective.json does not match deterministic replay",
      affectedSeq: null
    };
  }
  return null;
}

export async function createObjective(
  rootDir: string,
  input: { objectiveId: string; title: string; kind: ObjectiveKind; actorId: string; reason: string }
): Promise<MutationOutcome<LedgerEvent>> {
  const { objectiveId, title, kind, actorId, reason } = input;

  return runMutation(
    rootDir,
    {
      mutationKind: "OBJECTIVE_CREATE",
      targetId: objectiveId,
      semanticPayload: { title, kind }
    },
    {
      precheck: async (mutationId) => {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(objectiveId)) {
          throw new Error("objectiveId must match [a-z0-9][a-z0-9-]*");
        }
        const { events, parseFindings } = await readEvents(rootDir, objectiveId);
        if (parseFindings.length > 0) {
          throw new Error("ledger is structurally invalid; repair the source before mutating");
        }
        // An identical repeat carries the same mutationId and belongs to M3,
        // which ends it as a no-op. Only a different creation is a conflict.
        const conflicting = events.filter(
          (event) => event.type === "OBJECTIVE_CREATED" && event.mutationId !== mutationId
        );
        if (conflicting.length > 0) {
          throw new Error(`objective already exists with different content: ${objectiveId}`);
        }
      },
      isAlreadyApplied: async (): Promise<boolean> => {
        const { events } = await readEvents(rootDir, objectiveId);
        return events.some((event) => event.type === "OBJECTIVE_CREATED");
      },
      append: async (mutationId): Promise<LedgerEvent> => {
        const { events } = await readEvents(rootDir, objectiveId);
        const seq = events.length + 1;
        const at = new Date().toISOString();
        const event: LedgerEvent = {
          mutationId,
          eventId: `evt_${seq.toString().padStart(6, "0")}_${mutationId.slice(4, 12)}`,
          seq,
          type: "OBJECTIVE_CREATED",
          objectiveId,
          actorKind: "HUMAN",
          actorId,
          reason,
          at,
          payload: { title, kind }
        };
        await mkdir(objectiveDir(rootDir, objectiveId), { recursive: true });
        await appendFile(ledgerPath(rootDir, objectiveId), `${JSON.stringify(event)}\n`, "utf8");
        return event;
      },
      rebuild: async () => {
        await rebuildSnapshot(rootDir, objectiveId);
      },
      postcheck: async () => {
        const { snapshot } = await replayObjective(rootDir, objectiveId);
        if (snapshot.replay.replayStatus !== "COMPLETE") {
          throw new Error(`replay is ${snapshot.replay.replayStatus} after append`);
        }
        const drift = await detectDrift(rootDir, objectiveId);
        if (drift !== null) {
          throw new Error(drift.detail);
        }
      }
    }
  );
}

// generatedAt changes on every replay, so it is excluded from the comparison.
function comparable(snapshot: ObjectiveSnapshot): string {
  const copy = JSON.parse(JSON.stringify(snapshot)) as ObjectiveSnapshot;
  copy.replay.generatedAt = "";
  return JSON.stringify(copy);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

async function appendEvent(
  rootDir: string,
  objectiveId: string,
  mutationId: string,
  type: LedgerEventType,
  actorId: string,
  reason: string,
  payload: Record<string, unknown>
): Promise<LedgerEvent> {
  const { events } = await readEvents(rootDir, objectiveId);
  const seq = events.length + 1;
  const event: LedgerEvent = {
    mutationId,
    eventId: `evt_${seq.toString().padStart(6, "0")}_${mutationId.slice(4, 12)}`,
    seq,
    type,
    objectiveId,
    actorKind: "HUMAN",
    actorId,
    reason,
    at: new Date().toISOString(),
    payload
  };
  await mkdir(objectiveDir(rootDir, objectiveId), { recursive: true });
  await appendFile(ledgerPath(rootDir, objectiveId), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

// Shared M2/M5/M6 for every objective mutation after creation: the objective
// must exist, the ledger must be structurally sound before appending, and the
// snapshot must rebuild and match afterwards.
function objectiveSteps(
  rootDir: string,
  objectiveId: string,
  extraPrecheck: (events: LedgerEvent[]) => void
) {
  return {
    precheck: async (): Promise<void> => {
      const { events, parseFindings } = await readEvents(rootDir, objectiveId);
      if (parseFindings.length > 0) {
        throw new Error("ledger is structurally invalid; repair the source before mutating");
      }
      if (!events.some((event) => event.type === "OBJECTIVE_CREATED")) {
        throw new Error(`objective does not exist: ${objectiveId}`);
      }
      extraPrecheck(events);
    },
    rebuild: async (): Promise<void> => {
      await rebuildSnapshot(rootDir, objectiveId);
    },
    postcheck: async (): Promise<void> => {
      const { snapshot } = await replayObjective(rootDir, objectiveId);
      if (snapshot.replay.replayStatus !== "COMPLETE") {
        throw new Error(`replay is ${snapshot.replay.replayStatus} after append`);
      }
      const drift = await detectDrift(rootDir, objectiveId);
      if (drift !== null) {
        throw new Error(drift.detail);
      }
    }
  };
}

export async function attachTask(
  rootDir: string,
  input: {
    objectiveId: string;
    taskId: string;
    taskRevision: number;
    taskRevisionHash: string;
    actorId: string;
    reason: string;
  }
): Promise<MutationOutcome<LedgerEvent>> {
  const { objectiveId, taskId, taskRevision, taskRevisionHash, actorId, reason } = input;
  const queueItemId = `${objectiveId}:${taskId}:${taskRevision}`;

  return runMutation(
    rootDir,
    {
      mutationKind: "TASK_ATTACH",
      targetId: objectiveId,
      targetHash: taskRevisionHash,
      semanticPayload: { taskId, taskRevision }
    },
    {
      ...objectiveSteps(rootDir, objectiveId, (events) => {
        const attached = events.some(
          (event) =>
            event.type === "TASK_ATTACHED" && event.payload.objectiveQueueItemId === queueItemId
        );
        if (attached) {
          return;
        }
        // A task revision belongs to exactly one queue item, so attaching a
        // different revision of the same task needs the old one resolved first.
        const otherRevision = events.find(
          (event) =>
            event.type === "TASK_ATTACHED" &&
            event.payload.taskId === taskId &&
            event.payload.taskRevision !== taskRevision
        );
        if (otherRevision !== undefined) {
          throw new Error(
            `${taskId} is already attached at revision ${String(otherRevision.payload.taskRevision)}`
          );
        }
      }),
      isAlreadyApplied: async (): Promise<boolean> => {
        const { events } = await readEvents(rootDir, objectiveId);
        return events.some(
          (event) =>
            event.type === "TASK_ATTACHED" && event.payload.objectiveQueueItemId === queueItemId
        );
      },
      append: async (mutationId): Promise<LedgerEvent> =>
        appendEvent(rootDir, objectiveId, mutationId, "TASK_ATTACHED", actorId, reason, {
          objectiveQueueItemId: queueItemId,
          taskId,
          taskRevision,
          taskRevisionHash
        })
    }
  );
}

export type QueueTransitionEvent =
  | "QUEUE_ITEM_BLOCKED"
  | "QUEUE_ITEM_UNBLOCKED"
  | "QUEUE_ITEM_SKIPPED"
  | "QUEUE_ITEM_UNSKIPPED"
  | "QUEUE_ITEM_CANCELED";

export async function transitionQueueItem(
  rootDir: string,
  input: {
    objectiveId: string;
    objectiveQueueItemId: string;
    type: QueueTransitionEvent;
    actorId: string;
    reason: string;
  }
): Promise<MutationOutcome<LedgerEvent>> {
  const { objectiveId, objectiveQueueItemId, type, actorId, reason } = input;

  // BLOCKED, SKIPPED, and CANCELED all require a reason by the fixed rules.
  if (reason.trim().length === 0) {
    throw new Error(`${type} requires a reason`);
  }

  return runMutation(
    rootDir,
    {
      mutationKind: type,
      targetId: objectiveId,
      semanticPayload: { objectiveQueueItemId, type }
    },
    {
      ...objectiveSteps(rootDir, objectiveId, () => {}),
      isAlreadyApplied: async (): Promise<boolean> => {
        const { snapshot } = await replayObjective(rootDir, objectiveId);
        const item = snapshot.queue.find(
          (entry) => entry.objectiveQueueItemId === objectiveQueueItemId
        );
        if (item === undefined) {
          throw new Error(`unknown queue item: ${objectiveQueueItemId}`);
        }
        const target = {
          QUEUE_ITEM_BLOCKED: "BLOCKED",
          QUEUE_ITEM_UNBLOCKED: "WAITING",
          QUEUE_ITEM_SKIPPED: "SKIPPED",
          QUEUE_ITEM_UNSKIPPED: "WAITING",
          QUEUE_ITEM_CANCELED: "CANCELED"
        }[type];
        if (item.storedState === target) {
          return true;
        }
        if (!QUEUE_TRANSITIONS[item.storedState].includes(target as QueueStoredState)) {
          throw new Error(`${item.storedState} -> ${target} is not an allowed transition`);
        }
        return false;
      },
      append: async (mutationId): Promise<LedgerEvent> =>
        appendEvent(rootDir, objectiveId, mutationId, type, actorId, reason, {
          objectiveQueueItemId
        })
    }
  );
}

export async function reorderQueue(
  rootDir: string,
  input: { objectiveId: string; futureOrder: string[]; actorId: string; reason: string }
): Promise<MutationOutcome<LedgerEvent>> {
  const { objectiveId, futureOrder, actorId, reason } = input;
  if (reason.trim().length === 0) {
    throw new Error("QUEUE_REORDERED requires a reason");
  }

  return runMutation(
    rootDir,
    {
      mutationKind: "QUEUE_REORDER",
      targetId: objectiveId,
      semanticPayload: { futureOrder }
    },
    {
      ...objectiveSteps(rootDir, objectiveId, () => {}),
      isAlreadyApplied: async (): Promise<boolean> => {
        const { snapshot } = await replayObjective(rootDir, objectiveId);
        const future = snapshot.queue
          .filter((item) => item.storedState !== "SKIPPED" && item.storedState !== "CANCELED")
          .map((item) => item.objectiveQueueItemId);
        for (const id of futureOrder) {
          if (!future.includes(id)) {
            // Reorder never touches history; naming a decided item is an error.
            throw new Error(`${id} is not in the future segment`);
          }
        }
        return future.slice(0, futureOrder.length).join("\u0000") === futureOrder.join("\u0000");
      },
      append: async (mutationId): Promise<LedgerEvent> =>
        appendEvent(rootDir, objectiveId, mutationId, "QUEUE_REORDERED", actorId, reason, {
          futureOrder
        })
    }
  );
}

export interface ReviewDecisionEventPayload {
  reviewDecisionId: string;
  objectiveQueueItemId: string;
  taskId: string;
  taskRevision: number;
  runId: string;
  decision: string;
  actorKind: string;
  actorId: string;
  decisionBasis: string;
  observedResultSnapshot: string;
  observedCheckSnapshot: string;
  verificationGateResult: string;
  verificationGateReason: string;
  reviewEvidenceBundleRef: { path: string; hash: string };
  evidenceCompleteness: string;
  waivedCapabilityGaps: { reason: string; acknowledgedBy: string; justification: string }[];
  migrationSource: "LOCAL_REVIEW_DECISION";
  migrationSourceRef: { path: string; hash: string };
}

// Importing a local review appends a new decision event. It never promotes the
// local file in place, never edits it, and never edits the bundle or the Run
// Trace. The local artifact stays exactly what it was: migration input.
export async function importLocalReview(
  rootDir: string,
  input: {
    objectiveId: string;
    runId: string;
    localReview: Record<string, unknown>;
    localReviewRef: { path: string; hash: string };
    reason: string;
    actorId: string;
  }
): Promise<MutationOutcome<LedgerEvent>> {
  const { objectiveId, runId, localReview, localReviewRef, reason, actorId } = input;

  const reviewDecisionId = String(localReview.reviewDecisionId ?? "");
  const status = String(localReview.localReviewStatus ?? "");
  const bundleRef = (localReview.reviewEvidenceBundleRef ?? {}) as { path?: string; contentHash?: string };
  const bundleHash = String(bundleRef.contentHash ?? "");

  const payload: ReviewDecisionEventPayload = {
    reviewDecisionId,
    objectiveQueueItemId: `${objectiveId}:${String(localReview.taskId ?? "")}:${Number(localReview.taskRevision ?? 1)}`,
    taskId: String(localReview.taskId ?? ""),
    taskRevision: Number(localReview.taskRevision ?? 1),
    runId,
    decision: String(localReview.decision ?? ""),
    actorKind: String(localReview.actorKind ?? "HUMAN"),
    actorId: String(localReview.actorId ?? ""),
    decisionBasis: String(localReview.decisionBasis ?? ""),
    observedResultSnapshot: String(localReview.observedResultSnapshot ?? ""),
    observedCheckSnapshot: String(localReview.observedCheckSnapshot ?? ""),
    verificationGateResult: String(localReview.verificationGateResult ?? ""),
    verificationGateReason: String(localReview.verificationGateReason ?? ""),
    reviewEvidenceBundleRef: { path: String(bundleRef.path ?? ""), hash: bundleHash },
    evidenceCompleteness: String(localReview.evidenceCompleteness ?? ""),
    // A waived acceptance carries its waived gaps into the ledger. Without them
    // a later reader sees ACCEPTED and cannot tell what a person stood in for.
    waivedCapabilityGaps: Array.isArray(localReview.waivedCapabilityGaps)
      ? (localReview.waivedCapabilityGaps as ReviewDecisionEventPayload["waivedCapabilityGaps"])
      : [],
    migrationSource: "LOCAL_REVIEW_DECISION",
    migrationSourceRef: localReviewRef
  };

  return runMutation(
    rootDir,
    {
      mutationKind: "REVIEW_DECISION_IMPORT",
      targetId: objectiveId,
      targetHash: bundleHash,
      semanticPayload: { reviewDecisionId, runId, decision: payload.decision }
    },
    {
      ...objectiveSteps(rootDir, objectiveId, (events) => {
        if (localReview.finalDecisionTruth !== false) {
          throw new Error("local review must carry finalDecisionTruth false");
        }
        // Only a migration-ready artifact is an effective decision. The other
        // derived statuses exist precisely to say this one is not ready.
        if (status !== "MIGRATION_READY" && status !== "MIGRATION_READY_WAIVED") {
          throw new Error(`local review status ${status || "(none)"} cannot be imported`);
        }
        if (bundleHash.length === 0) {
          throw new Error("local review has no ReviewEvidenceBundle hash");
        }

        // Same decision id with a different bundle means two different
        // decisions claiming one identity. Silently overwriting would destroy
        // the earlier one, so migration stops and asks for an explicit
        // supersede instead.
        const collision = events.find(
          (event) =>
            event.type === "RUN_REVIEW_DECIDED" &&
            (event.payload as unknown as ReviewDecisionEventPayload).reviewDecisionId === reviewDecisionId &&
            (event.payload as unknown as ReviewDecisionEventPayload).reviewEvidenceBundleRef.hash !== bundleHash
        );
        if (collision !== undefined) {
          throw new Error(
            `reviewDecisionId ${reviewDecisionId} already imported with a different bundle hash`
          );
        }
      }),
      isAlreadyApplied: async (): Promise<boolean> => {
        const { events } = await readEvents(rootDir, objectiveId);
        return events.some((event) => {
          if (event.type !== "RUN_REVIEW_DECIDED") {
            return false;
          }
          const existing = event.payload as unknown as ReviewDecisionEventPayload;
          return (
            existing.reviewDecisionId === reviewDecisionId &&
            existing.reviewEvidenceBundleRef.hash === bundleHash
          );
        });
      },
      append: async (mutationId): Promise<LedgerEvent> =>
        appendEvent(
          rootDir,
          objectiveId,
          mutationId,
          "RUN_REVIEW_DECIDED",
          actorId,
          reason,
          payload as unknown as Record<string, unknown>
        )
    }
  );
}
