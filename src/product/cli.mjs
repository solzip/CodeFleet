import path from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { Store } from '../alpha/store.mjs';
import { execute } from '../alpha/controller.mjs';
import { createRegistry } from '../providers/registry.mjs';
import { createClaudePlanner } from '../providers/planner.mjs';
import { createCodexAdapter } from '../providers/codex.mjs';
import { probeProvider } from '../providers/capabilities.mjs';
import { enableTasks, createTask, reviewTask, prepareTask, approveTask, rejectTask, materializeTask, verifyTask, clarifyTask, objectiveUnknownsReport, task, tasks } from './tasks.mjs';
import { readResponse } from '../hosts/cli.mjs';
import { runReport, taskReport, workflowProgress } from './report.mjs';
import { revokeDecision, reservationStatus, requireDurableOperator } from './reservations.mjs';
import { nativeLocalStep, nativeEnvironmentStep, prepareNativeLocalReview, acceptNativeLocalReview, prepareNativeFilesReview, acceptNativeFilesReview } from './native-local.mjs';
import { developmentProposalRequest, developmentProposalBatch, reviewDevelopmentResults, recordProposalDispatch } from './continuation.mjs';
import { recoverObjective } from './recovery.mjs';
import { prepareContractRevision, acceptContractRevision, revokeContractRevision } from './contract-revisions.mjs';
import { repairProposalRequest } from './repair.mjs';
import { inspectReviewedCodexPlan, inspectReviewedCodexPlanAtSource, inspectReviewedCodexWorkflow, inspectReviewedCodexWorkflowAtSource, prepareReviewedCodexWorkflow } from './codex-reviewed-workflow.mjs';
import { readDeliveredObjectiveStatus } from './objective-status.mjs';
import { isCodexMvpFacadeForStore } from './codex-mvp-facade.mjs';
import { inspectCodexPlanningStatus, inspectCodexGoalProgress } from './codex-planning-status.mjs';
import { CodexPlanningDispatchError } from '../hosts/codex-managed-planning.mjs';
import { approval as requireWorkflowApproval } from '../workflow/persistence.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';

export const help = `codefleet-alpha objective plan|run "goal" [repository]
  [--local-existing] (explicit existing Git working-tree Local contract; no Git writes)
  [--acceptance LOCAL_ONLY|PROTECTED_REQUIRED] (creation-only; default Protected required; never an execution grant)
  [--attempts 1..5] [--timeout 30..1800] [--budget 0<usd<=10] (new Task limits only; no execution permission)
codefleet-alpha objective review <task-id> --files src/a.js --tests test/a.test.js --criterion "regression passes"
  [--item "id|file,...|test,...|dependency,..."] [--parallel 1..3] [--attempts 1..5]
codefleet-alpha objective run <task-id> (prepare; never auto-approve)
codefleet-alpha objective approve <task-id> --hash <workflowHash> --actor <name>
codefleet-alpha objective run|resume <task-id> --allow-model
codefleet-alpha objective status [task-id] | report <task-or-run-id>
codefleet-alpha objective delivered-status <workflow-id> (read-only delivered-tree Objective acceptance; never starts Host or writes State)
codefleet-alpha objective workflow-progress <workflow-id> (read-only DAG/Repair progress and current delivered Objective; never grants execution)
codefleet-alpha objective codex-planning-status <planning-session-id> [--repository ABSOLUTE_PATH] (read-only Host Planning lifecycle; optional current-source check for validated results, no-replay recovery)
codefleet-alpha objective codex-goal-progress <planning-session-id> (read-only Goal→Planning→Workflow/DAG→delivered Objective and no-replay continuation)
codefleet-alpha objective review-codex-plan <planning-session-id> [--repository ABSOLUTE_PATH] (read-only pinned Contract/DAG review; optional clean Git checkout check, never grants execution)
codefleet-alpha objective review-codex-workflow <workflow-id> [--repository ABSOLUTE_PATH] (read-only Contract/DAG, approval and optional clean Git baseline check; no execution)
codefleet-alpha objective plan-codex-goal "natural-language Goal" --repository ABSOLUTE_PATH
  (trusted Host embedding only; independent read-only planning Turn grant, model usage may be billed; no Workflow approval or source writes)
codefleet-alpha objective propose-codex-bootstrap-files <task-id> <local-edit-item-id>
  (trusted Host embedding only; separately approved NEW_PROJECT Fileset proposal, no filesystem writes or execution grant)
codefleet-alpha objective advance-codex-bootstrap <task-id> [--repair-item <local-edit-item-id> | --verification-request REQUEST.json]
  (trusted Host embedding only; one persisted NEW_PROJECT step: proposal, approved materialization, selected Repair, or explicit separately approved Local verification; never auto-trusts a command)
codefleet-alpha objective propose-codex-bootstrap-repair <task-id> <local-edit-item-id> <failed-verification-item-id>
  (trusted Host embedding only; requires current dependent LOCAL_FAILED Evidence; proposes a separately approvable Repair Fileset without writes)
codefleet-alpha objective materialize-codex-bootstrap-files <task-id> <local-edit-item-id>
  (trusted Host embedding only; independently approved exact Fileset apply through the existing Bootstrap Controller; Local UNPROTECTED)
codefleet-alpha objective verify-codex-bootstrap <task-id> <local-verification-item-id> REQUEST.json
  (trusted Host embedding only; separately approved exact Local check; UNPROTECTED Evidence, never Objective COMPLETE)
codefleet-alpha objective prepare-codex-workflow <planning-session-id> --repository ABSOLUTE_PATH --hash <workflowHash> --source-hash <sourceContractHash>
  (explicitly confirm both hashes from review-codex-plan; create only a pending unapproved Workflow, never an execution or Operator grant)
codefleet-alpha objective run-codex-workflow|resume-codex-workflow <workflow-id> --hash <workflowHash>
  (authenticated embedding only; separate Workflow approval and exact Host grant; ordinary CLI remains BLOCKED)
codefleet-alpha objective run-codex-goal|resume-codex-goal <planning-session-id> --hash <workflowHash>
  (authenticated embedding only; uses the exact reviewed Goal→Workflow mapping and existing Host/Operator admission; no extra grant)
codefleet-alpha objective proposal-request <task-id> <item-id> (eligible source context only; no model call or execution approval)
codefleet-alpha objective repair-proposal-request <task-id> (settled Local failure context; no model call or approval)
codefleet-alpha objective proposal-batch <task-id> [OPTIONS.json] (maxAgents 1..3, parallelBenefit; proposal-only, no model grant)
codefleet-alpha objective proposal-start <task-id> BATCH.json (record pending Host handoff; not permission or proof of invocation)
codefleet-alpha objective proposal-results <task-id> BATCH.json RESULTS.json (validate all results, record proposal feedback; never apply or approve)
codefleet-alpha objective recover <task-id> [RECOVERY.json|BINDING.json] (compare prior checkpoint; never execute, renew or replay)
codefleet-alpha objective revision-review <task-id> PROPOSAL.json (revision, full revised draft, optional additionalAttempts 0..2 and additionalTimeSeconds 0..120; no execution)
codefleet-alpha objective revision-accept <review-ref> --trust <review-hash> --acknowledge-unisolated
codefleet-alpha objective revision-revoke <review-ref> (revoke a prepared revision review)
codefleet-alpha objective reject|pause|cancel <task-id> [--actor <name>]
codefleet-alpha objective readiness [--codex-executable native-path]
codefleet-alpha objective materialize <task-id> <item-id> (NEW_PROJECT: create an approved fileset; never overwrites, never runs git)
codefleet-alpha objective verify <task-id> <item-id> REQUEST.json [--trust <commandHash> --acknowledge-unisolated]
codefleet-alpha objective local-step <task-id> REQUEST.json [REPAIR.json] --revision <n> --request-id <unique-id> --expires <epoch-ms>
  [--trust <reviewHash> --acknowledge-unisolated]
  (without trust: review only; with exact trust: one supervised Local verification or one bounded source repair + verification;
   same-user UNPROTECTED, no independent Operator authentication, no model calls; duplicate request only reads state)
codefleet-alpha objective local-files-review <task-id> <item-id>
codefleet-alpha objective local-files-accept <review-ref> --trust <reviewHash> --acknowledge-unisolated
codefleet-alpha objective local-review <task-id> REQUEST.json [REPAIR.json]
  (generates and stores the current revision, unique request and bounded expiry; no execution)
codefleet-alpha objective local-accept <review-ref> --trust <reviewHash> --acknowledge-unisolated
  (executes only the exact prepared supervised Local review; duplicate request reads the recorded result)
codefleet-alpha objective environment-step <task-id> REQUEST.json ENVIRONMENT.json --revision <n> --request-id <unique-id> --expires <epoch-ms>
  [--trust <reviewHash> --acknowledge-unisolated]
  (same-candidate review; execution additionally requires a trusted embedding Host policy observer, never a JSON capability claim)
codefleet-alpha objective authorize-local <task-id> <item-id> REQUEST.json DECISION.json
codefleet-alpha objective verify <task-id> <item-id> REQUEST.json --decision <id> --request-id <id>
  (authorize-local and verify --decision are BLOCKED: no supported authenticated durable Operator entry point; use reservation for historical results)
codefleet-alpha objective reservation <decision-id> <request-id>
codefleet-alpha objective revoke-local <decision-id> --actor <name>
  (NEW_PROJECT local-verification: without --trust only inspects; with it runs once, records LOCAL_PASSED|LOCAL_FAILED|INCONCLUSIVE evidence; never protected VERIFIED)
codefleet-alpha objective unknowns <task-id>
codefleet-alpha objective clarify <task-id> --unknown <id> --scope "what the objective means" --actor <name> --revision <n>
  (NEW_PROJECT only: records USER_DECLARED meaning for an objective-derived unknown; never approves execution)
Planning is local by default. AI planning: --planner claude|codex --allow-model (capability checks still required).
JSON stdout. Exit 0: requested read/control action succeeded; 2: input/approval/capability/verification pending; 1: invalid request/error.
No command enables an unverified Provider or performs remote delivery.`;

