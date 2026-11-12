import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const server=fileURLToPath(new URL('../src/hosts/codex-mcp.mjs',import.meta.url));
const sha=text=>createHash('sha256').update(text).digest('hex');
const request=(id,method,params)=>({jsonrpc:'2.0',id,method,...(params?{params}:{})});
const tools=(id,name,args)=>request(id,'tools/call',{
  name,arguments:args
});
function talk(root,state,messages,{acceptance='LOCAL_ONLY',flags=[]}={}){
  const argv=[server,'--state',state,'--repository',root,
    '--acceptance',acceptance,...flags];
  const processResult=spawnSync(process.execPath,argv,{
    encoding:'utf8',input:messages.map(m=>JSON.stringify(m)).join('\n')+'\n',
    shell:false,windowsHide:true,timeout:20000,maxBuffer:2*1024*1024
  });
  assert.equal(processResult.status,0,processResult.stderr);
  return processResult.stdout.trim().split('\n').map(line=>JSON.parse(line));
}
const value=response=>{
  assert.ok(response.result,JSON.stringify(response));
  assert.notEqual(response.result.isError,true,JSON.stringify(response));
  const content=response.result.content;
  assert.equal(content.length,1);
  return JSON.parse(content[0].text);
};
const blocked=response=>{
  assert.equal(response.result?.isError,true,JSON.stringify(response));
  const error=JSON.parse(response.result.content[0].text);
  assert.equal(error.executionGranted,false);
  assert.equal(error.modelTurnStarted,false);
  assert.equal(error.replayAllowed,false);
  return error;
};
async function project(t,name){
  const root=await mkdtemp(join(tmpdir(),'cf-codex-mcp-'+name+'-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const repo=join(root,'project'),state=join(root,'state');
  await mkdir(join(repo,'src'),{recursive:true});
  await mkdir(join(repo,'test'),{recursive:true});
  const old="export const todo = title => ({title});\n";
  await writeFile(join(repo,'src/todo.mjs'),old);
  await writeFile(join(repo,'test/todo.test.mjs'),[
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import {todo} from '../src/todo.mjs';",
    "test('todo title normalized',()=>assert.equal(todo(' A ').title,'A'));",
    ''
  ].join('\n'));
  for(const args of [['init'],['add','.'],
    ['-c','user.name=Fixture','-c','user.email=fixture@example.invalid',
      'commit','-m','pinned source']]){
    const r=spawnSync('git',args,{cwd:repo,encoding:'utf8',shell:false,timeout:12000});
    assert.equal(r.status,0,r.stderr);
  }
  return {root,repo,state,old};
}
test('Codex MCP handshake and same-session Goal → validated Draft → pending DAG → scoped proposal without execution',async t=>{
  const f=await project(t,'full directory with spaces');
  const results=talk(f.repo,f.state,[
    request(1,'initialize',{protocolVersion:'2025-06-18',
      capabilities:{},clientInfo:{name:'codex-fixture',version:'1'}}),
    {jsonrpc:'2.0',method:'notifications/initialized'},
    request(2,'tools/list'),
    tools(3,'codefleet_goal_start',{
      goal:'Normalize Todo titles using the existing declared Node tests.'
    })
  ]);
  assert.deepEqual(results.map(x=>x.id),[1,2,3]);
  assert.equal(results[0].result.protocolVersion,'2025-06-18');
  assert.match(results[0].result.instructions,/PROPOSAL-ONLY/);
  assert.deepEqual(results[1].result.tools.map(x=>x.name),[
    'codefleet_goal_start','codefleet_goal_status',
    'codefleet_draft_submit','codefleet_goal_prepare',
    'codefleet_fileset_propose',
    'codefleet_fileset_review','codefleet_local_test_review'
  ]);
  assert.ok(!results[1].result.tools.some(x=>/run|apply|approve|execute|bill/.test(x.name)));
  const planned=value(results[2]);
  assert.equal(planned.contractKind,'EXISTING_LOCAL');
  assert.equal(planned.complete,false);
  assert.equal(planned.executionGranted,false);
  assert.equal(planned.modelTurnStarted,false);
  assert.equal(planned.plan.probe.state,'EXISTING_SOURCE');
  const taskId=planned.taskId;
  assert.ok(taskId?.startsWith('task-'));
  const status=value(talk(f.repo,f.state,[
    tools(4,'codefleet_goal_status',{taskId})
  ])[0]);
  assert.equal(status.taskId,taskId);
  assert.equal(status.revision,planned.revision);
  assert.equal(status.plan.probe.probeHash,planned.plan.probe.probeHash);
  assert.equal(status.complete,false);
  const tests=['test/todo.test.mjs'],files=['src/todo.mjs'];
  const draft={
    ...status.plan.draft,
    requirements:['Normalize title whitespace without changing identity'],
    decisions:[{topic:'runtime',choice:'Node ESM',alternatives:[],
      rationale:'Keep current Node tests'}],
    plannedFiles:[{path:files[0],purpose:'Normalize Todo title'}],
    plannedTests:tests.map(path=>({path,criteria:['regression']})),
    criteria:[{id:'regression',description:'Existing title test passes',tests}],
    scope:{includes:files,excludes:tests},
    workItems:[
      {id:'todo',kind:'local-edit',dependencies:[],
       acceptanceCriteria:['Normalize Todo titles'],files},
      {id:'verify',kind:'local-verification',dependencies:['todo'],
       acceptanceCriteria:['Run declared Todo test'],files:[]}
    ]
  };
  const drafted=value(talk(f.repo,f.state,[
    tools(5,'codefleet_draft_submit',{
      taskId,revision:status.revision,proposal:draft})
  ])[0]);
  assert.equal(drafted.status,'VALIDATED');
  const prepared=value(talk(f.repo,f.state,[
    tools(6,'codefleet_goal_prepare',{taskId})
  ])[0]);
  assert.equal(prepared.prepared,true);
  assert.equal(prepared.executionGranted,false);
  assert.equal(prepared.workflowApproved,false);
  assert.ok(prepared.workflowHash);
  assert.equal(await readFile(join(f.repo,files[0]),'utf8'),f.old);
  const next="export const todo = title => ({title:title.trim()});\n";
  const packet={taskId,revision:prepared.revision,itemId:'todo',files:[
    {path:files[0],baseSha256:sha(f.old),content:next}
  ]};
  const proposed=value(talk(f.repo,f.state,[
    tools(7,'codefleet_fileset_propose',packet)
  ])[0]);
  assert.ok(proposed.approvalRequest);
  assert.equal(proposed.executionGranted,false);
  assert.equal(proposed.applicationPerformed,false);
  assert.equal(await readFile(join(f.repo,files[0]),'utf8'),f.old);
  assert.equal(value(talk(f.repo,f.state,[
    tools(8,'codefleet_goal_status',{taskId})
  ])[0]).complete,false);
  const denied=blocked(talk(f.repo,f.state,[
    tools(9,'codefleet_fileset_propose',packet)
  ])[0]);
  assert.ok(['STALE_SCOPE','INVALID_OR_BLOCKED','REVIEW_OR_DEPENDENCY_REQUIRED'].includes(denied.reason));

  // The MCP offers only exact reviews. A separately supervised CLI call,
  // representing an explicitly reviewed one-use Local approval in this
  // disposable test, owns every actual file write and test execution.
  const filesReview=value(talk(f.repo,f.state,[
    tools(10,'codefleet_fileset_review',{taskId,itemId:'todo'})
  ])[0]);
  assert.equal(filesReview.kind,'CODEFLEET_OWNER_FILESET_REVIEW_V1');
  assert.equal(filesReview.executionGranted,false);
  assert.equal(filesReview.applicationPerformed,false);
  assert.equal(filesReview.ownerAuthenticated,false);
  assert.equal(filesReview.files[0].content,next);
  assert.ok(filesReview.reviewRef&&filesReview.reviewHash);
  assert.equal(filesReview.ownerAction.executable,process.execPath);
  assert.equal(filesReview.ownerAction.args[1],'--state');
  assert.equal(filesReview.ownerAction.args[2],f.state);
  assert.equal(filesReview.ownerAction.requiredOwnerAcknowledgment,
    '--acknowledge-unisolated');
  assert.deepEqual(filesReview.ownerAction.args.slice(3),[
    'objective','local-files-accept',filesReview.reviewRef,
    '--trust',filesReview.reviewHash
  ]);
  assert.equal(await readFile(join(f.repo,files[0]),'utf8'),f.old);
  const owner=(action,approved=true,expected=0)=>{
    assert.equal(action.ownerMustReviewAndRunSeparately,true);
    const argv=[...action.args,...(approved?[action.requiredOwnerAcknowledgment]:[])];
    const response=spawnSync(action.executable,argv,
      {encoding:'utf8',shell:false,windowsHide:true,timeout:25000});
    assert.equal(response.status,expected,response.stderr+'\n'+response.stdout);
    return JSON.parse(response.stdout);
  };
  // A machine-provided action is inert unless the Owner independently
  // inspects it and explicitly adds the separate acknowledgment flag.
  owner(filesReview.ownerAction,false,1);
  assert.equal(await readFile(join(f.repo,files[0]),'utf8'),f.old);
  const applied=owner(filesReview.ownerAction);
  assert.equal(applied.status,'MATERIALIZED');
  assert.equal(await readFile(join(f.repo,files[0]),'utf8'),next);
  const testReview=value(talk(f.repo,f.state,[
    tools(11,'codefleet_local_test_review',{taskId})
  ])[0]);
  assert.equal(testReview.kind,'CODEFLEET_OWNER_LOCAL_TEST_REVIEW_V1');
  assert.equal(testReview.executionGranted,false);
  assert.equal(testReview.testExecuted,false);
  assert.deepEqual(testReview.command.args,[
    '--test','--test-reporter=tap','test/todo.test.mjs'
  ]);
  assert.equal(testReview.command.executable,process.execPath);
  assert.ok(testReview.reviewRef&&testReview.reviewHash);
  assert.deepEqual(testReview.ownerAction.args.slice(3),[
    'objective','local-accept',testReview.reviewRef,
    '--trust',testReview.reviewHash
  ]);
  owner(testReview.ownerAction,false,1);
  const verified=owner(testReview.ownerAction);
  assert.equal(verified.execution.status,'LOCAL_PASSED');
  assert.equal(verified.complete,true);
  const finished=value(talk(f.repo,f.state,[
    tools(12,'codefleet_goal_status',{taskId})
  ])[0]);
  assert.equal(finished.complete,true);
  assert.equal(finished.acceptance.complete,true);
  assert.equal(finished.continuation.status,'COMPLETE_LOCAL');
  assert.equal(finished.protectedVerification,'UNSATISFIED');
  assert.equal(finished.acceptancePolicy,'LOCAL_ONLY');
  const noReplay=blocked(talk(f.repo,f.state,[
    tools(13,'codefleet_local_test_review',{taskId})
  ])[0]);
  assert.equal(noReplay.executionGranted,false);
});
test('Codex MCP refuses executable/approval tools, unbound repo and source-side State',async t=>{
  const f=await project(t,'negative');
  const unapproved=talk(f.repo,f.state,[
    tools(1,'codefleet_execute',{command:'node --test'}),
    tools(10,'codefleet_local_test_review',{taskId:'invalid',executable:'/tmp/malicious'}),
    tools(2,'codefleet_goal_start',{
      goal:'Normalize titles safely in this source repository.',
      executionGranted:true
    })
  ]);
  unapproved.forEach(blocked);
  assert.ok(!(await lstat(f.state).catch(()=>null)),
    'Rejected tools should not create State');
  const start=value(talk(f.repo,f.state,[
    tools(3,'codefleet_goal_start',{
      goal:'Normalize Todo title whitespace under current tests.'
    })
  ],{acceptance:'PROTECTED_REQUIRED'})[0]);
  assert.equal(start.executionGranted,false);
  assert.equal(start.modelTurnStarted,false);
  const other=await project(t,'foreign');
  const noRead=blocked(talk(other.repo,f.state,[
    tools(4,'codefleet_goal_status',{taskId:start.taskId})
  ])[0]);
  assert.equal(noRead.executionGranted,false);
  const denied=spawnSync(process.execPath,[
    server,'--state',join(f.repo,'state'), '--repository',f.repo,
    '--acceptance','LOCAL_ONLY'
  ],{encoding:'utf8',input:JSON.stringify(request(5,'initialize'))+'\n',
    shell:false,timeout:10000});
  assert.equal(denied.status,2);
  assert.equal(denied.stdout,'');
  assert.ok(!(await lstat(join(f.repo,'state')).catch(()=>null)));
});
test('Codex MCP malformed requests and unknown methods fail closed without State effects',async t=>{
  const f=await project(t,'protocol');
  const run=spawnSync(process.execPath,[
    server,'--state',f.state,'--repository',f.repo
  ],{
    input:'{malformed\n'+JSON.stringify(request(1,'untrusted/execute'))+'\n'+
      JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n'+
      JSON.stringify(request(2,'ping'))+'\n',
    encoding:'utf8',shell:false,timeout:10000
  });
  assert.equal(run.status,0,run.stderr);
  const lines=run.stdout.trim().split('\n').map(s=>JSON.parse(s));
  assert.deepEqual(lines.map(x=>x.id),[null,1,2]);
  assert.equal(lines[0].error.code,-32700);
  assert.equal(lines[1].error.code,-32601);
  assert.deepEqual(lines[2].result,{});
  assert.ok(!(await lstat(f.state).catch(()=>null)),
    'Protocol handshake must not create a Store or invoke a model');
});
