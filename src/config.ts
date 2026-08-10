import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateCommandMatchers } from "./command-policy.ts";
import {
  DEFAULT_COMMAND_POLICY,
  DEFAULT_CONFIG,
  type CodeFleetConfig,
  type CommandPolicyConfig
} from "./types.ts";

export interface InitResult {
  rootDir: string;
  codefleetDir: string;
  createdConfig: boolean;
}

export async function initProject(rootDir: string): Promise<InitResult> {
  const codefleetDir = path.join(rootDir, ".codefleet");
  await mkdir(path.join(codefleetDir, "tasks"), { recursive: true });
  await mkdir(path.join(codefleetDir, "runs"), { recursive: true });

  const configPath = path.join(codefleetDir, "config.json");
  let createdConfig = false;
  try {
    await readFile(configPath, "utf8");
  } catch {
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
    createdConfig = true;
  }

  return { rootDir, codefleetDir, createdConfig };
}

export async function loadConfig(rootDir: string): Promise<CodeFleetConfig> {
  const configPath = path.join(rootDir, ".codefleet", "config.json");
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    throw new Error("CodeFleet is not initialized. Run `codefleet init` first.");
  }

  const parsed = JSON.parse(raw) as Partial<CodeFleetConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    agents: {
      ...DEFAULT_CONFIG.agents,
      ...parsed.agents
    },
    policies: {
      commands: loadCommandPolicy((parsed.policies as Record<string, unknown> | undefined)?.commands)
    }
  };
}

const COMMAND_POLICY_KEYS = new Set(Object.keys(DEFAULT_COMMAND_POLICY));

// A profile that is wrong is refused, not repaired. A silently dropped denied
// entry is worse than no policy at all: the author believes the command is
// blocked and nothing says otherwise.
export function loadCommandPolicy(raw: unknown): CommandPolicyConfig {
  if (raw === undefined || raw === null) {
    return DEFAULT_COMMAND_POLICY;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid Project Profile: policies.commands must be an object.");
  }

  const block = raw as Record<string, unknown>;
  const errors: string[] = [];

  const unknown = Object.keys(block).filter((key) => !COMMAND_POLICY_KEYS.has(key));
  if (unknown.length > 0) {
    // An unknown key is usually a typo for a real one, and a typo'd deniedCommands
    // is an empty denylist that looks like a full one.
    errors.push(`unknown key(s) in policies.commands: ${unknown.sort().join(", ")}`);
  }

  for (const [key, destructive] of [
    ["allowedCommands", false],
    ["deniedCommands", false],
    ["destructiveCommands", true]
  ] as const) {
    if (block[key] === undefined) {
      continue;
    }
    for (const problem of validateCommandMatchers(block[key], { destructive })) {
      errors.push(`policies.commands.${key}[${problem.index}]: ${problem.problem} — ${problem.detail}`);
    }
  }

  for (const key of ["requireHarnessVisibleCommandChannel", "allowProviderReportedCommandTruth"] as const) {
    if (block[key] !== undefined && typeof block[key] !== "boolean") {
      errors.push(`policies.commands.${key} must be a boolean`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Project Profile:\n${errors.map((line) => `  - ${line}`).join("\n")}`);
  }

  return {
    allowedCommands: (block.allowedCommands as CommandPolicyConfig["allowedCommands"]) ?? [],
    deniedCommands: (block.deniedCommands as CommandPolicyConfig["deniedCommands"]) ?? [],
    destructiveCommands: (block.destructiveCommands as CommandPolicyConfig["destructiveCommands"]) ?? [],
    requireHarnessVisibleCommandChannel:
      (block.requireHarnessVisibleCommandChannel as boolean | undefined) ??
      DEFAULT_COMMAND_POLICY.requireHarnessVisibleCommandChannel,
    allowProviderReportedCommandTruth:
      (block.allowProviderReportedCommandTruth as boolean | undefined) ??
      DEFAULT_COMMAND_POLICY.allowProviderReportedCommandTruth
  };
}
