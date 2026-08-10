import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createObjective,
  detectDrift,
  ledgerPath,
  rebuildSnapshot,
  replayObjective,
  snapshotPath
} from "../src/ledger.ts";
import { computeMutationId, lockPathFor, readHolder } from "../src/mutation.ts";

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
});

test("the lock is released on every exit path, including a blocked mutation", async () => {
  const root = await seed();
  const failed = await create(root, "Invalid ID", "Fix auth");
  assert.equal(failed.failedPhase, "M2_PRECHECK");
  assert.equal(await readHolder(lockPathFor(root)), null, "M7 must run even when M2 blocked");
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
});

test("an unparseable ledger line is a structural failure, not a skipped line", async () => {
  const root = await seed();
  await create(root, "auth-fix", "Fix auth");
  await appendFile(ledgerPath(root, "auth-fix"), "{not json\n", "utf8");

  const { snapshot } = await replayObjective(root, "auth-fix");
  assert.equal(snapshot.replay.replayStatus, "BLOCKED");
  assert.ok(snapshot.replay.findings.some((f) => f.checkId === "LEDGER_JSONL_PARSE"));
});
