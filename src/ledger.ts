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
  | "OBJECTIVE_CANCELED";

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
  queue: unknown[];
  cursor: { objectiveQueueItemId: string; derived: true };
  replay: {
    replayStatus: "COMPLETE" | "BLOCKED";
    lastSeq: number;
    sourceHash: string;
    generatedAt: string;
    unavailableReasons: string[];
    findings: ReplayFinding[];
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
  let status: ObjectiveStatus = "OPEN";
  let kind: ObjectiveKind = "ONE_OFF";
  let title = "";

  if (!structural) {
    for (const event of ordered) {
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
      }
    }
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
    queue: [],
    cursor: { objectiveQueueItemId: "", derived: true },
    replay: {
      replayStatus: structural ? "BLOCKED" : "COMPLETE",
      lastSeq: ordered.length === 0 ? 0 : ordered[ordered.length - 1].seq,
      sourceHash,
      generatedAt: new Date().toISOString(),
      // A blocked replay must not present itself as a fresh complete snapshot.
      unavailableReasons: structural ? ["LEDGER_STRUCTURAL_FAILURE"] : [],
      findings
    }
  };

  return { snapshot, findings };
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
