// Vérifie le serveur MCP over HTTP : initialize → tools/list → tools/call list_agent_cards.
const BASE = process.env.MCP_URL || 'http://localhost:8310/mcp';

async function rpc(id, method, params) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data;
  } catch {
    // SSE: take the last data: line
    const lines = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
    return JSON.parse(lines[lines.length - 1]);
  }
}

const init = await rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'verify', version: '1.0.0' } });
console.log('initialize →', init.result?.serverInfo?.name, init.result?.serverInfo?.version);

const list = await rpc(2, 'tools/list', {});
console.log('tools/list →', list.result?.tools?.length, 'tools');
console.log(list.result?.tools?.slice(-10).map(t => t.name).join(', '));

const call = await rpc(3, 'tools/call', { name: 'list_agent_cards', arguments: {} });
const text = call.result?.content?.[0]?.text ?? '{}';
const parsed = JSON.parse(text);
console.log('list_agent_cards → ok:', parsed.ok, '| agents:', parsed.agents?.length);
console.log('agent names:', parsed.agents?.map(a => a.name).join(', '));
