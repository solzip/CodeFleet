// Policy rule ids — one id space shared by Core and every Project Profile.
//
// An id is permanent. A retired id is never reassigned, because past evidence
// records ruleIds and reassigning one would silently repoint an old finding at a
// different rule.
//
// Origin lives in definedByRef, never in the id. Encoding it as a prefix would
// mean that promoting a rule from a Profile into Core renames it, and every
// record that already named it would stop resolving.

/** Every Core rule id. test/policy-rule-id.test.ts keeps this in sync with the design. */
export const CORE_POLICY_RULE_IDS: string[] = [
  "ADAPTER_CANNOT_EXPAND_CAPABILITIES",
  "ADAPTER_REQUEST_AND_RESULT_ARE_RUN_TRACE_ARTIFACTS",
  "ADAPTER_REQUEST_IS_PROVIDER_AGNOSTIC",
  "ADAPTER_RESULT_IS_EVIDENCE_NOT_DECISION",
  "AGENT_ROLE_DECLARES_ONLY_WHAT_IT_NARROWS",
  "AGENT_ROLE_IS_CLASSIFICATION_NOT_PERMISSION_GRANT",
  "CASE_INSENSITIVE_PATH_MATCH_USES_CANONICAL_KEY",
  "CODEFLEET_DURABLE_FILE_MAP_IS_LAYERED_CONTRACT",
  "COMMAND_EXECUTION_REQUIRES_OBSERVABLE_AUTHORITY_OR_DEGRADED_POLICY",
  "COMMAND_MATCHER_IS_ARGV_PREFIX_WITHOUT_PATTERN_LANGUAGE",
  "COMMAND_NORMALIZATION_IS_ARGV_BASED_AND_SHELL_FREE",
  "COMMAND_TRUTH_REQUIRES_HARNESS_VISIBLE_CHANNEL",
  "CORRECTIVE_EVENT_REQUIRES_VALID_LEDGER_AND_WRONG_DECISION",
  "DELETE_AND_RENAME_CHECK_SOURCE_AND_TARGET",
  "DENIED_PATHS_OVERRIDE_ALLOWED_PATHS",
  "DESTRUCTIVE_COMMAND_CATEGORY_IS_APPROVAL_UNIT",
  "EFFECTIVE_REQUIRED_GATES_MERGE_BY_DIMENSION",
  "EXPORT_FIELD_ALLOWLIST_IS_CORE_OWNED_EXPOSURE_TIER",
  "EXPORT_FIELD_PATH_IS_EXPLICIT_LEAF_WITHOUT_WILDCARD",
  "EXPORT_SCHEMA_UNKNOWN_FIELD_IS_DROPPED_AND_REPORTED",
  "FILES_POLICY_MATCHER_IS_BOUNDED_GLOB_SUBSET",
  "GENERATED_UNTRACKED_AND_GITIGNORED_FILES_ARE_POLICY_SUBJECTS",
  "GUARDRAIL_IS_TASK_LOCAL_RESTRICTION_SOURCE",
  "HARNESS_ENFORCEMENT_IS_POLICY_AND_EVIDENCE_BOUNDARY",
  "HARNESS_OBSERVATION_OWNS_EXECUTION_EVIDENCE",
  "HARNESS_WORKSPACE_SNAPSHOT_IS_STATE_EVIDENCE",
  "IMPLEMENTATION_SLICING_MUST_PRESERVE_FINAL_BOUNDARIES",
  "LATEST_EFFECTIVE_REVIEW_DECISION_IS_LEDGER_DERIVED",
  "LOCAL_REVIEW_IMPORT_APPENDS_LEDGER_DECISION",
  "LOCAL_REVIEW_MIGRATION_STATUS_IS_DERIVED",
  "MANUAL_SPINE_PASS_IS_EVIDENCE_CHECKLIST",
  "MINIMUM_CLI_FLOW_PRESERVES_FINAL_BOUNDARIES",
  "MUTATION_COMMAND_PHASES_ARE_FIXED",
  "MUTATION_ID_IS_INTENT_DERIVED_AND_IDEMPOTENT",
  "MUTATION_LOCK_IS_FAIL_FAST_AND_EXCLUDES_RUN_EXECUTION",
  "NESTED_REPO_AND_SUBMODULE_REQUIRE_EXPLICIT_ALLOW",
  "OBJECTIVE_LEDGER_REPLAY_FAILURES_BLOCK_DERIVED_PROGRESS",
  "OBJECTIVE_LEDGER_REPLAY_IS_SOURCE_OF_SNAPSHOT",
  "PATHS_ARE_WORKSPACE_RELATIVE_AND_CANONICAL",
  "POLICY_RULE_ID_IS_UNIQUE_WITH_REF_RECORDED_ORIGIN",
  "PROFILE_CONFIG_IS_WORKSPACE_CONTRACT",
  "PROFILE_DEFAULTS_REQUIRED_GATES_SCHEMA",
  "PROFILE_DEFAULTS_RUN_AGENT_ADAPTER_SCHEMA",
  "PROFILE_DEFAULTS_RUN_ISOLATION_MODE_SCHEMA",
  "PROFILE_DEFAULTS_TASK_WORKFLOW_SCHEMA",
  "PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE",
  "PROFILE_EFFECTIVE_POLICY_IS_DERIVED",
  "PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY",
  "PROFILE_POLICY_AGENT_ADAPTERS_BLOCK",
  "PROFILE_POLICY_AUTO_ADVANCE_ON_DONE_IS_BOOLEAN",
  "PROFILE_POLICY_BLOCK_KEYS_FIXED",
  "PROFILE_TOP_LEVEL_KEYS_FIXED",
  "PROJECT_PROFILE_POLICY_BLOCK_INTERNAL_SCHEMA",
  "REDACTION_ACTION_STRICTNESS_ORDER_IS_FIXED",
  "REDACTION_PATTERN_IS_LINEAR_TIME_REGEX_SUBSET",
  "REDACTION_RULE_FAILURE_BLOCKS_EXPORT",
  "REVIEW_DECISION_ACTOR_MUST_SATISFY_RESULT_REVIEW_GATE",
  "REVIEW_DECISION_MIGRATION_CONFLICTS_ARE_EXPLICIT",
  "REVIEW_DECISION_REQUIRES_FROZEN_EVIDENCE_BUNDLE",
  "REVIEW_EVIDENCE_ABSENCE_AND_HASH_MISMATCH_HAVE_DIFFERENT_EFFECTS",
  "REVIEW_MODEL_V02_IS_LOCAL_MIGRATION_PATH",
  "RISK_RULE_CONJUNCTION_IS_FLAT_AND_NEGATION_IS_DENIED",
  "RISK_RULE_REUSES_FIXED_MATCHERS",
  "ROLE_EFFECTIVE_RESTRICTIONS_IS_DIAGNOSTIC_READ_MODEL",
  "RUN_PLAN_AGENT_ADAPTER_RESOLUTION",
  "RUN_PLAN_IS_IMMUTABLE_RESUME_BOUNDARY",
  "RUN_RECORD_IS_LOCAL_DERIVED_NARRATIVE",
  "RUN_REVIEW_DECIDED_IS_DURABLE_DECISION_EVENT",
  "RUN_SUMMARY_VERIFICATION_AND_LOCAL_REVIEW_LAYOUT_FIXED",
  "S2_MINIMUM_ARTIFACT_LAYOUT_IS_FIXED",
  "S2_RUN_ATTEMPT_ALWAYS_LEAVES_THREE_ARTIFACTS",
  "S5_EXPORT_SEAM_USES_SANITIZED_SUMMARY_ONLY",
  "SYMLINK_TARGET_MUST_NOT_ESCAPE_PATH_POLICY",
  "SYSTEM_POLICY_AUTO_REVIEW_DECISION_IS_BOUNDED",
  "TASK_REVISION_MINIMUM_CONTRACT_IS_SOURCE_ONLY",
  "TASK_REVISION_REQUIRED_GATES_ARE_CONCRETE",
  "TASK_WORKFLOW_IS_DRAFT_TEMPLATE_NOT_EXECUTION_POLICY",
  "UNKNOWN_RISK_IS_UNRESOLVED_STATE_NOT_HIGH_SEVERITY",
  "V0_2_CODEX_SLICE_MUST_NOT_WEAKEN_FINAL_S2_CONTRACT",
  "VERIFICATION_EVIDENCE_IS_HARNESS_OWNED",
  "VERIFICATION_EXECUTION_IS_HARNESS_OWNED_EVIDENCE",
  "VERIFIED_REQUIRES_ACCEPTED_REVIEW_AND_SATISFIED_GATES",
  "WORKSPACE_DISCOVERY_RESOLVES_SINGLE_WORKSPACE_CONTRACT"
];

