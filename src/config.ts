import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, type CodeFleetConfig } from "./types.ts";

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
    }
  };
}
