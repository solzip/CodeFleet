import path from 'node:path';
import { open } from 'node:fs/promises';
import { Store } from '../alpha/store.mjs';
import { dispatchProduct } from '../product/cli.mjs';
import { enableTasks, task, prepareTask, submitTaskDraft, submitBootstrapFiles, bootstrapView, bootstrapDrift } from '../product/tasks.mjs';
import { taskReport, bootstrapActions } from '../product/report.mjs';
import { execute } from '../alpha/controller.mjs';
import { hostIdentity, issueRequests, submitResponse, stagedExecution } from './exchange.mjs';
import { requireProductionHostIsolation } from './operator.mjs';
import { evaluateWorkItem, WORK_KINDS } from '../workflow/capability-policy.mjs';
import { hostDoctor } from './doctor.mjs';

export const hostHelp = `Host-native staged proposal workflow (no API key or model subprocess):
host <codex|claude> plan "goal" [repository]
host <codex|claude> draft <task-id> <proposal.json>
host <codex|claude> workflow|explain <task-id>
host <codex|claude> doctor [--probe-container]
host <codex|claude> review <task-id> --files ... --tests ... --criterion ...
host <codex|claude> prepare|approval-request|requests|run|resume|pause|cancel|status|report <task-id>
host <codex|claude> submit <response.json>
host <codex|claude> files <task-id> <fileset.json>
host <codex|claude> capabilities
NEW_PROJECT (unborn HEAD, README-only or non-Git directory) is chosen by the repository probe.
draft takes {revision,proposal:BootstrapDraft}; files takes {revision,itemId,files:[{path,content}]}
for one local-edit WorkItem and only requests review. The operator approves the filesetHash with
objective approve and creates files with objective materialize; git init and commit stay user actions.
After a LOCAL_FAILED objective verify, files takes {revision,itemId,repair:{verificationItem,evidenceRef},
files:[{path,content,baseSha256}]} to replace that materialized item's own files; same approval.
Use --state outside the target repository. Approval requests do not authorize execution.
An operator must approve the exact workflow hash using the existing objective approve command.
Responses: {requestId,bindingHash,proposal:{summary,edits:[{path,oldText,newText}]}}.
Host reports never count as verification. Public requests/submit/run/resume are blocked
until an OS-authenticated Operator broker is available; actor strings cannot enable them.`;

