import assert from "node:assert/strict";
import test from "node:test";
import {
  isShellInterpreter,
  matchesCommand,
  normalizeCommand,
  preflightCommand
} from "../src/command-policy.ts";
import { coversRule } from "./rule-coverage.ts";

const NORM = "COMMAND_NORMALIZATION_IS_ARGV_BASED_AND_SHELL_FREE";
const MATCHER = "COMMAND_MATCHER_IS_ARGV_PREFIX_WITHOUT_PATTERN_LANGUAGE";
const DESTRUCTIVE = "DESTRUCTIVE_COMMAND_CATEGORY_IS_APPROVAL_UNIT";

function preflight(argv: string[], overrides: Partial<Parameters<typeof preflightCommand>[0]> = {}) {
  return preflightCommand({
    normalized: normalizeCommand(argv, "."),
    commandExecution: true,
    allowedCommands: [],
    deniedCommands: [],
    destructiveCommands: [],
    approvedCategoryIds: [],
    ...overrides
  });
}

test("argv[0] is normalized to its basename and the original is preserved", () => {
  const normalized = normalizeCommand(["/usr/local/bin/npm", "test"], "/repo");
  assert.deepEqual(normalized.argv, ["npm", "test"]);
  assert.equal(normalized.argv0Original, "/usr/local/bin/npm");
  assert.equal(normalized.cwd, "/repo");

  coversRule(NORM, "command is accepted as an argv array and is never parsed from a command-line string.");
  coversRule(
    NORM,
    "argv[0] is normalized to its basename while the original path is preserved as evidence."
  );
});

test("a shell interpreter is denied at argv[0] whatever the path or case", () => {
  for (const shell of ["sh", "/bin/bash", "C:\\Windows\\System32\\cmd.exe", "PowerShell", "zsh"]) {
    const result = preflight([shell, "-c", "npm test"]);
    assert.equal(result.decision, "BLOCKED", `${shell} must be denied`);
    assert.equal(result.blockedReason, "SHELL_INTERPRETER_DENIED");
  }
  assert.equal(isShellInterpreter("npm"), false);

  coversRule(NORM, "shell interpreter invocation is denied at argv[0].");
});

test("PREFIX matches a leading run of tokens, EXACT requires the whole argv", () => {
  const argv = ["npm", "test", "--silent"];
  assert.equal(matchesCommand(argv, { argv: ["npm", "test"] }, true), true);
  assert.equal(matchesCommand(argv, { argv: ["npm", "test"], matchMode: "EXACT" }, true), false);
  assert.equal(matchesCommand(["npm", "test"], { argv: ["npm", "test"], matchMode: "EXACT" }, true), true);
  assert.equal(matchesCommand(argv, { argv: ["npm", "run"] }, true), false);
  assert.equal(matchesCommand(["npmtest"], { argv: ["npm"] }, true), false);

  coversRule(MATCHER, "matcher entries are argv token lists with matchMode PREFIX or EXACT.");
  coversRule(MATCHER, "PREFIX matches when entry argv equals the leading tokens of the normalized argv.");
  coversRule(MATCHER, "EXACT matches when entry argv equals the whole normalized argv.");
  coversRule(MATCHER, "matcher entries contain no regular expression and no glob pattern language.");
});

test("allowed matching is case-sensitive and denied matching is case-insensitive", () => {
  // A differently cased invocation falls out of the allowlist...
  assert.equal(
    preflight(["NPM", "test"], { allowedCommands: [{ argv: ["npm", "test"] }] }).blockedReason,
    "OUTSIDE_ALLOWED_COMMANDS"
  );
  // ...and still hits the denylist. Both directions resolve to the stricter outcome.
  assert.equal(
    preflight(["NPM", "test"], { deniedCommands: [{ argv: ["npm", "test"] }] }).blockedReason,
    "MATCHES_DENIED_COMMANDS"
  );

  coversRule(MATCHER, "allowedCommands matching is case-sensitive.");
  coversRule(MATCHER, "deniedCommands and destructiveCommands matching is case-insensitive.");
});

test("denied wins over allowed", () => {
  const result = preflight(["git", "push", "--force"], {
    allowedCommands: [{ argv: ["git"] }],
    deniedCommands: [{ argv: ["git", "push", "--force"] }]
  });
  assert.equal(result.decision, "BLOCKED");
  assert.equal(result.blockedReason, "MATCHES_DENIED_COMMANDS");
});

test("an empty allowlist does not constrain, a non-empty one does", () => {
  assert.equal(preflight(["anything"]).decision, "ALLOWED");
  assert.equal(
    preflight(["anything"], { allowedCommands: [{ argv: ["npm"] }] }).blockedReason,
    "OUTSIDE_ALLOWED_COMMANDS"
  );
});

test("a destructive category is blocked unless a covering approval exists", () => {
  const destructive = [{ categoryId: "INFRA_APPLY", argv: ["terraform", "apply"] }];

  const blocked = preflight(["terraform", "apply"], { destructiveCommands: destructive });
  assert.equal(blocked.decision, "BLOCKED");
  assert.equal(blocked.blockedReason, "DESTRUCTIVE_WITHOUT_APPROVAL");
  assert.equal(blocked.destructiveCategoryId, "INFRA_APPLY");

  const approved = preflight(["terraform", "apply"], {
    destructiveCommands: destructive,
    approvedCategoryIds: ["INFRA_APPLY"]
  });
  assert.equal(approved.decision, "ALLOWED");
  assert.equal(approved.destructiveCategoryId, "INFRA_APPLY");

  coversRule(DESTRUCTIVE, "every destructive entry declares a categoryId.");
  coversRule(
    DESTRUCTIVE,
    "matching a destructive entry blocks execution unless a covering durable approval exists."
  );
});

test("command execution disabled blocks before any matching", () => {
  const result = preflight(["npm", "test"], { commandExecution: false });
  assert.equal(result.blockedReason, "COMMAND_EXECUTION_DISABLED");
});

test("an empty command is rejected", () => {
  assert.equal(preflight([]).blockedReason, "EMPTY_COMMAND");
});
