import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type {
  AgentRunInput,
  AgentRunResult,
  ProviderReportedCommand,
  ProviderTranscriptReading
} from "./types.ts";

export interface AgentAdapter {
  name: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

/** AdapterIds this build can actually run. Resolution checks it before planning. */
export const LOCAL_ADAPTER_REGISTRY = ["codex"];

export function isAdapterLocallyAvailable(name: string): boolean {
  return LOCAL_ADAPTER_REGISTRY.includes(name);
}

export function createAgentAdapter(name: string): AgentAdapter {
  if (name === "codex") {
    return new CodexAdapter();
  }

  throw new Error(`Unsupported agent: ${name}`);
}

class CodexAdapter implements AgentAdapter {
  readonly name = "codex";

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    if (input.config.mode === "dry-run") {
      return {
        status: "DRY_RUN",
        exitCode: null,
        stdout: "Dry run: Codex was not executed.\n",
        stderr: ""
      };
    }

    // The adapter reads what it was permitted to do. Before this it received a
    // prompt and nothing else, so "the agent was not allowed to run commands"
    // was a sentence in a file the agent never had to open.
    if (input.capabilities !== undefined && input.capabilities.commandExecution !== true) {
      return {
        status: "FAILED",
        exitCode: null,
        stdout: "",
        stderr: "Adapter refused to launch: AdapterRequest capabilities do not permit command execution.\n"
      };
    }

    const prompt = await readFile(input.promptPath, "utf8");
    const commandConfig = input.config.adapterCommand;
    const command = commandConfig.command ?? "codex";
    const args = commandConfig.args ?? ["exec", "-"];

    const result = await runCommand(command, args, prompt, input.projectPath, { limits: input.limits });
    return { ...result, providerTranscript: readProviderTranscript(result.stdout) };
  }
}

// Event names this parser claims to understand. Anything else is counted as
// unrecognized rather than guessed at: a wrong reading of a provider's
// transcript would be a fabricated command record, which is worse than none.
const RECOGNIZED_EVENT_TYPES = new Set([
  "command",
  "exec_command",
  "exec_command_begin",
  "exec_command_end",
  "shell_call",
  "tool_use.bash"
]);

// The parsing rule lives in the adapter layer on purpose. Core receives only
// the provider-agnostic reading, so no transcript format ever becomes part of
// the domain.
export function readProviderTranscript(transcript: string): ProviderTranscriptReading {
  const lines = transcript.split(/\r?\n/);
  const commands: ProviderReportedCommand[] = [];
  let jsonLinesParsed = 0;
  let unrecognizedJsonLines = 0;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      continue;
    }
    jsonLinesParsed += 1;

    const event = parsed as Record<string, unknown>;
    const eventType = typeof event.type === "string" ? event.type : "";
    if (!RECOGNIZED_EVENT_TYPES.has(eventType)) {
      unrecognizedJsonLines += 1;
      continue;
    }

    const command = event.command;
    // A shell string is not an argv. Splitting one would invent word
    // boundaries, so the raw text is kept and argv stays empty.
    const argv = Array.isArray(command) ? command.filter((v): v is string => typeof v === "string") : [];
    const raw = typeof command === "string" ? command : "";
    if (argv.length === 0 && raw.length === 0) {
      unrecognizedJsonLines += 1;
      continue;
    }

    commands.push({
      eventType,
      argv,
      raw,
      exitCode: typeof event.exitCode === "number" ? event.exitCode : null,
      lineNumber: index + 1
    });
  }

  return {
    commands,
    unavailableReason: transcriptUnavailableReason(jsonLinesParsed, commands.length),
    scanScope: {
      linesRead: lines.length,
      jsonLinesParsed,
      commandEventsFound: commands.length,
      unrecognizedJsonLines
    }
  };
}

// Three outcomes that must not look alike: nothing structured to read, a
// structured transcript in a shape this parser does not know, and a transcript
// that genuinely reported no command.
function transcriptUnavailableReason(jsonLinesParsed: number, commandsFound: number): string {
  if (jsonLinesParsed === 0) {
    return "PROVIDER_TRANSCRIPT_NOT_STRUCTURED";
  }
  if (commandsFound === 0) {
    return "PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED";
  }
  return "";
}

/** Defaults, not policy. A Profile may narrow them; nothing may remove them. */
export const DEFAULT_ADAPTER_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_ADAPTER_OUTPUT_CAP_BYTES = 16 * 1024 * 1024;

export interface ProcessLimits {
  timeoutMs: number;
  outputCapBytes: number;
}

export interface RunCommandOptions {
  limits?: Partial<ProcessLimits>;
  /**
   * Variables the child may see. The parent's environment is not inherited:
   * an adapter that receives every credential the operator happens to have
   * exported is a credential boundary that does not exist.
   */
  env?: Record<string, string>;
}

export function runCommand(
  command: string,
  args: string[],
  stdin: string,
  cwd: string,
  options: RunCommandOptions = {}
): Promise<AgentRunResult> {
  const timeoutMs = options.limits?.timeoutMs ?? DEFAULT_ADAPTER_TIMEOUT_MS;
  const outputCapBytes = options.limits?.outputCapBytes ?? DEFAULT_ADAPTER_OUTPUT_CAP_BYTES;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      // An explicit environment rather than process.env. PATH is kept because
      // resolving the adapter binary needs it; nothing else is passed unless
      // the caller named it.
      env: options.env ?? { PATH: process.env.PATH ?? "" }
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncatedBytes = 0;
    let stderrTruncatedBytes = 0;
    let settled = false;

    const finish = (result: AgentRunResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        // The truncated byte count travels with the output, so a capped
        // transcript is distinguishable from one that simply ended.
        scanScope: { stdoutTruncatedBytes, stderrTruncatedBytes, timeoutMs, outputCapBytes }
      } as AgentRunResult);
    };

    // Killing on timeout is what makes an agent that never exits a failed Run
    // rather than a CLI that waits forever.
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        status: "FAILED",
        exitCode: null,
        stdout,
        stderr: `${stderr}Adapter exceeded the ${timeoutMs} ms limit and was terminated.\n`
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      const room = outputCapBytes - Buffer.byteLength(stdout);
      if (room <= 0) {
        stdoutTruncatedBytes += Buffer.byteLength(chunk);
        return;
      }
      if (Buffer.byteLength(chunk) > room) {
        stdoutTruncatedBytes += Buffer.byteLength(chunk) - room;
        stdout += chunk.slice(0, room);
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      const room = outputCapBytes - Buffer.byteLength(stderr);
      if (room <= 0) {
        stderrTruncatedBytes += Buffer.byteLength(chunk);
        return;
      }
      if (Buffer.byteLength(chunk) > room) {
        stderrTruncatedBytes += Buffer.byteLength(chunk) - room;
        stderr += chunk.slice(0, room);
        return;
      }
      stderr += chunk;
    });

    child.on("error", (error) => {
      finish({
        status: "FAILED",
        exitCode: null,
        stdout,
        stderr: `${stderr}${error.message}\n`
      });
    });

    child.on("close", (code) => {
      finish({
        status: code === 0 ? "SUCCEEDED" : "FAILED",
        exitCode: code,
        stdout,
        stderr
      });
    });

    child.stdin.end(stdin);
  });
}
