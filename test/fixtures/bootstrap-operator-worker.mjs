// Internal fixture dispatcher, not registered with any public Host/IPC route.
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Store } from '../../src/alpha/store.mjs';
import { enableTasks } from '../../src/product/tasks.mjs';
import { BootstrapOperator } from '../../src/hosts/bootstrap-operator.mjs';
import { continueOfflineWorkItem } from '../../src/product/continuation.mjs';
import { repairOfflineWorkItem } from '../../src/product/repair.mjs';
const input=JSON.parse(process.argv[2]), store=new Store(input.state); enableTasks(store);
let bridge;
try {
  if(input.fault!=='missing-runtime') {
    bridge=new BootstrapOperator(store,{operatorKeys:[input.publicKey],profile:input.profile??'p0-3-fixture'});
    bridge.enroll(input.taskId);
  }
  const pause=async()=>{await writeFile(input.marker,'reserved');await new Promise(()=>setInterval(()=>{},1000));};
  const hooks={};
  if(input.fault==='kill-reserved') hooks.reserved=pause;
  if(input.fault==='kill-started') hooks.beforeEvidence=pause;
  if(input.fault==='revoke-before-spawn') hooks.beforeSpawn=()=>bridge.revoke(input.revocation);
  if(input.fault==='revoke-after-result') hooks.beforeCommit=()=>bridge.revoke(input.revocation);
  if(input.fault==='lease') hooks.reserved=()=>store.db.prepare("UPDATE runs SET owner='replaced' WHERE id=?").run(input.taskId);
  if(input.fault==='clock-backwards') hooks.reserved=r=>{Date.now=()=>r.reservedAt-5000;};
  let result;
  if(input.mode==='repair') {
    const review=async request=>{
      if(input.fault==='no-repair-approval'&&request.action.kind==='REPAIR_FILESET') return null;
      const p=spawnSync(process.execPath,[path.resolve('test/fixtures/bootstrap-signer.mjs'),input.policyFile],{input:JSON.stringify(request),encoding:'utf8',windowsHide:true});
      if(p.status!==0) throw Error(p.stderr);return JSON.parse(p.stdout);
    };
    result=await repairOfflineWorkItem(store,input.taskId,{proposal:input.proposal,request:input.request,operator:bridge.repairOperator(review)});
  } else result=await continueOfflineWorkItem(store,input.taskId,{decisionId:input.decisionId,requestId:input.requestId,request:input.request,hooks});
  console.log(JSON.stringify(result));
} catch(error) { console.log(JSON.stringify({status:'BLOCKED',reason:error.message})); }
finally {bridge?.close();store.close();}
