#!/usr/bin/env node
// Coach MCP — serveur MCP unique pour tous les agents Evolve AI.
// Transport : stdio (compatible Langflow 1.7). Base : MongoDB Atlas, DB "coach".
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools as accountCvTools } from './tools-account-cv.js';
import { tools as coachingTools } from './tools-coaching.js';
import { tools as memoryBooksTools } from './tools-memory-books.js';
import { tools as orchestrationTools } from './orchestration.js';
import { connect, close } from './db.js';

const allTools = [...accountCvTools, ...coachingTools, ...memoryBooksTools, ...orchestrationTools];
const byName = new Map(allTools.map(t => [t.name, t]));

const server = new Server(
  { name: 'coach-mcp', version: '1.0.0' },
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

process.on('SIGINT', async () => { await close(); process.exit(0); });
process.on('SIGTERM', async () => { await close(); process.exit(0); });
process.on('uncaughtException', (err) => { console.error('uncaughtException:', err); process.exit(1); });

try {
  await connect(); // vérifie la connexion + les index au démarrage
  console.error(`coach-mcp prêt — ${allTools.length} outils, DB "coach"`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (err) {
  console.error('Échec de démarrage coach-mcp:', err?.message || err);
  process.exit(1);
}
