// Packaged-product acceptance. The npm tarball's installed runtime, not the
// source checkout, performs one disposable existing Git Objective. It goes
// through the installed Codex Skill runtime, two dependent supervised edits,
// real Node tests, persistence/recovery and current-tree COMPLETE_LOCAL.
// No native Codex, model, external repo, network or protected trust claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,lstat,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// These public contracts moved with the documentation consolidation. Fixtures,
// executable tests and arbitrary new test/contracts files still must not ship.
const publicContracts=new Set([
  'alpha-design.md','alpha-roadmap.md','archive/2026-08-13/ARCHIVE.md',
  'concept-foundation.md','doc-anchor-baseline.json','INDEX.md','README.md',
  'REGISTER.md','rule-coverage-baseline.json','rule-implementation-status.json',
  'spine-pass-2026-08-07.md'
].map(p=>'test/contracts/legacy/'+p));
const safeDistributionPath=p=>! /^(test|\.git|\.codefleet|node_modules)\//.test(p)||publicContracts.has(p);
test('packaging excludes fixtures and State while allowing only pinned public contracts',()=>{
  for(const p of ['test/fixtures/private.json','test/work-review.test.mjs','test/contracts/legacy/private.json','.git/config','.codefleet/state.sqlite','node_modules/private/index.js'])assert.equal(safeDistributionPath(p),false,p);
  for(const p of publicContracts)assert.equal(safeDistributionPath(p),true,p);
});

// Exercise what actually ships to a user: pack and install the release
// candidate into a disposable tools directory before installing either Skill.
// Neither installed code nor its runtime may import the source checkout.
async function packagedRuntime(root){
  const npm=process.env.npm_execpath;
  assert.ok(npm,'Packaged acceptance must run through npm with npm_execpath');
  const cache=path.join(root,'npm-cache');
  const packed=proc(process.execPath,
    [npm,'pack','--ignore-scripts','--json','--pack-destination',root],
    process.cwd());
  assert.equal(packed.status,0,packed.stderr+'\n'+packed.stdout);
  const manifest=JSON.parse(packed.stdout);
  assert.equal(manifest.length,1);
  assert.ok(manifest[0].filename.endsWith('.tgz'));
  assert.ok(manifest[0].files.some(f=>f.path==='scripts/host-install.mjs'));
  assert.ok(manifest[0].files.some(f=>f.path==='src/product/codex-mvp-facade.mjs'));
  for(const name of ['work-review','work-report','work-owner'])assert.ok(manifest[0].files.some(f=>f.path===`src/product/${name}.mjs`),'Work runtime must ship: '+name);
  assert.ok(manifest[0].files.every(f=>safeDistributionPath(f.path)),
    'Private fixtures and State must not ship');
  const installed=path.join(root,'installed-package');
  await mkdir(installed);
  const result=proc(process.execPath,
    [npm,'install','--offline','--ignore-scripts','--no-audit','--no-fund',
      '--cache',cache,path.join(root,manifest[0].filename)],
    installed,90000);
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const packageRoot=path.join(installed,'node_modules','codefleet');
  assert.ok((await lstat(path.join(packageRoot,'src','product',
    'codex-mvp-facade.mjs'))).isFile());
  const importer=pathToFileURL(path.join(packageRoot,'src','hosts','install.mjs')).href;
  const {installHost,manageHost}=await import(importer);
  return {installHost,manageHost,packageRoot};
}


const sha=text=>createHash('sha256').update(text).digest('hex');
const beforeTodo="export function createTodo(){throw Error('TODO_PENDING');}\n";
const beforeCalendar="export function calendarEvents(){throw Error('CALENDAR_PENDING');}\n";
const afterTodo="export function createTodo(title){\n  if(typeof title!=='string'||!title.trim())throw Error('Invalid title');\n  return {id:'todo-1',title:title.trim(),completed:false};\n}\n";
const afterCalendar="export function calendarEvents(items,day){\n  return items.filter(item=>item.day===day).map(item=>({...item}));\n}\n";

