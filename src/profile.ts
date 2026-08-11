// Project Profile — the workspace policy contract at <workspaceRoot>/.codefleet/config.json.
//
// The shape is fixed by the design, not chosen here: PROFILE_TOP_LEVEL_KEYS_FIXED
// fixes the seven top-level keys and PROFILE_POLICY_BLOCK_KEYS_FIXED fixes the
// nine policy blocks. Both are exact sets. A key that is neither missing nor
// expected is a typo or a private extension, and both must fail loudly, because
// a policy block nobody reads looks identical to a policy block that permits
// everything.
//
// The Profile is committed and shared. That is why it may not carry runtime
// evidence, local machine state, or secrets: an adapter command path is one
// person's machine, not the workspace's policy. Those belong in the Local
// Overlay, which may only narrow what the Profile already allows.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const PROFILE_SCHEMA_VERSION = "1.0.0";

export const PROFILE_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "project",
  "workspace",
  "defaults",
  "policies",
  "references",
  "localPolicy"
] as const;

export const PROFILE_POLICY_KEYS = [
  "harness",
  "agentAdapters",
  "files",
  "commands",
  "risk",
  "verification",
  "redaction",
  "carryForward",
  "agentRoles"
] as const;

export const LOCAL_OVERLAY_PATH = ".codefleet/local.json";

// Key names that name runtime evidence, local machine state, or a credential.
// Compared case-insensitively against every key at every depth, because the
// rule quantifies over "no JSON pointer or key name", not over the top level.
const FORBIDDEN_PROFILE_KEYS = [
  "stdout",
  "stderr",
  "diff",
  "patch",
  "runresult",
  "approvalhistory",
  "executionevidence",
  "secret",
  "secrets",
  "token",
  "apikey",
  "accesskey",
  "password",
  "passphrase",
  "privatekey",
  "sessioncookie",
  "cookie",
  "connectionstring",
  "dsn",
  // Adapter execution detail. A command path is the one thing that differs per
  // machine, so it is the clearest case of what the Local Overlay exists for.
  "command",
  "args",
  "executable",
  "binpath",
  "model",
  "clioptions",
  "transcriptformat",
  "transcriptparsingrule"
];

// Deliberately narrow and literal. A pattern that tries to be clever about what
// a secret looks like produces false confidence; these match credential formats
// that are unambiguous on sight.
const SECRET_VALUE_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "GITHUB_TOKEN", re: /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: "OPENAI_KEY", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "AWS_ACCESS_KEY_ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "SLACK_TOKEN", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: "PRIVATE_KEY_BLOCK", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "BEARER_HEADER", re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/ }
];

const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;
// Only fields whose name says they hold a path are checked as paths, so a
// sentence that happens to start with "/" in a description is not a violation.
const PATH_VALUED_KEY = /(^|[a-z])(path|dir|directory|root|file|location)$/i;

export interface ProfileFinding {
  checkId: string;
  jsonPointer: string;
  detail: string;
}

export interface ProfileScanScope {
  keysInspected: number;
  stringValuesInspected: number;
  pathValuedFieldsInspected: number;
}

export interface LocalOverlayReading {
  present: boolean;
  overlayPath: string;
  changedLocalKeys: string[];
  violatingLocalKeys: string[];
  values: Record<string, unknown>;
  unavailableReason: string;
}

export interface ProjectProfile {
  schemaVersion: string;
  project: Record<string, unknown>;
  workspace: Record<string, unknown>;
  defaults: Record<string, unknown>;
  policies: Record<string, unknown>;
  references: Record<string, unknown>;
  localPolicy: LocalPolicy;
}

export interface LocalPolicy {
  mergeMode: "RESTRICT_ONLY";
  overlayPath: string;
  allowedLocalKeys: string[];
}

export interface LoadedProfile {
  profile: ProjectProfile;
  profilePath: string;
  overlay: LocalOverlayReading;
  scanScope: ProfileScanScope;
}

export class ProfileValidationError extends Error {
  readonly findings: ProfileFinding[];

  constructor(profilePath: string, findings: ProfileFinding[]) {
    super(
      `Invalid Project Profile at ${profilePath}:\n` +
        findings.map((f) => `  - [${f.checkId}] ${f.jsonPointer || "/"}: ${f.detail}`).join("\n")
    );
    this.name = "ProfileValidationError";
    this.findings = findings;
  }
}

export function profilePathFor(rootDir: string): string {
  return path.join(rootDir, ".codefleet", "config.json");
}

