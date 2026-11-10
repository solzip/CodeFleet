import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/alpha/store.mjs';
import { git } from '../src/alpha/workspace.mjs';
import { planWithCodexManagedThread, planningOutputSchema } from '../src/hosts/codex-managed-planning.mjs';

const goal='Repair arithmetic behavior in src/a.js with test/a.test.js and independently verify results.';
async function setup(t) {
  const root=await mkdtemp(join(tmpdir(),'cf-planning-turn-'));
  let activeStore;
  t.after(async()=>{ activeStore?.close(); await rm(root,{recursive:true,force:true}); });
  const repo=join(root,'repo');
  await mkdir(join(repo,'src'),{recursive:true});
  await mkdir(join(repo,'test'));
  await writeFile(join(repo,'src/a.js'),'export function add(x,y){ return x+y; }\n');
  await writeFile(join(repo,'test/a.test.js'),'import test from "node:test";\n');
  for(const args of [['init'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']]){
    const result=await git(repo,args);
    assert.equal(result.exitCode,0,result.stderr.toString());
  }
  const store=new Store(join(root,'state')); activeStore=store;
  return {repo,store,settings:{executable:process.execPath,model:'fixture-model',cwd:repo}};
}
function proposedReceipt(call) {
  const message=JSON.parse(call.prompt);
  const draft={schemaVersion:2,objective:message.originalObjective,
    base:message.context.discovery.base,files:['src/a.js'],tests:['test/a.test.js'],
    criteria:[{description:'Arithmetic regression passes',method:'protected-tests',tests:['test/a.test.js']}],
    risks:[],unknowns:[],effects:['local-edit']};
  return {terminalStatus:'completed',threadId:'host-thread',turnId:'host-turn',
    authority:'PROVIDER_REPORTED_ONLY',protectedVerified:false,
    text:JSON.stringify({sessionId:message.sessionId,requestHash:message.requestHash,proposal:{
      draft,references:[{path:'src/a.js',line:1,quote:'export function'},
        {path:'test/a.test.js',line:1,quote:'import test'}],inferences:[]
    }})};
}
test('approved Codex planning Turn reuses existing cited-draft validator and persists result',async t=>{
 const f=await setup(t);let turns=0;
 const result=await planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async binding=>Boolean(binding.sessionId&&binding.requestHash),
  transport:async call=>{turns++;assert.equal(call.executable,await realpath(process.execPath));assert.equal(call.outputSchema,planningOutputSchema);return proposedReceipt(call);}
 });
 assert.equal(turns,1);
 assert.equal(result.status,'VALIDATED');
 assert.equal(result.authority,'PROVIDER_REPORTED_ONLY');
 assert.equal(result.hostReceipt.threadId,'host-thread');
 assert.equal(result.costStatus,'UNKNOWN');
 assert.equal(result.executable,false);
 assert.ok(result.workflowPreview);
});
test('Codex planning grant inspects immutable Goal, pinned source and requested Host policy',async t=>{
 const f=await setup(t);let turns=0,grants=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async scope=>{
   grants++;
   assert.equal(scope.objective,goal);
   assert.equal(scope.repositoryRoot,await realpath(f.repo));
   assert.equal(scope.executablePath,process.execPath);
   assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
   assert.match(scope.executableSha256,/^[a-f0-9]{64}$/);
   assert.match(scope.sourceBaseline,/^[a-f0-9]{40,64}$/);
   assert.equal(scope.executionGranted,false);
   assert.equal(scope.costVisibility,'UNKNOWN');
   assert.deepEqual(scope.sourceFiles.map(file=>file.path),['src/a.js','test/a.test.js']);
   assert.equal(Object.isFrozen(scope.sourceFiles),true);
   for(const file of scope.sourceFiles) {
    assert.equal(Object.isFrozen(file),true);
    assert.match(file.sha256,/^[a-f0-9]{64}$/);
    assert.ok(file.bytes>0);
   }
   assert.deepEqual(scope.requestedHostPolicy,{
    tools:['read','search'],writes:false,network:'deny',
    timeoutMs:30000,outputBytes:65536
   });
   assert.equal(Object.isFrozen(scope.requestedHostPolicy),true);
   assert.equal(Object.isFrozen(scope.requestedHostPolicy.tools),true);
   assert.throws(()=>{scope.sourceFiles[0].sha256='changed';},TypeError);
   assert.throws(()=>scope.sourceFiles.push({path:'unreviewed'}),TypeError);
   assert.throws(()=>scope.requestedHostPolicy.tools.push('write'),TypeError);
   return false;
  },
  transport:async()=>{turns++;throw Error('denied review must not dispatch');}
 }),/approval/);
 assert.equal(grants,1);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(row=>row.status),['CANCELLED']);
});
test('without independent exact grant, Host Turn is never called',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async()=>false,
  transport:async()=>{turns++;throw Error('unreachable');}
 }),/approval/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(row=>row.status),['CANCELLED']);
});
test('uncertain dispatched Turn remains RECONCILING without replay',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async()=>true,
  transport:async()=>{turns++;throw Error('host crashed');}
 }),/host crashed/);
 assert.equal(turns,1);
 const rows=f.store.db.prepare("SELECT status FROM host_planning").all();
 assert.equal(rows.length,1);
 assert.equal(rows[0].status,'RECONCILING');
});

