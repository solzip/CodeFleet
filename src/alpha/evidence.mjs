import { hash } from './contract.mjs';
import { judge, isFailingBaseline } from './judge.mjs';
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
    if (records.length !== run.contract.items.length + 1 || records.some(a => a.status !== 'SUCCEEDED')) throw Error('Workflow attempts incomplete');
    for (const a of records) {
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
  if (accepted.contractHash !== run.contractHash || evidence.contractHash !== run.contractHash || accepted.candidateHash !== run.candidateHash || evidence.candidateHash !== run.candidateHash || judge(evidence).outcome !== 'ACCEPT' || !isFailingBaseline(store.readArtifact(run.baselineHash))) throw Error('Verification evidence invalid');
  if (!accepted.changedFiles || !Object.keys(accepted.changedFiles).length || Object.keys(accepted.changedFiles).some(f => !run.contract.files.includes(f))) throw Error('Accepted patch outside contract');
  return { accepted, evidence };
}
