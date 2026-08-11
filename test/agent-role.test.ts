// AgentRole and Guardrail.
//
// A role classifies; it never grants. Every test here checks one of the two
// directions that follow from that: a role may narrow (and the narrowing is
// honoured), or a role tries to widen (and it is refused).

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  computeRoleEffectiveRestrictions,
  CORE_AGENT_ROLES,
  CORE_DESTRUCTIVE_CATEGORIES,
  detectRoleRestrictionsDrift,
  meetMode,
  resolveAgentRole,
  resolveGuardrails,
  validateCustomRole
} from "../src/agent-role.ts";
import { runTask } from "../src/run.ts";
import { approveTask } from "../src/task-ledger.ts";
import { findTaskPath } from "../src/task.ts";
import { profileJson } from "./profile-fixture.ts";
import { coversRule } from "./rule-coverage.ts";

const CLASSIFICATION = "AGENT_ROLE_IS_CLASSIFICATION_NOT_PERMISSION_GRANT";
const NARROWS_ONLY = "AGENT_ROLE_DECLARES_ONLY_WHAT_IT_NARROWS";
const DIAGNOSTIC = "ROLE_EFFECTIVE_RESTRICTIONS_IS_DIAGNOSTIC_READ_MODEL";
const GUARDRAIL = "GUARDRAIL_IS_TASK_LOCAL_RESTRICTION_SOURCE";

const NO_CUSTOM = {} as Record<string, never>;

test("a Run needs exactly one concrete role, known and allowed", () => {
  for (const missing of [undefined, "", "REQUIRE_EXPLICIT"]) {
    const r = resolveAgentRole({ taskRole: missing, allowedAgentRoles: [], customRoles: NO_CUSTOM });
    assert.equal(r.role, null);
    assert.match(r.blockedReason, /no concrete agentRole/, `${String(missing)} must not resolve`);
  }

  const unknown = resolveAgentRole({ taskRole: "WIZARD", allowedAgentRoles: [], customRoles: NO_CUSTOM });
  assert.match(unknown.blockedReason, /neither a Core AgentRole nor a Project Profile custom role/);

  const forbidden = resolveAgentRole({
    taskRole: "IAC_ENGINEER",
    allowedAgentRoles: ["DOCS_WRITER"],
    customRoles: NO_CUSTOM
  });
  assert.match(forbidden.blockedReason, /not in policies\.agentRoles\.allowedAgentRoles/);

  const ok = resolveAgentRole({ taskRole: "DOCS_WRITER", allowedAgentRoles: ["DOCS_WRITER"], customRoles: NO_CUSTOM });
  assert.equal(ok.blockedReason, "");
  assert.equal(ok.source, "CORE");
  assert.equal(ok.role?.defaultMaxMode, "WORKSPACE_EDIT");

  coversRule(CLASSIFICATION, "Task Revision has exactly one concrete agentRole before Run Plan creation.");
  coversRule(CLASSIFICATION, "agentRole is a Core AgentRole or a Project Profile custom role.");
  coversRule(CLASSIFICATION, "agentRole is included in allowedAgentRoles.");
});

test("a custom role is based on exactly one Core role and may only narrow it", () => {
  const base = "BACKEND_IMPLEMENTER";
  const good = {
    baseRole: base,
    defaultMaxMode: "SUGGEST_ONLY",
    deniedCommandCategories: [...CORE_AGENT_ROLES[base].deniedCommandCategories, "DATA_DESTRUCTION"],
    roleGuidance: "narrower"
  };
  assert.deepEqual(validateCustomRole("CUSTOM", good, "/r"), []);

  for (const [bad, pattern] of [
    [{ ...good, baseRole: undefined }, /must name exactly one Core AgentRole/],
    [{ ...good, baseRole: "NOT_A_ROLE" }, /must name exactly one Core AgentRole/],
    [{ ...good, defaultMaxMode: "COMMAND_EXEC" }, /exceeds baseRole .* a custom role may only narrow/],
    [{ ...good, deniedCommandCategories: ["INFRA_APPLY"] }, /must be a superset of baseRole/],
    [{ ...good, deniedCommandCategories: [...good.deniedCommandCategories, "MY_OWN"] }, /not a Core destructive categoryId/]
  ] as const) {
    const found = validateCustomRole("CUSTOM", bad, "/r");
    assert.ok(found.length > 0 && found.some((f) => pattern.test(f.detail)), JSON.stringify(bad));
  }

  coversRule(CLASSIFICATION, "when agentRole is custom, the custom role is based on exactly one Core AgentRole.");
  coversRule(CLASSIFICATION, "when agentRole is custom, custom role maxMode does not exceed baseRole defaultMaxMode.");
  coversRule(NARROWS_ONLY, "a custom role deniedCommandCategories set is a superset of its baseRole set.");
  coversRule(NARROWS_ONLY, "a custom role maxMode does not exceed its baseRole defaultMaxMode.");
});

