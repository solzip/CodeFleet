// Codex App Server (0.166.0) bounded, read-only managed Turn transport.
// This module is a Host facility, NOT an approval source, protected verifier,
// filesystem delivery mechanism, or independent CodeFleet scheduler.
// It has no public CLI entrypoint; a trusted caller must bind a reserved Attempt.
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { environment } from '../alpha/process.mjs';

// Stable rust-v0.166.0 Codex notification vocabulary. Delta payloads are
// counted only; they never authorize, verify or set Objective state.
const NOTIFICATIONS = new Set([
  'account/updated', 'account/rateLimits/updated', 'remoteControl/status/changed',
  'thread/started', 'thread/status/changed', 'thread/tokenUsage/updated',
  'turn/started', 'turn/completed','turn/diff/updated','turn/plan/updated',
  'item/started', 'item/completed', 'item/agentMessage/delta',
  'item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded',
  'item/plan/delta'
]);
const WORKSPACE_TOOL_NOTIFICATIONS = new Set([
  'item/commandExecution/outputDelta',
  'item/commandExecution/terminalInteraction',
  'item/fileChange/outputDelta',
  'item/fileChange/patchUpdated'
]);
const INERT_ITEMS = new Set(['userMessage', 'agentMessage', 'reasoning', 'plan', 'contextCompaction']);
const MAX_LINE = 512 * 1024;
const MAX_STDOUT = 4 * 1024 * 1024;
const MAX_STDERR = 64 * 1024;

export class CodexTurnProtocolError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'CodexTurnProtocolError';
    // A Host-side effect cannot be excluded once the process starts.
    this.effectStatus = 'UNVERIFIED';
  }
}
const reject = reason => { throw new CodexTurnProtocolError(reason); };
const recordId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function createCodexTurnProtocol({ cwd, model, prompt, outputSchema, workspaceWrite = false } = {}) {
  if (!isAbsolute(cwd ?? '') || !recordId(model) ||
      typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt) > 160000 ||
      !object(outputSchema)) reject('Explicit cwd, model, bounded prompt and output schema required');
  let phase = 'INITIALIZING';
  let threadId = null;
  let turnId = null;
  let finalMessage = null;
  const toolItems = new Map();
  const notifications = new Map();
  const started = [{ id: 1, method: 'initialize', params: { clientInfo: {
    name: 'codefleet', title: 'CodeFleet Reserved Turn', version: '0.1'
  } } }];
  const count = method => notifications.set(method, (notifications.get(method) ?? 0) + 1);
  const safeItem = item => {
    if (!object(item)) reject('Invalid Host item; effect is uncertain');
    if (INERT_ITEMS.has(item.type)) {
      if (item.type === 'agentMessage' && typeof item.text === 'string') finalMessage = item.text;
      return;
    }
    if (!workspaceWrite || !recordId(item.id) ||
        !['fileChange','commandExecution'].includes(item.type))
      reject('Host tool or unknown item encountered; effect is uncertain');
    // Provenance only: never treat a host tool status as independently
    // observed files, execution confinement or Objective evidence.
    toolItems.set(item.id, { id:item.id, type:item.type,
      status:typeof item.status === 'string' ? item.status : 'UNKNOWN',
      ...(item.type === 'commandExecution' && Number.isInteger(item.exitCode)
        ? { exitCode:item.exitCode } : {}) });
    if (toolItems.size > 100) reject('Host tool item count exceeded');
  };
  return {
    start() { return structuredClone(started); },
    get completed() { return phase === 'COMPLETE'; },
    get phase() { return phase; },
    accept(message) {
      if (!object(message)) reject('Invalid App Server JSONL object');
      if (phase === 'COMPLETE') reject('Unexpected App Server message after completed Turn');
      if (Object.hasOwn(message, 'method')) {
        if (Object.hasOwn(message, 'id')) reject('Unexpected server request; never auto-approve');
        if (!NOTIFICATIONS.has(message.method) &&
            !(workspaceWrite && WORKSPACE_TOOL_NOTIFICATIONS.has(message.method)))
          reject('Unsupported App Server notification: ' + String(message.method));
        count(message.method);
        if (message.method === 'item/started' || message.method === 'item/completed') {
          if (!object(message.params) || !recordId(message.params.threadId) || !recordId(message.params.turnId)) reject('Unbound Host item notification');
          // An unbound agentMessage must not seed a later valid Turn's final receipt.
          // Requiring both reserved IDs also fails closed on pre-response races.
          if (!threadId || !turnId || message.params.threadId !== threadId ||
              message.params.turnId !== turnId) reject('Host item thread/Turn identity mismatch');
          safeItem(message.params.item);
        }
        if (message.method === 'turn/completed') {
          const params = message.params;
          if (phase !== 'RUNNING' || !object(params) || params.threadId !== threadId ||
              !object(params.turn) || params.turn.id !== turnId) reject('Unexpected or unbound Turn completion');
          for (const item of params.turn.items ?? []) safeItem(item);
          if (params.turn.status !== 'completed') reject('Host Turn was not completed');
          if (!finalMessage || Buffer.byteLength(finalMessage) > 128000) reject('Missing or oversized final agent message');
          phase = 'COMPLETE';
        }
        return [];
      }
      if (Object.hasOwn(message, 'error')) reject('App Server request failed');
      if (!object(message.result)) reject('App Server response result missing');
      if (phase === 'INITIALIZING' && message.id === 1) {
        phase = 'STARTING_THREAD';
        return [
          { method: 'initialized', params: {} },
          { id: 2, method: 'thread/start', params: {
            cwd, model, ephemeral: true, approvalPolicy: 'never',
            sandbox: workspaceWrite ? 'workspace-write' : 'read-only',
            serviceName: 'codefleet-reserved-proposal'
          } }
        ];
      }
      if (phase === 'STARTING_THREAD' && message.id === 2) {
        threadId = message.result.thread?.id;
        if (!recordId(threadId)) reject('Host did not return a Thread ID');
        phase = 'STARTING_TURN';
        return [{ id: 3, method: 'turn/start', params: {
          threadId, input: [{ type: 'text', text: prompt, text_elements: [] }],
          approvalPolicy: 'never', sandboxPolicy: workspaceWrite
            ? { type:'workspaceWrite',writableRoots:[cwd],networkAccess:false,
                excludeTmpdirEnvVar:true,excludeSlashTmp:true }
            : { type: 'readOnly', networkAccess: false },
          model, outputSchema
        } }];
      }
      if (phase === 'STARTING_TURN' && message.id === 3) {
        turnId = message.result.turn?.id;
        if (!recordId(turnId)) reject('Host did not return a Turn ID');
        phase = 'RUNNING';
        return [];
      }
      reject('Unexpected App Server response or response ID');
    },
    receipt() {
      if (phase !== 'COMPLETE') reject('No completed Host Turn');
      return { threadId, turnId, text: finalMessage,
        notifications: Object.fromEntries([...notifications].sort(([a], [b]) => a.localeCompare(b))),
        terminalStatus: 'completed', authority: 'PROVIDER_REPORTED_ONLY',
        toolItems:[...toolItems.values()],executionMode:workspaceWrite
          ? 'HOST_WORKSPACE_WRITE_UNPROTECTED' : 'HOST_READ_ONLY_PROPOSAL',
        protectedVerified: false };
    }
  };
}

