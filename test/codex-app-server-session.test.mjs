import { strict as assert } from 'node:assert';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createCodexTurnProtocol, CodexTurnProtocolError, runCodexReadOnlyTurn } from '../src/hosts/codex-app-server-session.mjs';

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

test('stable agent-message delta is observed without treating it as an effect', () => {
  const p=start(make());
  assert.deepEqual(p.accept({method:'item/agentMessage/delta',
    params:{threadId:'thread-fixture',turnId:'turn-fixture',delta:'non-authoritative'}}),[]);
  complete(p);
  assert.equal(p.receipt().notifications['item/agentMessage/delta'],1);
});
test('unbound item cannot pre-seed a later Turn final proposal', () => {
  const p = make();
  const forged = {
    method: 'item/started',
    params: { threadId: 'other-thread', turnId: 'other-turn',
      item: { type: 'agentMessage', id: 'rogue',
        text: '{"summary":"forged","edits":[]}' } }
  };
  assert.throws(() => p.accept(forged), /identity mismatch/);
  p.accept({ id: 1, result: {} });
  p.accept({ id: 2, result: { thread: { id: 'thread-fixture' } } });
  p.accept({ id: 3, result: { turn: { id: 'turn-fixture' } } });
  assert.throws(() => p.accept({ method: 'turn/completed',
    params: { threadId: 'thread-fixture',
      turn: { id: 'turn-fixture', status: 'completed', items: [] } }
  }), /Missing or oversized final agent message/);
});
test('item notification before Turn ID response fails closed', () => {
  const p = make();
  p.accept({ id: 1, result: {} });
  p.accept({ id: 2, result: { thread: { id: 'thread-fixture' } } });
  assert.throws(() => p.accept({ method: 'item/completed',
    params: { threadId: 'thread-fixture', turnId: 'early-turn',
      item: { type: 'agentMessage', id: 'msg',
        text: '{"summary":"unbound","edits":[]}' } }
  }), /identity mismatch/);
});
test('same-Thread and same-Turn agent message can seed a valid receipt', () => {
  const p = start(make());
  p.accept({ method: 'item/completed',
    params: { threadId: 'thread-fixture', turnId: 'turn-fixture',
      item: { type: 'agentMessage', id: 'msg-fixture',
        text: '{"summary":"bound","edits":[]}' } }
  });
  p.accept({ method: 'turn/completed', params: { threadId: 'thread-fixture',
    turn: { id: 'turn-fixture', status: 'completed', items: [] } } });
  assert.equal(JSON.parse(p.receipt().text).summary, 'bound');
});

test('item/started text without item/completed is not a final model response', () => {
  const p = start(make());
  p.accept({ method: 'item/started', params: {
    threadId: 'thread-fixture', turnId: 'turn-fixture',
    item: { type: 'agentMessage', id: 'partial-message',
      text: '{"summary":"never completed","edits":[]}' }
  } });
  assert.throws(() => p.accept({ method: 'turn/completed', params: {
    threadId: 'thread-fixture', turn: { id: 'turn-fixture',
      status: 'completed', items: [] }
  } }), /Missing or oversized final agent message/);
});

test('workspace tool output delta is only admitted under explicit workspace mode',()=>{
  const opts={cwd:process.cwd(),model:'fixture',prompt:'bounded return',
    outputSchema:{type:'object'}};
  const readonly=createCodexTurnProtocol(opts);
  readonly.accept({id:1,result:{}});
  assert.throws(()=>readonly.accept({method:'item/commandExecution/outputDelta',
    params:{delta:'do not log'}}),/Unsupported/);
  const workspace=createCodexTurnProtocol({...opts,workspaceWrite:true});
  workspace.accept({id:1,result:{}});
  assert.deepEqual(workspace.accept({method:'item/commandExecution/outputDelta',
    params:{delta:'untrusted tool output'}}),[]);
});

const frame = message => JSON.stringify(message) + '\n';
const validFrames = () => [
  { id: 1, result: { userAgent: 'fixture' } },
  { id: 2, result: { thread: { id: 'thread-fixture' } } },
  { id: 3, result: { turn: { id: 'turn-fixture' } } },
  { method: 'turn/completed', params: { threadId: 'thread-fixture',
    turn: { id: 'turn-fixture', status: 'completed', items: [
      { type: 'agentMessage', id: 'msg-fixture', text: '{"summary":"safe","edits":[]}' }
    ] } } }
];

