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
  assert.ok(manifest[0].files.every(f=>
    !/^(test|\.git|\.codefleet|node_modules)\//.test(f.path)),
    'Private fixtures and State must not ship');
  const installed=path.join(root,'installed-package');
  await mkdir(installed);
  const result=proc(process.execPath,
    [npm,'install','--offline','--ignore-scripts','--no-audit','--no-fund',
      '--cache',cache,path.join(root,manifest[0].filename)],
    installed);
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

function proc(exe,args,cwd){
  const r=spawnSync(exe,args,{cwd,encoding:'utf8',timeout:30000,
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
test('installed Codex Skill advances one Objective to Local complete and detects drift',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'cf-installed-goal-'));
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
  assert.equal((await installHost(canonical,'codex')).status,'INSTALLED_OFFLINE');
  const skill=path.join(canonical,'.agents','skills','codefleet');
  const instructions=await readFile(path.join(skill,'SKILL.md'),'utf8');
  for(const phrase of ['Goal-to-verified-result loop','ONE user Objective',
    'continuation/nextActions','local-files-review/accept',
    'local-review/accept','COMPLETE_LOCAL','Do NOT bypass it'])
    assert.ok(instructions.includes(phrase),'Installed Host goal guidance missing: '+phrase);
  assert.equal((await manageHost(canonical,'codex','status')).status,'ENABLED');
  const exe=path.join(skill,'runtime','alpha','cli.mjs');
  assert.ok((await lstat(exe)).isFile());
  assert.ok((await lstat(path.join(skill,'runtime','product',
    'codex-mvp-facade.mjs'))).isFile());

  const host=(args,allowed)=>cli(exe,state,'host',['codex',...args],allowed);
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
test('installed Claude Skill uses the same bounded Goal loop',async t=>{
  const repo=await mkdtemp(path.join(tmpdir(),'cf-installed-claude-'));
  t.after(()=>rm(repo,{recursive:true,force:true}));
  const {installHost}=await packagedRuntime(repo);
  await installHost(repo,'claude');
  const skill=path.join(repo,'.claude','skills','codefleet');
  const text=await readFile(path.join(skill,'SKILL.md'),'utf8');
  assert.match(text,/host claude plan "goal" REPOSITORY/);
  assert.match(text,/Goal-to-verified-result loop/);
  assert.match(text,/COMPLETE_LOCAL/);
  assert.ok((await lstat(path.join(skill,'runtime','product','report.mjs'))).isFile());
});
