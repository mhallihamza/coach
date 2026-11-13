#!/usr/bin/env node
// Coach MCP over HTTP — StreamableHTTP transport (stateless, JSON responses).
// Same 38 tools as stdio + orchestration delegate_to_* tools.
// Usage: node src/http.js            → http://localhost:8310/mcp
//        npx ngrok http 8310         → public HTTPS URL for Langflow/MCP clients
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools as accountCvTools } from './tools-account-cv.js';
import { tools as coachingTools } from './tools-coaching.js';
import { tools as memoryBooksTools } from './tools-memory-books.js';
import { tools as orchestrationTools } from './orchestration.js';
import { connect } from './db.js';

const allTools = [...accountCvTools, ...coachingTools, ...memoryBooksTools, ...orchestrationTools];
const byName = new Map(allTools.map(t => [t.name, t]));

const PORT = Number(process.env.MCP_HTTP_PORT || 8310);

function buildServer() {
  const server = new Server(
    { name: 'coach-mcp', version: '1.1.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params?.name);
    if (!tool) {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Outil inconnu: ${request.params?.name}` }) }], isError: true };
    }
    return tool.handler(request.params?.arguments ?? {});
  });
  return server;
}

await connect(); // warm Mongo once at boot
console.log(`[coach-mcp http] listening on http://localhost:${PORT}/mcp (stateless, JSON, transport-per-request)`);

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/mcp') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'coach-mcp', tools: allTools.length, mcp: '/mcp' }));
    return;
  }
  if (req.method === 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Stateless mode: GET SSE not available. Use POST /mcp.' }));
    return;
  }
  // Stateless: a fresh server + transport per request (SDK pattern).
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 5_000_000) { req.destroy(); } });
  req.on('end', async () => {
    let parsed;
    try { parsed = body ? JSON.parse(body) : undefined; } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Body is not valid JSON' }));
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = buildServer();
    try {
      await server.connect(transport);
      res.on('finish', () => { transport.close(); server.close(); });
      await transport.handleRequest(req, res, parsed);
    } catch (err) {
      console.error('[http] THREW:', err?.stack || err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Internal MCP error', detail: String(err?.message || err) }));
      }
    }
  });
});

httpServer.listen(PORT);
process.on('SIGINT', () => { httpServer.close(); process.exit(0); });
process.on('SIGTERM', () => { httpServer.close(); process.exit(0); });
