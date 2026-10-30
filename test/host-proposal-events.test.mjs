import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexProposalEvents,proposalDispatchMessages,assessCodexProposalBudget} from '../scripts/lib/codex-proposal-events.mjs';

test('Host proposal budget distinguishes runner bounds from post-turn tokens and blocks automatic acceptance',()=>{
 const limits={maxPromptBytes:8000,maxDurationMs:60000,maxInputTokens:8000,maxOutputTokens:4000,maxRootTurns:1};
 const evaluate=(overrides={})=>assessCodexProposalBudget({promptBytes:4000,elapsedMs:10000,rootTurns:1,
  tokenUsage:{total:{inputTokens:7000,outputTokens:500}},limits,...overrides});
 const within=evaluate();assert.equal(within.status,'WITHIN_OBSERVED_LIMITS');
 assert.equal(within.enforcement.inputTokens,'HOST_POSTTURN_OBSERVATION_ONLY');
 assert.equal(within.automaticAcceptanceAllowed,false);
 const exceeded=evaluate({tokenUsage:{total:{inputTokens:9267,outputTokens:473}}});
 assert.deepEqual(exceeded.violations,['OBSERVED_INPUT_TOKENS_EXCEEDED']);
 assert.equal(exceeded.status,'POLICY_VIOLATION');
 assert.equal(evaluate({promptBytes:9000}).violations[0],'PROMPT_BYTES_EXCEEDED');
 const historical=evaluate({promptBytes:9000,promptPreflightApplied:false});
 assert.equal(historical.status,'WITHIN_OBSERVED_LIMITS');
 assert.equal(historical.enforcement.promptBytes,'NOT_APPLIED_AT_THIS_TURN');
 assert.equal(historical.wouldExceedCurrentPromptByteCeiling,true);
 assert.equal(evaluate({elapsedMs:60001}).violations[0],'DURATION_EXCEEDED');
 assert.equal(evaluate({rootTurns:2}).violations[0],'ROOT_TURN_COUNT_MISMATCH');
 assert.equal(evaluate({tokenUsage:null}).status,'NOT_VERIFIED');
 assert.throws(()=>evaluate({promptBytes:-1}),/Invalid Host proposal budget/);
});

