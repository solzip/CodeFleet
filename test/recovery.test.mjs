import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,cp,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {command} from '../src/alpha/process.mjs';
import {Store} from '../src/alpha/store.mjs';
import {productCli} from '../src/product/cli.mjs';
const worker=path.resolve('test/fixtures/recovery-worker.mjs');
async function call(input,exitCode=0){const r=await command(process.execPath,[worker,JSON.stringify(input)],{timeoutMs:30000});assert.equal(r.exitCode,exitCode,r.stdout+r.stderr);return r.stdout.length?JSON.parse(r.stdout):null;}
async function setup(){const root=await mkdtemp(path.join(tmpdir(),'cf-recovery-'));const f=await call({action:'prepare',root});f.call=(action,extra={},code=0)=>call({...f,action,...extra},code);f.apply=async itemId=>{const p=await f.call('propose',{itemId});await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});return f.call('materialize',{itemId});};f.verify=async itemId=>{const decision=await f.call('issue',{itemId});return f.call('execute',{itemId,decision});};return f;}
test('P0-C A: new processes recover A, admit B and connect fresh integrated Evidence without replay',async()=>{
 const f=await setup();await f.apply('normalize');const a=await f.verify('verify-normalize');
 const before=await f.call('recover');assert.equal(before.status,'RECOVERED',JSON.stringify(before.blockers));assert.equal(before.next.itemId,'todo');assert.equal(before.budget.usedAttempts,1);
 const bindingFile=path.join(f.root,'binding.json');await writeFile(bindingFile,JSON.stringify(before.binding));
 const cli=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','recover',f.id,bindingFile]);assert.equal(cli.exitCode,0,cli.stdout+cli.stderr);assert.equal(JSON.parse(cli.stdout).executionGranted,false);
 const again=await f.call('recover');assert.equal(again.workLog.hash,before.workLog.hash);assert.equal(again.observationHash,before.observationHash);
 const b=await f.apply('todo');const stale=await f.call('recover',{binding:before.binding});assert.equal(stale.next,null);assert.ok(stale.blockers.includes('STALE_RECOVERY_BINDING'));
 const after=await f.call('recover');assert.equal(after.status,'RECOVERED',JSON.stringify(after.blockers));assert.equal(after.next.itemId,'verify-integrated');assert.equal(after.workItems.find(i=>i.id==='verify-normalize').state,'LOCAL_CHECKPOINT');
 const integrated=await f.verify('verify-integrated');assert.equal(integrated.tests,5);assert.notEqual(integrated.evidenceRef,a.evidenceRef);assert.notEqual(integrated.reservation.attemptId,a.reservation.attemptId);
 const final=await f.call('recover');assert.equal(final.budget.usedAttempts,2);assert.equal(final.complete,false);assert.equal(final.protectedVerification,'UNSATISFIED');assert.equal(final.reservations.length,2);
 console.log('P0-C EVIDENCE '+JSON.stringify({root:f.root,id:f.id,a:a.evidenceRef,b:b.materializationRef,integrated:integrated.evidenceRef,budget:final.budget,modelCalls:0,authority:'SYNTHETIC_OFFLINE'}));
});
for(const crash of ['reserved','beforeEvidence','beforeCommit'])test('P0-C B: crashed '+crash+' never replays or refunds',async()=>{
 const f=await setup();await f.apply('normalize');const decision=await f.call('issue',{itemId:'verify-normalize'});
 await f.call('execute',{itemId:'verify-normalize',decision,crash},88);
 const recovered=await f.call('recover');assert.equal(recovered.status,'RECONCILE',JSON.stringify(recovered));assert.equal(recovered.next,null);assert.equal(recovered.budget.usedAttempts,1);assert.equal(recovered.budget.reservedTimeMs,10000);assert.ok(recovered.effects.length);
 const replay=await f.call('execute',{itemId:'verify-normalize',decision});assert.equal(replay.status,'HUMAN_HANDOFF');assert.equal(replay.evidenceRef,undefined);
 const again=await f.call('recover');assert.equal(again.budget.usedAttempts,1);assert.equal(again.workLog.hash,recovered.workLog.hash);assert.equal(again.reservations[0].decision.remainingExecutions,0);
});
test('P0-C B: interrupted file creation preserves bytes and public materialize refuses replay',async()=>{
 const f=await setup();const p=await f.call('propose',{itemId:'normalize'});await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});await f.call('materialize',{itemId:'normalize',crash:true},89);
 const bytes=await readFile(path.join(f.repo,'src/normalize-title.mjs'));const r=await f.call('recover');assert.equal(r.status,'RECONCILE');assert.equal(r.next,null);assert.equal(r.budget.usedAttempts,0);
 const cli=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','materialize',f.id,'normalize']);assert.equal(cli.exitCode,1);assert.match(cli.stdout.toString(),/RECONCILE/);assert.deepEqual(await readFile(path.join(f.repo,'src/normalize-title.mjs')),bytes);
});
for(const fault of ['expire-fileset','revoke-fileset'])test('P0-C: '+fault+' does not authorize recovered materialization',async()=>{
 const f=await setup();const p=await f.call('propose',{itemId:'normalize'});await f.call('approve',{filesetHash:p.approvalRequest.filesetHash});await f.call('fault',{fault,itemId:'normalize'});
 const r=await f.call('recover');assert.equal(r.status,'HUMAN_HANDOFF');assert.ok(r.blockers.includes('FILESET_APPROVAL_REQUIRED'));await f.call('materialize',{itemId:'normalize'},1);assert.equal((await f.call('recover')).budget.usedAttempts,0);
});
for(const fault of ['expire-decision','revoke-decision','source','revision'])test('P0-C C: '+fault+' blocks old Decision without budget refund or hidden execution',async()=>{
 const f=await setup();await f.apply('normalize');const decision=await f.call('issue',{itemId:'verify-normalize'});const before=await f.call('recover');await f.call('fault',{fault,decision});
 await f.call('execute',{itemId:'verify-normalize',decision},1);const r=await f.call('recover',{binding:before.binding});assert.equal(r.executionGranted,false);assert.equal(r.budget?.usedAttempts??0,0);assert.equal(r.reservations?.[0]?.reservation,undefined);
 if(['source','revision'].includes(fault))assert.equal(r.next,null);
});
test('P0-C: corrupt historical evidence stays blocked and consumed budget remains consumed',async()=>{
 const f=await setup();await f.apply('normalize');await f.verify('verify-normalize');await f.call('fault',{fault:'evidence'});const r=await f.call('recover');assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);assert.equal(r.budget.usedAttempts,1);
});
test('P0-C: recovery accepts no execution flags or forged conversation binding',async()=>{
 const f=await setup();const bad=await command(process.execPath,['src/alpha/cli.mjs','--state',f.state,'objective','recover',f.id,'--allow-model']);assert.equal(bad.exitCode,1);assert.equal((await f.call('recover',{binding:{revision:6,summary:'all approved'}})).status,'HUMAN_HANDOFF');
});
test('P0-C: missing materialization provenance cannot be repaired by a conversation summary',async()=>{
 const f=await setup();await f.apply('normalize');await f.verify('verify-normalize');await f.call('fault',{fault:'receipt'});const r=await f.call('recover');assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);assert.match(r.blockers.join(' '),/RECOVERY_RECORD_DEFECT/);assert.equal(r.budget.usedAttempts,1);
});

