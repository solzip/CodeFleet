import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { envelope, hostRequest } from '../src/hosts/ipc-client.mjs';

test('H4: Host client has bounded data-only methods and fails closed off Linux', async()=>{
 for(const method of ['decide','revoke','shell','complete','set-state']) assert.throws(()=>envelope(method,{}));
 assert.throws(()=>envelope('propose',{goal:'x'.repeat(65536)}),/large/);
 assert.throws(()=>envelope('status',{},'bad id'),/Invalid/);
 if(process.platform!=='linux') await assert.rejects(hostRequest('/socket','status',{}),/Linux/);
});
test('H4: separated Linux Host IPC reaches existing Docker Harness, evidence and Judge',()=>{
 assert.equal(process.env.CODEFLEET_TEST_DOCKER,'1');
 const image=process.env.CODEFLEET_HOST_IPC_IMAGE;assert.match(image??'',/^sha256:[a-f0-9]{64}$/);
 const volume='codefleet-h4-'+randomUUID();
 function docker(args,timeout=15000) {const r=spawnSync('docker',args,{encoding:'utf8',timeout,windowsHide:true});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r.stdout.trim();}
 docker(['volume','create',volume]);
 try {
  const root=docker(['volume','inspect','--format','{{.Mountpoint}}',volume]);assert.match(root,/^\/var\/lib\/docker\/volumes\/codefleet-h4-[a-f0-9-]+\/_data$/);
  const output=docker(['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID','--cap-add=CHOWN','--security-opt=no-new-privileges','--pids-limit=128','--memory=512m','--cpus=1','--mount',`type=volume,source=${volume},target=${root}`,'--mount','type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock','--mount',`type=bind,source=${path.join(process.cwd(),'src')},target=/input/src,readonly`,'--mount',`type=bind,source=${path.join(process.cwd(),'test/fixtures')},target=/input/test/fixtures,readonly`,image,'python3','-B','/input/test/fixtures/host-ipc-probe.py',root],180000);
  const evidence=JSON.parse(output.split('\n').at(-1));assert.equal(evidence.status,'OFFLINE_VERIFIED');assert.ok(evidence.checks.length>=15);assert.equal(evidence.modelCalls,0);console.log('H4 observations: '+JSON.stringify(evidence));
 } finally {docker(['volume','rm',volume]);}
});
