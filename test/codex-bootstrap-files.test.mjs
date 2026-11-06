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

import { rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepared } from './fixtures/bootstrap-reservation.mjs';
import { task } from '../src/product/tasks.mjs';
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
      assert.deepEqual(scope.files,proposedTodoFiles.map(file=>file.path));
      assert.equal(Object.isFrozen(scope.files),true);
      assert.throws(()=>scope.files.push('secret.txt'),TypeError);
      return true;
    },
    transport:async request=>{
      hostTurns++;
      const prompt=JSON.parse(request.prompt);
      assert.equal(request.cwd,f.dir);
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
