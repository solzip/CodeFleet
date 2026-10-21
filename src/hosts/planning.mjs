// Trusted, data-only intake. This module never starts a Host or approves a Run.
import { randomUUID } from 'node:crypto';
import { hash } from '../alpha/contract.mjs';
import { exact } from '../intent/contract.mjs';
import { readCodeContext, validateSemanticProposal } from '../intent/semantic.mjs';
import { fromPlan } from '../workflow/definition.mjs';

export const EXECUTION_MODES = Object.freeze(['PROPOSAL_ONLY', 'HOST_OBSERVED', 'CONTROLLED_EXECUTION']);
export const PLANNING_PROFILE = Object.freeze({
  version: 1, mode: 'HOST_OBSERVED', purpose: 'planning', session: 'fresh',
  tools: ['read', 'search'], writes: false, network: 'deny',
  operator: false, docker: false, delegation: false,
  requests: 1, toolRequests: 16, timeoutMs: 30000, outputBytes: 65536,
  platform: 'linux-x86_64', modelTransport: 'UNVERIFIED', authentication: 'UNVERIFIED',
});
export function requirePlanningLive() {
  throw Error('BLOCKED: real Host tool confinement, authentication and model transport are unverified');
}
export function planningSkill(host) {
  if (!['codex', 'claude'].includes(host)) throw Error('Unknown host');
  return `---
name: codefleet-plan
description: Explore an authorized isolated fixture and return a CodeFleet Task Draft for trusted validation.
---

# CodeFleet planning

This is HOST_OBSERVED planning, never execution authorization. Require a fresh
isolated session, trusted planning request and enforced read/search-only profile.
If that boundary is absent, report BLOCKED. Instructions are not a sandbox.
Use only authorized fixture read/search tools. Never write files, run commands,
call Operator/Harness/IPC, delegate agents, read credentials or use network tools.
Do not start another model. Existing host authentication belongs to the Host.

Read the original intent and pinned context in the request. Explore only its
source/test paths. Cite actual path, one-based line and exact quote for every
proposed source and test. Separate inferences from observed code. Return one JSON
object in the session response; the trusted collector submits it to CodeFleet.
Do not invoke a validator CLI yourself or write a response file.

Response: {sessionId,requestHash,proposal:{draft,references,inferences}}.
draft has exactly schemaVersion:2, objective (unchanged original intent), base
(request baseline), files (candidate sources), tests (protected tests), criteria
([{description,method:"protected-tests",tests:[...]}]), risks, unknowns, effects
(["local-edit"] describes future work, not permission to edit now).
references: [{path,line,quote}]. inferences: bounded strings.
Record uncertain requirements in unknowns and risks; do not invent executable
criteria or claim tests ran. Unsupported targets become CAPABILITY_GAP.
The trusted validator checks code, schema, hashes and freshness. VALIDATED means
draft-valid only: executable=false, approved=false, complete=false. Never emit
approval, cost, verification evidence or a completion verdict as response fields.
`;
}

