// The prompt is how a contract reaches the agent that has to honour it.
//
// The model defines a Task as a contract of role, scope, guardrails, and
// verification conditions, and defines a Run as the delegation of an approved
// one. The prompt carried the scope and nothing else: the agent was told where
// it could write but not what role it was acting in, what ceiling it was under,
// or what would be run against its work afterwards. An agent cannot honour a
// contract it was not shown.
//
// Only accepted or approved Objective context is included, which is the design's
// own restriction — unapproved intent is not part of the delegation.

import type { Task } from "./types.ts";

export interface PromptContract {
  /** The resolved role id, not the one the Task requested. */
  roleId: string;
  /** Role guidance, which is instruction to the agent rather than enforcement. */
  roleGuidance: string;
  /** The effective mode after Profile, role, and Task guardrails have met. */
  effectiveMode: string;
  /** What the Harness will run itself, whatever the agent claims. */
  verificationCommands: { commandId: string; command: string[] }[];
  /** Empty when the Task is attached to no accepted Objective. */
  objectives: { objectiveId: string; title: string; kind: string; position: string }[];
}

export function renderPrompt(task: Task, contract?: PromptContract): string {
  return `# CodeFleet Task: ${task.title}

## Task
- ID: ${task.id}
- Target project path: ${task.projectPath}
${renderRole(contract)}
## Goal
${task.goal}
${renderObjectives(contract)}
## Allowed Scope
${formatList(task.scope.include)}

## Excluded Scope
${formatList(task.scope.exclude)}

## Constraints
${formatList(task.constraints)}

## Done Criteria
${formatList(task.doneCriteria)}

## Workflow
${formatList(task.workflow)}
${renderVerification(contract)}
## Operating Rules
- Do not modify files outside the allowed scope.
- Do not modify files listed in the excluded scope.
- Do not perform unrelated refactoring or formatting-only churn.
- Before editing, inspect the relevant files and understand the current structure.
- Prefer the smallest coherent change that satisfies the goal and done criteria.
- If the task is ambiguous, avoid large speculative changes and document the uncertainty.

## Expected Final Response
- Summarize the files changed and why.
- Summarize commands or tests executed and their results.
- If tests could not be executed, explain the reason.
- Call out any remaining risks or follow-up work.
`;
}

function renderRole(contract?: PromptContract): string {
  if (contract === undefined) {
    return "";
  }
  const lines = [
    "",
    "## Role and Guardrails",
    `- Acting as: ${contract.roleId}`,
    `- Effective mode: ${contract.effectiveMode}`
  ];
  if (contract.roleGuidance.trim().length > 0) {
    lines.push(`- Role guidance: ${contract.roleGuidance.trim()}`);
  }
  // Stated so the agent knows the ceiling is real rather than advisory. It is
  // enforced by the Harness either way; saying so avoids work that will be
  // refused after the fact.
  lines.push(
    "- This ceiling is enforced by the Harness, not by convention. Work that exceeds it is refused, not undone."
  );
  lines.push("");
  return lines.join("\n");
}

function renderObjectives(contract?: PromptContract): string {
  if (contract === undefined || contract.objectives.length === 0) {
    return "";
  }
  return [
    "",
    "## Objective Context",
    ...contract.objectives.map(
      (objective) =>
        `- ${objective.objectiveId} (${objective.kind}): ${objective.title} — this Task is ${objective.position}`
    ),
    ""
  ].join("\n");
}

function renderVerification(contract?: PromptContract): string {
  if (contract === undefined) {
    return "";
  }
  if (contract.verificationCommands.length === 0) {
    return [
      "",
      "## Verification",
      "- This contract declares no verification commands. Nothing will be executed against your work,",
      "  so the done criteria above are the only standard it will be judged by.",
      ""
    ].join("\n");
  }
  return [
    "",
    "## Verification",
    "The Harness runs these itself after your work, and their result is evidence rather than a claim.",
    "Reporting that they pass does not make them pass.",
    ...contract.verificationCommands.map(
      (entry) => `- ${entry.commandId}: ${entry.command.join(" ")}`
    ),
    ""
  ].join("\n");
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}
