// Translate a completed managed Workflow into a Goal-level CLI result only
// after reobserving the persisted delivered Objective. The workflow result
// remains diagnostic evidence, not a substitute for the Goal verdict.
export function presentCodexGoalExecution(delegated, sessionId, goalProgress) {
  const observedComplete = goalProgress?.status === 'OBJECTIVE_COMPLETE' &&
    goalProgress.objectiveComplete === true &&
    goalProgress.workflowId === delegated.data?.workflowId &&
    goalProgress.workflow?.workflowHash === delegated.data?.progress?.workflowHash;
  if (delegated.exitCode === 0 && !observedComplete) {
    return { exitCode: 2, data: {
      schemaVersion: 1, status: 'CODEX_GOAL_COMPLETION_UNVERIFIED',
      planningSessionId: sessionId, workflowId: delegated.data?.workflowId ?? null,
      goalProgress, goalProgressStatus: goalProgress ? 'OBSERVED' : 'UNAVAILABLE',
      workflowExecution: delegated.data, objectiveComplete: false,
      automaticReplay: false, hostLiveAcceptance: 'UNVERIFIED',
      protectedVerified: false,
      nextAction: 'Inspect codex-goal-progress and delivered-status against the persisted destination; do not replay an uncertain effect'
    } };
  }
  return { ...delegated, data: {
    ...delegated.data, planningSessionId: sessionId,
    goalProgress, goalProgressStatus: goalProgress ? 'OBSERVED' : 'UNAVAILABLE'
  } };
}
