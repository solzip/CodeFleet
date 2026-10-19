import { command, environment } from '../alpha/process.mjs';
import { hash } from '../alpha/contract.mjs';

export const CAPABILITIES = Object.freeze(['non_interactive_execution', 'structured_output', 'proposal_only', 'session_support', 'streaming_output', 'cancellation', 'usage_reporting', 'approval_integration', 'filesystem_restriction', 'network_restriction']);
const options = {
  claude: { non_interactive_execution: '--print', structured_output: '--json-schema', proposal_only: '--tools', session_support: '--resume', streaming_output: '--output-format', approval_integration: '--permission-mode' },
  codex: { non_interactive_execution: 'Usage: codex exec', structured_output: '--output-schema', session_support: 'resume', streaming_output: '--json', filesystem_restriction: '--sandbox' }
};

// Read-only local probe. Help proves option advertisement, never enforcement.
export async function probeProvider(id, { executable = process.platform === 'win32' ? `${id}.exe` : id, runCommand = command } = {}) {
  if (!options[id]) throw Error('Unknown provider');
  const invoke = async args => {
    try { return await runCommand(executable, args, { env: environment(), timeoutMs: 10000, cap: 256000 }); }
    catch (e) { return { exitCode: null, error: e.message, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; }
  };
  const version = await invoke(['--version']);
  const help = await invoke(id === 'codex' ? ['exec', '--help'] : ['--help']);
  const ok = r => r.exitCode === 0 && !r.interrupted && !r.truncated && !r.error;
  const installed = ok(version) && ok(help);
  const text = help.stdout.toString('utf8');
  const identity = { id, version: ok(version) ? version.stdout.toString('utf8').trim() : null, platform: process.platform, executable };
  const capabilities = Object.fromEntries(CAPABILITIES.map(name => [name, {
    status: !installed ? 'UNAVAILABLE' : 'UNVERIFIED',
    advertised: Boolean(options[id][name] && text.includes(options[id][name])),
    evidence: 'Local version/help probe only; no live enforcement test'
  }]));
  return { identity, installed, observedAt: new Date().toISOString(), capabilities,
    environment: { filesystem_restriction: { status: 'UNVERIFIED' }, network_restriction: { status: 'UNVERIFIED' }, credential_isolation: { status: 'UNVERIFIED' } },
    diagnostics: { versionExit: version.exitCode, helpExit: help.exitCode, helpHash: hash(text), helpBytes: Buffer.byteLength(text) },
    liveValidation: 'NOT_RUN', executionBlocked: id === 'codex' ? 'No proven no-tool envelope' : null };
}