function enable(store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS host_planning (
    id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL,
    status TEXT NOT NULL, response TEXT, result TEXT, resultHash TEXT
  )`);
}
// Only the trusted collector supplies context/version/skill, never the model.
export async function beginPlanning(store, repo, objective, options) {
  return createPlanning(store, await readCodeContext(repo, objective), objective, options);
}
export function createPlanning(store, context, objective, { host, version, now = Date.now() } = {}) {
  if (!['codex', 'claude'].includes(host) || typeof version !== 'string' || !version || version.length > 100) throw Error('Host identity required');
  if (typeof objective !== 'string' || objective.length < 10 || objective.length > 4000) throw Error('Invalid intent');
  if (context.truncated || context.discovery.dirty || context.discovery.excluded.length) throw Error('Clean complete baseline required');
  enable(store);
  const body = { sessionId: randomUUID(), host, version, objective,
    intentRef: hash({ original: objective }), baseline: context.discovery.base,
    context: structuredClone(context), contextHash: hash(context),
    profile: structuredClone(PLANNING_PROFILE), profileHash: hash(PLANNING_PROFILE),
    skillHash: hash(planningSkill(host)), revision: 1, expiresAt: now + PLANNING_PROFILE.timeoutMs };
  const requestHash = hash(body);
  store.db.prepare('INSERT INTO host_planning(id,body,digest,status) VALUES(?,?,?,?)')
    .run(body.sessionId, JSON.stringify(body), requestHash, 'OPEN');
  return { ...body, requestHash, executable: false, liveStatus: 'BLOCKED' };
}
export function cancelPlanning(store, id) {
  enable(store);
  store.db.prepare("UPDATE host_planning SET status='CANCELLED' WHERE id=? AND status='OPEN'").run(id);
}
export function submitPlanning(store, raw, current, { now = Date.now() } = {}) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > PLANNING_PROFILE.outputBytes) throw Error('Bounded JSON response required');
  const response = JSON.parse(raw);
  exact(response, ['sessionId', 'requestHash', 'proposal'], 'planning response');
  // `current` is freshly measured by the trusted collector, not from response.
  exact(current, ['contextHash', 'profileHash', 'skillHash'], 'current planning binding');
  enable(store); store.db.exec('BEGIN IMMEDIATE');
  try {
    const row = store.db.prepare('SELECT * FROM host_planning WHERE id=?').get(response.sessionId);
    if (!row) throw Error('Unknown planning session');
    const request = JSON.parse(row.body);
    if (hash(request) !== row.digest || response.requestHash !== row.digest ||
        request.expiresAt <= now || row.status === 'CANCELLED' ||
        hash(request.context) !== request.contextHash ||
        Object.keys(current).some(k => current[k] !== request[k]) ||
        request.profileHash !== hash(PLANNING_PROFILE) ||
        request.skillHash !== hash(planningSkill(request.host))) throw Error('Stale or changed planning binding');
    const responseHash = hash(response);
    if (row.status === 'SUBMITTED') {
      if (row.response !== responseHash) throw Error('Conflicting duplicate submission');
      if (hash(row.result) !== row.resultHash) throw Error('Stored result integrity mismatch');
      const result = JSON.parse(row.result);
      if (result.evidence.outputHash !== responseHash) throw Error('Stored result mismatch');
      store.db.exec('COMMIT'); return { ...result, replay: true };
    }
    if (row.status !== 'OPEN') throw Error('Planning session unavailable');
    const validation = validateSemanticProposal(response.proposal, request.context, request.objective);
    const plan = { intent: { original: request.objective, authority: 'USER_REQUEST_ONLY', ref: request.intentRef },
      discovery: request.context.discovery, draft: response.proposal.draft, validation, executable: false };
    let workflowPreview = null;
    if (validation.status === 'VALIDATED') {
      const d = plan.draft;
      workflowPreview = fromPlan(plan, 'planning-preview', [{ id: 'change', dependencies: [], priority: 0,
        files: d.files, tests: d.tests, acceptanceCriteria: d.criteria.map(c => c.description) }]);
    }
    const result = { kind: 'HostPlanningResult', status: validation.status, plan,
      references: response.proposal.references, inferences: response.proposal.inferences,
      authority: 'PROVIDER_REPORTED_ONLY', approved: false, executable: false, complete: false,
      workflowPreview, capabilityGaps: validation.gaps,
      evidence: { host: request.host, version: request.version, sessionId: request.sessionId,
        intentRef: request.intentRef, baseline: request.baseline, profileHash: request.profileHash,
        skillHash: request.skillHash, inputHash: row.digest, outputHash: responseHash,
        observation: 'TRUSTED_VALIDATOR_CHECKED_PINNED_CODE_NOT_HOST_EXECUTION',
        tools: 'UNOBSERVED', fileChanges: 'UNOBSERVED', isolation: 'SEPARATE_PREFLIGHT_REQUIRED',
        usage: null, cost: null, unobserved: ['host execution', 'authentication', 'model transport'] } };
    const serialized = JSON.stringify(result);
    store.db.prepare("UPDATE host_planning SET status='SUBMITTED',response=?,result=?,resultHash=? WHERE id=? AND status='OPEN'")
      .run(responseHash, serialized, hash(serialized), request.sessionId);
    store.db.exec('COMMIT'); return result;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