export async function readResponse(file) {
  const handle = await open(path.resolve(file), 'r');
  try {
    if (!(await handle.stat()).isFile()) throw Error('Response must be a regular file');
    const buffer = Buffer.alloc(220001); let size = 0;
    while (size < buffer.length) { const r = await handle.read(buffer, size, buffer.length - size, null); if (!r.bytesRead) break; size += r.bytesRead; }
    if (size > 220000) throw Error('Host response exceeds limit');
    return JSON.parse(buffer.subarray(0, size).toString('utf8'));
  } finally { await handle.close(); }
}
export async function dispatchHost(argv, { store, execution = {} } = {}) {
  const [host, action, ...args] = argv;
  if (!host || ['help', '--help'].includes(host)) return { exitCode: 0, data: { help: hostHelp } };
  const identity = hostIdentity(host);
  const present = result => {
    const data = { ...result.data, host: identity };
    const failure = data.plan?.probe?.error;
    if (host === 'codex' && data.state === 'BLOCKED' && ['GIT_OWNERSHIP', 'PROCESS_SPAWN_DENIED'].includes(failure?.kind)) {
      // Advice only. The Host owns the approval UI and execution permission;
      // no CodeFleet grant, replay or process launch is performed here.
      data.hostRecovery = { status: 'HOST_APPROVAL_REQUIRED', reason: failure.kind,
        authority: 'ADVISORY_ONLY', automaticRetry: false, grantsExecution: false,
        taskId: data.taskId, taskRevision: data.revision,
        nextAction: 'Use the Codex execution tool command-specific approval for the exact scoped CLI command. Re-query this task first; a blocked plan requires a new plan, not resume. Preserve the failed task. If approval is denied or unavailable, report BLOCKED.',
        codefleetApproval: 'UNCHANGED', verification: 'NOT_ESTABLISHED' };
      data.nextAction = data.hostRecovery.nextAction;
    }
    if (data.kind === 'TaskReport' && data.contractKind !== 'NEW_PROJECT' && !data.hostRecovery) data.nextAction = 'Review and prepare; obtain operator hash-bound approval; requests, submit, then run staged proposals';
    if (data.run?.provider?.startsWith('host-')) data.run.cost = { ...data.run.cost, scope: 'LOCAL_STAGED_REPLAY_ONLY', modelCalls: 0, hostSessionCost: null, hostSessionCostStatus: 'UNKNOWN' };
    return { ...result, data };
  };
  if (action === 'capabilities') { if (args.length) throw Error('No capability arguments accepted'); return { exitCode: 0, data: identity }; }
  if (action === 'doctor') {
    if (args.length > 1 || args.length === 1 && args[0] !== '--probe-container') throw Error('doctor accepts only --probe-container');
    const data = await hostDoctor(host, { probeContainer: args.length === 1 });
    return { exitCode: data.status === 'AVAILABLE' ? 0 : 1, data };
  }
  enableTasks(store);
  // Allowlist excludes approval, model flags, provider selection and arbitrary commands.
  if (args.some(v => ['--allow-model', '--planner', '--codex-executable', '--claude-executable'].includes(v))) throw Error('Host path cannot launch a model or select a provider');
  if (action === 'draft') {
    if (args.length !== 2) throw Error('draft requires task id and bounded proposal JSON');
    const updated = await submitTaskDraft(store, args[0], await readResponse(args[1]));
    return present({ exitCode: updated.state === 'VALIDATED' ? 0 : 2, data: await taskReport(store, args[0]) });
  }
  if (['workflow', 'explain'].includes(action)) {
    if (args.length !== 1) throw Error('Exactly one task id required');
    const current = task(store, args[0]), run = current.runId ? store.get(current.runId) : null;
    if (current.bootstrap) {
      const view = bootstrapView(store, current.id, { drift: await bootstrapDrift(store, current.id) });
      return present({ exitCode: 0, data: { taskId: current.id, revision: current.revision, contractKind: 'NEW_PROJECT',
        bootstrap: view, authority: 'PREPARATION_ONLY', executable: false, approved: false,
        nextActions: bootstrapActions(view), operatorOnly: ['objective approve', 'objective materialize', 'objective verify'] } });
    }
    return present({ exitCode: 0, data: { taskId: current.id, revision: current.revision,
      workflow: run?.contract ?? null, states: run?.states ?? null,
      authority: 'PREPARATION_ONLY', executable: false, approved: false,
      workKinds: Object.keys(WORK_KINDS).map(kind => evaluateWorkItem(kind)),
      workItems: run?.contract.items.map(item => ({ id: item.id, dependencies: item.dependencies,
        assessment: evaluateWorkItem('protected-verification'),
        authorization: 'REQUIRES_PROTECTED_EXECUTION_PATH',
        reason: run.workItemBlocks?.[item.id] ?? ['Runtime capability and current approval not established by preparation'] })) ?? [],
      reason: 'Host reads follow actual Host permissions. Execution capabilities and approvals are checked separately; no isolation is asserted.',
      nextAction: run ? 'Request review of exact workflow hash' : 'Validate draft, then prepare workflow' } });
  }
  if (['plan', 'review', 'status', 'report', 'pause', 'cancel', 'reject'].includes(action)) return present(await dispatchProduct([action, ...args], { store }));
  if (action === 'files') {
    if (args.length !== 2) throw Error('files requires task id and bounded fileset JSON');
    const { approvalRequest } = await submitBootstrapFiles(store, args[0], await readResponse(args[1]));
    return present({ exitCode: 2, data: { ...await taskReport(store, args[0]), approvalRequest } });
  }
  if (action === 'submit') {
    if (args.length !== 1) throw Error('submit requires response.json');
    return { exitCode: 0, data: submitResponse(store, host, await readResponse(args[0])) };
  }
  if (!['prepare', 'approval-request', 'requests', 'run', 'resume'].includes(action)) throw Error('Unsupported host action; approval and completion cannot be set by host');
  if (args.length !== 1) throw Error('Exactly one task id required');
  const id = args[0];
  if (['prepare', 'approval-request'].includes(action)) {
    const prepared = await prepareTask(store, id);
    if (prepared.bootstrap) return present({ exitCode: 2, data: { ...await taskReport(store, id), approvalRequest: null, reason: 'NEW_PROJECT approval is per fileset; propose files for a local-edit item' } });
    const current = prepared, run = store.get(current.runId);
    return present({ exitCode: 2, data: { ...await taskReport(store, id), approvalRequest: { taskId: id, taskRevision: current.revision, runRevision: run.revision, workflowHash: run.contractHash, authority: 'REQUEST_ONLY' } } });
  }
  const current = task(store, id);
  if (!current.runId) throw Error('Prepare and obtain operator approval first');
  if (action === 'requests') return { exitCode: 0, data: { host: identity, requests: await issueRequests(store, current.runId, host) } };
  const hostExecution = stagedExecution(store, current.runId, host);
  // Preflight before taking a lease; missing packets do not reserve attempts.
  await hostExecution.select(store.get(current.runId));
  const stop = () => store.control(current.runId, 'cancel');
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try { await execute(store, current.runId, { ...execution, hostExecution }, { resume: action === 'resume' }); }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  const data = await taskReport(store, id);
  return present({ exitCode: data.run.complete ? 0 : 2, data });
}
export async function hostCli(argv, directory) {
  if (argv[1] === 'doctor') {
    try { return await dispatchHost(argv); }
    catch (error) { return { exitCode: 1, data: { status: 'BLOCKED', error: error.message } }; }
  }
  // Public Host ingress never falls back to the legacy actor-based approval.
  // Internal dispatchHost remains the trusted offline coordinator seam.
  if (['requests', 'submit', 'run', 'resume'].includes(argv[1])) {
    try { requireProductionHostIsolation(); }
    catch (error) { return { exitCode: 1, data: { status: 'BLOCKED', error: error.message } }; }
  }
  const store = new Store(directory);
  try { return await dispatchHost(argv, { store }); }
  catch (error) { return { exitCode: 1, data: { status: 'BLOCKED', error: error.message } }; }
  finally { store.close(); }
}
