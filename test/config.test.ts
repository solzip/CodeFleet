import assert from "node:assert/strict";
import test from "node:test";
import { loadCommandPolicy } from "../src/config.ts";
import { validateCommandMatchers } from "../src/command-policy.ts";
import { coversRule } from "./rule-coverage.ts";

const MATCHER = "COMMAND_MATCHER_IS_ARGV_PREFIX_WITHOUT_PATTERN_LANGUAGE";
const DESTRUCTIVE = "DESTRUCTIVE_COMMAND_CATEGORY_IS_APPROVAL_UNIT";

test("a profile that says nothing about commands gets the strict defaults", () => {
  const policy = loadCommandPolicy(undefined);

  // Silence must not read as permission. Both switches default to the strict end.
  assert.equal(policy.requireHarnessVisibleCommandChannel, true);
  assert.equal(policy.allowProviderReportedCommandTruth, false);
  assert.deepEqual(policy.deniedCommands, []);
});

test("a matcher token that looks like a pattern is refused, not ignored", () => {
  // Accepting `rm -rf *` would compare it literally: it would never match
  // `rm -rf /x`, and the author would believe the command was denied.
  const problems = validateCommandMatchers([{ argv: ["rm", "-rf", "*"] }]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].problem, "PATTERN_LANGUAGE_NOT_ALLOWED");

  assert.throws(
    () => loadCommandPolicy({ deniedCommands: [{ argv: ["rm", "-rf", "*"] }] }),
    /PATTERN_LANGUAGE_NOT_ALLOWED/
  );

  coversRule(MATCHER, "matcher entries contain no regular expression and no glob pattern language.");
});

test("an unknown key in policies.commands fails the profile", () => {
  // Almost always a typo for a real key, and a typo'd deniedCommands is an
  // empty denylist that looks like a full one.
  assert.throws(
    () => loadCommandPolicy({ denyCommands: [{ argv: ["rm"] }] }),
    /unknown key\(s\) in policies\.commands: denyCommands/
  );

  coversRule("PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA", "policies contains only supported policy blocks");
  coversRule(
    "PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA",
    "each policy block contains only portable policy source fields"
  );
});

test("a destructive entry without a usable categoryId is invalid policy", () => {
  // Approval is granted per category, so an entry with no category could never
  // be approved and would block its command with no way out.
  assert.deepEqual(
    validateCommandMatchers([{ argv: ["terraform", "apply"] }], { destructive: true }).map((p) => p.problem),
    ["CATEGORY_ID_MISSING"]
  );
  assert.deepEqual(
    validateCommandMatchers([{ categoryId: "infra apply", argv: ["terraform"] }], { destructive: true }).map(
      (p) => p.problem
    ),
    ["CATEGORY_ID_MALFORMED"]
  );

  coversRule(DESTRUCTIVE, "every destructive entry declares a categoryId.");
  coversRule(DESTRUCTIVE, "a destructive entry without categoryId is invalid policy.");
});

test("an empty argv, a bad matchMode, and a non-boolean switch are each rejected", () => {
  assert.deepEqual(
    validateCommandMatchers([{ argv: [] }]).map((p) => p.problem),
    ["ARGV_EMPTY"]
  );
  assert.deepEqual(
    validateCommandMatchers([{ argv: ["npm"], matchMode: "STARTS_WITH" }]).map((p) => p.problem),
    ["UNKNOWN_MATCH_MODE"]
  );
  assert.throws(
    () => loadCommandPolicy({ requireHarnessVisibleCommandChannel: "yes" }),
    /must be a boolean/
  );
});

test("every problem in a matcher list is reported, not just the first", () => {
  const problems = validateCommandMatchers([
    { argv: ["ok"] },
    { argv: ["bad?"] },
    { argv: [] },
    "not an object"
  ]);

  // Reporting one problem per run would make fixing a profile a guessing game.
  assert.deepEqual(
    problems.map((p) => [p.index, p.problem]),
    [
      [1, "PATTERN_LANGUAGE_NOT_ALLOWED"],
      [2, "ARGV_EMPTY"],
      [3, "NOT_AN_OBJECT"]
    ]
  );
});

test("a valid command policy loads with its entries intact", () => {
  const policy = loadCommandPolicy({
    allowedCommands: [{ argv: ["npm", "test"] }],
    deniedCommands: [{ argv: ["git", "push"], matchMode: "PREFIX" }],
    destructiveCommands: [{ categoryId: "INFRA_APPLY", argv: ["terraform", "apply"] }],
    allowProviderReportedCommandTruth: false
  });

  assert.deepEqual(policy.allowedCommands, [{ argv: ["npm", "test"] }]);
  assert.equal(policy.destructiveCommands[0].categoryId, "INFRA_APPLY");
  // Unspecified switches keep their strict default rather than becoming false.
  assert.equal(policy.requireHarnessVisibleCommandChannel, true);
});
