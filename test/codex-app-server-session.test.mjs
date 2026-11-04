import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createCodexTurnProtocol, CodexTurnProtocolError } from '../src/hosts/codex-app-server-session.mjs';

const settings = () => ({
  cwd: process.cwd(), model: 'codex-fixture', prompt: 'Return a bounded structured proposal',
  outputSchema: { type: 'object', properties: { summary: { type: 'string' }, edits: { type: 'array' } } }
});
const make = () => createCodexTurnProtocol(settings());
const start = p => {
  assert.equal(p.start()[0].method, 'initialize');
  const commands = p.accept({ id: 1, result: { userAgent: 'codex' } });
  assert.deepEqual(commands.map(c => c.method), ['initialized','thread/start']);
  assert.deepEqual(commands[1].params.sandbox, 'read-only');
  assert.deepEqual(commands[1].params.approvalPolicy, 'never');
  assert.deepEqual(p.accept({ method: 'remoteControl/status/changed', params: { installationId: 'secret' } }), []);
  const turn = p.accept({ id: 2, result: { thread: { id: 'thread-fixture' } } });
  assert.equal(turn.length, 1);
  assert.equal(turn[0].method, 'turn/start');
  assert.equal(turn[0].params.threadId, 'thread-fixture');
  assert.deepEqual(turn[0].params.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  p.accept({ id: 3, result: { turn: { id: 'turn-fixture' } } });
  return p;
};
const complete = (p, status = 'completed') => p.accept({
  method: 'turn/completed', params: { threadId: 'thread-fixture',
    turn: { id: 'turn-fixture', status, items: [
      { type: 'agentMessage', id: 'msg-fixture', text: '{"summary":"done","edits":[]}' }
    ] }
  }
});

test('read-only bounded session: initialize, thread, Turn, completion and receipt', () => {
  const p = start(make());
  complete(p);
  assert.equal(p.completed, true);
  assert.deepEqual(p.receipt().terminalStatus, 'completed');
  assert.equal(p.receipt().threadId, 'thread-fixture');
  assert.equal(p.receipt().turnId, 'turn-fixture');
  assert.equal(p.receipt().authority, 'PROVIDER_REPORTED_ONLY');
  assert.equal(p.receipt().protectedVerified, false);
  assert.equal(p.receipt().notifications['remoteControl/status/changed'], 1);
  assert.throws(() => p.accept({ method: 'thread/started', params: {} }), CodexTurnProtocolError);
});

test('no receipt before completed turn', () => assert.throws(() => make().receipt(), /No completed/));
test('no unbounded or missing prompt', () => {
  assert.throws(() => createCodexTurnProtocol({ ...settings(), prompt: '' }), /required/);
  assert.throws(() => createCodexTurnProtocol({ ...settings(), outputSchema: null }), /required/);
});
test('server request cannot become an implicit approval', () => {
  const p = start(make());
  assert.throws(() => p.accept({ method: 'item/commandExecution/requestApproval', id: 10, params: {} }), /server request|Unsupported/);
});
test('unrecognized notification fails closed', () => {
  const p = start(make());
  assert.throws(() => p.accept({ method: 'untrusted/notification', params: {} }), /Unsupported/);
});
test('wrong response ID or malformed result cannot create a Turn', () => {
  const p = make();
  assert.throws(() => p.accept({ id: 2, result: {} }), /response|Unexpected/);
  assert.throws(() => p.accept({ id: 1, error: { code: -1 } }), /failed/);
});
test('wrong thread or Turn cannot finalize', () => {
  const p = start(make());
  assert.throws(() => p.accept({ method: 'turn/completed', params: {
    threadId: 'other', turn: { id: 'turn-fixture', status: 'completed', items: [] }
  } }), /unbound/);
});
test('only completed terminal status is accepted', () => {
  const p = start(make());
  assert.throws(() => complete(p, 'failed'), /not completed/);
});
test('tool execution item is uncertain; cannot be accepted as proposal-only receipt', () => {
  const p = start(make());
  assert.throws(() => p.accept({ method: 'item/started', params: {
    threadId: 'thread-fixture', turnId: 'turn-fixture',
    item: { type: 'commandExecution', id: 'command', command: 'echo unsafe' }
  } }), /effect is uncertain/);
});
test('no invented identifiers or terminal result', () => {
  const p = make();
  p.accept({ id: 1, result: {} });
  assert.throws(() => p.accept({ id: 2, result: { thread: { id: '' } } }), /Thread ID/);
});
