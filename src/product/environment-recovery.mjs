// Data validation only. This extends the existing reservation, not an issuer or
// policy engine. Host observations are supplied by trusted embedding code.
import {hash} from '../alpha/contract.mjs';
import {exact} from '../intent/contract.mjs';

// Explicit trust of the ordinary Local backend, never a sandbox-policy claim.
export const nativeLocalPolicy = Object.freeze({backend:'local',host:'native-local',profile:'explicit-trusted-local-v1',
  filesystem:Object.freeze({isolation:'NOT_CLAIMED'}),network:Object.freeze({isolation:'NOT_CLAIMED'}),policyAuthority:'EXPLICIT_LOCAL_TRUST'});
export const isNativeLocalPolicy = policy => hash(policy) === hash(nativeLocalPolicy);
export function validRecoveryObservation(observed, policy) {
  if (hash(observed.policy) !== hash(policy)) return false;
  return isNativeLocalPolicy(policy)
    ? observed.kind === 'LocalExecutionContextObservation' && observed.policyAttestation === 'NOT_CLAIMED' &&
      observed.verifierIndependence === 'UNPROTECTED' && typeof observed.evidence?.pid === 'number' &&
      typeof observed.evidence?.executable === 'string'
    : observed.kind === 'HostEffectivePolicyObservation' && observed.effective === true;
}

export function validateEnvironmentRecovery(store, binding, {requireReview=false} = {}) {
  const e = binding.environmentRecovery;
  exact(e, ['evidenceRef','diagnosticRef','priorRequestId','previousPolicyHash','policy','classification'], 'Environment recovery');
  if (e.classification !== 'ENVIRONMENT_OR_CAPABILITY' || !/^[a-f0-9]{64}$/.test(e.previousPolicyHash) ||
      !e.policy || e.policy.backend !== 'local' || typeof e.policy.host !== 'string' ||
      typeof e.policy.profile !== 'string' || !e.policy.filesystem || !e.policy.network ||
      hash(e.policy) === e.previousPolicyHash) throw Error('Explicit changed Local environment policy required');
  const row = store.db.prepare('SELECT body FROM bootstrap_reservations WHERE requestId=?').get(e.priorRequestId);
  const prior = row && JSON.parse(row.body);
  const old = store.readArtifact(e.evidenceRef), diagnostic = store.readArtifact(e.diagnosticRef);
  if (!prior || prior.state !== 'LOCAL_FAILED' || prior.taskId !== binding.taskId || prior.itemId !== binding.itemId ||
      prior.result?.evidenceRef !== e.evidenceRef || old.status !== 'LOCAL_FAILED' || old.authority !== 'LOCAL_EXECUTED' ||
      old.observed?.failed < 1 || old.observed.integrity !== true || old.taskRevision + 1 !== binding.revision ||
      old.workflowHash !== binding.workflowHash || old.command.commandHash !== binding.commandHash ||
      hash(old.command) !== hash(binding.command) || hash(old.fileDigests) !== hash(binding.fileDigests))
    throw Error('Environment recovery failure/candidate/command/revision mismatch');
  if (diagnostic.kind !== 'EnvironmentFailureDiagnostic' || diagnostic.classification !== e.classification ||
      diagnostic.taskId !== binding.taskId || diagnostic.revision !== binding.revision || diagnostic.evidenceRef !== e.evidenceRef ||
      diagnostic.candidateHash !== old.command.candidateTreeHash || diagnostic.previousPolicyHash !== e.previousPolicyHash ||
      !diagnostic.observationRef || !diagnostic.reason) throw Error('Bound observed environment diagnostic required');
  store.readArtifact(diagnostic.observationRef);
  if (requireReview) {
    const authorization=binding.authorization;
    if(authorization?.kind!=='EXPLICIT_LOCAL_TRUST'||!authorization.reviewRef)throw Error('Exact environment review provenance required');
    const review=store.readArtifact(authorization.reviewRef);
    if(hash(review)!==authorization.reviewHash||hash(review.environment)!==hash(e)||review.taskId!==binding.taskId||
       review.revision!==binding.revision||review.taskHash!==binding.taskHash||review.requestId!==binding.requestId||
       review.expiresAt!==binding.expiresAt||hash(review.command)!==hash(binding.command)||review.maxExecutions!==1||
       review.timeBudgetMs!==binding.timeBudgetMs)throw Error('Environment review/decision mismatch');
  }
  return prior;
}

// No JSON receipt, env variable or CLI flag can stand in for this callback.
// The embedding must observe the effective policy, not echo the requested one.
// This is same-user UNPROTECTED observation, not Host sandbox attestation.
export async function observeRecoveryPolicy(recovery, observePolicy) {
  if (isNativeLocalPolicy(recovery.policy)) return {
    kind:'LocalExecutionContextObservation',policyAttestation:'NOT_CLAIMED',verifierIndependence:'UNPROTECTED',
    source:'NATIVE_LOCAL_PROCESS',observedAt:Date.now(),policy:structuredClone(nativeLocalPolicy),
    evidence:{pid:process.pid,platform:process.platform,executable:process.execPath,nodeVersion:process.version}
  };
  if (typeof observePolicy !== 'function') throw Error('BLOCKED_CAPABILITY: trusted Host effective-policy observer unavailable');
  const observed = await observePolicy();
  if (!observed || observed.kind !== 'HostEffectivePolicyObservation' || observed.effective !== true ||
      typeof observed.source !== 'string' || !observed.source || !observed.evidence ||
      !Number.isSafeInteger(observed.observedAt) || observed.observedAt > Date.now() || Date.now() - observed.observedAt > 30000 ||
      hash(observed.policy) !== hash(recovery.policy)) throw Error('BLOCKED_CAPABILITY: effective Host policy differs from approved policy');
  return observed;
}