function parse(values) {
  const positional = [], options = {};
  const flags = new Set(['allow-model', 'json', 'acknowledge-unisolated', 'local-existing']);
  const allowed = new Set(['repair-item', 'verification-request', 'acceptance', 'files', 'tests', 'criterion', 'item', 'parallel', 'attempts', 'timeout', 'budget', 'hash', 'actor', 'planner', 'codex-executable', 'claude-executable', 'unknown', 'scope', 'revision', 'trust', 'decision', 'request-id', 'expires', 'repository', 'source-hash']);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const key = value.slice(2);
    if (flags.has(key)) { options[key] = true; continue; }
    if (!allowed.has(key) || !values[i + 1] || values[i + 1].startsWith('--')) throw Error('Unknown option or missing value: ' + value);
    if (key !== 'item' && Object.hasOwn(options, key)) throw Error('Duplicate option: ' + value);
    if (key === 'item') (options.item ??= []).push(values[++i]); else options[key] = values[++i];
  }
  return { positional, options };
}
const list = value => value?.split(',').filter(Boolean);
const number = (value, fallback) => value === undefined ? fallback : Number(value);

function requireCodexGoalEntryArgs(args, o) {
  if (args.length !== 1 || !args[0]?.trim() ||
      Object.keys(o).length !== 1 || !path.isAbsolute(o.repository ?? ''))
    throw Error('plan-codex-goal requires one nonempty Goal and absolute --repository only; no execution/approval flags');
}

function requireCodexBootstrapEntryArgs(args, o, action = 'propose-codex-bootstrap-files') {
  if (args.length !== 2 || args.some(value => !value || value.startsWith('-')) ||
      Object.keys(o).length !== 0)
    throw Error(action + ' requires exactly one Task ID and local-edit WorkItem ID; no flags or approval options');
}

function requireCodexBootstrapAdvanceArgs(args, o) {
  const repairItem = o['repair-item'];
  const verificationRequest = o['verification-request'];
  if (args.length !== 1 || !args[0] || args[0].startsWith('-') ||
      Object.keys(o).some(key => !['repair-item', 'verification-request'].includes(key)) ||
      (repairItem !== undefined && (typeof repairItem !== 'string' ||
        !repairItem.length || repairItem.length > 128 || repairItem.startsWith('-'))) ||
      (verificationRequest !== undefined && (typeof verificationRequest !== 'string' ||
        !verificationRequest.length || verificationRequest.length > 4096 ||
        verificationRequest.startsWith('-'))) ||
      (repairItem !== undefined && verificationRequest !== undefined))
    throw Error('advance-codex-bootstrap requires one Task ID and optional --repair-item <local-edit-id> OR --verification-request REQUEST.json; no approval or execution flags');
}

function requireCodexBootstrapRepairArgs(args, o) {
  if (args.length !== 3 || args.some(value => !value || value.startsWith('-')) ||
      Object.keys(o).length !== 0)
    throw Error('propose-codex-bootstrap-repair requires Task ID, local-edit WorkItem ID and failed local-verification WorkItem ID; no flags or approval options');
}

function requireCodexBootstrapVerificationArgs(args, o) {
  if (args.length !== 3 || args.some(value => !value || value.startsWith('-')) ||
      Object.keys(o).length !== 0)
    throw Error('verify-codex-bootstrap requires Task ID, local-verification WorkItem ID and bounded REQUEST.json; no flags or approval options');
}

// Reject untrusted Local verification commands before Store creation or a
// privileged Host binding. This is a pure shape/bounds check; the existing
// Bootstrap Controller independently resolves the command, observes the tree,
// and requires an exact owner grant before running any subprocess.
function requireCodexBootstrapVerificationRequest(request) {
  const fields = ['executable', 'args', 'directory', 'timeoutMs'];
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).length !== fields.length ||
      fields.some(key => !Object.hasOwn(request, key)) ||
      typeof request.executable !== 'string' || !path.isAbsolute(request.executable) ||
      request.executable.length > 4096 ||
      request.executable.includes('\0') ||
      /\.(cmd|bat|ps1)$/i.test(request.executable) ||
      typeof request.directory !== 'string' || !path.isAbsolute(request.directory) ||
      request.directory.length > 4096 || !request.directory.trim() ||
      request.directory.includes('\0') ||
      !Array.isArray(request.args) || request.args.length > 100 ||
      request.args.some(arg => typeof arg !== 'string' || arg.length > 8000 ||
        arg.includes('\0') || arg.includes('\\0')) ||
      !Number.isSafeInteger(request.timeoutMs) ||
      request.timeoutMs < 1 || request.timeoutMs > 120000)
    throw Error('verify-codex-bootstrap REQUEST.json requires exact bounded Local command fields');
  return request;
}

