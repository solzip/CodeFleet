#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const APPROVAL_ENV = "CODEFLEET_P1_HANDSHAKE_APPROVED";
export const APPROVAL_VALUE = "P1_APP_SERVER_HANDSHAKE_APPROVED";
export const ALLOWED_OUTBOUND_METHODS = new Set(["initialize", "initialized", "model/list"]);
export const ALLOWED_SERVER_NOTIFICATIONS = new Set(["account/updated", "account/rateLimits/updated"]);
export const LIMITS = Object.freeze({ lineBytes: 256 * 1024, stdoutBytes: 2 * 1024 * 1024, stderrBytes: 64 * 1024, manifestBytes: 64 * 1024, shutdownMs: 2_000 });

const HASH_PATTERN = /^[A-F0-9]{64}$/;
const SECRET_KEY = /(authorization|credential|password|secret|token|api[_-]?key|cookie|email|account)/i;
const SELF_PATH = fileURLToPath(import.meta.url);
const TRANSCRIPT_NAME = "p1-redacted-transcript.jsonl";
const RESULT_NAME = "p1-result.json";

export const initializeRequest = () => ({ method: "initialize", id: 1, params: { clientInfo: { name: "codefleet_host_protocol_proof", title: "CodeFleet Host Protocol Proof", version: "p1" } } });
export const initializedNotification = () => ({ method: "initialized", params: {} });
export const modelListRequest = () => ({ method: "model/list", id: 2, params: { limit: 20, includeHidden: false } });

export function assertAllowedOutbound(message) {
  if (!message || !ALLOWED_OUTBOUND_METHODS.has(message.method)) throw new Error(`outbound method is not approved: ${String(message?.method)}`);
  if (message.method === "initialize" && message.params?.capabilities?.experimentalApi) throw new Error("experimentalApi must remain disabled");
}

export function parseJsonLine(line) {
  if (Buffer.byteLength(line, "utf8") > LIMITS.lineBytes) throw new Error("JSONL line exceeds approved size limit");
  let value;
  try { value = JSON.parse(line); } catch { throw new Error("malformed JSONL response"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSONL response must be an object");
  return value;
}

function selectedModel(model) {
  const efforts = Array.isArray(model?.supportedReasoningEfforts) ? model.supportedReasoningEfforts.map((entry) => typeof entry === "string" ? entry : entry?.reasoningEffort).filter((entry) => typeof entry === "string") : [];
  return { id: typeof model?.id === "string" ? model.id : null, model: typeof model?.model === "string" ? model.model : null, displayName: typeof model?.displayName === "string" ? model.displayName : null, defaultReasoningEffort: typeof model?.defaultReasoningEffort === "string" ? model.defaultReasoningEffort : null, supportedReasoningEfforts: efforts, isDefault: model?.isDefault === true };
}

export function minimalProtocolRecord(direction, message) {
  if (direction === "out") return { direction, method: message.method, ...(Object.hasOwn(message, "id") ? { id: message.id } : {}) };
  if (Object.hasOwn(message, "method")) return { direction, kind: "notification", method: message.method };
  if (message.id === 1) return { direction, kind: "response", id: 1, result: { userAgent: typeof message.result?.userAgent === "string" ? message.result.userAgent : null, platformFamily: typeof message.result?.platformFamily === "string" ? message.result.platformFamily : null, platformOs: typeof message.result?.platformOs === "string" ? message.result.platformOs : null } };
  return { direction, kind: "response", id: 2, result: { data: message.result.data.map(selectedModel) } };
}

export class HandshakeState {
  constructor() { this.expectedId = 1; this.complete = false; }
  accept(message) {
    if (this.complete) throw new Error("message received after handshake completion");
    if (Object.hasOwn(message, "method")) {
      if (Object.hasOwn(message, "id")) throw new Error(`unapproved server request: ${String(message.method)}`);
      if (!ALLOWED_SERVER_NOTIFICATIONS.has(message.method)) throw new Error(`unapproved server notification: ${String(message.method)}`);
      return [];
    }
    if (!Object.hasOwn(message, "id") || message.id !== this.expectedId) throw new Error(`response ID mismatch: expected ${this.expectedId}`);
    if (Object.hasOwn(message, "error")) throw new Error(`protocol error for response ${message.id}`);
    if (!message.result || typeof message.result !== "object" || Array.isArray(message.result)) throw new Error(`response ${message.id} has no object result`);
    if (message.id === 1) { this.expectedId = 2; return [initializedNotification(), modelListRequest()]; }
    if (!Array.isArray(message.result.data)) throw new Error("model/list result.data must be an array");
    this.complete = true;
    return [];
  }
}

export function redact(value, replacements = []) {
  const replaceText = (input) => {
    let output = String(input).replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <REDACTED>").replace(/sk-[A-Za-z0-9_-]{8,}/g, "<REDACTED>").replace(/[A-Z]:\\Users\\[^\\\s]+/gi, "<USER_HOME>");
    for (const [sensitive, label] of replacements) if (sensitive) output = output.split(String(sensitive)).join(label);
    return output;
  };
  const walk = (item, key = "") => {
    if (SECRET_KEY.test(key)) return "<REDACTED>";
    if (typeof item === "string") return replaceText(item);
    if (Array.isArray(item)) return item.map((entry) => walk(entry));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v, k)]));
    return item;
  };
  return walk(value);
}

