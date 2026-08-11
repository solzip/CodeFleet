// Project Profile contract.
//
// Each test drives loadProfile against a Profile that breaks exactly one rule,
// so a failure names the rule rather than "config is invalid". The fixtures are
// built from test/profile-fixture.ts and then broken on purpose, which is what
// keeps them from drifting into agreeing with whatever the loader happens to do.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import { loadProfile, PROFILE_POLICY_KEYS, PROFILE_TOP_LEVEL_KEYS } from "../src/profile.ts";
import { profileJson, writeLocalOverlay, type ProfileOverrides } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";

const CONTRACT = "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT";
const TOP_KEYS = "PROFILE_TOP_LEVEL_KEYS_FIXED";
const POLICY_KEYS = "PROFILE_POLICY_BLOCK_KEYS_FIXED";
const NO_STATE = "PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE";
const OVERLAY = "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY";
const POLICY_INTERNAL = "PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA";

async function seed(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-profile-"));
  await mkdir(path.join(root, ".codefleet"), { recursive: true });
  return root;
}

async function writeRaw(root: string, document: unknown): Promise<void> {
  await writeFile(
    path.join(root, ".codefleet", "config.json"),
    typeof document === "string" ? document : `${JSON.stringify(document, null, 2)}\n`,
    "utf8"
  );
}

async function seedWith(document: unknown): Promise<string> {
  const root = await seed();
  await writeRaw(root, document);
  return root;
}

async function seedProfile(overrides: ProfileOverrides = {}): Promise<string> {
  return seedWith(profileJson(overrides));
}

/** The Profile as edited by `mutate`, which may add or delete any key. */
function broken(mutate: (doc: Record<string, unknown>) => void): Record<string, unknown> {
  const doc = profileJson() as Record<string, unknown>;
  mutate(doc);
  return doc;
}

test("the Profile is read from the fixed path and must declare a supported schemaVersion", async () => {
  const root = await seedProfile({ workspaceId: "contract" });
  const loaded = await loadProfile(root);
  assert.equal(loaded.profilePath, path.join(root, ".codefleet", "config.json"));
  assert.equal(loaded.profile.schemaVersion, "1.0.0");

  const noVersion = await seedWith(broken((d) => delete d.schemaVersion));
  await assert.rejects(() => loadProfile(noVersion), /parsed document must contain schemaVersion/);

  const badVersion = await seedWith(broken((d) => (d.schemaVersion = "9.9.9")));
  await assert.rejects(() => loadProfile(badVersion), /schemaVersion 9\.9\.9 is not supported/);

  // Unparseable is a contract failure too, not a crash with a JSON message.
  const notJson = await seedWith("{ not json\n");
  await assert.rejects(() => loadProfile(notJson), /not valid JSON/);

  coversRule(CONTRACT, "config file path equals <workspaceRoot>/.codefleet/config.json");
  coversRule(CONTRACT, "parsed document contains schemaVersion");
  coversRule(CONTRACT, "schemaVersion is supported by the running CodeFleet validation rule set");
});

test("a missing top-level key fails the same way an unexpected one does", async () => {
  // Both directions matter. Only refusing unexpected keys would let a Profile
  // omit policies entirely and read as a Profile that permits everything.
  for (const key of PROFILE_TOP_LEVEL_KEYS) {
    const root = await seedWith(broken((d) => delete d[key]));
    await assert.rejects(() => loadProfile(root), new RegExp(`missing ${key}`), `${key} may not be omitted`);
  }

  const extra = await seedWith(broken((d) => (d.runHistory = [])));
  await assert.rejects(() => loadProfile(extra), /unexpected runHistory/);

  coversRule(
    TOP_KEYS,
    "top-level keys are exactly schemaVersion, project, workspace, defaults, policies, references, localPolicy"
  );
});

test("a missing policy block fails the same way an unexpected one does", async () => {
  for (const key of PROFILE_POLICY_KEYS) {
    const root = await seedWith(
      broken((d) => delete (d.policies as Record<string, unknown>)[key])
    );
    await assert.rejects(() => loadProfile(root), new RegExp(`missing ${key}`), `policies.${key} may not be omitted`);
  }

  const extra = await seedWith(broken((d) => ((d.policies as Record<string, unknown>).网 = {})));
  await assert.rejects(() => loadProfile(extra), /unexpected/);

  coversRule(
    POLICY_KEYS,
    "policies block keys are exactly harness, agentAdapters, files, commands, risk, verification, redaction, carryForward, agentRoles, and the only additional permitted key is the optional scalar autoAdvanceOnDone"
  );
  coversRule(POLICY_INTERNAL, "policies contains only supported policy blocks");
});

test("a stored effectivePolicy is refused, because it is derived per Run", async () => {
  const root = await seedWith(
    broken((d) => ((d.policies as Record<string, unknown>).effectivePolicy = { capabilities: {} }))
  );
  await assert.rejects(() => loadProfile(root), /effectivePolicy/);

  coversRule(POLICY_INTERNAL, "policies does not contain effectivePolicy or local runtime state");
});

