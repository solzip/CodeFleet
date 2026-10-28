import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/alpha/store.mjs';
import { finish } from '../src/workflow/persistence.mjs';

test('time: Coordinator clock rollback invalidates lease without revision change or terminal rewrite',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'cf-coordinator-clock-')),s=new Store(dir);t.after(()=>s.close());
 s.enableWorkflows();s.create({id:'parent',revision:1,state:'RUNNING'});s.create({id:'child',state:'READY'});
 s.db.prepare('INSERT INTO workflow_attempts VALUES (?,?,?,?,?)').run('parent','repair','child',1,'STARTED');
 const real=Date.now;let now=real();Date.now=()=>now;
 try {
  const owner=s.claim('parent'),run=s.get('parent'),issued=now;
  now+=250;assert.equal(s.heartbeat('parent',owner),true);
  now-=239;assert.equal(s.heartbeat('parent',owner),false);
  const row=s.db.prepare('SELECT owner,leaseUntil,body FROM runs WHERE id=?').get('parent');
  assert.equal(row.owner,owner);assert.equal(row.leaseUntil,0);assert.equal(JSON.parse(row.body).revision,1);
  assert.throws(()=>finish(s,run,owner,{itemId:'repair'},'SUCCEEDED'),/Coordinator lease\/revision lost/);
  now=issued+1000;assert.equal(s.heartbeat('parent',owner),false);
  assert.throws(()=>finish(s,run,owner,{itemId:'repair'},'SUCCEEDED'),/Coordinator lease\/revision lost/);
  assert.equal(s.db.prepare('SELECT status FROM workflow_attempts').get().status,'STARTED');
 } finally {Date.now=real;}
});

// Only this process's Date.now is injected; the OS and child clocks are untouched.
for (const fault of ['expired','backwards']) test(`time: heartbeat cannot revive ${fault} lease`, async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'cf-time-')), s=new Store(dir);
  t.after(()=>s.close());s.create({id:'run',state:'READY'});
  const real=Date.now, start=real();let now=start;Date.now=()=>now;
  try {
    const owner=s.claim('run');
    const prior=s.db.prepare('SELECT leaseUntil FROM runs').get().leaseUntil;
    if(fault==='expired')now+=30001;
    if(fault==='backwards')now-=1000;
    assert.equal(s.heartbeat('run',owner),false);
    assert.ok(s.db.prepare('SELECT leaseUntil FROM runs').get().leaseUntil<prior);
    now=start;assert.equal(s.heartbeat('run',owner),false,'rollback cannot resurrect invalidated lease');
    assert.throws(()=>s.save(s.get('run'),owner,'UNSAFE_SAVE'),/lease|clock/i);
  } finally {Date.now=real;}
});
test('time: restarted process rejects future lease origin; valid renewal and stale owner fencing remain',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'cf-time-')),s=new Store(dir);t.after(()=>s.close());
  s.create({id:'run',state:'READY'});const owner=s.claim('run');assert.equal(s.heartbeat('run',owner),true);
  const lease=s.db.prepare('SELECT leaseUntil FROM runs').get().leaseUntil;
  s.db.prepare('UPDATE runs SET pid=NULL').run(); // The prior executor has exited.
  const result=spawnSync(process.execPath,['--input-type=module','-e',
    `import {Store} from ${JSON.stringify(new URL('../src/alpha/store.mjs',import.meta.url).href)};
     const s=new Store(process.argv[1]); Date.now=()=>Number(process.argv[2]);
     try{s.claim('run');console.log('UNSAFE');}catch(e){console.log(e.message);}finally{s.close();}`,
    dir,String(lease-31000)],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/clock/i);
  assert.equal(s.heartbeat('run','stale-owner'),false);
  assert.equal(s.db.prepare('SELECT owner FROM runs').get().owner,owner);
});
test('time: rejected expired save cannot be revived by rolling time back',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'cf-time-')),s=new Store(dir);t.after(()=>s.close());
  s.create({id:'run',state:'READY'});const real=Date.now,start=real();let now=start;Date.now=()=>now;
  try {
    const owner=s.claim('run');now+=30001;
    assert.throws(()=>s.save(s.get('run'),owner,'LATE'),/lease/i);
    now=start;
    assert.throws(()=>s.save(s.get('run'),owner,'REVIVED'),/lease/i);
  } finally{Date.now=real;}
});