test("a role owns three fields and borrows no identifier space of its own", () => {
  for (const [id, role] of Object.entries(CORE_AGENT_ROLES)) {
    assert.deepEqual(
      Object.keys(role).sort(),
      ["defaultMaxMode", "deniedCommandCategories", "roleGuidance"].sort(),
      `${id} must own exactly the three fields`
    );
    for (const category of role.deniedCommandCategories) {
      assert.ok(
        (CORE_DESTRUCTIVE_CATEGORIES as readonly string[]).includes(category),
        `${id} references ${category}, which is not a Core destructive categoryId`
      );
    }
    // A role that cannot run commands has nothing to deny: saying it again here
    // would be a role restating what harnessMode semantics already own.
    if (role.defaultMaxMode === "SUGGEST_ONLY" || role.defaultMaxMode === "DRY_RUN") {
      assert.deepEqual(
        role.deniedCommandCategories,
        [],
        `${id} restates a restriction harnessMode already owns`
      );
    }
  }

  const extra = validateCustomRole("CUSTOM", {
    baseRole: "DOCS_WRITER",
    defaultMaxMode: "WORKSPACE_EDIT",
    deniedCommandCategories: CORE_AGENT_ROLES.DOCS_WRITER.deniedCommandCategories,
    roleGuidance: "",
    forbiddenPaths: ["prod/**"]
  }, "/r");
  assert.match(extra[0].detail, /already owned by Guardrail global rules, harnessMode semantics, or destructiveCommands/);

  coversRule(NARROWS_ONLY, "a Core AgentRole owns exactly defaultMaxMode, deniedCommandCategories, and roleGuidance.");
  coversRule(
    NARROWS_ONLY,
    "deniedCommandCategories reference destructiveCommands categoryIds and introduce no new identifier space."
  );
  coversRule(
    NARROWS_ONLY,
    "a role does not restate a restriction already owned by Guardrail global rules or harnessMode semantics."
  );
});

test("roleGuidance is prompt text and changes no policy evaluation", () => {
  const role = CORE_AGENT_ROLES.BACKEND_REFACTORER;
  const withGuidance = computeRoleEffectiveRestrictions("BACKEND_REFACTORER", role);
  const withoutGuidance = computeRoleEffectiveRestrictions("BACKEND_REFACTORER", { ...role, roleGuidance: "" });
  const withOther = computeRoleEffectiveRestrictions("BACKEND_REFACTORER", {
    ...role,
    roleGuidance: "something else entirely"
  });

  assert.deepEqual(withGuidance, withoutGuidance, "guidance text must not reach the computed restrictions");
  assert.deepEqual(withGuidance, withOther);
  assert.equal(JSON.stringify(withGuidance).includes("scope"), false, "no guidance prose leaks into the read model");

  coversRule(NARROWS_ONLY, "roleGuidance is prompt text only and is never read during policy evaluation.");
});

test("roleEffectiveRestrictions is computed, diagnostic, partial, and drift-checked", () => {
  const computed = computeRoleEffectiveRestrictions("IAC_ENGINEER", CORE_AGENT_ROLES.IAC_ENGINEER);

  assert.equal(computed.diagnosticOnly, true);
  assert.deepEqual(computed.computedFrom, [
    "Core AgentRole fields",
    "Guardrail global rules",
    "harnessMode semantics"
  ]);
  assert.ok(computed.globalRestrictions.length > 0, "the global rules are merged in, not just the role fields");

  // Partial on purpose: Task guardrails and Run options are absent, which is why
  // enforcement may not read this.
  const asText = JSON.stringify(computed);
  assert.equal(asText.includes("guardrail"), false);
  assert.equal(asText.includes("runOption"), false);

  const clean = detectRoleRestrictionsDrift(computed, "IAC_ENGINEER", CORE_AGENT_ROLES.IAC_ENGINEER);
  assert.equal(clean.drifted, false);

  const handWritten = { ...computed, deniedCommandCategories: [] };
  assert.equal(
    detectRoleRestrictionsDrift(handWritten, "IAC_ENGINEER", CORE_AGENT_ROLES.IAC_ENGINEER).drifted,
    true,
    "a hand-edited copy is READ_MODEL_DRIFT"
  );

  coversRule(DIAGNOSTIC, "roleEffectiveRestrictions is computed from role fields and global rules, never hand-written.");
  coversRule(DIAGNOSTIC, "roleEffectiveRestrictions is marked diagnosticOnly.");
  coversRule(
    DIAGNOSTIC,
    "roleEffectiveRestrictions omits Task guardrails and Run options, so it is a partial evaluation."
  );
  coversRule(DIAGNOSTIC, "a stored roleEffectiveRestrictions that differs from recomputation is READ_MODEL_DRIFT.");
});

