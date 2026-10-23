import { writeFile } from 'node:fs/promises';
import { Store } from '../../src/alpha/store.mjs';
import { enableTasks } from '../../src/product/tasks.mjs';
import { executeOfflineDecision as executeDecision } from '../../src/product/reservations.mjs';
const input = JSON.parse(process.argv[2]);
const store = new Store(input.state); enableTasks(store);
const hooks = input.stage ? { [input.stage]: async () => {
  await writeFile(input.marker, 'ready');
  await new Promise(() => { setInterval(() => {}, 1000); });
} } : {};
try { console.log(JSON.stringify(await executeDecision(store, input.taskId, 'tests', input.request, { ...input, hooks }))); }
finally { store.close(); }
