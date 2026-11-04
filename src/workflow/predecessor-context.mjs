// Predecessor code, not chat history, is the input to a dependent WorkItem.
// Reuses existing accepted child artifacts and makes dependency overlays explicit.
// No separate DAG scheduler, mutable side channel or alternate Outcome authority.
import path from 'node:path';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { filePath, hash } from '../alpha/contract.mjs';

export function predecessorOrder(workflow, itemId) {
  const nodes = new Map((workflow?.items ?? []).map(item => [item.id, item]));
  if (!nodes.has(itemId)) throw Error('Unknown dependent WorkItem');
  const visited = new Set(), visiting = new Set(), order = [];
  function visit(id) {
    if (visiting.has(id)) throw Error('Predecessor cycle');
    if (visited.has(id)) return;
    const node = nodes.get(id);
    if (!node) throw Error('Unknown predecessor WorkItem');
    visiting.add(id);
    for (const dependency of node.dependencies) visit(dependency);
    visiting.delete(id); visited.add(id);
    if (id !== itemId) order.push(id);
  }
  visit(itemId);
  return order;
}

// accepted(child) MUST be the Controller's existing verified-evidence predicate.
// A row or model-reported success alone is never a usable predecessor.
export function predecessorInput(workflow, itemId, states, attemptRows, getChild, accepted, revision) {
  const order = predecessorOrder(workflow, itemId), changes = {}, sources = [];
  for (const dependency of order) {
    if (states[dependency] !== 'SUCCEEDED') throw Error('Predecessor is not accepted');
    const rows = attemptRows.filter(row => row.itemId === dependency &&
      row.status === 'SUCCEEDED' && row.revision === revision);
    if (rows.length !== 1) throw Error('Missing or ambiguous committed predecessor Attempt');
    const child = getChild(rows[0].childId);
    const patch = accepted(child);
    if (!patch || !patch.changedFiles || typeof patch.changedFiles !== 'object') throw Error('Missing verified predecessor artifact');
    const owner = workflow.items.find(item => item.id === dependency);
    const fileHashes = {};
    for (const [file, body] of Object.entries(patch.changedFiles)) {
      filePath(file);
      if (!owner.files.includes(file) || Object.hasOwn(changes, file) ||
          typeof body !== 'string' || Buffer.byteLength(body) > 64000)
        throw Error('Predecessor artifact violates exact file ownership');
      changes[file] = body; fileHashes[file] = hash(body);
    }
    sources.push({ itemId: dependency, childId: child.id,
      acceptedHash: child.acceptedHash, evidenceHash: child.evidenceHash,
      candidateHash: child.candidateHash, fileHashes });
  }
  return { changes, manifest: { kind: 'ACCEPTED_PREDECESSOR_INPUT_V1',
    itemId, revision, orderedAncestors: order, sources } };
}

// Run after the ordinary pinned-Git snapshot, before the child reads context
// or invokes any Host. The overlay is materialized only in that candidate root.
export async function applyPredecessorOverlay(directory, names, changes) {
  if (!path.isAbsolute(directory) || !Array.isArray(names) ||
      new Set(names).size !== names.length) throw Error('Invalid candidate snapshot');
  const allowed = new Set(names);
  for (const [file, body] of Object.entries(changes)) {
    filePath(file);
    if (!allowed.has(file) || typeof body !== 'string' || Buffer.byteLength(body) > 64000)
      throw Error('Predecessor cannot introduce or modify an undeclared snapshot file');
    const target = path.join(directory, file);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Predecessor input is not a regular file');
    const before = await readFile(target, 'utf8');
    if (before.includes('\0') || body.includes('\0')) throw Error('Binary predecessor change not supported');
    await writeFile(target, body, 'utf8');
  }
  return { inputTreeHash: hash(Object.entries(changes).sort(([a], [b]) => a.localeCompare(b))) };
}