export function sha256File(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex").toUpperCase()));
  });
}

function expectedHash(value, name) {
  const normalized = String(value ?? "").toUpperCase();
  if (!HASH_PATTERN.test(normalized)) throw new Error(`${name} must be an approved SHA-256`);
  return normalized;
}

async function readManifest(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > LIMITS.manifestBytes) throw new Error("fixture manifest is missing or exceeds size limit");
  try { return JSON.parse(await readFile(path, "utf8")); } catch { throw new Error("fixture manifest is not valid JSON"); }
}

export async function validateIdentity(options, dependencies = {}) {
  for (const [name, path] of [["codex executable", options.codexExe], ["fixture", options.fixture], ["artifacts", options.artifacts], ["manifest", options.manifest]]) if (!path || !isAbsolute(path)) throw new Error(`${name} must be an absolute path`);
  const clientPath = dependencies.clientPath ?? SELF_PATH;
  const [codexExe, fixture, artifacts, manifest, actualClient] = await Promise.all([realpath(options.codexExe), realpath(options.fixture), realpath(options.artifacts), realpath(options.manifest), realpath(clientPath)]);
  const samePath = (left, right) => process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
  if (!samePath(options.fixture, fixture) || !samePath(options.artifacts, artifacts) || !samePath(options.manifest, manifest) || !samePath(clientPath, actualClient)) throw new Error("Fixture path resolves through an unapproved link or Junction");
  if ((dependencies.platform ?? process.platform) === "win32" && basename(codexExe).toLowerCase() !== "codex.exe") throw new Error("Windows P1 requires native codex.exe");
  if (!(await stat(codexExe)).isFile() || !(await stat(actualClient)).isFile()) throw new Error("approved executable or client is not a file");
  if (!(await stat(fixture)).isDirectory() || !(await stat(artifacts)).isDirectory()) throw new Error("fixture and artifacts must be directories");
  if (resolve(artifacts) !== resolve(join(fixture, "proof-artifacts"))) throw new Error("artifact path is not the approved Fixture artifact directory");
  if (resolve(manifest) !== resolve(join(fixture, "fixture-manifest.json"))) throw new Error("manifest path is not the approved Fixture manifest");
  if (resolve(actualClient) !== resolve(join(fixture, "proof-client", "p1-appserver-handshake.mjs"))) throw new Error("executed client path is not the approved Fixture client");
  const input = await realpath(join(fixture, "input.txt"));
  if (!samePath(input, join(fixture, "input.txt"))) throw new Error("Fixture input resolves through an unapproved link or Junction");
  const rootEntries = (await readdir(fixture)).sort();
  if (JSON.stringify(rootEntries) !== JSON.stringify(["fixture-manifest.json", "input.txt", "proof-artifacts", "proof-client"])) throw new Error("Fixture contains an unapproved root entry");
  if ((await readdir(artifacts)).length !== 0) throw new Error("artifact directory must be empty before spawn");
  if (JSON.stringify(await readdir(join(fixture, "proof-client"))) !== JSON.stringify(["p1-appserver-handshake.mjs"])) throw new Error("proof-client directory contains an unapproved entry");
  const expected = { codex: expectedHash(options.codexSha256, "codex executable hash"), client: expectedHash(options.clientSha256, "proof client hash"), input: expectedHash(options.inputSha256, "fixture input hash"), manifest: expectedHash(options.manifestSha256, "fixture manifest hash") };
  const actual = { codex: await sha256File(codexExe), client: await sha256File(actualClient), input: await sha256File(input), manifest: await sha256File(manifest) };
  for (const key of Object.keys(expected)) if (actual[key] !== expected[key]) throw new Error(`${key} identity hash mismatch before spawn`);
  const manifestData = await readManifest(manifest);
  if (manifestData?.proofRoot !== "<PROOF_ROOT>" || manifestData?.artifacts !== "<PROOF_ARTIFACTS>" || manifestData?.input?.path !== "<PROOF_INPUT>" || manifestData?.proofClient?.path !== "<PROOF_CLIENT>" || manifestData?.proofOutput?.path !== "<PROOF_OUTPUT>" || manifestData?.proofOutput?.exists !== false || manifestData?.artifactCount !== 0 || manifestData?.linksOrJunctions !== false) throw new Error("fixture manifest path binding is invalid");
  if (String(manifestData.input.sha256).toUpperCase() !== expected.input || String(manifestData.proofClient.sha256).toUpperCase() !== expected.client) throw new Error("fixture manifest content hashes do not match approval");
  return { codexExe, fixture, artifacts, manifest, clientPath: actualClient, input, hashes: actual };
}

