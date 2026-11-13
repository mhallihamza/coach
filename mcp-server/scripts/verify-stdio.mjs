// Vérifie que le serveur parle MCP sur stdio : initialize → tools/list → tools/call health_check.
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['src/index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = '';
const responses = [];
child.stdout.on('data', (d) => {
  buffer += d.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    const t = line.trim();
    if (t) { try { responses.push(JSON.parse(t)); } catch {} }
  }
});

const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
const waitFor = (id, timeout = 15000) => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    const r = responses.find(r => r.id === id);
    if (r) return resolve(r);
    if (Date.now() - start > timeout) return reject(new Error('timeout id=' + id));
    setTimeout(check, 100);
  };
  check();
});

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1.0.0' } } });
const init = await waitFor(1);
console.log('initialize →', init.result?.serverInfo?.name, init.result?.serverInfo?.version);

send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
const list = await waitFor(2);
console.log('tools/list → count =', list.result?.tools?.length);
console.log('premiers outils:', list.result?.tools?.slice(0, 8).map(t => t.name).join(', '));

send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'health_check', arguments: {} } });
const call = await waitFor(3);
const counts = JSON.parse(call.result?.content?.[0]?.text ?? '{}');
console.log('tools/call health_check → ok =', counts.ok, '| books =', counts?.counts?.books, '| memories =', counts?.counts?.memories);

child.kill();
process.exit(0);
