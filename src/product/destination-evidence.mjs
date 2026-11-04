// Trusted post-apply Local criterion producer. It consumes explicit operator
// command approval, invokes the existing independent localBackend, and stores
// content-addressed evidence on the real delivered destination tree.
// NOT a protected verifier or a model-generated self-assessment.
import path from 'node:path';
import { hash } from '../alpha/contract.mjs';
import { candidateHash } from '../alpha/workspace.mjs';
import { localBackend, inspectLocalCommand } from '../verification/backends.mjs';

const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);

export function createLocalDestinationVerifier(store, {
  criteria, commandSpecs, obtainGrant, backend = localBackend()
} = {}) {
  if (!store || !Array.isArray(criteria) || !criteria.length ||
      !commandSpecs || typeof obtainGrant !== 'function') throw Error('Trusted criterion commands and grant callback required');
  const approvedCriteria = structuredClone(criteria);
  const specs = structuredClone(commandSpecs);
  if (new Set(approvedCriteria.map(c=>c.id)).size !== approvedCriteria.length ||
      approvedCriteria.some(c=>!c.id || !['LOCAL_EXECUTED','OWNER_REVIEW'].includes(c.requiredAuthority)))
    throw Error('Invalid Local criterion/authority contract');
  return {
    // This is called by the trusted Controller only AFTER a destination delivery
    // has been durably recorded. No verification command gets its own grant from
    // any model output or CLI-supplied actor string.
    async verify({ run, delivery, candidate }) {
      if (delivery?.status !== 'DELIVERED_NOT_VERIFIED' ||
          !sha(delivery.targetTreeHash) || delivery.targetTreeHash !== candidate?.candidateHash ||
          run?.repo !== candidate?.repo || !Array.isArray(candidate.candidatePaths))
        throw Error('Delivered-tree verification binding absent');
      if (await candidateHash(run.repo,candidate.candidatePaths) !== delivery.targetTreeHash)
        throw Error('Destination changed before criterion verification');
      const evidenceRefs = {};
      const criteriaCopy = structuredClone(approvedCriteria);
      for (const criterion of criteriaCopy) {
        if (criterion.requiredAuthority === 'OWNER_REVIEW') continue;
        const command = specs[criterion.id];
        if (!command || command.directory !== run.repo || !path.isAbsolute(command.executable) ||
            !Array.isArray(command.args) || !Number.isInteger(command.timeoutMs))
          throw Error('Exact approved criterion command missing');
        const request = { executable:command.executable,args:[...command.args],
          directory:run.repo,timeoutMs:command.timeoutMs,
          contractHash:run.contractHash, cancelled:()=>false };
        const inspected = await inspectLocalCommand(request);
        const granted = await obtainGrant(Object.freeze({
          objectiveId:run.id,revision:run.revision,criterionId:criterion.id,
          targetTreeHash:delivery.targetTreeHash,commandHash:inspected.commandHash,
          executableHash:inspected.executableHash,timeoutMs:command.timeoutMs,
          protection:'UNPROTECTED'
        }));
        if (granted !== true) throw Error('Exact Local verification approval missing');
        const token = await backend.authorize(request,{
          reviewedCommandHash:inspected.commandHash,
          acknowledgeUnisolatedExecution:true
        });
        const observed = await backend.verify({ ...request,token,
          beforeSpawn:async () => {
            if (await candidateHash(run.repo,candidate.candidatePaths)!==delivery.targetTreeHash)
              throw Error('Destination changed before verification command');
          }
        });
        if (await candidateHash(run.repo,candidate.candidatePaths)!==delivery.targetTreeHash)
          throw Error('Destination changed after verification command');
        const complete = observed.status === 'LOCAL_PASSED' &&
          observed.evidenceIntegrity === 'MATCHED' && observed.integrity === true &&
          observed.executionAuthority === 'LOCAL_EXECUTED' && observed.exitCode === 0 &&
          Number.isInteger(observed.tests) && observed.tests > 0 &&
          observed.passed === observed.tests && observed.failed === 0 &&
          observed.skipped === 0 && observed.todo === 0 &&
          !observed.interrupted && !observed.truncated;
        const evidence = {
          kind:'OBJECTIVE_CRITERION_OBSERVATION_V1',objectiveId:run.id,
          revision:run.revision,criterionId:criterion.id,
          targetTreeHash:delivery.targetTreeHash,
          authority: 'LOCAL_EXECUTED', independentObserver: true,
          commandHash:inspected.commandHash,
          observationHash:hash({ commandHash:inspected.commandHash,
            exitCode:observed.exitCode,tests:observed.tests,passed:observed.passed,
            failed:observed.failed,skipped:observed.skipped,todo:observed.todo,
            evidenceIntegrity:observed.evidenceIntegrity }),
          tests:observed.tests,passed:observed.passed,failed:observed.failed,
          skipped:observed.skipped,todo:observed.todo,exitCode:observed.exitCode,
          interrupted:Boolean(observed.interrupted),truncated:Boolean(observed.truncated),
          integrity:complete?'MATCHED':'UNVERIFIED',complete,
          verificationBackend:'local',protection:'UNPROTECTED'
        };
        evidenceRefs[criterion.id]=store.artifact(evidence);
        if (!complete) break; // no false PASS or unauthorized subsequent effects
      }
      return {
        criteria:criteriaCopy,evidenceRefs,
        readVerifiedEvidence:ref=>store.readArtifact(ref),
      };
    }
  };
}
