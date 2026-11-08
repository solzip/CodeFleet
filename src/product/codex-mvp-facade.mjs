// Trusted CodeFleet embedding facade for the Codex Single-Agent MVP.
//
// This is NOT a public CLI, permission broker, standalone agent loop, or
// alternative scheduler. It only composes existing Objective planning,
// Controller/Workflow, delivered-tree status and Codex App Server facilities.
// All model effects remain disabled unless explicitly enabled by a trusted
// embedding that supplies independent, exact approval callbacks.
import { isAbsolute, resolve } from 'node:path';
import { snapshotHostExecutable, requireSameHostExecutable } from '../hosts/host-executable-identity.mjs';
import { hash } from '../alpha/contract.mjs';
import { execute } from '../alpha/controller.mjs';
import { approval } from '../workflow/persistence.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';
import { createCodexManagedHostExecution } from '../hosts/codex-managed-host-execution.mjs';
import { planWithCodexManagedThread } from '../hosts/codex-managed-planning.mjs';
import { proposeNewProjectFileset } from '../hosts/codex-bootstrap-files.mjs';
import { readDeliveredObjectiveStatus } from './objective-status.mjs';
import { requireTrustedObjectiveCriteria } from './objective-judge.mjs';
import { prepareReviewedCodexWorkflow } from './codex-reviewed-workflow.mjs';
import { bootstrapContext, materializeTask, verifyTask } from './tasks.mjs';

// Object identity prevents an untrusted adapter shaped like the facade from
// being passed as an authenticated execution transport. This is not Operator
// authentication; the trusted embedding must independently perform it.
// Keep the Store capability private. A genuine facade for another Store
// must not execute a different Workflow after Operator review on this Store.
const facades = new WeakMap();
export const isCodexMvpFacade = value => value !== null &&
  typeof value === 'object' && facades.has(value);
export const isCodexMvpFacadeForStore = (value, store) =>
  isCodexMvpFacade(value) && facades.get(value) === store;
const invalid = detail => { throw Error('Codex MVP trusted embedding: ' + detail); };
const exactText = input => typeof input === 'string' && input.length > 0;
const callable = input => typeof input === 'function';
// A coordinator WorkItem policy restricts dispatch. Never pass the embedding's
// mutable policy object directly into a post-approval Controller execution.
const frozenPolicyCopy = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('WorkItem policy must be an exact object');
  const freeze = object => {
    if (object && typeof object === 'object') {
      Object.values(object).forEach(freeze);
      Object.freeze(object);
    }
    return object;
  };
  return freeze(structuredClone(value));
};

