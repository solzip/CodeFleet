import { installHost, manageHost } from '../src/hosts/install.mjs';
const [action, host, project, ...extra] = process.argv.slice(2);
try {
  if (!project || extra.length) throw Error('Usage: node scripts/host-install.mjs install|enable|disable|remove|status codex|claude PROJECT');
  console.log(JSON.stringify(action === 'install' ? await installHost(project, host) : await manageHost(project, host, action), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
