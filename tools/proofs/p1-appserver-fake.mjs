#!/usr/bin/env node

import readline from "node:readline";

const scenario = process.argv[2] ?? "success";
const send = (value) => process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`);
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    if (scenario === "crash") process.exit(23);
    if (scenario === "malformed") return send("{");
    if (scenario === "mismatch") return send({ id: 9, result: {} });
    if (scenario === "oversize") return send({ id: 1, result: { userAgent: "x".repeat(300_000) } });
    if (scenario === "stdout-limit") {
      for (let i = 0; i < 11; i += 1) send({ method: "account/updated", params: { padding: "x".repeat(200_000) } });
      return;
    }
    if (scenario === "stderr-limit") process.stderr.write("x".repeat(70_000));
    if (scenario === "request") send({ id: 77, method: "account/chatgptAuthTokens/refresh", params: { token: "never-record" } });
    if (scenario === "remote-control-request") send({ id: 77, method: "remoteControl/status/changed", params: { serverName: "never-record", installationId: "never-record", environmentId: "never-record" } });
    if (scenario === "notification") send({ method: "account/updated", params: { email: "private@example.test", token: "never-record" } });
    if (scenario === "remote-control-notification") send({ method: "remoteControl/status/changed", params: { serverName: "never-record", installationId: "never-record", environmentId: "never-record" } });
    if (scenario === "unknown-notification") send({ method: "unverified/event", params: { secret: "never-record" } });
    send({ id: 1, result: { userAgent: "fake", platformFamily: "test", platformOs: "test", account: { email: "never-record" } } });
  } else if (message.method === "model/list" && scenario !== "missing") {
    send({ id: 2, result: { data: [{ id: "fake-model", model: "fake-model", displayName: "Fake", defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low", description: "omit" }], isDefault: true, credential: "never-record" }] } });
  }
});
rl.on("close", () => {
  if (scenario === "no-exit") setInterval(() => {}, 1_000);
  else process.exit(0);
});
