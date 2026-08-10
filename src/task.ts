import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { validatePattern } from "./path-policy.ts";
import type { LoadedTask, Task, ValidationResult } from "./types.ts";
import { parseYaml } from "./yaml.ts";

const TASK_STATUSES = new Set(["READY", "RUNNING", "DONE", "FAILED", "BLOCKED"]);

export async function loadTask(rootDir: string, taskId: string): Promise<LoadedTask> {
  const taskPath = await findTaskPath(rootDir, taskId);
  const raw = await readFile(taskPath, "utf8");
  const parsed = parseYaml(raw);

  if (!isRecord(parsed)) {
    throw new Error(`Task file must contain a YAML object: ${taskPath}`);
  }

  const validation = validateTask(parsed);
  if (validation.errors.length > 0) {
    throw new Error(formatValidationErrors(taskId, validation));
  }

  return {
    task: parsed as unknown as Task,
    taskPath
  };
}

export async function loadTaskForValidation(rootDir: string, taskId: string): Promise<{
  taskPath: string;
  parsed: unknown;
  validation: ValidationResult;
}> {
  const taskPath = await findTaskPath(rootDir, taskId);
  const raw = await readFile(taskPath, "utf8");
  const parsed = parseYaml(raw);
  const validation = validateTask(parsed);
  return { taskPath, parsed, validation };
}

export async function findTaskPath(rootDir: string, taskId: string): Promise<string> {
  const candidates = [
    path.join(rootDir, ".codefleet", "tasks", `${taskId}.yaml`),
    path.join(rootDir, ".codefleet", "tasks", `${taskId}.yml`)
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported extension.
    }
  }

  throw new Error(`Task file not found: .codefleet/tasks/${taskId}.yaml`);
}

export function validateTask(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return {
      errors: ["Task must be a YAML object."],
      warnings
    };
  }

  requireString(value, "id", errors);
  requireString(value, "title", errors);
  requireString(value, "projectPath", errors);
  requireString(value, "goal", errors);
  requireString(value, "status", errors);

  if (typeof value.status === "string" && !TASK_STATUSES.has(value.status)) {
    errors.push(`status must be one of: ${Array.from(TASK_STATUSES).join(", ")}.`);
  }
  if (value.status !== "READY") {
    warnings.push("Task status is not READY. The run command will still execute it.");
  }

  if (!isRecord(value.scope)) {
    errors.push("scope must be an object.");
  } else {
    requireStringArray(value.scope, "scope.include", "include", errors);
    requireStringArray(value.scope, "scope.exclude", "exclude", errors);
    requireValidPatterns(value.scope, "scope.include", "include", errors);
    requireValidPatterns(value.scope, "scope.exclude", "exclude", errors);
  }

  requireStringArray(value, "constraints", "constraints", errors);
  requireStringArray(value, "doneCriteria", "doneCriteria", errors);
  requireStringArray(value, "workflow", "workflow", errors);

  if (Array.isArray(value.workflow) && value.workflow.length === 0) {
    errors.push("workflow must contain at least one phase.");
  }

  return { errors, warnings };
}

export function formatValidationErrors(taskId: string, validation: ValidationResult): string {
  return [
    `Task validation failed for ${taskId}:`,
    ...validation.errors.map((error) => `- ${error}`),
    ...validation.warnings.map((warning) => `- warning: ${warning}`)
  ].join("\n");
}

function requireString(value: Record<string, unknown>, key: string, errors: string[]): void {
  if (typeof value[key] !== "string" || value[key].trim().length === 0) {
    errors.push(`${key} is required and must be a non-empty string.`);
  }
}

function requireStringArray(
  value: Record<string, unknown>,
  label: string,
  key: string,
  errors: string[]
): void {
  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    errors.push(`${label} is required and must be an array.`);
    return;
  }

  const invalid = candidate.find((item) => typeof item !== "string" || item.trim().length === 0);
  if (invalid !== undefined) {
    errors.push(`${label} must contain only non-empty strings.`);
  }
}

// Scope entries become allowedPaths / deniedPaths, so they must satisfy the
// fixed path matcher. Rejecting a bare directory name here is deliberate:
// matching is whole-path with no implicit subtree, so "src" would match only a
// file literally named "src" and quietly put every file under src/ out of scope.
function requireValidPatterns(
  value: Record<string, unknown>,
  label: string,
  key: string,
  errors: string[]
): void {
  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    return;
  }

  for (const item of candidate) {
    if (typeof item !== "string") {
      continue;
    }
    const problem = validatePattern(item);
    if (problem !== null) {
      errors.push(`${label} entry is invalid: ${problem.message}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
