import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeNewProjectFileset,validateBootstrapHostProposal,validateBootstrapHostRepairProposal,bootstrapFilesOutputSchema,bootstrapRepairOutputSchema } from '../src/hosts/codex-bootstrap-files.mjs';

const workflow={items:[{id:'create',kind:'local-edit',files:['src/index.js','test/index.test.js']}]};
const proposal=()=>({revision:3,itemId:'create',files:[
  {path:'src/index.js',content:'export const value = 1;'},
  {path:'test/index.test.js',content:'import test from "node:test";'}
]});
test('model Fileset can only propose the exact planned new-project paths',()=>{
 const result=validateBootstrapHostProposal(proposal(),workflow,'create',3);
 assert.equal(result.files.length,2);
 assert.deepEqual(result.files.map(f=>f.path),['src/index.js','test/index.test.js']);
 assert.equal(bootstrapFilesOutputSchema.required.includes('files'),true);
});
test('stale revision or WorkItem identity is rejected',()=>{
 assert.throws(()=>validateBootstrapHostProposal(proposal(),workflow,'other',3),/stale|unbound/);
 assert.throws(()=>validateBootstrapHostProposal(proposal(),workflow,'create',4),/stale|unbound/);
});
test('host cannot add unrelated or omit planned files',()=>{
 const altered=proposal();altered.files.push({path:'secret.txt',content:'unsafe'});
 assert.throws(()=>validateBootstrapHostProposal(altered,workflow,'create',3),/exactly|Fileset/);
 const missing=proposal();missing.files.pop();
 assert.throws(()=>validateBootstrapHostProposal(missing,workflow,'create',3),/exactly/);
});
test('binary contents or unsafe filenames are rejected before materialization',()=>{
 const binary=proposal();binary.files[0].content='x\0y';
 assert.throws(()=>validateBootstrapHostProposal(binary,workflow,'create',3),/Content/);
 const escape=proposal();escape.files[0].path='../escape.js';
 assert.throws(()=>validateBootstrapHostProposal(escape,workflow,'create',3),/Unsafe/);
});

import { rm, readFile, realpath, mkdtemp, symlink, unlink, writeFile, rename, mkdir, stat, link } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepared, built, request, approve } from './fixtures/bootstrap-reservation.mjs';
import { task, verifyTask } from '../src/product/tasks.mjs';
import { hash } from '../src/alpha/contract.mjs';
import { Store } from '../src/alpha/store.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { taskReport } from '../src/product/report.mjs';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';
import { createFiles, modifyFiles, preflightFiles } from '../src/workflow/bootstrap-files.mjs';

const proposedTodoFiles = [
  {path:'package.json',content:'{"type":"module"}\\n'},
  {path:'src/todo.mjs',content:'export const add = (list, value) => [...list, value];\\n'},
  {path:'test/todo.test.mjs',content:"import test from 'node:test';\\n"}
];
const fakeHostReceipt = (scope) => ({
  threadId:'synthetic-bootstrap-thread',turnId:'synthetic-bootstrap-turn',
  terminalStatus:'completed',authority:'PROVIDER_REPORTED_ONLY',
  protectedVerified:false,
  text:JSON.stringify({revision:scope.revision,itemId:scope.itemId,files:proposedTodoFiles})
});
const substitutePlan = f => {
  const current=task(f.store,f.id),plan=f.store.readArtifact(current.planRef);
  const replaced=f.store.artifact({...plan,unreviewedMetadata:'substituted after owner scope review'});
  f.store.db.prepare('UPDATE product_tasks SET body=? WHERE id=?')
    .run(JSON.stringify({...current,planRef:replaced}),f.id);
};