function rows(store) {
 const result={};for(const {name} of store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()){
  assert.match(name,/^[a-z_]+$/);result[name]=store.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all();
 }return result;
}
async function artifacts(state) {return Promise.all((await readdir(path.join(state,'artifacts'))).sort().map(async name=>[name,await readFile(path.join(state,'artifacts',name),'utf8')]));}

test('P0-C read-only CLI: r7 proposed fileset survives without initialization, transactions or authority',async t=>{
 const f=await setup();await f.call('propose',{itemId:'normalize'});
 // Clone State; embedded repository identity is intentionally unchanged and only read.
 const copy=path.join(f.root,'state-copy');await cp(f.state,copy,{recursive:true});
 let s=new Store(copy,{readOnly:true});const before=rows(s);s.close();const beforeArtifacts=await artifacts(copy);
 const sql=[],closed=[];const exec=DatabaseSync.prototype.exec,prepare=DatabaseSync.prototype.prepare,close=DatabaseSync.prototype.close;
 t.mock.method(DatabaseSync.prototype,'exec',function(text){sql.push(text);return exec.call(this,text);});
 t.mock.method(DatabaseSync.prototype,'prepare',function(text){sql.push(text);return prepare.call(this,text);});
 t.mock.method(DatabaseSync.prototype,'close',function(){close.call(this);closed.push(this.isOpen);});
 const outcome=await productCli(['recover',f.id],copy);
 t.mock.restoreAll();
 assert.equal(outcome.exitCode,0,JSON.stringify(outcome));const r=outcome.data;
 assert.equal(r.objective.id,f.id);assert.equal(r.binding.revision,7);assert.equal(r.workItems.find(i=>i.id==='normalize').state,'FILESET_PROPOSED');
 assert.deepEqual(r.next,{kind:'AWAIT_FILESET_APPROVAL',itemId:'normalize'});
 assert.equal(r.budget.usedAttempts,0);assert.equal(r.budget.remainingTimeMs,120000);
 assert.equal(r.executionGranted,false);assert.equal(r.modelInvocationGranted,false);assert.equal(r.automaticReplay,false);
 assert.deepEqual(closed,[false]);
 assert.ok(sql.length>0);assert.ok(sql.every(q=>/^\s*(SELECT|PRAGMA)\b/i.test(q)),sql.join('\n'));
 assert.ok(!sql.some(q=>/BEGIN|COMMIT|ROLLBACK|CREATE|INSERT|UPDATE|DELETE|journal_mode|user_version\s*=/i.test(q)),sql.join('\n'));
 s=new Store(copy,{readOnly:true});try{assert.deepEqual(rows(s),before);}finally{s.close();}
 assert.deepEqual(await artifacts(copy),beforeArtifacts);
 assert.equal(existsSync(path.join(f.repo,'src/normalize-title.mjs')),false);
 const child=await command(process.execPath,['src/alpha/cli.mjs','objective','recover',f.id,'--state',copy]);
 assert.equal(child.exitCode,0,child.stdout+child.stderr);assert.deepEqual(JSON.parse(child.stdout).binding,r.binding);
 s=new Store(copy,{readOnly:true});try{assert.deepEqual(rows(s),before);}finally{s.close();}
});