function requireCodexGoalExecutionArgs(args, o) {
  if (args.length !== 1 || !/^[a-f0-9-]{36}$/i.test(args[0] ?? '') ||
      Object.keys(o).length !== 1 || !/^[a-f0-9]{64}$/.test(o.hash ?? ''))
    throw Error('Codex Goal execution requires one Planning session ID and exact --hash only');
}

function requireCodexWorkflowEntryArgs(args, o) {
  if (args.length !== 1 || !args[0] || args[0].startsWith('-') ||
      Object.keys(o).length !== 1 || !/^[a-f0-9]{64}$/.test(o.hash ?? ''))
    throw Error('Codex Workflow execution requires one Workflow ID and exact --hash only');
}

function requireDurableEntry(argv) {
  if (argv[0] === 'authorize-local' || argv[0] === 'verify' && argv.slice(1).some(v =>
    v === '--decision' || v.startsWith('--decision=') || v === '--request-id' || v.startsWith('--request-id='))) {
    requireDurableOperator();
  }
}

// Dependency injection is a trusted test/embedding seam, not a CLI/plugin flag.
export async function dispatchProduct(argv, { store, execution = {}, plannerRegistry } = {}) {
  requireDurableEntry(argv);
  const [action, ...rest] = argv;
  if (!action || ['help', '--help'].includes(action)) return { exitCode: 0, data: { schemaVersion: 1, help } };
  const { positional: args, options: o } = parse(rest);
  if (o.repository !== undefined && !['plan-codex-goal', 'codex-planning-status', 'review-codex-plan', 'review-codex-workflow', 'prepare-codex-workflow'].includes(action))
    throw Error('--repository is only valid for Codex planning/Workflow review or pending Workflow creation');
  if (action === 'plan-codex-goal') {
    requireCodexGoalEntryArgs(args, o);
    const binding = execution?.codexAdmission;
    if (!isCodexMvpFacadeForStore(binding?.facade, store))
      throw Error('TRUSTED_CODEX_PLANNING_UNAVAILABLE: trusted Store-bound Host planning facade required');
    // A genuine facade independently requires its trusted read-only planning
    // grant before any billable Turn. This command cannot supply a grant from
    // flags or a Goal string, nor does it approve/promote the resulting DAG.
    try {
      const data = await binding.facade.planExisting(o.repository, args[0], { cwd: o.repository });
      return { exitCode: data.status === 'VALIDATED' ? 0 : 2,
        data: { ...data, hostLiveAcceptance: 'UNVERIFIED' } };
    } catch (error) {
      // Only a genuinely reserved Host Turn can supply a bound session ID.
      // Do not manufacture a replayable request, approval or status from a
      // generic transport error, missing Store record or untrusted CLI flag.
      if (!(error instanceof CodexPlanningDispatchError)) throw error;
      const progress = inspectCodexPlanningStatus(store, error.sessionId);
      return { exitCode: 1, data: {
        schemaVersion:1, status:'CODEX_PLANNING_TURN_BLOCKED',
        sessionId:error.sessionId, error:error.message,
        progress, continuation:progress.continuation,
        costStatus:'UNKNOWN', automaticReplay:false,
        executionGranted:false, executionSucceeded:false,
        approved:false, hostLiveAcceptance:'UNVERIFIED',
        protectedVerified:false
      } };
    }
  }
  if (action === 'propose-codex-bootstrap-files') {
    requireCodexBootstrapEntryArgs(args, o);
    const binding = execution?.codexAdmission;
    if (!isCodexMvpFacadeForStore(binding?.facade, store))
      throw Error('TRUSTED_CODEX_BOOTSTRAP_UNAVAILABLE: trusted Store-bound Host Fileset facade required');
    // This proposes a NEW_PROJECT Fileset only. The existing Bootstrap
    // Controller still requires a separate exact owner materialization grant.
    const data = await binding.facade.proposeBootstrapFiles(args[0], args[1]);
    return { exitCode: data.approvalRequest ? 0 : 2,
      data: { ...data, hostLiveAcceptance: 'UNVERIFIED' } };
  }
  if (action === 'propose-codex-bootstrap-repair') {
    requireCodexBootstrapRepairArgs(args, o);
    const binding = execution?.codexAdmission;
    if (!isCodexMvpFacadeForStore(binding?.facade, store))
      throw Error('TRUSTED_CODEX_BOOTSTRAP_REPAIR_UNAVAILABLE: trusted Store-bound failure-Evidence Repair facade required');
    // Reuse the existing failure-Evidence-bound Host repair proposal path.
    // Neither the Host response nor this CLI command approves or applies files.
    const data = await binding.facade.proposeBootstrapRepairFiles(...args);
    return { exitCode: data.approvalRequest ? 0 : 2,
      data: { ...data, hostLiveAcceptance: 'UNVERIFIED' } };
  }
  if (action === 'materialize-codex-bootstrap-files') {
    requireCodexBootstrapEntryArgs(args, o, action);
    const binding = execution?.codexAdmission;
    if (!isCodexMvpFacadeForStore(binding?.facade, store))
      throw Error('TRUSTED_CODEX_BOOTSTRAP_MATERIALIZATION_UNAVAILABLE: trusted Store-bound exact Fileset authority required');
    // A Host proposal is never write authority. The genuine facade requires
    // a separate exact owner review and delegates all file effects to the
    // existing approved Bootstrap Controller, with Local UNPROTECTED evidence.
    const data = await binding.facade.materializeApprovedBootstrap(args[0], args[1]);
    return { exitCode: data.status === 'MATERIALIZED' ? 0 : 2,
      data: { ...data, protection: 'UNPROTECTED', hostLiveAcceptance: 'UNVERIFIED' } };
  }
  if (action === 'verify-codex-bootstrap') {
    requireCodexBootstrapVerificationArgs(args, o);
    const binding = execution?.codexAdmission;
    if (!isCodexMvpFacadeForStore(binding?.facade, store))
      throw Error('TRUSTED_CODEX_BOOTSTRAP_VERIFICATION_UNAVAILABLE: trusted Store-bound exact Local verification authority required');
    // The REQUEST.json is not a grant. The genuine facade re-previews the
    // current repository, requests independent exact Local approval, and then
    // delegates execution and Evidence recording to the Bootstrap Controller.
    // productCli parses bounded untrusted JSON before invoking the privileged
    // Host factory. Reuse that exact snapshot, not a second filesystem read.
    // Direct trusted dispatch still reads and bounds its own request file.
    const request = requireCodexBootstrapVerificationRequest(
      execution.boundedBootstrapVerificationRequest === undefined
        ? await readResponse(args[2]) : execution.boundedBootstrapVerificationRequest);
    const data = await binding.facade.verifyApprovedBootstrap(args[0], args[1], request);
    return { exitCode: data.status === 'LOCAL_PASSED' ? 0 : 2,
      data: { ...data, protection: 'UNPROTECTED', hostLiveAcceptance: 'UNVERIFIED' } };
  }
  if (action === 'advance-codex-bootstrap') {
    requireCodexBootstrapAdvanceArgs(args, o);
    const binding = execution?.codexAdmission;
    if (!isCodexMvpFacadeForStore(binding?.facade, store))
      throw Error('TRUSTED_CODEX_BOOTSTRAP_CONTINUATION_UNAVAILABLE: trusted Store-bound Host facade required');
    // Persisted TaskReport already reconciles ready DAG items, approvals,
    // failed Evidence, drift and uncertain effects. One invocation delegates
    // at most ONE step; it is never a new scheduler or an approval grant.
    const before = await taskReport(store, args[0]);
    if (before.contractKind !== 'NEW_PROJECT' || !before.bootstrap)
      throw Error('Codex Bootstrap continuation requires a prepared NEW_PROJECT Workflow');
    const continuation = before.continuation;
    const next = continuation?.next;
    const repairItem = o['repair-item'] ?? null;
    const verificationRequest = o['verification-request'] ?? null;
    if (verificationRequest && (continuation?.status !== 'AWAIT_LOCAL_TRUST' ||
        next?.kind !== 'RUN_LOCAL_VERIFICATION'))
      throw Error('Bootstrap Local verification request requires current ready verification WorkItem; failed or inconclusive commands are never replayed');
    if (repairItem && (continuation?.status !== 'AWAIT_REPAIR_SELECTION' ||
        next?.kind !== 'REPAIR_REQUIRED' ||
        !next?.failedEvidenceRef ||
        !next?.repairCandidates?.includes(repairItem)))
      throw Error('Bootstrap Repair selection must match a current failed-Evidence local-edit predecessor');
    const step = continuation.status === 'HOST_PROPOSAL_REQUIRED' &&
      next?.kind === 'PROPOSE_FILESET' ? 'PROPOSE_FILESET' :
      continuation.status === 'AWAIT_OPERATOR' &&
      next?.kind === 'MATERIALIZE' ? 'MATERIALIZE' :
      continuation.status === 'AWAIT_REPAIR_SELECTION' &&
      next?.kind === 'REPAIR_REQUIRED' && repairItem ? 'PROPOSE_REPAIR_FILESET' :
      continuation.status === 'AWAIT_LOCAL_TRUST' &&
      next?.kind === 'RUN_LOCAL_VERIFICATION' && verificationRequest
        ? 'RUN_LOCAL_VERIFICATION' : null;
    if (!step || !next?.itemId)
      return { exitCode: 2, data: {
        schemaVersion: 1, status: 'HUMAN_HANDOFF',
        continuation, executionGranted: false,
        protectedVerified: false, hostLiveAcceptance: 'UNVERIFIED'
      } };
    // Recheck the persisted task before entering the approved Controller/Host
    // path. The delegated facade performs its own exact per-step freshness,
    // independent owner-grant, fileset and repository checks.
    const current = task(store, args[0]);
    if (current.revision !== before.revision ||
        current.bootstrap?.workflowHash !== before.workflowHash)
      throw Error('Bootstrap continuation changed before delegated step');
    let result;
    try {
      result = step === 'PROPOSE_FILESET'
        ? await binding.facade.proposeBootstrapFiles(args[0], next.itemId)
        : step === 'PROPOSE_REPAIR_FILESET'
          ? await binding.facade.proposeBootstrapRepairFiles(args[0], repairItem, next.itemId)
          : step === 'RUN_LOCAL_VERIFICATION'
            ? await binding.facade.verifyApprovedBootstrap(args[0], next.itemId,
                requireCodexBootstrapVerificationRequest(
                  execution.boundedBootstrapVerificationRequest === undefined
                    ? await readResponse(verificationRequest)
                    : execution.boundedBootstrapVerificationRequest))
            : await binding.facade.materializeApprovedBootstrap(args[0], next.itemId);
    } catch (error) {
      // Return the persisted handoff on denied grants or delegated errors.
      // This is read-only and never permits replay of an uncertain effect.
      const progress = await taskReport(store, args[0]).catch(() => null);
      if (!progress) throw error;
      return { exitCode: 1, data: {
        schemaVersion: 1, status: 'CODEX_BOOTSTRAP_STEP_BLOCKED',
        taskId: args[0], step, itemId: repairItem ?? next.itemId,
        error: error instanceof Error ? error.message : String(error),
        progress, continuation: progress.continuation,
        localComplete: progress.acceptance?.complete === true,
        objectiveComplete: false, executionSucceeded: false,
        executionGranted: false, protectedVerified: false,
        hostLiveAcceptance: 'UNVERIFIED'
      } };
    }
    const after = await taskReport(store, args[0]);
    return { exitCode: ['PROPOSE_FILESET', 'PROPOSE_REPAIR_FILESET'].includes(step)
        ? result.approvalRequest ? 0 : 2
        : step === 'RUN_LOCAL_VERIFICATION'
          ? result.status === 'LOCAL_PASSED' ? 0 : 2
          : result.status === 'MATERIALIZED' ? 0 : 2,
      data: {
        schemaVersion: 1, status: result.status ?? 'STEP_RECORDED',
        step, itemId: repairItem ?? next.itemId,
        ...(step === 'PROPOSE_REPAIR_FILESET' ? { verificationItem: next.itemId } : {}),
        result, continuation: after.continuation,
        ...(step === 'RUN_LOCAL_VERIFICATION' ? { protection: 'UNPROTECTED' } : {}),
        protectedVerified: false, hostLiveAcceptance: 'UNVERIFIED'
      } };
  }
  if (action === 'codex-goal-progress') {
    if (args.length !== 1 || !args[0] || args[0].startsWith('-') ||
        Object.keys(o).length !== 0)
      throw Error('codex-goal-progress requires exactly one Planning session ID and no execution/approval options');
    const data = await inspectCodexGoalProgress(store,args[0]);
    return { exitCode:data.objectiveComplete === true ? 0 : 2, data };
  }
  if (action === 'codex-planning-status') {
    if (args.length !== 1 || !args[0] || args[0].startsWith('-') ||
        Object.keys(o).some(key => key !== 'repository') ||
        (o.repository !== undefined && !path.isAbsolute(o.repository)))
      throw Error('codex-planning-status requires one Planning session ID and optional absolute --repository only; no execution/approval options');
    const data = inspectCodexPlanningStatus(store, args[0]);
    // Persisted VALIDATED is not a promise that this checkout is still the
    // reviewed repository. Reuse the existing strict read-only source observer;
    // no new approval, Store mutation or Host invocation is introduced.
    if (o.repository && data.status === 'SUBMITTED' && data.validationStatus === 'VALIDATED') {
      const review = await inspectReviewedCodexPlanAtSource(store, args[0], o.repository);
      if (review.status !== 'REVIEW_REQUIRED')
        return { exitCode:2, data: {
          ...data, sourceFreshness:'STALE_OR_MISMATCHED', sourceReview:'BLOCKED',
          reason:'Current repository differs from the persisted validated Planning source; review or replan before preparing a Workflow',
          continuation:{kind:'REVIEW_SOURCE_OR_REPLAN',automaticReplay:false,executionGranted:false}
        } };
      return { exitCode:0, data: {
        ...data, sourceFreshness:'PINNED_CLEAN_AT_REVIEW', sourceReview:'REVIEW_REQUIRED'
      } };
    }
    return { exitCode:['BLOCKED','NOT_FOUND','UNAVAILABLE'].includes(data.status) ? 2 : 0, data };
  }
  if (action === 'review-codex-plan') {
    if (args.length !== 1 || Object.keys(o).some(k => k !== 'repository') || !args[0] || args[0].startsWith('-'))
      throw Error('review-codex-plan requires one Host Planning session ID and optional --repository only');
    const data = o.repository
      ? await inspectReviewedCodexPlanAtSource(store, args[0], o.repository)
      : inspectReviewedCodexPlan(store, args[0]);
    return { exitCode: data.status === 'REVIEW_REQUIRED' ? 0 : 2, data };
  }
  if (action === 'review-codex-workflow') {
    if (args.length !== 1 || !args[0] || args[0].startsWith('-') ||
        Object.keys(o).some(k => k !== 'repository'))
      throw Error('review-codex-workflow requires exactly one Workflow ID and optional --repository only; no approval/execution options');
    const data = o.repository
      ? await inspectReviewedCodexWorkflowAtSource(store,args[0],o.repository)
      : inspectReviewedCodexWorkflow(store,args[0]);
    return { exitCode:data.status === 'REVIEW_REQUIRED' ? 0 : 2, data };
  }
  if (action === 'prepare-codex-workflow') {
    // Explicit Local contract confirmation is NOT an authenticated Operator
    // execution grant. This only persists a pending Workflow; the existing
    // Workflow approval and separate trusted managed-Host admission still apply.
    if (args.length !== 1 || !args[0] || args[0].startsWith('-') ||
        Object.keys(o).some(k => !['repository', 'hash', 'source-hash'].includes(k)) ||
        !path.isAbsolute(o.repository ?? '') ||
        !/^[a-f0-9]{64}$/.test(o.hash ?? '') ||
        !/^[a-f0-9]{64}$/.test(o['source-hash'] ?? ''))
      throw Error('prepare-codex-workflow requires one session ID, absolute --repository, exact --hash and --source-hash from planning review; no execution options');
    const data = await prepareReviewedCodexWorkflow(store, o.repository, args[0], {
      authorizeReview: async scope =>
        scope.workflowHash === o.hash && scope.sourceContractHash === o['source-hash']
    });
    return { exitCode: 0, data: { ...data,
      reviewAuthority: 'EXPLICIT_LOCAL_HASH_CONFIRMATION_ONLY',
      hostLiveAcceptance: 'UNVERIFIED',
      nextAction: 'Separate Workflow approval and trusted managed-Host execution grant required'
    } };
  }
  if (action === 'run-codex-goal' || action === 'resume-codex-goal') {
    requireCodexGoalExecutionArgs(args, o);
    // Resolve only the deterministic, independently reviewed Planning → DAG
    // provenance. A supplied Goal ID cannot select an arbitrary Workflow.
    // Delegate to the exact existing authenticated Workflow execution entry,
    // which enforces current Operator approval, source freshness, budget,
    // Lease, Host grant and cancellation without a second execution engine.
    const progress = await inspectCodexGoalProgress(store, args[0]);
    if (!['WORKFLOW_IN_PROGRESS','OBJECTIVE_COMPLETE'].includes(progress.status) ||
        progress.workflowId !== 'planning-'+args[0] ||
        progress.workflow?.workflowHash !== o.hash)
      throw Error('Codex Goal requires a current reviewed Workflow and exact hash; inspect codex-goal-progress');
    if (progress.objectiveComplete) {
      return { exitCode:0, data: {
        ...progress, executionSucceeded:false, executionGranted:false,
        nextAction:'Delivered Objective already complete; no Host Turn started'
      } };
    }
    return dispatchProduct([
      action === 'resume-codex-goal' ? 'resume-codex-workflow' : 'run-codex-workflow',
      progress.workflowId, '--hash', o.hash
    ], {store,execution,plannerRegistry});
  }
  if (action === 'run-codex-workflow' || action === 'resume-codex-workflow') {
    // Only an authenticated Host embedding can provide this dependency.
    // Never accept an Operator identity, callback or approval from CLI JSON.
    requireCodexWorkflowEntryArgs(args, o);
    const admission = execution?.codexAdmission;
    if (!admission || typeof admission.authorizeOperator !== 'function' ||
        !isCodexMvpFacadeForStore(admission.facade, store))
      throw Error('AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE: trusted Host Operator binding required');
    const runId = args[0], run = store.get(runId);
    if (!run || run.kind !== 'workflow' || run.contractHash !== o.hash ||
        !Number.isInteger(run.revision))
      throw Error('Codex Workflow execution requires an exact current Workflow hash');
    const fingerprint = value => hash({
      id:value.id, revision:value.revision, workflowHash:value.contractHash,
      sourceRef:value.sourceRef, graphRef:value.graphRef, repo:value.repo,
      base:value.base, state:value.state, control:value.control ?? null
    });
    // Operator authorization is for the exact, *currently approved* Workflow.
    // The graph hash alone is not enough: an actor/expiry change can replace the
    // Workflow grant while an asynchronous authenticated review is outstanding.
    const approvalFingerprint = value => {
      requireWorkflowApproval(store, value);
      if (value.authorizationMode === 'OS_OPERATOR_V1')
        return hash({ mode: 'OS_OPERATOR_V1', taskId: value.taskId ?? null,
          operatorAuthorization: value.operatorAuthorization ?? null });
      const row = store.db.prepare(
        'SELECT digest,actor,expires FROM workflow_approvals WHERE runId=? AND revision=?'
      ).get(value.id, value.revision);
      if (!row || row.digest !== value.contractHash || !Number.isFinite(row.expires) ||
          row.expires <= Date.now())
        throw Error('Current Codex Workflow approval record required');
      return hash({ mode: 'WORKFLOW_APPROVAL_V1', digest: row.digest,
        actor: row.actor ?? null, expires: row.expires });
    };
    // The authenticated Operator must review the actual, validated source
    // contract and DAG, not only opaque references. Reject tampered Store
    // records before consuming an external authentication/approval decision.
    const inspectContract = value => {
      try {
        const source = store.readArtifact(value.sourceRef);
        if (!value.contract || value.contract.workflowHash !== value.contractHash ||
            hash(value.contract) !== value.graphRef ||
            hash(source) !== value.sourceRef)
          throw Error('Workflow artifact binding mismatch');
        validateWorkflow(value.contract, source);
        return { source, graph: value.contract };
      } catch {
        throw Error('Codex Workflow Contract/DAG or source artifact invalid');
      }
    };
    // The Codex-specific entry is only for Workflows promoted from a
    // persisted VALIDATED Host Planning session. A valid arbitrary Workflow
    // with a matching graph hash is not a reviewed Codex plan.
    const planningReview = inspectReviewedCodexWorkflow(store, runId);
    if (planningReview.status !== 'REVIEW_REQUIRED' ||
        planningReview.workflowHash !== run.contractHash ||
        planningReview.sourceContractHash !== run.sourceRef ||
        planningReview.revision !== run.revision)
      throw Error('Codex Workflow originating Planning/Contract/DAG provenance invalid');
    // Inspect the actual checked-out source before consuming an authenticated
    // Operator decision. A valid persisted Planning/DAG hash does not prove
    // that the current repository is still the approved clean Git baseline.
    const requireCurrentCodexSource = async phase => {
      const observed = await inspectReviewedCodexWorkflowAtSource(store,runId,run.repo);
      if (observed.status !== 'REVIEW_REQUIRED' ||
          observed.sourceFreshness !== 'PINNED_CLEAN_AT_REVIEW' ||
          observed.workflowHash !== run.contractHash ||
          observed.sourceBaseline !== run.base ||
          observed.repositoryId !== planningReview.repositoryId ||
          observed.revision !== run.revision)
        throw Error('Codex Workflow source changed ' + phase + ' authenticated admission');
    };
    await requireCurrentCodexSource('before');
    const planningReviewHash = hash(planningReview);
    const inspected = inspectContract(run);
    const inspectedHash = hash(inspected);
    const freezeCopy = value => {
      if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
      if (value && typeof value === 'object')
        return Object.freeze(Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, freezeCopy(entry)])
        ));
      return value;
    };
    const pinned = fingerprint(run);
    const pinnedApproval = approvalFingerprint(run);
    const authorizeOperator = admission.authorizeOperator;
    const managedFacade = admission.facade;
    const scope = Object.freeze({
      kind:'CODEFLEET_AUTHENTICATED_CODEX_ENTRY_V1',
      workflowId:runId, revision:run.revision, workflowHash:run.contractHash,
      sourceRef:run.sourceRef, graphRef:run.graphRef, repo:run.repo,
      base:run.base, resume:action === 'resume-codex-workflow',
      workflowApprovalHash:pinnedApproval,
      planningSessionId:runId.slice('planning-'.length),
      planningReviewHash, protectedVerified:false,
      // Detached and deeply immutable: the reviewer can inspect every
      // WorkItem dependency, acceptance criterion and source/budget limit.
      // This is review context, not a substitute for Operator identity.
      sourceContract:freezeCopy(inspected.source),
      workflowContract:freezeCopy(inspected.graph)
    });
    if (await Reflect.apply(authorizeOperator, admission, [scope]) !== true)
      throw Error('Authenticated Codex Operator admission denied');
    const refreshed = store.get(runId);
    if (execution.codexAdmission !== admission ||
        admission.authorizeOperator !== authorizeOperator ||
        admission.facade !== managedFacade || !refreshed ||
        fingerprint(refreshed) !== pinned)
      throw Error('Codex Workflow scope changed during authenticated admission');
    if (approvalFingerprint(refreshed) !== pinnedApproval)
      throw Error('Codex Workflow approval changed during authenticated admission');
    const currentPlanningReview = inspectReviewedCodexWorkflow(store, runId);
    if (currentPlanningReview.status !== 'REVIEW_REQUIRED' ||
        hash(currentPlanningReview) !== planningReviewHash)
      throw Error('Codex Workflow originating Planning provenance changed during authenticated admission');
    if (hash(inspectContract(refreshed)) !== inspectedHash)
      throw Error('Codex Workflow Contract/DAG changed during authenticated admission');
    // Repeat the live repository check after the potentially asynchronous
    // identity decision and before the managed Controller/Host grant.
    // This is a pre-dispatch freshness fence, not atomic OS confinement.
    await requireCurrentCodexSource('during');
    // The existing facade independently verifies current Workflow approval,
    // exact DAG, Host executable, budget, Lease and Host grant before dispatch.
    // An authenticated Operator may need the persisted continuation even
    // when the managed Controller or Host refuses/fails a dispatch. This is
    // read-only reporting, not a fresh authorization or automatic replay.
    let data;
    try {
      data = await managedFacade.runExistingWorkflow(runId, { resume:scope.resume });
    } catch (error) {
      // If the Store itself cannot be inspected, preserve the original error
      // rather than fabricating a safe-to-resume or completed Workflow.
      const progress = await workflowProgress(store, runId).catch(() => null);
      if (!progress) throw error;
      return { exitCode:1, data: {
        schemaVersion:1, status:'CODEX_WORKFLOW_EXECUTION_BLOCKED',
        workflowId:runId, error:error instanceof Error ? error.message : String(error),
        progress, continuation:progress.continuation,
        objectiveComplete:progress.objectiveComplete,
        executionSucceeded:false, executionGranted:false,
        hostLiveAcceptance:'UNVERIFIED', protectedVerified:false
      } };
    }
    return { exitCode:data.objective?.objectiveComplete === true ? 0 : 2, data };
  }
  if (action === 'workflow-progress') {
    if (args.length !== 1 || Object.keys(o).length || !args[0] || args[0].startsWith('-'))
      throw Error('workflow-progress requires exactly one Workflow ID and no execution options');
    const data = await workflowProgress(store, args[0]);
    return { exitCode: data.objectiveComplete === true ? 0 : 2, data };
  }
  if (action === 'delivered-status') {
    if (args.length !== 1 || Object.keys(o).length || !args[0] || args[0].startsWith('-'))
      throw Error('delivered-status requires exactly one Workflow ID and no execution options');
    const data = await readDeliveredObjectiveStatus(store, args[0]);
    return { exitCode: data.objectiveComplete === true ? 0 : 2, data };
  }
  if (action === 'proposal-start') {
    if (args.length !== 2 || Object.keys(o).length) throw Error('proposal-start requires Task and exact batch');
    return { exitCode: 0, data: await recordProposalDispatch(store, args[0], await readResponse(args[1])) };
  }
  if (action === 'proposal-batch') {
    if (args.length < 1 || args.length > 2 || Object.keys(o).length) throw Error('proposal-batch requires Task and optional options file');
    return { exitCode: 0, data: await developmentProposalBatch(store, args[0], args[1] ? await readResponse(args[1]) : {}) };
  }
  if (action === 'proposal-results') {
    if (args.length !== 3 || Object.keys(o).length) throw Error('proposal-results requires Task, exact batch and results');
    const data = await reviewDevelopmentResults(store, args[0], await readResponse(args[1]), await readResponse(args[2]));
    const resultRef = store.artifact(data);
    if (!store.events(args[0]).some(e => e.type === 'HOST_PROPOSALS_REVIEWED' && e.body.resultRef === resultRef))
      store.event(args[0], 'HOST_PROPOSALS_REVIEWED', { resultRef, batchHash: data.batchHash,
        authority: 'PROVIDER_REPORTED_ONLY', executionGranted: false });
    return { exitCode: 0, data: { ...data, resultRef } };
  }
  if(o['local-existing'] && action!=='plan') throw Error('--local-existing is plan-only');
  if (o.acceptance !== undefined && !(action === 'plan' || action === 'run' && !args[0]?.startsWith('task-'))) throw Error('Acceptance mode is creation-only; existing contracts cannot be downgraded');
  if (action === 'readiness') {
    if (args.length) throw Error('readiness accepts no arguments');
    const providers = await Promise.all(['claude', 'codex'].map(id => probeProvider(id, o[id + '-executable'] ? { executable: o[id + '-executable'] } : {})));
    return { exitCode: 2, data: { schemaVersion: 1, readiness: 'BLOCKED_OR_UNSUPPORTED', providers, liveCalls: 'NOT_RUN', reason: 'Version/help do not prove enforcement; no automatic live certification' } };
  }
  if (action === 'recover') {
    if (args.length < 1 || args.length > 2 || Object.keys(o).length) throw Error('recover accepts Task ID and optional prior recovery report/checkpoint/binding only; no execution flags');
    const data = await recoverObjective(store, args[0], args[1] ? await readResponse(args[1]) : undefined);
    return { exitCode: data.status === 'RECOVERED' ? 0 : 2, data };
  }
  if (action === 'repair-proposal-request') {
    if (args.length !== 1 || Object.keys(o).length) throw Error('repair-proposal-request accepts only a Task ID');
    return { exitCode: 0, data: await repairProposalRequest(store,args[0]) };
  }
  enableTasks(store);
  if (action === 'revision-review') {
    if(args.length!==2||Object.keys(o).length)throw Error('revision-review requires Task and proposal only');
    return {exitCode:2,data:await prepareContractRevision(store,args[0],await readResponse(args[1]))};
  }
  if (action === 'revision-accept') {
    if(args.length!==1||Object.keys(o).some(k=>!['trust','acknowledge-unisolated'].includes(k)))throw Error('Exact revision review options required');
    const applied=await acceptContractRevision(store,args[0],{trust:o.trust,acknowledgeUnisolated:o['acknowledge-unisolated']===true});
    return {exitCode:0,data:{...applied,recovery:await recoverObjective(store,applied.taskId)}};
  }
  if (action === 'revision-revoke') {
    if(args.length!==1||Object.keys(o).length)throw Error('revision-revoke requires one review reference');
    return {exitCode:0,data:revokeContractRevision(store,args[0])};
  }
  if(action==='local-files-review') {
    if(args.length!==2||Object.keys(o).length)throw Error('local-files-review requires Task and WorkItem');
    return {exitCode:2,data:await prepareNativeFilesReview(store,...args)};
  }
  if(action==='local-files-accept') {
    if(args.length!==1||Object.keys(o).some(k=>!['trust','acknowledge-unisolated'].includes(k)))throw Error('Exact Fileset review reference and trust required');
    let interrupted=false;const stop=()=>{interrupted=true;};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    try {
      const data=await acceptNativeFilesReview(store,args[0],{trust:o.trust,acknowledgeUnisolated:o['acknowledge-unisolated']===true,cancelled:()=>interrupted});
      return {exitCode:data.status==='MATERIALIZED'||data.status==='RECORDED_NO_REPLAY'?0:2,data};
    }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
  }
  if(action==='local-review') {
    if(args.length<2||args.length>3||Object.keys(o).length)throw Error('local-review accepts Task, command file and optional repair only');
    const data=await prepareNativeLocalReview(store,args[0],{request:await readResponse(args[1]),proposal:args[2]?await readResponse(args[2]):null});
    return {exitCode:2,data};
  }
  if(action==='local-accept') {
    if(args.length!==1||Object.keys(o).some(k=>!['trust','acknowledge-unisolated'].includes(k)))throw Error('local-accept requires exact prepared review reference and explicit trust');
    let interrupted=false;const stop=()=>{interrupted=true;};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    try {
      const data=await acceptNativeLocalReview(store,args[0],{trust:o.trust,acknowledgeUnisolated:o['acknowledge-unisolated']===true,cancelled:()=>interrupted});
      return {exitCode:data.execution?.status==='LOCAL_PASSED'?0:2,data};
    }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
  }
  if (action === 'proposal-request') {
    if (args.length !== 2 || Object.keys(o).length) throw Error('proposal-request accepts only Task and WorkItem IDs; no execution flags');
    return { exitCode: 0, data: await developmentProposalRequest(store, args[0], args[1]) };
  }
  if (action === 'local-step') {
    if (args.length<2||args.length>3||Object.keys(o).some(k=>!['revision','request-id','expires','trust','acknowledge-unisolated'].includes(k))) throw Error('local-step accepts only exact Local review options');
    let interrupted=false;const stop=()=>{interrupted=true;};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    try {
      const data=await nativeLocalStep(store,args[0],{request:await readResponse(args[1]),proposal:args[2]?await readResponse(args[2]):undefined,
        revision:Number(o.revision),requestId:o['request-id'],expiresAt:Number(o.expires),trust:o.trust,acknowledgeUnisolated:o['acknowledge-unisolated']===true,cancelled:()=>interrupted});
      return {exitCode:data.execution?.status==='LOCAL_PASSED'?0:2,data};
    } finally {process.off('SIGINT',stop);process.off('SIGTERM',stop);}
  }
  if (action === 'environment-step') {
    if(args.length!==3||Object.keys(o).some(k=>!['revision','request-id','expires','trust','acknowledge-unisolated'].includes(k)))
      throw Error('environment-step accepts only exact environment review options');
    let interrupted=false;const stop=()=>{interrupted=true;};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    try {
      const data=await nativeEnvironmentStep(store,args[0],{request:await readResponse(args[1]),environment:await readResponse(args[2]),
        revision:Number(o.revision),requestId:o['request-id'],expiresAt:Number(o.expires),trust:o.trust,
        acknowledgeUnisolated:o['acknowledge-unisolated']===true,cancelled:()=>interrupted},execution.environmentRecovery);
      return {exitCode:data.execution?.status==='LOCAL_PASSED'?0:2,data};
    } finally {process.off('SIGINT',stop);process.off('SIGTERM',stop);}
  }
  if (action === 'reservation') {
    if (args.length !== 2) throw Error('reservation requires decision and request IDs');
    return { exitCode: 0, data: reservationStatus(store, args[0], args[1]) };
  }
  if (action === 'revoke-local') {
    if (args.length !== 1) throw Error('revoke-local requires decision ID');
    return { exitCode: 0, data: revokeDecision(store, args[0], o.actor) };
  }
  let id = args[0];
  const report = async () => ({ exitCode: 0, data: await taskReport(store, id) });
  if (action === 'plan' || (action === 'run' && !id?.startsWith('task-'))) {
    if (!id || args.length > 2) throw Error('Quoted objective and optional repository required');
    const registry = o.planner ? plannerRegistry ?? createRegistry([createClaudePlanner(), createCodexAdapter()]) : undefined;
    const created = await createTask(store, path.resolve(args[1] ?? '.'), id, { registry, requested: o.planner, allowLive: o['allow-model'] === true, localExisting:o['local-existing']===true,
      acceptanceMode: o.acceptance, maxAttempts: number(o.attempts,1), timeoutSeconds: number(o.timeout,300), attemptBudgetUsd: number(o.budget,1) });
    id = created.id;
    const result = await report(); result.exitCode = created.state === 'VALIDATED' ? 0 : 2; return result;
  }
  if (action === 'status' && !id) return { exitCode: 0, data: { schemaVersion: 1, tasks: await Promise.all(tasks(store).map(t => taskReport(store, t.id))) } };
  if (action === 'materialize') {
    if (args.length !== 2) throw Error('materialize requires task id and WorkItem id');
    const result = await materializeTask(store, args[0], args[1], { freshOnly: true });
    return { exitCode: result.status === 'MATERIALIZED' ? 0 : 2, data: { ...await taskReport(store, args[0]), materialization: result } };
  }
  if (action === 'verify') {
    if (args.length !== 3) throw Error('verify requires task id, WorkItem id and REQUEST.json');
    if ((o.trust === undefined) !== (o['acknowledge-unisolated'] !== true)) throw Error('--trust and --acknowledge-unisolated must be given together');
    if ((o.decision === undefined) !== (o['request-id'] === undefined) || (o.decision !== undefined && o.trust !== undefined)) throw Error('Durable execution requires decision/request IDs separately from legacy trust');
    let interrupted = false; const stop = () => { interrupted = true; };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try {
      const request = await readResponse(args[2]);
      const result = await verifyTask(store, args[0], args[1], request, { trust: o.trust, acknowledgeUnisolated: o['acknowledge-unisolated'] === true, cancelled: () => interrupted });
      return { exitCode: result.status === 'LOCAL_PASSED' ? 0 : 2, data: { ...await taskReport(store, args[0]), verificationRun: result } };
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  }
  if (args.length !== 1) throw Error('Exactly one task or run id required');
  if (action === 'report' && !id.startsWith('task-')) return { exitCode: 0, data: await runReport(store, id) };
  if (['status', 'report'].includes(action)) {
    // A generated workflow id starts with task- too; prefer an exact task row.
    if (action === 'report' && !store.db.prepare('SELECT 1 FROM product_tasks WHERE id=?').get(id)) return { exitCode: 0, data: await runReport(store, id) };
    return report();
  }
  if (action === 'review') {
    const items = o.item?.map(value => {
      const fields = value.split('|'); if (fields.length !== 4) throw Error('item requires id|files|tests|dependencies');
      return { id: fields[0], files: list(fields[1]), tests: list(fields[2]), dependencies: list(fields[3]), priority: 0, acceptanceCriteria: [o.criterion] };
    });
    await reviewTask(store, id, { files: list(o.files), tests: list(o.tests), criterion: o.criterion, items, maxParallel: number(o.parallel, 1), maxAttempts: number(o.attempts, 1), timeoutSeconds: number(o.timeout, 300), attemptBudgetUsd: number(o.budget, 1) });
    return report();
  }
  if (action === 'unknowns') return { exitCode: 0, data: objectiveUnknownsReport(store, id) };
  if (action === 'clarify') {
    const updated = await clarifyTask(store, id, { unknownId: o.unknown, actor: o.actor, scope: o.scope, revision: number(o.revision, undefined) });
    return { exitCode: updated.state === 'VALIDATED' ? 0 : 2, data: { ...await taskReport(store, id), clarification: objectiveUnknownsReport(store, id) } };
  }
  if (action === 'approve') { approveTask(store, id, { actor: o.actor, workflowHash: o.hash, expiresAt: Date.now() + 3600000 }); return report(); }
  if (action === 'reject') { rejectTask(store, id, o.actor); return report(); }
  if (['pause', 'cancel'].includes(action)) {
    const current = task(store, id); if (!current.runId) throw Error('No workflow yet; reject the task instead');
    store.control(current.runId, action); return report();
  }
  if (['run', 'resume'].includes(action)) {
    let current;
    try { current = await prepareTask(store, id); }
    catch (e) { if (['NEEDS_INPUT', 'CAPABILITY_GAP'].includes(e.message)) return { exitCode: 2, data: { ...await taskReport(store, id), blocked: e.message } }; throw e; }
    if (current.bootstrap) return { exitCode: 2, data: { ...await taskReport(store, id), blocked: 'NEW_PROJECT has no executable Run; approved filesets are created only by materialize' } };
    const run = store.get(current.runId);
    if (!o['allow-model'] || run.state === 'WAITING_APPROVAL') return { exitCode: 2, data: { ...await taskReport(store, id), blocked: run.state === 'WAITING_APPROVAL' ? 'Explicit hash-bound approval required' : 'Explicit --allow-model consent required' } };
    const stop = () => store.control(current.runId, 'cancel');
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    try { await execute(store, current.runId, execution, { resume: action === 'resume' }); }
    finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
    const result = await report(); result.exitCode = result.data.run.complete ? 0 : 2; return result;
  }
  throw Error('Unknown objective command: ' + action);
}

