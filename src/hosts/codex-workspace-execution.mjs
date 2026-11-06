// Supervised UNPROTECTED Codex Host filesystem execution.
// Writes happen only in an ephemeral Controller-owned Candidate. This adapter
// inspects actual bytes instead of trusting model-reported patch content.
import path from 'node:path';
import { readdir, lstat, readFile, realpath } from 'node:fs/promises';
import { snapshotHostExecutable, requireSameHostExecutable } from './host-executable-identity.mjs';
import { hash, applyEdits } from '../alpha/contract.mjs';
import { runCodexReadOnlyTurn } from './codex-app-server-session.mjs';

const reject = reason => { const error=Error(reason); error.effectStatus='UNKNOWN_NO_REPLAY'; throw error; };
const MAX_FILES=1500,MAX_BYTES=32*1024*1024;

async function observeTree(root) {
  const resolved=await realpath(root);
  // A Windows Junction (or POSIX symlink) in an ancestor can redirect the
  // Candidate even when its final directory is regular. Inspect every
  // lexical parent before and after the Host Turn; this is not OS isolation.
  let ancestor=path.resolve(root);
  while (true) {
    const info=await lstat(ancestor);
    if (!info.isDirectory() || info.isSymbolicLink())
      reject('Candidate root ancestor link/Junction unsupported');
    const parent=path.dirname(ancestor);
    if (parent===ancestor) break;
    ancestor=parent;
  }
  // Windows temp paths can be 8.3 aliases of the same actual directory.
  // Verify the actual root entry rather than treating alias text as a link.
  // This is unprotected Local execution, never OS-enforced confinement.
  if (process.platform!=='win32' && resolved!==root)
    reject('Candidate root ancestor link unsupported');
  const entries=new Map(); let bytes=0;
  async function visit(rel='') {
    const where=path.join(root,rel);
    if ((await lstat(where)).isSymbolicLink()) reject('Linked candidate directory forbidden');
    for (const name of (await readdir(where)).sort()) {
      if (name === '.git') reject('Candidate must not contain a Git control directory');
      const relative=rel?rel+'/'+name:name, target=path.join(root,relative);
      const st=await lstat(target);
      if (st.isSymbolicLink()) reject('Candidate symlink/Junction forbidden');
      if (st.isDirectory()) await visit(relative);
      else if (st.isFile()) {
        // A hard link is regular according to lstat, but its inode may be
        // shared with a path outside the bounded Candidate. Never accept
        // either the pre-grant snapshot or the post-Turn receipt for one.
        if (st.nlink!==1) reject('Candidate hard-linked file forbidden');
        bytes+=st.size;
        if (bytes>MAX_BYTES || entries.size>=MAX_FILES) reject('Candidate snapshot bound exceeded');
        entries.set(relative,{mode:st.mode & 0o777,bytes:await readFile(target)});
      } else reject('Candidate non-regular filesystem entry forbidden');
    }
  }
  await visit();
  return entries;
}
export async function captureCodexWorkspaceEdits({candidateDirectory, contract, context,
  transport, model, executable, approved, approvedExecutable,
  timeoutMs=120000, cancelled=()=>false}={}) {
  if (!approved || typeof approved !== 'function' ||
      !path.isAbsolute(candidateDirectory??'') || !contract ||
      !context || !path.isAbsolute(executable??'') ||
      typeof model !== 'string' || !model || typeof transport !== 'function')
    reject('Exact trusted supervised Host execution configuration required');
  // Bind the reviewed grant to the real Host executable, not only the model
  // and workspace. A mutable directory alias cannot redirect a write-enabled Turn.
  const pinnedExecutable=await snapshotHostExecutable(executable);
  if (approvedExecutable &&
      (pinnedExecutable.resolvedPath !== approvedExecutable.resolvedPath ||
       pinnedExecutable.sha256 !== approvedExecutable.sha256))
    reject('Host executable changed since Workflow approval');
  const before=await observeTree(candidateDirectory);
  const allowed=new Set(contract.files);
  const contextHash=hash(context);
  const initialTree = [...before].map(([name,entry])=>[name,hash(entry.bytes),entry.mode]);
  for(const name of allowed){
    if (!before.has(name) || !context[name] || !Buffer.from(context[name]).equals(before.get(name).bytes))
      reject('Candidate source/context does not match approved WorkItem');
  }
  const approvedScope=Object.freeze({kind:'HOST_WORKSPACE_WRITE_UNPROTECTED_V1',
    root:candidateDirectory,baseTreeHash:hash(initialTree),
    executablePath:executable,executableResolvedPath:pinnedExecutable.resolvedPath,
    executableSha256:pinnedExecutable.sha256,
    contractHash:hash(contract),allowedFiles:Object.freeze([...allowed].sort()),model,timeoutMs});
  if(await approved(approvedScope)!==true) reject('Supervised Host workspace write not granted');
  // Grant review can be asynchronous. Never hand the Host a write-enabled Turn
  // for a Candidate that changed while its exact base-tree grant was pending.
  // This is a drift check, not an OS sandbox or a Host permission substitute.
  try { await requireSameHostExecutable(executable,pinnedExecutable); }
  catch { reject('Host executable changed during workspace authorization'); }
  const afterGrant=await observeTree(candidateDirectory);
  const afterGrantHash=hash([...afterGrant].map(([name,entry])=>
    [name,hash(entry.bytes),entry.mode]));
  if(afterGrantHash!==approvedScope.baseTreeHash)
    reject('Candidate snapshot changed during Host workspace authorization');
  // Async owner review must not let the caller rewrite the contract or the
  // Host context while the reviewed Candidate bytes remain unchanged.
  if(hash(contract)!==approvedScope.contractHash || hash(context)!==contextHash)
    reject('Contract or Host context changed during workspace authorization');
  if(cancelled())reject('Candidate execution cancelled before Host Turn');
  const prompt=JSON.stringify({goal:contract.goal,approvedScope,files:contract.files,
    instructions:'Use Codex Host tools only to edit the explicitly allowed existing source files under this candidate root. '+
      'Do not change tests, install dependencies, access network/credentials, commit, deploy or write outside root. '+
      'Return JSON with summary only; test and objective acceptance are performed independently by CodeFleet.'});
  const receipt=await transport({executable:pinnedExecutable.resolvedPath,cwd:candidateDirectory,model,prompt,
    outputSchema:{type:'object',additionalProperties:false,required:['summary'],properties:{summary:{type:'string'}}},
    timeoutMs,cancelled,workspaceWrite:true});
  if (cancelled()) reject('Host Turn cancelled before Candidate acceptance');
  try { await requireSameHostExecutable(executable,pinnedExecutable); }
  catch { reject('Host executable changed during workspace Host Turn'); }
  if (receipt?.terminalStatus!=='completed' || receipt.authority!=='PROVIDER_REPORTED_ONLY' ||
      receipt.protectedVerified!==false || !receipt.threadId || !receipt.turnId ||
      receipt.executionMode!=='HOST_WORKSPACE_WRITE_UNPROTECTED')
    reject('Missing live Host filesystem Turn receipt');
  const after=await observeTree(candidateDirectory);
  if (before.size!==after.size || [...before.keys()].some(file=>!after.has(file)))
    reject('Host introduced or deleted files outside approved replace-only scope');
  const edits=[];
  for(const [file,prior] of before){
    const current=after.get(file);
    if(current.mode!==prior.mode)reject('Host changed file mode');
    if(!current.bytes.equals(prior.bytes)){
      if(!allowed.has(file))reject('Host changed out-of-scope file');
      const oldText=prior.bytes.toString('utf8'),newText=current.bytes.toString('utf8');
      if(!oldText || Buffer.from(oldText).compare(prior.bytes)!==0 ||
          Buffer.from(newText).compare(current.bytes)!==0 ||
          newText.includes('\0') || Buffer.byteLength(newText)>64000)
        reject('Host changed binary or oversized source');
      edits.push({path:file,oldText,newText});
    }
  }
  if(!edits.length)reject('Host Turn did not produce a source change');
  const proposal={summary:'Changes observed from isolated Codex Host filesystem',edits};
  // The Turn may also outlive mutable coordinator input. Accept only the
  // approved contract/context and a still-current cancellation fence.
  if(hash(contract)!==approvedScope.contractHash || hash(context)!==contextHash)
    reject('Approved Contract or Host context changed during Host Turn');
  if(cancelled()) reject('Host Turn cancelled before Candidate acceptance');
  // Keep the legacy Proposal/Verifier pipeline: verify exact edit scope on
  // original baseline. Never classify tool events as independent Evidence.
  applyEdits(contract,context,proposal);
  return { proposal, hostReceipt:{
    threadId:receipt.threadId,turnId:receipt.turnId,terminalStatus:'completed',
    toolItems:receipt.toolItems??[],authority:'PROVIDER_REPORTED_ONLY',
    source:'ACTUAL_CANDIDATE_BYTE_OBSERVATION',candidateBeforeHash:hash(initialTree),
    protectedVerified:false
  },mode:'HOST_WORKSPACE_WRITE_UNPROTECTED',cost:null,
    hostSessionCostStatus:'UNKNOWN' };
}
export const supervisedWorkspaceTransport = runCodexReadOnlyTurn;
