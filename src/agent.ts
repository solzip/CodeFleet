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
export const LOCAL_ADAPTER_REGISTRY = ["codex", "claude"];

export function isAdapterLocallyAvailable(name: string): boolean {
  return LOCAL_ADAPTER_REGISTRY.includes(name);
}

export function createAgentAdapter(name: string): AgentAdapter {
  const spec = ADAPTER_SPECS[name];
  if (spec === undefined) {
    throw new Error(`Unsupported agent: ${name}`);
  }
  return new SpawnedCliAdapter(spec);
}

/**
 * What actually differs between two CLI adapters.
 *
 * Everything else — the dry-run short circuit, the capability refusal, reading
 * the prompt, the bounded launch — is the same for both, and having only one
 * adapter meant that was an assumption rather than a fact. A second one is the
 * only way to find out which parts were provider-specific.
 */
interface AdapterSpec {
  name: string;
  /** Used unless the Local Overlay names a command for this workspace. */
  defaultCommand: string;
  defaultArgs: string[];
  /**
   * Provider-agnostic reading of the provider's own transcript. Kept in the
   * adapter layer on purpose: no transcript format becomes part of the domain,
   * and a format this build does not recognise degrades authority rather than
   * producing a fabricated command record.
   */
  readTranscript: (stdout: string) => ProviderTranscriptReading;
}

const ADAPTER_SPECS: Record<string, AdapterSpec> = {
  codex: {
    name: "codex",
    defaultCommand: "codex",
    defaultArgs: ["exec", "-"],
    readTranscript: readProviderTranscript
  },
  claude: {
    name: "claude",
    defaultCommand: "claude",
    // -p reads the prompt from stdin and runs without a terminal;
    // stream-json is what makes the transcript machine-readable at all.
    defaultArgs: ["-p", "--output-format", "stream-json", "--verbose"],
    readTranscript: readClaudeTranscript
  }
};

class SpawnedCliAdapter implements AgentAdapter {
  readonly name: string;
  readonly #spec: AdapterSpec;

