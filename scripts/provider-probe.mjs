// Version/help only. Never performs authentication, model calls or tool probes.
import { probeProvider } from '../src/providers/capabilities.mjs';
const [id, executable] = process.argv.slice(2);
if (!['claude', 'codex'].includes(id)) throw Error('Usage: node scripts/provider-probe.mjs claude|codex [native-executable]');
console.log(JSON.stringify(await probeProvider(id, executable ? { executable } : {}), null, 2));
