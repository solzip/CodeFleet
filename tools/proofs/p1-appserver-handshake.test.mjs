import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const root = await mkdtemp(join(tmpdir(), "codefleet-p1-fake-"));
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
  assert.throws(() => state.accept({ id: 10, method: "account/chatgptAuthTokens/refresh", params: {} }), /server request/);
  assert.throws(() => state.accept({ method: "unverified/event", params: {} }), /server notification/);
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

for (const [scenario, pattern] of [
  ["mismatch", /ID mismatch/],
  ["malformed", /malformed JSONL/],
  ["request", /server request/],
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
