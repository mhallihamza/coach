const BASE = 'https://7685-196-115-223-64.ngrok-free.app/mcp';
const res = await fetch(BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'ngrok-skip-browser-warning': 'true' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ngrok-verify', version: '1.0' } } }),
});
console.log('status:', res.status);
console.log((await res.text()).slice(0, 300));
