// Supervised Local-only destination delivery of a separately verified Candidate.
// No public CLI, no automatic Git mutation, no protected-isolation claim.
// This capability must be injected by a trusted integration after an explicit
// exact-scope owner grant; caller-supplied agent text is never authorization.
import { randomUUID, createHash } from 'node:crypto';
import { lstat, realpath, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import path from 'node:path';
import { filePath, hash } from '../alpha/contract.mjs';
import { repository, candidateHash } from '../alpha/workspace.mjs';

const digest = buffer => createHash('sha256').update(buffer).digest('hex');
// A regular destination reached through a linked ancestor is not the same
// approved lexical workspace. realpath() alone hides that redirection.
async function requireUnlinkedDestinationRoot(root) {
  const absolute = path.resolve(root);
  const volumeRoot = path.parse(absolute).root;
  let current = volumeRoot;
  const check = async directory => {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error('Destination root or ancestor link/Junction unsupported');
  };
  await check(current);
  for (const part of path.relative(volumeRoot, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    await check(current);
  }
}

const exactFiles = (files, allowed) => {
  if (!files || typeof files !== 'object' || Array.isArray(files) ||
      !Object.keys(files).length || Object.keys(files).length > 20) throw Error('Delivery requires bounded changed files');
  for (const [name, content] of Object.entries(files)) {
    filePath(name);
    if (!allowed.includes(name) || typeof content !== 'string' ||
        Buffer.byteLength(content, 'utf8') > 64000 || content.includes('\0'))
      throw Error('Delivery changed file outside approved bounded scope');
  }
};
export function deliveryIntent({ runId, revision, base, destination, candidateHash: verifiedHash, files }) {
  if (!runId || !Number.isInteger(revision) || !/^[a-f0-9]{40,64}$/.test(base ?? '') ||
      !path.isAbsolute(destination ?? '') || !/^[a-f0-9]{64}$/.test(verifiedHash ?? ''))
    throw Error('Delivery identity incomplete');
  const fileHashes = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) => [name, digest(Buffer.from(content))]));
  return { kind: 'EXACT_LOCAL_DELIVERY_INTENT_V1', runId, revision, base,
    destination: path.resolve(destination), candidateHash: verifiedHash, fileHashes };
}

// Bind a delivered-tree receipt to the pre-effect approved Objective scope.
// This checks persisted provenance, not Operator authentication or OS isolation.
export function pinnedObjectiveDeliveryIntent({ run, delivery, intent, approved } = {}) {
  if (!run || !delivery || !intent || !approved ||
      intent.kind !== 'EXACT_LOCAL_DELIVERY_INTENT_V1' ||
      intent.runId !== run.id || intent.revision !== run.revision ||
      intent.base !== run.base || intent.destination !== run.repo ||
      intent.workflowHash !== run.contractHash ||
      intent.candidateHash !== delivery.candidateHash ||
      intent.candidateHash !== delivery.targetTreeHash ||
      intent.approvedCriteriaRef !== run.objectiveApprovedCriteriaRef ||
      intent.objectiveCriteriaHash !== approved.criteriaHash ||
      delivery.intentRef !== run.destinationDeliveryIntentRef ||
      delivery.runId !== run.id || delivery.revision !== run.revision)
    return false;
  const before = intent.fileHashes, after = delivery.observedHashes;
  if (!before || typeof before !== 'object' || Array.isArray(before) ||
      !after || typeof after !== 'object' || Array.isArray(after) ||
      !Array.isArray(delivery.appliedFiles))
    return false;
  const names = Object.keys(before);
  return names.length > 0 && names.length === Object.keys(after).length &&
    names.length === delivery.appliedFiles.length &&
    new Set(delivery.appliedFiles).size === names.length &&
    names.every(name => Object.hasOwn(after, name) &&
      delivery.appliedFiles.includes(name) &&
      /^[a-f0-9]{64}$/.test(before[name] ?? '') &&
      before[name] === after[name]);
}