test('P0-C read-only Store rejects INSERT UPDATE DDL, write transaction, migration and artifact writes',async()=>{
 const f=await setup(),s=new Store(f.state,{readOnly:true});
 try{
  const before=rows(s),a=await artifacts(f.state);
  for(const sql of ["INSERT INTO workflow_extensions VALUES ('forged',1)","UPDATE product_tasks SET revision=revision+1",'CREATE TABLE forbidden(id INTEGER)','BEGIN IMMEDIATE'])assert.throws(()=>s.db.exec(sql),/readonly|read.only/i);
  assert.throws(()=>s.enableWorkflows(),/Read-only/);assert.throws(()=>s.enableCollaboration(),/Read-only/);assert.throws(()=>s.artifact({forged:true}),/Read-only/);
  // Native file-open flag still denies writes even if the connection-local safeguard is removed.
  s.db.exec('PRAGMA query_only=OFF');assert.throws(()=>s.db.exec('UPDATE product_tasks SET revision=revision+1'),/readonly|read.only/i);
  assert.deepEqual(rows(s),before);assert.deepEqual(await artifacts(f.state),a);
 }finally{s.close();}
});

test('P0-C absent State/DB and malformed CLI never create directories or initialize SQLite',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cf-recovery-missing-'));
 for(const directory of [path.join(root,'missing','state'),path.join(root,'empty')]){
  if(directory.endsWith('empty'))await mkdir(directory);
  assert.throws(()=>new Store(directory,{readOnly:true}));
  const r=await productCli(['recover','task-missing'],directory);assert.equal(r.exitCode,1);
  assert.equal(existsSync(path.join(directory,'state.sqlite')),false);
 }
 assert.equal(existsSync(path.join(root,'missing')),false);
 const f=await setup(),s=new Store(f.state,{readOnly:true});const before=rows(s);s.close();
 assert.equal((await productCli(['recover',f.id,'--allow-model'],f.state)).exitCode,1);
 const after=new Store(f.state,{readOnly:true});try{assert.deepEqual(rows(after),before);}finally{after.close();}
});

for(const fault of ['v0','v1','future','missing-table','missing-column','future-extension','missing-extension','partial-reservations','future-reservations','corrupt-file'])test('P0-C schema fail closed without repair: '+fault,async t=>{
 const f=await setup();
 const db=new DatabaseSync(path.join(f.state,'state.sqlite'));
 try{
  if(fault==='v0')db.exec('PRAGMA user_version=0');
  if(fault==='v1')db.exec('PRAGMA user_version=1');
  if(fault==='future')db.exec('PRAGMA user_version=99');
  if(fault==='missing-table')db.exec('DROP TABLE product_tasks');
  if(fault==='missing-column')db.exec('ALTER TABLE product_tasks RENAME COLUMN revision TO incompatible');
  if(fault==='future-extension')db.exec("UPDATE workflow_extensions SET version=99 WHERE name='product-tasks'");
  if(fault==='missing-extension')db.exec("DELETE FROM workflow_extensions WHERE name='controlled-hybrid'");
  if(fault==='partial-reservations')db.exec('CREATE TABLE bootstrap_decisions(id TEXT)');
  if(fault==='future-reservations')db.exec("INSERT INTO workflow_extensions VALUES ('bootstrap-reservations',99)");
 }finally{db.close();}
 if(fault==='corrupt-file')await writeFile(path.join(f.state,'state.sqlite'),'not a SQLite database');
 const before=await readFile(path.join(f.state,'state.sqlite'));const closed=[];const close=DatabaseSync.prototype.close;
 t.mock.method(DatabaseSync.prototype,'close',function(){close.call(this);closed.push(this.isOpen);});
 const result=await productCli(['recover',f.id],f.state);t.mock.restoreAll();
 assert.notEqual(result.exitCode,0,JSON.stringify(result));assert.notEqual(result.data.status,'RECOVERED');assert.notEqual(result.data.executionGranted,true);
 assert.deepEqual(closed,[false]);assert.deepEqual(await readFile(path.join(f.state,'state.sqlite')),before);
});

