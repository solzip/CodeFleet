// AgentRole — a classification, not a permission grant.
//
// A role contributes an upper bound to effectivePolicy and nothing else. It
// cannot hand out a capability the Profile withheld, and it does not restate
// restrictions that Guardrail global rules or harnessMode already own. That is
// why a Core role owns exactly three fields: everything else it might have said
// was already said somewhere with authority to enforce it.
//
// roleGuidance is the deliberate exception: restrictions a machine cannot decide
// ("do not change behaviour outside the Task scope") live there as prompt text
// and are never read during policy evaluation. Putting them in a policy field
// would make them look enforced when nothing enforces them.

import { HARNESS_MODES, type HarnessMode } from "./types.ts";

/** Core owns these seven destructive categories; roles may only reference them. */
export const CORE_DESTRUCTIVE_CATEGORIES = [
  "INFRA_APPLY",
  "INFRA_DESTROY",
  "CLOUD_RESOURCE_MUTATION",
  "SERVICE_LIFECYCLE",
  "DEPLOYMENT_MUTATION",
  "DATA_DESTRUCTION",
  "VCS_HISTORY_REWRITE"
] as const;

export interface AgentRole {
  defaultMaxMode: HarnessMode;
  deniedCommandCategories: string[];
  roleGuidance: string;
}

/** The three fields a Core AgentRole owns. Exactly these, no more. */
export const AGENT_ROLE_FIELDS = ["defaultMaxMode", "deniedCommandCategories", "roleGuidance"] as const;

export const CORE_AGENT_ROLES: Record<string, AgentRole> = {
  BACKEND_IMPLEMENTER: {
    defaultMaxMode: "WORKSPACE_EDIT",
    deniedCommandCategories: ["INFRA_APPLY", "CLOUD_RESOURCE_MUTATION"],
    roleGuidance: ""
  },
  // No denied categories: SUGGEST_ONLY already blocks command execution, and
  // restating it here would be a role declaring something it does not narrow.
  BACKEND_REVIEWER: { defaultMaxMode: "SUGGEST_ONLY", deniedCommandCategories: [], roleGuidance: "" },
  BACKEND_REFACTORER: {
    defaultMaxMode: "WORKSPACE_EDIT",
    deniedCommandCategories: ["INFRA_APPLY", "CLOUD_RESOURCE_MUTATION"],
    roleGuidance:
      "Do not change behaviour outside the Task scope, and do not change a public API contract that was not explicitly scoped."
  },
  INFRA_OPERATOR: {
    defaultMaxMode: "COMMAND_EXEC",
    deniedCommandCategories: ["SERVICE_LIFECYCLE", "DEPLOYMENT_MUTATION"],
    roleGuidance: ""
  },
  INFRA_DEBUGGER: { defaultMaxMode: "SUGGEST_ONLY", deniedCommandCategories: [], roleGuidance: "" },
  IAC_ENGINEER: {
    defaultMaxMode: "COMMAND_EXEC",
    deniedCommandCategories: ["INFRA_APPLY", "INFRA_DESTROY", "CLOUD_RESOURCE_MUTATION"],
    roleGuidance: ""
  },
  DOCS_WRITER: {
    defaultMaxMode: "WORKSPACE_EDIT",
    deniedCommandCategories: ["INFRA_APPLY", "CLOUD_RESOURCE_MUTATION", "SERVICE_LIFECYCLE"],
    roleGuidance: "Do not modify source files that are not documentation."
  }
};

// Capability order. meet() takes the lower of two bounds, which is how a role
// contributes an upper bound rather than a grant.
const MODE_RANK: Record<string, number> = {
  DRY_RUN: 0,
  SUGGEST_ONLY: 1,
  WORKSPACE_EDIT: 2,
  COMMAND_EXEC: 3
};

export function modeRank(mode: string): number {
  return MODE_RANK[mode] ?? -1;
}

export function meetMode(a: string, b: string): string {
  return modeRank(a) <= modeRank(b) ? a : b;
}

export interface RoleFinding {
  jsonPointer: string;
  detail: string;
}

export interface CustomRole extends AgentRole {
  baseRole: string;
}

