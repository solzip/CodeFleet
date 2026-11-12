// Bounded read-only NEW_PROJECT Task discovery after an interrupted Host session.
// Task discovery cannot grant approval or establish Objective completion.
import { taskReport } from './report.mjs';

export async function listCodexBootstrapTasks(store, { offset = 0 } = {}) {
  if (!store?.db || typeof store.db.prepare !== 'function' ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 999999)
    throw Error('Codex Bootstrap discovery requires a persisted Store and bounded offset');
  const base = { schemaVersion: 1, kind: 'CODEFLEET_CODEX_BOOTSTRAP_INDEX_V1',
    authority: 'READ_ONLY_PERSISTED_INDEX', offset, limit: 20,
    executionGranted: false, automaticReplay: false,
    objectiveComplete: false, protectedVerified: false,
    hostLiveAcceptance: 'UNVERIFIED' };
  if (!store.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_tasks'"
  ).get()) return { ...base, status: 'EMPTY', tasks: [], unreadableCount: 0,
    nextOffset: null, nextPageCommand: null };
  // The Task's contract kind is in its immutable Plan artifact, not SQL.
  // Scan at most 20 Tasks per page; filtered pages may have nextOffset.
  const rows = store.db.prepare(
    'SELECT id,body FROM product_tasks ORDER BY rowid DESC LIMIT 21 OFFSET ?'
  ).all(offset);
  const tasks = [];
  let unreadableCount = 0;
  for (const row of rows.slice(0, 20)) {
    try {
      const current = JSON.parse(row.body);
      if (!current || current.id !== row.id || !current.planRef)
        throw Error('Task identity or Plan reference invalid');
      const plan = store.readArtifact(current.planRef);
      if (plan?.contractKind !== 'NEW_PROJECT') continue;
      if (!current.bootstrap) {
        tasks.push({ taskId: row.id, status: 'PREPARATION_REQUIRED',
          revision: current.revision, localComplete: false,
          objectiveComplete: false, progressCommand: null,
          executionGranted: false, automaticReplay: false });
        continue;
      }
      // Reuse existing drift-sensitive TaskReport; never infer independent
      // Objective acceptance from a completed Local Bootstrap.
      const progress = await taskReport(store, row.id);
      if (progress.contractKind !== 'NEW_PROJECT' || !progress.bootstrap)
        throw Error('Prepared NEW_PROJECT Task report unavailable');
      tasks.push({ taskId: row.id, status: progress.continuation?.status ?? 'BLOCKED',
        revision: progress.revision, localComplete: progress.acceptance?.complete === true,
        objectiveComplete: false,
        progressCommand: { argv: ['codex-bootstrap-progress', row.id],
          readOnly: true, executionGranted: false, automaticReplay: false },
        executionGranted: false, automaticReplay: false });
    } catch {
      unreadableCount++;
      tasks.push({ taskId: row.id, status: 'BLOCKED',
        reason: 'PERSISTED_TASK_UNREADABLE', localComplete: false,
        objectiveComplete: false, progressCommand: null,
        executionGranted: false, automaticReplay: false });
    }
  }
  // A page can contain only unrelated Tasks while older Bootstrap records
  // remain. Return an explicit continuation instead of a false EMPTY result.
  const nextOffset = rows.length > 20 ? offset + 20 : null;
  const nextPageCommand = nextOffset !== null && nextOffset <= 999999
    ? { argv: ['codex-bootstraps', '--offset', String(nextOffset)],
        readOnly: true, executionGranted: false, automaticReplay: false }
    : null;
  return { ...base, status: unreadableCount ? 'PARTIAL_BLOCKED'
    : tasks.length ? 'AVAILABLE' : nextOffset !== null ? 'MORE_PAGES' : 'EMPTY',
    tasks, unreadableCount, nextOffset, nextPageCommand };
}