export function createCodexMvpFacade(store, {
  executable, model, enableHostTurns = false,
  authorizePlanning, authorizeBootstrap, authorizeWorkflow, authorizeReviewedWorkflow,
  authorizeWorkspace, workspaceWrite = false,
  authorizeBootstrapMaterialization, authorizeBootstrapVerification,
  bootstrapVerifierBackend,
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
  if (bootstrapVerifierBackend && (!callable(bootstrapVerifierBackend.authorize) ||
      !callable(bootstrapVerifierBackend.verify)))
    invalid('Bootstrap Local verifier must implement authorize and verify');
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
    // A mutable run row can retain an old workflowHash while its DAG, scope
    // or source pointer changes. Validate the actual pinned artifacts before
    // asking for an execution grant; approval of a digest alone is insufficient.
    let source;
    try {
      source = store.readArtifact(current.sourceRef);
      if (hash(source) !== current.sourceRef ||
          hash(current.contract) !== current.graphRef)
        invalid('Workflow artifact reference mismatch');
      validateWorkflow(current.contract, source);
    } catch {
      invalid('Persisted Workflow Contract/DAG or source artifact invalid');
    }
    approval(store, current);
    if (current.control && current.control !== 'run') invalid('Workflow is paused/cancelled');
    return { run: current, source };
  };
  // A trusted execution grant is not transferable to a replacement approval.
  // The Workflow hash may be identical while the approving actor or expiry
  // changes. Re-observe the authority row on both sides of async review.
  const approvalSnapshotHash = run => {
    if (run.authorizationMode === 'OS_OPERATOR_V1')
      return hash({ mode:'OS_OPERATOR_V1', taskId:run.taskId ?? null,
        operatorAuthorization:run.operatorAuthorization ?? null });
    const row = store.db.prepare(
      'SELECT digest,actor,expires FROM workflow_approvals WHERE runId=? AND revision=?'
    ).get(run.id,run.revision);
    if (!row || row.digest !== run.contractHash ||
        !Number.isFinite(row.expires) || row.expires <= Date.now())
      invalid('Current Workflow approval record required');
    return hash({ mode:'WORKFLOW_APPROVAL_V1', digest:row.digest,
      actor:row.actor ?? null, expires:row.expires });
  };
  const pinnedHostExecutable = () => snapshotHostExecutable(executable);
  const callScope = ({ run, source }, resume, executableIdentity, reviewedPolicy) => Object.freeze({
    kind: 'CODEFLEET_MANAGED_WORKFLOW_SCOPE_V1', runId: run.id,
    revision: run.revision, workflowHash: run.contractHash,
    graphRef: run.graphRef, sourceRef: run.sourceRef,
    repo: run.repo, base: run.base, model,
    executablePath: executable, executableResolvedPath: executableIdentity.resolvedPath,
    executableSha256: executableIdentity.sha256,
    resume,
    approvalSnapshotHash: approvalSnapshotHash(run),
    // An additional policy may restrict every WorkItem. Expose its actual
    // immutable rules, not just a hash, before asking the owner for a grant.
    workItemPolicy: reviewedPolicy,
    // Independent execution review must see the real bounded contract, not
    // only an opaque graph hash. Everything nested is a frozen copy; reviewer
    // code cannot rewrite the DAG or broaden the file/command budget.
    objective: source.goal,
    files: Object.freeze([...source.files]),
    tests: Object.freeze([...source.tests]),
    contextFiles: Object.freeze([...source.context]),
    deliveryMode: source.delivery.mode,
    // Independent Workflow admission must show the actual mandatory delivered
    // Objective checks, not only a source-level delivery mode. The Controller
    // will separately require an exact pre-effect owner delivery grant.
    destinationCriteria: destinationDelivery
      ? Object.freeze(requireTrustedObjectiveCriteria(destinationDelivery.approvedCriteria)
          .map(criterion => Object.freeze(criterion))) : null,
    executionLimits: Object.freeze({
      maxAttempts: source.maxAttempts,
      timeoutSeconds: source.timeoutSeconds,
      attemptBudgetUsd: source.attemptBudgetUsd
    }),
    requiredCapabilities: Object.freeze([...run.contract.requiredCapabilities]),
    finalAcceptanceCriteria: Object.freeze([...run.contract.acceptanceCriteria]),
    workItems: Object.freeze(run.contract.items.map(item => Object.freeze({
      id: item.id, priority: item.priority,
      dependencies: Object.freeze([...item.dependencies]),
      files: Object.freeze([...item.files]),
      tests: Object.freeze([...item.tests]),
      acceptanceCriteria: Object.freeze([...item.acceptanceCriteria]),
      ...(item.roles ? {roles: Object.freeze({...item.roles})} : {}),
      ...(item.resources ? {resources: Object.freeze([...item.resources])} : {})
    }))),
    // Subscription usage has no reliable USD amount. The execution reviewer
    // must see whether a separate exact owner cost grant is available.
    unknownUsageAuthorization: callable(unknownCostBudget?.authorize)
      ? 'EXACT_OWNER_GRANT_REQUIRED' : 'BLOCKED_WITHOUT_OWNER_GRANT',
    // A general Workflow grant must disclose whether failed WorkItems can
    // incur further Host Turns and the maximum immutable generation count.
    // The separate failure-Evidence-bound Repair authorization is still required.
    repair: Object.freeze({
      authorization: callable(repairPolicy?.authorize)
        ? 'EXACT_FAILURE_GRANT_REQUIRED' : 'DISABLED',
      storageEnabled: repairPolicy?.enableStorage === true,
      maxGenerations: repairPolicy ? (repairPolicy.maxGenerations ?? 2) : null
    }),
    executionMode: workspaceWrite
      ? 'HOST_WORKSPACE_WRITE_UNPROTECTED' : 'HOST_READ_ONLY_PROPOSAL',
    protectedVerified: false
  });
  const facade = Object.freeze({
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
    // A failed Local check can drive another Host proposal, not automatic writes
    // or inherited approval to repair the Candidate or rerun verification.
    async proposeBootstrapRepairFiles(taskId, itemId, verificationItem) {
      available();
      if (!callable(authorizeBootstrap)) invalid('Exact Bootstrap Repair planning grant required');
      return proposeNewProjectFileset(store, taskId, itemId, {
        executable, model, authorize: authorizeBootstrap,
        repair:{verificationItem}, ...invokeTransport
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
      // A hash alone is not an inspectable authorization scope. Show the
      // owner the *actual* bytes to be created or repaired before any local
      // effect, and validate them against the already-approved Fileset.
      let content;
      try { content=store.readArtifact(fileSet.contentRef); }
      catch { invalid('Approved Bootstrap Fileset content unavailable'); }
      if (!content?.manifest || !Array.isArray(content.files) ||
          hash(fileSet.contract) !== fileSet.contractHash ||
          hash(content.manifest) !== fileSet.contractHash ||
          content.files.length !== fileSet.contract.files.length ||
          content.files.some((entry,index) =>
            entry.path !== fileSet.contract.files[index].path ||
            hash(entry.content) !== fileSet.contract.files[index].sha256))
        invalid('Approved Bootstrap Fileset content integrity mismatch');
      const reviewedFiles=Object.freeze(content.files.map(entry=>Object.freeze({...entry})));
      const reviewedFilesHash=hash(reviewedFiles);
      const scope=Object.freeze({
        kind:'CODEFLEET_BOOTSTRAP_MATERIALIZATION_SCOPE_V1',
        taskId,itemId,runId,revision:initial.current.revision,
        workflowHash:initial.workflow.workflowHash,
        // A source Plan artifact and its repository are part of the exact
        // owner-reviewed destination, even when the Workflow hash is unchanged.
        planRef:initial.current.planRef,
        filesetHash:fileSet.contractHash,contentRef:fileSet.contentRef,
        operation:fileSet.operation ?? 'create',files:reviewedFiles,
        repo:initial.plan.probe.root,protection:'UNPROTECTED',
        goalEffect:'APPROVED_EXACT_LOCAL_FILESET'
      });
      if (await authorizeBootstrapMaterialization(scope)!==true)
        invalid('Exact Bootstrap materialization grant denied');
      const fresh=bootstrapContext(store,taskId);
      if (fresh.current.revision !== scope.revision ||
          fresh.workflow.workflowHash !== scope.workflowHash ||
          fresh.current.planRef !== scope.planRef ||
          fresh.plan.probe.root !== scope.repo ||
          fresh.current.bootstrap?.filesets?.[itemId] !== runId)
        invalid('Bootstrap scope changed during review');
      const latestFileset=store.get(runId);
      if (latestFileset.contractHash !== scope.filesetHash ||
          latestFileset.contentRef !== scope.contentRef ||
          (latestFileset.operation ?? 'create') !== scope.operation)
        invalid('Bootstrap scope changed during review');
      let latestContent;
      try { latestContent=store.readArtifact(latestFileset.contentRef); }
      catch { invalid('Bootstrap Fileset content changed during review'); }
      if (!latestContent?.manifest ||
          hash(latestContent.manifest) !== scope.filesetHash ||
          hash(latestContent.files) !== reviewedFilesHash)
        invalid('Bootstrap Fileset content changed during review');
      // materializeTask independently checks the exact workflow approval, lease,
      // pending dependencies, file hashes and destination drift before writes.
      return materializeTask(store,taskId,itemId,{freshOnly:true});
    },
    async verifyApprovedBootstrap(taskId,itemId,command) {
      if (!callable(authorizeBootstrapVerification))
        invalid('Independent exact Bootstrap verification grant required');
      // Pin the Local verifier methods before awaiting command/tree preview
      // and independent owner review. An embedding cannot replace a verifier
      // after the owner inspected the exact Local verification scope.
      const verifierMethods=bootstrapVerifierBackend ? Object.freeze({
        authorize:bootstrapVerifierBackend.authorize,
        verify:bootstrapVerifierBackend.verify
      }) : null;
      // Bind the independent approval to the current immutable task revision
      // and Workflow, not merely to reusable command bytes.
      const initial=bootstrapContext(store,taskId);
      // Preview is read-only and yields the hash of the executable, arguments
      // and current target bytes; it does not create a command grant.
      const preview=await verifyTask(store,taskId,itemId,command);
      if (preview?.status !== 'TRUST_REQUIRED' ||
          !preview.commandHash || !preview.fileDigests ||
          !Array.isArray(preview.command?.args) ||
          preview.command.commandHash !== preview.commandHash)
        invalid('Exact Local command preview unavailable');
      // Owner review must see the executable, argv, cwd, timeout and observed
      // tree, not just opaque hashes. Freeze the nested argv before passing
      // it across the asynchronous independent approval boundary.
      const reviewedCommand=Object.freeze({
        ...structuredClone(preview.command),
        args:Object.freeze([...preview.command.args])
      });
      const scope=Object.freeze({
        kind:'CODEFLEET_BOOTSTRAP_LOCAL_CHECK_SCOPE_V1',
        taskId,itemId,revision:initial.current.revision,
        workflowHash:initial.workflow.workflowHash,
        planRef:initial.current.planRef,
        workflowRef:initial.current.bootstrap.workflowRef,
        repo:initial.plan.probe.root,commandHash:preview.commandHash,
        command:reviewedCommand,
        fileDigests:Object.freeze(structuredClone(preview.fileDigests)),
        protection:'UNPROTECTED'
      });
      if (await authorizeBootstrapVerification(scope)!==true)
        invalid('Exact Bootstrap verification grant denied');
      // The owner grant may take time. A new task revision (even with the same
      // command bytes), changed Workflow, or mutable command/tree input needs
      // another review. Do not reserve an execution or consume its grant.
      const fresh=bootstrapContext(store,taskId);
      if (fresh.current.revision !== scope.revision ||
          fresh.current.planRef !== scope.planRef ||
          fresh.current.bootstrap.workflowRef !== scope.workflowRef ||
          fresh.workflow.workflowHash !== scope.workflowHash ||
          fresh.plan.probe.root !== scope.repo)
        invalid('Bootstrap verification scope changed during review');
      const currentPreview=await verifyTask(store,taskId,itemId,command);
      if (currentPreview?.status !== 'TRUST_REQUIRED' ||
          currentPreview.commandHash !== scope.commandHash ||
          hash(currentPreview.command) !== hash(scope.command) ||
          hash(currentPreview.fileDigests) !== hash(scope.fileDigests))
        invalid('Bootstrap verification command/tree changed during review');
      if (verifierMethods && Object.entries(verifierMethods).some(
        ([name,method]) => bootstrapVerifierBackend[name] !== method))
        invalid('Bootstrap Local verifier changed during owner review');
      const pinnedBackend=verifierMethods ? Object.freeze({
        authorize:(...args) => Reflect.apply(verifierMethods.authorize,bootstrapVerifierBackend,args),
        verify:(...args) => Reflect.apply(verifierMethods.verify,bootstrapVerifierBackend,args)
      }) : null;
      // The second preview checks the caller's latest command. Dispatch must
      // nevertheless use a detached, immutable copy of the owner's reviewed
      // canonical command: the original input may change while the Local
      // backend is asynchronously authorizing execution.
      const reviewedRequest=Object.freeze({
        executable:scope.command.executable,
        args:Object.freeze([...scope.command.args]),
        directory:scope.command.directory,
        timeoutMs:scope.command.timeoutMs
      });
      // verifyTask still independently rechecks the executable, snapshot,
      // exact trust hash and Local backend before recording any Evidence.
      return verifyTask(store,taskId,itemId,reviewedRequest,{
        trust:preview.commandHash,acknowledgeUnisolated:true,
        ...(pinnedBackend?{backend:pinnedBackend}:{})
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
      // Recovery intent changes dispatch semantics and must be approved exactly.
      const resume = options.resume === true;
      const pinnedExecutable = await pinnedHostExecutable();
      const current = activeWorkflow(runId);
      // Pin the actual trusted verifier methods before the asynchronous
      // execution grant; a replaced method requires a new owner review.
      const verifierMethods = Object.freeze({
        prepare: verificationBackend.prepare,
        verify: verificationBackend.verify,
        cleanup: verificationBackend.cleanup
      });
      // Delivery approval and independent delivered-tree observation must not
      // be replaced while the Workflow owner is reviewing Host admission.
      const destinationMethods = destinationDelivery ? Object.freeze({
        authorize: destinationDelivery.authorize,
        verify: destinationDelivery.verify
      }) : null;
      // The independent unknown-subscription-usage gate is a separate owner
      // authorization. A mutable embedding must not replace that callback
      // while the main managed-Host execution grant is under review.
      const unknownCostAuthorize = unknownCostBudget?.authorize;
      // Repair is an additional billable execution decision, not a property
      // that an embedding may expand while the owner reviews the Workflow.
      if (repairPolicy && (typeof repairPolicy !== 'object' ||
          (repairPolicy.authorize !== undefined && !callable(repairPolicy.authorize)) ||
          (repairPolicy.enableStorage !== undefined &&
            typeof repairPolicy.enableStorage !== 'boolean') ||
          (repairPolicy.maxGenerations !== undefined &&
            (!Number.isSafeInteger(repairPolicy.maxGenerations) ||
              repairPolicy.maxGenerations < 2 || repairPolicy.maxGenerations > 5))))
        invalid('Repair policy must have bounded generations and an exact grant');
      const pinnedRepair = repairPolicy ? Object.freeze({
        authorize: repairPolicy.authorize,
        enableStorage: repairPolicy.enableStorage === true,
        maxGenerations: repairPolicy.maxGenerations ?? 2
      }) : null;
      const pinnedWorkItemPolicy = workItemPolicy == null
        ? null : frozenPolicyCopy(workItemPolicy);
      const pinnedWorkItemPolicyHash = hash(pinnedWorkItemPolicy);
      const scope = callScope(current, resume, pinnedExecutable, pinnedWorkItemPolicy);
      if (await authorizeWorkflow(scope) !== true)
        invalid('Exact managed Workflow execution grant denied');
      // Re-read after potentially asynchronous human review. A caller cannot
      // promote an earlier approval across a revision or repo/base change.
      const refreshed = activeWorkflow(runId);
      // A shared options object may change while the owner reviews the grant.
      // Never dispatch with a different recovery mode or newly injected options.
      if (Object.keys(options).some(k => k !== 'resume') ||
          (options.resume !== undefined && typeof options.resume !== 'boolean') ||
          (options.resume === true) !== resume)
        invalid('Workflow execution options changed while awaiting trusted grant');
      // The Host binary is reviewed by the same owner as the Contract/DAG.
      // Reject a repointed executable alias before any billable dispatch.
      await requireSameHostExecutable(executable, pinnedExecutable,
        'Host executable changed while awaiting trusted grant');
      if (hash(workItemPolicy ?? null) !== pinnedWorkItemPolicyHash)
        invalid('WorkItem policy changed while awaiting trusted grant');
      if (hash(callScope(refreshed, resume, pinnedExecutable, pinnedWorkItemPolicy)) !== hash(scope))
        invalid('Workflow scope changed while awaiting trusted grant');
      if (Object.entries(verifierMethods).some(([name, method]) =>
        verificationBackend[name] !== method))
        invalid('Independent Workflow verifier changed while awaiting trusted grant');
      if (destinationMethods && Object.entries(destinationMethods).some(([name, method]) =>
        destinationDelivery[name] !== method))
        invalid('Destination delivery authority changed while awaiting trusted grant');
      if (unknownCostBudget?.authorize !== unknownCostAuthorize)
        invalid('Unknown-cost budget authority changed while awaiting trusted grant');
      if (pinnedRepair && (repairPolicy.authorize !== pinnedRepair.authorize ||
          (repairPolicy.enableStorage === true) !== pinnedRepair.enableStorage ||
          (repairPolicy.maxGenerations ?? 2) !== pinnedRepair.maxGenerations))
        invalid('Repair policy changed while awaiting trusted grant');
      // Bind Controller to the reviewed methods while preserving the backend's
      // original receiver. This is not independent backend attestation.
      const pinnedVerifier = Object.freeze(Object.fromEntries(
        Object.entries(verifierMethods).map(([name, method]) => [
          name, (...args) => Reflect.apply(method, verificationBackend, args)
        ])
      ));
      const hostExecution = createCodexManagedHostExecution(store, {
        executable, model, enabled: true, workspaceWrite, authorizeWorkspace,
        approvedExecutable: pinnedExecutable,
        ...invokeTransport
      });
      const dependencies = { hostExecution, verificationBackend: pinnedVerifier,
        // Pass only the originally reviewed callable. In particular, a later
        // method-slot replacement cannot turn a denied unknown-cost grant into
        // authorization for another billable WorkItem.
        ...(callable(unknownCostAuthorize) ? { unknownCostBudget: Object.freeze({
          authorize: (...args) => Reflect.apply(unknownCostAuthorize, unknownCostBudget, args)
        }) } : {}),
        ...(pinnedRepair ? { repairPolicy: Object.freeze({
          enableStorage: pinnedRepair.enableStorage,
          maxGenerations: pinnedRepair.maxGenerations,
          // Do not let an embedding replace a denied per-failure grant after
          // the main Workflow review. Preserve the original receiver.
          ...(callable(pinnedRepair.authorize) ? {
            authorize: (...args) => Reflect.apply(pinnedRepair.authorize, repairPolicy, args)
          } : {})
        }) } : {}),
        // Use exactly the reviewed criterion snapshot for this execution.
        // A later mutation of the embedding's array cannot retarget delivery.
        ...(destinationDelivery ? { destinationDelivery: Object.freeze({
          // Controller cannot see later method-slot replacements on the
          // embedding's mutable delivery service after this execution grant.
          authorize: (...args) => Reflect.apply(destinationMethods.authorize, destinationDelivery, args),
          verify: (...args) => Reflect.apply(destinationMethods.verify, destinationDelivery, args),
          approvedCriteria: scope.destinationCriteria.map(criterion => ({ ...criterion }))
        }) } : {}),
        ...(developmentPolicy ? { developmentPolicy } : {}),
        ...(pinnedWorkItemPolicy ? { workItemPolicy: structuredClone(pinnedWorkItemPolicy) } : {})
      };
      const workflow = await execute(store, runId, dependencies,
        { resume });
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
  facades.set(facade, store);
  return facade;
}
