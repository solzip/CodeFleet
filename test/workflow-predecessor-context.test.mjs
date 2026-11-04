import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { predecessorOrder, predecessorInput, applyPredecessorOverlay } from '../src/workflow/predecessor-context.mjs';

const graph = { items: [
  { id: 'a', dependencies: [], files: ['src/a.js'] },
  { id: 'b', dependencies: ['a'], files: ['src/b.js'] },
  { id: 'c', dependencies: ['a', 'b'], files: ['src/c.js'] },
] };
const rows = ['a','b'].map(id => ({ itemId:id, childId:'child-'+id, revision:1, status:'SUCCEEDED' }));
const getChild = id => ({ id, acceptedHash:'accepted-'+id, evidenceHash:'evidence-'+id, candidateHash:'candidate-'+id });
const accepted = child => ({ changedFiles: { ['src/'+child.id.slice(-1)+'.js']: 'export const fixed = true;' } });

test('dependency closure is topologically ordered, deterministic and excludes siblings', () => {
  assert.deepEqual(predecessorOrder(graph,'a'), []);
  assert.deepEqual(predecessorOrder(graph,'b'), ['a']);
  assert.deepEqual(predecessorOrder(graph,'c'), ['a','b']);
});
test('predecessor input derives actual verified patch and exact evidence refs', () => {
  const r=predecessorInput(graph,'c',{ a:'SUCCEEDED',b:'SUCCEEDED' },rows,getChild,accepted,1);
  assert.deepEqual(Object.keys(r.changes),['src/a.js','src/b.js']);
  assert.deepEqual(r.manifest.orderedAncestors,['a','b']);
  assert.equal(r.manifest.sources[0].evidenceHash,'evidence-a');
});
test('a missing dependency outcome or stale revision blocks the child', () => {
  assert.throws(()=>predecessorInput(graph,'c',{a:'FAILED',b:'SUCCEEDED'},rows,getChild,accepted,1),/not accepted/);
  assert.throws(()=>predecessorInput(graph,'c',{a:'SUCCEEDED',b:'SUCCEEDED'},rows,getChild,accepted,2),/Missing or ambiguous/);
});
test('duplicate predecessor attempts or out-of-scope patches are rejected', () => {
  assert.throws(()=>predecessorInput(graph,'b',{a:'SUCCEEDED'},[...rows,rows[0]],getChild,accepted,1),/ambiguous/);
  assert.throws(()=>predecessorInput(graph,'b',{a:'SUCCEEDED'},rows,getChild,()=>({changedFiles:{'src/b.js':'wrong'}}),1),/ownership/);
});
test('accepted predecessor bytes are materialized in the isolated child candidate', async t => {
  const root=await mkdtemp(join(tmpdir(),'cf-predecessor-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'src/a.js'),'base-a');
  await writeFile(join(root,'src/b.js'),'base-b');
  const result=await applyPredecessorOverlay(root,['src/a.js','src/b.js'],{'src/a.js':'verified-a'});
  assert.match(result.inputTreeHash,/^[a-f0-9]{64}$/);
  assert.equal(await readFile(join(root,'src/a.js'),'utf8'),'verified-a');
  assert.equal(await readFile(join(root,'src/b.js'),'utf8'),'base-b');
});
test('out-of-snapshot writes and binary materialization fail closed',async t=>{
  const root=await mkdtemp(join(tmpdir(),'cf-predecessor-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'src/a.js'),'base');
  await assert.rejects(applyPredecessorOverlay(root,['src/a.js'],{'src/missing.js':'unknown'}),/undeclared/);
  await assert.rejects(applyPredecessorOverlay(root,['src/a.js'],{'src/a.js':'\0'}),/Binary/);
});
