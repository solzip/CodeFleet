import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverWorkspace } from "../src/workspace.ts";
import { coversRule } from "./rule-coverage.ts";

const DISCOVERY = "WORKSPACE_DISCOVERY_RESOLVES_SINGLE_WORKSPACE_CONTRACT";

test("discoverWorkspace finds nearest parent .codefleet config", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-workspace-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    `${JSON.stringify({ workspace: { id: "sample-workspace" } })}\n`,
    "utf8"
  );
  const child = path.join(root, "src", "feature");
  await mkdir(child, { recursive: true });

  const discovery = await discoverWorkspace({ cwd: child });

  assert.equal(discovery.discoveryMode, "PARENT_SEARCH");
  assert.equal(discovery.selectedBy, "nearest-parent");
  assert.equal(discovery.workspaceId, "sample-workspace");
  assert.equal(discovery.workspaceRootRef, ".");
  assert.equal(discovery.metadataRootRef, ".codefleet");
  assert.equal(discovery.configRef.path, ".codefleet/config.json");
  assert.equal(discovery.configRef.present, true);
  assert.equal(discovery.localOverlayRef.present, false);

  coversRule(DISCOVERY, "workspaceRootRef equals .");
  coversRule(DISCOVERY, "metadataRootRef equals .codefleet");
  coversRule(DISCOVERY, "configRef.path equals .codefleet/config.json");
  coversRule(DISCOVERY, "workspaceId equals Project Profile workspace.id after Project Profile validation");
});

test("discoverWorkspace supports explicit workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-explicit-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  await writeFile(path.join(root, ".codefleet", "config.json"), "{}\n", "utf8");
  const outside = await mkdtemp(path.join(os.tmpdir(), "codefleet-outside-"));

  const discovery = await discoverWorkspace({ cwd: outside, workspace: root });

  assert.equal(discovery.discoveryMode, "EXPLICIT");
  assert.equal(discovery.selectedBy, "explicit-workspace");
  assert.equal(discovery.workspaceId, "default");

  coversRule(
    DISCOVERY,
    "exactly one selectedWorkspaceRootRealPath is resolved by explicit --workspace or nearest-parent discovery"
  );
});
