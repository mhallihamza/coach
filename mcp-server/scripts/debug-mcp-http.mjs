const BASE = 'http://localhost:8310/mcp';
const res = await fetch(BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
});
console.log('status:', res.status, '| content-type:', res.headers.get('content-type'));
const text = await res.text();
console.log('length:', text.length);
console.log(text.slice(0, 600));