// The ordinary CLI never supplies this dependency. A trusted Host embedding
// may provide a factory that binds a genuine managed-Host facade to the *same*
// Store opened for this command. Planning and NEW_PROJECT Fileset proposals
// require separate bounded Host grants; Workflow execution additionally
// requires authenticated Operator admission.
export async function productCli(argv, directory, { createCodexAdmission } = {}) {
  let store;
  try {
    requireDurableEntry(argv); // Before opening Store or reading caller JSON.
    const codexExecution = ['run-codex-workflow','resume-codex-workflow',
      'run-codex-goal','resume-codex-goal'].includes(argv[0]);
    const codexPlanning = argv[0] === 'plan-codex-goal';
    const codexBootstrap = ['propose-codex-bootstrap-files','propose-codex-bootstrap-repair','materialize-codex-bootstrap-files','verify-codex-bootstrap','advance-codex-bootstrap'].includes(argv[0]);
    const codexTrusted = codexExecution || codexPlanning || codexBootstrap;
    let boundedBootstrapVerificationRequest;
    if (codexTrusted) {
      if (typeof createCodexAdmission !== 'function')
        throw Error(codexPlanning
          ? 'TRUSTED_CODEX_PLANNING_UNAVAILABLE: plain CLI has no trusted Host planning binding'
          : codexBootstrap
            ? argv[0] === 'materialize-codex-bootstrap-files'
              ? 'TRUSTED_CODEX_BOOTSTRAP_MATERIALIZATION_UNAVAILABLE: plain CLI has no trusted Fileset materialization binding'
              : argv[0] === 'advance-codex-bootstrap'
                ? 'TRUSTED_CODEX_BOOTSTRAP_CONTINUATION_UNAVAILABLE: plain CLI has no trusted continuation binding'
              : argv[0] === 'verify-codex-bootstrap'
                ? 'TRUSTED_CODEX_BOOTSTRAP_VERIFICATION_UNAVAILABLE: plain CLI has no trusted Local verification binding'
                : argv[0] === 'propose-codex-bootstrap-repair'
                  ? 'TRUSTED_CODEX_BOOTSTRAP_REPAIR_UNAVAILABLE: plain CLI has no trusted Host Repair binding'
                  : 'TRUSTED_CODEX_BOOTSTRAP_UNAVAILABLE: plain CLI has no trusted Host Fileset proposal binding'
            : 'AUTHENTICATED_CODEX_ADMISSION_UNAVAILABLE: plain CLI has no authenticated Host Operator binding');
      // Reject untrusted CLI flags before calling the privileged Host factory.
      const { positional, options } = parse(argv.slice(1));
      if (codexPlanning) requireCodexGoalEntryArgs(positional, options);
      else if (codexBootstrap) {
        if (argv[0] === 'advance-codex-bootstrap')
          requireCodexBootstrapAdvanceArgs(positional, options);
        else if (argv[0] === 'verify-codex-bootstrap')
          requireCodexBootstrapVerificationArgs(positional, options);
        else if (argv[0] === 'propose-codex-bootstrap-repair')
          requireCodexBootstrapRepairArgs(positional, options);
        else requireCodexBootstrapEntryArgs(positional, options, argv[0]);
      }
      else if (['run-codex-goal','resume-codex-goal'].includes(argv[0]))
        requireCodexGoalExecutionArgs(positional, options);
      else requireCodexWorkflowEntryArgs(positional, options);
      // Malformed/oversized caller JSON is rejected before opening Store or
      // creating an authenticated Host binding; parse it only once.
      if (argv[0] === 'verify-codex-bootstrap' ||
          (argv[0] === 'advance-codex-bootstrap' && options['verification-request']))
        boundedBootstrapVerificationRequest = requireCodexBootstrapVerificationRequest(
          await readResponse(argv[0] === 'verify-codex-bootstrap'
            ? positional[2] : options['verification-request']));
    }
    if (!argv[0] || ['help', '--help'].includes(argv[0])) return await dispatchProduct(argv);
    store = new Store(directory, { readOnly: ['recover', 'proposal-batch', 'repair-proposal-request', 'delivered-status', 'workflow-progress', 'codex-planning-status', 'codex-goal-progress', 'review-codex-plan', 'review-codex-workflow'].includes(argv[0]) });
    if (codexTrusted) {
      const codexAdmission = await createCodexAdmission(store);
      // dispatchProduct still checks authentic facade identity, current Store
      // binding, exact source/Workflow approval and Operator authorization.
      return await dispatchProduct(argv, { store, execution: {
        codexAdmission, boundedBootstrapVerificationRequest
      } });
    }
    return await dispatchProduct(argv, { store });
  }
  catch (e) { return { exitCode: 1, data: { schemaVersion: 1, status: 'BLOCKED_OR_UNSUPPORTED', error: e.message } }; }
  finally { store?.close(); }
}
