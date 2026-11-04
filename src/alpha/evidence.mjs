import { hash } from './contract.mjs';
import { judge } from './judge.mjs';
import { approvedDevelopmentBaseline } from './development-baseline.mjs';
import { candidateHash } from './workspace.mjs';
import { validateWorkflow } from '../workflow/definition.mjs';
import { attempts } from '../workflow/persistence.mjs';

// Read-only inspection shared by reports and export. State text is not evidence.
export async function verifiedEvidence(store, run) {
  let child = run;
  if (run.kind === 'workflow') {
    const source = store.readArtifact(run.sourceRef);
    validateWorkflow(run.contract, source);
    if (run.state !== 'COMPLETED' || !run.finalRunId || hash(store.readArtifact(run.graphRef)) !== hash(run.contract)) throw Error('Workflow final verification incomplete');
    const records = attempts(store, run.id);
    const expectedItems = new Set([...run.contract.items.map(n=>n.id),'final']);
    const acceptedRows = [];
    for (const itemId of expectedItems) {
      const history = records.filter(a=>a.itemId===itemId);
      if (!history.length || history.some(a=>a.status==='STARTED') ||
          history.at(-1).status !== 'SUCCEEDED' ||
          history.slice(0,-1).some(a=>a.status!=='FAILED'))
        throw Error('Workflow Attempt history lacks a terminal accepted generation');
      acceptedRows.push(history.at(-1));
    }
    if (records.some(a=>!expectedItems.has(a.itemId))) throw Error('Unexpected Workflow Attempt identity');
    for (const a of acceptedRows) {
      const c = store.get(a.childId), node = run.contract.items.find(n => n.id === a.itemId);
      const final = a.itemId === 'final';
      if (c.workflowParent !== run.id || c.base !== run.base || (!final && !node) || c.contractHash !== hash({ ...source, files: final ? source.files : node.files, tests: final ? source.tests : node.tests, maxAttempts: 1 })) throw Error('Workflow child contract mismatch');
      if (run.contract.schemaVersion === 2 && (a.revision !== run.revision || c.workflowGraphHash !== run.contractHash || c.workflowRevision !== run.revision)) throw Error('Workflow revision mismatch');
      inspect(store, c);
      if (final && c.id !== run.finalRunId) throw Error('Final attempt mismatch');
    }
    child = store.get(run.finalRunId);
    if (run.acceptedHash !== child.acceptedHash || run.evidenceHash !== child.evidenceHash || run.candidateHash !== child.candidateHash) throw Error('Final evidence binding mismatch');
  }
  const result = inspect(store, child);
  // Historical V1 artifacts did not store the snapshot path list. Their artifact
  // verification remains supported, without claiming a current-directory check.
  if (child.candidatePaths) {
    if (await candidateHash(child.candidateDirectory, child.candidatePaths) !== child.candidateHash) throw Error('Candidate tree changed after verification');
  } else if (run.kind === 'workflow' && run.contract.schemaVersion === 2) throw Error('Final tree identity unavailable');
  return { ...result, treeRechecked: Boolean(child.candidatePaths), contractHash: child.contractHash };
}

function inspect(store, run) {
  if (hash(run.contract) !== run.contractHash || !run.acceptedHash || !run.evidenceHash) throw Error('No fixed verified candidate');
  const accepted = store.readArtifact(run.acceptedHash), evidence = store.readArtifact(run.evidenceHash);
  if (accepted.contractHash !== run.contractHash || evidence.contractHash !== run.contractHash || accepted.candidateHash !== run.candidateHash || evidence.candidateHash !== run.candidateHash || judge(evidence).outcome !== 'ACCEPT' || !approvedDevelopmentBaseline(store,run) throw Error('Verification evidence invalid');
  if (!accepted.changedFiles || !Object.keys(accepted.changedFiles).length || Object.keys(accepted.changedFiles).some(f => !run.contract.files.includes(f))) throw Error('Accepted patch outside contract');
  return { accepted, evidence };
}
