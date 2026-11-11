#!/usr/bin/env node
// P2 read-only *protocol candidate*, offline-only. No spawn, Host permission,
// paid model call, approval acquisition, Fixture write, or replay path.
import { isAbsolute, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

const MAX_LINE=256*1024,MAX_STDOUT=1024*1024,MAX_EVENTS=128,MAX_OUTPUT=4096;
const MAX_PROMPT=1024;
const SIMPLE_ID=/^[A-Za-z0-9_-]{1,128}$/;
const ALLOWED_METADATA=new Set([
  'account/updated','account/rateLimits/updated','remoteControl/status/changed'
]);
const INERT_ITEM_TYPES=new Set(['userMessage','reasoning','agentMessage']);
const FINAL_PROOF='P2_READ_ONLY_REPLY';
export const P2_FIXED_INPUT='Return only a JSON object with property proof equal to P2_READ_ONLY_REPLY. Do not call tools, execute commands, access files or network, write or change resources, or request approvals.';
export const P2_OUTPUT_SCHEMA=Object.freeze({
  type:'object',additionalProperties:false,required:['proof'],
  properties:{proof:{type:'string',enum:[FINAL_PROOF]}}
});

export class P2ProtocolError extends Error {
  constructor(reason){super(reason);this.name='P2ProtocolError';this.effectStatus='UNVERIFIED';this.replayAllowed=false;}
}
const fail=reason=>{throw new P2ProtocolError(reason)};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&SIMPLE_ID.test(v);
const exactOutput=text=>{
  if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>MAX_OUTPUT)fail('P2 final text missing or oversized');
  let parsed;
  try{parsed=JSON.parse(text)}catch{fail('P2 final text not valid JSON')}
  if(!object(parsed)||Object.keys(parsed).length!==1||parsed.proof!==FINAL_PROOF)
    fail('P2 final text does not match exact approved schema');
  return true;
};
const copy=value=>structuredClone(value);
export function createP2ReadOnlyProtocol({cwd,model}={}){
  if(typeof cwd!=='string'||!isAbsolute(cwd)||cwd.length>4096||!id(model)||
      Buffer.byteLength(P2_FIXED_INPUT,'utf8')>MAX_PROMPT)
    fail('Exact absolute synthetic root and bounded model ID required');
  let phase='WAIT_INITIALIZE',threadId=null,turnId=null,notes=new Map(),turnStarted=false;
  let finalText=null;
  const count=method=>notes.set(method,(notes.get(method)??0)+1);
  const enforceBound=params=>{
    if(!object(params)||params.threadId!==threadId||params.turnId!==turnId)
      fail('P2 event Thread/Turn mismatch');
  };
  const init={id:1,method:'initialize',params:{clientInfo:{
    name:'codefleet_p2_offline',title:'CodeFleet P2 Candidate',version:'p2'
  }}};
  return {
    start(){return [copy(init)]},
    get phase(){return phase},
    get completed(){return phase==='COMPLETE'},
    accept(message){
      if(!object(message))fail('P2 JSONL must be an object');
      if(phase==='COMPLETE')fail('P2 unsolicited traffic after completed Turn');
      if(Object.hasOwn(message,'method')){
        if(Object.hasOwn(message,'id'))fail('P2 unsolicited server request or approval');
        const method=message.method;
        if(ALLOWED_METADATA.has(method)){count(method);return []}
        if(method==='turn/started'){
          if(phase!=='RUNNING'||turnStarted)fail('P2 unexpected or duplicate Turn start');
          enforceBound(message.params);turnStarted=true;count(method);return [];
        }
        if(method==='item/started'||method==='item/completed'){
          if(phase!=='RUNNING')fail('P2 item occurred outside reserved Turn');
          enforceBound(message.params);
          const item=message.params.item;
          if(!object(item)||!id(item.id)||!INERT_ITEM_TYPES.has(item.type))
            fail('P2 Host tool or unknown item encountered');
          count(method);return [];
        }
        if(method==='item/agentMessage/delta'){
          if(phase!=='RUNNING')fail('P2 out-of-phase delta');
          enforceBound(message.params);
          if(!id(message.params.itemId)||typeof message.params.delta!=='string')
            fail('P2 unbound or invalid message delta');
          count(method);return [];
        }
        if(method==='turn/completed'){
          if(phase!=='RUNNING')fail('P2 unexpected Turn completion');
          enforceBound(message.params);
          const turn=message.params.turn;
          if(!object(turn)||turn.id!==turnId||turn.status!=='completed'||
              turn.itemsView!=='full'||!Array.isArray(turn.items)||
              turn.items.length<1||turn.items.length>20)
            fail('P2 terminal Turn lacks a full completed item view');
          const agentItems=[];
          for(const item of turn.items){
            if(!object(item)||!id(item.id)||!INERT_ITEM_TYPES.has(item.type))
              fail('P2 terminal Turn includes a tool or unknown item');
            if(item.type==='agentMessage')agentItems.push(item);
          }
          if(agentItems.length!==1)fail('P2 expected exactly one final agent message');
          exactOutput(agentItems[0].text);
          finalText=FINAL_PROOF;
          count(method);phase='COMPLETE';return [];
        }
        // New 0.167.0 notification thread/section/changed is NOT authorized.
        fail('P2 unapproved server notification or tool effect');
      }
      if(Object.hasOwn(message,'error')||!object(message.result))
        fail('P2 failed or malformed RPC response');
      if(phase==='WAIT_INITIALIZE'&&message.id===1){
        phase='WAIT_THREAD';
        return [
          {method:'initialized',params:{}},
          {id:2,method:'thread/start',params:{
            cwd,model,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',
            serviceName:'codefleet-p2-proof'
          }}
        ];
      }
      if(phase==='WAIT_THREAD'&&message.id===2){
        const result=message.result,thread=result.thread;
        if(!object(thread)||!id(thread.id)||thread.ephemeral!==true||
            thread.cwd!==cwd||result.cwd!==cwd||result.model!==model||
            result.approvalPolicy!=='never'||!object(result.sandbox)||
            result.sandbox.type!=='readOnly'||result.sandbox.networkAccess!==false)
          fail('P2 effective Thread policy mismatch');
        threadId=thread.id;phase='WAIT_TURN';
        return [{id:3,method:'turn/start',params:{
          threadId,model,cwd,approvalPolicy:'never',
          sandboxPolicy:{type:'readOnly',networkAccess:false},
          input:[{type:'text',text:P2_FIXED_INPUT,text_elements:[]}],
          outputSchema:copy(P2_OUTPUT_SCHEMA)
        }}];
      }
      if(phase==='WAIT_TURN'&&message.id===3){
        const turn=message.result.turn;
        if(!object(turn)||!id(turn.id))fail('P2 response has no bounded Turn ID');
        turnId=turn.id;phase='RUNNING';return [];
      }
      fail('P2 duplicate, unexpected or mismatched response ID');
    },
    receipt(){
      if(phase!=='COMPLETE'||!threadId||!turnId||finalText!==FINAL_PROOF)
        fail('P2 completed synthetic Turn unavailable');
      return Object.freeze({
        status:'P2_OFFLINE_PROTOCOL_MATCHED_ONLY',
        threadId,turnId,terminalStatus:'completed',proof:finalText,
        notificationCounts:Object.fromEntries([...notes].sort(([a],[b])=>a.localeCompare(b))),
        simulated:true,modelTurnsActuallyRun:0,appServerStarted:false,
        toolCallsObserved:0,costStatus:'UNKNOWN',executionAuthorized:false,
        ownerApproval:'NOT_GRANTED',hostLiveVerified:false,
        next:'SEPARATE_P2_CLIENT_COST_AND_OWNER_APPROVAL_REQUIRED'
      });
    }
  };
}