function writeJsonLine(stream, message) { assertAllowedOutbound(message); stream.write(`${JSON.stringify(message)}\n`); }
function waitForExit(child) { return child.exitCode !== null || child.signalCode !== null ? Promise.resolve({ code: child.exitCode, signal: child.signalCode }) : new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal }))); }
async function waitBounded(promise, timeoutMs, label) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), timeoutMs); })]); } finally { clearTimeout(timer); } }
async function stopChild(child, shutdownMs) {
  child.stdin?.end();
  try { return { ...(await waitBounded(waitForExit(child), shutdownMs, "App Server did not terminate after stdin EOF")), confirmed: true, forced: false }; }
  catch { child.kill(); try { return { ...(await waitBounded(waitForExit(child), shutdownMs, "App Server termination could not be confirmed")), confirmed: true, forced: true }; } catch { return { code: child.exitCode, signal: child.signalCode, confirmed: false, forced: true }; } }
}

async function writeEvidence(paths, transcript, result) {
  const transcriptPayload = transcript.map((entry) => JSON.stringify(entry)).join("\n") + (transcript.length ? "\n" : "");
  const transcriptHash = createHash("sha256").update(transcriptPayload).digest("hex").toUpperCase();
  const finalResult = { ...result, transcriptSha256: transcriptHash };
  await writeFile(join(paths.artifacts, TRANSCRIPT_NAME), transcriptPayload, { encoding: "utf8", flag: "wx" });
  await writeFile(join(paths.artifacts, RESULT_NAME), `${JSON.stringify(finalResult, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return finalResult;
}

export async function runProof(options, dependencies = {}) {
  const started = Date.now();
  const paths = await validateIdentity(options, dependencies);
  const replacements = [[paths.codexExe, "<CODEX_EXE>"], [paths.fixture, "<PROOF_ROOT>"], [paths.artifacts, "<PROOF_ARTIFACTS>"], [paths.clientPath, "<PROOF_CLIENT>"]];
  const commandArgs = dependencies.commandArgs ?? ["app-server", "--listen", "stdio://", "--strict-config"];
  const child = (dependencies.spawnImpl ?? spawn)(dependencies.command ?? paths.codexExe, commandArgs, { cwd: paths.fixture, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const state = new HandshakeState();
  const transcript = [];
  let stdoutBytes = 0; let stderrBytes = 0; let stdoutBuffer = ""; let failure; let handshakeResolve; let handshakeReject;
  const handshake = new Promise((resolveHandshake, rejectHandshake) => { handshakeResolve = resolveHandshake; handshakeReject = rejectHandshake; });
  const fail = (error) => { if (!failure) { failure = error instanceof Error ? error : new Error(String(error)); handshakeReject(failure); } };
  child.once("error", fail);
  child.stderr.on("data", (chunk) => { stderrBytes += chunk.length; if (stderrBytes > LIMITS.stderrBytes) fail(new Error("stderr exceeded approved size limit")); });
  child.stdout.on("data", (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > LIMITS.stdoutBytes) { fail(new Error("stdout exceeded approved size limit")); return; }
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/); stdoutBuffer = lines.pop() ?? "";
    try {
      for (const line of lines) {
        if (!line.trim()) continue;
        const incoming = parseJsonLine(line); const outgoing = state.accept(incoming);
        transcript.push(redact(minimalProtocolRecord("in", incoming), replacements));
        for (const message of outgoing) { transcript.push(minimalProtocolRecord("out", message)); writeJsonLine(child.stdin, message); }
        if (state.complete) handshakeResolve();
      }
    } catch (error) { fail(error); }
  });
  child.once("exit", (code, signal) => { if (!state.complete) fail(new Error(`App Server exited before handshake completion (${code ?? signal})`)); });
  const initial = initializeRequest(); transcript.push(minimalProtocolRecord("out", initial)); writeJsonLine(child.stdin, initial);
  try { await waitBounded(handshake, options.timeoutMs, "P1 handshake timeout"); } catch (error) { failure = failure ?? error; }
  const termination = await stopChild(child, dependencies.shutdownMs ?? LIMITS.shutdownMs);
  if (!termination.confirmed) failure = failure ?? new Error("App Server termination could not be confirmed");
  if (!failure && termination.forced) failure = new Error("App Server required forced termination after handshake");
  if (!failure && termination.code !== 0) failure = new Error(`App Server exited with nonzero status ${termination.code}`);
  const result = await writeEvidence(paths, transcript, { status: failure ? "P1_FAILED" : "P1_HANDSHAKE_OBSERVED", passed: !failure && termination.confirmed && termination.code === 0, command: ["<CODEX_EXE>", "app-server", "--listen", "stdio://", "--strict-config"], elapsedMs: Date.now() - started, stdoutBytes, stderrBytes, termination, error: failure ? redact(failure.message, replacements) : null });
  if (!result.passed) throw Object.assign(new Error(result.error ?? "P1 failed"), { evidence: result });
  return result;
}

function parseArgs(argv) {
  const parsed = { execute: false, timeoutMs: 300_000 };
  const names = new Map([["--codex-exe", "codexExe"], ["--fixture", "fixture"], ["--artifacts", "artifacts"], ["--manifest", "manifest"], ["--codex-sha256", "codexSha256"], ["--client-sha256", "clientSha256"], ["--input-sha256", "inputSha256"], ["--manifest-sha256", "manifestSha256"]]);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--execute") parsed.execute = true;
    else if (argv[i] === "--timeout-ms") parsed.timeoutMs = Number(argv[++i]);
    else if (names.has(argv[i])) parsed[names.get(argv[i])] = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 1 || parsed.timeoutMs > 300_000) throw new Error("timeout must be 1..300000 ms");
  return parsed;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (!options.execute) return { mode: "dry-run", appServerStarted: false, allowedMethods: [...ALLOWED_OUTBOUND_METHODS], requiredIdentityHashes: ["codex", "client", "input", "manifest"] };
  if (env[APPROVAL_ENV] !== APPROVAL_VALUE) throw new Error("separate P1 execution acknowledgement is missing; it does not replace owner approval or hash verification");
  return runProof(options);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntrypoint) main().then((result) => process.stdout.write(`${JSON.stringify(redact(result))}\n`)).catch((error) => { process.stderr.write(`${JSON.stringify({ status: "FAILED", error: redact(error.message), evidence: error.evidence ? redact(error.evidence) : undefined })}\n`); process.exitCode = 1; });
