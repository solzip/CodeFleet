import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { AgentRunInput, AgentRunResult } from "./types.ts";

export interface AgentAdapter {
  name: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
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

    const prompt = await readFile(input.promptPath, "utf8");
    const commandConfig = input.config.agents?.codex ?? {};
    const command = commandConfig.command ?? "codex";
    const args = commandConfig.args ?? ["exec", "-"];

    return runCommand(command, args, prompt, input.projectPath);
  }
}

export function runCommand(
  command: string,
  args: string[],
  stdin: string,
  cwd: string
): Promise<AgentRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      resolve({
        status: "FAILED",
        exitCode: null,
        stdout,
        stderr: `${stderr}${error.message}\n`
      });
    });

    child.on("close", (code) => {
      resolve({
        status: code === 0 ? "SUCCEEDED" : "FAILED",
        exitCode: code,
        stdout,
        stderr
      });
    });

    child.stdin.end(stdin);
  });
}