// A successful Promise means bytes were observed, NOT that acceptance tests ran.
// Any exception after intent persistence must leave the workflow RECONCILING,
// not READY: a partial multi-file apply may have occurred.
export async function applyLocalDelivery({ destination, base, files, candidatePaths, verifiedCandidateHash,
  runId, revision, authorize, persistIntent, cancelled = () => false } = {}) {
  if (typeof authorize !== 'function' || typeof persistIntent !== 'function')
    throw Error('Trusted grant verifier and durable intent writer required');
  const root = path.resolve(destination ?? '');
  if (!path.isAbsolute(destination ?? '') || !Array.isArray(candidatePaths) ||
      !candidatePaths.length || new Set(candidatePaths).size !== candidatePaths.length)
    throw Error('Delivery destination and candidate path list required');
  exactFiles(files, candidatePaths);
  await requireUnlinkedDestinationRoot(root);
  const intent = deliveryIntent({ runId, revision, base, destination: root,
    candidateHash: verifiedCandidateHash, files });
  const selected = await repository(root);
  const resolvedRoot = await realpath(root), repoRoot = await realpath(selected.repo);
  const normalized = p => process.platform === 'win32' ? p.toLowerCase() : p;
  if (normalized(repoRoot) !== normalized(resolvedRoot) || selected.base !== base)
    throw Error('Destination Git baseline/status changed; no apply');
  if (cancelled()) throw Error('Delivery cancelled before effect');
  const targets = [];
  for (const [name, value] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const dest = path.join(root, name);
    let ancestor = path.dirname(dest);
    while (ancestor !== root) {
      if ((await lstat(ancestor)).isSymbolicLink()) throw Error('Destination parent link/Junction unsupported');
      const next = path.dirname(ancestor);
      if (next === ancestor) throw Error('Destination path escaped root');
      ancestor = next;
    }
    const parent = await realpath(path.dirname(dest));
    const relative = path.relative(resolvedRoot,parent);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw Error('Destination parent path escaped approved root');
    const status = await lstat(dest);
    if (!status.isFile() || status.isSymbolicLink()) throw Error('Destination file is not regular');
    const before = await readFile(dest);
    const after = Buffer.from(value, 'utf8');
    if (digest(before) === digest(after)) throw Error('No changed file content in delivery');
    targets.push({ name, dest, after, mode: status.mode & 0o777,
      originalSha256: digest(before), afterSha256: digest(after) });
  }
  // Treat grant result as an independently verified exact matching decision.
  // Merely passing a text actor or Host consent does not satisfy this callback.
  const granted = await authorize(Object.freeze({ ...intent, originalHashes:
    Object.fromEntries(targets.map(t => [t.name, t.originalSha256])) }));
  if (granted !== true) throw Error('Exact supervised Local delivery not granted');
  // Owner review may be asynchronous. Revalidate the clean Git baseline,
  // lexical parent chain and changed targets BEFORE intent persistence/staging.
  await requireUnlinkedDestinationRoot(root);
  const stillRoot = await realpath(root);
  const stillSelected = await repository(root);
  if (normalized(stillRoot) !== normalized(resolvedRoot) ||
      normalized(await realpath(stillSelected.repo)) !== normalized(resolvedRoot) ||
      stillSelected.base !== base)
    throw Error('Destination root or Git baseline changed during delivery grant');
  // A trusted persistence callback can take time. Check the same lexical
  // targets after the durable intent and immediately before each rename too:
  // byte equality alone must not accept a newly substituted symlink/Junction.
  const assertTargetStillApproved = async target => {
    let ancestor = path.dirname(target.dest);
    while (ancestor !== root) {
      const stat = await lstat(ancestor);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw Error('Destination parent link/Junction changed during delivery');
      const next = path.dirname(ancestor);
      if (next === ancestor) throw Error('Destination path escaped root');
      ancestor = next;
    }
    const file = await lstat(target.dest);
    if (!file.isFile() || file.isSymbolicLink() ||
        (file.mode & 0o777) !== target.mode ||
        digest(await readFile(target.dest)) !== target.originalSha256)
      throw Error('Destination target changed during delivery');
  };
  for (const target of targets) await assertTargetStillApproved(target);
  if (cancelled()) throw Error('Delivery cancelled before intent');
  const intentRef = await persistIntent(intent);
  if (typeof intentRef !== 'string' || !intentRef) throw Error('Durable delivery intent not acknowledged');
  let touched = 0;
  const stages = [];
  try {
    // Persistence is asynchronous and may have been followed by another actor's
    // write or path swap. Revalidate before the first sibling stage-file effect.
    await requireUnlinkedDestinationRoot(root);
    const postIntentRoot = await realpath(root);
    const postIntentRepository = await repository(root);
    if (normalized(postIntentRoot) !== normalized(resolvedRoot) ||
        normalized(await realpath(postIntentRepository.repo)) !== normalized(resolvedRoot) ||
        postIntentRepository.base !== base)
      throw Error('Destination root or Git baseline changed after durable intent');
    for (const target of targets) await assertTargetStillApproved(target);
    if (cancelled()) throw Error('Delivery cancelled after durable intent');
    // No external effects until all original files are preflighted and intent
    // is recorded. Temporary sibling files are also controlled write effects.
    for (const t of targets) {
      const stage = path.join(path.dirname(t.dest), '.codefleet-stage-' + randomUUID());
      await writeFile(stage, t.after, { flag: 'wx', mode: t.mode });
      await chmod(stage,t.mode);
      stages.push(stage);
    }
    for (let i = 0; i < targets.length; i++) {
      if (cancelled()) throw Error('Delivery cancelled after staging');
      await requireUnlinkedDestinationRoot(root);
      await assertTargetStillApproved(targets[i]);
      await rename(stages[i], targets[i].dest);
      touched++;
    }
    const observedHashes = {};
    for (const t of targets) {
      const observed = await readFile(t.dest);
      observedHashes[t.name] = digest(observed);
      if (observedHashes[t.name] !== t.afterSha256) throw Error('Destination bytes differ from accepted Candidate');
    }
    const targetTreeHash = await candidateHash(root, candidatePaths);
    if (targetTreeHash !== verifiedCandidateHash) throw Error('Delivered tracked tree differs from verified integrated Candidate');
    return { status: 'DELIVERED_NOT_VERIFIED', authority: 'LOCAL_OBSERVED_UNPROTECTED',
      intentRef, runId, revision, candidateHash: verifiedCandidateHash,
      targetTreeHash, observedHashes, appliedFiles: targets.map(t => t.name),
      semanticCriteriaVerified: false };
  } catch (error) {
    const failure = Error('DESTINATION_UNCERTAIN: ' + error.message);
    failure.code = 'DESTINATION_UNCERTAIN';
    failure.deliveryIntentRef = intentRef;
    failure.filesPossiblyApplied = touched;
    throw failure;
  } finally {
    // Cleanup is best-effort; leftover stage artifacts require handoff.
    for (const stage of stages) await unlink(stage).catch(() => {});
  }
}
