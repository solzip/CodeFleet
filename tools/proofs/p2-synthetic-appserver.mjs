#!/usr/bin/env node
// Deterministic NO-HOST fake App Server for offline P2 transport tests.
// Never imports/executes Codex, reads credentials, opens sockets or writes files.
import { createInterface } from 'node:readline';

const scenario=process.env.CODEFLEET_P2_FAKE_SCENARIO || 'success';
const available=new Set([
  'success','metadata','tool','server_request','wrong_turn','unknown_notification',
  'bad_sandbox','trailing','incomplete','nonzero','duplicate','stderr','hang',
  'early_exit','bad_output','oversized'
]);
if(!available.has(scenario)){process.exitCode=2;}
else {
  const threadId='synthetic_thread_1',turnId='synthetic_turn_1';
  let phase=0;
  const write=v=>process.stdout.write(JSON.stringify(v)+'\n');
  const items=[{id:'user_1',type:'userMessage'},
    {id:'agent_1',type:'agentMessage',text: scenario==='bad_output' ?
      '{"proof":"WRONG"}':'{"proof":"P2_READ_ONLY_REPLY"}'}];
  const completed=()=>write({method:'turn/completed',params:{
    threadId,turnId,turn:{id:turnId,status:'completed',itemsView:'full',items}
  }});
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  input.on('line',line=>{
    let message;try{message=JSON.parse(line)}catch{process.exitCode=4;input.close();return;}
    if(phase===0 && message.id===1 && message.method==='initialize'){
      phase=1;
      write({id:1,result:{ok:true}});
      if(scenario==='early_exit'){input.close();process.exitCode=8;}
    } else if(phase===1 && message.method==='initialized'){
      // Notification only, not a request.
    } else if(phase===1 && message.id===2 && message.method==='thread/start'){
      phase=2;
      const {cwd,model}=message.params;
      write({id:2,result:{
        thread:{id:threadId,ephemeral:true,cwd},cwd,model,
        approvalPolicy:'never',
        sandbox:scenario==='bad_sandbox'
          ? {type:'workspaceWrite',networkAccess:true}
          : {type:'readOnly',networkAccess:false}
      }});
    } else if(phase===2 && message.id===3 && message.method==='turn/start'){
      phase=3;
      write({id:3,result:{turn:{id:turnId}}});
      if(scenario==='hang'||scenario==='incomplete')return;
      if(scenario==='metadata')write({method:'account/updated',params:{
        sensitiveSyntheticToken:'DO_NOT_COPY_PRIVATE_TOKEN_FAKE_VALUE'
      }});
      if(scenario==='tool')write({method:'item/started',params:{
        threadId,turnId,item:{id:'bad_tool',type:'commandExecution'}
      }});
      if(scenario==='server_request')write({id:93,
        method:'item/commandExecution/requestApproval',params:{}});
      if(scenario==='unknown_notification')write({
        method:'thread/section/changed',params:{threadId}});
      write({method:'turn/started',params:{threadId,
        turnId:scenario==='wrong_turn'?'incorrect_turn':turnId}});
      write({method:'item/completed',params:{threadId,turnId,item:items[1]}});
      completed();
      if(scenario==='duplicate')completed();
      if(scenario==='trailing')process.stdout.write('{"unfinished":');
      if(scenario==='oversized')process.stdout.write('Z'.repeat(1100000));
      if(scenario==='stderr')process.stderr.write('SYNTHETIC_STDERR_NOT_CAPTURED');
    } else if(message.method!=='initialized'){
      process.exitCode=5;input.close();
    }
  });
  input.on('close',()=>{if(scenario==='nonzero')process.exitCode=7;});
}