test('source drift during asynchronous approval cancels OPEN planning without a Host Turn',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,
  authorize:async()=>{
   await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x-y; }\n');
   return true;
  },
  transport:async()=>{turns++;throw Error('Host must not be started');}
 }),/Planning source context changed while awaiting approval/);
 assert.equal(turns,0);
 const rows=f.store.db.prepare('SELECT status FROM host_planning').all();
 assert.deepEqual(rows.map(row=>row.status),['CANCELLED']);
});

test('clean HEAD replacement during approval is not silently accepted for planning',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,
  authorize:async()=>{
   await writeFile(join(f.repo,'src/a.js'),'export function add(x,y){ return x+y+1; }\n');
   for (const argv of [['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','changed-during-approval']]) {
     const result=await git(f.repo,argv);
     assert.equal(result.exitCode,0,result.stderr.toString());
   }
   return true;
  },
  transport:async()=>{turns++;throw Error('Host must not be started');}
 }),/Planning source context changed while awaiting approval/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(row=>row.status),['CANCELLED']);
});

test('changed persisted planning request is rejected before reserving a Host Turn',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,
  authorize:async()=>{
   f.store.db.prepare("UPDATE host_planning SET body=? WHERE status='OPEN'").run('{"mutated":true}');
   return true;
  },
  transport:async()=>{turns++;throw Error('Host must not be started');}
 }),/Planning session changed or expired/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(row=>row.status),['CANCELLED']);
});


test('Host planning refuses a different working directory before creating a session or asking for a grant',async t=>{
 const f=await setup(t);let grants=0,turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,cwd:join(f.repo,'src'),
  authorize:async()=>{grants++;return true;},
  transport:async()=>{turns++;throw Error('Host must not be started');}
 }),/cwd must resolve to the observed repository/);
 assert.equal(grants,0);
 assert.equal(turns,0);
});

test('throwing approval callback cancels the staged planning session without dispatch',async t=>{
 const f=await setup(t);let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async()=>{throw Error('owner grant transport unavailable');},
  transport:async()=>{turns++;throw Error('Host must not be started');}
 }),/owner grant transport unavailable/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(row=>row.status),['CANCELLED']);
});

test('oversized planning prompt closes OPEN reservation before a Host Turn',async t=>{
 const f=await setup(t);let turns=0;
 // The source fits the pinned text limit, but JSON escaping expands the
 // Host prompt past its independent byte cap.
 await writeFile(join(f.repo,'src/a.js'),'// '+ '\\'.repeat(82000) + '\n');
 for(const args of [['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','large-escaped-source']]) {
  const result=await git(f.repo,args);
  assert.equal(result.exitCode,0,result.stderr.toString());
 }
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
  ...f.settings,authorize:async()=>true,
  transport:async()=>{turns++;throw Error('Host must not be started');}
 }),/Planning context too large/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(row=>row.status),['CANCELLED']);
});

async function switchableHostCwd(t, repo) {
  const alias=join(dirname(repo),'approved-host-cwd');
  const foreign=join(dirname(repo),'unapproved-host-cwd');
  await mkdir(foreign);
  const type=process.platform==='win32'?'junction':'dir';
  try { await symlink(repo,alias,type); }
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(error.code)) {
      t.skip('Directory links unavailable on this runner');
      return null;
    }
    throw error;
  }
  return {alias, async redirect() {
    await rm(alias,{recursive:true,force:true});
    await symlink(foreign,alias,type);
  }};
}

test('planning grant cannot dispatch Host into a cwd alias repointed during review',async t=>{
 const f=await setup(t);
 const link=await switchableHostCwd(t,f.repo);
 if (!link) return;
 let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,cwd:link.alias,
   authorize:async()=>{await link.redirect();return true;},
   transport:async()=>{turns++;throw Error('unauthorized Host dispatch');}
 }),/Planning repository or Host cwd changed while awaiting approval/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['CANCELLED']);
});

test('planning refuses to accept a Host result from a cwd changed during Turn',async t=>{
 const f=await setup(t);
 const link=await switchableHostCwd(t,f.repo);
 if (!link) return;
 let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,cwd:link.alias,authorize:async()=>true,
   transport:async call=>{turns++;await link.redirect();return proposedReceipt(call);}
 }),/Planning repository or Host cwd changed during Host Turn/);
 assert.equal(turns,1);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['RECONCILING']);
});