test("guardrails must be concrete and may not exceed the resolved ceiling", () => {
  const ceiling = { roleMaxMode: "WORKSPACE_EDIT", profileMaxMode: "COMMAND_EXEC" };

  assert.equal(resolveGuardrails({ guardrails: undefined, ...ceiling }).mode, "WORKSPACE_EDIT");
  assert.equal(resolveGuardrails({ guardrails: { mode: "SUGGEST_ONLY" }, ...ceiling }).mode, "SUGGEST_ONLY");

  for (const bad of ["REQUIRE_EXPLICIT", "", "MAX", 3]) {
    const r = resolveGuardrails({ guardrails: { mode: bad }, ...ceiling });
    assert.match(r.blockedReason, /must be concrete/, `${String(bad)} must not resolve`);
  }

  // The ceiling is the meet of both, so neither the role nor the Profile can be
  // out-voted by a Task.
  const overRole = resolveGuardrails({ guardrails: { mode: "COMMAND_EXEC" }, ...ceiling });
  assert.match(overRole.blockedReason, /exceeds the resolved ceiling WORKSPACE_EDIT/);

  const overProfile = resolveGuardrails({
    guardrails: { mode: "COMMAND_EXEC" },
    roleMaxMode: "COMMAND_EXEC",
    profileMaxMode: "SUGGEST_ONLY"
  });
  assert.match(overProfile.blockedReason, /exceeds the resolved ceiling SUGGEST_ONLY/);

  assert.equal(meetMode("COMMAND_EXEC", "DRY_RUN"), "DRY_RUN");
  assert.equal(meetMode("SUGGEST_ONLY", "WORKSPACE_EDIT"), "SUGGEST_ONLY");

  coversRule(GUARDRAIL, "guardrails.mode is concrete before Run Plan creation.");
  coversRule(GUARDRAIL, "guardrails.mode does not exceed resolved role max capability.");
});

test("the role contributes an upper bound to the Run Plan, never a grant", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codefleet-role-"));
  await mkdir(path.join(root, ".codefleet", "tasks"), { recursive: true });
  await mkdir(path.join(root, ".codefleet", "runs"), { recursive: true });

  const doc = profileJson({ workspaceId: "role-test", harnessMode: "COMMAND_EXEC", agentRole: "DOCS_WRITER" }) as Record<
    string,
    unknown
  >;
  // Replacing the block loses the fixture's default, so the isolation decision
  // is restated here rather than inherited by accident.
  (doc.policies as Record<string, unknown>).harness = {
    allowDegradedCommandObservation: true,
    requireIsolationForMutation: false
  };
  await writeFile(path.join(root, ".codefleet", "config.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  await writeFile(
    path.join(root, ".codefleet", "tasks", "sample.yaml"),
    [
      "id: sample",
      "title: Sample task",
      "projectPath: .",
      "goal: Exercise role bounds",
      "scope:",
      "  include: [src/**]",
      "  exclude: []",
      "constraints: []",
      "doneCriteria: [done]",
      "workflow: [PLAN]",
      "status: READY",
      ""
    ].join("\n"),
    "utf8"
  );
  await approveTask(root, {
    taskId: "sample",
    taskPath: await findTaskPath(root, "sample"),
    actorId: "tester",
    reason: "approved for test"
  });

  const execution = await runTask(root, "sample");
  const plan = JSON.parse(await readFile(path.join(execution.runDir, "run-plan.json"), "utf8")) as Record<string, unknown>;
  const capabilities = (plan.effectivePolicy as Record<string, unknown>).capabilities as Record<string, unknown>;

  // The Profile said COMMAND_EXEC; DOCS_WRITER caps at WORKSPACE_EDIT. The meet
  // is what reaches effectivePolicy, so the role lowered the bound and the
  // Profile's higher setting did not raise it back.
  assert.equal((plan.selectedAgentRole as { roleId: string }).roleId, "DOCS_WRITER");
  assert.equal((plan.selectedAgentRole as { effectiveMode: string }).effectiveMode, "WORKSPACE_EDIT");
  assert.equal(capabilities.fileEdit, true);
  assert.equal(capabilities.commandExecution, false, "the role's cap must survive the Profile's higher mode");

  const restrictions = plan.roleEffectiveRestrictions as { diagnosticOnly: boolean; roleId: string };
  assert.equal(restrictions.diagnosticOnly, true);
  assert.equal(restrictions.roleId, "DOCS_WRITER");

  coversRule(CLASSIFICATION, "role-derived capability is only an upper bound input to effectivePolicy.");
  coversRule(DIAGNOSTIC, "enforcement always reads effectivePolicy, never roleEffectiveRestrictions.");
});