export async function loadProfile(rootDir: string): Promise<LoadedProfile> {
  const profilePath = profilePathFor(rootDir);

  let raw: string;
  try {
    raw = await readFile(profilePath, "utf8");
  } catch {
    throw new Error("CodeFleet is not initialized. Run `codefleet init` first.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProfileValidationError(profilePath, [
      {
        checkId: "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT",
        jsonPointer: "",
        detail: `config.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      }
    ]);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProfileValidationError(profilePath, [
      {
        checkId: "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT",
        jsonPointer: "",
        detail: "config.json must be a JSON object"
      }
    ]);
  }

  const document = parsed as Record<string, unknown>;
  const findings: ProfileFinding[] = [];

  findings.push(...checkSchemaVersion(document));
  findings.push(...checkTopLevelKeys(document));
  findings.push(...checkPolicyKeys(document));

  const scan = scanForForbiddenState(document, findings);
  const localPolicy = readLocalPolicy(document, findings);

  if (findings.length > 0) {
    throw new ProfileValidationError(profilePath, findings);
  }

  const profile: ProjectProfile = {
    schemaVersion: String(document.schemaVersion),
    project: asObject(document.project),
    workspace: asObject(document.workspace),
    defaults: asObject(document.defaults),
    policies: asObject(document.policies),
    references: asObject(document.references),
    localPolicy: localPolicy as LocalPolicy
  };

  const overlay = await readLocalOverlay(rootDir, profile, profilePath);

  return { profile, profilePath, overlay, scanScope: scan };
}

function checkSchemaVersion(document: Record<string, unknown>): ProfileFinding[] {
  const value = document.schemaVersion;
  if (value === undefined) {
    return [
      {
        checkId: "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT",
        jsonPointer: "/schemaVersion",
        detail: "the parsed document must contain schemaVersion"
      }
    ];
  }
  if (typeof value !== "string" || value.length === 0) {
    return [
      {
        checkId: "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT",
        jsonPointer: "/schemaVersion",
        detail: "schemaVersion must be a non-empty string"
      }
    ];
  }
  if (value !== PROFILE_SCHEMA_VERSION) {
    // An unsupported version is refused rather than interpreted. Reading an
    // unknown schema with this rule set would enforce the wrong contract.
    return [
      {
        checkId: "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT",
        jsonPointer: "/schemaVersion",
        detail: `schemaVersion ${value} is not supported by this validation rule set (${PROFILE_SCHEMA_VERSION})`
      }
    ];
  }
  return [];
}

function checkTopLevelKeys(document: Record<string, unknown>): ProfileFinding[] {
  const expected = new Set<string>(PROFILE_TOP_LEVEL_KEYS);
  const actual = Object.keys(document);
  const missing = [...expected].filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !expected.has(key));

  if (missing.length === 0 && unexpected.length === 0) {
    return [];
  }
  return [
    {
      checkId: "PROFILE_TOP_LEVEL_KEYS_FIXED",
      jsonPointer: "",
      detail:
        `top-level keys must be exactly ${[...expected].join(", ")}` +
        (missing.length > 0 ? `; missing ${missing.join(", ")}` : "") +
        (unexpected.length > 0 ? `; unexpected ${unexpected.sort().join(", ")}` : "")
    }
  ];
}

function checkPolicyKeys(document: Record<string, unknown>): ProfileFinding[] {
  const policies = document.policies;
  if (policies === undefined) {
    return [];
  }
  if (policies === null || typeof policies !== "object" || Array.isArray(policies)) {
    return [
      {
        checkId: "PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA",
        jsonPointer: "/policies",
        detail: "policies must be an object"
      }
    ];
  }

  const findings: ProfileFinding[] = [];
  const expected = new Set<string>(PROFILE_POLICY_KEYS);
  const actual = Object.keys(policies as Record<string, unknown>);
  const missing = [...expected].filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !expected.has(key));

  if (missing.length > 0 || unexpected.length > 0) {
    findings.push({
      checkId: "PROFILE_POLICY_BLOCK_KEYS_FIXED",
      jsonPointer: "/policies",
      detail:
        `policies keys must be exactly ${[...expected].join(", ")}` +
        (missing.length > 0 ? `; missing ${missing.join(", ")}` : "") +
        (unexpected.length > 0 ? `; unexpected ${unexpected.sort().join(", ")}` : "")
    });
  }

  for (const key of actual) {
    if (!expected.has(key)) {
      continue;
    }
    const block = (policies as Record<string, unknown>)[key];
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      findings.push({
        checkId: "PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA",
        jsonPointer: `/policies/${key}`,
        detail: `policies.${key} must be an object`
      });
    }
  }

  // effectivePolicy is computed per Run from Profile + Overlay + Task. Storing
  // it would let a stale copy stand in for the calculation.
  if (Object.prototype.hasOwnProperty.call(policies, "effectivePolicy")) {
    findings.push({
      checkId: "PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA",
      jsonPointer: "/policies/effectivePolicy",
      detail: "policies must not contain effectivePolicy; it is derived per Run, never stored"
    });
  }

  return findings;
}

// Walks every key and every string value. The counts come back so a Profile
// that was never really inspected cannot read like one that was found clean.
function scanForForbiddenState(
  document: Record<string, unknown>,
  findings: ProfileFinding[]
): ProfileScanScope {
  const scope: ProfileScanScope = {
    keysInspected: 0,
    stringValuesInspected: 0,
    pathValuedFieldsInspected: 0
  };

  const walk = (value: unknown, pointer: string, keyName: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${pointer}/${index}`, keyName));
      return;
    }

    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        scope.keysInspected += 1;
        const childPointer = `${pointer}/${escapePointer(key)}`;
        if (FORBIDDEN_PROFILE_KEYS.includes(key.toLowerCase())) {
          findings.push({
            checkId: "PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE",
            jsonPointer: childPointer,
            detail:
              `key "${key}" names runtime evidence, local machine state, or a credential. ` +
              `Move it to the Run Trace, the Run Summary, or ${LOCAL_OVERLAY_PATH}`
          });
        }
        walk(child, childPointer, key);
      }
      return;
    }

    if (typeof value !== "string") {
      return;
    }

    scope.stringValuesInspected += 1;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.re.test(value)) {
        findings.push({
          checkId: "PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE",
          jsonPointer: pointer,
          detail: `value matches the secret pattern ${pattern.id}; rotate the credential outside CodeFleet and remove it here`
        });
        break;
      }
    }

    if (PATH_VALUED_KEY.test(keyName)) {
      scope.pathValuedFieldsInspected += 1;
      if (ABSOLUTE_PATH.test(value)) {
        findings.push({
          checkId: "PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE",
          jsonPointer: pointer,
          detail: `path-valued field must be workspace-relative, got the absolute path ${value}`
        });
      }
    }
  };

  walk(document, "", "");
  return scope;
}