/**
 * A custom role may narrow its base and never widen it: its mode may not exceed
 * the base default, and its denied set must be a superset of the base's.
 */
export function validateCustomRole(roleId: string, value: unknown, pointer: string): RoleFinding[] {
  const findings: RoleFinding[] = [];

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "a custom role must be an object" }];
  }
  const role = value as Record<string, unknown>;

  const expected = new Set<string>([...AGENT_ROLE_FIELDS, "baseRole"]);
  const unexpected = Object.keys(role).filter((key) => !expected.has(key));
  if (unexpected.length > 0) {
    findings.push({
      jsonPointer: pointer,
      detail:
        `a role owns exactly ${AGENT_ROLE_FIELDS.join(", ")} plus baseRole; ` +
        `unexpected ${unexpected.sort().join(", ")}. Anything else is already owned by ` +
        "Guardrail global rules, harnessMode semantics, or destructiveCommands"
    });
  }

  const bases = role.baseRole;
  if (typeof bases !== "string" || CORE_AGENT_ROLES[bases] === undefined) {
    findings.push({
      jsonPointer: `${pointer}/baseRole`,
      detail: `must name exactly one Core AgentRole (${Object.keys(CORE_AGENT_ROLES).join(", ")})`
    });
    return findings;
  }
  const base = CORE_AGENT_ROLES[bases];

  const maxMode = role.defaultMaxMode;
  if (typeof maxMode !== "string" || !(HARNESS_MODES as string[]).includes(maxMode)) {
    findings.push({
      jsonPointer: `${pointer}/defaultMaxMode`,
      detail: `must be one of ${HARNESS_MODES.join(", ")}`
    });
  } else if (modeRank(maxMode) > modeRank(base.defaultMaxMode)) {
    findings.push({
      jsonPointer: `${pointer}/defaultMaxMode`,
      detail: `${maxMode} exceeds baseRole ${bases} defaultMaxMode ${base.defaultMaxMode}; a custom role may only narrow`
    });
  }

  const denied = role.deniedCommandCategories;
  if (!Array.isArray(denied) || denied.some((c) => typeof c !== "string")) {
    findings.push({ jsonPointer: `${pointer}/deniedCommandCategories`, detail: "must be an array of categoryIds" });
  } else {
    const unknown = denied.filter((c) => !(CORE_DESTRUCTIVE_CATEGORIES as readonly string[]).includes(c as string));
    if (unknown.length > 0) {
      findings.push({
        jsonPointer: `${pointer}/deniedCommandCategories`,
        detail:
          `${unknown.join(", ")} is not a Core destructive categoryId. A role references the existing ` +
          "identifier space and introduces none of its own"
      });
    }
    const missing = base.deniedCommandCategories.filter((c) => !denied.includes(c));
    if (missing.length > 0) {
      findings.push({
        jsonPointer: `${pointer}/deniedCommandCategories`,
        detail: `must be a superset of baseRole ${bases}; missing ${missing.join(", ")}`
      });
    }
  }

  if (role.roleGuidance !== undefined && typeof role.roleGuidance !== "string") {
    findings.push({ jsonPointer: `${pointer}/roleGuidance`, detail: "must be prompt text" });
  }

  return findings;
}

export interface RoleResolution {
  roleId: string;
  role: AgentRole | null;
  source: "CORE" | "PROFILE_CUSTOM" | "UNRESOLVED";
  blockedReason: string;
}

