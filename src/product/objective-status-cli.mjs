#!/usr/bin/env node
// Read-only Objective projection. Unlike the legacy Workflow COMPLETED flag,
// this command requires delivered-tree criterion Evidence and reobserves target.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from '../alpha/store.mjs';
import { readDeliveredObjectiveStatus } from './objective-status.mjs';

export function objectiveStatusArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4 ||
      argv[0] !== '--state-dir' || argv[2] !== '--objective-id' ||
      !argv[1] || !argv[3] || argv[3].startsWith('-'))
    throw Error('Usage: node src/product/objective-status-cli.mjs --state-dir PATH --objective-id ID');
  return { stateDirectory: resolve(argv[1]), objectiveId: argv[3] };
}
export async function reportObjective(args, { open = dir => new Store(dir, { readOnly: true }),
  inspect = readDeliveredObjectiveStatus } = {}) {
  const { stateDirectory, objectiveId } = objectiveStatusArgs(args);
  const store = open(stateDirectory);
  try { return await inspect(store, objectiveId); }
  finally { store.close?.(); }
}
const direct = Boolean(process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href);
if (direct) {
  reportObjective(process.argv.slice(2)).then(report => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.objectiveComplete) process.exitCode = 2;
  }).catch(error => {
    process.stderr.write(JSON.stringify({status:'BLOCKED',
      objectiveComplete:false,reason:String(error.message)}) + '\n');
    process.exitCode = 1;
  });
}