test('planning approval expiring after durable dispatch reservation never invokes Host',async t=>{
 const f=await setup(t);let turns=0;
 const originalNow=Date.now;
 const originalEvent=f.store.event.bind(f.store);
 let reserved=false;
 f.store.event=(...args)=>{
   const result=originalEvent(...args);
   if(args[1]==='HOST_PLANNING_TURN_RESERVED') reserved=true;
   return result;
 };
 Date.now=()=>originalNow()+(reserved?120000:0);
 try {
   await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
     ...f.settings,authorize:async()=>true,
     transport:async()=>{turns++;throw Error('expired grant must not invoke Host');}
   }),/Planning authority expired before Host Turn/);
 } finally {
   Date.now=originalNow;
   f.store.event=originalEvent;
 }
 assert.equal(reserved,true);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['CANCELLED']);
 assert.ok(f.store.db.prepare("SELECT 1 FROM events WHERE type='HOST_PLANNING_TURN_CANCELLED'").get());
});

test('planning refuses a directory as Host executable before staging approval',async t=>{
 const f=await setup(t);let grants=0,turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,executable:join(f.repo,'src'),
   authorize:async()=>{grants++;return true;},
   transport:async()=>{turns++;throw Error('unauthorized dispatch');}
 }),/executable must resolve to a regular file/);
 assert.equal(grants,0);
 assert.equal(turns,0);
 // Executable preflight is before opt-in planning schema creation.
 assert.equal(f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='host_planning'").get(),undefined);
 assert.deepEqual(f.store.db.prepare('SELECT type FROM events').all(),[]);
});

// Directory aliases (junctions on Windows) exercise the real executable
// pathname without requiring a privileged file-symlink or a Codex binary.
async function switchableExecutableDirectory(t, repo) {
 const alias=join(dirname(repo),'reviewed-host-bin');
 const foreign=join(dirname(repo),'foreign-host-bin');
 await mkdir(foreign);
 const name=basename(process.execPath);
 await writeFile(join(foreign,name),'not the reviewed executable');
 const type=process.platform==='win32'?'junction':'dir';
 try { await symlink(dirname(process.execPath),alias,type); }
 catch (error) {
   if (['EPERM','EACCES','ENOTSUP','ENOSYS'].includes(error.code)) {
     t.skip('Directory links unavailable on this runner');return null;
   }
   throw error;
 }
 return {path:join(alias,name), async redirect() {
   await rm(alias,{recursive:true,force:true});
   await symlink(foreign,alias,type);
 }};
}

test('repointed executable alias during approval cancels planning before Host Turn',async t=>{
 const f=await setup(t);
 const link=await switchableExecutableDirectory(t,f.repo);
 if (!link) return;
 let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,executable:link.path,
   authorize:async scope=>{
     assert.equal(scope.executablePath,link.path);
     assert.equal(scope.executableResolvedPath,await realpath(process.execPath));
     await link.redirect();
     return true;
   },
   transport:async()=>{turns++;throw Error('unapproved Host executable invoked');}
 }),/Planning Host executable changed while awaiting approval/);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['CANCELLED']);
});

test('repointed executable alias during Host Turn makes planning result uncertain',async t=>{
 const f=await setup(t);
 const link=await switchableExecutableDirectory(t,f.repo);
 if (!link) return;
 let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,executable:link.path,
   authorize:async()=>true,
   transport:async call=>{turns++;await link.redirect();return proposedReceipt(call);}
 }),/Planning Host executable changed during Host Turn/);
 assert.equal(turns,1);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['RECONCILING']);
});


test('same-path executable content mutation during planning grant cancels before any Turn', async t => {
 const f=await setup(t);
 // Fake bytes are never invoked; the mocked transport must remain untouched.
 const executable=join(dirname(f.repo),'fake-planning-codex.exe');
 await writeFile(executable,'FAKE_EXECUTABLE_ORIGINAL_BYTES');
 let turns=0,approvals=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,executable,
   authorize:async scope=>{
     approvals++;
     assert.equal(scope.executableResolvedPath,await realpath(executable));
     assert.match(scope.executableSha256,/^[a-f0-9]{64}$/);
     await writeFile(executable,'FAKE_EXECUTABLE_MUTATED_SAME_PATH');
     return true;
   },
   transport:async()=>{turns++;throw Error('mutated binary must never dispatch');}
 }),/Planning Host executable changed while awaiting approval/);
 assert.equal(approvals,1);
 assert.equal(turns,0);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['CANCELLED']);
});

test('same-path executable content mutation during planning Turn stays RECONCILING', async t => {
 const f=await setup(t);
 const executable=join(dirname(f.repo),'fake-planning-codex.exe');
 await writeFile(executable,'FAKE_EXECUTABLE_ORIGINAL_BYTES');
 let turns=0;
 await assert.rejects(planWithCodexManagedThread(f.store,f.repo,goal,{
   ...f.settings,executable,authorize:async()=>true,
   transport:async call=>{
     turns++;
     assert.equal(call.executable,await realpath(executable));
     await writeFile(executable,'FAKE_EXECUTABLE_MUTATED_DURING_TURN');
     return proposedReceipt(call);
   }
 }),/Planning Host executable changed during Host Turn/);
 assert.equal(turns,1);
 assert.deepEqual(f.store.db.prepare('SELECT status FROM host_planning').all().map(r=>r.status),['RECONCILING']);
});
