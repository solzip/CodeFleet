import test from 'node:test';
import { writeFileSync } from 'node:fs';
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
import { productCli } from '../src/product/cli.mjs';
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

test('NEW_PROJECT previously repaired files are rechecked after repair preflight',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'codefleet-repair-preflight-drift-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'first.txt'),'original');
  await writeFile(join(root,'already.txt'),'approved');
  const files=[
    {path:'first.txt',baseSha256:hash('original'),content:'updated',sha256:hash('updated'),bytes:7},
    {path:'already.txt',baseSha256:hash('before'),content:'approved',sha256:hash('approved'),bytes:8}
  ];
  let writes=0;
  const recorded=[];
  const result=await modifyFiles(root,files,{
    beforeWrite:()=>{
      writes++;
      // The second file matched its approved repair at preflight. Change it
      // while the first file is being applied, before its success is recorded.
      writeFileSync(join(root,'already.txt'),'outside-change');
    },
    record:entry=>recorded.push(entry)
  });
  assert.equal(writes,1);
  assert.equal(result.status,'CONFLICT');
  assert.equal(result.written,true);
  assert.deepEqual(result.results.map(entry=>entry.status),['MODIFIED','CONFLICT']);
  assert.deepEqual(recorded.map(entry=>entry.status),['MODIFIED','CONFLICT']);
  assert.equal(await readFile(join(root,'first.txt'),'utf8'),'updated');
  assert.equal(await readFile(join(root,'already.txt'),'utf8'),'outside-change');
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

test('trusted product CLI exposes NEW_PROJECT Host Fileset proposal without materialization',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let factories=0,grants=0,turns=0;
  const entry=['propose-codex-bootstrap-files',f.id,'todo'];
  const result=await productCli(entry,f.state,{
    createCodexAdmission:store=>{
      factories++;
      return {facade:createCodexMvpFacade(store,{
        executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
        authorizeBootstrap:async scope=>{
          grants++;
          assert.equal(scope.taskId,f.id);
          assert.equal(scope.itemId,'todo');
          assert.equal(scope.operation,'create');
          assert.deepEqual(scope.files,proposedTodoFiles.map(file=>file.path));
          return true;
        },
        transport:async call=>{
          turns++;
          assert.equal(call.cwd,f.dir);
          return fakeHostReceipt(JSON.parse(call.prompt));
        }
      })};
    }
  });
  assert.equal(result.exitCode,0,result.data?.error);
  assert.deepEqual([factories,grants,turns],[1,1,1]);
  assert.equal(result.data.materialized,false);
  assert.equal(result.data.executionGranted,false);
  assert.equal(result.data.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(result.data.approvalRequest.authority,'REQUEST_ONLY');
  assert.equal(f.store.get(result.data.approvalRequest.runId).state,'WAITING_APPROVAL');
  assert.equal(task(f.store,f.id).bootstrap.states.todo,'FILESET_PROPOSED');
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs'),'utf8'),{code:'ENOENT'});
});

test('NEW_PROJECT CLI rejects untrusted flags, forged facade and denied Host grant',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const entry=['propose-codex-bootstrap-files',f.id,'todo'];
  let factories=0,grants=0,turns=0;
  const createCodexAdmission=store=>{
    factories++;
    return {facade:createCodexMvpFacade(store,{
      executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
      authorizeBootstrap:async()=>{grants++;return false;},
      transport:async()=>{turns++;throw Error('Denied Fileset must not run Host');}
    })};
  };
  for(const invalid of [
    ['propose-codex-bootstrap-files',f.id],
    ['propose-codex-bootstrap-files',f.id,'todo','extra'],
    [...entry,'--allow-model'],
    [...entry,'--actor','untrusted'],
    [...entry,'--repository',f.dir]
  ]){
    const blocked=await productCli(invalid,f.state,{createCodexAdmission});
    assert.equal(blocked.exitCode,1);
    assert.match(blocked.data.error,/requires exactly one Task ID|repository is only valid/);
  }
  assert.equal(factories,0);
  const plain=await productCli(entry,f.state);
  assert.equal(plain.exitCode,1);
  assert.match(plain.data.error,/TRUSTED_CODEX_BOOTSTRAP_UNAVAILABLE/);
  const forged=await productCli(entry,f.state,{
    createCodexAdmission:()=>({facade:{proposeBootstrapFiles:async()=>({})}})
  });
  assert.equal(forged.exitCode,1);
  assert.match(forged.data.error,/TRUSTED_CODEX_BOOTSTRAP_UNAVAILABLE/);
  const denied=await productCli(entry,f.state,{createCodexAdmission});
  assert.equal(denied.exitCode,1);
  assert.match(denied.data.error,/trusted exact bounded approval/);
  assert.deepEqual([factories,grants,turns],[1,1,0]);
  assert.equal(task(f.store,f.id).bootstrap.states.todo,'PENDING_FILESET');
  assert.equal(task(f.store,f.id).bootstrap.filesets.todo,undefined);
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs'),'utf8'),{code:'ENOENT'});
});


