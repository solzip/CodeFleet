#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const APPROVAL_ENV = "CODEFLEET_P1_HANDSHAKE_APPROVED";
export const APPROVAL_VALUE = "P1_APP_SERVER_HANDSHAKE_APPROVED";
export const ALLOWED_METHODS = new Set(["initialize", "initialized", "model/list"]);
const REQUEST_IDS = new Set([1, 2]);
const MAX_LINE_BYTES = 1024 * 1024;
const SECRET_KEY = /(authorization|credential|password|secret|token|api[_-]?key|cookie)/i;

export function initializeRequest() {
  return {
    method: "initialize",
    id: 1,
    params: {
      clientInfo: {
        name: "codefleet_host_protocol_proof",
        title: "CodeFleet Host Protocol Proof",
        version: "p1",
      },
    },
  };
}

export function initializedNotification() {
  return { method: "initialized", params: {} };
}

export function modelListRequest() {
  return { method: "model/list", id: 2, params: { limit: 20, includeHidden: false } };
}

export function assertAllowedOutbound(message) {
  if (!message || !ALLOWED_METHODS.has(message.method)) {
    throw new Error(`outbound method is not approved: ${String(message?.method)}`);
  }
  if (message.method === "initialize" && message.params?.capabilities?.experimentalApi) {
    throw new Error("experimentalApi must remain disabled");
  }
}

export function parseJsonLine(line) {
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) throw new Error("JSONL line exceeds limit");
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("malformed JSONL response");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSONL response must be an object");
  }
  return value;
}

export class HandshakeState {
  constructor() {
    this.expectedId = 1;
    this.complete = false;
  }

  accept(message) {
    if (this.complete) throw new Error("response received after handshake completion");
    if (Object.hasOwn(message, "method")) {
      throw new Error(`unapproved server request or notification: ${String(message.method)}`);
    }
    if (!Object.hasOwn(message, "id") || !REQUEST_IDS.has(message.id) || message.id !== this.expectedId) {
      throw new Error(`response ID mismatch: expected ${this.expectedId}`);
    }
    if (Object.hasOwn(message, "error")) throw new Error(`protocol error for response ${message.id}`);
    if (!Object.hasOwn(message, "result") || !message.result || typeof message.result !== "object") {
      throw new Error(`response ${message.id} has no object result`);
    }

    if (message.id === 1) {
      this.expectedId = 2;
      return [initializedNotification(), modelListRequest()];
    }
    if (!Array.isArray(message.result.data)) throw new Error("model/list result.data must be an array");
    this.complete = true;
    return [];
  }
}

export function withTimeout(promise, timeoutMs, message = "P1 handshake timeout") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

export function terminateChild(child) {
  child.stdin?.end?.();
  if (child.exitCode === null && child.signalCode === null) child.kill?.();
}

export function redact(value, replacements = []) {
  const replaceText = (input) => {
    let output = String(input)
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <REDACTED>")
      .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "<REDACTED>");
    for (const [sensitive, label] of replacements) {
      if (sensitive) output = output.split(String(sensitive)).join(label);
    }
    return output;
  };
  const walk = (item, key = "") => {
    if (SECRET_KEY.test(key)) return "<REDACTED>";
    if (typeof item === "string") return replaceText(item);
    if (Array.isArray(item)) return item.map((entry) => walk(entry));
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v, k)]));
    }
    return item;
  };
  return walk(value);
}

