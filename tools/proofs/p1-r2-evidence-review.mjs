#!/usr/bin/env node
// Offline structural audit of *redacted* P1 Handshake Evidence.
// It cannot authenticate a real Host, grant a model Turn, or accept a product MVP.
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const NAMES = ['p1-redacted-transcript.jsonl', 'p1-result.json'];
const COMMAND = ['<CODEX_EXE>', 'app-server', '--listen', 'stdio://', '--strict-config'];
const NOTIFICATIONS = new Set(['account/updated', 'account/rateLimits/updated',
  'remoteControl/status/changed']);
const SHA = /^[A-F0-9]{64}$/;
const MAX_RESULT = 64 * 1024;
const MAX_TRANSCRIPT = 512 * 1024;
const MAX_RECORDS = 128;

class EvidenceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const deny = code => { throw new EvidenceError(code); };
const isObject = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj);
const exactKeys = (value, fields) => isObject(value) &&
  Object.keys(value).sort().join('|') === [...fields].sort().join('|');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const textOrNull = value => value === null ||
  typeof value === 'string' && value.length <= 512;
const nonnegative = value => Number.isInteger(value) && value >= 0;

function inspectRecord(record, phase, counts) {
  if (!isObject(record)) deny('TRANSCRIPT_RECORD_INVALID');
  if (record.direction === 'out') {
    if (phase === 0 && exactKeys(record, ['direction', 'method', 'id']) &&
        record.method === 'initialize' && record.id === 1) return 1;
    if (phase === 2 && exactKeys(record, ['direction', 'method']) &&
        record.method === 'initialized') return 3;
    if (phase === 3 && exactKeys(record, ['direction', 'method', 'id']) &&
        record.method === 'model/list' && record.id === 2) return 4;
    deny('UNAPPROVED_OUTBOUND_OR_SEQUENCE');
  }
  if (record.direction !== 'in') deny('TRANSCRIPT_RECORD_INVALID');
  if (record.kind === 'notification') {
    if (phase < 1 || phase > 4 ||
        !exactKeys(record, ['direction', 'kind', 'method']) ||
        !NOTIFICATIONS.has(record.method)) deny('UNAPPROVED_NOTIFICATION_OR_SEQUENCE');
    counts.set(record.method, (counts.get(record.method) ?? 0) + 1);
    return phase;
  }
  if (record.kind !== 'response' ||
      !exactKeys(record, ['direction', 'kind', 'id', 'result']))
    deny('TRANSCRIPT_RECORD_INVALID');
  if (phase === 1 && record.id === 1 &&
      exactKeys(record.result, ['userAgent', 'platformFamily', 'platformOs']) &&
      ['userAgent', 'platformFamily', 'platformOs']
        .every(field => textOrNull(record.result[field])))
    return 2;
  if (phase === 4 && record.id === 2 &&
      exactKeys(record.result, ['data']) &&
      Array.isArray(record.result.data) && record.result.data.length <= 20) {
    for (const model of record.result.data) {
      if (!exactKeys(model, ['id', 'model', 'displayName',
        'defaultReasoningEffort', 'supportedReasoningEfforts', 'isDefault']) ||
          !['id', 'model', 'displayName', 'defaultReasoningEffort']
            .every(field => textOrNull(model[field])) ||
          !Array.isArray(model.supportedReasoningEfforts) ||
          model.supportedReasoningEfforts.length > 10 ||
          !model.supportedReasoningEfforts.every(v => typeof v === 'string' && v.length <= 64) ||
          typeof model.isDefault !== 'boolean')
        deny('MODEL_SUMMARY_INVALID');
    }
    return 5;
  }
  deny('RESPONSE_OR_SEQUENCE_INVALID');
}