test("runtime evidence, credentials, and machine paths are refused wherever they appear", async () => {
  // Key names, at any depth.
  for (const [pointerKey, mutate] of [
    ["stdout", (d: Record<string, unknown>) => ((d.project as Record<string, unknown>).stdout = "...")],
    ["token", (d: Record<string, unknown>) => ((d.references as Record<string, unknown>).token = "x")],
    [
      "command",
      (d: Record<string, unknown>) =>
        ((d.defaults as Record<string, unknown>).adapter = { command: "codex", args: ["exec"] })
    ]
  ] as const) {
    const root = await seedWith(broken(mutate));
    await assert.rejects(() => loadProfile(root), new RegExp(`key "${pointerKey}"`), `${pointerKey} must be refused`);
  }

  // Values that are credentials on sight.
  const secret = await seedWith(
    broken((d) => ((d.references as Record<string, unknown>).contextFile = "ghp_0123456789abcdefghijklmnop"))
  );
  await assert.rejects(() => loadProfile(secret), /secret pattern GITHUB_TOKEN/);

  // A path-valued field holding one person's machine.
  const absolute = await seedWith(
    broken((d) => ((d.references as Record<string, unknown>).contextPath = "/home/someone/notes.md"))
  );
  await assert.rejects(() => loadProfile(absolute), /must be workspace-relative/);

  // Nothing was examined is not the same as nothing was found.
  const clean = await loadProfile(await seedProfile());
  assert.ok(clean.scanScope.keysInspected > 0, "the scan must report how many keys it inspected");
  assert.ok(clean.scanScope.stringValuesInspected > 0);

  coversRule(NO_STATE, "no JSON pointer or key name matches the forbidden runtime-state key set");
  coversRule(NO_STATE, "no string value matches the Core secret pattern rule set");
  coversRule(NO_STATE, "all path-valued fields are workspace-relative paths");
  coversRule(
    NO_STATE,
    "config.json does not contain raw stdout, stderr, diff, run result, approval history, execution evidence, secret, token, password, private key, session cookie, operating server connection detail, adapter command path, provider-specific CLI option, provider-specific model setting, transcript parsing rule, or personal local absolute path"
  );
  coversRule(POLICY_INTERNAL, "each policy block contains only portable policy source fields");
});

test("the Local Overlay is restrict-only, fixed in place, and limited to declared keys", async () => {
  for (const [mutate, pattern] of [
    [
      (d: Record<string, unknown>) => ((d.localPolicy as Record<string, unknown>).mergeMode = "MERGE"),
      /mergeMode must be RESTRICT_ONLY/
    ],
    [
      (d: Record<string, unknown>) => ((d.localPolicy as Record<string, unknown>).overlayPath = "local.json"),
      /overlayPath must be \.codefleet\/local\.json/
    ]
  ] as const) {
    const root = await seedWith(broken(mutate));
    await assert.rejects(() => loadProfile(root), pattern);
  }

  // A key the Profile never allowed is recorded as a violation and dropped, so
  // the overlay cannot become a second, unreviewed policy source.
  const root = await seedProfile({ allowedLocalKeys: ["adapterCommand"] });
  await writeFile(
    path.join(root, ".codefleet", "local.json"),
    `${JSON.stringify({
      adapterCommand: { command: "codex", args: ["exec", "-"] },
      policies: { commands: { deniedCommands: [] } }
    })}\n`,
    "utf8"
  );

  const loaded = await loadProfile(root);
  assert.deepEqual(loaded.overlay.changedLocalKeys, ["adapterCommand"]);
  assert.deepEqual(loaded.overlay.violatingLocalKeys, ["policies"]);
  assert.equal(loaded.overlay.values.policies, undefined, "a violating key must not be applied");

  coversRule(OVERLAY, "localPolicy.mergeMode == RESTRICT_ONLY");
  coversRule(OVERLAY, 'localPolicy.overlayPath == ".codefleet/local.json"');
  coversRule(OVERLAY, "Local Overlay modifies only keys listed in localPolicy.allowedLocalKeys");
});

test("the adapter command comes from the overlay, and the Profile alone leaves it unset", async () => {
  const withOverlay = await seedProfile();
  await writeLocalOverlay(withOverlay, { command: "codex", args: ["exec", "-"] });
  const resolved = await loadConfig(withOverlay);
  assert.deepEqual(resolved.adapterCommand, { command: "codex", args: ["exec", "-"] });

  // No overlay is not an error. It leaves the command unset, and a Run that
  // needs one fails at execution rather than at policy load.
  const bare = await seedProfile();
  const bareConfig = await loadConfig(bare);
  assert.deepEqual(bareConfig.adapterCommand, {});
});

test("the runtime read model is derived from the Profile, not stored beside it", async () => {
  const root = await seedProfile({ workspaceId: "derived", harnessMode: "COMMAND_EXEC" });
  const config = await loadConfig(root);

  assert.equal(config.schemaVersion, "1.0.0");
  assert.equal(config.workspaceId, "derived");
  assert.equal(config.harnessMode, "COMMAND_EXEC");
  // COMMAND_EXEC is the only requested mode that both edits files and runs
  // commands, which is what the Run's two-value view has always meant.
  assert.equal(config.mode, "execute");
  assert.equal(config.agentAdapter, "codex");
  assert.equal(config.isolationMode, "NONE");

  for (const mode of ["DRY_RUN", "SUGGEST_ONLY", "WORKSPACE_EDIT"] as const) {
    const other = await loadConfig(await seedProfile({ harnessMode: mode }));
    assert.equal(other.mode, "dry-run", `${mode} must not resolve to execute`);
  }

  // An unreadable harnessMode takes the least capable end of the axis, the same
  // as every other policy default.
  const missing = await seedWith(
    broken((d) => ((d.defaults as Record<string, unknown>).task = {}))
  );
  assert.equal((await loadConfig(missing)).harnessMode, "DRY_RUN");
});