test('trusted product CLI applies only a separately reviewed, already approved NEW_PROJECT Fileset',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  let hostTurns=0,ownerGrants=0,factories=0;
  const proposalFacade=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>true,
    transport:async request=>{
      hostTurns++;
      return fakeHostReceipt(JSON.parse(request.prompt));
    }
  });
  const proposal=await proposalFacade.proposeBootstrapFiles(f.id,'todo');
  assert.equal(proposal.materialized,false);
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs'),'utf8'),{code:'ENOENT'});
  approve(f,proposal.approvalRequest);
  const entry=['materialize-codex-bootstrap-files',f.id,'todo'];
  const result=await productCli(entry,f.state,{
    createCodexAdmission:store=>{
      factories++;
      return {facade:createCodexMvpFacade(store,{
        executable:process.execPath,model:'SYNTHETIC_ONLY',
        authorizeBootstrapMaterialization:async scope=>{
          ownerGrants++;
          assert.equal(scope.kind,'CODEFLEET_BOOTSTRAP_MATERIALIZATION_SCOPE_V1');
          assert.equal(scope.repo,f.dir);
          assert.equal(scope.taskId,f.id);
          assert.equal(scope.itemId,'todo');
          assert.equal(scope.protection,'UNPROTECTED');
          assert.deepEqual(scope.files.map(file=>file.path),
            proposedTodoFiles.map(file=>file.path));
          assert.deepEqual(scope.files.map(file=>file.content),
            proposedTodoFiles.map(file=>file.content));
          assert.equal(Object.isFrozen(scope.files),true);
          return true;
        }
      })};
    }
  });
  assert.equal(result.exitCode,0,result.data?.error);
  assert.equal(result.data.status,'MATERIALIZED');
  assert.equal(result.data.protection,'UNPROTECTED');
  assert.equal(result.data.hostLiveAcceptance,'UNVERIFIED');
  assert.deepEqual([factories,hostTurns,ownerGrants],[1,1,1]);
  for(const file of proposedTodoFiles)
    assert.equal(await readFile(join(f.dir,file.path),'utf8'),file.content);
});

