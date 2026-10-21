import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const IPC_LIMIT = 65536;
export const HOST_METHODS = Object.freeze(['propose', 'plan', 'requests', 'submit', 'approval-request', 'execute', 'verify', 'status', 'result', 'cancel', 'pause', 'resume']);
export function envelope(method, params, requestId = randomUUID()) {
  if (!HOST_METHODS.includes(method) || !params || typeof params !== 'object' || Array.isArray(params) || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) throw Error('Invalid Host IPC request');
  const message = { version: 1, requestId, method, params };
  if (Buffer.byteLength(JSON.stringify(message) + '\n') > IPC_LIMIT) throw Error('Host IPC message too large');
  return message;
}
export async function hostRequest(socket, method, params, requestId) {
  if (process.platform !== 'linux' || !socket?.startsWith('/')) throw Error('Linux Unix IPC required; Host capability unavailable');
  const message = envelope(method, params, requestId);
  return new Promise((resolve, reject) => {
    const connection = net.createConnection(socket); let bytes = Buffer.alloc(0);
    const timer = setTimeout(() => { connection.destroy(); reject(Error('IPC deadline; outcome unknown, reuse request ID or query status')); }, 10000);
    connection.on('connect', () => connection.write(JSON.stringify(message) + '\n'));
    connection.on('error', reject);
    connection.on('close', () => { clearTimeout(timer); if (!bytes.includes(10)) reject(Error('Incomplete IPC response; outcome unknown')); });
    connection.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 262144) { connection.destroy(); reject(Error('IPC response too large')); return; }
      if (!bytes.includes(10)) return;
      connection.destroy();
      try { const result = JSON.parse(bytes.toString('utf8')); if (result.requestId !== message.requestId) throw Error('IPC response binding mismatch'); resolve(result); } catch (e) { reject(e); }
    });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [socket, method, params, id, ...extra] = process.argv.slice(2);
    if (extra.length || !id) throw Error('Usage: ipc-client.mjs SOCKET METHOD PARAMS_JSON REQUEST_ID (retain ID on timeout)');
    const result = await hostRequest(socket, method, JSON.parse(params), id);
    console.log(JSON.stringify(result)); process.exitCode = result.status === 'OK' ? 0 : 2;
  } catch (e) { console.log(JSON.stringify({ status: 'BLOCKED', reason: e.message })); process.exitCode = 2; }
}