function proc(exe,args,cwd,timeoutMs=30000){
  const r=spawnSync(exe,args,{cwd,encoding:'utf8',timeout:timeoutMs,
    windowsHide:true,shell:false,maxBuffer:4*1024*1024});
  if(r.error)throw r.error;
  return r;
}
function cli(script,state,area,args,allowed=[0,2]){
  const r=proc(process.execPath,[script,'--state',state,area,...args]);
  assert.ok(allowed.includes(r.status),'Unexpected installed CLI exit '+r.status+
    ': '+r.stderr+' '+r.stdout);
  let data;
  try{data=JSON.parse(r.stdout);}
  catch{throw Error('Non-JSON installed CLI response: '+r.stdout);}
  return {exitCode:r.status,data};
}
function git(repo,args){
  const r=proc('git',args,repo);
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
for(const nativeHost of ['codex','claude']) test('packaged '+nativeHost+' Skill advances one Goal to Local complete and detects drift',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'cf-installed-goal-'+nativeHost+'-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const repo=path.join(root,'project'),state=path.join(root,'state');
  await mkdir(path.join(repo,'src'),{recursive:true});
  await mkdir(path.join(repo,'test'),{recursive:true});
  await writeFile(path.join(repo,'src/todo.mjs'),beforeTodo);
  await writeFile(path.join(repo,'src/calendar.mjs'),beforeCalendar);
  await writeFile(path.join(repo,'test/todo.test.mjs'),[
    "import test from 'node:test'; import assert from 'node:assert/strict';",
    "import {createTodo} from '../src/todo.mjs';",
    "test('title validation',()=>{assert.equal(createTodo(' Ship ').title,'Ship');",
    "  assert.throws(()=>createTodo(' '),/Invalid title/);});",""
  ].join('\n'));
  await writeFile(path.join(repo,'test/calendar.test.mjs'),[
    "import test from 'node:test'; import assert from 'node:assert/strict';",
    "import {createTodo} from '../src/todo.mjs';",
    "import {calendarEvents} from '../src/calendar.mjs';",
    "test('Calendar shares accepted Todo',()=>{",
    "  const task={...createTodo('Ship'),day:'2026-11-11'};",
    "  assert.equal(calendarEvents([task],'2026-11-11')[0].title,'Ship');",
    "  assert.equal(calendarEvents([task],'2026-11-12').length,0);});",""
  ].join('\n'));
  git(repo,['init']);git(repo,['add','.']);
  git(repo,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
    'commit','-m','baseline']);
  const base=git(repo,['rev-parse','HEAD']);
  const canonical=await realpath(repo);
  const {installHost,manageHost}=await packagedRuntime(root);
  assert.equal((await installHost(canonical,nativeHost)).status,'INSTALLED_OFFLINE');
  const skill=path.join(canonical,nativeHost==='codex'?'.agents':'.claude','skills','codefleet');
  const instructions=await readFile(path.join(skill,'SKILL.md'),'utf8');
  for(const phrase of ['Goal-to-verified-result loop','ONE user Objective',
    'continuation/nextActions','local-files-review/accept',
    'local-review/accept','COMPLETE_LOCAL','Do NOT bypass it'])
    assert.ok(instructions.includes(phrase),'Installed Host goal guidance missing: '+phrase);
  assert.match(instructions,new RegExp('host '+nativeHost+' plan "goal" REPOSITORY'));
  assert.equal((await manageHost(canonical,nativeHost,'status')).status,'ENABLED');
  if(nativeHost==='codex'){
    // The actual npm tarball must ship the MCP server and speak stdio JSON-RPC.
    const mcp=path.join(skill,'runtime','hosts','codex-mcp.mjs');
    assert.ok((await lstat(mcp)).isFile());
    const reqs=[
      {jsonrpc:'2.0',id:1,method:'initialize',
        params:{protocolVersion:'2025-06-18',
          clientInfo:{name:'codex-package-probe',version:'1'},capabilities:{}}},
      {jsonrpc:'2.0',method:'notifications/initialized'},
      {jsonrpc:'2.0',id:2,method:'tools/list'}
    ];
    const probe=spawnSync(process.execPath,
      [mcp,'--state',path.join(root,'mcp-inspection-state'),
        '--repository',canonical],{
        input:reqs.map(q=>JSON.stringify(q)).join('\n')+'\n',
        encoding:'utf8',shell:false,windowsHide:true,timeout:10000
      });
    assert.equal(probe.status,0,probe.stderr);
    const replies=probe.stdout.trim().split('\n').map(JSON.parse);
    assert.deepEqual(replies.map(q=>q.id),[1,2]);
    assert.equal(replies[0].result.serverInfo.name,'codefleet-codex');
    assert.ok(replies[1].result.tools.some(t=>t.name==='codefleet_goal_start'));
    assert.ok(!replies[1].result.tools.some(t=>t.name==='codefleet_execute'));
  }
  const exe=path.join(skill,'runtime','alpha','cli.mjs');
  assert.ok((await lstat(exe)).isFile());
  assert.ok((await lstat(path.join(skill,'runtime','product',
    'codex-mvp-facade.mjs'))).isFile());

  const host=(args,allowed)=>cli(exe,state,'host',[nativeHost,...args],allowed);
  const objective=(args,allowed)=>cli(exe,state,'objective',args,allowed);
  const planned=host(['plan','Implement Todo and Calendar behavior with two Node feature tests',
    canonical,'--local-existing','--acceptance','LOCAL_ONLY',
    '--attempts','2'],[0,2]).data;
  assert.equal(planned.contractKind,'EXISTING_LOCAL');
  assert.equal(planned.plan.probe.base,base);
  const id=planned.taskId;
  assert.ok(id?.startsWith('task-'));
  const sourcePaths=['src/todo.mjs','src/calendar.mjs'];
  const testPaths=['test/todo.test.mjs','test/calendar.test.mjs'];
  const draft={
    ...planned.plan.draft,
    requirements:['Existing Todo and Calendar source must satisfy both feature tests'],
    decisions:[{topic:'runtime',choice:'Node ESM',alternatives:[],
      rationale:'Existing repository runtime'}],
    plannedFiles:sourcePaths.map(path=>({path,purpose:'Implement bounded behavior'})),
    plannedTests:testPaths.map(path=>({path,criteria:['regression']})),
    criteria:[{id:'regression',description:'Both immutable tests pass',
      tests:testPaths}],
    scope:{includes:sourcePaths,excludes:testPaths},
    workItems:[
      {id:'todo',kind:'local-edit',dependencies:[],
        acceptanceCriteria:['Todo title validation'],files:[sourcePaths[0]]},
      {id:'calendar',kind:'local-edit',dependencies:['todo'],
        acceptanceCriteria:['Calendar shares Todo records'],files:[sourcePaths[1]]},
      {id:'verify',kind:'local-verification',dependencies:['calendar'],
        acceptanceCriteria:['Two integrated tests pass'],files:[]}
    ]
  };
  const draftFile=path.join(root,'draft.json');
  await writeFile(draftFile,JSON.stringify({revision:planned.revision,proposal:draft}));
  const validated=host(['draft',id,draftFile],[0,2]).data;
  assert.equal(validated.state,'VALIDATED');
  const prepared=host(['prepare',id],[2]).data;
  assert.ok(prepared.workflowHash);
  for(const [itemId,src,oldText,newText] of [
    ['todo',sourcePaths[0],beforeTodo,afterTodo],
    ['calendar',sourcePaths[1],beforeCalendar,afterCalendar]
  ]){
    const current=host(['status',id],[0,2]).data;
    assert.equal(current.complete,false);
    const packet={revision:current.revision,itemId,
      files:[{path:src,baseSha256:sha(oldText),content:newText}]};
    const packetFile=path.join(root,itemId+'.json');
    await writeFile(packetFile,JSON.stringify(packet));
    const proposal=host(['files',id,packetFile],[2]).data;
    assert.equal(proposal.complete,false);
    assert.equal(await readFile(path.join(canonical,src),'utf8'),oldText);
    const review=objective(['local-files-review',id,itemId],[2]).data;
    assert.ok(review.reviewRef&&review.reviewHash);
    const denied=objective(['local-files-accept',review.reviewRef,
      '--trust',review.reviewHash],[1,2]);
    assert.notEqual(denied.exitCode,0,'Hash without Local trust is not approval');
    const accepted=objective(['local-files-accept',review.reviewRef,
      '--trust',review.reviewHash,'--acknowledge-unisolated'],[0]).data;
    assert.equal(accepted.status,'MATERIALIZED');
    assert.equal(await readFile(path.join(canonical,src),'utf8'),newText);
    assert.equal(objective(['recover',id],[0]).data.status,'RECOVERED');
  }
  const requestFile=path.join(root,'verify.json');
  await writeFile(requestFile,JSON.stringify({
    executable:process.execPath,
    args:['--test','--test-reporter=tap',...testPaths],
    directory:canonical,timeoutMs:30000
  }));
  const review=objective(['local-review',id,requestFile],[2]).data;
  assert.ok(review.reviewRef&&review.reviewHash);
  const completion=objective(['local-accept',review.reviewRef,
    '--trust',review.reviewHash,'--acknowledge-unisolated'],[0]).data;
  assert.equal(completion.execution.status,'LOCAL_PASSED');
  assert.equal(completion.complete,true);
  const report=objective(['report',id],[0]).data;
  assert.equal(report.complete,true);
  assert.equal(report.acceptance.complete,true);
  assert.equal(report.continuation.status,'COMPLETE_LOCAL');
  assert.equal(report.protectedVerification,'UNSATISFIED');
  assert.equal(git(canonical,['rev-parse','HEAD']),base);
  const newCalendar=afterCalendar.replace('item.day===day','item.day!==day');
  await writeFile(path.join(canonical,'src/calendar.mjs'),newCalendar);
  const drift=objective(['report',id],[0]).data;
  assert.equal(drift.complete,false);
  assert.equal(drift.acceptance.complete,false);
  assert.ok(['LOCAL_ACCEPTANCE_UNSATISFIED','CURRENT_CANDIDATE_CHANGED'].includes(
    drift.acceptance.reason),'A post-acceptance source change must invalidate the approved Local outcome');
});