test('NEW_PROJECT CLI materialization rejects flags, missing trust and denied owner review without writes',async t=>{
  const f=await prepared({passing:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const proposer=createCodexMvpFacade(f.store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async()=>true,
    transport:async request=>fakeHostReceipt(JSON.parse(request.prompt))
  });
  const proposal=await proposer.proposeBootstrapFiles(f.id,'todo');
  approve(f,proposal.approvalRequest);
  const entry=['materialize-codex-bootstrap-files',f.id,'todo'];
  let factories=0,grants=0;
  const createCodexAdmission=store=>{
    factories++;
    return {facade:createCodexMvpFacade(store,{
      executable:process.execPath,model:'SYNTHETIC_ONLY',
      authorizeBootstrapMaterialization:async()=>{grants++;return false;}
    })};
  };
  for(const invalid of [
    entry.slice(0,2),
    [...entry,'extra'],
    [...entry,'--allow-model'],
    [...entry,'--actor','spoofed'],
    [...entry,'--repository',f.dir]
  ]){
    const blocked=await productCli(invalid,f.state,{createCodexAdmission});
    assert.equal(blocked.exitCode,1);
    assert.match(blocked.data.error,/requires exactly one Task ID|repository is only valid/);
  }
  assert.equal(factories,0);
  const ordinary=await productCli(entry,f.state);
  assert.equal(ordinary.exitCode,1);
  assert.match(ordinary.data.error,/TRUSTED_CODEX_BOOTSTRAP_MATERIALIZATION_UNAVAILABLE/);
  const forged=await productCli(entry,f.state,{
    createCodexAdmission:()=>({facade:{materializeApprovedBootstrap:async()=>({status:'MATERIALIZED'})}})
  });
  assert.equal(forged.exitCode,1);
  assert.match(forged.data.error,/TRUSTED_CODEX_BOOTSTRAP_MATERIALIZATION_UNAVAILABLE/);
  const denied=await productCli(entry,f.state,{createCodexAdmission});
  assert.equal(denied.exitCode,1);
  assert.match(denied.data.error,/Exact Bootstrap materialization grant denied/);
  assert.deepEqual([factories,grants],[1,1]);
  await assert.rejects(readFile(join(f.dir,'src/todo.mjs'),'utf8'),{code:'ENOENT'});
});

test('trusted product CLI performs separately reviewed NEW_PROJECT Local verification without completing Objective',async t=>{
  const f=await built({passing:true,protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const requestFile=join(f.root,'codex-verification-request.json');
  await writeFile(requestFile,JSON.stringify(request(f)));
  const entry=['verify-codex-bootstrap',f.id,'tests',requestFile];
  let factories=0,grants=0;
  const result=await productCli(entry,f.state,{
    createCodexAdmission:store=>{
      factories++;
      return {facade:createCodexMvpFacade(store,{
        executable:process.execPath,model:'SYNTHETIC_ONLY',
        authorizeBootstrapVerification:async scope=>{
          grants++;
          assert.equal(scope.kind,'CODEFLEET_BOOTSTRAP_LOCAL_CHECK_SCOPE_V1');
          assert.equal(scope.taskId,f.id);
          assert.equal(scope.itemId,'tests');
          assert.equal(scope.repo,f.dir);
          assert.equal(scope.protection,'UNPROTECTED');
          assert.deepEqual(scope.command.args,['--test','--test-reporter=tap']);
          assert.equal(scope.command.directory,await realpath(f.dir));
          assert.equal(Object.isFrozen(scope.command.args),true);
          return true;
        }
      })};
    }
  });
  assert.equal(result.exitCode,0,result.data?.error);
  assert.equal(result.data.status,'LOCAL_PASSED');
  assert.equal(result.data.authority,'LOCAL_EXECUTED');
  assert.equal(result.data.protection,'UNPROTECTED');
  assert.equal(result.data.protectedVerification,'UNSATISFIED');
  assert.equal(result.data.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(result.data.complete,false);
  assert.deepEqual([factories,grants],[1,1]);
  assert.equal(task(f.store,f.id).bootstrap.states.tests,'LOCAL_PASSED');
  assert.equal((await taskReport(f.store,f.id)).complete,false);
});

test('NEW_PROJECT verification CLI refuses unparseable and oversized requests before trusted factory',async t=>{
  const f=await built({passing:true,protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const malformed=join(f.root,'malformed-verification.json');
  const oversized=join(f.root,'oversized-verification.json');
  await writeFile(malformed,'{"executable":');
  await writeFile(oversized,' '.repeat(220001));
  let factories=0;
  const createCodexAdmission=()=>{factories++;throw Error('Untrusted JSON must not reach Host factory');};
  const entry=['verify-codex-bootstrap',f.id,'tests'];
  const invalid=await productCli([...entry,malformed],f.state,{createCodexAdmission});
  assert.equal(invalid.exitCode,1);
  assert.match(invalid.data.error,/JSON|Unexpected|Expected|end of/);
  const tooBig=await productCli([...entry,oversized],f.state,{createCodexAdmission});
  assert.equal(tooBig.exitCode,1);
  assert.match(tooBig.data.error,/Host response exceeds limit/);
  assert.equal(factories,0);
  assert.equal(task(f.store,f.id).bootstrap.verifications?.tests,undefined);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED').length,0);
});
test('NEW_PROJECT verification CLI denies malformed input, ordinary CLI, forged facade and owner rejection',async t=>{
  const f=await built({passing:true,protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const requestFile=join(f.root,'codex-verification-request.json');
  await writeFile(requestFile,JSON.stringify(request(f)));
  const entry=['verify-codex-bootstrap',f.id,'tests',requestFile];
  const initialRevision=task(f.store,f.id).revision;
  let factories=0,grants=0;
  const createCodexAdmission=store=>{
    factories++;
    return {facade:createCodexMvpFacade(store,{
      executable:process.execPath,model:'SYNTHETIC_ONLY',
      authorizeBootstrapVerification:async()=>{grants++;return false;}
    })};
  };
  for(const invalid of [
    entry.slice(0,3),
    [...entry,'extra'],
    [...entry,'--allow-model'],
    [...entry,'--trust','not-a-grant'],
    [...entry,'--repository',f.dir]
  ]) {
    const blocked=await productCli(invalid,f.state,{createCodexAdmission});
    assert.equal(blocked.exitCode,1);
    assert.match(blocked.data.error,/verify-codex-bootstrap requires|repository is only valid/);
  }
  assert.equal(factories,0);
  const ordinary=await productCli(entry,f.state);
  assert.equal(ordinary.exitCode,1);
  assert.match(ordinary.data.error,/TRUSTED_CODEX_BOOTSTRAP_VERIFICATION_UNAVAILABLE/);
  const forged=await productCli(entry,f.state,{
    createCodexAdmission:()=>({facade:{verifyApprovedBootstrap:async()=>({status:'LOCAL_PASSED'})}})
  });
  assert.equal(forged.exitCode,1);
  assert.match(forged.data.error,/TRUSTED_CODEX_BOOTSTRAP_VERIFICATION_UNAVAILABLE/);
  const denied=await productCli(entry,f.state,{createCodexAdmission});
  assert.equal(denied.exitCode,1);
  assert.match(denied.data.error,/Exact Bootstrap verification grant denied/);
  assert.deepEqual([factories,grants],[1,1]);
  assert.equal(task(f.store,f.id).revision,initialRevision);
  assert.equal(task(f.store,f.id).bootstrap.verifications?.tests,undefined);
  assert.equal(f.store.events(f.id).filter(e=>e.type==='BOOTSTRAP_LOCAL_VERIFICATION_RECORDED').length,0);
});


test('trusted product CLI proposes only failure-Evidence-bound NEW_PROJECT Repair with no writes',async t=>{
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const preview=await verifyTask(f.store,f.id,'tests',request(f));
  const failed=await verifyTask(f.store,f.id,'tests',request(f),{
    trust:preview.commandHash,acknowledgeUnisolated:true
  });
  assert.equal(failed.status,'LOCAL_FAILED');
  const original=await readFile(join(f.dir,'src/todo.mjs'),'utf8');
  const replacement='export const add = (list, t) => [...list, t];\n';
  let factories=0,grants=0,turns=0;
  const entry=['propose-codex-bootstrap-repair',f.id,'todo','tests'];
  const result=await productCli(entry,f.state,{
    createCodexAdmission:store=>{
      factories++;
      return {facade:createCodexMvpFacade(store,{
        executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
        authorizeBootstrap:async scope=>{
          grants++;
          assert.equal(scope.operation,'repair');
          assert.equal(scope.repair.verificationItem,'tests');
          assert.equal(scope.repair.evidenceRef,failed.evidenceRef);
          assert.equal(scope.repair.sourceFiles['src/todo.mjs'],original);
          return true;
        },
        transport:async input=>{
          turns++;
          const scope=JSON.parse(input.prompt);
          assert.equal(scope.kind,'CODEFLEET_NEW_PROJECT_REPAIR_FILESET_V1');
          return {...fakeHostReceipt(scope),text:JSON.stringify({
            revision:scope.revision,itemId:'todo',
            repair:{verificationItem:'tests',evidenceRef:failed.evidenceRef},
            files:[{path:'src/todo.mjs',content:replacement,baseSha256:hash(original)}]
          })};
        }
      })};
    }
  });
  assert.equal(result.exitCode,0,result.data?.error);
  assert.equal(result.data.approvalRequest.operation,'modify');
  assert.equal(result.data.materialized,false);
  assert.equal(result.data.executionGranted,false);
  assert.equal(result.data.hostLiveAcceptance,'UNVERIFIED');
  assert.deepEqual([factories,grants,turns],[1,1,1]);
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  assert.equal(task(f.store,f.id).bootstrap.verifications.tests,failed.evidenceRef);
  assert.equal(f.store.get(result.data.approvalRequest.runId).state,'WAITING_APPROVAL');
});


test('NEW_PROJECT trusted CLI runs approved Repair apply and fresh Local verification across Store openings',async t=>{
  // Synthetic Host receipt and disposable Local test command only. Each CLI
  // invocation opens its own Store; none authenticates a real Codex Host.
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const requestFile=join(f.root,'codex-repair-verification-request.json');
  await writeFile(requestFile,JSON.stringify(request(f)));
  const original=await readFile(join(f.dir,'src/todo.mjs'),'utf8');
  const replacement='export const add = (list, t) => [...list, t];\n';
  let hostTurns=0,materializationGrants=0,verificationGrants=0;
  let failureRef=null;
  const createCodexAdmission=store=>({facade:createCodexMvpFacade(store,{
    executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
    authorizeBootstrap:async scope=>{
      assert.equal(scope.operation,'repair');
      assert.equal(scope.repair.verificationItem,'tests');
      assert.equal(scope.repair.evidenceRef,failureRef);
      assert.equal(scope.repair.sourceFiles['src/todo.mjs'],original);
      return true;
    },
    transport:async call=>{
      hostTurns++;
      const scope=JSON.parse(call.prompt);
      assert.equal(scope.kind,'CODEFLEET_NEW_PROJECT_REPAIR_FILESET_V1');
      return {...fakeHostReceipt(scope),text:JSON.stringify({
        revision:scope.revision,itemId:'todo',
        repair:{verificationItem:'tests',evidenceRef:failureRef},
        files:[{path:'src/todo.mjs',content:replacement,baseSha256:hash(original)}]
      })};
    },
    authorizeBootstrapMaterialization:async scope=>{
      materializationGrants++;
      assert.equal(scope.operation,'modify');
      assert.equal(scope.protection,'UNPROTECTED');
      assert.deepEqual(scope.files.map(file=>file.path),['src/todo.mjs']);
      assert.equal(scope.files[0].content,replacement);
      return true;
    },
    authorizeBootstrapVerification:async scope=>{
      verificationGrants++;
      assert.equal(scope.itemId,'tests');
      assert.equal(scope.protection,'UNPROTECTED');
      assert.equal(scope.command.directory,await realpath(f.dir));
      return true;
    }
  })});
  const check=['verify-codex-bootstrap',f.id,'tests',requestFile];
  const failed=await productCli(check,f.state,{createCodexAdmission});
  assert.equal(failed.exitCode,2,failed.data?.error);
  assert.equal(failed.data.status,'LOCAL_FAILED');
  failureRef=task(f.store,f.id).bootstrap.verifications.tests;
  assert.ok(failureRef);
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);

  const proposed=await productCli(
    ['propose-codex-bootstrap-repair',f.id,'todo','tests'],
    f.state,{createCodexAdmission});
  assert.equal(proposed.exitCode,0,proposed.data?.error);
  assert.equal(proposed.data.approvalRequest.operation,'modify');
  assert.equal(proposed.data.materialized,false);
  assert.equal(f.store.get(proposed.data.approvalRequest.runId).state,'WAITING_APPROVAL');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  assert.equal(hostTurns,1);

  const apply=['materialize-codex-bootstrap-files',f.id,'todo'];
  const unapproved=await productCli(apply,f.state,{createCodexAdmission});
  assert.notEqual(unapproved.exitCode,0,'Pending Repair cannot write before approval');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
  assert.equal(f.store.get(proposed.data.approvalRequest.runId).state,'WAITING_APPROVAL');

  approve(f,proposed.data.approvalRequest);
  const applied=await productCli(apply,f.state,{createCodexAdmission});
  assert.equal(applied.exitCode,0,applied.data?.error);
  assert.equal(applied.data.status,'MATERIALIZED');
  assert.equal(applied.data.operation,'modify');
  assert.equal(applied.data.protection,'UNPROTECTED');
  assert.equal(applied.data.hostLiveAcceptance,'UNVERIFIED');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),replacement);
  assert.equal(task(f.store,f.id).bootstrap.states.tests,'VERIFICATION_STALE');

  const passed=await productCli(check,f.state,{createCodexAdmission});
  assert.equal(passed.exitCode,0,passed.data?.error);
  assert.equal(passed.data.status,'LOCAL_PASSED');
  assert.notEqual(task(f.store,f.id).bootstrap.verifications.tests,failureRef);
  assert.equal(passed.data.complete,false);
  assert.equal(passed.data.protection,'UNPROTECTED');
  assert.equal(passed.data.hostLiveAcceptance,'UNVERIFIED');
  assert.equal((await taskReport(f.store,f.id)).complete,false);
  assert.deepEqual([hostTurns,verificationGrants],[1,2]);
  assert.equal(materializationGrants,2);
});

test('NEW_PROJECT Repair CLI fails closed on absent failure Evidence, forged facades, flags and denied grant',async t=>{
  const f=await built({protectedItem:true});
  t.after(async()=>{f.store.close();await rm(f.root,{recursive:true,force:true});});
  const entry=['propose-codex-bootstrap-repair',f.id,'todo','tests'];
  const original=await readFile(join(f.dir,'src/todo.mjs'),'utf8');
  let factories=0,grants=0,turns=0;
  const createCodexAdmission=store=>{
    factories++;
    return {facade:createCodexMvpFacade(store,{
      executable:process.execPath,model:'SYNTHETIC_ONLY',enableHostTurns:true,
      authorizeBootstrap:async()=>{grants++;return false;},
      transport:async()=>{turns++;throw Error('Denied Repair must not dispatch Host');}
    })};
  };
  for(const invalid of [
    entry.slice(0,3),[...entry,'extra'],[...entry,'--allow-model'],
    [...entry,'--actor','spoofed'],[...entry,'--repository',f.dir]
  ]){
    const blocked=await productCli(invalid,f.state,{createCodexAdmission});
    assert.equal(blocked.exitCode,1);
    assert.match(blocked.data.error,/propose-codex-bootstrap-repair requires|repository is only valid/);
  }
  assert.equal(factories,0);
  const ordinary=await productCli(entry,f.state);
  assert.equal(ordinary.exitCode,1);
  assert.match(ordinary.data.error,/TRUSTED_CODEX_BOOTSTRAP_REPAIR_UNAVAILABLE/);
  const forged=await productCli(entry,f.state,{
    createCodexAdmission:()=>({facade:{proposeBootstrapRepairFiles:async()=>({approvalRequest:{operation:'modify'}})}})
  });
  assert.equal(forged.exitCode,1);
  assert.match(forged.data.error,/TRUSTED_CODEX_BOOTSTRAP_REPAIR_UNAVAILABLE/);
  const missing=await productCli(entry,f.state,{createCodexAdmission});
  assert.equal(missing.exitCode,1);
  assert.match(missing.data.error,/LOCAL_FAILED/);
  assert.deepEqual([factories,grants,turns],[1,0,0]);
  const preview=await verifyTask(f.store,f.id,'tests',request(f));
  const failed=await verifyTask(f.store,f.id,'tests',request(f),{
    trust:preview.commandHash,acknowledgeUnisolated:true
  });
  assert.equal(failed.status,'LOCAL_FAILED');
  const denied=await productCli(entry,f.state,{createCodexAdmission});
  assert.equal(denied.exitCode,1);
  assert.match(denied.data.error,/trusted exact bounded approval/);
  assert.deepEqual([factories,grants,turns],[2,1,0]);
  assert.equal(task(f.store,f.id).bootstrap.verifications.tests,failed.evidenceRef);
  assert.equal(task(f.store,f.id).bootstrap.states.todo,'MATERIALIZED');
  assert.equal(await readFile(join(f.dir,'src/todo.mjs'),'utf8'),original);
});
