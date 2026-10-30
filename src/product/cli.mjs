import path from 'node:path';
import { Store } from '../alpha/store.mjs';
import { execute } from '../alpha/controller.mjs';
import { createRegistry } from '../providers/registry.mjs';
import { createClaudePlanner } from '../providers/planner.mjs';
import { createCodexAdapter } from '../providers/codex.mjs';
import { probeProvider } from '../providers/capabilities.mjs';
import { enableTasks, createTask, reviewTask, prepareTask, approveTask, rejectTask, materializeTask, verifyTask, clarifyTask, objectiveUnknownsReport, task, tasks } from './tasks.mjs';
import { readResponse } from '../hosts/cli.mjs';
import { runReport, taskReport } from './report.mjs';
import { revokeDecision, reservationStatus, requireDurableOperator } from './reservations.mjs';
import { nativeLocalStep, nativeEnvironmentStep, prepareNativeLocalReview, acceptNativeLocalReview, prepareNativeFilesReview, acceptNativeFilesReview } from './native-local.mjs';
import { developmentProposalRequest, developmentProposalBatch, reviewDevelopmentResults, recordProposalDispatch } from './continuation.mjs';
import { recoverObjective } from './recovery.mjs';
import { prepareContractRevision, acceptContractRevision, revokeContractRevision } from './contract-revisions.mjs';
import { repairProposalRequest } from './repair.mjs';

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
  const allowed = new Set(['acceptance', 'files', 'tests', 'criterion', 'item', 'parallel', 'attempts', 'timeout', 'budget', 'hash', 'actor', 'planner', 'codex-executable', 'claude-executable', 'unknown', 'scope', 'revision', 'trust', 'decision', 'request-id', 'expires']);
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

export async function productCli(argv, directory) {
  let store;
  try {
    requireDurableEntry(argv); // Before opening Store or reading caller JSON.
    if (!argv[0] || ['help', '--help'].includes(argv[0])) return await dispatchProduct(argv);
    store = new Store(directory, { readOnly: ['recover', 'proposal-batch', 'repair-proposal-request'].includes(argv[0]) });
    return await dispatchProduct(argv, { store });
  }
  catch (e) { return { exitCode: 1, data: { schemaVersion: 1, status: 'BLOCKED_OR_UNSUPPORTED', error: e.message } }; }
  finally { store?.close(); }
}