export function resolveAgentRole(input: {
  taskRole: string | undefined;
  allowedAgentRoles: string[];
  customRoles: Record<string, CustomRole>;
}): RoleResolution {
  const { taskRole, allowedAgentRoles, customRoles } = input;

  if (taskRole === undefined || taskRole === "" || taskRole === "REQUIRE_EXPLICIT") {
    return {
      roleId: taskRole ?? "",
      role: null,
      source: "UNRESOLVED",
      blockedReason:
        "Run Planning is blocked: the Task Revision has no concrete agentRole. " +
        `Set one of: ${allowedAgentRoles.join(", ") || Object.keys(CORE_AGENT_ROLES).join(", ")}`
    };
  }

  const custom = customRoles[taskRole];
  const core = CORE_AGENT_ROLES[taskRole];
  if (custom === undefined && core === undefined) {
    return {
      roleId: taskRole,
      role: null,
      source: "UNRESOLVED",
      blockedReason: `Run Planning is blocked: ${taskRole} is neither a Core AgentRole nor a Project Profile custom role.`
    };
  }

  // allowedAgentRoles is the Profile's list. An empty list constrains nothing,
  // the same way an empty allowedCommands does.
  if (allowedAgentRoles.length > 0 && !allowedAgentRoles.includes(taskRole)) {
    return {
      roleId: taskRole,
      role: null,
      source: "UNRESOLVED",
      blockedReason: `Run Planning is blocked: ${taskRole} is not in policies.agentRoles.allowedAgentRoles (${allowedAgentRoles.join(", ")}).`
    };
  }

  return {
    roleId: taskRole,
    role: custom ?? core,
    source: custom !== undefined ? "PROFILE_CUSTOM" : "CORE",
    blockedReason: ""
  };
}

export interface RoleEffectiveRestrictions {
  roleId: string;
  maxMode: string;
  deniedCommandCategories: string[];
  globalRestrictions: string[];
  computedFrom: string[];
  diagnosticOnly: true;
}

/**
 * A read model, never a source. It merges role fields with the global rules so a
 * person can see "what is forbidden for this role" in one place, and it is
 * marked diagnosticOnly because it deliberately omits Task guardrails and Run
 * options — enforcement reads effectivePolicy, which has all of them.
 */
export function computeRoleEffectiveRestrictions(roleId: string, role: AgentRole): RoleEffectiveRestrictions {
  return {
    roleId,
    maxMode: role.defaultMaxMode,
    deniedCommandCategories: [...role.deniedCommandCategories].sort(),
    globalRestrictions: [
      "PRODUCTION_MUTATION_REQUIRES_PROFILE_ALLOWANCE_TASK_SCOPE_AND_DURABLE_APPROVAL",
      "DESTRUCTIVE_COMMAND_CATEGORY_REQUIRES_EXPLICIT_DURABLE_APPROVAL",
      "DENIED_RULES_ARE_EVALUATED_BEFORE_ALLOWED_RULES"
    ],
    computedFrom: ["Core AgentRole fields", "Guardrail global rules", "harnessMode semantics"],
    diagnosticOnly: true
  };
}

/** READ_MODEL_DRIFT when a stored copy no longer matches recomputation. */
export function detectRoleRestrictionsDrift(
  stored: unknown,
  roleId: string,
  role: AgentRole
): { drifted: boolean; expected: RoleEffectiveRestrictions } {
  const expected = computeRoleEffectiveRestrictions(roleId, role);
  return { drifted: JSON.stringify(stored) !== JSON.stringify(expected), expected };
}

export interface GuardrailResolution {
  mode: string;
  blockedReason: string;
}

/**
 * Task-local guardrails may narrow and never widen. The mode must be concrete
 * before planning and may not exceed what the role already caps.
 */
export function resolveGuardrails(input: {
  guardrails: Record<string, unknown> | undefined;
  roleMaxMode: string;
  profileMaxMode: string;
}): GuardrailResolution {
  const { guardrails, roleMaxMode, profileMaxMode } = input;
  const ceiling = meetMode(roleMaxMode, profileMaxMode);

  const declared = guardrails?.mode;
  if (declared === undefined) {
    // Absent guardrails narrow nothing; the ceiling stands.
    return { mode: ceiling, blockedReason: "" };
  }

  if (declared === "REQUIRE_EXPLICIT" || typeof declared !== "string" || !(HARNESS_MODES as string[]).includes(declared)) {
    return {
      mode: "",
      blockedReason:
        `Run Planning is blocked: guardrails.mode must be concrete and one of ${HARNESS_MODES.join(", ")}, ` +
        `got ${JSON.stringify(declared)}`
    };
  }

  if (modeRank(declared) > modeRank(ceiling)) {
    return {
      mode: "",
      blockedReason:
        `Run Planning is blocked: guardrails.mode ${declared} exceeds the resolved ceiling ${ceiling} ` +
        `(role ${roleMaxMode}, profile ${profileMaxMode}). Guardrails may only narrow.`
    };
  }

  return { mode: declared, blockedReason: "" };
}