function parseArgs(argv) {
  const parsed = { execute: false, timeoutMs: 300_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--execute") parsed.execute = true;
    else if (["--codex-exe", "--fixture", "--artifacts", "--timeout-ms"].includes(arg)) {
      if (!argv[i + 1]) throw new Error(`missing value for ${arg}`);
      const key = { "--codex-exe": "codexExe", "--fixture": "fixture", "--artifacts": "artifacts", "--timeout-ms": "timeoutMs" }[arg];
      parsed[key] = arg === "--timeout-ms" ? Number(argv[++i]) : argv[++i];
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 1 || parsed.timeoutMs > 300_000) {
    throw new Error("timeout must be an integer from 1 to 300000 ms");
  }
  return parsed;
}

async function validateExecutionPaths(options) {
  for (const [name, path] of [["codex executable", options.codexExe], ["fixture", options.fixture], ["artifacts", options.artifacts]]) {
    if (!path || !isAbsolute(path)) throw new Error(`${name} must be an absolute path`);
  }
  if (process.platform === "win32" && basename(options.codexExe).toLowerCase() !== "codex.exe") {
    throw new Error("Windows P1 requires the native codex.exe, not a cmd/bat shim");
  }
  const [codexExe, fixture, artifacts] = await Promise.all([
    realpath(options.codexExe), realpath(options.fixture), realpath(options.artifacts),
  ]);
  if (!(await stat(codexExe)).isFile()) throw new Error("codex executable is not a file");
  if (!(await stat(fixture)).isDirectory() || !(await stat(artifacts)).isDirectory()) {
    throw new Error("fixture and artifacts must be directories");
  }
  if (resolve(artifacts) !== resolve(join(fixture, "proof-artifacts"))) {
    throw new Error("artifacts must be <PROOF_ROOT>/proof-artifacts");
  }
  return { codexExe, fixture, artifacts };
}

function writeJsonLine(stream, message) {
  assertAllowedOutbound(message);
  stream.write(`${JSON.stringify(message)}\n`);
}

async function runHandshake(options) {
  const paths = await validateExecutionPaths(options);
  const replacements = [[paths.codexExe, "<CODEX_EXE>"], [paths.fixture, "<PROOF_ROOT>"], [paths.artifacts, "<PROOF_ARTIFACTS>"]];
  const child = spawn(paths.codexExe, ["app-server", "--listen", "stdio://", "--strict-config"], {
    cwd: paths.fixture,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const state = new HandshakeState();
  const transcript = [];
  let stdoutBuffer = "";
  let stderrBuffer = "";

  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    const fail = (error) => rejectCompletion(error instanceof Error ? error : new Error(String(error)));
    child.once("error", fail);
    child.stderr.on("data", (chunk) => { stderrBuffer += chunk.toString("utf8"); });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      try {
        for (const line of lines) {
          if (!line.trim()) continue;
          const incoming = parseJsonLine(line);
          transcript.push({ direction: "in", message: redact(incoming, replacements) });
          const outgoing = state.accept(incoming);
          for (const message of outgoing) {
            transcript.push({ direction: "out", message });
            writeJsonLine(child.stdin, message);
          }
          if (state.complete) resolveCompletion();
        }
      } catch (error) { fail(error); }
    });
    child.once("exit", (code, signal) => {
      if (!state.complete) fail(new Error(`App Server exited before completion (${code ?? signal})`));
    });
    const initial = initializeRequest();
    transcript.push({ direction: "out", message: initial });
    writeJsonLine(child.stdin, initial);
  });

  try {
    await withTimeout(completion, options.timeoutMs);
    await mkdir(paths.artifacts, { recursive: false }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    const payload = transcript.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    await writeFile(join(paths.artifacts, "p1-redacted-transcript.jsonl"), payload, { encoding: "utf8", flag: "wx" });
    return { status: "P1_HANDSHAKE_OBSERVED", messages: transcript.length, stderrObserved: stderrBuffer.length > 0 };
  } finally {
    terminateChild(child);
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (!options.execute) {
    return {
      mode: "dry-run",
      appServerStarted: false,
      allowedMethods: [...ALLOWED_METHODS],
      executeRequires: [`--execute`, `${APPROVAL_ENV}=${APPROVAL_VALUE}`],
    };
  }
  if (env[APPROVAL_ENV] !== APPROVAL_VALUE) throw new Error("separate P1 execution approval acknowledgement is missing");
  return runHandshake(options);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(redact(result))}\n`);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAILED", error: redact(error.message) })}\n`);
    process.exitCode = 1;
  });
}
