#!/usr/bin/env node
// P2 signed-scope preflight only. Reuses the existing Ed25519 Operator
// decision validator. Never issues grants, dispatches Codex or authenticates
// a human/OS principal; only an external trusted broker can do those things.
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, digest, operatorDecisionVerifier } from '../../src/hosts/operator.mjs';
import { P2_FIXED_INPUT, P2_OUTPUT_SCHEMA } from './p2-readonly-offline.mjs';

const SHA=/^[A-F0-9]{64}$/;
const REQUEST=/^p2-[a-z0-9-]{8,76}$/;
const NONCE=/^[a-f0-9]{32}$/;
const MODEL=/^[A-Za-z0-9_.-]{1,128}$/;
const REVISION=/^[a-f0-9]{40}$/;
const MAX_VALIDITY_MS=15*60*1000;
const SCOPE_FIELDS=Object.freeze([
  'requestId','nonce','fixtureRoot','sourceRevision','model',
  'nativeCodexSha256','preflightSha256','protocolSha256',
  'executorSha256','manifestSha256','maxTurns','ephemeral',
  'sandbox','approvalPolicy','toolNetworkAccess',
  'unknownCostAcknowledged','costCapEnforced'
]);
const deny=message=>{throw new P2SignedScopeError(message);};
const exact=(value,fields)=>value&&typeof value==='object'&&
  Object.getPrototypeOf(value)===Object.prototype&&
  Object.keys(value).sort().join('|')===[...fields].sort().join('|');

export class P2SignedScopeError extends Error{
  constructor(message){super(message);this.name='P2SignedScopeError';
    this.executionAuthorized=false;this.replayAllowed=false;}
}
export function createP2SignedScopeBinding(scope){
  if(!exact(scope,SCOPE_FIELDS))deny('P2 signed scope fields must be exact');
  if(typeof scope.requestId!=='string'||!REQUEST.test(scope.requestId)||
     typeof scope.nonce!=='string'||!NONCE.test(scope.nonce)||
     typeof scope.sourceRevision!=='string'||!REVISION.test(scope.sourceRevision)||
     typeof scope.model!=='string'||!MODEL.test(scope.model)||
     typeof scope.fixtureRoot!=='string'||scope.fixtureRoot.length>2048||
     !isAbsolute(scope.fixtureRoot)||resolve(scope.fixtureRoot)!==scope.fixtureRoot)
    deny('P2 signed scope identity or root invalid');
  for(const key of ['nativeCodexSha256','preflightSha256','protocolSha256',
                    'executorSha256','manifestSha256'])
    if(typeof scope[key]!=='string'||!SHA.test(scope[key]))
      deny('P2 signed scope digest invalid');
  if(scope.maxTurns!==1||scope.ephemeral!==true||
     scope.sandbox!=='read-only'||scope.approvalPolicy!=='never'||
     scope.toolNetworkAccess!==false||
     scope.unknownCostAcknowledged!==true||scope.costCapEnforced!==false)
    deny('P2 signed scope policy or cost acknowledgement invalid');
  // Reuse H2 deterministic canonical/digest and binding schema.
  const normalized=JSON.parse(canonical(scope));
  const binding=Object.freeze({
    runId:normalized.requestId,
    workItemId:'P2_ONE_READONLY_TURN',
    revision:1,
    contractHash:digest({kind:'P2_SIGNED_SCOPE_V1',scope:normalized}),
    actionDigest:digest({kind:'P2_TURN_START_V1',model:normalized.model,
      prompt:digest(P2_FIXED_INPUT),outputSchema:digest(P2_OUTPUT_SCHEMA)}),
    repository:canonical({fixtureRoot:normalized.fixtureRoot,
      sourceRevision:normalized.sourceRevision}),
    environment:digest({nativeCodex:normalized.nativeCodexSha256,
      preflight:normalized.preflightSha256,protocol:normalized.protocolSha256,
      executor:normalized.executorSha256,manifest:normalized.manifestSha256}),
    policyHash:digest({maxTurns:1,ephemeral:true,sandbox:'read-only',
      approvalPolicy:'never',toolNetworkAccess:false,
      costCapEnforced:false,unknownCostAcknowledged:true}),
    leaseOwner:normalized.nonce
  });
  return binding;
}
export function inspectP2SignedScope({
  expectedScope,decisionEnvelope,trustedOperatorKeys,clock=Date.now
}={}){
  // Expected scope and enrolled keys MUST originate outside Agent control.
  const binding=createP2SignedScopeBinding(expectedScope);
  if(typeof clock!=='function')deny('Trusted P2 clock missing');
  const now=clock();
  if(!Number.isSafeInteger(now)||now<1)
    deny('Trusted P2 clock invalid');
  let decision;
  try{
    decision=operatorDecisionVerifier(trustedOperatorKeys,()=>now)(decisionEnvelope);
  }catch{deny('P2 signed decision invalid, expired or key not trusted');}
  if(decision.kind!=='APPROVE'||decision.id!==expectedScope.requestId||
     canonical(decision.binding)!==canonical(binding))
    deny('P2 signed decision does not match independently expected scope');
  if(decision.expiresAt>now+MAX_VALIDITY_MS)
    deny('P2 signed decision validity exceeds offline review limit');
  return Object.freeze({
    status:'P2_SIGNED_SCOPE_INTEGRITY_MATCHED_NOT_AUTHORIZED',
    requestId:expectedScope.requestId,signerKeyFingerprint:decision.principal,
    expiresAt:decision.expiresAt,maxTurnsRequested:1,
    signatureAndScopeChecked:true,
    trustedOwnerIdentityEstablished:false,
    trustedOperatorRuntimeEstablished:false,
    clockAndKeyEnrollmentIndependentlyAttested:false,
    executionAuthorized:false,
    nativeCodexStarted:false,modelTurnsActuallyRun:0,
    readOnlyEnforced:false,osSandboxEnforcementVerified:false,
    costCapEnforced:false,subscriptionCostStatus:'UNKNOWN',
    replayPreventionEnforced:false,replayAllowed:false,
    hostLiveVerified:false,p2Accepted:false,
    next:'SEPARATE_TRUSTED_OPERATOR_OS_IDENTITY_AND_ONE_SHOT_ADMISSION_REQUIRED'
  });
}
export function main(args=process.argv.slice(2)){
  if(args.length!==0)deny('P2 signature preflight exposes no sign, grant or execute CLI');
  return {status:'P2_SIGNED_SCOPE_LIBRARY_REVIEW_ONLY',
    executionAuthorized:false,nativeCodexStarted:false,
    modelTurnsActuallyRun:0,p2Accepted:false,replayAllowed:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{process.stdout.write(JSON.stringify(main())+'\n');}
  catch{process.stdout.write(JSON.stringify({
    status:'P2_SIGNED_SCOPE_CLI_BLOCKED',executionAuthorized:false,
    p2Accepted:false,replayAllowed:false})+'\n');process.exitCode=2;}
}
