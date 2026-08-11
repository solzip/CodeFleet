// Design-shaped Project Profile for test fixtures.
//
// Every fixture goes through here rather than writing its own object literal.
// The shape is exact — PROFILE_TOP_LEVEL_KEYS_FIXED and
// PROFILE_POLICY_BLOCK_KEYS_FIXED both fail on a missing key as well as an
// unexpected one — so a fixture that hand-rolls it drifts the moment the schema
// moves, and the failure looks like a product bug rather than a stale fixture.
//
// This file deliberately does not import the product's DEFAULT_PROFILE. A
// fixture built from the value under test cannot fail when that value is wrong.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ProfileOverrides {
  workspaceId?: string;
  harnessMode?: "DRY_RUN" | "SUGGEST_ONLY" | "WORKSPACE_EDIT" | "COMMAND_EXEC";
  agentAdapter?: string;
  isolationMode?: string;
  allowedAdapters?: string[];
  commands?: Record<string, unknown>;
  harness?: Record<string, unknown>;
  allowedLocalKeys?: string[];
  /**
   * Merged over the nine required blocks. A fixture may name only the blocks it
   * cares about and still produce a Profile that satisfies the exact-keys rule.
   */
  policies?: Record<string, unknown>;
}

export function profileJson(overrides: ProfileOverrides = {}): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    project: { id: "fixture", name: "Fixture" },
    workspace: { id: overrides.workspaceId ?? "fixture-workspace" },
    defaults: {
      task: { harnessMode: overrides.harnessMode ?? "DRY_RUN" },
      run: {
        agentAdapter: overrides.agentAdapter ?? "codex",
        isolationMode: overrides.isolationMode ?? "NONE"
      }
    },
    policies: {
      harness: overrides.harness ?? {},
      agentAdapters: { allowedAdapters: overrides.allowedAdapters ?? ["codex", "missing-adapter"] },
      files: {},
      commands: overrides.commands ?? {},
      risk: {},
      verification: {},
      redaction: {},
      carryForward: {},
      agentRoles: {},
      ...(overrides.policies ?? {})
    },
    references: {},
    localPolicy: {
      mergeMode: "RESTRICT_ONLY",
      overlayPath: ".codefleet/local.json",
      allowedLocalKeys: overrides.allowedLocalKeys ?? ["adapterCommand"]
    }
  };
}

export async function writeProfile(rootDir: string, overrides: ProfileOverrides = {}): Promise<void> {
  const dir = path.join(rootDir, ".codefleet");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "config.json"), `${JSON.stringify(profileJson(overrides), null, 2)}\n`, "utf8");
}

/** The adapter command is machine-local, so it never appears in the Profile. */
export async function writeLocalOverlay(
  rootDir: string,
  adapterCommand: { command?: string; args?: string[] }
): Promise<void> {
  const dir = path.join(rootDir, ".codefleet");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "local.json"), `${JSON.stringify({ adapterCommand }, null, 2)}\n`, "utf8");
}
