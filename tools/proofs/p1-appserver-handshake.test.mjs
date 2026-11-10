import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  HandshakeState,
  LIMITS,
  assertAllowedOutbound,
  initializeRequest,
  minimalProtocolRecord,
  parseJsonLine,
  redact,
  runProof,
  sha256File,
} from "./p1-appserver-handshake.mjs";

const sourceClient = fileURLToPath(new URL("./p1-appserver-handshake.mjs", import.meta.url));
const fakeServer = fileURLToPath(new URL("./p1-appserver-fake.mjs", import.meta.url));

async function fixture(t) {
  // The Windows runner may expose TEMP through a short-path alias or junction.
  // Use the actual canonical root for this disposable fake fixture; do not
  // relax the real P1 client\'s link/Junction and identity checks.
  const root = await realpath(await mkdtemp(join(tmpdir(), "codefleet-p1-fake-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = join(root, "proof-artifacts");
  const clientDir = join(root, "proof-client");
  const client = join(clientDir, basename(sourceClient));
  const input = join(root, "input.txt");
  const manifest = join(root, "fixture-manifest.json");
  await mkdir(artifacts);
  await mkdir(clientDir);
  await cp(sourceClient, client);
  await writeFile(input, "CODEFLEET_HOST_PROTOCOL_PROOF_P1_INPUT_V1\n", "utf8");
  const inputSha256 = await sha256File(input);
  const clientSha256 = await sha256File(client);
  await writeFile(manifest, `${JSON.stringify({
    manifestVersion: 1,
    proofRoot: "<PROOF_ROOT>",
    artifacts: "<PROOF_ARTIFACTS>",
    input: { path: "<PROOF_INPUT>", sha256: inputSha256 },
    proofClient: { path: "<PROOF_CLIENT>", sha256: clientSha256 },
    proofOutput: { path: "<PROOF_OUTPUT>", exists: false },
    artifactCount: 0,
    linksOrJunctions: false,
  }, null, 2)}\n`, "utf8");
  return {
    root, artifacts, client, manifest,
    options: {
      codexExe: process.execPath,
      fixture: root,
      artifacts,
      manifest,
      codexSha256: await sha256File(process.execPath),
      clientSha256,
      inputSha256,
      manifestSha256: await sha256File(manifest),
      timeoutMs: 250,
    },
  };
}

async function runScenario(t, scenario, overrides = {}) {
  const prepared = await fixture(t);
  const dependencies = {
    clientPath: prepared.client,
    platform: "test",
    command: process.execPath,
    commandArgs: [fakeServer, scenario],
    spawnImpl: spawn,
    shutdownMs: 250,
  };
  return { prepared, promise: runProof({ ...prepared.options, ...overrides }, dependencies) };
}

test("state distinguishes allowed notification from server request and unknown notification", () => {
  const state = new HandshakeState();
  assert.deepEqual(state.accept({ method: "account/updated", params: { email: "omit" } }), []);
  assert.deepEqual(state.accept({ method: "remoteControl/status/changed", params: { serverName: "omit" } }), []);
  assert.equal(state.notificationCounts.get("remoteControl/status/changed"), 1);
  assert.throws(() => state.accept({ id: 10, method: "account/chatgptAuthTokens/refresh", params: {} }), /server request/);
  assert.throws(() => state.accept({ method: "unverified/event", params: {} }), /server notification/);
});

test("duplicate response ID is rejected after the state advances", () => {
  const state = new HandshakeState();
  state.accept({ id: 1, result: {} });
  assert.throws(() => state.accept({ id: 1, result: {} }), /ID mismatch/);
});

test("parsing rejects malformed and oversized JSONL", () => {
  assert.throws(() => parseJsonLine("{"), /malformed/);
  assert.throws(() => parseJsonLine(`{"x":"${"x".repeat(LIMITS.lineBytes)}"}`), /size limit/);
});

test("outbound allowlist rejects thread and experimental methods", () => {
  assert.throws(() => assertAllowedOutbound({ method: "thread/start" }), /not approved/);
  const request = initializeRequest();
  request.params.capabilities = { experimentalApi: true };
  assert.throws(() => assertAllowedOutbound(request), /experimentalApi/);
});

test("minimal records omit account, credential, descriptions, and notification params", () => {
  const notification = minimalProtocolRecord("in", { method: "account/updated", params: { token: "secret" } });
  const models = minimalProtocolRecord("in", { id: 2, result: { data: [{ id: "m", supportedReasoningEfforts: [{ reasoningEffort: "low", description: "omit" }], credential: "omit" }] } });
  assert.deepEqual(notification, { direction: "in", kind: "notification", method: "account/updated" });
  assert.deepEqual(models.result.data[0].supportedReasoningEfforts, ["low"]);
  assert.equal(JSON.stringify(models).includes("credential"), false);
  assert.equal(JSON.stringify(models).includes("description"), false);
});

test("redaction removes secrets and user paths", () => {
  const output = redact({ token: "abc", detail: "Bearer abc.def", path: "C:\\Users\\private\\proof" });
  assert.equal(JSON.stringify(output).includes("abc"), false);
  assert.equal(output.path, "<USER_HOME>\\proof");
});

test("fake process completes handshake, exits zero, and writes hashed minimal evidence", async (t) => {
  const { prepared, promise } = await runScenario(t, "success");
  const result = await promise;
  assert.equal(result.passed, true);
  assert.equal(result.termination.confirmed, true);
  assert.equal(result.termination.code, 0);
  assert.equal(result.termination.forced, false);
  const transcript = await readFile(join(prepared.artifacts, "p1-redacted-transcript.jsonl"), "utf8");
  assert.equal(await sha256File(join(prepared.artifacts, "p1-redacted-transcript.jsonl")), result.transcriptSha256);
  assert.equal(/never-record|credential|email|account/.test(transcript), false);
  assert.match(transcript, /fake-model/);
});

test("documented stable notification is accepted but its params are omitted", async (t) => {
  const { prepared, promise } = await runScenario(t, "notification");
  await promise;
  const transcript = await readFile(join(prepared.artifacts, "p1-redacted-transcript.jsonl"), "utf8");
  assert.match(transcript, /account\/updated/);
  assert.equal(transcript.includes("private@example.test"), false);
  assert.equal(transcript.includes("never-record"), false);
});

test("remote-control status notification is receive-only, counted, and params are omitted", async (t) => {
  const { prepared, promise } = await runScenario(t, "remote-control-notification");
  const result = await promise;
  const transcript = await readFile(join(prepared.artifacts, "p1-redacted-transcript.jsonl"), "utf8");
  const records = transcript.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(result.notificationCounts["remoteControl/status/changed"], 1);
  assert.equal(records.filter((record) => record.direction === "in" && record.method === "remoteControl/status/changed").length, 1);
  assert.deepEqual(records.filter((record) => record.direction === "out").map((record) => record.method), ["initialize", "initialized", "model/list"]);
  assert.equal(/serverName|installationId|environmentId|never-record/.test(transcript), false);
});

for (const [scenario, pattern] of [
  ["mismatch", /ID mismatch/],
  ["malformed", /malformed JSONL/],
  ["request", /server request/],
  ["remote-control-request", /server request/],
  ["unknown-notification", /server notification/],
  ["crash", /exited before handshake/],
  ["missing", /timeout/],
  ["oversize", /size limit/],
  ["stdout-limit", /stdout exceeded/],
  ["stderr-limit", /stderr exceeded/],
  ["no-exit", /forced termination/],
]) {
  test(`fake process scenario ${scenario} fails closed and records minimal failure evidence`, async (t) => {
    const { prepared, promise } = await runScenario(t, scenario);
    await assert.rejects(promise, pattern);
    const result = JSON.parse(await readFile(join(prepared.artifacts, "p1-result.json"), "utf8"));
    assert.equal(result.passed, false);
    assert.equal(result.termination.confirmed, true);
    assert.equal(JSON.stringify(result).includes("never-record"), false);
  });
}

for (const key of ["codexSha256", "clientSha256", "inputSha256", "manifestSha256"]) {
  test(`${key} mismatch blocks before spawn`, async (t) => {
    const prepared = await fixture(t);
    let spawnCalls = 0;
    await assert.rejects(runProof({ ...prepared.options, [key]: "0".repeat(64) }, {
      clientPath: prepared.client,
      platform: "test",
      spawnImpl: () => { spawnCalls += 1; throw new Error("must not spawn"); },
    }), /hash mismatch before spawn/);
    assert.equal(spawnCalls, 0);
  });
}

test("artifact path mismatch blocks before spawn", async (t) => {
  const prepared = await fixture(t);
  let spawnCalls = 0;
  await assert.rejects(runProof({ ...prepared.options, artifacts: prepared.root }, {
    clientPath: prepared.client,
    platform: "test",
    spawnImpl: () => { spawnCalls += 1; throw new Error("must not spawn"); },
  }), /artifact path/);
  assert.equal(spawnCalls, 0);
});

test("default CLI remains dry-run", () => {
  const result = spawnSync(process.execPath, [sourceClient], { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).requiredIdentityHashes, ["codex", "client", "input", "manifest"]);
});

test("execution acknowledgement is necessary but explicitly not sufficient", () => {
  const result = spawnSync(process.execPath, [sourceClient, "--execute"], { encoding: "utf8", shell: false, env: {} });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not replace owner approval or hash verification/);
});

test("trailing-incomplete proof output cannot be accepted as a completed P1", async (t) => {
  const { prepared, promise } = await runScenario(t, "trailing-incomplete");
  await assert.rejects(promise, /incomplete JSONL/);
  const recorded = JSON.parse(await readFile(join(prepared.artifacts, "p1-result.json"), "utf8"));
  assert.equal(recorded.status, "P1_FAILED");
  assert.equal(recorded.passed, false);
  assert.equal(recorded.termination.confirmed, true);
});

test("post-completion server request is rejected after model/list", async (t) => {
  const { prepared, promise } = await runScenario(t, "trailing-server-request");
  await assert.rejects(promise, /after handshake completion/);
  const recorded = JSON.parse(await readFile(join(prepared.artifacts, "p1-result.json"), "utf8"));
  assert.equal(recorded.status, "P1_FAILED");
  assert.equal(recorded.passed, false);
  assert.equal(JSON.stringify(recorded).includes("never-record"), false);
});

test("proof rejection does not echo attacker-selected server notification names", () => {
  const state = new HandshakeState();
  const marker = "OWNER_PRIVATE_NOTIFICATION_017";
  assert.throws(() => state.accept({ method: "unverified/" + marker, params: {} }),
    error => {
      assert.equal(error.message, "unapproved server notification");
      assert.equal(error.message.includes(marker), false);
      return true;
    });
});
