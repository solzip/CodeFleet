import {createInterface} from 'node:readline/promises';
import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {hash} from '../alpha/contract.mjs';
import {acceptNativeFilesReview,acceptNativeLocalReview} from './native-local.mjs';
import {acceptWorkClose,declineWorkReview,isWork,workTaskForReference} from './work-review.mjs';

export function renderOwnerCommand(executable,args){
  const quote=v=>{if(typeof v!=='string'||/[\0\r\n]/.test(v))throw Error('Invalid Owner argv');return "'"+v.replaceAll("'","''")+"'";};
  return '& '+[executable,...args].map(quote).join(' ');
}
export async function ownerReview(store,ref,trust,{input=process.stdin,output=process.stdout,cancelled=()=>false}={}){
  if(!input.isTTY||!output.isTTY)throw Error('WORK_OWNER_TTY_REQUIRED');
  const packet=store.readArtifact(ref),review=packet.review?.review??packet.review;
  if(!review||packet.reviewHash!==trust&&packet.review?.reviewHash!==trust||hash(review)!==trust)throw Error('WORK_EXACT_REVIEW_REQUIRED');
  const t=workTaskForReference(store,ref);if(!t||!isWork(t))throw Error('WORK_PROFILE_REQUIRED');
  const kind=review.kind==='NativeFilesReview'?'APPLY':review.kind==='WorkCloseReview'?'CLOSE':packet.kind==='NativeLocalReviewPacket'?'VERIFY':null;
  if(!kind)throw Error('WORK_REVIEW_KIND');
  const expiresAt=review.expiresAt;
  if(!Number.isSafeInteger(expiresAt)||!Number.isFinite(new Date(expiresAt).getTime()))throw Error('WORK_REVIEW_EXPIRY_INVALID');
  const requireFresh=()=>{
    if(Date.now()>=expiresAt){
      output.write('Review EXPIRED. No approval was issued. Prepare a fresh review of the current candidate; do not repeat the model Turn.\n');
      throw Error('WORK_REVIEW_EXPIRED');
    }
  };
  requireFresh();
  const files=review.contentRef?store.readArtifact(review.contentRef).files:undefined;
  const changes=[];
  for(const file of files??[]){
    const target=path.join(t.repo,...file.path.split('/'));
    if(!(await lstat(target)).isFile()||await realpath(target)!==target)throw Error('WORK_REVIEW_PATH_CHANGED');
    const before=await readFile(target);
    if(hash(before)!==file.baseSha256)throw Error('WORK_REVIEW_SOURCE_CHANGED');
    changes.push({path:file.path,before:before.toString('utf8'),after:file.content,baseSha256:file.baseSha256});
  }
  output.write(JSON.stringify({review,profile:t.workProfileRef?store.readArtifact(t.workProfileRef):null,request:store.readArtifact(t.workRequestRef),changes,warning:'UNPROTECTED Local effects. Review exact scope; this is not Protected Evidence.'},null,2)+'\n');
  requireFresh();
  output.write('Enter confirmation in THIS terminal, not in Host chat.\n'+
    'Use uppercase '+kind+' and press Enter. Lowercase input, EOF or any other answer declines.\n'+
    'Review expires at '+new Date(expiresAt).toISOString()+' (about '+Math.max(0,Math.ceil((expiresAt-Date.now())/1000))+' seconds remaining).\n');
  const rl=createInterface({input,output}),abort=new AbortController();
  const closed=()=>abort.abort();rl.once('close',closed);
  let answer='';
  try{answer=await rl.question('Type '+kind+' (UPPERCASE) to accept; any other answer declines: ',{signal:abort.signal});}
  catch{}
  finally{rl.removeListener('close',closed);rl.close();}
  if(answer!==kind||cancelled()){
    const declined=declineWorkReview(store,ref);
    output.write('Review DECLINED. No new effect was authorized by this decision. A successful command exit records the decline, not application or verification.\n'+
      'To continue, prepare a fresh review of the current candidate; do not repeat the model Turn.\n');
    return declined;
  }
  requireFresh();
  const opts={trust,acknowledgeUnisolated:true,cancelled};
  return kind==='APPLY'?acceptNativeFilesReview(store,ref,opts):kind==='VERIFY'?acceptNativeLocalReview(store,ref,opts):acceptWorkClose(store,ref,opts);
}
