// Trusted CodeFleet embedding facade for the Codex Single-Agent MVP.
//
// This is NOT a public CLI, permission broker, standalone agent loop, or
// alternative scheduler. It only composes existing Objective planning,
// Controller/Workflow, delivered-tree status and Codex App Server facilities.
// All model effects remain disabled unless explicitly enabled by a trusted
// embedding that supplies independent, exact approval callbacks.
import { isAbsolute, resolve } from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { execute } from '../alpha/controller.mjs';
import { approval } from '../workflow/persistence.mjs';
import { createCodexManagedHostExecution } from '../hosts/codex-managed-host-execution.mjs';
import { planWithCodexManagedThread } from '../hosts/codex-managed-planning.mjs';
import { proposeNewProjectFileset } from '../hosts/codex-bootstrap-files.mjs';
import { readDeliveredObjectiveStatus } from './objective-status.mjs';
import { prepareReviewedCodexWorkflow } from './codex-reviewed-workflow.mjs';
import { bootstrapContext, materializeTask, verifyTask } from './tasks.mjs';

const invalid = detail => { throw Error('Codex MVP trusted embedding: ' + detail); };
const exactText = input => typeof input === 'string' && input.length > 0;
const callable = input => typeof input === 'function';

export function createCodexMvpFacade(store, {
  executable, model, enableHostTurns = false,
  authorizePlanning, authorizeBootstrap, authorizeWorkflow, authorizeReviewedWorkflow,
  authorizeWorkspace, workspaceWrite = false,\n  authorizeBootstrapMaterialization, authorizeBootstrapVerification,\n  bootstrapVerifierBackend,
  verificationBackend, unknownCostBudget, repairPolicy,
  destinationDelivery, developmentPolicy, workItemPolicy,
  transport,
} = {}) {
  if (!store || !callable(store.get) || !callable(store.readArtifact) ||
      !isAbsolute(executable ?? '') || !exactText(model))
    invalid('Store, explicit executable and model required');
  if (typeof enableHostTurns !== 'boolean' || typeof workspaceWrite !== 'boolean')
    invalid('Explicit execution mode required');
  if (workspaceWrite && !callable(authorizeWorkspace))
    invalid('Host workspace write needs independent exact Local grant');
  if (destinationDelivery && (!callable(destinationDelivery.authorize) ||
      !callable(destinationDelivery.verify)))
    invalid('Destination delivery requires exact grant and independent criterion observer');
  if (verificationBackend && (!callable(verificationBackend.verify) ||
      !callable(verificationBackend.prepare) ||
      !callable(verificationBackend.cleanup)))
    invalid('Verification backend must implement actual prepare, verify and cleanup');
  const invokeTransport = transport ? { transport } : {};
  const available = () => {
    if (!enableHostTurns) invalid('Host Live disabled by trusted embedding');
  };
  const activeWorkflow = runId => {
    const current = store.get(runId);
    if (!current || current.kind !== 'workflow' || !current.contract ||
        current.contractHash !== current.contract.workflowHash ||
        !exactText(current.repo) || !exactText(current.base))
      invalid('A persisted current Workflow is required');
    approval(store, current);
    if (current.control && current.control !== 'run') invalid('Workflow is paused/cancelled');
    return current;
  };
  const callScope = run => Object.freeze({
    kind: 'CODEFLEET_MANAGED_WORKFLOW_SCOPE_V1', runId: run.id,
    revision: run.revision, workflowHash: run.contractHash,
    repo: run.repo, base: run.base, model,
    executionMode: workspaceWrite
      ? 'HOST_WORKSPACE_WRITE_UNPROTECTED' : 'HOST_READ_ONLY_PROPOSAL',
    protectedVerified: false
  });
  return Object.freeze({
    // A plan is just an untrusted structured draft. No plan is an approval or
    // completed Objective. The existing planning validator owns citations.
    async planExisting(repo, objective, { cwd, version = '0.166.0' } = {}) {
      available();
      if (!callable(authorizePlanning) || !isAbsolute(cwd ?? '') ||
          !isAbsolute(repo ?? ''))
        invalid('Exact planning grant, repository and cwd required');
      const canonical = value => process.platform === 'win32'
        ? resolve(value).toLowerCase() : resolve(value);
      if (canonical(repo) !== canonical(cwd))
        invalid('Host planning cwd must equal the approved Objective repository');
      return planWithCodexManagedThread(store, repo, objective, {
        executable, model, cwd, version, authorize: authorizePlanning, ...invokeTransport
      });
    },
    // NEW_PROJECT pre-HEAD is handled by the existing Bootstrap/Fileset
    // contracts. A proposed Fileset does not materialize or authorize files.
    // Convert only a persisted, independently reviewed validated Host planning
    // result into an unapproved Workflow. No attempts or model effects.
    async prepareReviewedExistingWorkflow(repo, sessionId) {
      if (!callable(authorizeReviewedWorkflow))
        invalid('Exact independent planning scope review required');
      return prepareReviewedCodexWorkflow(store, repo, sessionId, {
        authorizeReview:authorizeReviewedWorkflow
      });
    },
    async proposeBootstrapFiles(taskId, itemId) {
      available();
      if (!callable(authorizeBootstrap)) invalid('Exact Bootstrap planning grant required');
      return proposeNewProjectFileset(store, taskId, itemId, {
        executable, model, authorize: authorizeBootstrap, ...invokeTransport
      });
    },
    // Materialize only an existing exact-approved Fileset through the current
    // Bootstrap Controller. This is LOCAL UNPROTECTED and never a Host approval.
    async materializeApprovedBootstrap(taskId, itemId) {
      if (!callable(authorizeBootstrapMaterialization))
        invalid('Independent exact Bootstrap materialization grant required');
      const initial=bootstrapContext(store,taskId);
      if (initial.plan?.contractKind !== 'NEW_PROJECT' &&
          initial.plan?.contractKind !== 'EXISTING_LOCAL')
        invalid('Current Bootstrap task and scoped Fileset required');
      const runId=initial.current?.bootstrap?.filesets?.[itemId];
      if (!runId) invalid('No current approved Fileset for WorkItem');
      const fileSet=store.get(runId);
      const scope=Object.freeze({
        kind:'CODEFLEET_BOOTSTRAP_MATERIALIZATION_SCOPE_V1',
        taskId,itemId,runId,revision:initial.current.revision,
        workflowHash:initial.workflow.workflowHash,
        filesetHash:fileSet.contractHash,
        repo:initial.plan.probe.root,protection:'UNPROTECTED',
        goalEffect:'APPROVED_EXACT_LOCAL_FILESET'
      });
      if (await authorizeBootstrapMaterialization(scope)!==true)
        invalid('Exact Bootstrap materialization grant denied');
      const fresh=bootstrapContext(store,taskId);
      if (fresh.current.revision !== scope.revision ||
          fresh.workflow.workflowHash !== scope.workflowHash ||
          fresh.current.bootstrap?.filesets?.[itemId] !== runId ||
          store.get(runId).contractHash !== scope.filesetHash)
        invalid('Bootstrap scope changed during review');
      // materializeTask independently checks the exact workflow approval, lease,
      // pending dependencies, file hashes and destination drift before writes.
      return materializeTask(store,taskId,itemId,{freshOnly:true});
    },
    async verifyApprovedBootstrap(taskId,itemId,command) {
      if (!callable(authorizeBootstrapVerification))
        invalid('Independent exact Bootstrap verification grant required');
      // Preview is read-only and yields the hash of the executable, arguments
      // and current target bytes; it does not create a command grant.
      const preview=await verifyTask(store,taskId,itemId,command);
      if (preview?.status !== 'TRUST_REQUIRED' ||
          !preview.commandHash || !preview.fileDigests)
        invalid('Exact Local command preview unavailable');
      const scope=Object.freeze({
        kind:'CODEFLEET_BOOTSTRAP_LOCAL_CHECK_SCOPE_V1',
        taskId,itemId,commandHash:preview.commandHash,
        fileDigests:structuredClone(preview.fileDigests),
        protection:'UNPROTECTED'
      });
      if (await authorizeBootstrapVerification(scope)!==true)
        invalid('Exact Bootstrap verification grant denied');
      // verifyTask reinspects the executable/tree and rejects changed command
      // identity; its local backend records real command results.
      return verifyTask(store,taskId,itemId,command,{
        trust:preview.commandHash,acknowledgeUnisolated:true,
        ...(bootstrapVerifierBackend?{backend:bootstrapVerifierBackend}:{})
      });
    },
    async runExistingWorkflow(runId, options = {}) {
      available();
      if (!callable(authorizeWorkflow) || !verificationBackend)
        invalid('Exact Workflow grant and independent verifier required');
      if (!options || typeof options !== 'object' || Array.isArray(options) ||
          Object.keys(options).some(k => k !== 'resume') ||
          (options.resume !== undefined && typeof options.resume !== 'boolean'))
        invalid('Unrecognized Workflow execution option');
      const current = activeWorkflow(runId);
      const scope = callScope(current);
      if (await authorizeWorkflow(scope) !== true)
        invalid('Exact managed Workflow execution grant denied');
      // Re-read after potentially asynchronous human review. A caller cannot
      // promote an earlier approval across a revision or repo/base change.
      const refreshed = activeWorkflow(runId);
      if (hash(callScope(refreshed)) !== hash(scope))
        invalid('Workflow scope changed while awaiting trusted grant');
      const hostExecution = createCodexManagedHostExecution(store, {
        executable, model, enabled: true, workspaceWrite, authorizeWorkspace,
        ...invokeTransport
      });
      const dependencies = { hostExecution, verificationBackend,
        ...(unknownCostBudget ? { unknownCostBudget } : {}),
        ...(repairPolicy ? { repairPolicy } : {}),
        ...(destinationDelivery ? { destinationDelivery } : {}),
        ...(developmentPolicy ? { developmentPolicy } : {}),
        ...(workItemPolicy ? { workItemPolicy } : {})
      };
      const workflow = await execute(store, runId, dependencies,
        { resume: options.resume === true });
      const objective = await readDeliveredObjectiveStatus(store, runId);
      return { workflowId: runId, workflowState: workflow.state, objective,
        authority: 'TRUSTED_EMBEDDING_LOCAL_ONLY',
        hostLiveAcceptance: 'UNVERIFIED', protectedVerified: false };
    },
    status(workflowId) {
      // Read-only, no Host access and no new grants.
      return readDeliveredObjectiveStatus(store, workflowId);
    },
  });
}
