// Command matching for policies.commands.
//
// Commands are argv arrays. Shell interpreter invocation is denied at argv[0]
// because `sh -c "npm test; rm -rf /"` would otherwise satisfy any ["sh"] entry
// and defeat every list below. Matching is argv token comparison with no regex
// and no glob. Case handling is asymmetric: allowed matches case-sensitively and
// denied matches case-insensitively, so a differently-cased invocation falls out
// of the allowlist and still hits the denylist.

export type MatchMode = "PREFIX" | "EXACT";

export interface CommandMatcher {
  argv: string[];
  matchMode?: MatchMode;
}

export interface DestructiveMatcher extends CommandMatcher {
  categoryId: string;
}

export interface NormalizedCommand {
  argv: string[];
  argv0Original: string;
  cwd: string;
}

export type CommandDecision = "ALLOWED" | "BLOCKED";

export type BlockedReason =
  | "COMMAND_EXECUTION_DISABLED"
  | "SHELL_INTERPRETER_DENIED"
  | "EMPTY_COMMAND"
  | "MATCHES_DENIED_COMMANDS"
  | "OUTSIDE_ALLOWED_COMMANDS"
  | "DESTRUCTIVE_WITHOUT_APPROVAL";

export interface PreflightResult {
  decision: CommandDecision;
  blockedReason: BlockedReason | "";
  matchedEntry: string;
  destructiveCategoryId: string;
}

const SHELL_INTERPRETERS = new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "ksh",
  "fish",
  "csh",
  "tcsh",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe"
]);

export function normalizeCommand(argv: string[], cwd: string): NormalizedCommand {
  const original = argv[0] ?? "";
  const basename = original.split(/[\\/]/).pop() ?? original;
  return {
    argv: argv.length === 0 ? [] : [basename, ...argv.slice(1)],
    argv0Original: original,
    cwd
  };
}

export function isShellInterpreter(argv0: string): boolean {
  return SHELL_INTERPRETERS.has(argv0.toLowerCase());
}

export function matchesCommand(
  argv: string[],
  entry: CommandMatcher,
  caseSensitive: boolean
): boolean {
  const mode = entry.matchMode ?? "PREFIX";
  const target = caseSensitive ? argv : argv.map((token) => token.toLowerCase());
  const pattern = caseSensitive ? entry.argv : entry.argv.map((token) => token.toLowerCase());

  if (pattern.length === 0) {
    return false;
  }
  if (mode === "EXACT" && target.length !== pattern.length) {
    return false;
  }
  if (target.length < pattern.length) {
    return false;
  }

  return pattern.every((token, index) => target[index] === token);
}

export function preflightCommand(input: {
  normalized: NormalizedCommand;
  commandExecution: boolean;
  allowedCommands: CommandMatcher[];
  deniedCommands: CommandMatcher[];
  destructiveCommands: DestructiveMatcher[];
  approvedCategoryIds: string[];
}): PreflightResult {
  const { normalized, commandExecution } = input;
  const argv = normalized.argv;

  if (argv.length === 0) {
    return blocked("EMPTY_COMMAND");
  }
  if (!commandExecution) {
    return blocked("COMMAND_EXECUTION_DISABLED");
  }
  if (isShellInterpreter(argv[0])) {
    return blocked("SHELL_INTERPRETER_DENIED");
  }

  // Denied is evaluated before allowed and wins.
  const denied = input.deniedCommands.find((entry) => matchesCommand(argv, entry, false));
  if (denied !== undefined) {
    return blocked("MATCHES_DENIED_COMMANDS", denied.argv.join(" "));
  }

  if (input.allowedCommands.length > 0) {
    const allowed = input.allowedCommands.find((entry) => matchesCommand(argv, entry, true));
    if (allowed === undefined) {
      return blocked("OUTSIDE_ALLOWED_COMMANDS");
    }
  }

  const destructive = input.destructiveCommands.find((entry) => matchesCommand(argv, entry, false));
  if (destructive !== undefined && !input.approvedCategoryIds.includes(destructive.categoryId)) {
    return {
      decision: "BLOCKED",
      blockedReason: "DESTRUCTIVE_WITHOUT_APPROVAL",
      matchedEntry: destructive.argv.join(" "),
      destructiveCategoryId: destructive.categoryId
    };
  }

  return {
    decision: "ALLOWED",
    blockedReason: "",
    matchedEntry: "",
    destructiveCategoryId: destructive?.categoryId ?? ""
  };
}

function blocked(reason: BlockedReason, matchedEntry = ""): PreflightResult {
  return { decision: "BLOCKED", blockedReason: reason, matchedEntry, destructiveCategoryId: "" };
}