// Streaming JSONL parser for disposable *fake* process tests. A real Host
// transport requires separately reviewed lifecycle and owner execution gates.
export function createP2OfflineJsonlReader(protocol){
  if(!protocol||typeof protocol.accept!=='function')fail('P2 parser requires trusted protocol');
  const decoder=new StringDecoder('utf8');
  let text='',bytes=0,events=0,finished=false;
  const emit=line=>{
    if(!line.trim())fail('P2 empty JSONL frame');
    if(Buffer.byteLength(line,'utf8')>MAX_LINE)fail('P2 JSONL line size exceeded');
    let message;
    try{message=JSON.parse(line)}catch{fail('P2 malformed JSONL')}
    events++;
    if(events>MAX_EVENTS)fail('P2 event budget exceeded');
    return protocol.accept(message);
  };
  return {
    push(chunk){
      if(finished||!Buffer.isBuffer(chunk))fail('P2 invalid or late stdout chunk');
      bytes+=chunk.length;
      if(bytes>MAX_STDOUT)fail('P2 stdout limit exceeded');
      text+=decoder.write(chunk);
      if(Buffer.byteLength(text,'utf8')>MAX_LINE&&!text.includes('\n'))
        fail('P2 JSONL line size exceeded');
      const lines=text.split(/\r?\n/);text=lines.pop()??'';
      const out=[];
      for(const line of lines)out.push(...emit(line));
      return out;
    },
    close({exitCode,signal=null}={}){
      if(finished)fail('P2 duplicate stdout close');
      finished=true;
      text+=decoder.end();
      if(text.trim())fail('P2 unterminated JSONL after close');
      if(exitCode!==0||signal!==null||!protocol.completed)
        fail('P2 incomplete or abnormal synthetic process close');
      return protocol.receipt();
    }
  };
}
export function main(argv=process.argv.slice(2)){
  if(!Array.isArray(argv)||argv.length!==0)
    fail('P2 has no public execute, model or grant flags');
  return {
    status:'P2_OFFLINE_PROTOCOL_ONLY',
    protocolVersion:'rust-v0.167.0',
    nativeCodexStarted:false,modelTurnsActuallyRun:0,
    costStatus:'UNKNOWN',executionAuthorized:false,
    ownerApproval:'NOT_GRANTED',hostLiveVerified:false,
    liveTransportAvailable:false,
    next:'REVIEW_NATIVE_HOST_PERMISSIONS_COST_MODEL_AND_P2_CLIENT'
  };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{process.stdout.write(JSON.stringify(main())+'\n')}
  catch{process.stdout.write(JSON.stringify({
    status:'P2_OFFLINE_BLOCKED',nativeCodexStarted:false,
    modelTurnsActuallyRun:0,executionAuthorized:false,ownerApproval:'NOT_GRANTED'
  })+'\n');process.exitCode=2}
}
