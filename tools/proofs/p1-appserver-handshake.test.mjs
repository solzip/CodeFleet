import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  HandshakeState,
  assertAllowedOutbound,
  initializeRequest,
  parseJsonLine,
  redact,
  terminateChild,
  withTimeout,
} from "./p1-appserver-handshake.mjs";

test("accepts only the fixed initialize and model/list response sequence", () => {
  const state = new HandshakeState();
  const next = state.accept({ id: 1, result: { userAgent: "codex" } });
  assert.deepEqual(next.map((message) => message.method), ["initialized", "model/list"]);
  assert.deepEqual(state.accept({ id: 2, result: { data: [] } }), []);
  assert.equal(state.complete, true);
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseJsonLine("{"), /malformed JSONL/);
});

test("rejects mismatched and duplicate response IDs", () => {
  assert.throws(() => new HandshakeState().accept({ id: 2, result: {} }), /ID mismatch/);
  const state = new HandshakeState();
  state.accept({ id: 1, result: {} });
  assert.throws(() => state.accept({ id: 1, result: {} }), /ID mismatch/);
});

test("rejects unapproved outbound and inbound methods", () => {
  assert.throws(() => assertAllowedOutbound({ method: "thread/start" }), /not approved/);
  assert.throws(() => new HandshakeState().accept({ id: 99, method: "approval/request", params: {} }), /unapproved server/);
  assert.doesNotThrow(() => assertAllowedOutbound(initializeRequest()));
});

test("rejects experimentalApi", () => {
  const request = initializeRequest();
  request.params.capabilities = { experimentalApi: true };
  assert.throws(() => assertAllowedOutbound(request), /experimentalApi/);
});

test("timeout fails closed", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), /timeout/);
});

test("termination closes stdin and kills a live child", () => {
  const calls = [];
  terminateChild({ stdin: { end: () => calls.push("end") }, exitCode: null, signalCode: null, kill: () => calls.push("kill") });
  assert.deepEqual(calls, ["end", "kill"]);
});

test("redacts secrets and private paths", () => {
  const value = redact({ token: "abc", detail: "Bearer abc.def", path: "C:\\private\\proof" }, [["C:\\private", "<HOME>"]]);
  assert.deepEqual(value, { token: "<REDACTED>", detail: "Bearer <REDACTED>", path: "<HOME>\\proof" });
});

test("default CLI is dry-run and does not require or launch Codex", () => {
  const client = fileURLToPath(new URL("./p1-appserver-handshake.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [client], { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, "dry-run");
  assert.equal(output.appServerStarted, false);
});

test("execute mode fails before spawn without separate approval acknowledgement", () => {
  const client = fileURLToPath(new URL("./p1-appserver-handshake.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [client, "--execute"], { encoding: "utf8", shell: false, env: {} });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /approval acknowledgement is missing/);
});
