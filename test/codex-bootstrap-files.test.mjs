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