const event=(method,threadId,item)=>({method,params:{threadId,...(method.startsWith('turn/')?{turn:item}:{item})}});
const start=(o,id,t,at)=>o.observe(event('turn/started',id,{id:t}),at);
const end=(o,id,t,at,status='completed')=>o.observe(event('turn/completed',id,{id:t,status,error:null,items:[]}),at);
test('single-agent observation permits one root turn and rejects every spawn',()=>{
 const o=new CodexProposalEvents('root',{maxChildren:0});start(o,'root','r',0);end(o,'root','r',10);
 assert.equal(o.snapshot().complete,true);assert.equal(o.snapshot().children.length,0);
 o.observe(event('rawResponseItem/completed','root',{type:'function_call',call_id:'extra',name:'spawn_agent'}),11);
 assert.equal(o.snapshot().shouldStop,true);
});
function spawn(o,id,at,callId='call-'+id){
 const item={id:callId,type:'subAgentActivity',kind:'started',agentThreadId:id,agentPath:'/root/'+id,model:'host-model',reasoningEffort:'medium'};
 o.observe(event('item/started','root',item),at);
 o.observe(event('item/completed','root',item),at+1);
}
test('current Host activity and old spawn events coalesce, concurrent turns are measured',()=>{
 const o=new CodexProposalEvents('root');start(o,'root','r',0);spawn(o,'a',10);start(o,'a','a1',20);
 o.observe(event('item/completed','root',{id:'call-a',type:'collabAgentToolCall',tool:'spawnAgent',senderThreadId:'root',receiverThreadIds:['a']}),21);
 spawn(o,'b',30);start(o,'b','b1',40);end(o,'a','a1',100);end(o,'b','b1',140);end(o,'root','r',150);
 const result=o.snapshot();assert.equal(result.status,'PROPOSALS_RETURNED');assert.equal(result.spawnRequests,2);
 assert.equal(result.children.length,2);assert.equal(result.overlapMs,60);assert.equal(result.executionGranted,false);
});
test('duplicate activity and completion delivery cannot count a second child or turn',()=>{
 const o=new CodexProposalEvents('root');start(o,'root','r',0);spawn(o,'a',10);start(o,'a','a1',20);end(o,'a','a1',30);
 spawn(o,'a',40);end(o,'a','a1',50);assert.equal(o.snapshot().children.length,1);assert.equal(o.snapshot().spawnRequests,1);
 assert.equal(o.snapshot().shouldStop,false);assert.equal(o.snapshot().status,'RECONCILE');
});
test('raw wait_agent and normalized wait identify one call, including repeated event delivery',()=>{
 const o=new CodexProposalEvents('root');
 const raw=event('rawResponseItem/completed','root',{type:'function_call',call_id:'w',name:'wait_agent'});
 const pending=event('item/started','root',{id:'w',type:'collabAgentToolCall',tool:'wait',status:'inProgress',senderThreadId:'root',receiverThreadIds:[]});
 const complete=event('item/completed','root',{...pending.params.item,status:'completed'});
 for(const [i,e] of [raw,pending,complete,raw,pending,complete].entries())o.observe(e,i);
 assert.equal(o.snapshot().shouldStop,false);assert.equal(o.calls.size,1);
});
test('conflicting identities, excess creation and child delegation fail closed',()=>{
 for(const mutate of [o=>spawn(o,'b',30,'call-a'),o=>{spawn(o,'b',30);spawn(o,'c',40);},
 o=>o.observe(event('rawResponseItem/completed','a',{type:'function_call',call_id:'nested',name:'spawn_agent'}),30)]){
  const o=new CodexProposalEvents('root');start(o,'root','r',0);spawn(o,'a',10);mutate(o);assert.equal(o.snapshot().shouldStop,true);
 }
});
test('Resume, shell/file tools and unexpected actions are rejected on observation',()=>{
 for(const [sender,item] of [['root',{type:'function_call',call_id:'x',name:'resume_agent'}],
 ['a',{type:'function_call',call_id:'x',name:'exec_command'}]]){
  const o=new CodexProposalEvents('root');spawn(o,'a',0);o.observe(event('rawResponseItem/completed',sender,item),10);assert.equal(o.snapshot().shouldStop,true);
 }
 const o=new CodexProposalEvents('root');o.observe(event('item/started','root',{id:'x',type:'fileChange'}),0);assert.equal(o.snapshot().shouldStop,true);
});
test('missing return, timeout, clock rollback and conflicting turn cannot become success',()=>{
 const o=new CodexProposalEvents('root',{childTimeoutMs:100});spawn(o,'a',0);start(o,'a','a1',10);
 assert.equal(o.snapshot().status,'RECONCILE');assert.equal(o.checkDeadline(101).shouldStop,true);
 const p=new CodexProposalEvents('root');start(p,'root','r',10);start(p,'root','r2',20);assert.equal(p.snapshot().shouldStop,true);
 const q=new CodexProposalEvents('root');start(q,'root','r',10);q.checkDeadline(9);assert.equal(q.snapshot().shouldStop,true);
 const r=new CodexProposalEvents('root');r.observe(event('rawResponseItem/completed','root',{type:'function_call',call_id:'x',name:'spawn_agent'}),0);
 assert.equal(r.checkDeadline(300001).shouldStop,true);assert.equal(r.snapshot().unresolved.length,1);
});
test('activity completed without a successful turn is unresolved; late turn completions retain timeout',()=>{
 const o=new CodexProposalEvents('root',{childTimeoutMs:100});spawn(o,'a',0);start(o,'a','a1',10);
 o.observe(event('item/completed','root',{id:'done-a',type:'subAgentActivity',kind:'completed',agentThreadId:'a'}),30);
 assert.equal(o.snapshot().complete,false);end(o,'a','a1',120);assert.equal(o.checkDeadline(121).shouldStop,true);
});
test('serial fast children cannot be reported as parallel',()=>{
 const o=new CodexProposalEvents('root');start(o,'root','r',0);spawn(o,'a',10);start(o,'a','a1',20);end(o,'a','a1',30);
 spawn(o,'b',40);start(o,'b','b1',50);end(o,'b','b1',60);end(o,'root','r',70);
 assert.equal(o.snapshot().complete,true);assert.equal(o.snapshot().overlapMs,0);
});
test('dispatch references inherited exact context and rejects dependency/file conflicts',()=>{
 const batch={batchHash:'bound-batch',mode:'PARALLEL_PROPOSALS_ONLY',requests:[
  {item:{id:'a',files:['server.mjs'],dependencies:[]}}, {item:{id:'b',files:['src/todo.mjs'],dependencies:[]}}]};
 const messages=proposalDispatchMessages(batch);assert.equal(messages.length,2);
 assert.ok(messages.every(m=>m.fork_turns==='all'&&m.message.includes(batch.batchHash)&&m.message.length<700));
 assert.throws(()=>proposalDispatchMessages({...batch,requests:[batch.requests[0],{item:{...batch.requests[1].item,dependencies:['a']}}]}));
 assert.throws(()=>proposalDispatchMessages({...batch,requests:[batch.requests[0],{item:{...batch.requests[1].item,files:['SERVER.MJS']}}]}));
});
