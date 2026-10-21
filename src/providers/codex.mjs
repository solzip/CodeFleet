import { normalize, resultRecord, fail } from './interface.mjs';
import { probeProvider } from './capabilities.mjs';

export function parseCodex(stdout) {
  const events = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  let final = null, completed = false, usage = null;
  for (const event of events) {
    if (completed) throw Error('Events after turn completion');
    if (['turn.failed', 'error'].includes(event.type)) throw Object.assign(Error('Codex reported failure'), { code: 'PROVIDER_FAILED' });
    if (event.type === 'item.completed') {
      if (event.item?.type !== 'agent_message' || final !== null) throw Object.assign(Error('Tool/non-message or ambiguous Codex output refused'), { code: 'UNEXPECTED_EVENT' });
      final = event.item.text;
    } else if (event.type === 'turn.completed') { completed = true; usage = event.usage ?? null; }
    else if (!['thread.started', 'turn.started'].includes(event.type)) throw Object.assign(Error('Unsupported Codex event'), { code: 'UNEXPECTED_EVENT' });
  }
  if (!completed || typeof final !== 'string') throw Error('Missing completed turn or final structured output');
  return { proposal: JSON.parse(final), usage, cost: null, events };
}

export const normalizeCodex = (identity, result, request) => normalize(identity, result, request, parseCodex);

export function createCodexAdapter({ executable = process.platform === 'win32' ? 'codex.exe' : 'codex', runCommand } = {}) {
  const identity = { id: 'codex', version: null, platform: process.platform, executable };
  return {
    id: 'codex', probe: () => probeProvider('codex', { executable, runCommand }),
    async execute() {
      // Deliberately no launch path, even if a caller fabricates a capability
      // report. read-only sandbox still permits tools; prompt text is no guard.
      const result = fail(resultRecord(identity), 'CAPABILITY_UNVERIFIED', 'Codex PROPOSAL_ONLY tool/credential isolation is not proven; execution disabled');
      result.status = 'BLOCKED'; return result;
    }
  };
}
