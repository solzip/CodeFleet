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

export const help = `codefleet-alpha objective plan|run "goal" [repository]
codefleet-alpha objective review <task-id> --files src/a.js --tests test/a.test.js --criterion "regression passes"
  [--item "id|file,...|test,...|dependency,..."] [--parallel 1..3] [--attempts 1..5]
codefleet-alpha objective run <task-id> (prepare; never auto-approve)
codefleet-alpha objective approve <task-id> --hash <workflowHash> --actor <name>
codefleet-alpha objective run|resume <task-id> --allow-model
codefleet-alpha objective status [task-id] | report <task-or-run-id>
codefleet-alpha objective reject|pause|cancel <task-id> [--actor <name>]
codefleet-alpha objective readiness [--codex-executable native-path]
codefleet-alpha objective materialize <task-id> <item-id> (NEW_PROJECT: create an approved fileset; never overwrites, never runs git)
codefleet-alpha objective verify <task-id> <item-id> REQUEST.json [--trust <commandHash> --acknowledge-unisolated]
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
  const flags = new Set(['allow-model', 'json', 'acknowledge-unisolated']);
  const allowed = new Set(['files', 'tests', 'criterion', 'item', 'parallel', 'attempts', 'timeout', 'budget', 'hash', 'actor', 'planner', 'codex-executable', 'claude-executable', 'unknown', 'scope', 'revision', 'trust', 'decision', 'request-id']);
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
  if (action === 'readiness') {
    if (args.length) throw Error('readiness accepts no arguments');
    const providers = await Promise.all(['claude', 'codex'].map(id => probeProvider(id, o[id + '-executable'] ? { executable: o[id + '-executable'] } : {})));
    return { exitCode: 2, data: { schemaVersion: 1, readiness: 'BLOCKED_OR_UNSUPPORTED', providers, liveCalls: 'NOT_RUN', reason: 'Version/help do not prove enforcement; no automatic live certification' } };
  }
  enableTasks(store);
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
    const created = await createTask(store, path.resolve(args[1] ?? '.'), id, { registry, requested: o.planner, allowLive: o['allow-model'] === true });
    id = created.id;
    const result = await report(); result.exitCode = created.state === 'VALIDATED' ? 0 : 2; return result;
  }
  if (action === 'status' && !id) return { exitCode: 0, data: { schemaVersion: 1, tasks: await Promise.all(tasks(store).map(t => taskReport(store, t.id))) } };
  if (action === 'materialize') {
    if (args.length !== 2) throw Error('materialize requires task id and WorkItem id');
    const result = await materializeTask(store, args[0], args[1]);
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
    store = new Store(directory);
    return await dispatchProduct(argv, { store });
  }
  catch (e) { return { exitCode: 1, data: { schemaVersion: 1, status: 'BLOCKED_OR_UNSUPPORTED', error: e.message } }; }
  finally { store?.close(); }
}
