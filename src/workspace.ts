import { createHash } from "node:crypto";
import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type DiscoveryMode = "EXPLICIT" | "PARENT_SEARCH";
export type SelectedBy = "explicit-workspace" | "nearest-parent";

export interface FileRef {
  path: string;
  contentHash: string;
  present: boolean;
  unavailableReason?: string;
}

export interface WorkspaceDiscovery {
  discoveryMode: DiscoveryMode;
  invocationCwd: string;
  explicitWorkspaceInput: string | null;
  workspaceRootRef: ".";
  selectedWorkspaceRootRealPath: string;
  metadataRootRef: ".codefleet";
  metadataRootRealPath: string;
  workspaceId: string;
  configRef: FileRef;
  localOverlayRef: FileRef;
  selectedBy: SelectedBy;
  candidateRoots: string[];
  nestedWorkspaceRefs: string[];
  warnings: string[];
}

export async function discoverWorkspace(options: {
  cwd: string;
  workspace?: string;
}): Promise<WorkspaceDiscovery> {
  const invocationCwd = await realpath(options.cwd);
  if (options.workspace !== undefined) {
    return discoverExplicitWorkspace(invocationCwd, options.workspace);
  }

  return discoverParentWorkspace(invocationCwd);
}

async function discoverExplicitWorkspace(invocationCwd: string, workspaceInput: string): Promise<WorkspaceDiscovery> {
  const workspaceRoot = path.isAbsolute(workspaceInput)
    ? workspaceInput
    : path.resolve(invocationCwd, workspaceInput);
  const selectedWorkspaceRootRealPath = await requireDirectoryRealPath(workspaceRoot, "Workspace path is not a directory");
  return buildDiscovery({
    discoveryMode: "EXPLICIT",
    invocationCwd,
    explicitWorkspaceInput: workspaceInput,
    selectedWorkspaceRootRealPath,
    selectedBy: "explicit-workspace",
    candidateRoots: [selectedWorkspaceRootRealPath]
  });
}

async function discoverParentWorkspace(invocationCwd: string): Promise<WorkspaceDiscovery> {
  const candidateRoots: string[] = [];
  let current = invocationCwd;

  while (true) {
    if (await exists(path.join(current, ".codefleet", "config.json"))) {
      candidateRoots.push(current);
      return buildDiscovery({
        discoveryMode: "PARENT_SEARCH",
        invocationCwd,
        explicitWorkspaceInput: null,
        selectedWorkspaceRootRealPath: current,
        selectedBy: "nearest-parent",
        candidateRoots
      });
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("CodeFleet workspace not found. Run from a workspace or pass --workspace.");
    }
    current = parent;
  }
}

async function buildDiscovery(input: {
  discoveryMode: DiscoveryMode;
  invocationCwd: string;
  explicitWorkspaceInput: string | null;
  selectedWorkspaceRootRealPath: string;
  selectedBy: SelectedBy;
  candidateRoots: string[];
}): Promise<WorkspaceDiscovery> {
  const metadataRootRealPath = await requireDirectoryRealPath(
    path.join(input.selectedWorkspaceRootRealPath, ".codefleet"),
    "Workspace metadata directory not found: .codefleet"
  );
  assertInside(input.selectedWorkspaceRootRealPath, metadataRootRealPath, ".codefleet must stay inside workspace root");

  const configPath = path.join(metadataRootRealPath, "config.json");
  const configRealPath = await requireFileRealPath(configPath, "Workspace config not found: .codefleet/config.json");
  assertInside(input.selectedWorkspaceRootRealPath, configRealPath, "config.json must stay inside workspace root");

  const configRef = await fileRef(configRealPath, ".codefleet/config.json", true);
  const localOverlayRef = await fileRef(
    path.join(metadataRootRealPath, "local.json"),
    ".codefleet/local.json",
    false
  );
  const workspaceId = await readWorkspaceId(configRealPath);

  return {
    discoveryMode: input.discoveryMode,
    invocationCwd: input.invocationCwd,
    explicitWorkspaceInput: input.explicitWorkspaceInput,
    workspaceRootRef: ".",
    selectedWorkspaceRootRealPath: input.selectedWorkspaceRootRealPath,
    metadataRootRef: ".codefleet",
    metadataRootRealPath,
    workspaceId,
    configRef,
    localOverlayRef,
    selectedBy: input.selectedBy,
    candidateRoots: input.candidateRoots,
    nestedWorkspaceRefs: [],
    warnings: []
  };
}

async function readWorkspaceId(configPath: string): Promise<string> {
  const raw = await readFile(configPath, "utf8");
  try {
    const parsed = JSON.parse(raw) as { workspace?: { id?: unknown } };
    if (typeof parsed.workspace?.id === "string" && parsed.workspace.id.trim().length > 0) {
      return parsed.workspace.id;
    }
  } catch {
    // v0.1 config is still accepted as seed input; use a stable local fallback.
  }

  return "default";
}

async function fileRef(filePath: string, relativePath: string, required: boolean): Promise<FileRef> {
  try {
    const raw = await readFile(filePath);
    return {
      path: relativePath,
      contentHash: createHash("sha256").update(raw).digest("hex"),
      present: true
    };
  } catch {
    if (required) {
      throw new Error(`Required file not found: ${relativePath}`);
    }
    return {
      path: relativePath,
      contentHash: "",
      present: false,
      unavailableReason: "FILE_NOT_PRESENT"
    };
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function requireDirectoryRealPath(target: string, message: string): Promise<string> {
  const resolved = await realpath(target);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new Error(message);
  }
  return resolved;
}

async function requireFileRealPath(target: string, message: string): Promise<string> {
  const resolved = await realpath(target);
  const info = await stat(resolved);
  if (!info.isFile()) {
    throw new Error(message);
  }
  return resolved;
}

function assertInside(root: string, target: string, message: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(message);
  }
}
