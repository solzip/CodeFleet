import { spawn } from 'node:child_process';

export function environment(kind = 'local') {
  const names = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'PATHEXT'];
  // Only the provider receives its own authentication variables. Never forward
  // GitHub, cloud, database, or arbitrary parent variables to the provider.
  if (kind === 'provider') names.push('ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN');
  if (kind === 'delivery') names.push('GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST');
  if (kind === 'docker') names.push('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH');
  const env = Object.fromEntries(names.filter(n => process.env[n] !== undefined).map(n => [n, process.env[n]]));
  return { ...env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
}
export function command(executable, args, options = {}) {
  if (/\.(cmd|bat|ps1)$/i.test(executable)) throw Error('Alpha requires a native executable, not a shell wrapper');
  return new Promise(resolve => {
    let child;
    const out = [], err = [];
    let bytes = 0, interrupted = false, truncated = false, finished = false;
    const cap = options.cap ?? 2 * 1024 * 1024;
    let timer, poll;
    const stop = () => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
        killer.on('close', code => { if (code !== 0 && child.exitCode === null) child.kill(); });
      } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const finish = (exitCode, error) => {
      if (finished) return;
      finished = true; clearTimeout(timer); clearInterval(poll);
      resolve({ exitCode, stdout: Buffer.concat(out), stderr: Buffer.concat(err), interrupted, truncated, error: error?.message ?? null });
    };
    try {
      child = spawn(executable, args, { cwd: options.cwd, env: options.env ?? environment(), shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      const collect = (target, chunk) => {
        bytes += chunk.length;
        if (bytes > cap) { truncated = true; stop(); return; }
        target.push(chunk);
      };
      child.stdout.on('data', b => collect(out, b)); child.stderr.on('data', b => collect(err, b));
      child.on('error', e => finish(null, e)); child.on('close', code => finish(code));
      child.stdin.on('error', () => {}); child.stdin.end(options.input ?? '');
      timer = setTimeout(() => { interrupted = true; stop(); }, options.timeoutMs ?? 30000);
      if (options.cancelled) poll = setInterval(() => { if (options.cancelled()) { interrupted = true; stop(); } }, 250);
    } catch (error) { finish(null, error); }
  });
}
export function requireSuccess(result, label) {
  if (result.exitCode !== 0 || result.interrupted || result.truncated) throw Error(`${label} failed (${result.exitCode}): ${result.error ?? result.stderr.toString('utf8').slice(-3000)}`);
  return result.stdout.toString('utf8').trim();
}
