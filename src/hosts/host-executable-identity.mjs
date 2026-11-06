// Pre/post Host executable identity checks. Not an OS confinement guarantee
// or an atomic defense against filesystem races.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export async function snapshotHostExecutable(executable) {
  if (!isAbsolute(executable ?? '')) throw Error('Absolute Host executable required');
  const resolvedPath = await realpath(executable);
  if (!(await stat(resolvedPath)).isFile())
    throw Error('Host executable must resolve to a regular file');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(resolvedPath)) digest.update(chunk);
  return Object.freeze({resolvedPath,sha256:digest.digest('hex')});
}

export async function requireSameHostExecutable(executable, approved, reason) {
  const observed = await snapshotHostExecutable(executable);
  if (observed.resolvedPath !== approved?.resolvedPath ||
      observed.sha256 !== approved?.sha256)
    throw Error(reason ?? 'Host executable identity changed');
  return observed.resolvedPath;
}
