// Private pipe worker, started only by the OS-authenticated Linux bridge.
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from '../alpha/store.mjs';
import { OfflineOperatorLedger, canonical, fingerprint, digest } from './operator.mjs';
import { WorkflowAuthorization, registerWorkflowGuard } from './workflow-authorization.mjs';
import { createHarnessService } from './harness-service.mjs';
import { reserve, attempts } from '../workflow/persistence.mjs';

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw Error('Unexpected runtime fields');
}
export function createOperatorRuntime(config) {
  if (process.platform !== 'linux' || process.getuid() !== config.operatorUid || config.operatorUid === config.agentUid || config.operatorUid <= 0 || config.agentUid <= 0) throw Error('OS Operator identity unavailable');
  const privatePath = file => { const s = lstatSync(file); if (s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o077)) throw Error('Private Operator ownership required'); };
  privatePath(config.state);
  const keyFile = path.join(config.state, 'operator-key.json');
  if (!existsSync(keyFile)) {
    const keys = generateKeyPairSync('ed25519');
    writeFileSync(keyFile, JSON.stringify({ publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }), privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) }), { flag: 'wx', mode: 0o600 });
  }
  privatePath(keyFile);
  const keys = JSON.parse(readFileSync(keyFile, 'utf8'));
  const store = new Store(config.state); store.enableCollaboration();
  let guard;
  const ledger = new OfflineOperatorLedger({ file: path.join(config.state, 'operator.sqlite'), operatorKeys: [keys.publicKey], current: (run, item) => guard.snapshot(run, item), dispatch: () => { throw Error('Generic dispatch unsupported'); } });
  guard = new WorkflowAuthorization(store, ledger, config.catalog, config.environment);
  registerWorkflowGuard(store, guard);
  const owners = new Map(), requests = new Map();
  const timer = setInterval(() => { for (const [id, owner] of owners) store.heartbeat(id, owner); }, 5000); timer.unref();
  let service;
  const runtime = {
    handle({ peer, message }) {
      if (message.version !== undefined) {
        if (!service) throw Error('Host Harness service unavailable');
        return service.handle(peer,message);
      }
      if (config.hostService && peer.uid === config.agentUid) throw Error('Versioned Host IPC required');
      exact(message, ['method', 'params']);
      if (![config.operatorUid, config.agentUid].includes(peer.uid)) throw Error('Peer UID denied');
      const p = message.params;
      if (message.method === 'decide') {
        if (config.hostService) throw Error('Trusted human input not attested; decisions BLOCKED');
        if (peer.uid !== config.operatorUid) throw Error('Operator UID required');
        exact(p, ['id', 'reviewDigest', 'kind', 'expiresAt']);
        const request = requests.get(p.id);
        if (!request || digest(request.binding) !== p.reviewDigest || !Number.isSafeInteger(p.expiresAt) || p.expiresAt <= Date.now() || p.expiresAt > Date.now() + 3600000) throw Error('Reviewed decision mismatch or expiry');
        const decision = { id: p.id, kind: p.kind, binding: request.binding, principal: fingerprint(keys.publicKey), expiresAt: p.expiresAt, maxUses: 1 };
        const result = ledger.operator({ decision, signature: sign(null, Buffer.from(canonical(decision)), keys.privateKey).toString('hex') });
        store.event(request.binding.runId, 'OS_OPERATOR_DECISION', { peerUid: peer.uid, kind: p.kind, requestId: p.id, reviewDigest: p.reviewDigest });
        return result;
      }
      if (['request', 'assign'].includes(message.method)) {
        exact(p, ['runId', 'itemId']);
        if (!owners.has(p.runId)) throw Error('Open coordinator lease first');
        if (message.method === 'request') { const result = guard.request(p.runId, p.itemId); requests.set(result.id, result); return result; }
        const snapshot = guard.snapshot(p.runId, p.itemId), run = store.get(p.runId);
        const item = run.contract.items.find(n => n.id === p.itemId);
        if (!item || !item.dependencies.every(id => run.states[id] === 'SUCCEEDED')) throw Error('Dependency not ready');
        run.states[item.id] = 'READY';
        const child = reserve(store, run, owners.get(run.id), p.itemId, snapshot.action.contract);
        return { status: 'ASSIGNED', childId: child.id, authority: 'ASSIGNMENT_ONLY_NOT_VERIFIED' };
      }
      exact(p, ['runId']);
      if (!config.catalog[p.runId]) throw Error('Run outside trusted catalog');
      if (message.method === 'inspect') { const r = store.get(p.runId); return { id: r.id, revision: r.revision, state: r.state, control: r.control, attempts: attempts(store, r.id).length }; }
      if (message.method === 'open') {
        const run = store.get(p.runId);
        if (run.control === 'cancel') throw Error('Cancelled run');
        // New lease is a new authorization fence, including resume.
        if (owners.has(run.id)) throw Error('Coordinator already open');
        if (attempts(store, run.id).length) throw Error('Started attempts require recovery; no replay');
        const owner = store.claim(run.id, { resume: run.control === 'pause' }); owners.set(run.id, owner);
        try { guard.check(store.get(run.id)); } catch (e) { store.release(run.id, owner); owners.delete(run.id); throw e; }
        return { status: 'OPEN', authority: 'LEASE_ONLY' };
      }
      if (['pause', 'cancel'].includes(message.method)) {
        store.control(p.runId, message.method);
        if (owners.has(p.runId)) store.release(p.runId, owners.get(p.runId));
        owners.delete(p.runId); return { status: message.method.toUpperCase() };
      }
      throw Error('Operation unsupported; no remote effects or arbitrary execution');
    },
    async close() { await service?.close(); clearInterval(timer); for (const [id, owner] of owners) store.release(id, owner); ledger.close(); store.close(); }
  };
  if (config.hostService) service = createHarnessService(store,guard,config,p => {
    // Requests are not decisions. Hold a lease solely to bind the H2 request.
    if (!owners.has(p.runId)) runtime.handle({peer:{uid:config.operatorUid},message:{method:'open',params:{runId:p.runId}}});
    return runtime.handle({peer:{uid:config.operatorUid},message:{method:'request',params:p}});
  });
  return runtime;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = createOperatorRuntime(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    let input;
    try { input = JSON.parse(line); const result = await runtime.handle(input); console.log(JSON.stringify(input.message.version !== undefined ? result : {status:'OK',result})); }
    catch (error) { console.log(JSON.stringify({ status: 'BLOCKED', reason: error.message, requestId:input?.message?.requestId })); }
  }
  await runtime.close();
}
