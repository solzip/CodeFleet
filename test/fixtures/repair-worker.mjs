// Test-only process; scenarios cannot be invoked through public CLI.
import { writeFile } from 'node:fs/promises';
import { Store } from '../../src/alpha/store.mjs';
import { enableTasks, task } from '../../src/product/tasks.mjs';
import { revokeDecision } from '../../src/product/reservations.mjs';
import { repairOfflineWorkItem } from '../../src/product/repair.mjs';
import { fixtureOperator } from './repair-policy.mjs';
const input = JSON.parse(process.argv[2]), store = new Store(input.state); enableTasks(store);
let cancelled = false;
const hooks = { materialize: {}, verification: {} };
const changeRevision = () => { const v = task(store, input.id); v.revision++; store.db.prepare('UPDATE product_tasks SET revision=?,body=? WHERE id=?').run(v.revision, JSON.stringify(v), input.id); };
const pause = async marker => { await writeFile(marker, 'started'); await new Promise(() => setInterval(() => {}, 1000)); };
if (input.fault === 'kill-repair') hooks.started = () => pause(input.marker);
if (input.fault === 'clock-repair') hooks.started = () => { const now=Date.now(); Date.now=()=>now-5000; };
if (input.fault === 'kill-started') hooks.verification.beforeEvidence = () => pause(input.marker);
if (input.fault === 'revoke-repair') hooks.materialize.claimed = ({runId}) => store.db.prepare('DELETE FROM workflow_approvals WHERE runId=?').run(runId);
if (input.fault === 'lease-repair') hooks.materialize.claimed = ({runId}) => store.db.prepare("UPDATE runs SET owner='other' WHERE id=?").run(runId);
if (input.fault === 'revision-repair') hooks.materialize.claimed = changeRevision;
if (input.fault === 'revision-after-write') hooks.materialize.beforeCommit = changeRevision;
if (input.fault === 'revoke-verification') hooks.verification.beforeSpawn = r => revokeDecision(store, r.decisionId, 'test');
if (input.fault === 'revoke-after-verification') hooks.verification.beforeCommit = r => revokeDecision(store, r.decisionId, 'test');
if (input.fault === 'revision-after-verification') hooks.verification.beforeCommit = changeRevision;
if (input.fault === 'lease-after-verification') hooks.verification.beforeCommit = r => store.db.prepare("UPDATE runs SET owner='other' WHERE id=?").run(r.runId);
if (input.fault === 'cancel-after-verification') hooks.verification.beforeCommit = () => { cancelled = true; };
try {
  console.log(JSON.stringify(await repairOfflineWorkItem(store, input.id, { proposal: input.proposal, request: input.request,
    operator: fixtureOperator(store, { allowBroken: input.fault === 'repeat', refuse: input.fault === 'refuse' }), hooks, cancelled: () => cancelled })));
} finally { store.close(); }
