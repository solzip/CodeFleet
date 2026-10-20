// Actual local Codex skill loader probe. The RPC allowlist cannot start a turn.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { manageHost } from '../src/hosts/install.mjs';
import { environment } from '../src/alpha/process.mjs';

const [executable, preparationFile] = process.argv.slice(2);
if (!executable || !preparationFile || !path.isAbsolute(executable) || /\.(cmd|bat|ps1)$/i.test(executable)) throw Error('Native Codex executable and preparation.json required');
const preparation = JSON.parse(await readFile(preparationFile, 'utf8'));
const fixture = preparation.hosts.find(h => h.host === 'codex');
const configHome = path.join(preparation.root, 'codex-discovery-home'); await mkdir(configHome, { recursive: true });
const env = { ...environment(), CODEX_HOME: configHome, HOME: configHome, USERPROFILE: configHome, APPDATA: configHome, LOCALAPPDATA: configHome };
const child = spawn(executable, ['app-server', '--stdio'], { cwd: fixture.repo, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
let seq = 0, errorText = ''; const pending = new Map(), methods = [];
const lines = createInterface({ input: child.stdout });
child.stderr.on('data', b => { errorText = (errorText + b.toString()).slice(-16000); });
lines.on('line', line => {
  let message; try { message = JSON.parse(line); } catch { return; }
  if (!Object.hasOwn(message, 'id')) return;
  const waiter = pending.get(message.id); if (!waiter) return;
  pending.delete(message.id); clearTimeout(waiter.timer);
  message.error ? waiter.reject(Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
});
const rejectAll = error => { for (const w of pending.values()) { clearTimeout(w.timer); w.reject(error); } pending.clear(); };
child.on('error', rejectAll); child.on('exit', () => rejectAll(Error('Discovery server exited')));
function request(method, params) {
  if (!['initialize', 'skills/list'].includes(method)) throw Error('Model/session/config RPC forbidden');
  methods.push(method);
  return new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error('Discovery RPC timeout')); }, 20000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
}
const result = { host: 'codex', protocol: 'LOCAL_APP_SERVER', methods, modelTurnsRequested: 0, authenticationUsed: false, configScope: 'TEMPORARY_CLEAN_HOME', states: [] };
try {
  await request('initialize', { clientInfo: { name: 'codefleet_h1_discovery', version: '0.1.0' } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  for (const state of ['enabled', 'disabled', 'enabled-again']) {
    if (state === 'disabled') await manageHost(fixture.repo, 'codex', 'disable');
    if (state === 'enabled-again') await manageHost(fixture.repo, 'codex', 'enable');
    const listed = await request('skills/list', { cwds: [fixture.repo], forceReload: true });
    const entry = listed.data?.find(d => path.resolve(d.cwd) === path.resolve(fixture.repo));
    if (!entry) throw Error('Requested cwd missing from Host result');
    const found = entry.skills.filter(s => s.name === 'codefleet');
    const matched = found.filter(s => path.resolve(s.path) === path.join(fixture.skill, 'SKILL.md'));
    const expected = state === 'disabled' ? 0 : 1;
    if (matched.length !== expected || entry.errors?.length) throw Error('Host discovery does not match installed lifecycle state');
    result.states.push({ state, exactLocalSkillMatches: matched.length, enabled: matched[0]?.enabled ?? false, scope: matched[0]?.scope ?? null, errors: entry.errors?.length ?? 0 });
  }
  result.status = 'HOST_DISCOVERY_VERIFIED_NO_MODEL';
} catch (error) { result.status = 'BLOCKED'; result.reason = error.message; process.exitCode = 1; }
finally {
  // Restore only the fixture's owned skill and terminate only our local child.
  await manageHost(fixture.repo, 'codex', 'enable').catch(() => {});
  child.stdin.end();
  await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); setTimeout(() => { child.kill(); resolve(); }, 1500).unref(); });
  lines.close();
}
await writeFile(path.join(preparation.root, 'codex-discovery.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