function readLocalPolicy(document: Record<string, unknown>, findings: ProfileFinding[]): LocalPolicy {
  const fallback: LocalPolicy = {
    mergeMode: "RESTRICT_ONLY",
    overlayPath: LOCAL_OVERLAY_PATH,
    allowedLocalKeys: []
  };

  const raw = document.localPolicy;
  if (raw === undefined) {
    return fallback;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    findings.push({
      checkId: "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
      jsonPointer: "/localPolicy",
      detail: "localPolicy must be an object"
    });
    return fallback;
  }

  const block = raw as Record<string, unknown>;

  if (block.mergeMode !== "RESTRICT_ONLY") {
    findings.push({
      checkId: "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
      jsonPointer: "/localPolicy/mergeMode",
      detail: `localPolicy.mergeMode must be RESTRICT_ONLY, got ${JSON.stringify(block.mergeMode)}`
    });
  }
  if (block.overlayPath !== LOCAL_OVERLAY_PATH) {
    findings.push({
      checkId: "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
      jsonPointer: "/localPolicy/overlayPath",
      detail: `localPolicy.overlayPath must be ${LOCAL_OVERLAY_PATH}, got ${JSON.stringify(block.overlayPath)}`
    });
  }

  let allowedLocalKeys: string[] = [];
  if (block.allowedLocalKeys === undefined) {
    allowedLocalKeys = [];
  } else if (
    !Array.isArray(block.allowedLocalKeys) ||
    block.allowedLocalKeys.some((key) => typeof key !== "string" || key.length === 0)
  ) {
    findings.push({
      checkId: "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
      jsonPointer: "/localPolicy/allowedLocalKeys",
      detail: "localPolicy.allowedLocalKeys must be an array of non-empty strings"
    });
  } else {
    allowedLocalKeys = block.allowedLocalKeys as string[];
  }

  return {
    mergeMode: "RESTRICT_ONLY",
    overlayPath: LOCAL_OVERLAY_PATH,
    allowedLocalKeys
  };
}

// The overlay is read, not trusted. A key it is not allowed to touch is recorded
// as a violation and dropped rather than applied, so an overlay cannot become a
// second, unreviewed policy source.
async function readLocalOverlay(
  rootDir: string,
  profile: ProjectProfile,
  profilePath: string
): Promise<LocalOverlayReading> {
  const overlayPath = profile.localPolicy.overlayPath;
  const absolute = path.join(rootDir, overlayPath);

  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch {
    return {
      present: false,
      overlayPath,
      changedLocalKeys: [],
      violatingLocalKeys: [],
      values: {},
      unavailableReason: "LOCAL_OVERLAY_NOT_PRESENT"
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProfileValidationError(profilePath, [
      {
        checkId: "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
        jsonPointer: `/${overlayPath}`,
        detail: `Local Overlay is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      }
    ]);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProfileValidationError(profilePath, [
      {
        checkId: "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
        jsonPointer: `/${overlayPath}`,
        detail: "Local Overlay must be a JSON object"
      }
    ]);
  }

  const allowed = new Set(profile.localPolicy.allowedLocalKeys);
  const changedLocalKeys: string[] = [];
  const violatingLocalKeys: string[] = [];
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (allowed.has(key)) {
      changedLocalKeys.push(key);
      values[key] = value;
    } else {
      violatingLocalKeys.push(key);
    }
  }

  return {
    present: true,
    overlayPath,
    changedLocalKeys: changedLocalKeys.sort(),
    violatingLocalKeys: violatingLocalKeys.sort(),
    values,
    unavailableReason: ""
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