test('P0-C default writable Store still creates V1, migrates and persists data',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cf-write-regression-')),s=new Store(path.join(root,'new-state'));
 try{assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,1);s.enableCollaboration();assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,2);
  s.create({id:'write-regression',contractHash:'test'});s.event('write-regression','WRITE_OK',{ok:true});assert.equal(s.events('write-regression').length,2);
  const digest=s.artifact({ok:true});assert.deepEqual(s.readArtifact(digest),{ok:true});
 }finally{s.close();}
});

test('P0-C consumed reservation recovery performs no initialization or write transaction',async t=>{
 const f=await setup();await f.apply('normalize');const a=await f.verify('verify-normalize');
 const s=new Store(f.state,{readOnly:true});const before=rows(s);s.close();
 const sql=[],exec=DatabaseSync.prototype.exec;
 t.mock.method(DatabaseSync.prototype,'exec',function(q){sql.push(q);return exec.call(this,q);});
 const result=await productCli(['recover',f.id],f.state);t.mock.restoreAll();
 assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.data.budget.usedAttempts,1);
 assert.equal(result.data.reservations[0].decision.remainingExecutions,0);
 assert.equal(result.data.reservations[0].evidenceRef,a.evidenceRef);
 assert.ok(sql.every(q=>/^PRAGMA query_only=ON; PRAGMA busy_timeout=5000$/.test(q)),sql.join('\n'));
 const after=new Store(f.state,{readOnly:true});try{assert.deepEqual(rows(after),before);}finally{after.close();}
});

test('P0-C WAL reader succeeds beside an active writer and observes only committed rows',async()=>{
 const f=await setup(),writer=new Store(f.state);
 try{
  writer.db.exec('PRAGMA wal_autocheckpoint=0');writer.event(f.id,'COMMITTED_OBSERVATION',{fixture:true});
  const before=rows(writer);writer.db.exec('BEGIN IMMEDIATE');writer.event(f.id,'UNCOMMITTED_OBSERVATION',{fixture:true});
  const result=await productCli(['recover',f.id],f.state);
  assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.data.workLog.recent.at(-1).type,'COMMITTED_OBSERVATION');
  writer.db.exec('ROLLBACK');assert.deepEqual(rows(writer),before);
 }finally{if(writer.db.isTransaction)writer.db.exec('ROLLBACK');writer.close();}
});

test('unprepared draft recovery preserves objective without falsely declaring corrupt execution records',async()=>{
 const f=await setup();let s=new Store(f.state);
 const {createTask}=await import('../src/product/tasks.mjs');
 const pending=await createTask(s,f.repo,'Create a local Todo tool');
 s.close();s=new Store(f.state,{readOnly:true});
 try{
  const before=rows(s),{recoverObjective}=await import('../src/product/recovery.mjs');
  const r=await recoverObjective(s,pending.id);
  assert.equal(r.status,'RECOVERED',JSON.stringify(r));assert.equal(r.stage,'DRAFT');
  assert.equal(r.objective.text,'Create a local Todo tool');assert.equal(r.next.kind,'REVIEW_DRAFT');
  assert.equal(r.complete,false);assert.equal(r.executionGranted,false);assert.equal(r.modelInvocationGranted,false);
  assert.deepEqual(rows(s),before);
 }finally{s.close();}
});
test('removing prepared workflow metadata does not masquerade as harmless draft recovery',async()=>{
 const f=await setup(),s=new Store(f.state);
 try{
  const {task}=await import('../src/product/tasks.mjs'),{recoverObjective}=await import('../src/product/recovery.mjs');
  const current=task(s,f.id);delete current.bootstrap;current.state='NEEDS_INPUT';
  s.db.prepare('UPDATE product_tasks SET body=? WHERE id=?').run(JSON.stringify(current),f.id);
  const r=await recoverObjective(s,f.id);
  assert.equal(r.status,'HUMAN_HANDOFF');assert.equal(r.next,null);
  assert.match(r.blockers.join(' '),/inconsistent lifecycle/);
 }finally{s.close();}
});