test('NEW_PROJECT trusted Fileset planning submits a proposal without materializing or granting execution', async t => {
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0,grants=0;
  const before=task(f.store,f.id);
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      grants++;
      assert.equal(scope.planRef,before.planRef);
      assert.equal(scope.workflowRef,before.bootstrap.workflowRef);
      assert.equal(scope.repo,f.dir);
      const repoStat=await stat(f.dir);
      assert.deepEqual(scope.repositoryIdentity,{
        dev:repoStat.dev,ino:repoStat.ino,birthtimeMs:repoStat.birthtimeMs
      });
      assert.equal(Object.isFrozen(scope.repositoryIdentity),true);
      assert.equal(scope.executablePath,process.execPath);
      assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
      assert.match(scope.executableSha256,/^[a-f0-9]{64}$/);
      assert.equal(scope.model,'SYNTHETIC_ONLY');
      assert.equal(scope.timeoutMs,90000);
      assert.deepEqual(scope.files,proposedTodoFiles.map(file=>file.path));
      assert.equal(Object.isFrozen(scope.files),true);
      assert.throws(()=>scope.files.push('secret.txt'),TypeError);
      return true;
    },
    transport:async request=>{
      hostTurns++;
      const prompt=JSON.parse(request.prompt);
      assert.equal(request.cwd,f.dir);
      assert.equal(request.executable,await realpath(process.execPath));
      assert.deepEqual(prompt.files,proposedTodoFiles.map(file=>file.path));
      return fakeHostReceipt(prompt);
    }
  });
  const proposed=await api.proposeBootstrapFiles(f.id,'todo');
  assert.equal(grants,1);
  assert.equal(hostTurns,1);
  assert.equal(proposed.materialized,false);
  assert.equal(proposed.executionGranted,false);
  assert.equal(proposed.modelCost,'UNKNOWN');
  assert.equal(f.store.get(proposed.approvalRequest.runId).state,'WAITING_APPROVAL');
  assert.equal(task(f.store,f.id).bootstrap.states.todo,'FILESET_PROPOSED');
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs'), 'utf8'),{code:'ENOENT'});
});

test('NEW_PROJECT Fileset owner grant cannot dispatch after an unreviewed Plan substitution',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      assert.equal(scope.planRef,task(f.store,f.id).planRef);
      substitutePlan(f);
      return true;
    },
    transport:async()=>{hostTurns++;throw Error('Host must not launch');}
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/scope changed/);
  assert.equal(hostTurns,0);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.equal(f.store.events(f.id).filter(event=>event.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,0);
});

test('NEW_PROJECT Host proposal cannot be submitted after the reviewed Plan changes during the Turn',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>true,
    transport:async request=>{
      hostTurns++;
      substitutePlan(f);
      return fakeHostReceipt(JSON.parse(request.prompt));
    }
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/scope changed/);
  assert.equal(hostTurns,1);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.deepEqual(
    f.store.events(f.id).filter(event=>event.type.startsWith('BOOTSTRAP_HOST_TURN_')).map(event=>event.type),
    ['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_RECONCILING']
  );
});

test('NEW_PROJECT rejects a non-file Host executable before grant or Turn', async t => {
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let grants=0,turns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:f.dir,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>{grants++;return true;},
    transport:async()=>{turns++;throw Error('Host must not run');}
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/regular file/);
  assert.equal(grants,0);
  assert.equal(turns,0);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,0);
});

async function linkedBootstrapHost(t) {
  const root=await mkdtemp(join(tmpdir(),'codefleet-bootstrap-host-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const alias=join(root,'codex-host'),replacement=join(root,'other-host');
  await writeFile(replacement,'synthetic replacement binary');
  try { await symlink(process.execPath,alias,'file'); }
  catch(error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) {
      t.skip('Host executable symlink unavailable on this runner');
      return null;
    }
    throw error;
  }
  return {alias,replacement};
}


test('NEW_PROJECT rejects in-place Host executable modification during owner review',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const executable=join(f.root,'synthetic-codex-executable');
  await writeFile(executable,'original synthetic binary');
  let turns=0;
  const api=createCodexMvpFacade(f.store,{
    executable,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      assert.equal(scope.executableResolvedPath,await realpath(executable));
      assert.match(scope.executableSha256,/^[a-f0-9]{64}$/);
      // Same canonical executable path; only the reviewed bytes change.
      await writeFile(executable,'replacement synthetic binary');
      return true;
    },
    transport:async()=>{turns++;throw Error('Host must not launch');}
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/executable changed/);
  assert.equal(turns,0);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,0);
});

