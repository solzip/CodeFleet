import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("CLI status supports explicit --workspace", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "codefleet-cli-workspace-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "codefleet-cli-outside-"));
  await mkdir(path.join(workspace, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(workspace, ".codefleet", "runs"), { recursive: true });
  await writeFile(
    path.join(workspace, ".codefleet", "config.json"),
    `${JSON.stringify({ workspace: { id: "cli-workspace" } })}\n`,
    "utf8"
  );

  const result = await runCli(["--workspace", workspace, "status"], outside);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /workspace: cli-workspace/);
  assert.match(result.stdout, /discovery: EXPLICIT/);
});

function runCli(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "src", "cli.ts"), ...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
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
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
