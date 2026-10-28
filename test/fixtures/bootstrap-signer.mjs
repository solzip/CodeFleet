// Separate TEST Operator process. Fixed reviewed policy, never a Host/model API.
import { readFileSync } from 'node:fs';
import { sign } from 'node:crypto';
import { canonical, digest, fingerprint } from '../../src/hosts/operator.mjs';
const policy = JSON.parse(readFileSync(process.argv[2],'utf8'));
const { action, binding, kind = 'APPROVE', lifetimeMs = 90000 } = JSON.parse(readFileSync(0,'utf8'));
if (action.taskId !== policy.taskId || binding.runId !== policy.taskId || binding.actionDigest !== digest(action) ||
    action.repository.root !== policy.repository || action.budget.modelCalls !== 0 || action.budget.maxAttempts !== 2) throw Error('Outside reviewed fixture policy');
if (action.kind === 'VERIFY_WORKITEM') {
  if (action.command.executable !== process.execPath || canonical(action.command.args) !== canonical(['--test','--test-reporter=tap','test/todo.test.mjs']) || action.command.timeoutMs !== 10000) throw Error('Command not approved');
} else if (action.kind === 'REPAIR_FILESET') {
  if (action.manifest.files.length !== 1 || action.manifest.files[0].path !== 'src/todo.mjs' || action.manifest.files[0].sha256 !== policy.repairHash) throw Error('Repair not approved');
} else throw Error('Unknown action');
const decision = { id: action.requestId, kind, binding, principal: fingerprint(policy.publicKey), expiresAt: Date.now()+lifetimeMs, maxUses:1 };
console.log(JSON.stringify({ decision, signature: sign(null,Buffer.from(canonical(decision)),policy.privateKey).toString('hex') }));