test('NEW_PROJECT reconciles after in-place Host executable modification during Turn',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const executable=join(f.root,'synthetic-codex-executable');
  await writeFile(executable,'original synthetic binary');
  let turns=0;
  const api=createCodexMvpFacade(f.store,{
    executable,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>true,
    transport:async request=>{
      turns++;
      await writeFile(executable,'replacement synthetic binary');
      return fakeHostReceipt(JSON.parse(request.prompt));
    }
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/executable changed/);
  assert.equal(turns,1);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.deepEqual(
    f.store.events(f.id).filter(e=>e.type.startsWith('BOOTSTRAP_HOST_TURN_')).map(e=>e.type),
    ['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_RECONCILING']
  );
});

test('NEW_PROJECT rejects a replacement repository directory during owner grant before Host reservation',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>{
      await rename(f.dir,join(f.root,'original-repository'));
      await mkdir(f.dir);
      return true;
    },
    transport:async()=>{hostTurns++;throw Error('Host must not launch');}
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/repository identity changed/);
  assert.equal(hostTurns,0);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,0);
});

test('NEW_PROJECT reconciles rather than submitting when repository directory changes during Host Turn',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>true,
    transport:async request=>{
      hostTurns++;
      await rename(f.dir,join(f.root,'original-repository'));
      await mkdir(f.dir);
      return fakeHostReceipt(JSON.parse(request.prompt));
    }
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/repository identity changed/);
  assert.equal(hostTurns,1);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.deepEqual(
    f.store.events(f.id).filter(e=>e.type.startsWith('BOOTSTRAP_HOST_TURN_')).map(e=>e.type),
    ['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_RECONCILING']
  );
});

test('NEW_PROJECT Host grant cannot dispatch after executable alias substitution',async t=>{
  const linked=await linkedBootstrapHost(t);
  if (!linked) return;
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let turns=0,grants=0;
  const api=createCodexMvpFacade(f.store,{
    executable:linked.alias,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      grants++;
      assert.equal(scope.executablePath,linked.alias);
      assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
      await unlink(linked.alias);
      await symlink(linked.replacement,linked.alias,'file');
      return true;
    },
    transport:async()=>{turns++;throw Error('Host must not run');}
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/executable changed/);
  assert.equal(grants,1);
  assert.equal(turns,0);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,0);
});

test('NEW_PROJECT refuses a proposal after Host executable changes during Turn',async t=>{
  const linked=await linkedBootstrapHost(t);
  if (!linked) return;
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let turns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:linked.alias,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>true,
    transport:async request=>{
      turns++;
      assert.equal(request.executable,await realpath(process.execPath));
      await unlink(linked.alias);
      await symlink(linked.replacement,linked.alias,'file');
      return fakeHostReceipt(JSON.parse(request.prompt));
    }
  });
  await assert.rejects(api.proposeBootstrapFiles(f.id,'todo'),/executable changed/);
  assert.equal(turns,1);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.deepEqual(
    f.store.events(f.id).filter(e=>e.type.startsWith('BOOTSTRAP_HOST_TURN_')).map(e=>e.type),
    ['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_RECONCILING']
  );
});


