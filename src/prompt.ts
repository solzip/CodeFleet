import type { Task } from "./types.ts";

export function renderPrompt(task: Task): string {
  return `# CodeFleet Task: ${task.title}

## Task
- ID: ${task.id}
- Status: ${task.status}
- Target project path: ${task.projectPath}

## Goal
${task.goal}

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

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}
