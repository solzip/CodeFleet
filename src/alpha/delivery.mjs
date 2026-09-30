import { command, environment, requireSuccess } from './process.mjs';
import { hash } from './contract.mjs';

async function api(endpoint, method = 'GET', body) {
  const args = ['api', endpoint, '--method', method];
  if (body !== undefined) args.push('--input', '-');
  const r = await command('gh', args, { env: environment('delivery'), input: body === undefined ? '' : JSON.stringify(body), timeoutMs: 30000 });
  if (r.exitCode !== 0) {
    const e = Error(`GitHub ${method} failed: ${r.stderr.toString('utf8').slice(-1500)}`);
    e.notFound = /HTTP 404/.test(r.stderr.toString('utf8')); throw e;
  }
  return JSON.parse(requireSuccess(r, 'GitHub API'));
}
export async function deliver(run, files, call = api, checkpoint = () => {}) {
  const { repository, base } = run.contract.delivery;
  const root = `repos/${repository}`;
  const branch = `codefleet/${run.id}`;
  const marker = `CodeFleet run ${run.id}\nEvidence ${run.evidenceHash}\nCandidate ${run.candidateHash}`;
  const baseRef = await call(`${root}/git/ref/heads/${base}`);
  if (baseRef.object.sha !== run.base) throw Error('Remote base changed or does not match the verified local base; create a new run');
  let existing;
  try { existing = await call(`${root}/git/ref/heads/${branch}`); } catch (e) { if (!e.notFound) throw e; }
  let commit;
  if (existing) {
    commit = await call(`${root}/git/commits/${existing.object.sha}`);
    if (commit.message !== marker || commit.parents.length !== 1 || commit.parents[0].sha !== run.base) throw Error('Remote branch exists with a different intent; refusing to overwrite');
    // Verify the actual content, not only an editable marker in the commit message.
    const tree = await call(`${root}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw Error('Cannot reconcile a truncated remote tree');
    for (const [name, body] of Object.entries(files)) {
      const entry = tree.tree.find(e => e.path === name && e.type === 'blob');
      if (!entry) throw Error('Delivered file missing');
      const blob = await call(`${root}/git/blobs/${entry.sha}`);
      if (blob.encoding !== 'base64' || hash(Buffer.from(blob.content, 'base64')) !== hash(body)) throw Error('Remote branch content differs from verified candidate');
    }
    const diff = await call(`${root}/compare/${run.base}...${commit.sha}`);
    if (!Array.isArray(diff.files) || diff.files.length !== Object.keys(files).length || diff.files.some(f => !Object.hasOwn(files, f.filename) || f.status !== 'modified')) throw Error('Remote branch has changes outside the delegated files');
  } else {
    const original = await call(`${root}/git/commits/${run.base}`);
    const sourceTree = await call(`${root}/git/trees/${original.tree.sha}?recursive=1`);
    if (sourceTree.truncated) throw Error('Remote tree too large');
    const tree = [];
    for (const [name, body] of Object.entries(files)) {
      const entry = sourceTree.tree.find(e => e.path === name && e.type === 'blob');
      if (!entry || !['100644', '100755'].includes(entry.mode)) throw Error('Delivery requires an existing regular file');
      const blob = await call(`${root}/git/blobs`, 'POST', { content: Buffer.from(body).toString('base64'), encoding: 'base64' });
      tree.push({ path: name, mode: entry.mode, type: 'blob', sha: blob.sha });
    }
    const candidate = await call(`${root}/git/trees`, 'POST', { base_tree: original.tree.sha, tree });
    const identity = { name: run.contract.delivery.authorName, email: run.contract.delivery.authorEmail };
    commit = await call(`${root}/git/commits`, 'POST', { message: marker, tree: candidate.sha, parents: [run.base], author: identity, committer: identity });
    checkpoint('BEFORE_BRANCH');
    await call(`${root}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha });
  }
  const owner = repository.split('/')[0];
  const prs = await call(`${root}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(base)}&per_page=100`);
  if (prs.length > 1) throw Error('Multiple matching PRs; manual reconciliation required');
  if (prs.length === 1) {
    if (prs[0].head.sha !== commit.sha) throw Error('Existing PR head differs from verified delivery');
    return { url: prs[0].html_url, state: prs[0].state, reconciled: true, commit: commit.sha };
  }
  checkpoint('BEFORE_PR');
  const pr = await call(`${root}/pulls`, 'POST', {
    title: `CodeFleet: ${run.contract.goal.replace(/[\r\n]/g, ' ').slice(0, 100)}`, head: branch, base, draft: true,
    body: `Automated alpha proposal. Human review is required before merge.\n\n${marker}\n\nDeclared Node tests passed in the pinned, network-disabled container. Tests: ${run.contract.tests.join(', ')}.\n\nNo automatic merge or deployment. Local evidence is retained by the operator; source context and test logs are not uploaded in this PR.`
  });
  return { url: pr.html_url, state: pr.state, reconciled: false, commit: commit.sha };
}