test('NEW_PROJECT synthetic Host Filesets join reviewed materialization and real Local verification without Objective acceptance', async t => {
  // Only a fake Host transport is used. The local node:test subprocess runs
  // against this disposable Bootstrap fixture, never an actual Codex Turn.
  const f=await prepared({passing:true,protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const filesByItem={
    todo:[
      {path:'package.json',content:'{"type":"module"}\n'},
      {path:'src/todo.mjs',content:'export const add = (list, t) => [...list, t];\n'},
      {path:'test/todo.test.mjs',content:'import test from "node:test";\nimport assert from "node:assert/strict";\nimport {add} from "../src/todo.mjs";\ntest("todo append",()=>assert.deepEqual(add([], "item"),["item"]));\n'}
    ],
    calendar:[
      {path:'src/calendar.mjs',content:'export const byDate = () => ({});\n'},
      {path:'test/calendar.test.mjs',content:'import test from "node:test";\nimport assert from "node:assert/strict";\nimport {byDate} from "../src/calendar.mjs";\ntest("calendar grouping",()=>assert.deepEqual(byDate(),{}));\n'}
    ]
  };
  const turns=[],hostGrants=[],materializationGrants=[],verificationGrants=[];
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      hostGrants.push(scope.itemId);
      assert.deepEqual(scope.files,filesByItem[scope.itemId].map(file=>file.path));
      assert.equal(scope.repo,f.dir);
      return true;
    },
    transport:async request=>{
      const scope=JSON.parse(request.prompt);
      turns.push(scope.itemId);
      assert.equal(request.cwd,f.dir);
      assert.equal(request.executable,await realpath(process.execPath));
      return {...fakeHostReceipt(scope),
        text:JSON.stringify({revision:scope.revision,itemId:scope.itemId,
          files:filesByItem[scope.itemId]})};
    },
    authorizeBootstrapMaterialization:async scope=>{
      materializationGrants.push(scope.itemId);
      assert.equal(scope.protection,'UNPROTECTED');
      assert.equal(scope.repo,f.dir);
      assert.deepEqual(scope.files.map(file=>file.path),
        filesByItem[scope.itemId].map(file=>file.path));
      assert.deepEqual(scope.files.map(file=>file.content),
        filesByItem[scope.itemId].map(file=>file.content));
      return true;
    },
    authorizeBootstrapVerification:async scope=>{
      verificationGrants.push(scope.itemId);
      assert.equal(scope.protection,'UNPROTECTED');
      assert.equal(scope.repo,f.dir);
      assert.equal(scope.command.directory,await realpath(f.dir));
      assert.deepEqual(scope.command.args,['--test','--test-reporter=tap']);
      return true;
    }
  });
  for(const itemId of ['todo','calendar']) {
    const proposal=await api.proposeBootstrapFiles(f.id,itemId);
    assert.equal(proposal.materialized,false);
    assert.equal(proposal.executionGranted,false);
    assert.equal(f.store.get(proposal.approvalRequest.runId).state,'WAITING_APPROVAL');
    const firstPath=filesByItem[itemId][0].path;
    await assert.rejects(readFile(join(f.dir,firstPath)),{code:'ENOENT'});
    approve(f,proposal.approvalRequest);
    const applied=await api.materializeApprovedBootstrap(f.id,itemId);
    assert.equal(applied.status,'MATERIALIZED');
    assert.equal(applied.complete,false);
    for(const file of filesByItem[itemId])
      assert.equal(await readFile(join(f.dir,file.path),'utf8'),file.content);
  }
  assert.deepEqual(turns,['todo','calendar']);
  assert.deepEqual(hostGrants,turns);
  assert.deepEqual(materializationGrants,turns);
  const verified=await api.verifyApprovedBootstrap(f.id,'tests',{
    executable:process.execPath,args:['--test','--test-reporter=tap'],
    directory:f.dir,timeoutMs:60000
  });
  assert.equal(verified.status,'LOCAL_PASSED');
  assert.equal(verified.tests,2);
  assert.equal(verified.failed,0);
  assert.equal(verified.authority,'LOCAL_EXECUTED');
  assert.equal(verified.protectedVerification,'UNSATISFIED');
  assert.equal(verified.complete,false);
  assert.deepEqual(verificationGrants,['tests']);
  const report=await taskReport(f.store,f.id);
  assert.equal(report.complete,false);
  assert.equal(report.protectedVerification,'UNSATISFIED');
  assert.equal(task(f.store,f.id).bootstrap.states.tests,'LOCAL_PASSED');
});