export function reviewP1EvidenceBytes(resultBytes, transcriptBytes) {
  if (!Buffer.isBuffer(resultBytes) || !Buffer.isBuffer(transcriptBytes) ||
      resultBytes.length === 0 || resultBytes.length > MAX_RESULT ||
      transcriptBytes.length === 0 || transcriptBytes.length > MAX_TRANSCRIPT)
    deny('EVIDENCE_SIZE_INVALID');
  const transcriptSha256 = sha256(transcriptBytes);
  let result;
  try { result = JSON.parse(resultBytes.toString('utf8')); }
  catch { deny('RESULT_JSON_INVALID'); }
  if (!exactKeys(result, ['status', 'passed', 'command', 'elapsedMs',
    'stdoutBytes', 'stderrBytes', 'notificationCounts', 'termination',
    'error', 'transcriptSha256'])) deny('RESULT_FORMAT_INVALID');
  if (result.status !== 'P1_HANDSHAKE_OBSERVED' || result.passed !== true ||
      result.error !== null) deny('P1_FAILED_OR_INCOMPLETE');
  if (!Array.isArray(result.command) ||
      result.command.length !== COMMAND.length ||
      result.command.some((value, i) => value !== COMMAND[i]) ||
      !nonnegative(result.elapsedMs) || result.elapsedMs > 302000 ||
      !nonnegative(result.stdoutBytes) || result.stdoutBytes > 2 * 1024 * 1024 ||
      !nonnegative(result.stderrBytes) || result.stderrBytes > 64 * 1024)
    deny('EXECUTION_BOUNDS_OR_METHOD_INVALID');
  if (!exactKeys(result.termination, ['code', 'signal', 'confirmed', 'forced']) ||
      result.termination.code !== 0 || result.termination.signal !== null ||
      result.termination.confirmed !== true || result.termination.forced !== false)
    deny('TERMINATION_NOT_ACCEPTABLE');
  if (typeof result.transcriptSha256 !== 'string' ||
      !SHA.test(result.transcriptSha256) ||
      result.transcriptSha256 !== transcriptSha256)
    deny('TRANSCRIPT_DIGEST_MISMATCH');
  if (!isObject(result.notificationCounts))
    deny('NOTIFICATION_COUNTS_INVALID');
  let source;
  try { source = transcriptBytes.toString('utf8'); }
  catch { deny('TRANSCRIPT_ENCODING_INVALID'); }
  if (!Buffer.from(source, 'utf8').equals(transcriptBytes) ||
      !source.endsWith('\n')) deny('TRANSCRIPT_ENCODING_INVALID');
  const rows = source.slice(0, -1).split('\n');
  if (rows.length < 5 || rows.length > MAX_RECORDS)
    deny('HANDSHAKE_SEQUENCE_INCOMPLETE');
  let phase = 0;
  const counted = new Map();
  for (const line of rows) {
    if (!line || Buffer.byteLength(line) > 256 * 1024)
      deny('TRANSCRIPT_RECORD_INVALID');
    let row;
    try { row = JSON.parse(line); }
    catch { deny('TRANSCRIPT_JSON_INVALID'); }
    phase = inspectRecord(row, phase, counted);
  }
  if (phase !== 5) deny('HANDSHAKE_SEQUENCE_INCOMPLETE');
  if (Object.keys(result.notificationCounts).length !== counted.size ||
      Object.entries(result.notificationCounts).some(([method, count]) =>
        !NOTIFICATIONS.has(method) || !nonnegative(count) ||
        count !== counted.get(method)))
    deny('NOTIFICATION_COUNTS_MISMATCH');
  // A transcript is a client-produced claim, not an authenticated OS
  // observation. Independent source/runtime/owner review is still mandatory.
  return Object.freeze({
    status: 'P1_EVIDENCE_STRUCTURALLY_CONSISTENT_REVIEW_REQUIRED',
    transcriptSha256,
    resultSha256: sha256(resultBytes),
    notificationCount: [...counted.values()].reduce((sum, n) => sum + n, 0),
    appServerExecutionAuthenticated: false,
    hostProtocolVerified: false,
    p1Accepted: false,
    executionAuthorized: false,
    ownerReviewRequired: true,
    next: 'VERIFY_SOURCE_RUNTIME_FIXTURE_AND_OWNER_APPROVAL_INDEPENDENTLY'
  });
}

export async function reviewP1Artifacts(artifacts) {
  if (typeof artifacts !== 'string' || !isAbsolute(artifacts))
    deny('ABSOLUTE_ARTIFACT_PATH_REQUIRED');
  const root = await lstat(artifacts).catch(() => deny('ARTIFACT_DIRECTORY_INVALID'));
  if (!root.isDirectory() || root.isSymbolicLink())
    deny('ARTIFACT_DIRECTORY_INVALID');
  const names = await readdir(artifacts).catch(() => deny('ARTIFACT_DIRECTORY_INVALID'));
  if (names.sort().join('|') !== NAMES.slice().sort().join('|'))
    deny('EVIDENCE_FILESET_INVALID');
  const evidence = [];
  for (const [name, bound] of [[NAMES[0], MAX_TRANSCRIPT], [NAMES[1], MAX_RESULT]]) {
    const path = join(artifacts, name);
    const stat = await lstat(path).catch(() => deny('EVIDENCE_FILE_INVALID'));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > bound)
      deny('EVIDENCE_FILE_INVALID');
    const bytes = await readFile(path).catch(() => deny('EVIDENCE_READ_FAILED'));
    if (bytes.length < 1 || bytes.length > bound) deny('EVIDENCE_SIZE_INVALID');
    evidence.push(bytes);
  }
  return reviewP1EvidenceBytes(evidence[1], evidence[0]);
}

export async function main(args = process.argv.slice(2)) {
  if (!Array.isArray(args) || args.length !== 2 || args[0] !== '--artifacts')
    deny('ONLY_READ_ONLY_ARTIFACTS_FLAG_SUPPORTED');
  return reviewP1Artifacts(args[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => {
      process.stdout.write(JSON.stringify({
        status: 'P1_EVIDENCE_NOT_ACCEPTED',
        reasonCode: error instanceof EvidenceError ? error.code : 'EVIDENCE_UNAVAILABLE',
        appServerExecutionAuthenticated: false,
        hostProtocolVerified: false, p1Accepted: false,
        executionAuthorized: false
      }) + '\n');
      process.exitCode = 2;
    });
}
