#!/usr/bin/env node
// Actual Codex CLI MCP registration acceptance, with NO Codex model Turn.
// CI installs pinned @openai/codex separately with --ignore-scripts.
// All Codex configuration, source writes and CodeFleet State are temporary.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const CLI_VERSION='0.167.1';
const repoRoot=fileURLToPath(new URL('../',import.meta.url));
const codexEntry=join(repoRoot,'node_modules','@openai','codex','bin','codex.js');
const mcpEntry=join(repoRoot,'src','hosts','codex-mcp.mjs');
const jsonRpc=(id,method,params)=>({jsonrpc:'2.0',id,method,...(params?{params}:{})});
const run=(executable,args,{cwd=repoRoot,env=process.env,input=null,allowed=[0],timeout=60000}={})=>{
  const result=spawnSync(executable,args,{
    cwd,env,input,shell:false,windowsHide:true,encoding:'utf8',
    timeout,maxBuffer:3*1024*1024
  });
  if(result.error)throw result.error;
  assert.ok(allowed.includes(result.status),
    'Command '+args.slice(0,3).join(' ')+' exit '+result.status+
    ': '+result.stderr.slice(-1600)+' '+result.stdout.slice(-1600));
  return result;
};
const getJson=result=>{
  try{return JSON.parse(result.stdout);}
  catch{throw Error('Expected JSON-only CLI output');}
};
const root=await mkdtemp(join(tmpdir(),'cf-codex-cli-compat-'));
try{
  // A distinct temporary CODEX_HOME is the only place where the official
  // Codex client may write its MCP config. Do not modify the real user home,
  // use a logged-in account, call codex exec or start a billable model Turn.
  const project=join(root,'Todo project with spaces');
  const codexHome=join(root,'private codex home');
  const state=join(root,'private CodeFleet state');
  await mkdir(join(project,'src'),{recursive:true});
  await mkdir(join(project,'test'),{recursive:true});
  await mkdir(codexHome,{recursive:true});
  const original="export const title = input => input;\n";
  await writeFile(join(project,'src','todo.mjs'),original);
  await writeFile(join(project,'test','todo.test.mjs'),[
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import {title} from '../src/todo.mjs';",
    "test('normalize title',()=>assert.equal(title(' A '),'A'));",
    ""
  ].join('\n'));
  run('git',['init'],{cwd:project});
  run('git',['add','.'],{cwd:project});
  run('git',['-c','user.name=Fixture','-c',
    'user.email=fixture@example.invalid','commit','-m','immutable baseline'],
    {cwd:project});
  const beforeHead=run('git',['rev-parse','HEAD'],{cwd:project}).stdout.trim();
  const cleanBefore=run('git',['status','--porcelain'],{cwd:project}).stdout.trim();
  assert.equal(cleanBefore,'');
  const codexEnv={...process.env,CODEX_HOME:codexHome};
  for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_ACCESS_TOKEN',
    'OPENAI_ORG_ID','OPENAI_PROJECT_ID','CODEX_TOKEN'])
    delete codexEnv[key];
  // Invoke the real, pinned Codex distribution, not a mock CLI.
  const codex=args=>run(process.execPath,[codexEntry,...args],{
    cwd:project,env:codexEnv,timeout:60000
  });
  assert.match(codex(['--version']).stdout,/\b0\.167\.1\b/);
  const serverName='codefleet-acceptance';
  const serverArgs=[
    mcpEntry,'--state',state,'--repository',project,
    '--acceptance','LOCAL_ONLY'
  ];
  codex(['mcp','add',serverName,'--',process.execPath,...serverArgs]);
  const entry=getJson(codex(['mcp','get',serverName,'--json']));
  assert.equal(entry.name,serverName);
  assert.equal(entry.enabled,true);
  assert.equal(entry.transport.type,'stdio');
  assert.equal(entry.transport.command,process.execPath);
  assert.deepEqual(entry.transport.args,serverArgs,
    'Official Codex must preserve exact Node executable, State and scope argv');
  const configs=getJson(codex(['mcp','list','--json']));
  assert.ok(Array.isArray(configs),'Official CLI list must be an array');
  const discovered=configs.find(item=>item.name===serverName);
  assert.ok(discovered,'Official Codex CLI must discover the configured MCP');
  assert.equal(discovered.transport.type,'stdio');
  assert.equal(discovered.transport.command,process.execPath);
  assert.deepEqual(discovered.transport.args,serverArgs);
  // Exercise the *exact stdio command* the native Codex client persisted.
  // Real Codex did registration/get/list. This protocol smoke does not pretend
  // that Codex's model selected or invoked a tool.
  const handshake=[
    jsonRpc(1,'initialize',{
      protocolVersion:'2025-06-18',
      clientInfo:{name:'native-codex-cli-registration-smoke',version:'1'},
      capabilities:{}
    }),
    {jsonrpc:'2.0',method:'notifications/initialized'},
    jsonRpc(2,'tools/list'),
    jsonRpc(3,'tools/call',{
      name:'codefleet_goal_start',
      arguments:{goal:'Build a Todo title normalizer against existing Node tests'}
    })
  ];
  const processResult=run(entry.transport.command,entry.transport.args,{
    cwd:project,env:codexEnv,
    input:handshake.map(v=>JSON.stringify(v)).join('\n')+'\n',
    timeout:30000
  });
  const replies=processResult.stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies.map(r=>r.id),[1,2,3]);
  assert.equal(replies[0].result.protocolVersion,'2025-06-18');
  const tools=replies[1].result.tools.map(t=>t.name);
  for(const name of [
    'codefleet_goal_start','codefleet_goal_status',
    'codefleet_draft_submit','codefleet_goal_prepare',
    'codefleet_fileset_propose','codefleet_fileset_review',
    'codefleet_local_test_review'
  ])assert.ok(tools.includes(name),'Missing registered product tool: '+name);
  assert.equal(tools.length,7);
  assert.ok(tools.every(name=>!/execute|approve|accept|apply|grant/.test(name)),
    'Model-facing MCP tool list must not include approval or source effects');
  const response=replies[2].result;
  assert.equal(response.isError,undefined,JSON.stringify(response));
  const objective=JSON.parse(response.content[0].text);
  assert.equal(objective.contractKind,'EXISTING_LOCAL');
  assert.equal(objective.acceptancePolicy,'LOCAL_ONLY');
  assert.ok(objective.taskId.startsWith('task-'));
  assert.equal(objective.executionGranted,false);
  assert.equal(objective.modelTurnStarted,false);
  assert.equal(objective.complete,false);
  assert.equal(await readFile(join(project,'src','todo.mjs'),'utf8'),original);
  assert.equal(run('git',['rev-parse','HEAD'],{cwd:project}).stdout.trim(),
    beforeHead,'No model-controlled project commit permitted');
  assert.equal(run('git',['status','--porcelain'],{cwd:project}).stdout.trim(),
    cleanBefore,'MCP registration and Goal preparation must not dirty project');
  const config=join(codexHome,'config.toml');
  assert.ok((await lstat(config)).isFile(),
    'Official Codex must write config only inside temporary CODEX_HOME');
  assert.equal((await lstat(state)).isDirectory(),true);
  // Nonbillable preflight of the *same ephemeral -c overrides* later used
  // by codex exec --ignore-user-config. They must work without mutating
  // the user's global Codex config or starting a model Turn.
  const ephemeralName='codefleet_live';
  const ephemeralParams=[
    '-c','mcp_servers.'+ephemeralName+'.command='+JSON.stringify(process.execPath),
    '-c','mcp_servers.'+ephemeralName+'.args='+JSON.stringify(serverArgs),
    '-c','mcp_servers.'+ephemeralName+'.enabled=true'
  ];
  const extra=getJson(codex(['mcp','list','--json',...ephemeralParams]));
  const inline=extra.find(item=>item.name===ephemeralName);
  assert.ok(inline,'Codex must accept ephemeral MCP config overrides');
  assert.equal(inline.transport.command,process.execPath);
  assert.deepEqual(inline.transport.args,serverArgs);
  const execHelp=codex(['exec','--help']).stdout;
  assert.match(execHelp,/--ignore-user-config/);
  assert.match(execHelp,/--ephemeral/);
  assert.match(execHelp,/--sandbox/);
  assert.match(execHelp,/--json/);
  codex(['mcp','remove',serverName]);
  assert.equal(getJson(codex(['mcp','list','--json']))
    .some(item=>item.name===serverName),false);
  console.log(JSON.stringify({
    acceptance:'OFFICIAL_CODEX_CLI_MCP_REGISTRATION_PASS',
    codexVersion:CLI_VERSION,registered:true,discovered:true,
    toolCount:tools.length,goalPersisted:true,sourceUnchanged:true,
    codexHomeIsolated:true,modelTurnsActuallyRun:0,
    codexModelAuthInvoked:false,codexHostLiveAcceptance:'NOT_VERIFIED',
    ownerGrantIssued:false,protectedExecution:'NOT_RUN'
  }));
}finally{
  await rm(root,{recursive:true,force:true});
}