  constructor(spec: AdapterSpec) {
    this.name = spec.name;
    this.#spec = spec;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    if (input.config.mode === "dry-run") {
      return {
        status: "DRY_RUN",
        exitCode: null,
        stdout: `Dry run: ${this.#spec.name} was not executed.\n`,
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
    // The Local Overlay holds one adapterCommand for the workspace, so naming
    // one while switching adapters per Run would point both at the same binary.
    // That is a real limit of the overlay shape, not something to paper over
    // here — the default is per-adapter and the override is workspace-wide.
    const commandConfig = input.config.adapterCommand;
    const command = commandConfig.command ?? this.#spec.defaultCommand;
    const args = commandConfig.args ?? this.#spec.defaultArgs;

    const result = await runCommand(command, args, prompt, input.projectPath, { limits: input.limits });
    return { ...result, providerTranscript: this.#spec.readTranscript(result.stdout) };
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
/**
 * Claude Code's stream-json transcript.
 *
 * A different shape from Codex's flat events: shell calls arrive as `tool_use`
 * blocks nested inside an assistant message, and the command is a shell string
 * in the tool input rather than an argv.
 *
 * The same rule applies as everywhere else here — a shell string is not an
 * argv, and splitting one would invent word boundaries. The raw text is kept
 * and argv stays empty, which is why a provider claim can never satisfy command
 * policy no matter which adapter produced it.
 *
 * Only the documented shape is recognised. Anything else counts as
 * unrecognised, degrading authority rather than producing a command record
 * nobody can stand behind.
 */
export function readClaudeTranscript(transcript: string): ProviderTranscriptReading {
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
    const message = event.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (event.type !== "assistant" || !Array.isArray(content)) {
      unrecognizedJsonLines += 1;
      continue;
    }

    let found = 0;
    for (const block of content) {
      if (block === null || typeof block !== "object" || Array.isArray(block)) {
        continue;
      }
      const entry = block as Record<string, unknown>;
      if (entry.type !== "tool_use") {
        continue;
      }
      // Only the shell tool. A file-edit tool call is not a command, and
      // recording it as one would overstate what the provider claimed.
      const toolName = typeof entry.name === "string" ? entry.name : "";
      if (toolName.toLowerCase() !== "bash") {
        continue;
      }
      const toolInput = entry.input as Record<string, unknown> | undefined;
      const raw = typeof toolInput?.command === "string" ? toolInput.command : "";
      if (raw.length === 0) {
        continue;
      }
      commands.push({
        eventType: `tool_use.${toolName}`,
        argv: [],
        raw,
        exitCode: null,
        lineNumber: index + 1
      });
      found += 1;
    }
    if (found === 0) {
      unrecognizedJsonLines += 1;
    }
  }

  return {
    commands,
    unavailableReason: transcriptUnavailableReason(jsonLinesParsed, commands.length),
    scanScope: { linesRead: lines.length, jsonLinesParsed, unrecognizedJsonLines }
  };
}

function transcriptUnavailableReason(jsonLinesParsed: number, commandsFound: number): string {
  if (jsonLinesParsed === 0) {
    return "PROVIDER_TRANSCRIPT_NOT_STRUCTURED";
  }
  if (commandsFound === 0) {
    return "PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED";
  }
  return "";
}

// Every process CodeFleet starts has a ceiling, and the ceilings live here so
// that adding a new kind of child means picking one rather than inventing one.
// They are constants: reading them from the Profile is a separate change.
//
// The four kinds are not interchangeable. An agent session, a test suite, a
// read of git state, and a repository checkout have different honest durations,
// and giving them one number would either cut a normal run short or leave a
// hung one running for half an hour.

/** Defaults, not policy. A Profile may narrow them; nothing may remove them. */
export const DEFAULT_ADAPTER_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_ADAPTER_OUTPUT_CAP_BYTES = 16 * 1024 * 1024;

/** A test suite, not an agent session. */
export const VERIFICATION_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const VERIFICATION_COMMAND_OUTPUT_CAP_BYTES = 4 * 1024 * 1024;

/**
 * Reading git state takes seconds on a healthy repository. The cap is generous
 * because truncating a diff corrupts evidence rather than merely shortening a
 * log, so hitting it must stay exceptional.
 */
export const GIT_EVIDENCE_TIMEOUT_MS = 2 * 60 * 1000;
export const GIT_EVIDENCE_OUTPUT_CAP_BYTES = 32 * 1024 * 1024;

/** `git worktree add` checks out the repository; minutes are normal. */
export const ISOLATION_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Capturing created-file content costs one git call per file, so a per-call
 * limit alone leaves the total unbounded in the number of files. This is the
 * ceiling on that loop as a whole; files past it are named, not collected.
 */
export const NEW_FILE_CAPTURE_BUDGET_MS = 60 * 1000;

// Names, never values, and only those a child genuinely needs. The boundary
// exists to keep credentials — AWS_SECRET_ACCESS_KEY, GITHUB_TOKEN,
// DATABASE_URL — out of processes that have no use for them.
const OS_ESSENTIAL_ENV = ["SystemRoot", "SYSTEMROOT", "COMSPEC", "PATHEXT", "TEMP", "TMP", "windir"];

// git resolves configuration from the user's home directory. Cutting that off
// would silently change what a diff says — core.autocrlf alone can rewrite
// every line ending — so protecting the evidence must not begin by altering it.
const GIT_HOME_ENV = ["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"];

// GIT_* that select where git's own files live. None of them is a secret; all
// of them break git outright on an installation that relies on them.
const GIT_SETTING_ENV = [
  "GIT_EXEC_PATH",
  "GIT_TEMPLATE_DIR",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_SSL_CAINFO",
  "GIT_SSL_CAPATH"
];

/**
 * The environment a git child may see: PATH, what the OS needs to start a
 * process at all, git's own configuration lookup, and nothing else. Only names
 * present in the parent are passed on, so this never invents a value.
 */
export function gitProcessEnv(): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  for (const name of [...OS_ESSENTIAL_ENV, ...GIT_HOME_ENV, ...GIT_SETTING_ENV]) {
    const value = process.env[name];
    if (typeof value === "string") {
      env[name] = value;
    }
  }
  return env;
}

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

/** Characters cmd.exe reads as syntax rather than as part of an argument. */
const CMD_METACHARACTERS = /[&|<>^"%!\r\n]/;

export function isWindowsBatchFile(command: string): boolean {
  return /\.(bat|cmd)$/i.test(command);
}

export type WindowsShellDecision = "NOT_A_BATCH_FILE" | "SHELL_REQUIRED" | "REFUSED_METACHARACTERS";

/**
 * Whether this launch needs cmd.exe, and whether it is safe to give it.
 *
 * Separated from the platform check so the screening itself is testable
 * everywhere: the rule is what matters, and it should not be verifiable on one
 * operating system only.
 *
 * REFUSED_METACHARACTERS is not a fallback to a non-shell launch that would
 * work anyway — spawn then fails with EINVAL and the failure is recorded. That
 * is the correct outcome for an argv cmd.exe would reinterpret, because passing
 * one through a shell is how a policy-checked command list turns back into a
 * shell string.
 */
export function windowsShellDecision(command: string, args: string[]): WindowsShellDecision {
  if (!isWindowsBatchFile(command)) {
    return "NOT_A_BATCH_FILE";
  }
  const offending = [command, ...args].some((part) => CMD_METACHARACTERS.test(part));
  return offending ? "REFUSED_METACHARACTERS" : "SHELL_REQUIRED";
}

export function needsWindowsShell(command: string, args: string[]): boolean {
  return process.platform === "win32" && windowsShellDecision(command, args) === "SHELL_REQUIRED";
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
      // A Windows batch file is not an executable image: CreateProcess cannot
      // launch gradlew.bat or mvnw.cmd, so every Gradle and Maven wrapper — the
      // standard entry point on those projects — was unreachable as a
      // verification command. Writing ["cmd","/c","gradlew.bat"] is correctly
      // refused as a shell interpreter, which left no way in at all. P1-34.
      //
      // The interpreter is supplied by the Harness for this one case rather
      // than accepted from the Task, and only after the argv has been screened
      // for characters cmd.exe would treat as syntax. What stays impossible is
      // a Task naming a shell and passing it a string to interpret.
      shell: needsWindowsShell(command, args),
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