// A single process, thread and Turn. No retries, login mutation, approvals,
// CLI publication, external model API, or fallback to another Host.
export async function runCodexReadOnlyTurn({ executable, cwd, model, prompt, outputSchema,
  timeoutMs = 120000, cancelled = () => false, spawnImpl = spawn,
  workspaceWrite = false } = {}) {
  if (!isAbsolute(executable ?? '') || !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 || timeoutMs > 180000) reject('Invalid bounded App Server execution parameters');
  const protocol = createCodexTurnProtocol({ cwd, model, prompt, outputSchema, workspaceWrite });
  const child = spawnImpl(executable, ['app-server', '--listen', 'stdio://', '--strict-config'], {
    cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...environment('local'),
      ...(process.env.CODEX_HOME && isAbsolute(process.env.CODEX_HOME)
        ? { CODEX_HOME: process.env.CODEX_HOME } : {}) }
  });
  return await new Promise((resolve, rejectPromise) => {
    let settled = false, stdoutBytes = 0, stderrBytes = 0, buffer = '';
    const decoder = new StringDecoder('utf8');
    let killTimer;
    const clear = () => { clearTimeout(deadline); clearInterval(cancelTimer); clearTimeout(killTimer); };
    const fail = error => {
      if (settled) return;
      settled = true; clear();
      child.stdin?.end();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        killTimer = setTimeout(() => child.kill(), 1000);
        killTimer.unref?.();
      }
      rejectPromise(error instanceof CodexTurnProtocolError ? error :
        new CodexTurnProtocolError('Host Turn failed or became uncertain: ' + String(error?.message ?? error)));
    };
    const deadline = setTimeout(() => fail(new CodexTurnProtocolError('Host Turn deadline exceeded; no replay')), timeoutMs);
    const cancelTimer = setInterval(() => {
      try { if (cancelled()) fail(new CodexTurnProtocolError('Reserved Attempt cancelled; no replay')); }
      catch { fail(new CodexTurnProtocolError('Attempt authorization check failed; no replay')); }
    }, 250);
    child.once('error', fail);
    child.stderr?.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_STDERR) fail(new CodexTurnProtocolError('Host stderr limit exceeded'));
    });
    const send = message => {
      if (!['initialize', 'initialized', 'thread/start', 'turn/start'].includes(message.method)) reject('Unapproved outbound Host method');
      child.stdin.write(JSON.stringify(message) + '\n');
    };
    child.stdout?.on('data', chunk => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT) return fail(new CodexTurnProtocolError('Host stdout limit exceeded'));
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > MAX_LINE && !buffer.includes('\n')) return fail(new CodexTurnProtocolError('Host JSONL line too large'));
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      try {
        for (const line of lines) {
          if (!line.trim()) continue;
          if (Buffer.byteLength(line) > MAX_LINE) reject('Host JSONL line too large');
          const outgoing = protocol.accept(JSON.parse(line));
          for (const message of outgoing) send(message);
          if (protocol.completed) { child.stdin.end(); break; }
        }
      } catch (e) { fail(e); }
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      if (!protocol.completed || code !== 0 || signal !== null) return fail(new CodexTurnProtocolError('Host exited without accepted completed Turn'));
      settled = true; clear();
      resolve({ ...protocol.receipt(), processExitCode: code,
        observedStdoutBytes: stdoutBytes, observedStderrBytes: stderrBytes });
    });
    try { for (const message of protocol.start()) send(message); }
    catch (error) { fail(error); }
  });
}
