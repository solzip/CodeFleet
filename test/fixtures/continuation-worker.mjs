// Trusted fixture driver, never a public Operator/authentication entry point.
import { writeFile } from 'node:fs/promises';
import { Store } from '../../src/alpha/store.mjs';
import { enableTasks } from '../../src/product/tasks.mjs';
import { continuationSnapshot, continueOfflineWorkItem } from '../../src/product/continuation.mjs';
const input = JSON.parse(process.argv[2]);
const store = new Store(input.state); enableTasks(store);
try {
  const hooks = input.marker ? { reserved: async () => {
    await writeFile(input.marker, 'reserved');
    await new Promise(() => { setInterval(() => {}, 1000); });
  } } : {};
  const result = input.inspect ? await continuationSnapshot(store, input.taskId)
    : await continueOfflineWorkItem(store, input.taskId, { ...input, hooks });
  console.log(JSON.stringify(result));
} finally { store.close(); }
