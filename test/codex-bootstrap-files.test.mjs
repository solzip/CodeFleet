import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBootstrapHostProposal,bootstrapFilesOutputSchema } from '../src/hosts/codex-bootstrap-files.mjs';

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

import { rm, readFile, realpath, mkdtemp, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepared, approve } from './fixtures/bootstrap-reservation.mjs';
import { task } from '../src/product/tasks.mjs';
import { taskReport } from '../src/product/report.mjs';
import { createCodexMvpFacade } from '../src/product/codex-mvp-facade.mjs';

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
      assert.equal(scope.executablePath,process.execPath);
      assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
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
