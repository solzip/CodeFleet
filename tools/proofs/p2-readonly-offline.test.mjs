import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  P2_FIXED_INPUT,P2_OUTPUT_SCHEMA,P2ProtocolError,
  createP2ReadOnlyProtocol,createP2OfflineJsonlReader
} from './p2-readonly-offline.mjs';

const cli=fileURLToPath(new URL('./p2-readonly-offline.mjs',import.meta.url));
const cwd=process.cwd(),model='fixture-model-0';
const ids={threadId:'synthetic-thread-123',turnId:'synthetic-turn-123'};
const finalText='{"proof":"P2_READ_ONLY_REPLY"}';
const item={id:'agent-msg-1',type:'agentMessage',text:finalText};
const good=[
  {id:1,result:{userAgent:'synthetic'}},
  {id:2,result:{
    thread:{id:ids.threadId,ephemeral:true,cwd},
    cwd,model,approvalPolicy:'never',sandbox:{type:'readOnly',networkAccess:false}
  }},
  {id:3,result:{turn:{id:ids.turnId}}},
  {method:'turn/started',params:{...ids}},
  {method:'item/completed',params:{...ids,item}},
  {method:'turn/completed',params:{...ids,turn:{
    id:ids.turnId,status:'completed',itemsView:'full',
    items:[{id:'user-msg-1',type:'userMessage'},{...item}]
  }}}
];
const frame=m=>JSON.stringify(m)+'\n';
const protocol=()=>createP2ReadOnlyProtocol({cwd,model});
const run=(frames=good,chunks)=>{
  const machine=protocol(),reader=createP2OfflineJsonlReader(machine);
  const messages=machine.start();
  for(const chunk of chunks??[Buffer.from(frames.map(frame).join(''))])
    messages.push(...reader.push(chunk));
  return {receipt:reader.close({exitCode:0,signal:null}),outbound:messages};
};
const failure=(fn,match)=>{
  assert.throws(fn,error=>{
    assert.equal(error.name,'P2ProtocolError');
    assert.equal(error.effectStatus,'UNVERIFIED');
    assert.equal(error.replayAllowed,false);
    assert.match(error.message,match);
    return true;
  });
};
test('P2 fake session emits exactly one read-only ephemeral Thread and Turn',()=>{
  const {receipt,outbound}=run();
  assert.deepEqual(outbound.map(m=>m.method),
    ['initialize','initialized','thread/start','turn/start']);
  assert.equal(outbound[2].params.ephemeral,true);
  assert.equal(outbound[2].params.approvalPolicy,'never');
  assert.equal(outbound[2].params.sandbox,'read-only');
  assert.equal(outbound[3].params.approvalPolicy,'never');
  assert.deepEqual(outbound[3].params.sandboxPolicy,{type:'readOnly',networkAccess:false});
  assert.equal(outbound[3].params.threadId,ids.threadId);
  assert.equal(outbound[3].params.model,model);
  assert.equal(outbound[3].params.cwd,cwd);
  assert.equal(outbound[3].params.input[0].text,P2_FIXED_INPUT);
  assert.deepEqual(outbound[3].params.outputSchema,P2_OUTPUT_SCHEMA);
  assert.equal(receipt.threadId,ids.threadId);
  assert.equal(receipt.turnId,ids.turnId);
  assert.equal(receipt.proof,'P2_READ_ONLY_REPLY');
  assert.equal(receipt.modelTurnsActuallyRun,0);
  assert.equal(receipt.appServerStarted,false);
  assert.equal(receipt.costStatus,'UNKNOWN');
  assert.equal(receipt.ownerApproval,'NOT_GRANTED');
  assert.equal(receipt.executionAuthorized,false);
  assert.equal(receipt.hostLiveVerified,false);
});
test('synthetic JSONL is accepted in arbitrarily split UTF-8 chunks',()=>{
  const frames=[...good];
  frames.splice(3,0,{method:'account/updated',params:{email:'private@example.invalid'}});
  const bytes=Buffer.from(frames.map(frame).join(''),'utf8');
  const chunks=[];
  for(let i=0;i<bytes.length;i+=7)chunks.push(bytes.subarray(i,i+7));
  const {receipt}=run(frames,chunks);
  assert.equal(receipt.notificationCounts['account/updated'],1);
  assert.equal(JSON.stringify(receipt).includes('private@example.invalid'),false);
});
test('reject untrusted server requests or approval prompts',()=>{
  for(const method of ['item/commandExecution/requestApproval','account/chatgptAuthTokens/refresh']){
    const frames=[...good];frames.splice(3,0,{method,id:55,params:{secret:'PRIVATE_CREDENTIAL'}});
    failure(()=>run(frames),/unsolicited server request/);
  }
});
test('any command/file/network/tool item is denied',()=>{
  for(const type of ['commandExecution','fileChange','mcpToolCall','dynamicToolCall','webSearch','collabAgentToolCall']){
    const frames=[...good];frames.splice(3,0,{
      method:'item/started',params:{...ids,item:{id:'item-evil',type}}
    });
    failure(()=>run(frames),/Host tool or unknown item/);
  }
});
test('unknown 0.167 notification is not silently whitelisted',()=>{
  const frames=[...good];frames.splice(3,0,{
    method:'thread/section/changed',params:{threadId:ids.threadId}
  });
  failure(()=>run(frames),/unapproved server notification/);
});
test('thread approval or effective sandbox escalation is refused',()=>{
  for(const prop of [
    {approvalPolicy:'on-request'},
    {sandbox:{type:'workspaceWrite',networkAccess:true,writableRoots:[cwd]}},
    {sandbox:{type:'readOnly',networkAccess:true}},
    {model:'unexpected-model'},
    {cwd:cwd+'-elsewhere'}
  ]){
    const frames=structuredClone(good);Object.assign(frames[1].result,prop);
    failure(()=>run(frames),/effective Thread policy mismatch/);
  }
});
test('unexpected Thread IDs, fake ephemeral flag or duplicate responses are refused',()=>{
  const wrong=structuredClone(good);
  wrong[1].result.thread.ephemeral=false;
  failure(()=>run(wrong),/effective Thread policy mismatch/);
  const dupe=[...good];dupe.splice(1,0,{id:1,result:{}});
  failure(()=>run(dupe),/duplicate, unexpected/);
});
test('bound Turn IDs are mandatory on item and completion messages',()=>{
  for(const index of [3,4,5]){
    const frames=structuredClone(good);frames[index].params.turnId='wrong-turn';
    failure(()=>run(frames),/Thread\/Turn mismatch/);
  }
});
test('wrong status or incomplete item view cannot yield accepted Turn',()=>{
  for(const patch of [
    {status:'failed'},
    {status:'interrupted'},
    {itemsView:'notLoaded'},
    {itemsView:'summary'},
    {items:[]},
  ]){
    const frames=structuredClone(good);
    Object.assign(frames.at(-1).params.turn,patch);
    failure(()=>run(frames),/full completed item view/);
  }
});
test('terminal Turn with a hidden tool item is rejected',()=>{
  const frames=structuredClone(good);
  frames.at(-1).params.turn.items.push({id:'mcp-1',type:'mcpToolCall'});
  failure(()=>run(frames),/terminal Turn includes a tool/);
});
test('only exact bounded JSON final proof is accepted',()=>{
  const bad=['{"proof":"P2_READ_ONLY_REPLY","extra":1}','{"proof":"OTHER"}',
    '{"proof":"P2_READ_ONLY_REPLY"', 'some sensitive free text',
    '{"proof":"P2_READ_ONLY_REPLY"}'.repeat(1000)];
  for(const text of bad){
    const frames=structuredClone(good);
    frames.at(-1).params.turn.items.at(-1).text=text;
    failure(()=>run(frames),/final text/);
  }
});
test('no other post-completion response or event is accepted',()=>{
  for(const extra of [
    {id:3,result:{turn:{id:ids.turnId}}},
    {method:'item/commandExecution/requestApproval',id:77,params:{}},
    {method:'account/updated',params:{}},
  ]){
    failure(()=>run([...good,extra]),/after completed Turn/);
  }
});
test('missing or duplicate Turn completion is rejected',()=>{
  const missing=good.slice(0,-1);
  failure(()=>run(missing),/incomplete or abnormal/);
  failure(()=>run([...good,good.at(-1)]),/after completed Turn/);
});
test('bad JSONL and unterminated trailing message fail closed',()=>{
  const valid=good.map(frame).join('');
  failure(()=>run(good,[Buffer.from(valid+'{"id":6,"method":"unapproved')]),/unterminated JSONL/);
  failure(()=>run(good,[Buffer.from(valid+'NOT JSON\n')]),/malformed JSONL/);
});
test('nonzero or signal termination cannot count as completed',()=>{
  for(const termination of [{exitCode:1,signal:null},{exitCode:0,signal:'SIGTERM'}]){
    const p=protocol(),reader=createP2OfflineJsonlReader(p);
    reader.push(Buffer.from(good.map(frame).join('')));
    failure(()=>reader.close(termination),/abnormal synthetic process close/);
  }
});
test('bounded stdout line and event budgets reject excess output',()=>{
  const p=protocol(),r=createP2OfflineJsonlReader(p);
  failure(()=>r.push(Buffer.from('x'.repeat(256*1024+1))),/line size exceeded/);
  const p2=protocol(),r2=createP2OfflineJsonlReader(p2);
  const lines=Array.from({length:129},()=>frame({method:'account/updated',params:{}}));
  failure(()=>r2.push(Buffer.from(lines.join(''))),/event budget exceeded/);
});
test('P2 parser handles only one terminal close',()=>{
  const p=protocol(),r=createP2OfflineJsonlReader(p);
  r.push(Buffer.from(good.map(frame).join('')));
  assert.equal(r.close({exitCode:0}).status,'P2_OFFLINE_PROTOCOL_MATCHED_ONLY');
  failure(()=>r.close({exitCode:0}),/duplicate stdout close/);
});
test('default CLI can never execute P2, accept a model grant, or start a Host',()=>{
  const goodCli=spawnSync(process.execPath,[cli],{encoding:'utf8',shell:false});
  assert.equal(goodCli.status,0,goodCli.stderr);
  const response=JSON.parse(goodCli.stdout);
  assert.equal(response.status,'P2_OFFLINE_PROTOCOL_ONLY');
  assert.equal(response.liveTransportAvailable,false);
  assert.equal(response.modelTurnsActuallyRun,0);
  assert.equal(response.nativeCodexStarted,false);
  assert.equal(response.executionAuthorized,false);
  assert.equal(response.ownerApproval,'NOT_GRANTED');
  for(const flag of ['--execute','--model','--approve','--cost-limit','--fixture']){
    const denied=spawnSync(process.execPath,[cli,flag],{encoding:'utf8',shell:false});
    assert.equal(denied.status,2);
    const output=JSON.parse(denied.stdout);
    assert.equal(output.status,'P2_OFFLINE_BLOCKED');
    assert.equal(output.executionAuthorized,false);
    assert.equal(output.modelTurnsActuallyRun,0);
  }
});
test('missing or malformed contract inputs never create outbound frames',()=>{
  for(const args of [{cwd:'relative',model}, {cwd,model:''}, {cwd,model:'x'.repeat(129)}])
    failure(()=>createP2ReadOnlyProtocol(args),/Exact absolute synthetic root/);
});

test('real observed Codex default model ID with dots remains bounded and valid',()=>{
  const p=createP2ReadOnlyProtocol({cwd,model:'gpt-6.1-sol'});
  const m=p.accept({id:1,result:{}});
  assert.equal(m[1].params.model,'gpt-6.1-sol');
  failure(()=>createP2ReadOnlyProtocol({cwd,model:'gpt/6.1-sol'}),
    /Exact absolute synthetic root and bounded model ID/);
});