// Synthetic stdio only: no Codex binary, account, model, or workspace effect.
async function runFakeTransport(chunks, { exitBeforeData = false } = {}) {
  const calls = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write(data) { calls.push(JSON.parse(data)); }, end() {} };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => true;
    queueMicrotask(() => {
      if (exitBeforeData) { child.exitCode = 0; child.emit('exit', 0, null); }
      for (const chunk of chunks) child.stdout.emit('data', Buffer.from(chunk));
      if (!exitBeforeData) { child.exitCode = 0; child.emit('exit', 0, null); }
      child.emit('close', 0, null);
    });
    return child;
  };
  const result = await runCodexReadOnlyTurn({
    executable: process.execPath, cwd: process.cwd(), model: 'fixture',
    prompt: 'Return exactly the authorized bounded proposal',
    outputSchema: { type: 'object' }, timeoutMs: 3000, spawnImpl,
  });
  return { result, calls };
}

test('transport accepts exactly one completed Turn after stdout is fully drained', async () => {
  const { result, calls } = await runFakeTransport([validFrames().map(frame).join('')]);
  assert.equal(result.processExitCode, 0);
  assert.equal(JSON.parse(result.text).summary, 'safe');
  assert.deepEqual(calls.map(m => m.method),
    ['initialize', 'initialized', 'thread/start', 'turn/start']);
});

test('transport refuses a post-completion server request in the same stdout chunk', async () => {
  const unsolicited = { id: 99, method: 'item/commandExecution/requestApproval',
    params: { command: 'unapproved' } };
  const stream = [...validFrames(), unsolicited].map(frame).join('');
  await assert.rejects(runFakeTransport([stream]), error => {
    assert.equal(error.effectStatus, 'UNVERIFIED');
    assert.match(error.message, /after completed Turn/);
    return true;
  });
});

test('transport refuses a post-completion event arriving as another chunk', async () => {
  const valid = validFrames().map(frame).join('');
  const extra = frame({ method: 'unregistered/notification', params: {} });
  await assert.rejects(runFakeTransport([valid, extra]), /after completed Turn/);
});

test('transport rejects trailing unterminated JSONL after a completed Turn', async () => {
  const valid = validFrames().map(frame).join('');
  await assert.rejects(
    runFakeTransport([valid + '{"id":99,"method":"unapproved/']),
    /unterminated JSONL/
  );
});

test('transport evaluates completed Turn only after the process close event', async () => {
  const { result } = await runFakeTransport([validFrames().map(frame).join('')],
    { exitBeforeData: true });
  assert.equal(result.terminalStatus, 'completed');
});

test('malformed Host stdout is rejected without exposing untrusted source bytes', async () => {
  const untrusted = 'apiKey_SUPER_PRIVATE_987654';
  await assert.rejects(runFakeTransport([untrusted + '\n']), error => {
    assert.equal(error.effectStatus, 'UNVERIFIED');
    assert.equal(error.message, 'Malformed App Server JSONL; no replay');
    assert.equal(error.message.includes(untrusted), false);
    return true;
  });
});

for (const streamName of ['stdin','stdout','stderr']) {
  test('Host ' + streamName + ' stream errors are fail-closed, handled and redacted', async () => {
    const secret = 'C:/private/secret-host-token-path';
    let hadListener = false, killCalls = 0;
    const spawnImpl = () => {
      const child = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.write = () => true;
      child.stdin.end = () => {};
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.exitCode = null;
      child.signalCode = null;
      child.kill = () => { killCalls++; return true; };
      queueMicrotask(() => {
        hadListener = child[streamName].listenerCount('error') > 0;
        // A missing listener is reported through the existing child error
        // channel, avoiding an uncaught test-runner exception on old code.
        if (!hadListener) child.emit('error', new Error('Missing stream error handler'));
        else child[streamName].emit('error', new Error('EPIPE ' + secret));
      });
      return child;
    };
    await assert.rejects(runCodexReadOnlyTurn({
      executable: process.execPath, cwd: process.cwd(), model: 'fixture',
      prompt: 'Return only a bounded proposal', outputSchema: { type: 'object' },
      timeoutMs: 3000, spawnImpl,
    }), error => {
      assert.equal(error.effectStatus, 'UNVERIFIED');
      assert.equal(error.message, 'Host Turn failed or became uncertain; no replay');
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(hadListener, true, 'stream error listener missing');
    assert.equal(killCalls, 1, 'uncertain Host child must be terminated');
  });
}