export const POLICY_RULE_ID = /^[A-Z][A-Z0-9_]*$/;

export interface DefinedByRef {
  path: string;
  hash: string;
}

export interface PolicyRuleIdFinding {
  jsonPointer: string;
  detail: string;
}

export interface DeclaredPolicyRule {
  ruleId?: unknown;
  definedByRef?: unknown;
}

export interface DeclaredGroup {
  rules: DeclaredPolicyRule[];
  pointer: string;
}

/**
 * Validates ids a Project Profile declares against the whole shared space. Core
 * ids are reserved: a Profile rule reusing one would make the same id mean two
 * different things depending on where a reader looked it up.
 */
export function validatePolicyRuleIds(
  groups: DeclaredGroup[],
  coreIds: string[] = CORE_POLICY_RULE_IDS
): PolicyRuleIdFinding[] {
  const findings: PolicyRuleIdFinding[] = [];
  const core = new Set(coreIds);
  const seen = new Map<string, string>();

  for (const group of groups) {
    group.rules.forEach((rule, index) => {
      const at = group.pointer + "/" + String(index);
      const id = rule.ruleId;

      if (typeof id !== "string" || !POLICY_RULE_ID.test(id)) {
        findings.push({
          jsonPointer: at + "/ruleId",
          detail: "policy rule ids match [A-Z][A-Z0-9_]*"
        });
        return;
      }

      if (core.has(id)) {
        findings.push({
          jsonPointer: at + "/ruleId",
          detail: id + " is a Core rule id, and the id space is shared, so a Profile may not reuse it"
        });
      }

      const previous = seen.get(id);
      if (previous !== undefined) {
        findings.push({
          jsonPointer: at + "/ruleId",
          detail: id + " is already declared at " + previous + "; an id is unique across the whole space"
        });
      } else {
        seen.set(id, at);
      }

      if (rule.definedByRef !== undefined) {
        const ref = rule.definedByRef as Record<string, unknown> | null;
        const badPath = ref === null || typeof ref.path !== "string" || ref.path.length === 0;
        const badHash = ref === null || typeof ref.hash !== "string" || ref.hash.length === 0;
        if (badPath || badHash) {
          findings.push({
            jsonPointer: at + "/definedByRef",
            detail: "definedByRef records origin as path and hash; both are required when it is present"
          });
        }
      }
    });
  }

  return findings;
}

/**
 * Origin is read from definedByRef and never inferred from the id. Two rules
 * with unrelated ids and the same definedByRef share an origin, and a
 * suggestive prefix changes nothing about where a rule came from.
 */
export function originOf(rule: { ruleId: string; definedByRef?: DefinedByRef }): DefinedByRef | null {
  return rule.definedByRef ?? null;
}
