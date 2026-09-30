// Loaded before test modules from a harness-owned, read-only mount.
// These common in-process bypasses are forbidden in this alpha profile.
// This is defense in depth, not an isolation boundary inside the JS runtime.
import assert from 'node:assert';
import strict from 'node:assert/strict';
import { syncBuiltinESMExports } from 'node:module';

for (const name of ['exit', 'reallyExit', 'abort']) {
  Object.defineProperty(process, name, {
    value: () => { throw new Error(`CodeFleet verification forbids process.${name}`); },
    writable: false, configurable: false
  });
}
const visited = new Set();
function freezeAssertions(value) {
  if (!value || !['object', 'function'].includes(typeof value) || visited.has(value)) return;
  visited.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, 'value')) freezeAssertions(descriptor.value);
  }
  Object.freeze(value);
}
freezeAssertions(assert); freezeAssertions(strict);
syncBuiltinESMExports();
