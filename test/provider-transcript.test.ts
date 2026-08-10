import assert from "node:assert/strict";
import test from "node:test";
import { readProviderTranscript } from "../src/agent.ts";

test("recognized command events are read out of the transcript", () => {
  const reading = readProviderTranscript(
    [
      "Some human-readable preamble.",
      JSON.stringify({ type: "exec_command_begin", command: ["npm", "test"] }),
      JSON.stringify({ type: "command", command: ["git", "status"], exitCode: 0 }),
      ""
    ].join("\n")
  );

  assert.equal(reading.commands.length, 2);
  assert.deepEqual(reading.commands[0].argv, ["npm", "test"]);
  assert.equal(reading.commands[0].lineNumber, 2);
  assert.equal(reading.commands[1].exitCode, 0);
  assert.equal(reading.unavailableReason, "");
  assert.equal(reading.scanScope.commandEventsFound, 2);
  assert.equal(reading.scanScope.unrecognizedJsonLines, 0);
});

test("a transcript with no structured output is distinguished from an unknown format", () => {
  const prose = readProviderTranscript("I ran the tests and they passed.\n");
  assert.equal(prose.unavailableReason, "PROVIDER_TRANSCRIPT_NOT_STRUCTURED");
  assert.equal(prose.scanScope.jsonLinesParsed, 0);

  const unknown = readProviderTranscript(
    [
      JSON.stringify({ type: "thinking", text: "considering" }),
      JSON.stringify({ type: "message", text: "done" }),
      ""
    ].join("\n")
  );
  // Structured output exists but this parser does not know the shape. Reporting
  // that as "no commands" would claim a reading that never happened.
  assert.equal(unknown.unavailableReason, "PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED");
  assert.equal(unknown.scanScope.jsonLinesParsed, 2);
  assert.equal(unknown.scanScope.unrecognizedJsonLines, 2);
});

test("a shell string is kept raw rather than split into an invented argv", () => {
  const reading = readProviderTranscript(
    `${JSON.stringify({ type: "shell_call", command: "npm test -- --grep 'a b'" })}\n`
  );

  assert.equal(reading.commands.length, 1);
  assert.deepEqual(reading.commands[0].argv, []);
  assert.equal(reading.commands[0].raw, "npm test -- --grep 'a b'");
});

test("a recognized event carrying no command is counted, not silently dropped", () => {
  const reading = readProviderTranscript(`${JSON.stringify({ type: "command" })}\n`);

  assert.equal(reading.commands.length, 0);
  assert.equal(reading.scanScope.jsonLinesParsed, 1);
  assert.equal(reading.scanScope.unrecognizedJsonLines, 1);
  assert.equal(reading.unavailableReason, "PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED");
});

test("malformed JSON and non-object JSON never abort the reading", () => {
  const reading = readProviderTranscript(
    [
      "{not json",
      "[1, 2, 3]",
      JSON.stringify({ type: "command", command: ["ls"] }),
      ""
    ].join("\n")
  );

  assert.equal(reading.commands.length, 1);
  assert.equal(reading.scanScope.linesRead, 4);
  assert.equal(reading.scanScope.jsonLinesParsed, 1);
});
