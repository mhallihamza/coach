const BASE = 'http://localhost:8310/mcp';

async function call(path, id, method, params, accept = 'application/json') {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const t = await res.text();
  console.log(`--- ${method} (Accept: ${accept}) status=${res.status} ct=${res.headers.get('content-type')} len=${t.length}`);
  console.log(t.slice(0, 300));
}

await call('init', 11, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dbg', version: '1.0' } });
await call('list', 12, 'tools/list', {});
await call('list-sse', 13, 'tools/list', {}, 'application/json, text/event-stream');