test('NEW_PROJECT expired Host Turn cannot submit or replay after Store restart',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0;
  const config={
    executable:process.execPath,model:'SYNTHETIC_ONLY',timeoutMs:1000,
    authorize:async scope=>{
      assert.equal(scope.itemId,'todo');
      assert.equal(scope.repo,f.dir);
      return true;
    },
    transport:async request=>{
      hostTurns++;
      // A synthetically delayed completed receipt arrives after the grant
      // expires. No actual Codex Host or destination subprocess is invoked.
      await sleep(1100);
      return fakeHostReceipt(JSON.parse(request.prompt));
    }
  };
  await assert.rejects(
    proposeNewProjectFileset(f.store,f.id,'todo',config),/approval expired during Turn/);
  assert.equal(hostTurns,1);
  assert.deepEqual(
    f.store.events(f.id).filter(event=>event.type.startsWith('BOOTSTRAP_HOST_TURN_'))
      .map(event=>event.type),
    ['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_RECONCILING']);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.equal(task(f.store,f.id).bootstrap.states.todo,'PENDING_FILESET');
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs'),'utf8'),{code:'ENOENT'});
  // A new process reopening the durable Store must not replay the billable
  // Turn or accept its stale proposal under another embedding grant.
  f.store.close();
  f.store=new Store(f.state);
  await assert.rejects(
    proposeNewProjectFileset(f.store,f.id,'todo',{
      ...config,transport:async()=>{hostTurns++;throw Error('replayed Host Turn');}
    }),/requires reconciliation; no replay/);
  assert.equal(hostTurns,1);
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  assert.equal(
    f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,1);
});

test('NEW_PROJECT Host repairs only pinned failure Evidence through separately approved Fileset and Local re-verification',async t=>{
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const preview=await verifyTask(f.store,f.id,'tests',request(f));
  const failed=await verifyTask(f.store,f.id,'tests',request(f),{
    trust:preview.commandHash,acknowledgeUnisolated:true
  });
  assert.equal(failed.status,'LOCAL_FAILED');
  const original='export const add = (list, t) => list;\n';
  const replacement='export const add = (list, t) => [...list, t];\n';
  const originalRun=task(f.store,f.id).bootstrap.filesets.todo;
  let turns=0,planningGrants=0,materializationGrants=0,verificationGrants=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      planningGrants++;
      assert.equal(scope.operation,'repair');
      assert.equal(scope.repair.verificationItem,'tests');
      assert.equal(scope.repair.evidenceRef,failed.evidenceRef);
      assert.equal(scope.repair.sourceFiles['src/todo.mjs'],original);
      assert.deepEqual(scope.repair.fileDigests.find(x=>x.path==='src/todo.mjs'),
        {path:'src/todo.mjs',sha256:hash(original)});
      assert.equal(Object.isFrozen(scope.repair),true);
      return true;
    },
    transport:async input=>{
      turns++;
      const scope=JSON.parse(input.prompt);
      assert.equal(scope.kind,'CODEFLEET_NEW_PROJECT_REPAIR_FILESET_V1');
      assert.equal(input.outputSchema,bootstrapRepairOutputSchema);
      return {...fakeHostReceipt(scope),text:JSON.stringify({
        revision:scope.revision,itemId:'todo',
        repair:{verificationItem:'tests',evidenceRef:scope.repair.evidenceRef},
        files:[{path:'src/todo.mjs',content:replacement,baseSha256:hash(original)}]
      })};
    },
    authorizeBootstrapMaterialization:async scope=>{
      materializationGrants++;
      assert.equal(scope.operation,'modify');
      assert.equal(scope.files.length,1);
      assert.equal(scope.files[0].content,replacement);
      assert.equal(scope.files[0].baseSha256,hash(original));
      return true;
    },
    authorizeBootstrapVerification:async scope=>{
      verificationGrants++;
      assert.equal(scope.itemId,'tests');
      return true;
    }
  });
  const proposed=await api.proposeBootstrapRepairFiles(f.id,'todo','tests');
  assert.equal(proposed.approvalRequest.operation,'modify');
  assert.equal(proposed.executionGranted,false);
  assert.equal(proposed.materialized,false);
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  assert.deepEqual([planningGrants,turns],[1,1]);
  approve(f,proposed.approvalRequest);
  const applied=await api.materializeApprovedBootstrap(f.id,'todo');
  assert.equal(applied.status,'MATERIALIZED');
  assert.equal(applied.operation,'modify');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),replacement);
  assert.equal(materializationGrants,1);
  assert.equal(task(f.store,f.id).bootstrap.states.tests,'VERIFICATION_STALE');
  const passed=await api.verifyApprovedBootstrap(f.id,'tests',request(f));
  assert.equal(passed.status,'LOCAL_PASSED');
  assert.notEqual(passed.commandHash,failed.commandHash);
  assert.equal(passed.complete,false);
  assert.equal(passed.protectedVerification,'UNSATISFIED');
  assert.equal(verificationGrants,1);
  assert.equal(f.store.get(originalRun).state,'COMPLETED');
  assert.equal((await taskReport(f.store,f.id)).complete,false);
});

