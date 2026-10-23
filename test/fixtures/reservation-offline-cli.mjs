// Test-only process driver for reservation mechanics, NOT an Operator runtime.
// No production guard is mocked/disabled. Public CLI denial is tested separately.
import { readFile } from 'node:fs/promises';
import { Store } from '../../src/alpha/store.mjs';
import { enableTasks } from '../../src/product/tasks.mjs';
import { taskReport } from '../../src/product/report.mjs';
import { issueOfflineDecision as issueDecision, executeOfflineDecision as executeDecision, revokeDecision, reservationStatus } from '../../src/product/reservations.mjs';
const [stateFlag, state, namespace, action, ...args] = process.argv.slice(2);
if (stateFlag !== '--state' || namespace !== 'objective') throw Error('Offline fixture arguments required');
const store = new Store(state); enableTasks(store);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
try {
  let result;
  if (action === 'authorize-local') result = await issueDecision(store, args[0], args[1], await json(args[2]), await json(args[3]));
  else if (action === 'reservation') result = reservationStatus(store, args[0], args[1]);
  else if (action === 'revoke-local') result = revokeDecision(store, args[0], args[2]);
  else if (action === 'verify') {
    const verificationRun = await executeDecision(store, args[0], args[1], await json(args[2]), { decisionId: args[4], requestId: args[6] });
    result = { ...await taskReport(store, args[0]), verificationRun };
    process.exitCode = verificationRun.status === 'LOCAL_PASSED' ? 0 : 2;
  } else throw Error('Unsupported offline fixture command');
  console.log(JSON.stringify(result));
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { store.close(); }
