// Offline G7-A diagnostic. No Provider model execution. Only fake secrets.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment } from '../../../src/alpha/process.mjs';
import { probeProvider } from '../../../src/providers/capabilities.mjs';
import { createCodexAdapter, parseCodex } from '../../../src/providers/codex.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'codefleet-g7a-'));
const report = { scope: 'OFFLINE_DIAGNOSTIC_NOT_PROVIDER_CERTIFICATION', checks: [], commands: [] };
const check = (name, ok, detail) => { report.checks.push({ name, passed: Boolean(ok), detail }); };
const run = async (exe, args, opts={}) => {
  const r = await command(exe, args, { timeoutMs: 30000, ...opts });
  report.commands.push({ executable: path.basename(exe), args, exitCode:r.exitCode, interrupted:r.interrupted, error:r.error, stdout:r.stdout.toString(), stderr:r.stderr.toString() });
  return r;
};
const digest = b => createHash('sha256').update(b).digest('hex');
async function tree(dir, base=dir) {
  let entries=[];
  for(const e of await fs.readdir(dir,{withFileTypes:true})) {
    const p=path.join(dir,e.name);
    if(e.isDirectory()) entries.push(...await tree(p,base));
    else if(e.isFile()) entries.push([path.relative(root,p).replaceAll('\\','/'),digest(await fs.readFile(p))]);
  }
  return entries;
}
report.sourceBefore = Object.fromEntries([...(await tree(path.join(root,'src'))),...(await tree(path.join(root,'test'))),...(await tree(path.join(root,'scripts'))),['package.json',digest(await fs.readFile(path.join(root,'package.json')))]]);
const codex=process.argv[2];
report.providers=[await probeProvider('claude'),await probeProvider('codex'),await probeProvider('codex',{executable:codex})];
await run(codex,['exec','--help']);
await run(codex,['sandbox','--help']);
await run('claude.exe',['--help']);
let launches=0;
const blocked=await createCodexAdapter({runCommand:async()=>{launches++;throw Error('Must not launch');}}).execute({});
check('Codex adapter has no launch path',blocked.status==='BLOCKED'&&launches===0,blocked.error);
const good=[{type:'thread.started'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify({summary:'fake',edits:[]})}},{type:'turn.completed',usage:{input_tokens:1}}];
check('Codex JSONL completion parsed',parseCodex(good.map(JSON.stringify).join('\n')).usage.input_tokens===1,'Synthetic events; not a live fixture');
for(const [name,events] of [['tool event',[{type:'item.completed',item:{type:'command_execution'}}]],['reasoning event',[{type:'item.completed',item:{type:'reasoning'}}]],['after completion',[...good,{type:'turn.started'}]],['invalid JSON',null]]) {
  let denied=false;try{parseCodex(events?events.map(JSON.stringify).join('\n'):'{');}catch{denied=true;}
  check('Codex parser rejects '+name,denied,'Post-output rejection cannot prevent prior tool effects');
}
const fakeHome=path.join(temp,'fake-home'), workspace=path.join(temp,'workspace');
await fs.mkdir(fakeHome);await fs.mkdir(workspace);
await fs.writeFile(path.join(fakeHome,'fake-credential.txt'),'G7A_FAKE_SECRET');
await fs.writeFile(path.join(workspace,'input.txt'),'readonly input');
const fakeEnv={...environment('provider'),HOME:fakeHome,USERPROFILE:fakeHome,APPDATA:fakeHome,LOCALAPPDATA:fakeHome,ANTHROPIC_API_KEY:'G7A_FAKE_ANTHROPIC'};
delete fakeEnv.CLAUDE_CODE_OAUTH_TOKEN;
const hostCode=`const fs=require('fs'),cp=require('child_process'),p=require('path');const home=process.env.HOME;fs.writeFileSync(p.join(home,'outside-write.txt'),'fake');console.log(JSON.stringify({read:fs.readFileSync(p.join(home,'fake-credential.txt'),'utf8')==='G7A_FAKE_SECRET',write:fs.existsSync(p.join(home,'outside-write.txt')),spawn:cp.spawnSync(process.execPath,['-e','process.exit(0)']).status===0}));`;
const host=await run(process.execPath,['-e',hostCode],{cwd:workspace,env:fakeEnv});
const exposed=JSON.parse(host.stdout.toString());
check('Existing process envelope counterexample',host.exitCode===0&&exposed.read&&exposed.write&&exposed.spawn,exposed);
const oldGit=process.env.GITHUB_TOKEN;process.env.GITHUB_TOKEN='G7A_FAKE_GITHUB';
check('Provider env omits unrelated token',!Object.hasOwn(environment('provider'),'GITHUB_TOKEN'),'No actual secret inspected');
if(oldGit===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=oldGit;
const image=await run('docker',['image','inspect','node:24-bookworm-slim','--format','{{.Id}}']);
if(image.exitCode!==0)throw Error('Required existing image unavailable; no pull');
const imageId=image.stdout.toString().trim();report.image=imageId;
await run('docker',['version','--format','{{.Server.Os}} {{.Server.Version}}']);
const containerCode=`
const fs=require('fs'),cp=require('child_process'),net=require('net');
const rows=[];const check=(name,pass,detail)=>rows.push({name,pass,detail});
const deny=(name,fn)=>{try{fn();check(name,false,'unexpected success');}catch(e){check(name,true,e.code);}};
check('readonly context readable',fs.readFileSync('/context/input.txt','utf8')==='readonly input');
fs.writeFileSync('/tmp/allowed','ok');check('allowed scratch write',true);
deny('context write denied',()=>fs.writeFileSync('/context/input.txt','bad'));
deny('outside root write denied',()=>fs.writeFileSync('/outside-write','bad'));
deny('parent traversal denied',()=>fs.writeFileSync('/tmp/../outside-write','bad'));
fs.symlinkSync('/outside-write','/tmp/escape');deny('symlink write escape denied',()=>fs.writeFileSync('/tmp/escape','bad'));
deny('unmounted host fake credential inaccessible',()=>fs.readFileSync('/host-fake-home/fake-credential.txt'));
check('unrelated credentials absent',!process.env.GITHUB_TOKEN&&!process.env.ANTHROPIC_API_KEY&&!process.env.CLAUDE_CODE_OAUTH_TOKEN);
check('no Docker socket',!fs.existsSync('/var/run/docker.sock'));
const status=fs.readFileSync('/proc/self/status','utf8');check('no capabilities',/CapEff:\\s+0+\\n/.test(status));check('no new privileges',/NoNewPrivs:\\s+1/.test(status));
const mount=cp.spawnSync('/bin/mount',['-o','remount,rw','/'],{encoding:'utf8'});check('remount bypass denied',mount.status!==0,{status:mount.status});
const child=cp.spawnSync('/bin/sh',['-c','exit 0']);check('COUNTEREXAMPLE shell execution remains possible',child.status===0,'Container isolation is not no-tool enforcement');
const server=net.createServer(s=>s.end());server.listen(0,'127.0.0.1',()=>{
const local=net.connect(server.address().port,'127.0.0.1');local.on('connect',()=>{check('loopback positive control',true);local.destroy();server.close();
const out=net.connect(9,'192.0.2.1');out.setTimeout(1500);const done=(ok,d)=>{if(out.done)return;out.done=true;out.destroy();check('external route denied',ok,d);console.log(JSON.stringify(rows));process.exitCode=rows.every(x=>x.pass)?0:1;};out.on('connect',()=>done(false,'unexpected connection'));out.on('error',e=>done(e.code==='ENETUNREACH'||e.code==='EHOSTUNREACH',e.code));out.on('timeout',()=>done(false,'timeout is not enforcement proof'));});});
`;
const dockerArgs=['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--user=65534:65534','--pids-limit=32','--memory=128m','--cpus=1','--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m','--mount',`type=bind,source=${workspace},target=/context,readonly`,'--workdir=/tmp',imageId,'node','-e',containerCode];
const isolated=await run('docker',dockerArgs,{timeoutMs:30000});
check('Offline external sandbox diagnostic',isolated.exitCode===0,isolated.stdout.toString().trim());
check('Host readonly context preserved',(await fs.readFile(path.join(workspace,'input.txt'),'utf8'))==='readonly input');
report.sourceAfter=Object.fromEntries([...(await tree(path.join(root,'src'))),...(await tree(path.join(root,'test'))),...(await tree(path.join(root,'scripts'))),['package.json',digest(await fs.readFile(path.join(root,'package.json')))]]);
check('Product sources and tests preserved',JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter),Object.keys(report.sourceBefore).length);
report.liveCalls=0;report.nativeWindowsSandbox='NOT_RUN: no account/firewall setup or repair authorized; sandbox launcher reported error 1909';
let output=JSON.stringify(report,null,2);
for(const value of [process.env.USERPROFILE?.replaceAll('\\','\\\\'),process.env.USERPROFILE?.replaceAll('\\','/'),process.env.USERPROFILE,process.env.USERNAME&&encodeURIComponent(process.env.USERNAME),process.env.USERNAME])if(value)output=output.replaceAll(value,'[REDACTED]');
await fs.writeFile(path.join(root,'docs/runs/2026-10-19/alpha-g7a-diagnostics.json'),output+'\n');
console.log(JSON.stringify({checks:report.checks,passed:report.checks.filter(x=>x.passed).length,total:report.checks.length,modelCalls:0},null,2));
process.exitCode=report.checks.every(x=>x.passed)?0:1;