test('NEW_PROJECT Host Repair refuses missing failure Evidence before grant or Turn',async t=>{
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let grants=0,turns=0;
  const api=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>{grants++;return true;},
    transport:async()=>{turns++;throw Error('Host must not start');}
  });
  await assert.rejects(api.proposeBootstrapRepairFiles(f.id,'todo','tests'),/LOCAL_FAILED/);
  assert.equal(grants,0);
  assert.equal(turns,0);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,0);
});

test('NEW_PROJECT pending Host Repair keeps exact approval and failure Evidence across Store restart',async t=>{
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const preview=await verifyTask(f.store,f.id,'tests',request(f));
  const failed=await verifyTask(f.store,f.id,'tests',request(f),{
    trust:preview.commandHash,acknowledgeUnisolated:true
  });
  assert.equal(failed.status,'LOCAL_FAILED');
  const original=await readFile(join(f.dir,'src/todo.mjs'),'utf8');
  const replacement='export const add = (list, t) => [...list, t];\n';
  let turns=0,materializationGrants=0,verificationGrants=0;
  const beforeRestart=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      assert.equal(scope.operation,'repair');
      assert.equal(scope.repair.evidenceRef,failed.evidenceRef);
      return true;
    },
    transport:async input=>{
      turns++;
      const scope=JSON.parse(input.prompt);
      return {...fakeHostReceipt(scope),text:JSON.stringify({
        revision:scope.revision,itemId:'todo',
        repair:{verificationItem:'tests',evidenceRef:failed.evidenceRef},
        files:[{path:'src/todo.mjs',content:replacement,baseSha256:hash(original)}]
      })};
    }
  });
  const proposed=await beforeRestart.proposeBootstrapRepairFiles(f.id,'todo','tests');
  assert.equal(f.store.get(proposed.approvalRequest.runId).state,'WAITING_APPROVAL');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  f.store.close();
  f.store=new Store(f.state);
  const afterRestart=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',
    authorizeBootstrapMaterialization:async scope=>{
      materializationGrants++;
      assert.equal(scope.runId,proposed.approvalRequest.runId);
      assert.equal(scope.operation,'modify');
      assert.equal(scope.files[0].baseSha256,hash(original));
      assert.equal(scope.files[0].content,replacement);
      return true;
    },
    authorizeBootstrapVerification:async scope=>{
      verificationGrants++;
      assert.equal(scope.itemId,'tests');
      return true;
    },
    transport:async()=>{turns++;throw Error('Restart must not replay the Host Turn');}
  });
  assert.equal(task(f.store,f.id).bootstrap.verifications.tests,failed.evidenceRef);
  assert.equal(f.store.get(proposed.approvalRequest.runId).state,'WAITING_APPROVAL');
  await assert.rejects(afterRestart.materializeApprovedBootstrap(f.id,'todo'),/approval required/);
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  approve(f,proposed.approvalRequest);
  const applied=await afterRestart.materializeApprovedBootstrap(f.id,'todo');
  assert.equal(applied.status,'MATERIALIZED');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),replacement);
  assert.equal(task(f.store,f.id).bootstrap.states.tests,'VERIFICATION_STALE');
  const passed=await afterRestart.verifyApprovedBootstrap(f.id,'tests',request(f));
  assert.equal(passed.status,'LOCAL_PASSED');
  assert.equal(passed.complete,false);
  assert.equal(passed.protectedVerification,'UNSATISFIED');
  assert.equal(turns,1);
  assert.equal(materializationGrants,2);
  assert.equal(verificationGrants,1);
  assert.deepEqual(f.store.events(f.id).filter(e=>e.type.startsWith('BOOTSTRAP_HOST_TURN_'))
    .map(e=>e.type),['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_SUBMITTED']);
});

