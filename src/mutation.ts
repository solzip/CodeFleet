// Mutation Engine — the single window for state change.
//
// Every phase below is fixed by MUTATION_COMMAND_PHASES_ARE_FIXED. M4 is the
// commit point: nothing before it leaves a durable change, and a failure after
// it keeps the appended event rather than rolling back, because this design
// forbids silent rollback and ledger rewriting.

import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type MutationPhase =
  | "M0_RESOLVE"
  | "M1_ACQUIRE"
  | "M2_PRECHECK"
  | "M3_IDEMPOTENCY"
  | "M4_APPEND"
  | "M5_REBUILD"
  | "M6_POSTCHECK"
  | "M7_RELEASE";

export interface MutationIntent {
  mutationKind: string;
  /** Identifier of the thing being changed, such as an objectiveId. */
  targetId: string;
  /** Content hash of what is being approved or accepted, when one applies. */
  targetHash?: string;
  /** Only fields that change the resulting state. Never reason text or time. */
  semanticPayload: Record<string, unknown>;
}

export interface LockHolder {
  pid: number;
  host: string;
  startedAt: string;
  mutationId: string;
  mutationKind: string;
}

export interface MutationOutcome<T> {
  mutationId: string;
  applied: boolean;
  /** Set when M3 found the mutation already in the ledger. */
  alreadyApplied: boolean;
  failedPhase: MutationPhase | null;
  failureMessage: string;
  result: T | null;
}

export class MutationLockHeldError extends Error {
  readonly holder: LockHolder | null;

  constructor(holder: LockHolder | null) {
    super(
      holder === null
        ? "Mutation lock is held by another process."
        : `Mutation lock is held by pid ${holder.pid} on ${holder.host} since ${holder.startedAt} (${holder.mutationKind}).`
    );
    this.name = "MutationLockHeldError";
    this.holder = holder;
  }
}

// mutationId is derived from the intent, never from time or execution order, so
// running the same command twice is a no-op rather than a second event. Reason
// text is excluded so fixing a typo does not create a duplicate mutation.
export function computeMutationId(intent: MutationIntent): string {
  const canonical = JSON.stringify([
    intent.mutationKind,
    intent.targetId,
    intent.targetHash ?? "",
    canonicalize(intent.semanticPayload)
  ]);
  return `mut_${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

export interface MutationSteps<T> {
  /**
   * M2. Throw to block the mutation before anything durable happens.
   * Receives the mutationId so it can leave an identical repeat to M3 rather
   * than rejecting it as a conflict.
   */
  precheck: (mutationId: string) => Promise<void>;
  /** M3. Return true when this mutationId is already present. */
  isAlreadyApplied: () => Promise<boolean>;
  /** M4. The commit point. */
  append: (mutationId: string) => Promise<T>;
  /** M5. */
  rebuild: () => Promise<void>;
  /** M6. Throw when the rebuilt state does not validate. */
  postcheck: () => Promise<void>;
}

export async function runMutation<T>(
  rootDir: string,
  intent: MutationIntent,
  steps: MutationSteps<T>
): Promise<MutationOutcome<T>> {
  const mutationId = computeMutationId(intent);
  const lockPath = path.join(rootDir, ".codefleet", "locks", "workspace.lock");
  await acquireLock(lockPath, mutationId, intent.mutationKind);

  let appended = false;
  let result: T | null = null;

  try {
    try {
      await steps.precheck(mutationId);
    } catch (error) {
      return failure(mutationId, "M2_PRECHECK", error, false, null);
    }

    if (await steps.isAlreadyApplied()) {
      return {
        mutationId,
        applied: false,
        alreadyApplied: true,
        failedPhase: null,
        failureMessage: "",
        result: null
      };
    }

    try {
      result = await steps.append(mutationId);
      appended = true;
    } catch (error) {
      return failure(mutationId, "M4_APPEND", error, false, null);
    }

    try {
      await steps.rebuild();
    } catch (error) {
      // The event is durable and valid; only the derived snapshot failed. This
      // design forbids rolling the event back, so the command reports a
      // snapshot failure while the mutation stands.
      return failure(mutationId, "M5_REBUILD", error, appended, result);
    }

    try {
      await steps.postcheck();
    } catch (error) {
      return failure(mutationId, "M6_POSTCHECK", error, appended, result);
    }

    return {
      mutationId,
      applied: true,
      alreadyApplied: false,
      failedPhase: null,
      failureMessage: "",
      result
    };
  } finally {
    // M7 runs on every exit path once M1 succeeded.
    await rm(lockPath, { force: true });
  }
}

async function acquireLock(lockPath: string, mutationId: string, mutationKind: string): Promise<void> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const holder: LockHolder = {
    pid: process.pid,
    host: hostName(),
    startedAt: new Date().toISOString(),
    mutationId,
    mutationKind
  };

  try {
    // Exclusive create is what makes this a single winner rather than a race.
    const handle = await open(lockPath, "wx");
    await handle.writeFile(
      `${JSON.stringify({ schemaVersion: "1.0", documentKind: "MUTATION_LOCK", holder }, null, 2)}\n`,
      "utf8"
    );
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    // Fail fast and name the holder. A stale lock is never broken
    // automatically; removing it is an explicit human action.
    throw new MutationLockHeldError(await readHolder(lockPath));
  }
}

export async function readHolder(lockPath: string): Promise<LockHolder | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as { holder?: LockHolder };
    return parsed.holder ?? null;
  } catch {
    return null;
  }
}

export async function breakLock(rootDir: string): Promise<LockHolder | null> {
  const lockPath = path.join(rootDir, ".codefleet", "locks", "workspace.lock");
  const holder = await readHolder(lockPath);
  await rm(lockPath, { force: true });
  return holder;
}

export function lockPathFor(rootDir: string): string {
  return path.join(rootDir, ".codefleet", "locks", "workspace.lock");
}

function failure<T>(
  mutationId: string,
  phase: MutationPhase,
  error: unknown,
  appended: boolean,
  result: T | null
): MutationOutcome<T> {
  return {
    mutationId,
    applied: appended,
    alreadyApplied: false,
    failedPhase: phase,
    failureMessage: error instanceof Error ? error.message : String(error),
    result
  };
}

// Key order must not change the id, so objects are serialised deterministically.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return entries.map(([key, item]) => [key, canonicalize(item)]);
  }
  return value;
}

function hostName(): string {
  try {
    return process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
