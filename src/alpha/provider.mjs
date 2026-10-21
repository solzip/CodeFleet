import { createClaudeAdapter } from '../providers/claude.mjs';
import { requireProposal } from '../providers/interface.mjs';
export { responseSchema } from '../providers/interface.mjs';
export { providerArgs } from '../providers/claude.mjs';

// Compatibility entrypoint: preserve the existing Alpha v1 Claude invocation.
// This is NOT strict capability routing or a claim of new live/OS certification.
// New routing consumers use proposeSelected and cannot opt into this exception.
const claude = createClaudeAdapter();
export async function propose(request) {
  return requireProposal(await claude.execute(request));
}
