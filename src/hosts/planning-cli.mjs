// Installation/diagnostic entry only. No model launcher, IPC or execution path.
import { installHost, manageHost } from './install.mjs';
import { PLANNING_PROFILE, requirePlanningLive } from './planning.mjs';
const [action, host, project, ...extra] = process.argv.slice(2);
try {
  if (extra.length) throw Error('Unexpected arguments');
  let result;
  if (action === 'profile' && !host) result = { profile: PLANNING_PROFILE, live: 'BLOCKED' };
  else if (action === 'live') requirePlanningLive();
  else {
    if (!project || !['install', 'status', 'disable', 'enable', 'remove'].includes(action)) throw Error('Usage: planning-cli.mjs install|status|disable|enable|remove codex|claude PROJECT; profile');
    result = action === 'install' ? await installHost(project, host, { planning: true }) :
      await manageHost(project, host, action, { planning: true });
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ status: 'BLOCKED', error: error.message }));
  process.exitCode = 2;
}