test('NEW_PROJECT uncertain Host Repair cannot replay after Store restart',async t=>{
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const preview=await verifyTask(f.store,f.id,'tests',request(f));
  const failed=await verifyTask(f.store,f.id,'tests',request(f),{
    trust:preview.commandHash,acknowledgeUnisolated:true
  });
  assert.equal(failed.status,'LOCAL_FAILED');
  const original=await readFile(join(f.dir,'src/todo.mjs'),'utf8');
  let turns=0;
  const config={
    executable:process.execPath,model:'SYNTHETIC_ONLY',
    authorize:async scope=>{
      assert.equal(scope.operation,'repair');
      assert.equal(scope.repair.evidenceRef,failed.evidenceRef);
      return true;
    },
    repair:{verificationItem:'tests'},
    transport:async input=>{
      turns++;
      return {...fakeHostReceipt(JSON.parse(input.prompt)),terminalStatus:'failed'};
    }
  };
  await assert.rejects(proposeNewProjectFileset(f.store,f.id,'todo',config),
    /receipt incomplete/);
  assert.equal(turns,1);
  assert.deepEqual(f.store.events(f.id).filter(e=>e.type.startsWith('BOOTSTRAP_HOST_TURN_'))
    .map(e=>e.type),['BOOTSTRAP_HOST_TURN_RESERVED','BOOTSTRAP_HOST_TURN_RECONCILING']);
  f.store.close();
  f.store=new Store(f.state);
  await assert.rejects(proposeNewProjectFileset(f.store,f.id,'todo',{
    ...config,transport:async()=>{turns++;throw Error('Replayed unresolved Repair Turn');}
  }),/requires reconciliation; no replay/);
  assert.equal(turns,1);
  assert.equal(task(f.store,f.id).bootstrap.verifications.tests,failed.evidenceRef);
  assert.equal(task(f.store,f.id).bootstrap.states.tests,'LOCAL_FAILED');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_HOST_TURN_RESERVED').length,1);
});

test('NEW_PROJECT repeated Fileset does not report success for a file changed after preflight',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'codefleet-fileset-drift-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'reused.txt'),'approved');
  const files=[
    {path:'new.txt',content:'created',sha256:hash('created'),bytes:7},
    {path:'reused.txt',content:'approved',sha256:hash('approved'),bytes:8}
  ];
  let beforeWrites=0;
  const result=await createFiles(root,files,{beforeWrite:async()=>{
    beforeWrites++;
    await writeFile(join(root,'reused.txt'),'unapproved');
  }});
  assert.equal(beforeWrites,1);
  assert.equal(result.status,'CONFLICT');
  assert.equal(result.results.find(file=>file.path==='new.txt').status,'CREATED');
  assert.equal(result.results.find(file=>file.path==='reused.txt').status,'CONFLICT');
  assert.equal(await readFile(join(root,'reused.txt'),'utf8'),'unapproved');
  assert.equal(await readFile(join(root,'new.txt'),'utf8'),'created');
});

test('NEW_PROJECT exact-match hard links cannot count as materialized or repairable owned files',async t=>{
  const temp=await realpath(await mkdtemp(join(tmpdir(),'codefleet-fileset-hardlink-')));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const repo=join(temp,'repo');
  await mkdir(repo);
  const outside=join(temp,'outside.txt');
  await writeFile(outside,'approved');
  try { await link(outside,join(repo,'owned.txt')); }
  catch(error) {
    if (['EPERM','EACCES','ENOTSUP','EOPNOTSUPP'].includes(error.code))
      return t.skip('Hard links unavailable on this runner');
    throw error;
  }
  const file={path:'owned.txt',content:'approved',sha256:hash('approved'),bytes:8};
  const before=await preflightFiles(repo,[file]);
  assert.equal(before[0].status,'CONFLICT');
  const created=await createFiles(repo,[file]);
  assert.equal(created.status,'CONFLICT');
  assert.equal(created.written,false);
  const repaired=await modifyFiles(repo,[{
    ...file,baseSha256:hash('approved'),content:'replacement',
    sha256:hash('replacement'),bytes:11
  }]);
  assert.equal(repaired.status,'CONFLICT');
  assert.equal(repaired.written,false);
  assert.equal(await readFile(outside,'utf8'),'approved');
});
